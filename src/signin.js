// signin.js - the optional sign-in on the main menu (a small account chip) and the sign-in gate in front of Play Online.
// Everything the player sees here sits on top of src/account.js (the OAuth round trip) and src/account_panel.js (the full account screen); this file only adds the doors to them:
//  - mountChip(host, {show}): "Sign in" (signed out) or the knight's name with a little menu (Account, Sign out). Hidden while the server reports no sign-in switched on or cannot be reached.
//  - onlineGate(): HTML for the Play Online screen when ONLINE_NEEDS_ACCOUNT (src/config.js) and he is signed out and sign-ins exist; '' otherwise (online stays open, with onlineNote()).
//  - the round trip: before leaving for Google / Discord we stash where he was going ({to:'online', join: invite code}) in sessionStorage `tilt.signin`; main.js reads it back with
//    takeReturn() once the session exists, and sends him to Play Online / into the invited room.
// The guest -> account one-time merge is account.afterSignIn() (unchanged): the guest purse and belongings are offered to the account at the first sign-in.
// LOCAL TESTING ONLY: on localhost, ?mocksignin=both|google|discord|none|unreachable pretends the server reports those providers, and the buttons "sign in" with a fake session (no network).
import { ONLINE_NEEDS_ACCOUNT } from './config.js';
import * as account from './account.js';

