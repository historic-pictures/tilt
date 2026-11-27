// celebrate.js - FIFA-style celebrations for the rigged rider: after a course won by a clean break or an unhorsing, and after the match.
//
// What is here, so the rest of the game only has to call it:
//   * CELEBS: the catalogue (id, name, how long, which are for the winner / the loser). Every celebration is a pure function of time: it writes joint-angle curves
//     (spine, neck and head, the horse's rear, how far the rider rises in the irons), where the lance points and where the grip goes, and where a free hand goes.
//   * celStart / celStep / celBody / celLance / celArms / celClear: Jouster calls these from update() and applyLance() (see jouster.js). The curves are ADDITIVE on the
//     freshly posed skeleton, like the ride (rider_rig.js rideApply); the right fist stays on the lance (the lance is aimed, then the existing arm IK follows the grip),
//     a free hand is two-bone IK'd to a point (solveArm, with the elbow's side chosen), and the legs are IK'd back onto the irons when he stands in them.
//   * the choice: favourites (profile.celebs, up to four), the AI knights' personality sets, the prompt (desktop chips / phone radial), the net message check.
//   * celCam: the low tracking shot and the close-up (main.js uses it only in non-interactive time).
// Purely cosmetic: nothing here touches scores, timing or the strike code. A replay skips it (the snapshot does not carry it).
import * as THREE from 'three';
import { initialHtml } from './lombard.js';
import { solveArm } from './rider_rig.js';
import { touchMode } from './touch.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => smooth((t - a) / (b - a));
/** 0 -> 1 -> 0: up over [a, b], held to c, down over [c, d]. */
const bump = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
const pump = (t, f, p = 0) => 0.5 - 0.5 * Math.cos((t * f + p) * TAU);
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------------------------------------ the catalogue
/**
 * dur: seconds in a course (2.4-3.8); the match version is `long` (4.2-6.8). kind: win | lose. lance: needs the lance in the hand (a man who has dropped it picks another).
 * still: the horse must be nearly stopped (the rear). blurb: the tooltip in the Armoury.
 */
export const CELEBS = {
  stump:   { name: 'Stump aloft',     kind: 'win',  dur: 3.0, lance: true,  blurb: 'Holds the broken lance high to the stands.' },
  salute:  { name: 'Lance salute',    kind: 'win',  dur: 3.0, lance: true,  blurb: 'A bow, and the lance raised to the royal box.' },
  fists:   { name: 'Both fists',      kind: 'win',  dur: 3.3, lance: true,  blurb: 'Stands in the stirrups with both fists up.' },
  helm:    { name: 'Helm waved',      kind: 'win',  dur: 3.7, lance: true,  blurb: 'Takes off the helm and waves it to the stands.' },
  point:   { name: 'More noise!',     kind: 'win',  dur: 3.2, lance: true,  blurb: 'Points at the crowd and cups an ear for more.' },
  rear:    { name: 'Pesade',          kind: 'win',  dur: 3.4, lance: false, still: true, blurb: 'The horse rears, the rider holding on.' },
  gallery: { name: 'The gallery',     kind: 'win',  dur: 3.4, lance: true,  blurb: 'A slow ride along the stands, an arm raised to the ladies.' },
  favour:  { name: 'The favour',      kind: 'win',  dur: 3.9, lance: false, blurb: 'Bows to the lady and catches the ribbon she throws.' },
  chest:   { name: 'Breastplate',     kind: 'win',  dur: 3.0, lance: true,  blurb: 'Beats his breastplate twice.' },
  nod:     { name: 'Sporting nod',    kind: 'lose', dur: 2.4, lance: false, blurb: 'A bow of the head to the better man.' },
  slap:    { name: 'Helm slap',       kind: 'lose', dur: 2.4, lance: false, blurb: 'Slaps his helm in frustration.' },
};
export const WIN_IDS = Object.keys(CELEBS).filter(k => CELEBS[k].kind === 'win');
export const LOSE_IDS = Object.keys(CELEBS).filter(k => CELEBS[k].kind === 'lose');
export const DEFAULT_FAVS = ['stump', 'salute', 'fists', 'gallery'];
export const MAX_FAVS = 4;
const longOf = (d) => Math.min(6.8, d * 1.8);
const GOLD_SHORT = { stump: 'Stump', salute: 'Salute', fists: 'Fists', helm: 'Helm', point: 'Noise', rear: 'Pesade', gallery: 'Ladies', favour: 'Favour', chest: 'Chest', nod: 'Nod', slap: 'Slap' };
export const shortName = (id) => GOLD_SHORT[id] || id;
/** A celebration id that arrived from the friend: a known id or nothing. */
export const cleanCel = (id) => (typeof id === 'string' && CELEBS[id] ? id : null);

/** The favourites of a profile (up to four, only known winning celebrations), else the defaults. */
export function favourites(p) {
  const f = ((p && p.celebs) || []).filter((x, i, a) => CELEBS[x] && CELEBS[x].kind === 'win' && a.indexOf(x) === i).slice(0, MAX_FAVS);
  return f.length ? f : DEFAULT_FAVS.slice();
}
/** Toggle one in the profile's list (the Armoury's Knight tab). Returns true if it is now chosen. */
export function toggleFav(p, id) {
  if (!CELEBS[id] || CELEBS[id].kind !== 'win') return false;
  const f = (p.celebs && p.celebs.length ? p.celebs : []).filter(x => CELEBS[x]).slice();
  const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else if (f.length < MAX_FAVS) f.push(id); else return false;
  p.celebs = f; return i < 0;
}
/** What the prompt offers: the favourites, topped up from the defaults and the rest to at least three. */
export function promptChoices(p, ok = () => true) {
  const out = [], add = (x) => { if (CELEBS[x] && ok(x) && !out.includes(x) && out.length < MAX_FAVS) out.push(x); };
  favourites(p).forEach(add); DEFAULT_FAVS.forEach(x => out.length < 3 && add(x)); WIN_IDS.forEach(x => out.length < 3 && add(x));
  return out;
}
/** The AI knights' sets, by temperament: the showmen, the courtiers, the hard men. A knight not listed takes a set by his skill and drive. */
const AI_SETS = {
  show:  ['fists', 'rear', 'helm', 'stump', 'chest'],
  court: ['salute', 'favour', 'gallery', 'helm'],
  hard:  ['chest', 'point', 'stump', 'salute'],
};
const AI_WHO = { clifford: 'hard', renaud: 'court', boucicaut: 'court', lalaing: 'show', quinones: 'show', freydal: 'show' };
export function aiPick(od, ok = () => true) {
  const id = (od && od.id) || '', k = AI_WHO[id] || (od && od.skill > 0.7 ? 'show' : od && od.drive > 0.9 ? 'court' : 'hard');
  let set = AI_SETS[k].filter(ok); if (!set.length) set = AI_SETS.hard.filter(ok); if (!set.length) set = ['stump'];
  return set[Math.floor(Math.random() * set.length)];
}
/** A beaten man's reaction: the proud ones slap the helm, the rest nod. */
export function aiLoser(od, isPlayer = false) { const hot = isPlayer ? 0.25 : od && od.skill > 0.7 ? 0.5 : 0.25; return Math.random() < hot ? 'slap' : 'nod'; }

