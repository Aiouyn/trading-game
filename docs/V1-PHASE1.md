# V1 Phase 1: Market 2.0, status

Scope: Phase 1, items 1 to 7, of `C:/Users/Mathis/.claude/plans/expressive-sprouting-aurora.md`.
Branch: `v1`. Date of this status: 2026-10-10, after the closing round. Measured at HEAD `0e7c9f3` unless a section says otherwise.
Status words: **Done** (built and tested), **Partial** (built, with named gaps), **Not built** (no code found on v1), **Deferred** (moved to a later phase on purpose), **Fixed** (a measured failure now passes), **Decided** (lead decision recorded, with the reason), **Open** (no decision yet).

## 1. State at this commit

Merges (no-ff) in the closing round: `813c754` (p1/impact), `1146d5e` (p1/calib, with its follow-up `ba2e950` on v1 first), `0e7c9f3` (p1/market). Earlier merges are in section 8.

| Check | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 29 files, 281 tests, all pass |
| `npx eslint src scripts` | 0 errors, 398 warnings (mostly `react/jsx-no-literals`, unused vars) |
| Load gate, 4,000 players, 120 ticks | tick total p99 188 ms against a 2,500 ms gate: PASS (section 3j, measured before this round, not re-run) |

Universe at HEAD (`universeConfig()`): 183 assets, ecology in full mode, three rival funds.

| Class | Count |
|---|---|
| stock | 120 |
| crypto | 30 |
| commodity | 11 |
| forex | 4 |
| bond | 5 |
| property index | 13 |

The plan text says 155 assets. That figure predates the P1.6a crypto and commodity additions (c4d02d6).

Cost note: the universe balance run took 317.8 us per tick against 31.4 us for the bare engine (about 10x). This is not a gate. The load gate was not run on the universe path.

## 2. Plan items

| # | Item | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Momentum fix (`drift.ts` `jumpCompensator`, `jumpPermanent` / `jumpImmediate` / `jumpCompensation`) | Done | 593923c | Missing fields keep the legacy model, so `defaultConfig` is unchanged. Game universe: permanentShare 0.9, jumps fully permanent, 70% printed at once, compensated. Momentum tests ported. |
| 2 | Shared impact tally (`dayTraded`, `tickTraded`, `permanentMove`, `marginalImpact`) | Done | e5d7ea4 | One tally across all accounts. Covers orders, shorts, forced liquidations and the option dealer's delta hedge. The 3x ADV per-tick cap is shared. Impact-tally tests ported. |
| 3 | Peaks from liquidation value | Done, with one note | e5d7ea4 | Crowd-exit marks for longs and shorts. Engine peak and drawdown, world `netWorthPeak`, rank, licences and boards key off `markNetWorth`. Displayed net worth stays mark-to-market. The alt-peak guard (`config.markGuard`, threshold 0.25 ADV, K 0.5) holds peak marks at the close before a one-sided flow. Note: this is the form in e5d7ea4, not checked line by line against Quant's candidate rule (min of price and prior close). |
| 4 | News priced-in bands (`news.ts`) | Done | 6dbfc1d (earnings timing from `catalysts.ts`, a24e507) | Early / Mid / Late / Priced-in chips on move and earnings stories, in en and fr. The share is never shown. Rate shocks enter `dayJump` in every mode (149bcec). |
| 5 | Ecology (`ecology.ts`, `signals.ts`, cause vector, scripts) | Partial | 7fb620c, 1a0f2ee, b61e134, 149bcec, 754f3ab, b298fe4, 1146d5e, d3b806d, 5e463df, 813c754 | Done: full mode on the game universe; six pools clear a square-root closing auction; account fills enter as the own-flow term (capped per day, F8); cause vector log; `signals.ts` ported; `scripts/ecology/{gates,learnability,crowd-hunt}.ts` ported in-process. Rate and catalyst shocks go to `dayJump`. GARCH reads the diffusive innovation (calibration, F1 fixed). True `lnV` stays server-only. Not done: the regenerated fingerprint fixture. v1 has no committed fixture, staging's `fingerprint.ts` was dropped, and `ecology.test.ts` checks flag-off against shadow instead. Not checked: that worlds without player companies keep the fingerprint, and that the client shows the public value line (`publicValueLine`, 1317d60). |
| 6 | Market content | Done, two sub-items moved to Phase 6 | c4d02d6, 34b9d06, bf9d1cd, 1317d60, 13e2414, ec7f973, e7dfa6e, 1a0f2ee, 89bc84c | See the sub-table below. |
| 7 | Gates | Partial | 51a942c, a400727, db480a0, b61e134, 149bcec, 430453b, 9233638, 754f3ab, b298fe4, 1146d5e | 11 of 14 staging test files ported under their names. 3 retired on purpose (`hybrid`, `rollout`, `sim-mode`, 51a942c): they test a migration path V1 does not have. Tape hunts X1 to X3 are suites. Ecology gate scripts are ported. Load gate passes. Failing bands are in section 4 (F2, F3, F4, F5, F13, F14, F15). |

