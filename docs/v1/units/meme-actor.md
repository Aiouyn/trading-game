# UNIT: meme-farm session-bound launch and trade commands

Written 2026-11-12 01:31:15 Europe/Paris, before any implementation or test code for this unit. Branch sys/meme-actor, from sys/meme-failure-farm ae625a55, with sys/actor-binding 57f8fb80 merged `--no-ff` (no rebase). There was no UNIT doc conflict under docs/v1/units/. This branch has no root UNIT.md.

## Player outcome and scope

A player command that would launch a meme coin or trade one on the isolated failure farm is accepted only as the character that belongs to the signed-in account that owns the targeted wallet. A missing session, a spoofed actor or a command aimed at another account's wallet is rejected before any cash, token, fee, receipt or checkpoint changes. The $1,000 launch fee (100,000 cents, `LP.LAUNCH_FEE`) is charged only to the bound actor's wallet, and only after that check succeeds. A legitimate authorized command leaves the same engine state and the same journal bytes as the same command run without the guard. Currency conservation, finite books, death and the failure-farm laws stay as in sys/meme-failure-farm (`docs/v1/units/meme-failure-farm.md`). This unit does not mount a route, does not edit auth, broker, Wire or the live Launchpad service, and stays default-off.

## Authority

V1 requires real sessions and player isolation (`docs/v1/V1-BOARD.md:82`). Intents carry `actorId` as the session's character (`export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:127,200`; `19-TECH-ARCHITECTURE.md:445`). This unit adopts the isolated adapter in `docs/v1/units/actor-binding.md`: one account maps to one `chr_` actor, and `requireBoundActor` is the only actor comparison. The durable farm command schema stays as in sys/meme-failure-farm: `LAUNCH` and `TRADE` already carry `wallet` and `key` (`src/server/launchpad/failureFarm/model.ts`). ActorContext is an intake sidecar, not a new persisted command or receipt field, so accepted journals remain comparable to sys/meme-failure-farm. The inherited farm contract already recorded that the engine stays unmounted and default-off (`docs/v1/units/meme-failure-farm.md`, Status qualifications). This unit is the session boundary for player launch and trade on that engine, still unmounted.

## Design

Two designs were considered.

Design A would add `ActorContext` onto the persisted command and receipt journal. Rejected: checkpoints would no longer be byte-identical to sys/meme-failure-farm, and replay would have to invent or re-verify sessions.

Design B, the one this unit implements, keeps the journal and the economic `commandFarm` / `advanceFarm` path unchanged. `MEME_ACTOR_DEFAULT_ENABLED = false`. `FailureFarmEngine.open(store, genesis)` keeps its positional arguments. The actor guard is an optional third options bag `{ actorGuard?: unknown, binding?: unknown }`, read only when the caller passes a literal own-property `actorGuard === true`. When the flag is not literally `true`, `execute`, `preview`, `advance` and `commandFarm` behave as on sys/meme-failure-farm; existing proofs and tests stay valid and do not require a context. When the flag is `true`, every player `LAUNCH` or `TRADE` must be accompanied by an `ActorContext` already obtained from `ActorBinding.bindToken`. `requireBoundActor(context, command.wallet)` must succeed before `commandFarm` writes a receipt or moves cash, and the $1,000 fee can debit only that bound wallet. Failures throw a `BindingError` and do not write a receipt, movement or fee, and do not advance published state. This matters because `commandFarm` already persists economic refusals as receipts; the guard therefore cannot run after that handler.

`options.contexts` is read only via `Object.hasOwn`. Inherited prototype values are ignored, so a polluted options object cannot smuggle a context. Individual context values, including `Object.create`, `Proxy` and null-prototype objects, are rejected as `FORGED_CONTEXT` (not `CLAIM_MALFORMED`) unless `isIssuedActorContext` is true. A malformed contexts map (not a context object) is still `CLAIM_MALFORMED`. Callers outside `src/server/actor-binding` must not import `issueActorContext` from `model.ts`; only a context issued by `ActorBinding.bindToken` is accepted.