const HERALD = {
  stump:   ['holds the broken lance aloft', 'raises the shattered lance to the stands'],
  salute:  ['salutes the royal box with his lance', 'bows to the box, lance raised'],
  fists:   ['stands in his stirrups, fists to the sky', 'is up in the irons and roaring'],
  helm:    ['doffs his helm to the crowd', 'waves his helm to the stands'],
  point:   ['calls for more noise', 'cups his ear and the commons answer'],
  rear:    ['rears his horse before the stands', 'sits a fine pesade'],
  gallery: ['salutes the ladies of the gallery', 'rides slowly past the gallery, arm raised'],
  favour:  ['bows to his lady and catches her favour', 'takes the ribbon thrown from the gallery'],
  chest:   ['beats his breastplate', 'beats his breast before the crowd'],
};
/** A herald's line for a winner's celebration ('' for the loser's gestures). */
export function heraldLine(id, name, match) {
  const L = HERALD[id]; if (!L) return '';
  const t = L[Math.floor(Math.random() * L.length)];
  return match ? `${name} ${t}. The field is his!` : `${name} ${t}.`;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _sh = new THREE.Vector3(), _h0 = new THREE.Vector3(), _tg = new THREE.Vector3();
const SPINE_W = [['Spine', 0.28], ['Spine1', 0.34], ['Spine2', 0.38]];
const newO = () => ({ tx: 0, ty: 0, tz: 0, hx: 0, hy: 0, hz: 0, rise: 0, rear: null, L: null, R: null, Lw: null, lance: null, helmOff: false, prop: null, kL: 0, kR: 0, kLance: 0 });

/** The default place the crowd is, in the world: the royal side, level with the rider (the gallery). Overridden by the box (match) via opts.tgt. */
export const crowdPoint = (J, out = new THREE.Vector3()) => out.set(14.5, 3.0, J.root.position.z);


// ------------------------------------------------------------------------------------------------ the mocap cheers (assets/motion/yt: draft quality, a seated spectator)
// The clips are quaternions of a different, seated body, so they are not played on the rider. What is kept is their RHYTHM: the arm bone that moves most is turned into one
// signal in -1..1 (its swing about the dominant axis), and the procedural curves read that instead of a plain sine: cheer_b_wave drives the waves (gallery, helm, favour),
// cheer_a_fist_laugh the fist pumps (fists, stump). Until the file has loaded, or if it cannot, the sines below are used.
const MOCAP = {};
function analyse(d) {
  let best = null;
  for (const n of ['RightForeArm', 'LeftForeArm', 'RightArm', 'LeftArm', 'RightHand', 'LeftHand']) {
    const A = d.bones && d.bones[n]; if (!A || A.length < 8) continue;
    const q0 = new THREE.Quaternion().fromArray(A[0]).invert(), v = A.map((a) => { const q = new THREE.Quaternion().fromArray(a).multiply(q0); if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); const ang = 2 * Math.acos(clamp(q.w, -1, 1)), sn = Math.sqrt(Math.max(1e-9, 1 - q.w * q.w)); return [q.x / sn * ang, q.y / sn * ang, q.z / sn * ang]; });
    const m = [0, 0, 0]; v.forEach(x => { for (let i = 0; i < 3; i++) m[i] += x[i] / v.length; });
    let ax = [1, 0.3, 0.1]; for (let it = 0; it < 12; it++) { const o = [0, 0, 0]; v.forEach(x => { const c = [x[0] - m[0], x[1] - m[1], x[2] - m[2]], d_ = c[0] * ax[0] + c[1] * ax[1] + c[2] * ax[2]; for (let i = 0; i < 3; i++) o[i] += c[i] * d_; }); const l = Math.hypot(...o) || 1; ax = o.map(x => x / l); }
    const sig = v.map(x => (x[0] - m[0]) * ax[0] + (x[1] - m[1]) * ax[1] + (x[2] - m[2]) * ax[2]), mx = Math.max(...sig.map(Math.abs)) || 1, spread = Math.max(...sig) - Math.min(...sig);
    if (!best || spread > best.spread) best = { spread, sig: sig.map(x => x / mx), n };
  }
  return best && { sig: best.sig, dur: d.duration_s || best.sig.length / (d.fps || 30), bone: best.n };
}
const loadMocap = (name) => { try { fetch(new URL(`../assets/motion/yt/${name}.json`, import.meta.url).href).then(r => (r.ok ? r.json() : null)).then(d => { if (d) MOCAP[name] = analyse(d); }).catch(() => {}); } catch (e) { /* no fetch */ } };
['cheer_b_wave', 'cheer_a_fist_laugh', 'cheer_c_shout'].forEach(loadMocap);
/** The mocap rhythm of clip `name` at time t (ping-pong over the clip), -1..1; `fb` (a sine) when it has not loaded. */
function mc(name, t, fb) {
  const m = MOCAP[name]; if (!m) return fb;
  const u = ((t % (2 * m.dur)) + 2 * m.dur) % (2 * m.dur), x = (u > m.dur ? 2 * m.dur - u : u) / m.dur * (m.sig.length - 1), i = Math.min(m.sig.length - 2, Math.floor(x));
  return lerp(m.sig[i], m.sig[i + 1], x - i);
}
export const mocapReady = () => Object.keys(MOCAP).filter(k => MOCAP[k]);

