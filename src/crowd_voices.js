// The stands' voices: shouts, chants, the officers' calls and the sellers, each from a place in the world (a spectator picked from crowd.js by who is shouting,
// the judges' table, a vendor's head). Shown as small labels that float where the voice comes from (no robot voice: the browser has one speech channel and
// it belongs to the herald and the booth); every shout also goes to host.play(id, pos, gain), a no-op until recorded clips exist.
// Loudness rises with the crowd's excitement (S.excite): more voices at once, bigger labels, and the gain passed to play().
// Also home of the booth's subtitle strip (boothUI) and the shared CSS.
import * as THREE from 'three';
import { SHOUT, CHANT, CRY, CROWD_VOICES, COLOUR_WORDS, VENDOR } from './crowd_lines.js';
import { CROWD, TEXT } from './channels.js';

const CSS = `
#booth { position: fixed; z-index: 7; left: 50%; bottom: 30px; transform: translateX(-50%); max-width: min(620px, calc(100vw - 32px)); padding: 4px 12px 5px; text-align: center;
  font: italic 15px/1.3 var(--body, Georgia, serif); color: #f3ead2; background: rgba(18, 13, 8, .66); border-radius: 4px; pointer-events: none; opacity: 0; transition: opacity .3s, bottom .3s; text-shadow: 0 1px 2px #000; }
#ticker.on ~ #booth { bottom: 96px; }
#booth.on { opacity: .96; }
#booth b { font: normal 10px/1 var(--caps, Georgia, serif); letter-spacing: .14em; color: #e2bf5e; margin-right: 8px; }
#booth.C b { color: #d9a48a; }
.cvl { position: fixed; z-index: 5; left: 0; top: 0; pointer-events: none; white-space: nowrap; font: italic 600 14px/1.15 var(--body, Georgia, serif); color: #fff6dc;
  text-shadow: 0 1px 3px #000, 0 0 6px rgba(0,0,0,.8); opacity: 0; transition: opacity .25s; text-align: center; }
.cvl i { display: block; font: normal 8px/1 var(--caps, Georgia, serif); letter-spacing: .14em; color: #e2bf5e; opacity: .85; font-style: normal; }
.cvl.on { opacity: 1; } .cvl.off { opacity: 0 !important; }
.cvl.official { color: #ffe9a8; } .cvl.official i { color: #ff9a7a; }
.cvl.vendor { color: #e8f0d0; } .cvl.rival { color: #ffc0b0; } .cvl.lady { color: #ffd8ec; }
@media (max-width: 700px) { #booth { font-size: 13px; } .cvl { font-size: 12px; } }
`;
let cssDone = false;
function css() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

/** The booth's subtitle strip: small, under (or just above) the ticker. */
export function boothUI() {
  css();
  const el = document.createElement('div'); el.id = 'booth'; el.innerHTML = '<b></b><span></span>'; document.body.appendChild(el);
  return {
    show(label, text, spk) { el.firstChild.textContent = label; el.lastChild.textContent = text; el.className = 'on ' + (spk || ''); },
    hide() { el.classList.remove('on'); },
  };
}

const pickA = (a) => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const KIND_POOL = { break: 'break', bothbreak: 'break', helm: 'helm', attaint: 'attaint', glance: 'glance', near: 'near', miss: 'miss', bothmiss: 'bothMiss', tilt: 'tilt', foul: 'foul', unhorse: 'unhorse', win: 'win', loss: 'loss', start: 'start', salute: 'gallery', rouse: 'chant', away: 'away' };
const BIG = { break: 1, bothbreak: 1, helm: 1, unhorse: 1, win: 1, foul: 0.8, start: 0.7, rouse: 0.8, away: 0.6 };

/** Plain colours of a shield for the commons: "red and white". */
export function colourWords(arms, tinctures) {
  const nm = (hex) => { const t = tinctures.find(x => x[1] === hex); return t ? (COLOUR_WORDS[t[0]] || t[0].toLowerCase()) : null; };
  const a = nm(arms.c1), b = nm(arms.c2);
  return a && b && a !== b ? `${a} and ${b}` : a || b || 'colours';
}
/** A knight's war cry (by his land). */
export const cryOf = (land) => pickA(CRY[land] || CRY.any);

/**
 * host = { spot(cls[], kind, side, nearZ) -> { x, y, z, side } | null, excite() 0..1, enabled(), phase(), vars() { you, youKnown, him, colours, hisColours, land, hisLand, favour },
 *          focusZ(), play(id, pos, gain) (optional) }
 */
