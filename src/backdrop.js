// backdrop.js — five historically flavoured skyline backdrops ("stadiums of the European circuit").
// Everything is procedural: parametric building helpers push geometry into a Batch that merges it per
// material (vertex colours + a few tiny greyscale canvas textures tinted by vertex colour).
// Each venue ends up as roughly 6-12 draw calls and well under 120k triangles.
//
// Frame: metres, Y up, lists along Z, hero view toward +Z.  Nothing is placed inside radius ~110 m.
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { photoTex, detailWorld } from './util.js';

// Scanned surfaces (Poly Haven, CC0) multiplied over the painted walls and roofs: [texture, its mean colour, tiles per metre].
const PHOTO = {
  stone: ['castle_wall_slates', [0.278, 0.23, 0.153], 0.36],
  brick: ['medieval_red_brick', [0.228, 0.133, 0.088], 0.3],
  timber: ['white_plaster_rough_01', [0.208, 0.17, 0.1], 0.25],
  plaster: ['white_plaster_rough_01', [0.208, 0.17, 0.1], 0.25],
  roof: ['clay_roof_tiles_02', [0.311, 0.086, 0.027], 0.45],
};
const _photo = {};

const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const WALL_U = 3;   // metres covered by one wall-texture repeat
const ROOF_U = 2;   // metres covered by one roof-texture repeat

/* ------------------------------------------------------------------ utilities */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _hsl = { h: 0, s: 0, l: 0 };
/** Colour with a little lightness jitter (c: hex or Color). */
function jit(c, amt, rnd) {
  const k = new THREE.Color(c);
  k.getHSL(_hsl);
  k.setHSL(_hsl.h, _hsl.s, THREE.MathUtils.clamp(_hsl.l + (rnd() - 0.5) * amt, 0, 1));
  return k;
}

/* ------------------------------------------------------------------ textures (greyscale, tinted by vertex colour) */

function makeTextures() {
  const rr = mulberry32(77);
  const G = (v) => { v = Math.max(0, Math.min(255, v | 0)); return `rgb(${v},${v},${v})`; };
  const mk = (size, fn) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    fn(g, size);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, GFX.aniso);
    return t;
  };
  const speckle = (g, s, n, lo, hi) => {
    for (let i = 0; i < n; i++) { g.fillStyle = G(lo + rr() * (hi - lo)); g.fillRect(rr() * s, rr() * s, 2, 2); }
  };
  return {
    // ashlar courses with an arched slit/window
    stone: mk(128, (g, s) => {
      g.fillStyle = G(185); g.fillRect(0, 0, s, s);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 16;
        for (let x = -off; x < s; x += 32) { g.fillStyle = G(222 + rr() * 12); g.fillRect(x, row * 16, 32, 16); }
      }
      g.fillStyle = G(60); g.fillRect(60, 40, 8, 36);
      g.beginPath(); g.arc(64, 40, 4, Math.PI, 0); g.fill();
    }),
    // brick courses with a mullioned window
    brick: mk(128, (g, s) => {
      g.fillStyle = G(150); g.fillRect(0, 0, s, s);
      for (let row = 0; row < 16; row++) {
        const off = (row % 2) * 11;
        for (let x = -off; x < s; x += 22) { g.fillStyle = G(215 + rr() * 14); g.fillRect(x, row * 8, 22, 8); }
      }
      g.fillStyle = G(240); g.fillRect(36, 22, 56, 74);
      g.fillStyle = G(50); g.fillRect(41, 27, 46, 64);
      g.fillStyle = G(225); g.fillRect(62, 27, 4, 64); g.fillRect(41, 56, 46, 4);
      g.fillStyle = G(248); g.fillRect(33, 96, 62, 5);
    }),
    // white plaster with dark half-timber frame, braces and two windows
    timber: mk(128, (g, s) => {
      g.fillStyle = G(238); g.fillRect(0, 0, s, s);
      speckle(g, s, 160, 215, 250);
      g.fillStyle = G(62);
      g.fillRect(0, 0, s, 7); g.fillRect(0, 70, s, 6);
      g.fillRect(0, 0, 6, s); g.fillRect(61, 0, 6, s);
      g.strokeStyle = G(62); g.lineWidth = 5;
      g.beginPath(); g.moveTo(6, 128); g.lineTo(61, 78); g.moveTo(122, 128); g.lineTo(67, 78); g.stroke();
      g.fillStyle = G(48); g.fillRect(16, 24, 36, 38); g.fillRect(76, 24, 36, 38);
      g.fillStyle = G(200); g.fillRect(33, 24, 3, 38); g.fillRect(93, 24, 3, 38);
    }),
    // plain plaster with a dark arched window
    plaster: mk(128, (g, s) => {
      g.fillStyle = G(236); g.fillRect(0, 0, s, s);
      speckle(g, s, 220, 205, 250);
      g.fillStyle = G(250); g.fillRect(40, 32, 48, 66);
      g.fillStyle = G(55); g.fillRect(45, 44, 38, 50);
      g.beginPath(); g.arc(64, 44, 19, Math.PI, 0); g.fill();
      g.fillStyle = G(190); g.fillRect(0, 124, s, 4);
    }),
    // roof tiles
    roof: mk(64, (g, s) => {
      for (let row = 0; row < 8; row++) {
        g.fillStyle = G(200 + rr() * 40); g.fillRect(0, row * 8, s, 8);
      }
    }),
  };
}

/* ------------------------------------------------------------------ geometry builders
   All return fresh geometry resting on y = 0, UVs expressed in texture repeats (metres / unit). */

function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / WALL_U, uv.getY(i) * dims[f][1] / WALL_U);
    }
  }
  return g;
}

function cyl(rt, rb, h, seg = 8, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv, circ = TAU * Math.max(rt, rb) / WALL_U;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h / WALL_U);
  return g;
}

function cone(r, h, seg = 8) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv, cu = TAU * r / ROOF_U, cv = Math.hypot(r, h) / ROOF_U;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv);
  return g;
}

/** Square pyramid, unit base half-diagonal scaled so the base side is `w` x `d` when added with scale [1,1,1]. */
function pyramid(w, d, h) {
  const g = cone(1, h, 4);
  g.rotateY(Math.PI / 4);                    // base now axis-aligned, side = sqrt(2)
  g.scale(w / Math.SQRT2, 1, d / Math.SQRT2);
  return g;
}

function trisGeo(pos, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Gable roof prism: ridge along Z, eaves at y = 0, width w (x), depth d (z), ridge height h. */
function gableRoof(w, d, h, ov = 0.5) {
  const W = w / 2 + ov, D = d / 2 + ov, sl = Math.hypot(W, h) / ROOF_U, L = 2 * D / ROOF_U;
  const P = [], U = [];
  const v = (x, y, z, u, t) => { P.push(x, y, z); U.push(u, t); };
  // left slope (A,B,D),(B,C,D)
  v(-W, 0, -D, 0, 0); v(-W, 0, D, L, 0); v(0, h, -D, 0, sl);
  v(-W, 0, D, L, 0); v(0, h, D, L, sl); v(0, h, -D, 0, sl);
  // right slope (A,D,B),(B,D,C)
  v(W, 0, -D, 0, 0); v(0, h, -D, 0, sl); v(W, 0, D, L, 0);
  v(W, 0, D, L, 0); v(0, h, -D, 0, sl); v(0, h, D, L, sl);
  return trisGeo(P, U);
}

/** Triangular gable-end walls to close a gableRoof beneath it. */
function gableEnds(w, d, h) {
  const P = [], U = [], k = 1 / WALL_U;
  const v = (x, y, z) => { P.push(x, y, z); U.push(x * k, y * k); };
  v(-w / 2, 0, d / 2); v(w / 2, 0, d / 2); v(0, h, d / 2);
  v(w / 2, 0, -d / 2); v(-w / 2, 0, -d / 2); v(0, h, -d / 2);
  return trisGeo(P, U);
}

/** Pointed-arch bay (pier + arch opening) extruded along Z, for bridges and arcades. */
function archBay(P, H, spring, apexY, span, depth) {
  const s = new THREE.Shape();
  s.moveTo(-P / 2, -1); s.lineTo(P / 2, -1); s.lineTo(P / 2, H); s.lineTo(-P / 2, H); s.closePath();
  const hs = span / 2, h = new THREE.Path();
  h.moveTo(-hs, 0); h.lineTo(-hs, spring);
  h.quadraticCurveTo(-hs * 0.92, apexY * 0.88, 0, apexY);
  h.quadraticCurveTo(hs * 0.92, apexY * 0.88, hs, spring);
  h.lineTo(hs, 0); h.closePath();
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WALL_U, uv.getY(i) / WALL_U);
  return g;
}

