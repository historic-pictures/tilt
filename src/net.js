// net.js - the transport for "Joust a friend": one small interface, two implementations.
//
//   const net = createNet();            // PeerJS (real play) or, with ?net=local, a BroadcastChannel between two tabs of one browser
//   net.onOpen = () => {};              // the other side is connected (host: a friend joined; guest: connected to the host)
//   net.onMessage = (obj) => {};        // a message from the other side (plain JSON objects)
//   net.onClose = () => {};             // the other side left, or the link dropped
//   await net.host(code)                // register the room (resolves once it can be found; rejects with Error('taken') if the code is in use)
//   await net.join(code)                // connect to a room (resolves when connected; rejects with Error('notfound' | 'timeout' | 'unreachable'))
//   net.send(obj); net.close();
//
// STUN only unless src/netcfg.js has a TURN credentials URL: some networks block direct connections, and then join() fails with 'timeout' after JOIN_TIMEOUT.
import { iceServers } from './netcfg.js';
// ?relay=1 forces every connection through the TURN relay (testing what players behind strict networks get)
const rtcConfig = (list) => { let relay = false; try { relay = new URLSearchParams(location.search).get('relay') === '1'; } catch (e) { /* ignore */ } return relay ? { iceServers: list, iceTransportPolicy: 'relay' } : { iceServers: list }; };

export const JOIN_TIMEOUT = 15000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I and O (and no digits: 0 and 1 look like O and I)
export const CODE_LEN = 5;
export const makeCode = () => { let s = ''; for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0]; return s; };
/** What a person typed, made into a code (letters only, upper case; I and O are not in the alphabet, so they are read as nothing). */
export const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').split('').filter(c => ALPHABET.includes(c)).join('').slice(0, CODE_LEN);
export const validCode = (c) => typeof c === 'string' && c.length === CODE_LEN && [...c].every(ch => ALPHABET.includes(ch));
export const useLocal = () => { try { return new URLSearchParams(location.search).get('net') === 'local'; } catch (e) { return false; } };
export const FAIL_TEXTS = {
  notfound: 'No room with that code. Check the letters, and make sure your friend is still on the waiting screen (on a phone, switching apps can close the room).',
  timeout: "Found your friend's room but couldn't connect. One of your networks blocks direct connections.",
  unreachable: "Couldn't reach the matchmaking server. Check your connection.",
};
export const failText = (e) => FAIL_TEXTS[e && e.message] || FAIL_TEXTS.timeout;
export const FAIL_TEXT = FAIL_TEXTS.timeout;

export function createNet(kind = useLocal() ? 'local' : 'peer') { return kind === 'local' ? new LocalNet() : new PeerNet(); }

class Base {
  constructor() { this.onOpen = null; this.onMessage = null; this.onClose = null; this.open = false; this.kind = ''; this._dead = false; }
  _opened() { if (this._dead || this.open) return; this.open = true; if (this.onOpen) this.onOpen(); }
  _closed() { const was = this.open; this.open = false; if (was && !this._dead && this.onClose) this.onClose(); }
  _msg(d) { if (!this._dead && d && typeof d === 'object' && this.onMessage) { try { this.onMessage(d); } catch (e) { console.error('[net] handler', e); } } }
}

// ------------------------------------------------------------------ PeerJS (the free public cloud server, default options)
let peerLoad = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLoad) return peerLoad;
  peerLoad = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('unreachable')));
    s.onerror = () => { peerLoad = null; rej(new Error('unreachable')); };
    document.head.appendChild(s);
  });
  return peerLoad;
}
/** Warm the library up (the online screen calls this when it opens, so that Create / Join does not wait for it). */
export function preloadNet() { if (!useLocal()) loadPeerJS().catch(() => {}); }

/** Log what the connection is doing (a player can copy the console to us): the ICE state and the kinds of candidate gathered (host / srflx / relay). */
function watchIce(c, who) {
  const pc = c && c.peerConnection; if (!pc) return;
  const types = {};
  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) { const t = e.candidate.type || (/ typ (\w+)/.exec(e.candidate.candidate || '') || [])[1] || '?'; types[t] = (types[t] || 0) + 1; }
    else console.warn('[net] ' + who + ' candidates gathered:', JSON.stringify(types));
  });
  pc.addEventListener('iceconnectionstatechange', () => console.warn('[net] ' + who + ' iceConnectionState:', pc.iceConnectionState, JSON.stringify(types)));
}

