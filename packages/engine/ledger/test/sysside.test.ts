// Spec §7 tests 9-21 (Δ6-B sysSide, Δ7 archive, Δ8 hooks, Δ9/Δ10 control, Δ11 worlds, Δ12, Δ13) and E-13 rival sub-tags.
import { describe, expect, it } from 'vitest';
import * as L from '../src';
import { SortedMap, type SysSideFlows, type TickFlows } from '../src';
import { fixture, M } from './fixture';

const sys = (w: L.LedgerWorld, t: number, c: L.Ccy = 'FDL'): SysSideFlows => w.flowReader().tickFlows(c, t)!.sysSide!;
const fund = (w: L.LedgerWorld, xs: [string, number][]): void => {
  for (const [id, u] of xs) w.apiFor('21').ledger.mint(id, M(u), 'FDL', 'ADM_CORRECTION_IN');
  expect(w.runP13().failures).toEqual([]);
};
const ok = (w: L.LedgerWorld): number => { const t = w.tick; expect(w.runP13().failures).toEqual([]); return t; };
const view = (s: SysSideFlows) => JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? String(v) : v instanceof SortedMap ? Object.fromEntries(v.entries()) : v));

/** §6.8 worked example (FDL, tick 10), optionally with the v0.7 PD-9 extension. */
function workedExample(ext: boolean, ccpFee = true) {
  const w = fixture(); w.registerEntity({ id: 'ccp_C' });
  fund(w, [['gov_FDL', 1000], ['exc_X', 37], ['chr_P', 30]]);
  const a0 = w.aggregates('FDL'); const api = (m: string) => w.apiFor(m).ledger;
  api('14').mint('chr_P', M(100), 'FDL', 'ACCT_START_CASH');                      // F_p 100
  api('09').elasticIn('hh_C1', 'gov_FDL', M(50), 'FDL', 'CMP_NPC_REVENUE');        // F_s 50
  api('03').pay('chr_P', 'gov_FDL', M(15), 'FDL', 'TAX_SECURITIES_TX');            // X_out 15
  api('05').pay('chr_P', 'exc_X', M(3), 'FDL', 'MKT_EXCHANGE_FEE');                // X_out 3 (X ∈ S_10)
  api('09').pay('gov_FDL', 'chr_P', M(5), 'FDL', 'BIZ_SUBSIDY_GOV');               // X_in 5
  api('21').burn('chr_P', M(2), 'FDL', 'ADM_CORRECTION_OUT');                      // K_p 2
  api('04').cbCredit('cbk_FDL', 'bnk_N', M(30), 'FDL', 'CBK_STANDING_FACILITY');   // C_p 30
  if (ext) {
    api('13').pay('chr_P', 'crt_COURT', M(10), 'FDL', 'LAW_FINE_VICTIM_FUND');     // X_out 10
    api('13').pay('crt_COURT', 'chr_P', M(4), 'FDL', 'LAW_RESTITUTION');           // X_in 4 (victim fund pays P)
    api('04').pay('cbk_FDL', 'gov_FDL', M(6), 'FDL', 'CBK_PROFIT_REMITTANCE');     // C_s 6
    if (ccpFee) api('07').pay('chr_P', 'ccp_C', M(1), 'FDL', 'CCP_FEE');           // X_out 1
  }
  w.setController('exc_X', 'chr_A');                                              // X leaves S at P13 of t, m(X) = 40
  const t = w.tick; const r = w.runP13();
  return { w, t, r, s: w.flowReader().tickFlows('FDL', t)?.sysSide as SysSideFlows, a0, a1: w.aggregates('FDL') };
}

