import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sweepExpiredTrash } from './_trash-util.js';

test('sweepExpiredTrash deletes >30d items', async () => {
  const t31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const t29 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
  
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, method: opts?.method || 'GET' });
    if (url.includes('/trash')) {
      if (opts?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) };
      // List (ends with /trash or /trash?ref=...)
      if (url.split('?')[0].endsWith('/trash')) return { ok: true, json: async () => [
        { name: 'old.meta.json', path: 'trash/old.meta.json' },
        { name: 'new.meta.json', path: 'trash/new.meta.json' }
      ]};
      // Get content
      if (url.includes('old.meta.json')) return { ok: true, json: async () => ({
        content: Buffer.from(JSON.stringify({ deletedAt: t31, originPath: 'assets/old.png' })).toString('base64'),
        sha: 's1', name: 'old.meta.json', path: 'trash/old.meta.json'
      })};
      if (url.includes('new.meta.json')) return { ok: true, json: async () => ({
        content: Buffer.from(JSON.stringify({ deletedAt: t29, originPath: 'assets/new.png' })).toString('base64'),
        sha: 's2', name: 'new.meta.json', path: 'trash/new.meta.json'
      })};
      if (url.includes('old.png')) return { ok: true, json: async () => ({ sha: 's3' }) };
    }
    return { ok: false, status: 404, text: async () => 'Not found' };
  };

  const result = await sweepExpiredTrash({
    token: 't', config: { github: { owner: 'o', repo: 'r' } }, branch: 'm',
    paths: { trashDir: 'trash' },
    maxAgeDays: 30
  });
  
  assert.equal(result.purged, 1);
  assert.equal(result.remaining, 1);
  
  const deleteCalls = fetchCalls.filter(c => c.method === 'DELETE');
  assert.ok(deleteCalls.some(c => c.url.includes('old.png')), 'Should delete old asset');
  assert.ok(deleteCalls.some(c => c.url.includes('old.meta.json')), 'Should delete old meta');

  globalThis.fetch = originalFetch;
});

test('sweepExpiredTrash dry-run does not delete', async () => {
  const t31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/trash')) {
      if (opts?.method === 'DELETE') throw new Error('Should not delete in dry run');
      if (url.split('?')[0].endsWith('/trash')) return { ok: true, json: async () => [{ name: 'old.meta.json', path: 'trash/old.meta.json' }] };
      if (url.includes('old.meta.json')) return { ok: true, json: async () => ({
        content: Buffer.from(JSON.stringify({ deletedAt: t31, originPath: 'assets/old.png' })).toString('base64'),
        sha: 's1'
      })};
    }
    return { ok: false, status: 404 };
  };

  const result = await sweepExpiredTrash({
    token: 't', config: { github: { owner: 'o', repo: 'r' } }, branch: 'm',
    paths: { trashDir: 'trash' },
    maxAgeDays: 30,
    dryRun: true
  });
  
  assert.equal(result.purged, 1);
  assert.equal(result.dryRun, true);
  globalThis.fetch = originalFetch;
});

test('sweepExpiredTrash honors maxAgeDays override', async () => {
  const t15 = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/trash')) {
      if (url.split('?')[0].endsWith('/trash')) return { ok: true, json: async () => [{ name: 'item.meta.json', path: 'trash/item.meta.json' }] };
      if (url.includes('item.meta.json')) return { ok: true, json: async () => ({
        content: Buffer.from(JSON.stringify({ deletedAt: t15, originPath: 'assets/item.png' })).toString('base64'),
        sha: 's1'
      })};
      if (opts?.method === 'DELETE') return { ok: true, json: async () => ({}) };
      if (url.includes('item.png')) return { ok: true, json: async () => ({ sha: 's3' }) };
    }
    return { ok: false, status: 404 };
  };

  // With 30 days, 15 days is NOT expired
  const r1 = await sweepExpiredTrash({
    token: 't', config: { github: { owner: 'o', repo: 'r' } }, branch: 'm',
    paths: { trashDir: 'trash' },
    maxAgeDays: 30
  });
  assert.equal(r1.purged, 0);

  // With 10 days, 15 days IS expired
  const r2 = await sweepExpiredTrash({
    token: 't', config: { github: { owner: 'o', repo: 'r' } }, branch: 'm',
    paths: { trashDir: 'trash' },
    maxAgeDays: 10
  });
  assert.equal(r2.purged, 1);
  
  globalThis.fetch = originalFetch;
});
