// The judges' table: a small covered stand inside the lists on the royal-box side, at the middle of the barrier. Three judges in robes sit behind a table and a scorer writes beside them.
// After each course they show their verdict with hand flags, one system:
//   the left judge (world -z) watches YOUR stroke, the right judge (world +z) watches HIS; the middle judge speaks for the whole course.
//   a white flag held HIGH = a lance broken (or broken on the helm) · held LEVEL, out over the table = a touch · waved LOW = no touch
//   the middle judge raises a white flag high for an unhorsing, and a RED flag high for a foul (the horse struck, or the barrier).
// Not built on the training ground. Figures are cheap meshes (person() of src/ceremony.js).
import * as THREE from 'three';
import { person, mesh, grp } from './ceremony.js';

const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const STAND_X = 8.7;      // between the barrier and the lists' fence (x = 9.5), at the middle (z = 0); the figures face -x
const G = {
  deck: new THREE.BoxGeometry(3.4, 0.4, 1.5), post: new THREE.BoxGeometry(0.09, 2.2, 0.09).translate(0, 1.1, 0), table: new THREE.BoxGeometry(2.6, 0.07, 0.55), drop: new THREE.BoxGeometry(2.6, 0.62, 0.03),
  roof: new THREE.BoxGeometry(3.7, 0.06, 1.8), strip: new THREE.BoxGeometry(0.62, 0.06, 1.8), val: new THREE.BoxGeometry(0.6, 0.26, 0.03), stool: new THREE.BoxGeometry(0.4, 0.45, 0.35),
  rod: new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5).translate(0, -0.475, 0), cloth: new THREE.PlaneGeometry(0.5, 0.36), book: new THREE.BoxGeometry(0.4, 0.04, 0.3), robe: new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8).translate(0, 0.25, 0),
};
const ROBES = ['#3b2a3a', '#2b3a30', '#5a2a24'];
const LEVEL = { down: 0, wave: 1, level: 2, high: 3 };

