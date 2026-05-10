



import { store } from './state.js';
import { escapeHtml, cssEsc, fmtSize, toast } from './util.js';
import {
  parseSmartQuery,
  matchesSmartQuery,
  applySort,
  getSavedFilters,
  saveSavedFilters,
} from './search.js';
import { renderStats } from './stats.js';
import { selection } from './state.js';
import { t } from './i18n.js';


export function sourceDirFor(item) {
  if (!store.config) return '';
  const src = item.src || '';
  const tag = src.split('/')[2];
  const s = (store.config.sources || []).find(x => x.tag === tag);
  return s ? s.dir : '';
}

const STATUS_FOR_TAB = {
  todo: s => s === 'todo' || s === 'in-progress',
  waiting: s => s === 'waiting-for-review',
  denied: s => s === 'denied',
};


export function approvedAsAssets() {
  return store.missing.items.filter(i => i.status === 'approved' && i.uploadedFile).map(i => ({
    id: `approved-${i.name}`,
    name: i.name,
    file: i.uploadedFile,
    ext: (i.uploadedFile.split('.').pop() || 'png').toLowerCase(),
    src: `/api/uploaded?file=${encodeURIComponent(i.uploadedFile)}`,
    category: i.category || 'Approved',
    kind: i.kind || 'Other',
    type: i.type || 'Resim',
    size: 0,
    dim: '',
    mtime: new Date().toISOString(),
    _approved: true,
  }));
}

export function itemsForTab() {
  if (store.tab === 'have') {
    const existing = new Set(store.data.items.map(i => i.name));
    const extras = approvedAsAssets().filter(a => !existing.has(a.name));
    return [...store.data.items, ...extras];
  }
  const fn = STATUS_FOR_TAB[store.tab];
  return store.missing.items.filter(i => fn(i.status));
}

export function updateTabVisibility() {
  for (const k of ['waiting', 'denied']) {
    const count = store.missing.items.filter(i => STATUS_FOR_TAB[k](i.status)).length;
    const btn = document.querySelector(`.tab[data-tab="${k}"]`);
    if (btn) btn.style.display = count ? '' : 'none';
  }
  const activeBtn = document.querySelector('.tab.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    document.querySelector('.tab[data-tab="have"]').click();
  }
}

export function updateMeta() {
  const el = document.getElementById('meta');
  if (store.tab === 'have') {
    el.textContent = `${store.data.count} asset · updated ${new Date(store.data.generated).toLocaleString()}`;
  } else {
    const count = itemsForTab().length;
    const labelKey = { todo: 'tabs.todo', waiting: 'tabs.waiting', approved: 'tabs.approved', denied: 'tabs.denied' }[store.tab] || `tabs.${store.tab}`;
    const label = t(labelKey).toLowerCase();
    el.textContent = `${count} ${label} · updated ${store.missing.updated || '—'}`;
  }
}



const _io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const card = entry.target;
    if (entry.isIntersecting) {
      card.removeAttribute('data-pending');
      const img = card.querySelector('img[data-src]');
      if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
      
      for (const src of card.querySelectorAll('picture > source[data-srcset]')) {
        src.srcset = src.dataset.srcset;
        src.removeAttribute('data-srcset');
      }
      const anim = card.querySelector('.anim-frame[data-anim]');
      if (anim) {
        anim.style.animation = anim.dataset.anim;
        anim.removeAttribute('data-anim');
      }
    } else {
      const anim = card.querySelector('.anim-frame');
      if (anim && anim.style.animation && !anim.dataset.anim) {
        anim.dataset.anim = anim.style.animation;
        anim.style.animation = 'none';
      }
    }
  }
}, { rootMargin: '300px 0px' });

export function observeCards() {
  document.querySelectorAll('.grid .card[data-pending], .grid .card').forEach(c => _io.observe(c));
}


function chip(label, value) {
  const e = document.createElement('div');
  e.className = 'chip'; e.textContent = label; e.dataset.v = value;
  return e;
}

function activateChip(el) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

export function buildChips() {
  const kinds = [...new Set(store.data.items.map(i => i.kind))].sort();
  const c = document.getElementById('chips');
  c.innerHTML = '';
  const allLabel = t('chips.show_all');
  const all = chip(allLabel, '');
  all.classList.add('active');
  all.onclick = () => { store.filter.kind = ''; activateChip(all); render(); };
  c.appendChild(all);
  kinds.forEach(k => {
    const ch = chip(`${k} (${store.data.items.filter(i => i.kind === k).length})`, k);
    ch.onclick = () => { store.filter.kind = k; activateChip(ch); render(); };
    c.appendChild(ch);
  });
}

