// Tooltips as little parchment scrolls.
//
// Markup (anywhere in the page, including HTML built later):
//   <span data-tip-title="Difficulty" data-tip="Squire is gentle.|Champion is a hard ride.">...</span>
//   data-tip is the body; "|" starts a new line (keep it to 1-3 short lines). data-tip-title is optional.
//   tip(title, body) returns a small "?" seal that carries a tip (for phones, where there is no hover); tipAttr(title, body) returns the attributes only.
// Behaviour:
//   desktop (mouse): hover (or keyboard focus) an element with data-tip and the scroll unrolls beside it; leaving rolls it up again.
//   phone (touch): tap a "?" seal, or long-press any element with data-tip, and the scroll unrolls; a tap anywhere else closes it.
//   An element that only has a native title="..." is promoted to a tip the first time it is touched, so old hints get the same look.
//   The "?" seals sit inside buttons: a tap on a seal never reaches the button underneath.
// Nothing here knows about the game. initTooltips() is called once from main.js.

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** The attributes of a tip (no wrapper): body lines separated by "|". */
export const tipAttr = (title, body) => `data-tip-title="${esc(title || '')}" data-tip="${esc(body || '')}"`;
/** A small "?" seal that opens a tip when tapped (always) or hovered (desktop). */
export const tip = (title, body, cls = '') => `<b class="qseal ${cls}" role="button" tabindex="0" aria-label="${esc(title || 'Help')}" ${tipAttr(title, body)}>?</b>`;

// A tip's text may carry a little markup (the coin icon and number): keep only inline, harmless elements and attributes, drop the rest as plain text.
const KEEP = new Set(['SPAN', 'B', 'I', 'EM', 'IMG', 'SVG', 'USE', 'PATH', 'BR']), KEEPA = /^(class|src|srcset|alt|viewbox|href|d|draggable|aria-hidden)$/i;
export function safeHtml(s) {
  const d = new DOMParser().parseFromString('<body>' + String(s) + '</body>', 'text/html').body;
  (function walk(n) { for (const c of [...n.childNodes]) { if (c.nodeType !== 1) continue; if (!KEEP.has(c.tagName.toUpperCase())) { c.replaceWith(document.createTextNode(c.textContent)); continue; } for (const a of [...c.attributes]) if (!KEEPA.test(a.name)) c.removeAttribute(a.name); walk(c); } })(d);
  return d.innerHTML;
}
/** The help strip along the bottom of a menu panel (EA-FC style): hovering or long-pressing a control fills it; with nothing under the pointer it shows the screen's own hint. */
function fillStrip(st, title, html) { st.innerHTML = `${title ? `<b class="ht">${esc(title)}</b>` : ''}<span class="hb">${html}</span>`; }
export function setHelpDefault(st, title, text) { if (!st) return; st.dataset.title = title || ''; st.dataset.body = text || ''; fillStrip(st, title, safeHtml(text || '')); }
const stripOf = (el) => { const h = el && el.closest && el.closest('#screen .scroll'); return h ? h.querySelector(':scope > .helpstrip') : null; };
let strip = null;

let box = null, cur = null, timer = 0, hideTimer = 0, pressTimer = 0, lastTouch = 0;

function ensure() {
  if (box) return box;
  box = document.createElement('div'); box.id = 'tipScroll'; box.setAttribute('role', 'tooltip'); box.className = 'hidden';
  box.innerHTML = '<i class="rod top"></i><div class="tsheet"><b class="tt"></b><div class="tb"></div></div><i class="rod bot"></i>';
  document.body.appendChild(box); return box;
}

function textOf(el) {
  if (el.dataset.tip === undefined && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }      // an old native hint becomes a scroll
  return { title: el.dataset.tipTitle || '', lines: String(el.dataset.tip || '').split('|').map((s) => s.trim()).filter(Boolean) };
}

function place(el) {
  const b = box, r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, m = 12;
  b.style.left = '0px'; b.style.top = '0px';
  const w = b.offsetWidth, h = b.offsetHeight;
  // the element's box in screen pixels: CSS zoom on a menu (small phones) makes getBoundingClientRect report zoomed or unzoomed values by browser; so compare with the window
  // beside the page the element is on (so the scroll never covers its neighbours), level with the element; else below or above the element itself
  const host = el.closest('.scroll'), hr = host ? host.getBoundingClientRect() : r;
  let x, y, side = 'r';
  if (hr.right + m + w <= vw - 6) { x = hr.right + m; y = r.top + r.height / 2 - h / 2; }
  else if (hr.left - m - w >= 6) { x = hr.left - m - w; y = r.top + r.height / 2 - h / 2; side = 'l'; }
  else { x = r.left + r.width / 2 - w / 2; if (r.bottom + m + h <= vh - 6) { y = r.bottom + m; side = 'b'; } else { y = r.top - m - h; side = 't'; } }
  x = Math.max(6, Math.min(vw - w - 6, x)); y = Math.max(6, Math.min(vh - h - 6, y));
  b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px'; b.dataset.side = side;
}

