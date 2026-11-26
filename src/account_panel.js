// account_panel.js - the account screen: who you are signed in as, your name, rating and record, the cloud save, linked sign-ins, and the ways out (sign out, sign out everywhere,
// delete the account). Signed out: why to sign in, and the sign-in buttons. Reached from the profile badge on the main menu and from Settings (menus.js mounts it).
// Plain semantic markup (.panel, .row, .btn, .btn-primary), data-tip on the rows; the UI skin styles it. Every network call is account.js (they fail soft).
// There is nothing to buy here (the store is src/store.js).
import { PAY } from './config.js';
import { ensurePanelCss } from './panel_css.js';
import * as account from './account.js';
import * as ranks from './ranks.js';
import { badName } from './namefilter.js';
import { confirmTyped } from './confirm.js';
import { RANKS, rankOf } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PROVIDER_NAMES = { google: 'Google', discord: 'Discord', dev: 'Development sign-in' };
const OTHER = { google: 'discord', discord: 'google' };
/** "just now", "3 min ago", "2 h ago", "yesterday" */
export function ago(t, now = Date.now()) {
  if (!t) return 'not yet this visit';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now'; if (s < 60) return s + ' s ago'; if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
}
/** The name as it would be saved (same cleaning as the game's own names: no markup, 22 letters at most). Returns { name } or { error }. */
export function checkName(v) {
  const name = String(v || '').replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22);
  if (!name) return { error: 'Type a name first.' };
  if (name.length < 2) return { error: 'A name needs at least two letters.' };
  if (badName(name)) return { error: 'That name is not allowed.' };
  return { name };
}

