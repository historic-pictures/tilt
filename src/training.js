// training.js — the training ground: a meadow at the edge of a camp (used for every practice / quintain session instead of a tournament venue).
// No stands, no crowd: a rough wooden practice tilt, a few tents, a cooking fire, a cart, a lance rack, hay, a stream with willows and rocks, and five onlookers.
// Everything is cheap: shared geometry, flat colours. Layout (the lists run along z, riders at x = +-LANE_X, starts at z = +-40):
//   camp on the +x side, stream on the -x side (V.streamX), rope fence both sides of the track.
import * as THREE from 'three';
import { SCANS, buildCards, scanVariants, scatter } from './scans.js';
import { person } from './ceremony.js';
import { box, limb, canvasTex, photoTex, TAU } from './util.js';

const C = (hex) => new THREE.Color(hex);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, envMapIntensity: 0.25 }, o));
const hayTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#c9a850'; g.fillRect(0, 0, w, h);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 520; i++) { g.strokeStyle = ['#e0c36a', '#a98a3a', '#d8b858', '#8f7430'][i % 4]; g.lineWidth = 1; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 5); g.stroke(); }
});

/** opts: { V (the TRAINING_GROUND entry), light (the world's light numbers), woodMat, woodDark, LIST_HALF, LANE_X, seed } */
export function buildTraining(grp, opts) {
  const { V, light, woodMat, woodDark, LIST_HALF } = opts;
  let s = (opts.seed || 5) * 9301 + 49297; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = { tilt: null, update: () => {} };
  const anim = [];      // per-frame callbacks
  const canvas = (c) => mat(c, { side: THREE.DoubleSide, normalMap: photoTex('rough_linen', 'nor_gl', [3, 2]) });
  const rope = mat(0x8a7556, { roughness: 1 });
  const wood = woodMat, dark = woodDark;

  // ---------- the practice tilt: rough unpainted posts, two rails and a few planks ----------
  {
    const tilt = new THREE.Group();
    const n = Math.round(LIST_HALF * 2 / 3);
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 7), posts = new THREE.InstancedMesh(postGeo, dark, n + 1), m = new THREE.Matrix4();
    for (let i = 0; i <= n; i++) { m.makeTranslation((r() - 0.5) * 0.05, 0.7, -LIST_HALF + i * (LIST_HALF * 2 / n)); posts.setMatrixAt(i, m); }
    posts.castShadow = true; tilt.add(posts);
    for (const y of [0.55, 1.1]) tilt.add(box([0.1, y, 0], [0.07, 0.2, LIST_HALF * 2 + 0.2], wood));
    for (let i = 0; i < 9; i++) {      // a few boards nailed on, gaps between
      const z = -LIST_HALF + 3 + r() * (LIST_HALF * 2 - 6), len = 1.2 + r() * 2.2;
      tilt.add(box([-0.09, 0.82 + (r() - 0.5) * 0.1, z], [0.04, 0.34, len], wood));
    }
    grp.add(tilt); out.tilt = tilt;
  }

  // ---------- rope fence along both sides of the track ----------
  {
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.25, 6), pts = [];
    for (const x of [-8.5, 8.5]) {
      const z0 = -36, z1 = 36, k = 18;
      for (let i = 0; i <= k; i++) pts.push([x, z0 + (z1 - z0) * i / k]);
      for (const y of [0.6, 1.1]) grp.add(limb([x, y, z0], [x, y, z1], 0.022, 0.022, rope, 5));
    }
    const posts = new THREE.InstancedMesh(postGeo, dark, pts.length), m = new THREE.Matrix4();
    pts.forEach((p, i) => { m.makeTranslation(p[0], 0.62, p[1]); posts.setMatrixAt(i, m); });
    posts.castShadow = true; grp.add(posts);
  }

  // ---------- tents: plain canvas, one or two striped ----------
  const pavilion = (x, z, col, s2 = 1, stripes = null) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s2); g.rotation.y = r() * TAU;
    let tm = stripes ? null : canvas(col);
    if (stripes) { tm = mat(0xffffff, { side: THREE.DoubleSide, map: canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? stripes[1] : stripes[0]; c.fillRect(w / 8 * i, 0, w / 8 + 1, h); } }, { repeat: [2, 1] }) }); }
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.2, 1.8, 14, 1, true), tm); wall.position.y = 0.9; wall.castShadow = true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 2.3, 14, 1, true), tm); roof.position.y = 2.95; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), mat(0x1c140d)); door.position.set(0, 0.76, 2.17); g.add(door);
    grp.add(g);
  };
  const wedge = (x, z, yaw, col) => {      // an A-frame soldier's tent
    const rr = 1.5, len = 3.4, g = new THREE.Group(); g.position.set(x, rr * 0.5, z); g.rotation.y = yaw;
    const geo = new THREE.CylinderGeometry(rr, rr, len, 3, 1, true); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, canvas(col)); m.castShadow = m.receiveShadow = true; g.add(m); grp.add(g);
  };
  const nT = V.tents ?? 5;
  const tentList = [
    () => pavilion(18, -20, '#d9cfb0', 1.0),
    () => pavilion(22, 6, null, 1.05, ['#8f1d1d', '#eadfbe']),
    () => wedge(15, 20, 1.5, '#cfc4a2'),
    () => pavilion(27, -34, '#cdbf9c', 0.9),
    () => wedge(29, 22, 0.2, '#d9d0b4'),
    () => pavilion(14, -42, null, 0.85, ['#1f3f7a', '#eadfbe']),
  ];
  tentList.slice(0, nT).forEach(f => f());

  // ---------- cooking fire with a pot, logs to sit on ----------
  {
    const fx = 12.5, fz = 1.5, g = new THREE.Group(); g.position.set(fx, 0, fz); grp.add(g);
    const stoneM = mat(0x7a7468, { roughness: 1 });
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + r() * 0.05, 0), stoneM); st.position.set(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55); st.rotation.set(r(), r(), r()); st.castShadow = true; g.add(st); }
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.06, 10), new THREE.MeshBasicMaterial({ color: 0x3a1608 })); ember.position.y = 0.05; g.add(ember);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; g.add(limb([Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35], [-Math.cos(a) * 0.1, 0.2, -Math.sin(a) * 0.1], 0.05, 0.05, dark, 5)); }
    const flames = [0xff8a1a, 0xffc23a].map((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.3 - i * 0.1, 0.8 - i * 0.2, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, fog: true })); f.position.y = 0.4 - i * 0.04; g.add(f); return f; });
    anim.push(t => flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 4) + i) * 0.14 + Math.sin(t * 23 + i * 2) * 0.07; f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k)); f.rotation.y = t * 2; }));
    for (const sx of [-1, 1]) { g.add(limb([sx * 0.95, 0, -0.1], [sx * 0.05, 1.5, 0], 0.035, 0.03, dark, 5)); }
    g.add(limb([0, 1.5, 0], [0, 1.1, 0], 0.012, 0.012, mat(0x222222), 4));
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, TAU, 0, Math.PI * 0.62), mat(0x1c1c1e, { roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })); pot.position.y = 0.97; pot.scale.set(1, 1, 1); pot.castShadow = true; g.add(pot);
    for (const [lx, lz, yaw] of [[-1.6, 0.6, 0.3], [0.4, 1.8, 1.7]]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.5, 8), dark); lg.rotation.z = Math.PI / 2; lg.rotation.y = yaw; lg.position.set(lx, 0.18, lz); lg.castShadow = true; g.add(lg); }
  }

  // ---------- a cart ----------
  {
    const g = new THREE.Group(); g.position.set(12, 0, -12); g.rotation.y = 0.35; grp.add(g);
    g.add(box([0, 0.78, 0], [1.5, 0.12, 2.6], wood));
    for (const sx of [-1, 1]) { g.add(box([sx * 0.72, 1.0, 0], [0.06, 0.34, 2.6], dark)); }
    g.add(box([0, 1.0, -1.28], [1.5, 0.34, 0.06], dark));
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 6, 16), dark); w.rotation.y = Math.PI / 2; w.position.set(sx * 0.86, 0.55, 0.2); w.castShadow = true; g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), dark); hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); g.add(hub);
      for (let k = 0; k < 4; k++) { const sp = limb([sx * 0.86, 0.55, 0.2], [sx * 0.86, 0.55 + Math.sin(k * Math.PI / 4 * 2 + 0.4) * 0.5, 0.2 + Math.cos(k * Math.PI / 4 * 2 + 0.4) * 0.5], 0.025, 0.025, dark, 4); g.add(sp); }
    }
    g.add(limb([-0.5, 0.8, 1.2], [-0.35, 0.45, 3.6], 0.05, 0.04, dark, 5), limb([0.5, 0.8, 1.2], [0.35, 0.45, 3.6], 0.05, 0.04, dark, 5));
    const sack = mat(0xcbb98e); for (const [x, z] of [[-0.3, -0.7], [0.3, -0.3], [0, 0.5]]) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), sack); sk.scale.set(1, 0.8, 0.9); sk.position.set(x, 1.2, z); sk.castShadow = true; g.add(sk); }
  }

  // ---------- a rack of practice lances (blunt, unpainted) ----------
  {
    const g = new THREE.Group(); g.position.set(6.2, 0, -26); grp.add(g);
    for (const z of [-1.2, 1.2]) for (const x of [-0.5, 0.5]) g.add(limb([x * 0.5, 0, z], [x * 0.9, 1.5, z], 0.05, 0.05, dark, 5));
    for (const y of [0.55, 1.2]) g.add(box([0, y, -1.2], [0.8, 0.07, 0.07], dark), box([0, y, 1.2], [0.8, 0.07, 0.07], dark));
    const lanceM = mat(0xb59a6c);
    for (let i = 0; i < 6; i++) { const lx = -0.25 + (i % 3) * 0.25, ly = 0.8 + Math.floor(i / 3) * 0.28; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.045, 3.7, 6), lanceM); l.rotation.x = Math.PI / 2; l.position.set(lx, ly, 0); l.castShadow = true; g.add(l); }
  }

  // ---------- hay bales ----------
  {
    const geo = new THREE.BoxGeometry(1.1, 0.55, 0.62), bales = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: hayTex(), roughness: 1, envMapIntensity: 0.2 }), 24), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    const spots = [[9.6, -30, 0.1, 0], [10.9, -29.2, 0.4, 0], [10.2, -29.6, 0.2, 1], [9.7, 24, 1.2, 0], [9.9, 25.2, 1.6, 0], [-9.8, -38, 0.2, 0], [-9.6, 38, 2.9, 0], [-10.8, 37.5, 3.2, 0], [15, 5.5, 0.3, 0], [16.3, 5.8, 0.1, 0]];
    let n = 0; const cap = Math.min(V.hayBales ?? 7, spots.length);
    for (let i = 0; i < cap; i++) { const [x, z, yaw, up] = spots[i]; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); bales.setMatrixAt(n++, m.compose(p.set(x, 0.275 + up * 0.55, z), q, sc)); }
    bales.count = n; bales.castShadow = bales.receiveShadow = true; grp.add(bales);
  }

  // ---------- the stream: a ribbon of water meandering along -x, with a muddy bank ----------
  const sx0 = V.streamX ?? -22, sw = V.streamW ?? 5.5, cx = (z) => sx0 + Math.sin(z * 0.045) * 2.2 + Math.sin(z * 0.11) * 0.6;
  {
    const NZ = 70, NX = 6, z0 = -120, z1 = 120;
    const mk = (half, y, material, anim2) => {
      const geo = new THREE.PlaneGeometry(1, 1, NX - 1, NZ - 1), pos = geo.attributes.position;
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i, z = z0 + (z1 - z0) * j / (NZ - 1); pos.setXYZ(k, cx(z) + (i / (NX - 1) - 0.5) * 2 * half, y, z); }
      geo.rotateX(0); pos.needsUpdate = true;
      // PlaneGeometry lies in XY with +z normal: build our own index so it faces up
      const idx = []; for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx.push(a, b, c, b, d, c); }
      geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; grp.add(mesh);
      if (anim2) { const base = pos.array.slice(); anim.push(t => { const a = pos.array; for (let k = 0; k < a.length; k += 3) a[k + 1] = base[k + 1] + Math.sin(a[k + 2] * 0.9 - t * 1.7 + a[k] * 1.3) * 0.012; pos.needsUpdate = true; geo.computeVertexNormals(); }); }
      return mesh;
    };
    mk(sw / 2 + 1.1, 0.012, mat(0x5e4c33, { roughness: 1 }), false).renderOrder = 1;
    const water = mk(sw / 2, 0.05, new THREE.MeshStandardMaterial({ color: 0x4a7886, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.9, envMapIntensity: 1.2 }), true);
    water.receiveShadow = false;
  }

  // ---------- willows and trees on the banks (the scanned tree cards), rocks along the water ----------
  {
    const timeU = { value: 0 }, items = new Map();
    const SP = [['tree_small_02', 8, 11], ['island_tree_01', 7, 9.5], ['tree_small_02', 7, 9], ['island_tree_02', 4.5, 6.5]].filter(sp => SCANS.cards.has(sp[0]));
    if (SP.length) {
      const place = (z, side) => { const sp = SP[(r() * SP.length) | 0], h = sp[1] + r() * (sp[2] - sp[1]), x = cx(z) + side * (sw / 2 + 2 + r() * 5);
        if (!items.has(sp[0])) items.set(sp[0], []); items.get(sp[0]).push({ x, z, s: h / SCANS.cards.get(sp[0]).meta.H, yaw: r() * TAU, color: C(0xffffff).setRGB(0.8 + r() * 0.15, 0.95 + r() * 0.1, 0.62 + r() * 0.12) }); };
      for (let z = -70; z <= 70; z += 13 + r() * 9) { if (Math.abs(z) > 30 || r() < 0.55) place(z, r() < 0.65 ? -1 : 1); }
      for (let i = 0; i < 4; i++) place(-60 + i * 40 + r() * 15, 1);
      for (const [id, its] of items) buildCards(grp, id, its, light, timeU, 'train_trees_' + id);
      anim.push(t => { timeU.value = t; });
    }
    const rocks = scanVariants('rock_moss_set_01');
    if (rocks.length) {
      const per = rocks.map(() => []);
      for (let i = 0; i < 22; i++) { const z = -60 + r() * 120, side = r() < 0.5 ? -1 : 1; per[(r() * rocks.length) | 0].push({ x: cx(z) + side * (sw / 2 + 0.2 + r() * 1.2), z, y: -0.05, yaw: r() * TAU, s: 0.14 + r() * 0.3 }); }
      for (let i = 0; i < 5; i++) { const z = -30 + r() * 60; per[(r() * rocks.length) | 0].push({ x: cx(z) + (r() - 0.5) * sw * 0.7, z, y: -0.1, yaw: r() * TAU, s: 0.12 + r() * 0.18 }); }
      for (let i = 0; i < 6; i++) per[(r() * rocks.length) | 0].push({ x: -4 - r() * 6 + (r() < 0.5 ? 0 : 22), z: -50 + r() * 100, y: -0.05, yaw: r() * TAU, s: 0.12 + r() * 0.2 });
      rocks.forEach((v, i) => scatter(grp, v, per[i], { name: 'train_rock' }));
    }
    // a stump or two beside the fire, a barrel and a bucket for the camp
    const stump = scanVariants('tree_stump_01', { whole: true })[0];
    if (stump) scatter(grp, stump, [{ x: 10.6, z: 3.2, y: -0.05, yaw: 1, s: 0.45 }, { x: 14.6, z: -0.6, y: -0.05, yaw: 2, s: 0.4 }], { name: 'train_stump' });
    const barrels = scanVariants('wooden_barrels_01', { match: 'barrel' })[0] || scanVariants('wine_barrel_01', { whole: true })[0];
    if (barrels) scatter(grp, barrels, [{ x: 14.8, z: -10.4, yaw: 0.4, s: 0.9 }, { x: 15.6, z: -9.6, yaw: 1.2, s: 0.9 }], { name: 'train_barrel' });
    const bucket = scanVariants('wooden_bucket_01', { whole: true })[0];
    if (bucket) scatter(grp, bucket, [{ x: sx0 + sw / 2 + 1.2 + 0, z: 6, yaw: 0.4, s: 1 }, { x: 14.2, z: 3, yaw: 2, s: 1 }], { name: 'train_bucket' });
  }

  // ---------- onlookers: two squires by the rack, a groom with a horse, a boy on the fence, a woman at the fire ----------
  {
    const folk = [], add = (o, x, y, z, yaw) => { const p = person(grp, o); p.g.position.set(x, y, z); p.g.rotation.y = yaw; folk.push(p); return p; };
    const n = V.onlookers ?? 5;
    const list = [
      () => add({ hose: '#4b3a2a', coat: '#7a3b2a', tab: '#d9b23c', hat: '#6a2a2a' }, 5.2, 0, -28.4, -1.2),
      () => add({ hose: '#5a4a38', coat: '#2f4f7a', tab: null, hat: '#2f4f7a' }, 5.4, 0, -24.6, -1.9),
      () => { const p = add({ hose: '#4b3a2a', coat: '#6e4e2e', tab: null, hat: null }, 13.6, 0, 18.2, 3.4); p.armR.rotation.x = -0.9; return p; },
      () => { const p = add({ hose: '#5b4a35', coat: '#8f7a52', tab: null, hat: '#a8956a' }, 8.5, 0.25, -14, -Math.PI / 2); p.legL.rotation.x = 0.2; p.legR.rotation.x = -0.1; return p; },
      () => add({ hose: '#6b5a45', coat: '#8a3a52', tab: null, hat: null }, 11.2, 0, 3.6, 2.5),
    ];
    list.slice(0, n).forEach(f => f());
    // the groom's horse: a few primitives, standing by the groom
    if (n >= 3) {
      const hg = new THREE.Group(); hg.position.set(15.2, 0, 17.6); hg.rotation.y = 2.4; grp.add(hg);
      const coat = mat(0x6d4a2c, { roughness: 0.8 }), dk = mat(0x261a10, { roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 4, 10), coat); body.rotation.x = Math.PI / 2; body.position.set(0, 1.3, 0); body.castShadow = true; hg.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.9, 8), coat); neck.position.set(0, 1.75, 0.8); neck.rotation.x = 0.55; neck.castShadow = true; hg.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.55), coat); head.position.set(0, 1.78, 1.2); head.rotation.x = 0.9; hg.add(head);
      const tail = limb([0, 1.45, -0.85], [0, 0.6, -1.0], 0.06, 0.03, dk, 5); hg.add(tail);
      for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) hg.add(limb([x, 1.0, z], [x, 0.05, z], 0.07, 0.045, coat, 6));
      const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.14), dk); mane.position.set(0, 1.9, 0.62); mane.rotation.x = 0.55; hg.add(mane);
      anim.push(t => { head.rotation.x = 0.9 + Math.sin(t * 0.5) * 0.08; neck.rotation.x = 0.55 + Math.sin(t * 0.5) * 0.04; tail.rotation.x = Math.sin(t * 1.3) * 0.12; });
    }
    anim.push(t => folk.forEach((p, i) => { p.head.rotation.y = Math.sin(t * 0.35 + p.ph) * 0.35; p.torso.rotation.z = Math.sin(t * 0.6 + i) * 0.015; }));
  }

  out.update = (t) => { for (const f of anim) f(t); };
  return out;
}
