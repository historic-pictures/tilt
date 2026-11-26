// The aftermath of an unhorsing, all of it visual and local (the simulation never waits on it; online it only plays beside the match).
//  1. The get-up. When the ragdoll (src/ragdoll.js) lies still, the rider's seventeen points are taken over by authored joint curves: a pose is a few numbers
//     (pelvis, trunk turn, spine bend, head, and for each limb a target and a pole), keys of them are blended in time, and a two-bone IK puts the hands and
//     feet on the sand (the targets of a planted limb stay where they are while the trunk moves, so nothing slides). The result is a point set the rig's own
//     ragdoll pose code (Jouster._ragPose) turns into bone rotations, cross-faded from where the ragdoll left him. Heavy harness: 4-5 s, slow, effortful.
//     He rolls to his front and gets up (rise), or sits up dazed with a hand to his helm first (dazed), or does not get up at all (down): then the surgeon
//     runs out, the squires kneel, the helm comes off and he is carried away.
//  2. Two squires in his colours (the mocap run_cycle on a jointed mannequin): one helps him up or attends him; the other catches the loose horse by the
//     reins and leads it back; whichever is free picks up the dropped lance.
//  3. Events (window 'aftermath:down' / 'aftermath:up' / 'aftermath:carried', detail { side, kind, ... }) so the crowd, the herald and the commentary can hook in.
// Plain data in, poses out: main.js calls update() once a frame and holding() while it wants the camera to stay on the man.
import * as THREE from 'three';
import { RI } from './ragdoll.js';

const D = Math.PI / 180, V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const ease = (k) => 0.5 * k + 0.5 * k * k * (3 - 2 * k);
const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);
const qx = (a) => new Q().setFromAxisAngle(AX, a), qy = (a) => new Q().setFromAxisAngle(AY, a), qz = (a) => new Q().setFromAxisAngle(AZ, a);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const NP = 17;
// radius of each point on the sand (RAG_POINTS order): no point is posed below it
const PR = [0.15, 0.17, 0.14, 0.09, 0.06, 0.05, 0.09, 0.06, 0.05, 0.09, 0.075, 0.06, 0.05, 0.09, 0.075, 0.06, 0.05];

// ---------------------------------------------------------------------------------------------- the body
/** A rotation whose x is `left`, y the nearest to `up` that is square to it, z the front (left x up). */
function basis(left, up) {
  const l = left.clone().normalize(), u = up.clone().normalize(), f = new V3().crossVectors(l, u);
  if (f.lengthSq() < 1e-8) f.set(0, 0, 1);
  f.normalize(); const u2 = new V3().crossVectors(f, l).normalize();
  return new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(l, u2, f));
}
const pt = (P, i, o = new V3()) => o.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
const setPt = (P, i, v) => { P[3 * i] = v.x; P[3 * i + 1] = v.y; P[3 * i + 2] = v.z; };
const I = RI;
/** The rider's own sizes, measured from the points at the exit (a seated man, upright): spine, hips and shoulders in their frames, the limb lengths. */
function measure(P0) {
  const g = (n) => pt(P0, I[n]), pel = g('pelvis'), ch = g('chest');
  const Qp = basis(g('hipL').sub(g('hipR')), ch.clone().sub(pel)), Qc = basis(g('shL').sub(g('shR')), ch.clone().sub(pel));
  const ip = Qp.clone().invert(), ic = Qc.clone().invert();
  const hipM = (n) => g(n).sub(pel).applyQuaternion(ip), shM = (n) => g(n).sub(ch).applyQuaternion(ic);
  return {
    L: pel.distanceTo(ch), hip: [hipM('hipL'), hipM('hipR')], sh: [shM('shL'), shM('shR')], head: g('head').sub(ch).applyQuaternion(ic),
    uarm: g('shL').distanceTo(g('elL')), farm: g('elL').distanceTo(g('haL')), thigh: g('hipL').distanceTo(g('knL')), shin: g('knL').distanceTo(g('anL')), foot: g('anL').distanceTo(g('toL')),
  };
}

/** A pose as numbers: pelvis, the pelvis block's turn q, the spine's bend (forward sb, sideways sl) and the chest's twist tw, the head's turn hq; per arm and leg a target and a pole. */
class Pm {
  constructor() {
    this.pel = new V3(); this.q = new Q(); this.sb = 0; this.sl = 0; this.tw = 0; this.hq = new Q(); this.ext = 0;
    this.h = [{ t: new V3(), p: new V3() }, { t: new V3(), p: new V3() }]; this.f = [{ t: new V3(), p: new V3(), toe: new V3() }, { t: new V3(), p: new V3(), toe: new V3() }];
  }
  copy(o) {
    this.pel.copy(o.pel); this.q.copy(o.q); this.sb = o.sb; this.sl = o.sl; this.tw = o.tw; this.hq.copy(o.hq); this.ext = o.ext;
    for (let i = 0; i < 2; i++) { this.h[i].t.copy(o.h[i].t); this.h[i].p.copy(o.h[i].p); this.f[i].t.copy(o.f[i].t); this.f[i].p.copy(o.f[i].p); this.f[i].toe.copy(o.f[i].toe); }
    return this;
  }
  /** this = a + (b - a) k */
  mix(a, b, k) {
    this.pel.lerpVectors(a.pel, b.pel, k); this.q.slerpQuaternions(a.q, b.q, k); this.sb = lerp(a.sb, b.sb, k); this.sl = lerp(a.sl, b.sl, k); this.tw = lerp(a.tw, b.tw, k);
    this.hq.slerpQuaternions(a.hq, b.hq, k); this.ext = lerp(a.ext, b.ext, k);
    for (let i = 0; i < 2; i++) {
      this.h[i].t.lerpVectors(a.h[i].t, b.h[i].t, k); this.h[i].p.lerpVectors(a.h[i].p, b.h[i].p, k);
      this.f[i].t.lerpVectors(a.f[i].t, b.f[i].t, k); this.f[i].p.lerpVectors(a.f[i].p, b.f[i].p, k); this.f[i].toe.lerpVectors(a.f[i].toe, b.f[i].toe, k);
    }
    return this;
  }
}
const _d = new V3(), _pp = new V3();
/** Two bones from s to a target t (clamped to the reach) bending toward the pole: the middle joint into mid, the end into end. */
function ik(s, t, pole, a, b, mid, end) {
  _d.subVectors(t, s); const dist = _d.length(), dd = clamp(dist, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  if (dist < 1e-6) _d.set(0, -1, 0); else _d.multiplyScalar(1 / dist);
  end.copy(s).addScaledVector(_d, dd);
  const x = (a * a - b * b + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, a * a - x * x));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-6) { _pp.set(0, 0, 1).addScaledVector(_d, -_d.z); if (_pp.lengthSq() < 1e-6) _pp.set(1, 0, 0); }
  _pp.normalize(); mid.copy(s).addScaledVector(_d, x).addScaledVector(_pp, h);
}
const _a = new V3(), _b = new V3(), _c = new V3(), _e = new V3(), _qa = new Q(), _qb = new Q();
/** The seventeen points of a pose into out. aux.Qc: the chest's frame. extPos / extHand: a hand that reaches for another's. */
function solve(pm, d, out, aux, extPos, extHand) {
  const pel = pm.pel, Qp = pm.q;
  setPt(out, I.pelvis, pel);
  for (let i = 0; i < 2; i++) setPt(out, I[i ? 'hipR' : 'hipL'], _a.copy(d.hip[i]).applyQuaternion(Qp).add(pel));
  const Rs = _qa.copy(qx(pm.sb)).multiply(qz(pm.sl));
  const chest = _b.set(0, d.L, 0).applyQuaternion(Rs).applyQuaternion(Qp).add(pel); setPt(out, I.chest, chest);
  const Qc = _qb.copy(Qp).multiply(Rs).multiply(qy(pm.tw)); if (aux) aux.Qc.copy(Qc);
  for (let i = 0; i < 2; i++) setPt(out, I[i ? 'shR' : 'shL'], _a.copy(d.sh[i]).applyQuaternion(Qc).add(chest));
  setPt(out, I.head, _a.copy(d.head).applyQuaternion(pm.hq).applyQuaternion(Qc).add(chest));
  for (let i = 0; i < 2; i++) {
    const S = pt(out, I[i ? 'shR' : 'shL'], _a), T = _c.copy(pm.h[i].t); if (extPos && extHand === i && pm.ext > 0) T.lerp(extPos, pm.ext);
    ik(S, T, pm.h[i].p, d.uarm, d.farm, _b, _e); setPt(out, I[i ? 'elR' : 'elL'], _b); setPt(out, I[i ? 'haR' : 'haL'], _e);
    const H = pt(out, I[i ? 'hipR' : 'hipL'], _a); ik(H, pm.f[i].t, pm.f[i].p, d.thigh, d.shin, _b, _e);
    setPt(out, I[i ? 'knR' : 'knL'], _b); setPt(out, I[i ? 'anR' : 'anL'], _e); setPt(out, I[i ? 'toR' : 'toL'], _a.copy(pm.f[i].toe).normalize().multiplyScalar(d.foot).add(_e));
  }
  for (let i = 0; i < NP; i++) if (out[3 * i + 1] < PR[i]) out[3 * i + 1] = PR[i];
}
/** The pose the points are in (the ragdoll's last): the numbers that reproduce them. */
function fromPoints(P, d) {
  const pm = new Pm(), g = (n) => pt(P, I[n]), pel = g('pelvis'), ch = g('chest');
  const Qp = basis(g('hipL').sub(g('hipR')), ch.clone().sub(pel)); pm.pel.copy(pel); pm.q.copy(Qp);
  const v = ch.clone().sub(pel).divideScalar(d.L || 1).applyQuaternion(Qp.clone().invert());
  pm.sl = -Math.asin(clamp(v.x, -1, 1)); pm.sb = Math.atan2(v.z, v.y);
  const Qc = basis(g('shL').sub(g('shR')), ch.clone().sub(pel)), Rs = qx(pm.sb).multiply(qz(pm.sl));
  const rel = Qp.clone().multiply(Rs).invert().multiply(Qc); pm.tw = 2 * Math.atan2(rel.y, rel.w); if (pm.tw > Math.PI) pm.tw -= 2 * Math.PI; if (pm.tw < -Math.PI) pm.tw += 2 * Math.PI;
  const hv = g('head').sub(ch).applyQuaternion(Qc.clone().invert());
  pm.hq.setFromUnitVectors(d.head.clone().normalize(), hv.normalize());
  for (let i = 0; i < 2; i++) {
    const s = i ? 'R' : 'L', S = g('sh' + s), E = g('el' + s), H = g('ha' + s), HP = g('hip' + s), K = g('kn' + s), A = g('an' + s), T = g('to' + s);
    pm.h[i].t.copy(H); pm.h[i].p.copy(E).sub(S.clone().add(H).multiplyScalar(0.5)); if (pm.h[i].p.lengthSq() < 1e-6) pm.h[i].p.set(0, -1, 0);
    pm.f[i].t.copy(A); pm.f[i].p.copy(K).sub(HP.clone().add(A).multiplyScalar(0.5)); if (pm.f[i].p.lengthSq() < 1e-6) pm.f[i].p.set(0, 1, 0); pm.f[i].toe.copy(T).sub(A).normalize();
  }
  return pm;
}

