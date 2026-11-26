// lists.js - the modelled timber structures of the lists: the stands (berfrois), the royal box, the judges' stand, the tilt, the fence and its gates,
// the dais, the marshal's stage, lance racks and mounting blocks. Built in Blender (tools/blender/lists/build_lists.py, docs/lists-plan.md) to the layout
// the game already had; this file fetches the pieces, gives them their materials and sets them out, one instanced mesh per piece and material.
//
//   assets/models/lists/lists_lod0.glb   high      chamfered members, separate planks
//   assets/models/lists/lists_lod1.glb   medium    plain members, fewer folds
//   assets/models/lists/lists_lod2.glb   low       slabs and the main frame
// A device fetches one of them. Until it arrives (or if it fails, or with ?lists=old) the old code-built boxes stay: world.js builds them first and
// calls useLists() when the pieces are in. The files carry geometry only: uv along the grain, vertex colours (occlusion, a tint per board).
// Materials by name: timber, paint_a / paint_b (the venue's tilt colours), canvas_a / canvas_b / canvas_r (awnings east, west, royal), cloth_tilt,
// cloth_a / cloth_b, carpet, damask, gold, board, hanging (an atlas of arms, one tile per instance), host_arms.
// The arms come from the heraldry system (drawArms / armsTexture of util.js): lists.setHangings(arms[]) and lists.setHostArms(arms) repaint them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GFX } from './gfx.js';
import { photoTex, canvasTex, drawArms, armsTexture } from './util.js';

const DIR = 'assets/models/lists/';
const LOD_OF = { high: 0, medium: 1, low: 2 };
const param = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
/** on: a world is showing the modelled lists (the cheap dais, stools and so on of other files are then left out). lib: the loaded pieces. */
export const LISTS = { on: false, lib: null, lod: -1, failed: false, current: null };
let loading = null;

/** One piece of the file as plain geometries in metres, one per material name. */
function readPiece(node) {
  const prims = [], s = node.scale, t = node.position;
  node.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, n = P.count;
    const pos = new Float32Array(n * 3), nor = new Int8Array(n * 3), uv = new Float32Array(n * 2), col = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = P.getX(i) * s.x + t.x; pos[i * 3 + 1] = P.getY(i) * s.y + t.y; pos[i * 3 + 2] = P.getZ(i) * s.z + t.z;
      let x = N.getX(i) / s.x, y = N.getY(i) / s.y, z = N.getZ(i) / s.z; if (!(Math.hypot(x, y, z) > 1e-6)) { x = 0; y = 1; z = 0; } const l = 127 / Math.hypot(x, y, z);      // (stored pre-scaled, see geo.py)
      nor[i * 3] = Math.round(x * l); nor[i * 3 + 1] = Math.round(y * l); nor[i * 3 + 2] = Math.round(z * l);
      uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i);
      col[i * 3] = Math.round(C.getX(i) * 255); col[i * 3 + 1] = Math.round(C.getY(i) * 255); col[i * 3 + 2] = Math.round(C.getZ(i) * 255);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setIndex(g.index.clone()); geo.computeBoundingSphere(); geo.computeBoundingBox();
    prims.push({ mat: o.material.name, geo });
  });
  return prims;
}

/** Fetch the pieces for this device's tier (once). Resolves to the library (Map name -> [{ mat, geo }]) or null. */
export function preloadLists() {
  if (loading) return loading;
  if (param('lists') === 'old' || typeof document === 'undefined') { LISTS.failed = true; return (loading = Promise.resolve(null)); }
  const want = param('lists'), lod = /^lod[012]$/.test(want || '') ? +want[3] : LOD_OF[GFX.tier] ?? 0;
  loading = new GLTFLoader().loadAsync(`${DIR}lists_lod${lod}.glb`).then((g) => {
    const lib = new Map();
    for (const node of g.scene.children) lib.set(node.name, readPiece(node));
    g.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    LISTS.lib = lib; LISTS.lod = lod; return lib;
  }).catch((e) => { console.warn('the modelled lists are unavailable, keeping the built-in ones', e); LISTS.failed = true; return null; });
  return loading;
}

