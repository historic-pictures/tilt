// gfx.js - graphics tiers ('low' | 'medium' | 'high'): detected from the device, overridable on the main menu, and lowered live if the game runs slowly.
//
//   high    exactly what the game always did (desktop with a good GPU)
//   medium  integrated GPUs, tablets, good phones: lighter frame, half-size tree atlases, fewer trees / crowd
//   low     old phones and software renderers: no post-processing, small shadow map, 1K sky, two trees, a few props
//
// Who decides, in order: ?gfx=low|medium|high in the address (also remembered), the choice saved with the Graphics chip
// (localStorage 'tilt.gfx', mirrored in profile.gfx), a cap saved when the live safety net had to drop a tier ('tilt.gfxcap'),
// then detection. Phones (touchMode) never get more than medium by detection.
// The numbers other files read live in GFX (a plain object; GFX.tier can go down during play, never up).
import { touchMode } from './touch.js';

export const TIER_ORDER = ['low', 'medium', 'high'];
const ALL_CARDS = ['jacaranda_tree', 'island_tree_01', 'tree_small_02', 'island_tree_02'];
const ALL_MODELS = ['rock_moss_set_01', 'wooden_barrels_01', 'wine_barrel_01', 'wooden_crate_02', 'wooden_bucket_01', 'tree_stump_01'];
const dpr = () => window.devicePixelRatio || 1;

/** The settings of each tier. pr(): the pixel ratio the tier starts at. */
const TIERS = {
  high: {
    antialias: true, post: touchMode ? 'lite' : 'full', shadow: touchMode ? 2048 : 4096, aniso: 8, halfTex: false,
    sky: '4k', skyWait: true, cards: ALL_CARDS, halfCards: false, models: ALL_MODELS,
    crowd: 1, trees: 1, bushes: 1, grass: 1, flowers: 1, tents: 1,
    pr: () => (touchMode ? (dpr() > 2.5 ? 1 : Math.min(dpr(), 1.25)) : Math.min(dpr(), 1.75)),      // (what main.js always used)
  },
  medium: {
    antialias: false, post: 'lite', shadow: 2048, aniso: 4, halfTex: false,
    sky: '2k', skyWait: true, cards: ALL_CARDS, halfCards: true, models: ALL_MODELS.filter(m => m !== 'wooden_barrels_01'),
    crowd: 0.75, trees: 0.6, bushes: 0.6, grass: 0.6, flowers: 0.6, tents: 0.75,
    pr: () => (touchMode ? Math.min(dpr(), 1) : Math.min(dpr(), 1.25)),
  },
  low: {
    antialias: false, post: 'plain', shadow: 1024, aniso: 2, halfTex: true,
    sky: '1k', skyWait: false, cards: ['tree_small_02', 'island_tree_02'], halfCards: true, models: ['rock_moss_set_01', 'wine_barrel_01', 'wooden_crate_02'],
    crowd: 0.45, trees: 0.3, bushes: 0.25, grass: 0.35, flowers: 0.3, tents: 0.6,
    pr: () => Math.min(dpr(), 0.8),
  },
};
export const PR_FLOOR = 0.7;      // the safety net never goes below this pixel ratio before it drops a tier