// ---------------------------------------------------------------------------------------------- the keys
/**
 * c: { d (sizes), O (ground point under the pelvis where he lies), Qg (heading) }. A key in the ground frame (x his left, y up, z the way he faces):
 *  pitch  the trunk's lean from upright (88 = on his front, -88 on his back), hipY the height of the hips, pel [x, z], sb spine bend (+ stoops), nod head (+ bows),
 *  f[2]   { t: [x,y,z] ankle, p: [..] knee pole, toe: [..] }, h[2]  { g: [x,y,z] | rel: [x,y,z] from the shoulder in the chest frame | knee: i, thigh: i | head: [..], p, o }.
 */
function makeKey(c, o) {
  const d = c.d, pm = new Pm(), W = (a) => new V3(a[0], a[1], a[2]).applyQuaternion(c.Qg).add(c.O), Wd = (a) => new V3(a[0], a[1], a[2]).applyQuaternion(c.Qg);
  pm.q.copy(c.Qg).multiply(qx((o.pitch || 0) * D)); if (o.roll) pm.q.multiply(qy(o.roll * D));
  pm.sb = (o.sb || 0) * D; pm.sl = (o.sl || 0) * D; pm.tw = (o.tw || 0) * D; pm.hq.copy(qx((o.nod || 0) * D)).multiply(qy((o.hy || 0) * D)); pm.ext = o.ext || 0;
  const hy = (_a.copy(d.hip[0]).applyQuaternion(pm.q).y + _b.copy(d.hip[1]).applyQuaternion(pm.q).y) / 2;
  pm.pel.copy(W([o.pel[0], 0, o.pel[1]])); pm.pel.y = o.hipY - hy;
  for (let i = 0; i < 2; i++) { const f = o.f[i]; pm.f[i].t.copy(W(f.t)); pm.f[i].p.copy(Wd(f.p || [0, 1, 0])); pm.f[i].toe.copy(Wd(f.toe || [0, 0, 1])).normalize(); }
  // the first pass puts the arms hanging, to know where the knees, thighs, shoulders and head are; then the hands' own targets
  const P = new Float32Array(3 * NP), aux = { Qc: new Q() };
  for (let i = 0; i < 2; i++) { pm.h[i].t.set(0, 0, 0); pm.h[i].p.set(0, -1, 0); }
  solve(pm, d, P, aux);
  for (let i = 0; i < 2; i++) {
    const hs = o.h[i], sh = pt(P, I[i ? 'shR' : 'shL']);
    if (hs.g) pm.h[i].t.copy(W(hs.g));
    else if (hs.rel) pm.h[i].t.copy(sh).add(_a.set(hs.rel[0], hs.rel[1], hs.rel[2]).applyQuaternion(aux.Qc));
    else if (hs.knee != null) pm.h[i].t.copy(pt(P, I[hs.knee ? 'knR' : 'knL'])).add(Wd(hs.o || [0, 0.08, 0]));
    else if (hs.thigh != null) pm.h[i].t.copy(pt(P, I[hs.thigh ? 'hipR' : 'hipL'])).lerp(pt(P, I[hs.thigh ? 'knR' : 'knL']), 0.6).add(Wd(hs.o || [0, 0.1, 0]));
    else if (hs.head) pm.h[i].t.copy(pt(P, I.head)).add(_a.set(hs.head[0], hs.head[1], hs.head[2]).applyQuaternion(aux.Qc));
    pm.h[i].p.copy(Wd(hs.p || [i ? -1 : 1, 0.2, -0.5]));
  }
  return pm;
}

