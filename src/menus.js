import { HORSES, ARMOURS, KNIGHTS, VENUES, PATTERNS, CHARGES, TINCTURES, ovr, bondLevel, BOND_NAMES, LANCES, DIFFICULTY, HISTORIC_ARMS, ARTS, LESSONS,
  ECON, entryFee, purse, RANKS, rankOf, skillPoints, SKILLS, ACHIEVEMENTS, ACH_GROUPS, ACH_RENOWN, HELMS, MODES, RETINUE, CAPARISONS, TRAITS, RETINUE_UP, newMan, fixRetinue, wageOf, trainCost, menFx } from './data.js';
import { drawCrest, drawFace } from './util.js';
import { getAimMode, setAimMode, getAimSpeed, setAimSpeed } from './touch.js';
import { FIELDS, ORDINARIES, CHARGES as CHARGE_ROLL, ERMINE, VAIR, armsParts, setArmsParts, blazonText, tinctureFaults, drawArms, drawCharge, fabricOver, whenHeraldry, heraldryReady } from './heraldry.js';
import { GFX, setPref, PREFS } from './gfx.js';
import { renderGfxSettings } from './settings_gfx.js';
import { mountAccountPanel } from './account_panel.js';
import * as signin from './signin.js';      // the main-menu sign-in chip and the Play Online gate
import { ensurePanelCss } from './panel_css.js';
import { featCount } from './achievements.js';
import { ANNOUNCER } from './drama_lines.js';
import * as career from './career.js';
import { CELEBS, WIN_IDS, LOSE_IDS, favourites, toggleFav, MAX_FAVS, celIcon, initCelUi } from './celebrate.js';
import { tourneyHTML, tourneyAct, stopTourneyWatch } from './tourney_screen.js';
import { BEGIN, VENUES_STORY, OUT_LINES, SEASON_END, fillStory, storyName } from './career_story.js';
import { sfxPack, setSfxPack, SFX_HAS_OLD } from './audio.js';
import * as ranks from './ranks.js';
import { mymusic, isPhone } from './mymusic.js';
import { ytmusic } from './ytmusic.js';
import { safeName } from './online.js';
import { confirmBuy, buyAsk } from './confirm.js';
import { initTooltips, tip, tipAttr, setHelpDefault } from './tooltips.js';
import { gi, icon, coin, coinsTxt, GAME_NAME, WORDMARK_IMAGE } from './icons.js';
import * as store from './store.js';      // what has been bought (the server's word), the store screen, the gates
import { mountDonate } from './donate.js';
import { PAY, EQUAL_GEAR, DISCORD_URL } from './config.js';
import { PACKS, allowedArms, skuOfCharge, ROLL_CHARGES } from './cosmetics.js';
const ownedSkus = () => ['herald', 'rolls', 'patron', 'finishes', 'charter'].filter((k) => store.has(k));      // the packs this account holds (heraldry gating)
import { openUpsell, maybeAuto, exhibitionAllowed } from './upsell.js';      // the "unlock the full game" popup
import { FACES, SKINS, HAIRS, BUILDS, cleanBody } from './body_types.js';
let buyOk = false;   // set for the one re-dispatched click after a purchase is confirmed

const el = (id) => document.getElementById(id);
const stat = (name, v) => EQUAL_GEAR ? '' : `<div class="stat"><span>${name}</span><div class="bar"><div style="width:${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%"></div></div></div>`;
const SAME = EQUAL_GEAR ? '<p class="samegear">Same in the lists as every other — chosen for looks.</p>' : '';
const marks = (n) => coin(n);      // money is shown as a gold coin and a number (the data still counts marks)
/** The purse in words: what you hold, or what you owe. */
export const purseText = (g) => (g || 0) < 0 ? `<span class="debt">In debt ${marks(-g)}</span>` : `<span class="purse" data-tip="Your purse">${marks(g || 0)}</span>`;

/** Your rank and the road to the next: "Rank: Bachelor Knight — 120/240 renown" over a bar. */
export function rankBar(renown) {
  renown = renown || 0; const r = rankOf(renown), here = RANKS[r], next = RANKS[r + 1], f = next ? (renown - here.at) / (next.at - here.at) : 1;
  return `<div class="rankline"><span>Rank: ${here.name} — ${next ? `${renown}/${next.at}` : renown} renown</span><div class="bar"><div style="width:${Math.round(Math.max(0.03, Math.min(1, f)) * 100)}%"></div></div></div>`;
}

