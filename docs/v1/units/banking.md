# Historical unit contract

Ported from banking. This records the original standalone contract. Banking-core replaces its independent cash/store authority. Original source paths and timestamps below are historical.

# UNIT: banking, credit-created deposits and finite reserve settlement

Branch `sys/banking`, base `110583b0aa73ece1dc3b856665f3be0405f1acc3`. This continues the Q1 Proxy fix; it does not restart that work. The earlier funded-custody interpretation is superseded by the owner answer below.

## Owner decision and scope

Parent-verified owner answer in Gatekeeper's chat, **2026-11-11 20:06 Europe/Paris**:

> yes, bank loans create new money like real banks, follow spec 07

Bank lending follows `export/vision-review/complete/07-BANKING-CREDIT-CLEARING.md:23,420,426`: origination creates a deposit and a matching loan asset; principal repayment destroys that deposit money and loan principal. Everywhere outside bank credit, "the game never creates money" still holds. Finite books remain finite, there is no last-resort market maker, no other mint, no negative reserve facility and no central-bank rescue.

Consumer credit and a central-bank facility remain out of scope. `PERSON` clients cannot receive loan drawdowns. This unit books explicit preapproved `BUSINESS` credit instructions from an enabled lender. Consumer/company underwriting, application/offer UX, credit-bureau scoring, collateral enforcement and full regulatory supervision are not claimed. `WRITE_OFF` is the lender's explicit final-enforcement instruction for an overdue business loan with no reachable borrower funds. It is not a new consumer default or bank-resolution engine.

## State ownership and economic rules

- `src/server/banking/engine.ts` alone owns reserve assets, deposit liabilities, bank equity, business loan assets and interbank assets/liabilities. AuthService and the runtime app are unchanged. Genesis is a separate explicit world, not a copy of live cash.
- A bank's `cash` now means actual reserves. Deposits are liabilities, never a second reserve bucket. Opening a deposit creates no balance. Depositing outside settlement cash transfers base money into bank reserves and adds its matching deposit claim. Withdrawals and cross-bank payments need actual reserves; insufficient reserves refuse the payment without a synthetic counterparty.
- `funding-policy.ts` implements FDL -> FU (`22-CONTENT-CATALOGS.md:63`), the 1% reserve requirement (`07:388`, `04:699`) plus the 0.5% buffer (`07:541`). The combined micro-unit target rounds upward. A $5,000,000 sight deposit at otherwise empty bankB gives a +$4,925,000 gap, not a $25,000 borrowing need.
- Hourly interbank matching remains at `tick mod30=29`, with explicit complete fresh risks/policy/Fear, counterparty limits and cheapest eligible asks (`07:541-553`). Interbank loans move existing reserves; they do not create customer deposits (`03-LEDGER-AND-ACCOUNTING.md:723-725`). There is no missing-source zero, refill or CB facility.
- Business `LEND` creates a loan asset and a deposit without changing reserves. `REPAY` gathers reachable borrower funds, applies accrued interest first, then destroys principal deposits. BUSINESS-only `PAY` settles payments to other customers with actual reserve transfers; default proof proceeds go to a different owner, not another recoverable borrower account. Business maturity is an explicit future day-close tick. `WRITE_OFF` reduces loan assets and bank equity, not circulated deposits (`07:460`). The trusted lender booking port does not replace the deferred underwriting or authenticated app adapter.
- Daily close is `tick mod720=719`, 364-day half-even interest, including weekends (`07:330-334,1093,1109`). Unpaid claims remain explicit. Bank own-account interest transfers change equity against deposits and are reported separately, not labelled as lending or base-money creation (`03:895,972-975`). Interest spending is capped by existing positive bank equity.

## Accounting, not forced conservation

The balance-sheet identity is **deposits + equity + interbank borrowing = reserves + business loans + interbank lending**. Accrued receivables/payables add their matching income/expense to book equity. Consolidated deposits equal reserves plus business loans **minus equity**. The shorthand "deposits = loans + reserves" needs this equity term whenever banks have initial capital or write-offs. Removing it or burning deposits on default would contradict `07:460`.

`bankingCashTotal` measures M0 in this isolated world: outside settlement cash plus actual bank reserves. It is constant. `bankingDepositMoney` measures M2: outside cash plus customer deposits. Per `03:961-975`, M2 changes by credit creation less principal repayment plus explicit bank own-account flows. No reserve asset is created by lending, interest, write-off, repayment, pricing or a failed operation.

`tools/proofs/banking-audit.ts` reconstructs every reserve, wallet, deposit, principal and realized-equity balance from genesis and semantic ledger movements. It checks the identity after every posting, reconciles each settlement leg, proves that repayment destroys principal and write-off leaves circulated deposits intact, and separates own-account transfers from lending. It does not call the engine's invariant checker.

## Boundary and durable replay

The shared raw JSON decoder rejects live/revoked Proxies with native `isProxy` before reflection. Genesis, batch/frame/command, controls and checkpoint load/save all use it. Dense plain JSON, exact fields, canonical micro-money strings, no accessors/toJSON, aliases, cycles, exotic values or silent serialization changes remain mandatory.

Journal **v2** replays the complete new balance sheet and checks its full-state digest. Custody v1 is rejected and preserved, never silently reinterpreted or reset. This unmounted slice has no automatic v1 migration. Save succeeds before publication, CAS rejects stale owners, retries preserve the first command result and snapshots are defensive copies. Per-tick, jump and physical restart must produce the same complete state and checkpoint bytes.

## Verification and limits

Run lint, typecheck, build, `node tools/check-hooks.mjs .next/static .next/server`, ledger-cwd map-no-dup, npm test, banking targeted, restart/jump and independent accounting proofs. Run the original Q1 repro unchanged with runtime-path mapping only. The original reserve-gap script contains assertions for the repealed representation; retain its raw exit and run an explicitly labelled new-contract scenario for +$4,925,000 and no loan.

Run one fresh exact-final-commit e2e, physical npm ci only, initially absent .data, port3412. Use port3411 for route budget. Keep all processes in3410-3419; leave sys/credit untouched. Preserve evidence under `/workspace/avalon/evidence/sys-banking/<newSHA>/` and remove only the owned e2e worktree from the main repo. Normal commits only. No push, PR, merge, deploy or hook bypass. Local checks do not certify remote CI or a mounted banking UI.
