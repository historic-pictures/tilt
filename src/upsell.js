// upsell.js - "the free part is done": the one popup that offers the Knight's Charter, the one-off unlock of the full game.
//
// WHEN IT SHOWS
//   * by itself, at most once per browser session (sessionStorage `tilt.upsell`), and only on a menu screen, never during a match:
//       - after the free tournament (Smithfield) is over: the circuit screen of the finished event, a celebration first;
//       - or, if that was missed, the first time the career screen finds the next event locked;
//   * whenever the player opens it: a locked event or venue (menus.js, data-lock="charter"), and, if switched on, the daily cap below.
// Not for owners of the Charter. Online, ranked and the training arena are never gated (the commercial plan, docs/commercial-plan.md).
// Every purchase still goes through store.buy: sign-in first, then confirm.js confirmPay (item and price), then Stripe Checkout.
// Plain markup (.scroll .page .btn .btn-primary .plaque) with one scoped style block; desktop, phone portrait and phone landscape layouts.
import { PAY } from './config.js';
import * as store from './store.js';
import { openDonate } from './donate.js';
import { track } from './analytics.js';
import { VENUES } from './data.js';
import { FREE } from './cosmetics.js';

/**
 * Tunables.
 *   exhibitionDailyCap: free exhibition jousts ("Joust" on the main menu) a player without the Charter may start per local day. 0 = OFF (the default: the commercial plan
 *     advises against energy timers, docs/payments-setup.md "Optional: daily cap"). Online, ranked, practice and the free career event are never counted or capped.
 *   roadmapUrl: the marketing site's roadmap and mission page. Empty = the link is hidden (set it once the site is deployed).
 */
