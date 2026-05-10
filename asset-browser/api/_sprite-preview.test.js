import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spritePreviewJs = path.join(__dirname, '..', 'public', 'js', 'sprite-preview.js');

test('sprite-preview.js module exports and structure', () => {
  const src = fs.readFileSync(spritePreviewJs, 'utf8');
  assert.ok(src.includes('export function attachSpritePreview'), 'should export attachSpritePreview');
  assert.ok(src.includes('requestAnimationFrame'), 'should use requestAnimationFrame for animation');
  assert.ok(src.includes('cancelAnimationFrame'), 'should use cancelAnimationFrame for cleanup');
  assert.ok(src.includes('prefers-reduced-motion'), 'should respect prefers-reduced-motion');
});
