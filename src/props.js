// props.js - field set-dressing and attendant figures for the jousting lists.
// Plain ES module, procedural geometry + canvas textures only.
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { dressFigure, figure, ARM_AT } from './people.js';

/* ------------------------------------------------------------------ utils */
function mulberry32(a) {
  let s = (a >>> 0) || 1;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _lm = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _cc = {};
function C(h) {
  if (h && h.isColor) return h;
  return _cc[h] || (_cc[h] = new THREE.Color(h));
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* Geometry accumulator: transform stack + vertex colours, merged on build(). */
class Acc {
  constructor() {
    this.geos = [];
    this.m = new THREE.Matrix4();
    this.st = [];
  }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.st.push(this.m.clone());
    _e.set(rx, ry, rz, 'XYZ');
    _q.setFromEuler(_e);
    _lm.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    this.m.multiply(_lm);
    return this;
  }
  pop() {
    this.m.copy(this.st.pop());
    return this;
  }
  _emit(g, col, l) {
    if (g.index) g = g.toNonIndexed();
    _m2.multiplyMatrices(this.m, l);
    g.applyMatrix4(_m2);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.geos.push(g);
  }
  prim(g, col, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx, ry, rz, 'XYZ');
    _q.setFromEuler(_e);
    _lm.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this._emit(g, C(col), _lm);
  }
  geo(g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.prim(g, col, x, y, z, rx, ry, rz, 1, 1, 1);
  }
  box(w, h, d, x, y, z, col, ry = 0, rx = 0, rz = 0) {
    this.prim(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz, 1, 1, 1);
  }
  cyl(rt, rb, h, x, y, z, col, seg = 8, rx = 0, ry = 0, rz = 0, sx = 1, sz = 1) {
    this.prim(new THREE.CylinderGeometry(rt, rb, h, seg, 1), col, x, y, z, rx, ry, rz, sx, 1, sz);
  }
  sph(r, x, y, z, col, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) {
    this.prim(new THREE.SphereGeometry(r, ws, hs), col, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  between(a, b, r1, r2, col, seg = 6) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    _d.divideScalar(len || 1);
    _q.setFromUnitVectors(_up, _d);
    _lm.compose(_mid.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, 1, 1));
    this._emit(new THREE.CylinderGeometry(r2, r1, len, seg, 1), C(col), _lm);
  }
  build() {
    return mergeSimple(this.geos);
  }
}

