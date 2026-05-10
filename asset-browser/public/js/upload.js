import { store } from './state.js';
import { toast } from './util.js';
import { load, srStatus } from './main.js';
import { t } from './i18n.js';
const AM = ['image/png', 'image/webp', 'image/gif', 'image/jpeg', 'image/avif'], MAX = 20*1024*1024;
async function walk(e) {
  const f = []; if (e.isFile) f.push(await new Promise((rs, rj) => e.file(rs, rj)));
  else if (e.isDirectory) {
    const r = e.createReader(), es = await new Promise((rs, rj) => r.readEntries(rs, rj));
    for (const x of es) f.push(...(await walk(x)));
  }
  return f;
}
export async function performUpload(name, file) {
  if (!AM.includes(file.type) && !/\.(png|webp|gif|jpe?g|avif)$/i.test(file.name)) throw new Error(`Format: ${file.type || file.name}`);
  if (file.size > MAX) throw new Error('20MB limit');
  const dup = store.missing.items.find(i => i.uploadedFile === file.name && i.name !== name) || store.data.items.find(i => i.file === file.name);
  if (dup && !confirm(`"${file.name}" kullanımda. Yine de?`)) throw new Error('İptal');
  const b64 = await new Promise((rs, rj) => {
    const r = new FileReader(); r.onload = () => rs(String(r.result).split(',')[1]); r.onerror = () => rj(new Error('error')); r.readAsDataURL(file);
  });
  const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, filename: file.name, dataBase64: b64 }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); return j;
}
let _dc = null;
export function uploadFor(name) {
  if (_dc) _dc();
  let dc = 0; const ov = document.createElement('div');
  ov.className = 'modal open'; ov.id = 'upload-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', t('modal.upload_paste', { name })); ov.style.zIndex = '250';
  ov.innerHTML = `<div class="upload-box" tabindex="-1">
      <button class="close" data-close>×</button>
      <h2 style="margin:0 0 6px;color:#d4a849;font-size:18px" id="ut">${t('modal.upload_paste', { name })}</h2>
      <p style="margin:0 0 14px;color:#8b6b3d;font-size:11px">PNG / WebP / GIF / JPEG / AVIF · max 20 MB</p>
      <div class="dropzone" id="dz" tabindex="0" role="button" aria-label="${t('modal.upload_drop')}">
        <div class="dz-icon">⤓</div><div class="dz-title">${t('modal.upload_choose')}</div>
        <div class="dz-sub">${t('modal.upload_drop')}</div>
        <button type="button" class="dz-browse" data-browse>${t('actions.browse')}</button>
        <div class="dz-hint" id="dh" aria-live="polite"></div>
      </div>
      <div id="ua" style="margin-top:12px;display:none;justify-content:center">
         <button type="button" class="dz-browse" id="us">${t('modal.queue_skip')}</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const dz = ov.querySelector('#dz'), dh = ov.querySelector('#dh'), ut = ov.querySelector('#ut'), ua = ov.querySelector('#ua'), us = ov.querySelector('#us'), lf = document.activeElement;
  setTimeout(() => dz.focus(), 0);
  const sh = (m, k) => { dh.textContent = m || ''; dh.style.color = k === 'err' ? '#c94d4d' : k === 'ok' ? '#7abb7a' : '#8b6b3d'; };
  const sfs = async (fs) => {
    let l = Array.from(fs || []); const count = l.length;
    l = l.filter(f => AM.includes(f.type) || /\.(png|webp|gif|jpe?g|avif)$/i.test(f.name));
    if (count > l.length) console.info(`Dropped ${count - l.length}`);
    if (!l.length) return;
    let ok = 0, fail = 0, skip = false; us.onclick = () => { skip = true; };
    for (let i = 0; i < l.length; i++) {
      ut.textContent = t('modal.upload_progress', { current: i + 1, total: l.length });
      sh(t('status.uploading', { name: l[i].name }));
      try { await performUpload(name, l[i]); ok++; }
      catch (e) {
        fail++; sh(e.message, 'err'); ua.style.display = 'flex';
        while (!skip && _dc) await new Promise(r => setTimeout(r, 100));
        if (!_dc) return; skip = false; ua.style.display = 'none';
      }
    }
    if (ok) { toast(ok === 1 ? t('status.complete') : t('sr.upload_done', { name: ok + ' files' })); setTimeout(load, 600); }
    if (!fail) cl(); else { ut.textContent = t('modal.upload_queue_done'); sh(t('status.complete'), 'ok'); }
  };
  const br = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = AM.join(','); i.multiple = true; i.onchange = () => sfs(i.files); i.click(); };
  const op = (e) => { if (!ov.parentNode) return; const i = e.clipboardData?.files || []; if (i.length) { e.preventDefault(); sfs(i); } };
  const oen = (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); dc++; dz.classList.add('over'); };
  const oov = (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const olv = () => { dc = Math.max(0, dc - 1); if (dc === 0) dz.classList.remove('over'); };
  const odr = async (e) => {
    e.preventDefault(); dc = 0; dz.classList.remove('over');
    const items = e.dataTransfer?.items;
    if (items?.[0]?.webkitGetAsEntry) {
      const f = []; for (const it of items) { const en = it.webkitGetAsEntry(); if (en) f.push(...(await walk(en))); }
      sfs(f);
    } else sfs(e.dataTransfer?.files);
  };
  const ok = (e) => { if (e.key === 'Escape') { e.preventDefault(); cl(); } else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === dz) { e.preventDefault(); br(); } };
  const ocl = (e) => { if (e.target.matches('[data-close]') || e.target === ov) cl(); else if (e.target.closest('#dz') || e.target.matches('[data-browse]')) br(); };
  dz.addEventListener('dragenter', oen); dz.addEventListener('dragover', oov); dz.addEventListener('dragleave', olv); dz.addEventListener('drop', odr);
  ov.addEventListener('click', ocl); document.addEventListener('keydown', ok); document.addEventListener('paste', op);
  function cl() { document.removeEventListener('keydown', ok); document.removeEventListener('paste', op); ov.remove(); dc = 0; _dc = null; if (lf && document.body.contains(lf)) lf.focus(); }
  _dc = cl;
}