const STASH = 'tilt.signin';
const isLocal = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const mock = () => { if (!isLocal()) return ''; try { return new URLSearchParams(location.search).get('mocksignin') || ''; } catch (e) { return ''; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let pv, pvP = null;      // pv: undefined = not asked yet, null = unreachable, else { google, discord }
/** Which sign-ins the server has on ({google, discord}, or null if it cannot be reached). Cached. */
export function providers() {
  if (!pvP) {
    const m = mock();
    pvP = (m ? Promise.resolve(m === 'none' ? { google: false, discord: false } : m === 'unreachable' ? null : { google: m === 'both' || m === 'google', discord: m === 'both' || m === 'discord' })
      : account.providers()).then((v) => { pv = v ? { google: !!v.google, discord: !!v.discord } : null; return pv; }, () => { pv = null; return null; });
  }
  return pvP;
}
const anyOn = (v) => !!v && (v.google || v.discord);

// ------------------------------------------------------------------ what he was doing before he left for the provider
const stash = (o) => { try { sessionStorage.setItem(STASH, JSON.stringify({ ...o, at: Date.now() })); } catch (e) { /* ignore */ } };
const peek = () => { try { return JSON.parse(sessionStorage.getItem(STASH)) || null; } catch (e) { return null; } };
/** Remember an invite code across the sign-in round trip (main.js calls this when ?join= meets the gate). */
export const stashJoin = (code) => stash({ ...(peek() || {}), to: 'online', join: String(code || '') });
/** Back from the provider (or on any start): what he was doing, once. { to:'online', join } or null; cleared. */
export function takeReturn() { const s = peek(); try { sessionStorage.removeItem(STASH); } catch (e) { /* ignore */ } return s && s.to && Date.now() - (s.at || 0) < 15 * 60000 ? s : null; }      // (a stash older than 15 minutes is a sign-in he never finished)
/** Leaving for the provider from the Play Online gate: remember he was heading there. */
const markOnline = () => stash({ ...(peek() || {}), to: 'online' });

// ------------------------------------------------------------------ the buttons
const G_MARK = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const D_MARK = '<svg viewBox="0 0 127.14 96.36" aria-hidden="true"><path fill="#5865F2" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"/></svg>';
const MARKS = { google: G_MARK, discord: D_MARK };
const NAMES = { google: 'Google', discord: 'Discord' };
/** The "Continue with" buttons (only the providers that are on). */
export const buttonsHtml = (v) => `<div class="si-btns">${['google', 'discord'].filter((p) => v && v[p]).map((p) => `<button class="btn si-btn si-${p}" data-si="${p}">${MARKS[p]}<span>Continue with ${NAMES[p]}</span></button>`).join('')}</div>`;

async function begin(p, host) {
  const say = (m) => { const e = host.querySelector('[data-si-msg]'); if (e) e.textContent = m; };
  if (host.matches('[data-si-online]') || host.querySelector('[data-si-online]')) markOnline();
  if (mock()) {      // local test: a fake session instead of the provider's page, then the same start-up path a real return takes
    try { localStorage.setItem('tilt.session', JSON.stringify({ access: 'mock', refresh: 'mock', exp: Date.now() + 36e5, account: { id: 'mock-' + p, name: p === 'google' ? 'Sir Gawain' : 'Lady Isolde', provider: p, rid: null, linked: true } })); } catch (e) { /* ignore */ }
    const u = new URL(location.href); u.searchParams.delete('join'); location.href = u.toString(); return;
  }
  say('Opening ' + NAMES[p] + '…');
  const err = await account.signIn(p);      // leaves the page when it works
  if (err) say(err);
}
/** Make the [data-si] buttons inside `host` work. */
export function bind(host) {
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-si]'); if (b) { e.stopPropagation(); begin(b.dataset.si, host); } });
}

// ------------------------------------------------------------------ the gate in front of Play Online
const GATE_TEXT = 'Online jousts need an account — so names, ranks and rewards are yours. Sign in with Google or Discord.';
/** Does Play Online ask for an account right now? Resolves true / false (asks the server once). */
export async function needsAccount() { if (!ONLINE_NEEDS_ACCOUNT || account.signedIn()) return false; return anyOn(await providers()); }
/** HTML for the Play Online screen: the sign-in panel, a "checking" line while the server is asked, or '' when online is open. `again` re-draws the screen once the answer is in. */
export function onlineGate(again) {
  if (!ONLINE_NEEDS_ACCOUNT || account.signedIn()) return '';
  if (pv === undefined) { providers().then(() => { if (again) again(); }); return '<p class="wait">Checking the sign-in…</p>'; }
  if (!anyOn(pv)) return '';
  return `<div class="si-gate" data-si-host data-si-online><p class="si-why">${GATE_TEXT}</p>${buttonsHtml(pv)}<p class="si-msg" data-si-msg role="status">${esc(account.message || '')}</p><p class="dimtxt">Your guest progress comes with you. Single-player never needs an account.</p></div>`;
}
/** The fallback line for Play Online when an account is wanted but the server has none switched on. */
export const onlineNote = () => (ONLINE_NEEDS_ACCOUNT && !account.signedIn() && pv !== undefined && !anyOn(pv) ? '<p class="fineprint si-note">Accounts are not switched on yet.</p>' : '');

// ------------------------------------------------------------------ the main-menu chip
const CSS = `
.si-chip { position: absolute; top: -38px; left: 2px; z-index: 3; }      /* floats just above the page, on the scene */
.menu button.si-chip-btn { display: inline-flex; align-items: center; gap: 7px; width: auto; padding: 4px 12px 5px 8px; font-family: var(--caps); font-size: 15px; letter-spacing: .06em; line-height: 1; color: var(--ink); background: var(--vellum3); border: 1px solid var(--gold); border-radius: 14px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.45); }
.menu button.si-chip-btn::before { display: none; }
.menu button.si-chip-btn:hover { padding-left: 8px; color: var(--red); border-color: var(--red); background: rgba(255, 250, 228, .6); }
.si-av { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--red); color: var(--vellum3); font-size: 13px; }
.si-key { width: 18px; height: 18px; flex: none; }
.si-drop { position: absolute; top: 34px; left: 0; min-width: 150px; padding: 4px; background: var(--vellum3); border: 1px solid var(--gold); border-radius: 3px; box-shadow: 0 4px 12px rgba(0,0,0,.4); }
.menu .si-drop button { display: block; width: 100%; text-align: left; padding: 6px 10px; font-size: 16px; background: transparent; border: 0; color: var(--ink); cursor: pointer; }
.menu .si-drop button::before { display: none; } .menu .si-drop button:hover { padding-left: 10px; color: var(--red); background: rgba(43,29,18,.08); }
#signinSheet { position: fixed; inset: 0; z-index: 305; display: grid; place-items: center; padding: 12px; background: rgba(24, 14, 6, .6); }
#signinSheet .cf { position: relative; width: min(420px, 94vw); color: var(--ink); }
#signinSheet .page { max-height: 94vh; padding: 34px 34px 40px; text-align: center; overflow: visible; }
#signinSheet .page .btn { margin-top: 8px; }
#signinSheet h3 { margin: 0 0 8px; font-family: var(--display); font-size: 28px; color: var(--red); }
.si-btns { display: flex; flex-direction: column; gap: 8px; margin: 12px auto; max-width: 300px; }
.si-btns .si-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 9px 14px 10px; font-size: 18px; letter-spacing: .04em; background: rgba(255, 250, 228, .55); border: 1px solid var(--ink); border-radius: 3px; cursor: pointer; }
.si-btns .si-btn::before { display: none; } .si-btns .si-btn:hover { background: #fffaf0; }
.si-btn svg { width: 22px; height: 22px; flex: none; }
.si-gate { text-align: center; padding: 8px 0 4px; } .si-why { font-style: italic; font-size: 18px; margin: 6px 0; }
.si-msg { color: var(--red); min-height: 1.2em; margin: 4px 0; font-size: 15px; }
.si-note { text-align: center; }
`;
let styled = false;
export const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'signinCss'; s.textContent = CSS; document.head.appendChild(s); };
const KEY = '<svg class="si-key" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4.2" fill="none" stroke="#7a5a1a" stroke-width="1.8"/><path d="M12 12h9M18 12v4M21 12v3" stroke="#7a5a1a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';

