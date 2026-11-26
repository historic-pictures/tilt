// The unhorsed rider as an articulated ragdoll: position-based dynamics (Verlet points + distance constraints + joint-limit constraints),
// no library. Seventeen points at the joints of the rigged rider (pelvis, chest, head, shoulders, elbows, hands, hips, knees, ankles, toes);
// rigid bones between them; joint limits as distance ranges between points two links apart and as hinge half-planes (knees bend forward,
// elbows bend back); the trunk and the head braced so they bend only so far. Masses: an 80 kg man plus his harness, the helm on the head.
// Gravity, the sand (radius per point, position-based friction), the tilt's barrier. Fixed 1/120 s substeps, so the same start gives the
// same fall at any frame rate. jouster.js drives the skinned bones from the points (Jouster._ragPose) and records them for the replay.
// Plain numbers only (no Three), so it ports. Numbers in PHYS.ragdoll (data.js).
import { PHYS } from './data.js';

// name, bone (where the point starts), radius (m), mass share of the body (kg of an 80 kg man), harness share
export const RAG_POINTS = [
  ['pelvis', 'Hips', 0.15, 14, 0.12], ['chest', 'Spine2', 0.17, 20, 0.3], ['head', 'Head', 0.14, 5.5, 0],
  ['shL', 'LeftArm', 0.09, 3.5, 0.06], ['elL', 'LeftForeArm', 0.06, 2.0, 0.035], ['haL', 'LeftHand', 0.05, 1.0, 0.02],
  ['shR', 'RightArm', 0.09, 3.5, 0.06], ['elR', 'RightForeArm', 0.06, 2.0, 0.035], ['haR', 'RightHand', 0.05, 1.0, 0.02],
  ['hipL', 'LeftUpLeg', 0.09, 5.5, 0.06], ['knL', 'LeftLeg', 0.075, 4.5, 0.06], ['anL', 'LeftFoot', 0.06, 1.6, 0.03], ['toL', 'LeftToeBase', 0.05, 0.6, 0.01],
  ['hipR', 'RightUpLeg', 0.09, 5.5, 0.06], ['knR', 'RightLeg', 0.075, 4.5, 0.06], ['anR', 'RightFoot', 0.06, 1.6, 0.03], ['toR', 'RightToeBase', 0.05, 0.6, 0.01],
];
const IDX = {}; RAG_POINTS.forEach((p, i) => { IDX[p[0]] = i; });
export const RI = IDX;

