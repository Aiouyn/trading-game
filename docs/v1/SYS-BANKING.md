# Funded banking without new money

## Overview

`src/server/banking` is an isolated FDL custody and automatic interbank engine. A player can open SIGHT or SAVINGS accounts, move funded cash into them, transfer between their own accounts, and withdraw. Banks earn or pay interest from their existing cash. The app does not mount this engine yet.

The owner prohibits money creation. That overrides the fractional-credit and central-bank facilities in `07-BANKING-CREDIT-CLEARING.md:419-426,1146-1149`. A bank cannot lend its customers' custody cash. A dry lender or an unfunded maturity never receives a synthetic counterparty or rescue.

The pre-code [unit contract](../../UNIT.md) lists the exact specification bounds. Consumer credit and the full clearing-house default waterfall are outside this slice. Interbank loans are the funded credit product here.

## Cash and claims have different roles

The engine imports core `Money` and `Ccy`, with no duplicate definitions. Money is bigint micro-units. A boundary money field is a canonical unsigned decimal string, not a floating-point amount or cents. Internal snapshots preserve bigint through replay.

Each client has settlement cash. Each bank has owned cash. A deposit holds segregated custody cash and is the bank's liability for that same cash. The deposit is counted once. Derived bank reserves equal owned cash plus custody cash. There is no second stored reserve balance that can drift.

The conserved amount is the sum of client settlement cash, bank-owned cash, and custody cash. Loans and unpaid interest are claims, not additional cash. Deposit interest moves bank-owned cash into custody. An interbank draw moves owned cash between two banks. Repayment reverses principal and transfers funded interest.

`movements` records every cash change. `settlements` records per-bank reserve changes with the opposite external settlement-cash leg. Each tick nets to zero. Same-bank own-account transfers leave reserves unchanged.

## Exact time and finite lending

Hourly observations occur at `tick mod30=29`. Every crossed hour requires a fresh, complete explicit policy, Fear, and bank-PD observation. Missing data rejects the whole batch. The engine never substitutes zero or silently reuses stale bank risk.

The reserve target is 100% custody plus the specified0.5% buffer. The projected gap includes known interbank payments and deposit interest through that day's close. There are no invented external scheduled flows. Lending is capped by the positive gap, unencumbered owned cash, and the specification's counterparty limit. Tier1 is owned net assets on this restricted balance sheet, with no AT1, capital deductions, or separate regulatory engine. Interest receivables and debt offset their respective book values. Full ECL supervision is deferred.

Counterparty tolerance, fear, ask, and exposure follow07:543-553. Integer ppm quantizes annual rates with half-even rounding. Borrowers and tied lenders use SHA-256 order followed by core `cmpStr`, not locale-dependent sorting. Zero tolerance disables lending. Loans mature at the following game day's tick719. This explicit interpretation avoids accidental same-tick maturity for a loan matched at719.

At `tick mod720=719`, existing loans accrue daily interest and settle due obligations, then deposits accrue and receive funded interest. Every account rounds independently, half-even, with a364-day denominator. Unpaid deposit interest remains `interestDue` and does not compound as cash. An unfunded interbank balance remains `OVERDUE`. No consumer default penalty or bank-resolution implementation is implied.

The719 hourly match follows those obligations. Its new loans do not accrue before that tick's completed accrual. ONR then fixes from that day's funded volume, or carries the previous ONR-policy spread when volume is insufficient. Zero volume also uses the fallback. Weekends use the same schedule.

## Boundary and storage ownership

`input.ts` accepts plain, acyclic, non-aliased JSON trees with dense arrays and enumerable data properties. It rejects unknown fields, undefined, non-finite numbers, negative zero, Date and other class values, raw bigint, functions, symbols, accessors, hidden fields, and named array properties. No raw input reaches JSON.stringify before validation. Canonical field order makes reordered-object retries identical. Array order remains part of input identity.

`BankingEngine.open` decodes genesis, replays a saved journal, and checks an identity that covers genesis, every frame, and the full reconstructed state. Checkpoints contain no cached partial state. A changed seed cannot reset an existing world. Command ids remain idempotent across restart, including refused commands. A changed body with the same id aborts the whole batch.

`advance` copies and validates input before it waits for the facade's serial queue. A pure transition produces the next state. Save succeeds before publication. Snapshots are defensive clones. Advance skips ticks with no input or scheduled job, but never skips an hourly or daily boundary. A tick run and a jump write identical final checkpoint bytes.

`FileBankCheckpointStore` writes a private temporary file, fsyncs it, and renames it atomically. A short-lived exclusive lock and revision CAS reject concurrent or stale writers. A leftover lock after a process dies fails closed and needs an owner check. There is no automatic stale-lock takeover. Power-loss directory-fsync guarantees and cross-partition settlement are not claimed.

## Existing owners and later integration

AuthService remains the only owner of live web cash in `src/server/auth/service.ts:393-435`. Broker still commits finite-book and player cash together. Macro credit remains a producer port, not a second bank implementation.

This engine receives a new, explicit funded genesis. Copying live AuthService balances into it would duplicate ownership and is not an integration strategy. Mounting it later requires an atomic ownership migration, authenticated actor mapping, macro observations, and03 posting adapters. It also requires coordination before changes to auth, broker, clock, or catalog files. There is no unmerged FX dependency, claims schema, Wire-to-value change, or UI edit.

## Proof artifacts

`tests/unit/banking/banking.test.ts` exercises the public facade, persisted checkpoints, malformed input, atomic failure, canonical retry, hourly and daily boundaries, and complete restart equivalence.

`tools/proofs/banking.ts --help` describes the fresh-store proof command. The runner compares complete tick, jump, and restarted states and final checkpoint bytes. It independently reconstructs every cash bucket and settlement leg, then reconciles funded principal against repayment. Its cases cover paid credit, unpaid maturity, unpaid deposit interest, finite credit exhaustion, fear freeze, and weighted ONR. These are deterministic correctness proofs, not throughput benchmarks or a claim that the unmounted banking UI is playable.
