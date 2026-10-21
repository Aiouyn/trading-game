// Negative and positive tests per invariant (INV-LED-001..015). Each builds a real entry with the templates, then tampers.
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { SortedMap, type CheckView, type Entry, type Posting } from '../src';
import { fixture } from './fixture';

type Acc = SortedMap<string, { balance: bigint; qty: bigint }>;
const accs = (rows: [string, bigint, bigint?][] = []): Acc => new SortedMap(rows.map(([k, b, q]) => [k, { balance: b, qty: q ?? 0n }]));
function applied(pre: Acc, entries: readonly Entry[]): Acc {
  const a = new SortedMap(pre.entries().map(([k, v]) => [k, { ...v }]));
  for (const e of entries) for (const p of e.postings) L.applyPosting(a, p);
  return a;
}
function view(entries: Entry[], o: Partial<CheckView> & { preRows?: [string, bigint, bigint?][] } = {}): CheckView {
  const w = fixture();
  const pre = o.pre ?? accs(o.preRows);
  const post = o.post ?? applied(pre, entries);
  return {
    tick: 10, isDayClose: false, catalog: w.catalog, entries, pre, post, entity: w.entity,
    facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n }, alarm: { mult: 10, floorMicro: 1_000_000_000_000n },
    ...o,
    flows: o.flows ?? L.tickFlowsOf(entries, w.catalog, 10, (c) => L.computeM0sys(post, c) - L.computeM0sys(pre, c)),
  };
}
const env = (mod: string) => fixture().env(mod, 'P12');
const ids = (f: L.Failure[]) => f.map((x) => x.invariantId);
const mint = (amt = 100n) => L.tplMint(env('21'), 'chr_A', amt, 'FDL', 'ADM_CORRECTION_IN');
const pay = (amt = 10n) => L.tplPay(env('21'), 'chr_A', 'chr_B', amt, 'FDL', 'ADM_CORRECTION_TRANSFER');
const withPostings = (e: Entry, f: (p: Posting[]) => Posting[]): Entry => ({ ...e, postings: f(e.postings.map((p) => ({ ...p }))) });

describe('INV-LED-001 double entry (I2, I8)', () => {
  it('a balanced mint passes; one posting off by 1 micro fails I2', () => {
    expect(L.INV_LED_001(view([mint()]))).toEqual([]);
    const bad = withPostings(mint(), (ps) => { ps[2].amount = 99n; return ps; });
    expect(L.INV_LED_001(view([bad]))[0].observed).toMatch(/^I2:/);
  });
  it('qty created from nothing fails I8', () => {
    const e = L.tplAccrue(env('03'), 'chr_A', 5n, 'FDL', 'LED_MTM_DAILY', 1500, 4060, { sub: 'ast_X' });
    const post = applied(accs(), [e]); post.set('chr_A:1500:ast_X:FDL', { balance: 5n, qty: 3n });
    expect(L.INV_LED_001(view([e], { post }))[0].observed).toMatch(/^I8:/);
  });
});

describe('INV-LED-002 reason codes', () => {
  it('unknown reason, alias and wrong template fail; MINT and a composed MKT_TRADE + TAX_SECURITIES_TX pass', () => {
    const r = (e: Entry) => L.INV_LED_002(view([e])).map((x) => x.observed);
    expect(r(withPostings(mint(), (ps) => { ps[0].reason = 'NOT_A_CODE'; return ps; }))).toContain('I1: unknown reason NOT_A_CODE');
    expect(r(withPostings(mint(), (ps) => { ps[0].reason = 'OPS_RANSOM'; return ps; }))).toContain('I1: alias=OPS_RANSOM');
    expect(r({ ...mint(), template: 'PAY' })[0]).toMatch(/template PAY/);
    expect(r(mint())).toEqual([]);
    const trade = L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 });
    const tax = L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX');
    expect(r(L.composeEntries(env('05'), trade, [tax]))).toEqual([]);
  });
});