### Item 6 detail

| Sub-item | Status | Commit | Notes |
|---|---|---|---|
| World events (crash, bubble, crisis week, flash) | Done | 34b9d06 | Client sees only `worldEventView`. Give-back is random and sometimes never comes. Crisis week is a trading overlay, not a macro switch. 9 tests. |
| Rumors (about 3 a game week, 55% true) | Done | c4d02d6, universe.ts | `rumorProb 0.32`, `rumorAccuracy 0.55`. |
| Insider tips from crime into the court | Deferred to Phase 6 | none | Lead decision: moved to Phase 6. No code on v1. |
| Rival funds as pool slices (Hale, Pinn, Vetch) | Done | bf9d1cd, 1317d60 | Each trade is a pro-rata slice of its pool's flow, so nothing is double counted. Prices are bit-identical with rivals on and off (tested). Three rival band failures are recorded, not tuned (section 3f, F3, F4). |
| 24 NPC personas trading as pool slices | Deferred to Phase 6 | none | Lead decision: moved to Phase 6. The 24 personas in `src/world` keep their own state. |
| Evolving universe (IPO, bankruptcy, cash merger, spin-off) | Done in engine | 13e2414, 9233638 | Rolled once a game day at most. The client store still uses a static `universeConfig()`; the merge is Phase 2. |
| Crypto to about 30 tokens | Done | c4d02d6 | 30 crypto, including 2 stablecoins (depeg risk), 7 alts, 6 memecoins that bleed between hype waves. |
| Seasonal commodities (learnable) | Done | c4d02d6 | Deterministic yearly value cycle for gas, power, wheat, coffee, oil. |
| Index-reshuffle days via the pension pool | Done | 89bc84c (merged 0e7c9f3) | Reconstitution at a review, `reshuffleK 1` (first pick, not calibrated). Pension pool buy in the two-listing test world: 0.2645 ADV (0.2629 with NEWT alone), equal to the reshuffle units; zero the day before and two days after. Open point: the pension pool still cannot sell delisted names. The index card and blurb count `indexMembers(world, idx)`, so the count follows a reconstitution. |
| Public aggregate short interest and squeezes | Done | e7dfa6e (short interest), 89bc84c (squeeze) | Short interest is published per stock, only when shorts are spread (5 or more holders, none above 40%), otherwise null. Squeeze: fires on 0-based day 6 (tick 156) with cover 0.378 ADV against a 0.2 ADV threshold (first pick, not calibrated). Five liquidations; closes[6] +0.770%, closes[7] +1.045%; headline 1.00 vs 0.574. Self-feed: next-day retail is higher by `retailHeadline` times the headline gap (-0.066 vs -0.109 ADV; gap 0.0425). Delisting between announcement and effect is left as is; the effective StepEvent and the Wire story carry the actual removals. Broker surface is Phase 2. |
| Order depth by pool type | Done | ec7f973 | `depthByPool`, closed days only. The player's own flow is not in this view. |
| `explainMove(state, assetId, fromDay, toDay)` | Done | 1a0f2ee | Closed days only. Pool-type rows and You / Players rows, with the Players fold applied per day before summing. Rows sum to the total exactly. 9 tests. |
| `explainTrade` | Deferred | none | Phase 3, with the trade journal. |

## 3. Measured gates

Sections 3a to 3e and 3j were not re-run in the closing round; their numbers are from the commit named in each heading. Sections 3f to 3i and 3k show the closing-round measurements at `0e7c9f3`. The rivals and hunts reports did not record HEAD; both ran in this round after the merges, on the same tree.

### 3a. World events (34b9d06, not re-run)
- 12 seeds x 5 game years, game universe, events on: GX CAGR median 0.7% (band 0 to 12%): PASS. Invalid count 0. Determinism OK. Strategy bands PASS.
- Events cost GX about 7 points of CAGR at the median (events off 16.5%, on 3.1%, 4 seeds). Most of that is the flash give-back.
- 200 seeds x 5 years: 80 to 180 majors, never overlapping.
- At that commit, 17 per-asset vol-ratio bands failed. 149bcec reduced the set; see 3g.

