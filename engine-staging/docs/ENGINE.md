# Engine: seeded price simulator and order execution (Phase 0, tasks #1 and #2)

Owner: Quant. Design source: `vision/01-markets-economy.md` §1, §2, §5.3, §10.
Code: `src/engine/` (pure TypeScript, no UI, no Node or browser APIs). Moves to `packages/engine` at the server phase.

## What it does

Given a seed and a config, the engine produces price paths for every asset, one 5-second tick at a time. The same seed and config always give the same world, bit for bit, so saves, replays, bug reports and Tape's balance runs are all reproducible.

Not in this task yet: orders and the batch auction (§7), news templates (§6), earnings, businesses, the macro rate model, and the stabilizer. They plug into `step()` later without changing how prices are generated.

## Public API (`src/engine/index.ts`)

```ts
createWorld(seed: string, config?: WorldConfig): WorldState   // config defaults to defaultConfig()
step(state): { state, events }                                 // one tick, pure, never mutates its input
stepMany(state, n): { state, events }                          // exactly n × step()
quote(state, assetId): { assetId, price, fundamental, halted }
prices(state): Record<assetId, price>
indexLevel(state, 'GX'): number                                // cap-weighted, base 1000
gameDay(state): number
expectedVol(def, regime?): number                              // expected total annual vol, diffusion + jumps
```

`WorldState` is plain JSON (numbers, strings, arrays), RNG state included. `JSON.parse(JSON.stringify(state))` is a valid save file and continues exactly. Events are `regime`, `jump`, `halt` and `reopen`, each tagged with the tick.

Task #2 will extend the signature to `step(state, orders, actions)` per 01 §10; existing callers stay valid.

## Time

| Unit | Value |
|---|---|
| Tick | 5 real seconds (`dt = 1 / (ticksPerDay · daysPerYear)` game years) |
| Game day | 720 ticks = 1 real hour |
| Game year | 252 game days ≈ 10.5 days of continuous play (01 §1's ~15 real days includes the 2 h weekends) |

Phase 0 runs every asset on every tick. Trading sessions, weekends and closing auctions arrive with the order book.

## Price model (per asset, per tick)

Each asset carries a log fundamental value `lnV` and a log market price `lnP`.

```
σ      = vol · regime.volMult · √h
shock  = wMarket·regime.marketLoadMult·Z_market + wSector·Z_sector + wCrypto·Z_crypto + wIdio·regime.idioMult·ε
ε      ~ Student-t(ν = 4), rescaled to unit variance
J      ~ Poisson(jumpsPerYear · regime.jumpMult · dt) jumps, size Kou double exponential:
         up with prob jumpUpProb + regime.jumpUpShift, |J| ~ Exp(mean jumpUpMean) or Exp(mean jumpDownMean)
μ      = drift + cycleBeta · regime.equityDrift − c                 c = jumpCompensator(def, ψ) when jumpCompensation
c      = λ · (p/(1 − ψ·ηup) + (1 − p)/(1 + ψ·ηdown) − 1)             base λ and p, regime-neutral

lnV += (μ − ½(φσ)²)·dt + φ·σ·√dt·shock + ψ·J        φ = permanentShare = 0.9, ψ = jumpPermanent = 1
lnP += (μ − ½σ²)·dt + κ·(lnV − lnP)·dt + σ·√dt·shock + ι·J          ι = jumpImmediate = 0.7, κ = ln2 / halfLife
lnP  = max(lnP, ln floor)
```

In plain words:
- **Ordinary moves overshoot a little.** 90% of every diffusive move is news about value and stays; 10% is noise that fades back toward value with the asset's half-life (large caps 20 game days, small caps 60, crypto 120). That gives a mild short-term reversal and keeps long-horizon volatility near target.
- **News underreacts.** A jump moves value in full, but only 70% prints at once; the other 30% drifts in through the pull over the following weeks (post-news drift). So a stock that just had good news tends to keep drifting up a little, and a 63-day winner is not a built-in loser.
- **Jumps are compensated.** The drift subtracts the jumps' expected arithmetic return, so `drift` stays the asset's expected return and a stock with down-skewed news (Lumen Pharma) is risky, not a slow bleed by design. Regime shifts in jump rate and skew are not compensated, so a contraction's bad news still hurts.

A world saved before this change carries its own config without `jumpPermanent`, `jumpImmediate` and `jumpCompensation`; missing fields mean the old model (ψ = φ, ι = 1, no compensator), so old saves keep their market exactly.

### Momentum fix (2026-10-08)

Before, every shock and jump printed in full while only 80% moved value, so the 63-day winners were the stocks carrying the most overshoot and gave it back over the next month. Measured with 8 seeds × 5 years, the cross-sectional rank IC of 63-day past return vs the next 21 days went from −0.051 to +0.026, which is mild positive momentum, like real markets. Tape's fee-aware harness at 60 seeds:

| | before | after |
|---|---|---|
| buy-and-hold beats momentum | 0.933 (FAIL) | 0.767 |
| buy-and-hold beats contrarian | 0.517 | 0.783 |
| buy-and-hold beats random | 0.567 | 0.617 |
| highest share any strategy beats buy-and-hold | 0.483 | 0.383 |
| median multiple: buy-and-hold / momentum / contrarian / random | 1.13 / 0.43 / 1.37 / 1.06 | 1.18 / 0.69 / 0.60 / 0.90 |
| GX CAGR median | 6.6% | 7.4% |
| vol ratio range (realized / expectedVol) | 0.97–1.09 | 0.93–1.08 |

Single-stock momentum still loses to the basket in most seeds. The cause is concentration, not reversal: it keeps landing on the most volatile names (Lumen Pharma, Corvo Motors, Nimbus Compute), whose median path suffers from volatility drag.

**Correlation** comes from shared factor shocks, not a covariance matrix. Two stocks in the same sector correlate at about `wM² + wS²` (≈ 0.50 with the defaults), stocks in different sectors at `wM²` (≈ 0.30), and a stock against crypto at `wM_stock · wM_crypto` (≈ 0.14). `wIdio` is derived so total variance is 1. In a contraction, market loadings rise ×1.3 and idiosyncratic noise drops ×0.6, so diversification fails when it's needed most.

**GARCH(1,1)** runs once per game day on the variance multiplier `h` (long-run mean 1): `h = (1 − α − β) + α·z² + β·h` with α = 0.08, β = 0.90 and h clamped to [0.25, 9]. `z` is yesterday's return with jumps removed, divided by yesterday's regime-scaled base vol. Removing jumps and the regime factor keeps h centered on 1; without that, crises push `α·volMult² + β` above 1 and volatility runs away.

**Regimes** (01 §5.3): a 4-state Markov chain on the global stream, evaluated once per game day.

| Regime | Equity drift | Vol × | Jumps × | Up-jump shift | Mean length | Next |
|---|---|---|---|---|---|---|
| Expansion | +10%/yr | 0.9 | 1.0 | 0 | 567 days | Overheating 80%, Contraction 20% |
| Overheating | +4%/yr | 1.15 | 1.3 | −0.05 | 189 days | Contraction 85%, Expansion 15% |
| Contraction | −27%/yr | 1.4 | 2.0 | −0.15 | 189 days | Recovery 100% |
| Recovery | +25%/yr | 1.2 | 1.2 | +0.05 | 189 days | Expansion 90%, Contraction 10% |

Transitions are purely random for now. The hazard hooks from 01 §5.3 (P/E stretch, inverted curve, credit growth) come with the macro model.

**Circuit breaker** (01 §2.2): a stock that moves ±15% from its day open halts for 120 ticks (10 real minutes), at most once per day. Moves keep accumulating during the halt and print all at once on reopening. Index-wide halts (−7/−13/−20%) come with the order book.

## Determinism

- The RNG is **xoshiro128\*\*** (32-bit state words, fast in JS). 01 §2.1 says xoshiro256\*\*; that needs 64-bit BigInt math, which is about 10× slower in JS for no gameplay benefit, so the 128 variant is used. It belongs to the same family and has a period of 2^128 − 1.
- Every stream is seeded from `cyrb128("<worldSeed>::<key>")`. Keys are `macro:global`, `sector:<sector>` and `asset:<id>`. Adding or removing an asset never changes another asset's path (there's a test for it). Adding a new sector adds its own stream and leaves the others alone.
- Draw order inside a tick is fixed: market, then crypto, then sectors in sorted order, then each asset in config order.
- No `Math.random`, no `Date`, no iteration over unsorted object keys.

