/**
 * Deterministic, serializable PRNG.
 * xoshiro128** with 4x uint32 state, seeded from a string via cyrb128 + splitmix32.
 * One independent stream per key (asset id, "macro", ...) so adding an asset never
 * changes the path of any other asset.
 */

export type RngState = [number, number, number, number];

/** cyrb128 string hash -> 4x uint32 */
function cyrb128(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Build the initial state for stream `key` of world `seed`. */
export function seedStream(seed: string, key: string): RngState {
  const s = cyrb128(`${seed}::${key}`);
  // xoshiro must not start from all zeros
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 0x9e3779b9;
  return s;
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * Mutable cursor over an RngState. step() copies state in, draws, and writes it back,
 * so WorldState stays plain JSON.
 */
export class Rng {
  private s0: number; private s1: number; private s2: number; private s3: number;
  private spare: number | null = null;

  constructor(state: RngState) {
    [this.s0, this.s1, this.s2, this.s3] = state;
  }

  state(): RngState {
    // A cached Box-Muller spare is intentionally discarded: state() is only read at the
    // end of a step, and the next step always starts from a clean generator.
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  /** uint32 */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 ^= t; this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** uniform in (0, 1), never exactly 0 or 1 */
  uniform(): number {
    return (this.nextU32() + 0.5) / 4294967296;
  }

  /** standard normal (Box-Muller, polar-free variant) */
  normal(): number {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    const u1 = this.uniform(), u2 = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    this.spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  }

  /** Student-t with integer nu > 2, rescaled to unit variance (fat tails, same variance as N(0,1)). */
  studentT(nu: number): number {
    const z = this.normal();
    let chi2 = 0;
    for (let i = 0; i < nu; i++) { const g = this.normal(); chi2 += g * g; }
    return (z / Math.sqrt(chi2 / nu)) * Math.sqrt((nu - 2) / nu);
  }

  /** exponential with given mean */
  exponential(mean: number): number {
    return -Math.log(this.uniform()) * mean;
  }

  /** Bernoulli */
  chance(p: number): boolean {
    return this.uniform() < p;
  }
}