### 3b. explainMove (1a0f2ee)
- Rejects the open session day, any day after the last close, a reversed window and unknown assets. Clamps a window that starts before the listing.
- Players rule: a day shows as Players only with at least 5 accounts trading the asset and none above 40% of that day's gross player flow. Otherwise it folds into Retail. Decided per day before the window is summed. Test: day-2 Players implied flow is zero.
- Not in yet: the market and sector split of the waterfall (Phase 3). The engine does not log its factor shocks, so it needs a decomposition step first.

### 3c. Public short interest (e7dfa6e)
- Published only with at least 5 holders and none above 40% of the total. Otherwise null. 5 tests.

### 3d. Order depth (ec7f973)
- `depthByPool` on closed days only; throws on the open session and before listing. 1 test.

### 3e. Listings (13e2414)
- Defaults for review: IPO 0.15% per day, bankruptcy 0.05%, cash merger 0.08%, spin-off 0.06%. At most one event a day.
- Value conserved in spin-offs (test). Config and state arrays stay aligned (test). 7 tests.
- No separate balance gate was run for listings.

### 3f. Rivals (0e7c9f3, this round): rivals.ts, 60 seeds x 5 game years, tpd 24
Exit 1, 638 s. No NaN, crash or error lines.

| Rival | Median multiple | Beats GX buy-and-hold | Band | Result |
|---|---|---|---|---|
| Hale & Ward (value) | x1.932 | 88% | median in [0.4, 2.5]: PASS; beat share at most 70%: FAIL | FAIL (beat share) |
| Pinn Partners (momentum) | x0.390 | 18% | median below 0.4: FAIL; beat share PASS | FAIL (median) |
| Vetch (crypto) | x0.260 | 12% | median below 0.4: FAIL; beat share PASS | FAIL (median) |

Previous table (430453b, before the closing round): Hale x2.057 (83%), Pinn x0.538 (22%), Vetch x0.186 (10%).

Lead decision: keep the rivals as they are. They are pool slices and cannot move prices. Players see them only in Phase 6. The three failures are recorded here, not tuned away (F3, F4). Before 1317d60 the same harness gave Hale x3.18 (88%), Pinn x0.57 and Vetch x0.026.

### 3g. Bands (fresh at 0e7c9f3; 149bcec for the bond and band history)
`balance` script, 20 seeds x 5 years, tpd 24.

| Band | Universe (exit 1, 1,020 s) | Bare (exit 0, 107 s) | Band |
|---|---|---|---|
| Bands checked | 191 | 25 | |
| Bands FAILED | 1: `vol_ratio_median:AUSD` 0.520 | 0 | |
| Per-asset vol ratio, median | 182 PASS; eight F1 names 0.924 to 1.111, FLUX 0.976, SYN 1.062 | 17 assets, 0.960 to 1.130, all PASS | [0.85, 1.4] unless listed |
| `gx_cagr_median` | 0.008 | 0.071 | [0, 0.12] |
| `invalid_values` | 0 | 0 | [0, 0] |
| `contraction_seed_share` | 0.900 | 0.900 | [0.5, 1] |
| `bh_beats_random_share` | 0.750 | 0.500 | [0.1, 0.9] |
| `bh_beats_momentum_share` | 0.900 | 0.900 | [0.1, 0.9] |
| `bh_beats_contrarian_share` | 0.900 | 0.500 | [0.1, 0.9] |
| `max_strategy_beats_bh_share` | 0.250 | 0.500 | [0, 0.7] |
| `determinism_mismatch` | 0 | 0 | [0, 0] |

The AUSD band is [0.6, 0.9] (stablecoin band with the 0.5-day half-life). It FAILS at 0.520 (F13). Meme-coin bands (FROG 0.582 [0.44, 1.4], BONK 0.499 [0.36, 1.4]) PASS with their floor-pinning bands.

Earlier band history (149bcec): bond vol ratios AV2Y 1.167, AV10 1.165, AV30 1.187, IGCB 1.196, HYLD 1.032, all PASS. AV10 and AV30 def.vol 5.5% and 11.5% (was 4% and 7%); government funds have no jump term. AUSD and FLUX get a 0.5-day half-life; meme coins BONK, FROG, MOON, HAMR, CATZ, WOOF, GIGA get a floor-pinning band (min 0.8 x sqrt(median alive share)). Rejected in review: newsPrint 0.7 for the universe (unmeasured, reverted to 0.5).

