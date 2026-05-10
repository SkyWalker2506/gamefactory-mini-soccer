import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Security headers in vercel.json', () => {
  const vercelJson = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const headerEntry = vercelJson.headers.find(h => h.source === '/(.*)');
  
  assert.ok(headerEntry, 'Should have headers for /(.*)');
  
  const headers = headerEntry.headers;
  const getHeader = (key) => headers.find(h => h.key === key)?.value;

  assert.ok(getHeader('Strict-Transport-Security').includes('max-age=63072000'));
  assert.strictEqual(getHeader('X-Frame-Options'), 'DENY');
  assert.strictEqual(getHeader('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(getHeader('Referrer-Policy'), 'strict-origin-when-cross-origin');
  
  const csp = getHeader('Content-Security-Policy');
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'CSP should not have unsafe-inline in script-src');
});
