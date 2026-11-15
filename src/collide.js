// Collision primitives for the joust: plain numbers, no Three objects, nothing allocated per call (results go into module-level or
// caller-owned scratch). Written so it can be ported to C++ line for line.
//
//   Cap  : capsule = segment a-b swept by radius r        (a sphere is a Cap with a == b)
//   Obb  : oriented box = centre, three unit axes u v w, half-extents h, and a rounding radius r (r > 0 gives a rounded box:
//          the true shape is the core box grown by r, so its edges and corners are curved and its normal turns round them)
//   Hit  : a contact result
//
// Moving shapes are pairs {p, c}: the pose at the start (p) and at the end (c) of a frame. A sweep interpolates both linearly
// (the box's axes are blended and re-orthonormalised) and finds the EARLIEST fraction s of the frame at which the signed gap
// between the two shapes falls to `margin` (0 = touching; negative = must have sunk in that far). Sampling is never coarser than
// STEP metres of relative motion and the first bracket is then bisected, so a thin shape cannot be tunnelled however fast it moves.
//
// Normals always point from B to A. `gap` is the signed distance between the surfaces (negative = overlapping).

const STEP = 0.05;      // largest relative move between two samples (m); thinner than any shape in the game, so nothing is stepped over
const MAXN = 24;        // samples per call, at most
const BISECT = 18;

export class Cap {
  constructor() { this.ax = 0; this.ay = 0; this.az = 0; this.bx = 0; this.by = 0; this.bz = 0; this.r = 0; }
  set(ax, ay, az, bx, by, bz, r) { this.ax = ax; this.ay = ay; this.az = az; this.bx = bx; this.by = by; this.bz = bz; this.r = r; return this; }
  copy(o) { this.ax = o.ax; this.ay = o.ay; this.az = o.az; this.bx = o.bx; this.by = o.by; this.bz = o.bz; this.r = o.r; return this; }
}
export class Obb {
  constructor() { this.cx = 0; this.cy = 0; this.cz = 0; this.ux = 1; this.uy = 0; this.uz = 0; this.vx = 0; this.vy = 1; this.vz = 0; this.wx = 0; this.wy = 0; this.wz = 1; this.hx = 0; this.hy = 0; this.hz = 0; this.r = 0; }
  copy(o) {
    this.cx = o.cx; this.cy = o.cy; this.cz = o.cz; this.ux = o.ux; this.uy = o.uy; this.uz = o.uz; this.vx = o.vx; this.vy = o.vy; this.vz = o.vz;
    this.wx = o.wx; this.wy = o.wy; this.wz = o.wz; this.hx = o.hx; this.hy = o.hy; this.hz = o.hz; this.r = o.r; return this;
  }
}
export class Hit {
  constructor() { this.hit = false; this.s = 0; this.u = 0; this.v = 0; this.gap = 0; this.px = 0; this.py = 0; this.pz = 0; this.nx = 0; this.ny = 1; this.nz = 0; this.vx = 0; this.vy = 0; this.vz = 0; }
}

// ------------------------------------------------------------------------------------------------------------ segments
/** Result of closestSegSeg: parameters s (on 1) and t (on 2) in [0,1], the two closest points and the distance. */
export const SS = { s: 0, t: 0, d: 0, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 };
const c01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Closest points of segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9), degenerate and parallel cases included. Fills SS, returns the distance. */
export function closestSegSeg(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z, o = SS) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z, d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z, rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-14 && e <= 1e-14) { s = 0; t = 0; }
  else if (a <= 1e-14) { s = 0; t = c01(f / e); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-14) { t = 0; s = c01(-c / a); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 * a * e ? c01((b * f - c * e) / den) : 0;      // parallel: any s will do, start at 0 and let t settle it
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = c01(-c / a); } else if (t > 1) { t = 1; s = c01((b - c) / a); }
    }
  }
  o.s = s; o.t = t;
  o.x1 = p1x + d1x * s; o.y1 = p1y + d1y * s; o.z1 = p1z + d1z * s; o.x2 = p2x + d2x * t; o.y2 = p2y + d2y * t; o.z2 = p2z + d2z * t;
  const dx = o.x1 - o.x2, dy = o.y1 - o.y2, dz = o.z1 - o.z2;
  return (o.d = Math.sqrt(dx * dx + dy * dy + dz * dz));
}

