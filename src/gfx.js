// gfx.js - graphics tiers ('low' | 'medium' | 'high'): guessed from the device, measured in the first match, remembered per device, lowered live if the game runs slowly,
// and tuned by the player's own overrides (Settings > Graphics, src/settings_gfx.js). How it all fits together: docs/graphics-detection.md.
//
//   high    exactly what the game always did (desktop with a good GPU)
//   medium  integrated GPUs, tablets, good phones: lighter frame, half-size tree atlases, fewer trees / crowd
//   low     old phones and software renderers: no post-processing, small shadow map, 1K sky, two trees, a few props
//   (no "ultra": the desktop path has nothing above high that is worth a tier. Resolution scale up to native, the frame cap and depth of field are separate settings.)
//
// WHO DECIDES, in order
//   1. ?gfx=low|medium|high in the address (also remembered), or the preset chosen in Settings ('tilt.gfx'). A named preset is never changed by the game (the safety net skips 'high').
//   2. Auto: the result of the in-game benchmark saved for this device ('tilt.gfxdev'), else the startup probe's first guess (probe() / detect()).
//   3. A cap saved when the live safety net had to drop a tier ('tilt.gfxcap'), and a cap after two game starts that never finished loading ('tilt.boot').
// THE BENCHMARK (Auto only, once per device): the first seconds of the first match are timed. Clearly slow: one step down (two if hopeless). Clean at the frame cap and the guess was
// below what the device may use: one step up, then a second, shorter check; if that is not clean it goes back. The answer is saved with a signature of the device.
// THE SAFETY NET (every preset but a named High): frame time still bad for 3 s: pixel ratio down a step; at the floor, a tier down and a toast. The result is saved too.
// OVERRIDES ('tilt.gfxset'): resolution scale, shadows, post effects, depth of field, crowd, frame cap, model quality. They sit on top of whatever tier is running.
// The numbers other files read live in GFX (a plain object; GFX.tier can go down during play, and up once, right after the benchmark).
import { touchMode } from './touch.js';

export const TIER_ORDER = ['low', 'medium', 'high'];
const ALL_CARDS = ['jacaranda_tree', 'island_tree_01', 'tree_small_02', 'island_tree_02'];
const ALL_MODELS = ['rock_moss_set_01', 'wooden_barrels_01', 'wine_barrel_01', 'wooden_crate_02', 'wooden_bucket_01', 'tree_stump_01'];
const dpr = () => window.devicePixelRatio || 1;
const param = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };

/** The settings of each tier. pr(): the pixel ratio the tier starts at. px: the most pixels it will draw (a 5K screen on an integrated GPU is not drawn at 1.75). */
const TIERS = {
  high: {
    antialias: true, post: touchMode ? 'lite' : 'full', shadow: touchMode ? 2048 : 4096, aniso: 8, halfTex: false,
    sky: '4k', skyWait: true, cards: ALL_CARDS, halfCards: false, models: ALL_MODELS,
    crowd: 1, trees: 1, bushes: 1, grass: 1, flowers: 1, tents: 1, px: 5.5e6,
    pr: () => (touchMode ? (dpr() > 2.5 ? 1 : Math.min(dpr(), 1.25)) : Math.min(dpr(), 1.75)),      // (what main.js always used)
  },
  medium: {
    antialias: false, post: 'lite', shadow: 2048, aniso: 4, halfTex: false,
    sky: '2k', skyWait: true, cards: ALL_CARDS, halfCards: true, models: ALL_MODELS.filter(m => m !== 'wooden_barrels_01'),
    crowd: 0.75, trees: 0.6, bushes: 0.6, grass: 0.6, flowers: 0.6, tents: 0.75, px: 3.4e6,
    pr: () => (touchMode ? Math.min(dpr(), 1) : Math.min(dpr(), 1.25)),
  },
  low: {
    antialias: false, post: 'plain', shadow: 1024, aniso: 2, halfTex: true,
    sky: '1k', skyWait: false, cards: ['tree_small_02', 'island_tree_02'], halfCards: true, models: ['rock_moss_set_01', 'wine_barrel_01', 'wooden_crate_02'],
    crowd: 0.45, trees: 0.3, bushes: 0.25, grass: 0.35, flowers: 0.3, tents: 0.6, px: 1.4e6,
    pr: () => Math.min(dpr(), 0.8),
  },
};
export const PR_FLOOR = 0.7;      // the safety net does not take the pixel ratio below this before it drops a tier (or below the tier's own, if that is lower)
const PX_SIDE = 3200;             // the longest side of the drawing buffer (and so of the post targets), in device pixels: an ultrawide window must not ask the GPU for a 3500 px wide HDR multisampled stack
const PR_MIN = 0.4;               // nothing, not even a player's override, draws below this