let carry = null, active = null;
/** Draw the panel into `host` (and keep it up to date until the host leaves the page). ctx: { profile } the game's profile (renown for the rank line). */
export function mountAccountPanel(host, ctx = {}) {
  if (!host) return;
  ensurePanelCss();
  const st = { pv: null, rank: undefined, rankFor: '', msg: '', msgKind: '', draft: null, busy: false, asking: '' };
  if (carry && Date.now() - carry.at < 4000) { st.msg = carry.msg; st.msgKind = carry.kind; } carry = null;
  const me = () => account.info();
  const say = (msg, kind = '') => { if (!host.isConnected && active && active !== say) return active(msg, kind); st.msg = msg; st.msgKind = kind; carry = { msg, kind, at: Date.now() }; draw(); };      // (the screen is drawn afresh when the account's state arrives: the message goes to the new one)
  active = say;

  const providerButtons = () => {
    const pb = (id, label) => `<button class="btn ${st.pv && st.pv[id] ? 'primary btn-primary' : ''}" data-a="in" data-p="${id}" data-tip="${st.pv && st.pv[id] ? 'Opens ' + label + '\'s own sign-in page. We never see your password.' : 'This sign-in is not switched on yet.'}">Sign in with ${label}<small>${!st.pv ? 'Checking…' : st.pv[id] ? '' : 'coming soon'}</small></button>`;
    return `<div class="row">${pb('google', 'Google')}${pb('discord', 'Discord')}</div>
      ${st.pv && st.pv.dev ? `<div class="row" data-tip="Only on a local test server."><label class="slabel" for="acDev">Development sign-in</label><input class="name" id="acDev" maxlength="22" value="Dev Knight" autocomplete="off"><button class="btn primary btn-primary" data-a="dev">Dev sign-in</button></div>` : ''}`;
  };

  function signedOutHtml() {
    return `<p class="why" data-tip="An account keeps your purse and belongings on the server, so they follow you to any browser and nobody can edit them, and it lets you play ranked matches.">Sign in to keep your purse and belongings safe on the server, play from any browser, and ride ranked matches.</p>
      ${providerButtons()}
      <p class="dimtxt">You can play everything offline as a guest. Your guest belongings are offered to the account once, at your first sign-in (up to 500 marks and a fair share of your gear).</p>`;
  }

  function rankHtml(a) {
    if (!a.rid) return `<div class="row" data-tip="Ranked play ties your account to a rank key kept in this browser. Play an online match, or use the recovery code under Rankings."><label class="slabel">Rating</label><span class="val">Not ranked yet. Ride an online match to earn a rating.</span></div>`;
    const p = st.rankFor === a.rid ? st.rank : undefined;
    const rec = p ? `${p.wins} won · ${p.losses} lost · ${p.draws} drawn` : '';
    const val = p === undefined ? 'Loading…' : p === null ? 'The ranking server could not be reached.' : !p.matches ? 'Unrated: no ranked matches yet.' : `${esc(p.division)} ${p.rating}${p.provisional ? '?' : ''}${p.rank ? ' · number ' + p.rank : ''}`;
    return `<div class="row" data-tip="Your Glicko rating from ranked and online matches. A question mark means it is still settling (fewer than 10 matches)."><label class="slabel">Rating</label><span class="val">${val}</span></div>
      <div class="row" data-tip="Your record in online matches."><label class="slabel">Record</label><span class="val">${p && p.matches ? esc(rec) : '—'}</span></div>`;
  }

  function signedInHtml(a) {
    const sync = account.syncState(), pr = ctx.profile || {}, rk = RANKS[rankOf(pr.renown || 0)];
    const draft = st.draft === null ? a.name : st.draft, prov = PROVIDER_NAMES[a.provider] || a.provider, other = OTHER[a.provider];
    const syncText = sync.error ? `Could not save: ${esc(sync.error)}` : sync.pending ? 'Changes waiting to be sent' : `Last synced ${ago(sync.at)}`;
    return `<div class="row" data-tip="Your account's sign-in."><label class="slabel">Signed in</label><span class="val">with <b>${esc(prov)}</b> as <b>${esc(a.name)}</b></span></div>
      <div class="row" data-tip="Shown to other players and on the rankings. Letters, numbers and spaces, up to 22. It is checked here and again by the server."><label class="slabel" for="acName">Display name</label>
        <span class="sctl"><input class="name" id="acName" maxlength="22" value="${esc(draft)}" autocomplete="off" spellcheck="false"><button class="btn" data-a="name" ${st.busy ? 'disabled' : ''}>Save name</button></span></div>
      ${rankHtml(a)}
      <div class="row" data-tip="Your rank in the game's own ladder, from renown earned in matches."><label class="slabel">Standing</label><span class="val">${esc(rk ? rk.name : '')} · ${(pr.renown || 0)} renown</span></div>
      <div class="row" data-tip="Your cosmetics, name, settings and progress are saved to the server soon after each change. Purse and belongings are always on the server."><label class="slabel">Cloud save</label>
        <span class="sctl"><span class="val" data-sync>${syncText}</span><button class="btn" data-a="sync" ${st.busy ? 'disabled' : ''}>Sync now</button></span></div>
      <div class="row" data-tip="The sign-ins tied to this account."><label class="slabel">Sign-ins</label>
        <span class="sctl"><span class="val">${esc(prov)}: linked</span>${other ? `<button class="btn" disabled data-tip="Linking a second sign-in is not available yet.">${esc(PROVIDER_NAMES[other])}: not available yet</button>` : ''}</span></div>
      <div class="row"><span class="sctl">${st.asking === 'all'
        ? `<span class="val">Sign out of every device, including this one?</span><button class="btn primary btn-primary" data-a="all-yes">Yes, sign out everywhere</button><button class="btn" data-a="ask-no">No</button>`
        : `<button class="btn" data-a="out" data-tip="Leave this browser. Your account and its data stay on the server.">Sign out</button><button class="btn" data-a="ask-all" data-tip="Ends every session of this account on every device, in case a browser was lost or shared.">Sign out of all devices</button>`}</span></div>
      <div class="row danger" data-tip="Erases your account and its server data for good: purse, belongings, cloud save, rating and rank. It cannot be undone."><label class="slabel">Delete account</label>
        <span class="sctl"><button class="btn" data-a="delete">Delete my account…</button><small>Erases your purse, belongings, cloud save and rating from the server, and gives up your purchases.</small></span></div>`;
  }

  function draw() {
    if (!host.isConnected) return;
    const a = me(), msg = st.msg || account.message || '';
    const kind = st.msg ? st.msgKind : (/fail|cancel|could not|belongs|closed/i.test(account.message || '') ? 'err' : 'wait');
    const keepFocus = document.activeElement && host.contains(document.activeElement) ? document.activeElement.id : '';
    host.innerHTML = `<div class="panel pf acct" role="group" aria-label="Account">
      ${msg ? `<p class="${kind === 'err' ? 'err' : 'wait'}" role="status">${esc(msg)}</p>` : ''}
      ${a ? signedInHtml(a) : signedOutHtml()}</div>`;
    if (keepFocus) { const f = host.querySelector('#' + keepFocus); if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); } }
  }

  // ---- data: which sign-ins are on, and the rating
  if (!account.signedIn()) account.providers().then((v) => { st.pv = v || { google: false, discord: false, dev: false }; draw(); });
  const loadRank = () => { const a = me(); if (!a || !a.rid || st.rankFor === a.rid && st.rank !== undefined) return; st.rankFor = a.rid; st.rank = undefined; ranks.player(a.rid).then((p) => { st.rank = p || null; draw(); }); };
  const tick = () => { if (!host.isConnected) return clearInterval(iv); loadRank(); const el = host.querySelector('[data-sync]'); if (el && !st.busy) { const s = account.syncState(); if (!s.error && !s.pending) el.textContent = `Last synced ${ago(s.at)}`; } };
  const iv = setInterval(tick, 15000);
  loadRank();

  // ---- actions
  host.addEventListener('input', (e) => { if (e.target.id === 'acName') st.draft = e.target.value; });
  host.addEventListener('keydown', (e) => { if (e.target.id === 'acName' && e.key === 'Enter') { e.preventDefault(); act('name'); } });
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a, b); });

  async function act(what, b) {
    const A = account;
    if (what === 'in' || what === 'dev') {
      A.setMessage(''); st.msg = '';
      const id = what === 'dev' ? 'dev' : b.dataset.p;
      if (id !== 'dev') { const v = await A.providers(); if (!v || !v[id]) { A.setMessage('Sign-in coming soon.'); return draw(); } }
      const u = host.querySelector('#acDev'), err = await A.signIn(id, u ? u.value : '');
      if (err) { A.setMessage(err); draw(); }
      return;
    }
    if (what === 'name') {
      const inp = host.querySelector('#acName'), c = checkName(inp ? inp.value : '');
      if (c.error) return say(c.error, 'err');
      if (c.name === (me() || {}).name) return say('That is already your name.', 'wait');
      st.busy = true; say('Saving…', 'wait');
      const r = await A.rename(c.name); st.busy = false; st.draft = null;
      if (r.ok) return say('Your name is now ' + r.name + '.', 'wait');      // (the ranked name follows by itself: main.js syncs it when the account's state arrives)
      return say(r.error, 'err');
    }
    if (what === 'sync') { st.busy = true; say('Syncing…', 'wait'); const r = await A.syncNow(); st.busy = false; return say(r.ok ? 'Synced.' : r.error, r.ok ? 'wait' : 'err'); }
    if (what === 'out') { await A.signOut(); return; }
    if (what === 'ask-all') { st.asking = 'all'; return draw(); }
    if (what === 'ask-no') { st.asking = ''; return draw(); }
    if (what === 'all-yes') { st.asking = ''; st.busy = true; say('Signing out everywhere…', 'wait'); const r = await A.signOutAll(); st.busy = false; if (!r.ok) say(r.error, 'err'); return; }
    if (what === 'delete') {
      const yes = await confirmTyped({ title: 'Delete your account?', note: 'This erases your purse, belongings, cloud save and rating from the server, ' + (PAY.live ? 'and gives up anything bought in the store (the payment record is kept for tax, with nothing that names you). ' : '') + 'It cannot be undone. The save on this device is not touched.', word: 'DELETE', button: 'Delete account' });
      if (!yes) return;
      st.busy = true; say('Deleting…', 'wait'); const r = await A.deleteAccount(); st.busy = false;
      if (!r.ok) say(r.error, 'err');
    }
  }
  draw();
}
