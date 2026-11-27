// body_types.js - the knight's body: sex, height, build, and the face under the helm. COSMETIC ONLY.
//
// The skeleton of the rigged rider (src/rider_rig.js) is never touched: every hit volume, the lance, the targe, the camera and the leg fit are what they
// are for the standard 1.73 m man. The shape is applied where the skin is drawn:
//   * build and sex (static): each rider gets private copies of his skeletons' boneInverses, post-multiplied by a per-bone scale about the bone's rest
//     head, in the rest (T-pose) axes: x across, y up, z forward. Harness plates are skinned to the same bones, so they grow and shrink with the limb.
//   * height (every frame): after the usual bone matrix, a uniform scale about the seat. The hands stay where the game put them (lance grip, shield,
//     reins): each forearm is re-aimed from the scaled elbow to the true wrist. The plume and the stirrup irons, which hang on bones, are moved the same way.
//   * the head: a modelled face with hair and beard (src/people_heads.js builds it) on the Head bone, shown when the helm is off.
// The code-built rider of the low tier keeps its one body and only takes the skin tone.
//
// body = { sex: 'm' | 'f', h: metres 1.60..1.90, build: 'skinny' | 'medium' | 'heavy', face: 0.., skin: 0.., hair: 0.. }   (see cleanBody)
import * as THREE from 'three';
import { makeHead, FACES, SKINS, HAIRS } from './people_heads.js';

export { FACES, SKINS, HAIRS };
export const BASE_H = 1.73, H_MIN = 1.6, H_MAX = 1.9;
export const BUILDS = ['skinny', 'medium', 'heavy'], SEXES = ['m', 'f'];
export const DEFAULT_BODY = { sex: 'm', h: BASE_H, build: 'medium', face: 0, skin: 1, hair: 1 };

/** Anything (a saved profile, a message from the other player) -> a valid body. */
export function cleanBody(b) {
  b = b && typeof b === 'object' ? b : {};
  const sex = 'm', int      // (a knight is always a man, whatever an old profile or another player's message says; the crowd keeps its women)
    = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
  const h = BASE_H;      // height is not a choice for a knight (owner's rule): every knight is the average man, whatever an old profile or another player's message says
  const faces = FACES.filter(f => f.sex === sex), face = int(b.face, FACES.length, -1);
  return { sex, h, build: BUILDS.includes(b.build) ? b.build : 'medium', face: face >= 0 && FACES[face].sex === sex ? face : FACES.indexOf(faces[0]), skin: DEFAULT_BODY.skin, hair: int(b.hair, HAIRS.length, DEFAULT_BODY.hair) };
}
/** A body for a knight who has none of his own (the AI's knights): always the same for the same id. */
export function bodyFor(id) {
  let s = 2166136261; for (const ch of String(id || 'x')) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); }
  const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  r(); r();
  const men = FACES.map((f, i) => (f.sex === 'm' ? i : -1)).filter(i => i >= 0), u = r();
  return cleanBody({ sex: 'm', h: BASE_H, build: u < 0.2 ? 'skinny' : u < 0.72 ? 'medium' : 'heavy', face: men[(r() * men.length) | 0], skin: (r() * r() * SKINS.length) | 0, hair: (r() * HAIRS.length) | 0 });
}

// ------------------------------------------------------------------------------------------------ the shape tables
// girth per bone group, [across, forward] (the bone's own length is never scaled here: lengths are the height's business)
const GIRTH = {
  skinny: { Hips: [0.94, 0.9], Spine: [0.92, 0.86], Spine1: [0.92, 0.86], Spine2: [0.95, 0.91], Neck: [0.9, 0.9], UpLeg: [0.9, 0.9], Leg: [0.92, 0.92], Arm: [0.88, 0.88], ForeArm: [0.92, 0.92] },
  medium: {},
  heavy: { Hips: [1.12, 1.16], Spine: [1.15, 1.3], Spine1: [1.14, 1.27], Spine2: [1.08, 1.12], Neck: [1.16, 1.14], UpLeg: [1.15, 1.13], Leg: [1.08, 1.08], Arm: [1.14, 1.14], ForeArm: [1.07, 1.07] },
};
const FEMALE = { Hips: [1.02, 1.0], Spine: [0.9, 0.93], Spine1: [0.9, 0.93], Spine2: [0.93, 0.96], Neck: [0.86, 0.86], UpLeg: [0.98, 0.98], Leg: [0.93, 0.93], Arm: [0.88, 0.88], ForeArm: [0.9, 0.9] };
const FEMALE_HEAD = 0.955, FEMALE_SHOULDER = 0.02;      // her head (and so her helm) a little smaller; each shoulder this much nearer the spine (m)
const HEAD_LIFT = 0.06, HEAD_FWD = 0.005;      // the middle of the skull from the Head bone's head (the bone starts at the level of the nose), in the rider's frame
const BELLY_BACK = 0.07;      // the torso thickens about a line this far behind the spine, so a heavy man's belly grows forward more than his back does

