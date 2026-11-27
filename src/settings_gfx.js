// settings_gfx.js - the Graphics section of the Settings screen: the preset (Auto shows what it picked and why), then a few overrides.
// renderGfxSettings(host) fills an element; menus.js only calls it. Markup is plain and semantic (.panel, .row, .select, .toggle, .btn) so the UI skin can style it;
// each row carries a data-tip for the tooltip component. Overrides apply live where they can; the rest say when ("applies on next match", "after a reload").
import { ensurePanelCss } from './panel_css.js';
import { GFX, setPref, setOverride, clearOverrides, redetect, PREFS } from './gfx.js';
import { touchMode } from './touch.js';
import { fpsOn, setFps, softwareGpu } from './fps_overlay.js';
import { menuJoustOn, setMenuJoust, joustCap, clearJoustCap } from './attract_pref.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap1 = (t) => t[0].toUpperCase() + t.slice(1);
const LIVE = 'applies now', NEXT = 'applies on next match', RELOAD = 'applies after a reload';
let reloadTimer = 0;
const startPref = GFX.pref;      // what this page was loaded with

/** One line about what Auto chose: the tier, where that came from, and what the benchmark is doing. */
export function autoNote() {
  const a = GFX.auto, t = cap1(a.tier), b = GFX.bench;
  const from = { saved: 'measured earlier on this device', guess: 'a first guess from your device', bench: 'measured in your first match', net: 'lowered because the game ran slowly', boot: 'lowered because the game did not finish loading' }[a.source] || '';
  let s = `Auto picked ${t}: ${from}${a.note ? ' (' + a.note + ')' : ''}.`;
  if (b.state === 'pending') s += ' It will time your first match and adjust once.';
  else if (b.state === 'waiting' || b.state === 'running' || b.state === 'verifying') s += ' Measuring now…';
  else if (b.note) s += ' Benchmark: ' + b.note + '.';
  return s;
}
/** The device in a few words, for the details line. */
function deviceLine() {
  const i = GFX.info || {}, bits = [];
  if (i.gpu) bits.push(i.gpu.replace(/^ANGLE \(|\)$/g, '').slice(0, 60));
  if (i.cores) bits.push(i.cores + ' cores'); if (i.mem) bits.push(i.mem + ' GB'); if (i.maxTex) bits.push('texture ' + i.maxTex);
  return bits.join(' · ') || 'no details from the browser';
}
const sel = (key, opts, cur, extra = '') => `<select class="select" data-ov="${key}" ${extra} aria-label="${esc(key)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const row = (label, ctl, when, tip, extra = '') => `<div class="row" data-tip="${esc(tip)}" ${extra}><label class="slabel">${label}</label><span class="sctl">${ctl}<small class="when" data-when>${when || ''}</small></span></div>`;

/** What the Menu joust row says beside its switch. */
function joustWhen() {
  if (!menuJoustOn()) return 'a still backdrop';
  if (GFX.tier === 'low') return 'not shown on Low graphics';
  const c = joustCap(); return c ? 'switched off: the menus ran slowly (turn it off and on to try again)' : LIVE;
}
/** The values the selects show: 'auto' when there is no override. */
const ovv = (k) => (GFX.ov[k] == null ? 'auto' : GFX.ov[k]);

export function renderGfxSettings(host, ctx = {}) {
  if (!host) return;
  ensurePanelCss();
  const t = cap1(GFX.tier), pend = GFX.pref !== startPref;
  const presets = PREFS.map((p) => [p, p === 'auto' ? `Auto (${cap1(GFX.auto.tier)})` : cap1(p)]);
  const dofOk = GFX.post === 'full';
  host.innerHTML = `<div class="panel pf sgfx" role="group" aria-label="Graphics">
    <h5>Graphics</h5>
    ${row('Preset', sel('preset', presets, GFX.pref), pend ? 'reloading to apply…' : 'changing it reloads the game', 'Auto measures your device and picks. Low suits old phones, High is the full look. Changing it reloads the game.', 'data-row="preset"')}
    <p class="note" data-auto>${GFX.pref === 'auto' ? esc(autoNote()) : `Fixed on ${esc(cap1(GFX.pref))}; Auto is off. Running: ${esc(t)}.`}</p>
    <details class="sdev"><summary>This device</summary><p class="note">${esc(deviceLine())}. First guess: ${esc(cap1(GFX.detected))} (${esc(GFX.reason)}). Running now: ${esc(t)}, pixel ratio ${GFX.pixelRatio().toFixed(2)}.</p>
      <p class="note"><button class="btn" data-g="redetect" data-tip="Forget what was learned about this device. The next start guesses again and times the first match again.">Detect again</button></p></details>
    ${row('Resolution', sel('res', [['auto', 'Auto'], [1, '100% (native)'], [0.75, '75%'], [0.5, '50%']], ovv('res')), LIVE, 'How sharp the picture is, as a share of your screen\'s own pixels. Lower is smoother on a slow device.')}
    ${row('Shadows', sel('shadow', [['auto', 'Auto'], ['off', 'Off'], [1024, 'Low'], [2048, 'Medium'], [4096, 'High']], ovv('shadow')), LIVE, 'Sun shadows. Off is the biggest saving on a weak GPU.')}
    ${row('Post effects', sel('post', [['auto', 'Auto'], ['full', 'Full: glow, ambient shade'], ['lite', 'Light: colour grade only'], ['plain', 'Off']], ovv('post')), LIVE, 'The film look: colour grade, glow and ambient shading. Light keeps the grade; Off draws the scene plain.')}
    ${row('Depth of field', `<button class="toggle" role="switch" data-tg="dof" aria-checked="${GFX.dof && dofOk ? 'true' : 'false'}" ${dofOk ? '' : 'disabled'}>${GFX.dof && dofOk ? 'On' : 'Off'}</button>`, dofOk ? LIVE : 'needs Full post effects', 'Blurs the background in the replay and cinematic shots. Needs Full post effects.')}
    ${row('Crowd', sel('crowd', [['auto', 'Auto'], [1, 'Full'], [0.75, 'Large'], [0.5, 'Half'], [0.25, 'Sparse']], ovv('crowd')), NEXT, 'How many people fill the stands and the field. The notable ones always stay.')}
    ${row('Frame rate', sel('cap', [['auto', 'Auto (60)'], [30, '30'], [60, '60'], ...(touchMode ? [] : [[0, 'Uncapped']])], ovv('cap')), LIVE, 'The most frames drawn a second in a match. 30 saves battery and heat; Uncapped follows your screen (desktop only). The menus always stay at 30 or less.')}
    ${row('Menu joust', `<button class="toggle" role="switch" data-tg="joust" aria-checked="${menuJoustOn() ? 'true' : 'false'}">${menuJoustOn() ? 'On' : 'Off'}</button>`, joustWhen(), 'Two knights ride endless passes in the lists behind the menus. It is not shown on Low graphics, and it switches itself off if your device cannot keep it smooth.')}
    ${row('Show FPS', `<button class="toggle" role="switch" data-tg="fps" aria-checked="${fpsOn() ? 'true' : 'false'}">${fpsOn() ? 'On' : 'Off'}</button>`, softwareGpu() ? 'hardware acceleration is OFF in this browser' : LIVE, 'A small readout in the corner: frames a second, the slowest frames, draw calls, the graphics tier and your graphics card. Handy for a screenshot when the game runs badly.')}
    <div class="row"><span class="sctl"><button class="btn" data-g="reset" data-tip="Put every setting above back to Auto (the preset stays).">Reset to Auto</button><button class="btn primary btn-primary" data-g="reload" ${GFX.pref !== startPref ? '' : 'hidden'}>Reload now</button></span></div>
    <p class="note" data-status role="status" aria-live="polite">${pend ? 'The game reloads in a moment to apply the preset.' : ''}</p>
  </div>`;
  if (host.__gfxBound) return;      // (the listeners are bound once; a redraw only replaces the markup)
  host.__gfxBound = true;
  const say = (m) => { const st = host.querySelector('[data-status]'); if (st) st.textContent = m; };
  const redraw = () => renderGfxSettings(host, ctx);

  host.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-ov]'); if (!s) return;
    const key = s.dataset.ov, raw = s.value;
    if (key === 'preset') {
      setPref(raw);
      if (raw === 'auto' && ctx.profile) { ctx.profile.gfx = 'auto'; if (ctx.saveProfile) ctx.saveProfile(); }      // (an old mirrored choice must not win)
      clearTimeout(reloadTimer);
      if (GFX.pref !== startPref) { say('Reloading to apply the preset…'); reloadTimer = setTimeout(() => { const u = new URL(location.href); u.searchParams.delete('gfx'); location.href = u.href; }, 1500); }
      else say('Preset unchanged.');
      return;
    }
    const v = raw === 'auto' ? null : (key === 'post' || raw === 'off' ? raw : Number(raw));
    setOverride(key, v);
    const r = s.closest('.row'), when = r.querySelector('[data-when]');
    redraw();
    say(`${r.querySelector('label').textContent}: ${when ? when.textContent : ''}.`);
  });
  host.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-tg]'), g = e.target.closest('[data-g]');
    if (tg && tg.dataset.tg === 'fps') { const on = tg.getAttribute('aria-checked') !== 'true'; setFps(on); redraw(); say('Show FPS: ' + (on ? 'on' : 'off') + ' (applies at once).'); return; }
    if (tg && tg.dataset.tg === 'joust') { const on = tg.getAttribute('aria-checked') !== 'true'; setMenuJoust(on); redraw(); say('Menu joust: ' + (on ? 'on' : 'off') + ' (applies at once).'); return; }
    if (tg && !tg.disabled) { const on = tg.getAttribute('aria-checked') !== 'true'; setOverride('dof', on); redraw(); say('Depth of field: ' + (on ? 'on' : 'off') + ' (applies now).'); return; }
    if (!g) return;
    if (g.dataset.g === 'reset') { clearOverrides(); redraw(); say('Every setting is back on Auto.'); }
    else if (g.dataset.g === 'redetect') { redetect(); clearJoustCap(); say('Forgotten. Reloading to detect again…'); setTimeout(() => location.reload(), 900); }
    else if (g.dataset.g === 'reload') location.reload();
  });
}
