# Card 27 — Positions Close pre-fills a sell in Broker

**When:** 12 Nov 2026, 06:51 Europe/Paris (CET)
**Branch:** `ui/positions-close-prefill`
**Base:** `origin/main` `98939480a24654f729a260de4c3ad0b9f5693f9a` (PR111 + PR113)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** low (UI pre-fill only). Not opening a PR. No push this pass.

## Player outcome

After the first fill, the Positions row has a Close control. Tapping it opens the existing Broker ticket for that asset, already set to Sell, with the position's quantity already in the box. The ticket stays in edit. The player still has to review and place. Nothing is submitted.

## Grounding

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:857` and PF-02: "Close (opens pre-filled ticket)". Set stop is out of this card.
- `docs/v1/REVIEW-LESSONS.md` entry 19: unknown-session / first-paint — Close must not appear on the positions skeleton, and must not invent a quantity.
- BR-4-03 / BR-5-02: no client maths on server numbers. The qty in the box is `pos.qty` as sent (the same string the row already shows, unformatted). No cash, last, pledged, or average-cost arithmetic.

## Scope

- A Close button on each live position row (desktop table and phone/cards).
- Clicking it records a one-shot UI prefill `{ assetId, side: "SELL", qtyText: pos.qty }` and calls the existing `store.open("broker", assetId, { deepLink: true })`. Window context stays the asset id, so deep-link reuse is unchanged.
- `BrokerFrame` applies that prefill to the existing draft (side + qty text, market, edit phase). If the HALC ticket is already open, the same apply happens without remounting as a new asset.
- No new order logic. No changes to `placeOrder`, `previewOrder`, `dayDraft`, or the Review/Place path. Prefill does not click Review and does not send an intent.
- EN + FR Close copy. Loading and error/empty states have no Close control.

## Out of scope

- Set stop, Roll, Exercise.
- Short-position close (V1 fixtures and `Position` have no side; qty is a positive holding).
- Subtracting pledged/lent qty (the server decides what is sellable on preview).
- Any client-computed size.

## If this needed order or submit code

Stop here, leave this UNIT plus a 3-line plan, and ask Gatekeeper (high tier). The plan below does not touch that path.

## Sketch

1. `src/apps/broker/ticketPrefill.ts` — offer / take / subscribe. Module-level pending intent, cleared once the ticket consumes it. Not a contract, not an order.
2. Positions live row: Close button, `data-testid="pos-close"`. Missing on the 3-row skeleton, on error, and on the empty-cash state.
3. `BrokerFrame` initial draft and a subscribe effect apply a matching prefill; phase stays `edit`; view stays or returns to Trade.

## Acceptance / proof

- Fail-first unit: live HALC row (`qty` `"1200"`) has no Close; after the fix it does. Clicking it opens Broker with context `HALC` and does not call place/preview itself.
- Fail-first ticket unit: offer a HALC SELL `"1200"` prefill, mount `BrokerApp` with context `HALC`. After the fix: `br-side-sell` is pressed, `br-qty` is `"1200"` (not `"1,200"`), `data-phase` is `edit`, intent log is unchanged, Review was not invoked.
- Re-offer on an already-mounted HALC ticket still applies side and qty and stays in edit.
- Auth / first paint: while `me` is `loading`, no `pos-close`. Holding `/api/auth/me` in e2e must not flash a Close on the skeleton.
- Official-flag e2e on fresh `.data`: a brand-new account has no positions, so Close is absent (empty state). The prefill path is proven on the official-flag mock/guest holdings (HALC 1200) and by production play of that path at 1280 and 390, with screenshots. A fresh signed-in book has nothing to close until a fill exists; this card does not place that first fill.
- Lint, typecheck, build, check-hooks, unit, ledger-no-dup, route-budget, e2e. No push.
