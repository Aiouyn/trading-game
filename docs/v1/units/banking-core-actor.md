# UNIT: banking-core session-bound money commands

Written 2026-11-12 00:47:50 Europe/Paris, before any implementation or test code for this unit. Branch sys/banking-core-actor, from sys/banking-core 4679a974, with sys/actor-binding 929ed35f merged `--no-ff` (no rebase). There was no UNIT doc conflict under docs/v1/units/. This branch has no root UNIT.md.

## Player outcome and scope

A player command that would move or claim money on the unified bank ledger is accepted only as the character that belongs to the signed-in account that owns the targeted deposit, loan, ledger account or CCP member. A missing session, a spoofed actor or a command aimed at another account's deposit, loan, account or member is rejected before any cash, deposit, loan, receipt or audit changes. A legitimate authorized command leaves the same engine state and the same journal bytes as the same command run without the guard. Currency conservation, credit creation and destruction, resolution and finite CCP closeout stay as in sys/banking-core (`docs/v1/units/banking-core.md`). This unit does not mount a route, does not edit auth, broker or Wire, and stays default-off.

## Authority

V1 requires real sessions and player isolation (`docs/v1/V1-BOARD.md:82`). Intents carry `actorId` as the session's character (`export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:127,200`; `19-TECH-ARCHITECTURE.md:445`). This unit adopts the isolated adapter in `docs/v1/units/actor-binding.md`: one account maps to one `chr_` actor, and `requireBoundActor` is the only actor comparison. The inherited banking-core contract already named this work as before-mount item 1: command `actor` values are unauthenticated strings, checked only against configured owners; mounting must derive the actor from the authenticated session (`docs/v1/units/banking-core.md`, Before mount). This unit is that boundary for the unified ledger, still unmounted.

The durable command schema stays as in sys/banking-core: every player command already carries `{ id, actor, kind, ... }`. ActorContext is an intake sidecar, not a new persisted command or frame field, so accepted journals remain comparable to sys/banking-core.

## Design

Two designs were considered.

Design A would add `ActorContext` onto the persisted command and `CoreFrame` journal. Rejected: checkpoints and frame bytes would no longer be identical to sys/banking-core, and replay would have to invent or re-verify sessions.

Design B, the one this unit implements, keeps the journal and the economic `reconstruct` path unchanged. `BANKING_CORE_ACTOR_DEFAULT_ENABLED = false`, distinct from `BANKING_CORE_DEFAULT_ENABLED`. `BankingCoreEngine.open(store, genesis, enabled)` keeps its positional third argument. The actor guard is an optional fourth options bag `{ actorGuard?: unknown }`, read only when the caller passes a literal own-property `actorGuard === true`. When the flag is not literally `true`, `advance` behaves as on sys/banking-core; existing proofs and tests stay valid and do not require a context. When the flag is `true`, every player-initiated command that can move or claim money must be accompanied by an `ActorContext` already obtained from `ActorBinding.bindToken`. Those commands are: banking OPEN, DEPOSIT, WITHDRAW, MOVE and PAY; credit APPLY, ACCEPT, DRAW, REPAY, CLOSE_LINE, EXPENSE and REFUND_EXPENSE; liquidity MOVE, CAPITAL and BID; CCP POST_MARGIN and PAY_CALL. `requireBoundActor(context, command.actor)` must succeed, and the bound actor must be the owner of the targeted deposit, receiving or source account, loan, credit client, liquidity account or CCP member, before `reconstruct` runs any command handler. Failures throw a `BindingError` and do not write a receipt, movement or phase audit, and do not advance published state. This matters because the existing handlers already push a receipt even for `NOT_OWNER` and `UNKNOWN_ACTOR`; the guard therefore cannot run after those handlers.

System and tick-driven effects take no actor and must be impossible to submit on the player command path. They are not command kinds: hourly and daily banking interest and interbank matching, credit scheduled default and offer expiry, liquidity runs, resolution and bail-in, CCP P7/P13 closeout, variation margin and assessments, and the `BANK_RESOLUTION` default injected when a linked bank has failed. A player command whose `kind` is one of those effects is rejected at frame parse, the same as any other unknown kind. `readCheckpoint` and `open()` replay keep calling unguarded `reconstruct`, because authorization was decided at intake and sessions may have expired.

Player owners under the guard are the bound actor ids (`chr_` plus 32 hex): banking and credit client ids, ledger account owners, and CCP member owners. Fixture names such as `alice` remain valid only on the default-off path.

## Acceptance checks

1. `BANKING_CORE_ACTOR_DEFAULT_ENABLED` is false. Unguarded `BankingCoreEngine.open(store, genesis, true)` and `advance` do not require a context and remain byte-identical to sys/banking-core on the existing fixtures.
2. With the guard on, a missing session or missing context, a spoofed actor id, and a command whose targeted deposit, account, loan or member belongs to a different bound character are each rejected with a typed `BindingError`. Ledger cash, deposits, loans, receipts, the audit log and the published checkpoint are unchanged.
3. With the guard on and a valid context whose `actorId` equals the command actor and the targeted owner, the resulting state and checkpoint bytes equal an unguarded run of the same genesis, frames and commands.
4. System and tick-driven effects still run under the guard without an ActorContext, and cannot be submitted as player command kinds.
5. Conservation, zero residuals, and restart/jump equivalence from `docs/v1/units/banking-core.md` still hold on clean stores, with the guard both off (existing `tools/proofs/sys-banking-core.ts`) and on (`tools/proofs/banking-core-actor.ts`). The on-guard proofs also cover the fail-closed matrix and guarded versus unguarded byte identity.
6. No file under `src/app/**` or any live server route imports `src/server/banking-core` or `src/server/actor-binding`. Auth, broker and Wire sources are untouched.
7. Lint, typecheck, build, check-hooks, route-budget with `BUDGET_PORT` in 3450–3459, map-no-dup, and `npm test` pass. One e2e run (the auth/session spec, once) in a fresh detached worktree with fresh `.data` on a port in 3450–3459; that worktree is then removed.

## Before mount

1. One-time ownership migration of player banking clients, ledger account owners, credit clients and CCP member owners onto bound actor ids. System, custody and bank-internal accounts stay as they are.
2. Route intake that calls `ActorBinding.bindToken` and then `BankingCoreEngine.advance` with the guard on. No live route is added here.
3. The optional auth `inspectSession` improvement recorded in `docs/v1/units/actor-binding.md`. Not a mount blocker.
4. Owner permission to mount banking-core, still recorded in `docs/v1/units/banking-core.md`.

## Gatekeeper quals (2026-11-12 00:59 Europe/Paris)

Recorded after the contract above, once the issued-context quals landed in actor-binding. The guarded path only accepts `ActorContext` objects issued by `ActorBinding` (`requireBoundActor` fails closed as `FORGED_CONTEXT` on a field-wise copy or a `structuredClone`). Immediately before `save`, the engine re-peeks each new player command's session through `ActorBinding.assertLiveSession`. Logout, expiry or a session mismatch is `SESSION_REJECTED`, with no receipt, movement or audit written. `BankingCoreEngine.open(..., { actorGuard: true, binding })` requires the binding when the guard is on. Replay of a saved checkpoint stays unguarded.
