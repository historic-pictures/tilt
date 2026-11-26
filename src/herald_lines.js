// Herald / announcer lines for the narrated mode. Spoken by browser text-to-speech, scheduled by src/voice.js.
// The speaker is Master Hugh Clement, King of Arms (see drama_lines.js): a professional herald making announcements. Dry, exact, proud of a clean
// break, scornful of a foul, never gushing. Modern plain sentences (no thee/thou), with the real vocabulary of the lists used the way a
// commentator uses football terms: the cheque, a course, couching the lance, the coronel, an attaint, broken on the helm, borne to the ground.
// Placeholders: {you} {him} (short name) {himFull} {venue} {city} {year} {yourScore} {hisScore} {course} {land} {horse} {arms} {fouler}
// Word caps (see docs/presentation-research.md): live result lines <= 8 words, score/verdict <= 10, colour <= 20, replay colour <= 18,
// stoppages (intro, match end) <= 30, shouts 2-4. The caps count the words AFTER the placeholders are filled in ({you} is usually 2 words).
// Pools are not mode-aware, so no result line names a rule set; the colour facts do that instead.

export const HERALD = {
  // ---------------------------------------------------------------- stoppages: the intro, one line at a time
  entry: [
    "Oyez, oyez. The lists at {venue} are open.",
    "People of {city}, welcome to {venue}. Take your seats, and keep them.",
    "The sand is raked and the lists are ready. {venue} is open.",
    "Banners up. The heralds are ready, and so am I.",
    "Quiet in the commons, please. {venue} is open, and the cheque is blank.",
    "Welcome to {venue}, {city}. I have cried a great many lists. I expect a good one today.",
  ],
  introHim: [
    "Against him, {himFull}, of {land}.",
    "Announcing {himFull}, of {land}. Mark his arms; you will see them again.",
    "Make way for {himFull} of {land}. He has run these courses before.",
    "Now entering the lists: {himFull}, of {land}.",
  ],
  introYou: [
    "Here rides {you}, bearing {arms}, on his {horse}.",
    "Announcing {you}, whose arms are {arms}.",
    "And {you}, on a fine {horse}. Cry his arms: {arms}.",
    "Mark {you}, and his arms, {arms}. The heralds have him on the cheque.",
  ],

  // ---------------------------------------------------------------- tier 2: the marshal calls the course (<= 8 words)
  courseStart: [
    "The {course} course. Knights, to your marks.",
    "Couch your lances. The {course} course.",
    "The {course} course. Close your visors.",
    "Quiet for the {course} course!",
    "To the lists: the {course} course.",
    "Lances ready. Run the {course} course.",
    "Hold the line. The {course} course begins.",
    "Let the {course} course be run.",
    "Knights, set your lances. The {course} course.",
    "Steady, both of you. The {course} course.",
  ],

  // ---------------------------------------------------------------- tier 3: lessons (<= 16 words), once each per match
  teachSalute: [
    "Salute the gallery before you run. It is the custom of the lists.",
    "Lift your lance to the ladies first. A good knight greets the gallery.",
    "Greet the gallery before the course. The heralds notice who forgets.",
  ],
  teachLower: [
    "Carry the lance upright, then lower it late, about three strides out.",
    "Don't drop the point too soon. It tires your arm.",
    "Lance upright, then down, smooth as a gate closing. Lower it late.",
    "Couch the lance late. Too early, and the point wanders.",
  ],
  teachAim: [
    "Watch your lance point. The shield is the fair mark.",
    "The shield is the surest target. The helm is harder, but it counts for more.",
    "Keep your eye on the mark. A steady point finds the shield.",
    "The coronel grips best on a square hit. Aim for the middle.",
  ],
  teachSeat: [
    "Lean into the shock and don't flinch. Flinch, and you fall first.",
    "Sit deep, feet braced in the stirrups. A firm seat carries you through.",
    "Meet the shock with your whole body behind the lance.",
    "Settle the lance in the rest and let the horse carry the weight.",
  ],
  teachHorse: [
    "Keep your horse straight and close along the tilt.",
    "A good destrier runs collected. Hold him steady and he carries the lance true.",
    "Ride close to the barrier, but not against it. The tilt costs marks.",
  ],

  // ---------------------------------------------------------------- tier 1: the result of the stroke (<= 8 words), said no earlier than impact + 1 s
  youBreak: [
    "A lance broken! Two for {you}.",
    "Shivered on the shield! Two to {you}.",
    "Well run, {you}. The lance is broken.",
    "{you} breaks a lance. Two marked.",
    "Broken clean. The heralds mark two.",
    "Properly broken. Two to {you}.",
    "Clean break, {you}. Two on the cheque.",
    "{you} breaks his lance on {him}.",
    "Splinters on the sand. Two to {you}.",
    "Fine stroke. {you} breaks a lance.",
    "A clean break. I approve. Two marks.",
    "Lance shivered. Two marks to {you}.",
  ],
  himBreak: [
    "{him} breaks his lance on you.",
    "Shivered on your shield. Two to {him}.",
    "A lance broken against you. Two marks.",
    "Two to {him}. A clean break.",
    "Broken on your body. Two to {him}.",
    "{him} breaks cleanly. Two on the cheque.",
    "Splinters. {him} marks two against you.",
    "A fair break from {him}. Two marks.",
    "Remember that one. Two to {him}.",
    "{him} breaks a lance. Two marks.",
  ],
  youHelm: [
    "Broken on the helm! Three to {you}.",
    "Struck in the sight of the helm. Three.",
    "The helm is struck. Three for {you}.",
    "On the helm, cleanly. Three marks.",
    "A lance broken on the helm. Three.",
    "Few aim so high. Fewer hit. Three.",
    "Helm struck square. Three to {you}.",
    "Straight to the helm. Three marks.",
  ],
  himHelm: [
    "Broken on your helm. Three to {him}.",
    "Your helm is struck. Three to {him}.",
    "{him} finds the helm. Three marks.",
    "A lance broken on your helm. Three.",
    "Struck in the sight of the helm. Three.",
    "Three to {him}. Your helm took it.",
    "The helm rings. Three against you.",
    "Shake it off. Three marks to {him}.",
  ],
  youAttaint: [
    "An attaint for {you}. One mark.",
    "Struck true, the lance holds. An attaint.",
    "A clean attaint. One on the cheque.",
    "The lance holds. An attaint, one mark.",
    "Touched, not broken. One for {you}.",
    "An attaint. Fair, but nothing broken.",
    "Struck, but the lance holds. One mark.",
    "{you} touches cleanly. One mark.",
  ],
  himAttaint: [
    "An attaint for {him}. One mark.",
    "{him} touches, but nothing breaks. One mark.",
    "Lance holds. An attaint to {him}.",
    "A fair touch against you. One mark.",
    "An attaint. One to {him}.",
    "Struck, but unbroken. One to {him}.",
    "Touched, no splinters. One for {him}.",
    "A clean touch for {him}. One mark.",
  ],
  youMiss: [
    "No touch. The point found nothing.",
    "Wide of the mark, {you}.",
    "Nothing struck, {you}. Ride again.",
    "A course without a touch. It happens.",
    "Air only. Nothing on the cheque.",
    "Missed. Steady yourself for the next.",
    "{you} passes without a touch.",
    "The point goes wide. No mark.",
  ],
  himMiss: [
    "{him} misses! His point goes wide.",
    "No touch from {him}.",
    "He finds only air.",
    "A clean miss from {him}.",
    "{him} passes without a mark.",
    "His lance goes wide. Nothing marked.",
    "The knight of {land} misses.",
    "{him} misses. The commons groan.",
  ],
  bothMiss: [
    "Neither lance finds its mark.",
    "Both pass without a touch.",
    "A clean pass. Nothing on the cheque.",
    "Both miss. Let them ride again.",
    "Nothing struck on either side.",
    "The commons sigh. No marks given.",
    "Two misses. The cheque stays clean.",
    "No touch from either knight.",
  ],
  youUnhorse: [
    "{him} is unhorsed! {you} wins outright.",
    "Borne to the ground! The match is yours.",
    "Unhorsed! That ends the match, {you}.",
    "{him} is borne to the ground.",
    "Out of the saddle. No cheque needed.",
    "A great stroke. {him} is unhorsed.",
    "{you} unhorses {him}. Match to you.",
    "Down he goes. That is the match.",
    "He lies on the sand. {you} wins.",
    "Unhorsed! The heralds can put down their pens.",
  ],
  himUnhorse: [
    "You are unhorsed. The match is lost.",
    "{him} unhorses you. He wins outright.",
    "Borne to the ground. Rise slowly.",
    "A hard blow. You fall.",
    "Out of the saddle, {you}. Match lost.",
    "{him} wins by unhorsing.",
    "You are on the sand. The match ends.",
    "A mighty blow. That ends the match.",
    "Unhorsed. Well tried, all the same.",
    "The heralds will not need the cheque now.",
  ],
  foulHorse: [
    "Foul! {fouler} struck the horse.",
    "Shame. A horse is never a mark.",
    "The horse is struck. A grave foul.",
    "Foul. The judges mark it against {fouler}.",
    "Never the horse. That is a foul.",
    "Foul stroke. A second forfeits the prize.",
    "I saw that. Never strike the horse.",
    "Foul, marked against {fouler}. Shameful.",
    "The horse is struck. The judges frown.",
  ],
  foulTilt: [
    "The tilt is struck. Marks are lost.",
    "Struck the tilt. That is a fault.",
    "A fault. The tilt is not a mark.",
    "Barrier struck. The judges mark a fault.",
    "Keep clear of the tilt, knight.",
    "Striking the tilt costs marks.",
    "A fault! The tilt is struck.",
    "Marks lost for striking the tilt.",
    "The tilt is no target. Marks lost.",
  ],

  // ---------------------------------------------------------------- tier 1: the ONE combined result call per course, once both lances are spent (<= 24 words).
  // Built in main.js resultCall(): [your stroke] [his stroke] [tilt] [score]. {you} {him}; {pts} = points each when both strokes score alike; {yourW} {hisW} {n} = scores in words.
  // Outcome keys: miss, attaint, glance, breakShield, breakBody, helm, foul. An unhorsing overrides everything (RES_UNHORSE_*), and has no score.
  RES_YOU: {
    miss: ["Air for {you}.", "{you} finds only air.", "No touch from {you}."],
    attaint: ["An attaint for {you}.", "{you} touches, but the lance holds.", "A fair touch for {you}."],
    glance: ["{you} glances off the plate.", "{you}'s point skids away.", "Glanced away, {you}."],
    breakShield: ["Shivered on the shield for {you}.", "{you} breaks a lance on the shield.", "Broken on the shield by {you}."],
    breakBody: ["A lance broken on the body for {you}.", "{you} breaks his lance on the body.", "Broken on the breastplate by {you}."],
    helm: ["{you} breaks on the helm!", "Broken on the helm, by {you}.", "{you} takes him on the helm."],
    foul: ["Foul! {you} strikes the horse.", "{you} hit the horse. A foul stroke.", "A foul stroke by {you}, on the horse."],
  },
  RES_HIM: {
    miss: ["{him} misses.", "Nothing from {him}.", "{him} finds only air."],
    attaint: ["An attaint for {him}.", "{him} touches {you}, lance unbroken.", "A fair touch for {him}."],
    glance: ["{him} glances off.", "{him} skids off {you}'s plate.", "{him}'s point slides away."],
    breakShield: ["{him} shivers a lance on {you}'s shield.", "Broken on {you}'s shield by {him}.", "Shivered on the shield for {him}."],
    breakBody: ["{him} breaks a lance on {you}'s body.", "Broken on {you}'s breastplate by {him}.", "A lance broken on the body for {him}."],
    helm: ["{him} breaks on {you}'s helm!", "{him} takes {you} on the helm.", "Broken on the helm, by {him}."],
    foul: ["Foul! {him} strikes {you}'s horse.", "{him} hit the horse. A foul stroke.", "A foul stroke by {him}, on {you}'s horse."],
  },
  RES_BOTH: {
    miss: ["Neither lance finds its mark.", "Both riders pass through air.", "No touch on either side."],
    attaint: ["Both land, and neither lance breaks.", "Touches on both sides, and no splinters.", "An attaint each, and the ash holds."],
    glance: ["Both points skid away.", "Glanced on both sides.", "Both glance off the plate."],
    breakShield: ["Both lances broken on the shield!", "Shivered on both shields!", "Both lances broken!"],
    breakBody: ["Both lances broken on the body!", "Two lances broken, body to body.", "Both lances broken!"],
    helm: ["Both on the helm!", "Both lances broken on the helm!", "Helm for helm, and both lances broken!"],
    foul: ["Foul from both riders, and on the horses!", "Both riders struck a horse. Shameful."],
  },
  RES_APIECE: ["{pts} apiece.", "{pts} each.", "{pts} apiece on the cheque."],
  RES_UNHORSE_YOU: ["{you} unhorses {him}!", "{him} is borne to the ground by {you}!", "{you} bears {him} from the saddle!"],
  RES_UNHORSE_HIM: ["{him} unhorses {you}!", "{you} is borne to the ground by {him}!", "{him} bears {you} from the saddle!"],
  RES_UNHORSE_BOTH: ["Both riders are down!", "Both borne to the ground!"],
  RES_TILT: ["And {you} struck the tilt.", "{you} grazed the barrier.", "A touch on the tilt from {you}."],
  SCORE: {
    none: ["Nothing on the cheque yet.", "The cheque stays clean.", "Nothing marked either way."],
    level: ["Level at {n}.", "{n} apiece on the cheque.", "All square at {n}."],
    youAhead: ["{you} {yourW}, {him} {hisW}.", "{yourW} to {hisW} for {you}.", "{you} ahead, {yourW} to {hisW}."],
    himAhead: ["{him} {hisW}, {you} {yourW}.", "{hisW} to {yourW} for {him}.", "{him} leads, {hisW} to {yourW}."],
    youTakes: ["{you} takes the lead, {yourW} to {hisW}.", "The lead is {you}'s, {yourW} to {hisW}."],
    himTakes: ["{him} takes the lead, {hisW} to {yourW}.", "The lead passes to {him}, {hisW} to {yourW}."],
  },

  // ---------------------------------------------------------------- tier 3: Hugh's remark on HIS stroke, the second replay colour line (<= 18 words). The first remark (replay* below) is on yours.
  REMARK_HIM: {
    miss: ["{him} carried his point wide. The lance never settled on the target.", "Nothing from {him}. The point drifted off the line before the shock.", "A miss from {him}: late in the couch, and nothing to show for it."],
    attaint: ["{him} touches you cleanly, but the lance holds and nothing breaks.", "A fair touch from {him}. The point bites, though the ash will not give."],
    glance: ["{him}'s point slid away. A flat strike gives up its force.", "{him} was turned aside. A glancing stroke earns little."],
    breakShield: ["{him} breaks his lance on your shield. He rode straight, and the point met squarely.", "A proper break from {him}. Square on the shield, and the ash gave way."],
    breakBody: ["{him} breaks a lance on your body. The weight of his horse was behind it.", "A square hit from {him}. The ash gave way against the breastplate."],
    helm: ["{him} goes for the helm and finds it. That blow rings the head like a bell.", "On the helm from {him}. The smallest mark, and he struck it squarely."],
    foul: ["{him} struck your horse. The marshals will not forgive that.", "A foul stroke from {him}. The horse is never the target."],
  },

  // ---------------------------------------------------------------- tier 1: a shout at the strike (2-4 words, never longer)
  shout: [
    "Shivered!", "Splinters!", "Well struck!", "Lance broken!", "Hear it crack!", "A great blow!", "Clean break!", "Wood flies!", "Fine stroke!",
  ],
  shoutDown: [
    "He's down!", "Unhorsed!", "Down he goes!", "Borne down!", "He falls!", "A mighty fall!", "Out of the saddle!",
  ],
  shoutFall: [
    "You're down!", "Unhorsed!", "Down you go!", "Borne down!", "A hard fall!",
  ],

  // ---------------------------------------------------------------- tier 2: the score, only when it is news (<= 10 words). The cheque is the heralds' score sheet.
  leadYou: [
    "On the cheque: {you} {yourScore}, {him} {hisScore}.",
    "{you} takes the lead, {yourScore} to {hisScore}.",
    "The lead is {you}'s: {yourScore} to {hisScore}.",
    "{you} leads, {yourScore} to {hisScore}.",
    "Ahead on the cheque: {you}, {yourScore} to {hisScore}.",
    "The cheque favours {you}, {yourScore} to {hisScore}.",
  ],
  leadHim: [
    "On the cheque: {him} {hisScore}, {you} {yourScore}.",
    "{him} takes the lead, {hisScore} to {yourScore}.",
    "The lead passes to {him}: {hisScore} to {yourScore}.",
    "{him} leads, {hisScore} to {yourScore}.",
    "Ahead on the cheque: {him}, {hisScore} to {yourScore}.",
    "The cheque favours {him}, {hisScore} to {yourScore}.",
  ],
  scoreLevel: [
    "All square on the cheque, {yourScore} each.",
    "Level. {yourScore} apiece.",
    "The cheque is level at {yourScore} each.",
    "Nothing between them, {yourScore} each.",
    "Dead even. Anyone's match.",
    "The heralds have it level, {yourScore} each.",
  ],
  matchPoint: [
    "The last course decides it.",
    "The final course. All is still to play.",
    "One course remains, my lords.",
    "The last course will settle it.",
    "Final course. Couch well, knights.",
    "One course more, and the cheque is closed.",
    "The final course. The commons are on their feet.",
  ],

  // ---------------------------------------------------------------- tier 3/4: colour between courses (<= 20 words, ~12 here)
  turnAbout: [
    "The knights wheel about, and squires bring fresh lances.",
    "At the far end, each rider takes a fresh lance.",
    "The broken wood is cleared from the sand.",
    "Squires hand up new lances, and the heralds ready the cry.",
    "Turn about, knights, and straighten your helms.",
    "The heralds compare their cheques. Mine, naturally, is correct.",
    "Breathe, knights. The lists will wait, though not for long.",
  ],
  royalPleased: [
    "The king nods. Good sport, my lords.",
    "The queen smiles upon the lists.",
    "The royal seat is content. That is no small thing.",
    "The royal gallery applauds such riding.",
  ],
  royalRise: [
    "The king rises. He has seen a stroke worth rising for.",
    "The royal gallery stands. Such a blow is rare.",
    "The king is on his feet. The commons will want to join him.",
  ],
  royalDispleased: [
    "The king frowns. Remember the courtesy owed to the gallery.",
    "The queen turns away. That was beneath this company.",
    "The royal seat is displeased. Ride better, my lords.",
  ],
  ladyFavour: [
    "A lady sends down her sleeve as a favour. Wear it with pride.",
    "A lady drops a veil from the gallery. A favour, and a courteous one.",
  ],

  // ---------------------------------------------------------------- stoppage: the match is over (<= 30 words)
  win: [
    "That is the match. {you} wins, {yourScore} to {hisScore}, on the cheque. Honour to a fair knight.",
    "The heralds have closed the cheque. {you} wins, {yourScore} marks to {hisScore}. The ladies will judge the prize.",
    "A fine victory for {you}, {yourScore} to {hisScore}. {him} rode well, but the cheque does not lie.",
    "{you} carries the day, {yourScore} to {hisScore}. Let the trumpets sound.",
    "I have cried a great many matches. {you} wins this one, {yourScore} to {hisScore}, and has earned it.",
  ],
  loss: [
    "That is the match. {him} wins, {hisScore} to {yourScore}, on the cheque.",
    "The heralds have closed the cheque. {him} wins, {hisScore} marks to {yourScore}. {you} fought bravely.",
    "A hard day for {you}. {him} takes the match, {hisScore} to {yourScore}. Ride again.",
    "{him} carries the day, {hisScore} to {yourScore}. Honour to both knights.",
    "{him} wins, {hisScore} to {yourScore}. {you} rode well enough. The cheque asked for more.",
  ],
  draw: [
    "The match ends level, {yourScore} marks each. The judges find no winner, and the knights part as friends.",
    "A draw. {you} and {him} stand equal on the cheque. They shake hands and leave together.",
    "Level at {yourScore} each, and the heralds can find nothing to choose between them. I will say it was well done.",
  ],
  prize: [
    "Now the lady of the gallery rises to give the prize. By custom, the ladies reward the best knight.",
    "The ladies have spoken. The prize goes to the knight who rode best, with a kiss and a kind word.",
    "Come forward, brave knight, and take the prize from the lady's hand. Largesse to the heralds!",
  ],

  // ---------------------------------------------------------------- tier 3: replay colour (<= 18 words): what made the stroke work or fail
  replay: [
    "Speed does the work. A galloping horse puts the weight of man and mount behind the point.",
    "A lance couched late and set firm strikes true. Too early, and the arm tires.",
    "Watch the lean at the shock. A rider who thrusts into the blow hits harder.",
    "A square hit bites. A glancing one skids off the plate and gives the stroke away.",
    "The ash shaft is made to break. A clean break means the point met squarely.",
    "The first blow spoils the second. The man struck first rides off his line.",
    "Close to the tilt the reach is short and the blow heavy.",
    "A braced rider takes the shock on his whole body, and keeps his seat.",
    "The helm is the smallest mark. Strike it squarely and the lance breaks.",
    "Lance steady, eye on the shield: that is how a stroke is made.",
    "The vamplate guards the hand, but the rest steadies the lance. Keep it settled.",
  ],
  replayMiss: [
    "A point carried wide finds only air. Keep the coronel on the shield.",
    "A lance lowered too late has no time to settle. Start about three strides out.",
    "A lance lifted early loses the mark. Hold it down until the lances meet.",
    "Both horses were fast and the margin small. A steady hand makes the difference.",
    "A miss is a lesson. Watch where the point went, and correct it.",
  ],
  replayGlance: [
    "The point met the plate too flat and skidded. Aim nearer the centre.",
    "A rounded helm sheds a lance. Strike it square or the point slides off.",
    "Slanted armour turns a point aside. The middle of the shield bites best.",
    "A coronel is made to grip. Strike flat and it slides; strike square and it holds.",
  ],

  // ---------------------------------------------------------------- tier 3: facts, once per match each (<= 20 words), between courses. Real history only.
  facts: [
    "A joust of peace used blunt lances with a crown of points, a coronel, so the point would grip.",
    "Jousting lances were often twelve feet or more, of ash or other tough wood, and made to break.",
    "The Church often forbade tournaments, but kings and lords largely ignored the popes and councils.",
    "The tilt, a barrier between the riders, came into use in the early fifteenth century.",
    "Before the wooden tilt, some jousts used a cloth barrier. It too kept the horses apart.",
    "In 1390 three French knights held the lists at Saint-Inglevert near Calais for thirty days.",
    "At Saint-Inglevert, a challenger touched a shield at the knights' tent to choose his kind of joust.",
    "In 1434 Suero de Quiñones held the bridge at Órbigo for a month, in the Passo Honroso.",
    "At Bruges in 1468, the Golden Tree tournament for Charles the Bold's wedding lasted for days.",
    "In 1466 John Tiptoft, Earl of Worcester, wrote ordinances for jousts of peace, setting how blows were marked.",
    "Under the 1466 ordinances, a lance broken above the coronel counted two, and one that unhorsed counted three.",
    "King Duarte of Portugal wrote a book on riding and jousting in the 1430s.",
    "A squire carried his master's lances and helm. Many squires later became knights themselves.",
    "Heralds kept the records of the lists. They knew every coat of arms and cried the names.",
    "The jousting helm had a narrow slit for the eyes. Riders could see little at the moment of impact.",
    "A knight often wore a lady's favour, a sleeve or veil, tied to his arm or helm.",
    "Tiptoft's ordinances are plain on one point: a rider who strikes his opponent's horse loses the prize.",
    "Under Tiptoft's rules, a lance broken on the body scores one, on the helm two, unhorsing three.",
    "In 1330 Alfonso XI of Castile founded the Order of the Band and wrote jousting rules for its knights.",
    "In Germany the joust without a barrier was the Gestech, and the joust with sharp lances the Scharfrennen.",
    "Heralds kept the score of each tilt on a cheque, a sheet marking every lance. Some Tudor ones survive.",
    "A joust is single combat. The early tournament was a mass melee, and far more dangerous.",
    "A pursuivant is a junior herald. A King of Arms stands at the top of the profession.",
    "Smithfield, just outside the walls of London, was a regular site for royal jousts.",
    "Jacques de Lalaing of Burgundy held his pas d'armes, the Fountain of Tears, at Chalon in 1449.",
    "In 1227 Ulrich von Liechtenstein rode from Venice dressed as Lady Venus, breaking lances at every stop.",
    "Maximilian I had a book, the Freydal, painted to record his tournaments.",
    "In 1559 Henry II of France died of a lance splinter through his visor, in a tournament at Paris.",
    "Henry VIII was unhorsed in the lists in 1536 and lay senseless for two hours. He never jousted again.",
    "A vamplate is the disc on the lance in front of the hand. It stops a point sliding onto it.",
    "From the fourteenth century, a rest on the breastplate carried the weight of the lance.",
  ],
};


