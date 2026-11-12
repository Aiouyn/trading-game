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
| sys/credit 1d1b2770 | `internal/credit/*` and `internal/credit/funding-policy.ts` | APPLY/ACCEPT underwriting, DRAW, schedules, REPAY, review, default and charge-off | `funding-policy.ts` is the only function that creates deposits by lending (CREDIT_CREATE, `funding-policy.ts:17-18`). SAVINGS interest (`internal/banking/engine.ts:83-85`) also credits deposits, paid from bank equity: M2 rises, M0 does not (03:972-975, 07:330-334). Each loan is a ledger asset `@originated/<bank>/<loan>` held by the lender. Principal and interest settle through real ledger transfers. Charge-off marks the loan asset to zero. `bankStatus` comes from the ledger, not from facts. |
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

## Hardening batch: Gatekeeper "not tested" gaps (planned 2026-11-12 00:22:54 Europe/Paris)

This plan was written before any code change, on tip 4679a974. Gatekeeper's bounded PASS at e715ab71 is in `evidence/launchpad/gatekeeper/e715ab71/REVIEW.md:46-48,75-76`. It lists four gaps:
1. **Independent rebuild of long stores.** The five long credit stores (linear, annuity and bullet at 262079; covenant at 86399; retail-review at 25199) were only byte-compared. Add a rebuild tool that runs each store in a separate, fresh Node process. It replays the stored genesis and frames into a new empty store, and requires identical checkpoint bytes and identical full canonical state. It reopens the original store through a read-only store whose `save` throws. It also rebuilds every ledger cell from genesis plus the audit log. All 23 three-store scenarios get this rebuild, not only the five long ones.
2. **Cross-module fixture driven in one pass.** The cross-module fixture currently runs a planning pass first to find `failedAt`, then places the CCP closeout at `failedAt + 481`. Replace that with one causal pass. The fixture producer advances the engine in chunks of at most 480 ticks, reads `failedAt` from committed state, and only then emits the closeout. Prove that the frames it emits equal the old two-pass plan, and that the result reproduces e715ab71's checkpoint bytes.
3. **Crash and lock safety.** The store's write path is lock, then temp file, then fsync, then rename. A killed writer currently leaves its `.lock` behind, and every later save fails with EEXIST. Add owner metadata to the lock, published atomically with `link`. A lock whose owner pid on this host is dead is recovered; a live owner gets `BANKING_CORE_STORE_LOCKED`. Orphan temp files are removed while the lock is held, and the parent directory is fsynced after rename. Prove that a writer killed partway (SIGKILL in a child process) leaves the last committed checkpoint readable, and that reopening is idempotent and changes no bytes.
4. **Node 22 with a fresh install.** Node 22 is not installed on the box. A `node-linux-x64@22` binary from npm is used in a private `/tmp` scratch directory. Run a fresh `npm ci` and the checks under it, in a fresh detached worktree.

Evidence goes to `evidence/sys-banking-core/hardening/`. Ports are 3440-3449.

### Hardening results (2026-11-12 01:12:14 Europe/Paris; proofs at ea3e10bb)

1. **Fresh-process rebuild.** `npx tsx tools/proofs/sys-banking-core-rebuild.ts --proofs <proof dir> --out <new dir>` rebuilds 25 stores, each in its own child process: the 23 three-store scenarios, the loss witness, and the single-pass driver store. That includes the five long credit stores at 262079 ×3, 86399 and 25199. Each rebuild reopens the store read-only with a digest check, then replays genesis and frames into a new empty store. The checkpoint bytes and full canonical state must match, and must equal the hashes recorded by the run that produced the store. The tool also rebuilds every ledger cell from genesis plus the audit log. For the credit stores this includes the per-tick sheet identity, for example 262080 rows on each 262079 store. The same tool also rebuilt the e715ab71 stores Gatekeeper reviewed, and all 25 passed. All 23 three-store scenarios at this SHA match e715ab71's checkpoint and state hashes.
2. **Cross-module fixture in one pass.** There is no planning pass or planning store. A causal producer advances the engine in 11 chunks of 480 ticks. It observes the first failure (3599) at tick 3839 and places the closeout at 4080. The emitted frames equal the old placement rule. The driver's store is byte-identical to the jump store and to e715ab71's cross-module checkpoint (`bad5dce1…`).
   **New finding:** the closeout charges bank a's own CCP custody, and that causes a second solvency failure and bail-in at day close 4319. e715ab71's report gave `failedAt: 3599`, which came from the planning pass; its final state actually has `failedAt: 4319`. The proof now records both failures. It asserts that the second failure follows the closeout, and that there is still exactly one CCP default (`LD/d/3600`, CLOSED). The behaviour is unchanged; the reporting was incomplete.
