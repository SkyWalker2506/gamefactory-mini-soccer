import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');

test('A11y: skip link present', () => {
  assert.match(html, /href=["']#main-content["']/);
});

test('A11y: main landmark present', () => {
  assert.match(html, /id=["']main-content["']/);
  assert.match(html, /<main[\s>]/);
});

test('A11y: banner role on header', () => {
  assert.match(html, /role=["']banner["']/);
});

test('A11y: modal has dialog role', () => {
  assert.match(html, /id=["']modal["'][^>]*role=["']dialog["']|role=["']dialog["'][^>]*id=["']modal["']/);
});

test('A11y: help overlay has dialog role', () => {
  assert.match(html, /id=["']help-overlay["'][^>]*role=["']dialog["']|role=["']dialog["'][^>]*id=["']help-overlay["']/);
});

test('A11y: live region present', () => {
  assert.match(html, /id=["']sr-status["']/);
  assert.match(html, /role=["']status["']/);
  assert.match(html, /aria-live=["']polite["']/);
});

test('A11y: search input has aria-label', () => {
  assert.match(html, /<input[^>]+id=["']q["'][^>]*aria-label|<input[^>]+aria-label[^>]*id=["']q["']/);
});

test('A11y: sort select has aria-label', () => {
  assert.match(html, /<select[^>]+id=["']sort["'][^>]*aria-label|<select[^>]+aria-label[^>]*id=["']sort["']/);
});