describe('INV-LED-003 M0_sys = Σ FAUCET − Σ SINK (I4, I17)', () => {
  it('a mint passes; a TRANSFER posting that moves cbk 1910 fails I4', () => {
    expect(L.INV_LED_003(view([mint()]))).toEqual([]);
    const bad = withPostings(pay(), (ps) => [...ps, { ...ps[0], postingSeq: ps.length, debitAccount: 'cbk_FDL:1910:FDL', creditAccount: 'sys_SYSTEM:2900:FDL' }]);
    expect(L.INV_LED_003(view([bad])).map((x) => x.observed.slice(0, 3))).toContain('I4:');
  });
  it('I17 fails when sys 2900 and cbk 1910 disagree with net issuance', () => {
    const e = mint(); const post = applied(accs(), [e]); post.set('sys_SYSTEM:5900:ADM_CORRECTION_IN:FDL', { balance: 1n, qty: 0n });
    expect(L.INV_LED_003(view([e], { post })).some((x) => x.observed.startsWith('I17'))).toBe(true);
  });
});

describe('INV-LED-004 M0_cb and M2 (I4, card reading A-1)', () => {
  it('a REVALUE posting that moves M2 fails; LEND passes; a non-cbk TRANSFER that moves M0 fails', () => {
    const bad = withPostings(L.tplAccrue(env('03'), 'chr_A', 5n, 'FDL', 'LED_MTM_DAILY', 1500, 4060), (ps) => { ps[0].debitAccount = 'chr_A:1001:FDL'; return ps; });
    expect(L.INV_LED_004(view([bad])).map((x) => x.observed)).toContain('I4: REVALUE LED_MTM_DAILY moves M2 by 5');
    expect(L.INV_LED_004(view([L.tplLend(env('07'), 'bnk_N', 'chr_P', 50n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'ln')]))).toEqual([]);
    const forged = withPostings(pay(), (ps) => [{ ...ps[0], debitAccount: 'chr_B:1001:FDL', creditAccount: 'cbk_FDL:2001:chr_B:FDL' }, { ...ps[ps.length - 1], postingSeq: 1, debitAccount: 'chr_B:5000:FDL' }]);
    expect(L.INV_LED_004(view([forged])).some((x) => /moves M0_cb/.test(x.observed))).toBe(true);
  });
  it('cbCredit to a bank passes (M0_cb = credit)', () => {
    expect(L.INV_LED_004(view([L.tplCbCredit(env('04'), 'cbk_FDL', 'bnk_N', 9n, 'FDL', 'CBK_STANDING_FACILITY')]))).toEqual([]);
  });
});

describe('INV-LED-005 / 006 / 007', () => {
  it('005: a TRANSFER posting to sys:2900 fails; a plain pay passes', () => {
    expect(L.INV_LED_005(view([pay()]))).toEqual([]);
    const bad = withPostings(pay(), (ps) => { ps[ps.length - 1].creditAccount = 'sys_SYSTEM:2900:FDL'; return ps; });
    expect(ids(L.INV_LED_005(view([bad])))).toEqual(['INV-LED-005']);
  });
  it('006: LED_MTM_DAILY on 1001 fails; LED_RECLASS RESTRICTED -> 1001 passes', () => {
    const bad = L.tplAccrue(env('03'), 'chr_A', 5n, 'FDL', 'LED_MTM_DAILY', 1001, 4060);
    expect(ids(L.INV_LED_006(view([bad])))).toContain('INV-LED-006');
    const ok = L.reclassKeys(env('03'), 'LED_RECLASS', 'chr_A:1001:RESTRICTED:5:AD_GRANT:FDL', 'chr_A:1001:FDL', 5n, 'FDL');
    expect(L.INV_LED_006(view([ok]))).toEqual([]);
  });
  it('007: amount 0n fails; a bad key fails; a ccy mismatch fails; a valid entry passes', () => {
    expect(L.INV_LED_007(view([pay()]))).toEqual([]);
    expect(ids(L.INV_LED_007(view([withPostings(pay(), (ps) => { ps[0].amount = 0n; return ps; })], { post: accs() })))).toContain('INV-LED-007');
    expect(ids(L.INV_LED_007(view([withPostings(pay(), (ps) => { ps[0].debitAccount = 'chr_B:1001'; return ps; })], { post: accs() })))).toContain('INV-LED-007');
    expect(ids(L.INV_LED_007(view([withPostings(pay(), (ps) => { ps[0].debitAccount = 'chr_B:1001:EUN'; return ps; })], { post: accs() })))).toContain('INV-LED-007');
  });
});

