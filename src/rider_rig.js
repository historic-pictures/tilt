// rider_rig.js - the rigged, armoured rider (assets/models/armour/rider.glb) in the game.
//
// The Blender-built figure is a 1.73 m man on a Mixamo-named skeleton with five one-frame pose clips. The game keeps its own rider "puppet" (the
// reaction springs, the lean, the lance aim: all in jouster.js, numbers unchanged) and this file turns what the puppet does into bone rotations:
//   * the pose clips are blended by hand (Seated -> LanceRaised by `raise`, -> Couch by `lanceLower`, -> Stand as he goes limp in a fall);
//   * the puppet's torso / helm rotations are added on Spine, Spine1, Spine2 and Neck (so the reactions bend the real spine);
//   * the right arm is two-bone IK'd so the fist stays on the lance grip wherever the game aims the shaft; the left hand follows the shield.
// The old code-built groups (rider, torso, helm, shield, lance) still exist as frames of reference for the rest of the game (camera, strike code...):
// here they are markers hung on bones, so they ride the skeleton. Hit volumes are parented to the same bones.
//
// Which glb a harness or helm id uses: RIG_FILES below. Only the Gothic set exists as a rig (it stands in for every harness for now);
// drop in `harness_<id>.glb` (same skeleton, same sockets, same clips) and list the id here to give another harness its own figure.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GFX, wantNewModels } from './gfx.js';
import { touchMode } from './touch.js';
import { expect, progress, done } from './loadmeter.js';
import { PHYS } from './data.js';
import { trapperTexture } from './util.js';

const DIR = new URL('../assets/models/armour/', import.meta.url).href;
/** The rig is 1.73 m; the game's old code-built rider (the frame every number in PHYS.hitboxes is in) was 1 / KS times that. */
export const KS = 0.8394;
const QP = new URLSearchParams(location.search).get('rider');
/** ?rider=rig forces the rig, ?rider=old the code-built rider; otherwise the rig on every tier (Low loads the lod copies); the code-built rider is only the fallback if the files fail. */
export const riderWanted = () => (QP ? QP !== 'old' : wantNewModels());      // (every tier: Low loads the *_lod.glb copies)
export const HARNESSES = ['mail', 'bascinet', 'milanese', 'stechzeug'], HELMS = ['greathelm', 'bascinet', 'armet', 'frogmouth'];
/** lance id (data.js LANCES) -> glb; its tint mask is `<file>_mask_<res>.png` */
export const LANCE_FILES = { light: 'lance_light', standard: 'lance', heavy: 'lance_heavy' };
/** cloth of a harness that takes the rider's first colour (the surcoat, the cover of the coat of plates): material-name prefix -> mask */
const FABRIC = { mail: 'mail_upper', bascinet: 'bascinet_upper' };
/** The lance id of a rider from the girth scale the game gives him (data.js LANCES.scale). */
export const lanceIdOf = (scale = 1) => (scale < 0.93 ? 'light' : scale > 1.08 ? 'heavy' : 'standard');

export const RIG = { ready: false, busy: 0, settled: true, pending: null, figs: new Map(), helms: new Map(), lances: new Map(), targe: null, masks: new Map(), loading: new Map(), tier: '', res: 1024 };

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------------------------------------ loading
const loadImg = (url) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
const gl = new GLTFLoader();
const once = (key, make) => { if (!RIG.loading.has(key)) RIG.loading.set(key, make()); return RIG.loading.get(key); };
const maskImg = (base) => once('mask:' + base, () => loadImg(`${DIR}${base}_mask_${RIG.res}.png`).then(im => { RIG.masks.set(base, im); return im; }).catch(() => null));
const soft = (m) => { if (touchMode && m.metalness > 0.5) m.metalness = 0.5; return m; };

/**
 * Fetch what the rig needs for the harnesses, helms and lances named (ids from data.js), plus the targe. Each file is fetched once, at this tier's size (high 1024, else 512).
 * Resolves true when the rigged rider can be built; false (the code-built rider is used) if the base files fail. Several calls may overlap.
 */
export function preloadRider(want = {}) {
  if (!riderWanted()) return Promise.resolve(false);
  const t = GFX.lod ? '_lod' : GFX.tier === 'high' ? '' : '_512'; RIG.tier = t; RIG.res = t ? 512 : 1024;      // (the lod files keep the 512 colour maps: the livery masks are 512)
  const A = [...new Set((want.armour && want.armour.length ? want.armour : ['stechzeug']).filter(a => HARNESSES.includes(a)))];
  const H = [...new Set((want.helm || []).filter(h => HELMS.includes(h)))], L = [...new Set((want.lance && want.lance.length ? want.lance : ['standard']).filter(l => LANCE_FILES[l]))];
  RIG.busy++; RIG.settled = false; expect('rider' + RIG.busy, 'bg', (A.length + H.length) * (t === '_lod' ? 0.5e6 : t ? 0.9e6 : 1.6e6) + 0.6e6);
  const id = 'rider' + RIG.busy, prog = (e) => progress(id, e);
  const job = (async () => {
    try {
      const jobs = [once('targe', () => gl.loadAsync(`${DIR}targe${t}.glb`, prog).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material.envMapIntensity = 1.15; } }); RIG.targe = g.scene; return true; }))];
      for (const a of A) jobs.push(once('fig:' + a, () => gl.loadAsync(`${DIR}harness_${a}${t}.glb`, prog).then(g => { RIG.figs.set(a, prepareFigure(g, a)); return maskImg(a + '_body'); })), FABRIC[a] ? maskImg(FABRIC[a]) : null);
      for (const h of H) jobs.push(once('helm:' + h, () => gl.loadAsync(`${DIR}helm_${h}${t}.glb`, prog).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; o.material.envMapIntensity = 1.15; soft(o.material); } }); RIG.helms.set(h, g.scene); return true; }).catch(() => null)));
      for (const l of L) jobs.push(once('lance:' + l, () => gl.loadAsync(`${DIR}${LANCE_FILES[l]}${t}.glb`, prog).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material.envMapIntensity = 1.15; } }); g.scene.updateMatrixWorld(true); const c = g.scene.getObjectByName('coronel'), wt = g.scene.getObjectByName('wartip'); RIG.lances.set(l, { scene: g.scene, reach: new THREE.Box3().setFromObject(c).max.z, reachWar: new THREE.Box3().setFromObject(wt || c).max.z }); return maskImg(LANCE_FILES[l]); })));
      await Promise.all(jobs.filter(Boolean));
      RIG.ready = !!RIG.targe && RIG.figs.size > 0 && RIG.lances.size > 0;
    } catch (e) { console.warn('rigged rider unavailable, using the code-built rider', e); }
    done(id); if (--RIG.busy === 0) RIG.settled = true;
    return RIG.ready;
  })();
  return (RIG.pending = job);
}
/** Everything named in `want` has arrived (or the rig is not wanted / failed). */
export function rigHas(want = {}) {
  if (!riderWanted() || (RIG.settled && !RIG.ready)) return RIG.settled;
  return RIG.settled && (want.armour || []).every(a => !a || !HARNESSES.includes(a) || RIG.figs.has(a)) && (want.helm || []).every(h => !h || !HELMS.includes(h) || RIG.helms.has(h)) && (want.lance || []).every(l => !l || !LANCE_FILES[l] || RIG.lances.has(l));
}
/** The figure for a harness id (any loaded figure if that one has not arrived), the helm file for a helm id, the lance for a lance id. */
export const figureFor = (id) => RIG.figs.get(id) || RIG.figs.get('stechzeug') || [...RIG.figs.values()][0] || null;
const helmFor = (id) => RIG.helms.get(id) || RIG.helms.get('frogmouth') || [...RIG.helms.values()][0] || null;
const lanceFor = (id) => RIG.lances.get(id) || RIG.lances.get('standard') || [...RIG.lances.values()][0];

