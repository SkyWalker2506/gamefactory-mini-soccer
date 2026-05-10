


import { store } from './state.js';
import { toast, cssEsc } from './util.js';
import { getAdminToken } from './api.js';
import { load, loadTrash } from './main.js';


export function recordAction(action) {
  store.lastAction = { ...action, at: Date.now() };
  updateUndoButton();
}

export function updateUndoButton() {
  let el = document.getElementById('undo-btn');
  if (!el) {
    el = document.createElement('button');
    el.id = 'undo-btn';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#d4a849;color:#1a1510;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;z-index:200;transition:opacity .2s;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    el.onclick = undoLastAction;
    document.body.appendChild(el);
  }
  const a = store.lastAction;
  const valid = a && (Date.now() - a.at) < 15000;
  if (valid) {
    el.textContent = `⟲ Geri Al (${a.label})`;
    el.style.opacity = '1';
    el.style.cursor = 'pointer';
    el.disabled = false;
  } else {
    el.textContent = '⟲ Geri Al';
    el.style.opacity = '0.4';
    el.style.cursor = 'not-allowed';
    el.disabled = true;
  }
}

export async function undoLastAction() {
  const a = store.lastAction;
  if (!a || (Date.now() - a.at) > 15000) return;
  try {
    if (a.type === 'asset-delete' || a.type === 'upload-delete') {
      const r = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', file: a.file }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (a.type === 'upload-delete' && a.itemName) {
        await fetch('/api/missing-patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: a.itemName, patch: { status: a.prevStatus || 'waiting-for-review', uploadedFile: a.file, denyReason: a.prevDenyReason || null } }),
        });
      }
    } else if (a.type === 'review') {
      const prev = a.prevStatus;
      let action;
      if (prev === 'waiting-for-review') action = 'reopen';
      else if (prev === 'approved') action = 'approve';
      else if (prev === 'denied') action = 'deny';
      else throw new Error('prev status revert not supported: ' + prev);
      const body = { name: a.name, action };
      if (action === 'deny') body.reason = a.prevDenyReason || 'restored by undo';
      const r = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
    } else if (a.type === 'clear') {
      throw new Error('Clear geri alınamaz — missing listesinden kalıcı silindi');
    } else {
      throw new Error('bilinmeyen action: ' + a.type);
    }
    toast('Geri alındı');
    store.lastAction = null;
    updateUndoButton();
    setTimeout(load, 800);
  } catch (e) { toast('Undo: ' + e.message, 'err'); }
}


export async function copyPrompt(name) {
  const i = store.missing.items.find(x => x.name === name);
  if (!i?.prompt) return toast('Prompt yok', 'err');
  await navigator.clipboard.writeText(i.prompt);
  toast('Prompt kopyalandı');
}

export async function reviewAction(name, action) {
  let reason;
  if (action === 'deny') {
    reason = prompt(`${name} — neden reddediyorsun?`);
    if (!reason) return;
  } else if (action === 'approve' && !confirm(`${name} — onaylansın mı?`)) return;
  else if (action === 'reopen' && !confirm(`${name} — incelemeye geri alınsın mı?`)) return;
  const prev = store.missing.items.find(i => i.name === name);
  const prevStatus = prev?.status, prevDenyReason = prev?.denyReason;
  try {
    const r = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action, reason }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'review failed');
    recordAction({ type: 'review', name, prevStatus, prevDenyReason, label: action === 'approve' ? 'onay' : action === 'deny' ? 'red' : 'incele' });
    toast({ approve: 'Onaylandı', deny: 'Reddedildi', reopen: 'İncelemeye alındı' }[action]);
    setTimeout(load, 800);
  } catch (e) { toast(String(e.message), 'err'); }
}

export async function deleteAsset(file, dir) {
  if (!dir) return toast('Bu asset silinemez (dir yok)', 'err');
  if (!confirm(`${file} silinsin mi? (çöp kutusuna taşınır)`)) return;
  try {
    const r = await fetch('/api/asset-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, dir }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'delete failed');
    recordAction({ type: 'asset-delete', file, label: 'silme' });
    toast('Silindi (çöp kutusunda)');
    setTimeout(load, 800);
  } catch (e) { toast(String(e.message), 'err'); }
}

export async function unapproveAsset(name) {
  if (!confirm(`${name} — silinsin mi? Eksikler listesine geri dönecek.`)) return;
  try {
    const r = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'delete failed');
    const prev = store.missing.items.find(i => i.name === name);
    if (prev?.uploadedFile) {
      recordAction({
        type: 'upload-delete',
        file: prev.uploadedFile,
        itemName: prev.name,
        prevStatus: prev.status,
        prevDenyReason: prev.denyReason,
        label: 'silme',
      });
    }
    toast('Eksikler\'e gönderildi');
    setTimeout(load, 800);
  } catch (e) { toast(String(e.message), 'err'); }
}

export async function deleteUpload(name) {
  if (!confirm(`${name} upload'unu silmek istediğine emin misin?`)) return;
  try {
    const r = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'delete failed');
    const prev = store.missing.items.find(i => i.name === name);
    if (prev?.uploadedFile) {
      recordAction({
        type: 'upload-delete',
        file: prev.uploadedFile,
        itemName: prev.name,
        prevStatus: prev.status,
        prevDenyReason: prev.denyReason,
        label: 'silme',
      });
    }
    toast('Silindi');
    setTimeout(load, 800);
  } catch (e) { toast(String(e.message), 'err'); }
}

export async function clearEntry(name) {
  if (!confirm(`${name} — missing listesinden silinsin mi? (Asset dosyası Mevcut'ta kalır)`)) return;
  try {
    const r = await fetch('/api/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'clear failed');
    toast('Temizlendi');
    setTimeout(load, 800);
  } catch (e) { toast(String(e.message), 'err'); }
}

export function jumpToAsset(name) {
  document.querySelector('.tab[data-tab="have"]').click();
  document.getElementById('q').value = '';
  store.filter.q = '';
  
  import('./grid.js').then(({ render }) => {
    render();
    requestAnimationFrame(() => {
      const el = document.getElementById('asset-' + cssEsc(name));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow .4s';
        el.style.boxShadow = '0 0 0 3px #d4a849';
        setTimeout(() => { el.style.boxShadow = ''; }, 2000);
      } else {
        toast('Asset listede bulunamadı — manifest yenilenmemiş olabilir', 'err');
      }
    });
  });
}


export async function restoreTrash(file) {
  try {
    const r = await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', file }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    toast('Geri yüklendi');
    setTimeout(loadTrash, 500);
  } catch (e) { toast(e.message, 'err'); }
}

export async function purgeTrash(file) {
  if (!confirm(`${file} kalıcı silinsin mi? (geri alınamaz)`)) return;
  const token = getAdminToken();
  try {
    const r = await fetch('/api/trash?admin=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ action: 'purge', file }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    toast('Kalıcı silindi');
    setTimeout(loadTrash, 500);
  } catch (e) { toast(e.message, 'err'); }
}
