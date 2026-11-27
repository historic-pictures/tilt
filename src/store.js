// store.js - what has been bought, the store screen, and the trip to Stripe Checkout and back.
//
// THE SERVER IS THE AUTHORITY. What an account owns comes from the Worker (GET /pay/entitlements, also inside /me), which grants an item only when Stripe's signed webhook
// says it is paid (server/tilt-ranks/pay.js). This file keeps a copy (localStorage `tilt.ent`, tied to the account id, and profile.ent) so the game still knows while the
// server is unreachable. A guest owns nothing: buying needs an account, so a purchase follows the player to any browser.
// PRICES come from the server (GET /pay/products). The table below is only shown when the server cannot be reached, and nothing can be bought then.
// Every purchase is confirmed first (confirm.js confirmPay: the item and its price), then the browser goes to Stripe's own page; it comes back with ?pay=ok|cancel.
// Nothing bought changes a joust: the Charter opens single-player content, the packs change looks. Online and ranked play are the same for everybody.
// Markup is plain (.panel .row .btn .btn-primary .pick) with one small scoped style block, so the UI skin can restyle it.
import * as account from './account.js';
import { confirmPay } from './confirm.js';
import { FREE, PACKS } from './cosmetics.js';
import { PAY } from './config.js';
import { drawCrest } from './util.js';
import { VENUES } from './data.js';
import { track } from './analytics.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const money = (cents, cur = 'usd') => (cur === 'usd' ? '$' : cur.toUpperCase() + ' ') + (cents / 100).toFixed(2);
const KEY = 'tilt.ent';

// ------------------------------------------------------------------ what this account owns
let ent = { acct: '', skus: [], badges: [], at: 0 };
try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && Array.isArray(c.skus)) ent = c; } catch (e) { /* none */ }
const mine = () => { const a = account.info(); return a && ent.acct === a.id ? ent : { skus: [], badges: [] }; };
let profileRef = null;
/** main.js: the live profile, so the copy is kept in it too (profile.ent). */
export function bindProfile(getter) { profileRef = getter; }
function setEnt(e, acctId) {
  const before = ent.acct + '|' + ent.skus.join() + '|' + ent.badges.join();
  ent = { acct: acctId, skus: Array.isArray(e && e.skus) ? e.skus : [], badges: Array.isArray(e && e.badges) ? e.badges : [], at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(ent)); } catch (er) { /* ignore */ }
  const p = profileRef && profileRef(); if (p) p.ent = { skus: ent.skus.slice(), badges: ent.badges.slice() };
  if (before !== ent.acct + '|' + ent.skus.join() + '|' + ent.badges.join()) for (const f of listeners) { try { f(); } catch (er) { /* ignore */ } }      // only when something changed
}
const listeners = [];
export const onChange = (f) => listeners.push(f);
account.on('sync', (me) => { if (me && me.entitlements && me.account) setEnt(me.entitlements, me.account.id); });

/** Does the signed-in account own this item? (charter, herald, rolls, finishes, patron) */
/** (PAY.live false: the game is free, so everything is owned and no badge is shown; src/config.js) */
export const has = (sku) => !PAY.live || mine().skus.includes(sku);
export const badges = () => (PAY.live ? mine().badges.slice() : []);
/** The gates. The first career event and the first lists are free; the Charter opens the rest. (The heraldry editor is free; the Herald's Book and Rolls of Arms open its fancy pieces, cosmetics.js allowedArms.) */
export const locked = {
  event: (v) => v >= FREE.events && !has('charter'),
  venue: (i) => i >= FREE.venues && !has('charter'),
};
/** Ask the server again (the "Restore purchases" button, and after Checkout). Resolves true if the server answered. */
export async function refresh() {
  if (!PAY.live) return false;
  if (!account.signedIn()) return false;
  const r = await account.api('GET', '/pay/entitlements');
  if (r.s === 200 && r.j && Array.isArray(r.j.skus)) { setEnt(r.j, account.info().id); return true; }
  return false;
}