3. **Crash and lock safety.** `FileBankingCoreStore` now publishes its lock owner (pid, host, nonce) atomically with `link`. It recovers a lock left by a dead pid on this host. A live, foreign or unreadable owner fails closed with `BANKING_CORE_STORE_LOCKED`. Under the lock it removes dead writers' temp files, and it fsyncs the parent directory after rename.
   - `tests/unit/banking-core/store-crash.test.ts` (5 tests; 4 of them fail on the old store) covers dead-lock recovery with a short temp file, refusal to break a live, foreign or unreadable lock, a live contender's staged file, idempotent reopen with no write, and stale-facade CAS.
   - `tools/proofs/sys-banking-core-crash.ts` SIGKILLs a child writer in 60 trials: on lock creation, on temp creation, and at a time spread across the child's run. In every trial the store held exactly the old or the new checkpoint. Reopening was read-only and idempotent, and the next write reached the reference bytes with no residue.
4. **Node 22.** No nvm or system Node 22 exists. A `node-linux-x64@22` binary is used from a private `/tmp` scratch directory, with a fresh `npm ci` in a detached worktree. Results are in `evidence/sys-banking-core/hardening/node22-e2e/`.

Still not covered: pid reuse can make a dead owner look alive, which fails closed and needs manual removal. Multi-host or shared filesystems are not handled. A lock file left by the pre-hardening store (empty contents) is never auto-broken. A torn temp file was observed only at size 0 or full size, because a 137 KB write is one syscall; the short-write case is covered by a crafted unit test. Replication, compaction and scale are untested. Remote CI is not run.

## Decision: the post-closeout second failure (2026-11-12 01:21:49 Europe/Paris, written before the fix)

**Facts at 7078c75f** (cross-module fixture, `evidence/sys-banking-core/double-failure/probe/probe-7078c75f.log`):
- Bank a's only risk-weighted assets are member d's CCP custody: IM $100 and DF $100, counted as restricted reserves. So RWA is $200.
- At 3599 the bail-in converted $799,824.12 of treasury-a deposits, sized to CET1 = $20, exactly 10% of $200.
- At 3600 member d's default is declared because its bank failed. At 4080 the closeout takes $100 IM and $50 DF of that same custody, as the first two waterfall layers. Bank a's CET1 goes to -$130.
- At day close 4319 the bank fails again, and is bailed in a second time.

**Spec reading:**
- 07:626 (§3.10.1): when a bank fails, "the bank's CCP memberships trigger member default (§3.17.6)". 07:872 (§3.17.6) lists "the member bank enters resolution" as a default cause. So the failure itself makes the member default certain at the failure tick.
- 07:878 (§3.17.7 step 4): "Losses = close-out cost … − defaulter's resources". 07:882-883 (§3.17.8 steps 1-2): the first two layers are the defaulter's IM and then its DF contribution.
  - Everything beyond those layers is mutualized: SITG, survivors' DF, assessments of survivors, VMGH, tear-up.
  - 07:891 adds that there is no taxpayer absorption.
  - Nothing in §3.17.8 gives TCH a claim on the defaulter beyond its IM and DF. The defaulter's maximum loss from its own default is therefore exactly its posted IM + DF, and that amount is known at the failure tick.
