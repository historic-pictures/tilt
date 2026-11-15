// flora.js - procedural trees, grass, wildflowers and set-dressing props for the jousting game.
// Everything is generated at runtime (geometry + canvas textures). No external assets.
import * as THREE from 'three';
import { SCANS, buildCards, scanVariants, scatter } from './scans.js';

/* ------------------------------------------------------------------ utils */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const sm = (t) => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx), fy),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx), fy),
    fz);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ----------------------------------------------- shader patching (wind etc) */
function patchMaterial(mat, key, timeU, { mask = false, wind = '', upNormal = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', '#include <common>\nuniform float uTime;\n' + (mask ? 'attribute float aMask;\n' : ''));
    if (mask) {
      vs = vs.replace('#include <color_vertex>',
        '#include <color_vertex>\n#if defined(USE_INSTANCING_COLOR) && defined(USE_COLOR)\n' +
        'vColor.xyz = mix(vColor.xyz, vColor.xyz / max(instanceColor.xyz, vec3(0.02)), aMask);\n#endif');
    }
    if (wind) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n' + wind + '\n#endif');
    shader.vertexShader = vs;
    if (upNormal) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    }
  };
  mat.customProgramCacheKey = () => 'flora_' + key;
}

/* ------------------------------------------------------------ canopy build */
const icoCache = {};
function icoWelded(detail) {
  if (icoCache[detail]) return icoCache[detail];
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
    let id = map.get(k);
    if (id === undefined) { id = verts.length / 3; verts.push(x, y, z); map.set(k, id); }
    idx.push(id);
  }
  g.dispose();
  return (icoCache[detail] = { verts: Float32Array.from(verts), idx });
}

