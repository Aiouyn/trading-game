# Persistent traders and historical order flow

The previous build gave each coin twelve wallets but funded them from one $500,000 pool. At live snapshot tick 52680, that pool was empty. Old coins had taken the allocation; most newer coins had wallets with no cash. Twelve fresh launches in a read-only copy of the 223-coin world were flat for 97.43% of their first 120 ticks. The ten-coin calibration was not a representative integration test.

## Each trader owns its balance

There are 240 persistent launchpad traders. Each receives its own seeded starting balance ($2,000–$50,000) once when the population is introduced. This initial wealth is explicitly booked on the economy's NPC faucet. No shared treasury allocates their spending, and launching another coin does not grant or replenish their money.

A token recruits 24 of those traders. The same trader can hold several coins; its engine account is the sole cash balance on both the curve and the graduated market. Curve buys transfer its actual cash to the curve account. Curve sales credit the trader, with normal fees. Pending graduated orders reserve cash before further curve spending. Trader styles persist by identity; cost bases, inventory and response thresholds remain token-specific.

Migration converts old external wallet cash to an account once, preserving existing bags and existing graduated balances. Cancellation sells bags and leaves proceeds with their owners. Old graduated assets with inherited million-dollar ADV are adjusted to their book's actual funded cash. The retired `flowCapital` field is retained only for old-save compatibility.

## Historical data drives orders, not prices

Source: [Slinky21/Pumpfun_Memecoin_Corpus](https://huggingface.co/datasets/Slinky21/Pumpfun_Memecoin_Corpus), pinned revision `13bec2bf3089d56d50c35e602616d1b993bb37f5`. Raw shards 00000 and 00001, approximately 611 MB combined, are cached outside Git. Shard 00001 was downloaded for this revision. `KNOWN_ISSUES.md` was read before extraction.

`scripts/research/fit-memecoin-flow.py` extracts 96 distinct ten-minute launch episodes, stratified by trade count rather than maximum returns. Filters exclude ambiguous duplicate transactions, missing prices, inconsistent amount units, non-standard reserve products, mismatched reserve prices and trades whose reconstructed pre-trade reserves fail the constant-product check. Very small and extreme reserve fractions are omitted, explicitly in the script. This is a curated playable library, with active launches deliberately oversampled, not an unbiased sample of all launches.

Each event stores its five-second bucket, signed order size relative to pre-trade reserves, and an anonymous recurring actor slot. Real wallet addresses are not shipped. Timing gaps, direction runs and varying sizes are preserved. At most 32 historical events are processed per tick; excess events wait rather than disappearing. Orders settle against current game reserves and are bounded by the selected NPC's cash and held tokens. An observed sell without a held bag can be assigned to another actual holder or skipped; short inventory is never created. Twenty-four slots can merge historical identities.

Profit taking, stop reactions and panic selling remain discretionary. Completed episodes can be followed by another randomly selected discovery episode; there is no fixed repeating target chart. Player trades change executable liquidity and therefore change outcomes. Existing launch arrivals and viral shocks remain separate legacy demand paths, including their outside-money accounting.

The timestamps are collector timestamps, not independently verified chain times. This implementation bootstraps empirical flow; it is not a full statistical fit or an exact historical replay. Quiet coins and abandoned stretches remain. Post-graduation pricing still uses the game's cash-bounded book rather than a complete PumpSwap CPMM. Rare legacy viral jumps remain oversized in the longer probe and need further calibration.

## Mature-save verification

The paired probe loads the same snapshot read-only, adds twelve world launches to a copy, and advances 120 full game steps. It writes only aggregate diagnostics and public token price paths. No live save is rewritten.

| First ten minutes of twelve fresh launches | Previous build | Persistent accounts + historical flow |
| --- | ---: | ---: |
| Flat five-second ticks | 97.43% | 32.22% |
| Absolute five-second move, p95 | 0% | 17.69% |
| Absolute five-second move, p99 | 1.59% | 35.30% |
| Largest downward tick | −4.63% | −69.27% |
| Ticks with at least three fills | 0% | 18.61% |
| Persistent population accounts | 0 | 240 |
| Population accounts with negative cash | 0 | 0 |

All twelve paths, rather than selected winners, are shown in `proof/memecoin-history-fit/mature-world-paths.png`. The final p99 above is for this game cohort; the earlier ~48% historical active-window value used different selection criteria and is not a matched fit target.

Both versions reproduce the same pre-existing $300,000 full-world accounting residual at tick 52763. Their residual difference is below $0.000001; this is not a claim that the complete saved world's books close. The separate eight-seed/80-coin launchpad probe closes its booked money identity to under $0.000001 and demonstrates genuine two-sided tails. It includes a full hour of quiet late-life clocks, so it is reported separately in `paired-eight-seeds.json`.

Reproduce extraction with `python scripts/research/fit-memecoin-flow.py` after caching the pinned shards. Run the integration probe with `npx tsx scripts/balance/memecoin-live-replay.ts <world.db> <optional-control.json>`. Input hashes, selected mints and filtering limits are recorded in `flow-library-manifest.json`.

Validation includes the launchpad suite, own-balance and mature-population regressions, deterministic JSON reload, migration, graduation, inventory and cash settlement checks. TypeScript and changed-file lint are checked separately. This does not claim a fully passing repository-wide suite.
