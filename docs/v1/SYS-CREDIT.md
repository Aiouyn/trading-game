# Funded retail and company credit

## Status and funding decision

`src/server/credit` is a standalone, unmounted engine. It has no dependency on sys/banking or sys/fx. It imports the base engine's `Money`, `Ccy`, `Tick`, and string ordering.

The quoted owner decision is "the game never creates money". Applying that statement to bank credit is this bot's reading, pending the owner. There is no claim of bank-specific owner approval. `export/vision-review/complete/07-BANKING-CREDIT-CLEARING.md:23` instead says a loan creates a deposit and repayment destroys one. That conflict remains open.

`funding-policy.ts` contains the current `CREDIT_MONEY_POLICY`, offer funding selection, cash transfers, and cash conservation. The current regime is `PREFUNDED_ONLY_PENDING_OWNER`. An authorized credit-creation regime belongs in that module and needs different money proofs. The current constant is a policy label, not a working switch to an implemented second regime.

## Ownership

Genesis defines a newly funded FDL world with one bank, clients, cash accounts, and one supplier. It does not copy AuthService balances. A future adapter must migrate ownership atomically and map authenticated users to actors. This engine does not expose HTTP routes, accept browser identity claims, or modify claims or Wire values.

Bank capital and explicitly opted-in lending deposits are funding lots. Lending deposits here are at-risk credit investments, not spendable SIGHT or SAVINGS custody balances or guaranteed TERM liabilities. Offers reserve actual lot cash. A drawn loan reduces lot cash and increases borrower cash by the same amount. Undrawn line cash remains reserved. Only unreserved, unloaned lot cash is withdrawable.

Principal and interest go to the actual funding lots. Commitment and enforcement fees go to bank capital. Penalty goes to funding lots, except penalties on fee-only lines with no principal, which go to bank capital. Fund selection is capital first, then fund ID. Draws and payments use proportional shares, with micro-unit remainder assigned in existing share order.

## Public API and inputs

`CreditEngine.open(store, rawGenesis)` validates genesis and replays a saved checkpoint. `advance(targetTick, rawFrames)` persists an atomic batch before publishing. `snapshot()` returns a defensive clone.

`model.ts` defines domain shapes. `tests/unit/credit/fixtures.ts` contains complete raw JSON examples. Raw money is a canonical unsigned decimal string of micro-units. Raw rates are nonnegative integral ppm. Arrays are dense JSON trees with no aliases. Unknown fields, accessors, non-enumerable properties, undefined, nonfinite values, negative zero, Date, classes, and coercible money are invalid. Root, nested, revoked, and function Proxies are rejected by `util.types.isProxy` before reflection. Neither normal decoding nor canonical domain encoding calls `toJSON`.

Every frame has a tick, ordered commands, and explicit facts or null. APPLY, ACCEPT, DRAW, and every day close need complete facts for every client. Facts contain bank status, ONR, Fear, standards, and read-only bureau rows. Company rows include annual EBITDA, outside term principal, and outside annual debt service. Outside debt and debt service exclude loans in this engine. The engine adds its own outstanding loans, pending offers, and schedules. No absent fact becomes a stale or zero observation.

Command IDs are world-wide idempotency keys. A reordered identical retry returns the original outcome. A different command with an old ID fails the entire batch. A historical frame retry must be canonically identical. Array order remains meaningful. Refusals also have persistent identities.

## Products and calendar

PERSONAL_LINE is revolving and floating over ONR. Limit, rookie restrictions, grade cutoffs, pricing, and DSR follow `07:404-419,487,495`. The configured grade floor supplements the universal pricing formula. A spread above 18% refuses credit. Undrawn credit costs 0.25% annually. A failed 28-day review freezes the line and releases unused commitment without calling performing principal.

BUSINESS_TERM has 1 to 5 game years of 364 days, with LINEAR, ANNUITY, or BULLET payments. Payment frequency is a positive integral divisor of the term, normally 28 days. LINEAR uses original principal divided by payment count. The final payment absorbs its remainder. ANNUITY resets from current principal, remaining periods, and floating ONR. Voluntary floating prepayment is free.

Accrual, scheduled payment, and covenant tests run only at tick modulo 720 equal to 719, including weekends and Held accounts. Accrual uses half-even micro-unit rounding and a 364-day denominator. Payments debit the home account, then other accounts at the lender, then settlement cash and other banks. Payment order is fees, penalty, interest, and principal.

A first missed due is DPD0. The next close is DPD1 with DELINQUENT status and 5% annual penalty on overdue charges and principal, excluding penalty-on-penalty. DPD3 accelerates and defaults. Cash enforcement runs at the next tick. A pre-default cure enters WATCH for exactly 7 game days, including expiry between closes.

Company DSCR and net leverage are checked on new borrowing and at 91-day quarter ends. An open breach gets 28 days to cure. The NPC accelerates immediately at cure expiry if Fear exceeds 0.5 or relative breach exceeds 25%. Otherwise the rate rises by 200bp until cure. Acceleration does not grant another 3-day DPD grace period.

## Default and cash recovery

Next-tick enforcement sets off borrower account cash and free cash in the borrower's own lending lots. Reserved or loaned investments cannot be seized as cash. The enforcement cost is 1% of available proceeds capped at the pre-cost claim. Actual cash pays the cost first. Unpaid principal becomes funder loss attributed to its original shares. Unpaid fees and interest remain claims, not newly minted cash or counted principal losses.

EXPENSE moves actual borrower money to the registered supplier. REFUND_EXPENSE is a bounded inverse of that payment, not a general transfer. Only the supplier actor can refund an original expense, only to that borrower, and never beyond the original payment or supplier cash. This gives deterministic tests a real cash source for voluntary recovery. Repayment reduces recorded principal losses only by actual principal recovered.

## Persistence

`FileCreditCheckpointStore` writes a canonical checkpoint through an fsynced temporary file and atomic rename. A per-path exclusive lock and revision compare-and-swap prevent stale overwrites. A crash-stale lock fails closed. Automatic lock takeover and parent-directory fsync durability are not claimed.

The digest covers genesis, the complete journal, and the reconstructed full state, including financially unused facts. Empty-tick jumps still process offer expiry, WATCH expiry, and next-tick default enforcement. Every intervening day close requires supplied facts.

## Verification and excluded work

`npx vitest run tests/unit/credit` drives the public API. `npx tsx tools/proofs/sys-credit.ts --out /absolute/new-directory` creates fresh physical stores. The directory must not exist. Proofs compare jump, event/day stepping, and restart state and checkpoint bytes. The short default witness additionally persists every literal tick. Full-year schedules use every day close, not every literal tick. An independent audit reconstructs all cash buckets from genesis and movements, and checks funded principal, reservations, and loss identities.

The clean browser smoke covers existing Broker, candles, and Wire routes. It does not certify a credit UI because this engine is not mounted.

Excluded products include fixed-rate loans, IO-then-annuity, collateral, mortgages, guarantees, revolvers for companies, restructuring, court garnishment, bureau mutation, provisions, regulatory capital, rescue operations, and deposit-bank integration. `09:906-923` and `10:241-259` are read-only contracts. Full tick-phase publication into P8/P13 remains an adapter task. `UNIT.md` records scope and dated steering.