describe('INV-LED-008 negative money (I9, I10) and E5 (p10 core.ts:176 port)', () => {
  it('chr 1001 at −1 fails; within a recorded overdraft passes; bank reserves within the intraday limit pass intraday, fail at day close', () => {
    expect(ids(L.INV_LED_008(view([], { post: accs([['chr_A:1001:FDL', -1n]]) })))).toEqual(['INV-LED-008']);
    expect(L.INV_LED_008(view([], { post: accs([['chr_A:1001:FDL', -1n]]), facts: { overdraftLimit: () => 5n, intradayLimit: () => 0n } }))).toEqual([]);
    const f = { overdraftLimit: () => 0n, intradayLimit: () => 100n };
    expect(L.INV_LED_008(view([], { post: accs([['bnk_N:1002:FDL', -50n]]), facts: f }))).toEqual([]);
    expect(ids(L.INV_LED_008(view([], { post: accs([['bnk_N:1002:FDL', -50n]]), facts: f, isDayClose: true })))).toEqual(['INV-LED-008']);
  });
  it('a transfer above available fails at placeCash; posted without a hold it aborts the tick', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', 20n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13();
    expect(w.apiFor('21').holds.placeCash('chr_A', 'FDL', 50n, w.tick + 1, 'r')).toEqual({ code: 'LED_INSUFFICIENT_FUNDS' });
    w.apiFor('21').ledger.pay('chr_A', 'chr_B', 50n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const r = w.runP13();
    expect(r.failedInvariants).toEqual(['INV-LED-008']);
    expect(w.balance('chr_A:1001:FDL')).toBe(20n);
  });
});

describe('INV-LED-009 writes outside the ledger writer', () => {
  it('a balance written directly into committed state fails the next P13', () => {
    const w = fixture();
    w.testHooks().accounts.set('chr_A:1001:FDL', { balance: 1_000n, qty: 0n });
    const r = w.runP13();
    expect(r.failedInvariants).toContain('INV-LED-009');
    expect(r.safeMode).toBe(true);
  });
});

describe('INV-LED-010 / 011 day close', () => {
  it('010: balanced state passes; a broken trial balance, suspense, cbk mirror or deposit mirror fails', () => {
    const e = [mint(), L.tplLend(env('07'), 'bnk_N', 'chr_P', 50n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'ln')];
    expect(L.INV_LED_010(view(e, { isDayClose: true }))).toEqual([]);
    expect(L.INV_LED_010(view(e, { isDayClose: false, post: accs([['chr_A:1001:FDL', 1n]]) }))).toEqual([]); // DAY_CLOSE only
    const obs = (rows: [string, bigint][]) => L.INV_LED_010(view([], { isDayClose: true, post: accs(rows) })).map((x) => x.observed.slice(0, 3));
    expect(obs([['chr_A:1001:FDL', 1n]])).toEqual(expect.arrayContaining(['I3:', 'I5:']));
    expect(obs([['sys_SYSTEM:1999:FDL', 1n], ['sys_SYSTEM:2999:FDL', -1n]])).toEqual(['I15', 'I15']);
    expect(obs([['chr_A:1010:bnk_N:FDL', 5n], ['bnk_N:2100:chr_A:FDL', -4n], ['bnk_N:4000:FDL', -1n]])).toEqual(['I6:']);
  });
  it('011 (ALERT): a code above mult × max(28-day mean, floor) alerts; below does not', () => {
    const v = (total: bigint, hist: bigint[]) => view([], {
      isDayClose: true, todayByCode: (c) => new SortedMap(c === 'FDL' ? [['ACCT_START_CASH', total]] : []), dayHistory: () => hist,
    });
    expect(L.INV_LED_011(v(10_000_000_000_000n, []))).toEqual([]);
    const f = L.INV_LED_011(v(10_000_000_000_001n, []));
    expect(f.map((x) => [x.invariantId, x.severity])).toEqual([['INV-LED-011', 'ALERT']]);
    expect(L.INV_LED_011(v(20_000_000_000_000n, [2_000_000_000_000n]))).toEqual([]);
  });
  it('011 end-to-end: an alert is recorded and does not abort the day', () => {
    const w = fixture();
    w.apiFor('14').ledger.mint('chr_P', 11_000_000_000_000_000n, 'FDL', 'ACCT_START_CASH');
    const r = w.runTicks(720).at(-1)!;
    expect(r.safeMode).toBe(false);
    expect(w.alerts.map((a) => a.invariantId)).toEqual(['INV-LED-011']);
  });
});

