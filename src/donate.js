// donate.js - the little "Support" button on the main menu and the sheet it opens: $3 / $5 / $10 or your own amount ($1 to $500), a line of thanks, and Ko-fi as
// another way to give. A gift buys nothing in the game. No account is needed; a signed-in donor may ask for the "Patron of the Lists" badge on his account.
// Self-contained: mountDonate(host) adds the button to `host` (menus.js calls it once per drawing of the main menu). Plain classes (.btn .panel .row .plaque) for the UI skin.
// The payment itself: POST /pay/donate on the Worker (server/tilt-ranks/pay.js) makes a Stripe Checkout Session; the confirmation (confirm.js confirmPay) comes first.
import { PAY } from './config.js';
import * as account from './account.js';
import { confirmPay } from './confirm.js';
import { catalogue, money } from './store.js';
import { track } from './analytics.js';

/** Ko-fi page: fill in when it exists (docs/payments-setup.md). Empty = the link shows "coming soon". */
export const KOFI_URL = '';
const PRESETS = [300, 500, 1000];

const CSS = `
.donate-btn, .menu button.donate-btn { position: absolute; top: 14px; right: 16px; z-index: 2; display: inline-flex; align-items: center; gap: 6px; width: auto; padding: 4px 12px 5px 8px;
  font-family: var(--caps); font-size: 15px; letter-spacing: .06em; color: var(--ink); background: rgba(255, 250, 228, .35); border: 1px solid var(--gold); border-radius: 14px; cursor: pointer; line-height: 1; }
.donate-btn::before, .menu button.donate-btn::before { display: none; }
.donate-btn:hover, .menu button.donate-btn:hover { padding-left: 8px; color: var(--red); border-color: var(--red); background: rgba(255, 250, 228, .6); }
.donate-btn svg { width: 18px; height: 18px; flex: none; }
#donateSheet { position: fixed; inset: 0; z-index: 305; display: grid; place-items: center; padding: 12px; background: rgba(24, 14, 6, .6); }
#donateSheet .cf { position: relative; width: min(440px, 94vw); color: var(--ink); }
#donateSheet .page { max-height: 94vh; padding: 30px 32px 24px; }
#donateSheet h3 { margin: 0 0 6px; font-family: var(--display); font-size: 30px; color: var(--red); text-align: center; }
#donateSheet .thanks { font-style: italic; text-align: center; margin: 0 0 12px; font-size: 17px; }
#donateSheet .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; margin: 8px 0; }
#donateSheet .amt { min-width: 64px; font-family: var(--caps); font-size: 19px; cursor: pointer; }
#donateSheet .amt.sel { color: var(--vellum3); background: var(--red); border-color: var(--red2); }
#donateSheet input.custom { width: 90px; font: inherit; font-size: 18px; padding: 4px 8px; color: var(--ink); background: rgba(255, 250, 228, .45); border: 1px solid var(--ink-soft); border-radius: 2px; }
#donateSheet label.badge { font-size: 15px; display: flex; gap: 6px; align-items: center; justify-content: center; }
#donateSheet .err { color: var(--red); text-align: center; min-height: 1.2em; margin: 4px 0; font-size: 15px; }
#donateSheet .alt { text-align: center; font-size: 15px; color: var(--ink2); margin-top: 10px; }
#donateSheet .alt a { color: var(--red2); } #donateSheet .alt a.off { color: var(--ink2); text-decoration: none; cursor: default; }
#donateSheet .give { min-width: 160px; min-height: 44px; font-size: 19px; }
`;
const PURSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="#e2bf5e" stroke="#7a5a1a" stroke-width="1.4"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#9a7424" stroke-width="1"/><path d="M12 7.6v8.8M9.6 9.6h4.8M9.6 14.4h4.8" stroke="#7a5a1a" stroke-width="1.5" stroke-linecap="round"/></svg>';
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'donateCss'; s.textContent = CSS; document.head.appendChild(s); };
const pageUrl = () => { const u = new URL(location.href); for (const k of ['pay', 'sid', 'sku', 'auth', 'autherr']) u.searchParams.delete(k); u.hash = ''; return u.toString(); };

/** Put the Support button into `host` (absolutely placed in its top-right corner; the host should be position: relative or the menu page). */
export function mountDonate(host, opts = {}) {
  if (!host || !PAY.live) return null;      // (PAY.live false: no Support button, src/config.js)
  style();
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn plaque donate-btn'; b.setAttribute('data-tip', 'Support Joust Revival with a gift. It buys nothing in the game; it keeps it going.');
  b.setAttribute('aria-label', 'Support Joust Revival'); b.innerHTML = `${PURSE}<span>${opts.label || 'Support'}</span>`;
  b.addEventListener('click', (e) => { e.stopPropagation(); if (opts.ui) opts.ui('click'); openDonate(opts); });
  host.appendChild(b);
  return b;
}