export const RESEARCH_NOTES = `PART 1 FINDINGS (a to e). Sources read: Tiptoft's 1466 ordinances as transcribed on Will's Commonplace Book (from a 16th century manuscript; the barrier section may be later additions); Craig Taylor's 2024 article and the Aristocratic Fury summary on Saint-Inglevert 1390 (Froissart); the Pas d'armes virtual exhibition (pasdarmes.org); Wikipedia Joust. Rene d'Anjou and HRP pages were unreachable, so gaps are marked [U].

(a) Order of day. Heralds proclaimed events, checked challengers' noble ancestry on arrival and called out the names or mottoes of notable competitors. At Saint-Inglevert 1390 each of the three French knights hung two shields at his tent, a peace shield (a plaisance, blunted coronel lance) and a war shield (a outrance). A challenger touched a shield, and a horn beside them could be blown to call for a joust. The ladies were spectators and advisers to the judges, and the prize was reserved to the Queen and the ladies (Tiptoft). Prizes (swords, rings, circlets) were presented by ladies, often with a kiss. Largesse cries and sleeve favours: [U].

(b) Between courses. Five courses per challenge at Saint-Inglevert; Boucicaut ran fifteen with Huntingdon; Bolingbroke ran ten. Golden Tree allowed up to about 100 courses. Whether riders returned to their own end or wheeled about: [U]. With a tilt, riders pass in opposite directions, so each must turn at the far end and run back; no source confirmed it. Fresh lances from squires: [U]. Tiptoft scoring: a lance broken between saddle and helm charnel counts 1 spear, above the coronel 2, one that unhorses or disarms the foe, or coronel to coronel, 3; breaking on the saddle disallows 1; hitting the tilt disallows 2, then 3, and three tilt hits lose the prize; striking the horse or a disarmed or turned man loses the prize. Ranking for the prize: unhorsing first, then two coronel hits, three sight (helm) hits, most spears broken. Heralds' cries Laissez aller and Faites vos devoirs: [U].

(c) Trumpets: horns at Saint-Inglevert; signal to run by bugle or herald's cry (general). Exact sequence: [U].

(d) Crowd: at Saint-Inglevert a crowd of heralds, trumpeters, minstrels and all ranks shouted the names of the fighters. The Church's bans: [U] detail; lords largely ignored them.

(e) A Knight's Tale [U]: a peasant competes under a false pedigree, whereas heralds checked noble birth; it uses simple points and spectacle shattering, not the judges' cheque; and it has rock music.`;

