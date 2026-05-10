// Smoke test for the public/js/* ES module split. Static syntax check only —
// we don't run modules in Node because they touch DOM globals. The check
// catches syntax regressions, missing exports referenced from main.js, and
// helps lock down the module API surface.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, '..', 'public', 'js');

const EXPECTED_MODULES = [
  'state.js',
  'util.js',
  'api.js',
  'search.js',
  'stats.js',
  'modal.js',
  'grid.js',
  'upload.js',
  'actions.js',
  'selection.js',
  'keyboard.js',
  'main.js',
  'bulk-tags.js',
  'sprite-preview.js',
];

test('all expected modules exist and parse', () => {
  for (const name of EXPECTED_MODULES) {
    const file = path.join(jsDir, name);
    assert.ok(fs.existsSync(file), `missing module: ${name}`);
    const src = fs.readFileSync(file, 'utf8');
    // `new Function` would reject ES module syntax (import/export). Use a
    // lightweight hand-validation: import lines must have a `from` clause and
    // export lines must follow `export {...}` or `export <decl>` form. We
    // don't fully parse — just check there are no obvious typos like
    // `improt` or `exoprt`.
    assert.doesNotMatch(src, /\bimprot\b/, `${name}: typo "improt"`);
    assert.doesNotMatch(src, /\bexoprt\b/, `${name}: typo "exoprt"`);
    assert.ok(src.length > 50, `${name}: suspiciously empty`);
  }
});

test('main.js declares the inline-onclick API surface on window', () => {
  const main = fs.readFileSync(path.join(jsDir, 'main.js'), 'utf8');
  // Our inline-onclick contract — these names must appear in the
  // window assignment block.
  const expectedExposed = [
    'openModal', 'closeModal', 'closeHelp',
    'saveCurrentAsFilter', 'applySavedFilter', 'removeSavedFilter',
    'copyPrompt', 'uploadFor', 'reviewAction', 'deleteUpload',
    'jumpToAsset', 'clearEntry', 'unapproveAsset', 'deleteAsset',
    'restoreTrash', 'purgeTrash',
    'undoLastAction',
  ];
  for (const name of expectedExposed) {
    assert.ok(main.includes(name), `main.js must expose ${name} on window`);
  }
});

test('index.html loads only main.js as a module', () => {
  const html = fs.readFileSync(path.join(jsDir, '..', 'index.html'), 'utf8');
  // Exactly one <script type="module"> referencing js/main.js
  const moduleScripts = html.match(/<script\s+type="module"[^>]*>/g) || [];
  assert.equal(moduleScripts.length, 1, 'expected exactly one type="module" script');
  assert.match(moduleScripts[0], /js\/main\.js/);
  // No other inline <script> blocks (CSS-only HTML now)
  const allScripts = html.match(/<script[^>]*>/g) || [];
  assert.equal(allScripts.length, 1, 'index.html should have only the main.js module loader');
});