const groupOf = (name) => {
  if (GIRTH.heavy[name]) return [name, 'y'];
  const m = /^(Left|Right)(UpLeg|Leg|Arm|ForeArm)$/.exec(name); return m ? [m[2], m[2] === 'UpLeg' || m[2] === 'Leg' ? 'y' : 'x'] : null;
};
/** [sx, sy, sz] of a bone in the rest axes for this body, or null. `along` is the axis the bone lies on in the T-pose (not scaled). */
function girthOf(name, body) {
  const g = groupOf(name); if (name === 'Head') return body.sex === 'f' ? [FEMALE_HEAD, FEMALE_HEAD, FEMALE_HEAD] : null;
  if (!g) return null;
  const a = GIRTH[body.build][g[0]] || [1, 1], f = body.sex === 'f' ? FEMALE[g[0]] || [1, 1] : [1, 1], w = a[0] * f[0], d = a[1] * f[1];
  if (Math.abs(w - 1) < 1e-4 && Math.abs(d - 1) < 1e-4) return null;
  return g[1] === 'y' ? [w, 1, d] : [1, w, d];      // a limb along x (the arms in the T-pose): its girth is y and z
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _el = new THREE.Vector3(), _wr = new THREE.Vector3(), _ev = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _off = new THREE.Vector3();
const ARM_CHAIN = /^(Left|Right)(Arm|ForeArm|Hand)/, HAND = /^(Left|Right)Hand|^LanceSocket/;

/**
 * Give the rider of jouster J the body `body`. Call after the rider is built (Jouster._buildRigRider does). Safe to call again with another body.
 * Returns the controller kept in J.rig.body (update() once a frame after the arms are solved), or null for the code-built rider.
 */
export function applyBody(J, body) {
  body = cleanBody(body || DEFAULT_BODY); J.bodyType = body;
  const R = J.rig;
  if (!R) { if (J.bareHead) J.bareHead.traverse(o => { if (o.isMesh && o.material.color && o.material.roughness === 0.8 && !o.material.map) o.material.color.set(SKINS[body.skin].hex); }); return null; }      // (low tier: the skin tone only)
  const B = R.body || (R.body = { skels: [], follow: [], head: null });
  B.body = body; B.s = body.h / BASE_H; B.inset = body.sex === 'f' ? FEMALE_SHOULDER : 0;
  // ---- the skeletons: private inverses with the girth baked in, and an update that adds the height
  const meshes = []; R.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) {
    const sk = m.skeleton; let e = B.skels.find(x => x.sk === sk);
    if (!e) { e = { sk, base: sk.boneInverses, kind: sk.bones.map(b => (HAND.test(b.name) ? 2 : /ForeArm$/.test(b.name) ? 1 : ARM_CHAIN.test(b.name) ? 3 : 0)), side: sk.bones.map(b => (b.name.startsWith('Left') ? 1 : b.name.startsWith('Right') ? -1 : 0)) }; B.skels.push(e); sk.update = () => skelUpdate(J, B, e); }
    sk.boneInverses = e.base.map((inv, i) => {
      const g = girthOf(sk.bones[i].name, body); if (!g) return inv;
      _m.copy(inv).invert(); _v.setFromMatrixPosition(_m);      // the bone's rest head, in the mesh's bind space
      if (sk.bones[i].name !== 'Head' && !sk.bones[i].name.includes('Leg') && !sk.bones[i].name.includes('Arm')) _v.z -= BELLY_BACK * (g[2] > 1 ? 1 : 0.4);
      _m.makeScale(g[0], g[1], g[2]).setPosition(_v.x * (1 - g[0]), _v.y * (1 - g[1]), _v.z * (1 - g[2]));
      return inv.clone().multiply(_m);
    });
  }
  // ---- the rigid things that hang on bones and must go with the drawn body
  if (!B.follow.length) {
    const add = (o, scale) => { if (o) B.follow.push({ o, scale, base: o.matrix.clone().compose(o.position, o.quaternion, o.scale), pos: o.position.clone() }); };
    add(J.plume, true); R.root.traverse(o => { if (/^stirrup/.test(o.name)) add(o, false); });
  }
  // ---- the head under the helm
  if (B.head) { B.head.removeFromParent(); B.head = null; }
  const hd = makeHead(body);
  if (hd && R.bones.Head) {
    // hung on the Head bone where the old head sits: the bone's head is the base of the skull (the neck goes down into the collar)
    B.head = hd; R.bones.Head.add(hd); hd.visible = false;
    const P = R.P.seated.Head; hd.quaternion.copy(P.q).invert();      // upright and facing forward in the seated pose
    hd.position.set(0, HEAD_LIFT, HEAD_FWD).applyQuaternion(hd.quaternion);
    add_follow(B, hd, true);
  }
  B.update = () => bodyUpdate(J, B);
  B.update();
  return B;
}
function add_follow(B, o, scale) { B.follow = B.follow.filter(f => f.o.parent); o.updateMatrix(); B.follow.push({ o, scale, base: o.matrix.clone(), pos: o.position.clone() }); }

