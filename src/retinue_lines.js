// What your men say between courses. LINES[role][situation] is the plain pool; TRAIT[trait][situation] is flavour any man can speak;
// ROLE_TRAIT[role][trait][situation] is flavour for one post. A line is at most 14 words. chooseLine() picks the speaker and the line.
// Situations: nerves (before the first course), start (before a later course), lance (a fresh lance handed up after a break), broke (you broke a lance),
//   helm (you struck his helm), miss, struck (you were hit hard), tired (the horse), leading, behind, won, lost.
// Register: Wolf Hall. Plain, dry, human; working men who know their trade and their master.
// Also here: LADY (the lady who gave you her favour, from the gallery) and RIVAL (his squire and his men jeering across the lists). Plain data apart from the two pickers.

export const ROLE_TITLE = { squire: 'YOUR SQUIRE', groom: 'YOUR GROOM', armourer: 'YOUR ARMOURER', farrier: 'YOUR FARRIER', pursuivant: 'YOUR PURSUIVANT', master: 'THE MASTER OF ARMS' };
export const OTHER_TITLE = { lady: 'YOUR LADY', rival: 'HIS SQUIRE' };
// The squire keeps to the personal word: cheer, concern, banter. Advice on the riding is the Master of Arms's (your trainer, at the rail; not a hired man).

