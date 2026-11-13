// The kernel generator hides its state inside a closure, so a saved world could not
// continue the same draws. This is the same xoshiro128** as sim/kernel/rng.ts, with the
// four words kept on the world where a snapshot can read and restore them.
import type { World } from '../../kernel/index.ts';
import type { Rng } from '../../kernel/rng.ts';

export interface RngBox {
  streams: Map<string, Uint32Array>;
  made: Map<string, Rng>;
}

const boxes = new WeakMap<World, RngBox>();

function seed4(str: string): Uint32Array {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return new Uint32Array([(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]);
}

function rngFrom(s: Uint32Array): Rng {
  const u32 = (): number => {
    const r = Math.imul(((Math.imul(s[1], 5) << 7) | (Math.imul(s[1], 5) >>> 25)), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    return r;
  };
  const next = (): number => (u32() * 4294967296 + u32()) / 18446744073709551616;
  return {
    next,
    normal: () => { const u = Math.max(next(), 1e-300), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
  };
}

export function installRng(w: World): void {
  const streams = new Map<string, Uint32Array>();
  const made = new Map<string, Rng>();
  (w as { rng: (key: string) => Rng }).rng = (key: string): Rng => {
    let r = made.get(key);
    if (r) return r;
    let s = streams.get(key);
    if (!s) { s = seed4(`${w.seed}:${key}`); streams.set(key, s); }
    r = rngFrom(s);
    made.set(key, r);
    return r;
  };
  boxes.set(w, { streams, made });
}

export function dumpRng(w: World): Record<string, number[]> {
  const box = boxes.get(w);
  if (!box) throw new Error('world has no rng box');
  const out: Record<string, number[]> = {};
  for (const [k, s] of box.streams) out[k] = [s[0], s[1], s[2], s[3]];
  return out;
}

/** Copy saved words into the arrays the live generators already close over. */
export function restoreRng(w: World, saved: Record<string, number[]>): void {
  const box = boxes.get(w);
  if (!box) throw new Error('world has no rng box');
  box.made.clear();
  const keep = new Set(Object.keys(saved));
  for (const [k, nums] of Object.entries(saved)) {
    let s = box.streams.get(k);
    if (!s) { s = new Uint32Array(4); box.streams.set(k, s); }
    s[0] = nums[0] >>> 0; s[1] = nums[1] >>> 0; s[2] = nums[2] >>> 0; s[3] = nums[3] >>> 0;
  }
  for (const k of [...box.streams.keys()]) if (!keep.has(k)) box.streams.delete(k);
}
