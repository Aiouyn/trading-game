# UNIT: FX session-bound wallet commands

Written 2026-11-12 00:29:31 Europe/Paris, before any implementation or test code for this unit. Branch sys/fx-actor, from sys/fx be3e296ab8a57160d09a92ed55254da25de6fcb7, with sys/actor-binding 0918bb620bffb441bf8ee0f6bf26f371bd92b6df merged `--no-ff` (no rebase). There was no root UNIT.md add/add conflict; the inherited sys/fx contract was moved to docs/v1/units/fx.md so this branch has no root UNIT.md.

## Player outcome and scope

An FX command that would move, reserve or post from a wallet is accepted only as the character that belongs to the signed-in account that owns that wallet. A missing session, a spoofed actor or a command aimed at another account's wallet is rejected before any cash, offer, reservation, transfer or receipt changes. A legitimate authorized command leaves the same engine state and the same journal bytes as the same command run without the guard. Currency conservation and finite counterparties stay as in sys/fx (`docs/v1/units/fx.md`). This unit does not mount a route, does not edit auth, broker or Wire, and stays default-off.

## Authority

V1 requires real sessions and player isolation (`docs/v1/V1-BOARD.md:82`). Intents carry `actorId` as the session's character (`export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:127,200`; `19-TECH-ARCHITECTURE.md:445`). This unit adopts the isolated adapter in `docs/v1/units/actor-binding.md`: one account maps to one `chr_` actor, and `requireBoundActor` is the only actor comparison. The durable FX command schema stays `{ id, account, kind, ... }` (`src/server/market/fx/model.ts:20-27`). ActorContext is an intake sidecar, not a new persisted command field, so accepted journals remain comparable to sys/fx.

The inherited FX unit already recorded that "authorization boundary" was later work (`docs/v1/units/fx.md`, Grounding). This unit is that boundary for FX, still unmounted.

## Design

Two designs were considered.

Design A would add `ActorContext` onto the persisted `Command` and `Frame` journal. Rejected: checkpoints and `lastFrame` would no longer be byte-identical to sys/fx, and replay would have to invent or re-verify sessions.

Design B, the one this unit implements, keeps the journal and `advanceFx` economic path unchanged. `FX_ACTOR_DEFAULT_ENABLED = false`. When the flag is not literally `true`, `previewFx`, `advanceFx` and `FxEngine` behave as on sys/fx; existing proofs and tests stay valid. When the flag is `true`, every command that can move a wallet (OFFER, CANCEL, CONVERT, BANK, AUTO — all carry `account` today) must be accompanied by an `ActorContext` already obtained from `ActorBinding.bindToken`. `requireBoundActor(context, command.account)` must succeed before `commands()` runs. Failures throw a `BindingError` and do not write a receipt, transfer, offer or reservation, and do not advance published state. Replay of an already-saved checkpoint does not re-bind sessions: `readCheckpoint` keeps calling unguarded `advanceFx`, because authorization was decided at intake.

Player wallets under the guard are the bound actor ids (`chr_` plus 32 hex). Fixture names such as `alice` remain valid only on the default-off path. SYSTEM wallets (fees, bank inventory and income, asset sellers that do not submit commands) are not session-bound.

## Acceptance checks

1. `FX_ACTOR_DEFAULT_ENABLED` is false. `FxEngine.open` and unguarded `advanceFx` / `previewFx` do not require a context and remain byte-identical to sys/fx on the existing fixtures.
2. With the guard on, a missing session or missing context, a spoofed actor id, and a command whose `account` belongs to a different bound character are each rejected with a typed `BindingError`. Wallet cash, offers, reservations, transfers, receipts and the published checkpoint are unchanged.
3. With the guard on and a valid context whose `actorId` equals `command.account`, the resulting state and checkpoint bytes equal an unguarded run of the same genesis, frames and commands.
4. Conservation and finite-book behaviour from `docs/v1/units/fx.md` still hold on clean stores, including restart and jump equivalence, with the guard both off (existing `tools/proofs/fx.ts`) and on (`tools/proofs/fx-actor.ts`).
5. No file under `src/app/**` or any live server route imports `src/server/market/fx` or `src/server/actor-binding`. Auth, broker and Wire sources are untouched.
6. Lint, typecheck, build, check-hooks, route-budget with `BUDGET_PORT` in 3450–3459, map-no-dup, and `npm test` pass. One e2e run (an FX-relevant spec if one exists, otherwise an auth/session spec) in a fresh detached worktree with fresh `.data` on a port in 3450–3459; that worktree is then removed.

## Before mount

1. One-time ownership migration of player FX wallets onto bound actor ids. SYSTEM wallets stay system wallets.
2. Route intake that calls `ActorBinding.bindToken` and then `FxEngine.preview` / `observe` with the guard on. No live route is added here.
3. The optional auth `inspectSession` improvement recorded in `docs/v1/units/actor-binding.md`. Not a mount blocker.
4. Owner permission to mount FX.