describe('Δ6-B sysSide: spec tests 9, 10, 14, 14b, 18, 21', () => {
  it('9: tax 1.5 → sink; MAC_GOV_TRANSFER_CORE 1 → faucet; netDelta −0.5; treasury +0.5 (INV-016); CBK_PROFIT_REMITTANCE adds 0', () => {
    const w = fixture(); fund(w, [['chr_P', 10], ['gov_FDL', 10]]);
    const t0 = w.tick - 1;
    w.apiFor('03').ledger.pay('chr_P', 'gov_FDL', 1_500_000n, 'FDL', 'TAX_SECURITIES_TX');
    w.apiFor('04').ledger.pay('gov_FDL', 'chr_P', 1_000_000n, 'FDL', 'MAC_GOV_TRANSFER_CORE');
    const t = ok(w); const s = sys(w, t);
    expect(w.flowReader().tickFlows('FDL', t)!.byClass.get('SINK') ?? 0n).toBe(0n);
    expect(s.sink.get('TAX_SECURITIES_TX')).toBe(1_500_000n); expect(s.faucet.get('MAC_GOV_TRANSFER_CORE')).toBe(1_000_000n);
    expect(s.netDelta).toBe(-500_000n);
    expect(s.treasury.get('gov_FDL')! - sys(w, t0).treasury.get('gov_FDL')!).toBe(500_000n);
    w.apiFor('04').ledger.pay('cbk_FDL', 'gov_FDL', 1_000_000n, 'FDL', 'CBK_PROFIT_REMITTANCE');
    const t2 = ok(w); const s2 = sys(w, t2);
    expect([L.sumMap(s2.faucet), L.sumMap(s2.sink), s2.netFlow]).toEqual([0n, 0n, 0n]); expect(s2.C_s).toBe(1_000_000n);
  });
  it('10: MKT_EXCHANGE_FEE adds the fee to sink under NPC control and 0n once a chr controls the exchange', () => {
    const w = fixture(); fund(w, [['chr_P', 10]]);
    w.apiFor('05').ledger.pay('chr_P', 'exc_X', 2_000_000n, 'FDL', 'MKT_EXCHANGE_FEE');
    expect(sys(w, ok(w)).sink.get('MKT_EXCHANGE_FEE')).toBe(2_000_000n);
    w.setController('exc_X', 'chr_B'); ok(w);
    w.apiFor('05').ledger.pay('chr_P', 'exc_X', 2_000_000n, 'FDL', 'MKT_EXCHANGE_FEE');
    expect(sys(w, ok(w)).sink.get('MKT_EXCHANGE_FEE') ?? 0n).toBe(0n);
  });
  it('14 + 18: §6.8 tick 10 exact (F_p 100, F_s 50, X_out 18, X_in 5, K_p 2, C_p 30, controlOut 40; ΔM0_player 155, ΔΣ_S 23, ΔM0 178, N 115)', () => {
    const { r, s, a0, a1 } = workedExample(false);
    expect(r.failures).toEqual([]);
    expect([s.F_p, s.F_s, s.K_p, s.C_p]).toEqual([M(100), M(50), M(2), M(30)]);
    expect([L.sumMap(s.sink), L.sumMap(s.faucet), s.controlOut.get('exc_X')]).toEqual([M(18), M(5), M(40)]);
    expect([s.m0PlayerDelta, s.sysDelta, a1.M0 - a0.M0]).toEqual([M(155), M(23), M(178)]);
    expect(s.netFlow).toBe(M(115)); expect(s.netFlow).toBe(s.m0PlayerDelta - L.sumMap(s.controlOut));
    expect(s.treasury.get('exc_X')).toBeUndefined(); // X ∉ S_11
  });
  it('14: the X fee in tick 10 is X_out (S_10); an X fee in tick 11 is a non-system MOVE and contributes 0', () => {
    const { w } = workedExample(false);
    w.apiFor('05').ledger.pay('chr_P', 'exc_X', M(3), 'FDL', 'MKT_EXCHANGE_FEE');
    const s = sys(w, ok(w)); expect([L.sumMap(s.sink), s.netFlow]).toEqual([0n, 0n]);
  });
  it('21: the v0.7 PD-9 extension without the CCP fee is exact (ΔM0_player 149, ΔΣ_S 35, ΔM0 184, N 109)', () => {
    const { r, s, a0, a1 } = workedExample(true, false);
    expect(r.failures).toEqual([]);
    expect([s.m0PlayerDelta, s.sysDelta, a1.M0 - a0.M0, s.netFlow]).toEqual([M(149), M(35), M(184), M(109)]);
    expect(s.C_s).toBe(M(6));
  });
  // OPEN (reported): the CCP fee leg pays into ccp:1002 (reserves; not M2), so the chr's M2 falls by 1 with no bnk/cbk/gov
  // counterparty, and E-15(3)'s amount rule rejects it (INV-LED-004). The pre-E-15 presence rule rejected it too. Needs a
  // Producer ruling (add ccp to the E-15(3) money side?). Until then this test pins the current behaviour.
  it('21 (blocked by E-15(3)): with CCP_FEE the tick fails INV-LED-004 on the CCP_FEE group only', () => {
    const { r } = workedExample(true, true);
    expect(r.failures.map((f) => f.observed.replace(/ent_\d+/, 'E'))).toEqual(['I4: E non-bank TRANSFER CCP_FEE moves M2 by -1000000']);
  });
  it('21: cbCredit to an NPC bank is C_p; a cbk FX-reserve purchase in a foreign ccy from a bank ∉ S is X_out in that ccy', () => {
    const w = fixture();
    w.apiFor('04').ledger.cbCredit('cbk_FDL', 'bnk_N', M(30), 'FDL', 'CBK_STANDING_FACILITY');
    const t = ok(w); expect(sys(w, t).C_p).toBe(M(30)); expect(sys(w, t).byHolder.get('npcFirm')!.C_p).toBe(M(30));
    w.apiFor('21').ledger.mint('bnk_N', M(10), 'EUN', 'ADM_CORRECTION_IN'); ok(w);
    w.apiFor('06').ledger.fx('bnk_N', 'cbk_FDL', 'EUN', M(4), 'FDL', M(5), 'FX_SPOT'); // cbk buys 4 EUN reserves for 5 FDL
    const t2 = ok(w);
    expect(sys(w, t2, 'EUN').sink.get('FX_SPOT')).toBe(M(4)); expect(sys(w, t2, 'EUN').netFlow).toBe(-M(4));
    expect(sys(w, t2, 'FDL').C_p).toBe(M(5)); // the FDL leg is the issuer's own-account payment to a bank ∉ S
  });
  it('14b: mint 10 to a treasury: ΔM0_sys +10, m0PlayerDelta 0, faucet empty (no double count)', () => {
    const w = fixture(); w.apiFor('14').ledger.mint('gov_FDL', M(10), 'FDL', 'ACCT_START_CASH');
    const t = ok(w); const s = sys(w, t);
    expect(w.flowReader().tickFlows('FDL', t)!.m0sysDelta).toBe(M(10));
    expect([s.m0PlayerDelta, L.sumMap(s.faucet), s.F_s, s.F_p]).toEqual([0n, 0n, M(10), 0n]);
  });
});

