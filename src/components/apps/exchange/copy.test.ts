import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { FUND_RULES } from '@/content/funds';
import { aumBucketKey, classKey, covenantKey, hiresKey, planEndKey, rejectVars, refusalCopy, sectorKey, sideKey, skipKey, statusKey, tierKey, unitNav } from './copy';

// The Exchange copy: every key a helper can return must exist in English and French, and each refusal has its three parts.
const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;

const FUND_CODES = [
  'fundNoFund', 'fundNotManager', 'fundTerms', 'fundRank', 'fundAge', 'fundBanned', 'fundConviction', 'fundOwnsOne',
  'fundStake', 'fundCash', 'fundClosed', 'fundFrozen', 'fundBreaker', 'fundMandate', 'fundLeverage', 'fundPosition',
  'fundInsiderCap', 'fundSelfMatch', 'fundOrderRejected', 'fundDeposit', 'fundInvestorAge', 'fundInvestorLink',
  'fundInvestorLimit', 'fundStakeLow', 'fundAumCap', 'fundRedeem', 'fundMandateInvalid', 'fundTradeInvalid',
];

const COMPANY_IPO_CODES = ['ipoOwnerSet', 'ipoAccountTooYoung', 'ipoBookClosed', 'ipoBadShares', 'ipoAlreadyRequested', 'unknownCompany'];

describe('refusal copy', () => {
  it('every fund refusal has its three parts in both languages', () => {
    for (const c of FUND_CODES) {
      for (const part of ['what', 'why', 'do']) {
        expect(EN[`funds.refusal.${c}.${part}`], `${c}.${part} en`).toBeTruthy();
        expect(FR[`funds.refusal.${c}.${part}`], `${c}.${part} fr`).toBeTruthy();
      }
    }
  });

  it('a company refusal resolves to its three parts with the reject\'s numbers', () => {
    const copy = refusalCopy('company.refusal', 'ipoAccountTooYoung', { minDays: 7 });
    expect(copy.what).toBe(EN['company.refusal.ipoAccountTooYoung.what']);
    expect(copy.why).toContain('7');
    expect(copy.do.length).toBeGreaterThan(0);
  });

  it('a code with no copy falls back to the generic line, never a raw key', () => {
    const copy = refusalCopy('funds.refusal', 'noSuchCode');
    expect(copy.what).toBe(EN['exchange.refuse.what']);
    expect(copy.why).toBe(EN['exchange.refuse.why']);
    expect(copy.do).toBe(EN['exchange.refuse.do']);
  });

  it('the reject vars are the numbers and strings of the reject, without its code', () => {
    expect(rejectVars({ code: 'ipoAccountTooYoung', minDays: 7, note: 'x' })).toEqual({ minDays: 7, note: 'x' });
    expect(rejectVars(undefined)).toEqual({});
  });

  it('every company refusal the Exchange can show has its three parts', () => {
    for (const c of COMPANY_IPO_CODES) {
      for (const part of ['what', 'why', 'do']) expect(EN[`company.refusal.${c}.${part}`], `${c}.${part}`).toBeTruthy();
    }
  });
});

describe('labels and keys', () => {
  it('every key the labels can return exists in both languages', () => {
    const keys: string[] = [];
    for (const s of ['seed', 'growth', 'late']) keys.push(tierKey(s, false));
    keys.push(tierKey('late', true));
    for (const s of ['tech', 'health', 'staples', 'discretionary', 'industrials', 'security'] as const) keys.push(sectorKey(s));
    for (const s of ['open', 'frozen', 'winding', 'closed']) keys.push(statusKey(s));
    for (const c of FUND_RULES.classes) keys.push(classKey(c));
    for (const r of ['completed', 'terminated', 'legal', 'tender', 'anything']) keys.push(planEndKey(r));
    for (const r of ['volume', 'price', 'cap', 'halt', 'other']) keys.push(skipKey(r));
    for (const v of ['up', 'flat', 'down'] as const) keys.push(hiresKey(v));
    keys.push(sideKey('buy'), sideKey('sell'));
    for (const s of ['ok', 'cure', 'default', 'anything']) keys.push(covenantKey(s));
    for (let b = 0; b <= 3; b++) keys.push(aumBucketKey(b, FUND_RULES.aumBuckets).key);
    for (const k of keys) {
      expect(EN[k], `${k} en`).toBeTruthy();
      expect(FR[k], `${k} fr`).toBeTruthy();
    }
  });

  it('the AUM bucket key follows the bucket the world reads', () => {
    expect(aumBucketKey(0, FUND_RULES.aumBuckets).key).toBe('exchange.aum.0');
    expect(aumBucketKey(1, FUND_RULES.aumBuckets).key).toBe('exchange.aum.1');
    expect(aumBucketKey(2, FUND_RULES.aumBuckets).key).toBe('exchange.aum.2');
    expect(aumBucketKey(3, FUND_RULES.aumBuckets).key).toBe('exchange.aum.3');
  });

  it('a unit NAV shows four decimals and the real minus sign', () => {
    expect(unitNav(1)).toBe('1.0000');
    expect(unitNav(1.02357)).toBe('1.0236');
    expect(unitNav(-0.5)).toBe('−0.5000');
  });
});