function openSheet() {
  style(); const old = document.getElementById('signinSheet'); if (old) old.remove();
  const sh = document.createElement('div'); sh.id = 'signinSheet';
  sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Sign in');
  sh.innerHTML = `<div class="cf scroll"><i class="paper"></i><div class="page" data-si-host><h3>Sign in</h3><p class="si-why">An account keeps your name, rank and rewards safe on the server.</p>${buttonsHtml(pv)}<p class="si-msg" data-si-msg role="status"></p><p class="dimtxt">Your guest progress comes with you.</p><button class="btn" data-si-close>Not now</button></div></div>`;
  document.body.appendChild(sh);
  bind(sh); sh.addEventListener('click', (e) => { if (e.target === sh || e.target.closest('[data-si-close]')) sh.remove(); });
}
/** Add the chip to `host` (the main menu's page). ctx.show(name) opens a screen. Draws nothing until the server says sign-in is on (or he is already signed in). */
export function mountChip(host, ctx = {}) {
  if (!host) return; style();
  host = host.closest('.menu') || host;      // (the page itself clips; the chip floats above it, on the menu)
  const draw = () => {
    if (!host.isConnected) return;
    const old = host.querySelector('.si-chip'); if (old) old.remove();
    const me = account.signedIn() ? account.info() : null;
    if (!me && !anyOn(pv)) return;      // nothing to offer: no chip, no dead buttons
    const c = document.createElement('div'); c.className = 'si-chip';
    c.innerHTML = me ? `<button class="si-chip-btn" data-si-menu aria-haspopup="menu" title="Your account"><span class="si-av">${esc((me.name || '?').trim().charAt(0).toUpperCase())}</span>${esc(me.name)}</button>`
      : `<button class="si-chip-btn" data-si-open title="Sign in with Google or Discord (optional)">${KEY}Sign in</button>`;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-si-open]')) return openSheet();
      if (e.target.closest('[data-si-acct]')) return ctx.show && ctx.show('account');
      if (e.target.closest('[data-si-out]')) { account.signOut().then(() => ctx.show && ctx.show('main')); return; }
      if (e.target.closest('[data-si-menu]')) { const d = c.querySelector('.si-drop'); if (d) return d.remove(); const m = document.createElement('div'); m.className = 'si-drop'; m.setAttribute('role', 'menu'); m.innerHTML = '<button data-si-acct role="menuitem">Account</button><button data-si-out role="menuitem">Sign out</button>'; c.appendChild(m); }
    });
    host.appendChild(c);
  };
  draw();
  if (pv === undefined) providers().then(draw);
}
