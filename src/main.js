import * as THREE from 'three';
import { buildWorld, LANE_X, START_Z, LIST_HALF } from './world.js';
import { Jouster, LANCE_REACH, preloadHorse } from './jouster.js';
import { FX } from './fx.js';
import { clamp, lerp, damp, smoothstep, wobble, drawCrest, TAU } from './util.js';
import { HORSES, ARMOURS, KNIGHTS, VENUES, TRAINING_GROUND, GAIT_SPEED, COURSES_PER_MATCH, CAPARISONS, POINTS, DEFAULT_PROFILE, ovr, bondLevel, bondedHorse, BOND_NAMES, LANCES, DIFFICULTY, ARTS, LESSONS, TINCTURES, PHYS, SKILLS, RANKS, rankOf, HELMS, harness, MODES, modeKit, SLOW_PACE, LANCE_UP, RETINUE, TRAITS, menFx, fixRetinue, REST, restShare, QUINTAIN, DISCOVERY_SECONDS, ACH_RENOWN } from './data.js';
import { initMenus, purseText, rankBar } from './menus.js';
import { reckon, settle } from './economy.js';
import { createPreviews } from './previews.js';
import { createStable } from './stable.js';
import { createPost } from './post.js';
import { touchMode, initTouch, goFullscreen } from './touch.js';
import { Quintain } from './quintain.js';
import { drawHitMap, drawDoll } from './verdict.js';
import { SCANS, preloadScans, loadSkyList, loadSky } from './scans.js';
import { GFX, frameTime } from './gfx.js';
import { stats as loadStats, mb } from './loadmeter.js';
import { LanceArm, impact, breakAt } from './physics.js';
import { createVoice } from './voice.js';
import { createField } from './retinue_field.js';
import { createLife } from './stands_life.js';
import { createSpeech } from './speech3d.js';
import { chooseLine, ROLE_TITLE } from './retinue_lines.js';
import { createFlagmen } from './flagmen.js';
import { createJudges } from './judges.js';
import { createCeremony, INTRO_END, SKIP_HOLD, MOVE } from './ceremony.js';
import { ANNOUNCER, HOST_LINES, INTRO, hostOf, hailName, bioOf, boastFor, fill, CIRCUIT } from './drama_lines.js';
import { ACH_BY_ID, ensureFeats, checkFeats, courseFeats, matchFeats, circuitFeat, courtesyFeat, ladyFeat, rankLine } from './achievements.js';
import { Hit, sweepCapCap, sweepCapObb, capCapGap, capObbGap } from './collide.js';
import { createNet, makeCode, cleanCode, validCode, failText, preloadNet } from './net.js';
import * as ranks from './ranks.js';
import { cleanName, Remote, SEND_HZ, packProfile, cleanProfile, onlineOd, cleanRoom, onlineModeIds, packRider, cleanState, applyRider, mirrorVec, MIRROR_RESULT, cleanRes, cleanNear, clampNum } from './online.js';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[(Math.random() * a.length) | 0];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth'];

// ------------------------------------------------------------------ audio (off until switched on) + herald voice
const noop = new Proxy({}, { get: () => () => {} });
function initAudio() { if (!S.muted) audio.init(); }
function setSound(on) {
  S.muted = !on;
  try { localStorage.setItem('tilt.sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  if (on) { audio.init(); audio.setMuted(false); } else { audio.setMuted(true); if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  showSoundBtn(on);
}
const SPK = '<path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPK}<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPK}<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
function showSoundBtn(on) {
  const b = $('soundBtn'); if (!b) return;
  b.innerHTML = on ? ICON_ON : ICON_OFF; b.classList.toggle('on', on);
  const t = on ? 'Sound on (M)' : 'Sound off (M)'; b.setAttribute('aria-label', t); b.title = t;
}
// ---- music: the mood follows the game state; one track runs on across courses (src/audio.js MusicBus)
const musicVol = () => { try { const v = localStorage.getItem('tilt.music'); return v === null ? 60 : clamp(Math.round(+v) || 0, 0, 100); } catch (e) { return 60; } };
function setMusic(v) {
  v = clamp(Math.round(+v) || 0, 0, 100);
  try { localStorage.setItem('tilt.music', String(v)); } catch (e) { /* ignore */ }
  const m = audio.music; if (!m || !m.setVolume) return;
  if (v > 0) initAudio();
  m.setVolume(v / 100);
}
let musicSeen = null, musicMood = null, musicDuck = false;
function musicSync() {
  const m = audio.music; if (!m || !m.play) return;     // audio module still loading
  if (musicSeen !== m) { musicSeen = m; musicMood = null; musicDuck = false; m.setVolume(musicVol() / 100); }
  let mood = null, duck = false;
  if (S.mode === 'menu') mood = 'menu';
  else if (S.mode === 'charge') duck = true;           // keep whatever is playing, just lower it
  else if (S.mode === 'after' && C && C.carded && M && M.result) mood = M.result.startsWith('win') || M.result === 'practice' ? 'victory' : 'defeat';
  else if (S.mode === 'ready' || S.mode === 'after' || S.mode === 'intro') mood = 'between';
  if (duck !== musicDuck) { musicDuck = duck; m.duck(duck); }
  if (mood && mood !== musicMood) { musicMood = mood; m.play(mood); }
}
let audio = noop, HERALD = null, ttsVoice = null;
let audioStarted = false;
/** The sound code and its samples are fetched once the menu is up (and, below the high tier, once the trees and props are in), so they never compete with what the menu needs. */
function startAudio() {
  if (audioStarted) return; audioStarted = true;
  import('./audio.js').then(m => { audio = new m.GameAudio(); G.audio = audio; if (venueIdx >= 0) audio.setVenue(VENUES[venueIdx].id); if (!S.muted) audio.init();
    const c = audio.ctx;      // loaded after the player's first tap? the browser may have left the new audio context asleep: wake it on the next one
    if (c && c.state === 'suspended' && !S.muted) { const wake = () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); try { c.resume(); if (audio.music && audio.music.want) audio.music.play(audio.music.want); } catch (e) { /* ignore */ } }; window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake); }
  }).catch(e => console.warn('audio unavailable', e));
}
import('./herald_lines.js').then(m => { HERALD = m.HERALD; }).catch(() => {});
function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices(); if (!vs.length) return null;
    for (const w of ['Google UK English Male', 'Microsoft Ryan', 'Microsoft George', 'Daniel']) { const v = vs.find(x => x.name.includes(w)); if (v) return v; }
    return vs.find(x => /en-GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang)) || null;
  } catch (e) { return null; }
}
if (window.speechSynthesis) { ttsVoice = pickVoice(); window.speechSynthesis.onvoiceschanged = () => { ttsVoice = pickVoice(); }; }
// "Voices" setting (main menu): the robot voice for every speaking character. Saved in localStorage 'tilt.voices' ('off' silences it; default on).
const voicesOn = () => { try { return localStorage.getItem('tilt.voices') !== 'off'; } catch (e) { return true; } };
function setVoices(on) {
  try { localStorage.setItem('tilt.voices', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
}
// robot voice per character: [pitch, rate]. Hugh deep and measured, the king slow, the squire young and quick, the vendors brisk. (Some browser voices ignore pitch.)
const VOICES = { hugh: [0.6, 0.9], king: [0.45, 0.78], squire: [1.3, 1.22], master: [0.72, 0.94], groom: [1.05, 1.08], armourer: [0.65, 0.95], farrier: [0.85, 1.0], pursuivant: [1.12, 1.08], herald: [0.98, 1.06],
  pie: [1.15, 1.25], meat: [0.75, 1.2], wine: [1.4, 1.3], marshal: [0.82, 1.04] };
/** A character speaks aloud: only with sound on and Voices on. Called by the voice director for lines that were really shown (one at a time). key: a VOICES entry. */
function speak(text, tier = 2, key = 'marshal', at = null) {
  if (S.muted || G.manual || !window.speechSynthesis || !voicesOn()) return;
  try {
    const ss = window.speechSynthesis; if (ss.speaking && (tier === 1 || ss.pending)) ss.cancel();      // a result never waits behind older speech
    const vp = VOICES[key] || VOICES.marshal;
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, '')); if (ttsVoice) u.voice = ttsVoice; u.rate = vp[1]; u.pitch = vp[0]; u.volume = speechVolume(at); ss.speak(u);
  } catch (e) { /* speech is optional */ }
}

/** Browser speech can't be panned, so it is only made quieter with the speaker's distance from the camera (full within ~6 m, a fifth at ~40 m).
 *  Real directional voices need recorded clips through the game's 3D audio (see ROADMAP). */
const _spkPos = new THREE.Vector3();
function speechVolume(at) {
  try { const o = typeof at === 'function' ? at() : at; if (!o) return 1; if (o.isObject3D) o.getWorldPosition(_spkPos); else if (o.isVector3) _spkPos.copy(o); else return 1;
    return clamp(1.15 - camera.position.distanceTo(_spkPos) / 34, 0.2, 1); } catch (e) { return 1; }
}

// ------------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: GFX.antialias, powerPreference: GFX.tier === 'low' ? 'default' : 'high-performance' });
renderer.setPixelRatio(GFX.pixelRatio());      // by graphics tier (src/gfx.js); high is what it always was: phones 1.25 at most, desktops 1.75
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 4000);
const fx = new FX(scene);
const post = createPost(renderer, scene, camera, { lite: GFX.post !== 'full', plain: GFX.post === 'plain' });
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
  fx.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ state
const S = { mode: 'menu', time: 0, timeScale: 1, excite: 0.12, slowT: 0, shake: 0, fp: false, muted: (() => { try { return localStorage.getItem('tilt.sound') === 'off'; } catch (e) { return false; } })(), introT: 0, skipHold: 0, skipWanted: { me: false, them: false }, online: false, menuAng: 0.6, paused: false, menuView: 'main' };
let profile = loadProfile();
ranks.setNameSource(() => profile.name);
/** Joust a friend (see src/net.js, src/online.js and the 'online' block below): the link, who is host, the friend's interpolated rider. */
const NET = { mid: '', oppPlay: null, net: null, host: false, token: 0, od: null, remote: new Remote(), rem: null, rLb: 0, rGuardAge: 9, sendT: 0, lastRx: 0, kaT: 0, rdyOut: -1, rdyIn: -1, ka: 0 };
let world = null, worldKey = -1, venueIdx = -1, player = null, opp = null, M = null, C = null, R = null;
const G = window.G = { S, auto: false, get M() { return M; }, get C() { return C; }, get R() { return R; }, get player() { return player; }, get opp() { return opp; }, get world() { return world; }, camera, scene, renderer };
S.fp = !!profile.firstPerson;
/** Which beat of the match we are in, for the voice director: intro | ready | charge | strike (a lance has landed) | replay | after (verdict, wheeling about) | end (the result card). */
function voicePhase() {
  if (!M) return 'menu';
  if (S.mode === 'intro') return 'intro';
  if (S.mode === 'replay') return 'replay';
  if (S.mode === 'ready') return 'ready';
  if (S.mode === 'charge') return C && C.hitT !== null ? 'strike' : 'charge';
  if (S.mode === 'after') return C && C.carded ? 'end' : 'after';
  return 'menu';
}
/** The one voice channel: every ticker line, herald line and shout is scheduled here (src/voice.js). */
const voice = createVoice({
  phase: voicePhase,
  show(text, who, speaker) { const el = $('ticker'); el.innerHTML = `<b>${who}</b>${text}`; el.classList.add('on'); speech.show(text, who, speaker); },      // the ticker stays; the label goes over the speaker's head
  hide() { $('ticker').classList.remove('on'); speech.hide(); },
  speak: (text, tier, key) => speak(text, tier, key),
  dev: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname),
});
G.voice = voice; G.voiceLog = voice.log;
const speech = createSpeech(camera);          // the parchment label above a speaker's head (src/speech3d.js)
// who is talking, for the label: getters, because the figures are rebuilt each match
const _spk = new THREE.Vector3();
const speakerOf = { hugh: () => ceremony.hughHead(), king: () => (world && world.royals && world.royals[0] ? world.royals[0].head : null), man: (id) => () => field.head(id),
  oppHerald: () => (opp ? _spk.set(opp.root.position.x, 3.3, opp.root.position.z) : null) };      // his herald has no figure: the label floats above his knight
// your men on the field (src/retinue_field.js) and what they say between courses (src/retinue_lines.js)
const field = createField(scene, (id) => !!lateMen[id]);
const flagmen = createFlagmen(scene);      // the marshal's men: flags up, sweep down at the signal (src/flagmen.js)
const judges = createJudges(scene);        // the judges' table: three judges and a scorer, hand flags after each course (src/judges.js); none on the training ground
const ceremony = createCeremony(scene);      // trumpeters, the announcer on his dais, the intro camera and cards (src/ceremony.js)
/** A seller cries his wares (called by src/stands_life.js): a tier-4 ambient line with a label over his head and his own robot voice. Only when the voice is idle: true when taken. */
function vendorCall(text, who, head, type) {
  if (!M || M.practice || voice.cur || voice.wait) return false;
  return say(text, who, 4, { free: true, phases: ['ready', 'after'], ttl: 3, speak: true, voice: type, speaker: head });
}
const life = createLife(scene, { call: vendorCall });      // the band by the royal box and the sellers along the stands (src/stands_life.js)
let skipKey = false;                          // Space / Enter held (the intro is skipped by HOLDING it, not by a tap)
const dirP = () => (player ? player.dir : 1);          // which way you are riding this course
const gapNow = () => (opp.z - player.z) * dirP();        // metres still between you (negative once passed)

