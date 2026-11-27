// YouTube music source: the official IFrame Player API (youtube-nocookie.com), the player always visible in a corner box.
// Nothing is downloaded or hosted; the API script is fetched only when this source is first used.
// Lists are kept in localStorage 'tilt.ytlist' (video ids). The default list is "Mates' radio".
const KEY = 'tilt.ytlist';
// Opens with Big Poppa (bardcore); the whole list loops.
export const DEFAULT_IDS = ['BROaC0gtyQs', '_yICA0JNmig', '3okjFDo2aSU', 'L1Uvr5v8IOE', 'dywM446-vcE', 'zg3Ggn3CMgU', 't70UQr_fMgM', 'XbigmX35ICQ', 'kJWvmSJ3k9Q', 'nKGsnHF7PTI', 'AWEwF0PGTmI', 'p8M2TPZG0f4', 'YMnC1SHxct0', 'NOPPcsrsM4M', 'Z83PICHUwSc'];
// Earlier default lists: a saved list equal to one of these was never customised, so it follows the new default.
const OLD_DEFAULTS = [['Z83PICHUwSc', '3okjFDo2aSU', 'dywM446-vcE'], ['3okjFDo2aSU', 'dywM446-vcE', 'Z83PICHUwSc'], ['_yICA0JNmig', '3okjFDo2aSU', 'L1Uvr5v8IOE', 'dywM446-vcE', 'zg3Ggn3CMgU', 't70UQr_fMgM', 'XbigmX35ICQ', 'kJWvmSJ3k9Q', 'nKGsnHF7PTI', 'AWEwF0PGTmI', 'p8M2TPZG0f4', 'YMnC1SHxct0', 'NOPPcsrsM4M', 'Z83PICHUwSc'], ['-tJYN-eG1zk', '_yICA0JNmig', '3okjFDo2aSU', 'L1Uvr5v8IOE', 'dywM446-vcE', 'zg3Ggn3CMgU', 't70UQr_fMgM', 'XbigmX35ICQ', 'kJWvmSJ3k9Q', 'nKGsnHF7PTI', 'AWEwF0PGTmI', 'p8M2TPZG0f4', 'YMnC1SHxct0', 'NOPPcsrsM4M', 'Z83PICHUwSc']].map(a => a.join());
const DUCK = 0.35, MIN = 200, BIG_W = 320, BIG_H = 220, FADE_MS = 1000, CKEY = 'tilt.ytcollapsed';
// YouTube's embedded-player rules: the player stays visible and at least 200x200, so "collapsed" is exactly that size (the bar stays on top of it).

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

/** Draw the next index from a shuffled bag held on `st` (_bag, _bagN): all n songs once each before any repeat, never `cur` again straight away. Exported for the unit test. */
export function bagDraw(st, n, cur, rnd = Math.random) {
  if (!st._bag || !st._bag.length || st._bagN !== n) {
    st._bagN = n; st._bag = Array.from({ length: n }, (_, i) => i).filter(i => i !== cur);
    for (let i = st._bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [st._bag[i], st._bag[j]] = [st._bag[j], st._bag[i]]; }
  }
  let i = st._bag.pop(); if (i === cur && st._bag.length) i = st._bag.pop();
  return i;
}