// ------------------------------------------------------------------------------------------------ the curves
// X = { ty: yaw (rad) of the crowd from the rider's heading, + = to his left; sd: its sign; dur }. Positions are metres in the rider's frame (origin at the hips, +x left, +y up, +z forward);
// the shoulders are at (+-0.22, 0.39, 0.01), the head at y 0.62, the helm top near 0.82, a hanging hand near (0.17, 0.02, 0.16), the lance grip near (-0.22, 0.19, 0.25).
const LANCE_UP = (k = 0, tilt = 0) => ({ dir: [tilt, 1, 0.12 + k], pos: [0.1, 0.24, 0.08] });
const POSES = {
  stump(c, t, o, X) {
    const up = ramp(t, 0.1, 0.7), pu = 0.5 + 0.5 * mc('cheer_a_fist_laugh', t, Math.cos(t * TAU * 1.15 + Math.PI));
    o.lance = { dir: [Math.sin(X.ty) * 0.45, 1, 0.22], pos: [0.07, (0.3 + 0.14 * pu) * up, 0.05] };
    o.hy = clamp(X.ty * 0.5, -0.7, 0.7) * up; o.hx = -0.3 * up; o.tx = -0.1 * up + 0.05 * pu; o.ty = clamp(X.ty * 0.3, -0.5, 0.5) * up;
  },
  salute(c, t, o, X) {
    const bow = bump(t, 0.5, 1.0, 1.05, 1.5), up = ramp(t, 0.05, 0.5);
    o.lance = { dir: [Math.sin(X.ty) * 0.4 * (0.4 + bow), 1, 0.1 + 0.55 * bow], pos: [0.1, 0.24 * up + 0.04 * bow, 0.08 + 0.1 * bow] };
    o.tx = 0.36 * bow; o.hx = 0.3 * bow - 0.1 * (1 - bow) * up; o.hy = clamp(X.ty * 0.55, -0.7, 0.7) * (1 - bow) * up; o.ty = clamp(X.ty * 0.3, -0.5, 0.5) * (1 - bow) * up;
  },
  fists(c, t, o, X) {
    const st = ramp(t, 0.2, 0.8), pu = 0.5 + 0.5 * mc('cheer_a_fist_laugh', t * 1.1, Math.cos(t * TAU * 1.5 + Math.PI));
    o.rise = 0.11 * st; o.lance = { dir: [0.05, 1, 0.1], pos: [0.1, (0.4 + 0.1 * pu) * st, 0.05] };
    o.L = [0.3, 0.8 + 0.06 * pu, 0.12]; o.tx = -0.12 * st; o.hx = -0.32 * st; o.hy = clamp(X.ty * 0.3, -0.5, 0.5) * st; o.ty = 0.1 * Math.sin(t * 3) * st;
  },
  helm(c, t, o, X) {
    const toHead = ramp(t, 0.15, 0.7), out = ramp(t, 0.75, 1.4), back = ramp(t, c.dur - 1.0, c.dur - 0.35), wv = mc('cheer_b_wave', (t - 1.4) * 1.1, Math.sin(TAU * 2.2 * (t - 1.4))) * ramp(t, 1.4, 1.8) * (1 - back);
    o.lance = LANCE_UP(0.05);
    const head = [0.06, 0.8, 0.08], high = [0.3 + 0.12 * wv, 0.96, 0.1 + 0.14 * wv];
    const p = (i) => lerp(lerp(i === 1 ? 0.3 : 0.12, head[i], toHead), high[i], out);
    o.L = [p(0), p(1), p(2)]; if (back > 0) { o.L = o.L.map((v, i) => lerp(v, head[i], back)); }
    o.helmOff = t > 0.8 && t < c.dur - 0.5; o.prop = o.helmOff ? { type: 'helm' } : null;
    o.hy = clamp(X.ty * 0.55, -0.7, 0.7) * toHead; o.hx = -0.15 * out; o.tx = -0.05 * out;
  },
  point(c, t, o, X) {
    const pt = ramp(t, 0.15, 0.7), sw = Math.sin(t * 3.2) * 0.18, ear = ramp(t, 0.9, 1.4), hold = pump(t, 1.3);
    const yaw = X.ty * 0.9 + sw * pt;
    o.lance = { dir: [Math.sin(yaw), 0.18 + 0.12 * hold, Math.cos(yaw) * 0.9], pos: [-0.02, 0.12 * pt, 0.26 * pt] };
    o.L = [0.12, lerp(0.3, 0.7, ear), lerp(0.14, 0.01, ear)]; if (ear <= 0) o.L = null;
    o.hy = clamp(X.ty * 0.5, -0.7, 0.7) * pt; o.hz = -0.16 * X.sd * ear; o.hx = -0.05 * ear; o.ty = clamp(X.ty * 0.35, -0.5, 0.5) * pt;
  },
  rear(c, t, o, X) {
    const up = bump(t, 0.35, 1.0, c.dur - 1.3, c.dur - 0.45);
    o.rear = 0.92 * up; o.tx = 0.3 * up; o.hx = -0.2 * up;
    o.lance = { dir: [0.05, 1, 0.1], pos: [0.08, 0.3 * up, 0.08] };
  },
  gallery(c, t, o, X) {
    const a = ramp(t, 0.1, 0.65), wv = mc('cheer_b_wave', t * 0.9, Math.sin(TAU * 1.9 * t));
    o.L = [0.32 + 0.1 * wv * a, 0.9, 0.1 + 0.12 * wv]; o.lance = LANCE_UP(0.15);
    o.hy = clamp(X.ty * 0.5, -0.7, 0.7) * a; o.ty = clamp(X.ty * 0.3, -0.5, 0.5) * a; o.tx = 0.07 * pump(t, 0.9) * a; o.hx = 0.04;
  },
  favour(c, t, o, X) {
    const bow = bump(t, 0.2, 0.75, 0.95, 1.35), flight = clamp((t - 0.85) / 0.85, 0, 1), caught = t > 1.75, hi = ramp(t, 1.8, 2.3), wv = mc('cheer_b_wave', (t - 2.3) * 0.9, Math.sin(TAU * 2 * (t - 2.3))) * ramp(t, 2.3, 2.7);
    o.tx = 0.34 * bow; o.hx = 0.28 * bow; o.hy = clamp(X.ty * 0.5, -0.7, 0.7) * (0.3 + 0.7 * (1 - bow)); o.lance = LANCE_UP(0.1);
    if (!caught && flight > 0.25) o.Lw = 'ribbon'; else if (caught) o.L = [lerp(0.4, 0.3 + 0.1 * wv, hi), lerp(0.5, 0.94, hi), lerp(0.4, 0.1 + 0.14 * wv, hi)];
    o.prop = { type: 'ribbon', flight, caught, t };
  },
  chest(c, t, o, X) {
    const a = ramp(t, 0.1, 0.6), ph = ((t - 0.75) / 0.62) % 1, hit = t < 0.75 ? 0 : smooth(clamp(ph / 0.3, 0, 1)) * (1 - smooth(clamp((ph - 0.3) / 0.3, 0, 1)));
    o.L = [lerp(0.28, 0.0, hit), lerp(0.55, 0.34, hit), lerp(0.28, 0.17, hit)]; o.lance = LANCE_UP(0.1);
    o.tx = -0.08 * a - 0.1 * hit; o.hx = -0.28 * a; o.hy = clamp(X.ty * 0.3, -0.5, 0.5) * a;
  },
  nod(c, t, o, X) {
    const n = bump(t, 0.3, 0.8, 1.2, 1.8);
    o.lance = { dir: [0.15, 0.95, 0.3], pos: [0.06, 0.1 * bump(t, 0.1, 0.5, 1.6, 2.1), 0.1] };
    o.hx = 0.42 * n; o.tx = 0.14 * n; o.hy = clamp(X.ty * 0.2, -0.3, 0.3) * n;
  },
  slap(c, t, o, X) {
    const a = ramp(t, 0.15, 0.55), s1 = bump(t, 0.55, 0.7, 0.72, 0.85), s2 = bump(t, 1.05, 1.2, 1.22, 1.35), sl = Math.max(s1, s2);
    o.L = [0.07, lerp(0.84, 0.78, sl), 0.07]; if (a <= 0) o.L = null; else o.L = o.L.map((v, i) => lerp(i === 0 ? 0.25 : i === 1 ? 0.45 : 0.2, v, a));
    o.hy = 0.3 * Math.sin(TAU * 1.6 * t) * a; o.tx = 0.2 * a; o.hx = 0.15 * a;
    o.helmOff = false;
  },
};