// The Discord link: a small round button in the bottom-right corner of the main menu. Hidden when DISCORD_URL (src/config.js) is empty, so there is never a dead link.
const DISCORD_GLYPH = 'M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z';
let discordBtn = null;
function makeDiscordBtn() {
  if (!DISCORD_URL || typeof document === 'undefined') return null;
  const a = document.createElement('a'); a.id = 'discordBtn'; a.href = DISCORD_URL; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Join our Discord'); a.hidden = true;
  a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${DISCORD_GLYPH}"/></svg>`; document.body.appendChild(a); return a;
}
// The default line of each menu's help strip (shown while nothing is under the pointer); [title, text]
const HELP = {
  any: ['', 'Point at a control (or hold a finger on it) to read what it does.'],
  main: ['The lists', 'Point at a button to read what it does. Play Online, a Career, a single Joust or the tiltyard; the shields hold your kit and settings.'],
  welcome: ['Your name and arms', 'Choose a name and paint your shield. You can change all of this later in the Armoury.'],
  settings: ['Settings', 'Difficulty, view, sound, graphics and your account. Point at a setting to read what it does.'],
  stable: ['The Stable', 'Choose or buy a horse and its caparison. Drag the horse to turn it. Stabling is charged at each circuit tourney.'],
  'armoury.helm': ['Helm', 'Choose your helm. Point at a card to see it large; click to buy or wear it. A helm decides what you see.'],
  'armoury.armour': ['Harness', 'Choose your harness and its finish. Point at a card to see it large; click to buy or wear it.'],
  'armoury.lance': ['Lance', 'Choose your lance. You pay for every lance you break.'],
  'armoury.men': ['Retinue', 'Hire a man to serve you. Each draws his wage at every circuit tourney.'],
  'armoury.knight': ['Your knight', 'Your name, celebrations and arms. Point at a celebration to see your knight perform it.'],
  circuit: ['The Career', 'A season of knockout tournaments across Europe. Win purses and honours.'],
  exhibition: ['A single joust', 'Choose the rules, the lists and your opponent. No entry fee and no ransom.'],
  online: ['Play Online', 'Quick match, ranked ladder, public rooms or a private room for a friend.'],
};
export function initMenus(api) {
  if (!discordBtn) discordBtn = makeDiscordBtn();
  const root = el('screen');
  initTooltips();
  ['joust-miniature', 'welcome-banner-800', 'icons/emblem-128', ...['armoury', 'stable', 'renown', 'settings'].map((n) => `icons/${n}-128`), ...['career', 'joust', 'learn', 'coins'].map((n) => `icons/${n}-64`)].forEach((n) => { new Image().src = `assets/ui/${n}.webp`; });      // warm the cache so the title-page picture is there when the menu is drawn
  document.body.classList.toggle('lowui', GFX.tier === 'low' || GFX.pref === 'low');      // the painted frame is a picture; low tier gets the same frame drawn in CSS
  let exVenue = 0, exOpp = KNIGHTS[0].id, exMode = 'planken', exCourses = 5, dismissArm = null;
  const EX_COURSES = [3, 5, 7, 10, 15, 20], CIRC_COURSES = [3, 5, 7, 10, 15];
  /** The number of courses a rule set fixes (0 = you choose): Castile four by its statutes, Judged Tilt six, the Bridge three a bout. */
  // the circuit's rules: chosen on the circuit screen (Danilo, 15 Nov), Standard by default; Keep the Bridge is its own kind of match, not a circuit bout
  const circMode = (p) => MODES[p.circMode] && !MODES[p.circMode].bridge ? p.circMode : 'planken';
  const fixedCourses = (id) => { const m = MODES[id]; return m.fixedCourses || (m.noExtra && !m.pickCourses ? 4 : 0); };
  let stableCap = null;      // the caparison shown on the Stable's horse (previewed; yours is profile.caparison)
  const crests = () => root.querySelectorAll('canvas[data-arms]').forEach(c => drawCrest(c, JSON.parse(c.dataset.arms)));
  const crest = (arms, w = 40, h = 48) => `<canvas width="${w}" height="${h}" data-arms='${JSON.stringify(arms)}'></canvas>`;
  // every screen is a scroll: the skin, then the page that is written on (and scrolls)
  const ORN = '<svg class="orn" aria-hidden="true"><use class="u-l" href="#orn" width="100%" height="100%"/><use class="u-s" href="#orn-s" width="100%" height="100%"/></svg>';      // the penwork fleur-de-lis rule under every page heading (one shared <symbol> in index.html)
  const scroll = (cls, html) => `<div class="${cls} scroll"><i class="paper"></i><div class="page">${html.replace(/<div class="(top|stop)"([^>]*)>/g, (m) => m + ORN)}</div><div class="helpstrip" aria-live="polite"></div></div>`;

  /** "Your own music": songs from the player's own computer, kept in this browser only (src/mymusic.js). */
  const mmMsg = { text: '' };
  const mmNow = () => (mymusic.now && mymusic.now.name ? `Now playing: ${esc(mymusic.now.name)}` : (mymusic.enabled && mymusic.tracks.length ? 'Now playing: (starts with the game)' : ''));
  const ytTitles = {};     // id -> title, filled in while a video plays
  function myMusicBlock() {
    const tr = mymusic.tracks, src = mymusic.source, yt = ytmusic.ids;
    const chip = (k, t) => `<span class="chip ${src === k ? 'sel' : ''}" data-mm="src" data-v="${k}">${t}</span>`;
    const files = `<div class="toggles"><label class="chip">Add songs<input type="file" id="mmFile" accept="audio/*" multiple hidden></label>${tr.length ? `<span class="chip" data-mm="next">Next ▸</span>` : ''}</div>
      ${tr.length ? `<div class="mmlist">${tr.map(t => `<div class="mmrow"><span>${esc(t.name)}</span><b data-mm="rm" data-id="${t.id}" aria-label="Remove">✕</b></div>`).join('')}</div>` : ''}
      <div class="mmnow" id="mmNow">${mmNow()}</div><div class="mmnote">Your songs stay in this browser only; they're not uploaded or shared.</div>`;
    const ytp = `<div class="mmlist">${yt.map(id => `<div class="mmrow"><span>${esc(ytTitles[id] || (ytmusic.DEFAULTS[id] || 'youtu.be/' + id))}</span><b data-mm="ytrm" data-id="${id}" aria-label="Remove">✕</b></div>`).join('') || '<div class="mmrow"><span>(empty)</span></div>'}</div>
      <div class="mmadd"><input id="mmLink" placeholder="Paste a YouTube link" autocomplete="off" spellcheck="false"><span class="chip" data-mm="ytadd">Add link</span><span class="chip" data-mm="next">Next ▸</span></div>
      <div class="mmnote">Played by YouTube's own player, shown in the corner. Nothing is downloaded.</div>`;
    return `<div class="mymusic"><div class="toggles"><span class="lbl">Music source:</span>${chip('game', 'Game music')}${chip('files', 'My files')}${isPhone ? `<span class="chip off" data-tip="YouTube music is desktop only" style="opacity:.4;cursor:default">YouTube</span><span class="mmnote">desktop only</span>` : chip('yt', 'YouTube')}</div>
      ${src === 'files' ? files : src === 'yt' ? ytp : ''}<div class="mmmsg" id="mmMsg">${esc(mmMsg.text)}</div></div>`;
  }
  mymusic.list().then(() => { if (root.dataset.name === 'settings' && root.classList.contains('on')) show('settings'); });
  mymusic.on((k) => {
    if (k === 'now') { const n = el('mmNow'); if (n) n.textContent = mmNow(); }
    else if (root.dataset.name === 'settings' && root.classList.contains('on')) show('settings');
  });
  ytmusic.on((k) => {
    if (k === 'now' && ytmusic.title && ytmusic.curId) ytTitles[ytmusic.curId] = ytmusic.title;
    if ((k === 'list' || k === 'now') && root.dataset.name === 'settings' && root.classList.contains('on') && !(document.activeElement && document.activeElement.id === 'mmLink')) show('settings');
  });
  root.addEventListener('keydown', (e) => { if (e.target.id === 'mmLink' && e.key === 'Enter') { const t = root.querySelector('[data-mm="ytadd"]'); if (t) t.click(); } });
  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'mmFile') return;
    const files = Array.from(e.target.files || []); e.target.value = '';
    const r = await mymusic.add(files);
    mmMsg.text = r.messages.join(' ') || (r.added ? '' : 'No songs added.');
    if (!r.added) { const m = el('mmMsg'); if (m) m.textContent = mmMsg.text; }
    else { show('settings'); if (api.musicMine) api.musicMine(); }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-mm]'); if (!t) return;
    api.ui('click'); mmMsg.text = '';
    if (t.dataset.mm === 'src') { mymusic.setSource(t.dataset.v); if (api.musicMine) api.musicMine(); }
    else if (t.dataset.mm === 'ytadd') { const i = el('mmLink'), r = ytmusic.add(i ? i.value : ''); mmMsg.text = r.ok ? '' : r.msg; if (!r.ok) { const m = el('mmMsg'); if (m) m.textContent = mmMsg.text; } }
    else if (t.dataset.mm === 'ytrm') ytmusic.remove(t.dataset.id)
    else if (t.dataset.mm === 'next') { if (api.musicNext) api.musicNext(); }
    else if (t.dataset.mm === 'rm') { await mymusic.remove(t.dataset.id); if (api.musicMine) api.musicMine(); }
  });

  /** The title: the painted wordmark, with the name as lettering behind it (shown on the low tier, or if the picture fails). */
  /** The title: the painted wordmark when there is one (WORDMARK_IMAGE in icons.js), otherwise the name as lettering in mixed case. */
  const title = () => WORDMARK_IMAGE
    ? `<h1 class="wmark" aria-label="${GAME_NAME}"><img class="wordmark" src="${WORDMARK_IMAGE}" alt="${GAME_NAME}" draggable="false" onerror="this.style.display='none';this.nextSibling.style.display='block'"><span class="wm-text" style="display:none">${GAME_NAME}</span></h1>`
    : `<h1 class="wmark txt" aria-label="${GAME_NAME}"><img class="emblem" src="assets/ui/icons/emblem-128.webp" srcset="assets/ui/icons/emblem-128.webp 1x, assets/ui/icons/emblem-256.webp 2x" alt="" draggable="false" onerror="this.style.display='none'"><span class="wm-text">${GAME_NAME}</span></h1>`;
  function main() {
    const p = api.profile, CS = career.ensureCareer(p), pts = skillPoints(p), rank = RANKS[rankOf(p.renown)], started = CS.v > 0 || (CS.t && (CS.t.cur > 0 || CS.t.done)) || CS.log.length > 0, nh = (p.honours || []).length;
    const learn = (p.lesson || 0) >= LESSONS.length ? 'Practise' : (p.lesson || 0) > 0 ? 'Training' : 'Learn';
    // the small menu: four shields. Feats, "How to joust" and the account live one step in (Renown, Learn, Settings).
    const shield = (go, label, glyph, badge, t) => `<button class="shieldbtn" data-go="${go}" ${t}><span class="shield pic-shield">${glyph}${badge ? `<em>${badge}</em>` : ''}</span><b>${label}</b></button>`;
    root.innerHTML = scroll('menu main', `
      <div class="mini"><img src="assets/ui/joust-miniature.webp" alt="" draggable="false" onerror="if(!this.dataset.r){this.dataset.r=1;this.src=this.src.split('?')[0]+'?r='+Date.now()}else{this.style.visibility='hidden'}"></div>
      ${title()}
      <div class="mbtns">
        <button class="plaque big" data-go="online" ${tipAttr('Play Online', 'Quick match, ranked ladder, public rooms|or a private room for a friend.')}>Play Online${tip('Play Online', 'Quick match, ranked ladder, public rooms|or a private room for a friend.', 'tonly')}</button>
        <div class="trio">
          <button class="plaque blue" data-go="circuit" ${tipAttr('The Career', 'A season of knockout tournaments across Europe.|Win purses and honours.')}>${CS.done ? 'Season Run' : started ? 'Career' : 'Begin Career'}</button>
          <button class="plaque blue" data-go="exhibition" ${tipAttr('A single joust', 'Choose the rules, the lists and your opponent.')}>Joust</button>
          <button class="plaque blue" data-act="practice" ${tipAttr('The tiltyard', 'Learn to ride, couch the lance and strike.|Nothing is at stake.')}>${learn}</button>
        </div>
        <div class="shields">
          ${shield('armoury', 'Armoury', icon('armoury', 128), '', tipAttr('Armoury', 'Helm, harness, lance, retinue and your arms. (Horses are in the Stable.)'))}
          ${shield('stable', 'Stable', icon('stable', 128), '', tipAttr('The Stable', 'Choose or buy a horse and its caparison.'))}
          ${shield('skills', 'Renown', icon('renown', 128), pts > 0 ? pts : '', tipAttr('Renown, skills and feats', pts > 0 ? `You have ${pts} skill${pts > 1 ? 's' : ''} to learn.` : 'Every joust adds to your name.|Ranks teach skills.'))}
          ${shield('settings', 'Settings', icon('settings', 128), '', tipAttr('Settings', 'Difficulty, view, sound, graphics and your account.'))}
        </div>
      </div>
      <div class="standing"><span class="rankb" ${tipAttr('Your rank', `${rank.name}${nh ? `|${nh} honour${nh > 1 ? 's' : ''}` : ''}`)}><i class="shield mini"><b>${rankOf(p.renown) + 1}</b></i>${rank.name}${store.badges().includes('patron') ? ' · Grand Patron' : store.badges().includes('donor') ? ' · Patron of the Lists' : ''}</span>${PAY.live ? `<span class="chip" data-go="store" ${tipAttr('The Store', "The Knight's Charter and the cosmetic packs.")}>Store</span>` : ''}<span>${purseText(p.gold)}</span></div>`);
    mountDonate(root.querySelector('.menu .page'), { ui: api.ui });      // the little Support coin button, top right (src/donate.js)
    signin.mountChip(root.querySelector('.menu .page'), { show });      // the optional sign-in chip, top left (src/signin.js)
  }

  /** Settings: everything that used to be chips on the main screen, in one place. */
  function settings() {
    const p = api.profile, vol = api.musicVol ? api.musicVol() : 60, mOff = !!(api.musicOff && api.musicOff()), voices = !(api.voicesOn && !api.voicesOn());
    const comm = !(api.commentaryOn && !api.commentaryOn()), chat = !(api.chatterOn && !api.chatterOn());
    const opt = (on, act, label, extra = '', title = '') => `<span class="chip ${on ? 'sel' : ''}" data-act="${act}" ${extra} ${title ? `data-tip="${title}"` : ''}>${label}</span>`;
    const row = (name, ctl, t) => `<div class="srow"><span class="slabel">${name}${t ? tip(name, t) : ''}</span><span class="sctl">${ctl}</span></div>`;
    const signed = api.account && api.account.signedIn();
    // Each .sect below is a section of the page. Sections marked data-slot are filled by their own modules (src/settings_gfx.js for graphics,
    // src/account_panel.js for the account); they take their look from .sect (headings, .srow rows, .chip options, .btn buttons, inputs).
    root.innerHTML = scroll('menu settings', `
      <div class="stop"><h3>Settings</h3><button class="btn primary" data-go="main">Done</button></div>
      <div class="sgrid">
        <section class="sect"><h5>Play</h5>
          ${row('Difficulty', DIFFICULTY.map((d, i) => opt((p.difficulty ?? 0) === i, 'diff', d.name, `data-v="${i}"`)).join(''), 'Squire is the easy ride: the lance comes down quickly and helps your aim, the arm tires slowly, and the horse stays calm.|Knight is how the lists used to feel.|Champion is the full, realistic ride: a heavy lance, a wandering point, a sharp opponent.' + (overBack ? '|Applies from the next match.' : ''))}
          ${row('View', opt(!p.firstPerson, 'view', 'Third person', 'data-v="0"') + opt(!!p.firstPerson, 'view', 'First person', 'data-v="1"'), 'Third person watches over your shoulder.|First person looks through the helm.')}
          ${row('After a pass', opt(p.autoRide !== false, 'autoride', 'Ride back for me', 'data-v="1"') + opt(p.autoRide === false, 'autoride', 'By hand', 'data-v="0"'), 'The horse can take you back to your mark.|By hand: W/S set the gait, A/D steer.')}
          ${row('Replays', [['short', 'Short'], ['standard', 'Standard'], ['full', 'Full'], ['off', 'Off']].map(([v, l]) => opt((api.replaysMode ? api.replaysMode() : 'standard') === v, 'replays', l, `data-v="${v}"`)).join(''), 'After a hit the camera replays the strike.|Short: one angle. Standard: two angles, one from each knight. Full: four passes. Off: none.|Hold Space to skip.')}
        </section>
        <section class="sect"><h5>Sound</h5>
          ${row('Commentary', opt(comm, 'commentary', 'On', 'data-v="1"') + opt(!comm, 'commentary', 'Off', 'data-v="0"'), 'Master Pell and Sir Walter in the booth: the one voice in the game, with small subtitles.')}
          ${row('Crowd', opt(chat, 'chatter', 'On', 'data-v="1"') + opt(!chat, 'chatter', 'Off', 'data-v="0"'), 'Cheers, groans, applause and the odd war cry from the stands.')}
          ${row('Music', opt(!mOff, 'musicon', 'On', 'data-v="1"') + opt(mOff, 'musicon', 'Off', 'data-v="0"'), 'The note button in the corner does the same.|It silences the music only: the commentary, crowd and effects stay.')}
          ${row('Volume', `<label class="vol"><input type="range" id="musicVol" min="0" max="100" step="5" value="${vol}"> <span id="musicPct">${vol}%</span></label>`)}
          ${SFX_HAS_OLD ? row('Sound pack', opt(sfxPack() === 'new', 'sfxpack', 'New', 'data-v="new"') + opt(sfxPack() !== 'new', 'sfxpack', 'Old', 'data-v="old"'), 'Changing the pack reloads the game.') : ''}
        </section>
      </div>
      <div class="sgrid">
      <section class="sect" data-slot="graphics"><div id="gfxHost"></div></section>
      <section class="sect" data-slot="account"><h5>Account</h5>
        <div class="srow"><span class="slabel">${signed ? esc(api.account.info().name) : 'Guest'}${tip('Account', 'A guest plays everything offline.|An account keeps your purse on the server and lets you play ranked.')}</span><span class="sctl"><span class="chip" data-go="account">${signed ? 'Your account' : 'Sign in'}</span></span></div>
      </section>
      </div>
      <div class="sgrid">
      <section class="sect"><h5>Music source</h5>${myMusicBlock()}</section>
      ${api.touch ? `<section class="sect"><h5>Controls</h5>
        ${row('Aim with', opt(getAimMode() === 'joy', 'aimmode', 'Joystick', 'data-v="joy"') + opt(getAimMode() === 'drag', 'aimmode', 'Drag', 'data-v="drag"'), 'Joystick: hold the lower left of the screen and slide; the stick steers the lance so your thumb stays off the target.|Drag: slide a finger anywhere to move the aim; tap to jump it toward that spot.')}
        ${row('Aim speed', ['slow', 'normal', 'fast'].map((v) => opt(getAimSpeed() === v, 'aimspeed', v[0].toUpperCase() + v.slice(1), `data-v="${v}"`)).join(''), 'How fast the stick turns the lance.')}
      </section>` : ''}
      <section class="sect"><h5>Help</h5>
        <div class="srow"><span class="slabel">The art of the joust</span><span class="sctl"><span class="chip" data-go="how">How to joust</span>${api.touch ? '<span class="chip" data-act="fullscreen">Full screen</span>' : ''}</span></div>
      </section>
      </div>`);
    ensurePanelCss(); renderGfxSettings(el('gfxHost'), { profile: p, saveProfile: api.saveProfile });      // src/settings_gfx.js fills the Graphics slot
  }

  /** A name typed by a player: no markup, at most 22 characters, never empty. */
  const cleanName = (v) => (v || '').replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22) || 'Sir Nameless';
  /**
   * The Body section (welcome screen and Armoury): sex, build, face, skin and hair. Plain markup: .row, .chip, .select, .sw.
   * It is looks only (src/body_types.js): the same seat, reach and hit volumes for every body.
   */
  const BUILD_NAMES = { skinny: 'Lean', medium: 'Medium', heavy: 'Heavy' };
  const bodyBlock = (p) => {
    const b = p.body = cleanBody(p.body), chip = (k, v, t) => `<span class="chip ${b[k] === v ? 'sel' : ''}" data-body="${k}|${v}">${t}</span>`;
    const sws = (k, list) => list.map((c, i) => `<div class="sw ${b[k] === i ? 'sel' : ''}" data-tip="${c.name}" style="background:${c.hex}" data-body="${k}|${i}"></div>`).join('');
    return `<section class="body"><h5>Your Body <small>how you look, helm on or off; it changes nothing in the lists</small></h5>
      <div class="arms-row body-row"><canvas class="pv bodypv" data-pv="body:me" width="300" height="380" style="width:150px;height:190px"></canvas><div>
        <div class="row swatches"><span class="lbl">Build</span>${BUILDS.map(x => chip('build', x, BUILD_NAMES[x])).join('')}</div>
        <div class="row swatches"><span class="lbl">Face</span><select class="select" id="bodyFace">${FACES.map((f, i) => (f.sex === b.sex ? `<option value="${i}" ${b.face === i ? 'selected' : ''}>${f.name}</option>` : '')).join('')}</select></div>
        <div class="row swatches"><span class="lbl">Hair</span>${sws('hair', HAIRS)}</div>
      </div></div></section>`;
  };
  root.addEventListener('change', (e) => { if (e.target.id === 'bodyFace') { const p = api.profile; p.body = cleanBody(Object.assign({}, p.body, { face: +e.target.value })); api.ui('click'); api.setBody(p.body); } });
  /** First visit: take your name and your colours before anything else. */
  let wDraft = null;
  const NOFILL = 'autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" data-lpignore="true" data-form-type="other"';
  function welcome() {
    const p = api.profile, a = p.arms; if (wDraft === null) wDraft = '';
    const sw = (key) => `<div class="swatches"><span class="lbl">${{ c1: 'Field', c2: 'Division' }[key]}</span>${TINCTURES.map(t => `<div class="sw ${a[key] === t[1] ? 'sel' : ''}" data-tip="${t[0]}" style="background:${t[1]}" data-col="${key}|${t[1]}"></div>`).join('')}</div>`;
    root.innerHTML = scroll('menu welcome', `
      <div class="mini"><img src="assets/ui/welcome-banner-1600.webp" srcset="assets/ui/welcome-banner-800.webp 800w, assets/ui/welcome-banner-1600.webp 1600w" sizes="(max-width: 600px) 100vw, 420px" alt="" draggable="false" onerror="if(!this.dataset.r){this.dataset.r=1;this.src=this.src.split('?')[0]+'?r='+Date.now()}else{this.style.visibility='hidden'}"></div>
      ${title()}
      <h5>Your Name ${tip('Your name and colours', 'The herald cries your name when you ride in.|You can change all of this later in the Armoury.')}</h5><input class="name" id="wName" name="knight-title" maxlength="22" placeholder="Sir Roland of Tyre" value="${wDraft.replace(/"/g, '')}" ${NOFILL}>
      <div class="arms-row"><canvas id="wCrest" width="150" height="178"></canvas><div>
        ${sw('c1')}${sw('c2')}
        <div class="swatches"><span class="lbl">Ordinary</span>${PATTERNS.map(x => `<div class="chip ${a.pattern === x ? 'sel' : ''}" data-pat="${x}">${x}</div>`).join('')}</div>
        </div></div>
      <!-- slot: Body (the Body section: sex, build, face; height is not a choice) -->
      ${bodyBlock(p)}
      <button class="plaque big" data-act="welcome">Enter the Lists${tip('Your name and colours', 'The herald cries your name when you ride in.|You can change all of this later in the Armoury.', 'tonly')}</button>`);
    drawCrest(el('wCrest'), a);
    const inp = el('wName'); inp.addEventListener('input', () => { wDraft = inp.value; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="welcome"]').click(); } });
    if (!api.touch) setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 50);      // (a phone's keyboard would cover the colours at once: it opens when the field is tapped)
  }

  // ---- the career: a season of knockout tournaments (src/career.js; the story text is in src/career_story.js)
  const fullName = (id, p) => id === 'you' ? p.name : (career.knightById(id) || { name: '?' }).name;
  const shortName = (id, p) => id === 'you' ? (p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name) : (career.knightById(id) || { short: '?' }).short;
  /** Hugh's header: his words and the buttons. */
  const hughBox = (title, html, buttons) => `<div class="top"><div><h3>${title}</h3>
      <div class="hugh"><canvas class="face" width="72" height="84" data-face="${ANNOUNCER.name}|${ANNOUNCER.color}|${ANNOUNCER.cap}"></canvas><div><h6>${ANNOUNCER.name}, ${ANNOUNCER.title}, says:</h6><p>${html}</p></div></div></div>
      <div class="actions">${buttons}</div></div>`;
  const honoursBlock = (p) => (p.honours || []).length ? `<h5>Honours</h5><div class="honours">${p.honours.map(h => `<span class="honour"><b>${h.name}</b> <i>${h.year}</i></span>`).join('')}</div>` : '';
  const roadBlock = (p, S) => `<h5>The Season <small>${S.no > 1 ? `season ${S.no}` : 'the road across Europe'}</small></h5><div class="venues">${VENUES.map((v, i) => {
    const r = S.log.find(x => x.v === i), now = !S.done && i === S.v;
    const res = r ? (r.res || (r.champion ? 'Champion' : `Out in the ${career.roundName(r.rounds, r.reached).toLowerCase()}`)) : store.locked.event(i) ? "Knight's Charter" : now ? 'the lists await' : 'ahead';
    const lk = !r && store.locked.event(i);
    return `<div class="venue ${now ? 'now' : r ? 'done' : ''} ${lk ? 'locked' : ''}" ${lk ? 'data-lock="charter" data-why="event:${i}" data-tip="Open with the Knight&#39;s Charter"' : ''}><b>${v.name}</b><i>${v.city}${v.country ? ', ' + v.country : ''} · ${v.year}</i><div class="r">${res}</div>${r ? '' : `<div class="fee">${career.SIZES[i]} knights · purse ${coin(purse(i, 'win', true))}</div>`}</div>`;
  }).join('')}</div>`;
  // a short tip from a long rule text: the place and date, then the first sentence or two
  const sentences = (t, n = 1) => (String(t || '').match(/[^.!?]+[.!?]+(\s|$)/g) || [String(t || '')]).slice(0, n).join('').trim();
  const modeTip = (m) => `data-tip-title="${m.name}" data-tip="${[m.sub, sentences(m.blurb, 2)].filter(Boolean).join('|').replace(/"/g, '&quot;')}"`;
  const openMore = {};      // which "more" drawers are open, kept across redraws of the screen
  root.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.more) openMore[d.dataset.more] = d.open; }, true);
  const more = (key, summary, body) => `<details class="more" data-more="${key}" ${openMore[key] ? 'open' : ''}><summary>${summary}</summary><div class="morebody">${body}</div></details>`;
  const rulesBlock = (p) => more('circrules', `Rules: <b>${MODES[circMode(p)].name}</b>, ${fixedCourses(circMode(p)) || p.courses || 5} courses ${tip('Rules and courses', `${MODES[circMode(p)].sub}.|${fixedCourses(circMode(p)) ? 'The rules fix the number of courses.' : MODES[circMode(p)].firstBreak ? 'The tilt is void if no lance breaks.' : 'Level scores run up to two extra courses.'}`)}`,
    `<div class="swatches circrules"><span class="lbl">Rules</span>${Object.values(MODES).filter(m => !m.bridge).map(m => `<div class="chip ${m.id === circMode(p) ? 'sel' : ''}" data-cm="${m.id}" ${modeTip(m)}>${m.name}</div>`).join('')}<i class="brk"></i><span class="lbl">Courses</span>${fixedCourses(circMode(p)) ? `<div class="chip sel">${fixedCourses(circMode(p))}</div>` : CIRC_COURSES.map(n => `<div class="chip ${n === (p.courses || 5) ? 'sel' : ''}" data-cc="${n}">${n}</div>`).join('')}</div>`);
  function circuit() {
    const p = api.profile, S = career.ensureCareer(p);
    if (S.done) return seasonEnd(p, S);
    const t = career.ensureTournament(p), V = VENUES[t.v], host = KNIGHTS.find(k => k.id === V.host), name = storyName(p);
    if (store.locked.event(t.v)) {      // the first event is free; the rest of the calendar comes with the Knight's Charter (src/store.js)
      api.setVenue(0);
      root.innerHTML = scroll('sheet', hughBox(`On to ${V.name}`, `The road goes on to ${V.name}, ${V.city}, and on across Europe. The rest of the season's calendar is open to holders of the <b>Knight's Charter</b>: every tournament event, every venue, and the heraldry editor. One payment, and it is yours on every browser you sign in to.`,
        `<button class="btn" data-go="main">Back</button><button class="btn primary btn-primary" data-lock="charter" data-why="event:${t.v}">Unlock the full game</button>`) + honoursBlock(p) + roadBlock(p, S));
      faces(); maybeAuto(t, { show }); return;
    }
    const vars = { name, venue: V.name, city: V.city, host: host.name, hostShort: host.short, next: (VENUES[t.v + 1] || {}).name || '', nextCity: (VENUES[t.v + 1] || {}).city || '' };
    const ST = VENUES_STORY[V.id] || VENUES_STORY.smithfield;
    api.setVenue(t.v);
    if (t.phase === 'arrive') {
      const first = S.no === 1 && t.v === 0 && !S.log.length && !(p.honours || []).length;
      const cards = (first ? [['The Road', BEGIN]] : []).concat([[`Arriving at ${V.name}`, ST.arrive], ['What Is At Stake', ST.stakes], ['The Man To Beat', ST.rival]]);
      const ci = Math.min(t.card || 0, cards.length - 1), card = cards[ci], lastCard = ci === cards.length - 1;
      root.innerHTML = scroll('sheet', `<div class="top"><div><h3>${V.name}</h3><p>${V.city}${V.country ? ', ' + V.country : ''}, ${V.year}. ${S.migrated && first ? 'Your old league table is retired: the career is now a season of tournaments.' : ''}</p></div>
        <div class="actions"><button class="btn" data-go="main">Back</button><button class="btn" data-act="stskip">Skip</button><button class="btn primary" data-act="stnext">${lastCard ? 'See the Draw' : 'Continue'}</button></div></div>
        <div class="story"><h5>${card[0]} <small>${ci + 1} of ${cards.length}</small></h5>${fillStory(card[1], vars).map(l => `<p>${l}</p>`).join('')}</div>${honoursBlock(p)}`);
      return;
    }
    // the tournament event (src/tournament.js): the herald's roll, days, prizes (src/tourney_screen.js)
    root.innerHTML = scroll('sheet', tourneyHTML({ p, S, t, V, name, nm: (id) => esc(shortName(id, p)), full: (id) => esc(fullName(id, p)), hugh: hughBox, rules: `${rulesBlock(p)}`, honours: honoursBlock(p), road: roadBlock(p, S), purseText,
      vars, fill: fillStory, ST }));
    faces();
    if (t.done) maybeAuto(t, { show });      // the free tournament is over: the celebration and the offer, once per session (src/upsell.js)
  }
  function seasonEnd(p, S) {
    const won = (p.honours || []).filter(h => h.season === S.no), n = won.length, lines = fillStory(n === VENUES.length ? SEASON_END.all : n ? SEASON_END.some : SEASON_END.none, { n, s: n === 1 ? '' : 's' });
    root.innerHTML = scroll('sheet', hughBox('The Season Is Run', lines.join(' '), `<button class="btn" data-go="main">Back</button><button class="btn primary" data-act="newseason">Begin a New Season</button>`)
      + `<div class="story"><h5>The Season</h5>${S.log.map(r => `<p><b>${VENUES[r.v].name}</b>: ${r.champion ? 'Champion.' : `${r.res || 'out'}; the Prize went to ${fullName(r.winner, p)}.`}</p>`).join('')}</div>${honoursBlock(p)}${roadBlock(p, S)}`);
    faces();
  }

  function exhibition() {
    if (store.locked.venue(exVenue)) exVenue = 0;
    const M = MODES[exMode], oneOpp = (k) => `${k.name}|${HORSES[k.horse].name}, ${HELMS[ARMOURS[k.armour].helm].name}, ${ARMOURS[k.armour].name}|Aim ${Math.round(k.skill * 100)}  Seat ${Math.round(k.seat * 100)}  Drive ${Math.round(k.drive * 100)}`;
    const cw = fixedCourses(exMode) ? (M.bridge ? 'Three against each challenger' : M.fixedCourses ? 'Fixed by the rules of the joust' : 'Fixed at four by the statutes') : M.firstBreak ? 'The joust is void if no lance breaks in this many.' : 'Level scores run up to two extra courses.';
    root.innerHTML = scroll('sheet exh', `<div class="top"><div><h3>Joust</h3></div>
      <div class="actions"><button class="btn" data-go="main">Back</button><button class="btn primary" data-act="exride">Ride</button></div></div>
      <h5>The Joust ${tip('A single joust', `No entry fee and no ransom.|The purse is ${coinsTxt(purse(0, 'win', false))}.`)}</h5>
      <div class="picks">${Object.values(MODES).map(m => `<div class="pick ${m.id === exMode ? 'sel' : ''}" data-exm="${m.id}" ${modeTip(m)}><b>${m.name}</b></div>`).join('')}</div>
      <h5>Courses ${tip('Courses', cw)}</h5><div class="swatches">${fixedCourses(exMode) ? `<div class="chip sel">${fixedCourses(exMode)}</div>` : EX_COURSES.map(n => `<div class="chip ${n === exCourses ? 'sel' : ''}" data-exc="${n}">${n}</div>`).join('')}</div>
      <h5>The Lists</h5><div class="picks">${VENUES.map((v, i) => store.locked.venue(i) ? `<div class="pick locked" data-lock="charter" data-why="venue:${i}" data-tip="Every venue comes with the Knight's Charter"><b>${v.name}</b><em>${v.year}</em></div>` : `<div class="pick ${i === exVenue ? 'sel' : ''}" data-exv="${i}" data-tip-title="${v.name}, ${v.year}" data-tip="${(v.city + (v.country ? ', ' + v.country : '') + '|' + sentences(v.blurb, 2)).replace(/"/g, '&quot;')}"><b>${v.name}</b><em>${v.year}</em></div>`).join('')}</div>
      <h5>Your Opponent ${MODES[exMode].bridge ? tip('Keep the bridge', 'One of the three challengers, in order of skill.|The rest are drawn.') : ''}</h5><div class="picks knights">${KNIGHTS.map(k => `<div class="pick ${k.id === exOpp ? 'sel' : ''}" data-exo="${k.id}" data-tip-title="${k.name}" data-tip="${oneOpp(k).split('|').slice(1).join('|').replace(/"/g, '&quot;')}">${crest(k.arms, 30, 36)}<span class="ovr">${ovr(k)}</span><b>${k.short}</b><em>${k.land}</em></div>`).join('')}</div>`);
    crests(); api.setVenue(exVenue);
  }

  // ---- Joust a friend: make a room (the host picks the lists, the rules and the courses) or join one by its code. The state lives in main.js (api.online.lobby).
  let joinDraft = '';
  function online() {
    const O = api.online, L = O.lobby, ph = L.phase, host = ph === 'hostWait' || ph === 'hostReady', room = L.room, fr = L.friend;
    const modes = O.modeIds(), fixed = fixedCourses(room.m), V = VENUES[room.v];
    const chips = () => `<h5>The Lists</h5><div class="swatches">${VENUES.map((v, i) => `<span class="chip ${i === room.v ? 'sel' : ''}" data-onv="${i}">${v.name}</span>`).join('')}</div>
      <h5>Rules <small>${MODES[room.m].sub}</small></h5><div class="swatches">${modes.map(id => `<span class="chip ${id === room.m ? 'sel' : ''}" data-onm="${id}">${MODES[id].name}</span>`).join('')}</div>
      <h5>Courses${fixed ? ' <small>fixed by the rules</small>' : ''}</h5><div class="swatches">${fixed ? `<span class="chip sel">${fixed}</span>` : EX_COURSES.map(n => `<span class="chip ${n === room.c ? 'sel' : ''}" data-onc="${n}">${n}</span>`).join('')}</div>`;
    const summary = () => `<p class="dimtxt">${V.name}, ${V.city}${V.country ? ', ' + V.country : ''} · ${MODES[room.m].name} · ${fixed || room.c} courses &nbsp;(the host chooses)</p>`;
    const friendRow = () => fr ? `<div class="friend">${crest(fr.arms, 30, 36)}<span><b>${fr.name}</b> <i>${fr.rank ? '· ' + fr.rank.text + ' · ' + fr.rank.h2h : fr.land ? '· ' + fr.land : ''}</i></span></div>` : '';
    let head = '', actions = '<button class="btn" data-on="back">Back</button>' + (ph === 'choose' ? '<button class="btn" data-on="ranks">Rankings</button>' : ''), body = '';
    const rows = () => {
      const rs = L.rooms.slice(0, 5), rl = L.relays || {};
      if (!rs.length) return `<p class="wait">${rl.failed ? 'Could not reach the lobby. Check your connection, or use Joust a friend.' : rl.open ? 'No open rooms yet: create one or try Quick match.' : 'Connecting to the lobby…'}</p>`;
      return `<div class="rooms">${rs.map(r => `<div class="rrow"><b>${r.name}</b><span>${VENUES[r.v].name}</span><span>${MODES[r.m].name}</span><span>${r.c} courses</span><button class="btn primary" data-on="joinlist" data-code="${r.code}">Join</button></div>`).join('')}</div>${L.rooms.length > 5 ? `<p class="dimtxt">and ${L.rooms.length - 5} more</p>` : ''}`;
    };
    // How many knights are in the lists (heard over the same relays as the room list, src/lobby.js): a real number or the quiet line, never a made-up one.
    const presenceLine = (btn) => {
      const P = L.pres; if (!P || !P.listening) return '';
      if (P.others > 0 && P.open) return `<p class="presence"><b>${P.knights} ${P.knights === 1 ? 'knight' : 'knights'}</b> in the lists${P.jousts > 0 ? ` &nbsp;·&nbsp; ${P.jousts} ${P.jousts === 1 ? 'joust' : 'jousts'} under way` : ''}</p>`;
      return `<p class="presence quiet">The lists are quiet &mdash; challenge a friend</p>${btn ? '<div class="onrow"><button class="plaque big" data-on="create">Invite a friend</button></div>' : ''}`;
    };
    if (ph === 'finding') {      // Find match: the searching panel
      const f = L.find || { ranked: false, t0: performance.now() }, secs = Math.max(0, Math.floor((performance.now() - f.t0) / 1000));
      head = 'Finding a match'; actions = '<button class="btn" data-on="back">Cancel</button>';
      body = `<div class="roomcode"><span>${f.ranked ? 'RANKED' : 'UNRANKED'} QUEUE</span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div><p class="wait">Looking for an opponent near your rating…</p>
        <p class="dimtxt">The search widens the longer you wait. ${f.ranked ? 'A ranked result counts on the Rankings and pays a purse.' : 'An unranked joust is friendly: your rating does not change.'}</p>`;
    } else if (L.mm && ['found', 'mmConnect', 'hostWait', 'hostReady', 'joined'].includes(ph)) {      // the match is made: the opponent, the lists and the rules the server chose
      const m = L.mm, mv = VENUES[m.venue] || VENUES[0], o = m.opp || {};
      head = 'Opponent found'; actions = '<button class="btn" data-on="back">Cancel</button>';
      body = `<div class="roomcode"><span>OPPONENT FOUND</span><b class="oppfound">${esc(o.name)} · ${esc(o.division)}</b></div>
        <p class="wait">${ph === 'found' ? 'Getting ready…' : fr ? 'Connected: the joust begins…' : 'Connecting to your opponent…'}</p>
        <p class="dimtxt">${mv.name}, ${mv.city}${mv.country ? ', ' + mv.country : ''} · ${(MODES[m.mode] || MODES.planken).name} · ${m.courses} courses · ${m.ranked ? 'ranked' : 'unranked'}</p>`;
    } else if (ph === 'choose') {
      head = '';
      const pl = (cls, attrs, label, t, tb) => `<button class="plaque ${cls}" ${attrs} ${tipAttr(t, tb)}>${label}${tip(t, tb, 'tonly')}</button>`;
      const err = L.err ? `<p class="err">${esc(L.err)}</p>` : '';
      if (O.alone()) {      // nobody else in the lists: no searching, just the invite link
        body = `${err}<div class="onrow main">${pl('big', 'data-on="create"', 'Invite a friend', 'Invite a friend', 'Makes a private room and its link.|Send it to a friend: no account needed.')}${pl('blue', 'data-on="joinmode"', 'Join a friend', 'Join a friend', "Type your friend's code.")}</div>
        <p class="presence quiet">Nobody else in the lists right now &mdash; send a friend the link.</p>
        <p class="fineprint">${tip('Playing online', 'You ride with your own arms, horse and harness.|Nothing is paid and no renown is won.|Only your chosen name is shown to others.')} Friend rooms need no account.</p>`;
      } else body = `${err}<div class="onrow main">${pl('big', 'data-on="find" data-ranked="0"', 'Find match', 'Find match', 'Unranked: paired by rating, friendly.|Your rating does not change.')}${pl('blue', 'data-on="find" data-ranked="1"', 'Ranked match', 'Ranked match', api.account && api.account.signedIn() ? 'Rated, and it pays a purse.' : 'Sign in to play ranked.')}</div>
        <div class="onrow three">${pl('blue', 'data-on="quick"', 'Quick match', 'Quick match', 'Join the next open room,|or wait for a challenger.')}${pl('blue', 'data-on="list"', 'Public rooms', 'Public rooms', 'See who is waiting, and pick a room.')}${pl('blue', 'data-on="friend"', 'Invite a friend', 'A private room', 'Share the link or code with a friend.|No account needed.')}</div>
        ${presenceLine(false)}
        <p class="fineprint">${tip('Playing online', 'You ride with your own arms, horse and harness.|Nothing is paid and no renown is won.|Only your chosen name is shown to others.')} Friend rooms need no account.</p>`;
    } else if (ph === 'friend') {
      head = '';
      body = `<div class="onrow main"><button class="plaque big" data-on="create">Create a room${tip('Create a room', 'You get a code to share with your friend.', 'tonly')}</button><button class="plaque blue" data-on="joinmode">Join a room${tip('Join a room', "Type your friend's code.", 'tonly')}</button></div><p class="fineprint">Make a private room and share its code, or type your friend's.</p>`;
    } else if (ph === 'list') {
      head = 'Open public rooms. Pick one to join.';
      actions = '<button class="btn" data-on="back">Back</button><button class="btn" data-on="createpub">Create a room</button>';
      body = `${L.err ? `<p class="err">${L.err}</p>` : ''}${presenceLine(false)}${rows()}`;
    } else if (ph === 'quickLook') {
      head = 'Quick match'; actions = '<button class="btn" data-on="back">Cancel</button>';
      body = '<p class="wait">Looking for an open room…</p>';
    } else if (host) {
      const pubRow = () => `<h5>Who can see this room</h5><div class="swatches"><span class="chip ${L.pub ? '' : 'sel'}" data-on="pub" data-pub="0">Private</span><span class="chip ${L.pub ? 'sel' : ''}" data-on="pub" data-pub="1">Public</span><small class="dimtxt">${L.pub ? 'Listed in Public rooms until a challenger arrives' : 'Only someone with the code can join'}</small></div>`;
      head = ph === 'hostReady' ? `${fr.name} has joined. Choose the lists and the rules, then ride.` : L.quick ? 'Quick match' : L.pub ? 'Your room is listed in Public rooms.' : 'Share this code with your friend.';
      actions = `<button class="btn" data-on="back">${ph === 'hostReady' ? 'Back' : 'Cancel'}</button>${ph === 'hostReady' ? '<button class="btn primary" data-on="ride">Ride!</button>' : ''}`;
      if (L.quick && ph === 'hostWait') body = `<p class="wait big">${L.code ? 'Waiting for a challenger…' : 'Opening a room…'}</p><p class="dimtxt">No open room was found, so yours is listed: ${V.name} · ${MODES[room.m].name} · ${fixed || room.c} courses</p>`;
      else body = `<div class="roomcode"><span>ROOM CODE</span><b>${L.code || '·····'}</b></div>
        ${ph === 'hostWait' && L.code && !L.quick ? `${L.note ? `<p class="dimtxt invnote">${esc(L.note)}</p>` : ''}<div class="onrow invite"><button class="btn primary big" data-on="copy">${L.copied === true ? 'Link copied' : 'Copy invite link'}</button>${typeof navigator.share === 'function' && document.body.classList.contains('touch') ? `<button class="btn big" data-on="invite">Share</button>` : ''}</div><input class="name invlink" readonly value="${O.inviteLink(L.code).replace(/&/g, '&amp;')}" onfocus="this.select()">${L.copied === 'fail' ? '<p class="dimtxt">Copying is blocked here. Select and copy the link above.</p>' : ''}${presenceLine(false)}` : ''}
        ${ph === 'hostReady' ? friendRow() + presenceLine(false) : `<p class="wait">${L.code ? (L.pub ? 'Waiting for a challenger…' : 'Waiting for your friend…') : 'Opening the room…'}</p>${pubRow()}`}
        ${chips()}`;
    } else if (ph === 'joinInput') {
      head = 'Type the five letters your friend gives you.';
      body = `<div class="joinrow"><input class="name code" id="joinCode" maxlength="5" placeholder="CODE" value="${joinDraft}" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn primary" data-on="join">Join</button></div>
        ${L.err ? `<p class="err">${L.err}</p>` : ''}`;
    } else if (ph === 'joining') {
      head = 'Connecting…'; actions = '<button class="btn" data-on="back">Cancel</button>';
      body = `<div class="roomcode"><span>ROOM CODE</span><b>${L.code}</b></div><p class="wait">Looking for your friend… this can take a few seconds.</p>`;
    } else if (ph === 'joined') {
      head = fr ? `You are in ${fr.name}'s room.` : 'Connected…';
      body = `${friendRow()}<p class="wait">Waiting for ${fr ? fr.name : 'the host'} to start the joust…</p>${presenceLine(false)}${summary()}`;
    } else {      // failed
      head = 'The room could not be opened.';
      body = `<p class="err">${L.err}</p><div class="onrow"><button class="btn primary" data-on="retry">Try again</button></div>`;
    }
    const gate = signin.onlineGate(() => { if (root.dataset.name === 'online') show('online'); });      // signed out and accounts exist: sign in first (src/signin.js)
    if (gate) { signin.style(); root.innerHTML = scroll('sheet online slim', `<div class="top"><div><h3>Play Online</h3></div><div class="actions"><button class="btn" data-go="main">Back</button></div></div>${gate}`); signin.bind(root.querySelector('[data-si-host]') || root); return; }
    if (ph === 'choose') body += signin.onlineNote();
    root.innerHTML = scroll('sheet online slim', `<div class="top"><div><h3>Play Online</h3>${head ? `<p>${head}</p>` : ''}</div><div class="actions">${actions}</div></div>${body}`);
    crests();
    if (host || ph === 'joined') api.setVenue(room.v);
    const inp = el('joinCode');
    if (inp) {
      inp.addEventListener('input', () => { inp.value = joinDraft = cleanCode(inp.value); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-on="join"]').click(); } });
      setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 50);
    }
  }
  /** What a person typed, made into a room code: letters only, upper case (the codes have no I or O). */
  const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 5);

  /** One retinue card: a man you can hire, or one in your service with his face, temper, training and a way to let him go. */
  function manCard(p, id) {
    const r = RETINUE[id], rec = (p.retinue || {})[id], T = rec && TRAITS[rec.trait];
    if (!rec) return `<div class="pick" data-hire="${id}"><b>${r.name}</b><em>hire ${marks(r.hire)}</em><p>${r.role}${r.wage ? ` Wage: ${marks(r.wage)} a tourney.` : ''} A man is found for you when you hire.</p></div>`;
    const cost = trainCost(id, rec), w = wageOf(id, rec), can = (p.gold || 0) >= cost;
    return `<div class="pick sel man"><canvas class="face" width="72" height="84" data-face="${rec.name.replace(/"/g, '')}|${T.color}|${r.cap}"></canvas><b>${rec.name}</b><em>${r.name} · level ${rec.level}</em>
      <p>${r.role}</p><p class="trait"><i style="color:${T.color}">${T.name}.</i> ${T.text}</p><p class="wage">${w ? `Wage: ${marks(w)} a tourney.` : 'In your service, no wage.'}</p>
      <div class="manact">${cost ? `<span class="chip ${can ? '' : 'dim'}" data-train="${id}">Train (${marks(cost)})</span>` : rec.level >= RETINUE_UP.max ? '<span class="dimtxt">Fully trained</span>' : ''}${id === 'squire' ? '' : `<span class="chip dismiss ${dismissArm === id ? 'armed' : ''}" data-dismiss="${id}">${dismissArm === id ? 'Click again to dismiss' : 'Dismiss'}</span>`}</div></div>`;
  }
  const faces = () => root.querySelectorAll('canvas[data-face]').forEach(c => { const [n, col, cap] = c.dataset.face.split('|'); drawFace(c, n, col, cap); });

  /** The editor's live pictures: the banner and one flank of the trapper as they will be sewn, and every charge in the roll in the player's own tinctures. */
  function armsPreviews(a, P) {
    const paint = () => {
      for (const [id, o] of [['pvBanner', { style: 'cloth' }], ['pvTrapper', { style: 'cloth' }]]) { const cv = el(id); if (!cv) return; const g = cv.getContext('2d'); drawArms(g, cv.width, cv.height, a, o); fabricOver(g, cv.width, cv.height, 0.8); }
      const fur = (h) => (h === ERMINE ? '#ece8dc' : h === VAIR ? '#1f4690' : h), bg = fur(a.c1), fg = fur(a.c3) === bg ? '#2b1d12' : a.c3;
      root.querySelectorAll('canvas[data-chgpv]').forEach(cv => { const g = cv.getContext('2d'), n = cv.width; g.clearRect(0, 0, n, n); g.fillStyle = bg; g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 1, 0, 7); g.fill(); drawCharge(g, cv.dataset.chgpv, n / 2, n / 2, n * 0.74, fg); });
    };
    paint(); if (!heraldryReady()) whenHeraldry(() => { if (root.dataset.name === 'armoury') paint(); });
  }

  let armTab = 'helm';
  const armFocus = {};      // the item each Armoury tab last showed in its large preview
  let armData = null;
  const ARM_TABS = [['helm', 'Helm'], ['armour', 'Harness'], ['lance', 'Lance'], ['men', 'Retinue'], ['knight', 'Knight']];
  /** The Knight tab's celebrations: your favourites (up to four) are what the prompt offers after a win, and the default if you do not choose. */
  function celebrationsHtml(p) {
    initCelUi(); const fav = favourites(p), chosen = p.celebs && p.celebs.length ? p.celebs : [];
    return `<div class="swatches cels">${WIN_IDS.map(id => `<div class="chip ${chosen.includes(id) ? 'sel' : ''} ${api.celPreviewId && api.celPreviewId() === id ? 'view' : ''}" data-cel="${id}" data-tip-title="${CELEBS[id].name}" data-tip="${CELEBS[id].blurb.replace(/"/g, '&quot;')}">${celIcon(id)} ${CELEBS[id].name}</div>`).join('')}</div>
      <p class="aside">${chosen.length ? `Chosen: ${fav.map(id => CELEBS[id].name).join(', ')}.` : `None chosen: the herald's favourites are used (${fav.map(id => CELEBS[id].name).join(', ')}).`} A beaten knight nods or slaps his helm.</p>`;
  }
  /** Wire the item tabs: hovering a card (or the first tap on a phone) shows it in the large preview; drag turns it, wheel or pinch zooms. Click and buy logic is untouched (onClick). */
  function armBind() {
    const stage = el('armStage'), cards = el('armCards'); if (!stage || !cards || !armData) return;
    const show1 = (id) => {
      const it = armData.its.find(i => String(i.id) === id); if (!it || armFocus[armTab] === id) return;
      armFocus[armTab] = id; stage.innerHTML = armData.stage(it); faces();
      cards.querySelectorAll('.armcard.view').forEach(c => c.classList.remove('view')); const c = cards.querySelector(`[data-focus="${id}"]`); if (c) c.classList.add('view');
    };
    const cur = cards.querySelector(`[data-focus="${armFocus[armTab]}"]`); if (cur) cur.classList.add('view');
    cards.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-focus]'); if (c && !document.body.classList.contains('touch')) show1(c.dataset.focus); });
    cards.addEventListener('focusin', (e) => { const c = e.target.closest('[data-focus]'); if (c) show1(c.dataset.focus); });
    // a phone has no hover: the first tap on a card shows it, a second tap (or the button in the panel) does what the card does
    cards.addEventListener('click', (e) => { const c = e.target.closest('[data-focus]'); if (!c || !document.body.classList.contains('touch')) return;
      if (armFocus[armTab] !== c.dataset.focus) { e.stopPropagation(); show1(c.dataset.focus); } }, true);
    // drag to turn, wheel or pinch to zoom, double-click to reset (previews.js reads data-yaw and data-zoom of the big canvas)
    const ptrs = new Map(); let pinch = 0;
    const big = () => stage.querySelector('canvas.pv.big');
    const zoomBy = (cv, f) => { cv.dataset.zoom = String(Math.max(0.6, Math.min(3.2, (+cv.dataset.zoom || 1) * f))); };
    stage.addEventListener('pointerdown', (e) => { const cv = big(); if (!cv || e.target !== cv) return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; cv.dataset.drag = '1'; });
    stage.addEventListener('pointermove', (e) => { const cv = big(); if (!cv || !ptrs.has(e.pointerId)) return; const o = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomBy(cv, d / pinch); pinch = d; }
      else cv.dataset.yaw = String((+cv.dataset.yaw || 0) + (e.clientX - o[0]) * 0.012); });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; const cv = big(); if (cv && !ptrs.size) delete cv.dataset.drag; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { const cv = big(); if (!cv || e.target !== cv) return; e.preventDefault(); zoomBy(cv, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    stage.addEventListener('dblclick', (e) => { const cv = big(); if (cv && e.target === cv) { delete cv.dataset.zoom; delete cv.dataset.yaw; } });
  }
  /** Wire the item tabs: hovering a card (or the first tap on a phone) shows it in the large preview; drag turns it, wheel or pinch zooms. Click and buy logic is untouched (onClick). */
  function armBind() {
    const stage = el('armStage'), cards = el('armCards'); if (!stage || !cards || !armData) return;
    const show1 = (id) => {
      const it = armData.its.find(i => String(i.id) === id); if (!it || armFocus[armTab] === id) return;
      armFocus[armTab] = id; stage.innerHTML = armData.stage(it); faces();
      cards.querySelectorAll('.armcard.view').forEach(c => c.classList.remove('view')); const c = cards.querySelector(`[data-focus="${id}"]`); if (c) c.classList.add('view');
    };
    const cur = cards.querySelector(`[data-focus="${armFocus[armTab]}"]`); if (cur) cur.classList.add('view');
    cards.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-focus]'); if (c && !document.body.classList.contains('touch')) show1(c.dataset.focus); });
    cards.addEventListener('focusin', (e) => { const c = e.target.closest('[data-focus]'); if (c) show1(c.dataset.focus); });
    // a phone has no hover: the first tap on a card shows it, a second tap (or the button in the panel) does what the card does
    cards.addEventListener('click', (e) => { const c = e.target.closest('[data-focus]'); if (!c || !document.body.classList.contains('touch')) return;
      if (armFocus[armTab] !== c.dataset.focus) { e.stopPropagation(); show1(c.dataset.focus); } }, true);
    // drag to turn, wheel or pinch to zoom, double-click to reset (previews.js reads data-yaw and data-zoom of the big canvas)
    const ptrs = new Map(); let pinch = 0;
    const big = () => stage.querySelector('canvas.pv.big');
    const zoomBy = (cv, f) => { cv.dataset.zoom = String(Math.max(0.6, Math.min(3.2, (+cv.dataset.zoom || 1) * f))); };
    stage.addEventListener('pointerdown', (e) => { const cv = big(); if (!cv || e.target !== cv) return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    stage.addEventListener('pointermove', (e) => { const cv = big(); if (!cv || !ptrs.has(e.pointerId)) return; const o = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomBy(cv, d / pinch); pinch = d; }
      else cv.dataset.yaw = String((+cv.dataset.yaw || 0) + (e.clientX - o[0]) * 0.012); });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { const cv = big(); if (!cv || e.target !== cv) return; e.preventDefault(); zoomBy(cv, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    stage.addEventListener('dblclick', (e) => { const cv = big(); if (cv && e.target === cv) { delete cv.dataset.zoom; delete cv.dataset.yaw; } });
  }
  function armoury() {
    const p = api.profile, a = p.arms, broke = (p.gold || 0) < 0;
    const hb = store.has('herald'), PACKNAME = { herald: "the Herald's Book", rolls: 'the Rolls of Arms', finishes: "the Armourer's Finishes", patron: 'Grand Patrons only' };
    const lockTip = (sku) => `data-lock="${sku}" data-tip="${sku === 'patron' ? PACKNAME.patron : 'In ' + PACKNAME[sku]}"`;
    const fins = PACKS.finishes.finishes, fb = store.has('finishes');
    const finishRow = `<div class="swatches"><span class="lbl">Finish</span><div class="chip ${!p.finish || !fb ? 'sel' : ''}" data-fin="plain">Bright steel</div>${Object.entries(fins).map(([id, f]) => fb ? `<div class="chip ${p.finish === id ? 'sel' : ''}" data-fin="${id}" data-tip="${f.blurb}">${f.name}</div>` : `<div class="chip locked" ${lockTip('finishes')}>${f.name}</div>`).join('')}</div>`;
    // THE BLAZON EDITOR (heraldry.js). Free: every field, division and ordinary, the starter charges (cosmetics.js FREE_CHARGES), the nine tinctures. The Herald's Book: the other
    // charges, the furs and three stain tinctures; the Rolls of Arms: its roll of real arms (and the two charges and the furs those bear); the patron's crown. cosmetics.js allowedArms is the rule.
    const P = armsParts(a), faults = tinctureFaults(a), party = { pale: 1, perfess: 1, perbend: 1, perbendsin: 1, perchevron: 1, persaltire: 1, quarterly: 1 }[P.field];
    const FUR_SW = [['Ermine', ERMINE, 'repeating-radial-gradient(circle at 50% 40%, #191919 0 1.5px, #ece8dc 2px 6px)'], ['Vair', VAIR, 'repeating-linear-gradient(90deg, #1f4690 0 5px, #ece8dc 5px 10px)']];
    const furOk = hb || store.has('rolls');
    const sw = (key, lbl, cur, furs) => `<div class="swatches"><span class="lbl">${lbl}</span>${TINCTURES.map(t => `<div class="sw ${cur === t[1] ? 'sel' : ''}" data-tip="${t[0]}" style="background:${t[1]}" data-col="${key}|${t[1]}"></div>`).join('')}${PACKS.herald.tinctures.map(t => hb ? `<div class="sw ${cur === t[1] ? 'sel' : ''}" data-tip="${t[0]}" style="background:${t[1]}" data-col="${key}|${t[1]}"></div>` : `<div class="sw locked" style="background:${t[1]}" ${lockTip('herald')}></div>`).join('')}${furs ? FUR_SW.map(t => furOk ? `<div class="sw fur ${cur === t[1] ? 'sel' : ''}" data-tip="${t[0]}" style="background:${t[2]}" data-col="${key}|${t[1]}"></div>` : `<div class="sw fur locked" style="background:${t[2]}" ${lockTip('herald')}></div>`).join('') : ''}</div>`;
    const lays = [['one', 'one'], ['three', 'three'], ['semy', 'semé (strewn)'], ...(P.ord !== 'none' ? [['onone', 'one on the ordinary'], ['onthree', 'three on it']] : []), ...(party && P.ord === 'none' ? [['counter', 'counterchanged']] : []), ...(P.lay === 'ten' ? [['ten', 'ten (3, 3, 3, 1)']] : [])];
    const chgOf = (k) => { const sku = skuOfCharge(k), ok = !sku || store.has(sku) || (sku === 'herald' && store.has('rolls') && ROLL_CHARGES.includes(k)), t = CHARGE_ROLL[k][0].replace(/^an? /, '');
      return ok ? `<canvas class="chg ${P.charge === k ? 'sel' : ''}" width="72" height="72" data-chg="${k}" data-chgpv="${k}" data-tip="${t}"></canvas>` : `<canvas class="chg locked" width="72" height="72" data-chgpv="${k}" ${lockTip(sku)}></canvas>`; };
    const chgKeys = Object.keys(CHARGE_ROLL).sort((x, y) => (skuOfCharge(x) ? 1 : 0) - (skuOfCharge(y) ? 1 : 0));
    const histOk = (h) => JSON.stringify(allowedArms(h.arms, ownedSkus())) === JSON.stringify(h.arms);
    const blazon = `<div class="arms-row herald"><div class="armspv"><canvas id="crestBig" width="300" height="356"></canvas>
        <div class="armsmini"><canvas id="pvBanner" width="120" height="240" aria-label="Banner"></canvas><canvas id="pvTrapper" width="250" height="240" aria-label="Trapper (one flank)"></canvas></div>
        <p class="blazon">${blazonText(a)}</p>${faults.length ? `<p class="dimtxt rule">Against the rule of tincture (no metal on metal, no colour on colour): ${faults.join('; ')}. Heralds will mutter, but it is your shield.</p>` : ''}</div><div>
        <div class="swatches"><span class="lbl">Field</span>${Object.entries(FIELDS).map(([k, n]) => `<div class="chip ${P.field === k ? 'sel' : ''}" data-fld="${k}">${n}</div>`).join('')}</div>
        ${sw('c1', P.field === 'plain' ? 'Tincture' : 'First', a.c1, true)}${P.field === 'plain' ? '' : sw('c2', 'Second', a.c2, true)}
        <div class="swatches"><span class="lbl">Ordinary</span><div class="chip ${P.ord === 'none' ? 'sel' : ''}" data-ord="none">none</div>${Object.entries(ORDINARIES).map(([k, n]) => `<div class="chip ${P.ord === k ? 'sel' : ''}" data-ord="${k}">${n.replace(/^an? /, '')}</div>`).join('')}
          <div class="chip ${P.bord ? 'sel' : ''}" data-bord="${P.bord ? 0 : 1}">${P.bord ? '✓ ' : '+ '}bordure</div></div>
        ${P.ord === 'none' ? '' : sw('ordT', 'Its tincture', P.ordT, true)}${P.bord ? sw('bordT', 'Bordure', P.bordT, true) : ''}
        <div class="swatches chgrow"><span class="lbl">Charge</span><div class="chip ${P.charge === 'none' ? 'sel' : ''}" data-chg="none">none</div>${chgKeys.map(chgOf).join('')}</div>
        ${P.charge === 'none' ? '' : `<div class="swatches"><span class="lbl">Set out</span>${lays.map(([k, n]) => `<div class="chip ${P.lay === k ? 'sel' : ''}" data-lay="${k}">${n}</div>`).join('')}</div>${P.lay === 'counter' ? '' : sw('c3', 'Its tincture', a.c3, false)}`}
        <div class="swatches"><span class="lbl">Historic</span>${HISTORIC_ARMS.map((h, i) => histOk(h) ? `<div class="chip" data-tip="${h.note}" data-hist="${i}">${h.name}</div>` : `<div class="chip locked" ${lockTip('rolls')}>${h.name}</div>`).join('')}${PACKS.rolls.arms.map((h, i) => store.has('rolls') ? `<div class="chip" data-tip="${h.note}" data-roll="${i}">${h.name}</div>` : `<div class="chip locked" ${lockTip('rolls')}>${h.name}</div>`).join('')}</div></div></div>`;
    const pv = (kind, id) => `<canvas class="pv" data-pv="${kind}:${id}"></canvas>`;
    const q = (t) => String(t).replace(/"/g, '&quot;');
    const badge = (owned, cur, curWord, price) => `<em class="${owned ? 'own' : (p.gold || 0) < price ? 'cost cant' : 'cost'}">${owned ? curWord : marks(price)}</em>`;
    let body = '', hint = '';
    // The item tabs share one layout: a large preview with the full description above, the cards to choose from below (no tooltips on the cards).
    const own = (list, id) => list.includes(id);
    const itemsOf = (tab) => {
      if (tab === 'horse') return Object.values(HORSES).map(h => { const has = own(p.owned.horses, h.id), on = p.horse === h.id; return { kind: 'horse', id: h.id, name: h.name, blurb: h.blurb, attr: 'data-horse', has, on, price: h.price, word: on ? 'Riding' : 'Owned', verb: 'Ride',
        lines: [`Keep: ${marks(ECON.keep[h.id] ?? 2)} a tourney.`, has ? `Bond with you: ${BOND_NAMES[bondLevel((p.bond || {})[h.id])]} of IV.` : ''], stats: [['Speed', (h.top - 7.2) / 2], ['Accel', h.accel / 3.7], ['Shock', (h.mass - 0.7) / 0.6], ['Smooth', h.steady], ['Temper', h.nerve], ['Wind', h.stamina]], extra: '<span class="chip" data-go="stable">Visit the stable</span>' }; });
      if (tab === 'helm') return Object.values(HELMS).map(h => { const has = own(p.owned.helms, h.id), on = p.helm === h.id; return { kind: 'helm', id: h.id, name: h.name, blurb: h.blurb, attr: 'data-helm', has, on, price: h.price, word: on ? 'Worn' : 'Owned', verb: 'Wear', lines: [],
        stats: [['Protect', h.protection], ['Vision', h.vision], ['Light', 1.15 - h.kg / 10]] }; });
      if (tab === 'armour') return Object.values(ARMOURS).map(r => { const has = own(p.owned.armours, r.id), on = p.armour === r.id; return { kind: 'armour', id: r.id, name: r.name, blurb: r.blurb, attr: 'data-armour', has, on, price: r.price, word: on ? 'Worn' : 'Owned', verb: 'Wear', lines: [],
        stats: [['Protect', r.protection], ['Light', 1.9 - r.weight * 1.2]], extra: finishRow }; });
      if (tab === 'lance') return Object.values(LANCES).map(l => { const on = (p.lance || 'standard') === l.id; return { kind: 'lance', id: l.id, name: l.name, blurb: l.blurb, attr: 'data-lance', has: true, on, word: on ? 'Carried' : 'Owned', verb: 'Carry', tag: `${marks(ECON.lance[l.id])} each`, lines: [`You pay ${marks(ECON.lance[l.id])} for each lance you break.`],
        stats: [['Shock', (l.power - 0.7) / 0.5], ['Steady', 1.55 - l.sway], ['Arm', 1.2 - l.fatigue * 0.55]] }; });
      return Object.keys(RETINUE).map(id => { const r = RETINUE[id], rec = (p.retinue || {})[id], T = rec && TRAITS[rec.trait]; if (!rec) return { kind: 'man', id, name: r.name, blurb: r.role, attr: 'data-hire', has: false, on: false, price: r.hire, verb: 'Hire', lines: [r.wage ? `Wage: ${marks(r.wage)} a tourney.` : '', 'A man is found for you when you hire.'], stats: [] };
        const cost = trainCost(id, rec), w = wageOf(id, rec), can = (p.gold || 0) >= cost;
        return { kind: 'man', id, name: rec.name, sub: `${r.name} · level ${rec.level}`, blurb: r.role, has: true, on: true, word: `Level ${rec.level}`, face: `${rec.name.replace(/"/g, '')}|${T.color}|${r.cap}`, lines: [`<i style="color:${T.color}">${T.name}.</i> ${T.text}`, w ? `Wage: ${marks(w)} a tourney.` : 'In your service, no wage.'], stats: [],
          extra: `${cost ? `<span class="chip ${can ? '' : 'dim'}" data-train="${id}">Train (${marks(cost)})</span>` : rec.level >= RETINUE_UP.max ? '<span class="dimtxt">Fully trained</span>' : ''}${id === 'squire' ? '' : `<span class="chip dismiss ${dismissArm === id ? 'armed' : ''}" data-dismiss="${id}">${dismissArm === id ? 'Click again to dismiss' : 'Dismiss'}</span>`}` }; });
    };
    const armCard = (it) => `<div class="pick armcard ${it.kind} ${it.on ? 'sel' : ''}" ${it.attr && !it.has ? `${it.attr}="${it.id}"` : it.attr && it.kind !== 'man' ? `${it.attr}="${it.id}"` : ''} data-focus="${it.id}">${it.face ? `<canvas class="face" width="72" height="84" data-face="${it.face}"></canvas>` : pv(it.kind, it.id)}<b>${it.name}</b>${it.sub ? `<span class="sub">${it.sub}</span>` : ''}${it.tag ? `<em class="own">${it.tag}</em>` : it.has ? `<em class="own">${it.word}</em>` : `<em class="${(p.gold || 0) < it.price ? 'cost cant' : 'cost'}">${marks(it.price)}</em>`}</div>`;
    /** The stat bars of one item in the preview panel: the single place that draws them (a one-line note can stand in for them here). */
    const gearBars = (it) => !it.stats.length ? '' : EQUAL_GEAR ? SAME : `<div class="armstats">${it.stats.map(([n, v]) => stat(n, v)).join('')}</div>`;
    const armStage = (it) => {
      const act = it.kind === 'man' ? (it.has ? '' : `<button class="btn primary" data-hire="${it.id}">Hire · ${marks(it.price)}</button>`)
        : it.on ? `<span class="chip sel nowon">${it.word}</span>` : it.has ? `<button class="btn primary" ${it.attr}="${it.id}">${it.verb}</button>` : `<button class="btn primary ${(p.gold || 0) < it.price ? 'cant' : ''}" ${it.attr}="${it.id}">Buy · ${marks(it.price)}</button>`;
      return `<div class="armview">${it.face ? `<canvas class="face big" width="216" height="252" data-face="${it.face}"></canvas>` : `<canvas class="pv big" data-pv="${it.kind}:${it.id}"></canvas><span class="zoomhint">Drag to turn · wheel or pinch to zoom · double-click to reset</span>`}</div>
        <div class="arminfo"><h4>${it.name}</h4>${it.sub ? `<p class="subline">${it.sub}</p>` : ''}<p class="blurb">${it.blurb}</p>${it.lines.filter(Boolean).map(l => `<p class="note">${l}</p>`).join('')}
          ${gearBars(it)}<div class="armact">${act}${it.extra || ''}</div></div>`;
    };
    if (armTab !== 'knight') {
      const its = itemsOf(armTab), pick = its.find(i => i.id === armFocus[armTab]) || its.find(i => i.on) || its[0];
      armFocus[armTab] = pick.id; armData = { its, stage: armStage };
      hint = '';
      body = `<div class="armstage" id="armStage">${armStage(pick)}</div><div class="armcards" id="armCards">${its.map(armCard).join('')}</div>`;
    } else {
      hint = '';
      body = `<h5>Your Name</h5><input class="name" id="nameIn" name="knight-title" maxlength="22" value="${p.name.replace(/"/g, '')}" ${NOFILL}>
      <h5>Celebrations <small>pick up to ${MAX_FAVS}: one of these plays when you win (you may choose another on the day)</small></h5>${celebrationsHtml(p)}
      <h5>Blazon <small>your arms go on your shield, surcoat, trapper, banner and the roll</small></h5>${blazon}
      <!-- slot: Body (build and height options are added here by the character-creation module) -->
      ${bodyBlock(p)}`;
    }
    root.innerHTML = scroll(`sheet armscr ${armTab === 'knight' ? 'knighttab' : 'itemtab'}`, `<div class="top"><div><h3>Armoury</h3><p class="purseline"><b>${purseText(p.gold)}</b>${(p.honours || []).length ? ` · ${career.honoursLine(p)}` : ''}${broke ? ' <span class="debt">· no buying while in debt</span>' : ''}</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Done</button></div></div>
      <div class="tabs" role="tablist">${ARM_TABS.map(([id, n]) => `<button class="tab ${armTab === id ? 'sel' : ''}" role="tab" data-artab="${id}">${n}</button>`).join('')}<span class="tabhint">${hint}</span></div>
      <div class="tabbody ${armTab === 'knight' ? 'form' : 'armlay'}">${body}</div>`);
    if (armTab !== 'knight') { armBind(); if (api.celPreview && api.celPreviewId && api.celPreviewId()) api.celPreview(null); }
    else if (api.celPreview && api.celPreviewId && !api.celPreviewId()) api.celPreview(favourites(p)[0]);
    if (el('crestBig')) { drawCrest(el('crestBig'), a); armsPreviews(a, P); }
    faces();
    const ni = el('nameIn'); if (ni) ni.addEventListener('change', (e) => { p.name = cleanName(e.target.value); e.target.value = p.name; api.saveProfile(); });
  }

  function skills() {
    const p = api.profile, r = rankOf(p.renown), pts = skillPoints(p), next = RANKS[r + 1], here = RANKS[r];
    const frac = next ? ((p.renown || 0) - here.at) / (next.at - here.at) : 1;
    root.innerHTML = scroll('sheet skillscr', `<div class="top"><div><h3>Renown &amp; Skills ${tip('Renown', "Every joust adds to your name: more for a win, each lance broken, a stroke on the helm, an unhorsing and the gallery's favour.|Each new rank lets you learn one skill.")}</h3>
      <p>${pts > 0 ? `<b>You have ${pts} skill${pts > 1 ? 's' : ''} to learn: choose below.</b>` : next ? `The next skill comes at ${next.at} renown.` : 'You have reached the highest rank.'}</p></div>
      <div class="actions"><button class="btn" data-go="feats">Feats ${featCount(p).have}/${featCount(p).total}</button><button class="btn primary" data-go="main">Back</button></div></div>
      <div class="renown"><span>${here.name}</span><div class="bar"><div style="width:${Math.round(Math.max(0.02, Math.min(1, frac)) * 100)}%"></div></div><span>${next ? `${p.renown || 0} / ${next.at} · ${next.name}` : `${p.renown || 0} renown`}</span></div>
      <h5>Skills</h5><div class="skills">${Object.entries(SKILLS).map(([id, s]) => { const known = (p.skills || {})[id], open = !known && pts > 0;
        return `<div class="skill ${known ? 'known' : open ? 'open' : 'locked'}" ${open ? `data-skill="${id}"` : ''} data-tip-title="${s.name}" data-tip="${String(s.text).replace(/"/g, '&quot;')}"><em>${known ? 'Learned' : open ? 'Learn' : 'Next rank'}</em><b>${s.name}</b></div>`; }).join('')}</div>
      ${more('skRanks', 'The ranks', `<table class="tbl"><tr><th>Rank</th><th>Renown</th><th></th></tr>${RANKS.map((k, i) => `<tr class="${i === r ? 'me' : ''}"><td>${k.name}</td><td>${k.at}</td><td>${i === 0 ? '' : i <= r ? 'one skill earned' : 'one skill'}</td></tr>`).join('')}</table>`)}
      ${more('skArts', `The hidden arts ${tip('Hidden arts', 'These are not learned but found.|Arts you discover in the lists appear here.')}`, `<div class="arts">${Object.entries(ARTS).map(([id, a]) => (p.arts || {})[id] ? `<div class="art known"><b>${a.name}</b><span>${a.text}</span></div>` : `<div class="art unknown"><b>? ? ?</b><span>Not yet discovered.</span></div>`).join('')}</div>`)}`);
  }

  function how() {
    if (openMore.hControls === undefined) openMore.hControls = true;
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>The Art of the Joust</h3></div>
      <div class="actions"><button class="btn primary" data-go="main">Back</button></div></div>
      <p class="dropcap"><i>King Duarte of Portugal wrote that jousters fail for four reasons: lack of <b>sight</b>, lack of control of the <b>lance</b>, lack of control of the <b>horse</b>, and lack of <b>will</b>. Every course you run is judged on those four.</i></p>
      ${more('hControls', 'Controls', `<div class="keys">
        <kbd>W</kbd><span>Before the course: raise your lance to show you are ready, then wait for the marshal's call and tap again to ride. While riding, each tap climbs a gait: walk, trot, canter, gallop. At the gallop, tap in time with the stride (the pulsing ring) to keep him collected.</span>
        <kbd>H</kbd><span>Take your helm off or put it on, between courses. (On the low-detail rider a bascinet or armet has a visor to raise instead: a raised visor gives a clear view, but a blow to the helm hurts twice as much.)</span>
        <kbd>S</kbd><span>Rein in — hold to drop a gait.</span>
        <kbd>A · D</kbd><span>Steer toward or away from the tilt. Ride close, but strike the barrier and it costs you.</span>
        <kbd>Left mouse</kbd><span>Hold to lower and couch the lance. Release to raise it.</span>
        <kbd>Mouse</kbd><span>Aim. The ring shows where your point will truly land.</span>
        <kbd>Space</kbd><span>Thrust — in the last instant before you hit, lean in and drive the lance forward. You hit harder, reach him sooner and sit firmer.</span>
        <kbd>Q</kbd><span>Hold to raise your shield. Raised, it guards the helm and bares the body; low, the reverse.</span>
        <kbd>Shift</kbd><span>The Spur — a burst of speed at the gallop, once you have learned it.</span>
        <kbd>Right mouse · F</kbd><span>Nerve — steady yourself and slow the moment. It runs out.</span>
        <kbd>C</kbd><span>Hold to look behind you.</span>
        <kbd>R</kbd><span>Watch the instant replay again.</span>
        <kbd>1 2 3 4</kbd><span>Between courses: salute the gallery, rouse the commons, taunt your opponent, or steady your horse.</span>
        <kbd>X</kbd><span>Salute a knight you have unhorsed.</span>
        <kbd>V</kbd><span>First person or third person.</span>
        <kbd>M</kbd><span>Sound on or off. Esc pauses; Backspace while paused leaves the lists.</span></div>`)}
      ${more('hCheque', 'The cheque (scoring)', `<p>Attaint (a touch) 1 · Lance broken 2 · Broken on the helm 3 · Unhorsing wins the match.<br>Hit the tilt −2 · Hit a horse −3, and twice loses you the prize.<br>
        Ride on with your lance still low −1. Five courses by default (you choose three to fifteen on the circuit screen, three to twenty in a joust); level cheques run extra courses.</p>`)}
      ${more('hJousts', 'The jousts', `${Object.values(MODES).map(m => `<p><b>${m.name}</b> (${m.sub}). ${m.blurb}${m.kitNote ? ' ' + m.kitNote : ''}</p>`).join('')}`)}
      ${more('hTech', 'Technique', `<p><b>Lower it late and gently.</b> "Like a clock weight," wrote Quijada de Reayo. Couch too early and your arm tires and the point wanders; too late and it is still settling in the rest when you meet.</p>
        <p><b>Speed is the shock.</b> A lance only breaks if you bring weight and pace to it. But the faster the gallop, the more the point bounces — a smooth horse and a collected stride steady it.</p>
        <p><b>Ride the tilt.</b> Stay straight and close. A nervous horse will shy from the barrier and the roar of the stands.</p>
        <p><b>Raise it after.</b> The moment your stroke is given, let go and the lance goes upright. Do it at once and the gallery marks a rider in command of his lance; ride on with the point low and the marshal marks it against you.</p>
        <p><b>Hit it square.</b> A point that meets armour at a flat angle skids off: it may slide on to the next thing along, or away into the air. The middle of the shield is the surest; the helm sheds most strokes that are not dead on.</p>
        <p><b>Don't flinch.</b> Thrust (SPACE) at the instant of the shock and you hit harder and sit firmer. In the frog-mouth helm, sitting up to take the blow hides your sight.</p>`)}
      ${more('hPurse', 'The purse', `<p>Money is counted in coins. A circuit tourney pays a <b>prize purse</b> that grows from venue to venue, and the gallery adds a gift if you have won its favour. Against that you pay the <b>entry fee</b>, your squires and stabling, every <b>lance you break</b>, and the armourer and horse-leech for the hurts of the day.</p>
        <p><b>Ransom.</b> By the old custom of the tourney, a knight put out of the saddle forfeits horse and harness and must buy them back. Unhorse your man on the circuit and he pays you a fifth of their worth; be unhorsed and you pay it. A rich harness is a rich ransom.</p>
        <p>If the purse runs dry the moneylenders carry you, up to ${marks(ECON.debtCap)}. In debt you may still ride, but you can buy nothing. A joust has no fee and no ransom.</p>`)}
      ${more('hCrowd', 'The crowd', `<p><b>The commons</b> at the rails love a hard shock: break lances and unhorse your man and they will chant your name, and their roar rattles your opponent's aim. They jeer a miss.<br>
        <b>The gallery</b> — the court, the ladies, the clergy — prizes skill and courtesy: salute them, strike the helm, keep your strokes fair. Win them and a lady may drop her sleeve, and the court adds a gift to your purse. Strike a horse and they turn their backs.</p>`)}
      <div id="musicCredits"></div>`);
    // music credits come from the manifest at runtime (silent if there is none)
    const box = el('musicCredits'), esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    fetch('assets/music/manifest.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => {
      const tr = j && Array.isArray(j.tracks) ? j.tracks.filter(t => t && t.title) : [];
      if (!tr.length || !box.isConnected) return;
      box.innerHTML = `<h5>Music</h5>` + tr.map(t => `<p>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>` : esc(t.title)} — ${esc(t.artist)}${t.licence ? ` (${esc(t.licence)})` : ''}</p>`).join('');
    }).catch(() => {});
  }

  let stableSel = null;
  function stable() {
    const p = api.profile, owned = (id) => p.owned.horses.includes(id), broke = (p.gold || 0) < 0;
    if (!HORSES[stableSel] || root.dataset.name !== 'stable') { stableSel = p.horse; stableCap = null; }
    if (!CAPARISONS[stableCap]) stableCap = p.caparison || 'livery';
    const capOwned = (id) => (p.owned.caparisons || ['livery', 'none']).includes(id), cap = CAPARISONS[stableCap], capMine = capOwned(cap.id), capOn = (p.caparison || 'livery') === cap.id, capAfford = (p.gold || 0) >= cap.price && !broke;
    const capBtns = Object.values(CAPARISONS).map(c => `<div class="chip ${c.id === cap.id ? 'sel' : ''}" data-stcap="${c.id}">${c.name} · ${(p.caparison || 'livery') === c.id ? 'on your horse' : capOwned(c.id) ? 'yours' : marks(c.price)}</div>`).join('');
    const capAct = capOn ? `<button class="btn" disabled>On your horse</button>` : capMine ? `<button class="btn primary" data-stcapset="${cap.id}">Use this caparison</button>`
      : `<button class="btn primary" data-stcapset="${cap.id}" ${capAfford ? '' : 'disabled'}>Buy for ${marks(cap.price)}</button>`;
    const h = HORSES[stableSel], mine = owned(h.id), riding = p.horse === h.id, afford = (p.gold || 0) >= h.price && !broke;
    const lvl = bondLevel((p.bond || {})[h.id]);
    const act = riding ? `<button class="btn" disabled>In your saddle</button>` : mine ? `<button class="btn primary" data-stbuy="${h.id}">Ride this horse</button>`
      : `<button class="btn primary" data-stbuy="${h.id}" ${afford ? '' : 'disabled'}>Buy for ${marks(h.price)}</button>`;
    const why = !mine && !afford ? `<span class="why">${broke ? 'You are in debt and can buy nothing.' : `You need ${marks(h.price - (p.gold || 0))} more.`}</span>` : '';
    const rows = Object.values(HORSES).map(x => `<div class="pick ${x.id === h.id ? 'sel' : ''}" data-stable="${x.id}" data-tip-title="${x.name}" data-tip="${String(x.blurb).replace(/"/g, '&quot;')}"><b>${x.name}</b><em class="${owned(x.id) ? 'own' : (p.gold || 0) < x.price ? 'cost cant' : 'cost'}">${p.horse === x.id ? 'Riding' : owned(x.id) ? 'Owned' : marks(x.price)}</em></div>`).join('');
    root.innerHTML = scroll('sheet stablescr', `<div class="top"><div><h3>The Stable</h3><p class="purseline"><b>${purseText(p.gold)}</b> ${tip('The Stable', 'Drag the horse to turn it.|Stabling is charged at each circuit tourney.')}</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Done</button></div></div>
      <div class="stbody"><div class="stlist">${rows}</div>
      <div class="stview"><canvas id="stableView"></canvas>
        <div class="stcap"><h5>Caparison</h5><div class="swatches">${capBtns}</div><p>${capAct} ${tip(cap.name, cap.blurb)}</p></div>
        <div class="stinfo"><div class="sthead"><div><h4>${h.name} ${tip(h.name, h.blurb)}</h4>${mine ? `<p class="bondline">Bond with you: <b>${BOND_NAMES[lvl]}</b> of IV</p>` : ''}<p class="bondline">Keep: ${marks(ECON.keep[h.id] ?? 2)} at each circuit tourney.</p></div><div class="stact">${act}${why}</div></div>
          <div class="stbars">${stat('Top speed', (h.top - 7.2) / 2)}${stat('Acceleration', h.accel / 3.7)}${stat('Shock weight', (h.mass - 0.7) / 0.6)}${stat('Smoothness', h.steady)}${stat('Nerve', h.nerve)}${stat('Stamina', h.stamina)}</div>${SAME}</div></div></div>`);
  }

  /** The feats: a grid of seals. Earned ones in colour with their date, the rest greyed with what they ask; hidden ones are ??? until earned. */
  function feats() {
    const p = api.profile, got = p.achievements || {}, fc = featCount(p);
    const seal = (a) => {
      const d = got[a.id], hid = a.hidden && !d;
      return `<div class="feat ${d ? 'got' : 'no'}"><i class="seal">${d ? '✦' : hid ? '?' : ''}</i><b>${hid ? '? ? ?' : a.name}</b><span>${hid ? 'A hidden feat. It is found, not sought.' : a.text}</span><em>${d ? `${d} · +${a.renown ?? ACH_RENOWN} renown` : ''}</em></div>`;
    };
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Feats &amp; Honours ${tip('Feats', 'Honours only: they give no strength in the lists,|just a little renown to remember them by.|Some are not written down until you earn them.')}</h3>
      <p>${fc.have} of ${fc.total} earned.</p></div>
      <div class="actions"><button class="btn" data-go="skills">Renown</button><button class="btn primary" data-go="main">Back</button></div></div>
      ${ACH_GROUPS.map(g => { const list = ACHIEVEMENTS.filter(a => a.group === g); return list.length ? `<h5>${g} <small>${list.filter(a => got[a.id]).length}/${list.length}</small></h5><div class="feats">${list.map(seal).join('')}</div>` : ''; }).join('')}`);
  }

  // ---- Rankings (src/ranks.js): your row, then the top 100; or, on the other tab, your recovery code. Every call may fail: the screen then says so and carries on.
  const RK = { status: 'idle', me: null, rows: [], myId: '', view: 'board', code: '', msg: '', draft: '' };
  const esc = (s) => String(s).replace(/[<>&"]/g, '');
  function rankings() {
    const R = RK, rk = () => { if (root.dataset.name === 'rankings') rankings(); };
    if (R.status === 'idle') {
      R.status = 'loading';
      ranks.ensure().then(async (id) => {
        R.myId = id || '';
        const [me, rows] = await Promise.all([id ? ranks.player(id) : null, ranks.leaderboard(100)]);
        R.me = me; R.rows = rows || []; R.status = rows || me ? 'ok' : 'fail'; rk();
      }).catch(() => { R.status = 'fail'; rk(); });
    }
    const line = (p, i) => `<div class="rkrow ${p.id === R.myId ? 'me' : ''}"><span class="n">${i}</span><b>${esc(safeName(p.name))}</b><span class="dv">${p.division}</span><span class="rt">${p.rating}${p.provisional ? '?' : ''}</span><span class="wl">${p.wins}–${p.losses}</span></div>`;
    const m = R.me, mine = m && m.matches
      ? `<div class="rkme"><b>${esc(safeName(m.name))}</b> · ${m.division} · ${m.rating}${m.rank ? ` · rank ${m.rank}` : ''} · ${m.wins}–${m.losses}–${m.draws}${m.provisional ? ` <em>provisional (${m.matches}/10 matches)</em>` : ''}</div>`
      : `<div class="rkme">${R.status === 'loading' ? 'Looking up your rank…' : R.status === 'fail' ? 'The rankings are not reachable just now. Online play works as usual.' : 'No ranked match yet: every online joust counts, a friend or a stranger.'}</div>`;
    let body;
    if (R.view === 'recover') {
      body = `<div class="rkrec"><p>Keep this to move your rank to another device. Anyone who has it can ride as you.</p><div class="rkcode">${R.code ? R.code : R.status === 'fail' ? 'Not available while the rankings are unreachable.' : '…'}</div>
        <p>Use a recovery code on this device (it replaces the rank this browser has):</p><div class="joinrow"><input class="name" id="rkIn" maxlength="64" placeholder="Recovery code" value="${esc(R.draft)}" autocomplete="off" spellcheck="false"><button class="btn primary" data-on="rkuse">Use code</button></div>${R.msg ? `<p class="err">${R.msg}</p>` : ''}</div>`;
    } else body = `<div class="rkhead"><span class="n">#</span><b>Knight</b><span class="dv">Division</span><span class="rt">Rating</span><span class="wl">W–L</span></div><div class="rklist">${R.rows.length ? R.rows.map((p, i) => line(p, i + 1)).join('') : `<p class="wait">${R.status === 'loading' ? 'Loading…' : R.status === 'fail' ? 'Could not reach the rankings.' : 'No ranked knights yet. Be the first.'}</p>`}</div>`;
    root.innerHTML = scroll('sheet ranksscr', `<div class="top"><div><h3>Rankings</h3><p>${tip('Rankings', 'Online matches only.|A "?" marks a rating still settling (under 10 matches).')}</p></div><div class="actions"><button class="btn" data-on="rkback">Back</button><button class="btn" data-on="rkview">${R.view === 'recover' ? 'Top 100' : 'Recovery code'}</button></div></div>${mine}${body}`);
    const inp = el('rkIn'); if (inp) inp.addEventListener('input', () => { R.draft = inp.value; });
  }
  // ---- the account: sign in, name, rating, cloud save, sign out, delete (src/account_panel.js); Back returns to Settings if that is where you came from
  let acctFrom = 'main';
  function accountScreen() {
    if (root.dataset.name !== 'account') acctFrom = root.dataset.name === 'settings' ? 'settings' : 'main';
    const me = api.account.info();
    root.innerHTML = scroll('sheet online slim', `<div class="top"><div><h3>Account</h3><p>${me ? 'Your account' : 'Sign in'}</p></div><div class="actions"><button class="btn" data-go="${acctFrom}">Back</button></div></div><div id="acctPanel"></div>`);
    mountAccountPanel(el('acctPanel'), { profile: api.profile });
  }
  // ---- the store: the Knight's Charter, the packs, the Grand Patron tier, Restore purchases (src/store.js draws it); Back returns where you came from
  let storeFrom = 'main';
  function storeScreen() {
    if (!PAY.live) return show('main');      // (no store while the game is free, src/config.js)
    if (root.dataset.name !== 'store') storeFrom = ['circuit', 'exhibition', 'armoury', 'account'].includes(root.dataset.name) ? root.dataset.name : 'main';
    const c = store.catalogueNow();
    root.innerHTML = scroll('sheet online store', `<div class="top"><div><h3>The Store${c && c.test ? ' <span class="test">Test mode</span>' : ''}</h3><p>The Knight's Charter opens the whole career. The packs change looks only.</p></div><div class="actions"><button class="btn" data-go="${storeFrom}">Back</button></div></div><div id="storeHost"></div>`);
    store.mountStore(el('storeHost'), { show });
  }
  const screens = { main, settings, circuit, exhibition, online, armoury, skills, how, stable, feats, welcome, rankings, account: accountScreen, store: storeScreen };
  /** Settings over a paused match (the pause menu's Settings button): `back` runs when it is closed (Done, Esc), returning to the pause menu. */
  let overBack = null;
  function openOver(back) { overBack = back; show('settings'); }
  function closeOver() { const f = overBack; overBack = null; root.classList.remove('on'); root.dataset.name = ''; if (f) f(); }
  function show(name) {
    if (name === 'main' && api.profile.named === false) name = 'welcome';      // first visit: your name before anything else
    // re-drawing the screen you are on keeps your place on the page
    const keep = root.dataset.name === name && root.classList.contains('on') ? (root.querySelector('.page') || {}).scrollTop || 0 : 0;
    if (api.checkFeats) api.checkFeats();      // purchases and training are checked for feats whenever a screen is drawn
    if (name !== 'circuit') stopTourneyWatch();
    root.classList.add('on'); screens[name](); root.dataset.name = name;
    if (discordBtn) discordBtn.hidden = name !== 'main';
    { const hs = root.querySelector('.scroll > .helpstrip'); if (hs) { const h = HELP[name === 'armoury' ? 'armoury.' + armTab : name] || HELP[name] || HELP.any; setHelpDefault(hs, h[0], h[1]); } }
    const pg = root.querySelector('.page'); if (pg) pg.scrollTop = keep;
    if (api.onShow) api.onShow(name);
  }

  root.addEventListener('input', (e) => {
    if (e.target.id !== 'musicVol') return;
    const v = +e.target.value; el('musicPct').textContent = v + '%'; if (api.setMusic) api.setMusic(v);
  });
  /** A signed-in player's purchase as the server knows it ("horse:destrier", "retinue:groom", "train:groom"), or null if this click buys nothing. */
  const shopItem = (p, d) => {
    const free = (x) => !(x && x.price > 0);
    if (d.stcapset) return CAPARISONS[d.stcapset] && !free(CAPARISONS[d.stcapset]) && !(p.owned.caparisons || []).includes(d.stcapset) ? 'cap:' + d.stcapset : null;
    const horse = d.stbuy || d.horse; if (horse) return HORSES[horse] && !free(HORSES[horse]) && !p.owned.horses.includes(horse) ? 'horse:' + horse : null;
    if (d.armour) return ARMOURS[d.armour] && !free(ARMOURS[d.armour]) && !p.owned.armours.includes(d.armour) ? 'armour:' + d.armour : null;
    if (d.helm) return HELMS[d.helm] && !free(HELMS[d.helm]) && !p.owned.helms.includes(d.helm) ? 'helm:' + d.helm : null;
    if (d.hire && RETINUE[d.hire]) return RETINUE[d.hire].hire > 0 && !(p.retinue && p.retinue[d.hire]) ? 'retinue:' + d.hire : null;
    if (d.train && p.retinue && p.retinue[d.train]) return trainCost(d.train, p.retinue[d.train]) ? 'train:' + d.train : null;
    return null;
  };
  let serverOk = false;      // set for the one re-run of a click whose purchase the server has made
  const onClick = (e) => {
    const t = e.target.closest('[data-cel],[data-artab],[data-tt],[data-go],[data-cc],[data-cm],[data-act],[data-col],[data-pat],[data-chg],[data-fld],[data-ord],[data-bord],[data-lay],[data-horse],[data-stable],[data-stbuy],[data-armour],[data-helm],[data-lance],[data-hire],[data-train],[data-dismiss],[data-hist],[data-exv],[data-exo],[data-exm],[data-exc],[data-on],[data-onv],[data-onm],[data-onc],[data-stcap],[data-stcapset],[data-skill],[data-ac],[data-lock],[data-fin],[data-roll],[data-body]');
    if (!t) return;
    const p = api.profile, d = t.dataset;
    if (buyOk) buyOk = false;
    else { const ask = buyAsk(p, d); if (ask) { confirmBuy({ title: ask.title, price: ask.price, gold: p.gold, note: ask.note }).then((yes) => { if (yes) { buyOk = true; t.click(); buyOk = false; } }); return; } }
    if (api.account && api.account.signedIn()) {      // gold is the server's: it checks the price and the purse, and answers with the new purse and belongings
      if (serverOk) { serverOk = false; if (d.hire || d.train) return show('armoury'); }
      else { const item = shopItem(p, d); if (item) { api.account.buy(item).then((r) => { if (!r.ok) { api.ui('error'); return show(root.dataset.name); } api.ui('select'); serverOk = true; onClick({ target: t }); serverOk = false; }); return; } }
    }
    api.ui(d.go || d.act || d.tt ? 'select' : 'click');
    if (d.tt) return tourneyAct(d.tt, { p, api, show, here: () => root.dataset.name === 'circuit' });
    if (d.act === 'aimmode') { setAimMode(d.v); return show('settings'); }
    if (d.act === 'aimspeed') { setAimSpeed(d.v); return show('settings'); }
    if (d.lock === 'charter') { const [why, v] = String(d.why || 'store').split(':'); openUpsell({ reason: why, venue: +v || 0, show }); return; }      // free content ends here: the popup
    if (d.lock) { store.focus(d.lock); return show('store'); }      // a pack's piece: the store, at that pack
    if (d.cel) { toggleFav(p, d.cel); if (api.celPreview) api.celPreview(d.cel); api.saveProfile(); return show('armoury'); }
    if (d.fin) { p.finish = d.fin !== 'plain' && store.has('finishes') && PACKS.finishes.finishes[d.fin] ? d.fin : undefined; api.saveProfile(); api.rebuildPlayer(); return show('armoury'); }
    if (d.roll !== undefined) { if (store.has('rolls') && PACKS.rolls.arms[+d.roll]) { p.arms = JSON.parse(JSON.stringify(PACKS.rolls.arms[+d.roll].arms)); api.saveProfile(); api.rebuildPlayer(); } return show('armoury'); }
    if (d.act === 'fullscreen') { if (api.fullscreen) api.fullscreen(); return; }
    if (d.go && overBack) return closeOver();      // Settings opened over the pause menu: Done (or any way out) goes back to the pause menu, not the main menu
    if (d.go) { dismissArm = null; if (d.go === 'online') api.online.open(); return show(d.go); }
    if (d.on) {
      const O = api.online;
      if (d.on === 'create') { O.lobby.note = ''; return O.create(false); }
      if (d.on === 'createpub') return O.create(true);
      if (d.on === 'retry') return O.create(O.lobby.pub, O.lobby.quick);
      if (d.on === 'find') { if (d.ranked === '1' && !(api.account && api.account.signedIn())) return show('account'); return O.find(d.ranked === '1'); }
      if (d.on === 'quick') return O.quick();
      if (d.on === 'list') return O.list();
      if (d.on === 'friend') { O.lobby.phase = 'friend'; O.lobby.err = ''; return show('online'); }
      if (d.on === 'joinlist') return O.joinListed(d.code);
      if (d.on === 'pub') return O.setPublic(d.pub === '1');
      if (d.on === 'back') { joinDraft = ''; return O.back(); }
      if (d.on === 'joinmode') { O.lobby.phase = 'joinInput'; O.lobby.err = ''; return show('online'); }
      if (d.on === 'join') return O.join(joinDraft);
      if (d.on === 'invite') return O.invite();
      if (d.on === 'copy') return O.invite('copy');
      if (d.on === 'ranks') { RK.status = 'idle'; RK.view = 'board'; RK.msg = ''; return show('rankings'); }
      if (d.on === 'rkback') return show('online');
      if (d.on === 'rkview') { RK.view = RK.view === 'recover' ? 'board' : 'recover'; RK.msg = ''; if (RK.view === 'recover' && !RK.code) ranks.recoveryCode().then((c) => { RK.code = c || ''; if (root.dataset.name === 'rankings') show('rankings'); }); return show('rankings'); }
      if (d.on === 'rkuse') { RK.msg = 'Checking…'; show('rankings'); ranks.restore(RK.draft).then((id) => { RK.msg = id ? '' : 'That code did not work, or the rankings are unreachable.'; if (id) { RK.status = 'idle'; RK.code = ''; RK.draft = ''; RK.view = 'board'; } if (root.dataset.name === 'rankings') show('rankings'); }); return; }
      if (d.on === 'ride') return O.ride();
      if (d.on === 'leave') { joinDraft = ''; return O.leave(); }
      return;
    }
    if (d.onv !== undefined) return api.online.setRoom('v', +d.onv);
    if (d.onm) return api.online.setRoom('m', d.onm);
    if (d.onc) return api.online.setRoom('c', +d.onc);
    if (d.body) { const [k, v] = d.body.split('|'); p.body = cleanBody(Object.assign({}, p.body, { [k]: k === 'skin' || k === 'hair' ? +v : v }, k === 'sex' ? { face: -1 } : {})); api.ui('click'); api.setBody(p.body); return show(root.dataset.name === 'welcome' ? 'welcome' : 'armoury'); }
    if (d.act === 'welcome') { p.name = cleanName(wDraft); p.named = true; wDraft = null; api.saveProfile(); api.rebuildPlayer(); return show('main'); }
    if (root.dataset.name === 'welcome' && (d.col || d.pat)) { if (d.col) { const [k, c] = d.col.split('|'); p.arms[k] = c; } else p.arms.pattern = d.pat; api.saveProfile(); api.rebuildPlayer(); return show('welcome'); }
    if (d.act === 'ride') { const t = career.ensureTournament(p), cm = circMode(p), opp = career.myOpponent(t); if (!opp) return; return api.startMatch(t.v, opp, true, false, cm, fixedCourses(cm) || p.courses || 5); }
    if (d.act === 'stnext') { const t = p.season.t; t.card = (t.card || 0) + 1; if (t.card >= (t.v === 0 && p.season.no === 1 && !p.season.log.length && !(p.honours || []).length ? 4 : 3)) { t.phase = 'bracket'; t.card = 0; } api.saveProfile(); return show('circuit'); }
    if (d.act === 'stskip') { const t = p.season.t; t.phase = 'bracket'; t.card = 0; api.saveProfile(); return show('circuit'); }
    if (d.act === 'rideon') { career.rideOn(p); api.saveProfile(); return show('circuit'); }
    if (d.act === 'newseason' || d.act === 'reset') { api.resetCircuit(); return show('circuit'); }
    if (d.act === 'exride' && store.locked.venue(exVenue)) { openUpsell({ reason: 'venue', venue: exVenue, show }); return; }
    if (d.act === 'exride' && !exhibitionAllowed({ show })) return;      // the optional daily cap (off by default, src/upsell.js UPSELL)
    if (d.act === 'exride') return api.startMatch(exVenue, exOpp, false, false, exMode, fixedCourses(exMode) || exCourses);
    if (d.act === 'practice') return api.startPractice((p.lesson || 0) >= LESSONS.length);
    if (d.act === 'herald') { p.herald = d.v !== undefined ? d.v === '1' : p.herald === false; api.saveProfile(); return show('settings'); }
    if (d.act === 'musicon') { if (api.setMusicOff) api.setMusicOff(d.v === '0'); return show('settings'); }
    if (d.act === 'commentary') { api.setCommentary(d.v !== undefined ? d.v === '1' : !(api.commentaryOn ? api.commentaryOn() : true)); return show('settings'); }
    if (d.act === 'replays') { if (api.setReplays) api.setReplays(d.v || 'standard'); return show('settings'); }
    if (d.act === 'chatter') { api.setChatter(d.v !== undefined ? d.v === '1' : !(api.chatterOn ? api.chatterOn() : true)); return show('settings'); }
    if (d.act === 'voices') { api.setVoices(d.v !== undefined ? d.v === '1' : !(api.voicesOn ? api.voicesOn() : true)); return show('settings'); }
    if (d.act === 'diff') { p.difficulty = d.v !== undefined ? +d.v : ((p.difficulty ?? 0) + 1) % DIFFICULTY.length; api.saveProfile(); return show('settings'); }
    if (d.act === 'sfxpack') { const nx = d.v || (sfxPack() === 'new' ? 'old' : 'new'); if (nx === sfxPack()) return; setSfxPack(nx); return location.reload(); }
    if (d.act === 'autoride') { if (d.v !== undefined ? d.v === '1' : p.autoRide === false) delete p.autoRide; else p.autoRide = false; api.saveProfile(); return show('settings'); }
    if (d.act === 'view') { p.firstPerson = d.v !== undefined ? d.v === '1' : !p.firstPerson; api.S.fp = p.firstPerson; api.saveProfile(); return show('settings'); }
    if (d.act) return;
    if (d.skill) { if (skillPoints(p) > 0 && SKILLS[d.skill] && !(p.skills || (p.skills = {}))[d.skill]) { p.skills[d.skill] = 1; api.ui('select'); api.saveProfile(); } return show('skills'); }
    if (d.artab) { armTab = d.artab; return show('armoury'); }
    if (d.exv !== undefined) { exVenue = +d.exv; return show('exhibition'); }
    if (d.exo) { exOpp = d.exo; return show('exhibition'); }
    if (d.exm) { exMode = d.exm; return show('exhibition'); }
    if (d.cc) { p.courses = +d.cc; api.saveProfile(); return show('circuit'); }
    if (d.cm) { p.circMode = d.cm; api.saveProfile(); return show('circuit'); }
    if (d.exc) { exCourses = +d.exc; return show('exhibition'); }
    if (d.stcap) { stableCap = d.stcap; return show('stable'); }
    if (d.stcapset) {
      const c = CAPARISONS[d.stcapset]; if (!c) return;
      if (!p.owned.caparisons) p.owned.caparisons = ['livery', 'none'];
      if (!p.owned.caparisons.includes(c.id)) { if ((p.gold || 0) >= c.price && (p.gold || 0) >= 0) { p.gold -= c.price; p.owned.caparisons.push(c.id); api.ui('select'); } else { api.ui('error'); return show('stable'); } }
      p.caparison = c.id; stableCap = c.id; api.saveProfile(); api.rebuildPlayer(); return show('stable');
    }
    // the blazon editor: every choice is written back in the saved shape (heraldry.js setArmsParts), so old saves, the cloud and online peers read it as before
    if (d.col) { const [k, c] = d.col.split('|'); if (k === 'ordT' || k === 'bordT') setArmsParts(p.arms, { [k]: c }); else { p.arms[k] = c; setArmsParts(p.arms, {}); } }
    if (d.pat) p.arms.pattern = d.pat;
    if (d.fld) setArmsParts(p.arms, { field: d.fld, ...(armsParts(p.arms).lay === 'counter' ? { lay: 'one' } : {}) });
    if (d.ord) { const q = armsParts(p.arms); setArmsParts(p.arms, { ord: d.ord, ordT: q.ord === 'none' ? (p.arms.c2 !== p.arms.c1 ? p.arms.c2 : p.arms.c3) : q.ordT, lay: d.ord === 'none' ? q.lay.replace(/^on/, '') : q.lay === 'counter' ? 'one' : q.lay }); }
    if (d.bord) setArmsParts(p.arms, { bord: d.bord === '1' });
    if (d.lay) setArmsParts(p.arms, { lay: d.lay });
    if (d.chg) setArmsParts(p.arms, { charge: d.chg });
    const buy = (list, id, price) => { if (list.includes(id)) return true; if ((p.gold || 0) >= price) { p.gold -= price; list.push(id); api.ui('select'); return true; } api.ui('error'); return false; };
    if (d.stable) { stableSel = d.stable; return show('stable'); }
    if (d.stbuy) { if (HORSES[d.stbuy] && buy(p.owned.horses, d.stbuy, HORSES[d.stbuy].price)) { p.horse = d.stbuy; api.saveProfile(); api.rebuildPlayer(); } return show('stable'); }
    if (d.horse && buy(p.owned.horses, d.horse, HORSES[d.horse].price)) p.horse = d.horse;
    if (d.armour && buy(p.owned.armours, d.armour, ARMOURS[d.armour].price)) p.armour = d.armour;
    if (d.helm && buy(p.owned.helms, d.helm, HELMS[d.helm].price)) p.helm = d.helm;
    if (d.lance) p.lance = d.lance;
    if (d.hire && RETINUE[d.hire]) { fixRetinue(p); if (!p.retinue[d.hire] && (p.gold || 0) >= RETINUE[d.hire].hire) { p.gold -= RETINUE[d.hire].hire; p.retinue[d.hire] = newMan(d.hire, Object.values(p.retinue).map(x => x.name)); api.ui('select'); } else api.ui('error'); }
    if (d.train && p.retinue && p.retinue[d.train]) { const rec = p.retinue[d.train], cost = trainCost(d.train, rec); if (cost && (p.gold || 0) >= cost) { p.gold -= cost; rec.level++; api.ui('select'); } else api.ui('error'); }
    if (d.dismiss && d.dismiss !== 'squire' && p.retinue && p.retinue[d.dismiss]) { if (dismissArm === d.dismiss) { delete p.retinue[d.dismiss]; dismissArm = null; } else { dismissArm = d.dismiss; return show('armoury'); } }
    dismissArm = null;
    if (d.hist !== undefined && HISTORIC_ARMS[+d.hist]) p.arms = allowedArms(JSON.parse(JSON.stringify(HISTORIC_ARMS[+d.hist].arms)), ownedSkus());
    if (d.col || d.fld || d.ord || d.bord || d.lay || d.chg || d.pat) p.arms = allowedArms(p.arms, ownedSkus());      // a click that slipped past a locked chip still cannot wear a paid piece
    api.saveProfile(); api.rebuildPlayer(); show('armoury');
  };
  root.addEventListener('click', onClick);
  root.addEventListener('mouseover', (e) => { const c = e.target.closest && e.target.closest('[data-cel]'); if (c && api.celPreview && c.dataset.cel !== (api.celPreviewId && api.celPreviewId())) { api.celPreview(c.dataset.cel); root.querySelectorAll('[data-cel].view').forEach(x => x.classList.remove('view')); c.classList.add('view'); } });

  return { show, openOver, closeOver, overOpen: () => !!overBack, root, refreshAudio: () => { if (root.dataset.name === 'settings' && root.classList.contains('on')) show('settings'); }, stableHorse: () => stableSel, stableCap: () => stableCap || 'livery' };
}