function makeBlob(b, detail, amp, off) {
  const ico = icoWelded(detail);
  const n = ico.verts.length / 3;
  const pos = new Float32Array(n * 3);
  const [cx, cy, cz] = b.c, [rx, ry, rz] = b.r;
  for (let i = 0; i < n; i++) {
    const ux = ico.verts[i * 3], uy = ico.verts[i * 3 + 1], uz = ico.verts[i * 3 + 2];
    const nz = noise3(ux * 1.6 + off, uy * 1.6 + off * 0.7, uz * 1.6 + off * 1.3) * 0.65 +
      noise3(ux * 3.4 + off, uy * 3.4, uz * 3.4 - off) * 0.35;
    const d = 1 + amp * (nz - 0.5) * 2;
    pos[i * 3] = cx + ux * rx * d;
    pos[i * 3 + 1] = cy + uy * ry * d;
    pos[i * 3 + 2] = cz + uz * rz * d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(ico.idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array.slice();
  for (let i = 0; i < n; i++) { // blend towards radial for soft, round shading
    let x = nrm[i * 3] + 0.6 * ico.verts[i * 3], y = nrm[i * 3 + 1] + 0.6 * ico.verts[i * 3 + 1], z = nrm[i * 3 + 2] + 0.6 * ico.verts[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  g.dispose();
  return { pos, nrm, idx: ico.idx, c: b.c, r: b.r, n };
}

function makeTrunk(t, sides = 6, rings = 5) {
  const pos = [], col = [], idx = [];
  const bark = new THREE.Color();
  for (let r = 0; r < rings; r++) {
    const f = r / (rings - 1);
    const rad = lerp(t.r0, t.r1, f) * (1 + 0.55 * Math.pow(1 - f, 5));
    const cx = t.bx * f * f, cz = t.bz * f * f, cy = t.h * f;
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + f * 0.4;
      const wob = 1 + 0.12 * Math.sin(s * 2.7 + r);
      pos.push(cx + Math.cos(a) * rad * wob, cy, cz + Math.sin(a) * rad * wob);
      const k = 0.7 + 0.3 * f + 0.12 * Math.sin(s * 1.9 + r * 0.7);
      bark.setRGB(0.15 * k, 0.095 * k, 0.06 * k);
      if (f < 0.12) bark.lerp(new THREE.Color(0.05, 0.08, 0.03), 0.3); // mossy base
      col.push(bark.r, bark.g, bark.b);
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < sides; s++) {
    const a = r * sides + s, b = r * sides + (s + 1) % sides, c = a + sides, d = b + sides;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = { pos: g.attributes.position.array, nrm: g.attributes.normal.array, col, idx: idx.slice(), n: pos.length / 3 };
  g.dispose();
  return out;
}

function buildCanopyGeometry(spec, sunDir, seedOff) {
  const blobs = spec.blobs.map((b, i) => makeBlob(b, spec.detail, spec.amp, seedOff + i * 17.37));
  let minY = Infinity, maxY = -Infinity, cx = 0, cy = 0, cz = 0, R = 0;
  for (const b of blobs) {
    minY = Math.min(minY, b.c[1] - b.r[1]); maxY = Math.max(maxY, b.c[1] + b.r[1]);
    cx += b.c[0]; cy += b.c[1]; cz += b.c[2];
  }
  cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
  for (const b of blobs) R = Math.max(R, Math.hypot(b.c[0] - cx, b.c[2] - cz) + Math.max(b.r[0], b.r[2]), Math.abs(b.c[1] - cy) + b.r[1]);

  const P = [], N = [], C = [], M = [], I = [];
  let base = 0;
  const dark = new THREE.Color(0.32, 0.46, 0.42), light = new THREE.Color(1.0, 1.0, 0.7), col = new THREE.Color();
  for (const b of blobs) {
    for (let i = 0; i < b.n; i++) {
      const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
      const nx = b.nrm[i * 3], ny = b.nrm[i * 3 + 1], nz = b.nrm[i * 3 + 2];
      let occ = 0;
      for (const o of blobs) {
        if (o === b) continue;
        const d = Math.hypot((x - o.c[0]) / o.r[0], (y - o.c[1]) / o.r[1], (z - o.c[2]) / o.r[2]);
        if (d < 1) occ += 1 - d;
      }
      occ = Math.min(1, occ * 1.3);
      const h = clamp((y - minY) / (maxY - minY), 0, 1);
      const outward = clamp(Math.hypot((x - cx) / R, (y - cy) / (R * 0.9), (z - cz) / R), 0, 1);
      const sun = Math.max(0, nx * sunDir.x + ny * sunDir.y + nz * sunDir.z);
      const speckle = (noise3(x * 3.1, y * 3.1, z * 3.1) - 0.5) * 0.22;
      let k = 0.12 + 0.5 * h + 0.22 * sun + 0.14 * outward - 0.5 * occ + speckle + Math.max(0, ny) * 0.1;
      k = clamp(k, 0, 1);
      col.copy(dark).lerp(light, k);
      // translucency: sunlit upper leaves get a warm yellow bias
      const tr = sun * h * 0.25;
      col.r += tr * 0.25; col.g += tr * 0.12; col.b -= tr * 0.1;
      P.push(x, y, z); N.push(nx, ny, nz); C.push(col.r, col.g, clamp(col.b, 0, 1)); M.push(0);
    }
    for (let i = 0; i < b.idx.length; i++) I.push(b.idx[i] + base);
    base += b.n;
  }
  if (spec.trunk) {
    const t = makeTrunk(spec.trunk);
    for (let i = 0; i < t.n; i++) {
      P.push(t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2]);
      N.push(t.nrm[i * 3], t.nrm[i * 3 + 1], t.nrm[i * 3 + 2]);
      C.push(t.col[i * 3], t.col[i * 3 + 1], t.col[i * 3 + 2]); M.push(1);
    }
    for (let i = 0; i < t.idx.length; i++) I.push(t.idx[i] + base);
    base += t.n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(M, 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

function treeSpecs(rng) {
  const j = (v, a) => v + (rng() - 0.5) * a;
  // oak: wide, 6 blobs
  const oak = { detail: 2, amp: 0.3, trunk: { h: 4.0, r0: 0.34, r1: 0.15, bx: 0.5, bz: -0.3 }, blobs: [] };
  oak.blobs.push({ c: [0.2, 5.0, 0], r: [2.7, 2.1, 2.7] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng() * 0.8;
    oak.blobs.push({ c: [Math.cos(a) * 2.4, j(4.2, 0.8), Math.sin(a) * 2.4], r: [j(1.9, 0.4), j(1.5, 0.3), j(1.9, 0.4)] });
  }
  oak.blobs.push({ c: [j(0, 1), 6.3, j(0, 1)], r: [1.9, 1.5, 1.9] });
  // elm: tall vase, 5 blobs
  const elm = { detail: 2, amp: 0.28, trunk: { h: 4.6, r0: 0.28, r1: 0.12, bx: -0.3, bz: 0.4 }, blobs: [] };
  elm.blobs.push({ c: [0, 6.0, 0], r: [1.7, 1.5, 1.7] });
  elm.blobs.push({ c: [j(0.8, 0.4), 7.6, j(0.5, 0.4)], r: [1.6, 1.7, 1.6] });
  elm.blobs.push({ c: [j(-0.9, 0.4), 8.8, j(-0.3, 0.5)], r: [1.4, 1.6, 1.4] });
  elm.blobs.push({ c: [1.2, 5.5, -0.9], r: [1.3, 1.1, 1.3] });
  elm.blobs.push({ c: [-1.2, 5.8, 1], r: [1.3, 1.1, 1.3] });
  // round bushy: 4 blobs
  const bush = { detail: 2, amp: 0.32, trunk: { h: 1.6, r0: 0.22, r1: 0.12, bx: 0.15, bz: 0.1 }, blobs: [
    { c: [0, 2.8, 0], r: [2.0, 1.8, 2.0] },
    { c: [1.1, 2.3, 0.6], r: [1.4, 1.2, 1.4] },
    { c: [-1.0, 2.4, -0.7], r: [1.4, 1.2, 1.4] },
    { c: [0.2, 3.8, -0.2], r: [1.3, 1.1, 1.3] },
  ] };
  return [oak, elm, bush];
}

/* ------------------------------------------------------------- placement */
function treeOK(x, z, minR) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (Math.hypot(x, z) < minR) return false;
  if (ax < 16 && az < 60) return false;                      // lists + verge
  if (ax > 11 && ax < 25 && az < 38) return false;           // stands
  if (ax < 34 && az > 58 && az < 84) return false;           // tents (end)
  if (ax > 30 && ax < 46 && az < 59) return false;           // tents (sides)
  if (x > -70 && x < 110 && z > 140 && z < 310) return false; // castle
  if (ax < 17 && z > 52 && z < 150) return false;           // road
  return true;
}
function gauss(rng) {
  return Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(rng() * Math.PI * 2);
}
function grassOK(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax < 9.7 && az < 51.5) return false;       // sand
  if (ax > 12 && ax < 23.5 && az < 36.5) return false; // stands
  return true;
}
function distToLists(x, z) {
  return Math.hypot(Math.max(Math.abs(x) - 9.5, 0), Math.max(Math.abs(z) - 51, 0));
}

function fillInstanced(geo, mat, items, name) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  mesh.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.yaw || 0);
    p.set(it.x, it.y || 0, it.z);
    s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.sx ?? it.s ?? 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/* --------------------------------------------------------------- textures */
function grassTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = mulberry32(77);
    for (let i = 0; i < 11; i++) {
      const x0 = 8 + (i / 10) * (w - 16) + (r() - 0.5) * 8;
      const tipY = h * (0.04 + r() * 0.4);
      const lean = (r() - 0.5) * 36;
      const bw = 5 + r() * 5;
      const v = Math.floor(150 + r() * 105);
      const grad = g.createLinearGradient(0, h, 0, tipY);
      grad.addColorStop(0, `rgb(${v * 0.6 | 0},${v * 0.7 | 0},${v * 0.5 | 0})`);
      grad.addColorStop(1, `rgb(${v},${v},${v * 0.9 | 0})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0 - bw, h);
      g.quadraticCurveTo(x0 - bw * 0.4 + lean * 0.3, h * 0.5, x0 + lean, tipY);
      g.quadraticCurveTo(x0 + bw * 0.4 + lean * 0.3, h * 0.5, x0 + bw, h);
      g.closePath();
      g.fill();
    }
  });
}
function hayTexture() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#d3b455'; g.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 700; i++) {
      const l = 150 + r() * 90;
      g.strokeStyle = `rgba(${l | 0},${(l * 0.82) | 0},${(l * 0.38) | 0},0.6)`;
      g.lineWidth = 1;
      const x = r() * w, y = r() * h, a = (r() - 0.5) * 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
    }
    g.fillStyle = '#5a4a28';
    g.fillRect(w * 0.28, 0, 3, h); g.fillRect(w * 0.7, 0, 3, h);
  });
}
function barrelTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(9);
    for (let i = 0; i < 10; i++) {
      const l = 90 + r() * 40;
      g.fillStyle = `rgb(${l | 0},${(l * 0.62) | 0},${(l * 0.34) | 0})`;
      g.fillRect(i * w / 10, 0, w / 10, h);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * w / 10, 0, 2, h);
    }
    g.fillStyle = '#35302c';
    for (const f of [0.14, 0.3, 0.7, 0.86]) g.fillRect(0, h * f - 3, w, 6);
  });
}
function crateTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(13);
    for (let i = 0; i < 5; i++) {
      const l = 110 + r() * 40;
      g.fillStyle = `rgb(${l | 0},${(l * 0.7) | 0},${(l * 0.42) | 0})`;
      g.fillRect(0, i * h / 5, w, h / 5);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, i * h / 5, w, 2);
    }
    g.fillStyle = 'rgba(60,40,22,0.9)';
    g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillRect(-w * 0.7, -5, w * 1.4, 10); g.restore();
  });
}

/* ----------------------------------------------------------------- geometry */
function grassGeometry() {
  const P = [], U = [], C = [], N = [], I = [];
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const b = P.length / 3;
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      const tx = x * (y > 0.5 ? 0.85 : 1);
      P.push(tx * ca, y, tx * sa);
      U.push(x + 0.5, y);
      if (y < 0.5) C.push(0.3, 0.33, 0.24); else C.push(1.0, 1.0, 0.82);
      N.push(0, 1, 0);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}
function flowerGeometry() {
  const P = [], C = [], M = [], N = [], I = [];
  const H = 0.22;
  for (let q = 0; q < 2; q++) { // stem: 2 crossed thin quads
    const a = q * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), b = P.length / 3, w = 0.007;
    P.push(-w * ca, 0, -w * sa, w * ca, 0, w * sa, w * ca, H, w * sa, -w * ca, H, -w * sa);
    for (let i = 0; i < 4; i++) { C.push(0.12, 0.28, 0.07); M.push(1); N.push(0, 1, 0); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const b = P.length / 3; // head: 5-triangle disc
  P.push(0, H + 0.012, 0); C.push(0.75, 0.75, 0.6); M.push(0); N.push(0, 1, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.push(Math.cos(a) * 0.05, H + 0.02 * Math.cos(a + 1) * 0.0 + 0.004, Math.sin(a) * 0.05);
    C.push(1, 1, 1); M.push(0); N.push(0, 1, 0);
  }
  for (let i = 0; i < 5; i++) I.push(b, b + 1 + i, b + 1 + (i + 1) % 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(M, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

/* ============================================================== main API */
export function buildFlora(group, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = mulberry32((seed * 2654435761) >>> 0 || 1);
  const sunDir = (opts.sunDir ? opts.sunDir.clone() : new THREE.Vector3(0.5, 0.7, 0.5)).normalize();
  const grassColor = new THREE.Color(opts.grassColor || '#5b7a36');
  const timeU = { value: 0 };
  const stats = { triangles: 0, instances: 0, drawCalls: 0 };
  const track = (mesh, triPer) => {
    stats.triangles += triPer * mesh.count; stats.instances += mesh.count; stats.drawCalls++;
    group.add(mesh);
  };
  const triOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

  /* ---- 1. trees ---- */
  const specs = treeSpecs(mulberry32(seed + 101));
  const treeGeos = specs.map((s, i) => buildCanopyGeometry(s, sunDir, seed * 3.1 + i * 41.7));
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.2 });
  patchMaterial(treeMat, 'tree', timeU, {
    mask: true,
    wind: 'vec3 wp = instanceMatrix[3].xyz; float ph = wp.x * 0.05 + wp.z * 0.04;\n' +
      'float hh = max(position.y - 2.0, 0.0);\n' +
      'transformed.x += (sin(uTime * 0.7 + ph) + 0.4 * sin(uTime * 1.9 + ph * 2.0)) * 0.03 * hh;\n' +
      'transformed.z += cos(uTime * 0.6 + ph * 1.3) * 0.022 * hh;',
  });

  const treePts = [];
  const clumps = [];
  for (let i = 0; i < 28; i++) {
    for (let t = 0; t < 50; t++) {
      const a = rng() * Math.PI * 2, r = 85 + Math.sqrt(rng()) * 300;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (treeOK(x, z, 70)) { clumps.push({ x, z, s: 6 + rng() * 10 }); break; }
    }
  }
  const TREES = 380;
  for (let att = 0; treePts.length < TREES && att < 40000; att++) {
    const mode = rng();
    let x, z;
    if (mode < 0.3) { // tree line
      const a = rng() * Math.PI * 2, r = 138 + gauss(rng) * 14;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } else if (mode < 0.82 && clumps.length) {
      const c = clumps[(rng() * clumps.length) | 0];
      x = c.x + gauss(rng) * c.s; z = c.z + gauss(rng) * c.s;
    } else {
      const a = rng() * Math.PI * 2, r = Math.sqrt(lerp(70 * 70, 400 * 400, rng()));
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    const rr = Math.hypot(x, z);
    if (rr < 70 || rr > 410 || !treeOK(x, z, 70)) continue;
    let ok = true;
    for (let k = 0; k < treePts.length; k++) {
      const dx = treePts[k].x - x, dz = treePts[k].z - z;
      if (dx * dx + dz * dz < 20) { ok = false; break; }
    }
    if (ok) treePts.push({ x, z });
  }
  const byVar = [[], [], []];
  const tc = new THREE.Color();
  for (const p of treePts) {
    const vr = rng();
    const v = vr < 0.4 ? 0 : vr < 0.7 ? 1 : 2;
    const s = 0.8 + 0.9 * Math.pow(rng(), 1.3);
    const aut = rng() < 0.08;
    const hue = aut ? 0.06 + rng() * 0.07 : 0.2 + rng() * 0.14;
    tc.setHSL(hue, aut ? 0.55 + rng() * 0.2 : 0.4 + rng() * 0.25, aut ? 0.46 + rng() * 0.1 : 0.42 + rng() * 0.14);
    byVar[v].push({ x: p.x, z: p.z, yaw: rng() * Math.PI * 2, sx: s * (0.92 + rng() * 0.2), sy: s * (0.9 + rng() * 0.2), sz: s * (0.92 + rng() * 0.2), color: tc.clone() });
  }
  // photo-scanned trees, drawn as cards that show the right side of the tree to the camera
  const SPECIES = [['jacaranda_tree', 0.36, 11, 16], ['island_tree_01', 0.28, 7, 10.5], ['tree_small_02', 0.22, 8, 12], ['island_tree_02', 0.14, 4.5, 7]].filter(sp => SCANS.cards.has(sp[0]));
  const scanned = SPECIES.length > 0 && !!opts.light;
  const cardItems = new Map(SPECIES.map(sp => [sp[0], []]));
  const leafTint = () => {
    const aut = rng() < 0.07, v = 0.82 + rng() * 0.4;
    return aut ? new THREE.Color(1.5 * v, 1.0 * v, 0.55 * v) : new THREE.Color((0.9 + rng() * 0.25) * v, (0.95 + rng() * 0.15) * v, (0.8 + rng() * 0.3) * v);
  };
  const plant = (x, z, kMin = 1, kMax = 1, only = null) => {
    const tot = SPECIES.reduce((a, sp) => a + sp[1], 0); let pick = rng() * tot, sp = SPECIES[0];
    for (const c of SPECIES) { pick -= c[1]; if (pick <= 0) { sp = c; break; } }
    if (only) sp = SPECIES.find(c => c[0] === only) || sp;
    const h = lerp(sp[2], sp[3], rng()) * lerp(kMin, kMax, rng());
    cardItems.get(sp[0]).push({ x, z, s: h / SCANS.cards.get(sp[0]).meta.H, yaw: rng() * Math.PI * 2, color: leafTint() });
  };
  if (scanned) for (const p of treePts) plant(p.x, p.z);
  else byVar.forEach((items, i) => {
    if (!items.length) return;
    const m = fillInstanced(treeGeos[i], treeMat, items, 'flora_trees_' + i);
    m.castShadow = false; m.receiveShadow = false;
    track(m, triOf(treeGeos[i]));
  });

  /* ---- 1b. bushes ---- */
  const bushSpec = { detail: 1, amp: 0.3, trunk: null, blobs: [
    { c: [0, 0.55, 0], r: [1.2, 0.85, 1.2] }, { c: [0.8, 0.4, 0.4], r: [0.8, 0.6, 0.8] } ] };
  const bushGeo = buildCanopyGeometry(bushSpec, sunDir, seed * 1.7 + 500);
  const bushItems = [];
  for (let att = 0; bushItems.length < 120 && att < 20000; att++) {
    const a = rng() * Math.PI * 2, r = 45 + rng() * 65;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!treeOK(x, z, 45)) continue;
    const s = 0.8 + rng() * 1.0;
    const aut = rng() < 0.08;
    tc.setHSL(aut ? 0.08 + rng() * 0.05 : 0.2 + rng() * 0.13, 0.4 + rng() * 0.25, 0.4 + rng() * 0.14);
    bushItems.push({ x, z, yaw: rng() * 6.28, sx: s * 1.2, sy: s * 0.75, sz: s * 1.2, color: tc.clone() });
  }
  if (scanned) {
    const low = SCANS.cards.has('island_tree_02') ? 'island_tree_02' : SPECIES[0][0];
    for (const b of bushItems) plant(b.x, b.z, 0.32, 0.5, low);       // young trees and scrub instead of bushes
    for (const [id, items] of cardItems) { const m = buildCards(group, id, items, opts.light, timeU, 'flora_trees_' + id); if (m) { stats.triangles += 2 * items.length; stats.instances += items.length; stats.drawCalls++; } }
  } else {
    const bushes = fillInstanced(bushGeo, treeMat, bushItems, 'flora_bushes');
    track(bushes, triOf(bushGeo));
  }

  /* ---- 2. grass tufts ---- */
  const gGeo = grassGeometry();
  const gTex = grassTexture();
  const gMat = new THREE.MeshStandardMaterial({
    map: gTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.2,
  });
  patchMaterial(gMat, 'grass', timeU, {
    upNormal: true,
    wind: 'vec3 wp = instanceMatrix[3].xyz; float ph = wp.x * 0.35 + wp.z * 0.27;\n' +
      'float sw = sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 3.1 + ph * 1.7);\n' +
      'float hy = position.y * position.y;\n' +
      'transformed.x += sw * 0.4 * hy; transformed.z += sw * 0.28 * hy;',
  });
  const gPts = [];
  const push = (x, z) => gPts.push({ x, z });
  for (let i = 0; i < 3600; i++) { // verge
    const sx = rng() < 0.5 ? -1 : 1, z = (rng() * 2 - 1) * 51;
    const maxX = Math.abs(z) < 36.5 ? 12.0 : 12.3;
    push(sx * lerp(9.7, maxX, rng()), z);
  }
  for (let i = 0; i < 1800; i++) { // end bands
    const sz = rng() < 0.5 ? -1 : 1;
    push((rng() * 2 - 1) * 12, sz * lerp(51.5, 60, rng()));
  }
  for (let att = 0, n = 0; n < 3600 && att < 60000; att++) { // thinning scatter
    const x = (rng() * 2 - 1) * 52, z = (rng() * 2 - 1) * 92;
    const d = distToLists(x, z);
    if (d > 40 || !grassOK(x, z) || (z > 60 && Math.abs(x) < 10)) continue;
    const pr = Math.pow(1 - d / 40, 1.3) * (0.3 + 0.7 * noise3(x * 0.12, 0, z * 0.12));
    if (rng() > pr) continue;
    push(x, z); n++;
  }
  const gItems = [];
  const gc = new THREE.Color(), hsl = {};
  grassColor.getHSL(hsl);
  for (const p of gPts) {
    if (!grassOK(p.x, p.z)) continue;
    const dry = rng() < 0.12;
    gc.setHSL(hsl.h + (rng() - 0.5) * 0.04 - (dry ? 0.04 : 0), clamp(hsl.s * (0.85 + rng() * 0.3), 0, 1), clamp(hsl.l * (1.05 + rng() * 0.4), 0, 0.8));
    gItems.push({ x: p.x, z: p.z, yaw: rng() * Math.PI * 2, sx: 0.35 * (0.8 + rng() * 0.5), sy: 0.25 + rng() * 0.2, color: gc.clone() });
  }
  const grass = fillInstanced(gGeo, gMat, gItems, 'flora_grass');
  grass.receiveShadow = true; grass.castShadow = false;
  track(grass, triOf(gGeo));

  /* ---- 3. wildflowers ---- */
  const fGeo = flowerGeometry();
  const fMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.2 });
  patchMaterial(fMat, 'flower', timeU, {
    mask: true,
    wind: 'vec3 wp = instanceMatrix[3].xyz; float ph = wp.x * 0.5 + wp.z * 0.4;\n' +
      'float hy = position.y * position.y * 6.0;\n' +
      'transformed.x += sin(uTime * 1.5 + ph) * 0.05 * hy; transformed.z += cos(uTime * 1.2 + ph) * 0.035 * hy;',
  });
  const fColors = ['#f4f2ea', '#f2d21b', '#d8180f', '#3a55d8'];
  const drifts = [];
  for (let att = 0; drifts.length < 30 && att < 2000; att++) {
    const x = (rng() * 2 - 1) * 55, z = (rng() * 2 - 1) * 95;
    const d = distToLists(x, z);
    if (d < 10 || d > 45 || !grassOK(x, z) || (z > 55 && Math.abs(x) < 12)) continue;
    drifts.push({ x, z, s: 1.8 + rng() * 2.5, c: (rng() * 4) | 0, mix: rng() < 0.3 });
  }
  const fItems = [], fc = new THREE.Color();
  for (let att = 0; fItems.length < 700 && att < 20000 && drifts.length; att++) {
    const d = drifts[(rng() * drifts.length) | 0];
    const x = d.x + gauss(rng) * d.s, z = d.z + gauss(rng) * d.s;
    if (!grassOK(x, z) || (z > 55 && Math.abs(x) < 12)) continue;
    fc.set(fColors[d.mix ? (rng() * 4) | 0 : d.c]);
    fc.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
    const s = 0.8 + rng() * 0.9;
    fItems.push({ x, z, yaw: rng() * 6.28, s, color: fc.clone() });
  }
  const flowers = fillInstanced(fGeo, fMat, fItems, 'flora_flowers');
  track(flowers, triOf(fGeo));

  /* ---- 4. props near list ends ---- */
  const used = [];
  const spot = () => {
    for (let t = 0; t < 200; t++) {
      const x = (rng() < 0.5 ? -1 : 1) * (4 + rng() * 5), z = (rng() < 0.5 ? -1 : 1) * (53 + rng() * 5);
      if (used.every((u) => Math.hypot(u[0] - x, u[1] - z) > 1.8)) { used.push([x, z]); return [x, z]; }
    }
    return [6, 55];
  };
  const baleItems = [], barrelItems = [], crateItems = [];
  for (let i = 0; i < 3; i++) {
    const [x, z] = spot(), yaw = rng() * Math.PI;
    baleItems.push({ x, z, y: 0.3, yaw });
    if (i < 2) baleItems.push({ x: x + (rng() - 0.5) * 0.1, z: z + (rng() - 0.5) * 0.1, y: 0.9, yaw: yaw + (rng() - 0.5) * 0.4 });
  }
  for (let i = 0; i < 4; i++) { const [x, z] = spot(); barrelItems.push({ x, z, yaw: rng() * 6.28, s: 0.9 + rng() * 0.2 }); }
  for (let i = 0; i < 3; i++) {
    const [x, z] = spot(), yaw = rng() * 6.28, s = 0.85 + rng() * 0.3;
    crateItems.push({ x, z, y: 0.35 * s, yaw, s });
    if (i === 0) crateItems.push({ x: x + 0.03, z, y: 1.05 * s, yaw: yaw + 0.5, s: s * 0.8 });
  }
  const mk = (geo, tex, items, name) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, envMapIntensity: 0.2 });
    const m = fillInstanced(geo, mat, items, name);
    m.castShadow = true; m.receiveShadow = true;
    track(m, triOf(geo));
  };
  mk(new THREE.BoxGeometry(1.1, 0.6, 0.65), hayTexture(), baleItems, 'flora_hay');
  const prof = [[0, 0], [0.3, 0], [0.34, 0.08], [0.39, 0.3], [0.41, 0.5], [0.39, 0.7], [0.34, 0.92], [0.3, 1.0], [0, 1.0]]
    .map(([r, h]) => new THREE.Vector2(r, h * 0.9));
  // photo-scanned barrels, crates, buckets, rocks and stumps where we have them
  const barrels = [...scanVariants('wooden_barrels_01', { match: 'barrel' }), ...scanVariants('wine_barrel_01', { whole: true })];
  if (barrels.length) barrels.forEach((v, i) => scatter(group, v, barrelItems.filter((_, k) => k % barrels.length === i), { name: 'scan_barrel' }));
  else mk(new THREE.LatheGeometry(prof, 14), barrelTexture(), barrelItems, 'flora_barrels');
  const crate = scanVariants('wooden_crate_02', { whole: true })[0];
  if (crate) scatter(group, crate, crateItems.map((c, i) => ({ x: c.x, z: c.z, yaw: c.yaw, s: 1.1, y: i === 1 ? crate.size.y * 1.1 : 0 })), { name: 'scan_crate' });
  else mk(new THREE.BoxGeometry(0.7, 0.7, 0.7), crateTexture(), crateItems, 'flora_crates');
  const bucket = scanVariants('wooden_bucket_01', { whole: true })[0];
  if (bucket) scatter(group, bucket, barrelItems.map(b => ({ x: b.x + 0.75, z: b.z + 0.3, yaw: b.yaw * 2, s: 1 })).concat(baleItems.filter(b => b.y < 0.5).map(b => ({ x: b.x - 0.9, z: b.z + 0.5, yaw: b.yaw, s: 1 }))), { name: 'scan_bucket' });
  const rocks = scanVariants('rock_moss_set_01');
  if (rocks.length) {
    const per = rocks.map(() => []);
    for (let att = 0, n = 0; n < 26 && att < 4000; att++) {
      const a = rng() * Math.PI * 2, r = 24 + rng() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!treeOK(x, z, 0)) continue;
      per[(rng() * rocks.length) | 0].push({ x, z, y: -0.05, yaw: rng() * 6.28, s: 0.18 + rng() * 0.3 }); n++;
    }
    rocks.forEach((v, i) => scatter(group, v, per[i], { name: 'scan_rock' }));
  }
  const stump = scanVariants('tree_stump_01', { whole: true })[0];
  if (stump) {
    const its = [];
    for (let att = 0; its.length < 6 && att < 2000; att++) {
      const a = rng() * Math.PI * 2, r = 40 + rng() * 45, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (treeOK(x, z, 0)) its.push({ x, z, y: -0.1, yaw: rng() * 6.28, s: 0.7 + rng() * 0.5 });
    }
    scatter(group, stump, its, { name: 'scan_stump' });
  }

  group.userData.floraStats = stats;
  return {
    stats,
    update(t) { timeU.value = t; },
  };
}
