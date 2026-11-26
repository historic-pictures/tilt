// crest.js - what a knight wears on his helm besides the plume: a crest (a modelled piece on the crown), mantling (the dagged cloth hanging from it) and
// gilt work on the helm itself. All of it rides the rigged rider's `helm` marker (on the Head bone), so it moves with the head and hides with the helm.
// A knight asks for it in his record (data.js KNIGHTS): { crest: 'horns', mantling: true, helmCross: true }.  The pieces are small glbs built by
// tools/blender/crests.py in the helm's own frame (+x left, +y up, +z forward); to add a crest, model it there, list it in CRESTS, name it on a knight.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { liveryOf } from './heraldry.js';

/** id -> { file, fits: helms it is modelled for (the flat-topped great helm, so far) } */
export const CRESTS = { horns: { file: 'horns', fits: ['greathelm'] } };
const MANTLING = { file: 'mantling', fits: ['greathelm'] };
const DIR = new URL('../assets/models/crests/', import.meta.url).href, gl = new GLTFLoader(), FILES = new Map();
const load = (file) => { if (!FILES.has(file)) FILES.set(file, gl.loadAsync(`${DIR}${file}.glb`).then(g => g.scene).catch((e) => { console.warn('[crest]', file, e); return null; })); return FILES.get(file); };
const GILT = new THREE.MeshStandardMaterial({ color: 0xd9a738, metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });
const shadows = (o) => o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

/** Fetch what these knights will wear, ahead of building them (a rider built before it arrives is dressed when it lands). */
export function preloadCrests(defs = []) { return Promise.all(defs.filter(Boolean).flatMap(d => [d.crest && CRESTS[d.crest] && load(CRESTS[d.crest].file), d.mantling && load(MANTLING.file)]).filter(Boolean)); }

/**
 * Dress a rigged rider's helm. want: { crest, mantling, helmCross }; J: the Jouster (J.helm = the helm marker, J.rig.helmMesh = the helm).
 * Sets J.crestG (everything added here, shown and hidden with the helm) and J.mantU (the mantling's sway: x time, y how hard he rides; Jouster.update writes it).
 */
export function dressHelm(J, want) {
  if (!J.rig || !J.helm || !want) return;
  const helm = J.armourDef.helm, G = J.crestG = new THREE.Group(); G.name = 'crest'; J.helm.add(G);
  J.mantU = { value: new THREE.Vector2(0, 0) };
  if (want.helmCross && J.rig.helmMesh) giltCross(J);
  const def = want.crest && CRESTS[want.crest];
  if (def && def.fits.includes(helm)) load(def.file).then((s) => {
    if (!s || !G.parent) return;
    const c = s.clone(true); c.traverse(o => { if (o.isMesh) o.material = GILT; }); shadows(c); G.add(c);
    while (J.plume && J.plume.children.length) J.plume.remove(J.plume.children[0]);      // the crest takes the plume's place
  });
  if (want.mantling && MANTLING.fits.includes(helm)) load(MANTLING.file).then((s) => {
    if (!s || !G.parent) return;
    const L = liveryOf(J.arms), c = s.clone(true), lining = new THREE.Color(L.metal).multiplyScalar(0.92);
    const cloth = (hex) => {      // one sheet: the livery's colour outside, its metal as the lining
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.92), roughness: 0.92, envMapIntensity: 0.3, side: THREE.DoubleSide });
      m.customProgramCacheKey = () => 'mantling';
      m.onBeforeCompile = (sh) => {      // the free cloth sways and streams back at the gallop; the crown (uv.y 0) holds still
        sh.uniforms.uMant = J.mantU; sh.uniforms.uLining = { value: lining };
        sh.fragmentShader = 'uniform vec3 uLining;' + String.fromCharCode(10) + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>' + String.fromCharCode(10) + ' if (!gl_FrontFacing) diffuseColor.rgb = uLining;');
        sh.vertexShader = 'uniform vec2 uMant;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          { float w = uv.y * uv.y, ph = uv.x * 19.0;
            transformed += normal * (sin(ph + uMant.x * 5.0) * 0.012 + sin(ph * 2.3 - uMant.x * 8.0) * 0.006) * w * (0.5 + uMant.y);
            transformed.z -= (0.07 + 0.03 * sin(uMant.x * 6.0 + ph)) * uMant.y * w; transformed.y += 0.05 * uMant.y * w; }`);
      };
      return m;
    };
    const m = cloth(L.colour); c.traverse(o => { if (o.isMesh) o.material = m; }); shadows(c); G.add(c);
  });
}

/**
 * A gilt cross on the face of a great helm: the upright down the prow, the arms along the sights, the ends flared. Not a separate mesh: this rider's helm gets
 * its own material, which turns to gilt where the helm's surface (in the helm's frame, baked per vertex) lies inside the cross, with a dark line at its edge.
 */
function giltCross(J) {
  const hm = J.rig.helmMesh, H = J.helm; J.root.updateMatrixWorld(true);
  const g0 = hm.geometry, g = new THREE.BufferGeometry(); for (const a in g0.attributes) g.setAttribute(a, g0.attributes[a]); g.setIndex(g0.index); if (g0.boundingSphere) g.boundingSphere = g0.boundingSphere; if (g0.boundingBox) g.boundingBox = g0.boundingBox;
  const p = g0.attributes.position, inv = H.matrixWorld.clone().invert(), v = new THREE.Vector3(), hp = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); hm.applyBoneTransform(i, v); v.applyMatrix4(hm.matrixWorld).applyMatrix4(inv); hp[i * 3] = v.x; hp[i * 3 + 1] = v.y; hp[i * 3 + 2] = v.z; }
  g.setAttribute('hpos', new THREE.BufferAttribute(hp, 3)); hm.geometry = g;
  const m = hm.material.clone(); m.customProgramCacheKey = () => 'giltCross';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec3 hpos; varying vec3 vHpos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHpos = hpos;');
    sh.fragmentShader = `varying vec3 vHpos;
      float giltK() {      // 1 inside the cross (helm frame: sights at y 0.165, crown at 0.30, prow along x 0)
        float up = smoothstep(0.03, 0.06, vHpos.z);                                                        // the face only
        float wv = 0.019 + 0.02 * smoothstep(0.06, 0.0, vHpos.y + 0.035) + 0.012 * smoothstep(0.25, 0.3, vHpos.y);      // the upright, flaring at the foot and under the crown
        float v = (1.0 - smoothstep(wv - 0.002, wv + 0.002, abs(vHpos.x))) * step(-0.055, vHpos.y);
        float wh = 0.021 + 0.02 * smoothstep(0.085, 0.118, abs(vHpos.x));                                   // the arms, flaring toward the temples
        float h = (1.0 - smoothstep(wh - 0.002, wh + 0.002, abs(vHpos.y - 0.165))) * (1.0 - smoothstep(0.116, 0.12, abs(vHpos.x)));
        return max(v, h) * up;
      }
      ` + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n float gk = giltK(); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.6, 0.17), gk); diffuseColor.rgb *= 1.0 - 0.55 * gk * (1.0 - gk) * 4.0;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.3, gk);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 1.0, gk);');
  };
  hm.material = m; J._helmGilt = m;
}
