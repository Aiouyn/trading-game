# Luck vs skill, and priced-in

Two read-only views. Neither places an order and neither moves a price.

## Data model and API

The Wire's readout already ships with task #3, as a band only: Early, Mid, Late or Done. `wire(state)` does not return the exact share. The exact number stays inside the engine until Tape's harness shows it is not a free edge.

Ghosts, new:

```
ghostReport(state, playerId, fromTick, toTick) => {
  player: number,            // equity multiple over the window
  buyAndHold: number,        // equal-weight stocks, bought once, same fees
  random: number,            // one random stock, rebalanced monthly, same fees
  noFees: number,            // the player's own trades with fees removed
  percentile: number         // where the player sits among the three ghosts, 0–100
}
```

- Replays the saved order list on a copy of the world from `fromTick`. Same seed, so the market matches. The copy is discarded.
- Default window: the last 21 game days. The daily close report (Forge) calls it once per game day.

## Rules and numbers

- Buy-and-hold and random use the same definitions as Tape's harness, at the player's own starting equity for the window, so the comparison is fair at any account size.
- `noFees` is the player's trades at mid, no spread and no commission. The gap `player` vs `noFees` is the cost of trading. The gap `player` vs `buyAndHold` is skill or luck, and the percentile says which.
- A player with no trades gets percentile 50 and a note that there is nothing to score. No shame copy in the engine; Velvet writes the line.

## Edge cases and exploits

- Ghosts do not fill through the live book, so they cannot move the player's price or be front-run.
- Orders the player cancelled are not replayed.
- The report is deterministic: same save, same numbers.
- It must not call `shockPrice`.

## Acceptance

- On a world with no player orders, player multiple equals buy-and-hold within fees of zero, and percentile is 50.
- A hand-built save that buys the worst stock every month scores below buy-and-hold.
- Runtime for a 21-day window stays under 50 ms on the PC.

The ghost report is the player's own screen. The engine does not publish the saved order list. A shareable replay exists only when the player exports it.
