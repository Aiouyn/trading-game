# Bank liquidity reference

`src/server/bank-liquidity` is an offline FDL engine. It is not mounted in the web application.
`docs/v1/V1-BOARD.md:84` excludes banks beyond flagged-off systems and excludes businesses.
`BANK_LIQUIDITY_DEFAULT_ENABLED` is false. `BankLiquidityEngine.open(store, genesis)` rejects before touching the store.
Only offline tests and proofs pass the explicit third argument `true`. No environment flag or player activation path exists.

## Ownership

The engine owns its seed reserves, SIGHT liabilities, settlement wallets, asset holdings, debt notes, DGF cash, MMF custody, and estates.
It never reads or mirrors live AuthService balances. `snapshot()` returns a diagnostic clone, not a public response contract.
`publicView()` returns confidence bands rather than raw confidence or holder flows.
`holderView(owner)` is an offline projection. A future adapter must authenticate the owner before using it.

Existing loan pools are readonly asset contracts. This engine cannot originate, draw, repay, change terms, or refinance a loan.
The owner's bank credit-creation decision applies to the lending owner, not to this engine.
`sys/banking` and `sys/credit` already overlap in loan ownership. Their reconciliation is required before any mount.
There is no business entity lifecycle, property system, consumer underwriting, or company management here.

## Input and timing

`open` accepts a strictly decoded genesis. `advance(targetTick, frames)` accepts stamped observations and owned intents.
Money crosses the boundary as canonical decimal integer micro-FDL strings. Signed prices are allowed only for acquisition bids.
Plain objects have exact fields. Arrays must be dense, unaliased, and have no named properties.
Accessors, classes, hidden or symbol keys, nonfinite numbers, negative zero, undefined, and Proxies are rejected.
Node's intrinsic Proxy check precedes all reflection, including for revoked and callable Proxies.

Every hour, including tick0, requires complete bank facts and asset marks. Every day close also requires facts.
Confidence and NPC hazards run at `t % 30 == 0`. Capital status, reserve penalties, and insurance premiums run at `t % 720 == 719`.
Auctions last30 ticks. Insurance becomes due720 ticks after failure. The liquidation target is14 game days.
The charter ban imports the core chapter constant. A jump executes the same literal tick order as incremental calls.

Asset bids are finite stamped book snapshots. A bid executes only at its observation tick.
The bid quantity and20% bond ADV are shared across all banks for that tick.
Purchases spend the dealer's actual settlement cash or the acquiring bank's actual reserves.
Bank purchases pass post-trade capital and leverage checks. No bid is replenished between observations.
Asset risk weights, public losses, marks, and contractual inflows are readonly producer facts, not outputs fabricated by this unit.

## Resolution

Real reserve shortages queue payments. The engine cannot overdraw reserves.
Hourly responses can sell HQLA, then existing loan pools. Interbank matching, repo, CB facilities, and pre-failure mergers are not implemented.
Day-close solvency, liquidity, and regulator triggers open a mandatory auction.

The executable tools are funded whole-bank P&A, eligible liability-to-equity bail-in, and finite-book liquidation.
Charter applicants and partial acquisition packages are unsupported. A bail-in cannot substitute capital for missing settlement reserves.
Least-cost choice compares executable tools. A SIB prefers an executable bail-in.
An expired auction does not imply a buyer exists.

Insurance aggregates each beneficial-owner group per bank under the$250,000 cap.
DGF payments transfer actual funded cash into a SIGHT account at the largest ACTIVE NPC bank and create a subrogated claim.
New insured accounts accept ordinary owned MOVE intents. An exhausted DGF leaves an explicit unpaid entitlement.
The treasury backstop in07:571 is excluded under the no-rescue scope. The full-spec720-tick guarantee is therefore not claimed when the fund is short.

Liquidation pays actual collateral coverage first, then costs, insured claims/DGF, uninsured natural deposits, other uninsured deposits, senior, subordinated, AT1, and equity.
Dust uses hash order. Secured deficiencies join senior claims. Creditors lose unpaid unprotected claims after the estate has no assets.
Unpaid insured claims are never erased as a paid guarantee. An unsold asset at14 days leaves a pending estate.
The owner loses the charter and ownership rights. Outside assets are not seized. A voluntary pre-failure capital injection spends actual owner cash.

## Accounting and durability

M0 is bank reserves plus outside settlement cash, DGF cash, MMF custody, and authority cash.
M0 plus explicit player-bank reserve-penalty sinks equals opening M0.
Each bank retains `assets = deposits + other liabilities + equity`, including negative equity.
Asset quantities cannot appear or disappear. MMF claims equal actual custody cash.
Broad money changes through funded cash/deposit conversion, bail-in, and real loss recognition. This engine has no deposit-issuance API.

A canonical journal covers genesis, frames, target tick, and the reconstructed-state digest.
Object field order does not affect replay. Array order remains meaningful.
Refused intent IDs retain their fingerprint. Conflicting retries fail without publication.
A failed save or stale facade cannot publish a partial transfer.
File stores use revision CAS, an exclusive path lock, an fsynced temporary file, and rename.
Stale crash locks fail closed. Parent-directory fsync and automatic lock takeover are not promised.

## Verification artifacts

The unit tests are `tests/unit/bank-liquidity/liquidity.test.ts`.
`tools/proofs/sys-bank-liquidity.ts` requires a new output directory and creates fresh physical stores.
It compares jump, stamped-hour/day, restart, and short literal-every-tick execution, including canonical checkpoint bytes.
Its independent cash reconstruction, deposit-source budget, and asset-quantity checks cover acquisition, bail-in, liquidation, and a pending estate.
It also compares the bounded confidence kernel against the actual core sigmoid at961 points.
The web ES2017 target cannot import the core's BigInt-literal bit helpers, so only the bounded exp/sigmoid kernel is extracted locally.
Broker, candles, and Wire e2e are regression smoke only. No bank UI coverage or mounting approval is claimed.