// ------------------------------------------------------------------------------------------------ props: the helm in the hand, the favour
let _helmGeo = null, _helmMat = null, _slitMat = null;
function makeHelm() {
  if (!_helmGeo) {
    const pts = [[0.001, 0.0], [0.11, 0.0], [0.13, 0.05], [0.135, 0.13], [0.12, 0.21], [0.07, 0.27], [0.001, 0.29]].map(([x, y]) => new THREE.Vector2(x, y));
    _helmGeo = new THREE.LatheGeometry(pts, 14); _helmMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.75, roughness: 0.38 }); _slitMat = new THREE.MeshBasicMaterial({ color: 0x15110e });
  }
  const g = new THREE.Group(), m = new THREE.Mesh(_helmGeo, _helmMat); m.castShadow = true; g.add(m);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.02), _slitMat); slit.position.set(0, 0.16, 0.125); g.add(slit);
  g.userData.kind = 'helm'; return g;
}
function makeRibbon(col) {
  const geo = new THREE.PlaneGeometry(0.06, 0.46, 1, 8); geo.translate(0, -0.23, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.6 })); m.castShadow = true; m.frustumCulled = false;
  m.userData.kind = 'ribbon'; m.userData.base = Float32Array.from(geo.attributes.position.array); return m;
}
function flutter(m, t, amt = 1) {
  const a = m.geometry.attributes.position.array, b = m.userData.base;
  for (let i = 0; i < a.length; i += 3) { const w = -b[i + 1] / 0.46; a[i] = b[i] + Math.sin(t * 12 + b[i + 1] * 16) * 0.035 * w * amt; a[i + 2] = Math.sin(t * 9 + b[i + 1] * 11) * 0.03 * w * amt; }
  m.geometry.attributes.position.needsUpdate = true;
}
function dropProps(c) { if (!c || !c.props) return; for (const k in c.props) { const p = c.props[k]; p.removeFromParent(); if (p.userData.kind === 'ribbon') { p.geometry.dispose(); p.material.dispose(); } } c.props = null; }
function prop(J, c, kind) {
  c.props = c.props || {};
  if (!c.props[kind]) {
    const p = kind === 'helm' ? makeHelm() : makeRibbon((J.arms && J.arms.c2 && new THREE.Color(J.arms.c2).getHex() !== 0xffffff) ? 0xc0341f : 0xc0341f);
    p.visible = false; (J.root.parent || J.root).add(p); c.props[kind] = p;
  }
  return c.props[kind];
}

