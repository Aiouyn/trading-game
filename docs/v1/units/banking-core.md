# UNIT: one authoritative banking ledger

Written 2026-11-11 21:27:48 Europe/Paris, before any implementation or test code. Branch sys/banking-core, base 110583b0aa73ece1dc3b856665f3be0405f1acc3. The new unit has no root UNIT.md.

## Player outcome and scope

Offline credit, payment, run, resolution and CCP policies read and change the same deposits and reserves. A borrower cannot spend a second copy of a deposit. A run drains the reserves that settle credit payments and fund CCP posts. Bank resolution changes those same deposits and bank claims. Bank failure can declare that bank's linked CCP member default. No live activation or player-owned business functionality is added. `docs/v1/V1-BOARD.md:82,84` keeps the complete system default-off and unmounted. Actor-to-auth binding and the one-time live ownership migration remain before mounting. Existing readonly producer contracts and excluded full07 functions are not newly claimed.

## Authority and source ports

The parent reports the owner's verified 2026-11-11 20:06 Europe/Paris answer verbatim: "yes, bank loans create new money like real banks, follow spec 07". This unit follows complete07:22-23: settlement cash, reserves and bank deposits are distinct; loan draw creates a deposit and principal payment destroys it. Nothing else creates base money. Defaults write down real bank assets and equity. No last-resort rescue or unlimited counterparty.

Port these fetched, verified source commits, not their root UNIT.md files or their independent persistence facades:
- sys/banking 9f22a24d1c25caf7cde244e56def08a4187ab220: deposit products, funded payment rails, hourly interbank and daily ONR. Retire its businessLoans and LEND/REPAY/WRITE_OFF origination engine.
- sys/credit 1d1b2770f792034a5a06f977dddd189765eaac87: the sole APPLY/ACCEPT underwriting, draw, schedules, repayment, review and default path. Replace its cash and bankBook ownership with shared-ledger references.
- sys/bank-liquidity ce66e61844b82c47820166ee350c7f0b6023ef3b: authoritative accounts/lots, bank reserves, asset holdings, notes and DGF, plus queues, hourly runs and resolution. Integrate originated loan assets and funded interbank notes into this book.
- sys/margin-ccp 8c5a7054c987c56acaeffb8455cbe098854a6d96: margin calls, readonly finite liquidation plans and funded waterfall. Replace its cash array with bindings to shared accounts or bank reserves. A binding cannot seed or duplicate money.

Archive all four original UNIT contracts under docs/v1/units/<unit>.md with explicit historical-source labels. There is one store and journal for the reconciled system, never one store per feature.

## Grounding and two designs

Overview: the old policies already own distinct noncash decisions, but each standalone facade also initializes deposits or cash, bank assets and a durable journal. Their individual proofs cannot establish shared ownership. Banking and credit both originate company loans. The extra root contracts collide when combined. These shapes arose from the earlier instruction to branch every isolated engine from the same base; they are no longer the integration design.

Design A would retain four stores and copy balances between them after each tick. Reject it: duplicate money ownership, ordering-sensitive synchronization, non-atomic defaults, two origination paths and restart divergence remain possible.

Design B uses the liquidity account/asset book as the sole durable money authority. Feature state contains only policy metadata and references. Internal policy views may expose old field names, but every money read/write resolves to the one ledger, and no such view is persisted. Explicitly port and remove superseded origination and independent facades. One engine validates, orders, audits and commits all feature effects atomically. Choose B. Screened against architect design-red-flags: no independent stores or balance copies, no callable legacy LEND bypass, one credit draw function, one source of asset ownership, no snapshot exposed as a mutable live object. No Task tool is available and cloud agents are forbidden, so these are two local design screens, not a claimed multi-model review.

Usage sketch: BankingCoreEngine.open(store, genesis, enabled=false); advance(target, frames); snapshot() returns the unified canonical book; project(feature) returns an offline read-only diagnostic projection. Genesis contains one bank/account/asset/DGF seed and reference-only feature configuration. Frames contain policy observations and commands, with the original hourly/daily requirements preserved. A failed command, save or CAS cannot publish a partial multi-policy transaction.

## Spec requirements and acceptance

