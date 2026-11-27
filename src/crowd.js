// crowd.js - a living, reactive, class-structured stadium crowd (Three.js r160, ES module).
//
// InstancedMeshes, all under `group` (one draw call each): three bodies (tunic and hose, kirtle / gown, long robe), head, armL, armR, ten pieces of
//   headwear (coif, hood, straw hat, veil, chaperon, hennin, tall hat, mitre, escoffion, felt cap), flagA / flagB (two-colour pennants),
//   kerchief (ladies' waving cloths), toss (pooled ballistic items: thrown hats and flowers / favours).
//   The figures are the modelled parts of src/people.js, dressed from the clothing atlas: a cut of garment per person (by class), dyed his own
//   colour; a build (thin .. heavy: more heavy figures in the gallery and among the clergy); a face, skin and hair.
//
// SPOTS: [x, y, z, side, cls = 1, yaw?]. cls: 0 COMMONS (stand, rowdy, fast), 1 BURGHERS (seated, cheerful),
//   2 NOBLES & LADIES (seated, restrained, rich dress), 3 CLERGY (calm). yaw = facing (sin yaw, 0, cos yaw);
//   when undefined it is derived from side (+1 faces -X, -1 faces +X).
//
// UPDATE state s: excitement, anticipation, favour, favourCommons, favourCourt, scorer, waveStart, focusZ,
//   event {id, kind, by}. Event ids are edge-detected; kinds: break helm unhorse attaint glance miss bothbreak bothmiss near tilt foul taunt salute win loss start.
//   `by` = whose stroke (+1 the player, -1 the opponent, 0 = everyone alike: the double events). Supporters of `by` and the rest get different tables, per class.
//
// PER-PERSON LAYOUT (typed arrays indexed by spectator i; built once, nothing allocated per frame)
//   constants: px,py,pz, side, cls, thr (allegiance threshold in (-1,1): supports A when thr < favour of its class),
//              keen, ph (phase), hg (height), bw (width), kind (0 man,1 woman,2 child), special (0,1 always stands,
//              2 hat waver, 3 air-puncher), hw (headwear code), dv (dismay variant), jz (focus jitter),
//              dly (event reaction delay by class), yb/hasYaw (explicit facing)
//   slots:     hatIdx (in the mesh of his headwear), capIdx (the same, for hats that can be thrown or waved), flagIdx, kerchIdx (instance index or -1)
//   dress:     gown (body: 0 tunic, 1 gown, 2 robe), cellI (garment cell of the atlas), fat (-0.4 thin .. 1 heavy), faceU, slvU (face and sleeve cells)
//   smoothed:  sCheer, sDis, sClap, sStand, sLean (continuous excitement layer, eased every frame)
//   event layer: not stored; an envelope is evaluated from (t - eventTime - dly) and a precomputed
//              class x supporter reaction table (NCH channels) so reactions are smooth and allocation free.
//   cached:    al (current allegiance) so livery colours are rewritten only when someone switches sides.
//   capGone/capBack: time window in which a person's hat is in the air (their own cap instance is hidden).

import * as THREE from 'three';
import { GFX } from './gfx.js';
import { partGeo, shareGeo, crowdMaterial, GARMENTS, faceUV, patchUV } from './people.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sstep = (a, b, x) => { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const PI = Math.PI, HALF_PI = Math.PI / 2, TWO_PI = Math.PI * 2;

// ---- palettes: 15th-century dyes. Mostly undyed / cheap wool; richer cloth for the gallery and a few burghers. Saturated colour is left to heralds and liveries. ----
const WOOL = ['#b9ab8f', '#7d715f', '#8f7a5a', '#8a4b2e', '#3f5233', '#4a5f7a', '#8e3b2f', '#2a2622', '#a89a7e', '#6e6451', '#9c8566', '#5b4a38'];
const RICHD = ['#7a1c2c', '#213f78', '#1f5a43', '#5a2a52', '#8a1d2b', '#2c4f8a', '#a07a2a', '#4a2a6a'];
const BLACKS = ['#2a2622', '#2e2a26', '#24211f'];
const HABIT = ['#1c1a18', '#3a2a1c', '#4a3a2a', '#d8d0bc', '#2b2622'];
const SKIN = ['#f0c8a4', '#e0ac84', '#c68e63', '#a8704a', '#7c4f33', '#f4d6bb', '#d9a37c', '#b98059', '#e8b890', '#946040'];
const LINEN = ['#e0d9c3', '#d0c7ac', '#c4baa0', '#b9ab8f'];
const STRAW = ['#c4a45e', '#b5954c', '#cbb070', '#a98a4a'];
const FLOWERS = ['#d8222a', '#f2efe6', '#e87aa0', '#f0c040'];
const HAIR = ['#2a211a', '#3a2a1c', '#4a3524', '#6b4a2a', '#8a5a2c', '#b08a4a', '#8a3a1c', '#1c1714'], GREY = ['#9a958c', '#c8c4ba', '#77726a'];
// headwear: code -> mesh (0 = bare-headed). 1 coif, 2 hood, 3 straw, 4 veil and wimple, 5 chaperon, 6 hennin, 7 tall hat, 8 mitre, 9 escoffion, 10 felt cap
const HATS_LIST = [null, 'coif', 'hood', 'straw', 'veil', 'chaperon', 'hennin', 'tallhat', 'mitre', 'escoffion', 'feltcap'];
const BODIES = ['tunic', 'gown', 'robe'];
// build by class: [chance of a heavy figure, chance of a thin one] (commons, burghers, gallery, clergy)
const BUILD = [[0.08, 0.35], [0.22, 0.15], [0.45, 0.08], [0.4, 0.12]];
const SLEEVE = { tunic_apron: 'sleeve_rolled', kirtle_apron: 'sleeve_rolled', kirtle_laced: 'sleeve_linen', tabard: 'sleeve_linen', cassock: 'sleeve_linen', pourpoint_damask: 'sleeve_fur', doublet_brocade: 'sleeve_fur',
  gown_burgundian: 'sleeve_fur', houppelande_f: 'sleeve_fur', gown_brocade: 'sleeve_fur', houppelande_m: 'sleeve_fur', houppelande_brocade: 'sleeve_fur', robe_judge: 'sleeve_fur' };
const OWN_SLEEVE = { doublet_brocade: '#8a1d2b', gown_brocade: '#213f78', houppelande_brocade: '#24211f', habit_nun: '#24211f', cassock: '#e0d9c3' };
const HEAD_K = 1.0, HEAD_UP = 0.19;      // life-size heads, about 7.3 to the figure's height (traced from the courtiers of the Chroniques de Hainaut frontispiece); the skull's middle above the shoulder line
const SHOULDER = [0.176, 0.152, 0.186];      // where the arm hangs, by body (tunic: the padded shoulders of the short gown; gown; robe)

// ---- event reaction channels ----
const NCH = 17;
const CH_CHEER = 0, CH_DIS = 1, CH_FIST = 2, CH_JEER = 3, CH_ANGRY = 4, CH_POLITE = 5, CH_KERCH = 6,
  CH_BOW = 7, CH_BLESS = 8, CH_CROSS = 9, CH_RECOIL = 10, CH_STAND = 11, CH_WILD = 12, CH_SHAKE = 13,
  CH_HEAD = 14,   // both hands (or one) clutched to the head: "ooh"
  CH_SLUMP = 15,  // shoulders drop, head down, arms hang: "aww"
  CH_LAUGH = 16;  // shoulders shake; commons point and guffaw, the gallery laughs behind a hand

// module-level scratch (no per-frame allocation)
let r0 = 1, r1 = 0, r2 = 0, r3 = 0, r4 = 1, r5 = 0, r6 = 0, r7 = 0, r8 = 1; // body rotation, column-major
let ox = 0, oy = 0, oz = 0;           // xf output
let ax_ = 0, ay_ = 0, az_ = 0, rem_ = 1; // arm direction accumulator
const _c = new THREE.Color();

function xf(vx, vy, vz) {
  ox = r0 * vx + r3 * vy + r6 * vz;
  oy = r1 * vx + r4 * vy + r7 * vz;
  oz = r2 * vx + r5 * vy + r8 * vz;
}
function addDir(w, x, y, z) {
  if (w > rem_) w = rem_;
  if (w <= 0) return;
  ax_ += x * w; ay_ += y * w; az_ += z * w; rem_ -= w;
}
function wm(arr, o, ax, ay, az, bx, by, bz, cx, cy, cz, tx, ty, tz) {
  arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az; arr[o + 3] = 0;
  arr[o + 4] = bx; arr[o + 5] = by; arr[o + 6] = bz; arr[o + 7] = 0;
  arr[o + 8] = cx; arr[o + 9] = cy; arr[o + 10] = cz; arr[o + 11] = 0;
  arr[o + 12] = tx; arr[o + 13] = ty; arr[o + 14] = tz; arr[o + 15] = 1;
}
function putCol(arr, idx, rgb, o, k = 1) { arr[idx * 3] = rgb[o] * k; arr[idx * 3 + 1] = rgb[o + 1] * k; arr[idx * 3 + 2] = rgb[o + 2] * k; }

function makeMesh(geo, mat, count, group, name) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.count = count;
  m.name = name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = true;
  m.setColorAt(0, _c.set('#ffffff')); // creates the instanceColor attribute
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(m);
  return m;
}

