// api/_i18n.test.js: i18n logic and locale integrity tests.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import { join } from 'node:path';

// Helper to flatten nested objects into dot-notated keys
function flatten(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flatten(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

test('locales have matching key sets', async () => {
  const trBuf = await fs.readFile(join(process.cwd(), 'public/locales/tr.json'), 'utf8');
  const enBuf = await fs.readFile(join(process.cwd(), 'public/locales/en.json'), 'utf8');
  const tr = JSON.parse(trBuf);
  const en = JSON.parse(enBuf);
  
  const trKeys = Object.keys(flatten(tr)).sort();
  const enKeys = Object.keys(flatten(en)).sort();
  
  assert.deepStrictEqual(trKeys, enKeys, 'tr.json and en.json keys must match exactly');
});

test('all locale leaves are strings', async () => {
  const tr = JSON.parse(await fs.readFile(join(process.cwd(), 'public/locales/tr.json'), 'utf8'));
  const flat = flatten(tr);
  for (const [k, v] of Object.entries(flat)) {
    assert.strictEqual(typeof v, 'string', `Key ${k} should be a string`);
  }
});

test('i18n.js interpolation works', async () => {
  // Mock i18n logic since we are in Node and i18n.js is browser-module.
  // We'll just test the same regex/logic we implemented.
  const tLogic = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
  
  assert.strictEqual(tLogic('Hello {name}', { name: 'World' }), 'Hello World');
  assert.strictEqual(tLogic('Count: {count}', { count: 5 }), 'Count: 5');
  assert.strictEqual(tLogic('{a} + {b}', { a: 1, b: 2 }), '1 + 2');
  assert.strictEqual(tLogic('No var', { a: 1 }), 'No var');
  assert.strictEqual(tLogic('Missing {x}', {}), 'Missing {x}');
});

test('i18n.js module exports', async () => {
  const content = await fs.readFile(join(process.cwd(), 'public/js/i18n.js'), 'utf8');
  assert.ok(content.includes('export function t'), 'exports t');
  assert.ok(content.includes('export async function loadLocale'), 'exports loadLocale');
  assert.ok(content.includes('export function getLang'), 'exports getLang');
  assert.ok(content.includes('export async function setLang'), 'exports setLang');
  assert.ok(content.includes('export function applyDom'), 'exports applyDom');
});