function fillSelect(id, values) {
  const sel = document.getElementById(id);
  values.forEach(v => {
    if ([...sel.options].some(o => o.value.toLowerCase() === String(v).toLowerCase())) return;
    const o = document.createElement('option');
    o.value = id === 'ext' ? String(v).toLowerCase() : v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

export function buildCatSelect() {
  fillSelect('cat', [...new Set(store.data.items.map(i => i.category))].sort());
  fillSelect('ext', [...new Set(store.data.items.map(i => i.ext))].sort().map(e => e.toUpperCase()));
}


export function renderSavedFilters() {
  const c = document.getElementById('saved-filters');
  if (!c) return;
  const arr = getSavedFilters();
  if (!arr.length) { c.innerHTML = ''; return; }
  c.innerHTML = arr.map(f => `
    <span class="chip saved-chip" title="${escapeHtml(f.q || '')} ${f.cat || ''} ${f.kind || ''}">
      <span onclick="applySavedFilter(${f.id})">${escapeHtml(f.name)}</span>
      <span class="x" onclick="removeSavedFilter(${f.id})">×</span>
    </span>`).join('');
}

export function saveCurrentAsFilter() {
  const tr = t('lang.tr') === 'TR';
  const promptMsg = tr ? 'Bu filtre için bir isim:' : 'A name for this filter:';
  const name = prompt(promptMsg);
  if (!name) return;
  const arr = getSavedFilters();
  const entry = {
    id: Date.now(),
    name,
    q: store.filter.q,
    cat: store.filter.cat,
    ext: store.filter.ext,
    kind: store.filter.kind,
    type: store.filter.type,
    tab: store.tab,
  };
  arr.unshift(entry);
  saveSavedFilters(arr);
  renderSavedFilters();
  toast(t('toast.saved_filter', { name }) || `"${name}" kaydedildi`);
}

export function applySavedFilter(id) {
  const f = getSavedFilters().find(x => x.id === id);
  if (!f) return;
  store.filter = { q: f.q || '', cat: f.cat || '', ext: f.ext || '', kind: f.kind || '', type: f.type || '' };
  document.getElementById('q').value = store.filter.q;
  document.getElementById('cat').value = store.filter.cat;
  document.getElementById('ext').value = store.filter.ext;
  document.getElementById('type').value = store.filter.type;
  if (f.tab && f.tab !== store.tab) {
    const btn = document.querySelector(`.tab[data-tab="${f.tab}"]`);
    if (btn && btn.style.display !== 'none') { btn.click(); return; }
  }
  render();
}

export function removeSavedFilter(id) {
  saveSavedFilters(getSavedFilters().filter(x => x.id !== id));
  renderSavedFilters();
}


export function refreshSelectionUI() {
  document.body.classList.toggle('has-selection', selection.size > 0);
  const countEl = document.getElementById('bulk-count');
  if (countEl) countEl.textContent = t('sr.selection_count', { count: selection.size });
  const inTrash = store.tab === 'trash';
  const restoreBtn = document.getElementById('bulk-action-restore');
  const deleteBtn = document.getElementById('bulk-action-delete');
  const clearBtn = document.getElementById('bulk-action-clear');
  if (restoreBtn) {
    restoreBtn.style.display = inTrash ? '' : 'none';
    restoreBtn.textContent = t('bulk.restore');
  }
  if (deleteBtn) {
    deleteBtn.style.display = inTrash ? 'none' : '';
    deleteBtn.textContent = t('bulk.delete');
  }
  if (clearBtn) {
    clearBtn.style.display = (store.tab === 'have') ? '' : 'none';
    clearBtn.textContent = t('bulk.clear');
  }
  document.querySelectorAll('.card, .miss').forEach(el => {
    const id = el.id || '';
    const k = (id.startsWith('asset-') || id.startsWith('miss-') || id.startsWith('trash-')) ? id : null;
    const isSelected = !!k && selection.has(k);
    el.classList.toggle('selected', isSelected);
    if (k) el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });
}


export function render() {
  const g = document.getElementById('grid');
  const parsed = parseSmartQuery(store.filter.q);
  if (store.tab !== 'have') {
    const src = itemsForTab();
    const filtered = src.filter(i =>
      matchesSmartQuery(i, parsed) &&
      (!store.filter.kind || i.kind === store.filter.kind) &&
      (!store.filter.type || i.type === store.filter.type)
    );
    renderStats(filtered.length);
    if (!filtered.length) { g.innerHTML = `<div class="empty" data-i18n="status.empty_list">${t('status.empty_list')}</div>`; return; }
    g.innerHTML = filtered.map(i => {
      const preview = i.uploadedFile
        ? `<div class="up-preview"><img src="/api/uploaded?file=${encodeURIComponent(i.uploadedFile)}&t=${Date.now()}" onload="this.nextElementSibling.querySelector('.dim').textContent=this.naturalWidth+'x'+this.naturalHeight" onerror="this.style.display='none';this.parentElement.querySelector('.err').style.display='block'"><div class="up-info"><div class="up-name">${i.uploadedFile}</div><div class="up-meta"><span class="dim">—</span> · ham yüklenmiş (işlenmemiş)</div><div class="err" style="display:none;color:#c94d4d;font-size:11px;">Preview yüklenemedi</div></div></div>` : '';
      const deny = i.status === 'denied' && i.denyReason ? `<div class="deny-reason"><b data-i18n="actions.reject">${t('actions.reject')}:</b> ${escapeHtml(i.denyReason)}</div>` : '';
      const actions = [];
      const qn = JSON.stringify(i.name).replace(/"/g, '&quot;');
      if (i.prompt && (i.status === 'todo' || i.status === 'in-progress' || i.status === 'denied')) actions.push(`<button class="btn primary" onclick="copyPrompt(${qn})" data-i18n="actions.copy">${t('actions.copy')}</button>`);
      if (i.status === 'todo' || i.status === 'in-progress' || i.status === 'denied') actions.push(`<button class="btn" onclick="uploadFor(${qn})" data-i18n="actions.upload">${t('actions.upload')}</button>`);
      if (i.status === 'waiting-for-review') {
        actions.push(`<button class="btn primary" onclick="reviewAction(${qn},'approve')" data-i18n="actions.approve">${t('actions.approve')}</button>`);
        actions.push(`<button class="btn danger" onclick="reviewAction(${qn},'deny')" data-i18n="actions.reject">${t('actions.reject')}</button>`);
        actions.push(`<button class="btn" onclick="deleteUpload(${qn})" data-i18n="actions.delete">${t('actions.delete')}</button>`);
      }
      if (i.status === 'approved') {
        actions.push(`<button class="btn primary" onclick="jumpToAsset(${qn})" data-i18n="actions.jump">${t('actions.jump') || 'Assete Git'}</button>`);
        actions.push(`<button class="btn" onclick="clearEntry(${qn})" data-i18n="actions.clear">${t('actions.clear')}</button>`);
        actions.push(`<button class="btn danger" onclick="reviewAction(${qn},'deny')" data-i18n="actions.reject">${t('actions.reject')}</button>`);
      }
      if (i.status === 'denied') {
        actions.push(`<button class="btn primary" onclick="reviewAction(${qn},'approve')" data-i18n="actions.approve">${t('actions.approve')}</button>`);
        actions.push(`<button class="btn" onclick="reviewAction(${qn},'reopen')" data-i18n="actions.reopen">${t('actions.reopen') || 'İncelemeye Al'}</button>`);
        actions.push(`<button class="btn danger" onclick="deleteUpload(${qn})" data-i18n="actions.delete">${t('actions.delete')}</button>`);
      }
      if (i.uploadedFile) actions.push(`<a class="btn" href="/api/uploaded?file=${encodeURIComponent(i.uploadedFile)}" download="${i.uploadedFile}" data-i18n="actions.download">${t('actions.download') || 'İndir'}</a>`);
      return `
      <div class="miss" id="miss-${cssEsc(i.name)}" data-name="${escapeHtml(i.name)}" role="gridcell" aria-selected="false" aria-label="${escapeHtml(i.name)}, ${escapeHtml(i.status)}" tabindex="-1">
        <span class="select-checkbox" role="checkbox" aria-label="${t('actions.select')}" tabindex="0"></span>
        <h3>${i.name}</h3>
        <div class="meta">
          <span class="tag pri-${i.priority}">${i.priority}</span>
          <span class="tag st-${i.status}">${i.status}</span>
          <span class="tag">${i.kind}</span>
          <span class="tag" style="background:${i.type === 'Animasyon' ? '#8b4d1e' : '#3a2d1d'}">${i.type}</span>
        </div>
        <div class="notes">${i.notes || ''}</div>
        ${deny}
        ${preview}
        ${i.prompt && (i.status !== 'approved') ? `<div class="prompt">${escapeHtml(i.prompt)}</div>` : ''}
        <div class="actions">${actions.join('')}</div>
      </div>`;
    }).join('');
    g.setAttribute('role', 'grid');
    g.setAttribute('aria-rowcount', String(filtered.length));
    g.setAttribute('aria-label', t('tabs.todo'));
    refreshSelectionUI();
    setRovingTabindex(null);
    return;
  }
  const haveItems = itemsForTab();
  const filtered = applySort(haveItems.filter(i =>
    matchesSmartQuery(i, parsed) &&
    (!store.filter.cat || i.category === store.filter.cat) &&
    (!store.filter.ext || i.ext === store.filter.ext) &&
    (!store.filter.kind || i.kind === store.filter.kind) &&
    (!store.filter.type || i.type === store.filter.type)
  ), store.sortMode);
  renderStats(filtered.length);
  if (!filtered.length) { g.innerHTML = `<div class="empty" data-i18n="status.empty_matches">${t('status.empty_matches')}</div>`; return; }
  g.innerHTML = filtered.map(i => {
    
    
    
    let thumbInner = i.avifSrc
      ? `<picture><source type="image/avif" data-srcset="${i.avifSrc}"><img data-src="${i.src}" alt="${i.name}" decoding="async" width="160" height="160"></picture>`
      : `<img data-src="${i.src}" alt="${i.name}" decoding="async" width="160" height="160">`;
    if (i.type === 'Animasyon' && i.dim) {
      const m = i.dim.match(/^(\d+)x(\d+)$/);
      const nameFrames = (i.name.match(/_(\d+)f/i) || [])[1];
      if (m) {
        const w = +m[1], h = +m[2];
        const frames = nameFrames ? +nameFrames : (w > h ? Math.round(w / h) : 1);
        if (frames > 1 && w / h === frames) {
          const endX = -((frames - 1) * 128);
          const dur = (frames / 8).toFixed(2);
          thumbInner = `<div class="anim-frame" data-anim="sprite-play ${dur}s steps(${frames - 1}) infinite" style="background-image:url('${i.src}');--end:${endX}px;animation:none;"></div>`;
        }
      }
    }
    const approvedBadge = i._approved ? `<span class="tag st-approved" data-i18n="tabs.approved">${t('tabs.approved') || 'Onaylı'}</span> ` : '';
    const delBtn = i._approved
      ? `<button class="dl" style="background:#4d1f1f;border:none;cursor:pointer;" onclick="event.stopPropagation();unapproveAsset(${JSON.stringify(i.name).replace(/"/g, '&quot;')})" data-i18n="actions.delete">${t('actions.delete')}</button>`
      : `<button class="dl" style="background:#4d1f1f;border:none;cursor:pointer;" onclick="event.stopPropagation();deleteAsset(${JSON.stringify(i.file).replace(/"/g, '&quot;')},${JSON.stringify(sourceDirFor(i)).replace(/"/g, '&quot;')})" data-i18n="actions.delete">${t('actions.delete')}</button>`;
    const aLabel = escapeHtml(`${i.name}, ${i.category}, ${i.type}`);
    return `
    <div class="card" id="asset-${cssEsc(i.name)}" data-pending="1" data-name="${escapeHtml(i.name)}" role="gridcell" aria-selected="false" aria-label="${aLabel}" tabindex="-1">
      <span class="select-checkbox" role="checkbox" aria-label="${t('actions.select')}" tabindex="0"></span>
      <div class="thumb" onclick="openModal('${i.id}')">${thumbInner}</div>
      <div class="info">
        <div class="n">${i.name}</div>
        <div class="d"><span>${i.dim || '—'}</span><span>${fmtSize(i.size)}</span></div>
        ${approvedBadge}<span class="tag">${i.kind}</span> <span class="tag" style="background:${i.type === 'Animasyon' ? '#8b4d1e' : '#3a2d1d'}">${i.type}</span>
        <a class="dl" href="${i.src}" download="${i.file}" onclick="event.stopPropagation()" data-i18n="actions.download">${t('actions.download')}</a>
        <button class="dl" style="background:#2a323c;border:1px solid #4ae8f0;color:#4ae8f0;cursor:pointer;font-family:inherit;" onclick="event.stopPropagation();copyAssetUrl('${i.src}', this)" data-i18n="actions.copy_link">${t('actions.copy_link') || 'Link Kopyala'}</button>
        ${delBtn}
      </div>
    </div>`;
  }).join('');
  g.setAttribute('role', 'grid');
  g.setAttribute('aria-rowcount', String(filtered.length));
  g.setAttribute('aria-label', t('tabs.have'));
  observeCards();
  refreshSelectionUI();
  setRovingTabindex(null);
}

export function setRovingTabindex(activeEl) {
  const all = document.querySelectorAll('#grid .card, #grid .miss');
  all.forEach(el => el.setAttribute('tabindex', '-1'));
  if (activeEl) {
    activeEl.setAttribute('tabindex', '0');
  } else if (all.length) {
    all[0].setAttribute('tabindex', '0');
  }
}

// Copy asset URL to clipboard so it can be embedded in prompts (e.g. animation references)
window.copyAssetUrl = function(src, btn) {
  const absUrl = new URL(src, window.location.origin).href;
  navigator.clipboard.writeText(absUrl).then(() => {
    const original = btn.textContent;
    btn.textContent = '✓ Kopyalandı';
    btn.style.background = '#ff9038';
    btn.style.color = '#15110d';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '#2a323c';
      btn.style.color = '#4ae8f0';
    }, 1500);
  }).catch(err => {
    btn.textContent = '✗ Hata';
    console.error('clipboard:', err);
  });
};
