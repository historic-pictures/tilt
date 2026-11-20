// texgen.js - procedural PBR detail textures for a Three.js (r160) jousting game.
//
// Everything is generated at runtime on 2D canvases; no external assets.
// Every kind builds a tileable Float32 height field (plus optional roughness / albedo
// fields), then derives a tangent-space normal map with a wrapping Sobel filter.
//
// Usage:
//   const { normalMap, roughnessMap, map } = makePBR('steel', { repeat: [4, 4] });
//   material.normalMap = normalMap; material.roughnessMap = roughnessMap; material.map = map;
//
// Roughness note: three.js multiplies roughnessMap.g by material.roughness, so the maps
// here are written with values around 0.6-1.0 (the "real" 0.18-0.4 steel range is
// obtained when material.roughness is ~0.3-0.4). Leave material.roughness as is
// (do NOT additionally set it to 1) and the map just adds variation on top of it.
// 'map' textures are near-white multipliers: keep material.color as the base colour.

import * as THREE from 'three';
import { GFX } from './gfx.js';

export const KINDS = ['steel', 'mail', 'cloth', 'velvet', 'leather', 'wood', 'stone', 'sand', 'coat', 'grass'];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Seeded PRNG (mulberry32). */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash -> [0,1). */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9E3779B1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const smoothstep = (a, b, x) => smooth((x - a) / (b - a));
const wrapi = (i, n) => ((i % n) + n) % n;

/**
 * Tileable value noise with px x py lattice cells over u,v in [0,1) (period-wrapping lattice).
 * Returns f(u,v) -> [0,1). The lattice is precomputed, so sampling is hash-free.
 */
function makeNoise(px, py, seed) {
  const d = new Float32Array(px * py);
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) d[j * px + i] = hash2(i, j, seed);
  return (u, v) => {
    u -= Math.floor(u); v -= Math.floor(v);
    const x = u * px, y = v * py;
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i1 = ix + 1 === px ? 0 : ix + 1, j1 = iy + 1 === py ? 0 : iy + 1;
    const a = d[iy * px + ix], b = d[iy * px + i1], c = d[j1 * px + ix], e = d[j1 * px + i1];
    return a + (b - a) * fx + (c - a + (a - b - c + e) * fx) * fy;
  };
}

/** Tileable fbm: base period p, `oct` octaves (period doubles each octave). Returns f(u,v) -> ~[0,1]. */
function makeFbm(p, oct, seed) {
  const fs = [], amps = [];
  let a = 1, tot = 0;
  for (let o = 0; o < oct; o++) { fs.push(makeNoise(p << o, p << o, seed + o * 17)); amps.push(a); tot += a; a *= 0.5; }
  return (u, v) => { let s = 0; for (let o = 0; o < oct; o++) s += amps[o] * fs[o](u, v); return s / tot; };
}

/**
 * Tileable Worley (cellular) noise on a G x G grid. Call w(u,v); results in w.f1, w.f2
 * (distances in cell units) and w.id (random value of the nearest cell).
 */
function makeWorley(G, seed) {
  const rnd = mulberry32(seed * 7919 + 13);
  const fx = new Float32Array(G * G), fy = new Float32Array(G * G), fid = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) { fx[i] = rnd(); fy[i] = rnd(); fid[i] = rnd(); }
  const w = (u, v) => {
    u -= Math.floor(u); v -= Math.floor(v);
    const gx = u * G, gy = v * G, cx = Math.floor(gx), cy = Math.floor(gy);
    let f1 = 9, f2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const k = wrapi(cy + dj, G) * G + wrapi(cx + di, G);
        const dx = cx + di + fx[k] - gx, dy = cy + dj + fy[k] - gy;
        const dd = dx * dx + dy * dy;
        if (dd < f1) { f2 = f1; f1 = dd; id = fid[k]; } else if (dd < f2) f2 = dd;
      }
    }
    w.f1 = Math.sqrt(f1); w.f2 = Math.sqrt(f2); w.id = id;
  };
  return w;
}

