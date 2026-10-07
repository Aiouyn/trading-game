# Engine: seeded price simulator (Phase 0, task #1)

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

## Tuning knobs

Everything lives in `WorldConfig` and `AssetDef`. Nothing is hard-coded in `sim.ts`. Tape's balance runs can override any field through `defaultConfig({ ... })`.