export const UPSELL = { exhibitionDailyCap: 0, roadmapUrl: '' };
const GAME = 'Joust Revival';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEEN = 'tilt.upsell';
const seen = () => { try { return sessionStorage.getItem(SEEN) === '1'; } catch (e) { return false; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN, '1'); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------------ the optional daily cap on free exhibition jousts
const DAYKEY = 'tilt.exday';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function dayCount() { try { const c = JSON.parse(localStorage.getItem(DAYKEY)); return c && c.day === today() ? c.n | 0 : 0; } catch (e) { return 0; } }
/** Call when a free exhibition joust is about to start. Returns true if it may start (and counts it), false if today's free jousts are used up (the popup opens). */
export function exhibitionAllowed(ctx = {}) {
  const cap = UPSELL.exhibitionDailyCap | 0;
  if (!PAY.live || cap <= 0 || store.has('charter')) return true;
  const n = dayCount();
  if (n >= cap) { openUpsell({ reason: 'daily_cap', n: cap, ...ctx }); return false; }
  try { localStorage.setItem(DAYKEY, JSON.stringify({ day: today(), n: n + 1 })); } catch (e) { /* ignore */ }
  return true;
}

// ------------------------------------------------------------------ the automatic moments (once per session)
/** menus.js, when the circuit screen is drawn: the free event finished (t.done at a free venue, the next one locked), or the career reaches a locked event. */
export function maybeAuto(t, ctx = {}) {
  if (!PAY.live || !t || store.has('charter') || seen()) return;
  let reason = '';
  if (t.done && t.v === FREE.events - 1 && store.locked.event(t.v + 1)) reason = 'finished_free';
  else if (store.locked.event(t.v)) reason = 'event';
  if (!reason) return;
  setTimeout(() => {      // after the screen has drawn; only if a menu is still up (a match never gets the popup)
    const scr = document.getElementById('screen');
    if (!scr || !scr.classList.contains('on') || scr.dataset.name !== 'circuit' || document.getElementById('upsell')) return;
    openUpsell({ reason, champion: !!t.champion, venue: t.v + (reason === 'finished_free' ? 1 : 0), auto: true, ...ctx });
  }, 700);
}

// ------------------------------------------------------------------ the sheet
const CSS = `
#upsell { position: fixed; inset: 0; z-index: 320; display: grid; place-items: center; padding: 14px; background: rgba(24, 14, 6, .62); }
#upsell .cf { position: relative; width: min(600px, 96vw); color: var(--ink); }
#upsell .page { max-height: 92vh; overflow-y: auto; padding: 30px 38px 22px; text-align: center; }
#upsell .crest { display: block; width: 74px; height: 74px; margin: -6px auto 2px; object-fit: contain; }
#upsell .kicker { font-family: var(--caps); font-size: 15px; letter-spacing: .14em; color: var(--red2); margin: 0; }
#upsell h3 { margin: 2px 0 6px; font-family: var(--display); font-weight: 700; font-size: 34px; line-height: 1.08; color: var(--red); }
#upsell .lede { font-size: 18px; margin: 0 auto 10px; max-width: 32em; }
#upsell .road { font-style: italic; color: var(--ink2); margin: 0 auto 10px; font-size: 17px; }
#upsell .offer { border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 10px 0 8px; margin: 8px 0 10px; }
#upsell .offer b.name { display: block; font-family: var(--caps); font-size: 21px; letter-spacing: .04em; }
#upsell .price { font-family: var(--caps); font-size: 30px; letter-spacing: .02em; }
#upsell .price s { font-size: 19px; color: var(--ink2); margin-left: 8px; }
#upsell .founder { display: inline-block; vertical-align: middle; margin-left: 8px; padding: 2px 10px; font-family: var(--caps); font-size: 13px; letter-spacing: .1em; background: var(--gold2); border: 1px solid var(--gold); border-radius: 10px; }
#upsell ul { list-style: none; text-align: left; margin: 6px auto 4px; padding: 0; max-width: 30em; font-size: 17px; }
#upsell li { position: relative; padding: 3px 0 3px 26px; }
#upsell li::before { content: ''; position: absolute; left: 6px; top: 10px; width: 9px; height: 9px; transform: rotate(45deg); background: var(--red); }
#upsell .btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
#upsell .btns .btn { min-height: 48px; font-size: 19px; cursor: pointer; }
#upsell .btns .btn.primary { min-width: 230px; }
#upsell .fine { font-size: 14px; color: var(--ink2); margin: 10px 0 0; }
#upsell .links { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; margin-top: 8px; font-size: 15px; }
#upsell .links a { color: var(--red2); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
#upsell .links img { width: 16px; height: 16px; vertical-align: -3px; margin-right: 4px; }
#upsell .err { color: var(--red); min-height: 1.1em; margin: 6px 0 0; font-size: 15px; }
#upsell .col { min-width: 0; }
@media (max-width: 520px) {
  #upsell { padding: 6px; }
  #upsell .page { padding: 24px 18px 16px; max-height: 94vh; }
  #upsell h3 { font-size: 28px; }
  #upsell .lede, #upsell ul { font-size: 16px; }
  #upsell .btns { flex-direction: column; } #upsell .btns .btn { width: 100%; min-width: 0; }
}
@media (max-height: 520px) and (orientation: landscape) {
  #upsell { padding: 6px; }
  #upsell .cf { width: min(860px, 98vw); }
  #upsell .page { display: grid; grid-template-columns: 1fr 1.1fr; gap: 0 22px; align-items: center; text-align: left; padding: 18px 26px 14px; max-height: 96vh; }
  #upsell .crest { width: 40px; height: 40px; margin: 0 0 2px; }
  #upsell .kicker { font-size: 12px; } #upsell h3 { font-size: 23px; } #upsell .lede, #upsell .road { font-size: 14px; margin: 0 0 4px; }
  #upsell .offer { margin: 4px 0; padding: 6px 0 4px; } #upsell .offer b.name { font-size: 16px; } #upsell .price { font-size: 23px; } #upsell .price s { font-size: 15px; }
  #upsell ul { font-size: 14px; margin: 0; } #upsell li { padding: 1px 0 1px 22px; } #upsell li::before { top: 7px; width: 7px; height: 7px; }
  #upsell .btns { flex-wrap: nowrap; gap: 8px; } #upsell .btns, #upsell .links { justify-content: flex-start; margin-top: 6px; }
  #upsell .btns .btn { min-height: 38px; font-size: 15px; padding: 5px 12px; } #upsell .btns .btn.primary { min-width: 0; }
  #upsell .err { min-height: 0; margin: 2px 0 0; } #upsell .fine { margin-top: 4px; font-size: 12px; } #upsell .links { font-size: 13px; margin-top: 4px; }
}`;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'upsellCss'; s.textContent = CSS; document.head.appendChild(s); };
const COIN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="9.2" fill="#e2bf5e" stroke="#7a5a1a" stroke-width="1.4"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#9a7424"/></svg>';

/** The words for each moment. */
function words(o) {
  const V = VENUES[Math.max(0, Math.min(VENUES.length - 1, o.venue | 0))], rest = VENUES.slice(FREE.events).map((v) => v.name.replace(/^(Passo|Golden)/, 'the $1').replace(/^The /, 'the '));
  const road = `The season continues: ${rest.slice(0, 3).join(', ')}…`;
  switch (o.reason) {
    case 'finished_free': return { kicker: o.champion ? 'Champion of Smithfield' : 'Smithfield is ridden', title: o.champion ? 'You\'ve conquered Smithfield' : 'Well ridden at Smithfield', lede: o.champion ? 'The heralds cry your name, and the road runs on across Europe.' : 'That was the free tournament, and the road runs on across Europe.', road };
    case 'event': return { kicker: 'The road goes on', title: `On to ${V.name}`, lede: `${V.name}, ${V.city}, and the rest of the season's calendar come with the full game.`, road };
    case 'venue': return { kicker: 'Another list awaits', title: `${V.name}, ${V.year}`, lede: `${V.city}. Every venue for a Joust comes with the full game.`, road: '' };
    case 'daily_cap': return { kicker: 'That\'s today\'s free jousts', title: 'Rest the horses', lede: `You've ridden ${o.n} free exhibition jousts today, and there are more tomorrow. The full game lifts the limit. Online and training are always free.`, road: '' };
    default: return { kicker: GAME, title: 'Unlock the full game', lede: 'The whole career and every venue.', road };
  }
}

