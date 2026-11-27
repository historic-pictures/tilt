// The tournament screen: the herald's roll. Rendered into the career's `circuit` screen by menus.js (one hook), so it needs only plain classes
// (.panel .row .btn .btn-primary) and carries `data-tip` help texts; the parchment-and-rubric look is in the `.roll` block at the end of style.css.
// Pure string builders plus one action handler (tourneyAct); the event rules live in tournament.js.
import { VENUES, purse, entryFee } from './data.js';
import * as T from './tournament.js';
import { coin, coinsTxt } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const marks = coinsTxt;      // money reads as coins (the data still counts marks); plain text for sentences and tips
const coinH = (n) => coin(n);      // the manuscript coin-and-number for table cells
const tip = (s) => `data-tip="${esc(s)}"`;
let watch = null, watchTimer = 0;      // the herald reading a day's other pairs: { r, n } = pairs read so far

const pairsToRead = (t, r) => t.rnds[r].pairs.filter(m => m.a !== 'you' && m.b !== 'you');

/** The columns: one per day, then the Prize Joust. Pairs of a day you have not been told yet show their names but not their credits. */
function columns(t, nm) {
  const cols = [];
  for (let r = 0; r <= t.rc; r++) {
    const rd = t.rnds[r], nrow = (r === t.rc ? 1 : t.size / 2);
    let body = '';
    if (!rd) body = `<div class="bm"><div class="bk"><span>${r === t.rc ? 'The two best on the roll' : 'Drawn from the roll'}</span></div></div>`;
    else {
      const read = watch && watch.r === r ? new Set(pairsToRead(t, r).slice(0, watch.n)) : null;
      body = rd.pairs.map((m) => {
        const mine = m.a === 'you' || m.b === 'you', told = mine ? m.w != null : (rd.shown || (read && read.has(m)));
        const row = (id, k) => `<div class="bk ${told && m.w === id ? 'win' : told ? 'lose' : ''} ${id === 'you' ? 'you' : ''}"><span>${nm(id)}</span><em>${told ? m.sc[k] : ''}</em></div>`;
        return `<div class="bm ${mine ? 'me' : ''} ${mine && r === t.cur && m.w == null && t.you === 'in' ? 'next' : ''}">${row(m.a, 0)}${row(m.b, 1)}</div>`;
      }).join('');
    }
    cols.push(`<div class="rnd ${r === t.cur && !t.done ? 'cur' : ''}"><h6 ${tip(r === t.rc ? 'The two best on the roll ride for the Prize.' : `Day ${r + 1}: every knight rides one pair. Nobody is struck off.`)}>${T.roundName(t, r)}</h6><div class="bms">${body}</div></div>`);
  }
  return `<div class="bracket roll-cols r${t.rc + 1}">${cols.join('')}</div>`;
}

/** The roll: ranked by bouts won, then lance credits (what the match counted for you). */
function table(t, nm, seenOnly) {
  const rows = T.standings(t, seenOnly), told = t.rnds[Math.min(t.cur, t.rc - 1)], fin = t.cur >= t.rc || (t.cur === t.rc - 1 && told && told.shown);
  return `<div class="panel rolltable" ${tip('The herald\'s roll. Ranked by lance credits, then bouts won (Tiptoft counts a lance broken as 1, 2 or 3).')}><div class="row head"><span>#</span><span class="nm">Knight</span><span ${tip('Lance credits scored')}>Credits</span><span ${tip('Bouts won - lost')}>W-L</span></div>`
    + rows.map((r, i) => `<div class="row ${r.id === 'you' ? 'you' : ''} ${fin && i < 2 ? 'top2' : ''}"><span>${i + 1}</span><span class="nm">${nm(r.id)}${fin && i < 2 ? ' <i>to the Prize Joust</i>' : ''}</span><span>${r.pts}</span><span>${r.w}-${r.l}</span></div>`).join('') + '</div>';
}

