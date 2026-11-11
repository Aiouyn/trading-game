# Banking deposits, reserve settlement and business credit

## Owner decision

Parent-verified owner answer in Gatekeeper's chat, **2026-11-11 20:06 Europe/Paris**:

> yes, bank loans create new money like real banks, follow spec 07

The funded-custody interpretation is removed. Bank loans create deposits and matching loan assets. Principal repayment destroys deposit money and principal (`export/vision-review/complete/07-BANKING-CREDIT-CLEARING.md:23,420,426`). Outside bank credit, "the game never creates money" remains the rule: finite books, no last-resort maker, no other minting. Consumer credit and central-bank facilities remain out of scope.

## One isolated owner

`src/server/banking` is not mounted in the app. It receives an explicit genesis, complete hourly observations and sealed commands. It never copies live AuthService cash into another writer. Later mounting needs authenticated lender/client roles, ownership migration and 03 posting adapters.

`PERSON` and `BUSINESS` identify customer kinds. Existing OPEN, DEPOSIT, WITHDRAW and MOVE commands remain. A lender's explicit LEND instruction books preapproved BUSINESS credit into that lender's deposit account. PERSON credit is refused. REPAY uses that loan's deposit, pays interest first and destroys principal. WRITE_OFF accepts a lender-authoritative final-enforcement instruction only for an overdue business loan with no unapplied balance in its origination deposit. Underwriting, applications, collateral enforcement, consumer products and bank resolution are deferred, not simulated by those booking instructions.

## Reserves and deposits are different accounts

Bank `cash` is its reserve asset. Bank equity is separate. Deposits are liabilities, not additional reserves. A customer's cash deposit increases reserves and its deposit claim. Withdrawals and cross-bank transfers move actual reserves and fail when reserves are unavailable. Crediting a loan never credits reserves. There is no intraday overdraft, CB standing facility or rescue.

`BANK_FUNDING_POLICY` in `funding-policy.ts` uses FDL -> FU (`22-CONTENT-CATALOGS.md:63`), 1% reserves (`07:388`, `04:699`) and the additional 0.5% buffer (`07:541`). It rounds the combined micro-unit requirement upward. The $5M bankB sight-deposit scenario has $5M reserves and a **+$4,925,000** projected gap. It originates no $25,000 interbank loan.

Interbank matching uses finite reserve transfers, not credit-created customer deposits (`03-LEDGER-AND-ACCOUNTING.md:723-725`). Fresh hourly observations at tick29/59/... supply risk, fear and corridor inputs. Counterparty exposure, Tier1 and ask ordering follow `07:543-553`. Daily ONR uses funded interbank volume or the specified fallback.

## Accounting identities

At each bank:

`reserves + business loan assets + interbank lending = deposits + equity + interbank borrowing`

Accrued claims and their matching income/payables extend the same identity. Realized equity records paid interest and losses. The consolidated equation is **deposits = reserves + business loans - equity**. Initial capital and default losses make the equity term essential. "Deposit money = loans + reserves" without equity is not the actual balance-sheet identity.

`bankingCashTotal` is M0, outside settlement cash plus bank reserves, and remains constant. `bankingDepositMoney` is M2, outside cash plus deposits. Lending increases M2 without changing M0. Principal repayment reduces M2 without changing M0. Default write-off reduces the loan asset and bank equity; it does **not** destroy already-circulated deposits (`07:460`).

Bank interest receipts/payments are own-account transfers between deposits and bank equity. They can change M2, as `03:895,972-975` explicitly requires. Reports separate these from credit creation. They create no base reserves or net assets. Interest spending is capped by existing positive equity; unpaid interest remains a claim. Day close uses tick719, 364-day half-even rounding and includes weekends.

## Boundary and persistence

`input.ts` rejects live and revoked Proxies before any reflection or trap execution, at all raw genesis, frame, command, controls and checkpoint boundaries. Sparse arrays, unknown fields, non-JSON values, getters, toJSON, aliases and cycles also reject before save.

Journal v2 stores authoritative genesis, frames, target and full-state digest. Opening replays every persisted feature. Old custody v1 rejects without rewriting the file. There is no automatic migration in this unmounted slice. Atomic temp/fsync/rename, revision CAS, serialized publication, defensive snapshots and canonical idempotent retries remain in force.

## Proofs

`tests/unit/banking/credit.test.ts` exercises credit booking, repayment, default loss, liquidity, authority and atomic retry. The original Proxy regression remains in `banking.test.ts`.

`tools/proofs/banking.ts --out <new-directory>` compares complete tick/jump/restart state and checkpoint bytes. `banking-audit.ts` independently rebuilds all monetary balances, loan principal, equity and settlement legs from genesis plus postings. Its six scenarios cover repayment, circulated-money write-off, reserve refusal without CB rescue, the corrected reserve gap, fear freeze and weighted ONR. These are correctness proofs, not a claim of consumer credit, full regulatory banking, throughput or a playable mounted bank UI.
