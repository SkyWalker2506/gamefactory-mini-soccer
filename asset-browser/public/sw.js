const CACHE_VERSION = 'ab-v1';
const SHELL = [
  '/',
  '/index.html',
  '/js/main.js',
  '/manifest.webmanifest',
  '/locales/tr.json',
  '/locales/en.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => {
        if (k !== CACHE_VERSION && k.startsWith('ab-')) return caches.delete(k);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) return;

  // API requests: Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.status === 200 && res.headers.get('Cache-Control') !== 'no-store') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets and Shell: Cache-first, then network (SWR for others)
  const isStatic = url.pathname.startsWith('/js/') || 
                   url.pathname.startsWith('/locales/') || 
                   url.pathname.startsWith('/icon-') ||
                   url.pathname === '/' ||
                   url.pathname === '/index.html';

  if (isStatic) {
    e.respondWith(
      caches.match(e.request).then(hit => {
        return hit || fetch(e.request).then(res => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
          }
          return res;
        });
      })
    );
  } else {
    // Default: stale-while-revalidate
    e.respondWith(
      caches.match(e.request).then(hit => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
          }
          return res;
        });
        return hit || fetchPromise;
      })
    );
  }
});
