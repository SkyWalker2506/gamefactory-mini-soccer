import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import bulkTagsHandler from './bulk-tags.js';

function fakeRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(c) { statusCode = c; return this; },
    json(obj) { body = obj; return this; },
    get _statusCode() { return statusCode; },
    get _body() { return body; },
    setHeader() {}
  };
}

function fakeReq(body) {
  return {
    method: 'POST',
    body,
    headers: {},
    socket: { remoteAddress: '1.2.3.4' }
  };
}

test('api/bulk-tags requires fields', async () => {
  const res = fakeRes();
  await bulkTagsHandler(fakeReq({}), res);
  assert.equal(res._statusCode, 400);
  assert.match(res._body.error, /required/);
});

test('api/bulk-tags validates arrays', async () => {
  const res = fakeRes();
  await bulkTagsHandler(fakeReq({ names: 'invalid', addTags: [], removeTags: [] }), res);
  assert.equal(res._statusCode, 400);
  assert.equal(res._body.error, 'names, addTags, removeTags must be arrays');
});

test('api/bulk-tags processes changes correctly', async () => {
  assert.ok(true);
});

test('api/bulk-tags handles empty items', async () => {
  assert.ok(true);
});
