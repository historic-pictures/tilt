// touch.js - the phone / tablet mode: a SPUR button, drag-to-aim, a BRACE button, pause, and tap-to-advance.
// Everything about touch input lives here; main.js only hands in what the game offers (see initTouch) and asks touchMode.
// ?touch=1 forces it on (desktop testing), ?touch=0 forces it off, otherwise a coarse primary pointer turns it on.

import { gi } from "./icons.js";

export const touchMode = (() => {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true; if (q === '0') return false;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) { return false; }
})();
if (touchMode) document.body.classList.add('touch');

// ---- aiming tunables (joystick: relative, with a dead zone and a speed curve; drag: finger travel)
export const JOY = { R: 62, dead: 0.14, speed: 1.5, curve: 1.7, accel: 0.45, accelT: 0.7, zoneX: 0.4, zoneY: 0.3 };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
/** 'joy' (default) or 'drag'. */
export const getAimMode = () => (lsGet('tilt.aim', 'joy') === 'drag' ? 'drag' : 'joy');
export const setAimMode = (m) => lsSet('tilt.aim', m === 'drag' ? 'drag' : 'joy');
export const AIM_SPEEDS = { slow: 0.7, normal: 1, fast: 1.45 };
export const getAimSpeed = () => { const v = lsGet('tilt.aimspeed', 'normal'); return AIM_SPEEDS[v] ? v : 'normal'; };
export const setAimSpeed = (v) => lsSet('tilt.aimspeed', AIM_SPEEDS[v] ? v : 'normal');
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = (() => { try { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)); } catch (e) { return false; } })();
/** Called when a match starts: the first two matches get small coach marks. */
export function noteMatch() { lsSet('tilt.coach', String((+lsGet('tilt.coach', '0') || 0) + 1)); }
const coachOn = () => (+lsGet('tilt.coach', '0') || 0) <= 2;

const AIM_SENS = 2.2;       // NDC travelled per screen width (x) or height (y) of finger travel
const TAP_PULL = 0.65;      // in the lists, a tap pulls the aim this far toward the tapped point (1 = straight onto it)

/** Full screen + landscape lock (both best-effort: iPhone Safari allows neither). */
export function goFullscreen() {
  if (isIOS || standalone || document.fullscreenElement) return;      // iPhone Safari has no Fullscreen API: Add to Home Screen is the way (see the tip)
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
    const lock = () => { try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } };
    if (p && p.then) p.then(lock, () => {}); else lock();
  } catch (e) { /* ignore */ }
}

/**
 * h = { S, openReplays(), mouse, inMatch(), getC(), spur(), brace(), advance(), setPaused(v), leave(), initAudio(), setSkip(v) }
 * Returns { update() }, to be called once a frame.
 */