All 07 citations refer to export/vision-review/complete/07-BANKING-CREDIT-CLEARING.md.
- 07:22-25: one authoritative account ownership and distinguish deposits from base money; credit creation and destruction are explicit, no other issuance.
- 07:538-563,626-638: real reserve funding, exact-hour interbank matching and daily ONR.
- 07:740-742,807-829: MEMBER margin timing, funded P13 posts, next-tick finite fair-value liquidation instructions. Existing execution producer boundaries stay explicit.
- 07:841,861-900,1101: per-service finite funds, shared caps, funded VMGH, bank-resolution member default and real losses, no rescue.
- Preserve the source credit underwriting/scheduling contract and the source liquidity ratios, DGF and resolution waterfall. Read 09/10 only for inherited company/collateral contracts. No additional loan engine or business simulation.
- Every earlier proof scenario is listed in a coverage manifest and ported to the unified book. Banking's retired short-dated LEND scenarios must use the canonical credit path, with any unavoidable timing/term differences stated rather than claiming identical old unsupported API behavior.
- Add a cross-module loan, deposit run, bail-in and linked CCP-member default. Independently reconstruct cash, credit issuance, deposit destruction, asset losses and creditor haircuts at every tick. Prove deposits+equity=net loans+reserves in the loan-only case; also check the expanded balance sheet when securities, other debt or pledged CCP cash are present. Restricted bank-owned CCP cash is distinct from available settlement reserves, never a second wallet.
- All prior restart/jump equivalence cases use new physical unified stores and compare complete canonical checkpoint bytes. Invalid Proxy inputs fail before reflection with zero traps. Unknown fields, sparse arrays, Date, undefined and nonfinite values fail. Canonical fingerprints ignore reordered object fields across restart, not array order.

## Verification and hygiene

Run exact package scripts for lint, typecheck, build and npm test directly outside hooks, plus check-hooks, ledger map-no-dup and route-budget on 3420. One clean exact-final-SHA e2e on 3421 uses physical npm ci, fresh .data and no apt. Remove only the owned e2e worktree normally from /workspace/avalon/repo. Verify safe git identity and absence of init commits/tracked.txt before commits and after tests. Evidence /workspace/avalon/evidence/sys-banking-core. Commit normally, do not push. No PR, merge, deploy, spending, cloud agents, other worktree edits, UI, claims15/16 or Wire changes.

## Implementation record

Added after the contract above. Code lives in `src/server/banking-core/`. The four source policies are internal modules under `internal/{banking,credit,liquidity,ccp}`. They are not exported as standalone engines and have no store.

### Porting map

| Source branch and commit | Ported into | Kept | Changed or removed |
| --- | --- | --- | --- |
| sys/banking 9f22a24d | `internal/banking/*` | Deposit products, OPEN/DEPOSIT/WITHDRAW/PAY, hourly reserve gaps, interbank matching, daily ONR fixing | Removed `businessLoans`, LEND, REPAY, WRITE_OFF and `loanFunds`. Deposits, reserves and equity are ledger views. Interbank draws book a SENIOR INTERBANK note on the ledger. Reserve gaps count every ledger deposit at the bank, including credit-created deposits. |
| sys/credit 1d1b2770 | `internal/credit/*` and `internal/credit/funding-policy.ts` | APPLY/ACCEPT underwriting, DRAW, schedules, REPAY, review, default and charge-off | `funding-policy.ts` is the only function that creates deposit money. Each loan is a ledger asset `@originated/<bank>/<loan>` held by the lender. Principal and interest settle through real ledger transfers. Charge-off marks the loan asset to zero. `bankStatus` comes from the ledger, not from facts. |
| sys/bank-liquidity ce66e618 | `internal/liquidity/*` and `ledger.ts` | Accounts, lots, reserves, assets, notes, DGF, queues, runs, resolution and the waterfall | It is the single money authority. The sheet adds interbank notes, accrued interbank interest, deposit interest due and restricted reserves. When a failed bank owes money to another bank, the payment goes to that bank's reserves. |
| sys/margin-ccp 8c5a7054 | `internal/ccp/*` | Margin calls, liquidation plans, funded waterfall, VMGH and assessments | Each `cash` bucket binds to a ledger custody account or to bank reserves. The P7 and P13 phases are split so that banking, credit and liquidity run between them. A failed bank turns its linked member into a `BANK_RESOLUTION` default. |

