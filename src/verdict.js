import { drawArms, heaterPath, heraldryReady, whenHeraldry, needsAtlas } from './heraldry.js';
// Draws where a lance landed on a simple front view of the target, like a marshal's sketch.
const INK = '#2a1c0e', RED = '#a81e1e', GOLD = '#c9992e', STEEL = '#c5c9cf', HIDE = '#a98a5e';

// The painted knight (assets/ui/tips/figure-512.png, 272x650: the body is the 272x512 original, the lance lengthened above it). P() maps original-picture pixels to the map.
const FSC = 0.285, FX = 46, FYB = 187, FEXT = 138;
const P = (X, Y) => [FX + X * FSC, FYB - (650 - (Y + FEXT)) * FSC];
const Zc = (X, Y, r) => [...P(X, Y), r];
const ZONES = {
  knight: { helm: Zc(130, 85, 11), shield: Zc(172, 212, 17), body: Zc(125, 290, 14), horse: [85, 195, 9] },
  quintain: { shield: [85, 78, 36] },
};

function burst(g, x, y, r) {
  g.save(); g.translate(x, y);
  g.fillStyle = RED; g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = GOLD; g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
  g.restore();
}
function heater(g, cx, cy, w, h) {
  g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy);
  g.bezierCurveTo(cx + w / 2, cy + h * 0.3, cx + w * 0.25, cy + h * 0.45, cx, cy + h / 2);
  g.bezierCurveTo(cx - w * 0.25, cy + h * 0.45, cx - w / 2, cy + h * 0.3, cx - w / 2, cy); g.closePath();
}

/**
 * cv: canvas (170x190). res: strike result ({zone, off:[dx,dy] in zone radii, broke, up...}) or null.
 * near: closest approach for a miss ({zone, off, d}). opts: { quintain, arms:{c1,c2}, blank, ok }
 */
const FIG = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: 'assets/ui/tips/figure-512.png' }) : null;
const pending = new Map();
// The shield in the art: assets/ui/tips/figure-shield.png is its exact mask (alpha, a pixel dilated so the arms tuck under the rim) with the original painting's
// outline and shading as grey (multiplied back over the arms), cropped to SHX,SHY,SHW,SHH of the figure. SHQ is the quadratic map from a heater shield
// (u across 0..1, v down 0..1.2, in widths) to the art's pixels, fitted to the mask (IoU 0.98): the shield is curved and angled across his chest.
const SHX = 111, SHY = 283, SHW = 126, SHH = 157, SHQ = [111.76, 88.42, 46.28, 9.28, -19.96, 14.52, 328.91, -38.09, 94.10, -3.65, -5.88, 13.41];
const shMap = (u, v) => [SHQ[0] + SHQ[1] * u + SHQ[2] * v + SHQ[3] * u * u + SHQ[4] * u * v + SHQ[5] * v * v, SHQ[6] + SHQ[7] * u + SHQ[8] * v + SHQ[9] * u * u + SHQ[10] * u * v + SHQ[11] * v * v];
const SHIELD = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: 'assets/ui/tips/figure-shield.png' }) : null;
const ready = () => !!(FIG && FIG.complete && FIG.naturalWidth && SHIELD && SHIELD.complete && SHIELD.naturalWidth);
const redrawPending = () => { if (!ready()) return; for (const [cv, a] of [...pending]) { pending.delete(cv); drawHitMap(cv, ...a); } };
if (FIG) FIG.onload = redrawPending;
if (SHIELD) SHIELD.onload = redrawPending;
const armsCache = new Map();
/** His arms mapped onto the painted shield: a 2x picture of the crop, transparent outside the shield. */
function shieldArms(arms) {
  const key = JSON.stringify(arms) + (heraldryReady() ? 1 : 0);
  if (armsCache.has(key)) return armsCache.get(key);
  const S = 2, A = document.createElement('canvas'); A.width = 200; A.height = 240;
  drawArms(A.getContext('2d'), 200, 240, arms, { shape: 'shield', outline: heaterPath });
  const off = document.createElement('canvas'); off.width = SHW * S; off.height = SHH * S;
  const g = off.getContext('2d'), N = 10, M = 12, pt = (i, j) => { const [x, y] = shMap(i / N, 1.2 * j / M); return [(x - SHX) * S, (y - SHY) * S]; };
  const tri = (p0, p1, p2, s0, s1, s2) => {      // affine: source (s*) -> destination (p*)
    const d = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    const a = ((p1[0] - p0[0]) * (s2[1] - s0[1]) - (p2[0] - p0[0]) * (s1[1] - s0[1])) / d, c = ((p2[0] - p0[0]) * (s1[0] - s0[0]) - (p1[0] - p0[0]) * (s2[0] - s0[0])) / d;
    const b = ((p1[1] - p0[1]) * (s2[1] - s0[1]) - (p2[1] - p0[1]) * (s1[1] - s0[1])) / d, e = ((p2[1] - p0[1]) * (s1[0] - s0[0]) - (p1[1] - p0[1]) * (s2[0] - s0[0])) / d;
    g.save(); const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, ex = (q) => [q[0] + Math.sign(q[0] - cx) * 0.6, q[1] + Math.sign(q[1] - cy) * 0.6];
    g.beginPath(); for (const [k, q] of [p0, p1, p2].entries()) { const r = ex(q); if (k) g.lineTo(r[0], r[1]); else g.moveTo(r[0], r[1]); } g.closePath(); g.clip();
    g.setTransform(a, b, c, e, p0[0] - a * s0[0] - c * s0[1], p0[1] - b * s0[0] - e * s0[1]); g.drawImage(A, 0, 0); g.restore();
  };
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const q00 = pt(i, j), q10 = pt(i + 1, j), q01 = pt(i, j + 1), q11 = pt(i + 1, j + 1), sc = (ii, jj) => [ii / N * 200, jj / M * 240];
    tri(q00, q10, q01, sc(i, j), sc(i + 1, j), sc(i, j + 1)); tri(q10, q11, q01, sc(i + 1, j), sc(i + 1, j + 1), sc(i, j + 1));
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(SHIELD, 0, 0, SHW * S, SHH * S);
  if (heraldryReady() || !needsAtlas(arms)) { armsCache.set(key, off); if (armsCache.size > 24) armsCache.delete(armsCache.keys().next().value); }
  return off;
}

