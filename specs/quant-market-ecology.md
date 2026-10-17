# Market ecology

An agent layer on top of the current engine, so prices come from who is trading and why, while the game stays learnable and every trade can be explained afterward. This replaces nothing until the migration steps below are green. Phase 0 keeps shipping the current model.

The current engine already has the half a player can learn: a value (`lnV`) that price is pulled toward, regimes, GARCH vol, news with 70% of a jump printing at once and the rest drifting in, square-root impact, and volume that rises with the move. What it does not have is anyone on the other side. The ecology adds that, as pools of traders rather than thousands of individual agents.

## Populations

Six pools per asset, plus the macro that already exists. Each pool is one number per asset (its position), not a list of agents. That is what keeps it fast. All of them draw from their own streams (`eco:<pool>:<assetId>`), never from `asset:<id>`, so turning the layer off reproduces today's prices.

| Pool | What it wants | What the player learns |
|---|---|---|
| Value | buy what trades below its value, sell what trades above, size capped | "cheap" is a gap, and it closes slowly |
| Trend | follow the last 63 game days, fade the last 1–5 | chasing a winner works until it doesn't |
| Retail | small random flow, biased by the last headline's sign | the crowd arrives late |
| Pension | pull holdings back to index weights in the last 3 days of every 63-day quarter | the calendar is a trade |
| Market maker | lean against its own inventory, and step back when inventory or vol is high | spreads and slippage widen when the book is scared |
| Macro | no orders. The existing regime, central-bank drift and news. It moves value, and the pools react | the tape has a reason |

The three named rival funds in `quant-npc-funds.md` are members of the value pool, the trend pool and a crypto trend pool. They are not a second price impact. Names, cash and the equity leaderboard stay. Style and positions are not on the board.

## How a tick clears

Keep the batch auction from 01 §7.1, in the cheap form:

1. Each pool names a desired order as a fraction of ADV, from public information only (the value gap, past returns, the calendar, headlines already printed). Nobody sees the next shock.
2. Desired size is cut by capacity: a pool already loaded on that side gets `1 / (1 + 3·|position|)`.
3. Net flow clears against the market maker. Impact is the square-root law we already use, divided by a depth that shrinks when the maker's inventory is large or `h` is high. That is a liquidity drought: the same order moves the price more.
4. The value process (drift, factors, jumps, GARCH, regimes) is unchanged. The clearing impact is added on top of it, the way a player's order already is.

No full order book in the first cut. A visible ladder can be drawn from the maker's spread and depth later, for the screen, without changing the math.

## Inefficiencies, and how they die

These fall out of the pools. They are not scripts.

- **Post-earnings drift** is already in the engine (`jumpImmediate` 0.7, the rest over the half-life). The value pool trades it, the trend pool crowds it. The Wire shows that drift as a band (Early, Mid, Late, Done), never the exact share, until Tape shows the number is not a free edge.
- **Overreaction.** A big move brings the trend pool in and pushes the price past value. The value pool then fades it. Which one wins depends on which pool has capacity left.
- **Quarter-end.** The pension pool trades the last 3 days of each 63-day block, toward index weights. Same dates every time, so a player can learn the calendar.
- **Seasonality.** The U-shaped session volume we already have stays. The ecology does not add a second one.
- **Crowding and unwinds.** When a pool is near its cap, it stops adding and, on a reversal, unwinds the same way. The player's own flow counts toward the crowd on that side.
- **Adaptive decay.** An edge the player leans on gets worse for two reasons: their own impact rises as they take more of ADV (already true), and the pool they are copying runs out of capacity, so the next push is smaller and the unwind is sharper. A fresh player on a quiet asset still sees the edge. A player who has been the crowd for 21 days does not.

## Explainable afterward

Each game day, store one cause vector per asset, in log return, summing to the day's move:

`value gap · trend · retail · pension · maker inventory · news residual · your own flow`

The trade journal (Forge) picks the largest term between the entry day and the exit day and says it in words: "you bought the earnings drift, and the trend pool was already full, so the unwind ate it." The vector is numbers from the tick, not a sentence generated later, so the explanation cannot contradict the tape. Templates map the dominant term to a sentence. An LLM may rewrite the sentence (below); it may not pick the term.

