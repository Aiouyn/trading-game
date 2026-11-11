# UNIT-DELTA: start() catch-up must create auth; bound the GET wait

**Branch:** `eng/wire-read-only`  
**Base:** `81b5b1445cade5411f186f8738a1c956a1cce914` (`eng/broker-idempotency`)  
**Head being fixed:** `27d3a67d5f28b136cea56bf0ea88f54ccb5e9532`  
**Worktree:** `/workspace/avalon/wire-read-only`  
**When written:** 2026-11-12 00:57:05 Europe/Paris (CET, UTC+1) — before product-code edits.  
**Owner:** Gatekeeper review of `27d3a67d` (`/workspace/avalon/evidence/launchpad/gatekeeper/27d3a67d/REVIEW.md`). B1 blocks. The unbounded GET wait is a qualification on the same review, folded in here.

This delta does not replace UNIT.md. GET stays a pure read: it does not call `resolveDueWireStatements` and does not `persist()`. Resolution stays on the clock (`start()` catch-up and each `step()`). The classifier, due window (`post.tick + 3600`), public `sourceRecord`, fee, and cash rules are unchanged.

## B1 — start() catch-up must create auth (blocker)

`GET /api/wire` calls `getBroker()` → `getLiveMarket()` → `whenWireStatementsSettled()` and only then `getAuthService()`. `getLiveMarket()` autostarts the clock in production. `start()` runs `catchUpWireStatements()` once, using `peekAuthService()`, which does not create the singleton. A later `start()` is a no-op (`this.timer` is already set), so a due verdict waits for `step()` at `lastTick + 1`.

Repro: `proof/http-restart-probe.json` and `repros/gk-wire-ro-probes.test.ts` (“start() before auth is wired no-ops catch-up…”). Official units pass because they wire auth before `start()`.

**Contract.**

- `start()` / `getLiveMarket()` must make the auth service exist before catch-up runs, so every first-call path is covered, not only GET.
- After a restart with a due statement (`lastTick = due`), the first `GET /api/wire` of the new process returns the resolved verdict at the resumed tick, not at `lastTick + 1`.
- GET itself stays write-free: it does not call `resolveDueWireStatements` or `persist()`. The clock catch-up may persist; further GETs do not write (store hash and mtime unchanged).

## Qualification — bound the GET wait

`whenWireStatementsSettled()` is an unbounded wait on the in-flight persist. If a `save()` never settles, GET hangs past 2 s (proved in the same review).

**Contract.** The wait has a short timeout (2 s). On timeout, GET returns the current state as a read, without writing. The in-flight persist is not cancelled and may still finish later. A persist that rejects still settles as today (clock continues; GET proceeds).

## Proofs this delta must include

- Official unit: `GET /api/wire` is the first call after a FileAuthStore + clock restart with a due statement at the resumed tick; the first response has the verdict resolved at that tick, not `lastTick + 1`.
- Official unit: a hanging persist does not leave GET pending past the timeout; the response is the current unread state; the store is not written by GET.
- Replay of Gatekeeper's HTTP restart probe on a no-flag `next start`: first GET after patching `lastTick` to due returns the resolved verdict at the resumed tick.

## Acceptance

1. This UNIT note is written first (this file), before product-code edits.
2. Exact-head checks: lint, typecheck, no-flag build, check-hooks, `node tools/ci/route-budget.mjs /broker` (cap 215 KB; stay ≤ 205 KB gz target), ledger map-no-dup, official `npm test`.
3. Affected wire e2e once on a clean temp tree, fresh `.data`, free port (never :3199 or :3102): M1-09, WIR-9, WIR-A, M1-10-player-statements (desktop + phone). WIR official-flag tests use a build with `QUAY_OFFICIAL_E2E_BUILD=1`. Delete the temp tree.
4. Stray-init check (no `pf@test` author, no `tracked.txt`); normal push, no force, no skipped hooks, no PR, no merge, no contact with Gatekeeper. Evidence under `/workspace/avalon/evidence/wire-read-only/`.

## Not in this unit

Broker day-expiry or order idempotency. Classifier / due-window / composer changes. No overall GO, no merge, no deploy.
