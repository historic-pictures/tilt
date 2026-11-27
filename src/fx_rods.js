import * as THREE from 'three';

// Splinters, the fore part of a broken lance and the coronel crown: small rigid rods thrown by fx.lanceBurst (src/fx.js).

/** A small seeded random stream: the same seed throws the same splinters again (the replay shows exactly what the live blow threw). */
export function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Everything is built along +z about its own middle (z -0.5 .. 0.5) so a body spins about its centre.
// aMask: 1 = the lance's paint, 0 = the pale inner wood, -1 = steel.   aPaint (per instance): the paint colour.
function addTri(pos, msk, a, b, c, ma, mb, mc) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); msk.push(ma, mb, mc); }
function finish(pos, msk, stripes) {
  const g = new THREE.BufferGeometry();
  if (stripes) {      // aSt = (1 + turn, along 0..1): the lance's spiral on the round fore part (x < 0.5 = no spiral); the turn is kept continuous inside each triangle
    const st = new Float32Array(pos.length / 3 * 2);
    for (let v = 0; v < pos.length; v += 9) {
      const u = [0, 1, 2].map(k => Math.atan2(pos[v + k * 3 + 1], pos[v + k * 3]) / (Math.PI * 2) + 0.5);
      if (Math.max(...u) - Math.min(...u) > 0.5) for (let k = 0; k < 3; k++) if (u[k] < 0.5) u[k] += 1;
      for (let k = 0; k < 3; k++) { st[(v / 3 + k) * 2] = 1 + u[k]; st[(v / 3 + k) * 2 + 1] = pos[v + k * 3 + 2]; }
    }
    g.setAttribute('aSt', new THREE.Float32BufferAttribute(st, 2));
  }
  for (let i = 2; i < pos.length; i += 3) pos[i] -= 0.5;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aMask', new THREE.Float32BufferAttribute(msk, 1)); g.computeVertexNormals();
  return g;
}
/** A thin tapered prism: wide painted face on +y, a jagged broken end at z = -0.5 with a lip of wood standing out, a narrow end at z = +0.5. Scale (width, thickness, length). */
export function splinterGeo() {
  const pos = [], msk = [], jag = [0, 0.15, 0.04, 0.26], tip = 0.14, c = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const B = c.map((q, i) => [q[0], q[1], jag[i]]), T = c.map(q => [q[0] * tip, q[1] * tip, 1]), apex = [0.08, -0.12, -0.14];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, m = i === 2 ? 1 : 0;      // side 2 (corners 2-3) is the +y face
    addTri(pos, msk, B[i], B[j], T[j], m, m, m); addTri(pos, msk, B[i], T[j], T[i], m, m, m);
    addTri(pos, msk, apex, B[j], B[i], 0, 0, 0);
  }
  addTri(pos, msk, T[0], T[2], T[1], 0, 0, 0); addTri(pos, msk, T[0], T[3], T[2], 0, 0, 0);
  return finish(pos, msk);
}
/** The fore part of a lance: a tapered round shaft (radius 1 at the break, 0.6 at the cut-off end), a jagged broken rear end. Scale (r0, r0, length). */
export function foreGeo() {
  const pos = [], msk = [], N = 14, rings = [[0, 0], [0.07, 1], [0.08, 1], [1, 1]], rad = (z) => 1 - 0.4 * z;
  const pt = (k, i) => {
    const th = i / N * Math.PI * 2, r = rad(rings[k][0]); let z = rings[k][0];
    let rr = r;
    if (k === 0) { const h = [0.03, 0.24, 0.06, 0.15, 0.02, 0.28, 0.07, 0.18, 0.04, 0.2, 0.05, 0.13, 0.02, 0.22][i % N]; z = -h; rr = r * (1 - 0.7 * Math.min(1, h / 0.28)); }      // the torn break: long fibres standing out of the end, thinning to a point
    return [Math.cos(th) * rr, Math.sin(th) * rr, z];
  };
  for (let k = 0; k < 3; k++) for (let i = 0; i < N; i++) {
    const a = pt(k, i), b = pt(k, i + 1), c = pt(k + 1, i + 1), d = pt(k + 1, i), m0 = rings[k][1], m1 = rings[k + 1][1];
    addTri(pos, msk, a, b, c, m0, m0, m1); addTri(pos, msk, a, c, d, m0, m1, m1);
  }
  for (let i = 0; i < N; i++) { addTri(pos, msk, [0, 0, 0.04], pt(0, i + 1), pt(0, i), 0, 0, 0); addTri(pos, msk, [0, 0, 1], pt(3, i), pt(3, i + 1), 0, 0, 0); }
  return finish(pos, msk, true);
}
/** The crown of a coronel (the three-pronged head), about 0.12 m long: scale 1 = that size. */
export function crownGeo() {
  const pts = [[0.022, 0], [0.032, 0.02], [0.042, 0.05], [0.043, 0.09], [0.03, 0.11], [0.001, 0.12]];
  const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 10); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.06);
  g.setAttribute('aMask', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(-1), 1));
  return g;
}
export function pieceMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aPaint; attribute float aMask; varying vec3 vPaint; varying float vMask;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint; vMask = aMask;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPaint; varying float vMask;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(mix(vec3(0.80, 0.66, 0.44), vPaint, clamp(vMask, 0.0, 1.0)), vec3(0.2, 0.21, 0.24), clamp(-vMask, 0.0, 1.0));');
  };
  return m;
}
const _z = new THREE.Vector3(0, 0, 1);