const listeners = new Set();
export const ytmusic = {
  DEFAULTS: { 'BROaC0gtyQs': 'We Will Rock You (bardcore)', '_yICA0JNmig': 'Big Poppa (bardcore)', '3okjFDo2aSU': 'The Real Slim Shady (bardcore)', 'L1Uvr5v8IOE': 'Still Dre (bardcore)', 'dywM446-vcE': "Gangsta's Paradise (bardcore)", 'zg3Ggn3CMgU': 'Lose Yourself (bardcore)', 't70UQr_fMgM': 'The Next Episode (bardcore)', 'XbigmX35ICQ': 'Blinding Lights (bardcore)', 'kJWvmSJ3k9Q': 'What Is Love (bardcore)', 'nKGsnHF7PTI': 'Hey Ya! (bardcore)', 'AWEwF0PGTmI': 'Land Down Under (medieval)', 'p8M2TPZG0f4': 'Gimme! Gimme! Gimme! (medieval)', 'YMnC1SHxct0': 'Ms. Jackson (bardcore)', 'NOPPcsrsM4M': 'Numb/Encore (bardcore)', 'Z83PICHUwSc': 'Eiffel 65 - Blue (Da Ba Dee)' },
  player: null, box: null, ready: false, idx: 0, note: '', title: '', vol: 0.6, ducked: false, muted: false, wantPlay: false, _failed: 0, held: false, fade: 1, collapsed: false,
  get ids() { try { const j = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(j)) { const a = j.filter(x => /^[\w-]{11}$/.test(x)); return OLD_DEFAULTS.includes(a.join()) ? DEFAULT_IDS.slice() : a; } } catch (e) { /* default */ } return DEFAULT_IDS.slice(); },
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
  _level() { return Math.round(this.vol * 100 * (this.ducked ? DUCK : 1) * this.fade); },
  _apply() { if (!this.player || !this.ready) return; try { this.player.setVolume(this._level()); if (this.vol <= 0 || this.muted) this.player.mute(); else this.player.unMute(); } catch (e) { /* ignore */ } },
  setVolume(v) { this.vol = Math.max(0, Math.min(1, +v || 0)); this._apply(); },
  duck(on) { this.ducked = !!on; this._apply(); },
  setMuted(m) { this.muted = !!m; this._apply(); if (this.player && this.ready) try { if (m) this.player.pauseVideo(); else if (this.wantPlay && !this.held) this.player.playVideo(); } catch (e) { /* ignore */ } },
  /** 'menu' or 'match': which corner the box sits in (CSS decides where). */
  place(where) { this._where = where; if (this.box) this.box.dataset.where = where; },
  get _size() { return this.collapsed ? [MIN, MIN] : [BIG_W, BIG_H]; },
  _ensureBox() {
    if (this.box && this.box.isConnected) return this.box;
    this.collapsed = innerWidth < 1500; try { const c = localStorage.getItem(CKEY); if (c !== null) this.collapsed = c === '1'; } catch (e) { /* default */ }       // small windows start collapsed; the choice is remembered
    const b = this.box = document.createElement('div'); b.id = 'ytbox'; b.dataset.where = this._where || 'menu';
    b.hidden = this.held;
    b.innerHTML = `<div class="ythead"><span id="ytnow">YouTube</span><b data-yt="play" id="ytplay" aria-label="Pause">❚❚</b><b data-yt="next" aria-label="Next">▶▶</b><b data-yt="fold" id="ytfold" aria-label="Collapse">▴</b><b data-yt="stop" aria-label="Switch YouTube music off">✕</b></div><div id="ytnote"></div><div id="ytframe"><div id="ytplayer"></div></div>`;
    b.addEventListener('click', (e) => { const t = e.target.closest('[data-yt]'); if (!t) return; const k = t.dataset.yt; if (k === 'next') this.next(); else if (k === 'play') this.toggle(); else if (k === 'fold') this.setCollapsed(!this.collapsed); else this._emit('stop'); });
    document.body.appendChild(b); document.body.classList.add('ytdock'); this._layout(); return b;
  },
  _layout() {
    const [w, h] = this._size, f = document.getElementById('ytframe'), b = this.box; if (!f || !b) return;
    b.classList.toggle('min', this.collapsed); b.style.width = w + 'px'; f.style.width = w + 'px'; f.style.height = h + 'px';
    const fb = document.getElementById('ytfold'); if (fb) { fb.textContent = this.collapsed ? '▾' : '▴'; fb.setAttribute('aria-label', this.collapsed ? 'Expand' : 'Collapse'); }
    if (this.player && this.ready) try { this.player.setSize(w, h); } catch (e) { /* ignore */ }
  },
  setCollapsed(c) { this.collapsed = !!c; try { localStorage.setItem(CKEY, c ? '1' : '0'); } catch (e) { /* ignore */ } this._layout(); },
  toggle() {
    if (!this.player || !this.ready) return;
    try { const s = this.player.getPlayerState(); if (s === 1 || s === 3) { this.wantPlay = false; this.player.pauseVideo(); } else { this.wantPlay = true; this.player.playVideo(); } } catch (e) { /* ignore */ }
    this._playIcon();
  },
  _playIcon() { const p = document.getElementById('ytplay'); if (!p) return; const on = this.wantPlay; p.textContent = on ? '❚❚' : '▶'; p.setAttribute('aria-label', on ? 'Pause' : 'Play'); },
  /** FIFA-style: music belongs to the menus. on = a match is starting: fade out over 1 s, then pause (not stop) and hide the box. Off = back in the menus: show, play, fade in. */
  hold(on) {
    on = !!on; if (this.held === on) return; this.held = on; clearInterval(this._ft);
    const ramp = (to, done) => { const from = this.fade, t0 = performance.now(); this._ft = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / FADE_MS); this.fade = from + (to - from) * k; this._apply(); if (k >= 1) { clearInterval(this._ft); if (done) done(); } }, 50); };
    if (on) {
      this._savePos();
      if (!this.player || !this.ready) { this.fade = 0; if (this.box) this.box.hidden = true; return; }
      ramp(0, () => { if (!this.held) return; try { this.player.pauseVideo(); } catch (e) { /* ignore */ } if (this.box) this.box.hidden = true; });
    } else {
      if (this.box) this.box.hidden = false;
      if (!this.player || !this.ready) { this.fade = 1; return; }
      this.fade = 0; this._apply();
      if (this.wantPlay && !this.muted) { try { this.player.playVideo(); } catch (e) { /* ignore */ } this._restorePos(); }
      ramp(1);
    }
  },
  /** Remember which video and where, so coming back from a match carries on from the same second of the same track. */
  _savePos() { try { const id = (this.player.getVideoData() || {}).video_id, t = this.player.getCurrentTime(); if (id && t >= 0) this._pos = { id, t }; } catch (e) { /* ignore */ } },
  _restorePos() {
    const p = this._pos; this._pos = null; if (!p || !this.player) return;
    setTimeout(() => { try { const id = (this.player.getVideoData() || {}).video_id; if (id !== p.id && this.ids.includes(p.id)) { this.idx = this.ids.indexOf(p.id); this.player.loadVideoById(p.id, p.t); } else if (Math.abs(this.player.getCurrentTime() - p.t) > 3) this.player.seekTo(p.t, true); } catch (e) { /* ignore */ } }, 600);
  },
  _setNote(t) { this.note = t; clearTimeout(this._nt); if (t) this._nt = setTimeout(() => this._setNote(''), 7000); const n = document.getElementById('ytnote'); if (n) { n.textContent = t; n.style.display = t ? 'block' : 'none'; } },
  _setNow() {
    let d = null; try { d = this.player.getVideoData(); } catch (e) { /* ignore */ }
    this.title = (d && d.title) || ''; const n = document.getElementById('ytnow'); if (n) n.textContent = this.title || 'YouTube'; this._emit('now');
  },
  _load() { try { const id = this.curId; if (id) this.player.loadVideoById(id); } catch (e) { /* ignore */ } },
  // True shuffle (owner, 27 Nov: "I said music should be on shuffle"): a new session opens on a random track, and from then on every track is drawn from a shuffled bag,
  // so every song plays once before any repeats and the same song never plays twice in a row. (Coming back from a match resumes the same song: _restorePos.)
  next() {
    const n = this.ids.length; if (!n) return;
    if (n > 1) this.idx = bagDraw(this, n, this.idx % n);
    this._setNote(''); if (this.ready) this._load();
  },
  /** The session's opening track: random, once per page load (the box's first start), not the head of the list. */
  _openRandom() { if (this._opened) return; this._opened = true; const n = this.ids.length; if (n > 1) this.idx = bagDraw(this, n, -1); },
  /** Show the box and start (or resume) playing. The first call must come from a user gesture. */
  async start() {
    this.wantPlay = true;
    this._ensureBox();
    if (this.held) return;
    if (this.player && this.ready) { this._apply(); try { const s = this.player.getPlayerState(); if (s !== 1 && s !== 3) this.player.playVideo(); } catch (e) { /* ignore */ } return; }
    if (this._starting || this.player) return; this._starting = true;
    this._openRandom();
    try {
      const YT = await loadApi(); if (!this.wantPlay) return;
      this._ensureBox();
      clearTimeout(this._rt); this._rt = setTimeout(() => { if (!this.ready && this.wantPlay) this._fail(); }, 20000);      // the player never became ready: blocked or offline
      this.player = new YT.Player('ytplayer', {
        width: this._size[0], height: this._size[1], videoId: this.curId || undefined, host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, controls: 1, origin: location.origin },
        events: {
          onReady: () => { this.ready = true; this._apply(); this._setNow(); this._layout(); try { if (this.wantPlay && !this.held) this.player.playVideo(); } catch (e) { /* ignore */ } this._emit('ready'); this._watch(); },
          onStateChange: (e) => { if (e.data === 0) { if (!this.held) this.next(); } else if (e.data === 1) { this._failed = 0; clearTimeout(this._wt); this._setNote(''); this._setNow(); this._playIcon(); } else if (e.data === 2) this._playIcon(); },
          onError: (e) => {
            if (this.held) return;      // a pause or hide must never skip a track
            this._setNote(`A video ${[100, 101, 150].includes(e.data) ? 'cannot be played here' : 'did not load'}; skipped.`); this._failed++;
            if (this._failed < this.ids.length) this.next(); else { this._setNote('None of the videos can be played here.'); this._fail(); }
          },
        },
      });
    } catch (e) { this._setNote('YouTube could not be reached.'); this._fail(); }
    finally { this._starting = false; }
  },
  /** Autoplay watchdog: after play is asked for, if nothing is playing within 5 s ask for a click; if a click does not start it either, give up. */
  _watch() {
    clearTimeout(this._wt);
    this._wt = setTimeout(() => {
      if (!this.player || !this.ready || !this.wantPlay || this.held || this.muted || this.fail) return;
      let s = -1; try { s = this.player.getPlayerState(); } catch (e) { /* ignore */ }
      if (s === 1 || s === 3) return;
      if (this._gestured) return this._fail();      // a click did not start it either
      this._setNote('Click anywhere to start the radio.'); clearTimeout(this._nt);
      const go = () => { window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); this._gestured = true; this._setNote(''); try { this.player.playVideo(); } catch (e) { /* ignore */ } this._watch(); };
      window.addEventListener('pointerdown', go, true); window.addEventListener('keydown', go, true);
    }, 5000);
  },
  /** YouTube cannot play here: tell the owner of the source (src/audio.js switches to the game's music for this session). */
  _fail() { if (this.fail) return; this.fail = true; clearTimeout(this._wt); clearTimeout(this._rt); this._emit('fail'); },
  /** After the switch to the game's music (the box is gone): a short note where the dock was. */
  showFallback() {
    let n = document.getElementById('ytfallback'); if (!n) { n = document.createElement('div'); n.id = 'ytfallback'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    n.textContent = "YouTube can't play here — playing the game's music"; clearTimeout(this._ft2); this._ft2 = setTimeout(() => n.remove(), 9000);
  },
  /** Hide the box and stop. */
  stop() {
    this.wantPlay = false; clearTimeout(this._wt); clearTimeout(this._rt); this.fail = false; this._gestured = false;
    if (this.player) { try { this.player.destroy(); } catch (e) { /* ignore */ } this.player = null; this.ready = false; }
    if (this.box) { this.box.remove(); this.box = null; }
    document.body.classList.remove('ytdock'); clearInterval(this._ft); this.fade = 1; this.note = '';
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit(k) { for (const f of Array.from(listeners)) try { f(k); } catch (e) { /* ignore */ } },
};