export const LINES = {
  squire: {
    nerves: ['Your hands are shaking, my lord. So are mine. We\'ll call it the cold.', 'I\'ve checked the girth three times. I\'ll check it a fourth.', 'If you\'re going to be sick, my lord, do it now. Not in the helm.', 'God keep you, my lord. And keep me, while He\'s about it.', 'Everybody is looking at us. Do not look back.'],
    start: ['The lance is true, my lord. Ride well.', 'Gauntlets laced, my lord. Good luck.', 'All is ready, my lord. Go and spoil his afternoon.', 'Visor down, my lord. Your face is frightening the horse.'],
    lance: ['A fresh lance, my lord. Try not to waste this one on air.', 'Here. Fourteen feet of the carpenter\'s best. Mind it.', 'New lance, my lord. The old one is in four pieces and a lady\'s lap.', 'Take it, my lord. I\'ve got splinters in places I won\'t name.', 'Another one, my lord. We have six left. And then we have none.'],
    broke: ['That one shattered nicely, my lord!', 'A clean break, my lord. The crowd saw it.', 'Splinters everywhere! I\'ll have the stump, for my mother.', 'Did you hear it? Like a door slamming in heaven.'],
    helm: ['His helm rang like a bell, my lord!', 'Right on the crest! He will feel that at supper.', 'They are shouting your name. Well. Your colours. Same thing.', 'The helm, my lord! I nearly fell off the rail.'],
    miss: ['He was quick, my lord. Next time.', 'Air, my lord. It happens to the best of men.', 'No matter, my lord. Nobody saw. Everybody saw. No matter.', 'You were looking at his helm. I saw your head go up.'],
    struck: ['Are you hurt, my lord? You sit well.', 'He hit hard, my lord. I felt it from here.', 'That rattled my teeth, and I only watched.', 'Breathe, my lord. In. Out. Don\'t do that again.'],
    tired: ['Your horse is blowing, my lord.', 'He is lathered. He has given all he had.', 'Easy now. We have time, my lord. Not much. Some.'],
    leading: ['You lead, my lord! The stands are with you.', 'Ahead on points, my lord. I could shout!', 'Don\'t smile yet, my lord. Smile at supper.'],
    behind: ['We are behind, my lord, but only by a lance.', 'One good course turns it, my lord.', 'Behind, my lord. My father said behind is where the brave live. He was usually behind.'],
    won: ['Victory, my lord! I knew it from the first course.', 'They will sing of this one, my lord!', 'A fine day, my lord. Your father would smile. Briefly.', 'We won! I mean you won. We. You. God, I need a drink.'],
    lost: ['There will be other lists, my lord.', 'He was lucky today, my lord. Only lucky.', 'Chin up, my lord. The crowd still loves you. Some of it.', 'I\'ll see to the horse, my lord. And then I\'ll see to the wine.'],
  },
  master: {      // the trainer: advice only
    nerves: ['Everyone is frightened. The good ones are frightened later.', 'Do not watch him. Watch his shield. The man is not your business.', 'Ride the first course to learn him. Ride the rest to beat him.'],
    start: ['Eyes on his shield. Point low, lance late.', 'Keep your head down and your hands quiet.', 'Ride straight and close along the tilt.'],
    broke: ['Good. Now raise the lance at once, or it costs you.', 'You set it well. Do that again. Exactly that.'],
    helm: ['The helm is the hard mark. Do not hope for it twice.', 'A fine mark. Do not let it make you careless.'],
    miss: ['The point wanders when you hurry. Aim lower and wait for it.', 'Look at his shield, not at his helm. Then lower late.', 'Steady the point first. Find his shield. Then think.'],
    struck: ['Brace sooner. Take the thrust before he does.', 'Sit tall and lean in. A flinch unhorses a man.', 'Raise the shield to the helm if he aims high.'],
    tired: ['Walk him a moment. A blown horse runs wide.', 'Let him stand. A tired horse spoils the aim.', 'Take a breath, both of you.'],
    leading: ['Do not get careless. Ride the next as the first.', 'Keep it dull and steady. Points are won twice.'],
    behind: ['Do not chase him. Let him come to you.', 'A good course turns it. Keep your seat and wait for it.'],
  },
  groom: {
    nerves: ['He knows, my lord. He always knows. Talk to him.', 'Easy, boy. Easy. He\'s calmer than you are, my lord.', 'Watered, fed, brushed, prayed over. He\'s ready. Are you?'],
    start: ['He is calm and watered, my lord.', 'Good lad. Good lad. Off you go.', 'Girth is tight and hooves are sound.'],
    broke: ['Easy, boy. Only splinters on the sand.', 'The horse did not even flinch, my lord.', 'Good lance, good horse. Both held.'],
    helm: ['He heard the roar and stood proud, my lord.', 'That rang in his ears too, poor lad.', 'Fine work. Look at his ears. He knows he did that.'],
    miss: ['He ran true, my lord. The fault was not his.', 'Don\'t blame the horse. He did his part.', 'Easy, boy. He\'ll find him next time. One of you will.'],
    struck: ['Steady, steady. He felt that, my lord.', 'The horse is shaking. Give him a moment.', 'Hold still, lad. It is only noise.'],
    tired: ['He is blowing hard, my lord. Don\'t push him.', 'Wet through, he is. Let me walk him.', 'He needs water more than advice.'],
    leading: ['The horse likes winning. Look at his ears.', 'He is up and eager. Keep him so.', 'He feels the crowd, my lord. He likes it. Vain animal.'],
    behind: ['He is still sound, my lord. Ask him again.', 'He has more in him than you think.', 'No lameness, no fear. Just ask.'],
    won: ['Best horse in the lists today, my lord.', 'An extra measure of oats tonight, I say.', 'He earned his oats. You earned... well. He earned his oats.'],
    lost: ['It was not the horse\'s fault, my lord.', 'He ran well. I\'ll rub him down.', 'A hard day for him too. He\'ll sulk. So will you.'],
  },
  armourer: {
    nerves: ['Every strap is tight. If you fall, it won\'t be my fault.', 'I hammered your gorget flat this morning. Don\'t make me do it again.', 'The plate is sound. Don\'t test it for fun.'],
    start: ['Every rivet is tight, my lord.', 'Your vamplate\'s straight. Keep your hand behind it.', 'The grapper\'s seated, my lord. The lance won\'t slip back.'],
    lance: ['New coronel, sharp prongs. It\'ll bite this time.', 'Fresh lance. Grapper\'s tight. The rest is you.', 'There. Vamplate\'s on true. Hit something.'],
    broke: ['Your lance broke, not your armour. A fair trade.', 'Hear that crack? That is a good strike.', 'A broken lance is fir well spent.'],
    helm: ['I would not want to be under that helm.', 'A dented crest for him. His armourer will curse you all night.', 'Skill like that deserves better plate.'],
    miss: ['Wasted effort, my lord. Hit plate, not air.', 'Missing saves a dent. Barely.', 'Aim for his shield. It is easier to hit.'],
    struck: ['Hold still, my lord. Let me hammer that flat.', 'A dent, but the steel held. I made it well.', 'That plate was worth every mark. See?'],
    tired: ['Harness is heavy when you tire. Loosen the straps.', 'Sit a moment. Armour weighs more each course.', 'Breathe, my lord. The steel is not going anywhere.'],
    leading: ['Ahead, and not a dent worth mentioning.', 'The steel holds. So may you.', 'Keep on like this and I\'ll have nothing to do. Don\'t tell anyone.'],
    behind: ['A little dent, a little score. It is nothing.', 'Plate can be mended. So can a score.', 'I have mended worse than this.'],
    won: ['Not a dent I cannot beat out by supper.', 'Well fought. The steel did its part.', 'I\'ll polish it to a mirror tonight.'],
    lost: ['The armour held, my lord. That is the main thing.', 'Plate can be mended. Pride mends itself.', 'Nothing broken that a hammer cannot fix.'],
  },
  farrier: {
    nerves: ['Four good shoes, my lord. Not a nail loose.', 'Hooves clean, frogs sound. The sand is soft. Ride true.'],
    start: ['He is shod for the sand. Go on.', 'Feet are fine. Mind his near fore on the turn.'],
    broke: ['Good lance, my lord. The hooves never faltered.', 'He stood the shock like a rock.', 'The ground shook. He did not.'],
    helm: ['That helm strike came from good footing, my lord.', 'Sure feet under you. It shows.'],
    miss: ['He placed his feet well. The aim is yours.', 'The hooves are true, my lord. Look to your point.', 'No fault in the shoeing, I promise.'],
    struck: ['I felt that in his hooves, my lord.', 'Let me look at his legs after this.', 'Hold him steady. I will check for heat.'],
    tired: ['His legs are tiring, my lord. Spare him.', 'I do not like how he breathes. Go gently.', 'Let him rest his hooves a moment.'],
    leading: ['Sound legs and a lead. A good day.', 'Keep that pace and no more.'],
    behind: ['He has the legs for one more good run.', 'A shoe holds, a score can turn.'],
    won: ['Four good shoes won this, my lord.', 'A sound horse and a good knight. In that order.'],
    lost: ['His legs are sound. Take heart, my lord.', 'No shoe was lost. That is something.'],
  },
  pursuivant: {
    nerves: ['I\'ve cried your name to every bench, my lord. Don\'t make a liar of me.', 'The banner flies and the stands are watching.', 'Half the stands have money on you. The other half on him. Ride for the first half.'],
    start: ['They\'re shouting your name, my lord. Go and earn it.', 'Ride, and give me something to proclaim.'],
    broke: ['A lance broken in your name! I\'ll shout it.', 'The heralds will write that one down, my lord.', 'Splintered wood, my lord. Splendid.'],
    helm: ['Upon the helm! They will speak of it in the hall.', 'That strike belongs in the roll of arms.', 'A herald couldn\'t ask for better.'],
    miss: ['The stands are quiet, my lord. Give them a reason.', 'A miss is forgotten by the next course.', 'No shame, my lord. I\'ll say nothing. Loudly.'],
    struck: ['A hard blow, but you sit like a lord.', 'They gasped, my lord. Now make them cheer.', 'Honour is not dented by one blow.'],
    tired: ['The stands can wait, my lord. Rest your horse.', 'Breathe. Your name is not going anywhere.'],
    leading: ['The ladies are watching you, my lord.', 'The whole rail is talking about your lead.', 'Keep your honour bright, my lord.'],
    behind: ['The stands favour a knight who fights back.', 'There is glory in a late rally, my lord.', 'I have seen worse turned about.'],
    won: ['They\'ll shout your victory in every town, my lord!', 'I\'ll be hoarse by supper, and happy.', 'Largesse, my lord! Throw them something! They\'ll love you for it.'],
    lost: ['A knight is judged by how he bears it, my lord.', 'I\'ll shout about your courage, not the score.', 'They will remember your bearing.'],
  },
};

