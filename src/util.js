import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

// Deterministic RNG so the world looks the same every run.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Smooth 1D noise built from incommensurate sines; returns roughly -1..1.
export function wobble(t, seed = 0) {
  return (Math.sin(t * 1.0 + seed * 12.9) + Math.sin(t * 2.3 + seed * 78.2) * 0.6 + Math.sin(t * 4.1 + seed * 37.7) * 0.3) / 1.9;
}

/**
 * Loft a smooth tube through a list of rings.
 * ring: { p:[x,y,z], rx, ry }  (rx = half-width along the side axis, ry = half-depth along the dorsal axis)
 * opts.arc = [start, length] in radians (0 = +side, PI/2 = dorsal). Full circle by default.
 */
export function loft(rings, opts = {}) {
  const segs = opts.segs ?? 16;
  const arc = opts.arc ?? [0, TAU];
  const full = Math.abs(arc[1] - TAU) < 1e-6;
  const side = new THREE.Vector3(...(opts.side ?? [1, 0, 0]));
  const cols = full ? segs : segs + 1;
  const pos = [], uv = [], idx = [];
  const P = rings.map(r => new THREE.Vector3(...r.p));
  const T = new THREE.Vector3(), N = new THREE.Vector3(), S = new THREE.Vector3();
  let run = 0;
  for (let i = 0; i < rings.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(rings.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    N.crossVectors(T, side).normalize();
    S.crossVectors(N, T).normalize();
    if (i > 0) run += P[i].distanceTo(P[i - 1]);
    for (let j = 0; j < cols; j++) {
      const th = arc[0] + arc[1] * (j / segs);
      const c = Math.cos(th) * rings[i].rx, s = Math.sin(th) * rings[i].ry;
      pos.push(P[i].x + S.x * c + N.x * s, P[i].y + S.y * c + N.y * s, P[i].z + S.z * c + N.z * s);
      uv.push(j / segs, run);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = full ? (j + 1) % segs : j + 1;
      const a = i * cols + j, b = i * cols + j2, c = (i + 1) * cols + j, d = (i + 1) * cols + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (full && opts.caps !== false) {
    const n = rings.length - 1;
    const c0 = pos.length / 3; pos.push(P[0].x, P[0].y, P[0].z); uv.push(0.5, 0);
    const c1 = pos.length / 3; pos.push(P[n].x, P[n].y, P[n].z); uv.push(0.5, run);
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      idx.push(c0, j2, j, c1, n * cols + j, n * cols + j2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function loftMesh(rings, mat, opts) {
  const m = new THREE.Mesh(loft(rings, opts), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const _y = new THREE.Vector3(0, 1, 0);
/** Tapered cylinder between two points (a has radius r1, b has radius r2). */
export function limb(a, b, r1, r2, mat, segs = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(B, A);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, segs, 1), mat);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_y, d.normalize());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function ball(p, r, mat, scale) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  m.position.set(...p);
  if (scale) m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function box(p, s, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat);
  m.position.set(...p);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- canvas textures ----------
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, colors, minR, maxR, r) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(r() * colors.length) | 0];
    g.globalAlpha = 0.25 + r() * 0.5;
    const s = minR + r() * (maxR - minR);
    g.fillRect(r() * w, r() * h, s, s * (0.5 + r() * 2));
  }
  g.globalAlpha = 1;
}

export function grassTexture(repeat) {
  const r = rng(7);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5b7a36'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#4c6b2b', '#6a8a3d', '#7a9645', '#40602a', '#86a052', '#55733a'], 1, 4, r);
    speckle(g, w, h, 500, ['#8a8a4a', '#9a9a58'], 1, 3, r);
  }, { repeat });
}

export function sandTexture(repeat) {
  const r = rng(11);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 8000, ['#a88a5c', '#c4a878', '#9c7f52', '#cdb488', '#8f7448'], 1, 4, r);
    // hoof scuffs
    g.strokeStyle = 'rgba(90,70,40,0.25)'; g.lineWidth = 3;
    for (let i = 0; i < 120; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 5, r() * 6, r() * 6 + 3); g.stroke(); }
  }, { repeat });
}