describe('INV-LED-016/019/020/021 exactness (tests 14a, 19)', () => {
  it('14a property: random driver with random control flips keeps INV-016/019/003 and ΔM0 consistency every tick; a ±1n bucket mutation fails', () => {
    const w = fixture(); 
    let a = 7 >>> 0; const rnd = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 2 ** 32; };
    fund(w, [['chr_P', 1000], ['chr_A', 1000], ['gov_FDL', 1000], ['exc_X', 100], ['cmp_N', 100]]);
    for (let i = 0; i < 120; i++) {
      const api = (m: string) => w.apiFor(m).ledger; const x = rnd();
      if (x < 0.2) api('05').pay('chr_P', 'exc_X', 1n + BigInt(Math.floor(rnd() * 1e6)), 'FDL', 'MKT_EXCHANGE_FEE');
      else if (x < 0.4) api('03').pay('chr_A', 'gov_FDL', 1n + BigInt(Math.floor(rnd() * 1e6)), 'FDL', 'TAX_SECURITIES_TX');
      else if (x < 0.5) api('04').pay('gov_FDL', 'cmp_N', 1n + BigInt(Math.floor(rnd() * 1e6)), 'FDL', 'MAC_GOV_TRANSFER_CORE');
      else if (x < 0.6) api('14').mint('chr_P', 1n + BigInt(Math.floor(rnd() * 1e6)), 'FDL', 'ACCT_START_CASH');
      else if (x < 0.7) w.setController('exc_X', rnd() < 0.5 ? 'chr_A' : null);
      else if (x < 0.8) w.setController('cmp_N', rnd() < 0.5 ? 'chr_P' : null);
      else if (x < 0.9) api('21').pay('chr_P', 'cmp_N', 1n + BigInt(Math.floor(rnd() * 1e6)), 'FDL', 'ADM_CORRECTION_TRANSFER');
      expect(w.runP13().failures).toEqual([]);
    }
    expect(w.alerts.some((x) => x.invariantId === 'LED-CONTROL-FLIPS')).toBe(true); // E14 churn alarm (> 2 flips in 7 days)
  });
  it('19: human P, NPC firm Q, rival fund R, treasury G: class buckets, Σ netFlow = N = 7 + (5 − 15) = −3, intra nets 0', () => {
    const w = fixture(); w.registerEntity({ id: 'npc_PRIN' }); w.registerEntity({ id: 'fnd_R', ownerId: 'npc_PRIN' }); w.setRole('npc_PRIN', 'FUND_PRINCIPAL');
    fund(w, [['chr_P', 100], ['gov_FDL', 100]]);
    const api = (m: string) => w.apiFor(m).ledger;
    api('03').pay('chr_P', 'gov_FDL', M(15), 'FDL', 'TAX_SECURITIES_TX');
    api('04').pay('gov_FDL', 'cmp_N', M(5), 'FDL', 'MAC_GOV_TRANSFER_CORE');
    api('14').mint('fnd_R', M(7), 'FDL', 'ACCT_START_CASH');
    api('21').pay('chr_P', 'cmp_N', M(4), 'FDL', 'ADM_CORRECTION_TRANSFER');
    const s = sys(w, ok(w)); const h = (c: L.HolderClass) => s.byHolder.get(c)!;
    expect([h('human').X_out, h('human').intraOut, h('npcFirm').X_in, h('npcFirm').intraIn, h('npcRival').F_p]).toEqual([M(15), M(4), M(5), M(4), M(7)]);
    expect(s.netFlow).toBe(-M(3));
    expect(L.HOLDER_CLASSES.reduce((x, c) => x + h(c).netFlow, 0n)).toBe(s.netFlow);
    expect(L.HOLDER_CLASSES.reduce((x, c) => x + h(c).intraIn - h(c).intraOut, 0n)).toBe(0n);
    expect(L.HOLDER_CLASSES.reduce((x, c) => x + h(c).m0Delta, 0n)).toBe(s.m0PlayerDelta);
    expect(s.byRivalTag.get('rival.fund')!.F_p).toBe(M(7));
  });
});

