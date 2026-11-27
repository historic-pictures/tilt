import * as THREE from 'three';
import { buildWorld, LANE_X, BARRIER_X, LAT_CLOSE, LAT_SHAVE, LAT_WIDE, START_Z, LIST_HALF } from './world.js';
import { Jouster, preloadHorse } from './jouster.js';
import { cleanBody, bodyFor, applyBody } from './body_types.js';
import { initFps } from './fps_overlay.js';
import { preloadRider, rigHas, RIG } from './rider_rig.js';
import { CELEBS, celStart, celClear, celActive, celCam, aiPick, aiLoser, favourites, promptChoices, showPrompt, hidePrompt, promptKey, cleanCel, heraldLine } from './celebrate.js';
import { FX } from './fx.js';
import { cachedPiece, lanceBitMat } from './lance_bits.js';
import { clamp, lerp, damp, smoothstep, wobble, drawCrest, TAU } from './util.js';
import { loadHeraldry, tinctureName } from './heraldry.js';
import { EQUAL_GEAR } from './config.js';
import { purse, HORSES, ARMOURS, KNIGHTS, VENUES, TRAINING_GROUND, GAIT_SPEED, COURSES_PER_MATCH, CAPARISONS, POINTS, DEFAULT_PROFILE, ovr, bondLevel, bondedHorse, BOND_NAMES, LANCES, DIFFICULTY, ARTS, LESSONS, TINCTURES, PHYS, SKILLS, RANKS, rankOf, HELMS, harness, MODES, modeKit, SLOW_PACE, LANCE_UP, RETINUE, TRAITS, menFx, fixRetinue, REST, restShare, QUINTAIN, DISCOVERY_SECONDS, ACH_RENOWN } from './data.js';
import { initMenus, purseText, rankBar } from './menus.js';
import { reckon, settle } from './economy.js';
import { createPreviews } from './previews.js';
import { createStable } from './stable.js';
import { createAttract } from './attract.js';      // the menu joust (src/attract.js): two knights riding endless passes behind the main menu
import { createPost } from './post.js';
import { OnlinePause } from './pause.js';
import { touchMode, initTouch, goFullscreen, noteMatch, getAimMode } from './touch.js';
/** Touch words for the keyboard-and-mouse wording in tips and lessons. */
const tw = (t) => !touchMode || !t ? t : t.replace(/Hold LEFT MOUSE to (lower the lance|bring it down)\.?/g, (m, a) => a === 'bring it down' ? 'The lance lowers itself as you close in.' : 'The lance lowers itself as you close in').replace(/Hold <kbd>LEFT MOUSE<\/kbd>/g, 'The lance lowers itself').replace(/Move the mouse so/g, 'Aim so').replace(/Watch the ring, not the mouse pointer\./g, 'Watch the ring: it is where your lance will actually hit.').replace(/Press SPACE just before/g, 'Tap BRACE just before').replace(/thrust \(SPACE\)/g, 'thrust (BRACE)').replace(/Thrust \(SPACE\)/g, 'Thrust (BRACE)').replace(/Press SPACE/g, 'Tap BRACE').replace(/Tap W/g, 'Tap SPUR').replace(/Each tap of W/g, 'Each tap of SPUR').replace(/ Hold S to slow him down\./g, '').replace(/SPACE/g, 'BRACE');
import { Quintain } from './quintain.js';
import { drawHitMap, drawDoll } from './verdict.js';
import { SCANS, preloadScans, loadSkyList, loadSky } from './scans.js';
import { GFX, frameTime, bootDone, simSpin, dropTier, setOverride } from './gfx.js';
import { stats as loadStats, mb } from './loadmeter.js';
import { LanceArm, impact, breakAt, bites, rng32, seedOf, refStroke } from './physics.js';
import { createVoice } from './voice.js';
import { createClips } from './voice_clips.js';
import { SPEECH, TEXT, UI, CROWD, SQUIRE, gate } from './channels.js';
import { createField } from './retinue_field.js';
import { createAftermath } from './aftermath.js';
import { createLife } from './stands_life.js';
import { createSpeech } from './speech3d.js';
import { chooseLine, ROLE_TITLE, OTHER_TITLE, LADY as LADY_CALLS, RIVAL, sideLine } from './retinue_lines.js';
import { createBooth, poolAt } from './booth.js';
import { createCrowdVoices, boothUI, colourWords } from './crowd_voices.js';
import { OFFICIALS } from './officials_lines.js';
import { createFlagmen } from './flagmen.js';
import { createJudges } from './judges.js';
import { watchInitial } from './lombard.js';
import { createCeremony, INTRO_END, SKIP_HOLD, MOVE } from './ceremony.js';
import { ANNOUNCER, HOST_LINES, INTRO, hostOf, hailName, bioOf, boastFor, fill, CIRCUIT, STAKES, HOST_FINAL } from './drama_lines.js';
import * as career from './career.js';
import { FIELD } from './career_story.js';
import { ACH_BY_ID, ensureFeats, checkFeats, courseFeats, matchFeats, circuitFeat, courtesyFeat, ladyFeat, rankLine } from './achievements.js';
import { Hit, sweepCapCap, sweepCapObb, capCapGap, capObbGap } from './collide.js';
import { createNet, makeCode, cleanCode, validCode, failText, preloadNet, useLocal } from './net.js';
import * as ranks from './ranks.js';
import * as account from './account.js';
import * as signin from './signin.js';
import * as store from './store.js';      // purchases: the Knight's Charter, the packs (the server decides; src/store.js)
import { PACKS } from './cosmetics.js';
import { cleanName, Remote, SEND_HZ, packProfile, cleanProfile, onlineOd, cleanRoom, onlineModeIds, packRider, packState, unpackState, cleanState, applyRider, mirrorVec, MIRROR_RESULT, cleanRes, cleanNear, clampNum } from './online.js';

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
  b.innerHTML = on ? ICON_ON : ICON_OFF; b.classList.toggle('on', on); b.classList.toggle('off', !on);
  const t = on ? 'Sound on: mute everything (M)' : 'Sound off: unmute (M)'; b.setAttribute('aria-label', t);
  showMusicBtn();
}
// ---- the music-only switch: silences the music (the game's, "My files" and YouTube) and keeps the herald, voices, crowd and effects
const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><ellipse cx="6.5" cy="17.5" rx="3.2" ry="2.5" fill="currentColor"/><ellipse cx="16.5" cy="15.5" rx="3.2" ry="2.5" fill="currentColor"/></svg>';
let musicOffNow = (() => { try { return localStorage.getItem('tilt.musicoff') === '1'; } catch (e) { return false; } })();
function setMusicOff(off) {
  musicOffNow = !!off;
  try { localStorage.setItem('tilt.musicoff', off ? '1' : '0'); } catch (e) { /* ignore */ }
  const m = audio.music; if (m && m.setOff) { if (!off) initAudio(); m.setOff(!!off); }
  showMusicBtn();
}
function showMusicBtn() {
  const b = $('musicBtn'); if (!b) return;
  const off = musicOffNow || musicVol() <= 0;
  b.innerHTML = NOTE; b.classList.toggle('on', !off); b.classList.toggle('off', off); b.classList.toggle('dim', S.muted);
  const t = off ? 'Music off: unmute the music' : 'Music on: mute the music only'; b.setAttribute('aria-label', t);
}
// ---- music: the mood follows the game state; one track runs on across courses (src/audio.js MusicBus)
const musicVol = () => { try { const v = localStorage.getItem('tilt.music'); return v === null ? 60 : clamp(Math.round(+v) || 0, 0, 100); } catch (e) { return 60; } };
function setMusic(v) {
  v = clamp(Math.round(+v) || 0, 0, 100);
  try { localStorage.setItem('tilt.music', String(v)); } catch (e) { /* ignore */ }
  if (v > 0 && musicOffNow) { musicOffNow = false; try { localStorage.setItem('tilt.musicoff', '0'); } catch (e) { /* ignore */ } const mm = audio.music; if (mm && mm.setOff) mm.setOff(false); }      // moving the slider up brings the music back
  showMusicBtn();
  const m = audio.music; if (!m || !m.setVolume) return;
  if (v > 0) initAudio();
  m.setVolume(v / 100);
}
function musicNext() { const m = audio.music; if (m && m.next) { initAudio(); m.next(); } }
/** "Your own music" was switched, added to or removed from (src/mymusic.js): the bus swaps between those songs and the game's own. */
function musicMine() { const m = audio.music; if (!m || !m.refreshMine) return; initAudio(); m.refreshMine(); }
let musicSeen = null, musicMood = null, musicDuck = false, musicHeld = false;
function musicSync() {
  const m = audio.music; if (!m || !m.play) return;     // audio module still loading
  if (musicSeen !== m) { musicSeen = m; musicMood = null; musicDuck = false; musicHeld = false; if (m.setOff) m.off = musicOffNow; m.setVolume(musicVol() / 100); }
  // The music plays on through a match (owner 27 Nov: "soundtrack wasn't playing... it should"), ducked under the herald and the crowd; full again in the pause menu and the menus. (It used to fade out FIFA-style; m.hold stays for the API.)
  const inMatch = S.mode !== 'menu';
  if (m.hold && musicHeld) { musicHeld = false; m.hold(false); }
  if (m.pauseMusic) m.pauseMusic(inMatch && S.paused && !(S.rpl && S.rplFrom === 'card') && !S.muted && !musicOffNow);      // the pause menu plays the game's own music, fading in; resuming fades it out
  const mood = 'menu', duck = inMatch && !S.paused;
  if (m.place) m.place(S.mode === 'menu' ? 'menu' : 'match');
  if (duck !== musicDuck) { musicDuck = duck; m.duck(duck); }
  if (mood && mood !== musicMood) { musicMood = mood; m.play(mood); }
}
let audio = noop, HERALD = null, ttsVoice = null;
const clips = createClips(() => audio);      // recorded voice clips (src/voice_clips.js): Pell, the squire, the stands' shouts; the browser's speech stays the fallback
let audioStarted = false;
/** The sound code and its samples are fetched once the menu is up (and, below the high tier, once the trees and props are in), so they never compete with what the menu needs. */
function startAudio() {
  if (audioStarted) return; audioStarted = true;
  import('./audio.js').then(m => { audio = new m.GameAudio(); G.audio = audio; { const oc = audio.crowd.bind(audio); audio.crowd = (...a) => (CROWD.sound && crowdOn() ? oc(...a) : undefined); }      // Settings > Sound > Crowd also mutes the crowd's reactions if (venueIdx >= 0) audio.setVenue(VENUES[venueIdx].id); if (!S.muted) audio.init();
    const c = audio.ctx;      // loaded after the player's first tap? the browser may have left the new audio context asleep: wake it on the next one
    if (c && c.state === 'suspended' && !S.muted) { const wake = () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); try { c.resume(); if (audio.music && audio.music.want) audio.music.play(audio.music.want); } catch (e) { /* ignore */ } }; window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake); }
  }).catch(e => console.warn('audio unavailable', e));
  setTimeout(() => clips.start(), 1500);      // the recorded voices are fetched in the background once the menu is up (Pell's first)
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
// "Commentary" and "Crowd chatter" (Settings > Sound): the booth (src/booth.js, Master Pell and Sir Walter as small subtitles, spoken when the herald is quiet)
// and the stands' voices (src/crowd_voices.js: shouts, chants, the sellers, the judges' calls, his men's jeers). localStorage 'tilt.commentary' / 'tilt.chatter'; 'off' silences; default on.
const commentaryOn = () => { try { return localStorage.getItem('tilt.commentary') !== 'off'; } catch (e) { return true; } };
function setCommentary(on) { try { localStorage.setItem('tilt.commentary', on ? 'on' : 'off'); } catch (e) { /* ignore */ } if (!on) booth.reset(); }
/** Settings > Play > Replays: 'short' (one angle for an ordinary course), 'standard' (two angles, the default), 'full' (four passes), 'off'. Key tilt.replays. */
const replaysMode = () => { try { const v = localStorage.getItem('tilt.replays'); return v === 'short' || v === 'full' || v === 'off' ? v : 'standard'; } catch (e) { return 'standard'; } };
function setReplays(v) { try { localStorage.setItem('tilt.replays', v); } catch (e) { /* ignore */ } }
const crowdOn = () => { try { return localStorage.getItem('tilt.chatter') !== 'off'; } catch (e) { return true; } }, chatterOn = crowdOn;      // Settings > Sound > Crowd (kept under the old key 'tilt.chatter')
function setChatter(on) { try { localStorage.setItem('tilt.chatter', on ? 'on' : 'off'); } catch (e) { /* ignore */ } if (!on) crowdVoices.hideAll(); }
// robot voice per character: [pitch, rate]. Hugh deep and measured, the king slow, the squire young and quick, the vendors brisk. (Some browser voices ignore pitch.)
const VOICES = { hugh: [0.6, 0.9], king: [0.45, 0.78], squire: [1.3, 1.22], master: [0.72, 0.94], groom: [1.05, 1.08], armourer: [0.65, 0.95], farrier: [0.85, 1.0], pursuivant: [1.12, 1.08], herald: [0.98, 1.06],
  pie: [1.15, 1.25], meat: [0.75, 1.2], wine: [1.4, 1.3], marshal: [0.82, 1.04], pell: [0.88, 1.08], drewe: [0.5, 0.9], lady: [1.45, 1.02], rival: [1.0, 1.15] };
const SPEAKER_CH = { hugh: 'herald', herald: 'herald', king: 'host', squire: 'squire', groom: 'retinue', armourer: 'retinue', farrier: 'retinue', pursuivant: 'retinue', lady: 'retinue', master: 'master', rival: 'rival', pie: 'vendors', meat: 'vendors', wine: 'vendors', marshal: 'marshal', pell: 'booth', drewe: 'booth' };
/** A character speaks aloud: only with sound on and Voices on. Called by the voice director for lines that were really shown (one at a time). key: a VOICES entry. */
function speak(text, tier = 2, key = 'marshal', at = null) {
  if (!SPEECH[SPEAKER_CH[key] || 'marshal']) return;      // only the booth speaks (src/channels.js)
  if (S.muted || G.manual || !window.speechSynthesis || !voicesOn()) return;
  try {
    const ss = window.speechSynthesis; if (ss.speaking && (tier === 1 || ss.pending)) ss.cancel();      // a result never waits behind older speech
    const vp = VOICES[key] || VOICES.marshal;
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, '')); if (ttsVoice) u.voice = ttsVoice; u.rate = vp[1]; u.pitch = vp[0]; u.volume = speechVolume(at); ss.speak(u);
  } catch (e) { /* speech is optional */ }
}

/** The booth speaks only into silence: never over the herald, never queued behind him (subtitle only then). onEnd: when the robot voice has finished. */
let boothUtt = null;
let boothClipH = null;
const PELL_DB = 0;      // the recorded commentator, dB on the voice stem (it sits above the crowd bed; the crowd and air are ducked a little under it)
/** Pell's recorded clip for a booth turn (src/voice_clips.js), played through the game's audio bus; the crowd and the air sit 4 dB under it. 'clip' when it plays, else false (the browser's speech takes over). */
function boothClip(clipId, onEnd) {
  if (!clipId || !SPEECH.booth || !commentaryOn() || S.muted || G.manual || !clips.get('pell', clipId)) return false;
  const done = () => { if (boothClipH === h) { boothClipH = null; try { audio.duckUnderVoice(0); } catch (e) { /* ignore */ } } if (onEnd) onEnd(); };
  const h = clips.play('pell', clipId, { db: PELL_DB, onend: done }); if (!h) return false;
  boothClipH = h; try { audio.duckUnderVoice(-4); } catch (e) { /* ignore */ }
  return 'clip';
}
function boothSpeak(text, key, onEnd, clipId = null) {
  const c = boothClip(clipId, onEnd); if (c) return c;
  if (!SPEECH.booth || !commentaryOn() || S.muted || G.manual || !window.speechSynthesis) return false;
  try {
    const ss = window.speechSynthesis; if (ss.speaking || ss.pending) return false;
    const vp = VOICES[key] || VOICES.marshal, u = new SpeechSynthesisUtterance(text); if (ttsVoice) u.voice = ttsVoice; u.rate = vp[1]; u.pitch = vp[0]; u.volume = 0.8;
    u.onend = u.onerror = () => { if (boothUtt === u) boothUtt = null; if (onEnd) onEnd(); };
    boothUtt = u; ss.speak(u); return true;
  } catch (e) { return false; }
}
function boothHush() { if (boothClipH) { const h = boothClipH; boothClipH = null; h.stop(); try { audio.duckUnderVoice(0); } catch (e) { /* ignore */ } } try { if (boothUtt && window.speechSynthesis) { boothUtt = null; window.speechSynthesis.cancel(); } } catch (e) { /* ignore */ } }
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
renderer.localClippingEnabled = true;      // (a broken rigged lance is cut off at the break by a clip plane)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 4000);
const fx = new FX(scene);
const afterM = createAftermath({ scene, fx, emit: (name, d) => aftermathEvent(name, d) });      // the get-up, the squires and the loose horse after an unhorsing (src/aftermath.js)
let clackT = 0; fx.onClack = (p, v) => { if (S.time - clackT < 0.05) return; clackT = S.time; const [d, pan] = hear(p); audio.splinterTick(d, v, pan); };
let post = createPost(renderer, scene, camera, { lite: GFX.post !== 'full', plain: GFX.post === 'plain', dof: GFX.dof });      // (let: Settings > Graphics can rebuild it)
let postCfg = { level: GFX.post, dof: !!GFX.dof };
// ------------------------------------------------------------------ a black screen must never stay black
// Three things can leave the 3D view black while the HUD (plain DOM) goes on: the GPU drops the WebGL context, the frame throws before it draws, or a pass of the
// pipeline draws nothing on this GPU. Each is caught here: context loss is recovered (and the graphics lowered a step), a throwing frame is logged and drawn anyway,
// and a watchdog reads a few pixels once in a while and steps the graphics down (plain pipeline, then a lower tier, then an offer to reload on Low).
const glFix = { lost: false, black: 0, stage: 0, next: 0, errs: 0, note: null };
function glNote(text, click) {
  if (!glFix.note) {
    const d = document.createElement('div'); d.id = 'glNote';
    d.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:99999;padding:18px 30px;background:#f0e4c4;color:#3a1a10;border:2px solid #7a1f14;font:600 22px/1.3 serif;text-align:center;box-shadow:0 6px 30px #000a;cursor:pointer;max-width:80vw';
    document.body.appendChild(d); glFix.note = d;
  }
  glFix.note.textContent = text; glFix.note.style.display = text ? '' : 'none'; glFix.note.onclick = click || null;
}
const glReload = () => { try { const u = new URL(location.href); u.searchParams.set('gfx', 'low'); location.href = u.toString(); } catch (e) { location.reload(); } };
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); glFix.lost = true; console.warn('[gfx] WebGL context lost');
  glNote('Graphics reset — recovering…');
  setTimeout(() => { if (glFix.lost) glNote('Graphics reset — tap to continue', glReload); }, 4000);
});
canvas.addEventListener('webglcontextrestored', () => {      // (three.js has already set its state up again; the render targets and textures follow on the next draw)
  glFix.lost = false; glFix.black = 0; glFix.next = performance.now() + 3000; glNote('');
  try { const t = dropTier('the graphics were reset'); console.warn('[gfx] WebGL context restored' + (t ? ', now on ' + t : '')); } catch (e) { console.warn(e); }
  try { setOverride('post', 'plain'); } catch (e) { /* ignore */ }
  try { resize(); } catch (e) { /* ignore */ }
});
const _px = new Uint8Array(4);
/** True when five spread-out pixels of the frame just drawn are all pure black (the scene always has a sky, grass or a wall somewhere there). */
function frameIsBlack() {
  const gl = renderer.getContext(); if (!gl || (gl.isContextLost && gl.isContextLost())) return false;
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  for (const [fx, fy] of [[0.5, 0.9], [0.2, 0.85], [0.8, 0.85], [0.5, 0.6], [0.1, 0.5]]) {
    gl.readPixels(Math.floor(W * fx), Math.floor(H * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
    if (_px[0] + _px[1] + _px[2] > 0) return false;
  }
  return true;
}
function cameraOk() { const m = camera.matrixWorld.elements, q = camera.projectionMatrix.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i]) || !Number.isFinite(q[i])) return false; return true; }
/** Draw the frame through the post pipeline; never throws; checks for black now and then. */
function drawFrame(dt) {
  if (glFix.lost) return;
  try { post.render(dt); } catch (e) {
    if (glFix.errs++ < 5) console.error('[render] frame failed:', e);
    try { renderer.render(scene, camera); } catch (e2) { /* the next frame tries again */ }
  }
  const now = performance.now(); if (now < glFix.next) return; glFix.next = now + 1500;
  let black = false; try { black = frameIsBlack(); } catch (e) { return; }
  if (glFix.force) black = true;      // (test hook)
  if (!black) { glFix.black = 0; return; }
  if (!cameraOk()) { resetCamera(); console.error('[render] the camera was not a number: reset'); glFix.black = 0; return; }
  if (++glFix.black < 2) return;
  glFix.black = 0; glFix.stage++;
  console.warn('[gfx] black frames, step ' + glFix.stage);
  if (glFix.stage === 1) { try { setOverride('post', 'plain'); } catch (e) { /* ignore */ } }
  else if (glFix.stage === 2) { const t = dropTier('black frames'); try { setOverride('post', 'plain'); } catch (e) { /* ignore */ } toast('Graphics', 'The picture went dark, so the graphics were lowered' + (t ? ' to ' + t : ''), 8); }
  else { glFix.force = false; glNote('Graphics problem — tap to continue on Low', glReload); }
}
window.__glFix = glFix;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
  fx.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ state
const S = { mode: 'menu', time: 0, timeScale: 1, excite: 0.12, slowT: 0, shake: 0, stopT: 0, hold: false, kx: 0, ky: 0, kvx: 0, kvy: 0, fp: false, muted: (() => { try { return localStorage.getItem('tilt.sound') === 'off'; } catch (e) { return false; } })(), introT: 0, skipHold: 0, skipWanted: { me: false, them: false }, online: false, menuAng: 0.6, paused: false, menuView: 'main' };
let profile = loadProfile();
ranks.setNameSource(() => profile.name);
ranks.setAuthSource(() => account.token());
/** Joust a friend (see src/net.js, src/online.js and the 'online' block below): the link, who is host, the friend's interpolated rider. */
const NET = { mid: '', oppPlay: null, net: null, host: false, token: 0, od: null, remote: new Remote(), rem: null, rLb: 0, rGuardAge: 9, sendT: 0, lastRx: 0, kaT: 0, rdyOut: -1, rdyIn: -1, ka: 0, pz: null };
let world = null, worldKey = -1, venueIdx = -1, player = null, opp = null, M = null, C = null, R = null, attract = null;      // (attract: the menu joust, built at boot)
/** The current difficulty level's numbers (data.js DIFFICULTY): Squire is the default for a new knight. */
const DF = () => DIFFICULTY[M && M.spec ? 1 : (profile.difficulty ?? 0)] || DIFFICULTY[0];      // (a watched bout: Knight level for both riders)
const couchLead = () => (DF().couchT ?? PHYS.lift.couchT) + 0.5;      // seconds before the shock to start lowering: the couch itself, and a beat for the lance to settle
const couchStrides = () => Math.round(couchLead() * 1.95);      // the same in strides (about 1.95 a second at the gallop): 3 on Squire and Knight, 4 on Champion
const STRIDE_WORD = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
const G = window.G = { S, auto: false, get M() { return M; }, get C() { return C; }, get R() { return R; }, get player() { return player; }, get judges() { return judges; }, get opp() { return opp; }, get world() { return world; }, get field() { return field; }, camera, scene, renderer };
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
  show(text, who, speaker) { if (/^RIDE/i.test(text.replace(/<[^>]+>/g, ''))) booth.yield(); const el = $('ticker'); el.innerHTML = `<b>${who}</b>${text}`; el.classList.toggle('scrollcall', /^THE (JUDGES|SCORER)/.test(who)); el.classList.add('on'); if (TEXT.speechLabels3d) speech.show(text, who, speaker); },      // the ticker stays; the label goes over the speaker's head
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
field.onThud = (pos) => { const [d, pan] = hear(pos); audio.lanceThud(d, pan); };      // the stump hits the turf: the shipped wood sample, distance-mixed
field.onHand = (pos) => { const [d, pan] = hear(pos); audio.lanceHand(d, pan); };      // the squire's hands reach the rider with the fresh lance
const flagmen = createFlagmen(scene);      // the marshal's men: flags up, sweep down at the signal (src/flagmen.js)
const judges = createJudges(scene);        // the judges' table: three judges and a scorer, hand flags after each course (src/judges.js); none on the training ground
const ceremony = createCeremony(scene);
/** A seller cries his wares (called by src/stands_life.js): a tier-4 ambient line with a label over his head and his own robot voice. Only when the voice is idle: true when taken. */
function vendorCall(text, who, head, type) {
  if (!TEXT.vendors && !SPEECH.vendors) return false;      // the sellers are silent (src/channels.js)
  if (!M || M.practice || !crowdOn()) return false;
  const p = new THREE.Vector3(); head.getWorldPosition(p); p.y += 0.45;
  crowdVoices.say(text, who, p, 'vendor', 0.6);
  if (!voice.cur && !voice.wait && !booth.busy() && !(window.speechSynthesis && window.speechSynthesis.speaking)) speak(text, 4, type, head);      // his robot voice only into silence
  return true;
}
const life = createLife(scene, { call: vendorCall });      // the band by the royal box and the sellers along the stands (src/stands_life.js)
// ---- the commentary booth (src/booth.js) and the stands' voices (src/crowd_voices.js): two more channels beside the herald's, each yielding to him
const boothSub = boothUI();
/** One text line of this kind at a time (owner: "why is there 3 subtitles"): a UI prompt, the ticker (judges' band, course number) or the judges' caption has priority over the booth strip, which waits and shows once they are gone (a line older than 2.5 s is dropped). */
let squireUntil = 0;      // while the squire's cheer is up (performance.now() ms) the booth keeps quiet
const subGate = { last: null, shown: false };
const textBandUp = () => !!($('prompt').textContent.trim() && !$('hud').classList.contains('hidden')) || $('ticker').classList.contains('on') || !$('royalCap').classList.contains('hidden');
function boothSubTick() {
  if (performance.now() < squireUntil) return;
  const up = textBandUp(), g = subGate;
  if (up && g.shown) { if (booth.speaking()) return; boothSub.hide(); g.shown = false; }      // (a line he is saying keeps its subtitle up until he finishes)
  else if (!up && !g.shown && g.last) { if (performance.now() - g.last.at < 2500) { boothSub.show(g.last.l, g.last.t, g.last.s); g.shown = true; } else g.last = null; }
}
const booth = createBooth({
  phase: voicePhase,
  mainBusy: () => mainTalking() > 0,      // the herald is still saying his line (his text may linger after; a waiting line may never come, and when it does the booth yields to it)
  mainQuiet: () => Math.min(voice.quietFor(['intro', 'end'].includes(voicePhase())), C && C.resultArgs && judges.has() ? (C.judged ? judges.hold : 2.9 - C.afterT) : Infinity), mainIdle:      // (Hugh's call comes when the judges lower their flags: about 1.25 s to raise them, then held)
    () => (voice.cur ? Math.max(0, -mainTalking()) : voice.idleFor()),
  enabled: () => commentaryOn() && !!M && !M.practice && performance.now() > squireUntil,
  vars: () => boothVars(),
  soon: () => !!(M && C && S.mode === 'ready' && C.rd.p && C.rd.o),
  clip: (id, spk) => (spk === 'P' && SPEECH.booth && commentaryOn() && !S.muted && !G.manual ? clips.get('pell', id) : null),
  speak: (text, key, onEnd, clipId) => boothSpeak(text, key, onEnd, clipId), stopSpeak: boothHush, speaking: () => !!boothClipH || !!boothUtt,
  abort: () => !M || S.mode === 'menu' || !commentaryOn(),      // the player left the match / paused to the menu / switched commentary off: the only times his line is cut
  hasClip: (id) => !!clips.get('pell', id),
  show: (label, text, spk) => { subGate.last = { l: label, t: text, s: spk, at: performance.now() }; boothSub.show(label, text, spk); subGate.shown = true; }, hide: () => { subGate.last = null; subGate.shown = false; boothSub.hide(); },      // show: the strip goes up at once; boothSubTick takes it down if a UI band is up and he is not speaking
  dev: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname),
});
const crowdVoices = createCrowdVoices(camera, {
  spot: (cls, kd, sd, nz) => (world && world.crowd && world.crowd.voiceSpot ? world.crowd.voiceSpot(cls, kd, sd, nz) : null),
  excite: () => S.excite, enabled: () => chatterOn() && !!M && !M.practice, phase: voicePhase,
  vars: () => (M ? { you: profile.name, youKnown: true, him: M.od.short, colours: colourWords(profile.arms, TINCTURES), hisColours: colourWords(M.od.arms, TINCTURES), land: 'any', hisLand: M.od.land, favour: M.favour } : {}),
  focusZ: () => (player && opp ? (player.z + opp.z) / 2 : 0),
  play: (text, alt, pos, gain) => crowdClip(text, alt, pos, gain),      // recorded shouts (src/voice_clips.js): the clip whose words are `text` (or the name-free `alt`), from pos; gain rises with S.excite
});
/** A recorded crowd shout from a place in the stands (the Crowd setting switches it off with the rest of the stands' voices). */
function crowdClip(text, alt, pos, gain = 0.6) {
  if (S.muted || !crowdOn() || !audio.ctx || S.mode === 'menu') return false;
  const id = clips.pick('crowd', text, alt); if (!id) return false;
  const [d, pan] = hear(pos);
  return !!clips.play('crowd', id, { db: -15 + 11 * gain, pan, dist: d });
}
G.booth = booth; G.crowdVoices = crowdVoices; G.clips = clips;
G.boothCelebrate = (id) => booth.say('celebrate.' + id, { prio: 4, ttl: 6 });      // for src/celebrate.js (feat/celebrate): call when a celebration starts
/** Seconds the main channel's current line still needs to be said (negative: said, its text lingering). A spoken line ~0.4 s a word; a ticker-only line 1.5 s to be read. */
function mainTalking() {
  const c = voice.cur; if (!c) return -voice.idleFor();
  const need = c.key === 'signal' ? 0.9 : c.speak ? 0.4 * c.words + 0.8 : 1.5;
  return need - (voice.t - c.shownAt);
}
/** The booth's placeholders. {score} is the cheque in words, the leader's number first ("three to one", "two all"). */
function boothVars() {
  if (!M) return {};
  if (M.spec) { const a = M.score[0], b = M.score[1]; return { venue: M.V.name, city: M.V.city, score: a === b ? `${numW(a)} all` : `${numW(Math.max(a, b))} to ${numW(Math.min(a, b))}` }; }      // a watched bout: nothing that names you
  const a = M.score[0], b = M.score[1], sc = a === b ? `${numW(a)} all` : `${numW(Math.max(a, b))} to ${numW(Math.min(a, b))}`;
  return { you: profile.name, him: M.od.short, himFull: hailName(M.od), land: M.od.land, venue: M.V.name, city: M.V.city, score: sc,
    horse: HORSES[profile.horse].name.toLowerCase(), hisHorse: (HORSES[M.od.horse] || { name: 'horse' }).name.toLowerCase(),
    arms: `${tinct(profile.arms.c1)} and ${tinct(profile.arms.c2)}`, hisArms: `${tinct(M.od.arms.c1)} and ${tinct(M.od.arms.c2)}` };
}
/** The talking points of a match, for the booth's quiet moments, and its welcome. */
function boothOpen() {
  const od = M.od, beaten = (profile.stats && profile.stats.beaten) || [], r = rankOf(profile.renown);
  const ag = [`venue.${M.V.id}`, `mode.${M.mode.id}`, poolAt(`knight.${od.id}`) ? `knight.${od.id}` : 'knight.field'];
  if (M.tourn) ag.splice(1, 0, M.tourn.kind === 'final' ? 'stakes.final' : M.tourn.first ? 'stakes.first' : 'stakes.early');
  if (profile.lostTo && profile.lostTo[od.id]) ag.push('grudge'); else if (beaten.includes(od.id)) ag.push('revenge');
  ag.push((profile.honours || []).length ? 'you.champion' : r >= 3 ? 'you.known' : r >= 1 || beaten.length ? 'you.rising' : 'you.new');
  ag.push(`horse.${od.horse}`, 'arms', `horse.${profile.horse}`, 'history');
  booth.setAgenda(ag);
  booth.say('welcome', { delay: 0.2, ttl: 9, prio: 2.5 });
}
/** The booth and the stands answer a crowd reaction (react): the exclamation at the strike, the shouts, the marshal's "Ho!", his squire's jeer. */
const EXK = { break: 'big', bothbreak: 'big', helm: 'helm', attaint: 'small', glance: 'small', near: 'small', miss: 'miss', bothmiss: 'miss', unhorse: 'fall', foul: 'foul', tilt: 'tilt' };
function boothReact(kind, by) {
  crowdVoices.react(kind, by);
  const P = voicePhase();
  if (EXK[kind] && (P === 'strike' || P === 'charge' || P === 'after')) booth.say('exclaim.' + EXK[kind], { prio: 6 });
  if ((kind === 'unhorse' || kind === 'foul') && player && opp) { const who = by > 0 ? opp : player; crowdVoices.official(pick(kind === 'foul' ? OFFICIALS.foul : OFFICIALS.ho), who.root.position.clone().setY(2.6), 'THE MARSHAL', 0.5); }
  rivalJeer(kind, by);
}
/** His squire, at his end of the lists, jeers at your misses and falls (and grumbles at your breaks). */
function rivalJeer(kind, by) {
  if (!M || M.practice || Math.random() > 0.45) return;
  const sit = kind === 'miss' && by > 0 ? 'miss' : kind === 'bothmiss' ? 'bothMiss' : kind === 'unhorse' && by < 0 ? 'fall' : (kind === 'break' || kind === 'helm') && by < 0 ? 'struck'
    : kind === 'break' && by > 0 ? 'broke' : kind === 'helm' && by > 0 ? 'helm' : kind === 'foul' && by > 0 ? 'foul' : null;
  if (!sit) return;
  const used = M.sideUsed || (M.sideUsed = new Set()), text = sideLine(RIVAL, sit, used); if (!text) return;
  const h = field.hisHead && field.hisHead('squire'); if (!h) return; const p = new THREE.Vector3(); h.getWorldPosition(p); p.y += 0.45;
  if (crowdVoices.say(text, `${M.od.short.toUpperCase()}'S SQUIRE`, p, 'rival', 0.8, 1.8)) used.add(text);
}
/** A new knight (fewer than NEWBIE_MATCHES matches finished): now and then, after his own poor course, Pell tells him it gets easier; his first lance broken gets a cheer.
 *  Never online. At most NEWBIE_MAX per match. Returns true when a line was queued. */
const NEWBIE_MATCHES = 5, NEWBIE_MAX = 3;
const isNewbie = () => !S.online && !M.practice && !M.spec && ((profile.stats && profile.stats.played) || 0) < NEWBIE_MATCHES;
function newbieSay(cy, heard) {
  if (!isNewbie()) return false;
  const st = profile.stats || (profile.stats = {}), n = M.nbSaid || 0, poor = cy === 'miss' || cy === 'glance', last = M.nbLast;
  M.nbLast = cy;
  if (brkCat(cy) && !st.nbHit) { st.nbHit = 1; saveProfile(); booth.say('newbie.firstHit', { delay: 2.0, ttl: 26, prio: 4.6 }); M.nbSaid = n + 1; return true; }
  if (n >= NEWBIE_MAX) return false;
  if (cy === 'attaint' && last === 'miss') { booth.say('newbie.better', { delay: 3.5, ttl: 22, prio: 3.7, when: heard }); M.nbSaid = n + 1; return true; }
  if (poor && Math.random() < 0.6) { booth.say('newbie.encourage', { delay: 3.5, ttl: 22, prio: 3.7, when: heard }); M.nbSaid = n + 1; return true; }
  return false;
}
/** Soundly beaten (lost by 3 or more, or unhorsed) and never been to the training ground: the herald takes the piss. */
const roastDue = (won) => !won && !S.online && !M.practice && (profile.lesson || 0) < 2 && (/unhorse|yield/.test(M.result || '') || M.score[1] - M.score[0] >= 3);
/** After the stroke has been seen: the booth's line on what happened, then (later, once Hugh has given the call) the momentum or the cheque. */
const brkCat = (c) => c === 'breakShield' || c === 'breakBody' || c === 'helm';
function boothAfter(p, o) {
  const cy = strokeCat(p), ch = strokeCat(o);
  if (M.spec) return boothAfterSpec(cy, ch);
  const k = cy === 'unhorse' ? 'unhorseYou' : ch === 'unhorse' ? 'unhorseHim' : cy === 'foul' || ch === 'foul' ? 'foul' : C.tiltStruck ? 'tilt'
    : brkCat(cy) && brkCat(ch) ? 'bothBreak' : cy === 'helm' ? 'helmYou' : ch === 'helm' ? 'helmHim' : brkCat(cy) ? 'breakYou' : brkCat(ch) ? 'breakHim'
    : cy === 'miss' && ch === 'miss' ? 'bothMiss' : cy === 'glance' ? 'glanceYou' : ch === 'glance' ? 'glanceHim' : cy === 'attaint' || ch === 'attaint' ? 'attaint' : cy === 'miss' ? 'missYou' : 'missHim';
  const Cc = C, t0 = voice.t, heard = () => C !== Cc || Cc.resultSaid || Cc.carded || voice.t - t0 > 9;      // the injury, the momentum and the cheque come after Hugh's call (or if he is silent)
  booth.say('after.' + k, { delay: 0.5, ttl: 22, prio: 4 });      // the booth's word on the stroke: while the judges confer if it fits before Hugh's call, else after it
  const nb = newbieSay(cy, heard);      // a new knight: the herald's word to him takes the place of the injury and momentum lines this gap
  if (nb) return;
  if (heavyBlow(C) && Math.random() < 0.5) booth.say('after.injuryYou', { delay: 2, ttl: 22, prio: 3.5, when: heard });
  else if (M.hpO.body < (C.hpO0 ?? 1) - 0.12 && Math.random() < 0.5) booth.say('after.injuryHim', { delay: 2, ttl: 22, prio: 3.5, when: heard });
  if (M.result || M.mode.firstBreak) return;
  M.sY = brkCat(cy) ? (M.sY || 0) + 1 : 0; M.sH = brkCat(ch) ? (M.sH || 0) + 1 : 0;
  const d = M.score[0] - M.score[1], now = Math.sign(d), was = C.prevLead ?? 0;
  const mk = now > 0 && was < 0 && M.maxDef >= 2 ? 'comeback' : now < 0 && was > 0 ? 'collapse' : M.sY === 3 ? 'streakYou' : M.sH === 3 ? 'streakHim'
    : d >= 5 && Math.random() < 0.5 ? 'runawayYou' : d <= -5 && Math.random() < 0.5 ? 'runawayHim' : now !== was ? (now > 0 ? 'leadYou' : now < 0 ? 'leadHim' : 'level') : null;
  if (mk) booth.say('momentum.' + mk, { delay: 3.5, ttl: 22, prio: 3, when: heard });
  else if (Math.random() < 0.45) booth.say('score.' + (poolAt('score.' + M.mode.id) ? M.mode.id : 'planken'), { delay: 3.5, ttl: 22, prio: 2.8, when: heard });
}
/** The judges' table says what its flags say, and the scorer reads it back (labels at their heads). */
function judgeCall(cy, ch, lead) {
  const hs = judges.heads(); if (hs.length < 3) return;
  const J = OFFICIALS.judge, tch = (c) => c === 'attaint' || c === 'glance';
  const k = cy === 'unhorse' || ch === 'unhorse' ? 'unhorse' : cy === 'foul' || ch === 'foul' ? 'foul' : C.tiltStruck ? 'tilt' : C.coronel && M.PT.coronel ? 'coronel' : brkCat(cy) && brkCat(ch) ? 'bothBreak'
    : cy === 'helm' || ch === 'helm' ? 'helm' : brkCat(cy) ? 'breakYou' : brkCat(ch) ? 'breakHim' : tch(cy) || tch(ch) ? 'touch' : cy === 'miss' && ch === 'miss' ? 'bothMiss' : 'miss';
  crowdVoices.official(pick(J[k] || J.miss), hs[1].clone().setY(hs[1].y + 0.4), 'THE JUDGES', lead + 0.35);
  crowdVoices.official(pick(OFFICIALS.scorer), hs[2].clone().setY(hs[2].y + 0.4), 'THE SCORER', lead + 1.7);
}
let skipKey = false;                          // Space / Enter held (the intro is skipped by HOLDING it, not by a tap)
/** The autopilot rides the player's side: the test harness (G.auto) or a spectated bout (M.spec: two knights of the roll, nobody of yours). */
function isAuto() { return !!(G.auto || (M && M.spec)); }
const dirP = () => (player ? player.dir : 1);          // which way you are riding this course
const gapNow = () => (opp.z - player.z) * dirP();        // metres still between you (negative once passed)

function loadProfile(from = null) {      // from: a profile built from the server's account (src/account.js), else the guest's local save
  const d = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  try {
    const p = from || JSON.parse(localStorage.getItem('tilt.profile'));
    if (p && p.arms) {
      const m = Object.assign(d, p);
      if (!m.owned.horses.includes(m.horse)) m.owned.horses.push(m.horse);
      if (!m.owned.armours.includes(m.armour)) m.owned.armours.push(m.armour);
      if (!(m.courses >= 3)) m.courses = 5;
      if (!m.diffV2) { if (m.difficulty === 1) m.difficulty = 0; m.diffV2 = 1; }      // once (27 Nov): the old default Knight becomes the new, gentler default Squire
      if (!m.arts) m.arts = {};
      if (!m.skills) m.skills = {};
      fixRetinue(m); ensureFeats(m); career.ensureCareer(m);
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
      if (!from || !from.body) { try { const b = JSON.parse(localStorage.getItem('tilt.body')); if (b) m.body = b; } catch (e) { /* none */ } }      // (the body is also kept in this browser: an account server that does not know the field yet drops it)
      m.body = cleanBody(m.body);
      if (m.named === undefined) m.named = true;      // a save from before the welcome screen: he has chosen his name already
      return m;
    }
  } catch (e) { /* ignore */ }
  fixRetinue(d); ensureFeats(d);
  return d;
}
/** A skill's numbers if you have learned it, else null. */
const sk = (id) => (!S.online && !(M && M.spec) && profile.skills && profile.skills[id] ? SKILLS[id] : null);      // (online: no skills, no retinue; both riders start equal)
/** One of your retinue's numbers if he is in your service, else null. */
const man = (id) => (!S.online && !(M && M.spec) && profile.retinue && profile.retinue[id] && !lateMen[id] ? menFx(id, profile.retinue[id]) : null);
/** Who is late this course (a Drinker now and then): his work, and what his temper adds, is skipped. */
let lateMen = {};
let lateRolled = false;      // a Drinker's lateness is rolled when you arrive at the end of the lists (his mates are there first), once per course
function rollLate() {
  lateMen = {}; lateRolled = true;
  if (!M || M.practice || M.online) return;
  for (const id of Object.keys(profile.retinue || {})) { const r = profile.retinue[id], t = r && TRAITS[r.trait]; if (t && t.late && Math.random() < t.late) { lateMen[id] = true; say(`Your ${(RETINUE[id] && RETINUE[id].name || id).toLowerCase()}, ${r.name}, hasn't turned up: he's been at the wine. No ${(RETINUE[id] && RETINUE[id].name || id).toLowerCase()} this course.`, r.name.toUpperCase(), 2, { ui: 'prompts' }); } }
}
/** The sum of one number from every man's temper (calm, rest, welcome) who is here this course. */
const crew = (k) => S.online || (M && M.spec) ? 0 : Object.keys(profile.retinue || {}).reduce((a, id) => { const r = profile.retinue[id]; return a + (r && !lateMen[id] && TRAITS[r.trait] ? TRAITS[r.trait][k] || 0 : 0); }, 0);
function saveProfile() {
  if (M && M.spec) return;      // a spectated bout never writes the profile
  try { localStorage.setItem('tilt.body', JSON.stringify(cleanBody(profile.body))); } catch (e) { /* ignore */ }
  if (account.signedIn()) { account.queueSave(profile); return; }      // a signed-in player's profile lives in the cloud (gold, renown and owned items only ever come from the server); the guest's local save is left alone
  try { localStorage.setItem('tilt.profile', JSON.stringify(profile)); } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------ world / riders
let worldScans = false;      // did the current world get the scanned trees and props (they may still be downloading when the menu first shows)
function setVenue(i, training = false) {      // training: the practice meadow (TRAINING_GROUND) instead of venue i
  const key = training ? -2 : i;
  if (key === worldKey && world) return;
  if (world) world.dispose();
  worldScans = SCANS.ready; worldKey = key; venueIdx = i; world = buildWorld(scene, renderer, training ? TRAINING_GROUND : VENUES[i]);
  audio.setVenue(training ? 'training' : VENUES[i].id);
  world.setLivery([profile.arms.c1, profile.arms.c2], ['#a81e1e', '#ece8dc']);
  world.captureEnv([player && player.root, opp && opp.root, ...(attract ? attract.roots() : []), fx.spl, fx.dustP.points, fx.sparkP.points].filter(Boolean));
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
    fx.hoof(hp, j.speed, j.dir, leg.hind);
    if (j.speed > 6 && leg.hind) fx.clods(hp, 3, j.dir * j.speed);
    if (S.mode === 'replay') return;
    const [d, pan] = hear(hp);
    audio.hoof(sp, pan, d);
    if (isPlayer && i === 0 && j.speed > 5) audio.armourClank(0.4 + sp * 0.5);
  };
  j.onSkid = (p, v, vel) => { _a.copy(p); _a.y = 0.05; fx.dust(_a, 2, 0.5, 0.6, 0.4, _b.copy(vel).multiplyScalar(0.25)); };
  j.onBounce = (p, v) => { fx.landBurst(p, v * 0.7); audio.bodyFall(clamp(v / 9, 0.2, 0.6), hear(p)[0]); S.shake = Math.max(S.shake, 0.12); };
  j.onLand = (p, v) => { audio.bodyFall(clamp(v / 6, 0.4, 1), hear(p)[0]); fx.landBurst(p, v); S.shake = Math.max(S.shake, 0.35); };
}
const RIDE_AS = KNIGHTS.find(k => k.id === new URLSearchParams(location.search).get('as')) || null;
function makeRider(def, dir, isPlayer) {
  const j = new Jouster(scene, Object.assign({}, def.arms, def.armourTint ? { armourTint: def.armourTint } : {}, def.lance ? { lanceScale: LANCES[def.lance].scale } : {}, def.crest || def.mantling || def.helmCross ? { crest: def.crest, mantling: def.mantling, helmCross: def.helmCross } : {}, { body: def.body ? cleanBody(def.body) : bodyFor(def.id || def.name) }), dir, LANE_X, def.horseDef || HORSES[def.horse], def.armourDef || harness(def.armour, def.helm));
  hookRider(j, isPlayer); return j;
}
/** Free what a rider holds on the GPU: each skinned mesh's bone texture and each mesh's buffers (without this every match leaked ~34 bone textures and ~30 geometries; found by docs/perf-audit.md). Shared geometry is just uploaded again if something still draws it. */
function freeGpu(o) { o.traverse((m) => { if (m.isSkinnedMesh && m.skeleton) m.skeleton.dispose(); if (m.isMesh && m.geometry) m.geometry.dispose(); }); }
function disposeRider(j) { if (!j) return; scene.remove(j.root); if (j.unhorsed) scene.remove(j.rider); freeGpu(j.root); if (j.rider && j.rider !== j.root) freeGpu(j.rider); }
function rebuildPlayer(knight = null) {
  disposeRider(player);
  if (knight) { player = makeRider(Object.assign({}, knight, { lance: knight.lance || 'standard' }), 1, true); player.setCaparison('livery'); player.setPose(-START_Z, 1); return; }      // a spectated knight (never the profile's look)
  if (!profile.bond) profile.bond = {};
  if (RIDE_AS) {      // ?as=palman: the player's rider wears a roster knight's whole look (arms, harness, helm, crest, horse) for captures; the profile is not touched
    player = makeRider(Object.assign({}, RIDE_AS, { lance: profile.lance || 'standard' }), 1, true); player.setCaparison('livery'); player.setPose(-START_Z, 1); return;
  }
  const fin = store.has('finishes') && PACKS.finishes.finishes[profile.finish];      // the Armourer's Finishes: a colour of steel, looks only
  player = makeRider({ body: profile.body, arms: profile.arms, horse: profile.horse, armour: profile.armour, armourDef: harness(profile.armour, profile.helm), lance: profile.lance || 'standard', horseDef: bondedHorse(HORSES[profile.horse], profile.bond[profile.horse]), ...(fin ? { armourTint: fin.tint } : {}) }, 1, true);
  player.setCaparison(profile.caparison || 'livery');
  player.setPose(-START_Z, 1);
}

// ------------------------------------------------------------------ words on screen: ticker, callouts, toasts
/**
 * A line on the ticker. Everything goes through the voice director, which decides if and when it is shown.
 * tier: 1 result (strike, verdict, fouls, unhorsing) · 2 course state (marshal, score) · 3 colour (facts, teaching, royals, intros) · 4 ambient (groom, crowd).
 * o: { delay (s), ttl (s), prompt (a screen prompt: not counted in the course budget), phases, free, cat, speak, after: 'strike', prio }
 */
function say(text, who = 'THE MARSHAL', tier = 2, o = {}) { return lineOut(Object.assign({ text, who, tier }, o)); }
/** Every ticker / spoken line passes here: src/channels.js decides if its channel is shown and whether it is spoken. Silent channels return false (the caller's fallback may then try something else). */
function lineOut(o) { const g = gate(o); if (!g.show) return false; if (!g.speak) o.speak = false; return voice.line(o); }

// ---- callouts: the big centre text. At most one per strike, the most important (unhorse > break/helm > foul > attaint > miss).
const CALL = { unhorse: 5, helm: 4, break: 4, turned: 3, foul: 3, across: 2, attaint: 2, miss: 1 };
let strikeCall = null;      // { t0, best: [text, cls, prio], fired }
// Combo B lettering (ui.css, 'notifications'): the first letter of each of these is a red Lombardic initial, whatever the game writes in.
/** Big titles stay on ONE line at any card width (owner: "too battered to ride" wrapped): step the font size down until the text fits. Refits when the text or the class changes and on resize. */
function fitOneLine(el) {
  if (!el) return; el.style.whiteSpace = 'nowrap'; el.style.fontSize = '';
  const box = el.id === 'flashTxt' ? window.innerWidth * 0.94 : el.clientWidth; if (!box) return;
  let fs = parseFloat(getComputedStyle(el).fontSize), n = 0;
  while (el.scrollWidth > box + 1 && fs > 16 && n++ < 60) { fs -= 2; el.style.fontSize = fs + 'px'; }
}
for (const id of ['cardTitle', 'lessonTitle', 'flashTxt']) {
  const el = $(id), refit = () => requestAnimationFrame(() => fitOneLine(el));
  new MutationObserver(refit).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (el.closest('#card')) new MutationObserver(refit).observe($('card'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', refit);
}
for (const [id, skip] of [['flashTxt'], ['cardTitle'], ['lessonTitle'], ['ticker', 'b']]) watchInitial($(id), skip); watchInitial($('toast').querySelector('b')); watchInitial($('royalCap'));
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
  toast(`Art discovered — ${ARTS[id].name}`, ARTS[id].text, DISCOVERY_SECONDS, true);
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
const tinct = (hex) => tinctureName(hex).toLowerCase();

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
  courseStart: { tier: 2, speak: true, phases: 'ready', who: 'THE MARSHAL' }, callKnights: { tier: 2, speak: true, phases: 'ready', ttl: 8 },
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
/** Per match: the indexes already spoken for each key. A line is not heard twice in a match until its pool is used up (then the pool starts over, never repeating the last one). */
const pickHist = () => (M ? (M.hUsed || (M.hUsed = {})) : {});
/** A line for this key: not one already used this match (as far as the pool allows); fact lines once per match. */
function pickLine(key, pool = HERALD[key]) {
  if (!pool || !pool.length) return null;
  const all = pickHist(), hist = all[key] || (all[key] = []);
  let cand = pool.map((_, i) => i);
  if (key === 'facts') cand = cand.filter(i => !M.usedFacts.has(i));
  let ok = cand.filter(i => !hist.includes(i));
  if (!ok.length) { const last = hist[hist.length - 1]; hist.length = 0; ok = cand.filter(i => i !== last); if (!ok.length) ok = cand; }
  if (!ok.length) return null;
  const i = pick(ok);
  return { raw: pool[i], done() { hist.push(i); if (key === 'facts') M.usedFacts.add(i); } };
}
/** The herald speaks. o: extra placeholder values in o.vars; any voice.line option (tier, free, ttl, ...) overrides HMETA. */
function herald(key, delay = 0, o = {}) {
  if (/^shout/.test(key)) return false;      // the commons' shouts at the strike come from the stands now (src/crowd_voices.js, Settings > Sound > Crowd chatter)
  if (!M || (!M.circuit && !(M.mode.own && (o.text || key === 'win' || key === 'loss' || key === 'draw'))) || profile.herald === false || !HERALD || !(HERALD[key] || o.pool || o.text)) return false;      // (the rules-only modes are exhibition: they speak their own result calls)
  const pk = o.text ? { raw: o.text, done() {} } : pickLine(key, o.pool || HERALD[key]); if (!pk) return false;      // o.text: a line already assembled (the combined result); o.pool: a pool picked by the caller (his remark)
  const vars = Object.assign({ you: profile.name, him: M.od.short, himFull: M.od.name.replace(/, ".*"/, ''), venue: M.V.name, city: M.V.city, year: M.V.year, yourScore: M.score[0], hisScore: M.score[1],
    course: ORD[Math.max(0, M.course - 1)] || 'next', land: M.od.land, horse: HORSES[profile.horse].name.toLowerCase(), hisHorse: (HORSES[M.od.horse] || { name: 'horse' }).name.toLowerCase(), hisArms: `${tinct(M.od.arms.c1)} and ${tinct(M.od.arms.c2)}`, arms: `${tinct(profile.arms.c1)} and ${tinct(profile.arms.c2)}` }, o.vars);
  const text = pk.raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const { vars: _v, onShown, pool: _pl, text: _tx, ...rest } = o;
  return lineOut(Object.assign({ who: ANNOUNCER.label, key, delay, speaker: speakerOf.hugh, voice: 'hugh' }, HMETA[key] || { tier: 3 }, rest, { text, onShown() { pk.done(); ceremony.speak(3); if (onShown) onShown(); } }));      // he steps forward on his dais while he speaks
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
  if (M.ladyPending) { M.ladyPending = false; if (!herald('ladyFavour', 0.6)) say('A lady sends down her sleeve. Your nerve returns.', 'THE GALLERY', 3, { ui: 'prompts', delay: 0.6, free: true, ttl: 6, phases: 'after' }); return; }
  if (!M.circuit || !HERALD || !voice.colourOk()) return;
  if (M.tourn && M.course >= 2 && M.score[0] !== M.score[1] && (M.stakeAt || 0) < M.course - 1 && Math.random() < 0.7) { M.stakeAt = M.course; if (herald('stakes', 1.2, { pool: M.score[0] > M.score[1] ? STAKES.lead : STAKES.trail })) return; }
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
/** Which way each horse is pointing (world x, z of its forward), for the retinue to keep clear of it. */
const _fax = new THREE.Vector3();
function horseAxes() { const r = {}; if (player) { player.root.getWorldDirection(_fax); r.hx = _fax.x; r.hz = _fax.z; } if (opp && opp.root) { opp.root.getWorldDirection(_fax); r.ohx = _fax.x; r.ohz = _fax.z; } return r; }
function fieldEnv() {
  if (!player || !M || S.mode === 'menu') return { mode: 'menu' };
  const out = S.mode === 'charge' || (S.mode === 'after' && C && C.turn.p.stage !== 'done');
  const st = C && C.rb && S.mode === 'after' ? C.turn.p.stage : '', marker = st === 'free' || st === 'settle' || st === 'hand';      // riding back by hand: your men wait at the end where the mark is
  return { marker, onMark: marker && (st !== 'free' || !!C.rb.onMark), mode: S.mode, tD: st === 'free' || st === 'settle' ? -dirP() : out && player.z * dirP() > 0 ? -dirP() : dirP(), px: player.root.position.x, pz: player.root.position.z, ox: opp ? opp.root.position.x : 0, oz: opp ? opp.root.position.z : 0, ...horseAxes(), helmOff: player.helmOff };
}
/** Did a hard blow land on you last course? */
const heavyBlow = (c) => { const o = c.oL.res; return !!(o && o.pts > 0 && (o.broke || o.unhorse)) || M.hp.body < (c.hp0 ?? 1) - 0.08; };
/** The moment between courses, in a word, from the course just ridden (c is null before the first). */
function retSituation(c) {
  if (!c) return M.practice ? 'start' : 'nerves';      // before the first course: nerves
  if (M.practice) return 'start';
  const p = c.pL.res, d = M.score[0] - M.score[1];
  if (p && p.zone === 'helm' && p.pts > 0) return 'helm';
  if (p && p.broke) return 'broke';
  if (heavyBlow(c)) return 'struck';
  if (p && p.zone === 'miss') return 'miss';
  if (M.stamina < 0.35) return 'tired';
  return d >= 2 ? 'leading' : d <= -2 ? 'behind' : 'start';
}
// The squire's encouragement (owner, 27 Nov): short, supportive lines from his own pool (src/retinue_lines.js), between courses only, about one gap in 2.5, never two gaps in a row,
// never over the booth or the judges'/royal band. Spoken with his voice and shown as the one subtitle line (the booth strip), which the booth then keeps clear of.
const CHEER = { start: ['The lance is true, my lord. Ride well.', 'Gauntlets laced, my lord. Good luck.', 'All is ready, my lord. Go and spoil his afternoon.', 'Visor down, my lord. Your face is frightening the horse.'],
  miss: ['He was quick, my lord. Next time.', 'Air, my lord. It happens to the best of men.', 'No matter, my lord. Nobody saw. Everybody saw. No matter.', 'You were looking at his helm. I saw your head go up.'],
  behind: ['We are behind, my lord, but only by a lance.', 'One good course turns it, my lord.', 'Behind, my lord. My father said behind is where the brave live. He was usually behind.'],
  leading: ['You lead, my lord! The stands are with you.', 'Ahead on points, my lord. I could shout!', "Don't smile yet, my lord. Smile at supper."] };      // the retinue_lines.js squire pools, recorded as squire.cheer.<pool>.<i> (the id is the pool and the index)
const cheerId = (sit, text) => { const k = ({ nerves: 'start', broke: 'start', helm: 'start', struck: 'start', tired: 'start', lance: 'start' })[sit] || sit; const i = (CHEER[k] || []).indexOf(text); return i < 0 ? null : `squire.cheer.${k}.${i}`; };
function squireCheer(sit, wait = 2.6) {
  if (!M || M.practice || S.online || !SQUIRE.cheer || !profile.retinue || !profile.retinue.squire || lateMen.squire || !sit) return;
  const pool = CHEER[sit === 'nerves' || sit === 'broke' || sit === 'helm' || sit === 'struck' || sit === 'tired' || sit === 'lance' ? 'start' : sit]; if (!pool) return;
  if (C.cheerRolled) return; C.cheerRolled = true;
  if (M.cheerLast !== undefined && M.course - M.cheerLast <= 1) return;      // never two gaps in a row
  if (Math.random() >= SQUIRE.chance) return;
  const used = M.cheerUsed || (M.cheerUsed = new Set()), fresh = pool.filter(t => !used.has(t)), text = (fresh.length ? fresh : pool)[(Math.random() * (fresh.length || pool.length)) | 0], Cc = C;
  const tryIt = () => {
    if (C !== Cc || !M || Cc.cheerSaid || !['ready', 'after'].includes(S.mode) || R || Cc.carded || Cc.mont || Cc.beat || (S.mode === 'after' && Cc.cut)) return;
    if (booth.busy() || voice.cur || (window.speechSynthesis && window.speechSynthesis.speaking) || $('ticker').classList.contains('on') || !$('royalCap').classList.contains('hidden')) return;
    Cc.cheerSaid = true; M.cheerLast = M.course; used.add(text);
    const cid = cheerId(sit, text), clip = cid && !S.muted && !G.manual && voicesOn() ? clips.get('squire', cid) : null;
    const g = gate({ text, who: 'YOUR SQUIRE', voice: 'squire', cheer: true, speak: true });
    boothSub.show('YOUR SQUIRE', text, 'squire'); subGate.shown = true; subGate.last = null; squireUntil = performance.now() + (clip ? clip.d * 1000 + 900 : 3600);
    if (g.speak && clip) { let pan = 0, dist = 0; try { const o = speakerOf.man('squire')(); if (o) { o.getWorldPosition(_spkPos); [dist, pan] = hear(_spkPos); } } catch (e) { /* unplaced */ } clips.play('squire', cid, { db: -4, pan, dist }); }      // his own recorded voice, from where he stands, quieter than the booth
    else if (g.speak) speak(text, 4, 'squire', speakerOf.man('squire'));
    G.cheerLog = (G.cheerLog || []).concat([{ id: cid, via: g.speak ? (clip ? 'clip' : 'tts') : 'silent', text }]);
    setTimeout(() => { if (performance.now() >= squireUntil - 50) { boothSub.hide(); subGate.shown = false; } }, (clip ? clip.d * 1000 + 950 : 3650));
  };
  for (let i = 0; i < 8; i++) voice.later(wait + i * 2, tryIt);      // tried every 2 s through the ride back / the wait at the mark, until the booth and the prompts leave a gap
}
/** One retinue line at most per course gap: about half the courses, more after a big moment, never the same line twice in a match. Between courses only, tier 4. */
function retinueSpeak(sit, chance, wait = 2.6) {
  if (!TEXT.retinue && !SPEECH.retinue) { squireCheer(sit, wait); return; }      // groom / armourer / farrier / lady are silent (src/channels.js); only the squire may cheer, rarely
  if (!sit || !M || M.practice || !profile.retinue) return;
  if (Math.random() >= (['helm', 'broke', 'struck'].includes(sit) ? 0.8 : chance)) return;
  if (M.ladyFavour && LADY_CALLS[sit] && Math.random() < 0.3) {      // the lady who gave you her sleeve calls down from the gallery instead
    const t = sideLine(LADY_CALLS, sit, M.retUsed), sp = world.crowd && world.crowd.voiceSpot ? world.crowd.voiceSpot([2], 1, 0, 0) : null;
    if (t && sp && crowdVoices.say(t, OTHER_TITLE.lady, new THREE.Vector3(sp.x, sp.y, sp.z), 'lady', 0.8, wait)) { M.retUsed.add(t); return; }
  }
  const rr = profile.retinue;
  const here = Object.keys(rr).filter(id => !lateMen[id] && ROLE_TITLE[id] && typeof rr[id] === 'object').map(id => ({ id, name: rr[id].name, trait: rr[id].trait })).concat([{ id: 'master', name: '', trait: null }]);
  if (rr.squire && typeof rr.squire !== 'object' && !lateMen.squire) here.push({ id: 'squire', name: '', trait: null });      // the squire every knight starts with (no name, no trait)
  const L = chooseLine(sit, here, M.retUsed); if (!L) return;
  let said = false;
  const tryIt = () => { if (said) return; say(L.text, L.id === 'master' || !L.name ? ROLE_TITLE[L.id] : `${L.name} · ${ROLE_TITLE[L.id]}`, 4, { free: true, phases: ['after', 'ready', 'end'], ttl: 8, speak: true, speaker: speakerOf.man(L.id), voice: L.id, onShown() { said = true; M.retUsed.add(L.text); field.talk(L.id); } }); };
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
  fallen:    { c: 0, k: 0, snd: [['groan', 0.5], ['wince', 0.5, 0.5]], ex: 0.55 },                              // the man who is down stays down: a long groan runs round the stands
  risen:     { c: 0.04, k: 0.12, snd: [['applause', 0.8], ['cheer', 0.45, 0.3]], ex: 0.7 },                     // he gets up: sporting applause
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
  S.crowdEv = { id: ++crowdEvId, kind: { rouse: 'break', sandbag: 'taunt', fallen: 'glance', risen: 'salute' }[kind] || kind, by };
  if (!M) return;
  if (!M.practice) boothReact(kind, by);
  M.fav.commons = clamp(M.fav.commons + by * Rk.c, -1, 1); M.fav.court = clamp(M.fav.court + by * Rk.k, -1, 1);
  M.favour = (M.fav.commons + M.fav.court) / 2;
  if (Rk.ex > 0.5 && player) M.agit = clamp(M.agit + (1 - player.horseDef.nerve) * 0.35 * Rk.ex * DF().nerve, 0, 1);
  if (line && !M.practice && !chatterOn()) { const l = crowdLine(kind); if (l) say(l[1], l[0], 4, { cat: 'crowd' }); }      // ambient narration: dropped during the charge and the strike; with Crowd chatter on, the stands' own shouts say it (src/crowd_voices.js)
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
const introFired = new Set(), introNew = () => !!M && !M.practice && !M.spec;
/** The spoken lines of the intro, all through the voice director (stoppage: one line at a time). Hugh Clement speaks aloud; the host and the boasters are ticker lines. */
function introLines() {
  if (profile.herald === false) return;
  const host = hostOf(M.V.id), hl = HOST_LINES[host.id] || HOST_LINES.lord, od = M.od, ret = profile.retinue || {};
  const vars = { venue: M.V.name, city: M.V.city, year: M.V.year, himFull: hailName(od), land: od.land, him: od.short, you: profile.name, arms: `${tinct(profile.arms.c1)} and ${tinct(profile.arms.c2)}` };
  const L = (at, text, who, hold, extra = {}) => !gate({ text, who, tier: 3, speak: !!extra.speak, voice: extra.voice }).show ? null : voice.later(at, () => say(fill(text, vars), who, 3, Object.assign({ phases: 'intro', ttl: 6, hold, gapAfter: 0.7 }, extra)));
  const hugh = (at, text, hold) => L(at, text, ANNOUNCER.label, hold, { speak: true, speaker: speakerOf.hugh, voice: 'hugh', onShown() { ceremony.speak(hold); } });
  const TO = M.tourn;
  if (TO) { vars.size = TO.size; vars.round = TO.name; }
  L(6.0, pick(TO && TO.kind === 'final' && HOST_FINAL[host.id] ? HOST_FINAL[host.id] : hl.open), host.label, 3.6, { speak: true, speaker: speakerOf.king, voice: 'king' });                       // the host stands at 5.4 (cue below)
  if (TO) { hugh(10.4, pick(STAKES[TO.kind]), 3.6); if (TO.rematch) hugh(14.2, pick(STAKES.rematch), 3.6); else if (TO.first && TO.round === 0) hugh(14.2, pick(STAKES.first), 3.6); }
  hugh(19.4, pick(INTRO.venue), 3.4); hugh(23.5, pick(INTRO.names), 3.3);
  const pu = ret.pursuivant && typeof ret.pursuivant === 'object' ? ret.pursuivant : null, mine = pu ? 'pursuivant' : 'squire', man = ret[mine];
  L(27.5, boastFor('him', od.id), 'HIS HERALD', 3.8, { speak: true, speaker: speakerOf.oppHerald, voice: 'herald' });
  L(32.0, boastFor('you', mine), man && man.name ? `${man.name} · ${ROLE_TITLE[mine]}` : ROLE_TITLE[mine], 3.6, { speak: true, speaker: speakerOf.man(mine), voice: mine });
  voice.later(INTRO_END + 0.5, () => {});      // (a mark only: the marshal calls the first course as the intro ends, so the booth's quietFor sees it coming)
}
/** The location card when a match opens: "Smithfield · London · 1390", and the rule set under it. */
function titleCard() { if (M && !M.practice) ceremony.titleCard(M.V.name, M.V.city + (M.V.country ? ', ' + M.V.country : ''), M.V.year, M.mode.name); }
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
function skipIntro() { if (window.speechSynthesis && !booth.speaking()) window.speechSynthesis.cancel(); voice.reset(); finishIntro(true); }      // (the commentator finishes his line)
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
/** What the rigged riders of a match need (player and opponent: harness, helm, lance ids). An online friend's come from his profile (NET.od): both screens must build the same lance for him, since its length is his reach. */
function rigWant(oppId, onl, spec) {
  const k = (onl && NET.od) || (oppId && (KNIGHTS.find(x => x.id === oppId) || FIELD.find(x => x.id === oppId))) || null;
  const a = spec ? specKnight(spec.a) : null;      // a spectated bout: both riders are knights of the roll
  if (a) return { armour: [a.armour, k && k.armour], helm: [a.helm || (ARMOURS[a.armour] || {}).helm, k && (k.helm || (ARMOURS[k.armour] || {}).helm)], lance: [a.lance || 'standard', k && k.lance] };
  return { armour: [profile.armour, k && k.armour], helm: [profile.helm, k && (k.helm || (ARMOURS[k.armour] || {}).helm)], lance: [profile.lance || 'standard', k && k.lance] };
}
/** Start a match. If the trees and props are still arriving in the background, wait for them behind "Preparing the lists…" rather than build the venue without them. */
function startMatch(...args) {
  if (touchMode) { if (!args[8]) noteMatch(); goFullscreen(); }
  const sky = args[3] ? null : (VENUES[args[0]] || {}).sky;      // (the practice meadow has no photographed sky)
  const skyIn = !sky || !SCANS.skies[sky] || (SCANS.sky.get(sky) && SCANS.sky.get(sky).tex) || SCANS.sky.get(sky) === null;      // this venue's sky is in memory (or it has none / failed to load)
  const rigIn = rigHas(rigWant(args[1], args[7], args[8]));      // the rigged rider (about 2 MB, fetched in the background after the menu) has arrived or failed
  if (SCANS.ready && skyIn && rigIn) return startMatchNow(...args);
  if (preparing) return;
  preparing = true; const el = $('preparing'), txt = $('prepTxt'); el.classList.remove('hidden');
  const paint = () => { const st = loadStats('bg'); txt.textContent = `${Math.round(st.frac * 100)}%  ·  ${mb(st.loaded)} of ${mb(st.total)} MB`; };
  paint(); const iv = setInterval(paint, 150);
  // the venue's photographed sky is waited for too: built without it the lists show a murky, dark half-lit scene until it arrives (the sky and the lighting come from it)
  const skyP = sky ? loadSky(sky, 'bg') : Promise.resolve(null);
  Promise.race([Promise.all([SCANS.pending || preloadScans(), skyP, preloadRider(rigWant(args[1], args[7], args[8]))]), new Promise(r => setTimeout(r, 45000))]).catch(() => {}).then(() => {      // (after 45 s it goes ahead without them)
    clearInterval(iv); preparing = false; el.classList.add('hidden');
    const s = sky && SCANS.sky.get(sky);
    if (s && s.tex && world && !world.photoSky && worldKey === args[0]) worldKey = -99;      // a world built earlier without this sky: build it again with it
    if (!SCANS.ready) return startMatchNow(...args);
    refreshWorldWithScans(); startMatchNow(...args);
  });
}
/** The menu's world was built before the trees and props arrived: build it again with them (never during a match). */
function refreshWorldWithScans() {
  if (M || !world || worldScans || !SCANS.ready) return;
  const training = worldKey === -2; worldKey = -99; setVenue(venueIdx, training);
}
function startMatchNow(vIdx, oppId, circuit, practice = false, modeId = null, courses = 0, bridge = null, onl = false, spec = null) {
  S.online = !!onl; document.body.classList.toggle('online', !!onl);      // onl: a joust against a friend (the opponent is NET.od, driven from his stream)
  initAudio(); G.physLog = [];
  attract.park();      // the menu joust's riders leave the scene (kept for when the menu returns)
  setVenue(vIdx, practice);
  if (!practice && MODES[modeId || VENUES[vIdx].mode || 'planken'].bridge && !bridge) { bridge = newBridge(oppId); oppId = bridge.queue[0]; }      // a fresh pas d'armes: the queue is drawn once
  const V = VENUES[vIdx], od = practice ? QUINTAIN_DEF : onl ? NET.od : KNIGHTS.find(k => k.id === oppId) || FIELD.find(k => k.id === oppId);
  const sa = spec ? specKnight(spec.a) : null;      // spec: a bout of the roll, watched (src/tourney_screen.js): knight a rides the player's side on the autopilot, nothing of the profile is used or paid
  rebuildPlayer(sa); disposeRider(opp); player.visorUp = false; player.helmOff = false;
  if (bridge && bridge.keep) bridgeRestoreHarness(bridge.keep);
  if (practice) { opp = new Quintain(scene, LANE_X, 0); opp.setSide(1); } else if (onl) { opp = makeRider(Object.assign({}, od, { horseDef: HORSES[od.horse], armourDef: harness(od.armour, od.helm), lance: od.lance }), -1, false); opp.setCaparison(od.cap || 'livery'); opp.remote = true; opp.setPose(START_Z, -1); } else { opp = makeRider(od, -1, false); opp.setPose(START_Z, -1); }
  const myArms = sa ? sa.arms : profile.arms;
  world.setLivery([myArms.c1, myArms.c2], [od.arms.c1, od.arms.c2], myArms, od.arms);
  const mode = MODES[practice ? 'planken' : modeId || V.mode || 'planken'], PT = Object.assign({}, POINTS, mode.points);
  if (world.setTilt) world.setTilt(mode.tilt);
  player.foe = practice ? null : opp; if (!practice) opp.foe = player;
  TILT_TOP = mode.tilt ? 1.3 : 0; fx.tiltTop = TILT_TOP;
  lateMen = {}; lateRolled = false; const welcome = (man('pursuivant') ? man('pursuivant').welcome : 0) + crew('welcome');
  M = { seed: (G.seed ?? (Math.random() * 4294967296)) >>> 0, V, vIdx, od, circuit, practice, mode, PT, courses: mode.fixedCourses ?? (mode.noExtra && !mode.pickCourses ? 4 : (!practice && courses) || COURSES_PER_MATCH), bridge: bridge || null, course: 0, score: [0, 0], marks: [[], []], favour: V.home * 0.8, fav: { commons: V.home + welcome, court: V.home * 0.6 + welcome }, stamina: 1,
    agit: 0.15 + (1 - player.horseDef.nerve) * 0.3, focus: 1, fouls: 0, breaks: [0, 0], result: null, online: !!onl, hpO: { horse: 1, body: 1 }, oTilts: 0, hp: { horse: 1, body: 1 }, bodyS: { p: { arm: 0, wind: 0 }, o: { arm: 0, wind: 0 } }, taught: {}, lesson: practice ? Math.min(profile.lesson || 0, LESSONS.length - 1) : -1,
    kit: modeKit(practice ? null : mode), shyN: [0, 0], shieldOff: [0, 0], sights: [0, 0], maxDef: 0, tilts: 0, usedFacts: new Set(), ladyPending: false, teachPick: null,
    dr: { heavy: [0, 0], drops: [0, 0], swapped: [false, false], batterAt: -9, dazeT: 0, dazeDur: 1, dazeK: 0, oDazeT: 0, cond: ['FIT', 'FIT'], yielded: false },      // drama (see PHYS.drama): heavy blows taken, lances dropped, spare helm used, the daze, the last condition
    stats: [0, 1].map(() => ({ broken: 0, attaint: 0, helm: 0, miss: 0, top: 0, best: 0 })), tech: { sight: 0, lance: 0, horse: 0, will: 0, n: 0 } };
  if (circuit && !onl && !practice && !bridge) { const dt = career.describe(profile); if (dt && dt.opp === od.id) M.tourn = dt; }      // a knockout tournament: the round, and what is at stake
  for (const j of [player, opp]) if (j && j.setTip) j.setTip(!!mode.sharp);      // sharp lances (Scharfrennen) wear the war tip, the rest the coronel
  if (onl) { M.mid = NET.mid; M.oppRid = LOBBY.friend ? LOBBY.friend.rid : ''; }
  if (spec) { M.spec = spec; M.specA = sa; S.spec = true; document.body.classList.add('spec'); specBegin(); }
  if (account.signedIn() && !practice && !onl && !spec) {      // a signed-in player's match is timed and paid by the server: it starts its own clock now (a bridge is one match across its bouts)
    if (M.bridge && M.bridge.spId) M.spId = M.bridge.spId;
    else { M.spId = account.spStart({ venue: vIdx, mode: mode.id, courses: M.bridge ? 20 : M.courses + 2, circuit: !!circuit }); if (M.bridge) M.bridge.spId = M.spId; }
  }
  if (bridge && bridge.keep) { const k = bridge.keep; M.stamina = k.stamina; M.hp.horse = k.horse; M.hp.body = k.body; M.agit = k.agit; M.focus = Math.min(k.focus, k.body); M.fav = Object.assign({}, k.fav); M.favour = k.favour; if (k.bodyS) Object.assign(M.bodyS.p, k.bodyS); }      // the bridge: nothing is mended between bouts
  if (M.kit.shieldTall > 1) { player.tallShield(M.kit.shieldTall); if (!practice) opp.tallShield(M.kit.shieldTall); }      // the Renntartsche: the same tall shield for both
  M.retUsed = new Set(); field.setup(spec ? {} : profile.retinue, myArms, practice, practice ? null : { name: od.short, arms: od.arms });
  $('nameP').textContent = sa ? sa.name.replace(/, ".*"/, '') : profile.name; $('nameO').textContent = od.name.replace(/, ".*"/, '');
  drawCrest($('crestP'), myArms); drawCrest($('crestO'), od.arms);
  $('venueInfo').textContent = `${V.name.toUpperCase()} · ${V.city.toUpperCase()}${V.country ? ', ' + V.country.toUpperCase() : ''} · ${V.year} · ${mode.name.toUpperCase()}${bridge ? ` · BOUT ${bridge.bout} OF ${bridge.n}` : ''}`;
  $('screen').classList.remove('on'); $('card').classList.add('hidden'); $('verdict').classList.add('hidden'); $('lesson').classList.toggle('hidden', !practice);
  S.mode = 'intro'; S.introT = 0; S.skipHold = 0; S.skipWanted = { me: false, them: false }; introFired.clear(); skipKey = false;
  if (onl) { NET.remote.reset(); NET.rem = null; NET.rLb = 0; NET.rGuardAge = 9; NET.sendT = 0; NET.lastRx = performance.now(); NET.rdyOut = NET.rdyIn = -1; pzMake(); }
  $('bannerTop').textContent = `${V.city.toUpperCase()}${V.country ? ', ' + V.country.toUpperCase() : ''} · ANNO ${V.year} · ${mode.name.toUpperCase()}, ${mode.sub.toUpperCase()}${bridge ? ` · BOUT ${bridge.bout} OF ${bridge.n}` : ''}`; $('bannerMain').textContent = V.name;
  $('bannerSub').innerHTML = `${profile.name} &nbsp;against&nbsp; ${od.name}<div id="tape"><div><b>${ovr({ skill: 0.42 + 0.07 * bondLevel(profile.bond[profile.horse]), seat: ARMOURS[profile.armour].protection * 0.85, drive: (HORSES[profile.horse].top - 7.2) / 2 })}</b>${HORSES[profile.horse].name} · bond ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}<small>${HELMS[profile.helm].name.toUpperCase()} · ${ARMOURS[profile.armour].name.toUpperCase()}</small></div><div><b>${ovr(od)}</b>${HORSES[od.horse].name} · ${od.land}<small>${ARMOURS[od.armour].name.toUpperCase()}</small></div></div>`;
  if (practice) { $('bannerTop').textContent = 'THE TILTYARD'; $('bannerMain').textContent = 'At the Quintain'; $('bannerSub').innerHTML = 'The master of horse will teach you the joust, one thing at a time.'; }
  $('banner').classList.remove('hidden'); $('hud').classList.add('hidden');
  voice.reset(); strikeCall = null; booth.reset(); crowdVoices.reset();
  if (!practice) { if (spec) boothOpenSpec(); else boothOpen(); }
  if (practice) { ceremony.clear(); life.clear(); fanfare('start'); react('start', 0, false); }      // the quintain keeps the short old intro
  else if (spec) { ceremony.setup(V); life.setup(); player.visorUp = false; fanfare('start'); react('start', 0, false); specIntroBanner(V, mode); }      // a watched bout: a short opening, no ceremony
  else { ceremony.setup(V); life.setup(); player.visorUp = false; introLines(); }
  flagmen.setup(V, practice); judges.setup(V, practice); judges.setVisible(true);      // (the judges sit in their stand through the intro too: it was hidden there, so the table read as empty whenever the intro cameras passed it)
  updateHud(true);
  if (bridge && bridge.bout > 1) {      // the next challenger: the short form of the intro (the herald names him, then straight to the marks)
    skipIntro();
    if (profile.herald !== false) voice.later(0.8, () => say(`Bout ${bridge.bout} of ${bridge.n}. The next challenger is ${hailName(od)}, of ${od.land}.`, ANNOUNCER.label, 3, { phases: 'ready', ttl: 6, speak: true, speaker: speakerOf.hugh, voice: 'hugh' }));
    updateHud(true);
  }
}

function beginCourse(first = false) {
  const gapSit = retSituation(first ? null : C), gapHeavy = !first && !!C && !M.practice && heavyBlow(C);
  celStop(); M.course++; voice.newCourse(M.course); booth.newCourse(M.course); strikeCall = null;
  const od = M.od;
  C = {
    t: 0, tier: 0, maxTier: 0, galT: -1, collected: 0, lat: LANE_X, latV: 0, couch: 0, couchHeld: false, setT: 0, fatigue: 0, braceT: 0, braceCd: 0, braceAge: 9, guardAge: 9,
    saluted: false, saluteT: 0, tiltStruck: false, reinT: 0, patCd: 0, sway: 0, minMiss: 9, act: null, cut: null, flags: {}, onMarkT: 0,
    pL: { prev: null, done: false, res: null, near: null }, oL: { prev: null, done: false, res: null, near: null }, shock: { p: null, o: null }, lead: 0,
    rd: { p: false, o: !!M.practice, oAt: 0.8 + Math.random() * 1.4, w: 0, sig: false, warned: false, plan: null },   // the raise: you, him, when he raises, wait since both are up, marshal's signal given, warned once
    beat: null, mont: null, montDone: false, judged: false, resultArgs: null, colourLater: false,
    afterT: 0, carded: false, verdict: false, verdictT: 0, replayed: false, tech: null, cine: null, ev: { couch: null, brace: null, impact: null, taps: [] },
    turn: { p: { stage: 'run', th: 0 }, o: { stage: 'run', th: 0 } }, rec: { f: [], ev: [], hits: [] }, hitT: null,
    o: { q: clamp((od.skill + DF().ai) * 0.85 + Math.random() * 0.25, 0, 1), top: lerp(GAIT_SPEED[3], HORSES[od.horse].top, clamp(od.drive + (Math.random() - 0.5) * 0.12, 0, 1)), zone: Math.random() < od.skill * 0.3 * DF().oHelm ? 'helm' : (Math.random() < 0.75 ? 'shield' : 'body'),
      bias: new THREE.Vector2((Math.random() - 0.5), (Math.random() - 0.5)), seed: Math.random() * 50, brace: Math.random() < lerp(0.25, 0.9, od.skill), go: 0.25 + Math.random() * 0.35,
      guard: Math.random() < lerp(0.08, 0.5, od.skill), rattled: 1, retarget: false, knock: new THREE.Vector2() },
  };
  if (M.spec) specCourse();
  C.rec.n = M.course; (M.recs || (M.recs = [])).push(C.rec);      // every course's recording is kept for the match (the pause menu's Replays)
  if (!M.online && !M.spec) { const b = profile.bond, id = profile.horse, before =bondLevel(b[id]); b[id] = (b[id] || 0) + 1; saveProfile(); M.bondUp = bondLevel(b[id]) > before; }
  mouse.set(0, 0); aimMouse.set(0, 0); aimRebase = true;      // every course starts with the aim centred (the next pointer move is taken as the centre; touch drags start from it too)
  dropLanceBits(false); flagmen.raise(); judges.drop();      // flags up for this course; the judges' flags are down
  if (first) { player.setPose(-START_Z, 1); if (M.practice) opp.setSide(1); else opp.setPose(START_Z, -1); }
  else { player.fresh(); opp.fresh(); if (M.practice) opp.setSide(dirP()); }
  NET.rdyOut = NET.rdyIn = -1; NET.rGuardAge = 9;
  if (M.practice) { C.oL.done = true; C.oL.res = { zone: 'none', pts: 0, code: 'm', text: 'the quintain stands ready' }; }
  player.root.position.x = -dirP() * C.lat; player.lance.visible = true;
  if (!M.practice) { opp.raiseT = 0; opp.visorUp = !!opp.visor; }      // he waits with his visor up until he raises his lance
  if (first) fx.clear();
  player.cantle = opp.cantle = M.kit.cantle; player.lock = opp.lock = M.kit.lock;      // the saddle's hold on the body-reaction (jouster.js hit())
  // a Drinker may be late this course (his work and his temper's gifts are skipped); everyone else is here
  if (first) { lateMen = {}; lateRolled = false; } else if (!lateRolled) rollLate();      // (normally rolled when you arrived at the end, see rideOut)
  lateRolled = false;
  const rs = restShare(M.courses);       // a long match gives a little more rest between courses (see REST in data.js)
  M.stamina = clamp(M.stamina + REST.stamina + REST.longStamina * rs + crew('rest') + (man('groom') ? man('groom').stamina : 0), 0, 1);
  if (!first) for (const b of [M.bodyS.p, M.bodyS.o]) { b.wind *= PHYS.body.windRest; b.arm *= PHYS.body.armRest; }      // the breath comes back between courses; a jarred arm hardly
  if (!first) M.hpO.body = clamp(M.hpO.body + REST.body * rs, 0, 1);      // (his body, kept here offline and by the host online: see strike)
  if (!first) { M.hp.body = clamp(M.hp.body + REST.body * rs, 0, 1); M.agit = clamp(M.agit - crew('calm'), 0, 1); if (man('groom')) M.agit = clamp(M.agit - man('groom').calm, 0, 1); if (man('armourer')) M.hp.body = clamp(M.hp.body + man('armourer').mend, 0, 1); if (man('farrier')) M.hp.horse = clamp(M.hp.horse + man('farrier').heal, 0, 1); player.mend(man('armourer') ? PHYS.damage.mend : 0, man('squire') ? PHYS.damage.squireShield : 0); } M.focus = clamp(M.focus + 0.35 + (sk('nerve') ? SKILLS.nerve.refill : 0) + 0.3 * Math.max(0, M.fav.commons), 0, M.hp.body); M.agit = clamp(M.agit - 0.1, 0, 1);
  S.mode = 'ready'; S.slowT = 0; bobHist.y = bobHist.v = bobHist.a = 0;
  $('banner').classList.add('hidden'); $('hud').classList.remove('hidden'); $('card').classList.add('hidden');
  if (first) $('verdict').classList.add('hidden'); else fadeVerdict();      // the next course is ready: the course card goes by itself (it used to stay up, hiding the prompt, until you spurred)
  const extra = M.course > M.courses;
  if (first && !M.practice && !isAuto()) startHelmBeat();      // the helm is fitted before the lances go up
  // now and then the squire mutters where a bold knight might look (until he has done it once; at most a few times ever)
  if (!first && !M.practice && !M.hintG && M.course >= 2 && !(profile.stats.ladySeen || []).length && (profile.stats.hintG || 0) < 3 && Math.random() < 0.18) {
    M.hintG = true;
    voice.later(1.6, () => say(pick(['My lord, there are ladies in the gallery who keep looking at you. A bold man might press G and look back.', 'Forgive me, my lord. The ladies are watching. Press G, if you are brave enough to look.']), 'YOUR SQUIRE', 4, { free: true, phases: 'ready', ttl: 6, cat: 'hintG', speaker: speakerOf.man('squire'), onShown() { profile.stats.hintG = (profile.stats.hintG || 0) + 1; saveProfile(); } }));
  }
  // The marshal calls the course (the lesson panel and the HUD prompt already say what to do). The lessons of the circuit come at the verdict (betweenColour).
  if (!M.practice) {
    const ask = () => { if (!((M.course === 1 || (M.course >= M.courses && !extra)) && herald('callKnights')) && !herald('courseStart')) say(extra ? 'Deciding course' : `Course ${M.course} of ${M.courses}`, 'THE MARSHAL', 2, { ui: 'courseNumber', key: 'courseNo', phases: 'ready' }); };      // (the herald's roll call is a channel of its own, src/channels.js; the course number is UI)
    if (first) { if (C.beat) C.askFn = ask; else voice.later(0.3, ask); } else ask();      // (the first course's roll call is cried at the end of the helm beat, from the cut to the announcer)
  }
  if (first && M.circuit) voice.later(3.2, () => teach('teachSalute', 0, { free: true }));      // the one lesson before the first course
  if (M.fav.commons > 0.5) audio.crowd('chant', 0.8);
  C.hp0 = M.hp.body; C.dNote = []; C.hpO0 = M.hpO.body; C.heavyHit = [null, null]; C.tendFor = [false, false];
  if (!first) dramaBetween();
  field.begin({ heavy: gapHeavy, horseHurt: M.hp.horse < 0.8, cheer() { react('salute', 0, false); } });      // the groom to the bridle, the pursuivant with the banner, and so on
  if (first) retinueSpeak(gapSit, 0.5);      // later courses: your men speak as you ride back to them (rideOut)
  if (!M.practice) {      // the booth: the last course, an extra course, or now and then the quiet before the flag
    if (extra) booth.say('momentum.extra', { delay: 1.5, ttl: 8, prio: 3 });
    else if (!first && M.course === M.courses && !M.mode.firstBreak) booth.say('momentum.lastCourse', { delay: 1.5, ttl: 9, prio: 3 });
    else if (!first && Math.random() < 0.3) booth.say('ready', { delay: 2.5, ttl: 9, prio: 2 });
  }
  if (M.bondUp) setTimeout(() => toast('Bond', `Your ${player.horseDef.name.toLowerCase()} trusts you more with every course. Bond ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}: steadier and bolder.`), 1500);
  updateHud(true);
}

/** Fade the course card out (0.35 s), then hide it. showVerdict() cancels a fade still running. */
function fadeVerdict() {
  const v = $('verdict'); if (v.classList.contains('hidden')) return;
  v.classList.add('vfade'); clearTimeout(fadeVerdict.t);
  fadeVerdict.t = setTimeout(() => { if (v.classList.contains('vfade')) { v.classList.add('hidden'); v.classList.remove('vfade'); } }, 350);
}
/** The lances come down to the carry and the course is ridden (your first tap after the signal; online, everyone goes at the signal itself). */
function startCharge() {
  S.mode = 'charge'; C.t = 0; C.cut = null; player.raiseT = 0; if (!M.practice && !S.online) opp.raiseT = 0;
  if (!M.practice) {      // the booth calls the start and, a stride or two later, the pace or the point; the stands shout them on
    booth.say('away', { prio: 5, ttl: 2 }); crowdVoices.react('away', 0); audio.crowd('charge', 0.8);
    voice.later(1.4, () => { if (S.mode === 'charge' && C && C.hitT === null) booth.say(C.tier >= 4 ? pick(['charge.fast', 'charge.couch']) : C.tier <= 2 ? 'charge.slow' : pick(['charge.couch', 'charge.aim']), { prio: 5, ttl: 2.5 }); });
  }
  $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
  if (M.agit > 0.7 && Math.random() < 0.6) { player.rear = 0.01; C.rearT = 0.9; audio.whinny(0, 3); }      // the rear is seen, not told: the charge is silent
}
function spur() {
  if (S.paused || S.mode === 'replay' || S.yieldAsk) return;
  if (S.mode === 'ready') {
    const R = C.rd;
    if (C.beat) return;      // the squire is at your helm
    if (player.helmOff) { say('Put your helm on first (H).', 'THE MARSHAL', 2, { ui: 'prompts', prompt: true, phases: 'ready' }); return; }
    if (!R.p) { R.p = true; player.raiseT = 1; if (player.visorUp) toast('VISOR', 'Your visor is up. Press H to close it before you meet.', 5); return; }       // the first W raises the lance
    if (!R.sig) { if (!R.warned && !isAuto()) { R.warned = true; say('Wait for the marshal.', 'THE MARSHAL', 2, { prompt: true, phases: 'ready' }); } return; }
    startCharge();
  }
  if (S.mode !== 'charge' || C.pL.done) return;
  audio.spur();
  if (C.tier < 4) { C.tier++; C.maxTier = Math.max(C.maxTier, C.tier); C.flags['t' + C.tier] = true; if (C.tier === 4) C.galT = C.t; C.ev.taps.push([C.t, 0]); return; }
  const ph = player.phase % 1, d = Math.min(ph, 1 - ph), ok = d < (sk('hands') ? SKILLS.hands.window : 0.2);
  C.ev.taps.push([C.t, ok ? 1 : -1]);
  C.collected = clamp(C.collected + (ok ? 0.34 : -0.3), 0, 1);
  if (!ok) M.agit = clamp(M.agit + (sk('hands') ? SKILLS.hands.fret : 0.07) * DF().nerve, 0, 1);
  const r = $('rhythm'); r.classList.remove('good', 'bad'); void r.offsetWidth; r.classList.add(ok ? 'good' : 'bad');
  clearTimeout(spur._t); spur._t = setTimeout(() => r.classList.remove('good', 'bad'), 260);
}

/** H: raise or lower the visor (bascinet, armet); with a great helm or frog-mouth, take the helm off or put it on, between courses only. */
function toggleVisor() {
  if (!M || !C || !player || S.paused || C.beat || player.unhorsed || !['ready', 'charge', 'after'].includes(S.mode)) return;
  if (player.visor) { player.visorUp = !player.visorUp; return; }
  // (the rigged helms are one piece with no visor to lift: for them H is only helm off / helm on, whatever the pattern)
  const name = { frogmouth: 'A frog-mouth', greathelm: 'A great helm', bascinet: 'This bascinet', armet: 'This armet' }[player.armourDef.helm] || 'This helm';
  if (S.mode !== 'ready') { callout(`${name} has no visor to lift — take it off between courses`, 'bad'); return; }
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
/** The horse rears up for a moment (the stands love it): between courses (key 5), and after a win. */
function rearUp() { if (!C || !player || player.unhorsed || C.rearT > 0) return false; player.rear = Math.max(player.rear, 0.01); C.rearT = 1.6; audio.whinny(0, 3); return true; }
function interlude(n) {
  if (M.spec || !C || S.mode !== 'ready' || C.act || C.beat || M.practice || C.rd.p) return;
  C.act = n;
  if (n === 1) { C.saluted = true; C.saluteT = 1.2; react('salute', 1); world.setRoyalMood('applaud'); C.cut = { kind: 'royal', t: 2.4 + OTS, ots: OTS }; }
  else if (n === 2) { C.saluteT = 1.2; react('rouse', 1); M.agit = clamp(M.agit + (1 - player.horseDef.nerve) * 0.2 * DF().nerve, 0, 1); C.cut = { kind: 'commons', t: 2.4 + OTS, ots: OTS }; }
  else if (n === 3) { react('taunt', 1, false); C.o.rattled = 1.2; C.cut = { kind: 'opp', t: 2.2 + OTS, ots: OTS }; say('You level your lance. He will ride angry.', 'THE COMMONS', 2, { prompt: true, phases: 'ready' }); }
  else if (n === 5) { rearUp(); react('rouse', 1); M.agit = clamp(M.agit + 0.08, 0, 1); say('Your horse rears up and paws the air. The commons roar.', 'THE COMMONS', 2, { prompt: true, phases: 'ready' }); }      // a show for the stands: it frets him a little
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
  else if (kind === 'glare') { M.agit = clamp(M.agit + 0.05 * DF().nerve, 0, 1); M.fav.commons = clamp(M.fav.commons - 0.03, -1, 1); }
  M.favour = (M.fav.commons + M.fav.court) / 2;
  say(pick(E.lines), E.who, 2, { prompt: true, free: true, phases: 'ready', ttl: 12, delay: 0.5 + OTS, cat: 'lady', speaker: () => _lady });
  say(E.note, 'THE GALLERY', 3, { ui: 'prompts', free: true, phases: 'ready', ttl: 12, delay: 9 + OTS, cat: 'lady' });   // after her own line, not queued behind it
  withFeats(() => ladyFeat(profile, kind)); saveProfile();
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _tip = new THREE.Vector3(), _rel = new THREE.Vector3(), _p = new THREE.Vector3(), _zc = new THREE.Vector3();
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(0, 0); const keys = {};
let focusHeld = false;
const arm = new LanceArm();          // your lance arm
const aimMouse = new THREE.Vector2(0, 0), aimOrigin = new THREE.Vector2(0, 0); let aimRebase = true;
const _dm = new THREE.Vector2();
const bobHist = { y: 0, v: 0, a: 0 };  // vertical motion of your saddle, for the lance to feel

/** How hard the horse's motion and your own state throw the lance about (multiplier on the arm physics). */
const assistOff = new THREE.Vector2();
/** Aim assist (DIFFICULTY.assist / assistR): the point of the lance eases toward the centre of the nearest valid mark (his helm, shield or body: never his horse) when it is within
 *  assistR metres of that mark's edge, by up to `assist` of the way and more the closer it is. Moves _a, the point where the aim ray meets his depth; eased, so it never snaps. */
function aimAssist(dt) {
  const D2 = DF(); let tx = 0, ty = 0;
  if (D2.assist > 0 && opp && opp.zones && !M.practice && !S.online && !opp.unhorsed) {
    let best = null, bd = 1e9;
    for (const z of opp.zones) {
      if (z.name === 'horse') continue;
      z.o.getWorldPosition(_zc);
      const dx = _zc.x - _a.x, dy = _zc.y - _a.y, e = Math.hypot(dx, dy) - z.r;
      if (e < bd) { bd = e; best = { dx, dy }; }
    }
    if (best && bd < D2.assistR) { const w = D2.assist * clamp(1 - Math.max(0, bd) / D2.assistR, 0, 1); tx = best.dx * w; ty = best.dy * w; }
  }
  assistOff.x = damp(assistOff.x, tx, 9, dt); assistOff.y = damp(assistOff.y, ty, 9, dt);
  _a.x += assistOff.x; _a.y += assistOff.y;
}
function armScale() {
  return (0.85 + 0.15 * player.armourDef.weight) * LANCES[profile.lance || 'standard'].sway * DF().sway * (1 + (sk('shield') ? SKILLS.shield.sway : 0.35) * player.guard) * (1.25 - 0.25 * M.hp.body) * (sk('arm') ? SKILLS.arm.sway : 1) * (1 + PHYS.damage.helmWobble * player.dmg.helm) * (1 + DR.dazeAim * dazeFrac());      // a dented helm adds a slight wobble to the aim
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
    if (seg) fxBurst(Aj, Bj, seg, _s2.set(0, 0.04, Aj.dir).normalize(), 0.4, h.name === 'helm' ? 'helm' : 'body');
    const [d, pan] = hear(_w); audio.lanceBreak(0.45, d, { cls: 0, zone: h.name === 'helm' ? 'helm' : 'body' }); audio.impact(0.5, h.name === 'horse' ? 'horse' : 'body', d);
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
  if (isAuto() || touchMode) return true;      // touch: no horse steering, the scripted ride-back
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
  const swap = () => { j.throwAt = null; j.lanceDropped = false; j.lance.visible = true; if (j.lanceBroken) { j._mendLance(); j.lanceLower = 0; if (!C.retSpoke) retinueSpeak('lance', 1, 0.3); } };
  const took = () => { j.lanceStump.visible = false; if (j.lanceKept) j.lanceKept.visible = false; j.dropLance(); };      // the hand is empty until the fresh lance arrives (swap)
  if (how === 'throw') { j.throwAt = performance.now() / 1000; took(); field.throwStump('you'); if (!field.serve(true, swap, 'you')) setTimeout(swap, 1000); }      // the arm swings out, the stump leaves the hand and tumbles down; he fetches it
  else if (!field.serve(true, swap, 'you', 'hand', took)) { took(); setTimeout(swap, 1000); }      // it leaves your hand when he takes hold
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
    if (M.mode.tilt && Math.abs(z) < LIST_HALF + 0.3) { if (Math.abs(x) >= BARRIER_X) B.side = Math.sign(x); else { x = B.side * BARRIER_X; hit = true; } }
    if (hit) j.speed = Math.max(0, j.speed - 5 * dt);
    j.root.position.set(x, 0, z); j.root.rotation.set(0, B.th, 0);
    const dist = Math.hypot(mk.x - x, mk.z - z), herr = Math.abs(wrapA(B.th - mk.th));
    B.onMark = dist < MARK_R && j.speed < 2.4 && herr < 0.8;      // within ~45 degrees of facing the lists
    B.dwell = B.onMark ? B.dwell + dt : 0;
    if (B.dwell > 0.45) { T.stage = 'settle'; B.gl = 0; B.rt = 0; if (!B.calls && !M.spec) { profile.stats.markHits = (profile.stats.markHits || 0) + 1; withFeats(() => checkFeats(profile)); saveProfile(); } }      // at your mark, unaided
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
      j.face(-d); j.root.position.set(-j.dir * j.lane, 0, d * START_Z); j.manualPos = false; j.speed = 0; T.stage = 'hand'; B.hT = 0; rollLate(); if (j.throwAt == null) j.lance.visible = true;
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
          T.sub = 'blend'; T.tt = 0; T.b0 = [r.position.x, r.position.z, T.ph, r.rotation.z]; T.bd = clamp(0.4 + 0.3 * Math.hypot(r.position.x - d * mw, r.position.z - d * mu), 0.5, 2.2); if (Math.hypot(r.position.x - d * mw, r.position.z - d * mu) < 2.5) rideService(j, T);      // (still a way off: the stump is thrown down when he is on the mark, see rideArrive, so the squire never walks out into the lane for it)
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
  const swap = () => { j.throwAt = null; j.lanceDropped = false; j.lance.visible = true; if (j.lanceBroken) { j._mendLance(); j.lanceLower = 0; if (isP) { if (!C.retSpoke) say('A fresh lance, my lord.', 'YOUR SQUIRE', 4, { cat: 'squire' }); } } };
  if (isP) rollLate();
  if (broken) { j.throwAt = performance.now() / 1000; j.lanceStump.visible = false; if (j.lanceKept) j.lanceKept.visible = false; j.dropLance(); field.throwStump(who); if (!field.serve(true, swap, who)) setTimeout(swap, 1000); }      // empty hand until the squire's hand-over (swap)
  else { j.lance.visible = true; field.serve(false, null, who); }
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
  C.rd.sig = true;
  // the herald's cry, as the marshal's signal: text and the herald's voice (drama: "Laissez-aller!")
  say('Ride!', 'THE MARSHAL', 2, { ui: 'rideSignal', key: 'signal', urgent: true, prompt: true, phases: 'ready', ttl: 3, onShown() { ceremony.speak(3); } });      // the signal is UI text only now (src/channels.js)
  if (!Pl.horns) fanfare('short'); flagmen.sweep(); audio.crowd('cheer', 0.55 + 0.1 * Math.min(4, M.course));
}

/** One recorded frame of the course: both riders as they stand at course time t. */
function recFrame(t) { C.rec.f.push({ t, p: player.snapshot(), o: opp.snapshot() }); if (C.rec.f.length > 520) C.rec.f.shift(); }
function updateRide(dt, dtReal) {
  const H = player.horseDef, A = player.armourDef, D = dirP();
  const gap = gapNow();
  C.t += dt;
  const live = S.mode === 'charge' && !C.pL.done;
  const after = S.mode === 'after';

  // ---------------- your horse: tap to climb the gaits, rhythm at the gallop, rein to slow
  if (isAuto() && S.mode === 'charge') autoPilot(gap); else if (isAuto() && S.mode === 'after' && G.autoKeepLow !== true) C.couchHeld = false;
  else if (touchMode && !isAuto()) C.couchHeld = S.mode === 'charge' && gap < 36 && !C.pL.done;      // touch: the lance lowers by itself, and rises the moment the stroke is done (the quick-raise credit)
  if (live && keys.rein) { C.reinT += dtReal; if (C.reinT > 0.28) { C.reinT = 0; C.tier = Math.max(0, C.tier - 1); if (gap < 28 && C.tier < 3) C.checked = true; } } else C.reinT = 0.2;
  if (looseHorse(player, dt)) { /* no rider: the horse runs on and stops by itself */ }
  else if (after && M.result && (C.lapDone || C.carded)) {      // the match is decided and the lap (if any) is over: he stands where he is (no cantering on the spot under the card); 5 still rears him
    player.speed = damp(player.speed, 0, 4, dt);
    if (C.rearT > 0) { C.rearT -= dt; player.rear = damp(player.rear, C.rearT > 0.3 ? 1 : 0, 6, dt); } else player.rear = damp(player.rear, 0, 8, dt);
  }
  else if (after && (!M.result || C.turn.p.init && C.turn.p.stage === 'run')) rideOut(player, C.turn.p, dt);      // (once begun, the ride-out is finished even if the match ends under it)
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
    if (touchMode && !isAuto()) steer = clamp(-(C.lat - LANE_X) * 1.2 - C.latV * 0.4, -1, 1) * 0.85 * (M.kit.blind ? PHYS.kit.blindSteer : 1);      // phone: no reins, so the rider keeps his own line (a fretful horse still wavers)          // left = toward the tilt; a blinkered horse keeps his line and is slow to be turned
    // a fretful horse (agit > swayAt) sways about his lane, both ways and centred: his position is a slow sine pair that starts at the lane, so he never pulls one way (a blinkered horse cannot)
    const swayA = M.kit.blind ? 0 : clamp((M.agit - PHYS.kit.swayAt) / (1 - PHYS.kit.swayAt), 0, 1) * PHYS.kit.swayMax * clamp(player.speed / 5, 0, 1);
    C.swayT = (C.swayT || 0) + dt; if (C.swayDir === undefined) { C.swayDir = Math.random() < 0.5 ? -1 : 1; C.swayPos = 0; }
    const swayNow = Math.max(-PHYS.kit.swayIn, swayA * C.swayDir * (0.65 * Math.sin(PHYS.kit.swayW1 * C.swayT) + 0.35 * Math.sin(PHYS.kit.swayW2 * C.swayT)));      // toward the tilt it stops short of the barrier: a fretful horse is not a fault of the rider's
    const shy = 0;
    // open eyes: a nervous horse may shy from the oncoming lance in the last strides, once, losing a little pace and veering away
    if (M.kit.shy && S.mode === 'charge' && !C.shyRolled && gap < PHYS.kit.shyGap && gap > 4) {
      C.shyRolled = true;
      if (Math.random() < M.kit.shy * DF().nerve * clamp((M.agit - PHYS.kit.shyAt) * PHYS.kit.shyGain, 0, PHYS.kit.shyMax) * (1.3 - player.horseDef.nerve)) { C.latV += PHYS.kit.shyKick; player.speed *= PHYS.kit.shyPace; M.shyN[0]++; callout('YOUR HORSE SHIES', 'bad'); }
    }
    C.latV += (steer * 3.2 + shy) * dt * clamp(player.speed / 5, 0.15, 1);
    C.latV *= Math.exp(-2.4 * dt);
    C.lat += C.latV * dt + (swayNow - C.swayPos); C.swayPos = swayNow;
    if (!touchMode && !isAuto() && !M.taught.drift && swayA > 0.02 && Math.abs(C.lat - LANE_X) > PHYS.kit.swayHint && !keys.left && !keys.right) { M.taught.drift = true; callout('YOUR HORSE IS FRETFUL · STEER WITH A / D', 'bad'); }      // the nervous horse's sway is a mechanic: say how to answer it, once a match, only when it is large
    if (C.lat < BARRIER_X && !M.mode.tilt) { C.lat = BARRIER_X; C.latV = Math.max(C.latV, 0.4); }       // open field: nothing to strike, the horses simply will not close further
    else if (C.lat < BARRIER_X) {
      C.lat = BARRIER_X; C.latV = 0.9; player.speed *= 0.93;
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
    C.couch = clamp(C.couch + (C.couchHeld ? dt / ((DF().couchT ?? PHYS.lift.couchT) * (1 + PHYS.body.armCouch * M.bodyS.p.arm)) : -dt / 0.55), 0, 1);      // a jarred arm brings the lance down slower
    if (C.couch > 0.5) C.flags.couch = true;
    C.setT = C.couch >= 0.999 ? C.setT + dt : 0;
    if (C.setT > 0.25) C.flags.set = true;
    C.fatigue = clamp(C.fatigue + (C.couch > 0.6 ? (C.setT > 2.4 * (sk('arm') ? SKILLS.arm.hold : 1) / lanceOf(true).fatigue / DF().fatigue ? 0.3 * lanceOf(true).fatigue * DF().fatigue * (M.kit.queue ? PHYS.kit.queueFatigue : 1) * (1 + PHYS.body.armBuild * M.bodyS.p.arm) : 0) : -0.4) * dt, 0, 1);
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
      if (C.raised) player.liftStep(dt, lanceOf(true).kg);      // a damped spring to the carry pose (jouster.liftStep), not the old exponential: footage, S-curve over about 0.5 s
      else if (C.kickUp) { player.lanceLower = damp(player.lanceLower, 1 - C.kickUp, 26, dt); if (C.upT > 0.3) C.kickUp = 0; }      // thrown up by its own stroke, then it is yours to finish
      else player.lanceLower = damp(player.lanceLower, 1, 6, dt);
    }
  }
  player.guard = damp(player.guard, keys.guard && (live || S.mode === 'ready') ? 1 : 0, (sk('shield') ? SKILLS.shield.rate : 9) * (1 - PHYS.damage.guardSlow * player.dmg.pauldronL), dt);      // a buckled pauldron slows the shield arm
  player.look = damp(player.look, keys.look && S.mode !== 'intro' ? 1 : C.cut && C.cut.kind === 'lady' ? 0.6 : 0, 7, dt);      // (or turned to the gallery, see ladyEye)

  // ---------------- the raise: each rider lifts his lance upright; when both are up the marshal gives the signal
  if (S.mode === 'ready') {
    const R = C.rd;
    if (isAuto() && !R.p && !player.helmOff) { R.p = true; player.raiseT = 1; }
    stepBeat(dtReal);
    // keep the lists waiting at your mark and the host loses patience (once a match): lance not up after 12 s, or not away 8 s after the signal
    if (!C.beat && !M.practice && !isAuto()) {
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
  else if (looseHorse(opp, dt)) { /* no rider */ }
  else if (S.mode === 'charge' && !C.oL.done) {
    if (C.t > O.go) opp.speed = Math.min(O.top, opp.speed + HORSES[od.horse].accel / Math.sqrt(ARMOURS[od.armour].weight) * 0.9 * dt);
    if (gap < 36) opp.lanceLower = clamp(opp.lanceLower + dt / PHYS.lift.couchT, 0, 1);
    opp.brace = damp(opp.brace, O.brace && gap < 5 ? 1 : 0, 10, dt);
    opp.guard = damp(opp.guard, O.guard && gap < 24 ? 1 : 0, 5 * (1 - PHYS.damage.guardSlow * opp.dmg.pauldronL), dt);
    if (M.kit.shy && !M.practice && !O.shyRolled && gap < PHYS.kit.shyGap && gap > 4) {      // his horse too, if his eyes are open
      O.shyRolled = true;
      if (Math.random() < M.kit.shy * clamp((opp.agit - PHYS.kit.shyAt) * PHYS.kit.shyGain, 0, PHYS.kit.shyMax) * (1.3 - (HORSES[od.horse].nerve ?? 0.6))) { opp.speed *= PHYS.kit.shyPace; O.knock.x += (Math.random() < 0.5 ? -1 : 1) * 0.3; M.shyN[1]++; }
    }
    if (!O.retarget && gap < 14) { O.retarget = true; if (player.guard > 0.5 && O.zone === 'helm') O.zone = 'body'; else if (player.guard > 0.5 && O.zone === 'shield' && Math.random() < od.skill) O.zone = 'body'; }
  } else if (after && M.result && (C.lapDone || C.carded) && !M.practice) { opp.speed = damp(opp.speed, 0, 4, dt);
  } else if (after && (!M.result || C.turn.o.init && C.turn.o.stage === 'run') && !M.practice) { rideOut(opp, C.turn.o, dt); opp.brace = damp(opp.brace, 0, 6, dt); opp.guard = damp(opp.guard, 0, 5, dt); opp.liftStep(dt, lanceOf(false).kg); }
  else {
    const tgt = S.mode === 'ready' || M.practice ? 0 : (opp.z * opp.dir > START_Z - 5 ? 0 : 4.5);
    opp.speed = opp.speed < tgt ? Math.min(tgt, opp.speed + 3 * dt) : Math.max(tgt, opp.speed - 3.2 * dt);
    opp.brace = damp(opp.brace, 0, 6, dt); opp.guard = damp(opp.guard, 0, 5, dt);
    if (C.oL.done) opp.liftStep(dt, lanceOf(false).kg);
  }

  player.agit = M.agit; if (!S.online) opp.agit = 0.12 + S.excite * 0.2; player.tiltTop = opp.tiltTop = TILT_TOP;
  { const st = M.stats; st[0].top = Math.max(st[0].top, player.speed); st[1].top = Math.max(st[1].top, opp.speed); }
  player.update(dt); opp.update(dt);

  // ---------------- aim both lances from the fresh positions, then re-point them
  const gap2 = gapNow();
  if (live && gap2 > 0.5) {
    aimMouse.x = damp(aimMouse.x, mouse.x, 16 * Math.sqrt(PHYS.lanceArm.refKg / lanceOf(true).kg), dt); aimMouse.y = damp(aimMouse.y, mouse.y, 16 * Math.sqrt(PHYS.lanceArm.refKg / lanceOf(true).kg), dt);
    if (dazeFrac() > 0.01) { const dz = dazeFrac() * 0.045; _dm.set(aimMouse.x + Math.sin(S.time * 7.1) * dz, aimMouse.y + Math.cos(S.time * 5.3) * dz); }      // a ringing head: the point drifts
    if (M.spec && C.pa) _a.copy(C.pa.pt);      // a spectated rider aims at his own world point (a side-on camera cannot be aimed through)
    else {
    ray.setFromCamera(isAuto() ? mouse : dazeFrac() > 0.01 ? _dm : aimMouse, camera);
    opp.zoneWorld('body', _zc);
    const o = ray.ray.origin, d = ray.ray.direction;
    const t = d.z * D > 0.02 ? clamp((_zc.z - o.z) / d.z, 3, 140) : 140;
    _a.copy(o).addScaledVector(d, t);
    aimAssist(dt);
    }
    player.gripWorld(_b); _c.subVectors(_a, _b).normalize();
    // work in the rider's own frame so the same code serves both directions of travel
    let cmdYaw = Math.atan2(_c.x * D, _c.z * D), cmdPitch = Math.asin(clamp(_c.y, -1, 1));
    {      // the lance can only swing inside the cone Jouster.setAim already holds it to (PHYS.aim): the reticle and the mouse/touch point stop at its edge instead of drifting past it
      // (far out the shaft is held at the couch angle whatever you point at, so the cone only closes in as the lances near: a centred aim is not at an edge on the run-up)
      const AM = PHYS.aim, ke = aimEaseOf(gap2), yLo = lerp(-0.7, AM.yawMin, ke), yHi = lerp(1.3, AM.yawMax, ke), pLo = lerp(-0.6, AM.pitchMin, ke), pHi = lerp(0.6, AM.pitchMax, ke);
      const cy = clamp(cmdYaw, yLo, yHi), cp = clamp(cmdPitch, pLo, pHi);
      C.aimEdge = ke > 0.15 && (cmdYaw <= yLo + 0.01 || cmdYaw >= yHi - 0.01 || cmdPitch <= pLo + 0.01 || cmdPitch >= pHi - 0.01);      // (at the stop: the point is held on it, so test with a hair of slack)
      if (C.aimEdge && !isAuto()) {
        const r = _a.distanceTo(_b);
        _c.set(D * Math.sin(cy) * Math.cos(cp), Math.sin(cp), D * Math.cos(cy) * Math.cos(cp)); _a.copy(_b).addScaledVector(_c, r).project(camera);
        if (Number.isFinite(_a.x + _a.y)) { mouse.set(clamp(_a.x, -1, 1), clamp(_a.y, -1, 1)); aimMouse.copy(mouse); }
      }
      cmdYaw = cy; cmdPitch = cp;
    }
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
    (C.aimDir || (C.aimDir = new THREE.Vector3())).copy(_c);      // where you mean the point to go (the reticle shows this)
    player.aimEase = opp.aimEase = aimEaseOf(gap2); player.setAim(_c); player.applyLance();
  }
  if (S.mode === 'charge' && !C.oL.done && gap2 > 0.5 && !S.online) {
    player.zoneWorld(O.zone, _a);
    const amp = lerp(0.5, 0.11, clamp(od.skill + DF().ai, 0, 1)) * (1 + 0.5 * clamp(M.fav.commons, 0, 1)) * O.rattled * (1 + DR.oppDaze * clamp(M.dr.oDazeT, 0, 1)) * (1 + PHYS.body.oppArm * M.bodyS.o.arm + PHYS.body.oppWind * M.bodyS.o.wind) * (1 + PHYS.kit.wander * (1 - M.kit.rest));      // no lance rest: his point wanders too
    _a.x += amp * (wobble(S.time * 1.7, O.seed) * 0.7 + O.bias.x * 0.9) + O.knock.x;
    _a.y += amp * (wobble(S.time * 2.1, O.seed + 9) * 0.7 + O.bias.y * 0.9) + O.knock.y;
    O.knock.multiplyScalar(Math.exp(-5 * dt));
    // a jouster carries his point over his man's horse: never aim lower than a hand above the top of its head and neck
    if (player.hb) { let top = 0; for (const h of player.hb) if (h.name === 'horseHead' || h.name === 'horseNeck') top = Math.max(top, h.c.ay + h.c.r, h.c.by + h.c.r); if (top > 0) _a.y = Math.max(_a.y, top + 0.12); }
    opp.aimEase = aimEaseOf(gap2); opp.gripWorld(_b); opp.setAim(_c.subVectors(_a, _b).normalize()); opp.applyLance();
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
  if (!R) { player.lanceOver(); opp.lanceOver(); }      // two lances never pass through each other: a look only, after every stroke of the frame is decided (jouster.lanceOver)
  if ((S.mode === 'charge' || (S.mode === 'after' && C.afterT < 2.6)) && !C.replayed && !R) recFrame(C.t);      // (online too: the pause menu's Replays are this screen's own view)

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
      say('Too slow away. Ride on at a canter after the stroke.', 'THE MASTER OF ARMS', 3, { ui: 'lessonGoals', free: true, cat: 'sandbag', phases: 'after', speaker: speakerOf.man('master') });
    }
  }
  const antic = S.mode === 'charge' && gap > 0 ? clamp(1 - gap / 80, 0, 1) : 0;
  S.antic = antic;
  S.excite = Math.max(S.excite, 0.12 + antic * 0.4);
}

// ------------------------------------------------------------------ the victory lap (single player): the winner rides to the royal box, the loser to his tent
const LAP_END = 9.8, LAP_CUT1 = 4.4, LAP_CUT2 = 7.2;
// The winner's lap stays on the sand and well clear of the judges' stand (x 7.8..9.6, z +-1.9: src/judges.js) and the fence (x +-9.5, z +-51): he halts at LAP_X facing it, the
// head of the horse 1.6 m short of the stand. (It was x = 7: the horse's head and chest went into the judges' table, and the far-side detour ran out past the end fence at z = 55.)
const LAP_X = 4.4, LAP_XMAX = 4.9, LAP_ZMAX = 47.5, LAP_XMIN = -7.2;
function lapKeep(r) {
  r.position.z = clamp(r.position.z, -LAP_ZMAX, LAP_ZMAX);
  r.position.x = Math.abs(r.position.z) < 4 ? clamp(r.position.x, LAP_XMIN, LAP_XMAX) : clamp(r.position.x, LAP_XMIN, 6.4);
}
// The victory lap (riding past the stands to halt before the judges) is off by default (owner 28 Nov: "riding towards judges... so annoying"): the winner celebrates where he is. G.lap = true brings it back.
const lapOk = () => G.lap === true && !S.online && !M.practice && !M.void && !/yield|forfeit/.test(M.result || '') && G.lap !== false && !(M.bridge && !M.bridge.final);
/** Settle a drawn knockout match: more lances broken, else the marshals draw lots. */
function settleTie() {
  const bw = M.breaks[0] - M.breaks[1], win = bw > 0 || (bw === 0 && Math.random() < 0.5);
  M.result = win ? 'win' : 'loss'; M.note = bw ? `Level on points: ${win ? profile.name : M.od.short} broke more lances` : 'Level on points and lances: the marshals draw lots'; M.tied = true;
}
function lapStart() {
  C.celMDone = true;
  const res = M.result, draw = res === 'draw', W = res.startsWith('win') || draw ? player : opp, L = W === player ? opp : player;
  if (W.unhorsed || !W.root) return false;
  C.cut = null; C.mont = null; $('royalCap').classList.add('hidden'); $('verdict').classList.add('hidden');
  const wp = W.root.position, sg = Math.sign(wp.z) || 1, wx = wp.x >= 0;
  const lp = L.root.position, lsx = Math.sign(lp.x) || 1, lsz = Math.sign(lp.z) || sg;
  C.lap = { t: 0, W, L, draw, shot: 0, arrived: false, saluted: false, ended: false,
    w: { wps: wx ? [[LAP_X, 0]] : [[-4.5, sg * 46], [3.5, sg * 43], [LAP_X, sg * 30], [LAP_X, 0]], i: 0, vmax: 9, finalYaw: Math.PI / 2, keep: true },
    l: { wps: [[lsx * 13, lsz * 70]], i: 0, vmax: 3.8, finalYaw: null } };
  const win = res.startsWith('win'), TO = M.tourn, pf = TO && win ? career.purseFactor(TO.rounds, TO.round) : 1;
  const marks = Math.round(purse(M.vIdx, win ? res : 'win', M.circuit) * (win || !TO ? pf : 1));
  fanfare(win ? 'victory' : draw ? 'short' : 'defeat');
  react(win ? 'win' : draw ? 'salute' : 'loss', 1, false); if (world.setRoyalMood && M.circuit) world.setRoyalMood(win ? 'rise' : 'applaud');
  const pool = draw ? STAKES.lapDraw : win ? (TO && TO.kind === 'final' ? STAKES.lapPrize : STAKES.lapPurse) : STAKES.lapOut;
  const text = fill(pick(pool), { you: profile.name, him: M.od.short, venue: M.V.name, marks });
  if (profile.herald !== false) voice.later(2.2, () => say(text, ANNOUNCER.label, 3, { phases: ['after', 'end'], ttl: 6, speak: true, speaker: speakerOf.hugh, voice: 'hugh', onShown() { ceremony.speak(4); } }));
  C.lapped = true; $('hud').classList.add('hidden'); if (W === player) player.raiseT = 0;
  return true;
}
/** One rider on his waypoints: pure pursuit with a limited turn rate, eased speed, and a halt on the last point. */
function lapRider(j, st, dt) {
  const r = j.root;
  if (!st.init) { st.init = true; st.yaw = r.rotation.y; st.v = j.speed || 0; j.manualPos = true; }
  const wp = st.wps[st.i], last = st.i === st.wps.length - 1, dx = wp[0] - r.position.x, dz = wp[1] - r.position.z, dist = Math.hypot(dx, dz);
  if (!last && dist < 4) { st.i++; return; }
  let want = Math.atan2(dx, dz); if (last && st.finalYaw != null && dist < 1.4) want = st.finalYaw;
  const dy = wrapA(want - st.yaw), vmax = last ? clamp(dist * 0.8, 0, st.vmax) : st.vmax, vt = Math.abs(dy) > 1.0 ? Math.min(vmax, 3.5) : vmax;
  st.v += clamp(vt - st.v, -5 * dt, 3 * dt);
  st.yaw += clamp(dy, -clamp(2.6 - st.v * 0.17, 0.8, 2.6) * dt, clamp(2.6 - st.v * 0.17, 0.8, 2.6) * dt);
  r.position.x += Math.sin(st.yaw) * st.v * dt; r.position.z += Math.cos(st.yaw) * st.v * dt; if (st.keep) lapKeep(r); r.rotation.y = st.yaw; r.rotation.z = damp(r.rotation.z, 0, 4, dt);
  j.speed = st.v; j.manualPos = true; st.dist = dist;
  st.done = last && dist < 1.3 && st.v < 0.5 && (st.finalYaw == null || Math.abs(wrapA(st.finalYaw - st.yaw)) < 0.15);
}
function lapEnd() { celStop(); C.lap.ended = true; C.lapDone = true; $('hud').classList.remove('hidden'); ceremony.skipUI(false); S.skipHold = 0; skipKey = false; }
function lapStep(dt) {
  const P = C.lap; P.t += dt;
  S.skipHold = skipKey ? S.skipHold + dt : Math.max(0, S.skipHold - dt * 2.5); ceremony.skipUI(true, S.skipHold / SKIP_HOLD);
  if (S.skipHold >= SKIP_HOLD || (P.t >= LAP_END && !(P.cel && P.W.cel)) || P.t >= LAP_END + 8) { lapEnd(); return; }
  const W = P.W, L = P.L, w = P.w, wr = W.root;
  if (!L.unhorsed) lapRider(L, P.l, dt);
  // the cut to the box hides a long way round: the winner is put on the last stretch if he is still far off
  if (P.t >= LAP_CUT1 && !P.cut1) { P.cut1 = true; if (w.i < w.wps.length - 1 || (w.dist || 0) > 16) { w.i = w.wps.length - 1; const sg = Math.sign(wr.position.z) || 1; wr.position.set(LAP_X, 0, sg * 14); w.yaw = Math.atan2(0, -sg); wr.rotation.y = w.yaw; w.v = 6; w.init = true; } }
  lapRider(W, w, dt);
  if (P.t >= LAP_CUT2 - 0.8 && !w.done && !P.arrived) { wr.position.set(LAP_X, 0, 0); w.yaw = Math.PI / 2; wr.rotation.y = w.yaw; w.v = 0; W.speed = 0; w.done = true; }
  if (w.done && !P.arrived) { P.arrived = true; W.raiseT = 1; }
  if (P.arrived && !P.cel) { P.cel = true; if (!P.draw) celMatch(W, L); }
  if (P.arrived && !P.saluted) { P.saluted = true; react('salute', W === player ? 1 : -1, false); if (world.setRoyalMood) world.setRoyalMood('applaud'); if (!P.draw && L !== player) L.raiseT = 0; if (P.draw) L.raiseT = 1; }
}
/** How far a rider's saddle sits above the stock 1.71 m of the old fixed camera heights (a destrier's rider is higher, a rouncey's lower). */
const seatDy = (j) => ((j && j.seatY) || 1.71) - 1.71;
function lapCamera() {
  const P = C.lap, W = P.W, L = P.L, dw = seatDy(W), dl = seatDy(L), p = W.root.position, shot = P.t < LAP_CUT1 ? 1 : P.t < LAP_CUT2 ? 2 : 3;
  const snap = P.shot !== shot; P.shot = shot; let fov = 40;
  if (C.cel && C.cel.cam && W.cel) { const r = celCam(W, W.cel.t, W.cel.dur, want, wantLook), sn = C.cel.shot !== r.shot && camPos.distanceTo(want) > 14; C.cel.shot = r.shot; return { snap: snap || sn, fov: r.fov, rate: r.rate }; }
  if (shot === 1) { const sx = Math.sign(p.x) || 1, c = Math.cos(P.w.yaw || 0); want.set(-sx * 4.5 + p.x * 0.2, 1.7 + dw, p.z - c * 5); wantLook.set(p.x, 1.7 + dw, p.z + c * 1.5); fov = 40; }
  else if (shot === 2) { want.set(-2.5, 2.1 + dw, -6.5); wantLook.set(LAP_X + 2, 2.5 + dw, 0); fov = 40; }
  else if (L.unhorsed) { const f = afterM.focus(L, _d) || L.rider.position; want.set(f.x + (Math.sign(f.x) || 1) * 5.5, 1.6, f.z + 3.2 * (L.dir || 1)); wantLook.set(f.x, 0.3 + f.y * 0.7 + 0.4, f.z); fov = 36; }      // the beaten man on his feet, his squire and his horse
  else { const q = L.root.position, y = P.l.yaw || 0; want.set(q.x - Math.sin(y) * 7 + 3, 2.1 + dl, q.z - Math.cos(y) * 7); wantLook.set(q.x + Math.sin(y) * 3, 1.6 + dl, q.z + Math.cos(y) * 3); fov = 36; }
  return { snap, fov };
}


// ------------------------------------------------------------------ celebrations (src/celebrate.js): FIFA-style, purely cosmetic
// A course won by a clean break or an unhorsing, and the match, start a celebration on the winner (the loser answers with a nod or a helm slap). The player's own is chosen from
// a small prompt (default: one of his favourites, set in the Armoury); the AI knights pick by temperament; online, the choice goes to the friend in a 'cel' message and plays on both
// screens. Nothing here changes a score, a timer or the strike code. Offline, the replay and the verdict wait for the course's celebration (at most ~4 s); online nothing waits.
const ROYAL_PT = new THREE.Vector3(15.5, 3.2, 0);
const celOn = () => G.cel !== false && !!M && !M.practice && !!player && !!opp && !!player.rig && !!opp.rig;
function celOk(J, id, mode) {
  const d = CELEBS[id]; if (!d || !J || J.unhorsed) return false;
  if (d.lance && (!J.lance.visible || J.lanceDropped)) return false;
  if (d.still && mode !== 'match' && J.speed > 3.2) return false;
  return true;
}
/** The crowd swells for the celebrating side (the existing crowd hooks: a roar and applause, the excitement up, the wave, the stands' own reaction on his side). */
function celCheer(by, big) {
  const fav = by * 0.7;
  audio.crowd('roar', big ? 1 : 0.85, 0, { fav }); audio.crowd('applause', big ? 1 : 0.8, 0.35, { fav }); if (big) audio.crowd('cheer', 0.9, 0.7, { fav });
  S.excite = Math.max(S.excite, big ? 1 : 0.95); S.scorer = by; S.waveT = S.time; S.crowdEv = { id: ++crowdEvId, kind: big ? 'win' : 'break', by };
}
function celFire(J, id, mode, sw = false) {
  if (!celStart(J, id, { mode, tgt: mode === 'match' ? ROYAL_PT : null })) return false;
  if (J === player && S.online) netSend({ t: 'cel', id, n: M.course, md: mode === 'match' ? 'm' : 'c' });
  if (!sw && CELEBS[id].kind === 'win') {
    const big = mode === 'match'; celCheer(J === player ? 1 : -1, big);
    if (G.boothCelebrate && !M.practice) G.boothCelebrate(id);      // the booth remarks on the celebration (src/booth_lines.js celebrate.*)
    if (profile.herald !== false && (big || Math.random() < 0.5)) say(heraldLine(id, J === player ? (M.spec ? M.specA.short : profile.name) : M.od.short, big), ANNOUNCER.label, 3, { phases: ['after', 'end'], ttl: big ? 5 : 4, cat: 'celebrate' });
  }
  return true;
}
/** Who won this course by a clean break or an unhorsing: 1 you, -1 him, 0 nobody. */
function celWinner() {
  const p = C.pL.res, o = C.oL.res; if (!p || !o || !C.pts) return 0;
  const good = (r) => !r.foul && r.zone !== 'horse' && (r.unhorse || r.code === 'b' || r.code === 'h');
  if (p.unhorse && !o.unhorse) return 1; if (o.unhorse && !p.unhorse) return -1;
  if (good(p) && C.pts[0] > C.pts[1]) return 1; if (good(o) && C.pts[1] > C.pts[0]) return -1;
  return 0;
}
/** The player's prompt: a default plays at once; a choice within ~1.5 s replaces it. */
function celPrompt(mode) {
  if (M.spec) { const ok = (id) => celOk(player, id, mode); celFire(player, aiPick(M.specA, ok), mode); return; }      // a spectated knight celebrates as his own arms would
  const ok = (id) => celOk(player, id, mode), ch = promptChoices(profile, ok); if (!ch.length) return;
  const fav = favourites(profile).filter(ok), def = (fav.length ? fav : ch)[Math.floor(Math.random() * (fav.length || ch.length))];
  celFire(player, def, mode);
  if (isAuto() && !G.celPrompt) return;      // (the harness: no prompt unless asked)
  showPrompt(ch, def, (id) => { if (player.cel && C && C.cel) celFire(player, id, mode, true); }, 1500);
}
function celCourse() {
  if (!celOn() || (S.online && M.void)) return;
  const wn = celWinner(); if (!wn) return;
  const W = wn > 0 ? player : opp, L = wn > 0 ? opp : player;
  C.cel = { W, L, mode: 'course', t: 0, cam: true, hold: !S.online, lose: { at: 0.8 + Math.random() * 0.5 }, shot: 0 };
  if (W === player) celPrompt('course'); else if (!S.online) celFire(opp, aiPick(M.od, (id) => celOk(opp, id, 'course')), 'course');
}
function celMatch(W, L) {
  if (!celOn()) return;
  C.cel = { W, L, mode: 'match', t: 0, cam: true, hold: true, lose: { at: 1.0 }, shot: 0 };
  if (W === player) celPrompt('match'); else if (!S.online) celFire(opp, aiPick(M.od, (id) => celOk(opp, id, 'match')), 'match');
}
/** The after-sequence (replay, judges, verdict, the card) waits while the winner celebrates (offline for a course; always for the match). */
const celBusy = () => !!(C && C.cel && C.cel.hold && !C.cel.skipped && (C.cel.W.cel || (S.online && C.cel.W === opp && C.cel.t < 0.7)));
const celCamOn = () => !!(C && C.cel && C.cel.cam && !C.cel.skipped && C.cel.W.cel && S.mode === 'after' && !R && !C.mont && !C.beat);      // (nothing cuts away from him while he celebrates: the cam does not yield to a C.cut either)
function celStop() { if (player) celClear(player); if (opp) celClear(opp); hidePrompt(); if (C) C.cel = null; }
function celSkip() { if (C && C.cel) { C.cel.skipped = true; C.cel.cam = false; } if (player) celClear(player); if (opp) celClear(opp); hidePrompt(); }
function celTick(dt) {
  document.body.classList.toggle('celcam', celCamOn());      // (the HUD slips fade while the winner's shot is on: nothing covers him)
  if (player) player.celTs = S.timeScale; if (opp) opp.celTs = S.timeScale;
  const c = C && C.cel; if (!c) return;
  c.t += dt;
  if (c.lose && c.t >= c.lose.at) {      // the beaten man answers (not one who has come off)
    c.lose = null; const Lj = c.L;
    if (!c.skipped && !Lj.unhorsed && !Lj.cel && celOk(Lj, 'nod', c.mode) && (c.mode === 'match' || Math.random() < 0.6)) celFire(Lj, aiLoser(M.od, Lj === player), c.mode);
  }
  const T = C.turn && C.turn.p.stage; if (c.mode === 'course' && (T === 'free' || T === 'settle' || T === 'hand' || T === 'done')) { c.cam = false; hidePrompt(); }      // the ride back is yours again: no cuts then
  if (c.cam && !c.W.cel && c.t > 0.8) c.cam = false;
}

/** Timeline of the after-sequence (dev aid: G.tl): one line each time the shot, the celebration, the montage, the replay or the card changes. */
const TL = []; let tlSig = '', tlT0 = 0;
function tlog() {
  if (!C || !M) return;
  const sig = [S.mode, C.cel ? 'cel:' + (C.cel.W === player ? 'P' : 'O') + ':' + (C.cel.W.cel ? C.cel.W.cel.id : '-') + (celCamOn() ? ':cam' : '') : '', C.cut ? 'cut:' + C.cut.kind + (C.cut.sub ? '.' + C.cut.sub : '') : '', C.mont ? 'mont' + (C.mont.kind || '') : '', C.lap && !C.lap.ended ? 'lap' : '', R ? 'replay' : '', C.verdict ? 'verdict' : '', C.carded ? 'card' : ''].join(' ');
  if (sig === tlSig) return; tlSig = sig; if (S.mode === 'after' && !TL.length) tlT0 = S.time;
  TL.push({ t: +(S.time - tlT0).toFixed(2), s: sig });
}

/** Is the unhorsed man still getting up? Offline only: online nothing waits for it, and the harness's autopilot skips it unless G.aftermathAuto. */
const aftermathHolding = () => !!(C && C.cine && !S.online && !(M && M.practice) && (!isAuto() || G.aftermathAuto || M.spec) && afterM.holding(C.cine));
/** What happens once both lances are spent: replay, the verdict, the royal gallery, then wheel about for the next course. */
function aftermath(dtReal) {
  C.afterT += dtReal; recMeta();
  if (C.capT > 0) { C.capT -= dtReal; if (C.capT <= 0) $('royalCap').classList.add('hidden'); }      // the judges' caption shown over a replay
  if (R) return;      // a replay is playing: the ride-out turn goes on underneath (updateReplay), the verdict waits for the cut back
  if (celBusy()) return;      // the winner celebrates first (offline; a few seconds)
  if (aftermathHolding()) return;      // the unhorsed man gets up (or is tended and carried off) under the follow camera before the cuts begin (src/aftermath.js); hold Space to skip
  if (C.countDue) { if (C.raised || C.afterT > 2.5) { C.countDue = false; settleCount(); } else return; }      // Judged Tilt: the card waits a moment for the lance to come up
  const anyHit = (C.pL.res && C.pL.res.zone !== 'miss' && C.pL.res.zone !== 'none') || (C.oL.res && C.oL.res.zone !== 'miss' && C.oL.res.zone !== 'none');
  const wait = C.cine ? 3.0 : M.practice ? 2.3 : 1.25;      // at the quintain, wait for the bag to come about before the replay
  const replay = anyHit && G.replays !== false && replaysMode() !== 'off' && C.rec.f.length > 20 && !S.online && (!M.spec || brk(C.pL.res) || brk(C.oL.res) || bigMoment() || !!M.result);      // (a watched bout replays only a broken lance, a fall or the deciding course)      // (online: no replays, the match does not wait)
  if (!C.replayed && C.afterT > wait) {
    if (!M.practice) {
      if (!C.lanceDone) { C.lanceDone = true; if (C.meet && !C.cine && seenCine('lance')) { dropLanceBits(true); C.cut = { kind: 'lance', t: 1.2 }; } }      // the full version: 1.2 s on the broken lance on the sand
      if (C.cut && C.cut.kind === 'lance') return;
      if (!C.montDone) { C.montDone = true; startMontage(); }      // a big moment gets the reaction montage first
      if (C.mont) { stepMontage(dtReal); return; }
      if (!C.batDone) { C.batDone = true; startBatter(); if (C.mont) { stepMontage(dtReal); return; } }      // the battered knight: a close-up after a heavy blow
      if (!C.judged) { C.judged = true; if (!M.spec) raiseJudges(false); }      // the judges' flags go up in the world, but the camera never visits them and nothing waits for them (owner: the score is at the top and the hit diagram says the rest)
    }
    if (replay) { startReplay(); return; }
    trimRec(C.rec); C.replayed = true;
  }
  if (!C.replayed) return;
  if (injuriesOn() && !C.tendDone && (M.result ? /yield/.test(M.result) : C.turn.p.stage === 'done')) { C.tendWait = (C.tendWait || 0) + dtReal; if (!voice.cur || C.tendWait > 6) { C.tendDone = true; startTend(); } else if (M.result || C.verdict) return; }      // (waits for the herald's long result call to finish, at most 6 s)      // the surgeon, once the man stands at his mark (or at once if he is to be stopped)
  if (C.mont) { stepMontage(dtReal); return; }
  if (M.result) {
    if (!C.carded) {
      if (!C.vJudge && !M.practice && !isAuto() && judges.has()) { C.vJudge = true; judges.act('verdict', VERDICT_CUT - 0.2); C.cut = { kind: 'judges', t: VERDICT_CUT, total: VERDICT_CUT, split: 1.8, verdict: true }; }      // the match is decided: the middle judge stands his baton up, the others nod
      if (C.cut && C.cut.kind === 'judges') return;
      if ((M.tourn || M.spec) && M.result === 'draw' && !M.tied) settleTie();
      if (M.spec) { specResult(dtReal); return; }      // a watched bout: the winner's moment and a short result beat, then on to the next (no card, no reckoning)      // a knockout has no draws
      if (!C.lapDone && lapOk()) { if (!C.lap && !lapStart()) C.lapDone = true; if (C.lap && !C.lap.ended) { lapStep(dtReal); return; } }
      if (!C.celMDone) { C.celMDone = true; const res = M.result, w = /^win/.test(res) && !/forfeit/.test(res) ? player : /^loss/.test(res) ? opp : null; if (w && !(M.bridge && !M.bridge.final) && !M.void) celMatch(w, w === player ? opp : player); }
      if (celBusy()) return;
      celStop(); C.carded = true; showCard();
    }
    return;
  }
  if (!C.verdict) { C.verdict = true; C.verdictT = 0; showVerdict(); betweenColour(royalReaction()); voice.later(1.0, tallyCall); }
  C.verdictT += dtReal;
  if (S.online) netReady(C.turn.p.stage === 'done' && C.verdictT > (C.seenReplay ? 0.8 : 1.6) && !field.serving());      // the host starts the next course once both are at their marks
  else if (C.turn.p.stage === 'done' && (C.turn.o.stage === 'done' || M.practice) && C.verdictT > (C.seenReplay ? 0.8 : 1.6) && !field.serving()) beginCourse(false);
}

// ------------------------------------------------------------------ the beats around a course: the helm fitting, the marshal's hold, the reaction montage, the judges' flags
// Holding Space skips the helm fitting and the montage (the same ring as the intro's).
/** The marshal's signal: sometimes he holds the flags up a while (more on the last courses), and the horns sound on the first and the last course only. */
function planSignal() {
  if (M.practice || isAuto()) return { hold: 0, horns: false };
  const last = M.course >= M.courses, pen = M.course === M.courses - 1;
  return { hold: Math.random() < (last ? 0.6 : pen ? 0.4 : 0.25) ? 1.5 + Math.random() * 1.5 : 0, horns: M.course === 1 || last };
}
const HELM_FIT = 2.0, HELM_LOOK = 1.6, HELM_LADY = 2.4, HELM_HERALD = 0.6;      // seconds: the squire at your stirrup, the view through your visor slit (held), then (offline) a lady of the gallery, the quiet second before the flag, and the announcer's roll call with his scroll
function startHelmBeat() {
  C.beat = { kind: 'helm', t: 0, stage: 0, pend: true };
  if (player.visor) player.visorUp = true;      // up, so that the squire can close it
  C.cut = { kind: 'helmfit', t: 99 };
}
/** The roll call waited for the end of the helm beat (see beginCourse): cry it now. */
function fireAsk() { const f = C && C.askFn; if (f) { C.askFn = null; f(); } }
function stepBeat(dtReal) {
  const B = C.beat; if (!B) return;
  B.t += dtReal;
  if (B.pend && B.t > 0.04) {      // (a frame later: the men change ends on the first frame of a course, which would wipe his orders)
    B.pend = false;
    if (!field.fitHelm(HELM_FIT, () => { if (C.beat && player.visor) player.visorUp = false; })) B.t = HELM_FIT;      // no squire: straight to the view through the visor
  }
  const look = !S.fp ? 0 : S.online ? 1.0 : HELM_LOOK, t1 = HELM_FIT + look;      // (online the beat stays short: the cuts are local only, and the signal does not wait for them)
  if (B.stage === 0 && B.t >= HELM_FIT) { B.stage = 1; player.visorUp = false; if (S.fp) C.cut = { kind: 'visor', t: 99 }; }      // (the visor-slit look is first person only)
  if (B.stage === 1 && B.t >= t1 && !S.online) {      // the film's held gallery face before the first flag, then the herald's cry
    B.stage = 3;      // (no cut to a lady of the gallery here any more: it fired every match, from a lens that sat behind the judges' canopy and the tilt; the G key still looks at her, see ladyShot)
  }
  if (B.stage === 2 && B.t >= t1 + HELM_LADY) B.stage = 3;
  if (B.stage === 3 && !B.herald) { B.herald = true; B.hAt = B.t; fireAsk(); ceremony.speak(HELM_HERALD - 0.4); }      // (no cut to the announcer: he is silent, src/channels.js)
  const end = B.herald ? B.hAt + HELM_HERALD : B.stage >= 2 ? Infinity : t1;
  if (B.t >= end) endBeat(false);
}
function endBeat(skipped) {
  if (!C.beat) return;
  C.beat = null; C.cut = null; C.t = 0; player.visorUp = false; if (skipped) field.release();      // (the opponent raises his lance a little after: C.t counts from here)
  fireAsk();
}
/** Is this stroke, or this match, big enough for the reaction montage? Never at the quintain. */
function bigMoment() {
  const p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  if (p.unhorse || o.unhorse) return true;
  if ((real(p) && p.code === 'h') || (real(o) && o.code === 'h')) return true;
  return (M.result === 'win' || M.result === 'loss') && (p.pts >= 2 || o.pts >= 2);      // the stroke that won the match
}
const MONT_LEN = [1.4, 1.9, 2.4], MONT_END = [1.4, 3.3, 5.7];      // the stands (the ribbons fly), your squire runs to his lord, a lady of the gallery reacts and holds: 5.7 s, each cut long enough for its gesture to finish (was 3 x 1.1 s)
const hasSpot = () => !!(world && world.crowd && world.crowd.spotlight);
function startMontage() {
  if (isAuto() || !G.reactions || !bigMoment()) return;      // (off: the owner dislikes the cuts to the stands, the squire and the ladies, and the winner's celebration is followed from start to end instead. G.reactions = true brings it back)
  const p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  const decides = !!M.result || M.course >= M.courses;      // (the stands, the squire and the lady: the first time, an unhorsing, or the course that decides the match; never online)
  if (S.online || !(p.unhorse || o.unhorse || decides || seenCine('montage'))) return;
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
  const m = C.mont;
  if (m.kind === 'batter') return stepBatter(m, dtReal);
  if (m.kind === 'tend') return stepTend(m, dtReal);
  m.t += dtReal;
  const i = m.t < MONT_END[0] ? 0 : m.t < MONT_END[1] ? 1 : 2;
  if (i !== m.i) {
    m.i = i;
    if (i === 0) { C.cut = { kind: 'react', sub: 'crowd', cs: m.cs, zc: m.zc, t: 9 }; ribbonBurst(m, 3); S.excite = Math.max(S.excite, 0.9); }
    else if (i === 1) { C.cut = m.sq && field.where('squire', _d) ? { kind: 'react', sub: 'squire', pos: _d.clone(), t: 9 } : { kind: 'react', sub: 'crowd2', cs: m.cs, zc: m.zc, t: 9 }; }
    else { C.cut = m.lady ? { kind: 'react', sub: 'lady', pos: new THREE.Vector3(m.lady.x, m.lady.y + 1.15, m.lady.z), t: 9 } : { kind: 'react', sub: 'crowd2', cs: m.cs, zc: m.zc, t: 9 }; if (m.lady && hasSpot()) world.crowd.spotlight(m.lady.i, -1, m.good ? 'clap' : 'gasp'); }      // her reaction starts as the camera arrives, and plays out
  }
  if (!m.burst2 && m.t > 0.55) { m.burst2 = true; ribbonBurst(m, 2); }
  if (!m.cheered && m.t > 1.7) { m.cheered = true; if (m.sq) field.cheer(); }      // he starts to run just as the camera comes to him
  if (m.t >= MONT_END[2]) endMontage();
}
function endMontage() { C.mont = null; C.cut = null; $('royalCap').classList.add('hidden'); }
/** Hold Space to skip the helm fitting and the reaction montage (the ring fills as in the intro). */
let beatUi = false;
function beatSkip(dtReal) {
  if (M && M.spec) return;      // (a watched bout has its own hold, see specTick)
  const on = !!(M && C && S.mode !== 'intro' && S.mode !== 'replay' && (C.mont || C.beat || aftermathHolding() || (C.cut && (C.cut.kind === 'judges' || C.cut.kind === 'herald'))));
  if (!on) { if (beatUi) { beatUi = false; ceremony.skipUI(false); S.skipHold = 0; } return; }
  beatUi = true; S.skipHold = skipKey ? S.skipHold + dtReal : Math.max(0, S.skipHold - dtReal * 2.5);
  ceremony.skipUI(true, S.skipHold / SKIP_HOLD);
  if (S.skipHold >= SKIP_HOLD) { S.skipHold = 0; skipKey = false; if (C.mont) endMontage(); else if (C.beat) endBeat(true); else if (aftermathHolding()) afterM.skip(); else { judges.rush(); C.cut = null; $('royalCap').classList.add('hidden'); } }
}
/** The judges raise their flags (src/judges.js has the system), then Hugh's combined call follows. A camera cut to the table runs 3.2 s (we are not in a replay here),
 *  long enough to read the caption (Danilo, 15 Nov: at 1.2 s he never saw what it said). */
/** First time each kind of beat plays in a match it plays in full; after that a short version (the owner: aftermath <= 10 s, <= 15 s for an unhorsing). Online it is always the short version, so neither side waits. */
function seenCine(k) { const sn = M.cineSeen || (M.cineSeen = {}), first = !sn[k]; sn[k] = true; return first && !S.online; }
const _rc = new THREE.Raycaster();
const inside = (o, root) => { for (let n = o; n; n = n.parent) if (n === root) return true; return false; };
/** Before a close cut: is anything between the lens and the heads? Tries a few small offsets (sideways, up, back) and returns the first that is clear of everything but `ignore`. */
/** The gallery shot (a lady, a gasping row): from over the tilt, high enough to look down past the judges' canopy (y 2.7), the barrier cloth and the pennant strings, never from beside them
 *  (it was 6.5 m out at 0.6 m above her: with the lanes at 0.62 that put the lens just over the judges' striped roof and the tilt, a blurred wall of cloth filling the frame). */
function ladyShot(q, want, look) {
  const sx = Math.sign(q.x) || 1, cy = Math.max(q.y + 2.0, 4.8);
  want.set(q.x - sx * 9.5, cy, q.z + 1.2); look.set(q.x, q.y, q.z); return 20;
}
function nudgeCam(pos, targets, ignore) {
  const offs = [[0, 0, 0], [0, 0.2, 0], [0, 0, 0.7], [0, 0, -0.7], [0, 0.25, 1.3], [0, 0.25, -1.3], [-0.9, 0.25, 0], [-1.4, 0.35, 0.8], [-1.4, 0.35, -0.8]].map(a => new THREE.Vector3(...a));
  let best = offs[0], bn = 99; const p = new THREE.Vector3(), d = new THREE.Vector3();
  try {
    scene.updateMatrixWorld(); _rc.camera = camera;
    for (const o of offs) {
      p.copy(pos).add(o); let n = 0;
      for (const t of targets) { d.copy(t).sub(p); const len = d.length(); d.normalize(); _rc.set(p, d); _rc.near = 0.05; _rc.far = len - 0.15; if (_rc.intersectObjects(scene.children, true).some(h => h.object.visible && !inside(h.object, ignore))) n++; }
      if (n === 0) return o.clone(); if (n < bn) { bn = n; best = o; }
    }
  } catch (e) { return new THREE.Vector3(); }
  return best.clone();
}
// ---- the broken lance on the sand (the full version of the aftermath only): a few pieces where the point broke, painted in the knight's colours
let lanceBits = null;
function dropLanceBits(on) {
  if (lanceBits) { scene.remove(lanceBits); lanceBits = null; }
  if (!on || !C || !C.meet) return;
  lanceBits = new THREE.Group(); lanceBits.position.set(C.meet.x, 0, C.meet.z);
  // the real lance's pieces, lying where it broke: the fore piece with its coronel, a middle length, the butt with the vamplate, two short ends (src/lance_bits.js)
  const mat = lanceBitMat(profile.arms.c1, profile.arms.c2);
  const pcs = [{ a: 1.5, b: 2.7, jagA: true, crown: true, seed: 3 }, { a: 0.5, b: 1.25, jagA: true, jagB: true, seed: 5 }, { a: -0.4, b: 1.0, jagB: true, vamp: true, seed: 7 }, { a: 1.0, b: 1.28, jagA: true, jagB: true, seed: 11 }, { a: 1.2, b: 1.4, jagA: true, jagB: true, seed: 13 }];
  const put = [[-0.55, 0.0, 0.7], [0.25, 0.42, -0.2], [0.05, -0.38, 0.12], [-0.2, -0.25, 2.4], [0.65, -0.1, -1.1]];
  pcs.forEach((o, i) => {
    const m = new THREE.Mesh(cachedPiece(o), mat); m.castShadow = true;
    m.rotation.set(0, put[i][2] + M.course * 0.7, i % 2 ? 0.04 : -0.03); m.position.set(put[i][0], 0.05 + (i === 0 ? 0.01 : 0), put[i][1]); lanceBits.add(m);
  });
  scene.add(lanceBits);
}
const HERALD_CUT = 3.4, HERALD_SHORT = 2.5, VERDICT_CUT = 3.8, JUDGE_LEAD = 1.3, FLAG_HOLD = 2.6, FLAG_CUT = JUDGE_LEAD + FLAG_HOLD;      // the judges confer first (close on the middle judge, heads together, the scorer writing), then the flags go up in a medium of the box and are held to be read: 3.9 s, never cut mid-gesture
function raiseJudges(overReplay) {
  const Cc = C;
  if (judges.has()) {
    const p = C.pL.res, o = C.oL.res, cy = strokeCat(p), ch = strokeCat(o);
    const lv = (r, c) => !r || r.zone === 'none' || c === 'foul' ? 'down' : c === 'unhorse' || c === 'helm' || c.startsWith('break') ? 'high' : c === 'miss' ? 'wave' : 'level';
    const mid = cy === 'foul' || ch === 'foul' || C.tiltStruck ? 'red' : cy === 'unhorse' || ch === 'unhorse' ? 'high' : 'down';
    judges.show({ you: lv(p, cy), him: lv(o, ch), mid }, 1.7, () => {}, 0);      // flags up in the world only: no camera cut, no caption band (UI.judgesBand is off)
    if (UI.judgesBand) judgeCall(cy, ch, 0);
  }
  releaseCall(Cc);      // the result call and the replay's colour line do not wait for the flags
}
/** The flags are down: Hugh gives his combined result call, and the replay's coaching line may follow it. */
function releaseCall(Cc) {
  if (!Cc || C !== Cc || !M) return;
  if (Cc.resultArgs) { const a = Cc.resultArgs; Cc.resultArgs = null; if (resultCall(a[0], a[1]) && judges.has() && !R) { /* no cut to the announcer: he is silent now (src/channels.js), it would be dead air */ } }
  if (Cc.colourLater) { Cc.colourLater = false; replayColour(); }
}

// ------------------------------------------------------------------ continuous collision (src/collide.js, hit volumes in PHYS.hitboxes)
// Every frame both lances (a chain of capsules from the vamplate to the coronel) are swept from last frame's pose to this frame's against
// the other man's hit volumes (which move too) and against the other lance. The frame is cut into slices of at most 1/120 s and 0.1 m of
// relative motion; each pair is swept slice by slice to its first contact. All contacts of the frame are then resolved in order of time,
// so whoever's point arrived first strikes first (and spoils the other's stroke through C.shock), with no rule about who "leads".
let frameId = 0, HG = null;      // HG: the exact moment and place of the contact being resolved (see resolvePoint)
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
  const CH = PHYS.lanceChain, dz = isP ? (DF().zone - 1) * 0.17 : 0;     // the difficulty widens or narrows the marks
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
  const CH = PHYS.lanceChain, P = player, O = opp, tipPart = (P.lcPoint === e.i && O.lcPoint === e.j), capP = P.reach - CH.capX, capO = O.reach - CH.capX;
  const coronel = tipPart && e.xa >= capP && e.xb >= capO;          // both contacts within the last few cm of each lance: point to point
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
  { const q = e.q, k = e.toi, ext = Aj.reach - Aj.lc[Aj.lc.length - 1].x1;      // where the visible tip was at the instant of contact: the chain stops 4 cm short of the coronel's end, so go on along the shaft
    const end = (c) => { const dx = c.bx - c.ax, dy = c.by - c.ay, dz = c.bz - c.az, l = Math.hypot(dx, dy, dz) || 1; return [c.bx + dx / l * ext, c.by + dy / l * ext, c.bz + dz / l * ext]; };
    const a = end(q.p), b = end(q.c);
    HG = { tip: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], t: C.t - dt * (1 - k), p: e.p.slice() }; }
  strike(Aj, Bj, e.zone, cent, st, isP, off, geo); HG = null;
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
        if (contact && d < z.r * (isP && z.name !== 'horse' ? DF().zone : 1)) {
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
  const latOk = C.lat < LAT_CLOSE ? 0.5 : C.lat <= LAT_WIDE ? 1 : clamp(1 - (C.lat - LAT_WIDE) / 1.2, 0, 1);
  const horse = clamp(0.4 * speedFrac + 0.25 * latOk + 0.15 * (1 - Math.min(1, Math.abs(C.latV) * 2.2)) + 0.2 * C.collected, 0, 1);
  const braced = C.braceT > 0; const perfect = braced && C.braceAge < 0.45;
  if (braced) C.flags.brace = true;
  const will = perfect ? 1 : braced ? 0.72 : 0.3;
  const sight = zone ? ({ helm: 0.9, shield: 0.7, body: 0.5, horse: 0.05 }[zone] + 0.1 + 0.2 * cent) : clamp(0.35 - C.minMiss * 0.5, 0, 0.35);
  // plain-language coaching for whatever went worst
  const tips = {
    // each tip is also spoken in the replay, so it stays within 18 words
    sight: !zone ? (!C.pL.low ? 'Your lance was still pointing at the sky. Hold LEFT MOUSE to bring it down.' : 'You passed without touching him. Keep the ring on his shield: it shows your point.') : zone === 'horse' ? 'You hit his horse, a foul. Aim higher: his shield is the fair mark.' : zone === 'body' ? 'You struck his body. The shield is the fair mark; the helm is worth more.' : 'A fair hit. For three points, try the helm: it is a smaller mark.',
    lance: !C.pL.low ? `Hold LEFT MOUSE to lower the lance, about ${STRIDE_WORD[couchStrides()] || couchStrides()} strides before you meet.` : C.setT < 0.4 ? `You lowered the lance too late and it was still settling. Start at ${STRIDE_WORD[couchStrides()] || couchStrides()} or ${STRIDE_WORD[couchStrides() + 1] || couchStrides() + 1} strides.` : C.fatigue > 0.35 ? `You lowered the lance too early and your arm tired. Wait until about ${STRIDE_WORD[couchStrides()] || couchStrides()} strides out.` : 'Lance timing was good.',
    horse: speedFrac < 0.62 ? 'You were too slow to break a lance. Tap W until the horse gallops.' : C.lat > LAT_WIDE ? 'You rode wide of the barrier. Steer closer with A: the blow lands heavier.' : C.lat < LAT_CLOSE ? 'You crowded the barrier. Ease away with D or you will strike it.' : Math.abs(C.latV) > 0.25 ? 'Keep the horse straight in the last strides. Do not steer as you strike.' : 'Your horse ran fast and straight.',
    will: perfect ? 'You thrust at the right moment.' : braced ? 'You thrust a touch early. Press SPACE just before the lances meet.' : 'Press SPACE just before the lances meet to thrust: you hit harder and sit firmer.',
  };
  if (touchMode) for (const k in tips) tips[k] = tw(tips[k]);
  return { sight, lance, horse, will, q: 0.4 * lance + 0.35 * horse + 0.25 * will, perfect, braced, tips, speedFrac };
}

/** The part of a man a hit volume rides on (PHYS.hitboxes `on`): his shield, helm, torso or seat. */
function partOf(J, name) {
  const h = PHYS.hitboxes.find((b) => b.name === name); if (!h) return null;
  return { shield: J.shield, helm: J.helm, torso: J.torso, rider: J.rider }[h.on] || null;
}
/** He leaves the saddle: what is left of his lance goes from his hand (it falls on its own, as a piece). */
function dropOnFall(J) {
  if (!J.lance || !J.lance.visible || J.lanceDropped) return;
  const a = J.lance.localToWorld(new THREE.Vector3(0, 0, 0.3)), b = J.lance.localToWorld(new THREE.Vector3(0, 0, J.lanceBroken ? (J.brokeAt || 1.2) : J.reach));
  J.dropLance(); fxShaft(a, b, new THREE.Vector3(0, 0, J.dir * J.speed * 0.9));
}
/** A big blow startles the horse as his rider goes: a stumble or a shy (looseHorse plays it), chosen from the stroke's seed. */
function horseStartle(j, J, seed) {
  if (!j || !(J > PHYS.impact.fall.shyJ)) return;
  j.looseShy = { kind: (seed >>> 3) & 1 ? 'shy' : 'stumble', t: 0, ry: j.root.rotation.y };
  j.tossV = (j.tossV || 0) + 6; j.stagV = (j.stagV || 0) + ((seed >>> 4) & 1 ? 1 : -1) * 0.8;
}
/** The riderless horse (mocap: carries on 3-4 strides, then stops within 1-1.3 s): true while it has no rider, and its pace is handled here. */
function looseHorse(j, dt) {
  if (!j || !(j.unhorsed || j.going)) return false;
  const F = PHYS.impact.fall; j.looseT = (j.looseT || 0) + dt;
  if (j.looseT > F.horseCarry) j.speed = Math.max(0, j.speed - F.horseStop * dt);
  // a big blow sets the loose horse off (seeded from the stroke, so both screens agree): a stumble (the stride checked, the head tossed, pace lost)
  // or a shy away from the barrier (a few tenths of a metre out and a turn of the head and body that comes back); root motion on the clips he has
  const L = j.looseShy;
  if (L && j.root) {
    L.t += dt; const k = Math.exp(-2.5 * L.t);
    if (L.kind === 'stumble') { if (L.t < 0.5) { j.chk = Math.max(j.chk, 1); j.speed *= 1 - 0.7 * dt; } }
    else { const out = Math.sign(j.root.position.x) || 1; j.root.position.x += out * F.shyV * k * dt; j.root.rotation.y = L.ry + out * j.dir * F.shyYaw * Math.sin(Math.min(Math.PI, L.t * 4)) * k; }
    if (L.t > 2.5) j.looseShy = null;
  }
  j.brace = damp(j.brace, 0, 6, dt); j.guard = damp(j.guard, 0, 5, dt);
  return true;
}
/** A lance breaks (the whole burst: fore part, splinters, chips, crown; see FX.lanceBurst and PHYS.impact). Recorded with its seed, so a replay throws the same splinters. Returns the class 0 crack / 1 clean / 2 shatter. */
function fxBurst(Aj, Bj, seg, dir, power, zone, ex = {}) {
  const o = { a: seg.a.clone(), b: seg.b.clone(), dir: dir.clone(), v: new THREE.Vector3(0, 0, Aj.dir * Aj.speed), hv: new THREE.Vector3(0, 0, Bj.dir * Bj.speed), power, zone, paint: Aj.arms && Aj.arms.c1 || 0xb23a2a, paint2: Aj.arms && Aj.arms.c2 || 0xe8dcc0, seed: ex.seed ?? ((Math.random() * 1e9) | 0), r0: seg.r,
    tan: ex.tan ? ex.tan.clone() : null, n: ex.n ? ex.n.clone() : null, sinT: ex.sinT || 0 };
  const cls = fx.lanceBurst(o); if (C && !R) C.rec.ev.push({ t: C.t, k: 'lb', o });
  return cls;
}
const breakClass = (power) => power >= PHYS.impact.shatterAt ? 2 : power >= PHYS.impact.cleanAt ? 1 : 0;
/**
 * The feel of a blow, all of it visual: a hit-stop (a freeze of 40-90 ms, only for a big, square blow; online the simulation is never paused, so there the sparks and splinters
 * hang instead), and the camera kicked along the blow's own direction. The slow motion is in strike() (PHYS.impact crack/clean/shatter .slow).
 */
function impactFeel(power, glanced, dir, zone) {
  const I = PHYS.impact;
  if (!glanced && power >= I.hsFrom && !R) S.stopT = Math.max(S.stopT, lerp(I.hitStop[0], I.hitStop[1], smoothstep(I.hsFrom, 1.1, power)));
  _a.set(1, 0, 0).applyQuaternion(camera.quaternion); _b.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const k = (glanced ? 0.35 : 1) * (0.4 + power * 0.9);
  S.kvx += dir.dot(_a) * k * 7 + (Math.random() - 0.5) * k; S.kvy += (dir.dot(_b) + (zone === 'helm' ? 0.5 : -0.2)) * k * 5 + (Math.random() - 0.5) * k;
}
function fxSplinters(a, b, vel, n) { fx.splinters(a, b, vel, n); if (C && !R) C.rec.ev.push({ t: C.t, k: 'spl', a: a.clone(), b: b.clone(), v: vel.clone(), n }); }
function fxShaft(a, b, vel) { fx.shaft(a, b, vel); if (C && !R) C.rec.ev.push({ t: C.t, k: 'sh', a: a.clone(), b: b.clone(), v: vel.clone() }); }
function fxSparks(p, n, s) { fx.sparks(p, n, s); if (C && !R) C.rec.ev.push({ t: C.t, k: 'spk', p: p.clone(), n, s }); }

/** The lance a rider carries this match: the type may fix a heavier one (the Rennen lance), which also tires the arm faster. */
function lanceOf(isP) {
  const id = (isP ? profile.lance : M && M.od && M.od.lance) || 'standard', b = PHYS.lance[id], kg = Math.max(b.kg, M ? M.kit.lanceKgMin : 0);
  return { kg, breakJ: b.breakJ, failN: (b.failN || 6500) * Math.sqrt(kg / b.kg), fatigue: LANCES[id].fatigue * kg / b.kg };      // (a heavier lance of the same kind is a thicker one)
}
function fxPiece(p, q, sx, sy, sz, vel) { fx.piece(p, q, sx, sy, sz, vel); if (C && S.mode !== 'replay') C.rec.ev.push({ t: C.t, k: 'pc', p: p.clone(), q: q.clone(), sx, sy, sz, v: vel.clone() }); }
let NFX = null;      // online host: what the guest needs to show this stroke (see netFlushStrokes)
function strike(Aj, Bj, zone, cent, st, isP, off, geo) {
  st.done = true;
  const nfx = NFX = S.online && NET.host && !M.practice ? {} : null; if (nfx) (C.nfx || (C.nfx = {}))[isP ? 'p' : 'o'] = nfx;
  if (!R && !C.replayed && C.rec.preT !== C.t) { C.rec.preT = C.t; recFrame(C.t - 1e-4); }      // the riders as they stand when the contact falls, before the blow has done anything to them (the frame's own record comes at its end, after the blow)
  const tHit = HG ? HG.t : C.t; if (C.hitT === null) C.hitT = tHit;      // (the contact's own instant, not the end of the frame it fell in)
  // every draw this stroke makes comes from one stream, seeded by the match, the course and the striker: the host (or a replay of the same
  // inputs) always gets the same outcome. Order of draws: glance scatter, then impact() (grain, seat, at), then the fall.
  const srng = rng32(seedOf(M.seed, M.course, isP ? 1 : 2, M.practice ? 7 : 0));
  if (!R) { const tp = Aj.tipWorld(new THREE.Vector3()); C.rec.hits.push({ t: tHit, te: C.t, isP, zone, tip: HG ? HG.tip : [tp.x, tp.y, tp.z], at: HG ? HG.p : null }); }
  voice.mark('strike'); booth.mark();
  const closing = Aj.speed + Bj.speed;
  let q, boost = 1, forceBreak = false;
  if (isP) {
    C.tech = techSnapshot(zone, cent); q = C.tech.q; C.flags.hit = zone !== 'horse';
    if (C.tech.perfect) boost *= 1.08;
    // the hidden arts
    if (C.setT >= 0.4 && C.setT <= 0.95) { boost *= 1.07; discover('clock'); }
    if (C.collected >= 0.9) { boost *= 1.05; discover('inhand'); }
    if (C.lat <= LAT_SHAVE && !C.tiltStruck) { boost *= 1.06; discover('shave'); }
    if (C.galT >= 0 && C.t - C.galT < 2.3 && C.tech.speedFrac > 0.84) { boost *= 1.06; discover('drive'); }
    if (zone === 'helm' && cent > 0.55) { forceBreak = true; discover('sight'); if (C.braceT > 0) C.perfectHit = true; }
    if (S.online && !M.practice && opp.guard > 0.5 && NET.rGuardAge < 0.4 && zone !== 'horse') st.turned = true;      // his shield thrown up in the last instant turns your stroke too
  } else {
    q = C.o.q * DF().oPow;
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
    if (G.forceAngle != null) cosT = Math.cos(G.forceAngle / 57.29578);      // (test hook: the stroke meets the surface this many degrees from square)
    square = cosT;
    const limit = GL[M.mode.sharp ? 'sharp' : 'coronel'] + (GL[zone] || 0) + (zone === 'shield' ? M.kit.shieldCatch : 0) - (zone === 'helm' && Bj.armourDef.helmDef ? Bj.armourDef.helmDef.deflect || 0 : 0) + (zone === 'shield' && Bj.dmg ? PHYS.damage.shieldGlance * Bj.dmg.shield : 0);
    if (!forceBreak && !bites(cosT, limit, srng())) {
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
  const defSeat = isP ? M.od.seat : S.online ? ARMOURS[profile.armour].protection * 0.85 : Math.min(1, (sk('seat') ? SKILLS.seat.seat : 0.6) + DF().seat);
  Bj.strength = 0.75 + 0.5 * defSeat;      // (a good seat also brings him back upright sooner)
  // the blow levers him back about the seat: h = how high above the saddle (the rider's own origin) the point landed
  const hUp = geo && geo.p && !st.skid && Bj.rider && !M.practice ? clamp(geo.p.y - Bj.rider.getWorldPosition(new THREE.Vector3()).y, 0.05, 1.0) : undefined;
  const hit = impact(closing, { horseKg: PHYS.horseKg[Aj.horseDef.id] || 500, armourKg: (Aj.armourDef.kg ?? PHYS.armourKg[Aj.armourDef.id] ?? 28), lanceKg: lanceS.kg, breakJ: lanceS.breakJ * M.mode.lance, failN: lanceS.failN * M.mode.lance, coupling: q, boost },
    M.practice ? { quintain: true } : { horseKg: PHYS.horseKg[Bj.horseDef.id] || 500, armourKg: (Bj.armourDef.kg ?? PHYS.armourKg[Bj.armourDef.id] ?? 28), braced: defBraced, seat: defSeat, protection: Bj.armourDef.protection },
    zone, cent, { rng: srng, h: hUp, queue: !!M.kit.queue, turned: st.turned, forceBreak, bite: M.mode.bite, hold: M.mode.hold * M.kit.cantle * (isP || S.online ? 1 : DF().hold), lock: M.kit.lock, sharp: M.mode.sharp, sharpJ: M.kit.sharpJ * PHYS.refJ, springJ: M.kit.spring * PHYS.refJ, soft: legSoft, square, glance: glanced, pass: zone === 'shield' && Bj.dmg ? 1 + PHYS.damage.shieldPass * Bj.dmg.shield : 1 });
  if (G.force) Object.assign(hit, G.force);      // (test hook: G.force = { broke: true, power: 0.9, unhorse: true } overrides the stroke's outcome)
  const power = hit.power; if (nfx) nfx.pw = power;
  if (G.force && G.force.broke && !(hit.tb > 0)) hit.tb = 0.02;
  G.lastHit = hit; G[isP ? "lastHitP" : "lastHitO"] = hit;      // (test hook: the last stroke's physics, see tools/sim_strikes.mjs for the model)
  Aj.tipWorld(_tip); if (hit.broke && !C.meet) C.meet = new THREE.Vector3(Bj.root.position.x, 0, _tip.z);      // where the lance broke (the pieces on the sand)
  const velA = new THREE.Vector3(0, 0, Aj.dir * Aj.speed);
  const bdir = new THREE.Vector3(0, 0.04, Aj.dir).normalize(), IM = PHYS.impact;
  S.slowT = Math.max(S.slowT, zone === 'horse' ? 0.3 : glanced ? 0 : hit.broke ? [IM.crack, IM.clean, IM.shatter][breakClass(power)].slow : IM.slowTouch);      // (one slow motion per stroke, by what it did: none for a glance or a crack)
  S.shake = Math.max(S.shake, 0.12 + power * 0.3 + (hit.broke ? [IM.crack, IM.clean, IM.shatter][breakClass(power)].shake * 0.4 : 0));
  impactFeel(power, glanced || zone === 'horse', bdir, zone);
  post.setImpact(clamp(0.35 + power * 0.6, 0, 1));
  $('flash').style.opacity = glanced ? 0.15 : 0.35; setTimeout(() => { $('flash').style.opacity = 0; }, 60);
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
  const unhorse = hit.unhorse || (G.forceUnhorse === (isP ? 'opp' : 'player') && (broke || hit.load > 0.6));
  if (!M.practice) C.shock[isP ? 'o' : 'p'] = { t: C.t, power, unhorse, lead: Math.abs(C.lead) / Math.max(closing, 1) };   // lead: seconds until the other point would land
  // ---- the impulse as a vector: into the surface along its normal (Jn), and along it the way the point was sliding (Jt)
  const jdir = bdir.clone(), tan = new THREE.Vector3();
  if (geo && geo.n && geo.dir && !st.skid) {
    tan.copy(geo.dir).addScaledVector(geo.n, -geo.dir.dot(geo.n)); if (tan.lengthSq() > 1e-6) tan.normalize(); else tan.set(0, 0, 0);
    jdir.copy(geo.n).multiplyScalar(-(hit.Jn || 1)).addScaledVector(tan, hit.Jt || 0);
    if (jdir.dot(bdir) < 0.2) jdir.addScaledVector(bdir, 0.4);      // (a normal turned against the stroke, on a skid off an edge: the blow still goes on with the lance)
    jdir.normalize();
  }
  if (nfx) nfx.jd = [+jdir.x.toFixed(3), +jdir.y.toFixed(3), +jdir.z.toFixed(3)];
  // the visible lean is the seat's own: the kick is sized so the reaction spring's peak equals the physics' peak lean (hit.theta), as on film
  // (mocap: about 5 deg at a shield break, 12-15 deg late; see docs/mocap-findings.md 2.2)
  { const hk = M.practice ? power : clamp(hit.theta * IM.react.leanGain * (zone === 'helm' && Bj.visorUp ? 1.5 : 1), 0.3, 8), ho = { dir: jdir, pt: _tip.clone(), power, J: hit.J, headMul: M.kit.bolted ? PHYS.kit.boltedHead : 1, zone, lat: clamp((off ? off[0] : 0) * 0.4 + (zone === 'shield' ? 0.7 : zone === 'helm' ? 0 : 0.15), -1, 1) };
    Bj.hit(hk, true, ho); if (nfx) { nfx.hk = hk; nfx.hm = ho.headMul; nfx.hl = ho.lat; nfx.J = +hit.J.toFixed(1); }
    // the striker takes the same impulse back through the rest and his arm (more when the lance holds: nothing gave way)
    if (Aj.strikeKick && !M.practice) Aj.strikeKick(hit.recoil / refStroke().J, jdir.clone().negate(), hit.broke); }
  if (!M.practice) {
    // the horses feel it too: the struck one loses pace by the blow's momentum over his weight, the striker a little by the reaction
    const dv = hit.J / ((PHYS.horseKg[Bj.horseDef.id] || 500) + PHYS.riderKg + (Bj.armourDef.kg ?? 28)) * PHYS.recoil.horse;
    Bj.speed = Math.max(0, Bj.speed - dv); Aj.speed = Math.max(0, Aj.speed - dv * 0.5); if (nfx) nfx.dv = dv;
    // and the struck rider's own lance is thrown off its line (which is why the first blow spoils the second)
    if (isP) C.o.knock.set((srng() - 0.5) * 0.26 * power, 0.2 * power); else { arm.vy -= dirP() * 0.6 * PHYS.recoil.arm * power; arm.vp += PHYS.recoil.arm * power * (1 + PHYS.kit.lockKick * (M.kit.lock - 1)); }      // a pinned torso cannot roll with the blow
  }
  const [hd] = hear(_tip);
  audio.impact(power, zone, hd); fxSparks(_tip.clone(), 10 + (power * 14 | 0), 4 + power * 3);
  let brokeAt = 0;
  const sinT = Math.sqrt(Math.max(0, 1 - square * square)), burstSeed = (srng() * 1e9) | 0;
  if (broke) {
    // the shaft bows under the rising load for hit.tb seconds (a few hundredths), then fails at its weak point; the burst follows the lance's
    // momentum and, by how oblique the stroke was, the surface it was sliding along (see Jouster.bendLance, FX.lanceBurst)
    brokeAt = Aj.clampBreak(breakAt(sinT, hit.u.at, Aj.rs));
    const at = brokeAt, ld = geo && geo.dir ? geo.dir.clone() : bdir.clone(), tn = tan.clone(), nn = geo && geo.n ? geo.n.clone() : null;
    Aj.bendLance({ kind: 'break', tb: hit.tb, load: hit.load, side: tn, seed: burstSeed, onBreak: () => {
      const seg = Aj.breakLance(at); let cls = breakClass(power);
      if (seg) cls = fxBurst(Aj, Bj, seg, ld, power, zone, { seed: burstSeed, tan: tn, n: nn, sinT });
      const [hd2] = hear(seg ? seg.b : _tip); audio.lanceBreak(power, hd2, { cls, zone });
    } });
    M.breaks[isP ? 0 : 1]++;
  } else if (!M.practice) Aj.bendLance({ kind: 'hold', tc: hit.tc, load: hit.load, side: tan.clone(), seed: burstSeed });      // a lance that holds bows under the load and rings
  // the point stays on his surface from here on: the lance goes back in the hand and bows (and breaks), or skids off; it never goes through him
  if (geo && geo.p && geo.n && !st.skid && !M.practice) {
    const part = partOf(Bj, geo.part);
    if (part) { Aj.pinLance(part, geo.p, geo.n, tan, glanced ? 'skid' : broke ? 'break' : 'hold'); Aj.applyLance(); }
    if (nfx && part) { nfx.cp = [+geo.p.x.toFixed(3), +geo.p.y.toFixed(3), +geo.p.z.toFixed(3)]; nfx.cn = [+geo.n.x.toFixed(3), +geo.n.y.toFixed(3), +geo.n.z.toFixed(3)]; nfx.ct = [+tan.x.toFixed(3), +tan.y.toFixed(3), +tan.z.toFixed(3)]; nfx.pn = geo.part; nfx.gl = glanced ? 1 : 0; }
  }
  if (nfx) { nfx.tb = +(hit.tb || 0).toFixed(4); nfx.tc = +(hit.tc || 0).toFixed(4); nfx.ld = +(hit.load || 0).toFixed(3); nfx.sd = burstSeed; nfx.st = +sinT.toFixed(3); }
  if (nfx && broke) nfx.bk = brokeAt;
  let pts = broke ? (zone === 'helm' ? M.PT.helm : M.PT.broken) : M.PT.attaint, code = broke ? (zone === 'helm' ? 'h' : 'b') : 'a';
  const how = power > 1.0 ? 'shivered his lance to the vamplate' : power > 0.75 ? 'broke his lance clean' : 'broke his lance near the point';
  let text = broke ? `${how} ${zone === 'helm' ? 'on the helm' : zone === 'shield' ? 'upon the shield' : 'on the body'}` : st.turned ? 'his stroke was turned by the shield' : `an attaint on the ${zone}, lance unbroken`;
  // ---- what the rule set makes of it
  { const MD = M.mode, sinT = Math.sqrt(Math.max(0, 1 - square * square));
    if (broke && MD.nearTip && brokeAt > Aj.reach - MD.nearTip - 0.1) { pts = M.PT.attaint; code = 'a'; text = 'broke his lance within a foot of the point: no spear broken, only a touch'; }
    else if (broke && MD.crosswise && sinT > MD.crosswise) { pts = M.PT.attaint; code = 'a'; text = 'broke his lance crosswise, not with the point: it counts for nothing'; }
    if (hit.sprang && !broke) { pts = M.PT.broken; code = 'a'; text = 'his shield sprang from the arm: the stroke counts'; }
    if (MD.onlyShield && zone !== 'shield') { pts = 0; text += ' (only the shield scores)'; }
    if (legSoft) { pts = 0; code = 'a'; text = 'struck low on the thigh, on the sack: a soft touch that counts for nothing'; }
  }
  { const st2 = M.stats[isP ? 0 : 1]; if (broke) st2.broken++; else st2.attaint++; if (zone === 'helm') st2.helm++; st2.best = Math.max(st2.best, power); }
  const visorHit = zone === 'helm' && !!Bj.visorUp;      // struck on the helm with the visor raised: the blow goes in under the brow
  // (the hurt saturates: a held great lance can reach power 2-3, but a man is not three times as hurt as by a full stroke that broke)
  { const pHurt = power <= 1 ? power : 1 + 0.45 * Math.log(power), bodyHit = (D_) => pHurt * 0.2 * (1.35 - (zone === 'helm' ? D_.armourDef.helmProt ?? D_.armourDef.protection : D_.armourDef.protection) * 0.65) * (zone === 'helm' ? 1.3 : 1) * (visorHit ? 2 : 1);
    if (!isP) M.hp.body = Math.max(0, M.hp.body - bodyHit(player)); else M.hpO.body = Math.max(0, M.hpO.body - bodyHit(opp)); }      // (his body is kept offline too: his condition, see PHYS.drama)
  if (unhorse) {
    pts = M.PT.unhorse; code = 'u'; text = `UNHORSED ${whom}`;
    // he keeps most of his horse's speed, less what the blow took from him, and slides off the back rather than being thrown up
    // From the impulse: along the lane he loses what the blow took from his own mass; across, the blow's sideways part and the side he falls
    // to (away from the tilt); the spin over the cantle is what the seat could not soak up (hit.wOver, rad/s); a harder blow takes him over sooner.
    const mR = PHYS.riderKg + (Bj.armourDef.kg ?? PHYS.armourKg[Bj.armourDef.id] ?? 28), F = IM.fall;
    const vz = Bj.dir * Math.max(0.5, Bj.speed * 0.72 - hit.J * Math.abs(jdir.z) / mR);
    const out = Math.sign(Bj.root.position.x) || 1, lat = jdir.x * hit.J / mR;
    // two ways off (mocap 2.3): a blow square over the seat bends him back over the cantle and out at about 0.6 s; one off to the side of his
    // body (the blow's sideways share, or a stroke far out on the mark) throws him out sideways, rolling, at about 0.3 s
    const sideways = G.forceFall ? G.forceFall === 'side' : Math.abs(jdir.x) > F.sideJ || Math.abs(off ? off[0] : 0) > F.sideOff;      // (G.forceFall: test hook)
    const uv = new THREE.Vector3(out * (F.out + F.outRand * srng()) * (sideways ? F.sideOut : 1) + lat * F.lat, Math.min(F.upMax, F.up + Math.min(power, 1.2) * F.upPower + Math.max(0, jdir.y) * hit.J / mR), vz);
    const us = -clamp(F.spin0 + hit.wOver * F.spin, F.spinMin, F.spinMax) * (sideways ? F.sideSpin : 1);
    const d0 = sideways ? F.delaySide : F.delay, delay = clamp(d0 * Math.sqrt(F.wRef / Math.max(1, hit.omega)), d0 * 0.85, d0 * 1.15);      // (mocap: out of the saddle at ~0.6 s over the cantle, ~0.3 s sideways)
    // (the rigged rider follows the authored fall with a ballistic flight, jouster.js; uv and us are the old rigid-body launch, kept for the code-built rider)
    const fk = clamp(0.85 + 0.03 * hit.wOver, 0.85, 1.25), outL = out * (Bj.dir > 0 ? 1 : -1);
    Bj.onDetach = dropOnFall; Bj.unhorse(uv, us, delay, { style: sideways ? 'side' : 'cantle', k: fk, out: outL, lat: lat * F.lat });
    horseStartle(Bj, hit.J, burstSeed);
    if (nfx) nfx.un = [uv.x, uv.y, uv.z, us, delay, sideways ? 1 : 0, +fk.toFixed(3)];
    C.cine = Bj; S.slowT = 2.0; if (!isP) M.hp.body = Math.max(0, M.hp.body - 0.4); else M.hpO.body = Math.max(0, M.hpO.body - 0.4);
  }
  st.res = { zone, pts, code, text, broke, unhorse, power, cent, off, glanced, skid: st.skid || null, spoiled: st.spoiled || 0, turned: !!st.turned, E: hit.E, J: hit.J, v: closing, theta: hit.theta, thetaMax: hit.thetaMax };
  const kind = unhorse ? 'unhorse' : broke && zone === 'helm' ? 'helm' : broke ? 'break' : glanced || st.turned ? 'glance' : 'attaint';
  crowdStroke(kind, isP ? 1 : -1);
  dramaStrike(Aj, Bj, zone, hit, st, isP, broke, unhorse, glanced);
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

// ------------------------------------------------------------------ the aftermath of an unhorsing (src/aftermath.js): who gets up, and what the stands say
/** How a man who has just been unhorsed fares: 'rise' (gets up, perhaps with a hand), 'dazed' (sits up holding his head first) or 'down' (stays down: the surgeon runs out). */
function aftermathDecide(j) {
  if (G.aftermathForce) return G.aftermathForce;
  const side = j === player ? 0 : 1;
  if (injuriesOn()) { const c = conditionOf(side); if (c === 'UNFIT') return 'down'; if (c === 'DOUBTFUL') return 'dazed'; }
  const hurt = side ? M.hpO.body : M.hp.body;
  return hurt < 0.55 || Math.random() < 0.18 ? 'dazed' : 'rise';
}
function aftermathEvent(name, d) {
  if (!M) return;
  const by = d && d.side === 0 ? 1 : -1;      // the house is with the man this is about (+1 you)
  if (!M.practice && booth) booth.say('aftermath.' + name, { prio: 5, ttl: 6 });
  if (name === 'down') react('fallen', by, false); else if (name === 'up') react('risen', by, false); else if (name === 'carried') react('risen', by * 0.5, false);
}
// ------------------------------------------------------------------ drama: injuries, the surgeon, yielding, spare lances, a dropped lance, a ringing helm
// All numbers are in PHYS.drama (src/data.js). ONLINE: none of this runs (injuriesOn() is false when S.online). Both screens would have to agree on blows,
// conditions, a yield, a spare helm and a dropped lance, and the host's messages carry none of them; the existing online rules (body <= 0.02 ends it by yield,
// as netApplyCourse mirrors) are left exactly as they were. The herald's "Laissez-aller!" and the tally are cosmetic and local, so they run everywhere.
const DR = PHYS.drama;
const injuriesOn = () => !!M && !S.online && !M.practice && !M.spec;
const COND_RANK = { FIT: 0, DOUBTFUL: 1, UNFIT: 2 };
/** FIT / DOUBTFUL / UNFIT for one man (0 you, 1 him), from his body, the jolt in arm and wind, and the heavy blows he has taken. */
function conditionOf(side) {
  const hp = side ? M.hpO.body : M.hp.body, b = side ? M.bodyS.o : M.bodyS.p, n = M.dr.heavy[side];
  if (hp <= DR.unfitBody || (b.arm >= DR.unfitArm && b.wind >= DR.unfitWind && hp <= DR.unfitArmBody)) return 'UNFIT';
  if (hp <= DR.doubtBody || (b.arm >= DR.doubtArm && b.wind >= DR.doubtWind) || (n >= DR.heavyN && hp < DR.heavyBody2)) return 'DOUBTFUL';
  return 'FIT';
}
/** The lances a man has left, the one in his hand included: one in hand, DR.spares spare, one more spare for each course beyond four. */
const lancesLeft = (side) => 1 + DR.spares + Math.max(0, M.courses - 4) - M.breaks[side];
function outOfLances() {
  const a = lancesLeft(0) <= 0, b = lancesLeft(1) <= 0, d = M.score[0] - M.score[1];
  M.result = d > 0 ? 'win' : d < 0 ? 'loss' : a && b ? 'draw' : a ? 'loss' : 'win';
  M.note = a && b ? 'Neither man has a lance left to ride' : a ? 'You have no lance left to ride' : `${M.od.short} has no lance left to ride`;
}
/** The AI yields when UNFIT, and sometimes when DOUBTFUL and far behind. */
function aiYields() {
  const c = conditionOf(1); if (c === 'FIT') return false;
  if (c === 'UNFIT') { M.note = `${M.od.short} is too hurt to ride on and yields`; return true; }
  if (M.course >= 2 && M.score[0] - M.score[1] >= DR.aiBehind && Math.random() < DR.aiYield) { M.note = `${M.od.short}, hurt and far behind, yields the joust`; return true; }
  return false;
}
/** How dazed you are, 0..1 (fades over the daze's seconds). */
const dazeFrac = () => (M && M.dr.dazeT > 0 ? clamp(M.dr.dazeT / M.dr.dazeDur, 0, 1) * M.dr.dazeK : 0);
function dazeStep(dtReal) {
  if (!M) { post.setDaze(0); return; }
  const dr = M.dr; if (dr.dazeT > 0) dr.dazeT = Math.max(0, dr.dazeT - dtReal); if (dr.oDazeT > 0) dr.oDazeT = Math.max(0, dr.oDazeT - dtReal);
  post.setDaze(S.mode === 'replay' || S.paused ? 0 : dazeFrac() * DR.dazeBlur);
}
/** The lance falls from the hand. */
function dropLance(J, side) {
  const a = J.lance.localToWorld(new THREE.Vector3(0, 0, 0.3)), b = J.lance.localToWorld(new THREE.Vector3(0, 0, J.reach));
  J.dropLance(); fxShaft(a, b, new THREE.Vector3(0, 0, J.dir * J.speed * 0.5)); M.dr.drops[side]++; M.stats[side].drops = (M.stats[side].drops || 0) + 1;
  callout(side === 0 ? 'YOU DROPPED YOUR LANCE' : 'HE DROPPED HIS LANCE', side === 0 ? 'bad' : 'good', 4.5);
}
function maybeDrop(J, side, power, jarred) {
  if (J.lanceBroken || J.lanceDropped || M.dr.drops[side] >= DR.dropMax || power < DR.dropPower || jarred < DR.dropArm) return;
  if (Math.random() < DR.dropChance * (0.5 + (jarred - DR.dropArm) / (1 - DR.dropArm))) dropLance(J, side);
}
/** What a stroke does to the two men's condition: heavy blows counted, the helm ringing, the daze, the lance that falls from a jarred hand. */
function dramaStrike(Aj, Bj, zone, hit, st, isP, broke, unhorse, glanced) {
  if (!injuriesOn() || (zone !== 'helm' && zone !== 'body' && zone !== 'shield')) return;
  const P = hit.power, bi = isP ? 1 : 0, ai = isP ? 0 : 1, soft = glanced || st.turned || st.skid, helm = zone === 'helm';
  const heavy = unhorse || (!soft && ((helm && (broke || P >= DR.heavyHelm)) || (zone === 'body' && P >= DR.heavyBody)));
  if (heavy) { M.dr.heavy[bi]++; const h = C.heavyHit[bi]; if (!h || P > h.p) C.heavyHit[bi] = { who: bi, zone, helm, p: P }; }
  if (unhorse || P >= DR.tendPower) C.tendFor[bi] = true;
  if (helm) {      // the ring: a sampled sound; the daze follows
    Bj.helm.getWorldPosition(_hd); const [hd] = hear(_hd); audio.helmRing(P * (soft ? 0.5 : 1), bi === 0 ? 1.2 : hd);
    const secs = clamp((DR.dazeBase + DR.dazePower * P * DR.dazeHelm) * (soft ? 0.5 : 1) * (heavy ? 1.15 : 0.8), 0.8, DR.dazeMax);
    if (bi === 0) { const dr = M.dr; dr.dazeDur = Math.max(dr.dazeT, secs); dr.dazeT = dr.dazeDur; dr.dazeK = heavy ? 0.9 : 0.55; }
    else M.dr.oDazeT = Math.max(M.dr.oDazeT, secs);
  }
  // a lance that holds drives the shock back through the hand: with the arm jarred it may fall (the striker), or a man thrown far back may let go (the struck, once his own stroke is spent)
  if (!broke && !unhorse && P >= DR.dropPower) {
    maybeDrop(Aj, ai, P, M.bodyS[isP ? 'p' : 'o'].arm);
    if ((isP ? C.oL : C.pL).done) { const lean = hit.thetaMax > 0 ? clamp(hit.theta / hit.thetaMax, 0, 1) : 0; maybeDrop(Bj, bi, P, Math.max(M.bodyS[isP ? 'o' : 'p'].arm, lean >= DR.dropLean ? DR.dropArm + (lean - DR.dropLean) / (1 - DR.dropLean) * (1 - DR.dropArm) : 0)); }
  }
}
/** The spare helm, once a match, for a helm that is badly smashed. True if fitted. */
function swapHelm(i) {
  const J = i ? opp : player; if (!J || !J.dmg || M.dr.swapped[i] || J.dmg.helm < DR.helmSwapAt) return false;
  J.refitHelm(); M.dr.swapped[i] = true; audio.armourClank(0.8);
  return true;
}
/** Between courses (beginCourse): a smashed helm not yet replaced is swapped; conditions are noted. */
function dramaBetween() {
  if (!injuriesOn()) return;
  for (const i of [0, 1]) if (swapHelm(i)) toast('SPARE HELM', i ? `${M.od.short}'s squire fits him a fresh helm.` : 'Your squire fits the spare helm. It is the only one.', 4);
  M.dr.cond = [conditionOf(0), conditionOf(1)];
}

// ---- the battered knight: a short close-up of the struck man's helm and harness after a heavy blow (a C.mont of kind 'batter': hold Space / touch to skip, like the montage)
function startBatter() {
  if (!injuriesOn() || (isAuto() && !G.dramaAuto) || !C.heavyHit) return;
  let h = null; for (const x of C.heavyHit) if (x && (!h || x.p > h.p)) h = x;
  const J = h && (h.who ? opp : player);
  if (!h || J.unhorsed || J.going || M.course - M.dr.batterAt < DR.batterGap) return;
  M.dr.batterAt = M.course;
  C.mont = { kind: 'batter', t: 0, who: h.who, zone: h.zone, helm: h.helm, shot: -1 };
  $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
}
function stepBatter(m, dtReal) {
  m.t += dtReal; const sh = m.t < DR.battered * 0.6 ? 0 : 1;
  if (sh !== m.shot) { m.shot = sh; C.cut = { kind: 'batter', who: m.who, helm: m.helm, sub: sh, t: 9 }; }
  if (m.t >= DR.battered) endMontage();
}

// ---- the surgeon: a pause to tend a man after a very heavy blow, a worsening condition, or a smashed helm
function tendReason(i) {
  const dr = M.dr, cond = conditionOf(i), drop = i ? C.hpO0 - M.hpO.body : C.hp0 - M.hp.body, J = i ? opp : player;
  if (C.tendFor[i] || drop >= DR.tendBody) return 'blow';
  if (COND_RANK[cond] > COND_RANK[dr.cond[i]]) return 'cond';
  if (J.dmg && J.dmg.helm >= DR.helmSwapAt && !dr.swapped[i]) return 'helm';
  return null;
}
function startTend() {
  if (!injuriesOn() || (isAuto() && !G.dramaAuto)) return;
  const r = [tendReason(0), tendReason(1)], who = r[0] ? 0 : r[1] ? 1 : -1;
  if (who < 0) { M.dr.cond = [conditionOf(0), conditionOf(1)]; return; }
  const cond = conditionOf(who), nm = M.od.short; M.dr.cond = [conditionOf(0), conditionOf(1)];
  C.mont = { kind: 'tend', t: 0, who, cond, reason: r[who], stage: 0 };
  C.cut = { kind: 'tend', who, t: 99 };
  $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
  const swapped = swapHelm(who);
  const A = who ? M.hpO : M.hp, bs = who ? M.bodyS.o : M.bodyS.p; A.body = clamp(A.body + 0.03, 0, 1); bs.wind *= 0.7; if (!who) M.agit = clamp(M.agit - 0.2, 0, 1);      // wine and water, the helm off a moment (D4 of docs/forfeits-research.md)
  const line1 = who ? (cond === 'UNFIT' ? `The surgeon kneels by ${nm}.` : `The surgeon runs to ${nm}.`) : cond === 'FIT' ? 'The surgeon is at your stirrup. "A hard knock. Breathe."' : 'The surgeon is at your stirrup.';
  const line2 = cond === 'UNFIT' ? (who ? '"He cannot ride on." The judges agree.' : '"I forbid it, my lord. You are not fit to ride."')
    : cond === 'DOUBTFUL' ? (who ? '"He may ride on. I would not."' : `"You may ride on, my lord. I would not." You may yield (${touchMode ? 'tap YIELD' : 'Y'}).`) : null;
  const sp = { stop: true, voice: 'master', phases: ['after', 'ready', 'end'], ttl: 9 };      // tier 1: nothing outranks the surgeon
  const spare = who ? `${nm}'s armourer fits the spare helm.` : 'Your armourer fits the spare helm.';
  const next = line2 ? [line2, 'THE SURGEON'] : null; if (swapped && line2) toast('SPARE HELM', spare, 4);      // the second line follows once the first has been shown
  if (!who && line2) voice.later(0.2, () => say(line2, 'THE SURGEON', 1, Object.assign({ ui: 'injury', urgent: true }, sp)));      // only the decision (unfit / may yield) is shown, to the player, unspoken; the rest of the surgeon's talk is silent
  audio.armourClank(0.6);
}
function stepTend(m, dtReal) {
  m.t += dtReal;
  if (m.t >= DR.tend) { endMontage(); M.dr.cond = [conditionOf(0), conditionOf(1)]; }
}

// ---- yielding: between courses, key Y or the button, with a confirm
function yieldOk() { return injuriesOn() && !!C && S.mode === 'ready' && !S.paused && !C.rd.p && !C.beat && !C.act && !M.result && M.course >= 2 && !R; }
function openYield() {
  if (!yieldOk() || S.yieldAsk) return;
  S.yieldAsk = true; $('yieldAsk').classList.remove('hidden'); audio.ui('select');
}
function closeYield() { S.yieldAsk = false; $('yieldAsk').classList.add('hidden'); }
function doYield() {
  closeYield(); if (!injuriesOn() || !C || M.result) return;
  M.yielded = true; M.result = 'loss-yield'; M.dr.yielded = true; M.note = 'You yielded the joust';
  S.mode = 'after'; C.pL.done = C.oL.done = true; C.carded = C.verdict = C.replayed = C.montDone = C.judged = C.tendDone = true; C.countDue = false;
  for (const st of [C.pL, C.oL]) if (!st.res) st.res = { zone: 'none', pts: 0, code: 'm', text: '' };
  C.pts = [0, 0]; if (!C.tech) C.tech = techSnapshot(null, 0);
  C.mont = null; C.cut = null; $('verdict').classList.add('hidden'); $('royalCap').classList.add('hidden');
  showCard();
}
$('yieldBtn').addEventListener('click', (e) => { e.stopPropagation(); openYield(); });
$('yieldYes').addEventListener('click', (e) => { e.stopPropagation(); doYield(); });
$('yieldNo').addEventListener('click', (e) => { e.stopPropagation(); closeYield(); });

/** The herald calls the tally of lances after each course: "Sir X, two lances broken; Sir Y, one." */
function tallyCall() {
  if (!M || M.practice || M.result) return;
  const a = M.breaks[0], b = M.breaks[1], w = (n) => n === 0 ? 'no lance broken' : n === 1 ? 'one lance broken' : `${numW(n)} lances broken`, nm = /^(Sir|Lord|Dame)\b/.test(profile.name) ? profile.name : `Sir ${profile.name}`, him = M.od.short;
  const text = `${nm}, ${w(a)}; ${him}, ${b === 0 ? 'none' : b === 1 ? 'one' : numW(b)}.`;
  const o = { text, tier: 3, kind: 'verdict', cap: 'combined', free: true, speak: true, phases: ['after', 'ready'], ttl: 9, cat: 'tally' };
  if (!herald('tally', 0, o)) say(text, ANNOUNCER.label, 3, Object.assign(o, { speak: false }));
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
  return herald('result', 0, { text, vars: { yourW: numW(yo), hisW: numW(hi), n: numW(yo), pts: cap(numW(Math.abs(p.pts))) }, onShown() { picks.forEach(k => k.done()); C.resultSaid = true; } });
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
  else if (injuriesOn() ? conditionOf(0) === 'UNFIT' : M.hp.body <= 0.02) { M.result = 'loss-yield'; if (injuriesOn()) M.note = 'The surgeon forbids you to ride on'; }      // UNFIT: the judges stop it on the surgeon's word (PHYS.drama)
  else if (M.online && M.hpO.body <= 0.02) M.result = 'win-yield';
  else if (injuriesOn() && aiYields()) M.result = 'win-yield';
  else if (injuriesOn() && !M.mode.style && !M.mode.firstBreak && (lancesLeft(0) <= 0 || lancesLeft(1) <= 0)) outOfLances();
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
  if (!M.practice && !M.spec) {      // feats of the course (the toasts wait for the verdict)
    const real = p.broke && p.zone !== 'horse' && !p.foul;
    withFeats(() => courseFeats(profile, { broke: real, helm: real && p.code === 'h', unhorse: !!p.unhorse, perfect: real && p.code === 'h' && !!C.perfectHit }));
  }
  if (!M.practice) C.resultArgs = [p, o];      // Hugh's call waits for the judges' flags (raiseJudges)
  if (!M.practice) boothAfter(p, o);
  updateHud(true);
  if (S.online) netSendCourse(p, o, pp, op);
  celCourse();
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
  const TIP_ICON = { sight: 'aim', lance: 'lance', horse: 'horse', will: 'will' };
  const item = (k, icon, label) => `<div class="vt ${state(t[k])}"><span class="vi">${icon}<img src="assets/ui/tips/${TIP_ICON[k]}-96.png" srcset="assets/ui/tips/${TIP_ICON[k]}-96.png 1x, assets/ui/tips/${TIP_ICON[k]}-256.png 3x" alt="" draggable="false" onerror="this.remove()"></span>${label}</div>`;
  $('vtech').innerHTML = item('sight', '◎', 'AIM') + item('lance', '⟋', 'LANCE TIMING') + item('horse', '♞', 'HORSE') + item('will', '✊', 'LEAN IN');
  const weakest = ['sight', 'lance', 'horse', 'will'].sort((a, b) => t[a] - t[b])[0];
  $('vtip').textContent = (harnessNotes() + ' ') + (t[weakest] >= 0.75 ? 'A fine course — nothing to mend.' : t.tips[weakest]);
  $('vhint').innerHTML = touchMode ? 'Your knight wheels about for the next course' + (C.replayed && C.rec.f.length > 20 && !S.online ? ' &nbsp;·&nbsp; <button class="btn small" id="vhintReplay">Replay</button>' : '') : 'Your knight wheels about for the next course &nbsp;·&nbsp; <b>R</b> watch the replay again';
  { const rb = $('vhintReplay'); if (rb) rb.onclick = (e) => { e.stopPropagation(); if (C && S.mode === 'after' && !C.cut && !R) startReplay({ frozen: true }); }; }
  $('flashTxt').className = '';
  clearTimeout(fadeVerdict.t); $('verdict').classList.remove('vfade', 'hidden');
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
  voice.cutBetween();      // the tally or a colour line still on screen goes when the card comes up
  $('verdict').classList.add('hidden'); $('flashTxt').className = '';
  const B = M.bridge; if (B) bridgeRecord();
  const final = !B || B.final, res = B && final ? (B.held ? 'win' : 'loss') : M.result;      // what the title, the purse and the herald answer to: the bridge's end, or this bout
  const nextOd = B && !final ? KNIGHTS.find(k => k.id === B.queue[B.bout]) : null;
  $('cardTitle').textContent = B ? (final ? (B.held ? 'THE BRIDGE IS HELD' : 'THE BRIDGE IS LOST') : M.result.startsWith('win') ? 'BOUT WON' : M.result === 'draw' ? 'BOUT DRAWN' : 'BOUT LOST')
    : M.void ? 'THE JOUST IS VOID' : { 'win': 'VICTORY', 'win-unhorse': 'VICTORY BY UNHORSING', 'loss': 'DEFEAT', 'loss-unhorse': 'UNHORSED', 'loss-dq': 'DISQUALIFIED', 'win-dq': 'VICTORY — HE IS DISQUALIFIED', 'loss-yield': M.yielded ? 'YOU YIELD THE JOUST' : 'YOU YIELD — TOO BATTERED TO RIDE', 'win-yield': 'VICTORY — HE YIELDS', 'draw': 'HONOURS EVEN', 'practice': 'YOU ARE READY FOR THE LISTS' }[M.result];
  $('cardReplays').classList.toggle('hidden', !recList().length);
  if (S.online && M.result && NET.net) rematchHint(); else
  $('cardHint').textContent = nextOd ? `The next challenger is ${nextOd.short} · ${touchMode ? 'TAP' : 'SPACE / CLICK'} to meet him` : touchMode ? 'TAP to continue' : 'SPACE / CLICK to continue';
  if (M.how) voice.later(0.4, () => say(`The prize is given for ${M.how}.`, 'THE JUDGES', 1, { ttl: 8 }));
  const base = `${M.tourn ? M.tourn.name + ' · ' : ''}${profile.name} ${M.score[0]} — ${M.score[1]} ${M.od.short}`;
  $('cardSub').textContent = M.result === 'practice' ? 'The master of horse has nothing more to teach you here. Ride the circuit.'
    : B ? (final ? `${B.held ? 'The bridge is held' : 'The bridge is lost'}: ${B.wins} of ${B.n} bouts won · ` : `Bout ${B.bout} of ${B.n} · ${bridgeRecordText(B)} · `) + base
    : M.mode.firstBreak ? (M.note || base) : M.note ? `${base} · ${M.note}` : base;
  const fmt = (n) => (n > 0 ? '+' : '') + n;
  const [pw] = plain(p, C.pL, true), [ow] = plain(o, C.oL, false);
  $('cardCols').innerHTML = `<div class="who"><span class="pts">${fmt(C.pts[0])}</span><h4>${profile.name.toUpperCase()}</h4><div class="res">${pw}</div></div>
    <div class="who"><span class="pts">${M.practice ? '' : fmt(C.pts[1])}</span><h4>${M.od.short.toUpperCase()}</h4><div class="res">${M.practice ? '' : ow}</div></div>`;
  if (M.yielded) $('cardCols').innerHTML = `<div class="who"><span class="pts"></span><h4>${profile.name.toUpperCase()}</h4><div class="res">YIELDED THE JOUST</div></div><div class="who"><span class="pts"></span><h4>${M.od.short.toUpperCase()}</h4><div class="res">HOLDS THE FIELD</div></div>`;
  const T = M.tech, pc = (k) => Math.round(T[k] / Math.max(1, T.n) * 100);
  const row = (k, name) => `<div class="trow"><b>${name}</b><div class="tb"><i style="width:${pc(k)}%"></i></div><span>${pc(k)}</span></div>`;
  $('cardRows').innerHTML = row('sight', 'AIM') + row('lance', 'LANCE') + row('horse', 'HORSE') + row('will', 'LEAN IN');
  const a = M.stats[0], b = M.stats[1], f = (l, x, y) => `<div class="fact"><span>${x}</span><i>${l}</i><span>${y}</span></div>`;
  $('cardFacts').innerHTML = M.practice ? '' : `<h6>MATCH FACTS</h6>` + f('LANCES BROKEN', a.broken, b.broken) + f('TOUCHES', a.attaint, b.attaint) + f('HELM STRIKES', a.helm, b.helm) + f('CLEAN MISSES', a.miss, b.miss)
    + (injuriesOn() ? f('CONDITION', conditionOf(0), conditionOf(1)) + f('LANCES DROPPED', M.dr.drops[0], M.dr.drops[1]) + f('LANCES LEFT', Math.max(0, lancesLeft(0)), Math.max(0, lancesLeft(1))) : '')
    + f('TOP SPEED', `${Math.round(a.top * 3.6)} km/h`, `${Math.round(b.top * 3.6)} km/h`) + f('HARDEST STROKE', `${Math.round(a.best * PHYS.refJ)} J`, `${Math.round(b.best * PHYS.refJ)} J`);
  $('cardTimeline').style.display = 'none';
  $('card').classList.remove('hidden');
  const win = res.startsWith('win') || res === 'practice';
  if (!C.lapped) {      // (after a victory lap the fanfare, the crowd and the royal box have already answered)
    fanfare(win ? 'victory' : res === 'draw' ? 'short' : 'defeat');
    react(win ? 'win' : 'loss', 1, false);      // the card and the herald speak; no crowd line on top
    if (world.setRoyalMood && M.circuit) world.setRoyalMood(win ? 'rise' : 'applaud');
  }
  retinueSpeak(win ? 'won' : res === 'draw' ? null : 'lost', 0.85, 5.5);
  if (!M.practice && (!B || final)) {      // the booth's last word (after Hugh's), and the career note
    booth.say('result.' + (win ? 'win' : res === 'draw' ? 'draw' : 'loss'), { delay: 3.5, ttl: 22, prio: 6 });
    if (win && !((profile.stats && profile.stats.beaten) || []).length) booth.say('result.firstWin', { delay: 6, ttl: 26, prio: 5 });
    else if (roastDue(win)) booth.say('newbie.roast', { delay: 6, ttl: 26, prio: 5 });
    else if (win && M.tourn && M.tourn.kind === 'final') booth.say('result.champion', { delay: 6, ttl: 26, prio: 5 });
  }
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
  if (win && M.circuit && !M.tourn) voice.later(12, () => herald('prize'));
  if (!M.practice && !M.online && final) {      // (online: no purse, no renown, no feats)
    // the reckoning: what the day brought in, what it cost, and what it added to your name
    const onAcct = account.signedIn() && M.spId;      // signed in: the server pays (see spPaid below); the local reckoning is only the guest's
    const rk = reckon({ vIdx: M.vIdx, result: res, circuit: M.circuit, courses: B ? B.tot.courses : M.courses, practice: false, void: !!M.void, bouts: B ? B.wins : 0, lance: profile.lance || 'standard', broken: B ? B.tot.broken : M.breaks[0], helms: B ? B.tot.helm : M.stats[0].helm, body: M.hp.body, horseHp: M.hp.horse,
      court: M.fav.court, pf: M.tourn && res.startsWith('win') ? career.purseFactor(M.tourn.rounds, M.tourn.round) : 1, noFees: !!M.tourn && M.tourn.round > 0, final: !!M.tourn && M.tourn.kind === 'final' && res.startsWith('win'), horse: profile.horse, armour: profile.armour, helm: profile.helm, retinue: profile.retinue, oppHorse: M.od.horse, oppArmour: M.od.armour, skills: profile.skills });
    const rb = rankOf(profile.renown);
    if (!onAcct) settle(profile, rk);
    M.reckoning = rk;
    if (!M.tourn && !res.startsWith('win') && res !== 'draw' && !M.bridge && !M.void) { profile.lostTo = profile.lostTo || {}; profile.lostTo[M.od.id] = (profile.lostTo[M.od.id] || 0) + 1; }
    profile.stats = profile.stats || {}; profile.stats.played = (profile.stats.played || 0) + 1;      // matches finished (the herald's word to a new knight, see newbieSay)
    const won = res.startsWith('win');      // the feats of the match (their renown is paid before the rank is read)
    showFeats(matchFeats(profile, { won, venue: M.V.id, mode: M.mode.id, opp: M.od.id, cleanSheet: M.score[0] > 0 && M.score[1] <= 0, comeback: M.maxDef >= 3, ironSeat: M.stats[1].best < 0.75,
      sightWin: !!M.mode.sightWin && M.result === 'win' && !!M.how }));
    saveProfile();
    const rankUp = rankOf(profile.renown) > rb;
    const sgn = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
    if (onAcct) { $('cardFacts').innerHTML += `<h6>THE RECKONING</h6><div id="acctReckon"><div class="led note"><span>The clerk is counting…</span></div></div>`; spPaid(M, res, B); }
    else $('cardFacts').innerHTML += `<h6>THE RECKONING</h6>` + rk.lines.map(l => `<div class="led ${l[1] < 0 ? 'neg' : ''}"><span>${l[0]}</span><span>${sgn(l[1])}</span></div>`).join('')
      + `<div class="led sum ${rk.total < 0 ? 'neg' : ''}"><span>${rk.total < 0 ? 'The day cost you' : 'The day brought you'}</span><span>${Math.abs(rk.total)} coins</span></div>`
      + `<div class="led note"><span>${purseText(profile.gold)} &nbsp;·&nbsp; +${rk.renown} renown</span></div>`
      + rankBar(profile.renown);
    if (rankUp) { announceRank(true); booth.say('result.rankUp', { delay: 9, ttl: 26, prio: 4 }); } else if (M.rankPending) rankSay(rankOf(profile.renown));      // the card is up: the notice may show
  }
  if (B) $('cardFacts').innerHTML += `<h6>THE BRIDGE</h6>` + B.log.map((b, i) => f(`BOUT ${i + 1} · ${b.short.toUpperCase()}`, b.res.startsWith('win') ? 'won' : b.res === 'draw' ? 'drawn' : 'lost', `${b.score[0]} — ${b.score[1]}`)).join('');
  if (M.tourn) recordTournament();
  if (S.online) rankReport();
}

// ------------------------------------------------------------------ instant replay
const camHM = { p: 0, r: 0 };
function lerpSnap(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    if (key === 'ry' && typeof x === 'number' && typeof y === 'number') o[key] = x + wrapA(y - x) * k;      // the horse's heading: the SHORT way round (a wheel-about across +-pi used to spin it a full turn between two recorded frames)
    else if (typeof x === 'number' && typeof y === 'number') o[key] = x + (y - x) * k;
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
const ANGLES = ['LOW SIDE', 'CHASE', 'REVERSE', 'CRANE', 'IMPACT', 'FALL', 'YOUR EYES', 'HIS EYES', 'FREE'];      // 0-4 are the five fixed angles; 5 is the follow-the-fallen-man camera of an unhorsing replay; 6 and 7 look through your visor slit and his; 8 is the free camera
const CYC = [0, 1, 2, 3, 4, 6, 7, 8];      // what V cycles (and the highlight list offers); the fall camera is only cut to by the automatic replay
const viewList = () => CYC.filter(a => a !== 7 || !M.practice);      // (the quintain has no eyes)
const SPEEDS = [1, 0.5, 0.25, 0.1], spdTxt = (v) => v === 0.5 ? '½×' : v === 0.25 ? '¼×' : v === 0.1 ? '0.1×' : '1×';
/** The camera passes of the automatic replay (EA FC goal-replay style): Settings > Replays: Short = one angle for an ordinary course, two for a break, three for a helm break or an unhorsing; Standard (default) = at least two angles from both sides; Full = four passes (plus the fall camera of an unhorsing). Times are relative to the impact. */
function planPasses() {
  const f = R.f, p = C.pL.res, o = C.oL.res, real = (r) => !!r && r.broke && !r.foul && r.zone !== 'horse';
  const un = !!C.cine && !!((p && p.unhorse) || (o && o.unhorse)), helm = (real(p) && p.code === 'h') || (real(o) && o.code === 'h'), brk = real(p) || real(o);
  const main = [0, 2, 1, 3][M.course % 4];
  const N = (shot, a, b, prof) => { let t0 = Math.max(f[0].t, R.tImp + a); const t1 = Math.min(f[f.length - 1].t, R.tImp + b); if (t1 - t0 < 0.4) t0 = Math.max(f[0].t, t1 - 0.4); return { shot, t0, t1, prof }; };
  const mode = replaysMode(), full = mode === 'full', rev = main === 2 ? 0 : 2, hrev = main === 2 ? 3 : 2, fullSet = [main, rev, 4, main === 3 ? 1 : 3];      // rev: the other knight's side (REVERSE, or LOW SIDE when the main angle already is the reverse); full: main, reverse, impact, crane
  if (un) { R.fallP = C.cine === player; R.fall = new THREE.Vector3(); R.fdir = C.cine.dir || 1; R.fx0 = Math.sign(C.cine.root.position.x) || 1; return [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c'), ...(full ? [N(rev, -0.7, 0.5, 'n'), N(fullSet[3], -0.7, 0.6, 'n')] : []), N(5, -0.25, 1.8, 'f')]; }
  if (helm) return [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c'), N(hrev, -0.7, 0.5, 'n'), ...(full ? [N(fullSet[3] === hrev ? rev : fullSet[3], -0.7, 0.5, 'n')] : [])];
  if (brk) return full ? [N(main, -0.7, 0.5, 'n'), N(rev, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c'), N(fullSet[3], -0.7, 0.5, 'n')] : [N(main, -0.7, 0.5, 'n'), N(4, -0.6, 0.6, 'c')];
  if (full) return [N(main, -0.8, 0.65, 'n'), N(rev, -0.8, 0.65, 'n'), N(4, -0.7, 0.6, 'c'), N(fullSet[3], -0.8, 0.65, 'n')];
  if (mode === 'standard') return [N(main, -0.8, 0.65, 'n'), N(rev, -0.8, 0.65, 'n')];      // the strike from both knights' sides
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
  R = { f, ev: C.rec.ev, tImp, i: 0, e: 0, liveP: player.snapshot(), liveO: opp.snapshot(), back: S.mode, live: !opt.frozen, hl: false, course: M.course, fxDt: 0, rate: 1, shot: 0, pass: 0, t: 0, t0: 0, t1: 1, spd: 1, pause: false, hits: C.rec.hits };
  replayGeom(); R.passes = planPasses(); setPass(0);
  if (!R.live) player.replaying = opp.replaying = true;      // a live replay dresses the riders afresh each frame (replayDress), so that his ride-out turn goes on underneath
  fx.clear(); showMarks(R.t, R.course);
  S.mode = 'replay'; S.slowT = 0; S.timeScale = 1;
  $('replayTag').classList.remove('hidden'); $('replayKeys').classList.remove('hidden'); $('hud').classList.add('hidden'); $('verdict').classList.add('hidden'); if (!(C.capT > 0)) $('royalCap').classList.add('hidden');
  $('rplCtl').classList.remove('hidden'); rplSync();
  // what each lance did, drawn at the bottom corners while the replay runs
  const p = C.pL.res, o = C.oL.res;
  if (p) { drawHitMap($('rhitYou'), p, C.pL.near, { quintain: M.practice, arms: M.od.arms }); $('rwhatYou').textContent = plain(p, C.pL, true)[0]; $('replayYou').classList.remove('hidden'); }
  if (o && !M.practice) { drawHitMap($('rhitHim'), o, C.oL.near, { arms: profile.arms }); $('rwhatHim').textContent = plain(o, C.oL, false)[0]; $('replayHim').classList.remove('hidden'); }
  if (C.resultArgs && !M.practice) C.colourLater = true; else replayColour();      // exactly one colour line, ~1.5 s in (no more if you watch it again); after Hugh's call if that is still to come
}
function replayTag() { const vb = $('rplCtl').querySelector('button[data-k="view"]'); if (vb) vb.textContent = `VIEW · ${ANGLES[R.shot]}`; $('replayTag').textContent = `${R.hl ? 'COURSE ' + R.course : R.passes.length > 1 ? `REPLAY ${R.pass + 1}/${R.passes.length}` : 'INSTANT REPLAY'} · ${ANGLES[R.shot]} · ${R.pause ? 'PAUSED · ' : ''}${spdTxt(R.spd)}`; }
/** Everything that shows the replay's state: the tag, the key hints and the control bar. */
function rplSync() {
  if (!R) return; replayTag();
  const k = (c, t) => `<kbd>${c}</kbd> ${t}`;
  $('replayKeys').innerHTML = touchMode ? '' : [k('V', 'angle'), R.hl ? k('SPACE', R.pause ? 'play' : 'pause') : k('SPACE', 'skip'), '<kbd>1</kbd>–<kbd>4</kbd> speed', k(',</kbd><kbd>.', 'step'), R.hl ? k('←</kbd><kbd>→', 'scrub') : '', R.shot === 8 ? k('WASD', 'move') + ' ' + k('SHIFT', 'faster') + ' ' + k('R', 'reset') : 'drag: free camera', k('ESC', R.hl ? 'back' : 'menu')].filter(Boolean).join(' &nbsp;&nbsp; ');
  for (const b of $('rplCtl').querySelectorAll('button[data-s]')) b.classList.toggle('on', +b.dataset.s === R.spd);
  $('rplPause').textContent = R.pause ? 'PLAY' : 'PAUSE'; $('rplPause').classList.toggle('on', !!R.pause);
}
/** Set the playback speed (1, 0.5, 0.25 or 0.1 of the replay's own pace). */
function rplSpeed(v) { if (!R) return; R.spd = v; rplSync(); }
/** One frame (1/60 s of the recording) forward or back; pauses first. */
function rplStep(n) {
  if (!R) return; R.pause = true;
  const t = R.t + n / 60;
  if (n < 0) replaySeek(t); else { R.t = Math.min(t, R.hl ? R.t1 : R.t1 - 1e-3); R.stepFx = n / 60; }
  rplSync();
}
function rplPause(v) { if (!R) return; R.pause = v ?? !R.pause; rplSync(); }
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
  const L = viewList(); R.shot = L[(L.indexOf(R.shot) + 1) % L.length]; R.cut = true; if (R.hl) S.rplShot = R.shot; rplSync();
}
/** The free camera: it orbits a centre (the impact point to start with) at a distance; WASD move the centre, the mouse and the wheel turn and zoom. */
function freeInit(fromCam) {
  const h = R.hits && R.hits[0], c = h ? new THREE.Vector3(...h.tip) : new THREE.Vector3(0, 1.9 + (seatDy(player) + seatDy(opp)) / 2, R.z);
  R.free = { c0: c.clone(), c, yaw: Math.atan2(R.side * 0.93, -R.pd * 0.36), pitch: 0.12, dist: 6.5 };
  if (fromCam) { const v = camPos.clone().sub(c), d = v.length(); if (d > 0.5) { R.free.dist = clamp(d, 1.2, 30); R.free.pitch = clamp(Math.asin(clamp(v.y / d, -1, 1)), -0.1, 1.4); R.free.yaw = Math.atan2(v.x, v.z); } }
}
function freeOrbit(dx, dy) {
  if (!R) return; if (R.shot !== 8) { R.shot = 8; R.cut = false; freeInit(true); if (R.hl) S.rplShot = 8; rplSync(); }
  const f = R.free; f.yaw -= dx * 0.006; f.pitch = clamp(f.pitch + dy * 0.005, -0.1, 1.4);
}
function freeZoom(k) {
  if (!R) return; if (R.shot !== 8) { R.shot = 8; R.cut = false; freeInit(true); if (R.hl) S.rplShot = 8; rplSync(); }
  R.free.dist = clamp(R.free.dist * k, 1.2, 30);
}
function freeMove(dt) {
  const f = R.free, m = R.mv; if (!f || !m) return;
  const fw = (m.w ? 1 : 0) - (m.s ? 1 : 0), rt = (m.d ? 1 : 0) - (m.a ? 1 : 0), up = (m.e ? 1 : 0) - (m.q ? 1 : 0), sp = 5 * dt * (0.5 + f.dist / 8) * (freeMods.fast ? 3 : 1) * (freeMods.slow ? 0.33 : 1);
  f.c.x += (-Math.sin(f.yaw) * fw + Math.cos(f.yaw) * rt) * sp; f.c.z += (-Math.cos(f.yaw) * fw - Math.sin(f.yaw) * rt) * sp; f.c.y = clamp(f.c.y + up * sp, 0.3, 8);
  f.c.x = clamp(f.c.x, -11, 11); f.c.z = clamp(f.c.z, -45, 45);
}
function updateReplay(dtReal, dt) {
  if (R.live) {      // his ride-out turn (and yours, until you take the rein) goes on in game time underneath: undress the riders, run the course's own logic, dress them again later in the frame
    replayUndress(); const m = S.mode; S.mode = R.back; updateRide(dt, dtReal); S.mode = m;
  }
  const sp = R.spd || 1;
  if (R.hl) {
    if (!R.pause) { R.t += dtReal * sp; if (R.t >= R.t1) replaySeek(R.t0); }
    R.fxDt = R.pause ? 0 : dtReal * sp;
  } else {
    const P = R.passes[R.pass]; R.rate = passSpeed(P, R.t - R.tImp) * sp; if (R.pause) R.rate = 0;
    R.t += dtReal * R.rate; R.fxDt = dtReal * R.rate;
    if (R.t >= P.t1) { if (R.pass < R.passes.length - 1) setPass(R.pass + 1); else endReplay(); }
  }
  if (R && R.stepFx) { R.fxDt = R.stepFx; R.stepFx = 0; }      // a single frame step: the effects move on by that frame too
  if (R && R.shot === 8 && R.free) freeMove(dtReal);
  if (R) seekSync();
}
/** The timeline slider: spans the pass (automatic replay) or the whole recording (highlight), follows R.t, a notch at the impact. */
let seekDrag = false;
function seekSync() {
  const sl = $('rplSeek'), span = Math.max(1e-3, R.t1 - R.t0);
  if (sl.dataset.t0 !== String(R.t0) || sl.dataset.t1 !== String(R.t1)) { sl.dataset.t0 = R.t0; sl.dataset.t1 = R.t1; sl.min = R.t0; sl.max = R.t1; const n = (R.tImp - R.t0) / span; $('rplNotch').style.display = n >= 0 && n <= 1 ? '' : 'none'; $('rplNotch').style.left = `${9 + n * (sl.clientWidth - 18)}px`; }
  if (!seekDrag) sl.value = R.t;
}
$('rplSeek').addEventListener('input', (e) => {
  if (!R) return; seekDrag = true; R.pause = true; const t = +e.target.value;
  if (t < R.t) replaySeek(t); else R.t = Math.min(t, R.hl ? R.t1 : R.t1 - 1e-3);      // backwards rewinds the effects; forwards lets the recorded effects catch up on the next frame
  rplSync();
});
$('rplSeek').addEventListener('pointerdown', (e) => e.stopPropagation());
$('rplSeek').addEventListener('change', (e) => { seekDrag = false; e.target.blur(); });      // (a focused slider would swallow the arrow keys)
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
  while (R.e < R.ev.length && R.ev[R.e].t <= t) { const e = R.ev[R.e++]; if (e.k === 'lb') fx.lanceBurst(e.o); else if (e.k === 'spl') fx.splinters(e.a, e.b, e.v, e.n); else if (e.k === 'sh') fx.shaft(e.a, e.b, e.v); else if (e.k === 'pc') fx.piece(e.p, e.q, e.sx, e.sy, e.sz, e.v); else fx.sparks(e.p, e.n, e.s); }
  fx.update(R.fxDt);
}
function replayUndress() {
  if (!R || !R.dressed) return; R.dressed = false;
  player.applySnap(R.liveP); opp.applySnap(R.liveO); player.raiseT = R.lr[0]; opp.raiseT = R.lr[1]; player.replaying = opp.replaying = false;
}
/** The replay cameras, each a function of the recorded frame (R.sp, R.so: you and he at replay time R.t). */
function replayCam() {
  const sp = R.sp, so = R.so, D = R.pd, sd = R.side, z0 = R.z, u = clamp((R.t - (R.tImp - 1)) / 2, 0, 1), mx = (sp.px + so.px) / 2, mz = (sp.pz + so.pz) / 2;
  const dP = seatDy(player), dO = seatDy(opp), dM = (dP + dO) / 2;      // camera heights follow the saddles
  switch (R.shot) {
    case 1: {      // CHASE: tight behind your rider, looking down the lists at the man coming in
      const fx = Math.sin(sp.ry), fz = Math.cos(sp.ry);
      want.set(sp.px - fx * 3.3 + sd * 0.55, 2.3 + dP, sp.pz - fz * 3.3); wantLook.set(lerp(sp.px, so.px, 0.4) + fx * 5, 1.8 + dP, sp.pz + fz * 9); return 52;
    }
    case 2: {      // REVERSE: behind the opponent, looking at you come in
      const fx = Math.sin(so.ry), fz = Math.cos(so.ry), s = smoothstep(R.tImp - 0.3, R.tImp + 0.2, R.t);
      want.set(so.px - fx * 4.6 - sd * 0.5, 2.5 + dO, so.pz - fz * 4.6); wantLook.set(lerp(sp.px, mx, s), 1.85 + dP, lerp(sp.pz, mz, s)); return 46;
    }
    case 3: want.set(sd * 3.2, 6.8 + 3.2 * u, z0 - D * (16 - 6 * u)); wantLook.set(0, 1.3, mz); return 40;      // CRANE: high, down the tilt as they meet
    case 4: want.set(sd * 4.6, 2.15 + dM, z0 - D * 0.5); wantLook.set(-sd * 0.1, 1.9 + dM, lerp(z0, mz, 0.6)); return 29 - 7 * u;      // IMPACT: helm and shield level, a long lens
    case 5: { const F = R.fall; want.set(F.x + R.fx0 * 2.3, Math.max(0.9, F.y + 0.7), F.z - R.fdir * 3.4 + R.fdir * u * 0.8); wantLook.set(F.x, Math.max(0.35, F.y * 0.6), F.z); return 38; }
    case 6: case 7: {      // YOUR EYES / HIS EYES: through the visor slit, as the live first-person view sees it, looking at the man coming in
      const me = R.shot === 6 ? player : opp, ot = R.shot === 6 ? opp : player;
      me.helm.getWorldPosition(want); want.y += me.eyeY ?? 0.17; const fw = _a.set(0, 0, 1).applyQuaternion(me.root.quaternion); want.addScaledVector(fw, 0.05);
      ot.helm.getWorldPosition(_b); _b.y -= 0.05; _c.subVectors(_b, want); const ahead = _c.dot(fw), k = smoothstep(0.5, 5, ahead);
      const a0 = Math.atan2(fw.x, fw.z), sgn = Math.abs(Math.sin(a0 + 0.22) * 20 + want.x) < Math.abs(Math.sin(a0 - 0.22) * 20 + want.x) ? 1 : -1;      // the glance down the lists leans toward the tilt, as in the live view
      _d.set(want.x + Math.sin(a0 + sgn * 0.22) * 20, want.y - 0.3, want.z + Math.cos(a0 + sgn * 0.22) * 20);
      wantLook.lerpVectors(_d, _b, k); return 68;
    }
    case 8: {      // FREE: orbiting the impact point, kept above the ground and out of the stands
      if (!R.free) freeInit(false);
      const f = R.free, cp = Math.cos(f.pitch);
      want.set(f.c.x + Math.sin(f.yaw) * cp * f.dist, f.c.y + Math.sin(f.pitch) * f.dist, f.c.z + Math.cos(f.yaw) * cp * f.dist);
      want.x = clamp(want.x, -11.6, 11.6); want.z = clamp(want.z, -48, 48); want.y = clamp(want.y, 0.45, 16);
      wantLook.copy(f.c); return 42;
    }
    default: want.set(sd * (7.4 - u * 1.2), 2.0 + dM, z0 - D * (2.6 - u * 2.2)); wantLook.set(-sd * 0.2, 1.95 + dM, z0 + D * u * 0.6); return 34;      // LOW SIDE at the tilt
  }
}
/** Dents, shield marks and the plume as they were at replay time t of the given course (nothing before its blow). */
function showMarks(t, course) { const k = (course ?? M.course) * 1000 + t; player.showDamage(k); if (opp.showDamage) opp.showDamage(k); }
/** Leaving a replay: the helms are shown again and the visor mask goes. */
function rplFpOff() { if (player) player.helm.visible = true; if (opp && opp.helm) opp.helm.visible = true; $('helmMask').style.display = 'none'; }
function hideReplayUi() { for (const id of ['replayTag', 'replayKeys', 'replayYou', 'replayHim', 'hlBack', 'rplCtl']) $(id).classList.add('hidden'); }
function endReplay() {
  if (!R) return;
  if (R.hl) { closeHL(); return; }
  if (R.live) replayUndress(); else { player.applySnap(R.liveP); opp.applySnap(R.liveO); }
  showMarks(Infinity);
  player.replaying = opp.replaying = false; player.update(0); opp.update(0); rplFpOff();
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
const recList = () => { if (M && C && S.mode === 'after' && C.rec && !C.rec.p && C.pL.res) recMeta(); return recListRaw(); };
const recListRaw = () => (M && M.recs ? M.recs : []).map((r, i) => [r, i]).filter(([r]) => r.p && r.f.length > 8);

// ---- highlights: a recorded course played from the pause menu or the end-of-match card, full speed, from any angle. The match state is untouched (the riders are put back on leaving).
function openHL(idx, shot) {
  const rec = M && M.recs && M.recs[idx]; if (!rec || !rec.p || rec.f.length < 8 || !player || !opp) return;
  if (R && !R.hl) endReplay();
  const f = rec.f, old = R && R.hl ? R : null;      // (another course picked while a highlight plays keeps the real poses saved by the first)
  R = { f, ev: rec.ev, tImp: rec.tImp, i: 0, e: 0, liveP: old ? old.liveP : player.snapshot(), liveO: old ? old.liveO : opp.snapshot(), back: old ? old.back : S.mode, live: false, hl: true, course: rec.n, pause: false, shot: shot ?? S.rplShot ?? 0, fxDt: 0, rate: 1, spd: old ? old.spd : 1, hits: rec.hits, vis: old ? old.vis : ['hud', 'verdict', 'royalCap'].filter(id => !$(id).classList.contains('hidden')) };
  replayGeom(); R.t0 = Math.max(f[0].t, R.tImp - 3.2); R.t1 = f[f.length - 1].t; replaySeek(R.t0); R.cut = true; S.rplShot = R.shot;
  player.replaying = opp.replaying = true; fx.clear();
  S.mode = 'replay'; S.hl = true; document.body.classList.add('rpl-open');
  for (const id of ['hud', 'verdict', 'royalCap', 'replayYou', 'replayHim', 'pmenu', 'banner']) $(id).classList.add('hidden');
  $('replayTag').classList.remove('hidden'); $('replayKeys').classList.remove('hidden'); $('hlBack').classList.remove('hidden'); $('rplCtl').classList.remove('hidden'); if (!viewList().includes(R.shot)) R.shot = 0; rplSync();
}
const hlKeys = rplSync;
function closeHL() {
  if (!R || !R.hl) return;
  showMarks(Infinity); player.applySnap(R.liveP); opp.applySnap(R.liveO); player.replaying = opp.replaying = false; player.update(0); opp.update(0); rplFpOff();
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
  el.innerHTML = `<h3>REPLAYS</h3>` + (L.length ? `<div class="rlist">` + L.map(([r, i], n) => `<div class="rrow${i === S.rplSel ? ' sel' : ''}" data-i="${i}"><span class="rt">${touchMode ? '' : `<kbd>${n + 1}</kbd>`}${recTitle(r)}</span><span class="ra">${viewList().map((j) => `<button data-i="${i}" data-a="${j}">${ANGLES[j]}</button>`).join('')}</span></div>`).join('') + `</div>` : `<p class="rnone">No course has been ridden yet.</p>`)
    + `<div class="rfoot">${touchMode ? '' : '<span><kbd>1</kbd>–<kbd>9</kbd> play &nbsp; <kbd>V</kbd> angle &nbsp; <kbd>SPACE</kbd> pause &nbsp; <kbd>←</kbd><kbd>→</kbd> scrub</span>'}<button class="btn" id="pmBack">Back</button></div>`;
  $('pmenu').classList.remove('hidden'); $('pmMain').classList.add('hidden'); el.classList.remove('hidden'); $('banner').classList.add('hidden'); $('card').classList.add('hidden'); document.body.classList.add('rpl-open');
}
function openReplays(from) {
  if (!M || !player) return;
  if (R && !R.hl) endReplay();      // a replay that was playing (and paused) gives way to the list
  S.rpl = true; S.rplFrom = from;
  if (from === 'card') S.paused = true;
  showReplayList();
}
function showPauseMain() {
  $('pmenu').classList.remove('hidden'); $('pmMain').classList.remove('hidden'); $('pmList').classList.add('hidden'); $('banner').classList.add('hidden');
  const fs = $('pmFs'); fs.classList.toggle('hidden', !document.fullscreenEnabled); fs.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  pzSync();
}
function closeReplays() {
  S.rpl = false; document.body.classList.remove('rpl-open'); $('pmList').classList.add('hidden'); $('pmenu').classList.add('hidden');
  if (S.rplFrom === 'card') { S.paused = false; $('card').classList.remove('hidden'); } else showPauseMain();
}

function advance() {
  if (M && M.spec) return;      // (a watched bout is left by holding Space, the button, or the pause menu)
  if (R && R.hl) { replayView(); return; }      // a tap (or a click) in a highlight: the next angle
  if (S.paused) return;
  if (celCamOn()) { celSkip(); return; }      // Space / a tap: end the celebration and its cam
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
  celStop(); ceremony.skipUI(false);
  if (S.spec) specClear();
  if (S.online && !keepLink) netLeave();
  if (world && world.setTilt) world.setTilt(true);
  for (const id of ['card', 'hud', 'verdict', 'lesson', 'royalCap', 'replayTag', 'replayKeys', 'replayYou', 'replayHim']) $(id).classList.add('hidden');
  $('helmMask').style.display = 'none'; $('flashTxt').className = '';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  voice.reset(); speech.hide(); $('ticker').classList.remove('on'); $('ticker').textContent = ''; strikeCall = null; S.yieldAsk = false; $('yieldAsk').classList.add('hidden');
  if (R) { player.replaying = false; R = null; }
  S.hl = false; S.rpl = false; S.paused = false; S.pmSet = false; pzClear(); $('screen').classList.remove('on'); document.body.classList.remove('rpl-open'); for (const id of ['pmenu', 'pmList', 'hlBack']) $(id).classList.add('hidden');
  if (world && world.crowd && world.crowd.spotlight) world.crowd.spotlight(-1);
  field.clear(); ceremony.clear(); flagmen.clear(); judges.clear(); life.clear(); speech.hide(); disposeRider(opp); opp = null; M = null; C = null; S.mode = 'menu'; S.timeScale = 1; fx.clear();
  rebuildPlayer();
  if (worldKey === -2) setVenue(Math.max(0, venueIdx));      // back from the training ground to the tournament venue
}

// ------------------------------------------------------------------ the career (src/career.js): knockout tournaments
function newTable() { return { round: 0, rows: [], results: [] }; }      // (the old league table, kept as an empty shell for older callers)
/** Your tournament match is over: move the draw on, say what it means on the card, and award the honour. */
function recordTournament() {
  const TO = M.tourn, won = M.result.startsWith('win'), r = career.recordMatch(profile, won, M.score, M.od.id); M.tres = r; if (!r) return;
  const V = M.V, line = (a, b) => `<div class="fact"><span>${a}</span><i></i><span>${b}</span></div>`;
  let head, note;
  if (r.head) { head = r.head; note = r.note; }      // a tournament event words its own card (src/tournament.js)
  else if (r.champion) { head = `YOU WIN THE TOURNAMENT`; note = `Champion of ${V.name}. The honour is yours.`; }
  else if (r.out) { head = `OUT IN THE ${TO.name.toUpperCase()}`; note = `The tournament at ${V.name} ends here. The winner is ${(career.knightById(profile.season.t.winner) || { short: 'another' }).short}.`; }
  else { head = `THROUGH TO THE ${r.next.toUpperCase()}`; note = `${TO.name} won. The draw moves on.`; }
  $('cardFacts').innerHTML += `<h6>${head}</h6><div class="led note"><span>${note}</span></div>`;
  $('cardHint').textContent = (touchMode ? 'TAP' : 'SPACE / CLICK') + (r.out || r.champion ? ' to leave the lists' : ' to see the roll');
  if (r.champion) {
    const lastV = TO.last, rb = rankOf(profile.renown);
    toast('HONOUR', `Champion of ${V.name}`, 6);
    if (lastV) showFeats(circuitFeat(profile));
    if (rankOf(profile.renown) > rb) announceRank(true);
  }
  saveProfile();
}

// ------------------------------------------------------------------ watching the roll (src/tourney_screen.js: Watch Round)
// A bout of the roll played as a spectator: the knights a and b of one pair ride the real match engine (the same lists, strokes, falls and scoring as a match of yours), but nobody
// is yours. Knight a takes the player's side on the autopilot (his own skill sets how true his point is), knight b is the ordinary AI; both wear their own arms, horse and harness.
// The player's profile is never used or paid: it is snapshotted at the start of each bout and restored at its end (saveProfile does nothing meanwhile), so no gold, renown, feat,
// stat, bond or injury can leak out of it. The caller (tourney_screen.js) gets each bout's result through onBout and the end through onEnd.
// Controls: hold Space (or the screen on a phone) to skip the bout, the Skip all button to leave all that is left, Esc for the pause menu (Stop watching).
const specKnight = (id) => KNIGHTS.find(k => k.id === id) || FIELD.find(k => k.id === id) || null;
const SPEC_INTRO = 4.6, SPEC_RESULT = 3.2;      // seconds: the short opening; the result beat after the winner's moment
const SPEC_BOOTH = /^(welcome|venue|knight|mode|exclaim|away|charge|ready|filler|history|after\.(bothBreak|bothMiss|attaint)|momentum\.(level|lastCourse|extra))/;      // the pools that never say "you" (and Pell's recorded turns only: booth.watch)
let specRun = null, specSnap = null, specBtn = null, specDefer = null;
const SC = { shot: '', t: 0, z: undefined, mz: 0, on: null };

/** Start watching: cfg = { v, mode, courses, label, pairs: [{ a, b, ref }], onBout(pair, res | null), onEnd('done' | 'skipall' | 'leave') }. res = { w, sc: [a's, b's], result } is what the bout really decided. */
function startSpectate(cfg) {
  if (M || specRun || !cfg || !cfg.pairs || !cfg.pairs.length) return false;
  specRun = { cfg, i: 0 }; specNext(); return true;
}
function specNext() {
  const r = specRun, pr = r.cfg.pairs[r.i];
  startMatch(r.cfg.v, pr.b, false, false, r.cfg.mode || null, r.cfg.courses || 3, null, false, { a: pr.a, b: pr.b, i: r.i, n: r.cfg.pairs.length, label: r.cfg.label || '' });
}
function specBegin() {      // the bout's start: the profile is put by, the Skip all button shows
  specSnap = JSON.stringify(profile);
  if (!specBtn) {
    specBtn = document.createElement('button'); specBtn.id = 'specSkipAll'; specBtn.className = 'btn'; specBtn.textContent = 'Skip all'; specBtn.title = 'Leave the rest of the round: every remaining result is read at once';
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) specBtn.addEventListener(ev, (e) => e.stopPropagation());
    specBtn.addEventListener('click', (e) => { e.stopPropagation(); specSkipAll(); });
    document.body.appendChild(specBtn);
  }
  specBtn.style.display = 'block';
}
function specRestore() {      // the profile as it was before the bout, in place (everyone holds the same object)
  if (!specSnap) return;
  try { const o = JSON.parse(specSnap); for (const k of Object.keys(profile)) delete profile[k]; Object.assign(profile, o); } catch (e) { /* keep what there is */ }
  specSnap = null;
}
function specClear() {      // (endMatch) the watched bout's screen furniture goes
  S.spec = false; document.body.classList.remove('spec'); booth.watch(false); if (specBtn) specBtn.style.display = 'none'; $('pmLeave').textContent = 'Leave the lists'; $('pmRide').innerHTML = 'Ride on <kbd>Esc</kbd>'; $('banner').classList.add('hidden'); ceremony.skipUI(false);
}
/** What the bout decided, from knight a's side (null if it was not decided: the roll keeps its drawn result). */
function specResultOf() {
  if (!M || !M.spec || !M.result || !/^(win|loss)/.test(M.result)) return null;
  const pr = specRun.cfg.pairs[specRun.i];
  return { w: M.result.startsWith('win') ? pr.a : pr.b, sc: [M.score[0], M.score[1]], result: M.result };
}
/** The bout is over (played out, or skipped): the profile is restored, the match torn down, the caller told, and the next pair begins. Always run from the frame's start (specDefer): never from inside a ride. */
function specFinishBout() {
  const run = specRun; if (!run || !M) return;
  const pr = run.cfg.pairs[run.i], res = specResultOf();
  specRestore(); endMatch();
  try { run.cfg.onBout(pr, res); } catch (e) { console.error(e); }
  run.i++;
  if (run.i < run.cfg.pairs.length && specRun === run) specNext(); else { specRun = null; try { run.cfg.onEnd('done'); } catch (e) { console.error(e); } }
}
function specStop(reason) {      // leave now: 'skipall' (every remaining result is read) or 'leave' (stop watching, the round stays open)
  const run = specRun; if (!run || !M) return;
  const pr = run.cfg.pairs[run.i], res = reason === 'skipall' ? specResultOf() : null;
  specRun = null; specRestore(); endMatch();
  try { if (res) run.cfg.onBout(pr, res); run.cfg.onEnd(reason); } catch (e) { console.error(e); }
}
function specSkipAll() { if (M && M.spec && !specDefer) specDefer = () => specStop('skipall'); }
function specLeave() { if (M && M.spec) specStop('leave'); }
/** Every frame of a watched bout: the hold-to-skip ring and its count. */
function specTick(dtReal) {
  if (S.mode === 'ready' && C && C.rd.sig && !S.paused) startCharge();      // (nobody to spur: the knights go at the marshal's signal)
  S.skipHold = skipKey ? S.skipHold + dtReal : Math.max(0, S.skipHold - dtReal * 2.5);
  ceremony.skipUI(!S.paused, S.skipHold / SKIP_HOLD, touchMode ? 'Hold the screen to skip this bout' : 'Hold <kbd>SPACE</kbd> to skip this bout');
  if (S.skipHold >= SKIP_HOLD && !specDefer) { S.skipHold = 0; skipKey = false; specDefer = () => specFinishBout(); }
}
/** The decided bout: the winner's moment (the celebration and its camera), then a short result beat. */
function specResult(dtReal) {
  const res = M.result, aWon = res.startsWith('win');
  C.specT = (C.specT || 0) + dtReal;
  if (!C.celMDone) { C.celMDone = true; const w = aWon ? player : opp; if (!M.void) celMatch(w, aWon ? opp : player); }
  if (celBusy() && C.specT < 8) return;
  celStop();
  if (!C.specShown) {
    C.specShown = true; C.specT = 0; fanfare('short');
    const wn = (aWon ? M.specA : M.od), ln = aWon ? M.od : M.specA, hi = Math.max(M.score[0], M.score[1]), lo = Math.min(M.score[0], M.score[1]);
    $('bannerTop').textContent = 'THE BOUT IS DECIDED'; $('bannerMain').textContent = `${wn.short} wins`; $('bannerSub').innerHTML = `${wn.name.replace(/, ".*"/, '')} over ${ln.name.replace(/, ".*"/, '')} &nbsp;·&nbsp; ${hi} credits to ${lo}`; $('banner').classList.remove('hidden');
    ceremony.hideCard();
  }
  if (C.specT > SPEC_RESULT && !specDefer) specDefer = () => specFinishBout();
}
/** A course's autopilot and camera plan: the knight's aim, and which shot follows the charge. */
function specCourse() {
  const K = M.specA;
  C.pa = { zone: Math.random() < K.skill * 0.3 ? 'helm' : Math.random() < 0.75 ? 'shield' : 'body', bias: new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5), seed: Math.random() * 50, brace: Math.random() < lerp(0.25, 0.9, K.skill), pt: new THREE.Vector3() };
  let sh = G.specShot || 'chase'; M.lastShot = sh;      // (only down-the-lists views: from behind a knight or from behind the end, so both riders are always in frame)
  C.shot = sh; C.side = Math.random() < 0.5 ? -1 : 1; C.shotWho = G.specWho ?? (Math.floor(M.course / 2) % 2); C.flip = Math.random() < 0.5 ? -1 : 1;
}
/** The first words on the screen: the two names and the roll's round. */
function specIntroBanner(V, mode) {
  const S2 = M.spec, a = M.specA, b = M.od, nm = (k) => k.name.replace(/, ".*"/, '');
  $('bannerTop').textContent = `${V.city.toUpperCase()} · ANNO ${V.year} · ${(S2.label || 'THE ROLL').toUpperCase()}${S2.n > 1 ? ` · BOUT ${S2.i + 1} OF ${S2.n}` : ''}`;
  $('bannerMain').textContent = V.name; $('bannerSub').innerHTML = `${nm(a)} &nbsp;against&nbsp; ${nm(b)}<div id="tape"><div><b>${ovr(a)}</b>${HORSES[a.horse].name} · ${a.land}<small>${ARMOURS[a.armour].name.toUpperCase()}</small></div><div><b>${ovr(b)}</b>${HORSES[b.horse].name} · ${b.land}<small>${ARMOURS[b.armour].name.toUpperCase()}</small></div></div>`;
  $('venueInfo').textContent = `${V.name.toUpperCase()} · ${(S2.label || 'THE ROLL').toUpperCase()} · WATCHING${S2.n > 1 ? ` · BOUT ${S2.i + 1} OF ${S2.n}` : ''}`;
}
function boothOpenSpec() {
  const a = M.specA, b = M.od, ag = [`venue.${M.V.id}`, `mode.${M.mode.id}`, poolAt(`knight.${b.id}`) ? `knight.${b.id}` : null, poolAt(`knight.${a.id}`) ? `knight.${a.id}` : null, 'history'].filter(Boolean);
  booth.watch(true, SPEC_BOOTH); booth.setAgenda(ag); booth.say('welcome', { delay: 0.6, ttl: 9, prio: 2.5 });
}
/** The booth after a stroke of a watched bout: only what holds for either man (both broke, both missed, a touch); the falls and the breaks are called by the exclamations. */
function boothAfterSpec(cy, ch) {
  const k = cy === 'unhorse' || ch === 'unhorse' || cy === 'foul' || ch === 'foul' ? null : brkCat(cy) && brkCat(ch) ? 'bothBreak' : cy === 'miss' && ch === 'miss' ? 'bothMiss' : !brkCat(cy) && !brkCat(ch) && (cy === 'attaint' || ch === 'attaint') ? 'attaint' : null;
  if (k) booth.say('after.' + k, { delay: 0.8, ttl: 14, prio: 4 });
  if (!M.result && M.score[0] === M.score[1] && Math.random() < 0.6) booth.say('momentum.level', { delay: 3.5, ttl: 14, prio: 3, when: () => !!C && S.mode !== 'charge' });
}
/** The opening: slow orbits of the two knights at their ends. */
function specIntroCam(want, look) {
  const t = S.introT, on = t < SPEC_INTRO / 2 ? opp : player, tt = on === opp ? t : t - SPEC_INTRO / 2, a = tt * 0.3 - 0.95, dd = on.dir || -1, c = on.root.position, snap = SC.on !== on; SC.on = on;
  want.set(c.x + Math.sin(a) * 6.2 * dd, on.seatY - 0.05 + tt * 0.16, c.z + Math.cos(a) * 6.2 * dd); look.set(c.x, on.seatY + 0.05, c.z);
  return { fov: 40, snap };
}
/** The broadcast feed of a watched bout: behind a knight at his mark; then the course's shot (alongside, behind, low by the tilt, or the whole lists); cut to the meeting at the lances; the turn at the end. */
function specCam(dtReal, want, look) {
  const mid = (player.z + opp.z) / 2, gap = gapNow();
  let shot, snap = false;
  const who = C.shotWho || 0;
  if (S.mode === 'ready') shot = 'salute';
  else if (S.mode === 'charge' && !C.pL.done && !C.oL.done) shot = C.shot === 'wide' && gap < 10 ? 'impact' : C.shot || 'chase';
  else if (S.mode === 'after' && C.afterT < 1.7) shot = 'impact';
  else shot = 'turn';
  if (shot !== SC.shot) { SC.shot = shot; SC.t = 0; SC.z = undefined; snap = true; }
  SC.t += dtReal; SC.mz = damp(SC.mz, mid, 6, dtReal);
  const R = who ? opp : player, d = R.dir || 1, o = Math.sign(R.root.position.x) || 1, s = C.side || 1;
  const u = clamp(SC.t / 7, 0, 1); let fov = 40, rate = 5;
  switch (shot) {
    case 'salute': { const j = R, dj = j.dir || 1, oj = Math.sign(j.root.position.x) || 1; want.set(j.root.position.x + oj * 2.5, 1.95, j.z - dj * 4.8); look.set(0, 1.55, j.z + dj * 13); fov = 36; rate = 6; break; }
    case 'wide': want.set(s * 2.4, 4.2 - 0.6 * u, -(START_Z + 9) * d); look.set(0, 1.2, mid * 0.5 + 6 * d); fov = 44; rate = 6; break;
    case 'chase': { SC.z = damp(SC.z ?? R.z - d * 6, R.z - d * 6, 5, dtReal); const X = R === player ? opp : player; want.set(R.root.position.x + o * 2.8, 3.0, SC.z); look.set(lerp(R.root.position.x, X.root.position.x, 1), 1.5, lerp(R.z, X.z, 0.6)); fov = 40; rate = 9; break; }      // (a little outside his lane and looking between the two: the far rider is never hidden behind the near one)
    case 'skim': if (SC.z === undefined) { SC.z = clamp(mid, -14, 14) - d * 10.5; SC.sx = o * 3.3; } want.set(SC.sx, 0.5, SC.z); look.set(0, 1.3, SC.z + d * 9.5); fov = 42; rate = 9; break;
    case 'track': SC.z = damp(SC.z ?? R.z, R.z + d * 1.5, 4, dtReal); want.set(R.root.position.x + o * 4.8, 1.6, SC.z); look.set(-o * 0.6, 1.5, SC.z + d * 1.2); fov = 36; rate = 9; break;
    case 'impact': { const mz = C.meet ? C.meet.z : clamp(SC.mz, -14, 14), ang = 0.15 + 0.7 * clamp(SC.t / 4, 0, 1) * (C.flip || 1); want.set(s * 7.0, 1.9 + 0.3 * clamp(SC.t / 4, 0, 1), mz - 1.2 + Math.sin(ang) * 2.4); look.set(0, 1.7, mz); fov = 46; rate = 10; break; }
    default: { const e = (player.dir || 1); want.set(s * 5.6, 2.2, e * (LIST_HALF - 8) - e * 2 * clamp(SC.t / 6, 0, 1)); look.set(0, 1.2, e * 40); fov = 42; rate = 4; }
  }
  return { fov, rate, snap };
}

// ------------------------------------------------------------------ autopilot (testing / demo)
/** 0 at the couch .. 1 at the meeting: both riders' aim yaw goes from the couch value to the one the target needs by the same rule (PHYS.aim), so the lances lie parallel in plan. */
const aimEaseOf = (gap) => smoothstep(0, 1, clamp((PHYS.aim.easeFar - gap) / (PHYS.aim.easeFar - PHYS.aim.easeNear), 0, 1));
function autoPilot(gap) {
  if (C.tier < 4 && C.t > 0.2 * (C.tier + 1)) { C.tier++; C.maxTier = Math.max(C.maxTier, C.tier); C.flags['t' + C.tier] = true; if (C.tier === 4) C.galT = C.t; }
  if (M.spec && C.pa) {      // a watched knight: rides as the AI opponent does (his own skill sets how true his point is); the aim is a world point, not the mouse
    const P = C.pa, K = M.specA;
    C.couchHeld = gap < 36 && !C.pL.done;
    if (gap < 3.6 && C.braceCd <= 0 && P.brace) doBrace();
    opp.zoneWorld(P.zone, _a);
    const amp = lerp(0.5, 0.11, clamp(K.skill + DF().ai, 0, 1)) * (1 + 0.4 * clamp(1 - K.seat, 0, 1) * 0.5);
    _a.x += amp * (wobble(S.time * 1.7, P.seed) * 0.7 + P.bias.x * 0.9);
    _a.y += amp * (wobble(S.time * 2.1, P.seed + 9) * 0.7 + P.bias.y * 0.9);
    if (opp.hb) { let top = 0; for (const h of opp.hb) if (h.name === 'horseHead' || h.name === 'horseNeck') top = Math.max(top, h.c.ay + h.c.r, h.c.by + h.c.r); if (top > 0) _a.y = Math.max(_a.y, top + 0.12); }
    P.pt.copy(_a); return;
  }
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
const LOBBY = { find: null, mm: null, phase: 'choose', code: '', err: '', friend: null, room: { v: 0, m: 'planken', c: 5 }, pub: false, quick: false, qt: 0, fromList: false, rooms: [], relays: { open: 0, total: 0, failed: false }, watching: false, venueSet: false, pres: null, copied: false, invited: false, note: '' };
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
const netSend = (o, unreliable = false) => { if (NET.net) NET.net.send(o, unreliable); };
const lobbyShow = () => { syncAnnounce(); if (typeof menus !== 'undefined' && menus.root.classList.contains('on') && menus.root.dataset.name === 'online') menus.show('online'); };
// Presence ("3 knights in the lists", see src/lobby.js): announced while the Play Online screen or an online match is up, silent otherwise. A 1 s check follows the screen.
let presOn = '', presHooked = false;
const wantPresence = () => (M && S.online ? 'match' : typeof menus !== 'undefined' && menus.root.classList.contains('on') && menus.root.dataset.name === 'online' ? 'lobby' : '');
function syncPresence() {
  const w = wantPresence(); if (w === presOn) return; presOn = w;
  if (!w && !lobbyObj) return;
  lobbyApi().then((l) => {
    if (!presHooked) { presHooked = true; l.onPresence((p) => { LOBBY.pres = p; if (p && p.listening && lobbyAlone() && (LOBBY.phase === 'finding' || LOBBY.phase === 'quickLook')) { aloneSwitch(); return; } if (['choose', 'list', 'hostWait', 'hostReady', 'joined', 'friend'].includes(LOBBY.phase)) lobbyShow(); }); }
    l.present(wantPresence() || null); if (!wantPresence()) LOBBY.pres = null;
  }).catch((e) => console.warn('[presence]', e));
}
setInterval(syncPresence, 1000);
// ?join=CODE (an invite link): read once, take it out of the address bar, and join that room as soon as the menu is up (after the welcome page if he has no name yet).
let pendingJoin = '';
try { const q = new URLSearchParams(location.search), j = q.get('join'); if (j !== null) { const c = String(j).toUpperCase(); if (validCode(c)) pendingJoin = c; q.delete('join'); const qs = q.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } } catch (e) { /* ignore */ }
setInterval(() => {
  if (!pendingJoin || M || typeof menus === 'undefined' || !menus.root.classList.contains('on') || menus.root.dataset.name !== 'main') return;
  const c = pendingJoin; pendingJoin = '';
  signin.needsAccount().then((need) => { if (need) { signin.stashJoin(c); menus.show('online'); return; } lobbyOpen(); menus.show('online'); lobbyJoin(c, { invite: true }); });      // signed out and accounts exist: the Play Online gate first, the code waits in sessionStorage (src/signin.js)
}, 400);
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
window.addEventListener('pagehide', () => { if (lobbyObj) { lobbyObj.stop(); lobbyObj.present(null); } if (NET.net) { try { NET.net.send({ t: 'bye' }); } catch (e) { /* ignore */ } } });
const HOST_FAIL = "Couldn't reach the room server. Check your connection and try again.";
async function lobbyCreate(pub = false, quick = false, fixedCode = '') {
  netClose(); LOBBY.pub = !!pub; LOBBY.quick = !!quick; LOBBY.fromList = false; const my = NET.token; NET.host = true; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = ''; LOBBY.copied = false; LOBBY.phase = 'hostWait'; lobbyShow();
  for (let i = 0; i < 6; i++) {
    const n = NET.net = createNet(), code = fixedCode || makeCode(); netWire(n);
    try { await n.host(code); } catch (e) {
      if (my !== NET.token) return;
      n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e2) { /* ignore */ } NET.net = null;
      if (e && e.message === 'taken' && !fixedCode) continue;
      LOBBY.phase = 'failed'; LOBBY.err = HOST_FAIL; lobbyShow(); return;
    }
    if (my !== NET.token) return;
    LOBBY.code = code; lobbyShow(); return;
  }
  LOBBY.phase = 'failed'; LOBBY.err = HOST_FAIL; lobbyShow();
}
const INVITE_GONE = 'That joust has already begun or the host has left.';
/** The game's address with ?join=CODE (the origin and path only; ?net=local is kept because there it picks the transport). */
function inviteLink(code) {
  if (!validCode(code)) return '';
  return location.origin + location.pathname + '?join=' + code + (useLocal() ? '&net=local' : '');
}
/** Nobody else is in the lists (src/lobby.js presence): matchmaking has nobody to find, so only the invite link is offered. Unknown yet or relays down counts as alone. */
const lobbyAlone = () => { const P = LOBBY.pres; return !(P && P.listening && P.others > 0 && P.open); };
/** A search was running and the count dropped to just you: stop it and open the private room with its invite link. */
function aloneSwitch() {
  if (LOBBY.find || LOBBY.mm) mmCancel(); else { LOBBY.qt++; stopWatch(); netClose(); }
  lobbyCreate(false).then(() => { LOBBY.note = 'Nobody else is in the lists any more, so the search has stopped. Send your friend this link instead.'; lobbyShow(); });
  LOBBY.note = 'Nobody else is in the lists any more, so the search has stopped. Send your friend this link instead.';
}
/** "Copy invite link": the share sheet on a phone, else the clipboard. */
async function lobbyInvite(mode) {
  const url = inviteLink(LOBBY.code); if (!url) return;
  let done = false;
  if (mode !== 'copy' && touchMode && navigator.share) { try { await navigator.share({ title: 'Joust Revival', text: 'Join my joust:', url }); done = true; } catch (e) { if (e && e.name === 'AbortError') return; } }
  if (!done) {
    try { await navigator.clipboard.writeText(url); done = true; } catch (e) { /* fall through */ }
    if (!done) { const t = document.createElement('textarea'); t.value = url; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { done = document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); }
  }
  LOBBY.copied = done ? true : 'fail'; lobbyShow(); const code = LOBBY.code;
  setTimeout(() => { if (LOBBY.copied === true && LOBBY.code === code) { LOBBY.copied = false; lobbyShow(); } }, 3000);
}
async function lobbyJoin(raw, opts = {}) {
  const code = cleanCode(raw);
  if (!validCode(code)) { LOBBY.err = 'A room code is five letters.'; lobbyShow(); return false; }
  netClose(); const my = NET.token; NET.host = false; LOBBY.err = ''; LOBBY.friend = null; LOBBY.code = code; LOBBY.pub = false; LOBBY.invited = !!opts.invite; LOBBY.fromList = !!opts.listed || !!opts.quick || !!opts.invite; LOBBY.phase = opts.quick ? 'quickLook' : opts.mm ? 'mmConnect' : 'joining'; lobbyShow();
  const n = NET.net = createNet(); netWire(n);
  try { await n.join(code); } catch (e) {
    if (my !== NET.token) return false;
    n.onOpen = n.onMessage = n.onClose = null; try { n.close(); } catch (e2) { /* ignore */ } NET.net = null; clearInterval(NET.ka);
    const gone = e && e.message === 'notfound';
    if (opts.quick) { LOBBY.phase = 'quickLook'; lobbyShow(); return false; }
    if (opts.mm) return false;      // (Find match: the host may not be ready yet; the caller tries again)
    if (opts.invite) { LOBBY.phase = 'list'; LOBBY.err = gone ? INVITE_GONE : failText(e); startWatch(); lobbyShow(); return false; }
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
  if (LOBBY.find || (LOBBY.mm && !M)) { mmCancel(); return; }
  if (LOBBY.phase === 'choose') { lobbyLeave(); return; }
  const priv = LOBBY.phase === 'joinInput' || LOBBY.phase === 'joining' || (LOBBY.phase === 'joined' && !LOBBY.fromList) || ((LOBBY.phase === 'hostWait' || LOBBY.phase === 'hostReady' || LOBBY.phase === 'failed') && !LOBBY.quick && !LOBBY.pub);
  LOBBY.qt++; stopWatch(); netLeave(); LOBBY.friend = null; LOBBY.err = ''; LOBBY.quick = false; LOBBY.pub = false; LOBBY.fromList = false; LOBBY.note = ''; LOBBY.phase = priv && !lobbyAlone() ? 'friend' : 'choose'; lobbyShow();
}
function lobbySetPublic(b) { if (!NET.host || LOBBY.phase !== 'hostWait') return; LOBBY.pub = !!b; lobbyShow(); }
function lobbyOpen() {
  LOBBY.find = LOBBY.mm = null; LOBBY.note = '';
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
  if (LOBBY.mm && !LOBBY.mm.used) { LOBBY.mm.used = true; NET.mid = LOBBY.mm.matchId; LOBBY.room = { v: LOBBY.mm.venue, m: LOBBY.mm.mode, c: LOBBY.mm.courses }; return Object.assign(roomMsg('start'), { mid: NET.mid }); }      // Find match: the server chose the match id and the rules
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
  if (LOBBY.mm && !LOBBY.mm.used) { netClose(); LOBBY.friend = null; LOBBY.mm = null; LOBBY.phase = 'choose'; LOBBY.err = 'Your opponent left before the joust.'; lobbyShow(); return; }
  if (wasHost && (LOBBY.phase === 'hostReady')) { LOBBY.friend = null; LOBBY.phase = 'hostWait'; lobbyShow(); }      // the room stays open for another friend
  else if (!wasHost) {
    const filled = LOBBY.fromList && !LOBBY.friend;      // joined from the list and thrown out at once: somebody else got there first
    netClose(); LOBBY.friend = null;
    if (filled && LOBBY.quick) return;      // (Quick match carries on with the next room)
    if (filled) { LOBBY.phase = 'list'; LOBBY.err = LOBBY.invited ? INVITE_GONE : 'That room just filled'; startWatch(); }
    else if (LOBBY.fromList) { LOBBY.phase = 'list'; LOBBY.err = LOBBY.invited ? INVITE_GONE : 'The host has closed the room.'; startWatch(); }
    else { LOBBY.phase = 'joinInput'; LOBBY.err = 'The host has closed the room.'; }
    lobbyShow();
  }
}
function onNetMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (Array.isArray(m)) { if (M && S.online) { const st = cleanState(unpackState(m)); if (st) NET.remote.push(st); } return; }      // the rider-state stream (src/online.js packState): no JSON keys, no handler switch
  if (m.t === 'hi') {
    const f = cleanProfile(m); if (!f || M) return;
    if (LOBBY.mm && !LOBBY.mm.used && LOBBY.mm.opp && LOBBY.mm.opp.rid) f.rid = LOBBY.mm.opp.rid;      // Find match: the opponent's rank id is the server's, not what he says
    LOBBY.friend = f; friendLookup();
    if (NET.host) { LOBBY.phase = 'hostReady'; netSend(roomMsg()); if (LOBBY.mm && !LOBBY.mm.used) setTimeout(() => lobbyRide(), 1200); } else LOBBY.phase = 'joined';
    lobbyShow(); return;
  }
  if (m.t === 'rid') { if (LOBBY.friend && !LOBBY.friend.rid && !M && !LOBBY.mm) { LOBBY.friend.rid = HEX(m.rid, 16); friendLookup(); } return; }
  if (m.t === 'play') { const mid = HEX(m.mid, 32), sig = typeof m.sig === 'string' && m.sig.length < 200 ? m.sig : ''; if (mid && sig) NET.oppPlay = { mid, sig }; return; }
  if (!M && !NET.host) {
    if (m.t === 'room') { LOBBY.room = cleanRoom(m); if (!M) setVenue(LOBBY.room.v); lobbyShow(); return; }
    if (m.t === 'start' && LOBBY.friend) {
      if (LOBBY.mm && !LOBBY.mm.used) { LOBBY.mm.used = true; LOBBY.room = { v: LOBBY.mm.venue, m: LOBBY.mm.mode, c: LOBBY.mm.courses }; NET.mid = LOBBY.mm.matchId; }      // Find match: the server's match and rules, whatever the host says
      else { LOBBY.room = cleanRoom(m); NET.mid = HEX(m.mid, 32); }
      startOnlineMatch(); return;
    }
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
    case 'cel': { const id = cleanCel(m.id), md = m.md === 'm' ? 'match' : 'course'; if (id && celOn() && Math.abs((m.n | 0) - M.course) <= 1 && celOk(opp, id, md)) { celStart(opp, id, { mode: md, tgt: md === 'match' ? ROYAL_PT : null }); if (CELEBS[id].kind === 'win') celCheer(-1, md === 'match'); } break; }      // (cosmetic: the friend's celebration plays here too)
    case 'pz': if (NET.pz) NET.pz.receive(m, S.mode === 'charge' || !!M.result); break;
    case 'bye': netForfeit(); break;
    default: break;      // 'ka' and anything unknown
  }
}

/** The friend's rider, placed from his stream; his stroke quality and shield timing feed the host's strike code. */
function netDriveOpp(dt) {
  const s = NET.remote.step(dt, performance.now() / 1000); NET.rem = s;
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
  const latOk = C.lat < LAT_CLOSE ? 0.5 : C.lat <= LAT_WIDE ? 1 : clamp(1 - (C.lat - LAT_WIDE) / 1.2, 0, 1);
  const horse = clamp(0.4 * speedFrac + 0.25 * latOk + 0.15 * (1 - Math.min(1, Math.abs(C.latV) * 2.2)) + 0.2 * C.collected, 0, 1);
  const braced = C.braceT > 0, will = braced && C.braceAge < 0.45 ? 1 : braced ? 0.72 : 0.3;
  return 0.4 * lance + 0.35 * horse + 0.25 * will;
}
function netTick(dtReal) {
  const now = performance.now();
  if (NET.net && NET.lastRx && now - NET.lastRx > 12000) { netForfeit(); return; }
  if (!C || S.mode === 'intro' || !NET.net) return;
  if (now - NET.lastRx > 2500) { if (!NET.slowShown) { NET.slowShown = true; toast('Connection', 'Nothing from your opponent for a moment. Waiting for the link to recover...', 4); } } else NET.slowShown = false;
  // a fixed rate (SEND_HZ), kept by an accumulator so that 60 fps gives 30 Hz and not 20; a slow PC sends once per frame. Time stamps are the wall clock (not the game clock, which a slow frame rate slows down).
  NET.sendT += dtReal; const iv = 1 / SEND_HZ;
  if (NET.sendT < iv) return;
  NET.sendT = Math.min(NET.sendT - iv, iv);
  netSend(packState(packRider(player, { ts: Math.round(now) / 1000, n: M.course, md: S.mode[0], rP: C.rd.p ? 1 : 0, sq: Math.round(selfQ() * 100) / 100 })), true);
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
    if (seg) fxBurst(Aj, Bj, seg, _s2.set(0, 0.04, Aj.dir).normalize(), 0.4, m.hz === 'helm' ? 'helm' : 'body');
    Aj.lance.getWorldPosition(_a); const [d] = hear(_a); audio.lanceBreak(0.45, d, { cls: 0, zone: m.hz === 'helm' ? 'helm' : 'body' }); audio.impact(0.5, m.hs ? 'horse' : 'body', d);
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
  voice.mark('strike'); booth.mark();
  const power = clampNum(m.pw, 0, 3), velA = new THREE.Vector3(0, 0, Aj.dir * Aj.speed);
  Aj.tipWorld(_tip); const [hd, hpan] = hear(_tip);
  if (isP) C.tech = techSnapshot(zone, res.cent);
  const bdir = new THREE.Vector3(0, 0.04, Aj.dir).normalize(), IM = PHYS.impact, gl = !!(res.glanced || res.turned);
  S.shake = Math.max(S.shake, 0.12 + power * 0.3 + (res.broke ? [IM.crack, IM.clean, IM.shatter][breakClass(power)].shake * 0.4 : 0)); impactFeel(power, gl, bdir, zone); post.setImpact(clamp(0.35 + power * 0.6, 0, 1));
  $('flash').style.opacity = gl ? 0.15 : 0.35; setTimeout(() => { $('flash').style.opacity = 0; }, 60);
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
  const jd = Array.isArray(m.jd) && m.jd.length === 3 ? new THREE.Vector3(-clampNum(m.jd[0], -1, 1), clampNum(m.jd[1], -1, 1), -clampNum(m.jd[2], -1, 1)) : bdir.clone();      // the host's impulse direction, in our world
  if (jd.lengthSq() < 1e-6) jd.copy(bdir); jd.normalize();
  const Jh = clampNum(m.J, 0, 5000);
  Bj.hit(clampNum(m.hk, 0, 8), true, { dir: jd, pt: _tip.clone(), power, J: Jh, headMul: clampNum(m.hm, 0, 3), zone, lat: clampNum(m.hl, -1, 1) }); if (Aj.strikeKick) Aj.strikeKick(Jh > 0 ? Jh / refStroke().J : power, jd.clone().negate(), res.broke);
  if (typeof m.dv === 'number') { const dv = clampNum(m.dv, 0, 20); Bj.speed = Math.max(0, Bj.speed - dv); Aj.speed = Math.max(0, Aj.speed - dv * 0.5); }
  if (!isP) { arm.vy -= dirP() * 0.6 * PHYS.recoil.arm * power; arm.vp += PHYS.recoil.arm * power * (1 + PHYS.kit.lockKick * (M.kit.lock - 1)); }      // the shock through your own arm
  audio.impact(power, zone, hd); fxSparks(_tip.clone(), 10 + (power * 14 | 0), 4 + power * 3);
  { const sd = clampNum(m.sd, -2e9, 2e9) | 0, sinT = clampNum(m.st, 0, 1);
    if (res.broke && m.bk) {      // the same flex, break point and burst seed as the host's
      const at = clampNum(m.bk, 0.5, 3);
      Aj.bendLance({ kind: 'break', tb: clampNum(m.tb, 0, 0.2), load: clampNum(m.ld, 0, 20), seed: sd, onBreak: () => { const seg = Aj.breakLance(at); let cls = breakClass(power); if (seg) cls = fxBurst(Aj, Bj, seg, jd, power, zone, { seed: sd, sinT }); audio.lanceBreak(power, hd, { cls, zone }); } });
    } else if (!res.broke && typeof m.tc === 'number') Aj.bendLance({ kind: 'hold', tc: clampNum(m.tc, 0, 1), load: clampNum(m.ld, 0, 20), seed: sd }); }
  { const v3 = (a, s) => (Array.isArray(a) && a.length === 3 ? new THREE.Vector3(-clampNum(a[0], -s, s), clampNum(a[1], -s, s), -clampNum(a[2], -s, s)) : null);      // (the host's world, turned round)
    const cp = v3(m.cp, 300), cn = v3(m.cn, 1), part = typeof m.pn === 'string' ? partOf(Bj, m.pn) : null;
    if (cp && cn && part) { Aj.pinLance(part, cp, cn, v3(m.ct, 1) || new THREE.Vector3(), m.gl ? 'skid' : res.broke ? 'break' : 'hold'); Aj.applyLance(); } }
  const un = Array.isArray(m.un) && m.un.length >= 4 ? m.un.map(v => clampNum(v, -30, 30)) : null;
  if (un && res.unhorse) { horseStartle(Bj, clampNum(m.J, 0, 5000), clampNum(m.sd, -2e9, 2e9) | 0); Bj.onDetach = dropOnFall; Bj.unhorse(new THREE.Vector3(-un[0], un[1], -un[2]), un[3], un.length > 4 ? clampNum(un[4], 0.2, 0.8) : undefined, { style: un[5] ? 'side' : 'cantle', k: un.length > 6 ? clampNum(un[6], 0.5, 1.5) : 1 }); C.cine = Bj; }
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
  celCourse();
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
  M.forfeit = true; pzClear(); if (S.paused) setPaused(false);      // (a pause that stands ends with the link)
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
    const line = r.after === undefined ? 'unranked' : `${r.division}${r.provisional ? '?' : ''} · ${r.after} (${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)})`;
    $('cardSub').textContent += ' · ' + line + (r.gold ? ` · +${r.gold} coins` : '');
    if (r.gold && account.signedIn()) account.fetchMe();      // the purse the server paid for it
  }).catch(() => {});
}
// ------------------------------------------------------------------ Find match: the server's queue pairs two players (ranked needs a signed-in account), then the usual PeerJS room carries the match
/** LOBBY.find = the search (ticket, start time); LOBBY.mm = the match once made: { matchId, code, role, venue, mode, courses, ranked, opp:{name, division, rating, rid} }. */
async function lobbyFind(ranked) {
  netClose(); stopWatch(); const my = ++LOBBY.qt; NET.host = false; LOBBY.quick = LOBBY.pub = LOBBY.fromList = false; LOBBY.friend = null; LOBBY.code = ''; LOBBY.err = ''; LOBBY.mm = null;
  if (ranked && !account.signedIn()) { LOBBY.phase = 'choose'; LOBBY.err = 'Ranked play needs a signed-in account.'; lobbyShow(); return; }
  const f = LOBBY.find = { ranked: !!ranked, t0: performance.now(), ticket: '' }; LOBBY.phase = 'finding'; lobbyShow();
  await ranks.ensure().catch(() => null);      // (the rank key: unranked guests are matched on it too)
  if (LOBBY.qt !== my) return;
  const j = await account.mmJoin(ranked, profile.name);
  if (LOBBY.qt !== my) { if (j.ticket) account.mmLeave(j.ticket); return; }
  if (j.error) { LOBBY.find = null; LOBBY.phase = 'choose'; LOBBY.err = j.error; lobbyShow(); return; }
  f.ticket = j.ticket; let st = j;
  const iv = setInterval(() => { if (LOBBY.qt !== my) clearInterval(iv); else if (LOBBY.phase === 'finding') lobbyShow(); }, 1000);      // (the searching panel's clock)
  try {
    while (st.state !== 'matched') {
      if (st.state === 'gone') { LOBBY.find = null; LOBBY.phase = 'choose'; LOBBY.err = 'The queue lost your place. Try again.'; lobbyShow(); return; }
      if (performance.now() - f.t0 > 5 * 60000) { account.mmLeave(f.ticket); LOBBY.find = null; LOBBY.phase = 'choose'; LOBBY.err = 'No opponent found. Try again in a while.'; lobbyShow(); return; }
      await sleep(1500); if (LOBBY.qt !== my) return;
      const n = await account.mmPoll(f.ticket); if (n) st = n;      // (a lost poll is just asked again; the server forgets somebody silent for 15 s)
    }
  } finally { clearInterval(iv); }
  account.mmLeave(f.ticket); LOBBY.find = null;
  LOBBY.mm = st; LOBBY.phase = 'found'; lobbyShow();
  await sleep(2500); if (LOBBY.qt !== my) return;
  mmConnect(st, my);
}
/** Connect to the matched opponent: the host opens the room the server named, the guest joins it (trying again while the host is still opening it). */
async function mmConnect(m, my) {
  LOBBY.room = { v: m.venue, m: m.mode, c: m.courses }; LOBBY.venueSet = true; setVenue(m.venue);
  const t0 = performance.now(), dead = () => LOBBY.qt !== my || !LOBBY.mm || M || LOBBY.friend;
  const giveUp = (why) => { if (LOBBY.qt !== my || M) return; netClose(); LOBBY.mm = null; LOBBY.friend = null; LOBBY.phase = 'choose'; LOBBY.err = why; lobbyShow(); };
  if (m.role === 'host') { await lobbyCreate(false, false, m.code); if (LOBBY.qt !== my) return; }
  else {
    LOBBY.phase = 'mmConnect'; lobbyShow();
    while (!dead() && performance.now() - t0 < 25000) { if (await lobbyJoin(m.code, { mm: true })) break; await sleep(1500); }
    if (LOBBY.qt === my && !LOBBY.friend && !NET.net) return giveUp('Could not reach your opponent. Try again.');
  }
  for (let i = 0; i < 100 && !M && LOBBY.qt === my && LOBBY.mm; i++) await sleep(250);      // (until the joust begins)
  if (!M && LOBBY.qt === my && LOBBY.mm && !LOBBY.mm.used) giveUp('Your opponent did not connect. Try again.');
}
function mmCancel() {
  LOBBY.qt++; if (LOBBY.find && LOBBY.find.ticket) account.mmLeave(LOBBY.find.ticket);
  LOBBY.find = null; LOBBY.mm = null; netLeave(); LOBBY.friend = null; LOBBY.err = ''; LOBBY.code = ''; LOBBY.phase = 'choose'; lobbyShow();
}
// ------------------------------------------------------------------ the account (src/account.js)
/** A signed-in player's single-player match is over: tell the server how it ended, and show what it paid. The server decides every amount. */
async function spPaid(m, res, B) {
  const say = (html) => { const e = document.getElementById('acctReckon'); if (e) e.innerHTML = html; };
  const id = await m.spId;
  if (!id) return say(`<div class="led neg"><span>The server could not be reached: this match is not counted.</span></div>`);
  const c = (n) => Math.max(-99, Math.min(99, n | 0));
  const r = await account.spFinish(id, { result: res, score: B ? [c(B.wins), c(B.n - B.wins)] : [c(m.score[0]), c(m.score[1])], courses: B ? c(B.tot.courses) : Math.max(1, c(m.course)), broken: c(B ? B.tot.broken : m.breaks[0]), helms: c(B ? B.tot.helm : m.stats[0].helm) });
  if (!r.ok) return say(`<div class="led neg"><span>The marshals would not count this match (${String(r.error).replace(/[<>&]/g, '')}).</span></div>`);
  const rb = rankOf(profile.renown);
  if (r.wallet) { profile.gold = r.wallet.gold; profile.renown = r.wallet.renown; }
  const sgn = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
  say((r.capped && !r.gold ? `<div class="led neg"><span>You have won all the purses you can for today. Come back tomorrow.</span></div>` : `<div class="led"><span>${m.circuit ? 'Prize purse, less your entry' : 'Prize purse'}</span><span>${sgn(r.gold)}</span></div>`)
    + `<div class="led sum"><span>The day brought you</span><span>${r.gold} coins</span></div><div class="led note"><span>${purseText(profile.gold)} &nbsp;·&nbsp; +${r.renown} renown</span></div>` + rankBar(profile.renown));
  if (rankOf(profile.renown) > rb) announceRank(true);
}
/** The server's account of this player arrived: the profile is rebuilt from it (gold, renown and owned items are the server's). */
function applyAccount(me) {
  profile = loadProfile(account.buildProfile(me)); S.fp = !!profile.firstPerson;
  if (!M && player) rebuildPlayer();
  if (typeof menus !== 'undefined' && menus.root.classList.contains('on')) menus.show(menus.root.dataset.name);
  ranks.syncName();
}
account.on('sync', applyAccount);
account.on('change', (inn) => { if (!inn) location.reload(); });      // signed out (or the session ended): back to the guest's own save
const accountApi = { signedIn: account.signedIn, info: account.info, providers: account.providers, signIn: account.signIn, signOut: account.signOut, message: () => account.message, clearMessage: () => account.setMessage(''), fail: (m) => account.setMessage(m), async buy(item) {
  const r = await account.buy(item);
  if (r.ok) { const me = await account.fetchMe(); if (!me) profile.gold = r.wallet.gold; }
  return r;
} };
const onlineApi = { find: lobbyFind, get lobby() { return LOBBY; }, lobbyObjNow: () => lobbyObj, open: lobbyOpen, create: lobbyCreate, join: lobbyJoin, leave: lobbyLeave, ride: lobbyRide, setRoom: lobbySetRoom, modeIds: onlineModeIds, list: lobbyList, joinListed: lobbyJoinListed, quick: lobbyQuick, back: lobbyBack, setPublic: lobbySetPublic, invite: lobbyInvite, inviteLink, alone: lobbyAlone };

// ------------------------------------------------------------------ input
/** Keys common to every replay: 1-4 speed, , and . step a frame, K pauses (the automatic one skips on Space), and the free camera's WASD / arrows (R resets it). True when it took the key. */
function rplKey(e) {
  const k = e.code, d = /^Digit([1-4])$/.exec(k);
  if (d) { rplSpeed(SPEEDS[+d[1] - 1]); return true; }
  if (k === 'Comma') { rplStep(-1); return true; }
  if (k === 'Period') { rplStep(1); return true; }
  if (k === 'KeyK') { rplPause(); return true; }
  if (R.shot === 8) {
    if (k === 'KeyR') { R.free = null; freeInit(false); return true; }
    const m = R.mv || (R.mv = {}), map = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd', KeyQ: 'q', KeyE: 'e', ArrowUp: 'w', ArrowDown: 's' };
    if (map[k]) { m[map[k]] = true; return true; }
  }
  return false;
}
const freeMods = { fast: false, slow: false };      // the free replay camera: Shift moves 3x faster, Ctrl or Alt a third as fast
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.code;
  if (typeof menus !== 'undefined' && menus.overOpen()) { if (k === 'Escape') { menus.closeOver(); e.preventDefault(); } return; }      // Settings over the pause menu: Esc closes it first, nothing else reaches the match
  freeMods.fast = e.shiftKey; freeMods.slow = e.ctrlKey || e.altKey;
  if (promptKey(k)) { e.preventDefault(); return; }      // the celebration prompt (1-4 or arrows) takes the key
  if (S.pmSet && S.paused) { if (k === 'Escape' || k === 'Backspace') pauseSettings(false); e.preventDefault(); return; }      // Settings from the pause menu: Esc goes back to it
  if (S.yieldAsk) { if (k === 'KeyY' || k === 'Enter') doYield(); else if (k === 'KeyN' || k === 'Escape' || k === 'Backspace') closeYield(); e.preventDefault(); return; }      // the yield confirm swallows every key
  if (M && S.paused && R && R.hl) {      // a highlight playing from the pause menu
    if (rplKey(e)) { e.preventDefault(); return; }
    if (k === 'KeyV') replayView();
    else if (k === 'Space' || k === 'Enter') rplPause();
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { R.pause = true; rplSync(); replaySeek(R.t + (k === 'ArrowLeft' ? -0.25 : 0.25)); }
    else if (k === 'Escape' || k === 'KeyP' || k === 'Backspace') closeHL();
    e.preventDefault(); return;
  }
  if (S.mode === 'replay' && R && !R.hl && !S.paused && rplKey(e)) { e.preventDefault(); return; }      // the automatic replay: speed, step, the free camera's keys
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
  else if (k === 'Space' || k === 'Enter') { e.preventDefault(); if (S.mode === 'intro' || (M && M.spec) || (C && (C.mont || C.beat || (C.lap && !C.lap.ended)))) { skipKey = true; return; } if (e.repeat) return; if (S.mode === 'charge' && k === 'Space') doBrace(); else advance(); }
  else if (k === 'KeyV') { if (S.mode === 'replay') replayView(); else if (M && M.spec) { /* a spectator has one feed */ } else { S.fp = !S.fp; profile.firstPerson = S.fp; saveProfile(); } }
  else if (k === 'KeyM') setSound(S.muted);
  else if (k === 'KeyN') { if (S.mode === 'menu' && !e.repeat) musicNext(); }
  else if (k === 'KeyR') { if (M && S.paused && !S.rpl) openReplays('pause'); else if (M && !S.paused && M.result && C && C.carded && S.mode === 'after') openReplays('card'); else if (C && S.mode === 'after' && C.replayed && C.rec.f.length > 20 && !C.cut && !R && !S.online) startReplay({ frozen: true }); }
  else if (k === 'Digit5') { if (S.mode === 'ready') interlude(5); else if (C && S.mode === 'after' && M.result && (C.lapDone || C.carded) && !M.spec && !S.paused && rearUp()) react('rouse', 1, false); }      // rear your horse: before a course, or after the match is decided
  else if (k === 'KeyE' || k === 'Digit4') { if (S.mode === 'ready') interlude(4); else if (C && player.speed < 2.6 && C.patCd <= 0 && S.mode === 'charge') { C.patCd = 1.2; M.agit = clamp(M.agit - 0.22, 0, 1); audio.snort(0); } }
  else if (k === 'KeyX' || k === 'Digit1') { if (S.mode === 'ready') interlude(1); else if (C && S.mode === 'after' && opp && opp.unhorsed && !C.courtesy) { C.courtesy = true; react('salute', 1, false); discover('courtesy'); withFeats(() => courtesyFeat(profile)); say('You salute your fallen foe. The gallery approves.', 'THE GALLERY', 2, { prompt: true, phases: 'after' }); } }
  else if (k === 'KeyY') openYield();
  else if (k === 'KeyG') ladyEye();      // not in the key hints: found by accident, or from the squire's mutter
  else if (k === 'Digit2') interlude(2);
  else if (k === 'Digit3') interlude(3);
  else if (k === 'Escape' || k === 'KeyP') { if (M) { if (S.rpl) closeReplays(); else pauseKey(); } }
  else if (k === 'Backspace') { if (M && S.paused) leaveLists(); }
  if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.code; freeMods.fast = e.shiftKey; freeMods.slow = e.ctrlKey || e.altKey;
  if (R && R.mv) { const m = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd', KeyQ: 'q', KeyE: 'e', ArrowUp: 'w', ArrowDown: 's' }[k]; if (m) R.mv[m] = false; }
  if (k === 'Space' || k === 'Enter') skipKey = false;
  if (k === 'KeyS' || k === 'ArrowDown') keys.rein = false; else if (k === 'KeyA' || k === 'ArrowLeft') keys.left = false; else if (k === 'KeyD' || k === 'ArrowRight') keys.right = false;
  else if (k === 'KeyF') focusHeld = false; else if (k === 'KeyT') keys.throw = false; else if (k === 'KeyQ') keys.guard = false; else if (k === 'KeyC') keys.look = false;
});
let rplDrag = null;      // a mouse button held down on a replay: a drag turns the free camera, a click is the old "next angle"
window.addEventListener('mousemove', (e) => {
  if (rplDrag && !touchMode) { const dx = e.clientX - rplDrag.x, dy = e.clientY - rplDrag.y; rplDrag.x = e.clientX; rplDrag.y = e.clientY; rplDrag.moved += Math.abs(dx) + Math.abs(dy); if (rplDrag.moved > 5 && R) freeOrbit(dx, dy); return; }
  if (touchMode) return;      // a finger moves the aim by dragging (src/touch.js); the synthetic mouse move must not jump it
  if (isAuto() && S.mode === 'charge') return;
  const nx = (e.clientX / window.innerWidth) * 2 - 1, ny = -(e.clientY / window.innerHeight) * 2 + 1;
  if (aimRebase) { aimRebase = false; aimOrigin.set(nx, ny); }      // the first move of a course takes wherever the hand is as the screen centre: the aim starts centred, whatever the pointer was doing
  mouse.set(clamp(nx - aimOrigin.x, -1, 1), clamp(ny - aimOrigin.y, -1, 1));
});
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (touchMode) return;
  if (R && S.mode === 'replay' && e.button === 0) { rplDrag = { x: e.clientX, y: e.clientY, moved: 0 }; return; }
  if (e.button === 0) { if (S.mode === 'charge' || S.mode === 'ready') { if (C) C.couchHeld = true; } else advance(); }
  if (e.button === 2) focusHeld = true;
});
window.addEventListener('mouseup', (e) => { if (rplDrag && e.button === 0) { const click = rplDrag.moved <= 5; rplDrag = null; if (click && R) advance(); return; } if (touchMode) return; if (e.button === 0 && C) C.couchHeld = false; if (e.button === 2) focusHeld = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (R && S.mode === 'replay') { e.preventDefault(); freeZoom(Math.exp(clamp(e.deltaY, -300, 300) * 0.0012)); } }, { passive: false });
$('card').addEventListener('click', advance);
window.addEventListener('blur', () => { skipKey = false; keys.rein = keys.left = keys.right = keys.guard = keys.look = keys.throw = false; focusHeld = false; if (M && S.mode === 'charge' && !G.manual && !S.online) setPaused(true); });

function setPaused(v) {
  if (!v && typeof menus !== 'undefined' && menus.overOpen()) menus.closeOver();      // (the touch pause button also closes Settings)
  if (!v) { if (R && R.hl) closeHL(); if (S.rpl) { const card = S.rplFrom === 'card'; closeReplays(); if (card) return; } if (S.pmSet) { S.pmSet = false; $('screen').classList.remove('on'); } }      // (the pause button also backs out of a highlight, the list and Settings)
  S.paused = v; const b = $('banner');
  if (M && M.spec) { ceremony.skipUI(false); $('pmLeave').textContent = 'Stop watching'; $('pmRide').innerHTML = 'Keep watching <kbd>Esc</kbd>'; }
  if (v) { showPauseMain(); if (window.speechSynthesis) window.speechSynthesis.pause(); }
  else { S.rpl = false; document.body.classList.remove('rpl-open'); $('pmenu').classList.add('hidden'); if (S.mode !== 'intro') b.classList.add('hidden'); if (window.speechSynthesis) window.speechSynthesis.resume(); }
  if (!S.muted) audio.setMuted(v);
}
/** The one pause key (Esc, P, the pause button, Resume). Offline it toggles the pause; online it calls, or ends, a shared pause (below). */
function pauseKey() {
  if (!M) return;
  if (!S.online || !NET.pz || M.result) { setPaused(!S.paused); return; }      // (a decided match has nothing to freeze: the card's own local pause, for Leave)
  if (S.paused && ((R && R.hl) || S.rpl || S.pmSet)) { if (R && R.hl) closeHL(); else if (S.pmSet) pauseSettings(false); else closeReplays(); return; }      // (backs out of a highlight, the list, Settings; one more press resumes)
  const r = NET.pz.press(S.mode === 'charge');
  if (r === 'requested' || r === 'already') pzNote('Pause requested', 0);
  else if (r === 'theirs' && S.paused) pzNote(`${oppName()} has paused`);
}
// ---- the online pause (src/pause.js): the state machine decides; this turns it into the frozen match, the menu's clock and the notes
const oppName = () => String((M && M.od && M.od.name) || 'Your opponent').replace(/, ".*"/, '');
let pzTimer = 0, pzNoteT = 0;
function pzNote(text, ms = 2400) { const el = $('pzNote'); el.textContent = text; el.classList.remove('hidden'); clearTimeout(pzNoteT); if (ms) pzNoteT = setTimeout(() => el.classList.add('hidden'), ms); }
function pzClear() { clearInterval(pzTimer); pzTimer = 0; clearTimeout(pzNoteT); $('pzNote').classList.add('hidden'); if (NET.pz) { NET.pz.cur = null; NET.pz.want = null; } }
function pzMake() {
  pzClear();
  NET.pz = new OnlinePause(NET.host, netSend, () => performance.now(), {
    on() { clearTimeout(pzNoteT); $('pzNote').classList.add('hidden'); setPaused(true); clearInterval(pzTimer); pzTimer = setInterval(() => { if (NET.pz) NET.pz.tick(); netWatch(); pzSync(); }, 250); },
    off() { clearInterval(pzTimer); pzTimer = 0; if (S.paused) setPaused(false); },
    note(t) { pzNote(t); },
    change() { pzSync(); },
  });
}
/** Every frame online: the host starts a waiting request once the charge is over; the clock runs. */
function pzFrame() {
  const P = NET.pz; if (!P) return;
  if (M.result && P.want) { P.want = null; $('pzNote').classList.add('hidden'); }
  if (NET.host) P.poll(S.mode === 'charge' || (S.mode === 'after' && C && C.afterT < 1.2) || !!M.result);      // (a beat after the last blow, so that the replays have the splinters and the fall)
  P.tick();
}
const clockText = (ms) => `0:${String(Math.max(0, Math.ceil(ms / 1000))).padStart(2, '0')}`;
/** The pause menu's face: offline (or a decided match's local pause) "Paused"; online, who called it, the pauses that player has left, and the clock. */
function pzSync() {
  const P = S.online && NET.pz, on = !!(P && P.cur && S.paused);
  $('pmNet').classList.toggle('hidden', !on); $('pmMain').classList.toggle('theirs', on && !P.mine());
  $('pmTop').textContent = on ? 'A PAUSE HAS BEEN CALLED' : 'THE LISTS ARE STILL';
  if (!on) return;
  const n = P.left[P.cur.by], mine = P.mine(), my = P.left[P.me], pl = (k) => `${k} pause${k === 1 ? '' : 's'} left`;
  $('pmWho').textContent = mine ? 'YOU HAVE PAUSED' : `${oppName().toUpperCase()} HAS PAUSED`;
  $('pmClock').textContent = clockText(P.remaining());
  $('pmLeft').textContent = mine ? pl(n) : `${pl(n)} for him · you have ${my}`;
}
function netWatch() { if (NET.net && NET.lastRx && performance.now() - NET.lastRx > 12000) netForfeit(); }
function leaveLists() { if (M && (S.paused || S.online)) { setPaused(false); if (M.spec) { specLeave(); return; } endMatch(); menus.show('main'); } }      // (watching the roll: Stop watching)
/** Settings from the pause menu: the same Settings screen, and Done comes back here. */
function pauseSettings(on) {
  if (!M || !S.paused) return;
  S.pmSet = !!on;
  if (on) { $('pmenu').classList.add('hidden'); menus.show('settings'); } else { $('screen').classList.remove('on'); showPauseMain(); }
}
// the pause menu's buttons, its Replays list, and the highlight's Back button
$('pmRide').addEventListener('click', () => pauseKey());
$('pmRpl').addEventListener('click', () => openReplays('pause'));
/** Settings over the paused match: the same panel as the main menu; Done / Esc return to the pause menu. Difficulty is read at the start of a match (its help line says so); the rest applies live. */
function openPauseSettings() {
  if (!M || !S.paused) return;
  $('pmenu').classList.add('hidden'); $('banner').classList.add('hidden'); document.body.classList.add('pm-settings');
  menus.openOver(() => { document.body.classList.remove('pm-settings'); if (M && S.paused) showPauseMain(); });
}
$('pmSet').addEventListener('click', openPauseSettings);
$('pmFs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else goFullscreen(); setTimeout(() => { if (S.paused && !S.rpl && !S.pmSet) showPauseMain(); }, 400); });
$('pmLeave').addEventListener('click', () => leaveLists());
$('hlBack').addEventListener('click', () => closeHL());
$('rplCtl').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !R) return; e.stopPropagation();
  if (b.dataset.s) rplSpeed(+b.dataset.s); else if (b.dataset.k === 'pp') rplPause(); else if (b.dataset.k === 'back') rplStep(-1); else if (b.dataset.k === 'fwd') rplStep(1); else if (b.dataset.k === 'view') replayView(); else if (b.dataset.k === 'skip') endReplay();
});
$('cardReplays').addEventListener('click', (e) => { e.stopPropagation(); openReplays('card'); });
$('pmList').addEventListener('click', (e) => {
  const t = e.target.closest('button, .rrow'); if (!t) return;
  if (t.id === 'pmBack') { closeReplays(); return; }
  const i = +(t.dataset.i); if (!(i >= 0)) return;
  openHL(i, t.dataset.a != null ? +t.dataset.a : undefined);
});

// ------------------------------------------------------------------ HUD
let hudT = 0;
let dollSig = '', dollM = null;
function updateHud(force) {
  if (!M) return;
  { const a = player.dmg, b = opp.dmg || {}, sig = [a.shield, a.helm, a.breast, a.pauldronL, b.shield, b.helm, b.breast, b.pauldronL].map(v => Math.round((v || 0) * 40)).join(',');
    if (sig !== dollSig || dollM !== M) { dollSig = sig; dollM = M; drawDoll($('dollP'), a, profile.arms); drawDoll($('dollO'), Object.assign({ shield: 0, helm: 0, breast: 0, pauldronL: 0 }, b), M.od && M.od.arms); } }
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
  { const sp = $('speedTxt').firstElementChild, v = String(Math.round(player.speed * 3.6)); if (sp.textContent !== v) sp.textContent = v; }
  $('bondTxt').textContent = `BOND ${BOND_NAMES[bondLevel(profile.bond[profile.horse])]}`;
  { const b = $('burstTxt'), B = sk('burst'); b.textContent = !B ? '' : C.burstT > 0 ? 'THE SPUR!' : C.burstUsed ? 'SPUR SPENT' : C.tier === 4 ? 'SHIFT: THE SPUR' : 'THE SPUR READY'; b.className = C.burstT > 0 ? 'go' : B && !C.burstUsed ? 'on' : ''; }
  const gapH = gapNow(), closing = player.speed + opp.speed;
  const tti = closing > 2 ? (gapH - 2.4) / closing : 99;
  const sEl = $('strideTxt');
  if (S.mode === 'charge' && !C.pL.done && tti < 6 && tti > 0) { const n = Math.max(0, Math.ceil(tti * (0.78 + 0.12 * player.speed))); sEl.innerHTML = `${n}<small>${n === 1 ? 'STRIDE' : 'STRIDES'}</small>`; sEl.setAttribute('aria-label', 'strides to the shock'); sEl.classList.toggle('now', n <= couchStrides() + 1 && C.couch < 0.5); }
  else sEl.innerHTML = '';
  $('stamBar').style.width = `${M.stamina * 100}%`; $('stamBar').style.background = M.stamina < 0.25 ? 'var(--red)' : 'var(--gold)';
  $('calmBar').style.width = `${(1 - M.agit) * 100}%`; $('calmBar').style.background = M.agit > 0.6 ? 'var(--red)' : 'var(--green)';
  $('horseBar').style.width = `${M.hp.horse * 100}%`; $('horseBar').style.background = M.hp.horse < 0.4 ? 'var(--red)' : 'var(--green)';
  { const w = 1 - M.bodyS.p.wind; $('breathBar').style.width = `${w * 100}%`; $('breathBar').style.background = w < 0.5 ? 'var(--red)' : 'var(--gold)'; }
  $('bodyBar').style.width = `${M.hp.body * 100}%`; $('bodyBar').style.background = M.hp.body < 0.4 ? 'var(--red)' : 'var(--green)';
  { const on = injuriesOn(), cs = on ? [conditionOf(0), conditionOf(1)] : ['', ''];      // condition, spare lances and the yield button (drama; offline only)
    for (const [id, c] of [['condP', cs[0]], ['condO', cs[1]]]) { const e = $(id); if (e.dataset.c !== c) { e.dataset.c = c; e.textContent = c; e.className = `cond ${c.toLowerCase()}`; } }
    const nl = on ? Math.max(0, lancesLeft(0) - 1) : -1, ll = $('lanceLeft'); if (ll.dataset.n !== String(nl)) { ll.dataset.n = String(nl); ll.title = nl < 0 ? '' : nl ? `${nl} spare lance${nl === 1 ? '' : 's'}` : 'no spare lance'; ll.innerHTML = nl < 0 ? '' : `<em>LANCES</em>${nl ? '<i></i>'.repeat(Math.min(nl, 8)) : '<u>NONE SPARE</u>'}`; }      // (a row of little lances, one per spare)
    $('yieldBtn').classList.toggle('hidden', !yieldOk()); }
  const steady = clamp(1 - C.sway / 0.07, 0, 1);
  $('armBar').style.width = `${steady * 100}%`; $('armBar').style.background = steady < 0.4 ? 'var(--red)' : 'var(--gold)';
  $('focusBar').style.width = `${M.focus * 100}%`;
  $('couchTxt').textContent = player.lanceBroken ? 'LANCE BROKEN' : C.couch >= 0.999 ? (C.setT > 0.4 ? (C.fatigue > 0.35 ? 'ARM TIRING' : M.bodyS.p.arm > 0.3 ? 'COUCHED · ARM JARRED' : 'COUCHED · SET') : 'COUCHED · SETTLING') : C.couch > 0.05 ? 'LOWERING…' : 'LANCE UPRIGHT';
  const br = $('braceTxt'), bt = 'THRUST';      // (lit while it is on, dashed while it recovers: the word stays put) if (br.lastChild.textContent !== bt) br.lastChild.textContent = bt; br.classList.toggle('on', C.braceT > 0); br.classList.toggle('cd', C.braceT <= 0 && C.braceCd > 0);
  const sh = $('shieldTxt'), hi = player.guard > 0.5, st = hi ? 'GUARD HELM' : 'GUARD BODY'; if (sh.lastChild.textContent !== st) sh.lastChild.textContent = st; sh.classList.toggle('on', hi); sh.classList.toggle('hi', hi);      // (high guards the helm, low the body)
  const ph = player.phase % 1, pulse = C.tier === 4 ? Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.2) : 0;
  const dot = $('rhythmDot'); dot.style.width = dot.style.height = `${8 + pulse * 38}px`; dot.style.opacity = 0.35 + pulse * 0.65;
  // prompt
  let pr = '';
  if (S.mode === 'ready') pr = C.rd.sig ? `Tap <kbd>W</kbd> to ride` : C.rd.p ? `Your lance is up. Wait for the marshal…` : `Tap <kbd>W</kbd> to raise your lance` + (M.practice || C.act ? '' : ` &nbsp;·&nbsp; or first: <kbd>1</kbd> salute the gallery <kbd>2</kbd> rouse the commons <kbd>3</kbd> taunt him <kbd>4</kbd> steady your horse <kbd>5</kbd> rear`) + ` &nbsp;·&nbsp; <kbd>H</kbd> ${player.visor ? 'visor' : 'helm on or off'}`;
  else if (S.mode === 'charge' && !C.pL.done) {
    if (C.tier < 3 && C.t > 1.2) pr = `Tap <kbd>W</kbd> again — walk, trot, canter, gallop`;
    else if (C.couch < 0.2 && tti < couchLead() + 0.55 && tti > 0.35) pr = `Hold <kbd>LEFT MOUSE</kbd> — lower your lance now`;
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
  const aimHint = () => { if (S.mode === 'ready' || (S.mode === 'charge' && C.t < 6)) touch.coach(getAimMode() === 'joy' ? 'Hold the left side and slide to aim' : 'Drag to aim the lance', 5); };
  if (S.mode === 'ready') { aimHint(); return C.rd.sig ? `Tap <kbd>SPUR</kbd> to ride` : C.rd.p ? `Wait for the marshal` : `Tap <kbd>SPUR</kbd>: raise lance`; }
  if (S.mode === 'charge' && !C.pL.done) {
    if (C.tier < 3 && C.t > 1.2) return `Tap <kbd>SPUR</kbd> again to go faster`;
    if (C.couch > 0.9 && tti < 0.45 && C.braceT <= 0 && C.braceCd <= 0) return `Tap <kbd>BRACE</kbd> now`;
    aimHint();
  }
  return '';
}
function updateLesson() {
  const L = LESSONS[M.lesson];
  $('lessonTitle').textContent = `${M.lesson + 1}. ${L.title}`; $('lessonGoal').textContent = tw(L.goal);
  let nowSet = false;
  $('lessonList').innerHTML = L.steps.map(s => { const done = !!C.flags[s[1]]; const now = !done && !nowSet; if (now) nowSet = true; return `<li class="${done ? 'done' : now ? 'now' : ''}">${tw(s[0])}</li>`; }).join('');
  $('lessonNote').textContent = tw(L.note);
}

function updateReticle() {
  const ret = $('reticle'), cur = $('cursorDot');
  const show = M && C && (S.mode === 'charge' || S.mode === 'ready') && !C.pL.done && !C.cut && player.look < 0.3;
  ret.style.display = cur.style.display = show ? 'block' : 'none';
  document.body.classList.toggle('aiming', !!show && !touchMode && !S.paused && !S.rpl);      // the system arrow is hidden while you aim: the diamond is the pointer, and it starts centred (the arrow sat wherever the hand was, so the two never agreed)
  if (!show) return;
  const w = window.innerWidth, h = window.innerHeight, D = dirP();
  cur.style.left = `${(mouse.x * 0.5 + 0.5) * w}px`; cur.style.top = `${(-mouse.y * 0.5 + 0.5) * h}px`;
  // true aim: where the lance line meets the opponent's plane
  player.gripWorld(_a); player.tipWorld(_b); _c.subVectors(_b, _a).normalize();
  if (C.aimDir && S.mode === 'charge') _c.copy(C.aimDir); else if (player.lanceLower > 0.95) player.aimWorld(_c);      // the ring follows where you mean the point to go; far out the shaft itself is held wider, clear of your horse's head
  opp.zoneWorld('body', _zc);
  const t = _c.z * D > 0.05 ? clamp((_zc.z - _a.z) / _c.z, player.reach, 150) : 150;
  _p.copy(_a).addScaledVector(_c, t);
  let zone = '';
  if (C.couch > 0.9) for (const z of opp.zones) { z.o.getWorldPosition(_d); if (Math.hypot(_p.x - _d.x, _p.y - _d.y) < z.r) { zone = z.name; break; } }
  if (zone === 'shield' && S.mode === 'charge') { C.onMarkT += 1 / 60; if (C.onMarkT > 0.3) C.flags.onmark = true; }
  _p.project(camera);
  if (!(C.aimDir && S.mode === 'charge')) _p.set(aimMouse.x, aimMouse.y, 0);      // before the run: the ring sits where the pointer is (centred at the start of a course)
  ret.style.left = `${(_p.x * 0.5 + 0.5) * w}px`; ret.style.top = `${(-_p.y * 0.5 + 0.5) * h}px`;
  ret.className = (C.couch < 0.9 ? 'up ' : '') + (C.aimEdge ? 'edge ' : '') + zone;
  $('zoneTxt').textContent = zone ? zone.toUpperCase() : '';
}

function updateMask() {
  const m = $('helmMask');
  const rfp = S.mode === 'replay' && R && R.sp && (R.shot === 6 || R.shot === 7), who = R && R.shot === 7 ? opp : player, snap = R && R.shot === 7 ? R.so : R && R.sp;      // a replay through somebody's visor: his mask, as the snapshot has him
  if (rfp) {
    if (snap.unhorsed || snap.visorUp || snap.helmOff) { if (m.style.display !== 'none') m.style.display = 'none'; return; }
    const vis = who.armourDef.vision, frog = (!EQUAL_GEAR && who.armourDef.helm === 'frogmouth') || (who === player && M.kit.bolted);
    const half = (5 + vis * 30) * (1 - PHYS.damage.helmView * (who.dmg ? who.dmg.helm : 0)), c = 47 - (snap.brace || 0) * (frog ? 36 : 8);
    m.style.display = 'block';
    m.style.background = `linear-gradient(to bottom, #050505 0, #050505 ${c - half}%, rgba(5,5,5,0) ${c - half + 3}%, rgba(5,5,5,0) ${c + half - 3}%, #050505 ${c + half}%, #050505 100%)`;
    return;
  }
  const on = (M && C && player && C.cut && C.cut.kind === 'visor') || S.fp && M && C && (S.mode === 'ready' || S.mode === 'charge' || S.mode === 'after') && !player.unhorsed && !C.cut && !(C.cine) && !player.visorUp && !player.helmOff;      // visor up or helm off: the full view
  if (!on) { if (m.style.display !== 'none') m.style.display = 'none'; return; }
  const vis = player.armourDef.vision, frog = (!EQUAL_GEAR && player.armourDef.helm === 'frogmouth') || M.kit.bolted;      // the bolted Stechhelm: the slit sits high, so sit up at the last moment to see
  const half = (5 + vis * 30) * (1 - PHYS.damage.helmView * player.dmg.helm), c = 47 - player.brace * (frog ? 36 : 8);   // sit up in the frog-mouth and the sight lifts to the sky
  m.style.display = 'block';
  m.style.background = `linear-gradient(to bottom, #050505 0, #050505 ${c - half}%, rgba(5,5,5,0) ${c - half + 3}%, rgba(5,5,5,0) ${c + half - 3}%, #050505 ${c + half}%, #050505 100%)`;
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 6, -50), camLook = new THREE.Vector3(0, 2, 0), want = new THREE.Vector3(), wantLook = new THREE.Vector3();
let fov = 58;
function resetCamera() { camPos.set(0, 6, -50); camLook.set(0, 2, 0); fov = 58; S.kx = S.ky = S.kvx = S.kvy = 0; S.shake = 0; camera.position.copy(camPos); camera.fov = 58; camera.updateProjectionMatrix(); camera.lookAt(camLook); camera.updateMatrixWorld(true); }
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
/** Depth of field for the cinematic cameras only (replays, the judges, close-ups, the intro): focus on the knights in shot, never in live play. */
const _dv = new THREE.Vector3(), _df = new THREE.Vector3();
function dofDepth(x, y, z) { camera.getWorldDirection(_df); return _dv.set(x, y, z).sub(camera.position).dot(_df); }
function dofAim() {
  let f = null, r = 2, am = 1;
  if (S.mode === 'replay' && R && R.sp && R.so) {
    if (R.shot >= 6) { /* through a visor slit, or the free camera: no depth of field */ }
    else if (R.shot === 5 && R.fall) { f = dofDepth(R.fall.x, Math.max(0.5, R.fall.y), R.fall.z); r = 2.2; }
    else { const a = dofDepth(R.sp.px, 1.5, R.sp.pz), b = dofDepth(R.so.px, 1.5, R.so.pz); f = (a + b) / 2; r = Math.abs(a - b) / 2 + 3.2; }
    am = R.shot === 3 ? 0.3 : 0.85;      // the crane is a wide shot: hardly any
  } else if (S.mode === 'intro') { f = camPos.distanceTo(camLook); r = Math.max(4, f * 0.4); }
  else if (C && C.cut && !(C.cut.ots > 0)) {
    const k = C.cut.kind;
    if (k === 'judges' || k === 'herald' || k === 'royal' || k === 'opp' || k === 'lady' || k === 'batter' || k === 'tend' || (k === 'react' && (C.cut.sub === 'squire' || C.cut.sub === 'lady'))) { f = camPos.distanceTo(camLook); r = Math.max(3.5, f * 0.35); }
  } else if (C && C.cut && C.cut.ots > 0 && C.cut.kind !== 'visor') { f = dofDepth(player.root.position.x, 1.8, player.root.position.z); r = 2; }
  if (f != null && !(f > 0.5)) f = null;
  am *= clamp((54 - camera.fov) / 22, 0, 1);      // wide lenses (establishing shots, the stands) get little or none; long lenses on the knights get it all
  post.setDOF(f, r, am);
}
/** The menu joust frames its action in the free part of the page: the picture is shifted (a view offset) so the middle of the action sits in the middle of the free space. null clears it. */
let viewKey = '';
function setMenuView(v) {
  const w = window.innerWidth, h = window.innerHeight, key = v ? `${w}|${h}|${Math.round(v.dx)}|${Math.round(v.dy)}` : '';
  if (key === viewKey) return;
  viewKey = key;
  if (v) camera.setViewOffset(w, h, -Math.round(v.dx), -Math.round(v.dy), w, h); else camera.clearViewOffset();
}
function updateCamera(dtReal) {
  if (G.cam) { camera.position.set(...G.cam.p); camera.lookAt(...G.cam.l); if (G.cam.fov) { camera.fov = G.cam.fov; camera.updateProjectionMatrix(); } if (player) player.helm.visible = true; return; }
  let rate = 7, wantFov = 58, snap = false, own = false;
  const D = dirP();
  const autoCam = followCam(dtReal);
  let menuView = null;      // the menu joust's picture shift, when it is drawing
  if (S.mode === 'menu' && attract.running && !G.cam) {      // the menu joust: its own slow cinematic cameras (src/attract.js)
    const ac = attract.camera(); want.copy(ac.pos); wantLook.copy(ac.look); wantFov = ac.fov; rate = 60; snap = ac.snap; menuView = ac.view;
    if (camera.aspect < 1.3) wantFov = Math.min(84, 2 * Math.atan(Math.tan(wantFov * Math.PI / 360) * Math.sqrt(1.78 / camera.aspect)) * 180 / Math.PI);      // phone held upright
    if (ac.snap) fov = wantFov;
  } else if (S.mode === 'menu') {
    S.menuAng += dtReal * 0.08;
    const c = player ? player.root.position : _a.set(0, 0, 0);
    if (S.menuView === 'armoury') {
      // the knight stands on the left of the page, as in a manuscript portrait
      if (S.celPrev) {
        // Knight tab: a celebration is playing. The camera stands on the crowd's side, close enough that the pose reads, looking straight at the rider; the picture is then
        // shifted sideways (the same view offset the menu joust uses) so he sits centred in the free left part of the screen, with the list on the right.
        const pe = document.querySelector('#screen .sheet'), pl = pe ? pe.getBoundingClientRect().left : 0, W = window.innerWidth;
        const tx = pl > W * 0.25 ? pl / 2 : W / 2;      // (a phone page covers the whole screen: no room at the side, so he stays centred)
        want.set(c.x + 5.0, 1.8, c.z + 0.15); wantLook.set(c.x, 1.3, c.z + 0.15); rate = 5; wantFov = 40;
        S.armDx = damp(S.armDx || 0, tx - W / 2, 4, dtReal);
      } else {
        S.armDx = damp(S.armDx || 0, 0, 5, dtReal);
        const a = S.menuAng * 1.6, px = c.x + Math.sin(a) * 5.4, pz = c.z + Math.cos(a) * 5.4;
        want.set(px, 2.0, pz);
        const vx = c.x - px, vz = c.z - pz, len = Math.hypot(vx, vz) || 1;
        wantLook.set(c.x + (-vz / len) * 1.7, 1.45, c.z + (vx / len) * 1.7); rate = 4; wantFov = 44;
      }
      if (Math.abs(S.armDx || 0) > 0.5) menuView = { dx: S.armDx, dy: 0 };
    } else {
      S.armDx = 0;
      want.set(c.x + Math.sin(S.menuAng) * 6.2, 2.3 + Math.sin(S.menuAng * 0.7) * 0.4, c.z + 1.0 + Math.cos(S.menuAng) * 6.2);
      wantLook.set(c.x - 1.2, 1.75, c.z + 0.4); rate = 3; wantFov = 42;
    }
  } else if (S.mode === 'intro' && M && M.spec) {
    const r = specIntroCam(want, wantLook); wantFov = r.fov; rate = 4; snap = r.snap;
  } else if (S.mode === 'intro' && introNew()) {
    const r = ceremony.camera(S.introT, player, opp, want, wantLook); wantFov = r.fov; snap = r.snap || S.introT < 0.05; rate = r.id === 'warmP' || r.id === 'warmO' ? 8 : 4;
  } else if (S.mode === 'intro') {
    const t = S.introT, on = t < 4.2 ? opp : player, a = (on === opp ? t : t - 4.2) * 0.3 - 0.95, dd = on.dir || -1;
    const c = on.root.position;
    want.set(c.x + Math.sin(a) * 6.2 * dd, on.seatY - 0.05 + (on === opp ? t : t - 4.2) * 0.16, c.z + Math.cos(a) * 6.2 * dd);
    wantLook.set(c.x, on.seatY + 0.05, c.z); rate = 4; wantFov = 40; snap = Math.abs(t - 4.2) < 0.05 || t < 0.05;
  } else if (S.mode === 'replay' && R) {
    wantFov = replayCam(); rate = 30; if (!R.camSet || R.cut) { R.camSet = true; R.cut = false; snap = true; fov = wantFov; }
  } else if (C && C.lap && !C.lap.ended && S.mode === 'after') {
    const r = lapCamera(); wantFov = r.fov; rate = r.rate || 4; snap = snap || r.snap;
  } else if (celCamOn()) {      // the celebration cam: one tracking shot on the celebrating knight, start to end (non-interactive time only; Space / a tap skips it)
    const c = C.cel, r = celCam(c.W, c.W.cel.t, c.W.cel.dur, want, wantLook); wantFov = r.fov; rate = r.rate; if (c.shot !== r.shot) { c.shot = r.shot; snap = camPos.distanceTo(want) > 14; }      // (a glide from the last picture unless it is far)
  } else if (C && C.cut) {
    const k = C.cut.kind, p = player.root.position;
    if (C.cut.ots > 0) {      // over your shoulder: your knight from behind, looking the way he is addressing
      const c = _c; if (k === 'royal') c.set(15.5, 3.2, 0); else if (k === 'commons') c.set(-Math.sign(p.x) * 10.5, 1.3, p.z - D * 1.5); else if (k === 'opp') c.set(opp.root.position.x, 2.0, opp.root.position.z); else if (k === 'lady') c.copy(C.cut.pos); else player.head.getWorldPosition(c);
      player.helm.getWorldPosition(_b); _a.set(c.x - _b.x, 0, c.z - _b.z); if (_a.lengthSq() < 1e-4) _a.set(0, 0, D); _a.normalize();
      want.set(_b.x - _a.x * 2.3 - _a.z * 0.55, _b.y + 0.5, _b.z - _a.z * 2.3 + _a.x * 0.55); wantLook.set(_b.x + _a.x * 9, _b.y + clamp((c.y - _b.y) * 0.3, -0.5, 1.6), _b.z + _a.z * 9); wantFov = 46;
    }
    else if (k === 'royal') { want.set(8.2, 4.9, 1.5); wantLook.set(15.5, 3.2, 0); wantFov = 25; }
    else if (k === 'judges') {      // the judges' box across the lists: first close on the middle judge as they confer (or, for the verdict, as he stands the baton up), then a medium of all four
      const tot = C.cut.total || FLAG_CUT, el = tot - C.cut.t, u = clamp(el / tot, 0, 1), sub = el < (C.cut.split ?? JUDGE_LEAD) ? 'mid' : 'box';
      if (C.cut.jsub !== sub) { C.cut.jsub = sub; snap = true; C.cut.nd = null; }
      wantFov = judges.cam(sub, sub === 'mid' ? u / Math.max(0.01, (C.cut.split ?? JUDGE_LEAD) / tot) : u, want, wantLook);
      if (!C.cut.nd) C.cut.nd = nudgeCam(want, judges.heads(), judges.root);      // nothing between the lens and the judges
      want.add(C.cut.nd);
    }
    else if (k === 'herald') {      // the announcer at the rail with his scroll, across the lists (src/ceremony.js)
      if (ceremony.hughAt(_c)) { const u = C.cut.t < 50 ? clamp(1 - C.cut.t / (C.cut.total || HERALD_CUT), 0, 1) : C.beat && C.beat.hAt != null ? clamp((C.beat.t - C.beat.hAt) / HELM_HERALD, 0, 1) : 0; want.set(5.2 + 0.6 * u, 1.5, _c.z - 0.1); wantLook.set(_c.x, 1.5, _c.z); wantFov = 27; if (!C.cut.nd) C.cut.nd = nudgeCam(want, [ceremony.hughHead() ? ceremony.hughHead().getWorldPosition(new THREE.Vector3()) : _c], ceremony.H.g); want.add(C.cut.nd); }
    }
    else if (k === 'lance') {      // low over the sand beside the pieces
      const m = C.meet, sg = Math.sign(m.x) || 1; want.set(m.x + sg * 2.6, 0.3, m.z - D * 1.2); wantLook.set(m.x - sg * 0.3, 0.1, m.z); wantFov = 36;
    }
    else if (k === 'helmfit') {      // the squire at your stirrup reaching up to your helm, from in front and outside
      player.helm.getWorldPosition(_b); const sq = field.where('squire', _d), fw = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion), pp = player.root.position;
      let ox = sq ? sq.x - pp.x : -Math.sign(pp.x) || -1, oz = sq ? sq.z - pp.z : 0; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol; const t = C.beat ? C.beat.t : 0;
      want.set(pp.x + ox * 3.3 + fw.x * (2.1 - 0.3 * t), player.seatY - 0.03, pp.z + oz * 3.3 + fw.z * (2.1 - 0.3 * t)); wantLook.set(_b.x + ox * 0.5, _b.y - 0.35, _b.z + oz * 0.5); wantFov = 34;
    }
    else if (k === 'visor') {      // through your own visor slit, down the lists at the man you will meet (the mask is drawn in updateMask)
      player.helm.getWorldPosition(want); want.y += player.eyeY ?? 0.17; const fw = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion); want.addScaledVector(fw, 0.05);
      wantLook.set(opp.root.position.x, opp.seatY + 0.37, opp.root.position.z); wantFov = 52;
    }
    else if (k === 'react') {      // the reaction montage: the stands, your squire, a lady of the gallery
      const sub = C.cut.sub;
      if (sub === 'crowd') { const s = C.cut.cs, z = C.cut.zc; want.set(s * 3.4, 1.9, z - 8); wantLook.set(s * 17, 3.4, z + 2); wantFov = 52; }
      else if (sub === 'crowd2') { const s = C.cut.cs, z = C.cut.zc; want.set(-s * 3.4, 1.6, z + 7); wantLook.set(-s * 16, 3.0, z - 2); wantFov = 50; }
      else if (sub === 'squire') {
        const q = C.cut.pos, dz = -Math.sign(q.z) || 1, sq = field.where('squire', _d) || q;
        want.set(q.x * 0.6, 1.6, q.z + dz * 7); wantLook.set(sq.x, 1.5, sq.z); wantFov = 34;
      }
      else { wantFov = ladyShot(C.cut.pos, want, wantLook); }
    }
    else if (k === 'batter' || k === 'tend') {      // the battered knight: close on his helm or breast, then pulled back; the surgeon's beat: him at his mark, the camera slowly in
      const J = C.cut.who ? opp : player, fw = _a.set(0, 0, 1).applyQuaternion(J.root.quaternion), out = Math.sign(J.root.position.x) || 1;
      J.torso.getWorldPosition(_c); J.helm.getWorldPosition(_b);
      if (k === 'batter') {
        const T = C.cut.helm ? _b : _c;
        if (C.cut.sub === 0) { want.set(T.x + fw.x * 1.9 + out * 1.0, T.y + 0.15, T.z + fw.z * 1.9); wantLook.copy(T); wantFov = 26; }
        else { want.set(_c.x + fw.x * 3.6 + out * 2.0, _c.y + 0.5, _c.z + fw.z * 3.6); wantLook.set(_c.x, _c.y + 0.25, _c.z); wantFov = 34; }
      } else {
        const u = C.mont ? clamp(C.mont.t / DR.tend, 0, 1) : 0, dd = 3.6 - 1.0 * u;
        want.set(_c.x + fw.x * dd * 0.7 + out * dd * 0.75, _c.y + 0.35, _c.z + fw.z * dd * 0.7); wantLook.set(_c.x, _c.y + 0.3, _c.z); wantFov = 36;
      }
    }
    else if (k === 'commons') { want.set(p.x * 0.4, 2.3, p.z + D * 3.5); wantLook.set(-Math.sign(p.x) * 10.5, 1.3, p.z - D * 1.5); wantFov = 46; }
    else if (k === 'lady') { wantFov = ladyShot(C.cut.pos, want, wantLook); }
    else if (k === 'opp') { const o = opp.root.position; want.set(o.x * 0.2, opp.seatY + 0.27, o.z - (opp.dir || -1) * -7); wantLook.set(o.x, opp.seatY + 0.17, o.z); wantFov = 26; }
    else { player.head.getWorldPosition(wantLook); want.set(wantLook.x - Math.sign(p.x) * 2.2, wantLook.y + 0.3, wantLook.z + D * 1.6); wantFov = 40; }
    rate = 30; { const sh = C.cut.ots > 0 ? 1 : 2; if (C.cut.shot !== sh) { C.cut.shot = sh; snap = true; } } C.cutWas = true;
  } else if (C && C.cine && (S.mode === 'after' || S.slowT > 0)) {
    const fp = afterM.focus(C.cine, _d), r = fp || C.cine.rider.position;      // (getting up: the pelvis as he poses it; else where he fell)
    want.set(r.x + Math.sign(r.x) * (fp ? 5.2 : 6.2), fp ? 1.5 : 1.45, r.z + (fp ? 3.0 : 3.6) * C.cine.dir); wantLook.set(r.x, fp ? 0.3 + r.y * 0.7 : 0.75, r.z); rate = 3.5; wantFov = fp ? 38 : 42;
    if (!C.cineCut) { C.cineCut = true; snap = true; }
  } else if (M && M.spec && S.mode !== 'menu') {      // a watched bout: the broadcast feed (never first person, never over a shoulder of yours)
    const r = specCam(dtReal, want, wantLook); wantFov = r.fov; rate = r.rate; snap = snap || r.snap; if (C && C.cutWas) C.cutWas = false;
  } else if (S.fp && !player.unhorsed) {
    player.helm.getWorldPosition(want); want.y += player.eyeY ?? 0.17;
    const fwd = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion), lk = player.look;
    want.addScaledVector(fwd, 0.05);
    // forward along the lists with a bias to the tilt side; glance over the left shoulder when looking behind
    const yaw = (0.22 - mouse.x * 0.55) + lk * 2.65, pit = mouse.y * 0.3 - 0.03;
    const dirYaw = Math.atan2(fwd.x, fwd.z) + yaw;
    wantLook.set(want.x + Math.sin(dirYaw) * 20, want.y + pit * 20 * (1 - lk * 0.6), want.z + Math.cos(dirYaw) * 20);
    rate = 40; wantFov = 72; own = true;
  } else {
    const p = player.root.position, sy = player.seatY, lk = player.look, bob = (player.bob || 0);      // camera heights hang off where the rider sits (his horse's real size), not a fixed number
    const fwd = _a.set(0, 0, 1).applyQuaternion(player.root.quaternion);
    if (autoCam) {      // the scripted ride-back: a lazy follow cam with its own damped yaw, looking a little ahead of where the horse is going
      const cx = Math.sin(FC.yaw), cz = Math.cos(FC.yaw), lag = Math.abs(wrapA(FC.hd - FC.yaw)), la = clamp(player.speed * 1.1, 0, 4.5) + 1.5 * FC.b, t = S.time, dist = 4.4 + 0.9 * Math.min(lag, 1.5);
      // handheld: a few centimetres and a fraction of a degree, very slow
      const hx = Math.sin(t * 0.37) * 0.04 + Math.sin(t * 0.91 + 1.3) * 0.02, hy = Math.sin(t * 0.29 + 2) * 0.03 + Math.sin(t * 0.77) * 0.015, hz = Math.sin(t * 0.43 + 4) * 0.04;
      _b.set(p.x - cx * dist + cz * 0.6 + hx, (sy + 1.08) + bob * 0.6 + hy, p.z - cz * dist - cx * 0.6 + hz);
      _c.set(p.x + Math.sin(FC.hd) * la - hz * 0.5, 1.8 + hy, p.z + Math.cos(FC.hd) * la + hx * 0.5);
      // eased in from the charge cam
      want.set(p.x + D * 0.72, (sy + 1.0) + bob * 1.1, p.z - D * 3.5).lerp(_b, FC.b); wantLook.set(p.x + D * 1.25, 1.95, p.z + D * 30).lerp(_c, FC.b); rate = lerp(9, 4.5, FC.b);
    } else if (player.manualPos) { want.set(p.x - fwd.x * 4.2 + fwd.z * 0.6, (sy + 1.18), p.z - fwd.z * 4.2 - fwd.x * 0.6); wantLook.set(p.x + fwd.x * 12, 1.9, p.z + fwd.z * 12); rate = 3.2; }
    else {
      const th = player.brace;      // thrusting: the camera closes in and swings a little wide, so the body going forward is seen
      want.set(p.x + D * (0.72 + 0.55 * th), (sy + 1.0) + bob * 1.1 - 0.28 * th, p.z - D * (3.5 - 0.8 * th));
      wantLook.set(p.x + D * 1.25, 1.95 + bob * 0.5, p.z + D * 30); rate = 9;
      if (lk > 0.02) {   // swing round in front of the rider to see what is behind him
        want.lerp(_b.set(p.x + D * 2.0, (sy + 0.78), p.z + D * 4.6), lk); wantLook.lerp(_c.set(p.x - D * 0.4, 1.9, p.z - D * 22), lk); rate = 12;
      }
    }
    if (C && C.cutWas) { C.cutWas = false; snap = true; }
    wantFov = 58 + clamp(player.speed / 9, 0, 1) * 7 - 5 * player.brace; own = true;
  }
  if (!own && S.mode !== 'menu' && camera.aspect < 1.3) wantFov = Math.min(84, 2 * Math.atan(Math.tan(wantFov * Math.PI / 360) * Math.sqrt(1.78 / camera.aspect)) * 180 / Math.PI);      // phone held upright: the cinematic cuts are framed for 16:9, so widen them (the judges' box and the announcer must fit across)
  if (S.focusOn) wantFov -= 9;
  if (!(Number.isFinite(camPos.x + camPos.y + camPos.z + camLook.x + camLook.y + camLook.z + want.x + want.y + want.z + wantLook.x + wantLook.y + wantLook.z + fov + wantFov))) { resetCamera(); want.copy(camPos); wantLook.copy(camLook); wantFov = 58; snap = true; if (glFix.errs++ < 5) console.error('[camera] not a number: reset'); }      // (a NaN would stay in the lerp for ever: the 3D view black, the HUD still running)
  if (snap || camPos.distanceTo(want) > 60) { camPos.copy(want); camLook.copy(wantLook); }
  const k = 1 - Math.exp(-rate * dtReal);
  camPos.lerp(want, k); camLook.lerp(wantLook, 1 - Math.exp(-rate * 1.2 * dtReal));
  if (C && C.fovSnap && !R) { C.fovSnap = false; fov = wantFov; }      // cut back from a replay: no zoom
  fov = damp(fov, wantFov, 4, dtReal);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.position.copy(camPos);
  { // the camera kicked along the blow (a spring: it goes with the blow and swings back, a little past)
    const kd = Math.min(dtReal, 0.033); S.kvx += (-S.kx * 190 - S.kvx * 11) * kd; S.kvy += (-S.ky * 190 - S.kvy * 11) * kd; S.kx += S.kvx * kd; S.ky += S.kvy * kd;
    if (Math.abs(S.kx) + Math.abs(S.ky) > 1e-4) { _a.set(1, 0, 0).applyQuaternion(camera.quaternion); _b.set(0, 1, 0).applyQuaternion(camera.quaternion); camera.position.addScaledVector(_a, clamp(S.kx, -1, 1) * 0.06).addScaledVector(_b, clamp(S.ky, -1, 1) * 0.06); }
  }
  if (S.shake > 0.005) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.25; camera.position.y += (Math.random() - 0.5) * S.shake * 0.25; S.shake *= Math.exp(-5 * dtReal); }
  camera.position.y = Math.max(0.3, camera.position.y);
  camera.lookAt(camLook);
  setMenuView(menuView);
  dofAim();
  if (own && player && M) camera.rotation.z += Math.sin(player.phase * TAU + 1) * 0.006 * clamp(player.speed / 11, 0, 1);   // the roll of the gallop
  if (own && player && M && player._hm) {      // a share of the horse's body pitch and roll (PHYS.ride.camShare), smoothed: the chase view feels the gallop without being bolted to it
    const D = PHYS.ride, hm = player._hm; camHM.p = damp(camHM.p, hm.pitch * D.camShare, D.camDamp, dtReal); camHM.r = damp(camHM.r, hm.roll * D.camShare, D.camDamp, dtReal);
    camera.rotateX(-camHM.p); camera.rotateZ(-camHM.r);
  }
  const fpNow = (own && S.fp) || !!(C && C.cut && C.cut.kind === 'visor'), rs = S.mode === 'replay' && R ? R.shot : 0;
  if (player) player.helm.visible = !fpNow && rs !== 6;      // (your own helm is not drawn from inside it; nor his, in his eyes)
  if (opp && opp.helm) opp.helm.visible = rs !== 7;
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
  const cap = S.mode === 'menu' ? Math.min(30, GFX.capFps || 30) : GFX.capFps;      // (Settings > Graphics > Frame rate; 0 = every screen refresh)
  const iv = cap ? 1000 / cap : 0, el = now - lastDraw;
  if (cap && el < iv - 0.5) return;
  lastDraw = !cap || el > iv * 2 ? now : lastDraw + iv;      // keep the beat (a fixed step) so 144 Hz gives 60, not 48; after a stall, start afresh
  simSpin();      // (?gfxsim=slow: a slow device's frame cost)
  const dt = clock.getDelta();
  frameTime(dt * 1000, S.paused || document.hidden || S.mode === 'menu');      // the live safety net (src/gfx.js); the capped menus would read as slow
  if (S.mode === 'menu' && attract.running) attract.sample(dt * 1000);      // (the menu joust has its own check, against the menus' 30 a second)
  try { frame(Math.min(dt, S.online && M ? 0.1 : 0.05)); } catch (e) {      // a throwing frame must not leave the screen black or stop the loop: log it, draw what there is
    if (glFix.errs++ < 5) console.error('[frame] failed:', e);
    drawFrame(0);
  }
}
// the benchmark, the safety net or Settings > Graphics changed something: apply what can change on the fly (trees and crowd change with the next venue build, the sky and models on the next load)
let shadowNow = GFX.shadow, shadowOnNow = GFX.shadowOn;
/** The post pipeline the graphics now ask for: a lighter one is switched down in place, a heavier one (or depth of field on or off) is built afresh. */
function syncPost() {
  const want = { level: GFX.post, dof: !!GFX.dof && GFX.post === 'full' };
  if (want.level === postCfg.level && want.dof === postCfg.dof) return;
  const lighter = postCfg.level !== 'plain' && (want.level === 'plain' || (want.level === 'lite' && postCfg.level === 'full' && !want.dof));
  if (lighter) post.lighten(want.level === 'plain' ? 'plain' : 'lite');
  else { post.lighten('plain'); post = createPost(renderer, scene, camera, { lite: want.level !== 'full', plain: want.level === 'plain', dof: want.dof }); G.post = post; }
  postCfg = want;
}
GFX.listeners.push((ev) => {
  renderer.setPixelRatio(GFX.pixelRatio()); syncPost(); resize();
  if (world && (GFX.shadow !== shadowNow || GFX.shadowOn !== shadowOnNow)) { if (world.setShadowSize) world.setShadowSize(GFX.shadow); if (world.setShadows) world.setShadows(GFX.shadowOn); }
  shadowNow = GFX.shadow; shadowOnNow = GFX.shadowOn;
  if (ev.kind === 'crowd' || ev.kind === 'tier') { if (world && world.thinCrowd) world.thinCrowd(); }      // (a thinner crowd: the stands are rebuilt in place)
  if (ev.kind === 'ov') return;
  console.info('[gfx] ' + (ev.kind === 'pr' ? 'frames averaged ' + ev.avg.toFixed(1) + ' ms: pixel ratio ' + ev.pr.toFixed(2) : ev.kind + ' ' + ev.tier + ' (' + ev.src + ')'));
  if (ev.kind === 'tier' && ev.src === 'net') toast('Graphics', 'Graphics lowered for smoother play — change in Settings', 8);
  if (G.gfxLog) G.gfxLog.push(ev); else G.gfxLog = [ev];
});
G.physLog = [];
G.hitboxes = (on = true) => { G._hbDebug = !!on; if (!on) { if (player) player.dbgUpdate(frameId, false); if (opp && opp.dbgUpdate) opp.dbgUpdate(frameId, false); } return G._hbDebug; };
G.step = (n = 1, dt = 1 / 60) => { G.manual = true; for (let i = 0; i < n; i++) frame(dt); };
function frame(dtReal) {
  if (specDefer) { const f = specDefer; specDefer = null; f(); }      // (a watched bout ends here, between frames, never inside a ride)
  touch.update();
  if (S.online && M && NET.pz) pzFrame();      // (online: the host starts a waiting pause; the clock)
  if (S.paused) {      // (online too: S.paused is the shared pause, both screens frozen)
    if (S.online) { netWatch(); pzSync(); }
    musicSync();      // (the pause menu has its own music)
    if (R && R.hl) { S.time += dtReal; updateReplay(dtReal, dtReal); replayDress(); updateCamera(dtReal); updateMask(); drawFrame(dtReal); }      // a highlight plays while the match stands still
    else drawFrame(0);
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
  const tsAudio = S.timeScale; S.hold = S.stopT > 0;
  if (S.hold) { S.stopT -= dtReal; if (!S.online && S.mode !== 'replay' && !R) S.timeScale = 0.03; }      // hit-stop: a beat of stillness on a big blow (online the match runs on: only the effects hang, below)
  const dt = dtReal * S.timeScale * (S.mode === 'menu' ? attract.scale() : 1);      // (the menu joust's slow moment at the strike)
  audio.setTimeScale(S.mode === 'replay' ? 1 : tsAudio);
  musicSync();
  if (S.focusOn) { S.hb = (S.hb || 0) - dtReal; if (S.hb <= 0) { S.hb = 0.75; audio.heartbeat(0.8); } }

  if (S.mode === 'intro') {
    S.introT += dtReal;
    if (introNew()) { if (S.introT < MOVE.end) ceremony.stage(S.introT, player, opp, dt); introCues(S.introT); }      // the knights' walk-out, then the cues
    player.update(dt); opp.update(dt);
    // hold Space / Enter to skip: the ring fills; a tap does nothing
    if (!M.spec) {
    S.skipHold = skipKey ? S.skipHold + dtReal : Math.max(0, S.skipHold - dtReal * 2.5);
    // online: a vote once cast stands (players rarely hold at the same moment); the ring says who is still to vote
    const tch = touchMode ? 'Hold the screen' : 'Hold <kbd>SPACE</kbd>';
    const lbl = !S.online ? null : S.skipWanted.me ? 'Waiting for your opponent to skip…' : S.skipWanted.them ? `Your opponent wants to skip · ${tch}` : null;
    ceremony.skipUI(true, S.skipWanted.me ? 1 : S.skipHold / SKIP_HOLD, lbl);
    if (S.skipHold >= SKIP_HOLD && !S.skipWanted.me) skipVote();
    }
    if (S.mode === 'intro' && S.introT > (M.spec ? SPEC_INTRO : introNew() ? INTRO_END : 8.4)) finishIntro();
  } else if (S.mode === 'menu') { if (S.celPrev) { if (S.menuView !== 'armoury' || !player) { S.celPrev = null; if (player) celClear(player); } else if (!celActive(player) && (S.celPrevT += dtReal) > 0.9) { S.celPrevT = 0; celStart(player, S.celPrev, { mode: 'course' }); } } if (attract.update(dtReal, dt)) { if (player) player.root.visible = false; } else { if (player) { player.root.visible = true; if (!celActive(player) && player.rear > 0) player.rear = Math.max(0, player.rear - dtReal * 2.5); player.update(dt); } } if ((S.menuView === 'armoury' || S.menuView === 'welcome')) previews.update(dtReal, menus.root, profile.arms, profile.body, { armour: profile.armour, helm: profile.helm }); if (S.menuView === 'stable') stable.update(dtReal, menus.root, menus.stableHorse(), profile.arms, menus.stableCap()); else stable.release(); }
  else if (S.mode === 'replay') updateReplay(dtReal, dt);
  else if (M && C) { if (C.patCd > 0) C.patCd -= dtReal; updateRide(dt, dtReal); }
  if (S.online && M) netTick(dtReal);

  field.update(dt, fieldEnv());
  if (M && player && opp) afterM.update(dt, { jousters: [player, opp], decide: aftermathDecide, replay: !!R || S.mode === 'replay', online: S.online, sides: [player, opp] }); else if (!M) afterM.reset();
  if (M) ceremony.update(dtReal, S.time);
  if (M && M.spec) specTick(dtReal);
  if (M) flagmen.update(dtReal, S.time, [player && player.root.position, opp && opp.root && opp.root.position]);
  if (M) { judges.update(dtReal, S.time); beatSkip(dtReal); }
  life.update(dt, { mode: M ? S.mode : 'menu', focusZ: attract.running ? attract.focusZ() : player && opp && M ? (player.z + opp.z) / 2 : 0, canCall: !!M && !M.result && (S.mode === 'ready' || S.mode === 'after') });
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
    cs.waveStart = S.waveT ?? -999; cs.focusZ = attract.running ? attract.focusZ() : player ? (opp && M ? (player.z + opp.z) / 2 : player.z) : 0;
    world.update(S.time, S.mode === 'replay' ? dtReal * 0.3 : dt);
    if (attract.running) world.focusShadow(attract.focus(_a));
    else if (player) world.focusShadow(S.mode === 'intro' && introNew() ? ceremony.focus(S.introT, player, opp, _a) : S.mode === 'intro' && S.introT < 4.2 && opp ? opp.root.position : (C && C.cine && S.mode === 'after' ? C.cine.rider.position : player.root.position));
  }
  audio.setMenuMix(S.mode === 'menu' && attract.running);      // the menu joust's sound sits under the menu music
  audio.update(dtReal, { excitement: S.excite, anticipation: S.antic || 0, speed: player && M && S.mode !== 'replay' ? player.speed : 0, favour: M ? M.favour : 0 });
  if (S.mode !== 'replay' && !R) fx.update(S.hold && S.online ? dt * 0.05 : dt);
  updateCamera(dtReal);
  speech.update();
  if (player) player.root.updateMatrixWorld(true);
  hudT -= dtReal; if (hudT <= 0) { hudT = 0.05; updateHud(false); }
  updateReticle(); updateMask();
  voice.update(dtReal); booth.update(dtReal); boothSubTick(); crowdVoices.update(dtReal); flushCall(); pumpToast();
  dazeStep(dtReal); celTick(dtReal);
  tlog();
  post.setFocus(S.focusOn ? 1 : 0); post.setSpeed(M && player && S.mode === 'charge' ? clamp((player.speed - 6.2) / 3, 0, 1) * 0.5 : 0);
  drawFrame(dtReal);
}

// ------------------------------------------------------------------ boot
const previews = createPreviews();
const stable = createStable();
let bgDone = false;      // the background downloads (trees, props, the player's rider) have finished: only then does the menu joust start fetching its own
attract = createAttract({ scene, camera, fx, S, audio: new Proxy({}, { get: (_, k) => { const v = audio[k]; return typeof v === 'function' ? v.bind(audio) : v; } }) /* `audio` is rebound once the sound module loads: always reach the live one */, makeRider: (def, dir) => { const j = makeRider(def, dir, false), hp = new THREE.Vector3(); j.onHoof = (i, leg) => { leg.hoof.getWorldPosition(hp); hp.y = 0.05; fx.hoof(hp, j.speed, j.dir, leg.hind); if (j.speed > 6 && leg.hind) fx.clods(hp, 3, j.dir * j.speed); if (attract && attract.running && !S.muted && audio.ctx) { const [d, pan] = hear(hp); audio.hoof(j.speed / 9, pan, d); } /* the menu joust's hoofbeats, distance-mixed like a match's; the bus is lowered by setMenuMix */ }; return j; },
  world: () => world, ready: () => bgDone && SCANS.ready && worldScans && !M && !preparing, shake: (v) => { S.shake = Math.max(S.shake, v); },
  crowd: (kind) => { const Rk = REACT[kind]; if (!Rk) return; if (!S.muted && audio.ctx) { const gasp = Rk.snd.some(x => x[0] === 'gasp'); for (const [snd, str, ld] of Rk.snd) audio.crowd(snd, str, (ld || 0) + (gasp && snd !== 'gasp' && kind !== 'near' ? 0.2 : 0), { fav: 0 }); }      // cheers and gasps (Settings > Sound > Crowd still silences them)
    S.excite = Math.max(S.excite, Rk.ex); S.scorer = 0; if (Rk.ex > 0.75) S.waveT = S.time; S.crowdEv = { id: ++crowdEvId, kind: { rouse: 'break', sandbag: 'taunt' }[kind] || kind, by: 0 }; } });
const touch = initTouch({ S, mouse, rpl: { active: () => !!R && S.mode === 'replay', orbit: (dx, dy) => freeOrbit(dx, dy), zoom: (k) => freeZoom(k) }, openReplays: () => openReplays('pause'), settings: () => openPauseSettings(), inMatch: () => !!M && S.mode !== 'menu', getC: () => C, spur, brace: doBrace, advance, pauseKey, autoPause: (v) => { if (!S.online) setPaused(v); }, initAudio, setSkip: (v) => { skipKey = v; },
  guard(v) { if (v && !keys.guard && C) C.guardAge = 0; keys.guard = v; }, portraitOk: () => S.mode === 'replay' || S.rpl || !$('card').classList.contains('hidden'),
  leave() { leaveLists(); } });
store.bindProfile(() => profile); store.onChange(() => { if (!M && player) rebuildPlayer(); });
const menus = initMenus({ touch: touchMode, fullscreen: goFullscreen, pauseBack: () => { if (S.pmSet) { pauseSettings(false); return true; } return false; },
  get profile() { return profile; }, saveProfile, rebuildPlayer, startMatch, startSpectate, newTable,
  setBody(b) { profile.body = cleanBody(b); if (player) applyBody(player, profile.body); saveProfile(); },      // (the Body section of the menus: looks only, so the rider is reshaped where he sits)
  online: onlineApi, account: accountApi,
  resetCircuit() { career.newSeasonFor(profile); profile.venue = 0; saveProfile(); },
  celPreview(id) { S.celPrev = id && CELEBS[id] ? id : null; S.celPrevT = 0; if (player) { celClear(player); if (S.celPrev) celStart(player, S.celPrev, { mode: 'course' }); } },      // the Armoury's Knight tab: the chosen celebration plays on the knight, again and again
  celPreviewId: () => S.celPrev || null,
  startPractice(restart) { if (restart) { profile.lesson = 0; saveProfile(); } startMatch(Math.max(0, venueIdx), null, false, true); },
  setVenue, musicVol, setMusic, musicNext, musicOff: () => musicOffNow, setMusicOff, musicMine, voicesOn, setVoices, commentaryOn, setCommentary, chatterOn, setChatter, replaysMode, setReplays, checkFeats() { withFeats(() => checkFeats(profile)); }, ui: (k) => { initAudio(); audio.ui(k); }, S, onShow: (name) => { S.menuView = name; },
});
$('soundBtn').addEventListener('click', () => setSound(S.muted));
$('musicBtn').addEventListener('click', () => { if (musicOffNow || musicVol() <= 0) { if (musicVol() <= 0) setMusic(60); setMusicOff(false); } else setMusicOff(true); if (menus && menus.refreshAudio) menus.refreshAudio(); });
showMusicBtn();
{ // show the saved sound state on the button (no save); browsers need a gesture before audio starts
  showSoundBtn(!S.muted);
  const wake = () => {
    if (audio === noop) return;      // the sound code is still loading: keep listening, this tap must not be spent on nothing
    window.removeEventListener('pointerdown', wake, true); window.removeEventListener('keydown', wake, true);
    if (S.muted) return;
    try { audio.init(); const c = audio.ctx; if (c && c.state === 'suspended') c.resume(); if (audio.music && audio.music.want) audio.music.play(audio.music.want); if (audio.music && audio.music.refreshMine) audio.music.refreshMine(); } catch (e) { /* audio not ready */ }      // refreshMine starts the YouTube radio inside this first gesture (it is a no-op for the game's own music)
  };
  window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true);      // capture: no overlay (welcome screen, menus) can swallow the first click
}
G.attract = attract;
G.drama = { conditionOf, lancesLeft, startTend, startBatter, doYield, openYield, swapHelm, dropLance: (side = 0) => dropLance(side ? opp : player, side), yieldOk, aiYields };
G.tl = TL; G.tlReset = () => { TL.length = 0; tlSig = ""; };
G.squireCheer = (sit) => squireCheer(sit, 0.2); initFps(); G.aftermath = afterM; G.lanceBits = () => lanceBits; G.online = Object.assign({ NET, S }, onlineApi); G.setSound = setSound; G.celFire = (who, id, mode) => celFire(who === 'opp' ? opp : player, id, mode || 'course'); G.celStop = celStop; G.celForce = (who, id, mode) => { const W = who === 'opp' ? opp : player, L = W === player ? opp : player, md = mode === 'match' ? 'match' : 'course'; celStop(); C.cel = { W, L, mode: md, t: 0, cam: true, hold: !S.online, lose: { at: 0.8 + Math.random() * 0.5 }, shot: 0 }; return celFire(W, id, md); }; G.celCourse = celCourse; G.celMatch = (w) => celMatch(w === 'opp' ? opp : player, w === 'opp' ? player : opp); G.fx = fx; G.endReplay = endReplay; G.post = post; G.startMatch = startMatch; G.startSpectate = startSpectate; G.advance = advance; G.spur = spur; G.interlude = interlude; G.startReplay = startReplay; G.openReplays = openReplays; G.openHL = openHL; G.closeHL = closeHL; G.closeReplays = closeReplays; G.setPaused = setPaused; G.replayView = replayView; G.burst = burst; G.menus = menus; G.saveProfile = saveProfile; Object.defineProperty(G, 'profile', { get: () => profile }); G.pauseKey = pauseKey;
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
await Promise.race([loadHeraldry(GFX.tier === 'low'), new Promise(r => setTimeout(r, 4000))]);      // the charge drawings: the first rider's arms are painted with them (later ones repaint themselves if it was slow)
if (skyP) await Promise.race([skyP, new Promise(r => setTimeout(r, 8000))]);
clearInterval(loadIv);
await skyList;
setVenue(Math.min(profile.venue || 0, VENUES.length - 1));
rebuildPlayer();
menus.show('main');
tick();
(async () => { const fresh = await account.handleReturn(); if (fresh) await account.afterSignIn(); else if (account.signedIn()) await account.fetchMe();
  const back = signin.takeReturn();      // he left for Google / Discord from the Play Online gate (or with an invite link): bring him back there, and into the invited room
  if (back && account.signedIn()) { lobbyOpen(); menus.show('online'); if (back.join && validCode(back.join)) lobbyJoin(back.join, { invite: true }); }
  else if (fresh || account.message) menus.show('account');
  await store.handleReturn({ show: menus.show }); })().catch((e) => console.warn('[account]', e));      // back from Google / Discord with ?auth=, back from Stripe Checkout with ?pay=, or a returning signed-in player
window.__tiltUp = true;      // the menu is up (the watchdog in index.html stops waiting)
bootDone();      // (src/gfx.js: this start finished loading)
try { performance.mark('tilt-menu'); } catch (e) { /* ignore */ }
const hideLoading = () => { const l = $('loading'); if (l) { l.classList.add('done'); setTimeout(() => l.remove(), 900); } };
requestAnimationFrame(hideLoading); setTimeout(hideLoading, 400);
{ // in the background: trees, props, and (low tier) the sky
  if (!GFX.skyWait) loadSky(VENUES[firstVenue].sky);
  const note = $('bgNote'), paint = () => { const st = loadStats('bg'); if (note) { note.textContent = SCANS.ready ? '' : `Loading trees and props ${Math.round(st.frac * 100)}%`; note.classList.toggle('hidden', SCANS.ready || S.mode !== 'menu'); } };
  const iv = setInterval(paint, 300);
  preloadRider(rigWant()).then((ok) => { if (ok && S.mode === 'menu' && !M) rebuildPlayer(); });      // the rigged rider, after the menu; the player is rebuilt in it
  preloadScans().then(() => { clearInterval(iv); paint(); refreshWorldWithScans(); startAudio(); const rg = () => (RIG.settled ? (bgDone = true) : setTimeout(rg, 500)); rg(); });
  if (GFX.tier === 'high') startAudio(); else setTimeout(startAudio, 20000);      // (below high: after the trees and props, or after 20 s at the latest)
}