// Flavour any man can speak, by trait.
export const TRAIT = {
  boastful: {
    nerves: ['I\'ve told the whole town you\'ll win. Mind you do.', 'I put a shilling on you. My own shilling.'],
    start: ['I told everyone you would win. Don\'t shame me.', 'The whole town knows your name. I made sure.'],
    broke: ['Did you hear them? I told them you would!', 'Broken! Just as I promised the whole stand.'],
    helm: ['The helm! I said so! I said so to everyone!', 'I\'ll be telling that one for years, my lord.'],
    miss: ['A trick of the light, my lord. They all saw it.', 'I will tell them he cheated.'],
    struck: ['Never mind him. I told them you take such blows for breakfast.', 'He will not hit twice. I swore it to the stand.'],
    tired: ['The horse is merely resting for the glory to come.', 'I told them you ride all day. Don\'t shame me.'],
    leading: ['I told you! I told every man at the rail!', 'Ahead! Just as I said. Ask anyone here.'],
    behind: ['A trick to draw him in. I told them so.', 'Don\'t worry. I\'ve already bragged about the comeback.'],
    won: ['I said you would win. Did I not say it?', 'My lord, I\'ll never let anyone forget this day.'],
    lost: ['It was the sun in your eyes. I will tell everyone.', 'A hollow win for him. I will say so loudly.'],
  },
  steady: {
    nerves: ['One course at a time. That is all.', 'Calm hands, my lord. The rest will follow.'],
    start: ['Breathe. Look at the shield. Go.', 'Nothing has changed. Ride the same.'],
    broke: ['Well done. Now the next one.', 'A good strike. Breathe, and go again.'],
    helm: ['Good. Don\'t let it go to your head.', 'A fine blow. Keep your seat, my lord.'],
    miss: ['It happens. Settle yourself.', 'One miss is only one miss.'],
    struck: ['Sit tall. It is over now.', 'Take a breath. You are not hurt badly.'],
    tired: ['No hurry. The horse will tell us when.', 'Rest. The day is long.'],
    leading: ['Ahead, but stay level. Nothing has changed.', 'Keep to your pace, my lord.'],
    behind: ['Behind is not beaten. Keep calm.', 'Plenty of courses yet. Ride your own ride.'],
    won: ['Well ridden, my lord. Calm to the end.', 'It was a steady day, and a good one.'],
    lost: ['It is only a joust, my lord. Rest tonight.', 'Learn from it. That is all there is.'],
  },
  drinker: {
    nerves: ['A little something for the nerves, my lord? No? More for me.', 'Steady, my lord. Steady. That was me, not you.'],
    start: ['Easy, lad... easy. Who moved the ground?', 'Ready, my lord. Mostly. Ready.'],
    broke: ['Ha! Splendid! Have they... have they all got two heads?', 'Broke it clean! That calls for a cup.'],
    helm: ['Right on his head! Ha! I felt that in my own.', 'A fine blow. I\'ll drink to it. Later. Now.'],
    miss: ['The lance moved, my lord. I saw it.', 'Never mind. The world is crooked today.'],
    struck: ['Ow. That was... that was your armour, not mine.', 'He hit you? Hold him still, I will see to him.'],
    tired: ['I am tired too, my lord. Quite tired. Quite.', 'Let us all sit down. Just for a breath.'],
    leading: ['We are winning? Marvellous. Pour a cup.', 'Ahead, my lord. Or is that behind? Ahead.'],
    behind: ['A little behind. Nothing a cup would not cure.', 'We shall get them. I think. Which way are they?'],
    won: ['We won! Everyone drinks!', 'Victory! I\'ll remember it. Probably.'],
    lost: ['We lost? Then I need a drink even more.', 'Well. That is a pity. Is there ale?'],
  },
  devout: {
    nerves: ['I have said a prayer for you, my lord. Two. I had time.', 'Saint George be with you on the sand.'],
    start: ['God go with you, my lord. And with the horse.', 'I lit a candle. A small one. It\'s a small joust.'],
    broke: ['A miracle, my lord! Or at least good fir.', 'Thank Saint George for that lance.'],
    helm: ['God guided that point, my lord. Truly.', 'I will light a candle for that blow.'],
    miss: ['It was God\'s will, my lord. Next time.', 'God tests us all, my lord.'],
    struck: ['I prayed all the way through that one.', 'God shielded you, my lord. Let us give thanks.'],
    tired: ['Even the Lord rested, my lord.', 'A short prayer will do the horse good.'],
    leading: ['Thank God, my lord. But stay humble.', 'God is with you today, my lord.'],
    behind: ['The Lord may still turn it, my lord.', 'I will pray harder.'],
    won: ['Thank God, my lord. And your arm.', 'I\'ll light a candle tonight, my lord.'],
    lost: ['God has other plans, my lord.', 'A hard lesson, and well meant. I will pray for you.'],
  },
  thrifty: {
    nerves: ['Mind that lance, my lord. It cost three shillings.', 'Don\'t break anything you don\'t have to. Except his lance.'],
    start: ['The fee\'s paid. Make it worth it.', 'Every course costs us, my lord. Make this one pay.'],
    broke: ['That lance cost three shillings, my lord. Worth it, I suppose.', 'Broken again. Fir is not cheap, my lord.'],
    helm: ['A fine strike. Worth every penny of the entry fee.', 'That is a prize-winning blow, my lord.'],
    miss: ['A wasted course, my lord. And the fee already paid.', 'Please don\'t miss twice. It is bad for the purse.'],
    struck: ['Mind the dents, my lord. Dents cost money.', 'It will be a mark to mend that, I fear.'],
    tired: ['A rested horse saves on the leech, my lord.', 'Rest is free. The farrier is not.'],
    leading: ['Ahead, and not a penny wasted. Splendid.', 'Keep winning, my lord. Prizes pay for oats.'],
    behind: ['Don\'t lose, my lord. The purse is thin.', 'We cannot afford to fall further, my lord.'],
    won: ['The prize more than pays for the day, my lord.', 'A fine day, and a fine profit.'],
    lost: ['A costly day, my lord. We shall make it back.', 'At least the wage was cheap.'],
  },
  quick: {
    nerves: ['Quickly, my lord! They are waiting!', 'Ready, ready. Go before you think about it.'],
    start: ['Quick, my lord, while the horse is fresh!', 'Go, go. Before he does.'],
    broke: ['Another lance! Quick, before he rides!', 'Broken! Fast, fast, take a fresh one.'],
    helm: ['Did you see that? Straight in! Quick as light!', 'Gone before he blinked, my lord!'],
    miss: ['Too fast, my lord. Slow the point and it lands.', 'Quick again, my lord. Let him come.'],
    struck: ['Up, up, my lord! Shake it off!', 'Don\'t dwell, my lord. The next course is close.'],
    tired: ['A moment, my lord, only a moment. I will be quick.', 'Water, quick! He needs a breath.'],
    leading: ['Ahead! Keep moving, my lord!', 'Don\'t stop now, we\'re quick today.'],
    behind: ['Catch him, my lord! You have the legs for it.', 'A fast course turns it, my lord.'],
    won: ['Quick work, my lord! Done and dusted!', 'Well ridden! I hardly saw it!'],
    lost: ['Over so fast. Next time, my lord.', 'Quick and done. Shake it off.'],
  },
};

