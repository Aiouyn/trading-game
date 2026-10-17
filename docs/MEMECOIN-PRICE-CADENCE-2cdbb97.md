# Historical price cadence: correction to the initial audit

Audited game build: `2cdbb975ad58cfadd642169f0b673a56f193a84d`. Research date: 2026-10-14.

**The user is correct: this build materially underrepresents fast meme-coin price action.** Its reserve mathematics can produce a large jump, but normal NPC trading is almost static and the tested downside is especially weak. Graduation rates and annual volatility do not measure this problem. Five-second price changes, within-window ranges, order arrival bursts and reversals do.

## Downloaded evidence

The analysis downloaded two trade shards from the [Pumpfun Memecoin Corpus](https://huggingface.co/datasets/Slinky21/Pumpfun_Memecoin_Corpus), pinned at `13bec2bf3089d56d50c35e602616d1b993bb37f5`. The two shards contain **2,124,485 raw observations**, covering an early June 2026 window and a separate July 14 window. The complete 33-million-trade corpus was not downloaded.

The first shard has 1,966,080 rows across 32,857 mints, spanning June 5–11. After requiring finite positive reserve-derived prices, the documented notional-consistency filter, removal of ambiguous duplicate transaction/mint records and removal of the two possible shard-boundary tokens, 1,075,069 rows remain across 29,736 mints.

For adjacent observations, require a positive time gap no longer than five seconds and constant product changing by at most 0.1%. A stricter trade-aligned subset also requires recorded SOL/token amounts to match reserve changes within 3%. These checks do not establish blockchain authenticity, but substantially reduce the chance of treating inconsistent units or a pool transition as a price jump.

The tables have reserve observations from different regimes despite bonding-curve column names. Standard launch-curve observations are identified separately by the historical `30 SOL × 1.073 billion tokens` invariant and at least 30 virtual SOL. Other reserves are not automatically labelled PumpSwap. A migration-table join provided no verified post-migration pairs in this first shard; no such classification is claimed.

Collector timestamps have not been independently verified against transaction/block timestamps. Thus the short gaps below are **recorded observation gaps**, not a claim that every microsecond timestamp is exact on-chain execution time. These are public collected historical data, not a independently audited chain reconstruction.

## What the actual short-horizon numbers show

For 546,868 trade-aligned adjacent observations matching the standard launch invariant, within a recorded gap of five seconds:

| Absolute price change | Measured value |
| --- | ---: |
| 95th percentile | 6.42% |
| 99th percentile | 12.03% |
| 99.9th percentile | 26.31% |
| Share moving at least 20% | 0.214% |
| Largest retained upward move | 81.63% |
| Largest retained downward move | −65.79% |

These are adjacent retained observations whose reserve changes also match the current recorded trade. They show that individual large prints can produce dozens of percent. They do not say that every trade does so.

Aggregating several prints into the game's five-second horizon makes the mismatch more obvious. For **52,446 adjacent populated five-second buckets** matching that standard invariant, with stable product within and across buckets:

| Five-second close-to-close change | Historical active intervals |
| --- | ---: |
| Median absolute move | 2.11% |
| 90th percentile | 19.11% |
| 95th percentile | 28.02% |
| 99th percentile | 47.78% |
| Share moving at least 20% | 9.32% |
| Share moving at least 30% | 4.32% |

This selection requires observations in both buckets and excludes inactive gaps. It is not an all-token, all-clock-time statistic. Returns use marginal reserve prices, not average execution prices. Pool-invariant matching is a mechanistic classification, not a verified protocol-event label.

Examples in the standard-invariant, trade-aligned subset include **+71.52%**, **+50.88%**, **−55.87%**, **−53.50%** and **−50.93%** across recorded gaps below five seconds. Their transaction signatures, reserve states and order amounts are retained in the evidence CSV for further verification. They were deliberately selected to illustrate the tail, not randomly sampled.

As a separate time-window sensitivity check, the final shard contains 108,638 trade-aligned pairs with a recorded gap of at most five seconds across mixed reserve regimes. Its 99th-percentile absolute move is 20.12%; 1.01% of pairs move at least 20%. This supports the existence of substantial short-horizon moves in another observed window, without asserting identical regime statistics.

I also inspected a [separate PumpSwap sample](https://huggingface.co/datasets/biznus1/pumpswap-historical-trades): 121,123 rows across 2,400 tokens from August 13, 2025. Its timestamp fractions appear to encode transaction indices and some market-cap jumps are implausibly extreme. It is excluded from the principal five-second tuning evidence. Raw maxima would be a poor calibration target.

## Measured game behaviour at the same nominal five-second horizon

The exact `2cdbb97` launchpad implementation was run without modification: four seeds, ten world coins per seed, 720 ticks per coin. The probe advances launchpad simulation without human trades or external Wire headlines. All 40 remain on the curve during this first hour. It therefore isolates the NPC price process rather than recreating the full server economy.

| Metric | All 28,800 game ticks | Only 3,038 ticks with a price change |
| --- | ---: | ---: |
| 95th-percentile absolute move | 0.000922% | 1.25% |
| 99th-percentile absolute move | 0.188% | 3.18% |
| Share moving at least 20% | 0.0556% | 0.527% |
| Largest downward move | −4.54% | −4.54% |

**89.45% of game ticks leave the marginal reserve price unchanged.** There are rare giant positive jumps, including one +870.13% move. The problem is consequently the distribution and sequencing of price movement: long flat stretches, occasional oversized arrival jumps, and almost no comparable downside. Raising viral jump size alone would amplify that existing imbalance.

Historical active buckets and the NPC-only game cohort are different populations. These figures establish a substantial diagnostic discrepancy; their ratios are not a calibrated multiplier. Even conditioning the game on nonzero price changes leaves its 99th percentile well below the historical active five-second value.

![Measured historical and game price cadence](C:/Users/Mathis/Projects/trading-game/proof/memecoin-audit-2cdbb97/price-cadence-comparison.png)

## Why the current code produces the wrong feel

1. **Print ingestion stops after 80 tape entries.** The independently reproduced cursor bug shuts down new-print-driven FOMO/story updates. This removes the feedback needed for consecutive bursts.
2. **Normal discretionary orders are deliberately tiny relative to virtual reserves.** A buy capped at 0.8% of virtual cash produces at most about `(1.008)^2 − 1 = 1.6064%` marginal price impact in isolation. A sell sized at 1.2% of virtual token reserve produces about `1 − 1/(1.012)^2 = 2.3575%` in isolation. Multiple roles can exceed those per-order amounts, and arrivals are a separate path, but the ordinary crowd is strongly damped.
3. **Chatter round trips dominate quiet time.** They provide prints and small candle wicks while returning nearly to the same reserve price. Display-only rows add further apparent activity without net flow.
4. **FOMO is mostly a capped reaction to a player print.** NPC flow does not create the same discovery chain, so the population does not naturally generate an active tape by itself.
5. **There is little coordinated liquidation.** Holder profit-taking, abandonment and capped fear responses do not reproduce a large holder exiting, stops firing and other traders withdrawing confidence over successive ticks.
6. **Graduated coins inherit a vastly oversized ADV.** The earlier audit identified a $400 million template ADV against roughly $43,000 seeded book cash. Its impact model and background price process do not recreate thin-pool execution.

## Corrected implementation direction

This changes the emphasis of the first proposal. Price cadence and executable liquidity must become explicit acceptance targets, alongside realistic NPC identities.

- Fix event ingestion and drive the displayed tape from actual settlement.
- Give active coins event-driven order bursts within each simulation tick. A five-second tick can contain many trades, a local pump, a sharp dump and a rebound. Retain each fill for intratick high/low; a UI can animate those settled events without accelerating the entire game clock.
- Make size relative to available reserves the core variable. Use mostly small orders, some meaningful medium orders and rare large exits/buys. Sample or fit a heavy-tailed mixture conditional on activity, age and liquidity. Do not apply the same hard percentage cap to every role and situation.
- Let net inflow and new-buyer discovery excite further activity; let profit-taking, breached entry levels, visible large selling and falling liquidity excite correlated exits. Keep reaction lags varied and positions/cash finite. Activity must decay when attention and money run out.
- Provide genuinely quiet coins alongside hot coins. A discovered hot coin should often have several meaningful events in five seconds; every token need not behave that way continuously.
- Preserve personalities and funded inventory through graduation; use actual pool depth for subsequent fills and exit estimates.
- Separate organic trading opportunities from exploits. Some trader reads should pay after costs; forcing every follow-the-tape strategy to lose can flatten precisely the dynamics the game needs. Manipulation, infinite-money loops and privileged future information still require independent tests.

Provisional historical anchors for **active standard-curve windows** are a 95th-percentile five-second move around 28%, 99th around 48%, and real two-sided tails. These are starting evidence for experiments, not values to copy globally. Match the game's displayed cohort and liquidity distribution first; then fit several held-out date windows and conduct trader playtests.

The earlier suggested 5–30-minute story duration should describe the life of a trading opportunity. It should not mean smooth or slow price movement inside that story: substantial moves, reversals and exits must be possible within seconds.

## Evidence and scope

Scripts and outputs live in `proof/memecoin-audit-2cdbb97/`: `download-history.py`, `analyze-history.py`, `historical-download-manifest.json`, `historical-short-horizon-stats.json`, `historical-jump-examples.csv`, `historical-example-paths.csv`, `game-five-second-prices.csv`, `price-cadence-probe.test.ts`, and the comparison PNG. Raw downloaded Parquet files are cached outside the repository under the Windows temporary directory. The separate PumpSwap sample is not redistributed.

The cadence probe passed on the isolated build snapshot. The Python analysis completed and its chart was visually checked. No gameplay implementation or live saved world was changed. Full-corpus verification, chain-time verification, matched-population calibration and a revised playable simulation remain outstanding.
