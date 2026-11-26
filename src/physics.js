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
export function breakAt(sinT, u = Math.random(), rs = 1) {
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
  return lerp(B.from, B.to, best / n) * rs;      // (rs: this lance's length over the 2.8 m the numbers are written for; a longer lance fails proportionally farther out)
}

// ------------------------------------------------------------------------------------------------ seeded randomness
/** A small seeded random stream (mulberry32): the same seed gives the same numbers on every machine. */
export function rng32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Mix integers into one 32-bit seed (match seed, course, side...). */
export function seedOf(...k) { let h = 0x811c9dc5; for (const v of k) { h ^= (v | 0); h = Math.imul(h, 0x01000193); h ^= h >>> 13; } return h >>> 0; }

/**
 * Does the point bite, or skid? A point meeting a surface at theta degrees from square stays put only while the sideways share of the
 * blow is inside its grip (the friction cone of the coronel's prongs or a sharp point in the surface): theta below `limitDeg` bites.
 * The surface is not perfect (a boss, a rivet, the grain of the shield's wood): the limit is scattered by PHYS.glance.scatter degrees (u: a seeded draw).
 */
export function bites(cosT, limitDeg, u = 0.5) {
  const th = Math.acos(clamp(cosT, 0, 1)) * 57.29578;
  return th <= limitDeg + (u - 0.5) * 2 * (PHYS.glance.scatter || 0);
}

/** The reference stroke ("power" 1): a standard lance broken square and true on a shield, from the rest, at 14 m/s closing. Computed once. */
let REF = null;
/** Forget the cached reference stroke (after re-tuning PHYS.impact at run time). */
export function resetRef() { REF = null; }
export function refStroke() {
  if (REF) return REF;
  const R = PHYS.impact.ref, h = impact(R.v, { horseKg: 560, armourKg: 30, lanceKg: PHYS.lance.standard.kg, failN: PHYS.lance.standard.failN, coupling: R.q }, { horseKg: 560, armourKg: 30, braced: false, seat: 0.6, protection: 0.7 }, 'shield', 1, { square: 1, forceBreak: true, rng: () => 0.5, ref: true });
  REF = { J: h.J, Ework: h.Ework, tb: h.tb };
  return REF;
}

/**
 * One lance striking one target: a collision of two bodies through a spring (the armour, the padding under it, the shield on its strap) with
 * the lance as a strut that fails at a load.
 *
 *   masses   the striker's side is the lance plus as much of him and his horse as seat, arm and rest lock behind it (coupling); the defender's
 *            side is the part of him the point must move in the first few hundredths of a second (head and helm, shield and arm, the trunk),
 *            less when the point lands off the centre of that part (a rigid body struck at r from its centre has 1/m_eff = 1/m + r^2/I).
 *   contact  normal closing speed vn = v cos(theta). Through a contact stiffness k the force rises as a half sine: F(t) = vn sqrt(k mu) sin(w t),
 *            w = sqrt(k/mu). The rider's grip and the rest can only pass so much force (hold); past that the lance slides back in the hand and
 *            only the lance's own mass drives on.
 *   lance    it fails when the force reaches its strength (failN, x the grain of this lance, less when it is loaded obliquely and bends).
 *            It flexes for tb = asin(Fcap/F)/w seconds first (a few to a few tens of ms), then breaks; the impulse it delivered is what the
 *            force carried up to then. A lance that holds delivers the whole bounce, (1 + e) mu vn: so a strong lance that does NOT break hits hardest.
 *   glance   past the grip angle (see bites) the point skids: only the normal impulse and the sliding friction (impact.slipMu) go home, nothing breaks.
 *   seat     the impulse J at height h above the seat kicks the trunk back about the hips: omega = J h / I. The seat holds like a spring K (seat,
 *            leaning in); the cantle and harness (hold) set how far he can go (thetaMax). Peak lean theta = omega / sqrt(K / I); past thetaMax he goes over.
 *   recoil   the striker takes the same impulse back through the rest and his arm (Newton's third law).
 *
 * s (striker): { horseKg, armourKg, lanceKg, failN (N), coupling 0..1, boost (the thrust and the hidden arts: x the hand's speed and hold) }
 * d (defender): { horseKg, armourKg, braced, seat 0..1, protection 0..1 } or { quintain: true }
 * opts: { square 0..1 (cos of the angle from square), glance (the point skidded), h (m: contact height above the seat, else PHYS.zoneLever), lock, hold (cantle),
 *         queue (a queue catches the lance), sharp, sharpJ (J), springJ (J), soft, turned, forceBreak, bite, pass, rng (seeded () => 0..1) }
 * Returns, besides the old fields (vClose, Eavail, E, J, broke, omega, theta, thetaMax, unhorse, sprang, power):
 *   vn, vt (m/s), mS, mD, mu (kg), k (N/m), Fpeak, Fpoint, Fcap (N), load (Fpoint / Fcap), slip (the lance slid in the hand), tb (s, flex before the break),
 *   tc (s, contact), Jn, Jt (N·s), recoil (N·s on the striker), wSeat (rad/s, his seat's natural frequency), wOver (rad/s left when he goes over), u (the draws)
 */