### 3h. Ecology gates (fresh at 0e7c9f3): 8 seeds (eco-01 to eco-08), mean and s.e. Not the 60-seed release gate.

FULL ecology, 1,260 game days.

| Gate | Band | Bare, 720 ticks, 17 assets | Universe, 24 ticks, 183 assets |
|---|---|---|---|
| Excess kurtosis of daily returns | above 3 | 7.54 ± 0.76 PASS | 14.66 ± 0.97 PASS |
| corr(abs r_t, abs r_t-1) | above 0.15 | 0.196 ± 0.009 PASS | 0.205 ± 0.010 PASS |
| Daily return autocorrelation | [-0.05, 0.05] | 0.029 ± 0.005 PASS | 0.043 ± 0.006 PASS |
| 1-day cross-sectional rank IC | [-0.05, 0] | -0.0034 ± 0.0045 PASS | 0.0161 ± 0.0033 FAIL |
| 63 to 21-day rank IC | [0, 0.04] | 0.0245 ± 0.0151 PASS | 0.0205 ± 0.0046 PASS |
| corr(abs r, traded value) | (0.3, 0.6] | 0.499 ± 0.008 PASS | 0.554 ± 0.003 PASS |
| Vol ratio per asset, median over seeds | per-asset bands | 0.891 to 1.135, median 0.978 PASS | 0.524 to 1.233, median 1.020. FAIL: FLUX 0.849 and DATA 0.846 against the class band [0.85, 1.4] (F13) |
| Result | | 7 of 7 PASS | 5 of 7 PASS |

Universe gross flow 0.907 ADV per asset-day (bare 0.893); log only.

Learnability, ecology off, bare catalog, 20 seeds x 5 years, tpd 24, $5k, monthly holding from day 63 with fees (38 s). The 20-seed sample is smaller than the 60-seed run of the earlier table (value_gap 0.450, 27 of 60), so the band check is provisional.

| Signal | Band | Value | Result |
|---|---|---|---|
| value_gap beats buy-and-hold Sharpe | [0.40, 0.60] | 0.500 (10 of 20) | PASS |
| value_gap median Sharpe edge | at most +0.05 | +0.0029 | PASS |
| Regime split (expansion vs contraction) | one above 0.65, one below 0.40 | expansion 0.050, contraction 0.722 | PASS |
| value_gap crowded beat share | below 0.55 and at least 0.05 under uncrowded | no crowded periods at $5k | NOT EVALUATED |
| mom63 beats buy-and-hold | (info) | 0.350 (7 of 20), median edge -0.106 | info |
| Stacked signal, fingerprint | | not in this script | NOT EVALUATED |

The crowded band is evaluated by `scripts/ecology/crowd-hunt.ts` (section 3k, F12).

### 3i. Hunts (fresh at 0e7c9f3): hunts.ts, 60 seeds, 790 s

| Band | Value | Band | Result |
|---|---|---|---|
| value_gap_halflife | 1.0203 | [0.5, 1.5] | PASS |
| value_gap_halflife_days | 42.67 | [0, 126] | PASS |
| value_gap_p95 (regression guard) | 0.0486 | [0, 0.0729] | PASS |
| value_gap_p95_max (X2: never above ln 2) | 0.8417 | [0, 0.6931] | FAIL (F14) |
| ladder_roundtrip_ev | -2,725 | at most 0 | PASS |
| pump_dump_ev, 5% of ADV, 1 / 3 / 5 days | -225,996 / -1,513,926 / -1,732,585 | at most 0 | PASS |
| pump_dump_ev, 10% of ADV, 1 / 3 / 5 days | -486,188 / -3,137,678 / -3,659,248 | at most 0 | PASS |
| pump_dump_ev, 20% of ADV, 1 / 3 / 5 days | -1,069,170 / -6,588,169 / -7,862,500 | at most 0 | PASS |
| earnings_surprise_ic | 0.1788 (8,366 reports) | (0, 1] | PASS |
| news_drift_beats_bh_share | 0.517 (31 of 60) | at most 0.70 | PASS |

Result: 15 of 16 bands PASS, 1 FAIL (F14).

Info lines: value_gap_halflife IQR ratio 0.214. Ladder profitable share 0.433, median -1,505 (LTX). Pump and dump: raw P&L positive on 32% to 42% of seeds, means negative at every size and horizon; rejects 2 to 1,302, rising with size and days. Self-impact, 60 seeds: one-clip close lift non-positive on 0 of 60 SYN and 0 of 60 AURH seeds; intraday peak ratio SYN median 0.996 (0.949 to 1.040), AURH median 0.991 (0.981 to 1.003); 0 of 60 outside 0.75 to 1.5 (F5, F6). News drift median multiple 1.244 vs buy-and-hold 1.218.