function mergeSimple(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function meshOf(acc, mat, shadow = true) {
  const m = new THREE.Mesh(acc.build(), mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/* ---------------------------------------------------------------- palette */
const W = {
  plank: '#8a6338',
  wood: '#6b4a2e',
  dark: '#4a3320',
  rail: '#7a5632',
  stone: '#8e8b82',
  stoneTop: '#a09d94',
};
const SKINS = ['#e8bf9c', '#d9a27c', '#c98d66', '#f0cfb0', '#b07a55'];
const HAIRS = ['#3a2616', '#5a3b1c', '#8a6a34', '#1e1a16', '#a2512a', '#c8b07a'];

/* ----------------------------------------------------------------- figures */
/** An arm of the jointed figure (src/people.js) with the elbow bent: the forearm turned forward by `bend`, the hand ends 0.275 from the elbow. */
function bentArm(geo, bend) {
  const g = geo.clone(), P = g.attributes.position, N = g.attributes.normal, EL = -0.325, c = Math.cos(bend), sn = Math.sin(bend);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i) - EL; if (y >= 0) continue;
    const z = P.getZ(i); P.setY(i, EL + y * c + z * sn); P.setZ(i, -y * sn + z * c);
    const ny = N.getY(i), nz = N.getZ(i); N.setY(i, ny * c + nz * sn); N.setZ(i, -ny * sn + nz * c);
  }
  return g;
}
const FIG_FACES = ['m_young', 'm_plain', 'm_beard', 'm_moustache', 'm_dark', 'm_fullbeard'];

/**
 * The staff of the lists: the herald and two trumpeters on the dais, the marshal, the squires with the spare lances and the grooms.
 * The figures are the modelled, dressed parts of src/people.js (a short gown and hose, a tabard, the marshal's long robe; a face, hair, a chaperon,
 * a hood or a coif) hung on the same frame as before: fig.root, fig.sway, and fig.armP / fig.armM, the arms that are animated (animFigure below).
 */
export function makeFigure(style, colors, rnd) {
  colors = colors || ['#1f4690', '#e0b83c'];
  rnd = rnd || Math.random;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const ca = colors[0], cb = colors[1], skin = pick(SKINS), hair = pick(HAIRS), white = C('#ece8dc'), gold = C('#d1a93a'), dark = C('#2a2018');
  let bendP = 0.5, poseP = [-0.1, 0.1], poseM = [-0.05, -0.1], animP = false, animM = false, extraP = null;
  // what he wears: o for dressFigure()
  let o = { coat: ca, hose: ca, hose2: cb, skin, hair, face: pick(FIG_FACES), fat: -0.2 + rnd() * 0.5, close: style === 'herald' || style === 'marshal' };
  switch (style) {
    case 'herald': Object.assign(o, { tab: ca, coat: '#e8e2d0', sleeve: 'sleeve_linen', hose: cb, hose2: cb, hat: { kind: 'hat', color: cb }, face: 'm_beard', fat: 0.35 }); animP = true; break;
    case 'squire': Object.assign(o, { garb: 'doublet', hose: cb, hose2: ca, hat: { kind: 'hood', color: cb }, face: 'm_young', fat: -0.3 }); bendP = 0.7; poseP = [-0.15, 0.28]; animM = true; break;
    case 'marshal':
      Object.assign(o, { robe: 'robe_judge', coat: '#2b2624', sleeve: 'sleeve_fur', hat: { kind: 'hat', color: '#25211f' }, face: 'm_old', hair: '#b8b4ab', fat: 0.55 }); bendP = 0.6; animP = true;
      extraP = (a, h, f) => {      // his white staff of office, tipped with gold
        a.between([h[0] - f[0] * 0.1, h[1] - f[1] * 0.1, h[2] - f[2] * 0.1], [h[0] + f[0] * 0.42, h[1] + f[1] * 0.42, h[2] + f[2] * 0.42], 0.013, 0.013, white, 6);
        a.between([h[0] + f[0] * 0.4, h[1] + f[1] * 0.4, h[2] + f[2] * 0.4], [h[0] + f[0] * 0.47, h[1] + f[1] * 0.47, h[2] + f[2] * 0.47], 0.018, 0.018, gold, 6);
      };
      break;
    case 'groom': Object.assign(o, { garb: 'tunic_plain', coat: '#6e4e2e', hose: '#4b3a2a', hose2: '#4b3a2a', sleeve: 'sleeve_rolled', hat: { kind: 'coif', color: '#e8e2d0' }, fat: 0.1 + rnd() * 0.6 }); bendP = 0.44; poseP = [-0.12, 0.12]; break;
    case 'trumpeter': Object.assign(o, { garb: 'parti', coat: cb, sleeve: 'sleeve_wool', hose: ca, hose2: cb, hat: { kind: 'cap', color: cb } }); o.tab = null; o.coat = ca; bendP = 1.22; animP = true; break;
    default: break;
  }
  const D = dressFigure(o), F = figure();
  const fig = { kind: style, root: new THREE.Group(), sway: new THREE.Group(), armP: null, armM: null, trumpet: null, qLow: null, qHigh: null, ph: rnd() * 6.2832, k: 0, base: 0 };
  fig.root.add(fig.sway);
  const G = fig.bodyG = new THREE.Group(), at = (m, x, y, z) => { m.position.set(x, y, z); G.add(m); return m; };
  at(D.torso, 0, 0.85, 0);
  if (D.legL) { at(D.legL, -0.09, 0.85, 0); at(D.legR, 0.09, 0.85, 0); }
  at(D.head, 0, 0.85 + 0.66 + 0.12, 0);
  if (style === 'herald') {      // the plume in his chaperon
    const A = new Acc(); A.between([0.07, 1.78, -0.04], [0.2, 1.95, -0.14], 0.014, 0.002, white, 5); A.between([0.07, 1.78, -0.04], [0.15, 1.91, -0.17], 0.012, 0.002, C(cb), 5); fig._bodyAcc = A;
  }
  // arms: the animated ones are groups at the shoulder; the others are set in their pose
  const SY = 0.85 + ARM_AT[1], arm = (src, bend) => { const m = new THREE.Mesh(bentArm(F.arm, bend), src.material); m.castShadow = false; return m; };
  const hand = (bend) => ({ hand: [0, -0.325 - 0.275 * Math.cos(bend), 0.275 * Math.sin(bend)], f: [0, -Math.cos(bend), Math.sin(bend)] });
  const one = (sx, anim, pose, bend, src, extra) => {
    const g = new THREE.Group(); g.position.set(sx * ARM_AT[0], SY, 0); g.add(arm(src, bend));
    if (extra) { const A = new Acc(), h = hand(bend); extra(A, h.hand, h.f); const m = meshOf(A, null); g.add(m); fig[sx > 0 ? '_armPMesh' : '_armMMesh'] = m; }
    if (anim) return g;
    g.rotation.set(pose[0], 0, pose[1]); G.add(g); return null;
  };
  const bucket = style === 'groom' ? (A, h) => {      // the groom's bucket hangs from his hand
    A.between([h[0], h[1] + 0.01, h[2]], [h[0], h[1] - 0.14, h[2]], 0.008, 0.008, dark, 4);
    A.cyl(0.11, 0.085, 0.22, h[0], h[1] - 0.25, h[2], C('#5a3d22'), 8); A.cyl(0.112, 0.112, 0.02, h[0], h[1] - 0.19, h[2], dark, 8); A.cyl(0.095, 0.095, 0.01, h[0], h[1] - 0.145, h[2], C('#3d6f86'), 8);
  } : null;
  fig.armP = one(1, animP, poseP, bendP, D.armR, extraP || bucket);
  fig.armM = one(-1, animM, poseM, animM ? bendP : 0.35, D.armL, null);
  fig.bendP = bendP;
  return fig;
}

/* Finalise a figure: give it the shared material (called by buildProps). */
function finishFigure(fig, mat, trumpetColors) {
  fig.body = fig.bodyG; fig.sway.add(fig.bodyG);
  if (fig._bodyAcc) { fig.sway.add(meshOf(fig._bodyAcc, mat)); fig._bodyAcc = null; }      // (the few plain-coloured extras: a plume)
  for (const key of ['_armPMesh', '_armMMesh']) {
    if (fig[key]) {
      fig[key].material = mat;
    }
  }
  if (fig.armP) fig.sway.add(fig.armP);
  if (fig.armM) fig.sway.add(fig.armM);

  if (fig.kind === 'trumpeter') {
    const ca = C(trumpetColors[0]);
    const cb = C(trumpetColors[1]);
    const gold = C('#d1a93a');
    const T = new Acc();
    T.between([0, 0, -0.12], [0, 0, 1.15], 0.011, 0.012, gold, 6);
    T.between([0, 0, 0.95], [0, 0, 1.42], 0.016, 0.075, gold, 8);
    T.between([0, 0, 0.6], [0, 0, 0.64], 0.02, 0.02, C('#a98428'), 6);
    T.between([0, 0, 0.12], [0, 0, 0.16], 0.02, 0.02, C('#a98428'), 6);
    T.between([0, 0, -0.12], [0, 0, -0.07], 0.02, 0.02, gold, 6);
    // hanging banner
    T.between([0, -0.012, 0.8], [0, -0.012, 0.9], 0.004, 0.004, C('#3a2a1c'), 4);
    T.box(0.012, 0.012, 0.16, 0, -0.05, 0.85, C('#3a2a1c'));
    T.box(0.3, 0.3, 0.012, 0, -0.21, 0.85, ca);
    T.box(0.3, 0.07, 0.014, 0, -0.17, 0.85, cb);
    T.box(0.07, 0.3, 0.014, 0, -0.21, 0.85, cb);
    const tm = meshOf(T, mat);
    fig.trumpet = new THREE.Group();
    fig.trumpet.add(tm);
    const b = fig.bendP;
    fig.trumpet.position.set(0, -0.3 - 0.28 * Math.cos(b), 0.28 * Math.sin(b));
    fig.armP.add(fig.trumpet);

    // orientation in arm-local space for lowered / raised poses
    const mk = (rx, rz, wx, wy, wz) => {
      const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz, 'XYZ'));
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(wx, wy, wz).normalize(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      const qw = new THREE.Quaternion().setFromRotationMatrix(m);
      return qa.invert().multiply(qw);
    };
    fig.qLow = mk(-0.35, 0.1, 0, -0.45, 0.9);
    fig.qHigh = mk(-1.37, -0.94, 0, 0.25, 0.97);
    fig.trumpet.quaternion.copy(fig.qLow);
    fig.armP.rotation.set(-0.35, 0, 0.1);
  }
  if (fig.kind === 'marshal') fig.armP.rotation.set(-0.12, 0, 0.12);
  if (fig.kind === 'squire') fig.armM.rotation.set(-0.05, 0, -0.1);
  fig.k = fig.kind === 'marshal' ? -0.12 : 0;
  fig.root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

function animFigure(f, t, dt, s, exc) {
  const ph = f.ph;
  const sw = f.sway;
  sw.rotation.z = Math.sin(t * 0.6 + ph) * 0.02 * (1 + exc);
  sw.rotation.x = Math.sin(t * 0.45 + ph * 1.3) * 0.012;
  sw.rotation.y = Math.sin(t * 0.28 + ph * 0.7) * 0.16 + Math.sin(t * 0.9 + ph) * 0.03 * (1 + exc);
  const kind = f.kind;

  if (kind === 'trumpeter') {
    const target = s.fanfare ? 1 : 0;
    f.k += (target - f.k) * (1 - Math.exp(-4 * dt));
    const k = f.k;
    f.armP.rotation.set(lerp(-0.35, -1.37, k) + Math.sin(t * 5 + ph) * 0.025 * k, 0, lerp(0.1, -0.94, k));
    f.trumpet.quaternion.slerpQuaternions(f.qLow, f.qHigh, k);
    sw.rotation.x -= 0.07 * k;
  } else if (kind === 'herald') {
    const target = s.fanfare ? 1 : 0;
    f.k += (target - f.k) * (1 - Math.exp(-3 * dt));
    const k = f.k;
    f.armP.rotation.set(lerp(-0.08, -0.5, k) + Math.sin(t * 0.8 + ph) * 0.04, 0, lerp(0.1, 0.95, k) + Math.sin(t * 3 + ph) * 0.05 * k);
  } else if (kind === 'marshal') {
    const mode = s.mode;
    const target = mode === 'ready' ? -2.6 : mode === 'charge' ? -0.95 : -0.12;
    const rate = mode === 'charge' ? 9 : mode === 'ready' ? 4 : 1.8;
    f.k += (target - f.k) * (1 - Math.exp(-rate * dt));
    f.armP.rotation.set(f.k + (mode === 'ready' ? Math.sin(t * 2.6) * 0.04 : Math.sin(t * 0.8 + ph) * 0.03), 0, 0.12);
  } else if (kind === 'squire') {
    const target = exc > 0 ? 1 : 0;
    f.k += (target - f.k) * (1 - Math.exp(-5 * dt));
    const k = f.k;
    f.armM.rotation.set(lerp(-0.05 + Math.sin(t * 0.8 + ph) * 0.05, -2.5 + Math.sin(t * 8 + ph) * 0.4, k), 0, lerp(-0.1, -0.22, k));
    sw.position.y = k * Math.abs(Math.sin(t * 4 + ph)) * 0.05;
  }
}

/* ---------------------------------------------------------------- textures */
function lanceTexture(c1, c2) {
  const cv = mkCanvas(64, 64);
  const g = cv.getContext('2d');
  g.fillStyle = c1;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = c2;
  for (let k = -1; k <= 1; k++) {
    g.beginPath();
    g.moveTo(0, k * 64);
    g.lineTo(64, k * 64 + 64);
    g.lineTo(64, k * 64 + 96);
    g.lineTo(0, k * 64 + 32);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 9);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(4, GFX.aniso);
  return t;
}

const SHIELD_COLS = 5;
const SHIELD_ROWS = 2;
const CELL_W = 128;
const CELL_H = 160;

function heaterPath(g, x, y, w, h) {
  g.beginPath();
  g.moveTo(x + 4, y + 4);
  g.lineTo(x + w - 4, y + 4);
  g.lineTo(x + w - 4, y + h * 0.5);
  g.quadraticCurveTo(x + w - 4, y + h * 0.85, x + w / 2, y + h - 4);
  g.quadraticCurveTo(x + 4, y + h * 0.85, x + 4, y + h * 0.5);
  g.closePath();
}

function paintShield(g, x, y, w, h, kind, c1, c2) {
  g.fillStyle = '#1a1410';
  g.fillRect(x, y, w, h);
  g.save();
  heaterPath(g, x, y, w, h);
  g.clip();
  g.fillStyle = c1;
  g.fillRect(x, y, w, h);
  g.fillStyle = c2;
  g.strokeStyle = c2;
  g.lineJoin = 'miter';
  switch (kind) {
    case 'pale':
      g.fillRect(x + w / 2, y, w / 2, h);
      break;
    case 'fess':
      g.fillRect(x, y + h * 0.34, w, h * 0.24);
      break;
    case 'perfess':
      g.fillRect(x, y + h * 0.45, w, h * 0.6);
      break;
    case 'chief':
      g.fillRect(x, y, w, h * 0.3);
      break;
    case 'cross':
      g.fillRect(x + w * 0.4, y, w * 0.2, h);
      g.fillRect(x, y + h * 0.25, w, h * 0.2);
      break;
    case 'quarterly':
      g.fillRect(x, y, w / 2, h * 0.46);
      g.fillRect(x + w / 2, y + h * 0.46, w / 2, h * 0.6);
      break;
    case 'saltire':
      g.lineWidth = w * 0.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + h);
      g.moveTo(x + w, y);
      g.lineTo(x, y + h);
      g.stroke();
      break;
    case 'bend':
    case 'bendsin': {
      g.lineWidth = w * 0.3;
      g.beginPath();
      if (kind === 'bend') {
        g.moveTo(x - 10, y - 10);
        g.lineTo(x + w + 10, y + h * 0.9);
      } else {
        g.moveTo(x + w + 10, y - 10);
        g.lineTo(x - 10, y + h * 0.9);
      }
      g.stroke();
      break;
    }
    case 'chevron':
      g.lineWidth = w * 0.2;
      g.beginPath();
      g.moveTo(x - 4, y + h * 0.7);
      g.lineTo(x + w / 2, y + h * 0.28);
      g.lineTo(x + w + 4, y + h * 0.7);
      g.stroke();
      break;
    default:
      break;
  }
  g.restore();
  heaterPath(g, x, y, w, h);
  g.lineWidth = 4;
  g.strokeStyle = '#1a1410';
  g.stroke();
}