## Default universe (`defaultConfig()`)

There are 12 stocks, one per sector, taken from the example companies in 01 §3.1. There are 3 crypto assets (AUC, LTX and SYN) and 2 commodities (Gold, Crude Oil), and the GX index is cap-weighted over the stocks. Crude shares the `energy` factor with Verdane Energy. Gold loads slightly negatively on the market and has a negative cycle beta, which makes it the safe haven. The 30-stock, 8-sector MVP list is a content task. It's a pure config change.

## Headless sim

```
npx tsx scripts/sim.ts --seed alpha --days 1260 [--csv out/prices.csv] [--json out/summary.json]
npm run sim                      # defaults: seed alpha, 504 days (in PowerShell, npm drops args after --, so call npx tsx directly to pass flags)
```

It prints per-asset start and end prices, CAGR, realized vol against target, max drawdown and correlation to GX from daily closes, followed by the regime timeline and event counts. The output is identical across runs with the same seed.

The reference run uses seed `alpha` and 5 game years (since the momentum fix):

- Realized vol sits between about 10% below and 20% above `expectedVol`. Daily vol sees only the 70% of each jump that prints at once, so jump-heavy assets (crypto, Corvo) land a bit under target, while crisis regimes push others above.
- GX ends at 1,461 (7.9% CAGR) with 23.1% vol and a −40% max drawdown across two contractions. There were 489 jumps and 21 halts.
- Stock correlation to GX ranges from 0.31 to 0.78, crypto sits around 0.21–0.23, and Gold is at −0.09.

## Tests (`npx vitest run`, about 20 s, mostly the momentum IC test)

