import { HORSES, ARMOURS, KNIGHTS, VENUES, PATTERNS, CHARGES, TINCTURES, ovr, bondLevel, BOND_NAMES, LANCES, DIFFICULTY, HISTORIC_ARMS, ARTS, LESSONS,
  ECON, entryFee, purse, RANKS, rankOf, skillPoints, SKILLS, ACHIEVEMENTS, ACH_GROUPS, ACH_RENOWN, HELMS, MODES, RETINUE, CAPARISONS, TRAITS, RETINUE_UP, newMan, fixRetinue, wageOf, trainCost, menFx } from './data.js';
import { drawCrest, drawFace } from './util.js';
import { GFX, setPref, PREFS } from './gfx.js';
import { featCount } from './achievements.js';
import { ANNOUNCER } from './drama_lines.js';
import * as career from './career.js';
import { BEGIN, VENUES_STORY, OUT_LINES, SEASON_END, fillStory, storyName } from './career_story.js';
import { sfxPack, setSfxPack, SFX_HAS_OLD } from './audio.js';
import * as ranks from './ranks.js';
import { mymusic } from './mymusic.js';
import { ytmusic } from './ytmusic.js';
import { safeName } from './online.js';
import { confirmBuy, buyAsk } from './confirm.js';
let buyOk = false;   // set for the one re-dispatched click after a purchase is confirmed

const el = (id) => document.getElementById(id);
const stat = (name, v) => `<div class="stat"><span>${name}</span><div class="bar"><div style="width:${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%"></div></div></div>`;
const marks = (n) => `${n} mark${Math.abs(n) === 1 ? '' : 's'}`;
/** The purse in words: what you hold, or what you owe. */
export const purseText = (g) => (g || 0) < 0 ? `<span class="debt">In debt ${marks(-g)}</span>` : `Purse: ${marks(g || 0)}`;

/** Your rank and the road to the next: "Rank: Bachelor Knight — 120/240 renown" over a bar. */
export function rankBar(renown) {
  renown = renown || 0; const r = rankOf(renown), here = RANKS[r], next = RANKS[r + 1], f = next ? (renown - here.at) / (next.at - here.at) : 1;
  return `<div class="rankline"><span>Rank: ${here.name} — ${next ? `${renown}/${next.at}` : renown} renown</span><div class="bar"><div style="width:${Math.round(Math.max(0.03, Math.min(1, f)) * 100)}%"></div></div></div>`;
}

let gfxTimer = 0; const gfxStart = GFX.pref;      // the choice this page was loaded with
const gfxChip = () => { const pend = GFX.pref !== gfxStart, nm = (t) => t[0].toUpperCase() + t.slice(1);
  return `Graphics: ${GFX.pref === 'auto' ? 'Auto' + (pend ? '' : ' (' + GFX.tier + ')') : nm(GFX.pref)}${pend ? ' · reloading to apply…' : ''}`; };