## Performance

Populations are pools, so a tick is O(assets), same shape as today. Today's full step is about 34 µs per tick for 17 assets on the box (seed alpha, 5 years, 720 ticks a day).

Budget for the ecology, measured the same way:

- Under 80 µs per tick with the layer on, so a fast-forwarded game day stays well under a tenth of a second.
- A live tick, the one the screen animates, stays under 1 ms including the cause vector.
- Shadow mode (agents computed, prices unchanged) stays under 50 µs.

If a build misses the budget, cut history windows before cutting determinism.

## Calibration targets

Targets, not claims. The current engine already meets the first three in Tape's runs. The rest are what the ecology has to hit before it replaces anything.

| Fact | Target | Horizon |
|---|---|---|
| Fat tails | excess kurtosis of daily returns above 3 | daily |
| Vol clustering | corr of absolute returns with the previous day above 0.15 | daily |
| Volume and vol | corr of absolute daily return and traded value (`dayNotional`) above 0.3 and at most 0.6; units (`quote().volume`) are not the gate | daily, already a volume band |
| No linear autocorr | daily return autocorr between −0.05 and 0.05 | daily |
| Short reversal | rank IC of 1-day return vs the next day between −0.05 and 0 | 1 day |
| Medium momentum | rank IC of 63-day return vs the next 21 days between 0 and 0.04 | the band the momentum fix landed in (+0.026 measured) |

The box prototype (`specs/prototypes/market-ecology.ts`, 12 assets, 40 seeds, 5 years) now hits the table above except the volume row, which needs the real volume stream. Shocks are iid and never touch the price. The fast pool prints 73% the same day. The slow pool holds the other 27% and trades 15% of what it still holds each day, and that leak is the momentum. A thinner book after a large day, capped, is the clustering. A market maker unwinds 12% of yesterday's noise, which is the one-day reversal. Measured: excess kurtosis 3.46, absolute-return autocorr 0.161, daily autocorr +0.007, 1-day rank IC −0.020, 63-day to 21-day rank IC +0.016. These are toy numbers, not a claim the six-pool engine will land here. The bands below are still the real test.

## Learnable, but not solved

Tape's bands, proposed. They sit next to the existing "no simple strategy beats buy-and-hold in more than 70% of seeds".

- A single public signal (buy the earnings drift, or buy the widest value gap), after fees, beats buy-and-hold in 55–70% of seeds, and its median edge over buy-and-hold is under +3% a year.
- The same signal, used by a player who has already taken more than 10% of that asset's ADV in the same direction over the previous 21 days, beats buy-and-hold in under 55% of seeds. That is the adaptive-decay gate.
- Stacking a second public signal does not get past the 70% cap.
- With the ecology off, today's bands still pass and the price fingerprint matches.

## Where an LLM fits

Only as a writer, never as a pricer. Offline or cached, never inside `step`.

- Input is the structured payload we already have: kind, asset, sign, size, regime, and the cause vector. Output is a headline body, a one-line CEO quote, or a rumor sentence.
- Cache key is a hash of that payload, so the same event always gets the same text and a replay does not call anything.
- If the cache misses or the model is unavailable, the template headlines from task #3 are the text. The game must be fully playable with no model at all.
- Agents, ghosts and the balance harness read the payload, never the prose. A prettier sentence cannot change a fill.

## Migration

