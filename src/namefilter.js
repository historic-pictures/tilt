// namefilter.js - a short block-list for the names strangers show up with (the public lobby, the friend's name on the card).
// Deliberately small: it only catches the obvious slurs and profanity (also written with look-alike digits, doubled letters or spaces
// between the letters). A name that trips it is shown as "A knight". It is a courtesy, not moderation.
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
// matched anywhere inside the squashed name (long, unambiguous words only)
const INSIDE = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'bastard', 'asshole', 'dickhead', 'cocksucker', 'wanker', 'twat', 'rapist', 'nazi', 'hitler', 'kike', 'spic', 'chink', 'tranny', 'paedo', 'pedo', 'molest'];
// matched only as a whole word of the name (short words that sit inside innocent ones)
const WORDS = ['fag', 'dyke', 'coon', 'cock', 'piss', 'cum', 'tit', 'tits', 'ass', 'arse', 'prick', 'paki', 'gook', 'rape', 'anal', 'sex', 'porn', 'kkk'];
const squash = (s) => String(s).toLowerCase().replace(/[0134578@$!]/g, (c) => LEET[c]).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
/** True when a displayed name should not be shown. */
export function badName(name) {
  const s = String(name || '').toLowerCase();
  const sq = squash(s), sq2 = s.replace(/[0134578@$!]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
  if (INSIDE.some((w) => sq2.includes(w) || sq.includes(w.replace(/(.)\1+/g, '$1')))) return true;
  const parts = s.replace(/[0134578@$!]/g, (c) => LEET[c]).split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(.)\1+/g, '$1'));
  return parts.some((w) => WORDS.some((b) => b.replace(/(.)\1+/g, '$1') === w));
}
export const FILTERED_NAME = 'A knight';
/** A name from somebody else, as it may be shown. (Run it through cleanName first.) */
export const filterName = (name) => (badName(name) ? FILTERED_NAME : name);
