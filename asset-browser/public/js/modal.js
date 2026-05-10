// Asset detail modal: focus trap (D-keep), <picture>+AVIF preview.

import { store } from './state.js';
import { fmtSize } from './util.js';
import { t } from './i18n.js';

let _modalLastFocus = null;

function _trapHandler(e) {
  if (e.key !== 'Tab') return;
  const fs = e.currentTarget.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!fs.length) return;
  const first = fs[0], last = fs[fs.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

function trapFocusOn(modalEl) {
  _modalLastFocus = document.activeElement;
  const focusables = modalEl.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length) focusables[0].focus();
  modalEl.addEventListener('keydown', _trapHandler);
}

function trapFocusOff(modalEl) {
  modalEl.removeEventListener('keydown', _trapHandler);
  if (_modalLastFocus && document.body.contains(_modalLastFocus)) _modalLastFocus.focus();
  _modalLastFocus = null;
}

// `approvedAsAssets` is imported lazily via grid.js to avoid a circular import.
import { approvedAsAssets } from './grid.js';

let _modalCleanup = null;

export function openModal(id) {
  if (_modalCleanup) _modalCleanup();
  _modalCleanup = null;
  const i = store.data.items.find(x => x.id === id) || approvedAsAssets().find(x => x.id === id);
  if (!i) return;
  const previewInner = i.avifSrc
    ? `<picture><source type="image/avif" srcset="${i.avifSrc}"><img src="${i.src}"></picture>`
    : `<img src="${i.src}">`;

  document.getElementById('box').innerHTML = `
    <div class="preview">${previewInner}</div>
    <div class="details">
      <h2>${i.name}</h2>
      <div class="row"><span class="k" data-i18n="stats.category">${t('stats.category')}</span><span>${i.category}</span></div>
      <div class="row"><span class="k" data-i18n="stats.type">${t('stats.type')}</span><span>${i.type}</span></div>
      <div class="row"><span class="k" data-i18n="stats.kind">${t('stats.kind')}</span><span>${i.kind}</span></div>
      <div class="row"><span class="k" data-i18n="modal.format">${t('modal.format') || 'Format'}</span><span>${i.ext.toUpperCase()}</span></div>
      <div class="row"><span class="k" data-i18n="modal.dimensions">${t('modal.dimensions') || 'Boyut'}</span><span>${i.dim || '—'}</span></div>
      <div class="row"><span class="k" data-i18n="modal.size">${t('modal.size') || 'Dosya'}</span><span>${fmtSize(i.size)}</span></div>
      <div class="row"><span class="k" data-i18n="modal.filename">${t('modal.filename') || 'Dosya adı'}</span><span style="word-break:break-all;">${i.file}</span></div>
      <div class="row"><span class="k" data-i18n="modal.updated">${t('modal.updated') || 'Güncellenme'}</span><span>${new Date(i.mtime).toLocaleDateString()}</span></div>
      <a class="dl" href="${i.src}" download="${i.file}" data-i18n="actions.download">${t('actions.download')} (${i.ext.toUpperCase()})</a>
    </div>`;
  const modalEl = document.getElementById('modal');
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-label', t('modal.asset_detail_aria_label'));
  modalEl.classList.add('open');
  trapFocusOn(modalEl);

  const [w, h] = (i.dim || '0x0').split('x').map(Number);
  const isSprite = i.frames || i.name.includes('_sheet') || (i.cols && i.rows) || (w > h && w % h === 0 && w / h > 1);
  if (isSprite) {
    import('./sprite-preview.js').then(m => {
      _modalCleanup = m.attachSpritePreview(document.getElementById('box'), i);
    });
  }
}

export function closeModal() {
  if (_modalCleanup) _modalCleanup();
  _modalCleanup = null;
  const modalEl = document.getElementById('modal');
  if (modalEl.classList.contains('open')) trapFocusOff(modalEl);
  modalEl.classList.remove('open');
}

export function showHelp() { document.getElementById('help-overlay').classList.add('open'); }
export function closeHelp() { document.getElementById('help-overlay').classList.remove('open'); }

// Wire up event listeners to replace inline onclick handlers (CSP compliance)
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.querySelector('#modal .close').addEventListener('click', closeModal);
document.getElementById('help-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHelp();
});
document.querySelector('#help-overlay .panel button').addEventListener('click', closeHelp);