1. **Shadow.** Ship the pools computing desired orders and the cause vector, writing them to a side log. Prices unchanged. Tape checks the fingerprint.
2. **Hybrid.** Add the clearing impact at 25% weight. Re-run every current band plus the table above. Raise the weight only while the bands hold. *Built on the box copy (2026-10-09). It is a save field, `ecology: { mode: 'hybrid', weight: 0.25 }`, and only 0.25 and 1 are allowed; anything else is off. Each game-day close prints `0.75 · live close + 0.25 · ecology close`, replacing the day's move rather than adding to it, and the pools re-anchor on the printed close. h and the regime still come from the live intraday move. New worlds stay off unless created with `createWorld(seed, cfg, { ecologyWeight: 0.25 })`, and saves without the field keep the old path. Measured on 40 seeds × 720 ticks/day: kurtosis 8.70, absolute-return autocorrelation 0.133 (below 0.15, a miss; the live engine is 0.139), daily autocorrelation 0.001, IC1 −0.009, IC63 0.021. Tape's bands pass at 60 seeds on a /tmp copy of the runner patched to the hybrid path; at 20 seeds GOLD's vol ratio is 0.841, below its 0.85 band (see ENGINE.md).*
3. **On.** Clearing impact at full weight. The exogenous shock still moves value; it no longer jumps the price on its own except through news, which the pools then trade. Old saves keep the old config and the old path, the same rule as the momentum fix. *Built on the box copy (2026-10-09); the default for new worlds since the flip on 2026-10-09. Save field `ecology: { mode: 'full', weight: 1 }` (weight absent or 1; anything else is off), the same path as hybrid weight 1. New worlds follow one constant, `NEW_WORLD_ECOLOGY`, now `'full'` (Tape's 100% bands and crowd gate passed, Ledger confirmed, 60-seed speed gate passed); old saves keep their path; the 25% hybrid stays a fallback that can never be the default. Vol at 100% (settled 2026-10-09): **new worlds in full mode have a jumpier value line.** The non-jump diffusive part of the world's own value `lnV` (the public fundamental) is scaled by 1.15 (`lnVVolScale`); drift and jumps are not. The sd of the daily value move rises 10.4%. Quotes also reprice 10% of the day's non-jump value move at once (`valuePrint` 0.1). Full mode only: shadow, the 25% fallback, off and old saves are unchanged. Without it the ecology ran at ~0.87× live vol and failed Tape's 0.85 band on 9–10 assets; with it, 60 × 720 vol is 0.873 min / 0.932 median (live 0.978), all five gates and Tape's bands (20 and 60 seeds, /tmp copy) pass, and learnability holds (refined 0.511 in contraction, value_gap 0.567). Ledger's fallback floor of 0.46 for refined momentum is not needed. Forge: the fundamental a player sees moves a little more day to day in these worlds.*

   *Why one GOLD seed can be that quiet (checked 2026-10-09, /tmp/eco/gold/):* across Tape's 60 full seeds GOLD's vol ratio has a median of 0.899, with 19/60 below 0.85 and a minimum of 0.609 (tape-16). It is path luck in the world GOLD lives in, not a dead book. The same seeds on the live path (ecology off) are just as quiet: tape-16 0.636, tape-12 0.675, tape-03 0.755, tape-07 0.743 and tape-01 0.784. Live has 14/60 below 0.85, its minimum is 0.636, and the per-seed correlation between full and live is 0.98. The quiet seeds have a quiet value line (value vol ratio 0.70–0.87, against 1.14–1.15 on the median seeds tape-50 and tape-17) and a low mean GARCH h (0.62–1.13, against 0.94–1.36). Regime mix does not separate them: tape-03, tape-07 and tape-12 spend 91–97% of their time in expansion, and median tape-50 spends 100%. Jump days (13–18 against 20–29) are slightly fewer. The book is alive on every quiet seed. Gross pool volume is 0.85–0.93 ADV/day (median seeds 0.89), and no day has zero volume. The value pool's order averages 0.60–0.68 ADV (median seeds 0.64). The traded notional matches live, there are no halts, the value line is never flat for more than one day, and price tracks value (daily correlation 0.83–0.87, the same 0.85 as the median seeds). Full only adds its usual ~3.5% (median full/live 0.965) on top of the live path's own seed-to-seed spread, which is wide for a 15%-vol asset.
4. **Book, later.** A displayed ladder sampled from the maker's spread and depth. Cosmetic until someone trades against a rung, which is a Phase 1 question, not this one.

## Conflicts to settle

- Rival funds ride these pools. `quant-npc-funds.md` no longer gives them an impact of their own. Settled.
- World events (`quant-world-events.md`) stay shocks to value, not a second flow. The pools react to them, which is what makes a crash feel crowded.
- `shockPrice` stays test-only. It bypasses the pools on purpose, and the journal should label a shocked day as a test shock so it doesn't invent a story.
