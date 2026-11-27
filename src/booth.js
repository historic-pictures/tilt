// The commentary booth (Master Pell and Sir Walter, src/booth_lines.js): a second voice channel beside the main one (src/voice.js), shown as small subtitles.
// The herald no longer speaks (src/channels.js), so the booth has the floor. It still yields to the one remaining main-channel line (the marshal's 'Ride!'):
//   * it starts a line only when the main channel is idle (nothing up, nothing waiting) and has been for a moment, and only if the next line the main channel
//     has scheduled (voice.later timers) is far enough off for this one to finish; the impact exclamations (2-4 words) are the only exception to the moment;
//   * when the main channel shows a line, the booth yields at once (its speech stops, its subtitle goes; the rest of an exchange waits to resume);
//   * it speaks aloud only when the browser's speech is free, else the line is subtitle only.
// Its own rules: one line at a time, up to three waiting (the most important goes first; when full the least important is dropped), a time-to-live on the waiting one, a gap after each line,
// a budget of turns per course, filler only in a long quiet. Phases: the charge allows only 'away' and 'charge.*', the strike only 'exclaim.*', the replay no filler.
// Pools never repeat until used up (a session-wide history), so a match never hears the same line twice.
import { BOOTH, BOOTH_CAST } from './booth_lines.js';
import { BOOTH as SW } from './channels.js';

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const words = (s) => strip(s).split(/\s+/).filter(Boolean).length;
export const turnTime = (s, fast = false) => Math.max(fast ? 1.1 : 1.7, 0.36 * words(s) + (fast ? 0.5 : 0.9));      // subtitle time for a turn (reading pace; the robot voice ends it sooner or later via onEnd)
const PRIO = { exclaim: 6, away: 5, charge: 5, result: 6, after: 4, celebrate: 4, momentum: 3, score: 3, stakes: 2.5, ready: 2, agenda: 2, filler: 1 };
const BUDGET = 10;          // turns per course (the exclamation and the charge lines do not count)
const GAP = 0.8, MAIN_CLEAR = 0.5, EX_GAP = 0.6, QMAX = 6, TIGHT = 7;      // GAP: the breath between two of his lines (~0.6-1 s)
const used = new Map();    // pool path -> indexes used (session-wide)

/** The pool at a dotted path of BOOTH ('after.breakYou', 'venue.smithfield'). */
/** Seconds to say a turn (the reading time may run on under the herald's next line). */
const sayTime = (t) => Math.min(turnTime(t), 0.3 * words(t) + 0.7) + 0.2;
export function poolAt(path) { let o = BOOTH; for (const k of path.split('.')) { o = o && o[k]; } return Array.isArray(o) ? o : null; }
const isTurn = (e) => typeof e[0] === 'string';

/**
 * host = { phase(), abort() (true when the match was left / paused to the menu / commentary off: the only time a line is cut), speaking() (his sound is still playing), mainBusy(), mainQuiet() (s until the main channel's next scheduled line), mainIdle() (s since it last showed a line ended),
 *          enabled(), vars() (placeholder values), clip(id, spk) -> { t, d } | null (a recorded clip is ready), speak(text, key, onEnd, clipId) -> false | true (robot voice) | 'clip', stopSpeak(), show(label, text, who), hide(), dev }
 */