function shieldAtlas(designs) {
  const cv = mkCanvas(SHIELD_COLS * CELL_W, SHIELD_ROWS * CELL_H);
  const g = cv.getContext('2d');
  for (let i = 0; i < designs.length; i++) {
    const d = designs[i];
    paintShield(g, (i % SHIELD_COLS) * CELL_W, ((i / SHIELD_COLS) | 0) * CELL_H, CELL_W, CELL_H, d[2], d[0], d[1]);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(4, GFX.aniso);
  return t;
}

const SHIELD_W = 0.42;
const SHIELD_H = 0.52;
function shieldGeo(idx) {
  const shp = new THREE.Shape();
  shp.moveTo(0, 1);
  shp.lineTo(1, 1);
  shp.lineTo(1, 0.5);
  shp.quadraticCurveTo(1, 0.12, 0.5, 0);
  shp.quadraticCurveTo(0, 0.12, 0, 0.5);
  shp.lineTo(0, 1);
  const g = new THREE.ShapeGeometry(shp, 6);
  const p = g.attributes.position;
  const u = g.attributes.uv;
  const col = idx % SHIELD_COLS;
  const row = (idx / SHIELD_COLS) | 0;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i);
    const ny = p.getY(i);
    u.setXY(i, (col + nx) / SHIELD_COLS, 1 - (row + (1 - ny)) / SHIELD_ROWS);
    p.setXYZ(i, (nx - 0.5) * SHIELD_W, (ny - 1) * SHIELD_H, 0);
  }
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------- main build */
const DEF_STATE = { mode: 'menu', fanfare: false, excitement: 0 };

