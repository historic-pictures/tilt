// The judges' table: a small covered stand inside the lists on the royal-box side, at the middle of the barrier. Three judges in robes sit behind a table and a scorer writes beside them.
// After each course they show their verdict with hand flags, one system:
//   the left judge (world -z) watches YOUR stroke, the right judge (world +z) watches HIS; the middle judge speaks for the whole course.
//   a white flag held HIGH = a lance broken (or broken on the helm) · held LEVEL, out over the table = a touch · waved LOW = no touch
//   the middle judge raises a white flag high for an unhorsing, and a RED flag high for a foul (the horse struck, or the barrier).
// Not built on the training ground. Figures are cheap meshes (person() of src/ceremony.js).
import * as THREE from 'three';
import { LISTS } from './lists.js';
import { person, mesh, grp } from './ceremony.js';

const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const STAND_X = 8.7;      // between the barrier and the lists' fence (x = 9.5), at the middle (z = 0); the figures face -x
const G = {
  deck: new THREE.BoxGeometry(3.4, 0.4, 1.5), post: new THREE.BoxGeometry(0.09, 2.2, 0.09).translate(0, 1.1, 0), table: new THREE.BoxGeometry(2.6, 0.07, 0.55), drop: new THREE.BoxGeometry(2.6, 0.62, 0.03),
  roof: new THREE.BoxGeometry(3.7, 0.06, 1.8), strip: new THREE.BoxGeometry(0.62, 0.06, 1.8), val: new THREE.BoxGeometry(0.6, 0.26, 0.03), stool: new THREE.BoxGeometry(0.4, 0.45, 0.35),
  rod: new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5).translate(0, -0.475, 0), baton: new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6).translate(0, -0.3, 0), cloth: new THREE.PlaneGeometry(0.5, 0.36), book: new THREE.BoxGeometry(0.4, 0.04, 0.3), robe: new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8).translate(0, 0.25, 0),
};
const ROBES = ['#3b2a3a', '#2b3a30', '#5a2a24'];
const LEVEL = { down: 0, wave: 1, level: 2, high: 3 };

