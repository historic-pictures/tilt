// Life around the stands: a small band on a platform by the royal box (drum, shawm, lute, bagpipe) and three vendors walking slowly along the front of the stands
// (pies, cat's meat on skewers, hot spiced wine). Cheap meshes in the style of ceremony.js; poses are eased toward targets, there is no animation system.
// The band plays in the intro and between courses, and stops to look when the riders charge. The vendors stop at people, offer their wares, and now and then call out
// (the call goes through opts.call, which main.js sends to the voice director, so it gets a speech label and a robot voice).
// Layout: east side is x > 0. The platform stands where the groundlings leave a gap beside the dais (x 10.1-11.9, z 6.25-9.55), facing the lists (-x).
import * as THREE from 'three';
import { person, mesh, grp } from './ceremony.js';

const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a, b) => a + Math.random() * (b - a);
const pos = (s) => Math.max(0, s);
const SKIN = ['#f0c8a4', '#e0ac84', '#c68e63', '#a8704a', '#f4d6bb'];
const G = {
  platform: new THREE.BoxGeometry(1.8, 0.3, 3.3),
  drum: new THREE.CylinderGeometry(0.2, 0.2, 0.2, 14), stick: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4).translate(0, -0.2, 0),
  shawm: new THREE.CylinderGeometry(0.013, 0.022, 0.62, 6).translate(0, -0.31, 0), shawmBell: new THREE.ConeGeometry(0.06, 0.12, 8).translate(0, -0.64, 0),
  lute: new THREE.SphereGeometry(0.17, 12, 8), neck: new THREE.BoxGeometry(0.045, 0.5, 0.03).translate(0, 0.4, 0), peg: new THREE.BoxGeometry(0.07, 0.1, 0.04).translate(0, 0.68, 0),
  bag: new THREE.SphereGeometry(0.17, 10, 8), drone: new THREE.CylinderGeometry(0.012, 0.018, 0.75, 5).translate(0, 0.37, 0), chanter: new THREE.CylinderGeometry(0.012, 0.02, 0.4, 5).translate(0, -0.2, 0),
  tray: new THREE.BoxGeometry(0.56, 0.04, 0.4), strap: new THREE.BoxGeometry(0.03, 0.55, 0.025), pie: new THREE.CylinderGeometry(0.065, 0.075, 0.05, 8), skewer: new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4).translate(0, 0.25, 0),
  meat: new THREE.SphereGeometry(0.035, 6, 5), jug: new THREE.CylinderGeometry(0.1, 0.14, 0.34, 10).translate(0, -0.1, 0), cup: new THREE.CylinderGeometry(0.035, 0.028, 0.07, 6),
  brim: new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), crown: new THREE.CylinderGeometry(0.11, 0.12, 0.1, 8), cap: new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
};
// the band: where each stands (z on the platform), colours, and the instrument
const BAND = [
  { type: 'drum', z: 6.9, coat: '#8a3a2a', hose: '#2b2622', hat: '#2f5d3c' }, { type: 'shawm', z: 7.6, coat: '#2f5d3c', hose: '#7a2a2a', hat: '#8a3a2a' },
  { type: 'lute', z: 8.3, coat: '#3a4f8a', hose: '#3a2a1c', hat: '#b58b3a' }, { type: 'pipe', z: 9.0, coat: '#7a5a22', hose: '#2f5d3c', hat: '#3a4f8a' },
];
// the vendors: the side of the lists (west -1, east +1), the stretch of z they walk, their wares, and what they cry
export const VENDORS = [
  { type: 'pie', who: 'A PIE-SELLER', side: -1, lo: -32, hi: -3, coat: '#a0613a', hose: '#4e4a40', hat: 'straw', calls: ['Hot pies! Hot mutton pies, a penny apiece!', 'Pies! Kidney and onion, hot from the oven!', 'Fresh pies for the hungry! Hot pies!'] },
  { type: 'meat', who: "THE CAT'S-MEAT MAN", side: 1, lo: 10.8, hi: 32, coat: '#5b4332', hose: '#6b4a32', hat: 'cap', calls: ["Cat's meat! Hot skewers, a farthing each!", 'Meat on a stick! Hot from the fire, good sirs!', "Cat's meat! Penny a skewer, penny a skewer!"] },
  { type: 'wine', who: 'THE WINE-SELLER', side: -1, lo: 3, hi: 32, coat: '#8a1a46', hose: '#3a2a1c', hat: 'brim', calls: ['Hot spiced wine! Warm your bones, good sirs!', 'Wine, hot and spiced! A farthing the cup!', 'Mulled wine for the cold and the thirsty!'] },
];
const LANE = 11.95;      // x of the walk, in front of the stand wall (12.3) and behind the groundlings (11.2-11.7)

