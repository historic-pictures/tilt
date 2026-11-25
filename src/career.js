// The career: a season of knockout tournaments, one at each venue in order. Pure data in, plain data out (no DOM), so main.js and menus.js share it.
// profile.season = { no, v, t, log, done, migrated }; profile.honours = [{ venue, name, year, season }]; profile.lostTo = { knightId: times }.
// A tournament t = { v, size, rounds, cur, entrants, rnds: [[{ a, b, w, sc }]], card, phase, out, champion, winner, done }.
import { KNIGHTS, VENUES } from './data.js';
import { FIELD } from './career_story.js';

export const SIZES = [8, 8, 8, 16, 16];      // entrants at each venue: 8 is three rounds, 16 is four
export const everyKnight = () => KNIGHTS.concat(FIELD);
export const knightById = (id) => everyKnight().find(k => k.id === id);
export const strength = (k) => k.skill * 0.6 + k.seat * 0.25 + k.drive * 0.15;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** "Final", "Semi-final", "Quarter-final", then "First round" (counting from the start for the earlier ones). */
export function roundName(rounds, r) {
  const left = rounds - 1 - r;
  return left === 0 ? 'Final' : left === 1 ? 'Semi-final' : left === 2 ? 'Quarter-final' : `Round ${r + 1}`;
}
export const roundKind = (rounds, r) => { const left = rounds - 1 - r; return left === 0 ? 'final' : left === 1 ? 'semi' : left === 2 ? 'quarter' : 'early'; };

export function newSeason(no = 1) { return { no, v: 0, t: null, log: [], done: false }; }

/** Make sure the profile carries a sane career. Old saves (the league table) get a fresh season; the old table is kept but no longer used. */
export function ensureCareer(p) {
  if (!p.honours || !Array.isArray(p.honours)) p.honours = [];
  if (!p.lostTo || typeof p.lostTo !== 'object') p.lostTo = {};
  let s = p.season;
  if (!s || typeof s !== 'object') {
    s = p.season = newSeason(1);
    if (p.table && p.table.round > 0) s.migrated = true;      // an old league in progress: noted once on the circuit screen
  }
  s.v = Math.max(0, Math.min(VENUES.length - 1, s.v | 0)); if (!Array.isArray(s.log)) s.log = [];
  const t = s.t;
  if (t && (!Array.isArray(t.rnds) || !Array.isArray(t.entrants) || t.entrants.some(id => id !== 'you' && !knightById(id)) || t.v !== s.v)) s.t = null;      // a roster that changed under a saved bracket
  return s;
}

function simMatch(a, b) {
  const ka = knightById(a), kb = knightById(b), d = strength(ka) - strength(kb), p = 1 / (1 + Math.exp(-d * 7));
  const win = Math.random() < p, hi = 3 + ((Math.random() * 3) | 0), lo = (Math.random() * Math.max(1, hi - 1)) | 0;
  return { w: win ? a : b, sc: win ? [hi, lo] : [lo, hi] };
}
/** Pair the ids in order into a round; every match without you is played at once. */
function makeRound(ids) {
  const out = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    const m = { a: ids[i], b: ids[i + 1], w: null, sc: null };
    if (m.a !== 'you' && m.b !== 'you') Object.assign(m, simMatch(m.a, m.b));
    out.push(m);
  }
  return out;
}

/** The field for a venue: the host, then others weighted toward the strength the venue asks for, then you; the host sits in the other half of the draw. */
export function newTournament(p) {
  const s = ensureCareer(p), v = s.v, size = SIZES[v] || 8, host = VENUES[v].host;
  const pool = shuffle(everyKnight().filter(k => k.id !== host)), center = 0.40 + 0.1 * v, chosen = [host];
  const w = (k) => Math.exp(-Math.pow((strength(k) - center) / 0.2, 2)) + 0.03;
  while (chosen.length < size - 1 && pool.length) {
    const tot = pool.reduce((a, k) => a + w(k), 0); let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= w(pool[i]); if (r <= 0) break; }
    chosen.push(pool.splice(i, 1)[0].id);
  }
  const rest = shuffle(chosen.slice(1)), slots = new Array(size).fill(null), half = size / 2;
  const mine = (Math.random() * size) | 0; slots[mine] = 'you';
  const hs = (mine < half ? half : 0) + ((Math.random() * half) | 0); slots[hs] = host;
  for (let i = 0; i < size; i++) if (!slots[i]) slots[i] = rest.pop();
  const t = { v, size, rounds: Math.log2(size), cur: 0, entrants: slots.slice(), rnds: [makeRound(slots)], card: 0, phase: 'arrive', out: false, champion: false, winner: null, done: false };
  s.t = t; return t;
}
export function ensureTournament(p) { const s = ensureCareer(p); if (!s.done && !s.t) newTournament(p); return s.t; }

