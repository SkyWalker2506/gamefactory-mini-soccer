import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE = path.resolve(process.cwd(), 'audit.log');
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Appends an entry to the audit log.
 * @param {string} action 
 * @param {object} fields Should include ip_hash for better tracking.
 */
export function auditLog(action, fields = {}) {
  const { ip_hash, ...rest } = fields;
  const entry = {
    ts: new Date().toISOString(),
    action,
    ip_hash: ip_hash || 'unknown',
    ...rest
  };
  const line = JSON.stringify(entry) + '\n';
  
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_SIZE) {
        fs.renameSync(LOG_FILE, LOG_FILE + '.1');
      }
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Silent fail for audit log to not crash the main operation
    console.error('Audit log failed', e);
  }
}

/**
 * Reads the last N entries from the audit log.
 * @param {object} opts { limit, since }
 */
export function readAuditLog({ limit = 100, since } = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    let entries = content.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    
    if (since) {
      const sinceDate = new Date(since);
      entries = entries.filter(e => new Date(e.ts) >= sinceDate);
    }
    
    const max = Math.min(limit, 1000);
    return entries.slice(-max).reverse();
  } catch (e) {
    return [];
  }
}
