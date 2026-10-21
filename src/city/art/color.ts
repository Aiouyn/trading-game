// Colour maths. Colours are sRGB triples in 0..1. No colour literals live in src/city (17 §2.5):
// every scene colour is derived from Spec 1's tokens at runtime.

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function srgbToOklab([r, g, b]: Rgb): Lab {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToSrgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** color-mix(in oklab, a (1-t), b t) */
export function mixOklab(a: Rgb, b: Rgb, t: number): Rgb {
  const A = srgbToOklab(a), B = srgbToOklab(b);
  return oklabToSrgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Adjusts OKLCH lightness (×) and chroma (×) of a colour. */
export function adjust(c: Rgb, lightness: number, chroma: number, dL = 0): Rgb {
  const [L, a, b] = srgbToOklab(c);
  return oklabToSrgb([L * lightness + dL, a * chroma, b * chroma]);
}

/** Rotates the OKLCH hue by `deg` and sets the chroma. */
export function withHue(c: Rgb, deg: number, chroma: number): Rgb {
  const [L, a, b] = srgbToOklab(c);
  const h = Math.atan2(b, a) + (deg * Math.PI) / 180;
  return oklabToSrgb([L, Math.cos(h) * chroma, Math.sin(h) * chroma]);
}

export function srgbToCieLab([r, g, b]: Rgb): Lab {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two sRGB colours. */
export function deltaE(a: Rgb, b: Rgb): number {
  const A = srgbToCieLab(a), B = srgbToCieLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Parses a computed CSS colour string (legacy comma syntax or color(srgb …)) into 0..1 sRGB. */
export function parseComputedColor(text: string): Rgb | null {
  const nums = text.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 3) return null;
  const v = nums.slice(0, 3).map(Number);
  const unit = text.trim().startsWith('color(') ? 1 : 255;
  return [v[0] / unit, v[1] / unit, v[2] / unit];
}