/** The seat: the point the height scales about (the rider's own origin: his hips at rest). */
const seat = (J) => J.rider.getWorldPosition(_c);

/** Skeleton.update with the body's height: bone matrix = V(bone) x bone.matrixWorld x inverse, V = the scale about the seat (see the header). */
function skelUpdate(J, B, e) {
  const sk = e.sk, bones = sk.bones, inv = sk.boneInverses, out = sk.boneMatrices, s = B.s;
  const plain = Math.abs(s - 1) < 1e-4 && !B.inset;
  if (!plain) { seat(J); }
  // V for the two forearms: from the drawn elbow to the true wrist
  let fa = null;
  if (!plain) {
    fa = e.fa || (e.fa = { L: new THREE.Matrix4(), R: new THREE.Matrix4(), offL: new THREE.Vector3(), offR: new THREE.Vector3() });
    const R = J.rig.bones;
    for (const sd of ['Left', 'Right']) {
      const F = R[sd + 'ForeArm'], H = R[sd + 'Hand'], S2 = R.Spine2, key = sd[0];
      _off.set(sd === 'Left' ? -B.inset : B.inset, 0, 0); if (B.inset) _off.transformDirection(S2.matrixWorld).multiplyScalar(B.inset);
      fa['off' + key].copy(_off);
      _el.setFromMatrixPosition(F.matrixWorld); _wr.setFromMatrixPosition(H.matrixWorld);
      _ev.copy(_el).sub(_c).multiplyScalar(s).add(_c).add(_off);                    // the elbow as drawn
      _d1.subVectors(_wr, _el); _d2.subVectors(_wr, _ev); const l1 = _d1.length(), l2 = _d2.length();
      _q.setFromUnitVectors(_d1.divideScalar(l1 || 1), _d2.divideScalar(l2 || 1)); const k = l1 > 1e-5 ? l2 / l1 : 1;
      // p -> elbowDrawn + k * q * (p - elbow)
      _m.compose(_ev, _q, _v.set(k, k, k)); _m2.makeTranslation(-_el.x, -_el.y, -_el.z); fa[key].multiplyMatrices(_m, _m2);
    }
  }
  for (let i = 0, n = bones.length; i < n; i++) {
    const b = bones[i]; if (!b) { _m.identity().toArray(out, i * 16); continue; }
    _m.multiplyMatrices(b.matrixWorld, inv[i]);
    if (!plain) {
      const kind = e.kind[i], sd = e.side[i];
      if (kind === 1) _m.premultiply(sd > 0 ? fa.L : fa.R);
      else if (kind !== 2) {      // the scale about the seat (the upper arms also go with the narrower shoulder)
        const t = _m.elements; for (let k = 0; k < 16; k++) if ((k & 3) !== 3) t[k] *= s;
        const o = kind === 3 ? (sd > 0 ? fa.offL : fa.offR) : null;
        t[12] += _c.x * (1 - s) + (o ? o.x : 0); t[13] += _c.y * (1 - s) + (o ? o.y : 0); t[14] += _c.z * (1 - s) + (o ? o.z : 0);
      }
    }
    _m.toArray(out, i * 16);
  }
  if (sk.boneTexture) sk.boneTexture.needsUpdate = true;
}

/** Once a frame, after the pose is final: the plume, the irons and the head go where the drawn body is; the head shows when the helm is off. */
function bodyUpdate(J, B) {
  const s = B.s, R = J.rig;
  if (B.head) {
    const hv = J.helm.visible, bare = hv && (!!J.helmOff || !!J.celHelmOff);      // (celHelmOff: a celebration that waves the helm leaves the head bare too)
    B.head.visible = bare; if (R.headMesh && bare) R.headMesh.visible = false;      // (the old faceless head stays under the helm)
  }
  if (Math.abs(s - 1) < 1e-4) { if (B.moved) { for (const f of B.follow) { f.o.matrixAutoUpdate = true; f.o.position.copy(f.pos); f.o.updateMatrix(); } B.moved = false; } return; }
  seat(J); B.moved = true;
  for (const f of B.follow) {
    const o = f.o, p = o.parent; if (!p) continue;
    p.updateWorldMatrix(true, false);
    if (f.scale) {      // local = parentWorld^-1 x V x parentWorld x base
      _m.copy(p.matrixWorld); const t = _m.elements; for (let k = 0; k < 16; k++) if ((k & 3) !== 3) t[k] *= s;
      t[12] += _c.x * (1 - s); t[13] += _c.y * (1 - s); t[14] += _c.z * (1 - s);
      _m2.copy(p.matrixWorld).invert().multiply(_m).multiply(f.base);
      o.matrixAutoUpdate = false; o.matrix.copy(_m2); o.matrix.decompose(o.position, o.quaternion, o.scale);
    } else {
      _v.copy(f.pos).applyMatrix4(p.matrixWorld).sub(_c).multiplyScalar(s).add(_c); o.position.copy(p.worldToLocal(_v)); o.updateMatrix();
    }
    o.updateMatrixWorld(true);
  }
}
