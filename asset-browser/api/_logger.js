// api/_logger.js: Server-side logging and metrics collection.
import crypto from 'crypto';

let counters = new Map();
let since = new Date().toISOString();
let lastReset = Date.now();

export function log(level, event, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function incr(metric, by = 1) {
  checkReset();
  counters.set(metric, (counters.get(metric) || 0) + by);
}

export function metrics() {
  checkReset();
  return {
    counters: Object.fromEntries(counters),
    since,
    uptime_ms: process.uptime() * 1000
  };
}

function checkReset() {
  const now = Date.now();
  if (now - lastReset > 24 * 60 * 60 * 1000) {
    counters.clear();
    since = new Date().toISOString();
    lastReset = now;
  }
}

export function hashIp(ip) {
  if (!ip) return 'unknown';
  const now = new Date();
  const salt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).toString();
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 8);
}
