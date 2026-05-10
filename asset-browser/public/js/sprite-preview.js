import { t } from './i18n.js';
let rafId = null;
export function attachSpritePreview(box, asset) {
  const isSprite = asset.frames || asset.name.includes('_sheet') || (asset.cols && asset.rows);
  if (!isSprite) return null;
  let frames = [];
  if (asset.frames) frames = asset.frames;
  else if (asset.cols && asset.rows) {
    const [w, h] = (asset.dim || '0x0').split('x').map(Number), fw = w/asset.cols, fh = h/asset.rows;
    for (let r=0; r<asset.rows; r++) for (let c=0; c<asset.cols; c++) frames.push({x:c*fw, y:r*fh, w:fw, h:fh});
  } else {
    const [w, h] = (asset.dim || '0x0').split('x').map(Number);
    if (w > h && w % h === 0) for (let i=0; i<w/h; i++) frames.push({x:i*h, y:0, w:h, h:h});
  }
  if (!frames.length) return null;
  const c = document.createElement('div');
  c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;width:100%';
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  cv.style.cssText = 'background:#2a1f15;border:1px solid #5c4428;image-rendering:pixelated';
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t('sprite.preview_label'));
  const ctrl = document.createElement('div'); ctrl.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%';
  const btn = document.createElement('button'); btn.className = 'tab'; btn.textContent = '⏸';
  const s = document.createElement('input'); s.type = 'range'; s.min = '0'; s.max = (frames.length-1); s.value = '0'; s.style.flex = '1';
  const sel = document.createElement('select'); [5, 10, 15, 24].forEach(f => {
    const o = document.createElement('option'); o.value = f; o.textContent = f+' FPS'; if (f===10) o.selected = true; sel.appendChild(o);
  });
  ctrl.append(btn, s, sel); c.append(cv, ctrl);
  const p = box.querySelector('.preview'); if (p) { p.innerHTML = ''; p.appendChild(c); } else box.appendChild(c);
  const ctx = cv.getContext('2d'), img = new Image(); img.src = asset.src;
  let cur = 0, playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches, last = 0, fps = asset.fps || 10;
  // Pre-select the manifest fps in the dropdown if present
  if (asset.fps) {
    [...sel.options].forEach(o => { o.selected = (parseInt(o.value) === asset.fps); });
    if (![...sel.options].some(o => o.selected)) {
      const o = document.createElement('option'); o.value = asset.fps; o.textContent = asset.fps + ' FPS'; o.selected = true;
      sel.appendChild(o);
    }
  }
  if (!playing) btn.textContent = '▶';
  const draw = (ts) => {
    if (!last) last = ts;
    if (playing && ts - last > 1000/fps) { cur = (cur + 1) % frames.length; s.value = cur; last = ts; }
    ctx.clearRect(0, 0, 256, 256); const f = frames[cur];
    if (img.complete) {
      const sc = Math.min(256/f.w, 256/f.h), dx = (256-f.w*sc)/2, dy = (256-f.h*sc)/2;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w*sc, f.h*sc);
    }
    rafId = requestAnimationFrame(draw);
  };
  img.onload = () => rafId = requestAnimationFrame(draw);
  btn.onclick = () => { playing = !playing; btn.textContent = playing ? '⏸' : '▶'; };
  s.oninput = () => { cur = parseInt(s.value); playing = false; btn.textContent = '▶'; };
  sel.onchange = () => fps = parseInt(sel.value);
  return () => { if (rafId) cancelAnimationFrame(rafId); rafId = null; };
}
