// The one canonical encoding of public city files (SR Q13a): sorted object keys, arrays in a
// fixed order, integers, decimal strings, and ratios rounded to 1e-4. No other floats.
// The publisher and the client's delta applier both go through it, so
// canonical(apply(snapshot(v-1), delta)) === canonical(snapshot(v)) byte for byte (SR Q4).

const RATIO_STEP = 1e4;

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number': {
      if (!Number.isFinite(value)) throw new Error('canonical: non-finite number');
      if (Math.round(value * RATIO_STEP) / RATIO_STEP !== value) throw new Error(`canonical: ${value} has more than 4 decimals`);
      return JSON.stringify(value === 0 ? 0 : value); // -0 → 0
    }
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const o = value as Record<string, unknown>;
      const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`canonical: unsupported ${typeof value}`);
  }
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/** Rounds a ratio to the published precision, half-even. */
export function roundRatio(x: number): number {
  const v = x * RATIO_STEP;
  const f = Math.floor(v);
  const d = v - f;
  const r = d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
  return r / RATIO_STEP;
}

export const byKey = <T>(key: (t: T) => string) => (a: T, b: T): number => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