- **`rng.test.ts`** covers stream determinism, resume from saved state, uniform bounds, normal moments, and Student-t unit variance with fat tails.
- **`sim.test.ts`** covers:
  - Same seed gives the same world, and different seeds diverge.
  - `step` is pure, a JSON save mid-run continues exactly, and `stepMany` equals repeated `step`.
  - Removing an asset doesn't move the others.
  - Two game years stay finite, above the floor, and within the h bounds.
  - Realized vol lands within ±15% of target.
  - Correlations follow the order same sector > cross sector > crypto, close to theory.
  - Returns have fat tails.
  - The value gap halves in one half-life.
  - Jump rate and Kou sizes match.
  - All four regimes are visited, only along allowed edges.
  - Contraction pulls prices down.
  - GARCH spikes after a big day and decays.
  - The circuit breaker halts, freezes, reopens with the gap, and fires at most once per day.

Statistical tests use 24 ticks per day for speed. Calibration is per game year, so the results carry over to 720.

## Expected volatility (balance target)

`vol` in `AssetDef` is only the diffusive part, and jumps add on top. `expectedVol(def, regime?, jumpPrint = 1)` gives the total:

$$
\sigma_{tot}^2 = (vol \cdot volMult)^2 + \lambda \cdot jumpMult \cdot \left(p \cdot 2\eta_{up}^2 + (1-p) \cdot 2\eta_{down}^2\right)
$$

Balance bands compare realized vol against `expectedVol(def)` (neutral regime), never against raw `vol`. Pass `jumpPrint = cfg.jumpImmediate` to scale the jump term by ι² and predict daily realized vol exactly (the sim test does this); without it the target is the long-horizon total, which daily vol undershoots slightly for jump-heavy assets. For example, Lumen Pharma has `vol` 38% but expected total vol of about 65%, because of its binary trial jumps.

## Volume

Every asset prints a deterministic volume each tick. It runs on its own seeded stream (`volume:<id>`), so it never changes prices: the same seed gives the same prices as before volume existed.

Expected traded value per tick:

$$ \text{notional} = \frac{ADV}{\text{ticksPerDay}} \cdot volMult \cdot \sqrt{h} \cdot (0.6 + 0.5\,\min(|z|, 40)) \cdot u(t) \cdot (1 + heat) \cdot noise $$

- `ADV` is the asset's `advNotional`, the same number square-root impact uses. Calibrated so the long-run mean day trades about 1.0 × ADV (0.9 to 1.1 across the default universe over 5 years).
- `volMult · √h`: crises and vol clusters trade more, calm expansion less (seed alpha, 5 yrs: expansion 0.88 × ADV, overheating 1.25, contraction 1.23, recovery 1.19).
- `z` is this tick's return over expected tick vol, so big moves trade more. **Volume gate:** the correlation of |daily return| with traded value (`dayNotional`) must be above 0.3 and at most 0.6. It runs 0.40 to 0.42 (mean over the 17 assets, 720 ticks/day, 5 years, seeds alpha, beta, gamma and delta) and is checked in `ecology.test.ts`. Units (`quote().volume`) are not the gate: they move as 1/price, because `advNotional` is fixed in dollars, and run 0.28 to 0.29.
- `u(t) = 1 + 0.5·cos(2π·t/ticksPerDay)`: a U shape, busy at the open and close, quiet midday, for stocks and commodities. Crypto trades flat.
- `heat` is attention after news: a jump adds `50·|jump|` (a 6% jump adds 3), a halt adds 1, a reopen adds 2; it halves every 1/6 of a game day. Jump and reopen days trade about 1.3 to 2.4 × the median day. Earnings and news events will plug into the same heat when they exist.
- `noise` is lognormal with σ 0.4 and mean 1.
- Halted ticks print 0. The tick that trips the halt and the reopening auction both trade, and the reopen bursts.
- Stocks print whole shares. Player fills are added to the tick's volume.

Per asset in `AssetState` and `quote(state, id)`: `volume` (units this tick), `notional` ($ this tick), `dayVolume` and `dayNotional` (since the day opened), `cumVolume` (monotonic since the world began), and in `quote` also `adv` (ADV in units at the current price). `volumes(state)` returns this tick's units for every asset, like `prices(state)`. For chart bars, a bucket's volume is the sum of its ticks' `volume`, or `cumVolume` at the bucket's last tick minus at the previous bucket's last tick, which stays right even if the app skips recording ticks. Saves from before volume load fine: missing fields start at 0 and the stream is seeded on the first step.

Tuning: `config.volume` (`DEFAULT_VOLUME`). The headless sim prints a volume table (mean, median and max day vs ADV, ρ(|r|,V), news-day multiple) and the mean by regime.

Tests: `src/engine/volume.test.ts` (10 tests): prices unchanged and legacy saves, determinism and JSON reload, mean ≈ ADV, link to moves, calm vs crisis, jump spikes and decay, halts and reopen burst, U shape vs flat crypto, counters and whole shares, player fills on the tape.

## Orders and portfolio (task #2, `src/engine/trading.ts`)

