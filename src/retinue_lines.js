// What your men say between courses. LINES[role][situation] is the plain pool; TRAIT[trait][situation] is flavour any man can speak;
// ROLE_TRAIT[role][trait][situation] is flavour for one post. A line is at most 12 words. chooseLine() picks the speaker and the line.
// Situations: start, broke (you broke a lance), helm (you struck his helm), miss, struck (you were hit hard), tired (the horse), leading, behind, won, lost.

export const ROLE_TITLE = { squire: 'YOUR SQUIRE', groom: 'YOUR GROOM', armourer: 'YOUR ARMOURER', farrier: 'YOUR FARRIER', pursuivant: 'YOUR PURSUIVANT', master: 'THE MASTER OF ARMS' };
// The squire keeps to the personal word: cheer, concern, banter. Advice on the riding is the Master of Arms's (your trainer, at the rail; not a hired man).

export const LINES = {
  squire: {
    start: ['The lance is true, my lord. Ride well.', 'Gauntlets laced, my lord. Good luck.', 'God keep you, my lord.', 'All is ready, my lord.'],
    broke: ['That one shattered nicely, my lord!', 'A clean break, my lord. The crowd saw it.', 'Splinters everywhere! Another lance is ready.'],
    helm: ['His helm rang like a bell, my lord!', 'Right on the crest! He will feel that tonight.', 'Three points! They are shouting your name.'],
    miss: ['He was quick, my lord. Next time.', 'Air, my lord. It happens to the best of men.', 'No matter, my lord. The next is yours.'],
    struck: ['Are you hurt, my lord? You sit well.', 'He hit hard, my lord. I felt it from here.', 'That rattled my teeth, and I only watched.'],
    tired: ['Your horse is blowing, my lord.', 'He is lathered. He has given all he had.', 'Easy now. We have time, my lord.'],
    leading: ['You lead, my lord! The stands are with you.', 'Ahead on points, my lord. I could shout!', 'The stands are with you now, my lord.'],
    behind: ['We are behind, my lord, but only by a lance.', 'I believe in you, my lord.', 'One good course turns it, my lord.'],
    won: ['Victory, my lord! I knew it from the first course.', 'They will sing of this one, my lord!', 'A fine day, my lord. Your father would smile.'],
    lost: ['There will be other lists, my lord.', 'He was lucky today, my lord. Only lucky.', 'Chin up, my lord. The crowd still loves you.'],
  },
  master: {      // the trainer: advice only
    start: ['Eyes on his shield. Point low, lance late.', 'Keep your head down and your hands quiet.', 'Ride straight and close along the tilt.'],
    broke: ['Good. Now raise the lance at once, or it costs you.', 'You set it well. Do that again.'],
    helm: ['The helm is the hard mark. Do not hope for it twice.', 'A fine mark. Do not let it make you careless.'],
    miss: ['The point wanders when you hurry. Aim lower and wait for it.', 'Look at his shield, not at his helm. Then lower late.', 'Steady the point first. Find his shield.'],
    struck: ['Brace sooner. Take the thrust before he does.', 'Sit tall and lean in. A flinch unhorses a man.', 'Raise the shield to the helm if he aims high.'],
    tired: ['Walk him a moment. A blown horse runs wide.', 'Let him stand. A tired horse spoils the aim.', 'Take a breath, both of you.'],
    leading: ['Do not get careless. Ride the next as the first.', 'Keep it dull and steady. Points are won twice.'],
    behind: ['Do not chase him. Let him come to you.', 'A good course turns it. Keep your seat and wait for it.'],
  },
  groom: {
    start: ['He is calm and watered, my lord.', 'Good lad. Good lad. Off you go.', 'Girth is tight and hooves are sound.'],
    broke: ['Easy, boy. Only splinters on the sand.', 'The horse did not even flinch, my lord.', 'Good lance, good horse. Both held.'],
    helm: ['He heard the roar and stood proud, my lord.', 'That rang in his ears too, poor lad.', 'Fine work. The horse is proud of you.'],
    miss: ['He ran true, my lord. The fault was not his.', 'Don\'t blame the horse. He did his part.', 'Easy, boy. Next time we find him.'],
    struck: ['Steady, steady. He felt that, my lord.', 'The horse is shaking. Give him a moment.', 'Hold still, lad. It is only noise.'],
    tired: ['He is blowing hard, my lord. Don\'t push him.', 'Wet through, he is. Let me walk him.', 'He needs water more than advice.'],
    leading: ['The horse likes winning. Look at his ears.', 'He is up and eager. Keep him so.', 'He feels the crowd, my lord. He likes it.'],
    behind: ['He is still sound, my lord. Ask him again.', 'He has more in him than you think.', 'No lameness, no fear. Just ask.'],
    won: ['Best horse in the lists today, my lord.', 'An extra measure of oats tonight, I say.', 'He earned his oats today.'],
    lost: ['It was not the horse\'s fault, my lord.', 'He ran well. I\'ll rub him down.', 'A hard day for him too.'],
  },
  armourer: {
    start: ['Every rivet is tight, my lord.', 'I hammered your gorget flat this morning.', 'The plate is sound. Don\'t test it for fun.'],
    broke: ['Your lance broke, not your armour. A fair trade.', 'Hear that crack? That is a good strike.', 'A broken lance is steel well spent.'],
    helm: ['I would not want to be under that helm.', 'A dented crest for him. Good.', 'Skill like that deserves better plate.'],
    miss: ['Wasted effort, my lord. Hit plate, not air.', 'Missing saves a dent. Barely.', 'Aim for his shield. It is easier to hit.'],
    struck: ['Hold still, my lord. Let me hammer that flat.', 'A dent, but the steel held. I made it well.', 'That plate was worth every mark. See?'],
    tired: ['Harness is heavy when you tire. Loosen the straps.', 'Sit a moment. Armour weighs more each course.', 'Breathe, my lord. The steel is not going anywhere.'],
    leading: ['Ahead, and not a dent worth mentioning.', 'The steel holds. So may you.', 'You do well. The plate approves.'],
    behind: ['A little dent, a little score. It is nothing.', 'Plate can be mended. So can a score.', 'I have mended worse than this.'],
    won: ['Not a dent I cannot beat out by supper.', 'Well fought. The steel did its part.', 'I\'ll polish it to a mirror tonight.'],
    lost: ['The armour held, my lord. That is the main thing.', 'Plate can be mended. Pride mends itself.', 'Nothing broken that a hammer cannot fix.'],
  },
  farrier: {
    start: ['Four good shoes, my lord. Not a nail loose.', 'Hooves clean, frogs sound. Ride true.', 'He is shod for the sand. Go on.'],
    broke: ['Good lance, my lord. The hooves never faltered.', 'He stood the shock like a rock.', 'The ground shook. He did not.'],
    helm: ['That helm strike came from good footing, my lord.', 'Sure feet under you. It shows.', 'A horse that steady wins the day.'],
    miss: ['He placed his feet well. The aim is yours.', 'The hooves are true, my lord. Look to your point.', 'No fault in the shoeing, I promise.'],
    struck: ['I felt that in his hooves, my lord.', 'Let me look at his legs after this.', 'Hold him steady. I will check for heat.'],
    tired: ['His legs are tiring, my lord. Spare him.', 'I do not like how he breathes. Go gently.', 'Let him rest his hooves a moment.'],
    leading: ['Sound legs and a lead. A good day.', 'He is shod for victory, my lord.', 'Keep that pace and no more.'],
    behind: ['He has the legs for one more good run.', 'A shoe holds, a score can turn.', 'Ask him cleanly, my lord. He will answer.'],
    won: ['Four good shoes won this, my lord.', 'I will rest his legs a week.', 'A sound horse and a good knight.'],
    lost: ['His legs are sound. Take heart, my lord.', 'No shoe was lost. That is something.', 'Another day, my lord, with fresh shoes.'],
  },
  pursuivant: {
    start: ['They\'re shouting your name, my lord. Go and earn it.', 'The banner flies and the stands are watching.', 'Ride, and give me something to proclaim.'],
    broke: ['A lance broken in your name! I\'ll shout it.', 'The heralds will write that one down, my lord.', 'Splintered wood, my lord. Splendid.'],
    helm: ['Upon the helm! They will speak of it in the hall.', 'That strike belongs in the roll of arms.', 'A herald couldn\'t ask for better.'],
    miss: ['The stands are quiet, my lord. Give them a reason.', 'A miss is forgotten by the next course.', 'No shame, my lord. I\'ll say nothing.'],
    struck: ['A hard blow, but you sit like a lord.', 'They gasped, my lord. Now make them cheer.', 'Honour is not dented by one blow.'],
    tired: ['The stands can wait, my lord. Rest your horse.', 'A knight who rests is a knight who wins.', 'Breathe. Your name is not going anywhere.'],
    leading: ['The ladies are watching you, my lord.', 'The whole rail is talking about your lead.', 'Keep your honour bright, my lord.'],
    behind: ['The stands favour a knight who fights back.', 'There is glory in a late rally, my lord.', 'I have seen worse turned about.'],
    won: ['They\'ll shout your victory in every town, my lord!', 'I\'ll be hoarse by supper, and happy.', 'Let the heralds write it large.'],
    lost: ['A knight is judged by how he bears it, my lord.', 'I\'ll shout about your courage, not the score.', 'They will remember your bearing.'],
  },
};

