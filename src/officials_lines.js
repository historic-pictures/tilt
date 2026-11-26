// The officers of the lists: the marshal (the signal, the stop), the judges at their table (the marks), the scorer. Short, carrying calls. Plain data, no imports.
// The marshal's signal goes through the main voice (main.js, tier 2, urgent). The judges' and the scorer's calls are spoken from the judges' table and the "Ho!" from the marshal's
// men by src/crowd_voices.js (a label where the man stands). Customs and sources: docs/voice-plan.md section 8.
// FORMAT: strings; {name} = a knight's short name (closed set); every pool that uses {name} has name-free lines too.

export const OFFICIALS = {
  // the marshal sends them (the old cry of the lists: let them go)
  signal: ['Laissez-les aller!', 'Laissez aller!', 'Laissez-les aller! In God\'s name!', 'Let them go!', 'Laissez-les aller! Ride!'],
  // the course is stopped: a man down, a foul, a loose horse. "Ho!" is the cry that stops a combat.
  ho: ['Ho!', 'Ho! Ho!', 'Ho! Hold there!', 'Ho! A man down!', 'Ho! Stop the course!', 'Ho! Catch that horse!'],
  foul: ['Foul! The horse is struck!', 'Ho! A foul stroke!', 'Foul! Mark it!'],
  clear: ['Clear the lists!', 'Squires, out of the lists!', 'Clear the sand, there!'],
  // the judges' table, with the flags: the middle judge speaks for the three
  judge: {
    breakYou: ['A lance broken. Written.', 'Broken, fair and square.', 'A spear broken on the man. It counts.'],
    breakHim: ['Broken, by the other side. Written.', 'A lance broken against. It counts.'],
    bothBreak: ['Broken, both. Both written.', 'Two lances broken. Mark them both.'],
    helm: ['Broken on the helm. The high mark.', 'On the helm. Write it large.'],
    touch: ['A touch. No more.', 'A touch, the lance whole.', 'Attaint. A touch only.'],
    miss: ['No touch.', 'Nothing. No touch.', 'No stroke, no mark.'],
    bothMiss: ['No touch on either side.', 'Nothing to write.'],
    unhorse: ['Borne to the ground. The great mark.', 'Unhorsed. Fair and clean.'],
    tilt: ['The barrier. Marks off.', 'Struck the tilt. A fault.'],
    foul: ['The horse struck. A foul. The prize is at risk.', 'Foul. The red flag.'],
    coronel: ['Coronel to coronel! Points met!'],
    sight: ['In the sight of the helm. Mark it.'],
  },
  // the scorer at the end of the table reads back as he writes
  scorer: ['Written.', 'It is written.', 'On the cheque.', 'Marked.', 'Marked, and marked.'],
  // the score said aloud by the judges at the end of the match
  verdict: ['The judges have it.', 'The cheque is closed.', 'The judges give the prize.', 'The prize is awarded. Let no man dispute it.'],
};
