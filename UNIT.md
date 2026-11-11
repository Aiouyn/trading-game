# Unit: GET /api/wire is a pure read

**Branch:** `eng/wire-read-only`  
**Base:** `81b5b1445cade5411f186f8738a1c956a1cce914` (`eng/broker-idempotency`)  
**Worktree:** `/workspace/avalon/wire-read-only`  
**When written:** 2026-11-12 00:10:38 Europe/Paris — before product-code edits.  
**Board:** Wire player statements already resolve at `post.tick + 3600` (5 game days) into TRUE / FALSE / OPINION, with a public `sourceRecord`. This unit does not change that contract. It stops `GET /api/wire` from being a writer.

Do not touch Broker order / day-expiry / idempotency code. That work is on a sibling branch from the same base.

## Why this unit

On `81b5b144`, `GET /api/wire` calls `auth.resolveDueWireStatements` and may `persist()` newly due verdicts. `LiveMarket.step` already does the same in a fire-and-forget call. A public GET that writes the auth store is the wrong door: a read can fail mid-persist, two GETs can race a due tick, and a restart that is read-only until the next step can miss a verdict at the due tick itself.

The resolution rule stays as it is today (15:625 §3.10.4 / 16:573): due at `post.tick + STATEMENT_RESOLVE_TICKS` (3600), closed lexicon, frozen verdict, public handle `sourceRecord` (`hits` / `resolved`, OPINION excluded), no cash or quote movement.

## Smallest observable outcome

After this unit:

1. **GET never writes.** A `GET /api/wire` does not call `resolveDueWireStatements` and does not `persist()` the auth store. Proof: a write spy on the store (or the store file mtime) is unchanged across a GET, including when a statement is already due and still unresolved. Cash, quotes, and the digest stay put.
2. **The tick resolves due statements.** `LiveMarket.step` at `dueTick` persists the same TRUE / FALSE / OPINION the GET path would have written today, with the same public `sourceRecord`. A statement stays unresolved at `dueTick - 1`.
3. **A verdict survives a restart.** After a FileAuthStore + clock restart, `LiveMarket.start` catch-up-resolves any statement already due at the resumed tick (so a verdict does not wait for the next cadence step, which would be `lastTick + 1`). GET then returns that stored verdict without writing. A second resolve does not rewrite a frozen verdict or charge.
4. **Account isolation holds.** Account B cannot see A's cash or `acc_…` id. Track records stay keyed by `publicHandleId` only. Two handles do not share a record.
5. **Timing and results are unchanged.** Players still see the verdict at post time + 3600 ticks, with the same TRUE / FALSE / OPINION rules and the same public item shape (`slots.verdict`, `sourceRecord`).

GET may wait for an in-flight engine persist (the clock started it) and then read. Waiting is not a write.

## Plan

- Remove `resolveDueWireStatements` from `GET /api/wire`. The handler reads `market.wire()` and `listPublicWirePosts()` only.
- Give `LiveMarket` a single engine entry (`catchUpWireStatements`): under the current tick and marks, call `peekAuthService()?.resolveDueWireStatements`. Invoke it from `start()` (restart catch-up at the resumed tick) and from `step()` (live cadence). Chain a `whenWireStatementsSettled()` promise so a GET at the due tick waits for the persist the clock already started.
- `resolveDueWireStatements` stays idempotent (frozen verdicts are a no-op persist). No charge path, no `applyShock`, no Broker order changes.
- `/broker` first-load stays at the measured headroom (~196.5 KB gz). Do not regress it; stay ≤ 205 KB gz.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Official unit coverage: GET write-spy / mtime (including a due unresolved row); step at `dueTick` (and not before) persists the verdict; FileAuthStore restart + `start()` catch-up keeps the verdict; a GET after that does not write; two accounts stay isolated; lexicon / sourceRecord shape unchanged.
3. Exact-head checks: lint, typecheck, no-flag build, check-hooks, `node tools/ci/route-budget.mjs /broker` (stay ≤ 205 KB gz), ledger map-no-dup, official `npm test`.
4. Affected e2e once on a clean temp tree, fresh `.data`, free port (never :3199 or :3102): M1-09, WIR-9, WIR-A, M1-10-player-statements (desktop + phone). Delete the temp tree.
5. Stray-init; normal push, no force, no PR, no merge, no contact with Gatekeeper. Evidence under `/workspace/avalon/evidence/wire-read-only/`.

## Not in this unit

Broker day-expiry or order idempotency. 05 belief / surveillance / 13 on FALSE. Voices, `reachWindow`, followers. Composer / first-load budget work (already done). No overall GO, no merge, no deploy.