let openNow = null;
/**
 * Open the popup. o: { reason: finished_free | event | venue | heraldry | daily_cap | store, venue, champion, n, auto, show(name) (menus.show, for the sign-in screen) }.
 * Resolves when it closes ('cta' | 'later').
 */
export function openUpsell(o = {}) {
  if (!PAY.live) return Promise.resolve();      // (src/config.js: the game is free, nothing is offered)
  if (store.has('charter') || openNow) return Promise.resolve('owned');
  style();
  if (o.auto) markSeen();
  const W = words(o), reason = o.reason || 'store';
  const back = document.createElement('div');
  back.id = 'upsell'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-labelledby', 'upsellTitle');
  document.body.appendChild(back);
  track('popup_shown', { reason, auto: !!o.auto });
  let err = '';
  const draw = (c) => {
    const P = (c && c.products || []).find((x) => x.id === 'charter') || { amount: 499, was: 699, founder: true }, cur = (c && c.currency) || 'usd';
    const price = `<span class="price">${store.money(P.amount, cur)}${P.was ? `<s>${store.money(P.was, cur)}</s>` : ''}</span>${P.founder ? '<span class="founder">Founder\'s price</span>' : ''}`;
    const roadmap = UPSELL.roadmapUrl ? `<a href="${esc(UPSELL.roadmapUrl)}" target="_blank" rel="noopener" data-u="roadmap">Our roadmap &amp; mission</a>` : '';
    back.innerHTML = `<div class="cf scroll"><i class="paper"></i><div class="page">
      <div class="col">
        <img class="crest" src="assets/ui/icons/emblem-128.webp" alt="" onerror="this.remove()">
        <p class="kicker">${esc(W.kicker)}</p>
        <h3 id="upsellTitle">${esc(W.title)}</h3>
        <p class="lede">${esc(W.lede)}</p>${W.road ? `<p class="road">${esc(W.road)}</p>` : ''}
        <div class="offer plaque"><b class="name">Knight's Charter: unlock the full game</b>${price}</div>
      </div>
      <div class="col">
        <ul>
          <li>The whole career: all ${VENUES.length} tournaments of the season, from London to Nuremberg</li>
          <li>Every venue for a Joust, not only ${esc(VENUES[0].name)}</li>
                    <li>One payment, no subscription, yours on every browser you sign in to</li>
        </ul>
        <div class="btns"><button class="btn primary btn-primary" data-u="cta">Unlock the full game</button><button class="btn" data-u="later">Maybe later</button></div>
        <p class="err" role="status">${esc(err)}</p>
        <p class="fine">Online play, ranked matches and the training arena stay free for everyone. ${c && c.test ? 'Test mode: no real money. ' : ''}You'll sign in, see the price once more, and pay on Stripe's secure page.</p>
        <div class="links">${roadmap}<a data-u="donate">${COIN}Support the game</a></div>
      </div></div></div>`;
  };
  const cat = store.catalogueNow(); draw(cat);
  if (!cat) store.catalogue().then((c) => { if (back.isConnected) draw(c); });
  setTimeout(() => { const b = back.querySelector('[data-u="cta"]'); if (b) b.focus(); }, 30);
  return new Promise((resolve) => {
    openNow = back;
    const close = (how) => { window.removeEventListener('keydown', onKey, true); back.remove(); openNow = null; resolve(how); };
    const later = () => { track('popup_dismiss', { reason }); close('later'); };
    const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); later(); } else e.stopImmediatePropagation(); };      // (no key reaches the game; Tab and Enter still work on the buttons)
    window.addEventListener('keydown', onKey, true);
    back.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target === back) return later();
      const t = e.target.closest('[data-u]'); if (!t) return;
      const u = t.dataset.u;
      if (u === 'later') return later();
      if (u === 'roadmap') { track('popup_roadmap', { reason }); return; }      // (the link opens in a new tab by itself)
      if (u === 'donate') { e.preventDefault(); close('donate'); openDonate({}); return; }
      if (u === 'cta') {
        track('popup_cta', { reason });
        back.style.display = 'none';      // the confirmation (or the sign-in screen) comes next
        const msg = await store.buy('charter', { source: 'popup:' + reason, needSignIn: () => { close('signin'); if (o.show) o.show('account'); } });
        if (!back.isConnected) return;
        back.style.display = '';
        if (msg) { err = msg; draw(store.catalogueNow()); }
      }
    });
  });
}
