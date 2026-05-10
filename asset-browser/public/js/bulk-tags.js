import { selectionItems, clearSelection } from './selection.js';
import { store } from './state.js';
import { t } from './i18n.js';
import { toast } from './util.js';
import { load, srStatus } from './main.js';
import { autoTags } from './search.js';
export async function openBulkTagEditor() {
  const items = selectionItems().filter(i => !i._trash); if (!items.length) return;
  const modal = document.getElementById('modal'), box = document.getElementById('box');
  const origCont = box.innerHTML, origAria = modal.getAttribute('aria-label'), counts = new Map();
  for (const i of items) for (const t of autoTags(i)) counts.set(t, (counts.get(t) || 0) + 1);
  const common = [], some = [];
  for (const [tag, count] of counts.entries()) if (count === items.length) common.push(tag); else some.push(tag);
  const render = () => {
    box.innerHTML = `<div style="grid-column:1/span 2;display:flex;flex-direction:column;gap:12px">
        <h2 id="bulk-title">${t('bulk_tags.title', { count: items.length })}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div><div style="font-size:11px;color:#8b6b3d;margin-bottom:4px">${t('bulk_tags.common')}</div>
            <div id="common-tags" style="display:flex;flex-wrap:wrap;gap:4px">
              ${common.map(t => `<span class="chip active" data-tag="${t}">${t} ×</span>`).join('')}
            </div></div>
          <div><div style="font-size:11px;color:#8b6b3d;margin-bottom:4px">${t('bulk_tags.some')}</div>
            <div id="some-tags" style="display:flex;flex-wrap:wrap;gap:4px">
              ${some.map(t => `<span class="chip" data-tag="${t}">${t} +</span>`).join('')}
            </div></div></div>
        <div style="display:flex;gap:8px"><input type="text" id="new-tag" placeholder="${t('bulk_tags.add_placeholder')}" style="flex:1">
          <button class="tab" id="add-tag-btn">${t('actions.add') || 'Add'}</button></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
          <button class="tab" id="bulk-cancel-btn">${t('actions.cancel')}</button>
          <button class="tab active" id="bulk-apply-btn">${t('actions.confirm')}</button></div></div>`;
  };
  render(); modal.classList.add('open'); modal.setAttribute('aria-labelledby', 'bulk-title');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', t('bulk_tags.title', { count: items.length }));
  const close = () => { modal.classList.remove('open'); box.innerHTML = origCont; modal.setAttribute('aria-label', origAria); modal.removeAttribute('aria-labelledby'); };
  const add = new Set(), rem = new Set();
  box.onclick = (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const tag = chip.dataset.tag;
      if (chip.parentElement.id === 'common-tags') { rem.add(tag); add.delete(tag); common.splice(common.indexOf(tag), 1); }
      else { add.add(tag); rem.delete(tag); some.splice(some.indexOf(tag), 1); common.push(tag); }
      render();
    } else if (e.target.id === 'add-tag-btn') {
      const i = box.querySelector('#new-tag'), v = i.value.trim().toLowerCase();
      if (v && !common.includes(v)) { add.add(v); rem.delete(v); common.push(v); render(); }
    } else if (e.target.id === 'bulk-cancel-btn') close();
    else if (e.target.id === 'bulk-apply-btn') apply();
  };
  const apply = async () => {
    toast(t('status.uploading'));
    try {
      const r = await fetch('/api/bulk-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: items.map(i => i.name), addTags: [...add], removeTags: [...rem] }) });
      if (!r.ok) throw new Error();
      toast(t('bulk_tags.applied', { count: items.length }), 'ok');
      srStatus(t('bulk_tags.applied', { count: items.length }));
      clearSelection(); close(); setTimeout(load, 600);
    } catch { toast('Hata', 'err'); }
  };
}
