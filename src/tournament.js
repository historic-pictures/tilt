// A tournament event: one place, several game-days, one herald's roll. Pure data in, plain data out (no DOM); career.js delegates to it, tourney_screen.js draws it.
// Design: docs/tournament-design.md (history: docs/tournament-history.md). Challenge days (no elimination, scored on the roll), then the Prize Joust between the two best.
// The event t lives in profile.season.t = { fmt:'roll', v, size, rc (challenge days), rounds (rc + 1), cur, entrants, rnds: [{ pairs: [{ a, b, w, sc }], shown, mine }],
//   card, phase: 'arrive'|'roll'|'over', joined, stake, odds, you: 'in'|'out'|'left', leaveAsk, out, champion, winner, done, prizes, paid, reached }.
// Wagers are in marks only (the game's coins).
import { KNIGHTS, VENUES, purse, rankOf } from './data.js';
import { FIELD } from './career_story.js';

export const SIZES = [8, 8, 8, 16, 16];      // entrants at each venue
export const STAKES = [0, 10, 25, 50, 100];  // marks you may wager on yourself
export const WHEN = { smithfield: 'Midsummer week', inglevert: 'Lent, thirty days', leon: 'Saint James\'s tide', bruges: 'Wedding week, July', nuremberg: 'Shrovetide' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export const everyKnight = () => KNIGHTS.concat(FIELD);
export const knightById = (id) => everyKnight().find(k => k.id === id);
export const strength = (k) => k.skill * 0.6 + k.seat * 0.25 + k.drive * 0.15;
/** What the crowd reckons you are worth: grows with rank. Used only for the odds. */
export const youStrength = (p) => 0.34 + 0.04 * rankOf((p && p.renown) || 0);
let youStr = 0.4, simYou = false;
const strOf = (id) => id === 'you' ? youStr : strength(knightById(id));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hasYou = (m) => m.a === 'you' || m.b === 'you';

export const roundName = (t, r) => r >= t.rc ? 'The Prize Joust' : `Round ${ROMAN[r + 1]}`;
export const roundKind = (t, r) => r >= t.rc ? 'final' : 'early';
export const dayLabel = (t, r) => `Day ${r + 1} of ${t.rounds}`;
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function simPair(a, b) {
  const d = strOf(a) - strOf(b), pr = 1 / (1 + Math.exp(-d * 7)), win = Math.random() < pr, hi = 3 + ((Math.random() * 3) | 0), lo = (Math.random() * Math.max(1, hi - 1)) | 0;
  return { w: win ? a : b, sc: win ? [hi, lo] : [lo, hi] };
}
const pairOf = (a, b) => { const m = { a, b, w: null, sc: null }; if (simYou || (a !== 'you' && b !== 'you')) Object.assign(m, simPair(a, b)); return m; };
const roundOf = (pairs) => ({ pairs, shown: false, mine: !pairs.some(hasYou) });
const met = (rnds, a, b) => rnds.some(r => r.pairs.some(m => (m.a === a && m.b === b) || (m.a === b && m.b === a)));

/** The roll: everyone, ranked by lance credits (as Tiptoft's prize goes by feats, not by who beat whom), then bouts won, then margin. seen: only count what the player has been told. */
export function standings(t, seen) {
  const row = {}; for (const id of t.entrants) row[id] = { id, w: 0, l: 0, pts: 0, ag: 0, best: 0, bouts: 0 };
  t.rnds.forEach((r) => r.pairs.forEach((m) => {
    if (m.w == null || (seen && !r.shown && !hasYou(m))) return;
    const A = row[m.a], B = row[m.b], wa = m.w === m.a;
    A.bouts++; B.bouts++; A.pts += m.sc[0]; A.ag += m.sc[1]; B.pts += m.sc[1]; B.ag += m.sc[0];
    (wa ? A : B).w++; (wa ? B : A).l++; const mg = Math.abs(m.sc[0] - m.sc[1]); (wa ? A : B).best = Math.max((wa ? A : B).best, mg);
  }));
  return Object.values(row).sort((x, y) => y.pts - x.pts || y.w - x.w || (y.pts - y.ag) - (x.pts - x.ag) || strOf(y.id) - strOf(x.id));
}

/** Draw the next day: neighbours on the roll meet (no rematch if it can be helped); the last day is the two best. */
function nextRound(t) {
  const rows = standings(t, false);
  let pairs;
  if (t.cur + 1 >= t.rc) pairs = [pairOf(rows[0].id, rows[1].id)];
  else {
    const left = rows.map(r => r.id); pairs = [];
    while (left.length > 1) { const a = left.shift(); let j = left.findIndex(b => !met(t.rnds, a, b)); if (j < 0) j = 0; pairs.push(pairOf(a, left.splice(j, 1)[0])); }
  }
  if (t.you === 'left') pairs.forEach((m) => { if (hasYou(m) && m.w == null) { youStr = 0.1; Object.assign(m, simPair(m.a, m.b)); } });      // a rider who withdrew loses his remaining pairs
  t.rnds.push(roundOf(pairs)); t.cur++;
}
const randomRound = (ids) => { const s = shuffle(ids), out = []; for (let i = 0; i + 1 < s.length; i += 2) out.push(pairOf(s[i], s[i + 1])); return roundOf(out); };

/** A quick simulation of a whole event with you in it; the share of wins gives the crowd's odds. */
function oddsFor(entrants, rc, p) {
  youStr = youStrength(p); simYou = true; let wins = 0; const N = 150;
  for (let n = 0; n < N; n++) {
    const t = { entrants, rc, cur: 0, you: 'in', rnds: [randomRound(entrants)] };
    while (t.cur < t.rc) nextRound(t);
    if (t.rnds[t.cur].pairs[0].w === 'you') wins++;
  }
  simYou = false;
  const pr = Math.max(0.02, wins / N);
  return Math.max(2, Math.min(12, Math.round((0.85 / pr) * 2) / 2));
}

/** A new event at venue v: the host, others weighted toward the strength the venue asks for, then you. */
export function newEvent(p, v) {
  const size = SIZES[v] || 8, host = VENUES[v].host, pool = shuffle(everyKnight().filter(k => k.id !== host)), center = 0.40 + 0.1 * v, chosen = [host];
  const w = (k) => Math.exp(-Math.pow((strength(k) - center) / 0.2, 2)) + 0.03;
  while (chosen.length < size - 1 && pool.length) {
    const tot = pool.reduce((a, k) => a + w(k), 0); let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= w(pool[i]); if (r <= 0) break; }
    chosen.push(pool.splice(i, 1)[0].id);
  }
  const entrants = shuffle(chosen.concat('you')), rc = 3;
  const t = { fmt: 'roll', v, size, rc, rounds: rc + 1, cur: 0, entrants, rnds: [randomRound(entrants)], card: 0, phase: 'arrive', joined: false, stake: 0, odds: 3, you: 'in', leaveAsk: false,
    out: false, champion: false, winner: null, done: false, prizes: null, paid: null, reached: 0 };
  t.odds = oddsFor(entrants, rc, p);
  return t;
}
export const validEvent = (t, v) => !!t && t.fmt === 'roll' && t.v === v && Array.isArray(t.rnds) && t.rnds.length && Array.isArray(t.entrants) && t.entrants.every(id => id === 'you' || knightById(id));

