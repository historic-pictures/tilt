// The ceremony of the lists: heralds' trumpets on a dais in front of the royal box, the announcer (Master Hugh Clement) who steps forward when he speaks,
// the intro camera (a short run of cuts), the lower-third knight cards and the "hold to skip" ring. Figures are a few cheap meshes, like crowd.js / retinue_field.js.
// Layout: the royal box is on the +x side (x = 15.5); the dais stands between the lists fence (x = 9.5) and the stand wall, facing -x.
import * as THREE from 'three';
import { LISTS } from './lists.js';
import { clamp, lerp, smoothstep, drawCrest, drawFace } from './util.js';
import { ANNOUNCER } from './drama_lines.js';
import { SPEECH } from './channels.js';
import { dressFigure, ARM_AT } from './people.js';

export const INTRO_END = 37.5;       // seconds of the full intro
export const SKIP_HOLD = 0.8;        // seconds the key is held to skip
// [from, to, shot]: wide lists, trumpets, royal box, warm-up (a canter along each side), line-up before the royal box (visors up, lance dips, the salute between the knights),
// the announcer, the opponent's herald boasts, your man boasts, "to your marks" at the starting ends (the original intro, restored at the owner's request: 27 Nov)
export const SHOTS = [[0, 2, 'wide'], [2, 5, 'trump'], [5, 8.5, 'royal'], [8.5, 10.25, 'warmP'], [10.25, 12, 'warmO'], [12, 19, 'lineup'], [19, 26, 'herald'], [26, 30.5, 'him'], [30.5, 35, 'you'], [35, INTRO_END, 'marks']];
export const MOVE = { t0: 8.5, tStop: 15.5, turnBox: [14.8, 16.2], dip1: [16.2, 17.4], turnEach: [17.4, 18.2], dip2: [18.2, 19.0], end: 35 };   // the riders' choreography

const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const GEO = {
  leg: new THREE.CylinderGeometry(0.075, 0.06, 0.85, 6).translate(0, -0.425, 0), torso: new THREE.CylinderGeometry(0.2, 0.24, 0.64, 8).translate(0, 0.32, 0),
  head: new THREE.SphereGeometry(0.115, 8, 6), arm: new THREE.CylinderGeometry(0.055, 0.045, 0.6, 6).translate(0, -0.3, 0), tab: new THREE.BoxGeometry(0.4, 0.62, 0.03),
  toque: new THREE.CylinderGeometry(0.12, 0.15, 0.17, 10), feather: new THREE.BoxGeometry(0.02, 0.2, 0.05),
  tube: new THREE.CylinderGeometry(0.014, 0.014, 1.15, 6).translate(0, -0.575, 0), bell: new THREE.ConeGeometry(0.1, 0.22, 8).translate(0, 0.11, 0),
  staff: new THREE.CylinderGeometry(0.02, 0.02, 1.7, 5).translate(0, 0.45, 0), roll: new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8).rotateZ(Math.PI / 2), sheet: new THREE.PlaneGeometry(0.3, 0.4).translate(0, -0.2, 0), dais: new THREE.BoxGeometry(1.8, 0.3, 11.5), pennon: new THREE.PlaneGeometry(0.34, 0.34),
};
const mats = {};
export const mat = (c, o) => mats[c + (o ? 'd' : '')] || (mats[c + (o ? 'd' : '')] = new THREE.MeshLambertMaterial({ color: c, side: o ? THREE.DoubleSide : THREE.FrontSide }));
export const mesh = (g, c, parent, x = 0, y = 0, z = 0, dbl) => { const m = new THREE.Mesh(g, mat(c, dbl)); m.position.set(x, y, z); g.boundingSphere || g.computeBoundingSphere(); m.castShadow = g.boundingSphere.radius > 0.22; parent.add(m); return m; };      // (only the big pieces cast a shadow: the small ones were ~370 shadow draw calls a frame)
export const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

