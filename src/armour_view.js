// Armour review page (armour.html): the Blender-built pieces in assets/models/armour on the current knight, or standing alone,
// under one of the game's skies, with an old / new toggle. Nothing here is wired into the game: jouster.js is used as it is and
// the new pieces are hung on its groups (helm, torso, rider, lance) from outside.
//   ?view=knight|stechhelm|armet|cuirass|lance|barrier  &mode=old|new  &helm=stechhelm|armet  &head=coronel|wartip  &tier=512
//   &cam=x,y,z,tx,ty,tz  (for repeatable screenshots)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Jouster, preloadHorse, preloadKnight } from './jouster.js';
import { HORSES, harness } from './data.js';
import { armsTexture } from './util.js';

try { localStorage.setItem('tilt.sound', 'off'); } catch (e) { /* ignore */ }
const Q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
const HELM_OF = { mail: 'greathelm', bascinet: 'bascinet', milanese: 'armet', stechzeug: 'frogmouth' };      // the helm each harness comes with
const DIR = 'assets/models/armour/', SKIES = ['kloofendal_48d_partly_cloudy_puresky', 'kloppenheim_03_puresky', 'qwantani_afternoon_puresky', 'sunflowers_puresky', 'kloofendal_overcast_puresky', 'evening_road_01_puresky'];
const S = { harness: Q.get('harness') || 'stechzeug', rhelm: Q.get('rhelm') || '', lancev: Q.get('lance') || 'standard', pose: Q.get('pose') || 'Seated', scale: Q.get('scale') || 'true', mode: Q.get('mode') || 'new', view: Q.get('view') || 'knight', helm: Q.get('helm') || 'stechhelm', head: Q.get('head') || 'coronel', tier: Q.get('tier') === '512' ? '_512' : '', sky: Q.get('sky') || SKIES[0] };

if (!S.rhelm) S.rhelm = HELM_OF[S.harness];
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72; renderer.outputColorSpace = THREE.SRGBColorSpace;   // as main.js
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 400);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 40 }); sun.shadow.bias = -0.0004; scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const pm = new THREE.PMREMGenerator(renderer); let skyMeta = {};
async function setSky(name) {
  const tex = await new RGBELoader().loadAsync(`assets/sky/${name}_1k.hdr`); tex.mapping = THREE.EquirectangularReflectionMapping;
  if (scene.environment) scene.environment.dispose();
  scene.environment = pm.fromEquirectangular(tex).texture; scene.background = tex;
  const m = skyMeta[name] || { u: 0.6, el: 0.8 }, az = (m.u - 0.5) * Math.PI * 2 + Math.PI / 2;      // the sun's place in the picture (skies.json)
  sun.position.set(-Math.cos(az) * Math.cos(m.el), Math.sin(m.el), Math.sin(az) * Math.cos(m.el)).multiplyScalar(18);
  sun.intensity = m.peak > 100 ? 2.6 : 0.5;
}

// ---- the new pieces
const loader = new GLTFLoader(), cache = new Map();
async function piece(name) {
  const key = name + S.tier;
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`${DIR}${key}.glb`).then(g => {
    let tris = 0, tex = 0;
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; o.material.envMapIntensity = 1.15; tex = o.material.map ? o.material.map.image.width : tex; } });
    g.scene.userData = { tris, tex }; return g.scene;
  }));
  return (await cache.get(key)).clone(true);
}
const node = (root, name) => root.getObjectByName(name);