/** Single humped bridge with one semicircular arch, length L along X. */
function humpBridge(L, depth, r) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.6); s.lineTo(L, -0.6); s.lineTo(L, 2.2);
  s.quadraticCurveTo(L / 2, 6.2, 0, 2.2); s.closePath();
  const h = new THREE.Path();
  h.absarc(L / 2, 0, r, Math.PI, 0, true); h.closePath();
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(-L / 2, 0, -depth / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WALL_U, uv.getY(i) / WALL_U);
  return g;
}

/* ------------------------------------------------------------------ geometry preparation + Batch */

/** Normalise geometry to non-indexed {position, normal, uv, color}. color===null keeps an existing colour attribute. */
function prep(geo, color) {
  const keep = color === null;
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const n of Object.keys(g.attributes)) {
    if (n === 'position' || n === 'normal' || n === 'uv') continue;
    if (n === 'color' && keep) continue;
    g.deleteAttribute(n);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const cnt = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
  if (!keep) {
    const a = new Float32Array(cnt * 3);
    if (Array.isArray(color)) {                       // per-triangle stripes
      for (let i = 0; i < cnt; i++) {
        const c = color[((i / 3) | 0) % color.length];
        a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
      }
    } else {
      const c = color instanceof THREE.Color ? color : new THREE.Color(color);
      for (let i = 0; i < cnt; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  g.clearGroups();
  return g;
}

/** Collects geometry per material key with a transform stack, then merges to one Mesh per key. */
class Batch {
  constructor(tex) {
    this.tex = tex;
    this.parts = new Map();
    this.M = new THREE.Matrix4();
    this.stack = [];
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    this.stack.push(this.M.clone());
    this._m.compose(this._p.set(x, y, z), this._q.setFromAxisAngle(Y_AXIS, ry), this._s.set(s, s, s));
    this.M.multiply(this._m);
  }
  pop() { this.M = this.stack.pop(); }
  /** add geometry under material `key` with local placement; s = uniform scale or [sx,sy,sz]. */
  add(key, geo, color, x = 0, y = 0, z = 0, ry = 0, s = 1) {
    const g = prep(geo, color);
    const sv = Array.isArray(s) ? s : [s, s, s];
    this._m.compose(this._p.set(x, y, z), this._q.setFromAxisAngle(Y_AXIS, ry), this._s.set(sv[0], sv[1], sv[2]));
    this._m2.multiplyMatrices(this.M, this._m);
    g.applyMatrix4(this._m2);
    let arr = this.parts.get(key);
    if (!arr) this.parts.set(key, arr = []);
    arr.push(g);
  }
  material(key) {
    const o = { vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 };
    if (key === 'water') { o.roughness = 0.12; o.metalness = 0.05; }
    else if (this.tex[key]) o.map = this.tex[key];
    const m = new THREE.MeshStandardMaterial(o), ph = PHOTO[key];
    if (ph) detailWorld(m, _photo[key] || (_photo[key] = photoTex(ph[0], 'diff')), { scale: ph[2], mean: ph[1], strength: 0.9 });
    return m;
  }
  build(group) {
    for (const [key, arr] of this.parts) {
      const merged = mergeGeometries(arr, false);
      for (const g of arr) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.material(key));
      mesh.name = 'backdrop_' + key;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
  }
}

/* ------------------------------------------------------------------ context */

function makeCtx(group, seed) {
  const rnd = mulberry32(seed);
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
  return {
    group, rnd,
    r: (a, b) => a + (b - a) * rnd(),
    pick: (arr) => arr[(rnd() * arr.length) | 0],
    B: new Batch(makeTextures()),
    flags: [], sails: [], ships: [],
    hfs: [],
    flatMat,
    hf(x, z) { let m = 0; for (const f of this.hfs) m = Math.max(m, f(x, z)); return m; },
  };
}

/* ------------------------------------------------------------------ terrain: gentle grassy mounds */

/** Radially symmetric mound; surface y = ry*(1-d^p)+oy. Registers its height function in ctx. Returns hf(x,z). */
function mound(c, cx, cz, rx, rz, ry, colLow, colHigh = colLow, p = 2, oy = -0.3, ring = 8, seg = 28) {
  const pos = [], col = [], idx = [];
  const lo = new THREE.Color(colLow), hi = new THREE.Color(colHigh), tmp = new THREE.Color();
  for (let i = 0; i <= ring; i++) {
    const d = i / ring;
    const y = ry * (1 - Math.pow(d, p));
    tmp.copy(lo).lerp(hi, 1 - d);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(Math.cos(a) * d * rx, y, Math.sin(a) * d * rz);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = i * seg + j, b = i * seg + j2, cc = (i + 1) * seg + j, d = (i + 1) * seg + j2;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  c.B.add('flat', g, null, cx, oy, cz);
  const fn = (x, z) => {
    const dx = (x - cx) / rx, dz = (z - cz) / rz, d2 = dx * dx + dz * dz;
    if (d2 >= 1) return 0;
    return Math.max(0, ry * (1 - Math.pow(Math.sqrt(d2), p)) + oy);
  };
  c.hfs.push(fn);
  return fn;
}

/** Flat coloured ground patch (field, sand, etc.) as a thin box. */
function patch(c, x, z, w, d, col, y = 0.04, ry = 0) { c.B.add('flat', box(w, 0.12, d), col, x, y, z, ry); }

function plane(w, d) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; }

/* ------------------------------------------------------------------ building helpers */

/** Row of merlons along a line (local coordinates of the current transform). */
function crenelLine(c, x1, z1, x2, z2, y, col) {
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), n = Math.max(1, Math.floor(L / 2.3)), ry = Math.atan2(dx, dz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    c.B.add('stone', box(0.8, 1.1, 1.2), col, x1 + dx * t, y, z1 + dz * t, ry);
  }
}

/** Curtain wall segment between two ground points with crenellations; y1,y2 = ground heights at ends. */
function wall(c, x1, z1, x2, z2, y1, y2, h, th, col) {
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
  const yb = Math.min(y1, y2) - 1.5, hh = h + 1.5 + Math.abs(y2 - y1);
  c.B.add('stone', box(th, hh, L), col, (x1 + x2) / 2, yb, (z1 + z2) / 2, ry);
  crenelLine(c, x1, z1, x2, z2, yb + hh, col);
}

/** Round drum tower; o: {col, roof:'cone'|'battle', rc, roofH, seg}. */
function drum(c, x, y, z, r, h, o) {
  const B = c.B, seg = o.seg || 10;
  B.push(x, y, z, 0);
  B.add('stone', cyl(r, r * 1.06, h, seg), o.col);
  if (o.roof === 'cone') {
    B.add('roof', cone(r * 1.22, o.roofH || r * 1.7, seg), o.rc, 0, h - 0.2, 0);
  } else {
    B.add('stone', cyl(r + 0.45, r + 0.45, 0.9, seg), o.col, 0, h - 0.9, 0);
    const n = Math.max(6, Math.round(TAU * r / 2.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      B.add('stone', box(1.1, 1.1, 0.8), o.col, Math.sin(a) * (r + 0.2), h, Math.cos(a) * (r + 0.2), a);
    }
  }
  B.pop();
}

/** Square tower; o: {col, roof:'pyramid'|'spire'|'battle'|'none', rc, roofH, roofKey}. */
function sqTower(c, x, y, z, ry, w, d, h, o) {
  const B = c.B;
  B.push(x, y, z, ry);
  B.add('stone', box(w, h, d), o.col);
  const rh = o.roofH || w * 1.2;
  if (o.roof === 'pyramid') B.add(o.roofKey || 'roof', pyramid(w * 1.08, d * 1.08, rh), o.rc, 0, h, 0);
  else if (o.roof === 'spire') B.add('flat', cone(Math.min(w, d) * 0.6, rh, 8), o.rc, 0, h, 0);
  else if (o.roof === 'battle') {
    B.add('stone', box(w + 0.9, 0.9, d + 0.9), o.col, 0, h - 0.9, 0);
    const a = w / 2 + 0.3, b = d / 2 + 0.3;
    crenelLine(c, -a, -b, a, -b, h, o.col); crenelLine(c, a, -b, a, b, h, o.col);
    crenelLine(c, a, b, -a, b, h, o.col); crenelLine(c, -a, b, -a, -b, h, o.col);
    B.add('stone', cyl(1.2, 1.2, 4.5, 6), o.col, w / 2 - 0.6, h, d / 2 - 0.6);
  }
  B.pop();
}

/** Generic house. o:{wall:key, wc, rc, roof:'gable'|'hip'|'stepped'|'flat', roofH, sink, chimney}. ridge along local Z. */
function house(c, x, y, z, ry, w, d, h, o) {
  const B = c.B, wk = o.wall || 'plaster', sink = o.sink ?? 1.2, rh = o.roofH ?? w * 0.75;
  B.push(x, y, z, ry);
  B.add(wk, box(w, h + sink, d), o.wc, 0, -sink, 0);
  const roof = o.roof || 'gable';
  if (roof === 'hip') {
    B.add('roof', pyramid(w + 0.9, d + 0.9, rh), o.rc, 0, h, 0);
  } else if (roof === 'stepped') {
    B.add('roof', gableRoof(w, d, rh * 0.85, 0.15), o.rc, 0, h, 0);
    B.add(wk, gableEnds(w, d, rh * 0.85), o.wc, 0, h, 0);
    const n = 3, sh = rh / n;
    for (let i = 0; i < n; i++) B.add(wk, box(w * (1 - i * 0.3), sh, 0.7), o.wc, 0, h + i * sh, d / 2 - 0.35);
    B.add(wk, box(w * 0.14, 0.9, 0.7), o.wc, 0, h + rh, d / 2 - 0.35);
  } else if (roof === 'gable') {
    B.add('roof', gableRoof(w, d, rh, 0.5), o.rc, 0, h, 0);
    B.add(wk, gableEnds(w, d, rh), o.wc, 0, h, 0);
  }
  if (o.chimney) B.add('stone', box(0.9, rh * 0.5 + 1.5, 0.9), 0x8a7f74, w * 0.25, h + rh * 0.35, d * 0.2);
  B.pop();
}

/** Parish/village church: nave along local Z, west tower at -Z. o:{col,rc,w,L,h,tw,th,tower:{...}} */
function church(c, x, y, z, ry, o) {
  const B = c.B, w = o.w || 9, L = o.L || 22, h = o.h || 9, tw = o.tw || 6.5, th = o.th || 24;
  B.push(x, y - 0.8, z, ry);
  B.add('stone', box(w, h + 0.8, L), o.col);
  B.add('roof', gableRoof(w, L, h * 0.5, 0.5), o.rc, 0, h + 0.8, 0);
  B.add('stone', gableEnds(w, L, h * 0.5), o.col, 0, h + 0.8, 0);
  B.add('stone', box(w * 0.7, h * 0.85, L * 0.3), o.col, 0, 0, L / 2 + L * 0.12);
  B.add('roof', gableRoof(w * 0.7, L * 0.3, h * 0.4, 0.4), o.rc, 0, h * 0.85, L / 2 + L * 0.12);
  sqTower(c, 0, 0, -L / 2 + tw / 2, 0, tw, tw, th, Object.assign({ col: o.col, rc: o.rc, roof: 'pyramid' }, o.tower));
  B.pop();
}

/** Old St Paul's: cruciform Gothic cathedral with a central tower and tall lead spire.  Long axis = local Z. */
function cathedral(c, x, y, z, ry) {
  const B = c.B, st = 0xc4beaf, lead = 0x9a9fa6, slate = 0x72777e;
  B.push(x, y, z, ry);
  B.add('stone', box(15, 22, 46), st, 0, 0, -18);
  B.add('roof', gableRoof(15, 46, 8.5, 0.8), lead, 0, 22, -18);
  B.add('stone', gableEnds(15, 46, 8.5), st, 0, 22, -18);
  for (const s of [-1, 1]) {
    B.add('stone', box(6, 12, 46), st, s * 10.5, 0, -18);
    B.add('roof', gableRoof(6, 46, 3, 0.4), slate, s * 10.5, 12, -18);
    for (let k = 0; k < 9; k++) B.add('stone', box(1.2, 14, 1.4), st, s * 14.2, 0, -38 + k * 5);
  }
  // transept
  B.add('stone', box(13, 20, 46), st, 0, 0, 10);
  B.add('roof', gableRoof(13, 46, 7, 0.7), lead, 0, 20, 10, Math.PI / 2);
  B.push(0, 20, 10, Math.PI / 2); B.add('stone', gableEnds(13, 46, 7), st); B.pop();
  // choir
  B.add('stone', box(15, 20, 34), st, 0, 0, 33);
  B.add('roof', gableRoof(15, 34, 8, 0.8), lead, 0, 20, 33);
  B.add('stone', gableEnds(15, 34, 8), st, 0, 20, 33);
  // crossing tower + very tall thin lead spire
  B.add('stone', box(13, 38, 13), st, 0, 0, 10);
  B.add('stone', box(14.2, 1, 14.2), st, 0, 37, 10);
  B.add('flat', cone(5.4, 36, 8), lead, 0, 38, 10);
  B.add('flat', box(0.35, 4, 0.35), 0xd8c070, 0, 74, 10);
  B.add('flat', box(1.8, 0.35, 0.35), 0xd8c070, 0, 76.4, 10);
  // west front turrets
  for (const s of [-1, 1]) {
    B.add('stone', box(5, 26, 5), st, s * 7.5, 0, -42);
    B.add('roof', pyramid(5.6, 5.6, 8), slate, s * 7.5, 26, -42);
  }
  B.pop();
}

/** Gatehouse flanked by drum towers with a dark passage (8 m wide). */
function gatehouse(c, x, z, y, o) {
  const B = c.B;
  for (const s of [-1, 1]) drum(c, x + s * 9.5, y - 1, z, 5.5, o.h + 1, { col: o.col, roof: o.roof, rc: o.rc, roofH: 10 });
  B.add('stone', box(16.5, 5.5, 6.5), o.col, x, y + o.h - 5.5, z);
  const a = 8.3, b = 3.4, yy = y + o.h;
  c.B.push(x, 0, z, 0);
  crenelLine(c, -a, -b, a, -b, yy, o.col); crenelLine(c, -a, b, a, b, yy, o.col);
  c.B.pop();
  B.add('flat', box(8, 9, 0.4), 0x2d251e, x, y, z + 2.2);
}

/** Pennant flag on a pole; animated by update(). */
function flag(c, x, y, z, col, L = 3.2, pole = 4.5) {
  c.B.add('flat', box(0.14, pole, 0.14), 0x4a3a2a, x, y, z);
  c.flags.push({ x, y: y + pole, z, L, col: new THREE.Color(col) });
}

/** Sails for a windmill; hub at world (wx,wy,wz), plane facing the origin. */
function sails(c, wx, wy, wz, len, speed) {
  const P = [], wood = 0x5a4632, cloth = 0xe6dcc0;
  P.push(prep(box(1.1, 1.1, 1.1).translate(0, -0.55, 0), wood));
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    P.push(prep(box(0.5, len, 0.3).rotateZ(a), wood));
    P.push(prep(box(len * 0.2, len * 0.72, 0.1).translate(len * 0.12 + 0.35, len * 0.25, 0.15).rotateZ(a), cloth));
  }
  const mesh = new THREE.Mesh(mergeGeometries(P, false), c.flatMat);
  P.forEach((g) => g.dispose());
  mesh.castShadow = false; mesh.receiveShadow = false;
  const pivot = new THREE.Group();
  pivot.position.set(wx, wy, wz);
  pivot.rotation.y = Math.atan2(-wx, -wz);
  pivot.add(mesh);
  c.group.add(pivot);
  c.sails.push({ mesh, speed, ph: c.rnd() * 6 });
}

/** Timber post mill (body on trestle), front faces the origin. */
function postMill(c, x, z, y) {
  const B = c.B, ry = Math.atan2(-x, -z), wood = 0x7a6246;
  B.push(x, y, z, ry);
  B.add('flat', box(1.2, 4, 1.2), wood, 0, 0, 0);
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) B.add('flat', box(0.5, 4, 0.5), wood, lx, 0, lz);
  B.add('timber', box(5.2, 6.5, 6.5), 0xcfc2a0, 0, 3.5, 0);
  B.add('roof', gableRoof(5.2, 6.5, 3, 0.4), 0x6b5a45, 0, 10, 0);
  B.add('timber', gableEnds(5.2, 6.5, 3), 0xcfc2a0, 0, 10, 0);
  B.add('flat', box(0.3, 6, 0.3), wood, 0, 3, -6);       // tail pole
  B.pop();
  sails(c, x + Math.sin(ry) * 3.9, y + 8.2, z + Math.cos(ry) * 3.9, 10.5, 0.55);
}

/** Tower mill: tapering brick/plaster tower with conical cap. */
function towerMill(c, x, z, y, h, key, col, capCol, speed) {
  const B = c.B, ry = Math.atan2(-x, -z), rb = h * 0.3, rt = h * 0.2;
  B.push(x, y, z, ry);
  B.add(key, cyl(rt, rb, h, 10), col, 0, -1, 0);
  B.add('roof', cone(rt * 1.3, h * 0.3, 10), capCol, 0, h - 1.2, 0);
  B.pop();
  sails(c, x + Math.sin(ry) * (rt + 1.2), y + h - 1.5, z + Math.cos(ry) * (rt + 1.2), h * 0.85, speed);
}

/** Cog: single-masted medieval ship, merged into one geometry (local origin at waterline). */
function cogGeometry() {
  const P = [];
  const a = (g, col, x = 0, y = 0, z = 0) => { g.translate(x, y, z); P.push(prep(g, col)); };
  const hull = 0x70573b, dark = 0x41322a, sail = 0xece3cb, red = 0xa83030;
  a(box(5, 3.6, 15), hull, 0, -1.4, 0);
  a(box(5.4, 0.5, 15.4), dark, 0, 2.1, 0);
  a(box(4.6, 2.4, 3.6), hull, 0, 2.1, 6.1);
  a(box(5, 3.4, 4.8), hull, 0, 2.1, -5.1);
  a(box(4.8, 0.4, 5), dark, 0, 5.5, -5.1);
  a(box(0.35, 0.35, 4.5), dark, 0, 3.5, 9);
  a(cyl(0.28, 0.34, 17, 6), dark, 0, 2.1, 0.8);
  a(box(11, 0.3, 0.3), dark, 0, 17.4, 0.8);
  a(box(9.5, 9, 0.18), sail, 0, 8.4, 1.0);
  a(box(1.8, 9.05, 0.22), red, 0, 8.4, 1.0);
  a(box(0.12, 1.6, 2.2), red, 0, 17.4, -0.4);
  const m = mergeGeometries(P, false);
  P.forEach((g) => g.dispose());
  return m;
}

function ship(c, x, z, ry, scale = 1, y = 0.4) {
  const m = new THREE.Mesh(c.cogGeo || (c.cogGeo = cogGeometry()), c.flatMat);
  m.position.set(x, y, z);
  m.rotation.order = 'YXZ';
  m.rotation.y = ry;
  m.scale.setScalar(scale);
  m.castShadow = false; m.receiveShadow = false;
  c.group.add(m);
  c.ships.push({ mesh: m, y0: y, ph: c.rnd() * 6.28 });
}

/** Cone-over-cylinder striped pavilion tent. */
function pavilion(c, x, z, rot, A, Bc, rh = 7, r = 3.6) {
  const B = c.B, cA = new THREE.Color(A), cB = new THREE.Color(Bc);
  B.push(x, 0, z, rot);
  B.add('flat', cyl(r, r, 3, 12, true), [cA, cA, cB, cB], 0, 0, 0);
  B.add('flat', cone(r * 1.28, rh, 12), [cA, cB], 0, 3, 0);
  B.pop();
  flag(c, x, 3 + rh - 0.4, z, A, 2.6, 2.6);
}

/** Dense ring of houses around the origin in polar rows. cb(x,z,th,row) places one. */
function ringRows(c, r0, dr, rows, cb) {
  for (let k = 0; k < rows; k++) {
    const R = r0 + k * dr + c.r(-2, 2);
    let a = -Math.PI;
    while (a < Math.PI) {
      const w = c.r(5, 8), th = a + (w / 2) / R;
      a += (w + 0.5) / R;
      cb(R * Math.sin(th), R * Math.cos(th), th, k, w);
    }
  }
}

/* ================================================================== VENUES */

/* ---------- 1. Smithfield, London 1390 ---------- */
function smithfield(c) {
  const B = c.B, r = c.r, rnd = c.rnd;
  const hill = mound(c, 0, 250, 215, 125, 10, 0x80955f, 0x93a66a);
  const z0 = 150, wcol = 0xc2bcac, tcol = 0xb8b2a2, slate = 0x62666e;

  // city wall with drum towers and a central gatehouse
  const xs = [-190, -152, -114, -76, -38, -9.5, 9.5, 38, 76, 114, 152, 190];
  for (let i = 0; i < xs.length - 1; i++) {
    if (xs[i] === -9.5) continue;
    wall(c, xs[i], z0, xs[i + 1], z0, hill(xs[i], z0), hill(xs[i + 1], z0), 10, 3, wcol);
  }
  for (const x of [-190, -152, -114, -76, -38, 38, 76, 114, 152, 190]) {
    const cone_ = rnd() < 0.65;
    drum(c, x, hill(x, z0) - 1, z0, 5.2, 16, { col: tcol, roof: cone_ ? 'cone' : 'battle', rc: jit(slate, 0.1, rnd) });
  }
  gatehouse(c, 0, z0, hill(0, z0), { h: 17, col: tcol, roof: 'battle' });
  flag(c, -9.5, hill(0, z0) + 17, z0, 0xb0282c, 4, 5); flag(c, 9.5, hill(0, z0) + 17, z0, 0xe8e2d0, 4, 5);

  // parish churches + Old St Paul's + priory
  const churches = [
    { x: -128, z: 205, th: 26, spire: 1 }, { x: -72, z: 196, th: 30 }, { x: 62, z: 205, th: 28, spire: 1 },
    { x: 118, z: 228, th: 24 }, { x: 22, z: 214, th: 34, spire: 1 },
  ];
  for (const ch of churches) {
    church(c, ch.x, hill(ch.x, ch.z), ch.z, rnd() < 0.5 ? 0 : Math.PI / 2, {
      col: 0xc2bcac, rc: slate, w: 9, L: 20, h: 9, tw: 6.5, th: ch.th,
      tower: ch.spire ? { roof: 'spire', rc: 0x6d7580, roofH: 17 } : { roof: 'battle' },
    });
  }
  cathedral(c, -20, hill(-10, 262) - 0.6, 262, Math.PI / 2);
  // St Bartholomew's priory church (square Norman tower)
  church(c, 108, 0, 88, 0.5, { col: 0xb8ae98, rc: 0x7a5a48, w: 11, L: 26, h: 11, tw: 8, th: 27, tower: { roof: 'battle' } });

  // timber huddle
  const roofCols = [0x7a4a3a, 0x6c6f72, 0x8a5a40, 0xa58a4a, 0x5f5249];
  const wallCols = [0xd9cfb4, 0xcfc3a3, 0xc9b99a, 0xddd2bc];
  for (let gz = 158; gz < 255; gz += r(8, 10)) {
    for (let gx = -175; gx < 175; gx += r(6.5, 10)) {
      if (Math.abs(gx) < 8) continue;                          // keep the road into the town open
      const x = gx + r(-2, 2), z = gz + r(-2, 2);
      if (x > -80 && x < 40 && z > 238 && z < 290) continue;  // cathedral
      let near = false;
      for (const ch of churches) if (Math.abs(ch.x - x) < 14 && Math.abs(ch.z - z) < 14) near = true;
      if (near) continue;
      const w = r(5, 8), d = r(6, 9), h = r(6, 9) + (gz - 158) * 0.035;
      house(c, x, hill(x, z) - 0.2, z, rnd() < 0.5 ? 0 : Math.PI / 2 + r(-0.15, 0.15), w, d, h, {
        wall: rnd() < 0.75 ? 'timber' : 'plaster', wc: jit(c.pick(wallCols), 0.08, rnd),
        rc: jit(c.pick(roofCols), 0.1, rnd), roofH: w * r(0.8, 1.1), chimney: rnd() < 0.4,
      });
    }
  }
  // toward -Z: fields, thatched barns, windmill
  const fieldCols = [0xcdbb7a, 0x95a964, 0x8b7355, 0xb7b36f, 0x86a05a];
  for (let i = 0; i < 16; i++) patch(c, r(-200, 200), r(-300, -125), r(25, 55), r(20, 45), c.pick(fieldCols), 0.05 + i * 0.002, r(-0.3, 0.3));
  for (const [x, z, ry] of [[-110, -165, 0.4], [70, -190, 1.2], [140, -150, 0], [-40, -250, 0.9]]) {
    house(c, x, 0, z, ry, 9, 18, 4.5, { wall: 'timber', wc: 0xa8957a, rc: 0xb89a55, roofH: 6.5, sink: 0.5 });
  }
  postMill(c, -45, -205, 0);
  postMill(c, 120, -250, 0);
}

/* ---------- 2. Inglevert, coast near Calais 1390 ---------- */
// From the low hero eye the flat ground is hidden behind the stands/tents, so the coast is
// stylised: a sand ramp and a gently tilted sea plane that climb toward the horizon.
function inglevert(c) {
  const B = c.B, r = c.r, rnd = c.rnd;
  const seaY = (z) => 8 + (z - 170) * 0.1516;                 // height of the tilted sea at depth z
  // sand ramp (z 112..170) and tilted sea (z 170..480)
  {
    const g = plane(1500, 70.5); g.rotateX(-0.1137); B.add('flat', g, 0xd2c59c, 0, 4, 141);
    const s = plane(1500, 313.5); s.rotateX(-0.1505); B.add('water', s, 0x5f7f96, 0, 31.5, 325);
    const s2 = plane(1500, 40); s2.rotateX(-0.1505); B.add('water', s2, 0x86a9ad, 0, seaY(190) + 0.05, 190);
  }
  // low dune mounds, only at the sides
  for (let i = 0; i < 8; i++) {
    const x = (rnd() < 0.5 ? -1 : 1) * r(70, 220), z = r(120, 200);
    mound(c, x, z, r(22, 40), r(14, 24), r(2, 4), 0xa9a874, 0xb9b27a, 2, -0.4, 5, 16);
  }
  // tall chalk cliffs on the left
  const chalk = 0xeeeee4;
  for (let i = 0; i < 9; i++) {
    const x = -40 - i * 24 + r(-4, 4), z = 200 + (i % 3) * 20 + r(0, 10), w = r(30, 50), h = r(28, 40), d = r(40, 70);
    const y = seaY(z) - 3;
    B.add('flat', box(w, h, d), jit(chalk, 0.06, rnd), x, y, z);
    B.add('flat', box(w + 1, 1.6, d + 1), 0x8da25f, x, y + h - 0.2, z);
  }
  // Calais on an island right of centre, with a tall lighthouse
  const mh = mound(c, 95, 205, 75, 36, 8, 0xc4b88e, 0x9aa66e, 2, 9, 6, 24);
  const x0 = 45, x1 = 145, z0 = 188, z1 = 222, wcol = 0xc4bda9, base = 12;
  wall(c, x0, z0, x1, z0, base, base, 8, 2.4, wcol); wall(c, x1, z0, x1, z1, base, base, 8, 2.4, wcol);
  wall(c, x1, z1, x0, z1, base, base, 8, 2.4, wcol); wall(c, x0, z1, x0, z0, base, base, 8, 2.4, wcol);
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [95, z0], [95, z1]]) {
    drum(c, x, base - 1, z, 4.6, 15, { col: wcol, roof: 'cone', rc: 0x686a70, roofH: 8 });
  }
  for (let gz = z0 + 6; gz < z1 - 4; gz += 8) {
    for (let gx = x0 + 6; gx < x1 - 4; gx += 8) {
      const x = gx + r(-1.5, 1.5), z = gz + r(-1.5, 1.5);
      house(c, x, Math.max(mh(x, z), base - 1), z, rnd() < 0.5 ? 0 : Math.PI / 2, r(5, 7), r(6, 8), r(6.5, 9), {
        wall: rnd() < 0.5 ? 'plaster' : 'timber', wc: jit(0xe0d6bc, 0.1, rnd), rc: jit(c.pick([0x70503f, 0x62666e, 0x8a5a40]), 0.1, rnd),
        roofH: r(4, 6), sink: 2.5,
      });
    }
  }
  sqTower(c, 110, base - 1, 205, 0, 8, 8, 44, { col: 0xc4bda9, roof: 'spire', rc: 0x6a707a, roofH: 16 });   // belfry
  church(c, 75, base - 0.5, 205, 0, { col: 0xc4bda9, rc: 0x62666e, w: 10, L: 24, h: 13, tw: 7, th: 28, tower: { roof: 'pyramid' } });
  const lx = 52, lz = 232;
  B.add('stone', cyl(4.4, 5.6, 42, 10), 0xd3ccb8, lx, base - 1, lz);
  B.add('stone', cyl(5.6, 5.6, 1, 10), 0xd3ccb8, lx, base + 40, lz);
  B.add('flat', cyl(2.4, 2.4, 4, 8), 0xf2d27a, lx, base + 41, lz);
  B.add('roof', cone(3.6, 5, 8), 0x555a62, lx, base + 45, lz);
  flag(c, lx, base + 50, lz, 0xb0282c, 3, 3);
  // Saint-Inglevert chapel with bell-cote (nearer)
  const cx = -72, cz = 142;
  house(c, cx, 0, cz, 0.3, 7.5, 15, 6.5, { wall: 'stone', wc: 0xcbc3ae, rc: 0x6e6256, roofH: 4.5, sink: 0.6 });
  B.push(cx, 0, cz, 0.3);
  B.add('stone', box(3.4, 6, 0.9), 0xcbc3ae, 0, 6.5, 7.4);
  B.add('flat', box(0.9, 1.8, 0.2), 0x2b241d, -0.8, 7.6, 7.9); B.add('flat', box(0.9, 1.8, 0.2), 0x2b241d, 0.8, 7.6, 7.9);
  B.add('roof', gableRoof(3.4, 0.9, 1.6, 0.3), 0x6e6256, 0, 12.5, 7.4);
  B.add('stone', box(7, 5, 9), 0xcbc3ae, 7.5, 0, 3);
  B.add('roof', gableRoof(7, 9, 3, 0.4), 0x6e6256, 7.5, 5, 3);
  B.pop();
  // tall-masted cogs at anchor, centre-left, breaking the horizon
  ship(c, -30, 205, 0.7, 1.5, seaY(205) + 0.3); ship(c, -8, 232, -0.8, 1.6, seaY(232) + 0.3);
  ship(c, -48, 245, 1.2, 1.4, seaY(245) + 0.3); ship(c, 20, 262, 0.3, 1.5, seaY(262) + 0.3);

  // toward -Z: heraldic pavilions + tree of shields
  const pairs = [[0xb0282c, 0xeee6d0], [0x2b4c9b, 0xd9a521], [0x3b7a4a, 0xeee6d0], [0x8a2a3a, 0xd9a521], [0x1f3a6a, 0xeee6d0], [0xd9a521, 0x2a2a2a]];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 7; i++) {
      const x = -95 + i * 30 + r(-4, 4) + row * 8, z = -125 - row * 16 + r(-3, 3), p = c.pick(pairs);
      pavilion(c, x, z, r(0, 3), p[0], p[1], r(6, 9), r(3.2, 4.2));
    }
  }
  mound(c, 62, -172, 24, 20, 4.5, 0x8da25f, 0x9bb06a, 2, -0.2, 5, 16);
  const tx = 62, tz = -172;
  B.add('flat', cyl(0.7, 0.9, 10, 7), 0x5a4632, tx, 4, tz);
  B.add('flat', new THREE.SphereGeometry(5.2, 8, 6), 0x5f8a45, tx, 14.5, tz);
  const shieldCols = [0xb0282c, 0x2b4c9b, 0xd9a521, 0xeee6d0, 0x3b7a4a, 0x2a2a2a];
  for (let i = 0; i < 28; i++) {
    const a = r(0, TAU), el = r(-0.2, 1.1), rad = 5.6;
    const sx = tx + Math.cos(a) * Math.cos(el) * rad, sy = 14.5 + Math.sin(el) * rad, sz = tz + Math.sin(a) * Math.cos(el) * rad;
    B.add('flat', box(1.0, 1.3, 0.14), c.pick(shieldCols), sx, sy - 0.65, sz, -a + Math.PI / 2);
  }
}