// ------------------------------------------------------------------------------------------------ life of a celebration on a jouster
const cloneO = (o) => ({ ...o, L: o.L && o.L.slice(), R: o.R && o.R.slice(), lance: o.lance && { dir: o.lance.dir.slice(), pos: o.lance.pos.slice() } });
const mixV = (a, b, k) => (a && b ? a.map((v, i) => lerp(v, b[i], k)) : a || b);
/** Cross-fade from the previous celebration's curves to these (x 0..1): numbers mix, a hand or the lance fades in or out by its weight. */
function blendO(a, o, x) {
  for (const k of ['tx', 'ty', 'tz', 'hx', 'hy', 'hz', 'rise']) o[k] = lerp(a[k], o[k], x);
  if (a.rear != null || o.rear != null) o.rear = lerp(a.rear || 0, o.rear || 0, x);
  o.L = mixV(a.L, o.L, a.L && o.L ? x : 1); o.kL = lerp(a.kL, o.kL, x); o.R = mixV(a.R, o.R, a.R && o.R ? x : 1); o.kR = lerp(a.kR, o.kR, x);
  if (a.lance && o.lance) o.lance = { dir: mixV(a.lance.dir, o.lance.dir, x), pos: mixV(a.lance.pos, o.lance.pos, x) }; else o.lance = o.lance || a.lance; o.kLance = lerp(a.kLance, o.kLance, x);
}
/**
 * Begin a celebration on jouster J (a rig rider). opts: mode 'course' | 'match' (the match version lasts longer), tgt (world point of the crowd; default the royal side).
 * A second call while one runs hands over (the pose keeps its blend weight, so the change is a cross-fade of the targets). Returns false if J has no rig.
 */
export function celStart(J, id, opts = {}) {
  const def = CELEBS[id]; if (!def || !J || !J.rig || J.unhorsed) return false;
  const prev = J.cel, mode = opts.mode === 'match' ? 'match' : 'course';
  if (prev) dropProps(prev);
  const dur = mode === 'match' && def.kind === 'win' ? longOf(def.dur) : def.dur;
  J.cel = { id, def, t: 0, dur, mode, w: prev ? prev.w : 0, o: newO(), tgt: opts.tgt ? opts.tgt.clone() : null, props: null, X: { ty: 0, sd: 1, dur }, done: false, prev: prev ? cloneO(prev.o) : null };
  return true;
}
export const celActive = (J) => !!(J && J.cel && !J.cel.done);
/** Stop at once (a new course, the match is over, the player skipped): props removed, the pose is the game's own again next frame. */
export function celClear(J) {
  if (!J || !J.cel) return;
  dropProps(J.cel); J.celHelmOff = false; J.cel = null;
}

/** The world point of the crowd for J (its own, else the royal side), and the yaw of it from his heading. */
function aimOf(J, c) {
  const tgt = c.tgt || crowdPoint(J, _tg); _a.copy(tgt); J.rider.worldToLocal(_a);
  c.X.ty = clamp(Math.atan2(_a.x, _a.z), -2.4, 2.4); c.X.sd = c.X.ty >= 0 ? 1 : -1; c.X.dur = c.dur;
}

/** Advance the clock and evaluate the curves into c.o (called every frame from Jouster.update, before the pose is built). */
export function celStep(J, dt) {
  const c = J.cel; if (!c) return;
  if (J.replaying) return;
  if (J.unhorsed || !J.rig) { celClear(J); return; }
  dt /= Math.max(0.05, J.celTs || 1);      // (a celebration runs in real time: slow motion and hit-stop do not stretch it; main.js sets celTs)
  c.t += dt;
  if (c.t >= c.dur) { c.done = true; J.celHelmOff = false; c.w = 0; dropProps(c); if (!J.remote && J.rear > 0) J.rear = Math.max(0, J.rear - 0.02); J.cel = null; return; }
  const t = c.t, o = c.o; Object.assign(o, newO()); aimOf(J, c);
  POSES[c.id](c, t, o, c.X);
  o.kL = o.L || o.Lw ? 1 : 0; o.kR = o.R ? 1 : 0; o.kLance = o.lance ? 1 : 0;
  if (c.prev && t < 0.3) blendO(c.prev, o, smooth(t / 0.3));
  c.wt = c.prev ? 1 : ramp(t, 0, 0.4); c.wt *= 1 - ramp(t, c.dur - 0.5, c.dur);      // the blend weight of this celebration
  c.w += (c.wt - c.w) * Math.min(1, dt * 10); if (t > c.dur - 0.5) c.w = Math.min(c.w, c.wt);
  J.celHelmOff = !!o.helmOff;
  if (o.rear != null && !J.remote) J.rear = Math.max(J.rear, o.rear);
}

/** Spine, neck, the rise in the irons (legs IK'd back to them), and the grip's offset. After poseRig. */
export function celBody(J) {
  const c = J.cel; if (!c || J.replaying) return;
  const o = c.o, w = c.w, R = J.rig, B = R.bones; if (w < 0.002) return;
  for (const [n, k] of SPINE_W) { const b = B[n]; _q.setFromEuler(_e.set(o.tx * w * k, o.ty * w * k, o.tz * w * k, 'YXZ')); b.quaternion.premultiply(_q); }
  if (o.hx || o.hy || o.hz) { _q.setFromEuler(_e.set(o.hx * w, o.hy * w, o.hz * w, 'YXZ')); B.Neck.quaternion.premultiply(_q); }
  if (o.rise > 0.002) {
    R.root.updateMatrixWorld(true);
    const ft = [];
    for (const s of ['Left', 'Right']) { const f = B[s + 'Foot']; ft.push([f.getWorldPosition(new THREE.Vector3()), f.getWorldQuaternion(new THREE.Quaternion())]); }
    B.Hips.position.y += o.rise * w; R.root.updateMatrixWorld(true);
    J.rider.getWorldQuaternion(_rq);
    ['Left', 'Right'].forEach((s, i) => { _d.set(i ? -0.3 : 0.3, 0.1, 1).applyQuaternion(_rq); solveLimb(B[s + 'UpLeg'], B[s + 'Leg'], B[s + 'Foot'], ft[i][0], ft[i][1], _d); });
  }
  if (o.lance && J.lance.visible) { const p = o.lance.pos, k = w * o.kLance; J.lance.position.x += p[0] * k; J.lance.position.y += p[1] * k; J.lance.position.z += p[2] * k; }
  R.root.updateMatrixWorld(true);
}

