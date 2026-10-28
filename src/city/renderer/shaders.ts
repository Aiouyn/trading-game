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
attribute vec2 iMat;   // card 2: material id 0–8, variant (2 = rust accent)
uniform float uTime;
varying vec2 vMat;
varying vec2 vPart;    // metres above the part's base, part height
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
  vMat = iMat;
  vPart = vec2(p.y, iSize.y);
  vFacade = vec2(abs(normal.x) > 0.5 ? p.z : p.x, p.y);
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const PART_FRAG = /* glsl */ `
uniform vec3 uKey;
uniform vec3 uFill;
uniform float uKeyK;
uniform float uFillK;
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
uniform vec3 uMatWall2[9];
uniform vec3 uMatTrim[9];
uniform vec3 uMatTop[9];
uniform float uPatterns;
uniform float uPatK;
varying vec2 vMat;
varying vec2 vPart;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vFacade;
varying vec3 vWorld;
varying float vSeed;
varying float vFlat;
varying float vCut;
// 1 within w/2 of a line every period metres along t; antialiased, and faded out as the line
// narrows under 1 device px (card 1 rule)
float lines(float t, float period, float w) {
  float fw = max(fwidth(t), 1e-4);
  float d = abs(t - period * floor(t / period + 0.5));
  return (1.0 - smoothstep(w * 0.5 - fw * 0.5, w * 0.5 + fw * 0.5, d)) * smoothstep(0.5, 1.0, w / fw);
}
float band(float t, float a, float b) { float fw = max(fwidth(t), 1e-4); return smoothstep(a - fw * 0.5, a + fw * 0.5, t) * (1.0 - smoothstep(b - fw * 0.5, b + fw * 0.5, t)); }
// §2.1 patterns on a wall: returns the base colour (wall, or wall2 above the split) with trim lines
vec3 material(int id, vec3 wall) {
  bool accent = vMat.y > 1.5;
  float y = vWorld.y;
  float split = id == 4 ? 12.0 : id == 7 ? 4.0 : id == 8 ? 3.0 : -1.0;
  bool upper = !accent && split > 0.0 && y > split;
  vec3 c = upper ? wall + uMatWall2[id] : wall;
  vec3 trim = uMatTrim[id];
  float t = 0.0;
  if (id == 1 || id == 2 || id == 6) t = max(t, lines(y, 3.0, 0.3) * step(1.0, y));           // storey course
  if (id == 1 || id == 6) t = max(t, band(vPart.x, vPart.y - 0.6, vPart.y + 1.0));             // cornice
  if (id == 5) t = max(t, band(y, -1.0, 4.0));                                                  // stone base band
  if (uPatterns > 1.5) {
    if (id == 3 || id == 5 || (id == 4 && upper)) t = max(t, lines(vFacade.x, 1.5, 0.15));     // mullions
    if ((id == 7 || id == 8) && upper) c *= 1.0 + (lines(vFacade.x, 0.5, 0.25) * 2.0 - 1.0) * 0.08 * uPatK; // ribs ≈ ±.03 L
  }
  return c + (trim - c) * min(1.0, t * uPatK);
}
float h21(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main() {
  // cut-away: dithered so it can fade in; uCutK = 1 is a full cut (instant under reduced motion)
  if (vCut > 0.5 && h21(gl_FragCoord.xy) < uCutK) discard;
  vec3 n = normalize(vNormal);
  bool top = n.y > 0.5;
  bool lit = !top && dot(n.xz, normalize(uSunDir.xz)) > 0.0;
  if (uMask > 2.5) { gl_FragColor = vec4(vec3(!top && abs(vMat.x - (uMask - 3.0)) < 0.5 ? 1.0 : 0.0), 1.0); return; } // 3 + id: walls of material id (card 2 AC5 test hook: roofs excluded, AC5 reads wall colour)
  if (uMask > 0.5) { gl_FragColor = vec4(vec3(uMask > 1.5 || vFlat > 1.5 ? 1.0 : 0.0), 1.0); return; } // 1: brass mask, 2: all parts
  if (vFlat > 1.5) { gl_FragColor = vec4(top ? uBrassHi : lit ? uBrass : uBrassLo, 1.0); return; }
  if (vFlat > 0.5) { gl_FragColor = vec4(vColor, 1.0); return; }
  vec3 c;
  int id = int(vMat.x + 0.5);
  if (top && id > 0) c = uMatTop[id];
  else if (top) c = mix(vColor, uTop, 0.55);
  else if (id > 0) {
    vec3 w = material(id, vColor);
    c = lit ? mix(w, uKey, uKeyK) * 1.12 : mix(w, uShadow, 0.42);
  }
  else if (lit) c = mix(vColor, uKey, uKeyK) * 1.12;
  else c = mix(vColor, uShadow, 0.42);
  c = mix(c, uFill, uFillK) * uExposure;
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

// Card 1 ground (spec §2): class colours from the mask (nearest), then kerbs, sidewalks and
// crosswalks from the road field and the smooth coast, quay or verge from the coast field (both
// linear), antialiased over one device pixel (the renderer has antialias: false).
export const GROUND_FRAG = /* glsl */ `
uniform sampler2D uMaskTex;
uniform sampler2D uFieldTex;
uniform float uCells;
uniform float uCellM;
uniform float uFieldRange;
uniform float uCrosswalks;
uniform vec3 uWater;
uniform vec3 uLand;
uniform vec3 uPark;
uniform vec3 uRoad;
uniform vec3 uKerb;
uniform vec3 uSidewalk;
uniform vec3 uCrosswalk;
uniform vec3 uApron;
uniform vec3 uCoping;
uniform vec3 uQuayShadow;
uniform vec3 uVerge;
uniform float uExposure;
uniform float uMask;
varying vec2 vUv;
const float KERB_M = 0.3;
const float SIDEWALK_M = 2.0;
const float APRON_M = 4.0;
const float COPING_M = 0.5;
const float SHADOW_M = 1.5;
const float VERGE_M = 3.0;
const float QUAY_ROAD_M = 16.0;
float metres(float t) { return (t * 255.0 - 128.0) * uFieldRange / 127.0; }
ivec2 clampCell(ivec2 c) { return clamp(c, ivec2(0), ivec2(int(uCells) - 1)); }
float junction(ivec2 c) { return texelFetch(uFieldTex, clampCell(c), 0).a; }
// 1 inside [a, b] (metres), antialiased over w
float band(float d, float a, float b, float w) { return smoothstep(a - w, a + w, d) * (1.0 - smoothstep(b - w, b + w, d)); }
// distance (m) from p to the junction box ahead along axis dir, if the box starts within 2 cells; else -1
float toJunction(ivec2 cell, vec2 frac, ivec2 dir, float along) {
  float edge = (along > 0.0 ? 1.0 - frac.x : frac.x) * uCellM;
  if (junction(cell + dir) > 0.5) return edge;
  if (junction(cell + 2 * dir) > 0.5) return edge + uCellM;
  return -1.0;
}
void main() {
  if (uMask > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 cf = vUv * uCells;
  ivec2 cell = clampCell(ivec2(floor(cf)));
  vec2 m = cf * uCellM; // metres from the ground origin, (x, z)
  float px = max(length(vec2(dFdx(m.x), dFdy(m.x))), length(vec2(dFdx(m.y), dFdy(m.y)))); // metres per device pixel
  float aa = 0.5 * px;
  float k = floor(texelFetch(uMaskTex, cell, 0).r * 255.0 + 0.5);
  vec4 f = texture2D(uFieldTex, vUv);
  float s = metres(f.r); // + land
  float r = metres(f.g); // - carriageway
  float district = floor(texelFetch(uFieldTex, cell, 0).b * 255.0 + 0.5);
  float detail = 1.0 - smoothstep(0.7, 1.1, px); // kerbs and stripes fade out under ~1 device px (zoom < ~0.6)
  // land side: park or land under everything, the carriageway from the road field
  vec3 c = k > 1.5 && k < 2.5 ? uPark : uLand;
  float onRoad = 1.0 - smoothstep(-aa, aa, r);
  c = mix(c, uRoad, onRoad);
  c = mix(c, uSidewalk, band(r, 0.0, SIDEWALK_M, aa));
  c = mix(c, uKerb, detail * band(r, 0.0, max(KERB_M, px), aa));
  if (uCrosswalks > 0.5 && district > 0.5 && district < 1.5 && junction(cell) < 0.5 && onRoad > 0.0) {
    vec2 fr = fract(cf);
    float bx = max(toJunction(cell, fr, ivec2(1, 0), 1.0), toJunction(cell, fr, ivec2(-1, 0), -1.0));
    float bz = max(toJunction(cell, fr.yx, ivec2(0, 1), 1.0), toJunction(cell, fr.yx, ivec2(0, -1), -1.0));
    // zebra: 0.5 m bars along the arm, 3 m long, 1 m back from the box
    float zx = bx < 0.0 ? 0.0 : band(bx, 1.0, 4.0, aa) * (1.0 - smoothstep(0.25 - aa, 0.25 + aa, abs(fract(m.y) - 0.5)));
    float zz = bz < 0.0 ? 0.0 : band(bz, 1.0, 4.0, aa) * (1.0 - smoothstep(0.25 - aa, 0.25 + aa, abs(fract(m.x) - 0.5)));
    c = mix(c, uCrosswalk, detail * onRoad * max(zx, zz));
  }
  // coast: quay in working districts and near roads, verge elsewhere
  float quay = district > 1.5 ? 1.0 : 1.0 - smoothstep(QUAY_ROAD_M - 0.5, QUAY_ROAD_M + 0.5, r);
  c = mix(c, uApron, quay * band(s, -1.0, APRON_M, aa));
  c = mix(c, uCoping, quay * band(s, -1.0, max(COPING_M, px), aa));
  c = mix(c, uVerge, (1.0 - quay) * (1.0 - smoothstep(0.0, VERGE_M, s)));
  c *= mix(1.0, uExposure, 0.5);
  vec3 w = mix(uWater, uQuayShadow, quay * (1.0 - smoothstep(0.0, SHADOW_M, -s)));
  vec3 col = mix(w, c, smoothstep(-aa, aa, s));
  // map edge: one device pixel fade into the water
  float edge = min(min(m.x, uCells * uCellM - m.x), min(m.y, uCells * uCellM - m.y));
  gl_FragColor = vec4(mix(uWater, col, smoothstep(0.0, px, edge)), 1.0);
}`;
