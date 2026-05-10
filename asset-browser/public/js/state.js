// Shared mutable application state. Each module imports the named exports it
// needs and mutates them in place — no event bus, no proxies. The split is
// purely organizational: behaviour is identical to the prior monolithic build.
//
// Why a single shared module instead of per-feature stores: the legacy code
// treated everything as window-scoped globals, so the safest refactor is to
// hoist those globals here unchanged and let modules continue to read/write
// them. A future run can introduce reactive boundaries if the surface grows.

export const store = {
  data: { items: [] },
  missing: { items: [] },
  config: null,
  tab: 'have',
  filter: { q: '', cat: '', ext: '', kind: '', type: '' },
  sortMode: localStorage.getItem('sortMode') || 'name',
  // Trash count is updated lazily after first /api/trash probe.
  trashCountCache: 0,
  // 15-second undo of the most recent destructive action.
  lastAction: null,
};

export function setSortMode(v) {
  store.sortMode = v;
  localStorage.setItem('sortMode', v);
}

// --- Selection state for bulk operations.
export const selection = new Set();
// Tracks the most recent click for shift-range selection.
export const selectionMeta = { lastSelectedKey: null, focusedKey: null };

export function clearSelectionState() {
  selection.clear();
  selectionMeta.lastSelectedKey = null;
}