// Flavour for one post and one trait.
export const ROLE_TRAIT = {
  squire: { boastful: { broke: ['Did you hear them? That was my lance, my lord!', 'I chose that lance myself, my lord. They heard it break!'] } },
  groom: { drinker: { start: ['Easy, lad... easy. Who moved the ground?', 'Steady, boy. Steady. Not you, my lord. The horse.'] } },
  armourer: { boastful: { struck: ['That plate is mine, my lord. Not a crack, see?'] } },
  pursuivant: { boastful: { start: ['I\'ve shouted your name three times already, my lord.'] } },
};

// The lady who sent down her favour: she calls to you from the gallery (only once she has given it).
export const LADY = {
  start: ['Wear it on your arm, sir. Where I can see it.', 'Do not get it muddy. It was my mother\'s.'],
  broke: ['Oh, well struck, sir! Well struck!', 'You see? I chose well.', 'My sister owes me a ribbon.'],
  helm: ['Sir! Oh, sir! On the helm!', 'I knew you would. I told no one, but I knew.'],
  miss: ['Never mind it, sir. I did not see. I was looking at you.', 'Try lower, sir. I am told it helps.'],
  struck: ['Sir! Are you hurt? Somebody tell me he is not hurt.', 'Sit up, sir, so I can breathe.'],
  leading: ['They are all looking at my sleeve. Good.', 'Do not let it go to your head. Let it go to mine.'],
  behind: ['I did not give you that sleeve to lose, sir.', 'Ride for me, then, if not for yourself.'],
  won: ['Sir! Sir! Come to the gallery after!', 'My father will want to meet you. I apologise in advance.', 'Keep the sleeve. I have others.'],
  lost: ['You rode well, sir. Keep the sleeve. Next time it will be lucky.', 'I do not care about the score. Mostly.'],
};

