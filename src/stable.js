// The Stable: one big 3D view of a single horse that you can turn with the mouse or a finger.
// Drag = turn round (yaw, unlimited) and tilt a little (pitch). Wheel / pinch = zoom. After 3 s untouched it turns slowly by itself.
// It has its own renderer, created when the screen is first drawn and thrown away (release) as soon as the screen is left.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Jouster } from './jouster.js';
import { HORSES, harness } from './data.js';

const PITCH_MIN = -10 * Math.PI / 180, PITCH_MAX = 35 * Math.PI / 180, ZOOM_MIN = 0.55, ZOOM_MAX = 1.7;
const IDLE_WAIT = 3, AUTO_SPIN = 0.3, MAXPX = 1400;

export function createStable() {
  let renderer = null, scene = null, cam = null, item = null, cv = null, horseId = '', armsKey = '', capKey = 'livery', env = null;
  let yaw = 0.7, pitch = 0.12, zoom = 1, idle = IDLE_WAIT, unbind = null;
  const pts = new Map();

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer); env = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = env; pm.dispose();
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(2.5, 4, 3.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9); rim.position.set(-3, 2.5, -3); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6a5238, 0.7));
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  }

  // Never dispose the horse's geometry, materials or textures here: most are shared with the game itself (the rigged horse, the
  // plate armour, the steel/cloth/coat maps), and disposing them from this second renderer wiped them in the main one too —
  // textures went black after a visit to the Stable. Dropping the object is enough; the garbage collector does the rest.
  function disposeObj() {}
  function dropItem() {
    if (!item) return;
    scene.remove(item.tt); disposeObj(item.tt);
    if (item.j.mixer) item.j.mixer.stopAllAction();
    item = null;
  }

  function build(id, arms) {
    dropItem();
    const tt = new THREE.Group(); scene.add(tt);
    const j = new Jouster(scene, Object.assign({}, arms), 1, 0, HORSES[id], harness('mail'));
    j.update(0); scene.remove(j.root); tt.add(j.root); j.root.position.set(0, 0, 0);
    // the horse alone, in the player's caparison
    if (j.rider && j.rider.parent) j.rider.parent.remove(j.rider);
    if (j.reins) j.reins.forEach(r => { r.visible = false; });
    j.update(0); j.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(j.root), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    j.root.position.x -= c.x; j.root.position.z -= c.z;
    // a soft shadow patch on the floor
    const g = document.createElement('canvas'); g.width = g.height = 64; const x = g.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(20,12,6,.5)'); gr.addColorStop(1, 'rgba(20,12,6,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(g), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = b.min.y + 0.01; const r = Math.max(sz.x, sz.z) * 1.1; sh.scale.set(r, r, 1); tt.add(sh);
    item = { tt, j, look: new THREE.Vector3(0, c.y, 0), h: sz.y * 1.18, wide: Math.max(sz.x, sz.z) * 1.1 };
  }

  function bind(c) {
    if (unbind) unbind();
    cv = c; c.style.touchAction = 'none'; c.style.cursor = 'grab';
    const dist = () => { const a = [...pts.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; };
    let pd = 0;
    const down = (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pd = dist(); idle = 0; c.style.cursor = 'grabbing'; };
    const move = (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; idle = 0;
      if (pts.size > 1) { const d = dist(); if (pd > 0 && d > 0) zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * pd / d)); pd = d; return; }
      yaw += dx * 0.009; pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * 0.005));
    };
    const up = (e) => { pts.delete(e.pointerId); pd = dist(); idle = 0; if (!pts.size) c.style.cursor = 'grab'; };
    const wheel = (e) => { e.preventDefault(); zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * Math.exp(e.deltaY * 0.001))); idle = 0; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    unbind = () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); c.removeEventListener('wheel', wheel); pts.clear(); unbind = null; };
  }

  /** Call every frame while the Stable is open. root: the screen element; id: the horse shown; arms: the player's livery. */
  function update(dt, root, id, arms, capStyle = 'livery') {
    const c = root.querySelector('canvas#stableView');
    if (!c) { release(); return; }
    if (!renderer) init();
    if (c !== cv) bind(c);
    const key = JSON.stringify(arms);
    if (!item || id !== horseId || key !== armsKey) {
      horseId = id; armsKey = key; capKey = capStyle;
      try { build(id, arms); item.j.setCaparison(capStyle); } catch (e) { console.warn('stable failed', id, e); item = null; return; }
    } else if (capStyle !== capKey) { capKey = capStyle; item.j.setCaparison(capStyle); }   // same horse: just toggle the cloth (yaw, pitch, zoom stay)
    item.j.update(dt);
    idle += dt; if (idle > IDLE_WAIT && !pts.size) yaw += AUTO_SPIN * dt;
    const r = c.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    const s = Math.min(1, MAXPX / Math.max(cw, ch)); cw = Math.max(2, Math.round(cw * s)); ch = Math.max(2, Math.round(ch * s));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    if (renderer.domElement.width !== cw || renderer.domElement.height !== ch) renderer.setSize(cw, ch, false);
    cam.aspect = cw / ch; cam.updateProjectionMatrix();
    const tf = Math.tan(cam.fov * Math.PI / 360);
    const d = (Math.max(item.h / (2 * tf), item.wide / (2 * tf * cam.aspect)) * 0.82 + item.wide * 0.12) * zoom;   // fill the view: the horse is the point of this screen
    item.tt.rotation.y = yaw;
    cam.position.set(item.look.x, item.look.y + Math.sin(pitch) * d, item.look.z + Math.cos(pitch) * d); cam.lookAt(item.look);
    renderer.render(scene, cam);
    const g = c.getContext('2d'); g.clearRect(0, 0, cw, ch); g.drawImage(renderer.domElement, 0, 0, cw, ch);
  }

  /** Leave the Stable: free the horse and the second renderer. */
  function release() {
    if (unbind) unbind(); cv = null;
    if (item) dropItem();
    if (renderer) { if (env) env.dispose(); env = null; renderer.dispose(); renderer.forceContextLoss(); renderer = null; scene = null; cam = null; }
    horseId = ''; armsKey = ''; capKey = 'livery'; idle = IDLE_WAIT;
  }

  return { update, release };
}
