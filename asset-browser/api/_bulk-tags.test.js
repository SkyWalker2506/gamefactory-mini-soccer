import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bulkTagsJs = path.join(__dirname, '..', 'public', 'js', 'bulk-tags.js');

test('bulk-tags.js module exports and structure', () => {
  const src = fs.readFileSync(bulkTagsJs, 'utf8');
  assert.ok(src.includes('export async function openBulkTagEditor'), 'should export openBulkTagEditor');
  assert.ok(src.includes('aria-modal'), 'should have aria-modal for accessibility');
  assert.ok(src.includes('fetch(\'/api/bulk-tags\''), 'should call bulk-tags API');
});
