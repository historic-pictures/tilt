// Standalone Kimodo (SOMA BVH) motion test page. Does not import main.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';

const DIR = 'assets/motion/kimodo/';
const $ = id => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = 0x9cc8e8;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 40, 160);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// ---------- the lists ----------
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xa88f5e, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
sun.position.set(-8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const sand = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xd2b684, roughness: 1 }));
sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true; scene.add(sand);
// faint furrow lines every 5 m, so root motion can be read
const lineMat = new THREE.MeshBasicMaterial({ color: 0xb99a66 });
for (let z = -100; z <= 100; z += 5) {
  const l = new THREE.Mesh(new THREE.PlaneGeometry(24, 0.06), lineMat);
  l.rotation.x = -Math.PI / 2; l.position.set(0, 0.005, z); scene.add(l);
}
const wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
const white = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.9 });
const red = new THREE.MeshStandardMaterial({ color: 0x9c2218, roughness: 0.9 });
function shadowed(m) { m.castShadow = m.receiveShadow = true; return m; }
// the tilt barrier: long rail on posts, painted in white and red bands
const bx = -4.5;
const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 200), wood)); rail.position.set(bx, 1.45, 0); scene.add(rail);
const rail2 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 200), woodDark)); rail2.position.set(bx, 0.9, 0); scene.add(rail2);
const postG = new THREE.BoxGeometry(0.18, 1.6, 0.18);
for (let z = -100; z <= 100; z += 2.5) {
  const p = shadowed(new THREE.Mesh(postG, ((z / 2.5) & 1) ? white : red)); p.position.set(bx, 0.8, z); scene.add(p);
}
// fence line farther back
const fx = -14;
const frail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 200), wood)); frail.position.set(fx, 1.1, 0); scene.add(frail);
const frail2 = frail.clone(); frail2.position.y = 0.6; scene.add(frail2);
const fpostG = new THREE.BoxGeometry(0.12, 1.3, 0.12);
for (let z = -100; z <= 100; z += 2) { const p = shadowed(new THREE.Mesh(fpostG, woodDark)); p.position.set(fx, 0.65, z); scene.add(p); }

// ---------- figures ----------
const GREY = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.75 });
const HEAD = new THREE.MeshStandardMaterial({ color: 0xb4b0a8, roughness: 0.7 });
const NOSE = new THREE.MeshStandardMaterial({ color: 0xc86a4a, roughness: 0.7 });
// limb radius (cm) by the name of the CHILD bone: the limb runs from its parent bone to it
const RAD = [
  [/^Spine1$/, 14], [/^Spine2$/, 14], [/^Chest$/, 14], [/^Neck1$/, 13], [/^Neck2$/, 4.5], [/^Head$/, 4.5],
  [/Shoulder$/, 5], [/Arm$/, 5], [/ForeArm$/, 4.2], [/Hand$/, 3.8], [/HandMiddle1$/, 3.4],
  [/^(Left|Right)Leg$/, 7], [/Shin$/, 5.8], [/Foot$/, 4.4], [/ToeBase$/, 4], [/ToeEnd$/, 3],
];
const radOf = n => { for (const [re, r] of RAD) if (re.test(n)) return r; return 0; };
const UP = new THREE.Vector3(0, 1, 0);

function dress(bones) {
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  for (const b of bones) {
    const p = b.parent;
    if (!p || !p.isBone) continue;
    const r = radOf(b.name);
    if (!r) continue;
    const d = b.position.length();
    if (d < 0.3) continue;
    const m = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(d - r, 0.1), 4, 10), GREY));
    m.position.copy(b.position).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.position.clone().normalize());
    m.userData.mannequin = true;
    p.add(m);
  }
  const hips = byName.Hips, head = byName.Head;
  if (hips) { const s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(13, 14, 10), GREY)); s.userData.mannequin = true; hips.add(s); }
  if (head) {
    const e = byName.HeadEnd ? byName.HeadEnd.position.length() : 16;
    const h = shadowed(new THREE.Mesh(new THREE.SphereGeometry(9.5, 16, 12), HEAD));
    h.position.set(e * 0.5, 0, 0); h.scale.set(1.1, 1, 0.95); h.userData.mannequin = true; head.add(h);
    // head local frame: X up, Y left-right, Z forward (from the eye offsets): a small nose shows which way it faces
    const n = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), NOSE));
    n.position.set(e * 0.5 - 1, 0, 9.5); n.userData.mannequin = true; head.add(n);
  }
}

