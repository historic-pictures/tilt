// The commentary booth: two voices above the lists, the FIFA layer. Plain data, no imports, so a TTS batch can be built from it (tools/voice/extract_lines.mjs).
//
// THE CAST
//   P  Master Ambrose Pell, Windsor Herald. Calls the action. Exact, dry, a little weary; knows everyone's debts.
//   C  Sir Walter Drewe, an old knight who rode in his day. Opinions, anecdotes, his knees, and modern lances.
//
// REGISTER (Wolf Hall): plain modern rhythm, period words used as working words (lists, tilt, course, attaint, coronel, vamplate, grapper, the King's grace).
// No thee/thou. Understatement, gossip, now and then menace. Funny because it is meant.
//
// FORMAT
//   a line      ['P', 'text']
//   templated   ['P', 'text with {you}', 'the same thought with no name']      every templated line carries a name-free variant (free-typed names cannot be recorded)
//   exchange    [['P', '...'], ['C', '...'], ...]                                played turn by turn; each turn follows the same rules as a line
// Placeholders (closed sets, so they can be recorded as clips and spliced): {you} {him} {himFull} {land} {venue} {city} {horse} {hisHorse} {arms} {hisArms} {score}
// Fragment rule: a placeholder sits at a clean cut (the start of a sentence, or after a comma, or at the end), never mid-phrase.
// Lengths: charge lines <= 6 words, exclamations <= 4, everything else <= 20 words a turn.

export const BOOTH_CAST = {
  P: { id: 'pell', label: 'PELL · THE BOOTH', name: 'Master Ambrose Pell, Windsor Herald' },
  C: { id: 'drewe', label: 'SIR WALTER · THE BOOTH', name: 'Sir Walter Drewe' },
};

