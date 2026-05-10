// i18n module: handles locale loading, string interpolation, and DOM updates.
// Supports 'tr' and 'en' locales with fallback to 'tr'.

let _strings = {};
let _currentLang = 'tr';
const _missingKeys = new Set();

export function getLang() {
  return localStorage.getItem('ab.lang') || navigator.language.slice(0, 2) || 'tr';
}

export async function loadLocale(lang) {
  _currentLang = (lang === 'en' || lang === 'tr') ? lang : 'tr';
  try {
    const r = await fetch(`/locales/${_currentLang}.json`);
    if (!r.ok) throw new Error(`Locale load failed: ${r.status}`);
    _strings = await r.json();
  } catch (e) {
    console.error('[i18n] Failed to load locale:', _currentLang, e);
    if (_currentLang !== 'tr') return loadLocale('tr');
  }
}

export function t(key, vars = {}) {
  const parts = key.split('.');
  let val = _strings;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) break;
  }

  if (typeof val !== 'string') {
    if (!_missingKeys.has(key)) {
      console.warn(`[i18n] missing key: ${key}`);
      _missingKeys.add(key);
    }
    return key;
  }

  return val.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
}

export async function setLang(lang) {
  localStorage.setItem('ab.lang', lang);
  await loadLocale(lang);
  document.documentElement.lang = _currentLang;
  applyDom();
  window.dispatchEvent(new CustomEvent('i18n:change', { detail: lang }));
}

export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr;
    const val = t(key);
    
    if (attr) {
      el.setAttribute(attr, val);
    } else {
      el.textContent = val;
    }
  });
}