export function createJudges(scene) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const J = { root, men: [], scribe: null, t: 0, hold: 0, lead: 0, done: null, on: false, an: null };

  /** Build for a venue V (VENUES entry; its tilt colours), or nothing on the training ground. */
  J.setup = function setup(V, training) {
    J.clear(); if (training) return;
    const c1 = V.tilt[0], c2 = V.tilt[1], s = new THREE.Group(); s.position.set(STAND_X, 0, 0); s.rotation.y = -Math.PI / 2; root.add(s);      // local +z faces the lists (world -x), local +x is world +z
    // the stand itself: the modelled one (src/lists.js, 'judges_stand') stands on this spot when it has loaded; these boxes are then hidden
    const old = (m) => { m.userData.cheapList = true; m.visible = !LISTS.on; return m; };
    old(mesh(G.deck, '#6b4f30', s, 0, 0.2, 0)).receiveShadow = true;
    for (const [x, z] of [[-1.65, -0.7], [1.65, -0.7], [-1.65, 0.7], [1.65, 0.7]]) old(mesh(G.post, '#5b4332', s, x, 0.4, z));
    for (let i = 0; i < 6; i++) old(mesh(G.strip, i % 2 ? c2 : c1, s, -1.55 + i * 0.62, 2.62, 0, true));                      // a striped cloth canopy
    for (let i = 0; i < 6; i++) old(mesh(G.val, i % 2 ? c2 : c1, s, -1.55 + i * 0.62, 2.43, 0.9, true));                     // with a scalloped fringe at the front
    old(mesh(G.table, '#7a5a34', s, 0, 1.17, 0.45)); old(mesh(G.drop, c1, s, 0, 0.83, 0.72, true));                               // the table, its cloth hanging in front
    mesh(G.book, '#e8dcc0', s, 1.15, 1.23, 0.45);                                                                          // the scorer's roll
    const seat = (x, robe, hat, scribe) => {
      old(mesh(G.stool, '#5b4332', s, x, 0.62, -0.25));
      const p = person(s, { close: true, hose: '#2a2622', coat: robe, hat, garb: 'cotehardie', sleeve: 'sleeve_fur', fat: scribe ? -0.2 : 0.35 + 0.3 * ((x * 7.3) % 1 + 1) % 1, face: scribe ? 'm_young' : ['m_old', 'm_fat', 'm_fullbeard'][Math.abs(Math.round(x * 5)) % 3], hair: scribe ? '#4a3524' : '#9a958c' }); p.g.position.set(x, 0.07, -0.25); p.g.scale.setScalar(0.96);
      mesh(G.robe, robe, p.torso, 0, -0.35, 0.02).scale.set(1.05, 1, 1.05);
      p.legL.rotation.x = p.legR.rotation.x = -1.35; p.legL.scale.y = p.legR.scale.y = 0.6;                                // seated: thighs forward, hidden under the table
      return p;
    };
    ROBES.forEach((robe, i) => {
      const p = seat(-0.8 + i * 0.8, robe, i === 1 ? '#1a1a1a' : robe);
      p.rodG = grp(p.armR, 0, -0.6, 0);
      p.white = mkFlag(p.rodG, '#f4f0e4'); p.red = mkFlag(p.rodG, '#b2231a'); p.red.visible = false; p.rodG.visible = false;
      p.baton = mesh(G.baton, '#e8dcc0', grp(p.armL, 0, -0.6, 0)); p.baton.parent.visible = false;      // the middle judge's white baton (the verdict)
      p.hy = 0; p.hx = 0; p.lean = 0; p.ak = 0; p.lv = 0; p.goal = 0; p.k = 0; p.isRed = false; p.at = 0; J.men.push(p);
    });
    const sc = J.scribe = seat(1.35, '#33281e', '#33281e'); sc.g.position.z = 0.05; sc.g.rotation.y = -0.5;                  // the scorer at the end of the table, writing
    J.on = true;
  };
  function mkFlag(parent, col) {
    const g = grp(parent); mesh(G.rod, '#6b4f30', g);
    const c = new THREE.Mesh(G.cloth, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); c.position.set(0, -0.78, -0.27); c.rotation.y = Math.PI / 2; c.castShadow = true; g.add(c); g.cloth = c;
    return g;
  }
  /** World positions of the three judges' heads and the scorer's (for the camera's occlusion check). */
  J.heads = () => { const out = []; for (const p of J.men.concat(J.scribe ? [J.scribe] : [])) { const v = new THREE.Vector3(); p.head.getWorldPosition(v); v.y += 0.1; out.push(v); } return out.slice(0, 3); };
  J.clear = function clear() { root.clear(); J.men = []; J.scribe = null; J.hold = 0; J.lead = 0; J.an = null; J.done = null; J.on = false; root.visible = false; };
  /** Shown from the first course; the intro cameras run through the spot, so it stays hidden then. */
  J.setVisible = (v) => { root.visible = v && J.on; };
  /** Is there a stand at all (not the training ground)? */
  J.has = () => J.on;
  /** Are the flags still being shown (and Hugh's call not yet released)? */
  J.busy = () => J.hold > 0;

  /** Raise the flags. v: { you, him, mid } with each one of 'down' | 'wave' | 'level' | 'high' | 'red' (mid only for red). Held `secs`, then `done()` runs once (Hugh's call). */
  J.show = function show(v, secs = 2.0, done = null, lead = 0) {
    if (!J.on) { if (done) done(); return; }
    const set = (p, lv, i) => { const red = lv === 'red'; p.isRed = red; p.goal = red ? 3 : LEVEL[lv] ?? 0; p.at = i * 0.12; p.red.visible = red; p.white.visible = !red; };
    set(J.men[0], v.you, 0); set(J.men[2], v.him, 1); set(J.men[1], v.mid, 2);
    J.lead = lead; J.hold = secs + lead; J.t = 0; J.done = done;
    if (lead > 0) J.act('confer', lead + 0.6);      // they put their heads together while the scorer writes; then the flags go up
    else J.act('nod', 1.0);
  };
  /** A small animation of the box: 'confer' (heads together, the scorer writes), 'nod' (the three nod the flags up), 'verdict' (the middle judge stands the baton up, the others nod), 'write' (the scorer writes hard). */
  J.act = function act(kind, secs = 2) { if (J.on) J.an = { kind, t: 0, dur: secs }; };
  /** Cut the wait short (the viewer skipped): flags go up now. */
  J.rush = function rush() { if (J.lead > 0) { J.hold = Math.max(0.5, J.hold - J.lead); J.lead = 0; J.t = Math.max(J.t, 0); } if (J.an) J.an.t = J.an.dur; };
  /** Camera for a shot of the box: 'box' (medium of all four, across the lists), 'mid' (close on the middle judge), 'roll' (the scorer and his roll). u 0..1 along the shot. Writes want/look, returns fov. */
  J.cam = function cam(id, u, want, look) {
    if (id === 'mid') { want.set(7.0, 1.25, -0.35 + 0.25 * u); look.set(8.95, 1.52, 0.0); return 31; }      // close: 2.5 m from the table, below their eyes looking up, two or three judges across the frame
    if (id === 'roll') { want.set(6.6, 1.95, 2.3 - 0.3 * u); look.set(8.6, 1.35, 1.35); return 26; }
    if (id === 'wide') { want.set(2.8, 1.95, -1.0 + u * 1.3); look.set(8.7, 2.15, 0); return 38; }
    want.set(5.9 + 0.4 * u, 1.28, -0.2 + 0.3 * u); look.set(8.8, 1.6, 0.3); return 40;      // medium: all four across the lists, nothing between the lens and the table      // 'box'
  };
  /** Flags down at once (the match ended, a new course began). */
  J.drop = function drop() { J.hold = 0; J.lead = 0; J.an = null; J.done = null; for (const p of J.men) p.goal = 0; };

  J.update = function update(dt, t) {
    if (!J.on) return;
    if (J.hold > 0) { J.t += dt; J.hold -= dt; if (J.hold <= 0) { J.hold = 0; for (const p of J.men) p.goal = 0; const d = J.done; J.done = null; if (d) d(); } }
    for (const p of J.men) {
      const up = p.goal > 0 && J.t >= p.at + J.lead, g = up ? p.goal : 0;
      p.k = damp(p.k, g, 9, dt);
      p.rodG.visible = p.k > 0.05;
      // the arm: waved low (1), out level over the table (2), straight up (3)
      const wave = p.goal === 1 ? Math.sin(t * 7 + p.ph) * 0.35 : 0, ang = p.k <= 1 ? -0.3 - 0.9 * p.k : p.k <= 2 ? -1.2 - 0.4 * (p.k - 1) : -1.6 - 1.25 * (p.k - 2);
      p.armR.rotation.x = ang; p.armR.rotation.z = wave; p.torso.rotation.x = -0.04 * p.k;
      const fl = p.isRed ? p.red : p.white; fl.cloth.rotation.x = Math.sin(t * 9 + p.ph) * 0.35 * (p.k > 1.5 ? 1 : 0.4);
      p.head.rotation.x = damp(p.head.rotation.x, p.k > 0.1 ? -0.1 : 0.12, 3, dt);
    }
    const an = J.an; let e = 0, kind = '', tt = 0;
    const sm = (x) => x * x * (3 - 2 * x);      // no snapping: every gesture eases in and out over most of a second
    if (an) { an.t += dt; if (an.t >= an.dur) J.an = null; else { kind = an.kind; tt = an.t; e = sm(Math.max(0, Math.min(1, an.t / 0.9, (an.dur - an.t) / 1.0))); } }
    const hy = [0, 0, 0], hx = [0, 0, 0], lean = [0, 0, 0], lz = [0, 0, 0], ty = [0, 0, 0]; let scribeHard = 0, baton = 0, sUp = 0;
    // the table is calm: now and then one judge leans toward his neighbour as if talking, a small lean and a slight turn of the head, one pair at a time, with long pauses; the scorer mostly writes
    const I = J.idle || (J.idle = { next: 2.5, pair: null, t: 0, dur: 0, last: -1 });
    I.next -= dt;
    if (I.pair) { I.t += dt; if (I.t >= I.dur) { I.pair = null; I.next = 4 + Math.random() * 5; } }
    else if (I.next <= 0 && !kind && J.hold <= 0) { const opts = [[0, 1], [1, 0], [1, 2], [2, 1], [2, 3]].filter(q => q[0] !== I.last); I.pair = opts[Math.floor(Math.random() * opts.length)]; I.last = I.pair[0]; I.t = 0; I.dur = 3.2 + Math.random() * 2.2; }
    if (I.pair && !kind) {
      const w = sm(Math.max(0, Math.min(1, I.t / 1.2, (I.dur - I.t) / 1.4))), [i, j] = I.pair, dir = Math.sign(j - i) || 1, sway = 0.6 + 0.4 * Math.sin(I.t * 1.3);
      if (i < 3) { hy[i] = dir * 0.2 * w; lz[i] = -dir * 0.06 * w * sway; ty[i] = dir * 0.1 * w; lean[i] = 0.05 * w; }
      if (j < 3) { hy[j] = -dir * 0.12 * w; lz[j] = dir * 0.025 * w; lean[j] = 0.02 * w; } else sUp = w;      // (the scorer glances up)
    }
    if (kind === 'confer') { hy[0] = 0.28 * e; hy[2] = -0.28 * e; hy[1] = Math.sin(tt * 0.8) * 0.28 * e; lean[0] = lean[1] = lean[2] = 0.08 * e; lz[0] = -0.04 * e; lz[2] = 0.04 * e; hx[1] = Math.sin(tt * 1.6) * 0.03 * e; scribeHard = e; }
    else if (kind === 'nod') { hx[0] = hx[1] = hx[2] = Math.sin(tt * 3.2) * 0.05 * e; }
    else if (kind === 'write') scribeHard = e;
    else if (kind === 'verdict') { baton = e; hx[1] = Math.sin(tt * 3) * 0.04 * e; hx[0] = Math.sin(tt * 2.8 + 1) * 0.04 * e; hx[2] = Math.sin(tt * 2.8 + 2) * 0.04 * e; lean[1] = -0.06 * e; scribeHard = e * 0.6; }
    J.men.forEach((p, i) => {
      p.hy = damp(p.hy, hy[i], 2.4, dt); p.lean = damp(p.lean, lean[i], 2.4, dt); p.hx = damp(p.hx, hx[i], 3.5, dt); p.lz = damp(p.lz || 0, lz[i], 2.2, dt); p.ty = damp(p.ty || 0, ty[i], 2.2, dt);
      p.ak = i === 1 ? damp(p.ak, baton, 8, dt) : 0;
      p.head.rotation.y = p.hy; p.head.rotation.x += p.hx; p.torso.rotation.x += p.lean; p.torso.rotation.z = p.lz; p.torso.rotation.y = p.ty;
      p.armL.rotation.x = p.ak > 0.02 ? -0.8 - 1.9 * p.ak : -0.8;      // the free hand rests on the table; the middle judge's goes up with the baton
      p.baton.parent.visible = p.ak > 0.05;
    });
    J.sUp = damp(J.sUp || 0, sUp, 2.2, dt);
    const sc = J.scribe;
    if (sc) { const w = 6.5 + 7 * scribeHard; sc.armR.rotation.x = -1.1 + Math.sin(t * w) * (0.08 + 0.07 * scribeHard); sc.armR.rotation.z = Math.sin(t * 3.1) * (0.12 + 0.1 * scribeHard); sc.armL.rotation.x = -0.9; sc.torso.rotation.x = 0.3 + 0.12 * scribeHard; sc.head.rotation.x = 0.5 - (kind === 'confer' ? 0.2 * Math.max(0, Math.sin(tt * 0.8)) * e : 0) - 0.25 * J.sUp; }
  };
  return J;
}