// The lance is baked with neutral paint. lance_mask (R = first colour, G = second, nothing where the paint is chipped or the wood is
// bare) says where each of the rider's two colours goes: colour = albedo * (R * c1 + G * c2) / 0.79 on the paint, albedo elsewhere.
const maskCache = new Map();
// tintMaterial: a copy of a baked material whose base colour is tinted through `<maskBase>_mask_<res>.png` (R = first colour, G = second).
async function tintMaterial(mat, maskBase, c1, c2) {
  const src = mat.map.image, w = src.width, h = src.height, res = w >= 1024 ? 1024 : 512, key = maskBase + res;
  if (!maskCache.has(key)) maskCache.set(key, new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = `${DIR}${maskBase}_mask_${res}.png`; }));
  const mask = await maskCache.get(key), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(mask, 0, 0, w, h); const M = g.getImageData(0, 0, w, h).data;
  g.drawImage(src, 0, 0, w, h); const I = g.getImageData(0, 0, w, h), A = I.data, a = new THREE.Color(c1), b = new THREE.Color(c2);
  const ca = [a.r, a.g, a.b].map(v => Math.pow(v, 1 / 2.2)), cb = [b.r, b.g, b.b].map(v => Math.pow(v, 1 / 2.2));      // multiply in display space, as a painter would see it
  for (let i = 0; i < A.length; i += 4) {
    const r = M[i] / 255, gg = M[i + 1] / 255, k = r + gg; if (k < 0.004) continue;
    for (let c = 0; c < 3; c++) A[i + c] = Math.min(255, A[i + c] * ((1 - Math.min(k, 1)) + (r * ca[c] + gg * cb[c]) / 0.79));
  }
  g.putImageData(I, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = mat.map.wrapS; t.wrapT = mat.map.wrapT; t.anisotropy = 4;
  const m2 = mat.clone(); m2.map = t; return m2;
}
async function tintLance(root, c1, c2, maskBase = 'lance') {
  let mat = null; root.traverse(o => { if (o.isMesh && !mat) mat = o.material; });
  const m2 = await tintMaterial(mat, maskBase, c1, c2); root.traverse(o => { if (o.isMesh && o.material === mat) o.material = m2; });
}
// the cloth of a harness (surcoat, the cover of the coat of plates) takes the rider's first colour through <set>_upper_mask
const FABRIC = { mail: 'mail_upper', bascinet: 'bascinet_upper' };
const LANCES = { light: 'lance_light', standard: 'lance', heavy: 'lance_heavy' };

// The targe's face is blank gesso; its second UV set (TEXCOORD_1) runs 0..1 across the face for the rider's arms.
function paintTarge(root, armsTex) {
  const f = root.getObjectByName('shield_face'); if (!f || !armsTex) return;
  const t = armsTex.clone(); t.channel = 1; t.flipY = false; t.needsUpdate = true;
  const m = f.material.clone(); m.map = t; m.color.set(0xffffff); f.material = m;
}

// ---- the rigged rider (assets/models/armour/rider.glb): body, arming clothes and harness skinned to a Mixamo-named skeleton,
// with one-frame pose clips. The lance and targe are the per-piece files, hung on the LanceSocket and ShieldSocket bones.
// The figure is a 1.73 m man; RIDER_GAME_SCALE brings him to the size of the game's present code-built rider.
const RIDER_GAME_SCALE = 1 / 0.8394;
async function addRig(arms) {
  const g = await loader.loadAsync(`${DIR}harness_${S.harness}${S.tier}.glb`), root = new THREE.Group(), k = S.scale === 'true' ? 1 : RIDER_GAME_SCALE;
  // any helm on any harness: the helm file carries the same skeleton, so its mesh is re-bound to this rider's bones by name
  const hg = await loader.loadAsync(`${DIR}helm_${S.rhelm}${S.tier}.glb`), byName = {}, helms = [];
  g.scene.traverse(o => { if (o.isBone) byName[o.name] = o; });
  hg.scene.traverse(o => { if (o.isSkinnedMesh) helms.push(o); });
  const home = g.scene.getObjectByName('Rider_Body').parent;
  for (const m of helms) { const sk = m.skeleton; home.add(m); m.bind(new THREE.Skeleton(sk.bones.map(b => byName[b.name]), sk.boneInverses), m.bindMatrix); }
  if (FABRIC[S.harness]) {
    const done = new Map(), ms = []; g.scene.traverse(o => { if (o.isMesh && o.material.name.startsWith(FABRIC[S.harness])) ms.push(o); });
    for (const o of ms) { if (!done.has(o.material)) done.set(o.material, await tintMaterial(o.material, FABRIC[S.harness], arms.c1, arms.c2)); o.material = done.get(o.material); }
  }
  let tris = 0, tex = 0;
  g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; o.material.envMapIntensity = 1.15; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; tex = o.material.map ? o.material.map.image.width : tex; } });
  root.add(g.scene); root.scale.setScalar(k); g.scene.updateMatrixWorld(true);
  const bone = (n) => g.scene.getObjectByName(n), hips = bone('Hips'), hipsY = hips.getWorldPosition(new THREE.Vector3()).y / 1;      // rest height of the hips above the feet (rig units)
  const hy = hips.position.y;
  stats.push(`${S.harness} + ${S.rhelm}: ${tris} tris, ${tex}² textures x3, ${g.animations.length} poses, ${(() => { let n = 0; g.scene.traverse(o => { if (o.isBone) n++; }); return n; })()} bones`);
  const la = await piece(LANCES[S.lancev]); addStat(la, LANCES[S.lancev]); await tintLance(la, arms.c1, arms.c2, LANCES[S.lancev]);
  const lg = new THREE.Group(); lg.rotation.x = -Math.PI / 2; lg.scale.setScalar(1 / k);      // the lance runs along the socket bone; it keeps its true length whatever the rider's scale
  for (const n of ['lance_rear', 'lance_fore', 'lance_vamplate', 'lance_grapper']) { const o = node(la, n); o.position.set(0, 0, 0); lg.add(o); }
  lg.getObjectByName('coronel').visible = S.head === 'coronel'; lg.getObjectByName('wartip').visible = S.head === 'wartip';
  bone('LanceSocket').add(lg);
  if (S.harness !== 'milanese') {      // the Milanese rider jousts on his reinforced left pauldron, without a shield
    const tg = await piece('targe'); addStat(tg, 'targe'); paintTarge(tg, armsTexture(arms, 512, 512));
    const sg = new THREE.Group(); for (const n of ['shield_face', 'shield_back']) { const o = node(tg, n); o.position.set(0, 0, 0); sg.add(o); }
    bone('ShieldSocket').add(sg);
  }
  const mixer = new THREE.AnimationMixer(g.scene), acts = {}; let cur = null;
  for (const c of g.animations) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat); acts[c.name] = a; }
  const setPose = (name, fade = 0.35) => { const a = acts[name]; if (!a || a === cur) return; a.reset().setEffectiveWeight(1).fadeIn(cur ? fade : 0).play(); if (cur) cur.fadeOut(fade); cur = a; };
  setPose(S.pose, 0); mixer.update(0);
  return { root, mixer, setPose, hipsY: hy, k, poses: Object.keys(acts) };
}