Earlier 20-seed self-impact run (db480a0, before calibration): one-clip close lift at most 0 on 3 of 20 SYN and 4 of 20 AURH seeds. This is why the game-path gate moved to the intraday peak ratio (F6).

X3 huge money (db480a0, not re-run; predates the F7 floor in 813c754): tape-01, full universe, one game year. $1e12: mid 2.54e20, liquidation equity -6.68e25, realize to flat from year end -80% of start (flat on day 9). $1e15: mid 1.18e34, liquidation -4.04e45, realize to flat +2.7% of start (flat on day 70). Realized proceeds are 8e-10 and 9e-20 of the mid mark. Peak does not lift at $1e12. At $1e15 it lifts 0.4% to 1.0040e15, and selling down from that tick returns 1.0123e15, so the lift is backed by proceeds. The reproducing code is `scripts/balance/huge-money.ts`.

### 3j. Load (4,000 players, 120 ticks, in-process; not re-run this round)
Command: `npx tsx scripts/load/world-load.ts 4000 120`.

| Measure | p50 | p99 | Max |
|---|---|---|---|
| Setup of 4,000 players | 7.3 s (once) | | |
| stepGame | 15 ms | 71 ms | 635 ms |
| Per-player views and frame | 107 ms | 147 ms | |
| Tick total | not printed | 188 ms | |

Gate: tick p99 under 2,500 ms: PASS. The script prints p99 for the tick total only.
Not run: `scripts/load/socket-load.mjs` (4,000 live WebSocket clients). Last measured in b402371, before the Phase 1 engine work. The universe path has not been load-tested.

### 3k. Calibration and closure (F1, F2, F11, F12, F13; p1/calib, merged 1146d5e)
Engine changes: `sim.ts` GARCH input is `dayDiff`, the sum of each tick's diffusive shock (replaces `lnP - lnOpen - dayJump`). Standardized by `regimeShockSd` (volMult times the loading split). `ecology.ts` `closePrint` is the blend `(1 - w) x jumpImmediate + w x newsPrint`. The bare path changes (GARCH input and loading split), so it is pinned by a golden test (`calibration.test.ts`, fingerprint fa2ca82e, 400 days, seed golden-bare).

Per-name decomposition, universe, 8 seeds x 5 game years, tpd 24 (`c` = mean z^2 / mean h; 1 = GARCH unbiased; from the calibration round):

| Name | c, 9dede3e HEAD (full) | c, now (full) | E[h], HEAD | E[h], now | Realized/expected, 20 seeds, now (matches the 0e7c9f3 balance run) |
|---|---|---|---|---|---|
| NGAS | 1.024 | 1.000 | 0.946 | 1.042 | 0.967 |
| LITH | 0.999 | 0.990 | 0.895 | 0.975 | 0.958 |
| COFF | 1.029 | 1.000 | 0.919 | 0.998 | 0.951 |
| NHK | 1.004 | 0.968 | 0.907 | 0.920 | 0.924 |
| MRE | 1.039 | 1.029 | 1.013 | 1.103 | 1.011 |
| KYN | 0.987 | 0.968 | 0.855 | 0.914 | 0.980 |
| GNOM | 1.037 | 0.989 | 0.921 | 0.988 | 1.111 |
| NRVA | 1.059 | 0.997 | 0.933 | 1.014 | 1.090 |
| AUSD | 30.4 | 0.954 | 3.700 | 0.862 | 0.520 (FAIL, F13) |
| FLUX | 395 | 0.989 | 5.826 | 1.003 | 0.976 |
| SYN | 1.029 | 1.000 | 1.001 | 1.036 | 1.062 |

Ecology off, 8 seeds, HEAD vs 754f3ab vs now: NRVA c 1.265 (HEAD) and 1.165 (754f3ab, dayGap residual), now 1.00 by construction. AUSD c 2.07 (HEAD) and 3.01 (754f3ab, pinned h), now 1.00 by construction. The eco-off ratio is rms over seeds, not the median band statistic.