export function createBooth(host) {
  const B = { t: 0, lastEx: -99, cur: null, q: [], lastEnd: -99, gap: 0, course: 0, turns: 0, fillerAt: -99, agenda: [], log: [], lastKey: null, quietSince: 0 };

  function fill(text, vars) {
    let miss = false;
    const out = text.replace(/\{(\w+)\}/g, (_, k) => { const v = vars[k]; if (v === undefined || v === null || v === '') { miss = true; return ''; } return v; });
    return miss ? null : out.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());      // a sentence opened by a placeholder ("two all.") starts with a capital
  }
  /** Pick an entry from a pool: not used this session while the pool lasts; fill its placeholders; returns [{ spk, text }] (one turn, or the exchange). */
  function pickFrom(path, vars, fit = Infinity, recOnly = false) {
    const pool = poolAt(path); if (!pool || !pool.length) return null;
    let u = used.get(path); if (!u) used.set(path, u = []);
    let cand = pool.map((_, i) => i).filter(i => !u.includes(i));
    if (!cand.length) { const last = u[u.length - 1]; u.length = 0; cand = pool.map((_, i) => i).filter(i => i !== last); if (!cand.length) cand = [0]; }
    cand.sort(() => Math.random() - 0.5);
    for (const i of cand) {
      const e = pool[i];
      if (!SW.drewe && (isTurn(e) ? [e] : e).some(([spk, text, nf]) => spk === 'C' || /Walter|Drewe/.test(text + (nf || '')))) { u.push(i); continue; }      // Sir Walter is off (src/channels.js BOOTH): no exchange with him, no Pell line that speaks to him
      const ex = !isTurn(e), turns = (ex ? e : [e]).map(([spk, text, nf], k) => ({ spk, text: fill(text, vars) ?? (nf ? fill(nf, vars) : null), id: `booth.${path}.${i}${ex ? '.t' + k : ''}` }));      // id: the recorded clip for this turn (src/voice_clips.js)
      if (recOnly && host.hasClip && !turns.every(x => host.hasClip(x.id))) continue;      // only a recorded line (never the robot voice)
      if (B.clipOnly && !turns.every(x => x.spk === 'P' && host.clip && host.clip(x.id, 'P'))) continue;      // a watched bout: only what Pell has recorded (never the robot voice)
      const total = turns.reduce((a, x) => a + (x.text ? sayTime(x.text) + 0.3 : 99), 0);
      if (turns.every(x => x.text) && sayTime(turns[0].text) <= fit && total <= fit + 1.5) { u.push(i); return turns; }      // fit: a line (or an exchange) that can be said in the quiet there is
    }
    return null;
  }

  function okIn(L, P) {
    if (P === 'menu') return false;
    if (P === 'charge') return /^(away|charge)/.test(L.key);
    if (P === 'strike') return /^(exclaim|after|momentum|score)/.test(L.key);      // (the herald is silent until the judges' flags; the booth may talk over the slowing horses)
    if (P === 'replay') return !/^(filler|agenda|ready|away|charge)/.test(L.key);
    if (P === 'end') return /^(result|celebrate|after|exclaim|momentum)/.test(L.key);
    if (/^(ready|momentum\.lastCourse|momentum\.extra)/.test(L.key)) return P === 'ready';      // the quiet before the flag, and nowhere else
    if (/^(agenda|filler|history)/.test(L.cat) && B.t - B.lastEx < 8) return false;              // not on top of a stroke
    if (P === 'intro') return /^(welcome|venue|knight|mode|history|filler|you|stakes|grudge|revenge|horse|arms|agenda)/.test(L.key) || L.cat === 'agenda';
    if (/^(away|charge)/.test(L.key)) return false;
    return true;
  }

  /** Ask for a line. key: a BOOTH path. o: { prio, ttl, delay, vars, cat }. Returns true when it was queued. */
  B.say = function say(key, o = {}) {
    if (!host.enabled()) return false;
    if (B.only && !B.only.test(key)) return false;      // a watched bout: only the lines that do not speak of 'you'
    const vars = Object.assign({}, host.vars(), o.vars);
    const head = key.split('.')[0], fast = /^(exclaim|away|charge)$/.test(head);
    if (!poolAt(key)) return false;
    const turns = fast ? pickFrom(key, vars) : null; if (fast && !turns) return false;      // the rest is picked when it is about to be said, to fit the quiet there is then
    const prio = o.prio ?? PRIO[o.cat] ?? PRIO[head] ?? 2;
    const L = { key, rec: !!o.rec, cat: o.cat || head, turns, i: 0, prio, at: B.t + (o.delay || 0), ttl: o.ttl ?? (head === 'exclaim' ? 0.9 : head === 'away' || head === 'charge' ? 1.2 : 5), course: B.course, when: o.when || null, ex: head === 'exclaim', fast, vars };
    if (!okIn(L, host.phase()) && !(o.delay > 0)) { B.note(L, 'phase'); return false; }
    if (L.ex) {      // the stroke: the exclamation goes as soon as the line he is saying is finished (a line that has started is never cut); the small talk queued for before it goes
      B.lastEx = B.t;
      B.q = B.q.filter(c => { const keep = !/^(ready|agenda|filler|history|away|charge|momentum\.lastCourse)/.test(c.cat === 'agenda' ? 'agenda' : c.key); if (!keep) B.note(c, 'stroke'); return keep; });
    }
    enqueue(L); pump(); return true;
  };
  B.note = (L, why) => { if (host.dev && B.log.length < 2000) B.log.push({ t: +B.t.toFixed(2), key: L.key, dropped: why, text: L.turns ? L.turns.map(x => x.text).join(' / ') : '(not yet picked)' }); };
  /** The lances meet: no more small talk is started now (what was queued for before the stroke goes; a line already being said finishes); the exclamation follows. */
  B.mark = function mark() {
    B.lastEx = B.t;
    B.q = B.q.filter(c => { const keep = c.cat !== 'agenda' && !/^(ready|filler|history|momentum\.lastCourse)/.test(c.key); if (!keep) B.note(c, 'stroke'); return keep; });
  };
  /** The talking points for the quiet moments of this match, in order (keys of BOOTH). */
  B.setAgenda = (keys) => { B.agenda = keys.filter(k => poolAt(k)); };

  /** The waiting lines: at most QMAX; when full, the least important (the oldest of equals) goes. */
  function enqueue(L) {
    B.q.push(L);
    if (B.q.length > QMAX) { let w = 0; for (let i = 1; i < B.q.length; i++) if (B.q[i].prio < B.q[w].prio) w = i; B.note(B.q[w], 'queue full'); B.q.splice(w, 1); }
  }
  function startTurn(L) {
    const tr = L.turns[L.i], P = host.phase();
    const cast = BOOTH_CAST[tr.spk] || BOOTH_CAST.P;
    const clip = host.clip ? host.clip(tr.id, tr.spk) : null;      // a recorded clip for this turn: its own words are the subtitle (a templated turn is recorded name-free), its length the time
    if (clip) tr.text = clip.t;
    L.shownAt = B.t; L.endAt = B.t + turnTime(tr.text, L.fast); L.spoken = false;
    host.show(cast.label, tr.text, tr.spk);
    const me = L;
    L.spoken = host.speak(tr.text, cast.id, () => { if (B.cur === me && me.spoken) me.endAt = Math.min(me.endAt, B.t + 0.15); }, clip ? tr.id : null);
    if (L.spoken) L.endAt = clip && L.spoken === 'clip' ? B.t + clip.d + 0.4 : Math.max(L.endAt, B.t + 0.8) + 0.6;      // (a spoken line is never ended before its sound is: see pump)      // a robot voice slower than the subtitle extends it (onEnd brings it back); a clip runs its own length
    L.logRow = { t: +B.t.toFixed(2), phase: P, course: B.course, who: cast.label, spk: tr.spk, key: L.key, id: tr.id, text: tr.text, spoken: L.spoken, via: L.spoken === 'clip' ? 'clip' : L.spoken ? 'tts' : 'none' }; B.log.push(L.logRow);
    if (B.log.length > 2000) B.log.shift();
    if (!L.ex && !/^(away|charge)/.test(L.key)) B.turns++;
    B.lastKey = L.key;
  }
  function endTurn(why) {
    const L = B.cur; if (!L) return;
    host.hide(); if (L.spoken) host.stopSpeak();
    if (why !== 'done' && L.logRow && B.t - L.shownAt < 0.8 * (L.endAt - L.shownAt)) L.logRow.cut = +(B.t - L.shownAt).toFixed(1);      // (for transcripts: how long it was up before it was cut)
    B.cur = null; B.lastEnd = B.t; B.quietSince = B.t;
    L.i++;
    if (L.i < L.turns.length) { L.at = B.t + GAP; L.ttl = 9; L.prio += 0.5; enqueue(L); B.gap = GAP; return; }      // the reply waits (a while) for the herald to finish
    B.gap = L.ex || L.fast ? EX_GAP : GAP;
  }
  /** The main channel shows a line (the marshal's 'Ride!'): a line he has started is never cut, so this does nothing now (his new lines wait for him, see pump). */
  B.yield = function yieldTo() { /* never cut */ };

  function pump() {
    const P = host.phase();
    if (host.abort && host.abort()) { if (B.cur) endTurn('abort'); B.q.length = 0; return; }      // the only cut: the player left the match, paused to the menu or switched commentary off
    if (!host.enabled()) { if (B.cur && !B.cur.spoken) endTurn('off'); B.q.length = 0; return; }      // (a line being spoken finishes even when the squire's cheer comes up)
    if (B.cur) {
      const c = B.cur, talking = c.spoken && host.speaking && host.speaking() && B.t < c.shownAt + 45;      // his voice is still on: the line (and its subtitle) stays up
      if (c.spoken ? (!talking && B.t >= c.endAt) : (!okIn(c, P) || B.t >= c.endAt)) endTurn('done');      // a line that has started plays out whatever the phase
    }
    if (B.cur) return;
    for (let i = 0; i < B.q.length; i++) {      // what has gone stale, or belongs to a course or a phase that is over
      const L = B.q[i];
      const why = B.t > L.at + L.ttl ? (okIn(L, P) ? 'stale' : 'stale (phase ' + P + ')') : L.course !== B.course && !/^(result|celebrate)/.test(L.key) ? 'course over' : null;
      if (why) { B.q.splice(i--, 1); B.note(L, why); if (L.cat === 'agenda' && !L.turns && !L.retried) B.agenda.unshift(L.key); }
    }
    let L = null; for (const c of B.q) if (B.t >= c.at && okIn(c, P) && (!c.when || c.when()) && (!L || c.prio > L.prio)) L = c;
    if (!L) return;
    if (B.t < B.lastEnd + B.gap) return;
    if (host.mainBusy()) return;
    if (!L.fast && host.mainIdle() < MAIN_CLEAR) return;
    if (!L.turns) {      // pick the words now, to fit the quiet: between courses (the herald's next line unknown) assume a short gap
      let fit = host.mainQuiet(); if (!isFinite(fit) && ['after', 'replay', 'ready'].includes(P)) fit = TIGHT;
      L.turns = pickFrom(L.key, L.vars, fit - 0.1, L.rec || P === 'intro'); if (!L.turns) return;      // (the opening: recorded lines only, never the robot voice)
    }
    const tr = L.turns[L.i], need = sayTime(tr.text);
    if (!L.fast && host.mainQuiet() < need) return;
    B.q.splice(B.q.indexOf(L), 1);
    if (!L.ex && L.i === 0 && !/^(away|charge|result)/.test(L.key) && B.turns >= BUDGET) return void B.note(L, 'budget');
    B.cur = L; startTurn(L);
  }

  /** Is there an unused entry in this pool whose every turn has a recorded clip (and fits the cast and placeholders)? For the opening, which uses recorded lines only. */
  function recAvail(path) {
    const pool = poolAt(path); if (!pool || !host.hasClip) return !!pool;
    const u = used.get(path) || [], vars = host.vars();
    return pool.some((e, i) => {
      if (u.includes(i)) return false;
      const ts = isTurn(e) ? [e] : e;
      if (!SW.drewe && ts.some(([spk, text, nf]) => spk === 'C' || /Walter|Drewe/.test(text + (nf || '')))) return false;
      return ts.every(([spk, text, nf], k) => (fill(text, vars) ?? (nf ? fill(nf, vars) : null)) !== null && host.hasClip(`booth.${path}.${i}${isTurn(e) ? '' : '.t' + k}`));
    });
  }
  /** Quiet moments: a talking point from the agenda, else filler. In the opening (the intro and the wait for the first 'Ride!') he keeps talking, one recorded line after another with a breath between,
   *  so there is no long silence; later at most one filler a course, after a long quiet. */
  function quiet() {
    const P = host.phase();
    if (B.cur || B.q.length || !['ready', 'after', 'intro'].includes(P) || host.mainBusy()) return;
    if (host.soon && host.soon()) return;      // the lances are up: the marshal is about to cry the signal
    const open = P === 'intro' || (P === 'ready' && B.course <= 1);
    const still = B.t - B.quietSince, mi = host.mainIdle(), mq = host.mainQuiet();
    if (still < (open ? 0.1 : 2) || mi < 1.0 || mq < 3.5) return;      // (the breath between two lines is B.gap)
    if (open) {
      if (B.turns >= BUDGET - 1) return;
      while (B.agenda.length) { const k = B.agenda.shift(); if (recAvail(k)) { B.say(k, { cat: 'agenda', prio: PRIO.agenda, ttl: 4 }); return; } }
      for (const k of ['history', 'filler']) if (recAvail(k) && B.say(k, { cat: k === 'filler' ? 'filler' : 'agenda', prio: PRIO.filler, ttl: 4, rec: true })) return;
      return;
    }
    if (B.agenda.length && B.turns < BUDGET - 2) { const k = B.agenda.shift(); B.say(k, { cat: 'agenda', prio: PRIO.agenda, ttl: 4 }); return; }
    if (P !== 'intro' && still > 5 && B.t - B.fillerAt > 14 && B.turns < BUDGET - 2) { B.fillerAt = B.t; B.say(Math.random() < 0.8 ? 'filler' : 'history', { cat: 'filler', ttl: 4 }); }
  }

  B.update = function update(dt) {
    B.t += dt;
    pump(); quiet();
  };
  B.newCourse = function newCourse(n) {      // a new course: the result and the momentum (the score in words) carry over; a talking point not yet reached goes back on the agenda
    B.course = n; B.turns = 0;
    let carried = false;      // at most one word on the last course (the most important first) is carried into this one
    B.q.sort((x, y) => y.prio - x.prio);
    B.q = B.q.filter(L => {
      const always = /^(result|celebrate)/.test(L.key), last = /^(after\.|momentum\.(lead|level|comeback|collapse|streak|runaway))/.test(L.key) && L.i === 0 && !carried;
      if (always || last) { if (last) carried = true; L.course = n; L.ttl = Math.max(0, B.t - L.at) + 7; L.when = null; return true; }
      if (L.cat === 'agenda' && L.i === 0) B.agenda.unshift(L.key);
      B.note(L, 'course over'); return false;
    });
  };
  /** A watched bout (the roll's Watch Round): clipOnly = Pell's recorded turns only; only = the pools that may be used. */
  B.watch = function watch(on, only) { B.clipOnly = !!on; B.only = on ? only : null; };
  B.reset = function reset() { if (B.cur) endTurn('reset'); B.q.length = 0; B.course = 0; B.turns = 0; B.agenda = []; B.lastEnd = -99; B.gap = 0; B.fillerAt = -99; B.quietSince = B.t; };
  B.speaking = () => !!(B.cur && B.cur.spoken);
  B.busy = () => !!(B.cur || B.q.length);
  return B;
}
