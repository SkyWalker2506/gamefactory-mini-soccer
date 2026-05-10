#!/usr/bin/env node
// Validate manifest.json + missing.json shape after build.
// Run via: npm run validate
import fs from 'node:fs';
import path from 'node:path';

const errors = [];
function err(msg) { errors.push(msg); }

function checkManifest() {
  const p = path.resolve('public/manifest.json');
  if (!fs.existsSync(p)) return err('public/manifest.json missing — run build-manifest first');
  let obj;
  try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return err(`manifest.json parse: ${e.message}`); }
  if (typeof obj !== 'object' || !Array.isArray(obj.items)) {
    return err('manifest.json: expected { items: [...] }');
  }
  for (const [i, item] of obj.items.entries()) {
    if (typeof item.name !== 'string') err(`manifest.items[${i}].name not string`);
    if (typeof item.file !== 'string') err(`manifest.items[${i}].file not string`);
    if (typeof item.src !== 'string') err(`manifest.items[${i}].src not string`);
    if (item.file && (item.file.includes('..') || item.file.includes('/'))) {
      err(`manifest.items[${i}].file unsafe: ${item.file}`);
    }
  }
}

function checkMissing() {
  // Optional in this template — only validate if present.
  const candidates = ['template/missing.json', 'public/missing.json'];
  for (const rel of candidates) {
    const p = path.resolve(rel);
    if (!fs.existsSync(p)) continue;
    let obj;
    try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { return err(`${rel} parse: ${e.message}`); }
    if (!Array.isArray(obj.items)) {
      err(`${rel}: expected { items: [...] }`); continue;
    }
    const ALLOWED_STATUS = ['todo','in-progress','waiting-for-review','approved','denied','blocked'];
    const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
    for (const [i, item] of obj.items.entries()) {
      if (!item.name || !NAME_RE.test(item.name)) err(`${rel} items[${i}].name invalid: ${item.name}`);
      if (item.status && !ALLOWED_STATUS.includes(item.status)) err(`${rel} items[${i}].status invalid: ${item.status}`);
      if (item.uploadedFile && (item.uploadedFile.includes('..') || item.uploadedFile.includes('/'))) {
        err(`${rel} items[${i}].uploadedFile unsafe: ${item.uploadedFile}`);
      }
    }
  }
}

function checkConfig() {
  const candidates = ['template/config.json', 'config.json'];
  for (const rel of candidates) {
    const p = path.resolve(rel);
    if (!fs.existsSync(p)) continue;
    let obj;
    try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { return err(`${rel} parse: ${e.message}`); }
    if (!Array.isArray(obj.sources)) err(`${rel}: sources must be array`);
    for (const [i, s] of (obj.sources || []).entries()) {
      if (typeof s.dir !== 'string' || !s.dir) err(`${rel} sources[${i}].dir missing`);
      if (s.dir && s.dir.includes('..')) err(`${rel} sources[${i}].dir unsafe: ${s.dir}`);
    }
  }
}

checkManifest();
checkMissing();
checkConfig();

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ manifest + missing + config valid');