export const myMatch = (t) => t.you === 'in' && !t.done && t.rnds[t.cur] ? t.rnds[t.cur].pairs.find(hasYou) : null;
export const myOpponent = (t) => { const m = myMatch(t); return m && m.w == null ? (m.a === 'you' ? m.b : m.a) : null; };

/** The context of the bout about to be ridden. */
export function describe(p) {
  const s = p.season, t = s && s.t; if (!t || t.done || t.fmt !== 'roll' || !t.joined) return null;
  const opp = myOpponent(t); if (!opp) return null;
  return { v: t.v, round: t.cur, rounds: t.rounds, size: t.size, name: roundName(t, t.cur), kind: roundKind(t, t.cur), opp,
    first: s.no === 1 && t.v === 0 && !(p.honours || []).length && !s.log.length, rematch: !!(p.lostTo && p.lostTo[opp]), last: t.v === VENUES.length - 1 };
}

/** Join: pay the stake (marks you hold; never more) and the roll opens. */
export function join(p, t, stake) {
  stake = STAKES.includes(stake) ? Math.min(stake, Math.max(0, Math.floor(p.gold || 0))) : 0;
  t.stake = stake; if (stake) p.gold = (p.gold || 0) - stake;
  t.joined = true; t.phase = 'roll';
}

/** Your bout is over. Returns { won, out, champion, next, head, note } for the match card. */
export function recordMatch(p, won, score, oppId) {
  const s = p.season, t = s && s.t; if (!t || t.done || t.fmt !== 'roll') return null;
  const m = myMatch(t); if (!m || m.w != null) return null;
  const rd = t.rnds[t.cur], from = roundName(t, t.cur);
  m.w = won ? 'you' : oppId; m.sc = score ? (m.a === 'you' ? [score[0], score[1]] : [score[1], score[0]]) : (won === (m.a === 'you') ? [3, 1] : [1, 3]); rd.mine = true;
  if (!won) { p.lostTo = p.lostTo || {}; p.lostTo[oppId] = (p.lostTo[oppId] || 0) + 1; }
  const res = { won, out: false, champion: false, from, next: null, to: null, head: '', note: '' }, mine = m.a === 'you' ? m.sc[0] : m.sc[1];
  if (t.cur >= t.rc) {
    rd.shown = true; finish(p, t, m.w); res.champion = won; res.out = !won;
    res.head = won ? 'YOU WIN THE TOURNAMENT' : 'BEATEN IN THE PRIZE JOUST';
    res.note = won ? `Champion of ${VENUES[t.v].name}. The honour is yours.` : `The Prize goes to ${(knightById(t.winner) || { short: 'another' }).short}. You finish second on the roll.`;
  } else if (t.cur === t.rc - 1) {
    const top = standings(t, false).slice(0, 2).map(r => r.id);
    if (top.includes('you')) { res.next = roundName(t, t.cur + 1); res.head = 'THROUGH TO THE PRIZE JOUST'; res.note = `${won ? 'Won' : 'Lost'} the bout, ${mine} lance credits. You stand among the best two on the roll.`; }
    else { t.you = 'out'; res.out = true; res.head = 'OUT OF THE PRIZE JOUST'; res.note = `${won ? 'Won' : 'Lost'} the bout, but the best two on the roll ride the Prize Joust, and you are not among them.`; }
  } else { res.next = roundName(t, t.cur + 1); res.head = `${from.toUpperCase()} ${won ? 'WON' : 'LOST'}`; res.note = `${mine} lance credit${mine === 1 ? '' : 's'} on the roll. Nobody is struck off: the next day is drawn from the roll.`; }
  res.to = res.next; t.reached = t.cur;
  return res;
}