/* ---------- 3. León, Órbigo bridge 1434 ---------- */
function leon(c) {
  const B = c.B, r = c.r, rnd = c.rnd;
  // dry plain ring around the green lists, blending from grass to tan
  {
    const g = new THREE.RingGeometry(112, 900, 48, 10);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    const grass = new THREE.Color(0x768f4f), tan = new THREE.Color(0xb9a66e), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const rad = Math.hypot(p.getX(i), p.getZ(i)), k = THREE.MathUtils.smoothstep(rad, 112, 230);
      t.copy(grass).lerp(tan, k);
      col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    B.add('flat', g, null, 0, 0.03, 0);
  }
  // river + sandbanks
  B.add('water', plane(1500, 36), 0x7a9a9c, 0, 0.12, 170);
  for (let i = 0; i < 14; i++) mound(c, r(-320, 320), r(156, 184), r(14, 36), r(3, 6), 0.5, 0xdccfa5, 0xe6dab4, 2, 0.05, 3, 12);

  // the long bridge: 19 pointed arches, slightly oblique across the river
  const bay = archBay(10.8, 22, 7, 18.5, 9, 5);
  const bryaw = -Math.atan2(32, 230);
  B.push(0, 0, 170, bryaw);
  for (let i = 0; i < 19; i++) B.add('stone', bay.clone(), 0xd6c8a4, (i - 9) * 10.8, 0, 0);
  const BL = 19 * 10.8;
  for (const s of [-1, 1]) B.add('stone', box(BL, 1.0, 0.7), 0xcfc19c, 0, 22, s * 2.4);
  for (let i = 0; i <= 19; i++) for (const s of [-1, 1]) B.add('stone', box(1.4, 1.5, 1.2), 0xcfc19c, (i - 9.5) * 10.8, 22, s * 2.5);   // pier buttresses
  B.add('flat', box(BL + 20, 0.3, 4), 0xb6a27a, 0, 21.95, 0);
  B.pop();
  bay.dispose();

  // poplars along both banks
  const popCols = [0x5f7d3b, 0x6a8842, 0x557235];
  for (const zb of [146, 196]) {
    for (let x = -420; x < 420; x += r(14, 30)) {
      if (Math.abs(x) < 14) continue;
      const h = r(20, 28), z = zb + r(-4, 4);
      B.add('flat', new THREE.SphereGeometry(1, 6, 5), jit(c.pick(popCols), 0.12, rnd), x, h * 0.5 + 1, z, 0, [r(1.4, 2), h * 0.5, r(1.4, 2)]);
    }
  }
  // village beyond the river: ochre plaster, terracotta roofs
  const ochre = [0xe2c797, 0xd8b98a, 0xe7d3a8, 0xd2b07e], terra = [0xb5603c, 0xa8553a, 0xc26c45];
  const chX = 30, chZ = 225;
  for (let gz = 205; gz < 275; gz += r(8, 11)) {
    for (let gx = -150; gx < 150; gx += r(7, 11)) {
      const x = gx + r(-2, 2), z = gz + r(-2, 2);
      if (Math.abs(x) < 9) continue;
      if (Math.abs(x - chX) < 22 && Math.abs(z - chZ) < 22) continue;
      house(c, x, 0, z, rnd() < 0.5 ? 0 : Math.PI / 2, r(5.5, 8), r(6, 9), r(7, 9.5), {
        wall: 'plaster', wc: jit(c.pick(ochre), 0.1, rnd), rc: jit(c.pick(terra), 0.1, rnd), roofH: r(3.5, 5), sink: 0.5,
      });
    }
  }
  // Romanesque church with apse and bell-gable
  B.push(chX, 0, chZ, 0.2);
  B.add('stone', box(10, 11, 24), 0xd9cba4, 0, -0.5, 0);
  B.add('roof', gableRoof(10, 24, 3.4, 0.5), 0xb5603c, 0, 10.5, 0);
  B.add('stone', gableEnds(10, 24, 3.4), 0xd9cba4, 0, 10.5, 0);
  B.add('stone', cyl(4.4, 4.6, 8, 8), 0xd9cba4, 0, -0.5, 14);
  B.add('roof', cone(5.2, 3.2, 8), 0xb5603c, 0, 7.4, 14);
  B.add('stone', box(8, 15, 1.6), 0xd9cba4, 0, 10.5, -11.2);
  B.add('stone', box(6.5, 28, 6.5), 0xd9cba4, 8.5, -0.5, -7);
  B.add('roof', pyramid(7.4, 7.4, 8), 0xb5603c, 8.5, 27.5, -7);                  // espadaña (bell-gable)
  B.add('flat', box(1.5, 3, 0.4), 0x2b241d, -1.8, 17, -11.4); B.add('flat', box(1.5, 3, 0.4), 0x2b241d, 1.8, 17, -11.4);
  B.add('roof', gableRoof(8, 1.6, 2.2, 0.3), 0xb5603c, 0, 25.5, -11.2);
  B.add('flat', box(0.3, 1.8, 0.3), 0x3a3028, 0, 27.7, -11.2);
  B.pop();
  flag(c, 38, 28, 218, 0xb0282c, 2.6, 4);

  // mesa hills and a sierra
  const mesaCols = [0xc29d68, 0xb9905c, 0xcaa874];
  for (let i = 0; i < 8; i++) {
    const x = -420 + i * 120 + r(-30, 30), z = r(450, 600), rb = r(110, 190), h = r(60, 120);
    B.add('flat', cyl(rb * 0.55, rb, h, 9), jit(c.pick(mesaCols), 0.08, rnd), x, -1, z, r(0, 3), [r(1.2, 2.2), 1, 1]);
  }
  for (let i = 0; i < 18; i++) {
    const x = -600 + i * 70 + r(-20, 20), z = r(520, 620);
    B.add('flat', cone(r(80, 120), r(90, 130), 7), jit(0xae9272, 0.1, rnd), x, -1, z, 0, [1.8, 1, 1]);
  }
  // toward -Z: Camino pilgrim hospice with arcade, wayside cross
  const hx = -60, hz = -145;
  B.push(hx, 0, hz, 0.15);
  B.add('plaster', box(38, 8, 11), 0xdcc79c, 0, -0.5, 0);
  B.add('roof', gableRoof(11, 38, 3.4, 0.6), 0xb5603c, 0, 7.5, 0, Math.PI / 2);
  B.push(0, 7.5, 0, Math.PI / 2); B.add('plaster', gableEnds(11, 38, 3.4), 0xdcc79c); B.pop();
  const arc = archBay(5, 5, 2.0, 3.8, 3.6, 3.4);
  for (let i = 0; i < 7; i++) B.add('stone', arc.clone(), 0xd6c8a4, (i - 3) * 5, 0, 7.2);
  B.add('flat', box(36, 0.5, 3.4), 0xb6a27a, 0, 5, 7.2);
  B.add('stone', box(5, 7, 1.2), 0xd9cba4, 14, 10.8, -4);
  B.add('flat', box(1.2, 2.2, 0.4), 0x2b241d, 14, 13.5, -4.6);
  B.pop(); arc.dispose();
  const wx = 22, wz = -118;
  B.add('stone', box(5, 0.8, 5), 0xc9bc98, wx, 0, wz); B.add('stone', box(3.2, 0.8, 3.2), 0xc9bc98, wx, 0.8, wz);
  B.add('stone', box(0.9, 7.5, 0.9), 0xd0c3a0, wx, 1.6, wz); B.add('stone', box(3.4, 0.9, 0.9), 0xd0c3a0, wx, 6.2, wz);
  for (let i = 0; i < 10; i++) {
    const x = r(-250, 250), z = r(-300, -125);
    B.add('flat', new THREE.SphereGeometry(1, 6, 4), 0x7c8a4c, x, 0.6, z, 0, [r(2, 4), r(0.8, 1.4), r(2, 4)]);
  }
}

