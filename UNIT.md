# Unit: stop, stop-limit, and GTC on the server broker

**Branch:** `eng/broker-day-expiry`  
**Base:** `919cdb6d` (DAY limits expire in the tick sweep)  
**When written:** 2026-11-11 — before product-code edits.

## Why this unit

The ticket already offers Stop and Stop limit, and the draft can name `gtc`, but the server rejects both (`MKT_ORDER_TYPE_UNSUPPORTED`). DAY remains the default. A stop must arm only when the last trade crosses it, inside the tick sweep, and a GTC order must still be there after the game-day close.

## Smallest observable outcome

On a signed-in account:

1. A sell stop rests until the last trade is at or below the stop; a buy stop until the last trade is at or above. The sweep then marks it **Triggered**. A stop market fills like a market order, at the next available price (a gap does not fill at the stop). A stop-limit becomes a limit at its limit and does not fill at a price worse than that limit.
2. Cash (buy: remaining × stop, or × limit for a stop-limit, plus fee) or shares (sell) are reserved the same way as a limit. Cancel and DAY expiry release that hold exactly. Cash cannot go negative and holdings cannot go negative.
3. The same idempotency key replays the first decision. A second sweep, and a restart on the same FileAuthStore, does not fill or release twice.
4. Another account's cash, reservations, orders, and history are untouched.
5. `GET /api/broker/me` does not arm, fill, or expire. GTC stays working across the close. A DAY stop expires at the close like a DAY limit.
6. The ticket sends Stop, Stop limit, and Day/GTC. Review says "Sells if price falls to …" or "Buys if price rises to …". Orders and history show Triggered, Expired, and Cancelled.

A triggered listed stop fills only what that coin's book can pay or deliver. Catalog stops fill at the server last, the same way a catalog market order does today. IOC and FOK stay refused.

## Acceptance

1. UNIT.md is written first (this file), before product-code edits.
2. Unit tests: trigger on cross, gap fill, stop-limit not beyond the limit, reservation release on cancel and expiry, GTC surviving a day close, restart idempotency, two-account isolation.
3. Playwright `tests/e2e/17b` places a stop and shows it trigger on desktop and phone.
4. `npm run lint`, `npm run typecheck`, `npm run build`, `node tools/check-hooks.mjs .next/static .next/server`, `node tools/ci/route-budget.mjs /broker` (≤ 205 KB gz), ledger map-no-dup, `npm test`.
5. Push `eng/broker-day-expiry` and open a PR against `main`. Do not merge.
