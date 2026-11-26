// The voice director: ONE channel for every spoken / ticker line in a match.
// Every say() / herald() / teach() in main.js goes through voice.line(). Rules come from docs/presentation-research.md:
//   tiers  1 result (strike, fouls, unhorsing) · 2 course state (marshal, score) · 3 colour (facts, teaching, royals, intros) · 4 ambient chatter
//   a higher tier may replace a lower line only while the lower has shown < half its time; tier 1 is never cut
//   queue depth 1 (a newer equal/higher tier replaces the waiting line); a waiting line older than its ttl is dropped
//   min gap 1.5 s between lines (0.5 s of it is the fade); display time = max(3.2 s, 0.5 s per word + 1 s)
//   charge: nothing (only the marshal's signal and a 2-4 word shout at the strike); result line >= impact + 1.0 s, then 2 s of quiet
//   replay: exactly one colour line (plus an optional second remark, o.second, queued behind it: yours, then his); between courses: colour at most every 2nd course; at most 3 course lines per course
// The clock is real time fed by update(dtReal), so a paused game pauses the voice too.

export const CAP = { live: 8, verdict: 10, colour: 20, replay: 18, stop: 30, shout: 4, combined: 24 };   // words
export const MIN_SHOW = 3.2, PER_WORD = 0.5, GAP = 1.5, FADE = 0.5, RESULT_DELAY = 1.0, RESULT_QUIET = 2.0, COURSE_BUDGET = 3;   // display was 2.2 s / 0.38 s a word: too quick to read (13 Nov)
export const showTime = (words) => Math.max(MIN_SHOW, PER_WORD * words + 1);

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const countWords = (s) => strip(s).split(/\s+/).filter(Boolean).length;

/**
 * host = { phase(): 'menu'|'intro'|'ready'|'charge'|'strike'|'replay'|'after'|'end', show(text, who, speaker), hide(), speak(text, tier, voiceKey), dev?: boolean }
 */