// ------------------------------------------------------------------ storage
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const lsJson = (k) => { try { const v = JSON.parse(lsGet(k)); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
const valid = (v) => (v === 'low' || v === 'medium' || v === 'high' ? v : null);
const SIM = param('gfxsim');      // ?gfxsim=slow: every frame costs extra time (a slow device); ?gfxsim=fast: the first guess is Low on a fast machine (the benchmark should step up). Nothing is saved while it is on.
const persist = !SIM;
const K = { pref: 'tilt.gfx', cap: 'tilt.gfxcap', dev: 'tilt.gfxdev', set: 'tilt.gfxset', boot: 'tilt.boot', fails: 'tilt.bootfail' };

// ------------------------------------------------------------------ the startup probe
/** What the browser will tell us about the machine. Cheap (one throw-away WebGL context, released at once). */
export function probe() {
  const out = { gpu: '', maxTex: 0, gl2: false, mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, dpr: dpr(), sw: 0, sh: 0, mobileUA: false, saveData: false };
  try { out.sw = screen.width || 0; out.sh = screen.height || 0; } catch (e) { /* ignore */ }
  try {
    const ua = navigator.userAgent || '', uad = navigator.userAgentData;
    out.mobileUA = !!(uad && uad.mobile) || /Android|iPhone|iPad|iPod|Mobile|Silk|Tablet/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);      // (an iPad that says it is a Mac)
    out.saveData = !!(navigator.connection && navigator.connection.saveData);
  } catch (e) { /* ignore */ }
  try {
    const c = document.createElement('canvas');
    let gl = c.getContext('webgl2'); out.gl2 = !!gl;
    if (!gl) gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const x = gl.getExtension('WEBGL_debug_renderer_info');
      out.gpu = String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0;
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();      // do not keep a spare context alive
    }
  } catch (e) { /* no WebGL at all: the game will say so itself */ }
  return out;
}
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
/** A short signature of this machine: when it changes (another GPU, a docked laptop's big screen) a saved benchmark no longer applies. */
const signature = (p) => hash([p.gpu, p.maxTex, p.cores, p.mem, touchMode ? 't' : 'd', Math.round(Math.log2(Math.max(1, p.sw * p.sh * p.dpr * p.dpr / 5e5)))].join('|'));

