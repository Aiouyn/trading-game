import { describe, expect, it } from 'vitest';
import { applyPosting, isBalancedPerEntity, SortedMap, tplAccrue, tplElasticIn, tplLend, tplMint, tplPay, type Entry } from '../src';
import { fixture, K } from './fixture';

const simple = (e: Entry): string[] => e.postings.map((p) => `Dr ${p.debitAccount} / Cr ${p.creditAccount} ${p.amount}`);

describe('templates (T03-07) and rail (T03-06)', () => {
  it('03#3 ELASTIC_IN household purchase of $100 produces four postings, balanced, M0_sys +100, hh:1009 −100', () => {
    const w = fixture();
    const e = tplElasticIn(w.env('09', 'P12'), 'hh_C1', 'biz_B', 100_000_000n, 'FDL', 'BIZ_SALES_HH', { valueLegB: 4000 });
    expect(simple(e)).toEqual([
      'Dr biz_B:1001:FDL / Cr cbk_FDL:2001:biz_B:FDL 100000000',
      'Dr cbk_FDL:1910:FDL / Cr sys_SYSTEM:2900:FDL 100000000',
      'Dr sys_SYSTEM:2909:hh_C1:FDL / Cr hh_C1:1009:FDL 100000000',
      'Dr hh_C1:5200:FDL / Cr biz_B:4000:FDL 100000000',
    ]);
    expect(isBalancedPerEntity(e.postings)).toBe(true);
    expect(e.postings.filter((p) => p.flowLeg).map((p) => p.postingSeq)).toEqual([1]);
    const a = new SortedMap<string, { balance: bigint; qty: bigint }>();
    for (const p of e.postings) applyPosting(a, p);
    expect(a.get('cbk_FDL:1910:FDL')?.balance).toBe(100_000_000n);
    expect(a.get('hh_C1:1009:FDL')?.balance).toBe(-100_000_000n);
  });
  it('MINT $5,000: 3 postings, sys:5900 debit, chr:4110 credit; the issuance posting is the flowLeg (Δ5)', () => {
    const e = tplMint(fixture().env('14', 'P12'), 'chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH');
    expect(simple(e)).toEqual([
      'Dr chr_P:1001:FDL / Cr cbk_FDL:2001:chr_P:FDL 5000000000',
      'Dr cbk_FDL:1910:FDL / Cr sys_SYSTEM:2900:FDL 5000000000',
      'Dr sys_SYSTEM:5900:ACCT_START_CASH:FDL / Cr chr_P:4110:FDL 5000000000',
    ]);
    expect(e.postings.filter((p) => p.flowLeg).length).toBe(1);
  });
  it('LEND $1M: deposit created at the bank and loan booked; balanced', () => {
    const e = tplLend(fixture().env('07', 'P12'), 'bnk_N', 'chr_P', 1_000_000_000_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(simple(e)).toEqual([
      'Dr chr_P:1010:bnk_N:FDL / Cr bnk_N:2100:chr_P:FDL 1000000000000',
      'Dr bnk_N:1300:loan_1:FDL / Cr chr_P:2200:loan_1:FDL 1000000000000',
    ]);
    expect(isBalancedPerEntity(e.postings)).toBe(true);
  });
  it('03#9 deposit-to-deposit across two banks: exactly 4 rail postings, reserves X −40 / Y +40, I5 and I6 hold', () => {
    const w = fixture();
    w.setRail('chr_A', { payFrom: { kind: 'BANK', bankId: 'bnk_X' } });
    w.setRail('chr_B', { receiveInto: { kind: 'BANK', bankId: 'bnk_Y' } });
    const e = tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 40_000_000n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(simple(e).slice(0, 4)).toEqual([
      'Dr bnk_X:2100:chr_A:FDL / Cr chr_A:1010:bnk_X:FDL 40000000',
      'Dr bnk_Y:1002:FDL / Cr bnk_X:1002:FDL 40000000',
      'Dr cbk_FDL:2002:bnk_X:FDL / Cr cbk_FDL:2002:bnk_Y:FDL 40000000',
      'Dr chr_B:1010:bnk_Y:FDL / Cr bnk_Y:2100:chr_B:FDL 40000000',
    ]);
    expect(e.postings.length).toBe(5); // + the value leg
    // fixture balances: A $100 at X (X reserves $100), then apply
    const a = new SortedMap<string, { balance: bigint; qty: bigint }>();
    for (const p of [
      { debitAccount: 'chr_A:1010:bnk_X:FDL', creditAccount: 'bnk_X:2100:chr_A:FDL', amount: 100_000_000n },
      { debitAccount: 'bnk_X:1002:FDL', creditAccount: 'cbk_FDL:2002:bnk_X:FDL', amount: 100_000_000n },
      ...e.postings]) applyPosting(a, p);
    const b = (k: string): bigint => a.get(k)?.balance ?? 0n;
    expect(b('bnk_X:1002:FDL')).toBe(60_000_000n);
    expect(b('bnk_Y:1002:FDL')).toBe(40_000_000n);
    const holders = b('bnk_X:1002:FDL') + b('bnk_Y:1002:FDL');
    const cb = b('cbk_FDL:2002:bnk_X:FDL') + b('cbk_FDL:2002:bnk_Y:FDL');
    expect(cb + holders).toBe(0n); // I5
    expect(b('bnk_X:2100:chr_A:FDL') + b('chr_A:1010:bnk_X:FDL')).toBe(0n); // I6 at X
    expect(b('bnk_Y:2100:chr_B:FDL') + b('chr_B:1010:bnk_Y:FDL')).toBe(0n); // I6 at Y
  });
  it('03#8 FX keeps each entity balanced per currency through 3800; 10% mark move = 10% of the foreign leg', () => {
    const w = fixture();
    const e = w.apiFor('03').ledger.entryOf(w.apiFor('03').ledger.fx('chr_A', 'chr_B', 'EUN', 1_000_000_000n, 'FDL', 1_100_000_000n, 'LED_FX_CONVERSION')) as Entry;
    expect(isBalancedPerEntity(e.postings)).toBe(true);
    const a = new SortedMap<string, { balance: bigint; qty: bigint }>();
    for (const p of e.postings) applyPosting(a, p);
    const eun = a.get(K('chr_A', 3800, 'EUN'))?.balance as bigint; const fdl = a.get(K('chr_A', 3800, 'FDL'))?.balance as bigint;
    expect(eun).toBe(1_000_000_000n);
    expect(fdl).toBe(-1_100_000_000n);
    const translate = (rateE6: bigint): bigint => (eun * rateE6) / 1_000_000n + fdl;
    expect(translate(1_100_000n)).toBe(0n);
    expect(-translate(1_210_000n)).toBe(-110_000_000n); // A's FX result (short EUN)
    expect(110_000_000n * 10n).toBe(1_100_000_000n); // = 10% of the foreign leg
    expect(e.postings.filter((p) => p.flowLeg).map((p) => p.ccy).sort()).toEqual(['EUN', 'FDL']);
  });
  it('prologue: unknown code, alias, wrong template and wrong owner give invalid entries', () => {
    const w = fixture();
    expect(tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 1n, 'FDL', 'NOT_A_CODE').invalid?.invariantId).toBe('INV-LED-002');
    expect(tplPay(w.env('12', 'P12'), 'chr_A', 'chr_B', 1n, 'FDL', 'OPS_RANSOM').invalid?.observed).toBe('alias=OPS_RANSOM');
    expect(tplPay(w.env('14', 'P12'), 'chr_A', 'chr_B', 1n, 'FDL', 'ACCT_START_CASH').invalid?.observed).toBe('template PAY');
    expect(tplMint(w.env('09', 'P12'), 'chr_A', 1n, 'FDL', 'ACCT_START_CASH').invalid?.observed).toBe('module 09');
    expect(tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 0n, 'FDL', 'ADM_CORRECTION_TRANSFER').invalid?.invariantId).toBe('INV-LED-007');
    expect(tplPay(w.env('21', 'P12'), 'chr_A', 'chr_Z', 1n, 'FDL', 'ADM_CORRECTION_TRANSFER').invalid?.invariantId).toBe('INV-LED-026'); // E-15.2: unknown_entity is INV-LED-026 (was 007)
  });
  it('negative ACCRUE swaps sides (03 §8 edge 18)', () => {
    const e = tplAccrue(fixture().env('03', 'P13'), 'chr_P', -5n, 'FDL', 'LED_MTM_DAILY', 1500, 4070);
    expect(simple(e)).toEqual(['Dr chr_P:4070:FDL / Cr chr_P:1500:FDL 5']);
  });
  it('template purity (p10 stakes.ts:139 / failure.ts:286 port): builders return plain data, no closures (E3)', () => {
    const w = fixture();
    const e = tplMint(w.env('14', 'P12'), 'chr_P', 1n, 'FDL', 'ACCT_START_CASH');
    const walk = (x: unknown): void => {
      expect(typeof x).not.toBe('function');
      if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v);
    };
    walk(e);
    expect(w.balance('chr_P:1001:FDL')).toBe(0n); // nothing applied by building
  });
});
