// What the stands shout. Plain data, no imports (tools/voice/extract_lines.mjs builds the TTS inventory from it); src/crowd_voices.js places each shout at a spectator.
// Sources for the cries and customs: docs/voice-plan.md section 8 ("What tournament crowds shouted").
//
// FORMAT  [voice, text]  or  [voice, 'text with {you}', 'name-free variant'].
//   voice: a key of CROWD_VOICES (who shouts it, and so where in the stands it comes from).
//   Placeholders: {name} a knight's short name (closed set: the roll in data.js), {you} the player (free-typed: always has a variant),
//   {colours} the plain colours of a shield ("red and white"), {cry} that knight's war cry (CRY below). Shouts are 1-8 words.

// Who shouts, where they sit (crowd.js classes: 0 commons standing at the rail, 1 burghers, 2 nobles and ladies, 3 clergy; kind 0 man, 1 woman, 2 child).
export const CROWD_VOICES = {
  man:       { tag: 'A MAN AT THE RAIL',  cls: [0, 1], kind: 0 },
  woman:     { tag: 'A WOMAN',            cls: [0, 1], kind: 1 },
  oldman:    { tag: 'AN OLD MAN',         cls: [1],    kind: 0 },
  oldwoman:  { tag: 'A FISHWIFE',         cls: [0, 1], kind: 1 },
  youth:     { tag: 'AN APPRENTICE',      cls: [0],    kind: 0 },
  child:     { tag: 'A CHILD',            cls: [0, 1], kind: 2 },
  drunk:     { tag: 'A DRUNK',            cls: [0],    kind: 0 },
  bettor:    { tag: 'A BETTING MAN',      cls: [0, 1], kind: 0 },
  lady:      { tag: 'A LADY',             cls: [2],    kind: 1 },
  gallant:   { tag: 'A YOUNG LORD',       cls: [2],    kind: 0 },
  monk:      { tag: 'A FRIAR',            cls: [3],    kind: 0 },
  dog:       { tag: 'A DOG',              cls: [0],    kind: 0 },
};

// Plain colour words for the commons (they shout "the red and white", not blazon).
export const COLOUR_WORDS = { Or: 'gold', Argent: 'white', Gules: 'red', Azure: 'blue', Vert: 'green', Sable: 'black', Purpure: 'purple', 'Tenné': 'orange', Celeste: 'sky-blue' };

// War cries by land (the knight's `land` in data.js). The commons of his party cry it when he rides.
export const CRY = {
  England:  ['Saint George!', 'Saint George! Saint George!', 'For England and Saint George!'],
  France:   ['Montjoie! Saint-Denis!', 'Montjoie Saint-Denis!', 'Montjoie!'],
  Burgundy: ['Montjoie Saint-Andrieu!', 'Notre-Dame! Bourgogne!', 'Bourgogne!'],
  'León':   ['Santiago!', 'Santiago! Santiago!', 'Santiago, y cierra, España!'],
  Empire:   ['For the Emperor!', 'Hoch! Hoch! Hoch!', 'Austria! Austria!'],
  Styria:   ['Styria! Styria!', 'Hoch! Hoch!'],
  any:      ['God and the right!', 'God speed him!'],
};

// Supporters' chants, for whichever side has the stands.
export const CHANT = {
  him: [['man', 'A {name}! A {name}!'], ['man', '{name}! {name}! {name}!'], ['youth', 'Come on, {name}!'], ['woman', '{name}! God keep you, {name}!'], ['man', '{cry}']],
  you: [['man', 'A {you}! A {you}!', 'The {colours}! The {colours}!'], ['youth', '{you}! {you}!', 'Come on, the {colours}!'], ['woman', 'God keep you, {you}!', 'God keep the {colours}!'], ['man', 'Hey! Hey! The {colours}!']],
  honour: [['lady', 'To the honour of the ladies!'], ['gallant', 'For the ladies! For the ladies!'], ['oldman', 'Honour! Honour!']],
};