describe('14a: a ±1n mutation of any sysSide bucket fails SYS_INVARIANTS (016/019/021/023)', () => {
  it('every scalar, every map entry, every holder-class and rival-tag term', () => {
    const w = fixture(); w.registerEntity({ id: 'npc_PRIN' }); w.registerEntity({ id: 'fnd_R', ownerId: 'npc_PRIN' }); w.setRole('npc_PRIN', 'FUND_PRINCIPAL');
    w.registerEntity({ id: 'cmp_H' }); w.setDynastyHolding('cmp_H');
    fund(w, [['chr_P', 100], ['gov_FDL', 100], ['exc_X', 10], ['cmp_H', 10]]);
    const api = (m: string) => w.apiFor(m).ledger;
    api('03').pay('chr_P', 'gov_FDL', M(15), 'FDL', 'TAX_SECURITIES_TX'); api('04').pay('gov_FDL', 'cmp_N', M(5), 'FDL', 'MAC_GOV_TRANSFER_CORE');
    api('14').mint('fnd_R', M(7), 'FDL', 'ACCT_START_CASH'); api('21').burn('chr_P', M(2), 'FDL', 'ADM_CORRECTION_OUT');
    api('21').pay('fnd_R', 'cmp_H', M(1), 'FDL', 'ADM_CORRECTION_TRANSFER'); api('04').cbCredit('cbk_FDL', 'bnk_N', M(3), 'FDL', 'CBK_STANDING_FACILITY');
    w.setController('exc_X', 'chr_A');
    ok(w);
    const v = w.testHooks().lastView!;
    const base = v.flows.get('FDL')!.sysSide!;
    const check = (sx: SysSideFlows): string[] => {
      const flows = v.flows.clone(); flows.set('FDL', { ...v.flows.get('FDL')!, sysSide: sx });
      return L.SYS_INVARIANTS.flatMap(([, c]) => c({ ...v, flows })).map((f) => f.invariantId);
    };
    expect(check(base)).toEqual([]);
    const killed: string[] = []; const survived: string[] = [];
    const scalars = ['F_p', 'K_p', 'F_s', 'K_s', 'C_p', 'C_s', 'm0PlayerDelta', 'sysDelta', 'netFlow', 'netDelta'] as const;
    for (const k of scalars) (check({ ...base, [k]: base[k] + 1n }).length ? killed : survived).push(k);
    for (const m of ['faucet', 'sink', 'controlIn', 'controlOut', 'treasury'] as const)
      for (const [key, val] of base[m]) { const mm = base[m].clone(); mm.set(key, val + 1n); (check({ ...base, [m]: mm }).length ? killed : survived).push(`${m}.${key}`); }
    for (const [mapName, map] of [['byHolder', base.byHolder], ['byRivalTag', base.byRivalTag]] as const)
      for (const [cls, terms] of map) for (const k of L.TERM_KEYS) {
        const mm = map.clone() as typeof map; (mm as SortedMap<string, L.HolderTerms>).set(cls, { ...terms, [k]: terms[k] + 1n });
        (check({ ...base, [mapName]: mm }).length ? killed : survived).push(`${mapName}.${cls}.${k}`);
      }
    expect(survived).toEqual([]);
    expect(killed.length).toBeGreaterThan(60);
  });
});

