// post.js - post-processing pipeline for the jousting game.
// RenderPass -> UnrealBloom (subtle) -> custom grade -> OutputPass (tone map + sRGB) -> SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GFX } from './gfx.js';

/**
 * The film look and the depth of field: every number in one place.
 * The grade runs after tone mapping, on the display image, so these read like a colourist's controls.
 */
export const GRADE = {
  // Natural colour (owner, 27 Nov: "get rid of the desaturation, it was more normal natural colours before"): full saturation, no split-tone tint,
  // a gentler curve and vignette. Was: saturation 0.88, curve 0.22, warmAmount 0.7, coolAmount 0.6, vignette 0.15.
  saturation: 1.0,                     // 1 = as rendered
  curve: 0.1,                          // mild S-curve on luma (0 = none); darks are eased down a little, never crushed
  warm: [1.040, 1.005, 0.945],         // highlight tint (multiplied in over the top half of the tones)
  cool: [0.965, 0.995, 1.040],         // shadow tint (over the bottom third)
  warmAmount: 0, coolAmount: 0,        // how much of each tint is applied (0..1)
  vignette: 0.08,                      // darkening at the very corners (0.08 = 8%)
  grain: 0.012,                        // film grain amplitude (fraction of the image, under 2%), refreshed 24 times a second
  // depth of field (cinematic cameras only, high tier)
  dofBlur: 4.5,                        // largest blur radius in pixels at 900 px tall (scales with the screen)
  dofSoft: 0.6,                       // how quickly the blur grows with distance from the focal plane (bigger = slower)
  dofFade: 0.3,                        // seconds to fade in or out at a cut
};

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
    uDaze: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uImpact, uFocus, uSpeed, uDaze;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);          // 0 at centre, 0.5 at corners
      float r = sqrt(r2);
      vec2 dir = c;                  // radial direction (unnormalised, scales with distance)

      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // --- Daze (a ringing helm): the picture sways and softens for a second or two ---
      if (uDaze > 0.002) {
        vec2 w = vec2(sin(uTime * 5.3 + vUv.y * 7.0), cos(uTime * 4.1 + vUv.x * 6.0)) * 0.011 * uDaze;
        vec2 bl = vec2(0.016, 0.01) * uDaze;
        vec3 a = texture2D(tDiffuse, vUv + w).rgb;
        a += texture2D(tDiffuse, vUv + w + vec2(bl.x, 0.0)).rgb;
        a += texture2D(tDiffuse, vUv + w - vec2(bl.x, 0.0)).rgb;
        a += texture2D(tDiffuse, vUv + w + vec2(0.0, bl.y)).rgb;
        a += texture2D(tDiffuse, vUv + w - vec2(0.0, bl.y)).rgb;
        col = mix(col, a * 0.2, clamp(uDaze, 0.0, 1.0) * 0.85);
      }

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

      // extra edge darkening in focus mode (the film vignette itself is in the film pass, after tone mapping)
      col *= 1.0 - uFocus * 0.35 * periph;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Film pass: after tone mapping (display-referred). Saturation, S-curve on luma, split-toning, vignette, grain.
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSat: { value: GRADE.saturation }, uCurve: { value: GRADE.curve },
    uWarm: { value: new THREE.Vector3(...GRADE.warm) }, uCool: { value: new THREE.Vector3(...GRADE.cool) },
    uWarmAmt: { value: GRADE.warmAmount }, uCoolAmt: { value: GRADE.coolAmount },
    uVig: { value: GRADE.vignette }, uGrain: { value: GRADE.grain },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSat, uCurve, uWarmAmt, uCoolAmt, uVig, uGrain;
    uniform vec3 uWarm, uCool;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // S-curve on luma, colour ratios kept (so it adds contrast, not saturation)
      float lc = clamp(l, 0.0, 1.0);
      float l2 = mix(lc, lc * lc * (3.0 - 2.0 * lc), uCurve);
      col *= (l2 + 0.0005) / (lc + 0.0005);
      // split-toning: warm highlights, cool shadows
      float hi = smoothstep(0.40, 0.95, l2), lo = 1.0 - smoothstep(0.0, 0.34, l2);
      col *= mix(vec3(1.0), uWarm, hi * uWarmAmt) * mix(vec3(1.0), uCool, lo * uCoolAmt);
      // vignette: uVig at the corners
      vec2 c = vUv - 0.5; float r = length(c) / 0.7071;
      float v = smoothstep(0.25, 1.0, r);
      col *= 1.0 - uVig * v * v;
      // fine grain, fresh 24 times a second, strongest in the mid-tones
      float g = hash(gl_FragCoord.xy + floor(uTime * 24.0) * 37.7) - 0.5;
      col += g * 2.0 * uGrain * (0.35 + 0.65 * 4.0 * l2 * (1.0 - l2));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// Depth of field: a 16-tap golden-spiral gather, run only on pixels that are out of focus (sharp pixels cost one depth read).
