#!/usr/bin/env node
// Dev server: static files from /public + API to persist overrides into config.json
// then auto-rebuild the manifest so changes are immediately reflected.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUBLIC = path.join(ROOT, 'public');
const CONFIG = path.join(ROOT, 'config.json');
const PORT = parseInt(process.env.PORT || '4567');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Permissive CORS so the game (vite on a different port) can fetch the manifest
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');

  // === API ===
  if (url.pathname === '/api/save-overrides' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { name, override } = JSON.parse(body);
      if (!name || typeof name !== 'string' || !/^[\w-]+$/.test(name)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid name' }));
      }
      const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
      cfg.overrides = cfg.overrides || {};
      if (override === null) {
        delete cfg.overrides[name];
      } else {
        cfg.overrides[name] = { ...(cfg.overrides[name] || {}), ...override };
      }
      fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
      // Rebuild manifest
      execSync('node scripts/build-manifest.mjs', { cwd: ROOT, stdio: 'inherit' });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, override: cfg.overrides[name] || null }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    const cfg = fs.readFileSync(CONFIG, 'utf8');
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(cfg);
  }

  // === Static ===
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  // Strip query strings and prevent traversal
  p = p.split('?')[0].replace(/\.\.+/g, '');
  const filePath = path.join(PUBLIC, p);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => console.log(`Asset browser dev server: http://localhost:${PORT}`));