Commits were ported as source snapshots, not cherry-picked. Each source added a root `UNIT.md`, and its standalone facade conflicts with the shared ledger. The four source UNIT contracts are archived as `docs/v1/units/{banking,credit,bank-liquidity,margin-ccp}.md`. Each one starts with a header saying that banking-core replaces its cash and store authority.

### Differences from the source scenarios

These are deliberate. None of them weakens spec 07.
- Banking LEND scenarios now originate through the credit book at the same bank: APPLY at tick 0, ACCEPT at tick 1. That path has a one-year `BUSINESS_TERM` with a schedule, not a single 719-tick maturity. `credit-create-and-repay` prepays the full principal at tick 2. `default-writeoff-no-deposit-destruction` circulates the deposit with a credit EXPENSE to bankB. Write-off comes from credit default and charge-off at tick 2880, not from a manual WRITE_OFF at 720. `reserve-liquidity-no-cb` now rejects at ACCEPT with `RESERVES`, because routing would need reserves the bank lacks. No money is created. The source rejected a later WITHDRAW instead.
- Credit-receiving accounts are seeded in the ledger, not created through banking OPEN, because the credit book references them at genesis.
- Credit fixtures turn the old outside cash into deposits at the lending bank. Bank reserves are set to initial capital plus deposits, so opening equity is still 100, as in the source.
- Credit EXPENSE accepts only when the client's settleable funds cover the amount. The old wallet total could include cash that the ledger cannot move.
- CCP custody accounts that a bank member owns count as that bank's restricted reserves. They are included in its RWA and RSF, but not in its available settlement reserves.
- A bank fails during the LIQUIDITY phase, which runs after CCP P7. The CCP default is therefore declared at `failedAt + 1`.

### Time granularity

These rules are unchanged from the sources. A banking market frame is required at each tick where `t % 30 == 29`. Each credit book needs a facts frame at each tick where `t % 720 == 719`. Liquidity needs facts every 30 ticks and at each day close. When CCP is enabled, it needs a frame at every tick. If a required frame is missing, `advance` rejects.

### Proofs

`npx tsx tools/proofs/sys-banking-core.ts --out <new absolute dir>` runs 24 scenarios: 6 banking, 7 credit, 5 liquidity, 5 CCP and 1 cross-module. Twenty-three of them run on three fresh physical stores: jump, stepped and reordered restart. The credit loss witness is the 24th; it inspects a single store at ticks 2879 and 2880, as in the source. Each three-store scenario compares full canonical state and checkpoint bytes, reopens the store and runs an independent audit. The audit rebuilds every ledger cell from genesis plus the per-phase audit log. It also checks that base money stays constant at every audited tick, and that `CREDIT_CREATE - REPAY_PRINCIPAL` equals the outstanding originated principal.

The cross-module scenario runs: loan, spending to another bank, deposit run, charge-off, solvency failure, bail-in of corporate deposits, and then the CCP default of the member that banks there, through to closeout. It checks `deposits + equity = net loans + reserves` for both banks at every literal tick, with zero residual. Reserves include restricted CCP custody. The scenario has no notes, so this identity is the complete balance sheet. Loss-free credit scenarios run the same per-tick check. Other scenarios use the expanded sheet check from the ledger accounting.

## Before mount

The unit stays default-off (`BANKING_CORE_DEFAULT_ENABLED=false`) and unmounted under V1-BOARD.md:82,84. These steps remain:
1. Actor-to-auth binding. Command `actor` values are now unauthenticated strings, checked only against configured owners. Mounting must derive the actor from the authenticated session.
2. One-time live ownership migration. Move every live wallet, deposit and CCP balance into ledger accounts exactly once. Close the old stores, verify that the opening M0 matches, and allow no dual writes.
3. Owner V1 permission. V1-BOARD.md:84 currently excludes banks, credit and businesses.
4. Producer adapters for the readonly facts (credit profiles, liquidity facts and bids, CCP risk, closeouts and VM). Only fixtures provide them today.
