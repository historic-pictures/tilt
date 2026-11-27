// Joust Revival sound engine — sample-based, mixed on the same rules as the Scene Viewer's sfx.mjs:
//   * every voice gets its level from a per-category attenuation curve (dB against metres) with a hard cut-off,
//   * far sounds are duller (low-pass by distance) and wetter (reverb send rises with distance),
//   * stereo spread narrows with distance,
//   * each stem has a voice cap and drops its farthest voice first,
//   * samples are sequenced (never the same one twice running) with random pitch / volume per play,
//   * stems -> one master gain -> limiter with its ceiling near -1 dBFS.
// Samples come from sfx/manifest.json (built by tools/build_sfx.py). Anything missing is simply silent.

// Sound pack A/B: localStorage 'tilt.sfx' = 'new' -> sfx_free/manifest.json, anything else -> sfx/manifest.json.
// tools/build_public.py rewrites the two constants below for the public build (it only ships the new pack).
const SFX_DEFAULT = 'new';      // the royalty-free pack by default; the old Total War pack only if chosen on the menu
export const SFX_HAS_OLD = false;
export function sfxPack() {
  if (!SFX_HAS_OLD) return 'new';
  try { const v = localStorage.getItem('tilt.sfx'); return v === null ? SFX_DEFAULT : (v === 'new' ? 'new' : 'old'); } catch (e) { return SFX_DEFAULT; }
}
export function setSfxPack(v) { try { localStorage.setItem('tilt.sfx', v === 'new' ? 'new' : 'old'); } catch (e) { /* ignore */ } }

import { mymusic } from './mymusic.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const lin = (db) => (db <= -90 ? 0 : Math.pow(10, db / 20));
const lpfHz = (v) => (v <= 0.5 ? 20000 : Math.max(260, 20000 * Math.pow(10, -v / 55)));
function curveAt(pts, x) {
  if (!pts || !pts.length) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1e-6, b[0] - a[0]); }
  return pts[pts.length - 1][1];
}

// Stem trims (dB) and voice caps. Tune levels here, not per call.
const STEMS = {
  hoof:   { db: 4, cap: 12 },
  impact: { db: 4.5, cap: 12 },
  horse:  { db: 8, cap: 4 },
  crowd:  { db: 5, cap: 56 },
  air:    { db: 0, cap: 8 },
  music:  { db: 0, cap: 3 },
  ui:     { db: -14, cap: 4 },
  voice:  { db: 2, cap: 6 },      // recorded voice clips (src/voice_clips.js): the booth, the squire, the stands' shouts
};
const MASTER_DB = -9;
/** The menu joust's whole effects bus (crowd bed, hooves, cheers, lance impacts) sits this far under a match's level, so the menu music stays on top. */
const MENU_MIX_DB = -9;
// Used when a category carries no curve of its own.
const DEFAULT_ATT = { max: 90, vol: [[0, 0], [2, 0], [5, -4], [10, -9], [20, -15], [40, -22], [70, -30], [90, -42]], lpf: [[0, 0], [8, 6], [25, 24], [60, 44], [90, 58]] };
// The crowd IS the loud thing in the lists: distance only dulls and widens it, it barely quietens it.
const CROWD_ATT = { max: 140, vol: [[0, 0], [15, 0], [40, -5], [140, -12]], lpf: [[0, 0], [15, 6], [40, 18], [140, 30]] };
const HOOF_ATT = { max: 45, vol: [[0, 0], [1.5, 0], [4, -4], [8, -10], [14, -17], [25, -26], [45, -40]], lpf: [[0, 0], [6, 10], [20, 30], [45, 55]] };