class PeerNet extends Base {
  constructor() { super(); this.kind = 'peer'; this.peer = null; this.conn = null; this.code = ''; this.cfg = null; this.Peer = null; this._vis = null; }
  async host(code) {
    this.Peer = await loadPeerJS(); this.code = code; this.cfg = rtcConfig(await iceServers());
    await this._hostPeer();
    // phones: the page was asleep and the signalling link dropped (or the peer was destroyed): when it is seen again, reconnect, or take the same code again
    this._vis = () => {
      if (document.visibilityState !== 'visible' || this._dead || !this.code) return;
      const p = this.peer;
      if (!p || p.destroyed) { if (!(this.conn && this.conn.open)) this._rehost(8); }
      else if (p.disconnected) { console.warn('[net] host: signalling link was down, reconnecting'); try { p.reconnect(); } catch (e) { /* ignore */ } }
    };
    document.addEventListener('visibilitychange', this._vis);
    return code;
  }
  _rehost(left) {
    console.warn('[net] host: re-opening room', this.code);
    this._hostPeer().catch((e) => { console.warn('[net] host: re-open failed:', e && e.message); if (left > 0 && !this._dead) setTimeout(() => { if (!this._dead && (!this.peer || this.peer.destroyed)) this._rehost(left - 1); }, 4000); });
  }
  _hostPeer() {
    return new Promise((resolve, reject) => {
      let done = false;
      try { if (this.peer && !this.peer.destroyed) this.peer.destroy(); } catch (e) { /* ignore */ }
      const peer = this.peer = new this.Peer('tilt-' + this.code, { config: this.cfg });
      const fail = (e) => { if (!done) { done = true; reject(e); } };
      const t = setTimeout(() => fail(new Error('unreachable')), JOIN_TIMEOUT);
      peer.on('open', () => { if (!done) { done = true; clearTimeout(t); resolve(this.code); } });
      peer.on('error', (err) => { clearTimeout(t); console.warn('[net] host peer error:', err && err.type); fail(new Error(err && err.type === 'unavailable-id' ? 'taken' : 'unreachable')); });
      peer.on('connection', (c) => {
        if (this.conn && this.conn.open) { try { c.on('open', () => c.close()); } catch (e) { /* ignore */ } return; }      // a room holds two
        watchIce(c, 'host'); this._attach(c);
      });
      peer.on('disconnected', () => { try { if (!peer.destroyed && document.visibilityState === 'visible') peer.reconnect(); } catch (e) { /* ignore */ } });      // lost the signalling server: the open link carries on
    });
  }
  async join(code) {
    const Peer = await loadPeerJS(), cfg = rtcConfig(await iceServers());
    return new Promise((resolve, reject) => {
      let done = false, t1 = 0, t2 = 0, c = null;
      const peer = this.peer = new Peer(undefined, { config: cfg });
      const fail = (m, why) => { if (!done) { done = true; clearTimeout(t1); clearTimeout(t2); const pc = c && c.peerConnection; console.warn('[net] join failed:', m, why || '', pc ? 'iceConnectionState=' + pc.iceConnectionState : ''); reject(new Error(m)); } };
      t1 = setTimeout(() => fail('unreachable', 'no answer from the signalling server'), JOIN_TIMEOUT);
      peer.on('error', (err) => { const ty = err && err.type; fail(ty === 'peer-unavailable' ? 'notfound' : ty === 'network' || ty === 'server-error' || ty === 'socket-error' || ty === 'socket-closed' ? 'unreachable' : 'timeout', 'peer error ' + ty); });
      peer.on('open', () => {
        clearTimeout(t1); t2 = setTimeout(() => fail('timeout', 'no data channel in time'), JOIN_TIMEOUT);
        c = peer.connect('tilt-' + code, { reliable: true, serialization: 'json' });
        setTimeout(() => watchIce(c, 'guest'), 0);
        c.on('open', () => { if (done) return; done = true; clearTimeout(t2); this._attach(c); resolve(); });
        c.on('error', (e) => fail('timeout', 'connection error ' + (e && e.type)));
        c.on('close', () => { if (!done) fail('timeout', 'connection closed before it opened'); });
      });
    });
  }
  _attach(c) {
    this.conn = c;
    const go = () => this._opened();
    if (c.open) go(); else c.on('open', go);
    c.on('data', (d) => this._msg(d));
    c.on('close', () => { if (this.conn === c) this._closed(); });
    c.on('error', () => { if (this.conn === c) this._closed(); });
  }
  send(obj) { try { if (this.conn && this.conn.open) this.conn.send(obj); } catch (e) { /* the link is going */ } }
  close() { this._dead = true; this.open = false; if (this._vis) document.removeEventListener('visibilitychange', this._vis); try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ } try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ } this.conn = this.peer = null; }
}