/** The band and the vendors. opts.call(text, who, head (Object3D), voiceKey) -> true when the voice director took the line. */
export function createLife(scene, opts = {}) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const Lf = { root, band: [], vendors: [] };
  let t = 0, cool = 0;

  function buildBand() {
    const pf = new THREE.Mesh(G.platform, new THREE.MeshLambertMaterial({ color: '#6b4f30' })); pf.position.set(11.0, 0.15, 7.9); pf.receiveShadow = true; root.add(pf);
    BAND.forEach((c, i) => {
      const p = person(root, { hose: c.hose, coat: c.coat, tab: null, skin: SKIN[(i * 2 + 1) % SKIN.length], hat: c.hat });
      p.g.position.set(11.0, 0.3, c.z); p.g.rotation.y = -Math.PI / 2; p.type = c.type; p.k = 0; p.ph = i * 1.9;
      if (c.type === 'drum') {
        p.prop = grp(p.torso, 0, 0.12, 0.32); p.prop.rotation.x = 0.2; mesh(G.drum, '#a0613a', p.prop); mesh(G.brim, '#e8e0c8', p.prop, 0, 0.1, 0).scale.set(0.95, 1, 0.95);
        mesh(G.stick, '#d8c9a0', grp(p.armL, 0, -0.6, 0)); mesh(G.stick, '#d8c9a0', grp(p.armR, 0, -0.6, 0));
      } else if (c.type === 'shawm') {
        p.prop = grp(p.head, 0, 0.07, 0.13); p.prop.rotation.x = -0.8; mesh(G.shawm, '#3a2a1c', p.prop); mesh(G.shawmBell, '#b58b3a', p.prop);
      } else if (c.type === 'lute') {
        p.prop = grp(p.torso, 0.05, 0.22, 0.28); p.prop.rotation.set(-0.5, 0, 0.75); mesh(G.lute, '#a0613a', p.prop).scale.set(1, 1.2, 0.55); mesh(G.neck, '#3a2a1c', p.prop); mesh(G.peg, '#3a2a1c', p.prop);
      } else {
        p.prop = grp(p.torso, -0.12, 0.3, 0.26); p.bag = mesh(G.bag, '#5b4332', p.prop); p.bag.scale.set(1, 1.1, 0.8);
        for (const [x, z, r] of [[-0.08, -0.02, 0.18], [0.0, -0.05, 0.0], [0.08, -0.02, -0.18]]) { const d = grp(p.prop, x, 0.1, z); d.rotation.z = r; mesh(G.drone, '#3a2a1c', d); }
        mesh(G.chanter, '#d8c9a0', p.prop, 0.1, 0, 0.1);
      }
      Lf.band.push(p);
    });
  }

  function nextStop(v) {       // choose where he stops next: a few metres along, turning back at the end of his stretch
    let z = v.z + v.dir * rnd(4, 9);
    if (z < v.c.lo || z > v.c.hi) { v.dir = -v.dir; z = v.z + v.dir * rnd(4, 9); }
    v.tz = Math.max(v.c.lo, Math.min(v.c.hi, z)); v.st = 'walk';
  }
  function buildVendors() {
    VENDORS.forEach((c, i) => {
      const p = person(root, { hose: c.hose, coat: c.coat, tab: null, skin: SKIN[(i * 3) % SKIN.length], hat: null });
      const hd = p.head;
      if (c.hat === 'straw') { mesh(G.brim, '#cfa95c', hd, 0, 0.2, 0); mesh(G.crown, '#cfa95c', hd, 0, 0.26, 0); }
      else if (c.hat === 'cap') mesh(G.cap, '#6b4a32', hd, 0, 0.14, 0);
      else { mesh(G.brim, '#d8ceb4', hd, 0, 0.19, 0); mesh(G.crown, '#d8ceb4', hd, 0, 0.25, 0); }
      Object.assign(p, { type: c.type, c, side: c.side, z: rnd(c.lo, c.hi), dir: Math.random() < 0.5 ? 1 : -1, st: 'walk', tz: 0, hold: 0, yaw: 0, wph: 0, moving: false, dirNow: 1, nextCall: rnd(6, 14), calls: c.calls, k: 0 });
      if (c.type !== 'wine') {
        const tray = grp(p.torso, 0, 0.15, 0.36); mesh(G.tray, '#6b4f30', tray);
        for (const sx of [-1, 1]) { const s = mesh(G.strap, '#3a2a1c', p.torso, sx * 0.17, 0.4, 0.2); s.rotation.x = 0.5; }
        if (c.type === 'pie') for (let k = 0; k < 6; k++) mesh(G.pie, k % 2 ? '#c8923c' : '#b3782e', tray, -0.18 + (k % 3) * 0.18, 0.045, k < 3 ? -0.08 : 0.08);
        else {
          for (let k = 0; k < 5; k++) { const s = mesh(G.skewer, '#d8c9a0', tray, -0.2 + k * 0.1, 0.02, 0.05); s.rotation.x = 1.45; mesh(G.meat, '#7a3a22', s, 0, 0.12, 0); mesh(G.meat, '#7a3a22', s, 0, 0.2, 0); }
          const hand = grp(p.armR, 0, -0.6, 0); for (let k = -1; k <= 1; k++) { const s = mesh(G.skewer, '#d8c9a0', hand, 0, 0, 0); s.rotation.z = k * 0.2; mesh(G.meat, '#7a3a22', s, 0, 0.3, 0); }
        }
      } else {
        p.jug = grp(p.armR, 0, -0.6, 0); mesh(G.jug, '#8c5a32', p.jug); const cup = grp(p.armL, 0, -0.6, 0); mesh(G.cup, '#c9b27a', cup);
        for (const sx of [-1, 1]) mesh(G.cup, '#c9b27a', p.torso, sx * 0.22, 0.04, 0.2);
      }
      p.g.position.set(c.side * LANE, 0, p.z); Lf.vendors.push(p);
      nextStop(p);
    });
  }

  /** Build for a match (the same band and sellers at every venue). */
  Lf.setup = function setup() { Lf.clear(); buildBand(); buildVendors(); root.visible = true; t = 0; cool = 0; };
  Lf.clear = function clear() { root.clear(); Lf.band = []; Lf.vendors = []; root.visible = false; };

  function band(dt, env) {
    const play = (env.mode === 'intro' || env.mode === 'ready' || env.mode === 'after') && cool <= 0, look = env.mode === 'charge' ? 1 : 0, beat = t * 3.2;
    for (const p of Lf.band) {
      p.k = damp(p.k, play ? 1 : 0, 3, dt); p.look = damp(p.look || 0, look, 3, dt);
      const k = p.k, b = beat + p.ph, rest = [0.06, -0.06];
      let aL = rest[0], aR = rest[1], tx = 0, tz = 0, hx = 0, foot = 0;
      if (p.type === 'drum') { aL = -0.85 - 0.4 * pos(Math.sin(b * 2 + 0.4)); aR = -0.85 - 0.4 * pos(Math.sin(b * 2 + 2.3)); tx = 0.05; hx = 0.06 * Math.sin(b); foot = pos(Math.sin(b * 2)) * 0.2; }
      else if (p.type === 'shawm') { aL = -1.35; aR = -1.5; tz = Math.sin(b * 0.5) * 0.07; tx = -0.03; hx = -0.1 + Math.sin(b * 0.5) * 0.05; p.prop.rotation.x = damp(p.prop.rotation.x, -0.8 + (k > 0.5 ? Math.sin(b * 0.5) * 0.12 : 0.5), 6, dt); }
      else if (p.type === 'lute') { aL = -1.15 + Math.sin(b * 0.7) * 0.1; aR = -0.75 - 0.25 * Math.sin(b * 4); hx = 0.1 * Math.sin(b); tz = Math.sin(b * 0.5) * 0.04; foot = pos(Math.sin(b * 2)) * 0.15; }
      else { aL = -0.5 + 0.1 * Math.sin(b * 0.6); aR = -1.0; tz = Math.sin(b * 0.5) * 0.1; hx = -0.08; p.bag.scale.setScalar(1 + 0.07 * k * Math.sin(b * 0.6)); }
      p.armL.rotation.x = damp(p.armL.rotation.x, lerp(rest[0], aL, k), 10, dt); p.armR.rotation.x = damp(p.armR.rotation.x, lerp(rest[1], aR, k), 10, dt);
      p.torso.rotation.x = damp(p.torso.rotation.x, tx * k, 6, dt); p.torso.rotation.z = damp(p.torso.rotation.z, tz * k, 6, dt);
      p.legR.rotation.x = damp(p.legR.rotation.x, -foot * k, 14, dt);
      p.body.position.y = k * pos(Math.sin(b * 2)) * 0.015;
      // in the charge they stop and turn toward the riders
      const base = -Math.PI / 2, world = Math.atan2(-11, env.focusZ - p.g.position.z), rel = wrap(world - base);
      p.g.rotation.y = base + rel * 0.6 * p.look; p.head.rotation.y = damp(p.head.rotation.y, rel * 0.4 * p.look, 6, dt);
      p.head.rotation.x = damp(p.head.rotation.x, k > 0.5 ? hx : p.look * -0.05, 6, dt);
    }
  }

  function vendors(dt, env) {
    const charge = env.mode === 'charge';
    for (const v of Lf.vendors) {
      v.moving = false;
      if (!charge) {
        if (v.st === 'walk') {
          const dz = v.tz - v.z, d = Math.abs(dz);
          if (d < 0.08) { v.st = 'stop'; v.hold = rnd(3, 6); }
          else { v.z += Math.sign(dz) * Math.min(d, 0.75 * dt); v.moving = true; v.dirNow = Math.sign(dz); }
        } else { v.hold -= dt; if (v.hold <= 0) nextStop(v); }
        if (env.canCall && opts.call) {
          v.nextCall -= dt;
          if (v.nextCall <= 0 && v.st === 'stop' && v.hold > 1.5) v.nextCall = opts.call(v.calls[(Math.random() * v.calls.length) | 0], v.c.who, v.head, v.type) ? rnd(18, 34) : 3;
        }
      }
      if (v.moving) v.wph += dt * 5.5;
      const stopped = v.st === 'stop' && !charge, tgYaw = charge ? v.side * -Math.PI / 2 : v.moving ? (v.dirNow > 0 ? 0 : Math.PI) : v.side * Math.PI / 2;
      v.yaw += wrap(tgYaw - v.yaw) * Math.min(1, dt * 4); v.k = damp(v.k, stopped ? 1 : 0, 4, dt);
      const w = Math.sin(v.wph), o = Math.sin(t * 2 + v.ph) * 0.05, k = v.k;
      let aL, aR;
      if (v.type === 'pie') { aL = lerp(-0.75, -1.0, k) + o; aR = lerp(-0.75, -1.0, k) - o; }
      else if (v.type === 'meat') { aL = lerp(-0.75, -1.0, k); aR = lerp(-2.6, -2.2, k) + Math.sin(t * 2.4 + v.ph) * 0.12 * k; }
      else { aL = lerp(0.1 + w * 0.3, -1.35, k); aR = lerp(-0.35 - w * 0.3, -0.8 + Math.sin(t * 1.5) * 0.1, k); v.jug.rotation.x = lerp(0, -0.5, k); }
      v.legL.rotation.x = damp(v.legL.rotation.x, v.moving ? -w * 0.5 : 0, 12, dt); v.legR.rotation.x = damp(v.legR.rotation.x, v.moving ? w * 0.5 : 0, 12, dt);
      v.armL.rotation.x = damp(v.armL.rotation.x, aL, 8, dt); v.armR.rotation.x = damp(v.armR.rotation.x, aR, 8, dt);
      v.body.position.y = v.moving ? Math.abs(w) * 0.02 : 0;
      v.torso.rotation.x = damp(v.torso.rotation.x, 0.03 * k, 5, dt);
      v.head.rotation.y = damp(v.head.rotation.y, stopped ? Math.sin(t * 0.8 + v.ph) * 0.5 : 0, 3, dt);
      v.g.position.set(v.side * LANE, 0, v.z); v.g.rotation.y = v.yaw;
    }
  }

  /** env: { mode, focusZ (the riders' mean z, where the band looks), canCall (a vendor may cry his wares) }. */
  Lf.update = function update(dt, env) {
    if (!Lf.band.length || env.mode === 'menu') { root.visible = false; return; }
    if (env.mode === 'replay') return;
    root.visible = true; t += dt;
    cool = env.mode === 'charge' ? 2.5 : Math.max(0, cool - dt);      // after the charge they wait a moment before they take up the tune again
    band(dt, env); vendors(dt, env);
  };
  return Lf;
}