// His squire and his men, at the far end of the lists: jeers when you miss or fall, grumbles when you break.
export const RIVAL = {
  nerves: ['Is your knight going to ride, or pray?', 'My master eats knights like yours for breakfast.', 'Nice horse. Pity about the rider.'],
  miss: ['Missed! Is he blind?', 'Ha! Did you see that? Air!', 'Next time aim at the big shiny thing, sir!', 'Your knight could not hit a barn door with a barn.'],
  bothMiss: ['Neither of them! Like two old women at a well!', 'Ha! Nobody home, either side!'],
  struck: ['Felt that, did you? Felt that?', 'There\'s more where that came from!', 'Tell your armourer to start hammering!'],
  fall: ['Down he goes! Down he goes!', 'Send for his mother!', 'Picked the softest bit of sand, I\'ll give him that.'],
  broke: ['Lucky. Lucky stroke.', 'Hm. He\'s been practising.', 'Our man let him have that one.'],
  helm: ['That was a foul! Was it a foul? It felt like a foul.', 'Steady, master. Steady. Breathe.'],
  behind: ['Losing, are we? Losing?', 'Pack the horse, lads. We\'ll be home for supper.'],
  leading: ['Don\'t get comfortable. Our man is just warming up.', 'He started late. He always starts late.'],
  foul: ['The horse! He struck the horse! Judges! Judges!', 'Foul! Everyone saw it! Foul!'],
};

