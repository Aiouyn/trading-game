// PR #3 review fixes F1-F5 (/workspace/specs/ledger-ref/pr3-review.md).
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

describe('F1 INV-LED-004 per-entry M2 rules (T03-11 step 7)', () => {
  it('a REVALUE posting on 1001 fails', () => {
    const e = L.tplAccrue(env('03'), 'chr_A', 5n, 'FDL', 'LED_MTM_DAILY', 1001, 4070);
    expect(obs(L.INV_LED_004(view([e])), 'INV-LED-004').some((o) => /REVALUE LED_MTM_DAILY moves M2/.test(o))).toBe(true);
  });
  it('a chr -> chr pay passes; the same pay with a forged extra 2100 leg fails (non-bank TRANSFER moves M2)', () => {
    const pay = L.tplPay(env('21'), 'chr_A', 'chr_B', 10n, 'FDL', 'ADM_CORRECTION_TRANSFER');
    expect(obs(L.INV_LED_004(view([pay])), 'INV-LED-004')).toEqual([]);
    const forged = extra(pay, { debitAccount: 'bnk_N:2100:chr_B:FDL', creditAccount: 'bnk_N:5000:FDL', amount: 7n });
    expect(obs(L.INV_LED_004(view([forged])), 'INV-LED-004').some((o) => /non-bank TRANSFER ADM_CORRECTION_TRANSFER moves M2 by -7/.test(o))).toBe(true);
  });
  it('a SINK whose postings raise M2 fails', () => {
    const burn = L.tplBurn(env('21'), 'chr_A', 10n, 'FDL', 'ADM_CORRECTION_OUT');
    expect(obs(L.INV_LED_004(view([burn])), 'INV-LED-004')).toEqual([]);
    const bad = extra(burn, { debitAccount: 'chr_B:1001:FDL', creditAccount: 'chr_B:4190:FDL', amount: 50n });
    expect(obs(L.INV_LED_004(view([bad])), 'INV-LED-004').some((o) => /SINK ADM_CORRECTION_OUT M2 sign 40/.test(o))).toBe(true);
  });
  it('CB_CREDIT into bank reserves gives ΔM2 = 0n and passes; bank LEND to a chr moves M2 by +amount (borrower from meta)', () => {
    const cb = L.tplCbCredit(env('04'), 'cbk_FDL', 'bnk_N', 9n, 'FDL', 'CBK_STANDING_FACILITY');
    expect(L.computeM2(applied([cb]), 'FDL')).toBe(0n);
    expect(obs(L.INV_LED_004(view([cb])), 'INV-LED-004')).toEqual([]);
    const lend = L.tplLend(env('07'), 'bnk_N', 'chr_A', 1_000n, 'FDL', 'BNK_LOAN_DRAWDOWN', 'loan_1');
    expect(lend.meta).toEqual({ parties: ['bnk_N', 'chr_A'], borrowerId: 'chr_A' });
    expect(obs(L.INV_LED_004(view([lend])), 'INV-LED-004')).toEqual([]);
    const reordered = { ...lend, postings: [lend.postings[1], lend.postings[0]].map((p, i) => ({ ...p, postingSeq: i })) };
    expect(obs(L.INV_LED_004(view([reordered])), 'INV-LED-004')).toEqual([]); // X-4: no dependence on postings[0]
    const cut = { ...lend, headline: { ...lend.headline!, amount: 999n } };
    expect(obs(L.INV_LED_004(view([cut])), 'INV-LED-004').some((o) => /bank credit BNK_LOAN_DRAWDOWN M2 1000/.test(o))).toBe(true);
  });
});

describe('F2 elastic bridge (INV-LED-005, I17 mirror)', () => {
  it('ELASTIC_IN passes 005 and the 2909/1009 mirror; a PAY touching X:1009 fails 005', () => {
    const e = L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    expect(L.INV_LED_005(view([e]))).toEqual([]);
    expect(obs(L.INV_LED_003(view([e])), 'INV-LED-003')).toEqual([]);
    const pay = extra(L.tplPay(env('21'), 'chr_A', 'chr_B', 10n, 'FDL', 'ADM_CORRECTION_TRANSFER'), { debitAccount: 'hh_C1:1009:FDL', creditAccount: 'hh_C1:4000:FDL', amount: 3n });
    expect(obs(L.INV_LED_005(view([pay])), 'INV-LED-005')).toContain('ADM_CORRECTION_TRANSFER touches hh_C1:1009:FDL');
  });
  it('a broken sys:2909:X vs X:1009 mirror fails INV-LED-003', () => {
    const e = L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    const post = applied([e]); post.set('hh_C1:1009:FDL', { balance: -99n, qty: 0n });
    expect(obs(L.INV_LED_003(view([e], post)), 'INV-LED-003')).toContain('I17 2909 mirror hh_C1 (FDL) off by 1');
  });
});

