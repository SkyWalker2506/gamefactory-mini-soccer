// Shared handler helpers — validation, body parsing, missing.json path, error wrapping.
// Reduces ~6 lines of boilerplate per endpoint and centralizes input validation.

import { readConfig, gh } from './_config.js';
import { applyRateLimit } from './_ratelimit.js';
import { log, incr, hashIp } from './_logger.js';

// Asset names: kebab/snake case, no path chars
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
// Filenames: alphanum + dot/underscore/dash, no slashes or `..`
const FILENAME_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/;
const MAX_FILENAME_LEN = 200;

export function validateName(s) {
  return typeof s === 'string' && NAME_RE.test(s);
}

export function validateFilename(s) {
  if (typeof s !== 'string' || s.length === 0 || s.length > MAX_FILENAME_LEN) return false;
  if (s.includes('..') || s.includes('/') || s.includes('\\')) return false;
  return FILENAME_RE.test(s);
}

// Reject path traversal in any "path-like" segment, even after sanitization.
export function safePathSegment(s) {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return null;
  if (trimmed.startsWith('.')) return null;
  return trimmed;
}

// Approximate binary size from base64 length. 4 base64 chars = 3 binary bytes.
export function base64ByteLength(b64) {
  if (typeof b64 !== 'string') return 0;
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = (clean.match(/=+$/) || [''])[0].length;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

export function getPaths(config) {
  const uploadPrefix = config.uploadPath || 'asset-browser/data/uploads';
  const dataDir = uploadPrefix.split('/').slice(0, -1).join('/') || 'asset-browser/data';
  return {
    uploadPrefix,
    dataDir,
    missingJsonPath: `${dataDir}/missing.json`,
    trashDir: `${dataDir}/trash`,
  };
}

export function isAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const h = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  let q = '';
  try { q = new URL(req.url, 'http://x').searchParams.get('admin') || ''; } catch {}
  return h === token || q === token;
}

// Derive the rate-limit key (route name) from the file path of the calling
// module, e.g. /api/upload.js → 'upload'. The handler() opts may override
// it explicitly via `rateLimitName`.
function deriveRouteName(req, override) {
  if (typeof override === 'string' && override) return override;
  try {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace(/^\/+|\/+$/g, '');
    // /api/foo → 'foo'; /api/foo/bar → 'foo' (treat the prefix as the route key)
    const parts = p.split('/').filter(Boolean);
    const idx = parts.indexOf('api');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return parts[parts.length - 1] || 'DEFAULT';
  } catch {
    return 'DEFAULT';
  }
}

// Wrap a handler: enforces method, ensures GITHUB_TOKEN, parses body, catches errors.
// opts: { method?: 'POST'|'GET', requireToken?: boolean (default true), rateLimitName?: string,
//         skipRateLimit?: boolean }
export function handler(opts, fn) {
  const { method: targetMethod, requireToken = true, rateLimitName, skipRateLimit = false } = opts || {};
  return async (req, res) => {
    const start = Date.now();
    const route = deriveRouteName(req, rateLimitName);
    const ip_hash = hashIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);

    // Patch res.end to log at the very end of any response
    const originalEnd = res.end;
    let logged = false;
    res.end = function(...args) {
      if (!logged) {
        logged = true;
        const duration_ms = Date.now() - start;
        const status = res.statusCode;
        log('info', 'api.request', { method: req.method, route, status, duration_ms, ip_hash });
        incr('requests_total');
        incr(`requests_by_route.${route}`);
      }
      return originalEnd.apply(this, args);
    };

    if (targetMethod && req.method !== targetMethod) {
      return res.status(405).json({ error: `${targetMethod} only` });
    }

    // Rate-limit before any work. Admin token bypasses the bucket but is logged.
    if (!skipRateLimit) {
      if (isAdmin(req)) {
        log('info', 'api.admin_bypass', { route, ip_hash });
      } else {
        if (applyRateLimit(req, res, route)) {
          log('warn', 'api.ratelimited', { route, ip_hash });
          incr('ratelimited_total');
          return; // 429 already sent
        }
      }
    }

    const token = process.env.GITHUB_TOKEN;
    if (requireToken && !token) {
      return res.status(500).json({ error: 'GITHUB_TOKEN env var not set' });
    }

    try {
      const config = readConfig();
      if (!config.github?.owner || !config.github?.repo) {
        return res.status(500).json({ error: 'config.github missing' });
      }
      const branch = config.github.branch || 'main';
      const body = parseBody(req);
      const paths = getPaths(config);
      return await fn({ req, res, token, config, branch, body, paths, gh, ip_hash });
    } catch (e) {
      const msg = String(e?.message || e || 'unknown');
      log('error', 'api.error', { error: msg, stack: e.stack?.slice(0, 500), route, ip_hash });
      incr('errors_total');
      // Avoid leaking GitHub API tokens or auth headers in error responses.
      const safe = msg.replace(/Bearer [A-Za-z0-9_\-.]+/g, 'Bearer ***');
      if (!res.writableEnded) {
        res.status(500).json({ error: safe });
      }
    }
  };
}

// Standard validation errors for missing.json item operations.
export function requireFields(body, required) {
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === '') {
      return `${k} required`;
    }
  }
  return null;
}
