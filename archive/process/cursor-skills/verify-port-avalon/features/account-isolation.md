# Account isolation

Account isolation means a second signed-in player, in their own session, does not see the first player's holding or working order.

## Sub-features

- `isolation` shows the second account's empty Broker while the first account still owns the order.

## How to get to it (user POV)

- Sign up two accounts (see [Sign up](./signup.md)).
- On the first account, place a market buy and a resting limit in Broker (see [Broker orders](./broker-orders.md)).
- On the second account, open Broker on the same asset.

## Driving it with Playwright

Preconditions:

- Both accounts are signed in on the same server, in separate browser contexts.
- The first account's Broker is showing `You hold 1` and one open order.

- **Open the second Broker.** On desktop click `tile-broker`. On phone, return home and click `icon-broker`. Choose HALC if `br-asset-select` is showing. The Broker's `data-state` is `live`.
- **Read the second book.** `br-you-hold` is absent. `br-oo-empty` is visible. `account-chip` is the second handle.
- **Read the saved books.** In each context, `GET /api/broker/me` is the session the page already has. The second ledger is cash `1000000` cents with no positions and no orders. The first ledger still contains the working order id. The first account's chip is still the first handle.
- **Proof.** `npx tsx tools/verify/port-avalon.ts drive` records `<viewport>.isolation` and `<viewport>-isolation.png` from the second account's Broker.

## Gotchas

- A second tab in the first account's window is the same player. It will show the holding. That is not isolation.
- Comparing two starters' cash before either has traded does not prove isolation. The check runs after the first account has a holding and a working order.
- The second account's chip is `account-chip` in the status bar, including on the phone Broker screen. `account-handle` is only on the Account panel.
