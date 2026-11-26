// ground.js - the lists sand and the meadow grass: no visible tiling, damp and dry patches, hoof-churned lanes, scuffed run-outs.
//
// One onBeforeCompile patch for a MeshStandardMaterial laid flat on the XZ plane (the sand strip, the grass field):
//   * stochastic sampling ("texture repetition", Inigo Quilez): every tile is drawn with its own random rotation and offset, the four
//     neighbouring tiles are cross-faded, the contrast the blend loses is put back, and normals are rotated with their tile
//   * macro variation from low-frequency noise (55 m, 14 m, 3 m): damp dark patches, dry pale ones, and a fine second detail scale for close-ups
//   * wear (sand): the riding lanes either side of the tilt churned by hooves (darker, pitted, with a normal-map bump), the run-out ends scuffed
//     and raked, the rim of the strip thinning into earth; (grass): trampled bare earth round the lists where the commons stand
// Tiers (GFX.tier): high = every map stochastic; medium = colour and normal stochastic; low = plain maps, only the cheap colour variation
// (no normal bump, no extra taps), so the low path stays as cheap as the old detailWorld one.
import * as THREE from 'three';
import { GFX } from './gfx.js';

const GLSL_LIB = /* glsl */`
varying vec3 vGW;
float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 gHash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1., 0.)), f.x), mix(gHash(i + vec2(0., 1.)), gHash(i + vec2(1., 1.)), f.x), f.y); }
mat2 gRot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

const GLSL_TILE = /* glsl */`
// mode 0: colour (variance-corrected cross-fade); mode 1: tangent-space normal (xy rotated back with its tile)
vec3 gTile(sampler2D s, vec2 uv, int mode){
  vec2 i = floor(uv), f = fract(uv), dx = dFdx(uv), dy = dFdy(uv);
  vec2 w2 = f * f * (3.0 - 2.0 * f);
  vec3 acc = vec3(0.0); float wq = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(mod(float(k), 2.0), floor(float(k) * 0.5));
    vec2 c = i + o;
    float w = (o.x > 0.5 ? w2.x : 1.0 - w2.x) * (o.y > 0.5 ? w2.y : 1.0 - w2.y);
    vec2 h = gHash2(c); vec2 h2 = gHash2(c + 17.31);
    float a = h.x * 6.28318;
    mat2 R = gRot(a);
    vec2 q = R * (uv - c) + h2;
    vec3 t = textureGrad(s, q, R * dx, R * dy).rgb;
    if (mode == 1) { vec3 n = t * 2.0 - 1.0; n.xy = gRot(-a) * n.xy; t = n; }
    acc += w * t; wq += w * w;
  }
  float g = 1.0 / max(sqrt(wq), 0.55);
  if (mode == 1) return vec3(acc.xy * g, acc.z);
  vec3 m = textureLod(s, vec2(0.5), 11.0).rgb;
  return max(m + (acc - m) * g, 0.0);
}
`;

/**
 * Patch a flat ground material. opts:
 *   kind: 'sand' | 'grass'        diff: the colour texture for grass (sand uses its own .map)     mean: that texture's average linear colour
 *   dirt: [r,g,b] linear colour of trampled earth (grass)    lane: x of the riding lanes    half: [x, z] half extent of the sand strip
 */
const GAINS = '1.62', GAING = '1.0';      // linear gain on the sand (patches and wear take about a quarter of the light); grass: none
export function groundShader(mat, { kind = 'sand', diff = null, mean = [0.32, 0.236, 0.106], dirt = [0.3, 0.22, 0.12], lane = 0.95, half = [9.5, 51], detail = 0.35 } = {}) {
  const tile = GFX.tier === 'high' ? 3 : GFX.tier === 'medium' ? 2 : 0;      // 3 = colour + normal + roughness stochastic, 2 = colour + normal, 0 = plain
  const sand = kind === 'sand';
  const F = (v) => v.toFixed(4);
  mat.onBeforeCompile = (sh) => {
    if (diff) sh.uniforms.uGDiff = { value: diff };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const lib = GLSL_LIB.replace('varying vec3 vGW;', '') + (tile ? GLSL_TILE : '');
    // colour / macro / wear. Declared in main so the roughness and normal chunks below can read them.
    const colour = `
      float gDamp = 0.0, gChurn = 0.0, gScuff = 0.0, gTramp = 0.0;
      vec2 gp = vGW.xz;
      {
        vec3 tex;
        ${sand
          ? (tile ? 'tex = gTile(map, vMapUv, 0);' : 'tex = texture2D(map, vMapUv).rgb;')
          : (tile ? `tex = gTile(uGDiff, vNormalMapUv, 0) / vec3(${mean.map(F).join(',')});` : `tex = texture2D(uGDiff, vNormalMapUv).rgb / vec3(${mean.map(F).join(',')});`)}
        ${tile ? `// second, fine detail scale: the same texture small, only its luminance
        vec3 fine = ${sand ? 'texture2D(map, vMapUv * 6.7 + 0.31).rgb' : `texture2D(uGDiff, vNormalMapUv * 6.7 + 0.31).rgb / vec3(${mean.map(F).join(',')})`};
        tex *= mix(1.0, dot(fine, vec3(0.33)) ${sand ? '/ max(dot(textureLod(map, vec2(0.5), 11.0).rgb, vec3(0.33)), 0.02)' : ''}, ${F(detail)});` : ''}
        // macro: damp dark patches (negative), dry pale ones (positive), at 55 m, 14 m and 3 m
        float n1 = gNoise(gp * 0.018 + 3.1), n2 = gNoise(gp * 0.07 + 7.7), n3 = gNoise(gp * 0.31 + 1.3);
        float tone = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.42 + (n3 - 0.5) * ${sand ? '0.24' : '0.3'};
        gDamp = smoothstep(0.0, -0.3, tone);
        vec3 macro = vec3(1.0 + tone * 0.76);      // (lightness only: the patches must not shift the hue or saturation of the venue's ground)
        macro = mix(macro, macro * 0.88, gDamp * 0.5);
        ${sand ? '' : 'macro *= mix(vec3(1.0), vec3(1.06, 1.02, 0.9), smoothstep(0.1, 0.35, tone) * 0.4);'}
        diffuseColor.rgb *= tex * clamp(macro, 0.45, 1.6) * ${sand ? GAINS : GAING};      // (GAIN: calibrated so the mean colour matches the old plain-texture ground)
        ${sand ? `
        // ---- wear on the lists ----
        float ax = abs(gp.x), az = abs(gp.y);
        float wob = (gNoise(vec2(gp.y * 0.33, gp.x * 0.5 + 9.0)) - 0.5) * 0.45;
        float ln = exp(-pow((ax - ${F(lane)} + wob) / 0.5, 2.0));
        float halo = exp(-pow((ax - ${F(lane)}) / 1.9, 2.0));      // a faint, wide trodden zone round both lanes (and over the tilt's foot, so no bare strip is left between them)
        float along = 0.5 + 0.5 * smoothstep(32.0, 40.0, az) + 0.25 * smoothstep(20.0, 30.0, az);      // hardest at the starts and the run-outs, lighter between
        along *= 1.0 - smoothstep(47.0, 50.5, az);
        along *= 0.35 + 0.65 * smoothstep(0.25, 0.7, gNoise(vec2(gp.y * 0.16, floor(gp.x * 2.0) + 3.0) + 0.5) * 0.5 + gNoise(gp * 0.5) * 0.5);      // churned in stretches, not as a ribbon
        float brk = gNoise(gp * vec2(5.0, 2.4) + 4.0) * 0.55 + gNoise(gp * 13.0) * 0.45;
        gChurn = ln * along * smoothstep(0.34, 0.8, brk + ln * 0.16);
        // the run-out ends: scuffed, raked ground, and a worn patch before each gate
        float endz = smoothstep(33.0, 43.0, az) * (1.0 - smoothstep(49.0, 51.5, az));
        float scf = gNoise(gp * vec2(0.9, 0.55) + 21.0) * 0.6 + gNoise(gp * vec2(3.2, 1.3) + 5.0) * 0.4;
        gScuff = endz * smoothstep(0.32, 0.7, scf);
        float rake = gNoise(vec2(gp.x * 7.0, gp.y * 0.9) + 2.0);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9), halo * (0.35 + 0.65 * brk) * 0.6);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72), gChurn * 0.6);
        diffuseColor.rgb *= mix(1.0, 0.78 + 0.3 * rake, gScuff * 0.9);
        // the rim of the strip thins into earth and a little turf
        float rim = max(smoothstep(${F(half[0] - 1.1)}, ${F(half[0] - 0.05)}, ax), smoothstep(${F(half[1] - 1.1)}, ${F(half[1] - 0.05)}, az));
        rim *= 0.4 + 0.6 * gNoise(gp * 2.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.64, 0.5), rim * 0.5);
        ` : `
        // trodden bare earth round the lists, where the commons stand and the horses come and go
        vec2 dq = max(abs(gp) - vec2(${F(half[0])}, ${F(half[1])}), 0.0);
        float dd = length(dq) + (gNoise(gp * 0.55 + 12.0) - 0.5) * 2.6 + (gNoise(gp * 2.1) - 0.5) * 0.8;
        gTramp = 1.0 - smoothstep(0.4, 4.2, dd);
        gTramp *= 0.55 + 0.45 * smoothstep(0.25, 0.6, gNoise(gp * 1.3 + 40.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${dirt.map(F).join(',')}) * mix(0.8, 1.15, tex.g), gTramp * 0.8);
        `}
      }`;
    const tileMaps = `
      #ifdef USE_NORMALMAP_TANGENTSPACE
        ${tile ? 'vec3 mapN = gTile(normalMap, vNormalMapUv, 1);' : 'vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;'}
        mapN.xy *= normalScale;
        normal = normalize(tbn * normalize(mapN));
      #endif`;
    const bump = sand && tile ? `
      {
        // hoof pits and rake marks: a height field's slope tilts the normal, fading out with distance
        float fadeB = 1.0 - smoothstep(18.0, 60.0, length(vViewPosition));
        if (fadeB > 0.0 && (gChurn + gScuff) > 0.02) {
          vec2 e = vec2(0.045, 0.0);
          float h0 = (gNoise(gp * 9.0) * 0.6 + gNoise(gp * 22.0) * 0.4), h1 = (gNoise((gp + e.xy) * 9.0) * 0.6 + gNoise((gp + e.xy) * 22.0) * 0.4), h2 = (gNoise((gp + e.yx) * 9.0) * 0.6 + gNoise((gp + e.yx) * 22.0) * 0.4);
          float amt = (gChurn * 1.0 + gScuff * 0.45) * fadeB * 0.9;
          vec3 gw = vec3(-(h1 - h0) / e.x, 0.0, -(h2 - h0) / e.x) * amt * 0.16;
          normal = normalize(normal + mat3(viewMatrix) * gw);
        }
      }` : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\n' + (diff ? 'uniform sampler2D uGDiff;\n' : '') + lib)
      .replace('#include <map_fragment>', colour)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        ${tile === 3 ? `{ float rr = gTile(roughnessMap, vRoughnessMapUv, 0).g; roughnessFactor = roughness * rr; }` : ''}
        roughnessFactor = clamp(roughnessFactor - gDamp * 0.12 + (gChurn + gScuff) * 0.08, 0.2, 1.0);`)
      .replace('#include <normal_fragment_maps>', tileMaps + bump);
  };
  mat.customProgramCacheKey = () => `ground${kind}${tile}${mean.join()}${dirt.join()}${lane}${half.join()}${detail}`;
  mat.needsUpdate = true;
  return mat;
}
