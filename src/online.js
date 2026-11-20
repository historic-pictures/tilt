// online.js - the pure parts of "Joust a friend": what a player sends about himself, what is trusted when it arrives, the rider-state stream
// and its interpolation buffer, and the mirror between the two worlds.
//
// THE MIRROR. Each player's screen is the same world with himself as `player` (riding +z on his first course, on the x < 0 side of the tilt) and the friend as `opp`.
// The friend's own world is that world turned 180 degrees about the middle of the lists (the origin), so his rider is shown at (-x, y, -z), yawed by PI, riding the other way
// (dir = -dir). Local quantities (lance lowering, aim, brace, guard, speed, the horse's gait) are in the rider's own frame and copy across unchanged.
import * as THREE from 'three';
import { filterName } from './namefilter.js';
import { HORSES, ARMOURS, HELMS, CAPARISONS, LANCES, MODES, VENUES, bondLevel, rankOf, RANKS } from './data.js';

export const PROTOCOL = 1;
export const SEND_HZ = 30;
export const INTERP_DELAY = 0.1;      // seconds the friend's rider is shown behind his newest sample
const HEX = /^#[0-9a-fA-F]{6}$/;
const WORD = /^[a-z]{3,14}$/;
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

/** A name typed by a player: no markup, at most 22 characters, never empty (it is put into the page, so it is cleaned again when it arrives). */
export const cleanName = (v) => String(v == null ? '' : v).replace(/[^\p{L}\p{N} .,'’\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 22) || 'Sir Nameless';

/** A name from somebody else, as it may be shown: cleaned, and "A knight" if it is on the block-list. */
export const safeName = (v) => filterName(cleanName(v));

/** The modes a friendly online joust may use: not Keep the Bridge (a queue of challengers) nor Judged Tilt (a card of style marks that needs both riders' lance work). */
export const onlineModeIds = () => Object.values(MODES).filter(m => !m.bridge && !m.style).map(m => m.id);

/** What goes to the friend: name, arms, and what he rides and wears. No progress (renown, purse, skills). */
export function packProfile(p) {
  const a = p.arms || {};
  return { t: 'hi', v: PROTOCOL, name: cleanName(p.name), arms: JSON.parse(JSON.stringify({ c1: a.c1, c2: a.c2, c3: a.c3, pattern: a.pattern, charge: a.charge, over: a.over })), horse: p.horse, armour: p.armour, helm: p.helm, lance: p.lance || 'standard',
    cap: p.caparison || 'livery', bond: bondLevel((p.bond || {})[p.horse]), land: RANKS[rankOf(p.renown)].name };
}
const cleanArms = (a) => {
  a = a || {};
  const o = { c1: HEX.test(a.c1) ? a.c1 : '#1f4690', c2: HEX.test(a.c2) ? a.c2 : '#e0b83c', c3: HEX.test(a.c3) ? a.c3 : '#ece8dc', pattern: WORD.test(a.pattern) ? a.pattern : 'plain', charge: WORD.test(a.charge) ? a.charge : 'none' };
  if (Array.isArray(a.over)) o.over = a.over.slice(0, 3).filter(x => x && WORD.test(x.kind) && HEX.test(x.c)).map(x => ({ kind: x.kind, c: x.c }));
  return o;
};
/** What arrived, made safe: unknown ids fall back to something that exists, strings are cleaned. Returns null if it is not a profile at all. */
export function cleanProfile(m) {
  if (!m || typeof m !== 'object' || m.t !== 'hi') return null;
  const horse = HORSES[m.horse] ? m.horse : 'rouncey', armour = ARMOURS[m.armour] ? m.armour : 'mail';
  const helm = HELMS[m.helm] ? m.helm : ARMOURS[armour].helm;
  return { rid: typeof m.rid === 'string' && /^[0-9a-f]{16}$/.test(m.rid) ? m.rid : '', name: safeName(m.name), arms: cleanArms(m.arms), horse, armour, helm, lance: LANCES[m.lance] ? m.lance : 'standard', cap: CAPARISONS[m.cap] ? m.cap : 'livery', bond: num(m.bond | 0, 1, 4, 1),
    land: typeof m.land === 'string' ? m.land.replace(/[^\p{L} .'’\-]/gu, '').slice(0, 30) : '' };
}
/** The friend as an opponent record (what the roster's knights are in src/data.js), so that the rest of the game can treat him like one. */
export function onlineOd(f, ovrOf) {
  const H = HORSES[f.horse], A = ARMOURS[f.armour];
  const od = { id: 'friend', name: f.name, short: f.name, land: f.land || 'the lists', arms: f.arms, horse: f.horse, armour: f.armour, helm: f.helm, lance: f.lance, cap: f.cap, online: true,
    skill: 0.42 + 0.07 * (f.bond - 1), seat: A.protection * 0.85, drive: (H.top - 7.2) / 2 };
  od.bio = `${H.name}, ${(HELMS[f.helm] || {}).name || 'helm'}`;
  return od;
}
/** The room's settings, checked (guest side). */
export function cleanRoom(m) {
  const ok = onlineModeIds(), mode = ok.includes(m && m.m) ? m.m : 'planken', v = Number.isInteger(m && m.v) && m.v >= 0 && m.v < VENUES.length ? m.v : 0;
  return { v, m: mode, c: Number.isInteger(m && m.c) && m.c >= 3 && m.c <= 20 ? m.c : 5 };
}

// ------------------------------------------------------------------ the rider-state stream
const FIELDS = ['x', 'z', 'ry', 'rz', 'sp', 'll', 'ax', 'ay', 'az', 'br', 'gd', 'rs', 'lk', 're', 'ag', 'sq'];
const LIM = { x: 60, z: 120, ry: 40, rz: 4, sp: 30, ll: 1.2, ax: 1.2, ay: 1.2, az: 1.2, br: 1.2, gd: 1.2, rs: 1.2, lk: 1.2, re: 1.5, ag: 2, sq: 1.5 };
/** One sample of a rider, rounded for the wire. extra: { n: course, md: mode letter, rP: lance raised, sq: stroke quality }. */
export function packRider(j, extra) {
  const p = j.root.position, o = {
    t: 's', x: r2(p.x), z: r2(p.z), ry: r3(j.root.rotation.y), rz: r3(j.root.rotation.z), sp: r2(j.speed), d: j.dir, ll: r2(j.lanceLower), ax: r3(j.aimLocal.x), ay: r3(j.aimLocal.y), az: r3(j.aimLocal.z),
    br: r2(j.brace), gd: r2(j.guard), rs: r2(j.raiseT), lk: r2(j.look), vu: j.visorUp ? 1 : 0, ho: j.helmOff ? 1 : 0, re: r2(j.rear), ag: r2(j.agit || 0), lb: j.lanceBroken ? 1 : 0, u: j.unhorsed ? 1 : 0 };
  if (j.unhorsed) { const q = j.rider.quaternion, rp = j.rider.position; o.rp = [r2(rp.x), r2(rp.y), r2(rp.z)]; o.rq = [r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; o.tx = r2(j.torso.rotation.x); }
  return Object.assign(o, extra);
}
/** A sample that arrived, checked field by field; null if it is rubbish. */
export function cleanState(m) {
  if (!m || typeof m.ts !== 'number' || !Number.isFinite(m.ts)) return null;
  const o = { ts: m.ts, d: m.d === -1 ? -1 : 1, vu: m.vu ? 1 : 0, ho: m.ho ? 1 : 0, lb: m.lb ? 1 : 0, u: m.u ? 1 : 0, rP: m.rP ? 1 : 0, n: num(m.n | 0, 0, 999), md: typeof m.md === 'string' ? m.md.slice(0, 1) : 'r' };
  for (const k of FIELDS) { if (typeof m[k] !== 'number' || !Number.isFinite(m[k])) return null; o[k] = num(m[k], -LIM[k], LIM[k]); }
  if (o.u && Array.isArray(m.rp) && m.rp.length === 3 && Array.isArray(m.rq) && m.rq.length === 4) { o.rp = m.rp.map(v => num(v, -300, 300)); o.rq = m.rq.map(v => num(v, -1.1, 1.1)); o.tx = num(m.tx, -4, 4); }
  return o;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, k) => a + (b - a) * k;
/** The interpolation buffer: samples in the sender's own clock; shown INTERP_DELAY behind the newest, advanced by our own frame time. */
export class Remote {
  constructor() { this.reset(); }
  reset() { this.buf = []; this.newest = -1; this.rt = 0; this.has = false; this.cur = null; }
  push(s) {
    const b = this.buf; if (b.length && s.ts <= b[b.length - 1].ts) return;
    b.push(s); if (b.length > 120) b.shift(); this.newest = s.ts;
    if (!this.has) { this.has = true; this.rt = s.ts - INTERP_DELAY; }
  }
  /** Move the shown time on by dt and return the sample for it (a fresh object; null before anything has arrived). */
  step(dt) {
    if (!this.has) return null;
    this.rt += dt; const lag = this.newest - this.rt;
    if (lag > 0.3 || lag < 0) this.rt = this.newest - INTERP_DELAY; else if (lag < 0.03) this.rt = this.newest - 0.03;
    const b = this.buf, t = this.rt; let i = b.length - 1;
    while (i > 0 && b[i - 1].ts > t) i--;       // b[i-1].ts <= t (or i = 0)
    const a = b[Math.max(0, i - 1)], c = b[i];
    let k = c.ts > a.ts ? (t - a.ts) / (c.ts - a.ts) : 1; k = Math.min(1, Math.max(0, k));
    if (a.d !== c.d || a.n !== c.n || a.u !== c.u) return (this.cur = Object.assign({}, k < 0.5 ? a : c));
    const o = Object.assign({}, k < 0.5 ? a : c);
    for (const f of FIELDS) o[f] = lerp(a[f], c[f], k);
    o.ry = a.ry + wrap(c.ry - a.ry) * k; o.rz = a.rz + wrap(c.rz - a.rz) * k;
    if (a.rp && c.rp) { o.rp = a.rp.map((v, j) => lerp(v, c.rp[j], k)); o.rq = k < 0.5 ? a.rq : c.rq; }
    return (this.cur = o);
  }
}
const _q = new THREE.Quaternion(), _yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
/** Put the friend's sample on the rider that stands for him in our world (see the mirror above). */
export function applyRider(j, s) {
  j.remote = true; j.manualPos = true; j.dir = -s.d;
  j.root.position.set(-s.x, 0, -s.z); j.root.rotation.set(0, s.ry + Math.PI, s.rz);
  j.speed = s.sp; j.lanceLower = s.ll; j.aimLocal.set(s.ax, s.ay, s.az).normalize(); j.brace = s.br; j.guard = s.gd; j.raiseT = s.rs; j.look = s.lk; j.rear = s.re; j.agit = s.ag;
  j.visorUp = !!s.vu; j.helmOff = !!s.ho;
  if (j.unhorsed && s.u && s.rp) {
    j.rider.position.set(-s.rp[0], s.rp[1], -s.rp[2]); _q.set(s.rq[0], s.rq[1], s.rq[2], s.rq[3]).normalize(); j.rider.quaternion.copy(_yaw).multiply(_q); j.torso.rotation.x = s.tx;
  }
}
export const mirrorVec = (v) => [-v[0], v[1], -v[2]];
/** A match result seen from the other side. */
export const MIRROR_RESULT = { win: 'loss', loss: 'win', 'win-unhorse': 'loss-unhorse', 'loss-unhorse': 'win-unhorse', 'win-dq': 'loss-dq', 'loss-dq': 'win-dq', 'loss-yield': 'win-yield', 'win-yield': 'loss-yield', draw: 'draw' };

// ------------------------------------------------------------------ what the host says about a stroke (checked: some of it is written into the page)
const ZONES = ['shield', 'helm', 'body', 'horse', 'miss', 'none'], CODES = ['m', 'a', 'b', 'h', 'u', 'f'];
const txt = (s) => String(s == null ? '' : s).replace(/[<>&"`]/g, '').slice(0, 120);
const pair = (a) => (Array.isArray(a) && a.length === 2 ? [num(a[0], -9, 9), num(a[1], -9, 9)] : [0, 0]);
export function cleanRes(r) {
  if (!r || typeof r !== 'object') return null;
  const o = { zone: ZONES.includes(r.zone) ? r.zone : 'miss', pts: num(r.pts, -20, 20), code: CODES.includes(r.code) ? r.code : 'm', text: txt(r.text), broke: !!r.broke, unhorse: !!r.unhorse, foul: !!r.foul, across: !!r.across, up: !!r.up, early: !!r.early,
    glanced: !!r.glanced, turned: !!r.turned, power: num(r.power, 0, 3), cent: num(r.cent, 0, 1), spoiled: num(r.spoiled, 0, 1), skid: ZONES.includes(r.skid) ? r.skid : null, off: pair(r.off) };
  for (const k of ['E', 'J', 'v', 'theta', 'thetaMax']) if (typeof r[k] === 'number') o[k] = num(r[k], 0, 1e6);
  return o;
}
export const cleanNear = (n) => (n && typeof n === 'object' && ZONES.includes(n.zone) ? { d: num(n.d, -5, 50), zone: n.zone, off: pair(n.off) } : null);
export { num as clampNum };