// --- wrap-around stamping into "layers" (max-composited 0..1 masks) -------------------------

const PROF_SMOOTH = (q) => { const t = 1 - q; return t * t * (3 - 2 * t); };
const PROF_DOME = (q) => Math.sqrt(1 - q * q);

/** Stamp a radial profile into layer L (max), wrapping at the edges. */
function stampMax(L, n, cx, cy, r, val, prof = PROF_SMOOTH) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const row = wrapi(y, n) * n;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const v = val * prof(Math.sqrt(d2) / r), i = row + wrapi(x, n);
      if (v > L[i]) L[i] = v;
    }
  }
}

/** Stroke a line (wrapping) into layer L; radius < 0.8 gives a one pixel hairline. */
function strokeMax(L, n, x0, y0, x1, y1, r, val, prof = PROF_SMOOTH) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / Math.max(0.5, r * 0.4)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (r < 0.8) {
      const i = wrapi(Math.floor(y), n) * n + wrapi(Math.floor(x), n);
      if (val > L[i]) L[i] = val;
    } else stampMax(L, n, x, y, r, val, prof);
  }
}

// ---------------------------------------------------------------------------
// Kind generators. Each gets ctx {n, S (pixel scale vs 512), rnd, seed} and returns
// { h: height (arbitrary ~0..1), r: roughness 0..1 | null, a: albedo multiplier 0..1 | null, bump }
// `bump` is the base normal intensity (height slope multiplier).
// ---------------------------------------------------------------------------

/** Polished plate: hairline scratches, gentle hammering, faint dings. */
function genSteel({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n);
  const hammer = makeFbm(4, 3, seed + 1), smudge = makeFbm(6, 4, seed + 2), fine = makeNoise(128, 128, seed + 3);
  const scr = new Float32Array(n * n), ding = new Float32Array(n * n);
  // multi-directional hairline scratches, grouped in a few dominant brushing directions
  const dirs = [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI];
  for (let k = 0; k < 900 * S; k++) {
    const a = rnd() < 0.7 ? dirs[(rnd() * 3) | 0] + (rnd() - 0.5) * 0.35 : rnd() * Math.PI;
    const len = (10 + rnd() * rnd() * 130) * S, x = rnd() * n, y = rnd() * n;
    strokeMax(scr, n, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.5, 0.25 + rnd() * 0.75);
  }
  for (let k = 0; k < 6; k++) stampMax(ding, n, rnd() * n, rnd() * n, (12 + rnd() * 22) * S, 0.5 + rnd() * 0.5);
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      h[i] = (hammer(u, v) - 0.5) * 0.7 - scr[i] * 0.03 - ding[i] * 0.22 + (fine(u, v) - 0.5) * 0.01;
      r[i] = Math.min(1, 0.62 + (smudge(u, v) - 0.5) * 0.4 + scr[i] * 0.28 + ding[i] * 0.06);
    }
  }
  return { h, r, a: null, bump: 7 };
}

/** Riveted chain mail: offset rows of interlocking rings. */
function genMail({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const C = 16, R = 32, cs = n / C, rh = n / R;
  const rho = cs * 0.43, wid = cs * 0.115, ext = Math.ceil(rho + wid + 1);
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < C; i++) {
      const cx = (i + 0.5 + 0.5 * (j & 1)) * cs, cy = (j + 0.5) * rh;
      const layer = 0.78 + 0.22 * (j & 1) + (rnd() - 0.5) * 0.08;   // alternating rows sit over / under
      const tilt = (j & 1 ? Math.PI : 0) + (rnd() - 0.5) * 0.6;
      for (let y = Math.floor(cy - ext); y <= cy + ext; y++) {
        const row = wrapi(y, n) * n;
        for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const d = Math.abs(Math.hypot(dx, dy) - rho) / wid;
          if (d >= 1) continue;
          const tube = Math.sqrt(1 - d * d) * layer * (1 + 0.22 * Math.cos(Math.atan2(dy, dx) - tilt));
          const idx = row + wrapi(x, n);
          if (tube > h[idx]) h[idx] = tube;
        }
      }
    }
  }
  const grain = makeNoise(256, 256, seed + 5);
  for (let i = 0; i < n * n; i++) {
    const t = Math.min(1, h[i]);
    a[i] = 0.4 + 0.6 * Math.pow(t, 0.6);                    // dark gaps, lighter ring tops
    r[i] = Math.min(1, 0.62 + 0.3 * (1 - t) + (grain((i % n) / n, ((i / n) | 0) / n) - 0.5) * 0.15);
  }
  return { h, r, a, bump: 6 };
}

