// Small turning 3D previews for the armoury: each horse, each harness and each lance on its own little turntable.
// One spare renderer draws them in turn and the picture is copied into the <canvas class="pv" data-pv="kind:id"> of each card.
import * as THREE from 'three';
import { GFX } from './gfx.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Jouster } from './jouster.js';
import { RIG, preloadRider, HARNESSES, HELMS } from './rider_rig.js';
import { HORSES, ARMOURS, LANCES, harness } from './data.js';

const BW = 560, BH = 360;            // drawing buffer; every preview is drawn into a corner of it
const SPIN = 0.55;                   // radians per second

export function createPreviews() {
  let askedRig = false, renderer = null, scene, cam, items = new Map(), queue = [], armsKey = '', ang = 0, skip = 0, lanceJ = null;
  const _t = new THREE.Vector3();

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: GFX.antialias, alpha: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(1); renderer.setSize(BW, BH, false); renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(2.5, 4, 3.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9); rim.position.set(-3, 2.5, -3); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6a5238, 0.7));
    cam = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  }

  const under = (o, top) => { for (let p = o; p; p = p.parent) if (p === top) return true; return false; };
  const onlyShow = (j, keep) => j.root.traverse(o => { if ((o.isMesh || o.isLine || o.isPoints) && !keep(o)) o.visible = false; });

  /** Build what one card shows. Returns { tt (the turntable), look, dist, fov, tick? }. */
  function build(kind, id, arms) {
    const tt = new THREE.Group(); tt.visible = false; scene.add(tt);
    if (kind === 'lance') {
      // one rider's lance serves all three; only its girth changes
      if (!lanceJ) {
        lanceJ = new Jouster(scene, Object.assign({}, arms), 1, 0, HORSES.rouncey, Object.assign(harness('milanese'), { noRig: true })); lanceJ.update(0); scene.remove(lanceJ.root);
        const tilt = lanceJ.tilt = new THREE.Group(); tilt.rotation.x = -0.3; tilt.add(lanceJ.lance);
        lanceJ.lance.position.set(0, 0, -0.925); lanceJ.lance.quaternion.identity(); lanceJ.lance.scale.setScalar(1);
      }
      const k = LANCES[id].scale;
      return { tt, look: [0, 0, 0], dist: 4.5, fov: 20, pre: () => { tt.add(lanceJ.tilt); lanceJ.lance.children[0].scale.set(k, k, 1); lanceJ.lanceFore.scale.set(k, k, 1); } };
    }
    const j = new Jouster(scene, Object.assign({}, arms), 1, 0, kind === 'horse' ? HORSES[id] : HORSES.rouncey, kind === 'armour' ? harness(id) : kind === 'helm' ? harness('milanese', id) : Object.assign(harness('mail'), kind === 'horse' ? { noRig: true } : {}));
    j.update(0); tt.add(j.root); j.root.position.set(0, 0, 0);
    if (kind === 'horse') {
      // the horse alone, in your caparison
      j.rider.parent.remove(j.rider); j.root.updateMatrixWorld(true);
      return Object.assign({ tt, j, fov: 26, lift: 0.35, tick: (dt) => j.update(dt) }, frame(j, j.root, 0.78));
    }
    if (kind === 'helm' && j.rig) {
      // the rigged rider's helm alone (its own mesh on the Head bone, or the separate piece)
      const h = j.rig.helmMesh; j.root.updateMatrixWorld(true);
      onlyShow(j, o => o === j.rig.helmMesh || under(o, j.helm)); if (h) h.visible = true;
      return Object.assign({ tt, j, fov: 24, lift: 0.1 }, frame(j, h, 1.3));      // (a little roomier: the plume stands above the helm)
    }
    if (kind === 'helm') {
      // the helm alone
      j.root.updateMatrixWorld(true);
      onlyShow(j, o => under(o, j.helm));
      return Object.assign({ tt, j, fov: 24, lift: 0.1 }, frame(j, j.helm, 1.0));
    }
    if (j.rig) {      // the rigged rider on the stand, helm and all (no lance)
      j.lance.visible = false; j.lance.scale.setScalar(1e-4); j.update(0); j.root.updateMatrixWorld(true);      // (no lance: out of sight and out of the measuring)
      onlyShow(j, o => under(o, j.rider));
      return Object.assign({ tt, j, fov: 26, lift: 0.12 }, frame(j, j.rider, 0.8));
    }
    // harness: body, arms and shield without the helm, as on an armourer's stand
    j.torso.remove(j.lance); j.torso.remove(j.helm); j.root.updateMatrixWorld(true);
    onlyShow(j, o => under(o, j.torso));
    return Object.assign({ tt, j, fov: 26, lift: 0.12 }, frame(j, j.torso, 0.9));
  }
  /** Centre the thing on its turntable and measure it, so the camera can stand back just far enough. */
  function frame(j, obj, k) {
    if (j.rig) j.rig.root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });      // (a posed, skinned figure: measure the vertices as they stand)
    const b = new THREE.Box3().setFromObject(obj, !!j.rig), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    j.root.position.x -= c.x; j.root.position.z -= c.z;
    return { look: [0, c.y, 0], h: sz.y * k, wide: Math.max(sz.x, sz.z) * k };
  }

  function drop() {
    for (const it of items.values()) { if (it.tt) scene.remove(it.tt); }
    items.clear(); queue = []; lanceJ = null;
  }

  /** Call every frame while the armoury is open. root: the element holding the cards; arms: the player's blazon. */
  function update(dt, root, arms) {
    const cvs = root.querySelectorAll('canvas.pv');
    if (!cvs.length) return;
    if (!renderer) init();
    if (!askedRig) { askedRig = true; preloadRider({ armour: HARNESSES, helm: HELMS, lance: ['standard'] }); }      // every harness and helm the armoury shows
    const key = JSON.stringify(arms) + (RIG.ready ? '|rig' + RIG.figs.size + RIG.helms.size : '');      // (the rigged rider arrives in the background: build the cards again when it has)
    if (key !== armsKey) { armsKey = key; drop(); }
    ang += dt * SPIN;
    // build at most one preview a frame, so opening the armoury never stalls
    for (const cv of cvs) { const k = cv.dataset.pv; if (!items.has(k)) { items.set(k, { pending: true }); queue.push(k); } }
    if (queue.length) { const k = queue.shift(), [kind, id] = k.split(':'); try { items.set(k, build(kind, id, arms)); } catch (e) { console.warn('preview failed', k, e); items.set(k, { failed: true }); } }
    if ((skip ^= 1) && !queue.length) return;      // previews turn at half the frame rate once they are all built
    const view = root.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of cvs) {
      const it = items.get(cv.dataset.pv); if (!it || !it.tt) continue;
      const r = cv.getBoundingClientRect();
      if (r.bottom < view.top || r.top > view.bottom || r.width < 4) continue;      // scrolled out of sight
      const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const s = Math.min(1, BW / cw, BH / ch), w = Math.max(2, Math.floor(cw * s)), h = Math.max(2, Math.floor(ch * s));
      if (it.pre) it.pre();
      if (it.tick) it.tick(dt * 2);
      it.tt.visible = true; it.tt.rotation.y = ang + (it.j ? 0.6 : 0);
      cam.fov = it.fov; cam.aspect = w / h; cam.updateProjectionMatrix();
      const tf = Math.tan(cam.fov * Math.PI / 360), dist = it.dist || (Math.max(it.h / (2 * tf), it.wide / (2 * tf * cam.aspect)) * 1.06 + it.wide * 0.3);
      cam.position.set(it.look[0], it.look[1] + (it.lift || 0) * dist / 3, it.look[2] + dist); cam.lookAt(it.look[0], it.look[1], it.look[2]);
      renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
      renderer.clear(); renderer.render(scene, cam);
      it.tt.visible = false;
      const g = cv.getContext('2d'); g.clearRect(0, 0, cw, ch); g.drawImage(renderer.domElement, 0, BH - h, w, h, 0, 0, cw, ch);
    }
  }

  return { update, drop };
}
