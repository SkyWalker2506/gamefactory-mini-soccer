// Interactive frame editor — drag vertical split lines on a sprite sheet
// On Save: emits new frames JSON to clipboard for paste into config.json overrides.

export function attachFrameEditor(modalBox, asset) {
  if (!asset.frames && !(asset.cols && asset.rows)) return null;

  const wrap = document.createElement('details');
  wrap.style.cssText = 'margin-top:12px;width:100%';
  wrap.open = false;
  const sum = document.createElement('summary');
  sum.textContent = '🎯 Frame Editor — dikey çizgileri sürükle';
  sum.style.cssText = 'cursor:pointer;color:#ffeb3b;font-weight:600;padding:6px 0';
  wrap.appendChild(sum);

  const editor = document.createElement('div');
  editor.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px;background:#051a0a;border:1px solid #2d6e3d;border-radius:6px';
  wrap.appendChild(editor);

  const info = document.createElement('div');
  info.style.cssText = 'font-size:11px;color:#7da888';
  editor.appendChild(info);

  // Canvas sized to fit modal width, sheet rendered scaled
  const cv = document.createElement('canvas');
  cv.style.cssText = 'background:#000;border:1px solid #2d6e3d;cursor:ew-resize;max-width:100%;display:block';
  editor.appendChild(cv);

  const ctrls = document.createElement('div');
  ctrls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  editor.appendChild(ctrls);

  const mkBtn = (label, color) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `padding:6px 12px;background:${color};color:#0a2d14;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px`;
    return b;
  };
  const addBtn   = mkBtn('+ Bölme Ekle', '#7fcfa0');
  const delBtn   = mkBtn('− Seçili Sil', '#ff8888');
  const eqBtn    = mkBtn('↔ Eşit Böl',  '#ffeb3b');
  const gapBtn   = mkBtn('🔍 Boşluğa Göre',  '#ffeb3b');
  const copyBtn  = mkBtn('📋 JSON Kopyala', '#7fcfa0');
  ctrls.append(addBtn, delBtn, eqBtn, gapBtn, copyBtn);

  const out = document.createElement('textarea');
  out.style.cssText = 'width:100%;min-height:80px;background:#0a2d14;color:#f0fff5;border:1px solid #2d6e3d;border-radius:4px;padding:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px';
  out.readOnly = true;
  editor.appendChild(out);

  const p = modalBox.querySelector('.preview') || modalBox;
  p.appendChild(wrap);

  // Build initial boundaries from asset.frames or cols
  const [W, H] = (asset.dim || '0x0').split('x').map(Number);
  let bounds; // sorted x positions of vertical splits, in source-pixel space
  if (asset.frames && asset.frames.length) {
    // N frames → N+1 boundaries: leftmost edge, midpoints between adjacent frames, rightmost edge
    const sorted = [...asset.frames].sort((a, b) => a.x - b.x);
    bounds = [sorted[0].x];
    for (let k = 0; k < sorted.length - 1; k++) {
      bounds.push(Math.round((sorted[k].x + sorted[k].w + sorted[k+1].x) / 2));
    }
    bounds.push(sorted[sorted.length - 1].x + sorted[sorted.length - 1].w);
  } else if (asset.cols) {
    const fw = W / asset.cols;
    bounds = [];
    for (let i = 0; i <= asset.cols; i++) bounds.push(Math.round(i * fw));
  } else {
    bounds = [0, W];
  }

  const img = new Image();
  img.src = asset.src;

  const SCALE = () => Math.min(1, (modalBox.clientWidth - 60) / W);
  let scale = 0.5;
  let selected = -1;       // selected line index (for drag visual)
  let selectedFrame = -1;  // selected frame index (band between lines)
  let dragging = -1;

  const sx = (px) => px * scale;
  const ix = (sx) => Math.round(sx / scale);

  function render() {
    scale = SCALE();
    cv.width = W * scale;
    cv.height = H * scale;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (img.complete) ctx.drawImage(img, 0, 0, cv.width, cv.height);
    // Draw frame fill bands
    for (let i = 0; i < bounds.length - 1; i++) {
      if (i === selectedFrame) {
        ctx.fillStyle = 'rgba(255,68,136,0.25)';
      } else {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,235,59,0.07)' : 'rgba(127,207,160,0.07)';
      }
      ctx.fillRect(sx(bounds[i]), 0, sx(bounds[i+1]-bounds[i]), cv.height);
      ctx.fillStyle = i === selectedFrame ? '#ff4488' : '#ffeb3b';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(String(i), sx(bounds[i]) + 6, 18);
    }
    // Draw boundary lines + handles
    bounds.forEach((b, i) => {
      const x = sx(b);
      ctx.strokeStyle = i === selected ? '#ff4488' : '#ff00ff';
      ctx.lineWidth = i === selected ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
      // Handle dot at top
      ctx.fillStyle = i === selected ? '#ff4488' : '#ff00ff';
      ctx.beginPath(); ctx.arc(x, 8, 6, 0, Math.PI * 2); ctx.fill();
    });
    const sel = selectedFrame >= 0 ? ` · seçili: frame ${selectedFrame} (${bounds[selectedFrame]}→${bounds[selectedFrame+1]}, w=${bounds[selectedFrame+1]-bounds[selectedFrame]})` : ' · frame seçmek için içine tıkla';
    info.textContent = `${bounds.length - 1} frame · sheet ${W}×${H} · ölçek ${(scale*100).toFixed(0)}%${sel}`;
    syncOutput();
  }

  function syncOutput() {
    const frames = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      frames.push({ x: bounds[i], y: 0, w: bounds[i+1] - bounds[i], h: H });
    }
    out.value = JSON.stringify({ [asset.name]: { frames } }, null, 2);
  }

  function findHandle(mx) {
    for (let i = 0; i < bounds.length; i++) {
      if (Math.abs(sx(bounds[i]) - mx) < 8) return i;
    }
    return -1;
  }

  function findFrame(mx) {
    const px = ix(mx);
    for (let i = 0; i < bounds.length - 1; i++) {
      if (px >= bounds[i] && px < bounds[i+1]) return i;
    }
    return -1;
  }

  function canvasX(e) {
    const r = cv.getBoundingClientRect();
    // Map display-pixel to canvas-buffer pixel (CSS may shrink the canvas)
    return (e.clientX - r.left) * (cv.width / r.width);
  }

  cv.addEventListener('mousemove', (e) => {
    if (dragging >= 0) return;
    const mx = canvasX(e);
    cv.style.cursor = findHandle(mx) >= 0 ? 'ew-resize' : 'pointer';
  });

  cv.addEventListener('mousedown', (e) => {
    const mx = canvasX(e);
    const h = findHandle(mx);
    if (h >= 0) {
      dragging = h;
      selected = h;
    } else {
      selected = -1;
      const f = findFrame(mx);
      selectedFrame = (selectedFrame === f) ? -1 : f; // toggle
    }
    render();
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging < 0) return;
    const mx = Math.max(0, Math.min(cv.width, canvasX(e)));
    const minX = dragging > 0 ? bounds[dragging - 1] + 1 : 0;
    const maxX = dragging < bounds.length - 1 ? bounds[dragging + 1] - 1 : W;
    bounds[dragging] = Math.max(minX, Math.min(maxX, ix(mx)));
    render();
  });
  window.addEventListener('mouseup', () => { dragging = -1; });

  addBtn.onclick = () => {
    // Split the selected frame in half (or widest frame if none selected)
    let target = selectedFrame;
    if (target < 0) {
      let widestW = 0;
      for (let i = 0; i < bounds.length - 1; i++) {
        const w = bounds[i+1] - bounds[i];
        if (w > widestW) { widestW = w; target = i; }
      }
    }
    const mid = Math.round((bounds[target] + bounds[target + 1]) / 2);
    bounds.splice(target + 1, 0, mid);
    selectedFrame = target;
    render();
  };
  delBtn.onclick = () => {
    // Remove selected frame by deleting its right boundary (merges into next frame)
    if (selectedFrame >= 0 && selectedFrame < bounds.length - 1) {
      const removeAt = selectedFrame === bounds.length - 2 ? selectedFrame : selectedFrame + 1;
      bounds.splice(removeAt, 1);
      selectedFrame = -1;
      render();
    }
  };
  eqBtn.onclick = () => {
    const n = Math.max(2, bounds.length - 1);
    const fw = W / n;
    bounds = [];
    for (let i = 0; i <= n; i++) bounds.push(Math.round(i * fw));
    render();
  };
  gapBtn.onclick = async () => {
    // Re-detect by transparency gaps
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, W, H).data;
    const cols = new Array(W);
    for (let x = 0; x < W; x++) {
      let f = false;
      for (let y = 0; y < H; y++) {
        if (data[(y * W + x) * 4 + 3] > 8) { f = true; break; }
      }
      cols[x] = f;
    }
    const runs = [];
    let i = 0;
    while (i < W) {
      if (cols[i]) {
        const s = i;
        while (i < W && cols[i]) i++;
        runs.push([s, i]);
      } else i++;
    }
    bounds = [];
    for (let k = 0; k < runs.length; k++) {
      const prevE = k > 0 ? runs[k-1][1] : 0;
      const left = Math.floor((prevE + runs[k][0]) / 2);
      bounds.push(left);
    }
    bounds.push(W);
    render();
  };
  copyBtn.onclick = async () => {
    syncOutput();
    try {
      await navigator.clipboard.writeText(out.value);
      copyBtn.textContent = '✓ Kopyalandı';
      setTimeout(() => copyBtn.textContent = '📋 JSON Kopyala', 1500);
    } catch {
      out.select();
      document.execCommand('copy');
    }
  };

  img.onload = render;
  if (img.complete) render();

  return () => {};
}