/** The first guess, from the probe alone. Returns { tier, ceiling, reason, info }: ceiling is the highest tier the benchmark may raise it to. */
export function detect(p = probe()) {
  const gpu = p.gpu.toLowerCase(), phone = touchMode || p.mobileUA, tablet = phone && Math.min(p.sw, p.sh) >= 700;
  const info = { ...p, touch: touchMode, phone, tablet };
  const why = [];
  let level = 2, ceil = phone && !tablet ? 1 : 2;      // 0 low, 1 medium, 2 high
  const cap = (l, w, c) => { if (l < level) { level = l; why.push(w); } if (c !== undefined && c < ceil) ceil = c; };
  if (p.mem && p.mem <= 3) cap(0, 'memory ' + p.mem + ' GB', 1);
  else if (p.mem && p.mem <= 4) cap(1, 'memory ' + p.mem + ' GB');
  if (/swiftshader|llvmpipe|softpipe|basic render|software|mesa offscreen/.test(gpu)) cap(0, 'software renderer', 0);
  if (/powervr|sgx/.test(gpu)) cap(0, 'PowerVR', 1);
  const mali = /mali[- ]?(4\d\d|t\d+|g(31|51|52)\b)/.exec(gpu); if (mali) cap(0, 'older Mali', 1);
  else if (/mali/.test(gpu)) cap(1, 'Mali');
  const ad = /adreno[^0-9]*(\d)(\d\d)\b/.exec(gpu); if (ad) { const g = +ad[1]; if (g <= 5) cap(0, 'Adreno ' + ad[1] + 'xx', 1); else if (g === 6 && +ad[2] < 40) cap(1, 'Adreno 6xx'); }
  if (/intel.*(hd graphics [2-5]\d\d\d?\b|gma)/.test(gpu) && !/iris|uhd|xe/.test(gpu)) cap(1, 'older Intel graphics', 1);
  if (p.maxTex && p.maxTex < 4096) cap(0, 'max texture ' + p.maxTex, 0);
  else if (p.maxTex && p.maxTex < 8192) cap(phone ? 0 : 1, 'max texture ' + p.maxTex, 1);
  if (phone && !p.gl2) cap(0, 'WebGL 1 only', 1);
  if (p.cores && p.cores <= 2) cap(phone ? 0 : 1, p.cores + ' cores');
  else if (p.cores && p.cores <= 4 && phone) cap(1, p.cores + ' cores');
  if (p.saveData) cap(1, 'data saver is on');
  if (phone) cap(1, tablet ? 'tablet' : 'phone');
  const px = p.sw * p.sh * p.dpr * p.dpr;      // a very large screen on a GPU that is not clearly a discrete card starts one step lower
  if (px > 8.5e6 && level === 2 && /intel|apple gpu|mali|adreno|vega|radeon graphics/.test(gpu)) cap(1, 'very large screen on integrated graphics');
  let tier = TIER_ORDER[level], reason = why.join(', ') || 'good device';
  if (SIM === 'fast') { tier = 'low'; ceil = 2; reason = 'simulated weak guess'; }
  return { tier, ceiling: TIER_ORDER[ceil], reason, info };
}

// ------------------------------------------------------------------ the live object
export const GFX = { tier: 'high', pref: 'auto', detected: 'high', ceiling: 'high', reason: '', info: {}, prScale: 1, dropped: false, listeners: [],
  /** what Auto picked and why: source 'saved' (an earlier benchmark), 'guess' (the probe; the benchmark is still to come), 'bench' (just measured), 'net' (the safety net lowered it), 'boot' (the game never finished loading) */
  auto: { tier: 'high', source: 'guess', note: '' },
  bench: { state: 'off', fps: 0, note: '' }, ov: {}, sim: SIM || '' };
let dets = null, sig = '';

const readOv = () => { const o = lsJson(K.set) || {}, out = {};
  if ([0.5, 0.75, 1].includes(o.res)) out.res = o.res;
  if (o.shadow === 'off' || [1024, 2048, 4096].includes(o.shadow)) out.shadow = o.shadow;
  if (o.post === 'full' || o.post === 'lite' || o.post === 'plain') out.post = o.post;
  if (typeof o.dof === 'boolean') out.dof = o.dof;
  if ([0.25, 0.5, 0.75, 1].includes(o.crowd)) out.crowd = o.crowd;
  if ([0, 30, 60].includes(o.cap)) out.cap = o.cap;
  if (o.model === 'old' || o.model === 'new') out.model = o.model;
  return out; };

