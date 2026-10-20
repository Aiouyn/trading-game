// Spec §7 additions 1a, 1b, 2, 4, 6, 8 and the TickFlows / FlowDay / FlowReader plumbing (Δ2, PD-5, Δ5).
import { describe, expect, it } from 'vitest';
import { INV_LED_015, SortedMap, type TickFlows } from '../src';
import { fixture } from './fixture';


describe('flow aggregates', () => {
  it('1a no double count: MINT 5,000 FDL adds exactly 5_000_000_000n to byCode and byClass.FAUCET (not 3×, no headline)', () => {
    const w = fixture(); const t = w.tick;
    w.apiFor('14').ledger.mint('chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH');
    const r = w.runP13();
    expect(r.failures).toEqual([]);
    const f = w.flowReader().tickFlows('FDL', t) as TickFlows;
    expect(f.byCode.get('ACCT_START_CASH')).toBe(5_000_000_000n);
    expect(f.byClass.get('FAUCET')).toBe(5_000_000_000n);
    expect(f.m0sysDelta).toBe(5_000_000_000n);
    expect(w.flowReader().codeTotal('FDL', t, 'ACCT_START_CASH')).toBe(5_000_000_000n);
    expect(w.flowReader().codeTotal('FDL', t, 'NOPE')).toBe(0n);
  });
  it('1a: a TickFlows row that also adds the headline fails INV-LED-015 (b)', () => {
    const w = fixture(); const t = w.tick;
    const id = w.apiFor('14').ledger.mint('chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH');
    const e = w.apiFor('14').ledger.entryOf(id)!;
    w.runP13();
    const good = w.flowReader().tickFlows('FDL', t)!;
    const bad = { ...good, byCode: good.byCode.clone().set('ACCT_START_CASH', 10_000_000_000n) };
    const view = (f: TickFlows) => ({
      tick: t, isDayClose: false, catalog: w.catalog, entries: [e], pre: new SortedMap<string, { balance: bigint; qty: bigint }>(), post: new SortedMap(w.accounts()),
      entity: w.entity, facts: { overdraftLimit: () => 0n, intradayLimit: () => 0n }, alarm: { mult: 10, floorMicro: 0n },
      flows: new SortedMap(['EUN', 'FDL', 'NKR', 'PYN', 'SRL'].map((c) => [c, c === 'FDL' ? f : w.flowReader().tickFlows(c as 'FDL', t)!])),
    });
    expect(INV_LED_015(view(good))).toEqual([]);
    expect(INV_LED_015(view(bad)).map((x) => x.observed)).toContain('(b) byCode(FDL) differs from the flowLeg fold');
  });
  it('1b cbCredit separate: cbCredit 1,000 FDL -> TickFlows.cbCredit 1e9, m0sysDelta 0n, total M0 moves', () => {
    const w = fixture(); const t = w.tick; const m0 = w.aggregates('FDL').M0;
    w.apiFor('04').ledger.cbCredit('cbk_FDL', 'bnk_N', 1_000_000_000n, 'FDL', 'CBK_STANDING_FACILITY');
    expect(w.runP13().failures).toEqual([]);
    const f = w.flowReader().tickFlows('FDL', t)!;
    expect(f.cbCredit).toBe(1_000_000_000n);
    expect(f.m0sysDelta).toBe(0n);
    expect(f.byClass.get('CREDIT_CREATE')).toBe(1_000_000_000n);
    expect(w.aggregates('FDL').M0 - m0).toBe(1_000_000_000n);
    w.apiFor('04').ledger.cbCreditUnwind('bnk_N', 'cbk_FDL', 400_000_000n, 'FDL', 'CBK_STANDING_FACILITY_REPAY');
    expect(w.runP13().failures).toEqual([]);
    expect(w.flowReader().tickFlows('FDL', t + 1)!.cbCredit).toBe(-400_000_000n);
  });
  it('6 Q-3 contract (PD-6): cbCredit moves M0 not M0_sys; mint/burn move M0_sys exactly; a TRANSFER moves neither', () => {
    const w = fixture();
    const step = (f: () => void) => { const a = w.aggregates('FDL'); f(); expect(w.runP13().failures).toEqual([]); const b = w.aggregates('FDL'); return [b.M0 - a.M0, b.M0_sys - a.M0_sys]; };
    expect(step(() => w.apiFor('04').ledger.cbCredit('cbk_FDL', 'bnk_N', 7n, 'FDL', 'CBK_OPEN_MARKET_LEND'))).toEqual([7n, 0n]);
    expect(step(() => w.apiFor('21').ledger.mint('chr_A', 9n, 'FDL', 'ADM_CORRECTION_IN'))).toEqual([9n, 9n]);
    expect(step(() => w.apiFor('21').ledger.burn('chr_A', 4n, 'FDL', 'ADM_CORRECTION_OUT'))).toEqual([-4n, -4n]);
    expect(step(() => w.apiFor('21').ledger.pay('chr_A', 'chr_B', 5n, 'FDL', 'ADM_CORRECTION_TRANSFER'))).toEqual([0n, 0n]);
  });
  // Erratum (Producer, Δ6-B): fee and tax legs of a trade are TRANSFER legs into system treasuries (exc_, gov_); the sysSide view
  // classifies them. They were SINK legs, which T03-05 step 8 does not allow inside a SWAP_ASSET entry.
  it('8 trade with fee and tax legs (PD-5): per-leg codes, headline never added', () => {
    const w = fixture(); const t = w.tick;
    w.apiFor('21').ledger.mint('chr_A', 2_000_000_000n, 'FDL', 'ADM_CORRECTION_IN');
    w.runP13();
    w.apiFor('05').ledger.compose(
      ({ env, t: T }) => T.tplSwapAsset(env, 'chr_A', 'chr_B', 'ast_EQ_X', 10n, 1_000_000_000n, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 }),
      [({ env, t: T }) => T.tplPay(env, 'chr_A', 'exc_X', 2_000_000n, 'FDL', 'MKT_EXCHANGE_FEE'), ({ env, t: T }) => T.tplPay(env, 'chr_A', 'gov_FDL', 1_500_000n, 'FDL', 'TAX_SECURITIES_TX')],
    );
    expect(w.runP13().failures).toEqual([]);
    const f = w.flowReader().tickFlows('FDL', t + 1)!;
    expect(f.byCode.get('MKT_EXCHANGE_FEE')).toBe(2_000_000n);
    expect(f.byCode.get('TAX_SECURITIES_TX')).toBe(1_500_000n);
    expect(f.byClass.get('SINK')).toBe(0n);
    expect(f.byCode.get('MKT_TRADE')).toBe(1_000_000_000n);
    expect(f.byClass.get('TRANSFER')).toBe(1_003_500_000n);
    expect(f.byClass.get('FAUCET')).toBe(0n);
    expect(f.m0sysDelta).toBe(0n);
    expect(w.entryLog().filter((e) => e.template === 'SWAP_ASSET').length).toBe(1); // one composed entry
  });
  it('2 Δ2 cost: P13 never reads the postings archive (runP13 throws if it does), across a day close', () => {
    const w = fixture();
    for (let i = 0; i < 730; i++) { if (i % 7 === 0) w.apiFor('21').ledger.mint('chr_A', 1_000_000n, 'FDL', 'ADM_CORRECTION_IN'); w.runP13(); }
    expect(w.archiveReads).toBe(0);
  });
  it('TickFlows ring keeps led_tickflows_keep ticks; FlowDay keeps flowday_keep_days and rolls at t = 719', () => {
    const w = fixture({ params: { flowday_keep_days: 2 } });
    w.apiFor('21').ledger.mint('chr_A', 3_000_000n, 'FDL', 'ADM_CORRECTION_IN');
    w.runTicks(720 * 3 + 5);
    const R = w.flowReader();
    expect(R.tickFlows('FDL', 0)).toBeUndefined();
    expect(R.tickFlows('FDL', w.tick - 720)).toBeDefined();
    expect(R.tickFlows('FDL', w.tick - 721)).toBeUndefined();
    expect(R.dayFlows('FDL', 0)).toBeUndefined();
    expect(R.dayFlows('FDL', 1)).toBeDefined();
    expect(R.dayFlows('FDL', 2)!.M0_sys).toBe('3000000');
    const t = fixture(); t.apiFor('21').ledger.mint('chr_A', 3_000_000n, 'FDL', 'ADM_CORRECTION_IN'); t.runTicks(720);
    expect(t.flowReader().dayFlows('FDL', 0)!.byCode).toEqual({ ADM_CORRECTION_IN: '3000000' });
    expect(t.flowReader().dayFlows('FDL', 0)!.byClass.FAUCET).toBe('3000000');
  });
  it('4 Δ4 replay: re-running P13 for a committed tick posts nothing; a scheduled accrual replayed after restore posts once', () => {
    const mk = () => {
      const w = fixture();
      w.registerProcess({ name: 'led.mtm', module: '03', run: (tick) => [{ subject: 'chr_P', post: (L) => { L.accrue('chr_P', BigInt(tick + 1), 'FDL', 'LED_MTM_DAILY', 1500, 4060); } }] });
      return w;
    };
    const a = mk(); a.runTicks(10);
    expect(a.runP13(5)).toMatchObject({ replay: true, applied: 0 });
    expect(a.entryLog().length).toBe(10);
    const b = mk(); b.runTicks(5); const cp = b.checkpoint(); b.runTicks(5);
    b.restore(cp); b.runTicks(5);
    expect(b.entryLog().length).toBe(10);
    expect(b.snapshot()).toBe(a.snapshot()); // INV-LED-013 is checked inside snapshot()
    expect(b.balance('chr_P:1500:FDL')).toBe(55n);
  });
  it('L16 intent envelope stub: duplicate intentId or non-increasing nonce -> REJECT_REPLAY', () => {
    const w = fixture();
    expect(w.intents.accept('int_1', 'chr_P', 1)).toBe('OK');
    expect(w.intents.accept('int_1', 'chr_P', 2)).toBe('REJECT_REPLAY');
    expect(w.intents.accept('int_2', 'chr_P', 1)).toBe('REJECT_REPLAY');
    expect(w.intents.accept('int_3', 'chr_P', 2)).toBe('OK');
    const id = w.apiFor('14', 'P12', 'int_3').ledger.mint('chr_P', 1n, 'FDL', 'ACCT_START_CASH');
    w.runP13();
    expect(w.entryLog().find((e) => e.entryId === id)!.requestedBy.intentId).toBe('int_3');
  });
});
