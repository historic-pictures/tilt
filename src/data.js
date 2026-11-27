import { EQUAL_GEAR } from './config.js';
// All tuning lives here as plain data so it can be ported to another engine later.

export const GAITS = ['HALT', 'WALK', 'TROT', 'CANTER', 'GALLOP'];
// m/s; gallop uses the horse's own top speed. Timed on film of the 2012 Sankt Wendel joust (riders in full harness, against the
// tilt's 2 m panels): about 7 m/s at full pace, reached in about 2 s, at about 2 strides a second. Horse `top` speeds are set from that.
export const GAIT_SPEED = [0, 1.8, 4.2, 6.2, 1];

// Real sizes. `withers` (m) is the height at the withers, `hands` the same in hands and inches (1 hand = 4 in = 0.1016 m; 15.2 = 15 hands 2 in = 62 in = 1.575 m),
// `kg` the weight, `length` point of shoulder to point of buttock in m. The rigged model is scaled so its withers stand at `withers` (jouster.js modelWithers),
// and the saddle is then seated on that scaled back. Sources (from memory, not re-checked against the books): the Museum of London's "The Medieval Horse and its
// Equipment" (Clark, 1995) and Ann Hyland's "The Medieval Warhorse" (1994) put most medieval horses, warhorses included, at 14 to 15 hands, with the great
// destriers up to about 16 (a modern Shire is 17+). The per-horse figures are our own picks inside those ranges; weights are for lean, ridden horses.
// `scale` is only the size of the older code-built horse, used if the rigged model fails to load.
export const HORSES = {
  destrier: {
    id: 'destrier', name: 'Destrier', hands: 15.2, withers: 1.575, kg: 540, length: 1.65, blurb: 'The great horse of the lists, bred for this and little else. Expensive to keep, and he knows it.', blurbStats: 'The great horse. Heavy, steady and hard-hitting, slow to get going.',
    price: 260, top: 7.7, accel: 2.4, mass: 1.25, steady: 0.85, nerve: 0.8, stamina: 0.7, scale: 1.07, girth: 1.08,
    coat: 0x2a211b, mane: 0x0e0c0b,
  },
  courser: {
    id: 'courser', name: 'Courser', hands: 15.0, withers: 1.524, kg: 470, length: 1.58, blurb: 'Hot-blooded and long in the leg, a horse for the chase and the road. Chroniclers admired him more than grooms did.', blurbStats: 'Fast and hot-blooded. Brings great speed to the strike, but the lance bounces.',
    price: 170, top: 9.0, accel: 3.2, mass: 1.0, steady: 0.58, nerve: 0.5, stamina: 0.85, scale: 1.0, girth: 1.04,
    coat: 0x6a3f22, mane: 0x16110d,
  },
  andalusian: {
    id: 'andalusian', name: 'Andalusian', hands: 14.3, withers: 1.499, kg: 450, length: 1.52, blurb: 'The warhorse of the Iberian courts, grey as a wet slate. Spanish knights rode nothing else, and said so.', blurbStats: 'Iberian warhorse. Collected, smooth-gaited and quick off the mark.',
    price: 130, top: 8.3, accel: 3.5, mass: 0.92, steady: 0.8, nerve: 0.68, stamina: 0.8, scale: 0.97, girth: 1.03,
    coat: 0xb9b5ac, mane: 0x8d8a84, socks: false,
  },
  rouncey: {
    id: 'rouncey', name: 'Rouncey', hands: 14.1, withers: 1.448, kg: 420, length: 1.48, blurb: 'A common riding horse, kept by every household that could afford one. Nobody ever wrote a poem about him.', blurbStats: 'An honest all-rounder. Unflappable and tireless, but light in the shock.',
    price: 0, top: 7.9, accel: 2.8, mass: 0.84, steady: 0.52, nerve: 0.92, stamina: 1.0, scale: 0.93, girth: 1.03,
    coat: 0x7b4a26, mane: 0x2a1c12, socks: true,
  },
};

export const ARMOURS = {
  mail: {
    id: 'mail', name: 'Mail & Surcoat', era: 'c. 1250', blurb: 'A mail shirt under a surcoat of your arms. Knights wore the same in the Crusades, and looked much the same.', blurbStats: 'A mail hauberk under a surcoat of your arms. Light, but a lance will find you.',
    price: 0, protection: 0.55, weight: 0.82, vision: 0.72, helm: 'greathelm', torso: 'surcoat', tint: 0xb9bdc4, rough: 0.5,
  },
  bascinet: {
    id: 'bascinet', name: 'Coat of Plates', era: 'c. 1380', blurb: 'Plates riveted inside a jupon of your arms, with plate arms and legs. The cloth was fashionable; the iron was underneath.', blurbStats: 'Plates riveted inside a jupon of your arms, with plate arms and legs.',
    price: 70, protection: 0.7, weight: 0.92, vision: 0.84, helm: 'bascinet', torso: 'jupon', tint: 0xc4c9d1, rough: 0.34,
  },
  milanese: {
    id: 'milanese', name: 'Milanese Harness', era: 'c. 1450', blurb: 'Full white harness, the work of the Milan armourers. Made to measure, and priced to match.', blurbStats: 'Full white harness of plate. The balanced choice of the tourney field.',
    price: 140, protection: 0.85, weight: 1.0, vision: 0.7, helm: 'armet', torso: 'plate', tint: 0xd2d7de, rough: 0.2,
  },
  stechzeug: {
    id: 'stechzeug', name: 'Stechzeug', era: 'c. 1500', blurb: 'German jousting harness, bolted to the saddle-tree of the man. You do not so much wear it as move into it.', blurbStats: 'German jousting armour, bolted and doubled on the left side. Near-impregnable, and heavy.',
    price: 220, protection: 1.0, weight: 1.16, vision: 0.42, helm: 'frogmouth', torso: 'plate', tint: 0xaab1bb, rough: 0.3,
  },
};

// `deflect` (degrees): how much sooner a point skids off this helm than off a plain round one (a flat-fronted great helm catches it instead).
// The helm is bought and worn on its own. Each body harness above names the helm it was made with (`helm`), which is what the other knights wear.
export const HELMS = {
  greathelm: { id: 'greathelm', name: 'Great Helm', era: 'c. 1250', blurb: 'Flat-topped and plain, the helm of the crusading age. The whole face was a slit and a coat of arms.', blurbStats: 'Flat-topped and plain. Fair sight, but a square stroke rings it like a bell.', price: 0, protection: 0.55, vision: 0.72, kg: 3, deflect: -4 },
  bascinet:  { id: 'bascinet', name: 'Houndskull Bascinet', era: 'c. 1380', blurb: 'A pointed skull and a snouted visor, said to look like the head of a hound. The Germans called it a Hundsgugel.', blurbStats: 'Pointed skull and a snouted visor that sheds a lance point. The best sight of any closed helm.', price: 40, protection: 0.7, vision: 0.84, kg: 4, deflect: 8 },
  armet:     { id: 'armet', name: 'Armet', era: 'c. 1450', blurb: 'Closes round the head like a shell, hinged cheeks and all. An Italian idea, quickly borrowed.', blurbStats: 'Closes round the head like a shell. Strong and well balanced.', price: 80, protection: 0.85, vision: 0.7, kg: 3.5, deflect: 5 },
  frogmouth: { id: 'frogmouth', name: 'Frog-mouth Helm', era: 'c. 1500', blurb: 'The Stechhelm of the German joust, bolted to the breastplate. It has the look of a toad and the manners of a vault.', blurbStats: 'Bolted to the breastplate. Nothing gets in, and you only see out when you lean in.', price: 120, protection: 1.0, vision: 0.42, kg: 9, deflect: 10 },
};
/** The harness a rider actually wears: a body armour with any helm. Helm strokes meet the helm's protection, the rest meets the body's. */
export function harness(armourId, helmId) {
  const b = ARMOURS[armourId], own = HELMS[b.helm], h = HELMS[helmId] || own;
  return Object.assign({}, b, { helm: h.id, helmDef: h, vision: h.vision, helmProt: h.protection, weight: b.weight + (h.kg - own.kg) * 0.012, kg: PHYS.armourKg[b.id] - own.kg + h.kg });
}

// The first-visit page offers these few (old names: `pale` parts the field, the rest are ordinaries in the second tincture); the Armoury's editor has the whole set (heraldry.js).
export const PATTERNS = ['plain', 'pale', 'fess', 'quarterly', 'bend', 'chevron', 'chief', 'paly'];
export const CHARGES = ['none', 'cross', 'fleur', 'star', 'tower', 'crescent', 'diamond', 'roundel', 'feathers'];
export const TINCTURES = [
  ['Or', '#e0b83c'], ['Argent', '#ece8dc'], ['Gules', '#a81e1e'], ['Azure', '#1f4690'], ['Vert', '#2a6b3a'],
  ['Sable', '#191919'], ['Purpure', '#6b2478'], ['Tenné', '#b5561c'], ['Celeste', '#5a9ccb'],
];

