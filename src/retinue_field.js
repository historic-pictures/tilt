// Your men on the field: squire, groom, armourer, farrier and pursuivant, standing just outside your lane at the end of the lists where you will be.
// Each is a handful of cheap meshes (the way crowd.js builds a person: shared geometry, flat colours) in your livery, with the cap of his post.
// Positions are kept as [out, fwd] in the frame of YOUR end: out = metres away from the tilt, fwd = the way your horse faces, you at [0, 0].
// A man runs a short list of steps (walk, act, hold, fn); poses are eased toward targets every frame, so there is no animation system.
import * as THREE from 'three';
import { drawCrest } from './util.js';
import { LANE_X, START_Z } from './world.js';

const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const G = {
  leg: new THREE.CylinderGeometry(0.075, 0.06, 0.85, 6).translate(0, -0.425, 0),
  torso: new THREE.CylinderGeometry(0.2, 0.24, 0.64, 8).translate(0, 0.32, 0),
  head: new THREE.SphereGeometry(0.115, 8, 6),
  arm: new THREE.CylinderGeometry(0.055, 0.045, 0.6, 6).translate(0, -0.3, 0),
  dome: new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.19, 0.19, 0.03, 10),
  crown: new THREE.CylinderGeometry(0.11, 0.125, 0.09, 8),
  cone: new THREE.ConeGeometry(0.13, 0.3, 8),
  toque: new THREE.CylinderGeometry(0.12, 0.15, 0.17, 10),
  feather: new THREE.BoxGeometry(0.02, 0.2, 0.05),
  apron: new THREE.BoxGeometry(0.36, 0.52, 0.03),
  tabard: new THREE.BoxGeometry(0.4, 0.6, 0.03),
  shaft: new THREE.CylinderGeometry(0.03, 0.045, 3.5, 6).translate(0, 1.5, 0),       // a lance, butt at 0 (y -0.25), point at 3.25 up
  band: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6),
  point: new THREE.ConeGeometry(0.035, 0.22, 5),
  stump: new THREE.CylinderGeometry(0.035, 0.045, 1.1, 6).translate(0, 0.45, 0),
  gstump: new THREE.CylinderGeometry(0.035, 0.045, 1.1, 6).rotateX(Math.PI / 2),       // a broken stump lying along the fwd axis, centred
  pole: new THREE.CylinderGeometry(0.022, 0.026, 2.0, 5).translate(0, 0.6, 0),
  cloth: new THREE.PlaneGeometry(0.75, 0.88),
  post: new THREE.BoxGeometry(0.08, 1.25, 0.08).translate(0, 0.62, 0),
  bar: new THREE.BoxGeometry(0.08, 0.08, 1.1),
  handle: new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5).translate(0, -0.12, 0),
  mallet: new THREE.BoxGeometry(0.07, 0.07, 0.16).translate(0, -0.3, 0),
  helm: new THREE.CylinderGeometry(0.15, 0.17, 0.3, 8),
  block: new THREE.BoxGeometry(0.5, 0.2, 0.26).translate(0, 0.6, 0),
  stand: new THREE.CylinderGeometry(0.2, 0.24, 0.5, 7).translate(0, 0.25, 0),
  bucket: new THREE.CylinderGeometry(0.16, 0.12, 0.26, 8).translate(0, 0.13, 0),
};
const SKIN = ['#f0c8a4', '#e0ac84', '#c68e63', '#a8704a', '#7c4f33', '#f4d6bb'];
let mats = new Map();
const mat = (c) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, side: c === 'banner' ? THREE.DoubleSide : THREE.FrontSide }); mats.set(c, m); } return m; };
const mesh = (g, c, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, mat(c)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// Where each man stands at rest, and the spots he walks to ([out, fwd]).
const HOME = { squire: [3.0, -1.3], groom: [2.6, 2.8], armourer: [3.5, 0.9], farrier: [3.5, 2.5], pursuivant: [2.6, 5.0], master: [7.2, 2.0] };      // the master of arms stands by the rail, not in the retinue
const SPOT = { pile: [3.0, -2.6], stirrup: [0.95, 0.3], head: [0.55, 1.8], flank: [1.0, -0.25], leg: [0.85, 1.0], front: [1.8, 3.4] };
const WALK = 1.9;

function lance(parent, c1, c2) {      // a lance in your colours: shaft, a band, a steel point
  const g = grp(parent); mesh(G.shaft, c1, g); mesh(G.band, c2, g, 0, 1.1, 0); mesh(G.band, c2, g, 0, 2.2, 0); mesh(G.point, '#b9bcc2', g, 0, 3.36, 0);
  return g;
}

/** One end of the lists with its crew (yours: the full retinue; his: just a squire). */
function makeSide(scene, isLate) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const endG = grp(root);
  let men = {}, tD = 0, prevMode = '', t = 0, serving = 0, rack = [], arms = null, pile = [], pileN = 0, lo = 0, lf = 0, gs = null;      // gs: the stump the rider threw down
  const F = { root, men: () => men };

  function build(id, rec, c1, c2, extras) {
    const sk = SKIN[hash(rec.name) % SKIN.length], g = grp(endG), body = grp(g), a = { id, rec, g, body, o: 0, f: 0, yaw: 0, q: [], pose: 'idle', k: 0, ph: (hash(rec.name) % 628) / 100, wph: 0, moving: false, walkYaw: 0, pend: null, talkT: 0, ang: { aL: 0, aR: 0, lean: 0, drop: 0, hd: 0 }, home: HOME[id] };
    const legL = a.legL = grp(body, -0.09, 0.85), legR = a.legR = grp(body, 0.09, 0.85);
    mesh(G.leg, c1, legL); mesh(G.leg, c2, legR);                      // parti-coloured hose
    const torso = a.torso = grp(body, 0, 0.85); mesh(G.torso, c1, torso);
    const head = a.head = grp(torso, 0, 0.66); mesh(G.head, sk, head, 0, 0.12, 0);
    const armL = a.armL = grp(torso, -0.27, 0.57), armR = a.armR = grp(torso, 0.27, 0.57); mesh(G.arm, c1, armL); mesh(G.arm, c1, armR);
    a.handR = grp(armR, 0, -0.6); a.handL = grp(armL, 0, -0.6);
    const cap = { squire: () => mesh(G.dome, c2, head, 0, 0.17, 0), groom: () => { mesh(G.brim, c2, head, 0, 0.2, 0); mesh(G.crown, c2, head, 0, 0.25, 0); },
      armourer: () => mesh(G.dome, '#d9d0b6', head, 0, 0.15, 0).scale.set(1.12, 1.1, 1.12), farrier: () => { const m = mesh(G.cone, '#6b4a32', head, 0, 0.33, -0.02); m.rotation.x = 0.25; },
      pursuivant: () => { mesh(G.toque, c2, head, 0, 0.27, 0); mesh(G.feather, '#d8222a', head, 0.1, 0.4, 0); },
      master: () => { mesh(G.brim, '#3a3029', head, 0, 0.2, 0); mesh(G.crown, '#3a3029', head, 0, 0.25, 0); mesh(G.feather, '#d9d0b6', head, 0.1, 0.33, 0); } }[id];
    cap();
    if (id === 'armourer' || id === 'farrier') mesh(G.apron, '#5b4332', torso, 0, 0.3, 0.22);
    if (id === 'pursuivant') { mesh(G.tabard, c2, torso, 0, 0.3, 0.22); mesh(G.tabard, c2, torso, 0, 0.3, -0.22); }
    // what he carries
    if (id === 'squire') {
      a.lanceP = grp(a.handR); lance(a.lanceP, c1, c2).position.y = -0.5; a.lanceP.visible = false;
      a.stump = grp(a.handR); mesh(G.stump, c1, a.stump); a.stump.visible = false;
      a.helmP = grp(torso, 0, 0.35, 0.32); mesh(G.helm, '#8c9098', a.helmP); a.helmP.visible = false;
    }
    if (id === 'armourer') { a.tool = grp(a.handR); mesh(G.handle, '#5b4332', a.tool); mesh(G.mallet, '#6c7078', a.tool); }
    if (id === 'pursuivant') {
      a.banner = grp(a.handR); mesh(G.pole, '#5b4332', a.banner);
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 112; drawCrest(cv, arms); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const cl = new THREE.Mesh(G.cloth, new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })); cl.position.set(0, 1.25, 0.4); cl.rotation.y = Math.PI / 2; a.banner.add(cl); a.clothMat = cl.material;
    }
    // the things left standing at his place: spare lances, anvil, bucket, hoof-box
    const hp = HOME[id];
    if (id === 'squire') {
      const r = grp(endG, -(hp[0] + 0.9), 0, hp[1] - 0.3); mesh(G.post, '#5b4332', r, 0, 0, -0.55); mesh(G.post, '#5b4332', r, 0, 0, 0.55); mesh(G.bar, '#5b4332', r, 0, 1.0, 0);
      pile = [[-0.25, 0.04], [0.0, 0.04], [-0.12, 0.11]].map(([dx, y]) => { const m = mesh(G.gstump, c1, endG, -(hp[0] + 0.7) + dx, y, -3.0); m.visible = false; return m; }); pileN = 0;
      gs = { mesh: mesh(G.gstump, c1, endG), active: false, spot: [1.5, -0.7] }; gs.mesh.visible = false; gs.mesh.rotation.order = 'YXZ';
      rack = [-0.35, 0, 0.35].map((z, i) => { const l = grp(r, 0.05, 0, z); lance(l, c1, c2); l.rotation.z = -0.1; l.rotation.x = (i - 1) * 0.04; return l; });
    }
    if (id === 'armourer') { const s = grp(endG, -(hp[0] + 0.7), 0, hp[1] - 0.2); mesh(G.stand, '#6b4a32', s); mesh(G.block, '#4b4f56', s); }
    if (id === 'groom') mesh(G.bucket, '#7b5c3a', endG, -(hp[0] + 0.5), 0, hp[1] + 0.4);
    if (id === 'farrier') mesh(G.bucket, '#4b4f56', endG, -(hp[0] + 0.5), 0, hp[1] - 0.2).scale.set(1.3, 0.6, 1.3);
    a.o = hp[0]; a.f = hp[1]; a.yaw = Math.atan2(-(0 - a.o), 0 - a.f);
    return a;
  }

  F.clear = function clear() {
    root.visible = false; endG.clear(); for (const a of Object.values(men)) if (a.clothMat) { a.clothMat.map.dispose(); a.clothMat.dispose(); }
    for (const k of ['ring', 'disc', 'arrow']) if (mk[k]) { mk[k].geometry.dispose(); mk[k].material.dispose(); } mk.g = mk.ring = mk.disc = mk.arrow = null;
    men = {}; rack = []; pile = []; pileN = 0; gs = null; serving = 0; tD = 0;
    for (const m of mats.values()) m.dispose(); mats = new Map();
  };
  /** retinue: profile.retinue ({ id: { name, trait } }); arms: your colours; only the squire in practice. */
  F.setup = function setup(retinue, a, practice, withMaster) {
    F.clear(); arms = a;
    for (const id of Object.keys(HOME)) { const r = retinue && retinue[id]; if (id !== 'master' && r && typeof r === 'object' && (id === 'squire' || !practice)) men[id] = build(id, r, a.c1, a.c2); }
    if (withMaster) { men.master = build('master', { name: 'master of arms' }, '#4a4038', '#4a4038'); buildMark(); }      // your trainer, at the rail
    root.visible = Object.keys(men).length > 0; prevMode = '';
  };
  // the mark: a ring on the ground where you stop, facing down the lists (shown while you ride back by hand)
  const mk = { g: null, ring: null, disc: null, arrow: null, on: 0 };
  function buildMark() {
    const g = mk.g = grp(endG, 0, 0.05, 0), M = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    mk.ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.0, 40).rotateX(-Math.PI / 2), M('#e8c75a', 0.7)); g.add(mk.ring);
    mk.disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40).rotateX(-Math.PI / 2), M('#e8c75a', 0.12)); g.add(mk.disc);
    mk.arrow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), M('#e8c75a', 0.55)); mk.arrow.position.z = 0.9; g.add(mk.arrow);
    g.visible = false; mk.on = 0;
  }

  const home = (a) => ({ walk: a.home });
  const present = (a) => !(isLate && isLate(a.id));
  const go = (a, steps, pending) => { flush(a); a.q = steps; if (pending) a.pend = pending; };
  function flush(a) { if (a.pend) { const f = a.pend; a.pend = null; serving = 0; f(); } }
  function putRack(on) { const l = rack.find(x => !x.visible); if (on) { if (l) l.visible = true; } else { const v = rack.slice().reverse().find(x => x.visible); if (v) v.visible = false; } }

  const showPile = () => { if (pile[pileN % pile.length]) pile[pileN % pile.length].visible = true; pileN++; };
  const hideGround = () => { if (gs) { gs.active = false; gs.mesh.visible = false; } };
  /** The rider throws his broken stump down beside his horse: it tumbles out and lies on the grass until the squire fetches it. */
  F.throwStump = function throwStump() {
    if (!gs || !men.squire) return false;
    const o0 = lo + 0.1, f0 = lf + 0.35, o1 = lo + 1.5, f1 = lf - 0.7, T = 0.7, y0 = 2.0;      // starts at the rider's hand, leaves it 0.2 s into the arm's swing
    Object.assign(gs, { active: true, thud: false, t: 0, T, o0, f0, o1, f1, y0, vy: (0.05 - y0 + 4.905 * T * T) / T, spin: (3 + Math.random() * 2) * Math.PI, yaw: (Math.random() - 0.5) * 0.7, spot: [o1, f1 + 0.35] });
    gs.mesh.visible = true; return true;
  };
  /** The squire's service on arrival; `swap` runs at the moment a fresh lance reaches the rider's hand. Returns false when he is not there (the caller then does the swap itself).
   *  broken: the stump is already on the ground (throwStump): he hands up the fresh lance first, then fetches the stump and lays it by the rack.
   *  not broken: the rider keeps his lance and nobody serves him; the squire may just step up and look to the girth. */
  F.serve = function serve(broken, swap, how, took) {
    const a = men.squire; if (!a || !present(a)) return false;
    if (!broken) { if (Math.random() < 0.5 && !a.q.length && !serving) go(a, [{ walk: SPOT.stirrup }, { act: 'check', dur: 1.1 }, home(a)]); return true; }
    const done = () => { if (swap) { const f = swap; swap = null; f(); } serving = 0; };
    if (how === 'hand') {      // you hand the broken lance straight to him: he takes it, lays it on the pile, and gives you a fresh one
      const hand = () => { a.lanceP.visible = false; if (F.onHand) F.onHand(a.g.getWorldPosition(new THREE.Vector3())); done(); };
      go(a, [{ walk: SPOT.stirrup }, { act: 'take', dur: 0.9, at: 0.5, mid() { if (took) took(); a.stump.visible = true; } },
        { fn() { a.stump.visible = false; showPile(); a.lanceP.visible = true; putRack(false); } }, { act: 'present', dur: 1.2, at: 0.6, mid: hand }, { hold: 'idle', until: () => false, max: 0.3 }, home(a)], done); serving = 1;
      return true;
    }
    const fresh = () => { a.lanceP.visible = true; putRack(false); }, hand = () => { a.lanceP.visible = false; if (F.onHand) F.onHand(a.g.getWorldPosition(new THREE.Vector3())); done(); };
    go(a, [{ fn: fresh }, { walk: SPOT.stirrup }, { act: 'present', dur: 1.2, at: 0.6, mid: hand }, { hold: 'idle', until: () => false, max: 0.3 },
      { walk: gs ? gs.spot : SPOT.stirrup }, { act: 'pick', dur: 1.0, at: 0.55, mid() { hideGround(); a.stump.visible = true; } },
      { walk: SPOT.pile }, { act: 'lay', dur: 0.9, at: 0.5, mid() { a.stump.visible = false; showPile(); } }, home(a)], done); serving = 1;
    return true;
  };
  F.serving = () => serving > 0;
  /** Helm fitting (first course of a match): the squire is at your stirrup at once, hands up at the helm for `secs`; `mid` runs when his hands reach it. */
  F.fitHelm = function fitHelm(secs, mid) { const a = men.squire; if (!a || !present(a)) return false; go(a, [{ set: [SPOT.stirrup[0] + 0.5, SPOT.stirrup[1]] }, { walk: SPOT.stirrup }, { act: 'fit', dur: secs, at: 0.55, mid() { if (mid) mid(); } }, home(a)]); return true; };
  /** The squire runs a few steps toward the lists with his arms up, then cheers where he stands. Returns false when he is not there. */
  F.cheer = function cheer() { const a = men.squire; if (!a || !present(a)) return false; go(a, [{ walk: [a.o * 0.85, a.f + 2.6], fast: true, up: true }, { act: 'cheer', dur: 2.2 }, home(a)]); return true; };
  /** He goes back to his place now (the beat was skipped). */
  F.release = function release() { const a = men.squire; if (a) { flush(a); a.q = [home(a)]; } };
  /** The squire waves you in. */
  F.wave = function wave() { const a = men.squire; if (!a || !present(a) || a.q.length || serving) return false; go(a, [{ act: 'wave', dur: 1.7 }, home(a)]); return true; };
  /** A man's world position (for how near you are to the squire); null when he is not there. */
  F.where = (id, out) => { const a = men[id]; if (!a || !present(a)) return null; a.g.getWorldPosition(out); return out; };

  /** A course is about to be ridden: the men who have work come out. info: { heavy (a hard blow last course), horseHurt, cheer (fn: the stands) } */
  F.begin = function begin(info) {
    const g = men.groom, ar = men.armourer, fa = men.farrier, pu = men.pursuivant;
    if (g && present(g)) go(g, [{ walk: SPOT.head }, { hold: 'bridle', until: () => prevMode !== 'ready', max: 90 }, home(g)]);
    if (ar && present(ar) && info.heavy) go(ar, [{ hold: 'idle', until: () => false, max: 1.2 }, { walk: SPOT.flank }, { act: 'hammer', dur: 2.4 }, home(ar)]);
    if (fa && present(fa) && info.horseHurt) go(fa, [{ hold: 'idle', until: () => false, max: 1.6 }, { walk: SPOT.leg }, { act: 'kneel', dur: 2.6 }, home(fa)]);
    if (pu && present(pu)) go(pu, [{ hold: 'idle', until: () => false, max: 0.8 }, { walk: SPOT.front }, { act: 'banner', dur: 2.6, at: 0.4, mid() { if (info.cheer) info.cheer(); } }, home(pu)]);
  };
  /** The one man who spoke leans in for a moment. */
  F.talk = (id) => { if (men[id]) men[id].talkT = 2.4; };
  /** A man's head, for the speech label above him (null when he is not on the field). */
  F.head = (id) => (men[id] && !(isLate && isLate(id)) ? men[id].head : null);

  // ---- the step runner
  function runStep(a, dt, env) {
    const s = a.q[0]; a.moving = false;
    if (!s) { a.pose = 'idle'; return; }
    if (s.set) { a.o = s.set[0]; a.f = s.set[1]; a.q.shift(); return runStep(a, dt, env); }      // jump to a spot (the camera is already on him)
    if (s.walk) {
      const dx = s.walk[0] - a.o, dz = s.walk[1] - a.f, d = Math.hypot(dx, dz);
      if (d < 0.06) { a.q.shift(); return runStep(a, dt, env); }
      const st = Math.min(d, (s.fast ? 4.8 : a.id === 'squire' ? 2.5 : WALK) * dt); a.o += dx / d * st; a.f += dz / d * st; a.moving = true; a.walkYaw = Math.atan2(-dx, dz); a.pose = s.up ? 'runup' : 'walk'; a.fast = !!s.fast;
    } else if (s.act) {
      s.t = (s.t || 0) + dt; a.pose = s.act; a.k = Math.min(1, s.t / s.dur);
      if (s.mid && !s.fired && a.k >= (s.at ?? 0.5)) { s.fired = true; s.mid(); }
      if (s.t >= s.dur) a.q.shift();
    } else if (s.hold) {
      s.t = (s.t || 0) + dt; a.pose = s.hold; if (s.until() || s.t >= s.max) a.q.shift();
    } else { a.q.shift(); if (s.fn) s.fn(); }
  }

  // ---- poses: target angles for this frame (arm swing about x: negative = forward and up)
  function target(a, tm) {
    const T = a.ang, s = Math.sin(tm * 0.6 + a.ph), w = Math.sin(a.wph), k = ease(a.k);
    let aL = 0.05 + s * 0.04, aR = -0.05 - s * 0.04, lean = 0, drop = 0, lg = 0, lanceW = 0.12, poleW = 0.06, hd = 0;
    const carry = (a.id === 'squire' && (a.lanceP.visible || a.stump.visible)) || a.id === 'pursuivant';
    switch (a.pose) {
      case 'walk': aL = -w * 0.5; aR = carry ? -0.15 : w * 0.5; lg = 0.55; break;
      case 'present': aL = -0.3 - 1.0 * k; aR = -0.3 - 1.2 * k; lean = 0.1 * k; lanceW = 0.12 + 0.95 * k; break;
      case 'take': aR = -1.0 * k; aL = -0.5 * k; lean = 0.2 * Math.sin(k * Math.PI); break;
      case 'pick': lean = 0.65 * Math.sin(k * Math.PI); drop = 0.2 * Math.sin(k * Math.PI); aR = -0.3; aL = -0.3; break;
      case 'lay': lean = 0.5 * Math.sin(k * Math.PI); drop = 0.15 * Math.sin(k * Math.PI); aR = -0.3 - 0.4 * Math.sin(k * Math.PI); break;
      case 'check': aR = -0.7 - 0.25 * Math.sin(tm * 6); aL = -0.1; lean = 0.3 * Math.sin(k * Math.PI); break;
      case 'helm': aL = aR = -1.0 - 1.3 * Math.sin(k * Math.PI * 0.5); lean = 0.05; break;
      case 'fit': aL = -2.3 + Math.sin(tm * 3) * 0.08; aR = -2.45 + Math.sin(tm * 2.3 + 1) * 0.1; lean = -0.06; hd = -0.35; break;      // both hands up at the rider's helm, a glance up at it
      case 'cheer': aL = -2.7 + Math.sin(tm * 9 + a.ph) * 0.35; aR = -2.8 + Math.sin(tm * 8 + a.ph + 1.2) * 0.35; lean = -0.1; hd = -0.3; break;      // arms up, shouting
      case 'runup': aL = -2.5 + w * 0.3; aR = -2.6 - w * 0.3; lg = 0.8; lean = 0.08; hd = -0.2; break;
      case 'helmhold': aL = aR = -0.9; break;
      case 'hammer': aR = -1.9 + Math.sin(tm * 12) * 0.5; aL = -0.4; lean = 0.12; break;
      case 'kneel': aR = -0.9 + Math.sin(tm * 7) * 0.25; aL = -0.5; lean = 0.55; drop = 0.42; break;
      case 'bridle': aR = -1.05; aL = -0.25; break;
      case 'wave': aR = -2.7 + Math.sin(tm * 9) * 0.4; aL = 0.05; lean = -0.05; hd = -0.1; break;
      case 'banner': { const u = Math.min(1, k * 3), c = k > 0.3 ? 1 : 0; aR = -0.15 - 2.2 * ease(u); aL = -0.4 * u; poleW = 0.06 + Math.sin(tm * 3) * 0.1 * c; hd = -0.35 * c + Math.sin(tm * 9) * 0.05 * c; lean = -0.08 * c; break; }
    }
    // he turns to you and gestures: an arm out and moving, the other hand up, a nod
    if (a.talkT > 0 && !a.moving && (a.pose === 'idle' || a.pose === 'bridle' || a.pose === 'helmhold')) { aR = -1.0 + Math.sin(tm * 4.5 + a.ph) * 0.3; aL = -0.35 + Math.sin(tm * 3.1 + a.ph) * 0.15; lean += 0.07; hd += Math.sin(tm * 7) * 0.08; }
    if (a.pose === 'idle' && a.id === 'pursuivant') aR = -0.15;
    T.aL = aL; T.aR = aR; T.lean = lean; T.drop = drop; T.hd = hd; T.lg = lg; T.lanceW = lanceW; T.poleW = poleW;
  }

  /** env: { mode, tD (which way you will face at the end you stand at), px, pz (you, in the world), helmOff }. */
  F.update = function update(dt, env) {
    if (env.mode === 'menu' || !Object.keys(men).length) { root.visible = false; prevMode = env.mode; return; }
    if (env.mode === 'replay') return;
    root.visible = true; t += dt;
    if (mk.g) {      // the mark on the ground
      mk.on = damp(mk.on, env.marker ? 1 : 0, 6, dt); mk.g.visible = mk.on > 0.02; const c = env.onMark ? '#7fe08a' : '#e8c75a', pul = 1 + Math.sin(t * 3) * 0.03;
      for (const k of ['ring', 'disc', 'arrow']) mk[k].material.color.set(c);
      mk.ring.material.opacity = 0.7 * mk.on; mk.disc.material.opacity = (env.onMark ? 0.22 : 0.12) * mk.on; mk.arrow.material.opacity = 0.55 * mk.on; mk.g.scale.set(pul, 1, pul);
    }
    if (serving && men.squire && !men.squire.q.length) flush(men.squire);
    if (env.tD !== tD) {          // the other end of the lists: they are already there when you wheel about (the move happens while you are far off)
      tD = env.tD; endG.position.set(-tD * LANE_X, 0, -tD * START_Z); endG.rotation.y = tD > 0 ? 0 : Math.PI;
      for (const a of Object.values(men)) { flush(a); a.q = []; a.o = a.home[0]; a.f = a.home[1]; a.moving = false; a.pose = 'idle'; if (a.lanceP) a.lanceP.visible = a.stump.visible = a.helmP.visible = false; }
      for (const l of rack) l.visible = true;
      for (const m of pile) m.visible = false; pileN = 0; hideGround();
    }
    const mode = env.mode;
    if (mode === 'charge' && prevMode !== 'charge') for (const a of Object.values(men)) {
      flush(a); a.q = [home(a)];
      if (a.stump && a.stump.visible) { a.stump.visible = false; hideGround(); showPile(); }      // you ride: whatever he carries is put down at the rack
    }      // you ride: they step back
    prevMode = mode;
    // the squire and your helm (great helms come off between courses)
    const sq = men.squire;
    if (sq && present(sq) && mode === 'ready' && !sq.q.length && !serving) {
      if (env.helmOff && !sq.helmP.visible) go(sq, [{ walk: SPOT.stirrup }, { act: 'helm', dur: 0.7, at: 0.8, mid() { sq.helmP.visible = true; } }, { hold: 'helmhold', until: () => !env.helmOff || prevMode !== 'ready', max: 600 },
        { act: 'helm', dur: 0.7, at: 0.5, mid() { sq.helmP.visible = false; } }, home(sq)]);
    }
    // where you are, in the frame of your end (for looking)
    const dx = (env.px - endG.position.x) * (tD > 0 ? 1 : -1), dz = (env.pz - endG.position.z) * (tD > 0 ? 1 : -1); lo = -dx; lf = dz;
    if (gs && gs.active && gs.t < gs.T + 1) {      // the thrown stump: a short arc, tumbling, then it lies flat
      gs.t += dt; const u = Math.max(0, Math.min(1, gs.t / gs.T)), tt = Math.max(0, Math.min(gs.t, gs.T));
      if (!gs.thud && gs.t >= gs.T) { gs.thud = true; if (F.onThud) F.onThud(gs.mesh.getWorldPosition(new THREE.Vector3())); }
      gs.mesh.position.set(-(gs.o0 + (gs.o1 - gs.o0) * u), Math.max(0.05, gs.y0 + gs.vy * tt - 4.905 * tt * tt), gs.f0 + (gs.f1 - gs.f0) * u);
      gs.mesh.rotation.set(gs.spin * (1 - u) * (1 - u), gs.yaw * u, 0);
    }
    for (const a of Object.values(men)) {
      const here = present(a); a.g.visible = here; if (!here) continue;
      a.talkT = Math.max(0, a.talkT - dt);
      runStep(a, dt, env);
      if (a.moving) a.wph += dt * (a.fast ? 11 : 7.5);
      target(a, t);
      const A = a.ang, tg = a.moving ? a.walkYaw : Math.atan2(-(lo - a.o), lf - a.f);
      a.yaw += wrap(tg - a.yaw) * Math.min(1, dt * (a.moving ? 8 : 3));
      const k = 10;
      a.armL.rotation.x = damp(a.armL.rotation.x, A.aL, k, dt); a.armR.rotation.x = damp(a.armR.rotation.x, A.aR, k, dt);
      a.torso.rotation.x = damp(a.torso.rotation.x, A.lean, 6, dt); a.body.position.y = damp(a.body.position.y, -A.drop, 6, dt);
      const sw = a.moving ? Math.sin(a.wph) * A.lg : 0, kn = A.drop > 0.1 ? -1.1 : 0;
      a.legL.rotation.x = damp(a.legL.rotation.x, sw * -1 + kn, 12, dt); a.legR.rotation.x = damp(a.legR.rotation.x, sw + (kn ? 0.2 : 0), 12, dt);
      // idle: shift weight, glance about, look at you now and then
      const lookAt = wrap(Math.atan2(-(lo - a.o), lf - a.f) - a.yaw);
      a.body.rotation.z = a.moving ? 0 : Math.sin(t * 0.5 + a.ph) * 0.035; a.body.position.x = a.moving ? 0 : Math.sin(t * 0.5 + a.ph) * 0.03;
      a.head.rotation.y = damp(a.head.rotation.y, Math.sin(t * 0.37 + a.ph * 2) > 0.2 ? Math.max(-0.9, Math.min(0.9, lookAt)) : Math.sin(t * 0.9 + a.ph) * 0.3, 4, dt);
      a.head.rotation.x = damp(a.head.rotation.x, A.hd, 8, dt);
      if (a.lanceP) a.lanceP.rotation.x = A.lanceW - a.armR.rotation.x;           // keep what he holds at its own angle in the world
      if (a.stump) a.stump.rotation.x = 0.3 - a.armR.rotation.x;
      if (a.banner) a.banner.rotation.x = A.poleW - a.armR.rotation.x;
      a.g.position.set(-a.o, 0, a.f); a.g.rotation.y = a.yaw;
    }
  };
  return F;
}

