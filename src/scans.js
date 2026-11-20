// scans.js — photographed assets (all CC0, Poly Haven; see assets/CREDITS.md):
//   · skies: HDR panoramas of real skies, turned so their sun stands where the venue's sun is
//   · trees and shrubs: photo-scanned models, baked by tools/bake.html into sets of views and drawn as camera-facing cards
//   · rocks, barrels, crates, buckets: photo-scanned meshes placed as they are
// Everything here is optional: if a file is missing the game falls back to its code-built version.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GFX } from './gfx.js';
import { expect, progress, done } from './loadmeter.js';

const ASSETS = new URL('../assets/', import.meta.url).href;
// ready: the trees and props for this graphics tier have all arrived (they load in the background after the menu is up; see GFX.cards / GFX.models)
export const SCANS = { ready: false, pending: null, skies: {}, sky: new Map(), cards: new Map(), models: new Map() };
const SKY_BYTES = { '4k': 20e6, '2k': 5e6, '1k': 1.3e6 };
const MODEL_BYTES = { rock_moss_set_01: 1.9e6, wooden_barrels_01: 7.3e6, wine_barrel_01: 0.9e6, wooden_crate_02: 2.2e6, wooden_bucket_01: 2.3e6, tree_stump_01: 3.9e6 };
const CARD_BYTES = [8.6e6, 8.1e6, 5.4e6, 6.1e6], CARD_HALF = 1.8e6;

/** A scanned model, with its leaf cut-outs restored (the glTF files carry the colour as JPG, so the alpha comes separately). */
export async function loadScan(id) {
  const base = `${ASSETS}scan/${id}/`;
  const gltf = await new GLTFLoader().loadAsync(`${base}${id}.gltf`, (e) => progress('scan:' + id, e));
  const cut = new Set();
  gltf.scene.traverse(o => { if (o.isMesh && (o.material.transparent || o.material.alphaTest > 0)) cut.add(o.material); });
  if (cut.size) {
    const a = await new THREE.TextureLoader().loadAsync(`${base}textures/${id}_alpha_1k.jpg`).catch(() => null);
    for (const m of cut) {
      m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide;
      if (a) { a.flipY = false; a.wrapS = a.wrapT = THREE.RepeatWrapping; m.alphaMap = a; m.alphaTest = 0.5; }
    }
  }
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

async function loadCard(id) {
  const meta = await (await fetch(`${ASSETS}impostor/${id}.json`)).json();
  const tl = new THREE.TextureLoader(), h = GFX.halfCards ? '_h' : '';      // medium and low: the half-size atlases (tools/make_small_impostors.py); same layout, same json
  const [col, nor, occ] = await Promise.all([tl.loadAsync(`${ASSETS}impostor/${id}${h}_col.jpg`), tl.loadAsync(`${ASSETS}impostor/${id}${h}_nor.png`), tl.loadAsync(`${ASSETS}impostor/${id}${h}_occ.png`)]);
  col.colorSpace = THREE.SRGBColorSpace; col.anisotropy = Math.min(4, GFX.aniso);
  return { meta, col, nor, occ };
}

/** The sky in this tier's size (4k / 2k / 1k, made by tools/make_small_skies.py); the 4K original if a small one is missing. Progress is reported as 'sky:name'. */
export function loadSky(name, group = 'bg') {
  if (!name || !SCANS.skies[name]) return Promise.resolve(null);
  if (!SCANS.sky.has(name)) {
    const id = 'sky:' + name, get = (res) => new RGBELoader().loadAsync(`${ASSETS}sky/${name}_${res}.hdr`, (e) => progress(id, e));
    expect(id, group, SKY_BYTES[GFX.sky] || 20e6);
    SCANS.sky.set(name, get(GFX.sky).catch(() => (GFX.sky === '1k' || GFX.sky === '4k' ? Promise.reject() : get('4k'))).then(tex => {
      tex.wrapS = THREE.RepeatWrapping; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const s = { name, tex, info: SCANS.skies[name] }; SCANS.sky.set(name, s); done(id); return s;
    }).catch(() => { SCANS.sky.set(name, null); done(id); return null; }));
  }
  return Promise.resolve(SCANS.sky.get(name));
}
/** The sky if it is already in memory, else null (and it starts loading). */
export function skyNow(name) { const s = SCANS.sky.get(name); if (s && s.tex) return s; loadSky(name); return null; }

/** The small sky list (needed before any sky can load). Resolves even if it is missing: the game then keeps its code-built sky. */
export function loadSkyList() {
  if (!SCANS.skyList) SCANS.skyList = fetch(`${ASSETS}sky/skies.json`).then(r => r.json()).then(j => { SCANS.skies = j; }).catch(() => { SCANS.skies = {}; });
  return SCANS.skyList;
}

/**
 * The tier's trees (impostor atlases) and props (scanned meshes), loaded in the background after the menu is up.
 * Resolves, with SCANS.ready set, when all have arrived or failed; the game builds a venue only after that (see main.js waitForScans).
 */
export function preloadScans() {
  if (SCANS.pending) return SCANS.pending;
  const ok = (id, p) => p.catch(() => null).then(v => { done(id); return v; });
  const jobs = [];
  GFX.cards.forEach((id) => { const k = 'card:' + id; expect(k, 'bg', GFX.halfCards ? CARD_HALF : CARD_BYTES[['jacaranda_tree', 'island_tree_01', 'tree_small_02', 'island_tree_02'].indexOf(id)] || 6e6); jobs.push(ok(k, loadCard(id)).then(c => { if (c) SCANS.cards.set(id, c); })); });
  GFX.models.forEach((id) => { const k = 'scan:' + id; expect(k, 'bg', MODEL_BYTES[id] || 2e6); jobs.push(ok(k, loadScan(id)).then(m => { if (m) SCANS.models.set(id, m); })); });
  SCANS.pending = Promise.all(jobs).then(() => { SCANS.ready = true; return SCANS; });
  return SCANS.pending;
}

// ------------------------------------------------------------------------------------------------ sky

const _c = new THREE.Color();
/**
 * Material for the sky sphere from a photographed sky, plus the light it implies.
 * venueSun: the venue's sun vector; its compass bearing is kept, its height is taken from the photograph.
 */
export function skyFromPhoto(sky, venueSun) {
  const I = sky.info;
  const phi = Math.atan2(venueSun[2], venueSun[0]);
  const exposure = THREE.MathUtils.clamp(0.5 / I.mean, 0.55, 1.3);
  const fog = new THREE.Color().setRGB(I.horizon[0] * exposure, I.horizon[1] * exposure, I.horizon[2] * exposure);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMap: { value: sky.tex }, uRot: { value: I.u - (phi / (Math.PI * 2) + 0.5) }, uExp: { value: exposure }, uMax: { value: 48 }, uFog: { value: fog } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uRot, uExp, uMax; uniform vec3 uFog; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) / 6.28318531 + 0.5 + uRot, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
        vec3 c = min(texture2D(uMap, uv).rgb * uExp, vec3(uMax));
        c = mix(c, uFog, smoothstep(0.045, -0.02, d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const el = Math.max(I.el, 0.17);
  const sunDir = new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el));
  // a sun behind cloud lights less and the sky more
  const clear = THREE.MathUtils.clamp(Math.log10(Math.max(I.peak, 1)) / 4.5, 0.6, 1);
  return { material, sunDir, fog, clear, exposure };
}

