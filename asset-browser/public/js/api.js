// API layer: admin token storage + ETag-aware fetch helper.

// Admin token storage. sessionStorage is the default (D006); localStorage is
// opt-in via the "remember" prompt and persists across browser restarts.
export function getAdminToken() {
  return sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
}

export function setAdminToken(token, remember) {
  sessionStorage.setItem('adminToken', token);
  if (remember) localStorage.setItem('adminToken', token);
}

export function clearAdminToken() {
  sessionStorage.removeItem('adminToken');
  localStorage.removeItem('adminToken');
}

export function refreshAdminBadge() {
  const badge = document.getElementById('admin-badge');
  if (!badge) return;
  badge.classList.toggle('on', !!getAdminToken());
}

// Resilient JSON fetch with ETag cache + single retry on transient failures.
//   - GET: honors `If-None-Match` for free 304s; cached body returned on 304.
//   - POST: never cached, no If-None-Match.
//   - Network blip → one retry after 400 ms backoff.
//   - 5xx on GET → one retry on the original (uncached) request.
const _etagCache = new Map();

export async function fetchJson(url, opts = {}) {
  const cacheKey = opts.method || 'GET';
  const cached = _etagCache.get(`${cacheKey}:${url}`);
  const headers = { ...(opts.headers || {}) };
  if (cached?.etag && (!opts.method || opts.method === 'GET')) {
    headers['If-None-Match'] = cached.etag;
  }
  let r;
  try {
    r = await fetch(url, { ...opts, headers });
  } catch (e) {
    await new Promise(res => setTimeout(res, 400));
    r = await fetch(url, { ...opts, headers });
  }
  if (r.status === 304 && cached) return cached.value;
  if (r.status >= 500 && r.status < 600 && (!opts.method || opts.method === 'GET')) {
    await new Promise(res => setTimeout(res, 400));
    r = await fetch(url, { ...opts, headers: opts.headers });
  }
  let json;
  try { json = await r.json(); } catch { json = {}; }
  if (!r.ok) {
    const err = new Error(json.error || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const etag = r.headers.get('ETag');
  if (etag && (!opts.method || opts.method === 'GET')) {
    _etagCache.set(`${cacheKey}:${url}`, { etag, value: json });
  }
  return json;
}