- 07:629 (§3.10.2): valuation happens on the same tick, with "assetsFair = … performing book values minus Stage 3 provisions". 07:458 defines a Stage 3 provision as "EAD − expected recovery".
  - After default, the IM and DF are first-loss collateral for that default. Their recovery is only the surplus after close-out, and that surplus is unknown until the close-out facts arrive.
  - Recovery is therefore valued at 0 at resolution. That is the only deterministic, rule-based value available.
  - 07:385 likewise excludes encumbered (pledged) assets from usable liquidity.
- 07:633 (§3.10.3): bail-in converts written-down claims "into new equity until CET1 = 10%". A bail-in sized while counting assets that its own trigger has already committed to the waterfall leaves CET1 below 10% by construction. Here it led to a certain re-failure from a loss that was knowable and bounded at the resolution tick.

**Decision.** Option (b): ring-fence the defaulting member's margin. This is not option (a), and the second resolution was not legitimate.
- **Option (a) is rejected.** The bail-in should not be sized to a contingent CCP liability. The exposure is not a third-party claim (03:1464 admits contingent claims only "when crystallized"), and there is no claim on the defaulter beyond its IM and DF.
- **What is ring-fenced.** A bank's own CCP house member has its IM and DF custody accounts ring-fenced in two cases: from the tick the bank fails (default certain, §3.10.1), or from a declared member default for any §3.17.6 cause. The ring-fence lasts until that default event is CLOSED (§3.17.7 step 5).
- **How it is treated.** While ring-fenced, that custody is a capital deduction: Stage 3 with recovery 0. It is removed from CET1, and also from RWA, so it is not counted twice. Cash, deposits, balance-sheet equity and M0 do not move. When the close-out later consumes the IM and DF, it consumes ring-fenced value, so CET1 does not move.
- **Release at close.** When the default is CLOSED, any surplus the waterfall did not use stops being ring-fenced and counts as capital again.
- **Effect on the bail-in.** Its size now reflects the ring-fence: it reaches CET1 = 10% of the remaining RWA, net of the ring-fenced custody.
- **Second resolutions in general.** These remain legitimate for losses that arise after resolution and were not knowable at the valuation tick. 07:626 evaluates triggers at every day close, and nothing makes a resolution one-time. A bank's own CCP default cannot be such a loss, because its cost is capped at the ring-fenced IM + DF.
- **Restatement.** This is a root fix in `liquidityMetrics`, and it is derived from state, so it adds no new persisted field. It changes the cross-module outcome to one failure at 3599 and one bail-in, which is larger by the ring-fenced $200 of claims. Exactly which hashes change is recorded in the results below.

## Owner-pending: post-closeout second failure (2026-11-12 01:36:41 Europe/Paris; supersedes the "Decision" section above)

Gatekeeper's ruling on 7078c75f was PASS, qualified. The re-failure at 4319 is not a money defect: M0 stays constant and the identity residual is 0. Spec 07 does not settle which behaviour is wanted, so this is an **owner question**. The ring-fence commit 66f2a89d is reverted in the next commit, and the engine behaves exactly as at 7078c75f. The "Decision" text above was my reading of 07; it is **not adopted**.

**Pinned current behaviour (re-failure allowed).** Bank a fails at 3599 (SOLVENCY) and is bailed in to CET1 = 10% of RWA.
- RWA is $200, which is only member d's IM $100 and DF $100. That gives CET1 $20.
- At 3600 the member default `LD/d/3600` is declared (07:626, 07:872).
- At 4080 the close-out takes $100 of IM and $50 of DF from the same custody (07:882-883). CET1 falls to -$130.
- At day close 4319 the bank fails again (SOLVENCY), and a second bail-in converts more treasury-a deposits.
- There is exactly one CCP default event. M0 stays constant and every residual is 0.
- `tests/unit/banking-core/ccp-second-failure.test.ts` pins this behaviour.