/**
 * A person facing local +z, jointed at the hips, shoulders and neck: legs, a tunic (a tabard over it if `tab` is a colour), head, two arms; hat: a colour
 * for his chaperon, or null for none. The parts are the modelled ones of src/people.js, dressed from the clothing atlas:
 * garb (which tunic), face (which face), hair, fat (-0.4 thin .. 1 heavy), sleeve, hatKind ('hat' chaperon | 'cap' | 'coif' | 'hood' | 'straw'),
 * close (the camera goes close to him: he gets the modelled head with hair and beard, see dressFigure).
 * The joints (p.legL, p.legR, p.torso, p.head, p.armL, p.armR) are what every animation turns: a mocap clip in per-limb angles drives them directly.
 */
const FACES_M = ['m_young', 'm_plain', 'm_beard', 'm_moustache', 'm_dark', 'm_fullbeard'], HAIRS_M = ['#2a211a', '#4a3524', '#6b4a2a', '#8a5a2c', '#8a3a1c'];
let personN = 0;
export function person(parent, { hose, coat, tab, skin = '#e0ac84', hat = '#1d3f8a', plume = '#d8222a', garb, face, hair, fat = 0, sleeve, hatKind = 'hat', close = false }) {
  const g = grp(parent), body = grp(g), legL = grp(body, -0.09, 0.85), legR = grp(body, 0.09, 0.85), torso = grp(body, 0, 0.85), head = grp(torso, 0, 0.66), k = personN++;
  const D = dressFigure({ hose, coat, tab, skin, garb, sleeve, fat, close, face: face || FACES_M[k % FACES_M.length], hair: hair || HAIRS_M[(k * 3) % HAIRS_M.length], hat: hat ? { kind: hatKind, color: hat } : null });
  legL.add(D.legL); legR.add(D.legR); torso.add(D.torso); D.head.position.y = 0.12; head.add(D.head);
  if (hat && plume && hatKind === 'hat') mesh(GEO.feather, plume, head, 0.1, 0.3, -0.02);
  const armL = grp(torso, -ARM_AT[0], ARM_AT[1]), armR = grp(torso, ARM_AT[0], ARM_AT[1]); armL.add(D.armL); armR.add(D.armR);
  return { g, body, legL, legR, torso, head, armL, armR, ph: Math.random() * 6 };
}

/** A trumpeter in the colours c1 / c2, facing local +z, with his horn in the right hand (p.trumpet); animate with blowTrumpeter(). Used on the dais and along the barrier. */
const _mc = new THREE.Color(), _mg = new THREE.Color('#6b6254');
/** A period-dye version of a livery colour: pulled toward undyed wool and darkened (the barrier men are not heralds). */
export function mute(c, k = 0.72) { return '#' + _mc.set(c).lerp(_mg, 0.38).multiplyScalar(k).getHexString(); }
export function trumpeter(parent, c1, c2, muted = false) {
  const p = person(parent, muted ? { hose: mute(c1, 0.6), coat: mute(c2, 0.8), tab: mute(c1, 0.72), hat: mute(c1, 0.55), plume: '#8a6a4a' } : { hose: c1, coat: c2, tab: c1 });
  p.trumpet = grp(p.armR, 0, -0.6, 0); mesh(GEO.tube, '#d9b23c', p.trumpet); mesh(GEO.bell, '#d9b23c', p.trumpet, 0, -1.15, 0).rotation.x = Math.PI;
  mesh(GEO.pennon, muted ? mute(c1, 0.9) : c1, p.trumpet, 0.0, -0.8, 0.12, true).rotation.y = Math.PI / 2;
  p.k = 0; p.delay = 0; return p;
}
/** One frame of a trumpeter: arm and horn come up together when up is true (after his delay), a little breath sway. */
export function blowTrumpeter(p, up, dt, t) {
  p.delay -= dt; const goal = up && p.delay <= 0 ? 1 : up ? p.k : 0; p.k = damp(p.k, goal, 4, dt);
  p.armR.rotation.x = lerp(-0.4, -1.9, p.k); p.trumpet.rotation.x = lerp(-2.2, 0, p.k); p.armL.rotation.x = lerp(0.05, -0.55, p.k);
  p.head.rotation.x = -0.12 * p.k; p.torso.rotation.x = Math.sin(t * 0.7 + p.ph) * 0.015 - 0.04 * p.k;
}

