
import { describe, expect, it } from 'vitest';
import { CONFLICT_ESCROW_TICKS, isReject } from '../src';
import { fixture } from './fixture';
describe('smoke', () => {
  it('mint + pay sysSide', () => {
    const w = fixture(); const t = w.tick;
    w.apiFor('14').ledger.mint('chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH');
    const r = w.runP13(); expect(r.failures).toEqual([]);
    const s = w.flowReader().tickFlows('FDL', t)!.sysSide!;
    console.log(JSON.stringify({ F_p: String(s.F_p), N: String(s.netFlow), X_in: [...s.faucet.entries()].map(String), sides: w.sideTag('chr_P'), gov: w.sideTag('gov_FDL'), exc: w.sideTag('exc_X') }));
  });
  it('escrow', () => {
    const w = fixture(); const t0 = w.tick;
    w.apiFor('14').ledger.mint('chr_A', 1_000_000_000n, 'FDL', 'ACCT_START_CASH'); expect(w.runP13().failures).toEqual([]);
    const id = w.apiFor('12').ledger.escrowPlace('chr_A', 'chr_B', 400_000_000n, 'FDL', 'CONFLICT_CASH_LOOT', 'esc_1', 'op_1');
    const r = w.runP13(); console.log(JSON.stringify(r.failures), isReject(id as never), JSON.stringify(w.escrow('esc_1'), (_, v) => typeof v === 'bigint' ? String(v) : v));
    const st = w.checkpoint(); st.tick = 120961; w.restore(st); const rr = w.runP13(); console.log('exp', JSON.stringify(rr.failures), w.escrow('esc_1')!.status, String(w.cash('chr_B','FDL')));
    console.log(String(w.cash('chr_A','FDL')), String(w.cash('chr_B','FDL')), CONFLICT_ESCROW_TICKS, t0);
  });
  it('accrual', () => {
    const w = fixture();
    w.apiFor('14').ledger.mint('chr_P', 5_000_000_000n, 'FDL', 'ACCT_START_CASH'); w.runP13();
    const id = w.apiFor('10').ledger.registerAccrual('RENT', 'PROP_RENT_CORE', 'cmp_N', 'chr_P', 'FDL');
    console.log('acc', JSON.stringify(id));
    if (typeof id === 'string') { w.apiFor('10').ledger.accrueOn(id, 100_000_000n); console.log(JSON.stringify(w.runP13().failures));
      console.log(w.apiFor('10').ledger.settleAccrual(id, 100_000_000n, 'PROP_RENT_CORE')); console.log(JSON.stringify(w.runP13().failures), JSON.stringify(w.accrual(id), (_, v) => typeof v === 'bigint' ? String(v) : v)); }
  });
});
