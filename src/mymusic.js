import { touchMode } from './touch.js';
// "Your own music": songs the player adds from their own computer. They live in this browser's IndexedDB only
// (db 'tilt-mymusic'): never uploaded, never sent to an online opponent, never part of the build.
// src/audio.js MusicBus plays them (shuffled, looping) in place of the game's own music while this is on.
const DB = 'tilt-mymusic', STORE = 'tracks', KEY = 'tilt.mymusic';
export const MAX_FILE = 25 * 1024 * 1024, MAX_TOTAL = 300 * 1024 * 1024;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (mode) => (await open()).transaction(STORE, mode).objectStore(STORE);

const listeners = new Set();
const urls = new Map();
let cache = null;       // [{id, name, size, addedAt}] without the blobs

export const mymusic = {
  /** The tracks (no blobs), oldest first. Empty if storage is unavailable. */
  async list() {
    if (cache) return cache;
    try {
      const all = await req((await store('readonly')).getAll());
      cache = all.sort((a, b) => a.addedAt - b.addedAt).map(t => ({ id: t.id, name: t.name, size: t.blob ? t.blob.size : 0, addedAt: t.addedAt }));
    } catch (e) { cache = []; }
    return cache;
  },
  /** Cached list (empty until list() has resolved once). */
  get tracks() { return cache || []; },
  /** Which source plays: 'game' (the game's own music), 'files' (your files) or 'yt' (YouTube links). */
  // Pre-release test builds default to the YouTube "Mates' radio" (the three bardcore tracks, streamed by YouTube's own player, never re-hosted).
  // For the public launch set DEFAULT_SRC back to 'game'.
  get source() { const DEFAULT_SRC = 'yt'; let r = DEFAULT_SRC; try { const v = localStorage.getItem('tilt.musicsrc'); if (v === 'files' || v === 'yt' || v === 'game') r = v; } catch (e) { /* default */ } return r === 'yt' && touchMode ? 'game' : r; },      // YouTube is desktop-only: phones and tablets always get the game's own music
  setSource(v) { v = v === 'files' || (v === 'yt' && !touchMode) ? v : 'game'; try { localStorage.setItem('tilt.musicsrc', v); localStorage.setItem(KEY, v === 'files' ? 'on' : 'off'); } catch (e) { /* ignore */ } this._emit('enabled'); },
  get enabled() { return this.source === 'files'; },
  setEnabled(on) { this.setSource(on ? 'files' : 'game'); },
  /** Add audio files. Returns { added: n, messages: [friendly text] }. */
  async add(files) {
    const msgs = []; let added = 0;
    const cur = await this.list(); let total = cur.reduce((s, t) => s + t.size, 0);
    for (const f of Array.from(files || [])) {
      const nm = f.name || 'song';
      if (!(f.type || '').startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(nm)) { msgs.push(`"${nm}" is not an audio file.`); continue; }
      if (f.size > MAX_FILE) { msgs.push(`"${nm}" is too big (over ${MAX_FILE >> 20} MB).`); continue; }
      if (total + f.size > MAX_TOTAL) { msgs.push(`No room for "${nm}": your songs may total ${MAX_TOTAL >> 20} MB.`); continue; }
      const rec = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: nm.replace(/\.[^./\\]+$/, '').trim() || 'Song', blob: f, addedAt: Date.now() + added };
      try { await req((await store('readwrite')).put(rec)); } catch (e) { msgs.push(`Could not save "${nm}" in this browser.`); continue; }
      cache.push({ id: rec.id, name: rec.name, size: f.size, addedAt: rec.addedAt }); total += f.size; added++;
    }
    if (added) this._emit('list');
    return { added, messages: msgs };
  },
  async remove(id) {
    try { await req((await store('readwrite')).delete(id)); } catch (e) { /* ignore */ }
    this.revoke(id);
    cache = (await this.list()).filter(t => t.id !== id); this._emit('list');
  },
  async clear() {
    try { await req((await store('readwrite')).clear()); } catch (e) { /* ignore */ }
    for (const id of Array.from(urls.keys())) this.revoke(id);
    cache = []; this._emit('list');
  },
  /** An object URL for the track; call revoke(id) when you are done with it. */
  async getUrl(id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await req((await store('readonly')).get(id));
    if (!rec || !rec.blob) return null;
    const u = URL.createObjectURL(rec.blob); urls.set(id, u); return u;
  },
  revoke(id) { const u = urls.get(id); if (u) { urls.delete(id); try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } } },
  /** What the bus is playing now ({id, name} or null); set by audio.js. */
  now: null,
  setNow(t) { this.now = t; this._emit('now'); },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit(kind) { for (const fn of Array.from(listeners)) try { fn(kind); } catch (e) { /* ignore */ } },
};
