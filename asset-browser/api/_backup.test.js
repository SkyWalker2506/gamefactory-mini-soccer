import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import backupHandler from './backup.js';

// Mock fs for readConfig and directory walking
mock.method(fs, 'existsSync', (p) => {
  if (p.endsWith('config.json')) return true;
  if (p.endsWith('assets')) return true;
  return false;
});

mock.method(fs, 'readFileSync', (p) => {
  if (p.endsWith('config.json')) {
    return JSON.stringify({
      github: { owner: 'test-owner', repo: 'test-repo' },
      sources: [{ dir: 'assets' }],
      projectRoot: '.'
    });
  }
  if (p.endsWith('missing.json')) {
    return JSON.stringify({ items: [{ name: 'local-miss' }] });
  }
  return '';
});

mock.method(fs, 'statSync', (p) => {
  return {
    isDirectory: () => p.endsWith('assets'),
    isFile: () => p.endsWith('.png'),
    size: 100
  };
});

mock.method(fs, 'readdirSync', (p) => {
  if (p.endsWith('assets')) return ['item1.png'];
  return [];
});

// Mock fetch for GitHub API (gh helper)
mock.method(global, 'fetch', async (url) => {
  if (url.includes('missing.json')) {
    return {
      ok: true,
      json: async () => ({
        content: Buffer.from(JSON.stringify({ items: [{ name: 'gh-miss' }] })).toString('base64'),
        sha: 'sha123'
      })
    };
  }
  return { ok: false, status: 404, text: async () => 'Not found' };
});

function fakeRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    headers,
    setHeader(k, v) { headers[k] = String(v); },
    status(c) { statusCode = c; return this; },
    json(obj) { body = obj; return this; },
    get _statusCode() { return statusCode; },
    get _body() { return body; },
  };
}

test('backup rejects unauthorized', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const req = {
    method: 'GET',
    url: '/api/backup',
    headers: {},
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await backupHandler(req, res);
  assert.equal(res._statusCode, 401);
});

test('backup returns valid JSON for admin', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  process.env.GITHUB_TOKEN = 'fake-gh-token';
  const req = {
    method: 'GET',
    url: '/api/backup',
    headers: { 'x-admin-token': 'test-token' },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  
  await backupHandler(req, res);
  
  assert.equal(res._statusCode, 200);
  const body = res._body;
  assert.equal(body.version, 1);
  assert.equal(body.missing.length, 1);
  assert.equal(body.missing[0].name, 'gh-miss');
  assert.equal(body.assets.length, 1);
  assert.equal(body.assets[0].name, 'item1.png');
});

test('backup includes manifest info if present', async () => {
  // We need to restore fs mocks before re-mocking
  mock.restoreAll();
  
  // Re-mock everything for this specific test
  mock.method(fs, 'existsSync', (p) => p.includes('manifest.json') || p.endsWith('config.json'));
  mock.method(fs, 'readFileSync', (p) => {
    if (p.includes('manifest.json')) return JSON.stringify({ count: 42, updated: '2026-04-26' });
    if (p.endsWith('config.json')) return JSON.stringify({ github: { owner: 'o', repo: 'r' } });
    return '{}';
  });
  mock.method(global, 'fetch', async () => ({ ok: false, status: 404, text: async () => '' }));

  process.env.ADMIN_TOKEN = 'test-token';
  process.env.GITHUB_TOKEN = 'fake-gh-token';

  const req = {
    method: 'GET',
    url: '/api/backup',
    headers: { 'x-admin-token': 'test-token' },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await backupHandler(req, res);
  
  assert.equal(res._body.manifest_count, 42);
  assert.equal(res._body.manifest_updated, '2026-04-26');
});
