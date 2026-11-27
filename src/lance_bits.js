import * as THREE from 'three';

// Pieces of a broken lance, cut from the real one (src/jouster.js builds it from the same profile): the knight's painted spiral, the leather grip, the steel vamplate on the
// butt piece, a jagged splintered break with a few long torn fibres, the coronel on the fore piece. One merged geometry per piece (shared), one cached material per colour pair.
// Geometry is built along +z in the lance's own metres about the piece's middle. aMask: -1 steel, 0 pale wood, 1 paint (spiral), 2 leather. aSt: (turn 0..1, metres along the lance).

const PROFILE = [[-0.95, 0.03], [-0.3, 0.036], [-0.13, 0.027], [0.1, 0.027], [0.25, 0.043], [0.4, 0.045], [1.0, 0.04], [1.7, 0.034], [2.7, 0.022], [2.705, 0.0]];
const rad = (z) => { for (let i = 1; i < PROFILE.length; i++) if (z <= PROFILE[i][0]) { const a = PROFILE[i - 1], b = PROFILE[i], k = (z - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; } return 0.02; };
const VAMP = [[0.03, 0.13], [0.07, 0.15], [0.135, 0.2], [0.14, 0.215], [0.06, 0.24], [0.03, 0.25]];
const CORONEL = [[0.022, 2.69], [0.03, 2.71], [0.04, 2.74], [0.042, 2.79], [0.03, 2.82], [0.0, 2.82]];
const N = 10;
const TEETH = [0.03, 0.24, 0.06, 0.15, 0.02, 0.30, 0.07, 0.18, 0.04, 0.21];      // how far each fibre of the break stands out (m)

const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** A piece of the lance from z = a to z = b (lance metres from the grip). jagA / jagB: that end is a torn break (a: the rear end, b: the fore end). vamp: the steel vamplate (needs a < 0.13). crown: the coronel at the tip. */
export function lancePiece({ a, b, jagA = false, jagB = false, vamp = false, crown = false, seed = 1, mid = true }) {
  const R = rng(seed), pos = [], msk = [], st = [], idx = [];
  const push = (x, y, z, m, u) => { pos.push(x, y, z); msk.push(m); st.push(u, z); return pos.length / 3 - 1; };
  const maskAt = (z) => z > -0.13 && z < 0.1 ? 2 : 1;
  const rings = [];      // [z, mask]
  const zs = [a]; for (let z = Math.ceil((a + 0.05) / 0.4) * 0.4; z < b - 0.05; z += 0.4) zs.push(z); zs.push(b);
  for (const z of zs) {
    if (z > -0.13 + 1e-3 && z < 0.1 - 1e-3) { rings.push([z, 2]); continue; }
    rings.push([z, maskAt(z)]);
  }
  // hard edges of the leather grip: doubled rings
  const edge = (z, before, after) => { if (z > a && z < b) { const i = rings.findIndex(r => r[0] > z); const at = i < 0 ? rings.length : i; rings.splice(at, 0, [z, before], [z, after]); } };
  edge(-0.13, 1, 2); edge(0.1, 2, 1);
  const ringAt = (z, r, m, tw = 0) => { const s = []; for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2; s.push(push(Math.cos(th) * r, Math.sin(th) * r, z, m, i / N)); } return s; };
  const prev = [];
  const bridge = (r0, r1) => { for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(r0[i], r0[j], r1[j], r0[i], r1[j], r1[i]); } };
  const fan = (ring, cz, cr, m) => { const c = push(0, 0, cz, m, 0); for (let i = 0; i < N; i++) idx.push(c, ring[(i + 1) % N], ring[i]); };
  let last = null, first = null;
  rings.forEach(([z, m], k) => { const r = ringAt(z, rad(z), m); if (last) bridge(last, r); else first = r; last = r; });
  const tooth = (k, sign, z0, r0) => {      // a ring of torn fibres out beyond the last ring (sign +1: toward +z)
    const tear = [], pale = [];
    for (let i = 0; i < N; i++) {
      const th = i / N * Math.PI * 2, h = TEETH[(i + k) % N] * (0.8 + 0.5 * R()), sh = 1 - 0.7 * Math.min(1, h / 0.28);
      tear.push(push(Math.cos(th) * r0 * sh, Math.sin(th) * r0 * sh, z0 + sign * (h + 0.02), 0, i / N));
    }
    return tear;
  };
  // the fore end
  if (jagB) {
    const rb = rad(b), t = tooth(1, 1, b, rb); bridge(last, t);
    const core = push(0, 0, b - 0.03, 0, 0); for (let i = 0; i < N; i++) idx.push(core, t[i], t[(i + 1) % N]);
    // a few long torn fibres standing out of the break
    for (let f = 0; f < 4; f++) {
      const th = R() * 6.28, rr = rb * (0.2 + 0.5 * R()), L = 0.14 + 0.2 * R(), w = 0.007 + 0.006 * R(), lean = 0.4 + 0.6 * R();
      const cx = Math.cos(th) * rr, cy = Math.sin(th) * rr, z0 = b - 0.05;
      const p0 = push(cx - w, cy, z0, 0, 0), p1 = push(cx + w, cy, z0, 0, 0), p2 = push(cx, cy + w, z0, 0, 0), ap = push(cx + Math.cos(th) * lean * 0.05, cy + Math.sin(th) * lean * 0.05, b + L, 0, 0);
      idx.push(p0, p1, ap, p1, p2, ap, p2, p0, ap);
    }
  } else if (crown) {
    let cl = null; for (const [r, z] of CORONEL) { const c = ringAt(z, Math.max(r, 0.002), -1); if (cl) bridge(cl, c); cl = c; }
    for (let p = 0; p < 3; p++) {      // the three prongs
      const th = p * 2.094 + 0.5, cx = Math.cos(th) * 0.03, cy = Math.sin(th) * 0.03, w = 0.01;
      const p0 = push(cx - w, cy, 2.79, -1, 0), p1 = push(cx + w, cy, 2.79, -1, 0), p2 = push(cx, cy + w, 2.79, -1, 0), ap = push(cx * 1.15, cy * 1.15, 2.9, -1, 0);
      idx.push(p0, p1, ap, p1, p2, ap, p2, p0, ap);
    }
  } else { fan(last, b + 0.02, 0, 1); }
  // the rear end
  if (jagA) {
    const ra = rad(a), t = tooth(3, -1, a, ra); bridge(first, t);
    const core = push(0, 0, a + 0.03, 0, 0); for (let i = 0; i < N; i++) idx.push(core, t[(i + 1) % N], t[i]);
  } else {      // a steel butt cap
    const c0 = ringAt(a - 0.01, rad(a), -1), c1 = ringAt(a - 0.035, rad(a) * 0.55, -1); bridge(c0, c1); fan(c1, a - 0.04, 0, -1);
    const i0 = first; bridge(c0, i0);
  }
  // the vamplate
  if (vamp) { let vl = null; for (const [r, z] of VAMP) { if (z < a || z > b) continue; const c = ringAt(z, r, -1); if (vl) bridge(vl, c); vl = c; } }
  const g = new THREE.BufferGeometry();
  const shift = mid ? -(a + b) / 2 : 0;
  for (let i = 2; i < pos.length; i += 3) pos[i] += shift;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aMask', new THREE.Float32BufferAttribute(msk, 1)); g.setAttribute('aSt', new THREE.Float32BufferAttribute(st, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** The butt piece a rider is left holding: grip, vamplate, a torn break at 1 m. Along +y with the grip at the origin (as carried), or along +z about its middle (lying). */
