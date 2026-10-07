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
μ      = drift + cycleBeta · regime.equityDrift

lnV += (μ − ½(φσ)²)·dt + φ·σ·√dt·shock + φ·J                      φ = permanentShare = 0.8
lnP += (μ − ½σ²)·dt + κ·(lnV − lnP)·dt + σ·√dt·shock + J          κ = ln2 / halfLife
lnP  = max(lnP, ln floor)
```

In plain words: 80% of every move is news about value and stays; 20% is noise that fades back toward value with the asset's half-life (large caps 20 game days, small caps 60, crypto 120). That keeps long-horizon volatility close to the target instead of pinning prices to a fixed path.

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

The reference run uses seed `alpha` and 5 game years, at about 17 µs per tick for 17 assets on one core (6.5 µs per tick on DESKTOP-NICO4R2). The same seed gives byte-identical output on Linux and on this Windows PC:

- Realized vol sits within about 0–25% above target. The excess comes from jumps and crisis regimes, which is intended. Lumen Pharma runs higher because it is the binary drug-trial stock.
- GX has 22.7% vol and a −39% max drawdown across two contractions.
- Stock correlation to GX ranges from 0.28 to 0.78, crypto sits around 0.2, and Gold is at −0.07.

## Tests (`npx vitest run`, about 2 s)

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

`vol` in `AssetDef` is only the diffusive part, and jumps add on top. `expectedVol(def, regime?)` gives the total:

$$
\sigma_{tot}^2 = (vol \cdot volMult)^2 + \lambda \cdot jumpMult \cdot \left(p \cdot 2\eta_{up}^2 + (1-p) \cdot 2\eta_{down}^2\right)
$$

Balance bands compare realized vol against `expectedVol(def)` (neutral regime), never against raw `vol`. For example, Lumen Pharma has `vol` 38% but expected total vol of about 65%, because of its binary trial jumps.

## Volume

Every asset prints a deterministic volume each tick. It runs on its own seeded stream (`volume:<id>`), so it never changes prices: the same seed gives the same prices as before volume existed.

Expected traded value per tick:

$$ \text{notional} = \frac{ADV}{\text{ticksPerDay}} \cdot volMult \cdot \sqrt{h} \cdot (0.6 + 0.5\,\min(|z|, 40)) \cdot u(t) \cdot (1 + heat) \cdot noise $$

- `ADV` is the asset's `advNotional`, the same number square-root impact uses. Calibrated so the long-run mean day trades about 1.0 × ADV (0.9 to 1.1 across the default universe over 5 years).
- `volMult · √h`: crises and vol clusters trade more, calm expansion less (seed alpha, 5 yrs: expansion 0.83 × ADV, overheating 1.18, contraction 1.16, recovery 1.14).
- `z` is this tick's return over expected tick vol, so big moves trade more. Daily correlation between |return| and volume is about 0.3 to 0.6.
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
- Half of the impact (`permanentImpactShare`) moves the price for everyone; the pull to value decays it.
- Each order fills at most `3 × ADV` of notional per tick; the rest stays open and continues next tick.
- Phase 0 fills sequentially in order-id order inside a tick. The uniform-price batch auction between players arrives with multiplayer.

**Order types.** Market fills next tick. Limit fills once the execution price (spread and impact included) is at or better than the limit, at that price. Stop triggers when mid crosses the stop (buy: at or above, sell: at or below) and then fills like a market order, so a gap fills through the stop. `tif: 'day'` expires at the next game-day boundary; `gtc` (default) stays. Orders on a halted asset wait for the reopen.

**Rules.** Long only, no margin. Stocks trade whole shares (`qtyStep: 1`); crypto and commodities are fractional. A buy is rejected if it would exceed cash minus what other open buys reserve (limit price, or estimated price for market and stop). A sell is rejected beyond the held quantity minus other open sells. If a buy no longer fits the cash at fill time (price moved), it fills what the cash covers and the rest is cancelled with `insufficient cash`.

**Fees** (`config.trading.fees`, per asset class): stocks and commodities 0.10% with a $1 minimum, crypto 0.20% with no minimum.

**Accounting.** `avgCost` includes buy commissions. Realized P&L on a sell is `qty · price − fee − qty · avgCost`. `realizedPnl + unrealizedPnl = equity − startingCash` holds exactly. `peakEquity` and `maxDrawdown` update every tick (marked at mid); `dayPnl` is measured from equity at the first tick of the game day. Drawdowns are fractions ≤ 0.

**Default liquidity.** Stock spreads by market cap: ≥ $100B 2 bps, ≥ $40B 6 bps, ≥ $25B 12 bps, smaller 25 bps; ADV is 0.4% of market cap a day. AUC 5 bps / $20B, LTX 8 bps / $8B, SYN 60 bps / $300M. GOLD and OIL 3 bps / $30B. All are per-asset `AssetDef` fields (`spreadBps`, `advNotional`, `qtyStep`).

The headless sim now prints a round-trip cost table (buy then sell at once, calm market, in bps of notional) for $500, $5k, $50k and $1M tickets. Typical: about 22 bps on a $5k mega-cap stock trade, 45 bps on AUC, about 100 bps on SYN; the $1 minimum fee makes $500 stock trades cost about 40 bps.

Tests: `src/engine/trading.test.ts` (23 tests): fills and fees, round-trip accounting, square-root impact, permanent impact, 3×ADV cap, validation and reservations, limit and stop triggers, cancel, day expiry, halts, cash shrink, drawdown, day P&L, determinism with orders, JSON reload.

## Tuning knobs

Trading: `config.trading` (`startingCash`, `fees`, `impactY`, `permanentImpactShare`, `maxAdvPerTick`, `closedOrdersKept`) and per-asset `spreadBps`, `advNotional`, `qtyStep`.


Everything lives in `WorldConfig` and `AssetDef`. Nothing is hard-coded in `sim.ts`. Tape's balance runs can override any field through `defaultConfig({ ... })`.
