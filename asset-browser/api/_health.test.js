import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import healthHandler from './health.js';
import { isKvDetected, POLICIES, _resetKvDetection } from './_ratelimit.js';

// Mock fs.existsSync and fs.readFileSync for readConfig
mock.method(fs, 'existsSync', (p) => p.endsWith('config.json') || fs.existsSync(p));
mock.method(fs, 'readFileSync', (p, opts) => {
  if (p.endsWith('config.json')) {
    return JSON.stringify({
      github: { owner: 'test-owner', repo: 'test-repo' },
      uploadPath: 'asset-browser/data/uploads'
    });
  }
  return fs.readFileSync(p, opts);
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

function fakeReq({ url = '/api/health', admin = false } = {}) {
  const headers = admin ? { 'x-admin-token': 'test-token' } : {};
  return {
    method: 'GET',
    url,
    headers,
    socket: { remoteAddress: '1.2.3.4' }
  };
}

test('isKvDetected returns false by default', () => {
  _resetKvDetection();
  assert.equal(isKvDetected(), false);
});

test('health policy exists in POLICIES', () => {
  assert.ok(POLICIES.health);
  assert.equal(POLICIES.health.limit, 60);
  assert.equal(POLICIES.health.windowMs, 60000);
});

test('health endpoint returns 200 with required fields', async (t) => {
  process.env.ADMIN_TOKEN = 'test-token';
  
  // Mock fsPromises.readFile to return fake manifest and missing.json
  const readFileMock = mock.method(fsPromises, 'readFile', async (path) => {
    if (path.endsWith('manifest.json')) {
      return JSON.stringify({ count: 10, items: new Array(10) });
    }
    if (path.endsWith('missing.json')) {
      return JSON.stringify({ items: [] });
    }
    throw new Error('File not found');
  });

  const req = fakeReq();
  const res = fakeRes();

  await healthHandler(req, res);

  assert.equal(res._statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  
  const body = res._body;
  assert.equal(body.status, 'ok');
  assert.ok(body.uptime_ms > 0);
  assert.equal(typeof body.node_version, 'string');
  assert.equal(body.commit_sha.length, 7);
  assert.ok(body.build_time);
  assert.equal(body.assets.total, 10);
  assert.equal(body.assets.missing_count, 0);
  assert.equal(body.rate_limiter.kv_detected, false);

  readFileMock.mock.restore();
});

test('health endpoint returns degraded if missing assets exist', async (t) => {
  const readFileMock = mock.method(fsPromises, 'readFile', async (path) => {
    if (path.endsWith('manifest.json')) {
      return JSON.stringify({ count: 10, items: new Array(10) });
    }
    if (path.endsWith('missing.json')) {
      return JSON.stringify({ items: [{ name: 'missing1' }] });
    }
    throw new Error('File not found');
  });

  const req = fakeReq();
  const res = fakeRes();

  await healthHandler(req, res);

  assert.equal(res._body.status, 'degraded');
  assert.equal(res._body.assets.missing_count, 1);

  readFileMock.mock.restore();
});

test('health endpoint returns details for admin', async (t) => {
  process.env.ADMIN_TOKEN = 'test-token';
  
  const readFileMock = mock.method(fsPromises, 'readFile', async (path) => {
    if (path.endsWith('manifest.json')) return JSON.stringify({ count: 0 });
    if (path.endsWith('missing.json')) return JSON.stringify({ items: [] });
    throw new Error('File not found');
  });

  const req = fakeReq({ url: '/api/health?detail=1', admin: true });
  const res = fakeRes();

  await healthHandler(req, res);

  assert.equal(res._statusCode, 200);
  assert.ok(res._body.details);
  assert.ok(Array.isArray(res._body.details.env_keys));
  assert.ok(res._body.details.policies);
  assert.ok(res._body.details.memory_usage);

  readFileMock.mock.restore();
});