describe('INV-LED-012 / 013 / 014 / 015', () => {
  it('012: a non-bigint amount or balance fails', () => {
    const bad = withPostings(pay(), (ps) => { (ps[0] as { amount: unknown }).amount = 1.5; return ps; });
    expect(ids(L.INV_LED_012(view([bad], { post: accs(), flows: new SortedMap() })))).toEqual(['INV-LED-012']);
    expect(ids(L.INV_LED_012(view([], { post: new SortedMap([['chr_A:1001:FDL', { balance: 1 as unknown as bigint, qty: 0n }]]) })))).toEqual(['INV-LED-012']);
  });
  it('012 end-to-end: a float amount in the queue aborts the tick with INV-LED-012 (nothing applied)', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', 100n, 'FDL', 'ADM_CORRECTION_IN');
    (w.testHooks().queue[0].postings[0] as { amount: unknown }).amount = 100.5;
    const r = w.runP13();
    expect(r.failedInvariants).toEqual(['INV-LED-012']);
    expect(w.accounts()).toEqual([]);
  });
  it('013: snapshot() checks balances = fold of the postings archive; foldBalances matches after a run', () => {
    const w = fixture();
    w.apiFor('21').ledger.mint('chr_A', 100n, 'FDL', 'ADM_CORRECTION_IN'); w.apiFor('21').ledger.pay('chr_A', 'chr_B', 40n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    w.runP13();
    expect(() => w.snapshot()).not.toThrow();
    expect(L.foldBalances(w.entryLog()).get('chr_B:1001:FDL')?.balance).toBe(40n);
    w.testHooks().accounts.set('chr_B:1001:FDL', { balance: 41n, qty: 0n });
    expect(() => w.snapshot()).toThrow(/INV-LED-013/);
  });
  it('014: SOC_P2P_TRANSFER out of a restricted sub fails; a later lot consumed before an earlier one fails; BIZ_PURCHASE_NEW passes', () => {
    const lot1 = 'chr_A:1001:RESTRICTED:100:AD_GRANT:FDL'; const lot2 = 'chr_A:1001:RESTRICTED:200:AD_GRANT:FDL';
    const pre: [string, bigint][] = [[lot1, 50n], [lot2, 50n]];
    const p2p = L.tplPay(env('15'), 'chr_A', 'chr_B', 10n, 'FDL', 'SOC_P2P_TRANSFER', { fixedSources: [{ accountKey: lot1, amount: 10n }] });
    expect(L.INV_LED_014(view([p2p], { preRows: pre })).map((x) => x.observed)).toEqual([`I21: SOC_P2P_TRANSFER spends ${lot1} at tick 10`]);
    const fifo = L.tplElasticOut(env('09'), 'chr_A', 'frm_FDL', 10n, 'FDL', 'BIZ_PURCHASE_NEW', { fixedSources: [{ accountKey: lot2, amount: 10n }] });
    expect(L.INV_LED_014(view([fifo], { preRows: pre }))[0].observed).toMatch(/spent before earlier lot/);
    const ok = L.tplElasticOut(env('09'), 'chr_A', 'frm_FDL', 60n, 'FDL', 'BIZ_PURCHASE_NEW', { fixedSources: [{ accountKey: lot1, amount: 50n }, { accountKey: lot2, amount: 10n }] });
    expect(L.INV_LED_014(view([ok], { preRows: pre }))).toEqual([]);
  });
  it('015: a leg with two flowLeg postings or none fails (a); the flowLeg of a FAUCET leg must be the issuance posting (c)', () => {
    expect(L.INV_LED_015(view([mint()]))).toEqual([]);
    const two = withPostings(mint(), (ps) => { ps[0].flowLeg = true; return ps; });
    expect(L.INV_LED_015(view([two], { flows: view([mint()]).flows })).map((x) => x.observed.slice(0, 3))).toContain('(a)');
    const none = withPostings(pay(), (ps) => ps.map((p) => { delete p.flowLeg; return p; }));
    expect(L.INV_LED_015(view([none])).map((x) => x.observed.slice(0, 3))).toContain('(a)');
    const moved = withPostings(mint(), (ps) => { delete ps[1].flowLeg; ps[0].flowLeg = true; return ps; });
    expect(L.INV_LED_015(view([moved])).map((x) => x.observed.slice(0, 3))).toContain('(c)');
  });
  it('015 (d): a TRANSFER-only tick has byClass.FAUCET === byClass.SINK === 0n', () => {
    const f = view([pay(), pay(3n)]).flows.get('FDL')!;
    expect([f.byClass.get('FAUCET'), f.byClass.get('SINK'), f.byClass.get('TRANSFER')]).toEqual([0n, 0n, 13n]);
  });
});