export function createVoice(host) {
  const V = { t: 0, course: 0, log: [], cur: null, wait: null, lastEnd: -99, gap: 0, strikeT: null, spokenN: 0, replayDone: false, resultShown: false,
    lastColourCourse: -9, lastCat: null, phase: 'menu' };

  function note(L, status, why) { if (status === 'dropped') { L.entry.dropped = why; L.entry.shown = false; } }
  function drop(L, why) { note(L, 'dropped', why); return false; }

  /** Submit a line. Returns true when it was shown or queued, false when it was dropped. */
  V.line = function line(o) {
    const P = host.phase();
    const tier = o.tier ?? 2;
    const kind = o.kind || (o.shout ? 'shout' : tier >= 3 ? 'colour' : 'live');
    const stop = P === 'intro' || P === 'end' || !!o.stop;
    const words = o.words ?? countWords(o.text);
    const cap = stop && kind !== 'shout' ? CAP.stop : o.cap ? CAP[o.cap] : CAP[kind === 'result' ? 'live' : kind] ?? CAP.live;      // o.cap: a word-cap category of its own (the one combined result call is 'combined', 24 words)
    let at = V.t + (o.delay || 0);
    if (o.after === 'strike') at = Math.max(at, (V.strikeT ?? V.t) + RESULT_DELAY);
    const L = { text: o.text, who: o.who || 'THE MARSHAL', tier, kind, key: o.key || null, cat: o.cat || o.key || null, words, at, ttl: o.ttl ?? (tier >= 3 ? 4 : 1.5),
      hold: o.hold ?? null, speaker: o.speaker || null, voice: o.voice || null, gapAfter: o.gapAfter ?? (kind === 'result' ? RESULT_QUIET : GAP), speak: !!o.speak, prompt: !!o.prompt, free: !!o.free, urgent: !!o.urgent,
      group: o.group || (kind === 'result' ? 'result' : null), prio: o.prio ?? 1, anchor: o.after === 'strike', phases: o.phases ? [].concat(o.phases) : null,
      course: V.course, onShown: o.onShown || null, stop, shownAt: null, endAt: null };
    L.entry = { t: +V.t.toFixed(2), text: strip(L.text), who: L.who, tier, key: L.key, phase: P, course: V.course, shown: false, dropped: null };
    V.log.push(L.entry); if (V.log.length > 400) V.log.shift();
    if (words > cap && host.dev) console.warn(`[voice] "${strip(L.text)}" has ${words} words, cap is ${cap}`);

    // ---- phase gates (dropped, never queued)
    if (P === 'charge' && !L.anchor) return drop(L, 'charge');
    if (P === 'strike' && tier > 1) return drop(L, 'strike');
    if (P === 'replay' && kind !== 'replay' && tier !== 1) return drop(L, 'replay');
    if (kind === 'replay' && V.replayDone && !o.second) return drop(L, 'one colour line per replay');
    if (!stop && kind === 'colour' && !L.free && (P === 'ready' || P === 'after') && V.course - V.lastColourCourse < 2) return drop(L, 'colour budget');
    if (tier >= 3 && kind !== 'replay' && L.cat && L.cat === V.lastCat && !stop) return drop(L, 'same category twice');
    if (L.group === 'result' && V.resultShown) return drop(L, 'one result per course');

    if (kind === 'shout') {            // an interjection: now or never
      if (!V.cur && V.t >= V.lastEnd + V.gap) { show(L); return true; }
      return drop(L, 'busy');
    }
    // ---- one waiting result at most: the most important one stays
    if (L.group === 'result' && V.wait && V.wait.group === 'result') {
      if (V.wait.prio >= L.prio) return drop(L, 'a more important result is waiting');
      drop(V.wait, 'outranked'); V.wait = null;
    }
    // ---- cutting what is showing
    const cur = V.cur;
    if (cur && cur.tier > 1 && cur.key !== 'signal') {
      const half = (V.t - cur.shownAt) < 0.5 * (cur.endAt - cur.shownAt);
      if ((half && L.tier < cur.tier) || (L.urgent && L.tier <= cur.tier)) endCur('cut');      // urgent (the marshal's signal) cuts an equal or lower line at any time
    }
    // ---- queue depth 1
    if (V.wait) {
      if (L.tier <= V.wait.tier) { drop(V.wait, 'replaced by a newer line'); V.wait = L; } else return drop(L, 'queue full');
    } else V.wait = L;
    pump();
    return true;
  };

  function show(L) {
    V.cur = L; L.shownAt = V.t; L.endAt = V.t + (L.hold ?? showTime(L.words));
    L.entry.shown = true; L.entry.dropped = null; L.entry.shownAt = +V.t.toFixed(2);
    host.show(L.text, L.who, L.speaker);      // speaker: who is talking in the 3D scene (an Object3D, a Vector3 or a getter), for the label above his head
    if (!L.stop && !L.prompt && L.kind !== 'shout' && L.tier <= 2) V.spokenN++;
    if (L.kind === 'colour' && !L.stop && !L.free) V.lastColourCourse = V.course;
    if (L.kind === 'replay') V.replayDone = true;
    if (L.group === 'result') V.resultShown = true;
    if (L.tier >= 3 && L.kind !== 'replay') V.lastCat = L.cat;
    if (L.speak && L.kind !== 'shout') host.speak(L.text, L.tier, L.voice || L.who, L.speaker);      // voice: a key for the robot voice (pitch/rate), else the speaker's name
    if (L.onShown) L.onShown();
  }
  function endCur(why) {
    const c = V.cur; if (!c) return;
    c.entry.endAt = +V.t.toFixed(2); if (why === 'cut') c.entry.cut = true;
    host.hide(); V.cur = null; V.lastEnd = V.t; V.gap = why === 'cut' ? FADE : c.gapAfter;
  }
  function canShow(L, P) {
    if (P === 'charge') return false;
    if (P === 'strike') return L.tier === 1;
    if (P === 'replay') return L.kind === 'replay' || L.tier === 1;
    return true;
  }
  /** Move time on: end the line that has had its time, and promote the waiting one when its moment has come. */
  function pump() {
    const P = host.phase();
    if (V.cur && V.t >= V.cur.endAt) endCur('done');
    // the result card is up: a between-courses line (the tally, a colour line) that was still showing goes; only the card's own lines stay
    if (V.cur && P === 'end' && V.cur.phases && !V.cur.phases.includes('end') && V.cur.group !== 'result') endCur('cut');
    if (P === 'menu' && V.cur) endCur('cut');
    // the charge is silent: whatever was up goes (the marshal's signal may finish its own breath)
    if (V.cur && P === 'charge' && V.cur.key !== 'signal') endCur('cut');
    if (V.cur && P === 'strike' && V.cur.tier > 1 && V.cur.key !== 'signal') endCur('cut');
    const L = V.wait; if (!L || V.cur) return;
    if (L.course !== V.course) { V.wait = null; return void drop(L, 'course over'); }
    if (V.t > L.at + L.ttl) { V.wait = null; return void drop(L, 'stale'); }
    if (P === 'charge' && !L.anchor) { V.wait = null; return void drop(L, 'charge'); }
    if (L.phases && !L.phases.includes(P) && !(L.anchor && P === 'charge') && !(L.anchor && P === 'strike')) { V.wait = null; return void drop(L, `phase ${P} is not ${L.phases}`); }
    if (V.t < L.at || (!L.urgent && V.t < V.lastEnd + V.gap) || !canShow(L, P)) return;
    if (L.kind === 'colour' && !L.stop && !L.free && V.course - V.lastColourCourse < 2) { V.wait = null; return void drop(L, 'colour budget'); }
    if (L.tier >= 3 && L.kind !== 'replay' && L.cat && L.cat === V.lastCat && !L.stop) { V.wait = null; return void drop(L, 'same category twice'); }
    if (L.group === 'result' && V.resultShown) { V.wait = null; return void drop(L, 'one result per course'); }
    if (!L.stop && !L.prompt && L.tier <= 2 && L.kind !== 'shout' && V.spokenN >= COURSE_BUDGET) { V.wait = null; return void drop(L, 'three lines per course'); }
    V.wait = null; show(L);
  }
  // Lines meant for later are SUBMITTED later (on the voice clock), so they do not hold the one waiting place meanwhile.
  const timers = [];
  V.later = function later(sec, fn) { timers.push({ at: V.t + sec, course: V.course, fn }); };
  V.update = function update(dt) {
    V.t += dt; V.phase = host.phase();
    for (let i = 0; i < timers.length; i++) if (V.t >= timers[i].at) { const [tm] = timers.splice(i--, 1); if (tm.course === V.course) tm.fn(); }
    pump();
  };

  /** For the commentary booth (src/booth.js): seconds until the next line this channel has scheduled on a timer, Infinity when none;
   *  and seconds since the last line ended (0 while one is up). */
  V.quietFor = function quietFor(withTimers = true) {      // withTimers false: only the waiting line (a timer is not always a line: some only try)
    let at = Infinity; if (withTimers) for (const tm of timers) if (tm.course === V.course) at = Math.min(at, tm.at);
    const w = V.wait, P = host.phase();      // the waiting line counts only when it can show in this phase (one waiting for a phase that never comes would block the booth for good)
    if (w && (!w.phases || w.phases.includes(P)) && canShow(w, P)) at = Math.min(at, Math.max(w.at, V.lastEnd + V.gap));
    return at - V.t;
  };
  V.idleFor = () => (V.cur ? 0 : V.t - V.lastEnd);
  /** A new course: its own budget, its own impact clock. A waiting line from the old course is stale. */
  V.newCourse = function newCourse(n) {
    V.course = n; V.strikeT = null; V.spokenN = 0; V.replayDone = false; V.resultShown = false;
    if (V.wait && V.wait.course !== n) { drop(V.wait, 'course over'); V.wait = null; }
  };
  /** The first blow of the course lands. */
  V.mark = function mark(what) { if (what === 'strike' && V.strikeT === null) V.strikeT = V.t; };
  /** May a between-courses colour line still be shown this course? */
  V.colourOk = function colourOk() { return V.course - V.lastColourCourse >= 2; };
  /** The result card comes up: the between-courses line on screen (the tally, a colour line) and any waiting for the 'after' beat go; lines for the card stay. */
  V.cutBetween = function cutBetween() {
    const ok = (L) => L.group === 'result' || !L.phases || L.phases.includes('end');
    if (V.cur && !ok(V.cur)) endCur('cut');
    if (V.wait && !ok(V.wait)) { drop(V.wait, 'card up'); V.wait = null; }
  };
  /** Clear everything (match start / end). */
  V.reset = function reset() {
    timers.length = 0; if (V.wait) drop(V.wait, 'reset'); V.wait = null; if (V.cur) endCur('cut'); host.hide();
    V.course = 0; V.strikeT = null; V.spokenN = 0; V.replayDone = false; V.resultShown = false; V.lastColourCourse = -9; V.lastCat = null; V.lastEnd = -99; V.gap = 0;
  };
  /** Share of [t0, t1] (voice seconds) with no line showing, from the log: for testing the "55% silent" target. */
  V.silentFraction = function silentFraction(t0, t1) {
    let on = 0;
    for (const e of V.log) if (e.shown && e.shownAt != null) { const a = Math.max(t0, e.shownAt), b = Math.min(t1, e.endAt ?? V.t); if (b > a) on += b - a; }
    return 1 - on / Math.max(1e-6, t1 - t0);
  };
  return V;
}
