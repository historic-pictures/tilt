// TILT physics: the lance as a weighted pole on the rider's arm, and the shock as a collision.
// SI units throughout. Constants live in PHYS (data.js) so they can be re-tuned or ported in one place.
import { PHYS } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The lance point does not go where you look; it is carried there by an arm.
 * Yaw and pitch follow the commanded aim as a damped spring (stiffer once the lance sits in the rest),
 * and are thrown about by the horse's vertical acceleration and by steering.
 */
export class LanceArm {
  constructor() { this.reset(0.3, 0.05); }
  reset(yaw, pitch) { this.yaw = yaw; this.pitch = pitch; this.vy = 0; this.vp = 0; this.err = 0; this.seed = Math.random() * 100; }
  /**
   * o: { set 0..1 (seated in the rest), lanceKg, fatigue 0..1, agit 0..1, aVert m/s², aLat m/s², absorb 0..1 (how much
   *      of the horse's motion the rider soaks up), focus bool, scale (difficulty / shield / health multiplier), t seconds }
   */
  step(dt, cmdYaw, cmdPitch, o) {
    if (dt <= 0) return;
    const L = PHYS.lanceArm;
    const wn = lerp(L.wnLoose, L.wnSet, o.set) * Math.sqrt(L.refKg / o.lanceKg) * (1 - 0.35 * o.fatigue) * (o.focus ? 1.25 : 1);
    const zeta = lerp(L.zetaLoose, L.zetaSet, o.set) * (1 - 0.4 * o.fatigue) + (o.focus ? 0.25 : 0);
    // the lance's weight sits ahead of the hand: any acceleration of the hand levers the point the other way
    const lever = L.lever * (1 - o.absorb) * o.scale * (o.focus ? 0.45 : 1);
    const tremor = (L.tremor + L.tremorFatigue * o.fatigue + L.tremorAgit * o.agit) * o.scale * (o.focus ? 0.4 : 1);
    const t = o.t + this.seed;
    const nY = Math.sin(t * 5.1) + 0.6 * Math.sin(t * 8.7 + 1.3), nP = Math.sin(t * 6.3 + 0.7) + 0.6 * Math.sin(t * 10.9 + 2.1);
    // substep: the spring is stiff and dt varies with slow motion
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const ay = wn * wn * (cmdYaw - this.yaw) - 2 * zeta * wn * this.vy + clamp(o.aLat, -12, 12) * lever * 0.6 + tremor * nY;
      const ap = wn * wn * (cmdPitch - this.pitch) - 2 * zeta * wn * this.vp - clamp(o.aVert, -22, 22) * lever + tremor * nP;
      this.vy += ay * h; this.vp += ap * h; this.yaw += this.vy * h; this.pitch += this.vp * h;
    }
    const e = Math.hypot(this.yaw - cmdYaw, this.pitch - cmdPitch);
    this.err += (e - this.err) * (1 - Math.exp(-dt * 6));   // smoothed pointing error, radians
  }
}

/** Radius of the lance shaft (m) at x metres from the grip. */
export function lanceRadius(x) {
  const S = PHYS.lanceShape;
  if (x <= S[0][0]) return S[0][1];
  for (let i = 1; i < S.length; i++) if (x <= S[i][0]) return lerp(S[i - 1][1], S[i][1], (x - S[i - 1][0]) / (S[i][0] - S[i - 1][0]));
  return S[S.length - 1][1];
}
/**
 * Where the lance fails, in metres from the grip. A stroke that lands square loads the shaft end-on and it bows like a strut, worst in the
 * thin part toward the point; an oblique one bends it like a lever, the load growing toward the hand. Stress goes as load / radius cubed;
 * where those come out nearly equal, the grain (u, a random number for this lance) decides.
 * sinT: sine of the angle between the stroke and square (0 = dead square).
 */
export function breakAt(sinT, u = Math.random()) {
  const B = PHYS.lanceBeam, n = 14, strut = [], lever = [];
  let ms = 0, ml = 0;
  for (let i = 0; i <= n; i++) {
    const x = lerp(B.from, B.to, i / n), r3 = Math.pow(lanceRadius(x), 3);
    strut[i] = Math.sin(Math.PI * (x - B.rest) / (B.tip - B.rest)) / r3; lever[i] = (B.tip - x) / r3;
    ms = Math.max(ms, strut[i]); ml = Math.max(ml, lever[i]);
  }
  let best = 0, bs = -1;
  for (let i = 0; i <= n; i++) {
    const s = ((1 - sinT) * strut[i] / ms + sinT * lever[i] / ml) * (1 + B.flaw * Math.sin(u * 97.1 + i * 2.39));
    if (s > bs) { bs = s; best = i; }
  }
  return lerp(B.from, B.to, best / n);
}

