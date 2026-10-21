// One shared ShaderMaterial for every building part (and boats): instanced prisms with
// shader-drawn windows (10 §3.26). Colours arrive as uniforms/attributes derived from tokens.
// Dusk grade (review M1): three shades per prism — top (--win2-derived), lit face (warm key from
// the west, --acc-lo at low strength), shadow face (--win-derived) — plus a cool --info fill.

export const PART_VERT = /* glsl */ `
attribute vec3 iPos;   // x, y0, z
attribute vec3 iSize;  // w, h, d
attribute vec3 iColor;
attribute vec4 iMeta;  // seed, flat (0 lit, 1 exact colour, 2 shaded brass), vx, vz (boats)
attribute float iCut;  // 1 = in front of the selection: cut away
uniform float uTime;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vFacade;  // metres along the facade, metres above the base
varying vec3 vWorld;
varying float vSeed;
varying float vFlat;
varying float vCut;
void main() {
  vec3 p = position * iSize;
  vec3 w = iPos + p;
  w.xz += iMeta.zw * sin(uTime * 0.05 + iMeta.x * 6.2831);
  vNormal = normal;
  vColor = iColor;
  vSeed = iMeta.x;
  vFlat = iMeta.y;
  vCut = iCut;
  vFacade = vec2(abs(normal.x) > 0.5 ? p.z : p.x, p.y);
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const PART_FRAG = /* glsl */ `
uniform vec3 uKey;
uniform vec3 uFill;
uniform vec3 uSunDir;
uniform vec3 uTop;
uniform vec3 uShadow;
uniform vec3 uLit;
uniform vec3 uDark;
uniform vec3 uBrass;
uniform vec3 uBrassHi;
uniform vec3 uBrassLo;
uniform float uExposure;
uniform float uWindowsLit;
uniform float uMask;
uniform float uCutK;
uniform vec2 uFocus;
uniform float uNearRing;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vFacade;
varying vec3 vWorld;
varying float vSeed;
varying float vFlat;
varying float vCut;
float h21(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main() {
  // cut-away: dithered so it can fade in; uCutK = 1 is a full cut (instant under reduced motion)
  if (vCut > 0.5 && h21(gl_FragCoord.xy) < uCutK) discard;
  vec3 n = normalize(vNormal);
  bool top = n.y > 0.5;
  bool lit = !top && dot(n.xz, normalize(uSunDir.xz)) > 0.0;
  if (uMask > 0.5) { gl_FragColor = vec4(vec3(vFlat > 1.5 ? 1.0 : 0.0), 1.0); return; }
  if (vFlat > 1.5) { gl_FragColor = vec4(top ? uBrassHi : lit ? uBrass : uBrassLo, 1.0); return; }
  if (vFlat > 0.5) { gl_FragColor = vec4(vColor, 1.0); return; }
  vec3 c;
  if (top) c = mix(vColor, uTop, 0.55);
  else if (lit) c = mix(vColor, uKey, 0.16) * 1.12;
  else c = mix(vColor, uShadow, 0.42);
  c = mix(c, uFill, 0.10) * uExposure;
  bool near = distance(vWorld.xz, uFocus) < uNearRing;
  if (!top && near) {
    vec2 cell = vec2(3.0, 3.2);
    vec2 f = fract(vFacade / cell);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.85) * step(2.0, vFacade.y);
    if (win > 0.5) {
      bool on = h21(floor(vFacade / cell) + vSeed * 97.0) < uWindowsLit;
      c = on ? uLit : mix(c, uDark, 0.5);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export const GROUND_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const GROUND_FRAG = /* glsl */ `
uniform sampler2D uMaskTex;
uniform vec3 uWater;
uniform vec3 uLand;
uniform vec3 uPark;
uniform vec3 uRoad;
uniform float uExposure;
uniform float uMask;
varying vec2 vUv;
void main() {
  if (uMask > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float k = floor(texture2D(uMaskTex, vUv).r * 255.0 + 0.5);
  vec3 c = k < 0.5 ? uWater : k < 1.5 ? uLand : k < 2.5 ? uPark : uRoad;
  gl_FragColor = vec4(k < 0.5 ? c : c * mix(1.0, uExposure, 0.5), 1.0);
}`;
