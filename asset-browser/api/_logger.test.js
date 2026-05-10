// api/_logger.test.js: Logging and metrics tests.
import test from 'node:test';
import assert from 'node:assert';
import { log, incr, metrics, hashIp } from './_logger.js';

test('log() emits valid JSON to stdout', async () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };
  
  log('info', 'test.event', { foo: 'bar' });
  
  process.stdout.write = originalWrite;
  const entry = JSON.parse(output.trim());
  assert.strictEqual(entry.level, 'info');
  assert.strictEqual(entry.event, 'test.event');
  assert.strictEqual(entry.foo, 'bar');
  assert.ok(entry.ts);
});

test('incr() and metrics() work', () => {
  incr('test_metric');
  incr('test_metric', 2);
  const m = metrics();
  assert.strictEqual(m.counters.test_metric, 3);
  assert.ok(m.uptime_ms > 0);
  assert.ok(m.since);
});

test('hashIp returns stable 8-char hex', () => {
  const h1 = hashIp('127.0.0.1');
  const h2 = hashIp('127.0.0.1');
  const h3 = hashIp('192.168.1.1');
  
  assert.strictEqual(h1.length, 8);
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(h1, h3);
  assert.match(h1, /^[0-9a-f]{8}$/);
});

test('DAILY_SALT changes daily', () => {
  const now = new Date();
  const saltToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).toString();
  
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);
  const saltYesterday = Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()).toString();
  
  assert.notStrictEqual(saltToday, saltYesterday);
});
