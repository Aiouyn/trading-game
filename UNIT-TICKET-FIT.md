# Unit: stop ticket fit in the default 840×560 Broker window

**Branch:** `eng/stop-ticket-fit`  
**Base:** `a7460c78be9ca98f9de2132105348e0df7ab7996` (`origin/eng/broker-day-expiry`, PR #109 head)  
**Worktree:** `/workspace/avalon/stop-ticket-fit`  
**When written:** 2026-11-12 01:15:27 Europe/Paris (CET, UTC+1) — before product-code edits.

Do not change order logic. DAY stays the default TIF. Stops still arm on the last trade, in the tick sweep.

## Why this unit

A stop or stop-limit ticket is taller than a market ticket (extra price fields, then the review trigger line). In the default 840×560 desktop Broker window, the review line ("Buys if price rises to …" / "Sells if price falls to …") and the submit button can sit outside the visible ticket, or stay clipped off the top after the long edit form (until Fill). Phone must stay usable.

Docs have drifted from the live broker: `docs/ENGINE.md:175` still says a mid trigger and GTC as the default. `docs/v1/M1-03-PERSISTENCE.md:26` still says stops and non-day TIF are refused.

## Smallest observable outcome

1. **Desktop 840×560.** With a stop or stop-limit filled in, the review trigger line and the submit button are visible in the ticket's visible box without the window scrolling those controls out of view, or the ticket column scrolls that review line into view. They are not clipped off the top of the window before Fill.
2. **Phone stays usable.** The phone ticket and its review sheet still show the trigger line and submit control, with no new overflow or unreachable control.
3. **Docs match the live broker.** `ENGINE.md` says the live behaviour is a last-price trigger with DAY as the default. `M1-03-PERSISTENCE.md` no longer says stops and non-day TIF are refused. HTTP `POST /api/broker/orders` with `tif` omitted still returns 400 (document that; do not change it).
4. **No order-logic change.** Triggers, reservations, DAY/GTC, fees, and `/broker` first-load size are unchanged. Stay ≤ 205 KB gz (cap 215).

Layout change only, and only as much as this fit needs.

## Acceptance

1. This UNIT note is written first (this file), before product-code edits.
2. Exact-head checks: lint, typecheck, no-flag build, check-hooks, `node tools/ci/route-budget.mjs /broker` (≤ 205 KB gz, cap 215), ledger map-no-dup, official `npm test`.
3. Affected broker e2e once on a clean temp `.data`, free port (never :3199 or :3102), desktop + phone, including `tests/e2e/17b/broker-stop.spec.ts`. Extend or add an assertion that the review line is inside the ticket's visible box at 840×560.
4. Screenshots: desktop 840×560 and phone, each with a stop order filled in. Evidence under `/workspace/avalon/evidence/stop-ticket-fit/`.
5. Stray-init (no `pf@test` author, no `tracked.txt`); normal push, no force, no skipped hooks, no PR, no merge, no contact with Gatekeeper.

## Not in this unit

Order-type, trigger, TIF, or fee logic. Broker day-expiry / idempotency product changes. No overall GO, no merge, no deploy.