export function hideTip() {
  if (strip) { fillStrip(strip, strip.dataset.title, safeHtml(strip.dataset.body || '')); strip = null; cur = null; }
  clearTimeout(timer); clearTimeout(hideTimer); clearTimeout(pressTimer);
  if (!box || box.classList.contains('hidden')) { cur = null; return; }
  box.classList.remove('open'); cur = null;
  hideTimer = setTimeout(() => { if (!cur) box.classList.add('hidden'); }, 180);
}

export function showTip(el) {
  const { title, lines } = textOf(el); if (!title && !lines.length) return;
  const st = el.classList.contains('qseal') ? null : stripOf(el);      // a "?" seal is asked for on purpose: its scroll opens beside it, never down in the help strip
  if (st) { if (strip && strip !== st) fillStrip(strip, strip.dataset.title, safeHtml(strip.dataset.body || '')); strip = st; cur = el; if (box) { box.classList.remove('open'); box.classList.add('hidden'); } fillStrip(st, title, lines.map(safeHtml).join(' ')); return; }
  ensure(); clearTimeout(hideTimer); cur = el;
  box.querySelector('.tt').textContent = title; box.querySelector('.tt').style.display = title ? '' : 'none';
  box.querySelector('.tb').innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join('');
  box.classList.remove('hidden', 'open'); place(el);
  void box.offsetWidth; box.classList.add('open');
}

export function initTooltips() {
  if (window.__tiltTips) return; window.__tiltTips = true;
  const tipEl = (t) => (t && t.closest && !t.closest('#ytbox') ? t.closest('[data-tip],[title]:not(html):not(svg *)') : null);      // (never on the YouTube box: its iframe carries the video's title)
  const finePointer = () => !(document.body.classList.contains('touch')) && (!window.matchMedia || window.matchMedia('(hover: hover)').matches);
  // hover (desktop only; touch browsers fire fake mouse events after a tap, which are ignored for a moment)
  document.addEventListener('mouseover', (e) => {
    if (!finePointer() || performance.now() - lastTouch < 700) return;
    const el = tipEl(e.target); if (!el) return;
    if (el === cur) { clearTimeout(hideTimer); return; }
    clearTimeout(timer); timer = setTimeout(() => showTip(el), cur ? 40 : 320);
  });
  document.addEventListener('mouseout', (e) => {
    if (!finePointer()) return;
    const el = tipEl(e.target); if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    clearTimeout(timer); if (cur === el) hideTip();
  });
  document.addEventListener('focusin', (e) => { const el = e.target && e.target.classList && e.target.classList.contains('qseal') ? e.target : null; if (el && finePointer()) showTip(el); });
  document.addEventListener('focusout', () => hideTip());
  // a click on a seal opens its tip and goes no further (the seal may sit inside a button)
  document.addEventListener('click', (e) => {
    const seal = e.target.closest && e.target.closest('.qseal');
    if (seal) { e.stopPropagation(); e.preventDefault(); if (cur === seal) hideTip(); else showTip(seal); return; }
    if (cur && !(box && box.contains(e.target))) hideTip();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cur) { hideTip(); e.stopPropagation(); }
    const seal = e.target && e.target.classList && e.target.classList.contains('qseal');
    if (seal && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (cur === e.target) hideTip(); else showTip(e.target); }
  }, true);
  // long-press on any element that has a tip (phones)
  document.addEventListener('touchstart', (e) => {
    lastTouch = performance.now(); clearTimeout(pressTimer);
    const el = tipEl(e.target); if (!el || el.classList.contains('qseal')) return;
    pressTimer = setTimeout(() => { showTip(el); lastTouch = performance.now(); el.dataset.tipLong = String(Date.now()); }, 400);
  }, { passive: true });
  const endPress = () => { lastTouch = performance.now(); clearTimeout(pressTimer); };
  document.addEventListener('touchend', endPress, { passive: true }); document.addEventListener('touchmove', endPress, { passive: true }); document.addEventListener('touchcancel', endPress, { passive: true });
  // the click that ends a long-press must not also press the button
  document.addEventListener('click', (e) => {
    const el = tipEl(e.target); if (el && el.dataset.tipLong && Date.now() - +el.dataset.tipLong < 900) { e.stopPropagation(); e.preventDefault(); delete el.dataset.tipLong; }
  }, true);
  // the screen changed under the tip: roll it up
  const root = document.getElementById('screen');
  if (root && window.MutationObserver) new MutationObserver(() => { if (cur && !cur.isConnected) hideTip(); }).observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', hideTip); window.addEventListener('blur', hideTip);
}