// ------------------------------------------------------------------ the catalogue
const OFFLINE = { currency: 'usd', founder: true, offline: true, products: [
  { id: 'charter', name: "Knight's Charter", kind: 'unlock', amount: 499, was: 699, founder: true, available: false },
  { id: 'herald', name: "The Herald's Book", kind: 'cosmetic', amount: 299, available: false },
  { id: 'rolls', name: 'Rolls of Arms', kind: 'cosmetic', amount: 199, available: false },
  { id: 'finishes', name: "The Armourer's Finishes", kind: 'cosmetic', amount: 399, available: false },
  { id: 'patron', name: 'Grand Patron of the Lists', kind: 'patron', amount: 1499, available: false },
], donate: { presets: [300, 500, 1000], min: 100, max: 50000, available: false } };
let cat = null, catP = null;
/** The products and prices, from the server (cached for the visit). */
export function catalogue() {
  if (!PAY.live) return Promise.resolve(OFFLINE);
  if (cat) return Promise.resolve(cat);
  if (!catP) catP = account.api('GET', '/pay/products', null, false).then((r) => { if (r.s === 200 && r.j && Array.isArray(r.j.products)) return (cat = r.j); catP = null; return OFFLINE; });
  return catP;
}
export const catalogueNow = () => cat;

/** What each item gives, in plain words (the price is the server's). */
export const ABOUT = {
  charter: { lead: 'The whole career, and every venue.', lines: [`All ${VENUES.length} tournament events of the career calendar (${VENUES[0].name} stays free)`, `Every venue for a Joust, not only ${VENUES[0].name}`, 'One payment. Yours on every browser you sign in to.'] },
  herald: { lead: 'More of the herald\'s art for your arms.', lines: ['Every other charge in the heraldry editor: beasts, birds, plants, crosses and more (a starter dozen is free)', 'The furs, ermine and vair', 'Three tinctures: murrey, sanguine, carnation', 'The historic arms that bear them'] },
  rolls: { lead: 'Ten real coats of arms to bear.', lines: [PACKS.rolls.arms.map((a) => a.name).join(', '), 'One click in the Armoury'] },
  finishes: { lead: 'Your harness in another colour of steel.', lines: Object.values(PACKS.finishes.finishes).map((f) => `${f.name}: ${f.blurb}`) },
  patron: { lead: 'For those who want the lists to go on.', lines: ['Your name read in the herald\'s roll of Grand Patrons', 'A crown charge for your arms that only patrons bear', 'The Grand Patron seal by your name', 'Looks only: it does not include the Charter'] },
};
const SAMPLE = {
  herald: [{ c1: '#6e2639', c2: '#e0b83c', c3: '#ece8dc', pattern: 'saltire', charge: 'none' }, { c1: '#ece8dc', c2: '#8a2b1c', c3: '#191919', pattern: 'bordure', charge: 'mascle' }, { c1: '#1f4690', c2: '#ece8dc', c3: '#e0b83c', pattern: 'barry', charge: 'none' }],
  rolls: PACKS.rolls.arms.slice(0, 3).map((a) => a.arms),
  patron: [{ c1: '#6b2478', c2: '#6b2478', c3: '#e0b83c', pattern: 'plain', charge: 'crown' }],
  charter: [{ c1: '#a81e1e', c2: '#e0b83c', c3: '#ece8dc', pattern: 'chevron', charge: 'star' }],
};

// ------------------------------------------------------------------ buying
const pageUrl = () => { const u = new URL(location.href); for (const k of ['pay', 'sid', 'sku', 'auth', 'autherr']) u.searchParams.delete(k); u.hash = ''; return u.toString(); };
const nonce = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
let busy = false;
/**
 * Buy one item: sign-in first (else ctx.needSignIn()), the confirmation with item and price, then off to Stripe Checkout. Resolves an error text, or '' (the page is leaving
 * or the player said no). ctx: { needSignIn() }.
 */