| Measure | 9dede3e (HEAD) | 754f3ab | 0e7c9f3 (now, closing round) |
|---|---|---|---|
| Universe vol bands, 20 seeds, tpd 24, F1 names | 0.811 to 0.847 (FAIL) | 0.924 to 1.011 (PASS) | 0.924 to 1.111 (PASS, 8 of 8) |
| Universe, all 183 vol bands, 20 seeds | 8 FAIL | 0 FAIL | 1 FAIL: AUSD 0.520 vs [0.6, 0.9] (F13); 182 PASS |
| Bare vol bands, 20 seeds | all PASS | all PASS | all 17 PASS (0.960 to 1.130) |
| Bare vol bands, 60 seeds | all PASS | all PASS | all 17 PASS (calibration round; not re-run) |
| Bare bh_beats_momentum_share, 60 seeds | 0.933 FAIL | 0.933 FAIL | 0.950 FAIL at the calibration round (F15); 0.900 PASS at 20 seeds this round |
| value_gap_p95 median, 60 seeds | 0.0479 | 0.0485 | 0.0486 PASS (F11, this round) |
| value_gap_p95_max, 60 seeds | 0.624 | 0.862 FAIL | 0.8417 FAIL (F14, this round) |
| Universe gates, 720 ticks, 4 seeds | 4 of 7 PASS | 5 of 7 | not re-run at 720 (see F2) |
| Universe gates, 24 ticks, 8 seeds | not in record | not in record | 5 of 7 PASS (IC1 0.0161 FAIL; vol ratio FAIL on FLUX 0.849 and DATA 0.846 against class band) |
| Bare gates, 720 ticks, 8 seeds | 6 of 7 PASS | 7 of 7 | 7 of 7 PASS (section 3h) |
| Crowd, 100 x $250k, 60 seeds, bare, full ecology | not run | 0.383 vs 0.517 (reviewer rerun) | 0.383 vs 0.550 PASS; $25M single 0.400 PASS; $250k NOT EVALUATED (calibration round; not re-run) |
| Crowd, 100 x $250k, 60 seeds, bare, live | not run | not run | 0.317 vs 0.483 PASS; $25M single 0.300 PASS; $250k NOT EVALUATED (calibration round; not re-run) |

Notes: the crowd numbers came from a calibration-round reviewer rerun (`--price-path full`, 60 seeds). With the GARCH change the uncrowded beat moved to 0.550, so both are reported. `scripts/ecology/crowd-hunt.ts` supports only `value_gap` and `mom63`, so the stacked-signal row is not run.

## 4. Known failures and open decisions

Owners are proposed by domain: Quant (engine and calibration), Ledger (gate scope, pricing and spec decisions), Tape (hunts, measurement), Forge (integration, ports, load). The lead assigns them.