export function buildProps(group, opts = {}) {
  const seed = opts.seed === undefined ? 1 : opts.seed;
  const colA = opts.colorsA || ['#1f4690', '#e0b83c'];
  const colB = opts.colorsB || ['#a81e1e', '#ece8dc'];
  const rnd = mulberry32(seed * 7919 + 13);
  const root = new THREE.Group();
  root.name = 'props';
  group.add(root);

  const matV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const white = C('#ffffff');

  /* ---- static wooden / stone set dressing (one merged mesh) ---- */
  const S = new Acc();

  const cheapLists = !opts.modelled;      // the modelled lists (src/lists.js) bring their own dais, marshal's stage, mounting blocks and rack frames
  if (cheapLists) {
  // royal dais
  S.box(1.8, 0.3, 15, 10.6, 0.15, 0, W.plank);
  S.box(1.86, 0.035, 15.06, 10.6, 0.3175, 0, W.dark);
  S.box(1.5, 0.012, 14.6, 10.6, 0.341, 0, '#6d2430');
  // marshal dais with steps
  S.box(1.3, 0.5, 1.3, -7.6, 0.25, 0, W.plank);
  S.box(1.38, 0.05, 1.38, -7.6, 0.525, 0, W.dark);
  S.box(0.5, 0.25, 0.9, -8.5, 0.125, 0, W.plank);
  }

  // benches
  const bench = (x, z) => {
    S.box(0.42, 0.07, 1.9, x, 0.46, z, W.plank);
    S.box(0.06, 0.4, 1.9, x + Math.sign(x) * 0.21, 0.72, z, W.rail, 0, 0, 0); // low back plank
    for (let i = -1; i <= 1; i += 2) S.box(0.36, 0.43, 0.07, x, 0.215, z + i * 0.8, W.dark);
  };
  bench(-8.6, -24);
  bench(-8.6, 18);
  bench(8.6, -18);
  bench(8.6, 30);

  // water troughs
  const trough = (x, z) => {
    S.box(0.55, 0.08, 2.0, x, 0.4, z, W.wood);
    S.box(0.06, 0.24, 2.0, x - 0.245, 0.52, z, W.plank);
    S.box(0.06, 0.24, 2.0, x + 0.245, 0.52, z, W.plank);
    S.box(0.55, 0.24, 0.06, x, 0.52, z - 0.97, W.plank);
    S.box(0.55, 0.24, 0.06, x, 0.52, z + 0.97, W.plank);
    S.box(0.43, 0.02, 1.88, x, 0.55, z, '#4f7f93');
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) S.box(0.1, 0.36, 0.1, x + i * 0.2, 0.18, z + j * 0.8, W.dark);
  };
  trough(-8.6, -12);
  trough(8.6, 14);

  // mounting blocks (step faces the lane)
  const block = (x, z) => {
    S.box(0.8, 0.42, 0.8, x, 0.21, z, W.stone);
    S.box(0.84, 0.04, 0.84, x, 0.44, z, W.stoneTop);
    S.box(0.4, 0.2, 0.7, x - Math.sign(x) * 0.6, 0.1, z, W.stone);
  };
  if (cheapLists) { block(-7.0, -36); block(7.0, 36); }

  // lance racks + perron frames
  const rackLances = [new Acc(), new Acc()];
  const rack = (x, z, s, la) => {
    if (cheapLists) {
    S.push(x, 0, z);
    for (let i = -1; i <= 1; i += 2) {
      S.box(0.08, 1.6, 0.08, s * 0.32, 0.8, i * 0.85, W.wood);
      S.box(0.7, 0.07, 0.08, s * 0.1, 0.035, i * 0.85, W.dark);
    }
    S.box(0.08, 0.08, 1.8, s * 0.3, 1.25, 0, W.rail);
    S.box(0.08, 0.08, 1.8, s * 0.16, 0.45, 0, W.rail);
    S.pop();
    }
    const lean = s < 0 ? 0.19 : -0.19;
    for (let i = 0; i < 5; i++) {
      const lz = -0.64 + i * 0.32;
      la.push(x, 0, z + lz, 0, 0, lean + (rnd() - 0.5) * 0.015);
      addLance(la, 0, 0);
      la.pop();
    }
  };
  function addLance(acc, x, z) {
    acc.cyl(0.018, 0.034, 3.7, x, 1.85, z, white, 8);
    acc.cyl(0.0, 0.03, 0.24, x, 3.82, z, '#c9c6bd', 8);
  }
  rack(-8.0, -41, -1, rackLances[0]);
  rack(8.0, 41, 1, rackLances[1]);

  // shield trees (perron)
  const SH = new Acc();
  const designs = [
    [colA[0], colA[1], 'pale'],
    [colB[0], colB[1], 'bend'],
    ['#2d6a3a', '#e8e2d0', 'fess'],
    [colA[1], colA[0], 'quarterly'],
    [colB[1], colB[0], 'chevron'],
    [colB[0], colB[1], 'quarterly'],
    [colA[0], colA[1], 'saltire'],
    ['#5a2a6a', '#e0b83c', 'cross'],
    ['#222222', '#d94f2b', 'chief'],
    [colA[1], colB[0], 'bendsin'],
  ];
  const perron = (x, z, fs, first) => {
    S.push(x, 0, z);
    S.box(1.1, 0.1, 0.1, 0, 0.05, 0, W.dark);
    S.box(0.1, 0.1, 1.1, 0, 0.05, 0, W.dark);
    S.box(0.14, 2.7, 0.14, 0, 1.35, 0, W.wood);
    S.box(1.9, 0.1, 0.1, 0, 2.35, 0, W.rail);
    S.box(1.1, 0.09, 0.09, 0, 1.47, 0, W.rail);
    S.between([0, 1.9, 0], [0.55, 2.33, 0], 0.035, 0.035, W.dark, 5);
    S.between([0, 1.9, 0], [-0.55, 2.33, 0], 0.035, 0.035, W.dark, 5);
    S.sph(0.08, 0, 2.74, 0, W.wood, 1, 1, 1, 6, 5);
    S.sph(0.06, 0.95, 2.35, 0, W.dark, 1, 1, 1, 5, 4);
    S.sph(0.06, -0.95, 2.35, 0, W.dark, 1, 1, 1, 5, 4);
    S.pop();
    const spots = [
      [-0.6, 2.3],
      [0, 2.3],
      [0.6, 2.3],
      [-0.3, 1.43],
      [0.3, 1.43],
    ];
    for (let i = 0; i < 5; i++) {
      SH.prim(shieldGeo(first + i), white, x + spots[i][0], spots[i][1], z + fs * 0.1, 0, fs < 0 ? Math.PI : 0, (rnd() - 0.5) * 0.08, 1, 1, 1);
    }
  };
  perron(6, -49, 1, 0);
  perron(-6, 49, -1, 5);

  const staticMesh = meshOf(S, matV);
  root.add(staticMesh);

  // shields mesh (shared atlas)
  const shieldTex = shieldAtlas(designs);
  const shieldMat = new THREE.MeshStandardMaterial({ map: shieldTex, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const shieldMesh = new THREE.Mesh(mergeSimple(SH.geos), shieldMat);
  shieldMesh.castShadow = true;
  shieldMesh.receiveShadow = true;
  root.add(shieldMesh);

  // lance materials, rack lances, held lance geometry
  const lanceMats = [colA, colB].map(
    (c) => new THREE.MeshStandardMaterial({ map: lanceTexture(c[0], c[1]), vertexColors: true, roughness: 0.6, metalness: 0 })
  );
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(rackLances[i].build(), lanceMats[i]);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  const heldGeo = [0, 1].map(() => {
    const a = new Acc();
    addLance(a, 0, 0);
    return a.build();
  });

  /* ---- figures ---- */
  const figs = [];
  const place = (fig, x, y, z, yaw, mat, tc) => {
    finishFigure(fig, mat, tc || ['#1f4690', '#e0b83c']);
    fig.root.position.set(x, y, z);
    fig.root.rotation.y = yaw;
    root.add(fig.root);
    figs.push(fig);
    return fig;
  };
  const mk = (style, cols) => makeFigure(style, cols, rnd);
  const DAIS_Y = 0.35;

  // royal dais: herald between two trumpeters, facing the lists (-X)
  place(mk('herald', [colA[0], colB[0]]), 10.6, DAIS_Y, 0, -Math.PI / 2, matV);
  place(mk('trumpeter', colA), 10.6, DAIS_Y, -6.5, -Math.PI / 2, matV, colA);
  place(mk('trumpeter', colB), 10.6, DAIS_Y, 6.5, -Math.PI / 2, matV, colB);

  // marshal of the lists
  place(mk('marshal', ['#25211f', '#d9d2c0']), -7.6, 0.55, 0, Math.PI / 2, matV);

  // each end: two squires with spare lances, groom with bucket
  const addEnd = (cols, teamIdx, sgn) => {
    const yaw = sgn < 0 ? 0.6 : Math.PI + 0.6;
    const z = sgn * 44;
    const xs = [4.2 * sgn * -1 * -1, 5.4 * sgn * -1 * -1];
    // A end (sgn=-1): x = -4.2/-5.4 ; B end (sgn=+1): x = +4.2/+5.4
    for (let i = 0; i < 2; i++) {
      const x = (i ? 5.4 : 4.2) * sgn;
      const f = place(mk('squire', cols), x, 0, z + (i ? 0.5 : -0.2) * sgn, yaw + (i ? -0.15 : 0.1) * sgn, matV);
      const lance = new THREE.Mesh(heldGeo[teamIdx], lanceMats[teamIdx]);
      lance.position.set(0.38, 0, 0.25);
      lance.castShadow = true;
      f.sway.add(lance);
    }
    void xs;
    place(mk('groom', null), 7.0 * sgn, 0, 45.5 * sgn, (sgn < 0 ? 0.8 : Math.PI + 0.8), matV);
  };
  addEnd(colA, 0, -1);
  addEnd(colB, 1, 1);

  /* ---- bunting (single merged geometry, vertex colours + shader flutter) ---- */
  const bpos = [];
  const bcol = [];
  const bflex = [];
  const bph = [];
  const palette = [C(colA[0]), C(colA[1]), C(colB[0]), C(colB[1])];
  const strCol = C('#3a2a1c');
  const pushV = (x, y, z, c, fl, p) => {
    bpos.push(x, y, z);
    bcol.push(c.r, c.g, c.b);
    bflex.push(fl);
    bph.push(p);
  };
  const SAG = 0.5;
  const TOP = 3.6;
  const catY = (u) => TOP - SAG * 4 * u * (1 - u);
  for (let side = 0; side < 2; side++) {
    const x = side ? 9.5 : -9.5;
    for (let sp = 0; sp < 8; sp++) {
      const z0 = -48 + sp * 12;
      // string: crossed ribbons
      const M = 24;
      for (let j = 0; j < M; j++) {
        const u0 = j / M;
        const u1 = (j + 1) / M;
        const za = z0 + u0 * 12;
        const zb = z0 + u1 * 12;
        const ya = catY(u0);
        const yb = catY(u1);
        const t = 0.012;
        // vertical ribbon (in the x plane)
        pushV(x, ya + t, za, strCol, 0, 0);
        pushV(x, ya - t, za, strCol, 0, 0);
        pushV(x, yb + t, zb, strCol, 0, 0);
        pushV(x, ya - t, za, strCol, 0, 0);
        pushV(x, yb - t, zb, strCol, 0, 0);
        pushV(x, yb + t, zb, strCol, 0, 0);
        // horizontal ribbon
        pushV(x - t, ya, za, strCol, 0, 0);
        pushV(x + t, ya, za, strCol, 0, 0);
        pushV(x - t, yb, zb, strCol, 0, 0);
        pushV(x + t, ya, za, strCol, 0, 0);
        pushV(x + t, yb, zb, strCol, 0, 0);
        pushV(x - t, yb, zb, strCol, 0, 0);
      }
      // pennants
      const N = 18;
      for (let j = 0; j < N; j++) {
        const u = (j + 0.5) / N;
        const pz = z0 + u * 12;
        const py = catY(u);
        const a = (j % 2 ? 1 : -1) * 0.7 + (rnd() - 0.5) * 0.25;
        const dx = Math.sin(a) * 0.17;
        const dz = Math.cos(a) * 0.17;
        const c = palette[(j + sp + side) % 4];
        const p = rnd() * 6.28;
        const len = 0.38 + rnd() * 0.08;
        pushV(x - dx, py, pz - dz, c, 0, p);
        pushV(x + dx, py, pz + dz, c, 0, p);
        pushV(x, py - len, pz, c, 1, p);
      }
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
  bg.setAttribute('aFlex', new THREE.Float32BufferAttribute(bflex, 1));
  bg.setAttribute('aPh', new THREE.Float32BufferAttribute(bph, 1));
  bg.computeVertexNormals();
  bg.computeBoundingSphere();
  const uTime = { value: 0 };
  const uAmp = { value: 0.7 };
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  bMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uAmp = uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlex;\nattribute float aPh;\nuniform float uTime;\nuniform float uAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fw = sin(uTime * 3.1 + aPh) + 0.5 * sin(uTime * 5.3 + aPh * 1.7);
        transformed.x += fw * 0.07 * aFlex * uAmp;
        transformed.z += cos(uTime * 2.3 + aPh) * 0.05 * aFlex * uAmp;
        transformed.y += abs(fw) * 0.02 * aFlex * uAmp;`
      );
  };
  bMat.customProgramCacheKey = () => 'props-bunting-flutter';
  const bunting = new THREE.Mesh(bg, bMat);
  bunting.castShadow = false;
  bunting.receiveShadow = false;
  root.add(bunting);

  /* ---- update ---- */
  function update(t, dt, s) {
    s = s || DEF_STATE;
    dt = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 0.016;
    const e = s.excitement || 0;
    const exc = clamp01((e - 0.6) / 0.4);
    uTime.value = t;
    uAmp.value = 0.7 + 0.9 * clamp01(e);
    for (let i = 0; i < figs.length; i++) animFigure(figs[i], t, dt, s, exc);
  }

  return { update };
}