// Who is likely to speak in each situation (weights by post; missing means a small chance).
const ROLE_W = {
  nerves: { squire: 3, master: 2, groom: 1.5, armourer: 1, pursuivant: 1.5, farrier: 0.6 },
  start: { squire: 3, pursuivant: 2, groom: 1, armourer: 1, farrier: 1, master: 1.5 },
  lance: { squire: 4, armourer: 2 },
  broke: { squire: 3, pursuivant: 2, armourer: 1, master: 1 },
  helm: { squire: 3, pursuivant: 3, armourer: 1 },
  miss: { master: 4, squire: 2, groom: 1, pursuivant: 1 },
  struck: { armourer: 3, master: 3, squire: 2, groom: 1, farrier: 1 },
  tired: { groom: 3, farrier: 2, master: 1.5, squire: 1 },
  leading: { pursuivant: 2, squire: 2, master: 1, groom: 1 },
  behind: { master: 3, squire: 2, groom: 1, armourer: 1 },
  won: { squire: 3, pursuivant: 3, groom: 2, armourer: 1, farrier: 1 },
  lost: { squire: 3, groom: 2, pursuivant: 1, armourer: 1, farrier: 1 },
};

/** The speaker and the line for a situation. men: [{ id, name, trait }] (only those standing there); used: a Set of lines already said this match.
 *  Returns { id, name, text } or null. Half the time a man speaks in his trait's voice, when he has a line that fits. */
export function chooseLine(sit, men, used, rnd = Math.random) {
  const W = ROLE_W[sit] || {};
  const pool = men.filter(m => LINES[m.id] && LINES[m.id][sit]);
  while (pool.length) {
    let tot = 0; for (const m of pool) tot += W[m.id] ?? 0.4;
    let r = rnd() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= W[pool[k].id] ?? 0.4; if (r <= 0) break; }
    const m = pool.splice(k, 1)[0];
    const fresh = (a) => (a || []).filter(t => !used.has(t));
    const flavour = [...fresh(ROLE_TRAIT[m.id] && ROLE_TRAIT[m.id][m.trait] && ROLE_TRAIT[m.id][m.trait][sit]), ...fresh(TRAIT[m.trait] && TRAIT[m.trait][sit])];
    const plain = fresh(LINES[m.id][sit]);
    const from = flavour.length && (rnd() < 0.55 || !plain.length) ? flavour : plain.length ? plain : flavour;
    if (from.length) return { id: m.id, name: m.name, text: from[Math.floor(rnd() * from.length) % from.length] };
  }
  return null;
}
/** A fresh line from LADY or RIVAL for a situation (null when the pool is empty or used up). */
export function sideLine(table, sit, used, rnd = Math.random) {
  const a = (table[sit] || []).filter(t => !used.has(t));
  return a.length ? a[Math.floor(rnd() * a.length) % a.length] : null;
}
