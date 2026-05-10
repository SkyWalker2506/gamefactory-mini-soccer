// Per-IP token-bucket rate limiter for Vercel serverless functions.
//
// Two storage backends:
//   1. Process-local `Map<key,bucket>` — default. Each function instance has
//      its own Map. Limit is correct per-instance; effective rate scales with
//      concurrent warm instances. Acceptable for low-traffic admin tooling.
//   2. Optional shared store via Upstash Redis REST (`@upstash/redis`).
//      Detected by env: KV_REST_API_URL + KV_REST_API_TOKEN  (legacy Vercel KV
//      env names — preserved when stores were migrated to Upstash in
//      Dec 2024) OR UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
//
// The shared store uses a simple INCR + EXPIRE sliding-window counter (one
// counter per (route, ip, window) — much simpler than full sliding logs and
// good enough for IP rate limiting).
//
// Token bucket semantics for in-memory path:
//   - bucket.tokens starts at `limit` and refills at `limit / windowMs`.
//   - On each request: refill (lazy), then consume 1 token if available.
//   - Returns { allowed, remaining, resetMs, limit }.

const MAX_KEYS = 5000;
const SWEEP_INTERVAL_MS = 60_000;

// Default policies. Endpoints not listed inherit DEFAULT.
// Keyed by the trailing URL segment after `/api/` (e.g. /api/upload → 'upload').
export const POLICIES = {
  upload:         { limit: 30,  windowMs: 60_000 },
  'asset-delete': { limit: 10,  windowMs: 60_000 },
  clear:          { limit: 10,  windowMs: 60_000 },
  delete:         { limit: 30,  windowMs: 60_000 },
  'missing-patch':{ limit: 60,  windowMs: 60_000 },
  review:         { limit: 60,  windowMs: 60_000 },
  trash:          { limit: 30,  windowMs: 60_000 },
  health:         { limit: 60,  windowMs: 60_000 },
  // Read-only and frequently polled endpoints get a generous bucket.
  missing:        { limit: 240, windowMs: 60_000 },
  uploaded:       { limit: 240, windowMs: 60_000 },
  DEFAULT:        { limit: 120, windowMs: 60_000 },
};

const buckets = new Map();
let lastSweep = 0;

// `createRequire` lets us synchronously load the optional peer dep from an
// ESM module without dragging it into the dependency graph at parse time.
// If `@upstash/redis` is not installed the require throws, the catch runs,
// and we silently fall back to the in-memory bucket store.
import { createRequire } from 'node:module';
const requireOpt = createRequire(import.meta.url);

// --- Optional shared-store detection (D014). Returns null when no shared
// store is configured; the in-memory path is taken. The injected client is
// used by tests; production reads it from env on first call.
let _kvClient = null;
let _kvDetected = false;

export function _setKvClient(client) {
  _kvClient = client;
  _kvDetected = !!client;
}

export function _resetKvDetection() {
  _kvClient = null;
  _kvDetected = false;
}

export function isKvDetected() {
  return _kvDetected;
}

function detectSharedStore() {
  if (_kvDetected) return _kvClient;
  // Tests may pre-inject a client. Otherwise check env. We DO NOT require()
  // `@upstash/redis` here at module load — only when actually configured —
  // and even then the require is inside a try/catch so a missing peer dep
  // gracefully falls back to in-memory.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const mod = requireOpt('@upstash/redis');
    const Redis = mod.Redis || mod.default?.Redis;
    if (!Redis) return null;
    _kvClient = new Redis({ url, token });
    _kvDetected = true;
    return _kvClient;
  } catch {
    // Peer dep not installed — fall back silently. Documented in README.
    return null;
  }
}

export function policyFor(name) {
  return POLICIES[name] || POLICIES.DEFAULT;
}

// Resolve the client IP from the most-trusted-first header set. Vercel terminates
// TLS upstream, so `x-forwarded-for` / `x-real-ip` are populated. We pick the
// left-most address in `x-forwarded-for`.
export function clientIp(req) {
  const h = req?.headers || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (typeof xff === 'string' && xff.length) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const xri = h['x-real-ip'] || h['X-Real-IP'];
  if (typeof xri === 'string' && xri.length) return xri.trim();
  return req?.socket?.remoteAddress || 'unknown';
}

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.updated > b.windowMs * 2) buckets.delete(k);
  }
  if (buckets.size > MAX_KEYS) {
    const arr = Array.from(buckets.entries()).sort((a, b) => a[1].updated - b[1].updated);
    const drop = arr.slice(0, buckets.size - MAX_KEYS);
    for (const [k] of drop) buckets.delete(k);
  }
}