// A sample only adds to a pixel if its own blur reaches it, so a sharp knight does not smear into the crowd behind.
const DofShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uNear: { value: 0.1 }, uFar: { value: 1000 },
    uFocus: { value: 10 }, uRange: { value: 2 }, uAmount: { value: 0 },
    uMaxBlur: { value: 7 }, uSoft: { value: GRADE.dofSoft },
    uTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth;
    uniform float uNear, uFar, uFocus, uRange, uAmount, uMaxBlur, uSoft;
    uniform vec2 uTexel;
    varying vec2 vUv;
    float lin(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
    }
    float coc(float d) {
      float x = max(abs(d - uFocus) - uRange, 0.0);
      return uAmount * uMaxBlur * x / (x + uSoft * uFocus + 1.5);
    }
    void main() {
      vec3 c0 = texture2D(tDiffuse, vUv).rgb;
      float k0 = coc(lin(vUv));
      if (k0 < 0.35) { gl_FragColor = vec4(c0, 1.0); return; }
      float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 acc = c0; float wsum = 1.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i) + 0.5;
        float rr = sqrt(fi / 16.0), a = ang + fi * 2.39996323;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * k0 * uTexel;
        float ks = coc(lin(uv));
        float w = smoothstep(0.0, 1.0, ks - rr * k0 + 1.0);
        acc += texture2D(tDiffuse, uv).rgb * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, opts = {}) {
  const lite = !!opts.lite;      // phones: no bloom, no ambient occlusion, lighter MSAA
  const plain = !!opts.plain;
  const useDof = !lite && !plain && (opts.dof === undefined ? GFX.tier === 'high' : !!opts.dof);      // depth of field: high tier on desktop only    // lowest tier: no composer at all (the scene is drawn straight to the screen; the canvas does the tone mapping)
  const state = {
    enabled: true,
    composer: null,
    grade: null,
    bloom: null,
    smaa: null,
    // targets / current values
    tImpact: 0, tFocus: 0, tSpeed: 0, tDaze: 0, daze: 0,
    dofOn: false, dofAmt: 0, dofMax: 1, dofF: 10, dofR: 2, dt: 0.016,
    impact: 0, focus: 0, speed: 0,
    time: 0,
    w: 0, h: 0, pr: 1,
  };

  try {
    if (plain) throw new Error('plain rendering (low graphics tier)');
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    state.w = size.x; state.h = size.y; state.pr = pr;

    // HalfFloat + MSAA target so HDR values survive and edges stay anti-aliased.
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: lite || size.x * size.y * pr * pr > 3.2e6 ? 2 : 4,      // (a big buffer: half the multisampling, the GPU memory would be doubled)
    });
    if (useDof) target.depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr);      // (the composer clones it, so both buffers have one: the scene is drawn into whichever is current)
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);

    composer.addPass(new RenderPass(scene, camera));

    // Bloom at half res; high threshold so only real highlights glow.
    const bloom = lite ? null : new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, size.x * pr * 0.5), Math.max(1, size.y * pr * 0.5)),
      0.22, 0.6, 0.9);
    if (bloom) composer.addPass(bloom);

    let dof = null;
    if (useDof) {
      dof = new ShaderPass(DofShader);
      dof.enabled = false;
      const orig = dof.render.bind(dof);
      dof.render = (r, wb, rb, dt, mask) => {      // the depth lives in whichever buffer the scene was drawn into
        const u = dof.uniforms;
        u.tDepth.value = rb.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far;
        u.uTexel.value.set(1 / rb.width, 1 / rb.height);
        u.uMaxBlur.value = GRADE.dofBlur * rb.height / 900; u.uSoft.value = GRADE.dofSoft;
        orig(r, wb, rb, dt, mask);
      };
      composer.addPass(dof);
    }

    const grade = new ShaderPass(GradeShader);
    composer.addPass(grade);

    composer.addPass(new OutputPass());

    // the film grade, on the tone-mapped image
    const film = new ShaderPass(FilmShader);
    composer.addPass(film);
    state.film = film; state.dof = dof;

    // SMAA runs after tone mapping (on the display-referred image).
    const smaa = new SMAAPass(size.x * pr, size.y * pr);
    composer.addPass(smaa);

    // Ambient occlusion (grounds horses, stands and figures). Loaded lazily; skipped if unavailable.
    if (!lite) import('three/addons/postprocessing/GTAOPass.js').then(({ GTAOPass }) => {
      if (!state.composer || state.lighter) return;      // dropped to a lighter pipeline while this was loading
      const gtao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.2, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.85;
      // three.js renders the sun's shadow map inside EVERY renderer.render() call, and GTAO draws the whole scene again (normals) through one: the shadow map is the same
      // as RenderPass just made, so draw it once. (Measured at 1080p, high tier, charge: about 500 draw calls and 3 ms of GPU per frame.)
      const gtaoRender = gtao.render.bind(gtao);
      gtao.render = (r, ...rest) => { const sm = r.shadowMap, was = sm.autoUpdate; sm.autoUpdate = false; try { gtaoRender(r, ...rest); } finally { sm.autoUpdate = was; } };
      composer.insertPass(gtao, 1);
      gtao.setSize(state.w * state.pr, state.h * state.pr);
      state.gtao = gtao;
    }).catch((e) => console.warn('[post] GTAO unavailable', e));

    state.composer = composer;
    state.grade = grade;
    state.bloom = bloom;
    state.smaa = smaa;
  } catch (err) {
    if (!plain) console.warn('[post] composer creation failed, using plain rendering:', err);
    state.composer = null;
  }

  // Exponential approach; framerate independent.
  const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  const api = {
    render(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1); state.dt = dt || 0.016;
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
      state.daze = ease(state.daze, state.tDaze, 6, dt);
      state.time = (state.time + dt) % 1000;

      const u = state.grade.uniforms;
      u.uImpact.value = state.impact < 0.003 ? 0 : state.impact;
      u.uFocus.value = state.focus < 0.003 ? 0 : state.focus;
      u.uSpeed.value = state.speed < 0.003 ? 0 : state.speed;
      u.uDaze.value = state.daze < 0.003 ? 0 : state.daze;
      u.uTime.value = state.time;
      state.film.uniforms.uTime.value = state.time;
      if (state.dof) {
        const du = state.dof.uniforms;
        state.dofAmt = Math.min(1, Math.max(0, state.dofAmt + (state.dofOn ? 1 : -1) * dt / Math.max(GRADE.dofFade, 0.01)));
        const a = state.dofAmt, e = a * a * (3 - 2 * a);
        state.dof.enabled = e > 0.01;
        du.uAmount.value = e * state.dofMax; du.uFocus.value = state.dofF; du.uRange.value = state.dofR;
      }

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
      if (state.bloom) state.bloom.setSize(Math.max(1, w * pr * 0.5), Math.max(1, h * pr * 0.5));
      state.smaa.setSize(w * pr, h * pr);
    },

    /** Live drop to a lighter pipeline (the frame-time safety net): 'lite' switches bloom and ambient occlusion off, 'plain' frees the composer. */
    lighten(level) {
      if (!state.composer) return;
      if (level === 'plain') {
        try { state.composer.renderTarget1.dispose(); state.composer.renderTarget2.dispose(); if (state.gtao && state.gtao.dispose) state.gtao.dispose(); } catch (e) { /* already gone */ }
        state.composer = null; return;
      }
      if (state.bloom) state.bloom.enabled = false;
      if (state.gtao) state.gtao.enabled = false;
      if (state.dof) { state.dof.enabled = false; state.dofOn = false; state.dofAmt = 0; state.dof = null; }      // no depth of field on a lighter pipeline
      state.lighter = true;
    },

    /** Depth of field for a cinematic camera: focus = distance in metres to the subject, range = half-depth that stays sharp, amount 0..1 (wide shots near 0). setDOF(null) = live play (eases out over GRADE.dofFade). */
    setDOF(focus, range = 2, amount = 1) {
      if (!state.dof) return;
      if (focus == null) { state.dofOn = false; return; }
      if (!state.dofOn && state.dofAmt < 0.02) { state.dofF = focus; state.dofR = range; }      // a new shot: the focus is already there as it fades in
      state.dofOn = true; amount = Math.min(Math.max(amount, 0), 1);
      if (state.dofAmt < 0.02) state.dofMax = amount; else state.dofMax += (amount - state.dofMax) * (1 - Math.exp(-14 * state.dt));
      if (amount < 0.03) state.dofOn = false;      // a wide shot: no depth of field at all
      const k = 1 - Math.exp(-14 * state.dt);
      state.dofF += (focus - state.dofF) * k; state.dofR += (range - state.dofR) * k;
    },
    get dofActive() { return !!(state.dof && state.dof.enabled); },

    setImpact(v) { state.tImpact = Math.min(Math.max(v, 0), 1); },
    setFocus(v) { state.tFocus = Math.min(Math.max(v, 0), 1); },
    setDaze(v) { state.tDaze = Math.min(Math.max(v, 0), 1); },
    setSpeed(v) { state.tSpeed = Math.min(Math.max(v, 0), 1); },

    get enabled() { return state.enabled; },
    set enabled(v) { state.enabled = !!v; },
  };
  return api;
}