export const BOOTH = {
  // ---------------------------------------------------------------- BUILD-UP
  welcome: [
    [['P', 'Good day. Ambrose Pell, Windsor Herald, with Sir Walter Drewe.'], ['C', 'Who rode, when lances were lances.']],
    [['P', 'Welcome to {venue}. The stands are full and the surgeon is sober.', 'Welcome to the lists. The stands are full and the surgeon is sober.'], ['C', 'For now.']],
    [['P', 'A fine day for it, Sir Walter.'], ['C', 'Every day is a fine day for it. Unless you are the one on the sand.']],
    ['P', 'Good afternoon. If you have money on this, you are not alone. Or wise.'],
    [['P', 'The heralds have the roll, the judges their flags, the King his dinner.'], ['C', 'One of those will be disappointed.']],
    [['P', 'Sir Walter, you rode in more lists than you can count.'], ['C', 'I can count them. I can count the bones too. Fourteen.']],
    [['P', 'If you hear shouting, that is the commons.'], ['C', 'If you hear weeping, that is the bookmakers.']],
    [['P', 'Sir Walter, how do you feel?'], ['C', 'Like a man with a seat and no lance. Envious.']],
    ['P', 'Every bench is taken. Some of them twice, by men who paid once.'],
    [['P', 'A crowd of thousands, Sir Walter.'], ['C', 'And every one of them knows better than the knights. I was the same.']],
  ],
  venue: {
    smithfield: [
      [['P', 'Smithfield, outside the walls of London. King Richard has laid on jousts that will be talked of.'], ['C', 'Talked of and paid for. Not by him.']],
      [['P', 'The stands were raised by the Clerk of the King\'s Works.'], ['C', 'A man called Chaucer. Writes verses, I hear.'], ['P', 'Then let us hope the benches scan.']],
      ['P', 'The knights rode out from the Tower this morning, each led by a lady on a silver chain.'],
      [['P', 'You will see the white hart on half the coats in the stands. The King\'s badge.'], ['C', 'Half the coats, and none of the debts.']],
      ['C', 'Smithfield. They sell horses here on Fridays. Some of these will be sold on Friday.'],
      ['P', 'Smithfield is also where they burn people. The King asks that you enjoy the jousting.'],
    ],
    inglevert: [
      [['P', 'Saint-Inglevert, near Calais. Three French knights hold the field against all comers for thirty days.'], ['C', 'Thirty days. My wife held a grudge for thirty years. Less exercise.']],
      ['P', 'At Saint-Inglevert you touch a shield to choose: the shield of peace, or the shield of war.'],
      [['P', 'The English come over the water in boatloads to try the French.'], ['C', 'And go back in fewer boats, lighter, and lame.']],
      ['P', 'The holders are Boucicaut, de Roye and Sempy. They have pitched their tents and they mean to stay.'],
      ['C', 'Calais. English town, French weather, Flemish beer. I have been sick in all three.'],
    ],
    leon: [
      [['P', 'The bridge at Órbigo, on the pilgrims\' road to Santiago. The Passo Honroso.'], ['C', 'Pilgrims come here to save their souls. They stay to watch men lose their teeth.']],
      ['P', 'Suero de Quiñones has vowed to break three hundred lances here, and wears an iron collar every Thursday for a lady.'],
      [['P', 'The rule of the passage: no knight crosses the bridge without breaking lances.'], ['C', 'Or leaving his right spur. I would leave the spur.'], ['P', 'You did, I am told. Twice.']],
      ['C', 'Hot here. The Castilians wear iron in this. Mad, the lot of them. I admire it.'],
      ['P', 'One knight at Órbigo took a point through the eye and died on the field. They still came. They kept coming.'],
    ],
    bruges: [
      [['P', 'Bruges, the market place, the pas of the Golden Tree, for the Duke\'s wedding.'], ['C', 'Burgundy. Even the horses have better manners than I do.']],
      ['P', 'There is a dwarf with an hourglass. When the sand runs out, the course is over.'],
      [['P', 'There is also a giant, in chains, led by the dwarf.'], ['C', 'Allegory.'], ['P', 'Burgundy. Everything is allegory, and all of it is gilded.']],
      ['C', 'The Duke of Burgundy spends more on a wedding than England spends on a war.'],
      [['P', 'Cloth of gold on every rail, Sir Walter.'], ['C', 'Lovely. Fall on it, and they bill your widow.']],
    ],
    nuremberg: [
      [['P', 'Nuremberg, the market square, the Gesellenstechen. The sons of the patricians, at the joust.'], ['C', 'Merchants\' boys in iron. I said it would come to this.']],
      ['P', 'German harness for the Stechen: the helm bolted to the breastplate. You see out by leaning forward.'],
      [['P', 'The Emperor himself is in the stands.'], ['C', 'He jousts, you know. Wrote a book about it. With himself as the hero.'], ['P', 'Most books are.']],
      ['C', 'The Germans fall off a great deal. They make a science of it. The Stechsack, a sack of straw for your legs.'],
      ['P', 'No barrier in the German joust, Sir Walter. Left side to left side, in the open.'],
    ],
  },
  mode: {
    planken: [
      ['P', 'The standard cheque: a touch one, a lance broken two, broken on the helm three.'],
      [['P', 'A barrier down the middle, coronels on the lances. The joust of peace.'], ['C', 'Peace. Ask my collarbone.']],
    ],
    tiptoft: [
      [['P', 'Today we run under the Earl of Worcester\'s ordinances. Tiptoft\'s rules.'], ['C', 'Clever man, Tiptoft. They cut his head off.'], ['P', 'Not for the scoring.']],
      ['P', 'Under Tiptoft, a spear broken on the body is one, on the helm two, bearing your man down three.'],
      [['P', 'A touch that breaks nothing counts for nothing. Three strokes in the sight of the helm take the prize.'], ['C', 'The sight. The slit. A hand wide. Good luck.']],
      ['P', 'Strike the horse under these rules and the prize is gone. No appeal, no excuse.'],
    ],
    castile: [
      [['P', 'The Statutes of the Band, of King Alfonso. No barrier, and no rest for the lance.'], ['C', 'The proper way. You hold the thing up with your arm and your pride.']],
      ['P', 'Four courses only. Only a lance splintered with the point counts. Broken crosswise, nothing.'],
    ],
    sudden: [
      [['P', 'Sudden death. The first lance broken takes the joust.'], ['C', 'I like it. Nobody has to count.']],
      ['P', 'One clean break ends it. Touches count for nothing. Nerves count for everything.'],
    ],
    judged: [
      [['P', 'The judged tilt, six courses on a card. The judges mark the style as well as the strokes.'], ['C', 'Style. In my day style was staying on.']],
      ['P', 'A point for a steady lance, a point for raising it in good time, and one off for leaving it low.'],
    ],
    bridge: [
      [['P', 'Keep the bridge. Three challengers, one after another, and nothing mended between them.'], ['C', 'Like marriage.']],
      ['P', 'Win two bouts and the bridge is held. The horse does not get a new pair of legs for the second.'],
    ],
    gestech: [
      [['P', 'The German joust of peace. Open field, low saddles, and the riders go over often.'], ['C', 'They are meant to. The Germans like a fall. Gives the surgeons a living.']],
      ['P', 'Break the lance or bear the man down. That is the whole of it in the Gestech.'],
    ],
    rennen: [
      [['P', 'The Scharfrennen. Sharp points and solid lances. The joust of war.'], ['C', 'Now we are talking. Now somebody might get hurt.'], ['P', 'Sir Walter is pleased.']],
      ['P', 'The mark is the tall shield on the breast. Strike it square and it springs away. Nothing else counts.'],
    ],
  },
  knight: {
    clifford: [
      ['P', 'Sir Thomas Clifford, an English knight of the old school. Mail, and opinions.'],
      [['P', 'Clifford rides a rouncey. Honest horse.'], ['C', 'Honest and slow. Like Clifford.']],
      ['C', 'Clifford holds the lists here. He will not be in a hurry to give them up.'],
    ],
    renaud: [
      ['P', 'Renaud de Roye, one of the three holders at Saint-Inglevert. Fast, and he knows it.'],
      [['P', 'De Roye comes on harder than anyone on the roll.'], ['C', 'He comes on like a debt collector. Very fast, no conversation.']],
      ['C', 'A courser under de Roye. That horse would charge the sea.'],
    ],
    boucicaut: [
      [['P', 'Jean le Meingre, Boucicaut. They say he can climb a ladder from underneath, in full harness, with his hands.'], ['C', 'I can barely climb into bed.']],
      ['P', 'Boucicaut. Marshal of France one day, if nobody kills him first. Nobody has managed it.'],
      ['C', 'Boucicaut does not smile on the field. I asked him once. He said he would smile when it was over.'],
    ],
    lalaing: [
      [['P', 'Jacques de Lalaing. The good knight. Unbeaten, by most accounts.'], ['C', 'By his accounts.'], ['P', 'Those are the accounts that get written.']],
      ['P', 'Lalaing held a pavilion by a fountain at Chalon for a year, against all comers. The Fountain of Tears.'],
      ['C', 'Lalaing fought the Douglases at Stirling, before the Scottish King. Lived. That tells you plenty.'],
    ],
    quinones: [
      [['P', 'Suero de Quiñones. The man who holds the bridge.'], ['C', 'The man with the collar. For a lady. Every Thursday.'], ['P', 'It is not Thursday.'], ['C', 'Then he is dressed for jousting. Worse luck for somebody.']],
      ['P', 'Three hundred lances, he vowed. He is counting. So are the carpenters.'],
      ['C', 'An Andalusian under him. Turns like a cat. Quiñones turns like a cat as well.'],
    ],
    freydal: [
      [['P', 'They call him Freydal. The rest of us call him Your Majesty, and look at the floor.'], ['C', 'He jousts in a mask. Everyone knows who it is. Everyone loses carefully.']],
      ['P', 'Freydal, in German harness, the Stechzeug. Bolted, doubled, near enough a wall.'],
      ['C', 'Hitting the Emperor is permitted. Afterwards it is remembered.'],
    ],
    palman: [
      ['P', 'Palman of Styria. He captained the German men for the King of Serbia. He does not joust for fun.'],
      [['P', 'Palman rides heavy and sits like a rock.'], ['C', 'A mercenary. He will be counting the fee while he aims.']],
      ['C', 'Palman has been paid to kill people in three kingdoms. Breaking a lance is a holiday.'],
    ],
    ulrich: [
      [['P', 'Ulrich von Liechtenstein. He once rode from Venice to Bohemia dressed as Venus.'], ['C', 'And broke three hundred lances doing it. Which is more than I managed in a dress.']],
      ['P', 'They say Ulrich cut off his own finger and sent it to his lady. She was not as moved as he hoped.'],
      ['C', 'Liechtenstein writes poems about himself. Long ones. Let us hope he jousts short.'],
    ],
    blackprince: [
      [['P', 'Edward, the Black Prince. Three feathers on the shield. Ich dien. I serve.'], ['C', 'He serves it hot.']],
      ['P', 'The Prince has the finest seat in Christendom and the worst temper. Both will be on show.'],
      ['C', 'I rode against the Prince once. I remember the sky very well.'],
    ],
    field: [
      ['P', '{himFull}, of {land}. New to most of us.', 'A new man on the roll. New to most of us.'],
      [['P', 'Out of {land}, this one.', 'He is out of the provinces, this one.'], ['C', 'Hungry, then. Hungry men ride straight.']],
      ['C', 'I know nothing about {him}. That frightens me more than knowing.', 'I know nothing about him. That frightens me more than knowing.'],
      ['P', 'His arms are {hisArms}. Not old arms. Bought, some say.', 'Not old arms, his. Bought, some say.'],
      [['P', 'The heralds have very little on {him}.', 'The heralds have very little on him.'], ['C', 'Then let him write his own page.']],
      ['C', 'He has the look of a man who has been told he is good. We shall see who told him.'],
    ],
  },
  you: {
    new: [
      [['P', 'And here is {you}, whom nobody has heard of.', 'And here is a knight whom nobody has heard of.'], ['C', 'Everybody was nobody once. I was nobody for years.']],
      ['P', 'First time in the lists for {you}. Note the lance; it is shaking a little.', 'First time in the lists for this one. Note the lance; it is shaking a little.'],
      ['C', 'I remember my first course. I remember the ground most clearly.'],
      ['P', 'No record, no reputation, no debts yet. Give it an afternoon.'],
    ],
    rising: [
      ['P', '{you} has begun to be talked about. In taverns. Favourably, mostly.', 'This one has begun to be talked about. In taverns. Favourably, mostly.'],
      [['P', 'A few wins on the roll now for {you}.', 'A few wins on the roll now.'], ['C', 'Enough to be dangerous. Not enough to be careful.']],
      ['C', 'Rides like he has something to prove. He has. Most of it to his father.'],
    ],
    known: [
      ['P', '{you}, whose name the heralds no longer have to spell.', 'A knight whose name the heralds no longer have to spell.'],
      [['P', 'A real record now. Lances broken all over the circuit.'], ['C', 'And some ribs. Not his.']],
      ['C', 'The young ones watch how he sits. I watch how he sits. He sits well. I hate him a little.'],
    ],
    champion: [
      [['P', 'A champion of the circuit in the lists today. {you}.', 'A champion of the circuit in the lists today.'], ['C', 'Champions fall too. They just fall from higher.']],
      ['P', 'Honours on the roll, and the King knows the name. That is a dangerous thing, to be known to the King.'],
    ],
  },
  grudge: [
    [['P', '{him} beat {you} last time.', 'He beat our man last time they met.'], ['C', 'He remembers. The horse remembers. Even I remember, and I remember nothing.']],
    ['P', 'There is history here. The last meeting went the other way, and nobody has forgotten.'],
    ['C', 'A man you lost to is a man you dream about. Not in a good way.'],
    [['P', 'This is the rematch.'], ['C', 'Rematch. Polite word for revenge.']],
  ],
  revenge: [
    ['P', '{you} beat {him} the last time. {him} has not stopped talking about it.', 'Our man won the last time they met. The other has not stopped talking about it.'],
    [['P', 'He lost the last one, Sir Walter.'], ['C', 'Then he has been practising. Watch the first course.']],
    ['C', 'Beat a man once, he comes back angry. Beat him twice, he comes back with friends.'],
  ],
  arms: [
    ['P', '{you} bears {arms}.', 'Note the arms on the shield, plain enough to read at a gallop.'],
    [['P', 'The arms are {arms}.', 'Good honest colours on that shield.'], ['C', 'Good colours. You can see them from the back row, and from the floor.']],
    ['C', 'Fine arms. Of course, the shield will look different after the first course.'],
    ['P', 'Against him, {hisArms}. The heralds will be painting those on the roll tonight, one way or the other.', 'The heralds will be painting both shields on the roll tonight, one way or the other.'],
  ],
  horse: {
    destrier: [
      [['P', 'A destrier. The great horse.'], ['C', 'Slow to start, impossible to stop. I married one.']],
      ['C', 'That is a destrier. You do not ride it so much as negotiate.'],
      ['P', 'The destrier is heavy in the shock. The lance goes where the horse goes, and the horse goes through.'],
    ],
    courser: [
      [['P', 'A courser. Fast and hot.'], ['C', 'Fast and hot and thinks for himself. Never trust a horse that thinks.']],
      ['C', 'Coursers. Brilliant animals. The lance bounces like a cart on a Kent road.'],
      ['P', 'A courser brings speed to the strike. Whether the rider keeps up is another matter.'],
    ],
    andalusian: [
      [['P', 'An Andalusian. Collected, smooth, quick away.'], ['C', 'Spanish horse. Better manners than a Spanish ambassador.']],
      ['C', 'Andalusian. Dances when it walks. I danced once. Never again.'],
    ],
    rouncey: [
      [['P', 'A rouncey. An honest all-rounder.'], ['C', 'Honest is what we say about a horse when it is not fast.']],
      ['C', 'Rouncey. Will not win you a kingdom. Will get you home from losing one.'],
      ['P', 'Light in the shock, the rouncey, but it never tires and it never panics.'],
    ],
  },
  stakes: {
    final: [
      [['P', 'This is the final. The prize joust. Everything the season has been is in these few courses.'], ['C', 'And the purse. Do not forget the purse. Nobody else has.']],
      ['P', 'The last day of the event. Win here, and the heralds cry your name in the hall tonight.'],
      ['C', 'Finals. I rode in four. Won one. Do not ask about the other three. Ask about the one.'],
    ],
    first: [
      ['P', 'The first day of a first season. Somebody in this field is about to learn something.'],
    ],
    early: [
      ['P', 'An early round. Lose here and you are a spectator with very good seats.'],
      [['P', 'Not the final, Sir Walter, but it matters.'], ['C', 'They all matter. You only notice afterwards.']],
    ],
  },

  // ---------------------------------------------------------------- THE COURSE
  ready: [
    ['P', 'Lances up. Visors down. This is the quiet bit.'],
    [['P', 'The marshal has the flag.'], ['C', 'Here is where the bladder makes its views known.']],
    ['P', 'Both at their marks. The squires step back.'],
    ['C', 'Look at the horses. Ears forward. They know before we do.'],
    ['P', 'The commons hush. Even the pie man stops.'],
    [['P', 'Not long now.'], ['C', 'It is always long now. That is the problem.']],
    ['P', 'The flag is up. Both knights waiting on it.'],
    ['C', 'Breathe out. Seat down. Look at his shield, not his eyes. His eyes are not interesting.'],
  ],
  away: [
    ['P', 'And they are away.'],
    ['P', 'Away they go.'],
    ['P', 'Spurs in. Here they come.'],
    ['P', 'The flag falls. They go.'],
    ['P', 'Off they go, down the lists.'],
    ['C', 'Go on, then. Go on.'],
    ['P', 'They are off. Watch the points.'],
    ['P', 'Away, and the stands are up.'],
    ['P', 'Away together.'],
    ['C', 'Here we are, then.'],
  ],
  charge: {
    fast: [
      ['P', 'Full gallop. Very fast.'],
      ['C', 'That horse is flying.'],
      ['P', 'He has the pace up.'],
      ['C', 'Too fast? No such thing.'],
      ['P', 'Coming on hard.'],
      ['P', 'Thunder on the sand.'],
    ],
    slow: [
      ['C', 'Slow. Very slow.'],
      ['P', 'Not much pace there.'],
      ['C', 'Is he trotting? He is trotting.'],
      ['P', 'A cautious approach.'],
      ['C', 'Come on, man. Kick it.'],
    ],
    couch: [
      ['P', 'Lance in the rest.'],
      ['P', 'The lance comes down.'],
      ['P', 'Couched, and steady.'],
      ['C', 'Point down. Good. Late.'],
      ['C', 'Lower it, lower it.'],
      ['P', 'He sets the lance.'],
      ['P', 'Lances level now.'],
      ['C', 'Steady point. Very steady.'],
    ],
    aim: [
      ['P', 'He is looking at the helm.'],
      ['C', 'Aiming high. Brave or daft.'],
      ['P', 'Low and true at the shield.'],
      ['C', 'Shield. Shield. Shield.'],
      ['P', 'The point wanders.'],
      ['C', 'Wobbling. Hold it, boy.'],
    ],
  },
  exclaim: {
    big: [
      ['P', 'Oh, shattered!'], ['C', 'Oh, lovely!'], ['P', 'Broken! Clean!'], ['C', 'There it is!'], ['P', 'Splinters!'],
      ['C', 'Oh, that is good.'], ['P', 'Smashed it!'], ['C', 'Ha! Yes!'], ['P', 'What a strike!'], ['C', 'God\'s teeth!'],
    ],
    helm: [
      ['P', 'On the helm!'], ['C', 'Rang him!'], ['P', 'The helm! The helm!'], ['C', 'Bell for supper!'],
    ],
    small: [
      ['P', 'A touch.'], ['C', 'Hm. Glanced.'], ['P', 'Skidded off.'], ['C', 'Oh, so close.'], ['P', 'Turned aside.'], ['C', 'Kissed it.'],
    ],
    miss: [
      ['P', 'Nothing!'], ['C', 'Air.'], ['P', 'Missed.'], ['C', 'Oh dear.'], ['P', 'Wide!'], ['C', 'Marry, that was wide.'],
    ],
    fall: [
      ['P', 'He is down!'], ['C', 'Over he goes!'], ['P', 'Out of the saddle!'], ['C', 'By the Mass!'], ['P', 'Down! Down!'], ['C', 'Oh, he is gone.'],
    ],
    foul: [
      ['P', 'The horse! Foul!'], ['C', 'Oh no. No, no.'], ['P', 'That is a foul.'],
    ],
    tilt: [
      ['P', 'Into the barrier!'], ['C', 'He hit the tilt.'], ['P', 'Timber! The barrier.'],
    ],
  },
  // after the stroke, once it has been seen: from the player's side (you / him / both)
  after: {
    breakYou: [
      ['C', 'Square on the shield. Lovely.'],
      ['P', 'Two to the cheque, there.'],
      ['C', 'That is how it is done.'],
      ['P', 'A clean break for {you}. Square on the shield.', 'A clean break for our man. Square on the shield.'],
      [['P', 'Broken, and properly.'], ['C', 'That is the sound. Not the crowd. The wood. You hear it in your teeth.']],
      ['C', 'Low point, late lance, straight back. The way I taught it. Not to him. To somebody.'],
      [['P', 'The lance broke well there, Sir Walter.'], ['C', 'Hollow fir. It breaks if you look at it. In my day you could hang a man from a lance.']],
      ['P', 'Splinters to the rail. That one will be picked out of the commons for a week.'],
      ['C', 'Lovely. That is the stroke you remember on your deathbed. That and the debts.'],
      ['P', 'Two to the cheque, or near enough. The heralds are writing.'],
    ],
    breakHim: [
      ['C', 'He took that well.'],
      ['P', 'A good stroke against.'],
      ['C', 'That will sting tomorrow.'],
      ['P', '{him} breaks his lance. A good, honest stroke.', 'He breaks his lance. A good, honest stroke.'],
      [['P', 'And the other lance breaks too. That was felt.'], ['C', 'Felt in the shoulder for a fortnight. Ask me how I know.']],
      ['C', 'He took that well. Rode into it. That is the whole trick: ride into it.'],
      ['P', 'A broken lance against. The stands go quiet on this side.'],
      [['P', 'He found the shield there.'], ['C', 'Shields are for finding. That is why they are big.']],
    ],
    bothBreak: [
      ['C', 'Both! Put that in a glass case.'],
      ['P', 'Two lances, two cheers.'],
      [['P', 'Both lances broken! Both!'], ['C', 'That is jousting. That is the thing itself. Put it in a glass case.']],
      ['P', 'Two lances in pieces. The carpenters will be busy tonight.'],
      [['P', 'Broken, both of them. The crowd does not know whom to cheer.'], ['C', 'Then they cheer the wood.']],
      ['C', 'Both broke. Both stayed up. Both will be lying to their wives about how little it hurt.'],
      ['P', 'Splinters everywhere. The heralds will need a second roll.'],
    ],
    helmYou: [
      ['C', 'On the helm. God\'s teeth.'],
      ['P', 'The hardest mark of all.'],
      [['P', 'On the helm! {you} strikes the helm!', 'On the helm! Struck square on the helm!'], ['C', 'Three. And a headache he will carry to Easter.']],
      ['C', 'The hardest mark there is. You go for the helm, you are a fool. You hit the helm, you are a genius.'],
      ['P', 'The helm rang like a church bell. Somebody in the gallery crossed herself.'],
      [['P', 'Right in the sight of the helm.'], ['C', 'A hand wide, that slit. A hand wide, at a gallop. God\'s teeth.']],
      ['P', 'A stroke for the roll of arms. The heralds will be dining out on that one.'],
    ],
    helmHim: [
      ['C', 'He will hear bells till Lent.'],
      ['P', 'On the helm, against.'],
      ['P', 'On the helm, against. That will have been loud inside.'],
      [['P', 'He found the helm.'], ['C', 'I was hit on the helm once. I heard bells for a week. In Lent.']],
      ['C', 'Head still on. Good. Next time, raise the shield a hair.'],
      ['P', 'A blow on the helm, and our man still in the saddle. That is iron and stubbornness.'],
    ],
    glanceYou: [
      ['C', 'Square, boy. Hit it square.'],
      ['P', 'Too flat at the meeting.'],
      ['P', 'A touch, and it skids away. Too flat at the meeting.'],
      [['P', 'Glanced off.'], ['C', 'Hit it square, boy. A shield is not a girl. It does not need coaxing.']],
      ['C', 'It touched. Touched is a word for cousins. You want broken.'],
      ['P', 'The point met the shield and slid. An attaint, no more.'],
    ],
    glanceHim: [
      ['C', 'Kissed the shield, and went home.'],
      ['P', 'Good shield work, that.'],
      ['P', 'His point glances away. Good shield work.'],
      [['P', 'Turned aside.'], ['C', 'Shield up, angle it, let it slide. Old trick. Mine, actually.']],
      ['C', 'He kissed the shield and went home. Romantic. Useless.'],
    ],
    attaint: [
      ['C', 'A touch. Only a touch.'],
      ['P', 'The lance held. A touch.'],
      ['P', 'A touch that holds. The lance did not break.'],
      [['P', 'The lance held, Sir Walter.'], ['C', 'A lance that does not break is a lance that went into you instead. Remember that.']],
      ['C', 'Solid, that. Too solid. Somebody\'s arm is ringing.'],
      ['P', 'An attaint. The judges hold the flag level. A touch, no more.'],
    ],
    missYou: [
      ['C', 'Early. He lowered early.'],
      ['P', 'A yard of air.'],
      ['P', 'Nothing for {you}. The point went by.', 'Nothing for our man. The point went by.'],
      [['P', 'A miss.'], ['C', 'He struck the afternoon. The afternoon is unhurt.']],
      ['C', 'He looked at the helm, so the lance went to the helm, so the lance went nowhere.'],
      ['P', 'Wide. A good yard of air. The commons let him know.'],
      [['P', 'Missed, Sir Walter.'], ['C', 'Early. He lowered early and it wandered. They all do. I did. Once. Twice.']],
    ],
    missHim: [
      ['C', 'He will blame the horse.'],
      ['P', 'Nothing from him.'],
      ['P', 'He misses. A clean pass, and nothing to show.'],
      [['P', 'Nothing from him.'], ['C', 'He will be blaming the horse. They always blame the horse. The horse is never consulted.']],
      ['C', 'Missed. He was looking at the ladies. Can\'t blame him. Can blame him.'],
      ['P', 'A miss against. That costs him nothing on the cheque and a great deal in the stands.'],
    ],
    bothMiss: [
      ['C', 'Like a council meeting.'],
      ['P', 'Strangers in a cloister.'],
      [['P', 'Nothing from either. Two misses.'], ['C', 'Two grown men, two lances, all that sand, and nobody touched anybody. Like a council meeting.']],
      ['P', 'They passed each other like strangers in a cloister.'],
      [['P', 'A blank course.'], ['C', 'Lovely day for a ride, though.']],
      ['C', 'The carpenters are delighted. Nothing to mend.'],
      ['P', 'The commons are whistling. They did not pay to watch two men go for a canter.'],
    ],
    unhorseYou: [
      ['C', 'Sky, sky, sand. Surgeon.'],
      ['P', 'Borne to the ground!'],
      [['P', 'He is down! {him} is out of the saddle!', 'He is down! Out of the saddle!'], ['C', 'And that is how you end an argument.']],
      ['P', 'Borne to the ground. Over the cantle, and the horse runs on without him.'],
      [['P', 'Unhorsed.'], ['C', 'I know that view. Sky, sky, sand. Then the surgeon\'s face. Worst of the four.']],
      ['C', 'He will be sore tomorrow. And the day after that. And at Michaelmas.'],
      ['P', 'The squires are running. The marshal\'s men are running. He is not running anywhere.'],
    ],
    unhorseHim: [
      ['C', 'Up. Get up. Wave.'],
      ['P', 'Our man is on the sand.'],
      [['P', 'And our man is down. {you} is on the sand.', 'And our man is down. On the sand.'], ['C', 'Up. Get up. Wave. Pretend you meant it.']],
      ['P', 'Borne down. A great stroke against, and the stands have gone very quiet.'],
      [['P', 'Out of the saddle.'], ['C', 'It happens to all of us. It happened to me at Smithfield. And Calais. And at a wedding.']],
      ['C', 'He hit the ground like a bag of pans. Still moving. Good. Moving is good.'],
    ],
    tilt: [
      ['C', 'The tilt does not move.'],
      ['P', 'Points off for that.'],
      [['P', 'The lance into the barrier. That is a fault.'], ['C', 'The tilt is the one thing that does not move. People still hit it.']],
      ['P', 'He struck the tilt. Points off, and a carpenter somewhere sighs.'],
      ['C', 'Hitting the barrier. Like shouting at your wife in church. Everyone sees, and it costs you.'],
    ],
    foul: [
      ['C', 'Never the horse. Never.'],
      ['P', 'The red flag goes up.'],
      [['P', 'A foul. The horse is struck.'], ['C', 'Never the horse. Never. The horse did nothing to anybody.']],
      ['P', 'A stroke on the horse. The judges raise the red flag. The King\'s grace does not like it.'],
      ['C', 'You can kill a man in the lists and they call it misfortune. Hit his horse and they call you a Fleming.'],
    ],
    injuryYou: [
      [['P', 'He is slow to straighten. That one hurt.'], ['C', 'The ribs. I can tell from here. Something has gone in the ribs.']],
      ['P', 'The surgeon is watching closely. He has his bag open.'],
      ['C', 'Shake it off, they say. You cannot shake off a rib. I tried.'],
    ],
    injuryHim: [
      [['P', 'He is hurt. Slumped over the pommel.'], ['C', 'Looks like the shoulder. Shoulders do not forgive.']],
      ['P', 'His squires are holding him in the saddle. Not a good sign.'],
      ['C', 'He will ride on. They always say they will ride on. Then they sit down.'],
    ],
  },
  // the cheque, in the words of the rules in force
  score: {
    planken: [
      ['P', 'The heralds have it at {score}.', 'The heralds have their sums. The cheque is close.'],
      [['P', 'On the standard cheque, a broken lance is two.'], ['C', 'And a missed one is nothing. Nothing adds up very slowly.']],
      ['P', 'Every line on that cheque is a lance somebody did not want to lose.'],
    ],
    tiptoft: [
      ['P', 'Under Tiptoft that is one for the body. Nothing for a touch. The Earl was not sentimental.'],
      [['P', 'A spear broken within a foot of the coronel is only a touch, under these rules.'], ['C', 'Tiptoft measured everything. Then they measured him. For a box.']],
      ['P', 'Watch the sight of the helm. Three strokes there take the prize under Tiptoft, whatever the count.'],
      ['C', 'Coronel to coronel is three, under Tiptoft. Points meeting. I have seen it twice. Once sober.'],
    ],
    judged: [
      ['P', 'The judges add their marks: a steady lance, and the lance raised in good time.'],
      [['P', 'Points for style today.'], ['C', 'I had style. They gave me a point once, for falling elegantly.']],
    ],
    sudden: [
      ['P', 'Still no lance broken, so still no winner. Sudden death waits.'],
      ['C', 'First blood wins. Everybody is careful. Careful is how you lose.'],
    ],
    castile: [
      ['P', 'Only a splintered lance counts under the Statutes. A crosswise break is nothing.'],
      ['C', 'Alfonso\'s rules. Hard rules for hard men in a hot country.'],
    ],
    gestech: [
      ['P', 'In the Gestech, the break is what counts, and the fall counts most.'],
      ['C', 'Germans. Six for a fall. They practically pay you to fall off.'],
    ],
    rennen: [
      ['P', 'Only the shield counts in the Rennen. Strike it square, and up it springs.'],
      ['C', 'Solid lances. Nothing breaks. Something breaks. Usually a man.'],
    ],
    bridge: [
      ['P', 'The bridge keeps its own tally. Bouts won, bouts lost.'],
      ['C', 'Three men, one after another. By the third you would sell the bridge for a chair.'],
    ],
  },
  momentum: {
    leadYou: [
      ['P', '{you} leads, {score}.', 'Our man leads. {score}.'],
      [['P', 'A lead, now.'], ['C', 'Do not enjoy it. A lead is a thing you lose.']],
      ['C', 'He is ahead and he knows it. Watch him not get careless. Watch him. Watch.'],
    ],
    leadHim: [
      ['P', '{him} leads, {score}.', 'He leads, {score}.'],
      [['P', 'Behind, now.'], ['C', 'Behind is where you learn things. Painful things. Useful things.']],
      ['C', 'He is losing. Good. Losing men ride straight. Winning men ride pretty.'],
    ],
    level: [
      ['P', 'Level. {score}. All to do.', 'Level. All to do.'],
      [['P', 'Level on the cheque.'], ['C', 'Lovely. Nobody can go home.']],
      ['C', 'Level. The judges are delighted. More courses, more dinner.'],
    ],
    comeback: [
      [['P', 'He has come back! From behind, level, and now ahead!'], ['C', 'I said so. Did I not say so?'], ['P', 'You said he was finished.'], ['C', 'That is how I say so.']],
      ['P', 'What a turn. An hour ago the bookmakers were laughing.'],
      ['C', 'That is the joust. Nobody is beaten until he is on the ground. Even then, ask him.'],
      ['P', 'The stands have changed sides. Listen to them.'],
    ],
    collapse: [
      ['P', 'He had it, and now it is going. The lead is gone.'],
      [['P', 'That lead has gone, Sir Walter.'], ['C', 'Like my hair. Slowly, then all at once.']],
    ],
    streakYou: [
      ['P', 'Another for {you}. That is three courses running.', 'Another. That is three courses running.'],
      [['P', 'He is breaking lances like kindling.'], ['C', 'Somebody give the other man a prayer book.']],
      ['C', 'He has found it. The rhythm. You find it once a season. Do not wake him.'],
    ],
    streakHim: [
      ['P', '{him} again. He has the measure of it.', 'Him again. He has the measure of it.'],
      [['P', 'Three courses running for him.'], ['C', 'Then change something. Anything. Change your shirt.']],
    ],
    lastCourse: [
      ['P', 'The last course. Everything on it.'],
      [['P', 'This is the one, Sir Walter.'], ['C', 'It is always the one. The others were practice.']],
      ['C', 'Last course. Your mother is watching. Your creditors are watching. Ride.'],
      ['P', 'One more course and it is decided, unless God or the barrier has a view.'],
      ['P', 'The final course of the match. Listen to the stands.'],
      [['P', 'The last course.'], ['C', 'I always prayed before the last course. Never helped. Made me feel tidier.']],
    ],
    extra: [
      ['P', 'Level after the courses. One more, to settle it.'],
      [['P', 'An extra course.'], ['C', 'Extra. Like a second helping of eel. Nobody asked for it.']],
    ],
    runawayYou: [
      ['P', 'This is becoming a lesson. {score}.', 'This is becoming a lesson.'],
      ['C', 'Somebody should stop it. Nobody will. It is too much fun.'],
    ],
    runawayHim: [
      ['P', 'He is running away with it. {score}.', 'He is running away with it.'],
      ['C', 'Not a good day. Some days you are the hammer.'],
    ],
  },
  result: {
    win: [
      [['P', 'It is over. {you} wins it.', 'It is over. Our man wins it.'], ['C', 'And deserved. I will say so tonight, at length.']],
      ['P', 'The judges agree, the stands agree, and the King\'s grace is applauding. That is a win.'],
      [['P', 'Victory.'], ['C', 'Lovely word. Ask the other fellow how it sounds.']],
      ['C', 'Well ridden. I had money on the other one. Do not tell my wife.'],
      ['P', 'Favours from the gallery, caps in the air, and somebody\'s purse much lighter.'],
      [['P', 'A famous win.'], ['C', 'Famous until Tuesday. Then you must do it again.']],
      ['P', 'The heralds will cry that name in the hall tonight, and the ladies will pretend not to listen.'],
    ],
    loss: [
      [['P', 'It is his. {him} takes the match.', 'It is his. The other man takes the match.'], ['C', 'No shame. Some shame. Not much.']],
      ['P', 'A loss, but a brave one. The stands are kinder than the cheque.'],
      [['P', 'Beaten today.'], ['C', 'I was beaten more than I won. Look at me now. In a booth.']],
      ['C', 'Lose like that and they ask you back. Lose badly and they ask you to carry the lances.'],
      ['P', 'He rides off with his head up. That is worth something. Not a purse. Something.'],
      ['C', 'Go home, sleep, curse the horse, apologise to the horse. In that order.'],
    ],
    draw: [
      [['P', 'A draw. The cheque will not choose.'], ['C', 'Then the ladies will. They always do in the end.']],
      ['P', 'Neither man beaten. Both will claim it in the tavern.'],
      ['C', 'A draw. Like a kiss from your sister. Pleasant, and nobody talks about it.'],
    ],
    firstWin: [
      [['P', 'His first win in the lists.'], ['C', 'First of many. Or first of one. Either way, he will remember it.']],
      ['P', 'Remember the date. Somebody will put it on a tomb one day.'],
    ],
    rankUp: [
      ['P', 'The heralds will raise him on the roll for that. A rank higher.'],
      [['P', 'A new rank for him.'], ['C', 'More renown, more invitations, more men wanting to knock him down.']],
      ['C', 'Up a rank. They will be asking him to dinner now. The food gets worse, the wine gets better.'],
    ],
    champion: [
      [['P', 'The prize is his. Champion of {venue}.', 'The prize is his. Champion of these lists.'], ['C', 'And by the Mass, he earned it.']],
      ['P', 'A champion. The King\'s grace will want a word. Let us hope it is a kind one.'],
    ],
  },
  // a celebration after the stroke (src/celebrate.js ids): 'you' when it is ours, 'him' when it is his
  celebrate: {
    stump:   [['P', 'He holds up the broken stump to the stands.'], ['C', 'Show them the wood. They love the wood.']],
    salute:  [['P', 'A bow, and the lance raised to the royal box.'], ['C', 'Courtier. He will go far. Possibly to the Tower.']],
    fists:   [['P', 'Up in the stirrups, both fists in the air.'], ['C', 'Steady. You can still fall off while you are winning.']],
    helm:    [['P', 'The helm comes off and he waves it.'], ['C', 'There is the face. The ladies wanted the face.']],
    point:   [['P', 'He points at the commons and cups an ear.'], ['C', 'Asking for more noise. He will get it, the peacock.']],
    rear:    [['P', 'The horse goes up! A pesade!'], ['C', 'Show-off. Lovely. Show-off.']],
    gallery: [['P', 'A slow ride along the gallery, arm raised to the ladies.'], ['C', 'Somebody\'s husband is writing that down.']],
    favour:  [['P', 'A bow to a lady, and she throws him her ribbon.'], ['C', 'Ah. Now there is a story for the kitchens.']],
    chest:   [['P', 'He beats on his breastplate.'], ['C', 'Hollow, that. Good plate rings. His rings.']],
    nod:     [['P', 'A nod of the head to the better man.'], ['C', 'Good manners. Bad afternoon.']],
    slap:    [['P', 'He slaps his own helm. He is not pleased with himself.'], ['C', 'Nor is his horse.']],
  },
  // the unhorsed man's outcome (src/aftermath.js events aftermath:down / up / carried, routed by main.js aftermathEvent)
  aftermath: {
    down:    [['P', 'He is not getting up. The surgeon is running out.'], ['C', 'Give him air. And give the crowd something else to look at.']],
    up:      [['P', 'He is on his feet. A hand from the squire, and he stands.'], ['C', 'Hard head. They breed them thick in this country.']],
    carried: [['P', 'They carry him off the field.'], ['C', 'Pray for him. Then pray for the horse.']],
  },

  // ---------------------------------------------------------------- QUIET MOMENTS
  filler: [
    [['P', 'Sir Walter, what lance would you use today?'], ['C', 'Ash. Solid ash. These hollow fir things, painted up like a maypole. You could break one sneezing.'], ['P', 'That is rather the point of them.'], ['C', 'It used to be the point of the man.']],
    [['P', 'You rode at Smithfield, I believe.'], ['C', 'I fell at Smithfield. There is a difference, and the surgeon charged for it.']],
    ['C', 'My first horse was called Bayard. Bit me every morning for nine years. Best friend I ever had.'],
    [['P', 'The King\'s grace is watching closely.'], ['C', 'The King\'s grace is always watching. That is what the grace is for.']],
    ['P', 'A word on the coronel. Three blunt prongs, to catch on the shield and break the lance, not the man.'],
    [['C', 'In my day we did not have a barrier.'], ['P', 'You had a rope.'], ['C', 'We had a rope. We had standards.']],
    ['P', 'The vamplate is the steel disc on the lance that guards the hand. Without it you joust with nine fingers. Briefly.'],
    [['P', 'The grapper sits behind the hand, against the rest. It stops the lance driving back through the arm.'], ['C', 'I jousted before grappers. My elbow is in Gascony.']],
    [['P', 'Sir Walter, your knees.'], ['C', 'Do not speak of my knees. My knees are in mourning.']],
    ['C', 'They pay these young men now. Purses! I jousted for a ribbon and a fever.'],
    [['P', 'Have you seen the price of pies down there?'], ['C', 'A penny. For mutton. That was never mutton. That pie has been to France.']],
    ['P', 'For those just arriving, the lists are open, the beer is warm, and the King has not yet had anyone arrested.'],
    [['C', 'My wife says I talk through every course.'], ['P', 'Your wife is a perceptive woman.'], ['C', 'She is in Kent.']],
    ['P', 'The heralds keep the cheque, a column of marks for each rider. Nobody argues with the cheque. They argue with heralds.'],
    [['P', 'They say Cromwell\'s men are in the stands, taking notes.'], ['C', 'Whose Cromwell?'], ['P', 'Everybody\'s, eventually.']],
    ['C', 'Never joust after eel pie. I say no more.'],
    [['P', 'A good deal of money changing hands down there.'], ['C', 'Mine is staying in my hand. I learned. At Calais. Expensively.']],
    ['P', 'The squires do most of the work and get none of the credit. Like heralds.'],
    [['C', 'You know what wins a joust? The seat. Not the arm. The arse.'], ['P', 'Sir Walter.'], ['C', 'The seat, then. It is the same thing in Latin.']],
    ['P', 'The marshal\'s word is law in the lists. Outside the lists, the marshal owes me two shillings.'],
    [['P', 'The ladies in the gallery have favourites today.'], ['C', 'The ladies have favourites every day. They just change them faster than we change lances.']],
    ['C', 'The horse is half of it. I have known horses who jousted better than their knights. I was one of those knights.'],
    [['P', 'Any advice for the young men?'], ['C', 'Keep your eyes open. Everyone shuts them at the last moment. The ones who do not, win.']],
    ['P', 'The barrier is called the tilt, which is why the whole sport is called tilting, which is why I have a job.'],
    [['C', 'Do you know, I was nearly a monk.'], ['P', 'What stopped you?'], ['C', 'The silence. And the monks.']],
    ['P', 'The French call this the joust of peace. The French have a sense of humour. It is hard to find.'],
    [['P', 'There is a story going round the stands.'], ['C', 'There is always a story going round the stands. Usually about a bishop.']],
    ['C', 'Lovely armour, all of it. In my day you could tell a man by his dents.'],
    [['P', 'The surgeon looks bored.'], ['C', 'Give it an hour. Nobody stays bored in that job.']],
    ['P', 'A reminder to the commons: throwing things at the knights is forbidden. Throwing things at the heralds is merely discouraged.'],
    [['C', 'I have a rule. Never trust a knight with a clean shield.'], ['P', 'Why?'], ['C', 'Means he is new, or means he is lucky. Both wear off.']],
    ['C', 'I once broke three lances in a morning and was sick in my helm. That is a thing you only do once.'],
    [['P', 'Sir Walter, a question from the gallery.'], ['C', 'No, I am not married to her. Next question.']],
    ['P', 'The squire hands up a fresh lance. Fourteen feet of painted fir and everyone\'s hopes.'],
    [['P', 'They say the horses are fed better than the heralds.'], ['C', 'The horses work harder than the heralds.'], ['P', 'You will not be invited back.']],
    ['C', 'Do not look at the crowd. The crowd is not your friend. The crowd is everybody\'s friend until you fall off.'],
    ['P', 'The judges confer. Three old men, one table, and the whole afternoon on their faces.'],
    [['C', 'A lance is like a sermon.'], ['P', 'How so?'], ['C', 'Short is better, and it is always aimed at someone else.']],
    ['P', 'The wind is from the west, which matters to the archers and nobody else.'],
    [['C', 'I am told the young ones practise against a quintain now.'], ['P', 'A sack on a post.'], ['C', 'We practised against our brothers. Cheaper, and they hit back.']],
  ],
  history: [
    ['P', 'At Smithfield in 1390, King Richard handed out his white hart badge. It was the first time it was seen.'],
    ['P', 'Sixty ladies led sixty knights through London on chains, to the Smithfield jousts.'],
    ['P', 'At Saint-Inglevert the holders hung two shields at their tents. Touch the shield of war, and the points were sharp.'],
    ['P', 'At the Passo Honroso, a hundred and sixty-six combats were fought before the vow was called complete.'],
    ['P', 'At the pas of the Golden Tree, the challengers came one by one, twenty-six of them, to face the Bastard of Burgundy.'],
    ['P', 'The Bastard of Burgundy was kicked by a horse at his own pas. The horse was not punished.'],
    ['P', 'Jacques de Lalaing kept the Fountain of Tears at Chalon for a whole year, a challenge on the first of every month.'],
    ['P', 'Tiptoft\'s ordinances were set down at Windsor in May of 1466, for the King\'s jousts.'],
    ['P', 'At the Gesellenstechen it was the young men of the patrician houses who rode. The country nobility stayed home and sniffed.'],
    ['P', 'The German tournament societies kept men out by ancestry. Four noble grandparents, or you watched from the rail.'],
    ['P', 'Under the Bamberg rules of 1478, a cheat could lose his horse and harness, and be shamed before the ladies.'],
    ['P', 'At a pas d\'armes, a knight who would not fight left his spurs. A lady without an escort left a glove.'],
    ['P', 'King René\'s book of the tournament: the king of arms cries three times before the ropes are cut.'],
    ['P', 'At the end of a tourney the ladies choose the knight of honour. The judges merely count.'],
    ['P', 'In the Rennen the shield is built to spring off when it is struck square. The crowd loves the sound.'],
  ],
};