| ID | Item | Measured root cause | Proposed owner | Status |
|---|---|---|---|---|
| F1 | Vol bands FAIL on 8 universe assets at 20 seeds, 0.811 to 0.847 | **Fixed** in the model (p1/calib, 1146d5e; section 3k). (1) GARCH read the close-to-close day return, which holds the value pull, news and (full ecology) the auction. Now GARCH reads the diffusive shocks only (`dayDiff`). (2) GARCH standardized by volMult only; `regimeShockSd` adds the loading split. (3) expectedVol counted the full jump; the close prints `closePrint`. Measured this round at 20 seeds, tpd 24: the eight names 0.924 to 1.111, all PASS. | Quant | Fixed (side effects F13, F14) |
| F2 | Universe ecology gates: 1-day rank IC, 63-day rank IC | **Open.** This round, universe, tpd 24, 8 seeds: 1-day IC 0.0161 ±0.0033 FAIL (band [-0.05, 0]; the sign is positive); 63-day IC 0.0205 PASS; daily autocorr 0.043 PASS. Bare, tpd 720, 8 seeds: 1-day IC -0.0034 PASS, 63-day IC 0.0245 PASS. So the 1-day IC failure appears on the universe path only. Earlier, at 720 ticks and 4 seeds, the universe 1-day IC was 0.0153 FAIL. Root cause of the universe IC sign not found. fadeK 0.3 still not adopted (universe bh_beats_contrarian 0.900 this round, 20 seeds). **Next step:** universe, tpd 720, 8 seeds, to separate tick rate from universe composition. | Quant | Open |
| F3 | Hale beat share 88% against 70% (was 83%) | **Decided (lead), recorded.** Equal-weight 3-stock baskets, rebalanced on this schedule, beat GX buy-and-hold on 85% of seeds at random (control in 1317d60). The failure is basket construction against a cap-weighted benchmark, a market-model property, not the value read. Rivals stay pool slices. The band still FAILS and is recorded for the Phase 6 rivals board. | Ledger with Quant | Decided; band FAIL recorded |
| F4 | Vetch median x0.260 (was x0.186), below 0.4 | **Decided (lead), recorded.** The top-3 crypto basket bleeds with the memecoins; this is by design. The band still FAILS and is recorded for the Phase 6 rivals board. | Quant (quant-npc-funds spec) | Decided; band FAIL recorded |
| F5 | AURH full-ecology peak ratio 2.74 on tape-10 (band 0.75 to 1.5, 20 seeds) | **Open.** Partly addressed: the whale self-impact bound (d3b806d, merged in 813c754). This round's 60-seed hunts: intraday peak ratio SYN 0.949 to 1.040, AURH 0.981 to 1.003, 0 of 60 outside 0.75 to 1.5. The tape-10 full-ecology case was not re-run. **Next step:** re-run tape-10, full ecology, 20 seeds. | Ledger (gate scope), Quant | Open |
| F6 | Self-impact game-path gate moved from close ratio to intraday peak ratio | **Decided (lead).** The closing auction reverts temporary impact. The earlier 20-seed count (db480a0) had the one-clip close lift at most 0 on 3 of 20 SYN and 4 of 20 AURH seeds; the 60-seed run this round has 0 of 60 for both. Ledger's 0.997 close-ratio sign-off is no longer tested on the game path. | Ledger | Decided (lead) |
| F7 | Liquidation equity negative at year end ($1e12: -6.7e25; $1e15: -4.0e45) | **Decided and fixed in code (lead, 813c754).** A sale never pays below zero (`trading.ts`, F7 floor). A long's liquidation proceeds floor at zero, so liquidation equity is cash plus non-negative proceeds (`huge.test.ts`, F7 tests, passing in this round's suite). The X3 table in section 3i predates the floor and was not re-run. | Ledger | Decided; code fixed; X3 table to re-run |
| F8 | Close response to own flow not bounded by the shared tally | **Decided per day (lead, 813c754); per-tick reading open for the lead.** Own flow in the close is capped at the trading layer's `maxAdvPerTick` (3 x ADV), as one day's total (`ecology.ts`, F8 comment). The trading layer applies that cap per tick. The per-tick reading would not bind on FROG day 137 (+5.88 log, own flow 5.83 ADV, vol state h 6.4), so the per-day reading is the decision. **Next step:** lead confirms or rejects the per-tick reading. FROG day 137 not re-measured. | Quant, lead | Decided (per day); per-tick open |
| F9 | Rank below the 5e10 threshold not measured | Not measured this round. At huge sizes rank is top tier from the start, so it is not fooled there. | Tape | Open |
| F10 | Realize-to-flat depends on the sell schedule | Only the even daily split (3 ADV per tick cap) was measured. The realize window in `huge.test.ts` moved to 200 days (ba2e950) after the calibration merge. | Tape | Open |
| F11 | value_gap_p95 baseline is self-referential | **Fixed.** Baseline 0.0486 (exact 0.048638): the 60-seed median on the current engine (`hunts.ts --seeds 60`). This round's 60-seed run: 0.0486, PASS. | Tape | Fixed |
| F12 | Learnability and crowd-hunt rows not evaluated | **Partly done.** Crowd gate (1146d5e, bare catalog, 60 seeds, 100 x $250k): full ecology crowded beat 0.383 vs uncrowded 0.550 PASS; $25M single 0.400 PASS; $250k single NOT EVALUATED (no crowded period). Live: 0.317 vs 0.483 PASS; $25M 0.300 PASS; $250k NOT EVALUATED. Learnability this round (20 seeds, $5k): beat share 0.500, median edge +0.0029, regime split PASS; crowded NOT EVALUATED at $5k. Stacked row not run (`crowd-hunt.ts` supports only `value_gap` and `mom63`). Fingerprint row not run. | Ledger, Tape | Open for stacked and fingerprint rows |
| F13 | Band for stablecoins and meme coins; AUSD FAILS | **Open, Ledger decision.** This round (universe, 20 seeds, tpd 24): AUSD 0.520 FAIL against [0.6, 0.9] (0.312 at 720 ticks, 4 seeds, earlier). The 0.79 that 754f3ab recorded came from the pinned-h artifact, which is gone. The band is kept and FAILS; no new band is proposed, because the value depends on the tick rate. FLUX passes the balance band (0.976), but the gates script still applies a class band [0.85, 1.4] that flags FLUX 0.849 and DATA 0.846 (8 seeds, tpd 24). The two checks disagree on FLUX; the class band must be aligned or removed. **Next step:** Ledger decides the AUSD band and the gates class bands. | Ledger (review) | Open (AUSD FAIL; gates class band) |
| F14 | value_gap_p95_max (X2, never above ln 2) FAILS on the bare engine at 60 seeds | **Open, Ledger decision; blocks merge.** This round: 0.8417 (0.842 in the calibration round; 0.624 at HEAD before calibration). Median SYN p95 0.392 (HEAD) to 0.451 now. The regimeShockSd fix moved SYN's realized vol to its target (ratio 1.062 at 20 seeds). The tail belongs to a 110%-vol token with 12 jumps a year. Not widened. Options for Ledger: accept the tail for SYN, or change SYN's spec (half-life, jumps). | Ledger (decision), Quant | Open |
| F15 | Bare bh_beats_momentum_share (band 0.1 to 0.9) | **Pre-existing.** 0.950 at 60 seeds at the calibration round (0.933 at HEAD and 754f3ab). This round, 20 seeds: 0.900 PASS, on the band edge. The 20-seed run passes because of seed count, not a change in the signal. | Tape, Ledger | Open (pre-existing) |

