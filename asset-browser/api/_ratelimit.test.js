// Run with: node --test api/_ratelimit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  check,
  checkAsync,
  clientIp,
  policyFor,
  applyRateLimit,
  applyRateLimitAsync,
  _resetBuckets,
  _bucketCount,
  _setKvClient,
  _resetKvDetection,
} from './_ratelimit.js';

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

function fakeReq({ ip = '1.2.3.4', url = '/api/upload' } = {}) {
  return {
    url,
    headers: { 'x-forwarded-for': ip },
  };
}

test('policyFor returns custom or DEFAULT', () => {
  assert.equal(policyFor('upload').limit, 30);
  assert.equal(policyFor('asset-delete').limit, 10);
  assert.equal(policyFor('clear').limit, 10);
  assert.equal(policyFor('missing').limit, 240);
  assert.equal(policyFor('unknown-endpoint').limit, 120); // DEFAULT
});

test('clientIp prefers x-forwarded-for, falls back to x-real-ip then unknown', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 1.1.1.1' } }), '9.9.9.9');
  assert.equal(clientIp({ headers: { 'x-real-ip': '8.8.8.8' } }), '8.8.8.8');
  assert.equal(clientIp({ headers: {} }), 'unknown');
  assert.equal(clientIp({}), 'unknown');
});

test('check: bucket starts full and decrements', () => {
  _resetBuckets();
  const ip = '10.0.0.1';
  const r1 = check('upload', ip);
  assert.equal(r1.allowed, true);
  assert.equal(r1.limit, 30);
  assert.equal(r1.remaining, 29);
  const r2 = check('upload', ip);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 28);
});

test('check: enforces hard limit (asset-delete = 10/min)', () => {
  _resetBuckets();
  const ip = '10.0.0.2';
  for (let i = 0; i < 10; i++) {
    const r = check('asset-delete', ip);
    assert.equal(r.allowed, true, `req ${i + 1} should pass`);
  }
  const blocked = check('asset-delete', ip);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetMs > 0, 'resetMs should be positive');
});

test('check: refills proportionally to elapsed time', () => {
  _resetBuckets();
  const ip = '10.0.0.3';
  const t0 = 1_000_000;
  // Drain
  for (let i = 0; i < 10; i++) check('asset-delete', ip, t0);
  assert.equal(check('asset-delete', ip, t0).allowed, false);
  // Half a window passes → ~5 tokens back
  const halfWindow = t0 + 30_000;
  const r = check('asset-delete', ip, halfWindow);
  assert.equal(r.allowed, true);
  // After consuming one of the ~5 refilled tokens, ~4 remain
  assert.ok(r.remaining >= 3 && r.remaining <= 5, `remaining=${r.remaining}`);
});

test('check: per-IP isolation', () => {
  _resetBuckets();
  const a = '10.0.1.1', b = '10.0.1.2';
  for (let i = 0; i < 10; i++) check('asset-delete', a);
  assert.equal(check('asset-delete', a).allowed, false);
  // b is untouched
  assert.equal(check('asset-delete', b).allowed, true);
});

test('check: per-route isolation (same IP, two routes)', () => {
  _resetBuckets();
  const ip = '10.0.2.1';
  for (let i = 0; i < 10; i++) check('asset-delete', ip);
  assert.equal(check('asset-delete', ip).allowed, false);
  // upload bucket is independent
  assert.equal(check('upload', ip).allowed, true);
});

test('applyRateLimit: sets standard headers and 429 + Retry-After when blocked', () => {
  _resetBuckets();
  const req = fakeReq({ ip: '10.0.3.1' });
  const res = fakeRes();
  // 10 successful requests on asset-delete
  for (let i = 0; i < 10; i++) {
    const blocked = applyRateLimit(req, res, 'asset-delete');
    assert.equal(blocked, false);
  }
  assert.equal(res.headers['X-RateLimit-Limit'], '10');
  // 11th should block
  const res2 = fakeRes();
  const blocked = applyRateLimit(req, res2, 'asset-delete');
  assert.equal(blocked, true);
  assert.equal(res2._statusCode, 429);
  assert.ok(res2.headers['Retry-After'], 'Retry-After must be set');
  assert.equal(res2.headers['X-RateLimit-Remaining'], '0');
  assert.match(res2._body.error, /rate limit/i);
});

