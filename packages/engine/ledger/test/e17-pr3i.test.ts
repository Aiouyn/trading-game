// E-17 INV-LED-027 reserve-follows-deposit (tests 1-7) and QA pr3i: structured I6 pair key, INV-LED-026 on deposit subs, two-step forge.
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { SortedMap, type CheckView, type Entry, type Posting } from '../src';
import { fixture } from './fixture';

type Acc = SortedMap<string, { balance: bigint; qty: bigint }>;
function applied(entries: readonly Entry[], pre: Acc = new SortedMap()): Acc {
  const a = new SortedMap(pre.entries().map(([k, v]) => [k, { ...v }]));
  for (const e of entries) for (const p of e.postings) L.applyPosting(a, p);
  return a;
}
function view(entries: Entry[], post?: Acc): CheckView {
  const w = fixture(); const pre: Acc = new SortedMap(); const p = post ?? applied(entries);
  return {
    tick: 10, isDayClose: false, catalog: w.catalog, entries, pre, post: p, entity: w.entity,
    facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n }, alarm: { mult: 10, floorMicro: 1_000_000_000_000n },
    flows: L.tickFlowsOf(entries, w.catalog, 10, (c) => L.computeM0sys(p, c) - L.computeM0sys(pre, c)),
  };
}
const env = (mod: string) => fixture().env(mod, 'P12');
const obs = (f: L.Failure[], id: string) => f.filter((x) => x.invariantId === id).map((x) => x.observed);
const extra = (e: Entry, p: Partial<Posting>): Entry => ({ ...e, postings: [...e.postings, { ...e.postings[0], postingSeq: e.postings.length, flowLeg: undefined, ...p }] });

const bankRail = (w: L.LedgerWorld, id: string, bankId: string) => w.setRail(id, { payFrom: { kind: 'BANK', bankId }, receiveInto: { kind: 'BANK', bankId } });
const pay = (bA: string, bB: string) => { const w = fixture(); bankRail(w, 'chr_A', bA); bankRail(w, 'chr_B', bB); return L.tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 7n, 'FDL', 'ADM_CORRECTION_TRANSFER'); };
const legs = (e: Entry) => e.postings.map((p) => `${p.debitAccount}<${p.creditAccount}:${p.amount}`);
const I27 = (e: Entry) => obs(L.INV_LED_027(view([e])), 'INV-LED-027');