// In-memory token bucket (default path).
function checkInMemory(name, ip, now) {
  sweep(now);
  const policy = policyFor(name);
  const key = `${name}:${ip}`;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: policy.limit, updated: now, windowMs: policy.windowMs, limit: policy.limit };
    buckets.set(key, b);
  } else {
    const elapsed = now - b.updated;
    const refill = (elapsed / policy.windowMs) * policy.limit;
    b.tokens = Math.min(policy.limit, b.tokens + refill);
    b.updated = now;
    b.windowMs = policy.windowMs;
    b.limit = policy.limit;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(b.tokens),
      resetMs: Math.ceil(((policy.limit - b.tokens) / policy.limit) * policy.windowMs),
      limit: policy.limit,
    };
  }
  const need = 1 - b.tokens;
  const resetMs = Math.ceil((need / policy.limit) * policy.windowMs);
  return { allowed: false, remaining: 0, resetMs, limit: policy.limit };
}

// Shared-store sliding window: `INCR rl:{name}:{ip}:{bucketStart}`, EXPIRE on
// first write. Each window is a separate key so eviction is automatic.
async function checkShared(client, name, ip, now) {
  const policy = policyFor(name);
  const bucketStart = Math.floor(now / policy.windowMs) * policy.windowMs;
  const key = `rl:${name}:${ip}:${bucketStart}`;
  // INCR returns the new count. On the first INCR, set EXPIRE so the key
  // dies after windowMs * 2 (covers clock skew between windows).
  let count;
  try {
    count = await client.incr(key);
    if (count === 1) {
      // pexpire / expire — Upstash Redis supports both. expire(seconds).
      const ttlSec = Math.ceil((policy.windowMs * 2) / 1000);
      await client.expire(key, ttlSec);
    }
  } catch {
    // Network blip → fail open to in-memory (safer for legitimate users).
    return checkInMemory(name, ip, now);
  }
  const remaining = Math.max(0, policy.limit - count);
  const resetMs = (bucketStart + policy.windowMs) - now;
  if (count > policy.limit) {
    return { allowed: false, remaining: 0, resetMs, limit: policy.limit };
  }
  return { allowed: true, remaining, resetMs, limit: policy.limit };
}

// Pure synchronous check (no side-effects on the response). Used by the in-memory
// test suite. If a shared store is configured, callers should use `checkAsync`.
export function check(name, ip, now = Date.now()) {
  return checkInMemory(name, ip, now);
}

// Async-aware check. Picks the shared store if configured, falls back to
// in-memory otherwise.
export async function checkAsync(name, ip, now = Date.now()) {
  const client = detectSharedStore();
  if (client) return checkShared(client, name, ip, now);
  return checkInMemory(name, ip, now);
}

// Express/Vercel middleware. Sets standard headers, ends with 429 on overflow.
// Returns true if the request was rate-limited (caller should NOT continue).
//
// We always use the synchronous in-memory check at the middleware boundary
// because Vercel handlers must be ergonomic. Callers that want shared-store
// semantics can call `applyRateLimitAsync`.
export function applyRateLimit(req, res, name) {
  const ip = clientIp(req);
  const r = check(name, ip);
  return _writeHeaders(res, r);
}

export async function applyRateLimitAsync(req, res, name) {
  const ip = clientIp(req);
  const r = await checkAsync(name, ip);
  return _writeHeaders(res, r);
}

function _writeHeaders(res, r) {
  res.setHeader('X-RateLimit-Limit', String(r.limit));
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(r.resetMs / 1000)));
  if (!r.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(r.resetMs / 1000)));
    res.status(429).json({ error: 'rate limit exceeded', retryAfterMs: r.resetMs });
    return true;
  }
  return false;
}

// For tests: clear all buckets.
export function _resetBuckets() {
  buckets.clear();
  lastSweep = 0;
}

export function _bucketCount() { return buckets.size; }