export function createCrowdVoices(camera, host) {
  css();
  const N = 8, L = [], v = new THREE.Vector3();
  for (let i = 0; i < N; i++) { const el = document.createElement('div'); el.className = 'cvl'; el.innerHTML = '<i></i><span></span>'; document.body.appendChild(el); L.push({ el, pos: new THREE.Vector3(), on: false, t0: 0, life: 0, sc: 1 }); }
  const CV = { t: 0, log: [], usedSh: new Map(), idleT: 6, queue: [] };

  function label(text, tag, pos, style = '', gain = 0.6, life = null, ok = false) {
    // src/channels.js: floating text shouts are cut to a few short war cries / name chants (ok = it comes from chant()), only when the stands are excited, one at a time. Officials/vendors/rivals/ladies pass ok = true only if their channel is switched on.
    if (!ok) { if (!CROWD.shouts || host.excite() < CROWD.shoutExcite || L.filter(x => x.on).length >= CROWD.maxShoutLabels) return; }
    let s = L.find(x => !x.on); if (!s) { s = L.reduce((a, b) => (a.t0 < b.t0 ? a : b)); }
    s.on = true; s.t0 = CV.t; s.life = life ?? Math.min(3.6, 1.3 + 0.28 * text.split(/\s+/).length); s.pos.copy(pos); s.sc = 0.82 + 0.42 * gain;
    s.el.className = 'cvl on ' + style; s.el.firstChild.textContent = tag || ''; s.el.lastChild.textContent = text;
    CV.log.push({ t: +CV.t.toFixed(2), phase: host.phase(), tag, text, style, gain: +gain.toFixed(2) }); if (CV.log.length > 3000) CV.log.shift();
    place(s);
  }
  function place(s) {
    v.copy(s.pos); camera.updateMatrixWorld(); const d = v.distanceTo(camera.position); v.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || d > 95) { s.el.classList.add('off'); return; }
    s.el.classList.remove('off');
    const k = s.sc * Math.max(0.7, Math.min(1.25, 14 / Math.max(6, d)));
    const half = (s.el.offsetWidth || 120) * k / 2 + 8, x = Math.max(half, Math.min(innerWidth - half, (v.x + 1) / 2 * innerWidth));      // kept on screen
    s.el.style.transform = `translate(${x.toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
  }
  const gainNow = () => 0.35 + 0.65 * Math.max(0, Math.min(1, host.excite()));

  /** One shout from SHOUT[pool]: never the same twice running in a match (as far as the pool allows). */
  function pickShout(pool) {
    const P = SHOUT[pool] || pool; if (!P || !P.length) return null;
    const key = typeof pool === 'string' ? pool : 'x', u = CV.usedSh.get(key) || []; CV.usedSh.set(key, u);
    let c = P.map((_, i) => i).filter(i => !u.includes(i)); if (!c.length) { u.length = 0; c = P.map((_, i) => i); }
    const i = pickA(c); u.push(i); return P[i];
  }
  function fillShout(e, who) {
    const V = host.vars(), name = who < 0 ? V.him : V.you;
    const vars = { name, you: V.youKnown ? V.you : null, colours: who < 0 ? V.hisColours : V.colours, cry: cryOf(who < 0 ? V.hisLand : V.land) };
    const f = (t) => { let miss = false; const o = t.replace(/\{(\w+)\}/g, (_, k) => { if (!vars[k]) { miss = true; return ''; } return vars[k]; }); return miss ? null : o; };
    return f(e[1]) ?? (e[2] ? f(e[2]) : null);
  }
  /** A voice of type `type` speaks `text` from the stands (side: +1 / -1 / 0 any). */
  function voice(type, text, side = 0, style = '', delay = 0, gain = gainNow(), alt = null) {
    const chantNow = CV._chant;      // (captured now: a delayed shout is still part of the chant that asked for it)
    if (!chantNow && !host.play) return;      // only chants / war cries get a label (every shout is also played as a recorded clip when there is one)
    const T = CROWD_VOICES[type] || CROWD_VOICES.man, sp = host.spot(T.cls, type === 'dog' ? -1 : T.kind, side, host.focusZ());
    if (!sp) return;
    const pos = new THREE.Vector3(sp.x, sp.y + (type === 'dog' ? -1.0 : 0), sp.z);
    const go = () => { if (chantNow) label(text, T.tag, pos, style, gain); if (host.play) host.play(text, alt, pos, gain); };      // alt: the name-free words of a templated shout (that is what is recorded)
    if (delay > 0) CV.queue.push({ at: CV.t + delay, go }); else go();
  }
  CV.voice = voice;

  /** The stands react to a stroke or a moment (the same kinds as main.js react()). by: whose it is (+1 you, -1 him, 0 both). */
  CV.react = function react(kind, by = 0) {
    if (!host.enabled()) return;
    const pool = KIND_POOL[kind]; if (!pool) return;
    const ex = host.excite(), big = BIG[kind] || 0.4, n = Math.max(1, Math.min(4, Math.round(0.6 + ex * 3 * big)));
    if (pool === 'chant') { CV.chant(by >= 0 ? 1 : -1, 2); return; }
    for (let k = 0; k < n; k++) {
      const e = pickShout(pool); if (!e) break;
      const text = fillShout(e, by || 1); if (!text) continue;
      voice(e[0], text, 0, e[0] === 'lady' ? 'lady' : '', k === 0 ? rnd(0.05, 0.25) : rnd(0.3, 1.3), undefined, e[2]);
    }
    if ((kind === 'break' || kind === 'helm') && by > 0 && Math.random() < 0.45) { const g = pickShout('gallery'); if (g) voice(g[0], fillShout(g, 1) || g[1], 0, 'lady', rnd(1.0, 1.8)); }
    if ((kind === 'break' || kind === 'helm' || kind === 'unhorse') && by !== 0 && Math.random() < 0.5) CV.chant(by, 1, rnd(1.6, 2.6));
    if (kind === 'win' && Math.random() < 0.6) { const e = pickShout('largesse'); if (e) voice(e[0], e[1], 0, '', rnd(1.5, 2.5)); }
  };
  /** Supporters chant for a side: n voices, their name, their colours, their war cry. */
  CV.chant = function chant(side, n = 2, delay = 0) {
    if (!host.enabled()) return;
    CV._chant = true; try { chantInner(side, n, delay); } finally { CV._chant = false; }
  };
  function chantInner(side, n, delay) {
    const P = side < 0 ? CHANT.him : CHANT.you;
    for (let k = 0; k < n; k++) { const e = pickA(P), text = fillShout(e, side); if (text) voice(e[0], text, 0, '', delay + k * rnd(0.3, 0.7), undefined, e[2]); }
    if (Math.random() < 0.25) { const e = pickA(CHANT.honour); voice(e[0], e[1], 0, 'lady', delay + 0.8); }
  };
  /** A man of the lists calls (the marshal's "Ho!", the judges): text at a world position. */
  CV.official = function official(text, pos, tag = 'THE MARSHAL', delay = 0) {
    if (!TEXT.marshal || !host.enabled() || !pos) return;      // the marshal's and judges' floating calls are off (src/channels.js)
    const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    const go = () => { label(text, tag, p, 'official', 0.9, 2.2, true); if (host.play) host.play('official', p, 0.9); };
    if (delay > 0) CV.queue.push({ at: CV.t + delay, go }); else go();
  };
  /** Any line at a position (a seller, his squire jeering, your lady): style 'vendor' | 'rival' | 'lady'. */
  CV.say = function say(text, tag, pos, style = '', gain = 0.7, delay = 0) {
    if (!host.enabled() || !pos || !TEXT[{ vendor: 'vendors', rival: 'rival', lady: 'lady' }[style] || 'retinue']) return false;      // a seller / his squire / a lady: each its own channel (src/channels.js)
    const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), go = () => label(text, tag, p, style, gain, null, true);
    if (delay > 0) CV.queue.push({ at: CV.t + delay, go }); else go();
    return true;
  };

  /** Between courses the stands talk: hecklers, betting men, children, the dog, the sellers you cannot see, the odd chant for the favourite. */
  function idle(P) {
    const ex = host.excite(); CV.idleT = rnd(3.5, 8) / (0.7 + ex * 0.8);
    if (L.filter(s => s.on).length >= 2) return;
    const r = Math.random();
    if (r < 0.15) { const fav = host.vars().favour; CV.chant(fav >= 0 ? 1 : -1, 1); return; }
    if (r < 0.28) { const k = pickA(['ale', 'nuts', 'wafers']), sp = host.spot([0, 1], 1, 0, host.focusZ()); if (sp && TEXT.vendors) label(pickA(VENDOR[k]), { ale: 'AN ALE-WIFE', nuts: 'A NUT-SELLER', wafers: 'A WAFERER' }[k], new THREE.Vector3(sp.x, sp.y, sp.z), 'vendor', 0.5); return; }
    const e = pickShout(P === 'ready' && Math.random() < 0.45 ? 'ready' : P === 'intro' && Math.random() < 0.5 ? 'start' : 'idle'); if (!e) return;
    const text = fillShout(e, 1); if (text) voice(e[0], text, 0, e[0] === 'lady' ? 'lady' : '', 0, undefined, e[2]);
  }

  CV.update = function update(dt) {
    CV.t += dt;
    for (let i = 0; i < CV.queue.length; i++) if (CV.t >= CV.queue[i].at) { const q = CV.queue.splice(i--, 1)[0]; if (host.enabled()) q.go(); }
    for (const s of L) if (s.on) { if (CV.t > s.t0 + s.life) { s.on = false; s.el.classList.remove('on'); } else place(s); }
    const P = host.phase();
    if (!host.enabled() || !['ready', 'after', 'intro'].includes(P)) return;
    CV.idleT -= dt; if (CV.idleT <= 0) idle(P);
  };
  CV.reset = function reset() { CV.queue.length = 0; CV.usedSh.clear(); CV.idleT = 5; for (const s of L) { s.on = false; s.el.classList.remove('on'); } };
  CV.hideAll = () => { CV.queue.length = 0; for (const s of L) { s.on = false; s.el.classList.remove('on'); } };
  return CV;
}