describe('E-17 INV-LED-027 (L28) reserve-follows-deposit', () => {
  it('1: chr_A at bnk_X pays chr_B at bnk_Y 7: 2100 −7/+7, 1002 −7/+7, cbk 2002 mirror; passes; it is a TICK invariant', () => {
    const e = pay('bnk_X', 'bnk_Y');
    expect(legs(e)).toEqual(['bnk_X:2100:chr_A:FDL<chr_A:1010:bnk_X:FDL:7', 'bnk_Y:1002:FDL<bnk_X:1002:FDL:7',
      'cbk_FDL:2002:bnk_X:FDL<cbk_FDL:2002:bnk_Y:FDL:7', 'chr_B:1010:bnk_Y:FDL<bnk_Y:2100:chr_B:FDL:7', 'chr_A:5190:FDL<chr_B:4190:FDL:7']);
    expect(I27(e)).toEqual([]);
    expect(L.TICK_INVARIANTS.some(([id, c]) => id === 'INV-LED-027' && c === L.INV_LED_027)).toBe(true);
  });
  it('2 (QA I1): the same payment with the 1002 legs dropped fails at the tick', () => {
    const e = pay('bnk_X', 'bnk_Y'); const d = { ...e, postings: e.postings.filter((p) => !/:100[2]:|:2002:/.test(p.debitAccount)) };
    expect(I27(d)).toEqual([`${e.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `${e.entryId} ADM_CORRECTION_TRANSFER bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('3: 1002 moved for the wrong amount (−7 / +6) fails', () => {
    const e = pay('bnk_X', 'bnk_Y');
    const d = { ...e, postings: e.postings.map((p) => (p.debitAccount === 'bnk_Y:1002:FDL' ? { ...p, amount: 6n } : p)) };
    const o = I27(d); expect(o).toContain(`${e.entryId} ADM_CORRECTION_TRANSFER bnk_Y Δ1002 6 vs Δ2100 7 (FDL)`);
  });
  it('4: a same-bank payment has no 1002 legs and passes; a stray 1002 leg (with its cbk mirror) fails', () => {
    const e = pay('bnk_X', 'bnk_X'); expect(legs(e).some((l) => l.includes(':1002:'))).toBe(false); expect(I27(e)).toEqual([]);
    const s = extra(e, { debitAccount: 'bnk_X:1002:FDL', creditAccount: 'cbk_FDL:2002:bnk_X:FDL', amount: 3n });
    expect(I27(s)).toEqual([`${e.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 3 vs Δ2100 0 (FDL)`]);
  });
  it('4b: reserves created against a matching deposit with no cbk 2002 mirror pass the per-bank rule and fail the Σ rule', () => {
    const e = pay('bnk_X', 'bnk_Y');
    const d = extra(e, { debitAccount: 'bnk_X:1002:FDL', creditAccount: 'bnk_X:2100:chr_A:FDL', amount: 3n });
    expect(I27(d)).toEqual([`${e.entryId} ADM_CORRECTION_TRANSFER ΣΔ1002 3 vs cbk 2002 mirror 0 (FDL)`]);
  });
  it('5: a LEND from bnk_Y to chr_B (+2100, no reserve move) is exempt (CREDIT_CREATE)', () => {
    const w = fixture(); bankRail(w, 'chr_B', 'bnk_Y');
    const e = L.tplLend(w.env('07', 'P12'), 'bnk_Y', 'chr_B', 7n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(e.invalid).toBeUndefined(); expect(e.postings.some((p) => p.creditAccount.startsWith('bnk_Y:2100'))).toBe(true); expect(I27(e)).toEqual([]);
  });
  it('6: a bnk_X fee (BNK_LOAN_FEE) charged to chr_A (2100 −f, 4xxx +f) is exempt (the bank is payee); the same legs under a non-listed code fail', () => {
    const w = fixture(); bankRail(w, 'chr_A', 'bnk_X');
    const fee = L.tplPay(w.env('07', 'P12'), 'chr_A', 'bnk_X', 5n, 'FDL', 'BNK_LOAN_FEE');
    expect(fee.invalid).toBeUndefined(); expect(legs(fee).some((l) => l.startsWith('bnk_X:2100:chr_A:FDL<'))).toBe(true);
    expect(I27(fee)).toEqual([]);
    const relabeled = { ...fee, postings: fee.postings.map((p) => ({ ...p, reason: 'ADM_CORRECTION_TRANSFER' })) };
    expect(I27(relabeled)).toEqual([`${fee.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 0 vs Δ2100 -5 (FDL)`]);
    expect(L.E17_BANK_OWN_CODES).toContain('BNK_LOAN_FEE'); expect(L.E17_BANK_OWN_CODES).not.toContain('MKT_TRADE');
  });
  it('7: day close Σ1002 = cbk 2002 per ccy and each bank 2100 = Σ holders 1010; a 1-micro seed fails DC', () => {
    const dc = (rows: [string, bigint][]) => obs(L.INV_LED_010({ ...view([], new SortedMap(rows.map(([k, b]) => [k, { balance: b, qty: 0n }]))), isDayClose: true }), 'INV-LED-027');
    const ok: [string, bigint][] = [['bnk_X:1002:FDL', 9n], ['cbk_FDL:2002:bnk_X:FDL', -9n], ['chr_A:1010:bnk_X:FDL', 4n], ['bnk_X:2100:chr_A:FDL', -4n]];
    expect(dc(ok)).toEqual([]);
    expect(dc([...ok.slice(1), ['bnk_X:1002:FDL', 10n], ['bnk_X:5000:FDL', -1n]])).toEqual(['DC: Σ1002 10 vs cbk 2002 9 (FDL)']);
    expect(dc([...ok.slice(0, 3), ['bnk_X:2100:chr_A:FDL', -3n], ['bnk_X:4000:FDL', -1n]])).toEqual(['DC: bnk_X 2100 vs Σ holders 1010 off by 1 (FDL)']);
  });
});

describe("QA pr3i: structured I6 pair key, INV-LED-026 on deposit subs, two-step forge", () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
  const forge = (a: string, b: string): Partial<Posting> => ({ debitAccount: `bnk_N:2100:${a}:FDL`, creditAccount: `bnk_N:2100:${b}:FDL`, amount: 5n, reason: 'MKT_TRADE', qty: undefined, assetId: undefined });
  it("tick 1 forges a deposit move to a '|' holder id; tick 2 reverses it before day close: tick 1 fails I6 at the tick and INV-LED-026", () => {
    const t1 = extra(trade(), forge('chr_A|q', 'chr_B|z')); const v1 = view([t1]);
    expect(obs(L.INV_LED_010_I6_TICK(v1), 'INV-LED-010').sort()).toEqual(['I6: bnk_N|chr_A|q|FDL deposit off by 5 at tick 10', 'I6: bnk_N|chr_B|z|FDL deposit off by -5 at tick 10']);
    expect(obs(L.INV_LED_026(v1), 'INV-LED-026')).toEqual([`unknown_entity chr_A|q in ${t1.entryId} MKT_TRADE`, `unknown_entity chr_B|z in ${t1.entryId} MKT_TRADE`]);
    // the reversal: after both ticks the balances are back to 0, so the day-close I6 alone cannot see the forge
    const t2 = extra(trade(), forge('chr_B|z', 'chr_A|q')); const both = applied([t1, t2]);
    expect(obs(L.INV_LED_010({ ...view([t2], both), isDayClose: true }), 'INV-LED-010').filter((o) => o.startsWith('I6'))).toEqual([]);
  });
  it('INV-LED-026 validates the holder sub of bnk:2100:<H> and the bank sub of <H>:1010:<bnk>; registered subs pass', () => {
    const e = extra(trade(), { debitAccount: 'bnk_N:2100:chr_A:FDL', creditAccount: 'chr_A:1010:bnk_GHOST:FDL', amount: 1n, reason: 'MKT_TRADE', qty: undefined, assetId: undefined });
    expect(obs(L.INV_LED_026(view([e])), 'INV-LED-026')).toEqual([`unknown_entity bnk_GHOST in ${e.entryId} MKT_TRADE`]);
    const g = extra(trade(), forge('chr_GHOST', 'chr_B'));
    expect(obs(L.INV_LED_026(view([g])), 'INV-LED-026')).toEqual([`unknown_entity chr_GHOST in ${g.entryId} MKT_TRADE`]);
    expect(obs(L.INV_LED_026(view([extra(trade(), forge('chr_A', 'chr_B'))])), 'INV-LED-026')).toEqual([]);
  });
});

// QA pr6 NO-GO follow-ups (/tmp/pr6-logs). The I1 and A1 probes are ported verbatim; only the logging is replaced by assertions.
type Acc2 = SortedMap<string, { balance: bigint; qty: bigint }>;
const FUND = (): Acc2 => { const w0 = fixture(); const env21 = w0.env('21', 'P12'); const es = ['chr_A', 'chr_B', 'chr_P'].map((id) => L.tplMint(env21, id, 1_000_000n, 'FDL', 'ADM_CORRECTION_IN'));
  const dep = (h: string, b: string, n: bigint) => ({ ...es[0], postings: [{ ...es[0].postings[0], debitAccount: `${h}:1010:${b}:FDL`, creditAccount: `${b}:2100:${h}:FDL`, amount: n, reason: 'ADM_CORRECTION_TRANSFER' }] });
  return applied([...es, dep('chr_A', 'bnk_N', 50n), dep('chr_A', 'bnk_X', 50n), dep('chr_B', 'bnk_N', 50n), dep('bnk_X', 'bnk_N', 50n), dep('cbk_FDL', 'bnk_N', 50n)]); };
function viewF(entries: Entry[]): CheckView {
  const w = fixture(); const pre = FUND(); const p = applied(entries, pre);
  return { tick: 10, isDayClose: false, catalog: w.catalog, entries, pre, post: p, entity: w.entity,
    facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n }, alarm: { mult: 10, floorMicro: 1_000_000_000_000n },
    flows: L.tickFlowsOf(entries, w.catalog, 10, (c) => L.computeM0sys(p, c) - L.computeM0sys(pre, c)) };
}
const allOf = (w: L.LedgerWorld | undefined, v: CheckView) => L.TICK_INVARIANTS.flatMap(([, c]) => c(w ? { ...v, entity: w.entity } : v)).map((f) => `${f.invariantId}: ${f.observed}`);

describe('QA pr6 NO-GO: INV-027 exemption by code list, I6 1010 key, ccp reading 4, fatal path, id registry, TAX self-pay', () => {
  const P = (d: string, c: string, n: bigint, reason = 'MKT_TRADE') => ({ debitAccount: d, creditAccount: c, amount: n, reason });
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
  const add = (e: Entry, ps: Partial<Posting>[]) => ps.reduce((a, p) => extra(a, { qty: undefined, assetId: undefined, ...p }), e);
  it('QA I1: cross-bank swap A: bnk_N->bnk_X liability, 1010 claims adjusted, banks balanced by value legs (MKT_TRADE 4190/5280) fails INV-LED-027', () => {
    const e = add(trade(), [
      P('bnk_N:2100:chr_A:FDL', 'bnk_N:4190:FDL', 5n), P('bnk_X:5280:FDL', 'bnk_X:2100:chr_A:FDL', 5n),
      P('chr_A:1010:bnk_X:FDL', 'chr_A:1010:bnk_N:FDL', 5n)]);
    const a = allOf(undefined, viewF([e])).filter((x) => x.startsWith('INV-LED-027'));
    expect(a).toEqual([`INV-LED-027: ${e.entryId} MKT_TRADE bnk_N Δ1002 0 vs Δ2100 -5 (FDL)`, `INV-LED-027: ${e.entryId} MKT_TRADE bnk_X Δ1002 0 vs Δ2100 5 (FDL)`]);
  });
  it('QA A1: cross-bank deposit move with reserves dropped plus 1-micro own no-op legs at both banks still fails INV-LED-027', () => {
    const w = fixture(); bankRail(w, 'chr_A', 'bnk_X'); bankRail(w, 'chr_B', 'bnk_Y');
    const e = L.tplPay(w.env('21', 'P12'), 'chr_A', 'chr_B', 7n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    let d: Entry = { ...e, postings: e.postings.filter((p) => !/:1002:/.test(p.debitAccount) && !/:2002:/.test(p.debitAccount)) };
    d = extra(d, { debitAccount: 'bnk_X:5000:FDL', creditAccount: 'bnk_X:4000:FDL', amount: 1n });
    d = extra(d, { debitAccount: 'bnk_Y:5000:FDL', creditAccount: 'bnk_Y:4000:FDL', amount: 1n });
    expect(allOf(w, view([d])).filter((x) => x.startsWith('INV-LED-027'))).toEqual([
      `INV-LED-027: ${e.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `INV-LED-027: ${e.entryId} ADM_CORRECTION_TRANSFER bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it("I6 1010 side: a '|' holder on <H>:1010:<bnk> is its own pair (kills splitting the 1010-side key on '|')", () => {
    const e = add(trade(), [P('chr_A|q:1010:bnk_N:FDL', 'chr_A:1010:bnk_N:FDL', 5n)]);
    expect(obs(L.INV_LED_010_I6_TICK(view([e])), 'INV-LED-010').sort()).toEqual(['I6: bnk_N|chr_A|FDL deposit off by -5 at tick 10', 'I6: bnk_N|chr_A|q|FDL deposit off by 5 at tick 10']);
  });
  it('reading 4: ccp 1002 counts in the Σ-vs-mirror check only, never as a bank', () => {
    const w = fixture(); w.registerEntity({ id: 'ccp_C' }); bankRail(w, 'chr_A', 'bnk_X');
    const fee = L.tplPay(w.env('07', 'P12'), 'chr_A', 'ccp_C', 4n, 'FDL', 'CCP_FEE');
    expect(legs(fee)).toContain('ccp_C:1002:FDL<bnk_X:1002:FDL:4');
    expect(I27(fee)).toEqual([]); // with ccp in the Σ: bnk_X −4 + ccp +4 = 0 = mirror; per bank only bnk_X (Δ1002 −4 vs Δ2100 −4)
    const noMirror = { ...fee, postings: fee.postings.filter((p) => !p.debitAccount.startsWith('cbk_FDL:2002')) };
    expect(I27(noMirror)).toEqual([]); // the 2002 legs cancel inside the group, so dropping them changes nothing
    const lost = extra(fee, { debitAccount: 'chr_A:5000:FDL', creditAccount: 'ccp_C:1002:FDL', amount: 1n });
    expect(I27(lost)).toEqual([`${fee.entryId} CCP_FEE ΣΔ1002 -1 vs cbk 2002 mirror 0 (FDL)`]); // ccp reserves lost: Σ only, no per-bank line for ccp
  });
  it('end to end: an INV-LED-027 mismatch takes the FATAL path (tick aborted, safe mode, nothing visible)', () => {
    const w = fixture(); bankRail(w, 'chr_A', 'bnk_X'); bankRail(w, 'chr_B', 'bnk_Y');
    w.apiFor('21').ledger.mint('chr_A', 100n, 'FDL', 'ADM_CORRECTION_IN'); expect(w.runP13().failures).toEqual([]);
    const before = w.accounts(); const logLen = w.entryLog().length;
    const id = w.apiFor('21').ledger.pay('chr_A', 'chr_B', 7n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    const q = w.testHooks().queue; const e = q[q.length - 1];
    const n = e.postings.length; e.postings = e.postings.filter((p) => !/:1002:|:2002:/.test(p.debitAccount)); expect(e.postings.length).toBe(n - 2); // test-only: QA I1 drop
    const r = w.runP13();
    expect(r.committed).toBe(true); expect(r.safeMode).toBe(true); expect(r.failedInvariants).toContain('INV-LED-027');
    expect(r.failures.filter((f) => f.invariantId === 'INV-LED-027').every((f) => f.severity === 'FATAL')).toBe(true);
    expect(w.accounts()).toEqual(before); expect(w.entryLog().length).toBe(logLen); expect(w.entryLog().some((x) => x.entryId === id)).toBe(false);
  });
  it('registerEntity accepts only ^(kkk|hh|prop)_[A-Za-z0-9_]+$ ids; rejects delimiters, whitespace, non-ASCII and empty', () => {
    const w = fixture();
    for (const id of ['chr_A|q', 'chr_A:1010', 'chr_\uff21', 'chr_A ', 'chr_\u200bA', '', 'bnk_X:1002', 'chr_A\n', 'chr_', 'CHR_A', 'chr-A', 'xx_A'])
      expect(() => w.registerEntity({ id }), JSON.stringify(id)).toThrow(/registerEntity/);
    for (const id of ['chr_Z9', 'bnk_New_1', 'hh_C2', 'prop_P1', 'ccp_C']) expect(w.registerEntity({ id })).toBe(id);
  });
  it('cpPolicy: TAX_* with payer = payee rejects (chr self and gov self); a normal TAX passes', () => {
    const w = fixture();
    for (const [a, b] of [['chr_A', 'chr_A'], ['gov_FDL', 'gov_FDL']]) {
      const e = L.tplPay(w.env('03', 'P12'), a, b, 5n, 'FDL', 'TAX_SECURITIES_TX');
      expect(e.invalid?.invariantId).toBe('INV-LED-025'); expect(e.invalid?.observed).toBe(`cp_self_pay TAX_SECURITIES_TX payer=payee=${a}`);
    }
    expect(L.tplPay(w.env('03', 'P12'), 'chr_A', 'gov_FDL', 5n, 'FDL', 'TAX_SECURITIES_TX').invalid).toBeUndefined();
  });
});

describe('E-18 rulings on PR #6 (INV-LED-027 scope, cbk legs, reserve seeding, ids, TAX self-pay)', () => {
  const fatal27 = (e: Entry) => L.INV_LED_027(view([e])).filter((f) => f.invariantId === 'INV-LED-027' && f.severity === 'FATAL').map((f) => f.observed);
  const okRun = (w: L.LedgerWorld) => { const r = w.runP13(); expect(r.failures).toEqual([]); return r; };
  const fatalRun = (w: L.LedgerWorld) => { const before = w.accounts(); const r = w.runP13(); expect(r.safeMode).toBe(true); expect(r.failedInvariants).toContain('INV-LED-027');
    expect(r.failures.filter((f) => f.invariantId === 'INV-LED-027').every((f) => f.severity === 'FATAL')).toBe(true); expect(w.accounts()).toEqual(before); };
  it('(1) an MKT_TRADE bank-own leg (4190/5280) with a deposit move but no reserve move is fatal', () => {
    const t = L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 });
    const e = extra(extra(t, { debitAccount: 'bnk_N:2100:chr_A:FDL', creditAccount: 'bnk_N:4190:FDL', amount: 5n, qty: undefined, assetId: undefined }),
      { debitAccount: 'chr_A:5280:FDL', creditAccount: 'chr_A:1010:bnk_N:FDL', amount: 5n, qty: undefined, assetId: undefined });
    expect(fatal27(e)).toEqual([`${t.entryId} MKT_TRADE bnk_N Δ1002 0 vs Δ2100 -5 (FDL)`]);
  });
  it('(1) BNK_LOAN_FEE charged by b passes; the exempt list is exactly E-18(1) (no BIZ_WAGES_NPC)', () => {
    const w = fixture(); bankRail(w, 'chr_A', 'bnk_X');
    expect(fatal27(L.tplPay(w.env('07', 'P12'), 'chr_A', 'bnk_X', 5n, 'FDL', 'BNK_LOAN_FEE'))).toEqual([]);
    expect([...L.E17_BANK_OWN_CODES].sort()).toEqual(['BIZ_WAGES', 'BIZ_WAGES_B2E', 'BNK_DEPOSIT_INSURANCE_PREMIUM', 'BNK_DEPOSIT_INTEREST', 'BNK_ELASTIC_DEPOSIT_INTEREST',
      'BNK_ELASTIC_FEES', 'BNK_ELASTIC_LOAN_INTEREST', 'BNK_ENFORCEMENT_FEE', 'BNK_FX_MARGIN', 'BNK_INTERBANK_INTEREST', 'BNK_LOAN_FEE', 'BNK_LOAN_INTEREST', 'BNK_OPEX_ELASTIC']);
  });
  it('(1) BIZ_WAGES_B2E chr→chr across banks with no 1002 move is fatal (listed code, no bank payer/payee)', () => {
    const e = pay('bnk_X', 'bnk_Y'); const d: Entry = { ...e, postings: e.postings.filter((p) => !/:1002:|:2002:/.test(p.debitAccount)).map((p) => ({ ...p, reason: 'BIZ_WAGES_B2E' })) };
    expect(fatal27(d)).toEqual([`${e.entryId} BIZ_WAGES_B2E bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `${e.entryId} BIZ_WAGES_B2E bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('(2)+(3) cbCredit seeding passes; FX_SPOT with cbk passes; the same FX with a 1-micro 2002 mismatch is fatal', () => {
    const w = fixture(); w.apiFor('04').ledger.cbCredit('cbk_EUN', 'bnk_N', 10_000_000n, 'EUN', 'CBK_STANDING_FACILITY'); okRun(w);
    w.apiFor('06').ledger.fx('bnk_N', 'cbk_FDL', 'EUN', 4_000_000n, 'FDL', 5_000_000n, 'FX_SPOT'); okRun(w);
    w.apiFor('06').ledger.fx('bnk_N', 'cbk_FDL', 'EUN', 1_000_000n, 'FDL', 1_000_000n, 'FX_SPOT');
    const q = w.testHooks().queue; const e = q[q.length - 1]; const m = e.postings.findIndex((p) => /^cbk_\w+:2002:/.test(p.debitAccount) || /^cbk_\w+:2002:/.test(p.creditAccount));
    expect(m).toBeGreaterThanOrEqual(0); e.postings[m] = { ...e.postings[m], amount: e.postings[m].amount + 1n }; // test-only
    fatalRun(w);
  });
  it('(3) a mint straight into bnk 1002 is fatal', () => {
    const w = fixture(); w.apiFor('21').ledger.mint('bnk_N', 10n, 'FDL', 'ADM_CORRECTION_IN'); fatalRun(w);
  });
  it('(4) ids hh_X and prop_1 pass; Hh_X and xy_1 reject', () => {
    const w = fixture(); expect(w.registerEntity({ id: 'hh_X' })).toBe('hh_X'); expect(w.registerEntity({ id: 'prop_1' })).toBe('prop_1');
    for (const id of ['Hh_X', 'xy_1']) expect(() => w.registerEntity({ id })).toThrow(/registerEntity/);
  });
  it('(5) TAX_* gov→gov is rejected cp_self_pay (E-18(5) addendum)', () => {
    const e = L.tplPay(fixture().env('03', 'P12'), 'gov_FDL', 'gov_FDL', 5n, 'FDL', 'TAX_SECURITIES_TX');
    expect(e.invalid?.invariantId).toBe('INV-LED-025'); expect(e.invalid?.observed).toBe('cp_self_pay TAX_SECURITIES_TX payer=payee=gov_FDL');
  });
});

describe('E-18 addendum: exemption by amount, payee-only income codes', () => {
  const I = (e: Entry) => L.INV_LED_027(view([e])).map((f) => f.observed);
  const leg = (e: Entry, d: string, c: string, n: bigint, reason: string): Entry => extra(e, { debitAccount: d, creditAccount: c, amount: n, reason });
  it('a listed code (BNK_LOAN_FEE) with a 1-micro own leg does not switch INV-027 off: a 7 deposit drop is still caught', () => {
    const e = pay('bnk_X', 'bnk_Y'); let d: Entry = { ...e, postings: e.postings.filter((p) => !/:1002:|:2002:/.test(p.debitAccount)).map((p) => ({ ...p, reason: 'BNK_LOAN_FEE' })) };
    d = leg(d, 'bnk_X:5080:FDL', 'bnk_X:4040:FDL', 1n, 'BNK_LOAN_FEE'); d = leg(d, 'chr_A:5080:FDL', 'bnk_X:4040:FDL', 1n, 'BNK_LOAN_FEE');
    expect(I(d)).toEqual([`${e.entryId} BNK_LOAN_FEE bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `${e.entryId} BNK_LOAN_FEE bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('BNK_FX_MARGIN / BNK_ENFORCEMENT_FEE / BNK_ELASTIC_FEES: bank as payee is exempt; bank as payer is not', () => {
    const base = pay('bnk_X', 'bnk_X');
    for (const code of L.E17_BANK_PAYEE_ONLY_CODES) {
      const mk = (ps: [string, string][]): Entry => ({ ...base, postings: ps.map(([dr, cr], i) => ({ ...base.postings[0], postingSeq: i, debitAccount: dr, creditAccount: cr, amount: 5n, reason: code, flowLeg: undefined })) });
      const payee = mk([['bnk_X:2100:chr_A:FDL', 'bnk_X:4040:FDL'], ['chr_A:5080:FDL', 'chr_A:1010:bnk_X:FDL']]);
      expect(I(payee), code).toEqual([]);
      const payer = mk([['bnk_X:5080:FDL', 'bnk_X:2100:chr_A:FDL'], ['chr_A:1010:bnk_X:FDL', 'chr_A:4040:FDL']]);
      expect(I(payer), code).toEqual([`${base.entryId} ${code} bnk_X Δ1002 0 vs Δ2100 5 (FDL)`]);
    }
    expect([...L.E17_BANK_PAYEE_ONLY_CODES].sort()).toEqual(['BNK_ELASTIC_FEES', 'BNK_ENFORCEMENT_FEE', 'BNK_FX_MARGIN']);
    // a two-way code (BNK_DEPOSIT_INTEREST) paid BY the bank stays exempt
    const di: Entry = { ...base, postings: [['bnk_X:5090:FDL', 'bnk_X:2100:chr_A:FDL'], ['chr_A:1010:bnk_X:FDL', 'chr_A:4020:FDL']].map(([dr, cr], i) => ({ ...base.postings[0], postingSeq: i, debitAccount: dr, creditAccount: cr, amount: 5n, reason: 'BNK_DEPOSIT_INTEREST', flowLeg: undefined })) };
    expect(I(di)).toEqual([]);
  });
  it('E-18(2): a cbk-own-leg group with reserves moved but no 2002 mirror fails the Σ check', () => {
    const e = pay('bnk_X', 'bnk_X');
    const d: Entry = { ...e, postings: [{ ...e.postings[0], postingSeq: 0, debitAccount: 'bnk_X:1002:FDL', creditAccount: 'cbk_FDL:4000:FDL', amount: 3n, reason: 'FX_SPOT', flowLeg: undefined }] };
    expect(I(d)).toEqual([`${e.entryId} FX_SPOT ΣΔ1002 3 vs cbk 2002 mirror 0 (FDL)`]);
  });
});

describe('E-19: cbk own reserve legs are netted per bank (replaces the E-18(2) skip); 1910 carve-out; id length cap', () => {
  const sev = (e: Entry) => L.INV_LED_027(view([e])).map((f) => `${f.severity} ${f.observed}`);
  const fx = (bank = 'bnk_N', amt = 4_000_000n) => L.tplFx(fixture().env('06', 'P12'), bank, 'cbk_FDL', 'EUN', amt, 'FDL', 5_000_000n, 'FX_SPOT');
  const plus = (e: Entry, ls: [string, string, bigint][]): Entry => ({ ...e, postings: [...e.postings, ...ls.map(([d, c, a], i) => ({ ...e.postings[0], postingSeq: e.postings.length + i, flowLeg: undefined, debitAccount: d, creditAccount: c, amount: a, ccy: 'FDL' as L.Ccy }))] });
  it('(1) a clean FX_SPOT with one bank passes', () => { const e = fx(); expect(e.invalid).toBeUndefined(); expect(sev(e)).toEqual([]); });
  it('(2) QA probe f2: FX_SPOT plus an unbacked bnk_X→bnk_Y deposit move is fatal', () => {
    const e = plus(fx(), [['bnk_X:2100:chr_A:FDL', 'chr_A:1010:bnk_X:FDL', 7n], ['chr_B:1010:bnk_Y:FDL', 'bnk_Y:2100:chr_B:FDL', 7n]]);
    expect(sev(e)).toEqual([`FATAL ${e.entryId} FX_SPOT bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `FATAL ${e.entryId} FX_SPOT bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('(3) the same move riding on bnk_N, the cbk counterparty bank, is still fatal', () => {
    const e = plus(fx(), [['bnk_N:2100:chr_A:FDL', 'chr_A:1010:bnk_N:FDL', 7n], ['chr_B:1010:bnk_Y:FDL', 'bnk_Y:2100:chr_B:FDL', 7n]]);
    expect(sev(e)).toEqual([`FATAL ${e.entryId} FX_SPOT bnk_N Δ1002 0 vs Δ2100 -7 (FDL)`, `FATAL ${e.entryId} FX_SPOT bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('(4) an FX_SPOT with two banks, each with its own cbk leg, passes', () => {
    const a = fx('bnk_N'); const b = fx('bnk_X', 3_000_000n);
    const both: Entry = { ...a, postings: [...a.postings, ...b.postings.map((p, i) => ({ ...p, postingSeq: a.postings.length + i }))] };
    expect(sev(both)).toEqual([]);
  });
  it('(5) a forged meta naming cbk with no cbk posting gets no netting and is fatal', () => {
    const e = pay('bnk_X', 'bnk_Y');
    const d: Entry = { ...e, meta: { ...(e.meta ?? { parties: [] }), parties: ['cbk_FDL', 'bnk_X', 'bnk_Y'] }, postings: e.postings.filter((p) => !/:1002:|:2002:/.test(p.debitAccount)) };
    expect(sev(d)).toEqual([`FATAL ${e.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 0 vs Δ2100 -7 (FDL)`, `FATAL ${e.entryId} ADM_CORRECTION_TRANSFER bnk_Y Δ1002 0 vs Δ2100 7 (FDL)`]);
  });
  it('only 1002 legs whose counter side is cbk are netted: a bank-to-bank reserve move riding on an FX_SPOT is fatal', () => {
    const e = plus(fx(), [['bnk_X:1002:FDL', 'bnk_Y:1002:FDL', 6n]]);
    expect(sev(e)).toEqual([`FATAL ${e.entryId} FX_SPOT bnk_X Δ1002 6 vs Δ2100 0 (FDL)`, `FATAL ${e.entryId} FX_SPOT bnk_Y Δ1002 -6 vs Δ2100 0 (FDL)`]);
  });
  it('1910 carve-out: 1910 (and 2001-2003) are issuer mirrors, not cbk own legs; a reserve leg against cbk 1910 is not netted and is fatal', () => {
    expect([1910, 2001, 2002, 2003].map(L.isCbkOwnLeg)).toEqual([false, false, false, false]);
    expect([1001, 3800, 4000].map(L.isCbkOwnLeg)).toEqual([true, true, true]);
    const base = pay('bnk_X', 'bnk_X');
    const e: Entry = { ...base, postings: [{ ...base.postings[0], postingSeq: 0, flowLeg: undefined, debitAccount: 'bnk_X:1002:FDL', creditAccount: 'cbk_FDL:1910:FDL', amount: 3n, reason: 'ADM_CORRECTION_IN' },
      { ...base.postings[0], postingSeq: 1, flowLeg: undefined, debitAccount: 'cbk_FDL:1910:FDL', creditAccount: 'cbk_FDL:2002:bnk_X:FDL', amount: 3n, reason: 'ADM_CORRECTION_IN' }] };
    expect(sev(e)).toEqual([`FATAL ${base.entryId} ADM_CORRECTION_IN bnk_X Δ1002 3 vs Δ2100 0 (FDL)`]);
  });
  it('registerEntity: an id of 64 chars passes, 65 rejects', () => {
    const w = fixture(); const id64 = 'chr_' + 'x'.repeat(60); const id65 = 'chr_' + 'x'.repeat(61);
    expect(id64.length).toBe(64); expect(L.ENTITY_ID_MAX).toBe(64);
    expect(w.registerEntity({ id: id64 })).toBe(id64); expect(() => w.registerEntity({ id: id65 })).toThrow(/longer than 64/);
  });
});
