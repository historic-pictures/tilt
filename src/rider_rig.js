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
import { GFX } from './gfx.js';
import { touchMode } from './touch.js';
import { expect, progress, done } from './loadmeter.js';

const DIR = new URL('../assets/models/armour/', import.meta.url).href;
/** The rig is 1.73 m; the game's old code-built rider (the frame every number in PHYS.hitboxes is in) was 1 / KS times that. */
export const KS = 0.8394;
const QP = new URLSearchParams(location.search).get('rider');
/** ?rider=rig forces the rig, ?rider=old the code-built rider; otherwise the rig on high and medium, the code-built rider on low (phones stay light). */
export const riderWanted = () => (QP ? QP !== 'old' : GFX.tier !== 'low');
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
  const t = GFX.tier === 'high' ? '' : '_512'; RIG.tier = t; RIG.res = t ? 512 : 1024;
  const A = [...new Set((want.armour && want.armour.length ? want.armour : ['stechzeug']).filter(a => HARNESSES.includes(a)))];
  const H = [...new Set((want.helm || []).filter(h => HELMS.includes(h)))], L = [...new Set((want.lance && want.lance.length ? want.lance : ['standard']).filter(l => LANCE_FILES[l]))];
  RIG.busy++; RIG.settled = false; expect('rider' + RIG.busy, 'bg', (A.length + H.length) * (t ? 0.9e6 : 1.6e6) + 0.6e6);
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
    const get = (pose) => { const e = P.poses[pose] && P.poses[pose][n]; return e && e.quaternion ? new THREE.Quaternion().fromArray(e.quaternion) : null; };
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
function posePose(P, bones, w) {
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
  for (const n of ['lance_rear', 'lance_fore', 'lance_vamplate', 'lance_grapper']) { const o = la.getObjectByName(n); o.position.set(0, 0, 0); lg.add(o); }
  lg.getObjectByName('coronel').visible = true; lg.getObjectByName('wartip').visible = false;
  J.lanceFore = lg.getObjectByName('lance_fore'); J.lanceRear = lg.getObjectByName('lance_rear');
  // the lance keeps its modelled length: the game's reach for this rider (hit chain, break points, tip) is that length, grip to the end of the coronel (coronel: light 2.47, standard 2.80, heavy 2.94 m; with the war tip 2.43, 2.88, 2.89 m)
  R.reach = LP.reach; R.reachWar = LP.reachWar; R.lanceId = lid;
  R.gripNow = new THREE.Vector3();
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
  // where the fist is: the grip, blended with the pose, in the lance frame (+ the jolt of the arm)
  const g = P.grips; R.gripNow.copy(g.seated).lerp(g.raised, w.raised).lerp(g.couch, w.couch);
  J.lance.position.copy(R.gripNow); J.lance.position.z += J.jZ * KS;
  R.root.updateMatrixWorld(true);
}

const _gm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _sq = new THREE.Quaternion(), _t = new THREE.Vector3(), _lw = new THREE.Vector3(), _ld = new THREE.Vector3();
/** Right fist on the lance grip, left hand with the shield. Call after the lance is aimed (its world matrix is final). */
export function armsRig(J, R, replay) {
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
