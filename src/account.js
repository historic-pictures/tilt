// account.js - the client of the accounts side of the server (server/tilt-ranks): Sign in with Google / Discord, the cloud profile, the server's shop and rewards, matchmaking.
//
// A guest plays everything offline exactly as before. A signed-in player's gold, renown and owned items live ON THE SERVER: this file asks for purchases and reports finished
// matches, and the profile in main.js is rebuilt from what the server says (buildProfile). Editing localStorage changes nothing for a signed-in account.
// SESSIONS: bearer tokens (no cookies: github.io and workers.dev are different sites), kept in localStorage `tilt.session` (sessionStorage with ?net=local, so two tabs are two players).
// OAuth + PKCE: the page keeps the verifier (sessionStorage `tilt.pkce`), the Worker keeps the client secret, and the browser comes back with ?auth=<one-time code>.
// EVERY CALL FAILS SOFT: a network error is { s: 0 }; the game never waits on it.
import { DEFAULT_PROFILE, newMan, fixRetinue } from './data.js';
import { apiBase, ranksOffline, signLink, ensure as ensureRank, id as rankId } from './ranks.js';
import { allowedArms, allowedFinish } from './cosmetics.js';
import { PAY } from './config.js';

const param = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
const perTab = () => param('net') === 'local';
const store = () => (perTab() ? sessionStorage : localStorage);
const SESS = 'tilt.session', PKCE = 'tilt.pkce';
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const isLocalHost = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

let sess = null;      // { access, refresh, exp, account:{id,name,provider,rid,linked} }
try { sess = JSON.parse(store().getItem(SESS)); if (!sess || !sess.refresh || !sess.account) sess = null; } catch (e) { sess = null; }
const keep = () => { try { if (sess) store().setItem(SESS, JSON.stringify(sess)); else store().removeItem(SESS); } catch (e) { /* ignore */ } };
const hooks = { sync: [], change: [] };
/** Subscribe: 'sync' (a fresh /me arrived: rebuild the profile) and 'change' (signed in or out). */
export const on = (what, fn) => { hooks[what].push(fn); };
const fire = (what, ...a) => { for (const f of hooks[what]) { try { f(...a); } catch (e) { console.warn('[account]', e); } } };

export const signedIn = () => !!sess;
/** When the account's state was last fetched or the cloud save last sent (ms since 1970; 0 = not yet this visit), and whether a change is waiting to be sent. */
export const syncState = () => ({ at: lastSync, pending: !!pending, error: syncErr });
export const info = () => (sess ? sess.account : null);
export const token = () => (sess ? sess.access : '');
export let message = '';      // the last thing to tell the player (a sign-in that failed, a key that is tied elsewhere)
export const setMessage = (m) => { message = m; };

