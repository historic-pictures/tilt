// ranks.js - the client of the rankings server (server/tilt-ranks): identity, signed match reports, the lobby look-ups and the leaderboard.
//
// IDENTITY. No account: the first time it is needed, this browser makes an ECDSA P-256 key pair (WebCrypto). The key lives in IndexedDB (a CryptoKey) or, where IndexedDB is
// not available, as a JWK in localStorage. The public key is registered with the server, which answers with the player id. (The private key is made extractable because the
// RECOVERY CODE is an export of it: 32 bytes + 1 check byte as 53 base32 letters. The public key is computed back from it, see pubFromD.)
// EVERY CALL FAILS SILENTLY: each returns null (or false) when the server cannot be reached or says no; online play never waits for it.
//
// SIGNED STRINGS (fields joined by "\n"; ECDSA P-256 / SHA-256; signature = 64 raw bytes base64url):
//   result: tilt-result-v1, matchId, id, oppId, result, "<mine>-<his>", "<breaks>,<attaints>,<helms>,<unhorse>,<courses>", mode, venue, ts
//   rename: tilt-name-v1, id, name, ts          play: tilt-play-v1, matchId, id, oppId
// ?ranktest=1 marks the players this browser makes as test players (hidden from the leaderboard); ?ranks=<url> points at another server (a local `wrangler dev`).
import { cleanName } from './online.js';
import { filterName } from './namefilter.js';

const DEFAULT_URL = 'https://tilt-ranks.tilt-joust.workers.dev';
const TIMEOUT = 6000;
const param = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
export const rankTest = () => param('ranktest') === '1';
const base = () => { const u = param('ranks'); return u && /^(http:\/\/localhost|https:\/\/)/.test(u) ? u.replace(/\/+$/, '') : DEFAULT_URL; };

const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const enc = new TextEncoder();
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };

// ------------------------------------------------------------------ the HTTP call: JSON in, JSON out, null when it fails
async function call(method, path, body) {
  let t = 0;
  try {
    const ctl = new AbortController(); t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(base() + path, { method, signal: ctl.signal, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' } } : {}) });
    const d = await r.json(); clearTimeout(t);
    return d && typeof d === 'object' ? Object.assign(d, { _status: r.status }) : null;
  } catch (e) { clearTimeout(t); return null; }
}

// ------------------------------------------------------------------ the key store: IndexedDB, else localStorage
const IDB = 'tilt-ranks', STORE = 'k', REC = 'me', LS = 'tilt.rankkey';
// ?net=local (two tabs of one browser stand for two players): each TAB keeps its own key, in sessionStorage, so the tabs are two different players
const perTab = () => param('net') === 'local';
const lsOf = () => (perTab() ? sessionStorage : localStorage);
const idb = () => new Promise((res, rej) => { try { const q = indexedDB.open(IDB, 1); q.onupgradeneeded = () => q.result.createObjectStore(STORE); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } });
async function idbGet() { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(REC); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
async function idbPut(v) { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, REC); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function loadKey() {
  if (!perTab()) try { const r = await idbGet(); if (r && r.priv && r.pub) return { priv: r.priv, pub: r.pub, name: r.name || '' }; } catch (e) { /* try localStorage */ }
  try {
    const r = JSON.parse(lsOf().getItem(LS));
    if (r && r.jwk && r.pub) return { priv: await crypto.subtle.importKey('jwk', r.jwk, ALG, true, ['sign']), pub: r.pub, name: r.name || '' };
  } catch (e) { /* none */ }
  return null;
}
async function saveKey(k) {
  if (!perTab()) try { await idbPut({ priv: k.priv, pub: k.pub, name: k.name || '' }); try { localStorage.removeItem(LS); } catch (e) { /* ignore */ } return true; } catch (e) { /* fall back */ }
  try { lsOf().setItem(LS, JSON.stringify({ jwk: await crypto.subtle.exportKey('jwk', k.priv), pub: k.pub, name: k.name || '' })); return true; } catch (e) { return false; }
}
async function makeKey() {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  return { priv: kp.privateKey, pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), name: '' };
}

// ------------------------------------------------------------------ the session: key, registration, name
let key = null, myId = '', ready = null, nameOf = () => '';
/** The in-game name, as it is sent to the server. */
const shownName = () => filterName(cleanName(nameOf()));
/** Tell it where the player's name is kept (main.js: () => profile.name). */
export const setNameSource = (fn) => { nameOf = fn; };
/** The player id, or '' until ensure() has finished (or when the server could not be reached). */
export const id = () => myId;

/** Make or load the key, register it, bring the server's name up to date. Resolves to the player id, or null; calls share one attempt, and a failed one is retried on the next call. */
export function ensure() {
  if (ready) return ready;
  const p = ready = (async () => {
    if (!window.crypto || !crypto.subtle) return null;
    if (!key) { key = await loadKey(); if (!key) { key = await makeKey(); await saveKey(key); } }
    const r = await call('POST', '/register', { pub: key.pub, name: shownName(), ...(rankTest() ? { test: 1 } : {}) });
    if (!r || !r.id) return null;
    myId = r.id;
    if (r.name !== shownName() && key.name !== shownName()) { await sendName(shownName()); key.name = shownName(); saveKey(key); }
    return myId;
  })().catch(() => null).then((v) => { if (!v && ready === p) ready = null; return v; });
  return p;
}
const sign = async (text) => b64u(new Uint8Array(await crypto.subtle.sign(SIG, key.priv, enc.encode(text))));
async function sendName(name) {
  const ts = Date.now(), sig = await sign(['tilt-name-v1', myId, name, ts].join('\n'));
  return call('POST', '/name', { id: myId, name, ts, sig });
}
/** The in-game name changed: tell the server (does nothing until registered). */
export async function syncName() { try { if (!(await ensure())) return false; const n = shownName(); if (key.name === n) return true; const r = await sendName(n); if (r && r.ok) { key.name = n; saveKey(key); } return !!(r && r.ok); } catch (e) { return false; } }

/** The proof that I am playing this match against him (sent to him at the start; a forfeit win needs it). */
export async function playProof(matchId, oppId) {
  try { if (!(await ensure())) return null; return await sign(['tilt-play-v1', matchId, myId, oppId].join('\n')); } catch (e) { return null; }
}

// ------------------------------------------------------------------ reports
/** Send my side of a finished match. rec: { matchId, oppId, result, score:[mine,his], stats:{breaks,attaints,helms,unhorse,courses}, mode, venue, oppSig? }. Resolves to the server's answer
 *  ({status:'pending'|'confirmed'|'disputed', before, after, delta, division, provisional, ...}) or null. One retry if the call is lost. */
export async function report(rec) {
  try {
    if (!(await ensure())) return null;
    const r = { matchId: rec.matchId, id: myId, oppId: rec.oppId, result: rec.result, score: rec.score, stats: rec.stats, mode: rec.mode, venue: rec.venue, ts: Date.now() };
    r.sig = await sign(['tilt-result-v1', r.matchId, r.id, r.oppId, r.result, `${r.score[0]}-${r.score[1]}`, `${r.stats.breaks},${r.stats.attaints},${r.stats.helms},${r.stats.unhorse},${r.stats.courses}`, r.mode, r.venue, r.ts].join('\n'));
    if (rec.oppSig) r.oppSig = rec.oppSig;
    let a = await call('POST', '/result', r);
    if (!a) { await new Promise((z) => setTimeout(z, 2500)); a = await call('POST', '/result', r); }
    return a && !a.error ? a : null;
  } catch (e) { return null; }
}
/** After a report: ask until the match is confirmed (the other side has reported too), up to `ms`. */
export async function awaitConfirm(matchId, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await call('GET', `/match/${matchId}?id=${myId}`);
    if (r && (r.status === 'confirmed' || r.status === 'disputed')) return r;
    await new Promise((z) => setTimeout(z, 1200));
  }
  return null;
}

// ------------------------------------------------------------------ look-ups
const ok = (r) => (r && !r.error ? r : null);
export const player = async (pid) => ok(await call('GET', `/player/${pid}`));
export const h2h = async (a, b) => ok(await call('GET', `/h2h?a=${a}&b=${b}`));
export const leaderboard = async (limit = 100) => { const r = ok(await call('GET', `/leaderboard?limit=${limit}${rankTest() ? '&test=1' : ''}`)); return r && Array.isArray(r.players) ? r.players : null; };
/** "Knight 1540" (a question mark while he is provisional), "you lead 3–1" / "level 1–1" / "he leads 1–3" / "first meeting". */
export const rankText = (p) => (p ? `${p.division} ${p.rating}${p.provisional ? '?' : ''}` : '');
export function h2hText(h) {      // h: the answer of h2h(me, him)
  if (!h || !h.matches) return 'first meeting';
  const w = h.a.wins, l = h.b.wins;
  return w > l ? `you lead ${w}–${l}` : w < l ? `he leads ${l}–${w}` : `level ${w}–${l}`;
}

// ------------------------------------------------------------------ the recovery code
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const toB32 = (bytes) => { let bits = 0, v = 0, s = ''; for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { s += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) s += B32[(v << (5 - bits)) & 31]; return s; };
const fromB32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) return null; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Uint8Array.from(out); };
const check = async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', d))[0];
/** The code for this browser's key: 11 groups of letters, e.g. "ABCDE-FGHIJ-…". Null if there is no key (or it cannot be exported). */
export async function recoveryCode() {
  try {
    if (!(await ensure())) return null;
    const jwk = await crypto.subtle.exportKey('jwk', key.priv), d = unb64u(jwk.d), full = new Uint8Array(33); full.set(d); full[32] = await check(d);
    return toB32(full).match(/.{1,5}/g).join('-');
  } catch (e) { return null; }
}
// P-256 arithmetic (BigInt): the public point for a private scalar, so the code needs only the scalar
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn, N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;
const md = (a) => ((a % P) + P) % P;
const inv = (a) => { let r = 1n, b = md(a), e = P - 2n; while (e) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; } return r; };
function add(p, q) {
  if (!p) return q; if (!q) return p;
  let l;
  if (p[0] === q[0]) { if (md(p[1] + q[1]) === 0n) return null; l = md(3n * p[0] * p[0] - 3n) * inv(2n * p[1]) % P; } else l = md(q[1] - p[1]) * inv(q[0] - p[0]) % P;
  const x = md(l * l - p[0] - q[0]); return [x, md(l * (p[0] - x) - p[1])];
}
function pubFromD(d) { let r = null, a = [GX, GY]; for (let k = d; k > 0n; k >>= 1n) { if (k & 1n) r = add(r, a); a = add(a, a); } return r; }
const be = (n) => { const o = new Uint8Array(32); for (let i = 31; i >= 0; i--) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
/** Use a recovery code on this browser: this browser's rank becomes the code's. Resolves to the player id, or null if the code is wrong or the server cannot be reached. */
export async function restore(code) {
  try {
    const bytes = fromB32(String(code || '').toUpperCase().replace(/[^A-Z2-7]/g, ''));
    if (!bytes || bytes.length !== 33) return null;
    const d = bytes.slice(0, 32);
    if (bytes[32] !== await check(d)) return null;
    let dn = 0n; for (const b of d) dn = (dn << 8n) | BigInt(b);
    if (dn <= 0n || dn >= N) return null;
    const [x, y] = pubFromD(dn), xb = be(x), yb = be(y);
    const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(xb), y: b64u(yb), ext: true }, ALG, true, ['sign']);
    const pub = new Uint8Array(65); pub[0] = 4; pub.set(xb, 1); pub.set(yb, 33);
    const was = [key, myId, ready];
    key = { priv, pub: b64u(pub), name: '' }; myId = ''; ready = null;
    const got = await ensure();
    if (!got) { [key, myId, ready] = was; return null; }
    await saveKey(key);
    return got;
  } catch (e) { return null; }
}
