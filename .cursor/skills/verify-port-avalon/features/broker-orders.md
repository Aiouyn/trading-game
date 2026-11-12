# Broker orders

Broker orders lets a signed-in player buy HALC at the server's price and leave a limit resting below the market, then see both after a reload.

## Sub-features

- `market-buy` buys 1 HALC and shows the fill.
- `limit-order` rests a buy limit at 1.00.
- `persist` shows the same holding and the same order after reload.

## How to get to it (user POV)

- Sign in, then open Broker from the desktop shelf or the phone dock.
- Choose HALC, leave Buy and Market selected, enter quantity 1, choose Review order, then Place order.
- Choose New order, choose Limit, enter limit 1.00 and quantity 1, review, and place.
- Reload the page and open Broker on HALC again.

## Driving it with Playwright

Preconditions:

- `doctor` is healthy and the account is the one just created in this play.
- HALC is offered in `br-asset-select` or already shown as `br-ticker`.

- **Open Broker.** Click `tile-broker` or `icon-broker`. Wait until `data-state` is `live`. If `br-asset-select` is present, choose `HALC`.
- **Open the ticket (phone).** On the phone the ticket is a bottom sheet (card 6): click `br-trade` while its `aria-expanded` is `false` and wait for `br-sheet`. After an ack the sheet stays open, so `br-new` is inside it. Desktop has no `br-trade`.
- **Market buy.** Click `br-side-buy`, `br-type-market`, fill `br-qty` with `1`, click `br-review`, then `br-place`. `br-ack-title` starts with `Bought 1 HALC at` and `br-you-hold` reads `You hold 1`.
- **Rest a limit.** Click `br-new`, then `br-type-limit`, fill `br-price-limit` with `1.00` and `br-qty` with `1`, review, and place. `br-ack-title` is `Order placed. It's in Open orders.` A `br-oo-row-<id>` row is visible. `GET /api/broker/me` in this context has `positions.HALC.qty` `1` and that order `WORKING` with `limit` `1.00`.
- **Reload.** Reload the page, wait for `quay-ready`, open Broker, choose HALC again. `br-you-hold` is still `You hold 1` and `br-oo-row-<id>` for the same id is visible. Cash cents, quantity, and the working limit match the ledger from before the reload.
- **Proof.** `npx tsx tools/verify/port-avalon.ts drive` records `<viewport>.market-buy`, `<viewport>.limit-order`, and `<viewport>.persist`, with `<viewport>-market-buy.png`, `<viewport>-limit-order.png`, and `<viewport>-persist.png`.

## Gotchas

- Signed out, the ticket fills inside the demo feed and a reload clears it. The journey signs in first. A pass that only saw the ack is not persistence.
- A buy limit at or through the live price fills instead of resting. `1.00` is far under HALC, so the server leaves it `WORKING`.
- Review stays disabled until the server preview is back. Wait until `br-review` and `br-place` are enabled. On the phone, scroll the button into view before clicking; Place can sit below the fold.
- On the phone, `br-side-buy`, `br-qty`, `br-review` and `br-place` exist only while the Trade sheet is open; a click on them without `br-trade` first times out.
- The phone dock is Broker, Portfolio, and Wire. City and Settings are not on that dock.
- Do not post the order JSON yourself. The ticket is the player path.