/** The sequences of keys (time, key). Dimensions come from the man; the ground frame from where and how he lies. */
function sequence(kind, c, k0, o = {}) {
  const d = c.d, T = d.thigh, S = d.shin, U = d.uarm, F = d.farm, Lp = d.L, hw = Math.abs(d.sh[0].x) + 0.1, stand = 0.1 + 0.985 * (T + S);
  const hang = (i) => ({ rel: [(i ? -1 : 1) * 0.06, -(U + F) * 0.97, 0.05], p: [i ? -1 : 1, 0, -0.6] });
  const K = (t, a, ext) => ({ t, pm: makeKey(c, a), ext });
  const flat = (x, z) => ({ t: [x, 0.1, z], toe: [0, 0, 1], p: [0, 1, 0.3] });
  const keys = [{ t: 0, pm: k0 }];
  const ks = o.side || 0;      // which hand (0 left, 1 right) takes the squire's
  const front = [
    K(0, { pitch: 88, hipY: 0.2, pel: [0, 0], sb: -16, nod: -26,
      f: [{ t: [0.13, 0.1, -(T + S) * 0.96], toe: [0, 0, -1] }, { t: [-0.13, 0.1, -(T + S) * 0.96], toe: [0, 0, -1] }],
      h: [{ g: [hw + 0.04, 0.07, Lp + 0.04], p: [1, 1, -0.6] }, { g: [-hw - 0.04, 0.07, Lp + 0.04], p: [-1, 1, -0.6] }] }),      // 0 prone, pushing up on the hands
    K(0, { pitch: 86, hipY: 0.5, pel: [0, -0.3], sb: -4, nod: 12,
      f: [{ t: [0.14, 0.1, -0.3 - S * 0.98], toe: [0, 0, -1], p: [0, -1, 0] }, { t: [-0.14, 0.1, -0.3 - S * 0.98], toe: [0, 0, -1], p: [0, -1, 0] }],
      h: [{ g: [hw - 0.02, 0.06, -0.3 + Lp * 0.98], p: [1, 0.3, -1] }, { g: [-hw + 0.02, 0.06, -0.3 + Lp * 0.98], p: [-1, 0.3, -1] }] }),      // 1 on hands and knees, the head hanging
    K(0, { pitch: 32, hipY: 0.62, pel: [0, 0.12], sb: 10, nod: 8,
      f: [{ t: [0.15, 0.1, -0.34], toe: [0, 0, -1], p: [0, -1, 0.3] }, { t: [-0.17, 0.1, 0.5], toe: [0, 0, 1], p: [0, 1, 0.6] }],
      h: [{ g: [hw + 0.12, 0.07, 0.36], p: [1, 0.5, -0.5] }, { knee: 1, o: [0, 0.07, 0], p: [-1, 0.3, -0.5] }] }),      // 2 up on one knee, a hand on the other knee
    K(0, { pitch: 42, hipY: 0.74, pel: [0, 0.2], sb: 12, nod: 4, ext: 1,
      f: [{ t: [0.16, 0.28, 0.0], toe: [0, -0.3, 1], p: [0, 1, 0.5] }, { t: [-0.16, 0.1, 0.42], toe: [0, 0, 1], p: [0, 1, 0.5] }],
      h: [{ thigh: 0, o: [0, 0.1, 0], p: [1, 0.4, -0.6] }, { thigh: 1, o: [0, 0.1, 0], p: [-1, 0.4, -0.6] }] }),      // 3 the rear foot comes up; hands to the thighs (or the squire's hand)
    K(0, { pitch: 22, hipY: 0.84, pel: [0, 0.18], sb: 12, nod: 4, ext: 1,
      f: [{ t: [0.17, 0.1, 0.08], toe: [0, 0, 1], p: [0, 1, 0.5] }, { t: [-0.17, 0.1, 0.34], toe: [0, 0, 1], p: [0, 1, 0.5] }],
      h: [{ thigh: 0, o: [0, 0.1, 0], p: [1, 0.4, -0.6] }, { thigh: 1, o: [0, 0.1, 0], p: [-1, 0.4, -0.6] }] }),      // 4 pushing up, both feet flat
    K(0, { pitch: 4, hipY: stand, pel: [0, 0.22], sb: 5, nod: -2,
      f: [{ t: [0.17, 0.1, 0.08], toe: [0, 0, 1], p: [0, 1, 0.5] }, { t: [-0.17, 0.1, 0.34], toe: [0, 0, 1], p: [0, 1, 0.5] }], h: [hang(0), hang(1)] }),      // 5 upright
  ];
  const sit = [
    K(0, { pitch: -8, hipY: 0.17, pel: [0, 0.05], sb: 20, nod: 34,
      f: [{ t: [0.2, 0.1, 0.62], toe: [0, 0, 1], p: [0.3, 1, 0.2] }, { t: [-0.2, 0.1, 0.62], toe: [0, 0, 1], p: [-0.3, 1, 0.2] }],
      h: [{ head: [0.24, -0.02, 0.1], p: [1, 0.6, 0.2] }, { g: [-0.32, 0.07, -0.3], p: [-1, 0.2, -0.5] }] }),      // sat up, a hand to the helm, the other behind him on the sand
    K(0, { pitch: -4, hipY: 0.17, pel: [0, 0.05], sb: 24, nod: 40,
      f: [{ t: [0.2, 0.1, 0.62], toe: [0, 0, 1], p: [0.3, 1, 0.2] }, { t: [-0.2, 0.1, 0.62], toe: [0, 0, 1], p: [-0.3, 1, 0.2] }],
      h: [{ head: [0.24, -0.02, 0.1], p: [1, 0.6, 0.2] }, { g: [-0.32, 0.07, -0.3], p: [-1, 0.2, -0.5] }] }),      // (swaying: the same, a little further forward)
  ];
  const heels = [
    K(0, { pitch: 5, hipY: 0.4, pel: [0, -0.3], sb: 12, nod: 30,
      f: [{ t: [0.13, 0.1, -0.3 - S * 0.98], toe: [0, 0, -1], p: [0, -1, 0.5] }, { t: [-0.13, 0.1, -0.3 - S * 0.98], toe: [0, 0, -1], p: [0, -1, 0.5] }],
      h: [{ head: [0.24, -0.02, 0.1], p: [1, 0.6, 0.2] }, { thigh: 1, o: [0, 0.1, 0], p: [-1, 0.4, -0.6] }] }),
  ];
  const stoop = (i) => ({ thigh: i, o: [0, 0.1, 0], p: [i ? -1 : 1, 0.4, -0.6] });
  if (kind === 'rise') {
    const t = o.t || [0.8, 1.7, 2.6, 3.1, 3.55, 4.1];
    front.forEach((k, i) => keys.push({ t: t[i], pm: k.pm }));
    return keys;
  }
  if (kind === 'dazed') {
    const mid = o.supine ? sit : heels;
    if (!o.supine) keys.push({ t: 0.9, pm: front[0].pm }, { t: 1.8, pm: front[1].pm }, { t: 2.9, pm: mid[0].pm }, { t: 4.0, pm: mid[0].pm });
    else keys.push({ t: 1.2, pm: sit[0].pm }, { t: 2.0, pm: sit[1].pm }, { t: 3.0, pm: sit[0].pm }, { t: 3.4, pm: sit[0].pm });
    const b = keys[keys.length - 1].t;
    keys.push({ t: b + 1.1, pm: front[2].pm }, { t: b + 1.7, pm: front[3].pm }, { t: b + 2.2, pm: front[4].pm }, { t: b + 2.9, pm: front[5].pm });
    return keys;
  }
  void stoop;
  return keys;
}

// ---------------------------------------------------------------------------------------------- the men (a jointed mannequin on the mocap's skeleton)
const OFFS = { Spine: [0, 0.08, 0], Spine1: [0, 0.12, 0], Spine2: [0, 0.12, 0], Neck: [0, 0.18, 0], Head: [0, 0.1, 0],
  LeftShoulder: [0.04, 0.14, 0], LeftArm: [0.14, 0, 0], LeftForeArm: [0.28, 0, 0], LeftHand: [0.25, 0, 0],
  RightShoulder: [-0.04, 0.14, 0], RightArm: [-0.14, 0, 0], RightForeArm: [-0.28, 0, 0], RightHand: [-0.25, 0, 0],
  LeftUpLeg: [0.09, -0.04, 0], LeftLeg: [0, -0.43, 0], LeftFoot: [0, -0.42, 0], RightUpLeg: [-0.09, -0.04, 0], RightLeg: [0, -0.43, 0], RightFoot: [0, -0.42, 0] };