/** Plain-weave wool / linen with fuzz and slubs. */
function genCloth({ n, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const N = 64, PI = Math.PI;
  const slubV = makeNoise(N, 4, seed + 1), slubH = makeNoise(4, N, seed + 2), fibre = makeNoise(256, 256, seed + 3);
  for (let y = 0, i = 0; y < n; y++) {
    const v = (y + 0.5) / n, gy = v * N, j = Math.floor(gy), fy = gy - j, wy = Math.sin(PI * fy);
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, gx = u * N, c = Math.floor(gx), fx = gx - c, wx = Math.sin(PI * fx);
      const over = (c + j) & 1;                              // 1: vertical thread on top
      let t;
      if (over) t = Math.pow(wx, 0.6) * (0.6 + 0.4 * wy) * (0.9 + 0.2 * hash2(c, 0, seed)) * (0.85 + 0.3 * slubV(u, v));
      else t = Math.pow(wy, 0.6) * (0.6 + 0.4 * wx) * (0.9 + 0.2 * hash2(0, j, seed + 9)) * (0.85 + 0.3 * slubH(u, v));
      t += (rnd() - 0.5) * 0.12 + (fibre(u, v) - 0.5) * 0.1;  // thread fuzz
      h[i] = t;
      r[i] = 0.93 + 0.07 * rnd();
      a[i] = 0.76 + 0.24 * clamp01(t) * (0.9 + 0.1 * (1 - wx * wy));
    }
  }
  return { h, r, a, bump: 4 };
}

/** Velvet: fine, soft pile. */
function genVelvet({ n, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const n1 = makeNoise(256, 256, seed + 1), n2 = makeNoise(128, 128, seed + 2), sheen = makeFbm(8, 3, seed + 3);
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      const p = 0.45 * n1(u, v) + 0.35 * n2(u, v) + 0.2 * rnd();
      h[i] = p;
      r[i] = 0.88 + 0.12 * p;
      a[i] = 0.84 + 0.16 * sheen(u, v) * (0.9 + 0.1 * p);
    }
  }
  return { h, r, a, bump: 2.2 };
}

/** Pebbled leather grain with occasional creases. */
function genLeather({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n);
  const w = makeWorley(40, seed + 1), fine = makeFbm(64, 2, seed + 2), wob = makeFbm(5, 3, seed + 3);
  const crease = new Float32Array(n * n);
  for (let k = 0; k < 7; k++) {          // wandering crease lines
    let x = rnd() * n, y = rnd() * n, ang = rnd() * Math.PI * 2;
    const steps = 60 + ((rnd() * 80) | 0);
    for (let s = 0; s < steps; s++) {
      ang += (rnd() - 0.5) * 0.5;
      const nx = x + Math.cos(ang) * 3 * S, ny = y + Math.sin(ang) * 3 * S;
      strokeMax(crease, n, x, y, nx, ny, 2.2 * S, 1);
      x = nx; y = ny;
    }
  }
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      w(u + (wob(u, v) - 0.5) * 0.01, v);
      const peb = smoothstep(0, 0.32, w.f2 - w.f1);
      h[i] = Math.pow(peb, 0.8) * 0.8 + (fine(u, v) - 0.5) * 0.12 - crease[i] * 0.35;
      r[i] = Math.min(1, 0.6 + 0.28 * (1 - peb) + 0.12 * fine(u, v) + crease[i] * 0.1);
    }
  }
  return { h, r, a: null, bump: 5 };
}