/** Point the lance (called inside applyLance, once its normal aim is set, before its matrix is updated). */
export function celLance(J) {
  const c = J.cel; if (!c || J.replaying || !c.o.lance || !J.lance.visible) return;
  const w = c.w * c.o.kLance; if (w < 0.002) return;
  J.rider.getWorldQuaternion(_rq); _d.fromArray(c.o.lance.dir).normalize().applyQuaternion(_rq);
  J.lance.parent.updateWorldMatrix(true, false); J.lance.parent.getWorldQuaternion(_q2).invert(); _d.applyQuaternion(_q2);
  _q.setFromUnitVectors(Z, _d); J.lance.quaternion.slerp(_q, w);
}

/** After armsRig: the free hands, and the props that ride on them. */
export function celArms(J) {
  const c = J.cel; if (!c || J.replaying) return;
  const o = c.o, w = c.w, R = J.rig, B = R.bones; if (w < 0.002) return;
  J.rider.getWorldQuaternion(_rq);
  const ribbon = o.prop && o.prop.type === 'ribbon' ? prop(J, c, 'ribbon') : null;
  let ribbonAt = null;
  if (ribbon) ribbonAt = ribbonFlight(J, c, ribbon);
  const reach = (side, pt, world, k) => {      // a hand to a point in the rider's frame (or the world), faded in by w; the elbow goes out and down
    const A = B[side + 'Arm'], F = B[side + 'ForeArm'], H = B[side + 'Hand'];
    R.root.updateMatrixWorld(true); H.getWorldPosition(_h0); const hq = H.getWorldQuaternion(new THREE.Quaternion());
    if (world) _c.copy(pt); else _c.fromArray(pt).applyMatrix4(J.rider.matrixWorld);
    _c.lerpVectors(_h0, _c, w * k);
    _d.set(side === 'Left' ? 0.7 : -0.7, -0.6, -0.5).applyQuaternion(_rq);
    solveLimb(A, F, H, _c, hq, _d); R.root.updateMatrixWorld(true);
  };
  const free = !J.lance.visible || J.lanceDropped;
  if (o.L && o.kL > 0.002) reach('Left', o.L, false, o.kL); else if (o.Lw === 'ribbon' && ribbonAt) reach('Left', ribbonAt, true, 1);
  if (o.R && free && o.kR > 0.002) reach('Right', o.R, false, o.kR);
  // props
  if (o.prop && o.prop.type === 'helm') { const h = prop(J, c, 'helm'); B.LeftHand.getWorldPosition(h.position); _a.set(0, 0.07, 0.02).applyQuaternion(_rq); h.position.add(_a); h.quaternion.copy(_rq); h.rotateZ(-0.25 + Math.sin(c.t * 14) * 0.08); h.scale.setScalar(1); h.visible = true; }
  else if (c.props && c.props.helm) c.props.helm.visible = false;
  if (ribbon) { if (o.prop.caught) { B.LeftHand.getWorldPosition(ribbon.position); ribbon.position.y -= 0.0; ribbon.quaternion.set(0, 0, 0, 1); ribbon.rotation.z = 0.2 * Math.sin(c.t * 8); } flutter(ribbon, c.t); ribbon.visible = true; }
}
/** Where the thrown favour is: from the gallery (in the rider's frame, toward the crowd) to the catch point by the left hand. Returns the world point, and places the mesh. */
function ribbonFlight(J, c, rib) {
  const pr = c.o.prop, ty = c.X.ty, u = pr.flight;
  const start = _a.set(Math.sin(ty) * 7, 3.6, Math.cos(ty) * 7), end = _b.set(0.42, 0.62, 0.42), p = _c.lerpVectors(start, end, smooth(u)); p.y += Math.sin(Math.PI * u) * 1.1;
  const w = p.clone().applyMatrix4(J.rider.matrixWorld);
  if (!pr.caught) { rib.position.copy(w); rib.rotation.set(0, 0, 0); rib.rotation.z = u * 7; rib.quaternion.premultiply(_rq); rib.visible = u > 0.01; }
  return u > 0.2 ? w : null;
}

// ------------------------------------------------------------------------------------------------ two-bone IK with a pole (the elbow's, or the knee's, side)
const _s = new THREE.Vector3(), _el = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _e2 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion();
function rotateWorld(b, dq) { b.getWorldQuaternion(_q3).premultiply(dq); b.parent.getWorldQuaternion(_q4); b.quaternion.copy(_q4.invert().multiply(_q3)); b.updateMatrix(); }
/** solveArm (rider_rig.js) with the bend's side given: `pole` is a world direction the middle joint should lean toward. hq: the end bone's world rotation to keep. */
export function solveLimb(A, F, H, tgt, hq, pole) {
  A.updateWorldMatrix(true, false); A.getWorldPosition(_s); F.getWorldPosition(_el); H.getWorldPosition(_w);
  const l1 = _s.distanceTo(_el), l2 = _el.distanceTo(_w);
  _u.subVectors(tgt, _s); let d = _u.length(); if (d < 1e-6) return false; _u.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u)); if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0).addScaledVector(_u, _u.y); _p.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  _e2.copy(_s).addScaledVector(_u, a).addScaledVector(_p, h); _w2.copy(_s).addScaledVector(_u, d);
  _d1.subVectors(_el, _s).normalize(); _d2.subVectors(_e2, _s).normalize(); rotateWorld(A, _q5.setFromUnitVectors(_d1, _d2));
  A.updateWorldMatrix(false, true); F.getWorldPosition(_el); H.getWorldPosition(_w);
  _d1.subVectors(_w, _el).normalize(); _d2.subVectors(_w2, _e2).normalize(); rotateWorld(F, _q5.setFromUnitVectors(_d1, _d2));
  F.updateWorldMatrix(false, true);
  if (hq) { H.parent.getWorldQuaternion(_q4); H.quaternion.copy(_q4.invert().multiply(hq)); H.updateMatrix(); }
  return true;
}