function loadProfile() {
  const d = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  try {
    const p = JSON.parse(localStorage.getItem('tilt.profile'));
    if (p && p.arms) {
      const m = Object.assign(d, p);
      if (!m.owned.horses.includes(m.horse)) m.owned.horses.push(m.horse);
      if (!m.owned.armours.includes(m.armour)) m.owned.armours.push(m.armour);
      if (!(m.courses >= 3)) m.courses = 5;
      if (!m.arts) m.arts = {};
      if (!m.skills) m.skills = {};
      fixRetinue(m); ensureFeats(m);
      // circuits saved before the roster changed: the invented Sir Aldric is now the real Sir Thomas Clifford, and new knights get a row
      if (m.table && m.table.rows) { const ren = { aldric: 'clifford' }; for (const r of m.table.rows) if (ren[r.id]) r.id = ren[r.id]; for (const x of m.table.results || []) if (ren[x.opp]) x.opp = ren[x.opp];
        m.table.rows = m.table.rows.filter(r => r.id === 'you' || KNIGHTS.some(k => k.id === r.id)); for (const k of KNIGHTS) if (!m.table.rows.some(r => r.id === k.id)) m.table.rows.push({ id: k.id, p: 0, w: 0, d: 0, l: 0, sp: 0 }); }
      if (!m.owned.caparisons) m.owned.caparisons = ['livery', 'none'];
      if (!CAPARISONS[m.caparison]) m.caparison = 'livery';
      if (!m.owned.caparisons.includes(m.caparison)) m.owned.caparisons.push(m.caparison);
      // saves from before helms were sold apart: you keep the helm each of your harnesses came with
      if (!m.owned.helms) m.owned.helms = [...new Set(['greathelm', ...m.owned.armours.map(a => ARMOURS[a].helm)])];
      if (!HELMS[m.helm]) m.helm = ARMOURS[m.armour].helm;
      if (!m.owned.helms.includes(m.helm)) m.owned.helms.push(m.helm);
      m.renown = m.renown || 0;
      if (m.named === undefined) m.named = true;      // a save from before the welcome screen: he has chosen his name already
      return m;
    }
  } catch (e) { /* ignore */ }
  fixRetinue(d); ensureFeats(d);
  return d;
}
/** A skill's numbers if you have learned it, else null. */
const sk = (id) => (!S.online && profile.skills && profile.skills[id] ? SKILLS[id] : null);      // (online: no skills, no retinue; both riders start equal)
/** One of your retinue's numbers if he is in your service, else null. */
const man = (id) => (!S.online && profile.retinue && profile.retinue[id] && !lateMen[id] ? menFx(id, profile.retinue[id]) : null);
/** Who is late this course (a Drinker now and then): his work, and what his temper adds, is skipped. */
let lateMen = {};
let lateRolled = false;      // a Drinker's lateness is rolled when you arrive at the end of the lists (his mates are there first), once per course
function rollLate() {
  lateMen = {}; lateRolled = true;
  if (!M || M.practice || M.online) return;
  for (const id of Object.keys(profile.retinue || {})) { const r = profile.retinue[id], t = r && TRAITS[r.trait]; if (t && t.late && Math.random() < t.late) { lateMen[id] = true; say(`Your ${(RETINUE[id] && RETINUE[id].name || id).toLowerCase()}, ${r.name}, hasn't turned up: he's been at the wine. No ${(RETINUE[id] && RETINUE[id].name || id).toLowerCase()} this course.`, r.name.toUpperCase(), 2); } }
}
/** The sum of one number from every man's temper (calm, rest, welcome) who is here this course. */
const crew = (k) => S.online ? 0 : Object.keys(profile.retinue || {}).reduce((a, id) => { const r = profile.retinue[id]; return a + (r && !lateMen[id] && TRAITS[r.trait] ? TRAITS[r.trait][k] || 0 : 0); }, 0);
function saveProfile() { try { localStorage.setItem('tilt.profile', JSON.stringify(profile)); } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ world / riders
let worldScans = false;      // did the current world get the scanned trees and props (they may still be downloading when the menu first shows)
function setVenue(i, training = false) {      // training: the practice meadow (TRAINING_GROUND) instead of venue i
  const key = training ? -2 : i;
  if (key === worldKey && world) return;
  if (world) world.dispose();
  worldScans = SCANS.ready; worldKey = key; venueIdx = i; world = buildWorld(scene, renderer, training ? TRAINING_GROUND : VENUES[i]);
  audio.setVenue(training ? 'training' : VENUES[i].id);
  world.setLivery([profile.arms.c1, profile.arms.c2], ['#a81e1e', '#ece8dc']);
  world.captureEnv([player && player.root, opp && opp.root, fx.spl, fx.dustP.points, fx.sparkP.points].filter(Boolean));
}
const _ear = new THREE.Vector3(), _earR = new THREE.Vector3();
/** [distance in metres, pan -1..1] of a world point as heard from the camera. */
function hear(p) {
  _ear.subVectors(p, camera.position); const d = _ear.length();
  _earR.set(1, 0, 0).applyQuaternion(camera.quaternion);
  return [d, d > 0.01 ? clamp(_ear.dot(_earR) / Math.max(d, 2.5), -1, 1) : 0];
}
function hookRider(j, isPlayer) {
  const hp = new THREE.Vector3();
  j.onHoof = (i, leg) => {
    leg.hoof.getWorldPosition(hp); hp.y = 0.05;
    const sp = j.speed / 9;
    if (j.speed > 3) fx.dust(hp, 1 + (sp > 0.6 ? 1 : 0), 0.25, 0.9 * sp, 0.35 + sp * 0.4);
    if (j.speed > 6 && leg.hind) fx.clods(hp, 3, j.dir * j.speed);
    if (S.mode === 'replay') return;
    const [d, pan] = hear(hp);
    audio.hoof(sp, pan, d);
    if (isPlayer && i === 0 && j.speed > 5) audio.armourClank(0.4 + sp * 0.5);
  };
  j.onLand = (p, v) => { audio.bodyFall(clamp(v / 6, 0.4, 1), hear(p)[0]); fx.dust(p, 16, 1.2, 1.6, 0.9); S.shake = Math.max(S.shake, 0.35); };
}
function makeRider(def, dir, isPlayer) {
  const j = new Jouster(scene, Object.assign({}, def.arms, def.armourTint ? { armourTint: def.armourTint } : {}, def.lance ? { lanceScale: LANCES[def.lance].scale } : {}), dir, LANE_X, def.horseDef || HORSES[def.horse], def.armourDef || harness(def.armour));
  hookRider(j, isPlayer); return j;
}
function disposeRider(j) { if (!j) return; scene.remove(j.root); if (j.unhorsed) scene.remove(j.rider); }
function rebuildPlayer() {
  disposeRider(player);
  if (!profile.bond) profile.bond = {};
  player = makeRider({ arms: profile.arms, horse: profile.horse, armour: profile.armour, armourDef: harness(profile.armour, profile.helm), lance: profile.lance || 'standard', horseDef: bondedHorse(HORSES[profile.horse], profile.bond[profile.horse]) }, 1, true);
  player.setCaparison(profile.caparison || 'livery');
  player.setPose(-START_Z, 1);
}

// ------------------------------------------------------------------ words on screen: ticker, callouts, toasts
/**
 * A line on the ticker. Everything goes through the voice director, which decides if and when it is shown.
 * tier: 1 result (strike, verdict, fouls, unhorsing) · 2 course state (marshal, score) · 3 colour (facts, teaching, royals, intros) · 4 ambient (groom, crowd).
 * o: { delay (s), ttl (s), prompt (a screen prompt: not counted in the course budget), phases, free, cat, speak, after: 'strike', prio }
 */
function say(text, who = 'THE MARSHAL', tier = 2, o = {}) { return voice.line(Object.assign({ text, who, tier }, o)); }

// ---- callouts: the big centre text. At most one per strike, the most important (unhorse > break/helm > foul > attaint > miss).
const CALL = { unhorse: 5, helm: 4, break: 4, turned: 3, foul: 3, across: 2, attaint: 2, miss: 1 };
let strikeCall = null;      // { t0, best: [text, cls, prio], fired }
function flashCall(text, cls) { const el = $('flashTxt'); el.innerHTML = text; el.className = ''; void el.offsetWidth; el.className = `show ${cls}`; }
/** prio = null: show at once (the barrier, a lance left low). prio = a number: a blow of this strike, buffered a moment so the best one is shown. */
function callout(text, cls = 'good', prio = null) {
  if (prio === null) { flashCall(text, cls); return; }
  if (strikeCall) {
    if (strikeCall.fired) return;                                   // this strike has had its callout; the rest is in the verdict
    if (prio > strikeCall.best[2]) strikeCall.best = [text, cls, prio];
    return;
  }
  strikeCall = { t0: voice.t, best: [text, cls, prio], fired: false };
}
function flushCall() {
  if (strikeCall && !strikeCall.fired && voice.t >= strikeCall.t0 + 0.09) { strikeCall.fired = true; flashCall(strikeCall.best[0], strikeCall.best[1]); }
}
// ---- notices wait their turn, and wait out the charge and the replay: each stays up for its own time (seconds), the next follows.
const toastQ = []; let toastBusy = false, toastCur = null, toastTimer = 0, toastAt = 0;
const toastOk = () => !M || !C || S.mode === 'ready' || S.mode === 'intro' || (S.mode === 'after' && (C.verdict || C.carded));
function toast(title, text, secs = 7, sound = false, seal = false) { toastQ.push([title, text, secs, sound, seal]); pumpToast(); }
function showToast() {
  const t = toastQ.shift(); toastCur = t; toastBusy = true; toastAt = performance.now();
  const el = $('toast'); el.querySelector('b').textContent = t[0]; el.querySelector('span').textContent = t[1];
  el.classList.toggle('seal', !!t[4]); el.style.animationDuration = `${t[2]}s`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  if (t[3]) audio.ui('select');
  toastTimer = setTimeout(() => { $('toast').classList.remove('show'); toastCur = null; toastBusy = false; pumpToast(); }, t[2] * 1000 + 300);
}
function pumpToast() {
  if (toastBusy) {      // the charge or a replay begins while a notice is up: it goes back to the head of the queue
    if (toastCur && !toastOk()) {      // it comes back for the time it had left (no second chime), or not at all if it was nearly done; never from the start, or a long notice returns every course
      clearTimeout(toastTimer); $('toast').classList.remove('show');
      const left = toastCur[2] - (performance.now() - toastAt) / 1000;
      if (left > 2.5) toastQ.unshift([toastCur[0], toastCur[1], left, false, toastCur[4]]);
      toastCur = null; toastBusy = false;
    }
    return;
  }
  if (toastQ.length && toastOk()) showToast();
}
function discover(id) {
  if (!profile.arts) profile.arts = {};
  if (profile.arts[id] || !ARTS[id] || (M && M.online)) return;
  profile.arts[id] = true; saveProfile();
  toast(`ART DISCOVERED — ${ARTS[id].name}`, ARTS[id].text, DISCOVERY_SECONDS, true);
}
/** Feats earned just now: a toast for each (it waits out the charge and the replay) and the save. Returns the ids. */
function showFeats(ids) {
  if (!ids || !ids.length) return ids || [];
  saveProfile();
  for (const id of ids) { const a = ACH_BY_ID[id]; if (a) toast(a.name, a.text + ` (+${a.renown ?? ACH_RENOWN} renown)`, 6, true, true); }
  return ids;
}
/** Run a feat check and announce what it earned; if its renown bonus lifts you to a new rank, say so (Hugh speaks it at the match card, never mid-match). */
function withFeats(fn) {
  if (M && M.online) return [];      // online: no feats, no renown
  const rb = rankOf(profile.renown), ids = showFeats(fn());
  if (rankOf(profile.renown) > rb) announceRank(false);
  return ids;
}
/** A new rank: the notice now (a rank reached mid-match is remembered, so Hugh can say his line at the card). */
function announceRank(atCard) {
  const r = rankOf(profile.renown);
  toast(RANKS[r].name, `${ANNOUNCER.short} says: "${CIRCUIT.rank}"`);
  if (atCard) rankSay(r); else if (M) M.rankPending = true;
}
/** Hugh's own line for the rank, between matches only (the match card is a stoppage; it waits for the verdict and the herald before it). */
function rankSay(r) { voice.later(7.5, () => say(rankLine(r), ANNOUNCER.label, 3, { phases: ['after', 'end'], ttl: 6, speak: true, speaker: speakerOf.hugh, voice: 'hugh', onShown() { ceremony.speak(3); } })); }
const tinct = (hex) => (TINCTURES.find(t => t[1] === hex) || ['a field'])[0].toLowerCase();

// ---- the herald: picks a line from src/herald_lines.js and hands it to the voice director. Narrated circuit only.
const RES4 = ['charge', 'strike', 'after', 'replay', 'end'];
const resultMeta = (prio, extra = {}) => Object.assign({ tier: 1, kind: 'result', after: 'strike', prio, speak: true, phases: RES4 }, extra);
const shoutMeta = { tier: 1, kind: 'shout', hold: 0.95, gapAfter: 0, ttl: 0.3, who: 'THE COMMONS' };
const colourMeta = (extra = {}) => Object.assign({ tier: 3, phases: 'after' }, extra);
const replayMeta = { tier: 3, kind: 'replay', speak: true, phases: ['replay', 'after', 'ready'], ttl: 14 };   // the combined result call outlasts a short replay: let the remark follow it
const verdictMeta = { tier: 2, kind: 'verdict', speak: true, phases: 'after', ttl: 6 };
// tier, kind, speak ... per HERALD key. Spoken aloud: tiers 1-2 and the replay colour; the intro and the match-end card are stoppages and keep their voice.
const HMETA = {
  entry: { tier: 3, speak: true, phases: 'intro', ttl: 6 }, introHim: { tier: 3, speak: true, phases: 'intro', ttl: 6 }, introYou: { tier: 3, speak: true, phases: 'intro', ttl: 6 },
  courseStart: { tier: 2, speak: true, phases: 'ready', who: 'THE MARSHAL' },
  teachSalute: { tier: 3, phases: 'ready' }, teachLower: colourMeta(), teachAim: colourMeta(), teachSeat: colourMeta(), teachHorse: colourMeta(),
  youBreak: resultMeta(4), himBreak: resultMeta(4), youHelm: resultMeta(4), himHelm: resultMeta(4), youAttaint: resultMeta(2), himAttaint: resultMeta(2),
  youMiss: resultMeta(1), himMiss: resultMeta(1), bothMiss: resultMeta(1.5), youUnhorse: resultMeta(5), himUnhorse: resultMeta(5),
  foulHorse: resultMeta(3), foulTilt: resultMeta(3, { ttl: 4 }),      // (the per-stroke result lines above are no longer spoken: the one combined RESULT call covers both riders, see resultCall())
  result: resultMeta(6, { cap: 'combined', ttl: 5 }), remarkHim: { tier: 3, kind: 'replay', second: true, speak: true, phases: ['replay', 'after', 'ready'], ttl: 18, cat: 'replayHim' },
  shout: shoutMeta, shoutDown: shoutMeta, shoutFall: shoutMeta,
  leadYou: verdictMeta, leadHim: verdictMeta, scoreLevel: verdictMeta, matchPoint: verdictMeta,
  turnAbout: colourMeta({ tier: 4 }), facts: colourMeta(),
  royalPleased: colourMeta(), royalRise: colourMeta(), royalDispleased: colourMeta(),
  ladyFavour: colourMeta({ free: true, ttl: 6, phases: ['after', 'ready'] }),
  win: { tier: 1, kind: 'live', speak: true, ttl: 8 }, loss: { tier: 1, kind: 'live', speak: true, ttl: 8 }, draw: { tier: 1, kind: 'live', speak: true, ttl: 8 }, prize: { tier: 3, speak: true, ttl: 8 },
  replay: replayMeta, replayMiss: replayMeta, replayGlance: replayMeta,
};
const pickHist = {};      // per key: indexes of the last picks
/** A line for this key: never one of the last 20 picks (as far as the pool allows); fact lines once per match. */
function pickLine(key, pool = HERALD[key]) {
  if (!pool || !pool.length) return null;
  const hist = pickHist[key] || (pickHist[key] = []);
  let cand = pool.map((_, i) => i);
  if (key === 'facts') cand = cand.filter(i => !M.usedFacts.has(i));
  const recent = hist.slice(-Math.min(20, pool.length - 1));
  let ok = cand.filter(i => !recent.includes(i)); if (!ok.length) ok = cand;
  if (!ok.length) return null;
  const i = pick(ok);
  return { raw: pool[i], done() { hist.push(i); if (hist.length > 20) hist.shift(); if (key === 'facts') M.usedFacts.add(i); } };
}
/** The herald speaks. o: extra placeholder values in o.vars; any voice.line option (tier, free, ttl, ...) overrides HMETA. */
function herald(key, delay = 0, o = {}) {
  if (!M || (!M.circuit && !(M.mode.own && (o.text || key === 'win' || key === 'loss' || key === 'draw'))) || profile.herald === false || !HERALD || !(HERALD[key] || o.pool || o.text)) return false;      // (the rules-only modes are exhibition: they speak their own result calls)
  const pk = o.text ? { raw: o.text, done() {} } : pickLine(key, o.pool || HERALD[key]); if (!pk) return false;      // o.text: a line already assembled (the combined result); o.pool: a pool picked by the caller (his remark)
  const vars = Object.assign({ you: profile.name, him: M.od.short, himFull: M.od.name.replace(/, ".*"/, ''), venue: M.V.name, city: M.V.city, year: M.V.year, yourScore: M.score[0], hisScore: M.score[1],
    course: ORD[Math.max(0, M.course - 1)] || 'next', land: M.od.land, horse: HORSES[profile.horse].name.toLowerCase(), arms: `${tinct(profile.arms.c1)} and ${tinct(profile.arms.c2)}` }, o.vars);
  const text = pk.raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const { vars: _v, onShown, pool: _pl, text: _tx, ...rest } = o;
  return voice.line(Object.assign({ who: ANNOUNCER.label, key, delay, speaker: speakerOf.hugh, voice: 'hugh' }, HMETA[key] || { tier: 3 }, rest, { text, onShown() { pk.done(); ceremony.speak(3); if (onShown) onShown(); } }));      // he steps forward on his dais while he speaks
}
/** The host of the royal box speaks (a few lines a match): kind = approve | scorn | joke | delight. False when he is silent (budget, no herald). */
const HOSTKIND = { royalPleased: 'approve', royalRise: 'delight', royalDispleased: 'scorn', royalJoke: 'joke' };
function hostSay(kind, delay = 0, phases = 'after') {
  if (!M || M.practice || (!M.circuit && kind !== 'restless') || profile.herald === false) return false;
  const host = hostOf(M.V.id), pool = (HOST_LINES[host.id] || HOST_LINES.lord)[kind]; if (!pool || (M.hostN || 0) >= 4) return false;
  const used = M.hostUsed || (M.hostUsed = new Set()), fresh = pool.filter(l => !used.has(l)), text = pick(fresh.length ? fresh : pool);
  return say(text, host.label, kind === 'restless' ? 2 : 3, { delay, cat: 'host', phases, ttl: 6, speak: true, speaker: speakerOf.king, voice: 'king', onShown() { M.hostN = (M.hostN || 0) + 1; used.add(text); } });
}
/** A lesson, once per match: it counts as taught only when it was really shown. */
function teach(key, delay = 0, o = {}) { if (!M || M.taught[key]) return false; return herald(key, delay, Object.assign({}, o, { onShown() { M.taught[key] = true; } })); }
/** The teaching still to give after the first course: the lowering of the lance, then one of three. */
function nextTeach() { if (!M.teachPick) M.teachPick = pick(['teachAim', 'teachSeat', 'teachHorse']); return ['teachLower', M.teachPick].find(k => !M.taught[k]) || null; }
/** Colour between courses, at most every 2nd course (the voice director enforces it): a lesson, the royal box, a fact, or the squires at work. */
function betweenColour(royalKey) {
  if (!M || M.result || M.practice) return;
  if (C && C.remarkQueued) return;      // the two replay remarks (yours, then his) are this gap's colour
  if (M.ladyPending) { M.ladyPending = false; if (!herald('ladyFavour', 0.6)) say('A lady sends down her sleeve. Your nerve returns.', 'THE GALLERY', 3, { delay: 0.6, free: true, ttl: 6, phases: 'after' }); return; }
  if (!M.circuit || !HERALD || !voice.colourOk()) return;
  const tk = nextTeach();
  const order = [tk, royalKey, M.usedFacts.size < HERALD.facts.length ? 'facts' : null, 'turnAbout'].filter(k => k && k !== voice.lastCat);
  if (order.length) { if (order[0] === tk) teach(tk, 1.2); else if (HOSTKIND[order[0]] && hostSay(HOSTKIND[order[0]], 1.2)) return; else herald(order[0], 1.2); }
}
/** The coaching line in the replay: what made this stroke work or fail. Exactly one colour line per replay. */
function replayColour() {
  if (!M || !C || C.replayLine) return; C.replayLine = true;
  const t = C.tech, weakest = ['sight', 'lance', 'horse', 'will'].sort((a, b) => t[a] - t[b])[0], tip = t[weakest] < 0.75 ? t.tips[weakest] : null;
  const p = C.pL.res, key = p && p.zone === 'miss' ? 'replayMiss' : p && p.glanced ? 'replayGlance' : 'replay';
  if (M.practice) { if (tip) say(tip, 'THE MASTER OF ARMS', 3, { kind: 'replay', phases: ['replay', 'after', 'ready'], delay: 1.5, ttl: 14, cat: 'replayTip', speaker: speakerOf.man('master'), onShown() { field.talk('master'); } }); return; }
  if (tip && (Math.random() < 0.5 || key === 'replayMiss')) { if (say(tip, 'THE MASTER OF ARMS', 3, Object.assign({ kind: 'replay', phases: ['replay', 'after', 'ready'], delay: 1.5, ttl: 14, cat: 'replayTip', speak: M.circuit, speaker: speakerOf.man('master'), voice: 'master', onShown() { field.talk('master'); hisRemark(); } }))) { if (M.circuit) C.remarkQueued = true; return; } }
  if (herald(key, 1.5, { onShown: hisRemark })) C.remarkQueued = true;
}
/** The second replay remark, on HIS stroke: queued when the first (on yours) goes up, so it follows once that one has finished. */
function hisRemark() {
  if (!M || !C || M.result || M.practice || C.hisRemarked) return; C.hisRemarked = true;
  const o = C.oL.res, pool = o && HERALD.REMARK_HIM[strokeCat(o)]; if (!pool) return;
  herald('remarkHim', 0.3, { pool });
}

/** What the field needs to know each frame. Your men change ends while you are far off, mid-lists. */
function fieldEnv() {
  if (!player || !M || S.mode === 'menu') return { mode: 'menu' };
  const out = S.mode === 'charge' || (S.mode === 'after' && C && C.turn.p.stage !== 'done');
  const st = C && C.rb && S.mode === 'after' ? C.turn.p.stage : '', marker = st === 'free' || st === 'settle' || st === 'hand';      // riding back by hand: your men wait at the end where the mark is
  return { marker, onMark: marker && (st !== 'free' || !!C.rb.onMark), mode: S.mode, tD: st === 'free' || st === 'settle' ? -dirP() : out && player.z * dirP() > 0 ? -dirP() : dirP(), px: player.root.position.x, pz: player.root.position.z, ox: opp ? opp.root.position.x : 0, oz: opp ? opp.root.position.z : 0, helmOff: player.helmOff };
}
/** Did a hard blow land on you last course? */
const heavyBlow = (c) => { const o = c.oL.res; return !!(o && o.pts > 0 && (o.broke || o.unhorse)) || M.hp.body < (c.hp0 ?? 1) - 0.08; };
/** The moment between courses, in a word, from the course just ridden (c is null before the first). */
function retSituation(c) {
  if (!c || M.practice) return 'start';
  const p = c.pL.res, d = M.score[0] - M.score[1];
  if (p && p.zone === 'helm' && p.pts > 0) return 'helm';
  if (p && p.broke) return 'broke';
  if (heavyBlow(c)) return 'struck';
  if (p && p.zone === 'miss') return 'miss';
  if (M.stamina < 0.35) return 'tired';
  return d >= 2 ? 'leading' : d <= -2 ? 'behind' : 'start';
}
/** One retinue line at most per course gap: about half the courses, more after a big moment, never the same line twice in a match. Between courses only, tier 4. */
function retinueSpeak(sit, chance, wait = 2.6) {
  if (!sit || !M || M.practice || !profile.retinue) return;
  if (Math.random() >= (['helm', 'broke', 'struck'].includes(sit) ? 0.8 : chance)) return;
  const here = Object.keys(profile.retinue).filter(id => !lateMen[id] && ROLE_TITLE[id] && typeof profile.retinue[id] === 'object').map(id => ({ id, name: profile.retinue[id].name, trait: profile.retinue[id].trait })).concat([{ id: 'master', name: '', trait: null }]);
  const L = chooseLine(sit, here, M.retUsed); if (!L) return;
  let said = false;
  const tryIt = () => { if (said) return; say(L.text, L.id === 'master' ? ROLE_TITLE.master : `${L.name} · ${ROLE_TITLE[L.id]}`, 4, { free: true, phases: ['after', 'ready', 'end'], ttl: 8, speak: true, speaker: speakerOf.man(L.id), voice: L.id, onShown() { said = true; M.retUsed.add(L.text); field.talk(L.id); } }); };
  voice.later(wait, tryIt); voice.later(wait + 4, tryIt);
}

// ------------------------------------------------------------------ crowd reactions
// Every pass outcome has its own kind: its own sound recipe here (snd: [category, strength, extra lead s]) and its own animation table in crowd.js (buildTable).
// c / k: how it moves the commons' / the court's favour for `by`; ex: how far it lifts the mood (S.excite).
const REACT = {
  start:     { c: 0, k: 0, snd: [['cheer', 0.6]], ex: 0.55 },
  salute:    { c: 0.03, k: 0.13, snd: [['applause', 0.55]], ex: 0.42 },
  rouse:     { c: 0.08, k: -0.02, snd: [['cheer', 0.8]], ex: 0.6 },
  taunt:     { c: 0.03, k: -0.06, snd: [['laugh', 0.6]], ex: 0.4 },                                    // the player plays the fool: commons laugh, the gallery raises eyebrows
  attaint:   { c: 0.02, k: 0.04, snd: [['polite', 0.6]], ex: 0.3 },                                    // a touch that does not break: a polite ripple
  break:     { c: 0.11, k: 0.09, snd: [['roar', 0.75], ['polite', 0.5, 0.3]], ex: 0.8 },               // lance broken on the shield or body: roar, the gallery claps behind it
  helm:      { c: 0.14, k: 0.2, snd: [['gasp', 0.7], ['roar', 0.9], ['applause', 0.7]], ex: 0.95 },    // on the helm: gasp, then the roar 0.2 s later
  unhorse:   { c: 0.35, k: 0.18, snd: [['roar', 1], ['gasp', 0.9]], ex: 1 },
  bothbreak: { c: 0.1, k: 0.1, snd: [['roar', 0.95], ['applause', 0.9, 0.3], ['cheer', 0.8]], ex: 0.97 },   // both lances in splinters: the biggest roar short of a fall; by 0 (everyone alike)
  miss:      { c: -0.08, k: -0.02, snd: [['groan', 0.6]], ex: 0.3 },                                   // a clean miss: "aww", then a few jeers and laughs
  bothmiss:  { c: -0.04, k: -0.04, snd: [['laugh', 0.8], ['whistle', 0.7]], ex: 0.4 },                 // neither touches: laughter and whistles
  glance:    { c: 0.02, k: 0.0, snd: [['ooh', 0.6]], ex: 0.4 },                                        // the point skids off: a long "ooh", hands on heads
  near:      { c: 0.0, k: 0.0, snd: [['gasp', 0.9]], ex: 0.45 },                                       // the point goes by the helm: a sharp gasp
  tilt:      { c: -0.05, k: -0.09, snd: [['wince', 0.8]], ex: 0.4 },                                   // a lance into the barrier: "oof"
  foul:      { c: -0.2, k: -0.4, snd: [['boo', 0.95], ['whistle', 0.5, 0.4]], ex: 0.65 },
  sandbag:   { c: 0.0, k: -0.03, snd: [['laugh', 0.7]], ex: 0.5 },
  win:       { c: 0.15, k: 0.15, snd: [['roar', 1], ['applause', 1]], ex: 1 },
  loss:      { c: 0, k: 0, snd: [['applause', 0.6]], ex: 0.5 },
};
// Plain modern English, short. Several per kind, and the same line is never shown twice running (see crowdLine).
const CROWD_LINES = {
  salute: [['THE GALLERY', 'The ladies wave their sleeves; the lords incline their heads.'], ['THE GALLERY', 'Kerchiefs flutter along the gallery.']],
  rouse: [['THE COMMONS', 'The rails erupt. They love a knight who plays to them.'], ['THE COMMONS', 'The commons stamp and shout his name.']],
  taunt: [['THE GALLERY', 'Raised eyebrows in the gallery. The commons laugh.'], ['THE COMMONS', 'The rails hoot with laughter.']],
  attaint: [['THE STANDS', 'A ripple of applause. A touch, no more.'], ['THE GALLERY', 'Polite clapping from the gallery.'], ['THE STANDS', 'A touch. The crowd waits for more.']],
  break: [['THE COMMONS', 'A roar from the rails. Caps fly into the air!'], ['THE COMMONS', 'The commons howl and hammer on the fence!'], ['THE STANDS', 'The townsfolk are on their feet, pennants waving.']],
  helm: [['THE GALLERY', 'The whole gallery rises. Kerchiefs flutter like doves.'], ['THE COMMONS', 'Right on the helm! The rails go wild.'], ['THE STANDS', 'A gasp, then a roar. That one rang his head.']],
  unhorse: [['THE COMMONS', 'Pandemonium at the rails. Hats, hoods and tankards in the air!'], ['THE GALLERY', 'Ladies cover their eyes; every lord is on his feet.'], ['THE STANDS', 'He is down! The whole field is shouting.']],
  bothbreak: [['THE STANDS', 'Both lances in splinters! The stands are on their feet.'], ['THE COMMONS', 'Two clean breaks! The rails shake with noise.'], ['THE GALLERY', 'Even the gallery cheers. That was a fine course.']],
  miss: [['THE COMMONS', 'Jeers and whistles from the commons.'], ['THE COMMONS', 'Catcalls from the rails. They came to see lances broken.'], ['THE STANDS', 'A long groan runs round the stands.']],
  bothmiss: [['THE COMMONS', 'Both lances missed. The rails whistle and laugh.'], ['THE GALLERY', 'The gallery shakes its head. Nobody hit anything.'], ['THE STANDS', 'Laughter from the stands. Two misses.']],
  glance: [['THE STANDS', 'A long "ooh" as the point skids off.'], ['THE COMMONS', 'Hands go to heads all along the rail. So close.'], ['THE GALLERY', 'A hush, then a sigh. The lance glanced away.']],
  near: [['THE STANDS', 'A sharp gasp. That passed a hand from his helm.'], ['THE GALLERY', 'Ladies clutch at their sleeves. That was close.']],
  tilt: [['THE GALLERY', 'A wince runs along the gallery. Clumsy.'], ['THE COMMONS', 'A groan from the rails. Right into the barrier.'], ['THE STANDS', 'The crowd flinches as the lance hits the tilt.']],
  foul: [['THE GALLERY', 'The gallery turns away in disgust; the commons shake their fists.'], ['THE COMMONS', 'Boos from every rail. He struck the horse!'], ['THE STANDS', 'Angry shouting. Nobody likes a blow on the horse.']],
  sandbag: [['THE COMMONS', 'The idlers at the rail fall about laughing.'], ['THE COMMONS', 'The rail roars with laughter at the sandbag.']],
  win: [['THE GALLERY', 'Flowers and favours rain down from the gallery!'], ['THE STANDS', 'The whole crowd rises for the winner.']],
  loss: [['THE STANDS', 'Courteous applause for the beaten knight.'], ['THE GALLERY', 'The gallery applauds the loser politely.']],
};
let crowdEvId = 0, lastCrowdLine = '';
/** One crowd line for the kind, never the one just shown (and none if the kind has only that one). */
function crowdLine(kind) {
  const L = CROWD_LINES[kind]; if (!L) return null;
  const ok = L.filter(l => l[1] !== lastCrowdLine); if (!ok.length) return null;
  const l = pick(ok); lastCrowdLine = l[1]; return l;
}
function react(kind, by = 0, line = true) {
  const Rk = REACT[kind]; if (!Rk) return;
  const gasp = Rk.snd.some(x => x[0] === 'gasp');
  const fav = M ? clamp(by * M.favour * 2, -1, 1) : 0;      // is the house with the man this is about?
  for (const [snd, str, ld] of Rk.snd) audio.crowd(snd, str, (ld || 0) + (gasp && snd !== 'gasp' && kind !== 'near' ? 0.2 : 0), { fav });      // the gasp goes 0.2 s before the roar
  S.excite = Math.max(S.excite, Rk.ex); S.scorer = Rk.c + Rk.k >= 0 ? by : -by;
  if (Rk.ex > 0.75) S.waveT = S.time;
  S.crowdEv = { id: ++crowdEvId, kind: { rouse: 'break', sandbag: 'taunt' }[kind] || kind, by };
  if (!M) return;
  M.fav.commons = clamp(M.fav.commons + by * Rk.c, -1, 1); M.fav.court = clamp(M.fav.court + by * Rk.k, -1, 1);
  M.favour = (M.fav.commons + M.fav.court) / 2;
  if (Rk.ex > 0.5 && player) M.agit = clamp(M.agit + (1 - player.horseDef.nerve) * 0.35 * Rk.ex, 0, 1);
  if (line && !M.practice) { const l = crowdLine(kind); if (l) say(l[1], l[0], 4, { cat: 'crowd' }); }      // ambient: dropped during the charge and the strike
  if (!M.ladyFavour && M.fav.court > 0.6 && by > 0 && !M.practice) {
    M.ladyFavour = true; M.focus = 1; player.ribbon.visible = true; M.ladyPending = true;       // told at the next verdict (see betweenColour)
  }
}
// The two strokes of a pass land within a few tenths of a second of each other: collect them and fire ONE reaction for the pair
// (both broke -> bothbreak, both missed -> bothmiss, otherwise the bigger of the two). A fall or a foul does not wait.
const strokeQ = { list: [], t: 0, mute: 0 };
const STROKE_RANK = { miss: 0, attaint: 1, glance: 2, near: 2.5, break: 3, helm: 4 };
function crowdStroke(kind, by) {
  if (strokeQ.mute > 0) return;      // the pass already had its reaction (a fall or a foul)
  strokeQ.list.push([kind, by]); strokeQ.t = 0.3;
  if (kind === 'unhorse' || kind === 'foul') flushStrokes();
}
function flushStrokes() {
  const L = strokeQ.list; if (!L.length) return;
  let k, by = 0;
  const all = (...ks) => L.length === 2 && L.every(e => ks.includes(e[0]));
  const un = L.filter(e => e[0] === 'unhorse'), foul = L.find(e => e[0] === 'foul');
  if (un.length) { k = 'unhorse'; by = un.length > 1 ? 0 : un[0][1]; }
  else if (foul) { k = 'foul'; by = foul[1]; }
  else if (all('break', 'helm')) { k = 'bothbreak'; by = 0; }
  else if (all('miss')) { k = 'bothmiss'; by = 0; }
  else { let best = L[0]; for (const e of L) if (STROKE_RANK[e[0]] > STROKE_RANK[best[0]]) best = e; k = best[0]; by = best[1]; }
  L.length = 0;
  if (k === 'unhorse' || k === 'foul') strokeQ.mute = 0.8;
  react(k, by);
}
function fanfare(kind) { audio.fanfare(kind); S.fanfareT = kind === 'short' ? 1.3 : 2.8; }

// ------------------------------------------------------------------ match flow
const QUINTAIN_DEF = { id: 'quintain', name: 'The Quintain', short: 'the quintain', land: '—', arms: { c1: '#a81e1e', c2: '#ece8dc', c3: '#e0b83c', pattern: 'quarterly', charge: 'roundel' }, horse: 'rouncey', armour: 'milanese', skill: 0, seat: 9, drive: 0 };
let TILT_TOP = 1.3;      // height of the tilt's rail (m), 0 when the lists are open
// ---- the match intro (FIFA-style; shots and timings in src/ceremony.js SHOTS): wide, trumpets, royal box, warm-up canter, line-up and salute, the announcer, each knight's man boasts, marks.
const introFired = new Set(), introNew = () => !!M && !M.practice;
/** The spoken lines of the intro, all through the voice director (stoppage: one line at a time). Hugh Clement speaks aloud; the host and the boasters are ticker lines. */
function introLines() {
  if (profile.herald === false) return;
  const host = hostOf(M.V.id), hl = HOST_LINES[host.id] || HOST_LINES.lord, od = M.od, ret = profile.retinue || {};
  const vars = { venue: M.V.name, city: M.V.city, year: M.V.year, himFull: hailName(od), land: od.land, him: od.short, you: profile.name, arms: `${tinct(profile.arms.c1)} and ${tinct(profile.arms.c2)}` };
  const L = (at, text, who, hold, extra = {}) => voice.later(at, () => say(fill(text, vars), who, 3, Object.assign({ phases: 'intro', ttl: 6, hold, gapAfter: 0.7 }, extra)));
  const hugh = (at, text, hold) => L(at, text, ANNOUNCER.label, hold, { speak: true, speaker: speakerOf.hugh, voice: 'hugh', onShown() { ceremony.speak(hold); } });
  L(6.0, pick(hl.open), host.label, 3.6, { speak: true, speaker: speakerOf.king, voice: 'king' });                       // the host stands at 5.4 (cue below)
  hugh(19.4, pick(INTRO.venue), 3.4); hugh(23.5, pick(INTRO.names), 3.3);
  const pu = ret.pursuivant && typeof ret.pursuivant === 'object' ? ret.pursuivant : null, mine = pu ? 'pursuivant' : 'squire', man = ret[mine];
  L(27.5, boastFor('him', od.id), 'HIS HERALD', 3.8, { speak: true, speaker: speakerOf.oppHerald, voice: 'herald' });
  L(32.0, boastFor('you', mine), man && man.name ? `${man.name} · ${ROLE_TITLE[mine]}` : ROLE_TITLE[mine], 3.6, { speak: true, speaker: speakerOf.man(mine), voice: mine });
}
/** The location card when a match opens: "Smithfield · London · 1390", and the rule set under it. */
function titleCard() { if (M && !M.practice) ceremony.titleCard(M.V.name, M.V.city, M.V.year, M.mode.name); }
function introCues(t) {
  const at = (k, tt, fn) => { if (t >= tt && !introFired.has(k)) { introFired.add(k); fn(); } };
  at('title', 2.0, () => $('banner').classList.add('hidden'));
  at('venueCard', 0.4, titleCard);      // the location card, lower left
  at('horns', 2.3, () => { ceremony.raise(true); fanfare('start'); react('start', 0, false); });      // the trumpets go up with the first note
  at('hornsDown', 4.7, () => ceremony.raise(false));
  at('rise', 5.4, () => { if (world.setRoyalMood) world.setRoyalMood('rise'); });                 // the host stands
  at('visors', 14.4, () => { player.visorUp = true; opp.visorUp = true; });                        // the knights raise their visors as they reach the box
  at('cardHim', 26.3, () => ceremony.card({ name: hailName(M.od), land: M.od.land, bio: bioOf(M.od), arms: M.od.arms, ovr: ovr(M.od) }));
  at('cardHimOff', 30.3, () => ceremony.hideCard());
  at('cardYou', 30.8, () => ceremony.card({ name: profile.name, land: RANKS[rankOf(profile.renown)].name, bio: `${HORSES[profile.horse].name}, ${HELMS[profile.helm].name}`, arms: profile.arms,
    ovr: ovr({ skill: 0.42 + 0.07 * bondLevel(profile.bond[profile.horse]), seat: ARMOURS[profile.armour].protection * 0.85, drive: (HORSES[profile.horse].top - 7.2) / 2 }) }));
  at('cardYouOff', 34.8, () => ceremony.hideCard());
  at('ends', MOVE.end, () => { player.setPose(-START_Z, 1); opp.setPose(START_Z, -1); });          // cut to the starting ends
  at('lower', 36.0, () => { player.visorUp = false; opp.visorUp = false; });                          // both lower their visors
  at('lance', 36.6, () => { player.raiseT = 1; opp.raiseT = 1; });                                    // and raise their lances
}
/** Skipping the intro is a VOTE. Offline it passes at once. Online both players must hold: send { skip: true } to the peer here, and call G.skipThem(true) when theirs arrives;
 *  the intro then ends only when S.skipWanted.me && S.skipWanted.them; a vote once cast stands (see the frame loop). */
function skipVote() {
  S.skipWanted.me = true; if (S.online) netSend({ t: 'skip', v: 1 });
  if (!S.online || S.skipWanted.them) skipIntro();
}
G.skipThem = (v) => { S.skipWanted.them = !!v; if (S.mode === 'intro' && S.skipWanted.me && S.skipWanted.them) skipIntro(); };
function skipIntro() { if (window.speechSynthesis) window.speechSynthesis.cancel(); voice.reset(); finishIntro(true); }
/** The intro is over (played out or skipped): tidy the scene and ride the first course. */
function finishIntro(skipped = false) {
  ceremony.hideCard(); ceremony.skipUI(false); ceremony.raise(false); S.skipHold = 0; skipKey = false;
  judges.setVisible(true); if (skipped) titleCard();      // a skipped intro shows the location card at the first course instead
  if (world.setRoyalMood && S.introT > 5.4) world.setRoyalMood('idle');
  if (introNew()) { player.visorUp = false; player.lanceLower = 0; opp.lanceLower = 0; }
  beginCourse(true);
}

/** Keep the Bridge: three challengers from KNIGHTS, one from each third of the roll by skill (so they grow stronger and never repeat); the knight you picked takes his own place in the queue. */
function newBridge(chosenId) {
  const by = [...KNIGHTS].sort((a, b) => a.skill - b.skill), per = Math.ceil(by.length / 3), ch = KNIGHTS.find(k => k.id === chosenId);
  const queue = [0, 1, 2].map(i => { const g = by.slice(i * per, (i + 1) * per); return (ch && g.includes(ch) ? ch : pick(g)).id; });
  return { n: 3, bout: 1, wins: 0, losses: 0, draws: 0, queue, log: [], tot: { broken: 0, helm: 0, courses: 0 }, keep: null };
}
/** The state a knight takes from one bout of the bridge into the next: wind, horse, harness (with its dents), nerve and the gallery's mood. */
function bridgeKeep() {
  return { stamina: M.stamina, horse: M.hp.horse, body: M.hp.body, agit: M.agit, focus: M.focus, fav: Object.assign({}, M.fav), favour: M.favour,
    dmg: Object.assign({}, player.dmg), dlog: player.dlog.map(e => Object.assign({}, e, { key: -1 })), askew: player.askew, plumeGone: !!player._plumeGone, bodyS: { arm: M.bodyS.p.arm, wind: M.bodyS.p.wind } };
}
/** Put the carried harness damage back on the fresh rider (rebuildPlayer made him new); the marks come first in the replay order (key -1). */
function bridgeRestoreHarness(k) {
  Object.assign(player.dmg, k.dmg); player.dlog = k.dlog.map(e => Object.assign({}, e)); player.askew = k.askew; if (k.plumeGone) player._plumeGone = true; player._rebuild(Infinity);
}

let preparing = false;
/** Start a match. If the trees and props are still arriving in the background, wait for them behind "Preparing the lists…" rather than build the venue without them. */
function startMatch(...args) {
  if (SCANS.ready) return startMatchNow(...args);
  if (preparing) return;
  preparing = true; const el = $('preparing'), txt = $('prepTxt'); el.classList.remove('hidden');
  const paint = () => { const st = loadStats('bg'); txt.textContent = `${Math.round(st.frac * 100)}%  ·  ${mb(st.loaded)} of ${mb(st.total)} MB`; };
  paint(); const iv = setInterval(paint, 150);
  Promise.race([SCANS.pending || preloadScans(), new Promise(r => setTimeout(r, 45000))]).catch(() => {}).then(() => {      // (after 45 s it goes ahead without them)
    clearInterval(iv); preparing = false; el.classList.add('hidden');
    if (!SCANS.ready) return startMatchNow(...args);
    refreshWorldWithScans(); startMatchNow(...args);
  });
}
/** The menu's world was built before the trees and props arrived: build it again with them (never during a match). */
function refreshWorldWithScans() {
  if (M || !world || worldScans || !SCANS.ready) return;
  const training = worldKey === -2; worldKey = -99; setVenue(venueIdx, training);
}
function startMatchNow(vIdx, oppId, circuit, practice = false, modeId = null, courses = 0, bridge = null, onl = false) {
  S.online = !!onl; document.body.classList.toggle('online', !!onl);      // onl: a joust against a friend (the opponent is NET.od, driven from his stream)
  initAudio(); G.physLog = [];
  setVenue(vIdx, practice);
  if (!practice && MODES[modeId || VENUES[vIdx].mode || 'planken'].bridge && !bridge) { bridge = newBridge(oppId); oppId = bridge.queue[0]; }      // a fresh pas d'armes: the queue is drawn once
  const V = VENUES[vIdx], od = practice ? QUINTAIN_DEF : onl ? NET.od : KNIGHTS.find(k => k.id === oppId);
  rebuildPlayer(); disposeRider(opp); player.visorUp = false; player.helmOff = false;
  if (bridge && bridge.keep) bridgeRestoreHarness(bridge.keep);
  if (practice) { opp = new Quintain(scene, LANE_X, 0); opp.setSide(1); } else if (onl) { opp = makeRider(Object.assign({}, od, { horseDef: HORSES[od.horse], armourDef: harness(od.armour, od.helm), lance: od.lance }), -1, false); opp.setCaparison(od.cap || 'livery'); opp.remote = true; opp.setPose(START_Z, -1); } else { opp = makeRider(od, -1, false); opp.setPose(START_Z, -1); }
  world.setLivery([profile.arms.c1, profile.arms.c2], [od.arms.c1, od.arms.c2], profile.arms, od.arms);
  const mode = MODES[practice ? 'planken' : modeId || V.mode || 'planken'], PT = Object.assign({}, POINTS, mode.points);
  if (world.setTilt) world.setTilt(mode.tilt);
  player.foe = practice ? null : opp; if (!practice) opp.foe = player;
  TILT_TOP = mode.tilt ? 1.3 : 0; fx.tiltTop = TILT_TOP;
  lateMen = {}; lateRolled = false; const welcome = (man('pursuivant') ? man('pursuivant').welcome : 0) + crew('welcome');
  M = { V, vIdx, od, circuit, practice, mode, PT, courses: mode.fixedCourses ?? (mode.noExtra && !mode.pickCourses ? 4 : (!practice && courses) || COURSES_PER_MATCH), bridge: bridge || null, course: 0, score: [0, 0], marks: [[], []], favour: V.home * 0.8, fav: { commons: V.home + welcome, court: V.home * 0.6 + welcome }, stamina: 1,
    agit: 0.15 + (1 - player.horseDef.nerve) * 0.3, focus: 1, fouls: 0, breaks: [0, 0], result: null, online: !!onl, hpO: { horse: 1, body: 1 }, oTilts: 0, hp: { horse: 1, body: 1 }, bodyS: { p: { arm: 0, wind: 0 }, o: { arm: 0, wind: 0 } }, taught: {}, lesson: practice ? Math.min(profile.lesson || 0, LESSONS.length - 1) : -1,
    kit: modeKit(practice ? null : mode), shyN: [0, 0], shieldOff: [0, 0], sights: [0, 0], maxDef: 0, tilts: 0, usedFacts: new Set(), ladyPending: false, teachPick: null,
    stats: [0, 1].map(() => ({ broken: 0, attaint: 0, helm: 0, miss: 0, top: 0, best: 0 })), tech: { sight: 0, lance: 0, horse: 0, will: 0, n: 0 } };
  if (onl) { M.mid = NET.mid; M.oppRid = LOBBY.friend ? LOBBY.friend.rid : ''; }
  if (bridge && bridge.keep) { const k = bridge.keep; M.stamina = k.stamina; M.hp.horse = k.horse; M.hp.body = k.body; M.agit = k.agit; M.focus = Math.min(k.focus, k.body); M.fav = Object.assign({}, k.fav); M.favour = k.favour; if (k.bodyS) Object.assign(M.bodyS.p, k.bodyS); }      // the bridge: nothing is mended between bouts
  if (M.kit.shieldTall > 1) { player.tallShield(M.kit.shieldTall); if (!practice) opp.tallShield(M.kit.shieldTall); }      // the Renntartsche: the same tall shield for both
  M.retUsed = new Set(); field.setup(profile.retinue, profile.arms, practice, practice ? null : { name: od.short, arms: od.arms });
  $('nameP').textContent = profile.name; $('nameO').textContent = od.name.replace(/, ".*"/, '');
  drawCrest($('crestP'), profile.arms); drawCrest($('crestO'), od.arms);
  $('venueInfo').textContent = `${V.name.toUpperCase()} · ${V.city.toUpperCase()} · ${V.year} · ${mode.name.toUpperCase()}${bridge ? ` · BOUT ${bridge.bout} OF ${bridge.n}` : ''}`;
  $('screen').classList.remove('on'); $('card').classList.add('hidden'); $('verdict').classList.add('hidden'); $('lesson').classList.toggle('hidden', !practice);
  S.mode = 'intro'; S.introT = 0; S.skipHold = 0; S.skipWanted = { me: false, them: false }; introFired.clear(); skipKey = false;
  if (onl) { NET.remote.reset(); NET.rem = null; NET.rLb = 0; NET.rGuardAge = 9; NET.sendT = 0; NET.lastRx = performance.now(); NET.rdyOut = NET.rdyIn = -1; }
  $('bannerTop').textContent = `${V.city.toUpperCase()} · ANNO ${V.year} · ${mode.name.toUpperCase()}, ${mode.sub.toUpperCase()}${bridge ? ` · BOUT ${bridge.bout} OF ${bridge.n}` : ''}`; $('bannerMain').textContent = V.name;
  $('bannerSub').innerHTML = `${profile.name} &nbsp;against&nbsp; ${od.name}<div id="tape"><div><b>${ovr({ skill: 0.42 + 0.07 * bondLevel(profile.bond[profile.horse]), seat: ARMOURS[profile.armour].protection * 0.85, drive: (HORSES[profile.horse].top - 7.2) / 2 })}</b>${HORSES[profile.horse].name} · bond ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}<small>${HELMS[profile.helm].name.toUpperCase()} · ${ARMOURS[profile.armour].name.toUpperCase()}</small></div><div><b>${ovr(od)}</b>${HORSES[od.horse].name} · ${od.land}<small>${ARMOURS[od.armour].name.toUpperCase()}</small></div></div>`;
  if (practice) { $('bannerTop').textContent = 'THE TILTYARD'; $('bannerMain').textContent = 'At the Quintain'; $('bannerSub').innerHTML = 'The master of horse will teach you the joust, one thing at a time.'; }
  $('banner').classList.remove('hidden'); $('hud').classList.add('hidden');
  voice.reset(); strikeCall = null;
  if (practice) { ceremony.clear(); life.clear(); fanfare('start'); react('start', 0, false); }      // the quintain keeps the short old intro
  else { ceremony.setup(V); life.setup(); player.visorUp = false; introLines(); }
  flagmen.setup(V, practice); judges.setup(V, practice); judges.setVisible(false);      // (the judges' stand shows from the first course: the intro cameras run through its place)
  updateHud(true);
  if (bridge && bridge.bout > 1) {      // the next challenger: the short form of the intro (the herald names him, then straight to the marks)
    skipIntro();
    if (profile.herald !== false) voice.later(0.8, () => say(`Bout ${bridge.bout} of ${bridge.n}. The next challenger is ${hailName(od)}, of ${od.land}.`, ANNOUNCER.label, 3, { phases: 'ready', ttl: 6, speak: true, speaker: speakerOf.hugh, voice: 'hugh' }));
    updateHud(true);
  }
}

function beginCourse(first = false) {
  const gapSit = retSituation(first ? null : C), gapHeavy = !first && !!C && !M.practice && heavyBlow(C);
  M.course++; voice.newCourse(M.course); strikeCall = null;
  const od = M.od;
  C = {
    t: 0, tier: 0, maxTier: 0, galT: -1, collected: 0, lat: LANE_X, latV: 0, couch: 0, couchHeld: false, setT: 0, fatigue: 0, braceT: 0, braceCd: 0, braceAge: 9, guardAge: 9,
    saluted: false, saluteT: 0, tiltStruck: false, reinT: 0, patCd: 0, sway: 0, minMiss: 9, act: null, cut: null, flags: {}, onMarkT: 0,
    pL: { prev: null, done: false, res: null, near: null }, oL: { prev: null, done: false, res: null, near: null }, shock: { p: null, o: null }, lead: 0,
    rd: { p: false, o: !!M.practice, oAt: 0.8 + Math.random() * 1.4, w: 0, sig: false, warned: false, plan: null },   // the raise: you, him, when he raises, wait since both are up, marshal's signal given, warned once
    beat: null, mont: null, montDone: false, judged: false, resultArgs: null, colourLater: false,
    afterT: 0, carded: false, verdict: false, verdictT: 0, replayed: false, tech: null, cine: null, ev: { couch: null, brace: null, impact: null, taps: [] },
    turn: { p: { stage: 'run', th: 0 }, o: { stage: 'run', th: 0 } }, rec: { f: [], ev: [] }, hitT: null,
    o: { q: clamp((od.skill + DIFFICULTY[profile.difficulty ?? 1].ai) * 0.85 + Math.random() * 0.25, 0, 1), top: lerp(GAIT_SPEED[3], HORSES[od.horse].top, clamp(od.drive + (Math.random() - 0.5) * 0.12, 0, 1)), zone: Math.random() < od.skill * 0.3 ? 'helm' : (Math.random() < 0.75 ? 'shield' : 'body'),
      bias: new THREE.Vector2((Math.random() - 0.5), (Math.random() - 0.5)), seed: Math.random() * 50, brace: Math.random() < lerp(0.25, 0.9, od.skill), go: 0.25 + Math.random() * 0.35,
      guard: Math.random() < lerp(0.08, 0.5, od.skill), rattled: 1, retarget: false, knock: new THREE.Vector2() },
  };
  C.rec.n = M.course; (M.recs || (M.recs = [])).push(C.rec);      // every course's recording is kept for the match (the pause menu's Replays)
  if (!M.online) { const b = profile.bond, id = profile.horse, before =bondLevel(b[id]); b[id] = (b[id] || 0) + 1; saveProfile(); M.bondUp = bondLevel(b[id]) > before; }
  flagmen.raise(); judges.drop();      // flags up for this course; the judges' flags are down
  if (first) { player.setPose(-START_Z, 1); if (M.practice) opp.setSide(1); else opp.setPose(START_Z, -1); }
  else { player.fresh(); opp.fresh(); if (M.practice) opp.setSide(dirP()); }
  NET.rdyOut = NET.rdyIn = -1; NET.rGuardAge = 9;
  if (M.practice) { C.oL.done = true; C.oL.res = { zone: 'none', pts: 0, code: 'm', text: 'the quintain stands ready' }; }
  player.root.position.x = -dirP() * C.lat; player.lance.visible = true;
  if (!M.practice) { opp.raiseT = 0; opp.visorUp = !!opp.visor; }      // he waits with his visor up until he raises his lance
  if (first) fx.clear();
  // a Drinker may be late this course (his work and his temper's gifts are skipped); everyone else is here
  if (first) { lateMen = {}; lateRolled = false; } else if (!lateRolled) rollLate();      // (normally rolled when you arrived at the end, see rideOut)
  lateRolled = false;
  const rs = restShare(M.courses);       // a long match gives a little more rest between courses (see REST in data.js)
  M.stamina = clamp(M.stamina + REST.stamina + REST.longStamina * rs + crew('rest') + (man('groom') ? man('groom').stamina : 0), 0, 1);
  if (!first) for (const b of [M.bodyS.p, M.bodyS.o]) { b.wind *= PHYS.body.windRest; b.arm *= PHYS.body.armRest; }      // the breath comes back between courses; a jarred arm hardly
  if (!first && M.online) M.hpO.body = clamp(M.hpO.body + REST.body * rs, 0, 1);      // (the friend's body, kept by the host: see strike)
  if (!first) { M.hp.body = clamp(M.hp.body + REST.body * rs, 0, 1); M.agit = clamp(M.agit - crew('calm'), 0, 1); if (man('groom')) M.agit = clamp(M.agit - man('groom').calm, 0, 1); if (man('armourer')) M.hp.body = clamp(M.hp.body + man('armourer').mend, 0, 1); if (man('farrier')) M.hp.horse = clamp(M.hp.horse + man('farrier').heal, 0, 1); player.mend(man('armourer') ? PHYS.damage.mend : 0, man('squire') ? PHYS.damage.squireShield : 0); } M.focus = clamp(M.focus + 0.35 + (sk('nerve') ? SKILLS.nerve.refill : 0) + 0.3 * Math.max(0, M.fav.commons), 0, M.hp.body); M.agit = clamp(M.agit - 0.1, 0, 1);
  S.mode = 'ready'; S.slowT = 0; bobHist.y = bobHist.v = bobHist.a = 0;
  $('banner').classList.add('hidden'); $('hud').classList.remove('hidden'); $('card').classList.add('hidden');
  if (first) $('verdict').classList.add('hidden');
  const extra = M.course > M.courses;
  if (first && !M.practice && !G.auto) startHelmBeat();      // the helm is fitted before the lances go up
  // now and then the squire mutters where a bold knight might look (until he has done it once; at most a few times ever)
  if (!first && !M.practice && !M.hintG && M.course >= 2 && !(profile.stats.ladySeen || []).length && (profile.stats.hintG || 0) < 3 && Math.random() < 0.18) {
    M.hintG = true;
    voice.later(1.6, () => say(pick(['My lord, there are ladies in the gallery who keep looking at you. A bold man might press G and look back.', 'Forgive me, my lord. The ladies are watching. Press G, if you are brave enough to look.']), 'YOUR SQUIRE', 4, { free: true, phases: 'ready', ttl: 6, cat: 'hintG', speaker: speakerOf.man('squire'), onShown() { profile.stats.hintG = (profile.stats.hintG || 0) + 1; saveProfile(); } }));
  }
  // The marshal calls the course (the lesson panel and the HUD prompt already say what to do). The lessons of the circuit come at the verdict (betweenColour).
  if (!M.practice) {
    const ask = () => { if (!herald('courseStart')) say(extra ? 'Level score. One more course.' : M.course === 1 ? 'Raise your lance, then ride on the signal.' : `Course the ${ORD[M.course - 1]}. To your marks.`, 'THE MARSHAL', 2, { phases: 'ready' }); };
    if (first) voice.later(C.beat ? 3.3 : 0.3, ask); else ask();
  }
  if (first && M.circuit) voice.later(3.2, () => teach('teachSalute', 0, { free: true }));      // the one lesson before the first course
  if (M.fav.commons > 0.5) audio.crowd('chant', 0.8);
  C.hp0 = M.hp.body; C.dNote = [];
  field.begin({ heavy: gapHeavy, horseHurt: M.hp.horse < 0.8, cheer() { react('salute', 0, false); } });      // the groom to the bridle, the pursuivant with the banner, and so on
  if (first) retinueSpeak(gapSit, 0.5);      // later courses: your men speak as you ride back to them (rideOut)
  if (M.bondUp) setTimeout(() => toast('BOND', `Your ${player.horseDef.name.toLowerCase()} trusts you more with every course. Bond ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}: steadier and bolder.`), 1500);
  updateHud(true);
}

/** The lances come down to the carry and the course is ridden (your first tap after the signal; online, everyone goes at the signal itself). */
function startCharge() {
  S.mode = 'charge'; C.t = 0; C.cut = null; player.raiseT = 0; if (!M.practice && !S.online) opp.raiseT = 0;
  $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
  if (M.agit > 0.7 && Math.random() < 0.6) { player.rear = 0.01; C.rearT = 0.9; audio.whinny(0, 3); }      // the rear is seen, not told: the charge is silent
}
function spur() {
  if (S.paused || S.mode === 'replay') return;
  if (S.mode === 'ready') {
    const R = C.rd;
    if (C.beat) return;      // the squire is at your helm
    if (player.helmOff) { say('Put your helm on first (H).', 'THE MARSHAL', 2, { prompt: true, phases: 'ready' }); return; }
    if (!R.p) { R.p = true; player.raiseT = 1; if (player.visorUp) toast('VISOR', 'Your visor is up. Press H to close it before you meet.', 5); return; }       // the first W raises the lance
    if (!R.sig) { if (!R.warned && !G.auto) { R.warned = true; say('Wait for the marshal.', 'THE MARSHAL', 2, { prompt: true, phases: 'ready' }); } return; }
    startCharge();
  }
  if (S.mode !== 'charge' || C.pL.done) return;
  audio.spur();
  if (C.tier < 4) { C.tier++; C.maxTier = Math.max(C.maxTier, C.tier); C.flags['t' + C.tier] = true; if (C.tier === 4) C.galT = C.t; C.ev.taps.push([C.t, 0]); return; }
  const ph = player.phase % 1, d = Math.min(ph, 1 - ph), ok = d < (sk('hands') ? SKILLS.hands.window : 0.2);
  C.ev.taps.push([C.t, ok ? 1 : -1]);
  C.collected = clamp(C.collected + (ok ? 0.34 : -0.3), 0, 1);
  if (!ok) M.agit = clamp(M.agit + (sk('hands') ? SKILLS.hands.fret : 0.07), 0, 1);
  const r = $('rhythm'); r.classList.remove('good', 'bad'); void r.offsetWidth; r.classList.add(ok ? 'good' : 'bad');
  clearTimeout(spur._t); spur._t = setTimeout(() => r.classList.remove('good', 'bad'), 260);
}

/** H: raise or lower the visor (bascinet, armet); with a great helm or frog-mouth, take the helm off or put it on, between courses only. */
function toggleVisor() {
  if (!M || !C || !player || S.paused || C.beat || player.unhorsed || !['ready', 'charge', 'after'].includes(S.mode)) return;
  if (player.visor) { player.visorUp = !player.visorUp; return; }
  const name = player.armourDef.helm === 'frogmouth' ? 'A frog-mouth' : 'A great helm';
  if (S.mode !== 'ready') { callout(`${name} has no visor — take it off between courses`, 'bad'); return; }
  player.helmOff = !player.helmOff;
  callout(player.helmOff ? 'YOUR SQUIRE TAKES YOUR HELM' : 'HELM ON', 'good');
}

/** The Spur (a learned skill): once in a course, a few strides of extra pace at the gallop, paid for in the horse's wind. */
function burst() {
  const B = sk('burst');
  if (!B || S.paused || S.mode !== 'charge' || !C || C.pL.done || C.burstUsed || C.tier < 4 || M.stamina < B.stamina) return false;
  C.burstUsed = true; C.burstT = B.time; M.stamina -= B.stamina; C.flags.burst = true;
  audio.spur(); audio.snort(0);      // heard, not told: the charge is silent
  return true;
}

const OTS = 1.5;      // seconds of the over-the-shoulder shot that opens each gesture (your knight from behind, looking the way he addresses), before the reaction shot
/** Between courses: one gesture, with its own camera cut and its own price. */
function interlude(n) {
  if (!C || S.mode !== 'ready' || C.act || C.beat || M.practice || C.rd.p) return;
  C.act = n;
  if (n === 1) { C.saluted = true; C.saluteT = 1.2; react('salute', 1); world.setRoyalMood('applaud'); C.cut = { kind: 'royal', t: 2.4 + OTS, ots: OTS }; }
  else if (n === 2) { C.saluteT = 1.2; react('rouse', 1); M.agit = clamp(M.agit + (1 - player.horseDef.nerve) * 0.2, 0, 1); C.cut = { kind: 'commons', t: 2.4 + OTS, ots: OTS }; }
  else if (n === 3) { react('taunt', 1, false); C.o.rattled = 1.2; C.cut = { kind: 'opp', t: 2.2 + OTS, ots: OTS }; say('You level your lance. He will ride angry.', 'THE COMMONS', 2, { prompt: true, phases: 'ready' }); }
  else if (n === 4) { M.agit = clamp(M.agit - 0.3, 0, 1); M.stamina = clamp(M.stamina + 0.12, 0, 1); audio.snort(0); C.cut = { kind: 'horse', t: 2.0 + OTS, ots: OTS }; say('You steady your horse with a quiet word.', 'THE GROOM', 2, { prompt: true, phases: 'ready' }); }
}

// ---- Easter egg: catch a lady's eye (key G, between courses, once a match). The camera cuts to a lady in the stands and she answers; the effects are tiny and
// never a punishment for skipping it: a smile adds a little court favour and her ribbon on your lance, a laugh does nothing, a glaring kinsman frets the horse a touch.
const LADY = {
  smile: { who: 'A LADY OF THE GALLERY', lines: ['Carry this for me, sir knight.', 'Ride well, and come back to me whole.', 'A sleeve is a small thing. Do not lose it.'], note: 'She drops her sleeve to you. The gallery sighs.' },
  laugh: { who: 'A LADY OF THE GALLERY', lines: ['Oh, do go and joust, sir. Your horse is waiting.', 'You are very brave, sir, and a little silly.', 'Not today, sir. Perhaps after a victory.'], note: 'She laughs behind her hand and turns away.' },
  glare: { who: 'HER BROTHER', lines: ['That is my sister, sir. Eyes on the lists!', 'Keep your looks for your opponent, knight.', 'Turn about, sir, or I will have words with you.'], note: 'Her brother is on his feet. Your horse shifts under you.' },
};
const _lady = new THREE.Vector3();      // where the speaking figure sits, for the label
function ladyEye() {
  if (!C || !M || M.practice || M.result || S.mode !== 'ready' || S.paused || C.act || C.beat || C.rd.p || M.ladyDone || !world.crowd || !world.crowd.ladies) return;
  const sd = player.dir > 0 ? 1 : -1;
  // between courses you are at the end of the lists, far from the gallery: take the nearest ladies wherever they sit (either side)
  let near = world.crowd.ladies(sd, player.z, 14); if (!near.length) near = world.crowd.ladies(sd, player.z, 90); if (!near.length) near = world.crowd.ladies(-sd, player.z, 90);
  if (!near.length) return;
  let kind = pick(['smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'smile', 'laugh', 'laugh', 'laugh', 'laugh', 'laugh', 'laugh', 'laugh', 'glare', 'glare', 'glare', 'glare']);      // 45 / 35 / 20
  let L = pick(near);
  if (kind === 'glare') { const kin = near.filter(n => n.kin >= 0); if (kin.length) L = pick(kin); else kind = 'laugh'; }
  M.ladyDone = true; C.act = 7;
  world.crowd.spotlight(L.i, kind === 'glare' ? L.kin : -1, kind);
  const q = kind === 'glare' ? { x: L.kx, y: L.ky, z: L.kz } : L;
  C.cut = { kind: 'lady', t: 3.8 + OTS, ots: OTS, pos: new THREE.Vector3(q.x, q.y + 1.15, q.z) };
  _lady.copy(C.cut.pos);
  const E = LADY[kind];
  if (kind === 'smile') { M.fav.court = clamp(M.fav.court + 0.05, -1, 1); player.ribbon.visible = true; }
  else if (kind === 'glare') { M.agit = clamp(M.agit + 0.05, 0, 1); M.fav.commons = clamp(M.fav.commons - 0.03, -1, 1); }
  M.favour = (M.fav.commons + M.fav.court) / 2;
  say(pick(E.lines), E.who, 2, { prompt: true, free: true, phases: 'ready', ttl: 12, delay: 0.5 + OTS, cat: 'lady', speaker: () => _lady });
  say(E.note, 'THE GALLERY', 3, { free: true, phases: 'ready', ttl: 12, delay: 9 + OTS, cat: 'lady' });   // after her own line, not queued behind it
  withFeats(() => ladyFeat(profile, kind)); saveProfile();
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _tip = new THREE.Vector3(), _rel = new THREE.Vector3(), _p = new THREE.Vector3(), _zc = new THREE.Vector3();
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(0.12, 0.05); const keys = {};
let focusHeld = false;
const arm = new LanceArm();          // your lance arm
const aimMouse = new THREE.Vector2(0.12, 0.05);
const bobHist = { y: 0, v: 0, a: 0 };  // vertical motion of your saddle, for the lance to feel

/** How hard the horse's motion and your own state throw the lance about (multiplier on the arm physics). */
function armScale() {
  return (0.85 + 0.15 * player.armourDef.weight) * LANCES[profile.lance || 'standard'].sway * DIFFICULTY[profile.difficulty ?? 1].sway * (1 + (sk('shield') ? SKILLS.shield.sway : 0.35) * player.guard) * (1.25 - 0.25 * M.hp.body) * (sk('arm') ? SKILLS.arm.sway : 1) * (1 + PHYS.damage.helmWobble * player.dmg.helm);      // a dented helm adds a slight wobble to the aim
}

const _qa = new THREE.Quaternion();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _t1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _cA = new THREE.Vector3(), _cB = new THREE.Vector3();
/** Closest points of two segments p1-q1 and p2-q2, written to outA and outB. Returns the distance between them. */
function segSeg(p1, q1, p2, q2, outA, outB) {
  const d1 = _s1.subVectors(q1, p1), d2 = _s2.subVectors(q2, p2), r = _s3.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  outA.copy(p1).addScaledVector(d1, s); outB.copy(p2).addScaledVector(d2, t);
  return outA.distanceTo(outB);
}
/** The two lances touching before either lands: each is knocked off its line, the lighter lance and the faster meeting the more. */
function lancesCross(D, gap) {
  if (M.practice || C.crossed || C.pL.done || C.oL.done || player.lanceLower < 0.9 || opp.lanceLower < 0.9 || gap > 7 || gap < 0.3) return;
  player.gripWorld(_g1); player.tipWorld(_t1); opp.gripWorld(_g2); opp.tipWorld(_t2);
  if (segSeg(_g1, _t1, _g2, _t2, _cA, _cB) > 0.085) return;
  C.crossed = true;
  if (_cA.distanceTo(_t1) < 0.35 && _cB.distanceTo(_t2) < 0.35) { C.coronel = true; callout('CORONEL TO CORONEL', 'good'); }
  const n = _cA.sub(_cB); if (n.lengthSq() < 1e-6) n.set(0, 1, 0); n.normalize();          // from his shaft to yours
  const K = clamp((player.speed + opp.speed) * 0.07, 0.35, 1.3), mine = Math.sqrt(PHYS.lanceArm.refKg / PHYS.lance[profile.lance || 'standard'].kg);
  arm.vy += D * n.x * K * mine; arm.vp += n.y * K * mine;                                   // a kick to your lance arm (rad/s); the arm's own spring brings it back
  C.o.knock.set(-n.x * 0.32 * K, -n.y * 0.32 * K);                                          // and his point is thrown the other way (metres at the mark)
  fxSparks(_cB.clone(), 6, 2.5); audio.impact(0.35, 'glance', hear(_cB)[0]);
}

/**
 * The lance is solid along its whole length. Jouster._clearHorse keeps the shaft out of the other man and his horse and says how far it
 * had to be pushed; here that push becomes a blow. A light push is the shaft brushing past him. A hard one at speed means the lance has
 * been driven across his body instead of on to its point: it breaks across him, which no rule set counts (Castile's statutes say so in
 * as many words), and both men feel it. At a walk it is simply shoved up and aside.
 */
function shaftBlow(Aj, Bj, st, isP) {
  Aj.pointFree = !st.done;
  const h = Aj.shaftHit, SH = PHYS.shaft;
  if (!h || !Bj.root || C.shaftDone?.[isP ? 0 : 1]) return;
  if (!C.shaftDone) C.shaftDone = [false, false];
  const closing = Math.abs(Aj.speed + Bj.speed), _w = Aj.lance.localToWorld(_s1.set(0, 0, h.at));
  if (h.defl > SH.across && closing > SH.acrossSpeed && !Aj.lanceBroken) {
    C.shaftDone[isP ? 0 : 1] = true;
    const seg = Aj.breakLance(h.at), vel = new THREE.Vector3(0, 0, Aj.dir * Aj.speed * 0.6);
    if (S.online && NET.host) (C.nfx || (C.nfx = {}))[isP ? 'p' : 'o'] = { across: 1, bk: seg ? seg.at : 0, hz: h.name === 'helm' ? 'helm' : 'body', hs: h.name === 'horse' ? 1 : 0 };
    if (seg) { fxSplinters(seg.a, seg.b, vel, 18); fxShaft(seg.a, seg.b, vel); }
    const [d, pan] = hear(_w); audio.lanceBreak(0.45, d); audio.impact(0.5, h.name === 'horse' ? 'horse' : 'body', d);
    Bj.hit(1.3, true, { zone: h.name === 'helm' ? 'helm' : 'body', lat: 0.5 }); S.shake = Math.max(S.shake, 0.3);
    if (isP) { arm.vy -= dirP() * 1.4; arm.vp += 0.6; } else C.o.knock.set(0.15, 0.1);
    if (h.name === 'horse' && Bj.horse !== undefined) Bj.speed *= 0.9;
    if (!st.done) {
      st.done = true; st.res = { zone: 'miss', pts: 0, code: 'm', across: true, text: 'broke his lance across his man, not with the point: it counts for nothing' };
      M.stats[isP ? 0 : 1].miss++; if (isP) C.tech = techSnapshot(null, 0);
    }
    callout(isP ? 'YOUR LANCE BROKE ACROSS HIM — IT COUNTS FOR NOTHING' : 'HIS LANCE BROKE ACROSS YOU', isP ? 'bad' : 'good', CALL.across);      // the rule is in the verdict panel
  } else if (h.defl > SH.across && !Aj.lanceBroken) {
    // too slow to break it: the shaft is shoved up and out of the way
    if (isP) C.kickUp = Math.max(C.kickUp || 0, 0.5); else Aj.lanceLower = Math.min(Aj.lanceLower, 0.5);
  } else if (h.defl > SH.brush && !C.brushed?.[isP ? 0 : 1]) {
    if (!C.brushed) C.brushed = [false, false]; C.brushed[isP ? 0 : 1] = true;
    audio.impact(0.18, 'glance', hear(_w)[0]); fxSparks(_w.clone(), 3, 1.5);
    Bj.hit(0.4, true, { zone: 'body', lat: 0.3 });
    if (isP) { arm.vy -= dirP() * 0.35; } else C.o.knock.x += 0.05;
  }
}

// ---- Riding back by hand (the player only; the opponent keeps the scripted ride in rideOut).
// After your stroke the horse is yours: W/S change the gait, A/D steer (the tighter the slower), and there is no automatic turn. A ring on the ground (the mark, in
// retinue_field.js) shows where to stop, facing down the lists. Inside it, at a walk or less and roughly square, you are at your mark: the horse settles, the course can
// begin, and a broken lance is handed to the squire (F) or thrown down (hold T). The scripted ride-back stays as the "Ride back: auto" assist and for the autopilot.
const MARK_R = 2.0, OVER_HERE = ['Sir, over here!', 'My lord, over here!', 'Here, sir! Over here!'], NAG = ['Sir knight, the lists are waiting. To your mark.', 'The court grows restless, sir. Take your mark.', 'Come, sir. The next course waits on you.'];
const _sq = new THREE.Vector3(), wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** True when the scripted ride-back should run: always, unless the menu setting says by hand. */
function autoRide() {
  if (G.auto || touchMode) return true;      // touch: no horse steering, the scripted ride-back
  return profile.autoRide !== false;      // the horse takes you back unless you chose to ride back by hand (Danilo, 15 Nov: auto is the default)
}
/** Turn rate (rad/s) of the horse at speed v: nearly on the spot when halted, tight at a walk, wide at a canter. */
function turnRate(v) { return 0.9 * (1 - smoothstep(0, 2.5, v)) + v / lerp(1.6, 14, smoothstep(1.5, 9, v)); }
function rideBackStart(j, T) {
  const d = j.dir;
  C.rb = { mk: { x: d * LANE_X, z: d * START_Z, th: d > 0 ? Math.PI : 0 }, th: d > 0 ? 0 : Math.PI, sv: 0, rt: j.speed > 5.2 ? 3 : j.speed > 3 ? 2 : j.speed > 1 ? 1 : 0, reinT: 0.2, dwell: 0, t: 0, away: 0, callT: 0, calls: 0,
    side: Math.sign(j.root.position.x) || -d, nag: 0, hT: 0, tHold: 0, handed: false, gl: 0, onMark: false, nearSq: false };
  T.stage = 'free'; j.manualPos = true; j.root.rotation.set(0, C.rb.th, 0);
}
/** The lance is given up: how = 'hand' (to the squire's hands) or 'throw' (down on the grass, and he fetches it). A fresh one follows either way. */
function handLance(how) {
  const B = C && C.rb, T = C && C.turn.p, j = player;
  if (!B || B.handed || !j.lanceBroken || S.mode !== 'after' || M.result) return;
  const atMark = T.stage === 'hand';
  if (!atMark && !(T.stage === 'free' && B.nearSq)) return;
  B.handed = true;
  const swap = () => { j.lance.visible = true; if (j.lanceBroken) { j._mendLance(); j.lanceLower = 0; audio.ui('click'); if (!C.retSpoke) say('A fresh lance, my lord.', 'YOUR SQUIRE', 4, { cat: 'squire' }); } };
  const took = () => { j.lanceStump.visible = false; if (j.lanceKept) j.lanceKept.visible = false; };
  j.lance.visible = true;
  if (how === 'throw') { took(); field.throwStump('you'); audio.ui('click'); if (!field.serve(true, swap, 'you')) swap(); }      // down it goes at once; he fetches it
  else if (!field.serve(true, swap, 'you', 'hand', took)) { took(); swap(); }      // it leaves your hand when he takes hold
  if (atMark) T.stage = 'done';
}
function rideBack(j, T, dt) {
  const B = C.rb, mk = B.mk, d = j.dir; B.t += dt;
  let x = j.root.position.x, z = j.root.position.z;
  if (T.stage === 'free') {
    if (keys.rein) { B.reinT += dt; if (B.reinT > 0.28) { B.reinT = 0; B.rt = Math.max(0, B.rt - 1); } } else B.reinT = 0.2;
    const tgt = GAIT_SPEED[B.rt];
    j.speed = j.speed < tgt ? Math.min(tgt, j.speed + 2.6 * dt) : Math.max(tgt, j.speed - 3.6 * dt);
    B.sv = damp(B.sv, (keys.left ? 1 : 0) - (keys.right ? 1 : 0), 7, dt);      // A = left (the same side as the tilt when you face down the lists)
    B.th = wrapA(B.th + B.sv * turnRate(j.speed) * dt);
    x += Math.sin(B.th) * j.speed * dt; z += Math.cos(B.th) * j.speed * dt;
    // soft walls: the fences, your own half of the lists, and the tilt (you go round its end)
    let hit = false;
    if (x > 7) { x = 7; hit = true; } else if (x < -7) { x = -7; hit = true; }
    if (z * d > 47.5) { z = d * 47.5; hit = true; } else if (z * d < -3) { z = -3 * d; hit = true; }
    if (M.mode.tilt && Math.abs(z) < LIST_HALF + 0.3) { if (Math.abs(x) >= 0.7) B.side = Math.sign(x); else { x = B.side * 0.7; hit = true; } }
    if (hit) j.speed = Math.max(0, j.speed - 5 * dt);
    j.root.position.set(x, 0, z); j.root.rotation.set(0, B.th, 0);
    const dist = Math.hypot(mk.x - x, mk.z - z), herr = Math.abs(wrapA(B.th - mk.th));
    B.onMark = dist < MARK_R && j.speed < 2.4 && herr < 0.8;      // within ~45 degrees of facing the lists
    B.dwell = B.onMark ? B.dwell + dt : 0;
    if (B.dwell > 0.45) { T.stage = 'settle'; B.gl = 0; B.rt = 0; if (!B.calls) { profile.stats.markHits = (profile.stats.markHits || 0) + 1; withFeats(() => checkFeats(profile)); saveProfile(); } }      // at your mark, unaided
    // the squire calls you in until you know your mark
    const knows = !!(profile.achievements && profile.achievements.knowsmark), bearing = Math.atan2(mk.x - x, mk.z - z);
    B.away = dist < 8 || Math.abs(wrapA(bearing - B.th)) < 1.05 ? 0 : B.away + dt; B.callT -= dt;
    if (!knows && B.away > 2.5 && B.callT <= 0 && field.where('squire', _sq)) { B.callT = 8; B.calls++; field.wave(); say(pick(OVER_HERE), 'YOUR SQUIRE', 4, { free: true, phases: 'after', ttl: 3, speak: true, speaker: speakerOf.man('squire'), voice: 'squire', cat: 'overhere' }); }
    if (B.t - B.nag > 25 && !M.practice) { B.nag = B.t; say(pick(NAG), 'THE MARSHAL', 2, { prompt: true, phases: 'after' }); }
    const sp = field.where('squire', _sq); B.nearSq = !!sp && j.lanceBroken && !B.handed && Math.hypot(sp.x - x, sp.z - z) < 4.2;
  } else if (T.stage === 'settle') {
    B.gl += dt; const k = Math.exp(-6 * dt);
    B.th = wrapA(mk.th + wrapA(B.th - mk.th) * k); x = mk.x + (x - mk.x) * k; z = mk.z + (z - mk.z) * k; j.speed = damp(j.speed, 0, 5, dt);
    j.root.position.set(x, 0, z); j.root.rotation.set(0, B.th, 0);
    if (B.gl > 0.7) {      // settled: face the lists, and the hand-off begins
      j.face(-d); j.root.position.set(-j.dir * j.lane, 0, d * START_Z); j.manualPos = false; j.speed = 0; T.stage = 'hand'; B.hT = 0; rollLate(); j.lance.visible = true;
      if (!j.lanceBroken || B.handed) { T.stage = 'done'; if (!j.lanceBroken) field.serve(false, null, 'you'); }      // a whole lance is kept; a lance handed on the way needs nothing more
      if (!C.retSpoke && !M.result) { C.retSpoke = true; retinueSpeak(retSituation(C), 0.6, 0.6); }
    }
  } else if (T.stage === 'hand') {
    B.hT += dt; if (B.hT > 6) handLance('hand');      // you did nothing: he takes it anyway
  }
  if (T.stage === 'hand' || B.nearSq) { B.tHold = keys.throw ? B.tHold + dt : 0; if (B.tHold > 0.45) handLance('throw'); } else B.tHold = 0;
}

/** After the pass: ride on to the end of the lists, wheel about onto the other side of the tilt, and stand ready.
 *  A small kinematic driver (position, heading, speed) with the same steering physics as the manual ride-back (turnRate): the gait eases canter, trot, walk; the horse drifts
 *  out from the tilt, swings round at a walk (radius set by the speed, so it is never a perfect ellipse) and is steered onto the mark; the last few centimetres are blended. */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Walking speed at which the turning circle has radius R (turnRate is monotone enough over this range for a bisection). */
const RIDE_TURN = 1.35;      // the scripted ride-out wheels this much faster than the stick would (a horse turns on its haunches when it is brought round, and the course should not wait on it)
function speedForRadius(R) { let lo = 1.2, hi = 4.5; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (m / (RIDE_TURN * turnRate(m)) < R) lo = m; else hi = m; } return (lo + hi) / 2; }
function rideInit(j, T) {
  const d = j.dir, r = mulberry((Math.random() * 4294967296) >>> 0);
  T.d = d; T.base = d > 0 ? 0 : Math.PI; T.ph = wrapA(j.root.rotation.y - T.base); T.sv = 0; T.yr = 0; T.rz = j.root.rotation.z; T.t = 0; T.tt = 0; T.sub = 'run'; T.init = true;
  T.wOut = Math.min(d * j.root.position.x, -(2.9 + r() * 1.5));      // how far out from the tilt he drifts (local frame: w = d*x, u = d*z, tilt at w = 0)
  T.uTurn = 35.4 + r() * 1.6; T.rK = 0.9 + r() * 0.25; T.vWalk = 1.7 + r() * 0.5; T.drift = 0.8 + r() * 0.5;
  j.manualPos = true;
}
function rideOut(j, T, dt) {
  if (j.unhorsed || !j.root || j === opp && M.practice) { T.stage = 'done'; return; }
  if (j === player && (T.stage === 'free' || T.stage === 'settle' || T.stage === 'hand')) return rideBack(j, T, dt);
  if (T.stage === 'run' || T.stage === 'turn') {
    if (j === player && T.stage === 'run' && C.replayed && !M.result && !autoRide()) { rideBackStart(j, T); return rideBack(j, T, dt); }      // your horse is yours again
    if (!T.init) rideInit(j, T);
    const d = T.d, r = j.root, mw = j.lane, mu = START_Z; T.t += dt;
    let w = d * r.position.x, u = d * r.position.z, v = j.speed, svT = 0, vT, acc = 2.6, dec = 2.8;
    if (T.sub === 'run' && (u >= T.uTurn || T.t > 14)) {      // wheel round: the speed chosen so the turning circle just reaches the far side of the tilt
      T.sub = 'turn'; const Rn = Math.max(1.4, (mw - w) / 2 * T.rK * 0.95); T.vTurn = clamp(speedForRadius(Rn), 1.6, 3.8);
    }
    if (T.sub === 'run') {
      vT = u < 24 ? 11.5 : lerp(9.5, T.vWalk + 1.4, smoothstep(T.uTurn - 11, T.uTurn - 1, u));      // on at a canter, then eased down over the last dozen metres to the pace of the turn
      dec = 5.5; acc = 4.2;
      // drift out from the tilt, slowly, once the pass is behind him
      const he = clamp(-(w - T.wOut) * 0.3 * smoothstep(3, 18, u), -0.24, 0.1) * T.drift - T.ph;
      svT = clamp(he * 1.6, -1, 1);
    } else if (T.sub === 'turn') {
      T.tT = (T.tT || 0) + dt;
      if (T.ph < Math.PI - 0.55 && !T.lined && T.tT < 5) { vT = T.vTurn; svT = 1; }      // commit to the turn, round to the right (across the tilt's end)
      else {
        T.lined = true;      // lined up on the lane out from the mark: he heads back down it, steering out the lateral error gently, and walks onto the mark
        const du = u - mu, hd = Math.PI - clamp(0.9 * (mw - w), -0.6, 0.6);
        svT = clamp(wrapA(hd - T.ph) * 1.8, -1, 1);
        vT = clamp(Math.min(T.vWalk, 0.5 + 0.9 * Math.max(du, 0)), 0, 2.6);
        // arrival: the tolerance grows with the time spent in the turn, and after 7 s (or if he has walked past the mark) he is blended on regardless, so it always ends
        const grow = Math.max(0, T.tT - 3.5);
        if (du < 0.6 + grow * 0.6 && v < 1.0 + grow * 0.5 && Math.abs(w - mw) < 0.45 + grow * 0.5 && Math.abs(wrapA(T.ph - Math.PI)) < 0.2 + grow * 0.25 || T.tT > 7 || du < -0.8 || T.t > 20) {
          T.sub = 'blend'; T.tt = 0; T.b0 = [r.position.x, r.position.z, T.ph, r.rotation.z]; T.bd = clamp(0.4 + 0.3 * Math.hypot(r.position.x - d * mw, r.position.z - d * mu), 0.5, 2.2); rideService(j, T);
        }
      }
      if (u > 46.4 && svT < 0.4) svT = 0.4;
    }
    if (T.sub === 'blend') {
      T.tt += dt; const k = smoothstep(0, 1, T.tt / T.bd), fx = d * mw, fz = d * mu, fph = Math.PI;
      const nx = lerp(T.b0[0], fx, k), nz = lerp(T.b0[1], fz, k), px = r.position.x, pz = r.position.z;
      T.ph = lerp(T.b0[2], T.b0[2] + wrapA(fph - T.b0[2]), k); j.speed = damp(j.speed, Math.min(1.2, Math.hypot(nx - px, nz - pz) / Math.max(dt, 1e-4) * 1.1), 16, dt);
      r.position.x = nx; r.position.z = nz; r.rotation.set(0, T.base + T.ph, lerp(T.b0[3], 0, k));
      if (T.tt < T.bd) return;
      return rideArrive(j, T);
    }
    // gait: speed follows the target with ease in, ease out
    v = v < vT ? Math.min(vT, v + acc * dt) : Math.max(vT, v - dec * dt); j.speed = v;
    // steering: the stick value is damped, the yaw rate follows it with its own lag (no sudden angular velocity)
    T.sv = damp(T.sv, svT, 4.5, dt); const yrT = T.sv * turnRate(v) * RIDE_TURN; T.yr = damp(T.yr, yrT, 7, dt); T.ph += T.yr * dt;
    w += Math.sin(T.ph) * v * dt; u += Math.cos(T.ph) * v * dt;
    if (Math.abs(w) > 6.6) { w = Math.sign(w) * 6.6; }
    r.position.x = d * w; r.position.z = d * u; r.rotation.y = T.base + T.ph;
    T.rz = damp(T.rz, -clamp(0.03 * v * T.yr, -0.09, 0.09), 5, dt); r.rotation.z = T.rz;      // banks into the turn (a positive yaw rate is a left turn: roll to the left is negative)
  } else j.speed = Math.max(0, j.speed - 4 * dt);
}
function rideArrive(j, T) {
  const d = T.d;
  j.face(-d); j.root.position.set(-j.dir * j.lane, 0, d * START_Z); j.manualPos = false; j.speed = 0; T.stage = 'done';
  rideService(j, T);
}
/** The squire's service: begun as the rider comes on to his mark (while he settles the last few metres), so that the next course need not wait for it.
 *  Broken: he throws the stump down beside his horse; his squire walks up, hands a fresh lance (the swap happens as it reaches his hand), then fetches the stump. Whole: he keeps it. */
function rideService(j, T) {
  if (T.served) return; T.served = true;
  if (M.result) return;      // the match ended under the ride: just stand there
  const broken = j.lanceBroken, isP = j === player, who = isP ? 'you' : 'opp';
  const swap = () => { j.lance.visible = true; if (j.lanceBroken) { j._mendLance(); j.lanceLower = 0; if (isP) { audio.ui('click'); if (!C.retSpoke) say('A fresh lance, my lord.', 'YOUR SQUIRE', 4, { cat: 'squire' }); } } };
  if (isP) rollLate();
  j.lance.visible = true;
  if (broken) { j.lanceStump.visible = false; if (j.lanceKept) j.lanceKept.visible = false; field.throwStump(who); if (isP) audio.ui('click'); if (!field.serve(true, swap, who)) swap(); } else field.serve(false, null, who);
  if (isP && !C.retSpoke && !M.result) { C.retSpoke = true; retinueSpeak(retSituation(C), 0.6, 0.6); }
}

/** The marshal's hold and horns, from the plan; true when it is time to give the signal. (C.rd is the course's raise state.) */
function signalStep(Pl, u) {
  if (Pl.hold && !Pl.saidHold) { Pl.saidHold = true; say('Hold… not yet.', 'THE MARSHAL', 2, { key: 'hold', phases: 'ready', ttl: 3 }); }      // the flags stay up
  if (Pl.horns && !Pl.hornsUp) { Pl.hornsUp = true; ceremony.blowLine(Pl.hold + 3.4); }
  if (Pl.horns && !Pl.blown && u >= Pl.hold) { Pl.blown = true; fanfare('start'); }      // the horns sound a moment before the flags drop
  return u >= Pl.hold + (Pl.horns ? 1.5 : 0);
}
/** The go: the shout, a horn, the flags down and a roar from the stands. */
function giveSignal(Pl) {
  C.rd.sig = true; say('Laissez-les aller!', 'THE MARSHAL', 2, { key: 'signal', urgent: true, prompt: true, phases: 'ready', ttl: 3 });
  if (!Pl.horns) fanfare('short'); flagmen.sweep(); audio.crowd('cheer', 0.55 + 0.1 * Math.min(4, M.course));
}

function updateRide(dt, dtReal) {
  const H = player.horseDef, A = player.armourDef, D = dirP();
  const gap = gapNow();
  C.t += dt;
  const live = S.mode === 'charge' && !C.pL.done;
  const after = S.mode === 'after';

  // ---------------- your horse: tap to climb the gaits, rhythm at the gallop, rein to slow
  if (G.auto && S.mode === 'charge') autoPilot(gap); else if (G.auto && S.mode === 'after' && G.autoKeepLow !== true) C.couchHeld = false;
  else if (touchMode && !G.auto) C.couchHeld = S.mode === 'charge' && gap < 36 && !C.pL.done;      // touch: the lance lowers by itself, and rises the moment the stroke is done (the quick-raise credit)
  if (live && keys.rein) { C.reinT += dtReal; if (C.reinT > 0.28) { C.reinT = 0; C.tier = Math.max(0, C.tier - 1); if (gap < 28 && C.tier < 3) C.checked = true; } } else C.reinT = 0.2;
  if (after && (!M.result || C.turn.p.init && C.turn.p.stage === 'run')) rideOut(player, C.turn.p, dt);      // (once begun, the ride-out is finished even if the match ends under it)
  else {
    let target;
    if (after || C.pL.done) target = player.z * D > START_Z - 5 ? 0 : M.practice && C.hitT !== null && C.t - C.hitT < 1.3 ? player.speed : 4.5;
    else if (S.mode === 'ready') target = 0;
    else target = C.tier < 4 ? GAIT_SPEED[C.tier] : H.top * (0.9 + 0.1 * C.collected) * (0.82 + 0.18 * M.hp.horse) * (C.burstT > 0 ? SKILLS.burst.speed : 1);
    if (C.burstT > 0) C.burstT -= dt;
    if (C.rearT > 0) { C.rearT -= dt; target = 0; player.rear = damp(player.rear, C.rearT > 0.3 ? 1 : 0, 6, dt); } else player.rear = damp(player.rear, 0, 8, dt);
    const acc = H.accel / Math.sqrt(A.weight) * (C.burstT > 0 ? SKILLS.burst.accel : 1);
    if (player.speed < target) player.speed = Math.min(target, player.speed + acc * (0.55 + 0.45 * smoothstep(0, 4, player.speed + 1.5)) * dt);
    else player.speed = Math.max(target, player.speed - (S.mode === 'charge' ? 5.5 : 3.2) * dt);
  }
  if (S.mode === 'charge') {
    if (C.tier === 4 && !C.pL.done) {
      M.stamina -= dt * (0.105 / H.stamina) * (1 - 0.5 * C.collected) * (sk('hands') ? SKILLS.hands.stamina : 1);
      if (M.stamina <= 0) { M.stamina = 0; C.tier = 3; M.hp.horse = Math.max(0.15, M.hp.horse - 0.06); }      // the stamina bar and the slowing horse tell it
    }
    C.collected = Math.max(0, C.collected - dt * 0.11);
  }
  // lateral: steer + shying
  if (live) {
    let steer = ((keys.left ? -1 : 0) + (keys.right ? 1 : 0)) * (M.kit.blind ? PHYS.kit.blindSteer : 1);
    if (touchMode && !G.auto) steer = clamp(-(C.lat - LANE_X) * 1.2 - C.latV * 0.4, -1, 1) * 0.85 * (M.kit.blind ? PHYS.kit.blindSteer : 1);      // phone: no reins, so the rider keeps his own line (a fretful horse still wavers)          // left = toward the tilt; a blinkered horse keeps his line and is slow to be turned
    // a fretful horse (agit > swayAt) sways about his lane, both ways and centred: his position is a slow sine pair that starts at the lane, so he never pulls one way (a blinkered horse cannot)
    const swayA = M.kit.blind ? 0 : clamp((M.agit - PHYS.kit.swayAt) / (1 - PHYS.kit.swayAt), 0, 1) * PHYS.kit.swayMax * clamp(player.speed / 5, 0, 1);
    C.swayT = (C.swayT || 0) + dt; if (C.swayDir === undefined) { C.swayDir = Math.random() < 0.5 ? -1 : 1; C.swayPos = 0; }
    const swayNow = Math.max(-PHYS.kit.swayIn, swayA * C.swayDir * (0.65 * Math.sin(PHYS.kit.swayW1 * C.swayT) + 0.35 * Math.sin(PHYS.kit.swayW2 * C.swayT)));      // toward the tilt it stops short of the barrier: a fretful horse is not a fault of the rider's
    const shy = 0;
    // open eyes: a nervous horse may shy from the oncoming lance in the last strides, once, losing a little pace and veering away
    if (M.kit.shy && S.mode === 'charge' && !C.shyRolled && gap < PHYS.kit.shyGap && gap > 4) {
      C.shyRolled = true;
      if (Math.random() < M.kit.shy * clamp((M.agit - PHYS.kit.shyAt) * PHYS.kit.shyGain, 0, PHYS.kit.shyMax) * (1.3 - player.horseDef.nerve)) { C.latV += PHYS.kit.shyKick; player.speed *= PHYS.kit.shyPace; M.shyN[0]++; callout('YOUR HORSE SHIES', 'bad'); }
    }
    C.latV += (steer * 3.2 + shy) * dt * clamp(player.speed / 5, 0.15, 1);
    C.latV *= Math.exp(-2.4 * dt);
    C.lat += C.latV * dt + (swayNow - C.swayPos); C.swayPos = swayNow;
    if (!touchMode && !G.auto && !M.taught.drift && swayA > 0.02 && Math.abs(C.lat - LANE_X) > PHYS.kit.swayHint && !keys.left && !keys.right) { M.taught.drift = true; callout('YOUR HORSE IS FRETFUL · STEER WITH A / D', 'bad'); }      // the nervous horse's sway is a mechanic: say how to answer it, once a match, only when it is large
    if (C.lat < 0.7 && !M.mode.tilt) { C.lat = 0.7; C.latV = Math.max(C.latV, 0.4); }       // open field: nothing to strike, the horses simply will not close further
    else if (C.lat < 0.7) {
      C.lat = 0.7; C.latV = 0.9; player.speed *= 0.93;
      player.gripWorld(_a); _a.x = -D * 0.1; _a.y = 1.2; fx.sparks(_a, 8, 3); fx.dust(_a, 4, 0.4, 1, 0.4);
      if (!C.tiltStruck) { C.tiltStruck = true; M.hp.horse = Math.max(0.15, M.hp.horse - 0.08); audio.impact(0.5, 'glance'); react('tilt', 1); M.tilts++; C.tiltPts = M.mode.tiltPts[Math.min(M.tilts, M.mode.tiltPts.length) - 1]; if (S.online && !NET.host) netSend({ t: 'tilt', n: M.course, p: C.tiltPts, k: M.tilts }); callout(M.tilts >= M.mode.tiltOut ? 'YOU HIT THE BARRIER AGAIN — THE PRIZE IS LOST' : `YOU HIT THE BARRIER &nbsp;−${-C.tiltPts}`, 'bad'); /* spoken in the combined result call */ }
    }
    C.lat = Math.min(C.lat, 3.2);
  } else C.latV *= Math.exp(-3 * dt);
  if (!player.manualPos && C.turn.p.stage !== 'done' && C.turn.p.stage !== 'hand') {
    player.root.position.x = -D * C.lat;
    player.root.rotation.y = (D > 0 ? 0 : Math.PI) - Math.atan2(C.latV, Math.max(player.speed, 3)) * 0.9;
    player.root.rotation.z = damp(player.root.rotation.z, D * clamp(C.latV * 0.09, -0.12, 0.12) * clamp(player.speed / 8, 0, 1), 6, dt);
  }

  // ---------------- lance, seat, shield, glance over the shoulder
  if (live) {
    if (C.couchHeld && C.couch === 0) C.ev.couch = C.t; else if (!C.couchHeld && C.couch === 0) C.ev.couch = null;
    C.couch = clamp(C.couch + (C.couchHeld ? dt / (0.85 * (1 + PHYS.body.armCouch * M.bodyS.p.arm)) : -dt / 0.55), 0, 1);      // a jarred arm brings the lance down slower
    if (C.couch > 0.5) C.flags.couch = true;
    C.setT = C.couch >= 0.999 ? C.setT + dt : 0;
    if (C.setT > 0.25) C.flags.set = true;
    C.fatigue = clamp(C.fatigue + (C.couch > 0.6 ? (C.setT > 2.4 * (sk('arm') ? SKILLS.arm.hold : 1) / lanceOf(true).fatigue ? 0.3 * lanceOf(true).fatigue * (M.kit.queue ? PHYS.kit.queueFatigue : 1) * (1 + PHYS.body.armBuild * M.bodyS.p.arm) : 0) : -0.4) * dt, 0, 1);
    player.lanceLower = C.couch;
    C.braceCd -= dt; C.braceT -= dt; C.braceAge += dt; C.guardAge += dt;
    player.brace = damp(player.brace, C.braceT > 0 ? 1 : 0, 14, dt);
  } else {
    player.brace = damp(player.brace, 0, 6, dt);
    if (S.mode === 'ready' && C.saluteT > 0) { C.saluteT -= dt; player.lanceLower = Math.sin(clamp(C.saluteT / 1.2, 0, 1) * Math.PI) * 0.45; }
    else if (S.mode === 'ready') player.lanceLower = damp(player.lanceLower, 0, 2.5, dt);
    else if (C.pL.done) {
      // After your stroke the lance must go up, and it is yours to raise: let go of the couch and it whips upright (film: vertical within a quarter of a second).
      // Ride on with it low and it is marked against you; get it up at once and the gallery sees a rider in command of his lance.
      C.upT = (C.upT ?? 0) + dtReal;      // real seconds: the slowed moment after the shock gives you time to do it
      if (!C.couchHeld && !C.raised) { C.raised = true; if (C.upT < LANCE_UP.quick && !M.practice) { C.flags.recover = true; M.fav.court = clamp(M.fav.court + 0.04, -1, 1); } }
      if (!C.raised && C.upT > LANCE_UP.grace) {
        C.raised = true; C.lanceLow = true;
        if (!M.practice && !M.result) { M.score[0] += M.PT.lanceLow; if (C.pts) C.pts[0] += M.PT.lanceLow; M.fav.court = clamp(M.fav.court - 0.08, -1, 1); updateHud(true); }
        callout(M.practice ? 'RAISE YOUR LANCE AFTER THE STROKE' : 'LANCE LEFT LOW &nbsp;−1', 'bad');
      }
      if (C.raised) player.lanceLower = damp(player.lanceLower, 0, 11, dt);
      else if (C.kickUp) { player.lanceLower = damp(player.lanceLower, 1 - C.kickUp, 26, dt); if (C.upT > 0.3) C.kickUp = 0; }      // thrown up by its own stroke, then it is yours to finish
      else player.lanceLower = damp(player.lanceLower, 1, 6, dt);
    }
  }
  player.guard = damp(player.guard, keys.guard && (live || S.mode === 'ready') ? 1 : 0, (sk('shield') ? SKILLS.shield.rate : 9) * (1 - PHYS.damage.guardSlow * player.dmg.pauldronL), dt);      // a buckled pauldron slows the shield arm
  player.look = damp(player.look, keys.look && S.mode !== 'intro' ? 1 : C.cut && C.cut.kind === 'lady' ? 0.6 : 0, 7, dt);      // (or turned to the gallery, see ladyEye)

  // ---------------- the raise: each rider lifts his lance upright; when both are up the marshal gives the signal
  if (S.mode === 'ready') {
    const R = C.rd;
    if (G.auto && !R.p && !player.helmOff) { R.p = true; player.raiseT = 1; }
    stepBeat(dtReal);
    // keep the lists waiting at your mark and the host loses patience (once a match): lance not up after 12 s, or not away 8 s after the signal
    if (!C.beat && !M.practice && !G.auto) {
      R.wait = (R.wait || 0) + dtReal; if (R.sig) R.sigWait = (R.sigWait || 0) + dtReal;
      if (!M.restless && ((!R.p && R.wait > 12) || (R.sig && R.sigWait > 8)) && hostSay('restless', 0, 'ready')) M.restless = true;
    }
    if (S.online) { const r = NET.rem; R.o = !!(r && r.n === M.course && r.rP); }      // online: he has raised his lance when his stream says so
    else if (!R.o && C.t > R.oAt && !C.beat) { R.o = true; opp.raiseT = 1; if (opp.visor) opp.visorUp = false; }
    if (S.online && !NET.host) {      // the guest: the host plans the signal and gives it; the hold and the horns show from the plan's arrival, the go waits for the host's word (netGo)
      if (R.plan && !R.sig) { R.gw = (R.gw || 0) + dt; signalStep(R.plan, R.gw); }
    } else if (R.p && R.o && !R.sig) {
      R.w += dt;
      if (!R.plan && R.w > 0.9) { R.plan = planSignal(); if (S.online) netSend({ t: 'plan', n: M.course, hold: R.plan.hold, horns: R.plan.horns }); }
      if (R.plan && signalStep(R.plan, R.w - 0.9)) { giveSignal(R.plan); if (S.online) { netSend({ t: 'sig', n: M.course }); startCharge(); } }
    }
  }

  // ---------------- opponent
  const O = C.o, od = M.od;
  if (S.online) netDriveOpp(dt);      // online: he is the friend's rider, placed from his stream; no AI
  else if (S.mode === 'charge' && !C.oL.done) {
    if (C.t > O.go) opp.speed = Math.min(O.top, opp.speed + HORSES[od.horse].accel / Math.sqrt(ARMOURS[od.armour].weight) * 0.9 * dt);
    if (gap < 36) opp.lanceLower = clamp(opp.lanceLower + dt / 0.95, 0, 1);
    opp.brace = damp(opp.brace, O.brace && gap < 5 ? 1 : 0, 10, dt);
    opp.guard = damp(opp.guard, O.guard && gap < 24 ? 1 : 0, 5 * (1 - PHYS.damage.guardSlow * opp.dmg.pauldronL), dt);
    if (M.kit.shy && !M.practice && !O.shyRolled && gap < PHYS.kit.shyGap && gap > 4) {      // his horse too, if his eyes are open
      O.shyRolled = true;
      if (Math.random() < M.kit.shy * clamp((opp.agit - PHYS.kit.shyAt) * PHYS.kit.shyGain, 0, PHYS.kit.shyMax) * (1.3 - (HORSES[od.horse].nerve ?? 0.6))) { opp.speed *= PHYS.kit.shyPace; O.knock.x += (Math.random() < 0.5 ? -1 : 1) * 0.3; M.shyN[1]++; }
    }
    if (!O.retarget && gap < 14) { O.retarget = true; if (player.guard > 0.5 && O.zone === 'helm') O.zone = 'body'; else if (player.guard > 0.5 && O.zone === 'shield' && Math.random() < od.skill) O.zone = 'body'; }
  } else if (after && (!M.result || C.turn.o.init && C.turn.o.stage === 'run') && !M.practice) { rideOut(opp, C.turn.o, dt); opp.brace = damp(opp.brace, 0, 6, dt); opp.guard = damp(opp.guard, 0, 5, dt); opp.lanceLower = damp(opp.lanceLower, 0, 11, dt); }
  else {
    const tgt = S.mode === 'ready' || M.practice ? 0 : (opp.z * opp.dir > START_Z - 5 ? 0 : 4.5);
    opp.speed = opp.speed < tgt ? Math.min(tgt, opp.speed + 3 * dt) : Math.max(tgt, opp.speed - 3.2 * dt);
    opp.brace = damp(opp.brace, 0, 6, dt); opp.guard = damp(opp.guard, 0, 5, dt);
    if (C.oL.done) opp.lanceLower = damp(opp.lanceLower, 0, 11, dt);
  }

  player.agit = M.agit; if (!S.online) opp.agit = 0.12 + S.excite * 0.2; player.tiltTop = opp.tiltTop = TILT_TOP;
  { const st = M.stats; st[0].top = Math.max(st[0].top, player.speed); st[1].top = Math.max(st[1].top, opp.speed); }
  player.update(dt); opp.update(dt);

  // ---------------- aim both lances from the fresh positions, then re-point them
  const gap2 = gapNow();
  if (live && gap2 > 0.5) {
    aimMouse.x = damp(aimMouse.x, mouse.x, 16 * Math.sqrt(PHYS.lanceArm.refKg / lanceOf(true).kg), dt); aimMouse.y = damp(aimMouse.y, mouse.y, 16 * Math.sqrt(PHYS.lanceArm.refKg / lanceOf(true).kg), dt);
    ray.setFromCamera(G.auto ? mouse : aimMouse, camera);
    opp.zoneWorld('body', _zc);
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = d.z * D > 0.02 ? clamp((_zc.z - o.z) / d.z, 3, 140) : 140;
    _a.copy(o).addScaledVector(d, t);
    player.gripWorld(_b); _c.subVectors(_a, _b).normalize();
    // work in the rider's own frame so the same code serves both directions of travel
    const cmdYaw = Math.atan2(_c.x * D, _c.z * D), cmdPitch = Math.asin(clamp(_c.y, -1, 1));
    // the saddle's vertical acceleration, felt through the arm
    // (taken as simple harmonic motion about the stride's mean height: a = -(2*pi*f)^2 * displacement)
    if (dt > 0) { const y = player.bob || 0, w = TAU * (0.78 + 0.12 * player.speed); bobHist.y = damp(bobHist.y, y, 1.5, dt); bobHist.a = -w * w * (y - bobHist.y) * clamp(player.speed / 3, 0, 1); }
    // the arm state is the point's offset from where you mean it to be: the target sweeping past is followed, the bounce is not
    if (!C.armLive) { C.armLive = true; arm.reset(0, 0); }
    arm.step(dt, 0, 0, { set: Math.min(clamp(C.setT / 0.45, 0, 1) * (C.couch >= 0.999 ? 1 : 0), M.kit.rest), lanceKg: lanceOf(true).kg, fatigue: clamp(C.fatigue + PHYS.body.armFatigue * M.bodyS.p.arm, 0, 1), agit: clamp(M.agit + PHYS.body.windAgit * M.bodyS.p.wind, 0, 1),
      aVert: bobHist.a, aLat: -C.latV * 2.4, absorb: clamp(0.25 + 0.45 * C.collected + 0.3 * (H.steady - 0.5), 0, 0.85), focus: S.focusOn, scale: armScale(), t: S.time });
    C.sway = arm.err;
    const yaw = cmdYaw + arm.yaw, pitch = cmdPitch + arm.pitch;
    _c.set(D * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), D * Math.cos(yaw) * Math.cos(pitch));
    player.setAim(_c); player.applyLance();
  }
  if (S.mode === 'charge' && !C.oL.done && gap2 > 0.5 && !S.online) {
    player.zoneWorld(O.zone, _a);
    const amp = lerp(0.5, 0.11, clamp(od.skill + DIFFICULTY[profile.difficulty ?? 1].ai, 0, 1)) * (1 + 0.5 * clamp(M.fav.commons, 0, 1)) * O.rattled * (1 + PHYS.body.oppArm * M.bodyS.o.arm + PHYS.body.oppWind * M.bodyS.o.wind) * (1 + PHYS.kit.wander * (1 - M.kit.rest));      // no lance rest: his point wanders too
    _a.x += amp * (wobble(S.time * 1.7, O.seed) * 0.7 + O.bias.x * 0.9) + O.knock.x;
    _a.y += amp * (wobble(S.time * 2.1, O.seed + 9) * 0.7 + O.bias.y * 0.9) + O.knock.y;
    O.knock.multiplyScalar(Math.exp(-5 * dt));
    // a jouster carries his point over his man's horse: never aim lower than a hand above the top of its head and neck
    if (player.hb) { let top = 0; for (const h of player.hb) if (h.name === 'horseHead' || h.name === 'horseNeck') top = Math.max(top, h.c.ay + h.c.r, h.c.by + h.c.r); if (top > 0) _a.y = Math.max(_a.y, top + 0.12); }
    opp.gripWorld(_b); opp.setAim(_c.subVectors(_a, _b).normalize()); opp.applyLance();
  }

  // ---------------- strikes, then the aftermath
  const guest = S.online && !NET.host;      // online, the HOST decides every stroke; the guest only shows what the host says (netApplyStroke, netApplyCourse)
  if (guest) { player.pointFree = !C.pL.done; opp.pointFree = !C.oL.done; if (player.lanceLower > 0.9 && gapNow() < 6) C.pL.low = true; }
  else if (S.mode === 'charge' || (after && C.afterT < 1.2)) { shaftBlow(player, opp, C.pL, true); if (!M.practice) shaftBlow(opp, player, C.oL, false); if (S.online) netFlushStrokes(); }
  if (S.mode === 'charge') {
    if (guest) { /* nothing: the host's word arrives as 'st' messages */ }
    else if (!M.practice && player.hb && opp.hb) { collideFrame(dt); sweep(player, opp, C.pL, true, false); sweep(opp, player, C.oL, false, false); }
    else if (M.practice) { lancesCross(D, gap2); sweep(player, opp, C.pL, true); sweep(opp, player, C.oL, false); }
    else {
      lancesCross(D, gap2);
      // whose point arrives first? The lance further advanced on its man lands first, and that blow spoils the stroke of the man it lands on
      player.tipWorld(_a); opp.tipWorld(_b);
      C.lead = (_a.z - opp.z) * D - (_b.z - player.z) * (opp.dir || -D);          // metres your point is ahead of his
      if (C.lead >= 0) { sweep(player, opp, C.pL, true); sweep(opp, player, C.oL, false); } else { sweep(opp, player, C.oL, false); sweep(player, opp, C.pL, true); }
    }
    if (C.pL.done && C.meetSpeed == null) C.meetSpeed = player.speed;
    if (S.online && !guest) netFlushStrokes();
    if (!guest && C.pL.done && C.oL.done) { S.mode = 'after'; C.afterT = 0; finishCourse(); }
  } else if (after) aftermath(dtReal);

  // keep the last few seconds for instant replay
  if ((S.mode === 'charge' || (after && C.afterT < 2.6)) && !C.replayed && !R && !S.online) { C.rec.f.push({ t: C.t, p: player.snapshot(), o: opp.snapshot() }); if (C.rec.f.length > 520) C.rec.f.shift(); }

  if (C.cut) { C.cut.t -= dtReal; if (C.cut.ots > 0) C.cut.ots -= dtReal; if (C.cut.t <= 0) { C.cut = null; $('royalCap').classList.add('hidden'); if (C.verdict && !M.result && S.mode !== 'charge') $('verdict').classList.remove('hidden'); } }
  // The quintain's sandbag is a real thing swinging round on its arm: be gone before it comes about, or it catches you in the back.
  if (M.practice && !C.bagHit && opp.bagWorld && Math.abs(opp.spin) > 0.8 && !player.unhorsed) {
    opp.bagWorld(_a); player.torso.getWorldPosition(_b);
    if (Math.hypot(_a.x - _b.x, _a.z - _b.z) < QUINTAIN.reach && Math.abs(_a.y - (_b.y + 0.25)) < 0.8) {
      C.bagHit = true; opp.spin *= 0.3;                       // the bag spends itself on you
      player.hit(-2.2, true); audio.impact(0.7, 'body', 0); react('sandbag', 1, false); S.shake = Math.max(S.shake, 0.45);
      M.hp.body = Math.max(0, M.hp.body - 0.06);
      if (!M.result) { M.score[0] += QUINTAIN.bagPoints; if (C.pts) C.pts[0] += QUINTAIN.bagPoints; updateHud(true); }
      callout('THE SANDBAG CAUGHT YOU &nbsp;−1', 'bad');
      say('Too slow away. Ride on at a canter after the stroke.', 'THE MASTER OF ARMS', 3, { free: true, cat: 'sandbag', phases: 'after', speaker: speakerOf.man('master') });
    }
  }
  const antic = S.mode === 'charge' && gap > 0 ? clamp(1 - gap / 80, 0, 1) : 0;
  S.antic = antic;
  S.excite = Math.max(S.excite, 0.12 + antic * 0.4);
}

/** What happens once both lances are spent: replay, the verdict, the royal gallery, then wheel about for the next course. */
function aftermath(dtReal) {
  C.afterT += dtReal; recMeta();
  if (C.capT > 0) { C.capT -= dtReal; if (C.capT <= 0) $('royalCap').classList.add('hidden'); }      // the judges' caption shown over a replay
  if (R) return;      // a replay is playing: the ride-out turn goes on underneath (updateReplay), the verdict waits for the cut back
  if (C.countDue) { if (C.raised || C.afterT > 2.5) { C.countDue = false; settleCount(); } else return; }      // Judged Tilt: the card waits a moment for the lance to come up
  const anyHit = (C.pL.res && C.pL.res.zone !== 'miss' && C.pL.res.zone !== 'none') || (C.oL.res && C.oL.res.zone !== 'miss' && C.oL.res.zone !== 'none');
  const wait = C.cine ? 2.2 : M.practice ? 2.3 : 1.25;      // at the quintain, wait for the bag to come about before the replay
  const replay = anyHit && G.replays !== false && C.rec.f.length > 20 && !S.online;      // (online: no replays, the match does not wait)
  if (!C.replayed && C.afterT > wait) {
    if (!M.practice) {
      if (!C.montDone) { C.montDone = true; startMontage(); }      // a big moment gets the reaction montage first
      if (C.mont) { stepMontage(dtReal); return; }
      if (!C.judged) { C.judged = true; raiseJudges(replay); }      // with a replay the flags go up under it (their caption stays on screen); without, the camera visits the table
      if (C.cut && C.cut.kind === 'judges') return;      // the camera stays on the judges while the flags go up
    }
    if (replay) { startReplay(); return; }
    trimRec(C.rec); C.replayed = true;
  }
  if (!C.replayed) return;
  if (!M.practice && judges.busy()) return;      // the flags are up; Hugh's call follows them
  if (M.result) { if (!C.carded) { C.carded = true; showCard(); } return; }
  if (!C.verdict) { C.verdict = true; C.verdictT = 0; showVerdict(); betweenColour(royalReaction()); }
  C.verdictT += dtReal;
  if (S.online) netReady(C.turn.p.stage === 'done' && C.verdictT > (C.seenReplay ? 0.8 : 1.6) && !field.serving());      // the host starts the next course once both are at their marks
  else if (C.turn.p.stage === 'done' && (C.turn.o.stage === 'done' || M.practice) && C.verdictT > (C.seenReplay ? 0.8 : 1.6) && !field.serving()) beginCourse(false);
}

// ------------------------------------------------------------------ the beats around a course: the helm fitting, the marshal's hold, the reaction montage, the judges' flags
// Holding Space skips the helm fitting and the montage (the same ring as the intro's).
/** The marshal's signal: sometimes he holds the flags up a while (more on the last courses), and the horns sound on the first and the last course only. */
function planSignal() {
  if (M.practice || G.auto) return { hold: 0, horns: false };
  const last = M.course >= M.courses, pen = M.course === M.courses - 1;
  return { hold: Math.random() < (last ? 0.6 : pen ? 0.4 : 0.25) ? 1.5 + Math.random() * 1.5 : 0, horns: M.course === 1 || last };
}
const HELM_FIT = 2.0, HELM_LOOK = 1.0;      // seconds: the squire at your stirrup, then the view through your visor slit
function startHelmBeat() {
  C.beat = { kind: 'helm', t: 0, stage: 0, pend: true };
  if (player.visor) player.visorUp = true;      // up, so that the squire can close it
  C.cut = { kind: 'helmfit', t: 99 };
}
function stepBeat(dtReal) {
  const B = C.beat; if (!B) return;
  B.t += dtReal;
  if (B.pend && B.t > 0.04) {      // (a frame later: the men change ends on the first frame of a course, which would wipe his orders)
    B.pend = false;
    if (!field.fitHelm(HELM_FIT, () => { if (C.beat && player.visor) player.visorUp = false; })) B.t = HELM_FIT;      // no squire: straight to the view through the visor
  }
  if (B.stage === 0 && B.t >= HELM_FIT) { B.stage = 1; player.visorUp = false; C.cut = { kind: 'visor', t: 99 }; }
  if (B.t >= HELM_FIT + HELM_LOOK) endBeat(false);
}
function endBeat(skipped) {
  if (!C.beat) return;
  C.beat = null; C.cut = null; C.t = 0; player.visorUp = false; if (skipped) field.release();      // (the opponent raises his lance a little after: C.t counts from here)
}
/** Is this stroke, or this match, big enough for the reaction montage? Never at the quintain. */
function bigMoment() {
  const p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  if (p.unhorse || o.unhorse) return true;
  if ((real(p) && p.code === 'h') || (real(o) && o.code === 'h')) return true;
  return (M.result === 'win' || M.result === 'loss') && (p.pts >= 2 || o.pts >= 2);      // the stroke that won the match
}
const MONT_CUT = 1.1;      // three cuts of about a second: the stands, your squire, a lady of the gallery (3.3 s)
const hasSpot = () => !!(world && world.crowd && world.crowd.spotlight);
function startMontage() {
  if (G.auto || !bigMoment()) return;
  const p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  const good = !!p.unhorse || (!o.unhorse && ((real(p) && p.code === 'h') || M.result === 'win'));
  const zc = clamp((player.z + opp.z) / 2, -22, 22), cr = world.crowd;
  const near = cr && cr.ladies ? cr.ladies(1, zc, 14).concat(cr.ladies(-1, zc, 14)).sort((a, b) => a.d - b.d) : [];
  const cs = near.length ? Math.sign(near[0].x) || 1 : 1, seats = near.filter(l => Math.sign(l.x) === cs).slice(0, 14), lady = near.length ? near[0] : null;
  C.mont = { t: 0, i: -1, good, zc, cs, seats, lady, sq: !!field.where('squire', _d), cheered: false, spot: false, burst2: false };
  $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
}
/** Throw ribbons and petals from the seats near the meeting point onto the sand. */
function ribbonBurst(m, n) {
  if (m.seats.length) for (const l of m.seats) fx.ribbons(l, n);
  else for (let i = 0; i < 10; i++) fx.ribbons(_a.set(m.cs * (13 + Math.random() * 6), 3 + Math.random() * 2.5, m.zc + (Math.random() - 0.5) * 16), n);
}
function stepMontage(dtReal) {
  const m = C.mont; m.t += dtReal;
  const i = Math.min(2, Math.floor(m.t / MONT_CUT));
  if (i !== m.i) {
    m.i = i;
    if (i === 0) { C.cut = { kind: 'react', sub: 'crowd', cs: m.cs, zc: m.zc, t: 9 }; ribbonBurst(m, 3); S.excite = Math.max(S.excite, 0.9); }
    else if (i === 1) { C.cut = m.sq && field.where('squire', _d) ? { kind: 'react', sub: 'squire', pos: _d.clone(), t: 9 } : { kind: 'react', sub: 'crowd2', cs: m.cs, zc: m.zc, t: 9 }; }
    else { C.cut = m.lady ? { kind: 'react', sub: 'lady', pos: new THREE.Vector3(m.lady.x, m.lady.y + 1.15, m.lady.z), t: 9 } : { kind: 'react', sub: 'crowd2', cs: m.cs, zc: m.zc, t: 9 }; }
  }
  if (!m.burst2 && m.t > 0.55) { m.burst2 = true; ribbonBurst(m, 2); }
  if (!m.cheered && m.t > 1.0) { m.cheered = true; if (m.sq) field.cheer(); }      // he starts to run just as the camera comes to him
  if (!m.spot && m.t > 1.5) { m.spot = true; if (m.lady && hasSpot()) world.crowd.spotlight(m.lady.i, -1, m.good ? 'clap' : 'gasp'); }
  if (m.t >= MONT_CUT * 3) endMontage();
}
function endMontage() { C.mont = null; C.cut = null; $('royalCap').classList.add('hidden'); }
/** Hold Space to skip the helm fitting and the reaction montage (the ring fills as in the intro). */
let beatUi = false;
function beatSkip(dtReal) {
  const on = !!(M && C && S.mode !== 'intro' && S.mode !== 'replay' && (C.mont || C.beat));
  if (!on) { if (beatUi) { beatUi = false; ceremony.skipUI(false); S.skipHold = 0; } return; }
  beatUi = true; S.skipHold = skipKey ? S.skipHold + dtReal : Math.max(0, S.skipHold - dtReal * 2.5);
  ceremony.skipUI(true, S.skipHold / SKIP_HOLD);
  if (S.skipHold >= SKIP_HOLD) { S.skipHold = 0; skipKey = false; if (C.mont) endMontage(); else endBeat(true); }
}
/** The judges raise their flags (src/judges.js has the system), then Hugh's combined call follows. A camera cut to the table runs 3.2 s (we are not in a replay here),
 *  long enough to read the caption (Danilo, 15 Nov: at 1.2 s he never saw what it said). */
const FLAG_HOLD = 3.4, FLAG_CUT = 3.2;
function raiseJudges(overReplay) {
  if (!judges.has()) { releaseCall(C); return; }
  const p = C.pL.res, o = C.oL.res, cy = strokeCat(p), ch = strokeCat(o);
  const lv = (r, c) => !r || r.zone === 'none' || c === 'foul' ? 'down' : c === 'unhorse' || c === 'helm' || c.startsWith('break') ? 'high' : c === 'miss' ? 'wave' : 'level';
  const mid = cy === 'foul' || ch === 'foul' || C.tiltStruck ? 'red' : cy === 'unhorse' || ch === 'unhorse' ? 'high' : 'down';
  const lab = (c, mine) => ({ unhorse: mine ? 'UNHORSED HIM' : 'UNHORSED YOU', helm: 'LANCE BROKEN ON THE HELM', breakShield: 'LANCE BROKEN', breakBody: 'LANCE BROKEN', attaint: 'A TOUCH', glance: 'A TOUCH', miss: 'NO TOUCH', foul: 'FOUL' }[c] || '');
  const Cc = C;
  judges.show({ you: lv(p, cy), him: lv(o, ch), mid }, FLAG_HOLD, () => releaseCall(Cc));
  if (overReplay) C.capT = FLAG_HOLD; else C.cut = { kind: 'judges', t: FLAG_CUT };
  $('verdict').classList.add('hidden');
  $('royalCap').textContent = `THE JUDGES · YOU: ${lab(cy, true)} · HIM: ${lab(ch, false)}`; $('royalCap').classList.remove('hidden');
}
/** The flags are down: Hugh gives his combined result call, and the replay's coaching line may follow it. */
function releaseCall(Cc) {
  if (!Cc || C !== Cc || !M) return;
  if (Cc.resultArgs) { const a = Cc.resultArgs; Cc.resultArgs = null; resultCall(a[0], a[1]); }
  if (Cc.colourLater) { Cc.colourLater = false; replayColour(); }
}

// ------------------------------------------------------------------ continuous collision (src/collide.js, hit volumes in PHYS.hitboxes)
// Every frame both lances (a chain of capsules from the vamplate to the coronel) are swept from last frame's pose to this frame's against
// the other man's hit volumes (which move too) and against the other lance. The frame is cut into slices of at most 1/120 s and 0.1 m of
// relative motion; each pair is swept slice by slice to its first contact. All contacts of the frame are then resolved in order of time,
// so whoever's point arrived first strikes first (and spoils the other's stroke through C.shock), with no rule about who "leads".
let frameId = 0;
const _ch = new Hit(), _ch2 = new Hit(), _hv = new THREE.Vector3(), _hf = new THREE.Vector3(), _hc = new THREE.Vector3(), _hd = new THREE.Vector3(), _hn = new THREE.Vector3(), _ho = new THREE.Vector3();
const bbHit = (a, b) => a.lo[0] <= b.hi[0] + 0.06 && a.hi[0] >= b.lo[0] - 0.06 && a.lo[1] <= b.hi[1] + 0.06 && a.hi[1] >= b.lo[1] - 0.06 && a.lo[2] <= b.hi[2] + 0.06 && a.hi[2] >= b.lo[2] - 0.06;
const dv3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function logPhys(a, kind, e, cent) {
  const L = G.physLog; if (!L) return;
  if (L.length > 4000) L.shift();
  L.push({ t: +C.t.toFixed(3), a, kind, part: e.part, zone: e.zone, toi: +e.toi.toFixed(4), speed: +e.speed.toFixed(2), normal: [+e.n[0].toFixed(3), +e.n[1].toFixed(3), +e.n[2].toFixed(3)], cent: cent == null ? null : +cent.toFixed(3) });
}
/** The earliest point contact and the earliest shaft contact of X's lance against Y's hit volumes, pushed onto evs. */
function traceLance(X, Y, st, isP, evs, nS, dt) {
  if (X.unhorsed || X.lcN < 1 || st.done || X.replaying) return;
  const ahead = (Y.z - X.z) * X.dir;
  if (X.lanceLower > 0.9 && ahead < 6) st.low = true;
  const pointOk = X.lanceLower > 0.9 && ahead < 5 && X.lcPoint >= 0, shaftOk = X.lanceLower > 0.3;
  if (!pointOk && !shaftOk) return;
  const CH = PHYS.lanceChain, dz = isP ? (DIFFICULTY[profile.difficulty ?? 1].zone - 1) * 0.17 : 0;     // the difficulty widens or narrows the marks
  let bp = null, bs = null;
  for (const h of Y.hb) {
    if (h.proxy || (h.leg && Y.unhorsed)) continue;
    for (let i = 0; i < X.lcN; i++) {
      const q = X.lc[i], pt = i === X.lcPoint;
      if (pt ? !pointOk : !shaftOk) continue;
      if (!bbHit(q, h)) continue;
      const margin = pt ? h.pad + (h.zone !== 'horse' ? dz : 0) : -CH.tol, best = pt ? bp : bs, sMax = best ? best.toi : 1;
      for (let k = 0; k < nS; k++) {
        const s0 = k / nS; if (s0 >= sMax) break;
        if (h.obb ? sweepCapObb(q, h, s0, (k + 1) / nS, margin, _ch) : sweepCapCap(q, h, s0, (k + 1) / nS, margin, _ch)) {
          const e = { kind: pt ? 'point' : 'shaft', X, Y, st, isP, h, q, i, toi: _ch.s, u: _ch.u, n: [_ch.nx, _ch.ny, _ch.nz], p: [_ch.px, _ch.py, _ch.pz], part: h.name, zone: h.zone, speed: dt > 0 ? Math.hypot(_ch.vx, _ch.vy, _ch.vz) / dt : 0 };
          if (pt) bp = e; else bs = e; break;
        }
      }
    }
  }
  if (bp) evs.push(bp); if (bs) evs.push(bs);
}
/** The earliest contact between the two lances' capsule chains. */
function traceLances(evs, nS, dt) {
  const P = player, O = opp;
  if (C.crossed || C.pL.done || C.oL.done || P.lanceLower < 0.9 || O.lanceLower < 0.9) return;
  const gap = gapNow(); if (gap > 7 || gap < 0.3) return;
  let best = null;
  for (let i = 0; i < P.lcN; i++) for (let j = 0; j < O.lcN; j++) {
    const a = P.lc[i], b = O.lc[j]; if (!bbHit(a, b)) continue;
    const sMax = best ? best.toi : 1;
    for (let k = 0; k < nS; k++) {
      const s0 = k / nS; if (s0 >= sMax) break;
      if (sweepCapCap(a, b, s0, (k + 1) / nS, 0, _ch)) {
        best = { kind: 'lance', toi: _ch.s, i, j, xa: a.x0 + (a.x1 - a.x0) * _ch.u, xb: b.x0 + (b.x1 - b.x0) * _ch.v, n: [_ch.nx, _ch.ny, _ch.nz], p: [_ch.px, _ch.py, _ch.pz],
          speed: dt > 0 ? Math.hypot(_ch.vx, _ch.vy, _ch.vz) / dt : 0, vn: dt > 0 ? Math.abs(_ch.vx * _ch.nx + _ch.vy * _ch.ny + _ch.vz * _ch.nz) / dt : 0, part: 'lance', zone: 'lance' };
        break;
      }
    }
  }
  if (best) evs.push(best);
}
function collideFrame(dt) {
  const P = player, O = opp;
  if (!P.hbUpdate(frameId) || !O.hbUpdate(frameId)) return;
  // metres your point is ahead of his, from the end-of-frame poses; only used as the fallback when both points do not land in this frame
  P.tipWorld(_hv); O.tipWorld(_hf); C.lead = (_hv.z - O.z) * dirP() - (_hf.z - P.z) * (O.dir || -dirP());
  const rel = Math.max(dv3(P.dTip, O.dRoot), dv3(O.dTip, P.dRoot), dv3(P.dTip, O.dTip));
  const nS = Math.min(48, Math.max(1, Math.ceil(dt * 120), Math.ceil(rel / PHYS.lanceChain.slice)));
  const evs = [];
  traceLances(evs, nS, dt);
  traceLance(P, O, C.pL, true, evs, nS, dt); traceLance(O, P, C.oL, false, evs, nS, dt);
  if (!evs.length) return;
  const rank = { lance: 0, point: 1, shaft: 2 };
  evs.sort((a, b) => a.toi - b.toi || rank[a.kind] - rank[b.kind] || (b.isP ? 1 : 0) - (a.isP ? 1 : 0));
  for (const e of evs) {
    if (e.kind === 'lance') { if (!C.crossed && !C.pL.done && !C.oL.done) resolveLances(e); }
    else if (e.st.done) continue;
    else if (e.kind === 'point') resolvePoint(e, evs, dt);
    else resolveShaft(e);
  }
}
function resolveLances(e) {
  C.crossed = true;
  const CH = PHYS.lanceChain, P = player, O = opp, tipPart = (P.lcPoint === e.i && O.lcPoint === e.j), cap = LANCE_REACH - CH.capX;
  const coronel = tipPart && e.xa >= cap && e.xb >= cap;          // both contacts within the last few cm of each lance: point to point
  if (coronel) { C.coronel = true; callout('CORONEL TO CORONEL', 'good'); }
  logPhys('p', coronel ? 'coronel' : 'lance', e, null);
  _hn.set(e.n[0], e.n[1], e.n[2]);                                // from his shaft to yours
  const hard = clamp(e.vn / Math.max(1, P.speed + O.speed), 0, 1);   // how squarely they met: the share of the closing speed that went across the shafts
  const K = clamp((P.speed + O.speed) * 0.07 * (0.55 + 0.45 * hard), 0.3, 1.3), mine = Math.sqrt(PHYS.lanceArm.refKg / PHYS.lance[profile.lance || 'standard'].kg), D = dirP();
  arm.vy += D * _hn.x * K * mine; arm.vp += _hn.y * K * mine;
  C.o.knock.set(-_hn.x * 0.32 * K, -_hn.y * 0.32 * K);
  _hc.set(e.p[0], e.p[1], e.p[2]); fxSparks(_hc.clone(), 6 + (hard * 6 | 0), 2.5 + hard * 2); audio.impact(0.25 + 0.3 * hard, 'glance', hear(_hc)[0]);
}
function resolvePoint(e, evs, dt) {
  const { X: Aj, Y: Bj, st, isP, h } = e;
  // whose point landed first decides the lead (seconds until the other lands, as metres of closing speed, for strike()'s spoiling rule)
  const closing = Aj.speed + Bj.speed, other = evs.find(o => o.kind === 'point' && o.X !== Aj && !o.st.done);
  if (other) C.lead = (isP ? 1 : -1) * (other.toi - e.toi) * dt * Math.max(closing, 1);
  // how true: how far the LINE of the lance passes from the centre of what it struck
  Aj.gripWorld(_a); Aj.tipWorld(_b); _b.sub(_a).normalize();
  const c = h.c;
  if (h.obb) _hd.set(c.cx, c.cy, c.cz); else _hd.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2);
  const along = _hc.subVectors(_hd, _a).dot(_b); _hf.copy(_a).addScaledVector(_b, along); _ho.subVectors(_hf, _hd);      // _hf: where the line passes; _ho: out from the centre to it
  const L = _ho.length(), cent = clamp(1 - L / h.cr, 0, 1), side = Bj.dir > 0 ? 1 : -1;
  // where it lands on the verdict's map: against the mark of that name nearest the line
  let off = [0, 0], zr = 0.2, zbest = 9;
  if (e.zone !== 'horse') for (const z of Bj.zones) { if (z.name !== e.zone) continue; z.o.getWorldPosition(_zc); const dd = _zc.distanceTo(_hf); if (dd < zbest) { zbest = dd; zr = z.r; off = [(_hf.x - _zc.x) * side / z.r, (_hf.y - _zc.y) / z.r]; } }
  _hn.set(e.n[0], e.n[1], e.n[2]);
  const geo = { m: clamp(L / h.cr, 0, 1), dir: _b.clone(), out: _ho.clone(), centre: _hd.clone(), r: h.cr, n: _hn.clone(), p: new THREE.Vector3(e.p[0], e.p[1], e.p[2]), part: e.part };
  logPhys(isP ? 'p' : 'o', 'point', e, cent);
  strike(Aj, Bj, e.zone, cent, st, isP, off, geo);
}
function resolveShaft(e) {
  const { X, Y, st, isP, h, q } = e;
  if (X.shaftHit) return;                                          // the push already made a blow of it
  const gapEnd = h.obb ? capObbGap(q.c, h.c, _ch2) : capCapGap(q.c, h.c, _ch2), x = q.x0 + (q.x1 - q.x0) * e.u;
  const defl = Math.max(Math.max(0, -gapEnd) / Math.max(x, 0.5), PHYS.shaft.brush * 1.01);
  X.shaftHit = { a: defl, at: x, name: h.leg ? 'leg' : h.zone, defl };
  logPhys(isP ? 'p' : 'o', 'shaft', e, null);
  shaftBlow(X, Y, st, isP);
}


function sweep(Aj, Bj, st, isP, contact = true) {
  if (st.done) return;
  const ahead = (Bj.z - Aj.z) * Aj.dir;
  if (Aj.unhorsed) { st.done = true; st.res = { zone: 'none', pts: 0, code: 'm', text: 'unhorsed before he could strike' }; return; }
  Aj.tipWorld(_tip); _rel.subVectors(_tip, Bj.root.position);
  if (Aj.lanceLower > 0.9 && ahead < 6) st.low = true;      // he did have it down for this meeting
  if (st.prev && Aj.lanceLower > 0.9 && ahead < 5) {
    for (let k = 1; k <= 10 && !st.done; k++) {
      _p.lerpVectors(st.prev, _rel, k / 10);
      for (const z of Bj.zones) {
        z.o.getWorldPosition(_zc).sub(Bj.root.position);
        const d = _p.distanceTo(_zc), side = Bj.dir > 0 ? 1 : -1;
        if (z.name !== 'horse' && (!st.near || d - z.r < st.near.d)) st.near = { d: d - z.r, zone: z.name, off: [(_p.x - _zc.x) * side / z.r, (_p.y - _zc.y) / z.r] };
        if (isP && z.name !== 'horse') C.minMiss = Math.min(C.minMiss, d - z.r);
        if (contact && d < z.r * (isP && z.name !== 'horse' ? DIFFICULTY[profile.difficulty ?? 1].zone : 1)) {
          // how true the stroke is: how far the line of the lance passes from the centre of the mark
          Aj.gripWorld(_a); Aj.tipWorld(_b); _b.sub(_a).normalize(); z.o.getWorldPosition(_d);
          const along = _c.subVectors(_d, _a).dot(_b); _c.copy(_a).addScaledVector(_b, along).sub(_d);
          strike(Aj, Bj, z.name, clamp(1 - _c.length() / z.r, 0, 1), st, isP, [_c.x * side / z.r, _c.y / z.r], { m: clamp(_c.length() / z.r, 0, 1), dir: _b.clone(), out: _c.clone(), centre: _d.clone(), r: z.r }); break;
        }
      }
    }
  }
  if (!st.prev) st.prev = new THREE.Vector3();
  st.prev.copy(_rel);
  if (!st.done && ahead < -1.3) {
    const up = !st.low, early = !up && Aj.lanceLower < 0.9;      // never down at all, or let up a moment too soon
    st.done = true; st.res = { zone: 'miss', pts: 0, code: 'm', up, early, text: up ? 'never brought his lance down' : early ? 'let his lance up before the stroke' : 'passed wide — no attaint' };
    M.stats[isP ? 0 : 1].miss++;
    if (isP) { C.tech = techSnapshot(null, 0); callout(up ? 'LANCE NEVER LOWERED' : early ? 'LANCE RAISED TOO SOON' : 'MISSED', 'bad', CALL.miss); }
    { const nearHelm = !up && !early && !!st.near && st.near.zone === 'helm' && st.near.d < 0.18;      // the point went by the helm within a hand: a sharp gasp, not an "aww"
      if (!M.practice || isP) crowdStroke(nearHelm ? 'near' : 'miss', isP ? 1 : -1); }
    // (a miss is spoken in the combined result call once both lances are spent)
  }
}

function techSnapshot(zone, cent) {
  C.ev.impact = C.t;
  const H = player.horseDef;
  const speedFrac = clamp(player.speed / H.top, 0, 1);
  const lance = clamp(1 - C.fatigue * 0.8 - (C.setT < 0.4 ? (0.4 - C.setT) / 0.4 * 0.65 : 0) - Math.max(0, C.sway - 0.012) * 9, 0, 1) * (C.pL.low ? 1 : 0);
  const latOk = C.lat < 0.8 ? 0.5 : C.lat <= 1.3 ? 1 : clamp(1 - (C.lat - 1.3) / 1.2, 0, 1);
  const horse = clamp(0.4 * speedFrac + 0.25 * latOk + 0.15 * (1 - Math.min(1, Math.abs(C.latV) * 2.2)) + 0.2 * C.collected, 0, 1);
  const braced = C.braceT > 0; const perfect = braced && C.braceAge < 0.45;
  if (braced) C.flags.brace = true;
  const will = perfect ? 1 : braced ? 0.72 : 0.3;
  const sight = zone ? ({ helm: 0.9, shield: 0.7, body: 0.5, horse: 0.05 }[zone] + 0.1 + 0.2 * cent) : clamp(0.35 - C.minMiss * 0.5, 0, 0.35);
  // plain-language coaching for whatever went worst
  const tips = {
    // each tip is also spoken in the replay, so it stays within 18 words
    sight: !zone ? (!C.pL.low ? 'Your lance was still pointing at the sky. Hold LEFT MOUSE to bring it down.' : 'You passed without touching him. Keep the ring on his shield: it shows your point.') : zone === 'horse' ? 'You hit his horse, a foul. Aim higher: his shield is the fair mark.' : zone === 'body' ? 'You struck his body. The shield is the fair mark; the helm is worth more.' : 'A fair hit. For three points, try the helm: it is a smaller mark.',
    lance: !C.pL.low ? 'Hold LEFT MOUSE to lower the lance, about three strides before you meet.' : C.setT < 0.4 ? 'You lowered the lance too late and it was still settling. Start at three or four strides.' : C.fatigue > 0.35 ? 'You lowered the lance too early and your arm tired. Wait until about three strides out.' : 'Lance timing was good.',
    horse: speedFrac < 0.62 ? 'You were too slow to break a lance. Tap W until the horse gallops.' : C.lat > 1.3 ? 'You rode wide of the barrier. Steer closer with A: the blow lands heavier.' : C.lat < 0.8 ? 'You crowded the barrier. Ease away with D or you will strike it.' : Math.abs(C.latV) > 0.25 ? 'Keep the horse straight in the last strides. Do not steer as you strike.' : 'Your horse ran fast and straight.',
    will: perfect ? 'You thrust at the right moment.' : braced ? 'You thrust a touch early. Press SPACE just before the lances meet.' : 'Press SPACE just before the lances meet to thrust: you hit harder and sit firmer.',
  };
  return { sight, lance, horse, will, q: 0.4 * lance + 0.35 * horse + 0.25 * will, perfect, braced, tips, speedFrac };
}

function fxSplinters(a, b, vel, n) { fx.splinters(a, b, vel, n); if (C && !R) C.rec.ev.push({ t: C.t, k: 'spl', a: a.clone(), b: b.clone(), v: vel.clone(), n }); }
function fxShaft(a, b, vel) { fx.shaft(a, b, vel); if (C && !R) C.rec.ev.push({ t: C.t, k: 'sh', a: a.clone(), b: b.clone(), v: vel.clone() }); }
function fxSparks(p, n, s) { fx.sparks(p, n, s); if (C && !R) C.rec.ev.push({ t: C.t, k: 'spk', p: p.clone(), n, s }); }

/** The lance a rider carries this match: the type may fix a heavier one (the Rennen lance), which also tires the arm faster. */
function lanceOf(isP) {
  const id = isP ? (profile.lance || 'standard') : 'standard', b = PHYS.lance[id], kg = Math.max(b.kg, M ? M.kit.lanceKgMin : 0);
  return { kg, breakJ: b.breakJ, fatigue: LANCES[id].fatigue * kg / b.kg };
}
function fxPiece(p, q, sx, sy, sz, vel) { fx.piece(p, q, sx, sy, sz, vel); if (C && S.mode !== 'replay') C.rec.ev.push({ t: C.t, k: 'pc', p: p.clone(), q: q.clone(), sx, sy, sz, v: vel.clone() }); }
let NFX = null;      // online host: what the guest needs to show this stroke (see netFlushStrokes)
function strike(Aj, Bj, zone, cent, st, isP, off, geo) {
  st.done = true;
  const nfx = NFX = S.online && NET.host && !M.practice ? {} : null; if (nfx) (C.nfx || (C.nfx = {}))[isP ? 'p' : 'o'] = nfx;
  if (C.hitT === null) C.hitT = C.t;
  voice.mark('strike');
  const closing = Aj.speed + Bj.speed;
  let q, boost = 1, forceBreak = false;
  if (isP) {
    C.tech = techSnapshot(zone, cent); q = C.tech.q; C.flags.hit = zone !== 'horse';
    if (C.tech.perfect) boost *= 1.08;
    // the hidden arts
    if (C.setT >= 0.4 && C.setT <= 0.95) { boost *= 1.07; discover('clock'); }
    if (C.collected >= 0.9) { boost *= 1.05; discover('inhand'); }
    if (C.lat <= 0.84 && !C.tiltStruck) { boost *= 1.06; discover('shave'); }
    if (C.galT >= 0 && C.t - C.galT < 2.3 && C.tech.speedFrac > 0.84) { boost *= 1.06; discover('drive'); }
    if (zone === 'helm' && cent > 0.55) { forceBreak = true; discover('sight'); if (C.braceT > 0) C.perfectHit = true; }
    if (S.online && !M.practice && opp.guard > 0.5 && NET.rGuardAge < 0.4 && zone !== 'horse') st.turned = true;      // his shield thrown up in the last instant turns your stroke too
  } else {
    q = C.o.q;
    // your shield thrown up in the very last instant turns the stroke
    if (player.guard > 0.5 && C.guardAge < (sk('shield') ? SKILLS.shield.window : 0.4) && zone !== 'horse') { st.turned = true; discover('turn'); }
  }
  // A rider who has just been struck does not strike true: his body is already going back and his point is off its line.
  // It counts by how long before your own stroke the blow landed: 30 ms or more in full, the same instant not at all.
  { const sh = isP ? C.shock.p : C.shock.o;
    if (sh) {
      const f = clamp(Math.max(sh.lead, C.t - sh.t) / 0.03, 0, 1), k = f * clamp(sh.unhorse ? 1 : sh.power, 0, 1);
      if (k > 0.05) { q *= 1 - 0.55 * k; cent *= 1 - 0.5 * k; st.spoiled = k; if (k > 0.3) forceBreak = false; if (isP && C.tech) C.tech.spoiled = k; }
    } }
  q = Math.min(q, M.kit.rest);      // no lance rest (Castile 1330): the rider cannot lock himself behind the lance, so less of him goes into the blow
  // ---- the angle of the stroke: a point that meets the surface too obliquely skids instead of biting
  let square = 1, glanced = false;
  if (geo && zone !== 'horse' && !M.practice) {
    const GL = PHYS.glance;
    let cosT = geo.n ? Math.abs(geo.n.dot(geo.dir)) : Math.sqrt(Math.max(0, 1 - geo.m * geo.m));   // the true surface normal at the contact; (old sphere zones: the further off centre, the more oblique)
    if (zone === 'shield' && Bj.shield && geo.n) cosT = Math.min(1, cosT + 0.12) * (geo.m > 0.93 ? 0.4 : 1);
    else if (zone === 'shield' && Bj.shield) {                                         // a flat plate: its own facing decides, and its very rim lets the point slip off
      _s1.set(0, 0, 1).applyQuaternion(Bj.shield.getWorldQuaternion(_qa));
      cosT = Math.min(1, Math.abs(_s1.dot(geo.dir)) + 0.12) * (geo.m > 0.93 ? 0.4 : 1);
    }
    square = cosT;
    const limit = GL[M.mode.sharp ? 'sharp' : 'coronel'] + (GL[zone] || 0) + (zone === 'shield' ? M.kit.shieldCatch : 0) - (zone === 'helm' && Bj.armourDef.helmDef ? Bj.armourDef.helmDef.deflect || 0 : 0) + (zone === 'shield' && Bj.dmg ? PHYS.damage.shieldGlance * Bj.dmg.shield : 0);
    if (!forceBreak && Math.acos(clamp(cosT, 0, 1)) * 57.2958 > limit) {
      glanced = true;
      // where the point goes: outward along the surface, the way it was already off centre, and on with the lance
      _s2.copy(geo.out); if (_s2.lengthSq() < 1e-6) _s2.set(0, 1, 0); _s2.normalize();
      _s3.copy(geo.centre).addScaledVector(_s2, geo.r + GL.slide * 0.5).addScaledVector(geo.dir, GL.slide * 0.6);
      for (const z2 of Bj.zones) {
        if (z2.name === zone || z2.name === 'horse') continue;
        z2.o.getWorldPosition(_cA); const d2 = _s3.distanceTo(_cA);
        if (d2 < z2.r) {       // it lands on the next thing along, with what is left of the stroke
          st.skid = zone; zone = z2.name; cent = clamp(1 - d2 / z2.r, 0.15, 1); square = Math.sqrt(Math.max(0, 1 - (1 - cent) * (1 - cent))); q *= GL.carry; glanced = false; break;
        }
      }
    }
  }
  if (zone === 'helm' && cent > 0.55 && !glanced && !M.practice) M.sights[isP ? 0 : 1]++;
  const lanceS = lanceOf(isP);
  const legSoft = M.kit.sack && !!geo && !st.skid && /^thigh/.test(geo.part || '');      // the Stechsack: a stroke low on the thigh is soft and scores nothing
  if (legSoft) forceBreak = false;
  const defBraced = isP ? Bj.brace > 0.5 : C.braceT > 0;
  const hit = impact(closing, { horseKg: PHYS.horseKg[Aj.horseDef.id] || 500, armourKg: (Aj.armourDef.kg ?? PHYS.armourKg[Aj.armourDef.id] ?? 28), lanceKg: lanceS.kg, breakJ: lanceS.breakJ * M.mode.lance, coupling: q, boost },
    M.practice ? { quintain: true } : { horseKg: PHYS.horseKg[Bj.horseDef.id] || 500, armourKg: (Bj.armourDef.kg ?? PHYS.armourKg[Bj.armourDef.id] ?? 28), braced: defBraced, seat: isP ? M.od.seat : S.online ? ARMOURS[profile.armour].protection * 0.85 : (sk('seat') ? SKILLS.seat.seat : 0.6), protection: Bj.armourDef.protection },
    zone, cent, { turned: st.turned, forceBreak, bite: M.mode.bite, hold: M.mode.hold * M.kit.cantle, lock: M.kit.lock, sharp: M.mode.sharp, sharpJ: M.kit.sharpJ * PHYS.refJ, springJ: M.kit.spring * PHYS.refJ, soft: legSoft, square, glance: glanced, pass: zone === 'shield' && Bj.dmg ? 1 + PHYS.damage.shieldPass * Bj.dmg.shield : 1 });
  const power = hit.power; if (nfx) nfx.pw = power;
  Aj.tipWorld(_tip);
  const velA = new THREE.Vector3(0, 0, Aj.dir * Aj.speed);
  S.slowT = Math.max(S.slowT, 0.7); S.shake = Math.max(S.shake, 0.25 + power * 0.5);
  post.setImpact(clamp(0.35 + power * 0.6, 0, 1));
  $('flash').style.opacity = 0.35; setTimeout(() => { $('flash').style.opacity = 0; }, 60);
  const who = isP ? profile.name : M.od.short, whom = isP ? M.od.short : profile.name;

  if (zone === 'horse') {
    st.res = { zone, pts: M.PT.foulHorse, code: 'f', text: 'struck the horse — a foul stroke', foul: true, off };
    { const [d, pan] = hear(_tip); audio.impact(power, 'horse', d); audio.whinny(pan, d); } fx.dust(_tip, 6, 0.3, 1, 0.3);
    Bj.speed *= 0.75; if (isP) { M.fouls++; if (M.online) M.hpO.horse = Math.max(0.15, M.hpO.horse - 0.4); } else { M.oFouls = (M.oFouls || 0) + 1; M.hp.horse = Math.max(0.15, M.hp.horse - 0.4); }
    if (nfx) nfx.foul = 1;   // his fouls count against him too
    crowdStroke('foul', isP ? 1 : -1);
    callout(isP ? (M.fouls >= (M.mode.horseOut || 2) ? 'YOU STRUCK HIS HORSE — THE PRIZE IS LOST' : 'FOUL — YOU HIT HIS HORSE &nbsp;−3') : (M.oFouls >= (M.mode.horseOut || 2) ? 'HE STRUCK YOUR HORSE AGAIN — HE IS DISQUALIFIED' : 'FOUL — HE HIT YOUR HORSE'), 'bad', CALL.foul);
    if (!(M.circuit && profile.herald !== false && HERALD)) say(`Foul! ${who} struck a horse.`, 'THE MARSHAL', 1, { kind: 'result', after: 'strike', prio: 3, phases: RES4 });
    return;
  }
  const broke = hit.broke;
  armourBlow(Aj, Bj, zone, st, geo, hit, glanced, isP);
  bodyBlow(Bj, zone, st, hit, glanced, isP);
  if (hit.sprang && !M.practice) {      // the Renntartsche gives way: it flies off the arm as a piece, and that is the stroke's score
    Bj.shield.getWorldPosition(_hd); Bj.shield.getWorldQuaternion(_qa);
    fxPiece(_hd.clone(), _qa.clone(), 0.42, 0.62, 0.03, new THREE.Vector3(0, 0, Aj.dir * Aj.speed)); fxSparks(_hd.clone(), 8, 3);
    Bj.setShieldGone(true); M.shieldOff[isP ? 1 : 0]++; if (nfx) nfx.sp = 1;
  }
  if (isP && broke) C.flags.broke = true;
  if (!broke && !M.practice) { if (isP) C.kickUp = PHYS.shaft.kick; else opp.lanceLower = Math.min(opp.lanceLower, 1 - PHYS.shaft.kick); }
  const unhorse = hit.unhorse || (broke && G.forceUnhorse === (isP ? 'opp' : 'player'));
  if (!M.practice) C.shock[isP ? 'o' : 'p'] = { t: C.t, power, unhorse, lead: Math.abs(C.lead) / Math.max(closing, 1) };   // lead: seconds until the other point would land
  { const hk = M.practice ? power : clamp(hit.omega * 1.15 * (zone === 'helm' && Bj.visorUp ? 1.5 : 1), 0.4, 7), ho = { headMul: M.kit.bolted ? PHYS.kit.boltedHead : 1, zone, lat: clamp((off ? off[0] : 0) * 0.4 + (zone === 'shield' ? 0.7 : zone === 'helm' ? 0 : 0.15), -1, 1) };
    Bj.hit(hk, true, ho); if (nfx) { nfx.hk = hk; nfx.hm = ho.headMul; nfx.hl = ho.lat; } }
  if (!M.practice) {
    // the horses feel it too: the struck one loses pace by the blow's momentum over his weight, the striker a little by the reaction
    const dv = hit.J / ((PHYS.horseKg[Bj.horseDef.id] || 500) + PHYS.riderKg + (Bj.armourDef.kg ?? 28)) * PHYS.recoil.horse;
    Bj.speed = Math.max(0, Bj.speed - dv); Aj.speed = Math.max(0, Aj.speed - dv * 0.5); if (nfx) nfx.dv = dv;
    // and the struck rider's own lance is thrown off its line (which is why the first blow spoils the second)
    if (isP) C.o.knock.set((Math.random() - 0.5) * 0.26 * power, 0.2 * power); else { arm.vy -= dirP() * 0.6 * PHYS.recoil.arm * power; arm.vp += PHYS.recoil.arm * power * (1 + PHYS.kit.lockKick * (M.kit.lock - 1)); }      // a pinned torso cannot roll with the blow
  }
  const [hd] = hear(_tip);
  audio.impact(power, zone, hd); fxSparks(_tip.clone(), 10 + (power * 14 | 0), 4 + power * 3);
  let brokeAt = 0;
  if (broke) { const seg = Aj.breakLance(breakAt(Math.sqrt(Math.max(0, 1 - square * square)))); if (seg) { brokeAt = seg.at; fxSplinters(seg.a, seg.b, velA, 30 + (power * 34 | 0)); fxShaft(seg.a, seg.b, velA); } audio.lanceBreak(power, hd); M.breaks[isP ? 0 : 1]++; }
  if (nfx && broke) nfx.bk = brokeAt;
  let pts = broke ? (zone === 'helm' ? M.PT.helm : M.PT.broken) : M.PT.attaint, code = broke ? (zone === 'helm' ? 'h' : 'b') : 'a';
  const how = power > 1.0 ? 'shivered his lance to the vamplate' : power > 0.75 ? 'broke his lance clean' : 'broke his lance near the point';
  let text = broke ? `${how} ${zone === 'helm' ? 'on the helm' : zone === 'shield' ? 'upon the shield' : 'on the body'}` : st.turned ? 'his stroke was turned by the shield' : `an attaint on the ${zone}, lance unbroken`;
  // ---- what the rule set makes of it
  { const MD = M.mode, sinT = Math.sqrt(Math.max(0, 1 - square * square));
    if (broke && MD.nearTip && brokeAt > LANCE_REACH - MD.nearTip - 0.1) { pts = M.PT.attaint; code = 'a'; text = 'broke his lance within a foot of the point: no spear broken, only a touch'; }
    else if (broke && MD.crosswise && sinT > MD.crosswise) { pts = M.PT.attaint; code = 'a'; text = 'broke his lance crosswise, not with the point: it counts for nothing'; }
    if (hit.sprang && !broke) { pts = M.PT.broken; code = 'a'; text = 'his shield sprang from the arm: the stroke counts'; }
    if (MD.onlyShield && zone !== 'shield') { pts = 0; text += ' (only the shield scores)'; }
    if (legSoft) { pts = 0; code = 'a'; text = 'struck low on the thigh, on the sack: a soft touch that counts for nothing'; }
  }
  { const st2 = M.stats[isP ? 0 : 1]; if (broke) st2.broken++; else st2.attaint++; if (zone === 'helm') st2.helm++; st2.best = Math.max(st2.best, power); }
  const visorHit = zone === 'helm' && !!Bj.visorUp;      // struck on the helm with the visor raised: the blow goes in under the brow
  { const bodyHit = (D_) => power * 0.2 * (1.35 - (zone === 'helm' ? D_.armourDef.helmProt ?? D_.armourDef.protection : D_.armourDef.protection) * 0.65) * (zone === 'helm' ? 1.3 : 1) * (visorHit ? 2 : 1);
    if (!isP) M.hp.body = Math.max(0, M.hp.body - bodyHit(player)); else if (M.online) M.hpO.body = Math.max(0, M.hpO.body - bodyHit(opp)); }
  if (unhorse) {
    pts = M.PT.unhorse; code = 'u'; text = `UNHORSED ${whom}`;
    // he keeps most of his horse's speed, less what the blow took from him, and slides off the back rather than being thrown up
    const vz = Bj.dir * Math.max(0.5, Bj.speed * 0.72 - hit.J / (PHYS.riderKg + ((Bj.armourDef.kg ?? PHYS.armourKg[Bj.armourDef.id] ?? 28))));
    const uv = new THREE.Vector3(Math.sign(Bj.root.position.x) * (0.6 + Math.random() * 0.8), 0.7 + power * 0.5, vz), us = -(2.6 + power * 1.2);
    Bj.unhorse(uv, us); if (nfx) nfx.un = [uv.x, uv.y, uv.z, us];
    C.cine = Bj; S.slowT = 2.0; if (!isP) M.hp.body = Math.max(0, M.hp.body - 0.4); else if (M.online) M.hpO.body = Math.max(0, M.hpO.body - 0.4);
  }
  st.res = { zone, pts, code, text, broke, unhorse, power, cent, off, glanced, skid: st.skid || null, spoiled: st.spoiled || 0, turned: !!st.turned, E: hit.E, J: hit.J, v: closing, theta: hit.theta, thetaMax: hit.thetaMax };
  const kind = unhorse ? 'unhorse' : broke && zone === 'helm' ? 'helm' : broke ? 'break' : glanced || st.turned ? 'glance' : 'attaint';
  crowdStroke(kind, isP ? 1 : -1);
  // say it plainly, right where the eye is
  const Z = zone.toUpperCase(), sgn = pts > 0 ? `+${pts}` : `${pts}`;
  // One big callout per strike, the most important (the director in callout() keeps the best of the two blows); the rest is in the verdict.
  const cp = unhorse ? CALL.unhorse : visorHit ? CALL.helm : st.turned ? CALL.turned : broke ? CALL[kind] : CALL.attaint;
  if (isP) callout(unhorse ? `UNHORSED! &nbsp;+${pts}` : visorHit ? `HIS VISOR WAS UP! &nbsp;${sgn}` : broke ? `${Z} — LANCE BROKEN &nbsp;${sgn}` : glanced ? `GLANCED OFF THE ${Z} &nbsp;${sgn}` : `${Z} — A TOUCH &nbsp;${sgn}`, 'good', cp);
  else callout(unhorse ? 'YOU ARE UNHORSED' : visorHit ? 'STRUCK WITH YOUR VISOR UP!' : st.turned ? 'YOU TURNED HIS STROKE' : broke ? `HE BROKE HIS LANCE ON YOUR ${Z}` : `HE TOUCHED YOUR ${Z}`, st.turned ? 'good' : 'bad', cp);
  if (!M.practice) {
    // the shout is at the strike (2-4 words, once); the result line follows no earlier than impact + 1 s
    if (unhorse) herald(isP ? 'shoutDown' : 'shoutFall'); else if (broke) herald('shout');
    // the result itself is ONE combined call for both riders, once both lances are spent (finishCourse -> resultCall)
  }
}

// ---- armour damage: which region a hit volume belongs to, how hard it marks, and the marks on the model (jouster.js damage())
const regionOf = (zone, part) => zone === 'shield' ? 'shield' : zone === 'helm' ? 'helm' : /^(breast|back|gorget)$/.test(part || '') ? 'breast' : /^(pauldron|upperArm|foreArm)L$/.test(part || '') ? 'pauldronL' : zone === 'body' && !part ? 'breast' : null;
/** What a stroke does to the two men's bodies (PHYS.body): the striker's lance arm takes the shock back through the hand; the struck man loses his wind and is jolted. */
function bodyBlow(Bj, zone, st, hit, glanced, isP) {
  if (M.practice || zone === 'horse' || zone === 'miss' || zone === 'none') return;
  const K = PHYS.body, A = M.bodyS[isP ? 'p' : 'o'], B = M.bodyS[isP ? 'o' : 'p'], P = clamp(hit.power, 0, 1.6), soft = glanced || st.skid ? 0.4 : 1;
  A.arm = clamp(A.arm + K.armShock * P * (hit.broke ? 0.45 : 1) * soft, 0, 1);
  const w = zone === 'body' ? 1 : zone === 'shield' ? 0.55 : zone === 'helm' ? 0.3 : 0, prot = Bj.armourDef.protection ?? 0.7, dent = Bj.dmg ? Bj.dmg.breast || 0 : 0;
  // load transfer: what does not go into leaning and falling goes into the man (a locked saddle holds him up and winds him; a low one lets him go over and spares him)
  const lk = M.kit.lock - 1, lkW = Math.max(0.2, 1 + PHYS.kit.lockWind * lk), lkA = Math.max(0.2, 1 + PHYS.kit.lockArm * lk);
  B.wind = clamp(B.wind + K.wind * P * w * (1.3 - 0.6 * prot) * (1 + K.dentWind * dent) * (glanced ? 0.5 : 1) * lkW, 0, 1);
  B.arm = clamp(B.arm + K.armJolt * P * w * lkA, 0, 1);
}
function armourBlow(Aj, Bj, zone, st, geo, hit, glanced, isP) {
  if (!Bj.dmg || M.practice || zone === 'horse') return;
  const D = PHYS.damage, part = st.skid ? null : geo && geo.part, region = regionOf(zone, part); if (!region) return;
  const amt = clamp(hit.power, 0.15, 1.4) * D.perPower * (hit.broke ? D.broke : 1) * (zone === 'helm' ? D.helm : 1) * (glanced ? D.glance : 1) * (st.turned ? D.turned : 1);
  if (st.skid || !geo || !geo.p) { if (region === 'breast' || zone === 'body') Bj.zoneWorld('body', _zc); else Bj.zoneWorld(zone, _zc); _ho.copy(_zc); } else _ho.copy(geo.p);     // the real contact point from the collision; else the middle of the mark
  const r = Bj.damage(region, amt, _ho.clone(), M.course * 1000 + C.t, hit.power);
  if (NFX) NFX.dm = [region, amt, _ho.x, _ho.y, _ho.z];
  (C.dNote || (C.dNote = [])).push({ you: !isP, region });
  if (r && r.plume) {      // the plume is knocked off and falls as a piece
    Bj.plume.getWorldPosition(_hd); _hf.set(0.05, 0.3, -0.12).applyQuaternion(Bj.root.quaternion).add(_hd);
    fxShaft(_hd.clone(), _hf.clone(), new THREE.Vector3((Math.random() - 0.5) * 1.5, 2, -Aj.dir * 1.5)); fxSparks(_hd.clone(), 6, 2);
  }
}

// ---- the ONE combined result call (Hugh), once both lances are spent: your stroke, his stroke, the score. An unhorsing or a foul overrides the rest.
const NUMW = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numW = (n) => n < 0 ? `minus ${numW(-n)}` : NUMW[n] ?? String(n);
/** The kind of a stroke, for the phrase pools: miss | attaint | glance | breakShield | breakBody | helm | foul | unhorse. */
function strokeCat(r) {
  if (!r) return 'miss';
  if (r.unhorse) return 'unhorse';
  if (r.foul || r.zone === 'horse') return 'foul';
  if (r.zone === 'miss' || r.zone === 'none') return 'miss';
  if (r.code === 'h') return 'helm';
  if (r.code === 'b') return r.zone === 'shield' ? 'breakShield' : 'breakBody';
  return r.glanced || r.turned ? 'glance' : 'attaint';
}
function resultCall(p, o) {
  if (!M || (!M.circuit && !M.mode.own) || profile.herald === false || !HERALD || !HERALD.RES_YOU) return;
  const picks = [], P = (name, pool) => { const k = pickLine(name, pool); if (!k) return ''; picks.push(k); return k.raw; };
  const cy = strokeCat(p), ch = strokeCat(o), yo = M.score[0], hi = M.score[1], now = Math.sign(yo - hi), was = C.prevLead ?? 0;
  const parts = [];
  if (cy === 'unhorse' || ch === 'unhorse') {      // an unhorsing says it all
    parts.push(cy === 'unhorse' && ch === 'unhorse' ? P('RES_UNHORSE_BOTH', HERALD.RES_UNHORSE_BOTH) : cy === 'unhorse' ? P('RES_UNHORSE_YOU', HERALD.RES_UNHORSE_YOU) : P('RES_UNHORSE_HIM', HERALD.RES_UNHORSE_HIM));
  } else {
    if (cy === ch) { parts.push(P('RES_BOTH.' + cy, HERALD.RES_BOTH[cy])); if (p.pts > 0 && p.pts === o.pts && (cy.startsWith('break') || cy === 'helm')) parts.push(P('RES_APIECE', HERALD.RES_APIECE)); }
    else if (cy === 'foul') parts.push(P('RES_YOU.foul', HERALD.RES_YOU.foul)); else if (ch === 'foul') parts.push(P('RES_HIM.foul', HERALD.RES_HIM.foul));      // a foul stands alone
    else parts.push(P('RES_YOU.' + cy, HERALD.RES_YOU[cy]), P('RES_HIM.' + ch, HERALD.RES_HIM[ch]));
    if (C.tiltStruck) parts.push(P('RES_TILT', HERALD.RES_TILT));
    if (M.mode.firstBreak) { if (C.mutual && !M.result) parts.push('both broke together, so neither is first. Ride again.'); }      // sudden death keeps no score
    else { const S_ = HERALD.SCORE, k = yo === 0 && hi === 0 ? 'none' : now === 0 ? 'level' : now !== was ? (now > 0 ? 'youTakes' : 'himTakes') : now > 0 ? 'youAhead' : 'himAhead';
      parts.push(P('SCORE.' + k, S_[k])); }
  }
  const text = parts.filter(Boolean).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' '); if (!text) return;      // each part starts a sentence
  herald('result', 0, { text, vars: { yourW: numW(yo), hisW: numW(hi), n: numW(yo), pts: cap(numW(Math.abs(p.pts))) }, onShown() { picks.forEach(k => k.done()); C.resultSaid = true; } });
}