export function buildCrowd(group, spots, opts = {}) {
  const rng = mulberry32((opts.seed ?? 1) | 0);
  const n = spots.length;

  // livery as linear rgb: [A1 r g b, A2 r g b, B1 r g b, B2 r g b]
  const livery = new Float32Array(12);
  let al = null;
  function setColors(cA, cB) {
    const set = (arr, o) => {
      _c.set(arr[0]); livery[o] = _c.r; livery[o + 1] = _c.g; livery[o + 2] = _c.b;
      _c.set(arr[1]); livery[o + 3] = _c.r; livery[o + 4] = _c.g; livery[o + 5] = _c.b;
    };
    if (cA) set(cA, 0);
    if (cB) set(cB, 6);
    if (al) al.fill(0); // force recolour on next update
  }
  setColors(opts.colorsA || ['#1f4690', '#e0b83c'], opts.colorsB || ['#a81e1e', '#ece8dc']);

  // ---- per-person constants ----
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  const side = new Int8Array(n), kind = new Uint8Array(n), special = new Uint8Array(n), clsA = new Uint8Array(n);
  const gown = new Uint8Array(n), bodyIdx = new Int32Array(n), fat = new Float32Array(n), cellI = new Uint8Array(n), faceU = new Float32Array(n * 2), slvU = new Float32Array(n * 2), hatIdx = new Int32Array(n).fill(-1);
  const hairCol = new Float32Array(n * 3), skinCol = new Float32Array(n * 3), nBody = [0, 0, 0], nHat = HATS_LIST.map(() => 0);
  const hw = new Uint8Array(n), dv = new Uint8Array(n), hasYaw = new Uint8Array(n);
  const thr = new Float32Array(n), keen = new Float32Array(n), ph = new Float32Array(n), yb = new Float32Array(n);
  const shd = new Float32Array(n), hs = new Float32Array(n), stP = new Float32Array(n), stR = new Float32Array(n), stY = new Float32Array(n), bodyLiv = new Uint8Array(n);
  const hg = new Float32Array(n), bw = new Float32Array(n), jz = new Float32Array(n), dly = new Float32Array(n);
  const capIdx = new Int32Array(n).fill(-1), flagIdx = new Int32Array(n).fill(-1), kerchIdx = new Int32Array(n).fill(-1);
  const capLiv = new Uint8Array(n); // 0 none, 1 follows colour1, 2 colour2
  const capGone = new Float32Array(n), capBack = new Float32Array(n);
  const sCheer = new Float32Array(n), sDis = new Float32Array(n), sClap = new Float32Array(n);
  const sStand = new Float32Array(n), sLean = new Float32Array(n);
  al = new Int8Array(n);

  const bodyCol = new Float32Array(n * 3), armCol = new Float32Array(n * 3), headCol = new Float32Array(n * 3);
  const capCol = new Float32Array(n * 3), veilCol = new Float32Array(n * 3);
  const pick = (a) => a[(rng() * a.length) | 0];
  const lin = (hex, jit, out, o) => {
    _c.set(hex); const k = 1 + (rng() - 0.5) * jit;
    out[o] = _c.r * k; out[o + 1] = _c.g * k; out[o + 2] = _c.b * k;
  };

  // reaction delay ranges by class (seconds)
  const DLY0 = [0, 0.15, 0.3, 0.4], DLY1 = [0.15, 0.5, 0.8, 0.9];

  let nFlag = 0, nKerch = 0;
  for (let i = 0; i < n; i++) {
    const sp = spots[i];
    px[i] = sp[0]; py[i] = sp[1]; pz[i] = sp[2]; side[i] = sp[3] >= 0 ? 1 : -1;
    let cls = sp[4] === undefined ? 1 : sp[4] | 0;
    if (cls < 0 || cls > 3) cls = 1;
    clsA[i] = cls;
    if (sp[5] !== undefined && sp[5] !== null) { hasYaw[i] = 1; yb[i] = sp[5]; }
    thr[i] = (rng() * 2 - 1) * 0.98;
    keen[i] = Math.pow(rng(), 0.8);
    ph[i] = rng() * TWO_PI;
    jz[i] = (rng() - 0.5) * 7;
    dv[i] = rng() < 0.5 ? 0 : 1;
    dly[i] = DLY0[cls] + rng() * (DLY1[cls] - DLY0[cls]);

    let kd;
    if (cls <= 1) kd = rng() < 0.06 ? 2 : (rng() < 0.42 ? 1 : 0);
    else if (cls === 2) kd = rng() < 0.5 ? 1 : 0;
    else kd = rng() < 0.14 ? 1 : 0;      // (a few nuns among the clergy)
    kind[i] = kd;
    const adultH = cls === 2 ? 1.0 + rng() * 0.04 : 1.0;
    hg[i] = (kd === 2 ? 0.66 + rng() * 0.08 : kd === 1 ? 0.95 + (cls === 2 ? 0.03 : 0) : adultH) * (0.92 + rng() * 0.16);   // +-8% height
    bw[i] = (0.96 + rng() * 0.08) * (kd === 1 ? 0.95 : 1);                                                                // shoulders: the build does the rest
    { const u = rng(), B = BUILD[cls]; fat[i] = kd === 2 ? -0.25 + rng() * 0.45 : u < B[0] ? 0.55 + rng() * 0.45 : u < B[0] + B[1] ? -0.4 + rng() * 0.25 : -0.12 + rng() * 0.42; }
    hs[i] = 0.94 + rng() * 0.12;                                                                                          // +-6% head
    // stance: a standing figure never stands like his neighbour (lean, cant, turn of the shoulders)
    const stm = cls === 0 ? 1 : cls === 1 ? 0.5 : 0.2;
    stP[i] = (rng() - 0.4) * 0.09 * stm; stR[i] = (rng() - 0.5) * 0.12 * stm; stY[i] = (rng() - 0.5) * 0.5 * stm;
    // light: the back rows sit under the stand roofs (darker), the front is open to the sky; the ground-level commons are lit but low in the shadow of the stands
    const ax = Math.abs(sp[0]);
    let sh = 1;
    if (sp[1] > 0.3 && ax >= 12.4) { const tr = Math.min(6, Math.max(0, (ax - 13.05) / 1.35)) / 6; sh = 1 - 0.3 * Math.pow(tr, 1.25); }
    else if (ax > 10.2 && ax < 12.4) sh = 0.82;
    shd[i] = sh * (0.94 + rng() * 0.1);

    // the cut: a body (0 tunic and hose, 1 kirtle or gown, 2 long robe) and one of the garments of the atlas that his class wears
    const bt = kd === 1 || (kd === 2 && rng() < 0.5) ? 1 : cls === 3 ? 2 : (cls === 2 && rng() < 0.45) || (cls === 1 && kd === 0 && rng() < 0.12) ? 2 : 0;
    gown[i] = bt; bodyIdx[i] = nBody[bt]++;
    {
      const ok = GARMENTS.filter(g => g.body === BODIES[bt] && g.cls[cls] && !(cls === 3 && (g.id === 'habit_nun') !== (kd === 1)));
      let tot = 0; for (const g of ok) tot += g.cls[cls]; let u = rng() * tot, pickG = ok[0] || GARMENTS.find(g => g.body === BODIES[bt]);
      for (const g of ok) { u -= g.cls[cls]; if (u <= 0) { pickG = g; break; } }
      cellI[i] = pickG.i;
    }

    // headwear
    const r = rng();
    let h = 0;
    if (cls === 0) {
      if (kd === 0) h = r < 0.12 ? 0 : r < 0.3 ? 1 : r < 0.62 ? 2 : r < 0.82 ? 3 : 10;
      else if (kd === 1) h = r < 0.08 ? 0 : r < 0.38 ? 1 : r < 0.5 ? 2 : r < 0.58 ? 3 : 4;
      else h = r < 0.6 ? 0 : r < 0.8 ? 2 : r < 0.9 ? 3 : 10;
    } else if (cls === 1) {
      if (kd === 0) h = r < 0.15 ? 0 : r < 0.23 ? 1 : r < 0.4 ? 2 : r < 0.65 ? 10 : 5;
      else if (kd === 1) h = r < 0.15 ? 0 : r < 0.35 ? 1 : r < 0.4 ? 2 : 4;
      else h = r < 0.6 ? 0 : r < 0.8 ? 2 : 10;
    } else if (cls === 2) {
      if (kd === 1) h = r < 0.4 ? 6 : r < 0.68 ? 9 : r < 0.88 ? 4 : 0;
      else h = r < 0.4 ? 5 : r < 0.8 ? 7 : 0;
    } else {
      h = kd === 1 ? 4 : r < 0.06 ? 8 : r < 0.55 ? 2 : 0; // nun's veil / mitre / hood / tonsure
    }
    const sr = rng();
    if (cls <= 1 && kd !== 2) {
      if (sr < 0.06) special[i] = 1;
      else if (sr < 0.09) { special[i] = 2; if (h !== 3 && h !== 10) h = kd === 1 ? 3 : 10; }
      else if (sr < 0.12) special[i] = 3;
    } else if (cls === 3 && sr < 0.3) special[i] = 1;
    if (GARMENTS[cellI[i]].id === 'cope') h = 8; else if (h === 8) cellI[i] = GARMENTS.findIndex(g => g.id === 'cope');      // the mitre and the cope go together
    hw[i] = h;
    if (h) { hatIdx[i] = nHat[h]++; if (h <= 3 || h === 10) capIdx[i] = hatIdx[i]; }      // (capIdx: the hats that can be thrown or waved)
    if (cls <= 1 && kd !== 2 && rng() < 0.105) flagIdx[i] = nFlag++;
    if (cls === 2 && kd === 1) kerchIdx[i] = nKerch++;

    // colours by class (about 70% muted, 30% richer cloth)
    const bi = i * 3;
    const wool = () => (rng() < 0.12 ? pick(BLACKS) : pick(WOOL));
    if (cls === 0) lin(rng() < 0.2 ? pick(RICHD) : pick(WOOL), 0.22, bodyCol, bi);
    else if (cls === 1) { const q = rng(); lin(q < 0.16 ? pick(BLACKS) : q < 0.6 ? pick(WOOL) : q < 0.72 ? pick(WOOL) : pick(RICHD), 0.16, bodyCol, bi); }
    else if (cls === 2) lin(rng() < 0.55 ? pick(RICHD) : wool(), 0.12, bodyCol, bi);
    else lin(h === 8 ? '#4a2a6a' : pick(HABIT), 0.1, bodyCol, bi);
    // front-row "knights' men": livery tabards in a dark muted tone (follows allegiance), off-white sleeves
    const liveried = cls === 0 && sp[1] < 0.3 && ax > 10.2 && ax < 12.4 && rng() < 0.4;
    bodyLiv[i] = liveried ? 1 : 0;
    const sl = rng();
    if (liveried) lin(pick(LINEN), 0.08, armCol, bi);
    else if (cls >= 2 ? sl < 0.9 : sl < 0.65) { armCol[bi] = bodyCol[bi]; armCol[bi + 1] = bodyCol[bi + 1]; armCol[bi + 2] = bodyCol[bi + 2]; }
    else if (sl < 0.85) lin(pick(LINEN), 0.1, armCol, bi);
    else lin(pick(SKIN), 0.1, armCol, bi);
    lin(pick(SKIN), 0.2, headCol, bi); headCol[bi] *= 0.9; headCol[bi + 1] *= 0.88; headCol[bi + 2] *= 0.86; skinCol[bi] = headCol[bi]; skinCol[bi + 1] = headCol[bi + 1]; skinCol[bi + 2] = headCol[bi + 2];
    if (liveried && gown[i] === 0) cellI[i] = GARMENTS.findIndex(g => g.id === 'tabard');
    const gid = GARMENTS[cellI[i]].id;
    if (OWN_SLEEVE[gid]) lin(OWN_SLEEVE[gid], 0.06, armCol, bi);
    { const s2 = patchUV(liveried ? 'sleeve_linen' : SLEEVE[gid] || (cls === 0 && sl > 0.8 ? 'sleeve_rolled' : sl > 0.65 && sl < 0.85 ? 'sleeve_linen' : 'sleeve_wool')); slvU[i * 2] = s2[0]; slvU[i * 2 + 1] = s2[1]; }
    // the face: by sex and age; the hair's colour (grey for the old)
    let fc;
    { const u = rng();
      if (kd === 2) fc = rng() < 0.5 ? 'boy' : 'girl';
      else if (kd === 1) fc = u < 0.14 ? 'f_old' : u < 0.42 ? 'f_young' : u < 0.72 ? 'f_plain' : 'f_fair';
      else if (cls === 3 && h !== 8 && u < 0.75) fc = 'm_tonsure';
      else if (fat[i] > 0.5 && u < 0.5) fc = 'm_fat';
      else fc = u < 0.12 ? 'm_old' : u < 0.3 ? 'm_young' : u < 0.5 ? 'm_plain' : u < 0.68 ? 'm_beard' : u < 0.8 ? 'm_fullbeard' : u < 0.9 ? 'm_moustache' : 'm_dark';
      if (kd === 1 && h === 0 && cls < 2 && rng() < 0.6) fc = 'f_coif';
      const f2 = faceUV(fc); faceU[i * 2] = f2[0]; faceU[i * 2 + 1] = f2[1];
      lin(/old/.test(fc) || (fc === 'm_fat' && rng() < 0.4) ? pick(GREY) : pick(HAIR), 0.15, hairCol, bi); }
    if (h === 1) lin('#e8e2d0', 0.06, capCol, bi);
    else if (h === 4) { lin(kd === 1 && cls === 3 ? '#ece6d6' : pick(LINEN), 0.08, capCol, bi); capCol[bi] *= 1.12; capCol[bi + 1] *= 1.12; capCol[bi + 2] *= 1.12; }
    else if (h === 2) {
      if (cls === 3) { capCol[bi] = bodyCol[bi]; capCol[bi + 1] = bodyCol[bi + 1]; capCol[bi + 2] = bodyCol[bi + 2]; }
      else lin(rng() < 0.2 && cls === 1 ? pick(RICHD) : wool(), 0.2, capCol, bi);
    } else if (h === 3) lin(pick(STRAW), 0.12, capCol, bi);
    else if (h === 10) lin(rng() < 0.25 ? pick(RICHD) : wool(), 0.18, capCol, bi);
    else if (h === 5) lin(rng() < 0.3 ? pick(BLACKS) : pick(RICHD), 0.15, capCol, bi);
    else if (h === 6 || h === 9) { lin(rng() < 0.75 ? pick(RICHD) : '#a07a2a', 0.1, capCol, bi); lin(pick(LINEN), 0.08, veilCol, bi); }
    else if (h === 7) lin(rng() < 0.4 ? pick(BLACKS) : pick(RICHD), 0.1, capCol, bi);
    else if (h === 8) lin('#e0d8c0', 0.06, capCol, bi);
    if ((h === 2 || h === 5 || h === 10) && cls !== 3 && cls !== 0 && rng() < 0.18) capLiv[i] = h === 5 ? 2 : 1;

    sStand[i] = (cls === 0 || (special[i] === 1 && cls === 1)) ? 1 : 0;
  }

  // ---- geometry: the modelled parts (src/people.js); the low tier takes the lighter set ----
  const BH = 1.4; // standing shoulder height in metres
  const LOD = GFX.tier === 'low' ? '_lo' : '_hi';
  /** A part for instancing: its own geometry object (the vertex data is shared) with the per-instance attributes iPar (cell u, v, fat, seated) and iCol2 (second colour, light). */
  const inst = (name, count, norm) => {
    let g = partGeo(name + LOD);
    if (norm) { g = g.clone(); g.scale(1, 1 / BH, 1); const f = g.attributes.aFat; for (let k = 0; k < f.count; k++) f.setY(k, f.getY(k) / BH); } else g = shareGeo(g);      // bodies: the shoulder line at y = 1 (the matrix carries the height)
    const c = Math.max(1, count), par = new THREE.InstancedBufferAttribute(new Float32Array(c * 4), 4), c2 = new THREE.InstancedBufferAttribute(new Float32Array(c * 4), 4);
    g.setAttribute('iPar', par); g.setAttribute('iCol2', c2); g.userData.par = par.array; g.userData.c2 = c2.array; g.userData.parA = par;
    if (name === 'arm') { const bd = new THREE.InstancedBufferAttribute(new Float32Array(c), 1); bd.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iBend', bd); g.userData.bend = bd.array; g.userData.bendA = bd; }      // the elbow, per instance (people.js shader): no extra draw call
    return g;
  };
  const bodyGeos = BODIES.map((b, k) => inst(b, nBody[k], true)), headGeo = inst('head', n), armGeoL = inst('arm', n), armGeoR = inst('arm', n);
  const hatGeos = HATS_LIST.map((h, k) => (h ? inst(h, nHat[k]) : null));
  const tossGeo = new THREE.SphereGeometry(1, 6, 3, 0, TWO_PI, 0, HALF_PI);
  const flagAGeo = new THREE.BufferGeometry();
  flagAGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.9, 0, 0, 0.75, 0, 0, 0.75, 0.5]), 3));
  flagAGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]), 3));
  const stick = new THREE.BoxGeometry(0.025, 0.92, 0.025).translate(0, 0.42, 0).toNonIndexed();
  const sPos = stick.getAttribute('position').array, sNor = stick.getAttribute('normal').array;
  const bPos = new Float32Array(sPos.length + 9), bNor = new Float32Array(sNor.length + 9);
  bPos.set(sPos); bPos.set([0, 0.75, 0, 0, 0.6, 0, 0, 0.75, 0.5], sPos.length);
  bNor.set(sNor); bNor.set([1, 0, 0, 1, 0, 0, 1, 0, 0], sNor.length);
  const flagBGeo = new THREE.BufferGeometry();
  flagBGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  flagBGeo.setAttribute('normal', new THREE.BufferAttribute(bNor, 3));
  const kerchGeo = new THREE.BufferGeometry(); // small quad in the YZ plane
  kerchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
    [0, -0.13, -0.13, 0, 0.13, -0.13, 0, 0.13, 0.13, 0, -0.13, -0.13, 0, 0.13, 0.13, 0, -0.13, 0.13]), 3));
  kerchGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]), 3));

  for (const g of [tossGeo, flagAGeo, flagBGeo, kerchGeo]) {
    const cnt = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: 0.25, vertexColors: true });
  const flagMat = new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: 0.25, side: THREE.DoubleSide, vertexColors: true });
  const pmat = crowdMaterial();

  const POOL = 80, HATS = 40;
  const mBodies = bodyGeos.map((g, k) => makeMesh(g, pmat, nBody[k], group, 'crowdBody' + k));
  const mHead = makeMesh(headGeo, pmat, n, group, 'crowdHead');
  const mArmL = makeMesh(armGeoL, pmat, n, group, 'crowdArmL');
  const mArmR = makeMesh(armGeoR, pmat, n, group, 'crowdArmR');
  const mHats = hatGeos.map((g, k) => (g ? makeMesh(g, pmat, nHat[k], group, 'crowdHat_' + HATS_LIST[k]) : null));
  const mFlagA = makeMesh(flagAGeo, flagMat, nFlag, group, 'crowdFlagA');
  const mFlagB = makeMesh(flagBGeo, flagMat, nFlag, group, 'crowdFlagB');
  const mKerch = makeMesh(kerchGeo, flagMat, nKerch, group, 'crowdKerchief');
  const mToss = makeMesh(tossGeo, mat, POOL, group, 'crowdToss');

  const cBody = mBodies.map(m => m.instanceColor.array), cH = mHead.instanceColor.array;
  const cL = mArmL.instanceColor.array, cR = mArmR.instanceColor.array;
  const cHat = mHats.map(m => (m ? m.instanceColor.array : null));
  const cFA = mFlagA.instanceColor.array, cFB = mFlagB.instanceColor.array;
  const cK = mKerch.instanceColor.array, cP = mToss.instanceColor.array;
  const put4 = (arr, idx, a, b, c, d) => { arr[idx * 4] = a; arr[idx * 4 + 1] = b; arr[idx * 4 + 2] = c; arr[idx * 4 + 3] = d; };
  const pBody = bodyGeos.map(g => g.userData.par);
  for (let i = 0; i < n; i++) {
    const k = shd[i], o = i * 3, bt = gown[i], bi = bodyIdx[i], kh = 0.5 + 0.5 * k, G = GARMENTS[cellI[i]];
    putCol(cBody[bt], bi, bodyCol, o, k); put4(pBody[bt], bi, G.uv[0], G.uv[1], fat[i], 0); put4(bodyGeos[bt].userData.c2, bi, skinCol[o] * k, skinCol[o + 1] * k, skinCol[o + 2] * k, k);
    putCol(cH, i, headCol, o, kh); put4(headGeo.userData.par, i, faceU[i * 2], faceU[i * 2 + 1], Math.max(-0.3, fat[i]), 0); put4(headGeo.userData.c2, i, hairCol[o] * kh, hairCol[o + 1] * kh, hairCol[o + 2] * kh, kh);
    putCol(cL, i, armCol, o, k); putCol(cR, i, armCol, o, k);
    for (const g of [armGeoL, armGeoR]) { put4(g.userData.par, i, slvU[i * 2], slvU[i * 2 + 1], 0, 0); put4(g.userData.c2, i, skinCol[o] * k, skinCol[o + 1] * k, skinCol[o + 2] * k, k); }
    const h = hw[i];
    if (h) { const hi = hatIdx[i], uv = patchUV(HATS_LIST[h]); putCol(cHat[h], hi, capCol, o, k); put4(hatGeos[h].userData.par, hi, uv[0], uv[1], 0, 0); put4(hatGeos[h].userData.c2, hi, veilCol[o] * k, veilCol[o + 1] * k, veilCol[o + 2] * k, k); }
    if (kerchIdx[i] >= 0) { const k = kerchIdx[i] * 3; const v = (rng() < 0.7 ? 0.9 : 0.75) * shd[i]; cK[k] = v; cK[k + 1] = rng() < 0.7 ? v : 0.55; cK[k + 2] = cK[k + 1]; }
  }

  // ---- event layer ----
  const tbl = new Float32Array(4 * 2 * NCH); // [(cls<<1 | supportsDoer) * NCH + channel]
  const setT = (c, s, ch, v) => { tbl[((c << 1) | s) * NCH + ch] = v; };
  let evMag = 1, lastEvId = null, evOn = false, evT = -1e9, evDur = 3.2, evBy = 0;
  // per-person variation, redrawn for every event so no two reactions look alike: extra delay, strength (a few barely react), which arm leads, one hand or two
  const evJit = new Float32Array(n), evInt = new Float32Array(n), evArm = new Uint8Array(n), evOne = new Uint8Array(n);
  const EV_MAG = { break: 1.3, helm: 1.5, unhorse: 1.7, win: 1.5, bothbreak: 1.5, salute: 1.1 };      // how much bigger the cheer gets with the size of the hit
  const EV_DUR = { unhorse: 4.0, win: 4.0, bothbreak: 3.8, salute: 3.0, foul: 3.6, bothmiss: 3.0, miss: 2.6, attaint: 2.4, taunt: 2.4, glance: 1.9, near: 1.6, tilt: 1.8 };

  // pooled tossed items: slots [0,HATS) hats, [HATS,POOL) flowers / favours
  const pX = new Float32Array(POOL), pY = new Float32Array(POOL), pZ = new Float32Array(POOL);
  const pVX = new Float32Array(POOL), pVY = new Float32Array(POOL), pVZ = new Float32Array(POOL);
  const pT0 = new Float32Array(POOL), pT1 = new Float32Array(POOL), pRest = new Float32Array(POOL);
  const pSize = new Float32Array(POOL), pSpin = new Float32Array(POOL);
  const pState = new Uint8Array(POOL); // 0 idle, 1 pending/flying, 2 resting (flowers)
  let hatCur = 0, flowCur = 0, poolWas = false, poolColDirty = false;
  const mP = mToss.instanceMatrix.array;
  for (let j = 0; j < POOL; j++) wm(mP, j * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

  function buildTable(k) {
    tbl.fill(0);
    switch (k) {
      case 'break':       // a lance broken on the shield or body: the stands roar, the gallery applauds
        setT(0, 1, CH_CHEER, 0.9); setT(0, 1, CH_FIST, 0.7); setT(0, 1, CH_STAND, 1); setT(0, 0, CH_DIS, 0.35);
        setT(1, 1, CH_CHEER, 0.7); setT(1, 1, CH_STAND, 0.8); setT(1, 0, CH_DIS, 0.25);
        setT(2, 1, CH_POLITE, 0.9); setT(2, 0, CH_POLITE, 0.6); setT(3, 1, CH_POLITE, 0.4); break;
      case 'helm':        // broken on the helm: everyone up, the ladies wave kerchiefs
        setT(0, 1, CH_CHEER, 1); setT(0, 1, CH_FIST, 0.8); setT(0, 1, CH_STAND, 1); setT(0, 0, CH_DIS, 0.4); setT(0, 0, CH_HEAD, 0.5);
        setT(1, 1, CH_CHEER, 0.8); setT(1, 1, CH_STAND, 1); setT(1, 0, CH_DIS, 0.3); setT(1, 0, CH_HEAD, 0.4);
        setT(2, 1, CH_STAND, 1); setT(2, 0, CH_STAND, 1); setT(2, 1, CH_POLITE, 1); setT(2, 0, CH_POLITE, 0.8);
        setT(2, 1, CH_KERCH, 0.9); setT(2, 0, CH_KERCH, 0.5); break;
      case 'unhorse':     // the fall: commons go wild, the fallen man's gallery crosses itself
        setT(0, 1, CH_CHEER, 1); setT(0, 1, CH_FIST, 0.6); setT(0, 1, CH_STAND, 1); setT(0, 1, CH_WILD, 1);
        setT(0, 0, CH_DIS, 0.8); setT(0, 0, CH_WILD, 1); setT(0, 0, CH_HEAD, 0.6);
        setT(1, 1, CH_CHEER, 0.9); setT(1, 1, CH_STAND, 1); setT(1, 0, CH_DIS, 0.5);
        setT(2, 1, CH_STAND, 1); setT(2, 1, CH_POLITE, 1); setT(2, 1, CH_KERCH, 0.9);
        setT(2, 0, CH_STAND, 1); setT(2, 0, CH_CROSS, 0.8); setT(2, 0, CH_KERCH, 0.3); setT(2, 0, CH_RECOIL, 0.4);
        setT(3, 0, CH_CROSS, 1); setT(3, 1, CH_CROSS, 1); break;
      case 'attaint':     // a touch that does not break: a polite ripple, nobody leaps up
        setT(0, 1, CH_CHEER, 0.25); setT(0, 1, CH_POLITE, 0.7); setT(0, 0, CH_POLITE, 0.45); setT(0, 0, CH_DIS, 0.12);
        setT(1, 1, CH_POLITE, 0.8); setT(1, 0, CH_POLITE, 0.5);
        setT(2, 0, CH_POLITE, 0.9); setT(2, 1, CH_POLITE, 1); setT(3, 1, CH_POLITE, 0.3); break;
      case 'glance':      // the point skids off: "ooh", hands to the heads, no roar
        setT(0, 1, CH_HEAD, 1); setT(0, 0, CH_HEAD, 0.9); setT(0, 1, CH_STAND, 0.6); setT(0, 0, CH_STAND, 0.4);
        setT(1, 1, CH_HEAD, 0.8); setT(1, 0, CH_HEAD, 0.7);
        setT(2, 1, CH_RECOIL, 0.5); setT(2, 0, CH_RECOIL, 0.5); setT(2, 1, CH_HEAD, 0.3); setT(2, 0, CH_HEAD, 0.3); break;
      case 'miss':        // a clean miss: "aww", shoulders slump; a few jeers and laughs from the commons
        setT(0, 1, CH_SLUMP, 1); setT(0, 1, CH_DIS, 0.35); setT(0, 1, CH_LAUGH, 0.2);
        setT(0, 0, CH_JEER, 0.7); setT(0, 0, CH_LAUGH, 0.9); setT(0, 0, CH_SLUMP, 0.3);
        setT(1, 1, CH_SLUMP, 0.8); setT(1, 0, CH_LAUGH, 0.5); setT(1, 0, CH_JEER, 0.25); setT(1, 0, CH_SLUMP, 0.3);
        setT(2, 1, CH_SHAKE, 0.5); setT(2, 0, CH_SHAKE, 0.4); setT(2, 1, CH_SLUMP, 0.4); setT(2, 0, CH_LAUGH, 0.25);
        setT(3, 1, CH_SHAKE, 0.4); setT(3, 0, CH_SHAKE, 0.4); break;
      case 'bothbreak':   // both lances in splinters: everyone up, the biggest roar short of a fall
        setT(0, 1, CH_CHEER, 1); setT(0, 1, CH_FIST, 0.9); setT(0, 1, CH_STAND, 1); setT(0, 1, CH_WILD, 0.8);
        setT(1, 1, CH_CHEER, 1); setT(1, 1, CH_STAND, 1);
        setT(2, 1, CH_STAND, 1); setT(2, 1, CH_POLITE, 1); setT(2, 1, CH_KERCH, 1);
        setT(3, 1, CH_POLITE, 0.6); break;
      case 'bothmiss':    // neither lance touches: laughter, the nobles shake their heads
        setT(0, 1, CH_LAUGH, 1); setT(0, 1, CH_JEER, 0.35); setT(0, 1, CH_SLUMP, 0.3);
        setT(1, 1, CH_LAUGH, 0.7); setT(1, 1, CH_SLUMP, 0.35);
        setT(2, 1, CH_SHAKE, 1); setT(2, 1, CH_LAUGH, 0.3); setT(3, 1, CH_SHAKE, 0.6); break;
      case 'near':        // the point goes by the helm: a sharp gasp, everyone flinches
        setT(0, 1, CH_RECOIL, 0.8); setT(0, 0, CH_RECOIL, 0.8); setT(0, 1, CH_HEAD, 0.5); setT(0, 0, CH_HEAD, 0.5);
        setT(1, 1, CH_RECOIL, 0.7); setT(1, 0, CH_RECOIL, 0.7);
        setT(2, 1, CH_RECOIL, 1); setT(2, 0, CH_RECOIL, 1); setT(3, 1, CH_RECOIL, 0.5); setT(3, 0, CH_RECOIL, 0.5); break;
      case 'tilt':        // a lance into the barrier: "oof", a wince and a recoil
        setT(0, 1, CH_RECOIL, 1); setT(0, 0, CH_RECOIL, 1); setT(0, 1, CH_SLUMP, 0.4); setT(0, 0, CH_LAUGH, 0.4);
        setT(1, 1, CH_RECOIL, 0.8); setT(1, 0, CH_RECOIL, 0.8);
        setT(2, 1, CH_RECOIL, 0.7); setT(2, 0, CH_RECOIL, 0.7); setT(2, 0, CH_SHAKE, 0.4); break;
      case 'foul':        // a blow on the horse: commons fists and boos, the gallery turns away
        setT(0, 0, CH_ANGRY, 1); setT(0, 1, CH_ANGRY, 0.5); setT(0, 0, CH_JEER, 0.5); setT(0, 0, CH_FIST, 0.7); setT(0, 0, CH_STAND, 1);
        setT(1, 0, CH_ANGRY, 0.5); setT(1, 1, CH_ANGRY, 0.25);
        setT(2, 0, CH_RECOIL, 1); setT(2, 1, CH_RECOIL, 1);
        setT(3, 0, CH_SHAKE, 1); setT(3, 1, CH_SHAKE, 1); setT(2, 0, CH_SHAKE, 0.5); setT(2, 1, CH_SHAKE, 0.5); break;
      case 'taunt':       // the player plays the fool: the commons laugh, the gallery raises its eyebrows
        setT(0, 1, CH_LAUGH, 0.9); setT(0, 0, CH_LAUGH, 0.7); setT(0, 0, CH_JEER, 0.3);
        setT(1, 1, CH_LAUGH, 0.6); setT(1, 0, CH_LAUGH, 0.5); setT(2, 1, CH_SHAKE, 0.5); setT(2, 0, CH_SHAKE, 0.6); setT(2, 0, CH_LAUGH, 0.3); break;
      case 'salute':
        setT(0, 1, CH_CHEER, 0.5); setT(1, 1, CH_CHEER, 0.3);
        setT(2, 0, CH_KERCH, 1); setT(2, 1, CH_KERCH, 1); setT(2, 0, CH_BOW, 1); setT(2, 1, CH_BOW, 1); break;
      case 'win':
        setT(0, 1, CH_CHEER, 1); setT(0, 1, CH_FIST, 1); setT(0, 1, CH_STAND, 1); setT(0, 0, CH_DIS, 0.8);
        setT(1, 1, CH_CHEER, 0.9); setT(1, 1, CH_STAND, 1); setT(1, 0, CH_DIS, 0.5);
        setT(2, 1, CH_STAND, 1); setT(2, 0, CH_STAND, 1); setT(2, 1, CH_POLITE, 1); setT(2, 0, CH_POLITE, 0.8);
        setT(2, 1, CH_KERCH, 1); setT(2, 0, CH_KERCH, 1);
        setT(3, 1, CH_POLITE, 0.6); setT(3, 0, CH_POLITE, 0.6); break;
      default: // 'start'
        setT(0, 1, CH_CHEER, 0.4); setT(0, 0, CH_CHEER, 0.4); setT(0, 1, CH_STAND, 1); setT(0, 0, CH_STAND, 1);
        setT(1, 1, CH_POLITE, 0.5); setT(1, 0, CH_POLITE, 0.5); setT(2, 1, CH_POLITE, 0.6); setT(2, 0, CH_POLITE, 0.6);
        setT(3, 0, CH_BLESS, 1); setT(3, 1, CH_BLESS, 1); break;
    }
  }

  function spawnHat(i, launchT) {
    const j = hatCur; hatCur = (hatCur + 1) % HATS;
    const vy = 6.5 + rng() * 3;
    pX[j] = px[i]; pY[j] = py[i] + 1.55 * hg[i]; pZ[j] = pz[i];
    pVX[j] = (rng() - 0.5) * 2.4; pVY[j] = vy; pVZ[j] = (rng() - 0.5) * 2.4;
    pT0[j] = launchT; pT1[j] = launchT + 2 * vy / 9.8;
    pSize[j] = 0.15; pSpin[j] = (rng() - 0.5) * 18; pState[j] = 1;
    const cC = cHat[hw[i]], ci = capIdx[i] * 3; cP[j * 3] = cC[ci]; cP[j * 3 + 1] = cC[ci + 1]; cP[j * 3 + 2] = cC[ci + 2];
    capGone[i] = launchT; capBack[i] = pT1[j];
    poolColDirty = true;
  }
  function spawnFlower(i, launchT) {
    const j = HATS + flowCur; flowCur = (flowCur + 1) % (POOL - HATS);
    const vy = 4.5 + rng() * 2.5, y0 = py[i] + 1.5 * hg[i], rest = 0.07;
    const T = (vy + Math.sqrt(vy * vy + 19.6 * (y0 - rest))) / 9.8, d = 6 + rng() * 4;
    pX[j] = px[i]; pY[j] = y0; pZ[j] = pz[i];
    pVX[j] = -side[i] * d / T; pVY[j] = vy; pVZ[j] = (rng() - 0.5) * 3;
    pT0[j] = launchT; pT1[j] = launchT + T; pRest[j] = rest;
    pSize[j] = 0.05 + rng() * 0.02; pSpin[j] = (rng() - 0.5) * 12; pState[j] = 1;
    _c.set(pick(FLOWERS)); cP[j * 3] = _c.r; cP[j * 3 + 1] = _c.g; cP[j * 3 + 2] = _c.b;
    poolColDirty = true;
  }

  function fireEvent(k, by, t) {
    if (k === 'loss') { k = 'win'; by = -by; } // `by` lost: the other side's supporters celebrate
    buildTable(k);
    evBy = by; evT = t; evOn = true;
    evDur = EV_DUR[k] || 3.2;
    evMag = EV_MAG[k] || 1;
    const jmax = evDur < 2 ? 0.2 : 0.45;
    for (let i = 0; i < n; i++) {
      const u = rng();
      evInt[i] = u < 0.12 ? 0.15 + rng() * 0.2 : 0.55 + 0.45 * rng();
      evJit[i] = rng() * rng() * jmax; evArm[i] = rng() < 0.5 ? 0 : 1; evOne[i] = rng() < 0.35 ? 1 : 0;
    }
    // hat / flower tossing
    const hatP = k === 'unhorse' ? 0.5 : k === 'win' ? 0.5 : k === 'bothbreak' ? 0.3 : (k === 'break' || k === 'helm') ? 0.2 : 0;
    const flow = k === 'win' || k === 'helm' || k === 'unhorse' || k === 'bothbreak' ? (k === 'win' ? 0.9 : k === 'bothbreak' ? 0.15 : 0.25) : 0;
    let hats = 0, flowers = 0;
    for (let i = 0; i < n; i++) {
      const cls = clsA[i];
      if (cls === 0 && hatP > 0 && capIdx[i] >= 0 && hats < HATS) {
        const sup = by === 0 || al[i] === by;
        if (rng() < (sup ? hatP : hatP * 0.4)) { spawnHat(i, t + dly[i] + evJit[i] + 0.2 + rng() * 0.3); hats++; }
      } else if (cls === 2 && kind[i] === 1 && flow > 0 && flowers < POOL - HATS) {
        if (rng() < flow) { spawnFlower(i, t + dly[i] + evJit[i] + 0.4 + rng() * 0.6); flowers++; }
      }
    }
  }

  // ---- per-frame state ----
  let focus = 0, focusInit = false, upLvl = 0;
  const RISE0 = [0, 0.1, 0.5, 0.55], RISEMAX = [1, 1, 0.6, 0.45];   // by class: when the stand begins to rise, and how far
  const mBd = mBodies.map(m => m.instanceMatrix.array), mH = mHead.instanceMatrix.array;
  const mL = mArmL.instanceMatrix.array, mR = mArmR.instanceMatrix.array, bendArr = [armGeoL.userData.bend, armGeoR.userData.bend];
  const mHat = mHats.map(m => (m ? m.instanceMatrix.array : null));
  const mFA = mFlagA.instanceMatrix.array, mFB = mFlagB.instanceMatrix.array, mK = mKerch.instanceMatrix.array;
  const HIP = 0.62;      // where a seated figure folds (the people material does the folding; see src/people.js)
  const RATE = [1.4, 1.0, 0.7, 0.5];   // reaction speed by class
  const JUMP = [1.0, 0.7, 0.12, 0.04]; // jump amplitude by class
  const SWAY = [1.0, 1.0, 0.4, 0.3];   // idle sway amplitude by class

  // One figure in the spotlight (the "catch a lady's eye" scene in main.js): spot = { i, kin, kind: 'smile' | 'laugh' | 'glare', t0 }.
  let spot = null;
  /** Gentry ladies on one side near z, nearest first: [{ i, x, y, z, kin }] where kin is a gentleman seated close by (or -1). */
  function ladies(sideSign, z, max = 12) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (clsA[i] !== 2 || kind[i] !== 1 || side[i] !== sideSign) continue;
      let kin = -1, kd = 99;
      for (let j = 0; j < n; j++) { if (j === i || clsA[j] !== 2 || kind[j] !== 0 || side[j] !== sideSign) continue; const d = Math.abs(pz[j] - pz[i]) + Math.abs(py[j] - py[i]) * 2; if (d < kd && d < 2.5) { kd = d; kin = j; } }
      out.push({ i, x: px[i], y: py[i], z: pz[i], kin, kx: kin >= 0 ? px[kin] : 0, ky: kin >= 0 ? py[kin] : 0, kz: kin >= 0 ? pz[kin] : 0, d: Math.abs(pz[i] - z) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max);
  }
  /** A spectator to give a voice to (src/crowd_voices.js): a random one of class in `cls` (array) and `kd` kind (0 man, 1 woman, 2 child; -1 any), on stand side `sd`
   *  (+1 / -1; 0 any), nearest `nearZ` when given. Returns { i, x, y, z } with y at head height (in the crowd group's space, which is the world's), or null. */
  function voiceSpot(cls, kd = -1, sd = 0, nearZ = null, tries = 60) {
    let best = -1, bd = 1e9;
    for (let k = 0; k < tries; k++) {
      const i = (Math.random() * n) | 0;
      if (cls && !cls.includes(clsA[i])) continue;
      if (kd >= 0 && kind[i] !== kd) continue;
      if (sd && side[i] !== sd) continue;
      const d = nearZ === null ? Math.random() : Math.abs(pz[i] - nearZ) + Math.random() * 6;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : { i: best, x: px[best], y: py[best] + 1.75 * hg[best], z: pz[best], side: side[best] };
  }
  /** Start (or, with i < 0, end) the scene: her reaction, and her kinsman's if he is given. */
  function spotlight(i, kin, how) { spot = i < 0 ? null : { i, kin, kind: how, t0: null }; }

  function update(t, dt, s) {
    const ex = s.excitement, ant = s.anticipation, scorer = s.scorer | 0;
    const favC = s.favourCommons !== undefined ? s.favourCommons : s.favour;
    const favK = s.favourCourt !== undefined ? s.favourCourt : s.favour;
    const dtc = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    if (!focusInit) { focus = s.focusZ; focusInit = true; }
    focus += (s.focusZ - focus) * (1 - Math.exp(-5 * dtc));

    // event edge detection
    const ev = s.event;
    if (ev && ev.id !== undefined && ev.id !== null) {
      if (lastEvId === null) { lastEvId = ev.id; if (ev.id !== 0) fireEvent(ev.kind, ev.by | 0, t); }
      else if (ev.id !== lastEvId) { lastEvId = ev.id; fireEvent(ev.kind, ev.by | 0, t); }
    }
    if (evOn && t - evT > evDur + 1.5) evOn = false;

    const live = GFX.tier !== 'low';      // the extra idle life (breathing, raised hands) is only for medium and high
    const hush = clamp01((ant - 0.5) * 2) * (1 - clamp01((ex - 0.55) * 3));
    const calm = 1 - hush * 0.85;
    const kC = 1 - Math.exp(-7 * dtc), kD = 1 - Math.exp(-4.5 * dtc), kK = 1 - Math.exp(-5 * dtc);
    const kS = 1 - Math.exp(-3.5 * dtc), kL = 1 - Math.exp(-3 * dtc), rSit = 1 - Math.exp(-0.55 * dtc);   // sitting down takes 3-6 s
    upLvl = ant > upLvl ? ant : Math.max(ant, upLvl - 0.2 * dtc);      // how far the stands have risen: follows the closing riders up, falls 0.2/s after
    const wt = t - s.waveStart, zf = -36 + wt * 28;
    const waveOn = wt > -1 && wt < 72 / 28 + 2;
    const chantOn = Math.abs(favC) > 0.5 ? sstep(0.5, 0.8, Math.abs(favC)) * (1 - hush) : 0;
    const chantSign = favC > 0 ? 1 : -1;
    let colDirty = false, bodyDirty = false;

    for (let i = 0; i < n; i++) {
      const kn = keen[i], phi = ph[i], hgi = hg[i], spc = special[i], cls = clsA[i], kd = kind[i];
      const lady = cls === 2 && kd === 1;
      const a = thr[i] < (cls === 2 ? favK : favC) ? 1 : -1;

      // ---- allegiance change -> recolour livery props ----
      if (a !== al[i]) {
        al[i] = a;
        const o1 = a > 0 ? 0 : 6;
        const ks = shd[i];
        if (flagIdx[i] >= 0) { putCol(cFA, flagIdx[i], livery, o1, ks); putCol(cFB, flagIdx[i], livery, o1 + 3, ks); colDirty = true; }
        const cl = capLiv[i];
        if (cl) {
          const o = o1 + (cl === 2 ? 3 : 0);
          putCol(cHat[hw[i]], hatIdx[i], livery, o, ks * 0.8);
          colDirty = true;
        }
        if (bodyLiv[i]) { putCol(cBody[gown[i]], bodyIdx[i], livery, o1, ks * 0.62); bodyDirty = true; }
      }

      // ---- wave (commons and burghers join in) ----
      let wv = 0;
      if (waveOn && cls < 2) {
        const u = (zf - pz[i]) / 28;
        if (u > 0 && u < 1.5) wv = sstep(0, 0.22, u) * (1 - sstep(0.85, 1.4, u));
      }

      // ---- event layer: envelope x class/supporter reaction table ----
      let eCheer = 0, eDis = 0, eFist = 0, eJeer = 0, eAngry = 0, ePol = 0, eKer = 0, eBow = 0, eBless = 0,
        eCross = 0, eRec = 0, eStand = 0, eShake = 0, eWild = 0, eHead = 0, eSlump = 0, eLaugh = 0;
      if (evOn) {
        const tt = t - evT - dly[i] - evJit[i];
        if (tt > 0 && tt < evDur) {
          const env = sstep(0, cls === 0 ? 0.2 : 0.3, tt) * (1 - sstep(evDur - 1.3, evDur, tt)) * evInt[i];
          const tb = ((cls << 1) | ((evBy === 0 || a === evBy) ? 1 : 0)) * NCH;
          eCheer = tbl[tb] * env; eDis = tbl[tb + 1] * env; eFist = tbl[tb + 2] * env; eJeer = tbl[tb + 3] * env;
          eAngry = tbl[tb + 4] * env; ePol = tbl[tb + 5] * env;
          if (lady) eKer = tbl[tb + 6] * env;
          if (cls === 2 && !lady) eBow = tbl[tb + 7] * Math.sin(PI * clamp01(tt / 2.4));
          eBless = tbl[tb + 8] * env; eCross = tbl[tb + 9] * env; eRec = tbl[tb + 10] * env;
          eStand = tbl[tb + 11] * env; eShake = tbl[tb + 13] * env;
          eHead = tbl[tb + 14] * env; eSlump = tbl[tb + 15] * env; eLaugh = tbl[tb + 16] * env;
          const wl = tbl[tb + 12];
          if (wl > 0) { // commons go wild for the first second regardless of side
            const wf = 1 - sstep(1.0, 1.7, tt);
            eWild = wl * wf * env;
            if (eWild > eCheer) eCheer = eWild;
            eDis *= (1 - wf);
          }
          if (cls === 3 && kn < 0.5) ePol = 0; // only a couple of clergy clap
        }
      }

      // ---- the spotlight: the lady smiles (stands, waves her kerchief), laughs (claps behind her hand), or her kinsman rises and glares ----
      if (spot && (i === spot.i || i === spot.kin)) {
        if (spot.t0 === null) spot.t0 = t;
        const tt = t - spot.t0, env = sstep(0, 0.5, tt) * (1 - sstep(3.2, 4.2, tt));
        if (i === spot.i) {
          if (spot.kind === 'smile') { eStand = Math.max(eStand, env); eKer = Math.max(eKer, env); eCheer = Math.max(eCheer, 0.5 * env); }
          else if (spot.kind === 'laugh') { ePol = Math.max(ePol, 0.7 * env); eKer = Math.max(eKer, 0.6 * env); }
          else if (spot.kind === 'gasp') eRec = Math.max(eRec, env);      // a hand to the mouth (the reaction montage, main.js)
          else if (spot.kind === 'clap') { ePol = Math.max(ePol, env); eStand = Math.max(eStand, 0.7 * env); eCheer = Math.max(eCheer, 0.3 * env); }      // up on her feet, clapping
        } else if (spot.kind === 'glare') { eStand = Math.max(eStand, env); eAngry = Math.max(eAngry, env); eFist = Math.max(eFist, env); }
      }

      // ---- continuous layer targets ----
      const gate = scorer === 0 || scorer === a;
      let cheerT = gate ? sstep(0.42, 0.78, ex * RATE[cls] * (0.65 + 0.5 * kn)) * (1 - hush) : 0;
      let disT = (scorer !== 0 && scorer !== a) ? sstep(0.4, 0.75, ex * (0.6 + 0.5 * kn)) : 0;
      let clapT = sstep(0.28, 0.42, ex) * (1 - sstep(0.55, 0.75, ex)) * (kn > 0.25 ? 1 : 0.35) * (1 - hush);
      if (cls === 2) { if (cheerT * 0.8 > clapT) clapT = cheerT * 0.8; cheerT = 0; disT *= 0.4; }
      else if (cls === 3) { cheerT = 0; clapT = 0; disT = 0; }
      // commons stomp-clap chant for the favoured knight
      let chant = 0;
      if (cls === 0 && chantOn > 0 && a === chantSign) { chant = chantOn; if (chant * 0.8 > clapT) clapT = chant * 0.8; }
      // the stands sit by default (ground-level commons stand). As the riders close they rise in a ripple, those nearest the action and the keen first;
      // nobles and clergy rise later and only part-way. They stay up while upLvl falls away after the strike, then sit down slowly (see rSit below).
      let standT = 1;
      if (cls > 0) {
        const riseAt = RISE0[cls] + 0.3 * (1.15 - kn) * (phi / TWO_PI) + 0.12 * clamp01(Math.abs(pz[i] - focus) / 35);
        standT = sstep(riseAt, riseAt + 0.12, upLvl) * RISEMAX[cls];
        if (cls < 2) { const sx = sstep(0.45, 0.75, ex * (0.5 + kn)); if (sx > standT) standT = sx; }
        if (spc === 1 && cls === 1) standT = 1;
      }
      if (cheerT > standT) standT = cheerT;
      if (wv > standT) standT = wv;
      if (eStand > standT) standT = eStand;
      if (eCheer > standT) standT = eCheer;
      const leanT = ant * (0.35 + 0.65 * kn);

      const vv = (0.75 + 0.5 * kn) * RATE[cls];
      let k;
      k = kC * vv; if (k > 1) k = 1; sCheer[i] += (cheerT - sCheer[i]) * k;
      k = kD * vv; if (k > 1) k = 1; sDis[i] += (disT - sDis[i]) * k;
      k = kK * vv; if (k > 1) k = 1; sClap[i] += (clapT - sClap[i]) * k;
      k = standT < sStand[i] ? rSit * (0.7 + 0.6 * kn) : kS * vv; if (k > 1) k = 1; sStand[i] += (standT - sStand[i]) * k;
      k = kL * vv; if (k > 1) k = 1; sLean[i] += (leanT - sLean[i]) * k;
      const cheer = sCheer[i] > eCheer ? sCheer[i] : eCheer;
      const dis = sDis[i] > eDis ? sDis[i] : eDis;
      const clap = sClap[i] > ePol ? sClap[i] : ePol;
      const standW = sStand[i] > wv ? sStand[i] : wv;
      const lean = sLean[i];
      const wCheer = cheer > wv ? cheer : wv;
      const sway = SWAY[cls];

      // ---- idle chatter / whispers ----
      const chat = sstep(0.1, 0.5, Math.sin(t * 0.43 + phi * 3.1) * Math.sin(t * 0.17 + phi * 7.3) + 0.25) *
        calm * (1 - wCheer) * (1 - dis) * (cls === 3 ? 0.3 : 1);
      let whisp = 0;
      if (cls === 2) whisp = sstep(0.55, 0.85, Math.sin(t * 0.31 + phi * 2.3) * Math.sin(t * 0.13 + phi * 5) + 0.45) * calm * (1 - eStand) * (1 - eRec);
      const par = (i & 1) ? 1 : -1;
      const rz = live ? sstep(0.9, 0.97, Math.sin(t * 0.37 + phi * 7.1)) * (kn > 0.25 ? 1 : 0.5) * calm * (1 - wCheer) * (1 - dis) * (cls === 2 ? 0.5 : cls === 3 ? 0 : 1) : 0;

      // ---- body transform ----
      const Hfull = 1.4 * hgi;
      const bodyH = Hfull * (0.62 + 0.38 * standW) * (1 - 0.07 * dis - 0.05 * eSlump);
      let yOff = 0;
      const big = eCheer > sCheer[i] ? evMag : 1;
      const jc = (sCheer[i] > eCheer ? sCheer[i] : eCheer) * JUMP[cls] * big;
      if (live && standW > 0.5) yOff = 0.008 * standW * Math.sin(t * 1.3 + phi);      // breathing, shifting weight
      if (jc > 0.02) yOff += jc * standW * Math.abs(Math.sin(t * (6.5 + 2.5 * kn) + phi)) * 0.2 * (0.55 + 0.45 * kn) * hgi;
      if (clap > 0.02 && cls < 2) yOff += clap * 0.012 * Math.sin(t * 15 + phi);
      if (eLaugh > 0.02) yOff += eLaugh * 0.02 * Math.abs(Math.sin(t * 13 + phi)) * (cls < 2 ? 1 : 0.4);
      if (chant > 0.02) yOff += chant * 0.045 * Math.abs(Math.sin(t * 3.5));

      const upr = cls === 2 ? 0.5 : 1;
      let pitch = stP[i] * standW + (cls > 0 ? 0.05 * (1 - standW) : 0) + 0.2 * lean * calm * upr + 0.36 * lean * hush * upr - 0.12 * cheer + 0.3 * dis +
        0.02 * chat * Math.sin(t * 5 + phi) + 0.4 * eAngry + 0.12 * eJeer + 0.5 * eBow - 0.25 * eRec - 0.2 * eCross +
        0.12 * eBless * 0 + 0.26 * eSlump - 0.12 * eHead + 0.07 * eLaugh * Math.sin(t * 15 + phi);
      let roll = stR[i] * (1 - 0.6 * cheer) + Math.sin(t * 0.9 + phi * 1.3) * 0.035 * calm * (1 - cheer) * sway + Math.sin(t * (3 + kn) + phi) * 0.08 * cheer +
        Math.sin(t * 14 + phi) * 0.11 * eJeer + Math.sin(t * 8 + phi) * 0.08 * eAngry + Math.sin(t * 3.2 + phi) * 0.09 * eShake +
        Math.sin(t * 5 + phi * 0.2) * 0.2 * eWild + whisp * 0.1 * par;
      if (cls === 0) roll += Math.sin(t * 1.9 + phi) * 0.035 * (1 - cheer); // restless shuffling
      const shiftX = Math.sin(t * 5 + phi * 0.2) * 0.14 * eWild + (cls === 0 ? Math.sin(t * 1.3 + phi * 2) * 0.03 : 0);

      const zAim = focus + jz[i];
      const base = hasYaw[i] ? yb[i] : -side[i] * HALF_PI;
      let dth = Math.atan2(-px[i], zAim - pz[i]) - base;
      if (dth > PI) dth -= TWO_PI; else if (dth < -PI) dth += TWO_PI;
      let yaw = base + stY[i] * (1 - 0.5 * lean) + dth * (0.4 + 0.25 * lean) + eRec * (cls === 2 ? 1.4 : 0.9) * par + whisp * 0.7 * par + (cls < 3 ? eShake * Math.sin(t * 5.5 + phi) * 0.28 : 0);
      if (cls === 3) yaw = base + dth * 0.2 + eShake * Math.sin(t * 3.2 + phi) * 0.25;

      const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const mx0 = cr, mx1 = sr * cp, mx2 = sr * sp;
      const my0 = -sr, my1 = cr * cp, my2 = cr * sp;
      const mz1 = -sp, mz2 = cp;
      r0 = mx0 * cy + mx2 * sy; r1 = mx1; r2 = -mx0 * sy + mx2 * cy;
      r3 = my0 * cy + my2 * sy; r4 = my1; r5 = -my0 * sy + my2 * cy;
      r6 = mz2 * sy; r7 = mz1; r8 = mz2 * cy;

      let bx = px[i], by = py[i] + yOff, bz = pz[i];
      if (shiftX !== 0) { xf(shiftX, 0, 0); bx += ox; bz += oz; }
      const sw = hgi * bw[i];
      const o = i * 16;
      // the body keeps its full height in the matrix; seated, the material folds it at the hip so that the shoulders come down to bodyH
      const Hy = Hfull * (1 - 0.07 * dis - 0.05 * eSlump), bt = gown[i], bI = bodyIdx[i];
      wm(mBd[bt], bI * 16, r0 * sw, r1 * sw, r2 * sw, r3 * Hy, r4 * Hy, r5 * Hy, r6 * sw, r7 * sw, r8 * sw, bx, by, bz);
      pBody[bt][bI * 4 + 3] = 0.38 * (1 - standW) / HIP;

      // ---- head (turned with the body) ----
      const hk = HEAD_K * hgi * hs[i] * (kd === 2 ? 1.22 : 1), hr = 0.105 * hk;
      xf(0, bodyH + HEAD_UP * hk + 0.012 * chat * Math.sin(t * 11 + phi), 0.035 * lean);
      const hx = bx + ox, hY = by + oy, hZ = bz + oz;
      wm(mH, o, r0 * hk, r1 * hk, r2 * hk, r3 * hk, r4 * hk, r5 * hk, r6 * hk, r7 * hk, r8 * hk, hx, hY, hZ);

      // ---- arms ----
      const sh = bodyH - 0.03 * hgi, aw = hgi * (1 + 0.22 * fat[i]);
      const armL = 0.66 * hgi;
      const isFlag = flagIdx[i] >= 0;
      let handX = 0, handY = 0, handZ = 0;
      const cf = chant > 0.3 ? 7.0 : 12 + kn * 3;
      const phC = chant > 0.3 ? phi * 0.1 : phi;
      const cc = 0.5 + 0.5 * Math.sin(t * cf + phC);
      const cAmp = cls === 2 ? 0.4 : 1;
      for (let arm = 0; arm < 2; arm++) {
        const sx = arm === 0 ? -1 : 1;
        rem_ = 1; ax_ = 0; ay_ = 0; az_ = 0;
        if (wCheer > 0.001) {
          const pump = Math.sin(t * (7 + 2 * kn) + phi + arm * 2.1);
          addDir(wCheer, sx * (0.3 + 0.25 * pump * cheer * big + 0.1 * Math.sin(t * 4 + phi) * wv), 0.92, 0.12 + 0.12 * pump * cheer * big);
        }
        if (dis > 0.001) {
          if (dv[i] === 0) addDir(dis, sx * 0.22, 0.6, 0.55);
          else addDir(dis, sx * 0.65 + sx * 0.04 * Math.sin(t * 9 + phi), -0.75, -0.1);
        }
        if (eFist > 0.001) { const pm = 0.5 + 0.5 * Math.sin(t * 9 + phi + arm * PI); addDir(eFist, sx * 0.25, 0.4 + 0.5 * pm, 0.7); }
        if (eJeer > 0.001) addDir(eJeer, sx * 0.25, 0.1 + 0.3 * Math.sin(t * 10 + phi + arm * 2), 0.95);
        if (eAngry > 0.001) addDir(eAngry, sx * 0.2, 0.15 + 0.35 * Math.sin(t * 8 + arm * PI + phi), 0.9);
        if (eKer > 0.001) {
          if (arm === 1) addDir(eKer, 0.2 + 0.3 * Math.sin(t * 6 + phi), 0.85, 0.2);
          else addDir(eKer * 0.3, sx * 0.3, 0.1, 0.5);
        }
        if (eBless > 0.001) { if (arm === 1) addDir(eBless, 0.35, 0.6, 0.7); else addDir(eBless, -0.15, -0.5, 0.85); }
        if (eCross > 0.001) addDir(eCross, -sx * 0.15, -0.4 + 0.5 * eCross, 0.85);
        if (eRec > 0.001) addDir(eRec, sx * 0.1, 0.55, 0.8);
        if (eHead > 0.001) addDir(evOne[i] && arm !== evArm[i] ? eHead * 0.2 : eHead, -sx * 0.45, 0.8, 0.3);      // hands to the head (one hand only for some)
        if (eSlump > 0.001) addDir(eSlump * 0.7, sx * 0.12, -1, 0.15);      // arms hang
        if (eLaugh > 0.001 && arm === evArm[i]) { if (cls === 2) addDir(eLaugh * 0.9, sx * 0.05, 0.55, 0.85); else addDir(eLaugh * 0.8, sx * 0.25, 0.1 + 0.15 * Math.sin(t * 9 + phi), 0.95); }      // behind a hand / pointing
        if (clap > 0.001) addDir(clap, sx * (0.04 + 0.22 * cc * cAmp), cls === 2 ? -0.3 : -0.4, 0.9);
        if (live && arm === (i & 1) && rz > 0.01) addDir(rz, sx * 0.3 + 0.25 * Math.sin(t * 7 + phi), 0.85, 0.2);      // a hand up: to a friend, to the knight
        // idle (sway, craning, occasional gesture; flag holders hold the pennant up)
        let ix = sx * 0.14 + Math.sin(t * 0.8 + phi + arm * 1.7) * 0.05 * calm * sway;
        let iy = -1, iz = 0.04 + lean * 0.7;
        if (arm === (phi > 3.14 ? 0 : 1)) {
          const g = chat * (0.7 + 0.3 * Math.sin(t * 6 + phi));
          ix += (sx * 0.35 - ix) * g; iy += (-0.15 - iy) * g; iz += (0.85 - iz) * g;
        }
        if (isFlag && arm === 1) { ix = 0.12; iy = 0.5 + 0.25 * Math.sin(t * 1.3 + phi); iz = 0.6; }
        addDir(rem_, ix, iy, iz);
        let vx = ax_, vy = ay_, vz = az_;
        if (spc === 3 && arm === 1) { // air-puncher
          const wP = sstep(0.2, 0.6, ex) * standW * (1 - wCheer);
          const pm = Math.sin(t * 5 + phi); const up = pm > 0 ? pm : 0;
          vx += (0.15 - vx) * wP; vy += (0.35 + 0.65 * up - vy) * wP; vz += (0.5 - vz) * wP;
        }
        const vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        vx /= vl; vy /= vl; vz /= vl;

        xf(sx * (SHOULDER[gown[i]] + 0.03 * Math.max(0, fat[i])) * sw, sh, 0);
        const shx = bx + ox, shy = by + oy, shz = bz + oz;
        xf(vx, vy, vz);
        const wdx = ox, wdy = oy, wdz = oz;
        const y0 = -wdx, y1 = -wdy, y2 = -wdz; // arm geometry points along local -Y
        let x0, x1, x2, z0, z1, z2;
        const fd = r6 * y0 + r7 * y1 + r8 * y2;      // the arm's frame has its z toward the figure's front, so the elbow (people.js shader) always bends the forearm forward; an arm pointing straight along the front or back keeps the old frame
        if (fd > -0.9 && fd < 0.9) {
          z0 = r6 - y0 * fd; z1 = r7 - y1 * fd; z2 = r8 - y2 * fd; const zl = Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2) || 1; z0 /= zl; z1 /= zl; z2 /= zl;
          x0 = y1 * z2 - y2 * z1; x1 = y2 * z0 - y0 * z2; x2 = y0 * z1 - y1 * z0;
        } else {
          if (y2 > 0.9 || y2 < -0.9) { x0 = 0; x1 = y2; x2 = -y1; } else { x0 = y1; x1 = -y0; x2 = 0; }
          const xl = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2) || 1;
          x0 /= xl; x1 /= xl; x2 /= xl;
          z0 = x1 * y2 - x2 * y1; z1 = x2 * y0 - x0 * y2; z2 = x0 * y1 - x1 * y0;
        }
        // the elbow: a little slack when the arm hangs, more as it comes forward (clapping, hands to the chest) or goes up (cheering); the cheer pumps it
        bendArr[arm][i] = Math.min(0.62, 0.14 + 0.62 * Math.max(0, vz) + 0.3 * Math.max(0, vy) + (wCheer > 0.001 ? 0.12 * wCheer * Math.sin(t * (7 + 2 * kn) + phi + arm * 2.1) : 0));
        wm(arm === 0 ? mL : mR, o, x0 * aw, x1 * aw, x2 * aw, y0 * armL, y1 * armL, y2 * armL, z0 * aw, z1 * aw, z2 * aw, shx, shy, shz);
        handX = shx + wdx * armL * 0.95; handY = shy + wdy * armL * 0.95; handZ = shz + wdz * armL * 0.95;
      }

      // ---- headwear: on the head, with the head's own matrix (a thrown hat is hidden while it flies; a hat-waver's goes to his hand as he cheers) ----
      const type = hw[i];
      if (type) {
        const hi = hatIdx[i] * 16, M = mHat[type];
        if (capIdx[i] >= 0 && t >= capGone[i] && t < capBack[i]) wm(M, hi, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        else {
          let cx = hx, cyy = hY, cz = hZ;
          if (spc === 2) { cx += (handX - cx) * wCheer; cyy += (handY + 0.14 - 0.05 * hk - cyy) * wCheer; cz += (handZ - cz) * wCheer; }
          wm(M, hi, r0 * hk, r1 * hk, r2 * hk, r3 * hk, r4 * hk, r5 * hk, r6 * hk, r7 * hk, r8 * hk, cx, cyy, cz);
        }
      }

      // ---- pennant flag (right hand) ----
      const fi = flagIdx[i];
      if (fi >= 0) {
        const f = 2.5 + 7 * wCheer;
        const tilt = 0.12 + (0.08 + 0.25 * wCheer) * Math.sin(t * f + phi) + 1.0 * dis;
        const fy = yaw + Math.sin(t * f * 1.3 + phi * 2) * (0.35 + 0.5 * wCheer);
        const ct = Math.cos(tilt), st = Math.sin(tilt), c2 = Math.cos(fy), s2 = Math.sin(fy);
        const fs = 0.9 + 0.1 * hgi;
        wm(mFA, fi * 16, ct * c2 * fs, st * fs, -ct * s2 * fs, -st * c2 * fs, ct * fs, st * s2 * fs, s2 * fs, 0, c2 * fs, handX, handY - 0.14, handZ);
        wm(mFB, fi * 16, ct * c2 * fs, st * fs, -ct * s2 * fs, -st * c2 * fs, ct * fs, st * s2 * fs, s2 * fs, 0, c2 * fs, handX, handY - 0.14, handZ);
      }

      // ---- ladies' kerchief ----
      const ki = kerchIdx[i];
      if (ki >= 0) {
        if (eKer > 0.03) {
          const fa = t * 11 + phi, ks = eKer;
          wm(mK, ki * 16, Math.cos(fa) * ks, 0, -Math.sin(fa) * ks, 0, ks, 0, Math.sin(fa) * ks, 0, Math.cos(fa) * ks, handX, handY + 0.06, handZ);
        } else wm(mK, ki * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    }

    // ---- tossed items (ballistic hats, flowers lying where they land) ----
    let anyPool = false;
    for (let j = 0; j < POOL; j++) {
      const st = pState[j];
      if (st === 0) continue;
      anyPool = true;
      const po = j * 16;
      let tt = t - pT0[j];
      if (tt < 0) { wm(mP, po, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
      if (st === 1) {
        if (t >= pT1[j]) {
          if (j < HATS) { pState[j] = 0; wm(mP, po, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
          pState[j] = 2;
        } else {
          const sz = pSize[j], a2 = pSpin[j] * tt, c = Math.cos(a2) * sz, s2 = Math.sin(a2) * sz;
          wm(mP, po, sz, 0, 0, 0, c, s2, 0, -s2, c, pX[j] + pVX[j] * tt, pY[j] + pVY[j] * tt - 4.9 * tt * tt, pZ[j] + pVZ[j] * tt);
          continue;
        }
      }
      const T = pT1[j] - pT0[j], age = t - pT1[j];
      if (age > 4.6) { pState[j] = 0; wm(mP, po, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
      const sz = pSize[j] * (age > 4 ? 1 - (age - 4) / 0.6 : 1);
      wm(mP, po, sz, 0, 0, 0, sz, 0, 0, 0, sz, pX[j] + pVX[j] * T, pRest[j], pZ[j] + pVZ[j] * T);
    }

    for (let k = 0; k < 3; k++) { mBodies[k].instanceMatrix.needsUpdate = true; bodyGeos[k].userData.parA.needsUpdate = true; }
    mHead.instanceMatrix.needsUpdate = true;
    mArmL.instanceMatrix.needsUpdate = true; mArmR.instanceMatrix.needsUpdate = true; armGeoL.userData.bendA.needsUpdate = true; armGeoR.userData.bendA.needsUpdate = true;
    for (let k = 1; k < HATS_LIST.length; k++) mHats[k].instanceMatrix.needsUpdate = true;
    mKerch.instanceMatrix.needsUpdate = true;
    mFlagA.instanceMatrix.needsUpdate = true; mFlagB.instanceMatrix.needsUpdate = true;
    if (anyPool || poolWas) mToss.instanceMatrix.needsUpdate = true;
    poolWas = anyPool;
    if (poolColDirty) { mToss.instanceColor.needsUpdate = true; poolColDirty = false; }
    if (bodyDirty) for (const m of mBodies) m.instanceColor.needsUpdate = true;
    if (colDirty) {
      mFlagA.instanceColor.needsUpdate = true; mFlagB.instanceColor.needsUpdate = true;
      for (let k = 1; k < HATS_LIST.length; k++) mHats[k].instanceColor.needsUpdate = true;
    }
  }

  const all = [...mBodies, mHead, mArmL, mArmR, ...mHats.filter(Boolean), mFlagA, mFlagB, mKerch, mToss];
  for (const m of all) m.instanceColor.needsUpdate = true;

  // initial pose so the first rendered frame is valid
  update(0, 0, { excitement: 0.12, anticipation: 0, favour: 0, scorer: 0, waveStart: -1e9, focusZ: 0 });

  /** Take the whole crowd out of the scene (world.thinCrowd builds a thinner one in its place). The shared part geometries stay for the next build. */
  const dispose = () => { for (const m of all) { group.remove(m); m.dispose(); } };
  return { update, setColors, count: n, ladies, spotlight, voiceSpot, dispose };
}
