// attract.js - the menu joust: two knights ride endless passes down the lists behind the main menu.
//
// Nothing here is a match. There is no score, no profile, no voice and no HUD: two Jouster puppets (the same horse and rider as the game) are driven by a small script
// (ride up, salute, charge, strike, run out, wheel about, repeat) and the outcome of every blow is decided in advance, so a lance breaks, glances or misses but nobody
// is ever unhorsed. The blow itself is dressed with the game's own effects (Jouster.hit / bendLance / pinLance / breakLance, fx.lanceBurst, fx.sparks) and the crowd
// reacts through the same event the real strokes use. Cameras are slow cinematic shots chosen for a menu backdrop; the menu panel's free space is found in the page and
// the picture is shifted into it with a view offset.
//
// WHEN IT RUNS: only on Medium and High graphics (Low keeps the plain backdrop and never even downloads the riders), only after the menu has been up for a moment and the
// background downloads (trees, props, the player's own rider) are finished, only while a menu screen that has no 3D of its own is showing, never while the tab is hidden,
// never during a match (the riders are taken out of the scene, kept, and put back when the menu returns). The player's switch (Settings > Graphics > Menu joust) and a
// frame-time check (the menu draws at 30 a second; if the frames keep taking far longer it switches itself off and remembers) can turn it off.
//
// main.js owns the scene, the camera and the loop; it hands what is needed in `ctx` and calls update() once a menu frame.
import * as THREE from 'three';
import { GFX, judge } from './gfx.js';
import { KNIGHTS, HORSES, LANCES, harness } from './data.js';
import { LANE_X, START_Z, LIST_HALF } from './world.js';
import { refStroke } from './physics.js';
import { preloadRider, rigHas } from './rider_rig.js';
import { menuJoustOn, joustCap, capMenuJoust, attractParam } from './attract_pref.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** menu screens the joust plays behind (the armoury and the stable use the 3D view themselves; online, account and store are left alone on purpose) */
const VIEWS = new Set(['main', 'welcome', 'settings', 'how', 'feats', 'rankings', 'skills', 'circuit', 'exhibition']);
const WARM_MS = 2500, WINDOW_MS = 4000;      // frame-time check: ignore the first moments (shaders, uploads), then judge windows of this many ms
const IDLE_BEFORE = 1.8;                     // seconds of a shown, settled menu before anything is downloaded or built
const TOP_BODY = 0.97;                        // the pass is ridden a little under the horse's top speed
const GAP_LANCE = 36;                         // metres between the riders at which the lances come down

const _pos = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();