/** Planks: grain along U, ring wobble, knots, seams every 1/4 of V. */
function genWood({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const P = 4, ph = n / P;
  const warp = makeNoise(3, 24, seed + 1), fibre = makeNoise(6, 256, seed + 2), fibre2 = makeNoise(12, 128, seed + 3);
  const off = [], bright = [], knots = [];
  for (let k = 0; k < P; k++) {
    off.push(rnd() * 10); bright.push(0.92 + rnd() * 0.08);
    if (rnd() < 0.75) knots.push({ x: rnd(), y: (k + 0.2 + rnd() * 0.6) / P, rx: 0.02 + rnd() * 0.02, ry: 0.012 + rnd() * 0.012 });
  }
  for (let y = 0, i = 0; y < n; y++) {
    const k = Math.min(P - 1, Math.floor(y / ph)), ly = y - k * ph, lv = ly / ph, v = (y + 0.5) / n;
    const seam = 1 - smoothstep(0, 3 * S, Math.min(ly, ph - ly));
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n;
      let s = lv * 6 + off[k] + 2.4 * (warp(u, v) - 0.5) * 2, kd = 0;
      for (let q = 0; q < knots.length; q++) {
        const kn = knots[q];
        let dx = u - kn.x; dx -= Math.round(dx);
        const dy = v - kn.y, e = dx * dx / (kn.rx * kn.rx) + dy * dy / (kn.ry * kn.ry);
        s += 4 * Math.exp(-e * 0.5);
        kd = Math.max(kd, Math.exp(-e * 3));          // dark knot core
      }
      const ring = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * s), 2);
      const fb = fibre(u, v) * 0.6 + fibre2(u, v) * 0.4;
      h[i] = 0.22 * ring + 0.3 * (fb - 0.5) - seam * 0.8 - kd * 0.2;
      r[i] = Math.min(1, 0.72 + 0.2 * ring + 0.12 * fb + seam * 0.2);
      a[i] = (0.9 - 0.1 * ring + 0.08 * (fb - 0.5)) * bright[k] * (1 - 0.45 * kd) * (1 - 0.3 * seam);
    }
  }
  return { h, r, a, bump: 4.5 };
}

/** Ashlar blocks in running bond with bevelled mortar joints. */
function genStone({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const C = 4, R = 8, bw = n / C, bh = n / R;
  const rough = makeFbm(32, 3, seed + 1), chip = makeFbm(16, 2, seed + 2), grain = makeNoise(256, 256, seed + 3);
  const mortar = 3.5 * S, bevel = 6 * S;
  for (let y = 0, i = 0; y < n; y++) {
    const j = Math.floor(y / bh), ly = y - j * bh, ey = Math.min(ly, bh - ly);
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      const xs = (x + (j & 1) * bw / 2) % n, col = Math.floor(xs / bw), lx = xs - col * bw;
      const bid = hash2(col, j, seed), tilt = hash2(col, j, seed + 5) - 0.5;
      let e = Math.min(Math.min(lx, bw - lx), ey) + (chip(u, v) - 0.5) * 8 * S;
      const t = smooth((e - mortar) / bevel), rn = rough(u, v);
      const face = 0.6 + 0.25 * rn + 0.1 * bid + tilt * 0.12 * (lx / bw - 0.5);
      h[i] = t * face + (1 - t) * (grain(u, v) * 0.05);
      r[i] = 0.82 + 0.18 * rn + (1 - t) * 0.15;
      const faceA = (0.78 + 0.22 * bid) * (0.9 + 0.1 * rn) * (0.82 + 0.18 * t);
      a[i] = (0.5 + 0.12 * grain(u, v)) * (1 - t) + faceA * t;
    }
  }
  return { h, r, a, bump: 5 };
}