/** The pixel ratio the current tier (or the resolution override) starts from, before the safety net's scale. */
function baseRatio() {
  const t = TIERS[GFX.tier], o = GFX.ov;
  if (o.res) return Math.max(PR_MIN, dpr() * o.res);
  const css = Math.max(1, window.innerWidth * window.innerHeight);
  const side = PX_SIDE / Math.max(1, window.innerWidth, window.innerHeight);      // a very wide or tall window: no side of the drawing buffer beyond PX_SIDE device pixels
  return Math.max(PR_MIN, Math.min(t.pr(), Math.sqrt(t.px / css), side));
}
/** Put the tier's numbers, then the player's overrides, on GFX. */
function apply(tier) {
  GFX.tier = tier;
  const t = TIERS[tier], o = GFX.ov;
  for (const k of Object.keys(t)) GFX[k] = t[k];
  GFX.shadowOn = o.shadow !== 'off';
  GFX.shadow = typeof o.shadow === 'number' ? o.shadow : t.shadow;
  GFX.post = o.post || t.post;
  GFX.dof = o.dof != null ? o.dof : (GFX.post === 'full' && tier === 'high');      // depth of field: the high tier's full pipeline, or on request
  GFX.crowd = o.crowd != null ? o.crowd : t.crowd;
  GFX.capFps = o.cap != null ? o.cap : 60;      // matches; the menus draw at most 30 (main.js). 0 = every screen refresh (desktop only)
  GFX.model = o.model || 'auto';
  GFX.baseRatio = baseRatio;
  GFX.pixelRatio = () => Math.max(PR_MIN, baseRatio() * GFX.prScale);
}
/** Use the new horse and rider (true) or the old code-built ones? Settings > Graphics > Models; Auto: everything but Low. (?horse=old and ?rider=old still win.) */
export const wantNewModels = () => (GFX.model === 'new' ? true : GFX.model === 'old' ? false : GFX.tier !== 'low');

/** The GPU lost its context or showed only black frames: take the cap down one tier now and keep it (Auto only; a named tier is what he chose, but a black screen is no use to him either). Returns the new tier, or '' when already on Low. */
export function dropTier(why) {
  if (GFX.tier === 'low') return '';
  const next = TIER_ORDER[TIER_ORDER.indexOf(GFX.tier) - 1];
  for (const k of ['res', 'shadow', 'post', 'dof']) delete GFX.ov[k];
  lsSet(K.set, Object.keys(GFX.ov).length ? JSON.stringify(GFX.ov) : null);
  setTier(next, 'tier', 'net', { note: why || 'graphics reset' }); GFX.dropped = true;
  if (persist) { lsSet(K.cap, next); saveDevice(next, 'net', { note: GFX.auto.note }); }
  return next;
}

/** The player's choice: 'auto' | 'low' | 'medium' | 'high'. (Per device: it is not kept in the cloud profile, a phone's Low must not follow him to his desktop.) */
function readPref() {
  const q = valid(param('gfx'));
  if (q) { lsSet(K.pref, q); return q; }      // ?gfx=low sticks (the "light version" button uses it)
  return valid(lsGet(K.pref)) || 'auto';
}
const STALE = 45 * 86400e3;
function saveDevice(tier, src, extra = {}) { if (persist) lsSet(K.dev, JSON.stringify({ v: 1, tier, src, sig, at: Date.now(), ...extra })); }