const PAR = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg' };
const BONES = ['Hips', ...Object.keys(OFFS)];
const mats = new Map();
const mat = (c) => { const k = typeof c === 'number' ? c : new THREE.Color(c).getHex(); let m = mats.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: k }); mats.set(k, m); } return m; };
const SKIN = [0xf0c8a4, 0xe0ac84, 0xc68e63, 0xa8704a, 0xf4d6bb];
const gCyl = new Map();
const cyl = (len, r1, r2) => { const k = len.toFixed(3) + '/' + r1 + '/' + r2; let g = gCyl.get(k); if (!g) { g = new THREE.CylinderGeometry(r1, r2, len, 7); gCyl.set(k, g); } return g; };
const gSph = new THREE.SphereGeometry(1, 8, 6), gBox = new THREE.BoxGeometry(1, 1, 1);
const bit = (parent, g, c, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(g, mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
/** A segment from the bone's origin along `off`, radius r1 at the joint to r2 at the far end. */
function seg(bone, off, r1, r2, c) {
  const len = Math.hypot(off[0], off[1], off[2]), m = new THREE.Mesh(cyl(len, r2, r1), mat(c)); m.castShadow = true;
  m.position.set(off[0] / 2, off[1] / 2, off[2] / 2); m.quaternion.setFromUnitVectors(AY, new V3(-off[0], -off[1], -off[2]).normalize()); bone.add(m); return m;
}
const E = (x, y, z) => new Q().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
class Man {
  /** look: { c1, c2 (hose and tunic), skin, robe (a surgeon's gown), cap } */
  constructor(look) {
    this.root = new THREE.Group(); this.B = {}; this.cur = {}; this.tgt = {}; this.hipsY = 0.95; this.look = look; this.phase = Math.random(); this.rate = 1;
    const hips = this.B.Hips = new THREE.Group(); this.root.add(hips);
    for (const n of Object.keys(OFFS)) { const b = this.B[n] = new THREE.Group(); b.position.set(...OFFS[n]); this.B[PAR[n]].add(b); }
    for (const n of BONES) this.cur[n] = new Q();
    const c1 = look.c1, c2 = look.c2, skin = look.skin ?? SKIN[(Math.random() * SKIN.length) | 0], B = this.B;
    bit(hips, gBox, c1, 0, 0.02, 0, 0.3, 0.2, 0.19);
    bit(B.Spine1, gBox, look.robe || c1, 0, 0.06, 0, 0.31, 0.34, 0.19);
    bit(B.Spine2, gBox, look.robe || c1, 0, 0.1, 0, 0.36, 0.2, 0.21);
    bit(B.Neck, gSph, skin, 0, 0.0, 0, 0.055, 0.07, 0.055); bit(B.Head, gSph, skin, 0, 0.1, 0.01, 0.1, 0.115, 0.105);
    if (look.cap !== false) { bit(B.Head, gSph, look.cap || c2, 0, 0.13, 0, 0.108, 0.07, 0.108); }
    for (const s of ['Left', 'Right']) {
      const sg = s === 'Left' ? 1 : -1;
      seg(B[s + 'Arm'], [sg * 0.28, 0, 0], 0.05, 0.042, look.robe || c1); seg(B[s + 'ForeArm'], [sg * 0.25, 0, 0], 0.042, 0.036, skin); bit(B[s + 'Hand'], gSph, skin, sg * 0.04, 0, 0, 0.045, 0.04, 0.04);
      seg(B[s + 'UpLeg'], [0, -0.43, 0], 0.085, 0.065, look.robe ? look.robe : (s === 'Left' ? c1 : c2)); seg(B[s + 'Leg'], [0, -0.42, 0], 0.065, 0.05, look.robe ? 0x2a2420 : (s === 'Left' ? c1 : c2));
      bit(B[s + 'Foot'], gBox, 0x2a2420, 0, -0.03, 0.06, 0.1, 0.07, 0.24);
    }
    if (look.robe) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.7, 9), mat(look.robe)); sk.position.set(0, -0.3, 0); sk.castShadow = true; hips.add(sk); this.skirt = sk; }
    this.root.visible = false; this.hold = null;
  }
  /** Where a bone is in the world (into o). */
  at(name, o = new V3()) { this.B[name].getWorldPosition(o); return o; }
}
// ---- poses: directions of the segments in the body's frame (x left, y up, z forward); a leg or an arm = [upper, lower]
const n3 = (a) => new V3(a[0], a[1], a[2]).normalize();
const AXIS = { Left: new V3(1, 0, 0), Right: new V3(-1, 0, 0), leg: new V3(0, -1, 0) };
const POSE = {
  idle: { y: 0.95, lean: 0.03, aL: [[0.28, -1, 0.04], [0.2, -1, 0.35]], aR: [[-0.28, -1, 0.04], [-0.2, -1, 0.35]], lL: [[0.06, -1, 0], [0.03, -1, 0]], lR: [[-0.06, -1, 0], [-0.03, -1, 0]] },
  ready: { y: 0.95, lean: 0.1, aL: [[0.3, -0.9, 0.35], [0.2, -0.7, 0.8]], aR: [[-0.3, -0.9, 0.35], [-0.2, -0.7, 0.8]], lL: [[0.12, -1, 0.05], [0.05, -1, 0.03]], lR: [[-0.12, -1, 0.05], [-0.05, -1, 0.03]] },
  kneel: { y: 0.56, lean: 0.4, aL: [[0.25, -0.7, 0.6], [0.15, -0.5, 0.9]], aR: [[-0.25, -0.7, 0.6], [-0.15, -0.5, 0.9]], lL: [[0.1, -0.35, 1], [0.0, -1, 0.1]], lR: [[-0.08, -1, 0], [0, -0.05, -1]] },
  kneel2: { y: 0.5, lean: 0.5, aL: [[0.25, -0.8, 0.5], [0.15, -0.4, 0.9]], aR: [[-0.25, -0.8, 0.5], [-0.15, -0.4, 0.9]], lL: [[0.1, -1, 0.05], [0, -0.05, -1]], lR: [[-0.1, -1, 0.05], [0, -0.05, -1]] },
  crouch: { y: 0.62, lean: 0.75, aL: [[0.2, -0.8, 0.4], [0.15, -0.6, 0.8]], aR: [[-0.1, -0.5, 0.85], [-0.05, -0.8, 0.6]], lL: [[0.12, -0.8, 0.6], [0, -1, -0.2]], lR: [[-0.12, -0.8, 0.6], [0, -1, -0.2]] },
  carry: { y: 0.95, lean: 0.02, aL: [[0.2, -1, 0.3], [0.1, -0.5, 0.85]], aR: [[-0.2, -1, 0.3], [-0.1, -0.5, 0.85]], lL: [[0.06, -1, 0], [0.03, -1, 0]], lR: [[-0.06, -1, 0], [-0.03, -1, 0]] },
};
const _fq = new Q(), _fq2 = new Q(), _fv = new V3();
function limbQ(axis, dirU, dirF, outU, outF) {
  outU.setFromUnitVectors(axis, n3(dirU)); _fq.setFromUnitVectors(axis, n3(dirF)); outF.copy(outU).invert().multiply(_fq);
}
/** Set the target rotations of a man for a pose (a name or an object), with the mocap clip layered by the caller. */
function setPose(m, p, extra = {}) {
  if (typeof p === 'string') p = POSE[p];
  const T = m.tgt, id = new Q();
  for (const n of BONES) T[n] = id;
  m.hipsY = p.y; T.Spine1 = qx(p.lean * 0.6); T.Spine = qx(p.lean * 0.4); T.Spine2 = qx(p.lean * 0.1);
  if (p.head != null) T.Head = qx(p.head);
  for (const [s, a] of [['Left', p.aL], ['Right', p.aR]]) { const u = new Q(), f = new Q(); limbQ(AXIS[s], a[0], a[1], u, f); T[s + 'Arm'] = u; T[s + 'ForeArm'] = f; }
  for (const [s, l] of [['Left', p.lL], ['Right', p.lR]]) {
    const u = new Q(), f = new Q(); limbQ(AXIS.leg, l[0], l[1], u, f); T[s + 'UpLeg'] = u; T[s + 'Leg'] = f;
    // the foot flat in the body's frame: the inverse of the shin's total turn
    T[s + 'Foot'] = u.clone().multiply(f).invert().multiply(qx(p.lean * 0.0));
  }
  Object.assign(T, extra);
}
// ---- the mocap run cycle (assets/motion/yt/run_cycle.json: Mixamo-named local quaternions on a T-pose rest, 16 frames, 0.667 s, looped)
let RUN = null;
try { fetch('assets/motion/yt/run_cycle.json').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.bones) RUN = d; }).catch(() => {}); } catch (e) { /* no fetch */ }
const _rq = new Q(), _rq2 = new Q();
function runAt(name, ph, out) {      // ph: 0..1 over the loop
  const a = RUN.bones[name]; if (!a) return out.identity();
  const n = a.length, x = ((ph % 1) + 1) % 1 * n, i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
  _rq.set(a[i][0], a[i][1], a[i][2], a[i][3]); _rq2.set(a[j][0], a[j][1], a[j][2], a[j][3]); return out.copy(_rq).slerp(_rq2, f);
}
/** Apply the targets (blended by rate), the run or walk cycle when `gait` > 0 (amplitude k), then the hips' height. */
function animate(m, dt, gait, k = 1) {
  const t = m.tgt, r = 1 - Math.exp(-m.rate * dt);
  const run = gait > 0 && RUN;
  for (const n of BONES) {
    let tq = t[n] || _fq2.identity();
    if (run && n !== 'Hips') {
      runAt(n, m.phase, _fq); if (k < 1) _fq.slerp(_fq2.identity(), 1 - k);
      if (/Arm$|ForeArm$|Hand$|Shoulder$/.test(n) && m.arm) _fq.copy(tq);      // (an arm that holds something keeps its pose)
      tq = _fq;
    }
    if (n === 'Hips') { m.cur.Hips.copy(tq); m.B.Hips.quaternion.copy(m.cur.Hips); continue; }
    m.cur[n].slerp(tq, r); m.B[n].quaternion.copy(m.cur[n]);
  }
  if (run) { const ys = RUN.rootY_cm, i = Math.floor(((m.phase % 1) + 1) % 1 * ys.length) % ys.length; m.hipsY = damp(m.hipsY, ys[i] / 100 * 0.97, 14, dt); }
  m.B.Hips.position.y = m.hipsY;
}

