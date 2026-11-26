// heraldry.js - a knight's arms: what they are (blazon), where each piece goes (layout) and how they are painted (2D canvas).
// No three.js in here: util.js wraps these in textures, menus.js in the editor.  docs/heraldry-plan.md has the whole design.
//
// The saved shape of a coat of arms is the old one, so every old profile, cloud save and online peer still reads:
//   { c1, c2, c3, pattern, charge, over: [{ kind, c }, ...] }      (hex colours and short lower-case words only: the server's cleanArms keeps exactly this)
//   c1 = the field, c2 = the field's second tincture (party fields) and an old-style ordinary, c3 = the charge.
//   pattern = how the field is divided (FIELDS), or one of the old ordinary names (fess, bend, chevron, chief: drawn in c2, as before).
//   charge  = a charge id (CHARGES; the old names cross, star, diamond, feathers still work).
//   over    = up to three entries: an ordinary { kind: ORDINARIES, c }, a bordure { kind: 'bordure', c }, and how the charges are set out { kind: LAYOUTS }.
//   Two furs ride in the colour slots as reserved hex codes (FURS), so anything that only wants a colour still gets a sensible one.
import { ATLAS } from './heraldry_atlas.js';

const TAU = Math.PI * 2;
export const ERMINE = '#ece8dd', VAIR = '#1f4691';
export const FURS = { [ERMINE]: 'ermine', [VAIR]: 'vair' };
export const TINCTURE_NAMES = { '#e0b83c': 'Or', '#ece8dc': 'Argent', '#a81e1e': 'Gules', '#1f4690': 'Azure', '#2a6b3a': 'Vert', '#191919': 'Sable', '#6b2478': 'Purpure', '#b5561c': 'Tenné', '#5a9ccb': 'Bleu celeste',
  '#6e2639': 'Murrey', '#8a2b1c': 'Sanguine', '#d9a27e': 'Carnation', [ERMINE]: 'Ermine', [VAIR]: 'Vair' };
export const FIELDS = { plain: 'plain', pale: 'per pale', perfess: 'per fess', perbend: 'per bend', perbendsin: 'per bend sinister', perchevron: 'per chevron', persaltire: 'per saltire', quarterly: 'quarterly',
  gyronny: 'gyronny', chequy: 'checky', lozengy: 'lozengy', barry: 'barry', paly: 'paly', bendy: 'bendy' };
export const ORDINARIES = { fess: 'a fess', bars: 'two bars', chief: 'a chief', pale: 'a pale', bend: 'a bend', bendsin: 'a bend sinister', bendlets: 'two bendlets', chevron: 'a chevron', chevronels: 'three chevronels',
  cross: 'a cross', saltire: 'a saltire', pile: 'a pile' };
export const LAYOUTS = { one: 'one', three: 'three', semy: 'semé', onone: 'one on the ordinary', onthree: 'three on the ordinary', counter: 'counterchanged', ten: 'ten, set 3, 3, 3 and 1' };
// charge id -> [singular, plural].  Those in the atlas are drawings from Wikimedia Commons (tools/heraldry/licences.json); the rest are drawn here.
export const CHARGES = {
  lion: ['a lion rampant', 'lions rampant'], lionpassant: ['a lion passant', 'lions passant'], leopard: ['a lion passant guardant', 'lions passant guardant'],
  eagle: ['an eagle displayed', 'eagles displayed'], eagletwo: ['a double-headed eagle displayed', 'double-headed eagles displayed'], griffin: ['a griffin segreant', 'griffins segreant'],
  dragon: ['a dragon segreant', 'dragons segreant'], boar: ['a boar passant', 'boars passant'], boarhead: ['a boar\'s head erased', 'boars\' heads erased'],
  stag: ['a stag trippant', 'stags trippant'], wolf: ['a wolf passant', 'wolves passant'], bear: ['a bear passant', 'bears passant'], talbot: ['a talbot passant', 'talbots passant'],
  dolphin: ['a dolphin haurient', 'dolphins haurient'], raven: ['a raven', 'ravens'], martlet: ['a martlet', 'martlets'],
  fleur: ['a fleur-de-lis', 'fleurs-de-lis'], rose: ['a rose', 'roses'], garb: ['a garb', 'garbs'], escallop: ['an escallop', 'escallops'], crescent: ['a crescent', 'crescents'], sun: ['a sun in splendour', 'suns in splendour'],
  mullet: ['a mullet', 'mullets'], estoile: ['an estoile', 'estoiles'], tower: ['a tower', 'towers'], rook: ['a chess-rook', 'chess-rooks'], key: ['a key', 'keys'], sword: ['a sword', 'swords'],
  horn: ['a hunting horn', 'hunting horns'], horseshoe: ['a horseshoe', 'horseshoes'], crown: ['a crown', 'crowns'], feather: ['an ostrich feather', 'ostrich feathers'],
  crossmoline: ['a cross moline', 'crosses moline'], crosspatonce: ['a cross patonce', 'crosses patonce'], crosscrosslet: ['a cross crosslet', 'cross-crosslets'], crossmaltese: ['a Maltese cross', 'Maltese crosses'],
  crosspattee: ['a cross pattée', 'crosses pattée'], crossflory: ['a cross flory', 'crosses flory'], crossbottony: ['a cross bottony', 'crosses bottony'], crossjerusalem: ['a cross potent', 'crosses potent'],
  lozenge: ['a lozenge', 'lozenges'], mascle: ['a mascle', 'mascles'], roundel: ['a roundel', 'roundels'], annulet: ['an annulet', 'annulets'], billet: ['a billet', 'billets'],
};
const CHARGE_ALIAS = { star: 'mullet', diamond: 'lozenge', feathers: 'feather', cross: 'crosspattee' };
const OLD_ORD = { fess: 1, bend: 1, chevron: 1, chief: 1, saltire: 1, pile: 1 };      // old `pattern` values that were really ordinaries (in c2)

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
/** metal, colour or fur (the rule of tincture: no metal on metal, no colour on colour; furs go with anything). */
export function tinctureClass(hex) {
  hex = String(hex).toLowerCase(); if (FURS[hex]) return 'fur';
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return lum(hex) > 0.5 && (mx - mn < 60 || (r > 180 && g > 140 && b < 120)) ? 'metal' : 'colour';
}
export function tinctureName(hex) {
  hex = String(hex).toLowerCase(); if (TINCTURE_NAMES[hex]) return TINCTURE_NAMES[hex];
  let best = 'Argent', bd = 1e9; const n = parseInt(hex.slice(1), 16);
  for (const k in TINCTURE_NAMES) { const m = parseInt(k.slice(1), 16), d = (n >> 16 & 255) - (m >> 16 & 255), e = (n >> 8 & 255) - (m >> 8 & 255), f = (n & 255) - (m & 255), q = d * d + e * e + f * f; if (q < bd) { bd = q; best = TINCTURE_NAMES[k]; } }
  return best;
}

