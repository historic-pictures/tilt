// The career's story text and the lesser knights who fill the tournament fields. All of it lives here so it can be swapped for a fixed protagonist
// (with his own name and life, voiced once) without touching the game code.
// Placeholders: {name} (the player's chosen name) {venue} {city} {host} {hostShort} {next} {nextCity} {rival}
// Each card is 2-4 plain lines, in the register of the rest of the game (modern plain sentences, period nouns).

/** The protagonist. While `fixed` is false the player's own name is used in every line. When a protagonist is chosen: set fixed true and fill in name and bio. */
export const PROTAGONIST = { fixed: false, name: null, bio: null };

const T = { r: '#a81e1e', b: '#1f4690', g: '#e0b83c', w: '#ece8dc', k: '#191919', v: '#2f6b3a' };
const F = (id, name, short, land, c1, c2, pattern, charge, horse, armour, skill, seat, drive) =>
  ({ id, name, short, land, arms: { c1, c2, c3: c2, pattern, charge }, horse, armour, skill, seat, drive, field: true });

/** Lesser knights: they make up the numbers in the larger fields. Invented, no history claimed. Same shape as KNIGHTS in data.js. */
export const FIELD = [
  F('ashby', 'Sir Edmund Ashby', 'Ashby', 'England', T.w, T.r, 'bend', 'cross', 'rouncey', 'mail', 0.30, 0.42, 0.70),
  F('vaux', 'Sir John Vaux', 'Vaux', 'England', T.g, T.k, 'chief', 'none', 'rouncey', 'mail', 0.36, 0.48, 0.72),
  F('montferrand', 'Jehan de Montferrand', 'Montferrand', 'Hainaut', T.b, T.w, 'fess', 'star', 'courser', 'bascinet', 0.42, 0.52, 0.80),
  F('croix', 'Gilles de la Croix', 'de la Croix', 'Artois', T.r, T.g, 'pale', 'cross', 'courser', 'bascinet', 0.46, 0.56, 0.84),
  F('absberg', 'Hans von Absberg', 'Absberg', 'Franconia', T.k, T.w, 'quarterly', 'none', 'destrier', 'bascinet', 0.50, 0.60, 0.86),
  F('almansa', 'Ruy Sánchez de Almansa', 'Almansa', 'Castile', T.g, T.r, 'paly', 'tower', 'andalusian', 'mail', 0.40, 0.50, 0.84),
  F('tilly', 'Wolfgang von Tilly', 'Tilly', 'Bavaria', T.v, T.w, 'chevron', 'none', 'destrier', 'milanese', 0.54, 0.62, 0.86),
  F('vergy', 'Antoine de Vergy', 'de Vergy', 'Burgundy', T.r, T.w, 'quarterly', 'roundel', 'courser', 'milanese', 0.58, 0.64, 0.88),
  F('pazzi', 'Lorenzo Pazzi', 'Pazzi', 'Florence', T.b, T.g, 'chief', 'crescent', 'courser', 'milanese', 0.52, 0.58, 0.84),
  F('lindsay', 'Sir Alexander Lindsay', 'Lindsay', 'Scotland', T.g, T.v, 'pale', 'star', 'rouncey', 'bascinet', 0.34, 0.46, 0.74),
];

/** The season opens. */
export const BEGIN = [
  '{name} has a horse, a lance, a squire and very little else.',
  'Five great lists lie across Europe. Each holds a tournament, and each tournament has a champion.',
  'Win one, and the heralds will remember it.',
];