export function impact(vClose, s, d, zone, cent, opts = {}) {
  const P = PHYS, I = P.impact, rng = opts.rng || Math.random;
  const u = { grain: rng(), seat: rng(), at: rng() };      // always three draws, in this order: the stream stays in step whatever the outcome
  const sq = clamp(opts.square ?? 1, 0, 1), sinT = Math.sqrt(1 - sq * sq);
  const rider = P.riderKg + s.armourKg, q = clamp(s.coupling, 0, 1), boost = s.boost || 1;
  const mS = s.lanceKg + (0.25 + 0.55 * q) * rider + (0.03 + 0.07 * q) * s.horseKg;
  // ---- the defender's side of the contact
  let mD;
  if (d.quintain) mD = P.quintainKg;
  else {
    const Z = I.mass[zone] || I.mass.body, up = P.upperKg + 0.5 * d.armourKg;
    mD = Z.base + Z.arm * d.armourKg + Z.up * up + Z.horse * (d.braced ? 2 : 1) * d.horseKg * (opts.lock ?? 1);
    const off = (1 - clamp(cent, 0, 1)) / I.gyr;                       // off the centre of what it struck, in radii of gyration
    mD /= 1 + off * off;
  }
  const mu = mS * mD / (mS + mD), mL = s.lanceKg, muL = mL * mD / (mL + mD);
  const k = (d.quintain ? I.k.quintain : I.k[zone] || I.k.body) * (opts.soft ? P.kit.soft : 1) * (opts.bite || 1);      // (a sharp point digs in: a stiffer contact)
  const w = Math.sqrt(k / mu), vn = vClose * sq * (1 + I.thrust * (boost - 1)), vt = vClose * sinT;
  const Fpeak = vn * Math.sqrt(k * mu);
  // ---- the hand: what the grip and the rest can pass before the lance slides back (the queue of a Rennzeug catches it)
  const Fhold = lerp(I.hold.loose, I.hold.rest, Math.pow(q, I.hold.exp)) * boost * (opts.queue ? I.hold.queue : 1);
  const FlanceOnly = vn * Math.sqrt(k * muL);
  const slip = Fpeak > Fhold + FlanceOnly;
  const Fpoint = slip ? Fhold + FlanceOnly : Fpeak;
  const wEff = w;      // (slipping, the pulse keeps the whole pair's period but carries only the force the hand could pass)
  // ---- the lance's strength this time
  const Fcap = (s.failN || 6500) * (1 + I.grain * (u.grain * 2 - 1)) * (1 - I.bend * sinT);
  const glance = !!opts.glance, turned = !!opts.turned, soft = !!opts.soft;
  const broke = !glance && !turned && !soft && (Fpoint >= Fcap || !!opts.forceBreak);
  const e = I.e;
  let Jn, Jt, tb = 0, tc = Math.PI / wEff;
  if (broke) {
    const F = Math.max(Fpoint, Fcap * 1.0001), x = Math.asin(Math.min(1, Fcap / F));
    tb = x / wEff;
    Jn = (F / wEff) * (1 - Math.cos(x)) + I.after * mL * vn;          // what the force carried while the shaft bowed, and the broken head's own momentum
    Jt = Math.min(I.gripMu * Jn, mu * vt * x / Math.PI);              // (the sideways part, for as long as the point held)
    tc = tb;
  } else {
    // the lance holds: the whole bounce, (1 + e) mu vn. If it slid in the hand, only the lance's own bounce and the hand's drag for the contact go home.
    const Jhold = slip ? (1 + e) * muL * vn + Fhold * Math.min(I.slipT, 2 / wEff) : (1 + e) * mu * vn;      // (slipT: until the lance has slid back to the stop, or skidded off)
    if (glance) { Jn = Jhold * I.glanceShare; Jt = I.slipMu * Jn; tc *= I.glanceShare; }      // the point slides off the curved face before the normal speed is stopped; the sideways part only rubs
    else { Jn = Jhold; Jt = Math.min(I.gripMu * Jn, mu * vt); }         // a biting point also carries the sideways part with it
  }
  if (turned) { Jn *= I.turned; Jt *= I.turned; }
  Jn *= opts.pass ?? 1;
  const Jtot = Math.hypot(Jn, Jt);
  const Eavail = 0.5 * mu * vClose * vClose;
  // Ework: the energy the stroke took out of the closing motion (the work of the impulse on the reduced pair, J). E: the stroke on the old
  // yardstick, power x PHYS.refJ (so "a share of refJ" thresholds such as kit.sharpJ and kit.spring keep their meaning).
  const Ework = Math.max(0, vn * Jn - Jn * Jn / (2 * mu));
  const R0 = opts.ref ? { J: Jtot || 1 } : refStroke();
  let power = Jtot / R0.J, E = power * P.refJ;
  if (d.quintain) return { vClose, vn, vt, mS, mD, mu, k, Fpeak, Fpoint, Fcap, load: Fpoint / Fcap, slip, tb, tc, Jn, Jt, Eavail, Ework, E, J: Jtot, broke, omega: 0, theta: 0, thetaMax: 9, unhorse: false, sprang: false, recoil: Jtot, power, wSeat: 0, wOver: 0, u };
  // ---- a shield that gives way (the Renntartsche on its spring) takes up a share of the blow, once, and the stroke scores for it
  const sprang = !!opts.springJ && zone === 'shield' && !glance && !turned && !soft && cent >= P.kit.springCent && E >= opts.springJ;
  let Jb = Jtot * (sprang ? 1 - P.kit.springAbsorb : 1);
  // ---- the seat: the impulse levers his trunk back about the hips
  const Iu = P.upperInertia + 0.2 * d.armourKg;
  const h = opts.h ?? P.zoneLever[zone] ?? 0.35;
  const omega = Jb * clamp(h, 0.05, 1.0) * (0.25 + 0.75 * sq) / Iu;      // (the part of the impulse along the lance's line does the levering; the sideways rub mostly turns him)
  const K = P.seatK * (0.7 + 0.6 * (d.seat ?? 0.6)) + (d.braced ? P.braceK : 0);
  const wSeat = Math.sqrt(K / Iu);
  const theta = omega / wSeat * (1 - P.kit.lockTheta * ((opts.lock ?? 1) - 1));
  const thetaMax = (P.seatMax + 0.15 * ((d.protection ?? 0.7) - 0.55)) * (opts.hold || 1);
  const sharpOk = !opts.sharp || E >= (opts.sharpJ || 0);
  const unhorse = !turned && !soft && sharpOk && theta * (1 + (u.seat - 0.5) * 2 * I.seatScatter) > thetaMax;
  // what is left of his turning when the cantle no longer holds him: he goes over with it
  const wOver = unhorse ? Math.sqrt(Math.max(0, omega * omega - (wSeat * thetaMax) ** 2)) : 0;
  if (sprang) { power *= 1 - P.kit.springAbsorb; E = power * P.refJ; }
  return { vClose, vn, vt, mS, mD, mu, k, Fpeak, Fpoint, Fcap, load: Fpoint / Fcap * (glance ? I.glanceShare : 1), slip, tb, tc, Jn, Jt, Eavail, Ework, E, J: Jb, broke, omega, theta, thetaMax, unhorse, sprang, recoil: Jtot, power, wSeat, wOver, u };
}

/** The old energy-share model (kept for comparison in tools/sim_strikes.mjs; nothing in the game calls it). */
export function impactLegacy(vClose, s, d, zone, cent, opts = {}) {
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
  const unhorse = (broke || (opts.sharp && E >= (opts.sharpJ || 0))) && theta * (1 + ((opts.rng || Math.random)() - 0.5) * 0.12) > thetaMax;   // a sharp point that has bitten bears him back whether or not the lance breaks
  return { vClose, Eavail, E, J, broke, omega, theta, thetaMax, unhorse, sprang, power: E / P.refJ };
}
