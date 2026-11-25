import * as THREE from 'three';
import { TAU, clamp, lerp, smoothstep, damp, loft, loftMesh, limb, ball, box, armsTexture, canvasTex, wobble, photoTex } from './util.js';
import { makePBR } from './texgen.js';
import { PHYS } from './data.js';
import { lanceRadius } from './physics.js';
import { Cap, Obb, Hit, capCapGap, capObbGap, closestSegSeg, SS } from './collide.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { touchMode } from './touch.js';
import { GFX } from './gfx.js';
import { expect, progress, done } from './loadmeter.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The rigged horse (Quaternius, CC0). Loaded once; every rider gets his own skinned copy.
// If it is missing the code-built horse is used instead.
let HORSE_MODEL = null;
const MODEL_SCALE = 0.52, MODEL_Z = -0.1;
const SEAT_BACK = -0.08;      // the saddle sits this far (horse units) behind where the code-built one did: the rigged horse's shoulders are wider and higher, and the knees pushed into them
const SEAT_RISE = 0.16;       // m: pelvis above the horse's back (saddle tree, pad and the padding of the armoured thigh) — measured, see shots/horses/probe.js
let MODEL_WITHERS = 0;
/** Height of the rigged horse's withers above the ground at scale 1 (metres, after MODEL_SCALE), measured once from its idle pose: the top of the
 *  spine over the shoulder bone (the coat mesh only, so the mane is not counted) above the lowest hoof. */
function modelWithers() {
  if (MODEL_WITHERS) return MODEL_WITHERS;
  const m = cloneSkinned(HORSE_MODEL.scene); m.scale.setScalar(MODEL_SCALE);
  const mx = new THREE.AnimationMixer(m), c = HORSE_MODEL.animations.find(a => a.name === 'Idle'); if (c) mx.clipAction(c).play(); mx.update(0);
  m.updateMatrixWorld(true);
  const v = new THREE.Vector3(); let ground = 1e9, top = 0;
  // the withers stand over the point of the shoulder; the idle pose's top line has no peak to find (it climbs straight into the neck), so take the bone
  const sh = m.getObjectByName('FrontShoulderL'), zs = sh ? sh.getWorldPosition(v.clone()).z : 0.7;
  m.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const coat = o.material.name === 'Main', P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); ground = Math.min(ground, v.y);
      if (coat && Math.abs(v.x) < 0.12 && Math.abs(v.z - zs) < 0.06) top = Math.max(top, v.y);
    }
  });
  return MODEL_WITHERS = top - ground;
}
const DRAPE_FIT = new Map();   // caparison fit per horse scale + girth: the rigged horse's top and half-width under each drape point
// horse_smooth.glb: the Quaternius horse welded, subdivided twice and smooth-shaded in Blender (13 Nov), one coat material; same rig and clips.
export async function preloadHorse(url = 'assets/models/horse_smooth.glb') {
  expect('horse', 'boot', 2.6e6); expect('knight', 'boot', 2.2e6);
  const knight = preloadKnight();      // (both models download side by side)
  try { HORSE_MODEL = await new GLTFLoader().loadAsync(url, (e) => progress('horse', e)); } catch (e) { HORSE_MODEL = null; console.warn('horse model unavailable, using the built-in horse', e); }
  done('horse');
  await knight;
  return !!HORSE_MODEL;
}

// The knight's plate (modelled in Blender, 13 Nov): KnightLegs in the rider's frame (hips, fauld, tassets, cuisses, poleyns, greaves,
// sabatons) and KnightTorso in the torso's frame (breast and back, plackart, gorget, pauldrons, arms, couters, gauntlets).
// Each is merged into one geometry; the code-built tubes they replace are kept as the fallback.
let KNIGHT_PARTS = null;
export async function preloadKnight(url = 'assets/models/knight_plate.glb') {
  try {
    const g = await new GLTFLoader().loadAsync(url, (e) => progress('knight', e)); g.scene.updateMatrixWorld(true);
    // part(name, skip): merge a group in its own frame (or in the frame of `frame`), leaving out the subtree called `skip`
    const part = (name, skip, frame = name) => {
      const root = g.scene.getObjectByName(name), fr = g.scene.getObjectByName(frame); if (!root || !fr) return null;
      const inv = new THREE.Matrix4().copy(fr.matrixWorld).invert(), geos = [];
      const walk = (o) => {
        if (skip && o.name === skip) return;
        if (o.isMesh) { const ge = o.geometry.clone(); for (const k of Object.keys(ge.attributes)) if (k !== 'position' && k !== 'normal') ge.deleteAttribute(k); ge.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); geos.push(ge.index ? ge.toNonIndexed() : ge); }
        for (const c of o.children) walk(c);
      };
      walk(root);
      if (!geos.length) return null;
      const m = mergeGeometries(geos);
      // box-projected UVs (the glb UVs were dropped): the steel maps already repeat 3x, so ~1 uv per metre
      if (m) {
        const P = m.attributes.position, N = m.attributes.normal, uv = new Float32Array(P.count * 2), K = 3.4;   // UV per metre: the same scratch density as the code-built helm (its loft UVs give ~3–4 per metre round and ~10 up)
        for (let i = 0; i < P.count; i++) {
          const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i)), x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          if (nx >= ny && nx >= nz) { uv[i * 2] = z * K; uv[i * 2 + 1] = y * K; } else if (ny >= nz) { uv[i * 2] = x * K; uv[i * 2 + 1] = z * K; } else { uv[i * 2] = x * K; uv[i * 2 + 1] = y * K; }
        }
        m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      return m;
    };
    // KnightCore (breast, back, plackart) is its own piece so the livery can replace it on jupon / surcoat riders
    KNIGHT_PARTS = { legs: part('KnightLegs'), torso: part('KnightTorso', 'KnightCore'), core: part('KnightCore', null, 'KnightTorso') };
    if (!KNIGHT_PARTS.legs || !KNIGHT_PARTS.torso) KNIGHT_PARTS = null;
  } catch (e) { KNIGHT_PARTS = null; console.warn('knight model unavailable, using the built-in knight', e); }
  done('knight');
}

const BY = 1.22;                 // barrel centre height (body pivot)
export const LANCE_REACH = 2.8;  // grip -> tip
const LANCE_SPLIT = 1.0;         // where the lance snaps

const TEXN = GFX.halfTex ? 256 : 512;      // the tier's texture size (low: half)
const pbr = (kind, repeat, strength = 1, size = 512) => { try { return makePBR(kind, { repeat, strength, size }); } catch (e) { return {}; } };
const nScale = (m, s) => { if (m.normalMap) m.normalScale = new THREE.Vector2(s, s); return m; };
const T_STEEL = pbr('steel', [3, 3]), T_LEATHER = pbr('leather', [3, 3]), T_MAIL = pbr('mail', [7, 9]), T_WOOD = pbr('wood', [1, 4]);
// Horse coat, mane/tail hair and caparison weave: generated once (texgen caches the canvases), only where the tier can afford them. Low keeps plain materials.
const FANCY = GFX.tier !== 'low';
const T_COAT = FANCY ? pbr('coat', [3, 4], 1, TEXN) : {}, T_MANE = FANCY ? pbr('mane', [2, 2], 1, TEXN) : {}, T_CLOTH = FANCY ? pbr('cloth', [9, 9], 1, TEXN) : {};

// The rigged horse has no UVs: project them from its own bind-pose positions (dominant normal axis), ~7 repeats nose to tail.
const HORSE_UV = new WeakMap();      // source geometry -> geometry with uv
let HORSE_UV_SCALE = 0;              // uv units per model unit
const COAT_TEX = {};                 // repeat-1 copies of the coat maps (the uv already carries the repeats)
function coatTex(key, set = T_COAT, name = 'coat') {
  const k = name + key;
  if (COAT_TEX[k] === undefined) {
    const t = set[key]; COAT_TEX[k] = t ? t.clone() : null;
    if (t) { COAT_TEX[k].repeat.set(1, 1); COAT_TEX[k].wrapS = COAT_TEX[k].wrapT = THREE.RepeatWrapping; COAT_TEX[k].needsUpdate = true; }
  }
  return COAT_TEX[k];
}
// Points: a vertex-colour multiplier on the coat (bind pose, model units: y up, z forward, hooves at y 0, belly ~y 1.9, ears ~y 4.5).
// Lower legs darken to the mane colour (black points on a bay), ear tips and the face a little; with `socks` the hind pasterns go pale.
const POINTS = new WeakMap();
function pointsGeo(geo, H) {
  const key = (H.coat ?? 0x5a3620) + '|' + (H.mane ?? 0x15110e) + '|' + !!H.socks;
  let m = POINTS.get(geo); if (!m) POINTS.set(geo, m = new Map());
  let g = m.get(key); if (g) return g;
  g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index); geo.groups.forEach(gr => g.addGroup(gr.start, gr.count, gr.materialIndex));
  const c = new THREE.Color(H.coat ?? 0x5a3620), mn = new THREE.Color(H.mane ?? 0x15110e), sock = new THREE.Color(0xe8e2d6);
  const pt = [Math.min(1.1, mn.r / Math.max(c.r, 0.02)), Math.min(1.1, mn.g / Math.max(c.g, 0.02)), Math.min(1.1, mn.b / Math.max(c.b, 0.02))];
  const pw = [Math.min(4.5, sock.r / Math.max(c.r, 0.02)), Math.min(4.5, sock.g / Math.max(c.g, 0.02)), Math.min(4.5, sock.b / Math.max(c.b, 0.02))];
  const P = geo.attributes.position, col = new Float32Array(P.count * 3), ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = Math.abs(x);
    let leg = ss(1.75, 1.05, y);                                              // 0 at the belly line, 1 below the knee / hock
    let ear = ss(4.28, 4.55, y) * ss(3.0, 3.5, z) * 0.6;                       // tips of the ears
    let face = ss(3.0, 3.35, z) * ss(4.2, 3.7, y) * 0.35;                      // the nose end of the head
    let w = Math.max(leg, ear, face);
    const sk = H.socks && z < 0.6 && y < 0.95 ? ss(0.95, 0.6, y) : 0;         // hind socks
    for (let k = 0; k < 3; k++) { let v = 1 + (pt[k] - 1) * w; v = v + (pw[k] - v) * sk; col[i * 3 + k] = v * (1 + 0.04 * Math.sin(i * 12.9898)); }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.set(key, g); return g;
}
function horseUVs(scene) {
  if (!HORSE_UV_SCALE) {
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    scene.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox); bb.union(tmp); } });
    const s = bb.getSize(new THREE.Vector3()), len = Math.max(s.x, s.y, s.z);
    HORSE_UV_SCALE = len > 0 ? 7 / len : 1;
  }
  return (geo) => {
    let g = HORSE_UV.get(geo); if (g) return g;
    g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(geo.index); geo.groups.forEach(gr => g.addGroup(gr.start, gr.count, gr.materialIndex));
    const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2), k = HORSE_UV_SCALE;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N ? Math.abs(N.getX(i)) : 1, ny = N ? Math.abs(N.getY(i)) : 0, nz = N ? Math.abs(N.getZ(i)) : 0;
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
      uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    HORSE_UV.set(geo, g); return g;
  };
}

// Phones: polished steel is lit almost only by the sky's reflection, and many phone GPUs cannot render that reflection (half-float
// targets), so pure metal comes out black. On touch the steel keeps part of an ordinary diffuse colour, so the sun and sky light it anyway.
const phoneMetal = (m) => { if (touchMode && m.metalness > 0.5) { m.metalness = 0.5; m.roughness = Math.max(m.roughness, 0.38); } return m; };
const steelDS = phoneMetal(nScale(new THREE.MeshStandardMaterial({ color: 0xaeb4bd, metalness: 1, roughness: 0.4, envMapIntensity: 1.15, side: THREE.DoubleSide, normalMap: T_STEEL.normalMap, roughnessMap: T_STEEL.roughnessMap }), 0.35));
const darkSteel = phoneMetal(new THREE.MeshStandardMaterial({ color: 0x4d5158, metalness: 1, roughness: 0.42 }));
const gold = phoneMetal(new THREE.MeshStandardMaterial({ color: 0xd9a93a, metalness: 1, roughness: 0.28, envMapIntensity: 1.2 }));
const leather = nScale(new THREE.MeshStandardMaterial({ color: 0x6b4630, map: photoTex('brown_leather', 'diff', [3, 3]), roughness: 0.95, envMapIntensity: 0.5, normalMap: photoTex('brown_leather', 'nor_gl', [3, 3]), roughnessMap: photoTex('brown_leather', 'rough', [3, 3]) }), 1.0);
const black = new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 0.5 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.08, envMapIntensity: 1.5 });
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 0.45 });
const woodPale = new THREE.MeshStandardMaterial({ color: 0xcdb58a, roughness: 0.7 });

// the points of an unhorsed rider that can strike the ground: [x, y, z in his own frame (origin at the seat), radius]
const FALL_PTS = [[0, 0.92, 0, 0.17], [0, 0.42, -0.02, 0.24], [0, -0.02, 0, 0.24], [0.3, -0.8, 0.14, 0.1], [-0.3, -0.8, 0.14, 0.1]];
const WALK_OFF = [0.25, 0.75, 0.0, 0.5];   // FL FR HL HR
const GALLOP_OFF = [0.40, 0.52, 0.0, 0.12];

const _v4 = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bv = new THREE.Vector3(), _bp = new THREE.Vector3(), _we = new THREE.Euler(), _wq = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
const _hm = new THREE.Matrix4(), _hm2 = new THREE.Matrix4(), _dv = new THREE.Vector3(), _hit = new Hit(), _cs = new Cap();
const _lm = new THREE.Matrix4(), _lm2 = new THREE.Matrix4(), _lp = new THREE.Vector3(), _lq = new THREE.Quaternion(), _ls = new THREE.Vector3();
/** Bounding box of a capsule over a frame (previous and current pose). */
function capBounds(p, c, lo, hi) {
  const r = c.r;
  lo[0] = Math.min(p.ax, p.bx, c.ax, c.bx) - r; lo[1] = Math.min(p.ay, p.by, c.ay, c.by) - r; lo[2] = Math.min(p.az, p.bz, c.az, c.bz) - r;
  hi[0] = Math.max(p.ax, p.bx, c.ax, c.bx) + r; hi[1] = Math.max(p.ay, p.by, c.ay, c.by) + r; hi[2] = Math.max(p.az, p.bz, c.az, c.bz) + r;
}

// cut > 0: the top corner on side sx (1 right, -1 left) is broken away in a jagged edge, cut = how much of the width
function heaterShape(cut = 0, sx = 1) {
  const s = new THREE.Shape(), a = cut;
  if (a > 0 && sx > 0) { s.moveTo(0, 1); s.lineTo(1 - a, 1); s.lineTo(1 - a * 0.55, 1 - a * 0.3); s.lineTo(1 - a * 0.75, 1 - a * 0.6); s.lineTo(1, 1 - a); }
  else if (a > 0) s.moveTo(a, 1), s.lineTo(1, 1);
  else s.moveTo(0, 1), s.lineTo(1, 1);
  s.lineTo(1, 0.58);
  s.bezierCurveTo(1, 0.3, 0.75, 0.1, 0.5, 0);
  s.bezierCurveTo(0.25, 0.1, 0, 0.3, 0, 0.58);
  if (a > 0 && sx < 0) { s.lineTo(0, 1 - a); s.lineTo(a * 0.75, 1 - a * 0.6); s.lineTo(a * 0.55, 1 - a * 0.3); }
  s.closePath();
  return s;
}
/** The bowed face of the shield (and, for the back plate, the flat extrusion), centred, from the shape above. */
function shieldFace(cut = 0, sx = 1) {
  const sg = new THREE.ShapeGeometry(heaterShape(cut, sx), 12); sg.translate(-0.5, -0.5, 0);
  const p = sg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -p.getX(i) * p.getX(i) * 0.22); sg.computeVertexNormals();
  return sg;
}
function shieldBack(cut = 0, sx = 1) { const eg = new THREE.ExtrudeGeometry(heaterShape(cut, sx), { depth: 0.03, bevelEnabled: false, curveSegments: 12 }); eg.translate(-0.5, -0.5, 0); return eg; }