export const myMatch = (t) => t.rnds[t.cur].find(m => m.a === 'you' || m.b === 'you');
export const myOpponent = (t) => { const m = t.done ? null : myMatch(t); return m ? (m.a === 'you' ? m.b : m.a) : null; };

/** The context of the match about to be ridden, for the commentary and the card. */
export function describe(p) {
  const s = p.season, t = s && s.t; if (!t || t.done) return null;
  const opp = myOpponent(t);
  return { v: t.v, round: t.cur, rounds: t.rounds, size: t.size, name: roundName(t.rounds, t.cur), kind: roundKind(t.rounds, t.cur), opp,
    first: s.no === 1 && t.v === 0 && !(p.honours || []).length && !s.log.length, rematch: !!(p.lostTo && p.lostTo[opp]), last: t.v === VENUES.length - 1 };
}

/** A purse factor for the round (later rounds pay more) and the extra for the final. Used by the reckoning. */
export const purseFactor = (rounds, r) => (0.5 + 0.5 * (rounds > 1 ? r / (rounds - 1) : 1)) * (r === rounds - 1 ? 2 : 1);

/**
 * Your match is over. won: true/false (a draw is settled before this is called). Plays out the other matches, moves the draw on, and ends the tournament on a loss or a final win.
 * Returns { won, out, champion, from, to, next }.
 */
export function recordMatch(p, won, score, oppId) {
  const s = ensureCareer(p), t = s.t; if (!t || t.done) return null;
  const m = myMatch(t), from = roundName(t.rounds, t.cur);
  m.w = won ? 'you' : oppId; m.sc = score ? (m.a === 'you' ? [score[0], score[1]] : [score[1], score[0]]) : null;
  const res = { won, out: false, champion: false, from, next: null, to: null };
  if (!won) {
    p.lostTo[oppId] = (p.lostTo[oppId] || 0) + 1;
    t.out = true; t.done = true; t.phase = 'over'; t.reached = t.cur; res.out = true;
    let r = t.rnds[t.cur];      // the rest of the draw is played out without you
    while (r.length > 1) { r = makeRound(r.map(x => x.w)); t.rnds.push(r); }
    t.winner = r[0].w || (Object.assign(r[0], simMatch(r[0].a, r[0].b)), r[0].w);
  } else if (t.cur >= t.rounds - 1) {
    t.champion = true; t.done = true; t.phase = 'over'; t.winner = 'you'; t.reached = t.cur; res.champion = true;
    if (!p.honours.some(h => h.venue === VENUES[t.v].id && h.season === s.no)) p.honours.push({ venue: VENUES[t.v].id, name: `Champion of ${VENUES[t.v].name}`, year: VENUES[t.v].year, season: s.no });
  } else {
    t.cur++; t.rnds.push(makeRound(t.rnds[t.cur - 1].map(x => x.w))); res.next = roundName(t.rounds, t.cur);
  }
  if (t.done) s.log.push({ v: t.v, reached: t.reached, rounds: t.rounds, champion: t.champion, winner: t.winner });
  res.to = res.next;
  return res;
}

/** Ride on from a finished tournament: the next venue's tournament, or the end of the season. */
export function rideOn(p) {
  const s = ensureCareer(p);
  if (s.v + 1 >= VENUES.length) { s.done = true; s.t = null; return; }
  s.v++; s.t = null; newTournament(p);
}
export function newSeasonFor(p) { const s = ensureCareer(p); p.season = newSeason(s.no + 1); newTournament(p); return p.season; }

export const honoursLine = (p) => { const h = p.honours || []; return h.length ? h.map(x => x.name).join(' · ') : ''; };
export const seasonHonours = (p) => (p.honours || []).filter(h => h.season === (p.season && p.season.no));