const brk = (r) => !!r && !r.foul && (r.code === 'b' || r.code === 'h');      // a lance broken on the man (a touch, a miss or a foul is not)
/** Judged Tilt, once the player's lance is up (or the grace has run out): the judges' style marks for both knights, then the count if it is the last course.
 *  Marks: +1 a steady lance (your LANCE TIMING reading is good; his: his skill on the day), +1 raised in good time (yours: within LANCE_UP.quick of the stroke;
 *  his: he always raises it), and -1 for a lance left low (already applied to you at the moment it happened, see the raise in update). */
function settleCount() {
  const t = C.tech, you = [], him = [];
  if (t && t.lance >= 0.75) you.push('a steady lance');
  if (C.flags.recover) you.push('the lance raised in good time');
  if (C.o.q >= 0.7) him.push('a steady lance');
  him.push('the lance raised in good time');
  M.score[0] += you.length; M.score[1] += him.length; C.pts[0] += you.length; C.pts[1] += him.length; M.maxDef = Math.max(M.maxDef, M.score[1] - M.score[0]);
  C.style = { you, him };      // (shown in the verdict; not read out: Hugh's call is already at its word cap)
  if (M.course >= M.courses) {
    const yo = M.score[0], hi = M.score[1], fa = M.tilts + M.fouls, fb = M.oFouls || 0;
    if (yo !== hi) M.result = yo > hi ? 'win' : 'loss';
    else if (fa !== fb) { M.result = fa < fb ? 'win' : 'loss'; if (M.result === 'win') M.how = 'the fewer faults'; M.note = `Level at ${yo}: the heralds give it to ${fa < fb ? 'you' : M.od.short} for the fewer faults (${fa} against ${fb})`; }
    else { M.result = 'draw'; M.note = `Level at ${yo} with the same faults: the card is drawn`; }
  }
  updateHud(true);
}

