// Seeded randomness and noise. No Math.random anywhere in the generator.

/** xoshiro128** seeded through splitmix32, the same family as the game engine. */
export function rng(seed) {
  let s = seed >>> 0;
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = sm(), b = sm(), c = sm(), d = sm();
  const next = () => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
    return r / 4294967296;
  };
  const r = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    /** standard normal (Box-Muller) */
    normal: () => {
      const u = Math.max(1e-9, next()), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /** weighted pick: items [[value, weight], ...] */
    weighted: (items) => {
      let tot = 0;
      for (const [, w] of items) tot += w;
      let x = next() * tot;
      for (const [v, w] of items) { x -= w; if (x <= 0) return v; }
      return items[items.length - 1][0];
    },
  };
  return r;
}

function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

/** Integer hash to [0,1). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The open landscape's woods mask, a port of woodsNoise() in shaders.js (same lattice hash, same octaves), so the
// trees are planted exactly where the ground is painted as woods.
const fract = (v) => v - Math.floor(v);
function latticeHash(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(1 * 0.1031);
  const d = a * (c + 31.32) + b * (b + 31.32) + c * (a + 31.32);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function valueNoise(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = latticeHash(ix, iy), b = latticeHash(ix + 1, iy), c = latticeHash(ix, iy + 1), d = latticeHash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbmNoise(px, py) {
  return 0.6 * valueNoise(px, py) + 0.3 * valueNoise(px * 2.07 + 17.3, py * 2.07 + 17.3) + 0.1 * valueNoise(px * 4.13 + 5.9, py * 4.13 + 5.9);
}
/** Woods of the open land, 0..1, at world (x, y): 1 deep in a patch. Mirrors woodsNoise() in shaders.js. */
export function woodsMask(x, y) {
  const t = fbmNoise(x / 480 + 41, y / 480 + 41);
  const s = Math.min(1, Math.max(0, (t - 0.56) / 0.08));
  return s * s * (3 - 2 * s);
}

/** 2D gradient noise (Perlin style), seeded, range about [-1, 1]. */
export function makeNoise(seed) {
  const perm = new Uint16Array(512);
  const r = rng(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = (i / 256) * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const h00 = perm[X + perm[Y]], h10 = perm[X + 1 + perm[Y]];
    const h01 = perm[X + perm[Y + 1]], h11 = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[h00] * xf + gy[h00] * yf, n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1), n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
  }
  function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f + i * 17.13, y * f - i * 9.71); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x, y, oct = 5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(noise(x * f + i * 31.7, y * f + i * 5.3))); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  /** domain-warped fbm: geological rather than bubbly */
  function warped(x, y, oct = 5, warp = 0.8) {
    const wx = fbm(x + 5.2, y + 1.3, 3), wy = fbm(x - 3.7, y + 8.1, 3);
    return fbm(x + warp * wx, y + warp * wy, oct);
  }
  return { noise, fbm, ridged, warped };
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