export function woodTexture(repeat, base = '#7a5a36') {
  const r = rng(23);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = r() > 0.5 ? 'rgba(40,25,10,0.22)' : 'rgba(190,150,100,0.16)';
      g.lineWidth = 0.5 + r() * 1.5;
      const y = r() * h; g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + r() * 6 - 3, w * 0.6, y + r() * 6 - 3, w, y + r() * 4 - 2); g.stroke();
    }
    g.fillStyle = 'rgba(25,15,5,0.55)';
    for (let i = 1; i < 4; i++) g.fillRect(0, (h / 4) * i - 1, w, 2);
  }, { repeat });
}

export function stoneTexture(repeat) {
  const r = rng(31);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#9a958a'; g.fillRect(0, 0, w, h);
    const rows = 12, bh = h / rows;
    for (let y = 0; y < rows; y++) {
      const bw = w / 6, off = (y % 2) * bw / 2;
      for (let x = -1; x < 7; x++) {
        const l = 135 + r() * 40;
        g.fillStyle = `rgb(${l},${l - 4},${l - 14})`;
        g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
      }
    }
    speckle(g, w, h, 5000, ['#77736a', '#b5b0a4', '#6c675d'], 1, 3, r);
  }, { repeat });
}

export function stripeTexture(c1, c2, n = 8, repeat) {
  return canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect((w / n) * i, 0, w / n + 1, h); }
  }, { repeat });
}

export function softDot() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------- heraldry ----------
function charge(g, kind, cx, cy, s, col) {
  g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = s * 0.04;
  g.beginPath();
  if (kind === 'cross') {
    const a = s * 0.16; g.rect(cx - a, cy - s * 0.5, a * 2, s); g.rect(cx - s * 0.5, cy - a, s, a * 2);
  } else if (kind === 'diamond') {
    g.moveTo(cx, cy - s * 0.5); g.lineTo(cx + s * 0.32, cy); g.lineTo(cx, cy + s * 0.5); g.lineTo(cx - s * 0.32, cy); g.closePath();
  } else if (kind === 'star') {
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.22 : s * 0.5, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath();
  } else if (kind === 'tower') {
    g.rect(cx - s * 0.28, cy - s * 0.25, s * 0.56, s * 0.75);
    for (let i = 0; i < 3; i++) g.rect(cx - s * 0.34 + i * s * 0.26, cy - s * 0.5, s * 0.16, s * 0.27);
  } else if (kind === 'crescent') {
    g.arc(cx, cy, s * 0.45, 0, TAU); g.fill(); g.stroke();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy - s * 0.18, s * 0.38, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over'; return;
  } else if (kind === 'fleur') {
    g.ellipse(cx, cy - s * 0.1, s * 0.12, s * 0.4, 0, 0, TAU);
    g.ellipse(cx - s * 0.25, cy, s * 0.1, s * 0.28, -0.6, 0, TAU);
    g.ellipse(cx + s * 0.25, cy, s * 0.1, s * 0.28, 0.6, 0, TAU);
    g.rect(cx - s * 0.3, cy + s * 0.18, s * 0.6, s * 0.09);
  } else if (kind === 'feathers') {
    // three ostrich feathers side by side, quills down, the middle one a little higher
    const plume = (x, y, a) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, s * 0.3); g.bezierCurveTo(-s * 0.2, s * 0.05, -s * 0.17, -s * 0.3, 0, -s * 0.5);
      g.bezierCurveTo(s * 0.17, -s * 0.3, s * 0.2, s * 0.05, 0, s * 0.3); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, -s * 0.38); g.lineWidth = s * 0.03; g.stroke(); g.lineWidth = s * 0.04;
      g.restore();
    };
    plume(cx - s * 0.36, cy + s * 0.08, -0.22); plume(cx + s * 0.36, cy + s * 0.08, 0.22); plume(cx, cy - s * 0.04, 0);
    return;
  } else { g.arc(cx, cy, s * 0.4, 0, TAU); }
  g.fill(); g.stroke();
}