function prizeBox(t, nm, seenOnly) {
  const base = purse(t.v, 'win', true), rows = T.standings(t, seenOnly), lance = rows.slice().sort((x, y) => y.pts - x.pts || y.w - x.w)[0];
  const pz = t.prizes, lancer = pz ? nm(pz.lance) : (lance && lance.pts ? nm(lance.id) : '—'), ladies = pz && pz.ladies ? nm(pz.ladies) : 'to be named';
  return `<div class="panel prizes"><h5>The Prizes ${t.done ? '<small>read out</small>' : ''}</h5>
    <div class="row" ${tip('The winner of the Prize Joust: the match purse doubled, and the honour Champion of this place.')}><span class="nm">The Prize</span><span>${coinH(base * 2)} and the honour</span><em>${pz ? nm(pz.winner) : ''}</em></div>
    <div class="row" ${tip('Most lance credits over all the days. Won with the lance, not the final.')}><span class="nm">Best Lance</span><span>${coinH(Math.round(base * 0.4))}</span><em>${lancer}</em></div>
    <div class="row" ${tip('The ladies give this to the most gallant single bout (the widest margin). Never the same knight as Best Lance.')}><span class="nm">The Ladies' Prize</span><span>${coinH(Math.round(base * 0.3))}</span><em>${ladies}</em></div></div>`;
}

function wagerBox(t, p) {
  if (!t.joined) {
    const max = Math.max(0, Math.floor(p.gold || 0)), sel = Math.min(t.stakeSel || 0, max);
    return `<div class="panel wager"><h5>Wager on yourself <small>coins only</small></h5><p>The crowd lays <b>${t.odds} to 1</b> against you winning the Prize. A stake is paid at the close if you do, and lost if you do not.</p>
      <div class="swatches">${T.STAKES.map(n => `<div class="chip ${n === sel ? 'sel' : ''} ${n > max ? 'cant' : ''}" data-tt="stake:${n}" ${tip(n ? `Stake ${marks(n)} on yourself to win the Prize.` : 'No wager.')}>${n || 'None'}</div>`).join('')}</div></div>`;
  }
  const paid = t.paid, line = !t.stake ? 'You have laid no wager.' : t.done ? (paid.bet ? `Your wager of ${marks(t.stake)} wins ${marks(paid.bet)} at ${t.odds} to 1.` : `Your wager of ${marks(t.stake)} is lost.`) : `You have ${marks(t.stake)} on yourself at ${t.odds} to 1: ${marks(Math.round(t.stake * t.odds))} if you win the Prize.`;
  return `<div class="panel wager"><h5>Your wager</h5><p>${line}</p></div>`;
}

/** The herald's reading of the day's other pairs (while watching, or once told). */
function reading(t, nm) {
  const rd = t.rnds[watch ? watch.r : t.cur]; if (!rd) return '';
  const list = pairsToRead(t, watch ? watch.r : t.cur), n = watch ? watch.n : rd.shown ? list.length : 0;
  if (!n) return '';
  return `<div class="panel reading"><h5>The herald reads <small>${T.roundName(t, watch ? watch.r : t.cur)}</small></h5>${list.slice(0, n).map(m => `<p>${esc(T.heraldLine(m, nm))}</p>`).join('')}</div>`;
}

/**
 * The whole screen body. ctx: { p, S, t, V, name, nm (short names, escaped), full (long names), hugh(title, html, buttons), rules, honours, road, purseText, vars, fill, OUT, ST }.
 * Returns the HTML for the `circuit` screen once the story cards are done.
 */
