import * as THREE from 'three';
import { TAU, clamp, lerp, smoothstep, damp, loft, loftMesh, limb, ball, box, armsTexture, trapperTexture, canvasTex, wobble, photoTex } from './util.js';
import { liveryOf } from './heraldry.js';
import { dressHelm } from './crest.js';
import { makePBR } from './texgen.js';
import { PHYS } from './data.js';
import { lanceRadius, rng32 } from './physics.js';
import { Ragdoll, RAG_POINTS, RI } from './ragdoll.js';
import { Cap, Obb, Hit, capCapGap, capObbGap, closestSegSeg, SS } from './collide.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { touchMode } from './touch.js';
import { GFX, wantNewModels } from './gfx.js';
import { expect, progress, done } from './loadmeter.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celStep, celBody, celLance, celArms } from './celebrate.js';
import { RIG, KS, riderWanted, figureFor, buildRigRider, poseRig, armsRig, rideStep, fitLegs, legsRig, posePose, rideSave, rideLoad } from './rider_rig.js';
import { applyBody } from './body_types.js';

// The rigged horse (Quaternius, CC0). Loaded once; every rider gets his own skinned copy.
// If it is missing the code-built horse is used instead.
let HORSE_MODEL = null;
const MODEL_SCALE = 0.52, MODEL_Z = -0.1;
const SEAT_BACK = -0.08;      // the saddle sits this far (horse units) behind where the code-built one did: the rigged horse's shoulders are wider and higher, and the knees pushed into them
const SEAT_RISE = 0.16;       // m: pelvis above the horse's back (saddle tree, pad and the padding of the armoured thigh) — measured, see shots/horses/probe.js
let MODEL_WITHERS = 0;
// horse_new.glb (the modelled horse, 16 skinned parts with breed morphs) on high and medium; horse_smooth.glb (one coat mesh) on low. HORSE_NEW: the new one loaded.
const MODEL_DIR = new URL('../assets/models/', import.meta.url).href;
let HORSE_NEW = false, HORSE_SEAT = null;       // HORSE_SEAT: the file's own seat / withers numbers (model units, before MODEL_SCALE)
const HORSE_COATS = {};                          // breed -> coat texture (the new horse's per-breed baked coats)
/** Height of the rigged horse's withers above the ground at scale 1 (metres, after MODEL_SCALE). The new horse states its withers in its file (the coat's crest is
 *  deeper than the withers there, so a measure of the top line over the shoulder reads high); the old one is measured once from its idle pose: the top of the
 *  spine over the shoulder bone (the coat mesh only, so the mane is not counted) above the lowest hoof. */
function modelWithers() {
  if (MODEL_WITHERS) return MODEL_WITHERS;
  if (HORSE_SEAT && HORSE_SEAT.withers) return MODEL_WITHERS = HORSE_SEAT.withers * MODEL_SCALE;
  const m = cloneSkinned(HORSE_MODEL.scene); m.scale.setScalar(MODEL_SCALE);
  const mx = new THREE.AnimationMixer(m), c = HORSE_MODEL.animations.find(a => a.name === 'Idle'); if (c) mx.clipAction(c).play(); mx.update(0);
  m.updateMatrixWorld(true);
  const v = new THREE.Vector3(); let ground = 1e9, top = 0;
  // the withers stand over the point of the shoulder; the idle pose's top line has no peak to find (it climbs straight into the neck), so take the bone
  const sh = m.getObjectByName('FrontShoulderL'), zs = sh ? sh.getWorldPosition(v.clone()).z : 0.7;
  m.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material], coat = mats.some(x => x.name === 'Main' || x.name === 'Coat'), P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); ground = Math.min(ground, v.y);
      if (coat && Math.abs(v.x) < 0.12 && Math.abs(v.z - zs) < 0.06) top = Math.max(top, v.y);
    }
  });
  return MODEL_WITHERS = top - ground;
}
const DRAPE_FIT = new Map();   // caparison fit per horse scale + girth: the rigged horse's top and half-width under each drape point
// horse_smooth.glb: the Quaternius horse welded, subdivided twice and smooth-shaded in Blender (13 Nov), one coat material; same rig and clips.
export async function preloadHorse(url) {
  expect('horse', 'boot', GFX.tier === 'low' ? 2.6e6 : 3.9e6); expect('knight', 'boot', 2.2e6);
  const knight = preloadKnight();      // (both models download side by side)
  const wantNew = !url && wantNewModels() && new URLSearchParams(location.search).get('horse') !== 'old';      // ?horse=old: the smooth horse on any tier
  const tryLoad = async (u, mgr) => new GLTFLoader(mgr).loadAsync(u, (e) => progress('horse', e));
  HORSE_MODEL = null; HORSE_NEW = false; HORSE_SEAT = null; MODEL_WITHERS = 0;
  if (wantNew) {
    try {
      // medium: the 512 textures (the file names them horse/<name>; they sit in horse/512/ too, all but the mane's hair texture)
      const mgr = new THREE.LoadingManager(); if (GFX.tier !== 'high') mgr.setURLModifier((u) => u.replace(/\/horse\/(horse_(?:normal|coat_[a-z]+)\.(?:png|jpg))/, '/horse/512/$1'));
      const g = await tryLoad(MODEL_DIR + 'horse_new.glb', mgr), seat = g.parser.json.scenes[0].extras && g.parser.json.scenes[0].extras.seat;
      if (!seat) throw new Error('horse_new.glb carries no seat data');
      HORSE_MODEL = g; HORSE_SEAT = seat; HORSE_NEW = true;
      const tl = new THREE.TextureLoader(), dir = MODEL_DIR + (GFX.tier === 'high' ? 'horse/' : 'horse/512/');
      await Promise.all(['destrier', 'courser', 'andalusian', 'rouncey'].map(b => new Promise((ok) => tl.load(`${dir}horse_coat_${b}.jpg`, (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = GFX.aniso || 4; HORSE_COATS[b] = t; ok(); }, undefined, () => ok()))));
    } catch (e) { HORSE_MODEL = null; HORSE_NEW = false; HORSE_SEAT = null; console.warn('new horse unavailable, using the smooth horse', e); }
  }
  if (!HORSE_MODEL) { try { HORSE_MODEL = await tryLoad(url || MODEL_DIR + 'horse_smooth.glb'); } catch (e) { HORSE_MODEL = null; console.warn('horse model unavailable, using the built-in horse', e); } }
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


// the modelled horse's body volumes (PHYS.hitboxes horseChest / horseBarrel / horseQuarters were measured on the older model): capsule ends and radius in inner units
// (the model's metres at MODEL_SCALE, before the breed's scale), measured on the barrel, haunch and shoulder over the gaits (shots/horsefit)
const NEW_BODY = { horseChest: { a: [0, 1.45, 0.45], b: [0, 1.45, 0.78], r: 0.34 }, horseBarrel: { a: [0, 1.45, -0.5], b: [0, 1.45, 0.25], r: 0.41 }, horseQuarters: { a: [0, 1.5, -1.05], b: [0, 1.5, -0.65], r: 0.42 } };
const CAP_FLARE = 0.13;      // model units (x MODEL_SCALE x breed scale = metres, about 5 cm): how far the caparison's hem stands out from the barrel, each side
const SEAT_FWD_NEW = 0.03;     // m: the rider sits this far forward of the file's seat point (off the cantle's wrap)
const SEAT_RISE_NEW = 0.115;   // m: pelvis above the new saddle's leather (the fauld and the padding of the thigh stand on it); see shots/horsefit
const BAKED = new WeakMap();   // source geometry -> baked geometry per breed index
/** A copy of a morphed geometry with breed `bi` applied (the file's morphs are relative offsets), without the morph targets: sharable, cheaper to draw. */
function bakeBreed(geo, bi) {
  let list = BAKED.get(geo); if (!list) BAKED.set(geo, list = []);
  if (list[bi]) return list[bi];
  const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index); geo.groups.forEach(gr => g.addGroup(gr.start, gr.count, gr.materialIndex));
  for (const key of ['position', 'normal']) {
    const base = geo.attributes[key], mt = geo.morphAttributes[key] && geo.morphAttributes[key][bi]; if (!base || !mt) continue;
    const a = new Float32Array(base.count * 3), rel = geo.morphTargetsRelative;
    for (let i = 0; i < a.length; i++) a[i] = rel ? base.array[i] + mt.array[i] : mt.array[i];
    if (key === 'normal') for (let i = 0; i < a.length; i += 3) { const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1; a[i] /= l; a[i + 1] /= l; a[i + 2] /= l; }
    g.setAttribute(key, new THREE.BufferAttribute(a, 3));
  }
  list[bi] = g; return g;
}

const BY = 1.22;                 // barrel centre height (body pivot)
export const LANCE_REACH = 2.8;  // grip -> tip of the code-built lance (low tier); the rigged rider's lance is its modelled length, Jouster.reach
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
const FALL_PTS_RIG = FALL_PTS.map(p => p.map(v => v * KS));      // (the rigged rider is KS times the old one)
const WALK_OFF = [0.25, 0.75, 0.0, 0.5];   // FL FR HL HR
const GALLOP_OFF = [0.40, 0.52, 0.0, 0.12];