/** Smooth tube through points with per-point radii (rx, optional ry). */
function tube(pts, mat, segs = 14, opts = {}) {
  return loftMesh(pts.map(p => ({ p: [p[0], p[1], p[2]], rx: p[3], ry: p[4] ?? p[3] })), mat, Object.assign({ segs }, opts));
}

const DM = PHYS.damage, _kv = new THREE.Vector3(), _dm = new THREE.Matrix4();
/** Push the vertices within R of c (geometry-local) inward by up to D, smoothly (a bowl), and tilt their normals to match the slope. */
function dentGeo(geo, c, R, D) {
  const P = geo.attributes.position, N = geo.attributes.normal; let hit = false;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), dx = x - c.x, dy = y - c.y, dz = z - c.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue;
    const u = Math.sqrt(d2) / R, w = 1 - u * u, h = D * w * w, nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    P.setXYZ(i, x - nx * h, y - ny * h, z - nz * h);
    const sl = -4 * D * u * w / R, tn = dx * nx + dy * ny + dz * nz;      // slope of the bowl; the outward tangent from the centre
    let tx = dx - tn * nx, ty = dy - tn * ny, tz = dz - tn * nz; const tl = Math.hypot(tx, ty, tz) || 1;
    tx = nx + sl * tx / tl; ty = ny + sl * ty / tl; tz = nz + sl * tz / tl; const nl = Math.hypot(tx, ty, tz) || 1;
    N.setXYZ(i, tx / nl, ty / nl, tz / nl); hit = true;
  }
  if (hit) P.needsUpdate = N.needsUpdate = true;
}

export class Jouster {
  constructor(scene, arms, dir, laneX, horse = {}, armour = {}) {
    this.scene = scene; this.arms = arms; this.dir = dir; this.lane = Math.abs(laneX); this.guard = 0; this.look = 0; this.manualPos = false; this.replaying = false; this.horseDef = horse; this.armourDef = armour;
    this.hs = HORSE_MODEL && horse.withers ? horse.withers / modelWithers() : (horse.scale ?? 1);      // the rigged horse is scaled so its withers stand at the breed's real height (data.js HORSES)
    this.root = new THREE.Group();
    this.root.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(this.root);
    this.speed = 0; this.phase = Math.random(); this.gait = 0; this.amp = 0; this.bob = 0;
    this.raise = 0; this.raiseT = 0;          // the lance held up to show he is ready (0..1, eased toward raiseT)
    this.visor = null; this.visorUp = false; this.helmOff = false; this._vk = 0; this._helmShown = false;   // visor hinge group (bascinet, armet only); visor swing 0..1; helm taken off
    this.lanceLower = 0; this.lean = 0; this.recoil = 0; this.recoilV = 0; this.sideRecoil = 0; this.sideRecoilV = 0;
    this.brace = 0; this.unhorsed = false; this.lanceBroken = false; this.rear = 0;
    this.twist = 0; this.twistV = 0; this.headK = 0; this.headV = 0; this.shK = 0; this.shV = 0; this.stag = 0; this.stagV = 0;
    this.aimLocal = new THREE.Vector3(0.3, 0.05, 1).normalize();
    this.prevLegPhase = [0, 0, 0, 0];
    this.onHoof = null; this.time = Math.random() * 10;
    this.fall = null; this.caps = [];
    this.cantle = 1; this.lock = 1; this._fxReset();      // the kit's saddle (main.js sets them per match): a high cantle stops a rider bending back, a locked seat throws him less
    // armour damage: each region 0..1; dlog = every blow that marked it (key orders it in time, for replays); see damage()
    this.dmg = { shield: 0, helm: 0, breast: 0, pauldronL: 0 }; this.dlog = []; this.askew = 0; this._vAsk = 0; this._vd = { shield: 0, helm: 0, breast: 0, pauldronL: 0 };
    this._vPlume = true; this._plumeGone = false; this._dirty = new Set(); this._shMarks = []; this._vN = 0; this._cut = 0; this._cutSide = 1; this._cloth = [];
    this._buildMaterials();
    this._buildHorse();
    if (HORSE_MODEL) this._attachModelHorse();
    // the horse's scale goes on before the rider is built: his hit volumes are placed in the finished frame
    const gx = this.hs * (horse.girth ?? 1);
    this.body.scale.set(gx, this.hs, this.hs); this.mount.scale.set(1 / gx, 1 / this.hs, 1 / this.hs);
    this.seatY = 1.71 * this.hs; if (this.hasModel) this._seatOnBack();
    this._buildRider();
    this.setPose(0);
  }