// ------------------------------------------------------------------ BroadcastChannel (?net=local): two tabs of one browser
class LocalNet extends Base {
  constructor() { super(); this.kind = 'local'; this.ch = null; this.id = Math.random().toString(36).slice(2); this.peerId = null; this.role = ''; this._bye = () => { try { if (this.ch) this.ch.postMessage({ k: 'bye', from: this.id }); } catch (e) { /* ignore */ } }; }
  _open(code) {
    this.ch = new BroadcastChannel('tilt-room-' + code);
    this.ch.onmessage = (e) => this._rx(e.data);
    window.addEventListener('pagehide', this._bye);
  }
  async host(code) {
    this.role = 'host'; this._open(code);
    // is somebody already hosting this code? ask, and wait a moment for an answer
    const taken = await new Promise((res) => {
      const probe = (e) => { if (e.data && e.data.k === 'here') res(true); };
      this.ch.addEventListener('message', probe); this.ch.postMessage({ k: 'who', from: this.id });
      setTimeout(() => { this.ch.removeEventListener('message', probe); res(false); }, 250);
    });
    if (taken) { this.close(); throw new Error('taken'); }
    return code;
  }
  async join(code) {
    this.role = 'guest'; this._open(code);
    return new Promise((resolve, reject) => {
      let n = 0;
      const iv = setInterval(() => { if (this.open) return; if (++n > 8) { clearInterval(iv); clearTimeout(t); this.close(); reject(new Error('notfound')); return; } this.ch.postMessage({ k: 'hello', from: this.id }); }, 250);
      const t = setTimeout(() => { clearInterval(iv); }, 3000);
      this.ch.postMessage({ k: 'hello', from: this.id });
      this._joined = () => { clearInterval(iv); clearTimeout(t); resolve(); };
    });
  }
  _rx(m) {
    if (!m || m.from === this.id) return;
    if (m.k === 'who') { if (this.role === 'host') this.ch.postMessage({ k: 'here', from: this.id }); return; }
    if (m.k === 'hello' && this.role === 'host') {
      if (this.peerId && this.peerId !== m.from && this.open) { this.ch.postMessage({ k: 'full', to: m.from, from: this.id }); return; }
      this.peerId = m.from; this.ch.postMessage({ k: 'welcome', to: m.from, from: this.id }); this._opened(); return;
    }
    if (m.k === 'welcome' && this.role === 'guest' && m.to === this.id) { this.peerId = m.from; this._opened(); if (this._joined) this._joined(); return; }
    if (m.k === 'full' && m.to === this.id) return;
    if (this.peerId && m.from !== this.peerId) return;
    if (m.k === 'msg') this._msg(m.d);
    else if (m.k === 'bye') { this._closed(); this.peerId = null; }
  }
  send(obj) { try { if (this.ch && this.open) this.ch.postMessage({ k: 'msg', from: this.id, d: obj }); } catch (e) { /* ignore */ } }
  close() { this._bye(); this._dead = true; this.open = false; window.removeEventListener('pagehide', this._bye); try { if (this.ch) this.ch.close(); } catch (e) { /* ignore */ } this.ch = null; }
}