function lowestFoot(bones) {
  let lo = Infinity; const v = new THREE.Vector3();
  for (const b of bones) if (/(Foot|ToeBase|ToeEnd)$/.test(b.name)) { b.getWorldPosition(v); lo = Math.min(lo, v.y); }
  return lo;
}

const loader = new BVHLoader();
function stripRootXZ(clip) {
  const c = clip.clone();
  for (const t of c.tracks) {
    if (/^(Root|Hips)\.position$/.test(t.name)) {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

class Figure {
  constructor(mirror) {
    this.mirror = mirror;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mixer = null; this.action = null; this.helper = null; this.bones = null;
  }
  load(text, rootMotion) {
    if (this.bones) { this.group.clear(); scene.remove(this.helper); this.helper.dispose?.(); }
    const res = loader.parse(text);
    this.bones = res.skeleton.bones;
    // BVHLoader adds the joint OFFSET to position channels; for Kimodo's Root/Hips the channels are already absolute (Hips y ~ 99 cm), so take the offset back off
    for (const t of res.clip.tracks) {
      const m = /^(Root|Hips)\.position$/.exec(t.name);
      if (!m) continue;
      const o = this.bones.find(b => b.name === m[1]).position; // still the rest offset here
      for (let i = 0; i < t.values.length; i += 3) { t.values[i] -= o.x; t.values[i + 1] -= o.y; t.values[i + 2] -= o.z; }
    }
    this.rawClip = res.clip;
    this.root = this.bones[0];
    this.inner = new THREE.Group(); // cm -> m
    this.inner.add(this.root);
    this.group.add(this.inner);
    dress(this.bones);
    this.helper = new THREE.SkeletonHelper(this.root);
    this.helper.visible = $('skel').checked;
    scene.add(this.helper);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.setRootMotion(rootMotion);
    const skel = $('skel').checked;
    this.group.traverse(o => { if (o.userData.mannequin) o.visible = !skel; });
    // stand the figure on the ground using frame 0
    this.placeSide();
    this.group.position.y = 0; this.group.updateMatrixWorld(true);
    this.apply(0);
    this.rawLowM = lowestFoot(this.bones);
    this.group.position.y = -this.rawLowM;
    return res.clip.duration;
  }
  placeSide() {
    if (this.mirror) { this.group.position.z = 2.4; this.group.rotation.y = Math.PI; this.inner.scale.set(-0.01, 0.01, 0.01); }
    else { this.group.position.z = 0; this.group.rotation.y = 0; this.inner.scale.set(0.01, 0.01, 0.01); }
  }
  setRootMotion(on) {
    if (this.action) this.action.stop();
    this.mixer.uncacheRoot(this.root);
    this.clip = on ? this.rawClip : stripRootXZ(this.rawClip);
    this.action = this.mixer.clipAction(this.clip);
    this.action.play(); this.action.paused = true;
  }
  apply(t) { this.action.time = t; this.mixer.update(0); this.group.updateMatrixWorld(true); }
  hipsWorld(v) { const h = this.bones.find(b => b.name === 'Hips') || this.root; return h.getWorldPosition(v); }
  show(on) { this.group.visible = on; if (this.helper) this.helper.visible = on && $('skel').checked; }
}
const fig1 = new Figure(false), fig2 = new Figure(true);

// ---------- state / UI ----------
const S = { t: 0, dur: 1, playing: true, speed: 1, loop: true, name: '' };
const clock = new THREE.Clock();
const camPresets = {
  side: h => [new THREE.Vector3(h.x + 6, 1.4, h.z), new THREE.Vector3(h.x, 1.0, h.z)],
  front: h => [new THREE.Vector3(h.x, 1.5, h.z + 6), new THREE.Vector3(h.x, 1.0, h.z)],
  chase: h => [new THREE.Vector3(h.x, 2.6, h.z - 5), new THREE.Vector3(h.x, 1.0, h.z)],
};
let currentCam = 'side';
function setCam(name) {
  const h = new THREE.Vector3(); fig1.hipsWorld(h);
  // the second figure stands at z=+2.4: centre between the two when it is shown
  if ($('two').checked) { const h2 = new THREE.Vector3(); fig2.hipsWorld(h2); h.lerp(h2, 0.5); }
  const [p, t] = camPresets[name](h);
  camera.position.copy(p); controls.target.copy(t); controls.update();
  havePrev = false;
}

async function loadClip(file) {
  const text = await (await fetch(DIR + file)).text();
  S.name = file; S.t = 0;
  const rm = $('root').checked;
  S.dur = fig1.load(text, rm);
  fig2.load(text, rm);
  fig2.show($('two').checked);
  fig1.apply(0); fig2.apply(0);
  const frames = /Frames:\s*(\d+)/.exec(text)?.[1];
  $('info').textContent = `${file}: ${frames} frames, ${S.dur.toFixed(2)} s, ${fig1.bones.length} joints`;
  setCam(currentCam);
  window.__motion = { fig1, fig2, S, loadClip, lowFootRawM: fig1.rawLowM, setCam: n => { currentCam = n; setCam(n); } };
}

(async () => {
  const list = await (await fetch(DIR + 'index.json')).json();
  const sel = $('clip');
  for (const f of list) { const o = document.createElement('option'); o.value = f; o.textContent = f.replace(/\.bvh$/, ''); sel.appendChild(o); }
  sel.onchange = () => loadClip(sel.value);
  await loadClip(list[0]);
  window.__motionReady = true;
})().catch(e => { console.error(e); $('info').textContent = 'Error: ' + e.message; });

$('play').onclick = () => { S.playing = !S.playing; $('play').textContent = S.playing ? 'Pause' : 'Play'; $('play').classList.toggle('on', S.playing); };
$('speed').onclick = () => { S.speed = S.speed === 1 ? 0.5 : 1; $('speed').textContent = S.speed + 'x'; };
$('loop').onchange = e => { S.loop = e.target.checked; };
$('scrub').oninput = e => { S.t = (e.target.value / 1000) * S.dur; };
$('root').onchange = () => { for (const f of [fig1, fig2]) f.setRootMotion($('root').checked); };
$('skel').onchange = () => {
  const skel = $('skel').checked;
  for (const f of [fig1, fig2]) {
    if (f.helper) f.helper.visible = f.group.visible && skel;
    f.group.traverse(o => { if (o.userData.mannequin) o.visible = !skel; });
  }
};
$('two').onchange = () => { fig2.show($('two').checked); setCam(currentCam); };
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { currentCam = b.dataset.cam; setCam(currentCam); });

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const hPrev = new THREE.Vector3(), hNow = new THREE.Vector3(); let havePrev = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (fig1.action) {
    if (S.playing) {
      S.t += dt * S.speed;
      if (S.t >= S.dur) {
        if (S.loop) S.t %= S.dur;
        else { S.t = S.dur; S.playing = false; $('play').textContent = 'Play'; $('play').classList.remove('on'); }
      }
    }
    fig1.apply(S.t);
    if (fig2.group.visible) fig2.apply(S.t);
    // follow the figure so root motion does not walk out of the shot
    fig1.hipsWorld(hNow);
    if (havePrev) {
      const dx = hNow.x - hPrev.x, dz = hNow.z - hPrev.z;
      camera.position.x += dx; camera.position.z += dz; controls.target.x += dx; controls.target.z += dz;
    }
    hPrev.copy(hNow); havePrev = true;
    sun.target.position.set(hNow.x, 0, hNow.z); sun.position.set(hNow.x - 8, 14, hNow.z + 6);
    $('scrub').value = Math.round(S.t / S.dur * 1000);
    $('time').textContent = `${S.t.toFixed(2)} / ${S.dur.toFixed(2)} s`;
  }
  controls.update();
  renderer.render(scene, camera);
}
frame();