let stage = new THREE.Group(); scene.add(stage);
let J = null, tick = null, stats = [];
const hideOld = [];       // the current knight's parts the new pieces stand in for
function addStat(root, label) { const u = root.userData; if (u && u.tris) stats.push(`${label}: ${u.tris} tris, ${u.tex}² textures`); }

async function buildKnight() {
  await Promise.all([preloadHorse(), preloadKnight()]);
  const arms = { c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'paly', charge: 'none' };
  const j = J = new Jouster(stage, arms, 1, 0, HORSES.destrier, harness(S.harness, S.rhelm));      // the old rider in the same harness and helm, like for like
  j.update(0); j.root.position.set(0.95, 0, 0);
  const old = []; const mark = (o) => { if (o) old.push(o); };
  // everything of the old harness: the code-built helm (not the bare head or plume), the modelled plate (legs, arms and shoulders,
  // breast and back), the code-built ring / rest / belt / besagew on the torso, and the old lance
  for (const c of j.helm.children) if (c !== j.bareHead && c !== j.plume) mark(c);
  for (const m of j.plate || []) mark(m);
  for (const c of j.torso.children) if (c.isMesh && c.visible) mark(c);
  for (const c of j.lance.children) if (c.isMesh && c.visible) mark(c);
  const fresh = new THREE.Group();
  if (S.mode === 'new') {
    // the rigged rider takes the place of the whole code-built man: he hangs where the game's `rider` group hangs (its origin is the hips)
    j.rider.visible = false;
    const R = await addRig(arms); j.mount.add(R.root); fresh.userData.rig = R;
  }
  // the tilt beside him: new sections, or the game's striped box and rail
  const tilt = new THREE.Group(); stage.add(tilt);
  if (S.mode === 'new') {
    const tb = await piece('tilt_barrier'); addStat(tb, 'tilt section');
    for (let i = -3; i < 3; i++) { const s = tb.clone(true); s.position.z = i * 2 + 1; s.getObjectByName('tilt_cloth').visible = $('cloth').checked; tilt.add(s); }
    fresh.userData.tilt = tilt;
  } else {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 8; const g = cv.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#efe6cf' : '#a3201f'; g.fillRect(i * 32, 0, 32, 8); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })); cloth.position.y = 0.6;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 12.3), new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.8 })); rail.position.y = 1.24;
    for (const m of [cloth, rail]) { m.castShadow = m.receiveShadow = true; tilt.add(m); }
  }
  tick = (dt) => {
    j.lanceLower = THREE.MathUtils.damp(j.lanceLower, $('couch').checked ? 1 : 0, 4, dt); j.visorUp = $('visor').checked; j.update(dt);
    const R = fresh.userData.rig;
    if (R) { R.root.position.copy(j.rider.position); R.root.position.y -= R.hipsY * R.k; R.root.quaternion.copy(j.rider.quaternion); R.setPose($('couch').checked ? 'Couch' : S.pose); R.mixer.update(dt); }
    if (fresh.userData.tilt) for (const s of fresh.userData.tilt.children) s.getObjectByName('tilt_cloth').visible = $('cloth').checked;
  };
  const hy = j.helm.getWorldPosition(new THREE.Vector3()).y;      // follow the seat, whatever the horse's size
  return { target: new THREE.Vector3(0.95, hy - 0.45, 0.15), from: new THREE.Vector3(3.6, hy + 0.1, 4.4) };
}