export function tourneyHTML(ctx) {
  const { p, t, V, nm, hugh, purseText } = ctx, back = `<button class="btn" data-go="main" ${tip('Back to the main menu. Nothing is lost.')}>Back</button>`, when = T.when(t.v);
  if (!t.joined) {
    const fee = entryFee(t.v), land = t.entrants.filter(id => id !== 'you').map(id => T.knightById(id));
    return hugh(`${V.name}: the herald's roll`, `${t.size} knights have given their names for the lists at ${V.city}, ${when}. The event runs ${t.rounds} days: ${t.rc} days of challenge, then the Prize Joust between the two best on the roll. Nobody is struck off for one loss. Entry costs ${marks(fee)}. ${purseText(p.gold)}.`,
      `<button class="btn" data-tt="leave" ${tip('Leave without entering: no cost.')}>Leave</button><button class="btn primary btn-primary" data-tt="join" ${tip('Pay your wager (if any) and enter the lists. The entry fee is paid with your first bout.')}>Join the Lists</button>`)
      + `<div class="roll two"><div><div class="panel entrants"><h5>The Entrants</h5>${land.map(k => `<div class="row"><span class="nm">${esc(k.name)}</span><em>${esc(k.land)}</em></div>`).join('')}<div class="row you"><span class="nm">${nm('you')}</span><em>you</em></div></div></div>
      <div>${prizeBox(t, nm, true)}${wagerBox(t, p)}</div></div>${ctx.rules}${ctx.honours}${ctx.road}`;
  }
  const rd = t.rnds[t.cur], opp = T.myOpponent(t), k = opp && T.knightById(opp), day = T.dayLabel(t, t.cur), seen = true;
  const body = `<div class="roll">${columns(t, nm)}<div class="roll two"><div>${table(t, nm, seen)}</div><div>${prizeBox(t, nm, seen)}${wagerBox(t, p)}${reading(t, nm)}</div></div></div>`;
  if (t.done) {
    const pz = t.prizes, paid = t.paid, won = t.champion, lastV = t.v >= VENUES.length - 1, w = ctx.full(t.winner);
    const lines = (won ? [`${ctx.name} wins the Prize Joust, and the lists at ${V.name}.`, `The honour is his: <b>Champion of ${V.name}</b>.`] : t.you === 'left' ? [`You withdrew from the lists. The roll was closed without you; ${w} took the Prize.`] : [`The Prize goes to ${w}.`])
      .concat(pz.lance === 'you' ? [`The heralds award <b>Best Lance</b> to you: ${marks(paid.lance)}.`] : [`Best Lance: ${ctx.full(pz.lance)}.`])
      .concat(pz.ladies === 'you' ? [`The ladies give you their prize for the most gallant bout: ${marks(paid.ladies)}.`] : pz.ladies ? [`The ladies' prize: ${ctx.full(pz.ladies)}.`] : [])
      .concat(t.stake ? [paid.bet ? `Your wager of ${marks(t.stake)} at ${t.odds} to 1 is paid: ${marks(paid.bet)}.` : `Your wager of ${marks(t.stake)} on yourself is lost.`] : [])
      .concat(ctx.fill(ctx.ST.road[won ? 'won' : 'lost'], ctx.vars));
    return hugh(won ? 'Champion' : 'The Roll Is Closed', won ? 'Well ridden. I will cry it myself.' : 'The roll is read and the prizes given. Your purse follows.',
      `${back}<button class="btn primary btn-primary" data-act="rideon" ${tip('Ride to the next place on the calendar.')}>${lastV ? 'End the Season' : `Ride on to ${ctx.vars.next}`}</button>`)
      + `<div class="story"><h5>${won ? 'The Honour' : 'The Road Onward'}</h5>${lines.map(l => `<p>${l}</p>`).join('')}</div>${body}${ctx.honours}${ctx.road}`;
  }
  const told = rd.shown, reading_ = !!watch, left = `<button class="btn" data-tt="leave" ${tip('Withdraw from the lists. Your wager is forfeit and the rest is played out without you.')}>Leave</button>`;
  let title, text, btns;
  if (t.leaveAsk) {
    title = 'Withdraw?'; text = `If you leave the lists now your wager${t.stake ? ` of ${marks(t.stake)}` : ''} is forfeit, you take no prize, and the remaining days are played out without you.`;
    btns = `<button class="btn" data-tt="stay">Stay</button><button class="btn primary btn-primary" data-tt="withdraw">Withdraw</button>`;
  } else if (t.you === 'in' && opp) {
    title = `${V.name}: ${T.roundName(t, t.cur)}`;
    text = `${day}. You meet <b>${esc(k.name)}</b>, of ${esc(k.land)}${p.lostTo && p.lostTo[opp] ? ', who has beaten you before' : ''}. ${t.cur === 0 ? `The entry (${marks(entryFee(t.v))}) is paid with this bout. ` : ''}${t.cur >= t.rc ? 'The Prize is at stake.' : t.cur === t.rc - 1 ? 'This is the last day of challenge: the best two on the roll ride the Prize Joust tomorrow.' : 'Win or lose, you ride on tomorrow.'}`;
    btns = `${left}<button class="btn primary btn-primary" data-act="ride" ${tip('Ride your bout against this knight, with the rules and courses below.')}>${t.cur >= t.rc ? 'Ride the Prize Joust' : 'Ride Next Bout'}</button>`;
  } else if (!told) {
    title = `${V.name}: ${T.roundName(t, t.cur)}`;
    const rode = rd.pairs.some(m => m.a === 'you' || m.b === 'you');
    text = `${day}. ${rode ? (t.you === 'out' ? 'Your bout is told, but you are not among the best two on the roll: the Prize Joust goes on without you. ' : 'Your bout is told. ') : 'You are not riding today. '}The other pairs have ridden: hear them read, or skip to the roll.`;
    btns = `${left}<button class="btn" data-tt="skip" ${tip('Show every other result at once.')}>Skip Round</button>${reading_ ? '' : `<button class="btn primary btn-primary" data-tt="watch" ${tip('The herald reads the other pairs, one by one.')}>Watch Round</button>`}`;
  } else {
    title = `${V.name}: ${T.roundName(t, t.cur)} told`;
    text = `${day} is told. The roll is updated; tomorrow's pairs are drawn from it.`;
    btns = `${left}<button class="btn primary btn-primary" data-tt="next" ${tip('Draw the next day from the roll.')}>${t.cur + 1 >= t.rc ? 'On to the Prize Joust' : 'Next Day'}</button>`;
  }
  if (watch && !told && !t.leaveAsk) btns = `${left}<button class="btn primary btn-primary" data-tt="skip">Skip</button>`;
  return hugh(title, text, btns) + body + (t.you === 'in' && opp && !t.leaveAsk ? ctx.rules : '') + ctx.honours + ctx.road;
}