export const SHOUT = {
  start: [
    ['man', 'Here they come!'], ['youth', 'About time!'], ['woman', 'Look at the horses! Oh, look!'], ['child', 'Is that the King? Is that the King?'],
    ['oldwoman', 'Get your hat off, I cannot see!'], ['drunk', 'Lances! Lances for everyone!'], ['bettor', 'Two to one the blue! Two to one!'], ['oldman', 'Not like the old days. Look at them. Babies.'],
    ['gallant', 'Ten crowns on the home man.'], ['lady', 'Which is he? The one with the feathers?'],
  ],
  ready: [
    ['man', 'Come on! Come on!'], ['youth', 'Get on with it!'], ['oldwoman', 'Quiet, you, he is about to go!'], ['child', 'Mother, I cannot see!'], ['woman', 'Sit down at the front!'],
    ['drunk', 'Lower the flag! Lower it! Lower... the flag.'], ['bettor', 'Last bets! Last bets on the course!'], ['man', 'Shh! Shh!'], ['monk', 'Lord, have mercy on the both of them.'], ['lady', 'I cannot look. Tell me when.'],
  ],
  away: [
    ['man', 'Go on!'], ['youth', 'Ride! Ride!'], ['woman', 'Go on, then!'], ['man', 'Now! Now!'], ['child', 'Go! Go! Go!'], ['drunk', 'Faster! Fast... faster!'], ['oldman', 'Point down, boy! Point down!'], ['gallant', 'Lower, man, lower!'],
  ],
  break: [
    ['man', 'Broken!'], ['youth', 'Did you see that? Did you see it?'], ['woman', 'Oh, well struck!'], ['man', 'Splinters! Ha!'], ['oldman', 'That is how it is done!'],
    ['child', 'It broke! It broke!'], ['drunk', 'Again! Do it again!'], ['bettor', 'That is my money, that is!'], ['gallant', 'Bravely struck, sir!'], ['oldwoman', 'Mind the wood! There is wood coming!'],
    ['man', 'Another lance! Another!'], ['youth', 'Smashed it!'],
  ],
  helm: [
    ['man', 'On the helm!'], ['oldman', 'Rang him like a bell!'], ['youth', 'Right in the face! Ha!'], ['woman', 'Oh, the poor man\'s head!'], ['child', 'Is he dead? Is he dead?'],
    ['drunk', 'Ding! Ding!'], ['gallant', 'The sight! Right in the sight!'], ['lady', 'Oh! Oh, I cannot bear it!'],
  ],
  glance: [
    ['man', 'Ohhh!'], ['woman', 'So close!'], ['oldman', 'Square, man! Hit it square!'], ['youth', 'Skidded off!'], ['oldwoman', 'Too gentle! You\'re not courting her!'], ['bettor', 'That counts? Does that count?'],
  ],
  attaint: [
    ['man', 'A touch! Only a touch!'], ['oldman', 'Should have broken. That should have broken.'], ['youth', 'Break it! Break it next time!'], ['bettor', 'One point. One miserable point.'],
  ],
  miss: [
    ['youth', 'Missed! Missed by a mile!'], ['man', 'My grandmother rides straighter!'], ['oldwoman', 'Open your eyes, sir!'], ['drunk', 'Where\'s the other one gone?'],
    ['man', 'Boo!'], ['youth', 'Hit something! Anything!'], ['bettor', 'I paid good money for that!'], ['oldman', 'Lowered too soon. Always too soon.'],
    ['child', 'He missed!'], ['woman', 'Oh, for shame.'],
  ],
  bothMiss: [
    ['man', 'Are they courting?'], ['youth', 'Kiss him next time!'], ['drunk', 'They\'re friends! Look! They\'re friends!'], ['oldwoman', 'I could do better with a broom!'],
    ['man', 'Whistle them off!'], ['bettor', 'Nobody wins that! Nobody!'],
  ],
  near: [
    ['woman', 'Oh! Oh, that was close!'], ['man', 'By his ear!'], ['lady', 'Saints preserve him!'], ['youth', 'An inch! An inch!'],
  ],
  tilt: [
    ['man', 'Mind the barrier!'], ['youth', 'He\'s hit the fence! Ha!'], ['oldman', 'Into the tilt. Disgraceful.'], ['oldwoman', 'Somebody\'s paying for that!'],
  ],
  foul: [
    ['man', 'Foul! Foul!'], ['woman', 'The horse! The poor horse!'], ['oldman', 'Shame! For shame!'], ['youth', 'Off! Get him off!'], ['child', 'He hurt the horse!'], ['monk', 'God forgive him.'],
    ['man', 'Shame on you, sir!'],
  ],
  unhorse: [
    ['man', 'He\'s down! He\'s down!'], ['woman', 'Oh, Jesu!'], ['youth', 'Off he goes!'], ['oldwoman', 'Like a sack of turnips!'], ['child', 'He fell off! He fell off!'],
    ['drunk', 'Get up! Get up and fight him!'], ['bettor', 'Pay me! Pay me!'], ['lady', 'Is he hurt? Somebody look!'], ['monk', 'Lord have mercy.'], ['oldman', 'Over the cantle. Seen it a hundred times.'],
    ['man', 'Ho! Ho! A man down!'], ['gallant', 'Unhorsed, by God!'],
  ],
  win: [
    ['man', 'Huzzah! Huzzah!'], ['woman', 'God bless him!'], ['youth', 'Champion! Champion!'], ['child', 'He won! He won!'], ['oldman', 'Well ridden, sir. Well ridden.'], ['drunk', 'Drink! Everybody drink!'],
    ['bettor', 'Pay up! Pay up, the lot of you!'], ['lady', 'Bravo! Oh, bravo!'], ['gallant', 'Largesse! Largesse!'], ['man', 'Largesse, my lord! Largesse!'],
  ],
  loss: [
    ['man', 'Bad luck, sir!'], ['woman', 'There, there. Next time.'], ['oldman', 'He rode well enough.'], ['bettor', 'There goes the rent.'], ['youth', 'Rubbish! Rubbish!'], ['drunk', 'I knew it. I knew it all along.'],
  ],
  // the gallery's women call to favourites when a knight does something fine (and the salute)
  gallery: [
    ['lady', 'Oh, well struck, sir!'], ['lady', 'Sir knight! Sir knight, here!'], ['lady', 'Look this way, sir!'], ['lady', 'My lady says you ride very well!'],
    ['woman', 'I\'ll have him! I\'ll have that one!'], ['oldwoman', 'Leave him alone, he\'s spoken for!'], ['lady', 'For you, sir! Catch!'], ['woman', 'Marry me! Marry me after!'],
  ],
  // between courses: the stands talk among themselves (heckling, betting, gossip, the children, the dog)
  idle: [
    ['bettor', 'Three to one the stranger! Who\'ll take three to one?'], ['bettor', 'Evens, evens on the next course!'], ['bettor', 'A penny says he falls. A penny!'], ['bettor', 'Who had money on the blue? Hard luck.'],
    ['man', 'Oi! Herald! What\'s the score?'], ['youth', 'Get on with it! We\'re dying of age up here!'], ['oldman', 'In my day they had proper lances.'], ['oldwoman', 'Take your elbow out of my pie.'],
    ['drunk', 'I could do that. I could. Give me a horse.'], ['drunk', 'Who took my ale? Somebody took my... oh. There it is.'], ['drunk', 'Sing! Somebody sing!'],
    ['child', 'I need to piss.'], ['child', 'When do they fall off again?'], ['child', 'Can I be a knight? Can I?'],
    ['woman', 'That one\'s married. That one\'s married. That one should be.'], ['woman', 'Look at the Queen\'s sleeves. Look at them.'], ['oldwoman', 'My Tom rode at Smithfield. Fell off twice. Still talks about it.'],
    ['man', 'Sit down at the front!'], ['man', 'Who\'s got the pies? Over here!'], ['youth', 'Oi! Pie man!'], ['monk', 'Brothers, a little more charity, and a little less ale.'],
    ['gallant', 'They say the Duke paid for his horse with his wife\'s jewels.'], ['lady', 'I hear his squire owes everybody money.'], ['oldman', 'Lances made of fir. Fir! Christmas wood.'],
    ['dog', 'Woof! Woof!'], ['dog', 'Grr... woof!'], ['man', 'Whose dog is this? Get it off the sand!'], ['child', 'Doggy! Here, doggy!'],
  ],
  // the heralds are paid by the largesse thrown to them: the commons cry it when a lord throws coin
  largesse: [['man', 'Largesse! Largesse!'], ['youth', 'Throw it here, my lord!'], ['oldwoman', 'A penny for the herald, and one for me!']],
};