const _c = {};
export function stumpGeo(lying) {
  const k = lying ? 'l' : 'h';
  if (!_c[k]) { const g = lancePiece({ a: -0.4, b: 1.0, jagB: true, vamp: true, seed: 7, mid: !!lying }); if (!lying) g.rotateX(-Math.PI / 2); _c[k] = g; }
  return _c[k];
}

const matCache = new Map();
/** The lance's paint on a Lambert material: spiral of c1 and c2, steel, leather and pale wood chosen by aMask. */
export function lanceBitMat(c1, c2) {
  const key = c1 + '|' + c2; let m = matCache.get(key); if (m) return m;
  const a = new THREE.Color(c1), b = new THREE.Color(c2); m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.p1 = { value: a }; sh.uniforms.p2 = { value: b };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMask; attribute vec2 aSt; varying float vMask; varying vec2 vSt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vSt = aSt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 p1; uniform vec3 p2; varying float vMask; varying vec2 vSt;').replace('#include <color_fragment>', `#include <color_fragment>
      float band = step(fract(vSt.y / 0.24 - vSt.x * 1.5), 0.5);
      vec3 paint = mix(p1, p2, band), wood = vec3(0.80, 0.66, 0.44), steel = vec3(0.45, 0.47, 0.52), leather = vec3(0.24, 0.15, 0.09);
      vec3 c = mix(wood, paint, clamp(vMask, 0.0, 1.0)); c = mix(c, leather, clamp(vMask - 1.0, 0.0, 1.0)); c = mix(c, steel, clamp(-vMask, 0.0, 1.0));
      diffuseColor.rgb = c;`);
  };
  matCache.set(key, m); return m;
}

const pc = new Map();
/** lancePiece() cached by its options (the pieces of a lance on the sand are the same every course). */
export function cachedPiece(o) { const k = JSON.stringify(o); let g = pc.get(k); if (!g) pc.set(k, g = lancePiece(o)); return g; }
