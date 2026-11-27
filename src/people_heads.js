// people_heads.js - the knight's head, for when the helm is off: one modelled head (a 40 x 33 grid, src/people_geo.js 'knight_head') bent into
// a handful of faces by blending shapes (sex, build, and a few characters), with hair and beards grown off its own surface, a painted face
// (assets/people/faces.webp: eight faces, skin = the first tint, brows = the second) and the skin and hair colours as tints.
// Everything is built here on demand; nothing but the 16 KB face sheet is downloaded for it.
import * as THREE from 'three';
import { PEOPLE_GEO } from './people_geo.js';
import { b64, tintPatch, atlasTexture, patchUV, LAYOUT } from './people.js';

export const SKINS = [{ name: 'Fair', hex: '#efcdae' }, { name: 'Light', hex: '#e0b38c' }, { name: 'Olive', hex: '#c79163' }, { name: 'Tan', hex: '#a6714a' }, { name: 'Brown', hex: '#7c5236' }, { name: 'Dark', hex: '#553828' }];
export const HAIRS = [{ name: 'Flaxen', hex: '#c7a25a' }, { name: 'Brown', hex: '#6e4a28' }, { name: 'Dark', hex: '#3a2a1c' }, { name: 'Black', hex: '#1c1815' }, { name: 'Red', hex: '#8c3c1c' }, { name: 'Grey', hex: '#9a958c' }, { name: 'White', hex: '#d6d2c8' }];
/** The faces: which painted face, which shapes (weights of the blend shapes), which hair and beard. */
export const FACES = [
  { id: 'squire', sex: 'm', name: 'The Squire', tex: 0, shape: { fine: 0.7 }, hair: 'bowl', beard: null },
  { id: 'captain', sex: 'm', name: 'The Captain', tex: 1, shape: { strong: 0.7 }, hair: 'crop', beard: 'short' },
  { id: 'veteran', sex: 'm', name: 'The Veteran', tex: 2, shape: { old: 1, strong: 0.35 }, hair: 'crop', beard: 'full' },
  { id: 'courtier', sex: 'm', name: 'The Courtier', tex: 3, shape: { fine: 0.35, hook: 0.5 }, hair: 'page', beard: 'tache' },
  { id: 'hawk', sex: 'm', name: 'The Hawk', tex: 4, shape: { hook: 1, strong: 0.3 }, hair: 'long', beard: 'goatee' },
  { id: 'penitent', sex: 'm', name: 'The Penitent', tex: 5, shape: { strong: 0.45, old: 0.4 }, hair: 'ring', beard: 'stubble' },
  { id: 'maid', sex: 'f', name: 'The Maid', tex: 6, shape: { fine: 0.3 }, hair: 'loose', beard: null },
  { id: 'lady', sex: 'f', name: 'The Lady', tex: 7, shape: {}, hair: 'templers', beard: null },
  { id: 'dame', sex: 'f', name: 'The Dame', tex: 8, shape: { old: 0.55, strong: 0.2 }, hair: 'coronet', beard: null },
  { id: 'shieldmaid', sex: 'f', name: 'The Shieldmaid', tex: 9, shape: { strong: 0.3 }, hair: 'page', beard: null },
];