describe('Δ9/Δ10 control timing (tests 16, 17, 20)', () => {
  it('16: control bought at t: the fee at t is X_out, CONTROL_OUT at t with m(X) at end of t; from t+1 fees add 0', () => {
    const w = fixture(); fund(w, [['chr_P', 100], ['exc_X', 10]]);
    w.apiFor('05').ledger.pay('chr_P', 'exc_X', M(2), 'FDL', 'MKT_EXCHANGE_FEE'); w.setController('exc_X', 'chr_A');
    const t = ok(w); const s = sys(w, t);
    expect(s.sink.get('MKT_EXCHANGE_FEE')).toBe(M(2)); expect(s.controlOut.get('exc_X')).toBe(M(12));
    const ce = w.entryLog().filter((e) => e.reason === 'LED_CONTROL_OUT');
    expect(ce.length).toBe(1); expect(ce[0].tick).toBe(t); expect(ce[0].headline!.amount).toBe(M(12));
    w.apiFor('05').ledger.pay('chr_P', 'exc_X', M(2), 'FDL', 'MKT_EXCHANGE_FEE');
    expect(L.sumMap(sys(w, ok(w)).sink)).toBe(0n);
  });
  it('16 + 20: two flips in one tick are emitted in sorted id order; both insertion orders give the same entry ids and hash', () => {
    const run = (order: string[]) => {
      const w = fixture(); w.registerEntity({ id: 'exc_Y' }); fund(w, [['exc_X', 5], ['exc_Y', 6]]);
      for (const id of order) w.setController(id, 'chr_A');
      ok(w); return w.entryLog().filter((e) => e.reason === 'LED_CONTROL_OUT').map((e) => `${e.entryId}|${e.meta?.parties[0]}|${e.headline?.amount}`);
    };
    const a = run(['exc_X', 'exc_Y']); const b = run(['exc_Y', 'exc_X']);
    expect(a).toEqual(b); expect(a.map((x) => x.split('|')[1])).toEqual(['exc_X', 'exc_Y']);
    expect(L.hashHex(L.canonEncode(a))).toBe(L.hashHex(L.canonEncode(b)));
  });
  it('17 E12 launder: fees pile up in NPC exc_X over 5 days; a player takes control; archive controlOut = m(X); faucet unchanged; alarm fires', () => {
    const w = fixture({ params: { led_code_alarm_floor: 1 } }); fund(w, [['chr_P', 100_000]]);
    for (let d = 0; d < 5; d++) { w.apiFor('05').ledger.pay('chr_P', 'exc_X', M(1000), 'FDL', 'MKT_EXCHANGE_FEE'); w.runTicks(720); }
    const day = Math.floor(w.tick / 720);
    w.setController('exc_X', 'chr_A'); w.runTicks(720 - (w.tick % 720));
    const row = w.flowReader().archiveDay('FDL', day)!;
    expect(row.sys.controlOut.get('exc_X')).toBe(M(5000));
    expect(L.sumMap(row.sys.faucet)).toBe(0n); expect(row.byClass.get('FAUCET') ?? 0n).toBe(0n);
    expect(w.alerts.some((a) => a.invariantId === 'LED-CONTROL-GROSS')).toBe(true);
  });
  it('20: a player buys control of Q at t: Q tick-t flows are npcFirm; LED_HOLDER_RECLASS npcFirm → human at t with m(Q); from t+1 human', () => {
    const w = fixture(); fund(w, [['chr_P', 100], ['cmp_N', 9]]);
    w.apiFor('21').ledger.pay('chr_P', 'cmp_N', M(1), 'FDL', 'ADM_CORRECTION_TRANSFER'); w.setController('cmp_N', 'chr_P');
    const t = ok(w); const s = sys(w, t);
    expect(s.byHolder.get('npcFirm')!.intraIn).toBe(M(1)); expect(s.byHolder.get('npcFirm')!.reclassOut).toBe(M(10));
    expect(s.byHolder.get('human')!.reclassIn).toBe(M(10));
    const rc = w.entryLog().filter((e) => e.reason === 'LED_HOLDER_RECLASS'); expect(rc.length).toBe(1); expect(rc[0].headline!.amount).toBe(M(10));
    w.apiFor('21').ledger.pay('chr_P', 'cmp_N', M(1), 'FDL', 'ADM_CORRECTION_TRANSFER');
    const s2 = sys(w, ok(w)); expect([s2.byHolder.get('npcFirm')!.intraIn, s2.byHolder.get('human')!.intraIn]).toEqual([0n, 0n]);
  });
});