/* ---------- 4. Bruges, market square 1468 ---------- */
function bruges(c) {
  const B = c.B, r = c.r, rnd = c.rnd, pick = c.pick;
  const bricks = [0xb9593b, 0xc47544, 0xa84b34, 0xbf6a42, 0xb05f3c];
  const roofs = [0x4f4a4d, 0x6e4034, 0x58545a];
  const flagCols = [0xb22b2b, 0xe8d9a0, 0x2b4c9b, 0xd9a521, 0x2f7a46];
  const canalX = -134, rampX = 96, rampZ = 185;
  const hill = mound(c, rampX, rampZ, 30, 30, 8, 0x6f9a52, 0x84a95e, 2, -0.4, 5, 20);

  // houses
  ringRows(c, 118, 14.5, 6, (x, z, th, k, w) => {
    if (k >= 2 && Math.abs(th) > 1.35) return;
    if (k >= 4 && Math.abs(th) > 1.0) return;
    if (z > 0 && Math.abs(x) < 14) return;                           // road corridor to the Belfry
    if (Math.abs(x - canalX) < 11 && z > -100 && z < 150) return;    // canal
    if (Math.hypot(x - rampX, z - rampZ) < 40) return;               // rampart
    const h = r(11, 16) + k * 1.6, d = r(9, 12), ry = Math.atan2(-x, -z);
    const plaster = rnd() < 0.22;
    house(c, x, 0, z, ry, w, d, h, {
      wall: plaster ? 'plaster' : 'brick', wc: jit(plaster ? 0xe9e1cc : pick(bricks), 0.1, rnd),
      rc: jit(pick(roofs), 0.1, rnd), roof: rnd() < 0.75 ? 'stepped' : 'gable', roofH: w * r(0.7, 0.95), sink: 1, chimney: rnd() < 0.3,
    });
    if (rnd() < 0.3) flag(c, x, h + w * 0.8, z, pick(flagCols), 2.6, 3.2);
  });

  // canal with quays and a humped bridge
  B.add('water', plane(7.5, 250), 0x5c7c72, canalX, 0.1, 10);
  for (const s of [-1, 1]) B.add('stone', box(1.2, 1.4, 250), 0xb6ab98, canalX + s * 4.4, 0, 10);
  B.add('stone', humpBridge(15, 4, 3.1), 0xc0b49f, canalX, 0.2, 40);

  // rampart with two windmills
  towerMill(c, rampX - 11, rampZ + 4, hill(rampX - 11, rampZ + 4) - 0.2, 16, 'plaster', 0xe4dcc6, 0x4f4a4d, 0.6);
  towerMill(c, rampX + 12, rampZ - 3, hill(rampX + 12, rampZ - 3) - 0.2, 14, 'brick', 0xb9593b, 0x4f4a4d, -0.5);

  // Belfry of Bruges on the Halle, behind the houses on +Z
  const bx = 8, bz = 232, bs = 0xc9a58c;
  B.add('brick', box(44, 17, 20), jit(0xb4563a, 0.05, rnd), bx, 0, bz);
  B.add('roof', gableRoof(44, 20, 6, 0.8), 0x4f4a4d, bx, 17, bz, 0, 1);
  B.add('brick', gableEnds(44, 20, 6), 0xb4563a, bx, 17, bz);
  B.add('brick', box(15, 40, 15), 0xb4563a, bx, 0, bz);
  B.add('stone', box(14.2, 11, 14.2), 0xcfc4b0, bx, 40, bz);
  B.add('stone', box(15.4, 1.2, 15.4), 0xcfc4b0, bx, 50, bz);
  for (const [sx, sz] of [[-6.8, -6.8], [6.8, -6.8], [-6.8, 6.8], [6.8, 6.8]]) {
    B.add('stone', cyl(1.3, 1.3, 5, 6), 0xcfc4b0, bx + sx, 51, bz + sz);
    B.add('roof', cone(1.7, 3, 6), 0x4f4a4d, bx + sx, 56, bz + sz);
  }
  B.add('stone', cyl(5.6, 5.6, 11, 8), 0xd6ccb8, bx, 51, bz);                // octagonal lantern
  B.add('stone', cyl(6.2, 6.2, 0.9, 8), 0xd6ccb8, bx, 61.5, bz);
  B.add('roof', cone(5.2, 9, 8), 0x4f4a4d, bx, 62, bz);
  B.add('flat', box(0.3, 4, 0.3), 0xd8c070, bx, 70.5, bz);
  flag(c, bx + 6.8, 56, bz - 6.8, 0xd9a521, 3, 3);
  // Church of Our Lady: nave + brick tower and tall spire
  const lx = -80, lz = 262;
  B.push(lx, 0, lz, Math.PI / 2);
  B.add('brick', box(24, 20, 56), 0xae5238, 0, 0, 6);
  B.add('roof', gableRoof(24, 56, 10, 0.8), 0x58545a, 0, 20, 6);
  B.add('brick', gableEnds(24, 56, 10), 0xae5238, 0, 20, 6);
  for (const s of [-1, 1]) B.add('brick', box(8, 13, 56), 0xae5238, s * 15, 0, 6);
  B.add('brick', box(13, 40, 13), 0xae5238, 0, 0, -26);
  B.add('stone', box(11, 4, 11), 0xcfc4b0, 0, 40, -26);
  B.add('flat', cone(6.2, 30, 8), 0x8a4a3a, 0, 44, -26);
  for (const [sx, sz] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) B.add('flat', cone(1, 7, 6), 0x8a4a3a, sx, 40, -26 + sz);
  B.pop();
  for (const [dx, dz, col] of [[-20, 6, 0xb22b2b], [20, 4, 0xe8d9a0]]) flag(c, bx + dx, 17, bz + dz, col, 3, 6);
}

