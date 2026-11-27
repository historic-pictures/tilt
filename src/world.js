import * as THREE from 'three';
import { GFX } from './gfx.js';
import { buildFlora } from './flora.js';
import { touchMode } from './touch.js';
import { figure, fitGeo, partGeo, shareGeo, partMaterial, garment, faceUV, patchUV } from './people.js';
import { headFor } from './people_heads.js';
import { buildCrowd } from './crowd.js';
import { makePBR } from './texgen.js';
import { buildProps } from './props.js';
import { buildBackdrop } from './backdrop.js';
import { groundShader } from './ground.js';
import { LISTS, preloadLists, buildLists } from './lists.js';
import { KNIGHTS } from './data.js';
import { whenHeraldry, heraldryReady } from './heraldry.js';
import { buildTraining } from './training.js';
import { skyNow, loadSky, skyFromPhoto } from './scans.js';
import { rng, TAU, box, limb, grassTexture, sandTexture, woodTexture, stoneTexture, stripeTexture, armsTexture, canvasTex, photoSet, photoTex, worldUV, detailWorld } from './util.js';

export const LIST_HALF = 32;      // half-length of the tilt barrier
export const LANE_X = 0.95;       // rider offset from the tilt (0.62 from the drone footage rode too close to the barrier, 0.72 still hugged it: the owner, 27 Nov; 0.95 leaves the flank 0.37 m from the cloth)
// Where a horse stops against the tilt (its cloth is +-0.17, the barrel 0.31 wide) and the riding line's good, close and wide limits, all on the rider's offset from the tilt:
// the 0.72 lane's values (0.58 / 0.65 / 0.67 / 1.16) moved out by the same 0.23 m as the lane, so the line you ride and its marks are unchanged.
export const BARRIER_X = 0.81, LAT_CLOSE = 0.88, LAT_SHAVE = 0.90, LAT_WIDE = 1.39;
export const START_Z = 40;        // riders start at +-START_Z

const BANNER_ARMS = [
  { c1: '#a01c1c', c2: '#e8d9a0', pattern: 'pale', charge: 'fleur', c3: '#d9b23c' },
  { c1: '#1d3f8a', c2: '#e6e6e6', pattern: 'chevron', charge: 'star', c3: '#e6c14a' },
  { c1: '#e6c14a', c2: '#1a1a1a', pattern: 'bend' },
  { c1: '#2c6e3a', c2: '#f0ead2', pattern: 'quarterly' },
  { c1: '#f0ead2', c2: '#7a1f6a', pattern: 'fess', charge: 'cross', c3: '#7a1f6a' },
  { c1: '#1a1a1a', c2: '#d9b23c', pattern: 'chief', charge: 'tower', c3: '#d9b23c' },
  { c1: '#b5541a', c2: '#f0ead2', pattern: 'paly' },
  { c1: '#3a7ca5', c2: '#f4e9c8', pattern: 'pale', charge: 'crescent', c3: '#f4e9c8' },
];

