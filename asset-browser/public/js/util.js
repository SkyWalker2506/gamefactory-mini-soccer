// Pure helpers — no DOM mutation, no module state.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Convert any string to a CSS-id-safe slug. Lossy: distinct names can collide
// after sanitization; legacy code accepts that and resolves via DOM text.
export function cssEsc(s) {
  return String(s).replace(/[^a-z0-9_-]/gi, '_');
}

export function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return b + 'B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1024 / 1024).toFixed(2) + 'MB';
}

// Toast — fires + auto-dismisses. Stacking is rare enough we don't queue.
export function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderColor = kind === 'err' ? '#c94d4d' : '#d4a849';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}