(function init() {
  GFX.pref = readPref(); GFX.ov = readOv();
  const p = probe(); dets = detect(p); sig = signature(p);
  GFX.detected = dets.tier; GFX.ceiling = dets.ceiling; GFX.reason = dets.reason; GFX.info = dets.info;
  let tier = dets.tier;
  GFX.auto = { tier, source: 'guess', note: dets.reason };
  if (GFX.pref === 'auto') {
    const dev = persist ? lsJson(K.dev) : null;
    if (dev && valid(dev.tier) && dev.sig === sig && Date.now() - (dev.at || 0) < STALE) {
      tier = dev.tier; GFX.auto = { tier, source: dev.src === 'net' ? 'net' : dev.src === 'boot' ? 'boot' : 'saved', note: dev.note || dev.src };
      GFX.bench.state = 'done';
    } else GFX.bench.state = 'pending';      // measured during the first match
    const capT = persist ? valid(lsGet(K.cap)) : null;      // a tier the safety net dropped to on this device earlier
    if (capT && TIER_ORDER.indexOf(capT) < TIER_ORDER.indexOf(tier)) { tier = capT; GFX.auto = { tier, source: 'net', note: 'the game ran slowly before' }; GFX.bench.state = 'done'; }
    // a start that never finished loading, twice in a row (an old phone out of memory): one tier lower
    const prev = lsJson(K.boot), fails = persist ? (prev ? (+lsGet(K.fails) || 0) + 1 : (+lsGet(K.fails) || 0)) : 0;
    if (fails >= 2 && TIER_ORDER.indexOf(tier) > 0) {
      const lower = TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier), TIER_ORDER.indexOf(valid(prev && prev.tier) || tier)) - 1] || 'low';
      tier = lower; GFX.auto = { tier, source: 'boot', note: 'twice in a row' }; GFX.bench.state = 'done'; GFX.bootDropped = true;
      lsSet(K.cap, tier); saveDevice(tier, 'boot', { note: GFX.auto.note }); lsSet(K.fails, null);
    } else if (persist && prev) lsSet(K.fails, String(fails));
  } else GFX.bench.state = 'off';      // a named preset is never benchmarked
  if (GFX.pref !== 'auto') tier = GFX.pref;
  if (persist) lsSet(K.boot, JSON.stringify({ t: Date.now(), tier }));
  apply(tier);
})();

/** The menu is up: this start finished loading (see the boot check in init). */
export function bootDone() { if (persist) { lsSet(K.boot, null); lsSet(K.fails, null); } }

/** Save the player's preset from Settings. Takes effect after a reload. */
export function setPref(pref) {
  GFX.pref = valid(pref) || 'auto';
  lsSet(K.pref, GFX.pref === 'auto' ? null : GFX.pref);
  if (GFX.pref !== 'auto') lsSet(K.cap, null);      // an explicit choice clears the automatic cap
}
export const PREFS = ['auto', 'low', 'medium', 'high'];
/** Forget what was learned about this device (the benchmark, the safety net's cap, the failed starts); the next start guesses again and measures again. */
export function redetect() { lsSet(K.dev, null); lsSet(K.cap, null); lsSet(K.fails, null); lsSet(K.boot, null); }

/** Change one override ('res' | 'shadow' | 'post' | 'dof' | 'crowd' | 'cap' | 'model'; null = automatic) and apply it. Listeners (main.js) re-apply what can change live. */
export function setOverride(key, value) {
  const o = { ...GFX.ov }; if (value == null) delete o[key]; else o[key] = value;
  GFX.ov = o; lsSet(K.set, Object.keys(o).length ? JSON.stringify(o) : null);
  if (key === 'post' && value === 'plain') delete GFX.ov.dof;
  apply(GFX.tier); emit({ kind: 'ov', key, pr: GFX.pixelRatio() });
}
export const clearOverrides = () => { GFX.ov = {}; lsSet(K.set, null); apply(GFX.tier); emit({ kind: 'ov', key: '*', pr: GFX.pixelRatio() }); };

// ------------------------------------------------------------------ a simulated slow device (?gfxsim=slow): each frame also burns this many ms
const SIM_MS = { high: 20, medium: 28, low: 8 };
/** Call once a frame before the work: with ?gfxsim=slow it keeps the CPU busy so the frame takes as long as a slow device's would. */
export function simSpin() { if (SIM !== 'slow') return; const end = performance.now() + SIM_MS[GFX.tier]; while (performance.now() < end) { /* busy */ } }