// ------------------------------------------------------------------ textures drawn here
/** Two stripes side by side (u 0..1 is one pair), a little uneven like dyed canvas. */
function stripes(c1, c2) {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w / 2, h); g.fillStyle = c2; g.fillRect(w / 2, 0, w / 2, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + Math.random() * 0.035})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 22); }
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(w / 2 - 1, 0, 2, h); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);      // the seams
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = GFX.aniso; return t;
}
/** Cloth of gold: an ogival net with a pomegranate in each mesh, gold on crimson. Tiles. */
function damask(field = '#7c1620', gold = '#c9a03c') {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = field; g.fillRect(0, 0, w, h);
    const motif = (cx, cy) => {
      g.save(); g.translate(cx, cy); g.strokeStyle = gold; g.fillStyle = gold; g.lineWidth = 5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(0, -126); g.bezierCurveTo(52, -86, 62, -40, 0, 0); g.bezierCurveTo(-62, -40, -52, -86, 0, -126); g.stroke();      // the ogee
      g.beginPath(); g.moveTo(0, 126); g.bezierCurveTo(52, 86, 62, 40, 0, 0); g.bezierCurveTo(-62, 40, -52, 86, 0, 126); g.stroke();
      for (const sy of [-1, 1]) {
        g.beginPath(); g.ellipse(0, sy * 62, 17, 25, 0, 0, Math.PI * 2); g.fill();      // the fruit
        g.beginPath(); g.moveTo(-9, sy * 88); g.lineTo(0, sy * 104); g.lineTo(9, sy * 88); g.closePath(); g.fill();      // its crown
        for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 24, sy * 40, 7, 17, sx * sy * 0.7, 0, Math.PI * 2); g.fill(); }      // leaves
        g.fillStyle = field; g.beginPath(); g.ellipse(0, sy * 62, 8, 14, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = gold;
      }
      g.restore();
    };
    for (const [x, y] of [[64, 128], [192, 0], [192, 256], [64, -128], [64, 384], [-64, 0], [-64, 256], [320, 128]]) motif(x, y);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 5); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = GFX.aniso; return t;
}
/** The judges' board: the cheque, two rows of boxes with strokes, painted on a limewashed board. */
function chequeBoard(c1, c2) {
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#d9cdae'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 40, 1); }
    g.strokeStyle = '#2a2018'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    [[c1, 34], [c2, 176]].forEach(([c, y]) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(22, y); g.lineTo(62, y); g.lineTo(62, y + 26); g.quadraticCurveTo(60, y + 46, 42, y + 54); g.quadraticCurveTo(24, y + 46, 22, y + 26); g.closePath(); g.fill(); g.lineWidth = 2; g.stroke();
      g.lineWidth = 2.5; g.strokeRect(78, y, 156, 104); g.beginPath(); g.moveTo(78, y + 34); g.lineTo(234, y + 34); g.moveTo(78, y + 69); g.lineTo(234, y + 69); g.stroke();
      for (let r = 0; r < 3; r++) { const n = 1 + Math.floor(rnd() * 5); for (let k = 0; k < n; k++) { const x = 92 + k * 24 + rnd() * 5; g.beginPath(); g.moveTo(x, y + r * 35 + 6); g.lineTo(x + 3 - rnd() * 6, y + r * 35 + 28); g.stroke(); } }
    });
  });
}

// ------------------------------------------------------------------ the lists of one world
const TILES = 8;      // arms in the hangings' atlas
/**
 * Set the pieces out. o: { V (the venue), arms (the hangings' arms, up to 8), hostArms, addBanner(x, z, h, bw, bh, matIdx, rotY) (world.js's waving banners) }.
 * Returns { group, judges (the judges' stand's own group), setTilt(on), setHangings(arms[]), setHostArms(arms), dispose() }.
 */