const _fq = new THREE.Quaternion(), _fv = new THREE.Vector3(), _fq2 = new THREE.Quaternion(), _fq3 = new THREE.Quaternion(), _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3();
// The two authored unhorsing falls (assets/motion/yt, from the mocap pass: timeline read off footage, joint angles estimated). Additive degrees per
// Mixamo bone (x pitch: the bone's far end forward; z roll: its far end to his left; y yaw: turn left) and the pelvis path from the saddle (hipsRel, m,
// horse frame: x left, y up, z forward). Loaded once; until they arrive (or if they are missing) the old rigid-body fall is used.
const FALL_CLIPS = {};
for (const [k, f] of [['cantle', 'rider_fall_over_cantle'], ['side', 'rider_fall_sideways_tumble']]) {
  try { fetch(`assets/motion/yt/${f}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.euler_deg) FALL_CLIPS[k] = d; }).catch(() => {}); } catch (e) { /* no fetch (node) */ }
}
const FALL_BONES = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
const FALL_STYLE = ['cantle', 'side'];
// The ragdoll drives these bones: [bone, from point, to point, ref from, ref to] (the bone's long axis from -> to; ref fixes the roll), or a blend
// of two others ([bone, 'mix', a, b, share]). Listed parents first.
const RAG_BONES = [
  ['Hips', 'pelvis', 'chest', 'hipR', 'hipL'], ['Spine2', 'pelvis', 'chest', 'shR', 'shL'], ['Spine', 'mix', 'Hips', 'Spine2', 1 / 3], ['Spine1', 'mix', 'Hips', 'Spine2', 2 / 3],
  ['Head', 'chest', 'head', 'shR', 'shL'], ['Neck', 'mix', 'Spine2', 'Head', 0.5],
  ['LeftArm', 'shL', 'elL', 'shR', 'shL'], ['LeftForeArm', 'elL', 'haL', 'shR', 'shL'], ['LeftHand', 'elL', 'haL', 'shR', 'shL'],
  ['RightArm', 'shR', 'elR', 'shR', 'shL'], ['RightForeArm', 'elR', 'haR', 'shR', 'shL'], ['RightHand', 'elR', 'haR', 'shR', 'shL'],
  ['LeftUpLeg', 'hipL', 'knL', 'hipR', 'hipL'], ['LeftLeg', 'knL', 'anL', 'hipR', 'hipL'], ['LeftFoot', 'anL', 'toL', 'hipR', 'hipL'],
  ['RightUpLeg', 'hipR', 'knR', 'hipR', 'hipL'], ['RightLeg', 'knR', 'anR', 'hipR', 'hipL'], ['RightFoot', 'anR', 'toR', 'hipR', 'hipL'],
];
const _rm = new THREE.Matrix4(), _rx = new THREE.Vector3(), _ry = new THREE.Vector3(), _rz = new THREE.Vector3();
/** A rotation whose x axis runs along a (from -> to) and whose z axis is square to a and to the ref direction (unit quaternion into o). */
function ragBasis(P, a, b, c, d, o) {
  _rx.set(P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]).normalize();
  _ry.set(P[3 * d] - P[3 * c], P[3 * d + 1] - P[3 * c + 1], P[3 * d + 2] - P[3 * c + 2]);
  _rz.crossVectors(_rx, _ry); if (_rz.lengthSq() < 1e-8) _rz.set(0, 0, 1).cross(_rx); _rz.normalize(); _ry.crossVectors(_rz, _rx);
  return o.setFromRotationMatrix(_rm.makeBasis(_rx, _ry, _rz));
}
/** Value of a clip channel at t seconds (linear between samples, held at the ends). */
function clipAt(arr, fps, t) {
  if (!arr || !arr.length) return 0;
  const x = Math.max(0, t * fps), i = Math.min(arr.length - 1, Math.floor(x)), j = Math.min(arr.length - 1, i + 1), f = Math.min(1, x - i);
  return arr[i] + (arr[j] - arr[i]) * f;
}
/** The pelvis offset from the saddle at t, in the horse frame, mirrored to his right when he goes off that side (out = -1). */
function hipsAt(c, t, out, k, o) { const h = c.hipsRel_m || {}; return o.set(clipAt(h.x, c.fps, t) * out * k, clipAt(h.y, c.fps, t), clipAt(h.z, c.fps, t) * k); }
const _v4 = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bv = new THREE.Vector3(), _bp = new THREE.Vector3(), _we = new THREE.Euler(), _wq = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
const _lvI = new THREE.Quaternion(), _lvA = new THREE.Vector3(), _lvB = new THREE.Vector3(), _lvC = new THREE.Vector3(), _lvD = new THREE.Vector3(), _lvP = new THREE.Quaternion();
const _hm = new THREE.Matrix4(), _hm2 = new THREE.Matrix4(), _dv = new THREE.Vector3(), _hit = new Hit(), _cs = new Cap();
const _he = new THREE.Euler(), _hq = new THREE.Quaternion(), _hv = new THREE.Vector3(), _hp = new THREE.Vector3();
const _ua = new THREE.Quaternion(), _ub = new THREE.Quaternion(), _uc = new THREE.Quaternion(), _uv = new THREE.Vector3();      // (aim-share undo in tipWorld)
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
    this.reach = LANCE_REACH; this.rs = 1;   // grip -> tip of the lance in hand (the rigged rider sets its own, see _buildRigRider) and that over LANCE_REACH
    this.visor = null; this.visorUp = false; this.helmOff = false; this._vk = 0; this._helmShown = false;   // visor hinge group (bascinet, armet only); visor swing 0..1; helm taken off
    this.lanceLower = 0; this.lean = 0; this.recoil = 0; this.recoilV = 0; this.sideRecoil = 0; this.sideRecoilV = 0;
    this.brace = 0; this.unhorsed = false; this.lanceBroken = false; this.rear = 0;
    this.twist = 0; this.twistV = 0; this.headK = 0; this.headV = 0; this.shK = 0; this.shV = 0; this.stag = 0; this.stagV = 0;
    this.aimLocal = new THREE.Vector3(0.18, 0, 1).normalize();      // the couch yaw (10 deg): footage lances sit 8-12 deg across the horse's neck
    this.aimEase = 1; this.gripUp = 0; this.carry = 0; this._lf = null;
    this.prevLegPhase = [0, 0, 0, 0];
    this.onHoof = null; this.time = Math.random() * 10;
    this.fall = null; this.caps = [];
    this.cantle = 1; this.lock = 1; this.strength = 1; this.flex = null; this._fxReset();      // strength: how quickly he comes back upright after a blow (his seat; main.js sets it)      // the kit's saddle (main.js sets them per match): a high cantle stops a rider bending back, a locked seat throws him less
    // armour damage: each region 0..1; dlog = every blow that marked it (key orders it in time, for replays); see damage()
    this.dmg = { shield: 0, helm: 0, breast: 0, pauldronL: 0 }; this.dlog = []; this.askew = 0; this._vAsk = 0; this._vd = { shield: 0, helm: 0, breast: 0, pauldronL: 0 };
    this._vPlume = true; this._plumeGone = false; this._dirty = new Set(); this._shMarks = []; this._vN = 0; this._cut = 0; this._cutSide = 1; this._cloth = [];
    this._buildMaterials();
    this._buildHorse();
    if (HORSE_MODEL) { if (HORSE_NEW) this._attachNewHorse(); else this._attachModelHorse(); }
    // the horse's scale goes on before the rider is built: his hit volumes are placed in the finished frame
    const gx = this.hs * (horse.girth ?? 1);
    this.body.scale.set(gx, this.hs, this.hs); this.mount.scale.set(1 / gx, 1 / this.hs, 1 / this.hs);
    this.seatY = 1.71 * this.hs; if (this.hasModel) { if (this.newHorse) this._seatOnNew(); else this._seatOnBack(); }
    this._buildRider();
    applyBody(this, this.arms.body);      // sex, height, build and face: drawn only, the skeleton and the hit volumes stay standard (src/body_types.js)
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
    const tex = armsTexture(a, 512, 512, [1, 1], { style: 'cloth' });
    const clothN = photoTex('rough_linen', 'nor_gl', [9, 9]);
    const weave = fancy && T_CLOTH.normalMap ? { normalMap: T_CLOTH.normalMap, roughnessMap: T_CLOTH.roughnessMap } : { normalMap: clothN };
    this.cloth = nScale(wool({ map: tex, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.3, ...weave }), 0.25);
    this.clothPlain = nScale(wool({ color: a.c1, roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.3, ...weave }), 0.25);
    this.cloth2 = nScale(wool({ color: a.c2, roughness: 0.9, envMapIntensity: 0.3, ...weave }), 0.25);
    this.shieldMat = new THREE.MeshStandardMaterial({ map: armsTexture(a, 512, 512, undefined, { style: 'paint' }), roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide });
    this.lanceMat = new THREE.MeshStandardMaterial({
      map: canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = a.c1; g.fillRect(0, 0, w, h); g.fillStyle = a.c2;
        for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32 + 48); g.lineTo(w, i * 32 + 64); g.lineTo(0, i * 32 + 16); g.fill(); }
      }), roughness: 0.45, envMapIntensity: 0.6, normalMap: T_WOOD.normalMap,
    });
    this.armour = phoneMetal(nScale(new THREE.MeshStandardMaterial({ color: a.armourTint ?? AR.tint ?? 0xb4bac3, metalness: 1, roughness: (AR.rough ?? 0.24) + 0.06, envMapIntensity: 1.2, normalMap: T_STEEL.normalMap, roughnessMap: T_STEEL.roughnessMap }), 0.3));
    this.mail = phoneMetal(nScale(new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: 0.9, roughness: 0.55, envMapIntensity: 0.8, normalMap: T_MAIL.normalMap, map: T_MAIL.map }), 1.2));
    this.surcoat = nScale(new THREE.MeshStandardMaterial({ map: armsTexture(a, 256, 256, [2, 2], { style: 'cloth' }), roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3, normalMap: clothN }), 0.6);
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
    if (this.capMeshes) {      // the skinned cloth of the modelled horse
      const N = this.parts, full = style === 'livery' || style === 'plain', mat = style === 'plain' ? this.clothPlainSk : this.clothSk;
      for (const k of ['Caparison', 'CaparisonRear']) if (N[k]) { N[k].visible = k === 'Caparison' ? full : style === 'half'; N[k].traverse(o => { if (o.isSkinnedMesh && !this.bossMeshes.includes(o)) o.material = mat; }); }
      for (const o of this.bossMeshes) o.visible = style === 'livery';
      for (const o of this.padMeshes) o.visible = !full;
      for (const k of ['BreastStrap', 'Girth', 'Crupper']) if (N[k]) N[k].visible = !full;      // (all under the cloth; skinned on their own, their edges would show through it in places)
      return;
    }
    const D = this._drapes || [], front = D[0], rear = D[1], plain = style === 'plain';
    for (const x of D) if (x.mesh) x.mesh.material = plain ? this.clothPlain : this.cloth;
    if (front) front.mesh.visible = style === 'livery' || plain;
    if (rear) rear.mesh.visible = this.newHorse ? style === 'half' : style !== 'none';      // the modelled horse wears one cloth (front); 'half' is its crupper piece alone
    for (const b of this._bosses || []) b.visible = style === 'livery';
  }

  /** Re-cut a built drape to new [z, topY, halfWidth] points (same vertex layout, so the flutter code keeps working). */
  _refitDrape(D, st) {
    const d = this._drapeData(st, D.hem, D.opts), pa = D.mesh.geometry.attributes.position;
    pa.array.set(d.pos); pa.needsUpdate = true; D.cap.base.set(d.pos); D.mesh.geometry.computeVertexNormals(); D.st = st;
  }

  _drapeData(st, hemBase, { closeStart = false, closeEnd = false, uRep = 1.6, hang = 0.3, ns = 28, round = [0, 0] } = {}) {
    const curve = new THREE.CatmullRomCurve3(st.map(s => new THREE.Vector3(s[2], s[1], s[0])), false, 'catmullrom', 0.5);
    const NS = ns, pts = curve.getPoints(NS - 1);
    const ARC = 8, HANG = 8, half = ARC + HANG, cols = half * 2 + 1;
    // st[i][3]: the cross-section the cloth must clear, y at x = hw * sin(th) for the nine arc columns (the new horse's body is not a quarter ellipse); rows lerp between points
    const profAt = (f) => { if (!st[0][3]) return null; const p = f * (st.length - 1), k = Math.min(st.length - 2, Math.floor(p)), u = p - k; return st[k][3].map((y, j) => y + (st[k + 1][3][j] - y) * u); };
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
      const prof = profAt(f), yEnd = prof ? prof[ARC] : top - hang;
      const hemY = lerp(hemBase + dag, yEnd - 0.12, rise * 0.55);
      for (let j = 0; j < cols; j++) {
        const k = j - half, s = Math.sign(k), a = Math.abs(k);
        let x, y, w = 0;
        if (a <= ARC) { const th = (a / ARC) * Math.PI / 2; x = Math.sin(th) * hw; y = prof ? prof[a] : top - (1 - Math.cos(th)) * hang; }
        else {
          const t = (a - ARC) / HANG;
          // soft vertical folds: many small ones just under the top, fading as the cloth falls, and fewer, broader ones toward the hem (nothing at t = 0, so it lies on the body)
          const fine = Math.sin(t * Math.PI) * Math.pow(1 - t, 0.6), broad = t * t;
          x = hw * (1 + 0.1 * t) + 0.025 * t + (Math.sin(z * 21 + s * 1.3 + hemBase * 5) * 0.017 + Math.sin(z * 34 + s * 0.7) * 0.008) * fine + (Math.sin(z * 9 + s * 2.1 + hemBase * 3) * 0.04 + Math.sin(z * 14 + s * 0.4) * 0.015) * broad;
          y = lerp(yEnd, hemY, t); w = t;
        }
        // rounded ends: below the top the cloth's end edge is cut back along a quarter circle, so the corners are soft, not square
        let zz = z; const h = Math.max(0, top - y);
        if (round[0] > 0 && z - z0 < round[0]) { const R = round[0], c = Math.min(h, R); zz = Math.max(z, z0 + R - Math.sqrt(R * R - (R - c) * (R - c))); }
        if (round[1] > 0 && z1 - z < round[1]) { const R = round[1], c = Math.min(h, R); zz = Math.min(zz, z1 - (R - Math.sqrt(R * R - (R - c) * (R - c)))); }
        pos.push(s * x, y, zz); wts.push(w);
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
   * The modelled horse (horse_new.glb): sixteen skinned parts on the old rig, each with a morph per breed. Baked once per breed into plain skinned geometry
   * (shared by every horse of that breed), dressed in the breed's coat texture and the mane colour, with the tack shown or hidden. The file's own caparison panels are
   * left out: the game's procedural one (flutter, heraldry) is refitted to this body instead (_fitDrapesNew).
   */
  _attachNewHorse() {
    const m = this.model = cloneSkinned(HORSE_MODEL.scene), H = this.horseDef, bi = Math.max(0, ['destrier', 'courser', 'andalusian', 'rouncey'].indexOf(H.id));
    this.newHorse = true;
    const mats = new Map(), dress = (src) => {
      if (mats.has(src)) return mats.get(src);
      const c = src.clone(), n = src.name;
      if (n === 'Coat') { if (HORSE_COATS[H.id]) c.map = HORSE_COATS[H.id]; c.envMapIntensity = 0.6; c.roughness = 0.58; }
      else if (n === 'Hair') { c.color.set(H.mane ?? 0x15110e).multiplyScalar(1.5).addScalar(0.01); c.alphaTest = 0.4; c.transparent = false; c.alphaToCoverage = true; c.side = THREE.DoubleSide; c.envMapIntensity = 0.7; }
      else if (n === 'Cloth') { c.color.set(this.arms.c1).multiplyScalar(0.75); c.envMapIntensity = 0.3; }
      else if (n === 'Steel' || n === 'Brass') { c.envMapIntensity = 1.1; phoneMetal(c); }
      else c.envMapIntensity = 0.5;
      mats.set(src, c); return c;
    };
    // each part is a node: a SkinnedMesh, or a Group of them when it has several materials (the loader suffixes the names _1, _2)
    const N = this.parts = {}, bare = (o) => o.name.replace(/_\d+$/, '');
    for (const mesh of HORSE_MODEL.parser.json.meshes) {
      let best = null;
      m.traverse(o => { if (bare(o) === mesh.name && (o.isMesh || o.isGroup) && (!best || o.children.length > best.children.length)) best = o; });
      if (best) N[mesh.name] = best;
    }
    m.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.receiveShadow = true;
      const arr = Array.isArray(o.material); o.material = arr ? o.material.map(dress) : dress(o.material);
      const g = o.geometry; if (g.morphAttributes && g.morphAttributes.position) { o.geometry = bakeBreed(g, bi); o.morphTargetInfluences = undefined; o.morphTargetDictionary = undefined; }
    });
    for (const [k, node] of Object.entries(N)) { const shadow = k === 'HorseBody' || k === 'Mane' || k === 'Forelock' || k === 'ManeHogged' || k === 'Tail' || k === 'Feathers' || k === 'Saddle'; node.traverse(o => { if (o.isMesh) o.castShadow = shadow; }); }
    const show = (k, v) => { if (N[k]) N[k].visible = v; };
    // mane long, the destrier's feathers, the rest of the tack on (the caparison is the file's own skinned cloth: see _skinCloth)
    for (const k of ['ManeHogged']) if (N[k]) { N[k].removeFromParent(); delete N[k]; }
    for (const k of ['Saddle', 'Girth', 'BreastStrap', 'Crupper', 'Bridle', 'Bit', 'Reins']) show(k, true);
    show('Mane', true); show('Feathers', H.id === 'destrier');
    // the chanfron (a plate down the face) belongs to the later harnesses; the earlier periods ride without
    show('Chanfron', ['stechzeug', 'milanese'].includes(this.armourDef.id)); show('Forelock', !['stechzeug', 'milanese'].includes(this.armourDef.id));      // (the plate covers the forehead: no fringe under it)
    show('Stirrups', true);      // (the rider's own irons hang on his foot bones: this node is hidden while he is up, see _tackUpdate)
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
    // the rider rides the saddle itself, not a bone: a few vertices of the saddle's top around the seat point are skinned each frame (the bone sits ~3 cm off the leather at the gallop)
    { const S = HORSE_SEAT.seat_surface, found = [], p = new THREE.Vector3();
      N.Saddle.traverse(o => { if (!o.isSkinnedMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); const d = Math.hypot(p.x - S[0], p.z - S[2]); if (d < 0.35 && Math.abs(p.y - S[1]) < 0.1) found.push({ o, i }); } });
      this.seatVerts = found.length > 24 ? found.filter((_, k) => k % Math.ceil(found.length / 24) === 0) : found; this.seatRest = this._seatSample(); }
    // the reins: the model's own run from the bit to a fixed point at the bridle hand; a leather from that point to the rider's actual left hand (or the saddle bow) is drawn each frame
    this.reinEnd = (() => { const bone = m.getObjectByName('Neck2') || m.getObjectByName('Neck1'), o = new THREE.Object3D(); bone.add(o); o.position.copy(bone.worldToLocal(m.localToWorld(new THREE.Vector3(...HORSE_SEAT.rein_hand)))); return o; })();
    // hide the code-built animal; its invisible joints still carry the hit zones and hoof-fall timing
    this.neck.visible = false; this.tail.visible = false; this.legs.forEach(L => { L.upper.visible = false; });
    this.inner.children.forEach(c => { if (c.isMesh && (c.material === this.coat || c.material === this.clothPlain || c.material === leather)) c.visible = false; });
    this.saddle.visible = false;
    this.reins.forEach(r => { r.visible = false; });
    this.hasModel = true;
    if (N.Caparison) this._skinCloth(); else this._fitDrapesNew();
  }

  /**
   * The modelled horse wears the file's own caparison: one cloth skinned to the horse's bones with the body's weights (horse_new.glb 'Caparison', and 'CaparisonRear' for
   * the crupper alone), so it moves with the spine, shoulders and quarters in every clip, with no fit pass and nothing to lag or bounce. The game's own drapes (unskinned,
   * refitted at run time) are dropped here. Only the free hem moves on its own: a sway in the vertex shader (TEXCOORD_1.x = 0 on the body .. 1 at the hem), see update().
   */
  _skinCloth() {
    const N = this.parts;
    for (const D of this._drapes || []) { D.mesh.removeFromParent(); D.mesh.geometry.dispose(); const i = this.caps.indexOf(D.cap); if (i >= 0) this.caps.splice(i, 1); }
    this._drapes = []; for (const b of this._bosses || []) b.removeFromParent(); this._bosses = [];
    this.capU = { value: new THREE.Vector4(0, 0, 0, 0.25) };      // time, gallop, stride phase, strength
    // the hem (x: dags along one side, y: how deep they are cut, z: the width of the border band; all in the cloth's own hang, 0 body .. 1 hem) and the band's colour
    const trim = new THREE.Color(liveryOf(this.arms).trim).lerp(new THREE.Color(0x6a5a3a), 0.12);
    this.hemU = { value: new THREE.Vector4(26, GFX.tier === 'low' ? 0 : 0.13, 0.085, 0) }; this.trimU = { value: trim };
    const sway = (src) => {
      const m = src.clone(); m.customProgramCacheKey = () => 'capsk3';
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uCap = this.capU; sh.uniforms.uHem = this.hemU; sh.uniforms.uTrim = this.trimU;
        sh.vertexShader = 'attribute vec2 capw;\nuniform vec4 uCap;\nvarying vec2 vCapw;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          { float w = capw.x * sqrt(capw.x), ph = capw.y * 44.0, sd = sign(position.x); vCapw = capw;
            float fl = sin(ph - uCap.x * (4.0 + 9.0 * uCap.y) + sd) * 0.10 + sin(ph * 1.9 + uCap.x * 6.3) * 0.035;
            transformed += objectNormal * (fl * uCap.w * w); transformed.y += fl * 0.35 * uCap.w * w;       // the hem's flutter: across the cloth, with a ripple up and down the hem
            transformed.z -= 0.12 * uCap.y * w; transformed.y += (0.05 * uCap.y + sin(uCap.z + ph * 0.35) * 0.03 * uCap.y) * w;      // streaming back and lifting at speed, a beat with the stride
          }`);
        // the hem is finished in the shader, from the cloth's own "how far down the hang" (so it follows the hem wherever the cut puts it, on every breed):
        // dagged (scalloped tongues, cut out), a border band in the livery's metal with a dark seam above it, and the dirt a trapper picks up near the ground
        sh.fragmentShader = `uniform vec4 uHem; uniform vec3 uTrim; varying vec2 vCapw;
          float capH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float capN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(capH(i), capH(i + vec2(1.0, 0.0)), f.x), mix(capH(i + vec2(0.0, 1.0)), capH(i + vec2(1.0, 1.0)), f.x), f.y); }
          ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { float t = vCapw.x, f = fract(vCapw.y * uHem.x) * 2.0 - 1.0, sc = sqrt(max(0.0, 1.0 - f * f));
            float edge = 1.0 - uHem.y * (1.0 - sc), d = edge - t;
            if (d < 0.0) discard;
            float n = capN(vec2(vCapw.y * 140.0, t * 9.0)), n2 = capN(vec2(vCapw.y * 31.0, t * 3.0));
            float band = 1.0 - smoothstep(uHem.z - 0.006, uHem.z + 0.006, d);
            float seam = 1.0 - smoothstep(0.004, 0.014, abs(d - uHem.z - 0.012));
            diffuseColor.rgb = mix(diffuseColor.rgb, uTrim * (0.86 + 0.2 * n), band * step(0.0001, t));
            diffuseColor.rgb *= 1.0 - 0.5 * seam * step(0.0001, t);
            float soil = smoothstep(0.35, 1.0, t) * (0.3 + 0.7 * n2) * 0.3 + smoothstep(0.8, 1.0, t) * 0.1;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.52, 0.42) + vec3(0.03, 0.025, 0.02), soil);
          }`);
      };
      return m;
    };
    this.clothSk = sway(this.cloth); this.clothPlainSk = sway(this.clothPlain);
    // the skinned cloth's own picture: one flank panel, spine to hem (its v runs 1.3 on the spine to -0.34 at the longest hem), laid twice along the horse.
    // u runs tail to head on both flanks, so it is turned round: on the near (left) side the arms read true and face the horse's head, on the off side they are reversed, as on a real trapper.
    { const t = trapperTexture(this.arms, GFX.halfTex ? 512 : 1024, 1.64, 1.3, 0.22); t.repeat.set(-1, 1 / 1.64); t.offset.set(0, 0.34 / 1.64); this.clothSk.map = t; }
    this.capMeshes = []; this.bossMeshes = [];      // (the gilt bosses on the collar are part of the same node, skinned with the cloth)
    for (const k of ['Caparison', 'CaparisonRear']) if (N[k]) N[k].traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (o.material && o.material.name === 'Brass') { this.bossMeshes.push(o); o.castShadow = false; return; }
      const g0 = o.geometry, g = new THREE.BufferGeometry(); for (const a in g0.attributes) g.setAttribute(a, g0.attributes[a]);      // this rider's own copy of the positions (they are dented under his legs)
      g.setIndex(g0.index); g.setAttribute('position', g0.attributes.position.clone()); g.setAttribute('capw', g0.attributes.uv1 || new THREE.BufferAttribute(new Float32Array(g0.attributes.position.count * 2), 2));
      { const P = g.attributes.position, W = g.attributes.capw; for (let i = 0; i < P.count; i++) { const t = W.getX(i); if (t > 0) P.setX(i, P.getX(i) + Math.sign(P.getX(i)) * CAP_FLARE * Math.pow(Math.min(1, t), 1.5)); } }      // the trapper hangs from the barrel's widest part and stands out a little toward the hem (cloth has body, it is not a wet sheet): CAP_FLARE model units at the hem
      o.geometry = g; o.material = this.clothSk; o.castShadow = true; o.receiveShadow = true; if (k === 'Caparison') this.capMeshes.push(o);
    });
    this.padMeshes = []; if (N.Saddle) N.Saddle.traverse(o => { if (o.isMesh && o.material && o.material.name === 'Cloth') this.padMeshes.push(o); });      // the saddle cloth: under the caparison when one is worn
    this.setCaparison(this.caparison || 'livery');
  }

  /** Height (root frame) of the saddle's seat now: the mean of the skinned seat vertices. */
  _seatSample() {
    let y = 0; for (const { o, i } of this.seatVerts) { o.getVertexPosition(i, _v4); _v4.applyMatrix4(o.matrixWorld); y += this.root.worldToLocal(_v4).y; }
    return y / (this.seatVerts.length || 1);
  }

  /** Show the stirrup irons of the horse only while nobody's own are hanging on it: in the stable, and after the rider has come off. */
  _tackUpdate(off) {
    const st = this.parts && this.parts.Stirrups; if (!st) return;
    const v = !this.rider || !this.rider.parent || !!off;
    if (st.visible !== v) st.visible = v;
  }

  /** Seat the rider on the new saddle from the file's own seat point (scenes[0].extras.seat: the leather's top at (0, y, z), model units before MODEL_SCALE). */
  _seatOnNew() {
    const hs = this.hs, S = HORSE_SEAT, k = MODEL_SCALE * hs;
    this.body.position.y = BY * hs; this.mixer.update(0); this.root.updateMatrixWorld(true);
    const leatherY = S.seat_surface[1] * k, zSeat = MODEL_Z + S.seat_surface[2] * k + SEAT_FWD_NEW;        // root frame, metres
    this.backY = S.back_under_seat[1] * k; this.leatherY = leatherY;
    this.tack.position.z = zSeat / hs - this.mount.position.z;
    this.tack.position.y = (leatherY + SEAT_RISE_NEW) / hs - this.mount.position.y;
    this.seatY = leatherY + SEAT_RISE_NEW;
    this.pommel.position.set(0, (leatherY + 0.2) / hs - this.tack.position.y, (zSeat + 0.3 * hs) / hs - this.tack.position.z);
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


  /**
   * Cut the game's own caparison to the modelled horse. The model's body, crupper and breast strap are sampled in the inner frame (idle, trot and the gallop's phases),
   * and each of the two pieces is given, per slice, the half-width and the outside-in upper envelope the cloth must clear (+ a margin), so it lies over the withers, the
   * barrel and the croup without gaps, then hangs straight to near the fetlocks. The numbers are cached per breed (the shape depends on the breed's morph, scale and girth).
   */
  _fitDrapesNew() {
    if (!this._drapes) return;
    const H = this.horseDef, key = H.id + '|' + this.hs + '|' + (H.girth ?? 1);
    let fit = DRAPE_FIT.get(key);
    if (!fit) {
      const hs = this.hs, gx = H.girth ?? 1, v = new THREE.Vector3(), skinned = [];
      for (const k of ['HorseBody', 'Crupper', 'BreastStrap', 'Girth']) if (this.parts[k]) this.parts[k].traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      const Z0 = -1.3, Z1 = 1.25, DZ = 0.05, NZ = Math.round((Z1 - Z0) / DZ) + 1;
      const slice = Array.from({ length: NZ }, () => []);       // per z slice: [|x|, y] samples (inner frame)
      const A = this.act, setW = (i, g) => { A.idle.setEffectiveWeight(i); if (A.gallop) A.gallop.setEffectiveWeight(g); if (A.walk) A.walk.setEffectiveWeight(0); };
      const sample = () => {
        this.mixer.update(0); this.root.updateMatrixWorld(true);
        const by = this.newHorse ? this._seatSample() - this.seatRest : this.root.worldToLocal(this.backBone.getWorldPosition(_v3)).y - this.backRest;       // (the body group rides this: see update)
        for (const sm of skinned) {
          const n = sm.geometry.attributes.position.count;
          for (let i = 0; i < n; i++) {
            sm.getVertexPosition(i, v); v.applyMatrix4(sm.matrixWorld); this.root.worldToLocal(v);
            const x = Math.abs(v.x) / (hs * gx), y = (v.y - by) / hs, z = v.z / hs;
            if (y < 1.0) continue;
            const k = Math.round((z - Z0) / DZ); if (k >= 0 && k < NZ) slice[k].push(x, y);
          }
        }
      };
      setW(1, 0); this.mixer.setTime(0); sample();
      if (A.gallop) { setW(0, 1); for (let i = 0; i < 6; i++) { this.mixer.setTime(A.gallopLen * i / 6); sample(); } }
      setW(1, 0); this.mixer.setTime(0); this.mixer.update(0); this.root.updateMatrixWorld(true);      // back to the idle pose
      // per slice: the half-width of the barrel (and the height of its widest point), and the outside-in envelope at x
      const ARC = 8;
      // under the saddle the cloth lies close on the back (the saddle's tree sits on it); fore and aft of the saddle it stands a hand off the body
      const margin = (zc) => { const u = Math.min(1, Math.max(0, Math.min(zc + 0.55, 0.5 - zc) / 0.12)); return 0.035 + (0.013 - 0.035) * u * u * (3 - 2 * u); };
      const at = (zc, k = 1) => {
        const k0 = Math.round((zc - Z0) / DZ), pts = []; for (let q = k0 - 1; q <= k0 + 1; q++) if (slice[q]) pts.push(...slice[q]);
        const M = margin(zc);
        let w = 0, yw = 0, top = 0; for (let i = 0; i < pts.length; i += 2) { if (pts[i] > w) { w = pts[i]; yw = pts[i + 1]; } top = Math.max(top, pts[i + 1]); }
        const hw = (w + 0.075) * k, prof = [];
        for (let j = 0; j <= ARC; j++) { const x = hw * Math.sin(j / ARC * Math.PI / 2); let c = 0; for (let i = 0; i < pts.length; i += 2) if (pts[i] >= x - 0.02) c = Math.max(c, pts[i + 1]); prof.push(c + M); }
        const yEnd = yw + 0.1; for (let j = 0; j <= ARC; j++) prof[j] = Math.max(prof[j], yEnd);
        const cap = zc > 0.74 ? 2.0 : 1e9;      // over the neck's root the cloth lies on the shoulders and lets the neck stand through it (a neck hole), instead of wrapping the crest in a collar
        for (let j = 0; j <= ARC; j++) prof[j] = Math.min(prof[j], cap);
        for (let j = 1; j <= ARC; j++) prof[j] = Math.min(prof[j], prof[j - 1]);      // monotone down from the crest
        return [zc, prof[0], hw, prof];
      };
      fit = { at }; DRAPE_FIT.set(key, fit);
    }
    // ONE cloth from the withers' neck-root to the tail, running under the saddle (livery / plain); the crupper alone is the 'half' style. Both are cut per slice from the body's
    // own top line, so there are no square corners: the ends close in plan (the half's front edge tapers) and the hem sweeps up at the ends.
    const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
    const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const cuts = [
      { zs: lin(-1.2, 1.1, 23), hem: 0.38, taper: (z) => 1, opts: { closeStart: true, closeEnd: true, ns: 72, uRep: 2, round: [0.2, 0.2] } },
      { zs: lin(-1.2, -0.4, 8), hem: 0.4, taper: (z) => 0.5 + 0.5 * sm((-0.4 - z) / 0.24), opts: { closeStart: false, closeEnd: true, ns: 28, uRep: 1.3, round: [0.06, 0.22] } },
    ];      // hem: inner units (x0.81 m at the destrier's scale)
    const stOf = (c) => c.zs.map(z => fit.at(z, c.taper(z)));
    {      // the full cloth has more rows than the old front panel: rebuild its mesh
      const old = this._drapes[0], c = cuts[0];
      old.mesh.removeFromParent(); old.mesh.geometry.dispose(); this.caps.splice(this.caps.indexOf(old.cap), 1); this._drapes.splice(0, 1);
      this._drape(stOf(c), c.hem, c.opts); this._drapes.unshift(this._drapes.pop());
    }
    { const D = this._drapes[1], c = cuts[1]; D.hem = c.hem; D.opts = Object.assign({}, D.opts, c.opts); this._refitDrape(D, stOf(c)); }
    this.setCaparison(this.caparison || 'livery');
    // the gilded bosses stud the flank seam of the cloth (where it turns from the back to hang), fore and aft of the saddle
    for (const b of this._bosses || []) b.removeFromParent();
    this._bosses = [];
    { const D = this._drapes[0], P = D.mesh.geometry.attributes.position, ARC = 8, HANG = 8, half = ARC + HANG, cols = half * 2 + 1, NSr = P.count / cols, c = cuts[0];
      for (const zb of [-1.0, -0.88, -0.76, -0.64, 0.6, 0.72, 0.84, 0.96]) for (const sg of [-1, 1]) {
        const row = Math.round((zb - c.zs[0]) / (c.zs[c.zs.length - 1] - c.zs[0]) * (NSr - 1)), j = half + sg * ARC, b = ball([0, 0, 0], 0.018, gold);
        b.position.set(P.getX(row * cols + j) + sg * 0.004, P.getY(row * cols + j) - 0.004, P.getZ(row * cols + j));
        this.inner.add(b); this._bosses.push(b);
      } }
    this.setCaparison(this.caparison || 'livery');
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
  /** The rigged rider (src/rider_rig.js) instead of the code-built one: on high and medium once the figure has arrived (?rider=old / ?rider=rig overrides). */
  _useRig() { return !!(RIG.ready && !this.armourDef.noRig && riderWanted() && figureFor(this.armourDef.id)); }
  _buildRider() {
    if (this._useRig()) return this._buildRigRider();
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
    this.torsoD = this.torso; this.helmD = this.helm; this.shieldD = this.shield; this.eyeY = 0.17;      // (the code-built rider is its own puppet)

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
    const hs = this.hs, kr = hs * (1 + (this.horseDef.girth ?? 1)) / 2;
    this.solids = this.zones.concat(this.newHorse ? [
      at(this.root, [0, 1.45 * hs, 0.62 * hs], 0.36 * kr, 'horse'), at(this.root, [0, 1.45 * hs, -0.1 * hs], 0.42 * kr, 'horse'), at(this.root, [0, 1.5 * hs, -0.85 * hs], 0.42 * kr, 'horse'),
    ] : [
      at(this.root, [0, 1.25 * hs, 0.5 * hs], 0.34 * hs, 'horse'), at(this.root, [0, 1.22 * hs, -0.1 * hs], 0.36 * hs, 'horse'), at(this.root, [0, 1.28 * hs, -0.7 * hs], 0.34 * hs, 'horse'),
    ]).concat([
      at(this.rider, [0.2, this.seatY - 0.13, 0.12], 0.14, 'leg'), at(this.rider, [-0.2, this.seatY - 0.13, 0.12], 0.14, 'leg'),
    ]);
    this._buildHitboxes();
  }

  /**
   * The rigged rider. The code-built groups the rest of the game talks to (rider, torso, helm, shield, lance, hand) are kept, but as frames hung on the
   * skeleton's bones (see rider_rig.js); the puppet that the reaction springs drive is torsoD / helmD / shieldD, whose rotations the rig turns into bone rotations.
   */
  _buildRigRider() {
    const rider = this.rider = new THREE.Group(); this.mount.add(rider);
    const R = this.rig = buildRigRider(this, figureFor(this.armourDef.id)), B = R.bones;
    this.reach = R.reach; this.rs = this.reach / LANCE_REACH;
    this.plate = []; this._plain = []; this._cloth = []; this.armL = null; this.bareHead = null; this.limp = 0; this.visor = null;
    this._helmMat = this.armour;      // (the helm is its own skinned mesh on the figure's bones; the visor is part of that mesh, so there is no visor to lift)
    // plume: a fan of ostrich feathers in the livery colours (on the helm frame, so it scales with the figure)
    const plume = this.plume = new THREE.Group(); plume.position.set(0, this.armourDef.helm === 'bascinet' ? 0.38 : 0.31, -0.03); this.helm.add(plume);
    const pc = [this.arms.c1, this.arms.c2];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.MeshStandardMaterial({ color: pc[i % 2], roughness: 1 }), a = (i - 3) / 3;
      const f = tube([[0, 0, 0, 0.012], [a * 0.03, 0.1, -0.03, 0.04, 0.022], [a * 0.07, 0.22, -0.1, 0.05, 0.026], [a * 0.1, 0.3, -0.2, 0.04, 0.02], [a * 0.115, 0.31, -0.29, 0.006]], m, 8);
      f.rotation.x = -0.15 - Math.abs(a) * 0.25; plume.add(f);
    }
    if (this.arms.crest || this.arms.mantling || this.arms.helmCross) dressHelm(this, this.arms);      // a crest, mantling, gilt work on the helm (crest.js)
    // the targe's two meshes keep the names the shield code uses
    this.shFace = this.shield.getObjectByName('shield_face'); this.shBack = this.shield.getObjectByName('shield_back');
    this.shield.position.set(0, 0, 0);
    // the lance
    const lance = this.lance, k = this.arms.lanceScale ?? 1;
    this.lanceMat = R.lanceMat;      // (the broken stump of a lance is cut from the painted fore part, see breakLance)
    const rg = new THREE.PlaneGeometry(0.075, 0.62, 1, 10); rg.translate(0, -0.31, 0);
    const rib = this.ribbon = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0xf4e9ee, side: THREE.DoubleSide, roughness: 0.75 }));
    rib.position.set(0, -0.045, 0.34); rib.visible = false; rib.castShadow = true; lance.add(rib);
    this.ribbonBase = Float32Array.from(rg.attributes.position.array);
    const stump = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 7), woodPale); stump.rotation.x = Math.PI / 2; stump.position.z = LANCE_SPLIT + 0.11; stump.visible = false; lance.add(stump); this.lanceStump = stump;
    this.lanceRestQ = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(-0.12, 1, 0.18).normalize());      // (the Seated pose's own shaft line)
    this.lanceUpQ = new THREE.Quaternion().setFromUnitVectors(Z, Y);
    this._clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e3);      // world-space plane at the break
    // stirrups: an iron on each foot bone, under the ball of the foot (ToeBase), and a leather from the saddle bar down to the iron's eye. The iron is a child of the
    // foot, so it goes where the foot goes (every horse, gait and pose); the leather is restretched between its two ends each frame (_stirUpdate).
    // (It used to be placed from rider.matrixWorld read before the rider had been put on the horse: stale, so the irons stood on poles beside him.)
    { rider.updateWorldMatrix(true, true); R.root.updateMatrixWorld(true);
      const rq = rider.getWorldQuaternion(new THREE.Quaternion()), v = new THREE.Vector3(), qi = new THREE.Quaternion(); this._stir = [];
      for (const [s, side] of [[1, 'Left'], [-1, 'Right']]) {
        const foot = B[side + 'Foot'], ball = B[side + 'ToeBase'] || foot; foot.updateWorldMatrix(true, false);
        const iron = new THREE.Group(); iron.name = 'stirrup' + side; foot.add(iron);
        iron.position.copy(foot.worldToLocal(ball.getWorldPosition(v).clone()));      // the ball of the foot
        iron.quaternion.copy(foot.getWorldQuaternion(qi).invert()).multiply(rq);       // upright in the rider's frame: +x across, +y up, +z forward
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.0085, 6, 16), darkSteel); loop.position.y = -0.002; iron.add(loop);      // the eye of the iron, the foot passing through it
        const tread = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.04), darkSteel); tread.position.y = -0.054; iron.add(tread);      // the flat tread under the ball of the foot
        const lea = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 1, 5), leather); lea.castShadow = true; rider.add(lea);
        const lea2 = new THREE.Mesh(lea.geometry, leather); lea2.castShadow = true; lea2.visible = false; rider.add(lea2);      // (the lower run, when the leather has to turn out over the cloth)
        const top = new THREE.Object3D(); top.position.set(0, 0.056, 0); iron.add(top);
        this._stir.push({ lea, lea2, top, s, bar: new THREE.Vector3(s * 0.29, -0.05, 0.3) });      // the saddle bar, in the rider's frame
      } }
    this._fitLegs();
    this._stirUpdate();
    // hit zone markers (radii in metres: the figure is KS times the old rider)
    const mk = (parent, p, r, name) => { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); return { o, r: r * (parent === this.head || parent === this.neck ? 1 : KS), name }; };
    this.zones = [
      mk(this.helm, [0, 0.12, 0.075], 0.17, 'helm'),
      mk(this.torso, [0.22, 0.3, 0.19], 0.25, 'shield'),
      mk(this.torso, [0, 0.24, 0.06], 0.25, 'body'),
      mk(this.torso, [-0.2, 0.2, 0.05], 0.17, 'body'),
      mk(this.head, [0, -0.2, 0.25], 0.27, 'horse'),
      mk(this.neck, [0, 0.38, 0.27], 0.26, 'horse'),
    ];
    this.zones[1].o.parent.remove(this.zones[1].o); this.shield.add(this.zones[1].o); this.zones[1].o.position.set(0, 0, 0.02);      // the shield's own centre
    this._zr = [0.17 * KS, 0.25 * KS];
    this.root.updateMatrixWorld(true);
    const at = (parent, p, r, name) => { const o = new THREE.Object3D(); parent.add(o); parent.updateMatrixWorld(true); o.position.copy(parent.worldToLocal(this.root.localToWorld(new THREE.Vector3(...p)))); return { o, r, name }; };
    const hs = this.hs, kr = hs * (1 + (this.horseDef.girth ?? 1)) / 2;
    this.solids = this.zones.concat(this.newHorse ? [
      at(this.root, [0, 1.45 * hs, 0.62 * hs], 0.36 * kr, 'horse'), at(this.root, [0, 1.45 * hs, -0.1 * hs], 0.42 * kr, 'horse'), at(this.root, [0, 1.5 * hs, -0.85 * hs], 0.42 * kr, 'horse'),
    ] : [
      at(this.root, [0, 1.25 * hs, 0.5 * hs], 0.34 * hs, 'horse'), at(this.root, [0, 1.22 * hs, -0.1 * hs], 0.36 * hs, 'horse'), at(this.root, [0, 1.28 * hs, -0.7 * hs], 0.34 * hs, 'horse'),
    ]).concat([
      at(this.rider, [0.2, this.seatY - 0.13, 0.12], 0.12, 'leg'), at(this.rider, [-0.2, this.seatY - 0.13, 0.12], 0.12, 'leg'),
    ]);
    this._buildHitboxes();
  }

  // ------------------------------------------------------------ hit volumes (PHYS.hitboxes, src/collide.js)
  /** Build the hit volumes from data, each fixed to the part it belongs to, and the lance as a chain of capsules. */
  _buildHitboxes() {
    const CH = PHYS.lanceChain, parts = { helm: this.helm, torso: this.torso, rider: this.rider, shield: this.shield, head: this.head, neck: this.neck, root: this.root };
    // The rigged rider: the arms and thighs are capsules along the BONES themselves (bone to child bone, so they follow the arm IK and the pose);
    // helm, torso and shield volumes keep their old numbers on the marker frames, which are scaled by KS (the figure is KS times the old rider), and ride the
    // Head, Spine2 and ShieldSocket bones. Measured against the figure in the seated pose, 17 Nov (shots/rider/hitboxes_*.png).
    let defs = PHYS.hitboxes;
    if (this.rig) {
      const B = this.rig.bones, len = (b) => b.position.length(), R = { upperArm: 0.052, foreArm: 0.044, thigh: 0.08 };
      const bone = (def, on, child, r) => { parts[on] = B[on]; return Object.assign({}, def, { on, shape: 'cap', a: [0, 0, 0], b: [0, len(B[child]), 0], r }); };
      // re-measured on the figure (helm and torso in the marker frames, i.e. the old rider's units; the shield in the targe's own frame; see shots/rider)
      const RIG_HB = {
        helm: { a: [0, 0.05, 0.075], b: [0, 0.2, 0.075], r: 0.16, cr: 0.18 },      // the stechhelm: 0.31 wide, -0.12..0.33 high, -0.13..0.28 deep about its pivot
        breast: { c: [0, 0.24, 0.06], h: [0.12, 0.16, 0.165], r: 0.05 },           // the breastplate: 0.34 wide, 0..0.42 high, -0.15..0.28 deep about the waist
        back: { c: [0, 0.25, -0.1], h: [0.12, 0.16, 0.02], r: 0.05 },
        shield: { c: [0, 0, 0.024], h: [0.2, 0.25, 0.05], r: 0 },                    // the targe: 0.41 x 0.50, -0.03..0.08 thick
      };
      defs = PHYS.hitboxes.map(d => {
        if (RIG_HB[d.name]) return Object.assign({}, d, RIG_HB[d.name]);
        const m = /^(upperArm|foreArm|thigh)([LR])$/.exec(d.name); if (!m) return d;
        const side = m[2] === 'L' ? 'Left' : 'Right';
        if (m[1] === 'upperArm') return bone(d, side + 'Arm', side + 'ForeArm', R.upperArm);
        if (m[1] === 'foreArm') return bone(d, side + 'ForeArm', side + 'Hand', R.foreArm);
        return bone(d, side + 'UpLeg', side + 'Leg', R.thigh);
      });
    }
    this.hb = []; this._hbParents = new Set(); this.hbValid = false; this._hbStamp = undefined; this._fs = null;
    // With the rigged horse, its head and neck volumes must ride on the MODEL's bones: the old code-built head and neck they were placed on
    // are invisible and move differently at the gallop, so a lance that visibly missed could still touch them (13 Nov).
    const boneFor = { head: 'Head', neck: 'Neck2' }, rebased = {};
    if (this.model) {
      this.root.updateMatrixWorld(true);
      const w = new THREE.Vector3(), inv = new THREE.Matrix4();
      for (const def of defs) {
        const bone = boneFor[def.on] && this.model.getObjectByName(boneFor[def.on]); if (!bone || def.shape !== 'cap') continue;
        const code = parts[def.on]; inv.copy(bone.matrixWorld).invert();
        const toBone = (p) => w.set(...p).applyMatrix4(code.matrixWorld).applyMatrix4(inv).toArray();
        const k = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld), kc = new THREE.Vector3().setFromMatrixScale(code.matrixWorld);
        rebased[def.name] = { def: Object.assign({}, def, { a: toBone(def.a), b: toBone(def.b), r: def.r * ((kc.x + kc.y + kc.z) / 3) / ((k.x + k.y + k.z) / 3) }), parent: bone };
      }
    }
    for (const def0 of defs) {
      const rb = rebased[def0.name];
      let def = rb ? rb.def : def0;
      // the horse's body volumes were measured on a horse of scale 1 (the old courser) and are in metres from the ground: size them to this horse
      if (def.on === 'root' && def.zone === 'horse') {
        const k = this.hs, nv = this.newHorse && NEW_BODY[def.name];
        if (nv) { const kr = k * (1 + (this.horseDef.girth ?? 1)) / 2; def = Object.assign({}, def, { a: nv.a.map(v => v * k), b: nv.b.map(v => v * k), r: nv.r * kr, cr: (nv.r + 0.04) * kr }); }      // (the modelled horse's own body: inner units, see NEW_BODY)
        else def = Object.assign({}, def, { a: def.a.map(v => v * k), b: def.b.map(v => v * k), r: def.r * k, cr: def.cr * k });
      }
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
    for (let i = 0; i + 1 < CH.edges.length; i++) this.lc.push({ x0: CH.edges[i] * this.rs, x1: CH.edges[i + 1] * this.rs, r: 0.03, p: new Cap(), c: new Cap(), lo: [0, 0, 0], hi: [0, 0, 0] });
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
      q.r = (last && !this.lanceBroken ? CH.coronel : lanceRadius((q.x0 + x1) / 2 / this.rs)) * kk;
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
    if (this.rig) { this.plume.visible = on; if (this.crestG) this.crestG.visible = on; return; }      // (the rigged head is part of the body: off, the bare head shows; the baked helm is synced in update())
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
    // Footage (overhead drone): 10 deg across the horse at the couch, about 20 at the meeting, never over 30; both riders alike, so the two lances lie parallel in plan.
    // aimEase (0 at the couch .. 1 at the meeting, set by main from the gap) takes the yaw from the couch value to the one the target needs.
    const AIM = PHYS.aim, want = clamp(Math.atan2(_v.x, _v.z), AIM.yawMin, AIM.yawMax), e = this.aimEase;
    const yaw = AIM.yawCouch + (want - AIM.yawCouch) * e;
    const pitch = clamp(Math.asin(clamp(_v.y, -1, 1)), AIM.pitchMin, AIM.pitchMax);
    this.aimLocal.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  /**
   * The lift after the stroke, one call per frame while the lance is going up (it replaces an exponential damp of lanceLower). A damped spring on lanceLower:
   * 0.08 s before the butt leaves the rest, then S-shaped, about 0.45 s to 90%, a little overshoot (w 7, zeta 0.65 at the reference mass; a heavy lance is lazier).
   * The pose it rises to is the CARRY (about 50 deg up, 35 deg to the left of the line of travel), held about a second, then upright as the horse slows (`carry`, read by applyLance).
   * The spring's velocity goes into the tip's lag (`lw`). Looks only: the strike has been decided; lanceLower stays the single value that is sent and recorded.
   */
  liftStep(dt, kg = 5.5) {
    const L = PHYS.lift; this._liftFrame = true;
    let f = this._lf;
    if (!f || Math.abs(this.lanceLower - f.out) > 1e-4) f = this._lf = { x: this.lanceLower, v: 0, t: 0, out: this.lanceLower, top: Math.max(this.speed, this._peak || 0), cOn: this.lanceLower > 0.4 };      // (anything else having moved lanceLower starts the lift afresh)
    f.t += dt;
    if (f.t > L.delay) {
      const w = L.w * Math.sqrt(PHYS.lanceArm.refKg / Math.max(2, kg)), n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) { f.v += (w * w * (0 - f.x) - 2 * L.zeta * w * f.v) * h; f.x += f.v * h; }
    }
    this.lanceLower = clamp(f.x, 0, 1); f.out = this.lanceLower;
    this.liftV = f.v; this.liftX = f.x;
    const hold = f.t < L.hold || (this.speed > L.slowAt * f.top && f.t < 3.5);
    this.carry = damp(this.carry, f.cOn && hold ? 1 : 0, L.carryRate, dt);
    // the tip lags the hand: with the lance rising (v < 0) it trails below its line; the spring's overshoot (x < 0) tips it past
    const lw = clamp(-L.whip * f.v * 0.3 + Math.min(0, f.x) * -0.5, -0.2, 0.2); this.lw = damp(this.lw || 0, lw, 30, dt);
  }

  /** The lance tip in the world, as the STRIKE sees it. The visible stride bob (PHYS.ride.aimTip) is drawn in full, but only PHYS.ride.aimShare of it moves this point: `_aimUndo` turns the tip back about the grip. */
  tipWorld(out) {
    this.lance.localToWorld(out.set(0, 0, this.reach));
    if (this._aimUndo || this._lvR) {
      this.lance.getWorldPosition(_uv); out.sub(_uv);
      if (this._lvR) out.applyQuaternion(_lvI.copy(this._lvR).invert());      // the lance-over-lance dip (applyLance) is for the eye: the strike does not see it
      if (this._aimUndo) { this.torso.getWorldQuaternion(_ua); _ub.copy(_ua).invert(); _uc.copy(_ua).multiply(this._aimUndo).multiply(_ub); out.applyQuaternion(_uc); }
      out.add(_uv);
    }
    return out;
  }
  /** Where the rider means the lance to point (world). Far out, the lance itself is held wider than this to clear his horse's head. */
  aimWorld(out) { return out.copy(this.aimLocal).applyQuaternion(this.root.quaternion); }
  /**
   * A lance cannot pass through the rider's own horse. v: the wanted direction in the rider's frame; it is swung further to the left
   * (across the neck) until the shaft clears the horse's head and neck. By the time the lances meet the true line is wider than that anyway.
   */
  _clearHorse(v) {
    let need = 0, stillThrough = false;
    if (this.lanceLower > 0.05 && this.hb) {
      this.lance.getWorldPosition(_v2); this.root.worldToLocal(_v2); _v2.y += this.gripUp;
      // Own horse: the steady head and neck markers (spheres) as before the capsule rebuild. The capsules, and the model's bobbing head,
      // made the couched lance swing out and jerk from side to side at every stride (13 Nov); the other man's lance still hits the capsules.
      const yaw0 = Math.atan2(v.x, v.z), pitch = Math.asin(clamp(v.y, -1, 1));
      const clearMax = PHYS.aim.clearYaw;      // capped: the real lance lies over the neck above the ears, so what is left is cleared by lifting the grip, not by swinging wide
      for (let k = 0; k < Math.ceil(clearMax / 0.03); k++) {
        const yaw = yaw0 + need; _v3.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        let through = false;
        for (let i = 4; i < 6 && !through; i++) {
          const z = this.zones[i]; z.o.getWorldPosition(_v4); this.root.worldToLocal(_v4); _v4.sub(_v2);
          const t = clamp(_v4.dot(_v3), 0, this.reach); if (_v4.addScaledVector(_v3, -t).length() < z.r * PHYS.shaft.horse + 0.03) through = true;
        }
        if (!through) { stillThrough = false; break; } need += 0.03; stillThrough = true;
      }
    }
    this.gripUp += ((stillThrough ? PHYS.aim.gripUp : 0) - this.gripUp) * 0.12;
    this.clearNeed = need;
    this.clearYaw = (this.clearYaw || 0) + (need - (this.clearYaw || 0)) * 0.3;      // eased, so the horse's nodding head does not jerk the lance
    if (this.clearYaw > 0.002) { const yaw = Math.atan2(v.x, v.z) + this.clearYaw, pitch = Math.asin(clamp(v.y, -1, 1)); v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); }
    // nor through the tilt: where the shaft crosses over the barrier it must be above the rail
    if (this.tiltTop > 0 && this.lanceLower > 0.5) {
      this.lance.getWorldPosition(_v2); _v3.copy(v).applyQuaternion(this.root.quaternion);
      const s = Math.abs(_v3.x) > 1e-4 ? -_v2.x / _v3.x : -1;
      if (s > 0 && s < this.reach) {
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
      const len = (this.lanceBroken ? (this.brokeAt || 1.0) + 0.1 : this.reach) - (this.pointFree && !this.lanceBroken ? SH.point : 0), t0 = SH.hand, push = PHYS.lanceChain.push;
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
    if (o.zone === 'helm') this.headV += (o.J > 0 ? o.J / PHYS.impact.react.headJ : kick * R.head) * (o.headMul ?? 1);      // the head takes the blow first (mocap: about 35 deg within 0.1 s on a hard helm stroke)
    if (o.zone === 'shield') this.shV += kick * R.shield;
    if (!(o.J > 0)) this.stagV += (fromLeft ? -1 : 1) * Math.abs(kick) * R.stagger * 8;      // (with the impulse known, _blow rocks the horse by its sideways part)
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
    if (o.J > 0) {      // the horse under him: rocked sideways by the blow's sideways momentum over horse and rider, and a little by any blow at all
      const mT = (PHYS.horseKg[this.horseDef && this.horseDef.id] || 520) + PHYS.riderKg + 30, jl = -bd.x * o.J;
      this.stagV += (jl / mT * R.stagJ + (bd.x >= 0 ? -1 : 1) * o.J / mT * R.stagJ * 0.25) * 8;
    }
    const heavy = smoothstep(R.checkAt - 0.3, R.checkAt + 0.3, pw);
    if (heavy > 0) { this.pushV -= R.push * 14 * heavy * lk * F; this.tossV += R.toss * 9 * heavy; this.chk = Math.max(this.chk, R.check * heavy); }
  }
  /** The striker feels his own stroke: the arm is driven back along the shaft, the shoulder jolts, and a lance that did not break whips. */
  /** power: the reaction impulse over the reference stroke's (Newton's third law: he takes back what he gave); dir: its direction (world). */
  strikeKick(power, dir, broke) {
    const R = PHYS.impact.react, p = clamp(power, 0.1, 1.6), lk = 1 / Math.sqrt(Math.max(0.5, this.lock));
    let sx = 0; if (dir) { _bq.copy(this.root.quaternion).invert(); sx = clamp(_bv.copy(dir).applyQuaternion(_bq).x, -1, 1); }
    this.jZV -= R.recoil * p * 14 * lk; this.jXV += sx * p * 2.5 * lk; this.shdV += R.shoulder * p * 1.6; this.pushV -= R.push * 4 * p * lk;
    if (!broke) { this.wXV += R.whip * p * (0.6 + Math.random() * 0.8) * 4; this.wYV += (Math.random() - 0.5) * R.whip * p * 5 + sx * R.whip * p * 2; }
  }

  // ------------------------------------------------------------ the lance flexing (visual; numbers in PHYS.impact.flex). A vertex bend on the lance's own
  // materials: a half sine between the rest and the point (the shaft bowing as a loaded strut) and a cantilever shape from the grip (the lance ringing in the hand).
  /** Make material m bend with this lance (idempotent). */
  _bendPatch(m) {
    if (!m || m._lanceBend === this) return;
    const U = this._bendU || (this._bendU = { uB: { value: new THREE.Vector4(0, 0, 0, 0) }, uL: { value: this.reach || 2.8 } });
    m._lanceBend = this;
    const prev = m.onBeforeCompile && !m.onBeforeCompile._bend ? m.onBeforeCompile : null;
    const f = (sh, r) => {
      if (prev) prev(sh, r);
      if (sh.vertexShader.includes('uLanceL')) return;
      sh.uniforms.uBend = U.uB; sh.uniforms.uLanceL = U.uL;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uBend; uniform float uLanceL;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { float zz = transformed.z, L = max(uLanceL, 0.5), r0 = 0.25;
          float sb = sin(3.14159265 * clamp((zz - r0) / (L - r0), 0.0, 1.0));
          float u = clamp(zz / L, 0.0, 1.1), cb = u * u * (3.0 - u) * 0.5;
          transformed.xy += uBend.xy * sb + uBend.zw * cb; }`);
    };
    f._bend = true; m.onBeforeCompile = f;
    const key = m.customProgramCacheKey && !m.customProgramCacheKey._bend ? m.customProgramCacheKey.bind(m) : () => '';
    const ck = () => key() + '|lanceBend'; ck._bend = true; m.customProgramCacheKey = ck; m.needsUpdate = true;
  }
  /**
   * The shaft takes the load. o.kind 'break': it bows as the force rises for o.tb seconds (o.load = peak force over the failure load), then
   * o.onBreak() is called and the stump in the hand rings. 'hold': it bows for the contact (o.tc s) and rings at PHYS.impact.flex.ringHz.
   * o.side: the surface tangent the point slid along (world; the bow goes that way); dead square, the strut picks a side (o.seed).
   */
  bendLance(o) {
    if (this.lanceBroken && o.kind === 'break') { if (o.onBreak) o.onBreak(); return; }
    if (this.flex && this.flex.onBreak) { const cb = this.flex.onBreak; this.flex.onBreak = null; cb(); }      // (a pending break is never lost)
    this._bendPatch(this.lanceMat);
    let dx = 0, dy = 0;
    if (o.side && o.side.lengthSq() > 1e-6) { this.lance.updateWorldMatrix(true, false); _fq.setFromRotationMatrix(this.lance.matrixWorld).invert(); _fv.copy(o.side).applyQuaternion(_fq); dx = _fv.x; dy = _fv.y; }
    if (Math.hypot(dx, dy) < 0.3) { const a = rng32((o.seed | 0) ^ 0x5bd1)() * TAU; dx += Math.cos(a) * 0.5; dy += Math.sin(a) * 0.5 + 0.5; }      // square: it buckles to one side, mostly up (the point is pressed from a little below)
    const l = Math.hypot(dx, dy) || 1;
    this.flex = { kind: o.kind, t: 0, tb: Math.max(o.tb || 0, 0.004), tc: Math.max(o.tc || 0.05, 0.02), load: o.load || 1, dx: dx / l, dy: dy / l, onBreak: o.onBreak || null, t0: -1 };
    if (this.flex.kind === 'break' && !this.flex.onBreak) this.flex.t0 = 0;
  }
  /** Lance flex, a step of dt seconds (sets the bend uniform). */
  _flexStep(dt) {
    const f = this.flex, U = this._bendU; if (!U) return;
    if (!f) { U.uB.value.set(0, 0, 0, 0); return; }
    const F = PHYS.impact.flex; f.t += Math.max(0, dt);
    let sb = 0, cb = 0, L = this.reach;
    if (f.kind === 'break' && f.onBreak) {
      // loading: the force rises as a half sine and reaches the failure load at tb; the bow follows the force
      const x = Math.asin(Math.min(1, 1 / Math.max(1, f.load)));
      sb = F.bow * Math.sin(x * Math.min(1, f.t / f.tb)) / Math.sin(x);
      if (f.t >= f.tb) { const cbk = f.onBreak; f.onBreak = null; f.t0 = f.t; cbk(); }
    } else if (f.kind === 'break') {
      // broken: what is left in his hand springs back and rings, short and quick
      const tau = f.t - f.t0, w = TAU * F.stumpHz; L = this.brokeAt || L;
      cb = F.bow * F.stump * Math.exp(-F.ringZeta * 2 * w * tau) * Math.cos(w * tau);
      if (tau > 0.8) this.flex = null;
    } else {
      // held: bowed while the point is pressed, then the whole lance rings in the hand
      const A = F.ring * clamp(f.load, 0, 1.3);
      if (f.t < f.tc) sb = A * Math.sin(Math.PI * f.t / f.tc);
      const tau = f.t - f.tc * 0.5, w = TAU * F.ringHz;
      if (tau > 0) cb = A * 0.7 * Math.exp(-F.ringZeta * w * tau) * Math.sin(w * tau);
      if (tau > 2.5) this.flex = null;
    }
    U.uB.value.set(f.dx * sb, f.dy * sb, f.dx * cb, f.dy * cb); U.uL.value = L;
  }
  /**
   * The point has met the other man: from now on it stays on his surface (PHYS.impact.pin). part: the Object3D the contact rides on (his shield, helm,
   * torso); p, n: the contact and the surface normal (out of it), world; tan: the way the point was sliding along it (world, may be zero);
   * kind 'hold' | 'break' | 'skid' (a glance: it slides off along tan at once). While pinned, the shaft is aimed at the point, the lance slides back in
   * the hand and the rest (up to pin.slide), the shaft bows for the rest (up to pin.bow); past that the point skids off, up and along the face.
   */
  pinLance(part, p, n, tan, kind) {
    if (!part || !p || !n) { this.pin = null; return; }
    part.updateWorldMatrix(true, false); const qi = part.getWorldQuaternion(new THREE.Quaternion()).invert();
    const nn = n.clone().normalize(), up = new THREE.Vector3(0, 1, 0).addScaledVector(nn, -nn.y);
    const tg = tan && tan.lengthSq() > 1e-6 ? tan.clone().addScaledVector(nn, -tan.dot(nn)) : new THREE.Vector3();
    const sd = kind === 'skid' ? (tg.lengthSq() > 1e-6 ? tg : up) : up.multiplyScalar(0.8).addScaledVector(tg.lengthSq() > 1e-6 ? tg.normalize() : tg, 0.6);
    if (sd.lengthSq() < 1e-6) sd.set(0, 1, 0); sd.normalize();
    this.pin = { part, pl: part.worldToLocal(p.clone()), nl: nn.applyQuaternion(qi), sl: sd.applyQuaternion(qi), kind, t: 0, s: 0, skid: kind === 'skid', ex: 0 };
  }
  /** Hold the point on the surface (called from applyLance, after the aim and the whip; see pinLance). */
  _pinLance() {
    const P = this.pin, PN = PHYS.impact.pin;
    if (!this.lance.visible || this.lanceDropped || (this.replaying ? this.snapUnhorsed : this.unhorsed) || P.part.parent === null) { this.pin = null; return; }
    P.part.updateWorldMatrix(true, false); P.part.getWorldQuaternion(_fq);
    const tgt = P.part.localToWorld(_fa.copy(P.pl)), n = _fb.copy(P.nl).applyQuaternion(_fq), sd = _fc.copy(P.sl).applyQuaternion(_fq);
    tgt.addScaledVector(n, PN.margin).addScaledVector(sd, P.s);
    const par = this.lance.parent; par.updateWorldMatrix(true, false);
    const G = par.localToWorld(_v4.copy(this.lance.position));
    const d = tgt.sub(G), dist = d.length(), L = this.lanceBroken ? (this.brokeAt || 1.0) + 0.05 : this.reach;
    const ex = L - dist;
    if (ex <= 0 && (P.t > 0.03 || this.lanceBroken)) { this.pin = null; return; }      // the point no longer reaches him (it broke, he went back, they have passed)
    if (P.skid && P.s > PN.clear) { this.pin = null; return; }                        // slid off the edge: free
    if (!P.skid && ex > PN.slide + PN.bow) P.skid = true;                             // nothing more can give: the point skids off
    if (ex <= 0) return;
    par.getWorldQuaternion(_fq).invert(); d.applyQuaternion(_fq).normalize();
    this.lance.quaternion.setFromUnitVectors(Z, d); this._aimUndo = null;      // (the pinned point overrides the stride bob: tipWorld must not undo a bob that is no longer there)
    const slide = Math.min(ex, PN.slide); this.lance.position.addScaledVector(d, -slide);      // the lance goes back through the hand and the rest (the arm follows it: the IK)
    P.ex = Math.max(0, ex - slide);
    if (this._bendU && P.ex > 0) { const f = this.flex, bx = f ? f.dx : 0, by = f ? f.dy : 1; this._bendU.uB.value.x += bx * P.ex * PN.bowGain; this._bendU.uB.value.y += by * P.ex * PN.bowGain; }      // and bows for what is left
  }
  /** Where along the shaft a break at `at` m from the grip can fall on this lance (see breakLance). */
  clampBreak(at) { return clamp(at, LANCE_SPLIT + 0.03, this.reach - 0.3); }
  /** Spring-dampers of the blow's reaction (seconds in dt; dt = 0 leaves them as they are). */
  _reactStep(dt) {
    const R = PHYS.impact.react;
    if (!this.replaying) this._flexStep(dt);
    if (this.pin && dt > 0) { this.pin.t += dt; if (this.pin.skid) this.pin.s += PHYS.impact.pin.skidV * dt; if (this.pin.t > PHYS.impact.pin.tMax) this.pin = null; }
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
    at = clamp(at, LANCE_SPLIT + 0.03, this.reach - 0.3);
    this.brokeAt = at; this.lanceBroken = true; this.lanceFore.visible = false; this.lanceStump.visible = true; this.lanceStump.position.z = at + 0.1;
    if (this.rig) {      // the painted fore part, cut off at the break by a clip plane (kept in step in applyLance)
      const kept = this.lanceFore.clone(true), m = this.lanceMat.clone(); m.clippingPlanes = [this._clip]; m.clipShadows = true; this._bendPatch(m);
      kept.traverse(o => { if (o.isMesh) o.material = m; }); kept.visible = true; this.lance.add(kept); this.lanceKept = kept; this._keptMat = m;
      this.lanceStump.scale.setScalar(Math.max(0.6, lanceRadius(at / this.rs) * (this.arms.lanceScale ?? 1) / 0.04)); this._clipUpdate();
      const a = this.lance.localToWorld(new THREE.Vector3(0, 0, at)), b = this.lance.localToWorld(new THREE.Vector3(0, 0, this.reach));
      return { a, b, at, r: lanceRadius(at / this.rs) * (this.arms.lanceScale ?? 1) };
    }
    const k = this.arms.lanceScale ?? 1, pts = [[LANCE_SPLIT, lanceRadius(LANCE_SPLIT)]];
    for (const p of PHYS.lanceShape) if (p[0] > LANCE_SPLIT && p[0] < at) pts.push(p);
    pts.push([at, lanceRadius(at)]);
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[1] * k, p[0])), 12); g.rotateX(Math.PI / 2);
    this.lanceKept = new THREE.Mesh(g, this.lanceMat); this.lanceKept.castShadow = true; this.lance.add(this.lanceKept); this._bendPatch(this.lanceMat);
    this.lanceStump.scale.setScalar(Math.max(0.6, lanceRadius(at) * k / 0.04));
    const a = this.lance.localToWorld(new THREE.Vector3(0, 0, at)), b = this.lance.localToWorld(new THREE.Vector3(0, 0, this.reach));
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
      if (m.isSkinnedMesh) {      // a skinned mesh: the blow's point -> the bone's frame -> the mesh's bind pose (where its vertices are)
        if (!m.userData.d0) { if (!m.geometry.attributes.normal) continue; m.geometry = m.geometry.clone(); const P = m.geometry.attributes.position, N = m.geometry.attributes.normal; m.userData.d0 = { p: Float32Array.from(P.array), n: Float32Array.from(N.array) }; }
        const bone = e.region === 'helm' ? this.rig.bones[this.rig.helmBone] : this.rig.bones.Spine2, fr = e.region === 'helm' ? this.helm : this.torso;
        fr.updateMatrix(); const c = lp.clone().applyMatrix4(fr.matrix), bi = m.skeleton.boneInverses[m.skeleton.bones.indexOf(bone)];
        c.applyMatrix4(_dm.copy(bi).invert()); dentGeo(m.geometry, c, e.r * KS, e.depth * KS); this._dirty.add(m); continue;
      }
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
    if (this.rig) {
      if (region === 'helm') return this.rig.helmMesh ? [this.rig.helmMesh] : [];
      return this.rig.upper ? [this.rig.upper] : [];      // breast and the left pauldron: the figure's one upper-harness mesh (each rider has a private copy once dented)
    }
    if (region === 'breast') return this.plate && this.plate[2] ? [this.plate[2]] : this._cloth.length ? this._cloth : (this._plain || []);
    if (region === 'pauldronL') return this.plate ? [this.plate[1]] : (this._plain || []);
    const out = [], walk = (o) => { if (o === this.plume || o === this.bareHead) return; if (o.isMesh && o.material === this._helmMat) out.push(o); o.children.forEach(walk); };
    walk(this.helm); return out;
  }
  /** Shield face: gouges and splinter marks at each blow, a crack once it is badly hurt, a corner broken away. */
  _drawShield() {
    const tex = this.shieldMat.map, cv = tex && tex.image, rg = !!this.rig, SW = rg ? 0.41 : 0.43, SHH = rg ? 0.5 : 0.53;
    if (cv && cv.getContext && (this._shMarks.length || this._shBase)) {
      if (!this._shBase) { const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height; b.getContext('2d').drawImage(cv, 0, 0); this._shBase = b; }
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, px = W / 512;
      g.globalCompositeOperation = 'source-over'; g.drawImage(this._shBase, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const e of this._shMarks) {
        let sd = Math.floor(e.seed * 1000) >>> 0; const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;
        const x = (e.lp[0] / SW + 0.5) * W, y = (1 - (e.lp[1] / SHH + 0.5)) * H, sz = (16 + 90 * e.amt) * px;
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
      tex.needsUpdate = true; if (this.shTex) this.shTex.needsUpdate = true;
    }
    if (this.rig) return;      // (the modelled targe keeps its outline: no broken corner)
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
  /** The head of the lance: the three-pronged coronel (peace) or the war tip (a sharp lance). The rigged lances carry both; the code-built one has only the coronel. */
  setTip(sharp) {
    if (!this.rig) return;
    const c = this.lance.getObjectByName('coronel'), w = this.lance.getObjectByName('wartip');
    if (c) c.visible = !sharp; if (w) w.visible = !!sharp;
    this._setReach(sharp ? this.rig.reachWar : this.rig.reach);
  }
  /** grip -> point of the lance in hand: the tip, the break points and the hit chain (edges, radii) all stretch with it, in step with LANCE_REACH. */
  _setReach(r) {
    this.reach = r; this.rs = r / LANCE_REACH; const E = PHYS.lanceChain.edges;
    for (let i = 0; i < this.lc.length; i++) { this.lc[i].x0 = E[i] * this.rs; this.lc[i].x1 = E[i + 1] * this.rs; }
  }
  /**
   * The caparison's cross-sections in the rider's frame at rest, for the legs: per row of the cloth (z), the half-profile from the crest out over the barrel and down the hang
   * (x, y); dist(x, y, z) is the signed distance to that line in the row nearest z (+ outside the cloth). Built from the rest shape (the flutter is a few millimetres).
   */
  _clothProfile() {
    if (this.capMeshes) return this._clothProfileSkin();
    const D = this._drapes && this._drapes[0]; if (!D || !this.newHorse) return null;
    this.root.updateMatrixWorld(true); this.rider.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4().copy(this.rider.matrixWorld).invert().multiply(this.inner.matrixWorld), v = new THREE.Vector3(), b = D.cap.base;
    const ARC = 8, HANG = 8, half = ARC + HANG, cols = half * 2 + 1, NS = b.length / 3 / cols, rows = [];
    for (let i = 0; i < NS; i++) {
      const xs = [], ys = []; let z = 0;
      for (let j = half; j < cols; j++) { v.set(b[(i * cols + j) * 3], b[(i * cols + j) * 3 + 1], b[(i * cols + j) * 3 + 2]).applyMatrix4(m); xs.push(Math.abs(v.x)); ys.push(v.y); if (j === half) z = v.z; }
      rows.push({ z, xs, ys });
    }
    rows.sort((p, q) => p.z - q.z);
    const DENT_ARC = 0.012, DENT_HANG = (j) => 0.04 + 0.04 * Math.min(1, (j - ARC + 0.5) / HANG);      // how far the cloth may be pressed in: on the back (it lies a finger above the coat) and on the hang (a hand off the barrel)
    const seg = (r, px, py, soft) => {      // signed distance to the half-profile of one row
      let best = 1e9, sg = 1, al = 0;
      for (let j = 0; j < r.xs.length - 1; j++) {
        const ax = r.xs[j], ay = r.ys[j], dx = r.xs[j + 1] - ax, dy = r.ys[j + 1] - ay, l2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        const qx = px - (ax + dx * t), qy = py - (ay + dy * t), d = Math.hypot(qx, qy);
        if (d < best) { best = d; al = j < ARC ? DENT_ARC : DENT_HANG(j); sg = dx * (py - ay) - dy * (px - ax) >= 0 ? 1 : -1; }
      }
      return best * sg + (soft ? al : 0);
    };
    const at = (x, y, z, soft) => {
      let lo = 0, hi = rows.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].z < z) lo = mid; else hi = mid; }
      if (z < rows[0].z - 0.05 || z > rows[rows.length - 1].z + 0.05) return 1;
      return seg(rows[z - rows[lo].z < rows[hi].z - z ? lo : hi], Math.abs(x), y, soft);
    };
    return { rows, dist: (x, y, z) => at(x, y, z, false), soft: (x, y, z) => at(x, y, z, true), DENT_ARC, DENT_HANG };
  }
  /** The same for the skinned cloth: its columns (TEXCOORD_1.y = the place along the hem, one value per column) as they stand now, in the rider's frame. */
  _clothProfileSkin() {
    if (!this.capMeshes.length) return null;
    this.root.updateMatrixWorld(true); this.rider.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(this.rider.matrixWorld).invert(), v = new THREE.Vector3(), colsBy = new Map();
    for (const o of this.capMeshes) {
      o.skeleton.update(); const g = o.geometry, P = g.attributes.position, W = g.attributes.capw;
      for (let i = 0; i < P.count; i++) {
        if (P.getX(i) < 0) continue;      // one side: the profile is used on |x|
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        const key = Math.round(W.getY(i) * 1e4); let c = colsBy.get(key); if (!c) colsBy.set(key, c = []);
        c.push({ x: Math.abs(v.x), y: v.y, z: v.z, t: W.getX(i) });
      }
    }
    const rows = [], DENT_ARC = 0.012, DENT_HANG = (t) => 0.04 + 0.04 * Math.min(1, t);
    for (const c of colsBy.values()) {
      const arc = c.filter(p => p.t === 0); if (arc.length < 3) continue;
      let z0 = 1e9, z1 = -1e9, zs = 0; for (const p of arc) { z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); zs += p.z; }
      if (z1 - z0 > 0.04) continue;      // (the fans round the breast and the buttocks are not sections across the horse; the legs lie between them)
      c.sort((p, q) => (p.t - q.t) || (q.y - p.y));
      const seen = []; for (const p of c) { const l = seen[seen.length - 1]; if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-4) seen.push(p); }
      rows.push({ z: zs / arc.length, xs: seen.map(p => p.x), ys: seen.map(p => p.y), ts: seen.map(p => p.t) });
    }
    if (rows.length < 2) return null;
    rows.sort((p, q) => p.z - q.z);
    const seg = (r, px, py, soft) => {
      let best = 1e9, sg = 1, al = 0;
      for (let j = 0; j < r.xs.length - 1; j++) {
        const ax = r.xs[j], ay = r.ys[j], dx = r.xs[j + 1] - ax, dy = r.ys[j + 1] - ay, l2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        const qx = px - (ax + dx * t), qy = py - (ay + dy * t), d = Math.hypot(qx, qy);
        if (d < best) { best = d; al = r.ts[j + 1] === 0 ? DENT_ARC : DENT_HANG(r.ts[j + 1]); sg = dx * (py - ay) - dy * (px - ax) >= 0 ? 1 : -1; }
      }
      return best * sg + (soft ? al : 0);
    };
    const at = (x, y, z, soft) => {
      let lo = 0, hi = rows.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].z < z) lo = mid; else hi = mid; }
      if (z < rows[0].z - 0.05 || z > rows[rows.length - 1].z + 0.05) return 1;
      return seg(rows[z - rows[lo].z < rows[hi].z - z ? lo : hi], Math.abs(x), y, soft);
    };
    return { rows, dist: (x, y, z) => at(x, y, z, false), soft: (x, y, z) => at(x, y, z, true), DENT_ARC, DENT_HANG };
  }
  /** Splay the rider's legs out over the barrel and the cloth (rider_rig.js fitLegs), from this horse's own cloth. */
  _fitLegs() {
    const R = this.rig; this.clothFit = this._clothProfile(); if (!R || !this.clothFit) return;
    this.legFit = fitLegs(this, R, this.clothFit);
    this._dentCloth(this._riderPoints(), this.legFit.caps, 0.01, [-0.03, 0, 0.025]); this.clothFit = this._clothProfile();      // (the dented cloth is what the leathers clear)
  }
  /** Points on the rider's lower body (fauld and tassets, thighs, shins, feet: what lies against the cloth) in the rider's frame, in the pose he is in now. */
  _riderPoints(step = 5) {
    const R = this.rig, out = [], v = new THREE.Vector3(); this.rider.updateWorldMatrix(true, false);
    posePose(R.P, R.bones, { couch: 0, raised: 0, stand: 0 }); legsRig(this, R); R.root.updateMatrixWorld(true);
    R.root.traverse(o => {
      if (!o.isSkinnedMesh || !o.visible || o === R.helmMesh) return;
      const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bn = o.skeleton.bones; o.skeleton.update();
      for (let i = 0; i < g.attributes.position.count; i += step) {
        let bi = 0, bw = 0; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); bi = si.getComponent(i, k); }
        if (!/^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$|^Hips$/.test(bn[bi].name)) continue;
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); this.rider.worldToLocal(v); if (Math.abs(v.x) > 0.1) out.push(v.x, v.y, v.z);
      }
    });
    return out;
  }
  /** The dent in the skinned cloth: the same push in the rider's frame, carried back through each vertex's own blend of bone matrices into the cloth's rest shape. */
  _dentClothSkin(pts, caps, clr, lifts) {
    const F = this.clothFit; if (!F) return;
    this.root.updateMatrixWorld(true); this.rider.updateWorldMatrix(true, false);
    const rInv = new THREE.Matrix4().copy(this.rider.matrixWorld).invert(), v = new THREE.Vector3(), v0 = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3(), c2 = clr * clr;
    const S = new THREE.Matrix4(), B = new THREE.Matrix4(), toR = new THREE.Matrix4(), back = new THREE.Matrix4(); let moved = 0;
    let zmin = 1e9, zmax = -1e9; for (let k = 0; k < pts.length; k += 3) { zmin = Math.min(zmin, pts[k + 2]); zmax = Math.max(zmax, pts[k + 2]); }
    for (const c of caps) { zmin = Math.min(zmin, c.a.z - c.r, c.b.z - c.r); zmax = Math.max(zmax, c.a.z + c.r, c.b.z + c.r); }
    for (const o of this.capMeshes) {
      o.skeleton.update(); const g = o.geometry, P = g.attributes.position, W = g.attributes.capw, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bm = o.skeleton.boneMatrices;
      for (let i = 0; i < P.count; i++) {
        // rest position -> rider's frame:  rInv * meshWorld * bindInverse * (sum of weight * boneMatrix) * bind
        S.elements.fill(0);
        for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (!w) continue; const off = SI.getComponent(i, k) * 16; for (let e = 0; e < 16; e++) S.elements[e] += bm[off + e] * w; }
        toR.copy(rInv).multiply(o.matrixWorld).multiply(o.bindMatrixInverse).multiply(S).multiply(o.bindMatrix);
        v0.fromBufferAttribute(P, i).applyMatrix4(toR); v.copy(v0);
        if (Math.abs(v.x) < 0.02 || v.z < zmin - 0.1 || v.z > zmax + 0.1) continue;
        const t = W.getX(i), lim = t === 0 ? F.DENT_ARC : F.DENT_HANG(t);
        for (let pass = 0; pass < 2; pass++) for (const dy of lifts) {
          for (let k = 0; k < pts.length; k += 3) {
            const dx = v.x - pts[k], ddy = v.y - pts[k + 1] - dy, dz = v.z - pts[k + 2], d2 = dx * dx + ddy * ddy + dz * dz;
            if (d2 < c2 && d2 > 1e-10) { const d = Math.sqrt(d2), f = (clr - d) / d; v.x += dx * f; v.y += ddy * f; v.z += dz * f; }
          }
          for (const c of caps) {
            ab.subVectors(c.b, c.a); ap.copy(v).sub(c.a); ap.y -= dy; const tt = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1e-9)));
            q.copy(c.a).addScaledVector(ab, tt); q.y += dy; ap.subVectors(v, q); const d = ap.length(), need = c.r + clr - d;
            if (need > 0 && d > 1e-6) v.addScaledVector(ap, need / d);
          }
        }
        let dd = v.distanceTo(v0); if (dd < 1e-5) continue; if (dd > lim) { v.lerpVectors(v0, v, lim / dd); dd = lim; }
        back.copy(toR).invert(); v.applyMatrix4(back); P.setXYZ(i, v.x, v.y, v.z); moved++;
      }
      P.needsUpdate = true;
    }
    this.dentN = moved;
  }
  /**
   * The cloth gives way under the rider: every vertex of the caparison is pushed away from the points of his lower body (swept through the lifts his posting gives, so the
   * dent is wide enough for the whole stride) until it clears by `clr`: at most DENT_ARC on the back (it lies a finger above the coat), DENT_HANG on the hang. Done once on the
   * rest shape, so the flutter rides on top of it.
   */
  _dentCloth(pts, caps, clr, lifts) {
    if (this.capMeshes) return this._dentClothSkin(pts, caps, clr, lifts);
    const D = this._drapes && this._drapes[0], F = this.clothFit; if (!D || !F) return;
    this.rider.updateWorldMatrix(true, false); this.inner.updateWorldMatrix(true, false);
    const m = new THREE.Matrix4().copy(this.rider.matrixWorld).invert().multiply(this.inner.matrixWorld), mi = m.clone().invert(), b = D.cap.base, pa = D.mesh.geometry.attributes.position;
    const half = 16, cols = half * 2 + 1, v = new THREE.Vector3(), v0 = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3(), c2 = clr * clr; let moved = 0;
    for (let i = 0; i < b.length; i += 3) {
      const col = (i / 3) % cols, a = Math.abs(col - half), lim = a <= 8 ? F.DENT_ARC : F.DENT_HANG(a);
      v0.set(b[i], b[i + 1], b[i + 2]).applyMatrix4(m); v.copy(v0);
      if (Math.abs(v.x) < 0.02) continue;
      for (let pass = 0; pass < 2; pass++) for (const dy of lifts) {
        for (let k = 0; k < pts.length; k += 3) {
          const dx = v.x - pts[k], ddy = v.y - pts[k + 1] - dy, dz = v.z - pts[k + 2], d2 = dx * dx + ddy * ddy + dz * dz;
          if (d2 < c2 && d2 > 1e-10) { const d = Math.sqrt(d2), f = (clr - d) / d; v.x += dx * f; v.y += ddy * f; v.z += dz * f; }
        }
        for (const c of caps) {      // the thighs, shins and feet as capsules (the cloth may lie inside one: the points above are only its skin)
          ab.subVectors(c.b, c.a); ap.copy(v).sub(c.a); ap.y -= dy; const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1e-9)));
          q.copy(c.a).addScaledVector(ab, t); q.y += dy; ap.subVectors(v, q); const d = ap.length(), need = c.r + clr - d;
          if (need > 0 && d > 1e-6) v.addScaledVector(ap, need / d);
        }
      }
      let dd = v.distanceTo(v0); if (dd < 1e-5) continue; if (dd > lim) { v.lerpVectors(v0, v, lim / dd); dd = lim; } if (dd < 1e-5) continue;
      v.applyMatrix4(mi); b[i] = v.x; b[i + 1] = v.y; b[i + 2] = v.z; pa.array[i] = v.x; pa.array[i + 1] = v.y; pa.array[i + 2] = v.z; moved++;
    }
    pa.needsUpdate = true; D.mesh.geometry.computeVertexNormals(); this.dentN = moved;
  }
  /**
   * The stirrup leathers: from the saddle bar (fixed to the rider) to the eye of the iron (on the foot). With the legs outside the cloth the straight run from the bar to the iron
   * would cut through the cloth's shoulder, so where it does the leather turns out over it at one bend (two runs), clearing the cloth (this frame's cloth, at the rider's own offset from it).
   */
  _stirUpdate() {
    if (!this._stir) return;
    if (this._stirLoose) {
      const dt = Math.min(0.05, this._dt || 0);
      for (const S of this._stir) {
        const want = _fa.copy(S.bar).add(_fb.set(0, -0.62, 0));      // hanging under the bar
        S.hv.addScaledVector(_fc.subVectors(want, S.iron.position), 160 * dt).multiplyScalar(Math.exp(-6 * dt)); S.iron.position.addScaledVector(S.hv, dt);
        S.iron.quaternion.slerp(_fq.identity(), 1 - Math.exp(-8 * dt));
        S.top.getWorldPosition(_fa); this.mount.worldToLocal(_fa);
        _v4.subVectors(_fa, S.bar); const len = _v4.length() || 1e-3; S.lea.position.copy(S.bar).addScaledVector(_v4, 0.5); S.lea.scale.set(1, len, 1); S.lea.quaternion.setFromUnitVectors(Y, _v4.divideScalar(len)); S.lea2.visible = false;
      }
      return;
    }
    this.rider.updateWorldMatrix(true, false);
    const F = this.rider.parent === this.mount ? this.clothFit : null, Q = this.rider.matrix, T = _v, M = _v2, p = _v3, W = 0.0125 + 0.01;
    const clear = (a, b, c) => {      // worst clearance of the run(s) and where: a -> b (-> c)
      let worst = 1e9, wu = 0.5, wi = 0;
      for (let leg = 0; leg < (c ? 2 : 1); leg++) { const from = leg ? b : a, to = leg ? c : (c ? b : b); for (let k = 1; k < 10; k++) { const u = k / 10; p.lerpVectors(from, to, u).applyMatrix4(Q); const d = F.dist(p.x, p.y, p.z) - W; if (d < worst) { worst = d; wu = u; wi = leg; } } }
      return { worst, wu, wi };
    };
    for (const S of this._stir) {
      S.top.updateWorldMatrix(true, false); T.setFromMatrixPosition(S.top.matrixWorld); this.rider.worldToLocal(T);
      let bend = false;
      if (F) {
        let r = clear(S.bar, T); if (r.worst < 0) {
          M.lerpVectors(S.bar, T, r.wu); bend = true;
          for (let it = 0; it < 4 && r.worst < 0; it++) { M.x += S.s * (-r.worst * 1.5 + 0.004); r = clear(S.bar, M, T); }
        }
      }
      const run = (mesh, a, b) => { _v4.subVectors(b, a); const len = _v4.length() || 1e-3; mesh.position.copy(a).addScaledVector(_v4, 0.5); mesh.scale.set(1, len, 1); mesh.quaternion.setFromUnitVectors(Y, _v4.divideScalar(len)); };
      if (bend) { run(S.lea, S.bar, M); run(S.lea2, M, T); S.lea2.visible = true; } else { run(S.lea, S.bar, T); S.lea2.visible = false; }
    }
  }
  /** A fresh lance in the hand. */
  _mendLance() {
    this.flex = null; this.pin = null; if (!this.unhorsed) this.rag = null; if (this._bendU) this._bendU.uB.value.set(0, 0, 0, 0);
    this.lanceDropped = false; this.lance.visible = true; this.lanceBroken = false; this.lanceFore.visible = true; this.lanceStump.visible = false;
    if (this.lanceKept) { this.lance.remove(this.lanceKept); if (this.lanceKept.geometry) this.lanceKept.geometry.dispose(); if (this._keptMat) { this._keptMat.dispose(); this._keptMat = null; } this.lanceKept = null; }
  }
  /** The clip plane that cuts the kept fore part of a broken rigged lance, in world space, at the break. */
  _clipUpdate() {
    if (!this.lanceKept || !this._clip) return;
    this.lance.updateWorldMatrix(true, false); const e = this.lance.matrixWorld.elements;
    _v.set(e[8], e[9], e[10]).normalize(); this.lance.getWorldPosition(_v2); this._clip.normal.copy(_v).negate(); this._clip.constant = _v.dot(_v2) + this.brokeAt;
  }

  /**
   * Going over. Measured on film of a real unhorsing: the struck rider's body goes from upright to flat along the horse's back
   * in about 0.35 s while he is still in the saddle, his seat leaves it at about 0.45 s, and he is on the ground about a second
   * after the blow. So for `delay` seconds he stays mounted and is driven back; only then does he part from the horse.
   */
  unhorse(vel, spin, delay = 0.42, o = {}) {
    if (this.unhorsed || this.going) return;
    const style = o.style === 'side' ? 'side' : 'cantle';
    // out: the side he goes off, in the horse's frame (+1 his left): away from the tilt (main.js passes it; else the side away from x = 0)
    const out = o.out || ((Math.sign(this.root.position.x) || 1) * (this.dir > 0 ? 1 : -1));
    this.going = { t: delay, tt: 0, vel: vel.clone(), spin, style, k: o.k || 1, out, lat: o.lat || 0 };
    this.looseT = 0;      // (the riderless horse: main.js looseHorse)
  }
  _detach() {
    const g = this.going; this.going = null;
    this.unhorsed = true;
    const clip = this.rig && FALL_CLIPS[g.style], F = PHYS.impact.fall;
    // the horse's velocity at this instant (he keeps most of it: nothing has stopped him yet)
    const hv = _fa.set(0, 0, this.dir * this.speed);
    this.scene.attach(this.rider);
    this._stirFree();
    if (this.onDetach) this.onDetach(this, g);
    if (clip) {
      // A ballistic flight from where the authored path has put him, timed to meet the ground when the footage does (F.tGround), with the forward speed
      // he had on the horse (F.keep of it) plus the path's own motion relative to the saddle; the launch is held to what sliding off the rump or being
      // thrown over the shoulder can give (F.vyMin..vyMax). Gravity, the sand and the friction do the rest (_updateFall).
      const T = Math.max(0.3, F.tGround[g.style] - g.tt), y0 = this.rider.position.y, yG = F.lieH;
      const vy = clamp((yG - y0 + 4.905 * T * T) / T, F.vyMin, F.vyMax);
      const a = hipsAt(clip, g.tt, g.out, g.k, _fb), b = hipsAt(clip, g.tt + T, g.out, g.k, _fc);
      const rel = b.sub(a).divideScalar(T); rel.y = 0; rel.applyQuaternion(this.root.quaternion);
      const v = hv.clone().multiplyScalar(F.keep).add(rel); v.y = vy; v.x += g.lat;      // (g.lat: the blow's sideways momentum over his mass, world x, from main.js)
      // the turn: over the cantle he goes on rolling back (his legs come over last); thrown sideways he rolls over toward the side he goes
      const q = this.rider.quaternion, X = _fb.set(1, 0, 0).applyQuaternion(q).clone(), Zf = _fc.set(0, 0, 1).applyQuaternion(q).clone();
      const w = g.style === 'side'
        ? Zf.multiplyScalar(-g.out * F.turn.side * g.k / T).addScaledVector(X, -F.turn.sideBack / T)
        : X.multiplyScalar(-F.turn.cantle * g.k / T).addScaledVector(Zf, -g.out * F.turn.cantleRoll / T);
      w.y += this.twistV * 0.3; if (w.length() > F.wMax) w.setLength(F.wMax);
      this.fall = { v, w, landed: false, still: 0, wl: w.clone(), skidT: 0, bounceT: 0, clip: g.style, tt: g.tt, k: g.k, out: g.out, air: 0, kick: 0 };
      if (GFX.tier !== 'low' && PHYS.ragdoll) this._ragStart(v, w);      // from here an articulated ragdoll (src/ragdoll.js); the low tier keeps the rigid body
      return;
    }
    // from here he is one rigid body: he leaves the saddle turning backward over the cantle (spin), with whatever twist the blow gave him
    const w = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rider.quaternion).multiplyScalar(g.spin);
    w.y += this.twistV * 0.6 + (Math.random() - 0.5) * 1.6; w.addScaledVector(_v.set(0, 0, 1).applyQuaternion(this.rider.quaternion), this.sideRecoilV * 0.5 + (Math.random() - 0.5) * 1.2);
    w.addScaledVector(_v.set(0, 0, 1).applyQuaternion(this.rider.quaternion), -g.vel.x * 0.8 * PHYS.impact.fall.ground * 2);      // thrown out to the side: he rolls over as he goes
    this.fall = { v: g.vel, w, landed: false, still: 0, wl: w.clone(), skidT: 0, bounceT: 0 };
  }

  /** The fall's state for the pose: [style, clip time, intensity, side, airborne, flail kick] or null. */
  _fallState() {
    if (this.replaying) return this._fcSnap || null;
    const g = this.going, f = this.fall;
    if (g && this.rig && FALL_CLIPS[g.style]) return [g.style === 'side' ? 1 : 0, g.tt, g.k, g.out, 0, 0];
    if (this.unhorsed && f && f.clip) return [f.clip === 'side' ? 1 : 0, f.tt, f.k, f.out, f.landed ? 0 : 1, f.kick || 0];
    return null;
  }
  /**
   * The authored fall on the rig's bones, added in the rider's own frame (so it holds whatever the rigid body is doing) after the pose and the arm IK:
   * spine bending back over the cantle (or rolling sideways), the head, the legs coming up and over; once he is out of the saddle the arms too, with a
   * flail on top that dies away once he is down. Mirrored when he goes off his right side.
   */
  _fallPose() {
    const st = this._fallState(); if (!st || !this.rig) return;
    if (this.rag && (this.replaying ? this.snapUnhorsed && this._ragSnap && (this._ragSnap.w ?? 1) >= 1 : this.unhorsed && this.rag.t > PHYS.ragdoll.fade)) return;      // (the ragdoll has him)
    const c = FALL_CLIPS[FALL_STYLE[st[0]]]; if (!c) return;
    const t = st[1], k = st[2], mir = st[3] < 0, off = (this.replaying ? this.snapUnhorsed : this.unhorsed), FF = PHYS.impact.fall.flail;
    const B = this.rig.bones, D = Math.PI / 180, wIn = smoothstep(0, 0.08, t);
    this.rider.updateWorldMatrix(true, false); const rq = this.rider.getWorldQuaternion(_fq3).invert();      // world -> rider frame
    for (const name of FALL_BONES) {
      const src = mir ? (name.startsWith('Left') ? 'Right' + name.slice(4) : name.startsWith('Right') ? 'Left' + name.slice(5) : name) : name;
      const ch = c.euler_deg[src], b = B[name]; if (!b) continue;
      const arm = /Arm$/.test(name);
      if (arm && !off) continue;      // (on the horse the arms still hold the lance and the shield: the IK has them)
      let px = ch ? clipAt(ch.x, c.fps, t) : 0, rz = ch ? clipAt(ch.z, c.fps, t) : 0, yy = ch ? clipAt(ch.y, c.fps, t) : 0;
      if (mir) { rz = -rz; yy = -yy; }
      if (arm && off) {      // flailing: the arms windmill while he is in the air, a burst on landing, dying away
        const sgn = name.startsWith('Left') ? 1 : -1, ph = name.startsWith('Left') ? 0 : 1.7, a = FF.deg * (st[4] ? 1 : Math.max(0, st[5]) * Math.exp(-FF.decay * Math.max(0, t - 0.9)));
        rz += sgn * a * Math.sin(TAU * FF.hz * t + ph); px += a * 0.8 * Math.sin(TAU * FF.hz * 0.8 * t + ph + 0.9);
      }
      const w = wIn * (arm ? smoothstep(0, 0.15, t - (st[0] ? 0.3 : 0.55)) : 1) * (/Leg$|UpLeg$/.test(name) ? k : 1);
      if (!w || (!px && !rz && !yy)) continue;
      // the bone's direction in the rider's frame (to its first child bone; the head: up)
      b.updateWorldMatrix(true, false); b.getWorldPosition(_fa);
      const kid = b.children.find((o) => o.isBone);
      if (kid) { kid.getWorldPosition(_fb); _fb.sub(_fa).applyQuaternion(rq); } else _fb.set(0, 1, 0);
      if (_fb.lengthSq() < 1e-8) continue; _fb.normalize();
      _fq.identity();
      if (px) { _fc.crossVectors(_fb, Z); if (_fc.lengthSq() > 1e-6) _fq.premultiply(_fq2.setFromAxisAngle(_fc.normalize(), px * D * w)); }
      if (rz) { _fc.crossVectors(_fb, XA); if (_fc.lengthSq() > 1e-6) _fq.premultiply(_fq2.setFromAxisAngle(_fc.normalize(), rz * D * w)); }
      if (yy) _fq.premultiply(_fq2.setFromAxisAngle(Y, yy * D * w));
      // rider-frame rotation -> the bone's parent frame:  q_local' = P^-1 * q * P * q_local, P = the parent's rotation in the rider frame
      b.parent.getWorldQuaternion(_fq2).premultiply(rq);
      _fq.premultiply(_fq3.copy(_fq2).invert()).multiply(_fq2);
      this.rider.getWorldQuaternion(_fq3).invert();      // (restore rq, used above as scratch)
      b.quaternion.premultiply(_fq);
    }
    this.rig.root ? this.rig.root.updateMatrixWorld(true) : this.rider.updateMatrixWorld(true);
  }
  /**
   * The ragdoll takes him at the exit: its points start where the posed bones are, moving as the launch says (v, and the turn w about the pelvis),
   * on top of what the pose itself was doing. Each bone keeps its own rotation relative to its points' frame from here on (Q0, B0).
   */
  _ragStart(v, w) {
    const B = this.rig.bones, n = RAG_POINTS.length, pos = new Float32Array(3 * n), vel = new Float32Array(3 * n);
    this.rider.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      const b = B[RAG_POINTS[i][1]]; if (!b) return;
      b.getWorldPosition(_fa);
      if (RAG_POINTS[i][0] === 'head' && B.HeadTop_End) { B.HeadTop_End.getWorldPosition(_fb); _fa.lerp(_fb, 0.45); }      // (the middle of the helm)
      pos[3 * i] = _fa.x; pos[3 * i + 1] = _fa.y; pos[3 * i + 2] = _fa.z;
    }
    for (let i = 0; i < n; i++) {
      _fb.set(pos[3 * i] - pos[0], pos[3 * i + 1] - pos[1], pos[3 * i + 2] - pos[2]); _fc.crossVectors(w, _fb).add(v);
      vel[3 * i] = _fc.x; vel[3 * i + 1] = _fc.y; vel[3 * i + 2] = _fc.z;
    }
    const rd = new Ragdoll(pos, vel, this.armourDef.kg ?? 28, PHYS.ragdoll.helmKg); rd.tiltTop = this.tiltTop || 0;
    const Q0 = {}, B0 = {};
    for (const e of RAG_BONES) {
      const b = B[e[0]]; if (!b) continue; Q0[e[0]] = b.getWorldQuaternion(new THREE.Quaternion());
      if (e[1] !== 'mix') B0[e[0]] = ragBasis(pos, RI[e[1]], RI[e[2]], RI[e[3]], RI[e[4]], new THREE.Quaternion());
    }
    this.rag = { rd, Q0, B0, t: 0, ms: 0, slideT: 0, landed: false, P0: Float32Array.from(pos) };      // (P0: the points at the exit, a seated man: src/aftermath.js measures him from it)
  }
  /** A step of the ragdoll (update), with the sounds and the sand of the landing and the slide. */
  _ragStep(dt) {
    const G = this.rag, rd = G.rd; if (!rd) return;
    const t0 = performance.now(); rd.step(dt); G.ms = G.ms * 0.9 + (performance.now() - t0) * 0.1; G.t += dt;
    if (rd.landed && !G.landed) { G.landed = true; if (this.onLand) this.onLand(_fa.set(rd.landAt[0], rd.landAt[1], rd.landAt[2]), rd.landSpeed); }
    const s = rd.slide(RI.pelvis); G.slideT -= dt;
    if (s.down && s.v > PHYS.impact.fall.skid && G.slideT <= 0 && this.onSkid) { G.slideT = 0.07; this.onSkid(_fa.set(rd.p[0], 0.05, rd.p[2]), s.v, _fb.set((rd.p[0] - rd.q[0]) / PHYS.ragdoll.h, 0, (rd.p[2] - rd.q[2]) / PHYS.ragdoll.h)); }
  }
  /** Pose the skinned bones from the ragdoll's points (live, or the replay's record), cross-faded in from the authored pose over ragdoll.fade s. */
  _ragPose() {
    const G = this.rag; if (!G) return;
    const P = this.replaying ? (this._ragSnap && this._ragSnap.p) : this.getUp && this.getUp.on ? this.getUp.P : G.rd.p; if (!P) return;      // (getUp: src/aftermath.js takes the points over once he lies still: the roll, the kneel, the stand)
    const wB = this.replaying ? (this._ragSnap.w ?? 1) : smoothstep(0, PHYS.ragdoll.fade, G.t);
    const B = this.rig.bones, Rq = {};
    for (const e of RAG_BONES) {
      const b = B[e[0]]; if (!b || !G.Q0[e[0]]) continue;
      if (e[1] === 'mix') { if (!Rq[e[2]] || !Rq[e[3]]) continue; Rq[e[0]] = Rq[e[2]].clone().slerp(Rq[e[3]], e[4]); }
      else Rq[e[0]] = ragBasis(P, RI[e[1]], RI[e[2]], RI[e[3]], RI[e[4]], new THREE.Quaternion()).multiply(_fq.copy(G.B0[e[0]]).invert());
    }
    const GU = !this.replaying && this.getUp && this.getUp.on && this.getUp.W ? this.getUp : null;      // (src/aftermath.js poses the trunk, hips and head from its own frames: the exit pose was bent back over the cantle, so the points of the trunk say nothing of an upright man)
    for (const e of RAG_BONES) {      // parents first: each bone's world rotation = (its points' turn since the exit) x (its rotation at the exit)
      const b = B[e[0]], R = Rq[e[0]]; if (!b || !R) continue;
      _fq.copy(R).multiply(G.Q0[e[0]]); if (GU && GU.W[e[0]]) _fq.slerp(GU.W[e[0]], GU.ww);
      b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_fq2);
      _fq.premultiply(_fq2.invert());
      b.quaternion.slerp(_fq, wB); b.updateMatrixWorld(true);
    }
    // the figure sits where the pelvis point is
    B.Hips.getWorldPosition(_fa); _fb.set(P[0], P[1], P[2]).sub(_fa).multiplyScalar(wB);
    this.rider.position.add(_fb); this.rider.updateMatrixWorld(true);
  }
  /** Out of the saddle: the irons stay on the horse, hanging from the bars (they were on his feet). */
  _stirFree() {
    if (!this._stir || this._stirLoose) return;
    this._stirLoose = true;
    for (const S of this._stir) {
      const iron = S.top.parent; if (!S.home) S.home = { foot: iron.parent, p: iron.position.clone(), q: iron.quaternion.clone() };
      this.mount.attach(iron); this.mount.attach(S.lea); this.mount.attach(S.lea2); S.iron = iron;
      S.hang = iron.position.clone(); S.hv = new THREE.Vector3();
    }
  }
  /** Back in the saddle (a replay, a new course): the irons on his feet again. */
  _stirHome() {
    if (!this._stir || !this._stirLoose) return;
    this._stirLoose = false;
    for (const S of this._stir) { if (!S.home) continue; S.home.foot.add(S.iron); S.iron.position.copy(S.home.p); S.iron.quaternion.copy(S.home.q); this.rider.add(S.lea); this.rider.add(S.lea2); }
  }

  /** Everything needed to redraw this rider at an instant (for instant replay). */
  snapshot() {
    const r = this.root, s = { px: r.position.x, pz: r.position.z, ry: r.rotation.y, rz: r.rotation.z, dir: this.dir, speed: this.speed, phase: this.phase, time: this.time,
      lanceLower: this.lanceLower, ax: this.aimLocal.x, ay: this.aimLocal.y, az: this.aimLocal.z, brace: this.brace, recoil: this.recoil, sideRecoil: this.sideRecoil,
      rear: this.rear, guard: this.guard, look: this.look, agit: this.agit || 0, lanceBroken: this.lanceBroken, unhorsed: this.unhorsed, twist: this.twist, headK: this.headK, shK: this.shK, stag: this.stag, raise: this.raise, visorUp: this.visorUp, helmOff: this.helmOff, shGone: !!this.shGone, lr: this._lanceRel(), ld: !!this.lanceDropped, fc: this._fallState(), rg: this.rag && this.unhorsed ? { p: Array.from(this.getUp && this.getUp.on ? this.getUp.P : this.rag.rd.p, (v) => Math.round(v * 1000) / 1000), w: Math.min(1, this.rag.t / PHYS.ragdoll.fade) } : null, bd: this._bendU ? this._bendU.uB.value.toArray() : null, bl: this._bendU ? this._bendU.uL.value : 0, fx: [this.hS, this.hY, this.push, this.jZ, this.wX, this.wY, this.toss, this.chk, this.shd, this.jX, this.jY] };      // lr: the lance exactly as it was posed, relative to the root (the live pose rests on eased state and on the other man's body, which a replay does not have)
    if (this.unhorsed) { const p = this.rider.position, q = this.rider.quaternion; s.rp = [p.x, p.y, p.z]; s.rq = [q.x, q.y, q.z, q.w]; s.tx = this.torsoD.rotation.x; }
    if (this.rig) { const T = this.torsoD.rotation, H = this.helmD.rotation, S = this.shield; s.limp = this.limp; s.rig = [T.x, T.y, T.z, H.x, H.y, H.z, S.position.x, S.position.y, S.position.z, S.rotation.x, S.rotation.y, S.rotation.z]; s.ride = rideSave(this.rig.ride); }      // the rig's pose: its blend and the puppet's drivers
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
    this._snapRide = s.ride || null;      // the rider's give to the saddle as it was (a replay steps with dt 0: it reads this, see _rideUpdate)
    this.twist = s.twist || 0; this.headK = s.headK || 0; this.shK = s.shK || 0; this.stag = s.stag || 0;
    this._fcSnap = s.fc || null; this._ragSnap = s.rg || null;
    if (s.bd) { this._bendPatch(this.lanceMat); this._bendU.uB.value.fromArray(s.bd); this._bendU.uL.value = s.bl || this.reach; } else if (this._bendU) this._bendU.uB.value.set(0, 0, 0, 0);
    this.raise = this.raiseT = s.raise || 0; this.visorUp = !!s.visorUp; this.helmOff = !!s.helmOff; if (!!s.shGone !== !!this.shGone) this.setShieldGone(!!s.shGone);
    this.lance.visible = !s.ld; this.lanceFore.visible = !s.lanceBroken; this.lanceStump.visible = s.lanceBroken; if (this.lanceKept) this.lanceKept.visible = s.lanceBroken;
    if (s.unhorsed) {
      if (this.rider.parent !== this.scene) { this.scene.attach(this.rider); this._stirFree(); }
      this.rider.position.set(s.rp[0], s.rp[1], s.rp[2]); this.rider.quaternion.set(s.rq[0], s.rq[1], s.rq[2], s.rq[3]).normalize(); this.torsoD.rotation.x = s.tx;
    } else if (this.rider.parent !== this.mount) { this.mount.add(this.rider); this.rider.position.set(0, 0, 0); this.rider.quaternion.identity(); this._stirHome(); }
    this.snapUnhorsed = s.unhorsed; this.snapLR = s.lr || null;
    if (this.rig && s.rig) {      // the figure's pose as it was: unhorsed, the springs are not run in a replay, so the recorded drivers are used as they are
      this.limp = s.limp || 0; const r = s.rig; this.torsoD.rotation.set(r[0], r[1], r[2]); this.helmD.rotation.set(r[3], r[4], r[5]);
      if (s.unhorsed) { this.shield.position.set(r[6], r[7], r[8]); this.shield.rotation.set(r[9], r[10], r[11]); }
    }
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this._dt = dt;
    this._peak = Math.max(this.speed, (this._peak || 0) - 0.3 * dt);      // (the pace he came down the lists at: the carry ends when he has slowed well below it)
    if (!this._liftFrame) { this._lf = null; this.carry = damp(this.carry, 0, 5, dt); this.lw = damp(this.lw || 0, 0, 12, dt); } this._liftFrame = false;      // (liftStep, main.js, runs before update on the frames the lance is going up)
    this.time += dt; const t = this.time;
    if (this.cel) celStep(this, dt);
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
    { const b = this.body, m = this.modelPivot; b.rotation.set(0, 0, 0); b.position.x = b.position.z = 0; if (m) { m.rotation.set(0, 0, 0); m.position.x = m.position.y = 0; m.position.z = -0.75; } }      // (undo last frame's _horseMotion before the clip is sampled)
    this._lastDt = dt;
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
      // (Gallop now carries the neck at 40 degrees and the face about 55 below horizontal itself, so the pace no longer lowers it; only the walk keeps the old tuck.)
      // A charging horse stretches his head forward and down; the model carries it high (its poll level with the rider's shield), which put
      // it in the line of the other man's lance. Lower it with the pace, after the clip has posed the neck (13 Nov).
      if (!this._neck) this._neck = [this.model.getObjectByName('Neck1'), this.model.getObjectByName('Neck2')];
      { const k = 0.35 * (1 - g) * amp * (1 - this.rear); if (this._neck[0]) this._neck[0].rotation.x -= 0.42 * k; if (this._neck[1]) this._neck[1].rotation.x -= 0.22 * k; }
      this.modelPivot.rotation.x = -this.rear * 0.62; this.modelPivot.position.y = this.rear * 0.1;
      this.root.updateMatrixWorld(true);
      const by = this.newHorse ? this._seatSample() - this.seatRest : this.root.worldToLocal(this.backBone.getWorldPosition(_v3)).y - this.backRest;
      this.body.position.y = (BY + this.rear * 0.25) * this.hs + by;
      this.body.rotation.x = pitch * 0.5 * (1 - clamp(PHYS.ride.horseFollow, 0, 1)) - this.rear * 0.62;      // (the saddle now takes the clip's own back pitch instead, _horseCalc)
      this.bob = by;
    }

    this._horseCalc();
    // neck & head: stretch out at the gallop, nod with the stride
    const idle = (1 - amp) * (Math.sin(t * 0.9) * 0.04 + Math.max(0, Math.sin(t * 0.31 + 1)) * 0.06);
    this.neck.rotation.x = lerp(-0.02, 0.24, g) + g * 0.07 * Math.sin(cyc + 1.2) + idle + this.rear * 0.25;
    this.head.rotation.x = lerp(0.12, -0.2, g) - g * 0.05 * Math.sin(cyc + 1.2) + idle * 0.5;
    const ag = this.agit || 0;
    this.head.rotation.z = Math.sin(t * 8.5) * 0.16 * ag * (0.5 + 0.5 * Math.sin(t * 1.3)); this.neck.rotation.y = Math.sin(t * 3.1) * 0.1 * ag;
    this.neck.rotation.x -= Math.max(0, Math.sin(t * 2.2)) * 0.12 * ag + this.toss * 0.5; this.body.rotation.x += this.chk * 0.06; this.head.rotation.x -= this.toss * 0.4;
    if (this._neck) { if (this._neck[0]) this._neck[0].rotation.x += this.toss * 0.25; if (this._neck[1]) this._neck[1].rotation.x += this.toss * 0.35; }
    if (this._neck) {      // anatomical limit, live and replay: the horse's neck and poll never turn more than ~60 degrees to either side (nor roll) of its body, whatever drives them
      if (this._headB === undefined) this._headB = this.model.getObjectByName('Head') || null;
      for (const b of [this._neck[0], this._neck[1], this._headB]) if (b) { b.rotation.y = clamp(b.rotation.y, -1.05, 1.05); b.rotation.z = clamp(b.rotation.z, -1.05, 1.05); }
    }
    this.tail.rotation.x = lerp(0.08, 0.95, g * amp) + Math.sin(cyc + 1) * 0.1 * amp + Math.sin(t * 1.3) * 0.04;
    this.tail.rotation.z = Math.sin(t * 2.1) * 0.08 + Math.sin(cyc * 0.5) * 0.1 * amp;

    // caparison flutter (the skinned cloth's hem sways in its vertex shader: only the numbers go over; the old drapes are moved here)
    if (this.capU) this.capU.value.set(t, g * amp, cyc, 0.25 + 0.75 * g * amp);
    if (this.mantU) this.mantU.value.set(t, g * amp);
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
    if (this.going) {
      const g = this.going; g.tt += dt;
      if (this.rig && FALL_CLIPS[g.style]) { this.recoilV = 0; this.recoil = damp(this.recoil, 0, 10, dt); }      // (the authored spine curve does the bending back, _fallPose)
      else { this.recoilV = 0; this.recoil = Math.min(1.5, this.recoil + 4.0 * dt); }
      g.t -= dt; if (g.t <= 0) this._detach();
    }
    else { const st = this.strength || 1; this.recoilV += (-this.recoil * 38 * st - this.recoilV * 6.5 * Math.sqrt(st)) * dt; this.recoil += this.recoilV * dt; }      // a strong seat brings him back upright sooner
    this.sideRecoilV += (-this.sideRecoil * 34 - this.sideRecoilV * 6) * dt; this.sideRecoil += this.sideRecoilV * dt;
    this.twistV += (-this.twist * 30 - this.twistV * 6) * dt; this.twist += this.twistV * dt;            // shoulders turned by a blow off the spine
    this.headV += (-this.headK * 70 * (this.strength || 1) - this.headV * 9 * Math.sqrt(this.strength || 1)) * dt; this.headK += this.headV * dt;                // the head snapped back
    this.shV += (-this.shK * 60 - this.shV * 9) * dt; this.shK += this.shV * dt;                          // the shield driven in against the chest
    this.stagV += (-this.stag * 26 - this.stagV * 5) * dt; this.stag += this.stagV * dt;                  // the horse rocked sideways under the blow
    this._reactStep(dt);
    { const sg = clamp(this.stag, -0.16, 0.16); this.body.rotation.z = sg; if (this.modelPivot) this.modelPivot.rotation.z = sg; }
    const off = this.replaying ? this.snapUnhorsed : this.unhorsed;
    if (this.rig) this._rideUpdate(dt, cyc, off);
    if (this.newHorse) this._tackUpdate(off);
    if (!off) {
      const so = this.rig ? PHYS.ride.synth : 1;      // (the rigged rider's give comes from the chain; the old synthetic posting and torso rock are kept only in a share, PHYS.ride.synth)
      this.rider.position.y = -bob * 0.12 + g * amp * 0.035 * so * Math.sin(cyc + 3.4) + this.brace * 0.045;
      this.rider.position.z = this.brace * 0.07 + this.push;
      if (this.going && this.rig && FALL_CLIPS[this.going.style]) { const g = this.going; hipsAt(FALL_CLIPS[g.style], g.tt, g.out, g.k, _fa); this.rider.position.x = _fa.x; this.rider.position.y += _fa.y; this.rider.position.z += _fa.z; }      // lifted and slid back over the cantle
      else this.rider.position.x = 0;
      this.rider.rotation.x = -this.body.rotation.x * 0.75;
      // the body is thrown back as the horse surges and pitches forward as he checks
      const acc = dt > 0 ? (sp - (this.prevSp ?? sp)) / dt : 0; this.prevSp = sp;
      this.accLean = damp(this.accLean || 0, clamp(-acc * 0.028, -0.2, 0.24), 5, dt);
      const T = this.torsoD.rotation, Hd = this.helmD.rotation;      // (the puppet: the rigged rider turns these into bone rotations, rider_rig.js)
      T.x = 0.05 + 0.13 * g * amp + this.brace * 0.44 + this.lean + this.accLean - clamp(this.recoil, -0.4, 1.5) - this.shd + g * amp * 0.03 * so * Math.sin(cyc + 2.6);
      T.z = clamp(this.sideRecoil, -0.6, 0.6);
      T.y = 0.12 * this.lanceLower + this.look * 0.6 + clamp(this.twist, -0.7, 0.7);
      Hd.x = -0.05 * g + clamp(this.recoil, -0.3, 0.6) * 0.5 - this.brace * 0.2 - clamp(this.headK, -0.3, 0.6);   // chin down, eyes still on the mark
      Hd.y = 0.25 * this.lanceLower + this.look * 1.9 + clamp(this.hY, -0.8, 0.8); Hd.z = clamp(this.hS, -0.6, 0.6);
      // shield guard: raised it covers the helm and bares the body
      const gd = this.guard, sk_ = clamp(this.shK, -0.3, 0.8), sh = this.shield;
      if (this.rig) {      // offsets from where the targe hangs on the arm (the left hand follows it)
        const rs = this.rig.ride.sh; sh.position.set(rs[0], (0.2 * gd - 0.04 * sk_) * KS + rs[1], (0.03 * gd - 0.07 * sk_) * KS); sh.rotation.set(-0.22 * gd - 0.5 * sk_ + rs[2], 0, this._vAsk + rs[3]);      // (+ the shake of the arm, rideStep)
        this.zones[0].r = this._zr[0] * (1 - 0.55 * gd);
      } else {
        sh.position.y = 0.29 + 0.2 * gd - 0.04 * sk_; sh.rotation.x = -0.08 - 0.22 * gd - 0.5 * sk_; sh.rotation.z = 0.06 + this._vAsk; sh.position.z = 0.2 + 0.03 * gd - 0.07 * sk_;
        this.lance.position.z = 0.25 + this.brace * 0.2 + this.jZ;       // the thrust: the arm drives the lance forward as the body goes in
        this.lance.position.y = 0.13 + 0.25 * this.raise;      // lifted in the hand when he shows he is ready
        this.zones[1].o.position.y = 0.3 + 0.21 * gd; this.zones[0].r = 0.17 * (1 - 0.55 * gd);
      }
    } else if (!this.replaying && this.rag) this._ragStep(dt);      // the ragdoll (both screens run it, from the same launch)
    else if (!this.replaying && !this.remote) this._updateFall(dt);      // (online, the friend's fallen rider is placed from his own stream: see online.js applyRider)
    if (this.rig && !this.replaying) this.limp = damp(this.limp, off ? 1 : 0, off ? 5 : 20, dt);      // a man who has come off goes limp: the Stand pose, arms hanging
    this.plume.rotation.x = -0.15 - 0.5 * g * amp + Math.sin(t * 7) * 0.05 * (0.3 + amp);
    // raised lance, visor swing and helm on/off
    if (!this.replaying) this.raise = damp(this.raise, this.raiseT, 7, dt);
    if (this.rig && !this.visor) this.visorUp = false;      // (the rigged helm has no visor: nothing is ever 'up', so no blow is taken 'with the visor up')
    const helmOn = !this.helmOff && !this.celHelmOff;      // (celHelmOff: a celebration waves the helm, celebrate.js)
    if (helmOn !== this._helmShown) this._showHelm(helmOn);
    if (this.rig) {      // (first person hides the helm, and the head inside it, by the marker's flag)
      const R = this.rig, hv = this.helm.visible; if (R.helmMesh) R.helmMesh.visible = hv && helmOn; if (R.headMesh) R.headMesh.visible = hv;
    }
    if (!this._vPlume) this.plume.visible = false;      // knocked off by a blow (it flew as a piece, see main.js strike)
    if (this.visor) { this._vk = damp(this._vk, this.visorUp && !this.helmOff ? 1 : 0, 14, dt); this.visor.rotation.x = -1.25 * this._vk; }   // up and back over the brow, about a quarter of a second

    if (this.ribbon.visible) {
      const a = this.ribbon.geometry.attributes.position.array, b = this.ribbonBase;
      for (let i = 0; i < a.length; i += 3) { const w = -b[i + 1] / 0.62; a[i] = b[i] + Math.sin(t * 9 + b[i + 1] * 14) * 0.05 * w; a[i + 2] = Math.sin(t * 7 + b[i + 1] * 9) * 0.04 * w; }
      this.ribbon.geometry.attributes.position.needsUpdate = true;
      this.ribbon.rotation.x = 0.15 + clamp(sp / 11, 0, 1) * 1.1 * this.lanceLower;
    }
    this._horseApply();
    this.applyLance();
  }

  /**
   * The ride (rider_rig.js rideStep): hand the saddle's motion to the rider's spring chain. The saddle is the horse's seat height and body pitch (from the clip) plus a sway and roll
   * once per stride that the clip does not carry; none of it is simulated, it is all read from the animation, so nothing here reaches the strike code except `_aimWob`, which
   * is analytic from the stride phase (PHYS.ride.aimTip, 0 = never).
   */
  _rideUpdate(dt, cyc, off) {
    const D = PHYS.ride, R = this.rig, r = R.ride, sg = r.sig, I = this.amp * (D.walk + (1 - D.walk) * this.gait);
    const live = !off && !this.replaying, f = this._rideFade = live ? Math.min(1, (this._rideFade ?? 0) + dt * 4) : 0;      // eases in after a mount, gone at once in a fall
    r.syn[0] = D.sway * I * Math.sin(cyc + 1.1); r.syn[1] = D.roll * I * Math.sin(cyc + 2.2); r.syn[2] = D.yaw * I * Math.sin(cyc + 0.3);
    if (this.replaying && !off && this._snapRide) {      // a replay: the recorded give (the chain cannot be stepped with dt 0); the horse's body motion itself is re-derived from the phase
      rideLoad(r, this._snapRide); this._aimWob = this._aimFor(cyc);
      return;
    }
    if (!live) { r.init = false; r.k = 0; r.sh.fill(0); r.rel.fill(0); r.surgeRel = r.legF = r.legSw = r.legSide = r.wobX = r.wobY = 0; this._aimWob = null; this._aimUndo = null; return; }
    const hm = this._hm;      // the body's own motion this frame (_horseMotion): the saddle turns with it, the rider lags it
    sg[0] = this.bob; sg[1] = clamp(this.body.rotation.x + this.rear * 0.62, -0.3, 0.3) + (hm ? hm.pitch : 0);      // (body.rotation is still the clip's own here: _horseApply comes last)
    sg[2] = r.syn[0]; sg[3] = r.syn[1] + clamp(this.body.rotation.z, -0.2, 0.2) + (hm ? hm.roll : 0); sg[4] = r.syn[2];
    rideStep(R, dt, this.speed, f);
    this._aimWob = this._aimFor(cyc);
  }
  /** The lance's stride-synchronous bob in the hand (PHYS.ride.aimTip), analytic from the phase so both ends of a match agree; null when off. */
  _aimFor(cyc) {
    const D = PHYS.ride, I = this.amp * (D.walk + (1 - D.walk) * this.gait);
    if (!(D.aimTip > 0 && I > 0.01 && !this.lanceBroken)) return null;
    const k = D.aimTip * this.gait * this.amp / Math.max(1, this.reach), w = this._aimW || (this._aimW = [0, 0]);
    w[0] = -k * Math.sin(cyc + 2.9); w[1] = 0.5 * k * Math.sin(cyc + 1.7); return w;
  }

  /**
   * The horse's body under the rider (PHYS.ride.horsePitch / horseRoll): film shows the rider quiet on a horse that pitches 14 deg p-p and rolls 7 at the gallop. The pitch and roll are
   * added to the body group (tack, caparison, rider) and to the model's pivot (the skin) as one rotation about a point near the girth, so the feet stay roughly where the clip puts them.
   * Analytic from the stride phase and the gait, so a replay re-derives it. `undo` puts both back to what update() set before the clip is sampled (the seat sample must not see it).
   */
  /** Pitch (rad, + = nose down) of the horse's back line as the clip poses it: from the croup to the withers bones, in the root's frame. null if the file has no such bones. */
  _lineAngle() {
    if (this._lnA === undefined) { const m = this.model; this._lnA = m && m.getObjectByName('Torso3') || null; this._lnB = m && (m.getObjectByName('Back') || m.getObjectByName('Body')) || null; }
    if (!this._lnA || !this._lnB) return null;
    this._lnA.getWorldPosition(_hv); this._lnB.getWorldPosition(_hp); this.root.worldToLocal(_hv); this.root.worldToLocal(_hp);
    return -Math.atan2(_hv.y - _hp.y, _hv.z - _hp.z);
  }
  /**
   * What the body adds this frame: `follow` = the saddle takes the back line's own pitch from the clip (the skin already shows it; the tack, cloth and rider had only a small part of it),
   * `pitch`/`roll` = the added synthetic motion on skin and tack alike. All from the phase and the clip, so a replay (update(0)) re-derives it.
   */
  _horseCalc() {
    const D = PHYS.ride, hm = this._hm || (this._hm = { pitch: 0, roll: 0, follow: 0, mean: 0, syn: 0 });
    if (!this.hasModel) { hm.pitch = hm.roll = hm.follow = hm.syn = 0; return; }
    const cyc = this.phase * TAU, sc = this.amp * (D.horseWalk + (1 - D.horseWalk) * Math.pow(this.gait, 0.85)) * (1 - this.rear) * D.on, P = D.horsePhase;
    hm.syn = D.horsePitch * sc * Math.sin(cyc + P[0]); hm.roll = D.horseRoll * sc * (0.75 * Math.sin(cyc + P[1]) + 0.25 * Math.sin(cyc * 0.5 + P[2]));
    const la = D.horseFollow > 0 && D.on > 0 ? this._lineAngle() : null;
    if (la === null) hm.follow = 0;
    else { if (this._lnInit === undefined || this.amp < 0.02) { hm.mean = la; this._lnInit = true; } else hm.mean = damp(hm.mean, la, 3, this._lastDt || 0); hm.follow = clamp((la - hm.mean) * D.horseFollow * D.on, -0.2, 0.2); }
    hm.pitch = hm.syn + hm.follow;      // (what the saddle turns by, over the clip's own small body pitch)
  }
  _horseApply() {
    const hm = this._hm, D = PHYS.ride; if (!hm || (hm.pitch === 0 && hm.roll === 0)) return;
    _hp.set(D.horsePivot[0], D.horsePivot[1] * (this.horseDef.withers ?? 1.6), D.horsePivot[2]);
    if (hm.syn !== 0 || hm.roll !== 0) {      // the synthetic pitch and the roll, skin and tack together, about the girth
      _he.set(hm.syn, 0, hm.roll, 'ZXY'); _hq.setFromEuler(_he);
      for (const o of [this.body, this.modelPivot]) {
        if (!o) continue;
        _hv.copy(o.position).sub(_hp).applyQuaternion(_hq).add(_hp); o.position.copy(_hv); o.quaternion.premultiply(_hq);
      }
    }
    if (hm.follow !== 0) {      // the saddle's own tilt with the back line, about the girth too (a pivot at the seat swung the cloth's hem and left the skin bare)
      _hp.set(D.horsePivot[0], D.horsePivot[1] * (this.horseDef.withers ?? 1.6), D.horsePivot[2]);
      _he.set(hm.follow, 0, 0); _hq.setFromEuler(_he); const o = this.body;
      _hv.copy(o.position).sub(_hp).applyQuaternion(_hq).add(_hp); o.position.copy(_hv); o.quaternion.premultiply(_hq);
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Two lances never go through each other: if the shafts would interpenetrate the tips are pushed apart in the vertical plane only, one over the other
   * (the lower man's tip dips, the higher man's rises, each half the way: the footage shows them passing one over the other).
   * Cosmetic: main.js calls this once a frame AFTER the strikes have been resolved (the next applyLance starts again from the true pose), and tipWorld undoes it (_lvR) for anything
   * that asks in between, so no stroke, score or net message sees it. Eased in and out.
   */
  lanceOver() {
    const F = this.foe; let want = 0;
    if (F && F.lance && this.lanceLower > 0.5 && F.lanceLower > 0.5 && !F.lanceBroken && !this.lanceBroken && !F.unhorsed && !this.unhorsed) {
      this.lance.updateMatrixWorld(true); F.lance.updateWorldMatrix(true, false);
      this.lance.getWorldPosition(_lvA); this.lance.localToWorld(_lvB.set(0, 0, this.reach));
      F.lance.getWorldPosition(_lvC); F.lance.localToWorld(_lvD.set(0, 0, F.reach));
      const d = closestSegSeg(_lvA.x, _lvA.y, _lvA.z, _lvB.x, _lvB.y, _lvB.z, _lvC.x, _lvC.y, _lvC.z, _lvD.x, _lvD.y, _lvD.z), SH = PHYS.shaft, lack = SH.across + 0.06 - d;
      if (lack > 0) {
        const s = Math.max(0.5, SS.s * this.reach), a = Math.min(0.3, lack / 2 / s);      // an angle at the contact's distance along the shaft; half each
        want = (SS.y1 > SS.y2 || (SS.y1 === SS.y2 && this.dir > 0) ? -1 : 1) * a;      // negative: this tip rises (rotation about up x lance lowers a tip for a positive angle)
      }
    }
    this.lvA = (this.lvA || 0) + (want - (this.lvA || 0)) * (1 - Math.exp(-14 * (this._dt || 0.016)));
    if (Math.abs(this.lvA) < 0.002) { this._lvR = null; return; }
    _lvB.subVectors(this.lance.localToWorld(_lvD.set(0, 0, 1)), this.lance.getWorldPosition(_lvA)).normalize();      // the shaft's direction
    _lvC.set(0, 1, 0).cross(_lvB); if (_lvC.lengthSq() < 1e-6) { this._lvR = null; return; } _lvC.normalize();
    this._lvR = (this._lvR || new THREE.Quaternion()).setFromAxisAngle(_lvC, this.lvA);
    this.torso.getWorldQuaternion(_lvP);
    _q.copy(_lvP).invert().multiply(this._lvR).multiply(_lvP); this.lance.quaternion.premultiply(_q); this.lance.updateMatrixWorld(true);
  }

  /** Point the lance along aimLocal (blended with the upright carry). Safe to call again after re-aiming. */
  applyLance() {
    this._lvR = null;      // (the lance-over-lance dip of the last frame is gone with the pose it was added to: see lanceOver)
    this.root.updateMatrixWorld(true);
    if (this.rig) { poseRig(this, this.rig); if (this.cel) celBody(this); }
    if (!(this.replaying ? this.snapUnhorsed : this.unhorsed)) {
      _v.copy(this.aimLocal); this._clearHorse(_v);                          // the lance is carried across the neck, never through it
      if (this.rig && this.gripUp > 0.001) this.lance.position.y += this.gripUp * smoothstep(0, 0.6, this.lanceLower);      // (poseRig has just reset the grip: this is added once per call)
      _v.applyQuaternion(this.root.quaternion);                              // world
      this.torso.getWorldQuaternion(_q).invert();
      _v.applyQuaternion(_q);                                                // torso-local
      _q2.setFromUnitVectors(Z, _v.normalize());
      if (!this.carryQ) { const L = PHYS.lift, cp = Math.cos(L.carryPitch); this.carryQ = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(Math.sin(L.carryYaw) * cp, Math.sin(L.carryPitch), Math.cos(L.carryYaw) * cp).normalize()); }      // (torso frame: +x is his left)
      this.lance.quaternion.copy(this.lanceRestQ); if (this.carry > 0.001) this.lance.quaternion.slerp(this.carryQ, smoothstep(0, 1, this.carry));
      this.lance.quaternion.slerp(this.lanceUpQ, smoothstep(0, 1, this.raise)).slerp(_q2, smoothstep(0, 1, this.lanceLower));
      this._aimUndo = null;
      if (this.rig && this._aimWob) {
        const sh = PHYS.ride.aimShare, w0 = this._aimWob[0], w1 = this._aimWob[1];
        _uc.copy(this.lance.quaternion);      // (the lance before the bob: Qb)
        _we.set(w0, w1, 0); this.lance.quaternion.multiply(_wq.setFromEuler(_we));
        if (sh < 1) {      // the strike's tip = the drawn tip turned by Qb * Wshare * Wfull^-1 * Qb^-1 (exact, whatever the whip that follows)
          _ua.setFromEuler(_we.set(w0 * sh, w1 * sh, 0)); _ub.setFromEuler(_we.set(w0, w1, 0)).invert();
          this._aimUndo = (this._aimUndo || new THREE.Quaternion()).copy(_uc).multiply(_ua).multiply(_ub).multiply(_uc.invert());
        }
      }      // the lance's real bob in the hand (PHYS.ride.aimTip), from the stride phase
      if (this.wX || this.wY || this.jX || this.jY || this.lw) { _we.set(clamp(this.wX + this.jY * 0.3 + (this.lw || 0), -0.5, 0.5), clamp(this.wY + this.jX * 0.3 + (this.lw || 0) * 0.4, -0.5, 0.5), 0); this.lance.quaternion.multiply(_wq.setFromEuler(_we)); }      // the whip of a lance that struck, the jolt of the arm that was struck
      if (this.pin && !this.replaying) this._pinLance();      // the point stays on the man it struck (pinLance)
      if (this.replaying && this.snapLR) this._lanceFromRel(this.snapLR);      // a replay shows the recorded pose, not a recomputed one
      if (this.cel) celLance(this);      // (a celebration points the lance where it wants: celebrate.js)
      this.lance.updateMatrixWorld(true);
    }
    if (this.rig) { armsRig(this, this.rig, this.replaying); if (this.cel) celArms(this); if (this.rig.body) this.rig.body.update(); this._fallPose(); if (this.rag && (this.replaying ? this.snapUnhorsed && this._ragSnap : this.unhorsed)) this._ragPose(); this._clipUpdate(); this._stirUpdate(); }
    // reins: bit -> bridle hand (or the saddle bow once the rider is gone)
    const tgt = (this.replaying ? this.snapUnhorsed : this.unhorsed) ? this.pommel : this.hand;
    tgt.getWorldPosition(_v2); this.root.worldToLocal(_v2);
    if (this.newHorse) {      // the model's reins end at a fixed point by the bridle hand; the leather runs on from there to the rider's actual left hand (the saddle bow once he is gone)
      this.reinEnd.getWorldPosition(_v); this.root.worldToLocal(_v); _v3.subVectors(_v2, _v); const len = _v3.length(), r = this.reins[0];
      r.visible = len > 0.03 && len < 1.2 && !!(this.rider && this.rider.parent || (this.replaying ? this.snapUnhorsed : this.unhorsed)); this.reins[1].visible = false;
      if (r.visible) { r.position.copy(_v).addScaledVector(_v3, 0.5); r.scale.set(1, len, 1); r.quaternion.setFromUnitVectors(Y, _v3.divideScalar(len)); }
      return;
    }
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
    if (f.clip) f.tt += dt;
    const pts = this.rig ? FALL_PTS_RIG : FALL_PTS, n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
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
          if (!f.landed && _v2.y < -1.2) { f.landed = true; f.kick = Math.min(1.5, Math.abs(_v2.y) / 4); if (this.onLand) this.onLand(r.position, Math.abs(_v2.y)); }
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
    this.torsoD.rotation.x = damp(this.torsoD.rotation.x, -0.15, 4, dt);
    // the limbs trail: head, shield arm and lance lag behind the body's turning (they are not on springs of their own, so they follow his spin late)
    { const k = 1 - Math.exp(-7 * dt); f.wl.lerp(f.w, k); _v.copy(f.wl).sub(f.w).applyQuaternion(_q.copy(r.quaternion).invert());
      const Hd = this.helmD.rotation; Hd.x = clamp(_v.x * 0.14, -0.7, 0.7); Hd.z = clamp(-_v.z * 0.14, -0.6, 0.6); Hd.y = clamp(_v.y * 0.1, -0.5, 0.5);
      if (this.rig) { this.shield.position.set(0, 0, 0); this.shield.rotation.set(clamp(_v.x * 0.1, -0.5, 0.5), 0, this._vAsk + clamp(-_v.z * 0.12, -0.6, 0.6)); }
      else { this.shield.rotation.x = -0.08 + clamp(_v.x * 0.1, -0.5, 0.5); this.shield.rotation.z = 0.06 + this._vAsk + clamp(-_v.z * 0.12, -0.6, 0.6); }
      this.torsoD.rotation.z = clamp(-_v.z * 0.05, -0.3, 0.3); }
    if (!this.rig) this.lance.quaternion.slerp(this.lanceRestQ, 1 - Math.exp(-3 * dt));
  }
}
