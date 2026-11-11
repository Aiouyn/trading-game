# Unit: durable Broker order idempotency (not just the last 50)

**Branch:** `eng/broker-idempotency`  
**Base:** `43127f9e` (`eng/broker-headroom`)  
**Worktree:** `/workspace/avalon/broker-idempotency`  
**When written:** 2026-11-11 23:45:55 Europe/Paris — before product-code edits.  
**Board:** M1-06 (approved V1 board, `/workspace/avalon-m0/V1-BOARD.md` and `docs/v1/V1-BOARD.md`): place/cancel must be **idempotent** on duplicate submit / reconnect (**no double fill**).

## Why this unit

On `43127f9e`, decided intents are one ring: `MAX_INTENTS = 50` (`src/server/player/privateState.ts`). `decidePlace` / `decideCancel` look up a key only in that ring (`replayOf`). The 51st new decision drops the oldest key. A retry of that key is treated as a **new** order: a new `intentId`, a new fill, and cash moves again. That violates M1-06.

The `me` / ledger receipt window can stay last-50 (Q4 keepLast). Idempotency itself cannot.

### Readiness flags checked on `43127f9e` (not this unit)

| Flag | Status on this base | Why not this unit |
|---|---|---|
| Order idempotency window (last 50) | **Live.** `replayOf` uses the 50-long `intents` ring only. | **This unit.** Core trade loop, real double-fill. |
| Day expiry / stop-order UI | **Live.** Server refuses stop / non-day TIF (`MKT_ORDER_TYPE_UNSUPPORTED`); docs: “day orders have no session close yet.” Ticket still offers Stop / Stop limit. | Day close is a separate session-rules unit. Stop buttons are ticket UI; Avalon Builder UI is on `ui/broker-ticket-entry`, `ui/account-first-step`, `ui/broker-trade-sheet` — leave them. |
| GET that rewrites the store | **Live on Wire only.** `GET /api/wire` calls `resolveDueWireStatements` and may `persist()` verdicts. Broker `GET /api/broker/me` and `GET /api/market` do not write cash, holdings, or orders. | Wire verdicts, not the order door. |
| Clock resetting on restart | **Partly fixed, rest disclosed.** Tick resumes from persisted `lastTick`; a restart is still a new epoch for the quote *walk* (virgin marks + rematerialized residuals). Tests and LAUNCHPAD.md treat that as a V1 choice, not a bug. | Do not reopen a disclosed clock-epoch design here. |

Recent `origin/ui/*` and `origin/sys/*` branches do not own Broker idempotency (UI is ticket/sheet/copy; Systems is banking/FX/credit/flags-off).

## Smallest observable outcome

After **more than 50 later decisions** on the same account (enough to evict the first receipt from the last-50 ring):

1. Replaying the **first** idempotency key with the **same** request returns the original `intentId` and `IntentResult`. Cash, positions, and fill count are unchanged (no second fill).
2. Replaying that same key with a **different** request is still **409** `IDEMPOTENCY_CONFLICT`. Still no extra fill.
3. `GET /api/broker/me` (and the place reply's ledger) still exposes at most **50** intent receipts and **50** fills. The durable journal is not a new public ring.
4. A process restart over the same store still honours (1) and (2).
5. `first_trade` telemetry does not fire again merely because earlier accepts have left the last-50 receipt ring.

Existing same-key replay and 409 behaviour inside the 50-window stays unchanged. Charge path, taker fee, and the 215 KB first-load cap stay unchanged.

## Plan

Keep `intents` as the last-50 receipt ring for `me`. Persist a separate durable idempotency journal (`idempotency`: every decided key + fingerprint + result) on the v2 private ledger as an optional field (old saves: seed the journal from the existing ring; no forced v3 bump). `replayOf` and the first-accept check read the journal, not only the ring. Cap the journal high enough for V1 play (fail closed if full — never re-execute a dropped key). A full journal answers **503** `IDEMPOTENCY_JOURNAL_FULL` (not `BAD_REQUEST`). Preview is a read-only dry run: it decides against a **copy** whose receipt and journal rings are empty so it cannot replay a prior key. It does not clear receipts, fills, or the journal on the stored ledger.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Official unit coverage: a 51st (or later) decision evicts the first receipt from the `me` ring; replaying the first key still matches (1)–(2) and (4)–(5) above; the ledger view still has ≤ 50 intents.
3. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, official `npm test`. Preview :3199 stays 200.
4. One affected e2e batch on a clean temp tree, fresh `.data`, free port (not :3199 / :3102), desktop and phone: Broker order path (`BR-4`, and `BR-5` if cancel/limits are in scope).
5. Stray-init; normal push, no force, no PR, no merge, no contact with Gatekeeper. Evidence-only handoff.
