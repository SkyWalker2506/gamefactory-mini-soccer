// Run with: node --test api/_handler.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName,
  validateFilename,
  safePathSegment,
  base64ByteLength,
  parseBody,
  requireFields,
  getPaths,
} from './_handler.js';

test('validateName accepts kebab/snake', () => {
  assert.equal(validateName('hero-walk'), true);
  assert.equal(validateName('hero_idle_8f'), true);
  assert.equal(validateName('UPPER'), true);
  assert.equal(validateName('1leading'), true);
});

test('validateName rejects path/space/empty/long', () => {
  assert.equal(validateName(''), false);
  assert.equal(validateName('has space'), false);
  assert.equal(validateName('has/slash'), false);
  assert.equal(validateName('..'), false);
  assert.equal(validateName('.dot'), false);
  assert.equal(validateName('x'.repeat(101)), false);
  assert.equal(validateName(null), false);
  assert.equal(validateName(undefined), false);
});

test('validateFilename accepts simple png/webp', () => {
  assert.equal(validateFilename('hero.png'), true);
  assert.equal(validateFilename('Hero_v2.WebP'), true);
  assert.equal(validateFilename('plain'), true);
});

test('validateFilename rejects traversal + slashes + empty', () => {
  assert.equal(validateFilename('../etc/passwd'), false);
  assert.equal(validateFilename('..png'), false);
  assert.equal(validateFilename('x/y.png'), false);
  assert.equal(validateFilename('x\\y.png'), false);
  assert.equal(validateFilename(''), false);
  assert.equal(validateFilename('.hidden'), false);
  assert.equal(validateFilename('x'.repeat(201)), false);
  assert.equal(validateFilename(123), false);
});

test('safePathSegment honors valid + rejects bad', () => {
  assert.equal(safePathSegment('valid'), 'valid');
  assert.equal(safePathSegment('valid_dir-1'), 'valid_dir-1');
  assert.equal(safePathSegment(''), null);
  assert.equal(safePathSegment('../etc'), null);
  assert.equal(safePathSegment('a/b'), null);
  assert.equal(safePathSegment('.hidden'), null);
});

test('base64ByteLength approximates binary size', () => {
  assert.equal(base64ByteLength(''), 0);
  assert.equal(base64ByteLength('QQ=='), 1);
  assert.equal(base64ByteLength('QUI='), 2);
  assert.equal(base64ByteLength('QUJD'), 3);
  assert.equal(base64ByteLength('QUJDRA=='), 4);
  // With whitespace contamination
  assert.equal(base64ByteLength('QU\nJD '), 3);
});

test('parseBody handles object, json string, missing', () => {
  assert.deepEqual(parseBody({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(parseBody({ body: '{"a":1}' }), { a: 1 });
  assert.deepEqual(parseBody({ body: 'not json' }), {});
  assert.deepEqual(parseBody({}), {});
});

test('requireFields returns null when present, error string when missing', () => {
  assert.equal(requireFields({ a: 1, b: 2 }, ['a', 'b']), null);
  assert.equal(requireFields({ a: 1 }, ['a', 'b']), 'b required');
  assert.equal(requireFields({ a: 0, b: '' }, ['b']), 'b required');
  assert.equal(requireFields({}, ['x']), 'x required');
});

test('getPaths derives from uploadPath or default', () => {
  const p1 = getPaths({});
  assert.equal(p1.uploadPrefix, 'asset-browser/data/uploads');
  assert.equal(p1.dataDir, 'asset-browser/data');
  assert.equal(p1.missingJsonPath, 'asset-browser/data/missing.json');
  assert.equal(p1.trashDir, 'asset-browser/data/trash');

  const p2 = getPaths({ uploadPath: 'custom/data/uploads' });
  assert.equal(p2.dataDir, 'custom/data');
  assert.equal(p2.missingJsonPath, 'custom/data/missing.json');
  assert.equal(p2.trashDir, 'custom/data/trash');
});
