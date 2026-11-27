// lobby.js - the public room list for "Joust a friend", behind one tiny interface so a real server can replace it later:
//
//   const lobby = createLobby();       // Nostr relays (real play) or, with ?net=local, a BroadcastChannel between two tabs of one browser
//   lobby.announce(room)               // host: list this room (re-sent every ANNOUNCE_MS; call again to change it). room = { code, name, v, m, c }
//   lobby.stop()                       // host: say "closed" and stop listing
//   lobby.watch((rooms, status) => {}) // client: called whenever the list changes. rooms: open rooms, oldest first: { code, name, v, m, c, first, seen }
//                                      //   status: { open, total } relays reachable (1 / 1 for the local transport)
//   lobby.unwatch(); lobby.close()
//
// THE NOSTR TRANSPORT. There is no server of ours. Rooms are announced as EPHEMERAL Nostr events (kind 20777: relays pass them on to whoever is
// subscribed and do not keep them), signed with a throwaway key made for this browser session and never stored. Event:
//   { kind: 20777, created_at, tags: [["t","tilt-lobby-v1"]], content: JSON, pubkey, id, sig }
//   content = { k:"tilt", p: protocol, code, name, v: venue index, m: rules id, c: courses, n: players (1 or 2), closed?: 1, ts: ms }
//
// PRESENCE ("3 knights in the lists"). While a player is on the Play Online screen or inside an online match he announces, every PRESENCE_MS (20 s), a second ephemeral
// event on the same relays, signed with the same throwaway key:
//   { kind: 20778, created_at, tags: [["t","tilt-presence-v1"]], content: JSON, pubkey, id, sig }
//   content = { k:"tilt", p: protocol, st: "lobby" | "match", ts: ms, bye?: 1 }       (bye: he has left the screen / the match: forget him at once)
// Nothing about the person is in it: no name, no address, no code. Whoever listens counts the DISTINCT pubkeys heard in the last PRESENCE_FRESH_MS (45 s) and adds himself;
// two "match" knights make one joust under way. Announcing stops when he leaves the screen or the match. Same size, skew and signature checks as the rooms. With ?net=local the
// same two messages go over the BroadcastChannel. Never invented, never padded with bots: if only he is here, or no relay answers, the screen says the lists are quiet.
// Nothing else is sent. Everything that arrives is parsed, size-checked, signature-checked and cleaned before it is believed.
import { PROTOCOL, safeName, onlineModeIds } from './online.js';
import { VENUES } from './data.js';
import { validCode, useLocal } from './net.js';

export const NOSTR_URL = 'https://cdn.jsdelivr.net/npm/nostr-tools@2.7.2/+esm';
export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'];
export const KIND = 20777, TAG = 'tilt-lobby-v1';
export const PKIND = 20778, PTAG = 'tilt-presence-v1';
export const PRESENCE_MS = 20000, PRESENCE_FRESH_MS = 45000;
const TAGS = { [KIND]: TAG, [PKIND]: PTAG };
export const ANNOUNCE_MS = 5000;      // a host repeats his announcement this often
export const FRESH_MS = 15000;        // a room is shown only if it was heard from this recently
const SINCE_S = 30, MAX_CONTENT = 600, MAX_ROOMS = 60, SKEW_S = 120;

/** A room as announced (host side). */
const mine = (r) => ({ k: 'tilt', p: PROTOCOL, code: r.code, name: String(r.name || '').slice(0, 22), v: r.v | 0, m: r.m, c: r.c | 0 });
/** What arrived, parsed and cleaned; null if it is rubbish. */
export function parseAnnouncement(text) {
  if (typeof text !== 'string' || text.length > MAX_CONTENT) return null;
  let o; try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || o.k !== 'tilt' || o.p !== PROTOCOL) return null;
  if (!validCode(o.code) || !Number.isInteger(o.v) || o.v < 0 || o.v >= VENUES.length || !onlineModeIds().includes(o.m) || !Number.isInteger(o.c) || o.c < 3 || o.c > 20) return null;
  if (o.n !== 1 && o.n !== 2) return null;
  return { code: o.code, name: safeName(o.name), v: o.v, m: o.m, c: o.c, n: o.n, closed: !!o.closed, ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : 0 };
}

