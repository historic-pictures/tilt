// The people of the tiltyard: the announcer and the host of each lists, with their lines. Register: a modern medieval drama (plain modern
// sentences, period nouns and titles; no thee/thou). Everything is spoken through the voice director (say() in main.js), never around it.
// Placeholders as in herald_lines.js: {venue} {city} {year} {him} {himFull} {land} {you} {arms} {bio}

/** The announcer. Hugh Clement is invented; the office (a King of Arms proclaims the lists) is real. drawFace(cv, name, color, cap) draws his portrait. */
export const ANNOUNCER = {
  id: 'hugh', name: 'Master Hugh Clement', title: 'King of Arms', short: 'Hugh Clement', label: 'MASTER HUGH CLEMENT · KING OF ARMS',
  bio: 'Forty years a herald. He has cried the arms of three kings and knows every knight in Christendom by his shield. Dry, exact, proud of his craft, and openly scornful of a foul. He makes announcements; he does not gush.',
  color: '#8a1d2b', cap: 'herald',
};

/** One line on each knight, for the lower-third card and the announcement. Real people, plain facts. (A knight's own `bio` in data.js wins when it has one.) */
export const KNIGHT_BIO = {
  clifford: 'An English knight of the northern marches, steady in the saddle.',
  renaud: 'He held the field at Saint-Inglevert for thirty days.',
  boucicaut: 'Marshal of France. He held the lists at Saint-Inglevert in 1390.',
  lalaing: 'Burgundy\'s best-known knight, and the terror of every pas d\'armes.',
  quinones: 'He held the bridge at Órbigo for his lady until three hundred lances were broken.',
  freydal: 'Maximilian of Austria, heir of the Empire, who loved the joust above statecraft.',
  palman: 'A German knight from Styria, captain of the Serbian king\'s German mercenaries.',
  ulrich: 'A Styrian knight and poet who rode the lists for his lady.',
  blackprince: 'The Prince of Wales, victor of Poitiers.',
};
export const bioOf = (k) => k.bio || KNIGHT_BIO[k.id] || '';
/** A knight's name as the herald announces it: Boucicaut's byname is spoken as such. */
export const hailName = (k) => k.name.replace(/, "(.*)"/, ', called $1');

/** The host of the royal box. real: only where history supports a name; otherwise a titled office. */
export const HOSTS = {
  smithfield: { id: 'richard', name: 'King Richard II', label: 'KING RICHARD II', real: true },
  bruges: { id: 'charles', name: 'Charles the Bold, Duke of Burgundy', label: 'CHARLES THE BOLD', real: true },
  inglevert: { id: 'lord', name: 'the Lord of the Lists', label: 'THE LORD OF THE LISTS', real: false },
  leon: { id: 'marshal', name: 'the Marshal of the Pass', label: 'THE MARSHAL OF THE PASS', real: false },
  nuremberg: { id: 'marshal', name: 'the Marshal of the Lists', label: 'THE MARSHAL OF THE LISTS', real: false },
};
export const hostOf = (venueId) => HOSTS[venueId] || { id: 'lord', name: 'the Lord of the Lists', label: 'THE LORD OF THE LISTS', real: false };

