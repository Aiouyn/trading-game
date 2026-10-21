// Seeded random driver posting valid FAUCET / SINK / TRANSFER / CREDIT / REVALUE entries, incl. composed entries and cbCredit.
import type { LedgerWorld } from '../src';
import { fixture, prng } from './fixture';

const PEOPLE = ['chr_A', 'chr_B', 'chr_P', 'cmp_N', 'fnd_F'];

export function driverWorld(): LedgerWorld {
  return fixture();
}
/** Posts 0..4 random valid operations into the open tick. */
export function driveTick(w: LedgerWorld, rnd: () => number, loans: { id: string; amt: bigint; borrower: string }[]): void {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const amt = (max: number): bigint => BigInt(1 + Math.floor(rnd() * max));
  const n = Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const op = Math.floor(rnd() * 9);
    const a = pick(PEOPLE); const b = pick(PEOPLE.filter((x) => x !== a));
    const av = w.available(a, 'FDL');
    switch (op) {
      case 0: w.apiFor('21').ledger.mint(a, amt(5_000_000_000), 'FDL', 'ADM_CORRECTION_IN'); break;
      case 1: if (av > 0n) w.apiFor('21').ledger.burn(a, 1n + (av - 1n) / 3n, 'FDL', 'ADM_CORRECTION_OUT'); break;
      case 2: if (av > 0n) w.apiFor('21').ledger.pay(a, b, 1n + (av - 1n) / 2n, 'FDL', 'ADM_CORRECTION_TRANSFER'); break;
      case 3: w.apiFor('09').ledger.elasticIn('hh_C1', 'biz_B', amt(1_000_000_000), 'FDL', 'BIZ_SALES_HH'); break;
      case 4: w.apiFor('04').ledger.cbCredit('cbk_FDL', 'bnk_N', amt(1_000_000_000), 'FDL', 'CBK_STANDING_FACILITY'); break;
      case 5: { const r = w.available('bnk_N', 'FDL'); if (r > 0n) w.apiFor('04').ledger.cbCreditUnwind('bnk_N', 'cbk_FDL', 1n + (r - 1n) / 2n, 'FDL', 'CBK_STANDING_FACILITY_REPAY'); break; }
      case 6: {
        const loan = loans.find((l) => w.balance(`${l.borrower}:1010:bnk_N:FDL`) >= l.amt);
        if (loan && rnd() < 0.5) { w.apiFor('07').ledger.repay(loan.borrower, 'bnk_N', loan.amt, 'FDL', 'BNK_LOAN_REPAY', loan.id); loans.splice(loans.indexOf(loan), 1); }
        else { const id = `ln_${w.tick}_${i}`; const x = amt(3_000_000_000); w.apiFor('07').ledger.lend('bnk_N', a, x, 'FDL', 'BNK_LOAN_DRAWDOWN', id); loans.push({ id, amt: x, borrower: a }); }
        break;
      }
      case 7: w.apiFor('03').ledger.accrue(a, amt(1_000_000) - 500_000n, 'FDL', 'LED_MTM_DAILY', 1500, 4060); break;
      case 8: if (av > 4n) {
        const price = 1n + (av - 1n) / 2n; const fee = 1n + price / 100n;
        w.apiFor('05').ledger.compose(
          ({ env, t }) => t.tplSwapAsset(env, a, 'cmp_N', 'ast_EQ_N', amt(10), price, 'FDL', 'MKT_TRADE', { assetAcctFrom: 2600 }),
          [({ env, t }) => t.tplPay(env, a, 'exc_X', fee, 'FDL', 'MKT_EXCHANGE_FEE')], // erratum: trade fees are TRANSFER legs into a system treasury (Δ6-B)
        );
        if (a === 'cmp_N') w.testHooks().queue.pop(); // no self-trade
        break;
      }
    }
  }
}
export function runDriver(seed: number, ticks: number, onTick?: (w: LedgerWorld, r: ReturnType<LedgerWorld['runP13']>, before: ReturnType<LedgerWorld['aggregates']>) => void): LedgerWorld {
  const w = driverWorld(); const rnd = prng(seed); const loans: { id: string; amt: bigint; borrower: string }[] = [];
  for (let t = 0; t < ticks; t++) {
    driveTick(w, rnd, loans);
    const before = w.aggregates('FDL');
    const r = w.runP13();
    onTick?.(w, r, before);
  }
  return w;
}
