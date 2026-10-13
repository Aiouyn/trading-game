/**
 * Progressive business tax (Phase 9 R-9-10, 01 §8.2 lever 2). A business's net income for a game day, after its costs, is
 * taxed at the rate of its owner's bracket. The bracket is read from the owner's rank basis (marked net worth minus loans
 * owed and net gifts received, R-9-4). Losses are not taxed and earn no credit. Pure rules live in src/world/tax.ts.
 *
 * Tuning without a code edit: the env var TAX_BRACKETS, a JSON array of [threshold, rate] pairs, replaces the brackets at
 * startup (the comment above names the default), e.g. TAX_BRACKETS='[[0,0],[250000,0.1],[2500000,0.2],[25000000,0.3],[250000000,0.4]]'. The first threshold is 0,
 * thresholds ascend, and each rate is in [0, TAX_RATE_MAX]. An invalid value throws at startup (it never falls back silently).
 * The browser build has no env, so it always uses the defaults; only the server and the balance scripts read the env.
 */

/** [rank-basis threshold in dollars, marginal rate of the bracket] */
export type TaxBracket = readonly [threshold: number, rate: number];

/** Brackets (R-9-10, tuned on the 504-day wealth bot, set B, confirmed on held-out seeds): 0% up to $250k, 10% to $2.5M, 25% to $25M, 35% to $250M, 45% above. The owner group basis is social.ts taxBasisOf. */
export const DEFAULT_TAX_BRACKETS: readonly TaxBracket[] = [
  [0, 0],
  [250_000, 0.1],
  [2_500_000, 0.25],
  [25_000_000, 0.35],
  [250_000_000, 0.45],
];

/** The highest rate any bracket can reach, after the stabilizer's shift (01 §8.2: the top bracket is 25 to 45%). */
export const TAX_RATE_MAX = 0.45;
/** The stabilizer's shift on every bracket is clamped to plus or minus this many rate points (R-9-10: +-5 points). */
export const TAX_SHIFT_MAX = 0.05;
/** Rate points the stabilizer shifts per unit of its growth error (0.01 of growth over target moves the rates by 0.01). */
export const TAX_SHIFT_GAIN = 1;

/** Parses the TAX_BRACKETS value. Throws a message that names the problem; never returns a partial table. */
export function parseTaxBrackets(raw: string): TaxBracket[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`TAX_BRACKETS is not JSON: ${raw}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('TAX_BRACKETS must be a non-empty JSON array of [threshold, rate]');
  const out: TaxBracket[] = [];
  parsed.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== 2 || !row.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      throw new Error(`TAX_BRACKETS[${i}] must be [threshold, rate] with two finite numbers`);
    }
    const [threshold, rate] = row as [number, number];
    if (i === 0 && threshold !== 0) throw new Error('TAX_BRACKETS must start at threshold 0');
    if (i > 0 && threshold <= out[i - 1]![0]) throw new Error(`TAX_BRACKETS thresholds must ascend (row ${i})`);
    if (rate < 0 || rate > TAX_RATE_MAX) throw new Error(`TAX_BRACKETS rate ${rate} (row ${i}) must be within [0, ${TAX_RATE_MAX}]`);
    out.push([threshold, rate]);
  });
  return out;
}

/** The brackets in force: the env table when TAX_BRACKETS is set (server and balance runs), else the defaults. */
function bracketsFromEnv(): readonly TaxBracket[] {
  const raw = typeof process !== 'undefined' ? process.env?.TAX_BRACKETS : undefined;
  return raw === undefined || raw.trim() === '' ? DEFAULT_TAX_BRACKETS : parseTaxBrackets(raw);
}

/** The tunable tax constant read at startup (see the header). */
export const TAX = {
  brackets: bracketsFromEnv(),
  rateMax: TAX_RATE_MAX,
  shiftMax: TAX_SHIFT_MAX,
  shiftGain: TAX_SHIFT_GAIN,
} as const;