// ---------------------------------------------------------------------------------------------- the squires' orders
const _w = new V3(), _w2 = new V3();
class Actor {
  constructor(m, x, z, name) { this.m = m; this.x = x; this.z = z; this.yaw = 0; this.q = []; this.name = name; this.v = 0; this.pose = 'idle'; this.gait = 0; this.k = 1; this.carry = null; this.t = 0; }
  /** A step: { run | walk: [x, z] or fn, v, stop } { face: [x, z] } { pose, dur } { until: fn, pose, max } { fn } */
  go(...steps) { this.q.push(...steps); return this; }
  get busy() { return this.q.length > 0; }
}
const tp = (a) => (typeof a === 'function' ? a() : a);
function stepActor(a, dt) {
  const m = a.m, s = a.q[0]; a.gait = 0; a.t += dt;
  if (!s) { setPose(m, a.pose); m.rate = 8; a.v = 0; return; }
  if (s.fn) { a.q.shift(); s.fn(a); return stepActor(a, 0); }
  if (s.run || s.walk) {
    const to = tp(s.run || s.walk), dx = to[0] - a.x, dz = to[1] - a.z, dist = Math.hypot(dx, dz), v = s.v || (s.run ? 3.6 : 1.6);
    if (dist <= (s.stop ?? 0.15) + 0.04) { a.q.shift(); s.done && s.done(a); return stepActor(a, 0); }
    const tg = Math.atan2(dx, dz); a.yaw += wrapA(tg - a.yaw) * Math.min(1, dt * 9);
    const st = Math.min(dist - (s.stop ?? 0), v * dt); a.x += dx / dist * st; a.z += dz / dist * st; a.v = v;
    a.gait = 1; a.k = s.run ? 1 : 0.55; m.phase += dt * (v / (s.run ? 2.7 : 2.0)) * (s.run ? 1.5 : 1.5); a.pose = s.carry ? 'carry' : 'idle'; m.arm = !!s.arms;
    setPose(m, a.pose); m.rate = 12; return;
  }
  m.arm = false; a.v = 0;
  if (s.face) { const to = tp(s.face); a.yaw += wrapA(Math.atan2(to[0] - a.x, to[1] - a.z) - a.yaw) * Math.min(1, dt * 7); }
  if (s.pose) { setPose(m, s.pose); m.rate = s.rate || 6; }
  s.t = (s.t || 0) + dt;
  if (s.fnEach) s.fnEach(a, dt, s.t);
  if (s.until ? (s.until(a) || s.t >= (s.max ?? 60)) : s.t >= (s.dur ?? 1)) { a.q.shift(); s.done && s.done(a); }
}
function place(a) { a.m.root.position.set(a.x, 0, a.z); a.m.root.rotation.y = a.yaw; a.m.root.visible = true; }


// ---------------------------------------------------------------------------------------------- the module
const _p1 = new V3(), _p2 = new V3(), _p3 = new V3(), _p4 = new V3();
/** Aim an arm of a mannequin at a world point (straight; the shoulder's parent frame is the chest). */
function aimArm(m, side, W, elbow = 0) {
  const arm = m.B[side + 'Arm'], sh = m.B[side + 'Shoulder']; arm.getWorldPosition(_p1);
  sh.getWorldQuaternion(_fq).invert(); _p2.subVectors(W, _p1).applyQuaternion(_fq).normalize();
  const u = new Q().setFromUnitVectors(AXIS[side], _p2); m.tgt[side + 'Arm'] = u; m.tgt[side + 'ForeArm'] = elbow ? qy((side === 'Left' ? -1 : 1) * elbow) : new Q(); m.arm = true;
}
/**
 * env: { scene, fx (the effects: the thrown lance lies in one of its slots), emit (name, detail) }. The caller: update(dt, ctx), holding(j), skip(), reset(), focus(j, out).
 * ctx: { jousters: [j, ...], decide(j) -> 'rise' | 'dazed' | 'down', replay: bool }
 */