export async function buy(sku, ctx = {}) {
  if (!PAY.live) return '';
  if (busy) return '';
  if (!account.signedIn()) { account.setMessage('Sign in first: what you buy is kept on your account, so it follows you to any browser.'); if (ctx.needSignIn) ctx.needSignIn(); return ''; }
  if (has(sku)) return 'You own this already.';
  const c = await catalogue(), P = c.products.find((x) => x.id === sku);
  if (!P) return 'That item is not in the store.';
  if (c.offline) return 'The store cannot be reached. Try again in a moment.';
  if (!P.available) return 'This item is not on sale yet.';
  const yes = await confirmPay({ title: `Buy the ${P.name}?`, price: money(P.amount, c.currency) + (P.was ? ` (was ${money(P.was, c.currency)})` : ''), note: ABOUT[sku] ? ABOUT[sku].lead + (c.test ? ' (Test mode: no real money is taken.)' : '') : '', button: 'Continue to payment' });
  if (!yes) return '';
  busy = true;
  const r = await account.api('POST', '/pay/checkout', { product: sku, return: pageUrl(), nonce: nonce() });
  busy = false;
  if (r.s === 200 && r.j && r.j.url) { track('checkout_started', { sku, source: ctx.source || 'store' }); location.href = r.j.url; return ''; }
  if (r.s === 409) { await refresh(); return 'You own this already.'; }
  return r.s === 0 ? 'The store cannot be reached.' : r.s === 429 ? 'Too many tries, wait a moment.' : r.s === 401 ? 'Sign in again first.' : (r.j && r.j.error ? r.j.error[0].toUpperCase() + r.j.error.slice(1) + '.' : 'The payment page could not be opened.');
}