/** Arena sand: soft ripples, horseshoe hoof prints, small pebbles. */
function genSand({ n, S, rnd, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n);
  const rip = makeFbm(3, 3, seed + 1), g1 = makeNoise(256, 256, seed + 2), low = makeFbm(6, 3, seed + 3);
  const pit = new Float32Array(n * n), peb = new Float32Array(n * n);
  // horseshoe impressions: a U-shaped arc, heel opening upward, plus a shallow frog dent
  for (let k = 0; k < 16; k++) {
    const cx = rnd() * n, cy = rnd() * n, th = rnd() * Math.PI * 2, sz = (8 + rnd() * 4) * S;
    const c = Math.cos(th), s = Math.sin(th);
    const pt = (px, py) => [cx + px * c - py * s, cy + px * s + py * c];
    let prev = null;
    for (let q = 0; q <= 14; q++) {
      const ang = (q / 14) * Math.PI, p = pt(Math.cos(ang) * sz * 0.8, Math.sin(ang) * sz);
      if (prev) strokeMax(pit, n, prev[0], prev[1], p[0], p[1], 2.2 * S, 0.7 + rnd() * 0.3);
      prev = p;
    }
    const f = pt(0, sz * 0.35);
    stampMax(pit, n, f[0], f[1], sz * 0.45, 0.25);
  }
  for (let k = 0; k < 140; k++) stampMax(peb, n, rnd() * n, rnd() * n, (1.5 + rnd() * 2.2) * S, 0.5 + rnd() * 0.5, PROF_DOME);
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      const rp = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (v * 6 + u * 1.5 + 2 * rip(u, v)));
      h[i] = 0.13 * rp + 0.06 * (g1(u, v) - 0.5) + (rnd() - 0.5) * 0.05
        - pit[i] * 0.3 + peb[i] * 0.4;
      r[i] = 0.88 + 0.12 * low(u, v) - peb[i] * 0.15 - pit[i] * 0.03;
    }
  }
  return { h, r, a: null, bump: 4.5 };
}

/** Short horse hair: strands flowing along V with gentle swirls. */
function genCoat({ n, seed }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n);
  const s1 = makeNoise(180, 6, seed + 1), s2 = makeNoise(90, 3, seed + 2), s3 = makeNoise(256, 16, seed + 3);
  const sw = makeFbm(3, 3, seed + 4), sheen = makeFbm(5, 3, seed + 5);
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u0 = (x + 0.5) / n, v = (y + 0.5) / n;
      const u = u0 + 0.05 * (sw(u0, v) - 0.5);                // lateral swirl
      const p = 0.5 * s1(u, v) + 0.32 * s2(u, v) + 0.18 * s3(u, v);
      h[i] = p;
      r[i] = Math.min(1, 0.62 + 0.22 * sheen(u0, v) + 0.15 * (1 - p));
    }
  }
  return { h, r, a: null, bump: 3 };
}

/** Low clumpy turf. */
function genGrass({ n, seed, rnd }) {
  const h = new Float32Array(n * n), r = new Float32Array(n * n), a = new Float32Array(n * n);
  const w = makeWorley(18, seed + 1), b1 = makeNoise(128, 128, seed + 2), b2 = makeNoise(256, 256, seed + 3);
  const mott = makeFbm(6, 4, seed + 4);
  for (let y = 0, i = 0; y < n; y++) {
    for (let x = 0; x < n; x++, i++) {
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      w(u, v);
      const clump = (1 - smoothstep(0, 0.9, w.f1)) * (0.6 + 0.4 * w.id);
      h[i] = 0.5 * clump + 0.3 * (0.6 * b1(u, v) + 0.4 * b2(u, v)) + 0.12 * rnd();
      r[i] = 0.85 + 0.15 * b1(u, v);
      a[i] = (0.82 + 0.18 * mott(u, v)) * (0.92 + 0.08 * clump);
    }
  }
  return { h, r, a, bump: 4 };
}

