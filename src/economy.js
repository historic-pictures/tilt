// The reckoning after a match: what came into the purse, what went out, and what the day added to your name.
// Pure functions of plain data (see ECON, RENOWN, RANKS, SKILLS in data.js), so the same rules port to another engine.
import { ECON, RENOWN, SKILLS, RETINUE, menFx, wageOf, purse, worthOf, harnessWorth, entryFee, rankOf } from './data.js';

/**
 * m: { vIdx, result, circuit, practice, lance, broken (your lances broken), helms (your helm strikes), body 0..1, horseHp 0..1,
 *      courses (in the match), court -1..1 (the gallery's favour), horse, armour, helm, oppHorse, oppArmour, skills, retinue }
 * Returns { lines: [[label, marks]], total, renown }.
 */
export function reckon(m) {
  const k = Math.min(1, 4 / (m.courses || 4));   // per-lance costs and renown scale down in long matches so the economy does not depend on their length
  const lines = [], add = (label, n) => { n = Math.round(n); if (n) lines.push([label, n]); };
  if (m.practice) return { lines, total: 0, renown: 0 };
  const sk = m.skills || {}, won = m.result.startsWith('win'), men = m.retinue || {}, fx = (id) => menFx(id, men[id]);
  if (m.bouts) add(`Purse for ${m.bouts} bout${m.bouts > 1 ? 's' : ''} won at the bridge`, m.bouts * purse(m.vIdx, 'win', m.circuit) * (won ? 1 : 0.5));      // Keep the Bridge: a purse for every bout you won (half if the bridge was lost)
  else if (!m.void) add('Prize purse', purse(m.vIdx, m.result, m.circuit));      // a void joust (Sudden Death with no lance broken) pays no purse
  if (m.court > 0.2) add('Gift of the gallery', ECON.giftPerFavour * m.court * (sk.largesse ? SKILLS.largesse.gift : 1));
  if (m.circuit) {
    if (m.result === 'win-unhorse') add('Ransom of his horse and harness', ECON.ransom * worthOf(m.oppHorse, m.oppArmour));
    if (m.result === 'loss-unhorse') add('Ransom of your horse and harness', -ECON.ransom * worthOf(m.horse, m.armour, m.helm));
    add('Entry to the lists', -entryFee(m.vIdx));
    add('Squires, grooms and lodging', -ECON.retinue);
    add('Stabling and fodder', -(ECON.keep[m.horse] ?? 2));
    add('Wages of your retinue', -Object.keys(men).reduce((a, id) => a + (RETINUE[id] ? wageOf(id, men[id]) : 0), 0));
  }
  if (m.broken) add(`Lances broken (${m.broken})`, -m.broken * (ECON.lance[m.lance] ?? 3) * k);
  add(men.armourer ? 'Iron and rivets for your armourer' : 'The armourer', -(1 - m.body) * ECON.repair * harnessWorth(m.armour, m.helm) * (men.armourer ? fx('armourer').repair : 1));
  add('The horse-leech', -(1 - m.horseHp) * ECON.leech * (men.farrier ? fx('farrier').leech : 1));
  const total = lines.reduce((a, l) => a + l[1], 0);
  let renown = (won ? RENOWN.win + RENOWN.perVenue * (m.circuit ? m.vIdx : 0) : m.result === 'draw' ? RENOWN.draw : RENOWN.loss)
    + k * (RENOWN.lance * (m.broken || 0) + RENOWN.helm * (m.helms || 0)) + (m.result === 'win-unhorse' ? RENOWN.unhorse : 0) + RENOWN.favour * Math.max(0, m.court || 0);
  renown *= (m.circuit ? 1 : RENOWN.exhibition) * (sk.largesse ? SKILLS.largesse.renown : 1) * (men.pursuivant ? fx('pursuivant').renown : 1);
  return { lines, total, renown: Math.round(renown) };
}

/** Apply a reckoning to the profile. Returns { rankUp } so the game can announce it. */
export function settle(profile, r) {
  const before = rankOf(profile.renown);
  profile.gold = Math.max(-ECON.debtCap, (profile.gold || 0) + r.total);
  profile.renown = (profile.renown || 0) + r.renown;
  return { rankUp: rankOf(profile.renown) > before };
}
