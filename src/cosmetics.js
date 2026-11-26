// cosmetics.js - what each paid item opens, as plain data (no DOM, no three.js): the game (store.js, menus.js, util.js) and the Worker (server/tilt-ranks/pay.js,
// accounts.js cleanProfile) read the same file, so the server can refuse a pack's heraldry on a cloud save that never bought it.
// Prices are NOT here: the server's product table (server/tilt-ranks/pay.js) and the Stripe Prices are the only prices.
// Nothing in here changes how a joust is ridden or scored: looks only. Ranked and online play are the same for everybody.

/** The free game: the first event of the career calendar and the first lists are open to all; the Knight's Charter opens the rest. */
export const FREE = { events: 1, venues: 1 };

/** The cosmetic packs. Each id is a server product id (sku). */
export const PACKS = {
  herald: {
    patterns: [],      // (fields, divisions and ordinaries are all free since the heraldry editor: the Herald's Book is the fancy charges, the furs and three stain tinctures)
    charges: null,     // = every charge that is not in FREE_CHARGES or the patron's crown (see skuOfCharge)
    tinctures: [['Murrey', '#6e2639'], ['Sanguine', '#8a2b1c'], ['Carnation', '#d9a27e']],
    furs: ['#ece8dd', '#1f4691'],      // ermine and vair (heraldry.js ERMINE / VAIR; they ride in the colour slots)
  },
  rolls: {
    // real arms, drawn with the game's own ordinaries and charges (simplified where the original has beasts or many pieces; the note says so)
    arms: [
      { name: 'Beauchamp', note: 'Gules, a fess or (the six cross-crosslets left off)', arms: { c1: '#a81e1e', c2: '#e0b83c', c3: '#e0b83c', pattern: 'fess', charge: 'none' } },
      { name: 'Courtenay', note: 'Or, a torteau (the arms bear three)', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#a81e1e', pattern: 'plain', charge: 'roundel' } },
      { name: 'de Vere', note: 'Quarterly gules and or, a mullet argent', arms: { c1: '#a81e1e', c2: '#e0b83c', c3: '#ece8dc', pattern: 'quarterly', charge: 'star' } },
      { name: 'Clare', note: 'Or, a chevron gules (the arms bear three chevronels)', arms: { c1: '#e0b83c', c2: '#a81e1e', c3: '#a81e1e', pattern: 'chevron', charge: 'none' } },
      { name: 'Bourbon', note: 'Azure, a fleur-de-lis or, a bend gules', arms: { c1: '#1f4690', c2: '#a81e1e', c3: '#e0b83c', pattern: 'bend', charge: 'fleur' } },
      { name: 'Montferrat', note: 'Argent, a chief gules', arms: { c1: '#ece8dc', c2: '#a81e1e', c3: '#a81e1e', pattern: 'chief', charge: 'none' } },
      { name: 'Lorraine', note: 'Or, a bend gules (the three alerions left off)', arms: { c1: '#e0b83c', c2: '#a81e1e', c3: '#a81e1e', pattern: 'bend', charge: 'none' } },
      { name: 'Jerusalem', note: 'Argent, a cross or (metal on metal, the famous exception)', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#e0b83c', pattern: 'plain', charge: 'cross' } },
      { name: 'Bohun', note: 'Azure, a bend argent (cotises and lions left off)', arms: { c1: '#1f4690', c2: '#ece8dc', c3: '#ece8dc', pattern: 'bend', charge: 'none' } },
      { name: 'Grandson', note: 'Paly argent and azure, a bend gules', arms: { c1: '#ece8dc', c2: '#1f4690', c3: '#1f4690', pattern: 'paly', charge: 'none', over: [{ kind: 'bend', c: '#a81e1e' }] } },
    ],
  },
  finishes: {
    finishes: {
      blued: { name: 'Blued Steel', tint: 0x3d4c6b, blurb: 'Heat-blued plate, deep blue-black.' },
      gilt: { name: 'Gilt', tint: 0xc9a24a, blurb: 'Fire-gilt plate, for a prince or a show-off.' },
      russet: { name: 'Russet', tint: 0x6e4a32, blurb: 'Browned plate, the colour of old leather.' },
      black: { name: 'Black Harness', tint: 0x2b2d32, blurb: 'Blackened plate, as Maximilian\'s jousters wore it.' },
    },
  },
  patron: { charges: ['crown'], badge: 'patron' },
};

/** The starter set of charges every player has (plus the old pre-editor names, which old saves still use). Everything else in heraldry.js CHARGES is the Herald's Book. */
export const FREE_CHARGES = ['lion', 'eagle', 'boar', 'fleur', 'rose', 'crescent', 'mullet', 'tower', 'roundel', 'lozenge', 'billet', 'crosspattee', 'cross', 'star', 'diamond', 'feathers'];
/** What the Rolls of Arms needs beyond the free pieces, so that every arms in its roll can be worn: two charges and the fur (the Herald's Book opens them too). */
export const ROLL_CHARGES = ['leopard', 'crosscrosslet'];

/** Which sku a heraldry piece belongs to ('' = free). A piece that two packs open is named by the first (the Herald's Book); see allowedArms. */
export function skuOfPattern(p) { return PACKS.herald.patterns.includes(p) ? 'herald' : ''; }
export function skuOfCharge(c) { return !c || c === 'none' ? '' : PACKS.patron.charges.includes(c) ? 'patron' : FREE_CHARGES.includes(c) ? '' : 'herald'; }
export function skuOfTincture(hex) { const h = String(hex).toLowerCase(); return PACKS.herald.tinctures.some((t) => t[1] === h) || PACKS.herald.furs.includes(h) ? 'herald' : ''; }
/** Is this piece open to somebody who owns `owned` (a Set or array of skus)? The Rolls of Arms also opens the furs and ROLL_CHARGES. */
function opens(owned, sku, piece, isFur) {
  const has = (k) => (owned instanceof Set ? owned.has(k) : (owned || []).includes(k));
  if (!sku || has(sku)) return true;
  return sku === 'herald' && has('rolls') && (isFur || ROLL_CHARGES.includes(piece));
}

/**
 * Arms with any piece the owner has not bought put back to a free one (used by the Worker on every cloud save, and by the game on a guest's save).
 * owned: a Set (or array) of skus. Returns a new object; free arms come back unchanged.
 */
export function allowedArms(arms, owned) {
  const ok = (sku, piece, fur) => opens(owned, sku, piece, fur);
  const isFur = (h) => PACKS.herald.furs.includes(String(h).toLowerCase());
  const a = { ...(arms || {}) };
  if (!ok(skuOfPattern(a.pattern))) a.pattern = 'plain';
  if (!ok(skuOfCharge(a.charge), a.charge)) a.charge = 'none';
  for (const k of ['c1', 'c2', 'c3']) if (!ok(skuOfTincture(a[k]), a[k], isFur(a[k]))) a[k] = k === 'c1' ? '#1f4690' : k === 'c2' ? '#e0b83c' : '#ece8dc';
  if (a.over !== undefined) {      // the ordinaries, the bordure and the layout carry tinctures of their own (a fur or a stain in `over` is as paid as one in c1..c3)
    a.over = (Array.isArray(a.over) ? a.over : []).filter((o) => o && typeof o === 'object').map((o) => (ok(skuOfTincture(o.c), o.c, isFur(o.c)) ? o : { ...o, c: '#e0b83c' }));
    if (!a.over.length) delete a.over;
  }
  return a;
}
/** The armour finish to wear: kept only if the finishes pack is owned. */
export function allowedFinish(id, owned) {
  const has = owned instanceof Set ? owned.has('finishes') : (owned || []).includes('finishes');
  return has && Object.hasOwn(PACKS.finishes.finishes, id) ? id : '';
}