// Host reactions, by who he is. approve (a good stroke), scorn (a foul), joke (a miss), delight (an unhorsing), open (the start),
// restless (you keep the lists waiting at your mark). Each line <= 10 words.
export const HOST_LINES = {
  richard: {
    open: ['Begin, Master Clement. I came to see lances broken.', 'Let them ride. The day is short.'],
    approve: ['Well struck. Someone remember that man\'s name.', 'That is the riding I was promised.', 'Good. Now do it again.'],
    scorn: ['That was not a joust. That was an accident.', 'In my lists, we strike fair.'],
    joke: ['He has missed the whole knight. Quite a feat.', 'Somebody tell him the other man is over there.'],
    delight: ['Ha! Put that in the chronicle, Clement.', 'Down he goes! Bring wine, the day is won.'],
    restless: ['Start the damn joust before I piss myself!', 'Clement. Are they jousting, or praying?'],
  },
  charles: {
    open: ['Let it be worthy of my wedding. Begin.', 'Burgundy does nothing by halves. Let them ride.'],
    approve: ['Burgundy approves. That was well done.', 'A fine stroke. The court will remember it.', 'Now that is what I paid for.'],
    scorn: ['Not in my lists. Strike fair, or leave.', 'A foul blow at my wedding. Remarkable.'],
    joke: ['Even the horse looked embarrassed.', 'He rides like a man paid by the hour.'],
    delight: ['Magnificent! He shall dine at my table.', 'Down! The Golden Tree has seen a fall.'],
    restless: ['Start the damn joust before I piss myself!', 'Burgundy is not getting any younger.'],
  },
  lord: {
    open: ['The lists are open. Let the best man win.', 'Ride well, both of you.'],
    approve: ['Well struck. The lists approve.', 'That is a stroke worth the entry fee.'],
    scorn: ['That blow was foul. Ride fair.', 'I will not have that in my lists.'],
    joke: ['A miss. At least the horse looks well.', 'The grass has taken more damage than the knight.'],
    delight: ['Unhorsed! The field will talk of this.', 'A fall like that is worth the whole day.'],
    restless: ['Start the damn joust before I piss myself!', 'Is he waiting for the harvest?'],
  },
  marshal: {
    open: ['The field is yours, gentlemen. Ride well.', 'Lists open. Let the day be honest.'],
    approve: ['Good. Clean and hard.', 'That stroke was worth watching.'],
    scorn: ['Foul. The marshals have seen it.', 'That will cost him in the count.'],
    joke: ['He missed. We all saw it.', 'Air again. The lance is not to blame.'],
    delight: ['Down! Help that man to his feet.', 'A great fall. The lists are quiet.'],
    restless: ['Ride, sir, or leave my lists.', 'Any time today, gentlemen.'],
  },
};

// The announcer's intro, one beat each; spoken slowly in the stoppage, so each stays short.
export const INTRO = {
  venue: [
    '{venue}, in {city}, in the year {year}.',
    'Welcome to {venue}. {city}, in the year {year}.',
    'People of {city}: the lists at {venue} are open.',
    'Oyez. {venue}, {city}, in the year {year}. The heralds are in place.',
  ],
  names: [
    '{himFull}, of {land}, against {you}, bearing {arms}.',
    'From {land}, {himFull}. And {you}, of the arms {arms}.',
    'On one side, {himFull}, of {land}. On the other, {you}, bearing {arms}.',
  ],
  marks: ['Gentlemen, to your marks.', 'To your marks, gentlemen.', 'Gentlemen, take your lances. The cheque is open.'],
};

// Each knight's own man boasts about him in the line-up (one line, <= 12 words). Yours is your pursuivant if hired, else your squire.
export const BOAST_YOU = {
  pursuivant: ['{you} rides under {arms}. I carry the banner. We are ready.', 'Remember the name {you}. I will be shouting it all week.', 'Nobody rides {arms} like {you}. Nobody dares.'],
  squire: ['{you} has never once dropped his lance. Not on purpose.', 'Ride well, my lord. I have lances for a week.', '{you} is the finest knight here, and I am not biased.'],
};
// The opponent's herald, from what is known of him; knights without a line get a plain one.
export const BOAST_HIM = {
  clifford: ['Sir Thomas has held the northern marches for years.'],
  renaud: ['Renaud held Saint-Inglevert for thirty days against all comers. You are next.'],
  boucicaut: ['Boucicaut, Marshal of France, held the lists at Saint-Inglevert. Kneel early.'],
  lalaing: ['Lalaing has beaten the best knights in Burgundy, and he is bored.'],
  quinones: ['Quiñones held Órbigo bridge for three hundred lances. He will not stop.'],
  freydal: ['Maximilian is heir to the Empire, and he does not lose willingly.'],
  palman: ['Palman captained the German mercenaries of the King of Serbia. Think carefully.'],
  ulrich: ['Ulrich rode across Europe dressed as Lady Venus, and nobody laughed.'],
  blackprince: ['The Prince took a king prisoner at Poitiers. Today, you.'],
  _: ['{him} has never lost in front of a crowd like this. Pity.'],
};
export const boastFor = (kind, id) => { const a = kind === 'him' ? (BOAST_HIM[id] || BOAST_HIM._) : (BOAST_YOU[id] || BOAST_YOU.squire); return a[(Math.random() * a.length) | 0]; };

/** Fill {name} placeholders. */
export const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