/** The field of men. scene: the THREE scene. Your crew stands at your end, a squire alone at his. Call setup() at the start of a match, update() every frame. */
export function createField(scene, isLate) {
  const mine = makeSide(scene, isLate), his = makeSide(scene, null);
  const side = (w) => (w === 'opp' ? his : mine);
  return {
    root: mine.root, men: mine.men,
    clear() { mine.clear(); his.clear(); },
    /** opp: { name, arms } to give the opponent a squire at his end (not in practice). */
    setup(retinue, arms, practice, opp) { mine.setup(retinue, arms, practice, true); if (opp && !practice) his.setup({ squire: { name: opp.name || 'squire' } }, opp.arms, true); else his.clear(); },
    begin: (info) => mine.begin(info), talk: (id) => mine.talk(id), head: (id) => mine.head(id), hisHead: (id) => his.head(id),      // (his squire, for his men's jeers: src/crowd_voices.js)
    throwStump: (w) => side(w).throwStump(),
    serve: (broken, swap, w, how, took) => side(w).serve(broken, swap, how, took),
    wave: () => mine.wave(), fitHelm: (s, m) => mine.fitHelm(s, m), cheer: () => mine.cheer(), release: () => mine.release(), where: (id, out) => mine.where(id, out),
    serving: () => mine.serving() || his.serving(),
    /** sound hooks: fn(worldPos) when a thrown stump lands / when the squire's hands reach the rider with the fresh lance */
    set onThud(f) { mine.onThud = his.onThud = f; }, set onHand(f) { mine.onHand = his.onHand = f; },
    /** env: as for one end, plus ox, oz (the opponent in the world). */
    update(dt, env) {
      mine.update(dt, env);
      his.update(dt, env.mode === 'menu' || env.mode === 'replay' ? env : Object.assign({}, env, { tD: -env.tD, px: env.ox, pz: env.oz, helmOff: false }));
    },
  };
}
