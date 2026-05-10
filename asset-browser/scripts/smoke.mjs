import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css'
};

async function serveFile(req, res) {
  let url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC_DIR, url);

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
}

const server = http.createServer(serveFile);

async function runTests(port) {
  const routes = [
    {
      path: '/',
      expectedStatus: 200,
      checks: [
        { type: 'contains', value: 'data-i18n="header.search_placeholder"' },
        { type: 'contains', value: 'id="grid"' },
        { type: 'contains', value: '<link rel="manifest"' },
        { type: 'contains', value: 'data-i18n="lang.tr"' }
      ]
    },
    {
      path: '/index.html',
      expectedStatus: 200,
      checks: [
        { type: 'contains', value: 'data-i18n="header.search_placeholder"' },
        { type: 'contains', value: 'id="grid"' },
        { type: 'contains', value: '<link rel="manifest"' },
        { type: 'contains', value: 'data-i18n="lang.tr"' }
      ]
    },
    {
      path: '/js/main.js',
      expectedStatus: 200,
      expectedContentType: /application\/javascript|text\/javascript/,
      checks: [
        { type: 'contains', value: 'import' }
      ]
    },
    {
      path: '/js/i18n.js',
      expectedStatus: 200,
      checks: [
        { type: 'contains', value: 'export function t' }
      ]
    },
    {
      path: '/js/pwa.js',
      expectedStatus: 200
    },
    {
      path: '/sw.js',
      expectedStatus: 200,
      checks: [
        { type: 'contains', value: 'CACHE_VERSION' }
      ]
    },
    {
      path: '/manifest.webmanifest',
      expectedStatus: 200,
      checks: [
        { type: 'json', keys: ['start_url', 'icons', 'display'] }
      ]
    },
    {
      path: '/locales/tr.json',
      expectedStatus: 200,
      checks: [{ type: 'json' }]
    },
    {
      path: '/locales/en.json',
      expectedStatus: 200,
      checks: [{ type: 'json' }]
    },
    {
      path: '/icon-192.svg',
      expectedStatus: 200,
      expectedContentType: 'image/svg+xml',
      checks: [
        { type: 'startsWith', value: '<svg' }
      ]
    },
    {
      path: '/icon-512.svg',
      expectedStatus: 200
    },
    {
      path: '/js/bulk-tags.js',
      expectedStatus: 200,
      checks: [{ type: 'contains', value: 'export' }]
    },
    {
      path: '/js/sprite-preview.js',
      expectedStatus: 200,
      checks: [{ type: 'contains', value: 'export' }]
    },
    {
      path: '/nonexistent-file',
      expectedStatus: 404
    }
  ];

  let passed = 0;
  const start = Date.now();

  for (const route of routes) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request(`http://localhost:${port}${route.path}`, (res) => {
          if (res.statusCode !== route.expectedStatus) {
            reject(new Error(`[${route.path}] Expected status ${route.expectedStatus}, got ${res.statusCode}`));
            return;
          }

          if (route.expectedContentType) {
            const contentType = res.headers['content-type'];
            const match = typeof route.expectedContentType === 'string' 
              ? contentType === route.expectedContentType
              : route.expectedContentType.test(contentType);
            if (!match) {
              reject(new Error(`[${route.path}] Expected content-type ${route.expectedContentType}, got ${contentType}`));
              return;
            }
          }

          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (route.checks) {
              for (const check of route.checks) {
                if (check.type === 'contains' && !body.includes(check.value)) {
                  reject(new Error(`[${route.path}] Body does not contain "${check.value}"`));
                  return;
                }
                if (check.type === 'startsWith' && !body.trim().startsWith(check.value)) {
                  reject(new Error(`[${route.path}] Body does not start with "${check.value}"`));
                  return;
                }
                if (check.type === 'json') {
                  try {
                    const data = JSON.parse(body);
                    if (check.keys) {
                      for (const key of check.keys) {
                        if (!(key in data)) {
                          reject(new Error(`[${route.path}] JSON missing key "${key}"`));
                          return;
                        }
                      }
                    }
                  } catch (e) {
                    reject(new Error(`[${route.path}] Invalid JSON: ${e.message}`));
                    return;
                  }
                }
              }
            }
            resolve();
          });
        });
        req.on('error', reject);
        req.end();
      });
      passed++;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const duration = Date.now() - start;
  console.log(`[smoke] ${passed}/${routes.length} routes OK in ${duration}ms`);
}

server.listen(0, async () => {
  const port = server.address().port;
  try {
    await runTests(port);
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    server.close();
    process.exit(1);
  }
});