/**
 * One lance striking one target.
 * s (striker): { horseKg, armourKg, lanceKg, breakJ, coupling 0..1 (how well seat, arm and rest lock the rider behind the lance), boost }
 * d (defender): { horseKg, armourKg, braced, seat 0..1, protection 0..1 } or { quintain: true }
 * opts: { lock (saddle hold), sharpJ (J a sharp point needs to unseat), springJ (J at which the shield flies), soft (a stroke on the sack), turned, forceBreak, bite, hold, sharp, square 0..1 (cosine of the angle from square), glance (the point skidded) }
 * Returns { vClose, Eavail, E (J delivered), J (N·s), broke, omega (rad/s kick to the torso), theta (peak lean, rad), thetaMax, unhorse, power }
 */
export function impact(vClose, s, d, zone, cent, opts = {}) {
  const P = PHYS;
  const rider = P.riderKg + s.armourKg;
  const mS = s.lanceKg + (0.25 + 0.55 * s.coupling) * rider + (0.03 + 0.07 * s.coupling) * s.horseKg;
  const mD = d.quintain ? P.quintainKg : 0.6 * (P.riderKg + d.armourKg) + (d.braced ? 0.09 : 0.04) * d.horseKg;
  const mu = mS * mD / (mS + mD);
  const Eavail = 0.5 * mu * vClose * vClose;
  // only a sliver of that reaches the target through the point: it depends on how square and how centred the stroke is
  // (the quintain's board is flat, square-on and backed by its post, so more of the blow goes home)
  const eta = P.pointShare * (opts.bite || 1) * (0.35 + 0.65 * (opts.square ?? 1)) * (opts.glance ? P.glance.keep : 1) * (d.quintain ? 2 : 1) * (0.08 + 0.92 * Math.pow(clamp(cent, 0, 1), 1.2)) * (P.zoneShare[zone] ?? 1) * (opts.turned ? 0.3 : 1) * (opts.pass ?? 1) * (opts.soft ? PHYS.kit.soft : 1);
  const cap = s.breakJ * (0.6 + 0.4 * s.coupling) * (s.boost || 1);   // what the lance can carry before it shatters
  const want = Eavail * eta;
  let broke = (want >= cap || opts.forceBreak) && !opts.turned && !opts.glance && !opts.soft;
  const E = broke ? cap : Math.min(want, cap);
  if (d.quintain) return { vClose, Eavail, E, J: Math.sqrt(2 * P.quintainKg * E), broke, omega: 0, theta: 0, thetaMax: 9, unhorse: false, power: E / P.refJ };
  // the blow lands on the defender's upper body, above the seat: it kicks him back about the hips
  const mU = P.upperKg + 0.5 * d.armourKg, I = P.upperInertia + 0.2 * d.armourKg;
  // a shield that gives way (the Renntartsche on its spring) takes up a share of the blow, once, and the stroke scores for it
  const sprang = !!opts.springJ && zone === 'shield' && !opts.glance && !opts.turned && !opts.soft && cent >= P.kit.springCent && E >= opts.springJ;
  const J = Math.sqrt(2 * mU * E) * (sprang ? 1 - P.kit.springAbsorb : 1);
  const lever = P.zoneLever[zone] ?? 0.35;
  const omega = J * lever / I;
  const K = P.seatK * (0.7 + 0.6 * (d.seat ?? 0.6)) + (d.braced ? P.braceK : 0);
  const theta = omega / Math.sqrt(K / I) * (1 - P.kit.lockTheta * ((opts.lock ?? 1) - 1));                                  // peak lean of an undamped seat
  const thetaMax = (P.seatMax + 0.15 * ((d.protection ?? 0.7) - 0.55)) * (opts.hold || 1);     // deep jousting saddles and locked harness hold longer
  const unhorse = (broke || (opts.sharp && E >= (opts.sharpJ || 0))) && theta * (1 + (Math.random() - 0.5) * 0.12) > thetaMax;   // a sharp point that has bitten bears him back whether or not the lance breaks
  return { vClose, Eavail, E, J, broke, omega, theta, thetaMax, unhorse, sprang, power: E / P.refJ };
}
