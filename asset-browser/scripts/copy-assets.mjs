#!/usr/bin/env node
// Copy assets to public/, optionally produce AVIF variants alongside the source.
//
// AVIF is OPT-IN. Pass `--avif` (or set ASSET_AVIF=1) to enable. Requires the
// `sharp` package to be installable on the build host. We dynamic-import it
// only when the flag is set so the default zero-dep workflow is preserved.
//
// Pixel-art friendly settings (D012):
//   quality: 75, effort: 4, chromaSubsampling: '4:4:4'
// Rationale:
//   - 4:4:4 preserves hard edges (subsampling smears 1px boundaries on sprites).
//   - effort 4 is the libvips default — faster encode, ~5% larger than 6.
//   - quality 75 hits the WebP-parity sweet spot per AVIF/Sharp benchmarks.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(ROOT, 'public/assets');
const manifest = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'public/manifest.json'), 'utf8'));

const AVIF_FLAG = process.argv.includes('--avif') || process.env.ASSET_AVIF === '1';
let sharp = null;
if (AVIF_FLAG) {
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (e) {
    console.warn(`[copy-assets] --avif requested but \`sharp\` not installable: ${e.message}`);
    console.warn('[copy-assets] continuing without AVIF generation');
    sharp = null;
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const tags = new Map();
for (const item of manifest.items) {
  const tag = item.src.split('/')[2];
  if (!tags.has(tag)) {
    const d = path.join(OUT, tag);
    fs.mkdirSync(d, { recursive: true });
    tags.set(tag, d);
  }
  const dstPath = path.join(tags.get(tag), item.file);
  fs.copyFileSync(item.srcAbs, dstPath);

  // AVIF variant alongside (e.g. hero.webp → hero.webp.avif).
  // We append ".avif" rather than replacing the extension so the manifest
  // can carry one absolute reference per source. The client picks the
  // variant via <picture><source type="image/avif">.
  if (sharp && /\.(png|webp|jpe?g|gif)$/i.test(item.file)) {
    const avifDst = `${dstPath}.avif`;
    try {
      // animated GIFs: encode the first frame only (AVIF animation is buggy
      // in older browsers and our anim playback uses CSS sprite strips, not
      // multi-frame AVIF, so a static AVIF is fine for the still thumbnail).
      const pipeline = sharp(item.srcAbs, { animated: false })
        .avif({ quality: 75, effort: 4, chromaSubsampling: '4:4:4' });
      // Synchronous-ish: await each so we don't OOM on large catalogs.
      // eslint-disable-next-line no-await-in-loop
      await pipeline.toFile(avifDst);
      const before = fs.statSync(item.srcAbs).size;
      const after = fs.statSync(avifDst).size;
      item.avifSrc = `${item.src}.avif`;
      item.avifSize = after;
      // Skip if AVIF ended up bigger than the source (rare for tiny/icon pngs).
      if (after >= before) {
        fs.unlinkSync(avifDst);
        delete item.avifSrc;
        delete item.avifSize;
      }
    } catch (e) {
      console.warn(`[copy-assets] AVIF skip ${item.file}: ${e.message}`);
    }
  }
}
for (const item of manifest.items) delete item.srcAbs;

if (sharp) {
  const withAvif = manifest.items.filter(i => i.avifSrc).length;
  console.log(`[copy-assets] AVIF variants: ${withAvif}/${manifest.items.length}`);
}

fs.writeFileSync(path.resolve(ROOT, 'public/manifest.json'), JSON.stringify(manifest, null, 2));

// copy missing.json (items with prompts) into public/
const missingSrc = path.resolve(ROOT, 'data/missing.json');
if (fs.existsSync(missingSrc)) {
  fs.copyFileSync(missingSrc, path.resolve(ROOT, 'public/missing.json'));
}
// copy uploads/ if any
const uploadsDir = path.resolve(ROOT, 'data/uploads');
if (fs.existsSync(uploadsDir)) {
  const dst = path.resolve(ROOT, 'public/uploads');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(uploadsDir)) fs.copyFileSync(path.join(uploadsDir, f), path.join(dst, f));
}

// config.json for client to know github repo
fs.copyFileSync(path.resolve(ROOT, 'config.json'), path.resolve(ROOT, 'public/config.json'));

console.log(`Copied ${manifest.count} assets to ${OUT}`);