Claimed fixed in db480a0, not re-reviewed in this pass: the hunts review items (reproducibility, peak wording, sign-flip counts, self-impact gate disclosure, 60-seed run). The db480a0 X3 table is still the record; it predates the F7 floor.

Open point outside F1 to F15: the pension pool cannot sell delisted names (section 2, item 6).

## 5. Deviations from the plan

- Universe is 183 assets, not 155 (see section 1).
- Staging tests: 11 of 14 ported under their names; 3 retired (51a942c).
- No regenerated ecology fingerprint fixture (section 2, item 5).
- Staging's sim mode is full mode only in V1; there are no legacy saves to migrate.
- The alt-peak guard is implemented in the form of e5d7ea4 (section 2, item 3).
- Insider tips from crime and the 24 NPC personas' trading as pool slices are moved to Phase 6 by lead decision (section 6).
- The game-path self-impact gate is the intraday peak ratio, not the close ratio (F6).

## 6. Items from Phase 1 with no code

- Index-reshuffle days via the pension pool: built in 89bc84c (merged 0e7c9f3). Reshuffle count `reshuffleK 1` is a first pick.
- Squeeze mechanic: built in 89bc84c (merged 0e7c9f3). Threshold 0.2 ADV is a first pick.
- Moved to Phase 6 by lead decision, no code on v1: insider tips from crime into the court; the 24 NPC personas' trading as pool slices.

## 7. Deferred to later phases

| Item | Phase | Reason |
|---|---|---|
| Client store merge of runtime listings | 2 | The client `universeConfig()` is static; the engine appends listings at runtime (13e2414). |
| Broker surface for public short interest | 2 | e7dfa6e is engine-level only. |
| Insider tips from crime into the court | 6 | Lead decision. No code on v1. |
| 24 NPC personas' trading as pool slices | 6 | Lead decision. The personas keep their own state. |
| Rivals board and rival attacks | 6 | Per the plan. Records F3 and F4 for the rivals board. |
| `explainTrade` | 3 | Follows the trade journal (1a0f2ee). |
| Market and sector split of the waterfall | 3 | Needs a decomposition step; the engine does not log factor shocks. |
| Research-desk hunts (`explain_move_rejects_open_day`, `window_diff_no_isolate`, `desk_below_r3_absent`) | 3 | Part of the research desk. |

## 8. Commits

- Branch merges into `v1` (no-ff), in order: `813c754` (p1/impact, from `9dede3e` and `5e463df`), `1146d5e` (p1/calib, from `813c754` and `b298fe4`), `0e7c9f3` (p1/market, from `ba2e950` and `89bc84c`). Also earlier: `c7491f3` (p1/gates), `178601a` (p1/rivals), `5b194eb` (p1/bonds), `a4b021e` (p1/hunts).
- Closing-round commits on `v1`: `ba2e950` (huge-money realize window 200 days after the calibration merge).
- Branch heads merged: `d3b806d` and `5e463df` (impact), `754f3ab` and `b298fe4` (calib), `89bc84c` (market), `b61e134` (gates), `1317d60` (rivals), `149bcec` (bonds), `db480a0` (hunts, on top of `a400727`).
- P1 commits already on v1 before the closing round: 593923c (P1.1), e5d7ea4 (P1.2-3), 6dbfc1d (P1.4), 7fb620c (P1.5), c4d02d6 and 34b9d06 (P1.6a, P1.6b), 51a942c, e7dfa6e, 1a0f2ee, bf9d1cd, ec7f973, 13e2414 and 430453b (P1.6c, P1.7), 9233638 (P1.7 harness).