// ------------------------------------------------------------------ the HTTP call
let refreshing = null;
async function refresh() {
  if (!sess) return false;
  if (refreshing) return refreshing;
  return (refreshing = (async () => {
    const r = await raw('POST', '/auth/refresh', { refresh: sess.refresh }, false);
    if (r.s === 200 && r.j && r.j.access) { sess = { ...sess, access: r.j.access, refresh: r.j.refresh, exp: r.j.exp, account: r.j.account || sess.account }; keep(); return true; }
    if (r.s === 401 || r.s === 403) { sess = null; keep(); fire('change', false); }
    return false;
  })().finally(() => { refreshing = null; }));
}
async function raw(method, path, body, auth = true, extra = {}) {
  let t = 0;
  if (ranksOffline()) return { s: 0, j: null };
  try {
    const ctl = new AbortController(); t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(apiBase() + path, { method, signal: ctl.signal, ...extra, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && sess ? { Authorization: 'Bearer ' + sess.access } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => null); clearTimeout(t);
    return { s: r.status, j };
  } catch (e) { clearTimeout(t); return { s: 0, j: null }; }
}
/** { s: status (0 = unreachable), j: json }. A 401 on a signed-in call refreshes the session once and tries again. */
export async function api(method, path, body, auth = true) {
  let r = await raw(method, path, body, auth);
  if (r.s === 401 && auth && sess && await refresh()) r = await raw(method, path, body, auth);
  return r;
}

// ------------------------------------------------------------------ signing in
let provP = null;
/** Which sign-ins the server has switched on: { google, discord, dev } (dev only on localhost). Null if the server cannot be reached. */
export function providers() {
  if (!provP) provP = raw('GET', '/auth/providers', null, false).then((r) => (r.s === 200 && r.j ? { google: !!r.j.google, discord: !!r.j.discord, dev: !!r.j.dev && isLocalHost() } : (provP = null)));
  return provP;
}
const pageUrl = () => { const u = new URL(location.href); u.searchParams.delete('auth'); u.searchParams.delete('autherr'); u.hash = ''; return u.toString(); };
/** Go to the provider's sign-in page (the browser leaves this page and comes back with ?auth=). Resolves with an error text if it could not start. */
export async function signIn(provider, devUser = '') {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32))), challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  try { sessionStorage.setItem(PKCE, verifier); } catch (e) { return 'Your browser will not keep the sign-in step; allow site data and try again.'; }
  const r = await raw('POST', '/auth/start', { provider, redirect: pageUrl(), challenge, user: devUser }, false);
  if (r.s === 200 && r.j && r.j.url) { location.href = r.j.url; return ''; }
  if (r.s === 503) return 'Sign-in coming soon.';
  return r.s === 0 ? 'Could not reach the server.' : (r.j && r.j.error) || 'Sign-in failed.';
}
/** Call once at start: if the browser has just come back from a provider (?auth=<code>), swap the code for a session. Resolves true if a session began. */
export async function handleReturn() {
  const code = param('auth'), err = param('autherr');
  if (!code && !err) return false;
  try { const u = new URL(location.href); u.searchParams.delete('auth'); u.searchParams.delete('autherr'); history.replaceState(null, '', u.toString()); } catch (e) { /* ignore */ }
  if (err) { message = err === 'denied' ? 'Sign-in was cancelled.' : err === 'banned' ? 'This account is closed.' : 'Sign-in failed. Try again.'; return false; }
  let verifier = ''; try { verifier = sessionStorage.getItem(PKCE) || ''; sessionStorage.removeItem(PKCE); } catch (e) { /* none */ }
  if (!verifier) { message = 'Sign-in failed (the page lost its place). Try again.'; return false; }
  const r = await raw('POST', '/auth/exchange', { code, verifier }, false);
  if (r.s !== 200 || !r.j || !r.j.access) { message = 'Sign-in failed. Try again.'; return false; }
  sess = { access: r.j.access, refresh: r.j.refresh, exp: r.j.exp, account: r.j.account }; keep(); message = '';
  return true;
}
export async function signOut() {
  if (sess) await raw('POST', '/auth/logout', {}, true).catch(() => {});
  sess = null; synced = false; keep(); fire('change', false);
}

