import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadJs = path.join(__dirname, '..', 'public', 'js', 'upload.js');

test('upload.js supports folder drop and multi-file queue', () => {
  const src = fs.readFileSync(uploadJs, 'utf8');
  assert.ok(src.includes('webkitGetAsEntry'), 'should use webkitGetAsEntry for folders');
  assert.ok(src.includes('walk'), 'should have walk recursion');
  assert.ok(src.includes('image/avif'), 'should support image/avif');
  assert.ok(src.includes('upload_progress'), 'should show upload progress');
  assert.ok(src.includes('queue_skip'), 'should have skip & continue logic');
});