/** Sudden Death's one-line verdict, from M.result (the same words on both sides online, once the result is mirrored). */
function suddenNote() {
  const n = ORD[M.course - 1] || 'last', him = M.od.short;
  return ({ 'win': `Sudden death: you broke the first lance, in the ${n} course`, 'loss': `Sudden death: ${him} broke the first lance, in the ${n} course`,
    'win-unhorse': `Sudden death: you bore ${him} down in the ${n} course`, 'loss-unhorse': `Sudden death: ${him} bore you down in the ${n} course`,
    'draw': C.mutual ? `Sudden death: both lances broke together in the last course, and none is left to ride` : `Sudden death: no lance was broken in ${M.courses} courses, so the joust is void` })[M.result] || '';
}
function finishCourse() {
  const p = C.pL.res, o = C.oL.res;
  if (!C.tech) C.tech = techSnapshot(null, 0);
  { const T = M.tech; for (const k of ['sight', 'lance', 'horse', 'will']) T[k] += Math.min(1, C.tech[k]); T.n++; }
  let pp = p.pts, op = o.pts;
  if (C.tiltStruck) pp += C.tiltPts ?? M.PT.foulTilt;
  if (S.online && C.oTiltPts != null) op += C.oTiltPts;      // (his barrier, reported by him)
  if (C.coronel && M.PT.coronel) { pp += M.PT.coronel; op += M.PT.coronel; }      // the two points met: counted to both
  // (optional rule, off by default: see SLOW_PACE) a course run too slowly, or checked in the last strides, is marked against you
  if (SLOW_PACE > 0 && !M.practice && !M.online && p.zone !== 'none' && ((C.meetSpeed ?? 9) < GAIT_SPEED[3] * SLOW_PACE || C.checked)) { C.slow = true; pp += M.PT.slow; }
  C.prevLead = Math.sign(M.score[0] - M.score[1]);
  M.score[0] += pp; M.score[1] += op; C.pts = [pp, op]; M.maxDef = Math.max(M.maxDef, M.score[1] - M.score[0]);
  M.marks[0].push(p.code); if (!M.practice) M.marks[1].push(o.code);
  if (M.practice) {
    const L = LESSONS[M.lesson], ok = L.steps.every(s => C.flags[s[1]]);
    C.lessonOk = ok;
    if (ok) { M.lesson++; profile.lesson = Math.min(M.lesson, LESSONS.length); saveProfile(); if (M.lesson >= LESSONS.length) { M.result = 'practice'; M.lesson = LESSONS.length - 1; } }
  }
  else if (p.unhorse && !o.unhorse) M.result = 'win-unhorse'; else if (o.unhorse && !p.unhorse) M.result = 'loss-unhorse';
  else if (M.fouls >= (M.mode.horseOut || 2) || M.tilts >= (M.mode.tiltOut || 99)) M.result = 'loss-dq';
  else if (M.online && M.oTilts >= (M.mode.tiltOut || 99)) { M.result = 'win-dq'; M.how = 'his striking the barrier again'; }
  else if ((M.oFouls || 0) >= (M.mode.horseOut || 2)) { M.result = 'win-dq'; M.how = 'his striking your horse'; }
  else if (M.mode.sightWin && (M.sights[0] >= M.mode.sightWin) !== (M.sights[1] >= M.mode.sightWin)) { M.result = M.sights[0] >= M.mode.sightWin ? 'win' : 'loss'; M.how = 'three strokes in the sight of the helm'; }
  else if (M.mode.firstBreak && brk(p) !== brk(o)) M.result = brk(p) ? 'win' : 'loss';      // sudden death: the first lance broken decides it; both in one course settles nothing
  else if (M.hp.body <= 0.02) M.result = 'loss-yield';
  else if (M.online && M.hpO.body <= 0.02) M.result = 'win-yield';
  else if (M.mode.firstBreak && M.course >= M.courses) { M.result = 'draw'; M.void = true; }      // no first blood in the courses allowed: the joust is void
  else if (M.mode.style) C.countDue = true;      // the judges' card: the style marks wait for your lance to come up (settleCount, from aftermath)
  else if (M.course >= M.courses) {
    if (M.score[0] !== M.score[1]) M.result = M.score[0] > M.score[1] ? 'win' : 'loss';
    else if (M.mode.noExtra || M.course >= M.courses + 2) M.result = 'draw';
  }
  if (M.mode.firstBreak && !M.practice) {
    C.mutual = brk(p) && brk(o);
    M.note = suddenNote();
  }
  if (!M.practice) {      // feats of the course (the toasts wait for the verdict)
    const real = p.broke && p.zone !== 'horse' && !p.foul;
    withFeats(() => courseFeats(profile, { broke: real, helm: real && p.code === 'h', unhorse: !!p.unhorse, perfect: real && p.code === 'h' && !!C.perfectHit }));
  }
  if (!M.practice) C.resultArgs = [p, o];      // Hugh's call waits for the judges' flags (raiseJudges)
  updateHud(true);
  if (S.online) netSendCourse(p, o, pp, op);
}

