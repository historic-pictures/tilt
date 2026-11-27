// channels.js - which voices and which dialogue text are on. One switch per channel; flip one to bring a channel back (the line data files are all still there).
// 2026 decision (owner): "Get rid of any dialogue except the commentator, across the board. And crowd sounds." Only the commentary booth (Master Ambrose Pell and
// Sir Walter Drewe, src/booth.js) speaks aloud; the rest of the old chatter is silent AND hidden. What stays on screen is information, not dialogue (the `ui` group).

/** SPEECH: a robot/recorded voice is spoken for this channel. Only the booth. (Keys are the VOICES entries in main.js; booth keys are 'pell' and 'drewe'.) */
export const SPEECH = { booth: true,
  herald: false,        // Hugh Clement and the opponent's herald
  retinue: false,       // squire, groom, armourer, farrier, pursuivant, the lady
  rival: false,         // his squire's jeers
  host: false,          // the King / lord of the royal box
  master: false,        // the master of arms, the surgeon
  marshal: false,       // the marshal's and judges' spoken calls
  vendors: false };     // the sellers in the stands

/** BOOTH: which of the two commentators speak (voice and subtitles). Owner, 27 Nov: one single voice. Sir Walter's lines stay in src/booth_lines.js; any exchange that has him in it, and any Pell line that names him, is skipped while he is off. */
export const BOOTH = { pell: true, drewe: false };

/** The squire's rare encouragement between courses (src/main.js squireCheer): the only retinue voice that is on. */
export const SQUIRE = { cheer: true, chance: 0.4 };

/** TEXT: a line of dialogue is shown (ticker / floating label / bubble) for this channel. */
export const TEXT = {
  herald: false, retinue: false, host: false, master: false, marshal: false, rival: false, vendors: false, lady: false,
  tickerNarration: false,   // the marshal's/commons' running ticker lines ("You level your lance...")
  crowdNarration: false,    // the single narration line the crowd used to add ("The stands roar.")
  boothSubtitles: true,     // the commentary strip: the one voice, with its subtitles
  speechLabels3d: false };  // the parchment label above a speaker's head

/** UI: essential information, shown as plain UI text and never spoken. */
export const UI = {
  courseNumber: false,      // OFF (27 Nov, one text line at a time): "Course 2 of 5" before each course; the top bar already says COURSE n/N
  rideSignal: true,         // "Ride!" at the marshal's signal
  prompts: true,            // "Put your helm on first (H)", "Wait for the marshal"
  judgesBand: false,        // OFF (owner, 27 Nov: the score is at the top and the hit diagram explains it) - the judges' result band (#royalCap / #ticker.scrollcall: the prize, the judges' marks)
  injury: true,             // the surgeon's yield / unfit prompt that needs a decision
  lessonGoals: true,        // training lesson panel and goals
  callouts: true };         // Combo B callouts: "Lance broken", "Unhorsed!" (own DOM, not part of the voice director)

/** CROWD: sounds stay; the floating shout labels are cut to a few short war cries / name chants, only when the stands are excited. */
export const CROWD = { sound: true, shouts: true, shoutExcite: 0.6, maxShoutLabels: 1 };

/** The old "channel" of a ticker line, from its speaker label (voice.line `who`) and options. Returns a key of TEXT / UI, or 'ui' for lines marked o.ui. */
export function channelOf(o) {
  const w = String(o.who || '').toUpperCase();
  if (o.ui) return { ui: o.ui };
  if (o.cheer) return { cheer: true };
  if (/^THE (JUDGES|SCORER)/.test(w)) return { ui: 'judgesBand' };
  if (/SURGEON/.test(w)) return { text: 'master' };
  if (/MASTER OF ARMS/.test(w)) return { text: 'master' };
  if (/HERALD|HUGH|ANNOUNCER|CLEMENT/.test(w) || o.voice === 'hugh' || o.voice === 'herald') return { text: 'herald' };
  if (/SQUIRE|GROOM|ARMOURER|FARRIER|PURSUIVANT|RETINUE|\u00b7/.test(w) || ['squire', 'groom', 'armourer', 'farrier', 'pursuivant', 'master'].includes(o.voice)) return { text: 'retinue' };
  if (o.voice === 'king') return { text: 'host' };
  if (/LADY|GALLERY/.test(w)) return { text: 'lady' };
  if (/COMMONS/.test(w)) return { text: 'crowdNarration' };
  if (/MARSHAL/.test(w)) return { text: 'marshal' };
  return { text: 'tickerNarration' };
}
/** Is this ticker line shown? Returns { show, speak }. */
export function gate(o) {
  const c = channelOf(o);
  if (c.cheer) return { show: !!SQUIRE.cheer, speak: !!SQUIRE.cheer && !!o.speak };
  if (c.ui) return { show: !!UI[c.ui], speak: false };
  return { show: !!TEXT[c.text], speak: !!(SPEECH[c.text] && o.speak) };
}