/**
 * A pool of small rigid bodies (rods). Each is a thin rod of length sc.z with a contact point at each end: gravity, a bounce, the sand's friction and a spin that
 * comes from where it lands. When one is nearly still it settles flat (painted face up) and sleeps: it then costs nothing, and lies on the sand until its `life`
 * is nearly spent, when it shrinks away over `fade` seconds. A body can also be held (the crown stays with the struck helm) and then thrown.
 */
export class Rods {
  constructor(scene, geo, mat, max, fx) {
    this.fx = fx; this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.paint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); geo.setAttribute('aPaint', this.paint);
    this.paint2 = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); geo.setAttribute('aPaint2', this.paint2);
    this.b = [];
    for (let i = 0; i < max; i++) this.b.push({ i, life: 0, age: 0, sleep: true, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), sc: new THREE.Vector3(1, 1, 1), rad: 0.01, e: 0.25, mu: 0.6, still: 0, hold: 0, hv: new THREE.Vector3(), launch: null, fade: 4, hit: 0, prevX: 0 });
    this.cursor = 0; this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.zero);
    this.dirty = true; this.m = new THREE.Matrix4(); this.q2 = new THREE.Quaternion(); this.r = new THREE.Vector3(); this.ax = new THREE.Vector3(); this.t = new THREE.Vector3(); this.vp = new THREE.Vector3(); this.rn = new THREE.Vector3(); this.u = new THREE.Vector3();
    scene.add(this.mesh);
  }
  /** A new body (the oldest is reused when the pool is full). Returns it; the caller sets v, w and the rest. */
  spawn(p, q, sc, life, paint, fade = 4, paint2 = paint) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max; const b = this.b[i];
    b.life = life; b.fade = fade; b.age = 0; b.sleep = false; b.still = 0; b.hold = 0; b.launch = null; b.e = 0.25; b.mu = 0.6; b.hit = 0;
    b.p.copy(p); b.q.copy(q); b.sc.copy(sc); b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.rad = Math.max(0.006, sc.y * 0.5); b.prevX = p.x;
    this.paint.setXYZ(i, paint.r, paint.g, paint.b); this.paint.needsUpdate = true; this.paint2.setXYZ(i, paint2.r, paint2.g, paint2.b); this.paint2.needsUpdate = true; this.dirty = true; return b;
  }
  clear() { for (let i = 0; i < this.max; i++) { this.b[i].life = 0; this.mesh.setMatrixAt(i, this.zero); } this.dirty = true; this.mesh.instanceMatrix.needsUpdate = true; }
  write(b, i) {
    if (b.life <= 0) { this.mesh.setMatrixAt(i, this.zero); return; }
    this.t.copy(b.sc); if (b.life < b.fade) this.t.multiplyScalar(Math.max(0, b.life / b.fade));
    this.m.compose(b.p, b.q, this.t); this.mesh.setMatrixAt(i, this.m);
  }
  update(dt) {
    const fx = this.fx;
    for (let i = 0; i < this.max; i++) {
      const b = this.b[i];
      if (b.life <= 0) continue;
      b.life -= dt; b.age += dt;
      if (b.life <= 0) { this.write(b, i); this.dirty = true; continue; }
      if (b.sleep) { if (b.life < b.fade) { this.write(b, i); this.dirty = true; } continue; }
      if (dt <= 0) continue;
      const half = b.sc.z * 0.5;
      if (b.hold > 0) {      // the crown stays with the struck helm or shield: it goes on at that man's pace, then is thrown off
        b.hold -= dt; b.p.addScaledVector(b.hv, dt);
        if (b.hold <= 0 && b.launch) { b.v.copy(b.launch.v); b.w.copy(b.launch.w); b.launch = null; }
        this.write(b, i); this.dirty = true; continue;
      }
      b.v.y -= 9.81 * dt; b.v.multiplyScalar(Math.exp(-0.25 * dt));
      b.p.addScaledVector(b.v, dt);
      const wl = b.w.length(); if (wl > 1e-4) { this.q2.setFromAxisAngle(this.t.copy(b.w).divideScalar(wl), wl * dt); b.q.premultiply(this.q2).normalize(); }
      this.ax.copy(_z).applyQuaternion(b.q);
      const invI = 1 / Math.max(b.sc.z * b.sc.z / 12, 0.0008); let touch = 0;
      for (let e = -1; e <= 1; e += 2) {
        const r = this.r.copy(this.ax).multiplyScalar(e * half), pen = b.rad - (b.p.y + r.y);
        if (pen <= 0) continue;
        touch++; b.p.y += pen;
        const vp = this.vp.crossVectors(b.w, r).add(b.v), rn = this.rn.set(-r.z, 0, r.x);
        if (vp.y < 0) {
          const K = 1 + rn.lengthSq() * invI, jn = -(1 + b.e) * vp.y / K;
          if (-vp.y > 2 && fx.onClack && b.age - b.hit > 0.06) { b.hit = b.age; fx.onClack(b.p, -vp.y); }
          b.v.y += jn; b.w.addScaledVector(rn, jn * invI);
          const tl = Math.hypot(vp.x, vp.z);
          if (tl > 1e-4) {      // the sand grips: friction against the sliding of the point, which also turns the rod
            const tx = vp.x / tl, tz = vp.z / tl, jt = Math.min(b.mu * jn, tl / (1 + invI * 0.5 * r.lengthSq()));
            b.v.x -= tx * jt; b.v.z -= tz * jt;
            b.w.x += r.y * (-tz) * jt * invI; b.w.y += (r.z * (-tx) - r.x * (-tz)) * jt * invI; b.w.z += -r.y * (-tx) * jt * invI;
          }
        }
      }
      if (touch) { const k = Math.exp(-3 * dt); b.w.multiplyScalar(k); b.v.x *= Math.exp(-1.6 * dt); b.v.z *= Math.exp(-1.6 * dt); }
      // the tilt: a plank wall along x = 0
      if (fx.tiltTop > 0 && Math.abs(b.p.z) < 46) {
        const reach = 0.06 + Math.abs(this.ax.x) * half;
        if (Math.abs(b.p.x) < reach && b.p.y - Math.abs(this.ax.y) * half < fx.tiltTop) {
          const side = b.prevX !== 0 ? Math.sign(b.prevX) : Math.sign(b.p.x) || 1;
          b.p.x = side * reach; if (Math.sign(b.v.x) !== side) b.v.x = -b.v.x * 0.3; b.w.multiplyScalar(0.7);
        }
      }
      b.prevX = b.p.x;
      if (touch >= 2 && b.v.lengthSq() < 0.05 && b.w.lengthSq() < 0.5) b.still += dt; else b.still = Math.max(0, b.still - dt);
      if (b.still > 0.2 || (touch && b.age > 6)) {      // lies still: flat on the sand, painted face up (four in five), and asleep
        this.t.set(this.ax.x, 0, this.ax.z); if (this.t.lengthSq() < 1e-6) this.t.set(1, 0, 0); this.t.normalize();
        const up = b.i % 5 === 0 ? -1 : 1; this.u.set(0, up, 0); this.r.crossVectors(this.u, this.t).normalize();
        this.m.makeBasis(this.r, this.u, this.t); b.q.setFromRotationMatrix(this.m);
        b.p.y = b.sc.y > 0.05 ? b.sc.y * 0.5 : b.rad + 0.002;      // (the fore part is round: it lies on its side)
        b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.sleep = true;
      }
      this.write(b, i); this.dirty = true;
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
  }
}