export class Ragdoll {
  /**
   * pos: Float32Array(3n) world positions of the points (from the posed bones); vel: (3n) their velocities; armourKg: the harness; helmKg: the helm.
   */
  constructor(pos, vel, armourKg = 28, helmKg = 5) {
    const n = RAG_POINTS.length, R = PHYS.ragdoll;
    this.n = n; this.p = Float32Array.from(pos); this.q = new Float32Array(3 * n); this.r = new Float32Array(n); this.w = new Float32Array(n);
    const sh = RAG_POINTS.reduce((a, b) => a + b[4], 0);
    for (let i = 0; i < n; i++) {
      const P = RAG_POINTS[i], m = P[3] + (armourKg - helmKg) * P[4] / sh + (P[0] === 'head' ? helmKg : 0);
      this.r[i] = P[2]; this.w[i] = 1 / m;
      for (let k = 0; k < 3; k++) this.q[3 * i + k] = this.p[3 * i + k] - vel[3 * i + k] * R.h;      // Verlet: the previous position carries the velocity
    }
    this.t = 0; this.acc = 0; this.still = 0; this.sleep = false; this.landed = false; this.tiltTop = 0; this.cons = []; this.hinges = [];
    this._build();
  }
  _d(a, b) { const p = this.p, i = 3 * a, j = 3 * b; return Math.hypot(p[i] - p[j], p[i + 1] - p[j + 1], p[i + 2] - p[j + 2]); }
  /** Constraints from the start pose: rigid bones, ranges for the joints (fractions of the rest length, or angles turned into lengths). */
  _build() {
    const C = this.cons, d = (a, b) => this._d(IDX[a], IDX[b]);
    const rigid = (a, b) => C.push([IDX[a], IDX[b], d(a, b), d(a, b)]);
    const range = (a, b, lo, hi) => { const L = d(a, b); C.push([IDX[a], IDX[b], L * lo, L * hi]); };
    const between = (a, b, mn, mx) => C.push([IDX[a], IDX[b], mn, mx]);
    // a joint between two bones of lengths l1, l2: the distance across it for bend angles from straight (0) to amax
    const bend = (a, j, b, amax) => { const l1 = d(a, j), l2 = d(j, b), mn = Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - amax)); C.push([IDX[a], IDX[b], mn, l1 + l2]); };
    const D = Math.PI / 180;
    // the trunk: pelvis and hips one block, the chest on the spine, shoulders on the chest
    rigid('pelvis', 'hipL'); rigid('pelvis', 'hipR'); rigid('hipL', 'hipR');
    rigid('chest', 'shL'); rigid('chest', 'shR'); rigid('shL', 'shR');
    rigid('pelvis', 'chest');
    range('hipL', 'chest', 0.82, 1.12); range('hipR', 'chest', 0.82, 1.12);       // the spine bends forward / back / sideways about 30-40 deg (and the harness stiffens it)
    range('shL', 'pelvis', 0.85, 1.1); range('shR', 'pelvis', 0.85, 1.1);          // and twists a little
    range('shL', 'hipR', 0.9, 1.08); range('shR', 'hipL', 0.9, 1.08);
    // the head on the neck: nods and tilts about 45 deg each way, a bolted stechhelm much less (ragdoll.neck)
    rigid('chest', 'head'); range('head', 'shL', 0.8, 1.2); range('head', 'shR', 0.8, 1.2); range('head', 'pelvis', 0.9, 1.04);
    // arms: rigid bones, elbows bend to 145 deg, shoulders keep the elbow off the trunk and below about 170 deg of raise
    for (const s of ['L', 'R']) {
      rigid('sh' + s, 'el' + s); rigid('el' + s, 'ha' + s); bend('sh' + s, 'el' + s, 'ha' + s, 145 * D);
      between('el' + s, 'pelvis', 0.22, 9); between('el' + s, 'hip' + s, 0.16, 9); between('ha' + s, 'chest', 0.16, 9); between('ha' + s, 'pelvis', 0.14, 9);
      range('el' + s, 'chest', 0.75, 1.45);
      // legs: rigid bones; knees bend to 150 deg; hips flex to about 120 deg and extend 20 (thigh to chest), abduct 45 (knee to the other hip)
      rigid('hip' + s, 'kn' + s); rigid('kn' + s, 'an' + s); rigid('an' + s, 'to' + s); bend('hip' + s, 'kn' + s, 'an' + s, 150 * D);
      range('kn' + s, 'chest', 0.62, 1.07); range('kn' + s, 'hip' + (s === 'L' ? 'R' : 'L'), 0.85, 1.45); range('to' + s, 'kn' + s, 0.85, 1.12);
      this.hinges.push([IDX['hip' + s], IDX['kn' + s], IDX['an' + s], 1], [IDX['sh' + s], IDX['el' + s], IDX['ha' + s], -1]);
    }
    between('knL', 'knR', 0.14, 9); between('anL', 'anR', 0.12, 9); between('haL', 'haR', 0.1, 9); between('head', 'haL', 0.12, 9); between('head', 'haR', 0.12, 9);
  }
  /** The trunk's forward (unit, into f): the pelvis-hips plane's normal, toward his front. */
  _fwd(f) {
    const p = this.p, P = 3 * IDX.pelvis, L = 3 * IDX.hipL, Rr = 3 * IDX.hipR, Cc = 3 * IDX.chest;
    const ax = p[L] - p[Rr], ay = p[L + 1] - p[Rr + 1], az = p[L + 2] - p[Rr + 2], ux = p[Cc] - p[P], uy = p[Cc + 1] - p[P + 1], uz = p[Cc + 2] - p[P + 2];
    // left x up = forward (x left, y up, z forward: (1,0,0) x (0,1,0) = (0,0,1))
    let fx = ay * uz - az * uy, fy = az * ux - ax * uz, fz = ax * uy - ay * ux; const l = Math.hypot(fx, fy, fz) || 1;
    f[0] = fx / l; f[1] = fy / l; f[2] = fz / l;
  }
  /** Advance by dt seconds (fixed substeps; a leftover carries to the next call). Returns the number of substeps run. */
  step(dt) {
    if (this.sleep) return 0;
    const R = PHYS.ragdoll, h = R.h; this.acc = Math.min(this.acc + dt, 0.1); let k = 0;
    while (this.acc >= h) { this.acc -= h; this._sub(h); k++; }
    return k;
  }
  _sub(h) {
    const R = PHYS.ragdoll, p = this.p, q = this.q, n = this.n, g = 9.81 * h * h, damp = R.damp;
    this.t += h;
    // Verlet
    for (let i = 0; i < n; i++) {
      const j = 3 * i;
      for (let k = 0; k < 3; k++) { const x = p[j + k], v = (x - q[j + k]) * damp; q[j + k] = x; p[j + k] = x + v; }
      p[j + 1] -= g;
    }
    const f = this._f || (this._f = new Float32Array(3)), ct = this._ct || (this._ct = new Uint8Array(n)), vin = this._vin || (this._vin = new Float32Array(n));
    for (let it = 0; it < R.iters; it++) {
      // distances and ranges
      for (const c of this.cons) {
        const a = 3 * c[0], b = 3 * c[1], dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const tgt = L < c[2] ? c[2] : L > c[3] ? c[3] : L; if (tgt === L) continue;
        const wa = this.w[c[0]], wb = this.w[c[1]], s = (L - tgt) / L / (wa + wb);
        p[a] += dx * s * wa; p[a + 1] += dy * s * wa; p[a + 2] += dz * s * wa; p[b] -= dx * s * wb; p[b + 1] -= dy * s * wb; p[b + 2] -= dz * s * wb;
      }
      // hinges: the knee stays in front of the hip-ankle line, the elbow behind the shoulder-hand line (no bending the wrong way)
      this._fwd(f);
      for (const H of this.hinges) {
        const a = 3 * H[0], m = 3 * H[1], b = 3 * H[2], cx = (p[a] + p[b]) / 2, cy = (p[a + 1] + p[b + 1]) / 2, cz = (p[a + 2] + p[b + 2]) / 2;
        const s = ((p[m] - cx) * f[0] + (p[m + 1] - cy) * f[1] + (p[m + 2] - cz) * f[2]) * H[3];
        if (s < R.hinge) { const k2 = (R.hinge - s) * H[3]; p[m] += f[0] * k2 * 0.6; p[m + 1] += f[1] * k2 * 0.6; p[m + 2] += f[2] * k2 * 0.6; p[a] -= f[0] * k2 * 0.2; p[a + 1] -= f[1] * k2 * 0.2; p[a + 2] -= f[2] * k2 * 0.2; p[b] -= f[0] * k2 * 0.2; p[b + 1] -= f[1] * k2 * 0.2; p[b + 2] -= f[2] * k2 * 0.2; }
      }
      // the sand (no point below its radius) and the barrier
      for (let i = 0; i < n; i++) {
        const j = 3 * i, r = this.r[i];
        if (p[j + 1] < r) {
          if (!ct[i]) { ct[i] = 1; vin[i] = (p[j + 1] - q[j + 1]) / h; }
          p[j + 1] = r;
        }
        if (this.tiltTop > 0 && Math.abs(p[j + 2]) < 46 && p[j + 1] - r < this.tiltTop) {
          const reach = r + 0.06;
          if (Math.abs(p[j]) < reach) { const side = Math.sign(q[j]) || Math.sign(p[j]) || 1; p[j] = side * reach; }
        }
      }
    }
    // after the solve: what touched the sand bounces a little and is held back by friction (once per substep)
    for (let i = 0; i < n; i++) {
      if (!ct[i]) continue; ct[i] = 0;
      const j = 3 * i, vy = vin[i];
      if (!this.landed && vy < -1.2) { this.landed = true; this.landSpeed = -vy; this.landAt = [p[j], p[j + 1], p[j + 2]]; }
      q[j + 1] = vy < 0 ? p[j + 1] + vy * R.bounce * h : p[j + 1];
      // Coulomb friction on the sand: the sliding speed loses mu g per second (as a displacement per substep: mu g h^2), never reversing
      const dx = p[j] - q[j], dz = p[j + 2] - q[j + 2], dl = Math.hypot(dx, dz), cut = R.mu * 9.81 * h * h * (1 + Math.max(0, -vy) * R.impactMu);
      if (dl > 1e-9) { const k = Math.min(1, cut / dl); q[j] += dx * k; q[j + 2] += dz * k; }
    }
    // asleep once nothing moves
    let vmax = 0; for (let i = 0; i < 3 * n; i++) vmax = Math.max(vmax, Math.abs(p[i] - q[i]));
    if (vmax / h < R.sleepV && this.landed) { this.still += h; if (this.still > R.sleepT) this.sleep = true; } else this.still = 0;
  }
  /** Speed (m/s) of point i along the ground, and whether it is on the sand. */
  slide(i) { const j = 3 * i, h = PHYS.ragdoll.h; return { v: Math.hypot(this.p[j] - this.q[j], this.p[j + 2] - this.q[j + 2]) / h, down: this.p[j + 1] <= this.r[i] + 0.01 }; }
}
