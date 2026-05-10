


import { store, selection, selectionMeta } from './state.js';
import { toggleSelection, bulkDelete, clearSelection, selectionKey } from './selection.js';
import { closeModal, closeHelp, openModal } from './modal.js';
import { approvedAsAssets } from './grid.js';
import { refreshSelectionUI } from './grid.js';
import { srStatus } from './main.js';

function setFocusedCard(el) {
  document.querySelectorAll('.focused').forEach(x => x.classList.remove('focused'));
  if (el) {
    el.classList.add('focused');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    selectionMeta.focusedKey = selectionKey(el);
  } else {
    selectionMeta.focusedKey = null;
  }
}

function navigateCards(delta) {
  const all = Array.from(document.querySelectorAll('.card, .miss'));
  if (!all.length) return;
  const cur = selectionMeta.focusedKey
    ? all.findIndex(e => selectionKey(e) === selectionMeta.focusedKey)
    : -1;
  const next = Math.max(0, Math.min(all.length - 1, (cur < 0 ? 0 : cur + delta)));
  setFocusedCard(all[next]);
}

function getColumns() {
  const g = document.getElementById('grid');
  if (!g) return 1;
  const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, cols);
}

function navigateGrid(rowDelta, colDelta) {
  const all = Array.from(document.querySelectorAll('#grid .card, #grid .miss'));
  if (!all.length) return;
  const cols = getColumns();
  const cur = selectionMeta.focusedKey
    ? all.findIndex(e => selectionKey(e) === selectionMeta.focusedKey)
    : -1;
  const startIdx = cur < 0 ? 0 : cur;
  const next = Math.max(0, Math.min(all.length - 1, startIdx + rowDelta * cols + colDelta));
  setFocusedCard(all[next]);
  all[next].focus();
  import('./grid.js').then(mod => mod.setRovingTabindex(all[next]));
}

let _chord = '';
let _chordTimer;
function resetChord() { _chord = ''; clearTimeout(_chordTimer); }

function renderForEsc() {
  
  import('./grid.js').then(({ render }) => render());
}

export function installKeyboard() {
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if (e.key === 'Escape') {
      closeModal();
      closeHelp();
      if (selection.size) { clearSelection(); return; }
      if (store.filter.q) {
        document.getElementById('q').value = '';
        store.filter.q = '';
        renderForEsc();
        return;
      }
      if (inField) e.target.blur();
      resetChord();
      return;
    }

    if (inField) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      document.querySelectorAll('.card, .miss').forEach(el => {
        const k = selectionKey(el); if (k) selection.add(k);
      });
      refreshSelectionUI();
      srStatus(selection.size + ' seçili');
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault(); navigateGrid(0, 1); resetChord(); return;
      case 'ArrowLeft':
        e.preventDefault(); navigateGrid(0, -1); resetChord(); return;
      case 'ArrowDown':
        e.preventDefault(); navigateGrid(1, 0); resetChord(); return;
      case 'ArrowUp':
        e.preventDefault(); navigateGrid(-1, 0); resetChord(); return;
      case 'Home': {
        e.preventDefault();
        const allH = Array.from(document.querySelectorAll('#grid .card, #grid .miss'));
        if (allH.length) {
          if (e.ctrlKey) {
            setFocusedCard(allH[0]); allH[0].focus();
          } else {
            const colsH = getColumns();
            const curH = selectionMeta.focusedKey ? allH.findIndex(x => selectionKey(x) === selectionMeta.focusedKey) : 0;
            const rowStart = Math.floor(Math.max(0,curH) / colsH) * colsH;
            setFocusedCard(allH[rowStart]); allH[rowStart].focus();
          }
        }
        resetChord(); return;
      }
      case 'End': {
        e.preventDefault();
        const allE = Array.from(document.querySelectorAll('#grid .card, #grid .miss'));
        if (allE.length) {
          if (e.ctrlKey) {
            setFocusedCard(allE[allE.length - 1]); allE[allE.length - 1].focus();
          } else {
            const colsE = getColumns();
            const curE = selectionMeta.focusedKey ? allE.findIndex(x => selectionKey(x) === selectionMeta.focusedKey) : 0;
            const rowEnd = Math.min(allE.length - 1, Math.floor(Math.max(0,curE) / colsE) * colsE + colsE - 1);
            setFocusedCard(allE[rowEnd]); allE[rowEnd].focus();
          }
        }
        resetChord(); return;
      }
      case '/':
        e.preventDefault();
        document.getElementById('q').focus();
        document.getElementById('q').select();
        resetChord(); return;
      case '?': {
        e.preventDefault();
        const ov = document.getElementById('help-overlay');
        ov.classList.toggle('open');
        resetChord(); return;
      }
      case 'j':
        e.preventDefault(); navigateCards(+1); resetChord(); return;
      case 'k':
        e.preventDefault(); navigateCards(-1); resetChord(); return;
      case 'Enter':
        if (selectionMeta.focusedKey) {
          const el = document.getElementById(selectionMeta.focusedKey);
          if (el?.classList.contains('card')) {
            const txt = el.querySelector('.info .n')?.textContent || '';
            const item = [...store.data.items, ...approvedAsAssets()].find(i => i.name === txt);
            if (item) openModal(item.id);
            e.preventDefault();
          }
        }
        resetChord(); return;
      case 'x':
        if (selectionMeta.focusedKey) {
          const el = document.getElementById(selectionMeta.focusedKey);
          if (el) { toggleSelection(el); e.preventDefault(); }
        }
        resetChord(); return;
      case 't':
        if (selection.size >= 1) {
          e.preventDefault();
          import('./bulk-tags.js').then(m => m.openBulkTagEditor());
        }
        resetChord(); return;
      case 'g':
      case 'd':
        _chord = e.key;
        clearTimeout(_chordTimer);
        _chordTimer = setTimeout(resetChord, 800);
        e.preventDefault();
        return;
    }

    if (_chord === 'g') {
      const map = { h: 'have', t: 'todo', w: 'waiting', d: 'denied' };
      const target = map[e.key];
      if (target) {
        e.preventDefault();
        const btn = document.querySelector(`.tab[data-tab="${target}"]`);
        if (btn && btn.style.display !== 'none') btn.click();
      }
      resetChord();
      return;
    }
    if (_chord === 'd' && e.key === 'd') {
      e.preventDefault();
      if (selection.size) bulkDelete();
      resetChord();
      return;
    }
    resetChord();
  });
}