/** A presence announcement, parsed and cleaned; null if it is rubbish. */
export function parsePresence(text) {
  if (typeof text !== 'string' || text.length > 200) return null;
  let o; try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || o.k !== 'tilt' || o.p !== PROTOCOL || (o.st !== 'lobby' && o.st !== 'match')) return null;
  return { st: o.st, bye: !!o.bye };
}

// ------------------------------------------------------------------ transports: start(), publish(text), subscribe(on(text, senderId)), unsubscribe(), status(), close()
let nostrLoad = null;
const loadNostr = () => nostrLoad || (nostrLoad = import(NOSTR_URL).catch((e) => { nostrLoad = null; throw e; }));

class NostrTransport {
  constructor() { this.relays = RELAYS.map((url) => ({ url, ws: null, open: false, tries: 0, timer: 0 })); this.sub = ''; this.on = null; this.onOpen = null; this.seen = new Set(); this.dead = false; this.nt = null; this.sk = null; this.pk = ''; this.starting = null; this.failed = false; }
  start() {
    if (this.starting) return this.starting;
    return (this.starting = loadNostr().then((nt) => {
      if (this.dead) return;
      this.nt = nt; this.sk = nt.generateSecretKey(); this.pk = nt.getPublicKey(this.sk);      // a throwaway key for this session: never stored
      for (const r of this.relays) this._connect(r);
    }).catch(() => { this.failed = true; }));
  }
  _connect(r) {
    if (this.dead) return;
    let ws; try { ws = new WebSocket(r.url); } catch (e) { return; }
    r.ws = ws;
    ws.onopen = () => { r.open = true; r.tries = 0; r.was = true; if (this.sub) this._req(r); if (this.onOpen) this.onOpen(); };
    ws.onmessage = (e) => this._rx(e.data);
    const gone = () => { if (r.ws !== ws) return; r.open = false; r.ws = null; if (!this.dead && (r.was || r.tries < 3)) r.timer = setTimeout(() => this._connect(r), Math.min(30000, 4000 * (++r.tries))); };
    ws.onclose = gone; ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } gone(); };
  }
  _req(r) { try { r.ws.send(JSON.stringify(['REQ', this.sub, { kinds: [KIND, PKIND], '#t': [TAG, PTAG], since: Math.floor(Date.now() / 1000) - SINCE_S }])); } catch (e) { /* ignore */ } }
  _rx(data) {
    if (!this.on || typeof data !== 'string' || data.length > 4000) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!Array.isArray(m) || m[0] !== 'EVENT' || m[1] !== this.sub) return;
    const ev = m[2];
    if (!ev || !TAGS[ev.kind] || typeof ev.id !== 'string' || typeof ev.content !== 'string' || ev.content.length > MAX_CONTENT || ev.pubkey === this.pk) return;
    if (!Array.isArray(ev.tags) || !ev.tags.some((t) => Array.isArray(t) && t[0] === 't' && t[1] === TAGS[ev.kind])) return;
    if (typeof ev.created_at !== 'number' || Math.abs(ev.created_at - Date.now() / 1000) > SKEW_S) return;
    if (this.seen.has(ev.id)) return;
    let ok = false; try { ok = this.nt.verifyEvent(ev); } catch (e) { /* ignore */ }
    if (!ok) return;
    this.seen.add(ev.id); if (this.seen.size > 400) this.seen.delete(this.seen.values().next().value);
    this.on(ev.content, ev.pubkey, ev.kind);
  }
  publish(text, kind = KIND) {
    if (!this.nt || this.dead) return;
    let ev; try { ev = this.nt.finalizeEvent({ kind, created_at: Math.floor(Date.now() / 1000), tags: [['t', TAGS[kind]]], content: text }, this.sk); } catch (e) { return; }
    const s = JSON.stringify(['EVENT', ev]);
    for (const r of this.relays) if (r.open) { try { r.ws.send(s); } catch (e) { /* ignore */ } }
  }
  subscribe(on) {
    this.on = on; this.sub = 'tilt' + Math.random().toString(36).slice(2, 8);
    for (const r of this.relays) if (r.open) this._req(r);
  }
  unsubscribe() {
    if (this.sub) for (const r of this.relays) if (r.open) { try { r.ws.send(JSON.stringify(['CLOSE', this.sub])); } catch (e) { /* ignore */ } }
    this.sub = ''; this.on = null;
  }
  status() { return { open: this.relays.filter((r) => r.open).length, total: this.relays.length, failed: this.failed }; }
  close() { this.dead = true; this.unsubscribe(); for (const r of this.relays) { clearTimeout(r.timer); r.open = false; try { if (r.ws) { r.ws.onclose = r.ws.onerror = null; r.ws.close(); } } catch (e) { /* ignore */ } r.ws = null; } }
}