// ------------------------------------------------------------------ the verdict: what happened, drawn and in plain words
function plain(res, st, mine) {
  const him = M.practice ? 'the quintain' : M.od.short;
  const own = !M.practice && M.mode.own, ptw = (n) => n === 0 ? 'no points' : n === 1 ? 'one point' : `${numW(n)} points`;      // the rules-only modes state their own cheque
  if (!res || res.zone === 'none') return [M.practice ? '—' : 'UNHORSED FIRST', ''];
  if (res.zone === 'miss' && res.across) return [mine ? 'BROKE ACROSS HIM' : 'BROKE ACROSS YOU', 'the shaft broke crosswise, not on its point: it counts for nothing'];
  if (res.zone === 'miss') return [res.up ? 'LANCE NEVER LOWERED' : res.early ? 'LANCE RAISED TOO SOON' : 'MISSED', res.up ? 'the lance stayed upright' : res.early ? 'it was down, but you let it up a moment before the lances met' : (st.near ? `passed ${Math.max(0.05, st.near.d).toFixed(1)} m wide of the ${st.near.zone}` : 'no touch')];
  if (res.zone === 'horse') return ['HIT THE HORSE — FOUL', mine ? `aim higher than ${him}'s horse` : 'a foul stroke against you'];
  const Z = res.zone.toUpperCase();
  if (res.unhorse) return [mine ? 'UNHORSED HIM' : 'UNHORSED YOU', `struck the ${res.zone} and bore the rider from the saddle`];
  if (res.turned) return [`${Z} — TURNED ASIDE`, 'the shield came up and the point glanced off'];
  if (res.glanced) return [`${Z} — GLANCED OFF`, 'the point met it at too flat an angle and skidded away: ' + (own ? ptw(M.PT.attaint) : 'one point') + '. Hit nearer the middle'];
  const skidded = res.skid ? `the point skidded off the ${res.skid} first · ` : '';
  const phys = res.E ? ` · met at ${Math.round(res.v * 3.6)} km/h, ${Math.round(res.E)} joules through the point` : '';
  const spoilt = res.spoiled > 0.3 ? (mine ? ' · he struck you first and it spoiled your stroke' : ' · you struck him first and spoiled his stroke') : '';
  if (res.broke) return [`${Z} — LANCE BROKEN`, skidded + (own && M.mode.firstBreak ? (C && C.mutual ? 'a lance broken, but so was his' : 'a lance broken: that decides the joust') : res.zone === 'helm' ? `the hardest mark: ${own ? ptw(M.PT.helm) : 'three points'}` : `a broken lance: ${own ? ptw(M.PT.broken) : 'two points'}`) + phys + spoilt];
  return [`${Z} — A TOUCH`, `${skidded}the lance did not break: ${own ? (M.mode.firstBreak ? 'a touch counts for nothing' : ptw(M.PT.attaint)) : 'one point'}${res.E ? ` · only ${Math.round(res.E)} joules — ${res.spoiled > 0.3 ? (mine ? 'he struck you first and spoiled your stroke' : 'you struck him first and spoiled his stroke') : 'too glancing or too slow'}` : ''}`];
}
/** "Your shield is split. His helm is badly dented." for each region marked this course that is now badly hit. */
function harnessNotes() {
  const D = PHYS.damage, said = new Set(), out = [];
  const word = { shield: ['is split', 'hangs in splinters'], helm: ['is badly dented', 'is crushed'], breast: ['is badly dented', 'is stove in'], pauldronL: ['is buckled', 'is crushed'] };
  const name = { shield: 'shield', helm: 'helm', breast: 'breastplate', pauldronL: 'shoulder plate' };
  for (const n of C.dNote || []) {
    const who = n.you ? player : opp, key = (n.you ? 'y' : 'h') + n.region, v = who.dmg ? who.dmg[n.region] : 0;
    if (said.has(key) || v < D.badAt) continue; said.add(key);
    out.push(`${n.you ? 'Your' : 'His'} ${name[n.region]} ${word[n.region][v >= 0.85 ? 1 : 0]}.`);
  }
  return out.join(' ');
}
function showVerdict() {
  const p = C.pL.res, o = C.oL.res, t = C.tech, fmt = (n) => (n > 0 ? '+' : '') + n;
  const [pw, ps] = plain(p, C.pL, true), [ow, os] = plain(o, C.oL, false);
  $('vwhoYou').textContent = 'YOUR LANCE'; $('vwhatYou').innerHTML = `${pw}<small>${ps}${C.tiltStruck ? ` · you also hit the barrier −${-(C.tiltPts ?? 2)}` : ''}${C.coronel && M.PT.coronel ? ` · the lances met point to point +${M.PT.coronel}` : ''}${C.style && C.style.you.length ? ` · the judges mark ${C.style.you.join(' and ')} +${C.style.you.length}` : ''}${C.mutual && !M.result ? ' · both lances broke together: no first blood, ride again' : ''}${C.slow ? (C.checked ? ' · you checked your horse before the shock −1' : ' · you came on too slowly −1') : ''}</small>`;
  $('vptsYou').textContent = fmt(C.pts[0]); $('vptsYou').classList.toggle('neg', C.pts[0] < 0);
  $('vwhoHim').textContent = M.practice ? 'THE LESSON' : 'HIS LANCE';
  if (M.practice) { $('vwhatHim').innerHTML = C.lessonOk ? 'LESSON LEARNED<small>on to the next</small>' : 'TRY AGAIN<small>see the list on the left</small>'; $('vptsHim').textContent = C.lessonOk ? '✓' : '↻'; }
  else { $('vwhatHim').innerHTML = `${ow}<small>${os}${C.style ? ` · the judges mark ${C.style.him.join(' and ')} +${C.style.him.length}` : ''}</small>`; $('vptsHim').textContent = fmt(C.pts[1]); }
  $('vptsHim').classList.toggle('neg', !M.practice && C.pts[1] < 0);
  drawHitMap($('hitYou'), p, C.pL.near, { quintain: M.practice, arms: M.od.arms });
  if (M.practice) drawHitMap($('hitHim'), null, null, { blank: true, ok: C.lessonOk }); else drawHitMap($('hitHim'), o, C.oL.near, { arms: profile.arms });
  const state = (v) => (v >= 0.75 ? 'good' : v >= 0.45 ? 'ok' : 'bad');
  const item = (k, icon, label) => `<div class="vt ${state(t[k])}"><span class="vi">${icon}</span>${label}</div>`;
  $('vtech').innerHTML = item('sight', '◎', 'AIM') + item('lance', '⟋', 'LANCE TIMING') + item('horse', '♞', 'HORSE') + item('will', '✊', 'LEAN IN');
  const weakest = ['sight', 'lance', 'horse', 'will'].sort((a, b) => t[a] - t[b])[0];
  $('vtip').textContent = (harnessNotes() + ' ') + (t[weakest] >= 0.75 ? 'A fine course — nothing to mend.' : t.tips[weakest]);
  $('vhint').innerHTML = 'Your knight wheels about for the next course &nbsp;·&nbsp; <b>R</b> watch the replay again';
  $('flashTxt').className = '';
  $('verdict').classList.remove('hidden');
  scoreLine();
}
/** The herald reads the score only when it is news: the lead changes, it comes level, or the last course is next. The HUD shows the rest. */
function scoreLine() {
  if (M.practice || M.result) return;
  const was = C.prevLead ?? 0, now = Math.sign(M.score[0] - M.score[1]);
  // the combined result call has just named the score (and the lead changing hands): do not say it twice in the same gap
  const key = now !== was ? (C.resultSaid ? null : now > 0 ? 'leadYou' : now < 0 ? 'leadHim' : 'scoreLevel') : (M.course >= M.courses - 1 ? 'matchPoint' : null);
  if (key) herald(key);
}
/** The royal box reacts (camera cut and caption). Returns the herald key for it, or null: the herald may add a colour line (see betweenColour). */
function royalReaction() {
  if (!M.circuit || !world.setRoyalMood) return null;
  const p = C.pL.res, o = C.oL.res;
  let mood = null, cap = '';
  if (p.foul) { mood = 'displeased'; cap = 'The King turns his face away.'; }
  else if (p.code === 'h' || p.unhorse) { mood = 'rise'; cap = 'The King and Queen rise to their feet.'; }
  else if (p.broke) { mood = 'applaud'; cap = 'The Queen applauds your stroke.'; }
  else if (o.broke && !p.broke) { mood = 'applaud'; cap = `The court applauds ${M.od.short}.`; }
  if (!mood) return p.zone === 'miss' && Math.random() < 0.5 ? 'royalJoke' : null;      // no cut for a miss: the host may make a joke
  world.setRoyalMood(mood); C.cut = { kind: 'royal', t: 2.6 }; $('verdict').classList.add('hidden');
  $('royalCap').textContent = cap; $('royalCap').classList.remove('hidden');
  return mood === 'rise' ? 'royalRise' : mood === 'displeased' ? 'royalDispleased' : 'royalPleased';
}

