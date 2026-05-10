// Smart-search query parser, auto-tag derivation, sort, and saved-filter store.

// Parse query operators (cat:, kind:, type:, status:, tag:, ext:, dim:) +
// free text. Supports negation with `!cat:fx` and OR with `cat:building|wall`.
// Free text matches name (substring, case-insensitive).
export function parseSmartQuery(q) {
  const out = { free: [], filters: [] };
  if (!q) return out;
  const re = /(!)?(cat|kind|type|status|tag|ext|dim):(\S+)/gi;
  let lastIdx = 0, m;
  while ((m = re.exec(q)) !== null) {
    if (m.index > lastIdx) out.free.push(q.slice(lastIdx, m.index));
    out.filters.push({
      key: m[2].toLowerCase(),
      values: m[3].toLowerCase().split('|').filter(Boolean),
      negate: !!m[1],
    });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < q.length) out.free.push(q.slice(lastIdx));
  out.freeText = out.free.join(' ').trim().toLowerCase();
  return out;
}

// Derive tags from filename + dim heuristics + manual tags.
export function autoTags(item) {
  const tags = new Set(item.tags || []);
  const name = (item.name || '').toLowerCase();
  const file = (item.file || item.uploadedFile || '').toLowerCase();
  const dim = item.dim || '';
  // Frame count from name pattern (e.g. hero_walk_8f.png → 8frame)
  const fr = (name.match(/_(\d+)f/i) || [])[1];
  if (fr) tags.add(`${fr}frame`);
  // Dimension class
  if (dim) {
    const m = dim.match(/^(\d+)x(\d+)$/);
    if (m) {
      const w = +m[1], h = +m[2], max = Math.max(w, h);
      if (max >= 2048) tags.add('xl');
      else if (max >= 1024) tags.add('hd');
      else if (max >= 512) tags.add('md');
      else tags.add('sm');
      if (w === h) tags.add('square');
      else if (w > h) tags.add('wide');
      else tags.add('tall');
    }
  }
  // Common semantic patterns from filename tokens
  if (/idle|stand/.test(name)) tags.add('idle');
  if (/walk|run|move/.test(name)) tags.add('locomotion');
  if (/atk|attack|hit/.test(name)) tags.add('combat');
  if (/death|die/.test(name)) tags.add('death');
  if (/icon/.test(name)) tags.add('icon');
  if (/bg|background/.test(name)) tags.add('background');
  if (/ui|button|panel/.test(name)) tags.add('ui');
  if (/tile/.test(name)) tags.add('tile');
  // Format
  const ext = (item.ext || file.split('.').pop() || '').toLowerCase();
  if (ext) tags.add(ext);
  return [...tags];
}

export function matchesSmartQuery(item, parsed) {
  if (parsed.freeText && !(item.name || '').toLowerCase().includes(parsed.freeText)) return false;
  for (const f of parsed.filters) {
    let val;
    if (f.key === 'tag') {
      const tags = autoTags(item);
      const hit = f.values.some(v => tags.includes(v));
      if (f.negate ? hit : !hit) return false;
    } else {
      switch (f.key) {
        case 'cat': val = (item.category || '').toLowerCase(); break;
        case 'kind': val = (item.kind || '').toLowerCase(); break;
        case 'type': val = (item.type || '').toLowerCase(); break;
        case 'status': val = (item.status || '').toLowerCase(); break;
        case 'ext': val = (item.ext || '').toLowerCase(); break;
        case 'dim': val = (item.dim || '').toLowerCase(); break;
        default: continue;
      }
      const hit = f.values.includes(val);
      if (f.negate ? hit : !hit) return false;
    }
  }
  return true;
}

// Sort by user-selected mode. Stable on tie via Array.prototype.sort spec.
export function applySort(items, sortMode) {
  const dimVal = (d) => {
    const m = (d || '').match(/^(\d+)x(\d+)$/);
    return m ? +m[1] * +m[2] : 0;
  };
  const cmpMap = {
    'name': (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    'size': (a, b) => (a.size || 0) - (b.size || 0),
    'size-desc': (a, b) => (b.size || 0) - (a.size || 0),
    'dim-desc': (a, b) => dimVal(b.dim) - dimVal(a.dim),
    'date': (a, b) => new Date(a.mtime || 0) - new Date(b.mtime || 0),
    'date-desc': (a, b) => new Date(b.mtime || 0) - new Date(a.mtime || 0),
  };
  const cmp = cmpMap[sortMode] || cmpMap.name;
  return [...items].sort(cmp);
}

// --- Saved filters: persist filter+query combos in localStorage.
const SAVED_KEY = 'savedFilters_v1';

export function getSavedFilters() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export function saveSavedFilters(arr) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(arr.slice(0, 30)));
}