/**
 * Read saved arms (old or new) into the blazon the painter works from:
 * { field, a, b, ords: [{ kind, t }], bord, charge: { id, t, n: 1 | 3 | 'semy', on, cc } | null }
 */
export function blazonOf(arms) {
  const s = arms || {}, a = isHex(s.c1) ? s.c1 : '#1f4690', b = isHex(s.c2) ? s.c2 : a, c = isHex(s.c3) ? s.c3 : b;
  const B = { field: 'plain', a, b, ords: [], bord: null, charge: null };
  const pat = s.pattern || 'plain'; let lay = null;
  if (FIELDS[pat]) B.field = pat; else if (OLD_ORD[pat]) B.ords.push({ kind: pat, t: b }); else if (pat === 'bordure') B.bord = b;
  for (const o of Array.isArray(s.over) ? s.over : []) {
    if (!o) continue;
    if (ORDINARIES[o.kind]) B.ords.push({ kind: o.kind, t: isHex(o.c) ? o.c : b });
    else if (o.kind === 'bordure') B.bord = isHex(o.c) ? o.c : b;
    else if (LAYOUTS[o.kind]) lay = o.kind;
  }
  let id = s.charge && s.charge !== 'none' ? s.charge : null;
  if (id === 'cross' && !lay && B.field === 'plain' && !B.ords.length) { B.ords.push({ kind: 'cross', t: c }); id = null; }      // the old "plain, a cross": the ordinary, as St George bears it
  if (id) {
    id = CHARGE_ALIAS[id] || id; if (!CHARGES[id]) id = 'roundel';
    const o0 = B.ords[0] && B.ords[0].kind;
    const PARTY = { pale: 1, perfess: 1, perbend: 1, perbendsin: 1, perchevron: 1, persaltire: 1, quarterly: 1 };
    const n = lay === 'semy' ? 'semy' : lay === 'ten' ? 10 : lay === 'three' || lay === 'onthree' ? 3 : lay ? 1 : (s.charge === 'feathers' || o0 === 'chevron' || o0 === 'fess') ? 3 : 1;
    // (an old charge in one of a parted field's own tinctures would be lost on half of it: it is counterchanged)
    B.charge = { id, t: c, n, on: lay === 'onone' || lay === 'onthree', cc: lay === 'counter' || (!lay && n === 1 && !o0 && !!PARTY[B.field] && (c === a || c === b)) };
  }
  return B;
}

/** The editor's view of saved arms: { field, ord, ordT, bord, bordT, charge, lay }. */
export function armsParts(arms) {
  const B = blazonOf(arms), o = B.ords[0], c = B.charge;
  return { field: B.field, ord: o ? o.kind : 'none', ordT: o ? o.t : B.b, bord: !!B.bord, bordT: B.bord || (o ? o.t : B.b), charge: c ? c.id : 'none',
    lay: !c ? 'one' : c.cc ? 'counter' : c.n === 'semy' ? 'semy' : c.n === 10 ? 'ten' : (c.on ? 'on' : '') + (c.n === 3 ? 'three' : 'one') };
}
/** Write the editor's choices back into the saved shape (in place). Arms with more than one ordinary keep only the first once edited. */
export function setArmsParts(arms, patch) {
  const p = Object.assign(armsParts(arms), patch);
  arms.pattern = FIELDS[p.field] ? p.field : 'plain'; arms.charge = CHARGES[p.charge] ? p.charge : 'none'; arms.over = [];
  if (ORDINARIES[p.ord]) arms.over.push({ kind: p.ord, c: p.ordT });
  if (p.bord) arms.over.push({ kind: 'bordure', c: p.bordT });
  if (arms.charge !== 'none') arms.over.push({ kind: LAYOUTS[p.lay] ? p.lay : 'one', c: '#000000' });
  if (!arms.over.length) delete arms.over;
  return arms;
}