/** Keep the Bridge: the bout that has just ended goes on the record, and the knight's state is kept for the next. Decided once two bouts are won, or when two can no longer be. */
function bridgeRecord() {
  const B = M.bridge, r = M.result;
  if (r.startsWith('win')) B.wins++; else if (r === 'draw') B.draws++; else B.losses++;
  B.log.push({ short: M.od.short, res: r, score: [...M.score] });
  B.tot.broken += M.breaks[0]; B.tot.helm += M.stats[0].helm; B.tot.courses += M.course;
  B.held = B.wins >= 2; B.final = B.held || B.wins + (B.n - B.bout) < 2;
  if (!B.final) B.keep = bridgeKeep();
}
/** "You lead 1–0", "Level 1–1", "They lead 0–1": the running record of the bridge (bouts won against bouts lost; a drawn bout counts for neither). */
function bridgeRecordText(B) {
  const w = B.wins, l = B.losses, d = B.draws ? `, ${B.draws} drawn` : '';
  return (w > l ? `You lead ${w}–${l}` : w < l ? `They lead ${l}–${w}` : `Level ${w}–${l}`) + d;
}
function bridgeRecordSpoken(B) { const w = B.wins, l = B.losses; return w > l ? `${profile.name} leads, ${numW(w)} to ${numW(l)}` : w < l ? `The challengers lead, ${numW(l)} to ${numW(w)}` : `The bouts stand level at ${numW(w)} each`; }
function showCard() {
  const p = C.pL.res, o = C.oL.res, t = C.tech;
  $('verdict').classList.add('hidden'); $('flashTxt').className = '';
  const B = M.bridge; if (B) bridgeRecord();
  const final = !B || B.final, res = B && final ? (B.held ? 'win' : 'loss') : M.result;      // what the title, the purse and the herald answer to: the bridge's end, or this bout
  const nextOd = B && !final ? KNIGHTS.find(k => k.id === B.queue[B.bout]) : null;
  $('cardTitle').textContent = B ? (final ? (B.held ? 'THE BRIDGE IS HELD' : 'THE BRIDGE IS LOST') : M.result.startsWith('win') ? 'BOUT WON' : M.result === 'draw' ? 'BOUT DRAWN' : 'BOUT LOST')
    : M.void ? 'THE JOUST IS VOID' : { 'win': 'VICTORY', 'win-unhorse': 'VICTORY BY UNHORSING', 'loss': 'DEFEAT', 'loss-unhorse': 'UNHORSED', 'loss-dq': 'DISQUALIFIED', 'win-dq': 'VICTORY — HE IS DISQUALIFIED', 'loss-yield': 'YOU YIELD — TOO BATTERED TO RIDE', 'win-yield': 'VICTORY — HE YIELDS', 'draw': 'HONOURS EVEN', 'practice': 'YOU ARE READY FOR THE LISTS' }[M.result];
  $('cardReplays').classList.toggle('hidden', !recList().length);
  if (S.online && M.result && NET.net) rematchHint(); else
  $('cardHint').textContent = nextOd ? `The next challenger is ${nextOd.short} · ${touchMode ? 'TAP' : 'SPACE / CLICK'} to meet him` : touchMode ? 'TAP to continue' : 'SPACE / CLICK to continue';
  if (M.how) voice.later(0.4, () => say(`The prize is given for ${M.how}.`, 'THE JUDGES', 1, { ttl: 8 }));
  const base = `${profile.name} ${M.score[0]} — ${M.score[1]} ${M.od.short}`;
  $('cardSub').textContent = M.result === 'practice' ? 'The master of horse has nothing more to teach you here. Ride the circuit.'
    : B ? (final ? `${B.held ? 'The bridge is held' : 'The bridge is lost'}: ${B.wins} of ${B.n} bouts won · ` : `Bout ${B.bout} of ${B.n} · ${bridgeRecordText(B)} · `) + base
    : M.mode.firstBreak ? (M.note || base) : M.note ? `${base} · ${M.note}` : base;
  const fmt = (n) => (n > 0 ? '+' : '') + n;
  const [pw] = plain(p, C.pL, true), [ow] = plain(o, C.oL, false);
  $('cardCols').innerHTML = `<div class="who"><span class="pts">${fmt(C.pts[0])}</span><h4>${profile.name.toUpperCase()}</h4><div class="res">${pw}</div></div>
    <div class="who"><span class="pts">${M.practice ? '' : fmt(C.pts[1])}</span><h4>${M.od.short.toUpperCase()}</h4><div class="res">${M.practice ? '' : ow}</div></div>`;
  const T = M.tech, pc = (k) => Math.round(T[k] / Math.max(1, T.n) * 100);
  const row = (k, name) => `<div class="trow"><b>${name}</b><div class="tb"><i style="width:${pc(k)}%"></i></div><span>${pc(k)}</span></div>`;
  $('cardRows').innerHTML = row('sight', 'AIM') + row('lance', 'LANCE') + row('horse', 'HORSE') + row('will', 'LEAN IN');
  const a = M.stats[0], b = M.stats[1], f = (l, x, y) => `<div class="fact"><span>${x}</span><i>${l}</i><span>${y}</span></div>`;
  $('cardFacts').innerHTML = M.practice ? '' : `<h6>MATCH FACTS</h6>` + f('LANCES BROKEN', a.broken, b.broken) + f('TOUCHES', a.attaint, b.attaint) + f('HELM STRIKES', a.helm, b.helm) + f('CLEAN MISSES', a.miss, b.miss)
    + f('TOP SPEED', `${Math.round(a.top * 3.6)} km/h`, `${Math.round(b.top * 3.6)} km/h`) + f('HARDEST STROKE', `${Math.round(a.best * PHYS.refJ)} J`, `${Math.round(b.best * PHYS.refJ)} J`);
  $('cardTimeline').style.display = 'none';
  $('card').classList.remove('hidden');
  const win = res.startsWith('win') || res === 'practice';
  fanfare(win ? 'victory' : res === 'draw' ? 'short' : 'defeat');
  react(win ? 'win' : 'loss', 1, false);      // the card and the herald speak; no crowd line on top
  if (world.setRoyalMood && M.circuit) world.setRoyalMood(win ? 'rise' : 'applaud');
  retinueSpeak(win ? 'won' : res === 'draw' ? null : 'lost', 0.85, 5.5);
  { // Hugh's call: the rules-only modes word their own (the pools speak of "the cheque"); the rest use the pools
    let text = null; const him = M.od.short, wl = (a, b) => win ? a : b;
    if (B) {
      text = final ? (B.held ? `The bridge is held. ${profile.name} has won ${numW(B.wins)} of the ${numW(B.n)} bouts.` : `The bridge is lost. ${profile.name} has won only ${numW(B.wins)} of the ${numW(B.n)} bouts.`)
        : `${M.result.startsWith('win') ? `A bout to ${profile.name}.` : M.result === 'draw' ? `The bout with ${him} is drawn.` : `${him} takes the bout.`} ${bridgeRecordSpoken(B)}. The next challenger is ${hailName(nextOd)}, of ${nextOd.land}.`;
    } else if (M.mode.firstBreak && M.note) text = M.void ? (C.mutual ? 'Both lances broke together in the last course, and none is left to ride. The joust is void, and no purse is paid.' : `Neither knight broke a lance in ${numW(M.courses)} courses. The joust is void, and no purse is paid.`)
      : `${M.note}. ${wl('The joust is yours.', `The joust goes to ${him}.`)}`;
    else if (M.mode.style && M.note) text = `${M.note}. ${wl('The joust is yours.', `The joust goes to ${him}.`)}`;
    const hk = win ? 'win' : res === 'draw' ? 'draw' : 'loss';
    voice.later(0.8, () => text ? herald(hk, 0, { text }) : herald(hk));
  }
  if (win && M.circuit) voice.later(12, () => herald('prize'));
  if (!M.practice && !M.online && final) {      // (online: no purse, no renown, no feats)
    // the reckoning: what the day brought in, what it cost, and what it added to your name
    const rk = reckon({ vIdx: M.vIdx, result: res, circuit: M.circuit, courses: B ? B.tot.courses : M.courses, practice: false, void: !!M.void, bouts: B ? B.wins : 0, lance: profile.lance || 'standard', broken: B ? B.tot.broken : M.breaks[0], helms: B ? B.tot.helm : M.stats[0].helm, body: M.hp.body, horseHp: M.hp.horse,
      court: M.fav.court, horse: profile.horse, armour: profile.armour, helm: profile.helm, retinue: profile.retinue, oppHorse: M.od.horse, oppArmour: M.od.armour, skills: profile.skills });
    const rb = rankOf(profile.renown);
    settle(profile, rk); M.reckoning = rk;
    const won = res.startsWith('win');      // the feats of the match (their renown is paid before the rank is read)
    showFeats(matchFeats(profile, { won, venue: M.V.id, mode: M.mode.id, opp: M.od.id, cleanSheet: M.score[0] > 0 && M.score[1] <= 0, comeback: M.maxDef >= 3, ironSeat: M.stats[1].best < 0.75,
      sightWin: !!M.mode.sightWin && M.result === 'win' && !!M.how }));
    saveProfile();
    const rankUp = rankOf(profile.renown) > rb;
    const sgn = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
    $('cardFacts').innerHTML += `<h6>THE RECKONING</h6>` + rk.lines.map(l => `<div class="led ${l[1] < 0 ? 'neg' : ''}"><span>${l[0]}</span><span>${sgn(l[1])}</span></div>`).join('')
      + `<div class="led sum ${rk.total < 0 ? 'neg' : ''}"><span>${rk.total < 0 ? 'The day cost you' : 'The day brought you'}</span><span>${Math.abs(rk.total)} marks</span></div>`
      + `<div class="led note"><span>${purseText(profile.gold)} &nbsp;·&nbsp; +${rk.renown} renown</span></div>`
      + rankBar(profile.renown);
    if (rankUp) announceRank(true); else if (M.rankPending) rankSay(rankOf(profile.renown));      // the card is up: the notice may show
  }
  if (B) $('cardFacts').innerHTML += `<h6>THE BRIDGE</h6>` + B.log.map((b, i) => f(`BOUT ${i + 1} · ${b.short.toUpperCase()}`, b.res.startsWith('win') ? 'won' : b.res === 'draw' ? 'drawn' : 'lost', `${b.score[0]} — ${b.score[1]}`)).join('');
  if (M.circuit) recordCircuit();
  if (S.online) rankReport();
}

// ------------------------------------------------------------------ instant replay
function lerpSnap(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' && typeof y === 'number') o[key] = x + (y - x) * k;
    else if (Array.isArray(x) && Array.isArray(y)) o[key] = x.map((v, i) => v + (y[i] - v) * k);
    else o[key] = k < 0.5 ? x : y;
  }
  if (a.unhorsed !== b.unhorsed) { const s = k < 0.5 ? a : b; o.unhorsed = s.unhorsed; o.rp = s.rp; o.rq = s.rq; o.tx = s.tx; }
  if (a.dir !== b.dir) return k < 0.5 ? a : b;
  return o;
}
function replayGeom() {
  const f = R.f; let k = f.findIndex(fr => fr.t >= R.tImp); if (k < 0) k = f.length - 1;
  R.z = (f[k].p.pz + (f[k].o.pz ?? 0)) / 2; R.side = Math.sign(f[k].p.px) || -1; R.pd = f[k].p.dir || 1; if (M.practice) R.z = 0;      // where the lances met, the side of the tilt you ride on, which way you ride
}
const ANGLES = ['LOW SIDE', 'CHASE', 'REVERSE', 'CRANE', 'IMPACT', 'FALL'];      // 0-4 are the five angles (V cycles them); 5 is the follow-the-fallen-man camera of an unhorsing replay
/** The camera passes of the automatic replay (EA FC goal-replay style): one angle for an ordinary course, two for a break, three for a helm break or an unhorsing. Times are relative to the impact. */
function planPasses() {
  const f = R.f, p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  const un = !!C.cine && !!((p && p.unhorse) || (o && o.unhorse)), helm = (real(p) && p.code === 'h') || (real(o) && o.code === 'h'), brk = real(p) || real(o);
  const main = [0, 2, 1, 3][M.course % 4];
  const N = (shot, a, b, prof) => { let t0 = Math.max(f[0].t, R.tImp + a); const t1 = Math.min(f[f.length - 1].t, R.tImp + b); if (t1 - t0 < 0.4) t0 = Math.max(f[0].t, t1 - 0.4); return { shot, t0, t1, prof }; };
  if (un) { R.fallP = C.cine === player; R.fall = new THREE.Vector3(); R.fdir = C.cine.dir || 1; R.fx0 = Math.sign(C.cine.root.position.x) || 1; return [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c'), N(5, -0.25, 1.8, 'f')]; }
  if (helm) return [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c'), N(main === 2 ? 3 : 2, -0.7, 0.5, 'n')];
  if (brk) return [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c')];
  return [N(main, -0.8, 0.65, 'n')];
}
/** How fast the recording runs at d seconds from the impact: it slows to a crawl through the strike. */
function passSpeed(P, d) {
  if (P.prof === 'f') return d < 0.3 ? 0.4 : 0.4 + 0.2 * clamp((d - 0.3) / 0.7, 0, 1);
  const k = P.prof === 'c' ? [0.7, 0.09] : [0.8, 0.15];
  return k[0] - (k[0] - k[1]) * Math.exp(-(d * d) / (0.22 * 0.22));
}
function startReplay(opt = {}) {
  const f = C.rec.f, tImp = C.hitT ?? C.ev.impact ?? f[f.length - 1].t;
  R = { f, ev: C.rec.ev, tImp, i: 0, e: 0, liveP: player.snapshot(), liveO: opp.snapshot(), back: S.mode, live: !opt.frozen, hl: false, course: M.course, fxDt: 0, rate: 1, shot: 0, pass: 0, t: 0, t0: 0, t1: 1 };
  replayGeom(); R.passes = planPasses(); setPass(0);
  if (!R.live) player.replaying = opp.replaying = true;      // a live replay dresses the riders afresh each frame (replayDress), so that his ride-out turn goes on underneath
  fx.clear(); showMarks(R.t, R.course);
  S.mode = 'replay'; S.slowT = 0; S.timeScale = 1;
  $('replayTag').classList.remove('hidden'); $('replayKeys').classList.remove('hidden'); $('hud').classList.add('hidden'); $('verdict').classList.add('hidden'); if (!(C.capT > 0)) $('royalCap').classList.add('hidden');
  $('replayKeys').innerHTML = touchMode ? '' : '<kbd>V</kbd> change view &nbsp;&nbsp; <kbd>SPACE</kbd> skip &nbsp;&nbsp; <kbd>ESC</kbd> menu';
  // what each lance did, drawn at the bottom corners while the replay runs
  const p = C.pL.res, o = C.oL.res;
  if (p) { drawHitMap($('rhitYou'), p, C.pL.near, { quintain: M.practice, arms: M.od.arms }); $('rwhatYou').textContent = plain(p, C.pL, true)[0]; $('replayYou').classList.remove('hidden'); }
  if (o && !M.practice) { drawHitMap($('rhitHim'), o, C.oL.near, { arms: profile.arms }); $('rwhatHim').textContent = plain(o, C.oL, false)[0]; $('replayHim').classList.remove('hidden'); }
  if (C.resultArgs && !M.practice) C.colourLater = true; else replayColour();      // exactly one colour line, ~1.5 s in (no more if you watch it again); after Hugh's call if that is still to come
}
function replayTag() { $('replayTag').textContent = `${R.hl ? 'COURSE ' + R.course : R.passes.length > 1 ? `REPLAY ${R.pass + 1}/${R.passes.length}` : 'INSTANT REPLAY'} · ${ANGLES[R.shot]}`; }
/** Start camera pass n of the automatic replay: the frames and fx events rewind to its start and the camera cuts. */
function setPass(n) {
  const P = R.passes[n]; R.pass = n; R.shot = P.shot; R.t0 = P.t0; R.t1 = P.t1; R.cut = true; replaySeek(P.t0); replayTag();
}
function replaySeek(t) {
  R.t = clamp(t, R.t0, R.t1); R.e = R.ev.findIndex(e => e.t > R.t); if (R.e < 0) R.e = R.ev.length; fx.clear();
}
/** V during a replay: the next of the five angles (the fall camera of an unhorsing hands back to the first). */
function replayView() {
  if (!R) return;
  R.shot = (R.shot + 1) % 5; R.cut = true; if (R.hl) S.rplShot = R.shot; replayTag();
}
function updateReplay(dtReal, dt) {
  if (R.live) {      // his ride-out turn (and yours, until you take the rein) goes on in game time underneath: undress the riders, run the course's own logic, dress them again later in the frame
    replayUndress(); const m = S.mode; S.mode = R.back; updateRide(dt, dtReal); S.mode = m;
  }
  if (R.hl) {
    if (!R.pause) { R.t += dtReal; if (R.t >= R.t1) replaySeek(R.t0); }
    R.fxDt = R.pause ? 0 : dtReal;
  } else {
    const P = R.passes[R.pass]; R.rate = passSpeed(P, R.t - R.tImp); R.t += dtReal * R.rate; R.fxDt = dtReal * R.rate;
    if (R.t >= P.t1) { if (R.pass < R.passes.length - 1) setPass(R.pass + 1); else endReplay(); }
  }
}
/** Put the riders into the replay pose for this frame (a live replay first saves how they really stand). */
function replayDress() {
  if (!R) return;
  if (R.live) { R.liveP = player.snapshot(); R.liveO = opp.snapshot(); R.lr = [player.raiseT, opp.raiseT]; player.replaying = opp.replaying = true; R.dressed = true; }
  const f = R.f, t = R.t;
  while (R.i > 0 && f[R.i].t > t) R.i--;
  while (R.i < f.length - 2 && f[R.i + 1].t <= t) R.i++;
  const a = f[R.i], b = f[Math.min(R.i + 1, f.length - 1)], k = clamp((t - a.t) / Math.max(1e-5, b.t - a.t), 0, 1);
  R.sp = lerpSnap(a.p, b.p, k); R.so = lerpSnap(a.o, b.o, k);
  player.applySnap(R.sp); opp.applySnap(R.so); showMarks(t, R.course);
  player.update(0); opp.update(0);
  if (R.fall) {   // where the fallen rider is, for the fall camera
    const fs = R.fallP ? R.sp : R.so;
    if (fs.unhorsed && fs.rp) R.fall.set(fs.rp[0], fs.rp[1], fs.rp[2]); else R.fall.set(fs.px, 1.5, fs.pz);
    R.fdir = fs.dir || R.fdir;
  }
  while (R.e < R.ev.length && R.ev[R.e].t <= t) { const e = R.ev[R.e++]; if (e.k === 'spl') fx.splinters(e.a, e.b, e.v, e.n); else if (e.k === 'sh') fx.shaft(e.a, e.b, e.v); else if (e.k === 'pc') fx.piece(e.p, e.q, e.sx, e.sy, e.sz, e.v); else fx.sparks(e.p, e.n, e.s); }
  fx.update(R.fxDt);
}
function replayUndress() {
  if (!R || !R.dressed) return; R.dressed = false;
  player.applySnap(R.liveP); opp.applySnap(R.liveO); player.raiseT = R.lr[0]; opp.raiseT = R.lr[1]; player.replaying = opp.replaying = false;
}
/** The replay cameras, each a function of the recorded frame (R.sp, R.so: you and he at replay time R.t). */
function replayCam() {
  const sp = R.sp, so = R.so, D = R.pd, sd = R.side, z0 = R.z, u = clamp((R.t - (R.tImp - 1)) / 2, 0, 1), mx = (sp.px + so.px) / 2, mz = (sp.pz + so.pz) / 2;
  switch (R.shot) {
    case 1: {      // CHASE: tight behind your rider, looking down the lists at the man coming in
      const fx = Math.sin(sp.ry), fz = Math.cos(sp.ry);
      want.set(sp.px - fx * 3.3 + sd * 0.55, 2.3, sp.pz - fz * 3.3); wantLook.set(lerp(sp.px, so.px, 0.4) + fx * 5, 1.8, sp.pz + fz * 9); return 52;
    }
    case 2: {      // REVERSE: behind the opponent, looking at you come in
      const fx = Math.sin(so.ry), fz = Math.cos(so.ry), s = smoothstep(R.tImp - 0.3, R.tImp + 0.2, R.t);
      want.set(so.px - fx * 4.6 - sd * 0.5, 2.5, so.pz - fz * 4.6); wantLook.set(lerp(sp.px, mx, s), 1.85, lerp(sp.pz, mz, s)); return 46;
    }
    case 3: want.set(sd * 3.2, 6.8 + 3.2 * u, z0 - D * (16 - 6 * u)); wantLook.set(0, 1.3, mz); return 40;      // CRANE: high, down the tilt as they meet
    case 4: want.set(sd * 4.6, 2.15, z0 - D * 0.5); wantLook.set(-sd * 0.1, 1.9, lerp(z0, mz, 0.6)); return 29 - 7 * u;      // IMPACT: helm and shield level, a long lens
    case 5: { const F = R.fall; want.set(F.x + R.fx0 * 2.3, Math.max(0.9, F.y + 0.7), F.z - R.fdir * 3.4 + R.fdir * u * 0.8); wantLook.set(F.x, Math.max(0.35, F.y * 0.6), F.z); return 38; }
    default: want.set(sd * (7.4 - u * 1.2), 2.0, z0 - D * (2.6 - u * 2.2)); wantLook.set(-sd * 0.2, 1.95, z0 + D * u * 0.6); return 34;      // LOW SIDE at the tilt
  }
}
/** Dents, shield marks and the plume as they were at replay time t of the given course (nothing before its blow). */
function showMarks(t, course) { const k = (course ?? M.course) * 1000 + t; player.showDamage(k); if (opp.showDamage) opp.showDamage(k); }
function hideReplayUi() { for (const id of ['replayTag', 'replayKeys', 'replayYou', 'replayHim', 'hlBack']) $(id).classList.add('hidden'); }
function endReplay() {
  if (!R) return;
  if (R.hl) { closeHL(); return; }
  if (R.live) replayUndress(); else { player.applySnap(R.liveP); opp.applySnap(R.liveO); }
  showMarks(Infinity);
  player.replaying = opp.replaying = false; player.update(0); opp.update(0);
  fx.clear(); S.mode = R.back; R = null;
  if (C) { C.replayed = true; C.seenReplay = true; C.cutWas = true; C.cineCut = false; C.fovSnap = true; trimRec(C.rec); }      // cut straight back to your rider, wherever he is in the turn
  $('replayTag').textContent = 'INSTANT REPLAY';
  hideReplayUi();
  $('hud').classList.remove('hidden');
  if (C && C.verdict && !M.result) $('verdict').classList.remove('hidden');
}

// ---- the match's recordings: every course is kept (M.recs) for the pause menu's replays
/** Fill in the facts of a finished course (once): its strokes and the impact time. */
function recMeta() {
  const r = C.rec; if (r.p) return;
  r.n = M.course; r.p = C.pL.res; r.o = C.oL.res; r.tImp = C.hitT ?? C.ev.impact ?? (r.f.length ? r.f[r.f.length - 1].t : 0);
}
/** Keep memory bounded: only the last seconds before the blow are kept of a finished course. */
function trimRec(r) {
  if (!r || !r.p) return; const lo = r.tImp - 4;
  let n = 0; while (n < r.f.length - 8 && r.f[n].t < lo) n++; if (n > 0) r.f.splice(0, n);
  n = 0; while (n < r.ev.length && r.ev[n].t < lo) n++; if (n > 0) r.ev.splice(0, n);
}
function recTitle(r) {
  const bit = (res, mine) => {
    if (!res || res.zone === 'none') return null;
    if (res.unhorse) return mine ? 'you unhorse him' : 'he unhorses you';
    if (res.zone === 'horse') return mine ? 'a foul on his horse' : 'a foul on your horse';
    if (res.zone === 'miss') return mine ? 'you miss' : 'he misses';
    if (res.broke) return mine ? `lance broken on his ${res.zone}` : `his lance broken on your ${res.zone}`;
    return mine ? `a touch on his ${res.zone}` : `he touches your ${res.zone}`;
  };
  const rank = (s) => !s ? 0 : /unhorse/.test(s) ? 4 : /broken/.test(s) ? 3 : /touch/.test(s) ? 2 : 1;
  const parts = [bit(r.p, true), M.practice ? null : bit(r.o, false)].filter(Boolean).sort((a, b) => rank(b) - rank(a));
  const keep = parts.length > 1 && rank(parts[1]) < 2 ? [parts[0]] : parts;
  return `Course ${r.n} — ${keep.length ? keep.join(', ') : 'no stroke'}`;
}
const recList = () => (M && M.recs ? M.recs : []).map((r, i) => [r, i]).filter(([r]) => r.p && r.f.length > 8);

// ---- highlights: a recorded course played from the pause menu or the end-of-match card, full speed, from any angle. The match state is untouched (the riders are put back on leaving).
function openHL(idx, shot) {
  const rec = M && M.recs && M.recs[idx]; if (!rec || !rec.p || rec.f.length < 8 || !player || !opp) return;
  if (R && !R.hl) endReplay();
  const f = rec.f, old = R && R.hl ? R : null;      // (another course picked while a highlight plays keeps the real poses saved by the first)
  R = { f, ev: rec.ev, tImp: rec.tImp, i: 0, e: 0, liveP: old ? old.liveP : player.snapshot(), liveO: old ? old.liveO : opp.snapshot(), back: old ? old.back : S.mode, live: false, hl: true, course: rec.n, pause: false, shot: shot ?? S.rplShot ?? 0, fxDt: 0, rate: 1, vis: old ? old.vis : ['hud', 'verdict', 'royalCap'].filter(id => !$(id).classList.contains('hidden')) };
  replayGeom(); R.t0 = Math.max(f[0].t, R.tImp - 3.2); R.t1 = f[f.length - 1].t; replaySeek(R.t0); R.cut = true; S.rplShot = R.shot;
  player.replaying = opp.replaying = true; fx.clear();
  S.mode = 'replay'; S.hl = true; document.body.classList.add('rpl-open');
  for (const id of ['hud', 'verdict', 'royalCap', 'replayYou', 'replayHim', 'pmenu', 'banner']) $(id).classList.add('hidden');
  $('replayTag').classList.remove('hidden'); $('replayKeys').classList.remove('hidden'); $('hlBack').classList.remove('hidden'); replayTag(); hlKeys();
}
function hlKeys() { $('replayKeys').innerHTML = touchMode ? '' : `<kbd>V</kbd> angle &nbsp;&nbsp; <kbd>SPACE</kbd> ${R && R.pause ? 'play' : 'pause'} &nbsp;&nbsp; <kbd>←</kbd><kbd>→</kbd> scrub &nbsp;&nbsp; <kbd>ESC</kbd> back`; }
function closeHL() {
  if (!R || !R.hl) return;
  showMarks(Infinity); player.applySnap(R.liveP); opp.applySnap(R.liveO); player.replaying = opp.replaying = false; player.update(0); opp.update(0);
  fx.clear(); S.mode = R.back; S.hl = false; for (const id of R.vis) $(id).classList.remove('hidden'); R = null; hideReplayUi();
  showReplayList();
}
function hlSelect(d) {
  const L = recList(); if (!L.length) return; const cur = L.findIndex(([, i]) => i === S.rplSel);
  S.rplSel = L[clamp((cur < 0 ? 0 : cur) + d, 0, L.length - 1)][1];
  for (const el of $('pmList').querySelectorAll('.rrow')) el.classList.toggle('sel', +el.dataset.i === S.rplSel);
}
/** The pause menu's Replays list (also reached from the end-of-match card). */
function showReplayList() {
  const L = recList(), el = $('pmList');
  if (S.rplSel == null || !L.some(([, i]) => i === S.rplSel)) S.rplSel = L.length ? L[L.length - 1][1] : null;
  el.innerHTML = `<h3>REPLAYS</h3>` + (L.length ? `<div class="rlist">` + L.map(([r, i], n) => `<div class="rrow${i === S.rplSel ? ' sel' : ''}" data-i="${i}"><span class="rt">${touchMode ? '' : `<kbd>${n + 1}</kbd>`}${recTitle(r)}</span><span class="ra">${ANGLES.slice(0, 5).map((a, j) => `<button data-i="${i}" data-a="${j}">${a}</button>`).join('')}</span></div>`).join('') + `</div>` : `<p class="rnone">No course has been ridden yet.</p>`)
    + `<div class="rfoot">${touchMode ? '' : '<span><kbd>1</kbd>–<kbd>9</kbd> play &nbsp; <kbd>V</kbd> angle &nbsp; <kbd>SPACE</kbd> pause &nbsp; <kbd>←</kbd><kbd>→</kbd> scrub</span>'}<button class="btn" id="pmBack">Back</button></div>`;
  $('pmenu').classList.remove('hidden'); $('pmMain').classList.add('hidden'); el.classList.remove('hidden'); $('banner').classList.add('hidden'); $('card').classList.add('hidden'); document.body.classList.add('rpl-open');
}
function openReplays(from) {
  if (!M || !player || S.online) return;
  if (R && !R.hl) endReplay();      // a replay that was playing (and paused) gives way to the list
  S.rpl = true; S.rplFrom = from;
  if (from === 'card') S.paused = true;
  showReplayList();
}
function showPauseMain() {
  if (touchMode) { $('bannerTop').textContent = 'THE LISTS ARE STILL'; $('bannerMain').textContent = 'Paused'; $('bannerSub').innerHTML = ''; $('banner').classList.remove('hidden'); $('pmenu').classList.add('hidden'); }
  else { $('pmenu').classList.remove('hidden'); $('pmMain').classList.remove('hidden'); $('pmList').classList.add('hidden'); }
}
function closeReplays() {
  S.rpl = false; document.body.classList.remove('rpl-open'); $('pmList').classList.add('hidden'); $('pmenu').classList.add('hidden');
  if (S.rplFrom === 'card') { S.paused = false; $('card').classList.remove('hidden'); } else showPauseMain();
}

function advance() {
  if (R && R.hl) { replayView(); return; }      // a tap (or a click) in a highlight: the next angle
  if (S.paused) return;
  if (S.mode === 'replay') { if (touchMode) replayView(); else endReplay(); return; }
  if (S.mode === 'intro') return;      // a tap no longer skips the intro: hold Space / Enter (see skipVote)
  if (S.mode === 'after' && C.carded && M.result && S.online && NET.net && !M.forfeit) { rematchVote(); return; }      // online: a rematch vote (Esc, then Leave the lists, to go)
  if (S.mode === 'after' && C.carded && M.result && M.bridge && !M.bridge.final) { audio.ui('select'); nextBout(); return; }      // the bridge goes on: the next challenger
  if (S.mode === 'after' && C.carded && M.result) { audio.ui('select'); const wasCircuit = M.circuit; endMatch(); menus.show(wasCircuit ? 'circuit' : 'main'); }
}
/** Keep the Bridge: the next bout is a fresh match for the same lists with the knight's carried state (M.bridge.keep, kept by bridgeRecord) and the next challenger. */
function nextBout() {
  const B = M.bridge, vIdx = M.vIdx; B.bout++;
  endMatch(); startMatch(vIdx, B.queue[B.bout - 1], false, false, 'bridge', 0, B);
}
function endMatch(keepLink = false) {
  if (S.online && !keepLink) netLeave();
  if (world && world.setTilt) world.setTilt(true);
  for (const id of ['card', 'hud', 'verdict', 'lesson', 'royalCap', 'replayTag', 'replayKeys', 'replayYou', 'replayHim']) $(id).classList.add('hidden');
  $('helmMask').style.display = 'none'; $('flashTxt').className = '';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  voice.reset(); strikeCall = null;
  if (R) { player.replaying = false; R = null; }
  S.hl = false; S.rpl = false; S.paused = false; document.body.classList.remove('rpl-open'); for (const id of ['pmenu', 'pmList', 'hlBack']) $(id).classList.add('hidden');
  if (world && world.crowd && world.crowd.spotlight) world.crowd.spotlight(-1);
  field.clear(); ceremony.clear(); flagmen.clear(); judges.clear(); life.clear(); speech.hide(); disposeRider(opp); opp = null; M = null; C = null; S.mode = 'menu'; S.timeScale = 1; fx.clear();
  rebuildPlayer();
  if (worldKey === -2) setVenue(Math.max(0, venueIdx));      // back from the training ground to the tournament venue
}

// ------------------------------------------------------------------ circuit table
function newTable() { return { round: 0, rows: [{ id: 'you', p: 0, w: 0, d: 0, l: 0, sp: 0 }, ...KNIGHTS.map(k => ({ id: k.id, p: 0, w: 0, d: 0, l: 0, sp: 0 }))], results: [] }; }
function recordCircuit() {
  const T = profile.table || (profile.table = newTable());
  const row = (id) => T.rows.find(r => r.id === id);
  const give = (a, b, res, sa, sb) => { const ra = row(a), rb = row(b); ra.sp += sa; rb.sp += sb; if (res > 0) { ra.w++; ra.p += 3; rb.l++; } else if (res < 0) { rb.w++; rb.p += 3; ra.l++; } else { ra.d++; rb.d++; ra.p++; rb.p++; } };
  const res = M.result.startsWith('win') ? 1 : M.result === 'draw' ? 0 : -1;
  give('you', M.od.id, res, M.breaks[0], M.breaks[1]);
  T.results.push({ venue: M.vIdx, res: M.result, score: [...M.score] });
  const rest = KNIGHTS.filter(k => k.id !== M.od.id).sort(() => Math.random() - 0.5);
  for (let i = 0; i + 1 < rest.length; i += 2) {
    const a = rest[i], b = rest[i + 1];
    const sa = a.skill + a.seat * 0.4 + Math.random() * 0.7, sb = b.skill + b.seat * 0.4 + Math.random() * 0.7;
    give(a.id, b.id, Math.abs(sa - sb) < 0.08 ? 0 : sa > sb ? 1 : -1, Math.round(a.skill * 4 * Math.random() + 0.3), Math.round(b.skill * 4 * Math.random() + 0.3));
  }
  T.round++; profile.venue = T.round; saveProfile();
  if (T.round >= VENUES.length) { const top = [...T.rows].sort((a, b) => b.p - a.p || b.sp - a.sp)[0]; if (top && top.id === 'you') { const rb = rankOf(profile.renown); showFeats(circuitFeat(profile)); if (rankOf(profile.renown) > rb) announceRank(true); } }
}

// ------------------------------------------------------------------ autopilot (testing / demo)
function autoPilot(gap) {
  if (C.tier < 4 && C.t > 0.2 * (C.tier + 1)) { C.tier++; C.maxTier = Math.max(C.maxTier, C.tier); C.flags['t' + C.tier] = true; if (C.tier === 4) C.galT = C.t; }
  C.couchHeld = gap < (G.autoCouch ?? 36) && (!C.pL.done || G.autoKeepLow === true);
  if (gap < 3.6 && C.braceCd <= 0 && G.autoBrace !== false) doBrace();
  if (G.autoBurst && gap < 30) burst();
  opp.zoneWorld(G.autoZone || 'shield', _a); _a.project(camera); mouse.set(_a.x + (G.autoOff ? G.autoOff[0] : 0), _a.y + (G.autoOff ? G.autoOff[1] : 0));
}
function doBrace() { if (S.mode !== 'charge' || C.braceCd > 0) return; C.braceT = 0.6; C.braceCd = 1.5; C.braceAge = 0; C.ev.brace = C.t; }

// ------------------------------------------------------------------ Joust a friend (src/net.js carries the messages; src/online.js has the mirror and the stream)
//
// Each player owns his own rider and streams it ~30 times a second ('s'); the friend's rider replaces the AI, placed from that stream ~100 ms behind (netDriveOpp).
// The HOST decides every stroke with the ordinary strike code (his rider against the interpolated friend) and tells the guest ('st' per stroke, 'course' when both are spent);
// the guest never collides: he shows what he is told, mirrored (netApplyStroke, netApplyCourse). The host also gives the marshal's signal ('plan', 'sig') and starts each next course
// ('next') once the guest says he is at his mark ('rdy'). Messages: hi (profile) · room / start (host's settings) · skip (intro vote) · s · plan · sig · st · course · rdy · next · tilt · ka · bye.
const LOBBY = { phase: 'choose', code: '', err: '', friend: null, room: { v: 0, m: 'planken', c: 5 }, pub: false, quick: false, qt: 0, fromList: false, rooms: [], relays: { open: 0, total: 0, failed: false }, watching: false, venueSet: false };
// The public list (src/lobby.js, loaded only when the online screen opens): LOBBY.phase 'list' shows LOBBY.rooms; a PUBLIC room waiting for a challenger is announced; Quick match = look for ~3 s, join the oldest, else host a public room.
let lobbyP = null, lobbyObj = null;
const lobbyApi = () => lobbyP || (lobbyP = import('./lobby.js').then((m) => (lobbyObj = m.createLobby())));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function syncAnnounce() {
  const want = () => NET.host && LOBBY.pub && LOBBY.phase === 'hostWait' && LOBBY.code && NET.net && !NET.net.open && !M;
  if (want()) lobbyApi().then((l) => { if (want()) l.announce({ code: LOBBY.code, name: cleanName(profile.name), v: LOBBY.room.v, m: LOBBY.room.m, c: LOBBY.room.c }); }).catch((e) => console.warn('[lobby]', e));
  else if (lobbyObj) lobbyObj.stop();
}
function startWatch() {
  LOBBY.watching = true;
  setTimeout(() => { if (LOBBY.watching && !LOBBY.relays.open) { LOBBY.relays = { open: 0, total: LOBBY.relays.total, failed: true }; if (LOBBY.phase === 'list') lobbyShow(); } }, 8000);
  lobbyApi().then((l) => { if (LOBBY.watching) l.watch((rooms, st) => { LOBBY.rooms = rooms; LOBBY.relays = st; if (LOBBY.phase === 'list') lobbyShow(); }); }).catch(() => { LOBBY.relays = { open: 0, total: 0, failed: true }; if (LOBBY.phase === 'list') lobbyShow(); });
}
function stopWatch() { LOBBY.watching = false; LOBBY.rooms = []; if (lobbyObj) lobbyObj.unwatch(); }
const netSend = (o) => { if (NET.net) NET.net.send(o); };
const lobbyShow = () => { syncAnnounce(); if (typeof menus !== 'undefined' && menus.root.classList.contains('on') && menus.root.dataset.name === 'online') menus.show('online'); };
const roomMsg = (t = 'room') => Object.assign({ t }, LOBBY.room);
function netClose() {
  NET.token++; clearInterval(NET.ka); NET.ka = 0;
  const n = NET.net; NET.net = null;
  if (n) { n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e) { /* ignore */ } }
  syncAnnounce();
}
function netWire(n) {
  n.onOpen = () => { NET.lastRx = performance.now(); n.send(Object.assign(packProfile(profile), { rid: ranks.id() })); syncAnnounce(); if (!ranks.id()) ranks.ensure().then((rid) => { if (rid && NET.net === n) n.send({ t: 'rid', rid }); }); };
  n.onMessage = (m) => { NET.lastRx = performance.now(); onNetMessage(m); };
  n.onClose = () => onNetClose();
  clearInterval(NET.ka); NET.ka = setInterval(() => netSend({ t: 'ka' }), 1500);      // (the match loop sends nothing while a tab is hidden; this keeps the friend from thinking you left)
}
window.addEventListener('pagehide', () => { if (lobbyObj) lobbyObj.stop(); if (NET.net) { try { NET.net.send({ t: 'bye' }); } catch (e) { /* ignore */ } } });
const HOST_FAIL = "Couldn't reach the room server. Check your connection and try again.";
async function lobbyCreate(pub = false, quick = false) {
  netClose(); LOBBY.pub = !!pub; LOBBY.quick = !!quick; LOBBY.fromList = false; const my = NET.token; NET.host = true; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = ''; LOBBY.phase = 'hostWait'; lobbyShow();
  for (let i = 0; i < 6; i++) {
    const n = NET.net = createNet(), code = makeCode(); netWire(n);
    try { await n.host(code); } catch (e) {
      if (my !== NET.token) return;
      n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e2) { /* ignore */ } NET.net = null;
      if (e && e.message === 'taken') continue;
      LOBBY.phase = 'failed'; LOBBY.err = HOST_FAIL; lobbyShow(); return;
    }
    if (my !== NET.token) return;
    LOBBY.code = code; lobbyShow(); return;
  }
  LOBBY.phase = 'failed'; LOBBY.err = HOST_FAIL; lobbyShow();
}
async function lobbyJoin(raw, opts = {}) {
  const code = cleanCode(raw);
  if (!validCode(code)) { LOBBY.err = 'A room code is five letters.'; lobbyShow(); return false; }
  netClose(); const my = NET.token; NET.host = false; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = code; LOBBY.pub = false; LOBBY.fromList = !!opts.listed || !!opts.quick; LOBBY.phase = opts.quick ? 'quickLook' : 'joining'; lobbyShow();
  const n = NET.net = createNet(); netWire(n);
  try { await n.join(code); } catch (e) {
    if (my !== NET.token) return false;
    n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e2) { /* ignore */ } NET.net = null; clearInterval(NET.ka);
    const gone = e && e.message === 'notfound';
    if (opts.quick) { LOBBY.phase = 'quickLook'; lobbyShow(); return false; }
    if (opts.listed) { LOBBY.phase = 'list'; LOBBY.err = gone ? 'That room is no longer open.' : failText(e); lobbyShow(); return false; }
    LOBBY.phase = 'joinInput'; LOBBY.err = failText(e); lobbyShow(); return false;
  }
  if (my !== NET.token) return false;
  if (!opts.quick) stopWatch();
  LOBBY.phase = 'joined'; lobbyShow(); return true;
}
function lobbyList() { netClose(); NET.host = false; LOBBY.quick = false; LOBBY.pub = false; LOBBY.friend = null; LOBBY.code = ''; LOBBY.err = ''; LOBBY.qt++; LOBBY.phase = 'list'; startWatch(); lobbyShow(); }
const lobbyJoinListed = (code) => lobbyJoin(code, { listed: true });
/** Quick match: look at the public list for ~3 s; join the oldest open room (the next one if that fails), else open a public room with the usual rules and wait. */
async function lobbyQuick() {
  netClose(); const my = ++LOBBY.qt; NET.host = false; LOBBY.quick = true; LOBBY.pub = false; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = ''; LOBBY.phase = 'quickLook'; startWatch(); lobbyShow();
  const t0 = performance.now();
  for (;;) { await sleep(250); if (LOBBY.qt !== my) return; const el = performance.now() - t0; if (el >= 3000 && (LOBBY.relays.open > 0 || el >= 8000)) break; }
  const tried = new Set();
  for (;;) {
    const r = LOBBY.rooms.find((x) => !tried.has(x.code)); if (!r) break;
    tried.add(r.code);
    if (await lobbyJoin(r.code, { quick: true })) {
      if (LOBBY.qt !== my) return;
      let got = false; for (let i = 0; i < 14 && LOBBY.qt === my && NET.net; i++) { if (LOBBY.friend) { got = true; break; } await sleep(250); }
      if (LOBBY.qt !== my) return;
      if (got) { stopWatch(); return; }
      netClose(); LOBBY.phase = 'quickLook'; lobbyShow();      // that room was full or has gone: the next one
    } else if (LOBBY.qt !== my) return;
  }
  if (LOBBY.qt !== my) return;
  stopWatch(); LOBBY.room = { v: LOBBY.room.v, m: 'planken', c: 5 };
  await lobbyCreate(true, true);
}
/** Back, one step up inside the online screen (from the first page: out to the main menu). */
function lobbyBack() {
  if (LOBBY.phase === 'choose') { lobbyLeave(); return; }
  const priv = LOBBY.phase === 'joinInput' || LOBBY.phase === 'joining' || (LOBBY.phase === 'joined' && !LOBBY.fromList) || ((LOBBY.phase === 'hostWait' || LOBBY.phase === 'hostReady' || LOBBY.phase === 'failed') && !LOBBY.quick && !LOBBY.pub);
  LOBBY.qt++; stopWatch(); netLeave(); LOBBY.friend = null; LOBBY.err = ''; LOBBY.quick = false; LOBBY.pub = false; LOBBY.fromList = false; LOBBY.phase = priv ? 'friend' : 'choose'; lobbyShow();
}
function lobbySetPublic(b) { if (!NET.host || LOBBY.phase !== 'hostWait') return; LOBBY.pub = !!b; lobbyShow(); }
function lobbyOpen() {
  ranks.syncName();      // (the rank server: make the key, register, send the name; fails silently)
  netClose(); stopWatch(); NET.host = false; LOBBY.qt++; LOBBY.phase = 'choose'; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = ''; LOBBY.pub = LOBBY.quick = LOBBY.fromList = false; preloadNet(); import('./lobby.js').then((m) => m.preloadLobby()).catch(() => {});
  if (!LOBBY.venueSet) LOBBY.room.v = Math.min(profile.venue || 0, VENUES.length - 1);      // (Quick match opens the lists you last rode in)
}
function lobbyLeave() { LOBBY.qt++; stopWatch(); netLeave(); LOBBY.phase = 'choose'; LOBBY.friend = null; LOBBY.err = ''; LOBBY.pub = LOBBY.quick = LOBBY.fromList = false; menus.show('main'); }
function lobbySetRoom(k, v) {
  if (!NET.host || (LOBBY.phase !== 'hostWait' && LOBBY.phase !== 'hostReady')) return;
  const R_ = LOBBY.room;
  if (k === 'v') { R_.v = clamp(v | 0, 0, VENUES.length - 1); LOBBY.venueSet = true; } else if (k === 'm' && onlineModeIds().includes(v)) R_.m = v; else if (k === 'c') R_.c = clamp(v | 0, 3, 20);
  if (LOBBY.phase === 'hostReady') netSend(roomMsg());
  lobbyShow();
}
function lobbyRide() {
  if (!NET.host || LOBBY.phase !== 'hostReady' || !NET.net || !NET.net.open || !LOBBY.friend) return;
  netSend(startMsg()); startOnlineMatch();
}
/** The host's 'start': the room's settings and a fresh match id (random 128 bits; both players sign their reports with it, see src/ranks.js). */
function startMsg() {
  const b = crypto.getRandomValues(new Uint8Array(16)); NET.mid = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return Object.assign(roomMsg('start'), { mid: NET.mid });
}
const HEX = (v, n) => (typeof v === 'string' && v.length === n && /^[0-9a-f]+$/.test(v) ? v : '');
function startOnlineMatch() {
  if (!LOBBY.friend || M) return;
  NET.againMe = NET.againThem = false;
  NET.od = onlineOd(LOBBY.friend);
  ranksPlay();
  startMatch(LOBBY.room.v, 'friend', false, false, LOBBY.room.m, LOBBY.room.c, null, true);
}
function onNetClose() {
  if (M && S.online) { netForfeit(); return; }
  const wasHost = NET.host;
  if (wasHost && (LOBBY.phase === 'hostReady')) { LOBBY.friend = null; LOBBY.phase = 'hostWait'; lobbyShow(); }      // the room stays open for another friend
  else if (!wasHost) {
    const filled = LOBBY.fromList && !LOBBY.friend;      // joined from the list and thrown out at once: somebody else got there first
    netClose(); LOBBY.friend = null;
    if (filled && LOBBY.quick) return;      // (Quick match carries on with the next room)
    if (filled) { LOBBY.phase = 'list'; LOBBY.err = 'That room just filled'; startWatch(); }
    else if (LOBBY.fromList) { LOBBY.phase = 'list'; LOBBY.err = 'The host has closed the room.'; startWatch(); }
    else { LOBBY.phase = 'joinInput'; LOBBY.err = 'The host has closed the room.'; }
    lobbyShow();
  }
}
function onNetMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hi') {
    const f = cleanProfile(m); if (!f || M) return;
    LOBBY.friend = f; friendLookup();
    if (NET.host) { LOBBY.phase = 'hostReady'; netSend(roomMsg()); } else LOBBY.phase = 'joined';
    lobbyShow(); return;
  }
  if (m.t === 'rid') { if (LOBBY.friend && !LOBBY.friend.rid && !M) { LOBBY.friend.rid = HEX(m.rid, 16); friendLookup(); } return; }
  if (m.t === 'play') { const mid = HEX(m.mid, 32), sig = typeof m.sig === 'string' && m.sig.length < 200 ? m.sig : ''; if (mid && sig) NET.oppPlay = { mid, sig }; return; }
  if (!M && !NET.host) {
    if (m.t === 'room') { LOBBY.room = cleanRoom(m); if (!M) setVenue(LOBBY.room.v); lobbyShow(); return; }
    if (m.t === 'start' && LOBBY.friend) { LOBBY.room = cleanRoom(m); NET.mid = HEX(m.mid, 32); startOnlineMatch(); return; }
  }
  if (m.t === 'start' && M && M.result && S.online && !NET.host && LOBBY.friend) {      // the host began the rematch: follow him even if his vote went astray
    NET.againMe = NET.againThem = false; endMatch(true); NET.remote.reset(); NET.rem = null; LOBBY.room = cleanRoom(m); NET.mid = HEX(m.mid, 32); startOnlineMatch(); return;
  }
  if (M && S.online) onMatchMessage(m);
}
const HOWS = ['three strokes in the sight of the helm', 'the fewer faults'];
function onMatchMessage(m) {
  switch (m.t) {
    case 's': { const st = cleanState(m); if (st) NET.remote.push(st); break; }
    case 'skip': G.skipThem(!!m.v); break;
    case 'plan': if (!NET.host && C && m.n === M.course && !C.rd.plan) C.rd.plan = { hold: clampNum(m.hold, 0, 6), horns: !!m.horns }; break;
    case 'sig': if (!NET.host && C && m.n === M.course && S.mode === 'ready' && !C.rd.sig) { giveSignal(C.rd.plan || { hold: 0, horns: false }); startCharge(); } break;
    case 'st': if (!NET.host && C && m.n === M.course && S.mode === 'charge') netApplyStroke(m); break;
    case 'course': if (!NET.host && C && m.n === M.course && S.mode === 'charge') netApplyCourse(m); break;
    case 'rdy': if (NET.host && C && m.n === M.course) NET.rdyIn = M.course; break;
    case 'next': if (!NET.host && C && S.mode === 'after' && !M.result && m.n === M.course + 1) beginCourse(false); break;
    case 'tilt': if (NET.host && C && m.n === M.course) { C.oTiltPts = clampNum(m.p, -9, 9); M.oTilts = clampNum(m.k | 0, 0, 99); } break;
    case 'again': NET.againThem = true; if (M.result && C && C.carded) rematchHint(); rematchCheck(); break;      // (a vote that comes before my card shows is kept)
    case 'bye': netForfeit(); break;
    default: break;      // 'ka' and anything unknown
  }
}