// ------------------------------------------------------------------ the cloud profile
/** The guest's local profile, as it is offered to the server for the one-time merge. */
function guestOffer() {
  let p = null; try { p = JSON.parse(localStorage.getItem('tilt.profile')); } catch (e) { /* none */ }
  if (!p || !p.arms) return null;
  const ret = {}; for (const id of Object.keys(p.retinue || {})) ret[id] = { level: (p.retinue[id] && p.retinue[id].level) | 0 || 1 };
  const prof = { ...p }; delete prof.gold; delete prof.renown; delete prof.owned;
  if (JSON.stringify(prof).length > 45000) { delete prof.table; delete prof.stats; delete prof.achievements; }
  return { gold: p.gold | 0, renown: p.renown | 0, owned: p.owned || {}, retinue: ret, profile: prof };
}
/** After a sign-in: tie this browser's rank key to the account and offer the guest profile (once), then fetch the account. */
export async function afterSignIn() {
  if (!sess) return null;
  try {
    const a = sess.account;
    if (!a.linked || !a.rid) {
      const rid = await ensureRank();
      const sig = rid ? await signLink(a.id) : null;
      const r = await api('POST', '/account/link', { ...(sig || {}), guest: a.linked ? null : guestOffer() });
      if (r.s === 409 && r.j && /another/.test(r.j.error || '')) message = 'Your ranked rating belongs to another browser. Use its recovery code (Rankings) here to play ranked.';
      else if (r.s === 200 && r.j && r.j.merged) message = `Your guest purse and belongings were added to your account (${r.j.merged.items} items, ${r.j.merged.gold} marks).`;
    }
  } catch (e) { /* the account still works without the rank key */ }
  return fetchMe();
}
/** Fetch the account's state and tell main.js (the 'sync' hook builds the profile from it). */
export async function fetchMe() {
  if (!sess) return null;
  const r = await api('GET', '/me');
  if (r.s !== 200 || !r.j || !r.j.account) return null;
  sess.account = r.j.account; keep(); synced = true; lastSync = Date.now(); syncErr = ''; fire('sync', r.j);
  return r.j;
}
/** The game's profile object, rebuilt from the server's account: gold, renown and every owned item come from the wallet and the inventory, never from local data. */
export function buildProfile(me) {
  const d = JSON.parse(JSON.stringify(DEFAULT_PROFILE)), sp = me.profile || {};
  Object.assign(d, sp);
  d.gold = me.wallet.gold | 0; d.renown = me.wallet.renown | 0; d.named = true; d.name = sp.name || me.account.name || d.name;
  d.owned = { horses: [], armours: [], helms: [], caparisons: [] };
  const lv = {}, bucket = { horse: 'horses', armour: 'armours', helm: 'helms', cap: 'caparisons' };
  for (const { item, level } of me.inventory || []) { const [k, id] = item.split(':'); if (bucket[k]) d.owned[bucket[k]].push(id); else if (k === 'retinue') lv[id] = level; }
  const keepR = sp.retinue || {}; d.retinue = {};
  for (const id of Object.keys(lv)) { const r = keepR[id]; d.retinue[id] = r && r.name ? { name: r.name, trait: r.trait, level: lv[id] } : newMan(id, Object.values(d.retinue).map((x) => x.name)); d.retinue[id].level = lv[id]; }
  fixRetinue(d);
  if (!d.skills) d.skills = {};
  const ent = me.entitlements || { skus: [], badges: [] };      // what the account has bought (the server's word; store.js keeps the same copy)
  d.ent = { skus: (ent.skus || []).slice(), badges: (ent.badges || []).slice() };
  const own = PAY.live ? d.ent.skus : ['charter', 'herald', 'rolls', 'patron', 'finishes'];      // (PAY.live false: the game is free, everything is owned)
  d.arms = allowedArms(d.arms, own); d.finish = allowedFinish(d.finish, own) || undefined;      // a refunded pack's heraldry falls back to free pieces
  return d;
}
let saveT = 0, pending = null, synced = false, lastSync = 0, syncErr = '';      // (nothing is saved to the cloud until the account's own profile has been fetched)
/** The profile changed (a colour, a setting, what he rides): save the cosmetic part to the account soon. Gold, renown and the owned lists are never sent. */
export function queueSave(profile) {
  if (!sess || !synced) return;
  const doc = { ...profile }; delete doc.gold; delete doc.renown; delete doc.owned; pending = doc;
  clearTimeout(saveT); saveT = setTimeout(flushSave, 1500);
}
export async function flushSave() {
  clearTimeout(saveT); if (!sess || !pending) return;
  const doc = pending; pending = null;
  if (JSON.stringify(doc).length > 55000) { delete doc.table; delete doc.stats; delete doc.achievements; }
  const r = await api('PUT', '/profile', { profile: doc });
  if (r.s === 200) { lastSync = Date.now(); syncErr = ''; } else { syncErr = r.s === 0 ? 'the server cannot be reached' : (r.j && r.j.error) || 'refused'; pending = pending || doc; }
}
window.addEventListener('pagehide', () => { if (pending && sess && !ranksOffline()) { try { fetch(apiBase() + '/profile', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sess.access }, body: JSON.stringify({ profile: pending }) }); } catch (e) { /* ignore */ } } });


