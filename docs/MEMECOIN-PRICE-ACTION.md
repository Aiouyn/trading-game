# Funded meme-coin price action

Implemented from build `2cdbb97` in `codex/memecoin-price-action`.

The launchpad now has a persistent, funded population of 12 traders per token: momentum traders, dip buyers, scalpers, holders and larger traders. They retain cash, weighted entry costs, profit targets, loss tolerance and patience. A bounded tick can contain up to ten participant orders, reacting to the reserves left by earlier fills. Prices remain the result of settlement; there is no imposed pump/crash chart.

## Changes

- Crowd signals accumulate independently of the 80-row display buffer. More than 80 fills in one tick, or repeated tape wraps, no longer drop the next player's signal.
- Independent NPC order bursts include occasional meaningful sizes, partial profit-taking and fear-driven exits. Activity responds to actual movement and flow and declines with age.
- A shared external NPC capital pool supplies the new population. Its initial capital is $500,000, with an explicit $100,000 per game day of external funding. Participant cash is spent and sale proceeds replenish that participant; there is no per-token cash refill for this population. These are game calibration choices, not historically fitted numbers.
- Existing launch/viral-arrival demand and the small legacy news/FOMO response remain separate. Their existing funding rules are retained; the shared capital model is not yet a rewrite of every NPC funding path.
- Display-only trades are removed from token pages. The default active path no longer adds the recurring artificial round trip. The legacy control still supports it for isolated regression/balance tests.
- New NPCs have stable anonymous identities on both their settled trades and holder rows. Their raw internal ids stay private.
- Repeated buys by a participant merge into a weighted-average bag, so its cohort list stays bounded rather than growing every tick.
- At graduation, participants retain distinct positions, cash and identities as funded engine accounts. They continue buying/selling through engine orders instead of all being merged into the fixed unwind.
- The graduated book's ADV starts from its actual funded cash (roughly $43,000), rather than the FROG template's $400 million. It remains the game's cash-bounded engine book, not a complete CPMM implementation.
- Old live and graduated saves initialize the population lazily. Unspent capital and realised liquidation proceeds return to the shared pool on cancellation/death.

Two existing type errors found during validation were corrected: forced-liquidation pricing now receives its account id, and the tournament child guards the optional IPC disconnect method.

## Measured price cadence

`scripts/balance/memecoin-cadence.ts` runs eight paired seeds, ten world-launched coins per seed and 720 full game steps. No humans or external Wire headlines are injected. The control selects the previous crowd policy with the signal-buffer fix already present; it is not a separate untouched executable of the old commit.

| Five-second result | Legacy control | New funded population |
| --- | ---: | ---: |
| Flat ticks | 89.18% | 43.22% |
| 95th-percentile absolute move, all ticks | 0.000500% | 8.88% |
| 99th-percentile absolute move, all ticks | 0.203% | 23.05% |
| 99th-percentile absolute move, moving ticks | 3.15% | 29.09% |
| Largest downward move | −5.03% | −54.55% |
| Ticks moving at least 20% | 0.061% | 1.38% |
| Ticks containing at least three fills | 5.33% | 27.57% |
| Graduations among the 80 launches | 0 | 1 |

The largest upward move is still a rare, pre-existing viral-arrival jump (about +697% in the new run). Its heavy tail has not been fully calibrated. The observed money residual is below $0.00000004; every retained share remains assigned to an actual holder/book.

This is a substantial change in trading cadence and two-sided tails. It is not a statistical fit to all historical Pump.fun activity, and a trader playtest remains valuable. Active historical samples and these complete NPC-only clocks have different selection criteria.

Reproduce with:

```powershell
npx tsx scripts/balance/memecoin-cadence.ts --legacy
npx tsx scripts/balance/memecoin-cadence.ts
```

The captured results are in `proof/memecoin-price-action/`.

## Validation

- 193 launchpad and related exploit checks pass, including nine new population tests. They cover two-sided price action, funded buying, inventory/supply, shared capital, realistic holder/tape identities, tape overflow, JSON replay, old-save migration, graduation accounting and cancellation refunds.
- The engine's affected margin/forced-liquidation regression suites passed in a broader targeted run: 265 tests before the final two new population cases; the final launchpad run passed all 193 checks.
- Both tournament runner tests pass, including the actual fork/IPC path.
- Changed-file lint, the project TypeScript check and a webpack production build passed. The isolated checkout's dependency link lacked WebSocket packages, so validation used task-local copies of the declared packages and a temporary tsconfig path override; the production Next configuration was restored afterward.
- A full-suite exploration exposed 13 failures already reproduced on the untouched base: eight squeeze cases, two huge-money cases, two company-order cases and one French apostrophe audit. The remaining lengthy broad simulations were stopped; this is not a claim that the entire repository is green.

No live saved world was rewritten during implementation. A running world-server process needs to load the updated source to use the new population.