/** Per venue: arrive, stakes, rival (who he is and why he matters), road (what lies onward). `rival` names a knight in KNIGHTS. */
export const VENUES_STORY = {
  smithfield: {
    arrive: ['The road ends at the walls of London.', 'Carpenters are still nailing the stands together. The city has turned out to watch.', '{name} rides in under a grey sky, and gives his name at the gate.'],
    stakes: ['Eight knights enter the lists at {venue}. Three rounds, and one winner.', 'The King will give the prize himself. A man who wins here is spoken of in every hall in England.'],
    rival: ['Sir Thomas Clifford holds the lists today.', 'He is steady rather than brilliant, but he knows every trick of the sand. He is the man to beat.'],
    road: { won: ['The King has spoken your name. A herald hands you a purse and a letter for the road.', 'France next: the knights at Saint-Inglevert hold the field against all comers.'], lost: ['You leave London with a bruise and a lesson.', 'France is next. The knights at Saint-Inglevert will not be kinder.'] },
  },
  inglevert: {
    arrive: ['The ferry to Calais is rough, and the road to the lists rougher.', 'On a field by the sea, three French shields hang on a tree. Anyone who touches one has a fight.', '{name} touches nothing yet. He walks the sand and counts the strides.'],
    stakes: ['Eight knights ride for {venue}. The French hold the field for thirty days, and they are in no mood to lose.', 'A win here carries your name across the Channel.'],
    rival: ['Renaud de Roye is the host, and he is proud.', 'He has beaten more men than he can count, and he expects a quick afternoon.'],
    road: { won: ['The French salute you, and mean it.', 'South now, to Spain, where a bridge is held for a lady\'s honour.'], lost: ['The French wish you well, politely.', 'The road runs south to Spain, where a bridge is held against all comers.'] },
  },
  leon: {
    arrive: ['The pass at Órbigo is a long stone bridge over a dry river.', 'The Spanish knights have been here for weeks. Their lances lie in heaps like firewood.', '{name} crosses the old bridge on foot, leading his horse.'],
    stakes: ['Eight knights ask for the honour of the pass. Three rounds, and the winner is a name in Spain.', 'There is no king here, only a lady, and a promise to keep.'],
    rival: ['Suero de Quiñones wears an iron collar for his lady, and has sworn not to leave until three hundred lances are broken.', 'He is not showing off. He is keeping a vow, and it makes him dangerous.'],
    road: { won: ['Quiñones bows to you. A rare thing.', 'Burgundy next. The Duke is marrying, and the whole court is invited.'], lost: ['The old bridge is quiet when you leave it.', 'Burgundy is next. The Duke is marrying, and there will be a great tournament.'] },
  },
  bruges: {
    arrive: ['Bruges is hung with gold. There are banners on every roof and minstrels on every corner.', 'The lists stand in the market square, with a gilded tree at the end of them.', '{name} sees the Duke\'s pavilion, and has never felt so poorly dressed.'],
    stakes: ['Sixteen knights ride at {venue}, in four rounds. It is the richest tournament in Christendom.', 'The Duke himself will give the prize. Win here, and the great names will know yours.'],
    rival: ['Jacques de Lalaing is the finest knight at the court.', 'He has beaten everyone who ever rode against him. He does not hate you. He simply expects to win.'],
    road: { won: ['The Duke gives you his hand. Half the court watches.', 'One tournament remains: Nuremberg, before the Emperor\'s heir.'], lost: ['The Duke\'s court has forgotten you by supper.', 'One tournament remains: Nuremberg, before the Emperor\'s heir. Ride well there.'] },
  },
  nuremberg: {
    arrive: ['Nuremberg is a city of clocks and guilds, and it takes its jousting seriously.', 'The market square is covered in sand. The burghers sit in rows and keep accounts.', '{name} is given a room above a baker\'s, and cannot sleep for the noise of carpenters.'],
    stakes: ['Sixteen knights, four rounds, and the heir of the Empire watching.', 'It is the last tournament of the season. Win it, and the season is yours.'],
    rival: ['Maximilian, called Freydal, loves the joust above everything, and is very good at it.', 'He rides like a man with nothing to lose, which is strange for an emperor\'s son.'],
    road: { won: ['The Emperor\'s heir salutes you across the square.', 'The season is done.'], lost: ['The Emperor\'s heir was kind, which stings more.', 'The season is done.'] },
  },
};

/** Between a lost tournament and the next: a plain line on the way you went out. */
export const OUT_LINES = {
  first: ['You went out in the first round. It is a short day, and a long road home.'],
  mid: ['You went out in the {round}. The lists were kind for a while.'],
  final: ['You lost the final. The prize went to {winner}, and you rode home with second place.'],
};

/** The season's end: by number of honours won. */
export const SEASON_END = {
  none: ['The season is run, and no tournament was yours.', 'The heralds shrug. There is always another year.'],
  some: ['The season is run. {n} honour{s} to your name.', 'The heralds will remember it.'],
  all: ['Every tournament of the season was yours.', 'They will cry your name from London to Nuremberg.'],
};

/** Three possible protagonists for a fixed story (c. 1467), for the owner to choose from. Not used by the game yet. */
export const PROTAGONIST_PROPOSALS = [
  { name: 'Edmund Ashby', age: 22, from: 'Lincolnshire, England', note: 'Younger son of a minor knight, trained in a Yorkist household. Rides to Smithfield in 1467, where Anthony Woodville meets the Bastard of Burgundy.' },
  { name: 'Jehan de Montferrand', age: 24, from: 'Hainaut, Burgundian Netherlands', note: 'A squire of a ducal household, born to arms but not to money. Goes to Bruges in 1468 for the Duke\'s wedding.' },
  { name: 'Hans von Absberg', age: 23, from: 'Franconia, near Nuremberg', note: 'The son of an Imperial knight, brought up with the Gesellenstechen of the city. The German school of the joust, with its heavy, specialised harness.' },
];

const pick = (a) => a[(Math.random() * a.length) | 0];
/** Fill the placeholders of a story card's lines. */
export const fillStory = (lines, v) => lines.map(l => l.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ''));
export const storyName = (profile) => PROTAGONIST.fixed && PROTAGONIST.name ? PROTAGONIST.name : profile.name;
export { pick };