// ------------------------------------------------------------------------------------------------------------ static gaps
/** Capsule against capsule. Fills o (gap, u/v = parameters of the closest points on A/B, p = contact on B's surface, n = from B to A). Returns the gap. */
export function capCapGap(A, B, o) {
  const d = closestSegSeg(A.ax, A.ay, A.az, A.bx, A.by, A.bz, B.ax, B.ay, B.az, B.bx, B.by, B.bz);
  let nx, ny, nz;
  if (d > 1e-9) { nx = (SS.x1 - SS.x2) / d; ny = (SS.y1 - SS.y2) / d; nz = (SS.z1 - SS.z2) / d; }
  else {   // the axes cross: any direction square to both will do
    const ax = A.bx - A.ax, ay = A.by - A.ay, az = A.bz - A.az, bx = B.bx - B.ax, by = B.by - B.ay, bz = B.bz - B.az;
    nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l > 1e-9) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
  }
  o.u = SS.s; o.v = SS.t; o.gap = d - A.r - B.r;
  o.nx = nx; o.ny = ny; o.nz = nz; o.px = SS.x2 + nx * B.r; o.py = SS.y2 + ny * B.r; o.pz = SS.z2 + nz * B.r;
  return o.gap;
}

function boxD2(px, py, pz, hx, hy, hz) {
  const x = Math.abs(px) - hx, y = Math.abs(py) - hy, z = Math.abs(pz) - hz;
  const X = x > 0 ? x : 0, Y = y > 0 ? y : 0, Z = z > 0 ? z : 0;
  return X * X + Y * Y + Z * Z;
}
// the capsule's axis in the box's frame, used by capObbGap (module scratch, nothing allocated)
let _lax = 0, _lay = 0, _laz = 0, _ldx = 0, _ldy = 0, _ldz = 0, _hx = 0, _hy = 0, _hz = 0;
const fAt = (t) => boxD2(_lax + _ldx * t, _lay + _ldy * t, _laz + _ldz * t, _hx, _hy, _hz);

/**
 * Capsule against oriented (rounded) box. The distance from a point on the axis to the box is convex along the axis, so the closest
 * point is found by ternary search (30 steps: better than 0.01 mm on a 3 m lance). A capsule whose axis is inside the core box gets
 * a negative distance (depth to the nearest face) and that face's normal. Fills o as capCapGap does; u = parameter on the capsule's axis.
 */
export function capObbGap(A, B, o) {
  const ax = A.ax - B.cx, ay = A.ay - B.cy, az = A.az - B.cz, bx = A.bx - B.cx, by = A.by - B.cy, bz = A.bz - B.cz;
  _lax = ax * B.ux + ay * B.uy + az * B.uz; _lay = ax * B.vx + ay * B.vy + az * B.vz; _laz = ax * B.wx + ay * B.wy + az * B.wz;
  _ldx = (bx * B.ux + by * B.uy + bz * B.uz) - _lax; _ldy = (bx * B.vx + by * B.vy + bz * B.vz) - _lay; _ldz = (bx * B.wx + by * B.wy + bz * B.wz) - _laz;
  _hx = B.hx; _hy = B.hy; _hz = B.hz;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (fAt(m1) <= fAt(m2)) hi = m2; else lo = m1;
  }
  let t = (lo + hi) * 0.5, ft = fAt(t);
  const f0 = fAt(0), f1 = fAt(1);
  if (f0 < ft) { t = 0; ft = f0; } if (f1 < ft) { t = 1; ft = f1; }
  const px = _lax + _ldx * t, py = _lay + _ldy * t, pz = _laz + _ldz * t;
  let qx = px < -_hx ? -_hx : px > _hx ? _hx : px, qy = py < -_hy ? -_hy : py > _hy ? _hy : py, qz = pz < -_hz ? -_hz : pz > _hz ? _hz : pz;
  let nx = px - qx, ny = py - qy, nz = pz - qz, d = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (d > 1e-9) { nx /= d; ny /= d; nz /= d; }
  else {   // on or inside the core: out through the nearest face
    const dx = _hx - Math.abs(px), dy = _hy - Math.abs(py), dz = _hz - Math.abs(pz);
    nx = ny = nz = 0;
    if (dx <= dy && dx <= dz) { nx = px < 0 ? -1 : 1; qx = nx * _hx; d = -dx; }
    else if (dy <= dz) { ny = py < 0 ? -1 : 1; qy = ny * _hy; d = -dy; }
    else { nz = pz < 0 ? -1 : 1; qz = nz * _hz; d = -dz; }
  }
  // out to the world; the contact is on the rounded surface
  const cx = qx + nx * B.r, cy = qy + ny * B.r, cz = qz + nz * B.r;
  o.nx = nx * B.ux + ny * B.vx + nz * B.wx; o.ny = nx * B.uy + ny * B.vy + nz * B.wy; o.nz = nx * B.uz + ny * B.vz + nz * B.wz;
  o.px = B.cx + cx * B.ux + cy * B.vx + cz * B.wx; o.py = B.cy + cx * B.uy + cy * B.vy + cz * B.wy; o.pz = B.cz + cx * B.uz + cy * B.vz + cz * B.wz;
  o.u = t; o.v = 0; o.gap = d - B.r - A.r;
  return o.gap;
}