/** The arms in words, as a herald would enter them on the roll. */
export function blazonText(arms) {
  const B = blazonOf(arms), T = tinctureName, low = (s) => s.toLowerCase();
  let s = B.field === 'plain' ? T(B.a) : `${FIELDS[B.field][0].toUpperCase()}${FIELDS[B.field].slice(1)} ${T(B.a)} and ${T(B.b)}`;
  const c = B.charge, cname = c && (c.cc ? 'counterchanged' : T(c.t));
  const many = c && (c.n === 3 ? `three ${CHARGES[c.id][1]}` : c.n === 10 ? `ten ${CHARGES[c.id][1]} conjoined, three, three, three and one,` : CHARGES[c.id][0]);
  if (c && c.n === 'semy') s += ` semé of ${CHARGES[c.id][1]} ${cname}`;
  B.ords.forEach((o, i) => {
    const on = i === 0 && c && c.on, between = i === 0 && c && !c.on && c.n !== 'semy';
    s += on ? `, on ${ORDINARIES[o.kind]} ${T(o.t)} ${many} ${cname}` : `, ${ORDINARIES[o.kind]} ${T(o.t)}`;
    if (between) s += ` ${c.n === 3 ? 'between' : o.kind === 'chief' ? 'and in base' : 'and'} ${many} ${cname}`;
  });
  if (c && !B.ords.length && c.n !== 'semy') s += `, ${many} ${cname}`;
  if (B.bord) s += `, a bordure ${T(B.bord)}`;
  return s.replace(/, (\w)/g, (m, ch) => ', ' + low(ch));
}
/** Where the arms break the rule of tincture (metal on metal, colour on colour). An empty list: they keep it. */
export function tinctureFaults(arms) {
  const B = blazonOf(arms), out = [], cls = tinctureClass, party = B.field !== 'plain';
  const clash = (x, y) => cls(x) !== 'fur' && cls(x) === cls(y);
  const o = B.ords[0];
  if (o && !party && clash(o.t, B.a)) out.push(`${ORDINARIES[o.kind]} ${tinctureName(o.t)} on ${tinctureName(B.a)}`);
  if (B.charge && !B.charge.cc) { const under = B.charge.on && o ? o.t : party ? null : B.a; if (under && clash(B.charge.t, under)) out.push(`${CHARGES[B.charge.id][0]} ${tinctureName(B.charge.t)} on ${tinctureName(under)}`); }
  if (B.bord && !party && clash(B.bord, B.a)) out.push(`a bordure ${tinctureName(B.bord)} on ${tinctureName(B.a)}`);
  return out;
}
/** Two plain colours to dress a man in (the tunic of a groom, the paint of a lance, a hem): the chief colour of the arms and its metal. */
export function liveryOf(arms) {
  const B = blazonOf(arms), all = [B.a, B.field !== 'plain' ? B.b : null, B.ords[0] && B.ords[0].t, B.charge && B.charge.t, B.bord].filter(Boolean);
  const metal = all.find(t => tinctureClass(t) === 'metal') || '#e0b83c', colour = all.find(t => tinctureClass(t) === 'colour') || '#1f4690';
  const flat = (t) => (FURS[t] === 'ermine' ? '#ece8dc' : FURS[t] === 'vair' ? '#1f4690' : t);
  return { colour: flat(colour), metal: flat(metal), trim: flat(B.bord || (tinctureClass(B.a) === 'metal' ? colour : metal)) };      // a bordure becomes the border of whatever cloth the arms are sewn on
}

