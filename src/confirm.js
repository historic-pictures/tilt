// A parchment "are you sure?" before gold is spent. confirmBuy() resolves true (Buy) or false (Cancel / Esc / click outside).
// buyAsk() works out whether a menu click is a purchase at all, so owned items and unaffordable buttons never reach the dialog.
import { HORSES, ARMOURS, HELMS, RETINUE, CAPARISONS, trainCost } from './data.js';

const marks = (n) => `${n} mark${Math.abs(n) === 1 ? '' : 's'}`;   // same wording as menus.js
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let open = false, blockUntil = 0, styled = false;

const CSS = `
#confirmBuy { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 12px; background: rgba(24, 14, 6, .6); }
#confirmBuy .cf { position: relative; width: min(420px, 94vw); color: var(--ink); text-align: center; }
#confirmBuy .page { max-height: 94vh; padding: 34px 34px 26px; }
#confirmBuy h3 { margin: 0 0 6px; font-family: var(--display); font-weight: 700; font-size: 30px; line-height: 1.1; color: var(--red); }
#confirmBuy .cfprice { font-family: var(--caps); font-size: 22px; letter-spacing: .06em; margin: 4px 0 8px; }
#confirmBuy .cfpurse { font-size: 18px; padding-top: 8px; border-top: 1px solid var(--rule); }
#confirmBuy .cfpurse b { color: var(--red2); }
#confirmBuy .cfnote { font-size: 15px; font-style: italic; color: var(--ink2); margin: 0 0 8px; }
#confirmBuy .cfbtns { display: flex; gap: 12px; justify-content: center; margin-top: 18px; }
#confirmBuy .btn { min-height: 48px; min-width: 120px; font-size: 19px; cursor: pointer; }
@media (max-height: 480px) {
  #confirmBuy .page { padding: 24px 28px 18px; }
  #confirmBuy h3 { font-size: 24px; margin-bottom: 2px; }
  #confirmBuy .cfprice { font-size: 19px; margin: 2px 0 4px; }
  #confirmBuy .cfpurse { font-size: 16px; padding-top: 4px; }
  #confirmBuy .cfnote { font-size: 14px; margin-bottom: 4px; }
  #confirmBuy .cfbtns { margin-top: 10px; }
}`;

// after a dialog closes, swallow the tail of a double-click so it cannot hit the menu behind
window.addEventListener('click', (e) => { if (!open && performance.now() < blockUntil) { e.stopPropagation(); e.preventDefault(); } }, true);

export function confirmBuy({ title, price, gold, note } = {}) {
  if (open) return Promise.resolve(false);
  open = true;
  if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
  const g = gold || 0, left = g - price;
  const back = document.createElement('div');
  back.id = 'confirmBuy'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML = `<div class="cf scroll"><i class="paper"></i><div class="page">
    <h3>${esc(title)}</h3>
    <div class="cfprice">${marks(price)}</div>
    ${note ? `<p class="cfnote">${esc(note)}</p>` : ''}
    <div class="cfpurse">You have ${marks(g)} &rarr; <b>${marks(left)} left</b></div>
    <div class="cfbtns"><button class="btn primary" data-cf="y">Buy</button><button class="btn" data-cf="n">Cancel</button></div>
  </div></div>`;
  document.body.appendChild(back);
  const prevFocus = document.activeElement, opened = performance.now();
  const yes = back.querySelector('[data-cf="y"]');
  yes.focus();
  return new Promise((resolve) => {
    const done = (v) => {
      window.removeEventListener('keydown', onKey, true);
      back.remove(); open = false;
      setTimeout(() => { blockUntil = performance.now() + 450; }, 0);   // after the caller's own re-dispatched click has run
      try { if (prevFocus && prevFocus.focus) prevFocus.blur(); } catch (e) { /* ignore */ }
      resolve(v);
    };
    const onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); done(document.activeElement && document.activeElement.dataset.cf === 'n' ? false : true); }
      else if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); const other = document.activeElement === yes ? back.querySelector('[data-cf="n"]') : yes; other.focus(); }
      else e.stopImmediatePropagation();     // nothing else reaches the game while the dialog is up
    };
    window.addEventListener('keydown', onKey, true);
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-cf]');
      if (b) return done(b.dataset.cf === 'y');
      if (e.target === back && performance.now() - opened > 400) done(false);   // click outside cancels (not the tail of the opening double-click)
    });
  });
}

/** Is this menu click a gold purchase that can be made right now? Returns { title, price, note } or null (owned / not a purchase / cannot afford). */
export function buyAsk(p, d) {
  const gold = p.gold || 0;
  const ok = (price) => price > 0 && gold >= price && gold >= 0;   // free items need no confirmation
  if (d.stcapset) {
    const c = CAPARISONS[d.stcapset]; if (!c) return null;
    const owned = p.owned.caparisons || ['livery', 'none'];
    return !owned.includes(c.id) && ok(c.price) ? { title: `Buy the ${c.name}?`, price: c.price, note: c.blurb } : null;
  }
  const item = (list, tbl, id) => { const x = tbl[id]; return x && !list.includes(id) && ok(x.price) ? { title: `Buy the ${x.name}?`, price: x.price, note: x.blurb } : null; };
  if (d.stbuy) return item(p.owned.horses, HORSES, d.stbuy);
  if (d.horse) return item(p.owned.horses, HORSES, d.horse);
  if (d.armour) return item(p.owned.armours, ARMOURS, d.armour);
  if (d.helm) return item(p.owned.helms, HELMS, d.helm);
  if (d.hire && RETINUE[d.hire]) {
    const r = RETINUE[d.hire];
    return !(p.retinue && p.retinue[d.hire]) && ok(r.hire) ? { title: `Hire the ${r.name}?`, price: r.hire, note: r.role } : null;
  }
  if (d.train && p.retinue && p.retinue[d.train]) {
    const cost = trainCost(d.train, p.retinue[d.train]);
    const r = RETINUE[d.train];
    return cost && ok(cost) ? { title: `Train your ${r ? r.name : 'man'}?`, price: cost, note: 'He gains a level.' } : null;
  }
  return null;
}