Every guarded write and every guarded preview/read that would compute a launch or trade reply re-peeks the session through `ActorBinding.assertLiveSession` immediately before acting, and the write path re-peeks again immediately before `save`. Logout, expiry or a session mismatch is `SESSION_REJECTED`, with no receipt, fee or checkpoint written. `FailureFarmEngine.open(..., { actorGuard: true, binding })` requires the binding when the guard is on. Replay of a saved checkpoint stays unguarded, because authorization was decided at intake and sessions may have expired.

Hourly `advanceFarm` effects take no actor and must be impossible to submit on the player command path. They are not command kinds: RETAIL book trades, NPC rally sales, abandonment, rug flags, hype and thin-book delisting. A player command whose `kind` is not `LAUNCH` or `TRADE` is already rejected at parse as `INVALID_FARM_COMMAND`. `advance` keeps calling unguarded `advanceFarm`.

Player wallets under the guard are the bound actor ids (`chr_` plus 32 hex). Fixture names such as `creator` remain valid only on the default-off path. NPC and RETAIL wallets are not session-bound and do not submit player commands.

## Acceptance checks

1. `MEME_ACTOR_DEFAULT_ENABLED` is false. Unguarded `FailureFarmEngine.open(store, genesis)` and `execute` / `commandFarm` / `advance` do not require a context and remain byte-identical to sys/meme-failure-farm ae625a55 on the same tape.
2. With the guard on, a missing session or missing context, a spoofed or forged actor (`Object.create`, `Proxy`, null-prototype, field copy, `structuredClone`), and a command whose `wallet` belongs to a different bound character are each rejected with a typed `BindingError` (`MISSING_SESSION`, `FORGED_CONTEXT`, or `ACTOR_MISMATCH`). Wallet cash, tokens, sink, receipts and the published checkpoint are unchanged. A non-owner launch does not charge the $1,000 fee to anyone.
3. With the guard on and a valid context whose `actorId` equals `command.wallet`, a launch charges exactly 100,000 cents to that bound wallet only, and the resulting state and checkpoint bytes equal an unguarded run of the same genesis, commands and frames.
4. Hourly `advance` effects still run under the guard without an ActorContext, and cannot be submitted as player command kinds.
5. Conservation (cash residual 0, no money creation, token supply conserved) and restart/jump equivalence from `docs/v1/units/meme-failure-farm.md` still hold on clean stores, with the guard both off (existing `tools/proofs/meme-failure-farm.ts` tape compared to ae625a55) and on (`tools/proofs/meme-actor.ts`). The on-guard proofs also cover the fail-closed matrix and guarded versus unguarded byte identity. Guarded preview after logout is `SESSION_REJECTED`, not a computed `LAUNCHED` or `FILLED`.
6. No file under `src/app/**` or any live server route imports `src/server/launchpad/failureFarm` or `src/server/actor-binding`. Auth, broker, Wire and live Launchpad sources are untouched. Nothing imports `issueActorContext` from `src/server/actor-binding/model.ts` outside `src/server/actor-binding`.
7. Lint, typecheck, build, check-hooks, route-budget with `BUDGET_PORT` in 3460–3469, map-no-dup, and `npm test` pass. One e2e run (an auth/session spec, since the farm has no live route) in a fresh detached worktree with fresh `.data` on a port in 3460–3469; that worktree is then removed.

## Before mount

1. One-time ownership migration of player farm wallets onto bound actor ids. NPC and RETAIL wallets stay as they are.
2. Route intake that calls `ActorBinding.bindToken` and then `FailureFarmEngine.preview` / `execute` with the guard on. No live route is added here. The inherited farm calibration and liquidity-rule qualifications in `docs/v1/units/meme-failure-farm.md` remain open before mount.
3. The optional auth `inspectSession` improvement recorded in `docs/v1/units/actor-binding.md`. Not a mount blocker.
4. Owner permission to mount the failure farm, still recorded in `docs/v1/units/meme-failure-farm.md`.
