// Formal money check for the engine ledger (packages/engine/ledger).
// Tool: fast-check on the real LedgerWorld writers (mint, burn, pay, compose of SWAP_ASSET + one fee pay).
// A hand model would miss applyPosting. There is no TypeScript proof tool in this repo.
//
// Properties, each as the accounts name them:
// - Sum of every account balance stays 0. applyPosting is the only balance write (world.ts). Cash is not created.
// - M0_sys rises only by the minted amount and falls only by the burned amount. A transfer or a trade does not move it.
// - A trade moves the asset's qty from the seller to the buyer and nowhere else (accountsOfAsset sums to 0).
// - The exchange fee is one MKT_EXCHANGE_FEE flow leg, and chr_A / cmp_N / exc_X cash moves by exactly -(price+fee), +price, +fee.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseAccountKey, type LedgerWorld, type Money } from '../src';
import { fixture } from './fixture';

const BUYER = 'chr_A';
const SELLER = 'cmp_N';
const EXCHANGE = 'exc_X';
const ASSET = 'ast_EQ_N';
const CCY = 'FDL' as const;

/** 0 means the books did not create or destroy a cent. A non-zero gap is the counterexample. */
export function balanceGap(sum: bigint): string | null {
  return sum === 0n ? null : `account balances sum to ${sum}; a posting created or destroyed cash`;
}

function sumBalances(w: LedgerWorld): bigint {
  let s = 0n;
  for (const [, b] of w.accounts()) s += b.balance;
  return s;
}

/** Qty of `asset` on every account, not only qty-bearing chart codes. accountsOfAsset skips the seller leg
 *  the trade uses (2600 is not qty-bearing); INV-LED-001 sums every sub, and that sum is the supply. */
function sumQty(w: LedgerWorld, asset: string): bigint {
  let s = 0n;
  for (const [k, b] of w.accounts()) if (parseAccountKey(k)?.sub === asset) s += b.qty;
  return s;
}

/** One committed tick. `m0` is how much M0_sys this tick may create (mint) or destroy (burn). */
function commit(w: LedgerWorld, m0: Money, post: () => void): void {
  const beforeM0 = w.aggregates(CCY).M0_sys;
  const beforeSum = sumBalances(w);
  expect(balanceGap(beforeSum)).toBeNull();
  post();
  const tick = w.tick;
  const result = w.runP13();
  expect(result.failures, `tick ${tick}`).toEqual([]);
  expect(balanceGap(sumBalances(w))).toBeNull();
  expect(w.aggregates(CCY).M0_sys - beforeM0).toBe(m0);
  expect(w.entryLog().filter((e) => e.tick === tick && e.invalid)).toEqual([]);
}

describe('formal money: ledger postings', () => {
  it('a non-zero balance sum is a cash leak (the check can fail)', () => {
    expect(balanceGap(0n)).toBeNull();
    expect(balanceGap(1n)).toMatch(/created or destroyed cash/);
  });

  it('mint and burn move M0_sys once; a transfer and a trade do not; the trade fee is charged once; qty sums to 0', () => {
    fc.assert(fc.property(
      fc.integer({ min: 100_000, max: 5_000_000 }),
      fc.integer({ min: 2, max: 6 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 20, max: 200 }),
      (mintUnits, payDiv, qtyUnits, feeDiv) => {
        const w = fixture();
        expect(balanceGap(sumBalances(w))).toBeNull();
        const minted = BigInt(mintUnits);
        commit(w, minted, () => { w.apiFor('21').ledger.mint(BUYER, minted, CCY, 'ADM_CORRECTION_IN'); });
        expect(w.aggregates(CCY).M0_sys).toBe(minted);

        const pay = w.available(BUYER, CCY) / BigInt(payDiv);
        expect(pay > 0n).toBe(true);
        const buyerBeforePay = w.cash(BUYER, CCY);
        const sellerBeforePay = w.cash(SELLER, CCY);
        commit(w, 0n, () => { w.apiFor('21').ledger.pay(BUYER, SELLER, pay, CCY, 'ADM_CORRECTION_TRANSFER'); });
        expect(w.cash(BUYER, CCY) - buyerBeforePay).toBe(-pay);
        expect(w.cash(SELLER, CCY) - sellerBeforePay).toBe(pay);

        const qty = BigInt(qtyUnits);
        const price = w.available(BUYER, CCY) / 4n;
        const fee = price / BigInt(feeDiv);
        expect(price > fee && fee > 0n).toBe(true);
        const buyer0 = w.cash(BUYER, CCY);
        const seller0 = w.cash(SELLER, CCY);
        const exch0 = w.cash(EXCHANGE, CCY);
        const pos0 = sumQty(w, ASSET);
        const tick = w.tick;
        commit(w, 0n, () => {
          w.apiFor('05').ledger.compose(
            ({ env, t }) => t.tplSwapAsset(env, BUYER, SELLER, ASSET, qty, price, CCY, 'MKT_TRADE', { assetAcct: 1500, assetAcctFrom: 2600 }),
            [({ env, t }) => t.tplPay(env, BUYER, EXCHANGE, fee, CCY, 'MKT_EXCHANGE_FEE')],
          );
        });
        const traded = w.entryLog().filter((e) => e.tick === tick);
        expect(traded).toHaveLength(1);
        const feeLegs = traded[0]!.postings.filter((p) => p.flowLeg === true && p.reason === 'MKT_EXCHANGE_FEE');
        expect(feeLegs).toHaveLength(1);
        expect(feeLegs[0]!.amount).toBe(fee);
        expect(w.cash(BUYER, CCY) - buyer0).toBe(-(price + fee));
        expect(w.cash(SELLER, CCY) - seller0).toBe(price);
        expect(w.cash(EXCHANGE, CCY) - exch0).toBe(fee);
        expect(w.position(BUYER, ASSET)).toBe(qty);
        expect(w.position(SELLER, ASSET)).toBe(-qty);
        expect(sumQty(w, ASSET)).toBe(pos0);

        const burn = w.available(BUYER, CCY) / 5n;
        expect(burn > 0n).toBe(true);
        const m0 = w.aggregates(CCY).M0_sys;
        commit(w, -burn, () => { w.apiFor('21').ledger.burn(BUYER, burn, CCY, 'ADM_CORRECTION_OUT'); });
        expect(w.aggregates(CCY).M0_sys).toBe(m0 - burn);
      },
    ), { numRuns: 40, seed: 20261112 });
  });
});