describe('Δ7 archive (tests 11, 12) and INV-LED-017', () => {
  it('11 E9 hoarding: 30 days of taxes with no spending: m0sysDelta 0 while archive netDelta < 0 every day', { timeout: 120_000 }, () => {
    const w = fixture(); fund(w, [['chr_P', 1_000_000]]); w.runTicks(720 - (w.tick % 720));
    const d0 = Math.floor(w.tick / 720);
    for (let d = 0; d < 30; d++) { w.apiFor('03').ledger.pay('chr_P', 'gov_FDL', M(100), 'FDL', 'TAX_SECURITIES_TX'); w.runTicks(720); }
    for (let d = d0; d < d0 + 30; d++) {
      const row = w.flowReader().archiveDay('FDL', d)!;
      expect(row.m0sysDelta).toBe(0n); expect(row.sys.netDelta).toBe(-M(100)); expect(row.sys.netDelta < 0n).toBe(true);
    }
  });
  const longRun = process.env.TYCOON_LONG === '1';
  // Producer-approved gate (03#39 pattern): default = a short run with flowday_keep_days 2 and the same invariants; TYCOON_LONG=1
  // (nightly CI) runs the spec's 2 chapters = 1,344 game days = 967,680 ticks with the real 364-day FlowDay retention.
  const DAYS = longRun ? 1344 : 6; const KEEP = longRun ? 364 : 2;
  it(`12: ${DAYS} days: every archive row = Σ of its ticks (INV-017 each day close), FlowDay drops rows older than ${KEEP} days, archive keeps all; a broken hash fails`, { timeout: longRun ? 3_600_000 : 60_000 }, () => {
    const w = fixture({ params: { flowday_keep_days: KEEP } }); fund(w, [['chr_P', 1_000_000]]);
    for (let d = 0; d < DAYS; d++) {
      w.apiFor('03').ledger.pay('chr_P', 'gov_FDL', BigInt(d + 1), 'FDL', 'TAX_SECURITIES_TX');
      for (let i = 0; i < 720; i++) expect(w.runP13().failures).toEqual([]);
    }
    const days = Math.floor(w.tick / 720);
    for (let d = 0; d < days; d++) expect(w.flowReader().archiveDay('FDL', d)).toBeDefined();
    expect(w.flowReader().dayFlows('FDL', 0)).toBeUndefined(); expect(w.flowReader().dayFlows('FDL', days - 1)).toBeDefined();
    const rows = Array.from({ length: days }, (_, d) => w.flowReader().archiveDay('FDL', d)!);
    expect(L.verifyArchiveChain(rows)).toEqual([]);
    const bad = rows.map((r, i) => (i === 1 ? { ...r, m0sysDelta: r.m0sysDelta + 1n } : r));
    expect(L.verifyArchiveChain(bad).length).toBeGreaterThan(0);
  });
  it('INV-LED-017 mutation: a day row that differs from Σ of its ticks by 1n fails', () => {
    const w = fixture(); w.apiFor('21').ledger.mint('chr_P', 5n, 'FDL', 'ADM_CORRECTION_IN'); w.runTicks(720);
    const row = w.flowReader().archiveDay('FDL', 0)!;
    const ticks = Array.from({ length: 720 }, (_, t) => w.flowReader().tickFlows('FDL', t)!).filter(Boolean) as TickFlows[];
    expect(L.INV_LED_017(row, ticks, undefined)).toEqual([]);
    const f = { ...row, sys: { ...row.sys, F_p: row.sys.F_p + 1n } };
    expect(L.INV_LED_017({ ...f, hash: L.archiveHash(f) }, ticks, undefined).map((x) => x.invariantId)).toContain('INV-LED-017');
  });
});