```ts
openAccount(state, playerId, cash = 5000): WorldState            // throws if the account exists
placeOrder(state, req): { state; order }                          // status 'open' or 'rejected' + rejectReason
cancelOrder(state, playerId, orderId): WorldState                 // no-op if already closed
estimateFill(state, { assetId, side, qty }): { price; fee; slippageBps; total }   // live ticket preview
step(state): { state; events; fills }                             // open orders clear at the end of each tick
openOrders(state, playerId) / orderHistory(state, playerId): Order[]
portfolio(state, playerId): PortfolioView                         // cash, equity, positions, P&L, drawdown
```

Accounts and orders live in `WorldState` (`accounts`, `orders`, `orderSeq`), so saves stay plain JSON and a replay of the same seed plus the same orders is identical. Order ids are `<playerId>-<seq>`. A world with no accounts prices exactly as before.

**Execution.** An order placed at tick t is tried at tick t+1, after prices move. Execution price for a quantity Q:

$$ P_{exec} = P_{mid}\,\big(1 \pm (s/2 + Y\,\sigma_{daily}\sqrt{Q P / ADV})\big) $$

- `s/2` is half of the asset's `spreadBps`, scaled by current vol (`regime.volMult · √h`), so spreads widen in crises.
- `Y = 0.8`; `σ_daily = vol · volMult · √h / √252`; `ADV` is the asset's `advNotional` in dollars.
- Half of the impact (`permanentImpactShare`) moves the price for everyone; the pull to value decays it. It is charged on the **asset's cumulative notional today on that side, across ALL accounts** (one shared tally, `AssetState.dayTraded`, stamped with the game day so it resets when the day rolls; missing or from an earlier day = nothing traded yet; a world nobody trades in never carries it). Players, any ghost, rival or fund account (none exist in the engine yet; Tape's crowd accounts go through `placeOrder`, so they share it), and in `enterSimMode` the ecology pools at the close all count. The old per-account `Account.dayTraded` is ignored. A fill moves `lnP` by `sign · log1p(f(after) − f(before))` with `f(n) = permanentImpactShare · impact(n)`, so 720 one-tick clips, or N accounts each trading Q/N, move the price like one order of the same total (shared tally, 2026-10-09, $1M at tick 1: N = 2, 10 and 100 accounts give lift ratios 1.0001, 1.0001 and 0.9999 on SYN, and 1.0001, 1.0000 and 0.9999 on AURH; `impact-tally.test.ts`. Clip fix, 2026-10-09: 720 clips vs 1 clip, $1M, lift ratio SYN 0.979 and AURH 0.9995; before the fix 26.6 and 27.0). `permanentMove(state, i, side, before, notional)` is exported.
- **Temporary impact is shared per tick** (2026-10-09). `AssetState.tickTraded` holds `{tick, lnMid, buy, sell}`: the notional that ALL accounts already filled THIS tick on that asset and side, valued at `lnMid`, the tick's pre-trade mid. A missing tally, or one stamped with another tick, means zero. Every fill in a tick prices off that mid. A fill of `x = q · mid` notional, with `D` already filled this tick, pays

  `price = mid · (1 ± (halfSpread + (C(D + x) − C(D)) / x))`, where `C(n) = n · impact(n) = n · Y · σ_daily · √(n / ADV)`

  (`marginalImpact`, exported). With `D = 0` this is exactly `impact(x)`, so a lone order prices as before.
  - **Half spread:** charged per fill as before. It is a fraction of notional, so splitting pays the same total half spread, never more and never less.
  - **Same-tick splits cost the same as one order:** N = 2, 10 and 100 accounts, or 720 clips, in one tick all give a total-cost ratio of 1.0000 to one order, on SYN and AURH. Before, they were 0.81, 0.71 and 0.68 on SYN for $1M.
  - **Splitting across ticks still saves:** the same $1M over 720 ticks costs 28.1 bp over each tick's mid on SYN, against 55.8 bp as one order (ratio 0.50; AURH 0.46).
  - **The cap is shared:** `3 × ADV` notional per tick applies to the sum over all accounts per asset and side. Whatever doesn't fit stays open and fills next tick, exactly like one big order: one 4-ADV order and two 2-ADV accounts each fill 3.0000 ADV this tick. An order that finds the tick's cap used up waits; it is not rejected.
  - **Previews are per order:** `estimateFill`, cash reservations and `liquidationEquity` price one order alone.
  - **Sim mode:** pools clear once at the close through the ecology's own square-root law on the day's net flow, not through this per-tick tally.
- Phase 0 fills sequentially in order-id order inside a tick. The uniform-price batch auction between players arrives with multiplayer.

**Order types.** Market fills next tick. Limit fills once the execution price (spread and impact included) is at or better than the limit, at that price. Stop triggers when mid crosses the stop (buy: at or above, sell: at or below) and then fills like a market order, so a gap fills through the stop. `tif: 'day'` expires at the next game-day boundary; `gtc` (default) stays. Orders on a halted asset wait for the reopen.

**Rules.** Long only, no margin. Stocks trade whole shares (`qtyStep: 1`); crypto and commodities are fractional. A buy is rejected if it would exceed cash minus what other open buys reserve (limit price, or estimated price for market and stop). A sell is rejected beyond the held quantity minus other open sells. If a buy no longer fits the cash at fill time (price moved), it fills what the cash covers and the rest is cancelled with `insufficient cash`.

