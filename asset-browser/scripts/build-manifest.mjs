#!/usr/bin/env node
// Scans paths defined in config.json → writes public/manifest.json
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'config.json'), 'utf8'));
const PROJECT_ROOT = path.resolve(ROOT, CONFIG.projectRoot || '..');
const OUT_DIR = path.resolve(ROOT, 'public');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

function classify(name) {
  const n = name.toLowerCase();
  if (/character|miner|merchant|chicken|peasent|peasant|smith|child|woman|man|npc/.test(n)) return 'Character';
  if (/fire|smoke|dust|spark|particle|burst|glow|explosion|magic/.test(n)) return 'FX';
  if (/cart|wagon|cargo|vehicle|car|ship|boat/.test(n)) return 'Vehicle';
  if (/smelter|factory|mill|church|castle|tower|house|barn|tavern|building|market|bridge|shop/.test(n)) return 'Building';
  if (/tree|forest|cliff|mountain|stone|rock|plant/.test(n)) return 'Nature';
  if (/icon|ui|button|frame|panel|logo/.test(n)) return 'UI';
  if (/tile|ground|grass|water|road|path/.test(n)) return 'Tile';
  if (/loop|anim|cycle|_\d+f/i.test(n)) return 'Animation';
  return 'Other';
}

function getDim(file) {
  try {
    return execSync(`magick identify -format "%wx%h" ${JSON.stringify(file)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { return ''; }
}

const items = [];
for (const s of CONFIG.sources || []) {
  const abs = path.resolve(PROJECT_ROOT, s.dir);
  if (!fs.existsSync(abs)) { console.warn(`skip (missing): ${s.dir}`); continue; }
  const files = fs.readdirSync(abs).filter(f => /\.(png|webp|jpg|jpeg|gif)$/i.test(f));
  for (const f of files) {
    const full = path.join(abs, f);
    const st = fs.statSync(full);
    const base = path.basename(f, path.extname(f));
    const ext = path.extname(f).slice(1).toLowerCase();
    const isAnim = ext === 'gif' || /_\d+f\b/i.test(base) || /loop|anim|cycle|^slide-|^running-|^shoot-/i.test(base);
    const override = (CONFIG.overrides && CONFIG.overrides[base]) || null;
    const item = {
      id: `${s.tag}-${base}`,
      name: base, file: f, ext,
      src: `./assets/${s.tag}/${f}`,
      srcAbs: full,
      category: s.category,
      kind: isAnim ? 'Animation' : classify(base),
      type: isAnim ? 'Animasyon' : 'Resim',
      size: st.size,
      dim: getDim(full),
      mtime: st.mtime.toISOString(),
    };
    if (override) {
      if (override.frames) item.frames = override.frames;
      if (override.cols)   item.cols   = override.cols;
      if (override.rows)   item.rows   = override.rows;
      if (override.fps)    item.fps    = override.fps;
      if (override.tags)   item.tags   = override.tags;
    }
    items.push(item);
  }
}

items.sort((a, b) => a.name.localeCompare(b.name));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify({
  generated: new Date().toISOString(),
  title: CONFIG.title || 'Asset Browser',
  count: items.length,
  items,
}, null, 2));

console.log(`Manifest: ${items.length} items -> ${MANIFEST}`);