const GENERATORS = {
  steel: genSteel, mail: genMail, cloth: genCloth, velvet: genVelvet, leather: genLeather,
  wood: genWood, stone: genStone, sand: genSand, coat: genCoat, grass: genGrass,
};

// ---------------------------------------------------------------------------
// Conversion to canvases
// ---------------------------------------------------------------------------

function newCanvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

/** Tangent-space normal map from a height field using a wrapping Sobel filter. */
function normalCanvas(h, n, k) {
  const c = newCanvas(n), ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n), d = img.data;
  const kk = k * (n / 512) / 8;                           // /8 normalises the Sobel sum to slope per pixel
  for (let y = 0; y < n; y++) {
    const rU = ((y + n - 1) % n) * n, rC = y * n, rD = ((y + 1) % n) * n;
    for (let x = 0; x < n; x++) {
      const xl = (x + n - 1) % n, xr = (x + 1) % n;
      const dx = (h[rU + xr] + 2 * h[rC + xr] + h[rD + xr]) - (h[rU + xl] + 2 * h[rC + xl] + h[rD + xl]);
      const dy = (h[rD + xl] + 2 * h[rD + x] + h[rD + xr]) - (h[rU + xl] + 2 * h[rU + x] + h[rU + xr]);
      const nx = -dx * kk, ny = dy * kk;                  // image rows run down, +V is up: ny = dh/drow
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), o = (rC + x) * 4;
      d[o] = (nx * il * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * il * 0.5 + 0.5) * 255;
      d[o + 2] = (il * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Greyscale canvas (same value in r,g,b) from a 0..1 field. */
function greyCanvas(f, n) {
  const c = newCanvas(n), ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n), d = img.data;
  for (let i = 0, o = 0; i < n * n; i++, o += 4) {
    const v = clamp01(f[i]) * 255;
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const cache = new Map();   // "kind|size|seed" -> { fields, canvases }

function getEntry(kind, size, seed) {
  const key = kind + '|' + size + '|' + seed;
  let e = cache.get(key);
  if (!e) {
    const rnd = mulberry32(seed * 1000003 + kind.length * 97 + kind.charCodeAt(0));
    const fields = GENERATORS[kind]({ n: size, S: size / 512, rnd, seed });
    e = { fields, normals: new Map(), rough: null, albedo: null };
    cache.set(key, e);
  }
  return e;
}

function toTexture(canvas, colorSpace, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = GFX.aniso;
  t.colorSpace = colorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Build PBR detail textures for `kind` (see KINDS).
 * opts: { repeat:[x,y]=[1,1], size=512, strength=1, seed=1 }
 * Returns { normalMap, roughnessMap?, map? } (fresh textures sharing cached canvases).
 */
export function makePBR(kind, opts = {}) {
  if (!GENERATORS[kind]) throw new Error('texgen: unknown kind "' + kind + '"');
  const { repeat = [1, 1], size = 512, strength = 1, seed = 1 } = opts;
  const e = getEntry(kind, size, seed), f = e.fields;
  const out = {};

  const nk = String(strength);
  if (!e.normals.has(nk)) e.normals.set(nk, normalCanvas(f.h, size, f.bump * strength));
  out.normalMap = toTexture(e.normals.get(nk), THREE.NoColorSpace, repeat);

  if (f.r) {
    if (!e.rough) e.rough = greyCanvas(f.r, size);
    out.roughnessMap = toTexture(e.rough, THREE.NoColorSpace, repeat);
  }
  if (f.a) {
    if (!e.albedo) e.albedo = greyCanvas(f.a, size);
    out.map = toTexture(e.albedo, THREE.SRGBColorSpace, repeat);
  }
  return out;
}