/** The friend's rider, placed from his stream; his stroke quality and shield timing feed the host's strike code. */
function netDriveOpp(dt) {
  const s = NET.remote.step(dt); NET.rem = s;
  if (!s) return;
  applyRider(opp, s);
  C.o.q = clamp(s.sq, 0, 1);
  if (NET.rLb === 1 && !s.lb && opp.lanceBroken) { opp._mendLance(); opp.lanceLower = s.ll; }      // mended on his side (the squire's service): mended here too
  NET.rLb = s.lb;
  NET.rGuardAge = s.gd > 0.5 ? NET.rGuardAge + dt : 0;
}
/** How well this stroke would be struck (what techSnapshot's q is, without its side effects): sent with the stream, used by the host for the friend's blows. */
function selfQ() {
  const H = player.horseDef, speedFrac = clamp(player.speed / H.top, 0, 1);
  const lance = clamp(1 - C.fatigue * 0.8 - (C.setT < 0.4 ? (0.4 - C.setT) / 0.4 * 0.65 : 0) - Math.max(0, C.sway - 0.012) * 9, 0, 1) * (C.pL.low ? 1 : 0);
  const latOk = C.lat < 0.8 ? 0.5 : C.lat <= 1.3 ? 1 : clamp(1 - (C.lat - 1.3) / 1.2, 0, 1);
  const horse = clamp(0.4 * speedFrac + 0.25 * latOk + 0.15 * (1 - Math.min(1, Math.abs(C.latV) * 2.2)) + 0.2 * C.collected, 0, 1);
  const braced = C.braceT > 0, will = braced && C.braceAge < 0.45 ? 1 : braced ? 0.72 : 0.3;
  return 0.4 * lance + 0.35 * horse + 0.25 * will;
}
function netTick(dtReal) {
  const now = performance.now();
  if (NET.net && NET.lastRx && now - NET.lastRx > 12000) { netForfeit(); return; }
  if (!C || S.mode === 'intro' || !NET.net) return;
  NET.sendT -= dtReal;
  if (NET.sendT > 0) return;
  NET.sendT = 1 / SEND_HZ;
  netSend(packRider(player, { ts: Math.round(S.time * 1000) / 1000, n: M.course, md: S.mode[0], rP: C.rd.p ? 1 : 0, sq: Math.round(selfQ() * 100) / 100 }));
}
const bodyArr = () => [M.bodyS.p.arm, M.bodyS.p.wind, M.bodyS.o.arm, M.bodyS.o.wind].map(v => Math.round(v * 1000) / 1000);
const hpArr = () => [M.hp.body, M.hp.horse, M.hpO.body, M.hpO.horse].map(v => Math.round(v * 1000) / 1000);
/** Host: each stroke the moment it is settled (struck, missed, broken across), with what the guest needs to show it. */
function netFlushStrokes() {
  if (!(S.online && NET.host) || !C) return;
  for (const side of ['p', 'o']) {
    const st = side === 'p' ? C.pL : C.oL, key = '_sent' + side;
    if (!st.done || C[key] || !st.res) continue;
    C[key] = true;
    const fx_ = (C.nfx && C.nfx[side]) || {};
    netSend(Object.assign({ t: 'st', n: M.course, h: side === 'p' ? 1 : 0, res: st.res, near: st.near ? { d: st.near.d, zone: st.near.zone, off: st.near.off } : null, bs: bodyArr(), hp: hpArr() }, fx_));
  }
}
function netSendCourse(p, o, pp, op) {
  netSend({ t: 'course', n: M.course, pr: p, or: o, pp, op, sc: M.score, mk: M.marks, res: M.result, how: M.how || null, vd: !!M.void, mu: !!C.mutual, cor: !!C.coronel, bs: bodyArr(), hp: hpArr(),
    st: M.stats.map(x => ({ broken: x.broken, attaint: x.attaint, helm: x.helm, miss: x.miss, best: Math.round(x.best * 1000) / 1000 })), br: M.breaks, sg: M.sights, so: M.shieldOff, fl: [M.fouls, M.oFouls || 0] });
}
const pair2 = (a, lo, hi) => (Array.isArray(a) && a.length === 2 ? [clampNum(a[0], lo, hi), clampNum(a[1], lo, hi)] : [0, 0]);
/** Guest: the host's body numbers, turned round (his p is our o). */
function netApplyBody(bs, hp) {
  if (Array.isArray(bs) && bs.length === 4) { M.bodyS.p.arm = clampNum(bs[2], 0, 1); M.bodyS.p.wind = clampNum(bs[3], 0, 1); M.bodyS.o.arm = clampNum(bs[0], 0, 1); M.bodyS.o.wind = clampNum(bs[1], 0, 1); }
  if (Array.isArray(hp) && hp.length === 4) { M.hp.body = clampNum(hp[2], 0, 1); M.hp.horse = Math.min(M.hp.horse, clampNum(hp[3], 0, 1)); M.hpO.body = clampNum(hp[0], 0, 1); M.hpO.horse = Math.min(M.hpO.horse, clampNum(hp[1], 0, 1)); }
}
/** Guest: one stroke as the host settled it. In the host's words the striker was `h` (his own rider); here that is the friend, so the sides swap. */
function netApplyStroke(m) {
  const res = cleanRes(m.res); if (!res) return;
  const isP = !m.h, Aj = isP ? player : opp, Bj = isP ? opp : player, st = isP ? C.pL : C.oL;
  if (st.done) return;
  st.done = true; st.res = res; st.near = cleanNear(m.near) || st.near;
  if (C.hitT === null) C.hitT = C.t;
  netApplyBody(m.bs, m.hp);
  const zone = res.zone;
  if (res.across) {      // the shaft broke across his man, not on its point
    const seg = Aj.breakLance(clampNum(m.bk, 0.5, 3) || 1), vel = new THREE.Vector3(0, 0, Aj.dir * Aj.speed * 0.6);
    if (seg) { fxSplinters(seg.a, seg.b, vel, 18); fxShaft(seg.a, seg.b, vel); }
    Aj.lance.getWorldPosition(_a); const [d] = hear(_a); audio.lanceBreak(0.45, d); audio.impact(0.5, m.hs ? 'horse' : 'body', d);
    Bj.hit(1.3, true, { zone: m.hz === 'helm' ? 'helm' : 'body', lat: 0.5 }); S.shake = Math.max(S.shake, 0.3);
    if (m.hs) Bj.speed *= 0.9;
    if (isP) { arm.vy -= dirP() * 1.4; arm.vp += 0.6; C.tech = techSnapshot(null, 0); }
    callout(isP ? 'YOUR LANCE BROKE ACROSS HIM — IT COUNTS FOR NOTHING' : 'HIS LANCE BROKE ACROSS YOU', isP ? 'bad' : 'good', CALL.across);
    return;
  }
  if (zone === 'miss' || zone === 'none') {      // no touch (or unhorsed before his stroke)
    if (isP) { C.tech = techSnapshot(null, 0); if (zone === 'miss') callout(res.up ? 'LANCE NEVER LOWERED' : res.early ? 'LANCE RAISED TOO SOON' : 'MISSED', 'bad', CALL.miss); }
    if (zone === 'miss') { const nearHelm = !res.up && !res.early && !!st.near && st.near.zone === 'helm' && st.near.d < 0.18; crowdStroke(nearHelm ? 'near' : 'miss', isP ? 1 : -1); }
    return;
  }
  voice.mark('strike');
  const power = clampNum(m.pw, 0, 3), velA = new THREE.Vector3(0, 0, Aj.dir * Aj.speed);
  Aj.tipWorld(_tip); const [hd, hpan] = hear(_tip);
  if (isP) C.tech = techSnapshot(zone, res.cent);
  S.shake = Math.max(S.shake, 0.25 + power * 0.5); post.setImpact(clamp(0.35 + power * 0.6, 0, 1));
  $('flash').style.opacity = 0.35; setTimeout(() => { $('flash').style.opacity = 0; }, 60);
  const mine = (p3) => new THREE.Vector3(-clampNum(p3[0], -300, 300), clampNum(p3[1], -50, 50), -clampNum(p3[2], -300, 300));      // the host's world point, in ours
  if (zone === 'horse') {
    audio.impact(power, 'horse', hd); audio.whinny(hpan, hd); fx.dust(_tip, 6, 0.3, 1, 0.3);
    Bj.speed *= 0.75; crowdStroke('foul', isP ? 1 : -1);
    callout(isP ? `FOUL — YOU HIT HIS HORSE &nbsp;${res.pts}` : 'FOUL — HE HIT YOUR HORSE', 'bad', CALL.foul);
    return;
  }
  if (Array.isArray(m.dm) && m.dm.length === 5 && typeof m.dm[0] === 'string') {
    const region = m.dm[0], r = Bj.damage(region, clampNum(m.dm[1], 0, 3), mine(m.dm.slice(2)), M.course * 1000 + C.t, power);
    (C.dNote || (C.dNote = [])).push({ you: !isP, region });
    if (r && r.plume) { Bj.plume.getWorldPosition(_hd); _hf.set(0.05, 0.3, -0.12).applyQuaternion(Bj.root.quaternion).add(_hd); fxShaft(_hd.clone(), _hf.clone(), new THREE.Vector3((Math.random() - 0.5) * 1.5, 2, -Aj.dir * 1.5)); fxSparks(_hd.clone(), 6, 2); }
  }
  if (m.sp && Bj.shield) { Bj.shield.getWorldPosition(_hd); Bj.shield.getWorldQuaternion(_qa); fxPiece(_hd.clone(), _qa.clone(), 0.42, 0.62, 0.03, new THREE.Vector3(0, 0, Aj.dir * Aj.speed)); fxSparks(_hd.clone(), 8, 3); Bj.setShieldGone(true); }
  if (!res.broke && isP) C.kickUp = PHYS.shaft.kick;
  Bj.hit(clampNum(m.hk, 0, 8), true, { headMul: clampNum(m.hm, 0, 3), zone, lat: clampNum(m.hl, -1, 1) });
  if (typeof m.dv === 'number') { const dv = clampNum(m.dv, 0, 20); Bj.speed = Math.max(0, Bj.speed - dv); Aj.speed = Math.max(0, Aj.speed - dv * 0.5); }
  if (!isP) { arm.vy -= dirP() * 0.6 * PHYS.recoil.arm * power; arm.vp += PHYS.recoil.arm * power * (1 + PHYS.kit.lockKick * (M.kit.lock - 1)); }      // the shock through your own arm
  audio.impact(power, zone, hd); fxSparks(_tip.clone(), 10 + (power * 14 | 0), 4 + power * 3);
  if (res.broke && m.bk) { const seg = Aj.breakLance(clampNum(m.bk, 0.5, 3)); if (seg) { fxSplinters(seg.a, seg.b, velA, 30 + (power * 34 | 0)); fxShaft(seg.a, seg.b, velA); } audio.lanceBreak(power, hd); }
  const un = Array.isArray(m.un) && m.un.length === 4 ? m.un.map(v => clampNum(v, -30, 30)) : null;
  if (un && res.unhorse) { Bj.unhorse(new THREE.Vector3(-un[0], un[1], -un[2]), un[3]); C.cine = Bj; }
  const visorHit = zone === 'helm' && !!Bj.visorUp, Z = zone.toUpperCase(), sgn = res.pts > 0 ? `+${res.pts}` : `${res.pts}`, broke = res.broke, unhorse = res.unhorse;
  const kind = unhorse ? 'unhorse' : broke && zone === 'helm' ? 'helm' : broke ? 'break' : res.glanced || res.turned ? 'glance' : 'attaint';
  crowdStroke(kind, isP ? 1 : -1);
  const cp = unhorse ? CALL.unhorse : visorHit ? CALL.helm : res.turned ? CALL.turned : broke ? CALL[kind] : CALL.attaint;
  if (isP) callout(unhorse ? `UNHORSED! &nbsp;+${res.pts}` : visorHit ? `HIS VISOR WAS UP! &nbsp;${sgn}` : broke ? `${Z} — LANCE BROKEN &nbsp;${sgn}` : res.glanced ? `GLANCED OFF THE ${Z} &nbsp;${sgn}` : `${Z} — A TOUCH &nbsp;${sgn}`, 'good', cp);
  else callout(unhorse ? 'YOU ARE UNHORSED' : visorHit ? 'STRUCK WITH YOUR VISOR UP!' : res.turned ? 'YOU TURNED HIS STROKE' : broke ? `HE BROKE HIS LANCE ON YOUR ${Z}` : `HE TOUCHED YOUR ${Z}`, res.turned ? 'good' : 'bad', cp);
  if (unhorse) herald(isP ? 'shoutDown' : 'shoutFall'); else if (broke) herald('shout');
}
/** Guest: both strokes are spent; the host has scored the course. Everything is turned round (his score is our opponent's). */
function netApplyCourse(m) {
  const pr = cleanRes(m.or), or = cleanRes(m.pr); if (!pr || !or) return;
  C.pL.res = C.pL.res || pr; C.oL.res = C.oL.res || or; C.pL.done = C.oL.done = true;      // (the 'st' messages normally set these first)
  C.prevLead = Math.sign(M.score[0] - M.score[1]);
  const sc = pair2(m.sc, -99, 99); M.score = [sc[1], sc[0]]; C.pts = [clampNum(m.op, -20, 20), clampNum(m.pp, -20, 20)];
  const marks = (a) => (Array.isArray(a) ? a.filter(c => typeof c === 'string' && 'mabhuf'.includes(c) && c.length === 1).slice(0, 40) : []);
  M.marks = [marks(m.mk && m.mk[1]), marks(m.mk && m.mk[0])];
  M.maxDef = Math.max(M.maxDef, M.score[1] - M.score[0]);
  M.result = MIRROR_RESULT[m.res] || null; M.how = m.res !== 'win-dq' && HOWS.includes(m.how) ? m.how : null; M.void = !!m.vd;
  C.mutual = !!m.mu; if (m.cor && !C.coronel) { C.coronel = true; callout('CORONEL TO CORONEL', 'good'); }
  if (Array.isArray(m.st) && m.st.length === 2) for (let i = 0; i < 2; i++) { const x = m.st[1 - i] || {}, d = M.stats[i]; for (const k of ['broken', 'attaint', 'helm', 'miss']) d[k] = clampNum(x[k] | 0, 0, 99); d.best = clampNum(x.best, 0, 5); }
  { const b = pair2(m.br, 0, 99), g = pair2(m.sg, 0, 99), o = pair2(m.so, 0, 99), f = pair2(m.fl, 0, 99); M.breaks = [b[1], b[0]]; M.sights = [g[1], g[0]]; M.shieldOff = [o[1], o[0]]; M.fouls = f[1]; M.oFouls = f[0]; }
  netApplyBody(m.bs, m.hp);
  if (!C.tech) C.tech = techSnapshot(null, 0);
  { const T = M.tech; for (const k of ['sight', 'lance', 'horse', 'will']) T[k] += Math.min(1, C.tech[k]); T.n++; }
  if (M.mode.firstBreak) M.note = suddenNote();
  C.resultArgs = [C.pL.res, C.oL.res];
  S.mode = 'after'; C.afterT = 0; updateHud(true);
}
/** After a course: each side tells the host (or the host waits for) the other's mark; the host starts the next course for both. */
function netReady(mine) {
  if (!mine || M.result) return;
  if (!NET.host) { if (NET.rdyOut !== M.course) { NET.rdyOut = M.course; netSend({ t: 'rdy', n: M.course }); } }
  else if (NET.rdyIn === M.course) { netSend({ t: 'next', n: M.course + 1 }); beginCourse(false); }
}
/** Leaving: the friend is told (he wins by forfeit), the link closed, and everything online switched off. */
function netLeave() {
  const n = NET.net; NET.net = null; NET.token++; clearInterval(NET.ka); NET.ka = 0;
  if (n) { n.onOpen = n.onMessage = n.onClose = null; try { n.send({ t: 'bye' }); } catch (e) { /* ignore */ } setTimeout(() => { try { n.close(); } catch (e) { /* ignore */ } }, 300); }
  S.online = false; document.body.classList.remove('online'); NET.rem = null; NET.remote.reset();
  syncAnnounce();
}
/** The friend has gone (said bye, closed, or fell silent): you win by forfeit, unless the joust was already decided. */
/** Rematch: each player's vote is locked in until the other's arrives (as the intro skip); then the host starts the same match again. */
function rematchHint() {
  const go = touchMode ? 'TAP' : 'SPACE / CLICK', out = touchMode ? 'pause to leave' : 'ESC to leave';
  $('cardHint').textContent = NET.againMe ? `Waiting for your opponent to accept the rematch… · ${out}` : NET.againThem ? `Your opponent wants a rematch · ${go} to accept · ${out}` : `${go} for a rematch · ${out}`;
}
function rematchVote() {
  if (NET.againMe) return;
  NET.againMe = true; netSend({ t: 'again' }); audio.ui('select'); rematchHint(); rematchCheck();
}
function rematchCheck() {
  if (!NET.againMe || !NET.againThem || !M || !M.result) return;
  NET.againMe = NET.againThem = false;
  endMatch(true); NET.remote.reset(); NET.rem = null;
  if (NET.host) { netSend(startMsg()); startOnlineMatch(); }      // the guest starts on the host's 'start' (the channel keeps order, so it comes after his vote)
}
function netForfeit() {
  if (!M || !S.online || M.forfeit) return;
  M.forfeit = true;
  const n = NET.net; NET.net = null; NET.token++; clearInterval(NET.ka); NET.ka = 0; if (n) { n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e) { /* ignore */ } }
  if (M.result) { if (C && C.carded) $('cardHint').textContent = `Your opponent has left · ${touchMode ? 'TAP' : 'SPACE / CLICK'} to continue`; return; }      // already decided: he is only leaving the card
  if (!C || S.mode === 'intro') { endMatch(); menus.show('main'); toast('THE LISTS ARE EMPTY', 'Your opponent has left the lists.', 6); return; }
  M.result = 'win-forfeit'; S.mode = 'after'; C.pL.done = C.oL.done = true; C.carded = C.verdict = C.replayed = C.montDone = C.judged = true; C.countDue = false;
  for (const st of [C.pL, C.oL]) if (!st.res) st.res = { zone: 'none', pts: 0, code: 'm', text: '' };
  C.mont = null; C.cut = null; $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
  $('cardTitle').textContent = 'VICTORY BY FORFEIT'; $('cardSub').textContent = 'Your opponent has left the lists'; $('cardCols').innerHTML = ''; $('cardRows').innerHTML = ''; $('cardFacts').innerHTML = '';
  $('cardReplays').classList.add('hidden'); $('cardHint').textContent = touchMode ? 'TAP to continue' : 'SPACE / CLICK to continue'; $('card').classList.remove('hidden');
  fanfare('victory'); callout('YOUR OPPONENT HAS LEFT THE LISTS', 'good');
  rankReport();
}
// ------------------------------------------------------------------ rankings (src/ranks.js; every call fails silently, online play never waits for it)
/** The friend's rank and our head-to-head, for the room screen. */
function friendLookup() {
  const f = LOBBY.friend; if (!f || !f.rid) return;
  ranks.ensure().then(async (me) => {
    if (!me || LOBBY.friend !== f) return;
    const [p, h] = await Promise.all([ranks.player(f.rid), ranks.h2h(me, f.rid)]);
    if (!p || LOBBY.friend !== f) return;
    f.rank = { text: ranks.rankText(p), h2h: ranks.h2hText(h) }; lobbyShow();
  });
}
/** At the start of a match: sign "I am playing this match against him" and send it (his proof, if I leave, that I was there). */
function ranksPlay() {
  const mid = NET.mid, rid = LOBBY.friend && LOBBY.friend.rid;
  if (!mid || !rid) return;
  ranks.playProof(mid, rid).then((sig) => { if (sig && NET.net && NET.mid === mid) netSend({ t: 'play', mid, sig }); });
}
/** The match is decided: send my side to the rank server, then show the rating change on the card once the other side's report has confirmed it. */
function rankReport() {
  if (!M || !S.online || M.practice || !M.result || M.rankSent || !M.mid || !M.oppRid) return;
  M.rankSent = true;
  const m = M, c = (n) => Math.max(0, Math.min(99, n | 0)), a = m.stats[0], forfeit = m.result === 'win-forfeit', pl = NET.oppPlay;
  const rec = { matchId: m.mid, oppId: m.oppRid, result: m.result, score: [Math.max(-99, Math.min(99, m.score[0] | 0)), Math.max(-99, Math.min(99, m.score[1] | 0))],
    stats: { breaks: c(a.broken), attaints: c(a.attaint), helms: c(a.helm), unhorse: m.result === 'win-unhorse' ? 1 : 0, courses: c(m.course) }, mode: m.mode.id, venue: m.V.id };
  if (forfeit) { if (!pl || pl.mid !== m.mid) return; rec.oppSig = pl.sig; }
  ranks.report(rec).then(async (r) => {
    if (!r) return;
    if (r.status === 'pending') r = await ranks.awaitConfirm(m.mid, 8000);
    if (!r || r.status !== 'confirmed' || M !== m) return;
    const line = `${r.division}${r.provisional ? '?' : ''} · ${r.after} (${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)})`;
    $('cardSub').textContent += ' · ' + line;
  }).catch(() => {});
}
const onlineApi = { get lobby() { return LOBBY; }, lobbyObjNow: () => lobbyObj, open: lobbyOpen, create: lobbyCreate, join: lobbyJoin, leave: lobbyLeave, ride: lobbyRide, setRoom: lobbySetRoom, modeIds: onlineModeIds, list: lobbyList, joinListed: lobbyJoinListed, quick: lobbyQuick, back: lobbyBack, setPublic: lobbySetPublic };