**The two options for the owner:**
1. **Allow re-failure (current behaviour).** Resolution sizes the bail-in to CET1 = 10% of the RWA on the failure tick (07:633). Losses that crystallize later, including the bank's own CCP close-out, are new losses. They can trigger a new resolution at a later day close (07:626 evaluates triggers at every day close, and nothing makes a resolution one-time).
   - Cost: a second public failure, and a second bail-in of the same creditors within one game day.
2. **Provision the declared close-out at bail-in.** From the failure tick, the defaulting house member's IM and DF are first-loss resources of a default that the failure makes certain (07:626, 07:872, 07:878, 07:882-883). Nothing in §3.17.8 claims anything from the defaulter beyond them.
   - Treatment: value them as a Stage 3 claim with recovery 0 (07:629, 07:458). Deduct them from CET1. Their RWA, net of the provision, is 0 (07 §3.2.1 "Defaulted exposures (net of provisions)"). The provision is released when the close-out loss is applied.
   - The bail-in is then sized net of the provision. A prototype (66f2a89d, reverted) produced one failure at 3599 and one bail-in of $800,004.12 instead of $799,824.12. CET1 was $50 against RWA $50 after the close-out.
   - In that prototype, only the cross-module scenario's hashes changed: checkpoint `bad5dce1… → 1590bfad…` and state `eab283f6… → a69e0477…`. The frames were identical. Evidence is in `evidence/sys-banking-core/double-failure/superseded-ringfence-66f2a89d/`.
   - A first variant released the provision only when the default reached CLOSED (d+720). It still re-failed at 4319 from about $0.34 of day-close costs, because the bank had zero buffer, so the release point matters.
   - The prototype also declared the member default in every service the member clears, not only the first (07:626 "memberships"). That change is reverted too, and stays part of option 2.

**Additive fix kept regardless of the owner's answer.** A second resolution used to replace `bank.resolution`, which erased the first bail-in's equity-rights record. The bank now keeps earlier resolutions in `priorResolutions`. That key is absent until a second resolution happens, so no other scenario's bytes change. This is a record only: no money moves.

### Owner-pending results (2026-11-12 01:45:33 Europe/Paris; proofs at 6b98a0d7)

- **Commits.** ff650d55 reverts 66f2a89d. The engine and accounting are byte-identical to 7078c75f. 6b98a0d7 adds `priorResolutions` and the pin test `tests/unit/banking-core/ccp-second-failure.test.ts`. Red/green: with the 7078c75f liquidity engine the pin fails on the missing `priorResolutions`, and with the fix it passes.
- **Pinned behaviour.**
  - Bail-in at 3599 to CET1 $20 on RWA $200, with equity rights [treasury-a $799,824.120881].
  - Close-out at 4080: defaulter IM $100, then DF $50, which leaves CET1 at −$130.
  - Second failure and BAIL_IN at 4319, with final rights [treasury-a $137,747.253].
  - One CCP default, LD/d/3600, CLOSED.
  - `priorResolutions` = [{opened 3599, BAIL_IN, [treasury-a $799,824.120881]}].
  - M0 is constant.
- **Proofs** (`evidence/sys-banking-core/double-failure/proofs`, ALL PASS 24) and **rebuild** (`double-failure/rebuild`, 25 stores rebuilt in fresh processes, all pass):
  - Residuals are 0, and identity rows are 10082 on the cross-module store.
  - Restart, jump, stepped and single-pass all agree.
- **Hash changes.** Only the cross-module store changed: checkpoint `bad5dce1… → 8345b6cc…` and state `eab283f6… → 8034e4a0…`.
  - The stepped, jump, restart and single-pass stores all match the new hashes.
  - Genesis and frames are identical (framesSha256 `50c41eb7…` unchanged). Only the digest field differs, because the canonical state now carries `priorResolutions` for bank a.
  - The other 22 three-store scenarios and the loss witness keep their ea3e10bb checkpoint and state hashes.
