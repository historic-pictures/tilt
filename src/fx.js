import * as THREE from 'three';
import { softDot } from './util.js';
import { GFX } from './gfx.js';
import { PHYS } from './data.js';
import { Rods, splinterGeo, foreGeo, crownGeo, pieceMat, seeded } from './fx_rods.js';

class Puffs {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = []; for (let i = 0; i < max; i++) this.p.push({ life: 0, max: 1, v: new THREE.Vector3(), size: 1, grow: 0, a: 1, g: 0, drag: 1 });
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max); this.col = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA=aAlpha; vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uScale/max(0.1,-mv.z); }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC, t.a*vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points); this.geo = geo; this.cursor = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, alpha, color, gravity = 0, drag = 1.5) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const q = this.p[i]; q.life = q.max = life; q.v.set(vx, vy, vz); q.size = size; q.grow = grow; q.a = alpha; q.g = gravity; q.drag = drag;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (q.life <= 0) { this.al[i] = 0; continue; }
      q.life -= dt;
      q.v.y -= q.g * dt; const k = Math.exp(-q.drag * dt); q.v.x *= k; q.v.z *= k; if (q.g === 0) q.v.y *= k;
      this.pos[i * 3] += q.v.x * dt; this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + q.v.y * dt); this.pos[i * 3 + 2] += q.v.z * dt;
      q.size += q.grow * dt;
      const t = Math.max(0, q.life / q.max);
      this.sz[i] = q.size; this.al[i] = q.a * Math.min(1, t * 1.6) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    const a = this.geo.attributes; a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
  }
}