export function buildLists(parent, lib, o) {
  const V = o.V, group = new THREE.Group(); group.name = 'lists'; parent.add(group);
  const own = [];      // textures and materials made here
  const keep = (x) => { own.push(x); return x; };
  const wood = { map: keep(photoTex('weathered_brown_planks', 'diff')), normalMap: keep(photoTex('weathered_brown_planks', 'nor_gl')), roughnessMap: keep(photoTex('weathered_brown_planks', 'rough')) };
  const linen = (rep) => keep(photoTex('rough_linen', 'nor_gl', [rep, rep]));
  const std = (p) => keep(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 1, envMapIntensity: 0.3 }, p)));
  const cloth = (p) => std(Object.assign({ side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.2, normalMap: linen(3) }, p));
  const awning = (c) => { const map = keep(stripes(c[0], c[1])); return cloth({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.1 }); };      // (a little of the sun comes through the canvas)
  const royal = V.royal || ['#5c1f6e', '#d9b23c'];
  const hangCanvas = document.createElement('canvas'); hangCanvas.width = 256 * TILES; hangCanvas.height = 208;
  const hangTex = keep(new THREE.CanvasTexture(hangCanvas)); hangTex.colorSpace = THREE.SRGBColorSpace; hangTex.anisotropy = GFX.aniso;
  const hangMat = cloth({ map: hangTex, normalMap: linen(2) });
  hangMat.onBeforeCompile = (sh) => {      // each instance shows its own tile of the atlas
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.x = (aTile + 0.006 + clamp(vMapUv.x, 0.0, 1.0) * 0.988) / ${TILES}.0;\n#endif`);
  };
  hangMat.customProgramCacheKey = () => 'lists-hanging';
  const hostMat = cloth({ side: THREE.DoubleSide, normalMap: linen(2) });
  const M = {
    timber: std(Object.assign({ color: new THREE.Color(1.5, 1.42, 1.3) }, wood)),
    paint_a: std({ color: V.tilt[0], normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, roughness: 0.85 }),
    paint_b: std({ color: V.tilt[1], normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, roughness: 0.85 }),
    canvas_a: awning(V.awn), canvas_b: awning(V.awn2), canvas_r: awning(royal),
    cloth_tilt: cloth({ map: keep(stripes(V.tilt[0], V.tilt[1])) }),
    cloth_a: cloth({ color: V.tilt[0] }), cloth_b: cloth({ color: V.tilt[1] }), carpet: cloth({ color: '#6d2430', side: THREE.FrontSide }),
    damask: cloth({ map: keep(damask()), roughness: 0.7, metalness: 0.15 }),
    gold: std({ color: 0xd9b23c, metalness: 1, roughness: 0.36, envMapIntensity: 1 }),
    board: std({ map: keep(chequeBoard(V.tilt[0], V.tilt[1])), roughness: 0.9 }),
    hanging: hangMat, host_arms: hostMat,
  };
  const NOSHADOW = new Set(['hanging', 'host_arms', 'board', 'carpet']);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  /** A placement: position, turn about y, optional scale along the piece's own z. */
  const at = (x, y, z, ry = 0, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(UP, ry).clone(), new THREE.Vector3(1, 1, sz));
  /** Instance a piece at the matrices. opt: { remap: { from: to } material names, only: [names], skip: [names], into: group }. Returns the meshes. */
  function put(name, mats, opt = {}) {
    const out = [], prims = lib.get(name); if (!prims || !mats.length) return out;
    for (const p of prims) {
      if ((opt.only && !opt.only.includes(p.mat)) || (opt.skip && opt.skip.includes(p.mat))) continue;
      const mat = M[(opt.remap && opt.remap[p.mat]) || p.mat] || M.timber;
      const im = new THREE.InstancedMesh(p.geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox();
      im.castShadow = !NOSHADOW.has(p.mat); im.receiveShadow = true; im.name = name + ':' + p.mat;
      (opt.into || group).add(im); out.push(im);
    }
    return out;
  }
  const PI = Math.PI;
  // ---- the stands: fourteen bays of 5 m a side; on the east the two middle bays are the royal box
  const X0 = 12.5, east = [], west = [], hangs = [], tile = [];
  for (let i = 0; i < 14; i++) { const zc = -32.5 + 5 * i; if (Math.abs(zc) > 5) east.push(at(X0, 0, zc)); west.push(at(-X0, 0, zc, PI)); }
  put('stand_bay', east.concat(west), { skip: ['canvas_a'] }); put('stand_bay', east, { only: ['canvas_a'] }); put('stand_bay', west, { only: ['canvas_a'], remap: { canvas_a: 'canvas_b' } });
  for (const [nm, z] of [['stand_end_a', 35], ['stand_end_b', -35]]) {
    put(nm, [at(X0, 0, z), at(-X0, 0, -z, PI)], { skip: ['canvas_a'] }); put(nm, [at(X0, 0, z)], { only: ['canvas_a'] }); put(nm, [at(-X0, 0, -z, PI)], { only: ['canvas_a'], remap: { canvas_a: 'canvas_b' } });
  }
  put('royal_box', [at(X0, 0, 0)], { remap: { canvas_a: 'canvas_a' } });
  for (let i = 0; i < 28; i++) { const z = -33.75 + 2.5 * i; hangs.push(at(X0 - 0.02, 2.235, z)); tile.push(i % TILES); hangs.push(at(-X0 + 0.02, 2.235, z, PI)); tile.push((i + 4) % TILES); }
  for (const im of put('hanging', hangs)) im.geometry = im.geometry.clone().setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(tile), 1));
  // ---- the judges' stand (its own group: raycasts pass through it, as the camera's line-of-sight check ignored the old one)
  const judges = new THREE.Group(); judges.name = 'judgesStand'; group.add(judges);
  for (const im of put('judges_stand', [at(8.7, 0, 0)], { into: judges })) im.raycast = () => {};
  // ---- the tilt and its end posts
  const tiltG = new THREE.Group(); group.add(tiltG);
  const secs = []; for (let i = 0; i < 32; i++) secs.push(at(0, 0, -31 + 2 * i));
  put('tilt', secs, { into: tiltG }); put('tilt_end', [at(0, 0, 32), at(0, 0, -32, PI)], { into: tiltG });
  // ---- the fence: 3 m panels down the sides, two stretched panels each side of the gates, a post to end each run; the gates
  const fen = [], posts = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 34; i++) fen.push(at(sx * 9.5, 0, -49.5 + 3 * i));
    posts.push(at(sx * 9.5, 0, 51));
    for (const sz of [-1, 1]) for (const k of [0, 1]) fen.push(at(sx * (3 + 3.25 * k + 1.625), 0, sz * 51, PI / 2 * sx, 6.5 / 6));      // (panel z -1.5..1.5 lies along x; its post at the gate side)
  }
  put('fence', fen); put('fence_post', posts); put('gate', [at(0, 0, 51), at(0, 0, -51, PI)]);
  // ---- the dais, the marshal's stage, racks and blocks
  put('dais', [at(0, 0, 0)]); put('marshal_stand', [at(-7.6, 0, 0)]);
  put('lance_rack', [at(8, 0, 41), at(-8, 0, -41, PI)]); put('mount_block', [at(7, 0, 36), at(-7, 0, -36, PI)]);

  // ---- waving banners (world.js's own): pennons on the stands' posts, the royal pavilion, the gate posts and the ends of the tilt
  const flags = [];
  if (o.addBanner) {
    for (const side of [1, -1]) for (let i = 0; i < 6; i++) { const z = [-27.5, -17.5, -7.5, 7.5, 17.5, 27.5][i]; flags.push(o.addBanner(side * (X0 - 0.22), z, 9.3, 1.5, 0.7, i + (side > 0 ? 1 : 5), side > 0 ? 0 : PI)); }
    flags.push(o.addBanner(X0 + 0.55, -4.75, 11.9, 1.9, 1.1, 0, 0), o.addBanner(X0 + 0.55, 4.75, 11.9, 1.9, 1.1, 5, 0));
    for (const sz of [-1, 1]) { flags.push(o.addBanner(-3, sz * 51, 5.3, 1.2, 0.55, 2, PI / 2), o.addBanner(3, sz * 51, 5.3, 1.2, 0.55, 6, PI / 2), o.addBanner(0, sz * 32.1, 4.3, 1.0, 0.45, sz > 0 ? 3 : 7, PI / 2)); }
  }

  const L = { group, judges, flags, materials: M };
  L.setTilt = (on) => { tiltG.visible = !!on; };
  /** Repaint the hangings' atlas from up to 8 coats of arms (they repeat down the stands). */
  L.setHangings = (arms) => {
    const g = hangCanvas.getContext('2d'), w = 256, h = hangCanvas.height; L.hangArms = arms;
    for (let i = 0; i < TILES; i++) {
      const a = arms[i % arms.length];
      g.save(); g.translate(i * w, 0); g.beginPath(); g.rect(0, 0, w, h); g.clip(); drawArms(g, w, h, a);
      const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0.0)'); sh.addColorStop(0.9, 'rgba(0,0,0,0.0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5); g.strokeStyle = 'rgba(217,178,60,0.9)'; g.lineWidth = 2; g.strokeRect(7, 7, w - 14, h - 14);      // a sewn border
      g.restore();
    }
    hangTex.needsUpdate = true;
  };
  /** The host's arms on the royal box and the cloth of estate. */
  L.setHostArms = (arms) => { if (hostMat.map) hostMat.map.dispose(); hostMat.map = armsTexture(arms, 256, 256); hostMat.needsUpdate = true; L.hostArms = arms; };
  L.setHangings(o.arms && o.arms.length ? o.arms : [{ c1: '#a01c1c', c2: '#e8d9a0', pattern: 'pale' }]);
  L.setHostArms(o.hostArms || (o.arms && o.arms[0]) || { c1: '#a01c1c', c2: '#e8d9a0', pattern: 'pale' });
  L.dispose = () => {
    parent.remove(group); if (LISTS.current === L) LISTS.current = null;
    group.traverse((m) => { if (m.isInstancedMesh) { m.dispose(); if (m.geometry.attributes.aTile) m.geometry.dispose(); } });      // (the pieces' geometries are the library's and stay)
    for (const x of own) x.dispose(); if (hostMat.map) hostMat.map.dispose();
  };
  LISTS.on = true; LISTS.current = L;
  return L;
}
