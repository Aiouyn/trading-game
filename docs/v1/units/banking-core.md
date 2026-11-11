# UNIT: one authoritative banking ledger

Written 2026-11-11T21:27:48.637812+01:00 Europe/Paris, before any implementation or test code. Branch sys/banking-core, base110583b0aa73ece1dc3b856665f3be0405f1acc3. The new unit has no root UNIT.md.

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

All07 citations refer to export/vision-review/complete/07-BANKING-CREDIT-CLEARING.md.
- 07:22-25: one authoritative account ownership and distinguish deposits from base money; credit creation and destruction are explicit, no other issuance.
- 07:538-563,626-638: real reserve funding, exact-hour interbank matching and daily ONR.
- 07:740-742,807-829: MEMBER margin timing, funded P13 posts, next-tick finite fair-value liquidation instructions. Existing execution producer boundaries stay explicit.
- 07:841,861-900,1101: per-service finite funds, shared caps, funded VMGH, bank-resolution member default and real losses, no rescue.
- Preserve the source credit underwriting/scheduling contract and the source liquidity ratios, DGF and resolution waterfall. Read09/10 only for inherited company/collateral contracts. No additional loan engine or business simulation.
- Every earlier proof scenario is listed in a coverage manifest and ported to the unified book. Banking's retired short-dated LEND scenarios must use the canonical credit path, with any unavoidable timing/term differences stated rather than claiming identical old unsupported API behavior.
- Add a cross-module loan, deposit run, bail-in and linked CCP-member default. Independently reconstruct cash, credit issuance, deposit destruction, asset losses and creditor haircuts at every tick. Prove deposits+equity=net loans+reserves in the loan-only case; also check the expanded balance sheet when securities, other debt or pledged CCP cash are present. Restricted bank-owned CCP cash is distinct from available settlement reserves, never a second wallet.
- All prior restart/jump equivalence cases use new physical unified stores and compare complete canonical checkpoint bytes. Invalid Proxy inputs fail before reflection with zero traps. Unknown fields, sparse arrays, Date, undefined and nonfinite values fail. Canonical fingerprints ignore reordered object fields across restart, not array order.

## Verification and hygiene

Run exact package scripts for lint, typecheck, build and npm test directly outside hooks, plus check-hooks, ledger map-no-dup and route-budget3420. One clean exact-final-SHA e2e on3421 uses physical npm ci, fresh .data and no apt. Remove only the owned e2e worktree normally from /workspace/avalon/repo. Verify safe git identity and absence of init commits/tracked.txt before commits and after tests. Evidence /workspace/avalon/evidence/sys-banking-core. Commit normally, do not push. No PR, merge, deploy, spending, cloud agents, other worktree edits, UI, claims15/16 or Wire changes.