const _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.dustP = new Puffs(scene, 500, false);
    this.sparkP = new Puffs(scene, 200, true); this.petalP = new Puffs(scene, 220, false);      // petalP: ribbons and petals thrown from the stands
    this.dustCol = new THREE.Color(0xb9a37c); this.sparkCol = new THREE.Color(0xffd28a); this.chipCol = new THREE.Color(0xd8c7a0); this.clodCol = new THREE.Color(0x6a5234); this.hoofCol = new THREE.Color(0xb8a27a);
    // splinters
    this.maxS = 220;
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.spl = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xcdb58a, roughness: 0.8 }), this.maxS);
    this.spl.castShadow = true; this.spl.frustumCulled = false; scene.add(this.spl);
    this.s = []; for (let i = 0; i < this.maxS; i++) this.s.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), ax: new THREE.Vector3(1, 0, 0), w: 0, sc: new THREE.Vector3(1, 1, 1) });
    this.sc = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._ax = new THREE.Vector3(); this._ax2 = new THREE.Vector3(); this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxS; i++) this.spl.setMatrixAt(i, this._zero);
    // the lance burst (see lanceBurst): splinters, the fore part, the crown, and a cloud of small chips
    const pm = pieceMat(), nS = GFX.tier === 'low' ? 90 : GFX.tier === 'medium' ? 150 : 220;
    this.splR = new Rods(scene, splinterGeo(), pm, nS, this); this.foreR = new Rods(scene, foreGeo(), pm, 8, this); this.crownR = new Rods(scene, crownGeo(), pm, 6, this);
    this.chipP = new Puffs(scene, 360, false); this.onClack = null; this.tiltTop = 0; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
    this.woodCol = new THREE.Color(0xe2cfa4); this.paintCol = new THREE.Color();
  }
  setScale(px) { this.chipP.mat.uniforms.uScale.value = px; this.dustP.mat.uniforms.uScale.value = px; this.sparkP.mat.uniforms.uScale.value = px; this.petalP.mat.uniforms.uScale.value = px; }
  /** Ribbons and petals thrown from a seat at p down onto the sand: they arc toward the lists (x = 0), flutter and fall. */
  ribbons(p, n = 3) {
    const cols = [0xd8222a, 0xe8c75a, 0xf4f0e4, 0x2f6bb5, 0xe68ab0, 0x58a04a], s = -Math.sign(p.x) || -1;
    for (let i = 0; i < n; i++) {
      this.petalP.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.9 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.8, s * (4.2 + Math.random() * 4.2), 2.4 + Math.random() * 3.2, (Math.random() - 0.5) * 2.4,
        2.6 + Math.random() * 1.4, 0.09 + Math.random() * 0.07, 0, 1, new THREE.Color(cols[(Math.random() * cols.length) | 0]), 2.6, 0.35);
    }
  }

  dust(p, n = 6, spread = 0.5, up = 1, size = 0.5, vel) {
    for (let i = 0; i < n; i++) {
      this.dustP.emit(p.x + (Math.random() - 0.5) * spread, Math.max(0.05, p.y) + Math.random() * 0.15, p.z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 1.6 + (vel ? vel.x : 0), Math.random() * up + 0.2, (Math.random() - 0.5) * 1.6 + (vel ? vel.z : 0),
        0.9 + Math.random() * 1.1, size * (0.6 + Math.random() * 0.8), 0.9 + Math.random() * 0.8, 0.22 + Math.random() * 0.16, this.dustCol, 0, 1.6);
    }
  }
  /**
   * A hoof strikes the sand at p (world, y ignored). speed m/s (walk 1.8: nothing, trot 4.2: a small puff now and then, gallop 7+: clear puffs),
   * dir = +/-1 along z, hind = hind hoof (kicks more back). Soft sand-coloured puffs that are thrown back, rise a little, drift and fade over ~0.8-1.2 s.
   * Low tier: a token puff at a hard gallop only. Medium: about two thirds of high.
   */
  hoof(p, speed, dir = 1, hind = false) {
    if (speed < 2.8) return;
    const tier = GFX.tier, r = Math.random();
    if (tier === 'low' && (speed < 6 || !hind || r > 0.5)) return;
    const k = Math.min(1, Math.max(0, (speed - 2.5) / 5.5));      // 0.05 at a walk's edge .. 1 at a flat-out gallop
    let n = speed < 5 ? (r < 0.55 ? 1 : 0) : speed < 6.5 ? 1 + (r < 0.4 ? 1 : 0) : 2 + (r < 0.6 ? 1 : 0);
    if (hind) n += speed > 6 ? 1 : 0;
    if (tier === 'medium' && n > 1 && Math.random() < 0.35) n--;
    if (tier === 'low') n = 1;
    for (let i = 0; i < n; i++) {
      const sz = (0.36 + 0.5 * k) * (0.7 + Math.random() * 0.6);
      this.dustP.emit(p.x + (Math.random() - 0.5) * 0.18, 0.07 + Math.random() * 0.08, p.z - dir * (0.05 + Math.random() * 0.12) + (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * (0.5 + k * 0.9), 0.45 + k * 0.9 + Math.random() * 0.4, dir * speed * ((hind ? 0.1 : 0.04) + Math.random() * 0.08) - dir * (0.6 + k * 1.2 + Math.random() * 0.6) * (hind ? 1.2 : 0.6),
        0.8 + Math.random() * 0.4, sz, 0.5 + k * 0.8, 0.2 + 0.26 * k, this.hoofCol, 0, 2.4);
    }
  }
  /** A rider hits the ground at p, falling at v m/s: a big ring of sand thrown outward, some clods. */
  landBurst(p, v = 6) {
    const k = Math.min(1, Math.max(0.4, v / 7)), n = GFX.tier === 'low' ? 8 : GFX.tier === 'medium' ? 22 : 34;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 2.6) * k;
      this.dustP.emit(p.x + Math.cos(a) * 0.25, 0.08 + Math.random() * 0.2, p.z + Math.sin(a) * 0.25, Math.cos(a) * sp, 0.6 + Math.random() * 1.6 * k, Math.sin(a) * sp,
        0.9 + Math.random() * 0.4, (0.5 + Math.random() * 0.6) * (0.8 + 0.5 * k), 0.9 + Math.random() * 0.9, 0.2 + Math.random() * 0.16, this.hoofCol, 0, 2.0);
    }
    if (GFX.tier !== 'low') this.clods(p, 6, 0);
  }
  clods(p, n = 4, vz = 0) {
    if (GFX.tier === 'low') n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      this.dustP.emit(p.x + (Math.random() - 0.5) * 0.15, 0.06, p.z + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 2.2, 1.2 + Math.random() * 2.4, -vz * (0.15 + Math.random() * 0.3) + (Math.random() - 0.5), 0.5 + Math.random() * 0.5, 0.05 + Math.random() * 0.06, 0, 0.95, this.clodCol, 9.8, 0.3);
    }
  }
  sparks(p, n = 14, speed = 5) {
    for (let i = 0; i < n; i++) {
      this.sparkP.emit(p.x, p.y, p.z, (Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed, 0.25 + Math.random() * 0.4, 0.05 + Math.random() * 0.05, 0, 1, this.sparkCol, 9, 0.6);
    }
  }
  /** Shatter a lance between world points a (near hand) and b (tip). vel = lance carrier velocity. */
  splinters(a, b, vel, n = 60) {
    const d = new THREE.Vector3().subVectors(b, a);
    for (let i = 0; i < n; i++) {
      const s = this.s[this.sc]; this.sc = (this.sc + 1) % this.maxS;
      const t = Math.pow(Math.random(), 0.6);
      s.p.copy(a).addScaledVector(d, t);
      const big = i < 3;
      s.v.set((Math.random() - 0.5) * 7, Math.random() * 5.5 + 1, (Math.random() - 0.5) * 7).addScaledVector(vel, 0.25 + Math.random() * 0.5);
      s.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
      s.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.w = (Math.random() - 0.5) * 30;
      s.sc.set(big ? 0.035 : 0.006 + Math.random() * 0.016, big ? 0.035 : 0.006 + Math.random() * 0.014, big ? 0.45 + Math.random() * 0.5 : 0.05 + Math.random() * 0.28);
      s.life = 5 + Math.random() * 4;
    }
    for (let i = 0; i < 26; i++) {
      const t = Math.random();
      this.dustP.emit(a.x + d.x * t, a.y + d.y * t, a.z + d.z * t, (Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5, 0.5 + Math.random() * 0.6, 0.12, 0.7, 0.5, this.chipCol, 2, 2.5);
    }
  }
  /** The fore part of a broken lance, from world point a (the break) to b (the point), flying off in one piece. */
  shaft(a, b, vel) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(); if (len < 0.15) return;
    const s = this.s[this.sc]; this.sc = (this.sc + 1) % this.maxS;
    s.p.copy(a).addScaledVector(d, 0.5);
    s.v.set((Math.random() - 0.5) * 3, 2.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2).addScaledVector(vel, 0.5);
    s.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    s.ax.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, 0.2 * (Math.random() - 0.5)).normalize();
    s.w = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 7);
    s.sc.set(0.05, 0.05, len); s.life = 14;
  }
  /**
   * A lance breaks. o: a, b = world points of the break and of the point (the fore part runs a -> b, so any break point works: this is also what a glb lance split into
   * rear / fore at the break will hand over); dir = the stroke's direction (unit, world); v = the striker's velocity; hv = the struck rider's velocity; power = the
   * stroke's strength (1 = full); zone; paint = the lance's paint colour; seed = the random stream (a replay passes the same one); r0 = lance radius at the break.
   * What it throws is PHYS.impact: a crack throws a few short splinters, a clean break a fan of long ones, a shatter a storm. The fore part tumbles end over end,
   * long splinters (thin tapered prisms with a jagged end, the paint on the outer face) fly along the stroke and out to the sides and then lie on the sand;
   * the crown tip stays with what it struck for a moment, then bounces off. Returns the class: 0 crack, 1 clean, 2 shatter.
   */
  lanceBurst(o) {
    const I = PHYS.impact, rnd = seeded(o.seed | 0), pw = o.power ?? 0.6, K = pw >= I.shatterAt ? I.shatter : pw >= I.cleanAt ? I.clean : I.crack;
    const tier = GFX.tier === 'low' ? 0.5 : GFX.tier === 'medium' ? 0.75 : 1, pk = Math.min(1.3, 0.55 + pw * 0.6), cls = K === I.shatter ? 2 : K === I.clean ? 1 : 0;
    const a = o.a, d = this._a.subVectors(o.b, a), L = d.length(); if (L < 0.2) return cls; const dn = d.clone().divideScalar(L);
    const dir = o.dir ? o.dir.clone().normalize() : dn.clone(), paint = this.paintCol.set(o.paint ?? 0xb23a2a), vel = o.v || this._c.set(0, 0, 0), hv = o.hv || new THREE.Vector3();
    const side = new THREE.Vector3(), tmp = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), sc = this._b;
    // the fore part: the lance from the break to just short of the crown, flung on with what is left of the stroke, tumbling end over end
    const crown = I.coronel.size, fl = Math.max(0.2, L - crown * 0.9);
    {
      const r0 = o.r0 ?? 0.034;
      q.setFromUnitVectors(_Z, dn); const b = this.foreR.spawn(tmp.copy(a).addScaledVector(dn, fl * 0.5), q, sc.set(r0, r0, fl), I.keep, paint, I.fade);
      b.rad = r0 * 0.8; b.e = 0.2; b.mu = 0.7;
      b.v.copy(vel).multiplyScalar(0.3).addScaledVector(dir, K.spray * 0.35 * (0.6 + rnd() * 0.5)); b.v.x += (rnd() - 0.5) * K.side; b.v.y = 2.0 + K.up * (0.5 + rnd());
      side.crossVectors(dn, _Y); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      const sp = I.foreSpin[0] + (I.foreSpin[1] - I.foreSpin[0]) * rnd() * pk; b.w.copy(side).multiplyScalar((rnd() < 0.5 ? -1 : 1) * sp); b.w.y += (rnd() - 0.5) * 3;
    }
    // the crown
    {
      const hold = o.zone === 'helm' || o.zone === 'shield' ? I.coronel.hold + I.coronel.perPower * Math.min(1, pw) : 0.06;
      q.setFromUnitVectors(_Z, dn); const z = crown / 0.12, b = this.crownR.spawn(o.b, q, sc.set(z, z, z), I.keep, paint, I.fade);
      b.rad = 0.035 * z; b.e = 0.35; b.hold = hold; b.hv.copy(hv);
      b.launch = { v: new THREE.Vector3((rnd() - 0.5) * 2, 1.6 + rnd() * 1.8, 0).addScaledVector(dir, -(0.8 + rnd() * 1.6)).addScaledVector(hv, 0.5), w: new THREE.Vector3(rnd() * 14 - 7, rnd() * 14 - 7, rnd() * 14 - 7) };
    }
    // the long splinters: from the break and for a metre beyond it, 0.3-1.2 m by the stroke, sprayed along it and out to the sides
    const nL = Math.round(K.long * tier * (0.85 + rnd() * 0.3)), len0 = K.len[0], len1 = K.len[1];
    for (let i = 0; i < nL; i++) {
      const ln = len0 + (len1 - len0) * Math.pow(rnd(), 1.4), t = (rnd() * 0.95 - 0.12) * Math.min(L, 1.1);
      tmp.copy(a).addScaledVector(dn, t); tmp.x += (rnd() - 0.5) * 0.06; tmp.y += (rnd() - 0.5) * 0.06;
      side.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      q.setFromUnitVectors(_Z, dn).premultiply(q2.setFromAxisAngle(side, 0.15 + rnd() * 0.5)); q.premultiply(q2.setFromAxisAngle(dn, rnd() * 6.28));
      const b = this.splR.spawn(tmp, q, sc.set(0.018 + rnd() * 0.034, 0.005 + rnd() * 0.009, ln), I.keep, paint, I.fade);
      b.mu = 0.55 + rnd() * 0.2; b.e = 0.2 + rnd() * 0.15;
      side.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5); side.addScaledVector(dir, -side.dot(dir)).normalize();      // out to the side of the stroke
      const spr = K.spray * (0.35 + rnd() * 0.9) * (1.15 - ln * 0.5);
      b.v.copy(vel).multiplyScalar(0.15).addScaledVector(dir, spr).addScaledVector(side, K.side * (0.3 + rnd())); b.v.y += 0.6 + rnd() * K.up;
      b.w.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar((6 + rnd() * 14) * (0.5 + pk * 0.5) / (0.4 + ln * 0.8));
    }
    // the chips: tiny slivers that go to the sand, a cloud of flying bits and a breath of pale wood dust
    const nC = Math.round(K.chips * tier), nT = Math.min(26, Math.round(nC * 0.3));
    for (let i = 0; i < nT; i++) {
      tmp.copy(a).addScaledVector(dn, (rnd() - 0.1) * Math.min(L, 1)); side.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); q.setFromUnitVectors(_Z, side);
      const b = this.splR.spawn(tmp, q, sc.set(0.008 + rnd() * 0.012, 0.004 + rnd() * 0.004, 0.03 + rnd() * 0.08), I.keep * 0.6, paint, I.fade);
      side.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); b.v.copy(vel).multiplyScalar(0.1).addScaledVector(dir, K.spray * (0.2 + rnd())).addScaledVector(side, K.side * 1.3); b.v.y += rnd() * K.up * 1.4; b.w.set(rnd() * 30 - 15, rnd() * 30 - 15, rnd() * 30 - 15);
    }
    for (let i = 0; i < nC - nT; i++) {
      const t = rnd() * Math.min(L, 0.9), sp = K.spray * (0.15 + rnd() * 0.7);
      this.chipP.emit(a.x + dn.x * t, a.y + dn.y * t, a.z + dn.z * t, dir.x * sp + (rnd() - 0.5) * K.side * 1.6 + vel.x * 0.1, dir.y * sp + rnd() * K.up * 1.4, dir.z * sp + (rnd() - 0.5) * K.side * 1.6 + vel.z * 0.1,
        0.5 + rnd() * 0.7, 0.025 + rnd() * 0.035, 0, 0.95, rnd() < 0.5 ? this.woodCol : paint, 9, 0.6);
    }
    const nD = Math.round((8 + 14 * pk) * tier);
    for (let i = 0; i < nD; i++) {
      const t = rnd() * Math.min(L, 0.8);
      this.dustP.emit(a.x + dn.x * t, a.y + dn.y * t, a.z + dn.z * t, dir.x * K.spray * 0.15 + (rnd() - 0.5) * 2.4, rnd() * 1.4, dir.z * K.spray * 0.15 + (rnd() - 0.5) * 2.4, 0.5 + rnd() * 0.6, 0.12 + rnd() * 0.1, 0.8, 0.28 * pk, this.chipCol, 1.6, 2.4);
    }
    return cls;
  }
  /** A flat piece (a shield sprung off the arm): sx x sy x sz metres, orientation q, thrown up and back with velocity vel plus a kick. */
  piece(p, q, sx, sy, sz, vel) {
    const s = this.s[this.sc]; this.sc = (this.sc + 1) % this.maxS;
    s.p.copy(p); s.q.copy(q);
    s.v.set((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2).addScaledVector(vel, 0.4);
    s.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); s.w = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6);
    s.sc.set(sx, sy, sz); s.life = 14;
  }
  clear() { this.splR.clear(); this.foreR.clear(); this.crownR.clear(); for (const q of this.chipP.p) q.life = 0; for (const q of this.petalP.p) q.life = 0; for (const s of this.s) s.life = 0; for (let i = 0; i < this.maxS; i++) this.spl.setMatrixAt(i, this._zero); this.spl.instanceMatrix.needsUpdate = true; }

  update(dt) {
    this.dustP.update(dt); this.sparkP.update(dt); this.petalP.update(dt); this.chipP.update(dt); this.splR.update(dt); this.foreR.update(dt); this.crownR.update(dt);
    for (let i = 0; i < this.maxS; i++) {
      const s = this.s[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { this.spl.setMatrixAt(i, this._zero); continue; }
      s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt);
      // a long piece is as low as its lower end: it lands on that end, is tipped over by it, and comes to lie flat
      const ax = this._ax.set(0, 0, 1).applyQuaternion(s.q), half = s.sc.z * 0.5, fl = s.sc.x * 0.5 + 0.005 + Math.abs(ax.y) * half;
      if (s.p.y < fl) {
        s.p.y = fl; s.v.y = Math.abs(s.v.y) * 0.3; s.v.x *= 0.55; s.v.z *= 0.55; s.w *= 0.4;
        if (half > 0.2 && Math.abs(ax.y) > 0.02) { this._ax2.set(ax.x, 0, ax.z); if (this._ax2.lengthSq() < 1e-6) this._ax2.set(1, 0, 0); this._ax2.normalize(); this._q.setFromUnitVectors(ax, this._ax2.lerp(ax, 0.6).normalize()); s.q.premultiply(this._q); }
        if (Math.abs(s.v.y) < 0.4 && Math.abs(ax.y) < 0.05) { s.v.set(0, 0, 0); s.w = 0; }
      }
      // the tilt: a plank wall along x = 0, up to tiltTop
      if (this.tiltTop > 0 && Math.abs(s.p.z) < 46) {
        const reach = 0.06 + Math.abs(ax.x) * half;
        if (Math.abs(s.p.x) < reach && s.p.y - Math.abs(ax.y) * half < this.tiltTop) {
          const side = s.prevX !== undefined && Math.sign(s.prevX) !== 0 ? Math.sign(s.prevX) : Math.sign(s.p.x) || 1;
          s.p.x = side * reach; if (Math.sign(s.v.x) !== side) s.v.x = -s.v.x * 0.3; s.w *= 0.6;
        }
      }
      s.prevX = s.p.x;
      if (s.w) { this._q.setFromAxisAngle(s.ax, s.w * dt); s.q.premultiply(this._q); }
      this._m.compose(s.p, s.q, s.sc); this.spl.setMatrixAt(i, this._m);
    }
    this.spl.instanceMatrix.needsUpdate = true;
  }
}