describe('Δ8 hooks and Δ11 worlds (tests 13, 15, 25)', () => {
  it('13: modules b and a: per tick a:EUN, a:FDL, …, b:EUN, … once each, after P13; frozen; snapshot/restore never re-fires', () => {
    const w = fixture(); const log: string[] = [];
    w.registerTickFlowsHook('b', (_f, at) => log.push(`b:${at.ccy}:${at.tick}`));
    w.registerTickFlowsHook('a', (_f, at) => log.push(`a:${at.ccy}:${at.tick}`));
    ok(w);
    expect(log).toEqual(['a', 'b'].flatMap((m) => ['EUN', 'FDL', 'NKR', 'PYN', 'SRL'].map((c) => `${m}:${c}:0`)));
    for (let i = 0; i < 99; i++) ok(w);
    const snap = w.checkpoint(); log.length = 0;
    for (let i = 0; i < 50; i++) ok(w);
    w.restore(snap); for (let i = 0; i < 50; i++) ok(w);
    const fdlA = log.filter((x) => x.startsWith('a:FDL:')).map((x) => Number(x.split(':')[2]));
    expect(fdlA).toEqual(Array.from({ length: 50 }, (_, i) => 100 + i));
  });
  it('13: inside a hook, any writer throws and mutating flows throws', () => {
    const w = fixture(); const errs: string[] = [];
    w.registerTickFlowsHook('a', (f) => {
      try { w.apiFor('21').ledger.mint('chr_P', 1n, 'FDL', 'ADM_CORRECTION_IN'); } catch (e) { errs.push(String(e)); }
      try { f.byCode.set('X', 1n); } catch (e) { errs.push(String(e)); }
      try { (f as { tick: number }).tick = 9; } catch (e) { errs.push(String(e)); }
    });
    ok(w); expect(errs.length).toBe(15);
  });
  it('13: two seeded runs give byte-identical hook call logs; registering after start throws', () => {
    const run = () => { const w = fixture(); const log: string[] = []; w.registerTickFlowsHook('q', (f, at) => log.push(`${at.ccy}:${at.tick}:${f.byClass.get('FAUCET') ?? 0n}`));
      for (let i = 0; i < 5; i++) { w.apiFor('21').ledger.mint('chr_P', BigInt(i + 1), 'FDL', 'ADM_CORRECTION_IN'); w.runP13(); }
      expect(() => w.registerTickFlowsHook('z', () => undefined)).toThrow(); return L.hashHex(L.canonEncode(log)); };
    expect(run()).toBe(run());
  });
  it('15 + 25: two worlds in one process: own cursors (12 and 3), own logs; W2 restore re-fires nothing, W1 untouched; no module-scope let/var', async () => {
    const mk = () => { const w = fixture(); const log: number[] = []; w.registerTickFlowsHook('q', (_f, at) => { if (at.ccy === 'FDL') log.push(at.tick); }); return { w, log }; };
    const W1 = mk(); const W2 = mk();
    for (let i = 0; i < 10; i++) W1.w.runP13();
    W2.w.runP13(); const snap = W2.w.checkpoint(); W2.w.runP13(); W2.w.runP13();
    for (let i = 0; i < 2; i++) W1.w.runP13();
    expect([W1.log.length, W2.log.length]).toEqual([12, 3]);
    expect(W1.log).toEqual(Array.from({ length: 12 }, (_, i) => i)); expect(W2.log).toEqual([0, 1, 2]);
    W2.w.restore(snap); W2.w.runP13(); W2.w.runP13();
    expect(W2.log).toEqual([0, 1, 2]); expect(W1.log.length).toBe(12);
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../src/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const top = readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => /^(export )?(let|var) /.test(l));
      expect(top, f).toEqual([]);
    }
    // Test 25: the ledger has no installLedger(); each LedgerWorld owns its hooks and cursor. Process-global state is limited to
    // const tables plus the PARSED account-key memo in accounts.ts (pure cache; listed as a gap in the PR).
  });
  it('18: a stub controller fed by FlowReader.netFlow gives identical output with and without a control flip of a 0-balance entity', () => {
    const run = (flip: boolean) => { const w = fixture(); fund(w, [['chr_P', 100]]); const out: bigint[] = [];
      for (let i = 0; i < 20; i++) { w.apiFor('03').ledger.pay('chr_P', 'gov_FDL', BigInt(i + 1), 'FDL', 'TAX_SECURITIES_TX'); if (flip && i === 5) w.setController('exc_X', 'chr_A');
        const t = w.tick; w.runP13(); out.push(w.flowReader().netFlow('FDL', t)); } return out; };
    expect(run(true)).toEqual(run(false));
  });
  it.todo('18 static: Stabilizer and sinkMult modules must not import controlIn/controlOut (vacuous until those modules exist; listed as a gap)');
});