export function createCeremony(scene) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const T = { root, active: false, judgesCam: null, trumpets: [], line: [], lineUp: false, lineT: 0, H: null, shot: -1, up: false, talkT: 0, x: 10.9 };
  const X0 = 10.9, XF = 9.75, HZ = -2.7;      // the announcer's place on the dais (to the side of the judges' stand, in clear view from the lists), and where he steps to when he speaks
        // the announcer's place on the dais, and where he steps to when he speaks

  /** Build for a venue V (VENUES entry): trumpeters in the colours of the lists, the announcer in the royal arms. */
  T.setup = function setup(V) {
    T.clear();
    const c1 = V.tilt[0], c2 = V.tilt[1];
    const dais = new THREE.Mesh(GEO.dais, mat('#6b4f30')); dais.position.set(11.0, 0.15, 0); dais.receiveShadow = true; dais.userData.cheapList = true; dais.visible = !LISTS.on; root.add(dais);      // (the modelled lists bring their own dais, src/lists.js)
    for (const z of [-4.6, -3.1, 3.1, 4.6]) {
      const p = trumpeter(root, c1, c2); p.g.position.set(11.0, 0.3, z); p.g.rotation.y = -Math.PI / 2; T.trumpets.push(p);
    }
    // six more along the barrier on the judges' side, three each side of the judges' stand: they blow before the flags drop on the first and the last course
    for (const z of [-7.6, -5.6, -3.6, 3.6, 5.6, 7.6]) { const p = trumpeter(root, c1, c2, true); p.g.position.set(8.9, 0, z); p.g.rotation.y = -Math.PI / 2; p.ph += z; T.line.push(p); }
    T.lineUp = false; T.lineT = 0;
    const h = T.H = person(root, { hose: '#1d3f8a', coat: '#8a1d2b', tab: '#d9b23c', skin: '#e0b896', hat: '#8a1d2b', close: true, face: 'm_beard', hair: '#6b4a2a', fat: 0.3 });
    h.staff = grp(h.armL, 0, -0.6, 0); mesh(GEO.staff, '#e8e0c8', h.staff);      // the herald's white baton
    // his scroll (the roll of arms): a rolled parchment in the right hand that hangs open while he cries. Built from person() + two meshes, so a new body model (src/body_types.js) only has to supply the arm group.
    h.scroll = grp(h.armR, 0, -0.6, 0); mesh(GEO.roll, '#e8dcc0', h.scroll); h.sheet = mesh(GEO.sheet, '#efe4c8', h.scroll, 0, 0, 0.0, true); h.sheet.castShadow = false; h.sheet.scale.y = 0.05; h.sheet.visible = false; h.sk = 0;
    h.x = X0; h.yaw = -Math.PI / 2; h.walk = 0; h.g.position.set(X0, 0.3, HZ);
    T.talkT = 0; root.visible = true;
  };
  T.clear = function clear() {
    root.clear(); T.trumpets = []; T.line = []; T.lineUp = false; T.lineT = 0; T.hideTitle(); T.H = null; T.up = false; T.talkT = 0; T.hideCard(); T.skipUI(false); root.visible = false;
  };
  /** Trumpets up (true) or down (false): the four raise one after the other. */
  T.raise = (on) => { T.up = on; T.trumpets.forEach((p, i) => { p.delay = i * 0.13; }); };
  /** The barrier trumpeters raise their horns one after the other and hold them for `secs` (the fanfare itself is main.js's call). */
  T.blowLine = (secs = 3) => { T.lineUp = true; T.lineT = secs; T.line.forEach((p, i) => { p.delay = i * 0.1; }); };
  /** The announcer speaks for `secs`: he steps forward to the rail, gestures, and steps back after. */
  T.speak = (secs = 3) => { if (!SPEECH.herald) return; T.talkT = Math.max(T.talkT, secs); };      // he steps forward only when he really speaks (src/channels.js)
  /** The announcer's head, for the speech label above him (null when not built). */
  T.hughHead = () => (T.H ? T.H.head : null);
  /** Where the announcer stands (for the cut to him): writes his chest position, false when not built. */
  T.hughAt = (out) => (T.H ? out.set(T.H.x, 1.75, HZ) : false);
  /** Is he calling just now? */
  T.speaking = () => T.talkT > 0;

  const limbs = (p, walk, t, dt, moving) => {
    const sw = moving ? Math.sin(p.ph) * 0.5 : 0; p.legL.rotation.x = damp(p.legL.rotation.x, -sw, 12, dt); p.legR.rotation.x = damp(p.legR.rotation.x, sw, 12, dt);
  };
  T.update = function update(dt, t) {
    if (!T.H) return;
    // the trumpeters: arm and horn come up together; a little breath sway
    for (const p of T.trumpets) blowTrumpeter(p, T.up, dt, t);
    if (T.lineT > 0) { T.lineT -= dt; if (T.lineT <= 0) T.lineUp = false; }
    for (const p of T.line) blowTrumpeter(p, T.lineUp, dt, t);
    // the announcer: out to the rail while he speaks, back to the dais after; the staff stays upright
    const H = T.H; T.talkT = Math.max(0, T.talkT - dt);
    const want = T.talkT > 0 ? XF : X0, dx = want - H.x, moving = Math.abs(dx) > 0.03;
    if (moving) { H.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.25 * dt); H.ph += dt * 7; }
    H.yaw = damp(H.yaw, moving && dx > 0 ? Math.PI / 2 : -Math.PI / 2, 6, dt);
    H.g.rotation.y = H.yaw; H.g.position.x = H.x; H.g.position.y = 0.3 * (1 - smoothstep(9.8, 10.3, H.x));
    limbs(H, 0, t, dt, moving);
    const talk = !moving && T.talkT > 0;
    H.armR.rotation.x = damp(H.armR.rotation.x, moving ? -Math.sin(H.ph) * 0.4 : talk ? -1.15 + Math.sin(t * 2.4) * 0.35 : -0.1, 8, dt);
    H.armL.rotation.x = damp(H.armL.rotation.x, moving ? Math.sin(H.ph) * 0.3 : -0.25, 8, dt); H.staff.rotation.x = -H.armL.rotation.x;
    H.head.rotation.x = damp(H.head.rotation.x, talk ? Math.sin(t * 3.1) * 0.07 : 0, 8, dt);
    H.torso.rotation.x = damp(H.torso.rotation.x, talk ? 0.06 : 0, 6, dt);
    H.sk = damp(H.sk, talk ? 1 : 0, 5, dt); H.sheet.visible = H.sk > 0.06; H.sheet.scale.y = Math.max(0.05, H.sk); H.sheet.rotation.x = Math.sin(t * 2.2) * 0.06 * H.sk;      // the scroll unrolls as he begins and rolls up after
  };

  /** Intro camera. t = seconds into the intro. Writes the wanted position and look point; returns { fov, snap (a cut) }. */
  T.camera = function camera(t, player, opp, want, look) {
    let i = SHOTS.findIndex(s => t < s[1]); if (i < 0) i = SHOTS.length - 1;
    const [a, b, id] = SHOTS[i], u = clamp((t - a) / (b - a), 0, 1), snap = i !== T.shot; T.shot = i; let fov = 44;
    if (id === 'wide') { want.set(0.5, lerp(5.6, 3.8, u), lerp(-50, -45, u)); look.set(2, 2.2, 0); fov = 56; }
    else if (id === 'trump') { want.set(lerp(1.5, 3.2, u), 1.9, lerp(-0.6, 0.6, u)); look.set(10.8, 2.2, 0); fov = 44; }
    else if (id === 'royal') { want.set(lerp(7.0, 8.4, u), lerp(3.4, 3.9, u), lerp(4.2, 2.6, u)); look.set(15.5, 3.6, 0); fov = 34; }
    else if (id === 'herald') { want.set(lerp(4.6, 5.6, u), 1.5, HZ - 0.1); look.set(T.H ? T.H.x : X0, 1.5, HZ); fov = 27; }      // head on from the lists, waist up (kept from the framing review: the modelled lists put the judges' stand at z = 0)
    else if (id === 'warmP') { const c = player.root.position; want.set(-5.8, 1.6, c.z - 1.5); look.set(c.x, player.seatY + 0.07, c.z + 3); fov = 40; }
    else if (id === 'warmO') { const c = opp.root.position; want.set(5.8, 1.6, c.z + 1.5); look.set(c.x, opp.seatY + 0.07, c.z - 3); fov = 40; }
    else if (id === 'lineup') { want.set(lerp(7.6, 6.7, u), 2.4, 0); look.set(0, 1.9, 0); fov = 54; }      // (kept: the modelled judges' stand is where the old position was)      // the host's view: both knights ride in from the ends and face the box
    else if (id === 'him' || id === 'you') {      // a slow push-in on the knight, from in front of his horse
      const on = id === 'him' ? opp : player, c = on.root.position, yaw = on.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), an = -0.95 + u * 0.25, R = lerp(7.0, 4.9, smoothstep(0, 1, u));
      want.set(c.x + fx * Math.cos(an) * R + fz * Math.sin(an) * R, 1.55 + u * 0.3, c.z + fz * Math.cos(an) * R - fx * Math.sin(an) * R); look.set(c.x, 1.85, c.z); fov = 38;
    } else { const c = player.root.position; want.set(c.x + lerp(3.2, 2.4, u), 1.7, c.z + lerp(3.6, 2.8, u)); look.set(c.x, 2.0, c.z + 0.3); fov = 34; }
    return { fov, snap, id };
  };
  /** Which point the sun's shadow should follow in this shot. */
  T.focus = function focus(t, player, opp, out) {
    const id = (SHOTS.find(s => t < s[1]) || SHOTS[SHOTS.length - 1])[2];
    if (id === 'him') return out.copy(opp.root.position); if (id === 'you' || id === 'marks') return out.copy(player.root.position);
    if (id === 'warmP') return out.copy(player.root.position); if (id === 'warmO') return out.copy(opp.root.position);
    return out.set(0, 0, 0);
  };

  /** The knights' walk-out. t = seconds into the intro. Both ride in from their ends (canter, slowing), wheel to face the royal box, dip lances to the host,
   *  turn to face each other and salute. Before MOVE.t0 they wait at their ends. Sets position, facing, gait speed, lance dip; the visors go up in main. */
  T.stage = function stage(t, P, O, dt) {
    const z1 = 3.2, e = (tt) => { const u = clamp((tt - MOVE.t0) / (MOVE.tStop - MOVE.t0), 0, 1); return u * u * (3 - 2 * u); };
    const turn = (r, tt) => smoothstep(r[0], r[1], tt), pulse = (r, tt, a) => a * Math.sin(Math.PI * clamp((tt - r[0]) / (r[1] - r[0]), 0, 1));
    const toward = Math.atan2(O.root.position.x - P.root.position.x, O.root.position.z - P.root.position.z);
    for (const [j, sgn] of [[P, 1], [O, -1]]) {
      const zOf = (tt) => sgn * (-40 + (40 - z1) * e(tt));
      const z = zOf(t), v = Math.abs(zOf(t + 0.05) - zOf(t - 0.05)) / 0.1;
      const tb = turn(MOVE.turnBox, t), te = turn(MOVE.turnEach, t);
      const yawStart = sgn > 0 ? 0 : Math.PI, yawBox = Math.PI / 2, yawEach = sgn > 0 ? toward : toward + Math.PI;
      const yaw = lerp(lerp(yawStart, yawBox, tb), yawEach, te);
      const turning = (t > MOVE.turnBox[0] && t < MOVE.turnBox[1]) || (t > MOVE.turnEach[0] && t < MOVE.turnEach[1]);
      j.manualPos = true; j.root.position.set(-sgn * 0.95, 0, z); j.root.rotation.y = yaw; j.speed = Math.max(v, turning ? 0.9 : 0);
      j.lanceLower = pulse(MOVE.dip1, t, 0.45) + pulse(MOVE.dip2, t, 0.38);
    }
  };

  // ---- lower-third card: a knight's name, land and one line about him, with his arms
  let card = null;
  T.card = function showCard({ name, land, bio, arms, ovr }) {
    T.hideCard(); card = document.createElement('div'); card.id = 'lower3';
    card.innerHTML = `<canvas width="56" height="68"></canvas><div><b>${name}</b><i>${land}${ovr != null ? ` · rated ${ovr}` : ''}</i><span>${bio || ''}</span></div>`;
    drawCrest(card.querySelector('canvas'), arms); document.body.appendChild(card); void card.offsetWidth; card.classList.add('on');
  };
  T.hideCard = function hideCard() { if (card) { const c = card; card = null; c.classList.remove('on'); setTimeout(() => c.remove(), 500); } };

  // ---- the location title card, lower left: the venue, its city and year, and the rule set; fades in, stays ~3 s, fades out
  let title = null, titleTm = 0;
  T.titleCard = function titleCard(venue, city, year, rules, secs = 3) {
    if (!title) { title = document.createElement('div'); title.id = 'venueCard'; document.body.appendChild(title); }
    title.innerHTML = `<b>${venue} · ${city} · ${year}</b><i>${rules}</i>`; void title.offsetWidth; title.classList.add('on');
    clearTimeout(titleTm); titleTm = setTimeout(T.hideTitle, secs * 1000);
  };
  T.hideTitle = function hideTitle() { clearTimeout(titleTm); if (title) { const c = title; title = null; c.classList.remove('on'); setTimeout(() => c.remove(), 700); } };

  // ---- the "hold SPACE to skip" ring, bottom right; frac 0..1 is the fill
  let ring = null;
  T.skipUI = function skipUI(show, frac = 0, label = null) {
    if (!show) { if (ring) { ring.remove(); ring = null; } return; }
    if (!ring) {
      ring = document.createElement('div'); ring.id = 'skipHold';
      ring.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg" stroke-dasharray="100.5" stroke-dashoffset="100.5" transform="rotate(-90 20 20)"/></svg><span>Hold <kbd>SPACE</kbd> to skip</span>';
      document.body.appendChild(ring); ring._fg = ring.querySelector('.fg');
    }
    ring._fg.style.strokeDashoffset = String(100.5 * (1 - clamp(frac, 0, 1))); ring.classList.toggle('held', frac > 0.02);
    const txt = label || 'Hold <kbd>SPACE</kbd> to skip';      // online: who is still to vote (see skipVote in main.js)
    if (ring._txt !== txt) { ring._txt = txt; ring.querySelector('span').innerHTML = txt; }
  };
  /** The announcer's portrait for menus and cards: draws into a canvas. */
  T.portrait = (cv) => drawFace(cv, ANNOUNCER.name, ANNOUNCER.color, ANNOUNCER.cap);
  return T;
}