// ------------------------------------------------------------------------------------------------ cards (trees, shrubs)

const QUAD = (() => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g; })();

/**
 * Draw one scanned plant many times as camera-facing cards that show the view of it the camera would have.
 * items: [{ x, z, s (scale), yaw, color (THREE.Color tint, about 1) }]
 * light: { sunDir: Vector3, sunCol: Color, sky: Color, ground: Color } — live references, lit like the rest of the scene.
 */
export function buildCards(group, id, items, light, timeU, name = 'cards_' + id) {
  const card = SCANS.cards.get(id);
  if (!card || !items.length) return null;
  const M = card.meta, n = items.length;
  const geo = new THREE.InstancedBufferGeometry(); geo.index = QUAD.index; geo.attributes.position = QUAD.attributes.position; geo.attributes.uv = QUAD.attributes.uv;
  const pos = new Float32Array(n * 4), tint = new Float32Array(n * 3);
  items.forEach((it, i) => { pos.set([it.x, it.z, it.s ?? 1, it.yaw ?? 0], i * 4); const c = it.color || _c.set(0xffffff); tint.set([c.r, c.g, c.b], i * 3); });
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4)); geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: `attribute vec4 iPos; attribute vec3 iTint;
      uniform float uR, uH, uY0, uN, uTime;
      varying vec2 vUv; varying float vF0, vF1, vBlend; varying vec3 vTint, vWorld, vRight, vToCam; varying vec2 vRot;
      #include <fog_pars_vertex>
      void main(){
        vec3 c = vec3(iPos.x, 0.0, iPos.y);
        vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
        float cy = cos(iPos.w), sy = sin(iPos.w); vRot = vec2(cy, sy);
        vec2 l = vec2(toCam.x * cy - toCam.z * sy, toCam.x * sy + toCam.z * cy);      // the camera's bearing in the plant's own frame
        float f = mod(atan(l.x, l.y) / 6.28318531 * uN + uN, uN);
        vF0 = floor(f); vBlend = f - vF0; vF1 = mod(vF0 + 1.0, uN);
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        float s = iPos.z, hy = position.y * position.y;
        vec3 p = c + right * (position.x * 2.0 * uR * s) + vec3(0.0, (uY0 + position.y * uH) * s, 0.0);
        p += right * (sin(uTime * 0.8 + c.x * 0.05 + c.z * 0.04) + 0.4 * sin(uTime * 2.1 + c.x * 0.11)) * 0.035 * hy * uH * s;   // wind
        vUv = uv; vTint = iTint; vWorld = p; vRight = right; vToCam = toCam;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uCol, uNor, uOcc; uniform float uCols, uRows; uniform vec3 uSunDir, uSunCol, uSky, uGround;
      uniform float uR, uH, uGain;
      varying vec2 vUv; varying float vF0, vF1, vBlend; varying vec3 vTint, vWorld, vRight, vToCam; varying vec2 vRot;
      #include <fog_pars_fragment>
      vec2 tile(float f, vec2 uv){ f = floor(f + 0.5); float col = mod(f, uCols), row = floor(f / uCols); return vec2((col + uv.x) / uCols, 1.0 - (row + 1.0 - uv.y) / uRows); }
      void main(){
        vec2 uv = clamp(vUv, 0.004, 0.996), a = tile(vF0, uv), b = tile(vF1, uv);
        vec4 o0 = texture2D(uOcc, a), o1 = texture2D(uOcc, b);
        if (mix(o0.g, o1.g, vBlend) < 0.5) discard;
        vec3 alb = mix(texture2D(uCol, a).rgb, texture2D(uCol, b).rgb, vBlend) * vTint * uGain;
        vec3 n = normalize(mix(texture2D(uNor, a).rgb, texture2D(uNor, b).rgb, vBlend) * 2.0 - 1.0);
        n = vec3(n.x * vRot.x + n.z * vRot.y, n.y, -n.x * vRot.y + n.z * vRot.x);
        // single leaves face every way; a crown is lit as a rounded mass, so lean the normal toward a ball's
        float sx = (vUv.x - 0.5) * 2.0, sy = clamp((vUv.y - 0.62) * uH / uR, -1.0, 1.0);
        vec3 sn = normalize(vRight * sx + vec3(0.0, sy, 0.0) + vToCam * sqrt(max(1.0 - sx * sx - sy * sy, 0.06)));
        n = normalize(mix(n, sn, 0.6));
        float occ = pow(mix(o0.r, o1.r, vBlend), 1.4);                    // light from above reaching this part of the crown
        float direct = smoothstep(-0.45, 0.8, dot(n, uSunDir)) * mix(0.5, 1.0, smoothstep(0.0, 0.4, occ));
        vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5) * (0.75 + 0.75 * occ);
        vec3 V = normalize(vWorld - cameraPosition);
        float thru = pow(max(dot(V, uSunDir), 0.0), 2.0) * 0.55;          // sun coming through the leaves
        vec3 col = alb * (uSunCol * (direct + thru) + amb);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, {
    uCol: { value: card.col }, uNor: { value: card.nor }, uOcc: { value: card.occ },
    uGain: { value: 2.1 }, uR: { value: M.R }, uH: { value: M.H }, uY0: { value: M.y0 }, uN: { value: M.n }, uCols: { value: M.cols }, uRows: { value: M.rows }, uTime: timeU || { value: 0 },
    uSunDir: { value: light.sunDir }, uSunCol: { value: light.sunCol }, uSky: { value: light.sky }, uGround: { value: light.ground },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------------------------------------ meshes (rocks, props)

const _box = new THREE.Box3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/**
 * The separate objects in a scanned set (e.g. six rocks, two barrels), each re-centred to stand on the origin.
 * whole: treat the entire file as one object. match: only nodes whose name contains this.
 */
export function scanVariants(id, { whole = false, match = null } = {}) {
  const src = SCANS.models.get(id);
  if (!src) return [];
  const nodes = whole ? [src] : src.children.filter(c => !match || c.name.includes(match));
  return nodes.map(node => {
    _box.setFromObject(node);
    const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2, y0 = _box.min.y;
    const parts = [];
    node.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: new THREE.Matrix4().makeTranslation(-cx, -y0, -cz).multiply(o.matrixWorld) }); });
    return { parts, size: _box.getSize(new THREE.Vector3()) };
  });
}
/** Place one variant many times. items: [{ x, y, z, yaw, s }] */
export function scatter(group, variant, items, { shadow = true, name = 'scan' } = {}) {
  if (!variant || !items.length) return [];
  return variant.parts.map(part => {
    const mat = part.material; mat.envMapIntensity = 0.35;
    const mesh = new THREE.InstancedMesh(part.geometry, mat, items.length); mesh.name = name;
    items.forEach((it, i) => {
      const s = it.s ?? 1;
      _m.compose(_p.set(it.x, it.y || 0, it.z), _q.setFromAxisAngle(_up, it.yaw || 0), _s.set(s, s * (it.sy ?? 1), s));
      mesh.setMatrixAt(i, _m2.multiplyMatrices(_m, part.matrix));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
}