async function buildAlone(name) {
  const tt = new THREE.Group(); stage.add(tt);
  const plinth = (h) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, h, 40), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85 })); m.position.y = h / 2; m.castShadow = m.receiveShadow = true; tt.add(m); };
  let target, from;
  if (S.mode === 'old') {
    // the same things as the game draws them now, lifted off a throwaway rider
    await Promise.all([preloadHorse(), preloadKnight()]);
    const j = new Jouster(stage, { c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'paly', charge: 'none' }, 1, 0, HORSES.destrier, harness('stechzeug', name === 'armet' ? 'armet' : 'frogmouth'));
    j.update(0); stage.remove(j.root);
    const take = (o, y) => { o.removeFromParent(); o.position.set(0, y, 0); o.rotation.set(0, 0, 0); o.traverse(c => { if (c.isMesh) c.castShadow = true; }); tt.add(o); };
    if (name === 'stechhelm' || name === 'armet') { j.plume.visible = false; take(j.helm, 1.2); plinth(1.1); target = new THREE.Vector3(0, 1.32, 0); from = new THREE.Vector3(0.75, 1.5, 1.1); }
    else if (name === 'cuirass') { const g = new THREE.Group(); for (const o of [...j.torso.children]) if (o.isMesh && o !== j.plate?.[1]) g.add(o); take(g, 1.0); plinth(0.75); target = new THREE.Vector3(0, 1.2, 0); from = new THREE.Vector3(1.0, 1.5, 1.6); }
    else if (name === 'arms' || name === 'legs') { const m = j.plate && j.plate[name === 'arms' ? 1 : 0]; if (m) take(m, name === 'arms' ? 1.0 : 1.75); plinth(0.75); target = new THREE.Vector3(0, 1.2, 0); from = new THREE.Vector3(1.3, 1.6, 2.0); }
    else if (name === 'rider') { take(j.rider, 1.0); target = new THREE.Vector3(0, 1.2, 0); from = new THREE.Vector3(1.6, 1.6, 3.0); }
    else if (name === 'targe') { take(j.shield, 1.35); plinth(1.0); target = new THREE.Vector3(0, 1.35, 0); from = new THREE.Vector3(0.6, 1.5, 1.2); }
    else if (name === 'lance') { take(j.lance, 1.2); j.lance.rotation.y = Math.PI / 2; target = new THREE.Vector3(0.6, 1.2, 0); from = new THREE.Vector3(0.2, 1.7, 3.4); }
    else { const b = await buildOldTilt(); tt.add(b); target = new THREE.Vector3(0, 0.7, 0); from = new THREE.Vector3(2.6, 1.6, 3.2); }
  } else {
    if (name === 'rider') {
      const R = await addRig({ c1: '#a81e1e', c2: '#ece8dc', c3: '#ece8dc', pattern: 'paly', charge: 'none' }); R.root.scale.setScalar(1); R.k = 1; tt.add(R.root);
      tick = (dt) => { if ($('spin').checked) tt.rotation.y += dt * 0.5; R.setPose($('couch').checked ? 'Couch' : S.pose); R.mixer.update(dt); };
      return { target: new THREE.Vector3(0, 0.95, 0), from: new THREE.Vector3(1.6, 1.4, 3.0) };
    }
    const p = await piece(name === 'barrier' ? 'tilt_barrier' : name); addStat(p, name);
    if (name === 'stechhelm' || name === 'armet') { p.position.y = 1.2; plinth(1.1); target = new THREE.Vector3(0, 1.32, 0); from = new THREE.Vector3(0.75, 1.5, 1.1); tt.userData.visor = p.getObjectByName('visor'); }
    else if (name === 'cuirass') { p.position.y = 1.0; plinth(0.75); target = new THREE.Vector3(0, 1.2, 0); from = new THREE.Vector3(1.0, 1.5, 1.6); }
    else if (name === 'arms' || name === 'legs') { p.position.y = name === 'arms' ? 1.0 : 1.75; plinth(0.75); target = new THREE.Vector3(0, 1.2, 0); from = new THREE.Vector3(1.3, 1.6, 2.0); }
    else if (name === 'lance') { await tintLance(p, '#a81e1e', '#ece8dc'); p.position.y = 1.2; p.rotation.y = Math.PI / 2; target = new THREE.Vector3(0.6, 1.2, 0); from = new THREE.Vector3(0.2, 1.7, 3.4); p.getObjectByName('coronel').visible = S.head === 'coronel'; p.getObjectByName('wartip').visible = S.head === 'wartip'; }
    else if (name === 'barrier') { for (const i of [-1, 1]) { const s = p.clone(true); s.position.z = i * 2; tt.add(s); } target = new THREE.Vector3(0, 0.7, 0); from = new THREE.Vector3(2.6, 1.6, 3.2); }
    else { p.position.y = 1.35; plinth(1.0); target = new THREE.Vector3(0, 1.35, 0); from = new THREE.Vector3(0.6, 1.5, 1.2); }
    tt.add(p);
  }
  if (name === 'rider' && S.mode === 'new') return { target, from };
  tick = (dt) => {
    if ($('spin').checked) tt.rotation.y += dt * 0.5;
    const v = tt.userData.visor; if (v) v.rotation.x = THREE.MathUtils.damp(v.rotation.x, $('visor').checked ? -1.25 : 0, 8, dt);
    tt.traverse(o => { if (o.name === 'tilt_cloth') o.visible = $('cloth').checked; });
  };
  return { target, from };
}
async function buildOldTilt() {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0xa3201f, roughness: 0.9 })); cloth.position.y = 0.6;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 6.3), new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.8 })); rail.position.y = 1.24; g.add(cloth, rail); return g;
}