// Their arms are the real ones where they are known (docs/heraldry-plan.md has the blazons and what they rest on); the saved shape is explained in heraldry.js.
// Opponents. skill = aim, seat = how hard they are to unhorse, drive = how fast they come.
export const KNIGHTS = [
  { id: 'clifford', name: 'Sir Thomas Clifford', short: 'Clifford', land: 'England', arms: { c1: '#e0b83c', c2: '#1f4690', c3: '#a81e1e', pattern: 'chequy', charge: 'none', over: [{ kind: 'fess', c: '#a81e1e' }] }, horse: 'rouncey', armour: 'mail', skill: 0.32, seat: 0.45, drive: 0.72 },
  { id: 'renaud', name: 'Renaud de Roye', short: 'de Roye', land: 'France', arms: { c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'plain', charge: 'none', over: [{ kind: 'bend', c: '#ece8dc' }] }, horse: 'courser', armour: 'bascinet', skill: 0.5, seat: 0.55, drive: 0.95 },
  { id: 'boucicaut', name: 'Jean le Meingre, "Boucicaut"', short: 'Boucicaut', land: 'France', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#a81e1e', pattern: 'plain', charge: 'eagletwo' }, horse: 'destrier', armour: 'bascinet', skill: 0.62, seat: 0.72, drive: 0.85 },
  { id: 'lalaing', name: 'Jacques de Lalaing', short: 'Lalaing', land: 'Burgundy', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#ece8dc', pattern: 'plain', charge: 'lozenge', over: [{ kind: 'ten', c: '#000000' }] }, horse: 'courser', armour: 'milanese', skill: 0.72, seat: 0.7, drive: 0.92 },
  { id: 'quinones', name: 'Suero de Quiñones', short: 'Quiñones', land: 'León', arms: { c1: '#a81e1e', c2: '#1f4691', c3: '#ece8dc', pattern: 'chequy', charge: 'none' }, horse: 'andalusian', armour: 'milanese', skill: 0.78, seat: 0.66, drive: 0.88 },
  { id: 'freydal', name: 'Maximilian, "Freydal"', short: 'Freydal', land: 'Empire', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#191919', pattern: 'plain', charge: 'eagle' }, horse: 'destrier', armour: 'stechzeug', skill: 0.88, seat: 0.9, drive: 0.9, armourTint: 0x30333a },
  // Palman (documented 1333–1356; "Palman of Letinberch", Littenberg in Lower Styria; Latin "Palmanus Teutonicus"), a German knight
  // who captained the German mercenaries (about 300) of Stefan Dušan, King of Serbia (emperor only from 1346). "Bracht" is not in the
  // records (docs/era-atmosphere-research.md). No jousting is recorded for him. His look is the owner's design, researched partly from
  // Paja Jovanović's painting: azure, a cross fleury argent, on shield, jupon and trapper; plate over mail; a flat-topped great helm with a
  // gilt cross over the face, crested with two tall gilt horns, blue and white mantling. Fixed: do not change it without him.
  { id: 'palman', name: 'Palman Bracht', short: 'Palman', land: 'Styria', arms: { c1: '#1f4690', c2: '#1f4690', c3: '#ece8dc', pattern: 'plain', charge: 'crossflory' }, horse: 'destrier', armour: 'bascinet', helm: 'greathelm', crest: 'horns', mantling: true, helmCross: true, skill: 0.74, seat: 0.82, drive: 0.9 },
  { id: 'ulrich', name: 'Ulrich von Liechtenstein', short: 'Liechtenstein', land: 'Styria', arms: { c1: '#ece8dc', c2: '#191919', c3: '#191919', pattern: 'plain', charge: 'none', over: [{ kind: 'bendlets', c: '#191919' }] }, horse: 'destrier', armour: 'mail', skill: 0.8, seat: 0.8, drive: 0.95 },
  { id: 'blackprince', name: 'Edward, the Black Prince', short: 'the Prince', land: 'England', arms: { c1: '#191919', c2: '#191919', c3: '#ece8dc', pattern: 'plain', charge: 'feather', over: [{ kind: 'three', c: '#000000' }] }, horse: 'destrier', armour: 'bascinet', skill: 0.92, seat: 0.88, drive: 0.95 },
];

// The circuit. Each venue re-dresses the lists.
/** "London, England": the place line of a venue, with its modern country (owner, 27 Nov: jousts should have the country). */
export const venuePlace = (V) => V.country ? `${V.city}, ${V.country}` : V.city;
export const VENUES = [
  { id: 'smithfield', sky: 'sunflowers_puresky', zenith: 0x2a66c8, horizon: 0xb4d2f0, sunCol: 0xfff2dc, clouds: 0.55, name: 'Smithfield', city: 'London', country: 'England', year: 1390, host: 'clifford', blurb: 'King Richard\'s great jousts outside the city walls. The stands were built by the King\'s Clerk of Works, one Geoffrey Chaucer.',
    sun: [-0.55, 0.62, -0.45], turbidity: 2.2, rayleigh: 2.2, fog: 0xc4d6e4, grass: '#5b7a36', sand: '#b89a6a', awn: ['#8f1d1d', '#eadfbe'], awn2: ['#1f3f7a', '#eadfbe'], tilt: ['#a3201f', '#efe6cf'], crowd: 1.0, home: -0.15 },
  { id: 'inglevert', sky: 'kloofendal_48d_partly_cloudy_puresky', zenith: 0x2f7bdc, horizon: 0xc6e2f6, sunCol: 0xfff6e6, clouds: 0.42, name: 'Saint-Inglevert', city: 'Calais', country: 'France', year: 1390, host: 'renaud', blurb: 'Three French knights hold the field against all comers for thirty days.',
    sun: [0.35, 0.8, -0.5], turbidity: 1.6, rayleigh: 1.7, fog: 0xcfe0ee, grass: '#6f8a3c', sand: '#cbb383', awn: ['#1f4690', '#e9d27a'], awn2: ['#ece8dc', '#1f4690'], tilt: ['#1f4690', '#e9d27a'], crowd: 0.9, home: -0.3 },
  { id: 'leon', sky: 'qwantani_afternoon_puresky', zenith: 0x2b6fd6, horizon: 0xe6dcc0, sunCol: 0xfff0cf, clouds: 0.22, name: 'Passo Honroso', city: 'Órbigo, León', country: 'Spain', year: 1434, host: 'quinones', blurb: 'Quiñones holds the bridge until three hundred lances are broken.',
    sun: [-0.2, 0.9, 0.35], turbidity: 1.2, rayleigh: 1.3, fog: 0xe2dccb, grass: '#8b8a45', sand: '#d3b57e', awn: ['#b5561c', '#f0e2b6'], awn2: ['#a81e1e', '#e0b83c'], tilt: ['#e0b83c', '#a81e1e'], crowd: 0.95, home: -0.35 },
  { id: 'bruges', sky: 'evening_road_01_puresky', zenith: 0x3c5fae, horizon: 0xf2c596, sunCol: 0xffc98a, clouds: 0.62, name: 'The Golden Tree', city: 'Bruges', country: 'Belgium', year: 1468, host: 'lalaing', blurb: 'The Burgundian court\'s wedding pas d\'armes, the richest tourney in Christendom.',
    sun: [-0.28, 0.4, -0.86], turbidity: 8, rayleigh: 2.4, fog: 0xe6cfb4, grass: '#55733a', sand: '#b3925f', awn: ['#6b2478', '#e0b83c'], awn2: ['#191919', '#e0b83c'], tilt: ['#6b2478', '#e0b83c'], crowd: 1.15, home: -0.4 },
  { id: 'nuremberg', sky: 'kloppenheim_03_puresky', zenith: 0x35629f, horizon: 0xc4d0dc, sunCol: 0xfff0e0, clouds: 0.72, name: 'Gesellenstechen', city: 'Nuremberg', country: 'Germany', year: 1501, host: 'freydal', blurb: 'The patricians\' joust in the market square, before the Emperor himself.',
    sun: [0.5, 0.5, 0.55], turbidity: 3.5, rayleigh: 2.6, fog: 0xc9d2da, grass: '#4f6f39', sand: '#a88d62', awn: ['#191919', '#e0b83c'], awn2: ['#a81e1e', '#ece8dc'], tilt: ['#191919', '#e0b83c'], crowd: 1.2, home: -0.5 },
];

// The training ground (Learn to Joust / the quintain): a meadow at the edge of a camp, no stands and no crowd. Tune it here.
export const TRAINING_GROUND = { id: 'training', training: true, sky: 'kloofendal_48d_partly_cloudy_puresky', zenith: 0x3a80de, horizon: 0xcfe4f4, sunCol: 0xfff4e0, clouds: 0.5, name: 'The Training Ground', city: 'the camp', year: 1390,
  sun: [0.3, 0.6, -0.5], turbidity: 2, rayleigh: 1.8, fog: 0xd4e4ee, grass: '#6a8a3a', sand: '#a88c5e', awn: ['#8f1d1d', '#eadfbe'], awn2: ['#1f3f7a', '#eadfbe'], tilt: ['#8a6e4a', '#8a6e4a'], crowd: 0, home: 0,
  streamX: -22, streamW: 5.5, onlookers: 5, tents: 5, hayBales: 7 };

export const COURSES_PER_MATCH = 5;

export const POINTS = { miss: 0, attaint: 1, broken: 2, helm: 3, unhorse: 5, foulHorse: -3, foulTilt: -1, slow: -1, lanceLow: -1 };

// The kinds of joust: each is a rule set. `points` replaces the cheque above where it differs.
//   tiltPts: what each strike on the barrier costs in turn; tiltOut: how many lose the prize.   horseOut: strikes on a horse that lose the prize.
//   sightWin: this many strokes "in the sight of the helm" (dead centre) take the prize outright.   nearTip: a lance broken within this many
//   metres of the coronel is no spear broken, only a touch.   crosswise: a lance broken at more than this (sine of the angle from square) was
//   broken across, not with the point, and counts as a touch.   onlyShield: only strokes on the shield score.   noExtra: no extra courses.
//   bite / lance / hold / sharp: physics multipliers (how much goes through the point, what the lance carries, what the saddle holds).
//   kit: the equipment the rules fix for BOTH riders (never a purchase), merged over KIT0 by modeKit(); see KIT0 below. kitNote: one plain line of it for the menu card.
// Sources: Tiptoft's Ordinances of 1466 (Harl. MS 69, printed in Cripps-Day 1918, App. IV); the statutes of Alfonso XI's Order of the Band, 1330
// (trans. Fallows 2010). Both are silent on the pace of the horse and on how the lance is driven. The German forms are described, not legislated,
// in the sources read, so their numbers are this game's.
export const MODES = {
  planken: { id: 'planken', name: 'Standard Joust', sub: 'over the tilt', tilt: true, bite: 1, lance: 1, hold: 1, points: {}, tiltPts: [-2], tiltOut: 3, horseOut: 2,
    kit: { shy: 1 }, kitNote: 'Eyes uncovered: a nervous horse may shy in the last strides.',
    blurb: 'The joust as the circuit runs it: a barrier between the riders, coronel lances, and the cheque kept in broken lances. A touch 1, a lance broken 2, broken on the helm 3. The joust over the tilt, which the Germans knew as the Welsches Gestech.' },
  tiptoft: { id: 'tiptoft', name: "Tiptoft's Ordinances", sub: 'England, 1466', tilt: true, bite: 1, lance: 1, hold: 1,
    points: { attaint: 0, broken: 1, helm: 2, unhorse: 3, coronel: 3 }, tiltPts: [-2, -3], tiltOut: 3, horseOut: 1, sightWin: 3, nearTip: 0.3,
    kit: { shy: 1 }, kitNote: 'Eyes uncovered: a nervous horse may shy in the last strides.',
    blurb: 'The rules the Earl of Worcester set down at Windsor for the royal jousts. A spear broken on the body counts one, on the helm two, bearing your man down three. A touch that breaks nothing counts nothing, and a spear broken within a foot of its point is only a touch. Three blows dead in the sight of the helm win the prize. Hit a horse and the prize is lost; the tilt costs two, then three, then the prize.' },
  castile: { id: 'castile', name: 'Statutes of the Band', sub: 'Castile, 1330 · open field', tilt: false, bite: 1, lance: 1, hold: 1,
    points: { attaint: 0, broken: 1, helm: 2, unhorse: 2 }, horseOut: 2, crosswise: 0.6, noExtra: true,
    kit: { cantle: 1.15, lock: 1.15, rest: 0.55, shy: 1 }, kitNote: 'War saddle with high cantle and no lance rest: you stay up, but the blow jars you more and the lance wanders.',
    blurb: 'King Alfonso XI’s rules for his knights of the Band, a century before the tilt, with no rest for the lance yet. Four courses and no more. Only a lance splintered on your man with the point counts; one broken crosswise counts nothing. Knock off his helm and it counts as a second lance. If neither touches the other, both jousted poorly.' },
  // ---- rules-only modes (no equipment or physics change: bite, lance, hold all 1). `own` = the mode words its own verdict, card and Hugh's calls (see main.js).
  sudden: { id: 'sudden', name: 'Sudden Death', sub: 'first blood · over the tilt', tilt: true, bite: 1, lance: 1, hold: 1, own: true,
    points: { attaint: 0, broken: 1, helm: 1, unhorse: 1, lanceLow: 0 }, tiltPts: [-2], tiltOut: 3, horseOut: 2, firstBreak: true, noExtra: true, pickCourses: true,
    blurb: 'The first lance broken wins the joust, and so does bearing your man down. A touch counts for nothing. If no lance breaks in all your courses, the joust is void and no purse is paid.' },
  judged: { id: 'judged', name: 'Judged Tilt', sub: 'Tudor style · over the tilt', tilt: true, bite: 1, lance: 1, hold: 1, own: true, style: true,
    points: { attaint: 0, broken: 1, helm: 2, unhorse: 3 }, tiltPts: [-2], tiltOut: 3, horseOut: 2, noExtra: true, fixedCourses: 6,
    blurb: 'Six courses, scored on a card: a lance broken on the body one, on the helm two. The judges add a point for a steady lance and one for raising it in good time, and take one for a lance left low. A level card goes to the man with fewer faults.' },
  bridge: { id: 'bridge', name: 'Keep the Bridge', sub: "pas d'armes style · over the tilt", tilt: true, bite: 1, lance: 1, hold: 1, own: true, bridge: true,
    points: {}, tiltPts: [-2], tiltOut: 3, horseOut: 2, fixedCourses: 3,
    blurb: 'Three challengers come one after another, each stronger than the last, three courses apiece on the Standard cheque. Your wind, your horse and your harness are not mended between bouts. Win two to hold the bridge.' },
  gestech: { id: 'gestech', name: 'Deutsches Gestech', sub: 'Germany · open field', tilt: false, bite: 1, lance: 1, hold: 1, points: { helm: 2, unhorse: 6 }, horseOut: 2,
    kit: { cantle: 0.78, lock: 0.85, queue: true, blind: true, shieldCatch: 6, bolted: true, sack: true },
    kitNote: 'Low saddle: you fall more easily, but less of the blow goes into you. Bolted helm, padded sack over the thighs, blinkered horse.',
    blurb: 'The old German joust of peace. No barrier: you pass left side to left side in the open, in a low saddle with a padded sack across the horse’s chest to guard your legs. Hollow coronel lances, a bolted frog-mouth helm and a hollow target on the breast. Breaking the lance or bearing your man down is the whole of it, and falls are common.' },
  rennen: { id: 'rennen', name: 'Scharfrennen', sub: 'Germany · open field, solid lances', tilt: false, sharp: true, bite: 1.2, lance: 1.6, hold: 1, points: { attaint: 1, broken: 1, helm: 0, unhorse: 6 }, onlyShield: true, horseOut: 2,
    kit: { cantle: 0.8, lock: 0.85, queue: true, blind: true, lanceKgMin: 8.5, sharpJ: 0.6, shieldTall: 1.3, spring: 0.45 },
    kitNote: 'Heavy solid lance, tall shield that springs away when struck square, blinkered horse. A glancing touch does not unseat.',
    blurb: 'The joust of war. Solid lances with a blunted point that seldom break, and a saddle with little back to it. The mark is a tall shield that springs away from the arm when struck square: that is your point, and nothing else scores. Put him on the ground and you win.' },
};
// ---- Equipment fixed by the type of joust (the same for both riders; nothing here is bought). Merged over KIT0 by modeKit(); the defaults leave the
// physics exactly as it was for the Standard tilt, so a mode with no `kit` plays as before. Sources and the reasoning: docs/joust-kit-research.md.
//   cantle: how far back he can be bent before he goes over (x the unhorse threshold).   lock: how firmly the saddle holds him: a held man is thrown less
//     (x theta) but the blow goes into his wind and arm instead, and the lance arm kicks harder.   rest: the lance rest's cap on coupling (1 = full rest; Castile 1330 has none).
//   queue: the hook on the breastplate carries the lance's weight (arm tires slower).   lanceKgMin: the type's lance is at least this heavy (kg).
//   sharpJ: a sharp point only unseats a man if the blow carries at least this share of PHYS.refJ.   shieldCatch: degrees the shield's glance limit is more forgiving (concave Stechtartsche).
//   shieldTall: the shield's height scale (Renntartsche).   spring: the shield flies off a square, hard stroke at this share of refJ (and it is the score).
//   blind: the horse's eyes are covered: it keeps its line and never shies.   shy: chance scale for an open-eyed horse to shy in the last strides (0 = never).
//   bolted: Stechhelm bolted to the cuirass (the head is not snapped back; the slit sits high, so lift your head at the last moment).   sack: the thighs are covered: a stroke there is soft and counts for nothing.
export const KIT0 = { cantle: 1, lock: 1, rest: 1, queue: false, lanceKgMin: 0, sharpJ: 0, shieldCatch: 0, shieldTall: 1, spring: 0, blind: false, shy: 0, bolted: false, sack: false };
// Kept for later: the high, locked Hohenzeug saddle (Freydal: unhorsing "nearly impossible"; only broken lances score). No mode uses it yet.
export const KIT_HOHENZEUG = { cantle: 1.6, lock: 1.8, queue: true, blind: true, bolted: true, sack: true, shieldCatch: 6 };
export const modeKit = (mode) => Object.assign({}, KIT0, mode && mode.kit);
// Off (0). Set to e.g. 0.9 to mark a course against a rider who meets at less than that share of the canter or checks his horse in the last strides.
// It is not a rule found in the medieval cheques, and a slow horse already pays for it in the shock, so it is left out.
export const SLOW_PACE = 0;
// The quintain. A struck board sets the arm turning at spin + spinPerPower x (how full the stroke was) radians a second: about four-fifths of a turn
// a second, so the sandbag comes about to where you struck from in roughly 0.7 s. At a canter or better you are gone; at a trot it finds your back.
export const QUINTAIN = { spin: 4.8, spinPerPower: 0.6, drag: 0.55, bagArm: 2.55, bagDrop: 0.45, reach: 0.6, bagPoints: -1 };
export const LANCE_UP = { grace: 1.0, quick: 0.45 };   // real seconds after your stroke (the moment is slowed): raise the lance within `quick` and the gallery marks it; still low after `grace` and it is a fault

export const CAPARISONS = {
  livery: { id: 'livery', name: 'Livery Caparison', blurb: 'Full cloth in your colours and arms, front piece and crupper.', price: 0 },
  plain: { id: 'plain', name: 'Plain Cloth', blurb: 'One colour, no charges.', price: 15 },
  half: { id: 'half', name: 'Crupper Only', blurb: 'Cloth over the hindquarters; the chest and legs bare, as in the German jousts.', price: 10 },
  none: { id: 'none', name: 'Bare Horse', blurb: 'Saddle and harness only.', price: 0 },
};

export const DEFAULT_PROFILE = {
  name: 'Sir Nameless', named: false, arms: { c1: '#1f4690', c2: '#e0b83c', c3: '#ece8dc', pattern: 'chevron', charge: 'cross' },
  horse: 'rouncey', armour: 'mail', helm: 'greathelm', lance: 'standard', venue: 0, table: null, firstPerson: false, bond: {},
  caparison: 'livery', gold: 60, owned: { horses: ['rouncey'], armours: ['mail'], helms: ['greathelm'], caparisons: ['livery', 'none'] }, difficulty: 1, herald: true, celebs: [], arts: {}, lesson: 0,
  renown: 0, skills: {}, retinue: { squire: 1 }, courses: 5,
  body: { sex: 'm', h: 1.73, build: 'medium', face: 0, skin: 1, hair: 1 },      // the knight's body (src/body_types.js): drawn only, it changes nothing in play
  achievements: {}, stats: {},      // achievements: id -> date earned; stats: running counts for them (see src/achievements.js)
};

export const ovr = (k) => Math.round(58 + 38 * (0.5 * k.skill + 0.3 * k.seat + 0.2 * k.drive));
export const BOND_NAMES = ['', 'I', 'II', 'III', 'IV'];
export const bondLevel = (xp) => Math.min(4, 1 + Math.floor((xp || 0) / 4));
/** A horse grows steadier and bolder the more courses you run together. */
export function bondedHorse(h, xp) { const l = bondLevel(xp) - 1; return Object.assign({}, h, { nerve: Math.min(1, h.nerve + 0.07 * l), steady: Math.min(1, h.steady + 0.05 * l), accel: h.accel * (1 + 0.03 * l) }); }

// Duarte of Portugal: do not bear a lance too heavy for your strength.
export const LANCES = {
  light: { id: 'light', name: 'Light lance', blurb: 'Hollow-fluted fir, turned by a lance-maker and painted at both ends. Lances were bought by the dozen.', blurbStats: 'Hollow-fluted fir. Easy on the arm and quick to the mark, but a soft shock.', power: 0.88, sway: 0.8, fatigue: 0.55, scale: 0.86 },
  standard: { id: 'standard', name: 'Tourney lance', blurb: 'Solid fir with a three-pronged coronel. The lance of the lists, as the rule books describe it.', blurbStats: 'Solid fir with a three-pronged coronel. The honest measure.', power: 1.0, sway: 1.0, fatigue: 1.0, scale: 1.0 },
  heavy: { id: 'heavy', name: 'Great lance', blurb: 'A long lance of ash, the kind the chronicles call a beam. A fine thing to see carried.', blurbStats: 'A beam of ash. Brutal in the shock, if your arm can hold it true.', power: 1.15, sway: 1.28, fatigue: 1.7, scale: 1.16 },
};
export const DIFFICULTY = [
  { name: 'Squire', sway: 0.8, ai: -0.12, zone: 1.12 },
  { name: 'Knight', sway: 1.25, ai: 0.05, zone: 0.9 },
  { name: 'Champion', sway: 1.55, ai: 0.12, zone: 0.8 },
];
export const purse = (vIdx, result, circuit) => { const base = circuit ? 90 + 45 * vIdx : 35; return result.startsWith('win') ? base + (result === 'win-unhorse' && !circuit ? 30 : 0) : result === 'draw' ? Math.round(base / 2) : result === 'practice' ? 0 : Math.round(base / 5); };

// ---------------------------------------------------------------------------------------------------------
// The purse. All money is in marks (shown to the player as coins); economy.js turns a finished match into a ledger using only these numbers.
export const ECON = {
  entry: [15, 10],                                   // circuit entry fee: first venue, and how much more at each venue after
  lance: { light: 2, standard: 3, heavy: 5 },        // each lance you break is yours to pay for (reckon() scales this down in matches longer than four courses)
  retinue: 8,                                        // squires, grooms and lodging for one circuit tourney
  keep: { destrier: 6, courser: 4, andalusian: 3, rouncey: 1 },   // stabling and fodder for one circuit tourney
  worth: { horse: 60, armour: 40, helm: 15 },        // what a horse, harness or helm with no price is reckoned at
  repair: 0.14,                                      // share of the harness's worth to mend it from wrecked
  leech: 18,                                         // the horse-leech, for a horse brought back lame
  ransom: 0.2,                                       // an unhorsed knight redeems horse and harness for this share of their worth (circuit only)
  debtCap: 150,                                      // the moneylenders will carry you no deeper than this
  giftPerFavour: 40,                                 // the gallery's gift at full favour
};
export const harnessWorth = (armourId, helmId) => (ARMOURS[armourId].price || ECON.worth.armour) + ((HELMS[helmId] || HELMS[ARMOURS[armourId].helm]).price || ECON.worth.helm);
export const worthOf = (horseId, armourId, helmId) => (HORSES[horseId].price || ECON.worth.horse) + harnessWorth(armourId, helmId);
export const entryFee = (vIdx) => ECON.entry[0] + ECON.entry[1] * vIdx;

// Your retinue. The squire is yours from the start; the others are hired once and then draw a wage at every circuit tourney.
// The numbers after `wage` are what each one changes (read in main.js and economy.js through menFx). `add` lists the numbers that grow with
// training; `mul` lists the multipliers (their distance from 1 grows). Each man in profile.retinue is { name, trait, level } (level 1..3).
export const RETINUE = {
  squire:     { name: 'Squire', role: 'Arms you, and waits at the end of the lists with a fresh lance after every course.', hire: 0, wage: 0, cap: 'cap' },
  groom:      { name: 'Groom', role: 'Walks and waters your horse between courses: he gets more of his wind back and stands quieter.', hire: 30, wage: 3, stamina: 0.12, calm: 0.07, add: ['stamina', 'calm'], cap: 'flat' },
  armourer:   { name: 'Armourer', role: 'Knocks out the dents between courses, and mends your harness afterwards at half price.', hire: 60, wage: 5, mend: 0.07, repair: 0.5, add: ['mend'], mul: ['repair'], cap: 'coif' },
  farrier:    { name: 'Farrier', role: 'Shoes and doctors your horse: his hurts ease between courses and the horse-leech costs far less.', hire: 25, wage: 2, heal: 0.06, leech: 0.4, add: ['heal'], mul: ['leech'], cap: 'hood' },
  pursuivant: { name: 'Pursuivant', role: 'A herald of your own to shout your name and your deeds: a warmer welcome from the stands and more renown.', hire: 50, wage: 4, welcome: 0.1, renown: 1.15, add: ['welcome'], mul: ['renown'], cap: 'herald' },
};
// Training: a man can be trained from level 1 to 2 and from 2 to 3. The price is a share of his hire price (the squire has no effect to train),
// each level adds this share of his base effect, and his wage rises by one mark a level.
export const RETINUE_UP = { cost: [0.6, 1.2], effect: 0.4, wage: 1, max: 3 };
export const trainCost = (id, rec) => (rec && rec.level < RETINUE_UP.max && RETINUE[id].add ? Math.round(RETINUE[id].hire * RETINUE_UP.cost[rec.level - 1]) : 0);
// Personalities. Each is a plain line and small numbers: calm / rest (extra wind back each course) / welcome are summed over the whole retinue,
// wage is his own, late is his own chance, at each course, of being absent (his effects are skipped that course).
export const TRAITS = {
  steady:   { name: 'Steady', text: 'Cool in a crowd: your horse settles a little more between courses.', calm: 0.03, color: '#4d7ea8' },
  quick:    { name: 'Quick', text: 'Quick on his feet: your horse gets a little more wind back each course.', rest: 0.05, color: '#c28a2b' },
  thrifty:  { name: 'Thrifty', text: 'Haggles over every penny: his wage is 1 coin less.', wage: -1, color: '#5f8e4c' },
  boastful: { name: 'Boastful', text: 'Shouts your name to the stands: a warmer welcome, but he wants 1 coin more.', welcome: 0.04, wage: 1, color: '#a8361f' },
  devout:   { name: 'Devout', text: 'Prays before every course. It can\'t hurt.', color: '#7b5c9c' },
  drinker:  { name: 'Drinker', text: 'Good company, but one course in six he turns up late and the work isn\'t done.', late: 1 / 6, color: '#8c5e30' },
};
// Names: a given name and a byname, by country of origin. A byname written {role} becomes "the Groom" and so on.
export const NAME_POOL = [
  { land: 'England', first: ['Wat', 'Hob', 'Jack', 'Hankin', 'Tom', 'Robin', 'Ralf', 'Gib'], by: ['of Ely', 'of York', 'Fletcher', 'atte Wode', 'the {role}', 'of Bath', 'Miller'] },
  { land: 'France', first: ['Jehan', 'Guillaume', 'Perrin', 'Colin', 'Huguet', 'Gautier', 'Thibaut', 'Mahiet'], by: ['Morel', 'de Rouen', 'le Roux', 'Lombart', 'de Tours', 'Brun', 'le {role}'] },
  { land: 'Burgundy', first: ['Philibert', 'Hennequin', 'Jacquot', 'Antoine', 'Gérard', 'Olivier', 'Simon', 'Lambert'], by: ['de Dijon', 'van Gent', 'Charolais', 'de Bruges', 'Le Maire', 'du Pont', 'le {role}'] },
  { land: 'Spain', first: ['Pedro', 'Diego', 'Martín', 'Alonso', 'Gonzalo', 'Rodrigo', 'Íñigo', 'Fernán'], by: ['de León', 'de Burgos', 'el Mozo', 'de Toledo', 'Ruiz', 'de Soria', 'el {role}'] },
  { land: 'Germany', first: ['Hans', 'Conz', 'Heinz', 'Ulrich', 'Veit', 'Peter', 'Kunz', 'Götz'], by: ['von Nürnberg', 'Schmid', 'aus Ulm', 'Reiter', 'von Bamberg', 'Wagner', 'der {role}'] },
];
/** A new man for this post: a name nobody on your payroll has, one trait, level 1. `taken` is a list of names to avoid. */
export function newMan(id, taken = [], rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  let name = '';
  for (let i = 0; i < 30; i++) { const p = pick(NAME_POOL); name = pick(p.first) + ' ' + pick(p.by).replace('{role}', RETINUE[id].name); if (!taken.includes(name)) break; }
  return { name, trait: pick(Object.keys(TRAITS)), level: 1 };
}
/** Make sure every man in profile.retinue is a full record (saves from before names kept a plain 1). */
export function fixRetinue(p) {
  if (!p.retinue || typeof p.retinue !== 'object') p.retinue = {};
  if (!p.retinue.squire) p.retinue.squire = 1;
  for (const id of Object.keys(p.retinue)) {
    const r = p.retinue[id];
    if (!RETINUE[id]) { delete p.retinue[id]; continue; }
    if (!r || typeof r !== 'object' || !r.name) p.retinue[id] = newMan(id, Object.values(p.retinue).map(x => x && x.name));
    else { if (!TRAITS[r.trait]) r.trait = 'devout'; r.level = Math.max(1, Math.min(RETINUE_UP.max, r.level | 0 || 1)); }
  }
  return p.retinue;
}
/** His wage at a circuit tourney: the base, one more for each level of training, and his temper. */
export const wageOf = (id, rec) => { const r = RETINUE[id]; if (!r.wage) return 0; const l = rec && rec.level ? rec.level : 1; return Math.max(1, r.wage + RETINUE_UP.wage * (l - 1) + ((rec && TRAITS[rec.trait] && TRAITS[rec.trait].wage) || 0)); };
/** His numbers at his level: the post's base effect, grown by training. A plain 1 (an old save) counts as level 1. */
export function menFx(id, rec) {
  const r = RETINUE[id], s = 1 + RETINUE_UP.effect * ((rec && rec.level ? rec.level : 1) - 1), o = Object.assign({}, r);
  for (const k of r.add || []) o[k] = r[k] * s;
  for (const k of r.mul || []) o[k] = Math.max(0.1, 1 + (r[k] - 1) * s);
  return o;
}
// What the rest between courses gives back. A long match must stay rideable: over ten courses the horse's wind and your harness would
// otherwise run down, so the rest grows with the length of the match (4 courses or fewer: as before).
export const REST = { stamina: 0.4, longStamina: 0.22, body: 0.03, from: 4, span: 6 };
export const restShare = (courses) => Math.max(0, Math.min(1, (courses - REST.from) / REST.span));

// Renown: every match earns some, and each new rank gives one skill to learn.
export const RANKS = [
  { name: 'Squire', at: 0 }, { name: 'Bachelor Knight', at: 50 }, { name: 'Knight of the Lists', at: 130 }, { name: 'Knight Banneret', at: 240 },
  { name: 'Champion', at: 380 }, { name: 'Paragon', at: 560 }, { name: 'Flower of Chivalry', at: 800 },
];
export const RENOWN = { win: 30, perVenue: 8, draw: 14, loss: 6, lance: 4, helm: 5, unhorse: 14, exhibition: 0.5, favour: 10 };
export const rankOf = (renown) => { let i = 0; while (i + 1 < RANKS.length && (renown || 0) >= RANKS[i + 1].at) i++; return i; };
export const skillPoints = (p) => rankOf(p.renown) - Object.keys(p.skills || {}).length;
// Skills. The numbers are what the game reads; the text is what the player is told.
export const SKILLS = {
  burst:    { name: 'The Spur', text: 'Once in a course, press SHIFT at the gallop and your horse surges for a few strides. It costs him wind.', speed: 1.14, time: 1.6, stamina: 0.22, accel: 2.2 },
  shield:   { name: 'Shield Hand', text: 'Your shield comes up faster, spoils your aim less, and turns a stroke over a longer instant.', rate: 15, window: 0.62, sway: 0.12 },
  seat:     { name: 'Iron Seat', text: 'You sit deeper in the saddle. It takes a harder blow to put you on the sand.', seat: 0.95 },
  arm:      { name: 'Strong Arm', text: 'The couched lance wanders less and your arm tires later.', sway: 0.86, hold: 1.5 },
  nerve:    { name: 'Cold Blood', text: 'Your nerve lasts longer when you steady yourself, and comes back faster between courses.', drain: 0.27, refill: 0.2 },
  hands:    { name: 'Light Hands', text: 'The stride is easier to ride in time, and your horse spends less wind at the gallop.', window: 0.27, stamina: 0.82, fret: 0.04 },
  largesse: { name: 'Largesse', text: 'The gallery gives more freely, and every joust adds more to your name.', gift: 1.6, renown: 1.25 },
};

// Real medieval arms the blazon set can draw honestly (the note says where one is simplified).
export const HISTORIC_ARMS = [
  { name: 'Scrope', note: 'Azure, a bend or — fought over in the Court of Chivalry, 1389', arms: { c1: '#1f4690', c2: '#e0b83c', c3: '#e0b83c', pattern: 'plain', charge: 'none', over: [{ kind: 'bend', c: '#e0b83c' }] } },
  { name: 'Austria', note: 'Gules, a fess argent', arms: { c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'plain', charge: 'none', over: [{ kind: 'fess', c: '#ece8dc' }] } },
  { name: 'Aragon', note: 'Or, four pallets gules (drawn paly of six)', arms: { c1: '#e0b83c', c2: '#a81e1e', c3: '#a81e1e', pattern: 'paly', charge: 'none' } },
  { name: 'Stafford', note: 'Or, a chevron gules', arms: { c1: '#e0b83c', c2: '#a81e1e', c3: '#a81e1e', pattern: 'plain', charge: 'none', over: [{ kind: 'chevron', c: '#a81e1e' }] } },
  { name: 'St George', note: 'Argent, a cross gules', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#a81e1e', pattern: 'plain', charge: 'none', over: [{ kind: 'cross', c: '#a81e1e' }] } },
  { name: 'Savoy', note: 'Gules, a cross argent — also borne by the Hospitallers', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#ece8dc', pattern: 'plain', charge: 'none', over: [{ kind: 'cross', c: '#ece8dc' }] } },
  { name: 'France ancient', note: 'Azure, semé of fleurs-de-lis or', arms: { c1: '#1f4690', c2: '#1f4690', c3: '#e0b83c', pattern: 'plain', charge: 'fleur', over: [{ kind: 'semy', c: '#000000' }] } },
  { name: 'France modern', note: 'Azure, three fleurs-de-lis or', arms: { c1: '#1f4690', c2: '#1f4690', c3: '#e0b83c', pattern: 'plain', charge: 'fleur', over: [{ kind: 'three', c: '#000000' }] } },
  { name: 'England', note: 'Gules, three lions passant guardant or (drawn two and one; the arms set them in pale)', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#e0b83c', pattern: 'plain', charge: 'leopard', over: [{ kind: 'three', c: '#000000' }] } },
  { name: 'Scotland', note: 'Or, a lion rampant gules (the royal tressure left off)', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#a81e1e', pattern: 'plain', charge: 'lion' } },
  { name: 'Flanders', note: 'Or, a lion rampant sable', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#191919', pattern: 'plain', charge: 'lion' } },
  { name: 'León', note: 'Argent, a lion rampant purpure', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#6b2478', pattern: 'plain', charge: 'lion' } },
  { name: 'Bohemia', note: 'Gules, a lion rampant argent (the forked tail and crown left off)', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#ece8dc', pattern: 'plain', charge: 'lion' } },
  { name: 'Empire', note: 'Or, an eagle displayed sable', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#191919', pattern: 'plain', charge: 'eagle' } },
  { name: 'Brandenburg', note: 'Argent, an eagle displayed gules', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#a81e1e', pattern: 'plain', charge: 'eagle' } },
  { name: 'Castile', note: 'Gules, a castle or', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#e0b83c', pattern: 'plain', charge: 'tower' } },
  { name: 'Brittany', note: 'Ermine plain', arms: { c1: '#ece8dd', c2: '#ece8dd', c3: '#191919', pattern: 'plain', charge: 'none' } },
  { name: 'Beauchamp', note: 'Gules, a fess between six cross-crosslets or (three drawn)', arms: { c1: '#a81e1e', c2: '#e0b83c', c3: '#e0b83c', pattern: 'plain', charge: 'crosscrosslet', over: [{ kind: 'fess', c: '#e0b83c' }, { kind: 'three', c: '#000000' }] } },
  { name: 'Hohenzollern', note: 'Quarterly argent and sable', arms: { c1: '#ece8dc', c2: '#191919', c3: '#191919', pattern: 'quarterly', charge: 'none' } },
  { name: 'Bavaria', note: 'Lozengy argent and azure (the lozenges drawn upright, not bendwise)', arms: { c1: '#ece8dc', c2: '#1f4690', c3: '#1f4690', pattern: 'lozengy', charge: 'none' } },
  { name: 'Teutonic Order', note: 'Argent, a cross sable', arms: { c1: '#ece8dc', c2: '#ece8dc', c3: '#191919', pattern: 'plain', charge: 'none', over: [{ kind: 'cross', c: '#191919' }] } },
  { name: 'Neville', note: 'Gules, a saltire argent', arms: { c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'plain', charge: 'none', over: [{ kind: 'saltire', c: '#ece8dc' }] } },
  { name: 'Clare', note: 'Or, three chevronels gules', arms: { c1: '#e0b83c', c2: '#a81e1e', c3: '#a81e1e', pattern: 'plain', charge: 'none', over: [{ kind: 'chevronels', c: '#a81e1e' }] } },
  { name: 'Warenne', note: 'Checky or and azure', arms: { c1: '#e0b83c', c2: '#1f4690', c3: '#1f4690', pattern: 'chequy', charge: 'none' } },
  { name: 'Albret', note: 'Gules plain', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#a81e1e', pattern: 'plain', charge: 'none' } },
  { name: 'Waldeck', note: 'Or, a star sable (the arms bear it of eight points)', arms: { c1: '#e0b83c', c2: '#e0b83c', c3: '#191919', pattern: 'plain', charge: 'mullet' } },
  { name: 'Serbia', note: 'Gules, a double-headed eagle displayed argent (the Nemanjić arms; the crowns left off)', arms: { c1: '#a81e1e', c2: '#a81e1e', c3: '#ece8dc', pattern: 'plain', charge: 'eagletwo' } },
];

export const DISCOVERY_SECONDS = 10;   // how long an "art discovered" notice stays on screen
// Hidden arts: not explained anywhere until the rider stumbles on them.
export const ARTS = {
  clock:    { name: 'The Clock-Weight', text: 'Lower the lance so late that it settles in the rest only a heartbeat before the shock. The blow lands harder, and he has no time to read it.' },
  inhand:   { name: 'In Hand', text: 'Spur in time with the stride until the horse is collected under you. A collected horse carries the shock true.' },
  shave:    { name: 'Shaving the Tilt', text: 'Ride so close that your knee brushes the barrier. The nearer the tilt, the shorter the reach and the heavier the blow, as long as you don\'t hit it.' },
  drive:    { name: 'The Drive', text: 'Hold him at the canter and ask for the gallop only in the last strides, so he is still surging when the lances meet.' },
  sight:    { name: 'The Sight of the Helm', text: 'Hit the helm dead on the sight and the lance will always break.' },
  turn:     { name: 'Turning the Stroke', text: 'Raise your shield at the last instant and his point glances off without breaking.' },
  courtesy: { name: 'Courtesy', text: 'Salute the knight you have unhorsed. The gallery never forgets it.' },
};

// The tiltyard: one thing at a time.
export const LESSONS = [
  { title: 'The Gaits', goal: 'Bring your horse up to a gallop and ride the length of the tilt.', steps: [['Tap W to walk', 't1'], ['Tap W again to trot', 't2'], ['Again to canter', 't3'], ['Again to gallop', 't4']], note: 'Each tap of W makes the horse go one step faster. Hold S to slow him down.' },
  { title: 'The Lance', goal: 'Lower your lance and have it set in the rest before you pass the quintain.', steps: [['Reach a gallop', 't4'], ['Hold LEFT MOUSE to lower the lance', 'couch'], ['Keep it down until it reads COUCHED · SET', 'set']], note: 'Start lowering when the counter says about 3 strides. Too early and your arm gets tired and shaky; too late and the lance is still wobbling when you arrive.' },
  { title: 'The Mark', goal: 'Strike the painted shield of the quintain.', steps: [['Gallop and couch your lance', 'set'], ['Move the mouse so the ring sits on the shield', 'onmark'], ['Strike it', 'hit']], note: 'Watch the ring, not the mouse pointer. The ring is where your lance will actually hit.' },
  { title: 'The Shock', goal: 'Hit the shield and thrust (SPACE) at the moment you hit.', steps: [['Couch and aim', 'set'], ['Press SPACE just before you hit, to thrust', 'brace'], ['Strike the shield', 'hit']], note: 'Press SPACE just before you hit, not earlier. The thrust only lasts a moment; press too soon and it is over before the lance lands.' },
  { title: 'The Full Course', goal: 'Break your lance on the quintain at the full gallop.', steps: [['Gallop', 't4'], ['Lower late, set the lance', 'set'], ['Thrust (SPACE)', 'brace'], ['Break the lance', 'broke']], note: 'The lance only breaks if you are going fast (a gallop) and you hit the middle of the shield straight on. After the hit, keep riding fast. If you slow down, the sandbag swings round and hits you in the back.' },
];

// ---------------------------------------------------------------------------------------------------------
// Physical constants (SI). The lance and the shock are simulated from these; see physics.js.
export const PHYS = {
  riderKg: 78,
  horseKg: { destrier: 620, courser: 520, andalusian: 500, rouncey: 450 },
  armourKg: { mail: 20, bascinet: 27, milanese: 30, stechzeug: 45 },
  // Williams, Edge & Capwell (2016) measured 90-200 J from a couched lance without a rest and about 250 J with one.
  // failN: the load (N) at which the shaft fails end-on (Euler buckling of a fir or ash pole, about 2.45 m between the rest and the point, cut down
  // by the hollowing and fluting that made a tournament lance break; see docs/physics-model.md). breakJ: the old energy cap (impactLegacy only).
  lance: { light: { kg: 3.5, breakJ: 190, failN: 5000 }, standard: { kg: 5.5, breakJ: 260, failN: 6500 }, heavy: { kg: 8, breakJ: 340, failN: 8800 } },
  refJ: 250,            // a standard lance broken square from the rest: the yardstick for "a full stroke"
  pointShare: 0.092,     // share of the collision energy that can pass through the lance point
  zoneShare: { helm: 0.9, shield: 1.0, body: 0.95, horse: 0.8 },
  zoneLever: { helm: 0.72, shield: 0.42, body: 0.34 },   // metres above the seat
  upperKg: 46, upperInertia: 5.5,                         // rider's trunk, head and arms about the hips (kg, kg·m²); harness adds 0.2 kg·m² per kg
  seatK: 2000, braceK: 3900,                               // N·m/rad holding the rider upright: loose seat, and leaning in
  seatMax: 0.7,                                           // lean (rad) past which he cannot recover and goes over the cantle
  // How the rigged rider rides the horse (rider_rig.js rideStep). The saddle (the horse's seat height `bob`, body pitch, a synthetic sway) drives a chain of damped followers,
  // hips -> spine -> spine1 -> chest -> neck -> head, each following the one below it (z'' = w^2 (in - z) - 2 zeta w z'). The torso therefore lags and overshoots a little each stride,
  // and the head, further up, lags more. What each stage lags BEHIND its parent is turned into bone rotation: the spine bends, the helm nods. It is an additive layer on the poses; the
  // puppet drivers (hit reactions, lean) are untouched. Walk to gallop comes from the horse's own bob and pitch growing with the gait; `walk` scales only the synthetic sway.
  // To set from measured footage: amplitude of the helm's vertical bob (m) ~ the saddle's bob x (1 - lag): raise `spineY`/`headY` until the head bob matches; phase delay of the head is set by
  // `chain` (lower w = later); tip wobble `tipY` is the lance tip's cm of vertical travel per metre the hand moves.
  ride: {
    on: 1,                 // master scale: 0 = the old rigid seat, 1 = as tuned, 1.5 = a man who is riding badly
    walk: 0.25,            // share of the synthetic side sway and roll that is left at the walk (at the gallop all of it); the horse's own bob grows with the gait by itself
    chain: [[50, 0.9], [32, 0.9], [26, 0.9], [20, 0.9], [16, 0.95], [13, 0.95]],   // [w rad/s, zeta] of: hips, spine, spine1, chest, neck, head. Lower w = more lag; lower zeta = more ring
    absorb: 0.55,          // share of the saddle's up-and-down (about its mean) that the spine takes up: the helm bobs this much less than the saddle (0 = the trunk rides it rigidly)
    hipY: 0.9, hipX: 0.9,  // the pelvis's give relative to the saddle (m per m): a little, he is sitting in a high cantle
    spineY: 0.5,            // rad of forward flex per metre a stage's vertical lag (a torso sinking into the pelvis slumps, one stretching up arches)
    spineP: 0.3,           // rad per rad of the saddle's pitch that a stage lags (the torso stays level while the horse rocks under it)
    spineR: 0.3, spineX: 0.15,   // roll (rad) per metre of sideways lag and per radian of roll lag
    headY: 0.5, headP: 0.3,     // extra of the head's nod, over the chest's (the helmet nods with a phase delay; 0 = a head nailed to the shoulders)
    sway: 0.008, roll: 0.012, yaw: 0.012,   // synthetic saddle motion at full gallop: sideways (m), roll (rad), twist of the pelvis (rad), once per stride
    surgeW: 8, surgeZ: 0.5, surgeK: 0.08, surgeMax: 0.16,   // jolt at the start and the stop: w and zeta of the follower on ground speed; rad of trunk pitch per m/s of lag (back on starting, forward on stopping)
    legF: 2.5, legSwing: 1.4, legSide: 1.2,    // legs: thigh flex (rad) per metre of the pelvis's vertical give; shin fore-aft swing (rad) per rad of pitch lag; sideways rad per metre of sway lag
    tipW: 20, tipZ: 0.16, tipY: 0.6, tipX: 0.33,      // (tipY 0.9 -> 0.6, tipX 0.5 -> 0.33: less shake for playability (owner, 27 Nov))    // couched lance, a heavy beam: bending w (rad/s) and zeta; the tip's travel (m) per metre the hand moves up/down and sideways
    // PENDING PLAYTEST: aimTip is the VISIBLE stride bob of the lance tip (m of tip travel, amplitude; with the chain's own ~8 cm it gives about 40 cm p-p at full gallop, as filmed). Only `aimShare` of it
    // (strike tip about 35% of the visible bob p-p) perturbs the aim: Jouster.tipWorld (what every strike reads) turns the tip back by the rest. Raise aimShare to make the bob matter more; 0 = pure show.
    aimTip: 0.12,      // 0.18: less shake for playability (owner, 27 Nov)
    aimShare: 0.12,    // 0.23: less shake for playability (owner, 27 Nov)      // measured with tools/ride_probe.js meas(10.5,1): visible tip 40.5 cm p-p, strike tip 14 cm p-p (35%) with the chain's own 8 cm included
    shW: 16, shZ: 0.22, shK: 0.5,      // (shK 0.8 -> 0.5: less shake for playability (owner, 27 Nov))
    //    // the shield arm: w, zeta, and how much of the chest's motion it adds as shake
    // The horse's BODY under the rider (Jouster._horseMotion): film (docs/mocap-findings.md) shows the rider sits still on the horse (helm 4.9 cm p-p against the poll, torso 1.4 deg) and the
    // visible 'jumping about' is the horse pitching (14 deg p-p, 2.3-2.5 Hz) and rolling (7 deg p-p) under him. Added on the body and the model about a point near the girth, once per
    // stride (roll partly at half the stride), scaled walk -> canter -> gallop. The clip's own pitch (about 6 deg p-p) is already in the total.
    synth: 0.1,            // share kept of the old synthetic posting (3.5 cm) and torso rock (1.7 deg) of the rigged rider: the chain and the horse's body give the motion now
    horseFollow: 1.0,      // the saddle (tack, cloth, rider) turns with the clip's own back line (croup to withers, ~12 deg p-p at the gallop); the skin already shows it. 0 = the old level saddle
    horsePitch: 0.009,     // rad amplitude of extra pitch at the gallop on skin and saddle alike, over that (toned down ~25% for comfort (owner, 27 Nov); was 0.012)
    horseRoll: 0.048,      // rad amplitude of the roll at the gallop (toned down ~25% for comfort (owner, 27 Nov); was 0.063)
    horsePivot: [0.0, 0.62, 0.25],   // the point (x, y as a share of the horse's withers height, z m) the body turns about: near the centre of mass, so the hooves stay put
    horseWalk: 0.14,       // share of it left at the walk (the canter, halfway up the gait, gets about 0.55)
    horsePhase: [2.6, 0.9, 0.4],     // phase (rad, of the stride cycle) of the pitch, the roll once per stride, the roll once per two strides
    // The camera gets a share of that body motion (smoothed): 0 = a locked camera, 1 = bolted to the saddle. Too much makes the chase view sick-making.
    camShare: 0.25, camDamp: 9,   // camShare toned down for comfort (owner, 27 Nov); was 0.4. The camera following the horse's pitch and roll was the main nausea source
  },
  // The angle of the stroke. A point that meets a surface more obliquely than this many degrees from square skids instead of biting
  // (a three-pronged coronel grips less well than a sharp point). zone values shift that limit; a helm's own `deflect` lowers it further.
  // slide: how far the skidding point travels (m) - it may land on the next thing along.  keep: share of the blow a pure glance still delivers.
  // carry: share of the stroke left after a skid onto a second surface.
  // scatter: +- degrees the limit varies stroke to stroke (a boss, a rivet, the grain of the wood; a seeded draw, see physics.js bites()).
  glance: { coronel: 60, sharp: 70, helm: -6, body: -2, shield: 0, slide: 0.32, keep: 0.3, carry: 0.75, scatter: 4 },
  // The lance as a beam: radius (m) at distances from the grip (m), and where it can fail. rest: where the arm and rest hold it.
  // flaw: how much the grain varies along the shaft (it decides between places the load makes nearly equal).
  lanceShape: [[1.0, 0.040], [1.7, 0.034], [2.7, 0.022]],
  lanceBeam: { rest: 0.25, tip: 2.7, from: 1.05, to: 2.5, flaw: 0.3 },
  // The shaft is solid. horse: share of the horse's head and neck hit-spheres the shaft must stay outside (it is carried across the neck).
  // rail: clearance above the tilt rail (m). kick: how far up an unbroken lance is thrown by its own stroke (0 = stays level, 1 = upright).
  // Lance geometry (docs/lance-geometry.md, drone footage): aim yaw across the horse (rad) from 0.18 at the couch to what the foe needs at the meeting, 0.10..0.66 (6-38 deg; footage 18-25 at the meeting, never over 30: the margin is for a helm or body stroke when the horses have swayed apart), same for both riders so the lances lie parallel in plan.
  // clearYaw: the most the shaft is swung further left to clear its own horse's head (the rest by lifting the grip gripUp metres). easeFar / easeNear: gap (m) where the yaw leaves the couch value / reaches the meeting value.
  aim: { yawMin: 0.10, yawMax: 0.66, yawCouch: 0.18, pitchMin: -0.12, pitchMax: 0.20, clearYaw: 0.12, gripUp: 0.05, easeFar: 12, easeNear: 3.5 },
  // The lift after the stroke (a damped spring; footage: S-curve over 0.5-0.7 s after ~0.1 s, ~5% overshoot, +-4 deg sway). w: rad/s at refKg, zeta: damping, delay: s before the butt leaves the rest.
  // carry: the pose held after the lift (pitch / yaw to the left, rad) for hold seconds, then upright once the horse is below slowAt of its pace; whip: spring velocity into the tip whip. couchT: seconds to couch (both riders; footage 2-3 s, was 0.85 / 0.95).
  lift: { w: 7, zeta: 0.65, delay: 0.08, carryPitch: 0.87, carryYaw: 0.61, hold: 1.0, slowAt: 0.7, carryRate: 5, whip: 0.15, couchT: 1.5 },
  shaft: { horse: 0.5, horseOwn: 0.5, rail: 0.07, kick: 0.6, foe: 0.92, hand: 0.4, point: 0.55, across: 0.09, acrossSpeed: 4, brush: 0.015 },
  // ---- hit volumes (src/collide.js). Plain data, metres, in the frame of the part each is fixed to (`on`: helm, torso, rider, shield, head, neck,
  // root = the horse). shape 'cap': capsule from a to b with radius r (a == b is a sphere). shape 'obb': box with centre c, half-extents h
  // and a rounding radius r (the true half-size is h + r; r > 0 curves the edges so the normal turns round them). zone: what a point on it
  // scores as. cr: the radius that "how true the stroke is" (centring) is measured against. leg: a thigh (scores as body; the unhorsed man has none).
  // pad: metres added to the contact radius for a stroke (default 0.01; near-grazes register). own: the shaft of the rider's OWN lance must stay clear of it (head and neck). The shield box's +z is the shield's face normal.
  hitboxes: [
    { name: 'helm', zone: 'helm', on: 'helm', shape: 'cap', a: [0, 0.04, 0.015], b: [0, 0.24, 0.015], r: 0.13, cr: 0.17 },
    { name: 'gorget', zone: 'body', on: 'torso', shape: 'cap', a: [0, 0.52, 0], b: [0, 0.57, 0], r: 0.115, cr: 0.2 },
    { name: 'breast', zone: 'body', on: 'torso', shape: 'obb', c: [0, 0.27, 0.05], h: [0.15, 0.15, 0.08], r: 0.05, cr: 0.25, pad: 0.02 },
    { name: 'back', zone: 'body', on: 'torso', shape: 'obb', c: [0, 0.27, -0.07], h: [0.15, 0.15, 0.02], r: 0.05, cr: 0.25 },
    { name: 'pauldronL', zone: 'body', on: 'torso', shape: 'cap', a: [0.25, 0.405, 0], b: [0.3, 0.35, 0], r: 0.1, cr: 0.17 },
    { name: 'pauldronR', zone: 'body', on: 'torso', shape: 'cap', a: [-0.25, 0.405, 0], b: [-0.3, 0.35, 0], r: 0.1, cr: 0.17 },
    { name: 'upperArmL', zone: 'body', on: 'torso', shape: 'cap', a: [0.262, 0.37, 0], b: [0.325, 0.125, -0.035], r: 0.06, cr: 0.17 },
    { name: 'upperArmR', zone: 'body', on: 'torso', shape: 'cap', a: [-0.262, 0.37, 0], b: [-0.325, 0.125, -0.035], r: 0.06, cr: 0.17 },
    { name: 'foreArmL', zone: 'body', on: 'torso', shape: 'cap', a: [0.325, 0.125, -0.035], b: [0.17, 0.09, 0.3], r: 0.05, cr: 0.17 },
    { name: 'foreArmR', zone: 'body', on: 'torso', shape: 'cap', a: [-0.325, 0.125, -0.035], b: [-0.27, 0.12, 0.25], r: 0.05, cr: 0.17 },
    { name: 'shield', zone: 'shield', on: 'shield', shape: 'obb', c: [0, 0, 0.005], h: [0.2, 0.25, 0.02], r: 0, cr: 0.25, pad: 0.02 },
    { name: 'thighL', zone: 'body', leg: true, on: 'rider', shape: 'cap', a: [0.12, -0.02, 0.03], b: [0.4, -0.365, 0.275], r: 0.095, cr: 0.17 },
    { name: 'thighR', zone: 'body', leg: true, on: 'rider', shape: 'cap', a: [-0.12, -0.02, 0.03], b: [-0.4, -0.365, 0.275], r: 0.095, cr: 0.17 },
    { name: 'horseHead', zone: 'horse', own: true, on: 'head', shape: 'cap', a: [0, 0.0, 0.03], b: [0, -0.46, 0.58], r: 0.12, cr: 0.27 },
    { name: 'horseNeck', zone: 'horse', own: true, on: 'neck', shape: 'cap', a: [0, 0.05, 0], b: [0, 0.65, 0.45], r: 0.17, cr: 0.26 },
    // horse body volumes measured from the rigged horse_smooth.glb (13 Nov): body 1.05-1.85 m high, 0.27-0.34 m half-width
    { name: 'horseChest', zone: 'horse', on: 'root', shape: 'cap', a: [0, 1.42, 0.35], b: [0, 1.42, 0.6], r: 0.3, cr: 0.34 },
    { name: 'horseBarrel', zone: 'horse', on: 'root', shape: 'cap', a: [0, 1.42, -0.4], b: [0, 1.42, 0.2], r: 0.32, cr: 0.36 },
    { name: 'horseQuarters', zone: 'horse', on: 'root', shape: 'cap', a: [0, 1.47, -0.95], b: [0, 1.47, -0.6], r: 0.33, cr: 0.34 },
  ],
  // The lance as a chain of capsules measured from the grip (m): `edges` are the joints, so each pair is one capsule; the radius of each is the
  // shaft's own (lanceRadius at its middle) except the last, the coronel (`coronel` m, a little wider than the shaft). The last capsule is the POINT:
  // a contact on it is a stroke, a contact on any other is the shaft. `capX`: two coronels count as meeting point to point only if both
  // contacts are within the last `capX` m of each lance. `push`: how far (m) the shaft is held off a hit volume it has to clear.
  lanceChain: { edges: [0.15, 0.85, 1.5, 2.05, 2.4, 2.72, 2.76], coronel: 0.04, capX: 0.06, push: 0.002, tol: 0.006, slice: 0.1 },
  // What a blow does besides bending the rider back. twist: share of the kick that turns his shoulders when it lands off the spine.
  // head, shield: how hard the helm and the shield arm are thrown. horse: how much of the blow's momentum the horse's pace loses (x J / mass).
  // arm: how far a blow throws the struck rider's own lance off its line (rad/s per unit of power).
  recoil: { twist: 0.9, head: 0.8, shield: 0.6, horse: 1.6, stagger: 0.035, arm: 0.55 },
  // Armour damage (jouster.js damage(), main.js strike()). Each region (shield, helm, breast, pauldronL) runs 0..1 and rises by
  // power * perPower per blow there (x broke / helm / glance / turned). Marks show at the thresholds; the play effects are small and scale with the damage.
  // shieldPass: extra share of the blow a hurt shield lets through at 1.0; shieldGlance: degrees off the glance limit (a hurt face bites more);
  // helmView: share the first-person sight slit narrows; helmWobble: extra aim sway; guardSlow: share the shield arm slows (hurt pauldron).
  // mend: share of the worst region the armourer takes out between courses; squireShield: share of the shield's askew the squire straightens.
  damage: { perPower: 0.17, broke: 1.5, helm: 1.3, glance: 0.4, turned: 0.5, shieldPass: 0.15, shieldGlance: 8, helmView: 0.12, helmWobble: 0.1, guardSlow: 0.25,
    crackAt: 0.5, cornerAt: 0.65, askewAt: 0.8, askew: 0.12, plumeAt: 0.5, mend: 0.3, squireShield: 0.5, badAt: 0.6, radius: 0.07, depth: 0.015 },
  // The rider's own body through a match (Danilo, 15 Nov: "as ultrarealistic as possible"). arm: the lance arm jarred by the shock of
  // your own strokes coming back through the hand and the rest (most when the lance holds and the energy has nowhere else to go, little
  // when it breaks or glances) and by the jolt of blows you take; it makes the arm slower and shakier and tires sooner. wind: the breath
  // driven out of you by a blow to the body or shield (worse through a dented breastplate, less in heavier harness); a winded man shakes
  // and his nerve runs out sooner. Between courses the breath mostly comes back, a jarred arm hardly.
  body: { armShock: 0.16, armJolt: 0.05, wind: 0.42, dentWind: 0.8, windRest: 0.35, armRest: 0.9,
    armFatigue: 0.55, armBuild: 1.2, armCouch: 0.5, windAgit: 0.6, windFocus: 1.0, oppArm: 0.9, oppWind: 0.45 },
  // What the type's equipment does (see KIT0 in this file; main.js strike(), the charge loop). lockWind / lockArm: how much more of a blow a held man takes in
  // wind and arm per unit of lock above 1 (research: 0.8 and 0.5); lockTheta: how much less he is thrown; lockKick: the lance arm's recoil per unit of lock.
  // springAbsorb: share of the blow a shield that gives way takes up; springCent: how true the stroke must be; soft: share of a stroke the sack lets through.
  // blindSteer: the blinkered horse's steering response; boltedHead: how much of a blow to the helm still snaps the head back; queueFatigue: arm fatigue with a queue.
  // shyAt / shyGain / shyMax: the open-eyed horse's chance to shy (once per course, inside shyGap metres of the other man); shyKick: its sideways kick; shyPace: pace it loses.
  kit: { lockWind: 0.8, lockArm: 0.5, lockTheta: 0.5, lockKick: 1, springCent: 0.5, springAbsorb: 0.35, soft: 0.3, blindSteer: 0.35, boltedHead: 0.35, queueFatigue: 0.7,
    shyAt: 0.12, shyGain: 1.0, shyMax: 0.45, shyGap: 14, shyKick: 1.1, shyPace: 0.93, wander: 0.8,
    // a fretful horse (agit over swayAt) sways about his lane, both ways, never a constant pull: peak +-swayMax m at agit 1, two slow sines (rad/s) that start at the lane
    swayAt: 0.45, swayMax: 0.3, swayIn: 0.2, swayW1: 0.8, swayW2: 1.7, swayHint: 0.25 },
  // The unhorsed rider as one rigid body: mass (kg), moment of inertia (kg m2), bounce, grip of the sand.
  fall: { kg: 105, inertia: 13, bounce: 0.18, friction: 0.65 },
  // The moment of a blow (all visual: nothing here changes a stroke's result; main.js strike(), jouster.js hit(), fx.js lanceBurst()).
  //  Break classes by stroke power (1 = a full stroke): crack < cleanAt <= clean < shatterAt <= shatter.
  //  big / long / slivers / chips: what each class throws (see below); len: splinter length range (m); spray: speed along the stroke (m/s) and
  //  out to the side; keep: seconds the splinters lie on the sand (the rest of the course, then fade over `fade`).
  //  coronel: the crown tip stays with the struck helm or shield for hold (+ per power) seconds, then bounces off.
  //  hitStop (s, scaled by power between hsFrom..1, offline only; online the sim is never paused, the sparks just hang) and slow (S.slowT seconds per class).
  //  react: spring-damper reaction of the struck rider (see Jouster.hit): leanMax = rad he can be bent back before the cantle stops him (divided by kit.cantle),
  //  headSide / headYaw: the helm snapped sideways and turned; lag: seconds before the torso follows a helm blow; jolt: how far the lance arm is thrown back (m);
  //  push: how far a heavy blow shoves him back in the saddle (m); toss/check: the horse's head toss and stride check; whip: the striker's lance whip, recoil: his arm;
  //  stagJ: how hard the horse is rocked sideways per m/s of the blow's sideways momentum over horse and rider.
  //  leanGain: the torso kick (rad/s) per radian of the physics' peak lean (impact().theta): with the posture spring in jouster.js (38, 6.5) the drawn peak lean
  //  then equals theta (5 deg at a shield break, 12-15 deg for a hard one, as measured on film). headJ: N s of a helm stroke per rad/s of head whip.
  impact: {
    // ---- the collision model (physics.js impact(); docs/physics-model.md). SI units.
    // mass: the part of the struck man the point must move in the first hundredths of a second (kg) = base + arm x harness kg + up x trunk
    //   (upperKg + half the harness) + horse x horse kg (twice when he leans in). Head and helm are light and loosely held; a shield is backed by the trunk.
    // gyr: radius of gyration of each part over its marking radius: a stroke (1 - cent) off centre moves only m / (1 + ((1 - cent) / gyr)^2).
    // k: contact stiffness (N/m) of the armour, the padding beneath and the shield on its strap; sets how fast the force rises (w = sqrt(k / mu)).
    // hold: the force (N) the hand and armpit (loose) up to the lance rest (rest) can pass before the lance slides back; queue: x for a Rennzeug's queue.
    // thrust: share of the boost (the thrust, the hidden arts) that adds to the normal speed; grain: +- share of failN from lance to lance (seeded);
    // bend: share of the strength lost when the load comes fully sideways (sin theta = 1); after: share of the lance's own momentum the broken head still delivers.
    // e: restitution of a lance that holds (it springs back); gripMu: sideways grip of a biting point; slipMu: friction of a skidding one;
    // glanceShare: share of the normal bounce a skidding point delivers before it slides off the curved surface; turned: share a shield thrown up lets through.
    // seatScatter: +- share of the lean the seat varies by (seeded); ref: the reference stroke (power 1) - closing speed and coupling, standard lance, square on a shield.
    mass: { helm: { base: 5, arm: 0.12, up: 0.12, horse: 0 }, shield: { base: 4, arm: 0.1, up: 0.5, horse: 0.02 }, body: { base: 0, arm: 0.3, up: 0.8, horse: 0.04 }, horse: { base: 150, arm: 0, up: 0, horse: 0.1 } },
    gyr: 0.45,
    k: { helm: 20000, shield: 15000, body: 17000, horse: 12000, quintain: 15000 },
    hold: { loose: 600, rest: 9000, exp: 2, queue: 1.6 },
    slipT: 0.012, thrust: 0.15, grain: 0.15, bend: 0.35, after: 0.15, e: 0.2, gripMu: 0.3, slipMu: 0.25, glanceShare: 0.35, turned: 0.3, seatScatter: 0.06,
    ref: { v: 14, q: 0.85 },
    // flex (visual, jouster.js): bow = peak bow of the shaft (m) at the failure load; ring = a lance that holds bows by load x ring (m) and rings at ringHz
    // (a 2.6 m fir cantilever held at the hand: first mode about 5 Hz) dying by ringZeta; stumpHz: the stump's ring after the break.
    // pin (jouster.js pinLance): after the point meets him it stays on his surface. margin: m off the face; slide: how far the lance can go back through the
    // hand and the rest (m; the arm folds with it); bow: what the shaft's bow takes up beyond that (m) before the point skids off up and along the face at
    // skidV m/s, freed once clear m along it; bowGain: extra drawn bow per m taken up; tMax: s at most.
    pin: { margin: 0.012, slide: 0.42, bow: 0.16, skidV: 6, clear: 0.4, bowGain: 0.5, tMax: 0.5 },
    // burstBack: share of the burst thrown back off the struck face; burstCarry: share of the struck man's velocity the pieces take with them (fx.js lanceBurst).
    burstBack: 0.5, burstCarry: 0.35,
    flex: { bow: 0.16, ring: 0.12, ringHz: 5.2, ringZeta: 0.12, stumpHz: 11, stump: 0.25 },
    cleanAt: 0.42, shatterAt: 0.85, slowTouch: 0.4,
    // (26 Nov, after the review of the strips: a break is two to four big pieces, many small slivers and a short puff of dust, not a firework of sticks.)
    // big: how many big pieces fly (range; the stump stays in his hand); long: a few long splinters (len m); slivers: small rods; chips: flying bits.
    crack: { big: [1, 1], long: 2, slivers: 10, chips: 18, len: [0.15, 0.45], spray: 3.5, side: 0.7, up: 1.0, slow: 0, shake: 0.2 },
    clean: { big: [1, 2], long: 3, slivers: 16, chips: 30, len: [0.15, 0.55], spray: 5, side: 0.9, up: 1.3, slow: 0.45, shake: 0.4 },
    shatter: { big: [2, 3], long: 5, slivers: 24, chips: 44, len: [0.2, 0.7], spray: 6.5, side: 1.2, up: 1.6, slow: 0.75, shake: 0.6 },
    keep: 60, fade: 4, foreSpin: [5, 9], coronel: { hold: 0.22, perPower: 0.2, size: 0.11 },
    hsFrom: 0.5, hitStop: [0.04, 0.09], hsBreak: 1.25,
    react: { leanMax: 0.62, headSide: 2.0, headYaw: 1.1, lag: 0.09, lagShare: 0.6, jolt: 0.3, push: 0.12, toss: 1.1, check: 0.9, checkAt: 0.7, whip: 1.5, recoil: 0.16, shoulder: 0.8, stagJ: 1.6, leanGain: 11.5, headJ: 14 },
    // fall: how the unhorsed man leaves the saddle (main.js strike, from the impulse). out + outRand x a draw: m/s out to the side away from the tilt;
    // lat: share of the blow's sideways momentum he keeps; up + upPower x power: m/s upward; spin0 + spin x wOver (rad/s the seat could not hold):
    // his turn backward over the cantle, kept within spinMin..spinMax; delay: seconds he stays in the saddle being driven back (film: 0.42), shorter
    // for a blow that turns him faster than wRef rad/s.
    // Two styles (mocap 2.3): over the cantle (delay ~0.55 s to leave the saddle, ground ~0.85 s) and thrown out sideways when the blow's sideways share
    // passes sideJ or the stroke lands past sideOff of the mark's radius off centre (leaves at ~0.3 s, sideOut x the outward speed, sideSpin x the turn over the cantle).
    fall: { skid: 1.6, burst: 1.2, ground: 0.5, out: 0.6, outRand: 0.8, lat: 1, up: 0.7, upPower: 0.45, spin0: 2.4, spin: 0.25, spinMin: 2.2, spinMax: 5.2, delay: 0.55, delaySide: 0.3, wRef: 9, upMax: 2.0,
      sideJ: 0.35, sideOff: 0.55, sideOut: 2.2, sideSpin: 0.55,
      // The rigged rider's fall (jouster.js _detach / _fallPose) follows the authored mocap curves (assets/motion/yt/rider_fall_*.json) for the pose and
      // the pelvis path while he is on the horse, then flies ballistically: keep = share of the horse's forward speed he keeps; tGround = when the footage
      // has him on the sand (s from the blow; the launch is solved to land then); lieH = pelvis height lying (m); vyMin / vyMax = the launch's vertical
      // speed is held within these (m/s: sliding down off the rump, thrown up over the shoulder); turn = how far he turns in the air (rad): back over the
      // cantle (cantle, with a little roll, cantleRoll), or over sideways (side, with sideBack). flail: the arms windmill deg at hz while he is in the air,
      // and a burst on landing that dies at decay /s. horseCarry / horseStop: the riderless horse carries on (s), then stops at horseStop m/s2 (mocap 2.3).
      keep: 0.9, tGround: { cantle: 0.9, side: 1.3 }, lieH: 0.25, vyMin: -2.5, vyMax: 3.5,
      turn: { cantle: 1.7, cantleRoll: 0.35, side: 1.5, sideBack: 0.4 }, flail: { deg: 24, hz: 2.2, decay: 2.5 }, horseCarry: 1.6, horseStop: 6, wMax: 6,
      // shyJ: a blow of more than this (N s) startles the loose horse: a stumble or a shy (shyV m/s out from the barrier, dying away; shyYaw rad of turn)
      shyJ: 200, shyV: 1.6, shyYaw: 0.3 },
  },
  // The unhorsed rider's ragdoll (src/ragdoll.js; high and medium graphics; the low tier keeps the rigid-body fall). h: substep (s, fixed, so the fall is the
  // same at any frame rate); iters: constraint passes per substep; damp: velocity kept per substep (air and the harness's give); hinge: m a knee must stay in
  // front of (an elbow behind) its bone line; mu: friction of the sand on a sliding point (Coulomb); impactMu: extra grip per m/s it hit the sand at (a body
  // that lands hard ploughs in); bounce: share of the landing speed thrown back up; sleepV / sleepT: asleep once nothing moves faster than this (m/s) for sleepT s.
  // fade: s of the cross-fade from the authored pose to the ragdoll at the exit; helmKg: the helm's share of the harness (it makes the head heavy).
  ragdoll: { h: 1 / 120, iters: 10, damp: 0.9995, hinge: 0.01, mu: 0.55, impactMu: 0.08, bounce: 0.12, sleepV: 0.3, sleepT: 0.5, fade: 0.12, helmKg: 5 },
  quintainKg: 250,      // the board, its arm and sandbag, and the reaction of the post
  // Drama: injuries, the surgeon, yielding, a dropped lance, helm ringing and daze (main.js, "drama" section; all offline: online play keeps none of it).
  // heavyHelm / heavyBody: stroke power (1 = a full 250 J stroke) that makes a hit "heavy" (the battered-knight close-up; a lance broken on the helm always is). battered: seconds of that close-up; batterGap: courses between two close-ups.
  // Condition (FIT / DOUBTFUL / UNFIT) from body hp, the jolt of arm and wind, and heavy blows taken: unfitBody and (unfitArm and unfitWind together) = UNFIT; doubtBody, doubtArm with doubtWind, or heavyN heavy blows with body under heavyBody2 = DOUBTFUL.
  // tendPower: a blow this strong (or an unhorsing, or a body that fell tendBody in one course, or a smashed helm, or condition worsening) sends the surgeon to the man; tend: seconds of the beat. helmSwapAt: helm damage at which the spare helm is fitted (once a match).
  // aiYield: chance per course that a DOUBTFUL AI yields when behind by aiBehind points or more. spares: spare lances (one more per course beyond four).
  // Drop: a lance that holds (no break) on a stroke of dropPower or more, with the arm jarred to dropArm (or, for the struck man, thrown back dropLean of the way to going over): chance dropChance, scaled up by how far past; dropMax per man per match.
  // Daze: seconds = dazeBase + dazePower * power (x dazeHelm on the helm), capped dazeMax; dazeAim: extra aim sway (x) while dazed (you), oppDaze: the same for the AI; dazeBlur: screen blur/wobble strength.
  drama: { heavyHelm: 0.62, heavyBody: 0.8, battered: 2.1, batterGap: 2,
    unfitBody: 0.02, unfitArm: 0.98, unfitWind: 0.98, unfitArmBody: 0.12,      // UNFIT (the yield) is very rare (owner, 27 Nov): was unfitBody 0.18, arm/wind 0.9 with no body condition; now body 0.02, and the arm/wind route also needs the body at 0.12 or less
    doubtBody: 0.42, doubtArm: 0.75, doubtWind: 0.7, heavyN: 3, heavyBody2: 0.6,
    tendPower: 1.0, tendBody: 0.2, tend: 6, helmSwapAt: 0.7,
    aiYield: 0.06,      /* was 0.35: the AI that is DOUBTFUL and far behind yields only very rarely (owner, 27 Nov) */ aiBehind: 3, spares: 3,
    dropPower: 0.7, dropArm: 0.5, dropLean: 0.8, dropChance: 0.45, dropMax: 1,
    dazeBase: 0.9, dazePower: 1.1, dazeHelm: 1.35, dazeMax: 3, dazeAim: 2.2, oppDaze: 1.6, dazeBlur: 0.8 },
  lanceArm: { wnLoose: 5.5, wnSet: 11.5, zetaLoose: 0.35, zetaSet: 0.68, refKg: 5.5, lever: 0.36, tremor: 0.32, tremorFatigue: 1.7, tremorAgit: 0.9 }      // tremor 0.5 / 2.6 / 1.4 before: less shake for playability (owner, 27 Nov); the aim spring's noise only, the impact physics is untouched,
};

// EQUAL_GEAR (config.js): the one choke point. While it is on, the stat fields of every horse, harness, helm and lance (and PHYS.horseKg / armourKg / lance) are overwritten, once, at load,
// with one standard set; looks, size, names, prices and ids stay. Every reader (jouster.js, main.js, physics, AI, online, attract, menus) then sees the same numbers on both peers.
// The standard: horses = the mean of the four; harness = Coat of Plates (the middle one); helm = the Houndskull Bascinet's protection and vision, the mean kg and deflect; kg = the mean;
// lances = the Tourney lance. The raw numbers are kept in RAW_GEAR; set EQUAL_GEAR false to bring the differences back.
export const RAW_GEAR = { horses: {}, armours: {}, helms: {}, lances: {}, lanceKg: JSON.parse(JSON.stringify(PHYS.lance)), horseKg: { ...PHYS.horseKg }, armourKg: { ...PHYS.armourKg } };
export const STANDARD_GEAR = {};
(function applyEqualGear() {
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const keep = (src, dst) => { for (const k in src) dst[k] = { ...src[k] }; };
  keep(HORSES, RAW_GEAR.horses); keep(ARMOURS, RAW_GEAR.armours); keep(HELMS, RAW_GEAR.helms); keep(LANCES, RAW_GEAR.lances);
  const hs = Object.values(RAW_GEAR.horses), hl = Object.values(RAW_GEAR.helms), mid = RAW_GEAR.armours.bascinet, std = RAW_GEAR.lances.standard;
  STANDARD_GEAR.horse = {}; for (const k of ['top', 'accel', 'mass', 'steady', 'nerve', 'stamina']) STANDARD_GEAR.horse[k] = mean(hs.map(h => h[k]));
  STANDARD_GEAR.horseKg = mean(Object.values(RAW_GEAR.horseKg));
  STANDARD_GEAR.armour = { protection: mid.protection, weight: mid.weight, vision: mid.vision };
  STANDARD_GEAR.armourKg = mean(Object.values(RAW_GEAR.armourKg));
  STANDARD_GEAR.helm = { protection: RAW_GEAR.helms.bascinet.protection, vision: RAW_GEAR.helms.bascinet.vision, kg: mean(hl.map(h => h.kg)), deflect: mean(hl.map(h => h.deflect)) };
  STANDARD_GEAR.lance = { power: std.power, sway: std.sway, fatigue: std.fatigue, ...RAW_GEAR.lanceKg.standard };
  if (!EQUAL_GEAR) return;
  for (const h of Object.values(HORSES)) Object.assign(h, STANDARD_GEAR.horse);
  for (const a of Object.values(ARMOURS)) Object.assign(a, STANDARD_GEAR.armour);
  for (const h of Object.values(HELMS)) Object.assign(h, STANDARD_GEAR.helm);
  for (const l of Object.values(LANCES)) { l.power = std.power; l.sway = std.sway; l.fatigue = std.fatigue; }
  for (const k in PHYS.horseKg) PHYS.horseKg[k] = STANDARD_GEAR.horseKg;
  for (const k in PHYS.armourKg) PHYS.armourKg[k] = STANDARD_GEAR.armourKg;
  for (const k in PHYS.lance) Object.assign(PHYS.lance[k], RAW_GEAR.lanceKg.standard);
})();

// Feats: pure honours. They give no power in the lists, only a small renown bonus (`renown`, default ACH_RENOWN) so that they feel worth having.
// `rule` is read by src/achievements.js: ev = an event fired at that moment · stat = [counter, n] · in = [list, id] · rank = a rank index reached ·
// men = 'full' | 'level3' · stable = 'horses' | 'caparisons'. hidden: shown as ??? until earned.
export const ACH_RENOWN = 5;
export const ACH_GROUPS = ['In the Lists', 'Venues', 'Rule Sets', 'Knights', 'Retinue & Stable', 'Renown', 'Hidden Matters'];
const knightAch = (id, name, text, renown) => ({ id: 'beat_' + id, group: 'Knights', name, text, rule: { in: ['beaten', id] }, renown });
export const ACHIEVEMENTS = [
  { id: 'firstblood', group: 'In the Lists', name: 'First Blood', text: 'Break your first lance.', rule: { stat: ['broken', 1] } },
  { id: 'shivered', group: 'In the Lists', name: 'Shivered', text: "Break a lance on your opponent's helm.", rule: { ev: 'helmBreak' } },
  { id: 'unhorsed', group: 'In the Lists', name: 'Borne to the Ground', text: 'Unhorse an opponent.', rule: { stat: ['unhorsed', 1] } },
  { id: 'ironseat', group: 'In the Lists', name: 'Iron Seat', text: 'Win a match without ever being struck hard.', rule: { ev: 'ironSeat' } },
  { id: 'cleansheet', group: 'In the Lists', name: 'Clean Sheet', text: 'Win a match without conceding a point.', rule: { ev: 'cleanSheet' } },
  { id: 'comeback', group: 'In the Lists', name: 'Comeback', text: 'Win a match after trailing by three points or more.', rule: { ev: 'comeback' } },
  { id: 'perfect', group: 'In the Lists', name: 'Perfect Course', text: 'Break a lance on the helm with a thrust, dead on the sight.', rule: { ev: 'perfect' }, hidden: true },
  { id: 'sight3', group: 'In the Lists', name: 'Three in the Sight', text: "Win under Tiptoft's Ordinances by three strokes in the sight of the helm.", rule: { ev: 'sightWin' } },
  { id: 'knowsmark', group: 'In the Lists', name: 'Knows His Mark', text: 'Ride back to your mark by hand, unaided, five times.', rule: { stat: ['markHits', 5] } },
  { id: 'courteous', group: 'In the Lists', name: 'Courteous', text: 'Salute a knight you have unhorsed.', rule: { ev: 'courtesy' }, hidden: true },
  { id: 'venue_smithfield', group: 'Venues', name: 'Smithfield', text: 'Win a match at Smithfield, London.', rule: { in: ['venues', 'smithfield'] } },
  { id: 'venue_inglevert', group: 'Venues', name: 'Saint-Inglevert', text: 'Win a match at Saint-Inglevert, Calais.', rule: { in: ['venues', 'inglevert'] } },
  { id: 'venue_leon', group: 'Venues', name: 'Passo Honroso', text: 'Win a match at the Passo Honroso, León.', rule: { in: ['venues', 'leon'] } },
  { id: 'venue_bruges', group: 'Venues', name: 'The Golden Tree', text: 'Win a match at the Golden Tree, Bruges.', rule: { in: ['venues', 'bruges'] } },
  { id: 'venue_nuremberg', group: 'Venues', name: 'Gesellenstechen', text: 'Win a match at Nuremberg.', rule: { in: ['venues', 'nuremberg'] } },
  { id: 'champion', group: 'Venues', name: 'Circuit Champion', text: 'Win the final of the last tournament of a season.', rule: { ev: 'circuitWon' }, renown: 15 },
  { id: 'rule_planken', group: 'Rule Sets', name: 'Over the Tilt', text: 'Win a Standard Joust.', rule: { in: ['modes', 'planken'] } },
  { id: 'rule_tiptoft', group: 'Rule Sets', name: "The Earl's Rules", text: "Win under Tiptoft's Ordinances.", rule: { in: ['modes', 'tiptoft'] } },
  { id: 'rule_castile', group: 'Rule Sets', name: 'Knight of the Band', text: 'Win under the Statutes of the Band.', rule: { in: ['modes', 'castile'] } },
  { id: 'rule_gestech', group: 'Rule Sets', name: 'Open Field', text: 'Win a Deutsches Gestech.', rule: { in: ['modes', 'gestech'] } },
  { id: 'rule_rennen', group: 'Rule Sets', name: 'Sharp Lances', text: 'Win a Scharfrennen.', rule: { in: ['modes', 'rennen'] } },
  knightAch('clifford', 'Clifford Bested', 'Beat Sir Thomas Clifford.'),
  knightAch('renaud', 'De Roye Bested', 'Beat Renaud de Roye.'),
  knightAch('boucicaut', 'Boucicaut Bested', 'Beat Jean le Meingre, "Boucicaut".'),
  knightAch('lalaing', 'Lalaing Bested', 'Beat Jacques de Lalaing.'),
  knightAch('quinones', 'Quiñones Bested', 'Beat Suero de Quiñones.'),
  knightAch('freydal', 'Freydal Bested', 'Beat Maximilian, "Freydal".', 8),
  knightAch('palman', 'Palman Bested', 'Beat Palman Bracht, captain of the German mercenaries.'),
  knightAch('ulrich', 'Ulrich Bested', 'Beat Ulrich von Liechtenstein.'),
  knightAch('blackprince', 'The Prince Bested', 'Beat Edward, the Black Prince.', 10),
  { id: 'retinue', group: 'Retinue & Stable', name: 'A Full Household', text: 'Have all five of your retinue in your service.', rule: { men: 'full' } },
  { id: 'trained', group: 'Retinue & Stable', name: 'Master and Man', text: 'Train a man of your retinue to level 3.', rule: { men: 'level3' } },
  { id: 'stable', group: 'Retinue & Stable', name: 'The Whole Stable', text: 'Own every horse in the Stable.', rule: { stable: 'horses' } },
  { id: 'wardrobe', group: 'Retinue & Stable', name: 'Clothed for Show', text: 'Own every caparison.', rule: { stable: 'caparisons' } },
  { id: 'lances10', group: 'Renown', name: 'Ten Lances', text: 'Break 10 lances.', rule: { stat: ['broken', 10] } },
  { id: 'lances50', group: 'Renown', name: 'Fifty Lances', text: 'Break 50 lances.', rule: { stat: ['broken', 50] } },
  { id: 'lances100', group: 'Renown', name: 'A Hundred Lances', text: 'Break 100 lances.', rule: { stat: ['broken', 100] }, renown: 10 },
  { id: 'rank2', group: 'Renown', name: 'Knight of the Lists', text: 'Reach the rank of Knight of the Lists.', rule: { rank: 2 } },
  { id: 'rank4', group: 'Renown', name: 'Champion of the Lists', text: 'Reach the rank of Champion.', rule: { rank: 4 } },
  { id: 'rank6', group: 'Renown', name: 'Flower of Chivalry', text: 'Reach the highest rank, Flower of Chivalry.', rule: { rank: 6 }, renown: 10 },
  { id: 'courtly', group: 'Hidden Matters', name: 'Courtly Love', text: "Catch a lady's eye in the gallery.", rule: { ev: 'ladyEye' }, hidden: true },
  { id: 'courtly3', group: 'Hidden Matters', name: 'Every Sort of Welcome', text: 'See all three ways the gallery can answer a glance.', rule: { stat: ['ladyKinds', 3] }, hidden: true },
];