describe('F3 INV-LED-002 supporting legs (T03-05 step 8, A-5 as Systems reads it)', () => {
  const trade = () => L.tplSwapAsset(env('05'), 'chr_A', 'chr_B', 'ast_EQ', 1n, 100n, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 });
  it('a SINK fee leg built by BURN inside a trade passes through its legTemplate (spec test 8)', () => {
    const fee = L.tplBurn(env('21'), 'chr_A', 1n, 'FDL', 'ADM_CORRECTION_OUT');
    const c = L.composeEntries(env('05'), trade(), [fee]);
    expect(c.postings.filter((p) => p.reason === 'ADM_CORRECTION_OUT').every((p) => p.legTemplate === 'BURN')).toBe(true);
    expect(L.INV_LED_002(view([c]))).toEqual([]);
  });
  it('the same SINK leg without its legTemplate fails (class SINK does not admit SWAP_ASSET)', () => {
    const fee = L.tplBurn(env('21'), 'chr_A', 1n, 'FDL', 'ADM_CORRECTION_OUT');
    const c = L.composeEntries(env('05'), trade(), [fee]);
    const stripped = { ...c, postings: c.postings.map((p) => ({ ...p, legTemplate: undefined })) };
    expect(obs(L.INV_LED_002(view([stripped])), 'INV-LED-002')).toContain('I1: supporting leg code=ADM_CORRECTION_OUT template=SWAP_ASSET');
  });
  it('a TAX_* TRANSFER leg in a TRANSFER entry passes by the card rule', () => {
    const tax = L.tplPay(env('03'), 'chr_A', 'gov_FDL', 2n, 'FDL', 'TAX_SECURITIES_TX');
    const c = L.composeEntries(env('05'), trade(), [tax]);
    expect(L.INV_LED_002(view([{ ...c, postings: c.postings.map((p) => ({ ...p, legTemplate: undefined })) }]))).toEqual([]);
  });
});

describe('F5 catalog v2 (catalog.csv v2 + aliases.csv)', () => {
  const cat = new L.ReasonCatalog();
  it('35 restrictedOk codes, 28 aliases, 8 illicit-or-inherited rows load', () => {
    expect(L.RESTRICTED_OK_CODES.length).toBe(35);
    expect(L.RESTRICTED_OK_CODES).toContain('TAX_SECURITIES_TX');
    expect(L.ALIASES.length).toBe(28);
    expect(cat.resolveAlias('BIZ_REVENUE_NPC')).toBe('BIZ_SALES_HH BIZ_SALES_FRM BIZ_SALES_ROW');
    expect(cat.get('CONFLICT_RANSOM')?.illicit).toBe(true);
    for (const [a] of L.ALIASES) expect(cat.get(a)).toBeUndefined(); // no ALIAS_SHADOWS_CODE
  });
  it('requestableBy widens mayRequest beyond the owner', () => {
    const r = cat.all().find((x) => Array.isArray(x.requestableBy) && x.requestableBy.length > 0)!;
    const other = (r.requestableBy as number[])[0];
    expect(cat.mayRequest(r.code, other)).toBe(true);
    expect(cat.mayRequest(r.code, 99)).toBe(false);
    expect(cat.mayRequest(r.code, r.owner)).toBe(true);
  });
  it('catalog legA/legB are the default value legs (PAY, MINT); PostOpts still override', () => {
    const pay = L.tplPay(env('07'), 'chr_A', 'chr_B', 10n, 'FDL', 'BNK_LOAN_FEE');
    expect(pay.postings.at(-1)).toMatchObject({ debitAccount: 'chr_A:5080:FDL', creditAccount: 'chr_B:4040:FDL' });
    const over = L.tplPay(env('07'), 'chr_A', 'chr_B', 10n, 'FDL', 'BNK_LOAN_FEE', { valueLegA: 5000 });
    expect(over.postings.at(-1)?.debitAccount).toBe('chr_A:5000:FDL');
    const mint = L.tplMint(env('21'), 'chr_A', 10n, 'FDL', 'ADM_CORRECTION_IN');
    expect(mint.postings.at(-1)?.creditAccount).toBe('chr_A:4190:FDL');
  });
  it('ELASTIC_IN/OUT enforce sector ∈ elasticSectors', () => {
    expect(L.tplElasticIn(env('09'), 'hh_C1', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH').invalid).toBeUndefined();
    const bad = L.tplElasticIn(env('09'), 'frm_FDL', 'biz_B', 100n, 'FDL', 'BIZ_SALES_HH');
    expect(bad.invalid).toEqual({ invariantId: 'INV-LED-002', observed: 'sector frm for BIZ_SALES_HH', expected: 'one of hh' });
  });
});