test('applyRateLimit: continues for unrelated IPs', () => {
  _resetBuckets();
  // Drain ip A
  const reqA = fakeReq({ ip: '10.0.4.1' });
  for (let i = 0; i < 10; i++) applyRateLimit(reqA, fakeRes(), 'asset-delete');
  const blockedA = applyRateLimit(reqA, fakeRes(), 'asset-delete');
  assert.equal(blockedA, true);
  // ip B is fine
  const reqB = fakeReq({ ip: '10.0.4.2' });
  const blockedB = applyRateLimit(reqB, fakeRes(), 'asset-delete');
  assert.equal(blockedB, false);
});

test('bucket map grows but stays bounded', () => {
  _resetBuckets();
  // Push a small batch of distinct IPs
  for (let i = 0; i < 50; i++) check('upload', `10.99.${i}.1`);
  assert.ok(_bucketCount() >= 50);
});

// --- Shared-store (Vercel KV / Upstash Redis) path. Mock client implements
// `incr` + `expire` to mirror the Upstash REST surface. We don't reach the
// network — the dependency stays optional.

function mockKv() {
  const store = new Map();
  const ttls = new Map();
  return {
    store,
    ttls,
    async incr(key) {
      const v = (store.get(key) || 0) + 1;
      store.set(key, v);
      return v;
    },
    async expire(key, ttlSec) {
      ttls.set(key, ttlSec);
      return 1;
    },
  };
}

test('checkAsync uses KV client when set; honors policy and increments', async () => {
  _resetBuckets();
  _resetKvDetection();
  const kv = mockKv();
  _setKvClient(kv);
  // 30/min on /upload — ten requests should pass and increment counter.
  for (let i = 0; i < 10; i++) {
    const r = await checkAsync('upload', '5.5.5.1');
    assert.equal(r.allowed, true);
    assert.equal(r.limit, 30);
  }
  // Counter increments under the right key shape: rl:upload:5.5.5.1:<windowStart>
  const keys = [...kv.store.keys()];
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^rl:upload:5\.5\.5\.1:\d+$/);
  assert.equal(kv.store.get(keys[0]), 10);
  // EXPIRE was set on first INCR.
  assert.equal([...kv.ttls.keys()].length, 1);
  _resetKvDetection();
});

test('checkAsync blocks when KV count exceeds policy limit', async () => {
  _resetBuckets();
  _resetKvDetection();
  const kv = mockKv();
  _setKvClient(kv);
  // /clear is 10/min. Drain it.
  for (let i = 0; i < 10; i++) {
    const r = await checkAsync('clear', '5.5.5.2');
    assert.equal(r.allowed, true);
  }
  // 11th must block.
  const blocked = await checkAsync('clear', '5.5.5.2');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetMs > 0);
  _resetKvDetection();
});

test('checkAsync falls back to in-memory when KV throws', async () => {
  _resetBuckets();
  _resetKvDetection();
  const kv = {
    async incr() { throw new Error('network blip'); },
    async expire() {},
  };
  _setKvClient(kv);
  // Should silently fall back to in-memory token bucket.
  const r = await checkAsync('upload', '5.5.5.3');
  assert.equal(r.allowed, true);
  assert.equal(r.limit, 30);
  // In-memory bucket got the request.
  assert.ok(_bucketCount() >= 1);
  _resetKvDetection();
});

test('applyRateLimitAsync writes headers and 429 from KV path', async () => {
  _resetBuckets();
  _resetKvDetection();
  const kv = mockKv();
  _setKvClient(kv);
  const req = fakeReq({ ip: '5.5.5.4', url: '/api/clear' });
  // First 10 OK
  for (let i = 0; i < 10; i++) {
    const res = fakeRes();
    const blocked = await applyRateLimitAsync(req, res, 'clear');
    assert.equal(blocked, false);
    assert.equal(res.headers['X-RateLimit-Limit'], '10');
  }
  // 11th blocked
  const res2 = fakeRes();
  const blocked = await applyRateLimitAsync(req, res2, 'clear');
  assert.equal(blocked, true);
  assert.equal(res2._statusCode, 429);
  assert.ok(res2.headers['Retry-After']);
  assert.match(res2._body.error, /rate limit/i);
  _resetKvDetection();
});
