# Funded retail and company credit

## Status and owner decision

`src/server/credit` is a standalone, unmounted engine. It has no dependency on sys/banking or sys/fx. It imports the base engine's `Money`, `Ccy`, `Tick`, and string ordering.

The owner answer, verified by the parent at 2026-11-11 20:06 Europe/Paris, is exactly "yes, bank loans create new money like real banks, follow spec 07". The dated UNIT addendum supersedes its earlier funded-only contract. `07-BANKING-CREDIT-CLEARING.md:23,420,426` governs the final implementation.

`funding-policy.ts` is the single money-policy module. `CREDIT_MONEY_POLICY` is `BANK_DEPOSIT_CREATION_SPEC_07`. A draw increases a loan asset and creates a borrower deposit. Principal payment destroys the corresponding deposit money. No other command creates money. The old funding-lot and lending-deposit commands and types are removed, not kept as an alternative mode.

## Balance sheet and finite credit

`bankBook.reserves` starts at bank capital plus the opening reserve-backed deposit balances. The engine records no later reserve injection. `bankBook.equity` starts at bank capital, earns actually paid interest, penalties, and fees, and loses written-off principal. Negative equity is retained. A bank with exhausted equity refuses new credit and draws. There is no rescue command.

The exact identity is `deposits + equity == netLoanAssets + physicalReserves`. The shorthand `deposits == loans + reserves` is also checked with reserves explicitly net of equity. Physical reserves alone cannot balance circulating deposits after a write-off; removing equity from the identity would hide the bank's loss. Gross unpaid legal claims remain separate from net loan assets.

Bank income debits a borrower deposit and credits bank equity. Principal payments debit a borrower deposit and reduce principal. Recovery of charged-off principal also reverses the corresponding equity loss. Unpaid interest and fees remain claims; they do not mint deposits or count as paid income. The engine does not implement accrual-basis interest-receivable financial statements or ECL provisions.

Credit is finite but not pre-funded. Open offers and undrawn lines reserve bank credit capacity, not cash. Global exposure, borrower limits, product limits, daily supply, bank status, and underwriting still constrain lending. The bank can create a loan deposit larger than its current reserves. There is no last-resort market maker.

## Ownership and integration bounds

Genesis defines a new closed FDL deposit world with one consolidated bank, clients, cash-account records, and one supplier. All `cash` fields in this instance represent deposit liabilities, including accounts with `bankId:null`. The bank IDs are collection and receiving-route metadata, not a second reserve ledger or evidence of actual interbank settlement. Existing balances start with explicit reserve backing. This engine never converts a deposit into central-bank settlement cash or pays another live bank.

A future adapter must migrate account ownership atomically and connect banking's actual clearing and reserve rails. It must not copy AuthService balances or count a mirrored wallet twice. No HTTP route or browser actor authentication is included. The module does not modify claims, Wire values, or other banking worktrees. Money types come from core; no unmerged bank domain type is imported. The compatible minimum contract is an ID, currency, bank/account routing, bigint balance, tick, and explicit asset/liability/equity postings.

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

Next-tick enforcement sets off borrower account cash. The enforcement cost is 1% of available proceeds capped at the pre-cost claim. Actual deposits pay costs, penalties, interest, and principal. Unrecovered principal becomes a write-off against bank equity. The supplier retains its deposit, so a default never destroys money already spent into circulation. The unpaid legal claim survives separately from its zero net loan asset. No lending-depositor losses or funding lots remain.

EXPENSE transfers borrower deposits to the registered supplier. REFUND_EXPENSE is a bounded inverse of that payment, not a general transfer. Only the supplier actor can refund an original expense, only to that borrower, and never beyond paid-minus-refunded or supplier cash. Voluntary principal recovery destroys actual deposits and reverses only the recovered write-off.

## Persistence

`FileCreditCheckpointStore` writes a canonical checkpoint through an fsynced temporary file and atomic rename. A per-path exclusive lock and revision compare-and-swap prevent stale overwrites. A crash-stale lock fails closed. Automatic lock takeover and parent-directory fsync durability are not claimed.

The digest covers genesis, the complete journal, and the reconstructed full state, including financially unused facts. Empty-tick jumps still process offer expiry, WATCH expiry, and next-tick default enforcement. Every intervening day close requires supplied facts.

## Verification and excluded work

`npx vitest run tests/unit/credit` drives the public API. `npx tsx tools/proofs/sys-credit.ts --out /absolute/new-directory` creates fresh physical stores. The directory must not exist. Proofs compare jump, event/day stepping, and restart state and checkpoint bytes. The short default witness additionally persists every literal tick. Full-year schedules use every day close, not every literal tick. An independent audit reconstructs all cash buckets from genesis and movements, and reconstructs loan-created deposits, principal destruction, paid bank income, net assets, fixed reserves, equity, and write-offs. No unexplained creation is allowed.

The clean browser smoke covers existing Broker, candles, and Wire routes. It does not certify a credit UI because this engine is not mounted.

Excluded products include fixed-rate loans, IO-then-annuity, collateral, mortgages, guarantees, revolvers for companies, restructuring, court garnishment, bureau mutation, provisions, regulatory capital, rescue operations, and deposit-bank integration. `09:906-923` and `10:241-259` are read-only contracts. Full tick-phase publication into P8/P13 remains an adapter task. `UNIT.md` records scope and dated steering.
