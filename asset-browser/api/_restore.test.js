import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import restoreHandler from './restore.js';

// Mock fs for readConfig and atomic write
mock.method(fs, 'existsSync', (p) => {
  if (p.endsWith('config.json')) return true;
  return true;
});

mock.method(fs, 'readFileSync', (p) => {
  if (p.endsWith('config.json')) {
    return JSON.stringify({
      github: { owner: 'test-owner', repo: 'test-repo' },
      uploadPath: 'asset-browser/data/uploads'
    });
  }
  if (p.endsWith('missing.json')) {
    return JSON.stringify({ items: [] });
  }
  return '{}';
});

mock.method(fs, 'writeFileSync', () => {});
mock.method(fs, 'openSync', () => 1);
mock.method(fs, 'fsyncSync', () => {});
mock.method(fs, 'closeSync', () => {});
mock.method(fs, 'renameSync', () => {});

function fakeRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(c) { statusCode = c; return this; },
    json(obj) { body = obj; return this; },
    get _statusCode() { return statusCode; },
    get _body() { return body; },
    setHeader() {}
  };
}

test('restore requires admin', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const req = {
    method: 'POST',
    url: '/api/restore',
    headers: {},
    body: { version: 1, missing: [] },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await restoreHandler(req, res);
  assert.equal(res._statusCode, 401);
});

test('restore validates format', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const req = {
    method: 'POST',
    url: '/api/restore',
    headers: { 'x-admin-token': 'test-token' },
    body: { version: 2, missing: [] },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await restoreHandler(req, res);
  assert.equal(res._statusCode, 400);
  assert.equal(res._body.error, 'invalid backup format');
});

test('restore dry-run by default', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const req = {
    method: 'POST',
    url: '/api/restore',
    headers: { 'x-admin-token': 'test-token' },
    body: { version: 1, missing: [{ name: 'new-miss' }] },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await restoreHandler(req, res);
  
  assert.equal(res._statusCode, 200);
  assert.ok(res._body.would_apply);
  assert.equal(res._body.would_apply.missing_to_add, 1);
});

test('restore confirm=1 writes file atomically', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const writeMock = mock.method(fs, 'writeFileSync', () => {});
  const renameMock = mock.method(fs, 'renameSync', () => {});

  const req = {
    method: 'POST',
    url: '/api/restore?confirm=1',
    headers: { 'x-admin-token': 'test-token' },
    body: { version: 1, missing: [{ name: 'new-miss' }] },
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = fakeRes();
  await restoreHandler(req, res);
  
  assert.equal(res._statusCode, 200);
  assert.ok(res._body.ok);
  assert.equal(res._body.applied.missing_to_add, 1);
  assert.ok(writeMock.mock.callCount() > 0);
  assert.ok(renameMock.mock.callCount() > 0);
});