// ---------------------------------------------------------------- the owner's brief (Nov 2026): more variety, the tone of a real herald's cry (plain English, no thee/thou), arms, horse, crowd and score named.
// Appended to the pools above; main.js pickLine() never repeats a line within a match until a pool is used up. {hisArms} and {hisHorse} are filled by herald() in main.js.
const more = (arr, ...l) => { arr.push(...l); };
// the roll call before the first and the last course (spoken from the rail with the scroll, see ceremony.js: the announcer unrolls it while he speaks)
HERALD.callKnights = [
  "Oyez! {himFull}, of {land}, in {hisArms}, against {you}, in {arms}. Ride when the flag falls.",
  "Hear the heralds! {you}, in {arms}, and {himFull} of {land}, in {hisArms}. The {course} course!",
  "Make way, good people. {himFull} of {land} wears {hisArms}. {you} answers in {arms}.",
  "Knights of the lists: {himFull}, {hisArms}, and {you}, {arms}. God give you good speed.",
  "Cry the arms! {hisArms} for {himFull}. {arms} for {you}, on his {horse}.",
  "{himFull}, of {land}, sets his lance against {you}. {hisArms} against {arms}.",
  "Mark them well, ladies and gentles. {arms} on the one hand, {hisArms} on the other.",
  "Come to the barrier, {him}. And you, {you}. The {course} course, by the marshal's leave.",
  "A fair field and no favour! {you} on his {horse}, against {himFull} of {land}.",
  "Hush, the commons! {himFull}, in {hisArms}, rides against {you}, in {arms}.",
  "Good people of {city}, behold: {you}, in {arms}, and {himFull} of {land}, in {hisArms}.",
  "Lances up! {you} for {arms}, {him} for {hisArms}. The {course} course, and God defend the right.",
  "By the king's peace, {himFull} and {you} run the {course} course. Let none cry out.",
  "Sirs, to your marks! {hisArms} on one side, {arms} on the other, and all {city} watching.",
  "Let it be known: {you}, in {arms}, meets {himFull} of {land}. The score stands {yourScore} to {hisScore}.",
  "Neither knight has yielded. {him}, in {hisArms}. {you}, in {arms}. The {course} course, and no mercy asked.",
];
more(HERALD.courseStart,
  "God speed you both. The {course} course.", "By the marshal's leave, the {course} course.", "The {course} course. Fair play, and no foul.", "The crowd is hushed. The {course} course.",
  "Sound the horn! The {course} course.", "Ride well. The {course} course.", "The {course} course, and may the best lance win.", "Barrier clear. The {course} course.",
  "Tighten your girths. The {course} course.", "The {course} course. {him} is waiting.", "All eyes on the sand. The {course} course.", "Visors down. The {course} course begins.");
