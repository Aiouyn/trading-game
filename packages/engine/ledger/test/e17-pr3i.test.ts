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
  it('6: a bnk_X fee charged to chr_A (2100 −f, 4xxx +f) is exempt (the bank is payee); the same deposit drop with no bank leg fails', () => {
    const base = pay('bnk_X', 'bnk_X');
    const fee: Entry = { ...base, postings: [
      { ...base.postings[0], postingSeq: 0, debitAccount: 'bnk_X:2100:chr_A:FDL', creditAccount: 'bnk_X:4000:FDL', amount: 5n, flowLeg: undefined },
      { ...base.postings[0], postingSeq: 1, debitAccount: 'chr_A:5000:FDL', creditAccount: 'chr_A:1010:bnk_X:FDL', amount: 5n, flowLeg: undefined }] };
    expect(I27(fee)).toEqual([]);
    const forged = { ...fee, postings: [{ ...fee.postings[0], creditAccount: 'chr_B:4000:FDL' }, fee.postings[1]] };
    expect(I27(forged)).toEqual([`${base.entryId} ADM_CORRECTION_TRANSFER bnk_X Δ1002 0 vs Δ2100 -5 (FDL)`]);
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