// ------------------------------------------------------------------ managing the account (src/account_panel.js)
const failText = (r, what) => (r.s === 0 ? 'The server cannot be reached.' : r.s === 429 ? 'Too many tries, wait a moment.' : (r.j && r.j.error ? r.j.error[0].toUpperCase() + r.j.error.slice(1) + '.' : what + ' failed.'));
/** Send what is waiting to the cloud now, then fetch the account again. Resolves { ok, error }. */
export async function syncNow() {
  if (!sess) return { ok: false, error: 'Not signed in.' };
  await flushSave();
  if (syncErr) return { ok: false, error: syncErr[0].toUpperCase() + syncErr.slice(1) + '.' };
  const me = await fetchMe();
  return me ? { ok: true } : { ok: false, error: 'The server cannot be reached.' };
}
/** Change the display name (the server cleans it and checks it against the block-list). Resolves { ok, name } or { ok:false, error }. */
export async function rename(name) {
  const r = await api('POST', '/account/name', { name });
  if (r.s === 200 && r.j && r.j.ok) { await fetchMe(); return { ok: true, name: r.j.name }; }
  return { ok: false, error: r.s === 422 ? 'That name is not allowed.' : failText(r, 'Renaming') };
}
/** Sign out of every device (all sessions of this account end, this one too). */
export async function signOutAll() {
  const r = await api('POST', '/auth/logout-all', {});
  if (r.s !== 200) return { ok: false, error: failText(r, 'Signing out') };
  sess = null; synced = false; keep(); fire('change', false);
  return { ok: true, revoked: r.j && r.j.revoked };
}
/** Erase the account and its server data. The caller has already had the player type DELETE. */
export async function deleteAccount() {
  const r = await api('POST', '/account/delete', { confirm: 'DELETE' });
  if (r.s !== 200) return { ok: false, error: failText(r, 'Deleting') };
  sess = null; synced = false; pending = null; keep();
  fire('change', false);
  return { ok: true };
}

// ------------------------------------------------------------------ the shop and the rewards (the server decides every amount)
/** Ask the server to sell an item ("horse:destrier", "cap:plain", "retinue:groom", "train:groom"). Resolves { ok, wallet, inventory } or { ok:false, error }. */
export async function buy(item) {
  const r = await api('POST', '/shop/buy', { item });
  if (r.s === 200 && r.j && r.j.ok) return { ok: true, wallet: r.j.wallet, inventory: r.j.inventory };
  return { ok: false, error: r.s === 402 ? 'not enough gold' : r.s === 0 ? 'the server cannot be reached' : (r.j && r.j.error) || 'refused' };
}
/** A single-player match begins (the server starts its own clock). Resolves the match id, or '' (unreachable: the match simply pays nothing). */
export async function spStart({ venue, mode, courses, circuit }) {
  const r = await api('POST', '/sp/start', { venue, mode, courses: Math.max(1, Math.min(20, courses | 0)), circuit: !!circuit });
  return r.s === 200 && r.j ? r.j.matchId : '';
}
/** The match is over: what the server paid (or why not). { ok, paid, gold, renown, entry, capped, wallet } or { ok:false, error }. */
export async function spFinish(matchId, { result, score, courses, broken, helms }) {
  const r = await api('POST', '/sp/finish', { matchId, result, score, courses, stats: { broken, helms } });
  if (r.s === 200 && r.j) return r.j;
  return { ok: false, error: r.s === 0 ? 'the server cannot be reached' : (r.j && r.j.error) || 'refused' };
}

// ------------------------------------------------------------------ matchmaking
/** Join a queue. Resolves the server's answer ({ticket, state:'searching'|'matched', ...}) or { error }. */
export async function mmJoin(ranked, name) {
  const r = await api('POST', '/mm/join', { ranked: !!ranked, name, rid: rankId() || undefined }, !!sess);
  return r.s === 200 && r.j ? r.j : { error: r.s === 401 ? 'Ranked play needs a signed-in account.' : r.s === 409 ? 'Link your account to this browser first (sign in again).' : r.s === 429 ? 'Too many tries, wait a moment.' : r.s === 0 ? 'Could not reach the matchmaker.' : (r.j && r.j.error) || 'The matchmaker refused.' };
}
export async function mmPoll(ticket) { const r = await raw('GET', '/mm/poll?ticket=' + ticket, null, false); return r.s === 200 && r.j ? r.j : null; }
export function mmLeave(ticket) { return raw('POST', '/mm/leave?ticket=' + ticket, {}, false); }