export function createAttract(ctx) {
  const { scene, camera, fx, makeRider, S, audio } = ctx;
  const P = attractParam();
  const A = {
    phase: 'idle',        // idle -> loading -> building -> ready (riders exist) ; running while it draws
    running: false, parked: true, riders: null, defs: null, ctrl: null, menuT: 0, ts: 1, tsT: 1, slowT: 0, passN: 0, why: '',
    cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, snap: true, t: 0, kind: '', dur: 0, side: 1, shot: null },
    meter: { ms: [], sum: 0, warm: 0, bad: 0, since: 0 },
    stats: { passes: 0, breaks: 0, glances: 0, misses: 0, slow: 0, shots: {} },
  };
  let loadP = null, frame = null, frameT = 0;

  // ------------------------------------------------------------------ who rides
  /** Two different knights from the circuit: different arms, horse and harness. */
  function chooseDefs() {
    const pool = KNIGHTS.filter((k) => k.horse && k.armour && HORSES[k.horse]);
    let a = pick(pool), b = a, n = 0;
    while ((b === a || b.armour === a.armour || b.horse === a.horse) && n++ < 40) b = pick(pool);
    if (b === a) b = pool.find((k) => k !== a) || a;
    return [a, b].map((k) => ({ id: k.id, arms: k.arms, horse: k.horse, armour: k.armour, helm: k.helm, lance: k.lance || 'standard', armourTint: k.armourTint, armourDef: harness(k.armour, k.helm) }));
  }
  const want = (defs) => ({ armour: defs.map((d) => d.armour), helm: defs.map((d) => d.armourDef.helm), lance: defs.map((d) => d.lance) });

  /** Is everything the riders need already on this page (the horse is, from the menu's boot; the rig is fetched here)? */
  function ensureAssets() {
    if (!A.defs) A.defs = chooseDefs();
    if (loadP) return;
    loadP = preloadRider(want(A.defs)).catch(() => false).then(() => { A.phase = 'building'; });
    A.phase = 'loading';
  }
  /** Build one rider per call (each is a few tens of milliseconds: never both in one frame). */
  function buildStep() {
    if (!rigHas(want(A.defs))) return;      // (the rig may have failed: rigHas is then true and the code-built rider is used)
    if (!A.riders) A.riders = [];
    const i = A.riders.length, d = A.defs[i], dir = i === 0 ? 1 : -1;
    const j = makeRider(d, dir);
    j.setCaparison('livery');
    scene.remove(j.root);      // (put in the scene only while it plays)
    A.riders.push(j);
    if (A.riders.length === 2) {
      A.ctrl = A.riders.map(() => ({ stage: 'up', t: 0, o: null, struck: false, done: false }));
      A.phase = 'ready';
    }
  }

  // ------------------------------------------------------------------ the pass
  /** What each stroke of the coming pass will do. At least one lance usually breaks; never both miss; nobody falls. */
  function makePlan() {
    const kinds = () => { const r = Math.random(); return r < 0.52 ? 'break' : r < 0.8 ? 'glance' : 'miss'; };
    const zone = (k) => { const r = Math.random(); return k === 'glance' ? (r < 0.6 ? 'shield' : 'helm') : r < 0.45 ? 'shield' : r < 0.75 ? 'helm' : 'body'; };
    const o = [0, 1].map(() => { const k = kinds(); return { kind: k, zone: zone(k), power: rnd(0.62, 0.98) }; });
    if (o[0].kind === 'miss' && o[1].kind === 'miss') o[Math.random() < 0.5 ? 0 : 1] = { kind: 'glance', zone: 'shield', power: 0.5 };
    if (!o.some((x) => x.kind === 'break') && Math.random() < 0.7) { const i = Math.random() < 0.5 ? 0 : 1; o[i] = { kind: 'break', zone: zone('break'), power: rnd(0.65, 0.98) }; }
    const hasBreak = o.some((x) => x.kind === 'break');
    const last = A.lastShot;
    const narrow = viewOffset().k < 0.5;      // a narrow strip of free page suits shots along the lists; side-on shots need room
    let shot = A.forceShot || pick(narrow ? ['wide', 'chase', 'skim', 'impact', 'impact'] : ['wide', 'chase', 'track', 'skim', 'impact', 'impact']);      // (forceShot: a test hook)
    if (!A.forceShot && shot === last) shot = pick(['chase', 'skim', 'wide']);
    if (!A.forceShot && shot === 'impact' && !hasBreak) shot = 'chase';
    return { o, shot, slow: shot === 'impact', side: Math.random() < 0.5 ? -1 : 1, who: Math.random() < 0.5 ? 0 : 1 };
  }

  /** Set both riders at their marks for the next pass (after the first, they arrive there from the turn). */
  function beginReady(c, i) { c.stage = 'ready'; c.t = i === 0 ? 0 : rnd(0.2, 0.6); c.struck = false; c.done = false; c.sal = 0; }

  function startPass() {
    A.plan = makePlan(); A.lastShot = A.plan.shot; A.passN++; A.stats.passes++;
    A.passT = 0; A.strikes = 0; A.slowFired = false; A.afterT = null; A.impactCut = false; A.impactDone = false; A.turnCut = false; A.readyCut = false;
    A.ctrl.forEach((c, i) => {
      const j = A.riders[i];
      c.stage = 'charge'; c.t = 0; c.struck = false; c.done = false; c.out = A.plan.o[i];
      c.top = HORSES[j.horseDef.id || A.defs[i].horse].top * TOP_BODY * rnd(0.96, 1.03); c.go = i === 0 ? 0 : rnd(0.05, 0.3);
      c.jit = new THREE.Vector2(rnd(-0.05, 0.05), rnd(-0.05, 0.05)); c.low = 0;
      j.raiseT = 0;
    });
    cut(A.plan.shot === 'impact' ? 'wide' : A.plan.shot, { who: A.plan.who });
  }

  /** Is the horse's pace up to the gallop? (the real game's acceleration curve, lighter) */
  function gallop(j, c, dt) {
    const H = j.horseDef, ar = j.armourDef || {};
    const acc = (H.accel || 3) / Math.sqrt(ar.weight || 1) * (0.55 + 0.45 * smooth(0, 4, j.speed + 1.5));
    if (c.t < c.go) return;
    j.speed = j.speed < c.top ? Math.min(c.top, j.speed + acc * 0.9 * dt) : j.speed;
  }
  const gapOf = () => { const [p, q] = A.riders; return (q.z - p.z) * p.dir; };

  function aimAt(j, o, c, dt) {
    const foe = A.riders[1 - A.riders.indexOf(j)];
    foe.zoneWorld(o.zone, _a);
    if (o.kind === 'glance') { _a.x += Math.sign(foe.root.position.x || 1) * 0.16; _a.y += 0.05; }
    else if (o.kind === 'miss') { _a.x += Math.sign(foe.root.position.x || 1) * 0.9; _a.y += 0.2; }
    _a.x += c.jit.x; _a.y += c.jit.y;
    j.gripWorld(_b); _c.subVectors(_a, _b).normalize();
    j.setAim(_c);
  }

  /** The blow: what the stroke looks like, by the outcome decided for it. No score, no damage, no fall. */
  function strike(i) {
    const Aj = A.riders[i], Bj = A.riders[1 - i], c = A.ctrl[i], o = c.out;
    c.struck = true; A.strikes++;
    Aj.tipWorld(_a); const tip = _a.clone();
    const dir = _d.set(0, 0.04, Aj.dir).normalize().clone(), power = o.power;
    if (o.kind === 'miss') {
      A.stats.misses++; react(Math.abs(tip.x - Bj.root.position.x) < 1.2 && o.zone === 'helm' ? 'near' : 'miss');
      return;
    }
    const broke = o.kind === 'break', zone = o.zone, glanced = o.kind === 'glance';
    Bj.zoneWorld(zone, _b); const centre = _b.clone();
    // the blow in the struck man: his own springs, never a fall (Jouster.hit only moves the puppet's reaction; unhorse() is never called here)
    const hk = clamp(power * (zone === 'helm' ? 2.8 : zone === 'body' ? 2.4 : 1.9) * (glanced ? 0.45 : 1), 0.5, 3.2);
    Bj.hit(hk, true, { dir, pt: tip, power: glanced ? power * 0.5 : power, J: refStroke().J * power * (glanced ? 0.4 : 0.85), headMul: 1, zone, lat: clamp((tip.x - centre.x) * 0.4, -1, 1) });
    if (Aj.strikeKick) Aj.strikeKick(power * (glanced ? 0.3 : 0.55), dir.clone().negate(), broke);
    const dv = (glanced ? 0.2 : 0.5) + power * 0.5;
    Bj.speed = Math.max(0, Bj.speed - dv); Aj.speed = Math.max(0, Aj.speed - dv * 0.5);
    fx.sparks(tip.clone(), glanced ? 7 : 10 + (power * 12 | 0), glanced ? 3 : 4 + power * 3);
    ctx.shake(glanced ? 0.08 : 0.12 + power * 0.2);
    // the point stays on his surface (the lance goes back in the hand and bows, or skids off) and never goes through him
    const part = { shield: Bj.shield, helm: Bj.helm, body: Bj.torso }[zone];
    const n = new THREE.Vector3().subVectors(tip, centre); if (n.lengthSq() < 1e-6) n.set(0, 0, -Aj.dir); n.normalize();
    const tan = new THREE.Vector3(Math.sign(Bj.root.position.x || 1), 0.1, 0).normalize();
    const seed = (Math.random() * 1e9) | 0;
    if (broke) {
      A.stats.breaks++;
      const at = Aj.clampBreak(Aj.reach * rnd(0.5, 0.72)), cls = power >= 0.9 ? 2 : power >= 0.75 ? 1 : 0;
      Aj.bendLance({ kind: 'break', tb: 0.025, load: 1, side: tan, seed, onBreak: () => {
        const seg = Aj.breakLance(at);
        if (seg) fx.lanceBurst({ a: seg.a.clone(), b: seg.b.clone(), dir: dir.clone(), v: new THREE.Vector3(0, 0, Aj.dir * Aj.speed), hv: new THREE.Vector3(0, 0, Bj.dir * Bj.speed), power, zone, paint: Aj.arms && Aj.arms.c1 || 0xb23a2a, seed, r0: seg.r, tan: tan.clone(), n: n.clone(), sinT: 0.25 });
        sound('lanceBreak', power, tip, { cls, zone });
      } });
    } else { A.stats.glances++; Aj.bendLance({ kind: 'hold', tc: 0.12, load: 0.7, side: tan, seed }); }
    if (part) { Aj.pinLance(part, tip, n, tan, glanced ? 'skid' : broke ? 'break' : 'hold'); }
    sound('impact', power, tip, zone);
    react(glanced ? 'glance' : zone === 'helm' ? 'helm' : 'break');
    if (A.plan.slow && !A.slowFired && !glanced) { A.slowFired = true; A.slowT = 1.25; A.stats.slow++; }
  }

  function sound(kind, power, at, extra) {
    try {
      if (S.muted || !audio.ctx || audio.ctx.state !== 'running') return;
      const d = Math.max(5, at.distanceTo(camera.position)) * 0.9;      // (a backdrop, not the match: the whole effects bus is already 9 dB down in the menu, see audio.setMenuMix)
      if (kind === 'impact') audio.impact(power, extra, d); else audio.lanceBreak(power, d, extra);
    } catch (e) { /* audio not ready */ }
  }
  function react(kind) { try { ctx.crowd(kind); } catch (e) { /* no crowd */ } }

  // ------------------------------------------------------------------ each rider's day: ride up, wait, charge, run out, wheel about
  function stepRider(i, dt) {
    const j = A.riders[i], c = A.ctrl[i], d = j.dir, u = d * j.z;
    switch (c.stage) {
      case 'up': {      // first arrival: walk up to the mark
        const rem = (-d * START_Z - j.z) * d;
        j.speed = rem > 0.15 ? Math.min(3.0, Math.max(0.5, rem * 0.9 + 0.3), j.speed + 2 * dt) : 0;
        if (rem <= 0.15) { j.speed = 0; j.setPose(-d * START_Z, d); beginReady(c, i); }
        break;
      }
      case 'ready': {
        c.t += dt; j.speed = damp(j.speed, 0, 5, dt);
        j.raiseT = c.t > (i === 0 ? 0.4 : 1.0) ? 1 : 0;
        const s0 = i === 0 ? 1.5 : 2.2;      // the salute: the lance dips towards the other end and comes back up
        if (c.t > s0 && c.t < s0 + 1.4) { const x = (c.t - s0) / 1.4; j.lanceLower = Math.sin(x * Math.PI) * 0.5; j.raiseT = 0; if (!c.sal) { c.sal = 1; react('salute'); } }
        else j.lanceLower = damp(j.lanceLower, 0, 4, dt);
        break;
      }
      case 'charge': {
        c.t += dt;
        gallop(j, c, dt);
        const gap = gapOf();
        if (gap < GAP_LANCE && !c.struck) c.low = clamp(c.low + dt / 0.95, 0, 1);
        if (c.struck) c.low = Math.max(0, c.low - dt * 4);
        j.lanceLower = c.low; j.brace = damp(j.brace, gap < 6 && !c.struck ? 1 : 0, 10, dt);
        if (c.low > 0.15) aimAt(j, c.out, c, dt);
        break;
      }
      case 'run': {
        c.t += dt; j.lanceLower = damp(j.lanceLower, 0, 6, dt); j.brace = damp(j.brace, 0, 6, dt);
        const vT = lerp(9.5, 5.4, smooth(0, 14, u - 3)) * (u < 3 ? 1 : 1);
        j.speed = j.speed > vT ? Math.max(vT, j.speed - 5.5 * dt) : Math.min(vT, j.speed + 3 * dt);
        j.root.position.x = damp(j.root.position.x, -d * lerp(LANE_X, 2.1, smooth(2, 22, u)), 3, dt);
        if (u >= LIST_HALF - 1.5 || c.t > 12) beginTurn(j, c);
        break;
      }
      case 'turn': turnStep(j, c, dt); break;
      default: break;
    }
  }

  /** Wheel about at the end of the lists: a smooth path round the tilt's end onto the mark at the other end, from where he is now. */
  function beginTurn(j, c) {
    const d = j.dir, w0 = d * j.root.position.x, u0 = d * j.z;
    const pts = [[w0, u0], [w0 - 0.5, u0 + 4.2], [-1.7, 38.6], [-0.1, 42.3], [LANE_X, 41.0], [LANE_X, 39.0]].map(([w, u]) => new THREE.Vector3(d * w, 0, d * u));
    c.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); c.len = c.curve.getLength(); c.s = 0; c.stage = 'turn'; c.t = 0; c.yaw = j.root.rotation.y; c.roll = 0;
    j.manualPos = true;
  }
  function turnStep(j, c, dt) {
    c.t += dt; const f = c.s / c.len, d = j.dir;
    const vT = lerp(5.2, 2.6, smooth(0, 0.4, f)) * lerp(1, 0.35, smooth(0.8, 1, f));
    j.speed = j.speed > vT ? Math.max(vT, j.speed - 4 * dt) : Math.min(vT, j.speed + 3 * dt);
    c.s = Math.min(c.len, c.s + Math.max(0.5, j.speed) * dt);
    const p = c.curve.getPointAt(Math.min(1, c.s / c.len)), tg = c.curve.getTangentAt(Math.min(1, c.s / c.len));
    const yaw = Math.atan2(tg.x, tg.z);
    c.roll = damp(c.roll, -clamp(wrap(yaw - c.yaw) * 1.4 * Math.min(1, j.speed / 4), -0.1, 0.1), 5, dt);
    c.yaw = c.yaw + wrap(yaw - c.yaw) * (1 - Math.exp(-7 * dt));
    j.root.position.set(p.x, 0, p.z); j.root.rotation.set(0, c.yaw, c.roll);
    j.lanceLower = damp(j.lanceLower, 0, 6, dt);
    if (c.s >= c.len - 0.02 || c.t > 14) {
      j.setPose(d * START_Z, -d);      // (at his mark at the other end, facing the lists; a broken lance is swapped for a whole one)
      beginReady(c, A.ctrl.indexOf(c));
      c.arrived = true;
    }
  }

  // ------------------------------------------------------------------ cameras
  /** Cut to a shot. kinds: wide (an establishing drift from behind the end), chase (behind a knight), track (alongside, level with the horses), skim (low beside the tilt), impact (close and slow at the strike), turn (the wheel at the end), salute (behind a knight at his mark). */
  function cut(kind, extra = {}) {
    const k = A.cam; k.kind = kind; k.t = 0; k.snap = true; k.side = A.plan ? A.plan.side : (Math.random() < 0.5 ? -1 : 1);
    k.dur = { wide: 9, track: 9, chase: 9, skim: 7, impact: 6, turn: 6, salute: 5 }[kind] || 8; k.who = extra.who ?? 0; k.second = false; k.mz = undefined; k.z = undefined; k.flip = Math.random() < 0.5 ? -1 : 1;
    A.stats.shots[kind] = (A.stats.shots[kind] || 0) + 1;
  }
  /** The point the strike will fall on: where the two riders meet at their present speeds. */
  function meetZ() {
    const [p, q] = A.riders; const gap = (q.z - p.z) * p.dir, cl = Math.max(1, p.speed + q.speed);
    return clamp(p.z + p.dir * p.speed * Math.max(0, gap) / cl, -14, 14);
  }
  function camStep(dtReal) {
    const k = A.cam, s = k.side, [r0, r1] = A.riders, u = clamp(k.t / k.dur, 0, 1);
    const R = A.riders[k.who ?? 0], d = R.dir, o = Math.sign(R.root.position.x) || 1;
    const live = (r0.z + r1.z) / 2, charging = A.ctrl[0].stage === 'charge' || A.ctrl[1].stage === 'charge';
    const mz = charging ? (k.mz = damp(k.mz ?? live, live, 6, dtReal)) : (k.mz ?? live);      // (the middle of the pair: it closes on the place they meet)
    const fz = A.ctrl.every((c) => c.stage === 'charge' || c.stage === 'run') ? (r0.z + r1.z) / 2 : 0;
    let fov = 40; const want = _a, look = _b;
    switch (k.kind) {
      case 'wide': {      // from behind the end of the lists and high, the whole length running away: a slow drift forward, the two riders coming together
        want.set(s * 2.4, 4.6 - 0.8 * u, -(START_Z + 10) + 7 * u); look.set(0, 1.1, fz * 0.7 + 4); fov = 40; break;
      }
      case 'chase': {      // behind one knight, low and a little outside his lane, the other coming down the lists at him
        k.z = damp(k.z ?? R.z - d * 5.4, R.z - d * 5.4, 5, dtReal); want.set(R.root.position.x + o * 1.5, 2.0, k.z); look.set(-o * 0.4, 1.55, R.z + d * 16); fov = 38; break;
      }
      case 'skim': {      // low beside the tilt, ahead of the meeting: one knight thunders by, the strike is seen down the lists
        if (k.z === undefined) { k.z = meetZ() - d * 10.5; k.sx = o * 3.3; }
        want.set(k.sx, 0.5, k.z); look.set(0, 1.3, k.z + d * 9.5 - (u > 0.4 ? 0 : 0)); fov = 42; break;
      }
      case 'track': {      // alongside one knight, level with the horse, keeping up with him
        k.z = damp(k.z ?? R.z, R.z + d * 1.5, 4, dtReal); want.set(R.root.position.x + o * 4.8, 1.6, k.z); look.set(-o * 0.6, 1.5, k.z + d * 1.2); fov = 36; break;
      }
      case 'impact': {      // close and slow: across the lists at the meeting, a little round it, the spray flying across the frame
        const ang = 0.15 + 0.7 * u * k.flip; want.set(s * 6.0, 1.35 + 0.35 * u, mz - 1.6 + Math.sin(ang) * 3.2); look.set(0, 1.45, mz); fov = 36; break;
      }
      case 'turn': {      // the wheel at the end of the lists, from beside the rail
        const end = k.who ? -1 : 1; want.set(s * 5.6, 2.2, end * (LIST_HALF - 8) - end * 2 * u); look.set(0, 1.2, end * 40); fov = 42; break;
      }
      case 'salute': {      // behind one knight at his mark, the lists running away to the other: the lance dips, the crowd stirs
        const j = A.riders[k.who], dj = j.dir, oj = Math.sign(j.root.position.x) || 1; want.set(j.root.position.x + oj * 2.5, 1.95 - 0.1 * u, j.z - dj * (4.8 - 0.8 * u)); look.set(0, 1.55, j.z + dj * 13); fov = 36; break;
      }
      default: want.set(6, 4, -10); look.set(0, 1.4, 0);
    }
    k.pos.copy(want); k.look.copy(look); k.fov = fov;
  }

  // ------------------------------------------------------------------ the page: where is the menu panel, and so where is the free space
  function freeRect() {
    const W = innerWidth, H = innerHeight;
    const el = document.querySelector('#screen.on .paper') || document.querySelector('#screen.on .menu') || null;
    const whole = { x: 0, y: 0, w: W, h: H, k: 1 };
    if (!el) return whole;
    const r = el.getBoundingClientRect();
    // the free space around the panel: a strip beside it (right preferred) or a band above or below it
    const c = [{ x: r.right, y: 0, w: W - r.right, h: H, side: 1 }, { x: 0, y: 0, w: r.left, h: H, side: 1 }, { x: 0, y: 0, w: W, h: r.top, side: 0 }, { x: 0, y: r.bottom, w: W, h: H - r.bottom, side: 0 }];
    let best = null, bs = 0;
    for (const q of c) {
      const ok = q.side ? q.w > 0.16 * W && q.h > 0.4 * H : q.h > 0.1 * H && q.h >= 90 && q.w > 0.6 * W;
      const sc = ok ? q.w * q.h * (q === c[0] ? 1.08 : 1) : 0;
      if (sc > bs) { bs = sc; best = q; }
    }
    if (!best) return whole;      // (a screen that leaves nothing free, a phone held sideways: the whole picture, the panel over it)
    best.k = Math.min(1, best.side ? best.w / W : best.h / H * 2.2);
    return best;
  }
  function viewOffset() {
    const W = innerWidth, H = innerHeight, now = performance.now();
    if (!frame || now - frameT > 400 || frame.W !== W || frame.H !== H) { frame = Object.assign(freeRect(), { W, H }); frameT = now; }
    const dx = (frame.x + frame.w / 2) - W / 2, dy = (frame.y + frame.h / 2) - H / 2;
    return { dx, dy, k: frame.k };      // k: how much of the picture the free space may use (a narrower strip: the camera stands further back)
  }

  // ------------------------------------------------------------------ lifecycle
  const allowedNow = () => !!(P !== 'off' && (P === 'force' || (menuJoustOn() && GFX.tier !== 'low' && !joustCap())));
  function enter() {      // put the riders on the lists
    if (!A.parked) return;
    A.parked = false;
    for (const j of A.riders) scene.add(j.root);
    A.riders.forEach((j, i) => { j.setPose(-(i === 0 ? 1 : -1) * (START_Z + 13), i === 0 ? 1 : -1); j.fresh(); j.visorUp = false; });
    A.ctrl.forEach((c) => { c.stage = 'up'; c.t = 0; c.struck = false; c.curve = null; });
    A.plan = null; A.ts = 1; A.slowT = 0; A.passT = 0; A.meter = { ms: [], sum: 0, warm: 0, bad: 0, since: performance.now() };
    cut('salute', { who: 0 }); A.cam.dur = 8;
    if (ctx.world()) { const w = ctx.world(); if (w.setTilt) w.setTilt(true); }
  }
  /** Take the riders out of the scene (kept for the next time the menu shows). */
  function park() {
    if (A.parked && !A.running) return;
    A.parked = true; A.running = false;
    if (A.riders) for (const j of A.riders) { scene.remove(j.root); j.speed = 0; }
    frame = null;
  }

  function sample(ms) {      // the frame-time check: raw intervals of drawn menu frames
    if (!A.running) return;
    const m = A.meter;
    if (ms > 250 || ms <= 0) return;
    (A.ftLog || (A.ftLog = [])).push(ms); if (A.ftLog.length > 900) A.ftLog.shift();      // (the last 900 drawn frames, for tests)
    m.warm += ms; if (m.warm < WARM_MS) return;
    m.ms.push(ms); m.sum += ms;
    if (m.sum < WINDOW_MS) return;
    const j = judge(m.ms, 1000 / 30); m.ms = []; m.sum = 0; A.lastJudge = { mean: +j.mean.toFixed(1), p90: +j.p90.toFixed(1), fps: +j.fps.toFixed(1), bad: j.bad };
    if (j.bad || j.awful) { if (++m.bad >= 3 && P !== 'force') disable('frames averaged ' + j.mean.toFixed(0) + ' ms'); } else m.bad = 0;
  }
  function disable(why) {
    A.why = why; capMenuJoust(why); console.info('[attract] menu joust switched off: ' + why); park();
  }

  /** Once a menu frame (main.js frame(), S.mode === 'menu'). dtReal: real seconds; dt: simulation seconds (slow motion applied). Returns true while it is drawing. */
  function update(dtReal, dt) {
    const ok = !A.broken && allowedNow() && VIEWS.has(S.menuView) && !document.hidden && ctx.ready();
    if (!ok) {
      if (A.running) park();
      if (allowedNow() && !document.hidden && VIEWS.has(S.menuView)) A.menuT = 0;
      return false;
    }
    A.menuT += dtReal;
    if (A.phase === 'idle') { if (A.menuT > IDLE_BEFORE) ensureAssets(); return false; }
    if (A.phase === 'loading' || A.phase === 'failed') return false;
    try {
      if (A.phase === 'building') { if (A.menuT > IDLE_BEFORE + 0.3 && (!A.riders || A.riders.length < 2)) buildStep(); return false; }
      if (!A.riders || A.riders.length < 2) return false;
      if (A.parked) { enter(); }
      A.running = true;
      run(dtReal, dt);
      return true;
    } catch (e) {      // (a backdrop must never take the menu down with it: switch it off for this session and carry on)
      console.warn('[attract]', e); A.why = 'error'; A.phase = 'failed'; park(); A.broken = true; return false;
    }
  }

  function run(dtReal, dt) {
    const [r0, r1] = A.riders, [c0, c1] = A.ctrl, cam = A.cam;
    // slow motion at the strike: main scales the simulation clock by scale(); a quick ramp down, a hold, a ramp back
    A.slowT = Math.max(0, A.slowT - dtReal);
    A.ts = damp(A.ts, A.slowT > 0 ? 0.17 : 1, A.slowT > 0 ? 16 : 5, dtReal);
    // the pass begins when both are at their marks and have had their moment
    if (A.ctrl.every((c) => c.stage === 'ready' && c.t > 3.8)) startPass();
    for (const j of A.riders) j.update(dt);
    r0.root.updateMatrixWorld(true); r1.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) stepRider(i, dt);
    for (const j of A.riders) j.applyLance();
    // the strokes: each point arrives at his man
    if (A.ctrl.some((c) => c.stage === 'charge')) {
      A.passT += dt;
      for (let i = 0; i < 2; i++) {
        const c = A.ctrl[i], j = A.riders[i], foe = A.riders[1 - i];
        if (c.stage !== 'charge' || c.struck) continue;
        j.tipWorld(_a); foe.zoneWorld(c.out.zone, _b);
        const ahead = (_a.z - _b.z) * j.dir, past = (foe.z - j.z) * j.dir;
        if (c.low > 0.85 && ahead >= -0.05) strike(i);
        else if (past < -1.4) { c.out = Object.assign({}, c.out, { kind: 'miss' }); strike(i); }
      }
      for (const c of A.ctrl) if (c.stage === 'charge' && c.struck) { c.after = (c.after || 0) + dt; if (c.after > 0.45) { c.stage = 'run'; c.t = 0; c.after = 0; } }
      // the close shot cuts in for the strike (a second or two before the riders meet)
      if (A.plan.slow && !A.impactCut && !c0.struck && !c1.struck) {
        const gap = gapOf(), cl = Math.max(1, r0.speed + r1.speed);
        if (gap / cl < 1.2 && gap > 0) { A.impactCut = true; cut('impact', { who: A.plan.who }); }
      }
    }
    // the close shot is over with the slow moment: go along with the riders as they ride out
    if (cam.kind === 'impact' && A.slowFired && A.slowT <= 0 && !A.impactDone) { A.impactDone = true; cut('track', { who: A.plan.who }); }
    // nobody is ever unhorsed here
    for (const j of A.riders) if (j.unhorsed) j.setPose(j.z, j.dir);
    // the shots that follow the pass: the wheel at the end, then the riders at their marks again
    if (A.plan && A.ctrl.every((c) => c.struck)) { A.afterT = (A.afterT ?? 0) + dtReal; if (A.afterT > (A.plan.slow ? 3.4 : 2.6) && !A.turnCut) { A.turnCut = true; cut('turn', { who: Math.random() < 0.5 ? 0 : 1 }); cam.side = Math.random() < 0.5 ? -1 : 1; } }
    const allReady = A.ctrl.every((c) => c.stage === 'ready');
    if (allReady && !A.readyCut && A.plan) { A.readyCut = true; cut(A.passN % 3 === 0 ? 'wide' : 'salute', { who: Math.random() < 0.5 ? 0 : 1 }); cam.side = Math.random() < 0.5 ? -1 : 1; }
    cam.t += dtReal; camStep(dtReal);
    if (cam.kind === 'salute' && allReady && cam.t > 3.0 && !cam.second) { const w = 1 - cam.who; cut('salute', { who: w }); A.cam.second = true; }
    else if (cam.kind === 'salute' && !A.plan && cam.t > 7) { cut('wide'); }
    else if (cam.kind === 'turn' && cam.t > cam.dur && !allReady) cut('wide');
  }

  // ------------------------------------------------------------------ what main.js reads
  return {
    update, sample, park,
    get running() { return A.running; },
    get phase() { return A.phase; }, get why() { return A.why; },      // (tests)
    /** simulation clock factor (1 normally; the slow moment at the strike) */
    scale: () => (A.running ? A.ts : 1),
    roots: () => (A.riders ? A.riders.map((j) => j.root) : []),
    /** where the shadow and the crowd should look */
    focusZ: () => (A.riders && A.running ? (A.riders[0].z + A.riders[1].z) / 2 : 0),
    focus: (out) => (A.riders ? out.set(0, 0, (A.riders[0].z + A.riders[1].z) / 2) : out.set(0, 0, 0)),
    /** The camera for this frame: { pos, look, fov, snap, view: { dx, dy, k } } (snap: a cut) */
    camera() {
      const k = A.cam, v = viewOffset(), snap = k.snap; k.snap = false;
      // a narrow strip of free page: the camera stands further back (a dolly, so the perspective stays) and the picture is shifted into the strip (main.js: view offset)
      const dolly = v.k < 0.99 ? clamp(0.5 / v.k, 1, 1.9) : 1;
      _pos.copy(k.look).addScaledVector(_d.subVectors(k.pos, k.look), dolly);
      _pos.x = clamp(_pos.x, -6.2, 6.2); _pos.y = clamp(_pos.y, 0.4, 9); _pos.z = clamp(_pos.z, -49, 49);
      return { pos: _pos, look: k.look, fov: k.fov, snap, view: v };
    },
    debug: A,
  };
}