/** A geometry holding only the triangles `idx` of `geo` (its vertices renumbered), so each piece has its own bounds and carries no unused vertices. */
function compact(geo, idx) {
  const map = new Map(), order = []; const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { let n = map.get(idx[i]); if (n === undefined) { n = order.length; map.set(idx[i], n); order.push(idx[i]); } out[i] = n; }
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) {
    const a = geo.attributes[k], Arr = a.array.constructor, d = new Arr(order.length * a.itemSize);
    for (let i = 0; i < order.length; i++) for (let c = 0; c < a.itemSize; c++) d[i * a.itemSize + c] = a.array[order[i] * a.itemSize + c];
    g.setAttribute(k, new THREE.BufferAttribute(d, a.itemSize, a.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(order.length > 65535 ? out : new Uint16Array(out), 1));
  return g;
}

/**
 * THUMBS. The clips curl every finger joint about its bone's local -X; for the four fingers that is toward the palm, but the thumb bones sit turned about 55 degrees from the hand's
 * frame (Thumb1's rest), so the same curl about -X bent the thumb straight DOWN and out, away from the fingers: a stiff hook that read as bent backwards ("inversely curved").
 * The outer two thumb joints now bend about an axis turned 70 degrees from X (mirrored for the left hand: its bone frames are the mirror image), toward the fingers, and only
 * 60% as far, so the thumb lies slightly flexed against the grip. Applied to the clip quaternions once, so every pose (idle, reins, couched lance, celebrations, the ragdoll
 * and the Armoury preview, all of which blend these clips) and every LOD file gets it. Thumb1 (the spread) is left as authored.
 */
const THUMB_PHI = -70 * Math.PI / 180, THUMB_K = 0.6;
function thumbFix(name, q) {
  if (!/HandThumb[23]$/.test(name)) return q;
  const al = -2 * Math.atan2(q.x, q.w) * THUMB_K, ph = THUMB_PHI * (name.startsWith('Left') ? -1 : 1);
  return q.setFromAxisAngle(new THREE.Vector3(Math.cos(ph), 0, Math.sin(ph)), al);
}

/** Pose clips -> {pose: {bone: {quaternion, position}}}; the list of bones that differ between poses; the helm split off the upper harness. */
function prepareFigure(gltf, id) {
  const scene = gltf.scene, P = { scene, id, poses: {} };
  for (const c of gltf.animations) {
    const m = {};
    for (const t of c.tracks) { const i = t.name.lastIndexOf('.'), b = t.name.slice(0, i), p = t.name.slice(i + 1); if (p === 'quaternion' || p === 'position') (m[b] ??= {})[p] = Array.from(t.values.slice(0, p === 'quaternion' ? 4 : 3)); }
    P.poses[c.name] = m;
  }
  scene.updateMatrixWorld(true);
  const bones = {}; scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
  P.bones = bones; P.skel = null;
  // the animated bones: those whose rotation differs between any two poses
  const S = P.poses.Seated, names = Object.keys(S), list = [];
  for (const n of names) {
    const get = (pose) => { const e = P.poses[pose] && P.poses[pose][n]; return e && e.quaternion ? thumbFix(n, new THREE.Quaternion().fromArray(e.quaternion)) : null; };
    const s = get('Seated'), c = get('Couch') || s, r = get('LanceRaised') || s, st = get('Stand') || s;
    if (!s) continue;
    const moves = Math.min(Math.abs(s.dot(c)), Math.abs(s.dot(r)), Math.abs(s.dot(st))) < 0.99999;
    list.push({ name: n, s, c, r, st, moves });
  }
  P.anim = list;
  P.hipsY = S.Hips && S.Hips.position ? S.Hips.position[1] : bones.Hips.position.y;
  // the head of the body is its own mesh too (shown bare when the helm is off, hidden from inside in first person)
  const bd = scene.getObjectByName('Rider_Body');
  if (bd && bd.isSkinnedMesh) {
    const geo = bd.geometry, Pn = geo.attributes.position, I = geo.index.array, cut = bones.Head.getWorldPosition(new THREE.Vector3()).y - 0.04, ia = [], ib = [];
    for (let t = 0; t < I.length; t += 3) ((Pn.getY(I[t]) + Pn.getY(I[t + 1]) + Pn.getY(I[t + 2])) / 3 >= cut ? ib : ia).push(I[t], I[t + 1], I[t + 2]);
    if (ib.length) { const bA = new THREE.SkinnedMesh(compact(geo, ia), bd.material), hd = new THREE.SkinnedMesh(compact(geo, ib), bd.material); bA.name = 'Rider_Body'; hd.name = 'Rider_Head';
    bd.parent.add(bA, hd); bd.removeFromParent(); bA.bind(bd.skeleton, bd.bindMatrix); hd.bind(bd.skeleton, bd.bindMatrix); }
  }
  scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; o.material.envMapIntensity = 1.15; if (touchMode && o.material.metalness > 0.5) o.material.metalness = 0.5; } });
  for (const n of ['Rider_Body', 'Rider_Head']) { const o = scene.getObjectByName(n); if (o) o.castShadow = false; }      // (the body under the harness: its shadow is the harness's; one skinned shadow pass fewer)
  // the seated frames: markers are placed relative to these, so they sit where the old code-built frames sat
  posePose(P, P.bones, { couch: 0, raised: 0, stand: 0 }); scene.updateMatrixWorld(true);
  P.seated = {};
  for (const n of ['Spine', 'Spine2', 'Head', 'Hips', 'ShieldSocket', 'LeftHand', 'RightHand', 'LanceSocket']) P.seated[n] = { q: bones[n].getWorldQuaternion(new THREE.Quaternion()), p: bones[n].getWorldPosition(new THREE.Vector3()) };
  // where the lance grip sits (LanceSocket) in the lance frame (Spine2's frame turned to the rider's), in each pose
  const fq = P.seated.Spine2.q.clone().invert(); P.grips = {};
  for (const [nm, w] of [['seated', { couch: 0, raised: 0, stand: 0 }], ['couch', { couch: 1, raised: 0, stand: 0 }], ['raised', { couch: 0, raised: 1, stand: 0 }]]) {
    posePose(P, P.bones, w); scene.updateMatrixWorld(true);
    const s2 = bones.Spine2; _m.compose(s2.getWorldPosition(_v), s2.getWorldQuaternion(_q).multiply(fq), _v2.set(1, 1, 1)).invert();
    P.grips[nm] = bones.LanceSocket.getWorldPosition(new THREE.Vector3()).applyMatrix4(_m);
  }
  posePose(P, P.bones, { couch: 0, raised: 0, stand: 0 }); scene.updateMatrixWorld(true);
  return P;
}

