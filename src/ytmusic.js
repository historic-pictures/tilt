// YouTube music source: the official IFrame Player API (youtube-nocookie.com), the player always visible in a corner box.
// Nothing is downloaded or hosted; the API script is fetched only when this source is first used.
// Lists are kept in localStorage 'tilt.ytlist' (video ids). The default list is "Mates' radio".
const KEY = 'tilt.ytlist';
export const DEFAULT_IDS = ['Z83PICHUwSc', '3okjFDo2aSU', 'dywM446-vcE'];
const DUCK = 0.35, SIZE = 200;

/** Video id from a watch URL, youtu.be link, shorts/embed link (a &list= or ?si= is ignored) or a bare id. */
export function parseId(s) {
  s = String(s || '').trim(); if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
  const h = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.split('/')[1];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1];
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

let apiP = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiP) return apiP;
  apiP = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) { /* ignore */ } res(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { apiP = null; rej(new Error('YouTube unreachable')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { apiP = null; rej(new Error('YouTube timed out')); } }, 15000);
  });
  return apiP;
}

const listeners = new Set();
export const ytmusic = {
  DEFAULTS: { Z83PICHUwSc: 'Eiffel 65 - Blue', '3okjFDo2aSU': 'Real Slim Shady (bardcore)', 'dywM446-vcE': "Gangsta's Paradise (bardcore)" },
  player: null, box: null, ready: false, idx: 0, note: '', title: '', vol: 0.6, ducked: false, muted: false, wantPlay: false, _failed: 0,
  get ids() { try { const j = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(j)) return j.filter(x => /^[\w-]{11}$/.test(x)); } catch (e) { /* default */ } return DEFAULT_IDS.slice(); },
  _save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } this._emit('list'); },
  add(text) {
    const id = parseId(text); if (!id) return { ok: false, msg: 'That is not a YouTube link.' };
    const a = this.ids; if (a.includes(id)) return { ok: false, msg: 'Already in the list.' };
    a.push(id); this._save(a); return { ok: true, id };
  },
  remove(id) {
    const a = this.ids, i = a.indexOf(id); if (i < 0) return;
    const wasCur = this.curId === id; a.splice(i, 1); this._save(a);
    if (i < this.idx) this.idx--;
    if (wasCur && this.player && this.ready) { if (a.length) { this.idx = i % a.length; this._load(); } else { try { this.player.stopVideo(); } catch (e) { /* ignore */ } } }
  },
  resetList() { this._save(DEFAULT_IDS.slice()); },
  get curId() { return this.ids[this.idx % Math.max(1, this.ids.length)] || null; },
  _level() { return Math.round(this.vol * 100 * (this.ducked ? DUCK : 1)); },
  _apply() { if (!this.player || !this.ready) return; try { this.player.setVolume(this._level()); if (this.vol <= 0 || this.muted) this.player.mute(); else this.player.unMute(); } catch (e) { /* ignore */ } },
  setVolume(v) { this.vol = Math.max(0, Math.min(1, +v || 0)); this._apply(); },
  duck(on) { this.ducked = !!on; this._apply(); },
  setMuted(m) { this.muted = !!m; this._apply(); if (this.player && this.ready) try { if (m) this.player.pauseVideo(); else if (this.wantPlay) this.player.playVideo(); } catch (e) { /* ignore */ } },
  /** 'menu' or 'match': which corner the box sits in (CSS decides where). */
  place(where) { this._where = where; if (this.box) this.box.dataset.where = where; },
  _ensureBox() {
    if (this.box && this.box.isConnected) return this.box;
    const b = this.box = document.createElement('div'); b.id = 'ytbox'; b.dataset.where = this._where || 'menu';
    b.innerHTML = `<div class="ythead"><span id="ytnow">YouTube</span><b data-yt="next" title="Next">Next ▸</b><b data-yt="stop" title="Stop YouTube music">✕</b></div><div id="ytnote"></div><div id="ytframe" style="width:${SIZE}px;height:${SIZE}px"><div id="ytplayer"></div></div>`;
    b.addEventListener('click', (e) => { const t = e.target.closest('[data-yt]'); if (!t) return; if (t.dataset.yt === 'next') this.next(); else this._emit('stop'); });
    document.body.appendChild(b); return b;
  },
  _setNote(t) { this.note = t; clearTimeout(this._nt); if (t) this._nt = setTimeout(() => this._setNote(''), 7000); const n = document.getElementById('ytnote'); if (n) { n.textContent = t; n.style.display = t ? 'block' : 'none'; } },
  _setNow() {
    let d = null; try { d = this.player.getVideoData(); } catch (e) { /* ignore */ }
    this.title = (d && d.title) || ''; const n = document.getElementById('ytnow'); if (n) n.textContent = this.title || 'YouTube'; this._emit('now');
  },
  _load() { try { const id = this.curId; if (id) this.player.loadVideoById(id); } catch (e) { /* ignore */ } },
  next() { const n = this.ids.length; if (!n) return; this.idx = (this.idx + 1) % n; this._setNote(''); if (this.ready) this._load(); },
  /** Show the box and start (or resume) playing. The first call must come from a user gesture. */
  async start() {
    this.wantPlay = true;
    this._ensureBox();
    if (this.player && this.ready) { this._apply(); try { const s = this.player.getPlayerState(); if (s !== 1 && s !== 3) this.player.playVideo(); } catch (e) { /* ignore */ } return; }
    if (this._starting || this.player) return; this._starting = true;
    try {
      const YT = await loadApi(); if (!this.wantPlay) return;
      this._ensureBox();
      this.player = new YT.Player('ytplayer', {
        width: SIZE, height: SIZE, videoId: this.curId || undefined, host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, controls: 1, origin: location.origin },
        events: {
          onReady: () => { this.ready = true; this._apply(); this._setNow(); try { if (this.wantPlay) this.player.playVideo(); } catch (e) { /* ignore */ } this._emit('ready'); },
          onStateChange: (e) => { if (e.data === 0) this.next(); else if (e.data === 1) { this._failed = 0; this._setNow(); } },
          onError: (e) => {
            this._setNote(`A video ${[100, 101, 150].includes(e.data) ? 'cannot be played here' : 'did not load'}; skipped.`); this._failed++;
            if (this._failed < this.ids.length) this.next(); else this._setNote('None of the videos can be played here.');
          },
        },
      });
    } catch (e) { this._setNote('YouTube could not be reached.'); }
    finally { this._starting = false; }
  },
  /** Hide the box and stop. */
  stop() {
    this.wantPlay = false;
    if (this.player) { try { this.player.destroy(); } catch (e) { /* ignore */ } this.player = null; this.ready = false; }
    if (this.box) { this.box.remove(); this.box = null; }
    this.note = '';
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit(k) { for (const f of Array.from(listeners)) try { f(k); } catch (e) { /* ignore */ } },
};