export function createJudges(scene) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const J = { root, men: [], scribe: null, t: 0, hold: 0, done: null, on: false };

  /** Build for a venue V (VENUES entry; its tilt colours), or nothing on the training ground. */
  J.setup = function setup(V, training) {
    J.clear(); if (training) return;
    const c1 = V.tilt[0], c2 = V.tilt[1], s = new THREE.Group(); s.position.set(STAND_X, 0, 0); s.rotation.y = -Math.PI / 2; root.add(s);      // local +z faces the lists (world -x), local +x is world +z
    mesh(G.deck, '#6b4f30', s, 0, 0.2, 0).receiveShadow = true;
    for (const [x, z] of [[-1.65, -0.7], [1.65, -0.7], [-1.65, 0.7], [1.65, 0.7]]) mesh(G.post, '#5b4332', s, x, 0.4, z);
    for (let i = 0; i < 6; i++) mesh(G.strip, i % 2 ? c2 : c1, s, -1.55 + i * 0.62, 2.62, 0, true);                      // a striped cloth canopy
    for (let i = 0; i < 6; i++) mesh(G.val, i % 2 ? c2 : c1, s, -1.55 + i * 0.62, 2.43, 0.9, true);                     // with a scalloped fringe at the front
    mesh(G.table, '#7a5a34', s, 0, 1.17, 0.45); mesh(G.drop, c1, s, 0, 0.83, 0.72, true);                               // the table, its cloth hanging in front
    mesh(G.book, '#e8dcc0', s, 1.15, 1.23, 0.45);                                                                          // the scorer's roll
    const seat = (x, robe, hat, scribe) => {
      mesh(G.stool, '#5b4332', s, x, 0.62, -0.25);
      const p = person(s, { hose: '#2a2622', coat: robe, hat }); p.g.position.set(x, 0.07, -0.25); p.g.scale.setScalar(0.96);
      mesh(G.robe, robe, p.torso, 0, -0.35, 0.02).scale.set(1.05, 1, 1.05);
      p.legL.rotation.x = p.legR.rotation.x = -1.35; p.legL.scale.y = p.legR.scale.y = 0.6;                                // seated: thighs forward, hidden under the table
      return p;
    };
    ROBES.forEach((robe, i) => {
      const p = seat(-0.8 + i * 0.8, robe, i === 1 ? '#1a1a1a' : robe);
      p.rodG = grp(p.armR, 0, -0.6, 0);
      p.white = mkFlag(p.rodG, '#f4f0e4'); p.red = mkFlag(p.rodG, '#b2231a'); p.red.visible = false; p.rodG.visible = false;
      p.lv = 0; p.goal = 0; p.k = 0; p.isRed = false; p.at = 0; J.men.push(p);
    });
    const sc = J.scribe = seat(1.35, '#33281e', '#33281e'); sc.g.position.z = 0.05; sc.g.rotation.y = -0.5;                  // the scorer at the end of the table, writing
    J.on = true;
  };
  function mkFlag(parent, col) {
    const g = grp(parent); mesh(G.rod, '#6b4f30', g);
    const c = new THREE.Mesh(G.cloth, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); c.position.set(0, -0.78, -0.27); c.rotation.y = Math.PI / 2; c.castShadow = true; g.add(c); g.cloth = c;
    return g;
  }
  J.clear = function clear() { root.clear(); J.men = []; J.scribe = null; J.hold = 0; J.done = null; J.on = false; root.visible = false; };
  /** Shown from the first course; the intro cameras run through the spot, so it stays hidden then. */
  J.setVisible = (v) => { root.visible = v && J.on; };
  /** Is there a stand at all (not the training ground)? */
  J.has = () => J.on;
  /** Are the flags still being shown (and Hugh's call not yet released)? */
  J.busy = () => J.hold > 0;

  /** Raise the flags. v: { you, him, mid } with each one of 'down' | 'wave' | 'level' | 'high' | 'red' (mid only for red). Held `secs`, then `done()` runs once (Hugh's call). */
  J.show = function show(v, secs = 2.0, done = null) {
    if (!J.on) { if (done) done(); return; }
    const set = (p, lv, i) => { const red = lv === 'red'; p.isRed = red; p.goal = red ? 3 : LEVEL[lv] ?? 0; p.at = i * 0.12; p.red.visible = red; p.white.visible = !red; };
    set(J.men[0], v.you, 0); set(J.men[2], v.him, 1); set(J.men[1], v.mid, 2);
    J.hold = secs; J.t = 0; J.done = done;
  };
  /** Flags down at once (the match ended, a new course began). */
  J.drop = function drop() { J.hold = 0; J.done = null; for (const p of J.men) p.goal = 0; };

  J.update = function update(dt, t) {
    if (!J.on) return;
    if (J.hold > 0) { J.t += dt; J.hold -= dt; if (J.hold <= 0) { J.hold = 0; for (const p of J.men) p.goal = 0; const d = J.done; J.done = null; if (d) d(); } }
    for (const p of J.men) {
      const up = p.goal > 0 && J.t >= p.at, g = up ? p.goal : 0;
      p.k = damp(p.k, g, 9, dt);
      p.rodG.visible = p.k > 0.05;
      // the arm: waved low (1), out level over the table (2), straight up (3)
      const wave = p.goal === 1 ? Math.sin(t * 7 + p.ph) * 0.35 : 0, ang = p.k <= 1 ? -0.3 - 0.9 * p.k : p.k <= 2 ? -1.2 - 0.4 * (p.k - 1) : -1.6 - 1.25 * (p.k - 2);
      p.armR.rotation.x = ang; p.armR.rotation.z = wave; p.torso.rotation.x = -0.04 * p.k;
      const fl = p.isRed ? p.red : p.white; fl.cloth.rotation.x = Math.sin(t * 9 + p.ph) * 0.35 * (p.k > 1.5 ? 1 : 0.4);
      p.head.rotation.x = damp(p.head.rotation.x, p.k > 0.1 ? -0.1 : 0.12, 5, dt);
    }
    for (const p of J.men) p.armL.rotation.x = -0.8;      // the free hand rests on the table
    const sc = J.scribe;
    if (sc) { sc.armR.rotation.x = -1.1 + Math.sin(t * 6.5) * 0.08; sc.armR.rotation.z = Math.sin(t * 3.1) * 0.12; sc.armL.rotation.x = -0.9; sc.torso.rotation.x = 0.3; sc.head.rotation.x = 0.5; }
  };
  return J;
}