// ordinary shapes, shared by the field pattern and the `over` list
function ordinary(g, kind, w, h) {
  if (kind === 'fess') g.fillRect(0, h * 0.36, w, h * 0.28);
  else if (kind === 'chief') g.fillRect(0, 0, w, h * 0.3);
  else if (kind === 'bend') { g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.3, 0); g.lineTo(w, h * 0.7); g.lineTo(w, h); g.lineTo(w * 0.7, h); g.lineTo(0, h * 0.3); g.fill(); }
  else if (kind === 'chevron') { g.beginPath(); g.moveTo(0, h * 0.75); g.lineTo(w / 2, h * 0.3); g.lineTo(w, h * 0.75); g.lineTo(w, h * 0.98); g.lineTo(w / 2, h * 0.53); g.lineTo(0, h * 0.98); g.fill(); }
}

/** Draw a coat of arms filling the rect (0,0,w,h). */
export function drawArms(g, w, h, arms, chargeScale = 0.42) {
  const { c1, c2, c3, pattern } = arms;
  g.fillStyle = c1; g.fillRect(0, 0, w, h);
  g.fillStyle = c2;
  if (pattern === 'pale') g.fillRect(w / 2, 0, w / 2, h);
  else if (pattern === 'fess') g.fillRect(0, h * 0.36, w, h * 0.28);
  else if (pattern === 'quarterly') { g.fillRect(w / 2, 0, w / 2, h / 2); g.fillRect(0, h / 2, w / 2, h / 2); }
  else if (pattern === 'bend') { g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.3, 0); g.lineTo(w, h * 0.7); g.lineTo(w, h); g.lineTo(w * 0.7, h); g.lineTo(0, h * 0.3); g.fill(); }
  else if (pattern === 'chevron') { g.beginPath(); g.moveTo(0, h * 0.75); g.lineTo(w / 2, h * 0.3); g.lineTo(w, h * 0.75); g.lineTo(w, h * 0.98); g.lineTo(w / 2, h * 0.53); g.lineTo(0, h * 0.98); g.fill(); }
  else if (pattern === 'chief') g.fillRect(0, 0, w, h * 0.3);
  else if (pattern === 'paly') { for (let i = 0; i < 6; i += 2) g.fillRect((w / 6) * (i + 1), 0, w / 6, h); }
  else if (pattern === 'chequy') { for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) g.fillRect(w / 6 * x, h / 6 * y, w / 6 + 1, h / 6 + 1); }
  if (arms.over) for (const o of arms.over) { g.fillStyle = o.c; ordinary(g, o.kind, w, h); }
  if (arms.charge && arms.charge !== 'none') charge(g, arms.charge, w / 2, h * (pattern === 'chief' ? 0.62 : 0.48), Math.min(w, h) * chargeScale, c3 || c2);
}

export function armsTexture(arms, w = 256, h = 256, repeat) {
  return canvasTex(w, h, (g) => drawArms(g, w, h, arms), repeat ? { repeat } : {});
}

/** Draw arms clipped to a heater shield on a 2D canvas. */
export function drawCrest(cv, arms) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h); g.save();
  g.beginPath(); g.moveTo(1, 1); g.lineTo(w - 1, 1); g.lineTo(w - 1, h * 0.45);
  g.bezierCurveTo(w - 1, h * 0.72, w * 0.72, h * 0.9, w / 2, h - 1);
  g.bezierCurveTo(w * 0.28, h * 0.9, 1, h * 0.72, 1, h * 0.45); g.closePath();
  g.clip(); drawArms(g, w, h * 0.92, arms); g.restore();
  g.lineWidth = Math.max(1.5, w / 40); g.strokeStyle = 'rgba(20,14,8,0.9)'; g.stroke();
}