const D = PEOPLE_GEO.knight_head, [ROWS, COLS] = D.grid, NV = ROWS * COLS;
let base = null, uv0 = null, index = null, shapes = null, hairs = null, faceTex = null;
function unpack() {
  if (base) return;
  const p = b64.i16(D.p), u = b64.u16(D.uv); base = new Float32Array(D.n * 3); uv0 = new Float32Array(D.n * 2);
  for (let i = 0; i < D.n * 3; i++) base[i] = p[i] / 32767 * D.s;
  for (let i = 0; i < D.n * 2; i++) uv0[i] = u[i] / 65535 * D.uvs;
  index = b64.u16(D.i); shapes = {}; hairs = {};
  for (const k in D.shapes) { const d = b64.i8(D.shapes[k].d), a = new Float32Array(NV * 3); for (let i = 0; i < NV * 3; i++) a[i] = d[i] / 127 * D.shapes[k].s; shapes[k] = a; }
  for (const k in D.hair) { const t = b64.u8(D.hair[k].t), dr = b64.u8(D.hair[k].dr), a = new Float32Array(NV), b = new Float32Array(NV); for (let i = 0; i < NV; i++) { a[i] = t[i] / 255 * 0.05; b[i] = dr[i] / 255 * 0.05; } hairs[k] = { t: a, dr: b }; }
}
function faces() {
  if (faceTex) return faceTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 2; const g = cv.getContext('2d'); g.fillStyle = 'rgb(186,186,186)'; g.fillRect(0, 0, 2, 2);
  const t = faceTex = new THREE.Texture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  const im = new Image(); im.onload = () => { t.dispose(); t.image = im; t.needsUpdate = true; }; im.src = new URL('../assets/people/faces.webp', import.meta.url).href;
  return t;
}
/** Smooth normals for a grid whose first and last columns are the same seam. */
function gridNormals(g, rows, cols) {
  g.computeVertexNormals(); const n = g.attributes.normal;
  for (let r = 0; r < rows; r++) { const a = r * cols, b = r * cols + cols - 1, x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  if (g.attributes.position.count > rows * cols) for (let i = rows * cols; i < n.count; i++) n.setXYZ(i, 0, 1, 0);      // the crown's tips
}
const geoCache = new Map(), matCache = new Map();
/** The head's shape for a face, sex and build: { head, hair, beard } geometries (hair / beard may be null). */
function headGeos(face, sex, build) {
  const key = face.id + sex + build; if (geoCache.has(key)) return geoCache.get(key);
  unpack();
  const P = base.slice(), W = Object.assign({}, face.shape); if (sex === 'f') W.female = 1; if (build === 'heavy') W.heavy = 0.9; else if (build === 'skinny') W.skinny = 1;
  for (const k in W) { const d = shapes[k], w = W[k]; if (d) for (let i = 0; i < NV * 3; i++) P[i] += d[i] * w; }
  const U = new Float32Array(D.n * 2), tx = face.tex % 4, ty = face.tex >> 2;
  for (let i = 0; i < D.n; i++) { U[i * 2] = (tx + uv0[i * 2]) / 4; U[i * 2 + 1] = 1 - (ty + uv0[i * 2 + 1]) / 3; }      // (the sheet: 4 x 3 faces)
  const head = new THREE.BufferGeometry(); head.setAttribute('position', new THREE.BufferAttribute(P, 3)); head.setAttribute('uv', new THREE.BufferAttribute(U, 2)); head.setIndex(new THREE.BufferAttribute(index, 1));
  gridNormals(head, ROWS, COLS);
  head.setAttribute('aFat', new THREE.BufferAttribute(new Float32Array(D.n * 3), 3)); head.setAttribute('aSh', new THREE.BufferAttribute(new Float32Array(D.n).fill(1), 1));
  const N = head.attributes.normal.array, hp = patchUV('hair'), cw = LAYOUT.SMALL / LAYOUT.W, ch = LAYOUT.SMALL / LAYOUT.H;
  /** A shell grown off the head: the quads whose four corners all carry some of it. */
  const grow = (style, lift, taper) => {
    const h = hairs[style]; if (!h || style === 'stubble') return null;      // (stubble is only painted)
    const map = new Int32Array(NV).fill(-1), pos = [], uv = [], idx = [];
    // where the hair ends on the brow, the temples and the cheeks it lies down onto the skin (the painted hair carries on under it), so the edge of the
    // shell does not show its grid; the cut ends of long hair, the rim of the bowl cut and the tip of a beard stay thick
    const edgeAt = (i) => { const r = Math.floor(i / COLS), c = i % COLS; return !(h.t[i - 1] > 0 || c === 0) || !(h.t[i + 1] > 0 || c === COLS - 1) || (r > 0 && !(h.t[i - COLS] > 0)) || (r < ROWS - 1 && !(h.t[i + COLS] > 0)); };
    const thin = (i) => { const y = base[i * 3 + 1]; return edgeAt(i) && (taper === 'beard' ? y > -0.1 : style !== 'bowl' && y > 0.012); };
    const vert = (i) => { if (map[i] < 0) { map[i] = pos.length / 3; const t = (thin(i) ? 0.0006 : h.t[i]) + lift; pos.push(P[i * 3] + N[i * 3] * t, P[i * 3 + 1] + N[i * 3 + 1] * t * 0.9 - h.dr[i], P[i * 3 + 2] + N[i * 3 + 2] * t - h.dr[i] * 0.12);
      uv.push(hp[0] + (0.04 + 0.92 * ((i % COLS) / (COLS - 1) * 3 % 1)) * cw, hp[1] - (0.04 + 0.92 * (1 - Math.floor(i / COLS) / (ROWS - 1))) * ch); } return map[i]; };
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1; if (!(h.t[a] > 0 && h.t[b] > 0 && h.t[d] > 0 && h.t[e] > 0)) continue;
      const A = vert(a), B = vert(b), Dd = vert(d), E = vert(e); idx.push(A, B, E, A, E, Dd);
    }
    if (!idx.length) return null;
    // the crown: close it where the top row is covered
    if (h.t[(ROWS - 1) * COLS + 1] > 0) { const top = pos.length / 3; pos.push(0, P[(D.n - 1) * 3 + 1] + h.t[(ROWS - 1) * COLS + 1] + lift, 0); uv.push(hp[0] + 0.5 * cw, hp[1] - 0.04 * ch); for (let c = 0; c < COLS - 1; c++) idx.push(vert((ROWS - 1) * COLS + c), vert((ROWS - 1) * COLS + c + 1), top); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); g.setIndex(idx);
    // the head's own winding may be either way round: make the shell look outward
    g.computeVertexNormals(); const nn = g.attributes.normal; let out = 0; for (let i = 0; i < nn.count; i++) out += nn.getX(i) * pos[i * 3] + nn.getZ(i) * pos[i * 3 + 2];
    if (out < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); }
    // seam: the first and last columns
    const n2 = g.attributes.normal; for (let r = 0; r < ROWS; r++) { const a = map[r * COLS], b = map[r * COLS + COLS - 1]; if (a >= 0 && b >= 0) { const x = n2.getX(a) + n2.getX(b), y = n2.getY(a) + n2.getY(b), z = n2.getZ(a) + n2.getZ(b), l = Math.hypot(x, y, z) || 1; n2.setXYZ(a, x / l, y / l, z / l); n2.setXYZ(b, x / l, y / l, z / l); } }
    g.setAttribute('aFat', new THREE.BufferAttribute(new Float32Array(pos.length), 3)); g.setAttribute('aSh', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
    return g;
  };
  const out = { head, hair: grow(face.hair, 0.0015), beard: face.beard ? grow(face.beard, 0.001, 'beard') : null };
  geoCache.set(key, out); return out;
}
function mats(skin, hair) {
  const key = skin + '|' + hair; if (matCache.has(key)) return matCache.get(key);
  const c2 = new THREE.Color(hair);
  const face = tintPatch(new THREE.MeshStandardMaterial({ map: faces(), color: skin, roughness: 0.78, envMapIntensity: 0.5 })); face.userData.uCol2.value.set(c2.r, c2.g, c2.b, 1); face.userData.uPar.value.set(0, 0, 0, 0);
  const hm = tintPatch(new THREE.MeshStandardMaterial({ map: atlasTexture(), color: hair, roughness: 0.7, envMapIntensity: 0.5, side: THREE.DoubleSide })); hm.userData.uCol2.value.set(c2.r, c2.g, c2.b, 1); hm.userData.uPar.value.set(0, 0, 0, 0);
  const o = { face, hair: hm }; matCache.set(key, o); return o;
}
/**
 * A head for `body` (src/body_types.js): a Group in metres, the middle of the skull at its origin, looking down +z, y up.
 * Children: 'head', and 'hair' / 'beard' if the face has them.
 */
export const makeHead = (body) => headFor(body.face, body.sex, body.build, SKINS[body.skin].hex, HAIRS[body.hair].hex);
/** The same head from plain values (the jointed figures of src/people.js use it): face index, sex, build, skin and hair as colours; hatted = he wears a hat (the hair on top of the head is left off, it would come through). */
export function headFor(faceI, sex, build, skinHex, hairHex, hatted = false) {
  const face = FACES[faceI] || FACES[0], G = headGeos(face, sex, build), M = mats(skinHex, hairHex), g = new THREE.Group(); g.name = 'KnightHead';
  const add = (geo, mat, name) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = name === 'head'; m.receiveShadow = true; m.frustumCulled = false; g.add(m); };
  add(G.head, M.face, 'head'); if (!hatted || face.hair === 'page' || face.hair === 'long') add(G.hair, M.hair, 'hair'); add(G.beard, M.hair, 'beard');
  return g;
}