// Flavour any man can speak, by trait.
export const TRAIT = {
  boastful: {
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
    start: ['Calm hands, my lord. The rest will follow.', 'One course at a time. That is all.'],
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
    start: ['Easy, lad... easy. Who moved the ground?', 'Ready, my lord. Mostly. Hic. Ready.'],
    broke: ['Ha! Splendid! Have they... have they all got two heads?', 'Broke it clean! That calls for a cup.'],
    helm: ['Right on his head! Ha! I felt that in my own.', 'A fine blow. I\'ll drink to it. Later.'],
    miss: ['The lance moved, my lord. I saw it.', 'Never mind. The world is crooked today.'],
    struck: ['Ow. That was... that was your armour, not mine.', 'He hit you? Hold him still, I will see to him.'],
    tired: ['I am tired too, my lord. Quite tired. Quite.', 'Let us all sit down. Just for a breath.'],
    leading: ['We are winning? Marvellous. Pour a cup.', 'Ahead, my lord. Or is that behind? Ahead.'],
    behind: ['A little behind. Nothing a cup would not cure.', 'We shall get them. I think. Which way are they?'],
    won: ['We won! Everyone drinks!', 'Victory! I\'ll remember it. Probably.'],
    lost: ['We lost? Then I need a drink even more.', 'Well. That is a pity. Is there ale?'],
  },
  devout: {
    start: ['I have said a prayer for you, my lord.', 'Saint George be with you on the sand.'],
    broke: ['A miracle, my lord! Or at least good oak.', 'Thank Saint George for that lance.'],
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
    start: ['Mind that lance, my lord. It cost three marks.', 'Don\'t break anything you don\'t have to.'],
    broke: ['That lance cost three marks, my lord. Worth it, I suppose.', 'Broken again. Oak is not cheap, my lord.'],
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
    start: ['Quickly, my lord! They are waiting!', 'Ready, ready. Go before he does.'],
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

// Flavour for one post and one trait (the lines the owner asked for, and a few more in the same spirit).
export const ROLE_TRAIT = {
  squire: { boastful: { broke: ['Did you hear them? That was my lance, my lord!', 'I chose that lance myself, my lord. They heard it break!'] } },
  groom: { drinker: { start: ['Easy, lad... easy. Who moved the ground?', 'Steady, boy. Steady. Not you, my lord. The horse.'] } },
  armourer: { boastful: { struck: ['That plate is mine, my lord. Not a crack, see?'] } },
  pursuivant: { boastful: { start: ['I\'ve shouted your name three times already, my lord.'] } },
};

// Who is likely to speak in each situation (weights by post; missing means a small chance).
const ROLE_W = {
  start: { squire: 3, pursuivant: 2, groom: 1, armourer: 1, farrier: 1, master: 1.5 },
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
