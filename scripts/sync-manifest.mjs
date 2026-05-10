#!/usr/bin/env node
// Bake the asset-browser manifest into the game's public/ so the live build
// reads frame overrides without depending on a running asset-browser server.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AB = path.join(ROOT, 'asset-browser');
const SRC = path.join(AB, 'public', 'manifest.json');
const DEST_DIR = path.join(ROOT, 'public');
const DEST = path.join(DEST_DIR, 'asset-manifest.json');

if (fs.existsSync(AB)) {
  try {
    execSync('node scripts/build-manifest.mjs', { cwd: AB, stdio: 'inherit' });
  } catch (e) {
    console.warn('asset-browser manifest build failed:', e.message);
  }
}

if (!fs.existsSync(SRC)) {
  console.warn('No asset-browser manifest at', SRC, '- skipping');
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log('Synced manifest →', DEST);
