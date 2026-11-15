// The marshal's men with their flags, instead of a "GO!" on screen: at each course each stands a few strides ahead of a rider's mark, off to the side,
// and waves his flag overhead; when both riders have raised their lances and the marshal calls, the flags sweep down together (~0.35 s) and the men
// run for the fence. There they stand watching and turn to follow the riders. On the training ground: one squire, a plain flag.
// Figures are cheap meshes (person() of src/ceremony.js). Positions are exposed: flagmen.men[i].top (world Vector3 of the flag-top), .base, .z; flagmen.farZ(riderZ).
import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { person, mesh, grp } from './ceremony.js';

const SWEEP = 0.35;                                   // seconds of the sharp downward sweep
const RUN_SPEED = 5.2, RUN_AFTER = 0.12;              // m/s to the fence, and the beat after the sweep before he turns and goes
const SPOT_X = 2.4, SPOT_IN = 8, FENCE_X = 8.1;       // where he waves (out from the tilt, metres ahead of the rider's mark), and where he runs to
const POLE = new THREE.CylinderGeometry(0.022, 0.03, 2.8, 6).translate(0, 0.8, 0), KNOB = new THREE.SphereGeometry(0.05, 6, 4);
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const shortAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A flag cloth: a plane with 10 segments along its length, the two colours in vertex colours (top/bottom halves); the wave runs in update(). */
function cloth(c1, c2) {
  const g = new THREE.PlaneGeometry(1.25, 0.8, 10, 4), n = g.attributes.position.count, col = new Float32Array(n * 3), a = new THREE.Color(c1), b = new THREE.Color(c2);
  g.translate(0.625, 0, 0);                           // hoist edge on the pole (x = 0)
  for (let i = 0; i < n; i++) { const c = g.attributes.position.getY(i) > 0 ? a : b; col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.castShadow = true;
  m.base = Float32Array.from(g.attributes.position.array); return m;
}

export function createFlagmen(scene) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const F = { root, men: [], active: false };
  const _v = new THREE.Vector3();

  /** Build for a venue V (VENUES entry; its tilt colours) and whether it is the training ground (one squire, a plain flag). */
  F.setup = function setup(V, training) {
    F.clear();
    const c1 = training ? '#d8d2c0' : V.tilt[0], c2 = training ? '#d8d2c0' : V.tilt[1];
    // each a few strides ahead of a rider's mark, across the tilt from him: in the other rider's lane, where the rider sees him (the player starts at
    // z = -40 on x < 0, the opponent at z = +40 on x > 0). That lane is where the other man will come, so at the signal he runs for the fence.
    const spots = training ? [[1, 39]] : [[1, -40], [-1, 40]];
    for (const [sx, z0] of spots) {
      const x = sx * SPOT_X, z = z0 - Math.sign(z0) * SPOT_IN;
      const p = person(root, { hose: training ? '#5a4a36' : c1, coat: training ? '#7a6a52' : c2, tab: training ? null : c1, hat: training ? '#6b5a40' : c1 });
      p.g.position.set(x, 0, z); p.yaw = Math.atan2(-x, -z * 0.25); p.g.rotation.y = p.yaw;
      p.pole = grp(p.g, 0.3, 1, 0.12); mesh(POLE, '#6b4f30', p.pole); mesh(KNOB, "#d9b23c", p.pole, 0, 2.22, 0);
      p.flag = cloth(c1, c2); p.flag.position.set(0.03, 1.75, 0); p.pole.add(p.flag);
      p.st = 'rest'; p.k = 0.1; p.pit = 0; p.t = 0; p.sweepAt = -1; p.top = new THREE.Vector3(x, 4.2, z); p.base = new THREE.Vector3(x, 0, z); p.z = z; p.amp = 0.3;
      p.home = new THREE.Vector3(x, 0, z); p.run = new THREE.Vector3(sx * FENCE_X, 0, z + Math.sign(z) * 2.5); p.wave = 0; p.stride = 0;
      F.men.push(p);
    }
    root.visible = true; F.active = true;
  };
  F.clear = function clear() { root.clear(); F.men = []; F.active = false; root.visible = false; };
  /** A course is about to start: flags up and held, fluttering. */
  F.raise = () => F.men.forEach((p, i) => { p.st = 'up'; p.t = 0; p.delay = i * 0.12; p.g.position.copy(p.home); p.stride = 0; });
  /** The marshal's signal: both flags sweep down together. */
  F.sweep = () => F.men.forEach((p) => { if (p.st === 'up' || p.st === 'rest') { p.st = 'sweep'; p.t = 0; } });
  /** World z of the man at the far end from a rider at z (for the camera / intro). */
  F.farZ = (z) => { let b = null; for (const p of F.men) if (!b || Math.abs(p.z - z) > Math.abs(b.z - z)) b = p; return b ? b.z : 0; };

  /** riders: world positions (player, opponent; either may be null). */
  F.update = function update(dt, t, riders) {
    if (!F.active) return;
    for (const p of F.men) {
      p.t += dt;
      let kT = 0.1, pitT = 0, rate = 5, amp = 0.28;
      let waveT = 0;
      if (p.st === 'up') { if (p.t < (p.delay || 0)) { kT = 0.1; } else { kT = 1; pitT = -0.06; rate = 4; amp = 1.4; waveT = 1; } }
      else if (p.st === 'sweep') {                                       // sharp: ease-in so the flag whips down and forward
        const e = clamp(p.t / SWEEP, 0, 1), s = e * e * (3 - 2 * e);
        p.k = lerp(1, 0.3, s); p.pit = lerp(-0.06, 1.25, s); amp = 1.3;
        if (e >= 1) { p.st = 'run'; p.t = 0; }
      } else if (p.st === 'run') {                                         // a beat, then he turns and runs for the fence with the flag trailing
        kT = 0.25; pitT = p.t < RUN_AFTER ? 1.25 : 0.5; rate = 6; amp = 1.1;
        if (p.t > RUN_AFTER) {
          _v.subVectors(p.run, p.g.position); _v.y = 0; const d = _v.length(), step = Math.min(d, RUN_SPEED * dt);
          if (d > 0.05) { p.g.position.addScaledVector(_v.normalize(), step); p.stride += dt * 11; } else { p.st = 'low'; p.t = 0.4; }
        }
      } else if (p.st === 'low') { kT = 0.08; pitT = p.t < 0.35 ? 1.25 : 0; rate = p.t < 0.35 ? 8 : 2.2; amp = 0.5; }
      p.wave = damp(p.wave, waveT, 6, dt);
      if (p.st !== 'sweep') { p.k = damp(p.k, kT, rate, dt); p.pit = damp(p.pit, pitT, rate, dt); }
      p.amp = damp(p.amp, amp, 5, dt);
      // pose: arms and pole follow k (raised) and pit (pitch forward)
      const a = -0.3 - 2.5 * p.k - p.pit * 0.4;
      p.armR.rotation.x = a; p.armL.rotation.x = a * 0.8; p.armL.rotation.z = 0.1; p.torso.rotation.x = -0.05 * p.k + 0.12 * p.pit;
      p.pole.position.set(0.3, lerp(0.75, 1.75, p.k), 0.12 + 0.35 * p.pit); p.pole.rotation.x = p.pit;
      // waving: the flag swings over his head from side to side, his arms and body going with it
      const sw = Math.sin(t * 6.6 + p.ph) * p.wave;
      p.pole.rotation.z = sw * 0.95; p.armR.rotation.z = -sw * 0.5; p.armL.rotation.z = 0.1 - sw * 0.4; p.torso.rotation.z = sw * 0.08;
      // running: legs and arms in stride, leaning in
      const running = p.st === 'run' && p.t > RUN_AFTER, lg = running ? Math.sin(p.stride) * 0.85 : 0;
      p.legL.rotation.x = lg; p.legR.rotation.x = -lg; if (running) { p.armL.rotation.x = -lg * 0.7; p.body.rotation.x = 0.22; p.body.position.y = Math.abs(Math.cos(p.stride)) * 0.06; } else { p.body.rotation.x = damp(p.body.rotation.x, 0, 8, dt); p.body.position.y = 0; }
      // follow the riders once the course is under way (the nearer one), otherwise face the lists' centre
      let yawT = Math.atan2(-p.g.position.x, -p.g.position.z * 0.25);      // face the middle of the lists, half turned to the riders
      if (p.st === 'run' && p.t > RUN_AFTER) yawT = Math.atan2(p.run.x - p.g.position.x, p.run.z - p.g.position.z);
      else if (p.st === 'low' && riders) {
        let best = null, bd = 1e9; for (const r of riders) if (r) { const d = Math.abs(r.z - p.z); if (d < bd) { bd = d; best = r; } }
        if (best) yawT = Math.atan2(best.x - p.g.position.x, best.z - p.g.position.z);
      }
      p.yaw = p.yaw + shortAng(yawT - p.yaw) * (1 - Math.exp(-(p.st === 'low' ? 5 : p.st === 'run' ? 10 : 3) * dt)); p.g.rotation.y = p.yaw; p.base.copy(p.g.position);
      p.head.rotation.x = p.st === 'up' ? -0.15 : 0;
      // the flag cloth: a sine wave travelling along it, growing away from the pole
      const pos = p.flag.geometry.attributes.position, base = p.flag.base, ph = t * 7 + p.ph;
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3], w = x / 1.25; pos.setZ(i, Math.sin(x * 4.5 - ph) * 0.09 * w * p.amp); pos.setY(i, base[i * 3 + 1] - 0.14 * w * (1 - p.k) * (1 - p.amp * 0.3) - Math.abs(Math.sin(x * 3 - ph)) * 0.02 * w); }
      pos.needsUpdate = true;
      p.g.updateMatrixWorld(true); p.flag.getWorldPosition(p.top); p.top.y += 0.35;
    }
  };
  return F;
}
