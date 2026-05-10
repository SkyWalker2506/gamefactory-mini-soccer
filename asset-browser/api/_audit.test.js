import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditLog, readAuditLog } from './_audit.js';
import auditHandler from './audit.js';

test('auditLog appends NDJSON line', async () => {
  const appendMock = mock.method(fs, 'appendFileSync', () => {});
  auditLog('test.action', { foo: 'bar', ip_hash: 'h123' });
  
  assert.equal(appendMock.mock.callCount(), 1);
  const line = appendMock.mock.calls[0].arguments[1];
  const entry = JSON.parse(line);
  assert.equal(entry.action, 'test.action');
  assert.equal(entry.foo, 'bar');
  assert.equal(entry.ip_hash, 'h123');
  appendMock.mock.restore();
});

test('readAuditLog parses last N', async () => {
  mock.method(fs, 'existsSync', (p) => p.endsWith('audit.log'));
  mock.method(fs, 'readFileSync', (p) => {
    if (p.endsWith('audit.log')) return '{"action":"a1"}\n{"action":"a2"}\n';
    return '';
  });
  
  const logs = readAuditLog({ limit: 1 });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'a2');
  mock.restoreAll();
});

test('readAuditLog since filter works', async () => {
  const t1 = new Date('2026-04-20').toISOString();
  const t2 = new Date('2026-04-26').toISOString();
  mock.method(fs, 'existsSync', (p) => p.endsWith('audit.log'));
  mock.method(fs, 'readFileSync', (p) => {
    if (p.endsWith('audit.log')) return `{"ts":"${t1}","action":"old"}\n{"ts":"${t2}","action":"new"}\n`;
    return '';
  });
  
  const logs = readAuditLog({ since: '2026-04-25' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'new');
  mock.restoreAll();
});

test('auditLog rotation triggers at >10MB', async () => {
  const renameMock = mock.method(fs, 'renameSync', () => {});
  mock.method(fs, 'existsSync', (p) => p.endsWith('audit.log'));
  mock.method(fs, 'statSync', (p) => ({ size: 11 * 1024 * 1024 }));
  mock.method(fs, 'appendFileSync', () => {});
  
  auditLog('test.rotate');
  assert.equal(renameMock.mock.callCount(), 1);
  mock.restoreAll();
});

test('audit.js endpoint requires admin', async () => {
  process.env.ADMIN_TOKEN = 'test-token';
  const req = {
    method: 'GET',
    url: '/api/audit',
    headers: {},
    socket: { remoteAddress: '1.2.3.4' }
  };
  const res = {
    statusCode: 200,
    status(s) { this.statusCode = s; return this; },
    json(j) { this.body = j; return this; },
    setHeader() {}
  };
  await auditHandler(req, res);
  assert.equal(res.statusCode, 401);
});