// What Hugh says on the circuit screen: the opening of the road, the state of the table, the end. `place` is 1-based.
export const CIRCUIT = {
  start: ['Welcome. Five great lists lie ahead, and each one wants your blood or your purse. I will keep the cheque; you keep your seat.'],
  mid: ['The road continues. I have seen worse riders than you this year, and I have seen better.',
    'Another tourney, another crowd. Keep your seat and your purse.',
    'The next lists are called. Couch your lance, and let the heralds do the rest.'],
  mid1: ['You lead the table. Do not get comfortable; the commons turn quickly.'],
  done1: ['The circuit is run, and you have won it. I will cry your name myself.'],
  done: ['The circuit is run. It was an honest season, and the cheque will say so.'],
  rank: 'Your name is spoken in the lists now. You may learn a new skill: see Renown & Skills.',
};
export const circuitOpening = (round, place, done) => {
  const pick = (a) => a[(Math.random() * a.length) | 0];
  if (done) return pick(place === 1 ? CIRCUIT.done1 : CIRCUIT.done);
  if (round === 0) return pick(CIRCUIT.start);
  return place === 1 ? pick(CIRCUIT.mid1) : pick(CIRCUIT.mid);
};

// ---- Commentary that knows the stakes (career tournaments). Hugh speaks these in the intro and between courses; the host has a line for a final.
// Placeholders: {you} {him} {himFull} {venue} {size} {left} (knights still standing) {round}. Each line <= 16 words.
export const STAKES = {
  early: [
    'The first round. {size} knights began the day, and half will be gone by noon.',
    'Round one at {venue}. Win, and you ride again. Lose, and you watch.',
    'The first round is always the quickest. Nobody has learned the sand yet.',
  ],
  quarter: [
    'The quarter-final. Eight knights began, and four will see the semi-final.',
    'Quarter-final. The field is thinning, and the crowd can smell it.',
    'Eight knights left in the lists. Four will be going home today.',
  ],
  semi: [
    'The semi-final. Four knights remain, and two will ride in the final.',
    'Semi-final at {venue}. One more win and {you} rides for the prize.',
    'Four knights left, and the stands are full. The semi-final.',
  ],
  final: [
    'The final. Two knights remain at {venue}, and only one will take the prize.',
    'This is the final. Whatever happens now, the heralds will cry it.',
    'The final, and the whole city is holding its breath.',
  ],
  first: [
    'It is {you}\'s first tournament. The heralds have no record of him. Let us give them one.',
    'A first tournament for {you}. Every great name began on a first day.',
  ],
  rematch: [
    '{him} beat {you} once before. The crowd has not forgotten, and neither has {you}.',
    'A rematch. {him} has the better of it so far. {you} would like that changed.',
    '{you} meets {him} again. Last time it went to {him}.',
  ],
  lead: [
    '{you} leads. The count is {yourScore} to {hisScore}, and {him} must answer.',
    '{you} is ahead, {yourScore} to {hisScore}. Do not get comfortable.',
    'The lead is {you}\'s, and a lead is the first thing a tournament takes away.',
  ],
  trail: [
    '{him} leads, {hisScore} to {yourScore}. {you} has a hole to climb out of.',
    'Behind, {yourScore} to {hisScore}. Another round of this and {you} goes home.',
    '{you} trails. The knockout does not wait for anyone to find his seat.',
  ],
  // the victory lap: Hugh calls the prize while the winner rides the lists (purse = the marks; prize = the tournament prize)
  lapPurse: [
    'The purse is {marks} marks, to {you}.',
    '{marks} marks to {you}, for the day. The lists thank him.',
  ],
  lapPrize: [
    '{you} wins the tournament at {venue}. The prize is {marks} marks, and the honour is his.',
    'Champion of {venue}: {you}. The prize is {marks} marks.',
  ],
  lapOut: [
    '{him} takes the day, and the purse of {marks} marks.',
    'The day goes to {him}. {you} rides to his tent.',
  ],
  lapDraw: ['Honours are even. The knights salute the box, and the purse is shared.'],
};
// The host stands for the final.
export const HOST_FINAL = {
  richard: ['The final. Now we shall see which of them is worth the crown.'],
  charles: ['The final, at my wedding. Let it be a day I tell my grandchildren.'],
  lord: ['The final. Let the best man win, and let me watch it.'],
  marshal: ['The final. Ride well, both of you.'],
};
