// One shared ShaderMaterial for every building part (and boats): instanced prisms with
// shader-drawn windows (10 §3.26). Colours arrive as uniforms/attributes derived from tokens.

export const PART_VERT = /* glsl */ `
attribute vec3 iPos;   // x, y0, z
attribute vec3 iSize;  // w, h, d
attribute vec3 iColor;
attribute vec4 iMeta;  // seed, flat (1 = exact token colour, unlit), vx, vz (boats)
uniform float uTime;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vFacade;  // metres along the facade, metres above the base
varying vec3 vWorld;
varying float vSeed;
varying float vFlat;
void main() {
  vec3 p = position * iSize;
  vec3 w = iPos + p;
  w.xz += iMeta.zw * sin(uTime * 0.05 + iMeta.x * 6.2831);
  vNormal = normal;
  vColor = iColor;
  vSeed = iMeta.x;
  vFlat = iMeta.y;
  vFacade = vec2(abs(normal.x) > 0.5 ? p.z : p.x, p.y);
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const PART_FRAG = /* glsl */ `
uniform vec3 uKey;
uniform vec3 uFill;
uniform vec3 uSunDir;
uniform vec3 uRoof;
uniform vec3 uLit;
uniform vec3 uDark;
uniform float uNight;
uniform float uLitRatio;
uniform float uMask;
uniform vec2 uFocus;
uniform float uNearRing;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vFacade;
varying vec3 vWorld;
varying float vSeed;
varying float vFlat;
float h21(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main() {
  if (uMask > 0.5) { gl_FragColor = vec4(vec3(vFlat), 1.0); return; }
  if (vFlat > 0.5) { gl_FragColor = vec4(vColor, 1.0); return; }
  vec3 n = normalize(vNormal);
  vec3 base = n.y > 0.5 ? mix(vColor, uRoof, 0.5) : vColor;
  float d = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 c = base * (uFill * (0.9 + 0.3 * n.y) + uKey * d * 0.55);
  bool near = distance(vWorld.xz, uFocus) < uNearRing;
  if (n.y < 0.5 && near) {
    vec2 cell = vec2(3.0, 3.2);
    vec2 f = fract(vFacade / cell);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.85) * step(2.0, vFacade.y);
    if (win > 0.5) {
      float lit = step(h21(floor(vFacade / cell) + vSeed * 97.0), uLitRatio) * uNight;
      c = lit > 0.5 ? uLit : mix(c, uDark, 0.55);
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
uniform vec3 uFill;
uniform vec3 uKey;
uniform float uMask;
varying vec2 vUv;
void main() {
  if (uMask > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float k = floor(texture2D(uMaskTex, vUv).r * 255.0 + 0.5);
  vec3 c = k < 0.5 ? uWater : k < 1.5 ? uLand : k < 2.5 ? uPark : uRoad;
  float lightK = k < 0.5 ? 0.9 : 1.0;
  gl_FragColor = vec4(c * (uFill * 1.0 + uKey * 0.3) * lightK, 1.0);
}`;
