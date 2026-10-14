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
float fieldNoise(vec2 xz) { return smoothstep(0.52, 0.6, fnoise(xz / 700.0 + 13.0)); }
float woodsNoise(vec2 xz) { return smoothstep(0.56, 0.64, fnoise(xz / 480.0 + 41.0)); }
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
uniform float uStateW;
uniform float uGhostPass;
uniform float uFocusPass;
varying vec4 vState;
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
void main() {
  // per-building state (render.js load): rgb = lens tint, a = flags (1 emphasis, 2 see-through occluder, 4 focus)
  vState = texelFetch(uState, ivec2(int(mod(iStyle.w, uStateW)), int(floor(iStyle.w / uStateW))), 0);
  bool isOccluder = mod(floor(floor(vState.a * 255.0 + 0.5) / 2.0), 2.0) >= 1.0;
  float p = clamp((uGrowth - iMeta.x) / uBand, 0.0, 1.0);
  vProg = p;
  // the opaque pass draws what is built (occluders are cut out in the fragment); the ghost pass draws only occluders
  bool isFocusV = mod(floor(floor(vState.a * 255.0 + 0.5) / 4.0), 2.0) >= 1.0;
  if (p <= 0.0 || (uGhostPass > 0.5 && !isOccluder) || (uFocusPass > 0.5 && !isFocusV)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 lp = position * iSize;
  vMetric = lp;
  float c = cos(iRot), s = sin(iRot);
  vec3 rp = vec3(c * lp.x - s * lp.z, lp.y, s * lp.x + c * lp.z);
  vec3 wp = iPos + rp;
  float g = iMeta.z;
  float pe = p * p * (3.0 - 2.0 * p);
  wp.y = g + (wp.y - g) * pe;
  vN = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  vLN = normal;
  vFace = aFace; vInfo = aInfo; vColor = iColor; vStyle = iStyle; vMeta = iMeta; vSize = iSize;
  vBaseAbs = iPos.y - g;
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const partFrag = /* glsl */ `
${COMMON}
uniform float uMood;
uniform float uHover;
uniform float uLens;
uniform vec3 uLit0;
uniform vec3 uLit1;
uniform vec3 uLit2;
uniform vec3 uBrass;
uniform vec3 uSkyRefl;
uniform float uGhostPass;
uniform float uFocusPass;
varying vec4 vState;
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

  // see-through state (bits 2 and 4 of the per-building flags): occluders are drawn by the ghost pass only,
  // focus buildings get brass edges and a lifted colour
  float stateBits = floor(vState.a * 255.0 + 0.5);
  bool isOccluder = mod(floor(stateBits / 2.0), 2.0) >= 1.0;
  bool isFocus = mod(floor(stateBits / 4.0), 2.0) >= 1.0;
  if (isOccluder && uGhostPass < 0.5) discard;

  // the day's return of a headquarters' company (same formula as the info card)
  float ret = 0.0;
  float litRatio = vMeta.y;
  if (hq) {
    float h1 = fract(bid * 0.61803398875), h2 = fract(bid * 0.75487766625);
    ret = uMood * 0.06 * (0.5 + h1) + (h2 - 0.5) * 0.024;
    litRatio = clamp(0.36 + ret * 9.0, 0.03, 0.97);
  }

  vec3 base = vColor;
  vec3 emissive = vec3(0.0);
  float hAbs = vBaseAbs + vMetric.y;

  // ---- windows on walls
  bool wall = kind < 0.5 && abs(vLN.y) < 0.5;
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
    // glass by day: sky reflection, darker towards the street
    vec3 glass = mix(base * 0.45 + uSkyRefl * 0.35, uSkyRefl * 0.7 + 0.08, clamp(hAbs / 220.0, 0.0, 1.0) * 0.6 + 0.2 * n.y);
    if (style == 2) glass = mix(base * 0.85, uSkyRefl * 0.9, 0.35 + 0.15 * h31(vec3(bid, fl * 0.3, 3.0)));
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
    float v = 0.85 + 0.3 * h11(vMetric.x * 3.1 + vMetric.z * 7.7 + bid);
    base = light(vColor * v, n);
  } else {
    base = light(vColor, n);
  }

  // ---- focus buildings lift a little towards brass
  if (isFocus) base = mix(base, uBrass, 0.12);

  // ---- ink edges, faded out when the face is tiny on screen (brass on focus buildings)
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
    vec3 edgeC = isFocus ? uBrass : uInk * (0.6 + 0.4 * (1.0 - uNight));
    base = mix(base, edgeC, lineV * (isFocus ? 0.9 : 0.55));
  }

  // ---- construction: a scaffold lattice while the building rises
  if (vProg < 1.0 || ghost) {
    float sc = ghost ? 0.0 : 1.0 - vProg;
    vec2 q = vec2(vMetric.x + vMetric.z, hAbs) / 2.2;
    float lat = max(step(0.86, fract(q.x)), step(0.86, fract(q.y)));
    base = mix(base, mix(vec3(0.62, 0.55, 0.45), vec3(0.85, 0.55, 0.22), lat), sc * 0.75);
  }

  if (abs(bid - uHover) < 0.5 && bid > 0.5) base = mix(base, uBrass * 1.15, 0.38);
  if (uFocusPass > 0.5) {
    // focus overlay, drawn on top with depth off: a brass outline at full strength and a faint brass veil over the
    // hidden parts, so the focus building reads at any zoom and behind other towers
    gl_FragColor = vec4(uBrass * 1.15, 0.12 + 0.88 * lineV);
    return;
  }
  if (uGhostPass > 0.5) {
    // see-through: the lit face mixed 35% towards a cool blue-grey and faint; the ink edges stay visible
    vec3 glass = mix(base, vec3(0.52, 0.62, 0.72), 0.35);
    gl_FragColor = vec4(mix(glass, uInk, lineV), mix(0.16, 0.55, lineV));
    return;
  }

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
void main() {
  vec4 A = texture2D(uA, vUv);
  vec4 B = texture2D(uB, vUv);
  vec3 n = normalize(vN);
  float water = A.r, green = A.g, sand = A.b, depth = A.a;
  float shadowO = B.r, lotO = B.g, plaza = B.b, varn = B.a;
  float g = uGrowth;
  // near the border the square's ground is the open landscape's again (see the edge blend below)
  float edgeIn = smoothstep(uHalf - 500.0, uHalf, max(abs(vXZ.x), abs(vXZ.y)));
  // bare land, lawns and parks; urban blocks are meadow until the city reaches them
  float blockO = water > 0.5 ? 0.0 : depth;
  float dev = (1.0 - smoothstep(g - uBand * 0.6, g, blockO + 0.002)) * (1.0 - edgeIn);
  vec3 meadow = mix(cNatural, cPark, 0.42) * (0.94 + 0.12 * varn);
  vec3 col = mix(meadow, mix(cNatural, cLand, 0.35 + 0.3 * varn), dev);
  float slope = 1.0 - n.y;
  col = mix(col, cNatural * 0.8, smoothstep(0.1, 0.35, slope) * 0.6);
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
  col = mix(col, cPark * 0.62 * (0.92 + 0.16 * varn), forestM * 0.9);
  // built lots appear with the city
  float built = (1.0 - smoothstep(g - uBand * 0.2, g, lotO + 0.002)) * step(lotO, 0.995) * (1.0 - edgeIn);
  col = mix(col, cPave * (0.94 + 0.1 * varn), built * (1.0 - smoothstep(0.4, 0.6, green)) * 0.92);
  col = mix(col, cPlaza, smoothstep(0.4, 0.6, plaza));
  col = mix(col, cSand * (0.96 + 0.06 * varn), smoothstep(0.4, 0.6, sand));
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
uniform float uHalf;
uniform float uSnow;
uniform float uBeach;
uniform vec3 cNatural; uniform vec3 cPark; uniform vec3 cSand;
uniform vec3 cWater0; uniform vec3 cWater1;
uniform vec3 uLit0;
varying vec2 vXZ;
varying vec3 vN;
varying float vH;

void main() {
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
  col = mix(col, cPark * 0.62 * (0.92 + 0.16 * varn), woodsNoise(vXZ) * 0.9);
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
uniform vec3 cRoad0; uniform vec3 cRoad1; uniform vec3 cRoad2;
uniform vec3 uLit0;
uniform float uLensDim;
varying float vSide;
varying float vDist;
varying float vCls;
varying float vProg;
varying vec2 vXZ;
void main() {
  if (vProg <= 0.0) discard;
  float a = abs(vSide);
  float fw = fwidth(vSide);
  bool junction = a > 8.5 && a < 9.5;
  bool paint = a > 7.5 && a < 8.5;
  bool dirt = vCls < 0.5;
  bool drive = vCls > 0.5 && vCls < 1.5;
  vec3 asphalt = vCls > 3.5 ? cRoad2 : vCls > 2.5 ? cRoad1 : cRoad0;
  vec3 c = asphalt;
  if (dirt) c = vec3(0.5, 0.44, 0.34);
  if (drive) c = mix(cRoad0, vec3(0.68, 0.66, 0.62), 0.5);
  // asphalt grain from world-space noise, so it does not swim with the camera
  float grain = 0.95 + 0.06 * vnoise(vXZ * 0.9) + 0.03 * vnoise(vXZ * 3.7);
  if (paint) {
    c = vec3(0.86, 0.85, 0.8);
  } else if (junction) {
    c *= grain;
  } else {
    c *= grain;
    if (!dirt && !drive) {
      // the walk: lighter, from the kerb out to the edge of the strip
      float walk = smoothstep(1.0 - fw, 1.0 + fw, a) * (1.0 - smoothstep(1.95 - fw, 1.95 + fw, a));
      c = mix(c, vec3(0.7, 0.68, 0.64) * grain, walk * 0.85);
      // a dark kerb line where the carriageway meets the walk (or the verge)
      float kerb = 1.0 - smoothstep(0.0, fw * 1.5 + 0.015, abs(a - 1.0));
      c = mix(c, c * 0.6, kerb * 0.9);
      // centre lines, muted: solid on arterials, long dashes on collectors
      if (vCls > 2.5) {
        float cl = 1.0 - smoothstep(0.02, 0.02 + fw * 1.2, a);
        float dash = vCls > 3.5 ? 1.0 : step(0.5, fract(vDist / 14.0));
        c = mix(c, vec3(0.78, 0.74, 0.6), cl * dash * 0.6);
      }
    }
  }
  if (vProg < 1.0) c = mix(c, vec3(0.55, 0.47, 0.38), (1.0 - vProg) * 0.7);
  vec3 col = light(c, vec3(0.0, 1.0, 0.0));
  // street lights at night: a faint pool between the poles
  float lamp = exp(-pow((fract(vDist / 26.0) - 0.5) * 6.0, 2.0)) * (0.55 + 0.45 * min(a, 1.0));
  col += uLit0 * uNight * (0.012 + lamp * (vCls > 2.5 ? 0.05 : 0.03));
  col *= 1.0 - uLensDim;
  gl_FragColor = vec4(haze(col, vXZ), 1.0);
}`;