export function initTouch(h) {
  if (!touchMode) return { update() {} };
  const S = h.S, body = document.body, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mk = (tag, id, html, parent) => { const e = document.createElement(tag); if (id) e.id = id; if (html) e.innerHTML = html; (parent || body).appendChild(e); return e; };

  // the aim / tap / hold layer sits just above the canvas, below every card and screen
  const layer = document.createElement('div'); layer.id = 'touchLayer';
  document.getElementById('c').insertAdjacentElement('afterend', layer);

  mk('div', 'turnPhone', '<div><svg class="rot" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="6" width="20" height="36" rx="4" class="ph"/><path d="M12 50a22 22 0 0 0 40 0" class="ar"/><path d="M52 50l-1-8 7 3z" class="ah"/></svg><b>Turn your phone sideways to ride</b><span>Joust Revival is ridden in landscape</span><button id="tRotLeave">Leave the lists</button></div>');
  const ui = mk('div', 'touchUI');
  const bSpur = mk('button', 'tSpur', gi('horse') + '<small>SPUR</small>', ui), bBrace = mk('button', 'tBrace', gi('joust') + '<small>BRACE</small>', ui), bShield = mk('button', 'tShield', gi('shield') + '<small>SHIELD</small>', ui), bPause = mk('button', 'tPause', '<i></i><i></i>', ui);
  bSpur.setAttribute('aria-label', 'Spur'); bBrace.setAttribute('aria-label', 'Brace and thrust'); bShield.setAttribute('aria-label', 'Raise shield (hold)'); bPause.setAttribute('aria-label', 'Pause');
  const joyEl = mk('div', 'tJoy', '<i class="knob"></i>', ui), joyHint = mk('div', 'tJoyHint', '<i></i>', ui);
  const coach = mk('div', 'tCoach', '', ui);
  const tipEl = isIOS && !standalone && lsGet('tilt.a2hs', '') !== '1' ? mk('div', 'tA2hs', '<span>For full screen, tap <b>Share</b> then <b>Add to Home Screen</b>.</span><button aria-label="Close">OK</button>', body) : null;
  if (tipEl) tipEl.querySelector('button').addEventListener('click', () => { lsSet('tilt.a2hs', '1'); tipEl.remove(); });
  mk('div', 'tPauseMenu', '<button id="tRide">Ride on</button><button id="tRpl">Replays</button><button id="tInstall">Install / Full screen</button><button id="tLeave">Leave the lists</button>', ui);

  const press = (el, fn, onUp) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); h.initAudio(); el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      fn(e);
    });
    const up = () => { if (el.classList.contains('down')) { el.classList.remove('down'); if (onUp) onUp(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press(bSpur, () => { if (S.mode === 'ready' || S.mode === 'charge') h.spur(); });
  press(bBrace, () => h.brace());
  press(bShield, () => h.guard(true), () => h.guard(false));
  press(document.getElementById('tRotLeave'), () => h.leave());
  press(bPause, () => { if (h.inMatch()) h.setPaused(!S.paused); });
  press(document.getElementById('tRide'), () => h.setPaused(false));
  press(document.getElementById('tRpl'), () => { if (h.openReplays) h.openReplays(); });
  press(document.getElementById('tLeave'), () => h.leave());
  // Install / Full screen: not installed -> the same explainer as the gate (dismissible here); installed (Android) -> toggle full screen; installed on iOS has nothing to offer
  const bInst = document.getElementById('tInstall'), canFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (standalone && (isIOS || !canFs)) bInst.remove(); else if (standalone) bInst.textContent = 'Full screen';
  press(bInst, () => {
    if (!standalone && window.TiltInstall) { window.TiltInstall.show(); return; }
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } } else goFullscreen();
  });

  // ---- the layer: one finger aims (relative, like a trackpad), any finger can tap or hold
  const pts = new Map(); let aim = null, skipHeld = false;
  // safe-area insets (notch, rounded corners, home bar), read once and on every resize
  const probe = mk('div', 'tSafe'); const safe = { l: 0, r: 0, t: 0, b: 0 };
  const readSafe = () => { const c = getComputedStyle(probe); safe.l = parseFloat(c.paddingLeft) || 0; safe.r = parseFloat(c.paddingRight) || 0; safe.t = parseFloat(c.paddingTop) || 0; safe.b = parseFloat(c.paddingBottom) || 0; };
  let joy = null;      // { id, cx, cy, nx, ny, held }: the floating stick (relative control: the thumb never has to be over the target)
  const joyShow = (on) => joyEl.classList.toggle('on', on);
  const joyKnob = () => { const k = joyEl.firstChild; k.style.transform = `translate(${(joy ? joy.nx : 0) * JOY.R}px, ${(joy ? joy.ny : 0) * JOY.R}px)`; };
  const aiming = () => { const C = h.getC(); return !S.paused && (S.mode === 'ready' || S.mode === 'charge') && !!C && !(C.pL && C.pL.done) && !C.mont && !C.beat; };
  const skippable = () => { const C = h.getC(); return S.mode === 'intro' || !!(C && (C.mont || C.beat)); };
  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.initAudio();
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const r = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0, skip: skippable(), aim: false };
    pts.set(e.pointerId, r);
    document.documentElement.style.setProperty('--tx', e.clientX + 'px'); document.documentElement.style.setProperty('--ty', e.clientY + 'px');      // (the hold-to-skip ring draws above the finger: ceremony.js skipUI)
    if (!document.fullscreenElement && S.mode !== 'menu') goFullscreen();      // Android: a touch is the user gesture the Fullscreen API wants
    if (getAimMode() === 'joy' && !joy && aiming() && !(h.rpl && h.rpl.active()) && e.clientX < window.innerWidth * JOY.zoneX && e.clientY > window.innerHeight * JOY.zoneY) {
      readSafe();
      const cx = clamp(e.clientX, safe.l + JOY.R + 8, window.innerWidth * JOY.zoneX), cy = clamp(e.clientY, JOY.R + 8, window.innerHeight - safe.b - JOY.R - 8);
      joy = { id: e.pointerId, cx, cy, nx: 0, ny: 0, full: 0 }; r.joy = true;
      joyEl.style.left = cx + 'px'; joyEl.style.top = cy + 'px'; joyKnob(); joyShow(true);
    }
  });
  layer.addEventListener('pointermove', (e) => {
    const r = pts.get(e.pointerId); if (!r) return; e.preventDefault();
    const dx = e.clientX - r.x, dy = e.clientY - r.y, rp = h.rpl && h.rpl.active() ? h.rpl : null;
    if (rp && pts.size >= 2) {      // a replay: two fingers pinch to zoom the free camera
      let o = null; for (const [id, q] of pts) if (id !== e.pointerId) { o = q; break; }
      const d0 = Math.hypot(r.x - o.x, r.y - o.y); r.x = e.clientX; r.y = e.clientY; const d1 = Math.hypot(r.x - o.x, r.y - o.y);
      r.moved += 99; if (d0 > 8 && d1 > 8) rp.zoom(d0 / d1); return;
    }
    r.x = e.clientX; r.y = e.clientY; r.moved += Math.hypot(dx, dy);
    if (joy && joy.id === e.pointerId) {
      const vx = e.clientX - joy.cx, vy = e.clientY - joy.cy, m = Math.hypot(vx, vy), k = m > JOY.R ? JOY.R / m : 1;
      joy.nx = vx * k / JOY.R; joy.ny = vy * k / JOY.R; joyKnob(); return;
    }
    if (getAimMode() === 'joy') return;      // joystick mode: only the stick aims
    if (rp) { if (r.moved >= 10) rp.orbit(dx, dy); return; }      // a replay: one finger turns the free camera (a tap still changes the angle)
    if (aim === null && r.moved >= 6) { aim = e.pointerId; r.aim = true; }      // any finger, anywhere: the first one to slide becomes the aiming finger
    if (r.aim && !S.paused) { h.mouse.x = clamp(h.mouse.x + dx / window.innerWidth * AIM_SENS, -1, 1); h.mouse.y = clamp(h.mouse.y - dy / window.innerHeight * AIM_SENS, -1, 1); }
  });
  const end = (e, cancelled) => {
    const r = pts.get(e.pointerId); if (!r) return; pts.delete(e.pointerId); if (aim === e.pointerId) aim = null;
    if (joy && joy.id === e.pointerId) { joy = null; joyShow(false); }
    if (cancelled || r.moved >= 14 || performance.now() - r.t >= 450) return;
    if (aiming() && getAimMode() === 'joy') return;      // (a tap with the stick in use does nothing; it is for steering only)
    if (aiming()) {      // in the lists a tap points the lance at that spot (most of the way: a drag fine-tunes it)
      const nx = r.x0 / window.innerWidth * 2 - 1, ny = -(r.y0 / window.innerHeight * 2 - 1);
      h.mouse.x = clamp(h.mouse.x + (nx - h.mouse.x) * TAP_PULL, -1, 1); h.mouse.y = clamp(h.mouse.y + (ny - h.mouse.y) * TAP_PULL, -1, 1);
      return;
    }
    if (!r.skip && S.mode !== 'charge' && (!S.paused || S.hl)) h.advance();
  };
  layer.addEventListener('pointerup', (e) => { e.preventDefault(); end(e, false); });
  layer.addEventListener('pointercancel', (e) => end(e, true));
  layer.addEventListener('lostpointercapture', (e) => end(e, true));
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());      // iOS pinch

  // ---- menu / HUD scale: shrink the parchment to fit a phone-sized window
  const fit = () => {
    const f = Math.max(0.6, Math.min(1, window.innerHeight / 640, window.innerWidth / 960));      // never below 0.6: the pages scroll instead
    document.documentElement.style.setProperty('--ui', f.toFixed(3));
    body.classList.toggle('small', f < 0.999);
  };
  // each menu screen: the largest zoom (<= 1) at which it fits with no scrolling; a screen too long even at 0.5 (the armoury, the
  // rules) keeps the window's --ui and scrolls. The zoom is set as --ui on the screen itself, so its max-height maths follow.
  const scr = document.getElementById('screen');
  const card = document.getElementById('card');
  const fitScreen = () => {
    fitEl(scr && scr.classList.contains('on') ? scr.querySelector(':scope > .scroll') : null);
    fitEl(card && !card.classList.contains('hidden') ? card : null);
  };
  const fitEl = (root) => {
    if (!root) return;
    const page = root.querySelector('.page'); if (!page) return;
    const over = () => { const r = root.getBoundingClientRect(); return page.scrollHeight > page.clientHeight + 2 || r.bottom > window.innerHeight + 1 || r.top < -1 || r.right > window.innerWidth + 1 || r.left < -1; };
    root.style.removeProperty('--ui'); root.style.zoom = '';
    if (!body.classList.contains('small') || body.classList.contains('compact') || body.classList.contains('portrait')) return;      // phones in landscape: pages stay 1:1 and scroll (ui.css); only tablets are shrunk to fit
    const keep = page.scrollTop;
    for (let z = 1; z >= 0.499; z -= 0.025) { root.style.setProperty('--ui', z.toFixed(3)); if (!over()) return; }
    root.style.removeProperty('--ui'); page.scrollTop = keep;
  };
  let fitQ = 0; const queueFit = () => { clearTimeout(fitQ); fitQ = setTimeout(fitScreen, 20); };
  if (scr) new MutationObserver(queueFit).observe(scr, { childList: true, attributes: true, attributeFilter: ['class', 'data-name'] });
  if (card) new MutationObserver(queueFit).observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const isPortrait = () => window.innerHeight > window.innerWidth;
  const refit = () => {
    fit(); readSafe();
    const por = isPortrait();
    body.classList.toggle('portrait', por); body.classList.toggle('compact', !por && window.innerHeight < 520);
    body.classList.toggle('narrow', window.innerWidth < 640);
    body.classList.toggle('short', por && window.innerHeight < 700);
    queueFit();
  };
  refit(); window.addEventListener('resize', refit); window.addEventListener('orientationchange', refit);

  // ---- the keyboard: while a text field is focused, the screen is sized to the visible part of the window (visualViewport), the
  // pickers fold away (body.kb) and the field and its confirm button stay in view
  const vv = window.visualViewport;
  const kbUpdate = () => {
    const ae = document.activeElement, on = !!(ae && ae.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/.test(ae.type || '') && scr && scr.contains(ae));
    body.classList.toggle('kb', on);
    const r = document.documentElement.style;
    r.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px'); r.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px');
    if (on) { try { ae.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
  };
  document.addEventListener('focusin', () => setTimeout(kbUpdate, 60)); document.addEventListener('focusout', () => setTimeout(kbUpdate, 60));
  if (vv) { vv.addEventListener('resize', kbUpdate); vv.addEventListener('scroll', kbUpdate); }
  kbUpdate();

  let last = '', lastT = performance.now(), autoPaused = false, wasIn = false, coachTxt = '', coachT = 0;
  const lockLandscape = () => { try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } };
  const unlock = () => { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* ignore */ } };
  return {
    /** A short hint at the top: shown for a few seconds, then it fades. */
    coach(txt, secs = 4) { if (!coachOn()) return; if (txt !== coachTxt) { coachTxt = txt; coach.textContent = txt; } coachT = secs; },
    update() {
      const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      const inM = h.inMatch();
      // phones in portrait may sit in menus, results and replays; the joust itself is ridden sideways
      const needRot = inM && isPortrait() && !h.portraitOk();
      if (needRot !== body.classList.contains('rotate-need')) {
        body.classList.toggle('rotate-need', needRot);
        if (needRot && !S.paused) { autoPaused = true; h.setPaused(true); }
        else if (!needRot && autoPaused) { autoPaused = false; if (S.paused) h.setPaused(false); }
      }
      if (inM !== wasIn) { wasIn = inM; if (inM) lockLandscape(); else unlock(); }
      // the stick: relative aim velocity with a dead zone, a power curve and a little acceleration at full deflection
      if (joy && !S.paused && aiming()) {
        const m = Math.hypot(joy.nx, joy.ny);
        if (m > JOY.dead) {
          const mm = (m - JOY.dead) / (1 - JOY.dead);
          joy.full = mm > 0.85 ? Math.min(JOY.accelT, joy.full + dt) : Math.max(0, joy.full - dt * 2);
          const v = JOY.speed * AIM_SPEEDS[getAimSpeed()] * Math.pow(mm, JOY.curve) * (1 + JOY.accel * joy.full / JOY.accelT);
          h.mouse.x = clamp(h.mouse.x + joy.nx / m * v * dt, -1, 1); h.mouse.y = clamp(h.mouse.y - joy.ny / m * v * dt, -1, 1);
        } else joy.full = 0;
      }
      if (joy && !aiming()) { joy = null; joyShow(false); }
      if (coachT > 0) { coachT -= dt; coach.classList.toggle('on', coachT > 0 && !S.paused); if (coachT <= 0) coachTxt = ''; }
      const sig = `${inM ? S.mode : 'menu'}|${S.paused}`;
      if (sig !== last) {
        last = sig;
        body.classList.toggle('touch-play', inM); body.classList.toggle('touch-paused', inM && S.paused);
        body.dataset.tmode = inM ? S.mode : 'menu';
        if (!inM) { pts.clear(); aim = null; joy = null; joyShow(false); }
        joyHint.classList.toggle('on', inM && getAimMode() === 'joy' && (S.mode === 'ready' || S.mode === 'charge') && !S.paused);
      }
      const want = inM && pts.size > 0 && skippable();
      if (want !== skipHeld) { skipHeld = want; h.setSkip(want); }
    },
  };
}
