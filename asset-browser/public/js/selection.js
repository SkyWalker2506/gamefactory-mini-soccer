

import { store, selection, selectionMeta } from './state.js';
import { toast } from './util.js';
import { fetchJson } from './api.js';
import { refreshSelectionUI, sourceDirFor, approvedAsAssets } from './grid.js';
import { load, loadTrash } from './main.js';

export function selectionKey(el) {
  
  
  const id = el.id || '';
  if (id.startsWith('asset-') || id.startsWith('miss-') || id.startsWith('trash-')) return id;
  return null;
}

export function clearSelection() {
  selection.clear();
  selectionMeta.lastSelectedKey = null;
  refreshSelectionUI();
}

export function toggleSelection(el, opts = {}) {
  const k = selectionKey(el);
  if (!k) return;
  if (opts.shift && selectionMeta.lastSelectedKey) {
    const all = Array.from(document.querySelectorAll('.card, .miss')).map(selectionKey).filter(Boolean);
    const a = all.indexOf(selectionMeta.lastSelectedKey), b = all.indexOf(k);
    if (a >= 0 && b >= 0) {
      const [from, to] = a < b ? [a, b] : [b, a];
      for (let i = from; i <= to; i++) selection.add(all[i]);
    }
  } else {
    if (selection.has(k)) selection.delete(k); else selection.add(k);
    selectionMeta.lastSelectedKey = k;
  }
  refreshSelectionUI();
}


export function selectionItems() {
  return Array.from(selection).map(k => {
    if (k.startsWith('asset-')) {
      const el = document.getElementById(k);
      if (!el) return null;
      const all = [...store.data.items, ...approvedAsAssets()];
      const txt = el.querySelector('.info .n')?.textContent || '';
      return all.find(i => i.name === txt) || null;
    }
    if (k.startsWith('miss-')) {
      const el = document.getElementById(k);
      if (!el) return null;
      const txt = el.querySelector('h3')?.textContent || '';
      return store.missing.items.find(i => i.name === txt) || null;
    }
    if (k.startsWith('trash-')) {
      const file = k.slice(6);
      return { _trash: true, name: file };
    }
    return null;
  }).filter(Boolean);
}

export async function bulkDelete() {
  const items = selectionItems();
  if (!items.length) return;
  if (!confirm(`${items.length} öğe silinsin mi?`)) return;
  toast(`${items.length} öğe siliniyor…`);
  let ok = 0, fail = 0;
  const queue = [...items];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const i = queue.shift();
      try {
        if (i._approved || i._missing || i.status) {
          await fetchJson('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: i.name }),
          });
        } else if (i.file) {
          const dir = sourceDirFor(i);
          if (!dir) { fail++; continue; }
          await fetchJson('/api/asset-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: i.file, dir }),
          });
        } else { fail++; continue; }
        ok++;
      } catch { fail++; }
    }
  }));
  clearSelection();
  toast(`${ok} silindi${fail ? `, ${fail} başarısız` : ''}`, fail ? 'err' : 'ok');
  setTimeout(load, 600);
}

export async function bulkRestore() {
  const files = Array.from(selection).filter(k => k.startsWith('trash-')).map(k => k.slice(6));
  if (!files.length) return;
  toast(`${files.length} öğe geri yükleniyor…`);
  let ok = 0, fail = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const file = queue.shift();
      try {
        await fetchJson('/api/trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', file }),
        });
        ok++;
      } catch { fail++; }
    }
  }));
  clearSelection();
  toast(`${ok} geri yüklendi${fail ? `, ${fail} başarısız` : ''}`, fail ? 'err' : 'ok');
  setTimeout(loadTrash, 500);
}

export async function bulkClear() {
  const items = selectionItems().filter(i => i._approved);
  if (!items.length) return toast('Sadece onaylı kartlar temizlenebilir', 'err');
  if (!confirm(`${items.length} öğe missing.json'dan temizlensin mi? (asset Mevcut'ta kalır)`)) return;
  let ok = 0, fail = 0;
  const queue = [...items];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const i = queue.shift();
      try {
        await fetchJson('/api/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: i.name }),
        });
        ok++;
      } catch { fail++; }
    }
  }));
  clearSelection();
  toast(`${ok} temizlendi${fail ? `, ${fail} başarısız` : ''}`, fail ? 'err' : 'ok');
  setTimeout(load, 600);
}
