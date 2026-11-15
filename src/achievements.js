// Feats: pure honours with no power in the lists (see ACHIEVEMENTS in data.js). Plain functions of the profile, so the same rules port to another engine.
// profile.achievements = { id: 'YYYY-MM-DD' }; profile.stats = the running counts the rules read. Every unlock pays a small renown bonus.
import { ACHIEVEMENTS, ACH_RENOWN, HORSES, CAPARISONS, RETINUE, RETINUE_UP, rankOf } from './data.js';

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
const LISTS = ['beaten', 'venues', 'modes', 'ladySeen'];

/** Make sure an older save has the feat records (call when the profile is loaded). */
export function ensureFeats(p) {
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  if (!p.stats || typeof p.stats !== 'object') p.stats = {};
  for (const k of LISTS) if (!Array.isArray(p.stats[k])) p.stats[k] = [];
  for (const k of ['broken', 'unhorsed', 'ladyKinds']) if (!(p.stats[k] >= 0)) p.stats[k] = 0;
}

const push = (list, id) => { if (id && !list.includes(id)) list.push(id); };
const today = () => new Date().toISOString().slice(0, 10);

function met(p, r, ev) {
  if (r.ev) return ev.includes(r.ev);
  if (r.stat) return (p.stats[r.stat[0]] || 0) >= r.stat[1];
  if (r.in) return (p.stats[r.in[0]] || []).includes(r.in[1]);
  if (r.rank !== undefined) return rankOf(p.renown) >= r.rank;
  if (r.men === 'full') return Object.keys(RETINUE).every(id => p.retinue && p.retinue[id]);
  if (r.men === 'level3') return Object.values(p.retinue || {}).some(m => m && typeof m === 'object' && m.level >= RETINUE_UP.max);
  if (r.stable === 'horses') return Object.keys(HORSES).every(id => (p.owned.horses || []).includes(id));
  if (r.stable === 'caparisons') return Object.keys(CAPARISONS).every(id => (p.owned.caparisons || []).includes(id));
  return false;
}

/** Test every feat not yet earned against the profile and the events that have just happened. Returns the ids newly earned (renown is paid here).
 *  A renown bonus can itself reach a new rank, so the state rules are run again until nothing more unlocks. */
export function checkFeats(p, ev = []) {
  ensureFeats(p);
  const got = [];
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (p.achievements[a.id] || !met(p, a.rule, pass === 0 ? ev : [])) continue;
      p.achievements[a.id] = today(); p.renown = (p.renown || 0) + (a.renown ?? ACH_RENOWN); got.push(a.id); any = true;
    }
    if (!any) break;
  }
  return got;
}

/** A real course (never practice) is over. c = { broke, helm (broke on the helm), unhorse (you unhorsed him), perfect }. */
export function courseFeats(p, c) {
  ensureFeats(p);
  if (c.broke) p.stats.broken++;
  if (c.unhorse) p.stats.unhorsed++;
  return checkFeats(p, [c.helm ? 'helmBreak' : '', c.perfect ? 'perfect' : '']);
}

/** A real match (never practice) is over. m = { won, venue, mode, opp, cleanSheet, comeback, ironSeat, sightWin }. */
export function matchFeats(p, m) {
  ensureFeats(p);
  const ev = [];
  if (m.won) {
    push(p.stats.venues, m.venue); push(p.stats.modes, m.mode); push(p.stats.beaten, m.opp);
    if (m.cleanSheet) ev.push('cleanSheet'); if (m.comeback) ev.push('comeback'); if (m.ironSeat) ev.push('ironSeat'); if (m.sightWin) ev.push('sightWin');
  }
  return checkFeats(p, ev);
}

/** The circuit ended with you at the head of the table. */
export const circuitFeat = (p) => checkFeats(p, ['circuitWon']);
/** You saluted a fallen foe. */
export const courtesyFeat = (p) => checkFeats(p, ['courtesy']);
/** The gallery answered a glance: kind = smile | laugh | glare. Returns the ids newly earned (the first glance, then having seen all three). */
export function ladyFeat(p, kind) {
  ensureFeats(p); push(p.stats.ladySeen, kind); p.stats.ladyKinds = p.stats.ladySeen.length;
  return checkFeats(p, ['ladyEye']);
}

/** For the screens: how many feats are earned. */
export const featCount = (p) => ({ have: ACHIEVEMENTS.filter(a => (p.achievements || {})[a.id]).length, total: ACHIEVEMENTS.length });

/** Master Hugh's line when you reach rank r (RANKS in data.js). He is dry, exact and proud of his craft. */
const RANK_LINES = [
  '',
  'A bachelor knight. Be so good as to have your arms entered correctly this time.',
  'Knight of the Lists. I have cried worse names, and I have cried them louder.',
  'A banneret now. You may carry a square banner. Do carry it straight.',
  'Champion. Forty years I have waited to say that of someone worth the breath.',
  'A paragon. I shall need a larger word for the next one.',
  'The flower of chivalry, no less. The heralds will quarrel for years over how to blazon you.',
];
export const rankLine = (r) => RANK_LINES[Math.min(r, RANK_LINES.length - 1)] || RANK_LINES[1];