/** The herald has read (or you have skipped past) a day's other pairs. */
export function reveal(p, t, r) {
  const rd = t.rnds[r]; if (!rd) return; rd.shown = true;
  if (r >= t.rc && !t.done && (t.you !== 'in' || rd.mine)) finish(p, t, rd.pairs[0].w);
}
/** Draw the next day, once this one is told. */
export function nextDay(t) { const rd = t.rnds[t.cur]; if (!t.done && rd && rd.mine && rd.shown && t.cur < t.rc) nextRound(t); }
export const canAdvance = (t) => { const rd = t.rnds[t.cur]; return !t.done && !!rd && rd.mine && rd.shown && t.cur < t.rc; };

/** Withdraw: the stake is forfeit, the rest is played out without you. */
export function withdraw(p, t) {
  if (t.done) return;
  const m = myMatch(t); if (m && m.w == null) { const o = m.a === 'you' ? m.b : m.a; m.w = o; m.sc = m.a === 'you' ? [0, 3] : [3, 0]; }
  t.you = 'left'; t.leaveAsk = false;
  for (;;) { const rd = t.rnds[t.cur]; rd.mine = true; rd.shown = true; if (t.cur >= t.rc) break; nextRound(t); }
  finish(p, t, t.rnds[t.cur].pairs[0].w);
}

/** The prizes are read: the Prize (final), Best Lance (most credits), the Ladies' Prize (most gallant bout, a different knight); the wager is settled. */
function finish(p, t, winner) {
  const V = VENUES[t.v], base = purse(t.v, 'win', true), rows = standings(t, false), eligible = (r) => !(t.you === 'left' && r.id === 'you');
  t.winner = winner; t.phase = 'over'; t.done = true; t.champion = winner === 'you'; t.leaveAsk = false;
  const lance = rows.filter(eligible).sort((x, y) => y.pts - x.pts || y.w - x.w)[0], ladies = rows.filter(r => eligible(r) && r.id !== lance.id).sort((x, y) => y.best - x.best || y.w - x.w)[0];
  const pr = { winner, lance: lance.id, lanceMarks: Math.round(base * 0.4), ladies: ladies ? ladies.id : null, ladiesMarks: Math.round(base * 0.3) };
  const paid = { lance: 0, ladies: 0, bet: 0, stake: t.stake };
  if (pr.lance === 'you') paid.lance = pr.lanceMarks;
  if (pr.ladies === 'you') paid.ladies = pr.ladiesMarks;
  if (t.champion && t.stake) paid.bet = Math.round(t.stake * t.odds);
  p.gold = (p.gold || 0) + paid.lance + paid.ladies + paid.bet;
  t.prizes = pr; t.paid = paid;
  const pos = rows.findIndex(r => r.id === 'you') + 1;
  const s = p.season;
  if (t.champion && !p.honours.some(h => h.venue === V.id && h.season === s.no)) p.honours.push({ venue: V.id, name: `Champion of ${V.name}`, year: V.year, season: s.no });
  const resText = t.champion ? 'Champion' : t.you === 'left' ? 'Withdrew' : t.you === 'in' ? 'Beaten in the Prize Joust' : `${ordinal(pos)} on the roll`;
  s.log.push({ v: t.v, reached: t.cur, rounds: t.rounds, champion: t.champion, winner, res: resText, lance: pr.lance === 'you', ladies: pr.ladies === 'you' });
}

/** A herald's line for a finished pair. */
export function heraldLine(m, nm) {
  const w = nm(m.w), l = nm(m.w === m.a ? m.b : m.a), hi = Math.max(m.sc[0], m.sc[1]), lo = Math.min(m.sc[0], m.sc[1]), d = hi - lo;
  return `${w} ${d >= 4 ? 'overthrows' : d >= 3 ? 'masters' : d <= 1 ? 'edges out' : 'bests'} ${l}, ${hi} credits to ${lo}.`;
}
export const when = (v) => WHEN[VENUES[v].id] || '';