// ------------------------------------------------------------------------------------------------ the camera
const _cs = new THREE.Vector3(), _cv = new THREE.Vector3();
export const CEL_CAM_RATE = 6;
/**
 * The celebration cam: ONE continuous tracking shot on the celebrating rider for the whole celebration (no cut, no close-up swap). Fills `want` and `look`, returns { fov, shot: 1, rate }.
 * It rides alongside him at 4.8-5.7 m, at his chest height and a little above, in front of his shoulder (three-quarter), a slow push-in and a slight orbit for life. His own velocity
 * is added ahead of both points, so the damped camera (main.js lerps it at `rate`) sits where he IS, not a stride behind: he stays framed, with his horse, however he rides, turns or rears.
 * Course: on his own side of the tilt (the cloth and the other lane are never between the lens and the horse; the lens is above the rail, 2.1 m up, anyway). Match: at the royal box, from his
 * side and a little behind, so the box is behind him. J: the rider; t, dur: the celebration clock.
 */
export function celCam(J, t, dur, want, look) {
  const c = J.cel, p = J.root.position, sy = J.seatY || 1.71, match = c ? c.mode === 'match' : false;
  const st = c.cv || (c.cv = { p: new THREE.Vector3(), t: -1, v: new THREE.Vector3(), f: new THREE.Vector3(Math.sin(J.root.rotation.y), 0, Math.cos(J.root.rotation.y)), n: 0 });
  if (st.t < 0) { st.v.copy(st.f).multiplyScalar(J.speed || 0); st.n = Math.sign(p.x) || 1; }
  else if (t > st.t) { const dt = t - st.t; _cv.set((p.x - st.p.x) / dt, 0, (p.z - st.p.z) / dt); if (_cv.lengthSq() < 400) st.v.lerp(_cv, Math.min(1, dt * 6)); }
  st.p.copy(p); st.t = t;
  const sp = Math.hypot(st.v.x, st.v.z);
  if (sp > 1.2) { _cv.set(st.v.x / sp, 0, st.v.z / sp); st.f.lerp(_cv, 0.08).normalize(); }      // (heading: his way of going, held when he slows or stops)
  // the chest: the torso's height (it rises on the pesade and the fists) and a point between rider and horse to look at
  (J.torso || J.rider).getWorldPosition(_cs); const ty = Math.max(sy - 0.1, _cs.y), u = clamp(t / Math.max(0.1, dur), 0, 1);
  const ph = t * 0.5, fz = st.f.z >= 0 ? 1 : -1;
  let ox, oz, D;
  if (match) { D = 5.8 - 0.6 * u; const a = -0.45 + 0.2 * Math.sin(ph), nx = -st.f.z, nz = st.f.x; ox = nx * D * Math.cos(a) + st.f.x * D * Math.sin(a); oz = nz * D * Math.cos(a) + st.f.z * D * Math.sin(a); }      // (his side, a little behind: the box is beyond him)
  else { D = 5.7 - 0.9 * u; const a = 0.5 + 0.2 * Math.sin(ph); ox = st.n * D * Math.cos(a); oz = fz * D * Math.sin(a); }      // (his own side, in front of his shoulder)
  const lead = 1 / CEL_CAM_RATE;
  want.set(p.x + ox + st.v.x * lead, Math.max(2.05, ty + 0.2), p.z + oz + st.v.z * lead);
  look.set(p.x + st.v.x * lead * 0.8, ty - 0.2 + 0.08 * u, p.z + st.v.z * lead * 0.8);
  return { fov: 33 - 3 * u, shot: 1, rate: CEL_CAM_RATE };
}