// ------------------------------------------------------------------ detection
function probe() {
  const out = { gpu: '', maxTex: 0, gl2: false };
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

/** Tier from the hardware. Returns { tier, reason, info }. */
export function detect() {
  const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0, p = probe(), gpu = p.gpu.toLowerCase();
  const info = { mem, cores, gpu: p.gpu, maxTex: p.maxTex, touch: touchMode };
  const why = [];
  let level = 2;      // 0 low, 1 medium, 2 high
  const cap = (l, w) => { if (l < level) { level = l; why.push(w); } };
  if (mem && mem <= 3) cap(0, 'memory ' + mem + ' GB');
  else if (mem && mem <= 4) cap(1, 'memory ' + mem + ' GB');
  if (/swiftshader|llvmpipe|softpipe|basic render|software|mesa offscreen/.test(gpu)) cap(0, 'software renderer');
  if (/powervr|sgx/.test(gpu)) cap(0, 'PowerVR');
  const mali = /mali[- ]?(4\d\d|t\d+|g(31|51|52)\b)/.exec(gpu); if (mali) cap(0, 'older Mali');
  else if (/mali/.test(gpu)) cap(1, 'Mali');
  const ad = /adreno[^0-9]*(\d)(\d\d)\b/.exec(gpu); if (ad) { const g = +ad[1]; if (g <= 5) cap(0, 'Adreno ' + ad[1] + 'xx'); else if (g === 6 && +ad[2] < 40) cap(1, 'Adreno 6xx'); }
  if (/intel.*(hd graphics [2-5]\d\d\d?\b|gma)/.test(gpu) && !/iris|uhd|xe/.test(gpu)) cap(1, 'older Intel graphics');
  if (p.maxTex && p.maxTex < 4096) cap(0, 'max texture ' + p.maxTex);
  else if (p.maxTex && p.maxTex < 8192) cap(touchMode ? 0 : 1, 'max texture ' + p.maxTex);
  if (touchMode && !p.gl2) cap(0, 'WebGL 1 only');
  if (cores && cores <= 2) cap(touchMode ? 0 : 1, cores + ' cores');
  else if (cores && cores <= 4 && touchMode) cap(1, cores + ' cores');
  if (touchMode) cap(1, 'phone');
  return { tier: TIER_ORDER[level], reason: why.join(', ') || 'good device', info };
}

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const valid = (v) => (v === 'low' || v === 'medium' || v === 'high' ? v : null);

/** The player's choice: 'auto' | 'low' | 'medium' | 'high'. */
function readPref() {
  const q = valid(new URLSearchParams(location.search).get('gfx'));
  if (q) { lsSet('tilt.gfx', q); return q; }      // ?gfx=low sticks (the "light version" button uses it)
  const s = valid(lsGet('tilt.gfx')); if (s) return s;
  try { const p = JSON.parse(lsGet('tilt.profile')); if (p && valid(p.gfx)) return p.gfx; } catch (e) { /* ignore */ }
  return 'auto';
}

// ------------------------------------------------------------------ the live object
export const GFX = { tier: 'high', pref: 'auto', detected: 'high', reason: '', info: {}, prScale: 1, dropped: false, listeners: [] };
let dets = null;

function apply(tier) {
  GFX.tier = tier;
  const t = TIERS[tier];
  for (const k of Object.keys(t)) GFX[k] = t[k];
  GFX.pixelRatio = () => Math.max(PR_FLOOR, t.pr() * GFX.prScale);
}

(function init() {
  GFX.pref = readPref();
  dets = detect(); GFX.detected = dets.tier; GFX.reason = dets.reason; GFX.info = dets.info;
  let tier = GFX.pref === 'auto' ? dets.tier : GFX.pref;
  if (GFX.pref === 'auto') {
    const capT = valid(lsGet('tilt.gfxcap'));      // a tier the safety net dropped to on this device earlier
    if (capT && TIER_ORDER.indexOf(capT) < TIER_ORDER.indexOf(tier)) { tier = capT; GFX.reason += '; ran slowly before'; }
  }
  apply(tier);
})();

/** Save the player's choice from the menu chip. Takes effect after a reload. */
export function setPref(pref) {
  GFX.pref = pref === 'low' || pref === 'medium' || pref === 'high' ? pref : 'auto';
  lsSet('tilt.gfx', GFX.pref === 'auto' ? null : GFX.pref);
  if (GFX.pref !== 'auto') lsSet('tilt.gfxcap', null);      // an explicit choice clears the automatic cap
}
export const PREFS = ['auto', 'low', 'medium', 'high'];

// ------------------------------------------------------------------ the live safety net
const WINDOW = 3000, LIMIT = 24, COOLDOWN = 4000;
let acc = 0, n = 0, quiet = 0;
/**
 * Call once a frame with the real frame time in ms (only while the page is visible).
 * If the average stays above ~24 ms for 3 s: lower the pixel ratio by a step (down to PR_FLOOR), then drop a tier. Never raises anything.
 * Calls GFX.listeners (fn({ kind: 'pr'|'tier', pr, tier })) so main.js can apply the change.
 */
export function frameTime(ms, paused = false) {
  if (GFX.pref === 'high') return;      // High was asked for by name: the player has chosen quality over speed
  if (paused || ms > 250 || ms <= 0) { acc = 0; n = 0; return; }      // a hidden tab, a long hitch (loading) or a pause is not slowness
  if (quiet > 0) { quiet -= ms; return; }
  acc += ms; n++;
  if (acc < WINDOW) return;
  const avg = acc / n; acc = 0; const frames = n; n = 0;
  if (avg <= LIMIT || frames < 20) return;
  const base = TIERS[GFX.tier].pr(), cur = Math.max(PR_FLOOR, base * GFX.prScale);
  if (cur > PR_FLOOR + 0.02) {
    GFX.prScale = Math.max(PR_FLOOR / base, GFX.prScale * 0.85);
    emit({ kind: 'pr', pr: GFX.pixelRatio(), avg });
  } else if (GFX.tier !== 'low') {
    const keep = cur, next = TIER_ORDER[TIER_ORDER.indexOf(GFX.tier) - 1];
    apply(next); GFX.dropped = true;
    GFX.prScale = Math.min(1, keep / TIERS[next].pr());      // never above the ratio we were already at
    if (GFX.pref === 'auto') lsSet('tilt.gfxcap', next);
    emit({ kind: 'tier', tier: next, pr: GFX.pixelRatio(), avg });
  } else return;
  quiet = COOLDOWN;
}
function emit(ev) { for (const f of GFX.listeners) { try { f(ev); } catch (e) { console.warn('[gfx] listener', e); } } }