let building = 0;
async function rebuild(keepCam = false) {
  const my = ++building; $('info').textContent = 'loading…'; stats = [];
  const next = new THREE.Group(), prev = stage; stage = next; scene.add(next);
  let r;
  try { r = S.view === 'knight' ? await buildKnight() : await buildAlone(S.view); } catch (e) { console.error(e); $('info').textContent = 'failed: ' + e.message; scene.remove(next); stage = prev; return; }
  if (my !== building) { scene.remove(next); return; }
  scene.remove(prev);
  if (!keepCam) {
    const c = (Q.get('cam') || '').split(',').map(Number);
    if (c.length === 6 && c.every(isFinite)) { camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); }
    else { camera.position.copy(r.from); controls.target.copy(r.target); }
  }
  sun.target.position.copy(controls.target);
  $('info').textContent = (S.mode === 'new' ? stats.join('\n') : 'the knight as the game draws him now') ;
  for (const id of ['old', 'new']) $(id).classList.toggle('on', S.mode === id);
  window.__ready = true;
}

const bind = (id, key, ev = 'change') => { const el = $(id); if (el.tagName === 'SELECT') el.value = S[key]; el.addEventListener(ev, () => { S[key] = el.value; rebuild(key !== 'view'); }); };
$('old').onclick = () => { S.mode = 'old'; rebuild(true); }; $('new').onclick = () => { S.mode = 'new'; rebuild(true); };
$('harness').addEventListener('change', () => { S.rhelm = HELM_OF[$('harness').value]; $('rhelm').value = S.rhelm; });      // a new harness brings its own helm
bind('harness', 'harness'); bind('rhelm', 'rhelm'); bind('lancev', 'lancev');
bind('view', 'view'); bind('helm', 'helm'); bind('head', 'head'); bind('tier', 'tier'); bind('scale', 'scale');
$('pose').value = S.pose; $('pose').addEventListener('change', () => { S.pose = $('pose').value; });
for (const s of SKIES) { const o = document.createElement('option'); o.value = s; o.textContent = s.replace(/_puresky$/, '').replace(/_/g, ' '); $('sky').append(o); }
$('sky').value = S.sky; $('sky').onchange = () => { S.sky = $('sky').value; setSky(S.sky); };
if (Q.has('couch')) $('couch').checked = true; if (Q.has('nocloth')) $('cloth').checked = false; if (Q.has('spin')) $('spin').checked = true;

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (tick) tick(dt);
  controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
(async () => {
  try { skyMeta = await (await fetch('assets/sky/skies.json')).json(); } catch (e) { /* default sun */ }
  await setSky(S.sky); await rebuild(); frame();
})();
// draw(n): step and draw n frames now (for captures while the tab is in the background and requestAnimationFrame sleeps)
window.ARMOUR = { S, scene, camera, controls, rebuild, get J() { return J; }, draw(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { if (tick) tick(dt); controls.update(); renderer.render(scene, camera); } } };