// Vendors walking the stands (stands_life.js has three of them; the other cries come from sellers who are heard, not built).
export const VENDOR = {
  pie: ['Hot pies! Hot mutton pies, a penny apiece!', 'Pies! Kidney and onion, hot from the oven!', 'Fresh pies for the hungry! Hot pies!', 'Pies here! Better than the jousting!', 'Eel pie! Fresh eel pie! Caught this week!', 'Pie, sir? You look like a man who needs a pie.'],
  meat: ["Cat's meat! Hot skewers, a farthing each!", 'Meat on a stick! Hot from the fire, good sirs!', "Cat's meat! Penny a skewer, penny a skewer!", 'Hot skewers! Do not ask what it is! Hot skewers!', 'Roast meat! Smells of victory!'],
  wine: ['Hot spiced wine! Warm your bones, good sirs!', 'Wine, hot and spiced! A farthing the cup!', 'Mulled wine for the cold and the thirsty!', 'Wine! Gascon wine! Mostly Gascon!', 'A cup for the loser, a cup for the winner! Wine!'],
  ale: ['Ale! Good ale! Brewed this morning!', 'Ale here! Ale for the thirsty!', 'Small beer for the children, strong ale for the fathers!'],
  nuts: ['Hot chestnuts! Hot chestnuts!', 'Hazelnuts! A handful for a farthing!'],
  wafers: ['Wafers! Sweet wafers! Fit for a duchess!', 'Gingerbread! Gilded gingerbread!'],
};