export function drawHitMap(cv, res, near, opts = {}) {
  const L = { w: 170, h: 200 }, dpr = 2;      // logical size; the canvas is kept at 2x so the painting stays crisp
  if (cv.width !== L.w * dpr) { cv.width = L.w * dpr; cv.height = L.h * dpr; }
  const g = cv.getContext('2d'), W = L.w, H = L.h;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!opts.blank && !opts.quintain && FIG && !ready()) pending.set(cv, [res, near, opts]);
  else pending.delete(cv);
  if (!opts.blank && !opts.quintain && ready() && !heraldryReady() && needsAtlas(opts.arms || {})) whenHeraldry(() => { if (cv._hm === opts) drawHitMap(cv, res, near, opts); });
  cv._hm = opts;
  g.clearRect(0, 0, W, H); g.lineJoin = 'round'; g.lineCap = 'round';
  if (opts.blank) {   // lesson result: a tick or a "go again" loop
    g.strokeStyle = opts.ok ? '#3d7a36' : RED; g.lineWidth = 12;
    g.beginPath();
    if (opts.ok) { g.moveTo(45, 100); g.lineTo(75, 132); g.lineTo(128, 62); }
    else { g.arc(85, 95, 40, 0.6, Math.PI * 1.75); g.moveTo(112, 52); g.lineTo(118, 78); g.moveTo(112, 52); g.lineTo(88, 60); }
    g.stroke(); return;
  }
  const arms = opts.arms || { c1: '#a81e1e', c2: '#ece8dc' };
  const Z = opts.quintain ? ZONES.quintain : ZONES.knight;
  g.strokeStyle = INK; g.lineWidth = 2;
  if (opts.quintain) {
    g.fillStyle = '#7a5a36'; g.fillRect(140, 20, 9, 165); g.strokeRect(140, 20, 9, 165);          // post
    g.fillRect(40, 72, 105, 8); g.strokeRect(40, 72, 105, 8);                                       // arm
    g.fillStyle = arms.c1; g.fillRect(52, 46, 66, 66); g.fillStyle = arms.c2; g.fillRect(85, 46, 33, 33); g.fillRect(52, 79, 33, 33);
    g.strokeRect(52, 46, 66, 66);
    g.fillStyle = GOLD; g.beginPath(); g.arc(85, 79, 9, 0, Math.PI * 2); g.fill(); g.stroke();
  } else {
    // the painted knight, head-on, no horse
    if (ready()) {
      const [x0, y0] = P(0, -FEXT), dh = 650 * FSC;
      g.drawImage(FIG, x0, y0, 272 * FSC, dh);
      // his arms, warped onto the painted shield (clipped to its exact shape), then the painting's own outline and shading multiplied back over them
      const dx = x0 + SHX * FSC, dy = y0 + SHY * FSC, dw = SHW * FSC, dhh = SHH * FSC;
      g.drawImage(shieldArms(arms), dx, dy, dw, dhh);
      g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(SHIELD, dx, dy, dw, dhh); g.restore();
    }
    // the horse is not in the picture: a foul on it is marked on a band under his feet
    g.fillStyle = 'rgba(122,90,54,.28)'; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(24, 188, 122, 12, 5) : g.rect(24, 188, 122, 12); g.fill(); g.stroke();
  }
  // labels
  g.font = '700 9px Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(244,234,208,.9)';
  const lab = (t, x, y, al = 'center') => { g.textAlign = al; g.strokeText(t, x, y); g.fillText(t, x, y); };
  if (!opts.quintain) { lab('HELM', 104, 56, 'left'); lab('SHIELD', 120, 100, 'left'); lab('BODY', 62, 134, 'right'); lab('HORSE', 85, 197); }

  if (!res || res.zone === 'none') return;
  if (res.zone === 'miss') {
    if (res.up) {   // the lance never came down
      g.strokeStyle = RED; g.lineWidth = 5; g.beginPath(); g.moveTo(24, 150); g.lineTo(24, 40); g.moveTo(14, 56); g.lineTo(24, 38); g.lineTo(34, 56); g.stroke(); return;
    }
    if (near && Z[near.zone]) {
      const [cx, cy, r] = Z[near.zone];
      const x = Math.max(10, Math.min(W - 10, cx + near.off[0] * r)), y = Math.max(10, Math.min(H - 10, cy - near.off[1] * r));
      g.strokeStyle = RED; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke();
    }
    return;
  }
  const zc = Z[res.zone]; if (!zc) return;
  const [cx, cy, r] = zc, off = res.off || [0, 0];
  g.strokeStyle = RED; g.lineWidth = 3; g.globalAlpha = 0.85; g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  burst(g, cx + Math.max(-1, Math.min(1, off[0])) * r * 0.85, cy - Math.max(-1, Math.min(1, off[1])) * r * 0.85, res.broke || res.unhorse ? 15 : 9);
}