// ------------------------------------------------------------------------------------------------ the prompt: a few seconds' choice, like picking a FIFA celebration
// Desktop: a row of chips with the key (1-4, or the arrow in the same place). Phone: a radial of round icon buttons inside the safe area. No input: the default plays on.
const ICONS = {
  stump: 'M96 440 352 96l48 32-40 48 48 24-40 32L130 470z',
  salute: 'M244 40h24v440h-24zM268 52l152 48-152 50z',
  fists: 'M110 470V250a44 44 0 0 1 88 0v220zM314 470V250a44 44 0 0 1 88 0v220z',
  helm: 'M96 420V250C96 150 166 80 256 80s160 70 160 170v170zM150 270v40h212v-40z',
  point: 'M50 210h250V130l160 126-160 126V302H50z',
  rear: 'M110 450V250c0-100 60-170 146-170s146 70 146 170v200h-84V260c0-42-26-72-62-72s-62 30-62 72v190z',
  gallery: 'M110 70h44v410h-44zM154 86c80-50 150 60 250 8v170c-100 52-170-58-250-8z',
  favour: 'M256 230 90 120v230zM256 230l166-110v230zM256 190a38 38 0 1 1 0 .1zM236 330 170 480l62-22 24 40 24-40 62 22-66-150z',
  chest: 'M256 40 90 100v140c0 120 70 190 166 232 96-42 166-112 166-232V100z',
  nod: 'M70 150l186 214 186-214v96L256 460 70 246z',
  slap: 'M150 470V270l-34-96 42-14 32 84V60h46v150V40h46v170V62h46v160V120h42v230c0 70-52 120-124 120z',
};
let uiReady = false, pr = null;
function injectUi() {
  if (uiReady || typeof document === 'undefined') return; uiReady = true;
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sprite.setAttribute('width', '0'); sprite.setAttribute('height', '0'); sprite.setAttribute('aria-hidden', 'true'); sprite.style.position = 'absolute';
  sprite.innerHTML = Object.entries(ICONS).map(([k, d]) => `<symbol id="gi-cel-${k}" viewBox="0 0 512 512"><path fill-rule="evenodd" d="${d}"/></symbol>`).join('');
  document.body.appendChild(sprite);
  const st = document.createElement('style');
  st.textContent = `
  #celPrompt { position: fixed; left: 50%; bottom: max(150px, calc(env(safe-area-inset-bottom) + 134px)); transform: translateX(-50%); z-index: 45; display: none; pointer-events: none; font-family: var(--display, serif); user-select: none; }
  #celPrompt.on { display: block; pointer-events: auto; animation: celIn .22s ease-out; }
  @keyframes celIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
  #celPrompt .cpRow { display: flex; gap: 8px; align-items: stretch; justify-content: center; }
  #celPrompt .cpBtn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 76px; padding: 6px 10px 5px; border-radius: 6px; cursor: pointer; color: var(--vellum3, #f7edd0);
    background: linear-gradient(rgba(255,255,255,.1), rgba(0,0,0,.28)), var(--red, #a62a1a); border: 1px solid var(--gold2, #e2bf5e); box-shadow: 0 2px 6px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.35); }
  #celPrompt .cpBtn:hover { filter: brightness(1.15); } #celPrompt .cpBtn.def { box-shadow: 0 0 0 2px var(--gold2, #e2bf5e), 0 2px 8px rgba(0,0,0,.6); } #celPrompt .cpBtn.pick { background: linear-gradient(rgba(255,255,255,.15), rgba(0,0,0,.25)), var(--lapis, #1f3f8a); }
  #celPrompt .cpBtn .gi { width: 30px; height: 30px; } #celPrompt .cpBtn b { color: inherit; font-weight: 500; font-size: 15px; letter-spacing: .01em; line-height: 1; white-space: nowrap; }
  #celPrompt .cpBtn kbd { position: absolute; left: 4px; top: 2px; font: 600 11px/1 var(--body, serif); color: var(--leaf, #f0d68a); background: none; border: 0; padding: 0; }
  #celPrompt .cpBar { height: 3px; margin-top: 6px; border-radius: 2px; background: rgba(0,0,0,.45); overflow: hidden; } #celPrompt .cpBar i { display: block; height: 100%; width: 100%; background: var(--gold2, #e2bf5e); transform-origin: left; }
  #celPrompt .cpHint { text-align: center; font: 500 13px var(--caps, serif); color: var(--leaf, #f0d68a); text-shadow: 0 1px 2px #000; margin-bottom: 5px; letter-spacing: .04em; }
  body.touch #celPrompt, #celPrompt.radial { left: auto; right: max(150px, calc(env(safe-area-inset-right) + 138px)); bottom: max(26px, calc(env(safe-area-inset-bottom) + 22px)); transform: none; }
  #celPrompt.radial.on { animation: none; } #celPrompt.radial .cpRow { display: block; position: relative; width: 190px; height: 172px; } #celPrompt.radial .cpHint { position: absolute; left: 0; right: 0; top: -22px; margin: 0; }
  #celPrompt.radial .cpBtn { position: absolute; min-width: 0; width: 58px; height: 58px; border-radius: 50%; padding: 0; justify-content: center; border: 2px solid var(--gold2, #e2bf5e); }
  #celPrompt.radial .cpBtn .gi { width: 34px; height: 34px; } #celPrompt.radial .cpBtn b, #celPrompt.radial .cpBtn kbd { display: none; }
  #celPrompt.radial .cpBar { position: absolute; left: 10px; right: 10px; bottom: -10px; }`;
  document.head.appendChild(st);
}
const giCel = (id) => `<svg class="gi" viewBox="0 0 512 512" aria-hidden="true"><use href="#gi-cel-${id}" class="o"/><use href="#gi-cel-${id}" class="f"/></svg>`;
/** The glyph markup of a celebration (the Armoury uses it too). */
export const celIcon = (id) => giCel(id);
/** Make sure the glyph sprite and the prompt's styles are in the page (the Armoury calls this before it draws the chips). */
export const initCelUi = () => injectUi();
/** Arrow in the same place as the choice on the radial: up = 1, right = 2, down = 3, left = 4. */
const ARROW = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
/**
 * Show the prompt for `ms` milliseconds. choices: ids (3-4); def: the id already playing (marked). onPick(id) is called when the player chooses (once). Returns the handle.
 */
export function showPrompt(choices, def, onPick, ms = 1500) {
  injectUi(); hidePrompt();
  let el = document.getElementById('celPrompt'); if (!el) { el = document.createElement('div'); el.id = 'celPrompt'; document.body.appendChild(el); }
  const radial = touchMode, spots = [[66, 0], [124, 56], [66, 112], [8, 56]];      // up, right, down, left of the radial (px from the corner of its box)
  el.className = radial ? 'radial' : '';
  el.innerHTML = `<div class="cpHint">${radial ? initialHtml('Celebrate') : initialHtml('Celebrate') + ': <b style="color:#fff">1-4</b> or arrows'}</div><div class="cpRow">${choices.map((id, i) => `<div class="cpBtn ${id === def ? 'def' : ''}" data-cel="${id}" style="${radial ? `left:${spots[i][0]}px;top:${spots[i][1]}px` : ''}"><kbd>${i + 1}</kbd>${giCel(id)}<b>${CELEBS[id].name}</b></div>`).join('')}</div><div class="cpBar"><i></i></div>`;
  void el.offsetWidth; el.classList.add('on');
  const bar = el.querySelector('.cpBar i'); bar.style.transition = `transform ${ms}ms linear`; requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
  const h = { choices, onPick, done: false, timer: setTimeout(() => hidePrompt(), ms), el };
  const pick = (id) => { if (h.done || !id) return; h.done = true; el.querySelectorAll('.cpBtn').forEach(b => b.classList.toggle('pick', b.dataset.cel === id)); onPick(id); setTimeout(() => { if (pr === h) hidePrompt(); }, 260); };
  el.onpointerdown = (e) => { const b = e.target.closest('.cpBtn'); if (b) { e.preventDefault(); e.stopPropagation(); pick(b.dataset.cel); } };
  h.pick = pick; pr = h; return h;
}
export function hidePrompt() { if (!pr) return; clearTimeout(pr.timer); pr.el.classList.remove('on'); pr.el.onpointerdown = null; pr = null; }
export const promptOpen = () => !!pr && !pr.done;
/** A key while the prompt is open: 1-4 or an arrow picks (returns true so the game ignores the key). */
export function promptKey(code) {
  if (!pr || pr.done) return false;
  let i = /^Digit[1-4]$/.test(code) ? +code[5] - 1 : code in ARROW ? ARROW[code] : -1;
  if (i < 0 || i >= pr.choices.length) return false;
  pr.pick(pr.choices[i]); return true;
}