/* ---------- 5. Nuremberg, Imperial city 1501 ---------- */
function nuremberg(c) {
  const B = c.B, r = c.r, rnd = c.rnd, pick = c.pick;
  const hill = mound(c, 0, 262, 195, 112, 14, 0x86996a, 0x9aa672);
  const hc = hill(-5, 285);
  mound(c, -5, 285, 58, 40, 26, 0xa07c5a, 0xc29a74, 3, hc - 5, 8, 24);       // sandstone crag
  const top = hill(-5, 285);                                                  // crag top
  const sand = 0xc7a37e, sand2 = 0xbb9672, tile = 0xa4472f, tile2 = 0x93402c, green = 0x70a58c;

  // city wall with thick drum towers + gatehouse
  const z0 = 163;
  const xs = [-190, -156, -122, -88, -54, -20, -9.5, 9.5, 20, 54, 88, 122, 156, 190];
  for (let i = 0; i < xs.length - 1; i++) {
    if (xs[i] === -9.5) continue;
    wall(c, xs[i], z0, xs[i + 1], z0, hill(xs[i], z0), hill(xs[i + 1], z0), 10, 3, sand2);
  }
  for (const x of [-190, -156, -122, -88, -54, -20, 20, 54, 88, 122, 156, 190]) {
    drum(c, x, hill(x, z0) - 1, z0, 6.2, 17, { col: sand2, roof: 'cone', rc: jit(tile2, 0.1, rnd), roofH: 11 });
  }
  gatehouse(c, 0, z0, hill(0, z0), { h: 19, col: sand2, roof: 'cone', rc: tile2 });
  flag(c, 0, hill(0, z0) + 20, z0, 0xd9a521, 4, 4);

  // half-timbered houses climbing the hill
  const roofCols = [0x9d4631, 0xa85238, 0x8e3f2d, 0xb05a3c];
  for (let gz = 172; gz < 262; gz += r(8, 9.5)) {
    for (let gx = -175; gx < 175; gx += r(7.5, 10)) {
      const x = gx + r(-2, 2), z = gz + r(-2, 2);
      if (Math.abs(x) < 8) continue;
      const dx = (x + 5) / 62, dz = (z - 285) / 44;
      if (dx * dx + dz * dz < 1.2) continue;                                  // crag
      if (Math.abs(x + 62) < 18 && Math.abs(z - 232) < 28) continue;          // St Lorenz
      if (Math.abs(x - 72) < 18 && Math.abs(z - 228) < 28) continue;          // St Sebald
      const w = r(6, 8.5), d = r(7, 9), h = r(8, 12);
      house(c, x, hill(x, z - 3) - 0.3, z, rnd() < 0.5 ? 0 : Math.PI / 2, w, d, h, {
        wall: rnd() < 0.85 ? 'timber' : 'plaster', wc: jit(0xe4dac0, 0.08, rnd),
        rc: jit(pick(roofCols), 0.1, rnd), roofH: w * r(1.0, 1.25), sink: 2.5, chimney: rnd() < 0.4,
      });
    }
  }
  // twin-towered churches with green copper spires
  for (const [x, z, s] of [[-62, 232, 1.1], [72, 228, 1]]) {
    const y = hill(x, z) - 0.8;
    B.push(x, y, z, 0);
    B.add('stone', box(15 * s, 18, 40), sand, 0, 0, 0);
    B.add('roof', gableRoof(15 * s, 40, 11, 0.8), tile, 0, 18, 0);
    B.add('stone', gableEnds(15 * s, 40, 11), sand, 0, 18, 0);
    B.add('stone', box(8, 22, 14), sand, 0, 0, 24);                                // choir
    B.add('roof', gableRoof(8, 14, 6, 0.5), tile, 0, 22 * 0.8, 24);
    for (const t of [-1, 1]) {
      B.add('stone', box(7.5, 38 * s, 7.5), sand2, t * 5.2 * s, 0, -16);
      B.add('stone', box(8.4, 1, 8.4), sand2, t * 5.2 * s, 37 * s, -16);
      B.add('flat', cone(4.9, 25 * s, 8), green, t * 5.2 * s, 38 * s, -16);
      for (const [px, pz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) B.add('flat', cone(0.7, 5, 6), green, t * 5.2 * s + px, 38 * s, -16 + pz);
      B.add('flat', box(0.3, 3, 0.3), 0xd8c070, t * 5.2 * s, 63 * s, -16);
    }
    B.pop();
  }
  // Kaiserburg on the crag
  const cx = -5, cz = 285, cy = top - 1.5;
  wall(c, cx - 42, cz - 20, cx + 42, cz - 20, cy, cy, 10, 3.5, sand);
  wall(c, cx - 42, cz - 20, cx - 42, cz + 18, cy, cy, 10, 3.5, sand);
  wall(c, cx + 42, cz - 20, cx + 42, cz + 18, cy, cy, 10, 3.5, sand);
  house(c, cx - 14, cy, cz - 6, Math.PI / 2, 15, 40, 15, { wall: 'stone', wc: sand, rc: tile, roofH: 15, sink: 3 });    // Palas
  house(c, cx + 22, cy, cz - 8, Math.PI / 2, 13, 36, 11, { wall: 'stone', wc: sand2, rc: tile2, roofH: 15, sink: 3 });  // Kaiserstallung
  drum(c, cx - 34, cy - 1, cz + 8, 8.6, 33, { col: sand, roof: 'cone', rc: 0x6a8a78, roofH: 11, seg: 12 });           // Sinwell tower
  B.add('stone', cyl(7.8, 8.2, 29, 5), sand2, cx + 12, cy - 1, cz + 10);                                              // pentagonal tower
  B.add('roof', cone(10, 14, 5), tile, cx + 12, cy + 27.5, cz + 10);
  for (const [dx, dz] of [[-42, -20], [42, -20], [42, 18], [-42, 18]]) drum(c, cx + dx, cy - 1, cz + dz, 4.6, 17, { col: sand, roof: 'cone', rc: tile2, roofH: 8 });
  flag(c, cx - 34, cy + 44, cz + 8, 0x1a1a1a, 5, 4); flag(c, cx + 12, cy + 41, cz + 10, 0xd9a521, 5, 4);

  // toward -Z: half-timbered ring + the Frauenkirche gable front
  ringRows(c, 122, 14, 3, (x, z, th, k, w) => {
    if (Math.abs(th) < 1.25) return;
    const h = r(9, 13) + k;
    house(c, x, 0, z, Math.atan2(-x, -z), w, r(8, 10), h, {
      wall: rnd() < 0.85 ? 'timber' : 'plaster', wc: jit(0xe4dac0, 0.08, rnd), rc: jit(pick(roofCols), 0.1, rnd),
      roofH: w * r(1.0, 1.3), sink: 1, chimney: rnd() < 0.3,
    });
  });
  const fx = 30, fz = -168;
  B.push(fx, 0, fz, Math.atan2(-fx, -fz));
  B.add('stone', box(24, 24, 20), 0xd2c6ac, 0, -0.5, 0);
  B.add('roof', gableRoof(24, 20, 14, 0.4), tile, 0, 23.5, 0);
  for (let i = 0; i < 6; i++) B.add('stone', box(24 * (1 - i * 0.17), 2.4, 1.2), 0xd2c6ac, 0, 23.5 + i * 2.4, 9.2);
  B.add('stone', box(2.5, 2, 1.2), 0xd2c6ac, 0, 38, 9.2);
  for (const s of [-1, 1]) {
    B.add('stone', cyl(1.7, 1.9, 33, 6), 0xd2c6ac, s * 11.5, 0, 9);
    B.add('flat', cone(2.2, 8, 6), green, s * 11.5, 33, 9);
  }
  B.add('stone', box(11, 9, 4.5), 0xd2c6ac, 0, 0, 11.5);                         // porch
  B.add('roof', gableRoof(11, 4.5, 4, 0.3), tile, 0, 9, 11.5);
  B.pop();
  flag(c, fx, 40, fz, 0xb22b2b, 3, 3);
}

const VENUES = { smithfield, inglevert, leon, bruges, nuremberg };
const IDS = Object.keys(VENUES);

/* ------------------------------------------------------------------ public API */

/**
 * Build a venue skyline into `group`.
 * @param {THREE.Group} group
 * @param {string} venueId 'smithfield' | 'inglevert' | 'leon' | 'bruges' | 'nuremberg'
 * @param {{seed?:number}} opts
 * @returns {{update:(t:number)=>void}}
 */
export function buildBackdrop(group, venueId, opts = {}) {
  const seed = opts.seed ?? 1;
  const id = IDS.includes(venueId) ? venueId : 'smithfield';
  const c = makeCtx(group, (seed * 7919 + IDS.indexOf(id) * 104729) | 0);
  VENUES[id](c);
  c.B.build(group);

  // pennants: one merged mesh, tip vertices animated in update()
  let flagPos = null, flagGeo = null, tipRest = null, tipPerp = null, phases = null;
  const nf = c.flags.length;
  if (nf) {
    const pos = new Float32Array(nf * 9), col = new Float32Array(nf * 9);
    tipRest = new Float32Array(nf * 3); tipPerp = new Float32Array(nf * 2); phases = new Float32Array(nf);
    const wind = 0.6, wx = Math.cos(wind), wz = Math.sin(wind);
    c.flags.forEach((f, i) => {
      const o = i * 9, H = f.L * 0.5;
      pos.set([f.x, f.y, f.z, f.x, f.y - H, f.z, f.x + wx * f.L, f.y - H * 0.55, f.z + wz * f.L], o);
      for (let k = 0; k < 3; k++) { col[o + k * 3] = f.col.r; col[o + k * 3 + 1] = f.col.g; col[o + k * 3 + 2] = f.col.b; }
      tipRest.set([pos[o + 6], pos[o + 7], pos[o + 8]], i * 3);
      tipPerp[i * 2] = -wz * f.L * 0.3; tipPerp[i * 2 + 1] = wx * f.L * 0.3;
      phases[i] = c.rnd() * 6.28;
    });
    flagGeo = new THREE.BufferGeometry();
    flagPos = new THREE.BufferAttribute(pos, 3);
    flagPos.setUsage(THREE.DynamicDrawUsage);
    flagGeo.setAttribute('position', flagPos);
    flagGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    flagGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nf * 9).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    flagGeo.computeBoundingSphere();
    flagGeo.boundingSphere.radius += 50;
    const m = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.3,
    }));
    m.name = 'backdrop_flags'; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    group.add(m);
  }

  const sailsList = c.sails, shipList = c.ships;
  return {
    update(t) {
      for (let i = 0; i < sailsList.length; i++) { const s = sailsList[i]; s.mesh.rotation.z = t * s.speed + s.ph; }
      for (let i = 0; i < shipList.length; i++) {
        const s = shipList[i], m = s.mesh;
        m.position.y = s.y0 + Math.sin(t * 0.9 + s.ph) * 0.25;
        m.rotation.z = Math.sin(t * 0.7 + s.ph) * 0.03;
        m.rotation.x = Math.sin(t * 0.55 + s.ph * 1.3) * 0.02;
      }
      if (flagPos) {
        const a = flagPos.array;
        for (let i = 0; i < nf; i++) {
          const w = Math.sin(t * 3.2 + phases[i]), o = i * 9 + 6;
          a[o] = tipRest[i * 3] + tipPerp[i * 2] * w;
          a[o + 1] = tipRest[i * 3 + 1] + w * 0.12;
          a[o + 2] = tipRest[i * 3 + 2] + tipPerp[i * 2 + 1] * w;
        }
        flagPos.needsUpdate = true;
      }
    },
  };
}
