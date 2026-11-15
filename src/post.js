// post.js - post-processing pipeline for the jousting game.
// RenderPass -> UnrealBloom (subtle) -> custom grade -> OutputPass (tone map + sRGB) -> SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Grade shader. Runs on linear HDR data (before OutputPass), so all tweaks are gentle.
// Texture reads: 1 (base) + 3 (impact: R/G/B split) + 3 (impact streak) + 5 (speed) worst case.
// Branches are uniform-driven, so inactive effects cost one read only.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uImpact: { value: 0 },
    uFocus: { value: 0 },
    uSpeed: { value: 0 },
    uVignette: { value: 0.28 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.06 },
    uGrain: { value: 0.015 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uImpact, uFocus, uSpeed;
    uniform float uVignette, uSaturation, uContrast, uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);          // 0 at centre, 0.5 at corners
      float r = sqrt(r2);
      vec2 dir = c;                  // radial direction (unnormalised, scales with distance)

      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // --- Impact: chromatic aberration + short radial zoom streak ---
      if (uImpact > 0.002) {
        float ca = uImpact * 0.012 * (0.3 + r * 2.0);
        col = vec3(
          texture2D(tDiffuse, vUv - dir * ca).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, vUv + dir * ca).b);
        float s = uImpact * 0.06;
        vec3 acc = col;
        acc += texture2D(tDiffuse, vUv - dir * s * 0.5).rgb;
        acc += texture2D(tDiffuse, vUv - dir * s).rgb;
        acc += texture2D(tDiffuse, vUv - dir * s * 1.5).rgb;
        col = mix(col, acc * 0.25, clamp(uImpact, 0.0, 1.0) * smoothstep(0.05, 0.4, r));
      }

      // --- Gallop speed: faint radial blur at edges only (nothing in centre third) ---
      if (uSpeed > 0.002) {
        float edge = smoothstep(0.17, 0.5, r);
        float s = uSpeed * 0.035 * edge;
        vec3 acc = col;
        acc += texture2D(tDiffuse, vUv - dir * s * 0.5).rgb;
        acc += texture2D(tDiffuse, vUv - dir * s).rgb;
        acc += texture2D(tDiffuse, vUv - dir * s * 1.5).rgb;
        acc += texture2D(tDiffuse, vUv - dir * s * 2.0).rgb;
        col = mix(col, acc * 0.2, edge * 0.85);
      }

      // --- Focus: desaturate periphery, keep centre crisp ---
      float periph = smoothstep(0.15, 0.55, r);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(luma), uFocus * periph * 0.75);

      // --- Filmic grade ---
      luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      // Contrast about a mid-grey pivot (linear 0.18)
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
      // Warm highlights, cool shadows
      luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float hi = smoothstep(0.25, 1.2, luma);
      float lo = 1.0 - smoothstep(0.0, 0.25, luma);
      col *= mix(vec3(1.0), vec3(1.05, 1.01, 0.93), hi);
      col *= mix(vec3(1.0), vec3(0.95, 0.99, 1.06), lo);

      // --- Vignette (smooth) plus extra edge darkening in focus mode ---
      float vig = smoothstep(0.15, 0.75, r);
      col *= 1.0 - (uVignette * vig * vig + uFocus * 0.35 * periph);

      // --- Animated film grain (~1.5% amplitude) ---
      float g = hash(gl_FragCoord.xy + fract(uTime) * 311.7) - 0.5;
      col *= 1.0 + g * 2.0 * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const state = {
    enabled: true,
    composer: null,
    grade: null,
    bloom: null,
    smaa: null,
    // targets / current values
    tImpact: 0, tFocus: 0, tSpeed: 0,
    impact: 0, focus: 0, speed: 0,
    time: 0,
    w: 0, h: 0, pr: 1,
  };

  try {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    state.w = size.x; state.h = size.y; state.pr = pr;

    // HalfFloat + MSAA target so HDR values survive and edges stay anti-aliased.
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);

    composer.addPass(new RenderPass(scene, camera));

    // Bloom at half res; high threshold so only real highlights glow.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, size.x * pr * 0.5), Math.max(1, size.y * pr * 0.5)),
      0.22, 0.6, 0.9);
    composer.addPass(bloom);

    const grade = new ShaderPass(GradeShader);
    composer.addPass(grade);

    composer.addPass(new OutputPass());

    // SMAA runs after tone mapping (on the display-referred image).
    const smaa = new SMAAPass(size.x * pr, size.y * pr);
    composer.addPass(smaa);

    // Ambient occlusion (grounds horses, stands and figures). Loaded lazily; skipped if unavailable.
    import('three/addons/postprocessing/GTAOPass.js').then(({ GTAOPass }) => {
      const gtao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.2, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.85;
      composer.insertPass(gtao, 1);
      gtao.setSize(state.w * state.pr, state.h * state.pr);
      state.gtao = gtao;
    }).catch((e) => console.warn('[post] GTAO unavailable', e));

    state.composer = composer;
    state.grade = grade;
    state.bloom = bloom;
    state.smaa = smaa;
  } catch (err) {
    console.warn('[post] composer creation failed, using plain rendering:', err);
    state.composer = null;
  }

  // Exponential approach; framerate independent.
  const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  const api = {
    render(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      if (!state.enabled || !state.composer) {
        renderer.render(scene, camera);
        return;
      }
      // Impact is a pulse: it decays on its own, fast (~6/s), and chases any higher target.
      state.tImpact = Math.max(0, state.tImpact - 6 * dt);
      state.impact = state.impact < state.tImpact
        ? ease(state.impact, state.tImpact, 30, dt)
        : Math.max(state.tImpact, state.impact - 6 * dt);
      state.focus = ease(state.focus, state.tFocus, 5, dt);
      state.speed = ease(state.speed, state.tSpeed, 5, dt);
      state.time = (state.time + dt) % 1000;

      const u = state.grade.uniforms;
      u.uImpact.value = state.impact < 0.003 ? 0 : state.impact;
      u.uFocus.value = state.focus < 0.003 ? 0 : state.focus;
      u.uSpeed.value = state.speed < 0.003 ? 0 : state.speed;
      u.uTime.value = state.time;

      try {
        state.composer.render(dt);
      } catch (err) {
        console.warn('[post] composer render failed, falling back:', err);
        state.composer = null;
        renderer.render(scene, camera);
      }
    },

    setSize(w, h, pixelRatio) {
      state.w = w; state.h = h;
      state.pr = pixelRatio || state.pr;
      if (!state.composer) return;
      const pr = state.pr;
      state.composer.setPixelRatio(pr);
      state.composer.setSize(w, h);
      state.bloom.setSize(Math.max(1, w * pr * 0.5), Math.max(1, h * pr * 0.5));
      state.smaa.setSize(w * pr, h * pr);
    },

    setImpact(v) { state.tImpact = Math.min(Math.max(v, 0), 1); },
    setFocus(v) { state.tFocus = Math.min(Math.max(v, 0), 1); },
    setSpeed(v) { state.tSpeed = Math.min(Math.max(v, 0), 1); },

    get enabled() { return state.enabled; },
    set enabled(v) { state.enabled = !!v; },
  };
  return api;
}