/** ?net=local: the same thing between two tabs of one browser. */
class LocalTransport {
  constructor() { this.id = Math.random().toString(36).slice(2); this.ch = new BroadcastChannel('tilt-lobby'); this.on = null; this.onOpen = null; this.ch.onmessage = (e) => { const d = e.data; if (this.on && d && d.from !== this.id && typeof d.text === 'string') this.on(d.text, d.from, d.kind || KIND); }; }
  start() { return Promise.resolve(); }
  publish(text, kind = KIND) { try { this.ch.postMessage({ from: this.id, text, kind }); } catch (e) { /* ignore */ } }
  subscribe(on) { this.on = on; }
  unsubscribe() { this.on = null; }
  status() { return { open: 1, total: 1, failed: false }; }
  close() { this.on = null; try { this.ch.close(); } catch (e) { /* ignore */ } }
}

// ------------------------------------------------------------------ the lobby
class Lobby {
  constructor(tr) { this.tr = tr; this.room = null; this.sent = ''; this.iv = 0; this.cb = null; this.pv = 0; this.map = new Map(); this.closedAt = new Map(); this.sig = ''; this.subbed = false; this.pst = ''; this.piv = 0; this.pcb = null; this.peers = new Map(); this.psweep = 0; this.psig = ''; this.reply = 0; this.lastBeat = 0; tr.onOpen = () => { if (this.room) this._send(); if (this.pst) this._beat(); }; }
  announce(room) {
    const key = JSON.stringify(mine(room)), changed = !this.room || key !== this.sent;
    this.room = room; this.sent = key;
    if (!this.iv) this.iv = setInterval(() => this._send(), ANNOUNCE_MS);
    this.tr.start().then(() => { if (changed && this.room) this._send(); });
  }
  _send(closed) { const r = this.room; if (!r) return; this.tr.publish(JSON.stringify(Object.assign(mine(r), { n: 1, closed: closed ? 1 : undefined, ts: Date.now() }))); }
  stop() { if (!this.room) return; this._send(true); this.room = null; this.sent = ''; clearInterval(this.iv); this.iv = 0; }
  watch(cb) {
    this.cb = cb; this.map.clear(); this.sig = '';
    this._sub();
    this.tr.start().then(() => this._emit(true));
    clearInterval(this.pv); this.pv = setInterval(() => this._emit(false), 1000);
    this._emit(true);
  }
  unwatch() { this.cb = null; clearInterval(this.pv); this.pv = 0; this.map.clear(); this._sub(); }
  /** One subscription serves both the room list and the presence count: on while either is wanted. */
  _sub() {
    const want = !!(this.cb || this.pst);
    if (want && !this.subbed) { this.subbed = true; this.tr.subscribe((text, from, kind) => { if (kind === PKIND) this._hearPresence(text, from); else if (this.cb) this._hear(text, from); }); }
    else if (!want && this.subbed) { this.subbed = false; this.tr.unsubscribe(); }
  }
  // ---- presence: present('lobby' | 'match') announces; present(null) leaves. onPresence(cb) gets { others, knights, jousts, open } whenever it changes.
  onPresence(cb) { this.pcb = cb; this._pemit(true); }
  present(st) {
    if (st !== 'lobby' && st !== 'match') st = '';
    if (st === this.pst) return;
    const was = this.pst; this.pst = st;
    if (!st) { if (was) this._beat(true); clearInterval(this.piv); clearInterval(this.psweep); this.piv = this.psweep = 0; this.peers.clear(); clearTimeout(this.reply); this.reply = 0; this._sub(); this._pemit(true); return; }
    this._sub();
    if (!this.piv) { this.piv = setInterval(() => this._beat(), PRESENCE_MS); this.psweep = setInterval(() => this._pemit(false), 2000); }
    this.tr.start().then(() => { if (this.pst) this._beat(); });
    this._pemit(true);
  }
  _beat(bye) { const st = bye ? 'lobby' : this.pst; if (!st) return; this.lastBeat = Date.now(); this.tr.publish(JSON.stringify({ k: 'tilt', p: PROTOCOL, st, ts: Date.now(), bye: bye ? 1 : undefined }), PKIND); }
  _hearPresence(text, from) {
    const a = parsePresence(text); if (!a || typeof from !== 'string') return;
    if (a.bye) this.peers.delete(from);
    else {
      const fresh = !this.peers.has(from); if (fresh && this.peers.size >= 500) return;
      this.peers.set(from, { st: a.st, seen: Date.now() });
      if (fresh && this.pst && !this.reply && Date.now() - (this.lastBeat || 0) > 4000) this.reply = setTimeout(() => { this.reply = 0; if (this.pst) this._beat(); }, 200 + Math.random() * 1300);      // a newcomer is told we are here at once, not in 20 s
    }
    this._pemit(false);
  }
  /** Who is here, from what was really heard: others (distinct keys heard lately), knights (with yourself), jousts (pairs in a match). */
  presence() {
    const now = Date.now(); let others = 0, inMatch = 0;
    for (const [k, v] of this.peers) { if (now - v.seen > PRESENCE_FRESH_MS) { this.peers.delete(k); continue; } others++; if (v.st === 'match') inMatch++; }
    const st = this.tr.status(), me = this.pst ? 1 : 0;
    return { others, knights: others + me, jousts: Math.floor((inMatch + (this.pst === 'match' ? 1 : 0)) / 2), open: st.open > 0, listening: !!this.pst };
  }
  _pemit(force) {
    if (!this.pcb) return; const p = this.presence(), sig = JSON.stringify(p);
    if (!force && sig === this.psig) return; this.psig = sig; try { this.pcb(p); } catch (e) { console.error('[lobby] presence handler', e); }
  }
  _hear(text, from) {
    const a = parseAnnouncement(text); if (!a) return;
    const now = Date.now(), cur = this.map.get(a.code), dead = this.closedAt.get(a.code);
    if (dead != null && a.ts <= dead) return;                               // a late copy of something already closed
    if (cur && a.ts && cur.ts && a.ts < cur.ts) return;                    // only the newest event per code counts
    if (a.closed || a.n >= 2) { if (cur && cur.from !== from) return; this.map.delete(a.code); this.closedAt.set(a.code, a.ts); if (this.closedAt.size > 200) this.closedAt.delete(this.closedAt.keys().next().value); this._emit(false); return; }
    if (cur && cur.from !== from) return;                                   // a code belongs to the first key that announced it
    for (const [k, v] of this.map) if (v.from === from && k !== a.code) this.map.delete(k);      // one room per host
    if (!cur && this.map.size >= MAX_ROOMS) return;
    this.map.set(a.code, { code: a.code, name: a.name, v: a.v, m: a.m, c: a.c, ts: a.ts, from, first: cur ? cur.first : now, seen: now });
    this._emit(false);
  }
  rooms() {
    const now = Date.now(); for (const [k, v] of this.map) if (now - v.seen > FRESH_MS) this.map.delete(k);
    return [...this.map.values()].sort((a, b) => a.first - b.first).map((v) => ({ code: v.code, name: v.name, v: v.v, m: v.m, c: v.c, first: v.first, seen: v.seen }));
  }
  _emit(force) {
    if (!this.cb) return;
    const rooms = this.rooms(), st = this.tr.status(), sig = JSON.stringify(rooms.map((r) => [r.code, r.name, r.v, r.m, r.c])) + st.open + '/' + st.failed;
    if (!force && sig === this.sig) return;
    this.sig = sig; try { this.cb(rooms, st); } catch (e) { console.error('[lobby] handler', e); }
  }
  status() { return this.tr.status(); }
  close() { this.present(null); this.pcb = null; this.stop(); this.unwatch(); this.tr.close(); }
}
export function createLobby(kind = useLocal() ? 'local' : 'nostr') { return new Lobby(kind === 'local' ? new LocalTransport() : new NostrTransport()); }
/** Warm the library up (the online screen calls this when it opens). */
export function preloadLobby() { if (!useLocal()) loadNostr().catch(() => {}); }