// ------------------------------------------------------------------ the benchmark: the first seconds of the first match
const WARM = 2000, RUN = 4000, VERIFY_WARM = 800, VERIFY_RUN = 3000, MIN_N = 100;
let B = null;      // { phase: 'warm' | 'run', verify, from, ms[], sum, t, restarts }
const expectMs = (arr) => { if (GFX.capFps > 0) return 1000 / GFX.capFps; const s = [...arr].sort((a, b) => a - b); return Math.max(4, Math.min(34, s[Math.floor(s.length * 0.25)] || 16.7)); };      // uncapped: the screen's own refresh
/** { n, mean, p90, slow (share of frames over 1.5x the beat), fps, good, bad, awful } for a list of frame times against the beat the game aims at. */
export function judge(arr, exp = expectMs(arr)) {
  const n = arr.length, s = [...arr].sort((a, b) => a - b), mean = arr.reduce((x, y) => x + y, 0) / Math.max(1, n), p90 = s[Math.min(n - 1, Math.floor(n * 0.9))] || 0;
  const slow = n ? arr.filter((x) => x > exp * 1.5).length / n : 0;
  return { n, mean, p90, slow, exp, fps: mean ? 1000 / mean : 0,
    good: n >= MIN_N && mean <= exp * 1.12 && p90 <= exp * 1.3 && slow <= 0.04,
    bad: n >= MIN_N / 2 && (mean > exp * 1.35 || p90 > exp * 2.2),
    awful: n >= MIN_N / 2 && mean > exp * 2.4 };
}
function benchStart(verify = false) { B = { phase: 'warm', verify, from: GFX.tier, ms: [], sum: 0, t: 0, restarts: B ? B.restarts : 0 }; GFX.bench.state = verify ? 'verifying' : 'waiting'; }
const benchEnd = (note) => { B = null; GFX.bench.state = 'done'; if (note) GFX.bench.note = note; };
function setTier(next, kind, src, extra = {}) {
  const keep = GFX.pixelRatio();
  apply(next);
  GFX.prScale = kind === 'tier-up' ? 1 : Math.min(1, keep / baseRatio());      // (never above the ratio it was already at, except on a step up)
  GFX.auto = { tier: next, source: src, note: extra.note || '' };
  emit({ kind, tier: next, pr: GFX.pixelRatio(), avg: extra.avg || 0, src });
}
function benchFrame(ms) {
  if (!B) return;
  B.t += ms;
  if (B.phase === 'warm') { if (B.t >= (B.verify ? VERIFY_WARM : WARM)) { B.phase = 'run'; B.t = 0; B.ms = []; B.sum = 0; GFX.bench.state = B.verify ? 'verifying' : 'running'; } return; }
  B.ms.push(ms); B.sum += ms;
  if (B.sum < (B.verify ? VERIFY_RUN : RUN)) return;
  const j = judge(B.ms), pct = () => Math.round(j.fps) + ' fps';
  GFX.bench.fps = Math.round(j.fps);
  const idx = TIER_ORDER.indexOf(GFX.tier);
  if (B.verify) {      // the second look after a step up
    if (j.good || (!j.bad && j.mean <= j.exp * 1.2)) { saveDevice(GFX.tier, 'bench', { fps: GFX.bench.fps, note: 'measured ' + pct() + ' on ' + GFX.tier }); GFX.auto.note = 'measured ' + pct() + ' on ' + GFX.tier; return benchEnd('stepped up to ' + GFX.tier + ', ' + pct()); }
    const back = B.from; setTier(back, 'tier', 'bench', { note: 'tried ' + GFX.tier + ', not smooth' });
    saveDevice(back, 'bench', { fps: GFX.bench.fps, note: 'tried a higher tier: not smooth' }); return benchEnd('tried a step up, not smooth: stayed on ' + back);
  }
  if (j.bad && idx > 0) {
    const next = TIER_ORDER[Math.max(0, idx - (j.awful && idx > 1 ? 2 : 1))];
    setTier(next, 'tier', 'bench', { avg: j.mean, note: 'measured ' + pct() + ' on ' + GFX.tier });
    saveDevice(next, 'bench', { fps: GFX.bench.fps, note: GFX.auto.note }); GFX.dropped = false;
    return benchEnd('too slow (' + pct() + '): stepped down to ' + next);
  }
  if (j.good && idx < TIER_ORDER.indexOf(GFX.ceiling)) {
    const from = GFX.tier, next = TIER_ORDER[idx + 1];
    setTier(next, 'tier-up', 'bench', { note: 'measured ' + pct() + ' on ' + from });
    benchStart(true); B.from = from; return;
  }
  saveDevice(GFX.tier, 'bench', { fps: GFX.bench.fps, note: 'measured ' + pct() + ' on ' + GFX.tier });
  GFX.auto.note = 'measured ' + pct() + ' on ' + GFX.tier; GFX.auto.source = 'bench';
  benchEnd('kept ' + GFX.tier + ', ' + pct());
}

