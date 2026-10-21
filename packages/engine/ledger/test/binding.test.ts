// Binding V3 03 §10 acceptance tests in scope (card texts in /workspace/specs/ledger-ref/binding-tests.md).
import { describe, expect, it } from 'vitest';
import { isReject, RESTRICTED_WINDOW_TICKS, type Hold } from '../src';
import { cashKey, fixture } from './fixture';


describe('V3 03 §10 binding tests', () => {
  it('03#2 MINT $5,000 raises M0_sys, M0, M2, PEM and net issuance by exactly 5,000,000,000; chr, cbk, sys balance (I2)', () => {
    const w = fixture();
    const a0 = w.aggregates('FDL');
    w.apiFor('14').ledger.mint('chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH');
    const r = w.runP13();
    expect(r.failures).toEqual([]);
    const a1 = w.aggregates('FDL');
    for (const k of ['M0_sys', 'M0', 'M2', 'PEM'] as const) expect(a1[k] - a0[k]).toBe(5_000_000_000n);
    let sysNi = 0n;
    for (const [k, b] of w.accounts()) if (/^sys_SYSTEM:(3990|4900|5900)/.test(k)) sysNi += b.balance;
    expect(sysNi).toBe(5_000_000_000n);
    for (const id of ['chr_P', 'cbk_FDL', 'sys_SYSTEM']) {
      let s = 0n; for (const [k, b] of w.accounts()) if (k.startsWith(`${id}:`) && !k.split(':')[1].startsWith('9')) s += b.balance;
      expect(s).toBe(0n);
    }
  });

  it('03#4 PAY $50 from a player to an NPC company changes only PEM (−50,000,000)', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_P', 100_000_000n, 'FDL', 'ADM_CORRECTION_IN');
    w.runP13();
    const a0 = w.aggregates('FDL');
    w.apiFor('21').ledger.pay('chr_P', 'cmp_N', 50_000_000n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(w.runP13().failures).toEqual([]);
    const a1 = w.aggregates('FDL');
    expect(a1.PEM - a0.PEM).toBe(-50_000_000n);
    expect([a1.M0 - a0.M0, a1.M0_sys - a0.M0_sys, a1.M2 - a0.M2]).toEqual([0n, 0n, 0n]);
  });

  it('03#5 bank loan of $1M raises M2 and leaves M0, M0_sys and both book NWs unchanged', () => {
    const w = fixture();
    const a0 = w.aggregates('FDL'); const nw = [w.netWorth('chr_P'), w.netWorth('bnk_N')];
    w.apiFor('07').ledger.lend('bnk_N', 'chr_P', 1_000_000_000_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(w.runP13().failures).toEqual([]);
    const a1 = w.aggregates('FDL');
    expect(a1.M2 - a0.M2).toBe(1_000_000_000_000n);
    expect([a1.M0 - a0.M0, a1.M0_sys - a0.M0_sys]).toEqual([0n, 0n]);
    expect([w.netWorth('chr_P'), w.netWorth('bnk_N')]).toEqual(nw);
  });

  it('03#6 repayment restores M2; interest from the deposit at the lending bank lowers M2 and shows as own-account flow', () => {
    const w = fixture();
    w.setRail('chr_P', { payFrom: { kind: 'BANK', bankId: 'bnk_N' }, receiveInto: { kind: 'BANK', bankId: 'bnk_N' } });
    w.apiFor('14').ledger.mint('chr_P', 10_000_000_000n, 'FDL', 'ACCT_START_CASH');
    w.apiFor('07').ledger.lend('bnk_N', 'chr_P', 1_000_000_000_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(w.runP13().failures).toEqual([]);
    const m2a = w.aggregates('FDL').M2;
    w.apiFor('07').ledger.repay('chr_P', 'bnk_N', 1_000_000_000_000n, 'FDL', 'BNK_LOAN_REPAY', 'loan_1');
    expect(w.runP13().failures).toEqual([]);
    const m2b = w.aggregates('FDL').M2;
    expect(m2b - m2a).toBe(-1_000_000_000_000n);
    const own0 = w.ownAccountToday('FDL');
    w.apiFor('07').ledger.pay('chr_P', 'bnk_N', 5_000_000_000n, 'FDL', 'BNK_LOAN_INTEREST');
    expect(w.runP13().failures).toEqual([]); // INV-LED-003/004 pass on every tick
    expect(w.aggregates('FDL').M2 - m2b).toBe(-5_000_000_000n);
    expect(w.ownAccountToday('FDL') - own0).toBe(-5_000_000_000n);
  });

  it('03#7 QE purchase of $10M of bonds from a player fund raises M0_cb by $10M; M0_sys unchanged; PEM +$10M; fund NW unchanged', () => {
    const w = fixture();
    const L = w.apiFor('04').ledger;
    L.mint('fnd_F', 10_000_000_000_000n, 'FDL', 'MAC_GENESIS_ENDOWMENT');
    w.runP13();
    w.apiFor('04').ledger.swapAsset('fnd_F', 'gov_FDL', 'ast_BOND_X', 1000n, 10_000_000_000_000n, 'FDL', 'SOV_BOND_ISSUE', { assetAcct: 1520 }); // gov issues the bond (E-15.1: not MKT_TRADE)
    expect(w.runP13().failures).toEqual([]);
    const a0 = w.aggregates('FDL'); const nw0 = w.netWorth('fnd_F');
    L.cbCredit('cbk_FDL', 'fnd_F', 10_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 1000n, assetId: 'ast_BOND_X', assetAcct: 1520 });
    expect(w.runP13().failures).toEqual([]);
    const a1 = w.aggregates('FDL');
    expect(a1.M0_cb - a0.M0_cb).toBe(10_000_000_000_000n);
    expect(a1.M0_sys - a0.M0_sys).toBe(0n);
    expect(a1.PEM - a0.PEM).toBe(10_000_000_000_000n);
    expect(w.netWorth('fnd_F')).toBe(nw0);
    expect(w.position('cbk_FDL', 'ast_BOND_X')).toBe(1000n);
  });

  describe('03#32 restricted cash (T03-12, INV-LED-014)', () => {
    const setup = () => {
      const w = fixture();
      const t = w.tick;
      w.apiFor('21').ledger.mint('chr_P', 250_000_000n, 'FDL', 'ACCT_REWARDED_AD');
      expect(w.runP13().failures).toEqual([]);
      return { w, t, lot: `chr_P:1001:RESTRICTED:${t + RESTRICTED_WINDOW_TICKS}:AD_GRANT:FDL` };
    };
    it('a rewarded-ad credit cannot pay an op cost but can buy a T1 business', () => {
      const { w, t, lot } = setup();
      expect(w.balance(lot)).toBe(250_000_000n);
      expect(w.balance(cashKey('chr_P'))).toBe(0n);
      const H = w.apiFor('09').holds;
      expect(H.placeCashFor('chr_P', 'FDL', 100_000_000n, t + 1, 'ref_1', 'OPS_COST_NPC')).toEqual({ code: 'LED_RESTRICTED_FUNDS' });
      const holdId = H.placeCashFor('chr_P', 'FDL', 200_000_000n, t + 1, 'ref_2', 'BIZ_PURCHASE_NEW');
      expect(isReject(holdId)).toBe(false);
      w.apiFor('09').ledger.elasticOut('chr_P', 'frm_FDL', 200_000_000n, 'FDL', 'BIZ_PURCHASE_NEW', { holdId: holdId as string, valueLegA: 1580 });
      expect(w.runP13().failures).toEqual([]);
      expect(w.balance(lot)).toBe(50_000_000n);
      expect((H.get(holdId as string) as Hold).status).toBe('SETTLED');
    });
    it('release: after the window the remainder sits in unrestricted 1001 with one LED_RECLASS posting', () => {
      const { w, lot } = setup();
      w.runTicks(RESTRICTED_WINDOW_TICKS);
      expect(w.balance(lot)).toBe(0n);
      expect(w.balance(cashKey('chr_P'))).toBe(250_000_000n);
      expect(w.entryLog().filter((e) => e.reason === 'LED_RECLASS').map((e) => e.postings.length)).toEqual([1]);
    });
    it('FIFO: two lots, spend $300 of $250 + $250 -> lot1 0, lot2 200', () => {
      const { w, lot } = setup();
      w.apiFor('21').ledger.mint('chr_P', 250_000_000n, 'FDL', 'ACCT_REWARDED_AD');
      w.runP13();
      w.apiFor('09').ledger.elasticOut('chr_P', 'frm_FDL', 300_000_000n, 'FDL', 'BIZ_PURCHASE_NEW', { valueLegA: 1580 });
      expect(w.runP13().failures).toEqual([]);
      const lot2 = lot.replace(`${RESTRICTED_WINDOW_TICKS}`, `${RESTRICTED_WINDOW_TICKS + 1}`);
      expect([w.balance(lot), w.balance(lot2)]).toEqual([0n, 200_000_000n]);
    });
    it('edge 12: a fine with only restricted cash is rejected; availableFor includes restricted, available does not', () => {
      const { w, t } = setup();
      expect(w.apiFor('13').holds.placeCashFor('chr_P', 'FDL', 10_000_000n, t + 1, 'r', 'LAW_FINE_SINK')).toEqual({ code: 'LED_RESTRICTED_FUNDS' });
      expect(w.availableFor('chr_P', 'FDL', 'LIFE_PURCHASE')).toBe(250_000_000n);
      expect(w.available('chr_P', 'FDL')).toBe(0n);
    });
  });

  it('03#38 corrupting one posting amount aborts the tick (INV-LED-001) and nothing of that tick is visible', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', 100_000_000n, 'FDL', 'ADM_CORRECTION_IN');
    w.runP13();
    const before = w.accounts(); const logLen = w.entryLog().length;
    const id = w.apiFor('21').ledger.pay('chr_A', 'chr_B', 10_000_000n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const q = w.testHooks().queue; const e = q[q.length - 1];
    e.postings[e.postings.length - 1].amount = 9_999_999n; // test-only mutation
    const r = w.runP13();
    expect(r.committed).toBe(true);
    expect(r.safeMode).toBe(true);
    expect(r.failedInvariants).toContain('INV-LED-001');
    expect(w.accounts()).toEqual(before);
    expect(w.entryLog().length).toBe(logLen);
    expect(w.entryLog().some((x) => x.entryId === id)).toBe(false);
  });
});