  _buildMaterials() {
    const a = this.arms, H = this.horseDef, AR = this.armourDef;
    const fancy = FANCY && GFX.tier !== 'low';      // low: plain materials
    this.fancy = fancy;
    this.coat = nScale(new THREE.MeshStandardMaterial({ color: H.coat ?? 0x5a3620, roughness: 0.5, envMapIntensity: 0.55, normalMap: T_COAT.normalMap, roughnessMap: T_COAT.roughnessMap }), 0.5);
    this.hair = new THREE.MeshStandardMaterial({ color: H.mane ?? 0x15110e, roughness: 0.7, envMapIntensity: 0.4, normalMap: T_COAT.normalMap });
    // the caparison: wool weave (fine normal + roughness 0.85-0.95, so no plastic gloss) and a faint fabric sheen at grazing angles
    const wool = (o) => { const m = fancy ? new THREE.MeshPhysicalMaterial(Object.assign({ sheen: 0.55, sheenRoughness: 0.6, sheenColor: new THREE.Color(o.color ?? 0xffffff).lerp(new THREE.Color(0xd8d0c0), 0.55) }, o)) : new THREE.MeshStandardMaterial(o); return m; };
    const tex = armsTexture(a, 512, 512, [1, 1]);
    const clothN = photoTex('rough_linen', 'nor_gl', [9, 9]);
    const weave = fancy && T_CLOTH.normalMap ? { normalMap: T_CLOTH.normalMap, roughnessMap: T_CLOTH.roughnessMap } : { normalMap: clothN };
    this.cloth = nScale(wool({ map: tex, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.3, ...weave }), 0.25);
    this.clothPlain = nScale(wool({ color: a.c1, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.3, ...weave }), 0.25);
    this.cloth2 = nScale(wool({ color: a.c2, roughness: 0.9, envMapIntensity: 0.3, ...weave }), 0.25);
    this.shieldMat = new THREE.MeshStandardMaterial({ map: armsTexture(a, 512, 512), roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
    this.lanceMat = new THREE.MeshStandardMaterial({
      map: canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = a.c1; g.fillRect(0, 0, w, h); g.fillStyle = a.c2;
        for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32 + 48); g.lineTo(w, i * 32 + 64); g.lineTo(0, i * 32 + 16); g.fill(); }
      }), roughness: 0.45, envMapIntensity: 0.6, normalMap: T_WOOD.normalMap,
    });
    this.armour = phoneMetal(nScale(new THREE.MeshStandardMaterial({ color: a.armourTint ?? AR.tint ?? 0xb4bac3, metalness: 1, roughness: (AR.rough ?? 0.24) + 0.06, envMapIntensity: 1.2, normalMap: T_STEEL.normalMap, roughnessMap: T_STEEL.roughnessMap }), 0.3));
    this.mail = phoneMetal(nScale(new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: 0.9, roughness: 0.55, envMapIntensity: 0.8, normalMap: T_MAIL.normalMap, map: T_MAIL.map }), 1.2));
    this.surcoat = nScale(new THREE.MeshStandardMaterial({ map: armsTexture(a, 256, 256, [2, 2]), roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3, normalMap: clothN }), 0.6);
    this.trim = new THREE.MeshStandardMaterial({ color: a.c2, roughness: 0.6, envMapIntensity: 0.5 });
  }

  // ------------------------------------------------------------ horse
  _drape(st, hemBase, opts = {}) {
    const d = this._drapeData(st, hemBase, opts), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setIndex(d.idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.cloth); m.castShadow = true; m.receiveShadow = true;
    this.inner.add(m);
    const cap = { geo: g, base: Float32Array.from(d.pos), wts: d.wts, n: 0 };
    this.caps.push(cap);
    (this._drapes ??= []).push({ mesh: m, cap, st, hem: hemBase, opts });
  }

  /** Caparison style: 'livery' (arms), 'plain' (one colour), 'half' (crupper only), 'none' (bare). Toggles the built meshes, so the fit and flutter code are untouched. */
  setCaparison(style = 'livery') {
    this.caparison = style;
    const D = this._drapes || [], front = D[0], rear = D[1], plain = style === 'plain';
    for (const x of D) if (x.mesh) x.mesh.material = plain ? this.clothPlain : this.cloth;
    if (front) front.mesh.visible = style === 'livery' || plain;
    if (rear) rear.mesh.visible = style !== 'none';
    for (const b of this._bosses || []) b.visible = style === 'livery';
  }

  /** Re-cut a built drape to new [z, topY, halfWidth] points (same vertex layout, so the flutter code keeps working). */
  _refitDrape(D, st) {
    const d = this._drapeData(st, D.hem, D.opts), pa = D.mesh.geometry.attributes.position;
    pa.array.set(d.pos); pa.needsUpdate = true; D.cap.base.set(d.pos); D.mesh.geometry.computeVertexNormals(); D.st = st;
  }

  _drapeData(st, hemBase, { closeStart = false, closeEnd = false, uRep = 1.6, hang = 0.3 } = {}) {
    const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(s[2], s[1], s[0])), false, 'catmullrom', 0.5);
    const NS = 28, pts = curve.getPoints(NS - 1);
    const ARC = 8, HANG = 8, half = ARC + HANG, cols = half * 2 + 1;
    const pos = [], uv = [], idx = [], wts = [];
    const z0 = st[0][0], z1 = st[st.length - 1][0];
    for (let i = 0; i < NS; i++) {
      const hw = pts[i].x, top = pts[i].y, z = pts[i].z, f = i / (NS - 1);
      let rise = 0;
      if (closeStart) rise = Math.max(rise, Math.pow(1 - f, 5));
      if (closeEnd) rise = Math.max(rise, Math.pow(f, 5));
      // The hem used to alternate 5.5 cm up / down every single row (a 2-sample sawtooth): too fine to read as a cut, so on screen it was a
      // frayed, clipped edge, and the flutter pulled the teeth about. Now one broad, smooth swell per fold of the cloth.
      const dag = (0.5 + 0.5 * Math.cos(z * 17 + hemBase * 9)) * 0.045 * (1 - rise);
      const hemY = lerp(hemBase + dag, top - hang - 0.12, rise * 0.55);
      for (let j = 0; j < cols; j++) {
        const k = j - half, s = Math.sign(k), a = Math.abs(k);
        let x, y, w = 0;
        if (a <= ARC) { const th = (a / ARC) * Math.PI / 2; x = Math.sin(th) * hw; y = top - (1 - Math.cos(th)) * hang; }
        else {
          const t = (a - ARC) / HANG;
          // broad hanging folds (two wavelengths, deeper toward the hem): the cloth has weight and drape, not a smooth skin
          x = hw * (1 + 0.1 * t) + 0.025 * t + (Math.sin(z * 11 + s * 1.3 + hemBase * 5) * 0.022 + Math.sin(z * 23 + s * 2.1) * 0.01) * t * (0.4 + 0.6 * t);
          y = lerp(top - hang, hemY, t); w = t;
        }
        pos.push(s * x, y, z); wts.push(w);
        uv.push((z - z0) / (z1 - z0) * uRep, j / (cols - 1) * 2.6);
      }
    }
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    return { pos, uv, idx, wts };
  }

  _buildHorse() {
    const body = this.body = new THREE.Group(); body.position.y = BY; this.root.add(body);
    const inner = this.inner = new THREE.Group(); inner.position.y = -BY; body.add(inner);
    const coat = this.coat;

    // barrel: croup, loin, girth, shoulder, chest
    inner.add(loftMesh([
      { p: [0, 1.30, -1.12], rx: 0.06, ry: 0.09 },
      { p: [0, 1.29, -1.04], rx: 0.23, ry: 0.27 },
      { p: [0, 1.275, -0.86], rx: 0.325, ry: 0.36 },
      { p: [0, 1.27, -0.62], rx: 0.345, ry: 0.375 },
      { p: [0, 1.245, -0.34], rx: 0.335, ry: 0.35 },
      { p: [0, 1.215, -0.05], rx: 0.345, ry: 0.355 },
      { p: [0, 1.225, 0.22], rx: 0.345, ry: 0.375 },
      { p: [0, 1.25, 0.46], rx: 0.325, ry: 0.395 },
      { p: [0, 1.275, 0.66], rx: 0.295, ry: 0.375 },
      { p: [0, 1.30, 0.82], rx: 0.225, ry: 0.30 },
      { p: [0, 1.33, 0.93], rx: 0.09, ry: 0.13 },
    ], coat, { segs: 24 }));
    // pectorals and haunches give the trunk some anatomy under the cloth
    for (const s of [-1, 1]) {
      inner.add(ball([s * 0.13, 1.14, 0.82], 0.16, coat, [1, 1.25, 0.9]));
      inner.add(ball([s * 0.2, 1.22, -0.72], 0.25, coat, [0.8, 1.2, 1.25]));
      inner.add(ball([s * 0.2, 1.2, 0.56], 0.2, coat, [0.75, 1.3, 1.1]));
    }

    // neck
    const neck = this.neck = new THREE.Group(); neck.position.set(0, 1.40, 0.60); inner.add(neck);
    const neckRings = [
      { p: [0, -0.1, -0.08], rx: 0.22, ry: 0.36 },
      { p: [0, 0.14, 0.12], rx: 0.175, ry: 0.29 },
      { p: [0, 0.38, 0.29], rx: 0.135, ry: 0.225 },
      { p: [0, 0.6, 0.43], rx: 0.112, ry: 0.175 },
      { p: [0, 0.76, 0.52], rx: 0.1, ry: 0.14 },
      { p: [0, 0.83, 0.56], rx: 0.085, ry: 0.11 },
    ];
    neck.add(loftMesh(neckRings, coat, { segs: 18 }));
    // crinet: articulated steel lames along the crest, with the mane showing below on the near side
    const crestRings = neckRings.slice(0, 5);
    for (let i = 0; i < crestRings.length - 1; i++) {
      const a = crestRings[i], b = crestRings[i + 1];
      const mid = { p: a.p.map((v, k) => lerp(v, b.p[k], 1.08)), rx: lerp(a.rx, b.rx, 1.08) + 0.012, ry: lerp(a.ry, b.ry, 1.08) + 0.012 };
      neck.add(loftMesh([{ p: a.p, rx: a.rx + 0.03, ry: a.ry + 0.032 }, mid], steelDS, { segs: 10, arc: [0.2 * Math.PI, 0.6 * Math.PI], caps: false }));
    }
    for (let i = 0; i < 9; i++) {
      const t = i / 8, y = 0.02 + t * 0.7, z = 0.02 + t * 0.47;
      const m = ball([0.085 - t * 0.03, y - 0.02, z - 0.18 + t * 0.04], 0.06, this.hair, [0.35, 1.9, 1.0]); m.rotation.x = -0.55; m.rotation.z = -0.25; neck.add(m);
    }

    // head
    const head = this.head = new THREE.Group(); head.position.set(0, 0.8, 0.54); neck.add(head);
    const headRings = [
      { p: [0, 0.07, -0.08], rx: 0.085, ry: 0.09 },
      { p: [0, 0.03, 0.02], rx: 0.112, ry: 0.135 },
      { p: [0, -0.06, 0.15], rx: 0.118, ry: 0.165 },
      { p: [0, -0.19, 0.3], rx: 0.098, ry: 0.132 },
      { p: [0, -0.33, 0.45], rx: 0.078, ry: 0.098 },
      { p: [0, -0.44, 0.565], rx: 0.074, ry: 0.086 },
      { p: [0, -0.485, 0.615], rx: 0.058, ry: 0.066 },
      { p: [0, -0.5, 0.635], rx: 0.02, ry: 0.025 },
    ];
    head.add(loftMesh(headRings, coat, { segs: 16 }));
    // chanfron: a shaped plate down the face, flared over the eyes
    head.add(loftMesh(headRings.slice(0, 6).map((r, i) => ({ p: r.p, rx: r.rx + 0.014 + (i === 1 ? 0.012 : 0), ry: r.ry + 0.016 })), steelDS, { segs: 12, arc: [0.27 * Math.PI, 0.46 * Math.PI], caps: false }));
    const rondel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), gold); rondel.position.set(0, 0.075, 0.2); rondel.rotation.x = 0.82 + Math.PI / 2; head.add(rondel);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.13, 8), gold); spike.position.set(0, 0.125, 0.245); spike.rotation.x = 0.82; head.add(spike);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.15, 8), coat); ear.position.set(s * 0.062, 0.17, -0.07); ear.rotation.set(0.25, 0, -s * 0.22); ear.castShadow = true; head.add(ear);
      head.add(ball([s * 0.108, -0.005, 0.105], 0.026, eyeMat));
      head.add(ball([s * 0.043, -0.475, 0.628], 0.017, black, [1, 1.3, 0.8]));
      // cheek strap + rein ring
      head.add(limb([s * 0.105, 0.03, -0.03], [s * 0.079, -0.4, 0.51], 0.008, 0.008, leather, 5));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12), gold); ring.position.set(s * 0.082, -0.41, 0.52); ring.rotation.y = Math.PI / 2; head.add(ring);
    }
    const nose = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.009, 6, 18), leather); nose.position.set(0, -0.35, 0.47); nose.rotation.x = 0.93; nose.scale.set(0.95, 1.2, 1); head.add(nose);
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.008, 6, 18, Math.PI), leather); brow.position.set(0, 0.025, 0.0); brow.rotation.set(0.9, 0, 0); head.add(brow);
    head.add(ball([0, 0.13, 0.0], 0.05, this.hair, [0.9, 0.9, 1.6]));   // forelock
    this.bit = [new THREE.Object3D(), new THREE.Object3D()];
    this.bit[0].position.set(0.085, -0.41, 0.52); this.bit[1].position.set(-0.085, -0.41, 0.52); head.add(...this.bit);

    // tail
    const tail = this.tail = new THREE.Group(); tail.position.set(0, 1.37, -1.08); inner.add(tail);
    tail.add(loftMesh([
      { p: [0, 0.03, 0.03], rx: 0.045, ry: 0.045 },
      { p: [0, -0.14, -0.13], rx: 0.075, ry: 0.07 },
      { p: [0, -0.46, -0.22], rx: 0.1, ry: 0.085 },
      { p: [0, -0.82, -0.23], rx: 0.085, ry: 0.07 },
      { p: [0, -1.04, -0.2], rx: 0.045, ry: 0.04 },
      { p: [0, -1.14, -0.17], rx: 0.008, ry: 0.008 },
    ], this.hair, { segs: 12 }));

    // legs
    this.legs = [];
    const sock = this.horseDef.socks ? new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 }) : coat;
    const mkLeg = (x, z, hipY, L1, L2, L3, hind) => {
      const upper = new THREE.Group(); upper.position.set(x, hipY, z); inner.add(upper);
      const r0 = hind ? 0.14 : 0.11, r1 = hind ? 0.066 : 0.062;
      upper.add(loftMesh([
        { p: [0, 0.12, 0], rx: r0 * 0.8, ry: r0 * 1.2 },
        { p: [0, -L1 * 0.25, hind ? -0.01 : 0.01], rx: r0 * 0.88, ry: r0 * 1.1 },
        { p: [0, -L1 * 0.7, 0], rx: r1 * 1.12, ry: r1 * 1.3 },
        { p: [0, -L1 * 0.93, 0], rx: r1 * 1.02, ry: r1 * 1.12 },
        { p: [0, -L1, 0], rx: r1 * 1.1, ry: r1 * 1.2 },
      ], coat, { segs: 12 }));
      const lower = new THREE.Group(); lower.position.y = -L1; upper.add(lower);
      lower.add(ball([0, 0, 0], r1 * 1.15, coat, [1, 1.1, 1.15]));
      lower.add(loftMesh([
        { p: [0, 0.02, 0], rx: r1 * 0.95, ry: r1 * 1.05 }, { p: [0, -L2 * 0.3, 0], rx: 0.043, ry: 0.05 },
        { p: [0, -L2 * 0.8, 0], rx: 0.041, ry: 0.047 }, { p: [0, -L2, 0], rx: 0.052, ry: 0.058 },
      ], coat, { segs: 10 }));
      const hoof = new THREE.Group(); hoof.position.y = -L2; lower.add(hoof);
      hoof.add(ball([0, 0, 0], 0.054, sock));
      hoof.add(limb([0, 0, 0], [0, -L3 + 0.09, 0.035], 0.045, 0.054, sock, 10));
      hoof.add(limb([0, -L3 + 0.1, 0.035], [0, -L3, 0.055], 0.058, 0.082, hoofMat, 14));
      this.legs.push({ upper, lower, hoof, hind });
    };
    mkLeg(0.17, 0.56, 0.98, 0.42, 0.36, 0.20, false);
    mkLeg(-0.17, 0.56, 0.98, 0.42, 0.36, 0.20, false);
    mkLeg(0.2, -0.62, 1.02, 0.50, 0.38, 0.165, true);
    mkLeg(-0.2, -0.62, 1.02, 0.50, 0.38, 0.165, true);

    // caparison in two pieces (front and crupper), as cut for the joust
    this._drape([[0.2, 1.665, 0.39], [0.36, 1.675, 0.395], [0.56, 1.69, 0.37], [0.78, 1.66, 0.31], [0.93, 1.56, 0.2], [1.01, 1.44, 0.08]], 0.56, { closeEnd: true, uRep: 1.2 });
    this._drape([[-1.19, 1.38, 0.07], [-1.1, 1.56, 0.24], [-0.92, 1.655, 0.36], [-0.66, 1.685, 0.4], [-0.42, 1.655, 0.395], [-0.26, 1.635, 0.39]], 0.6, { closeStart: true, uRep: 1.3 });
    // gilded hem bosses along the collar of the front piece
    this._bosses = [];
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2, b = ball([Math.sin(a) * 0.4, 1.66 - (1 - Math.cos(a)) * 0.3, 0.215], 0.018, gold); inner.add(b); this._bosses.push(b); }

    // saddle cloth, girth and war saddle
    inner.add(loftMesh([
      { p: [0, 1.25, -0.27], rx: 0.375, ry: 0.4 }, { p: [0, 1.235, 0.0], rx: 0.378, ry: 0.4 }, { p: [0, 1.25, 0.24], rx: 0.378, ry: 0.415 },
    ], this.clothPlain, { segs: 20, arc: [0.02 * Math.PI, 0.96 * Math.PI], caps: false }));
    inner.add(loftMesh([{ p: [0, 1.235, 0.1], rx: 0.36, ry: 0.385 }, { p: [0, 1.24, 0.19], rx: 0.36, ry: 0.39 }], leather, { segs: 20, caps: false }));
    // the war saddle, the rider's seat and the lance-rest pommel ride in `tack`: _seatOnBack() lifts it to rest on the rigged horse's back
    const tack = this.tack = new THREE.Group(); inner.add(tack);       // seat and pommel marks
    const saddle = this.saddle = new THREE.Group(); inner.add(saddle);   // the leather itself, which rests on the back (the rider sits a little above it, the thigh padding between)
    saddle.add(loftMesh([
      { p: [0, 1.665, -0.38], rx: 0.05, ry: 0.03 }, { p: [0, 1.67, -0.28], rx: 0.23, ry: 0.065 },
      { p: [0, 1.655, 0.0], rx: 0.21, ry: 0.058 }, { p: [0, 1.675, 0.3], rx: 0.21, ry: 0.065 }, { p: [0, 1.675, 0.39], rx: 0.05, ry: 0.03 },
    ], leather, { segs: 14 }));
    saddle.add(ball([0, 1.82, -0.34], 0.27, leather, [1, 0.78, 0.2]));     // high cantle
    saddle.add(ball([0, 1.8, 0.37], 0.215, leather, [1, 0.72, 0.22]));     // pommel / bow
    saddle.add(ball([0, 1.8, 0.4], 0.2, this.armour, [0.96, 0.66, 0.1]));  // steel bow plate

    this.mount = new THREE.Group(); this.mount.position.set(0, 1.71, -0.02); tack.add(this.mount);
    // reins (re-posed every frame between the bit and the bridle hand)
    this.reins = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 5), leather); m.castShadow = true; this.root.add(m); return m; });
    this.pommel = new THREE.Object3D(); this.pommel.position.set(0, 1.86, 0.36); tack.add(this.pommel);
  }

  /** Swap the code-built body, legs, neck, head and tail for the rigged model; keep saddle, cloth, rider and hit zones. */
  _attachModelHorse() {
    const m = this.model = cloneSkinned(HORSE_MODEL.scene), H = this.horseDef;
    const coat = new THREE.Color(H.coat ?? 0x5a3620), mane = new THREE.Color(H.mane ?? 0x15110e);
    if (this.fancy && coat.r + coat.g + coat.b < 1.0) coat.multiplyScalar(0.86);      // the coat texture's own tonal variation sits on a slightly deeper base (bay, not orange); greys are left alone
    const uvOf = horseUVs(HORSE_MODEL.scene), nm = coatTex('normalMap'), rm = coatTex('roughnessMap');
    m.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const n = o.material.name, mat = o.material = o.material.clone();
      if (n === 'Main') mat.color.copy(coat);
      else if (n === 'Main_Light') mat.color.copy(coat).offsetHSL(0, 0, H.socks ? 0.4 : 0.07);
      else if (n === 'Main_Dark') mat.color.copy(coat).multiplyScalar(0.72);
      else if (n === 'Hair') mat.color.copy(mane);
      else if (n === 'Muzzle') mat.color.copy(coat).multiplyScalar(0.5);
      else if (n === 'Hooves') mat.color.set(0x241d17);
      mat.roughness = 0.62; mat.metalness = 0; mat.envMapIntensity = 0.5;
      // the coat: short hair catches the light at grazing angles (sheen), which is what stops a smooth horse looking like plastic
      if (n === 'Main' || n === 'Muzzle') o.material = new THREE.MeshPhysicalMaterial({ name: n, color: mat.color, roughness: 0.58, metalness: 0, envMapIntensity: 0.45,
        sheen: 0.55, sheenRoughness: 0.42, sheenColor: mat.color.clone().offsetHSL(0, -0.05, 0.18) });
      // coat texture: needs uv, so only on skinned parts that can be projected. Low tier keeps the flat colours.
      if (this.fancy && o.isSkinnedMesh && o.geometry.attributes.position && (n === 'Main' || n === 'Muzzle' || n === 'Hair')) {
        try {
          const hair = n === 'Hair', t = o.material;
          o.geometry = uvOf(o.geometry);
          const nmap = hair ? coatTex('normalMap', T_MANE, 'mane') : nm, rmap = hair ? coatTex('roughnessMap', T_MANE, 'mane') : rm, amap = hair ? coatTex('map', T_MANE, 'mane') : coatTex('map');
          if (nmap) { t.normalMap = nmap; t.normalScale = new THREE.Vector2(hair ? 1.1 : 0.7, hair ? 1.1 : 0.7); }
          if (rmap) { t.roughnessMap = rmap; t.roughness = 1; }
          if (amap) t.map = amap;
          if (n === 'Main') { o.geometry = pointsGeo(o.geometry, H); t.vertexColors = true; }
          if (hair) { t.envMapIntensity = 0.7; }      // a little glossier than the coat
          t.needsUpdate = true;
        } catch (e) { /* keep the flat colour */ }
      }
    });
    const gx = (H.girth ?? 1);
    m.scale.set(MODEL_SCALE * this.hs * gx, MODEL_SCALE * this.hs, MODEL_SCALE * this.hs); m.position.set(0, 0, MODEL_Z);
    this.modelPivot = new THREE.Group(); this.modelPivot.position.z = -0.75; m.position.z += 0.75; this.modelPivot.add(m); this.root.add(this.modelPivot);
    this.mixer = new THREE.AnimationMixer(m);
    const clip = (name) => HORSE_MODEL.animations.find(a => a.name === name);
    this.act = {};
    for (const [k, name] of [['idle', 'Idle'], ['walk', 'Walk'], ['gallop', 'Gallop']]) { const c = clip(name); if (!c) continue; const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); this.act[k] = a; this.act[k + 'Len'] = c.duration; }
    this.backBone = m.getObjectByName('Torso2') || m.getObjectByName('Torso') || m.getObjectByName('Back');
    this.mixer.update(0); this.root.updateMatrixWorld(true);
    this.backRest = this.root.worldToLocal(this.backBone.getWorldPosition(new THREE.Vector3())).y;
    // hide the code-built animal; its invisible joints still carry the hit zones and hoof-fall timing
    this.neck.visible = false; this.tail.visible = false; this.legs.forEach(L => { L.upper.visible = false; });
    this.inner.children.forEach(c => { if (c.isMesh && c.material === this.coat) c.visible = false; });
    this.reins.forEach(r => { r.visible = false; });
    this.hasModel = true;
    this._fitDrapes();
  }

  /**
   * Rest the saddle on the rigged horse's real back. The saddle and the seat were built for the old code-built barrel, whose back was ~0.15 m lower
   * than the rigged horse's, so the rider sat inside the horse. Measure the coat's top line under the seat (idle pose, in the horse's own scale)
   * and lift the tack group (the rider's mount point) so the rider's pelvis stands SEAT_RISE above it: the thickness of the saddle tree and pad, with the fauld
   * (0.11 m below the pelvis) just clear of the back. `seatY` is the pelvis height at rest in metres; the chase camera is placed from it.
   */
  _seatOnBack() {
    const hs = this.hs, v = new THREE.Vector3(); this.body.position.y = BY * hs; this.mixer.update(0); this.root.updateMatrixWorld(true);
    this.tack.position.z = this.saddle.position.z = SEAT_BACK; const sz = (this.mount.position.z + SEAT_BACK) * hs; let top = -1e9;
    this.model.traverse(o => {
      if (!o.isSkinnedMesh || o.material.name !== 'Main') return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); this.root.worldToLocal(v); if (Math.abs(v.x) < 0.1 && Math.abs(v.z - sz) < 0.08) top = Math.max(top, v.y); }
    });
    this.backY = top;
    this.tack.position.y = (top + SEAT_RISE) / hs - this.mount.position.y;
    this.saddle.position.y = (top + 0.02) / hs - 1.597;      // the saddle's underside (1.597 in the old horse's frame) on the back
    this.seatY = top + SEAT_RISE;
  }

  /** Re-cut the caparison so the rigged horse's back and flanks (idle and gallop poses) stay under the cloth. */
  _fitDrapes() {
    if (!this._drapes) return;
    const gx = this.horseDef.girth ?? 1, key = this.hs + '|' + gx;
    let fit = DRAPE_FIT.get(key);
    if (!fit) {
      // the horse is scaled by the body group in the finished frame, so put that scale on now to measure in it
      this.body.scale.set(this.hs * gx, this.hs, this.hs); this.root.updateMatrixWorld(true);
      const skinned = []; this.model.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      const pts = this._drapes.map(D => D.st.map(() => [0, 0]));   // per point: [max y, max |x|]
      const v = new THREE.Vector3();
      const sample = () => {
        this.mixer.update(0); this.root.updateMatrixWorld(true);
        for (const sm of skinned) {
          const n = sm.geometry.attributes.position.count;
          for (let i = 0; i < n; i++) {
            sm.getVertexPosition(i, v); v.applyMatrix4(sm.matrixWorld); this.inner.worldToLocal(v);   // three r160: getVertexPosition already applies the skinning
            if (v.y <= 1.0) continue;
            this._drapes.forEach((D, di) => D.st.forEach((p, pi) => { if (Math.abs(v.z - p[0]) < 0.08) { const r = pts[di][pi]; r[0] = Math.max(r[0], v.y); r[1] = Math.max(r[1], Math.abs(v.x)); } }));
          }
        }
      };
      const A = this.act, setW = (i, g) => { A.idle.setEffectiveWeight(i); if (A.gallop) A.gallop.setEffectiveWeight(g); if (A.walk) A.walk.setEffectiveWeight(0); };
      setW(1, 0); this.mixer.setTime(0); sample();
      if (A.gallop) { setW(0, 1); for (let i = 0; i < 4; i++) { this.mixer.setTime(A.gallopLen * i / 4); sample(); } }
      setW(1, 0); this.mixer.setTime(0); this.mixer.update(0); this.root.updateMatrixWorld(true);   // back to the idle pose
      fit = pts; DRAPE_FIT.set(key, fit);
    }
    this._drapes.forEach((D, di) => {
      const old = D.st, st = old.map((p, pi) => { const [top, half] = fit[di][pi]; return top === 0 ? p.slice() : [p[0], Math.min(Math.max(p[1], top + 0.06), p[1] + 0.2), Math.min(Math.max(p[2], half + 0.07), p[2] + 0.2)]; });   // growth capped so the neck / rump never balloons the cloth
      this._refitDrape(D, st);
      if (di === 0 && this._bosses) {   // the gilded bosses ride the collar of the front piece
        const dy = st[0][1] - old[0][1], kx = st[0][2] / old[0][2];
        for (const b of this._bosses) { b.position.y += dy; b.position.x *= kx; }
      }
    });
  }

  // ------------------------------------------------------------ rider
  _buildRider() {
    const style = this.armourDef.torso ?? 'plate';
    const P = this.armour, A = style === 'surcoat' ? this.mail : this.armour;
    const rider = this.rider = new THREE.Group(); this.mount.add(rider);
    const plain = this._plain = [], pl = (m) => { plain.push(m); return m; };
    // hips, fauld
    rider.add(pl(tube([[0, -0.11, 0, 0.165, 0.14], [0, -0.02, 0, 0.2, 0.165], [0, 0.06, 0, 0.185, 0.15], [0, 0.13, 0, 0.158, 0.125]], A, 18)));
    // legs: cuisse, poleyn with wing, greave, sabaton, spur
    for (const s of [-1, 1]) {
      const hip = [s * 0.12, -0.02, 0.03], knee = [s * 0.4, -0.365, 0.275], ankle = [s * 0.46, -0.87, 0.14];
      rider.add(pl(tube([[...hip, 0.1], [s * 0.24, -0.17, 0.14, 0.098, 0.105], [s * 0.34, -0.3, 0.23, 0.086], [...knee, 0.078]], A, 14)));
      rider.add(pl(ball(knee, 0.086, P, [1, 1.12, 1.12])));
      const wing = ball([knee[0] + s * 0.07, knee[1], knee[2] - 0.01], 0.075, P, [0.22, 1, 1.15]); rider.add(pl(wing));
      rider.add(pl(tube([[...knee, 0.07], [s * 0.425, -0.52, 0.215, 0.076, 0.082], [s * 0.445, -0.72, 0.165, 0.06, 0.066], [...ankle, 0.05]], A, 14)));
      rider.add(pl(tube([[ankle[0], ankle[1] + 0.02, ankle[2] - 0.03, 0.05], [ankle[0], ankle[1] - 0.035, ankle[2] + 0.06, 0.052, 0.045], [ankle[0], ankle[1] - 0.05, ankle[2] + 0.2, 0.042, 0.03], [ankle[0], ankle[1] - 0.055, ankle[2] + 0.3, 0.008, 0.008]], P, 10)));
      const spur = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 6), gold); spur.rotation.x = -Math.PI / 2 - 0.2; spur.position.set(ankle[0], ankle[1] - 0.01, ankle[2] - 0.1); rider.add(spur);
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 14), darkSteel); st.position.set(ankle[0], ankle[1] - 0.05, ankle[2] + 0.07); st.rotation.y = Math.PI / 2; rider.add(st);
      rider.add(limb([s * 0.3, -0.02, 0.2], [s * 0.46, -0.88, 0.2], 0.014, 0.014, leather, 5));      // the stirrup leather, from the saddle bar to the iron
      if (style !== 'surcoat') { const tasset = ball([s * 0.17, -0.1, 0.125], 0.1, P, [0.95, 1.25, 0.4]); tasset.rotation.set(-0.75, 0, s * 0.35); rider.add(pl(tasset)); }
    }
    // torso: globose breastplate with a nipped waist
    const torso = this.torso = new THREE.Group(); torso.position.y = 0.1; rider.add(torso);
    torso.add(pl(tube([[0, -0.03, 0, 0.155, 0.12], [0, 0.05, 0.002, 0.152, 0.12], [0, 0.14, 0.014, 0.19, 0.158], [0, 0.25, 0.024, 0.218, 0.182], [0, 0.36, 0.014, 0.222, 0.166], [0, 0.45, 0.002, 0.19, 0.13], [0, 0.51, 0, 0.12, 0.1], [0, 0.545, 0, 0.09, 0.085]], A, 22)));
    if (style !== 'plate') {
      const k = (style === 'surcoat' ? 1.07 : 1.05) + (KNIGHT_PARTS ? 0.06 : 0), sk = KNIGHT_PARTS ? 1.06 : 1;   // with the modelled plate under it the cloth stands 6% prouder
      const jup = tube([[0, -0.03, 0, 0.155 * k, 0.12 * k], [0, 0.05, 0.002, 0.152 * k, 0.12 * k], [0, 0.14, 0.014, 0.19 * k, 0.158 * k], [0, 0.25, 0.024, 0.218 * k, 0.182 * k], [0, 0.36, 0.014, 0.222 * k, 0.166 * k], [0, 0.47, 0.002, 0.18 * k, 0.125 * k]], this.surcoat, 22, { caps: false });
      torso.add(jup); this._cloth.push(jup);      // the cloth over the breast takes the dent when there is no bare plate
      const drop = style === 'surcoat' ? -0.44 : -0.17;
      rider.add(tube([[0, 0.1, 0, 0.17 * sk, 0.135 * sk], [0, 0.0, 0.01, 0.22 * sk, 0.18 * sk], [0, drop * 0.5, 0.03, 0.31 * sk, 0.225 * sk], [0, drop, 0.05, 0.42 * sk, 0.265 * sk]], this.surcoat, 22, { caps: false }));
    } else {
      // plackart edge and lance rest (arret de cuirasse)
      const pl = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 28), gold); pl.rotation.x = Math.PI / 2; pl.scale.set(1.08, 0.88, 1); pl.position.set(0, 0.125, 0.012); torso.add(pl);
      torso.add(box([-0.15, 0.255, 0.165], [0.045, 0.022, 0.085], darkSteel));
    }
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.016, 8, 28), leather); belt.rotation.x = Math.PI / 2; belt.scale.set(1.02, 0.8, 1); belt.position.y = 0.045; torso.add(belt);
    torso.add(box([0, 0.045, 0.125], [0.05, 0.04, 0.012], gold));
    const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.135, 0.085, 18), P); gorget.position.y = 0.545; gorget.castShadow = true; torso.add(pl(gorget));
    this.armL = null;
    for (const s of [-1, 1]) {
      // layered pauldron
      torso.add(pl(ball([s * 0.262, 0.415, 0.0], 0.125, P, [1.1, 0.78, 1.22])));
      torso.add(pl(ball([s * 0.305, 0.345, 0.0], 0.1, P, [0.92, 0.9, 1.1])));
      if (s < 0) torso.add(ball([-0.2, 0.36, 0.14], 0.055, P, [1, 1, 0.3]));   // besagew over the armpit
      const sh = [s * 0.262, 0.37, 0], el = [s * 0.325, 0.125, -0.035], hd = s < 0 ? [-0.27, 0.12, 0.25] : [0.17, 0.09, 0.3];
      torso.add(pl(tube([[...sh, 0.062], [lerp(sh[0], el[0], 0.5), lerp(sh[1], el[1], 0.5), lerp(sh[2], el[2], 0.5) - 0.01, 0.06], [...el, 0.052]], A, 12)));
      torso.add(pl(ball(el, 0.068, P)));
      torso.add(pl(ball([el[0] + s * 0.055, el[1], el[2]], 0.07, P, [0.2, 1, 1])));   // couter wing
      torso.add(pl(tube([[...el, 0.052], [lerp(el[0], hd[0], 0.45), lerp(el[1], hd[1], 0.45), lerp(el[2], hd[2], 0.45), 0.054], [lerp(el[0], hd[0], 0.85), lerp(el[1], hd[1], 0.85), lerp(el[2], hd[2], 0.85), 0.044], [...hd, 0.05]], A, 12)));
      torso.add(pl(ball(hd, 0.06, P, [1, 0.9, 1.25])));
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.07, 12), P); cuff.position.set(lerp(el[0], hd[0], 0.82), lerp(el[1], hd[1], 0.82), lerp(el[2], hd[2], 0.82)); cuff.quaternion.setFromUnitVectors(Y, new THREE.Vector3(el[0] - hd[0], el[1] - hd[1], el[2] - hd[2]).normalize()); torso.add(pl(cuff));
      if (s > 0) { this.hand = new THREE.Object3D(); this.hand.position.set(hd[0], hd[1] - 0.02, hd[2] + 0.04); torso.add(this.hand); }
    }
    if (KNIGHT_PARTS) {
      for (const m of plain) m.visible = false;
      const legs = new THREE.Mesh(KNIGHT_PARTS.legs, A), body = new THREE.Mesh(KNIGHT_PARTS.torso, A);
      legs.castShadow = body.castShadow = true; legs.receiveShadow = body.receiveShadow = true;
      rider.add(legs); torso.add(body); this.plate = [legs, body];
      if (style === 'plate' && KNIGHT_PARTS.core) {   // bare breastplate only on plate riders; jupon / surcoat show their cloth instead
        const core = new THREE.Mesh(KNIGHT_PARTS.core, A); core.castShadow = core.receiveShadow = true; torso.add(core); this.plate.push(core);
      }
    }
    // helm
    const head = this.helm = new THREE.Group(); head.position.y = 0.57; torso.add(head);
    this._helmMat = P; this._buildHelm(head, this.armourDef.helm ?? 'armet', P);
    // plume: a fan of ostrich feathers in the livery colours
    const plume = this.plume = new THREE.Group(); plume.position.set(0, this.armourDef.helm === 'bascinet' ? 0.38 : 0.31, -0.03); head.add(plume);
    const pc = [this.arms.c1, this.arms.c2];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.MeshStandardMaterial({ color: pc[i % 2], roughness: 1 });
      const a = (i - 3) / 3;
      const f = tube([[0, 0, 0, 0.012], [a * 0.03, 0.1, -0.03, 0.04, 0.022], [a * 0.07, 0.22, -0.1, 0.05, 0.026], [a * 0.1, 0.3, -0.2, 0.04, 0.02], [a * 0.115, 0.31, -0.29, 0.006]], m, 8);
      f.rotation.x = -0.15 - Math.abs(a) * 0.25; plume.add(f);
    }

    // shield (ecranche) on the left shoulder
    const shield = this.shield = new THREE.Group(); shield.position.set(0.215, 0.29, 0.2); shield.rotation.set(-0.08, 0.5, 0.06); torso.add(shield);
    const sg = shieldFace();      // bowed slightly like a real shield
    const face = this.shFace = new THREE.Mesh(sg, this.shieldMat); face.scale.set(0.43, 0.53, 0.43); face.position.z = 0.024; face.castShadow = true; shield.add(face);
    const back = this.shBack = new THREE.Mesh(shieldBack(), gold); back.scale.set(0.455, 0.555, 0.5); back.position.z = -0.03; back.castShadow = true; shield.add(back);

    // lance
    const lance = this.lance = new THREE.Group(); lance.position.set(-0.27, 0.13, 0.25); torso.add(lance);
    const prof = (pts) => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 16); g.rotateX(Math.PI / 2); return g; };
    const rear = new THREE.Mesh(prof([[0.001, -0.95], [0.03, -0.94], [0.036, -0.3], [0.027, -0.13], [0.027, 0.1], [0.043, 0.25], [0.045, 0.4], [0.04, LANCE_SPLIT]]), this.lanceMat);
    const fore = new THREE.Mesh(prof([[0.04, LANCE_SPLIT], [0.034, 1.7], [0.022, 2.7], [0.001, 2.705]]), this.lanceMat);
    const vamp = new THREE.Mesh(prof([[0.03, 0.13], [0.07, 0.15], [0.135, 0.2], [0.14, 0.215], [0.06, 0.24], [0.03, 0.25]]), this.armour);
    const grapper = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), darkSteel); grapper.position.z = -0.2;
    const coronel = new THREE.Mesh(prof([[0.022, 2.69], [0.03, 2.71], [0.04, 2.74], [0.042, 2.79], [0.03, LANCE_REACH], [0.001, 2.79]]), darkSteel);
    rear.castShadow = fore.castShadow = vamp.castShadow = true;
    fore.add(coronel);
    lance.add(rear, fore, vamp, grapper); this.lanceFore = fore;
    { const k = this.arms.lanceScale ?? 1; rear.scale.set(k, k, 1); fore.scale.set(k, k, 1); }
    // a lady's favour: a sleeve tied below the vamplate, shown once the gallery has taken to you
    const rg = new THREE.PlaneGeometry(0.075, 0.62, 1, 10); rg.translate(0, -0.31, 0);
    const rib = this.ribbon = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0xf4e9ee, side: THREE.DoubleSide, roughness: 0.75 }));
    rib.position.set(0, -0.045, 0.34); rib.visible = false; rib.castShadow = true; lance.add(rib);
    this.ribbonBase = Float32Array.from(rg.attributes.position.array);
    const stump = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 7), woodPale); stump.rotation.x = Math.PI / 2; stump.position.z = LANCE_SPLIT + 0.11; stump.visible = false; lance.add(stump); this.lanceStump = stump;
    this.lanceRestQ = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(-0.12, 1, 0.18).normalize());
    this.lanceUpQ = new THREE.Quaternion().setFromUnitVectors(Z, Y);      // fully upright, for the raised lance

    // hit zone markers
    const mk = (parent, p, r, name) => { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); return { o, r, name }; };
    this.zones = [
      mk(this.helm, [0, 0.15, 0.01], 0.17, 'helm'),
      mk(this.torso, [0.22, 0.3, 0.19], 0.25, 'shield'),
      mk(this.torso, [0, 0.27, 0.02], 0.25, 'body'),
      mk(this.torso, [-0.2, 0.2, 0.05], 0.17, 'body'),
      mk(this.head, [0, -0.2, 0.25], 0.27, 'horse'),
      mk(this.neck, [0, 0.38, 0.27], 0.26, 'horse'),
    ];
    // Solid shapes for the other man's lance shaft (not marks to score on): the hit zones plus the horse's body and the rider's thighs.
    // Placed by where they sit on the horse (root frame), then parented so they move with what they belong to.
    this.root.updateMatrixWorld(true);
    const at = (parent, p, r, name) => { const o = new THREE.Object3D(); parent.add(o); parent.updateMatrixWorld(true); o.position.copy(parent.worldToLocal(this.root.localToWorld(new THREE.Vector3(...p)))); return { o, r, name }; };
    const hs = this.hs;
    this.solids = this.zones.concat([
      at(this.root, [0, 1.25 * hs, 0.5 * hs], 0.34 * hs, 'horse'), at(this.root, [0, 1.22 * hs, -0.1 * hs], 0.36 * hs, 'horse'), at(this.root, [0, 1.28 * hs, -0.7 * hs], 0.34 * hs, 'horse'),
      at(this.rider, [0.2, this.seatY - 0.13, 0.12], 0.14, 'leg'), at(this.rider, [-0.2, this.seatY - 0.13, 0.12], 0.14, 'leg'),
    ]);
    this._buildHitboxes();
  }

  // ------------------------------------------------------------ hit volumes (PHYS.hitboxes, src/collide.js)
  /** Build the hit volumes from data, each fixed to the part it belongs to, and the lance as a chain of capsules. */
  _buildHitboxes() {
    const CH = PHYS.lanceChain, parts = { helm: this.helm, torso: this.torso, rider: this.rider, shield: this.shield, head: this.head, neck: this.neck, root: this.root };
    this.hb = []; this._hbParents = new Set(); this.hbValid = false; this._hbStamp = undefined; this._fs = null;
    // With the rigged horse, its head and neck volumes must ride on the MODEL's bones: the old code-built head and neck they were placed on
    // are invisible and move differently at the gallop, so a lance that visibly missed could still touch them (13 Nov).
    const boneFor = { head: 'Head', neck: 'Neck2' }, rebased = {};
    if (this.model) {
      this.root.updateMatrixWorld(true);
      const w = new THREE.Vector3(), inv = new THREE.Matrix4();
      for (const def of PHYS.hitboxes) {
        const bone = boneFor[def.on] && this.model.getObjectByName(boneFor[def.on]); if (!bone || def.shape !== 'cap') continue;
        const code = parts[def.on]; inv.copy(bone.matrixWorld).invert();
        const toBone = (p) => w.set(...p).applyMatrix4(code.matrixWorld).applyMatrix4(inv).toArray();
        const k = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld), kc = new THREE.Vector3().setFromMatrixScale(code.matrixWorld);
        rebased[def.name] = { def: Object.assign({}, def, { a: toBone(def.a), b: toBone(def.b), r: def.r * ((kc.x + kc.y + kc.z) / 3) / ((k.x + k.y + k.z) / 3) }), parent: bone };
      }
    }
    for (const def0 of PHYS.hitboxes) {
      const rb = rebased[def0.name];
      let def = rb ? rb.def : def0;
      // the horse's body volumes were measured on a horse of scale 1 (the old courser) and are in metres from the ground: size them to this horse
      if (def.on === 'root' && def.zone === 'horse') { const k = this.hs; def = Object.assign({}, def, { a: def.a.map(v => v * k), b: def.b.map(v => v * k), r: def.r * k, cr: def.cr * k }); }
      const parent = rb ? rb.parent : parts[def.on]; if (!parent) continue;
      const obb = def.shape === 'obb';
      // a volume moved onto the model's bones is what the OTHER man's lance hits; for keeping your own lance clear of your own horse the
      // steady code-built head and neck are used instead (a proxy, never hit): the model's head bobs into the lance line every stride
      // and the clearance made the couched lance jerk from side to side (13 Nov)
      this.hb.push({ name: def.name, zone: def.zone, leg: !!def.leg, own: rb ? false : !!def.own, obb, def, parent, pad: def.pad ?? 0.01, cr: def.cr || 0.2, p: obb ? new Obb() : new Cap(), c: obb ? new Obb() : new Cap(), lo: [0, 0, 0], hi: [0, 0, 0] });
      this._hbParents.add(parent);
      if (rb && def0.own) { const pp = parts[def0.on]; this.hb.push({ name: def0.name, zone: def0.zone, own: true, proxy: true, obb: false, def: def0, parent: pp, pad: 0, cr: def0.cr || 0.2, p: new Cap(), c: new Cap(), lo: [0, 0, 0], hi: [0, 0, 0] }); this._hbParents.add(pp); }
    }
    this.lc = []; this.lcN = 0; this.lcPoint = CH.edges.length - 2; this._lcPrev = 0; this.dRoot = { x: 0, y: 0, z: 0 }; this.dTip = { x: 0, y: 0, z: 0 }; this._rp = new THREE.Vector3();
    for (let i = 0; i + 1 < CH.edges.length; i++) this.lc.push({ x0: CH.edges[i], x1: CH.edges[i + 1], r: 0.03, p: new Cap(), c: new Cap(), lo: [0, 0, 0], hi: [0, 0, 0] });
  }
  /** Fixed shape of a hit volume in the frame given by matrix elements e (local to wherever), into a Cap or an Obb. */
  _fill(h, e, o) {
    const d = h.def, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]), k = (sx + sy + sz) / 3;
    if (!h.obb) {
      const a = d.a, b = d.b;
      o.set(e[0] * a[0] + e[4] * a[1] + e[8] * a[2] + e[12], e[1] * a[0] + e[5] * a[1] + e[9] * a[2] + e[13], e[2] * a[0] + e[6] * a[1] + e[10] * a[2] + e[14],
        e[0] * b[0] + e[4] * b[1] + e[8] * b[2] + e[12], e[1] * b[0] + e[5] * b[1] + e[9] * b[2] + e[13], e[2] * b[0] + e[6] * b[1] + e[10] * b[2] + e[14], d.r * k);
    } else {
      const c = d.c, hh = d.h;
      o.cx = e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12]; o.cy = e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13]; o.cz = e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14];
      o.ux = e[0] / sx; o.uy = e[1] / sx; o.uz = e[2] / sx; o.vx = e[4] / sy; o.vy = e[5] / sy; o.vz = e[6] / sy; o.wx = e[8] / sz; o.wy = e[9] / sz; o.wz = e[10] / sz;
      o.hx = hh[0] * sx; o.hy = hh[1] * sy; o.hz = hh[2] * sz; o.r = d.r * k;
    }
    return o;
  }
  /** Bring every hit volume and the lance chain to where they are NOW, keeping where they were at the last call (stamp = frame number; once per frame). */
  hbUpdate(stamp) {
    if (!this.hb) return false;
    if (this._hbStamp === stamp) return true;
    let valid = this.hbValid && this._hbStamp !== undefined && stamp - this._hbStamp <= 2;
    const rp = this.root.position;
    if (valid && rp.distanceTo(this._rp) > 2) valid = false;       // a teleport (the turn at the end of the lists): no sweep across it
    this._hbStamp = stamp;
    for (const pr of this._hbParents) pr.updateWorldMatrix(true, false);
    for (const h of this.hb) {
      if (valid) h.p.copy(h.c);
      this._fill(h, h.parent.matrixWorld.elements, h.c);
      if (!valid) h.p.copy(h.c);
      const lo = h.lo, hi = h.hi;
      if (h.obb) {
        const a = h.p, b = h.c, R = Math.hypot(b.hx, b.hy, b.hz) + b.r;
        lo[0] = Math.min(a.cx, b.cx) - R; lo[1] = Math.min(a.cy, b.cy) - R; lo[2] = Math.min(a.cz, b.cz) - R; hi[0] = Math.max(a.cx, b.cx) + R; hi[1] = Math.max(a.cy, b.cy) + R; hi[2] = Math.max(a.cz, b.cz) + R;
      } else capBounds(h.p, h.c, lo, hi);
    }
    // the lance, from the grip, as a chain of capsules (shorter once it has broken)
    const L = this.lance; L.updateWorldMatrix(true, false);
    const e = L.matrixWorld.elements, dl = Math.hypot(e[8], e[9], e[10]) || 1, dx = e[8] / dl, dy = e[9] / dl, dz = e[10] / dl, ox = e[12], oy = e[13], oz = e[14];
    const kk = this.arms.lanceScale ?? 1, CH = PHYS.lanceChain, end = this.lanceBroken ? (this.brokeAt || 1) + 0.1 : 1e9;
    let n = 0;
    for (let i = 0; i < this.lc.length; i++) {
      const q = this.lc[i]; if (q.x0 >= end) break;
      const x1 = Math.min(q.x1, end), last = i === this.lc.length - 1;
      q.r = (last && !this.lanceBroken ? CH.coronel : lanceRadius((q.x0 + x1) / 2)) * kk;
      if (valid && i < this._lcPrev) q.p.copy(q.c);
      q.c.set(ox + dx * q.x0, oy + dy * q.x0, oz + dz * q.x0, ox + dx * x1, oy + dy * x1, oz + dz * x1, q.r);
      if (!valid || i >= this._lcPrev) q.p.copy(q.c);
      capBounds(q.p, q.c, q.lo, q.hi); n++;
    }
    this.lcN = n; this._lcPrev = n; this.lcPoint = this.lanceBroken ? -1 : this.lc.length - 1;
    const t = this.lc[n - 1];
    if (t) { this.dTip.x = t.c.bx - t.p.bx; this.dTip.y = t.c.by - t.p.by; this.dTip.z = t.c.bz - t.p.bz; }
    if (valid) { this.dRoot.x = rp.x - this._rp.x; this.dRoot.y = rp.y - this._rp.y; this.dRoot.z = rp.z - this._rp.z; } else this.dRoot.x = this.dRoot.y = this.dRoot.z = 0;
    this._rp.copy(rp); this.hbValid = true;
    return true;
  }
  /** The shapes of J's hit volumes in THIS rider's root frame (for the shaft clearance, which works in that frame). */
  _hbFrame(J, ownOnly) {
    for (const pr of J._hbParents) pr.updateWorldMatrix(true, false);
    _hm.copy(this.root.matrixWorld).invert();
    const key = ownOnly ? '_fsOwn' : '_fs';
    if (!this[key] || this[key].J !== J) this[key] = { J, list: J.hb.filter(h => ownOnly ? h.own : !h.proxy).map(h => ({ h, cap: new Cap(), obb: new Obb() })) };
    for (const S of this[key].list) { _hm2.multiplyMatrices(_hm, S.h.parent.matrixWorld); this._fill(S.h, _hm2.elements, S.h.obb ? S.obb : S.cap); }
    return this[key].list;
  }

  // wireframes of every hit volume and the lance chain (G.hitboxes(true)): a cheap way to see that they sit on the model
  dbgUpdate(stamp, on) {
    if (!this.hb) return;
    if (!on) { if (this._dbg) this._dbg.visible = false; return; }
    if (!this.root.parent) { if (this._dbg && this._dbg.parent) this._dbg.parent.remove(this._dbg); this._dbg = null; return; }
    if (!this._dbg) {
      const g = this._dbg = new THREE.Group(), col = { helm: 0xffd24a, shield: 0x4aa3ff, body: 0xff5a4a, horse: 0x55dd66 };
      const mat = (c) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, depthTest: false, transparent: true, opacity: 0.85 });
      for (const h of this.hb) {
        const d = h.def, c = h.def.leg ? 0xff9a3a : col[h.zone];
        const m = h.obb ? new THREE.Mesh(new THREE.BoxGeometry(2 * (d.h[0] + d.r), 2 * (d.h[1] + d.r), 2 * (d.h[2] + d.r)), mat(c))
          : new THREE.Mesh(new THREE.CapsuleGeometry(d.r, Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]), 3, 10), mat(c));
        m.renderOrder = 999; m.matrixAutoUpdate = false; m.userData.hb = h; g.add(m);
      }
      for (let i = 0; i < this.lc.length; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), mat(i === this.lc.length - 1 ? 0xff44ff : 0x44ffee));
        m.renderOrder = 999; m.userData.lc = this.lc[i]; g.add(m);
      }
      this.scene.add(g);
    }
    this._dbg.visible = true; this.hbUpdate(stamp);
    for (const m of this._dbg.children) {
      const h = m.userData.hb;
      if (h) {
        const c = h.c;
        if (h.obb) { _v.set(c.cx, c.cy, c.cz); _hm.makeBasis(_v2.set(c.ux, c.uy, c.uz), _v3.set(c.vx, c.vy, c.vz), _dv.set(c.wx, c.wy, c.wz)); m.matrix.copy(_hm).setPosition(_v); }
        else { _v.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2); _v2.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az); if (_v2.lengthSq() < 1e-8) _v2.set(0, 1, 0); _q.setFromUnitVectors(Y, _v2.normalize()); m.matrix.compose(_v, _q, _dv.set(1, 1, 1)); }
        m.matrixWorldNeedsUpdate = true;
      } else {
        const q = m.userData.lc, i = this.lc.indexOf(q);
        m.visible = i < this.lcN; if (!m.visible) continue;
        const c = q.c, len = Math.hypot(c.bx - c.ax, c.by - c.ay, c.bz - c.az) + 0.001;
        m.position.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2); m.scale.set(q.r, len, q.r);
        _v2.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az).divideScalar(len); m.quaternion.setFromUnitVectors(Y, _v2);
      }
    }
  }

  _buildHelm(head, type, A) {
    // each ring gap is cut in three (same shape, the loft is straight between rings) so a dent has vertices to move
    const R = (rings, mat = A) => {
      const f = []; for (let i = 0; i < rings.length; i++) for (let k = 0; k < (i < rings.length - 1 ? 3 : 1); k++) { const a = rings[i], b = rings[Math.min(i + 1, rings.length - 1)], t = k / 3, L = (j) => (a[j] ?? 0) + ((b[j] ?? 0) - (a[j] ?? 0)) * t; f.push({ p: [0, L(0), L(3)], rx: L(1), ry: L(2) }); }
      head.add(loftMesh(f, mat, { segs: 22 }));
    };
    const slit = (y, z, w = 0.175) => head.add(box([0, y, z], [w, 0.013, 0.03], black));
    if (type === 'greathelm') {
      R([[-0.06, 0.12, 0.13], [0.02, 0.124, 0.136], [0.12, 0.128, 0.14], [0.26, 0.122, 0.132], [0.292, 0.112, 0.122], [0.3, 0.06, 0.07], [0.302, 0.005, 0.005]]);
      head.add(box([0, 0.12, 0.139], [0.024, 0.3, 0.012], gold)); head.add(box([0, 0.19, 0.139], [0.21, 0.034, 0.012], gold));
      slit(0.19, 0.134, 0.2);
      for (let i = 0; i < 8; i++) head.add(ball([0.04 + (i % 4) * 0.022, 0.05 + ((i / 4) | 0) * 0.04, 0.132 - (i % 4) * 0.004], 0.006, black));
    } else if (type === 'bascinet') {
      R([[-0.02, 0.1, 0.112], [0.08, 0.118, 0.132], [0.18, 0.122, 0.138], [0.27, 0.098, 0.114, -0.012], [0.34, 0.056, 0.066, -0.03], [0.4, 0.016, 0.018, -0.045], [0.415, 0.003, 0.003, -0.048]]);
      // the visor swings on a pin at each side of the skull, level with the eye slit: this group's origin is that hinge (positions below are helm-space minus the hinge)
      const py = 0.18, vis = this.visor = new THREE.Group(); vis.position.set(0, py, 0); head.add(vis);
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.098, 0.3, 18, 5), A); v.rotation.x = Math.PI / 2; v.position.set(0, 0.1 - py, 0.165); v.castShadow = true; vis.add(v);
      vis.add(box([0, 0, 0.118], [0.175, 0.013, 0.03], black));
      for (let i = 0; i < 6; i++) vis.add(ball([0.03 + (i % 3) * 0.014, 0.085 + ((i / 3) | 0) * 0.03 - py, 0.2 + (i % 3) * -0.02], 0.005, black));
      const av = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.215, 0.17, 20, 1, true), this.mail); av.position.y = -0.08; av.castShadow = true; head.add(av);
    } else if (type === 'frogmouth') {
      R([[-0.08, 0.135, 0.142], [0.04, 0.138, 0.158, 0.02], [0.14, 0.132, 0.178, 0.04], [0.185, 0.126, 0.176, 0.036], [0.205, 0.118, 0.13, 0.0], [0.28, 0.1, 0.115, -0.01], [0.322, 0.052, 0.062, -0.01], [0.336, 0.006, 0.006, -0.01]]);
      slit(0.198, 0.118, 0.215);
      for (const sx of [-1, 1]) { head.add(ball([sx * 0.085, -0.03, 0.125], 0.013, gold)); head.add(ball([sx * 0.11, 0.1, 0.11], 0.008, gold)); }
      head.add(box([0, 0.05, 0.176], [0.012, 0.2, 0.012], A));
    } else {
      R([[-0.03, 0.1, 0.112], [0.06, 0.118, 0.134, 0.005], [0.16, 0.125, 0.142, 0.005], [0.25, 0.112, 0.128], [0.305, 0.072, 0.084, -0.005], [0.33, 0.02, 0.022, -0.008], [0.335, 0.003, 0.003, -0.008]]);
      // sparrow-beak visor and bevor
      // the visor and everything on it hang from a hinge at the sides of the helm, level with the eye slit (y 0.178); the bevor below stays fixed
      const py = 0.178, vis = this.visor = new THREE.Group(); vis.position.set(0, py, 0); head.add(vis);
      const visor = new THREE.Mesh(new THREE.ConeGeometry(0.108, 0.22, 18, 5), A); visor.rotation.x = Math.PI / 2; visor.scale.set(1, 1, 0.82); visor.position.set(0, 0.105 - py, 0.115); visor.castShadow = true; vis.add(visor);
      head.add(ball([0, 0.0, 0.06], 0.105, A, [1.05, 0.7, 1.05]));
      vis.add(box([0, 0, 0.128], [0.175, 0.013, 0.03], black));
      for (let i = 0; i < 5; i++) vis.add(ball([0.035 + i * 0.012, 0.11 - py, 0.15 - i * 0.017], 0.0045, black));
      const crest = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.007, 6, 24, Math.PI), gold); crest.rotation.y = Math.PI / 2; crest.position.set(0, 0.2, -0.003); head.add(crest);
      for (const sx of [-1, 1]) head.add(ball([sx * 0.122, 0.12, 0.0], 0.02, gold, [0.4, 1, 1]));
    }
    // the bare head under a mail coif, shown only when the helm is off
    const bare = this.bareHead = new THREE.Group(); bare.visible = false;
    bare.add(ball([0, 0.1, -0.005], 0.115, this.mail, [1, 1.12, 1.05]));
    bare.add(ball([0, 0.085, 0.078], 0.07, new THREE.MeshStandardMaterial({ color: 0xd2a081, roughness: 0.8 }), [1, 1.15, 0.7]));
    head.add(bare);
  }
  /** Show the helm (and the plume) or the bare head. Called from update() whenever helmOff changes. */
  _showHelm(on) {
    this._helmShown = on;
    for (const c of this.helm.children) if (c !== this.bareHead && (c.isMesh || c.isGroup)) c.visible = on;
    this.bareHead.visible = !on;
  }

  // ------------------------------------------------------------ state
  /** A shield that sprang off the arm (see main.js strike): hidden until the squire re-fits it. */
  setShieldGone(on) { this.shGone = !!on; this.shield.visible = !on; }
  /** The squire fits a fresh shield between courses: the spare has none of the old damage. */
  refitShield() {
    if (!this.shGone) return;
    this.setShieldGone(false); this.dmg.shield = 0; this.dlog = this.dlog.filter(e => e.region !== 'shield'); this._rebuild(Infinity);
  }
  /** A taller shield for the type of joust (Renntartsche): the plate, its back, the hit volume and the aiming mark all grow by k in height. */
  tallShield(k) {
    if (!(k > 1) || this._tall) return; this._tall = k;
    for (const m of [this.shFace, this.shBack]) m.scale.y *= k;
    const h = this.hb && this.hb.find(x => x.name === 'shield'); if (h) { const d = Object.assign({}, h.def); d.h = [d.h[0] * 1.08, d.h[1] * k, d.h[2]]; d.c = [d.c[0], d.c[1] + d.h[1] * 0.1, d.c[2]]; h.def = d; }
    this.zones[1].r = 0.25 * (1 + 0.5 * (k - 1));
  }
  /** Turn the rider to travel the other way (he keeps the tilt on his left, so he changes sides). */
  face(dir) { this.dir = dir; this.root.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); this.hbValid = false; }
  /** A fresh lance and a settled seat, without moving the horse. */
  fresh() {
    this.refitShield();
    this.raise = this.raiseT = 0;
    this.speed = 0; this.lanceLower = 0; this.recoil = this.recoilV = 0; this.sideRecoil = this.sideRecoilV = 0; this.brace = 0; this.rear = 0; this.guard = 0; this.look = 0; this.manualPos = false; this.going = null; this.twist = this.twistV = this.headK = this.headV = this.shK = this.shV = this.stag = this.stagV = 0; this._fxReset();
    this._mendLance();
  }
  setPose(z, dir) {
    if (dir) this.dir = dir;
    this.root.position.set(-this.dir * this.lane, 0, z);
    this.hbValid = false;
    this.root.rotation.set(0, this.dir > 0 ? 0 : Math.PI, 0); this.guard = 0; this.look = 0; this.manualPos = false; this.raise = this.raiseT = 0;
    this.speed = 0; this.lanceLower = 0; this.recoil = this.recoilV = 0; this.sideRecoil = this.sideRecoilV = 0; this.brace = 0; this.rear = 0; this.going = null; this.twist = this.twistV = this.headK = this.headV = this.shK = this.shV = this.stag = this.stagV = 0; this._fxReset();
    if (this.unhorsed) {
      this.mount.add(this.rider);
      this.rider.position.set(0, 0, 0); this.rider.quaternion.identity();
      this.unhorsed = false; this.fall = null;
    }
    this._mendLance();
    this.root.updateMatrixWorld(true);
  }

  get z() { return this.root.position.z; }

  /** Set desired lance direction in world space; clamped to what an arm can do. */
  setAim(dirWorld) {
    _v.copy(dirWorld); if (this.dir < 0) { _v.x = -_v.x; _v.z = -_v.z; }
    const yaw = clamp(Math.atan2(_v.x, _v.z), 0.14, 1.15);
    const pitch = clamp(Math.asin(clamp(_v.y, -1, 1)), -0.22, 0.32);
    this.aimLocal.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  tipWorld(out) { return this.lance.localToWorld(out.set(0, 0, LANCE_REACH)); }
  /** Where the rider means the lance to point (world). Far out, the lance itself is held wider than this to clear his horse's head. */
  aimWorld(out) { return out.copy(this.aimLocal).applyQuaternion(this.root.quaternion); }
  /**
   * A lance cannot pass through the rider's own horse. v: the wanted direction in the rider's frame; it is swung further to the left
   * (across the neck) until the shaft clears the horse's head and neck. By the time the lances meet the true line is wider than that anyway.
   */
  _clearHorse(v) {
    let need = 0;
    if (this.lanceLower > 0.05 && this.hb) {
      this.lance.getWorldPosition(_v2); this.root.worldToLocal(_v2);
      // Own horse: the steady head and neck markers (spheres) as before the capsule rebuild. The capsules, and the model's bobbing head,
      // made the couched lance swing out and jerk from side to side at every stride (13 Nov); the other man's lance still hits the capsules.
      const yaw0 = Math.atan2(v.x, v.z), pitch = Math.asin(clamp(v.y, -1, 1));
      for (let k = 0; k < 16; k++) {
        const yaw = yaw0 + need; _v3.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        let through = false;
        for (let i = 4; i < 6 && !through; i++) {
          const z = this.zones[i]; z.o.getWorldPosition(_v4); this.root.worldToLocal(_v4); _v4.sub(_v2);
          const t = clamp(_v4.dot(_v3), 0, LANCE_REACH); if (_v4.addScaledVector(_v3, -t).length() < z.r * PHYS.shaft.horse + 0.03) through = true;
        }
        if (!through) break; need += 0.03;
      }
    }
    this.clearNeed = need;
    this.clearYaw = (this.clearYaw || 0) + (need - (this.clearYaw || 0)) * 0.3;      // eased, so the horse's nodding head does not jerk the lance
    if (this.clearYaw > 0.002) { const yaw = Math.atan2(v.x, v.z) + this.clearYaw, pitch = Math.asin(clamp(v.y, -1, 1)); v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); }
    // nor through the tilt: where the shaft crosses over the barrier it must be above the rail
    if (this.tiltTop > 0 && this.lanceLower > 0.5) {
      this.lance.getWorldPosition(_v2); _v3.copy(v).applyQuaternion(this.root.quaternion);
      const s = Math.abs(_v3.x) > 1e-4 ? -_v2.x / _v3.x : -1;
      if (s > 0 && s < LANCE_REACH) {
        const lack = (this.tiltTop + PHYS.shaft.rail) - (_v2.y + s * _v3.y);
        if (lack > 0) { v.y += lack / s; v.normalize(); }
      }
    }
    // nor through the other man or his horse. The point's own business (striking a mark) is the sweep's in main.js, so while
    // the stroke is still to come the last stretch of the lance is left to it; everything else is pushed clear, and how far it
    // had to be pushed is kept in shaftHit for main.js to make a blow of it (a lance broken across, a shove, a wrenched arm).
    this.shaftHit = null;
    const F = this.foe, SH = PHYS.shaft;
    if (F && F.hb && this.lanceLower > 0.3 && !this.replaying) {
      this.lance.getWorldPosition(_v2); this.root.worldToLocal(_v2);
      const len = (this.lanceBroken ? (this.brokeAt || 1.0) + 0.1 : LANCE_REACH) - (this.pointFree && !this.lanceBroken ? SH.point : 0), t0 = SH.hand, push = PHYS.lanceChain.push;
      const shapes = len > t0 ? this._hbFrame(F, false) : [];
      let defl = 0, hit = null;
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const S of shapes) {
          if (S.h.leg && F.unhorsed) continue;
          _cs.set(_v2.x + v.x * t0, _v2.y + v.y * t0, _v2.z + v.z * t0, _v2.x + v.x * len, _v2.y + v.y * len, _v2.z + v.z * len, 0.03);
          const gap = S.h.obb ? capObbGap(_cs, S.obb, _hit) : capCapGap(_cs, S.cap, _hit);
          if (gap >= push) continue;
          const t = t0 + _hit.u * (len - t0), a = (push - gap) / Math.max(t, 0.3);        // out of the volume along its surface normal, as an angle at that distance
          _v4.set(_hit.nx, _hit.ny, _hit.nz); v.addScaledVector(_v4, a).normalize(); defl += a; moved = true;
          if (!hit || a > hit.a) hit = { a, at: t, name: S.h.leg ? 'leg' : S.h.zone };
        }
        if (!moved) break;
      }
      if (hit) { hit.defl = defl; this.shaftHit = hit; }
    }
  }
  gripWorld(out) { return this.lance.getWorldPosition(out); }
  zoneWorld(name, out) { const z = this.zones.find(q => q.name === name); return z.o.getWorldPosition(out); }

  /** kick: angular velocity (rad/s) the blow gives the rider's torso about the hips */
  /**
   * o.lat: where across the body it landed, -1 (his right) .. 1 (his left, the shield side); o.zone: what it struck.
   * A blow off the spine turns the shoulders as well as bending him back; the helm and the shield arm are thrown on their own; the horse feels it.
   */
  hit(kick, fromLeft = true, o = {}) {
    const R = PHYS.recoil, lat = o.lat || 0;
    this.recoilV += kick * (1 - 0.3 * Math.abs(lat)); this.sideRecoilV += (fromLeft ? -1 : 1) * 0.4 * kick;
    this.twistV += kick * lat * R.twist;
    if (o.zone === 'helm') this.headV += kick * R.head * (o.headMul ?? 1);
    if (o.zone === 'shield') this.shV += kick * R.shield;
    this.stagV += (fromLeft ? -1 : 1) * Math.abs(kick) * R.stagger * 8;
    if (o.dir) this._blow(kick, o);
  }

  // ------------------------------------------------------------ the blow as a vector (numbers in PHYS.impact.react; all of it is looks: no stroke's result depends on it)
  _fxReset() {
    this.pend = []; this.hS = this.hSV = this.hY = this.hYV = this.push = this.pushV = this.jZ = this.jZV = this.jX = this.jXV = this.jY = this.jYV = 0;
    this.wX = this.wXV = this.wY = this.wYV = this.toss = this.tossV = this.chk = this.shd = this.shdV = 0;
  }
  _sp(a, k, c, dt) { const v = a + 'V'; this[v] += (-this[a] * k - this[v] * c) * dt; this[a] += this[v] * dt; }
  /**
   * o.dir: the blow's direction (unit, world); o.pt: where it landed (world); o.power: the stroke's strength (1 = full); o.zone.
   * Helm: the head snaps back, turns and tips to the side the blow came from, and the torso follows a moment later. Shield or body: the shoulders are driven back and
   * twisted by how far off the spine it landed, the lance arm is thrown back along the shaft, and he rocks back against the cantle (limited in update()).
   * A heavy blow shoves him back in the saddle and the horse tosses his head and checks his stride.
   */
  _blow(kick, o) {
    const R = PHYS.impact.react, lk = 1 / Math.sqrt(Math.max(0.5, this.lock)), pw = clamp(o.power ?? kick * 0.2, 0, 1.4), k = clamp(kick / 3.5, 0.15, 1.8) * lk;
    _bq.copy(this.root.quaternion).invert(); const bd = _bv.copy(o.dir).applyQuaternion(_bq);      // the blow in his own frame: +z his front, +x his left
    let px = 0; if (o.pt) { this.root.updateMatrixWorld(true); this.torso.worldToLocal(_bp.copy(o.pt)); px = _bp.x; }
    const sd = Math.sign(bd.x * 1.5 + px * 3 + 1e-4), F = clamp(-bd.z, 0.2, 1);
    if (o.zone === 'helm') {
      this.hSV += sd * R.headSide * k * 3 * F; this.hYV += clamp(px / 0.15, -1, 1) * R.headYaw * k * 4 + bd.x * k * 2;
      const share = Math.min(this.recoilV, kick) * R.lagShare; this.recoilV -= share; this.pend.push({ t: R.lag, rv: share, sv: sd * 0.25 * kick * R.lagShare, tw: clamp(px / 0.15, -1, 1) * 0.3 * kick });
    } else {
      this.twistV += clamp(px / 0.3, -1, 1) * kick * 0.45 * lk; this.shdV += R.shoulder * k * 2.5; this.jZV -= R.jolt * k * 9; this.jXV += sd * k * 0.8; this.jYV -= k * 0.5;
    }
    const heavy = smoothstep(R.checkAt - 0.3, R.checkAt + 0.3, pw);
    if (heavy > 0) { this.pushV -= R.push * 14 * heavy * lk * F; this.tossV += R.toss * 9 * heavy; this.chk = Math.max(this.chk, R.check * heavy); }
  }
  /** The striker feels his own stroke: the arm is driven back along the shaft, the shoulder jolts, and a lance that did not break whips. */
  strikeKick(power, dir, broke) {
    const R = PHYS.impact.react, p = clamp(power, 0.1, 1.3), lk = 1 / Math.sqrt(Math.max(0.5, this.lock));
    this.jZV -= R.recoil * p * 14 * lk; this.shdV += R.shoulder * p * 1.6; this.pushV -= R.push * 4 * p * lk;
    if (!broke) { this.wXV += R.whip * p * (0.6 + Math.random() * 0.8) * 4; this.wYV += (Math.random() - 0.5) * R.whip * p * 5; }
  }
  /** Spring-dampers of the blow's reaction (seconds in dt; dt = 0 leaves them as they are). */
  _reactStep(dt) {
    const R = PHYS.impact.react;
    if (dt > 0) {
      for (let i = this.pend.length - 1; i >= 0; i--) { const e = this.pend[i]; e.t -= dt; if (e.t <= 0) { this.recoilV += e.rv; this.sideRecoilV += e.sv; this.twistV += e.tw; this.pend.splice(i, 1); } }
      this._sp('hS', 85, 8, dt); this._sp('hY', 70, 7, dt); this._sp('push', 55, 9, dt); this._sp('jZ', 90, 10, dt); this._sp('jX', 80, 8, dt); this._sp('jY', 80, 8, dt);
      this._sp('wX', 420, 5, dt); this._sp('wY', 380, 5, dt); this._sp('toss', 40, 5, dt); this._sp('shd', 75, 9, dt);
      this.chk = Math.max(0, this.chk - dt * 1.4);
      const lim = R.leanMax / Math.max(0.6, this.cantle), pm = R.push * 1.7 / Math.max(0.6, this.cantle);
      if (!this.going && this.recoil > lim) { this.recoil = lim; if (this.recoilV > 0) this.recoilV *= -0.3; }      // the cantle stops him: he rocks back against it and comes forward
      if (this.push < -pm) { this.push = -pm; if (this.pushV < 0) this.pushV *= -0.2; }
    }
  }

  /** at: metres from the grip where the shaft fails (see breakAt in physics.js). What is left of the fore part stays on the lance. */
  breakLance(at = LANCE_SPLIT) {
    if (this.lanceBroken) return null;
    at = clamp(at, LANCE_SPLIT + 0.03, LANCE_REACH - 0.3);
    this.brokeAt = at; this.lanceBroken = true; this.lanceFore.visible = false; this.lanceStump.visible = true; this.lanceStump.position.z = at + 0.1;
    const k = this.arms.lanceScale ?? 1, pts = [[LANCE_SPLIT, lanceRadius(LANCE_SPLIT)]];
    for (const p of PHYS.lanceShape) if (p[0] > LANCE_SPLIT && p[0] < at) pts.push(p);
    pts.push([at, lanceRadius(at)]);
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[1] * k, p[0])), 12); g.rotateX(Math.PI / 2);
    this.lanceKept = new THREE.Mesh(g, this.lanceMat); this.lanceKept.castShadow = true; this.lance.add(this.lanceKept);
    this.lanceStump.scale.setScalar(Math.max(0.6, lanceRadius(at) * k / 0.04));
    const a = this.lance.localToWorld(new THREE.Vector3(0, 0, at)), b = this.lance.localToWorld(new THREE.Vector3(0, 0, LANCE_REACH));
    return { a, b, at, r: lanceRadius(at) * k };
  }
  // ------------------------------------------------------------ armour damage (numbers in PHYS.damage)
  /**
   * A blow of strength amt lands on region (shield, helm, breast, pauldronL) at world point wp. key orders it in time (course * 1000 + course time)
   * so a replay can show each mark only after its blow. Raises the damage, records the mark in the part's own frame and redraws. Returns {plume:true}
   * the moment the plume is knocked off.
   */
  damage(region, amt, wp, key, power = 0.5) {
    if (!(region in this.dmg) || !(amt > 0)) return null;
    const before = this.dmg[region], cum = Math.min(1, before + amt); this.dmg[region] = cum;
    this.root.updateMatrixWorld(true);
    const g = region === 'shield' ? this.shield : region === 'helm' ? this.helm : this.torso, d = cum - before;
    const e = { key, region, lp: g.worldToLocal(wp.clone()).toArray(), amt: d, cum, r: DM.radius * (0.85 + 0.35 * clamp(power, 0, 1)), depth: DM.depth * clamp(0.3 + 2.2 * d, 0.25, 1), seed: this.dlog.length * 7.31 + key, plume: false };
    if (region === 'helm' && !this._plumeGone && cum >= DM.plumeAt) { e.plume = true; this._plumeGone = true; }
    if (region === 'shield') this.askew = Math.max(this.askew, smoothstep(DM.askewAt, 1, cum) * DM.askew);
    this.dlog.push(e); this._rebuild(Infinity);
    return e.plume ? { plume: true } : null;
  }
  /** The squire fits the spare helm: the dents are gone (the plume stays off if it was lost). */
  refitHelm() {
    this.dmg.helm = 0; this.dlog = this.dlog.filter(e => e.region !== 'helm'); this._rebuild(Infinity);
  }
  /** The lance falls from the hand: hidden here, the caller throws the falling shaft (main.js dropLance). Back with the next fresh(). */
  dropLance() { this.lanceDropped = true; this.lance.visible = false; }
  /** Between courses: the armourer takes `f` of the worst region out (dents beaten, shield patched); the squire pulls the shield straight (`sq` share of its askew). Returns the region mended. */
  mend(f, sq = 0) {
    let w = null, wv = 0.03; for (const r in this.dmg) if (this.dmg[r] > wv) { w = r; wv = this.dmg[r]; }
    if (w && f > 0) { const k = 1 - f; this.dmg[w] *= k; for (const e of this.dlog) if (e.region === w) { e.cum *= k; e.depth *= k; } }
    if (sq > 0) this.askew *= 1 - sq;
    if ((w && f > 0) || (sq > 0 && this.askew > 0)) this._rebuild(Infinity);
    return w;
  }
  /** Replays: show only the marks whose blow has happened by `key` (Infinity = all, as it is now). */
  showDamage(key) {
    let n = 0; while (n < this.dlog.length && this.dlog[n].key <= key) n++;
    if (n !== this._vN) this._rebuild(key);
  }
  _rebuild(keyMax) {
    for (const m of this._dirty) { const d = m.userData.d0, P = m.geometry.attributes.position, N = m.geometry.attributes.normal; P.array.set(d.p); N.array.set(d.n); P.needsUpdate = N.needsUpdate = true; }
    this._dirty.clear();
    for (const r in this._vd) this._vd[r] = 0;
    this._vPlume = true; this._shMarks = []; this._vN = 0;
    for (const e of this.dlog) { if (e.key > keyMax) break; this._vN++; this._apply(e); }
    this._vAsk = this._vN === this.dlog.length ? this.askew : 0;
    this._drawShield();
  }
  _apply(e) {
    this._vd[e.region] = e.cum;
    if (e.plume) this._vPlume = false;
    if (e.region === 'shield') { this._shMarks.push(e); return; }
    const g = e.region === 'helm' ? this.helm : this.torso, lp = _kv.fromArray(e.lp);
    for (const m of this._dentTargets(e.region)) {
      m.updateMatrix(); const M = m.matrix.clone();
      for (let p = m.parent; p && p !== g; p = p.parent) { if (p === this.visor) M.premultiply(_dm.makeTranslation(p.position.x, p.position.y, p.position.z)); else { p.updateMatrix(); M.premultiply(p.matrix); } }
      const k = M.getMaxScaleOnAxis() || 1, c = lp.clone().applyMatrix4(M.invert());      // the part's frame -> the mesh's own; k: the mesh's scale
      if (!m.userData.d0) {      // a private copy of the geometry (the plate model is shared between riders), with the untouched shape kept for rebuilds
        const N0 = m.geometry.attributes.normal; if (!N0) continue;
        m.geometry = m.geometry.clone(); const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
        m.userData.d0 = { p: Float32Array.from(P.array), n: Float32Array.from(N.array) };
      }
      dentGeo(m.geometry, c, e.r / k, e.depth / k); this._dirty.add(m);
    }
  }
  _dentTargets(region) {
    if (region === 'breast') return this.plate && this.plate[2] ? [this.plate[2]] : this._cloth.length ? this._cloth : (this._plain || []);
    if (region === 'pauldronL') return this.plate ? [this.plate[1]] : (this._plain || []);
    const out = [], walk = (o) => { if (o === this.plume || o === this.bareHead) return; if (o.isMesh && o.material === this._helmMat) out.push(o); o.children.forEach(walk); };
    walk(this.helm); return out;
  }
  /** Shield face: gouges and splinter marks at each blow, a crack once it is badly hurt, a corner broken away. */
  _drawShield() {
    const tex = this.shieldMat.map, cv = tex && tex.image;
    if (cv && cv.getContext && (this._shMarks.length || this._shBase)) {
      if (!this._shBase) { const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height; b.getContext('2d').drawImage(cv, 0, 0); this._shBase = b; }
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, px = W / 512;
      g.globalCompositeOperation = 'source-over'; g.drawImage(this._shBase, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const e of this._shMarks) {
        let sd = Math.floor(e.seed * 1000) >>> 0; const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;
        const x = (e.lp[0] / 0.43 + 0.5) * W, y = (1 - (e.lp[1] / 0.53 + 0.5)) * H, sz = (16 + 90 * e.amt) * px;
        const gr = g.createRadialGradient(x, y, 0, x, y, sz); gr.addColorStop(0, 'rgba(22,15,10,0.7)'); gr.addColorStop(1, 'rgba(22,15,10,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill();
        const n = 5 + Math.round(16 * e.amt);
        for (let i = 0; i < n; i++) {       // splinter marks: a pale gash with a dark edge, radiating from the blow
          const a = rnd() * TAU, r0 = rnd() * sz * 0.3, l = sz * (0.3 + rnd() * 0.8), x0 = x + Math.cos(a) * r0, y0 = y + Math.sin(a) * r0;
          g.strokeStyle = 'rgba(20,12,8,0.75)'; g.lineWidth = 3.4 * px; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke();
          g.strokeStyle = 'rgba(236,222,190,0.85)'; g.lineWidth = 1.4 * px; g.stroke();
        }
        if (e.cum >= DM.crackAt) {          // a crack running out from the blow, longer the worse the shield
          const len = W * (0.18 + 0.4 * this._vd.shield); let a = rnd() * TAU, cx = x, cy = y;
          g.strokeStyle = 'rgba(14,9,6,0.9)'; g.lineWidth = 3.2 * px; g.beginPath(); g.moveTo(cx, cy);
          for (let l = 0; l < len; l += 18 * px) { a += (rnd() - 0.5) * 1.0; cx += Math.cos(a) * 18 * px; cy += Math.sin(a) * 18 * px; g.lineTo(cx, cy); }
          g.stroke(); g.strokeStyle = 'rgba(232,214,170,0.55)'; g.lineWidth = px; g.stroke();
        }
      }
      tex.needsUpdate = true;
    }
    // the broken corner (on the side of the hardest blow): rebuild the face and the back plate with the corner cut
    const v = this._vd.shield, cut = v >= DM.cornerAt ? 0.06 + 0.16 * (v - DM.cornerAt) / (1 - DM.cornerAt) : 0;
    let big = null; for (const e of this._shMarks) if (!big || e.amt > big.amt) big = e;
    const side = big ? (big.lp[0] >= 0 ? 1 : -1) : this._cutSide;
    if (Math.abs(cut - this._cut) > 0.004 || (cut > 0 && side !== this._cutSide)) {
      this._cut = cut; this._cutSide = side;
      this.shFace.geometry.dispose(); this.shFace.geometry = shieldFace(cut, side);
      this.shBack.geometry.dispose(); this.shBack.geometry = shieldBack(cut, side);
    }
  }
  /** A fresh lance in the hand. */
  _mendLance() {
    this.lanceDropped = false; this.lance.visible = true; this.lanceBroken = false; this.lanceFore.visible = true; this.lanceStump.visible = false;
    if (this.lanceKept) { this.lance.remove(this.lanceKept); this.lanceKept.geometry.dispose(); this.lanceKept = null; }
  }

  /**
   * Going over. Measured on film of a real unhorsing: the struck rider's body goes from upright to flat along the horse's back
   * in about 0.35 s while he is still in the saddle, his seat leaves it at about 0.45 s, and he is on the ground about a second
   * after the blow. So for `delay` seconds he stays mounted and is driven back; only then does he part from the horse.
   */
  unhorse(vel, spin, delay = 0.42) {
    if (this.unhorsed || this.going) return;
    this.going = { t: delay, vel: vel.clone(), spin };
  }
  _detach() {
    const g = this.going; this.going = null;
    this.unhorsed = true;
    this.scene.attach(this.rider);
    // from here he is one rigid body: he leaves the saddle turning backward over the cantle (spin), with whatever twist the blow gave him
    const w = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rider.quaternion).multiplyScalar(g.spin);
    w.y += this.twistV * 0.6 + (Math.random() - 0.5) * 1.6; w.addScaledVector(_v.set(0, 0, 1).applyQuaternion(this.rider.quaternion), this.sideRecoilV * 0.5 + (Math.random() - 0.5) * 1.2);
    w.addScaledVector(_v.set(0, 0, 1).applyQuaternion(this.rider.quaternion), -g.vel.x * 0.8 * PHYS.impact.fall.ground * 2);      // thrown out to the side: he rolls over as he goes
    this.fall = { v: g.vel, w, landed: false, still: 0, wl: w.clone(), skidT: 0, bounceT: 0 };
  }

  /** Everything needed to redraw this rider at an instant (for instant replay). */
  snapshot() {
    const r = this.root, s = { px: r.position.x, pz: r.position.z, ry: r.rotation.y, rz: r.rotation.z, dir: this.dir, speed: this.speed, phase: this.phase, time: this.time,
      lanceLower: this.lanceLower, ax: this.aimLocal.x, ay: this.aimLocal.y, az: this.aimLocal.z, brace: this.brace, recoil: this.recoil, sideRecoil: this.sideRecoil,
      rear: this.rear, guard: this.guard, look: this.look, agit: this.agit || 0, lanceBroken: this.lanceBroken, unhorsed: this.unhorsed, twist: this.twist, headK: this.headK, shK: this.shK, stag: this.stag, raise: this.raise, visorUp: this.visorUp, helmOff: this.helmOff, shGone: !!this.shGone, lr: this._lanceRel(), ld: !!this.lanceDropped, fx: [this.hS, this.hY, this.push, this.jZ, this.wX, this.wY, this.toss, this.chk, this.shd, this.jX, this.jY] };      // lr: the lance exactly as it was posed, relative to the root (the live pose rests on eased state and on the other man's body, which a replay does not have)
    if (this.unhorsed) { const p = this.rider.position, q = this.rider.quaternion; s.rp = [p.x, p.y, p.z]; s.rq = [q.x, q.y, q.z, q.w]; s.tx = this.torso.rotation.x; }
    return s;
  }
  /** The lance's world pose as a position and quaternion in the root's frame. */
  _lanceRel() {
    this.root.updateMatrixWorld(true); this.lance.updateWorldMatrix(true, false);
    _lm.copy(this.root.matrixWorld).invert().multiply(this.lance.matrixWorld).decompose(_lp, _lq, _ls);
    return [_lp.x, _lp.y, _lp.z, _lq.x, _lq.y, _lq.z, _lq.w];
  }
  _lanceFromRel(a) {
    this.lance.parent.updateWorldMatrix(true, false);
    _lq.set(a[3], a[4], a[5], a[6]).normalize(); _lp.set(a[0], a[1], a[2]); _ls.copy(this.lance.scale);
    _lm.compose(_lp, _lq, _ls).premultiply(this.root.matrixWorld);
    _lm.premultiply(_lm2.copy(this.lance.parent.matrixWorld).invert()).decompose(this.lance.position, this.lance.quaternion, this.lance.scale);
    this.lance.updateMatrixWorld(true);
  }
  applySnap(s) {
    const r = this.root; r.position.x = s.px; r.position.z = s.pz; r.rotation.y = s.ry; r.rotation.z = s.rz; this.dir = s.dir;
    this.speed = s.speed; this.phase = s.phase; this.time = s.time; this.lanceLower = s.lanceLower; this.aimLocal.set(s.ax, s.ay, s.az).normalize();
    this.brace = s.brace; this.recoil = s.recoil; this.sideRecoil = s.sideRecoil; this.rear = s.rear; this.guard = s.guard; this.look = s.look; this.agit = s.agit;
    { const f = s.fx || []; [this.hS, this.hY, this.push, this.jZ, this.wX, this.wY, this.toss, this.chk, this.shd, this.jX, this.jY] = [f[0] || 0, f[1] || 0, f[2] || 0, f[3] || 0, f[4] || 0, f[5] || 0, f[6] || 0, f[7] || 0, f[8] || 0, f[9] || 0, f[10] || 0]; }
    this.twist = s.twist || 0; this.headK = s.headK || 0; this.shK = s.shK || 0; this.stag = s.stag || 0;
    this.raise = this.raiseT = s.raise || 0; this.visorUp = !!s.visorUp; this.helmOff = !!s.helmOff; if (!!s.shGone !== !!this.shGone) this.setShieldGone(!!s.shGone);
    this.lance.visible = !s.ld; this.lanceFore.visible = !s.lanceBroken; this.lanceStump.visible = s.lanceBroken; if (this.lanceKept) this.lanceKept.visible = s.lanceBroken;
    if (s.unhorsed) {
      if (this.rider.parent !== this.scene) this.scene.attach(this.rider);
      this.rider.position.set(s.rp[0], s.rp[1], s.rp[2]); this.rider.quaternion.set(s.rq[0], s.rq[1], s.rq[2], s.rq[3]).normalize(); this.torso.rotation.x = s.tx;
    } else if (this.rider.parent !== this.mount) { this.mount.add(this.rider); this.rider.position.set(0, 0, 0); this.rider.quaternion.identity(); }
    this.snapUnhorsed = s.unhorsed; this.snapLR = s.lr || null;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt; const t = this.time;
    const sp = this.speed;
    if (!this.manualPos && !this.replaying) this.root.position.z += this.dir * sp * dt;
    const g = this.gait = smoothstep(2.4, 6.4, sp);
    const amp = this.amp = clamp(sp / 1.3, 0, 1);
    this.phase += dt * (sp > 0.05 ? 0.72 + 0.17 * sp : 0) * (1 - 0.75 * Math.min(1, this.chk));   // strides per second: about 1.0 at the walk, 1.4 trot, 1.8 canter, 2.0-2.2 gallop (film: 2.0 at about 7 m/s)
    const duty = lerp(0.62, 0.36, g), A = lerp(0.27, 0.6, g) * amp, F = lerp(0.55, 1.4, g) * amp;

    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const off = lerp(WALK_OFF[i], GALLOP_OFF[i], g);
      const ph = (this.phase + off) % 1;
      if (ph < this.prevLegPhase[i] && sp > 0.3 && this.onHoof) this.onHoof(i, L);
      this.prevLegPhase[i] = ph;
      let th, flex = 0;
      if (ph < duty) { th = A * (1 - 2 * ph / duty); }
      else { const u = (ph - duty) / (1 - duty); th = -A * Math.cos(Math.PI * u); flex = Math.pow(Math.sin(Math.PI * u), 0.8) * F; }
      const rear = this.rear;
      if (L.hind) {
        L.upper.rotation.x = 0.3 - th * 0.95 + flex * 0.3 - rear * 0.25;
        L.lower.rotation.x = -0.3 - flex * 1.05 + rear * 0.2;
        L.hoof.rotation.x = flex * 0.75 + Math.max(0, th) * 0.15;
      } else {
        L.upper.rotation.x = -th * 1.0 - flex * 0.25 - rear * (0.9 + 0.3 * Math.sin(t * 9 + i * 2));
        L.lower.rotation.x = flex * 1.15 + rear * (1.3 + 0.3 * Math.sin(t * 9 + i * 2));
        L.hoof.rotation.x = flex * 0.8 - Math.max(0, -th) * 0.25;
      }
    }
    const cyc = this.phase * TAU;
    const bob = g * amp * 0.1 * Math.sin(cyc + 2.0) + (1 - g) * amp * 0.022 * Math.sin(cyc * 2);
    const pitch = g * amp * 0.055 * Math.sin(cyc + 0.4);
    this.body.position.y = (BY - 0.075 * g * amp + bob + this.rear * 0.25) * this.hs;
    this.body.rotation.x = pitch - this.rear * 0.62;
    this.bob = bob;
    if (this.hasModel) {
      const A = this.act, ph = ((this.phase % 1) + 1) % 1;
      A.idle.setEffectiveWeight(1 - amp); A.walk.setEffectiveWeight(amp * (1 - g)); A.gallop.setEffectiveWeight(amp * g);
      A.idle.time = t % A.idleLen; A.walk.time = ph * A.walkLen; A.gallop.time = ((ph + 0.35) % 1) * A.gallopLen;
      this.mixer.update(0);
      // A charging horse stretches his head forward and down; the model carries it high (its poll level with the rider's shield), which put
      // it in the line of the other man's lance. Lower it with the pace, after the clip has posed the neck (13 Nov).
      if (!this._neck) this._neck = [this.model.getObjectByName('Neck1'), this.model.getObjectByName('Neck2')];
      { const k = (0.35 + 0.65 * g) * amp * (1 - this.rear); if (this._neck[0]) this._neck[0].rotation.x -= 0.42 * k; if (this._neck[1]) this._neck[1].rotation.x -= 0.22 * k; }
      this.modelPivot.rotation.x = -this.rear * 0.62; this.modelPivot.position.y = this.rear * 0.1;
      this.root.updateMatrixWorld(true);
      const by = this.root.worldToLocal(this.backBone.getWorldPosition(_v3)).y - this.backRest;
      this.body.position.y = (BY + this.rear * 0.25) * this.hs + by;
      this.body.rotation.x = pitch * 0.5 - this.rear * 0.62;
      this.bob = by;
    }

    // neck & head: stretch out at the gallop, nod with the stride
    const idle = (1 - amp) * (Math.sin(t * 0.9) * 0.04 + Math.max(0, Math.sin(t * 0.31 + 1)) * 0.06);
    this.neck.rotation.x = lerp(-0.02, 0.24, g) + g * 0.07 * Math.sin(cyc + 1.2) + idle + this.rear * 0.25;
    this.head.rotation.x = lerp(0.12, -0.2, g) - g * 0.05 * Math.sin(cyc + 1.2) + idle * 0.5;
    const ag = this.agit || 0;
    this.head.rotation.z = Math.sin(t * 8.5) * 0.16 * ag * (0.5 + 0.5 * Math.sin(t * 1.3)); this.neck.rotation.y = Math.sin(t * 3.1) * 0.1 * ag;
    this.neck.rotation.x -= Math.max(0, Math.sin(t * 2.2)) * 0.12 * ag + this.toss * 0.5; this.body.rotation.x += this.chk * 0.06; this.head.rotation.x -= this.toss * 0.4;
    if (this._neck) { if (this._neck[0]) this._neck[0].rotation.x += this.toss * 0.25; if (this._neck[1]) this._neck[1].rotation.x += this.toss * 0.35; }
    this.tail.rotation.x = lerp(0.08, 0.95, g * amp) + Math.sin(cyc + 1) * 0.1 * amp + Math.sin(t * 1.3) * 0.04;
    this.tail.rotation.z = Math.sin(t * 2.1) * 0.08 + Math.sin(cyc * 0.5) * 0.1 * amp;

    // caparison flutter
    {
      const k = 0.25 + 0.75 * g * amp;
      for (const cap of this.caps) {
        const a = cap.geo.attributes.position.array, b = cap.base, w = cap.wts;
        for (let i = 0, j = 0; i < a.length; i += 3, j++) {
          const wt = w[j]; if (wt === 0) continue;
          const sgn = Math.sign(b[i]);
          const f = Math.sin(b[i + 2] * 6 - t * (4 + 9 * amp) + sgn) * 0.035 * k + Math.sin(b[i + 2] * 11 + t * 6.3) * 0.012 * k;
          a[i] = b[i] + sgn * (f + 0.03 * g * amp) * wt * wt;
          a[i + 2] = b[i + 2] - 0.09 * g * amp * wt * wt + Math.sin(cyc + b[i + 2] * 2) * 0.02 * amp * wt;
          a[i + 1] = b[i + 1] + 0.05 * g * amp * wt * wt;
        }
        cap.geo.attributes.position.needsUpdate = true;
        if ((cap.n++ & 3) === 0) cap.geo.computeVertexNormals();
      }
    }

    // rider posture
    if (this.going) { this.recoilV = 0; this.recoil = Math.min(1.5, this.recoil + 4.0 * dt); this.going.t -= dt; if (this.going.t <= 0) this._detach(); }
    else { this.recoilV += (-this.recoil * 38 - this.recoilV * 6.5) * dt; this.recoil += this.recoilV * dt; }
    this.sideRecoilV += (-this.sideRecoil * 34 - this.sideRecoilV * 6) * dt; this.sideRecoil += this.sideRecoilV * dt;
    this.twistV += (-this.twist * 30 - this.twistV * 6) * dt; this.twist += this.twistV * dt;            // shoulders turned by a blow off the spine
    this.headV += (-this.headK * 70 - this.headV * 9) * dt; this.headK += this.headV * dt;                // the head snapped back
    this.shV += (-this.shK * 60 - this.shV * 9) * dt; this.shK += this.shV * dt;                          // the shield driven in against the chest
    this.stagV += (-this.stag * 26 - this.stagV * 5) * dt; this.stag += this.stagV * dt;                  // the horse rocked sideways under the blow
    this._reactStep(dt);
    { const sg = clamp(this.stag, -0.16, 0.16); this.body.rotation.z = sg; if (this.modelPivot) this.modelPivot.rotation.z = sg; }
    const off = this.replaying ? this.snapUnhorsed : this.unhorsed;
    if (!off) {
      this.rider.position.y = -bob * 0.12 + g * amp * 0.035 * Math.sin(cyc + 3.4) + this.brace * 0.045;
      this.rider.position.z = this.brace * 0.07 + this.push;
      this.rider.rotation.x = -this.body.rotation.x * 0.75;
      // the body is thrown back as the horse surges and pitches forward as he checks
      const acc = dt > 0 ? (sp - (this.prevSp ?? sp)) / dt : 0; this.prevSp = sp;
      this.accLean = damp(this.accLean || 0, clamp(-acc * 0.028, -0.2, 0.24), 5, dt);
      this.torso.rotation.x = 0.05 + 0.13 * g * amp + this.brace * 0.44 + this.lean + this.accLean - clamp(this.recoil, -0.4, 1.5) - this.shd + g * amp * 0.03 * Math.sin(cyc + 2.6);
      this.torso.rotation.z = clamp(this.sideRecoil, -0.6, 0.6);
      this.torso.rotation.y = 0.12 * this.lanceLower + this.look * 0.6 + clamp(this.twist, -0.7, 0.7);
      this.helm.rotation.x = -0.05 * g + clamp(this.recoil, -0.3, 0.6) * 0.5 - this.brace * 0.2 - clamp(this.headK, -0.3, 0.6);   // chin down, eyes still on the mark
      this.helm.rotation.y = 0.25 * this.lanceLower + this.look * 1.9 + clamp(this.hY, -0.8, 0.8); this.helm.rotation.z = clamp(this.hS, -0.6, 0.6);
      // shield guard: raised it covers the helm and bares the body
      const gd = this.guard, sk_ = clamp(this.shK, -0.3, 0.8); this.shield.position.y = 0.29 + 0.2 * gd - 0.04 * sk_; this.shield.rotation.x = -0.08 - 0.22 * gd - 0.5 * sk_; this.shield.rotation.z = 0.06 + this._vAsk; this.shield.position.z = 0.2 + 0.03 * gd - 0.07 * sk_;
      this.lance.position.z = 0.25 + this.brace * 0.2 + this.jZ;       // the thrust: the arm drives the lance forward as the body goes in
      this.lance.position.y = 0.13 + 0.25 * this.raise;      // lifted in the hand when he shows he is ready
      this.zones[1].o.position.y = 0.3 + 0.21 * gd; this.zones[0].r = 0.17 * (1 - 0.55 * gd);
    } else if (!this.replaying && !this.remote) this._updateFall(dt);      // (online, the friend's fallen rider is placed from his own stream: see online.js applyRider)
    this.plume.rotation.x = -0.15 - 0.5 * g * amp + Math.sin(t * 7) * 0.05 * (0.3 + amp);
    // raised lance, visor swing and helm on/off
    if (!this.replaying) this.raise = damp(this.raise, this.raiseT, 7, dt);
    if ((!this.helmOff) !== this._helmShown) this._showHelm(!this.helmOff);
    if (!this._vPlume) this.plume.visible = false;      // knocked off by a blow (it flew as a piece, see main.js strike)
    if (this.visor) { this._vk = damp(this._vk, this.visorUp && !this.helmOff ? 1 : 0, 14, dt); this.visor.rotation.x = -1.25 * this._vk; }   // up and back over the brow, about a quarter of a second

    if (this.ribbon.visible) {
      const a = this.ribbon.geometry.attributes.position.array, b = this.ribbonBase;
      for (let i = 0; i < a.length; i += 3) { const w = -b[i + 1] / 0.62; a[i] = b[i] + Math.sin(t * 9 + b[i + 1] * 14) * 0.05 * w; a[i + 2] = Math.sin(t * 7 + b[i + 1] * 9) * 0.04 * w; }
      this.ribbon.geometry.attributes.position.needsUpdate = true;
      this.ribbon.rotation.x = 0.15 + clamp(sp / 11, 0, 1) * 1.1 * this.lanceLower;
    }
    this.applyLance();
  }

  /** Point the lance along aimLocal (blended with the upright carry). Safe to call again after re-aiming. */
  applyLance() {
    this.root.updateMatrixWorld(true);
    if (!(this.replaying ? this.snapUnhorsed : this.unhorsed)) {
      _v.copy(this.aimLocal); this._clearHorse(_v);                          // the lance is carried across the neck, never through it
      _v.applyQuaternion(this.root.quaternion);                              // world
      this.torso.getWorldQuaternion(_q).invert();
      _v.applyQuaternion(_q);                                                // torso-local
      _q2.setFromUnitVectors(Z, _v.normalize());
      this.lance.quaternion.copy(this.lanceRestQ).slerp(this.lanceUpQ, smoothstep(0, 1, this.raise)).slerp(_q2, smoothstep(0, 1, this.lanceLower));
      if (this.wX || this.wY || this.jX || this.jY) { _we.set(clamp(this.wX + this.jY * 0.3, -0.5, 0.5), clamp(this.wY + this.jX * 0.3, -0.5, 0.5), 0); this.lance.quaternion.multiply(_wq.setFromEuler(_we)); }      // the whip of a lance that struck, the jolt of the arm that was struck
      if (this.replaying && this.snapLR) this._lanceFromRel(this.snapLR);      // a replay shows the recorded pose, not a recomputed one
      this.lance.updateMatrixWorld(true);
    }
    // reins: bit -> bridle hand (or the saddle bow once the rider is gone)
    const tgt = (this.replaying ? this.snapUnhorsed : this.unhorsed) ? this.pommel : this.hand;
    tgt.getWorldPosition(_v2); this.root.worldToLocal(_v2);
    for (let i = 0; i < 2; i++) {
      this.bit[i].getWorldPosition(_v); this.root.worldToLocal(_v);
      const r = this.reins[i]; _v3.subVectors(_v2, _v); const len = _v3.length();
      r.position.copy(_v).addScaledVector(_v3, 0.5); r.scale.set(1, len, 1); r.quaternion.setFromUnitVectors(Y, _v3.divideScalar(len || 1));
    }
  }

  /**
   * The unhorsed rider falls as one rigid body under gravity: head, hips and heels can each strike the ground, and every contact
   * gives an impulse with a little bounce and the sand's friction, so he lands on whatever comes down first, turns over it, slides and lies still.
   */
  _updateFall(dt) {
    const f = this.fall, r = this.rider, F = PHYS.fall;
    const pts = FALL_PTS, n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let s = 0; s < n && h > 0; s++) {
      f.v.y -= 9.81 * h;
      r.position.addScaledVector(f.v, h);
      const wl = f.w.length();
      if (wl > 1e-5) { _q.setFromAxisAngle(_v.copy(f.w).divideScalar(wl), wl * h); r.quaternion.premultiply(_q).normalize(); }
      let touching = false;
      for (const p of pts) {
        _v.set(p[0], p[1], p[2]).applyQuaternion(r.quaternion);                 // arm from the body's origin to this point
        const pen = p[3] - (r.position.y + _v.y);
        if (pen <= 0) continue;
        touching = true; r.position.y += pen;
        _v2.crossVectors(f.w, _v).add(f.v);                                     // velocity of the point
        const rn = _v3.set(-_v.z, 0, _v.x);                                     // r x n, n = up
        if (_v2.y < 0) {
          const jn = -(1 + F.bounce) * _v2.y / (1 / F.kg + rn.lengthSq() / F.inertia);
          if (!f.landed && _v2.y < -1.2) { f.landed = true; if (this.onLand) this.onLand(r.position, Math.abs(_v2.y)); }
          else if (f.landed && _v2.y < -1.6 && f.bounceT <= 0) { f.bounceT = 0.15; if (this.onBounce) this.onBounce(r.position, Math.abs(_v2.y)); }      // each later knock on the sand
          f.v.y += jn / F.kg; f.w.addScaledVector(rn, jn / F.inertia);
          // friction against the sliding of the point
          const tx = _v2.x, tz = _v2.z, tl = Math.hypot(tx, tz);
          if (tl > 1e-4) {
            const jt = Math.min(F.friction * jn, tl * F.kg * 0.6), ix = -tx / tl * jt, iz = -tz / tl * jt;
            f.v.x += ix / F.kg; f.v.z += iz / F.kg;
            f.w.x += (_v.y * iz) / F.inertia; f.w.z += (-_v.y * ix) / F.inertia; f.w.y += (_v.z * ix - _v.x * iz) / F.inertia;
          }
        }
      }
      f.bounceT -= h;
      if (touching) { f.skidT -= h; const gs = Math.hypot(f.v.x, f.v.z); if (gs > PHYS.impact.fall.skid && f.skidT <= 0) { f.skidT = 0.07; if (this.onSkid) this.onSkid(r.position, gs, f.v); } }      // a slide: the sand is thrown up behind him
      if (touching) { const k = Math.exp(-2.2 * h); f.w.multiplyScalar(k); f.v.x *= Math.exp(-1.4 * h); f.v.z *= Math.exp(-1.4 * h); }
      if (touching && f.v.lengthSq() < 0.05 && f.w.lengthSq() < 0.2) { f.still += h; if (f.still > 0.4) { f.v.set(0, 0, 0); f.w.set(0, 0, 0); } } else f.still = 0;
    }
    this.torso.rotation.x = damp(this.torso.rotation.x, -0.15, 4, dt);
    // the limbs trail: head, shield arm and lance lag behind the body's turning (they are not on springs of their own, so they follow his spin late)
    { const k = 1 - Math.exp(-7 * dt); f.wl.lerp(f.w, k); _v.copy(f.wl).sub(f.w).applyQuaternion(_q.copy(r.quaternion).invert());
      this.helm.rotation.x = clamp(_v.x * 0.14, -0.7, 0.7); this.helm.rotation.z = clamp(-_v.z * 0.14, -0.6, 0.6); this.helm.rotation.y = clamp(_v.y * 0.1, -0.5, 0.5);
      this.shield.rotation.x = -0.08 + clamp(_v.x * 0.1, -0.5, 0.5); this.shield.rotation.z = 0.06 + this._vAsk + clamp(-_v.z * 0.12, -0.6, 0.6); this.torso.rotation.z = clamp(-_v.z * 0.05, -0.3, 0.3); }
    this.lance.quaternion.slerp(this.lanceRestQ, 1 - Math.exp(-3 * dt));
  }
}