export function createAftermath(env) {
  const group = new THREE.Group(); group.name = 'aftermath'; env.scene.add(group);
  const units = new Map();
  const A = { force: null, units, group, helpOdds: 0.65 };
  const emit = (name, detail) => { try { if (env.emit) env.emit(name, detail); } catch (e) { console.warn('[aftermath]', e); } try { window.dispatchEvent(new CustomEvent('aftermath:' + name, { detail })); } catch (e) { /* no window */ } };
  A.emit = emit;
  const leather = new THREE.MeshLambertMaterial({ color: 0x4a3322 });

  function livery(j) { const a = j.arms || {}; return { c1: a.c1 ?? 0xb23a2a, c2: a.c2 ?? 0xe8d9b0 }; }
  function newMan(j, look) { const m = new Man(Object.assign(livery(j), look || {})); group.add(m.root); return m; }
  /** The pelvis now: the points he is posed from, or the ragdoll's. */
  const pelNow = (U, o = new V3()) => (U.on ? pt(U.P, I.pelvis, o) : pt(U.j.rag.rd.p, I.pelvis, o));
  const ptNow = (U, n, o = new V3()) => pt(U.on ? U.P : U.j.rag.rd.p, I[n], o);

  function start(j, ctx) {
    const U = { j, T: 0, phase: 'fall', kind: ctx.decide ? ctx.decide(j) : 'rise', skipped: false, done: false, lie: 0, side: j.root.position.x >= 0 ? 1 : -1, actors: [], P: new Float32Array(3 * NP), on: false,
      ev: {}, props: [], idx: Math.max(0, ctx.jousters.indexOf(j)), tt: 0, horse: { phase: 'loose' }, shift: new V3(), carryD: 0 };
    if (A.force) U.kind = A.force;
    U.dir = j.dir || 1; units.set(j, U); j.getUp = { on: false, P: U.P };
    return U;
  }
  const settled = (U) => { const G = U.j.rag; return !G || G.rd.sleep || G.t > 5.5; };

  /** Take over the points where he lies: his measure, his heading, the sequence of keys. */
  function takeOver(U, kind) {
    const j = U.j, G = j.rag, P = U.on ? U.P : G.rd.p, d = U.d || measure(G.P0), g = (n) => pt(P, I[n]);
    const pel = g('pelvis'), spine = g('chest').sub(pel), Qp = basis(g('hipL').sub(g('hipR')), spine.clone()), f = new V3(0, 0, 1).applyQuaternion(Qp);
    const supine = f.y > 0.35, hz = new V3(spine.x, 0, spine.z), heading = hz.lengthSq() > 0.04 ? hz.normalize() : new V3(f.x, 0, f.z).normalize();
    if (kind === 'dazed' && supine) heading.negate();      // sitting up from his back, he faces the way his feet point
    if (heading.lengthSq() < 0.5) heading.set(0, 0, U.dir);
    const O = new V3(pel.x, 0, pel.z), k0 = fromPoints(P, d); U.d = d; U.supine = supine; U.k0 = k0;
    let keys;
    if (kind === 'carry') {
      const cd = U.cdir = new V3(U.side * 0.12, 0, -U.dir).normalize(), Qgc = new Q().setFromAxisAngle(AY, Math.atan2(-cd.x, -cd.z)), c = { d, O, Qg: Qgc };
      U.Qgc = Qgc; U.tt = 0; U.shift.set(0, 0, 0); U.carryD = 0;
      const Tl = d.thigh + d.shin, hang = (i) => ({ rel: [(i ? -1 : 1) * 0.07, 0.04, -(d.uarm + d.farm) * 0.95], p: [i ? -1 : 1, 0, -0.6] });
      const lifted = makeKey(c, { pitch: -90, hipY: 1.0, pel: [0, 0], sb: -8, nod: -42,
        f: [{ t: [0.13, 0.82, Tl * 0.93], toe: [0, -0.8, 0.5], p: [0, 1, 0] }, { t: [-0.13, 0.82, Tl * 0.93], toe: [0, -0.8, 0.5], p: [0, 1, 0] }], h: [hang(0), hang(1)] });
      keys = [{ t: 0, pm: k0 }, { t: 2.0, pm: lifted }, { t: 99, pm: lifted }];
    } else {
      const Qg = new Q().setFromAxisAngle(AY, Math.atan2(heading.x, heading.z));
      U.O = O; U.Qg = Qg; const outward = new V3(U.side, 0, 0), left = new V3(1, 0, 0).applyQuaternion(Qg); U.hand = left.dot(outward) >= 0 ? 0 : 1; U.heading = heading;
      U.helped = kind === 'dazed' || Math.random() < A.helpOdds;
      keys = sequence(kind, { d, O, Qg }, k0, { supine });
      U.extAt = new V3(O.x + U.side * 0.5, 1.06, O.z).addScaledVector(heading, 0.3);
      U.standT = keys[keys.length - 1].t; U.riseT = keys[keys.length - 2].t - 0.1;
    }
    U.W = { Hips: new Q(), Spine: new Q(), Spine1: new Q(), Spine2: new Q(), Neck: new Q(), Head: new Q() }; j.getUp.W = U.W; j.getUp.ww = 0;
    U.keys = keys; U.pm = new Pm(); U.act = new Float32Array(P); U.tt = 0; U.on = true; U.mode = kind; j.getUp.on = true; U.P.set(P); U.ext = new V3();
    U.endT = keys[keys.length - 1].t; U.look = U.look || new V3();
  }
  function poseAt(U, t) {
    const K = U.keys; let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)], k = b.t > a.t ? ease(clamp((t - a.t) / (b.t - a.t), 0, 1)) : 1;
    U.pm.mix(a.pm, b.pm, k);
  }
  const aux = { Qc: new Q() }, _P = new Float32Array(3 * NP);
  function stepGetUp(U, dt) {
    U.tt += dt; const t = U.tt, pm = U.pm;
    poseAt(U, Math.min(t, U.endT));
    if (U.mode === 'carry') {
      U.carryD = Math.min(3.4, U.carryD + dt * 1.4 * sstep(2.0, 3.0, t)); U.shift.copy(U.cdir).multiplyScalar(U.carryD);
      pm.pel.add(U.shift); for (let i = 0; i < 2; i++) { pm.h[i].t.add(U.shift); pm.f[i].t.add(U.shift); }
      pm.sb += 0.02 * Math.sin(t * 5.2); pm.sl += 0.03 * Math.sin(t * 2.6);
    } else {
      const dz = U.kind === 'dazed' ? 1 : 0.4, last = t >= U.endT;
      pm.sb += 0.025 * Math.sin(t * 2.1) * dz + (last ? 0.012 * Math.sin(t * 1.4) : 0);
      if (U.kind === 'dazed' && t > 1.0 && t < U.riseT - 0.6) pm.sl += 0.07 * Math.sin(t * 1.7);
      if (!U.helped) pm.ext = 0;
    }
    solve(pm, U.d, _P, aux, U.extAt, U.hand);
    const w = sstep(0, 0.3, t), W = U.W;      // the trunk's bones from my frames (x his left, y up, z the way he faces, as the rig's own are when he sits upright): hips, chest, head, the spine and neck between
    W.Hips.copy(pm.q); W.Spine2.copy(aux.Qc); W.Head.copy(aux.Qc).multiply(pm.hq);
    W.Spine.slerpQuaternions(W.Hips, W.Spine2, 1 / 3); W.Spine1.slerpQuaternions(W.Hips, W.Spine2, 2 / 3); W.Neck.slerpQuaternions(W.Spine2, W.Head, 0.5);
    U.j.getUp.ww = sstep(0, 0.4, t);
    for (let i = 0; i < _P.length; i++) U.P[i] = lerp(U.act[i], _P[i], w);
    pt(U.P, I.pelvis, U.look);
  }

  // ---- the props: the lance the rider dropped and his shield, if it fell, lie in the effects' slots for a while; here they become things a squire can pick up
  function adopt(U) {
    const fx = env.fx; if (!fx || !fx.s) return; const c = livery(U.j), at = pelNow(U, _p3);
    for (const s of fx.s) {
      if (s.life <= 0.5 || s.p.distanceTo(at) > 26) continue;
      const lance = s.sc.x < 0.1 && s.sc.z > 0.6, shield = s.sc.x > 0.3 && s.sc.x < 0.6 && s.sc.y > 0.5 && s.sc.z < 0.06;
      if (!lance && !shield) continue;
      const g = new THREE.Group();
      if (lance) {
        const m = bit(g, new THREE.CylinderGeometry(0.03, 0.045, s.sc.z, 6), c.c1, 0, 0, 0); m.rotation.x = Math.PI / 2;
        const tip = bit(g, new THREE.ConeGeometry(0.035, 0.22, 5), 0xb9bcc2, 0, 0, s.sc.z / 2 + 0.1); tip.rotation.x = Math.PI / 2;
        for (const z of [-0.25, 0.1]) { const b = bit(g, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), c.c2, 0, 0, s.sc.z * z); b.rotation.x = Math.PI / 2; }
      } else {
        bit(g, gBox, c.c1, 0, 0, 0, s.sc.x, s.sc.y, s.sc.z * 1.4); bit(g, gBox, c.c2, 0, 0, 0.012, s.sc.x * 0.22, s.sc.y * 0.9, s.sc.z * 1.5);
      }
      g.position.copy(s.p); g.quaternion.copy(s.q); group.add(g); s.life = 0.0001;
      U.props.push({ kind: lance ? 'lance' : 'shield', g, len: s.sc.z, held: null });
    }
  }
  function takeProp(U, a, kind) {
    const p = U.props.find((x) => x.kind === kind && !x.held); if (!p) return null; p.held = a; return p;
  }
  function carryProps(U) {
    for (const p of U.props) {
      if (!p.held) continue;
      const a = p.held, m = a.m;
      if (p.kind === 'lance') { m.at('RightHand', _p1); p.g.position.copy(_p1).y += p.len / 2 - 0.85; p.g.quaternion.setFromUnitVectors(AZ, _p2.set(0.12, 1, 0.06).normalize()); }
      else { m.at('LeftHand', _p1); p.g.position.copy(_p1).y += 0.02; p.g.quaternion.setFromAxisAngle(AY, a.yaw + Math.PI); p.g.position.addScaledVector(_p2.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)), 0.12); }
    }
  }

  // ---- the crew
  function spawnCrew(U) {
    const j = U.j, side = U.side, z0 = j.rider.position.z, dir = U.dir, h = j.root.position;
    const a = new Actor(newMan(j), side * 8.4, z0 - dir * 12, 'attend');
    // the horse's stopping place: what it still carries, then the braking
    const v = Math.max(0, j.speed || 0), stopZ = h.z + dir * (v * 1.0 + v * v / 12);
    const b = new Actor(newMan(j), side * 8.4, stopZ + dir * 7, 'catch');
    a.yaw = Math.atan2(-side, dir * 0.9); b.yaw = Math.atan2(-side, -dir * 0.9);
    U.actors.push(a, b); U.A = a; U.B = b;
    if (U.kind === 'down') { U.S = new Actor(new Man({ c1: 0x2a2024, c2: 0x7a1f1f, robe: 0x2b2527, cap: 0x151012, skin: 0xe4b896 }), side * 8.4, z0 - dir * 8, 'surgeon'); group.add(U.S.m.root); U.actors.push(U.S); }
    if (U.kind === 'down') orderDown(U); else orderRise(U);
  }
  function orderRise(U) {
    const A_ = U.A, B_ = U.B, H = U.horse;
    // A: beside him on the outer side, at arm's length of where his hand will reach; helps him up if he is to be helped; then the lance and the shield
    const spot = () => [(U.O ? U.O.x : pelNow(U).x) + U.side * 0.95, (U.O ? U.O.z : pelNow(U).z) + (U.heading ? U.heading.z * 0.25 : 0)];
    const face = () => { const p = pelNow(U, _p4); return [p.x, p.z]; };
    A_.go({ run: spot, v: 3.7, stop: 0.2 },
      { face, pose: U.kind === 'dazed' ? 'kneel' : 'ready', until: () => U.on && U.mode !== 'carry' && U.tt >= U.keys[U.keys.length - 4].t - 0.3, max: 30, rate: 5 },
      { face, pose: 'ready', until: () => U.done || U.tt >= U.standT, max: 8, rate: 7, fnEach: (a) => { if (U.helped) aimArm(a.m, U.hand ? 'Left' : 'Right', U.extAt); } },
      { pose: 'idle', dur: 0.5 });
    for (const kind of ['lance', 'shield']) {
      const find = () => U.props.find((x) => x.kind === kind && !x.held);
      const pos = () => { const p = find(); return p ? [p.g.position.x, p.g.position.z] : [A_.x, A_.z]; };
      A_.go({ run: pos, v: 3.2, stop: 0.55 }, { face: pos, pose: 'crouch', dur: 1.2, rate: 7, fnEach: (a, dt, t) => { if (t > 0.6 && !a.got) a.got = takeProp(U, a, kind); } },
        { fn: (a) => { a.got = null; } }, { walk: () => [(U.O ? U.O.x : 0) + U.side * 1.8, (U.O ? U.O.z : 0) - U.dir * 0.8], v: 1.9, stop: 0.2, carry: true }, { face, pose: 'idle', dur: 0.3 });
    }
    A_.go({ face, pose: 'idle', until: () => false, max: 999 });
    // B: the loose horse
    const bitW = (o) => horseBit(U.j, o);
    B_.go(
      { run: () => { const h = U.j.root.position; return [h.x + U.side * 1.6, h.z + U.dir * 0.8]; }, v: 4.3, stop: 1.9 },
      { until: () => (U.j.speed || 0) < 1.0 || U.T > 9, pose: 'ready', face: () => [U.j.root.position.x, U.j.root.position.z], max: 8, rate: 7 },
      { run: () => { const p = bitW(_p4); return [p.x + U.side * 0.5, p.z + 0.2]; }, v: 3.5, stop: 0.9 },
      { fn: () => { H.phase = 'lead'; U.rein = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), leather); group.add(U.rein); } },
      { pose: 'idle', until: () => H.phase === 'done', max: 120, fnEach: (b, dt) => leadSquire(U, b, dt) },
      { pose: 'idle', until: () => false, max: 999, fnEach: (b, dt) => leadSquire(U, b, dt) });
  }
  function orderDown(U) {
    const A_ = U.A, B_ = U.B, S_ = U.S;
    const lie = (n) => ptNow(U, n, new V3());
    const headSpot = () => { const h = lie('head'), c = lie('chest'), d = h.clone().sub(c).setY(0); if (d.lengthSq() < 0.01) d.set(0, 0, U.dir); d.normalize(); return [h.x + d.x * 0.5 + U.side * 0.15, h.z + d.z * 0.5]; };
    const hipSpot = () => { const p = lie('pelvis'), c = lie('chest'), d = p.clone().sub(c).setY(0); if (d.lengthSq() < 0.01) d.set(0, 0, -U.dir); d.normalize(); return [p.x + d.x * 0.35 + U.side * 0.85, p.z + d.z * 0.35]; };
    const chestSpot = () => { const c = lie('chest'); return [c.x + U.side * 0.9, c.z]; };
    const faceK = () => { const p = lie('chest'); return [p.x, p.z]; };
    A_.go({ run: headSpot, v: 3.7, stop: 0.15 }, { face: faceK, pose: 'kneel2', until: () => U.carrying, max: 40, rate: 5 });
    B_.go({ run: hipSpot, v: 3.5, stop: 0.15 }, { face: faceK, pose: 'kneel2', until: () => U.carrying, max: 40, rate: 5 });
    S_.go({ run: chestSpot, v: 4.0, stop: 0.15 }, { face: faceK, pose: 'kneel', until: () => U.carrying, max: 40, rate: 5,
      fnEach: (a) => { const c = lie('chest'); aimArm(a.m, 'Right', _p2.copy(c).setY(0.3)); aimArm(a.m, 'Left', _p3.copy(lie('head')).setY(0.25)); U.surgeonHere = true; } });
  }
  /** The horse's bit in the world (the model's own, if it has one; else a place ahead of the withers). */
  function horseBit(j, o) {
    if (j.bit && j.bit[0]) { j.bit[0].getWorldPosition(o); j.bit[1].getWorldPosition(_p1); o.lerp(_p1, 0.5); if (o.y > 0.7 && o.distanceTo(j.root.position) < 3.2) return o; }
    return o.set(0, 1.3, 1.65).applyQuaternion(j.root.quaternion).add(j.root.position);
  }
  /** The squire at the horse's head: ahead and a little to the side, his arm to the rein; the horse follows. */
  function leadSquire(U, b, dt) {
    const H = U.horse, j = U.j; if (H.phase === 'loose') return;
    const r = j.root, yaw = r.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const bp = horseBit(j, _p4);
    b.x = bp.x + fx * 0.75 + fz * 0.35 * U.side; b.z = bp.z + fz * 0.75 - fx * 0.35 * U.side; b.yaw = wrapA(yaw + 0.25 * U.side);
    b.gait = H.moving ? 1 : 0; b.k = 0.55; if (H.moving) b.m.phase += dt * 0.85;
    b.m.rate = 8; setPose(b.m, 'idle'); b.m.tgt.Head = qy(-0.35 * U.side);
    aimArm(b.m, 'Right', bp); b.m.at('RightHand', _p1);
    if (U.rein) { _p2.subVectors(bp, _p1); const L = _p2.length(); U.rein.position.copy(_p1).addScaledVector(_p2, 0.5); U.rein.scale.set(1, Math.max(0.05, L), 1); U.rein.quaternion.setFromUnitVectors(AY, _p2.divideScalar(L || 1)); }
  }
  /** The loose horse: carries on and stops by itself (main.js looseHorse); once the squire has the rein it turns and walks back to where the knight lies. */
  function stepHorse(U, dt) {
    const H = U.horse, j = U.j, r = j.root; if (H.phase === 'loose' || H.phase === 'done') { if (H.phase === 'done') j.speed = 0; return; }
    if (!H.init) { H.init = true; H.yaw = r.rotation.y; j.manualPos = true; H.v = j.speed || 0; }
    const at = pelNow(U, _p3), tx = at.x + U.side * 3.1, tz = at.z - U.dir * 1.2, dx = tx - r.position.x, dz = tz - r.position.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz), err = wrapA(want - H.yaw);
    H.yaw += clamp(err, -1.15 * dt, 1.15 * dt);
    const vT = dist < 0.5 ? 0 : Math.min(1.5, 0.5 + dist * 0.45) * clamp(Math.cos(err) * 1.2, 0.25, 1);
    H.v = damp(H.v, vT, 3.5, dt); H.moving = H.v > 0.2;
    r.position.x += Math.sin(H.yaw) * H.v * dt; r.position.z += Math.cos(H.yaw) * H.v * dt; r.rotation.y = H.yaw; j.speed = H.v;
    if (dist < 0.5 && H.v < 0.25) { H.phase = 'done'; H.moving = false; j.speed = 0; }
  }

  A.update = function update(dt, ctx) {
    if (!ctx || !ctx.jousters) return;
    group.visible = !ctx.replay;
    for (const [jj, UU] of [...units]) if (!ctx.jousters.includes(jj)) cleanup(UU);
    for (const j of ctx.jousters) {
      if (!j || !j.rig) continue;
      let U = units.get(j);
      if (j.unhorsed && j.rag && !U && !j.replaying) U = start(j, ctx);
      if (!U) continue;
      if (!j.unhorsed) { cleanup(U); continue; }
      if (j.replaying || ctx.replay) { if (ctx.replay) carryProps(U); continue; }
      U.T += dt;
      if (U.phase === 'fall') {
        if (!U.crew && U.T > 0.8) { U.crew = true; spawnCrew(U); }
        if (settled(U)) { U.lie += dt; if (U.lie > 0.3) { U.phase = U.kind === 'down' ? 'down' : 'getup'; if (U.kind !== 'down') takeOver(U, U.kind); emit('down', { side: U.idx, kind: U.kind, jouster: j }); } }
      }
      if (U.T > 3.2 && !U.adopted) { U.adopted = true; adopt(U); }
      if (U.phase === 'getup' && U.on) {
        stepGetUp(U, dt);
        if (!U.ev.up && U.tt >= U.standT - 0.2) { U.ev.up = true; emit('up', { side: U.idx, kind: U.kind, helped: !!U.helped, jouster: j }); }
        if (U.tt >= U.standT + 0.5) U.done = true;
      }
      if (U.phase === 'down') { stepDown(U, dt); if (U.on) stepGetUp(U, dt); }
      stepHorse(U, dt);
      for (const a of U.actors) { stepActor(a, dt); animate(a.m, dt, a.gait, a.k); place(a); }
      carryProps(U);
    }
  };
  /** Staying down: the surgeon kneels, the helm comes off, then he is lifted and carried away. */
  function stepDown(U, dt) {
    const j = U.j;
    if (U.surgeonHere) U.sT = (U.sT || 0) + dt;
    if (U.sT > 1.0 && !U.helmOff) {      // the squire at his head lifts the helm off: it is in his hands a moment, then he sets it on the sand
      U.helmOff = true; j.helmOff = true; U.helmT = 0;
      const g = new THREE.Group(); bit(g, new THREE.CylinderGeometry(0.12, 0.14, 0.22, 9), 0x8c9098, 0, 0, 0); bit(g, new THREE.SphereGeometry(0.12, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aa0a8, 0, 0.11, 0); bit(g, gBox, 0x2a2420, 0, 0.02, 0.13, 0.16, 0.012, 0.02);
      group.add(g); U.helmG = g;
    }
    if (U.helmG) {
      U.helmT += dt; const A_ = U.A;
      if (U.helmT < 1.6) { A_.m.at('LeftHand', _p1); A_.m.at('RightHand', _p2); U.helmG.position.copy(_p1).lerp(_p2, 0.5); U.helmG.position.y += 0.1; }
      else { const h = ptNow(U, 'head', _p1); U.helmG.position.lerp(_p2.set(h.x + U.side * 0.75, 0.15, h.z - U.dir * 0.2), 0.2); U.helmG.rotation.z = lerp(U.helmG.rotation.z, 1.3, 0.1); }
    }
    if (U.sT > 2.6 && !U.carrying) {
      U.carrying = true; takeOver(U, 'carry'); emit('carried', { side: U.idx, kind: 'down', jouster: j });
      const A_ = U.A, B_ = U.B, S_ = U.S, lv = new V3(1, 0, 0).applyQuaternion(U.Qgc);
      const flank = (s, along) => () => { const p = U.look; return [p.x + lv.x * s * 0.62 + U.cdir.x * along, p.z + lv.z * s * 0.62 + U.cdir.z * along]; };
      for (const [a, s, al] of [[A_, 1, 0.34], [B_, -1, -0.32]]) {
        a.q.length = 0; const fl = flank(s, al);
        a.go({ run: fl, v: 4, stop: 0.12 }, { pose: 'carry', until: () => false, max: 600, fnEach: (aa, d2) => {
          const p = fl(); aa.x = p[0]; aa.z = p[1]; aa.yaw = Math.atan2(U.cdir.x, U.cdir.z); if (U.carryD > 0.05 && U.carryD < 3.39) { aa.gait = 1; aa.k = 0.5; aa.m.phase += d2 * 0.85; }
          aimArm(aa.m, s > 0 ? 'Left' : 'Right', _p2.set(U.look.x + lv.x * s * 0.2, 0.95, U.look.z + lv.z * s * 0.2)); } });
      }
      S_.q.length = 0; S_.go({ walk: () => [U.look.x - U.cdir.x * 1.5 + lv.x * 0.9, U.look.z - U.cdir.z * 1.5 + lv.z * 0.9], v: 1.5, stop: 0.3 }, { pose: 'idle', until: () => false, max: 999 });
    }
    if (U.carrying && U.carryD > 2.0) U.done = true;
  }
  function cleanup(U) {
    for (const a of U.actors) group.remove(a.m.root);
    for (const p of U.props) group.remove(p.g);
    if (U.helmG) group.remove(U.helmG);
    if (U.rein) group.remove(U.rein);
    if (U.j.getUp) U.j.getUp = null;
    if (U.j.manualPos && U.horse && U.horse.init) U.j.manualPos = false;
    units.delete(U.j);
  }
  A.reset = function reset() { for (const U of [...units.values()]) cleanup(U); };
  A.holding = (j) => { const U = j && units.get(j); return !!(U && !U.done && !U.skipped && U.T < (U.kind === 'down' ? 12.5 : 11)); };
  A.active = () => units.size > 0;
  A.skip = function skip() {
    for (const U of units.values()) {
      if (U.skipped) continue; U.skipped = true;
      if (U.on && U.mode !== 'carry') { U.tt = Math.max(U.tt, U.standT); if (!U.ev.up) { U.ev.up = true; emit('up', { side: U.idx, kind: U.kind, jouster: U.j, skipped: true }); } }
    }
  };
  A.focus = (j, o) => { const U = j && units.get(j); if (!U || !U.on || !U.look) return null; return o.copy(U.look); };
  return A;
}