// ------------------------------------------------------------------ input
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.code;
  if (M && S.paused && R && R.hl) {      // a highlight playing from the pause menu
    if (k === 'KeyV') replayView();
    else if (k === 'Space' || k === 'Enter') { R.pause = !R.pause; hlKeys(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { R.pause = true; hlKeys(); replaySeek(R.t + (k === 'ArrowLeft' ? -0.25 : 0.25)); }
    else if (k === 'Escape' || k === 'KeyP' || k === 'Backspace') closeHL();
    e.preventDefault(); return;
  }
  if (M && S.rpl && S.paused) {      // the Replays list
    if (/^Digit[1-9]$/.test(k)) { const L = recList()[+k[5] - 1]; if (L) openHL(L[1]); e.preventDefault(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { hlSelect(k === 'ArrowUp' ? -1 : 1); e.preventDefault(); return; }
    if ((k === 'Enter' || k === 'Space') && S.rplSel != null) { openHL(S.rplSel); e.preventDefault(); return; }
  }
  if (k === 'ShiftLeft' || k === 'ShiftRight') { if (!e.repeat && (S.mode === 'ready' || S.mode === 'charge') && !burst()) { if (!sk('burst') || !C || C.tier < 4) spur(); } }
  else if (k === 'KeyW' || k === 'ArrowUp') { if (!e.repeat && (S.mode === 'ready' || S.mode === 'charge')) spur(); else if (!e.repeat && S.mode === 'after' && C && C.rb && C.turn.p.stage === 'free') C.rb.rt = Math.min(3, C.rb.rt + 1); }
  else if (k === 'KeyH') { if (!e.repeat) toggleVisor(); }
  else if (k === 'KeyS' || k === 'ArrowDown') keys.rein = true;
  else if (k === 'KeyA' || k === 'ArrowLeft') keys.left = true;
  else if (k === 'KeyD' || k === 'ArrowRight') keys.right = true;
  else if (k === 'KeyF') { focusHeld = true; if (!e.repeat) handLance('hand'); }
  else if (k === 'KeyT') keys.throw = true;
  else if (k === 'KeyQ') { if (!keys.guard && C) C.guardAge = 0; keys.guard = true; }
  else if (k === 'KeyC') keys.look = true;
  else if (k === 'Space' || k === 'Enter') { e.preventDefault(); if (S.mode === 'intro' || (C && (C.mont || C.beat))) { skipKey = true; return; } if (e.repeat) return; if (S.mode === 'charge' && k === 'Space') doBrace(); else advance(); }
  else if (k === 'KeyV') { if (S.mode === 'replay') replayView(); else { S.fp = !S.fp; profile.firstPerson = S.fp; saveProfile(); } }
  else if (k === 'KeyM') setSound(S.muted);
  else if (k === 'KeyR') { if (M && S.paused && !S.rpl) openReplays('pause'); else if (M && !S.paused && M.result && C && C.carded && S.mode === 'after') openReplays('card'); else if (C && S.mode === 'after' && C.replayed && C.rec.f.length > 20 && !C.cut && !R && !S.online) startReplay({ frozen: true }); }
  else if (k === 'KeyE' || k === 'Digit4') { if (S.mode === 'ready') interlude(4); else if (C && player.speed < 2.6 && C.patCd <= 0 && S.mode === 'charge') { C.patCd = 1.2; M.agit = clamp(M.agit - 0.22, 0, 1); audio.snort(0); } }
  else if (k === 'KeyX' || k === 'Digit1') { if (S.mode === 'ready') interlude(1); else if (C && S.mode === 'after' && opp && opp.unhorsed && !C.courtesy) { C.courtesy = true; react('salute', 1, false); discover('courtesy'); withFeats(() => courtesyFeat(profile)); say('You salute your fallen foe. The gallery approves.', 'THE GALLERY', 2, { prompt: true, phases: 'after' }); } }
  else if (k === 'KeyG') ladyEye();      // not in the key hints: found by accident, or from the squire's mutter
  else if (k === 'Digit2') interlude(2);
  else if (k === 'Digit3') interlude(3);
  else if (k === 'Escape' || k === 'KeyP') { if (M) { if (S.rpl) closeReplays(); else setPaused(!S.paused); } }
  else if (k === 'Backspace') { if (M && S.paused) { setPaused(false); endMatch(); menus.show('main'); } }
  if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'Space' || k === 'Enter') skipKey = false;
  if (k === 'KeyS' || k === 'ArrowDown') keys.rein = false; else if (k === 'KeyA' || k === 'ArrowLeft') keys.left = false; else if (k === 'KeyD' || k === 'ArrowRight') keys.right = false;
  else if (k === 'KeyF') focusHeld = false; else if (k === 'KeyT') keys.throw = false; else if (k === 'KeyQ') keys.guard = false; else if (k === 'KeyC') keys.look = false;
});
window.addEventListener('mousemove', (e) => {
  if (touchMode) return;      // a finger moves the aim by dragging (src/touch.js); the synthetic mouse move must not jump it
  if (G.auto && S.mode === 'charge') return;
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (touchMode) return;
  if (e.button === 0) { if (S.mode === 'charge' || S.mode === 'ready') { if (C) C.couchHeld = true; } else advance(); }
  if (e.button === 2) focusHeld = true;
});
window.addEventListener('mouseup', (e) => { if (touchMode) return; if (e.button === 0 && C) C.couchHeld = false; if (e.button === 2) focusHeld = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
$('card').addEventListener('click', advance);
window.addEventListener('blur', () => { skipKey = false; keys.rein = keys.left = keys.right = keys.guard = keys.look = keys.throw = false; focusHeld = false; if (M && S.mode === 'charge' && !G.manual && !S.online) setPaused(true); });

function setPaused(v) {
  if (!v) { if (R && R.hl) closeHL(); if (S.rpl) { const card = S.rplFrom === 'card'; closeReplays(); if (card) return; } }      // (the touch pause button also backs out of a highlight, and of the list)
  S.paused = v; const b = $('banner');
  if (v) { showPauseMain(); if (window.speechSynthesis && !S.online) window.speechSynthesis.pause(); }
  else { S.rpl = false; document.body.classList.remove('rpl-open'); $('pmenu').classList.add('hidden'); if (S.mode !== 'intro') b.classList.add('hidden'); if (window.speechSynthesis) window.speechSynthesis.resume(); }
  if (!S.muted && !S.online) audio.setMuted(v);
}
// the pause menu's buttons (desktop), its Replays list, and the highlight's Back button
$('pmRide').addEventListener('click', () => setPaused(false));
$('pmRpl').addEventListener('click', () => openReplays('pause'));
$('pmLeave').addEventListener('click', () => { if (M && S.paused) { setPaused(false); endMatch(); menus.show('main'); } });
$('hlBack').addEventListener('click', () => closeHL());
$('cardReplays').addEventListener('click', (e) => { e.stopPropagation(); openReplays('card'); });
$('pmList').addEventListener('click', (e) => {
  const t = e.target.closest('button, .rrow'); if (!t) return;
  if (t.id === 'pmBack') { closeReplays(); return; }
  const i = +(t.dataset.i); if (!(i >= 0)) return;
  openHL(i, t.dataset.a != null ? +t.dataset.a : undefined);
});

// ------------------------------------------------------------------ HUD
let hudT = 0;
let dollSig = '';
function updateHud(force) {
  if (!M) return;
  { const a = player.dmg, b = opp.dmg || {}, sig = [a.shield, a.helm, a.breast, a.pauldronL, b.shield, b.helm, b.breast, b.pauldronL].map(v => Math.round((v || 0) * 40)).join(',');
    if (sig !== dollSig) { dollSig = sig; drawDoll($('dollP'), a); drawDoll($('dollO'), Object.assign({ shield: 0, helm: 0, breast: 0, pauldronL: 0 }, b)); } }
  $('scoreP').textContent = M.score[0]; $('scoreO').textContent = M.score[1];
  $('courseInfo').textContent = (M.bridge ? `BOUT ${M.bridge.bout}/${M.bridge.n} · ` : '') + (M.practice ? `LESSON ${M.lesson + 1}/${LESSONS.length}` : M.course > M.courses ? 'EXTRA COURSE' : `COURSE ${Math.max(1, M.course)}/${M.courses}`);
  if (force) {
    const mk = (a) => a.map(c => `<div class="mark ${c}">${{ m: '–', a: '1', b: '2', h: '3', u: 'U', f: '✕' }[c]}</div>`).join('');
    $('marksP').innerHTML = mk(M.marks[0].slice(-6)); $('marksO').innerHTML = mk(M.marks[1].slice(-6));
  }
  $('favFill').style.left = `${50 + M.fav.commons * 48}%`; $('favFill2').style.left = `${50 + M.fav.court * 48}%`;
  { const c = M.fav.commons, k = M.fav.court; $('crowdTxt').textContent = M.practice ? 'A few idlers watch from the rail' : c > 0.55 ? 'The commons chant your name' : k > 0.55 ? 'The gallery adores you' : c < -0.5 ? 'The commons jeer you' : k < -0.45 ? 'The court looks down on you' : c + k > 0.4 ? 'The lists are warming to you' : c + k < -0.4 ? `They favour ${M.od.short}` : 'All eyes are on the lists'; }
  if (!C) return;
  const pips = $('gaitPips').children; for (let i = 0; i < 5; i++) pips[i].classList.toggle('on', i === C.tier);
  $('speedTxt').textContent = `${Math.round(player.speed * 3.6)} km/h`;
  $('bondTxt').textContent = `BOND ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}`;
  { const b = $('burstTxt'), B = sk('burst'); b.textContent = !B ? '' : C.burstT > 0 ? 'THE SPUR!' : C.burstUsed ? 'SPUR SPENT' : C.tier === 4 ? 'SHIFT: THE SPUR' : 'THE SPUR READY'; b.className = C.burstT > 0 ? 'go' : B && !C.burstUsed ? 'on' : ''; }
  const gapH = gapNow(), closing = player.speed + opp.speed;
  const tti = closing > 2 ? (gapH - 2.4) / closing : 99;
  const sEl = $('strideTxt');
  if (S.mode === 'charge' && !C.pL.done && tti < 6 && tti > 0) { const n = Math.max(0, Math.ceil(tti * (0.78 + 0.12 * player.speed))); sEl.innerHTML = `${n}<small>${n === 1 ? 'STRIDE' : 'STRIDES'} TO THE SHOCK</small>`; sEl.classList.toggle('now', n <= 4 && C.couch < 0.5); }
  else sEl.innerHTML = '';
  $('stamBar').style.width = `${M.stamina * 100}%`; $('stamBar').style.background = M.stamina < 0.25 ? 'var(--red)' : 'var(--gold)';
  $('calmBar').style.width = `${(1 - M.agit) * 100}%`; $('calmBar').style.background = M.agit > 0.6 ? 'var(--red)' : 'var(--green)';
  $('horseBar').style.width = `${M.hp.horse * 100}%`; $('horseBar').style.background = M.hp.horse < 0.4 ? 'var(--red)' : 'var(--green)';
  { const w = 1 - M.bodyS.p.wind; $('breathBar').style.width = `${w * 100}%`; $('breathBar').style.background = w < 0.5 ? 'var(--red)' : 'var(--gold)'; }
  $('bodyBar').style.width = `${M.hp.body * 100}%`; $('bodyBar').style.background = M.hp.body < 0.4 ? 'var(--red)' : 'var(--green)';
  const steady = clamp(1 - C.sway / 0.07, 0, 1);
  $('armBar').style.width = `${steady * 100}%`; $('armBar').style.background = steady < 0.4 ? 'var(--red)' : 'var(--gold)';
  $('focusBar').style.width = `${M.focus * 100}%`;
  $('couchTxt').textContent = player.lanceBroken ? 'LANCE BROKEN' : C.couch >= 0.999 ? (C.setT > 0.4 ? (C.fatigue > 0.35 ? 'ARM TIRING' : M.bodyS.p.arm > 0.3 ? 'COUCHED · ARM JARRED' : 'COUCHED · SET') : 'COUCHED · SETTLING') : C.couch > 0.05 ? 'LOWERING…' : 'LANCE UPRIGHT';
  const br = $('braceTxt'); br.textContent = C.braceT > 0 ? 'THRUSTING' : C.braceCd > 0 ? 'THRUST: RECOVERING' : 'THRUST READY (SPACE)'; br.classList.toggle('on', C.braceT > 0);
  const sh = $('shieldTxt'); sh.textContent = player.guard > 0.5 ? 'SHIELD: HIGH (guards the helm)' : 'SHIELD: LOW (guards the body)'; sh.classList.toggle('on', player.guard > 0.5);
  const ph = player.phase % 1, pulse = C.tier === 4 ? Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.2) : 0;
  const dot = $('rhythmDot'); dot.style.width = dot.style.height = `${8 + pulse * 38}px`; dot.style.opacity = 0.35 + pulse * 0.65;
  // prompt
  let pr = '';
  if (S.mode === 'ready') pr = C.rd.sig ? `Tap <kbd>W</kbd> to ride` : C.rd.p ? `Your lance is up. Wait for the marshal…` : `Tap <kbd>W</kbd> to raise your lance` + (M.practice || C.act ? '' : ` &nbsp;·&nbsp; or first: <kbd>1</kbd> salute the gallery <kbd>2</kbd> rouse the commons <kbd>3</kbd> taunt him <kbd>4</kbd> steady your horse`) + ` &nbsp;·&nbsp; <kbd>H</kbd> ${player.visor ? 'visor' : 'helm on or off'}`;
  else if (S.mode === 'charge' && !C.pL.done) {
    if (C.tier < 3 && C.t > 1.2) pr = `Tap <kbd>W</kbd> again — walk, trot, canter, gallop`;
    else if (C.couch < 0.2 && tti < 2.0 && tti > 0.35) pr = `Hold <kbd>LEFT MOUSE</kbd> — lower your lance now`;
    else if (C.couch > 0.9 && tti < 0.45 && C.braceT <= 0 && C.braceCd <= 0) pr = `<kbd>SPACE</kbd> — thrust!`;
  } else if ((S.mode === 'charge' || S.mode === 'after') && C.pL.done && !C.raised && C.couchHeld) pr = `Let go of <kbd>LEFT MOUSE</kbd> — raise your lance`;
  else if (S.mode === 'after' && !M.result && C.rb && C.turn.p.stage === 'free') pr = C.rb.nearSq ? `<kbd>F</kbd> Hand the lance to your squire &nbsp;·&nbsp; hold <kbd>T</kbd> Throw it down` : `Ride to the marker &nbsp;·&nbsp; <kbd>W</kbd> faster · <kbd>S</kbd> slower · <kbd>A</kbd> <kbd>D</kbd> steer${C.rb.onMark ? ' &nbsp;·&nbsp; hold still' : ''}`;
  else if (S.mode === 'after' && !M.result && C.rb && C.turn.p.stage === 'hand' && player.lanceBroken && !C.rb.handed) pr = `<kbd>F</kbd> Hand the lance to your squire &nbsp;·&nbsp; hold <kbd>T</kbd> Throw it down`;
  else if (S.mode === 'after' && !M.result && C.verdict) pr = `Wheeling about… <kbd>C</kbd> look behind`;
  if (touchMode) pr = touchPrompt(tti);
  $('prompt').innerHTML = pr;
  if (M.practice) updateLesson();
}
/** The in-match prompt in touch words (the keyboard prompt above is computed, then replaced). */
function touchPrompt(tti) {
  if (S.mode === 'ready') return C.rd.sig ? `Tap <kbd>SPUR</kbd> — ride!` : C.rd.p ? `Your lance is up. Wait for the marshal…` : `Tap <kbd>SPUR</kbd> to raise your lance &nbsp;·&nbsp; drag or tap to aim`;
  if (S.mode === 'charge' && !C.pL.done) {
    if (C.tier < 3 && C.t > 1.2) return `Tap <kbd>SPUR</kbd> again — walk, trot, canter, gallop`;
    if (C.couch > 0.9 && tti < 0.45 && C.braceT <= 0 && C.braceCd <= 0) return `Tap <kbd>BRACE</kbd> — thrust!`;
    if (C.t < 5) return `Drag or tap to aim`;
  }
  return '';
}
function updateLesson() {
  const L = LESSONS[M.lesson];
  $('lessonTitle').textContent = `${M.lesson + 1}. ${L.title}`; $('lessonGoal').textContent = L.goal;
  let nowSet = false;
  $('lessonList').innerHTML = L.steps.map(s => { const done = !!C.flags[s[1]]; const now = !done && !nowSet; if (now) nowSet = true; return `<li class="${done ? 'done' : now ? 'now' : ''}">${s[0]}</li>`; }).join('');
  $('lessonNote').textContent = L.note;
}

function updateReticle() {
  const ret = $('reticle'), cur = $('cursorDot');
  const show = M && C && (S.mode === 'charge' || S.mode === 'ready') && !C.pL.done && !C.cut && player.look < 0.3;
  ret.style.display = cur.style.display = show ? 'block' : 'none';
  if (!show) return;
  const w = window.innerWidth, h = window.innerHeight, D = dirP();
  cur.style.left = `${(mouse.x * 0.5 + 0.5) * w}px`; cur.style.top = `${(-mouse.y * 0.5 + 0.5) * h}px`;
  // true aim: where the lance line meets the opponent's plane
  player.gripWorld(_a); player.tipWorld(_b); _c.subVectors(_b, _a).normalize();
  if (player.lanceLower > 0.95) player.aimWorld(_c);      // the ring follows where you mean the point to go; far out the shaft itself is held wider, clear of your horse's head
  opp.zoneWorld('body', _zc);
  const t = _c.z * D > 0.05 ? clamp((_zc.z - _a.z) / _c.z, LANCE_REACH, 150) : 150;
  _p.copy(_a).addScaledVector(_c, t);
  let zone = '';
  if (C.couch > 0.9) for (const z of opp.zones) { z.o.getWorldPosition(_d); if (Math.hypot(_p.x - _d.x, _p.y - _d.y) < z.r) { zone = z.name; break; } }
  if (zone === 'shield' && S.mode === 'charge') { C.onMarkT += 1 / 60; if (C.onMarkT > 0.3) C.flags.onmark = true; }
  _p.project(camera);
  ret.style.left = `${(_p.x * 0.5 + 0.5) * w}px`; ret.style.top = `${(-_p.y * 0.5 + 0.5) * h}px`;
  ret.className = (C.couch < 0.9 ? 'up ' : '') + zone;
  $('zoneTxt').textContent = zone ? zone.toUpperCase() : '';
}

function updateMask() {
  const m = $('helmMask');
  const on = (M && C && player && C.cut && C.cut.kind === 'visor') || S.fp && M && C && (S.mode === 'ready' || S.mode === 'charge' || S.mode === 'after') && !player.unhorsed && !C.cut && !(C.cine) && !player.visorUp && !player.helmOff;      // visor up or helm off: the full view
  if (!on) { if (m.style.display !== 'none') m.style.display = 'none'; return; }
  const vis = player.armourDef.vision, frog = player.armourDef.helm === 'frogmouth' || M.kit.bolted;      // the bolted Stechhelm: the slit sits high, so sit up at the last moment to see
  const half = (5 + vis * 30) * (1 - PHYS.damage.helmView * player.dmg.helm), c = 47 - player.brace * (frog ? 36 : 8);   // sit up in the frog-mouth and the sight lifts to the sky
  m.style.display = 'block';
  m.style.background = `linear-gradient(to bottom, #050505 0, #050505 ${c - half}%, rgba(5,5,5,0) ${c - half + 3}%, rgba(5,5,5,0) ${c + half - 3}%, #050505 ${c + half}%, #050505 100%)`;
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 6, -50), camLook = new THREE.Vector3(0, 2, 0), want = new THREE.Vector3(), wantLook = new THREE.Vector3();
let fov = 58;
/** State of the lazy follow cam used while the scripted ride-back runs: its yaw lags the horse's heading (about 1.7 s), and it is eased in over the first second or two.
 *  Runs every frame (also under a cut) so it is current when the cut ends. Returns true when the follow cam is the active one. */
const FC = { yaw: 0, hd: 0, b: 0 };
function followCam(dtReal) {
  if (!player || !C) return false;
  const T = C.turn.p, on = S.mode === 'after' && !C.rb && !S.fp && (player.manualPos || T.stage === 'done') && T.stage !== 'free';
  const hd = player.root.rotation.y; FC.hd = hd;
  if (!on) { FC.yaw = hd; FC.b = 0; return false; }
  FC.yaw += wrapA(hd - FC.yaw) * (1 - Math.exp(-dtReal / 1.7)); FC.b = Math.min(1, FC.b + dtReal / 1.4);
  return true;
}
function updateCamera(dtReal) {
  if (G.cam) { camera.position.set(...G.cam.p); camera.lookAt(...G.cam.l); if (G.cam.fov) { camera.fov = G.cam.fov; camera.updateProjectionMatrix(); } if (player) player.helm.visible = true; return; }
  let rate = 7, wantFov = 58, snap = false, own = false;
  const D = dirP();
  const autoCam = followCam(dtReal);
  if (S.mode === 'menu') {
    S.menuAng += dtReal * 0.08;
    const c = player ? player.root.position : _a.set(0, 0, 0);
    if (S.menuView === 'armoury') {
      // the knight stands on the left of the page, as in a manuscript portrait
      const a = S.menuAng * 1.6, px = c.x + Math.sin(a) * 5.4, pz = c.z + Math.cos(a) * 5.4;
      want.set(px, 2.0, pz);
      const vx = c.x - px, vz = c.z - pz, len = Math.hypot(vx, vz) || 1;
      wantLook.set(c.x + (-vz / len) * 1.7, 1.45, c.z + (vx / len) * 1.7); rate = 4; wantFov = 44;
    } else {
      want.set(c.x + Math.sin(S.menuAng) * 6.2, 2.3 + Math.sin(S.menuAng * 0.7) * 0.4, c.z + 1.0 + Math.cos(S.menuAng) * 6.2);
      wantLook.set(c.x - 1.2, 1.75, c.z + 0.4); rate = 3; wantFov = 42;
    }
  } else if (S.mode === 'intro' && introNew()) {
    const r = ceremony.camera(S.introT, player, opp, want, wantLook); wantFov = r.fov; snap = r.snap || S.introT < 0.05; rate = r.id === 'warmP' || r.id === 'warmO' ? 8 : 4;
  } else if (S.mode === 'intro') {
    const t = S.introT, on = t < 4.2 ? opp : player, a = (on === opp ? t : t - 4.2) * 0.3 - 0.95, dd = on.dir || -1;
    const c = on.root.position;
    want.set(c.x + Math.sin(a) * 6.2 * dd, 1.7 + (on === opp ? t : t - 4.2) * 0.16, c.z + Math.cos(a) * 6.2 * dd);
    wantLook.set(c.x, 1.75, c.z); rate = 4; wantFov = 40; snap = Math.abs(t - 4.2) < 0.05 || t < 0.05;
  } else if (S.mode === 'replay' && R) {
    wantFov = replayCam(); rate = 30; if (!R.camSet || R.cut) { R.camSet = true; R.cut = false; snap = true; fov = wantFov; }
  } else if (C && C.cut) {
    const k = C.cut.kind, p = player.root.position;
    if (C.cut.ots > 0) {      // over your shoulder: your knight from behind, looking the way he is addressing
      const c = _c; if (k === 'royal') c.set(15.5, 3.2, 0); else if (k === 'commons') c.set(-Math.sign(p.x) * 10.5, 1.3, p.z - D * 1.5); else if (k === 'opp') c.set(opp.root.position.x, 2.0, opp.root.position.z); else if (k === 'lady') c.copy(C.cut.pos); else player.head.getWorldPosition(c);
      player.helm.getWorldPosition(_b); _a.set(c.x - _b.x, 0, c.z - _b.z); if (_a.lengthSq() < 1e-4) _a.set(0, 0, D); _a.normalize();
      want.set(_b.x - _a.x * 2.3 - _a.z * 0.55, _b.y + 0.5, _b.z - _a.z * 2.3 + _a.x * 0.55); wantLook.set(_b.x + _a.x * 9, _b.y + clamp((c.y - _b.y) * 0.3, -0.5, 1.6), _b.z + _a.z * 9); wantFov = 46;
    }
    else if (k === 'royal') { want.set(8.2, 4.9, 1.5); wantLook.set(15.5, 3.2, 0); wantFov = 25; }
    else if (k === 'judges') { const u = clamp(1 - C.cut.t / FLAG_CUT, 0, 1); want.set(2.8, 1.95, -1.0 + u * 1.3); wantLook.set(8.7, 2.15, 0); wantFov = 38; }      // the table across the lists, flags up
    else if (k === 'helmfit') {      // the squire at your stirrup reaching up to your helm, from in front and outside
      player.helm.getWorldPosition(_b); const sq = field.where('squire', _d), fw = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion), pp = player.root.position;
      let ox = sq ? sq.x - pp.x : -Math.sign(pp.x) || -1, oz = sq ? sq.z - pp.z : 0; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol; const t = C.beat ? C.beat.t : 0;
      want.set(pp.x + ox * 3.3 + fw.x * (2.1 - 0.3 * t), 1.8, pp.z + oz * 3.3 + fw.z * (2.1 - 0.3 * t)); wantLook.set(_b.x + ox * 0.5, _b.y - 0.35, _b.z + oz * 0.5); wantFov = 34;
    }
    else if (k === 'visor') {      // through your own visor slit, down the lists at the man you will meet (the mask is drawn in updateMask)
      player.helm.getWorldPosition(want); want.y += 0.17; const fw = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion); want.addScaledVector(fw, 0.05);
      wantLook.set(opp.root.position.x, 2.2, opp.root.position.z); wantFov = 52;
    }
    else if (k === 'react') {      // the reaction montage: the stands, your squire, a lady of the gallery
      const sub = C.cut.sub;
      if (sub === 'crowd') { const s = C.cut.cs, z = C.cut.zc; want.set(s * 3.4, 1.9, z - 8); wantLook.set(s * 17, 3.4, z + 2); wantFov = 52; }
      else if (sub === 'crowd2') { const s = C.cut.cs, z = C.cut.zc; want.set(-s * 3.4, 1.6, z + 7); wantLook.set(-s * 16, 3.0, z - 2); wantFov = 50; }
      else if (sub === 'squire') {
        const q = C.cut.pos, dz = -Math.sign(q.z) || 1, sq = field.where('squire', _d) || q;
        want.set(q.x * 0.6, 1.6, q.z + dz * 7); wantLook.set(sq.x, 1.5, sq.z); wantFov = 34;
      }
      else { const q = C.cut.pos, sx = Math.sign(q.x) || 1; want.set(q.x - sx * 6.5, q.y + 0.6, q.z + 1.2); wantLook.set(q.x, q.y, q.z); wantFov = 22; }
    }
    else if (k === 'commons') { want.set(p.x * 0.4, 2.3, p.z + D * 3.5); wantLook.set(-Math.sign(p.x) * 10.5, 1.3, p.z - D * 1.5); wantFov = 46; }
    else if (k === 'lady') { const q = C.cut.pos, sx = Math.sign(q.x) || 1; want.set(q.x - sx * 6.5, q.y + 0.6, q.z + 1.2); wantLook.set(q.x, q.y, q.z); wantFov = 22; }
    else if (k === 'opp') { const o = opp.root.position; want.set(o.x * 0.2, 2.1, o.z - (opp.dir || -1) * -7); wantLook.set(o.x, 2.0, o.z); wantFov = 26; }
    else { player.head.getWorldPosition(wantLook); want.set(wantLook.x - Math.sign(p.x) * 2.2, wantLook.y + 0.3, wantLook.z + D * 1.6); wantFov = 40; }
    rate = 30; { const sh = C.cut.ots > 0 ? 1 : 2; if (C.cut.shot !== sh) { C.cut.shot = sh; snap = true; } } C.cutWas = true;
  } else if (C && C.cine && (S.mode === 'after' || S.slowT > 0)) {
    const r = C.cine.rider.position;
    want.set(r.x + Math.sign(r.x) * 6.2, 1.45, r.z + 3.6 * C.cine.dir); wantLook.set(r.x, 0.75, r.z); rate = 3.5; wantFov = 42;
    if (!C.cineCut) { C.cineCut = true; snap = true; }
  } else if (S.fp && !player.unhorsed) {
    player.helm.getWorldPosition(want); want.y += 0.17;
    const fwd = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion), lk = player.look;
    want.addScaledVector(fwd, 0.05);
    // forward along the lists with a bias to the tilt side; glance over the left shoulder when looking behind
    const yaw = (0.22 - mouse.x * 0.55) + lk * 2.65, pit = mouse.y * 0.3 - 0.03;
    const dirYaw = Math.atan2(fwd.x, fwd.z) + yaw;
    wantLook.set(want.x + Math.sin(dirYaw) * 20, want.y + pit * 20 * (1 - lk * 0.6), want.z + Math.cos(dirYaw) * 20);
    rate = 40; wantFov = 72; own = true;
  } else {
    const p = player.root.position, hs = player.hs, lk = player.look, bob = (player.bob || 0);
    const fwd = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion);
    if (autoCam) {      // the scripted ride-back: a lazy follow cam with its own damped yaw, looking a little ahead of where the horse is going
      const cx = Math.sin(FC.yaw), cz = Math.cos(FC.yaw), lag = Math.abs(wrapA(FC.hd - FC.yaw)), la = clamp(player.speed * 1.1, 0, 4.5) + 1.5 * FC.b, t = S.time, dist = 4.4 + 0.9 * Math.min(lag, 1.5);
      // handheld: a few centimetres and a fraction of a degree, very slow
      const hx = Math.sin(t * 0.37) * 0.04 + Math.sin(t * 0.91 + 1.3) * 0.02, hy = Math.sin(t * 0.29 + 2) * 0.03 + Math.sin(t * 0.77) * 0.015, hz = Math.sin(t * 0.43 + 4) * 0.04;
      _b.set(p.x - cx * dist + cz * 0.6 + hx, 2.8 * hs + bob * 0.6 + hy, p.z - cz * dist - cx * 0.6 + hz);
      _c.set(p.x + Math.sin(FC.hd) * la - hz * 0.5, 1.8 + hy, p.z + Math.cos(FC.hd) * la + hx * 0.5);
      // eased in from the charge cam
      want.set(p.x + D * 0.72, 2.72 * hs + bob * 1.1, p.z - D * 3.5).lerp(_b, FC.b); wantLook.set(p.x + D * 1.25, 1.95, p.z + D * 30).lerp(_c, FC.b); rate = lerp(9, 4.5, FC.b);
    } else if (player.manualPos) { want.set(p.x - fwd.x * 4.2 + fwd.z * 0.6, 2.9 * hs, p.z - fwd.z * 4.2 - fwd.x * 0.6); wantLook.set(p.x + fwd.x * 12, 1.9, p.z + fwd.z * 12); rate = 3.2; }
    else {
      const th = player.brace;      // thrusting: the camera closes in and swings a little wide, so the body going forward is seen
      want.set(p.x + D * (0.72 + 0.55 * th), 2.72 * hs + bob * 1.1 - 0.28 * th, p.z - D * (3.5 - 0.8 * th));
      wantLook.set(p.x + D * 1.25, 1.95 + bob * 0.5, p.z + D * 30); rate = 9;
      if (lk > 0.02) {   // swing round in front of the rider to see what is behind him
        want.lerp(_b.set(p.x + D * 2.0, 2.5 * hs, p.z + D * 4.6), lk); wantLook.lerp(_c.set(p.x - D * 0.4, 1.9, p.z - D * 22), lk); rate = 12;
      }
    }
    if (C && C.cutWas) { C.cutWas = false; snap = true; }
    wantFov = 58 + clamp(player.speed / 9, 0, 1) * 7 - 5 * player.brace; own = true;
  }
  if (S.focusOn) wantFov -= 9;
  if (snap || camPos.distanceTo(want) > 60) { camPos.copy(want); camLook.copy(wantLook); }
  const k = 1 - Math.exp(-rate * dtReal);
  camPos.lerp(want, k); camLook.lerp(wantLook, 1 - Math.exp(-rate * 1.2 * dtReal));
  if (C && C.fovSnap && !R) { C.fovSnap = false; fov = wantFov; }      // cut back from a replay: no zoom
  fov = damp(fov, wantFov, 4, dtReal);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.position.copy(camPos);
  if (S.shake > 0.005) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.25; camera.position.y += (Math.random() - 0.5) * S.shake * 0.25; S.shake *= Math.exp(-5 * dtReal); }
  camera.position.y = Math.max(0.3, camera.position.y);
  camera.lookAt(camLook);
  if (own && player && M) camera.rotation.z += Math.sin(player.phase * TAU + 1) * 0.006 * clamp(player.speed / 11, 0, 1);   // the roll of the gallop
  const fpNow = (own && S.fp) || !!(C && C.cut && C.cut.kind === 'visor');
  if (player) player.helm.visible = !fpNow;
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
// frame cap: a 120-165 Hz screen would otherwise draw the lists that many times a second (heavy on the GPU and fans for no gain);
// a match draws at most 60 a second, the menus 30
let lastDraw = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (G.manual) return;
  if (!(now > 0)) now = performance.now();      // (the first call comes without a timestamp)
  const cap = S.mode === 'menu' ? 30 : 60;
  const iv = 1000 / cap, el = now - lastDraw;
  if (el < iv - 0.5) return;
  lastDraw = el > iv * 2 ? now : lastDraw + iv;      // keep the beat (a fixed step) so 144 Hz gives 60, not 48; after a stall, start afresh
  const dt = clock.getDelta();
  frameTime(dt * 1000, S.paused || document.hidden || S.mode === 'menu');      // the live safety net (src/gfx.js); the capped menus would read as slow
  frame(Math.min(dt, 0.05));
}
// the safety net lowered the pixel ratio or a tier: apply what can change on the fly (trees and crowd change with the next venue build)
GFX.listeners.push((ev) => {
  renderer.setPixelRatio(ev.pr); resize();
  if (ev.kind === 'tier') { post.lighten(GFX.post === 'plain' ? 'plain' : 'lite'); if (world && world.setShadowSize) world.setShadowSize(GFX.shadow); }
  console.info('[gfx] frames averaged ' + ev.avg.toFixed(1) + ' ms: ' + (ev.kind === 'tier' ? 'dropped to ' + ev.tier : 'pixel ratio ' + ev.pr.toFixed(2)));
  if (G.gfxLog) G.gfxLog.push(ev); else G.gfxLog = [ev];
});
G.physLog = [];
G.hitboxes = (on = true) => { G._hbDebug = !!on; if (!on) { if (player) player.dbgUpdate(frameId, false); if (opp && opp.dbgUpdate) opp.dbgUpdate(frameId, false); } return G._hbDebug; };
G.step = (n = 1, dt = 1 / 60) => { G.manual = true; for (let i = 0; i < n; i++) frame(dt); };
function frame(dtReal) {
  touch.update();
  if (S.paused && !S.online) {      // (online the pause menu opens but the match goes on)
    if (R && R.hl) { S.time += dtReal; updateReplay(dtReal, dtReal); replayDress(); updateCamera(dtReal); post.render(dtReal); }      // a highlight plays while the match stands still
    else post.render(0);
    return;
  }
  if (R && R.live) replayUndress();      // (back to the real poses before anything of the match runs)
  S.time += dtReal; frameId++;
  S.focusOn = focusHeld && M && M.focus > 0 && S.mode === 'charge' && C && !C.pL.done;
  if (S.focusOn) M.focus = Math.max(0, M.focus - dtReal * (sk('nerve') ? SKILLS.nerve.drain : 0.42) * (1 + PHYS.body.windFocus * M.bodyS.p.wind));      // winded, he cannot hold his breath for long
  let ts = 1;
  if (S.online) S.slowT = 0;      // online both simulations must stay in step: no slow motion
  else if (S.slowT > 0) { S.slowT -= dtReal; ts = S.slowT > 0.3 ? 0.16 : lerp(1, 0.16, S.slowT / 0.3); }
  else if (S.focusOn) ts = 0.4;
  S.timeScale = damp(S.timeScale, ts, S.slowT > 0 ? 30 : 9, dtReal);
  const dt = dtReal * S.timeScale;
  audio.setTimeScale(S.mode === 'replay' ? 1 : S.timeScale);
  musicSync();
  if (S.focusOn) { S.hb = (S.hb || 0) - dtReal; if (S.hb <= 0) { S.hb = 0.75; audio.heartbeat(0.8); } }

  if (S.mode === 'intro') {
    S.introT += dtReal;
    if (introNew()) { if (S.introT < MOVE.end) ceremony.stage(S.introT, player, opp, dt); introCues(S.introT); }      // the knights' walk-out, then the cues
    player.update(dt); opp.update(dt);
    // hold Space / Enter to skip: the ring fills; a tap does nothing
    S.skipHold = skipKey ? S.skipHold + dtReal : Math.max(0, S.skipHold - dtReal * 2.5);
    // online: a vote once cast stands (players rarely hold at the same moment); the ring says who is still to vote
    const tch = touchMode ? 'Hold the screen' : 'Hold <kbd>SPACE</kbd>';
    const lbl = !S.online ? null : S.skipWanted.me ? 'Waiting for your opponent to skip…' : S.skipWanted.them ? `Your opponent wants to skip · ${tch}` : null;
    ceremony.skipUI(true, S.skipWanted.me ? 1 : S.skipHold / SKIP_HOLD, lbl);
    if (S.skipHold >= SKIP_HOLD && !S.skipWanted.me) skipVote();
    if (S.mode === 'intro' && S.introT > (introNew() ? INTRO_END : 8.4)) finishIntro();
  } else if (S.mode === 'menu') { if (player) player.update(dt); if (S.menuView === 'armoury') previews.update(dtReal, menus.root, profile.arms); if (S.menuView === 'stable') stable.update(dtReal, menus.root, menus.stableHorse(), profile.arms, menus.stableCap()); else stable.release(); }
  else if (S.mode === 'replay') updateReplay(dtReal, dt);
  else if (M && C) { if (C.patCd > 0) C.patCd -= dtReal; updateRide(dt, dtReal); }
  if (S.online && M) netTick(dtReal);

  field.update(dt, fieldEnv());
  if (M) ceremony.update(dtReal, S.time);
  if (M) flagmen.update(dtReal, S.time, [player && player.root.position, opp && opp.root && opp.root.position]);
  if (M) { judges.update(dtReal, S.time); beatSkip(dtReal); }
  life.update(dt, { mode: M ? S.mode : 'menu', focusZ: player && opp && M ? (player.z + opp.z) / 2 : 0, canCall: !!M && !M.result && (S.mode === 'ready' || S.mode === 'after') });
  if (R) replayDress();      // the replay pose for this frame (after everything that looks at the riders' real places)
  if (G._hbDebug) { if (player) player.dbgUpdate(frameId, true); if (opp && opp.dbgUpdate) opp.dbgUpdate(frameId, true); }
  S.excite = damp(S.excite, 0.12, 0.45, dtReal);
  if (strokeQ.mute > 0) strokeQ.mute -= dtReal;
  if (strokeQ.list.length) { strokeQ.t -= dtReal; if (strokeQ.t <= 0 || (C && C.pL.done && C.oL.done)) flushStrokes(); }      // one reaction for the pair of strokes
  if (world) {
    S.fanfareT = Math.max(0, (S.fanfareT || 0) - dtReal);
    const ps = world.propState; ps.mode = S.mode === 'replay' ? 'after' : S.mode; ps.fanfare = S.fanfareT > 0; ps.excitement = S.excite;
    const cs = world.crowdState;
    cs.excitement = clamp(S.excite * (M ? M.V.crowd : 1), 0, 1); cs.anticipation = S.antic || 0; cs.favour = M ? M.favour : 0; cs.favourCommons = M ? M.fav.commons : 0; cs.favourCourt = M ? M.fav.court : 0; cs.event = S.crowdEv; cs.scorer = S.scorer || 0;
    cs.waveStart = S.waveT ?? -999; cs.focusZ = player ? (opp && M ? (player.z + opp.z) / 2 : player.z) : 0;
    world.update(S.time, S.mode === 'replay' ? dtReal * 0.3 : dt);
    if (player) world.focusShadow(S.mode === 'intro' && introNew() ? ceremony.focus(S.introT, player, opp, _a) : S.mode === 'intro' && S.introT < 4.2 && opp ? opp.root.position : (C && C.cine && S.mode === 'after' ? C.cine.rider.position : player.root.position));
  }
  audio.update(dtReal, { excitement: S.excite, anticipation: S.antic || 0, speed: player && M && S.mode !== 'replay' ? player.speed : 0, favour: M ? M.favour : 0 });
  if (S.mode !== 'replay' && !R) fx.update(dt);
  updateCamera(dtReal);
  speech.update();
  if (player) player.root.updateMatrixWorld(true);
  hudT -= dtReal; if (hudT <= 0) { hudT = 0.05; updateHud(false); }
  updateReticle(); updateMask();
  voice.update(dtReal); flushCall(); pumpToast();
  post.setFocus(S.focusOn ? 1 : 0); post.setSpeed(M && player && S.mode === 'charge' ? clamp((player.speed - 6.2) / 3, 0, 1) * 0.5 : 0);
  post.render(dtReal);
}

// ------------------------------------------------------------------ boot
const previews = createPreviews();
const stable = createStable();
const touch = initTouch({ S, mouse, openReplays: () => openReplays('pause'), inMatch: () => !!M && S.mode !== 'menu', getC: () => C, spur, brace: doBrace, advance, setPaused, initAudio, setSkip: (v) => { skipKey = v; },
  leave() { if (M && S.paused) { setPaused(false); endMatch(); menus.show('main'); } } });
const menus = initMenus({ touch: touchMode, fullscreen: goFullscreen,
  get profile() { return profile; }, saveProfile, rebuildPlayer, startMatch, newTable, online: onlineApi,
  resetCircuit() { profile.table = newTable(); profile.venue = 0; saveProfile(); },
  startPractice(restart) { if (restart) { profile.lesson = 0; saveProfile(); } startMatch(Math.max(0, venueIdx), null, false, true); },
  setVenue, musicVol, setMusic, voicesOn, setVoices, checkFeats() { withFeats(() => checkFeats(profile)); }, ui: (k) => { initAudio(); audio.ui(k); }, S, onShow: (name) => { S.menuView = name; },
});
$('soundBtn').addEventListener('click', () => setSound(S.muted));
{ // show the saved sound state on the button (no save); browsers need a gesture before audio starts
  showSoundBtn(!S.muted);
  const wake = () => {
    window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake);
    if (S.muted) return;
    try { audio.init(); const c = audio.ctx; if (c && c.state === 'suspended') c.resume(); if (audio.music && audio.music.want) audio.music.play(audio.music.want); } catch (e) { /* audio not ready */ }
  };
  window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);
}
G.online = Object.assign({ NET, S }, onlineApi); G.setSound = setSound; G.post = post; G.startMatch = startMatch; G.advance = advance; G.spur = spur; G.interlude = interlude; G.startReplay = startReplay; G.openReplays = openReplays; G.openHL = openHL; G.closeHL = closeHL; G.closeReplays = closeReplays; G.setPaused = setPaused; G.replayView = replayView; G.burst = burst; G.menus = menus; G.saveProfile = saveProfile; Object.defineProperty(G, 'profile', { get: () => profile });
resize();
const firstVenue = Math.min(profile.venue || 0, VENUES.length - 1);
// Staged loading: the menu needs only the two models (and, at medium and high, the first sky, but not for more than a few seconds).
// The trees, props and the rest of the sky arrive in the background afterwards (SCANS.ready); a match waits for them (startMatch).
const paintLoading = () => {
  const st = loadStats('boot'), bar = $('loadBar'), txt = $('loadTxt');
  if (bar) bar.firstElementChild.style.width = Math.round(st.frac * 100) + '%';
  if (txt) txt.textContent = st.total ? `${mb(st.loaded)} of ${mb(st.total)} MB  ·  ${GFX.tier} graphics` : '';
};
paintLoading(); const loadIv = setInterval(paintLoading, 120);
const horseP = preloadHorse(), skyList = loadSkyList();
const skyP = GFX.skyWait ? skyList.then(() => loadSky(VENUES[firstVenue].sky, 'boot')) : null;
await horseP;
if (skyP) await Promise.race([skyP, new Promise(r => setTimeout(r, 8000))]);
clearInterval(loadIv);
await skyList;
setVenue(Math.min(profile.venue || 0, VENUES.length - 1));
rebuildPlayer();
menus.show('main');
tick();
window.__tiltUp = true;      // the menu is up (the watchdog in index.html stops waiting)
try { performance.mark('tilt-menu'); } catch (e) { /* ignore */ }
const hideLoading = () => { const l = $('loading'); if (l) { l.classList.add('done'); setTimeout(() => l.remove(), 900); } };
requestAnimationFrame(hideLoading); setTimeout(hideLoading, 400);
{ // in the background: trees, props, and (low tier) the sky
  if (!GFX.skyWait) loadSky(VENUES[firstVenue].sky);
  const note = $('bgNote'), paint = () => { const st = loadStats('bg'); if (note) { note.textContent = SCANS.ready ? '' : `Loading trees and props ${Math.round(st.frac * 100)}%`; note.classList.toggle('hidden', SCANS.ready || S.mode !== 'menu'); } };
  const iv = setInterval(paint, 300);
  preloadScans().then(() => { clearInterval(iv); paint(); refreshWorldWithScans(); startAudio(); });
  if (GFX.tier === 'high') startAudio(); else setTimeout(startAudio, 20000);      // (below high: after the trees and props, or after 20 s at the latest)
}