/** The paper-doll of a harness: shield, helm, breastplate and the shield-side shoulder, tinted from steel (sound) through yellow to red (ruined). dmg: {shield, helm, breast, pauldronL}. */
export function drawDoll(cv, dmg) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const tint = (v) => v < 0.04 ? '#d3d0c4' : `hsl(${Math.round(48 - 48 * Math.min(1, v))}, 78%, ${Math.round(58 - 12 * Math.min(1, v))}%)`;
  g.clearRect(0, 0, W, H); g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = INK;
  const part = (v, draw) => { g.fillStyle = tint(v); g.beginPath(); draw(); g.fill(); g.stroke(); };
  g.fillStyle = '#b9b3a1'; g.beginPath(); g.moveTo(14, 28); g.lineTo(9, 56); g.lineTo(15, 58); g.lineTo(20, 34); g.fill(); g.stroke();   // his lance arm
  part(0, () => { g.moveTo(21, 54); g.lineTo(19, 70); g.lineTo(37, 70); g.lineTo(35, 54); g.closePath(); });                          // the harness below
  part(dmg.breast, () => { g.moveTo(17, 27); g.quadraticCurveTo(28, 21, 39, 27); g.lineTo(36, 54); g.lineTo(20, 54); g.closePath(); });
  part(dmg.pauldronL, () => g.ellipse(41, 29, 7, 6, 0.3, 0, Math.PI * 2));
  part(dmg.helm, () => g.arc(28, 14, 9, 0, Math.PI * 2));
  g.lineWidth = 2.5; g.beginPath(); g.moveTo(22, 14); g.lineTo(34, 14); g.stroke(); g.lineWidth = 2;
  part(dmg.shield, () => { g.moveTo(37, 34); g.lineTo(55, 34); g.lineTo(55, 47); g.bezierCurveTo(55, 54, 49, 59, 46, 62); g.bezierCurveTo(43, 59, 37, 54, 37, 47); g.closePath(); });
}
