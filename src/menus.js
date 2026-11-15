import { HORSES, ARMOURS, KNIGHTS, VENUES, PATTERNS, CHARGES, TINCTURES, ovr, bondLevel, BOND_NAMES, LANCES, DIFFICULTY, HISTORIC_ARMS, ARTS, LESSONS,
  ECON, entryFee, purse, RANKS, rankOf, skillPoints, SKILLS, ACHIEVEMENTS, ACH_GROUPS, ACH_RENOWN, HELMS, MODES, RETINUE, CAPARISONS, TRAITS, RETINUE_UP, newMan, fixRetinue, wageOf, trainCost, menFx } from './data.js';
import { drawCrest, drawFace } from './util.js';
import { featCount } from './achievements.js';
import { ANNOUNCER, circuitOpening } from './drama_lines.js';
import { sfxPack, setSfxPack, SFX_HAS_OLD } from './audio.js';

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

export function initMenus(api) {
  const root = el('screen');
  let exVenue = 0, exOpp = KNIGHTS[0].id, exMode = 'planken', exCourses = 5, dismissArm = null;
  const EX_COURSES = [3, 5, 7, 10, 15, 20], CIRC_COURSES = [3, 5, 7, 10, 15];
  let stableCap = null;      // the caparison shown on the Stable's horse (previewed; yours is profile.caparison)
  const crests = () => root.querySelectorAll('canvas[data-arms]').forEach(c => drawCrest(c, JSON.parse(c.dataset.arms)));
  const crest = (arms, w = 40, h = 48) => `<canvas width="${w}" height="${h}" data-arms='${JSON.stringify(arms)}'></canvas>`;
  // every screen is a scroll: the skin, then the page that is written on (and scrolls)
  const scroll = (cls, html) => `<div class="${cls} scroll"><i class="paper"></i><div class="page">${html}</div></div>`;

  function main() {
    const p = api.profile, T = p.table, round = T ? T.round : 0, pts = skillPoints(p), rank = RANKS[rankOf(p.renown)];
    root.innerHTML = scroll('menu', `
      <h1>Tilt</h1><h2>The Jousting Circuit</h2>
      <button data-go="circuit">${round > 0 && round < VENUES.length ? 'Continue the Circuit' : 'Ride the Circuit'}<small>Five great lists across Europe, a herald and the royal gallery</small></button>
      <button data-go="exhibition">Exhibition Joust<small>Any lists, any opponent</small></button>
      <button data-act="practice">${(p.lesson || 0) >= LESSONS.length ? 'Tiltyard Practice' : (p.lesson || 0) > 0 ? 'Continue your Training' : 'Learn to Joust'}<small>${(p.lesson || 0) >= LESSONS.length ? 'Run at the quintain again' : `Lesson ${Math.min(LESSONS.length, (p.lesson || 0) + 1)} of ${LESSONS.length}: ${LESSONS[Math.min(LESSONS.length - 1, p.lesson || 0)].title}`}</small></button>
      <button data-go="armoury">Armoury &amp; Retinue<small>${p.name} · ${HORSES[p.horse].name} · ${HELMS[p.helm].name}, ${ARMOURS[p.armour].name}</small></button>
      <button data-go="stable">The Stable<small>See every horse, turn it round, and choose your mount</small></button>
      <button data-go="skills">${pts > 0 ? `<em>${pts} to learn</em>` : ''}Renown &amp; Skills<small>${rank.name} · ${p.renown || 0} renown</small></button>
      <button data-go="feats">Feats &amp; Honours<small>${featCount(p).have} of ${featCount(p).total} earned · seals for deeds in the lists</small></button>
      <button data-go="how">The Art of the Joust<small>Controls, technique, the purse</small></button>
      <div class="standing"><span>${rank.name}</span><span>${purseText(p.gold)}</span></div>
      ${rankBar(p.renown)}
      <div class="toggles"><span class="chip" data-act="diff">Difficulty: ${DIFFICULTY[p.difficulty ?? 1].name}</span><span class="chip" data-act="herald">Herald: ${p.herald === false ? 'silent' : 'speaks'}</span><span class="chip" data-act="voices" title="The robot voice for the herald, the king, your men and the sellers (needs sound on)">Voices: ${api.voicesOn && !api.voicesOn() ? 'off' : 'on'}</span><span class="chip" data-act="view">View: ${p.firstPerson ? 'first person' : 'third person'}</span><span class="chip" data-act="autoride" title="After a pass: ride back to your mark yourself (W/S gait, A/D steer), or let the horse take you">Ride back: ${p.autoRide === true ? 'auto' : p.autoRide === false ? 'by hand' : 'auto until learned'}</span><label class="chip vol">Music <input type="range" id="musicVol" min="0" max="100" step="5" value="${api.musicVol ? api.musicVol() : 60}"> <span id="musicPct">${api.musicVol ? api.musicVol() : 60}%</span></label>${SFX_HAS_OLD ? `<span class="chip" data-act="sfxpack" title="Switch between the original and the royalty-free sound pack (reloads the page)">Sound pack: ${sfxPack() === 'new' ? 'New' : 'Old'}</span>` : ''}</div>
      <div class="foot">Sound is off until you switch it on (the button at the top, or M).</div>`);
  }

  function circuit() {
    const p = api.profile; if (!p.table) p.table = api.newTable();
    const T = p.table, done = T.round >= VENUES.length;
    const rows = [...T.rows].sort((a, b) => b.p - a.p || b.sp - a.sp);
    const info = (id) => id === 'you' ? { name: p.name, arms: p.arms, land: '—' } : KNIGHTS.find(k => k.id === id) || KNIGHTS[0];   // never crash on a knight a newer roster dropped
    const place = rows.findIndex(r => r.id === 'you') + 1;
    const vi = Math.min(T.round, VENUES.length - 1), V = VENUES[vi], host = KNIGHTS.find(k => k.id === V.host);
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>The European Circuit</h3>
      <div class="hugh"><canvas class="face" width="72" height="84" data-face="${ANNOUNCER.name}|${ANNOUNCER.color}|${ANNOUNCER.cap}"></canvas><div><h6>${ANNOUNCER.name}, ${ANNOUNCER.title}, says:</h6>
      <p>${circuitOpening(T.round, place, done)} ${done ? (place === 1 ? `<b>${p.name} is champion of the circuit!</b> The heralds will shout your name from London to Nuremberg.` : `The circuit is run. You finish ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][place - 1]}.`)
        : `Next: <b>${V.name}</b>, ${V.city}, ${V.year}. ${V.blurb} You meet the champion of the lists, <b>${host.name}</b>.<br>Entry costs ${marks(entryFee(vi))}; the winner's purse is ${marks(purse(vi, 'win', true))}. ${purseText(p.gold)}.`}</p></div></div></div>
      <div class="actions"><button class="btn" data-go="main">Back</button>${done ? '<button class="btn primary" data-act="reset">New Circuit</button>' : '<button class="btn primary" data-act="ride">Ride to the Lists</button>'}</div></div>
      <h5>Courses per match <small>level scores run up to two extra courses; long matches cost less per lance</small></h5><div class="swatches">${CIRC_COURSES.map(n => `<div class="chip ${n === (p.courses || 5) ? 'sel' : ''}" data-cc="${n}">${n}</div>`).join('')}</div>
      <h5>The Road</h5><div class="venues">${VENUES.map((v, i) => { const r = T.results[i]; return `<div class="venue ${i === T.round ? 'now' : i < T.round ? 'done' : ''}"><b>${v.name}</b><i>${v.city} · ${v.year}</i><div class="r">${r ? `${r.res.startsWith('win') ? 'Won' : r.res === 'draw' ? 'Drew' : 'Lost'} ${r.score[0]}–${r.score[1]}` : `against ${KNIGHTS.find(k => k.id === v.host).short}`}</div>${r ? '' : `<div class="fee">purse ${purse(i, 'win', true)} · entry ${entryFee(i)}</div>`}</div>`; }).join('')}</div>
      <h5>Standings</h5><table class="tbl"><tr><th>#</th><th>Knight</th><th>Land</th><th>W</th><th>D</th><th>L</th><th>Lances broken</th><th>Points</th></tr>
      ${rows.map((r, i) => { const k = info(r.id); return `<tr class="${r.id === 'you' ? 'me' : ''}"><td>${i + 1}</td><td>${crest(k.arms)}${k.name}</td><td>${k.land}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.sp}</td><td><b>${r.p}</b></td></tr>`; }).join('')}</table>`);
    crests(); faces();
    if (!done) api.setVenue(T.round);
  }

  function exhibition() {
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Exhibition Joust</h3><p>Choose the lists and the knight you will run against. No entry fee and no ransom; the purse is ${marks(purse(0, 'win', false))}.</p></div>
      <div class="actions"><button class="btn" data-go="main">Back</button><button class="btn primary" data-act="exride">Ride</button></div></div>
      <h5>The Joust</h5><div class="grid">${Object.values(MODES).map(m => `<div class="pick ${m.id === exMode ? 'sel' : ''}" data-exm="${m.id}"><b>${m.name}</b><em>${m.sub}</em><p>${m.blurb}</p></div>`).join('')}</div>
      <h5>Courses <small>${MODES[exMode].noExtra ? 'Fixed at four by the statutes' : 'level scores run up to two extra courses'}</small></h5><div class="swatches">${MODES[exMode].noExtra ? `<div class="chip sel">4</div>` : EX_COURSES.map(n => `<div class="chip ${n === exCourses ? 'sel' : ''}" data-exc="${n}">${n}</div>`).join('')}</div>
      <h5>The Lists</h5><div class="grid">${VENUES.map((v, i) => `<div class="pick ${i === exVenue ? 'sel' : ''}" data-exv="${i}"><b>${v.name}</b><em>${v.year}</em><p>${v.city}. ${v.blurb}</p></div>`).join('')}</div>
      <h5>Your Opponent</h5><div class="grid">${KNIGHTS.map(k => `<div class="pick ${k.id === exOpp ? 'sel' : ''}" data-exo="${k.id}">${crest(k.arms, 30, 36)} <span class="ovr">${ovr(k)}</span><b>${k.short}</b><em>${k.land}</em><p>${k.name} — ${HORSES[k.horse].name}, ${HELMS[ARMOURS[k.armour].helm].name}, ${ARMOURS[k.armour].name}</p>${stat('Aim', k.skill)}${stat('Seat', k.seat)}${stat('Drive', k.drive)}</div>`).join('')}</div>`);
    crests(); api.setVenue(exVenue);
  }

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
    root.innerHTML = scroll('sheet', `<div class="top"><div><h3>Armoury &amp; Retinue</h3><p>Your horse, your harness, your men and your arms. <b>${purseText(p.gold)}</b>${broke ? ' — you can buy nothing until the debt is cleared.' : '.'}</p></div>
      <div class="actions"><button class="btn primary" data-go="main">Done</button></div></div>
      <h5>Your Horse <small>stabling is charged at each circuit tourney</small> <span class="chip" data-go="stable">Visit the stable</span></h5><p>Caparison: ${(CAPARISONS[p.caparison] || CAPARISONS.livery).name} — change it in the Stable.</p><div class="grid">${Object.values(HORSES).map(h => `<div class="pick ${p.horse === h.id ? 'sel' : ''}" data-horse="${h.id}">${pv('horse', h.id)}<b>${h.name}</b><em>${p.owned.horses.includes(h.id) ? 'bond ' + BOND_NAMES[bondLevel((p.bond || {})[h.id])] : marks(h.price)}</em><p>${h.blurb} Keep: ${marks(ECON.keep[h.id] ?? 2)}.</p>${stat('Speed', (h.top - 7.2) / 2)}${stat('Accel', h.accel / 3.7)}${stat('Shock', (h.mass - 0.7) / 0.6)}${stat('Smooth', h.steady)}${stat('Temper', h.nerve)}${stat('Wind', h.stamina)}</div>`).join('')}</div>
      <h5>Your Helm <small>bought and worn on its own; it decides what you see</small></h5><div class="grid">${Object.values(HELMS).map(h => `<div class="pick ${p.helm === h.id ? 'sel' : ''}" data-helm="${h.id}">${pv('helm', h.id)}<b>${h.name}</b><em>${p.owned.helms.includes(h.id) ? h.era : marks(h.price)}</em><p>${h.blurb}</p>${stat('Protect', h.protection)}${stat('Vision', h.vision)}${stat('Light', 1.15 - h.kg / 10)}</div>`).join('')}</div>
      <h5>Your Harness <small>body armour; the armourer mends it after every joust</small></h5><div class="grid">${Object.values(ARMOURS).map(r => `<div class="pick ${p.armour === r.id ? 'sel' : ''}" data-armour="${r.id}">${pv('armour', r.id)}<b>${r.name}</b><em>${p.owned.armours.includes(r.id) ? r.era : marks(r.price)}</em><p>${r.blurb}</p>${stat('Protect', r.protection)}${stat('Light', 1.9 - r.weight * 1.2)}</div>`).join('')}</div>
      <h5>Your Lance <small>you pay for every lance you break</small></h5><div class="grid">${Object.values(LANCES).map(l => `<div class="pick lance ${(p.lance || 'standard') === l.id ? 'sel' : ''}" data-lance="${l.id}">${pv('lance', l.id)}<b>${l.name}</b><em>${marks(ECON.lance[l.id])} each (less in long matches)</em><p>${l.blurb}</p>${stat('Shock', (l.power - 0.7) / 0.5)}${stat('Steady', 1.55 - l.sway)}${stat('Arm', 1.2 - l.fatigue * 0.55)}</div>`).join('')}</div>
      <h5>Your Retinue <small>hired once; each draws his wage at every circuit tourney</small></h5><div class="grid">${Object.keys(RETINUE).map(id => manCard(p, id)).join('')}</div>
      <h5>Your Name</h5><input class="name" id="nameIn" maxlength="22" value="${p.name.replace(/"/g, '')}">
      <h5>Blazon</h5><div class="arms-row"><canvas id="crestBig" width="300" height="356"></canvas><div>
        ${sw('c1')}${sw('c2')}${sw('c3')}
        <div class="swatches"><span class="lbl">Ordinary</span>${PATTERNS.map(x => `<div class="chip ${a.pattern === x ? 'sel' : ''}" data-pat="${x}">${x}</div>`).join('')}</div>
        <div class="swatches"><span class="lbl">Charge</span>${CHARGES.map(x => `<div class="chip ${(a.charge || 'none') === x ? 'sel' : ''}" data-chg="${x}">${x}</div>`).join('')}</div>
        <div class="swatches"><span class="lbl">Historic</span>${HISTORIC_ARMS.map((h, i) => `<div class="chip" title="${h.note}" data-hist="${i}">${h.name}</div>`).join('')}</div></div></div>`);
    drawCrest(el('crestBig'), a); faces();
    el('nameIn').addEventListener('change', (e) => { p.name = e.target.value.trim() || 'Sir Nameless'; api.saveProfile(); });
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
        Ride on with your lance still low −1. Five courses by default (you choose three to fifteen on the circuit screen, three to twenty in an exhibition); level cheques run extra courses.</p>
        <h5>The Jousts</h5>
        ${Object.values(MODES).map(m => `<p><b>${m.name}</b> (${m.sub}). ${m.blurb}</p>`).join('')}</div>
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
        <p>If the purse runs dry the moneylenders carry you, up to ${marks(ECON.debtCap)}. In debt you may still ride, but you can buy nothing. An exhibition joust has no fee and no ransom.</p>
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
    const rows = Object.values(HORSES).map(x => `<div class="pick ${x.id === h.id ? 'sel' : ''}" data-stable="${x.id}"><b>${x.name}</b><em>${p.horse === x.id ? 'riding him' : owned(x.id) ? 'yours' : marks(x.price)}</em><p>${x.blurb}</p></div>`).join('');
    root.innerHTML = scroll('sheet stablescr', `<div class="top"><div><h3>The Stable</h3><p>Drag the horse to turn him, scroll to come closer. <b>${purseText(p.gold)}</b></p></div>
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

  const screens = { main, circuit, exhibition, armoury, skills, how, stable, feats };
  function show(name) {
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
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-cc],[data-act],[data-col],[data-pat],[data-chg],[data-horse],[data-stable],[data-stbuy],[data-armour],[data-helm],[data-lance],[data-hire],[data-train],[data-dismiss],[data-hist],[data-exv],[data-exo],[data-exm],[data-exc],[data-stcap],[data-stcapset],[data-skill]');
    if (!t) return;
    const p = api.profile, d = t.dataset;
    api.ui(d.go || d.act ? 'select' : 'click');
    if (d.go) { dismissArm = null; return show(d.go); }
    if (d.act === 'ride') { const T = p.table; return api.startMatch(T.round, VENUES[T.round].host, true, false, null, p.courses || 5); }
    if (d.act === 'reset') { api.resetCircuit(); return show('circuit'); }
    if (d.act === 'exride') return api.startMatch(exVenue, exOpp, false, false, exMode, MODES[exMode].noExtra ? 4 : exCourses);
    if (d.act === 'practice') return api.startPractice((p.lesson || 0) >= LESSONS.length);
    if (d.act === 'herald') { p.herald = p.herald === false; api.saveProfile(); return show('main'); }
    if (d.act === 'voices') { api.setVoices(!(api.voicesOn ? api.voicesOn() : true)); return show('main'); }
    if (d.act === 'diff') { p.difficulty = ((p.difficulty ?? 1) + 1) % DIFFICULTY.length; api.saveProfile(); return show('main'); }
    if (d.act === 'sfxpack') { setSfxPack(sfxPack() === 'new' ? 'old' : 'new'); return location.reload(); }
    if (d.act === 'autoride') { p.autoRide = p.autoRide == null ? false : p.autoRide === false ? true : null; if (p.autoRide === null) delete p.autoRide; api.saveProfile(); return show('main'); }
    if (d.act === 'view') { p.firstPerson = !p.firstPerson; api.S.fp = p.firstPerson; api.saveProfile(); return show('main'); }
    if (d.act) return;
    if (d.skill) { if (skillPoints(p) > 0 && SKILLS[d.skill] && !(p.skills || (p.skills = {}))[d.skill]) { p.skills[d.skill] = 1; api.ui('select'); api.saveProfile(); } return show('skills'); }
    if (d.exv !== undefined) { exVenue = +d.exv; return show('exhibition'); }
    if (d.exo) { exOpp = d.exo; return show('exhibition'); }
    if (d.exm) { exMode = d.exm; return show('exhibition'); }
    if (d.cc) { p.courses = +d.cc; api.saveProfile(); return show('circuit'); }
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
  });

  return { show, root, stableHorse: () => stableSel, stableCap: () => stableCap || 'livery' };
}