export function buildWorld(scene, renderer, venue = {}) {
  const world = { flags: [], crowd: null, excitement: 0, wave: -99 };
  const grp = new THREE.Group(); world.group = grp;
  const V = Object.assign({ sun: [-0.55, 0.62, -0.45], turbidity: 4.5, rayleigh: 1.35, fog: 0xc4d6e4, grass: '#5b7a36', sand: '#b89a6a', awn: ['#8f1d1d', '#eadfbe'], awn2: ['#1f3f7a', '#eadfbe'], tilt: ['#a3201f', '#efe6cf'], zenith: 0x2f6fd0, horizon: 0xb9d6f2, sunCol: 0xfff2dc, clouds: 0.5 }, venue);
  const T = !!V.training;      // the training ground: no stands, crowd, royal box, props, tents or backdrop town; see src/training.js
  const tint = (hex, base) => { const a = new THREE.Color(hex), b = new THREE.Color(base); return new THREE.Color(Math.min(1.6, a.r / b.r), Math.min(1.6, a.g / b.g), Math.min(1.6, a.b / b.b)); };
  const r = rng(1234);
  // the code-built tilt, fence, stands and royal box: what is on screen until the modelled lists arrive (src/lists.js), and for good if they do not
  const cheap = new THREE.Group(), cheapFlags = []; grp.add(cheap); let tiltOn = true;

  // ---------- sky, sun, fog ----------
  const sunDir = new THREE.Vector3(...V.sun).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uZenith: { value: new THREE.Color(V.zenith) }, uHorizon: { value: new THREE.Color(V.horizon) }, uSunCol: { value: new THREE.Color(V.sunCol) }, uCloud: { value: V.clouds }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `uniform vec3 uSun, uZenith, uHorizon, uSunCol; uniform float uCloud, uTime; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 sun = normalize(uSun);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
        float sd = max(dot(d, sun), 0.0);
        col += uSunCol * (pow(sd, 900.0) * 14.0 + pow(sd, 40.0) * 0.45 + pow(sd, 4.0) * 0.16);
        if (d.y > 0.015) {
          vec2 uv = d.xz / (d.y + 0.1) * 0.9 + vec2(uTime * 0.004, 0.0);
          float c = fbm(uv * 1.05) + 0.45 * fbm(uv * 2.9 + 3.0) - 0.22;
          float cov = smoothstep(1.02 - uCloud, 1.34 - uCloud, c);
          float thick = smoothstep(1.0 - uCloud, 1.7 - uCloud, c);
          float lit = fbm(uv * 2.2 + sun.xz * 0.6);
          vec3 cc = mix(vec3(1.25, 1.2, 1.14), vec3(0.5, 0.55, 0.66), clamp(thick * 0.9 + (0.5 - lit) * 0.5, 0.0, 1.0)) * mix(vec3(1.0), uSunCol, 0.35);
          cc += uSunCol * pow(sd, 6.0) * 0.5 * (1.0 - thick);
          col = mix(col, cc, cov * smoothstep(0.015, 0.2, d.y) * 0.93);
        }
        col = mix(col, uHorizon * 0.82, smoothstep(0.0, -0.12, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 40, 20), skyMat); sky.frustumCulled = false; sky.renderOrder = -10;
  grp.add(sky);
  scene.fog = new THREE.Fog(V.fog, 140, 620);
  world.captureEnv = (hide = []) => {
    world._envHide = hide;
    hide.forEach(o => { o.visible = false; });
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.5, 3200, rt); cc.position.set(0, 2.4, 0); cc.update(renderer, scene);
    const pm = new THREE.PMREMGenerator(renderer);
    const old = scene.environment;
    scene.environment = pm.fromCubemap(rt.texture).texture;
    if (old) old.dispose(); rt.dispose(); pm.dispose();
    hide.forEach(o => { o.visible = true; });
  };

  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x7d7048, 1.15);
  grp.add(hemi);
  const low = 1 - Math.min(1, Math.max(0, (sunDir.y - 0.25) / 0.5));
  const sun = new THREE.DirectionalLight(new THREE.Color(0xfff0d8).lerp(new THREE.Color(0xffb070), low * 0.8), 3.1 - low * 0.5);
  sun.castShadow = GFX.shadowOn !== false;      // (Settings > Graphics > Shadows: off)
  sun.shadow.mapSize.set(GFX.shadow, GFX.shadow);      // 4096 (2048 on phones) at high, 2048 medium, 1024 low
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  grp.add(sun, sun.target);
  world.sun = sun; world.sunDir = sunDir;
  const lastFocus = new THREE.Vector3();
  /** Live change of the shadow map size (the frame-time safety net dropped a tier). */
  world.setShadowSize = (n) => { sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } };
  world.setShadows = (on) => { sun.castShadow = !!on; };
  world.focusShadow = (p) => {
    lastFocus.copy(p);
    sun.target.position.set(p.x, 0, p.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 110);
  };
  world.focusShadow(lastFocus);
  // the light as plain numbers, for things that shade themselves (the scanned tree cards)
  const light = { sunDir, sunCol: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color() };
  const syncLight = () => {
    light.sunCol.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
    light.sky.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI); light.ground.copy(hemi.groundColor).multiplyScalar(hemi.intensity / Math.PI);
  };
  syncLight(); world.light = light;
  // a photographed sky, if this venue has one: its sun height replaces the venue's, its horizon colours the haze
  const applySky = (S) => {
    const d = skyFromPhoto(S, V.sun);
    sky.material = d.material; sunDir.copy(d.sunDir); scene.fog.color.copy(d.fog);
    const lo = 1 - Math.min(1, Math.max(0, (sunDir.y - 0.25) / 0.5));
    sun.color.set(0xfff0d8).lerp(new THREE.Color(0xffb070), lo * 0.8); sun.intensity = (3.1 - lo * 0.5) * d.clear;
    hemi.intensity = 1.15 * (1 + (1 - d.clear) * 0.9);
    world.focusShadow(lastFocus); syncLight(); world.photoSky = S.name;
  };
  const sky0 = skyNow(V.sky);
  if (sky0) applySky(sky0);
  else if (V.sky) loadSky(V.sky).then(S => { if (S && !world.dead) { applySky(S); if (world._envHide) world.captureEnv(world._envHide); } });

  // ---------- ground ----------
  const nGrass = makePBR('grass', { repeat: [330, 330] }).normalMap, nSand = makePBR('sand', { repeat: [4, 21] }), nWood = makePBR('wood', { repeat: [1, 1] }).normalMap, nStone = makePBR('stone', { repeat: [1, 1] });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), (() => { const ps = photoSet('leafy_grass', [520, 520]), g = new THREE.Color(V.grass);
    // the scan is of dry, leafy turf: divide its own colour out so the field takes the venue's green, and drift the tone so the tiling does not show
    const m = new THREE.MeshStandardMaterial({ normalMap: ps.normalMap, roughnessMap: ps.roughnessMap, color: new THREE.Color(g.r * 1.75 + 0.02, g.g * 1.22, g.b * 1.8 + 0.01), roughness: 1, envMapIntensity: 0.25 });
    const d = new THREE.Color(V.sand).multiplyScalar(0.55);
    return groundShader(m, { kind: 'grass', diff: photoTex('leafy_grass', 'diff'), mean: [0.32, 0.236, 0.106], dirt: [d.r, d.g, d.b], half: [9.5, 51] }); })());
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; grp.add(grass);

  const sandMat = groundShader(new THREE.MeshStandardMaterial(Object.assign(photoSet('sand_01', [7, 37]), { normalScale: new THREE.Vector2(1.5, 1.5), color: tint(V.sand, '#b89a6a').multiplyScalar(1.05), roughness: 1, envMapIntensity: 0.2 })), { kind: 'sand', lane: LANE_X, half: [9.5, 51] });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(19, 102), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.y = 0.012; sand.receiveShadow = true; grp.add(sand);
  // (the churned running lanes are painted into the sand shader, src/ground.js: they used to be two hard-edged dark decal strips)

  // ---------- tilt barrier ----------
  const woodMat = worldUV(new THREE.MeshStandardMaterial(Object.assign(photoSet('weathered_brown_planks'), { color: 0xd9c4a6, roughness: 1, envMapIntensity: 0.3 })), 0.55);
  const woodDark = worldUV(new THREE.MeshStandardMaterial(Object.assign(photoSet('weathered_brown_planks'), { color: 0x8f765a, roughness: 1, envMapIntensity: 0.3 })), 0.7);
  if (!T) {
    const tilt = new THREE.Group();
    const clothTex = stripeTexture(V.tilt[0], V.tilt[1], 8, [8, 1]);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, LIST_HALF * 2), new THREE.MeshStandardMaterial({ map: clothTex, normalMap: photoTex('rough_linen', 'nor_gl', [40, 1]), roughness: 0.95, envMapIntensity: 0.2 }));
    // rotate UVs so stripes run along the length
    cloth.material.map.rotation = 0; cloth.position.set(0, 0.68, 0); cloth.castShadow = cloth.receiveShadow = true;
    tilt.add(cloth);
    const rail = box([0, 1.24, 0], [0.13, 0.11, LIST_HALF * 2 + 0.3], woodDark); tilt.add(rail);
    const postGeo = new THREE.BoxGeometry(0.15, 1.36, 0.15);
    const posts = new THREE.InstancedMesh(postGeo, woodDark, 17);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 17; i++) { m.makeTranslation(0, 0.68, -LIST_HALF + i * 4); posts.setMatrixAt(i, m); }
    posts.castShadow = true; tilt.add(posts);
    cheap.add(tilt);
    world.setTilt = (on) => { tiltOn = !!on; tilt.visible = tiltOn; if (world.lists) world.lists.setTilt(tiltOn); };
  }

  // ---------- outer lists fence ----------
  if (!T) {
    const postG = new THREE.CylinderGeometry(0.07, 0.08, 1.25, 8);
    const pts = [];
    const add = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.round(len / 3);
      for (let i = 0; i <= n; i++) pts.push([x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n]);
      for (const y of [0.55, 1.05]) cheap.add(limb([x1, y, z1], [x2, y, z2], 0.045, 0.045, woodMat, 6));
    };
    add(-9.5, -51, -9.5, 51); add(9.5, -51, 9.5, 51);
    add(-9.5, -51, -3, -51); add(3, -51, 9.5, -51); add(-9.5, 51, -3, 51); add(3, 51, 9.5, 51);
    const posts = new THREE.InstancedMesh(postG, woodMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => { m.makeTranslation(p[0], 0.62, p[1]); posts.setMatrixAt(i, m); });
    posts.castShadow = true; cheap.add(posts);
  }

  // ---------- flags / banners ----------
  const bannerMats = BANNER_ARMS.map(a => new THREE.MeshStandardMaterial({ map: armsTexture(a, 256, 512, undefined, { style: 'cloth' }), side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.2 }));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3823, roughness: 0.8 });
  function addBanner(x, z, h, bw, bh, matIdx, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    g.add(limb([0, 0, 0], [0, h, 0], 0.05, 0.035, poleMat, 6));
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9b23c, metalness: 1, roughness: 0.3 }));
    fin.position.y = h; g.add(fin);
    const geo = new THREE.PlaneGeometry(bw, bh, 8, 6); geo.translate(bw / 2 + 0.04, h - bh / 2 - 0.1, 0);
    const flag = new THREE.Mesh(geo, bannerMats[matIdx % bannerMats.length]);
    flag.castShadow = true; g.add(flag);
    world.flags.push({ geo, mesh: flag, mat0: flag.material, x, z, base: geo.attributes.position.array.slice(), bw, phase: r() * 10, amp: 0.1 + r() * 0.06 });
    grp.add(g);
    return g;
  }
  for (let i = 0; i < (T ? 0 : 9); i++) {
    const z = -48 + i * 12;
    addBanner(-9.5, z, 6.2, 0.95, 2.6, i, Math.PI / 2);
    addBanner(9.5, z, 6.2, 0.95, 2.6, i + 3, Math.PI / 2);
  }

  // ---------- grandstands ----------
  const crowdSpots = [];
  const awningTexA = stripeTexture(V.awn[0], V.awn[1], 8, [5, 1]);
  const awningTexB = stripeTexture(V.awn2[0], V.awn2[1], 8, [5, 1]);
  const drapeMats = BANNER_ARMS.map(a => new THREE.MeshStandardMaterial({ map: armsTexture(a, 256, 256, undefined, { style: 'cloth' }), roughness: 0.95, envMapIntensity: 0.2 }));
  function stand(side) {
    const g = new THREE.Group();
    const x0 = 12.5, tiers = 7, td = 1.35, th = 0.62, len = 70, baseH = 1.5;
    // front wall with heraldic drapes
    g.add(box([x0 - 0.1, baseH / 2, 0], [0.2, baseH, len], woodDark));
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.25), drapeMats[(i + (side > 0 ? 0 : 4)) % drapeMats.length]);
      d.position.set(x0 - 0.22, 0.8, -len / 2 + 2.5 + i * 5); d.rotation.y = -Math.PI / 2; g.add(d);
    }
    for (let t = 0; t < tiers; t++) {
      const y = baseH + t * th;
      g.add(box([x0 + t * td + td / 2, y / 2, 0], [td, y, len], woodMat));
      for (let z = -len / 2 + 0.6; z < len / 2 - 0.5; z += 0.62) {
        if (side > 0 && t >= 1 && t <= 3 && Math.abs(z) < 4.6) continue; // royal box gap
        const cls = side > 0 && Math.abs(z) < 13 && t <= 4 ? 2 : side < 0 && Math.abs(z) < 4.5 && t >= 1 && t <= 3 ? 3 : side < 0 && Math.abs(z) < 9 && t <= 1 ? 2 : 1;
        if (r() < 0.9) crowdSpots.push([side * (x0 + t * td + 0.55 + r() * 0.25), y, z + (r() - 0.5) * 0.2, side, cls]);
      }
    }
    const backX = x0 + tiers * td, topY = baseH + tiers * th;
    g.add(box([backX + 0.1, (topY + 2.6) / 2, 0], [0.2, topY + 2.6, len], woodDark));
    // awning
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, tiers * td + 2.4, 1, 1), new THREE.MeshStandardMaterial({ map: side > 0 ? awningTexA : awningTexB, normalMap: photoTex('rough_linen', 'nor_gl', [50, 8]), side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.2 }));
    aw.material.map.repeat.set(9, 1);
    aw.geometry.rotateX(-Math.PI / 2); aw.geometry.rotateY(Math.PI / 2); aw.geometry.rotateZ(0.2);
    aw.position.set(x0 + tiers * td / 2 - 0.2, topY + 2.9, 0);
    aw.castShadow = true; aw.receiveShadow = true; g.add(aw);
    for (let z = -len / 2; z <= len / 2; z += 7) {
      g.add(limb([x0 - 0.3, 0, z], [x0 - 0.3, topY + 1.95, z], 0.09, 0.08, woodDark, 6));
      g.add(limb([backX, 0, z], [backX, topY + 3.9, z], 0.09, 0.08, woodDark, 6));
    }
    g.scale.x = side;
    cheap.add(g);
    // pennants along the roof line
    for (let i = 0; i < 6; i++) cheapFlags.push(addBanner(side * (x0 - 0.3), -35 + i * 14, topY + 4.4, 1.5, 0.7, i + (side > 0 ? 1 : 5), side > 0 ? 0 : Math.PI));
  }
  if (!T) { stand(1); stand(-1); }

  // royal box
  if (T) { world.royals = []; world.royal = { kind: 'idle', t0: -99 }; world.setRoyalMood = () => {}; }
  else {
    const g = new THREE.Group(), cg = new THREE.Group(); cheap.add(cg);      // cg: the box itself (replaced by the modelled one); g: the king and queen
    const purple = new THREE.MeshStandardMaterial({ color: 0x5c1f6e, roughness: 0.85, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9b23c, metalness: 1, roughness: 0.35 });
    cg.add(box([15.6, 2.25, 0], [4.2, 0.25, 9.4], woodDark));
    cg.add(box([13.45, 2.9, 0], [0.12, 1.1, 9.4], purple));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.6, 4, 1), purple);
    roof.rotation.y = Math.PI / 4; roof.scale.set(0.62, 1, 1); roof.position.set(15.6, 7.9, 0); roof.castShadow = true; cg.add(roof);
    for (const [x, z] of [[13.6, -4.6], [13.6, 4.6], [17.6, -4.6], [17.6, 4.6]]) cg.add(limb([x, 2.3, z], [x, 6.7, z], 0.09, 0.09, gold, 8));
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), gold); fin.position.set(15.6, 9.3, 0); cg.add(fin);
    // thrones + king & queen — they applaud, rise to their feet, or turn away
    const robe = [0x8a1616, 0x1d3f8a]; world.royals = [];
    [-0.9, 0.9].forEach((z, i) => {
      cg.add(box([16.0, 3.3, z], [0.25, 1.9, 1.0], woodDark));
      const fig = new THREE.Group(); fig.position.set(15.5, 2.4, z); fig.rotation.y = -Math.PI / 2;
      // the king and the queen: the modelled, dressed parts of src/people.js (a long robe of black velvet sewn with gold stars and ermine; a gown of blue-and-gold
      // lion brocade), the close-up head of src/people_heads.js, a crown; seated (the robe is drawn 0.8 of its height, as the cylinder it replaces was)
      const skin = i ? '#efcdae' : '#e0b38c', F = figure(), fat = i ? 0.1 : 0.7;
      const body = new THREE.Mesh(i ? fitGeo('gown_npc_hi', 1, 0.8, 1) : fitGeo('robe_npc_hi', 1, 0.8, 1), partMaterial(i ? '#213f78' : '#24211f', skin, garment(i ? 'gown_brocade' : 'houppelande_brocade').uv, fat)); body.castShadow = true; fig.add(body);
      const head = new THREE.Group(); head.position.y = 1.3; fig.add(head);
      const hd = GFX.tier === 'low' ? new THREE.Mesh(F.head, partMaterial(skin, i ? '#8a5a2c' : '#9a958c', faceUV(i ? 'f_fair' : 'm_fullbeard'), fat)) : headFor(i ? 7 : 2, i ? 'f' : 'm', i ? 'medium' : 'heavy', skin, i ? '#8a5a2c' : '#9a958c');
      hd.position.y = 0.02; head.add(hd);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.088, 0.075, 12, 1, true), gold); crown.position.y = 0.115; head.add(crown);
      if (i === 1) { const veil = new THREE.Mesh(shareGeo(partGeo('veil_hi')), partMaterial('#ece6d6', '#ece6d6', patchUV('veil'), 0)); veil.position.y = 0.02; head.add(veil); }
      const sl = partMaterial(i ? '#213f78' : '#8a1616', skin, patchUV('sleeve_fur'), 0);
      const arms = [-1, 1].map(sx => { const a = new THREE.Group(); a.position.set(sx * 0.2, 1.06, 0); const m = new THREE.Mesh(F.arm, sl); m.castShadow = true; m.rotation.x = -0.12; a.add(m); fig.add(a); return a; });
      g.add(fig); world.royals.push({ fig, head, arms, y0: 2.4, ph: i * 1.7 });
    });
    world.royal = { kind: 'idle', t0: -99 };
    /** kind: 'applaud' | 'rise' | 'displeased' | 'idle' */
    world.setRoyalMood = (kind) => { world.royal = { kind, t0: world.now || 0 }; };
    for (let z = -4; z <= 4; z += 1) { if (Math.abs(z) > 1.6) crowdSpots.push([15.2 + r() * 1.5, 2.37, z + r() * 0.3, 1, 2]); }
    grp.add(g);
    cheapFlags.push(addBanner(13.6, -4.6, 9.6, 1.9, 1.1, 0, 0), addBanner(13.6, 4.6, 9.6, 1.9, 1.1, 5, 0));
  }

  // ---------- the commons: standing room at the rails ----------
  if (!T) {
    const jit = () => (r() - 0.5) * 0.22;
    // behind the fences at both ends of the lists (leave the gates clear)
    for (const sz of [-1, 1]) for (let row = 0; row < 4; row++) for (let x = -11.2; x <= 11.2; x += 0.56) {
      if (Math.abs(x) < 3.4 || r() < 0.12 + row * 0.1) continue;
      crowdSpots.push([x + jit(), 0, sz * (52.0 + row * 0.62) + jit(), 0, 0, sz < 0 ? 0 : Math.PI]);
    }
    // pressed against the side rails beyond the ends of the stands
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let col = 0; col < 3; col++) for (let z = 37.2; z < 50.6; z += 0.56) {
      if (r() < 0.1 + col * 0.12) continue;
      crowdSpots.push([sx * (10.25 + col * 0.6) + jit(), 0, sz * z + jit(), sx, 0]);
    }
    // groundlings along the foot of the stands
    for (const sx of [-1, 1]) for (let z = -35; z <= 35; z += 0.58) {
      if ((sx > 0 && Math.abs(z) < 9.5) || (sx < 0 && Math.abs(z) < 2.2) || r() < 0.18) continue;
      crowdSpots.push([sx * (11.2 + r() * 0.5), 0, z + jit(), sx, 0]);
    }
  }

  // ---------- crowd ----------
  // lower tiers: fewer people (the notable ones, class 2 and 3, always stay). Each spot has its own draw, so a thinner crowd is always a subset of a fuller one (GFX.crowdLive: the safety net thins the stands first, see gfx.js)
  const allSpots = crowdSpots.slice(), keepU = (() => { const k = rng(777); return allSpots.map(() => k()); })();
  const crowdKeep = (d) => allSpots.filter((s, i) => s[4] >= 2 || keepU[i] < d);
  let crowdAcc = 0, crowdN = 0, crowdD = 1, crowdCols = [V.colorsA, V.colorsB];
  if (GFX.crowd * GFX.crowdLive < 1 && !T) { crowdD = GFX.crowd * GFX.crowdLive; const kept = crowdKeep(crowdD); crowdSpots.length = 0; crowdSpots.push(...kept); }
  world.crowd = T ? { update() {}, setColors() {}, ladies: () => [], spotlight() {}, voiceSpot: () => null } : buildCrowd(grp, crowdSpots, { seed: 99, colorsA: V.colorsA, colorsB: V.colorsB });
  world.crowdState = { excitement: 0.12, anticipation: 0, favour: 0, scorer: 0, waveStart: -999, focusZ: 0 };

  // ---------- attendants, bunting, lance racks (re-liveried per match) ----------
  let propGrp = null, props = null;
  world.propState = { mode: 'menu', fanfare: false, excitement: 0.12 };
  let liveMats = [];
  let lastLivery = null;
  world.setLivery = (colorsA, colorsB, armsA, armsB) => {
    lastLivery = [colorsA, colorsB, armsA, armsB];
    liveMats.forEach(m => { m.map.dispose(); m.dispose(); }); liveMats = [];
    if (armsA && armsB) {
      const mk = (a) => { const m = new THREE.MeshStandardMaterial({ map: armsTexture(a, 256, 512, undefined, { style: 'cloth' }), side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.2 }); liveMats.push(m); return m; };
      const mA = mk(armsA), mB = mk(armsB);
      for (const f of world.flags) { if (Math.abs(Math.abs(f.x) - 9.5) > 0.1) continue; f.mesh.material = f.z <= -24 ? mA : f.z >= 24 ? mB : f.mat0; }
    }
    if (propGrp) { grp.remove(propGrp); propGrp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    propGrp = new THREE.Group(); grp.add(propGrp);
    props = T ? null : buildProps(propGrp, { seed: 7, colorsA, colorsB, modelled: !!world.lists });
    crowdCols = [colorsA, colorsB]; world.crowd.setColors(colorsA, colorsB);
  };
  /** Thin the stands in place to GFX.crowd * GFX.crowdLive (main.js calls it when the safety net or the benchmark takes a crowd step): rebuilds the crowd from the same spots minus the dropped ones. */
  world.thinCrowd = () => {
    const d = GFX.crowd * GFX.crowdLive; if (T || !world.crowd.dispose || d >= crowdD - 1e-3) return false;
    crowdD = d; world.crowd.dispose(); const sp = crowdKeep(d);
    world.crowd = buildCrowd(grp, sp, { seed: 99, colorsA: crowdCols[0], colorsB: crowdCols[1] }); world.crowd.setColors(crowdCols[0], crowdCols[1]);
    return sp.length;
  };

  // ---------- tents ----------
  function tent(x, z, cA, cB, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = r() * TAU;
    const tex = stripeTexture(cA, cB, 8, [2, 1]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.25 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.45, 2.1, 16, 1, true), mat); wall.position.y = 1.05; wall.castShadow = true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 2.5, 16, 1, true), mat); roof.position.y = 3.3; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshStandardMaterial({ color: 0x1c140d, roughness: 1 }));
    door.position.set(0, 0.86, 2.42); g.add(door);
    grp.add(g);
    addBanner(x, z, 4.55 * s + 1.5, 1.1, 0.5, (r() * 8) | 0, r() * TAU);
  }
  const tc = [['#a3201f', '#efe6cf'], ['#1f3f7a', '#efe6cf'], ['#d9b23c', '#1a1a1a'], ['#2c6e3a', '#efe6cf'], ['#7a1f6a', '#efe6cf'], ['#efe6cf', '#b5541a']];
  const tentSpots = [[-14, -66], [-5, -72], [6, -68], [15, -74], [-22, -78], [24, -64], [-13, 66], [-3, 73], [8, 67], [17, 74], [-24, 70], [26, 78], [-34, -40], [-38, -20], [-36, 5], [-40, 28], [36, -44], [40, 30], [-33, 48], [35, 52]];
  const tentN = Math.round(tentSpots.length * GFX.tents);      // lower tiers: fewer tents (the layout of the rest does not change)
  if (!T) tentSpots.forEach((p, i) => i < tentN && tent(p[0], p[1], ...tc[i % tc.length], 0.9 + r() * 0.35));

  // ---------- venue skyline ----------
  const backdrop = T ? { update() {} } : buildBackdrop(grp, V.id, { seed: 11 });

  // ---------- distant hills ----------
  {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4d6a36, roughness: 1, envMapIntensity: 0.15 });
    const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x5f7d48, roughness: 1, envMapIntensity: 0.15 });
    const hillTex = photoTex('leafy_grass', 'diff');
    for (const hm of [hillMat, hillMat2]) detailWorld(hm, hillTex, { scale: 0.035, mean: [0.32, 0.236, 0.106], strength: 0.75, macro: 0.5 });
    const hg = new THREE.SphereGeometry(1, 20, 10);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + r() * 0.2, d = 420 + r() * 260;
      const h = new THREE.Mesh(hg, i % 2 ? hillMat : hillMat2);
      h.scale.set(110 + r() * 150, 24 + r() * 55, 110 + r() * 150);
      h.position.set(Math.cos(a) * d, -8, Math.sin(a) * d); grp.add(h);
    }
  }

  // ---------- vegetation ----------
  const training = T ? buildTraining(grp, { V, light, woodMat, woodDark, LIST_HALF, LANE_X, seed: 5 }) : null;
  if (T) world.setTilt = (on) => { training.tilt.visible = !!on; };
  const flora = buildFlora(grp, { grassColor: V.grass, seed: 4242, sunDir, light });

  // ---------- per-frame ----------
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), e = new THREE.Euler();
  world.update = (t, dt) => {
    skyMat.uniforms.uTime.value = t; world.now = t;
    { // the royal pair
      const m = world.royal, age = t - m.t0, k = m.kind === 'idle' ? 0 : Math.min(1, age * 3) * Math.max(0, Math.min(1, (4.2 - age) * 1.5));
      for (const r of world.royals) {
        const idle = Math.sin(t * 0.6 + r.ph) * 0.04;
        let rise = 0, ax = 0.15 + idle, turn = 0, nod = idle;
        if (m.kind === 'applaud') { ax = -1.15 * k + Math.sin(t * 15 + r.ph) * 0.22 * k + 0.15 * (1 - k); nod = 0.12 * k; }
        else if (m.kind === 'rise') { rise = 0.34 * k; ax = -2.5 * k + Math.sin(t * 9 + r.ph) * 0.3 * k + 0.15 * (1 - k); }
        else if (m.kind === 'displeased') { turn = 0.95 * k * (r.ph ? -1 : 1); nod = 0.35 * k; ax = 0.15 - 0.5 * k; }
        r.fig.position.y = r.y0 + rise; r.fig.rotation.y = -Math.PI / 2 + turn; r.head.rotation.x = nod;
        r.arms[0].rotation.x = ax; r.arms[1].rotation.x = ax - (m.kind === 'applaud' ? Math.sin(t * 15 + r.ph) * 0.1 * k : 0);
        r.arms[0].rotation.z = m.kind === 'applaud' ? -0.35 * k : 0; r.arms[1].rotation.z = m.kind === 'applaud' ? 0.35 * k : 0;
      }
    }
    flora.update(t); backdrop.update(t); if (training) training.update(t);
    // flags
    for (const f of world.flags) {
      const a = f.geo.attributes.position.array, b = f.base;
      for (let i = 0; i < a.length; i += 3) {
        const u = (b[i] - 0.04) / f.bw;
        a[i + 2] = b[i + 2] + Math.sin(u * 5.5 - t * 4.2 + f.phase + b[i + 1] * 0.8) * f.amp * (0.25 + u) * 1.6;
        a[i + 1] = b[i + 1] - u * u * 0.12 + Math.sin(u * 4 - t * 3.1 + f.phase) * 0.03 * u;
      }
      f.geo.attributes.position.needsUpdate = true;
    }
    crowdAcc += dt; if (++crowdN >= (GFX.crowdRate || 1)) { world.crowd.update(t, crowdAcc, world.crowdState); crowdAcc = 0; crowdN = 0; }      // (the stands move at 30 / 20 / 15 Hz on high / medium / low: the crowd's JS was ~3.8 ms of every frame)
    if (props) props.update(t, dt, world.propState);
  };

  // ---------- the modelled lists (src/lists.js): swapped in for the code-built ones as soon as the pieces are here ----------
  world.lists = null;
  const useLists = (lib) => {
    if (!lib || world.dead || world.lists) return;
    grp.remove(cheap); cheap.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const b of cheapFlags) { grp.remove(b); b.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    world.flags = world.flags.filter(f => !cheapFlags.includes(f.mesh.parent));
    const host = KNIGHTS.find(k => k.id === V.host);
    world.lists = buildLists(grp, lib, { V, arms: BANNER_ARMS, hostArms: host && host.arms, addBanner });
    world.lists.setTilt(tiltOn);
    if (!heraldryReady()) whenHeraldry(() => { const L = world.lists; if (L && !world.dead) { L.setHangings(L.hangArms); L.setHostArms(L.hostArms); } });      // the charge atlas arrives later: repaint the hangings and the host's banner with the real charges
    scene.traverse(o => { if (o.userData.cheapList) o.visible = false; });      // the other files' own daises and stools (ceremony.js, judges.js, stands_life.js)
    if (lastLivery) world.setLivery(...lastLivery);      // the props again, without the pieces the lists now bring
  };
  if (!T) { if (LISTS.lib) useLists(LISTS.lib); else preloadLists().then(useLists); }

  scene.add(grp);
  world.dispose = () => {
    world.dead = true;
    if (world.lists) world.lists.dispose();
    scene.remove(grp);
    grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    if (scene.environment) scene.environment.dispose();
  };
  return world;
}