/** Click actions (data-tt). ctx: { p, api, show, here() }. Returns true if it was one of ours. */
export function tourneyAct(tt, ctx) {
  const { p, api } = ctx, t = p.season && p.season.t; if (!t || t.fmt !== 'roll') return false;
  const [cmd, arg] = tt.split(':'), save = () => api.saveProfile(), again = () => ctx.show('circuit');
  const stopWatch = () => { clearInterval(watchTimer); watch = null; };
  if (cmd === 'stake') { t.stakeSel = +arg; again(); return true; }
  if (cmd === 'join') { T.join(p, t, t.stakeSel || 0); save(); again(); return true; }
  if (cmd === 'leave') { if (!t.joined) { ctx.show('main'); return true; } t.leaveAsk = true; again(); return true; }
  if (cmd === 'stay') { t.leaveAsk = false; again(); return true; }
  if (cmd === 'withdraw') { stopWatch(); T.withdraw(p, t); save(); again(); return true; }
  if (cmd === 'skip') { stopWatch(); T.reveal(p, t, t.cur); save(); again(); return true; }
  if (cmd === 'next') { stopWatch(); T.nextDay(t); save(); again(); return true; }
  if (cmd === 'watch') {
    stopWatch(); const r = t.cur, n = pairsToRead(t, r).length; watch = { r, n: 0 };
    watchTimer = setInterval(() => {
      if (!ctx.here() || !p.season.t || p.season.t !== t) return stopWatch();
      watch.n++;
      if (watch.n > n) { stopWatch(); T.reveal(p, t, r); save(); }
      again();
    }, 1000);
    again(); return true;
  }
  return false;
}
export const stopTourneyWatch = () => { clearInterval(watchTimer); watch = null; };