**Fees** (`config.trading.fees`, per asset class): stocks and commodities 0.10% with a $1 minimum, crypto 0.20% with no minimum.

**Accounting.** `avgCost` includes buy commissions. Realized P&L on a sell is `qty · price − fee − qty · avgCost`. `realizedPnl + unrealizedPnl = equity − startingCash` holds exactly (`equity` is marked at mid). Liquidation value is per account, so a whale and an alt each mark only their own exit. Their summed marks and peaks can sit above one account holding the same block, because temporary impact is concave: by +$72k on SYN `hunt-3` with $120M of cash. Realized profit after selling out is identical (`impact_alt_hunt`). `peakEquity`, `drawdown` and `maxDrawdown` use **liquidation value**, `liquidationEquity(state, playerId)`: cash plus each position at what `estimateFill` says a sell of the whole quantity brings (half spread, impact on the full size, fee). Pushing the mid up with your own buys can't lift your peak. They update every tick; `portfolio()` also returns `liquidationEquity`. `dayPnl` is measured from mid equity at the first tick of the game day. Drawdowns are fractions ≤ 0.

**Default liquidity.** Stock spreads by market cap: ≥ $100B 2 bps, ≥ $40B 6 bps, ≥ $25B 12 bps, smaller 25 bps; ADV is 0.4% of market cap a day. AUC 5 bps / $20B, LTX 8 bps / $8B, SYN 60 bps / $300M. GOLD and OIL 3 bps / $30B. All are per-asset `AssetDef` fields (`spreadBps`, `advNotional`, `qtyStep`).

The headless sim now prints a round-trip cost table (buy then sell at once, calm market, in bps of notional) for $500, $5k, $50k and $1M tickets. Typical: about 22 bps on a $5k mega-cap stock trade, 45 bps on AUC, about 100 bps on SYN; the $1 minimum fee makes $500 stock trades cost about 40 bps.

Tests: `src/engine/impact-tally.test.ts` (14 tests: per-tick temporary cost for one order vs N accounts vs 720 clips in one tick, a lone fill unchanged, across-tick saving, the shared 3×ADV cap, whale + alt in one tick, the permanent lift for one order vs N accounts vs 720 clips, the marginal curve for a second account, sim mode, pools never writing the live tally in shadow/off, and the whale+alt hunt on SYN and AURH over 3 seeds with same-day and next-day exits). `src/engine/selfimpact.test.ts` (10 tests: `self_impact_clip_ratio` for SYN and AURH, `self_mark_peak_pump`, cumulative per-side accounting and day reset, old saves, no-trade worlds unchanged, `liquidationEquity`, `shockValue`). `src/engine/trading.test.ts` (23 tests): fills and fees, round-trip accounting, square-root impact, permanent impact, 3×ADV cap, validation and reservations, limit and stop triggers, cancel, day expiry, halts, cash shrink, drawdown, day P&L, determinism with orders, JSON reload.

## News (task #3)

Jumps are no longer anonymous. Every jump prints a news item on the same tick, and the calendar adds the rest. News is derived from jumps that already happened plus the date, on no RNG of its own, so prices and volume are byte-identical to before.

- **Company news.** A jump on any other day. The headline is picked from a small template list by a hash of the asset and the move, so it never consumes an engine stream. Lumen Pharma's jumps read as drug-trial results.
- **Earnings.** Each stock has one reporting day per 63 game days, staggered by id (`isEarningsDay`). The first jump that day is the earnings surprise ("beats" or "misses"); if the day ends with no jump, the print is "in line" with no price move.
- **Macro.** One headline every 21 game days, on the first tick of that day, describing the current regime. It moves no price.

Items are kept on `state.news` (120 by default, `config.news.kept`). `wire(state, limit)` returns the newest first, each with a band instead of a number: Early, Mid, Late or Done. A jump prints 70% at once and the rest fades in with the asset's half-life; the band is Early just after the print and Done once almost all of it is in the price. The exact share stays off this view until Tape shows it is not a free edge. A world saved before news existed has no `news` field; the next step starts the feed and leaves its prices unchanged.

`step` also emits `{ type: 'news', item }` for each item, so the app can append to the Wire without diffing state.

## Test-only hooks

`shockValue(state, assetId, pct)` is its twin for value: it moves `lnV` only (not `lnP`), so the pull then walks the price toward the new value. Same throws, never called by `step()`.

`shockPrice(state, assetId, pct)` returns a new state with one asset's market price moved by `pct` (for example −0.015), value untouched, so the pull fades it like any overshoot. **Test-only:** never call it from gameplay. The app exposes it only behind `?e2e` (as `__tg.e2e.shock`) so Playwright can push a position below −1% for the stop-loss explainer. It throws for an unknown asset or `pct ≤ −1`.

## Market ecology, shadow mode (`src/engine/ecology.ts`)

Migration steps 1–3 of `specs/quant-market-ecology.md`. Off unless `config.ecology.mode` is `'shadow'` (prices unchanged), `'hybrid'` with weight 0.25 or 1 (the close is blended, see Hybrid below) or `'full'` (weight absent or 1: the ecology sets every close, see Full below). Any other value (absent, `'off'`, an unknown mode, a made-up weight) is off, byte for byte.