// ------------------------------------------------------------------------------------------------------------ interpolation
export function lerpCap(P, C, s, o) {
  o.ax = P.ax + (C.ax - P.ax) * s; o.ay = P.ay + (C.ay - P.ay) * s; o.az = P.az + (C.az - P.az) * s;
  o.bx = P.bx + (C.bx - P.bx) * s; o.by = P.by + (C.by - P.by) * s; o.bz = P.bz + (C.bz - P.bz) * s; o.r = C.r; return o;
}
export function lerpObb(P, C, s, o) {
  o.cx = P.cx + (C.cx - P.cx) * s; o.cy = P.cy + (C.cy - P.cy) * s; o.cz = P.cz + (C.cz - P.cz) * s;
  let ux = P.ux + (C.ux - P.ux) * s, uy = P.uy + (C.uy - P.uy) * s, uz = P.uz + (C.uz - P.uz) * s, l = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= l; uy /= l; uz /= l;
  let vx = P.vx + (C.vx - P.vx) * s, vy = P.vy + (C.vy - P.vy) * s, vz = P.vz + (C.vz - P.vz) * s;
  const d = vx * ux + vy * uy + vz * uz; vx -= d * ux; vy -= d * uy; vz -= d * uz; l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1; vx /= l; vy /= l; vz /= l;
  o.ux = ux; o.uy = uy; o.uz = uz; o.vx = vx; o.vy = vy; o.vz = vz;
  o.wx = uy * vz - uz * vy; o.wy = uz * vx - ux * vz; o.wz = ux * vy - uy * vx;
  o.hx = C.hx; o.hy = C.hy; o.hz = C.hz; o.r = C.r; return o;
}

// ------------------------------------------------------------------------------------------------------------ sweeps
const _A = new Cap(), _Bc = new Cap(), _Bo = new Obb(), _T = new Hit();

/** Evaluate the signed gap of the pair at fraction s of the frame (kind 0: capsule vs capsule, 1: capsule vs box); details left in _T. */
function gapAt(kind, A, B, s) {
  lerpCap(A.p, A.c, s, _A);
  if (kind === 0) { lerpCap(B.p, B.c, s, _Bc); return capCapGap(_A, _Bc, _T); }
  lerpObb(B.p, B.c, s, _Bo); return capObbGap(_A, _Bo, _T);
}
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

function sweep(kind, A, B, s0, s1, margin, o) {
  const Ap = A.p, Ac = A.c, Bp = B.p, Bc = B.c;
  const dAax = Ac.ax - Ap.ax, dAay = Ac.ay - Ap.ay, dAaz = Ac.az - Ap.az, dAbx = Ac.bx - Ap.bx, dAby = Ac.by - Ap.by, dAbz = Ac.bz - Ap.bz;
  let dBax, dBay, dBaz, dBbx, dBby, dBbz, rel;
  if (kind === 0) {
    dBax = Bc.ax - Bp.ax; dBay = Bc.ay - Bp.ay; dBaz = Bc.az - Bp.az; dBbx = Bc.bx - Bp.bx; dBby = Bc.by - Bp.by; dBbz = Bc.bz - Bp.bz;
    rel = Math.max(len3(dAax - dBax, dAay - dBay, dAaz - dBaz), len3(dAbx - dBbx, dAby - dBby, dAbz - dBbz), len3(dAax - dBbx, dAay - dBby, dAaz - dBbz), len3(dAbx - dBax, dAby - dBay, dAbz - dBaz));
  } else {
    dBax = dBbx = Bc.cx - Bp.cx; dBay = dBby = Bc.cy - Bp.cy; dBaz = dBbz = Bc.cz - Bp.cz;
    const rot = (Math.abs(Bc.ux - Bp.ux) + Math.abs(Bc.uy - Bp.uy) + Math.abs(Bc.uz - Bp.uz) + Math.abs(Bc.vx - Bp.vx) + Math.abs(Bc.vy - Bp.vy) + Math.abs(Bc.vz - Bp.vz)
      + Math.abs(Bc.wx - Bp.wx) + Math.abs(Bc.wy - Bp.wy) + Math.abs(Bc.wz - Bp.wz)) * Math.max(Bc.hx, Bc.hy, Bc.hz);
    rel = Math.max(len3(dAax - dBax, dAay - dBay, dAaz - dBaz), len3(dAbx - dBax, dAby - dBay, dAbz - dBaz)) + rot;
  }
  let n = Math.ceil(rel * (s1 - s0) / STEP); n = n < 2 ? 2 : n > MAXN ? MAXN : n;
  let lo = s0, g = gapAt(kind, A, B, s0), hi = -1;
  if (g <= margin) hi = s0;
  else for (let k = 1; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n;
    if (gapAt(kind, A, B, s) <= margin) { hi = s; break; }
    lo = s;
  }
  if (hi < 0) { o.hit = false; return false; }
  if (hi > lo) for (let i = 0; i < BISECT; i++) { const m = (lo + hi) * 0.5; if (gapAt(kind, A, B, m) <= margin) hi = m; else lo = m; }
  gapAt(kind, A, B, hi);
  o.hit = true; o.s = hi; o.u = _T.u; o.v = _T.v; o.gap = _T.gap; o.px = _T.px; o.py = _T.py; o.pz = _T.pz; o.nx = _T.nx; o.ny = _T.ny; o.nz = _T.nz;
  // how fast the two surfaces were moving at the contact (metres per frame): the point of A and the point of B, from their whole-frame motion
  const ua = o.u, ub = o.v;
  o.vx = (dAax + (dAbx - dAax) * ua) - (dBax + (dBbx - dBax) * ub); o.vy = (dAay + (dAby - dAay) * ua) - (dBay + (dBby - dBay) * ub); o.vz = (dAaz + (dAbz - dAaz) * ua) - (dBaz + (dBbz - dBaz) * ub);
  return true;
}

