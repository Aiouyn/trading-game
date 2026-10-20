// Value-leg authority (errata E-11, signed off by Producer): per code and leg FIXED | REQUIRED | CLASS | NONE, from legpolicy.csv.
import { SortedMap } from './det';
import { LEGPOLICY_SEED } from './legpolicy-data';

export interface LegAllowed { nums: readonly number[]; asset?: true; nonMoney?: true; pnl?: true }
export interface LegSide { policy: 'FIXED' | 'REQUIRED' | 'CLASS' | 'NONE'; def: number | '@ASSET' | '@' | null; allowed: LegAllowed }
export interface LegPolicyRow { code: string; A: LegSide; B: LegSide; negSwap: boolean }

const APPRAISAL_ASSETS = [1570, 1800, 1870];
/**
 * Producer rulings on top of legpolicy.csv (2026-10-21):
 * - LED_APPRAISAL is CLASS on both legs; only the 4 card shapes are allowed as pairs (APPRAISAL_PAIRS).
 */
const OVERRIDES: readonly LegPolicyRow[] = [
  { code: 'LED_APPRAISAL', negSwap: true,
    A: { policy: 'CLASS', def: '@ASSET', allowed: { nums: [...APPRAISAL_ASSETS, 3400, 5170] } },
    B: { policy: 'CLASS', def: 4070, allowed: { nums: [4070, 3400, ...APPRAISAL_ASSETS] } } },
];
/** LED_APPRAISAL debit/credit shapes: asset/4070, 5170/asset, asset/3400, 3400/asset. */
export function appraisalPairOk(dr: number, cr: number): boolean {
  const a = (x: number): boolean => APPRAISAL_ASSETS.includes(x);
  return (a(dr) && cr === 4070) || (dr === 5170 && a(cr)) || (a(dr) && cr === 3400) || (dr === 3400 && a(cr));
}

export const LEG_POLICY = new SortedMap<string, LegPolicyRow>([...LEGPOLICY_SEED, ...OVERRIDES].map((r) => [r.code, r]));

const MONEY = [1001, 1002, 1003, 1009, 1010, 1910, 2001, 2002, 2003];
export function inAllowed(a: LegAllowed, acct: number, sysEntity: boolean): boolean {
  if (a.nums.includes(acct)) return true;
  if (a.asset && ((acct >= 1500 && acct <= 1899) || [2300, 2310, 2600, 3100, 3150].includes(acct))) return true;
  if (a.nonMoney && !sysEntity && !MONEY.includes(acct)) return true;
  if (a.pnl && acct >= 4000 && acct <= 6999) return true; // incl. sys 4900/5900 (Systems open item: LED_PERIOD_CLOSE)
  return false;
}
export type LegResult = { acct: number | null } | { err: 'leg_missing' | 'leg_mismatch'; expected: string };
/** The account for one leg. `given` = the caller's override or positional argument. Codes without a row keep the template fallback. */
export function resolveLeg(code: string, side: 'A' | 'B', given: number | undefined, sysEntity = false): LegResult {
  const r = LEG_POLICY.get(code); if (!r) return { acct: given ?? null };
  const s = r[side];
  const exp = (): string => s.policy === 'FIXED' ? String(s.def) : s.policy === 'NONE' ? 'none' : `${s.policy}(${[...s.allowed.nums, ...(s.allowed.asset ? ['@ASSET'] : []), ...(s.allowed.nonMoney ? ['@'] : []), ...(s.allowed.pnl ? ['P&L'] : [])].join('|')})`;
  switch (s.policy) {
    case 'NONE': return given === undefined ? { acct: null } : { err: 'leg_mismatch', expected: exp() };
    case 'FIXED': return given === undefined || given === s.def ? { acct: s.def as number } : { err: 'leg_mismatch', expected: exp() };
    case 'REQUIRED': return given === undefined ? { err: 'leg_missing', expected: exp() } : inAllowed(s.allowed, given, sysEntity) ? { acct: given } : { err: 'leg_mismatch', expected: exp() };
    default:
      if (given === undefined) return typeof s.def === 'number' ? { acct: s.def } : { err: 'leg_missing', expected: exp() };
      return given === s.def || inAllowed(s.allowed, given, sysEntity) ? { acct: given } : { err: 'leg_mismatch', expected: exp() };
  }
}

/** Errata E-14: accrual kind -> entity-to-entity settlement codes (owner module from the catalog). Elastic codes never settle. */
export type AccrualKind = 'FEE' | 'INTEREST' | 'RENT' | 'SUBSCRIPTION' | 'UPKEEP' | 'WAGES';
export const SETTLEMENT_CODES: Readonly<Record<AccrualKind, readonly string[]>> = {
  RENT: ['PROP_RENT_CORE'], WAGES: ['BIZ_WAGES_B2E'], UPKEEP: ['BIZ_UPKEEP_B2B', 'LIFE_UPKEEP_B2B', 'PROP_UPKEEP_B2B'],
  SUBSCRIPTION: ['BIZ_SUBSCRIPTION_B2B', 'LIFE_SUBSCRIPTION_B2B'], FEE: ['BIZ_SERVICE_FEE_B2B'],
  INTEREST: ['BNK_LOAN_INTEREST', 'CMP_INTERCOMPANY_INTEREST', 'SOC_LOAN_P2P_INTEREST'],
};
/** E-14 settlement pair (b payable / a receivable). */
export const SETTLEMENT_PAYABLE: Readonly<Record<AccrualKind, number>> = { RENT: 2540, WAGES: 2510, UPKEEP: 2520, SUBSCRIPTION: 2520, FEE: 2520, INTEREST: 2510 };
export const RECEIVABLE = 1100;
export const ACCRUAL_LEGS = [1100, 1110, 2510, 2520, 2540];
