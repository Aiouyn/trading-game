# Card 41: the buy's ack still shows after the player leaves the ticket mid-Place

**When:** 12 Nov 2026, 13:34 Europe/Paris (CET), written before any test or product code
**Branch:** `ui/buy-ack-after-leave`
**Base:** `origin/main` `08b8876b3b55bd9b651c11c12f4f60e55397cf0b` (PR #134 merge)
**Identity:** Forge (trading-game bot) <forge@trading-game.local>
**Tier:** high (order-ack path). This pass is docs + fail-first tests only. No product code, no push, no PR. The fix waits for Gatekeeper to approve the 3-line plan below.
**Source:** Gatekeeper review of card 40 @72d20d3f, backlog b1 (`/workspace/avalon/evidence/launchpad/gatekeeper/72d20d3f/REVIEW.md` section 3 "phone question" and backlog; replay `replay/gk-replay-signed-phone.json` `phoneQ`, script `proof/gk-c40-replay.mjs:103-138`).

## Player outcome

On phone, a player places a buy and goes to Positions (or another app) before the order's reply arrives. The buy fills, and Positions shows the new quantity, but "Bought N X at P" is never shown anywhere, so the player can't tell the order went through. Gatekeeper's replay: hold 7 HALC, slow Buy 5 (5 s route delay), go to Positions mid-Place, Close, Place: only "Sold 12 HALC at 42.06" is shown (`acksTotalSinceBuy5: 1`). The same happens on main and on a desktop Broker window that is closed mid-Place.

After this card: the player sees the buy's ack once, wherever they are, and never twice when they stayed on the ticket.

## Root cause (base 08b8876b)

- The ack only exists inside the mounted ticket. The phase that carries our intent id is component state: `src/apps/broker/BrokerFrame.tsx:94` (`useState<Phase>`). Place sets it from the reply: `BrokerFrame.tsx:222-225` (`placeOrder(order).then((r) => setPhase({ ..., intentId: r.value }))`).
- The ack panel is derived from that local intent id: `BrokerFrame.tsx:196` (`result = me.body.intents.find(i => i.intentId === placed.intentId)`), rendered at `BrokerFrame.tsx:330-336` and shown in place of the ticket at `BrokerFrame.tsx:351`. The copy is `AckPanel` (`src/apps/broker/TicketReview.tsx:85-90`, `t.bought` / `t.sold` at `src/apps/broker/strings-en.ts:65-66`).
- On phone only one app is mounted: `src/components/shell/PhoneHome.tsx:281-289` renders `AppBody` for `phoneApp` alone, and `store.open()` replaces it (`src/shell/store.ts:126`). Opening Portfolio unmounts BrokerFrame mid-Place. When the reply arrives, the `.then` at `:222` calls `setPhase` on an unmounted component; React drops it. The intent id is gone, so nothing ever matches the IntentResult that lands on `me.intents` (`src/shell/contracts/channels.ts:44`, ring keepLast 50).
- No other surface reads our IntentResults. The shell has no toast host: `rg -i toast src` finds only the `z-toast` token (`src/styles/tokens.ts:159`) and a comment in `src/components/ui/money.ts:47`.
- The order itself is fine: the server or mock door commits it, `me` carries the fill, and Positions shows the new holding (Gatekeeper: ledger BUY 5, SELL 12, no duplicate). This is a feedback gap, not an order bug.

## Spec

- `export/vision-review/complete/17-UX-SCREENS-DESIGN-SYSTEM.md:445` (§3.5 OrderPad states): "filled (toast), rejected (toast with reason)".
- `17-UX…:568` (§3.10.1 routing): category `fill`, "05 order filled/partial/rejected", P2, Toast **yes**, Bell yes, Banner no, Push never.
- `17-UX…:581` (§3.10.2 Toasts): top-right under the strip, `PARAM.ui_toast_max_visible = 3`, `PARAM.ui_toast_ms = 4000`, `Esc` dismisses; "Toasts never cover an active OrderPad"; "Phone: one at a time from the status bar"; 3+ fills in one tick merge into one toast. Params at `23-PARAMETER-REGISTRY.md:1105-1106`.
- `17-UX…:661`: toasts in an `aria-live="polite"` region; fills are `assertive`.
- `17-UX…:1200` (ONB-06 first trade): "pending ring, fill toast".
- `17-UX…:1305` (17-AT-40): no toast or banner covers an active OrderPad at any breakpoint.
- `docs/v1/V1-BOARD.md` M1-06 "idempotent submit/reconnect" (no second order from this card) and M2-04 "Mobile shell: Broker + Portfolio + Wire ~390px".

## Plan (3 lines, for Gatekeeper)

1. Own the ack outside the ticket: a small module store (`src/apps/broker/placedAcks.ts`) records each Place's intent id when `placeOrder` resolves, even after the ticket unmounted, and a mounted ticket marks the ids its own ack panel shows.
2. A shell fill-ack host (phone: under the status bar, one at a time; desktop: top-right under the strip) reads `me.intents` / `me.fills` and shows the same AckPanel copy ("Bought 5 HALC at 42.05") once, only for this page's recorded intents that no mounted ticket showed, `role="status"`, 4000 ms, `Esc` dismisses, never over an open ticket.
3. No change to `placeOrder`, idempotency keys, the server or engine. Fail-first unit (unmount mid-Place → one ack; stay mounted → one ack, no toast) plus the phone e2e below go red on base, green on head.

## Acceptance

- Unit (`tests/unit/17b/buy-ack-after-leave.test.tsx`), phone shell (`PhoneHome`, vw 390), guest MockFeed with `replyMs`:
  - A. Place Buy 5 HALC, open Portfolio before the reply, the fill lands on `me`, the reply arrives: the text "Bought 5 HALC at …" is in the shell exactly once. Red on base (0 times).
  - B. Same, but the player stays on the Broker: "Bought 5 HALC at …" exactly once (the ticket's own ack, no second copy from a toast). Green on base; it guards against a duplicate from the fix.
- Phone e2e (`tests/e2e/17b/buy-ack-after-leave.spec.ts`), signed-in on fresh `.data`, 390x844, `POST /api/broker/orders` reply held by a route delay (Gatekeeper's `slowOrders` pattern):
  - hold 7 HALC; slow Buy 5; go to Positions mid-Place; the buy's ack "Bought 5 HALC at …" becomes visible once (red on base);
  - Close → Sell 12 prefill → Place: exactly one "Sold 12 HALC at …";
  - `/api/broker/me` HALC fills since the hold are exactly `[BUY 5, SELL 12]`, each once; no open orders; after reload Positions has no HALC row (green on base: the ledger part already holds).
- No Gatekeeper-flagged regression: card 34/40 Close-busy tests and BR-4/BR-6 ack tests still pass on the fix head.
- Full local preflight on the fix head (lint, typecheck, build, check-hooks, unit, ledger-no-dup, e2e, route budget /broker ≤ 215 KB gz), plus `npm run test:formal-money` and `npx tsx tools/verify/port-avalon.ts run`.

## Out of scope

- A bell, Money WYWA cards, push, haptics, fill merging for 3+ fills (later toast work).
- Card 40's busy flag (PR #140, not on this base); the fix head will merge it forward if it lands first.
- Any change to what the order does.