- **Off (default, old saves):** `step()` returns exactly what it did before. `ecology.test.ts` checks `lnP`, `lnV`, `h`, `volume`, `quote().volume` and a hash of the whole live state against `__fixtures__/fingerprint.json`, written by `scripts/ecology/fingerprint.ts` from an untouched copy of the engine (plus only `trading.ts`, with the clip fix and the shared per-asset impact tally, which change worlds with player fills and nothing else). A one-ulp change fails it.
- **Shadow:** once per game day, on the last tick, after the live tick is final, the six pools read the live close and write `state.ecology`. Live prices, volume, fills and the `asset:`, `volume:`, `macro:` and `sector:` streams are untouched (same fixture test with the flag on). The only new stream is `eco:retail:<assetId>`.
- **Inputs (public, the real engine's own):** `lnV` at the close (drift, factor shocks, GARCH, regime and jumps are all in it), `h`, the regime, the day's jumps (the news that printed), and the player's fills. Macro places no orders. It moves value and the pools react.
- **Pools (desired order, fraction of ADV):** value sizes its order to close 90% of `lnV − lnS` through today's book (inverting the square-root law), capped at 4 ADV. Trend: `0.5·tanh(63-day vol-scaled return) − 0.15·tanh(5-day)`. Retail: `0.25·N(0,1) + 0.1·`(decayed sign of past headlines, read a day late). Pension: in the last 3 days of each 63-day quarter, trades back toward its policy weight (cap weight at t = 0), only for index members. Own: the player's fills. (`valueClose` was 0.85. It was raised to 0.9 because on the closed loop value_gap was too generous: median Sharpe edge +0.215 fell to +0.113, and the beat share went from 0.650 to 0.633. 0.9 was the first value up from 0.85 that hit every target, and 1.0 broke IC1. The sweep is in `/tmp/value-close-sweep.txt`.) Capacity cut `1/(1 + 3·|position/size|)` on a pool adding to its side, with sizes in ADV of value 15, trend 1, retail 4.5 and pension 7.5. Trend was 7.5: at 120 seeds, cutting it to 1 raised the 63→21-day IC from 0.0168 to 0.0240 and kept every gate. Positions age out with a half-life (value 20 days, trend 21, retail 10, pension 63). `valueGapCap` (default 0 = off) can cap the gap the value pool sees at that many daily σ; it was tried for kurtosis and left off.
- **Clearing (shadow only):** news prints `ecology.newsPrint` (0.5) of a jump at once. This is a shadow-only share: the live `jumpImmediate` stays 0.7. The rest is a value gap that the pools trade through capacity-capped flow. At 0.7 the shadow's excess kurtosis was 16.3, because the value pool closed most of the remainder the same day; at 0.5 it is 8.31 on 120 seeds (with trend size 1 and valueClose 0.9; closed loop at 720 ticks/day, 8.24 on 40 seeds). Net flow `Q` moves the shadow price by `sign(Q)·Y·σ_daily·√|Q| / depth` (the same `impactY` and `σ_daily` as `impact()`). 60% stays and 40% sits as the maker's skew, which it works off at 50% a day. Maker inventory takes `−Q`. Depth is `1/(1 + 0.5·|inv|/2 + 0.25·max(0, h − 1))`, floored at 0.4, from yesterday's inventory, so the book is thinner after a heavy day. No order book.
- **Log:** `ecologyLog(state)` keeps the last `logDays` (21) days. Each asset has `lnS`, `lnV`, `desired` (value, trend, retail, pension, own), `net`, `gross`, `depth`, `inv`, and a `cause` vector (value, trend, retail, pension, maker, news, own) that sums exactly to the day's shadow move. `shadowPrices(state)` gives the shadow closes. `ecologyDay()` and `ecoDayInput()` are pure, so the shadow can be replayed from a flag-off run (a test checks they agree exactly).
- **Sim mode (harness only, closed loop):** `enterSimMode(state)` (exported from `src/engine`, in `sim.ts`) returns a copy whose config is registered in an in-memory WeakSet. From then on, the ecology SETS each close at 100% weight: lnP at the close becomes the ecology close, so close-to-close lnP equals the ecology move (newsPrint of the day's jumps, plus pool flow, plus maker), never added on top of the live day. Pools, value gap and momentum see that price the next day. The intraday ticks between closes are still the live engine's. GARCH h and the regime stay the live engine's: lnOpen moves with the close, so h reads the live intraday move. Player fills, the clip fix, the liquidation peak and units volume are unchanged. It is not a save field and not a flag value. `config.ecology.mode: 'sim'` in a save is off. (The save-field equivalent is the hybrid mode below, at weight 1.) A JSON round-trip or `structuredClone` is not sim, and `isSimMode(state)` tells you. Impact in sim: the close is one square-root clearing of net(pools plus every account's fills of the day, summed in `addOwnFlow`), so the lasting move depends only on the day's total flow, not on how it was split. The pools' orders are also added, per side, to the asset's shared tally at the close. That happens after the day's last fill, so it moves no price. In shadow, off or absent, the pools never write the tally. Learnability uses it via `npx tsx scripts/learnability.ts --price-path ecology`, and `gates.ts sim` prints closed-loop gates. Tested in `sim-mode.test.ts`.
- **Hybrid 25% (spec migration step 2; Ledger cleared it for the box copy 2026-10-09):** this is a save field, `config.ecology = { mode: 'hybrid', weight: 0.25 }`.
  - **Allowed weights:** only 0.25 and 1 (`HYBRID_WEIGHTS`). Any other mode or weight is off, byte for byte: 0.3, the string `'0.25'`, NaN, a missing weight, `'Hybrid'` or `'sim'`. `ecologyWeight(cfg)` returns 0, 0.25 or 1.
  - **The close:** at each game-day close, the printed close is `(1 − w) · live close + w · ecology close`. Both legs start from the same previous close, so the move is `(1 − w)·live move + w·ecology move`; it replaces the day's move and is never added on top of it. After the close the ecology is re-anchored on the printed close (`reanchorEcology`: core shifted, the maker's skew kept, today's close replaced in the history, a quarter-end pension anchor moved), so the pools, value gap and momentum read the price that printed.
  - **h and regime:** they stay the live engine's (lnOpen moves with the close, as in sim mode). A halted asset's unprinted live move counts in the live leg, and the halt reopens flat.
  - **Impact:** the live leg carries the accounts' intraday permanent moves and the ecology leg clears their summed flow, each at its weight, so no fill is charged twice. The pools join the shared day tally scaled by w.
  - **Log:** each asset gets `blend: { weight, live }`, so `(1 − w)·live + w·Σcause` explains the printed move.
  - **Weight 1:** a save with weight 1 prints exactly what `enterSimMode` prints (tested).
  - **New worlds:** the 25% hybrid is a fallback only, never the default. Opt in with `createWorld(seed, cfg, { ecology: 'hybrid25' })` (or `{ ecologyWeight: 0.25 }`). Old saves keep whatever config they carry. The default is `NEW_WORLD_ECOLOGY` (see Full below).
  - **Tooling:** `scripts/learnability.ts --price-path hybrid25`, `scripts/sim.ts --ecology-weight 0.25` and `gates.ts sim --weight 0.25 [--live-ref DIR]`. Tested in `hybrid.test.ts`.
  - **Measured on the box, 2026-10-09:**
    - Gates (40 × 720, closed loop): kurtosis 8.70, absAc 0.1328 (MISS, below 0.15; the live engine is 0.139), daily autocorrelation 0.0006, IC1 −0.0091, IC63 0.0211.
    - Seed alpha: GX 1,471.80 (8.0% CAGR), 21.3% vol, −39.6% max drawdown, 489 jumps, 20 halts.
    - Speed: about 35 µs/tick on average. The close tick has a median of 286 µs and a p99 of 746 µs, but 5 of 1,260 closes were over 1 ms (max 2.35 ms).
- **Full 100% (spec migration step 3; built on the box copy 2026-10-09; the new-world default since the flip):** save field `config.ecology = { mode: 'full', weight: 1 }` (`FULL_ECOLOGY`). Weight absent or exactly 1 is on; anything else (`weight: 0.25`, `'1'`, NaN, `'Full'`) is off, byte for byte. It is the same path as `enterSimMode` and as hybrid weight 1, close for close (tested with a player trading, in `rollout.test.ts`).
  - **New-world default:** ONE constant, `NEW_WORLD_ECOLOGY` in `src/engine/sim.ts`, typed `'off' | 'full'` (the 25% hybrid can never be the default). It is `'full'` (flipped 2026-10-09 after Tape's 100% bands and crowd gate, Ledger's sign-off and the 60-seed speed gate: tick p99.9 462 µs, close p99 300 µs, CPU/day 24.29 ms vs off 23.82 ms, /tmp/speed-gate.txt). `createWorld` applies it only to a config with no `ecology` field; an explicit field (shadow, off, a test's knobs) is kept, and a loaded save never passes through `createWorld`, so a save without the field stays legacy. Use `createWorld(seed, cfg, { ecology: 'off' })` for a legacy world (the fingerprint scenarios and the live-model tests do this; an old save is exactly such a world). Old saves with no field, off, shadow and 25% load byte-identical across the flip.
  - **Options:** `createWorld(seed, cfg, { ecology: 'off' | 'full' | 'hybrid25' })`; the older `{ ecologyWeight: 1 }` now writes the `'full'` field and `{ ecologyWeight: 0.25 }` the hybrid fallback. `newWorldEcologyField(choice)` returns the field a choice writes.
  - **Tooling:** `scripts/learnability.ts --price-path full`, `scripts/sim.ts --ecology-weight 1`, `gates.ts sim` (no `--weight`, or `--weight 1`).
  - **Vol level, full mode only (new worlds on 'full', enterSimMode, hybrid weight 1; 2026-10-09): new worlds have a JUMPIER VALUE LINE.** `FULL_MODE_DEFAULTS` = `{ lnVVolScale: 1.15, valuePrint: 0.1 }`; a value set in `config.ecology` wins (`lnVVolScale: 1, valuePrint: 0` gives the earlier full path).
    - `lnVVolScale` 1.15 multiplies the **non-jump diffusive shock** of the world's own `lnV`, the public value players see in `quote().fundamental` and the value signals: `lnV += drift + 1.15·perm·diff + jumpPermanent·jump`. Drift and jumps are not scaled. The live intraday price shock is not scaled; it only feels the jumpier `lnV` through its slow pull toward value (+0.8% intraday sd and +1.2% GARCH h, measured at 1.2), so vol is not double-counted.
    - **Fundamental vol rise:** the diffusive part of `lnV` by 15%; the sd of the daily `lnV` move by **+10.4%** (0.07576 → 0.08365 in units of asset vol, 3 seeds × 1,260 days, 17 assets; unscaled jumps dilute it).
    - `valuePrint` 0.1: quotes reprice 10% of the day's non-jump value move at once, before any pool trades.
    - **Full mode only. Shadow, the 25% fallback, off and legacy are byte-identical** (whole-state hashes over 300 days with a player trading match the code before these knobs; `rollout.test.ts` checks that setting the knob in those modes changes nothing). **Old saves are unchanged**: no save carried 'full' before this, and `NEW_WORLD_ECOLOGY` is still `'off'`.
    - Why: unscaled, the value pool's 90%/day tracking of value (variance ratio a/(2−a) = 0.818) left the ecology at ~0.87× live vol and 9–10 of 17 assets failed Tape's 0.85 band. Scaling a private ecology value line instead broke value_gap (0.167), because the price stopped tracking the public value; scaling the public `lnV` keeps one value line.
    - **Measured** (`/tmp/vol-lnv-scale.txt`): 60 × 720 closed loop all five gates pass (kurt 6.40, absAc 0.226, ac 0.034, IC1 −0.0060, IC63 +0.0160 ± 0.0056), vol ratio min 0.873 (SNTL) / median 0.932 (live 0.978). Learnability (60 seeds): naive 0.200, refined 0.511 in contraction (24/47 seeds, ±0.073), value_gap 0.567 / edge +0.110 / contraction 0.894 / expansion 0.305. Tape's bands on a /tmp copy pass at 20 seeds (lowest GOLD 0.874) and 60 seeds (lowest LMNP 0.871). Ledger set refined momentum's floor at 0.46 only if needed; it is not needed, since this cell clears 0.50. 1.10/0.3 also passed everything with a higher vol floor (0.895) but thin IC room (IC63 1.2 SE, IC1 0.008 inside its floor). The rejected sweeps are in `/tmp/vol-level-sweep.txt`, `/tmp/vol-scale-sweep.txt`, `/tmp/vol-blend-sweep.txt`.
  - **Speed (2026-10-09):** the close path of `ecologyDay` was rewritten without object spreads or dynamic pool keys (same output, byte for byte: whole-state hashes identical in full, hybrid and shadow over 300 days). Measured numbers are in `/tmp/speed-quiet.txt`.
- **Gates:** `npx tsx scripts/ecology/gates.ts full|record|replay|report` (see the header). The tables are in `/tmp/ecology-gates-120-valueclose090.txt` (shipping), `/tmp/ecology-gates-120.txt` (valueClose 0.85, trend-capacity check) and the knob notes are in `/tmp/ecology-kurtosis-notes.txt`; they are not hard-coded here. Shadow mode does not change `quote().volume`.

## Learnability helpers (`src/engine/signals.ts`)

These are pure functions that read only public state. `valueGapSignal(state)` (`value_gap`, ln(value/price)), `mom63Signal(closes, day)` (`mom63`, which throws on a day not printed yet), `signalScores(id, …)`, `sharpe(returns, daysPerYear)` and `equitySharpe(equity, daysPerYear)` (mean daily return / sample sd · √daysPerYear), `regimeAtOpen(state)`, `signedFlow(fills, playerId, assetId, fromTick, toTick)` and `crowding(signedNotional, advNotional, direction, 0.1)`. `scripts/learnability.ts` runs 60 seeds and prints the numbers (no band ids, no pass/fail) to `/tmp/learnability.txt`.

## Tuning knobs

Prices: `permanentShare` (diffusive overshoot, 0.9), `jumpPermanent` (share of a jump that moves value, 1), `jumpImmediate` (share that prints at once, 0.7), `jumpCompensation` (true), and per-asset `halfLifeDays`. Lower `jumpImmediate` gives stronger post-news drift and more momentum; lower `permanentShare` gives more short-term reversal. Test: `src/engine/momentum.test.ts` (rank IC above −0.01 and below 0.08, the legacy model clearly below, old saves unchanged, compensator closed form).

Trading: `config.trading` (`startingCash`, `fees`, `impactY`, `permanentImpactShare`, `maxAdvPerTick`, `closedOrdersKept`) and per-asset `spreadBps`, `advNotional`, `qtyStep`.


Everything lives in `WorldConfig` and `AssetDef`. Nothing is hard-coded in `sim.ts`. Tape's balance runs can override any field through `defaultConfig({ ... })`.