// ---------------------------------------------------------------- music
// Streams assets/music/*.mp3 through HTMLAudioElement -> MediaElementAudioSourceNode -> music gain -> master (so mute and the limiter apply).
// The manifest is optional: with no manifest or no file for a mood, nothing plays.
const MUSIC_DB = -14, MUSIC_DEFAULT = 0.6, MUSIC_DUCK_DB = -8, MUSIC_FADE = 2;
class MusicBus {
  constructor(ga) {
    this.ga = ga; this.vol = MUSIC_DEFAULT; this.off = false; this.ducked = false; this.gain = null; this.tracks = null; this._man = null;
    this.want = null; this.mood = null; this.cur = null; this.last = null;
    this.yt = null; this._where = 'menu'; this._ytLoad = null; this.held = false;
    this.queue = []; this._tok = 0;      // "your own music": shuffled playlist of the player's tracks (src/mymusic.js)
  }
  /** True while the player's own songs replace the game's music. */
  get mine() { return mymusic.source === 'files' && mymusic.tracks.length > 0; }
  /** YouTube source (src/ytmusic.js, loaded only when used): the game's own music stays silent while it plays. */
  async _yt(go = true) {
    if (!this.yt) {
      this._ytLoad = this._ytLoad || import('./ytmusic.js').then(m => { this.yt = m.ytmusic; this.yt.on((k) => { if (k === 'stop') { mymusic.setSource('game'); this.refreshMine(); } else if (k === 'fail') { mymusic.ytFailed = true; this.refreshMine().then(() => this.yt.showFallback()); } }); });
      try { await this._ytLoad; } catch (e) { return; }
    }
    const y = this.yt; y.setVolume(this.vol); y.duck(this.ducked); y.muted = !!(this.ga.muted || this.off); y.place(this._where); y.held = this.held;
    if (go && mymusic.source === 'yt' && !this.off) y.start();
  }
  /** Which corner the YouTube box sits in: 'menu' or 'match'. */
  place(w) { this._where = w; if (this.yt) this.yt.place(w); }
  /** FIFA-style: true while a match or training runs (the music fades out over 1 s and waits), false back in the menus (it fades in again). The YouTube player is paused, not stopped. */
  hold(on) {
    on = !!on; if (this.held === on) return; this.held = on;
    if (this.yt) this.yt.hold(on);
    if (on) { this._tok++; if (this.cur) { this._fadeOut(1); this.cur = null; this.mood = null; mymusic.setNow(null); } }
    else if (this.want) this.play(this.want);
  }
  /** The pause menu in a match: the game's own music (never YouTube or the player's files) fades in on a plain audio element, since pausing suspends the audio context; it fades out on resume. */
  async pauseMusic(on) {
    on = !!on; if (on === !!this._pmOn) return; this._pmOn = on; const tok = this._pmTok = (this._pmTok || 0) + 1;
    if (on && this.yt && mymusic.source === 'yt' && !this.off) { this._pmYt = true; this.yt.hold(false); return; }      // YouTube radio: it simply carries on in the pause menu (owner 27 Nov: it loads fast enough)
    if (!on && this._pmYt) { this._pmYt = false; if (this.yt) this.yt.hold(this.held); return; }
    if (!on) { this._pmRamp(this._pmEl, 0, 800, true); this._pmEl = null; return; }
    if (this.vol <= 0 || this.off) return;
    const tracks = this.tracks || await this.load(); if (tok !== this._pmTok || !tracks.length) return;
    const pool = tracks.filter(t => (t.moods || []).includes('menu')), all = pool.length ? pool : tracks, others = all.filter(t => t.id !== this._pmLast), t = (others.length ? others : all)[(Math.random() * (others.length || all.length)) | 0];
    const el = new Audio(t.file); el.preload = 'auto'; el.volume = 0; this._pmEl = el; this._pmLast = t.id;
    el.addEventListener('ended', () => { if (this._pmEl === el) { this._pmOn = false; this.pauseMusic(true); } });
    const p = el.play(); if (p && p.catch) p.catch(() => {});
    this._pmRamp(el, Math.min(1, this._level() * lin(t.db || 0) * lin(MASTER_DB)), 1500);
  }
  _pmRamp(el, to, ms, end) {
    if (!el) return; clearInterval(el._ramp); const from = el.volume, t0 = performance.now();
    el._ramp = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ms); try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) { /* ignore */ } if (k >= 1) { clearInterval(el._ramp); if (end) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* ignore */ } } } }, 50);
  }
  get playing() { return !!this.cur; }
  _level() { return lin(MUSIC_DB) * (this.vol / MUSIC_DEFAULT) * (this.ducked ? lin(MUSIC_DUCK_DB) : 1); }
  _attach() { const ga = this.ga; if (this.gain || !ga.ctx) return; this.gain = ga.ctx.createGain(); this.gain.gain.value = this._level(); this.gain.connect(ga.master); if (this.want) this.play(this.want); }
  /** The track list (empty if the manifest is missing). */
  load() {
    if (!this._man) this._man = fetch('assets/music/manifest.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => { this.tracks = (j && Array.isArray(j.tracks) ? j.tracks : []).filter(t => t && t.file); return this.tracks; }).catch(() => (this.tracks = []));
    return this._man;
  }
  setVolume(v) {
    this.vol = clamp(+v || 0, 0, 1);
    if (this.yt) this.yt.setVolume(this.vol);
    if (this.vol <= 0) { this._tok++; this._fadeOut(1); this.cur = null; this.mood = null; mymusic.setNow(null); return; }
    if (this.gain) this.gain.gain.setTargetAtTime(this._level(), this.ga.ctx.currentTime, 0.1);
    if (!this.cur && this.want) this.play(this.want);
  }
  duck(on) {
    this.ducked = !!on;
    if (this.yt) this.yt.duck(this.ducked);
    if (this.gain) try { this.gain.gain.setTargetAtTime(this._level(), this.ga.ctx.currentTime, 0.5); } catch (e) { /* ignore */ }
  }
  /** Play a random track of this mood (never the one just played); a track already playing for that mood is left alone. */
  async play(mood) {
    this.want = mood;
    if (this.held) return;      // a match is on: the music belongs to the menus
    const ga = this.ga; if (!ga.ctx || !this.gain || ga.muted || this.off || this.vol <= 0) return;
    if (mymusic.source === 'yt') { this._yt(true); return; }
    if (mymusic.source === 'files') { await mymusic.list(); if (this.want !== mood) return; }
    if (this.mine) { if (!this.cur || !this.cur.mine) this._startMine(); return; }
    if (this.cur && this.cur.mine) { this._dropMine(); }
    const tracks = this.tracks || await this.load(); if (this.want !== mood || !tracks.length) return;
    let pool = tracks.filter(t => (t.moods || []).includes(mood)), eff = mood;
    if (!pool.length) { pool = tracks.filter(t => (t.moods || []).includes('menu')); eff = 'menu'; }
    if (!pool.length) return;
    if (this.cur && this.mood === eff) return;
    this._start(pool, eff);
  }
  _start(pool, eff) {
    const ctx = this.ga.ctx, others = pool.filter(t => t.id !== this.last), t = (others.length ? others : pool)[(Math.random() * (others.length || pool.length)) | 0];
    try {
      const el = new Audio(t.file); el.preload = 'auto'; el.loop = false;
      const src = ctx.createMediaElementSource(el), g = ctx.createGain(), now = ctx.currentTime;
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(lin(t.db || 0), now + MUSIC_FADE);
      src.connect(g); g.connect(this.gain);
      const rec = { el, src, g, t };
      el.addEventListener('ended', () => { if (this.cur === rec) { this.cur = null; this.mood = null; this.play(this.want); } });
      el.addEventListener('error', () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* gone */ } if (this.cur === rec) { this.cur = null; this.mood = null; } });
      const p = el.play(); if (p && p.catch) p.catch(() => { if (this.cur === rec) { this.cur = null; this.mood = null; } });
      this._fadeOut(MUSIC_FADE);
      this.cur = rec; this.last = t.id; this.mood = eff;
    } catch (e) { /* music is optional */ }
  }
  /** Next song of the player's playlist: shuffled, none repeats until all have played. */
  async _startMine() {
    const tok = ++this._tok, ctx = this.ga.ctx; if (!ctx || !this.gain) return;
    const all = mymusic.tracks; if (!all.length) return;
    this.queue = this.queue.filter(id => all.some(t => t.id === id));
    if (!this.queue.length) {
      const ids = all.map(t => t.id); for (let i = ids.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
      if (ids.length > 1 && ids[0] === this.last) ids.push(ids.shift());
      this.queue = ids;
    }
    const id = this.queue.shift(), t = all.find(x => x.id === id);
    let url = null; try { url = await mymusic.getUrl(id); } catch (e) { /* unreadable */ }
    if (tok !== this._tok || !this.mine || !this.gain) { mymusic.revoke(id); return; }
    if (!url) { if (all.length > 1) this._startMine(); return; }
    try {
      const el = new Audio(url); el.preload = 'auto'; el.loop = false;
      const src = ctx.createMediaElementSource(el), g = ctx.createGain(), now = ctx.currentTime;
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + MUSIC_FADE);
      src.connect(g); g.connect(this.gain);
      const rec = { el, src, g, t: { id }, mine: id };
      el.addEventListener('ended', () => { if (this.cur === rec) { this.cur = null; mymusic.setNow(null); this._startMine(); } });
      el.addEventListener('error', () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* gone */ } mymusic.revoke(id); if (this.cur === rec) { this.cur = null; this.mood = null; mymusic.setNow(null); if (this.mine && this.queue.length) this._startMine(); } });
      const p = el.play(); if (p && p.catch) p.catch(() => { if (this.cur === rec) { this.cur = null; mymusic.setNow(null); } });
      this._fadeOut(MUSIC_FADE);
      this.cur = rec; this.last = id; this.mood = 'mine'; mymusic.setNow({ id, name: t ? t.name : '' });
    } catch (e) { /* music is optional */ }
  }
  /** Skip to the next of the player's songs. */
  next() { if (mymusic.source === 'yt') { if (this.yt) this.yt.next(); return; } if (this.mine && this.ga.ctx && this.vol > 0 && !this.ga.muted && !this.off) this._startMine(); }
  _dropMine() { this._fadeOut(MUSIC_FADE); this.cur = null; this.mood = null; mymusic.setNow(null); }
  /** The on/off switch or the list changed: swap between the player's songs and the game's own music. */
  async refreshMine() {
    if (mymusic.source === 'yt') { if (this.cur) { this._fadeOut(MUSIC_FADE); this.cur = null; this.mood = null; mymusic.setNow(null); } this._tok++; this._yt(true); return; }
    if (this.yt && this.yt.wantPlay) this.yt.stop();
    await mymusic.list();
    const on = this.mine;
    if (on && this.cur && this.cur.mine && !mymusic.tracks.some(t => t.id === this.cur.mine)) { this._dropMine(); }
    if (!on && this.cur && this.cur.mine) this._dropMine();
    if (on && this.cur && !this.cur.mine) { this._fadeOut(MUSIC_FADE); this.cur = null; this.mood = null; }
    this.queue = this.queue.filter(id => mymusic.tracks.some(t => t.id === id));
    if (!this.cur && this.want) this.play(this.want);
  }
  _fadeOut(sec) {
    const rec = this.cur; if (!rec || !this.ga.ctx) return;
    if (rec.mine) setTimeout(() => mymusic.revoke(rec.mine), sec * 1000 + 150);
    const ctx = this.ga.ctx, now = ctx.currentTime;
    try { rec.g.gain.cancelScheduledValues(now); rec.g.gain.setValueAtTime(rec.g.gain.value, now); rec.g.gain.linearRampToValueAtTime(0, now + sec); } catch (e) { /* ignore */ }
    setTimeout(() => { try { rec.el.pause(); rec.src.disconnect(); rec.g.disconnect(); } catch (e) { /* gone */ } }, sec * 1000 + 100);
  }
  stop(fadeSec = 1.5) { this.want = null; this._tok++; this._fadeOut(fadeSec); this.cur = null; this.mood = null; mymusic.setNow(null); }
  /** The music-only switch (the Music button): silences the game's music, the player's own songs and the YouTube player, and leaves every other sound alone. */
  setOff(off) { this.off = !!off; this.setMuted(!!(this.off || this.ga.muted)); }
  /** Mute pauses the stream, unmute carries on (or starts what was wanted). */
  setMuted(m) {
    if (this.yt) this.yt.setMuted(m);
    if (m) { if (this.cur) try { this.cur.el.pause(); } catch (e) { /* ignore */ } return; }
    if (this.cur) { try { const p = this.cur.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    else if (this.want) this.play(this.want);
  }
}

export class GameAudio {
  constructor() {
    this.music = new MusicBus(this);
    this.ctx = null; this._ready = false; this.muted = false; this.ts = 1; this.r = 1; this._menuMix = false;
    this.cat = {}; this.stem = {}; this.voices = {}; this.beds = {}; this.loaded = Promise.resolve(false);
    this._t = { breath: 1, idle: 5, bird: 6 }; this._hold = 0; this._lone = false; this._duck = { db: 0, hold: 0, now: 0 }; this.venue = null; this.manifestUrl = sfxPack() === 'new' ? 'sfx_free/manifest.json' : 'sfx/manifest.json';
  }
  get ready() { return this._ready; }

  init() {
    if (this._ready) return;
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      const ctx = this.ctx = new AC();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
      // master: stems -> slow-motion low-pass -> master gain -> limiter -> out
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3; this.limiter.knee.value = 2; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15;
      this.limiter.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : lin(MASTER_DB); this.master.connect(this.limiter);
      this.slowLP = ctx.createBiquadFilter(); this.slowLP.type = 'lowpass'; this.slowLP.frequency.value = 20000; this.slowLP.Q.value = 0.5; this.slowLP.connect(this.master);
      // sfxBus: every effect stem and the reverb return pass through it, so the menu joust can sit under the music with one fader (setMenuMix). The music and the UI blips bypass it.
      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this._menuMix ? lin(MENU_MIX_DB) : 1; this.sfxBus.connect(this.slowLP);
      for (const k in STEMS) { const g = ctx.createGain(); g.gain.value = lin(STEMS[k].db); g.connect(k === 'ui' ? this.slowLP : this.sfxBus); this.stem[k] = g; this.voices[k] = []; }
      // open-air reverb: short, dark, mostly for distance
      this.revIn = ctx.createGain();
      const conv = ctx.createConvolver(); conv.buffer = this._impulse(1.6);
      const revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 3200;
      const revOut = ctx.createGain(); revOut.gain.value = 0.5;
      this.revIn.connect(conv); conv.connect(revLP); revLP.connect(revOut); revOut.connect(this.sfxBus);
      this._ready = true;
      this.music._attach();
      this.loaded = this._load().then(() => { this._startBeds(); this._loadVoiceBeds(); return true; }).catch(() => false);
    } catch (e) { this.ctx = null; this._ready = false; }
  }


  /** Recorded crowd beds (assets/audio/voice/manifest.json "beds", made with ElevenLabs Sound Effects, tools/voice/gen_voices.py): joined to the sample categories above
   *  (crowd_gasp, crowd_groan, cheer_group, crowd_applause, crowd_chant_bed, crowd_charge, crowd_murmur). Optional: no manifest, no beds, everything else is unchanged. */
  async _loadVoiceBeds() {
    try {
      const r = await fetch('assets/audio/voice/manifest.json'); if (!r.ok) return;
      const man = await r.json(), beds = man.beds || {};
      await Promise.all(Object.keys(beds).map(async (id) => {
        const b = beds[id]; if (!b.cat) return;
        try {
          const buf = await this.ctx.decodeAudioData(await (await fetch('assets/audio/voice/' + b.f)).arrayBuffer());
          const e = this.cat[b.cat] || (this.cat[b.cat] = { buffers: [], db: 0, vr: [-2, 0], pr: [-60, 60], att: null, loop: false, seq: 0 });
          e.buffers.push({ buf, db: b.db || 0, s: buf.duration }); e.buffers.sort((x, y) => x.s - y.s);
        } catch (err) { /* a bed that will not decode is skipped */ }
      }));
      const m = this.cat.crowd_murmur, bed = this.beds.crowd;      // the recorded idle murmur joins the looping crowd bed as a fourth layer
      if (m && m.buffers.length && bed) { const src = this.ctx.createBufferSource(); src.buffer = m.buffers[0].buf; src.loop = true; src.playbackRate.value = this.r; src._k = 1; const fg = this.ctx.createGain(); fg.gain.value = lin(-7 + m.buffers[0].db); src.connect(fg); fg.connect(bed.g); src.start(0, rand(0, 4)); bed.srcs.push(src); }
    } catch (e) { /* no voice beds */ }
  }
  /** Play a decoded voice clip on the voice stem. o: { db, pan -1..1, dist (m: dulls it), onend }. Returns { stop(), dur } or null. */
  playVoice(buf, o = {}) {
    if (!this.ctx || !buf || this.muted) return null;
    const ctx = this.ctx, dist = Math.max(0, o.dist || 0), list = this.voices.voice;
    if (list.length >= STEMS.voice.cap) { const old = list.shift(); try { old.src.stop(); } catch (e) { /* done */ } }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = lpfHz(dist > 0 ? Math.min(40, dist * 0.9) : 0);
    const g = ctx.createGain(); g.gain.value = lin((o.db || 0) - (dist > 0 ? Math.min(14, dist * 0.35) : 0));
    src.connect(lp); lp.connect(g); let out = g;
    if (ctx.createStereoPanner && o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -0.9, 0.9); g.connect(p); out = p; }
    out.connect(this.stem.voice);
    const v = { src, g, dist }; list.push(v);
    src.onended = () => { const k = list.indexOf(v); if (k >= 0) list.splice(k, 1); try { src.disconnect(); } catch (e) { /* gone */ } if (o.onend) o.onend(); };
    src.start();
    return { dur: buf.duration, stop: () => { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); src.stop(ctx.currentTime + 0.12); } catch (e) { /* already stopped */ } } };
  }
  /** Keep the crowd (and the venue air) a little under a commentary line: db < 0 ducks, 0 releases. */
  duckUnderVoice(db) {
    if (!this.ctx) return;
    this._run(() => { const t = this.ctx.currentTime; for (const k of ['crowd', 'air']) if (this.stem[k]) this.stem[k].gain.setTargetAtTime(lin(STEMS[k].db + db), t, db < 0 ? 0.08 : 0.5); });
  }

  _impulse(sec) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * sec), b = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.35; d[i] = lp * Math.pow(1 - i / n, 3.2) * (i < 400 ? i / 400 : 1); } }
    return b;
  }

  async _load() {
    const res = await fetch(this.manifestUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error('no sound pack');
    const man = await res.json();
    const jobs = [];
    for (const name in man.categories) {
      const c = man.categories[name];
      const entry = this.cat[name] = { buffers: [], db: c.db ?? 0, vr: c.vr || [-2, 0], pr: c.pr || [-120, 90], att: c.att || null, loop: !!c.loop, seq: (Math.random() * 8) | 0 };
      for (const f of c.files) jobs.push(fetch(f.f).then(r => r.arrayBuffer()).then(ab => this.ctx.decodeAudioData(ab)).then(buf => { entry.buffers.push({ buf, db: f.db || 0, s: buf.duration }); }).catch(() => {}));
    }
    await Promise.all(jobs);
    for (const k in this.cat) this.cat[k].buffers.sort((a, b) => a.s - b.s);
  }

  // ---------------------------------------------------------------- one voice
  /** Play one sample from a category. o: { stem, dist, pan, db, rate, delay, pick ('short'|'long'|undefined), att, env: [attack s, half-life s] } */
  _play(name, o = {}) {
    const c = this.cat[name]; if (!this.ctx || !c || !c.buffers.length) return null;
    const stemName = o.stem || 'impact', list = this.voices[stemName], cap = STEMS[stemName].cap;
    const att = o.att || c.att || DEFAULT_ATT, dist = Math.max(0, o.dist || 0);
    if (dist > att.max) return null;
    if (list.length >= cap) {
      let far = list[0]; for (const v of list) if (v.dist > far.dist) far = v;
      if (far.dist <= dist) return null;
      try { far.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); far.src.stop(this.ctx.currentTime + 0.1); } catch (e) { /* already stopped */ }
      list.splice(list.indexOf(far), 1);
    }
    const n = c.buffers.length;
    let i;
    if (o.pick === 'short') i = (Math.random() * Math.max(1, n / 3)) | 0;
    else if (o.pick === 'long') i = n - 1 - ((Math.random() * Math.max(1, n / 3)) | 0);
    else { c.seq = (c.seq + 1 + ((Math.random() * Math.min(3, n - 1)) | 0)) % n; i = c.seq; }
    const file = c.buffers[i], ctx = this.ctx, t = ctx.currentTime + (o.delay || 0) / this.r;
    const db = c.db + file.db + rand(c.vr[0], c.vr[1]) + curveAt(att.vol, dist) + (o.db || 0);
    const src = ctx.createBufferSource(); src.buffer = file.buf;
    src.playbackRate.value = (o.rate || 1) * Math.pow(2, rand(c.pr[0], c.pr[1]) / 1200) * this.r;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = lpfHz(curveAt(att.lpf, dist) + (o.dull || 0));
    const g = ctx.createGain(); g.gain.value = o.env ? 0 : lin(db);
    src.connect(lp); lp.connect(g);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); const spread = 0.8 * Math.max(0, 1 - dist / 12);   // wide when near, a point when far
      p.pan.value = clamp((o.pan || 0) * (1 - spread * 0.6), -0.9, 0.9); g.connect(p); out = p;
    }
    out.connect(this.stem[stemName]);
    const send = ctx.createGain(); send.gain.value = lin(-30 + 24 * Math.sqrt(Math.min(1, dist / att.max)) + (o.wet || 0)); out.connect(send); send.connect(this.revIn);
    const v = { src, g, dist };
    list.push(v);
    src.onended = () => { const k = list.indexOf(v); if (k >= 0) list.splice(k, 1); };
    if (o.env) {       // gain envelope [attack s, half-life s]: swell in, then die away exponentially; the voice is stopped once it is inaudible
      const [at, hl] = o.env; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lin(db), t + at); g.gain.setTargetAtTime(0, t + at, hl / 0.693);
      src.start(t); src.stop(t + at + hl * 6);
    } else src.start(t);
    return v;
  }

  // ---------------------------------------------------------------- beds
  _bed(name, stem = 'air', rate = 1) {
    const c = this.cat[name]; if (!c || !c.buffers.length) return null;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0; g.connect(this.stem[stem]);
    const srcs = c.buffers.slice(0, 3).map((f, i) => {
      const s = ctx.createBufferSource(); s.buffer = f.buf; s.loop = true; s._k = rate; s.playbackRate.value = rate;
      const fg = ctx.createGain(); fg.gain.value = lin(c.db + f.db);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = [-0.45, 0.45, 0][i];
      s.connect(fg); if (p) { fg.connect(p); p.connect(g); } else fg.connect(g);
      s.start(0, rand(0, f.buf.duration * 0.8)); return s;
    });
    return { g, srcs };
  }
  _startBeds() {
    this.beds.crowd = this._bed('crowd_bed', 'crowd');
    this.beds.build = this._bed('crowd_bed', 'crowd', 1.26);      // the anticipation layer: the same murmur a third higher and denser, swelling as the riders close
    this.beds.air = this._bed('air_bed');
    this.beds.wind = this._bed('wind_rush');
    if (this.beds.wind) { this.windLP = this.ctx.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 400; this.beds.wind.g.disconnect(); this.beds.wind.g.connect(this.windLP); this.windLP.connect(this.stem.air); }
    if (this.beds.air) this.beds.air.g.gain.value = 1;
    if (this.venue) this.setVenue(this.venue);
  }
  /** Venue colour: sea at Calais, river at the Órbigo, town bustle in Bruges and Nuremberg. */
  setVenue(id) {
    this.venue = id; this.training = id === 'training'; if (!this.ctx) return;      // 'training': the camp meadow, no crowd at all
    this._run(() => {
      if (this.beds.venue) { const old = this.beds.venue; old.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); setTimeout(() => old.srcs.forEach(s => { try { s.stop(); } catch (e) { /* stopped */ } }), 2500); this.beds.venue = null; }
      const name = { inglevert: 'sea_bed', leon: 'river_bed', training: 'river_bed', bruges: 'market_bed', nuremberg: 'market_bed' }[id];
      if (name) { this.beds.venue = this._bed(name); if (this.beds.venue) this.beds.venue.g.gain.setTargetAtTime(1, this.ctx.currentTime, 1.2); }
    });
  }

  // ---------------------------------------------------------------- state
  setMuted(m) {
    this.muted = !!m; if (!this.ctx) return;
    this._run(() => this.music.setMuted(this.muted || this.music.off));
    this._run(() => {
      if (this.muted) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.value = 0; this.ctx.suspend(); }
      else { this.ctx.resume(); this.master.gain.setTargetAtTime(lin(MASTER_DB), this.ctx.currentTime, 0.15); }
    });
  }
  /** true while the menu joust (src/attract.js) plays behind the menus: the effects bus drops MENU_MIX_DB under a match's level. Music and UI clicks are not on it. */
  setMenuMix(on) {
    on = !!on; if (on === this._menuMix) return; this._menuMix = on;
    if (!this.ctx || !this.sfxBus) return;
    this._run(() => this.sfxBus.gain.setTargetAtTime(on ? lin(MENU_MIX_DB) : 1, this.ctx.currentTime, 0.5));
  }
  setTimeScale(s) {
    this.ts = clamp(+s || 1, 0.1, 1); this.r = lerp(0.88, 1, this.ts);   // slow motion muffles; it barely detunes
    if (!this.ctx) return;
    this._run(() => {
      const t = this.ctx.currentTime;
      this.slowLP.frequency.setTargetAtTime(2600 + 17400 * Math.pow(this.ts, 1.4), t, 0.12);
      for (const k in this.beds) if (this.beds[k]) this.beds[k].srcs.forEach(src => src.playbackRate.setTargetAtTime(this.r * (src._k || 1), t, 0.15));
    });
  }
  /** state = { excitement, anticipation, speed (m/s of your horse), favour } */
  update(dt, st = {}) {
    if (!this.ctx) return;
    this._run(() => {
      const e = clamp(st.excitement || 0, 0, 1), a = clamp(st.anticipation || 0, 0, 1), sp = clamp((st.speed || 0) / 9.5, 0, 1), t = this.ctx.currentTime;
      // Crowd, per docs/crowd-audio.md: idle murmur swelling with the mood (-8..+8 dB); an anticipation layer rising with S.antic (the closing riders, ~8-12 s);
      // a held breath in the last ~0.6 s (bed -4 dB over ~0.25 s, build layer -9 dB, an optional 'crowd_hush' texture, one lone shout); released by the strike; the bed ducks under big reactions.
      const hold = clamp((a - 0.86) / 0.06, 0, 1), d = Math.min(dt, 0.1);
      this._hold += (hold - this._hold) * (1 - Math.exp(-d / (hold > this._hold ? 0.25 : 0.12)));
      this._duck.hold -= d; const dk = this._duck.hold > 0 ? -this._duck.db : 0; this._duck.now += (dk - this._duck.now) * (1 - Math.exp(-d / (dk < this._duck.now ? 0.1 : 0.5)));     // release over ~1.5 s
      if (this._duck.hold <= 0 && this._duck.now > -0.1) this._duck.db = 0;
      if (this.training) { if (this.beds.crowd) this.beds.crowd.g.gain.setTargetAtTime(0, t, 0.3); if (this.beds.build) this.beds.build.g.gain.setTargetAtTime(0, t, 0.3); }
      else if (this.beds.crowd) this.beds.crowd.g.gain.setTargetAtTime(lin(lerp(-8, 8, Math.pow(e, 0.8)) - 4 * this._hold + this._duck.now), t, 0.35);
      if (!this.training && this.beds.build) { const u = clamp((a - 0.1) / 0.8, 0, 1); this.beds.build.g.gain.setTargetAtTime(a < 0.1 ? 0 : lin(lerp(-30, 1, u * u * (3 - 2 * u)) - 9 * this._hold + this._duck.now), t, 0.5); }
      if (this.training) this._lone = true;
      else if (hold > 0.5 && !this._lone) { this._lone = true; this._play('crowd_hush', { stem: 'crowd', att: CROWD_ATT, dist: rand(14, 22), pan: rand(-0.5, 0.5), db: -6 }); this._play('cheer_single', { stem: 'crowd', att: CROWD_ATT, dist: rand(22, 34), pan: rand(-1, 1), db: -12, delay: rand(0.2, 0.5), rate: rand(0.9, 1) }); }      // one lone shout in the hush
      else if (a < 0.5) this._lone = false;
      if (this.beds.wind) { this.beds.wind.g.gain.setTargetAtTime(lin(lerp(-40, 0, Math.pow(sp, 1.3))) * (sp > 0.05 ? 1 : 0), t, 0.25); this.windLP.frequency.setTargetAtTime(300 + 2600 * sp, t, 0.25); }
      // your own horse: working breaths at speed, the odd blow or nicker at rest
      this._t.breath -= dt; this._t.idle -= dt;
      if (sp > 0.55 && this._t.breath <= 0) { this._t.breath = rand(0.7, 1.4); this._play('horse_moving', { stem: 'horse', dist: 2, db: -6 }); }
      if (sp < 0.08 && this._t.idle <= 0) { this._t.idle = rand(6, 15); this._play(Math.random() < 0.6 ? 'horse_idle' : 'horse_snort', { stem: 'horse', dist: 2.5, db: -6 }); }
    });
  }

  _run(fn) { try { fn(); } catch (e) { /* sound must never break the game */ } }

  // ---------------------------------------------------------------- game sounds
  /** One hoof fall. speed 0..1 of a gallop, pan -1..1, dist metres from the listener. */
  hoof(speed, pan, dist = 4) { this._run(() => this._play(speed > 0.45 ? 'hoof_run' : 'hoof_walk', { stem: 'hoof', dist, pan, db: lerp(-9, 0, clamp(speed, 0, 1)), att: HOOF_ATT })); }

  impact(power, kind, dist = 3) {
    this._run(() => {
      const p = clamp(power, 0.15, 1.2), db = lerp(-10, 2, p / 1.2), o = (x) => Object.assign({ stem: 'impact', dist }, x);
      if (kind === 'shield') { this._play('impact_shield', o({ db })); this._play('impact_metal', o({ db: db - 10, delay: 0.015 })); }
      else if (kind === 'helm') { this._play('impact_metal', o({ db: db + 1, rate: 1.12 })); this._play('impact_metal', o({ db: db - 5, rate: 0.8, delay: 0.03 })); this._play('impact_shield', o({ db: db - 8 })); }
      else if (kind === 'body') { this._play('impact_metal', o({ db: db - 1, rate: 0.9 })); this._play('impact_shield', o({ db: db - 3, rate: 0.85 })); }
      else if (kind === 'glance') { this._play('impact_metal', o({ db: db - 7, rate: 1.35 })); }
      else { this._play('impact_shield', o({ db: db - 4, rate: 0.7 })); }
      this._play('kit_rattle', o({ db: -4, delay: 0.06 }));
    });
  }
  /** The helm ringing after a blow: no synthesis. The longest impact_metal samples, pitched up (a struck helm rings high and thin) in two slightly detuned
   *  voices that beat against each other, each with a slow swell-and-die envelope and a wetter send, then a faint low one underneath. power 0..1.2. */
  helmRing(power, dist = 1.5) {
    this._run(() => {
      const p = clamp(power, 0.2, 1.2), db = lerp(-9, -2, p / 1.2), hl = lerp(0.35, 0.9, p / 1.2), o = (x) => Object.assign({ stem: 'impact', dist, pick: 'long', wet: 6, delay: 0.05 }, x);
      this._play('impact_metal', o({ db, rate: 1.9, env: [0.004, hl] }));
      this._play('impact_metal', o({ db: db - 1.5, rate: 1.96, env: [0.004, hl * 1.2], delay: 0.07 }));
      this._play('impact_metal', o({ db: db - 6, rate: 1.35, env: [0.01, hl * 1.5], delay: 0.12 }));
    });
  }
  /**
   * The lance breaking, in layers from the sampled sounds (no synthesis): the crack (the bigger the blow, the more and the lower), a clang of the metal that was
   * struck by zone (helm rings high, shield is flat and short, body is dull), and the splinters: a tinkle of wood falling, many for a shatter, a few for a crack.
   * o.cls: 0 crack, 1 clean break, 2 shatter; o.zone: what was struck.
   */
  lanceBreak(power, dist = 3, o2 = {}) {
    this._run(() => {
      const p = clamp(power, 0.3, 1.2), cls = o2.cls ?? 1, zone = o2.zone, o = (x) => Object.assign({ stem: 'impact', dist }, x);
      this._play('wood_crack', o({ db: lerp(-2, 4, p / 1.2) + (cls === 0 ? -3 : 0), rate: cls === 2 ? 0.92 : 1 }));
      this._play('wood_crack', o({ db: -5, rate: 0.78, delay: 0.035 }));
      if (cls >= 1) this._play('wood_crack', o({ db: -9, rate: 1.3, delay: 0.09 }));
      if (cls === 2) { this._play('wood_crack', o({ db: -3, rate: 0.62, delay: 0.015 })); this._play('wood_crack', o({ db: -6, rate: 1.15, delay: 0.14 })); }
      if (zone === 'helm') this._play('impact_metal', o({ db: -6 + p * 3, rate: 1.55, delay: 0.02 }));
      else if (zone === 'shield') this._play('impact_shield', o({ db: -7 + p * 3, rate: 1.2, delay: 0.02 }));
      else if (zone === 'body') this._play('impact_metal', o({ db: -9 + p * 3, rate: 0.8, delay: 0.025 }));
      const n = cls === 2 ? 11 : cls === 1 ? 7 : 3;
      for (let i = 0; i < n; i++) this._play('wood_debris', o({ db: -3 - i * 0.7, delay: 0.18 + i * rand(0.07, 0.17), pan: rand(-0.6, 0.6), dist: dist + rand(0, 3), rate: rand(0.9, 1.3) }));
    });
  }
  /** One splinter or the crown knocking on the sand (fx.onClack): a single quiet wooden tick, v m/s. */
  splinterTick(dist = 5, v = 3, pan = 0) {
    this._run(() => this._play('wood_debris', { stem: 'impact', dist: dist + rand(0, 2), pan, db: lerp(-12, -5, clamp(v / 8, 0, 1)), rate: rand(1.0, 1.5), pick: 'short' }));
  }
  bodyFall(power, dist = 6) {
    this._run(() => {
      const o = (x) => Object.assign({ stem: 'impact', dist }, x), db = lerp(-1, 6, clamp(power, 0, 1));
      this._play('bodyfall', o({ db })); this._play('impact_metal', o({ db: db - 7, rate: 0.75, delay: 0.02 }));
      this._play('kit_rattle', o({ db: 0, delay: 0.05 })); this._play('kit_rattle', o({ db: -4, delay: 0.3 }));
    });
  }
  /** A broken stump thrown down hits the turf: one low wooden thud (the shipped wood_debris samples, the longest ones, slowed). */
  lanceThud(dist = 5, pan = 0) { this._run(() => { this._play('wood_debris', { stem: 'impact', dist, pan, db: -4, rate: 0.7, pick: 'long' }); }); }
  /** The squire hands up the fresh lance: a soft rattle of wood and leather (the shipped kit_rattle samples). */
  lanceHand(dist = 5, pan = 0) { this._run(() => { this._play('kit_rattle', { stem: 'impact', dist, pan, db: -9, rate: 1.05, pick: 'short' }); }); }
  whinny(pan = 0, dist = 3) { this._run(() => this._play('horse_whinny', { stem: 'horse', dist, pan })); }
  snort(pan = 0, dist = 2.5) { this._run(() => this._play('horse_snort', { stem: 'horse', dist, pan })); }
  /** Heels to the horse: a creak of harness and a grunt of effort. */
  spur() { this._run(() => { this._play('kit_rattle', { stem: 'hoof', dist: 1.5, db: -4 }); if (Math.random() < 0.6) this._play('horse_moving', { stem: 'horse', dist: 2, db: -4, delay: 0.08 }); }); }
  armourClank(intensity) { this._run(() => this._play('kit_rattle', { stem: 'hoof', dist: 1.5, db: lerp(-10, -2, clamp(intensity, 0, 1)) })); }

  /** Crowd reactions (docs/crowd-audio.md): layers of single voices and group beds, each with a gain envelope [attack, half-life], pitch/time scatter, and a duck of the bed under big ones.
   *  kind: roar (eruption on a break, +9..12 dB, half-life ~3 s; stronger = helm/unhorse +12..15, half-life 3.5 s) | cheer | gasp (sharp, short) | ooh (glance: long collective "ooh") |
   *  groan (a clean miss: "aww" falling to a few jeers and laughs) | boo (a foul, long) | laugh (a double miss, a taunt) | whistle (derisive, commons) | wince (a lance into the tilt: "oof") |
   *  polite (a touch: the gallery's sparse, restrained applause) | applause (rides the decay tail) | chant. strength 0.1..1. lead: seconds to hold the whole reaction (the gasp goes 0.2 s ahead of the roar).
   *  o.fav -1..1: how far the house is with the one this reaction is about (a roar for a man they back is louder; a miss by a man they back is mostly "aww", a miss by one they don't draws jeers and laughs).
   *  NEW CATEGORIES (optional, recordings come later, see docs/crowd-audio.md "Samples still needed"): crowd_gasp, crowd_ooh, crowd_groan, crowd_boo, crowd_laugh, crowd_whistle, crowd_hush.
   *  Each falls back to the old category (groan_single / jeer_single) when absent, and is silent when neither exists (_play ignores a missing category). */
  crowd(kind, strength = 1, lead = 0, o = {}) {
    if (this.training) return;      // nobody at the training ground
    this._run(() => {
      const s = clamp(strength, 0.1, 1), RT = () => rand(0.94, 1.06), fav = clamp(o.fav || 0, -1, 1);
      const has = (n) => !!(this.cat[n] && this.cat[n].buffers.length);
      const pickCat = (n, old) => has(n) ? n : old;
      const many = (cat, n, span, db, oo = {}) => { for (let i = 0; i < n; i++) this._play(cat, Object.assign({ stem: 'crowd', att: CROWD_ATT, dist: rand(13, 34), pan: rand(-1, 1), db: db + rand(-4, 0), rate: RT(), delay: lead + Math.pow(Math.random(), 1.6) * span }, oo)); };
      // group beds: near (never culled), several files at once, each swelling in and dying away
      const group = (n, db, at, hl, span = 0.3) => { for (let i = 0; i < n; i++) this._play('cheer_group', { stem: 'crowd', att: CROWD_ATT, dist: rand(11, 15), pan: rand(-0.8, 0.8), db: db - i * 1.5 + rand(-1, 0), rate: rand(0.95, 1.05), delay: lead + i * span * 0.5 + rand(0, span), env: [at * rand(0.85, 1.2), hl] }); };
      // singles with a decaying density: delays follow an exponential so the crowd thins out with the half-life
      const tail = (cat, n, hl, db, oo = {}) => { for (let i = 0; i < n; i++) this._play(cat, Object.assign({ stem: 'crowd', att: CROWD_ATT, dist: rand(13, 34), pan: rand(-1, 1), db: db + rand(-4, 0), rate: RT(), delay: lead + Math.min(hl * 4, -Math.log(1 - Math.random() * 0.98) * hl / 0.693) }, oo)); };
      // a reaction from its own collective recording when we have one (a few near files, they carry their own shape), else many single voices of the old category
      const vox = (cat, old, nGroup, nOld, span, db, oo = {}) => {
        if (has(cat)) for (let i = 0; i < nGroup; i++) this._play(cat, { stem: 'crowd', att: CROWD_ATT, dist: rand(11, 17), pan: rand(-0.8, 0.8), db: db + 3 - i * 1.5 + rand(-1, 0), rate: rand(0.95, 1.05) * (oo.rate || 1), delay: lead + (i ? rand(0, span) : 0) });
        else many(old, nOld, span, db, oo);
      };
      // the gallery's restrained applause: sparse claps, soft, a little behind the commons
      const polite = (n, span, db) => { for (let i = 0; i < n; i++) { const u = Math.random(); this._play('clap', { stem: 'crowd', att: CROWD_ATT, dist: rand(14, 24), pan: rand(-1, 1), db: db + rand(-5, 0) - 9 * Math.abs(u - 0.3), rate: rand(0.96, 1.1), delay: lead + 0.25 + u * span }); } };
      const duck = (db, hold) => { this._duck.db = Math.max(this._duck.db, db); this._duck.hold = Math.max(this._duck.hold, lead + hold); };
      if (kind === 'roar') {       // onset 0.3-0.6 s, half-life 3 s (3.5 s above strength 0.85), gone by ~8 s; claps take over on the tail
        const big = s > 0.85;
        group(Math.round(2 + 2 * s), -12 + 5 * s + 2.5 * fav, 0.4, big ? 3.5 : 3);
        tail('cheer_single', Math.round(14 + 16 * s), big ? 3.5 : 3, -9 + 2 * fav);
        for (let i = 0; i < Math.round(30 * s); i++) { const u = Math.random(), d = 0.9 + u * 5.5; this._play('clap', { stem: 'crowd', att: CROWD_ATT, dist: rand(12, 26), pan: rand(-1, 1), db: 0 + rand(-4, 0) - 7 * Math.abs(u - 0.4), rate: RT(), delay: lead + d }); }
        duck(3 + 3 * s, 1.2);
      }
      else if (kind === 'cheer') { group(Math.round(1 + 2 * s), -12 + 5 * s, 0.3, 1.6, 0.2); many('cheer_single', Math.round(8 + 10 * s), 1.6, -9); duck(2, 0.6); }
      else if (kind === 'gasp') { vox('crowd_gasp', 'groan_single', 2, Math.round(6 + 6 * s), 0.18, -4, { rate: 1.12, env: [0.05, 0.25] }); }       // sharp intake, ~0.5 s
      else if (kind === 'ooh') { vox('crowd_ooh', 'groan_single', 3, Math.round(7 + 8 * s), 0.35, -4, { rate: 0.86, env: [0.12, 0.5] }); duck(2, 0.8); }       // +5..7 dB, ~1.5 s: a long collective "ooh", no jeers
      else if (kind === 'groan') {       // "aww" ~2.5 s falling to a few jeers and laughs; mostly "aww" when the house backs the man who missed
        vox('crowd_groan', 'groan_single', 3, Math.round(8 + 8 * s), 0.9, -5, { rate: 0.8, env: [0.4, 1.2] });
        const nj = fav > 0.3 ? 1 : Math.round(2 + 3 * s);
        tail(pickCat('crowd_boo', 'jeer_single'), nj, 1.3, -8, { rate: 0.95 });
        if (fav < 0.3) tail(pickCat('crowd_laugh', 'jeer_single'), Math.round(1 + 2 * s), 1.6, -9, { rate: 1.1 });
      }
      else if (kind === 'boo') {       // +6..8 dB, 5-6 s
        if (has('crowd_boo')) { vox('crowd_boo', 'jeer_single', 4, 0, 0.6, -5); tail('jeer_single', Math.round(4 + 4 * s), 2.5, -9, { rate: 0.85 }); }
        else { many('jeer_single', Math.round(12 + 14 * s), 2.4, -6, { rate: 0.9, env: [0.4, 2.4] }); tail('jeer_single', Math.round(6 + 6 * s), 2.5, -9, { rate: 0.85 }); }
        vox('crowd_groan', 'groan_single', 2, Math.round(4 * s), 0.8, -6, { rate: 0.85 }); duck(3, 2.5);
      }
      else if (kind === 'laugh') {       // a double miss, a taunt: ripples of laughter, a few guffaws
        vox('crowd_laugh', 'jeer_single', 3, Math.round(6 + 8 * s), 1.4, -6, { rate: 1.1, env: [0.2, 1.0] });
        tail(pickCat('crowd_laugh', 'jeer_single'), Math.round(3 + 4 * s), 1.6, -8, { rate: rand(1.0, 1.25) });
      }
      else if (kind === 'whistle') { for (let i = 0; i < Math.round(3 + 5 * s); i++) this._play(pickCat('crowd_whistle', 'jeer_single'), { stem: 'crowd', att: CROWD_ATT, dist: rand(16, 34), pan: rand(-1, 1), db: -8 + rand(-4, 0), rate: rand(0.9, 1.15), delay: lead + 0.3 + Math.pow(Math.random(), 1.4) * 2.2 }); }
      else if (kind === 'wince') {       // a lance into the barrier: a short "oof", dropping
        vox('crowd_gasp', 'groan_single', 2, 6, 0.15, -3, { rate: 0.95, env: [0.04, 0.3] });
        vox('crowd_groan', 'groan_single', 1, Math.round(4 + 4 * s), 0.4, -6, { rate: 0.75, env: [0.15, 0.6] });
      }
      else if (kind === 'polite') { polite(Math.round(16 + 26 * s), 2.6, -7); many('cheer_single', Math.round(2 * s), 1.6, -12); }       // a touch: sparse, short, the gallery
      else if (kind === 'applause') {
        for (let i = 0; i < Math.round(50 + 110 * s); i++) { const u = Math.random(); this._play('clap', { stem: 'crowd', att: CROWD_ATT, dist: rand(12, 26), pan: rand(-1, 1), db: 1 + rand(-4, 0) - 14 * Math.pow(Math.abs(u - 0.35) / 0.65, 1.5), rate: RT(), delay: lead + u * 4.5 }); }      // swells in over ~1.5 s, fades by ~4.5 s
        many('cheer_single', Math.round(3 * s), 2, -8);
        if (has('crowd_applause')) this._play('crowd_applause', { stem: 'crowd', att: CROWD_ATT, dist: rand(11, 15), pan: rand(-0.5, 0.5), db: -6 + 3 * s, rate: rand(0.97, 1.03), delay: lead + 0.4, env: [0.5, 2.4] });      // recorded applause bed
      }
      else if (kind === 'charge') {      // the knights charge: a rising cheer (recorded), else the single cheers
        if (has('crowd_charge')) this._play('crowd_charge', { stem: 'crowd', att: CROWD_ATT, dist: rand(12, 16), pan: rand(-0.4, 0.4), db: -6 + 3 * s, delay: lead });
        else many('cheer_single', Math.round(3 * s), 1.5, -12);
      }
      else if (kind === 'chant') {
        for (let bar = 0; bar < 4; bar++) for (const [beat, rate, db] of [[0, 0.62, 5], [0.36, 0.62, 5], [0.72, 1, 7]])
          for (let k = 0; k < 7; k++) this._play('clap', { stem: 'crowd', att: CROWD_ATT, dist: rand(12, 26), pan: rand(-1, 1), db: db + rand(-4, 0), rate: rate * rand(0.94, 1.06), delay: lead + bar * 1.25 + beat + rand(0, 0.035) });
        many('cheer_single', Math.round(4 * s), 4.5, -7);
        if (has('crowd_chant_bed')) this._play('crowd_chant_bed', { stem: 'crowd', att: CROWD_ATT, dist: rand(12, 18), pan: rand(-0.6, 0.6), db: -7 + 3 * s, delay: lead + 0.3 });      // recorded "Saint George!" chant
      }
    });
  }

  fanfare(kind) {
    this._run(() => {
      const o = (x) => Object.assign({ stem: 'music', dist: 22, pan: -0.5, wet: 6 }, x);
      if (kind === 'short') this._play('horn', o({ pick: 'short' }));
      else if (kind === 'start') { this._play('horn', o({ pick: 'long' })); this._play('horn', o({ pick: 'short', delay: 0.5, pan: -0.3, db: -3 })); }
      else if (kind === 'victory') { this._play('horn', o({ pick: 'long' })); this._play('horn', o({ pick: 'long', delay: 0.35, pan: -0.2, db: -2, rate: 1.06 })); }
      else this._play('horn', o({ pick: 'long', rate: 0.84, db: -3 }));
    });
  }

  // the only synthesized sounds left: a low heartbeat for Nerve, and soft interface plucks
  heartbeat(intensity = 1) {
    this._run(() => {
      const ctx = this.ctx, t = ctx.currentTime;
      for (const [dt, f, g] of [[0, 58, 0.5], [0.24, 48, 0.36]]) {
        const osc = ctx.createOscillator(), gn = ctx.createGain(); osc.frequency.setValueAtTime(f, t + dt); osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.16);
        gn.gain.setValueAtTime(0.0001, t + dt); gn.gain.linearRampToValueAtTime(g * intensity, t + dt + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
        osc.connect(gn); gn.connect(this.stem.ui); osc.start(t + dt); osc.stop(t + dt + 0.25);
      }
    });
  }
  ui(kind) {
    this._run(() => {
      const ctx = this.ctx, t = ctx.currentTime;
      const notes = { click: [[523, 0]], hover: [[392, 0]], select: [[523, 0], [784, 0.07]], error: [[196, 0], [165, 0.1]] }[kind] || [[523, 0]];
      for (const [f, dt] of notes) {
        const osc = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter(); osc.type = 'triangle'; osc.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 2200;
        gn.gain.setValueAtTime(0.0001, t + dt); gn.gain.linearRampToValueAtTime(kind === 'hover' ? 0.25 : 0.6, t + dt + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
        osc.connect(lp); lp.connect(gn); gn.connect(this.stem.ui); osc.start(t + dt); osc.stop(t + dt + 0.2);
      }
    });
  }
}
