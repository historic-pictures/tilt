// loadmeter.js - how much of what the game is fetching has arrived, for the loading screen and the "Preparing the lists" note.
// An item is registered with a rough size up front (so the bar does not jump when it starts), then corrected by the loader's own progress events.
const items = new Map();      // id -> { group, loaded, total }

/** Register a download of about `bytes` in `group` ('boot': needed for the menu; 'bg': trees, props, sky in the background). */
export function expect(id, group, bytes) { if (!items.has(id)) items.set(id, { group, loaded: 0, total: bytes }); }
/** A loader's onProgress callback for item `id`. */
export function progress(id, ev) {
  const it = items.get(id); if (!it || !ev) return;
  if (ev.total > 0) it.total = Math.max(ev.total, it.total * 0.5);
  it.loaded = Math.min(ev.loaded || 0, it.total);
}
/** The item has arrived (or failed: either way it no longer holds anything up). */
export function done(id) { const it = items.get(id); if (it) it.loaded = it.total; }
/** { loaded, total, frac } in bytes for a group. */
export function stats(group) {
  let loaded = 0, total = 0;
  for (const it of items.values()) if (it.group === group) { loaded += it.loaded; total += it.total; }
  return { loaded, total, frac: total ? loaded / total : 1 };
}
export const mb = (b) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0);
