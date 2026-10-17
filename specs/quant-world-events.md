# Shared world events

Crashes, bubbles and crisis weeks from 01 §5.6, scaled down for Phase 0 (no rates, no regions yet). One world, so an event hits every asset together. In solo that world is the player's seed.

## Data model and API

```
WorldEvent { id, kind, startTick, endTick, headline, shocks: { assetId, logMove }[] }
WorldState.worldEvent?: WorldEvent     // at most one active, internal
WorldEventView { id, kind, headline, elapsedDays }   // the only shape the app gets
```

- `worldEventView(state)` returns the view, or nothing when no event is active. It has no `endTick`, no time remaining, no planned `logMove`, and nothing else that changes with the event's length. A banner on day 3 is identical for a 10-day crash and a 30-day crash. `endTick` and `shocks` stay inside the engine.

- Kinds in Phase 0: `crash`, `bubble`, `crisis` (a contraction week with a headline), `flash`.
- `worldEventOdds` on config. Checked once per game day on stream `macro:events` (separate from `macro:global`, so existing regime draws do not move).
- **Majors** (the bible's crisis, 01 §5.6): crash 0.03% per game day, bubble 0.02%, so 0.05% combined. A season is about 3.7 game years (about 930 game days), which puts the chance of at least one major per season near 37%, against the bible's 35%. Over a 5-year run the expected count is about 0.6, so many runs have none and a run rarely has two. The earlier 0.4% and 0.3% were about 15× too high, and the line "about one major per run" did not match them.
- **Storms**, not majors: crisis week 0.8% and flash 0.5% per game day (1.3% combined, a bit under one per 63-day quarter). These are the short, learnable shocks. They do not count toward the 35%.
- A kind already blocked by the current regime is skipped: no bubble during a contraction, no crash during the first 21 days.

## Rules and numbers

| Kind | Length | Move |
|---|---|---|
| crash | 10–30 game days | stocks −25% to −40% total, tech and discretionary ×1.4, staples ×0.4, gold +10%, crypto −30% |
| bubble | 15–40 game days | stocks +20% to +35%, crypto +50%, then a −15% give-back over the last third |
| crisis | 5 game days | forces the regime toward contraction if not already there, jumps ×1.5 that week only |
| flash | 1 game day | −8% in the first sixth of the day, about 70% of it back by the close, circuit breakers fire as usual |

Moves are applied as extra drift spread over the window, not one jump, so the path looks like a slide. Each asset's share is in the event so the Wire can say "this is the crash, not your stock".

## Edge cases and exploits

- One event at a time. A new roll during an event is dropped.
- The flash respects the ±15% halt. It must not push a price through the floor.
- Events are seeded, so two players on the same scenario seed see the same crash on the same day. That is the point of the weekly challenge.
- A player cannot trigger an event. `shockPrice` stays test-only and must not be reusable as an event.
- Because events add return, Tape's vol-ratio band (0.85–1.4) and GX CAGR band (0–12%) have to be re-measured with events on. If CAGR median breaks 12%, lower the crash/bubble odds, not the band.

## Acceptance

- Over 200 seeds × 5 years: crashes plus bubbles land between about 80 and 180 (the 0.05%/day rate gives about 126), storms well above that, never two events at once, no NaN, no price under the floor.
- A recorded event replays byte-identical from the seed.
- With odds set to 0, prices match today's fingerprint.
