// pause.js - the online pause, as FIFA does it: either player may call a pause (3 a match, up to 30 s each); both screens freeze together.
//
// Pure state machine, no DOM, no game state: main.js feeds it key presses, messages and the clock, and acts on its callbacks.
// HOST-AUTHORITATIVE. The host alone starts and ends a pause and keeps both players' counts:
//   guest: press() -> {t:'pz', a:'req'}                         host: starts it when the charge is over -> {t:'pz', a:'on', by, l:[hostLeft, guestLeft], ms}
//   the pauser resumes: host -> end(); guest -> {t:'pz', a:'off'} (the host ends it)       host: end -> {t:'pz', a:'off'} to the guest
//   the 30 s run out: the host ends it (the guest also lets go on its own 3 s after its own clock, if the host's word never came)
//   refused (none left, or one already stands): {t:'pz', a:'deny', why}
// The channel is reliable and ordered, so every stroke message of a finished charge reaches the guest before the 'on' that follows it.
export const PAUSES = 3, PAUSE_MS = 30000, GRACE_MS = 3000;

export class OnlinePause {
  /** isHost: this side is the host. send(obj): put a message on the channel. now(): milliseconds. cb: { on(by), off(why), note(text), change() } */
  constructor(isHost, send, now = () => performance.now(), cb = {}) { this.host = !!isHost; this.send = send; this.now = now; this.cb = cb; this.reset(); }
  reset() { this.left = { h: PAUSES, g: PAUSES }; this.cur = null; this.want = null; }
  get me() { return this.host ? 'h' : 'g'; }
  get them() { return this.host ? 'g' : 'h'; }
  /** milliseconds left of the pause that stands (0 if none) */
  remaining() { return this.cur ? Math.max(0, this.cur.until - this.now()) : 0; }
  paused() { return !!this.cur; }
  mine() { return !!this.cur && this.cur.by === this.me; }
  requested() { return this.want === this.me; }
  /** The player's pause key. Returns 'resume' | 'theirs' | 'none' | 'requested' | 'started' | 'already'. `charging`: a charge is on (host's view, used to hold the start). */
  press(charging = false) {
    const c = this.cur;
    if (c) { if (c.by === this.me) { this._resume(); return 'resume'; } return 'theirs'; }
    if (this.want === this.me) return 'already';
    if (this.left[this.me] <= 0) { this._note('No pauses left'); return 'none'; }
    if (this.want) { this._note('Your opponent has asked for a pause'); return 'theirs'; }
    this.want = this.me;
    if (this.host) { this.poll(charging); return this.cur ? 'started' : 'requested'; }
    this.send({ t: 'pz', a: 'req' }); this._change(); return 'requested';
  }
  /** Host: call every frame (and on each request) with whether a charge is on: a waiting request starts the moment it is not. */
  poll(charging) {
    if (!this.host || this.cur || !this.want || charging) return;
    const by = this.want; this.want = null;
    if (this.left[by] <= 0) { if (by === 'g') this.send({ t: 'pz', a: 'deny', why: 'none' }); return; }
    this.left[by]--; this.cur = { by, until: this.now() + PAUSE_MS };
    this.send({ t: 'pz', a: 'on', by, l: [this.left.h, this.left.g], ms: PAUSE_MS });
    if (this.cb.on) this.cb.on(by); this._change();
  }
  _resume() { if (this.host) this.end('resume'); else this.send({ t: 'pz', a: 'off' }); }
  /** Host: end the pause that stands. */
  end(why = 'resume') {
    if (!this.cur) return;
    this.cur = null; if (this.host) this.send({ t: 'pz', a: 'off', why });
    if (this.cb.off) this.cb.off(why); this._change();
  }
  /** Call a few times a second while a pause stands: the 30 s clock. */
  tick() {
    if (!this.cur) return;
    const r = this.cur.until - this.now();
    if (this.host) { if (r <= 0) this.end('time'); }
    else if (r <= -GRACE_MS) { this.cur = null; if (this.cb.off) this.cb.off('time'); this._change(); }
  }
  /** A 'pz' message from the other side. */
  receive(m, charging = false) {
    if (!m || m.t !== 'pz') return;
    if (this.host) {
      if (m.a === 'req') {
        if (this.left.g <= 0) { this.send({ t: 'pz', a: 'deny', why: 'none' }); return; }
        if (this.cur || this.want) { this.send({ t: 'pz', a: 'deny', why: 'busy' }); return; }
        this.want = 'g'; this.poll(charging);
      } else if (m.a === 'off' && this.cur && this.cur.by === 'g') this.end('resume');
      return;
    }
    if (m.a === 'on') {
      const by = m.by === 'h' ? 'h' : 'g', ms = Math.min(PAUSE_MS, Math.max(1000, +m.ms || PAUSE_MS));
      if (Array.isArray(m.l)) { this.left.h = Math.max(0, Math.min(PAUSES, m.l[0] | 0)); this.left.g = Math.max(0, Math.min(PAUSES, m.l[1] | 0)); }
      this.want = null; this.cur = { by, until: this.now() + ms };
      if (this.cb.on) this.cb.on(by); this._change();
    } else if (m.a === 'off') {
      if (this.cur) { this.cur = null; if (this.cb.off) this.cb.off(m.why || 'resume'); this._change(); }
    } else if (m.a === 'deny') {
      this.want = null; this._note(m.why === 'busy' ? 'A pause is already called' : 'No pauses left'); this._change();
    }
  }
  _note(t) { if (this.cb.note) this.cb.note(t); }
  _change() { if (this.cb.change) this.cb.change(); }
}