more(HERALD.RES_YOU.miss, "{you} rides through empty air.", "The point finds nothing for {you}.", "{you}'s lance goes wide, and the crowd groans.", "{you} strikes at the wind.");
more(HERALD.RES_YOU.attaint, "{you} touches, and the lance holds.", "A good touch from {you}.", "{you}'s point lands true, and the ash holds.", "A touch, and a fair one, for {you}.");
more(HERALD.RES_YOU.glance, "{you} is turned aside.", "A slide of steel from {you}.", "{you}'s point finds only a curve of plate.");
more(HERALD.RES_YOU.breakShield, "{you} splinters the shield, and the crowd roars.", "Wood flies from {you}'s lance on the shield.", "A shield cracked by {you}.", "{you} breaks his ash upon the shield.");
more(HERALD.RES_YOU.breakBody, "{you} breaks his ash on the breastplate.", "A body stroke, well broken by {you}.", "The breastplate rings under {you}'s lance.", "A hard break on the body for {you}.");
more(HERALD.RES_YOU.helm, "{you} rings the helm and breaks his lance!", "On the helm! {you} breaks true.", "{you} strikes the head, and the lance flies in pieces.");
more(HERALD.RES_HIM.miss, "{him} rides through air.", "{him}'s lance goes wide.", "The point of {him} finds nothing.", "{him} strikes at the wind.");
more(HERALD.RES_HIM.attaint, "{him} touches, and the lance holds.", "A good touch from {him}.", "{him}'s point lands true, and the ash holds.");
more(HERALD.RES_HIM.glance, "{him} is turned aside.", "A slide of steel from {him}.", "{him}'s point finds only a curve of plate.");
more(HERALD.RES_HIM.breakShield, "{him} splinters your shield, and the crowd roars.", "Wood flies from {him}'s lance on your shield.", "{him} breaks his ash upon your shield.");
more(HERALD.RES_HIM.breakBody, "{him} breaks his ash on your breastplate.", "A hard break on your body by {him}.", "Your breastplate rings under {him}'s lance.");
more(HERALD.RES_HIM.helm, "{him} rings your helm and breaks his lance!", "On your helm! {him} breaks true.", "{him} strikes your head, and the lance flies in pieces.");
more(HERALD.RES_BOTH.miss, "Two lances, and only air between them.", "Both riders strike at the wind.");
more(HERALD.RES_BOTH.attaint, "A touch each, and not a splinter.", "Both touch, and both lances hold.");
more(HERALD.RES_BOTH.breakShield, "Splinters on both shields!", "Two ash lances shivered at once!");
more(HERALD.RES_BOTH.breakBody, "Splinters from both lances, body to body!", "Two breastplates ring, two lances break!");
more(HERALD.RES_BOTH.helm, "Both helms ring, and both lances break!");
more(HERALD.RES_UNHORSE_YOU, "{him} is thrown over his horse's tail by {you}!", "{you} sends {him} to the sand, and the stands rise!", "Down goes {him}! A noble stroke by {you}!", "{him} is out of the saddle, and {you} rides on!");
more(HERALD.RES_UNHORSE_HIM, "{you} is thrown to the sand by {him}!", "Down goes {you}! {him} rides on, victorious.", "{him} sends {you} over his horse's crupper!", "{you} is out of the saddle, and the gallery gasps!");
more(HERALD.RES_UNHORSE_BOTH, "Both knights are on the sand!", "Two saddles empty, and one roar from the stands!");
more(HERALD.SCORE.level, "Level at {n}, and the crowd leans in.", "{n} each. Nothing between them.");
more(HERALD.SCORE.youAhead, "The cheque stands {yourW} to {hisW} for {you}.", "{you} leads, {yourW} to {hisW}, and the gallery knows it.");
more(HERALD.SCORE.himAhead, "The cheque stands {hisW} to {yourW} for {him}.", "{him} leads, {hisW} to {yourW}. {you}, you must answer.");
more(HERALD.SCORE.youTakes, "{you} goes ahead, {yourW} to {hisW}.");
more(HERALD.SCORE.himTakes, "{him} goes ahead, {hisW} to {yourW}.");
more(HERALD.win,
  "Hear it, all {city}! {you} wins the match, {yourScore} to {hisScore}, and carries {arms} home in honour.",
  "The field is {you}'s. {yourScore} to {hisScore}, and {him} yields the day with courtesy.",
  "By the marshal's count and the judges' word: {you}, {yourScore} to {hisScore}. Let the trumpets sound!");
more(HERALD.loss,
  "Hear it, all {city}! {him} wins the match, {hisScore} to {yourScore}, and {hisArms} stands highest today.",
  "The field is {him}'s, {hisScore} to {yourScore}. {you} leaves it with honour, if without the prize.",
  "By the marshal's count and the judges' word: {him}, {hisScore} to {yourScore}. A hard-fought day.");
more(HERALD.draw, "Hear it, all {city}: the match is level, {yourScore} each, and neither {arms} nor {hisArms} may claim the field.");