/** The donate sheet. Resolves when it closes. */
export function openDonate(opts = {}) {
  style();
  if (document.getElementById('donateSheet')) return Promise.resolve();
  let amount = 500, custom = '', badge = true, err = '';
  const back = document.createElement('div');
  back.id = 'donateSheet'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', 'Support Joust Revival');
  document.body.appendChild(back);
  const signed = account.signedIn();
  const draw = () => {
    back.innerHTML = `<div class="cf scroll"><i class="paper"></i><div class="page">
      <h3>Support the Lists</h3>
      <p class="thanks">Joust Revival is made by one person and a lot of evenings. If you enjoy it, a gift keeps the lists open. Thank you.</p>
      <div class="row">${PRESETS.map((c) => `<button class="btn amt ${!custom && amount === c ? 'sel' : ''}" data-d="amt" data-v="${c}">${money(c)}</button>`).join('')}</div>
      <div class="row"><label for="donCustom">Or your own amount: $</label><input class="custom" id="donCustom" inputmode="decimal" maxlength="7" placeholder="1 to 500" value="${custom.replace(/"/g, '')}" autocomplete="off"></div>
      ${signed ? `<label class="badge"><input type="checkbox" id="donBadge" ${badge ? 'checked' : ''}> Show the <b>Patron of the Lists</b> badge on my account</label>` : '<p class="alt" style="margin-top:0">No account needed. Signed-in donors may wear a "Patron of the Lists" badge.</p>'}
      <p class="err" role="status">${String(err).replace(/[<>&]/g, '')}</p>
      <div class="row"><button class="btn primary btn-primary give" data-d="give">Give ${money(current() || 0)}</button><button class="btn" data-d="close">Not now</button></div>
      <p class="alt">A gift buys nothing in the game. You pay on Stripe's secure page.<br>Prefer Ko-fi? ${KOFI_URL ? `<a href="${KOFI_URL}" target="_blank" rel="noopener">Give on Ko-fi</a>` : '<a class="off" aria-disabled="true">Ko-fi page coming soon</a>'}</p>
    </div></div>`;
    const inp = back.querySelector('#donCustom');
    inp.addEventListener('input', () => { custom = inp.value.replace(/[^0-9.]/g, ''); if (inp.value !== custom) inp.value = custom; err = ''; const g = back.querySelector('[data-d="give"]'); g.textContent = 'Give ' + money(current() || 0); back.querySelectorAll('.amt').forEach((x) => x.classList.toggle('sel', !custom && +x.dataset.v === amount)); back.querySelector('.err').textContent = ''; });
    const bx = back.querySelector('#donBadge'); if (bx) bx.addEventListener('change', () => { badge = bx.checked; });
  };
  function current() { if (!custom) return amount; const v = Math.round(parseFloat(custom) * 100); return Number.isFinite(v) ? v : 0; }
  draw();
  setTimeout(() => { const g = back.querySelector('.amt.sel'); if (g) g.focus(); }, 30);
  return new Promise((resolve) => {
    const close = () => { window.removeEventListener('keydown', onKey, true); back.remove(); resolve(); };
    const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } else e.stopImmediatePropagation(); };      // (typing must not reach the game's keys; the input still gets its text)
    window.addEventListener('keydown', onKey, true);
    back.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target === back) return close();
      const t = e.target.closest('[data-d]'); if (!t) return;
      if (t.dataset.d === 'close') return close();
      if (t.dataset.d === 'amt') { amount = +t.dataset.v; custom = ''; err = ''; return draw(); }
      if (t.dataset.d === 'give') {
        const c = await catalogue(), d = c.donate || { min: 100, max: 50000 }, v = current();
        if (!(v >= d.min && v <= d.max)) { err = `A gift can be ${money(d.min)} to ${money(d.max)}.`; return draw(); }
        if (c.offline || d.available === false) { err = 'Gifts cannot be taken right now. Try again later' + (KOFI_URL ? ', or use Ko-fi.' : '.'); return draw(); }
        back.style.display = 'none';
        const yes = await confirmPay({ title: 'Give a gift to Joust Revival?', price: money(v), note: (c.test ? 'Test mode: no real money is taken. ' : '') + 'A gift buys nothing in the game.', button: 'Continue to payment' });
        back.style.display = '';
        if (!yes) return;
        t.disabled = true; t.textContent = 'Opening Stripe…';
        const r = await account.api('POST', '/pay/donate', { amount: v, return: pageUrl(), badge: signed && badge, nonce: [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('') }, signed);
        if (r.s === 200 && r.j && r.j.url) { track('checkout_started', { sku: 'donation', amount: v }); location.href = r.j.url; return; }
        err = r.s === 0 ? 'Could not reach the server.' : r.s === 429 ? 'Too many tries, wait a moment.' : (r.j && r.j.error) || 'The payment page could not be opened.'; draw();
      }
    });
  });
}