// ------------------------------------------------------------------------------------------------ the charge atlas
const AT = { img: null, p: null, ready: false, cells: new Map(), sprites: new Map(), waiting: [] };
export const heraldryReady = () => AT.ready;
/** Run fn when the charge drawings have arrived (at once if they have). */
export function whenHeraldry(fn) { if (AT.ready) fn(); else { AT.waiting.push(fn); loadHeraldry(); } }
/** Fetch the atlas (once). The arms paint without it (fields and ordinaries; charges drawn in code), and whatever asked through whenHeraldry is painted again when it lands. */
export function loadHeraldry(small = false) {      // small: the 1024 atlas (low tier)
  if (AT.p) return AT.p;
  AT.p = new Promise((res) => {
    if (typeof Image === 'undefined') return res(false);
    const im = new Image();
    im.onload = () => { AT.img = im; AT.ready = true; const w = AT.waiting; AT.waiting = []; for (const f of w) { try { f(); } catch (e) { console.warn('[heraldry]', e); } } res(true); };
    im.onerror = () => { console.warn('[heraldry] the charge atlas did not load'); res(false); };
    im.src = `assets/heraldry/charges${small ? '_1k' : ''}.webp`;
  });
  return AT.p;
}
export const needsAtlas = (arms) => { const B = blazonOf(arms); return !!(B.charge && ATLAS.charges[B.charge.id]); };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/** One charge's three layers, cut from the atlas the first time it is wanted: silhouette (white), ink (black), details (white). */
function cellOf(id) {
  let c = AT.cells.get(id); if (c) return c;
  const m = ATLAS.charges[id], n = AT.img.naturalWidth / ATLAS.cols, cv = mkCanvas(n, n), g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(AT.img, (m[0] % ATLAS.cols) * n, Math.floor(m[0] / ATLAS.cols) * n, n, n, 0, 0, n, n);
  const I = g.getImageData(0, 0, n, n), d = I.data, layer = (f) => { const o = mkCanvas(n, n), og = o.getContext('2d'), J = og.createImageData(n, n), e = J.data; for (let i = 0; i < d.length; i += 4) f(e, i); og.putImageData(J, 0, 0); return o; };
  c = { n, sil: layer((e, i) => { e[i] = e[i + 1] = e[i + 2] = 255; e[i + 3] = d[i + 3]; }), ink: layer((e, i) => { e[i + 3] = d[i + 3] ? d[i] : 0; }), sec: layer((e, i) => { e[i] = e[i + 1] = e[i + 2] = 255; e[i + 3] = d[i + 3] ? d[i + 1] : 0; }) };
  AT.cells.set(id, c); return c;
}
/** The charge painted in a tincture: flat colour, its details (claws, tongue) in a second one, the line work in ink over it. */
function sprite(id, hex, sec) {
  const key = id + hex + sec; let s = AT.sprites.get(key); if (s) return s;
  const c = cellOf(id), n = c.n; s = mkCanvas(n, n); const g = s.getContext('2d');
  g.drawImage(c.sil, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = hex; g.fillRect(0, 0, n, n);
  const t = mkCanvas(n, n), tg = t.getContext('2d'); tg.drawImage(c.sec, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = sec; tg.fillRect(0, 0, n, n);
  g.globalCompositeOperation = 'source-atop'; g.drawImage(t, 0, 0);
  const dark = lum(hex) < 0.16;      // a sable beast: its inner lines are drawn pale, or they would be lost
  tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, n, n); tg.drawImage(c.ink, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = dark ? '#8f8c82' : '#15100b'; tg.fillRect(0, 0, n, n);
  g.globalCompositeOperation = dark ? 'source-atop' : 'source-over'; g.globalAlpha = dark ? 0.75 : 1; g.drawImage(t, 0, 0); g.globalAlpha = 1;
  if (AT.sprites.size > 160) AT.sprites.clear();
  AT.sprites.set(key, s); return s;
}

// ------------------------------------------------------------------------------------------------ charges drawn in code (unit box, centre 0,0, size 1)
const poly = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const SHAPES = {
  mullet(g) { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.5, a = -Math.PI / 2 + i * Math.PI / 5; p.push([Math.cos(a) * r, Math.sin(a) * r + 0.03]); } poly(g, p); },
  estoile(g) {      // six wavy rays
    g.moveTo(0, -0.5);
    for (let i = 0; i < 6; i++) { const a0 = -Math.PI / 2 + i * Math.PI / 3, a1 = a0 + Math.PI / 3, am = a0 + Math.PI / 6, P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
      const [x1, y1] = P(a0 + 0.42, 0.34), [x2, y2] = P(am - 0.3, 0.2), [mx, my] = P(am, 0.13), [x3, y3] = P(am + 0.3, 0.3), [x4, y4] = P(a1 - 0.42, 0.2), [ex, ey] = P(a1, 0.5);
      g.bezierCurveTo(x1, y1, x2, y2, mx, my); g.bezierCurveTo(x3, y3, x4, y4, ex, ey); }
    g.closePath();
  },
  lozenge(g) { poly(g, [[0, -0.5], [0.36, 0], [0, 0.5], [-0.36, 0]]); },
  mascle(g) { poly(g, [[0, -0.5], [0.36, 0], [0, 0.5], [-0.36, 0]]); poly(g, [[0, -0.27], [-0.195, 0], [0, 0.27], [0.195, 0]]); },
  roundel(g) { g.arc(0, 0, 0.44, 0, TAU); g.closePath(); },
  annulet(g) { g.arc(0, 0, 0.45, 0, TAU); g.closePath(); g.moveTo(0.27, 0); g.arc(0, 0, 0.27, 0, TAU, true); g.closePath(); },
  billet(g) { g.rect(-0.26, -0.46, 0.52, 0.92); },
  key(g) {      // palewise, the wards upward and to the dexter, the bow a pierced quatrefoil ring
    g.arc(0, 0.3, 0.2, 0, TAU); g.closePath(); g.moveTo(0.1, 0.3); g.arc(0, 0.3, 0.1, 0, TAU, true); g.closePath();
    poly(g, [[-0.04, 0.11], [-0.04, -0.5], [0.04, -0.5], [0.04, 0.11]]);
    poly(g, [[-0.04, -0.48], [-0.25, -0.48], [-0.25, -0.4], [-0.17, -0.4], [-0.17, -0.34], [-0.25, -0.34], [-0.25, -0.2], [-0.17, -0.2], [-0.17, -0.26], [-0.1, -0.26], [-0.1, -0.2], [-0.04, -0.2]]);
    g.rect(-0.07, 0.02, 0.14, 0.05);
  },
  crown(g) {      // an open crown of three fleurons on a jewelled band
    g.moveTo(-0.46, 0.3); g.lineTo(-0.5, -0.12); g.quadraticCurveTo(-0.4, -0.02, -0.33, 0.04); g.quadraticCurveTo(-0.3, -0.16, -0.25, -0.3); g.quadraticCurveTo(-0.2, -0.08, -0.12, 0.04);
    g.quadraticCurveTo(-0.08, -0.25, 0, -0.46); g.quadraticCurveTo(0.08, -0.25, 0.12, 0.04); g.quadraticCurveTo(0.2, -0.08, 0.25, -0.3); g.quadraticCurveTo(0.3, -0.16, 0.33, 0.04);
    g.quadraticCurveTo(0.4, -0.02, 0.5, -0.12); g.lineTo(0.46, 0.3); g.closePath(); g.rect(-0.46, 0.3, 0.92, 0.14);
  },
  feather(g) {      // an ostrich feather, the quill down, the tip curled over
    g.moveTo(0.02, 0.5); g.bezierCurveTo(-0.3, 0.3, -0.34, -0.2, -0.12, -0.42); g.bezierCurveTo(0.02, -0.56, 0.3, -0.5, 0.3, -0.3); g.bezierCurveTo(0.3, -0.2, 0.2, -0.16, 0.14, -0.24);
    g.bezierCurveTo(0.2, -0.3, 0.1, -0.4, 0.02, -0.32); g.bezierCurveTo(0.16, -0.1, 0.2, 0.2, 0.07, 0.5); g.closePath();
  },
};
const SHAPE_DETAIL = {      // inner lines, stroked over the fill
  feather(g) { g.moveTo(0.04, 0.5); g.bezierCurveTo(-0.08, 0.2, -0.12, -0.15, -0.02, -0.34); for (let i = 0; i < 7; i++) { const y = 0.36 - i * 0.1, x = -0.03 - 0.012 * i; g.moveTo(x, y); g.lineTo(x - 0.13, y - 0.07); g.moveTo(x, y); g.lineTo(x + 0.11, y - 0.08); } },
  crown(g) { g.moveTo(-0.46, 0.3); g.lineTo(0.46, 0.3); for (const x of [-0.3, 0, 0.3]) { g.moveTo(x + 0.045, 0.37); g.arc(x, 0.37, 0.045, 0, TAU); } },
  key() {}, mullet() {}, estoile() {}, lozenge() {}, mascle() {}, roundel() {}, annulet() {}, billet() {},
};

/** One charge, centred on (cx, cy), `size` across its larger side, in tincture `hex`. o: { rot, flip, style, sec } */
export function drawCharge(g, id, cx, cy, size, hex, o = {}) {
  id = CHARGE_ALIAS[id] || id;
  const cloth = o.style === 'cloth', col = FURS[hex] ? (FURS[hex] === 'ermine' ? '#ece8dc' : '#1f4690') : hex;
  g.save(); g.translate(cx, cy); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(-1, 1);
  if (o.style) { g.shadowColor = cloth ? 'rgba(10,6,2,0.5)' : 'rgba(10,6,2,0.3)'; g.shadowBlur = size * (cloth ? 0.035 : 0.02); g.shadowOffsetY = size * (cloth ? 0.012 : 0.006); g.shadowOffsetX = size * 0.004; }      // sewn on (or laid in thick paint): it stands a little proud
  if (ATLAS.charges[id] && AT.ready) {
    const sec = o.sec || (col.toLowerCase() === '#a81e1e' || o.on === '#a81e1e' ? '#1f4690' : '#a81e1e');      // armed and langued gules (azure where the beast or its field is gules)
    g.drawImage(sprite(id, col, sec), -size / 2, -size / 2, size, size);
  } else {
    const f = SHAPES[id] || SHAPES.roundel, d = SHAPE_DETAIL[id];
    g.scale(size, size); g.beginPath(); f(g); g.fillStyle = col; g.fill('evenodd');
    g.shadowColor = 'transparent'; g.lineJoin = 'round'; g.lineWidth = 0.022; g.strokeStyle = lum(col) < 0.16 ? 'rgba(143,140,130,0.8)' : '#15100b'; g.stroke();
    if (d && SHAPES[id]) { g.beginPath(); d(g); g.lineWidth = 0.014; g.stroke(); }
  }
  g.restore();
}
/** Every charge id the editor offers, in the order of the roll. */
export const chargeList = () => Object.keys(CHARGES);

// ------------------------------------------------------------------------------------------------ fields, furs, ordinaries
const TILES = new Map();
/** A fill for a tincture: a flat colour, or a fur's pattern (the spots / bells `unit` px across). */
function inkOf(g, hex, unit) {
  const fur = FURS[String(hex).toLowerCase()]; if (!fur) return hex;
  const n = Math.max(8, Math.round(unit)), key = fur + n; let cv = TILES.get(key);
  if (!cv) {
    if (fur === 'ermine') {      // argent, strewn with sable ermine tails: three tufts and a spread tail, in staggered rows
      cv = mkCanvas(n * 2, n * 2); const t = cv.getContext('2d'); t.fillStyle = '#ece8dc'; t.fillRect(0, 0, n * 2, n * 2); t.fillStyle = '#191919';
      const spot = (x, y) => { t.save(); t.translate(x, y); t.scale(n, n); t.beginPath(); for (const [dx, dy] of [[0, -0.34], [-0.11, -0.25], [0.11, -0.25]]) { t.moveTo(dx + 0.05, dy); t.arc(dx, dy, 0.05, 0, TAU); }
        t.moveTo(0, -0.26); t.quadraticCurveTo(0.05, 0, 0.17, 0.32); t.lineTo(0.06, 0.26); t.lineTo(0, 0.36); t.lineTo(-0.06, 0.26); t.lineTo(-0.17, 0.32); t.quadraticCurveTo(-0.05, 0, 0, -0.26); t.fill(); t.restore(); };
      spot(n * 0.5, n * 0.5); spot(n * 1.5, n * 1.5);
    } else {      // vair: rows of azure bells on argent, each row set half a bell along
      const w = n, h = Math.round(n * 1.1); cv = mkCanvas(w, h * 2); const t = cv.getContext('2d'); t.fillStyle = '#ece8dc'; t.fillRect(0, 0, w, h * 2); t.fillStyle = '#1f4690'; t.strokeStyle = 'rgba(21,16,11,0.55)'; t.lineWidth = Math.max(1, n * 0.03);
      const bell = (x, y) => { t.beginPath(); poly(t, [[x, y + h], [x + w * 0.2, y + h * 0.72], [x + w * 0.2, y + h * 0.3], [x + w * 0.5, y], [x + w * 0.8, y + h * 0.3], [x + w * 0.8, y + h * 0.72], [x + w, y + h]]); t.fill(); t.stroke(); };
      bell(0, 0); bell(-w / 2, h); bell(w / 2, h);
    }
    TILES.set(key, cv);
  }
  return g.createPattern(cv, 'repeat');
}
/** The parts of a divided field that take the second tincture, as polygons. */
function fieldParts(kind, w, h) {
  const P = [];
  if (kind === 'pale') P.push([[w / 2, 0], [w, 0], [w, h], [w / 2, h]]);
  else if (kind === 'perfess') P.push([[0, h / 2], [w, h / 2], [w, h], [0, h]]);
  else if (kind === 'perbend') P.push([[0, 0], [w, h], [0, h]]);
  else if (kind === 'perbendsin') P.push([[w, 0], [w, h], [0, h]]);
  else if (kind === 'perchevron') P.push([[0, h * 0.74], [w / 2, h * 0.36], [w, h * 0.74], [w, h], [0, h]]);
  else if (kind === 'persaltire') P.push([[0, 0], [w / 2, h / 2], [0, h]], [[w, 0], [w / 2, h / 2], [w, h]]);
  else if (kind === 'quarterly') P.push([[w / 2, 0], [w, 0], [w, h / 2], [w / 2, h / 2]], [[0, h / 2], [w / 2, h / 2], [w / 2, h], [0, h]]);
  else if (kind === 'gyronny') { const c = [w / 2, h / 2], R = [[0, 0], [w / 2, 0], [w, 0], [w, h / 2], [w, h], [w / 2, h], [0, h], [0, h / 2]]; for (let i = 0; i < 8; i += 2) P.push([c, R[i], R[i + 1]]); }
  else if (kind === 'chequy') { const n = 6, s = w / n, m = Math.max(1, Math.round(h / s)), t = h / m; for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) P.push([[x * s, y * t], [x * s + s, y * t], [x * s + s, y * t + t], [x * s, y * t + t]]); }
  else if (kind === 'lozengy') { const n = 5, s = w / n, m = Math.max(1, Math.round(h / (s * 1.35))), t = h / m; for (let y = 0; y <= m; y++) for (let x = 0; x <= n; x++) P.push([[x * s, y * t - t / 2], [x * s + s / 2, y * t], [x * s, y * t + t / 2], [x * s - s / 2, y * t]]); }
  else if (kind === 'barry') { const n = h / w > 1.4 ? 8 : 6; for (let i = 1; i < n; i += 2) P.push([[0, h / n * i], [w, h / n * i], [w, h / n * (i + 1)], [0, h / n * (i + 1)]]); }
  else if (kind === 'paly') { for (let i = 1; i < 6; i += 2) P.push([[w / 6 * i, 0], [w / 6 * (i + 1), 0], [w / 6 * (i + 1), h], [w / 6 * i, h]]); }
  else if (kind === 'bendy') { for (let k = 0; k < 6; k += 2) { const c0 = -1 + k / 3 + 1 / 3, c1 = c0 + 1 / 3; P.push([[c0 * w, 0], [c1 * w, 0], [(c1 + 1) * w, h], [(c0 + 1) * w, h]]); } }
  return P;
}
const diag = (w, h, c0, c1, sin) => { const p = [[c0 * w, 0], [c1 * w, 0], [(c1 + 1) * w, h], [(c0 + 1) * w, h]]; return sin ? p.map(([x, y]) => [w - x, y]) : p; };
/** An ordinary's outline(s) in the rect. sh: 1 on a shield (its point takes the lower third), 0 on cloth. */
function ordParts(kind, w, h, sh) {
  const yc = sh ? 0.43 : 0.5;
  switch (kind) {
    case 'chief': return [[[0, 0], [w, 0], [w, h * 0.28], [0, h * 0.28]]];
    case 'fess': return [[[0, h * (yc - 0.14)], [w, h * (yc - 0.14)], [w, h * (yc + 0.14)], [0, h * (yc + 0.14)]]];
    case 'bars': return [yc - 0.2, yc + 0.1].map(y => [[0, h * y], [w, h * y], [w, h * (y + 0.13)], [0, h * (y + 0.13)]]);
    case 'pale': return [[[w * 0.35, 0], [w * 0.65, 0], [w * 0.65, h], [w * 0.35, h]]];
    case 'bend': return [diag(w, sh ? h * 0.86 : h, -0.19, 0.19)];      // (on a shield the bend runs to the sinister flank, not down into the point)
    case 'bendsin': return [diag(w, sh ? h * 0.86 : h, -0.19, 0.19, true)];
    case 'bendlets': return [diag(w, sh ? h * 0.86 : h, 0.07, 0.25), diag(w, sh ? h * 0.86 : h, -0.25, -0.07)];
    case 'chevron': { const a = yc - 0.15, r = 0.42, t = 0.21; return [[[0, h * (a + r)], [w / 2, h * a], [w, h * (a + r)], [w, h * (a + r + t)], [w / 2, h * (a + t)], [0, h * (a + r + t)]]]; }
    case 'chevronels': return [0.08, 0.3, 0.52].map(a => [[0, h * (a + 0.3)], [w / 2, h * a], [w, h * (a + 0.3)], [w, h * (a + 0.4)], [w / 2, h * (a + 0.1)], [0, h * (a + 0.4)]]);
    case 'cross': { const t = Math.min(w, h) * 0.1, y = h * yc; return [[[w / 2 - t, 0], [w / 2 + t, 0], [w / 2 + t, y - t], [w, y - t], [w, y + t], [w / 2 + t, y + t], [w / 2 + t, h], [w / 2 - t, h], [w / 2 - t, y + t], [0, y + t], [0, y - t], [w / 2 - t, y - t]]]; }
    case 'saltire': { const hh = sh ? h * 0.86 : h, a = diag(w, hh, -0.115, 0.115), b = diag(w, hh, -0.115, 0.115, true); return [a, b]; }
    case 'pile': return [[[w * 0.16, 0], [w * 0.84, 0], [w * 0.5, h * (sh ? 0.8 : 0.86)]]];
  }
  return [];
}
/** Where the charges go: [{ x, y, s, rot }] in px. */
function slots(B, w, h, sh) {
  const c = B.charge, u = Math.min(w, h), o = B.ords[0] && B.ords[0].kind, n = c.n, yc = sh ? 0.44 : 0.5, lowY = sh ? 0.66 : 0.74;
  const P = (x, y, s, rot) => ({ x: x * w, y: y * h, s: s * u, rot: rot || 0 });
  let L;
  if (n === 'semy') { L = []; const cols = 4, dx = w / cols, dy = dx * 0.86, rows = Math.ceil(h / dy) + 1; for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) L.push({ x: (i + 0.5 + (j % 2) * 0.5) * dx, y: (j + 0.45) * dy, s: dx * 0.62, rot: 0 }); return L; }
  if (n === 10) { L = []; const s = sh ? 0.2 : 0.22, x0 = 0.5 - s * 0.72, y0 = sh ? 0.17 : 0.2; for (let r = 0; r < 4; r++) for (let i = 0; i < (r < 3 ? 3 : 1); i++) L.push({ x: (r < 3 ? x0 + i * s * 0.72 : 0.5) * w, y: y0 * h + r * s * u, s: s * u, rot: 0 }); return L; }
  const bw = Math.atan2(-w, sh ? h * 0.86 : h);      // bendwise: the charge's head toward the dexter chief
  if (!o) L = n === 3 ? [P(0.27, sh ? 0.23 : 0.26, 0.37), P(0.73, sh ? 0.23 : 0.26, 0.37), P(0.5, lowY, 0.37)] : [P(0.5, yc, sh ? 0.8 : 0.8)];
  else if (o === 'chief') L = c.on ? (n === 3 ? [0.2, 0.5, 0.8] : [0.5]).map(x => P(x, 0.14, 0.2)) : n === 3 ? [P(0.28, 0.42, 0.27), P(0.72, 0.42, 0.27), P(0.5, sh ? 0.71 : 0.78, 0.27)] : [P(0.5, sh ? 0.6 : 0.64, 0.5)];
  else if (o === 'fess') L = c.on ? (n === 3 ? [0.2, 0.5, 0.8] : [0.5]).map(x => P(x, sh ? 0.43 : 0.5, 0.21)) : n === 3 ? [P(0.27, sh ? 0.15 : 0.18, 0.25), P(0.73, sh ? 0.15 : 0.18, 0.25), P(0.5, sh ? 0.75 : 0.82, 0.25)] : [P(0.5, sh ? 0.15 : 0.18, 0.26)];
  else if (o === 'bars') L = (n === 3 ? [0.2, 0.5, 0.8] : [0.5]).map(x => P(x, sh ? 0.11 : 0.15, 0.17));
  else if (o === 'pale') L = (n === 3 ? [0.19, sh ? 0.46 : 0.5, sh ? 0.73 : 0.81] : [yc]).map(y => P(0.5, y, 0.23));
  else if (o === 'bend' || o === 'bendsin') { const m = o === 'bendsin';
    L = c.on ? (n === 3 ? [0.24, 0.5, 0.76] : [0.5]).map(t => P(m ? 1 - t : t, t * (sh ? 0.86 : 1), 0.2, m ? -bw : bw)) : n === 3 ? [P(m ? 0.26 : 0.74, 0.2, 0.27), P(m ? 0.72 : 0.28, sh ? 0.64 : 0.76, 0.25)] : [P(m ? 0.26 : 0.74, 0.2, 0.3)]; }
  else if (o === 'chevron') L = c.on ? [P(0.5, yc - 0.05, 0.15), ...(n === 3 ? [P(0.24, yc + 0.17, 0.15), P(0.76, yc + 0.17, 0.15)] : [])] : n === 3 ? [P(0.24, sh ? 0.17 : 0.19, 0.26), P(0.76, sh ? 0.17 : 0.19, 0.26), P(0.5, sh ? 0.74 : 0.8, 0.26)] : [P(0.5, sh ? 0.74 : 0.8, 0.28)];
  else if (o === 'cross') { const y = sh ? 0.43 : 0.5; L = c.on ? [P(0.5, y, 0.17), ...(n === 3 ? [P(0.5, y - 0.27, 0.15), P(0.5, y + 0.27, 0.15), P(0.2, y, 0.15), P(0.8, y, 0.15)] : [])] : [P(0.2, y - 0.25, 0.2), P(0.8, y - 0.25, 0.2), P(sh ? 0.24 : 0.2, y + 0.24, sh ? 0.17 : 0.2), P(sh ? 0.76 : 0.8, y + 0.24, sh ? 0.17 : 0.2)]; }
  else if (o === 'saltire') { const y = sh ? 0.43 : 0.5; L = c.on ? [P(0.5, y, 0.16)] : [P(0.5, y - 0.3, 0.19), P(0.15, y, 0.19), P(0.85, y, 0.19), P(0.5, y + (sh ? 0.28 : 0.3), 0.19)]; }
  else if (o === 'pile') L = [P(0.5, 0.25, 0.3)];
  else L = [];
  if (B.bord) for (const s of L) { s.x = w / 2 + (s.x - w / 2) * 0.84; s.y = h * yc + (s.y - h * yc) * 0.84; s.s *= 0.86; }
  return L;
}