// ------------------------------------------------------------------ the live safety net
const WINDOW = 3000, LIMIT = 24, COOLDOWN = 4000;
let acc = 0, n = 0, quiet = 0;
/**
 * Call once a frame with the real frame time in ms (paused: a hidden tab, a pause or a menu: nothing is measured).
 * First runs the benchmark (Auto, first match). Then, if the average stays above ~24 ms for 3 s: lower the pixel ratio by a step, then drop a tier. Never raises anything.
 * Calls GFX.listeners (fn({ kind: 'pr'|'tier'|'tier-up'|'ov', pr, tier, avg })) so main.js can apply the change; kind 'tier' with src 'net' is the safety net (main.js shows the toast).
 */
export function frameTime(ms, paused = false) {
  if (paused) { acc = 0; n = 0; return; }
  if (ms > 250 || ms <= 0) { acc = 0; n = 0; if (B && B.phase === 'run' && ++B.restarts < 4) { B.phase = 'warm'; B.t = 0; } return; }      // a long hitch (loading) is not slowness; the benchmark's run starts over
  if (GFX.bench.state === 'pending' && GFX.pref === 'auto') benchStart();
  if (B) { benchFrame(ms); if (B) return; }      // (while it measures, the safety net waits)
  if (GFX.pref === 'high') return;      // High was asked for by name: the player has chosen quality over speed
  if (quiet > 0) { quiet -= ms; return; }
  acc += ms; n++;
  if (acc < WINDOW) return;
  const avg = acc / n; acc = 0; const frames = n; n = 0;
  if (avg <= LIMIT * (GFX.capFps === 30 ? 1.5 : 1) || frames < 20) return;
  const base = baseRatio(), cur = base * GFX.prScale, floor = Math.min(PR_FLOOR, base);
  if (cur > floor * 1.03) {
    GFX.prScale = Math.max(floor / base, GFX.prScale * 0.85);
    emit({ kind: 'pr', pr: GFX.pixelRatio(), avg });
  } else if (GFX.tier !== 'low') {
    const next = TIER_ORDER[TIER_ORDER.indexOf(GFX.tier) - 1];
    for (const k of ['res', 'shadow', 'post', 'dof']) delete GFX.ov[k];      // what he asked for above the new tier goes: the game could not keep it up
    lsSet(K.set, Object.keys(GFX.ov).length ? JSON.stringify(GFX.ov) : null);
    setTier(next, 'tier', 'net', { avg, note: 'lowered after ' + avg.toFixed(0) + ' ms frames' });
    GFX.dropped = true;
    if (GFX.pref === 'auto' && persist) { lsSet(K.cap, next); saveDevice(next, 'net', { note: GFX.auto.note }); }
  } else return;
  quiet = COOLDOWN;
}
function emit(ev) { for (const f of GFX.listeners) { try { f(ev); } catch (e) { console.warn('[gfx] listener', e); } } }

// a handle for tests and the Settings screen
GFX.debug = { probe, detect, judge, bench: () => B, signature: () => sig };