describe('E-13 rival sub-tags (INV-LED-023)', () => {
  const rivals = () => {
    const w = fixture();
    for (const id of ['npc_PRIN', 'cmp_H']) w.registerEntity({ id });
    w.registerEntity({ id: 'fnd_R', ownerId: 'npc_PRIN' }); w.setRole('npc_PRIN', 'FUND_PRINCIPAL'); w.setDynastyHolding('cmp_H');
    fund(w, [['cmp_H', 50], ['gov_FDL', 10]]); return w;
  };
  it('1: mint 7 to R → rival.fund F_p 7; H pays gov 3 → rival.dynasty X_out 3; R pays H 2 → sub-intra 2, class intra 0; (a)-(c) exact', () => {
    const w = rivals(); const api = (m: string) => w.apiFor(m).ledger;
    api('14').mint('fnd_R', M(7), 'FDL', 'ACCT_START_CASH'); api('03').pay('cmp_H', 'gov_FDL', M(3), 'FDL', 'TAX_SECURITIES_TX');
    const s1 = sys(w, ok(w)); const tag = (s: SysSideFlows, x: L.RivalTag) => s.byRivalTag.get(x)!;
    expect([tag(s1, 'rival.fund').F_p, tag(s1, 'rival.dynasty').F_p, s1.byHolder.get('npcRival')!.F_p]).toEqual([M(7), 0n, M(7)]);
    expect(tag(s1, 'rival.dynasty').X_out).toBe(M(3));
    api('21').pay('fnd_R', 'cmp_H', M(2), 'FDL', 'ADM_CORRECTION_TRANSFER');
    const s2 = sys(w, ok(w));
    expect([tag(s2, 'rival.fund').subIntraOut, tag(s2, 'rival.dynasty').subIntraIn, s2.byHolder.get('npcRival')!.intraIn, s2.netFlow]).toEqual([M(2), M(2), 0n, 0n]);
  });
  it('2: H buys control of R at t: tick-t flows stay rival.fund; LED_HOLDER_RECLASS fund → dynasty at m(R); from t+1 dynasty; npcRival totals unchanged', () => {
    const w = rivals(); w.apiFor('14').ledger.mint('fnd_R', M(7), 'FDL', 'ACCT_START_CASH'); ok(w);
    w.apiFor('21').ledger.pay('cmp_H', 'fnd_R', M(1), 'FDL', 'ADM_CORRECTION_TRANSFER'); w.setController('fnd_R', 'cmp_H');
    const s = sys(w, ok(w));
    expect(s.byRivalTag.get('rival.fund')!.subIntraIn).toBe(M(1));
    expect([s.byRivalTag.get('rival.fund')!.subReclassOut, s.byRivalTag.get('rival.dynasty')!.subReclassIn]).toEqual([M(8), M(8)]);
    expect([s.byHolder.get('npcRival')!.reclassIn, s.byHolder.get('npcRival')!.reclassOut]).toEqual([0n, 0n]);
    expect(w.sideTag('fnd_R')).toEqual({ side: 'N', cls: 'npcRival', tag: 'rival.dynasty' });
  });
  it('3: a dynasty 20% stake (not control) in an NPC listed company leaves it npcFirm', () => {
    const w = rivals(); // T03-16 control graph: a minority stake never sets ownerId
    expect(w.sideTag('cmp_N')).toEqual({ side: 'N', cls: 'npcFirm' });
  });
  it('4: a shell under H is rival.dynasty, independent of insertion order (G8)', () => {
    const tagOf = (order: string[]) => { const w = fixture(); for (const id of order) w.registerEntity({ id, ownerId: id === 'cmp_S' ? 'cmp_H' : null }); w.setDynastyHolding('cmp_H'); ok(w); return w.sideTag('cmp_S'); };
    expect(tagOf(['cmp_H', 'cmp_S'])).toEqual({ side: 'N', cls: 'npcRival', tag: 'rival.dynasty' });
    expect(tagOf(['cmp_S', 'cmp_H'])).toEqual(tagOf(['cmp_H', 'cmp_S']));
  });
  it('5: archive: both tag day rows sum to the npcRival day row, each equals Σ of its ticks', () => {
    const w = rivals(); w.apiFor('14').ledger.mint('fnd_R', M(7), 'FDL', 'ACCT_START_CASH'); w.apiFor('03').ledger.pay('cmp_H', 'gov_FDL', M(3), 'FDL', 'TAX_SECURITIES_TX');
    w.runTicks(720 - (w.tick % 720)); const row = w.flowReader().archiveDay('FDL', 0)!;
    for (const k of L.TERM_KEYS) expect(row.sys.byRivalTag.get('rival.fund')![k] + row.sys.byRivalTag.get('rival.dynasty')![k]).toBe(row.sys.byHolder.get('npcRival')![k]);
    expect(row.sys.byRivalTag.get('rival.fund')!.F_p).toBe(M(7)); expect(row.sys.byRivalTag.get('rival.dynasty')!.X_out).toBe(M(3));
  });
});
export { view };