// ---------- scanned (photographed) textures from assets/tex ----------
const _tl = new THREE.TextureLoader();
/** kind: 'diff' | 'nor_gl' | 'rough'. Each call makes its own texture so repeats can differ. */
export function photoTex(name, kind, repeat = [1, 1]) {
  const t = _tl.load(`assets/tex/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8;
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Full PBR set for a MeshStandardMaterial: { map, normalMap, roughnessMap }. */
export function photoSet(name, repeat = [1, 1]) {
  return { map: photoTex(name, 'diff', repeat), normalMap: photoTex(name, 'nor_gl', repeat), roughnessMap: photoTex(name, 'rough', repeat) };
}
/**
 * Map a material's textures in world space (metres per tile = 1/scale) instead of by each mesh's own UVs,
 * so planks and stone keep one true size on every beam, rail and wall however long it is.
 */
export function worldUV(mat, scale = 0.5) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      {
        mat4 wm = modelMatrix;
        #ifdef USE_INSTANCING
          wm = modelMatrix * instanceMatrix;
        #endif
        vec3 wp = (wm * vec4(position, 1.0)).xyz; vec3 wn = normalize(mat3(wm) * normal);
        vec2 wuv = (abs(wn.y) > 0.6 ? wp.xz : (abs(wn.x) > 0.6 ? wp.zy : wp.xy)) * ${scale.toFixed(3)};
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif
      }`);
  };
  mat.customProgramCacheKey = () => 'worldUV' + scale;
  return mat;
}

/**
 * Multiply a material's colour by a scanned texture laid in world space (metres per tile = 1/scale), keeping whatever
 * map and vertex colours it already has. mean: the texture's average linear colour, so the result keeps its overall tone.
 * macro > 0 also adds slow light-and-dark drifts so a tiled ground does not read as stripes.
 */
