// The career: a season of tournaments, one event at each venue in order. Pure data in, plain data out (no DOM), so main.js and menus.js share it.
// The event itself (days, the herald's roll, pairing, prizes, the wager) lives in tournament.js; this file keeps the season, the honours and the hooks main.js calls.
// profile.season = { no, v, t, log, done, migrated }; profile.honours = [{ venue, name, year, season }]; profile.lostTo = { knightId: times }.
import { VENUES } from './data.js';
import * as T from './tournament.js';

export const SIZES = T.SIZES;
export const everyKnight = T.everyKnight;
export const knightById = T.knightById;
export const strength = T.strength;

/** "Final", "Semi-final", "Quarter-final", then "First round" (kept for older log entries). */
export function roundName(rounds, r) {
  const left = rounds - 1 - r;
  return left === 0 ? 'Final' : left === 1 ? 'Semi-final' : left === 2 ? 'Quarter-final' : `Round ${r + 1}`;
}

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
  if (t && !T.validEvent(t, s.v)) s.t = null;      // an old knockout bracket, or a roster that changed under a saved event: a new event is drawn
  return s;
}

export function newTournament(p) { const s = ensureCareer(p); s.t = T.newEvent(p, s.v); return s.t; }
export function ensureTournament(p) { const s = ensureCareer(p); if (!s.done && !s.t) newTournament(p); return s.t; }

export const myMatch = T.myMatch;
export const myOpponent = T.myOpponent;
/** The context of the match about to be ridden, for the commentary and the card. */
export const describe = (p) => T.describe(p);

/** A purse factor for the round (later rounds pay more) and the extra for the final. Used by the reckoning. */
export const purseFactor = (rounds, r) => (0.5 + 0.5 * (rounds > 1 ? r / (rounds - 1) : 1)) * (r === rounds - 1 ? 2 : 1);

/** Your match is over. Scores the bout on the roll and returns { won, out, champion, next, head, note } for the match card. */
export function recordMatch(p, won, score, oppId) { ensureCareer(p); return T.recordMatch(p, won, score, oppId); }

/** Ride on from a finished tournament: the next venue's tournament, or the end of the season. */
export function rideOn(p) {
  const s = ensureCareer(p);
  if (s.v + 1 >= VENUES.length) { s.done = true; s.t = null; return; }
  s.v++; s.t = null; newTournament(p);
}
export function newSeasonFor(p) { const s = ensureCareer(p); p.season = newSeason(s.no + 1); newTournament(p); return p.season; }

export const honoursLine = (p) => { const h = p.honours || []; return h.length ? h.map(x => x.name).join(' · ') : ''; };
export const seasonHonours = (p) => (p.honours || []).filter(h => h.season === (p.season && p.season.no));
