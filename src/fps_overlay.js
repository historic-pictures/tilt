// fps_overlay.js - "Show FPS" (Settings > Graphics, saved in localStorage 'tilt.fps'): a tiny manuscript-style readout under the sound buttons for people to screenshot when the game
// runs badly: smoothed FPS, the slowest 5% of frames (p95 ms), draw calls and triangles per frame, the graphics tier, the render scale and the GPU. When the GPU is a software
// renderer (SwiftShader, llvmpipe, "Microsoft Basic Render") it says in red that hardware acceleration is off in the browser. gfx.js already starts such a device on Low.
import { GFX } from './gfx.js';

const KEY = 'tilt.fps';
const SOFT = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
let on = false, el = null, raf = 0, last = 0, ms = [], tick = 0, warned = false, renderer = null;

export const fpsOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
/** The GPU string the browser reports (the same one gfx.js probed), '' if it hides it. */
export const gpuName = () => (GFX.info && GFX.info.gpu) || '';
export const softwareGpu = () => SOFT.test(gpuName());

function warnOnce() {
  if (warned || !softwareGpu()) return; warned = true;
  console.warn('[tilt] Hardware acceleration is OFF in this browser (GPU: ' + gpuName() + '). The game will run very slowly. Turn it on at chrome://settings/system (Use graphics acceleration when available), then restart the browser.');
}
function build() {
  el = document.createElement('div'); el.id = 'fpsBox'; el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:52px;right:10px;z-index:60;pointer-events:none;font:11px/1.35 "IM Fell English","Palatino Linotype",Georgia,serif;color:#f1e3bf;text-shadow:0 1px 2px #000,0 0 4px #000;text-align:right;background:rgba(30,20,10,.45);border:1px solid rgba(214,178,98,.45);border-radius:3px;padding:3px 7px;max-width:260px;letter-spacing:.02em';
  document.body.appendChild(el);
}
function frame(t) {
  raf = requestAnimationFrame(frame);
  if (last) ms.push(t - last); last = t; if (ms.length > 120) ms.shift();
  if (++tick % 15) return;      // (the text is refreshed four times a second)
  if (!renderer && window.G) renderer = window.G.renderer;
  const n = ms.length; if (n < 5) return;
  const mean = ms.reduce((a, b) => a + b, 0) / n, s = [...ms].sort((a, b) => a - b), p95 = s[Math.min(n - 1, Math.floor(n * 0.95))];
  let calls = '-', tris = '-', pr = '-';
  if (renderer) { const i = renderer.info; calls = i.render.calls; tris = i.render.triangles; i.reset(); pr = renderer.getPixelRatio().toFixed(2); }      // (info.autoReset is off while this is shown: one reset per drawn frame group)
  const soft = softwareGpu();
  el.innerHTML = `<b>${(1000 / mean).toFixed(0)} fps</b> · p95 ${p95.toFixed(1)} ms<br>${calls} calls · ${tris > 99999 ? (tris / 1e6).toFixed(2) + 'M' : tris} tris<br>${GFX.tier} · scale ${pr}${GFX.crowdLive < 1 ? ' · crowd ' + Math.round(GFX.crowd * GFX.crowdLive * 100) + '%' : ''}<br><span style="opacity:.8">${(gpuName().replace(/^ANGLE \(|\)$/g, '') || 'GPU hidden').slice(0, 44)}</span>${soft ? '<br><b style="color:#ff6a5a">Hardware acceleration is OFF in your browser — see chrome://settings/system</b>' : ''}`;
}
/** Turn the readout on or off (and remember it). */
export function setFps(v) {
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
  if (v === on) return; on = !!v;
  if (on) { if (!el) build(); el.style.display = 'block'; last = 0; ms = []; if (window.G && window.G.renderer) { renderer = window.G.renderer; renderer.info.autoReset = false; } raf = requestAnimationFrame(frame); }
  else { cancelAnimationFrame(raf); if (el) el.style.display = 'none'; if (renderer) { renderer.info.autoReset = true; } }
}
/** Call once after the page is up: starts the readout if it was left on, and warns about a software renderer. */
export function initFps() { warnOnce(); if (fpsOn()) setFps(true); }