/** First contact in [s0,s1] of the frame between moving capsules A and B ({p,c} each). Contact when gap <= margin. Fills o, returns o.hit. */
export function sweepCapCap(A, B, s0, s1, margin, o) { return sweep(0, A, B, s0, s1, margin, o); }
/** Same, capsule A against moving box B. */
export function sweepCapObb(A, B, s0, s1, margin, o) { return sweep(1, A, B, s0, s1, margin, o); }

// ------------------------------------------------------------------------------------------------------------ segment / ray against a box
/**
 * Segment p-q against the box (core grown by r on every side, so a rounded box is treated as a square-cornered one: use it for
 * picking, not for the rounded corner). Slab test. Fills o.s (entry fraction of the segment), o.p (entry point) and o.n (face normal, world).
 * A segment that starts inside reports s = 0 and the normal of the nearest face to its start. Returns whether it touches.
 */
export function segmentObb(px, py, pz, qx, qy, qz, B, o) {
  const dx = qx - px, dy = qy - py, dz = qz - pz, ox = px - B.cx, oy = py - B.cy, oz = pz - B.cz;
  let tmin = 0, tmax = 1, ni = -1, ns = 0;
  const ax = [B.ux, B.uy, B.uz, B.vx, B.vy, B.vz, B.wx, B.wy, B.wz], hh = [B.hx + B.r, B.hy + B.r, B.hz + B.r];
  for (let i = 0; i < 3; i++) {
    const ex = ax[i * 3], ey = ax[i * 3 + 1], ez = ax[i * 3 + 2];
    const po = ox * ex + oy * ey + oz * ez, pd = dx * ex + dy * ey + dz * ez, h = hh[i];
    if (Math.abs(pd) < 1e-12) { if (Math.abs(po) > h) { o.hit = false; return false; } continue; }
    let t1 = (-h - po) / pd, t2 = (h - po) / pd, sgn = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
    if (t1 > tmin) { tmin = t1; ni = i; ns = sgn; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) { o.hit = false; return false; }
  }
  o.hit = true; o.s = tmin; o.px = px + dx * tmin; o.py = py + dy * tmin; o.pz = pz + dz * tmin;
  if (ni < 0) {   // started inside
    const ex = [ox * B.ux + oy * B.uy + oz * B.uz, ox * B.vx + oy * B.vy + oz * B.vz, ox * B.wx + oy * B.wy + oz * B.wz];
    let k = 0, best = 1e9; for (let i = 0; i < 3; i++) { const dd = hh[i] - Math.abs(ex[i]); if (dd < best) { best = dd; k = i; } }
    ni = k; ns = ex[k] < 0 ? -1 : 1;
  }
  o.nx = ax[ni * 3] * ns; o.ny = ax[ni * 3 + 1] * ns; o.nz = ax[ni * 3 + 2] * ns;
  return true;
}
