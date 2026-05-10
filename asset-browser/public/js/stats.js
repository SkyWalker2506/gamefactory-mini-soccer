// Stats panel renderer. Reads `store` for current tab + missing.json snapshot,
// builds bar charts from category/kind/type/status counts, and a queue
// summary line for missing/waiting/approved/trash.

import { store } from './state.js';
import { escapeHtml } from './util.js';
import { itemsForTab } from './grid.js';
import { t } from './i18n.js';

function buildBarRows(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) return `<div style="font-size:11px;color:#5c4428;">${t('status.no_data') || 'veri yok'}</div>`;
  const max = Math.max(...entries.map(e => e[1])) || 1;
  return entries.map(([k, v]) => {
    const pct = Math.round((v / max) * 100);
    return `<div class="stat-row"><span class="label" title="${escapeHtml(k)}">${escapeHtml(k)}</span><span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span><span class="count">${v}</span></div>`;
  }).join('');
}

export function renderStats(filteredCount) {
  const grid = document.getElementById('stats-grid');
  const summary = document.getElementById('stats-summary');
  if (!grid) return;
  const tabItems = itemsForTab();
  const total = tabItems.length;
  const visible = filteredCount == null ? total : filteredCount;
  const catMap = {}, kindMap = {}, typeMap = {};
  for (const i of tabItems) {
    const c = i.category || i.kind || '—';
    catMap[c] = (catMap[c] || 0) + 1;
    if (i.kind) kindMap[i.kind] = (kindMap[i.kind] || 0) + 1;
    if (i.type) typeMap[i.type] = (typeMap[i.type] || 0) + 1;
  }
  const statusMap = {};
  for (const i of (store.missing.items || [])) {
    statusMap[i.status || 'todo'] = (statusMap[i.status || 'todo'] || 0) + 1;
  }
  const missingCount = (store.missing.items || []).filter(i => i.status === 'todo' || i.status === 'in-progress').length;
  const waitingCount = (store.missing.items || []).filter(i => i.status === 'waiting-for-review').length;
  const approvedCount = (store.missing.items || []).filter(i => i.status === 'approved').length;

  const tabLabel = t(`tabs.${store.tab}`);

  grid.innerHTML = `
    <div class="stat-card">
      <h4 data-i18n="stats.total">${t('stats.total', { tab: tabLabel })}</h4>
      <div class="total">${total}</div>
      <div class="dz-sub" style="margin:6px 0 0;" data-i18n="stats.filtered">${t('stats.filtered', { count: visible })}</div>
    </div>
    <div class="stat-card">
      <h4 data-i18n="stats.category">${t('stats.category')}</h4>
      <div class="stat-bars">${buildBarRows(catMap)}</div>
    </div>
    <div class="stat-card">
      <h4 data-i18n="stats.kind">${t('stats.kind')}</h4>
      <div class="stat-bars">${buildBarRows(kindMap)}</div>
    </div>
    <div class="stat-card">
      <h4 data-i18n="stats.type">${t('stats.type')}</h4>
      <div class="stat-bars">${buildBarRows(typeMap)}</div>
    </div>
    <div class="stat-card">
      <h4 data-i18n="stats.workflow">${t('stats.workflow')}</h4>
      <div class="stat-bars">${buildBarRows(statusMap)}</div>
    </div>
    <div class="stat-card">
      <h4 data-i18n="stats.queues">${t('stats.queues')}</h4>
      <div class="stat-row"><span class="label" data-i18n="stats.missing">${t('stats.missing')}</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, missingCount * 5)}%"></span></span><span class="count">${missingCount}</span></div>
      <div class="stat-row"><span class="label" data-i18n="stats.review">${t('stats.review')}</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, waitingCount * 8)}%;background:linear-gradient(90deg,#7a6a1f,#d4a849);"></span></span><span class="count">${waitingCount}</span></div>
      <div class="stat-row"><span class="label" data-i18n="tabs.approved">${t('tabs.approved') || 'Onaylı'}</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, approvedCount * 4)}%;background:linear-gradient(90deg,#2a5a2a,#7abb7a);"></span></span><span class="count">${approvedCount}</span></div>
      <div class="stat-row"><span class="label" data-i18n="stats.trash">${t('stats.trash')}</span><span class="bar"><span class="bar-fill" style="width:${Math.min(100, store.trashCountCache * 4)}%;background:linear-gradient(90deg,#4d1f1f,#c94d4d);"></span></span><span class="count">${store.trashCountCache}</span></div>
    </div>`;
  if (summary) summary.textContent = t('stats.summary', { visible, total, missing: missingCount, waiting: waitingCount });
}