export function initMenus(api) {
  const root = el('screen');
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
  const scroll = (cls, html) => `<div class="${cls} scroll"><i class="paper"></i><div class="page">${html}</div></div>`;

  /** "Your own music": songs from the player's own computer, kept in this browser only (src/mymusic.js). */
  const mmMsg = { text: '' };
  const mmNow = () => (mymusic.now && mymusic.now.name ? `Now playing: ${esc(mymusic.now.name)}` : (mymusic.enabled && mymusic.tracks.length ? 'Now playing: (starts with the game)' : ''));
  const ytTitles = {};     // id -> title, filled in while a video plays
  function myMusicBlock() {
    const tr = mymusic.tracks, src = mymusic.source, yt = ytmusic.ids;
    const chip = (k, t) => `<span class="chip ${src === k ? 'sel' : ''}" data-mm="src" data-v="${k}">${t}</span>`;
    const files = `<div class="toggles"><label class="chip" title="Pick audio files from this computer (mp3, m4a, ogg, wav)">Add songs<input type="file" id="mmFile" accept="audio/*" multiple hidden></label>${tr.length ? `<span class="chip" data-mm="next" title="Next song (N)">Next ▸</span>` : ''}</div>
      ${tr.length ? `<div class="mmlist">${tr.map(t => `<div class="mmrow"><span>${esc(t.name)}</span><b data-mm="rm" data-id="${t.id}" title="Remove">✕</b></div>`).join('')}</div>` : ''}
      <div class="mmnow" id="mmNow">${mmNow()}</div><div class="mmnote">Your songs stay in this browser only; they're not uploaded or shared.</div>`;
    const ytp = `<div class="mmlist">${yt.map(id => `<div class="mmrow"><span>${esc(ytTitles[id] || (ytmusic.DEFAULTS[id] || 'youtu.be/' + id))}</span><b data-mm="ytrm" data-id="${id}" title="Remove">✕</b></div>`).join('') || '<div class="mmrow"><span>(empty)</span></div>'}</div>
      <div class="mmadd"><input id="mmLink" placeholder="Paste a YouTube link" autocomplete="off" spellcheck="false"><span class="chip" data-mm="ytadd">Add link</span><span class="chip" data-mm="next" title="Next (N)">Next ▸</span></div>
      <div class="mmnote">Played by YouTube's own player, shown in the corner. Nothing is downloaded.</div>`;
    return `<div class="mymusic"><div class="toggles"><span class="lbl">Music source:</span>${chip('game', 'Game music')}${chip('files', 'My files')}${chip('yt', 'YouTube')}</div>
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

  function main() {
    const p = api.profile, CS = career.ensureCareer(p), pts = skillPoints(p), rank = RANKS[rankOf(p.renown)], started = CS.v > 0 || (CS.t && (CS.t.cur > 0 || CS.t.done)) || CS.log.length > 0, nh = (p.honours || []).length;
    root.innerHTML = scroll('menu', `
      <h1>Tilt</h1><h2>The Jousting Circuit</h2>
      <button class="mplay" data-go="online">Play online<small>Quick match, rooms or a friend</small></button>
      <div class="mgrid">
        <button data-go="circuit">${CS.done ? 'The Season Is Run' : started ? 'Continue the Career' : 'Begin the Career'}</button>
        <button data-go="exhibition">Joust</button>
        <button data-act="practice">${(p.lesson || 0) >= LESSONS.length ? 'Tiltyard Practice' : (p.lesson || 0) > 0 ? 'Continue your Training' : 'Learn to Joust'}</button>
        <button data-go="armoury">Armoury &amp; Retinue</button>
        <button data-go="stable">The Stable</button>
        <button data-go="settings">Settings</button>
      </div>
      <div class="mmore"><span class="chip" data-go="skills">${pts > 0 ? `<em>${pts}</em> ` : ''}Renown &amp; Skills</span><span class="chip" data-go="feats">Feats (${featCount(p).have}/${featCount(p).total})</span><span class="chip" data-go="how">How to joust</span><span class="chip" data-go="account" title="Sign in to keep your purse and belongings on the server and to play ranked">${api.account && api.account.signedIn() ? 'Account: ' + esc(api.account.info().name) : 'Guest: sign in'}</span>${api.touch ? '<span class="chip" data-act="fullscreen">Full screen</span>' : ''}</div>
      <div class="standing"><span>${rank.name}${nh ? ` · ${nh} honour${nh > 1 ? 's' : ''}` : ''}</span><span>${purseText(p.gold)}</span></div>`);
  }

  /** Settings: everything that used to be chips on the main screen, in one place. */
  function settings() {
    const p = api.profile, vol = api.musicVol ? api.musicVol() : 60, voices = !(api.voicesOn && !api.voicesOn());
    const opt = (on, act, label, extra = '', title = '') => `<span class="chip ${on ? 'sel' : ''}" data-act="${act}" ${extra} ${title ? `title="${title}"` : ''}>${label}</span>`;
    const row = (name, ctl) => `<div class="srow"><span class="slabel">${name}</span><span class="sctl">${ctl}</span></div>`;
    root.innerHTML = scroll('menu settings', `
      <div class="stop"><h3>Settings</h3><button class="btn primary" data-go="main">Done</button></div>
      <div class="sgrid">
        <div class="scol"><h5>Play</h5>
          ${row('Difficulty', DIFFICULTY.map((d, i) => opt((p.difficulty ?? 1) === i, 'diff', d.name, `data-v="${i}"`)).join(''))}
          ${row('View', opt(!p.firstPerson, 'view', 'Third person', 'data-v="0"') + opt(!!p.firstPerson, 'view', 'First person', 'data-v="1"'))}
          ${row('After a pass', opt(p.autoRide !== false, 'autoride', 'Ride back for me', 'data-v="1"', 'The horse takes you back to your mark') + opt(p.autoRide === false, 'autoride', 'By hand', 'data-v="0"', 'W/S gait, A/D steer'))}
        </div>
        <div class="scol"><h5>Sound</h5>
          ${row('Herald', opt(p.herald !== false, 'herald', 'Speaks', 'data-v="1"') + opt(p.herald === false, 'herald', 'Silent', 'data-v="0"'))}
          ${row('Voices', opt(voices, 'voices', 'On', 'data-v="1"', 'Robot voices for the king, your men and the sellers') + opt(!voices, 'voices', 'Off', 'data-v="0"'))}
          ${row('Music', `<label class="vol"><input type="range" id="musicVol" min="0" max="100" step="5" value="${vol}"> <span id="musicPct">${vol}%</span></label>`)}
          ${SFX_HAS_OLD ? row('Sound pack', opt(sfxPack() === 'new', 'sfxpack', 'New', 'data-v="new"') + opt(sfxPack() !== 'new', 'sfxpack', 'Old', 'data-v="old"') + '<small>reloads</small>') : ''}
        </div>
      </div>
      <h5>Graphics</h5>
      <div class="srow"><span class="slabel">Quality</span><span class="sctl"><span class="chip" data-act="gfx" title="Auto picks for your device; Low suits old phones. Changing it reloads the page.">${gfxChip().replace('Graphics: ', '')}</span><small>tap to change</small></span></div>
      <h5>Music source</h5>
      ${myMusicBlock()}
      <div class="foot">The speaker button, or M, mutes everything.</div>`);
  }

  /** A name typed by a player: no markup, at most 22 characters, never empty. */
  const cleanName = (v) => (v || '').replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22) || 'Sir Nameless';
  /** First visit: take your name and your colours before anything else. */
  let wDraft = null;
  function welcome() {
    const p = api.profile, a = p.arms; if (wDraft === null) wDraft = '';
    const sw = (key) => `<div class="swatches"><span class="lbl">${{ c1: 'Field', c2: 'Division' }[key]}</span>${TINCTURES.map(t => `<div class="sw ${a[key] === t[1] ? 'sel' : ''}" title="${t[0]}" style="background:${t[1]}" data-col="${key}|${t[1]}"></div>`).join('')}</div>`;
    root.innerHTML = scroll('menu welcome', `
      <h1>Tilt</h1><h2>The Jousting Circuit</h2>
      <p class="wlead">The herald needs a name to cry when you ride in, and the colours you ride under.</p>
      <h5>Your Name</h5><input class="name" id="wName" maxlength="22" placeholder="Sir Roland of Tyre" value="${wDraft.replace(/"/g, '')}" autocomplete="off" spellcheck="false">
      <div class="arms-row"><canvas id="wCrest" width="150" height="178"></canvas><div>
        ${sw('c1')}${sw('c2')}
        <div class="swatches"><span class="lbl">Ordinary</span>${PATTERNS.map(x => `<div class="chip ${a.pattern === x ? 'sel' : ''}" data-pat="${x}">${x}</div>`).join('')}</div>
        <p class="dimtxt">You can change all of this later in the Armoury.</p></div></div>
      <button data-act="welcome">Enter the Lists<small>Take your name to the tiltyard</small></button>`);
    drawCrest(el('wCrest'), a);
    const inp = el('wName'); inp.addEventListener('input', () => { wDraft = inp.value; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="welcome"]').click(); } });
    setTimeout(() => { try { inp.focus(); } catch (e) { /* ignore */ } }, 50);
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
    const res = r ? (r.champion ? 'Champion' : `Out in the ${career.roundName(r.rounds, r.reached).toLowerCase()}`) : now ? 'the lists await' : 'ahead';
    return `<div class="venue ${now ? 'now' : r ? 'done' : ''}"><b>${v.name}</b><i>${v.city} · ${v.year}</i><div class="r">${res}</div>${r ? '' : `<div class="fee">${career.SIZES[i]} knights · purse ${purse(i, 'win', true)}</div>`}</div>`;
  }).join('')}</div>`;
  const rulesBlock = (p) => `<h5>Rules and courses <small>${MODES[circMode(p)].sub}${fixedCourses(circMode(p)) ? ' · courses fixed by the rules' : MODES[circMode(p)].firstBreak ? ' · void if no lance breaks' : ' · level scores run up to two extra courses'}</small></h5><div class="swatches circrules"><span class="lbl">Rules</span>${Object.values(MODES).filter(m => !m.bridge).map(m => `<div class="chip ${m.id === circMode(p) ? 'sel' : ''}" data-cm="${m.id}" title="${m.blurb.replace(/"/g, '&quot;')}">${m.name}</div>`).join('')}<i class="brk"></i><span class="lbl">Courses</span>${fixedCourses(circMode(p)) ? `<div class="chip sel">${fixedCourses(circMode(p))}</div>` : CIRC_COURSES.map(n => `<div class="chip ${n === (p.courses || 5) ? 'sel' : ''}" data-cc="${n}">${n}</div>`).join('')}</div>`;
  const bracketBlock = (p, t) => {
    const cols = [];
    for (let r = 0; r < t.rounds; r++) {
      const ms = t.rnds[r], n = t.size >> (r + 1), box = [];
      for (let i = 0; i < n; i++) {
        const m = ms && ms[i], mine = m && (m.a === 'you' || m.b === 'you'), nxt = mine && !t.done && r === t.cur && m.w == null;
        const row = (id, k) => { const win = m && m.w && m.w === id, sc = m && m.sc ? m.sc[k] : ''; return `<div class="bk ${win ? 'win' : m && m.w ? 'lose' : ''} ${id === 'you' ? 'you' : ''}"><span>${id ? shortName(id, p) : '—'}</span><em>${sc}</em></div>`; };
        box.push(`<div class="bm ${mine ? 'me' : ''} ${nxt ? 'next' : ''}">${row(m ? m.a : null, 0)}${row(m ? m.b : null, 1)}</div>`);
      }
      cols.push(`<div class="rnd ${r === t.cur && !t.done ? 'cur' : ''}"><h6>${career.roundName(t.rounds, r)}</h6><div class="bms">${box.join('')}</div></div>`);
    }
    const champ = t.winner ? `<div class="rnd champ"><h6>Winner</h6><div class="bms"><div class="bm ${t.winner === 'you' ? 'me' : ''}"><div class="bk win"><span>${shortName(t.winner, p)}</span></div></div></div></div>` : '';
    return `<div class="bracket r${t.rounds}">${cols.join('')}${champ}</div>`;
  };
  function circuit() {
    const p = api.profile, S = career.ensureCareer(p);
    if (S.done) return seasonEnd(p, S);
    const t = career.ensureTournament(p), V = VENUES[t.v], host = KNIGHTS.find(k => k.id === V.host), name = storyName(p);
    const vars = { name, venue: V.name, city: V.city, host: host.name, hostShort: host.short, next: (VENUES[t.v + 1] || {}).name || '', nextCity: (VENUES[t.v + 1] || {}).city || '' };
    const ST = VENUES_STORY[V.id] || VENUES_STORY.smithfield;
    api.setVenue(t.v);
    if (t.phase === 'arrive') {
      const first = S.no === 1 && t.v === 0 && !S.log.length && !(p.honours || []).length;
      const cards = (first ? [['The Road', BEGIN]] : []).concat([[`Arriving at ${V.name}`, ST.arrive], ['What Is At Stake', ST.stakes], ['The Man To Beat', ST.rival]]);
      const ci = Math.min(t.card || 0, cards.length - 1), card = cards[ci], lastCard = ci === cards.length - 1;
      root.innerHTML = scroll('sheet', `<div class="top"><div><h3>${V.name}</h3><p>${V.city}, ${V.year}. ${S.migrated && first ? 'Your old league table is retired: the career is now a season of tournaments.' : ''}</p></div>
        <div class="actions"><button class="btn" data-go="main">Back</button><button class="btn" data-act="stskip">Skip</button><button class="btn primary" data-act="stnext">${lastCard ? 'See the Draw' : 'Continue'}</button></div></div>
        <div class="story"><h5>${card[0]} <small>${ci + 1} of ${cards.length}</small></h5>${fillStory(card[1], vars).map(l => `<p>${l}</p>`).join('')}</div>${honoursBlock(p)}`);
      return;
    }
    if (t.phase === 'over') {
      const won = t.champion, kind = t.reached === 0 ? 'first' : t.reached >= t.rounds - 1 ? 'final' : 'mid', lastV = t.v >= VENUES.length - 1;
      const out = fillStory(OUT_LINES[kind], Object.assign(vars, { round: career.roundName(t.rounds, t.reached).toLowerCase(), winner: fullName(t.winner, p) }));
      const road = fillStory(ST.road[won ? 'won' : 'lost'], vars);
      const lines = (won ? [`${name} wins the final, and the tournament at ${V.name}.`, `The honour is his: <b>Champion of ${V.name}</b>.`] : out).concat(road);
      root.innerHTML = scroll('sheet', hughBox(won ? 'Champion' : 'The Tournament Ends', won ? 'Well ridden. I will cry it myself.' : 'It ends here. The purse for the round you reached is paid.',
        `<button class="btn" data-go="main">Back</button><button class="btn primary" data-act="rideon">${lastV ? 'End the Season' : `Ride on to ${vars.next}`}</button>`)
        + `<div class="story"><h5>${won ? 'The Honour' : 'The Road Onward'}</h5>${lines.map(l => `<p>${l}</p>`).join('')}</div>${bracketBlock(p, t)}${honoursBlock(p)}${roadBlock(p, S)}`);
      faces(); return;
    }
    const opp = career.myOpponent(t), ko = career.knightById(opp), pf = career.purseFactor(t.rounds, t.cur), rn = career.roundName(t.rounds, t.cur), left = t.size >> t.cur;
    root.innerHTML = scroll('sheet', hughBox(`${V.name}: ${rn}`,
      `${left} knights remain. You meet <b>${ko.name}</b>, of ${ko.land}${p.lostTo && p.lostTo[opp] ? ', who has beaten you before' : ''}.<br>${t.cur === 0 ? `Entry costs ${marks(entryFee(t.v))}. ` : ''}Win this round for ${marks(Math.round(purse(t.v, 'win', true) * pf))}${t.cur === t.rounds - 1 ? ' and the honour' : ''}. ${purseText(p.gold)}.`,
      `<button class="btn" data-go="main">Back</button><button class="btn primary" data-act="ride">Ride to the Lists</button>`)
      + bracketBlock(p, t) + rulesBlock(p) + honoursBlock(p) + roadBlock(p, S));
    faces();
  }
  function seasonEnd(p, S) {
    const won = (p.honours || []).filter(h => h.season === S.no), n = won.length, lines = fillStory(n === VENUES.length ? SEASON_END.all : n ? SEASON_END.some : SEASON_END.none, { n, s: n === 1 ? '' : 's' });
    root.innerHTML = scroll('sheet', hughBox('The Season Is Run', lines.join(' '), `<button class="btn" data-go="main">Back</button><button class="btn primary" data-act="newseason">Begin a New Season</button>`)
      + `<div class="story"><h5>The Season</h5>${S.log.map(r => `<p><b>${VENUES[r.v].name}</b>: ${r.champion ? 'Champion.' : `out in the ${career.roundName(r.rounds, r.reached).toLowerCase()}; won by ${fullName(r.winner, p)}.`}</p>`).join('')}</div>${honoursBlock(p)}${roadBlock(p, S)}`);
    faces();
  }

  function exhibition() {
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Joust</h3><p>Choose the lists and the knight you will run against. No entry fee and no ransom; the purse is ${marks(purse(0, 'win', false))}.</p></div>
      <div class="actions"><button class="btn" data-go="main">Back</button><button class="btn primary" data-act="exride">Ride</button></div></div>
      <h5>The Joust</h5><div class="grid">${Object.values(MODES).map(m => `<div class="pick ${m.id === exMode ? 'sel' : ''}" data-exm="${m.id}"><b>${m.name}</b><em>${m.sub}</em><p>${m.blurb}${m.kitNote ? ' ' + m.kitNote : ''}</p></div>`).join('')}</div>
      <h5>Courses <small>${fixedCourses(exMode) ? (MODES[exMode].bridge ? 'Three against each challenger' : MODES[exMode].fixedCourses ? 'Fixed by the rules of the joust' : 'Fixed at four by the statutes') : MODES[exMode].firstBreak ? 'the joust is void if no lance breaks in this many' : 'level scores run up to two extra courses'}</small></h5><div class="swatches">${fixedCourses(exMode) ? `<div class="chip sel">${fixedCourses(exMode)}</div>` : EX_COURSES.map(n => `<div class="chip ${n === exCourses ? 'sel' : ''}" data-exc="${n}">${n}</div>`).join('')}</div>
      <h5>The Lists</h5><div class="grid">${VENUES.map((v, i) => `<div class="pick ${i === exVenue ? 'sel' : ''}" data-exv="${i}"><b>${v.name}</b><em>${v.year}</em><p>${v.city}. ${v.blurb}</p></div>`).join('')}</div>
      <h5>Your Opponent${MODES[exMode].bridge ? ' <small>one of the three challengers, in order of skill; the rest are drawn</small>' : ''}</h5><div class="grid">${KNIGHTS.map(k => `<div class="pick ${k.id === exOpp ? 'sel' : ''}" data-exo="${k.id}">${crest(k.arms, 30, 36)} <span class="ovr">${ovr(k)}</span><b>${k.short}</b><em>${k.land}</em><p>${k.name} — ${HORSES[k.horse].name}, ${HELMS[ARMOURS[k.armour].helm].name}, ${ARMOURS[k.armour].name}</p>${stat('Aim', k.skill)}${stat('Seat', k.seat)}${stat('Drive', k.drive)}</div>`).join('')}</div>`);
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
    const summary = () => `<p class="dimtxt">${V.name}, ${V.city} · ${MODES[room.m].name} · ${fixed || room.c} courses &nbsp;(the host chooses)</p>`;
    const friendRow = () => fr ? `<div class="friend">${crest(fr.arms, 30, 36)}<span><b>${fr.name}</b> <i>${fr.rank ? '· ' + fr.rank.text + ' · ' + fr.rank.h2h : fr.land ? '· ' + fr.land : ''}</i></span></div>` : '';
    let head = 'Ride against a real opponent. No account needed.', actions = '<button class="btn" data-on="back">Back</button>' + (ph === 'choose' ? '<button class="btn" data-on="ranks">Rankings</button>' : ''), body = '';
    const rows = () => {
      const rs = L.rooms.slice(0, 5), rl = L.relays || {};
      if (!rs.length) return `<p class="wait">${rl.failed ? 'Could not reach the lobby. Check your connection, or use Joust a friend.' : rl.open ? 'No open rooms yet: create one or try Quick match.' : 'Connecting to the lobby…'}</p>`;
      return `<div class="rooms">${rs.map(r => `<div class="rrow"><b>${r.name}</b><span>${VENUES[r.v].name}</span><span>${MODES[r.m].name}</span><span>${r.c} courses</span><button class="btn primary" data-on="joinlist" data-code="${r.code}">Join</button></div>`).join('')}</div>${L.rooms.length > 5 ? `<p class="dimtxt">and ${L.rooms.length - 5} more</p>` : ''}`;
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
        <p class="dimtxt">${mv.name}, ${mv.city} · ${(MODES[m.mode] || MODES.planken).name} · ${m.courses} courses · ${m.ranked ? 'ranked' : 'unranked'}</p>`;
    } else if (ph === 'choose') {
      head = 'Ride against a real opponent. No account needed for friend rooms.';
      body = `${L.err ? `<p class="err">${esc(L.err)}</p>` : ''}<div class="onrow"><button class="btn primary big" data-on="find" data-ranked="0">Find match<small>Unranked: paired by rating, friendly</small></button><button class="btn big" data-on="find" data-ranked="1">Ranked match<small>${api.account && api.account.signedIn() ? 'Rated, and it pays a purse' : 'Sign in to play ranked'}</small></button></div>
        <div class="onrow three"><button class="btn primary big" data-on="quick">Quick match<small>Join the next open room, or wait for a challenger</small></button><button class="btn big" data-on="list">Public rooms<small>See who is waiting, and pick a room</small></button><button class="btn big" data-on="friend">Joust a friend<small>A private room: share the code</small></button></div>
        <p class="dimtxt">You ride with your own arms, horse and harness; nothing is paid, and no renown is won. Only your chosen name is shown to others.</p>`;
    } else if (ph === 'friend') {
      head = 'Make a private room and share its code, or type your friend\'s code.';
      body = `<div class="onrow"><button class="btn primary big" data-on="create">Create a room<small>You get a code to share</small></button><button class="btn big" data-on="joinmode">Join a room<small>Type your friend's code</small></button></div>`;
    } else if (ph === 'list') {
      head = 'Open public rooms. Pick one to join.';
      actions = '<button class="btn" data-on="back">Back</button><button class="btn" data-on="createpub">Create a room</button>';
      body = `${L.err ? `<p class="err">${L.err}</p>` : ''}${rows()}`;
    } else if (ph === 'quickLook') {
      head = 'Quick match'; actions = '<button class="btn" data-on="back">Cancel</button>';
      body = '<p class="wait">Looking for an open room…</p>';
    } else if (host) {
      const pubRow = () => `<h5>Who can see this room</h5><div class="swatches"><span class="chip ${L.pub ? '' : 'sel'}" data-on="pub" data-pub="0">Private</span><span class="chip ${L.pub ? 'sel' : ''}" data-on="pub" data-pub="1">Public</span><small class="dimtxt">${L.pub ? 'Listed in Public rooms until a challenger arrives' : 'Only someone with the code can join'}</small></div>`;
      head = ph === 'hostReady' ? `${fr.name} has joined. Choose the lists and the rules, then ride.` : L.quick ? 'Quick match' : L.pub ? 'Your room is listed in Public rooms.' : 'Share this code with your friend.';
      actions = `<button class="btn" data-on="back">${ph === 'hostReady' ? 'Back' : 'Cancel'}</button>${ph === 'hostReady' ? '<button class="btn primary" data-on="ride">Ride!</button>' : ''}`;
      if (L.quick && ph === 'hostWait') body = `<p class="wait big">${L.code ? 'Waiting for a challenger…' : 'Opening a room…'}</p><p class="dimtxt">No open room was found, so yours is listed: ${V.name} · ${MODES[room.m].name} · ${fixed || room.c} courses</p>`;
      else body = `<div class="roomcode"><span>ROOM CODE</span><b>${L.code || '·····'}</b></div>
        ${ph === 'hostReady' ? friendRow() : `<p class="wait">${L.code ? (L.pub ? 'Waiting for a challenger…' : 'Waiting for your friend…') : 'Opening the room…'}</p>${pubRow()}`}
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
      body = `${friendRow()}<p class="wait">Waiting for ${fr ? fr.name : 'the host'} to start the joust…</p>${summary()}`;
    } else {      // failed
      head = 'The room could not be opened.';
      body = `<p class="err">${L.err}</p><div class="onrow"><button class="btn primary" data-on="retry">Try again</button></div>`;
    }
    root.innerHTML = scroll('sheet online', `<div class="top"><div><h3>Play Online</h3><p>${head}</p></div><div class="actions">${actions}</div></div>${body}`);
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

  function armoury() {
    const p = api.profile, a = p.arms, broke = (p.gold || 0) < 0;
    const sw = (key) => `<div class="swatches"><span class="lbl">${{ c1: 'Field', c2: 'Division', c3: 'Charge' }[key]}</span>${TINCTURES.map(t => `<div class="sw ${a[key] === t[1] ? 'sel' : ''}" title="${t[0]}" style="background:${t[1]}" data-col="${key}|${t[1]}"></div>`).join('')}</div>`;
    const pv = (kind, id) => `<canvas class="pv" data-pv="${kind}:${id}"></canvas>`;
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Armoury &amp; Retinue</h3><p><b>${purseText(p.gold)}</b>${(p.honours || []).length ? ` · Honours: ${career.honoursLine(p)}` : ''}${broke ? ' — you can buy nothing until the debt is cleared.' : ''}</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Done</button></div></div>
      <h5>Your Horse <small>stabling is charged at each circuit tourney</small> <span class="chip" data-go="stable">Visit the stable</span></h5><p>Caparison: ${(CAPARISONS[p.caparison] || CAPARISONS.livery).name} — change it in the Stable.</p><div class="grid">${Object.values(HORSES).map(h => `<div class="pick ${p.horse === h.id ? 'sel' : ''}" data-horse="${h.id}">${pv('horse', h.id)}<b>${h.name}</b><em class="${p.owned.horses.includes(h.id) ? 'own' : (p.gold || 0) < h.price ? 'cost cant' : 'cost'}">${p.owned.horses.includes(h.id) ? (p.horse === h.id ? 'Riding' : 'Owned') + ' · bond ' + BOND_NAMES[bondLevel((p.bond || {})[h.id])] : marks(h.price)}</em><p>${h.blurb} Keep: ${marks(ECON.keep[h.id] ?? 2)}.</p>${stat('Speed', (h.top - 7.2) / 2)}${stat('Accel', h.accel / 3.7)}${stat('Shock', (h.mass - 0.7) / 0.6)}${stat('Smooth', h.steady)}${stat('Temper', h.nerve)}${stat('Wind', h.stamina)}</div>`).join('')}</div>
      <h5>Your Helm <small>bought and worn on its own; it decides what you see</small></h5><div class="grid">${Object.values(HELMS).map(h => `<div class="pick ${p.helm === h.id ? 'sel' : ''}" data-helm="${h.id}">${pv('helm', h.id)}<b>${h.name}</b><em class="${p.owned.helms.includes(h.id) ? 'own' : (p.gold || 0) < h.price ? 'cost cant' : 'cost'}">${p.owned.helms.includes(h.id) ? (p.helm === h.id ? 'Worn' : 'Owned') : marks(h.price)}</em><p>${h.blurb}</p>${stat('Protect', h.protection)}${stat('Vision', h.vision)}${stat('Light', 1.15 - h.kg / 10)}</div>`).join('')}</div>
      <h5>Your Harness <small>body armour; the armourer mends it after every joust</small></h5><div class="grid">${Object.values(ARMOURS).map(r => `<div class="pick ${p.armour === r.id ? 'sel' : ''}" data-armour="${r.id}">${pv('armour', r.id)}<b>${r.name}</b><em class="${p.owned.armours.includes(r.id) ? 'own' : (p.gold || 0) < r.price ? 'cost cant' : 'cost'}">${p.owned.armours.includes(r.id) ? (p.armour === r.id ? 'Worn' : 'Owned') : marks(r.price)}</em><p>${r.blurb}</p>${stat('Protect', r.protection)}${stat('Light', 1.9 - r.weight * 1.2)}</div>`).join('')}</div>
      <h5>Your Lance <small>you pay for every lance you break</small></h5><div class="grid">${Object.values(LANCES).map(l => `<div class="pick lance ${(p.lance || 'standard') === l.id ? 'sel' : ''}" data-lance="${l.id}">${pv('lance', l.id)}<b>${l.name}</b><em>${marks(ECON.lance[l.id])} each (less in long matches)</em><p>${l.blurb}</p>${stat('Shock', (l.power - 0.7) / 0.5)}${stat('Steady', 1.55 - l.sway)}${stat('Arm', 1.2 - l.fatigue * 0.55)}</div>`).join('')}</div>
      <h5>Your Retinue <small>hired once; each draws his wage at every circuit tourney</small></h5><div class="grid">${Object.keys(RETINUE).map(id => manCard(p, id)).join('')}</div>
      <h5>Your Name</h5><input class="name" id="nameIn" maxlength="22" value="${p.name.replace(/"/g, '')}">
      <h5>Blazon</h5><div class="arms-row"><canvas id="crestBig" width="300" height="356"></canvas><div>
        ${sw('c1')}${sw('c2')}${sw('c3')}
        <div class="swatches"><span class="lbl">Ordinary</span>${PATTERNS.map(x => `<div class="chip ${a.pattern === x ? 'sel' : ''}" data-pat="${x}">${x}</div>`).join('')}</div>
        <div class="swatches"><span class="lbl">Charge</span>${CHARGES.map(x => `<div class="chip ${(a.charge || 'none') === x ? 'sel' : ''}" data-chg="${x}">${x}</div>`).join('')}</div>
        <div class="swatches"><span class="lbl">Historic</span>${HISTORIC_ARMS.map((h, i) => `<div class="chip" title="${h.note}" data-hist="${i}">${h.name}</div>`).join('')}</div></div></div>`);
    drawCrest(el('crestBig'), a); faces();
    el('nameIn').addEventListener('change', (e) => { p.name = cleanName(e.target.value); e.target.value = p.name; api.saveProfile(); });
  }

  function skills() {
    const p = api.profile, r = rankOf(p.renown), pts = skillPoints(p), next = RANKS[r + 1], here = RANKS[r];
    const frac = next ? ((p.renown || 0) - here.at) / (next.at - here.at) : 1;
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Renown &amp; Skills</h3>
      <p>Every joust adds to your name: more for a win, for each lance broken, for a stroke on the helm, for an unhorsing and for the gallery's favour. Each new rank lets you learn one skill. ${pts > 0 ? `<b>You have ${pts} skill${pts > 1 ? 's' : ''} to learn — choose below.</b>` : next ? `The next comes at ${next.at} renown.` : 'You have reached the highest rank.'}</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Back</button></div></div>
      <div class="renown"><span>${here.name}</span><div class="bar"><div style="width:${Math.round(Math.max(0.02, Math.min(1, frac)) * 100)}%"></div></div><span>${next ? `${p.renown || 0} / ${next.at} · ${next.name}` : `${p.renown || 0} renown`}</span></div>
      <h5>Skills</h5><div class="skills">${Object.entries(SKILLS).map(([id, s]) => { const known = (p.skills || {})[id], open = !known && pts > 0;
        return `<div class="skill ${known ? 'known' : open ? 'open' : 'locked'}" ${open ? `data-skill="${id}"` : ''}><em>${known ? 'Learned' : open ? 'Learn' : 'Next rank'}</em><b>${s.name}</b><span>${s.text}</span></div>`; }).join('')}</div>
      <h5>The Ranks</h5><table class="tbl"><tr><th>Rank</th><th>Renown</th><th></th></tr>${RANKS.map((k, i) => `<tr class="${i === r ? 'me' : ''}"><td>${k.name}</td><td>${k.at}</td><td>${i === 0 ? '' : i <= r ? 'one skill earned' : 'one skill'}</td></tr>`).join('')}</table>
      <h5>The Hidden Arts</h5><p>These are not learned but found. Arts you discover in the lists are listed here.</p>
      <div class="arts">${Object.entries(ARTS).map(([id, a]) => (p.arts || {})[id] ? `<div class="art known"><b>${a.name}</b><span>${a.text}</span></div>` : `<div class="art unknown"><b>? ? ?</b><span>Not yet discovered.</span></div>`).join('')}</div>`);
  }

  function how() {
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>The Art of the Joust</h3>
      <p><i>King Duarte of Portugal wrote that jousters fail for four reasons: lack of <b>sight</b>, lack of control of the <b>lance</b>, lack of control of the <b>horse</b>, and lack of <b>will</b>. Every course you run is judged on those four.</i></p></div>
      <div class="actions"><button class="btn primary" data-go="main">Back</button></div></div>
      <div class="two"><div><h5>Controls</h5><div class="keys">
        <kbd>W</kbd><span>Before the course: raise your lance to show you are ready, then wait for the marshal's call and tap again to ride. While riding, each tap climbs a gait: walk, trot, canter, gallop. At the gallop, tap in time with the stride (the pulsing ring) to keep him collected.</span>
        <kbd>H</kbd><span>Raise or lower your visor (bascinet and armet). A raised visor gives a clear view, but a blow to the helm hurts twice as much. With a great helm or frog-mouth, take the helm off or put it on between courses.</span>
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
        <kbd>M</kbd><span>Sound on or off. Esc pauses; Backspace while paused leaves the lists.</span></div>
        <h5>The Cheque</h5>
        <p>Attaint (a touch) 1 · Lance broken 2 · Broken on the helm 3 · Unhorsing wins the match.<br>Hit the tilt −2 · Hit a horse −3, and twice loses you the prize.<br>
        Ride on with your lance still low −1. Five courses by default (you choose three to fifteen on the circuit screen, three to twenty in a joust); level cheques run extra courses.</p>
        <h5>The Jousts</h5>
        ${Object.values(MODES).map(m => `<p><b>${m.name}</b> (${m.sub}). ${m.blurb}${m.kitNote ? ' ' + m.kitNote : ''}</p>`).join('')}</div>
      <div><h5>Technique</h5>
        <p><b>Lower it late and gently.</b> "Like a clock weight," wrote Quijada de Reayo. Couch too early and your arm tires and the point wanders; too late and it is still settling in the rest when you meet.</p>
        <p><b>Speed is the shock.</b> A lance only breaks if you bring weight and pace to it. But the faster the gallop, the more the point bounces — a smooth horse and a collected stride steady it.</p>
        <p><b>Ride the tilt.</b> Stay straight and close. A nervous horse will shy from the barrier and the roar of the stands.</p>
        <p><b>Raise it after.</b> The moment your stroke is given, let go and the lance goes upright. Do it at once and the gallery marks a rider in command of his lance; ride on with the point low and the marshal marks it against you.</p>
        <p><b>Hit it square.</b> A point that meets armour at a flat angle skids off: it may slide on to the next thing along, or away into the air. The middle of the shield is the surest; the helm sheds most strokes that are not dead on.</p>
        <p><b>Don't flinch.</b> Thrust (SPACE) at the instant of the shock and you hit harder and sit firmer. In the frog-mouth helm, sitting up to take the blow hides your sight.</p>
        <h5>The Purse</h5>
        <p>Money is counted in marks. A circuit tourney pays a <b>prize purse</b> that grows from venue to venue, and the gallery adds a gift if you have won its favour. Against that you pay the <b>entry fee</b>, your squires and stabling, every <b>lance you break</b>, and the armourer and horse-leech for the hurts of the day.</p>
        <p><b>Ransom.</b> By the old custom of the tourney, a knight put out of the saddle forfeits horse and harness and must buy them back. Unhorse your man on the circuit and he pays you a fifth of their worth; be unhorsed and you pay it. A rich harness is a rich ransom.</p>
        <p>If the purse runs dry the moneylenders carry you, up to ${marks(ECON.debtCap)}. In debt you may still ride, but you can buy nothing. A joust has no fee and no ransom.</p>
        <h5>The Crowd</h5>
        <p><b>The commons</b> at the rails love a hard shock: break lances and unhorse your man and they will chant your name, and their roar rattles your opponent's aim. They jeer a miss.<br>
        <b>The gallery</b> — the court, the ladies, the clergy — prizes skill and courtesy: salute them, strike the helm, keep your strokes fair. Win them and a lady may drop her sleeve, and the court adds a gift to your purse. Strike a horse and they turn their backs.</p>
        <div id="musicCredits"></div></div></div>`);
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
    const rows = Object.values(HORSES).map(x => `<div class="pick ${x.id === h.id ? 'sel' : ''}" data-stable="${x.id}"><b>${x.name}</b><em class="${owned(x.id) ? 'own' : (p.gold || 0) < x.price ? 'cost cant' : 'cost'}">${p.horse === x.id ? 'Riding' : owned(x.id) ? 'Owned' : marks(x.price)}</em><p>${x.blurb}</p></div>`).join('');
    root.innerHTML = scroll('sheet stablescr', `<div class="top"><div><h3>The Stable</h3><p><b>${purseText(p.gold)}</b> · drag to turn the horse</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Done</button></div></div>
      <div class="stbody"><div class="stlist">${rows}</div>
      <div class="stview"><canvas id="stableView"></canvas>
        <div class="stcap"><h5>Caparison</h5><div class="swatches">${capBtns}</div><p>${cap.blurb} ${capAct}</p></div>
        <div class="stinfo"><div class="sthead"><div><h4>${h.name}</h4><p>${h.blurb}</p>${mine ? `<p class="bondline">Bond with you: <b>${BOND_NAMES[lvl]}</b> of IV</p>` : ''}<p class="bondline">Keep: ${marks(ECON.keep[h.id] ?? 2)} at each circuit tourney.</p></div><div class="stact">${act}${why}</div></div>
          <div class="stbars">${stat('Top speed', (h.top - 7.2) / 2)}${stat('Acceleration', h.accel / 3.7)}${stat('Shock weight', (h.mass - 0.7) / 0.6)}${stat('Smoothness', h.steady)}${stat('Nerve', h.nerve)}${stat('Stamina', h.stamina)}</div></div></div></div>`);
  }

  /** The feats: a grid of seals. Earned ones in colour with their date, the rest greyed with what they ask; hidden ones are ??? until earned. */
  function feats() {
    const p = api.profile, got = p.achievements || {}, fc = featCount(p);
    const seal = (a) => {
      const d = got[a.id], hid = a.hidden && !d;
      return `<div class="feat ${d ? 'got' : 'no'}"><i class="seal">${d ? '✦' : hid ? '?' : ''}</i><b>${hid ? '? ? ?' : a.name}</b><span>${hid ? 'A hidden feat. It is found, not sought.' : a.text}</span><em>${d ? `${d} · +${a.renown ?? ACH_RENOWN} renown` : ''}</em></div>`;
    };
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Feats &amp; Honours</h3>
      <p>${fc.have} of ${fc.total} earned. Feats are honours only: they give no strength in the lists, just a little renown to remember them by. Some are not written down until you earn them.</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Back</button></div></div>
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
    root.innerHTML = scroll('sheet ranksscr', `<div class="top"><div><h3>Rankings</h3><p>Online matches only. A “?” marks a rating still settling (under 10 matches).</p></div><div class="actions"><button class="btn" data-on="rkback">Back</button><button class="btn" data-on="rkview">${R.view === 'recover' ? 'Top 100' : 'Recovery code'}</button></div></div>${mine}${body}`);
    const inp = el('rkIn'); if (inp) inp.addEventListener('input', () => { R.draft = inp.value; });
  }
  // ---- the account: sign in with Google or Discord (a guest plays everything offline; ranked play and the shared purse need an account)
  let PV = null;      // which sign-ins the server has switched on
  function accountScreen() {
    const A = api.account, me = A.info(), msg = A.message();
    if (!PV) A.providers().then((v) => { PV = v || { google: false, discord: false, dev: false, off: true }; if (root.dataset.name === 'account') show('account'); });
    const pb = (id, label) => `<button class="btn big ${PV && PV[id] ? 'primary' : ''}" data-ac="${id}">${label}<small>${!PV ? 'Checking…' : PV[id] ? 'Opens ' + label.replace('Sign in with ', '') + "'s own sign-in page" : 'Sign-in coming soon'}</small></button>`;
    const body = me ? `<p>Signed in as <b>${esc(me.name)}</b> (${esc(me.provider)}). Your purse, renown and belongings are kept on the server, so they follow you to any browser.</p>
        <p class="dimtxt">Ranked play: ${me.rid ? 'ready' : 'not yet tied to a rank key on this browser (use the recovery code under Rankings)'}.</p><div class="onrow"><button class="btn" data-ac="out">Sign out</button></div>`
      : `<p>You are playing as a guest: everything works offline, and friend rooms and unranked matches are open to you. An account keeps your purse and belongings safe on the server, so nobody can edit them, and lets you play <b>ranked</b> matches.</p>
        <p class="dimtxt">Your guest belongings are offered to the account once, at your first sign-in (up to 500 marks and a fair share of your gear).</p>
        <div class="onrow">${pb('google', 'Sign in with Google')}${pb('discord', 'Sign in with Discord')}</div>
        ${PV && PV.dev ? `<h5>Development sign-in <small>local server only</small></h5><div class="joinrow"><input class="name" id="devUser" maxlength="22" value="Dev Knight" autocomplete="off"><button class="btn primary" data-ac="dev">Dev sign-in</button></div>` : ''}`;
    root.innerHTML = scroll('sheet online', `<div class="top"><div><h3>Account</h3><p>${me ? 'Your account' : 'Sign in'}</p></div><div class="actions"><button class="btn" data-ac="back">Back</button></div></div>${msg ? `<p class="${/fail|cancel|could not|belongs/i.test(msg) ? 'err' : 'wait'}">${esc(msg)}</p>` : ''}${body}`);
  }
  const screens = { main, settings, circuit, exhibition, online, armoury, skills, how, stable, feats, welcome, rankings, account: accountScreen };
  function show(name) {
    if (name === 'main' && api.profile.named === false) name = 'welcome';      // first visit: your name before anything else
    // re-drawing the screen you are on keeps your place on the page
    const keep = root.dataset.name === name && root.classList.contains('on') ? (root.querySelector('.page') || {}).scrollTop || 0 : 0;
    if (api.checkFeats) api.checkFeats();      // purchases and training are checked for feats whenever a screen is drawn
    root.classList.add('on'); screens[name](); root.dataset.name = name;
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
    const t = e.target.closest('[data-go],[data-cc],[data-cm],[data-act],[data-col],[data-pat],[data-chg],[data-horse],[data-stable],[data-stbuy],[data-armour],[data-helm],[data-lance],[data-hire],[data-train],[data-dismiss],[data-hist],[data-exv],[data-exo],[data-exm],[data-exc],[data-on],[data-onv],[data-onm],[data-onc],[data-stcap],[data-stcapset],[data-skill],[data-ac]');
    if (!t) return;
    const p = api.profile, d = t.dataset;
    if (buyOk) buyOk = false;
    else { const ask = buyAsk(p, d); if (ask) { confirmBuy({ title: ask.title, price: ask.price, gold: p.gold, note: ask.note }).then((yes) => { if (yes) { buyOk = true; t.click(); buyOk = false; } }); return; } }
    if (api.account && api.account.signedIn()) {      // gold is the server's: it checks the price and the purse, and answers with the new purse and belongings
      if (serverOk) { serverOk = false; if (d.hire || d.train) return show('armoury'); }
      else { const item = shopItem(p, d); if (item) { api.account.buy(item).then((r) => { if (!r.ok) { api.ui('error'); return show(root.dataset.name); } api.ui('select'); serverOk = true; onClick({ target: t }); serverOk = false; }); return; } }
    }
    if (d.ac) {
      const A = api.account; A.clearMessage();
      if (d.ac === 'back') return show('main');
      if (d.ac === 'out') { A.signOut(); return; }
      if (d.ac === 'dev') { const u = el('devUser'); A.signIn('dev', u ? u.value : '').then((err) => { if (err) { A.fail(err); show('account'); } }); return; }
      A.providers().then((v) => { if (!v || !v[d.ac]) return show('account'); A.signIn(d.ac).then((err) => { if (err) { A.fail(err); show('account'); } }); });
      return;
    }
    api.ui(d.go || d.act ? 'select' : 'click');
    if (d.act === 'fullscreen') { if (api.fullscreen) api.fullscreen(); return; }
    if (d.go) { dismissArm = null; if (d.go === 'online') api.online.open(); return show(d.go); }
    if (d.on) {
      const O = api.online;
      if (d.on === 'create') return O.create(false);
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
    if (d.act === 'welcome') { p.name = cleanName(wDraft); p.named = true; wDraft = null; api.saveProfile(); api.rebuildPlayer(); return show('main'); }
    if (root.dataset.name === 'welcome' && (d.col || d.pat)) { if (d.col) { const [k, c] = d.col.split('|'); p.arms[k] = c; } else p.arms.pattern = d.pat; api.saveProfile(); api.rebuildPlayer(); return show('welcome'); }
    if (d.act === 'ride') { const t = career.ensureTournament(p), cm = circMode(p), opp = career.myOpponent(t); if (!opp) return; return api.startMatch(t.v, opp, true, false, cm, fixedCourses(cm) || p.courses || 5); }
    if (d.act === 'stnext') { const t = p.season.t; t.card = (t.card || 0) + 1; if (t.card >= (t.v === 0 && p.season.no === 1 && !p.season.log.length && !(p.honours || []).length ? 4 : 3)) { t.phase = 'bracket'; t.card = 0; } api.saveProfile(); return show('circuit'); }
    if (d.act === 'stskip') { const t = p.season.t; t.phase = 'bracket'; t.card = 0; api.saveProfile(); return show('circuit'); }
    if (d.act === 'rideon') { career.rideOn(p); api.saveProfile(); return show('circuit'); }
    if (d.act === 'newseason' || d.act === 'reset') { api.resetCircuit(); return show('circuit'); }
    if (d.act === 'exride') return api.startMatch(exVenue, exOpp, false, false, exMode, fixedCourses(exMode) || exCourses);
    if (d.act === 'practice') return api.startPractice((p.lesson || 0) >= LESSONS.length);
    if (d.act === 'herald') { p.herald = d.v !== undefined ? d.v === '1' : p.herald === false; api.saveProfile(); return show('settings'); }
    if (d.act === 'voices') { api.setVoices(d.v !== undefined ? d.v === '1' : !(api.voicesOn ? api.voicesOn() : true)); return show('settings'); }
    if (d.act === 'diff') { p.difficulty = d.v !== undefined ? +d.v : ((p.difficulty ?? 1) + 1) % DIFFICULTY.length; api.saveProfile(); return show('settings'); }
    if (d.act === 'gfx') {      // Graphics: Auto -> Low -> Medium -> High; saved in the profile, the page reloads a moment after the last tap
      const nx = PREFS[(PREFS.indexOf(GFX.pref) + 1) % PREFS.length]; setPref(nx); p.gfx = nx; api.saveProfile();
      clearTimeout(gfxTimer); if (GFX.pref !== gfxStart) gfxTimer = setTimeout(() => { const u = new URL(location.href); u.searchParams.delete('gfx'); location.href = u.href; }, 1500);
      return show('settings');
    }
    if (d.act === 'sfxpack') { const nx = d.v || (sfxPack() === 'new' ? 'old' : 'new'); if (nx === sfxPack()) return; setSfxPack(nx); return location.reload(); }
    if (d.act === 'autoride') { if (d.v !== undefined ? d.v === '1' : p.autoRide === false) delete p.autoRide; else p.autoRide = false; api.saveProfile(); return show('settings'); }
    if (d.act === 'view') { p.firstPerson = d.v !== undefined ? d.v === '1' : !p.firstPerson; api.S.fp = p.firstPerson; api.saveProfile(); return show('settings'); }
    if (d.act) return;
    if (d.skill) { if (skillPoints(p) > 0 && SKILLS[d.skill] && !(p.skills || (p.skills = {}))[d.skill]) { p.skills[d.skill] = 1; api.ui('select'); api.saveProfile(); } return show('skills'); }
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
    if (d.col) { const [k, c] = d.col.split('|'); p.arms[k] = c; }
    if (d.pat) p.arms.pattern = d.pat;
    if (d.chg) p.arms.charge = d.chg;
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
    if (d.hist !== undefined) p.arms = Object.assign({}, HISTORIC_ARMS[+d.hist].arms);
    api.saveProfile(); api.rebuildPlayer(); show('armoury');
  };
  root.addEventListener('click', onClick);

  return { show, root, stableHorse: () => stableSel, stableCap: () => stableCap || 'livery' };
}