const rectPath = (g, w, h) => { g.rect(0, 0, w, h); };
/** The outline of a heater shield filling (0,0,w,h). */
export function heaterPath(g, w, h) {
  g.moveTo(1, 1); g.lineTo(w - 1, 1); g.lineTo(w - 1, h * 0.45);
  g.bezierCurveTo(w - 1, h * 0.72, w * 0.72, h * 0.9, w / 2, h - 1);
  g.bezierCurveTo(w * 0.28, h * 0.9, 1, h * 0.72, 1, h * 0.45); g.closePath();
}

/**
 * Paint a coat of arms over the rect (0,0,w,h).
 * o: { shape: 'rect' | 'shield' (lays the charges out for a heater's point), style: null | 'cloth' (sewn on: an edge and a little relief) | 'paint',
 *      outline(g): the shape the bordure follows (default the rect), noBordure: leave it off (a trapper wears it as its hem band) }
 */
export function drawArms(g, w, h, arms, o = {}) {
  if (typeof o !== 'object' || !o) o = {};
  const B = blazonOf(arms), sh = o.shape === 'shield' ? 1 : 0, u = Math.min(w, h), lw = Math.max(1, u * 0.008), LINE = 'rgba(21,16,11,0.85)';
  const fur = u * 0.16, relief = o.style === 'cloth';
  g.save(); g.lineJoin = 'round';
  g.fillStyle = inkOf(g, B.a, fur); g.fillRect(0, 0, w, h);
  const parts = fieldParts(B.field, w, h);
  if (parts.length) {
    g.fillStyle = inkOf(g, B.b, fur); g.beginPath(); for (const p of parts) poly(g, p); g.fill();
    g.strokeStyle = 'rgba(21,16,11,0.5)'; g.lineWidth = lw * 0.7; g.stroke();
  }
  const semy = B.charge && B.charge.n === 'semy';
  const charges = (onOrd) => {
    const c = B.charge; if (!c || (!!c.on && !!B.ords.length) !== onOrd) return;
    const L = slots(B, w, h, sh), under = c.on && B.ords[0] ? B.ords[0].t : B.a;
    if (c.cc && parts.length) {      // counterchanged: each half of the charge takes the tincture of the other half of the field
      const part = (hex, inside) => { g.save(); g.beginPath(); if (!inside) g.rect(0, 0, w, h); for (const p of parts) poly(g, p); g.clip(inside ? 'nonzero' : 'evenodd'); for (const s of L) drawCharge(g, c.id, s.x, s.y, s.s, hex, { rot: s.rot, style: o.style, sec: hex }); g.restore(); };
      part(B.b, false); part(B.a, true); return;
    }
    const m = ATLAS.charges[c.id], wide = m && L.length === 1 && !B.ords.length && m[1] > m[2] * 1.25 ? 1.1 : 1;      // a lone long beast (passant) may run nearly the width of the field
    for (const s of L) drawCharge(g, c.id, s.x, s.y, s.s * wide, c.t, { rot: s.rot, style: o.style, on: under });
  };
  if (semy) charges(false);      // a powdered field lies under the ordinaries
  for (const od of B.ords) {
    const P = ordParts(od.kind, w, h, sh); if (!P.length) continue;
    g.save(); g.beginPath(); for (const p of P) poly(g, p);
    if (relief) { g.shadowColor = 'rgba(10,6,2,0.45)'; g.shadowBlur = u * 0.012; g.shadowOffsetY = u * 0.004; }
    const ink = inkOf(g, od.t, fur); g.fillStyle = ink; g.fill(); g.shadowColor = 'transparent';
    if (relief) {      // the stitching: a dashed thread a little inside the edge
      g.save(); g.clip(); g.setLineDash([lw * 2.6, lw * 2]); g.lineWidth = lw * 7; g.strokeStyle = lum(FURS[od.t] ? '#ece8dc' : od.t) > 0.45 ? 'rgba(70,48,24,0.55)' : 'rgba(240,228,200,0.55)'; g.stroke();
      g.setLineDash([]); g.lineWidth = lw * 5.2; g.strokeStyle = ink; g.stroke(); g.restore();
    }
    g.strokeStyle = LINE; g.lineWidth = lw; g.stroke();
    g.restore();
  }
  if (!semy) charges(false);
  charges(true);
  if (B.bord && !o.noBordure) {
    const out = o.outline || rectPath, bwid = u * 0.085;
    g.save(); g.beginPath(); out(g, w, h); g.clip();
    g.beginPath(); out(g, w, h); g.lineWidth = bwid * 2 + lw * 2; g.strokeStyle = LINE; g.stroke();
    g.lineWidth = bwid * 2; g.strokeStyle = inkOf(g, B.bord, fur); g.stroke(); g.restore();
  }
  g.restore();
}

