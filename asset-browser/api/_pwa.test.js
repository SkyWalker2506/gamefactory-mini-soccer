// api/_pwa.test.js: PWA manifest and SW integrity tests.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import { join } from 'node:path';

test('manifest.webmanifest is valid and has required fields', async () => {
  const buf = await fs.readFile(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8');
  const m = JSON.parse(buf);
  
  assert.strictEqual(m.name, 'Asset Browser');
  assert.strictEqual(m.start_url, '/');
  assert.strictEqual(m.display, 'standalone');
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2, 'has icons');
  assert.strictEqual(m.theme_color, '#1a1510');
});

test('sw.js contains CACHE_VERSION and install listener', async () => {
  const sw = await fs.readFile(join(process.cwd(), 'public/sw.js'), 'utf8');
  assert.ok(sw.includes('const CACHE_VERSION = \'ab-v1\''), 'has CACHE_VERSION');
  assert.ok(sw.includes('self.addEventListener(\'install\''), 'has install listener');
  assert.ok(sw.includes('self.addEventListener(\'fetch\''), 'has fetch listener');
});

test('index.html has PWA meta tags', async () => {
  const html = await fs.readFile(join(process.cwd(), 'public/index.html'), 'utf8');
  assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'), 'has manifest link');
  assert.ok(html.includes('<meta name="theme-color" content="#1a1510">'), 'has theme-color');
  assert.ok(html.includes('<div id="offline-banner"'), 'has offline banner div');
});