// ------------------------------------------------------------------ back from Checkout: ?pay=ok&sku=..&sid=.. or ?pay=cancel
const CSS = `
#payBack { position: fixed; inset: 0; z-index: 310; display: grid; place-items: center; padding: 12px; background: rgba(24, 14, 6, .6); }
#payBack .cf { position: relative; width: min(460px, 94vw); color: var(--ink); text-align: center; }
#payBack .page { padding: 34px 34px 26px; }
#payBack h3 { margin: 0 0 8px; font-family: var(--display); font-size: 30px; color: var(--red); }
#payBack p { font-size: 17px; margin: 6px 0; } #payBack .wait { font-style: italic; color: var(--ink2); }
#payBack .row { justify-content: center; display: flex; gap: 12px; margin-top: 16px; }
.store .top .test { display: inline-block; margin-left: 8px; padding: 1px 8px; font-family: var(--caps); font-size: 13px; letter-spacing: .08em; color: var(--vellum3); background: var(--ink2); border-radius: 2px; vertical-align: middle; }
.store .cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); margin-top: 10px; }
.store .card { position: relative; cursor: default; display: flex; flex-direction: column; }
.store .card.charter { grid-column: 1 / -1; }
.store .card.focus { border-color: var(--red); box-shadow: inset 0 0 0 1px var(--red); }
.store .card .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.store .card .crests { display: flex; gap: 6px; flex: none; align-items: center; }
.store .card ul { margin: 6px 0 8px 18px; padding: 0; font-size: 16px; } .store .card li { margin: 2px 0; }
.store .card .lead { font-style: italic; margin: 4px 0 0; }
.store .card .buy { margin-top: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 6px; }
.store .price { font-family: var(--caps); font-size: 22px; letter-spacing: .04em; color: var(--ink); }
.store .was { text-decoration: line-through; color: var(--ink2); font-size: 16px; margin-left: 4px; }
.store .founder { display: inline-block; padding: 2px 9px; font-family: var(--caps); font-size: 13px; letter-spacing: .1em; color: var(--ink); background: var(--gold2); border: 1px solid var(--gold); border-radius: 10px; }
.store .owned { font-family: var(--caps); color: var(--green); font-size: 17px; letter-spacing: .06em; }
.store .sw { display: inline-block; width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--ink-soft); vertical-align: middle; margin-right: 4px; }
.store .foot { margin-top: 14px; font-size: 15px; color: var(--ink2); }
.store .msg { color: var(--red); } .store .msg.ok { color: var(--green); }
.store .patronroll { font-style: italic; font-size: 15px; }
.lockchip, .chip.locked { opacity: .72; } .sw.locked { opacity: .45; outline: 1px dashed var(--ink-soft); outline-offset: 1px; } .chip.locked::after, .pick.locked b::after { content: ' \\1F512'; font-size: .8em; }
.lockbox { border: 1px dashed var(--ink-soft); border-radius: 2px; padding: 10px 14px; margin: 8px 0; } .lockbox p { margin: 4px 0 8px; }
.venue.locked { opacity: .62; } .venue.locked .r::before { content: '\\1F512 '; }
`;
let styled = false;
export function ensureStoreCss() { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'storeCss'; s.textContent = CSS; document.head.appendChild(s); }
if (typeof document !== 'undefined' && document.head) ensureStoreCss();      // the lock marks in the menus need it before the store is ever opened
function sheet(html) {
  ensureStoreCss();
  const old = document.getElementById('payBack'); if (old) old.remove();
  const back = document.createElement('div'); back.id = 'payBack'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML = `<div class="cf scroll"><i class="paper"></i><div class="page">${html}</div></div>`;
  document.body.appendChild(back);
  back.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-pb]'); if (b && b.dataset.pb === 'close') back.remove(); else if (b && b.dataset.pb === 'store') { back.remove(); if (sheetCtx.show) sheetCtx.show('store'); } });
  return back;
}
let sheetCtx = {};
/** Call once at start, after the account is restored: if the browser has just come back from Stripe Checkout, say so and wait for the server to confirm. ctx: { show } */
export async function handleReturn(ctx = {}) {
  if (!PAY.live) return false;
  sheetCtx = ctx;
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return false; }
  const pay = q.get('pay'), sku = q.get('sku') || '';
  if (!pay) return false;
  try { const u = new URL(location.href); for (const k of ['pay', 'sid', 'sku']) u.searchParams.delete(k); history.replaceState(null, '', u.toString()); } catch (e) { /* ignore */ }
  const c = await catalogue(), P = c.products.find((x) => x.id === sku), name = P ? P.name : 'your purchase';
  if (pay === 'cancel') { sheet(`<h3>No payment made</h3><p>You left the payment page, so nothing was charged.</p><div class="row"><button class="btn" data-pb="close">Close</button>${sku !== 'donation' ? '<button class="btn primary btn-primary" data-pb="store">Back to the store</button>' : ''}</div>`); return true; }
  if (pay !== 'ok') return false;
  if (sku === 'donation') { track('purchase_ok', { sku: 'donation' }); sheet(`<h3>Thank you</h3><p>Your gift keeps the lists open and the herald fed. Every coin goes into making Joust Revival better.</p><p class="wait">A receipt is on its way to you from Stripe.</p><div class="row"><button class="btn primary btn-primary" data-pb="close">Close</button></div>`); refresh(); return true; }
  const box = sheet(`<h3>Thank you</h3><p>Stripe has your payment for the <b>${esc(name)}</b>.</p><p class="wait" data-st>Waiting for the confirmation…</p><div class="row"><button class="btn" data-pb="close">Close</button></div>`);
  const st = box.querySelector('[data-st]');
  for (let i = 0; i < 20 && box.isConnected; i++) {      // the webhook usually lands within a second or two
    await refresh();
    if (has(sku)) {
      track('purchase_ok', { sku });
      st.className = ''; st.innerHTML = sku === 'charter' ? 'The Knight\'s Charter is yours: the whole calendar and every venue are open.' : `The ${esc(name)} is yours.`;
      box.querySelector('.row').innerHTML = '<button class="btn primary btn-primary" data-pb="close">To the lists</button>';
      return true;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (st.isConnected) st.innerHTML = 'The confirmation has not arrived yet. It can take a minute: press <b>Restore purchases</b> in the store later. You will not be charged twice.';
  return true;
}

// ------------------------------------------------------------------ the store screen (menus.js gives it a host element)
let focusSku = '', msg = '', msgOk = false, patrons = null;
/** Open the store at this item (a lock in the menus calls this). */
export const focus = (sku) => { focusSku = sku || ''; };
export function mountStore(host, ctx = {}) {
  if (!host) return;
  ensureStoreCss();
  const draw = () => {
    if (!host.isConnected) return;
    const c = cat || OFFLINE, me = account.info();
    const card = (P) => {
      const A = ABOUT[P.id] || { lines: [] }, own = has(P.id);
      const crests = (SAMPLE[P.id] || []).map((a) => `<canvas width="40" height="48" data-arms='${JSON.stringify(a)}'></canvas>`).join('');
      const sw = P.id === 'finishes' ? Object.values(PACKS.finishes.finishes).map((f) => `<span class="sw" data-tip="${esc(f.name)}" style="background:#${f.tint.toString(16).padStart(6, '0')}"></span>`).join('') : '';
      const extra = P.id === 'patron' && patrons && patrons.length ? `<p class="patronroll">The roll of Grand Patrons: ${patrons.map(esc).join(', ')}</p>` : '';
      return `<div class="panel pick card ${P.id} ${focusSku === P.id ? 'focus' : ''}" data-tip="${esc(A.lead || '')}">
        <div class="head"><div><b>${esc(P.name)}</b>${P.founder && !own ? ' <span class="founder">Founder\'s price</span>' : ''}
        <p class="lead">${esc(A.lead || '')}</p></div><div class="crests">${crests}${sw ? `<span>${sw}</span>` : ''}</div></div><ul>${A.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${extra}
        <div class="buy">${own ? '<span class="owned">Yours</span>' : `<span class="price">${money(P.amount, c.currency)}${P.was ? `<span class="was">${money(P.was, c.currency)}</span>` : ''}</span>
          <button class="btn ${P.id === 'charter' ? 'primary btn-primary' : ''}" data-buy="${P.id}" ${c.offline || !P.available ? 'disabled' : ''}>${!me ? 'Sign in to buy' : P.id === 'charter' ? 'Buy the Charter' : 'Buy'}</button>`}</div></div>`;
    };
    const b = badges();
    host.innerHTML = `<div class="store">
      ${msg ? `<p class="msg ${msgOk ? 'ok' : ''}" role="status">${esc(msg)}</p>` : ''}
      ${c.offline ? '<p class="msg">The store cannot be reached right now. Prices are shown, but nothing can be bought.</p>' : ''}
      <div class="cards">${c.products.map(card).join('')}</div>
      <div class="panel pf"><div class="row"><span class="val">${me ? `Signed in as <b>${esc(me.name)}</b>.${b.length ? ' ' + b.map((x) => x === 'patron' ? '<span class="founder">Grand Patron</span>' : '<span class="founder">Patron of the Lists</span>').join(' ') : ''}` : 'Purchases are kept on your account, so sign in first.'}</span>
        ${me ? '<button class="btn" data-store="restore" data-tip="Ask the server again for everything this account owns.">Restore purchases</button>' : '<button class="btn primary btn-primary" data-store="signin">Sign in</button>'}</div></div>
      <p class="foot">Prices in US dollars; tax may be added at checkout where the law asks for it. You pay on Stripe's secure page; Joust Revival never sees your card. Online play, ranked play and the training arena stay free for everybody, and nothing in the store changes how a joust is ridden or scored. Changed your mind? Ask for a refund within 14 days.</p>
    </div>`;
    host.querySelectorAll('canvas[data-arms]').forEach((cv) => drawCrest(cv, JSON.parse(cv.dataset.arms)));
    const f = focusSku && host.querySelector('.card.focus'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  };
  host.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-buy],[data-store]'); if (!t || t.disabled) return;
    e.stopPropagation();
    if (t.dataset.store === 'signin') return ctx.show && ctx.show('account');
    if (t.dataset.store === 'restore') { msg = 'Asking the server…'; msgOk = true; draw(); const okR = await refresh(); msg = okR ? (mine().skus.length ? 'Your purchases are restored.' : 'This account has not bought anything yet.') : 'The server cannot be reached.'; msgOk = okR; return draw(); }
    if (t.dataset.buy) { msg = ''; const err = await buy(t.dataset.buy, { needSignIn: () => ctx.show && ctx.show('account') }); if (err) { msg = err; msgOk = false; draw(); } }
  });
  catalogue().then(draw);
  if (!patrons) account.api('GET', '/pay/patrons', null, false).then((r) => { if (r.s === 200 && r.j) { patrons = r.j.names || []; draw(); } });
  if (account.signedIn()) refresh().then(draw);
  draw();
  setTimeout(() => { focusSku = ''; }, 0);      // the highlight is for this visit only
}
