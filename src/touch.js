// touch.js - the phone / tablet mode: a SPUR button, drag-to-aim, a BRACE button, pause, and tap-to-advance.
// Everything about touch input lives here; main.js only hands in what the game offers (see initTouch) and asks touchMode.
// ?touch=1 forces it on (desktop testing), ?touch=0 forces it off, otherwise a coarse primary pointer turns it on.

export const touchMode = (() => {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true; if (q === '0') return false;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) { return false; }
})();
if (touchMode) document.body.classList.add('touch');

const AIM_SENS = 2.2;       // NDC travelled per screen width (x) or height (y) of finger travel
const AIM_ZONE = 0.6;       // a drag that starts in the left 60% of the screen aims; the rest only taps / holds

/** Full screen + landscape lock (both best-effort: iPhone Safari allows neither). */
export function goFullscreen() {
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
    const lock = () => { try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } };
    if (p && p.then) p.then(lock, () => {}); else lock();
  } catch (e) { /* ignore */ }
}

/**
 * h = { S, mouse, inMatch(), getC(), spur(), brace(), advance(), setPaused(v), leave(), initAudio(), setSkip(v) }
 * Returns { update() }, to be called once a frame.
 */
export function initTouch(h) {
  if (!touchMode) return { update() {} };
  const S = h.S, body = document.body, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mk = (tag, id, html, parent) => { const e = document.createElement(tag); if (id) e.id = id; if (html) e.innerHTML = html; (parent || body).appendChild(e); return e; };

  // the aim / tap / hold layer sits just above the canvas, below every card and screen
  const layer = document.createElement('div'); layer.id = 'touchLayer';
  document.getElementById('c').insertAdjacentElement('afterend', layer);

  mk('div', 'turnPhone', '<div><b>Turn your phone sideways</b><span>TILT is played in landscape</span></div>');
  const ui = mk('div', 'touchUI');
  const bSpur = mk('button', 'tSpur', 'SPUR', ui), bBrace = mk('button', 'tBrace', 'BRACE', ui), bPause = mk('button', 'tPause', '<i></i><i></i>', ui);
  bSpur.setAttribute('aria-label', 'Spur'); bBrace.setAttribute('aria-label', 'Brace'); bPause.setAttribute('aria-label', 'Pause');
  mk('div', 'tPauseMenu', '<button id="tRide">Ride on</button><button id="tLeave">Leave the lists</button>', ui);

  const press = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); h.initAudio(); el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      fn(e);
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press(bSpur, () => { if (S.mode === 'ready' || S.mode === 'charge') h.spur(); });
  press(bBrace, () => h.brace());
  press(bPause, () => { if (h.inMatch()) h.setPaused(!S.paused); });
  press(document.getElementById('tRide'), () => h.setPaused(false));
  press(document.getElementById('tLeave'), () => h.leave());

  // ---- the layer: one finger aims (relative, like a trackpad), any finger can tap or hold
  const pts = new Map(); let aim = null, skipHeld = false;
  const skippable = () => { const C = h.getC(); return S.mode === 'intro' || !!(C && (C.mont || C.beat)); };
  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.initAudio();
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const r = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, skip: skippable(), aim: false };
    if (aim === null && e.clientX < window.innerWidth * AIM_ZONE) { aim = e.pointerId; r.aim = true; }
    pts.set(e.pointerId, r);
  });
  layer.addEventListener('pointermove', (e) => {
    const r = pts.get(e.pointerId); if (!r) return; e.preventDefault();
    const dx = e.clientX - r.x, dy = e.clientY - r.y; r.x = e.clientX; r.y = e.clientY; r.moved += Math.hypot(dx, dy);
    if (r.aim && !S.paused) { h.mouse.x = clamp(h.mouse.x + dx / window.innerWidth * AIM_SENS, -1, 1); h.mouse.y = clamp(h.mouse.y - dy / window.innerHeight * AIM_SENS, -1, 1); }
  });
  const end = (e, cancelled) => {
    const r = pts.get(e.pointerId); if (!r) return; pts.delete(e.pointerId); if (aim === e.pointerId) aim = null;
    if (!cancelled && r.moved < 14 && performance.now() - r.t < 450 && !r.skip && S.mode !== 'charge' && !S.paused) h.advance();
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
    if (!body.classList.contains('small')) return;
    const keep = page.scrollTop;
    for (let z = 1; z >= 0.499; z -= 0.025) { root.style.setProperty('--ui', z.toFixed(3)); if (!over()) return; }
    root.style.removeProperty('--ui'); page.scrollTop = keep;
  };
  let fitQ = 0; const queueFit = () => { clearTimeout(fitQ); fitQ = setTimeout(fitScreen, 20); };
  if (scr) new MutationObserver(queueFit).observe(scr, { childList: true, attributes: true, attributeFilter: ['class', 'data-name'] });
  if (card) new MutationObserver(queueFit).observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const refit = () => { fit(); body.classList.toggle('compact', window.innerHeight < 520); queueFit(); };
  refit(); window.addEventListener('resize', refit); window.addEventListener('orientationchange', refit);

  let last = '';
  return {
    update() {
      const inM = h.inMatch(), sig = `${inM ? S.mode : 'menu'}|${S.paused}`;
      if (sig !== last) {
        last = sig;
        body.classList.toggle('touch-play', inM); body.classList.toggle('touch-paused', inM && S.paused);
        body.dataset.tmode = inM ? S.mode : 'menu';
        if (!inM) { pts.clear(); aim = null; }
      }
      const want = inM && pts.size > 0 && skippable();
      if (want !== skipHeld) { skipHeld = want; h.setSkip(want); }
    },
  };
}
