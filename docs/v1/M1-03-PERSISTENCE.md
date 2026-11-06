# M1-03 — Server persistence (private player ledger)

## Model (on-disk schema v2)
Stored per account in the existing auth `FileAuthStore` (`store.json` `players[]`); no separate blob store.

```ts
PlayerPrivateRecord = {
  v: 2,
  accountId,                                   // ownership: record is keyed + session-gated per account
  cashCents: number,                           // non-negative safe integer
  positions:  Record<assetId, Pick<Position, "assetId" | "qty" | "avgCost">>,  // domain me.positions, durable subset
  openOrders: Record<orderId, OpenOrder>,      // exactly the domain me.orders row (channels.ts)
}
```
- `Position` / `OpenOrder` are the shared contract types (`src/shell/contracts/channels.ts`); the stored order is parsed with the contract's own `openOrder` runtime schema, then ledger invariants: decimal strings ≥ 0, qty > 0, `filled < qty` (remaining > 0), PARTIAL ⇒ filled > 0, avgPrice 0 before a fill, `limit` iff limit/stop_limit, `stop` iff stop/stop_limit, type ∈ market|limit|stop|stop_limit, tif ∈ day|gtc|ioc|fok, map key = assetId / orderId, ≤ 64 positions, ≤ 128 orders.
- Not stored (derived later): mark/value/upl/pnlPct/weightPct (quotes, M1-05/M1-08). pledgedQty/lentQty are out of V1 scope.

Before (v1): `{ accountId, cashCents, positions: { HALC: 2 }, openOrderIds: ["ord_1"] }` — no cost basis, IDs could not reconstruct an order.

## Write seam
`AuthService.updateOwnPrivateState(session, current => next)` — atomic read-modify-write under the service lock, validated, persisted (temp + rename), memory rolled back if the write fails. Server-only: no HTTP route writes cash/holdings/orders; `/api/auth/me` only reads the caller's own ledger. M1-06's order door will call this after its cash/holding checks.

## Migration (never wipes)
- v1 rows with empty positions and openOrderIds (every row the M1-01/M1-02 build wrote) migrate to v2 with cash preserved and are re-written as v2 on the next save.
- v1 rows with lots or order IDs cannot be migrated losslessly (no cost basis, no order payload). They, plus corrupt rows, unknown versions and duplicate rows for one account, go to `quarantinedPlayers` verbatim and are re-written unchanged on every save. That account reads `409 LEDGER_QUARANTINED` instead of getting a fabricated or fresh ledger.

## Proven (tests/unit/player/m1-03-persistence.test.ts)
Rich lots + partial limit / stop-limit orders survive a new `AuthService` and a separate Node process on the same file; account isolation after restart; 40+ concurrent RMW commits across two sessions and two accounts lose nothing; invalid commits leave disk untouched; boundary rejections; v1 migration and quarantine round-trip.

## Not in this card
- Single process only: the file store is serialized in-process. Not multi-instance or hosting-ready (M3).
- Live catalog / shared ticks (M1-04 / M1-05); matching and fills (M1-06).
- The Broker is still the demo MockFeed: its trades are not saved and reset on reload (disclosed in the UI) until M1-06 wires orders through `updateOwnPrivateState`.
