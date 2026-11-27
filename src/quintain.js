import * as THREE from 'three';
import { limb, box, ball, armsTexture } from './util.js';
import { QUINTAIN } from './data.js';

/**
 * The quintain: a pivoting target with a sandbag on the other end of the arm. Strike the shield and ride on
 * briskly, or the bag swings round and catches you: the bag's arm is long enough to come over the tilt and across
 * your lane half a turn after the stroke, and the game tests the bag against your body as it passes (see main.js). Duck-types the parts of Jouster that the
 * match loop touches, so it can stand in as the "opponent" in tiltyard practice.
 */
export class Quintain {
  constructor(scene, x, z) {
    this.scene = scene; this.dir = -1; this.lanceLower = 0; this.brace = 0; this.unhorsed = false; this.lanceBroken = true;
    this.hs = 1; this.seatY = 1.7; this.bob = 0; this.phase = 0; this.agit = 0;
    this.horseDef = { mass: 1, top: 1, accel: 1, name: 'Quintain' }; this.armourDef = { protection: 1, weight: 1 };
    this.spin = 0; this.ang = 0; this.base = 0; this.guard = 0; this.look = 0; this.lane = Math.abs(x);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4c2c, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.9, roughness: 0.5 });
    const sack = new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 1 });
    const root = this.root = new THREE.Group(); root.position.set(x + 0.75, 0, z); scene.add(root);
    root.add(limb([0, 0, 0], [0, 2.2, 0], 0.11, 0.085, wood, 10));
    root.add(box([0, 0.06, 0], [0.9, 0.12, 0.2], wood)); root.add(box([0, 0.06, 0], [0.2, 0.12, 0.9], wood));
    for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2), s = Math.sin(a * Math.PI / 2); root.add(limb([c * 0.42, 0.1, s * 0.42], [0, 0.85, 0], 0.035, 0.035, wood, 6)); }
    const arm = this.arm = new THREE.Group(); arm.position.y = 2.1; root.add(arm);
    arm.add(limb([-0.8, 0, 0], [QUINTAIN.bagArm + 0.05, 0, 0], 0.05, 0.04, wood, 8));
    arm.add(limb([0, 0.55, 0], [QUINTAIN.bagArm * 0.8, 0.02, 0], 0.012, 0.012, iron, 5));   // a stay from the mast, as on a crane
    root.add(limb([0, 2.2, 0], [0, 2.7, 0], 0.07, 0.05, wood, 8));
    arm.add(ball([0, 0.04, 0], 0.07, iron));
    // painted target board (a Saracen's shield, as the manuals have it)
    const tex = armsTexture({ c1: '#a81e1e', c2: '#ece8dc', c3: '#e0b83c', pattern: 'quarterly', charge: 'roundel' }, 256, 256);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.05), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })]);
    board.position.set(-0.75, -0.08, 0); board.castShadow = true; arm.add(board);
    // sandbag on a chain
    const bag = this.bag = new THREE.Group(); bag.position.set(QUINTAIN.bagArm, 0, 0); arm.add(bag);
    bag.add(limb([0, 0, 0], [0, -QUINTAIN.bagDrop + 0.2, 0], 0.012, 0.012, iron, 5));
    bag.add(ball([0, -QUINTAIN.bagDrop, 0], 0.2, sack, [1, 1.35, 1]));
    this.bagMark = new THREE.Object3D(); this.bagMark.position.set(0, -QUINTAIN.bagDrop, 0); bag.add(this.bagMark);
    const mk = (parent, p, r, name) => { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); return { o, r, name }; };
    this.zones = [mk(arm, [-0.75, -0.08, 0], 0.25, 'shield')];
    this.helm = new THREE.Object3D(); this.rider = this.root;
  }
  get z() { return this.root.position.z; }
  get speed() { return 0; } set speed(v) { /* fixed target */ }
  setPose() { this.spin = 0; this.ang = 0; this.arm.rotation.y = this.base; this.root.updateMatrixWorld(true); }
  fresh() { this.spin = 0; this.ang = 0; }
  face() {}
  /** Stand on the far side of the tilt from a rider travelling in direction d, target facing him. */
  setSide(d) { this.root.position.x = d * (this.lane + 0.75); this.base = d > 0 ? 0 : Math.PI; this.spin = 0; this.ang = 0; this.arm.rotation.y = this.base; this.root.updateMatrixWorld(true); }
  snapshot() { return { ang: this.ang, spin: this.spin, px: this.root.position.x, base: this.base }; }
  applySnap(s) { this.ang = s.ang; this.root.position.x = s.px; this.base = s.base; this.arm.rotation.y = this.base + this.ang; this.bag.rotation.z = Math.min(1.1, Math.abs(s.spin) * 0.07); this.root.updateMatrixWorld(true); }
  setAim() {} applyLance() {} liftStep() {} lanceOver() {} breakLance() { return null; } unhorse() {}
  tipWorld(out) { return out.set(999, -50, 999); }
  gripWorld(out) { return this.root.getWorldPosition(out); }
  zoneWorld(name, out) { return this.zones[0].o.getWorldPosition(out); }
  /** power: how full the stroke was (1 = a lance broken square). */
  hit(power) { this.spin = QUINTAIN.spin + QUINTAIN.spinPerPower * Math.max(0, Math.min(1.3, power)); }
  /** Where the sandbag is now. */
  bagWorld(out) { return this.bagMark.getWorldPosition(out); }
  update(dt) {
    if (this.replaying) return;
    this.ang += this.spin * dt; this.spin *= Math.exp(-QUINTAIN.drag * dt);
    if (Math.abs(this.spin) < 0.6) { // settle back to face the lane
      const target = Math.round(this.ang / (Math.PI * 2)) * Math.PI * 2;
      this.ang += (target - this.ang) * (1 - Math.exp(-2.5 * dt)); this.spin *= Math.exp(-3 * dt);
    }
    this.arm.rotation.y = this.base + this.ang;
    this.bag.rotation.z = Math.min(1.1, Math.abs(this.spin) * 0.07);   // bag flies outward as it spins
    this.root.updateMatrixWorld(true);
  }
}
