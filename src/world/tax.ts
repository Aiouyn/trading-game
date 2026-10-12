/**
 * Progressive business tax (Phase 9 R-9-10): the pure rules. A business's net income for a settled game day (after its costs)
 * is taxed at its owner's bracket rate; a loss is not taxed. The owner's bracket comes from the rank basis (social.ts
 * rankBasisOf). The stabilizer may shift every bracket's rate by a clamped amount while it is engaged (01 §8.2 lever 2).
 * Deterministic and free of state: the callers (shops.ts, shopView.ts, boards.ts) hold the numbers.
 */
import { TAX, type TaxBracket } from '@/content/tax';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Index of the bracket that holds a rank basis: the highest threshold the basis reaches (a basis exactly on a threshold is in that bracket). */
export function bracketOf(basis: number, brackets: readonly TaxBracket[] = TAX.brackets): number {
  let k = 0;
  for (let i = 1; i < brackets.length; i++) if (basis >= brackets[i]![0]) k = i;
  return k;
}

/**
 * The marginal rate of an owner: the bracket's rate shifted by the stabilizer (every bracket moves together, the shift
 * clamped to +-TAX.shiftMax) and clamped to [0, TAX.rateMax].
 */
export function rateOf(basis: number, stabilizerShift = 0, brackets: readonly TaxBracket[] = TAX.brackets): number {
  const shift = clamp(stabilizerShift, -TAX.shiftMax, TAX.shiftMax);
  return clamp(brackets[bracketOf(basis, brackets)]![1] + shift, 0, TAX.rateMax);
}

/** Cents: a tax is booked to the cent, so the money identity closes exactly. */
const cents = (x: number) => Math.round(x * 100) / 100;

/**
 * The tax on one business's net income for one settled day, at the owner's bracket. Only a positive net is taxed (a loss
 * earns no credit); the marginal rate applies to the whole net (no slicing).
 */
export function taxOf(income: number, basis: number, stabilizerShift = 0, brackets: readonly TaxBracket[] = TAX.brackets): number {
  if (!(income > 0)) return 0;
  return cents(rateOf(basis, stabilizerShift, brackets) * income);
}

/**
 * The stabilizer's shift on the brackets for one day: its growth error (e) scaled by the gain and clamped to +-TAX.shiftMax.
 * It moves only while the stabilizer is engaged (its sink multiplier above 1); otherwise it is zero.
 */
export function stabilizerTaxShift(err: number, engaged: boolean): number {
  if (!engaged || !Number.isFinite(err)) return 0;
  return clamp(TAX.shiftGain * err, -TAX.shiftMax, TAX.shiftMax);
}