/** Set every animated bone to the blend of the clips: Seated, toward LanceRaised by raised, toward Couch by couch, toward Stand by stand. */
export function posePose(P, bones, w) {
  const S = P.poses.Seated.Hips; if (S && S.position && bones.Hips) bones.Hips.position.fromArray(S.position);
  for (const a of P.anim) {
    const b = bones[a.name]; if (!b) continue;
    b.quaternion.copy(a.s);
    if (!a.moves) continue;
    if (w.raised > 0) b.quaternion.slerp(a.r, w.raised);
    if (w.couch > 0) b.quaternion.slerp(a.c, w.couch);
    if (w.stand > 0) b.quaternion.slerp(a.st, w.stand);
  }
}

// ------------------------------------------------------------------------------------------------ painting
const tintCache = new Map();
/** colour = albedo * ((1 - k) + k * paint / 0.79) where the mask says paint (R = first colour, G = second). Done once per colour pair and size. */
function tintTexture(src, mask, c1, c2, key) {
  const id = key + '|' + c1 + '|' + c2 + '|' + src.image.width; if (tintCache.has(id)) return tintCache.get(id);
  const w = src.image.width, h = src.image.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(mask, 0, 0, w, h); const M = g.getImageData(0, 0, w, h).data;
  g.drawImage(src.image, 0, 0, w, h); const I = g.getImageData(0, 0, w, h), A = I.data, a = new THREE.Color(c1), b = new THREE.Color(c2 || c1);
  const ca = [a.r, a.g, a.b].map(v => Math.pow(v, 1 / 2.2)), cb = [b.r, b.g, b.b].map(v => Math.pow(v, 1 / 2.2));      // multiply in display space, as a painter would see it
  for (let i = 0; i < A.length; i += 4) {
    const r = M[i] / 255, gg = M[i + 1] / 255, k = r + gg; if (k < 0.004) continue;
    for (let c = 0; c < 3; c++) A[i + c] = Math.min(255, A[i + c] * ((1 - Math.min(k, 1)) + (r * ca[c] + gg * cb[c]) / 0.79));
  }
  g.putImageData(I, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = Math.min(4, GFX.aniso || 4);
  tintCache.set(id, t); return t;
}

/** Where the arms sit on each harness's cloth, in the figure's own bind pose (metres): left edge, top, width, and the panel's height and the arms' share of it in widths. */
const R_ARMS = { mail: { x: -0.225, top: 1.47, w: 0.45, span: 2.25, arms: 1.38 }, bascinet: { x: -0.225, top: 1.46, w: 0.45, span: 1.38, arms: 1.38 } };
const maskTex = new Map();
/**
 * The knight's arms on his surcoat or jupon, breast and back. The cloth is already dyed in the field's tincture (tintTexture, with all the folds of the scan in it);
 * here the arms are laid over it from the front in the bind pose (the vertex shader's `position`), where the mask says cloth, as that dye's colour swapped for the arms' own.
 * On the back they are turned round so they still read true; round the sides the cloth keeps the plain field.
 */
function armsOnCloth(m, mask, arms, B) {
  let mt = maskTex.get(mask); if (!mt) { mt = new THREE.Texture(mask); mt.flipY = false; mt.needsUpdate = true; maskTex.set(mask, mt); }
  const at = trapperTexture(arms, GFX.halfTex ? 256 : 512, B.span, B.arms); at.wrapS = THREE.ClampToEdgeWrapping; at.anisotropy = Math.min(4, GFX.aniso || 4);
  const c1 = new THREE.Color(arms.c1);
  m.customProgramCacheKey = () => 'armsOnCloth';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uArms = { value: at }; sh.uniforms.uArmsMask = { value: mt }; sh.uniforms.uArmsC1 = { value: c1 };
    sh.uniforms.uArmsBox = { value: new THREE.Vector4(B.x, B.top, 1 / B.w, 1 / (B.span * B.w)) };
    sh.vertexShader = 'uniform vec4 uArmsBox; varying vec3 vArmsP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vArmsP = vec3((position.x - uArmsBox.x) * uArmsBox.z, 1.0 - (uArmsBox.y - position.y) * uArmsBox.w, normal.z);`);
    sh.fragmentShader = 'uniform sampler2D uArms; uniform sampler2D uArmsMask; uniform vec3 uArmsC1; varying vec3 vArmsP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q = vArmsP.xy; if (vArmsP.z < 0.0) q.x = 1.0 - q.x;
        float k = texture2D(uArmsMask, vMapUv).r * smoothstep(0.12, 0.4, abs(vArmsP.z)) * step(0.0, q.x) * step(q.x, 1.0);
        vec3 ac = texture2D(uArms, clamp(q, 0.003, 0.997)).rgb;
        float shade = (diffuseColor.r + diffuseColor.g + diffuseColor.b) / max(uArmsC1.r + uArmsC1.g + uArmsC1.b, 0.02);      // the scan's folds and wear, as light and dark only: the arms keep their own hue
        diffuseColor.rgb = mix(diffuseColor.rgb, min(ac * shade, vec3(1.0)), k); }`);
  };
  m.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ the body of one rider
/** Two-bone IK: bring the wrist of chain A (upper arm) -> F (forearm) -> H (hand) to `tgt` (world) and the hand to world rotation `hq`. The elbow keeps the side it was on. */
const _s = new THREE.Vector3(), _el = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _e2 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();
function rotateWorld(b, dq) {
  b.getWorldQuaternion(_q3).premultiply(dq); b.parent.getWorldQuaternion(_q2); b.quaternion.copy(_q2.invert().multiply(_q3)); b.updateMatrix();
}
export function solveArm(A, F, H, tgt, hq) {
  A.getWorldPosition(_s); F.getWorldPosition(_el); H.getWorldPosition(_w);
  const l1 = _s.distanceTo(_el), l2 = _el.distanceTo(_w);
  _u.subVectors(tgt, _s); let d = _u.length(); if (d < 1e-6) return false; _u.divideScalar(d);
  const reach = d <= (l1 + l2) * 0.9995; d = clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  _p.subVectors(_el, _s); _p.addScaledVector(_u, -_p.dot(_u)); if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0); else _p.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  _e2.copy(_s).addScaledVector(_u, a).addScaledVector(_p, h); _w2.copy(_s).addScaledVector(_u, d);
  _d1.subVectors(_el, _s).normalize(); _d2.subVectors(_e2, _s).normalize(); rotateWorld(A, _q.setFromUnitVectors(_d1, _d2));
  F.getWorldPosition(_el); H.getWorldPosition(_w);
  _d1.subVectors(_w, _el).normalize(); _d2.subVectors(_w2, _e2).normalize(); rotateWorld(F, _q.setFromUnitVectors(_d1, _d2));
  if (hq) { H.parent.getWorldQuaternion(_q2); H.quaternion.copy(_q2.invert().multiply(hq)); H.updateMatrix(); }
  return reach;
}


// ------------------------------------------------------------------------------------------------ riding: the body gives to the saddle
// Stages of the chain, one bone each. Channels: 0 vertical (m), 1 pitch (rad), 2 sideways (m), 3 roll (rad), 4 yaw (rad).
const RIDE_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'], NS = 6, NC = 5;
/** The state of one rider's give: followers (position / velocity per stage and channel), the saddle's signal, the results the pose and the legs read. No allocations after this. */
export function newRide() {
  return { init: false, k: 1, sig: new Float64Array(NC), syn: new Float64Array(3), z: new Float64Array(NS * NC), v: new Float64Array(NS * NC), rel: new Float64Array(NS * NC),
    surge: 0, surgeV: 0, surgeRel: 0, mean: 0, meanV: 0, dev: 0, tipY: 0, tipYV: 0, tipX: 0, tipXV: 0, shY: 0, shYV: 0, shX: 0, shXV: 0, sh: new Float64Array(4),
    legF: 0, legSw: 0, legSide: 0, wobX: 0, wobY: 0 };
}
/** damped follower: z'' = w^2 (in - z) - 2 zeta w z'; semi-implicit Euler (h small enough that w h < 1) */
function follow(r, key, inp, w, zt, h) { const kv = key + 'V'; r[kv] += (w * w * (inp - r[key]) - 2 * zt * w * r[kv]) * h; r[key] += r[kv] * h; }
/**
 * One step of the ride. R.ride.sig holds the saddle's vertical (m), pitch (rad), sideways (m), roll and yaw (rad); speed is the ground speed (m/s); fade 0..1 takes the ride away
 * (he has come off). Everything is relative to the saddle: a steady saddle gives zero. Called from Jouster.update.
 */
export function rideStep(R, dt, speed, fade) {
  const D = PHYS.ride, r = R.ride, z = r.z, v = r.v, rel = r.rel, sg = r.sig, on = D.on * fade, N3 = 3 * NC;
  r.k = on;
  if (!r.init) {      // start in equilibrium with the saddle: no transient at the first frame
    for (let s = 0; s < NS; s++) for (let c = 0; c < NC; c++) { z[s * NC + c] = sg[c]; v[s * NC + c] = 0; }
    r.surge = speed; r.mean = sg[0]; r.tipY = z[N3] + 0.45 * z[N3 + 1]; r.tipX = z[N3 + 2]; r.shY = z[N3]; r.shX = z[N3 + 2]; r.init = true;
  }
  if (dt > 0) {
    dt = Math.min(dt, 0.05); const n = Math.ceil(dt / 0.007), h = dt / n;
    for (let k = 0; k < n; k++) {
      for (let c = 0; c < NC; c++) for (let s = 0; s < NS; s++) {
        const i = s * NC + c, w = D.chain[s][0], zt = D.chain[s][1];
        v[i] += (w * w * ((s ? z[i - NC] : sg[c]) - z[i]) - 2 * zt * w * v[i]) * h; z[i] += v[i] * h;
      }
      follow(r, 'surge', speed, D.surgeW, D.surgeZ, h); follow(r, 'mean', sg[0], 2.5, 1, h);
      // the lance (a heavy beam held out in front) and the shield arm follow the chest (stage 3); the hand is about half a metre in front of the chest's axis, so its pitch counts
      follow(r, 'tipY', z[N3] + 0.45 * z[N3 + 1], D.tipW, D.tipZ, h); follow(r, 'tipX', z[N3 + 2], D.tipW, D.tipZ, h);
      follow(r, 'shY', z[N3], D.shW, D.shZ, h); follow(r, 'shX', z[N3 + 2], D.shW, D.shZ, h);
    }
  }
  for (let s = 0; s < NS; s++) for (let c = 0; c < NC; c++) { const i = s * NC + c; rel[i] = (z[i] - (s ? z[i - NC] : sg[c])) * on; }
  r.dev = (sg[0] - r.mean) * on;      // how far the saddle is from its mean height now: what the spine takes up
  r.surgeRel = D.surgeMax * Math.tanh((r.surge - speed) * D.surgeK / D.surgeMax) * on;      // positive while the horse slows (the trunk goes forward), negative while it picks up
  // legs: the pelvis's give opens and closes the hips; the saddle's pitch swings the shins; the sway swings them sideways in the irons
  r.legF = D.legF * (rel[NC] + rel[0]) * 0.5; r.legSw = D.legSwing * (rel[1] + rel[NC + 1]) * 0.5; r.legSide = D.legSide * (rel[2] + rel[NC + 2]);
  // the lance tip lags the hand: a turn about the grip; the shield shakes on its arm
  const L = Math.max(1, R.reach || 2.8), dy = clamp(r.tipY - z[N3] - 0.45 * z[N3 + 1], -0.12, 0.12), dx = clamp(r.tipX - z[N3 + 2], -0.12, 0.12);
  r.wobX = -dy * D.tipY / L * on; r.wobY = dx * D.tipX / L * on;
  const sy = clamp(r.shY - z[N3], -0.05, 0.05), sx = clamp(r.shX - z[N3 + 2], -0.05, 0.05);
  r.sh[0] = sx * D.shK * on; r.sh[1] = sy * D.shK * on; r.sh[2] = -sy * D.shK * 3 * on; r.sh[3] = sx * D.shK * 3 * on;
}

/** The ride's results as a flat array (for the replay snapshot) and back: a replay steps the riders with dt = 0, so it reads what was recorded instead of integrating the chain. */
export function rideSave(r) { return [r.k, r.dev, r.surgeRel, r.legF, r.legSw, r.legSide, r.wobX, r.wobY, r.sh[0], r.sh[1], r.sh[2], r.sh[3], ...r.rel]; }
export function rideLoad(r, a) {
  r.k = a[0]; r.dev = a[1]; r.surgeRel = a[2]; r.legF = a[3]; r.legSw = a[4]; r.legSide = a[5]; r.wobX = a[6]; r.wobY = a[7]; r.sh[0] = a[8]; r.sh[1] = a[9]; r.sh[2] = a[10]; r.sh[3] = a[11];
  for (let i = 0; i < r.rel.length; i++) r.rel[i] = a[12 + i]; r.init = false;
}

const _ra = new THREE.Euler();
/** Turn the ride state into bone motion (called from poseRig after the clips and the puppet: additive on a freshly posed skeleton, so safe to repeat) and into the lance's wobble. */
function rideApply(R) {
  const D = PHYS.ride, r = R.ride, rel = r.rel, B = R.bones, k = (1 - R.w.stand) * (r.k ? 1 : 0);
  R.lanceWob.rotation.set(r.wobX * k, r.wobY * k, 0); B.Spine.position.y = R.spineY0;
  if (k < 0.001) return;
  // pelvis: gives a little under the saddle (position) and turns a little
  { const h = B.Hips; h.position.y += rel[0] * D.hipY * k; h.position.x += (rel[2] * D.hipX + r.syn[0] * r.k) * k;      // (the horse's own sway is not in the clip: the pelvis takes it here)
    _q.setFromEuler(_ra.set(rel[1] * 0.5 * k, (rel[4] + r.syn[2] * r.k) * k, (rel[3] * 0.5 + r.syn[1] * r.k) * k, 'YXZ')); h.quaternion.premultiply(_q);
    B.Spine.position.y = R.spineY0 - r.dev * D.absorb * k; }      // the trunk sinks into the pelvis as the saddle rises and stands up as it falls
  // the trunk: each stage's lag in pitch, in vertical and sideways give bends its bone; the three spine bones share the surge jolt, the neck takes a little back
  for (let s = 1; s < NS; s++) {
    const i = s * NC, head = s === NS - 1 ? 1 : 0;
    let px = rel[i + 1] * (D.spineP + head * D.headP) - rel[i] * (D.spineY + head * D.headY);
    if (s === 1) px += r.surgeRel * 0.25; else if (s === 2) px += r.surgeRel * 0.3; else if (s === 3) px += r.surgeRel * 0.45; else if (s === 4) px -= r.surgeRel * 0.25;
    const pz = rel[i + 3] * D.spineX + rel[i + 2] * D.spineR, py = rel[i + 4];
    _q.setFromEuler(_ra.set(px * k, py * k, pz * k, 'YXZ')); B[RIDE_BONES[s]].quaternion.premultiply(_q);
  }
}

const SPINE_W = [['Spine', 0.28], ['Spine1', 0.34], ['Spine2', 0.38]];

/**
 * Builds the rider on jouster J: clones the figure, hangs the marker frames on its bones and fills in J.rider, J.torso, J.helm, J.shield, J.lance...
 * Returns the controller that poses it every frame (see Jouster.update).
 */
export function buildRigRider(J, figure) {
  const P = figure, arms = J.arms, root = cloneSkinned(P.scene), bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const R = { P, root, bones, hipsY: P.hipsY, w: { couch: 0, raised: 0, stand: 0 }, ikOn: true };
  J.rider.add(root); root.position.y = -P.hipsY;
  // paint: the doublet / body cloth takes the first colour (its mask is per harness); the surcoat or plate cover of the mail and bascinet sets takes it too
  const meshes = {}; root.traverse(o => { if (o.isSkinnedMesh) meshes[o.name] = o; });
  const hid = P.id, bm = RIG.masks.get(hid + '_body'), body = meshes.Rider_Body, done = new Map();
  const paint = (o, mask, c2) => { if (!done.has(o.material)) { const m = o.material.clone(); m.map = tintTexture(o.material.map, mask, arms.c1, c2 || arms.c1, o.material.name || hid); done.set(o.material, m); } o.material = done.get(o.material); };
  if (body && bm) { paint(body, bm); if (meshes.Rider_Head) meshes.Rider_Head.material = body.material; }
  if (FABRIC[hid] && RIG.masks.get(FABRIC[hid])) root.traverse(o => { if (o.isMesh && o.material.name.startsWith(FABRIC[hid])) paint(o, RIG.masks.get(FABRIC[hid]), arms.c2); });
  if (FABRIC[hid] && RIG.masks.get(FABRIC[hid]) && R_ARMS[hid]) { const seen = new Set(); root.traverse(o => { if (o.isMesh && o.material.name.startsWith(FABRIC[hid]) && !seen.has(o.material)) { seen.add(o.material); armsOnCloth(o.material, RIG.masks.get(FABRIC[hid]), arms, R_ARMS[hid]); } }); }
  R.upper = meshes.Rider_HarnessUpper || null; R.headMesh = meshes.Rider_Head || null;
  // any helm on any harness: the helm file carries the same skeleton, so its mesh is re-bound to this rider's bones by name
  { const hp = helmFor(J.armourDef.helm);
    if (hp) { const hc = cloneSkinned(hp); let hm = null; hc.traverse(o => { if (o.isSkinnedMesh && !hm) hm = o; });
      if (hm) { const home = (body || R.upper).parent; hm.removeFromParent(); home.add(hm); hm.bind(new THREE.Skeleton(hm.skeleton.bones.map(b => bones[b.name]), hm.skeleton.boneInverses), hm.bindMatrix); hm.frustumCulled = false; R.helmMesh = hm; R.helmBone = J.armourDef.helm === 'frogmouth' ? 'Spine2' : 'Head'; } } }
  // markers, in the frames of the old code-built groups (scaled by KS: the old numbers apply as they were)
  const place = (name, bone, wpos, scale) => {      // a child of `bone` that sits at world point wpos (seated pose) with the rider's orientation, so its axes are +x left, +y up, +z forward
    const o = new THREE.Group(); o.name = name; bone.add(o);
    const sp = P.seated[bone.name]; o.position.copy(wpos).sub(sp.p).applyQuaternion(sp.q.clone().invert()); o.quaternion.copy(sp.q).invert(); if (scale) o.scale.setScalar(scale);
    return o;
  };
  const spine = P.seated.Spine;
  J.torso = R.torsoM = place('torso', bones.Spine2, spine.p, KS);
  _m.compose(spine.p, new THREE.Quaternion(), new THREE.Vector3(KS, KS, KS));
  const helmW = new THREE.Vector3(0, 0.57, 0).applyMatrix4(_m);      // the helm pivot, 0.57 above the waist in the old frame
  J.helm = R.helmM = place('helm', bones.Head, helmW, KS);
  R.lanceFrame = place('lanceFrame', bones.Spine2, P.seated.Spine2.p, 0);      // unscaled: the lance keeps its true length
  J.shield = R.shieldM = new THREE.Group(); J.shield.name = 'shield'; bones.ShieldSocket.add(J.shield);
  J.hand = new THREE.Object3D(); J.hand.position.set(0, 0.05, 0.02); bones.LeftHand.add(J.hand);      // the bridle hand: the reins run to it
  J.eyeY = 0.2 * KS;      // the stechhelm's eye slit (0.2 above the pivot in the old frame)
  J.torsoD = new THREE.Object3D(); J.helmD = new THREE.Object3D(); J.shieldD = new THREE.Object3D();      // the puppet's drivers: the old code writes its numbers here
  J.shieldRest = { y: 0.29, z: 0.2, rx: -0.08, rz: 0.06 };
  // the targe (heraldry on its second UV set: J.shieldMat.map is the canvas the damage marks are drawn on)
  const tg = RIG.targe.clone(true);
  for (const n of ['shield_face', 'shield_back']) { const o = tg.getObjectByName(n); o.position.set(0, 0, 0); J.shield.add(o); }
  { const f = J.shield.getObjectByName('shield_face'), t = J.shieldMat.map.clone(); t.channel = 1; t.flipY = false; t.needsUpdate = true;
    const m = f.material.clone(); m.map = t; m.color.set(0xffffff); f.material = m; J.shTex = t; J.shFaceRig = f; }
  // the lance, along +Z from the grip, its two paints from the arms
  const LP = lanceFor(lanceIdOf(arms.lanceScale ?? 1)), lid = Object.keys(LANCE_FILES).find(k => RIG.lances.get(k) === LP) || 'standard';
  const la = LP.scene.clone(true), lg = new THREE.Group(); J.lance = lg; R.lanceFrame.add(lg);
  { let mat = null; la.traverse(o => { if (o.isMesh && !mat) mat = o.material; });
    const lm = RIG.masks.get(LANCE_FILES[lid]), m2 = mat.clone(); if (lm) m2.map = tintTexture(mat.map, lm, arms.c1, arms.c2, 'lance' + lid); la.traverse(o => { if (o.isMesh) o.material = m2; }); R.lanceMat = m2; }
  const wob = R.lanceWob = new THREE.Group(); wob.name = 'lanceWob'; lg.add(wob);      // the lance's own wobble (rideStep), turned about the grip: visual, the hit chain reads lg
  for (const n of ['lance_rear', 'lance_fore', 'lance_vamplate', 'lance_grapper']) { const o = la.getObjectByName(n); o.position.set(0, 0, 0); wob.add(o); }
  lg.getObjectByName('coronel').visible = true; lg.getObjectByName('wartip').visible = false;
  J.lanceFore = lg.getObjectByName('lance_fore'); J.lanceRear = lg.getObjectByName('lance_rear');
  // the lance keeps its modelled length: the game's reach for this rider (hit chain, break points, tip) is that length, grip to the end of the coronel (coronel: light 2.47, standard 2.80, heavy 2.94 m; with the war tip 2.43, 2.88, 2.89 m)
  R.reach = LP.reach; R.reachWar = LP.reachWar; R.lanceId = lid;
  R.gripNow = new THREE.Vector3();
  R.ride = newRide(); R.spineY0 = bones.Spine.position.y;
  return R;
}

/** Everything per frame: blend the poses, add the puppet's reactions on the spine and neck, set the lance grip. (The arms follow in R.arms, after the lance is aimed.) */
export function poseRig(J, R) {
  const P = R.P, w = R.w, T = J.torsoD.rotation, H = J.helmD.rotation;
  w.raised = smooth(J.raise); w.couch = smooth(J.lanceLower); w.stand = clamp(J.limp || 0, 0, 1);
  posePose(P, R.bones, w);
  // the puppet's torso lean (the Seated pose already carries 0.05), turn and roll are shared over the three spine bones
  const ax = T.x - 0.05, ay = T.y, az = T.z;
  for (const [n, k] of SPINE_W) { const b = R.bones[n]; _q.setFromEuler(_e.set(ax * k, ay * k, az * k, 'YXZ')); b.quaternion.premultiply(_q); }
  // the helm's nod, turn and tilt (relative to the torso) go on the neck: the helm rides the Head bone, so the whole head follows
  { const b = R.bones.Neck; _q.setFromEuler(_e.set(H.x, H.y, H.z, 'YXZ')); b.quaternion.premultiply(_q); }
  rideApply(R);      // the give to the saddle: hips, spine, neck and head lag (additive on the above), the lance's wobble
  // where the fist is: the grip, blended with the pose, in the lance frame (+ the jolt of the arm)
  legsRig(J, R);      // the legs wrap the horse's barrel (additive on the clips; see fitLegs)
  const g = P.grips; R.gripNow.copy(g.seated).lerp(g.raised, w.raised).lerp(g.couch, w.couch);
  J.lance.position.copy(R.gripNow); J.lance.position.z += J.jZ * KS;
  R.root.updateMatrixWorld(true);
}

// ------------------------------------------------------------------------------------------------ the legs outside the cloth
const _rq = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _lq3 = new THREE.Quaternion(), _lz = new THREE.Vector3(0, 0, 1), _lx = new THREE.Vector3(1, 0, 0), _lup = new THREE.Quaternion(), _llg = new THREE.Quaternion(), _ldq = new THREE.Quaternion();
/** The additive rotation of a leg bone, in the rider's frame: out by `ab` about the forward axis, after the hip has been flexed by `fl` (the thigh raised) about the lateral one. */
const legQ = (out, ab, fl) => out.setFromAxisAngle(_lz, ab).multiply(_lq3.setFromAxisAngle(_lx, -fl));
/** The same turn in the world: the rider's world rotation rq, then the turn about the rider's own axes. */
const worldTurn = (out, rq, q) => out.copy(rq).multiply(q).multiply(_lq3.copy(rq).invert());
/**
 * The splay of the legs, added on top of the clips: R.legs = { a: [left, right], g: [left, right], f: [left, right] } (radians; positive a = the thigh swung out about the rider's
 * forward axis, f = the thigh raised a little, g = the angle the lower leg hangs at, out from the vertical). The knee turns by whatever gets the shin to g, and the foot keeps the orientation the
 * pose gave it, so it stays in the iron. fitLegs measures the angles per horse so that the thighs and shins stand outside the caparison.
 * The splay fades as the rider goes limp (the Stand pose).
 */
export function legsRig(J, R) {
  const L = R.legs, k = 1 - R.w.stand, rd = R.ride; if (!L || k < 0.001) return;
  R.root.updateMatrixWorld(true); J.rider.getWorldQuaternion(_rq);
  const rq = _rq, up_ = _lup, lg_ = _llg, dq = _ldq;
  for (let i = 0; i < 2; i++) {
    const side = i ? 'Right' : 'Left', s = i ? -1 : 1, B = R.bones, up = B[side + 'UpLeg'], kn = B[side + 'Leg'], ft = B[side + 'Foot'];
    if (!up || !kn || !ft || (!L.a[i] && !L.g[i] && !L.f[i])) continue;
    legQ(up_, s * L.a[i] * k, (L.f[i] + rd.legF) * k); legQ(lg_, (s * L.g[i] + rd.legSide) * k, rd.legSw * k);
    rotateWorld(up, worldTurn(dq, rq, up_)); up.updateMatrixWorld(true);
    rotateWorld(kn, worldTurn(dq, rq, lg_.multiply(_lq2.copy(up_).invert()))); kn.updateMatrixWorld(true);      // (lg_ is spent after this)
    legQ(lg_, (s * L.g[i] + rd.legSide) * k, rd.legSw * k);
    rotateWorld(ft, worldTurn(dq, rq, lg_.invert())); ft.updateMatrixWorld(true);
  }
}

/**
 * Find the leg pose that puts the thighs and shins outside the cloth. `cloth.dist(x, y, z)` is the signed distance from the cloth's surface (+ = outside; `cloth.soft` the same plus the depth the cloth can be dented there), in the rider's frame at rest
 * (x across, y up, z forward; the cloth is symmetric, so the sign of x does not matter). The rider is posed seated when this is called. Each leg is sampled as capsules (thigh and
 * poleyn, shin and greave, foot); `lift` are the vertical offsets between rider and cloth that posting and the gait cause. The cloth may be dented inward by up to `dent` under the leg
 * (see Jouster._dentCloth); `cloth.soft` is the distance counting that depth. The cheapest pose is taken (the hip's swing a, the thigh raised by f, weighted), then the smallest shin angle
 * g (within `gSpan`) that clears the shin and the foot. Returns { a, g, f, c: the clearance reached (undented), caps: the capsules at rest, for the dent }.
 */
export function fitLegs(J, R, cloth, o = {}) {
  const clr = o.clr ?? 0.01, lift = o.lift ?? [-0.03, 0, 0.025], rT = o.rT ?? [[0.3, 0.094], [0.45, 0.092], [0.6, 0.088], [0.75, 0.09], [0.9, 0.092], [1, 0.098]], rS = o.rS ?? 0.06, rF = o.rF ?? 0.05, gSpan = o.gSpan ?? [0.02, 0.36], fMax = o.fMax ?? 0.3, fW = o.fW ?? 2;
  R.legs = null; posePose(R.P, R.bones, { couch: 0, raised: 0, stand: 0 }); R.root.updateMatrixWorld(true); J.rider.updateWorldMatrix(true, false);
  const at = (n) => J.rider.worldToLocal(R.bones[n].getWorldPosition(new THREE.Vector3()));
  const res = { a: [0, 0], g: [0, 0], f: [0, 0], c: [0, 0], caps: [] }, qa = new THREE.Quaternion();
  const need = clr, dist = cloth.soft || cloth.dist;      // (the cloth that can be dented counts for the dent's depth: see Jouster._dentCloth)
  for (let i = 0; i < 2; i++) {
    const side = i ? 'Right' : 'Left', H = at(side + 'UpLeg'), K = at(side + 'Leg'), A = at(side + 'Foot'), T = at(side + 'ToeBase'), s = Math.sign(K.x) || 1;
    const d1 = K.clone().sub(H), d2 = A.clone().sub(K), d3 = T.clone().sub(A);
    const rotT = (v, a, f) => v.clone().applyQuaternion(legQ(qa, s * a, f)), rotS = (v, g) => v.clone().applyQuaternion(legQ(qa, s * g, 0));
    const clearance = (pts, dy) => { let m = 1e9; for (const [p, r] of pts) m = Math.min(m, dist(p.x, p.y + dy, p.z) - r); return m; };
    const thigh = (a, f) => { const e = rotT(d1, a, f), pts = []; for (const [t, r] of rT) pts.push([H.clone().addScaledVector(e, t), r]); return { pts, K: H.clone().add(e) }; };
    const shin = (a, f, g) => { const kk = thigh(a, f).K, e = rotS(d2, g), pts = []; for (const t of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) pts.push([kk.clone().addScaledVector(e, t), rS]);
      const an = kk.clone().add(e); pts.push([an.clone().addScaledVector(d3, 0.5), rF], [an.clone().add(d3), rF]); return { pts, K: kk, A: an }; };
    let best = null;
    for (let f = 0; f <= fMax + 1e-6; f += 0.02) for (let a = 0; a < 1.4; a += 0.02) {
      const cost = a * a + (fW * f) * (fW * f); if (best && cost >= best.cost) continue;
      const t = thigh(a, f); if (lift.every(dy => clearance(t.pts, dy) >= need)) best = { a, f, cost };
    }
    if (!best) best = { a: 1.4, f: fMax, cost: 9 };
    const { a, f } = best; let g = gSpan[0]; for (; g < gSpan[1]; g += 0.01) { if (lift.every(dy => clearance(shin(a, f, g).pts, dy) >= need)) break; }
    res.a[i] = a; res.g[i] = g; res.f[i] = f; res.c[i] = Math.min(...lift.map(dy => Math.min(clearance(thigh(a, f).pts, dy), clearance(shin(a, f, g).pts, dy))));
    const th = thigh(a, f), sh = shin(a, f, g);
    const cut = (A_, B_, r) => res.caps.push({ a: A_.clone(), b: B_.clone(), r });
    for (let k = 0; k < rT.length - 1; k++) cut(H.clone().lerp(th.K, rT[k][0]), H.clone().lerp(th.K, rT[k + 1][0]), (rT[k][1] + rT[k + 1][1]) / 2);
    cut(th.K, sh.A, rS); cut(sh.A, sh.A.clone().add(d3), rF);
  }
  R.legs = { a: res.a, g: res.g, f: res.f };
  return res;
}

const _gm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _sq = new THREE.Quaternion(), _t = new THREE.Vector3(), _lw = new THREE.Vector3(), _ld = new THREE.Vector3();
/** Right fist on the lance grip, left hand with the shield. Call after the lance is aimed (its world matrix is final). */
const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion();
/** The throw (a simple swing, owner 27 Nov): while the hand is empty after the stump is thrown, the lance arm swings out and down to the side away from the tilt in 0.4 s and hangs there. */
function throwArm(J, R) {
  const k0 = Math.min(1, Math.max(0, (performance.now() / 1000 - J.throwAt) / 0.4)), k = k0 * k0 * (3 - 2 * k0), B = R.bones;
  J.root.updateWorldMatrix(true, true);
  B.RightHand.getWorldPosition(_v); B.RightArm.getWorldPosition(_t); B.RightHand.getWorldQuaternion(_hq);
  J.root.getWorldQuaternion(_tq); _tv.set(-0.45, -0.75, 0.1).applyQuaternion(_tq).add(_t);      // out to the rider's right (away from the tilt) and down
  _v.lerp(_tv, k); solveArm(B.RightArm, B.RightForeArm, B.RightHand, _v, _hq); R.root.updateMatrixWorld(true);
}
export function armsRig(J, R, replay) {
  if (!replay && J.throwAt != null && !J.lance.visible && !J.unhorsed && R.w.stand <= 0.5) { throwArm(J, R); return; }
  if (J.unhorsed && !replay) return; if ((replay ? J.snapUnhorsed : J.unhorsed) || !J.lance.visible || R.w.stand > 0.5) return;
  const B = R.bones, ls = B.LanceSocket;
  // the hand turns so the socket's long axis (+Y) lies along the shaft (+Z of the lance); the roll about the shaft stays as the pose has it
  J.lance.updateWorldMatrix(true, false); J.lance.getWorldPosition(_lw); _ld.set(0, 0, 1).transformDirection(J.lance.matrixWorld);
  B.RightHand.getWorldQuaternion(_hq); ls.getWorldQuaternion(_sq);
  _v.set(0, 1, 0).applyQuaternion(_sq); _hq.premultiply(_q.setFromUnitVectors(_v, _ld));
  _t.copy(ls.position).applyQuaternion(_hq).multiplyScalar(B.RightHand.getWorldScale(_v3).x);      // the grip's offset from the wrist, in the new hand rotation
  _t.negate().add(_lw);
  solveArm(B.RightArm, B.RightForeArm, B.RightHand, _t, _hq);
  // left: the shield moves (guard, the blow driving it in) by its local offset from the socket; the hand moves with it
  const sh = J.shield, o = B.ShieldSocket;
  if (sh.position.lengthSq() > 1e-6 || Math.abs(sh.quaternion.w) < 0.99999) {
    o.updateWorldMatrix(true, false); _gm.copy(o.matrixWorld);
    B.LeftHand.getWorldPosition(_v); B.LeftHand.getWorldQuaternion(_hq);
    _m.copy(_gm).invert(); _t.copy(_v).applyMatrix4(_m);      // the wrist in the socket's frame
    _t.applyQuaternion(sh.quaternion).add(sh.position).applyMatrix4(_gm);
    o.getWorldQuaternion(_sq); _q.copy(_sq).multiply(sh.quaternion).multiply(_q2.copy(_sq).invert()); _hq.premultiply(_q);
    solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, _t, _hq);
  }
  R.root.updateMatrixWorld(true);
}
