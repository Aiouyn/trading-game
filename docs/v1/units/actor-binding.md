# UNIT: session-to-actor binding

Written 2026-11-12 00:12:22 Europe/Paris, before any implementation or test code. Branch sys/actor-binding, base 110583b0aa73ece1dc3b856665f3be0405f1acc3. The new unit has no root UNIT.md.

## Player outcome and scope

A player command against a later-mounted sys engine is accepted only as the character that belongs to the signed-in account. The client cannot pick a different actor. A missing, expired, malformed or unknown session is rejected and no command runs. The same account always resolves to the same actor, including after a process restart and a store reopen. This unit adds only an isolated, default-off adapter. It does not mount a route, does not edit auth, broker or Wire statement code, and does not change fx, banking-core, the meme farm or policy-recovery.

## Authority

V1 already requires real sessions and player isolation (`docs/v1/V1-BOARD.md:82`). Full-spec identity is one character per account (`export/vision-review/complete/00-INDEX-AND-CONVENTIONS.md:127`, `14-PLAYER-PROGRESSION-LIFESTYLE.md:45`, `19-TECH-ARCHITECTURE.md:206`). Intents carry `actorId` as that character, or later an operator the character owns (`00-INDEX-AND-CONVENTIONS.md:200`; `19-TECH-ARCHITECTURE.md:445` requires a valid session and that `actorId` is the session's character or such an operator). V1-BOARD.md:84 keeps businesses out, so this unit binds only the session's character. Operator mandates are out of scope.

Auth remains owned by Avalon Builder. This adapter may only call the existing exported session lookup in `src/server/auth` (`AuthService.resolveSession` and `AuthService.peekSession` in `service.ts:284` and `service.ts:328`, re-exported from `index.ts`). Token extraction may use the exported cookie helpers (`tokenFromRequest` in `http.ts:53`). Session rules are not reimplemented here.

## Design

Two designs were considered.

Design A would mint a random actor id on first bind and persist the map. Rejected: the result is not a function of the account id, first-seen races can disagree, and a lost store silently issues a new identity.

Design B, the one this unit implements, derives the actor id as a pure function of the auth account id: a domain-separated SHA-256, encoded as `chr_` plus 32 lowercase hex characters. That matches the `chr_` kind in `00-INDEX-AND-CONVENTIONS.md:89` and `19-TECH-ARCHITECTURE.md:206` without pretending the local M1 auth ids are ULIDs (`src/server/auth/crypto.ts:37-38` already uses `acc_` plus hex). The function is one-to-one for practical purposes, leaks no account id, and is identical after restart without needing the store. A binding store still records each `{ accountId, actorId, boundAtMs }` pair as a witness, refuses any attempt to remap an account, and is what restart and reopen proofs compare byte-for-byte.

`ActorContext` is `{ actorId, accountId, sessionId, boundAtMs }`. Commands carry a claimed actor (the existing `actor`, `account` or `wallet` field). `requireBoundActor` rejects a missing, malformed or non-matching claimed actor, including a spoofed id and another account's actor. Engines keep their own ownership checks; this guard only proves the claimed actor is the session's character.

Session lookup:
- Command and other mutating binds call `resolveSession`, which refreshes idle expiry.
- Read-only binds may call `peekSession`, which does not refresh or revoke.
- No token, or an empty token, is `MISSING_SESSION`.
- A non-string value, or a string that cannot be a session token (control characters, whitespace-only, absurd length), is `MALFORMED_SESSION`.
- A well-formed token for which the exported lookup returns `null` is `SESSION_REJECTED`. `resolveSession` and `peekSession` both collapse unknown, expired, revoked and missing-account failures into `null`, so this adapter cannot emit distinct typed reasons for those cases without reimplementing session rules. The exact `inspectSession` signature needed from auth is recorded below. Until that exists, `SESSION_REJECTED` is the honest fail-closed code.

Default-off: `ACTOR_BINDING_DEFAULT_ENABLED = false`. `ActorBinding.open` throws `ACTOR_BINDING_DISABLED` before any store access when the enabled flag is not literally `true`. Nothing in `src/app/**` or any live server route imports this module. Only tests and the proof runner do.

Input at the boundary is plain JSON: Proxy, class instances, getters, `toJSON`, `Date`, `undefined`, `NaN`, `Infinity`, sparse arrays, functions and unknown fields are rejected before acceptance or save, so accepted state equals saved state equals replay identity.

## Adoption (documentation only; those branches are not modified)

- **fx** (`src/server/market/fx/` on `sys/fx`). Player commands are `Command` with `account: WalletId` (`model.ts:21-28`). `advanceFx` / `previewFx` in `engine.ts` authorize through `permission` and `conversionGate` (`engine.ts:11-21`) against that wallet. `FxEngine.preview` and `FxEngine.observe` in `store.ts:47-59` are the intake. At mount, bind the request session and reject when `command.account !== context.actorId`. Genesis wallet ids that represent players must be the bound character ids, or moved once in the ownership migration.
- **banking-core** (`src/server/banking-core/` on `sys/banking-core`). Commands already carry `actor: string` (for example `internal/banking/model.ts:8-11`, `internal/credit/model.ts`, `internal/liquidity/model.ts`, `internal/ccp/model.ts`), parsed in the matching `input.ts` / `boundary.ts` files and dispatched from `engine.ts` during `advance`. At mount, wrap command intake with `requireBoundActor` so a client cannot name another owner. This is the "Actor-to-auth binding" step already listed in `docs/v1/units/banking-core.md` (Before mount, item 1). Configured owner strings become bound actor ids in the same one-time migration.
- **meme failure farm** (`src/server/launchpad/failureFarm/` on `sys/meme-failure-farm`). `FarmCommand` uses `wallet: string` (`model.ts:26-27`); `launch` and the trade path in `engine.ts` debit that wallet. At mount, bind the session and reject when `command.wallet !== context.actorId`. `createFarm` wallet ids for players follow the same migration.
- **policy-recovery** (`src/server/market/policyRecovery/` on `sys/policy-recovery`). There is no player command actor today: `advancePolicy` (`engine.ts:174`) consumes `CatalogInputs`, and `Wallet.id` values (`engine.ts:8`, `createPolicyState` at `engine.ts:36`) are free strings used as program sources or recipients. Adoption is to tag player-owned wallets with bound actor ids at genesis or migration, and to run the same guard on any later player-facing command. Catalog and scheduled policy are not session-bound.

## Acceptance checks

1. The flag defaults to false. `open()` with the default, or with any value other than `true`, throws `ACTOR_BINDING_DISABLED` before store I/O. No production route or `src/app/**` file imports the module.
2. One auth account id maps to exactly one actor id. The same account, including a second session and a restart that reopens both the auth store and the binding store, yields the same actor. The saved binding checkpoint is byte-identical across jump, reopen and restart. Two accounts never share an actor.
3. Fail-closed matrix: missing session, malformed token, unknown token, expired session and revoked session are all rejected with a typed error and do not create or change a binding.
4. `requireBoundActor` rejects a spoofed actor id, a missing or non-string claimed actor, and a command whose actor belongs to a different account than the session.
5. Boundary fixtures (Proxy, getters, `toJSON`, `Date`, sparse arrays, unknown fields, non-JSON values) are rejected; a legal checkpoint reloads as itself.
6. Lint, typecheck, build, check-hooks, route-budget with `BUDGET_PORT` in 3450–3459, map-no-dup, and `npm test` pass. One existing auth/session e2e runs once in a fresh detached worktree with a fresh `.data` on a port in 3450–3459; that worktree is then removed. Deterministic proofs cover restart/reopen identity and the fail-closed matrix.

## Before mount

1. Optional auth improvement: `inspectSession`, so expired, unknown, revoked and missing-account failures can be typed separately. Not a mount blocker; the adapter already fails closed.
2. Wire the guard into fx, banking-core, the meme farm, and any later policy player commands, each as a separately gated delta.
3. One-time ownership migration of existing fixture or live wallet and owner strings onto bound actor ids. No dual writes.
4. Owner permission to mount each engine. This adapter stays default-off until then.

## Session API requested from auth (not implemented here)

`resolveSession` and `peekSession` both return `AuthSessionView | null`. Distinct typed errors for expired versus unknown versus revoked versus missing account need a lookup that reports a reason, without this adapter copying session expiry or token-hash rules.

```ts
export type SessionRejectionCode =
  | "MISSING_TOKEN"
  | "MALFORMED_TOKEN"
  | "UNKNOWN_SESSION"
  | "EXPIRED_SESSION"
  | "REVOKED_SESSION"
  | "UNKNOWN_ACCOUNT";

export type SessionLookupResult =
  | { ok: true; view: AuthSessionView; refreshed: boolean }
  | { ok: false; reason: SessionRejectionCode };

// On AuthService (src/server/auth/service.ts), next to resolveSession / peekSession:
inspectSession(
  rawToken: string | null | undefined,
  options?: { readonly refresh?: boolean },
): Promise<SessionLookupResult>;
```

`refresh: true` is the `resolveSession` behaviour (idle refresh, persist, revoke expired). `refresh: false` or omitted is the `peekSession` behaviour (no write). Existing routes can keep using the current methods.
