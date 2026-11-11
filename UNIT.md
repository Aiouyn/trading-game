# Unit: server-side DAY order expiry at game-day close

**Branch:** `eng/broker-day-expiry`  
**Base:** `81b5b144` (`eng/broker-idempotency`)  
**Worktree:** `/workspace/avalon/broker-day-expiry`  
**When written:** 2026-11-11 23:59:14 Europe/Paris — before product-code edits.  
**Board / engine:** M1-06 place/cancel loop; `docs/ENGINE.md`: `tif: 'day'` expires at the next game-day boundary. On `81b5b144`, `docs/v1/M1-03-PERSISTENCE.md` still says “day orders have no session close yet.”

## Why this unit

Resting day limit orders never expire. Reservations (buy cash, sell units) stay held across the close, and the open book keeps the order WORKING. That is not the DAY contract.

Expiry must be **authoritative in the tick/engine** (`BrokerService.sweep` / `sweepLedger` / `sweepListed` on the market clock), **not** on `GET /api/broker/me` (or any other GET). A read must not rewrite the store.

The ticket's Stop / Stop limit options stay untouched (Avalon Builder UI).

## Smallest observable outcome

On a signed-in account, a resting **day** limit (buy or sell, including a remaining PARTIAL) that is still working at the **close of the game day it was placed** (`dayCloseTick(dayOf(placedTick))`):

1. After the close tick's fill attempt (a limit that is marketable **at the close mark** still fills; a jump **past** that close does not fill at a later mark), any remainder is recorded **EXPIRED** in the player's **orders** and **history**. Cash cents and position quantities are unchanged except for fills that already happened.
2. Reserved cash (buy: remaining × limit + fee) or reserved shares (sell: remaining qty) are released **exactly**. Spendable cash / sellable units go up by that hold and no more.
3. A second sweep, and a process restart over the same store followed by another sweep, does not move cash or positions again, does not add a second history row, and leaves the order EXPIRED.
4. Another account's cash, reservations, orders, and history are untouched (player isolation).
5. `GET /api/broker/me` at or past that close, if the sweep has not run, leaves the order working and writes nothing. The close is applied only by the tick sweep.
6. The existing Open orders list shows the **Expired** status on that row (chip + `data-status`) and offers no Cancel. Ticket Stop / Stop limit controls are unchanged.

Charge path, taker/maker fees, the last-50 receipt ring, the durable idempotency journal, and the 215 KB first-load cap stay unchanged. GTC remains refused (`MKT_ORDER_TYPE_UNSUPPORTED`).

## Plan

Hook expiry into the existing per-tick sweep, after fill attempts when the clock is **on** the placement day's close, and as a no-fill expire when the clock has already passed that close (a jump or a late sweep). Persist an optional `orderHistory` keepLast-50 ring on the v2 private ledger (no schema bump; old saves have none). Keep the expired order in `me.orders` with status `EXPIRED` so the existing list can show it; ignore EXPIRED rows in reservations and the working-order cap. Prune the oldest expired rows out of `me.orders` if they would block the open-book cap; history still holds them. `ledgerView` exposes `history`. `read()` / GET do not sweep and do not expire.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Official unit coverage of (1)–(6) above, including FileAuthStore restart, two-account isolation, close-tick fill-then-expire, post-close jump with no late fill, and GET-does-not-write.
3. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, official `npm test`. Preview :3199 stays 200.
4. One affected e2e batch on a clean temp tree, fresh `.data`, free port (not :3199 / :3102), desktop and phone: Broker order path (`BR-4`, `BR-5`).
5. Stray-init; normal push, no force, no PR, no merge, no contact with Gatekeeper. Evidence-only handoff.
