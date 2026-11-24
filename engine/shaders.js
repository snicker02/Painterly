// All GLSL source (WebGL1 / GLSL ES 1.00) as exported strings.

export const VS_QUAD = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Underpainting blit with per-style imprimatura tone.
export const FS_TEX = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uMul;
uniform vec3 uTone;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uMul * uTone, 1.0); }
`;

export const VS_STROKE = `
attribute vec2  aPos;
attribute vec2  aUV;
attribute vec3  aColor;
attribute float aSeed;
varying vec2  vUV;
varying vec3  vColor;
varying float vSeed;
void main(){ vUV = aUV; vColor = aColor; vSeed = aSeed; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Parametric brush. One profile driven by 16 params; built-in shapes and custom
// brushes are just parameter sets. Realism comes from: stochastic (non-periodic)
// bristle channels, pigment loading that runs the paint out toward the end, and
// canvas-tooth deposition that breaks up flat colour. Per-stroke variation from
// the vertex seed keeps no two marks identical.
export const FS_STROKE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2  vUV;
varying vec3  vColor;
varying float vSeed;
uniform float uImpasto;
uniform float uBodyW, uEdgeHard, uFlat, uTipFront, uTipBack, uBelly, uPressure;
uniform float uBristleN, uBristleD, uGrain, uGrainScale, uEdgeNoise, uRelief, uVary;
uniform float uLoad, uTooth;
const float PI = 3.14159265;
float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vnoise2(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1,311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0,0.0), vec2(127.1,311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0,1.0), vec2(127.1,311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0,1.0), vec2(127.1,311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  float along = vUV.x, across = vUV.y, ax = abs(across), a01 = across * 0.5 + 0.5;
  float s = vSeed;

  // per-stroke variation
  float vy    = uVary;
  float vBody = uBodyW    * (1.0 + (h11(s + 1.3) - 0.5) * 0.7 * vy);
  float vTF   = uTipFront * (1.0 + (h11(s + 2.1) - 0.5) * 0.9 * vy);
  float vTB   = uTipBack  * (1.0 + (h11(s + 3.7) - 0.5) * 0.9 * vy);
  float vPr   = uPressure + (h11(s + 4.3) - 0.5) * 0.6 * vy;
  float vGr   = uGrain    * (1.0 + (h11(s + 5.9) - 0.5) * 0.8 * vy);

  // length envelope (tapered ends, optional pointed belly, pressure skew)
  float envF = smoothstep(0.0, max(0.01, vTF), along);
  float envB = smoothstep(0.0, max(0.01, vTB), 1.0 - along);
  float env  = envF * envB;
  env = mix(env, env * sin(PI * along), uBelly);
  float press = 1.0 + vPr * (along - 0.5) * 2.0;
  float halfW = clamp(vBody * env * press, 0.0, 1.3);

  // ragged edge
  halfW += (vnoise2(vec2(along * 20.0, s * 17.0)) - 0.5) * uEdgeNoise * 0.45;
  halfW = max(halfW, 0.0);

  // silhouette with soft/crisp edge
  float soft = 1.0 - uEdgeHard;
  float alpha = 1.0 - smoothstep(halfW * (1.0 - soft), halfW + 0.004, ax);
  alpha *= smoothstep(0.0, 0.02, halfW);   // clean vanishing at tips

  // stochastic bristles: irregular longitudinal channels, not a periodic comb.
  float streak = 0.5;
  if(uBristleN > 0.5){
    float f  = uBristleN;
    float n1 = vnoise2(vec2(a01 * f,       s * 41.0));
    float n2 = vnoise2(vec2(a01 * f * 2.3, s * 13.0 + 5.0));
    streak = 0.62 * n1 + 0.38 * n2;
    float life = 0.55 + 0.45 * vnoise2(vec2(along * 4.0, a01 * f * 0.5 + s * 9.0)); // hairs skip along length
    float chan = smoothstep(0.32, 0.72, streak) * life;
    alpha *= mix(1.0, chan, uBristleD);
  }

  // pigment loading: paint runs out toward the end, heavier at the loaded start
  if(uLoad > 0.001){
    float dryStart = 0.40 + 0.40 * h11(s + 8.1);
    float fade = 1.0 - uLoad * smoothstep(dryStart, 1.0, along) * (0.45 + 0.55 * h11(s + 2.2));
    fade *= 1.0 + uLoad * 0.22 * smoothstep(0.22, 0.0, along);
    alpha *= clamp(fade, 0.0, 1.3);
  }

  // canvas tooth / broken colour: fine granular deposition across the mark
  float g = 0.5;
  if(uTooth > 0.001){
    g = vnoise2(vec2(along * uGrainScale * 1.3, a01 * uGrainScale * 0.9) + s * 3.0);
    alpha *= mix(1.0, smoothstep(0.12, 0.60, g + 0.22), uTooth);
  }

  // dry-brush holes (strong gaps)
  float n = 0.0;
  if(vGr > 0.001){
    n = vnoise2(vec2(along * uGrainScale, a01 * uGrainScale * 0.55) + s * 10.0);
    float holes = smoothstep(0.30, 0.62, n + (0.5 - vGr) * 0.4);
    alpha *= mix(1.0, holes, vGr);
  }

  if(alpha < 0.012) discard;

  // relief -> impasto lighting
  float relief = -across * (1.0 - uFlat);
  if(uBristleN > 0.5) relief += (streak - 0.5) * uBristleD * 0.9;
  if(uTooth > 0.001)  relief += (g - 0.5) * uTooth * 0.5;
  if(vGr > 0.001)     relief += (n - 0.5) * vGr;
  float shade = 1.0 + uImpasto * uRelief * relief * 0.6;
  gl_FragColor = vec4(clamp(vColor * shade, 0.0, 1.0), alpha);
}
`;

export const FS_EDGE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uSigma;
const int R = 7;
const vec3 LUM = vec3(0.299, 0.587, 0.114);
float tanhf(float x){ x = clamp(x, -15.0, 15.0); return 1.0 - 2.0 / (exp(2.0 * x) + 1.0); }
float lum(vec2 uv){ return dot(texture2D(uSrc, uv).rgb, LUM); }
void main(){
  float s1 = max(0.3, uSigma), s2 = s1 * 1.6;
  float i1 = -1.0 / (2.0 * s1 * s1), i2 = -1.0 / (2.0 * s2 * s2);
  float sum1 = 0.0, sum2 = 0.0, wa = 0.0, wb = 0.0;
  for(int y = -R; y <= R; y++){
    for(int x = -R; x <= R; x++){
      vec2 o = vec2(float(x), float(y));
      float d2 = dot(o, o);
      float g1 = exp(d2 * i1), g2 = exp(d2 * i2);
      float L = lum(vUv + o * uTexel);
      sum1 += L * g1; wa += g1; sum2 += L * g2; wb += g2;
    }
  }
  float D = (sum1 / wa) - 0.988 * (sum2 / wb);
  float e = D >= 0.0 ? 1.0 : 1.0 + tanhf(22.0 * D);
  gl_FragColor = vec4(vec3(clamp(e, 0.0, 1.0)), 1.0);
}
`;

export const FS_COMP = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uPaint;
uniform sampler2D uEdge;
uniform vec2  uRes;
uniform float uPosterize, uSat, uContrast, uBright, uWarmth;
uniform float uPaper, uPaperMode, uEdgeOn, uEdgeStrength, uVignette, uVarnish;
uniform vec3  uEdgeColor;
const vec3 LUM = vec3(0.299, 0.587, 0.114);
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, amp = 0.5; for(int i = 0; i < 5; i++){ s += amp * vnoise(p); p *= 2.0; amp *= 0.5; } return s; }
float heightAt(vec2 uv, vec2 res){ float h = dot(texture2D(uPaint, uv).rgb, LUM); h += 0.12 * vnoise(uv * res * 0.75); return h; }
void main(){
  vec3 col = texture2D(uPaint, vUv).rgb;
  if(uPosterize > 1.5){ col = floor(col * uPosterize + 0.5) / uPosterize; }
  col = (col - 0.5) * uContrast + 0.5 + uBright;
  float l = dot(col, LUM);
  col = mix(vec3(l), col, uSat);
  col += vec3(uWarmth, uWarmth * 0.15, -uWarmth) * 0.6;
  col = clamp(col, 0.0, 1.0);

  vec2 pc = vUv * uRes;
  float fine = vnoise(pc * 0.5);
  float paper;
  if(uPaperMode < 0.5){
    float weave = 0.5 + 0.5 * sin(pc.x * 2.2) * sin(pc.y * 2.2);
    paper = mix(0.90, 1.0, weave) * mix(0.92, 1.0, fine);
  } else if(uPaperMode < 1.5){
    paper = (0.82 + 0.18 * fbm(pc * 0.06)) * mix(0.94, 1.0, fine);
  } else {
    paper = 0.80 + 0.20 * (vnoise(pc * 0.9) * 0.6 + vnoise(pc * 2.1) * 0.4);
  }
  col *= mix(1.0, paper, uPaper);

  float e = texture2D(uEdge, vUv).r;
  if(uEdgeOn > 0.5){ col = mix(col, uEdgeColor, clamp((1.0 - e) * uEdgeStrength, 0.0, 1.0)); }

  if(uVarnish > 0.001){
    vec2 tx = 1.0 / uRes;
    float hC = heightAt(vUv, uRes);
    float hX = heightAt(vUv + vec2(tx.x, 0.0), uRes);
    float hY = heightAt(vUv + vec2(0.0, tx.y), uRes);
    vec3 nrm = normalize(vec3((hC - hX) * uVarnish * 6.0, (hC - hY) * uVarnish * 6.0, 1.0));
    vec3 Ldir = normalize(vec3(-0.6, 0.6, 0.75));
    float diff = clamp(dot(nrm, Ldir), 0.0, 1.0);
    float spec = pow(diff, 24.0);
    col *= 0.85 + 0.30 * diff;          // raised-paint directional shading
    col += vec3(spec) * uVarnish * 0.35; // gloss highlight on ridges
  }

  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 2.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