// Walla beds: layered crowd voices under the shouts. Descriptions for later sound generation (not spoken lines); seconds = loop length.
export const WALLA = [
  { id: 'bed_idle', seconds: 30, when: 'ready / between courses', desc: 'Large outdoor medieval crowd, 2,000 people, murmuring and chatting, English, a few laughs, a baby, a dog far off, vendors calling far away; no clear words; loopable.' },
  { id: 'bed_tense', seconds: 12, when: 'flag up, before the signal', desc: 'The same crowd hushing: murmur dropping to whispers, a cough, a horse snorting close, one man shushing; loopable.' },
  { id: 'bed_charge', seconds: 8, when: 'the charge', desc: 'Crowd rising into a roar as horses gallop past, rhythmic shouts of "go on", stamping on timber benches.' },
  { id: 'bed_roar', seconds: 6, when: 'a lance broken, helm strike', desc: 'Huge roar and applause, timber benches drummed, whistles, cheering trailing into excited chatter.' },
  { id: 'bed_gasp', seconds: 5, when: 'an unhorsing, a near miss at the helm', desc: 'A sharp collective gasp, then a stunned murmur, women crying out, rising chatter.' },
  { id: 'bed_groan', seconds: 4, when: 'a miss, a glance', desc: 'A long disappointed "ohh" from the crowd, a few jeers and whistles, laughter.' },
  { id: 'bed_boo', seconds: 5, when: 'a foul, the barrier struck', desc: 'Angry booing and whistling, men shouting "shame", fists on wood.' },
  { id: 'bed_chant_name', seconds: 6, when: 'a knight\'s supporters chant', desc: 'Two hundred voices chanting a two-syllable name in rhythm, clapping on the beat, English commons; the name is left as an open vowel "AH-AH" so the name clip can be laid over.' },
  { id: 'bed_gallery', seconds: 10, when: 'the ladies\' gallery between courses', desc: 'Close, refined chatter of noblewomen and courtiers, fans, silk rustling, polite laughter, a lute far off.' },
  { id: 'bed_tavern', seconds: 10, when: 'the commons standing at the rail', desc: 'Rowdy commons close by, ale cups, a drunk singing two lines badly, laughter, a woman telling someone off.' },
  { id: 'bed_largesse', seconds: 5, when: 'the winner throws coin, the end of the match', desc: 'Crowd shouting "Largesse! Largesse!" in uneven unison, coins clinking, scrambling.' },
  { id: 'bed_victory', seconds: 10, when: 'the match won', desc: 'Huge sustained cheering, trumpets far off, hats thrown, chanting, the crowd standing.' },
];
