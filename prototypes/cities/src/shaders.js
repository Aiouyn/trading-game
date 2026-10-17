// GLSL for parts (buildings, trees, cranes), ground (terrain, water, lots, shadows) and roads.

const COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec3 uNightAmb;
uniform float uNight;
uniform float uGrowth;
uniform float uBand;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uHazeColor;
uniform float uHaze0;
uniform float uHaze1;
uniform float uDetail;
uniform sampler2D uLandscape;
uniform float uLandscapeExtent;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h31(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
// smooth value noise on a lattice, range [0, 1]
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h31(vec3(i, 1.0)), b = h31(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = h31(vec3(i + vec2(0.0, 1.0), 1.0)), d = h31(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fnoise(vec2 p) { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.07 + 17.3) + 0.1 * vnoise(p * 4.13 + 5.9); }
// the land use of the open landscape, the same function inside and outside the square (the square's own
// farms and woods blend into it near the border, see groundFrag): fields on the lowland, woods in patches
float fieldNoise(vec2 xz) { return texture2D(uLandscape, (xz + uLandscapeExtent) / (2.0 * uLandscapeExtent)).r; }
float woodsNoise(vec2 xz) { return texture2D(uLandscape, (xz + uLandscapeExtent) / (2.0 * uLandscapeExtent)).g; }
vec3 light(vec3 base, vec3 n) {
  float hemi = 0.62 + 0.38 * n.y;
  float d = max(dot(n, uSunDir), 0.0);
  vec3 day = base * (uAmb * hemi + uSunCol * d);
  vec3 night = base * uNightAmb * (0.75 + 0.25 * n.y);
  return mix(day, night, uNight);
}
// distance haze: far from the map centre, everything melts into the sky's bottom colour
vec3 haze(vec3 c, vec2 xz) { return mix(c, uHazeColor, smoothstep(uHaze0, uHaze1, length(xz))); }
`;

// Static masks, baked once rather than evaluating lattice noise per landscape pixel.
export const landscapeFrag = /* glsl */ `
${COMMON}
varying vec2 vBakeUv;
void main() {
  vec2 xz = (vBakeUv * 2.0 - 1.0) * uLandscapeExtent;
  gl_FragColor = vec4(smoothstep(0.52, 0.6, fnoise(xz / 700.0 + 13.0)),
    smoothstep(0.56, 0.64, fnoise(xz / 480.0 + 41.0)), 0.0, 1.0);
}`;

const WATER = /* glsl */ `
vec3 waterSurface(vec2 xz, vec2 p, float depth, float shore, float foamB) {
  vec3 wc = mix(cWater0, cWater1, smoothstep(0.0, 1.0, clamp(depth, 0.0, 1.0)));
  float wave = sin(p.x * 0.9 + p.y * 0.35 + uTime * 0.9) * sin(p.y * 0.7 - uTime * 0.6 + p.x * 0.2);
  wc *= 0.985 + 0.025 * wave;
  float spec = pow(max(0.0, wave), 10.0) * 0.06 * (1.0 - uNight);
  vec3 wl = wc * (uAmb * 0.95 + uSunCol * 0.25) + spec;
  wl = mix(wl, wc * uNightAmb * 0.9 + uLit0 * 0.012, uNight);
  wl = mix(wl, wl * 1.12 + 0.02, shore * 0.6);
  if (foamB > 0.001) {
    float foam = foamB * smoothstep(0.42, 0.7, vnoise(xz * 0.6 + vec2(uTime * 0.35, -uTime * 0.2)));
    wl = mix(wl, wl * 1.2 + vec3(0.07, 0.08, 0.08) * (1.0 - uNight), foam * 0.55);
  }
  return wl;
}`;

// ===== MATERIALS (cities/textures) =========================================================================
// Procedural surface detail: facades (brick, stone, concrete panels, render, timber), roofs (tiles, slates,
// gravel), lawns, paving, car parks, sand and shore foam. Everything is anti-aliased: pxm is the world metres
// one screen pixel covers, and a detail whose cells are only a few pixels fades to its average colour, so the
// city shows no moire or shimmer when it is seen whole.
const MATERIALS = /* glsl */ `
// AA stripe at x = k * cell (metres): 1 on a joint of half-width hw, 0 elsewhere
float lineX(float x, float cell, float hw, float pxm) {
  float q = abs(fract(x / cell + 0.5) - 0.5) * cell;
  return 1.0 - smoothstep(hw - pxm, hw + pxm, q);
}
float lumaOf(vec3 c) { return 0.5 * (max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b))); }
// colour family -> facade kind: 0 brick, 1 limestone, 2 concrete or cladding panels, 3 painted render, 4 timber
float facadeKind(vec3 c) {
  float L = lumaOf(c), mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float S = (mx - mn) / max(mx, 1e-3), warm = c.r - c.b;
  if (c.b > c.r + 0.04 && L < 0.6) return 2.0;          // cool glass and metal cladding
  if (S < 0.16) return 2.0;                             // neutral greys and whites: concrete panels
  if (warm > 0.16 && c.g < 0.66 * c.r && L < 0.6) return 0.0; // red-brown: brick
  if (L < 0.4 && warm > 0.06) return 4.0;               // dark browns: timber boards
  if (L > 0.6 && S < 0.35 && warm > 0.03 && warm < 0.22) return 1.0; // pale warm: limestone
  return 3.0;                                           // painted render, pastels, ochres
}
// facade colour before lighting; p = (metres along the facade, metres above the ground)
vec3 wallMat(vec3 c, vec2 p, float fh, float bid, float pxm) {
  if (uDetail <= 0.01) return c;
  float k = facadeKind(c);
  float hb = h11(fract(bid * 0.6180339) + 0.21);
  float far = smoothstep(0.35, 0.7, pxm);
  vec3 res = c;
  if (k < 0.5) {
    // running bond: 0.8 m bricks in 0.4 m courses, every other course offset, a few darker bricks
    vec2 cell = vec2(0.8, 0.4);
    vec2 pp = vec2(p.x + 0.5 * cell.x * mod(floor(p.y / cell.y), 2.0), p.y);
    float v = h31(vec3(floor(pp / cell), hb * 9.0 + 2.0));
    vec3 bc = c * (0.84 + 0.26 * v) * mix(1.0, 0.7, step(0.94, v));
    float jt = mix(max(lineX(p.y, cell.y, 0.03, pxm), lineX(pp.x, cell.x, 0.03, pxm)), 0.22, far);
    res = mix(bc, mix(c, vec3(0.86, 0.82, 0.74), 0.7), jt);
  } else if (k < 1.5) {
    // ashlar: 0.6 m courses with random block joints
    float row = floor(p.y / 0.6);
    vec2 pp = vec2(p.x + 1.3 * h31(vec3(row, hb * 4.0, 3.0)), p.y);
    float v = h31(vec3(floor(pp / vec2(1.3, 0.6)), hb * 5.0));
    float jt = mix(max(lineX(p.y, 0.6, 0.02, pxm), lineX(pp.x, 1.3, 0.02, pxm)), 0.2, far);
    res = mix(c * (0.93 + 0.12 * v), c * 0.78, jt * 0.8);
  } else if (k < 2.5) {
    // cladding panels: joints every 2.4 m and at each floor, a little tone per panel and a faint speckle
    vec2 cell = vec2(2.4, max(fh, 2.0));
    float v = h31(vec3(floor(p / cell), hb * 7.0));
    float jt = mix(max(lineX(p.x, 2.4, 0.02, pxm), lineX(p.y, cell.y, 0.025, pxm)), 0.15, far);
    float sp = 0.5;
    if (far < 0.999) sp = mix(vnoise(p * 1.3 + hb * 13.0), 0.5, far);
    res = mix(c * (0.96 + 0.08 * v), c * 0.8, jt * 0.6) * (0.96 + 0.08 * sp);
  } else if (k < 3.5) {
    // painted render: soft grain and streaks of weathering (skipped when the pixel is too big to show them)
    float g1 = 0.5, g2 = 0.5;
    if (far < 0.999) {
      g1 = mix(vnoise(p * 1.4 + hb * 17.0), 0.5, far);
      g2 = mix(vnoise(vec2(p.x * 0.35, p.y * 0.09) + hb * 5.0), 0.5, far);
    }
    res = c * (0.95 + 0.06 * g1) * (0.9 + 0.14 * g2);
  } else {
    // timber: vertical boards 0.22 m wide, seams and a little tone per board
    float bd = floor(p.x / 0.22);
    float v = h31(vec3(bd, hb * 7.0, 5.0));
    float seam = mix(lineX(p.x, 0.22, 0.012, pxm), 0.1, far);
    res = mix(c * (0.9 + 0.18 * v), c * 0.6, seam * 0.7);
  }
  return mix(c, res, uDetail);
}
// tiled or slated slope; p = metres (across, up the slope); ridge is 1 on the ridge cap
vec3 roofTiles(vec3 c, vec2 p, float pxm, float ridge, float bid) {
  if (uDetail <= 0.01) return c;
  float L = lumaOf(c);
  if (L > 0.8) return c * (0.97 + 0.03 * vnoise(p * 3.0) * uDetail); // snow and white roofs stay smooth
  float hb = h11(fract(bid * 0.6180339) + 0.21);
  bool slate = c.b > c.r - 0.02 || max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)) < 0.12;
  vec2 cell = slate ? vec2(0.5, 0.25) : vec2(0.62, 0.36);
  vec2 pp = vec2(p.x + 0.5 * cell.x * mod(floor(p.y / cell.y), 2.0), p.y);
  float v = h31(vec3(floor(pp / cell), hb * 11.0 + 3.0));
  vec2 fr = fract(pp / cell);
  float far = smoothstep(0.3, 0.6, pxm);
  // each tile is darker just above its lower edge (the shadow of the course below)
  float course = mix(0.7 + 0.3 * smoothstep(0.0, 0.3, fr.y), 0.88, far);
  vec3 tc = c * (0.9 + 0.16 * v) * course;
  float jn = mix(max(lineX(p.y, cell.y, 0.02, pxm), lineX(pp.x, cell.x, 0.02, pxm)), 0.0, far);
  tc *= 1.0 - 0.3 * jn * (slate ? 1.0 : 0.5);
  vec3 res = mix(tc, c * 0.7, ridge * (1.0 - far));
  return mix(c, res, uDetail);
}
// flat roof: gravel grain, a lighter parapet cap and the shadow it throws inside; m = local xz, sz = size xz
vec3 roofTop(vec3 c, vec2 m, vec2 sz, float pxm) {
  if (uDetail <= 0.01 || lumaOf(c) > 0.8) return c;
  float ed = min(sz.x * 0.5 - abs(m.x), sz.y * 0.5 - abs(m.y));
  float gravel = 0.5;
  if (pxm < 0.6) gravel = mix(vnoise(m * 4.0) * 0.6 + vnoise(m * 11.0) * 0.4, 0.5, smoothstep(0.25, 0.6, pxm));
  vec3 g = c * (0.9 + 0.2 * gravel);
  float rim = 1.0 - smoothstep(0.2 - pxm, 0.2 + pxm, ed);
  g = mix(g, g * 1.12 + 0.02, rim);
  float sh = (1.0 - smoothstep(0.2, 1.4, ed)) * (1.0 - rim) * (1.0 - smoothstep(0.25, 0.6, pxm));
  vec3 res = g * (1.0 - 0.14 * sh);
  return mix(c, res, uDetail);
}
`;

export const partVert = /* glsl */ `
${COMMON}
attribute vec3 aFace;
attribute vec2 aInfo;
attribute vec3 iPos;
attribute vec3 iSize;
attribute float iRot;
attribute vec3 iColor;
attribute vec4 iStyle;
attribute vec4 iMeta;
uniform sampler2D uState;
uniform sampler2D uFrontage;
uniform float uStateW;
// see-through (render.js): occluders are cut at uCutH above their ground (uCutT eases 0 -> 1 from uFullH); trees in
// a focus building's screen box and nearer the camera are hidden; the outline pass is an inverted hull
uniform float uOutlinePass;
uniform float uOutlineM;
uniform float uCutT;
uniform float uCutH;
uniform float uFullH;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform int uFocusN;
uniform vec4 uFocusRect[12]; // view-plane metres: minR, minU, maxR, maxU of each focus box, widened by the margin
uniform float uFocusDepth[12];
varying vec4 vState;
varying float vFrontage;
varying vec3 vN;
varying vec3 vFace;
varying vec2 vInfo;
varying vec3 vMetric;
varying vec3 vColor;
varying vec4 vStyle;
varying vec4 vMeta;
varying vec3 vSize;
varying float vBaseAbs;
varying float vProg;
varying vec3 vLN;
varying vec2 vXZ;
varying float vWY;   // world height after the cut
varying float vCutY; // the cut height of a cut occluder, -1e9 otherwise
varying vec3 vCen; // instance origin (per tree: its hue and value)
void main() {
  vCen = iPos;
  // per-building state (render.js load): rgb = lens tint, a = flags (1 emphasis, 2 see-through occluder, 4 focus)
  vState = texelFetch(uState, ivec2(int(mod(iStyle.w, uStateW)), int(floor(iStyle.w / uStateW))), 0);
  vFrontage = texelFetch(uFrontage, ivec2(int(mod(iStyle.w, uStateW)), int(floor(iStyle.w / uStateW))), 0).r;
  float flags = floor(vState.a * 255.0 + 0.5);
  bool isOccluder = mod(floor(flags / 2.0), 2.0) >= 1.0;
  bool isFocusV = mod(floor(flags / 4.0), 2.0) >= 1.0;
  float p = clamp((uGrowth - iMeta.x) / uBand, 0.0, 1.0);
  vProg = p;
  bool outline = uOutlinePass > 0.5;
  // the normal pass draws what is built; the outline pass draws only the focus buildings
  if (p <= 0.0 || (outline && !isFocusV)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // trees (bid 0, style LEAF) inside a focus box and nearer the camera than its centre are hidden
  if (!outline && uFocusN > 0 && iStyle.w < 0.5 && abs(iStyle.x - 8.0) < 0.5) {
    vec3 tc = iPos + vec3(0.0, 0.5 * iSize.y, 0.0);
    float tr = dot(tc, uRight), tu = dot(tc, uUp), td = dot(tc, uFwd);
    for (int k = 0; k < 12; k++) {
      if (k >= uFocusN) break;
      vec4 q = uFocusRect[k];
      if (tr > q.x && tr < q.z && tu > q.y && tu < q.w && td < uFocusDepth[k]) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    }
  }
  vec3 lp = position * iSize;
  vMetric = lp;
  float c = cos(iRot), s = sin(iRot);
  vec3 rp = vec3(c * lp.x - s * lp.z, lp.y, s * lp.x + c * lp.z);
  vec3 wp = iPos + rp;
  float g = iMeta.z;
  float pe = p * p * (3.0 - 2.0 * p);
  wp.y = g + (wp.y - g) * pe;
  // cutaway: an occluder stops at its ground plus the cut height; roofs and crowns above it collapse onto the cut
  vCutY = -1e9;
  if (isOccluder && uCutT > 0.0) {
    float cy = g + mix(uFullH, uCutH, uCutT);
    wp.y = min(wp.y, cy);
    vCutY = cy;
  }
  if (outline) {
    // inverted hull: every vertex moves out from the middle of its building, so the silhouette shows as a thin rim
    vec3 od = lp - vec3(0.0, 0.5 * iSize.y, 0.0);
    od /= max(length(od), 1e-4);
    wp += vec3(c * od.x - s * od.z, od.y, s * od.x + c * od.z) * uOutlineM;
  }
  vN = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  vLN = normal;
  vFace = aFace; vInfo = aInfo; vColor = iColor; vStyle = iStyle; vMeta = iMeta; vSize = iSize;
  vBaseAbs = iPos.y - g;
  vXZ = wp.xz;
  vWY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const partFrag = /* glsl */ `
${COMMON}
${MATERIALS}
uniform float uMood;
uniform float uMarketMode; // 1 only in the Market lens: Normal view follows time of day, not the tape
uniform float uHover;
uniform float uLens;
uniform vec3 uLit0;
uniform vec3 uLit1;
uniform vec3 uLit2;
uniform vec3 uBrass;
uniform vec3 uSkyRefl;
uniform float uOutlinePass;
varying float vWY;
varying float vCutY;
varying vec4 vState;
varying float vFrontage;
varying vec3 vN;
varying vec3 vFace;
varying vec2 vInfo;
varying vec3 vMetric;
varying vec3 vColor;
varying vec4 vStyle;
varying vec4 vMeta;
varying vec3 vSize;
varying float vBaseAbs;
varying float vProg;
varying vec3 vLN;
varying vec2 vXZ;
varying vec3 vCen;

float rectAA(vec2 f, vec2 lo, vec2 hi, vec2 fw) {
  vec2 a = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));
  return a.x * a.y;
}

void main() {
  vec3 n = normalize(vN);
  int style = int(vStyle.x + 0.5);
  float kind = vInfo.y;
  float bid = vStyle.w;
  float flags = vMeta.w;
  bool hq = mod(flags, 2.0) >= 1.0;
  bool crown = mod(floor(flags / 2.0), 2.0) >= 1.0;
  bool ghost = mod(floor(flags / 4.0), 2.0) >= 1.0;
  bool shopSign = mod(floor(flags / 8.0), 2.0) >= 1.0;

  // see-through (bit 4 of the per-building state): focus buildings get a lifted colour; their brass outline is the
  // hull pass, which returns here
  bool isFocus = mod(floor(floor(vState.a * 255.0 + 0.5) / 4.0), 2.0) >= 1.0;
  if (uOutlinePass > 0.5) { gl_FragColor = vec4(mix(uBrass, vec3(1.0, 0.92, 0.7), 0.35) * 1.15, 1.0); return; }

  // the day's return of a headquarters' company (same formula as the info card)
  float ret = 0.0;
  float litRatio = vMeta.y;
  if (hq && uMarketMode > 0.5) {
    float h1 = fract(bid * 0.61803398875), h2 = fract(bid * 0.75487766625);
    ret = uMood * 0.06 * (0.5 + h1) + (h2 - 0.5) * 0.024;
    litRatio = clamp(0.36 + ret * 9.0, 0.03, 0.97);
  }

  vec3 base = vColor;
  if (shopSign && vFrontage > 0.5) {
    base = lumaOf(vColor) > 0.3 ? vec3(0.79, 0.64, 0.36) : vec3(0.18, 0.28, 0.25);
  }
  vec3 emissive = vec3(0.0);
  float hAbs = vBaseAbs + vMetric.y;

  // Low power retains the roof/body geometry, lit windows, growth and lenses,
  // while avoiding the close-up facade/material stack on ordinary buildings.
  if (uDetail < 0.01 && bid > 0.5 && vProg >= 1.0 && !ghost && vCutY < -1e8 && style <= 4) {
    vec3 cheap = light(base, n);
    if (abs(vLN.y) < 0.5 && style >= 1) {
      float along = vInfo.x < 0.5 ? vMetric.x + vSize.x * 0.5 : vMetric.z + vSize.z * 0.5;
      vec2 cell = vec2(along / max(vStyle.z, 1.0), hAbs / max(vStyle.y, 1.0));
      vec2 f = fract(cell);
      float mask = rectAA(f, style == 2 ? vec2(0.08, 0.12) : vec2(0.25, 0.26), vec2(0.76, 0.8), fwidth(cell) * 0.7);
      float on = step(h31(vec3(floor(cell), bid)), litRatio);
      vec3 windowC = mix(light(uSkyRefl * 0.62 + base * 0.18, n), mix(base * 0.06, uLit0, on * 0.85), uNight);
      cheap = mix(cheap, windowC, mask);
    }
    if (uLens > 0.5) {
      if (mod(floor(vState.a * 255.0 + 0.5), 2.0) >= 1.0) cheap = mix(cheap, vState.rgb, 0.55);
      else cheap = mix(uInk, mix(cheap, vec3(dot(cheap, vec3(0.299, 0.587, 0.114))), 0.75), 0.72);
    }
    gl_FragColor = vec4(haze(cheap, vXZ), 1.0); return;
  }

  // ---- MATERIALS (cities/textures): facade, roof and slope surfaces from the colour family and the form.
  // Trees, boats and cranes (bid 0) and glass, signs, lamps, pools and containers keep their flat colour.
  bool wall = kind < 0.5 && abs(vLN.y) < 0.5;
  float pxm = max(max(fwidth(vXZ.x), fwidth(vXZ.y)), fwidth(hAbs));
  float matTop = vBaseAbs + vSize.y;
  bool matStyle = style == 0 || style == 1 || style == 3 || style == 4 || style == 6;
  if (bid > 0.5) {
    float axM = vInfo.x;
    float spanM = axM < 0.5 ? vSize.x : axM > 1.5 ? vSize.z : vSize.x * 0.26;
    float uM = axM < 0.5 ? vMetric.x + vSize.x * 0.5 : axM > 1.5 ? vMetric.z + vSize.z * 0.5 : vFace.x * spanM;
    float sAlong = axM < 0.5 ? vSize.x : vSize.z, sRun = axM < 0.5 ? vSize.z : vSize.x;
    vec2 slopeP = vec2(vFace.x * sAlong, vFace.y * length(vec2(sRun * 0.5, vSize.y)));
    if (wall && matStyle) {
      base = wallMat(vColor, vec2(uM, hAbs), max(vStyle.y, 1.0), bid, pxm);
    } else if (kind > 0.5 && abs(vLN.y) < 0.95 && style == 7) {
      base = roofTiles(vColor, slopeP, pxm, smoothstep(0.93, 0.99, vFace.y), bid);
    } else if (kind > 0.5 && vLN.y >= 0.95 && (matStyle || style == 7)) {
      base = roofTop(vColor, vMetric.xz, vSize.xz, pxm);
    }
  }
  if (wall && matStyle && bid > 0.5) {
    // gentle vertical occlusion: darker near the pavement, a cornice shadow under the roof line, a darker plinth
    base *= mix(0.8, 1.0, smoothstep(0.0, 9.0, hAbs)) * mix(0.8, 1.0, smoothstep(0.0, 0.8, matTop - hAbs));
    base *= 1.0 - 0.07 * (1.0 - smoothstep(max(vStyle.y, 1.0) - 0.4, max(vStyle.y, 1.0) + 0.4, hAbs));
  }

  // ---- windows on walls
  if (wall && (style == 1 || style == 2 || style == 3 || style == 4 || style == 6 || style == 11)) {
    float axis = vInfo.x;
    float span = axis < 0.5 ? vSize.x : axis > 1.5 ? vSize.z : vSize.x * 0.26;
    float u = axis < 0.5 ? vMetric.x + vSize.x * 0.5 : axis > 1.5 ? vMetric.z + vSize.z * 0.5 : vFace.x * span;
    float fh = max(vStyle.y, 1.0);
    float bw = max(vStyle.z, 1.0);
    float nb = max(1.0, floor(span / bw + 0.5));
    float bays = span / nb;
    float fl = floor(hAbs / fh);
    float fy = fract(hAbs / fh);
    float bay = floor(u / bays);
    float fx = fract(u / bays);
    vec2 f = vec2(fx, fy);
    vec2 fw = fwidth(f) * 0.75;
    float topAbs = vBaseAbs + vSize.y;
    float edgeOk = step(0.7, u) * step(u, span - 0.7) * step(hAbs, topAbs - 0.7) * step(0.6, hAbs);
    float m = 0.0;
    if (style == 1) m = rectAA(f, vec2(0.26, 0.28), vec2(0.74, 0.78), fw);
    else if (style == 2) m = rectAA(f, vec2(0.05, 0.1), vec2(0.95, 0.96), fw);
    else if (style == 3) m = rectAA(f, vec2(-1.0, 0.36), vec2(2.0, 0.82), fw);
    else if (style == 4) m = fl < 0.5 ? rectAA(f, vec2(0.08, 0.1), vec2(0.92, 0.82), fw) : rectAA(f, vec2(0.24, 0.3), vec2(0.76, 0.8), fw);
    else if (style == 11) { m = 0.0; base *= 0.88 + 0.12 * step(0.5, fract(u * 1.6)); base *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.06, fy)); }
    else if (style == 6) {
      // unfinished concrete frame: slabs and columns, open bays
      float col = 1.0 - rectAA(f, vec2(0.12, 0.14), vec2(0.88, 1.2), fw);
      if (col < 0.5 && h31(vec3(bid, fl, bay)) < 0.85) discard;
    }
    m *= edgeOk;
    // fade the window grid to its average when it gets smaller than a few pixels (no moire)
    float far = smoothstep(0.22, 0.55, max(fwidth(hAbs / fh), fwidth(u / bays)));
    float cover = style == 2 ? 0.8 : style == 3 ? 0.42 : 0.24;
    m = mix(m, cover * edgeOk, far);
    // MATERIALS: a light frame and a sill ledge round each punched opening (close up only)
    float trimA = 0.0;
    if (style == 1) trimA = max(rectAA(f, vec2(0.21, 0.23), vec2(0.79, 0.83), fw) - rectAA(f, vec2(0.26, 0.28), vec2(0.74, 0.78), fw), rectAA(f, vec2(0.2, 0.2), vec2(0.8, 0.27), fw));
    trimA *= (1.0 - far) * edgeOk;
    // glass by day: sky reflection, darker towards the street
    vec3 glass = mix(base * 0.45 + uSkyRefl * 0.35, uSkyRefl * 0.7 + 0.08, clamp(hAbs / 220.0, 0.0, 1.0) * 0.6 + 0.2 * n.y);
    if (style == 2) glass = mix(base * 0.85, uSkyRefl * 0.9, 0.35 + 0.15 * h31(vec3(bid, fl * 0.3, 3.0)));
    if (style == 2) {
      // MATERIALS: each floor reflects its own piece of sky, a diagonal sheen runs down the tower, a few offices are blinded
      float fl2 = h31(vec3(bid, fl, 7.0));
      float sheen = smoothstep(0.55, 0.7, fract(u * 0.07 + hAbs * 0.035 + fl2 * 0.5));
      glass = glass * (0.82 + 0.3 * fl2) * (1.0 + 0.22 * sheen) + vec3(0.0, 0.01, 0.02) * sheen;
      float blind = step(0.92, h31(vec3(bid * 0.37, fl, bay * 1.9 + 2.0)));
      glass = mix(glass, vec3(0.36, 0.38, 0.4), blind * (1.0 - uNight) * 0.75);
    }
    // lights by night
    float r = h31(vec3(bid * 1.7 + float(axis), fl, bay + vLN.x * 13.0 + vLN.z * 29.0));
    float slow = h31(vec3(bid, fl + floor(uTime / 23.0 + r * 9.0), bay));
    float on = step(r, litRatio) * step(0.04, slow);
    float tint = h31(vec3(bay, fl, bid * 0.3));
    vec3 lc = tint < 0.55 ? uLit0 : tint < 0.85 ? uLit1 : uLit2;
    if (hq && ret < -0.015) lc = mix(lc, vec3(0.75, 0.82, 1.0), 0.6);
    float nightLit = mix(on, litRatio * 0.85, far) * smoothstep(0.05, 0.6, uNight);
    vec3 winDay = light(glass, n);
    vec3 winNight = mix(base * 0.05 + vec3(0.02, 0.025, 0.04), lc * (0.85 + 0.3 * r), nightLit);
    vec3 win = mix(winDay, winNight, uNight);
    vec3 wallC = light(base, n);
    wallC = mix(wallC, wallC * 1.18 + 0.03, trimA * 0.8);
    vec3 col = mix(wallC, win, m);
    emissive = vec3(0.0);
    base = col;
  } else if (style == 5) {
    // neon signs and billboards
    float flick = 0.85 + 0.15 * step(0.5, h31(vec3(bid, floor(uTime * 1.3), 1.0)));
    base = mix(light(vColor * 0.85, n), vColor * (1.25 + 0.4 * uNight) * flick, 0.35 + 0.65 * uNight);
  } else if (style == 10) {
    // lamps and crown bands
    float k = crown ? 1.0 : hq ? litRatio : vMeta.y;
    vec3 lampC = crown ? uBrass * 1.25 : hq ? mix(vec3(0.55, 0.62, 0.7), uBrass * 1.2, smoothstep(0.2, 0.7, litRatio)) : vColor;
    vec3 off = light(vColor * 0.6, n);
    base = mix(off, lampC * (0.9 + 0.5 * uNight), clamp(k * (0.45 + 0.75 * uNight), 0.0, 1.0));
  } else if (style == 9) {
    base = mix(light(vColor, n), vec3(0.15, 0.75, 0.8), uNight * 0.6);
  } else if (style == 8) {
    // MATERIALS: two-tone foliage (sunlit top, shaded underside), a hue and value per tree, leaf clumps up close
    float tv = h11(vCen.x * 0.113 + vCen.z * 0.737);
    float clump = 0.5;
    if (pxm < 0.8) clump = mix(vnoise(vMetric.xz * 1.6 + vMetric.y * 1.1), 0.5, smoothstep(0.3, 0.8, pxm));
    vec3 leaf = vColor * mix(0.58, 1.12, smoothstep(-0.5, 0.9, n.y)) * (0.84 + 0.3 * tv) * (0.92 + 0.16 * clump);
    leaf *= vec3(1.0 + 0.08 * (tv - 0.5), 1.0, 1.0 - 0.08 * (tv - 0.5));
    base = light(leaf, n);
  } else {
    base = light(base, n);
  }

  // Focus is communicated by the brass outline pass and the ground halo, not by tinting the
  // building itself: a painted facade stops reading as masonry in the Normal lens.

  // ---- cutaway (occluders cut in partVert): the cut is a section plane, paper with fine hatching, and the wall line
  // at the cut is inked. Walls below the cut keep their look.
  float wyw = fwidth(vWY);
  bool capFace = false;
  if (vCutY > -1e8) {
    float dc = abs(vWY - vCutY) / max(wyw, 1e-5);
    if (n.y > 0.2) {
      if (dc < 0.6) {
        capFace = true;
        vec3 paper = mix(vec3(0.914, 0.886, 0.824), vec3(0.2, 0.21, 0.25), uNight);
        float hs = abs(fract((gl_FragCoord.x - gl_FragCoord.y) / 8.0) - 0.5);
        base = mix(paper, uInk, (1.0 - smoothstep(0.03, 0.07, hs)) * 0.12);
      }
    } else {
      base = mix(base, uInk, (1.0 - smoothstep(0.5, 1.5, dc)) * 0.9);
    }
  }

  // ---- ink edges, faded out when the face is tiny on screen
  float lineV = 0.0;
  if (kind < 2.5 && style != 8) {
    float e;
    vec2 fwf = fwidth(vFace.xy);
    if (vFace.z > 0.5) {
      vec3 b = vec3(vFace.xy, 1.0 - vFace.x - vFace.y);
      vec3 fb = fwidth(b);
      vec3 t = b / max(fb, vec3(1e-5));
      e = min(t.x, min(t.y, t.z));
    } else {
      vec2 t = min(vFace.xy, 1.0 - vFace.xy) / max(fwf, vec2(1e-5));
      e = min(t.x, t.y);
    }
    float px = 1.0 / max(max(fwf.x, fwf.y), 1e-5);
    float fade = smoothstep(5.0, 16.0, px);
    lineV = (1.0 - smoothstep(0.55, 1.35, e)) * fade;
    if (capFace) lineV = 0.0; // the cut face is drawn plain: its edge is the cut line, not the collapsed roof's edges
    base = mix(base, uInk * (0.6 + 0.4 * (1.0 - uNight)), lineV * 0.55);
  }

  // ---- construction: a scaffold lattice while the building rises
  if (vProg < 1.0 || ghost) {
    float sc = ghost ? 0.0 : 1.0 - vProg;
    vec2 q = vec2(vMetric.x + vMetric.z, hAbs) / 2.2;
    float lat = max(step(0.86, fract(q.x)), step(0.86, fract(q.y)));
    base = mix(base, mix(vec3(0.62, 0.55, 0.45), vec3(0.85, 0.55, 0.22), lat), sc * 0.75);
  }

  // A hover is a pointer hint, not a highlight: it must not repaint the facade. Any tint
  // measurable on the building's own pixels is a repaint, so hover stays geometric only.
  // (The cursor, the focus outline and the ground halo already mark the hovered building.)

  // map lens (lenses.js): an emphasised building takes its tint; the rest fade to grey and sink toward the ink.
  // Trees and boats are bid 0, never emphasised.
  if (uLens > 0.5) {
    if (mod(floor(vState.a * 255.0 + 0.5), 2.0) >= 1.0) base = mix(base, vState.rgb, 0.55);
    else base = mix(uInk, mix(base, vec3(dot(base, vec3(0.299, 0.587, 0.114))), 0.75), 0.72);
  }
  gl_FragColor = vec4(haze(base + emissive, vXZ), 1.0);
}`;

export const groundVert = /* glsl */ `
${COMMON}
uniform float uHalf;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec2 vXZ;
void main() {
  vUv = (position.xz + uHalf) / (2.0 * uHalf);
  vN = normal;
  vH = position.y;
  vXZ = position.xz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

export const groundFrag = /* glsl */ `
${COMMON}
${MATERIALS}
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uHalf;
uniform vec3 cLand; uniform vec3 cNatural; uniform vec3 cPark; uniform vec3 cSand; uniform vec3 cPave; uniform vec3 cPlaza;
uniform vec3 cWater0; uniform vec3 cWater1;
uniform float uSnow;
uniform vec3 uLit0;
uniform float uLensGround;
uniform float uLensDim;
uniform sampler2D uLandV;
uniform sampler2D uDistT;
uniform vec3 uRamp0; uniform vec3 uRamp1; uniform vec3 uRamp2;
uniform vec3 uDistCol[12];
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec2 vXZ;
${WATER}
void main() {
  vec4 A = texture2D(uA, vUv);
  if (A.r > 0.999) {
    vec3 wl = waterSurface(vXZ, vUv * 900.0, A.a * 4.0, 1.0 - smoothstep(0.0, 0.08, A.a), 1.0 - smoothstep(0.0, 0.035, A.a));
    gl_FragColor = vec4(haze(wl * (1.0 - uLensDim), vXZ), 1.0); return;
  }
  vec4 B = texture2D(uB, vUv);
  vec3 n = normalize(vN);
  float water = A.r, green = A.g, sand = A.b, depth = A.a;
  float shadowO = B.r, lotO = B.g, plaza = B.b, varn = B.a;
  float g = uGrowth;
  // near the border the square's ground is the open landscape's again (see the edge blend below)
  float edgeIn = smoothstep(uHalf - 500.0, uHalf, max(abs(vXZ.x), abs(vXZ.y)));
  // MATERIALS: metres per pixel on the ground; grass grain and mowing stripes fade out before they would shimmer
  float pxG = max(fwidth(vXZ.x), fwidth(vXZ.y));
  float grassF = (1.0 - smoothstep(0.25, 0.7, pxG)) * uDetail;
  float stripeF = (1.0 - smoothstep(0.5, 1.2, pxG)) * uDetail;
  float grass = 0.5;
  if (uDetail > 0.01 && grassF > 0.001) grass = vnoise(vXZ * 1.3) * 0.6 + vnoise(vXZ * 3.7 + 7.0) * 0.4;
  float mow = step(0.0, sin(vXZ.x * 0.5236));
  // bare land, lawns and parks; urban blocks are meadow until the city reaches them
  float blockO = water > 0.5 ? 0.0 : depth;
  float dev = (1.0 - smoothstep(g - uBand * 0.6, g, blockO + 0.002)) * (1.0 - edgeIn);
  vec3 meadow = mix(cNatural, cPark, 0.42) * (0.94 + 0.12 * varn);
  vec3 col = mix(meadow, mix(cNatural, cLand, 0.35 + 0.3 * varn), dev);
  float slope = 1.0 - n.y;
  col = mix(col, cNatural * 0.8, smoothstep(0.1, 0.35, slope) * 0.6);
  float landG = 1.0 - smoothstep(0.35, 0.65, water);
  col *= 1.0 + landG * grassF * (grass - 0.5) * 0.2;
  // farmland: a patchwork of plots, each its own crop
  // near the border the square's own farms and woods fade into the open landscape's (outFrag), so no edge shows
  float fieldM = smoothstep(0.13, 0.2, green) * (1.0 - smoothstep(0.3, 0.4, green));
  fieldM = mix(fieldM, fieldNoise(vXZ) * (1.0 - smoothstep(12.0, 30.0, vH)), edgeIn);
  if (fieldM > 0.0) {
    vec2 w = vUv * 2.0 * uHalf;
    vec2 q = vec2(w.x * 0.96 + w.y * 0.28, -w.x * 0.28 + w.y * 0.96) + 30.0 * vec2(sin(w.y / 170.0), cos(w.x / 150.0));
    vec2 cell = floor(q / vec2(74.0, 46.0));
    float h1 = h31(vec3(cell, 3.0)), h2 = h31(vec3(cell, 7.0));
    vec3 crop = h1 < 0.3 ? mix(cNatural, cPark, 0.65) : h1 < 0.55 ? mix(cNatural, cSand, 0.7) : h1 < 0.8 ? mix(cNatural, cPark, 0.25) : cNatural * 0.92;
    crop *= 0.9 + 0.18 * h2;
    float furrow = 0.96 + 0.04 * step(0.5, fract(q.x / 3.0 + h2 * 4.0));
    vec2 fq = fract(q / vec2(74.0, 46.0));
    float hedge = 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.025, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y))));
    col = mix(col, crop * furrow * hedge, fieldM);
  }
  float forestM = mix(smoothstep(0.7, 0.75, green) * (1.0 - smoothstep(0.85, 0.9, green)), woodsNoise(vXZ), edgeIn);
  col = mix(col, cPark * (0.92 + 0.16 * varn), smoothstep(0.42, 0.6, green) * (1.0 - edgeIn));
  // MATERIALS: mown stripes on the parks (a 6 m band each way)
  col *= 1.0 + smoothstep(0.42, 0.6, green) * (1.0 - edgeIn) * stripeF * (mow - 0.5) * 0.1;
  col = mix(col, cPark * 0.62 * (0.92 + 0.16 * varn), forestM * 0.9);
  // built lots appear with the city
  float built = (1.0 - smoothstep(g - uBand * 0.2, g, lotO + 0.002)) * step(lotO, 0.995) * (1.0 - edgeIn);
  // MATERIALS: lot surfaces. Paving slabs everywhere; car-park bays with white lines on the big lots (coarse
  // noise, an approximation of lot size); a small planted courtyard on some lots. Joints fade to their average.
  float lotM = built * (1.0 - smoothstep(0.4, 0.6, green)) * 0.92;
  float farG = smoothstep(0.3, 0.6, pxG);
  if (lotM > 0.001) {
    // bays and courtyards are only drawn close up; far away the lot is plain paving
    float car = 0.0, court = 0.0;
    if (uDetail > 0.01 && farG < 0.999) {
      car = smoothstep(0.58, 0.66, vnoise(vXZ / 150.0 + 3.0)) * (1.0 - farG);
      court = smoothstep(0.66, 0.72, vnoise(vXZ / 60.0 + 21.0)) * (1.0 - car) * (1.0 - farG);
    }
    float slab = mix(max(lineX(vXZ.x, 1.2, 0.012, pxG), lineX(vXZ.y, 1.2, 0.012, pxG)), 0.05, farG);
    float bay = mix(max(lineX(vXZ.x, 2.6, 0.06, pxG), lineX(vXZ.y, 5.2, 0.06, pxG)), 0.1, farG);
    vec3 pav = cPave * (0.94 + 0.1 * varn) * mix(1.0, 0.88, slab);
    pav = mix(pav, vec3(0.9, 0.9, 0.86), bay * car * 0.85);
    pav = mix(pav, mix(cPark, cNatural, 0.3) * (0.9 + 0.2 * grass), court * 0.85);
    col = mix(col, pav, lotM);
  }
  // MATERIALS: plazas are stone slabs on a 4 m grid with joints
  float plazaM = smoothstep(0.4, 0.6, plaza);
  if (plazaM > 0.001) {
    float pj = mix(max(lineX(vXZ.x, 4.0, 0.05, pxG), lineX(vXZ.y, 4.0, 0.05, pxG)), 0.15, farG);
    vec3 plc = cPlaza * (0.93 + 0.12 * h31(vec3(floor(vXZ / 4.0), 2.0))) * mix(1.0, 0.8, pj);
    col = mix(col, plc, plazaM);
  }
  // sand: small ripples, faded out at distance
  float sandM = smoothstep(0.4, 0.6, sand);
  if (sandM > 0.001) {
    float rip = 1.0 + 0.05 * (1.0 - smoothstep(0.25, 0.6, pxG)) * sin(dot(vXZ, vec2(0.8, 0.6)) * 2.5 + 4.0 * vnoise(vXZ * 0.03));
    col = mix(col, cSand * (0.96 + 0.06 * varn) * rip, sandM);
  }
  // snow on high ground: by height alone, the same rule as the outskirts (normals differ between the two meshes)
  col = mix(col, vec3(0.93, 0.95, 0.97), smoothstep(uSnow, uSnow + 25.0, vH));
  // baked building shadows (only for what has been built)
  float sh = (1.0 - smoothstep(g - uBand, g - uBand * 0.5, shadowO + 0.002)) * step(shadowO, 0.995);
  col *= 1.0 - sh * 0.28 * (1.0 - uNight);
  vec3 lit = light(col, n);
  // water
  if (water > 0.02) {
    float d = clamp(depth * 4.0, 0.0, 1.0);
    vec3 wc = mix(cWater0, cWater1, smoothstep(0.0, 1.0, d));
    vec2 p = vUv * 900.0;
    float wave = sin(p.x * 0.9 + p.y * 0.35 + uTime * 0.9) * sin(p.y * 0.7 - uTime * 0.6 + p.x * 0.2);
    wc *= 0.985 + 0.025 * wave;
    float spec = pow(max(0.0, wave), 10.0) * 0.06 * (1.0 - uNight);
    vec3 wl = wc * (uAmb * 0.95 + uSunCol * 0.25) + spec;
    wl = mix(wl, wc * uNightAmb * 0.9 + uLit0 * 0.012, uNight);
    float shore = 1.0 - smoothstep(0.0, 0.08, depth);
    wl = mix(wl, wl * 1.12 + 0.02, shore * 0.6);
    // MATERIALS: soft shoreline foam, a band at the water's edge broken up by slow noise
    float foamB = 1.0 - smoothstep(0.0, 0.035, depth);
    if (foamB > 0.001) {
      float foam = foamB * smoothstep(0.42, 0.7, vnoise(vXZ * 0.6 + vec2(uTime * 0.35, -uTime * 0.2)));
      wl = mix(wl, wl * 1.2 + vec3(0.07, 0.08, 0.08) * (1.0 - uNight), foam * 0.55);
    }
    lit = mix(lit, wl, smoothstep(0.35, 0.65, water));
  }
  // map lens (lenses.js): the land takes its land value ramp or its district colour; the whole ground dims a little
  if (uLensGround > 0.5) {
    float landM = 1.0 - smoothstep(0.35, 0.65, water);
    if (uLensGround < 1.5) {
      float v = texture2D(uLandV, vUv).r;
      vec3 ramp = v < 0.5 ? mix(uRamp0, uRamp1, v * 2.0) : mix(uRamp1, uRamp2, (v - 0.5) * 2.0);
      lit = mix(lit, ramp, 0.6 * landM);
    } else {
      int di = int(mod(floor(texture2D(uDistT, vUv).r * 255.0 + 0.5), 12.0));
      lit = mix(lit, uDistCol[di], 0.35 * landM);
    }
  }
  lit *= 1.0 - uLensDim;
  gl_FragColor = vec4(haze(lit, vXZ), 1.0);
}`;

// The outskirts: land and sea beyond the square, drawn from the coarse ring mesh. Same lighting as the ground.
export const outVert = /* glsl */ `
${COMMON}
attribute float aH;
varying vec2 vXZ;
varying vec3 vN;
varying float vH;
void main() {
  vXZ = position.xz;
  vN = normal;
  vH = aH;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

export const outFrag = /* glsl */ `
${COMMON}
${MATERIALS}
uniform float uHalf;
uniform float uSnow;
uniform float uBeach;
uniform vec3 cNatural; uniform vec3 cPark; uniform vec3 cSand;
uniform vec3 cWater0; uniform vec3 cWater1;
uniform vec3 uLit0;
varying vec2 vXZ;
varying vec3 vN;
varying float vH;

${WATER}
void main() {
  if (vH < -0.4) {
    vec3 wl = waterSurface(vXZ, (vXZ + uHalf) * (450.0 / uHalf), -vH * 0.19, 1.0 - smoothstep(0.0, 1.2, -vH), 0.0);
    gl_FragColor = vec4(haze(wl, vXZ), 1.0); return;
  }
  vec3 n = normalize(vN);
  vec2 w = vXZ + uHalf; // the ground's world frame, so the field patchwork runs on across the seam
  float varn = vnoise(vXZ / 45.0);

  // ---- land: meadow, farmland patchwork, woods, beach, snow
  vec3 col = mix(cNatural, cPark, 0.42) * (0.94 + 0.12 * varn);
  float slope = 1.0 - n.y;
  col = mix(col, cNatural * 0.8, smoothstep(0.1, 0.35, slope) * 0.6);
  // farmland and woods: the same open-landscape noise as the square's edge (see groundFrag), so the land reads as one
  float fieldM = fieldNoise(vXZ) * (1.0 - smoothstep(12.0, 30.0, vH));
  if (fieldM > 0.0) {
    vec2 q = vec2(w.x * 0.96 + w.y * 0.28, -w.x * 0.28 + w.y * 0.96) + 30.0 * vec2(sin(w.y / 170.0), cos(w.x / 150.0));
    vec2 cell = floor(q / vec2(74.0, 46.0));
    float h1 = h31(vec3(cell, 3.0)), h2 = h31(vec3(cell, 7.0));
    vec3 crop = h1 < 0.3 ? mix(cNatural, cPark, 0.65) : h1 < 0.55 ? mix(cNatural, cSand, 0.7) : h1 < 0.8 ? mix(cNatural, cPark, 0.25) : cNatural * 0.92;
    crop *= 0.9 + 0.18 * h2;
    float furrow = 0.96 + 0.04 * step(0.5, fract(q.x / 3.0 + h2 * 4.0));
    vec2 fq = fract(q / vec2(74.0, 46.0));
    float hedge = 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.025, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y))));
    col = mix(col, crop * furrow * hedge, fieldM);
  }
  // MATERIALS: grass grain on the land, canopy clumps in the woods (both fade out at distance, like the square's)
  float pxO = max(fwidth(vXZ.x), fwidth(vXZ.y));
  float grassO = (1.0 - smoothstep(0.25, 0.7, pxO)) * uDetail;
  if (grassO > 0.001) col *= 1.0 + grassO * (vnoise(vXZ * 1.3) * 0.6 + vnoise(vXZ * 3.7 + 7.0) * 0.4 - 0.5) * 0.2;
  float canopy = 0.5;
  if (uDetail > 0.01 && pxO < 0.7) canopy = mix(vnoise(vXZ / 3.0 + 5.0), 0.5, smoothstep(0.3, 0.7, pxO));
  col = mix(col, cPark * 0.62 * (0.92 + 0.16 * varn) * (0.86 + 0.28 * canopy), woodsNoise(vXZ) * 0.9);
  col = mix(col, cSand * (0.96 + 0.06 * varn), uBeach * (1.0 - smoothstep(1.0, 1.5, vH)));
  col = mix(col, vec3(0.93, 0.95, 0.97), smoothstep(uSnow, uSnow + 25.0, vH));
  vec3 land = light(col, n);

  // ---- sea: the ground's water, shallow to deep from the depth
  float d = clamp(-vH * 0.19, 0.0, 1.0);
  vec3 wc = mix(cWater0, cWater1, smoothstep(0.0, 1.0, d));
  vec2 p = w * (450.0 / uHalf); // the ground's wave pattern
  float wave = sin(p.x * 0.9 + p.y * 0.35 + uTime * 0.9) * sin(p.y * 0.7 - uTime * 0.6 + p.x * 0.2);
  wc *= 0.985 + 0.025 * wave;
  float spec = pow(max(0.0, wave), 10.0) * 0.06 * (1.0 - uNight);
  vec3 wl = wc * (uAmb * 0.95 + uSunCol * 0.25) + spec;
  wl = mix(wl, wc * uNightAmb * 0.9 + uLit0 * 0.012, uNight);
  float shore = 1.0 - smoothstep(0.0, 1.2, -vH);
  wl = mix(wl, wl * 1.12 + 0.02, shore * 0.6);

  vec3 lit = mix(land, wl, 1.0 - smoothstep(-0.4, 0.4, vH));
  gl_FragColor = vec4(haze(lit, vXZ), 1.0);
}`;

export const roadVert = /* glsl */ `
${COMMON}
attribute float aSide;
attribute float aDist;
attribute float aOrder;
attribute float aCls;
varying float vSide;
varying float vDist;
varying float vCls;
varying float vProg;
varying vec2 vXZ;
void main() {
  vSide = aSide; vDist = aDist; vCls = aCls;
  vProg = (uGrowth - aOrder) / (uBand * 0.6);
  vXZ = position.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

// Road surfaces. The side attribute runs -1..1 across the carriageway (|side| = 1 at the kerb), on past the kerb onto
// a walk up to about 2 (sidewalks are part of the strip), 8 is paint (zebra, stop bars) and 9 a junction patch.
// Class: 0 farm track (dirt), 1 driveway (pale), 2 local, 3 collector, 4 arterial. No traffic: the roads are static.
export const roadFrag = /* glsl */ `
${COMMON}
${MATERIALS}
uniform vec3 cRoad0; uniform vec3 cRoad1; uniform vec3 cRoad2;
uniform vec3 uLit0;
uniform float uLensDim;
uniform vec2 uFocusXZ;
uniform float uLodNear;
uniform float uLodMid;
varying float vSide;
varying float vDist;
varying float vCls;
varying float vProg;
varying vec2 vXZ;
void main() {
  if (vProg <= 0.0) discard;
  float a = abs(vSide);
  float fw = max(fwidth(vSide), 1e-4);
  float pxR = max(fwidth(vXZ.x), fwidth(vXZ.y));
  float farR = smoothstep(0.32, 0.75, pxR);
  // Three road qualities by distance from the camera: full paint, plain asphalt, then no zebra.
  float lodD = distance(vXZ, uFocusXZ);
  float lodDetail = 1.0 - smoothstep(uLodNear, uLodMid, lodD);
  bool junction = a > 8.5 && a < 9.5;
  bool paint = a > 7.5 && a < 8.5;
  bool dirt = vCls < 0.5;
  bool drive = vCls > 0.5 && vCls < 1.5;
  vec3 asphalt = vCls > 3.5 ? cRoad2 : vCls > 2.5 ? cRoad1 : cRoad0;
  vec3 c = asphalt;
  vec3 norm = vec3(0.0, 1.0, 0.0);
  // A road pixel wider than about a metre is a colour, not a kerb and a manhole.
  if (farR > 0.8 && !paint && !junction) {
    if (dirt) c = vec3(0.48, 0.42, 0.32);
    else if (drive) c = mix(cRoad0, vec3(0.7, 0.67, 0.62), 0.45);
    vec3 col = light(c, norm);
    col *= 1.0 - uLensDim;
    gl_FragColor = vec4(haze(col, vXZ), 1.0);
    return;
  }

  // World-space asphalt aggregate grain + subtle weathering patches (gated by uDetail and distance)
  float grain = 1.0;
  float patchW = 0.0;
  if (uDetail > 0.01 && farR < 0.55 && lodDetail > 0.35) {
    float gFine = 0.94 + 0.07 * vnoise(vXZ * 0.85) + 0.04 * vnoise(vXZ * 3.6) * (1.0 - farR);
    grain = mix(1.0, gFine, uDetail);
    patchW = smoothstep(0.58, 0.72, vnoise(vXZ * 0.09 + 11.0)) * (1.0 - farR) * uDetail;
  }

  if (dirt) {
    c = vec3(0.5, 0.44, 0.34) * grain;
    // Wheel ruts along rural farm tracks
    float rut = exp(-pow((a - 0.48) * 6.5, 2.0));
    c *= 1.0 - 0.14 * rut * (1.0 - farR);
    float edgeSoft = 1.0 - smoothstep(0.82, 1.0, a);
    c = mix(c * 0.86, c, edgeSoft);
  } else if (drive) {
    // Paved driveway apron with subtle stone/concrete joints
    c = mix(cRoad0, vec3(0.7, 0.67, 0.62), 0.52) * grain;
    if (uDetail > 0.01 && farR < 0.99) {
      float dj = max(lineX(vXZ.x, 1.5, 0.018, pxR), lineX(vXZ.y, 1.5, 0.018, pxR)) * (1.0 - farR) * uDetail;
      c *= 1.0 - 0.08 * dj;
    }
    float dBorder = 1.0 - smoothstep(0.0, fw * 1.4 + 0.03, abs(a - 0.94));
    c *= 1.0 - 0.16 * dBorder;
  } else if (paint) {
    if (lodDetail < 0.2) discard;
    // Crisp road markings with faint asphalt wear showing through
    c = vec3(0.89, 0.87, 0.81) * (0.94 + 0.06 * grain);
  } else if (junction) {
    // Intersection plaza: seamless asphalt matching the meeting arms so the circular cap blends invisibly into the road
    c = asphalt * grain * (1.0 - 0.06 * patchW);
    float rJ = clamp(vDist, 0.0, 1.0);
    // Subtle manhole cover at center of major intersections only
    if (uDetail > 0.01 && farR < 0.85 && vCls > 2.5) {
      float mh = 1.0 - smoothstep(0.06, 0.09, rJ);
      c = mix(c, vec3(0.24, 0.25, 0.27), mh * 0.7 * (1.0 - farR));
    }
  } else if (a > 2.9 && a < 4.0) {
    // Dirt verge on roads that have no sidewalk. Outer edge fades toward grass so the ribbon does not end in a razor cut.
    float vg = smoothstep(3.05, 3.25, a);
    vec3 dirt = vec3(0.40, 0.36, 0.28);
    vec3 grass = vec3(0.40, 0.46, 0.30);
    c = mix(dirt, grass, smoothstep(3.25, 3.5, a)) * grain;
    c = mix(asphalt, c, vg);
  } else {
    c = asphalt * grain * (1.0 - 0.06 * patchW);
    if (a <= 1.0) {
      // Carriageway crown & wheel-track wear (twin dark tracks per lane, lighter oil-polished lane center)
      float laneCenter = vCls > 3.5 ? (a < 0.5 ? 0.25 : 0.75) : 0.48;
      float track = exp(-pow((abs(a - laneCenter) - 0.14) * 14.0, 2.0));
      float crown = 1.0 - 0.06 * (a * a);
      c *= crown * (1.0 - 0.085 * track * (1.0 - farR * 0.5));

      // Concrete storm gutter apron & drainage grates along the kerb (a = 0.86 .. 1.0)
      float gutter = smoothstep(0.85 - fw, 0.89 + fw, a) * (1.0 - smoothstep(1.0 - fw, 1.0 + fw, a));
      vec3 gutterCol = mix(c, vec3(0.56, 0.54, 0.50) * grain, 0.38) * 0.86;
      if (uDetail > 0.01 && farR < 0.85) {
        // World-space storm grates every ~20 m along the gutter so grates never shear across the road
        vec2 gLocal = fract((vXZ + 3.0) / 20.0) * 20.0 - 10.0;
        float grateHit = (1.0 - smoothstep(0.45, 0.65, length(gLocal))) * smoothstep(0.88, 0.92, a) * (1.0 - smoothstep(0.97, 0.99, a));
        float bars = step(0.45, fract((vXZ.x + vXZ.y) * 3.5));
        gutterCol = mix(gutterCol, vec3(0.14, 0.15, 0.16) * (0.65 + 0.35 * bars), grateHit * (1.0 - farR));
      }
      c = mix(c, gutterCol, gutter);

      // Periodic manhole covers along collector/arterial carriageways (world-space circular discs, never sheared)
      if (uDetail > 0.01 && farR < 0.8 && vCls > 2.2) {
        vec2 mGrid = fract((vXZ + 7.5) / 28.0) * 28.0 - 14.0;
        float mhR = length(mGrid);
        float mhCenter = smoothstep(0.12, 0.35, a) * (1.0 - smoothstep(0.38, 0.55, a));
        float mhMask = (1.0 - smoothstep(0.36 - pxR, 0.40 + pxR, mhR)) * mhCenter * (1.0 - farR);
        c = mix(c, vec3(0.24, 0.25, 0.27), mhMask * 0.8);
      }

      // Lane & centerline markings (suppressed inside intersections where vDist < 0)
      float markAllowed = step(0.0, vDist);
      float dAlong = abs(vDist);
      float markFade = (1.0 - smoothstep(0.45, 0.95, pxR)) * markAllowed * lodDetail;
      vec3 whitePaint = vec3(0.88, 0.86, 0.80);
      vec3 brassDivider = vec3(0.84, 0.71, 0.44);
      if (vCls > 3.5) {
        // Arterial: double solid warm-brass center median + dashed white lane dividers + crisp edge lines
        float dbl = (1.0 - smoothstep(0.008, 0.014 + fw * 0.9, abs(a - 0.022))) * markAllowed;
        c = mix(c, brassDivider, dbl * 0.78);
        float laneDiv = (1.0 - smoothstep(0.008, 0.015 + fw, abs(a - 0.5))) * step(0.55, fract(dAlong / 12.0));
        c = mix(c, whitePaint, laneDiv * 0.65 * markFade);
        float edgeLine = 1.0 - smoothstep(0.007, 0.014 + fw, abs(a - 0.84));
        c = mix(c, whitePaint, edgeLine * 0.42 * markFade);
      } else if (vCls > 2.5) {
        // Collector: dashed center line + faint edge line
        float cl = (1.0 - smoothstep(0.012, 0.02 + fw * 1.1, a)) * step(0.48, fract(dAlong / 13.0)) * markAllowed;
        c = mix(c, brassDivider, cl * 0.68);
        float edgeLine = 1.0 - smoothstep(0.008, 0.016 + fw, abs(a - 0.85));
        c = mix(c, whitePaint, edgeLine * 0.32 * markFade);
      } else if (vCls > 1.5 && uDetail > 0.01 && farR < 0.9) {
        // Local urban streets: subtle stone-sett / cobblestone course texture
        float cobble = max(lineX(vXZ.x, 0.45, 0.014, pxR), lineX(vXZ.y, 0.45, 0.014, pxR)) * (1.0 - farR) * uDetail;
        c *= 1.0 - 0.07 * cobble;
      }
    }

    // Sidewalk & granite kerb (a >= 1.0)
    float walk = smoothstep(1.0 - fw, 1.0 + fw, a) * (1.0 - smoothstep(1.96 - fw, 1.96 + fw, a));
    if (walk > 0.001) {
      vec3 swCol = vec3(0.73, 0.70, 0.65) * grain;
      if (uDetail > 0.01 && farR < 0.95) {
        // 1.25 m flagstone paving grid + individual slab tone variation
        float slabJ = max(lineX(vXZ.x, 1.25, 0.016, pxR), lineX(vXZ.y, 1.25, 0.016, pxR)) * (1.0 - farR) * uDetail;
        float slabV = h31(vec3(floor(vXZ / 1.25), 5.0));
        swCol *= (0.96 + 0.08 * slabV) * (1.0 - 0.13 * slabJ);
      }
      // Subtle outer building-edge shadow & raised kerb top highlight
      float outerEdge = smoothstep(1.75, 1.95, a);
      float kerbTop = 1.0 - smoothstep(1.0, 1.14, a);
      swCol = swCol * (1.0 - 0.10 * outerEdge) + vec3(0.05, 0.045, 0.04) * kerbTop * (1.0 - farR);
      c = mix(c, swCol, walk * 0.92);
    }

    // Kerb only on the sidewalk side of a = 1. Carriageway ribbons stop near 0.84, so a junction
    // overlap is asphalt-on-asphalt and does not draw a dark line across the crossing road.
    float kerbFace = (1.0 - smoothstep(0.0, fw * 1.4 + 0.018, abs(a - 1.02))) * step(1.0, a);
    c = mix(c, c * 0.48, kerbFace * 0.92);

    // Tilt normal slightly on the kerb face so sunlight catches one side of the street and shades the other
    norm = normalize(vec3(0.0, 1.0, 0.0) + vec3(sign(vSide) * 0.22 * kerbFace, 0.0, 0.0));
  }

  if (vProg < 1.0) c = mix(c, vec3(0.55, 0.47, 0.38), (1.0 - vProg) * 0.7);
  vec3 col = light(c, norm);
  // Streetlights at night: warm pools along the kerbs and intersections
  float lamp = exp(-pow((fract(vDist / 26.0) - 0.5) * 5.2, 2.0)) * (0.5 + 0.5 * smoothstep(0.3, 1.1, a));
  if (junction) lamp = 0.75;
  col += uLit0 * uNight * (0.015 + lamp * (vCls > 3.5 ? 0.075 : vCls > 2.5 ? 0.055 : 0.035));
  col *= 1.0 - uLensDim;
  gl_FragColor = vec4(haze(col, vXZ), 1.0);
}`;

// ===== TREE BILLBOARDS (cities/perf) ===================================================================================
// A tree's crown seen from far: one camera-facing disc per crown, shaded as the icosahedron crown is (same leaf colour,
// hue, light and lens treatment), its normal taken from the disc's sphere. Used when zoomed out (render.js).
export const billVert = /* glsl */ `
${COMMON}
attribute vec3 iPos;
attribute vec3 iSize;
attribute vec3 iColor;
attribute vec4 iStyle;
attribute vec4 iMeta;
uniform sampler2D uState;
uniform float uStateW;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform int uFocusN;
uniform vec4 uFocusRect[12];
uniform float uFocusDepth[12];
varying vec2 vQ;
varying vec2 vRad;
varying vec3 vCol;
varying vec3 vCen;
varying vec3 vWorld;
varying vec4 vState;
void main() {
  vCen = iPos; vCol = iColor;
  vState = texelFetch(uState, ivec2(int(mod(iStyle.w, uStateW)), int(floor(iStyle.w / uStateW))), 0);
  float p = clamp((uGrowth - iMeta.x) / uBand, 0.0, 1.0);
  if (p <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // the same focus rule as partVert: a crown in a focus box and nearer the camera is hidden
  if (uFocusN > 0) {
    vec3 tc = iPos + vec3(0.0, 0.5 * iSize.y, 0.0);
    float tr = dot(tc, uRight), tu = dot(tc, uUp), td = dot(tc, uFwd);
    for (int k = 0; k < 12; k++) {
      if (k >= uFocusN) break;
      vec4 qf = uFocusRect[k];
      if (tr > qf.x && tr < qf.z && tu > qf.y && tu < qf.w && td < uFocusDepth[k]) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    }
  }
  float g = iMeta.z;
  float pe = p * p * (3.0 - 2.0 * p);
  vec3 cen = iPos + vec3(0.0, 0.5 * iSize.y, 0.0);
  cen.y = g + (cen.y - g) * pe;
  // the crown's silhouette radii: the icosahedron's faces sit a little inside its half-box vertices, so 0.48 of the box
  vRad = vec2(0.24 * (iSize.x + iSize.z), 0.48 * iSize.y * pe);
  vQ = position.xy;
  vec3 wp = cen + uRight * (position.x * vRad.x) + uUp * (position.y * vRad.y);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const billFrag = /* glsl */ `
${COMMON}
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uLens;
varying vec2 vQ;
varying vec2 vRad;
varying vec3 vCol;
varying vec3 vCen;
varying vec3 vWorld;
varying vec4 vState;
void main() {
  float r = length(vQ);
  float fw = max(fwidth(r), 1e-4);
  float cov = clamp((1.0 - r) / fw + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;
  float z = sqrt(max(0.0, 1.0 - dot(vQ, vQ)));
  vec3 n = normalize(uRight * vQ.x + uUp * vQ.y - uFwd * z);
  float tv = h11(vCen.x * 0.113 + vCen.z * 0.737);
  float pxm = max(fwidth(vQ.x) * vRad.x, fwidth(vQ.y) * vRad.y);
  float clump = 0.5;
  if (pxm < 0.8) clump = mix(vnoise(vec2(vQ.x * vRad.x, vQ.y * vRad.y) * 1.6), 0.5, smoothstep(0.3, 0.8, pxm));
  // 0.88: a disc's normals sit on the sphere's bright side; the facets of the real crown average darker (matched by eye)
  vec3 leaf = vCol * 0.88 * mix(0.58, 1.12, smoothstep(-0.5, 0.9, n.y)) * (0.84 + 0.3 * tv) * (0.92 + 0.16 * clump);
  leaf *= vec3(1.0 + 0.08 * (tv - 0.5), 1.0, 1.0 - 0.08 * (tv - 0.5));
  vec3 base = light(leaf, n);
  // the map lens, as partFrag does for a tree (bid 0: never emphasised)
  if (uLens > 0.5) {
    if (mod(floor(vState.a * 255.0 + 0.5), 2.0) >= 1.0) base = mix(base, vState.rgb, 0.55);
    else base = mix(uInk, mix(base, vec3(dot(base, vec3(0.299, 0.587, 0.114))), 0.75), 0.72);
  }
  gl_FragColor = vec4(haze(base, vWorld.xz), cov);
}`;