export function detailWorld(mat, tex, { scale = 0.3, mean = [0.25, 0.25, 0.25], strength = 1, macro = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDWp; varying vec3 vDWn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { mat4 wm = modelMatrix;
          #ifdef USE_INSTANCING
            wm = modelMatrix * instanceMatrix;
          #endif
          vDWp = (wm * vec4(position, 1.0)).xyz; vDWn = normalize(mat3(wm) * normal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vDWp; varying vec3 vDWn;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 an = abs(vDWn);
          vec2 duv = (an.y > 0.6 ? vDWp.xz : (an.x > an.z ? vDWp.zy : vDWp.xy)) * ${scale.toFixed(4)};
          vec3 det = texture2D(uDetail, duv).rgb / vec3(${mean.map(v => v.toFixed(4)).join(', ')});
          diffuseColor.rgb *= mix(vec3(1.0), det, ${strength.toFixed(3)});
          ${macro > 0 ? `float mv = texture2D(uDetail, duv * 0.043 + 0.37).g * texture2D(uDetail, duv * 0.0117).g / ${(mean[1] * mean[1]).toFixed(5)};
          diffuseColor.rgb *= mix(1.0, clamp(mv, 0.35, 1.9), ${macro.toFixed(3)});` : ''}
        }`);
  };
  mat.customProgramCacheKey = () => 'detailWorld' + scale + mean.join() + strength + macro + tex.uuid;
  return mat;
}

/** A small portrait for a retinue man: head and shoulders in his temper's colour, a cap that follows his post, his initials. Seeded by his name, so it never changes. */
export function drawFace(cv, name, color, cap) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  let s = 2166136261; for (const c of name) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const skin = ['#e0b896', '#d4a07a', '#c58f68', '#e8c4a4', '#b9835e'][Math.floor(rnd() * 5)], hair = ['#2b1d12', '#5a3a1e', '#8a6a35', '#b9a06a', '#3a3a3a', '#7a2f17'][Math.floor(rnd() * 6)];
  const jaw = 0.9 + rnd() * 0.2, eye = 0.9 + rnd() * 0.2, cx = w / 2, hy = h * 0.4, hr = h * 0.2;
  g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(43,29,18,.1)'; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.beginPath(); g.moveTo(w * 0.1, h); g.quadraticCurveTo(w * 0.12, h * 0.68, cx, h * 0.66); g.quadraticCurveTo(w * 0.88, h * 0.68, w * 0.9, h); g.closePath(); g.fill();   // shoulders
  g.fillStyle = skin; g.fillRect(cx - hr * 0.35, hy + hr * 0.7, hr * 0.7, h * 0.18);                                                                                                    // neck
  g.beginPath(); g.ellipse(cx, hy, hr * jaw * 0.9, hr * 1.1, 0, 0, 7); g.fill();                                                                                                        // head
  g.fillStyle = hair; g.beginPath(); g.ellipse(cx, hy - hr * 0.55, hr * jaw * 0.95, hr * 0.6, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#2b1d12'; for (const dx of [-1, 1]) { g.beginPath(); g.ellipse(cx + dx * hr * 0.38 * eye, hy, hr * 0.09, hr * 0.07, 0, 0, 7); g.fill(); }
  g.fillRect(cx - hr * 0.2, hy + hr * 0.55, hr * 0.4, 1.5);
  g.fillStyle = color; g.strokeStyle = 'rgba(43,29,18,.7)'; g.lineWidth = 1;
  const top = hy - hr * 0.95;
  if (cap === 'flat') { g.beginPath(); g.ellipse(cx, top + hr * 0.3, hr * 1.25, hr * 0.28, 0, 0, 7); g.fill(); g.stroke(); g.fillRect(cx - hr * 0.8, top - hr * 0.1, hr * 1.6, hr * 0.4); }
  else if (cap === 'coif') { g.fillStyle = '#9a9a96'; g.beginPath(); g.ellipse(cx, hy - hr * 0.2, hr * 1.05, hr * 1.0, 0, Math.PI, 0); g.lineTo(cx + hr * 1.05, hy + hr * 0.7); g.lineTo(cx - hr * 1.05, hy + hr * 0.7); g.closePath(); g.fill(); g.stroke(); g.fillStyle = skin; g.beginPath(); g.ellipse(cx, hy + hr * 0.15, hr * 0.62, hr * 0.7, 0, 0, 7); g.fill(); }
  else if (cap === 'hood') { g.beginPath(); g.moveTo(cx - hr * 1.15, hy + hr * 0.9); g.quadraticCurveTo(cx - hr * 1.3, top - hr * 0.3, cx, top - hr * 0.5); g.quadraticCurveTo(cx + hr * 1.3, top - hr * 0.3, cx + hr * 1.15, hy + hr * 0.9); g.quadraticCurveTo(cx, hy + hr * 0.3, cx - hr * 1.15, hy + hr * 0.9); g.fill(); g.stroke(); }
  else if (cap === 'herald') { g.beginPath(); g.moveTo(cx - hr * 1.0, top + hr * 0.4); g.lineTo(cx - hr * 0.7, top - hr * 0.7); g.lineTo(cx + hr * 0.7, top - hr * 0.7); g.lineTo(cx + hr * 1.0, top + hr * 0.4); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#e0b83c'; g.fillRect(cx - hr * 1.0, top + hr * 0.25, hr * 2, hr * 0.2); }
  else { g.beginPath(); g.ellipse(cx, top + hr * 0.4, hr * 1.0, hr * 0.55, 0, Math.PI, 0); g.fill(); g.stroke(); g.fillRect(cx - hr * 1.0, top + hr * 0.38, hr * 2, hr * 0.14); }
  const ini = name.split(' ').filter(x => /^[A-ZÍÉ]/.test(x)).slice(0, 2).map(x => x[0]).join('');
  g.fillStyle = 'rgba(255,250,228,.92)'; g.font = `bold ${Math.round(h * 0.13)}px serif`; g.textAlign = 'center'; g.fillText(ini, cx, h * 0.93);
}