/** Arms clipped to a heater shield on a 2D canvas (the crests of the menus, the cards, the roll). */
export function drawCrest(cv, arms) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const paint = () => {
    g.clearRect(0, 0, w, h); g.save(); g.beginPath(); heaterPath(g, w, h); g.clip();
    drawArms(g, w, h, arms, { shape: 'shield', outline: heaterPath });
    // a painted shield: the light falls from the dexter chief
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,250,235,0.16)'); gr.addColorStop(0.5, 'rgba(255,250,235,0)'); gr.addColorStop(1, 'rgba(20,12,4,0.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.restore();
    g.beginPath(); heaterPath(g, w, h); g.lineWidth = Math.max(1.5, w / 40); g.strokeStyle = 'rgba(20,14,8,0.9)'; g.stroke();
  };
  paint();
  if (!AT.ready && needsAtlas(arms)) { const tag = cv._armsTag = {}; whenHeraldry(() => { if (cv._armsTag === tag) paint(); }); } else cv._armsTag = null;
}

// ------------------------------------------------------------------------------------------------ cloth
let NOISE = null;
/** Woven cloth over whatever is painted: uneven dye (broad, soft patches), the weave's two threads, a little fading. Multiplied in, so the tinctures keep their hue. */
export function fabricOver(g, w, h, strength = 1) {
  if (!NOISE) {
    let s = 1234567; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const mk = (n, lo) => { const c = mkCanvas(n, n), q = c.getContext('2d'), I = q.createImageData(n, n); for (let i = 0; i < n * n; i++) { const v = lo + (255 - lo) * r(); I.data[i * 4] = v; I.data[i * 4 + 1] = v * 0.985; I.data[i * 4 + 2] = v * 0.96; I.data[i * 4 + 3] = 255; } q.putImageData(I, 0, 0); return c; };
    const weave = mkCanvas(4, 4), q = weave.getContext('2d'); q.fillStyle = '#fff'; q.fillRect(0, 0, 4, 4); q.fillStyle = 'rgba(0,0,0,0.16)'; q.fillRect(0, 0, 4, 1); q.fillRect(0, 0, 1, 4); q.fillStyle = 'rgba(0,0,0,0.07)'; q.fillRect(2, 2, 2, 1);
    NOISE = { soft: mk(24, 218), fine: mk(128, 226), weave };
  }
  g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.globalAlpha = 0.9 * strength; g.drawImage(NOISE.soft, 0, 0, w, h);
  g.globalAlpha = 0.55 * strength; g.drawImage(NOISE.fine, 0, 0, w, h);
  g.globalAlpha = 0.5 * strength; g.fillStyle = g.createPattern(NOISE.weave, 'repeat'); g.fillRect(0, 0, w, h);
  g.restore();
}
