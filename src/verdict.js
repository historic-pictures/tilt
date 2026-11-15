// Draws where a lance landed on a simple front view of the target, like a marshal's sketch.
const INK = '#2a1c0e', RED = '#a81e1e', GOLD = '#c9992e', STEEL = '#c5c9cf', HIDE = '#a98a5e';

const ZONES = {
  knight: { helm: [85, 46, 17], shield: [113, 96, 23], body: [84, 100, 23], horse: [85, 152, 24] },
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
export function drawHitMap(cv, res, near, opts = {}) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
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
    // horse head and neck
    g.fillStyle = HIDE; g.beginPath(); g.moveTo(62, 118); g.lineTo(108, 118); g.lineTo(100, 186); g.lineTo(70, 186); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(85, 152, 15, 25, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(74, 130); g.lineTo(70, 116); g.lineTo(80, 126); g.moveTo(96, 130); g.lineTo(100, 116); g.lineTo(90, 126); g.stroke();   // ears
    // body
    g.fillStyle = STEEL; g.beginPath(); g.moveTo(58, 76); g.quadraticCurveTo(85, 64, 112, 76); g.lineTo(106, 126); g.lineTo(64, 126); g.closePath(); g.fill(); g.stroke();
    // lance arm on his right (your left), lance going up and away
    g.beginPath(); g.moveTo(58, 82); g.lineTo(48, 108); g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#8a6a3a'; g.beginPath(); g.moveTo(50, 112); g.lineTo(18, 30); g.stroke(); g.lineWidth = 2; g.strokeStyle = INK;
    // helm
    g.fillStyle = STEEL; g.beginPath(); g.arc(85, 46, 17, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(73, 44); g.lineTo(97, 44); g.lineWidth = 3; g.stroke(); g.lineWidth = 2;
    // shield on his left (your right)
    g.save(); heater(g, 113, 96, 38, 46); g.clip(); g.fillStyle = arms.c1; g.fillRect(90, 70, 50, 56); g.fillStyle = arms.c2; g.fillRect(113, 70, 26, 56); g.restore();
    heater(g, 113, 96, 38, 46); g.stroke();
  }
  // labels
  g.font = '700 9px Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center';
  if (!opts.quintain) { g.fillText('HELM', 85, 22); g.fillText('SHIELD', 142, 70); g.fillText('BODY', 40, 132); g.fillText('HORSE', 132, 176); }

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
