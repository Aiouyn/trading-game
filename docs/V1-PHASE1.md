# V1 Phase 1: Market 2.0, status

Scope: Phase 1, items 1 to 7, of `C:/Users/Mathis/.claude/plans/expressive-sprouting-aurora.md`.
Branch: `v1`. Date of this status: 2026-10-10, after the closing round and round 3. Measured at HEAD `0e7c9f3` unless a section says otherwise. Round 3 (`0524edf`, branch `p1/r3`) is merged no-ff as `182c036` and recorded in section 3l. Round 4 (`0e9b771`) is recorded in section 3m and round 5 (`e2f427b`, branch `p1/r5`) in section 3n. Round 6 (branch `p1/r5`, the review fixes to round 5) is recorded in section 3o, which supersedes 3n where they differ. Every F row in section 4 is current at round 6.
Status words: **Done** (built and tested), **Partial** (built, with named gaps), **Not built** (no code found on v1), **Deferred** (moved to a later phase on purpose), **Fixed** (a measured failure now passes), **Decided** (lead decision recorded, with the reason), **Open** (no decision yet).

## 1. State at this commit

Merges (no-ff) in the closing round: `813c754` (p1/impact), `1146d5e` (p1/calib, with its follow-up `ba2e950` on v1 first), `0e7c9f3` (p1/market). Round 3: `182c036` (p1/r3, tip `0e9b771`). Earlier merges are in section 8.

| Check | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 52 files, 645 tests, all pass (round 6, final code) |
| `npx eslint src scripts` | 0 errors, 398 warnings at the closing round (mostly `react/jsx-no-literals`, unused vars); not re-run after round 3 | Round 5: `eslint` on every touched file, 0 errors.
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
| 7 | Gates | Partial | 51a942c, a400727, db480a0, b61e134, 149bcec, 430453b, 9233638, 754f3ab, b298fe4, 1146d5e | 11 of 14 staging test files ported under their names. 3 retired on purpose (`hybrid`, `rollout`, `sim-mode`, 51a942c): they test a migration path V1 does not have. Tape hunts X1 to X3 are suites. Ecology gate scripts are ported. Load gate passes. Failing bands are in section 4 (F2, F3, F4, F5, F13, F15, F18); F14 fixed in round 3. |

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

The AUSD band is [0.6, 0.9] (stablecoin band with the 0.5-day half-life). It FAILED at 0.520 (F13); round 3 removed the class band and switched the statistic to RMS over seeds (section 3l), so AUSD passes at 0.986. Meme-coin bands (FROG 0.582 [0.44, 1.4], BONK 0.499 [0.36, 1.4]) PASS with their floor-pinning bands.

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

### 3l. Round 3 (`0524edf`, branch `p1/r3`, merged `182c036`)

Changes, each with its mechanism:
- X2 (F14): `sim.ts` adds the Ito centring term to the price drift. Golden fingerprint re-pinned fa2ca82e to 461b6a16. The `impact-tally` exact float check is now relative 1e-14 (one ulp apart after the price path moved).
- Pension (F16): the drift-driven pension order is capped at `pensionMaxAdv` = 1 ADV a day. FROG is in CRX (every crypto name); sign unchanged, so it sells above the anchor.
- Vol statistic (F13): gates and `run.ts` take the RMS over seeds. The AUSD class band [0.6, 0.9] is removed.
- Tooling: `scripts/ecology/gates.ts` gains `--first`, `--drop`, `--world` (diagnostics, documented in its header). `calibration.test.ts` golden re-pinned.

Before / after (8 seeds, `gates.ts`; 20 seeds, `run.ts`):

| Gate | Before | After |
|---|---|---|
| Universe 24: IC1 / IC63 / dAC | 0.0161 FAIL / 0.0205 / 0.0428 | 0.0161 FAIL / 0.0204 / 0.0428 |
| Universe 24: vol (median before, RMS after) | FLUX 0.849, DATA 0.846 FAIL | RMS 0.539 to 1.254; FLUX 0.767 FAIL (8 seeds; 20 seeds 1.33) |
| Universe 24 gates | 5/7 | 5/7 |
| Universe 720: IC1 / IC63 | 0.0157 FAIL / 0.0456 FAIL | same |
| Universe 720 gates | 4/7 (AUSD 0.527, FLUX 0.734) | 5/7 (RMS 0.648 to 1.221, median 1.061) |
| Bare 720: IC1 / IC63 / vol | -0.0034 / 0.0245 / 0.891 to 1.135 | -0.0034 / 0.0245 / RMS 0.907 to 1.135 |
| Bare 720 gates | 7/7 | 7/7 |
| Hunts 60: value_gap_p95_max | 0.8417 FAIL | 0.4492 PASS |
| Hunts 60: value_gap_p95 median | 0.0486 | 0.0476 (PASS, guard 0.0729) |
| Hunts 60 | 15/16 | 16/16 PASS (news_drift 0.517, earnings IC 0.1788) |
| `run.ts` universe 20 x 5y, tpd 24 | AUSD 0.520 FAIL | all PASS (AUSD 0.986, FLUX 1.326, AV10 1.267) |
| `run.ts` bare 20 x 5y, tpd 24 | all PASS | all PASS |
| Huge money $1e12, tape-01, tpd 24 | largest up +0.750 (pension 0); pension desire to 7.3 ADV | +0.750 (pension 0); desire capped at 1 ADV |

Pension (huge money, $1e12, tape-01): before round 3 the drift-driven pension desire reached 7.3 ADV at one quarter-end (d250); after, the desire is capped at 1 ADV a day. The pool trades only in the last 3 days of each 63-day quarter, toward the policy weight, so its sign runs against the move. On the largest FROG up day (+0.750 log in the round 3 run) pension is 0, so a pump cannot draw pension buying. The whale check is reproduced by `scripts/balance/huge-money.ts`.

Not fixed in round 3:
- IC1 (F2). Ablation, universe, 24 ticks, 8 seeds (IC1 baseline 0.0161 ± 0.0033): no catalysts 0.0001; no PEAD 0.0094; no news at close (`newsPrint 1`) -0.0087; `newsPrint 0.8` -0.0021 (bond AV30 vol ratio 1.46 breaks the band); `valueMaxAdv 12` -0.0097 at 24 ticks and -0.0093 at 720 (breaks the valuegap "closed by day 10" check at 0.34 > 0.25, and the squeeze; reverted to 4); no trend 0.0234; no retail headline 0.0096; no rates, events, rivals, listings, squeeze or pension: unchanged. Mechanism: earnings news prints half at the close; the rest is traded the next day by the value pool (capped at 4 ADV on 1.6% of asset-days). Needs a Ledger decision (bond expectedVol ignores rate vol; see F13).
- 63-day IC at 720 ticks 0.0456 (band [0, 0.04]) FAIL before and after (F18).
- The task's +1.65 log day with +1.50 from pension did not reproduce (F17).

Checks (round 3 record): `next typegen` 0; `tsc` 0; eslint 0 errors on touched files; vitest 48 files, 621 tests pass. Re-run at `182c036` (the merge): `next typegen` exit 0, `tsc --noEmit` exit 0, `vitest run` 48 files, 621 tests pass. No integration fix was needed.

### 3m. Round 4 (`0e9b771`, branch `p1/r3`, recorded in round 5)

Changes, each with its mechanism (the commit body has the full ablation):
- Universe `newsPrint 1` (F2). The closing auction printed half of a day's news, so half the move reverted at the close and the value pool traded the rest the next day. Rates keep their print at 0.5 (`ratePrint`), since bond vol had been calibrated at that print. Universe GARCH 0.12 / 0.86 (persistence unchanged at 0.98) for the vol clustering that the news residual no longer carried.
- Bare catalog and its golden test unchanged.
- Pension measured, not changed (the 1 ADV cap is replaced in round 5).

| Gate | Before (round 3, `0524edf`) | After (round 4) |
|---|---|---|
| Universe 720 ticks, 8 seeds: 1-day IC | +0.0157 FAIL | -0.0135 ±0.0032 PASS |
| Universe 720 ticks, 8 seeds: 63-day IC | 0.0456 FAIL | 0.0332 PASS |
| Universe 720 ticks, 8 seeds: volCorr | | 0.546 PASS |
| Universe 720 ticks, 8 seeds: gates | 5/7 | 7/7 |
| Universe 24 ticks, 8 seeds: 1-day IC | +0.0161 FAIL | -0.0112 PASS |
| Universe 24 ticks, 8 seeds: volCorr | 0.554 PASS | 0.642 FAIL (see F19) |
| Bare 720 ticks, 8 seeds | 7/7 | 7/7, 1-day IC -0.0034 |
| Hunts, 60 seeds | 15/16 or 16/16 | 16/16 |

### 3n. Round 5 (branch `p1/r5`, the five lead decisions A to E)

**Round 6 corrections (section 3o).** Four statements below are superseded: (1) item A's expectation omitted the diffusion regime mix and the earnings gap, and its rate term ignored the config's rates layer; (2) item A's "option tests pass" named no option-pricing test (advanced.test.ts exercises optionQuote); (3) item C's cap 0.833 ADV breaches the knee over consecutive quarters, and is replaced by 0.708; (4) item D's "both inside [0.85, 1.4] at 2 s.e." is wrong for AUSD (0.846 at the lower end). The figures below are the round-5 measurements, kept for the record.

**A. expectedVol is the model's honest prediction** (`config.ts`, `regimeShares.ts`, `ratevar.ts`).
- Jump term with no regime: the time average of `jumpMult` times E[J²] over the default regimes. Time shares come from the embedded chain's stationary law times each regime's `meanDays`, solved exactly: expansion 0.5212, overheating 0.1390, contraction 0.1699, recovery 0.1699. The time-average `jumpMult` is 1.2456, against 1.0 for expansion. A regime given still uses that regime's jump terms.
- Rate term for an asset with `duration` and `yieldKey` (bonds, property): D² x daily yield variance x 252 x (print² + (1 - print)²). The print pass-through is the share of a day's rate move that prints at the close (`ratePrintOf`); the rest is traded the next day, so the daily return is `print x move_t + (1 - print) x move_t-1`. The daily yield variance comes from the rates layer run on `DEFAULT_RATES` and the regime chain for 4000 game years (seed `rate-var`, one year of burn-in). It is a constant with a test (`ratevar.test.ts`) that re-runs the simulation, so a stale table fails. Values per day: expansion y10 1.047e-7, contraction y10 4.72e-7, mix y10 1.95e-7.
- Options use the default prints (1), so an option's vol is the horizon variance. AV10 expectedVol went from 5.5% to 8.1% with no regime (6.6% in expansion, 12.1% in contraction). Option tests pass. Before this round the expectation was 5.5%.
- No class band was removed. The floor-pinned meme bands keep their own mechanism (the price floor). Nothing else in `UNIVERSE_VOL_BANDS` existed for the jump or rate gap.

Daily vol ratio (`run.ts` universe, 20 seeds, 24 ticks, RMS over seeds):

| Asset | Before | After |
|---|---|---|
| AV2Y | 1.167 (149bcec) | 1.005 |
| AV10 | 1.267 (round 3) | 1.001 |
| AV30 | 1.270 (round 4, 60 seeds) | 0.976 |
| IGCB | 1.196 (149bcec) | 0.997 |
| HYLD | 1.032 (149bcec) | 1.008 |
| RE.avalon.docks | | 0.966 |
| FLUX | 1.323 (round 4) | 1.190 |
| AUSD | 0.977 (round 4) | 0.880 |

Universe balance, 20 seeds: all bands PASS; 183 vol bands PASS (RMS 0.632 to 1.190; the minimum is a floor-pinned meme name inside its band). Bare balance, 20 seeds: all bands PASS; 17 vol bands 0.955 to 1.075.

Horizon check (not a gate; 4 seeds x 3 game years, 24 ticks, annualized 21-day realized vol against the horizon expectedVol): AV10 8.94% vs 8.11%, AV30 21.8% vs 17.6%, AV2Y 3.28% vs 2.09%, IGCB 7.45% vs 6.31%, RE.avalon.docks 13.2% vs 14.3%. The horizon term does not model yield trend persistence, so the short and long bonds run above it. Open (F21).

**B. Gate tick rate** (`scripts/ecology/gates.ts`). Release gates run at 720 ticks a game day, for bare and universe alike (the default is now 720). A 24-tick run prints "SMOKE RUN" and lists its known divergences (`KNOWN_SMOKE_DIVERGENCES`): universe volCorr 0.642 at 24 ticks against 0.546 at 720. That one key is INFO at 24 ticks; the others stay gated. Round 5 release gates, 720 ticks, 8 seeds:
- Universe: 7/7 PASS. 1-day IC -0.0135 ±0.0032, 63-day IC 0.0332 ±0.0039, volCorr 0.546, vol RMS 0.683 to 1.202 (median 1.036), no vol asset fails. 20 vol assets are UNDECIDED at 8 seeds (2 s.e. straddles a band edge), including AUSD 0.854 ±0.230 and FLUX 0.778 ±0.142.
- Bare: 7/7 PASS. 1-day IC -0.0034 ±0.0045, 63-day IC 0.0245 ±0.0151, vol RMS 0.904 to 1.096 (median 1.007). CRVO and AURH are UNDECIDED at 8 seeds.

**C. Pension cap, derived** (`ecology.ts`). `PENSION_MAX_ADV = sizes.pension / capacity / pensionDays = 7.5 / 3 / 3 = 0.833 ADV a day`, replacing the picked 1. The damping `1 / (1 + capacity · |pos| / size)` halves a pool's orders at position size / capacity = 2.5 ADV: the capacity knee. The pension pool trades in `pensionDays` equal daily parts, and a 63-day half-life barely decays over 3 days, so a daily cap of knee / pensionDays keeps a window's position inside the knee. The looser version, sizes / pensionDays = 2.5 ADV, was measured and rejected (below). Whale check (`huge-money.ts`, tape-01, $1e12 and $1e15, 24 ticks, one game year). "Idle" means an account-idle FROG day: the rotation traded FROG on days 0-1, 6-7, 12-13, and so on.

| Measure | Before (cap 1 ADV) | Derived (cap 0.833) | Rejected (cap 2.5) |
|---|---|---|---|
| $1e12, largest pension buy (day, log) | 1.00 ADV (day 187, +0.0756) | 0.833 ADV (day 187, +0.0648) | 2.30 ADV (day 250, +0.277) |
| $1e12, largest idle-day pension move | 0.0962 (day 126) | 0.0919 (day 252) | 0.2772 (day 250) |
| $1e15, largest idle-day pension move | 0.1007 (day 250) | 0.0860 (day 250) | 0.1428 (day 251) |
| $1e12, realized from year end, vs start cash | 0.6587 | 0.6628 | |
| $1e15, realized from year end, vs start cash | 3.617e-2 | 3.618e-2 | |

The 2.5 ADV version triples the idle-day push, which is the round-3 whale bound, so it is not shipped. The claimed +1.65 log day is still not reproduced (F17). Realized proceeds stay positive.

**D. Rare-jump names at 300 seeds** (`run.ts --universe --assets FLUX,AUSD`, 4 processes of 75 seeds, 24 ticks, RMS over seeds with a delta-method s.e.). FLUX 1.025 ±0.041 (before 1.090 ±0.041), AUSD 0.946 ±0.050 (before 1.116 ±0.068). Both are inside [0.85, 1.4] at 2 s.e., so both PASS. At 720 ticks and 8 seeds (gates), FLUX 0.778 ±0.142 and AUSD 0.854 ±0.230 are UNDECIDED. A 300-seed run at 720 ticks is about 24 CPU-hours and was not run. Ledger decides the seed count (F13).

**E. explainMove shares** (`ecology.ts`, `impactShares`). The impact I splits over the five flows. When |net| is at least a quarter of gross flow, each part is I x / net (a flow's part carries its own sign, and |part| ≤ 4|I|). Below that, each part is I |x| / gross, in the move's direction (|part| ≤ |I|). The parts sum to I exactly, and a no-flow day gives zeros. The old I x / net grew like 1 / sqrt(|net|) on a near-cancelling day (a pension share of 73.9 was seen). Prices and the sim are unchanged; only the cause log moves, and only on days below the threshold. Tests: `impact-shares.test.ts` (5).

**Other gates, round 5 final code.** Hunts, 60 seeds, bare catalog: all 16 bands PASS. value_gap_halflife 0.998, value_gap_p95 0.0476 (guard 0.0729), value_gap_p95_max 0.4492 (ln 2 = 0.6931), news_drift beats buy-and-hold on 0.517 of seeds, earnings IC 0.1788. These match round 4 (the bare catalog has no rate or pension term).

Checks: `npx next typegen` exit 0; `npx tsc --noEmit` exit 0; `npx eslint` on every touched file, 0 errors; `npx vitest run` 50 files, 633 tests, all pass. Commands: `scripts/balance/run.ts --seeds 20 --tpd 24` (universe and bare), `scripts/ecology/gates.ts full --tpd 720 --seeds 8` (universe and bare, run in split processes with `--first` and merged with `report`), `scripts/balance/hunts.ts --seeds 60`.

Round 5 open items (also in F12, F13, F21): the horizon vol of bonds (yield trend persistence); the diffusion regime mix (time-average volMult² = 1.18) is not in expectedVol, and stock vol ratios of 0.9 to 1.1 show that it is offset elsewhere; the seed count for the 720-tick FLUX and AUSD verdict; F3, F4, F5 and F12 not re-run in rounds 4 and 5.

### 3o. Round 6 (review fixes to round 5, branch `p1/r5`; supersedes 3n where they differ)

The reviewer's list of round-5 problems, with the decision on each. Real ones are fixed in code or in the record. Round 5's claims that were wrong are corrected here, not silently replaced.

**1. expectedVol is an honest prediction (reviewer 3, 4, 6, 7; F21).** `expectedVol` (config.ts) now has four terms, each taken from the code that generates it:
- Diffusion: `(vol · volMult · regimeShockSd)²`, time-averaged over the default regimes without a regime. `regimeShockSd` is the regime's loading split (sim.ts draws the shock with that sd). Round 5 used `(vol · volMult)²`, so the regime mix of diffusion (E[volMult²] = 1.18 on the defaults) was missing. Measured with the same seeds, the stock ratios fall: HLCN 1.068 to 0.958, NMBS 1.081 to 0.970 (8 seeds, `run.ts`).
- Jumps: unchanged (regime-mix intensity, round 5).
- Earnings (stocks, when `catalysts` is on): `(252 / everyDays) · (moveScale · vol / 0.3)² · E[s²] · (1 + peadShare² / peadDays)`, with `E[s²] = 0.97` from a quadrature of the clamped consensus (catalysts.ts). Earnings are in the close, so this is in the daily band.
- Rates: taken from the config's `rates` layer. A config with no rates layer gets no rate term. `gates.ts --drop rates` now gets exactly that (round 5 always used `DEFAULT_RATES`, so the ablation was scored against a layer that was off). Non-default rates configs are simulated once and memoized.
- Horizon: the rate term is multiplied by the yield variance ratio at the option's horizon (`RATE_YIELD_VARIANCE_RATIO`, ratevar.ts, horizons 1 to 63 days, generated with the daily table in one run of 4000 years). This is used by options only; the daily bands use horizon 1.

Not in the expectation, and why (documented in `expectedVol`): flash crashes (about 1.3 a year, -8% on stocks, about 1 to 2% of stock vol), crisis weeks (about 4% of days trade as contraction, about 1% of vol), crash and bubble drifts (spread over 10 to 40 days, negligible per day), and the ecology's own dynamics (value pull, momentum and trend pools). The reviewer's note that `universeConfig` sets `worldEvents: {}`: in code that means the defaults are on (`worldEventsConfig` returns them), so the crisis overlay is in the universe run. It is not modelled, for the reason above.

Residual, measured (20 seeds, 24 ticks, universe, after this round): the bond funds are at 0.95 to 0.99 (AV2Y 0.989, AV10 0.987, AV30 0.962, IGCB 0.977, HYLD 0.952), stocks at 0.96 (HLCN 0.956, NMBS 0.968), property RE.avalon.docks 0.930. The stock offset is about -4 to -5%, from the ecology's value pull, which the diffusive model does not include. Ledger decides whether that is a band (with its mechanism written) or a modelled term; it is not widened here. Every one of the 183 universe bands PASS at 20 seeds, and the lowest non-meme names are NHK 0.867, SOLN 0.876, AUSD 0.880, NHOL 0.897. No band was added or removed in round 6: the floor-pinned meme bands are the only class bands, and they keep their mechanism (the price floor).

Horizon (reviewer 4): the bond option vol was underpriced over the 21-day horizon. The rates layer's own yield trend persistence explains part of it, through the variance ratio: AV2Y's 21-day gap falls from 57% to 16%. The rest is not the rates layer: the rates variance ratio at 21 days is 0.86 for y10 and 0.96 for y30, so AV10, AV30, IGCB and NMBS remain above their horizon expectation. That residual is the ecology's trend and momentum pools (not modelled; F21 open). Measured (`scripts/balance/horizon.ts`, 4 seeds, 3 game years, 24 ticks, universe; realized vol against the expectation):

| Asset | Realized daily vol / daily band | Realized 21-day vol / horizon expectation (round 5, 4 seeds) | Round 6 horizon expectation, ratio |
|---|---|---|---|
| AV2Y | 1.84% / 1.85% (0.99) | 3.28% vs 2.09% (1.57) | 3.28% vs 2.82% (1.16) |
| AV10 | 7.25% / 7.03% (1.03) | 8.94% vs 8.11% (1.10) | 8.94% vs 7.88% (1.13) |
| AV30 | 15.96% / 15.09% (1.06) | 21.82% vs 17.62% (1.24) | 21.82% vs 17.59% (1.24) |
| IGCB | 5.87% / 5.54% (1.06) | 7.45% vs 6.31% (1.18) | 7.45% vs 6.17% (1.21) |
| HYLD | 7.52% / 8.74% (0.86) | 8.96% vs 8.90% (1.01) | 8.96% vs 8.90% (1.01) |
| RE.avalon.docks | 13.13% / 14.63% (0.90) | 13.19% vs 14.78% (0.89) | 13.19% vs 14.78% (0.89) |

Option tests: `advanced.test.ts` prices options with `optionQuote` (the time-decay check). Round 5 cited "option tests pass" with no option-pricing test named; that is now corrected. The horizon term and its ratio are tested in `expectedvol.test.ts`.

**2. Gate tick rate (reviewer 2; F19, decision B).** `run.ts` prints `SMOKE RUN` at any tick rate other than 720, and its header and `bands.ts` say the release verdicts are at 720. The 24-tick balance runs below are smoke runs. The 720 vol verdicts come from `gates.ts` (8 seeds, undecided for many names; see the tables in this section). The FLUX and AUSD 720-tick verdict is still UNDECIDED. The round-5 "PASS" for them (3n D) was at 24 ticks, and its 2 s.e. statement was wrong (see 3).

**3. Rare-jump names at 300 seeds (reviewer 1; F13, decision D).** Round 5 wrote "both inside [0.85, 1.4] at 2 s.e." That was wrong: `run.ts` prints one standard error, and AUSD 0.946 - 2 x 0.050 = 0.846 < 0.85, so AUSD's PASS rests on its point estimate. Round 6 reran both at 300 seeds, 24 ticks, 12 processes of 25 seeds (`run.ts --universe --assets FLUX,AUSD`), RMS over seeds with the delta-method standard error (1 s.e. shown): **FLUX 1.025 ± 0.041, 2 s.e. [0.942, 1.107]: wholly inside [0.85, 1.4], PASS. AUSD 0.946 ± 0.050, 2 s.e. [0.846, 1.046]: straddles 0.85, so UNDECIDED at 2 s.e.; its point estimate is above 0.85.** The round-6 expectation barely moves these two names (expectedVol 0.162575 to 0.162572 for FLUX, 0.046127 to 0.046122 for AUSD, since their diffusion mix and earnings are negligible), so the 300-seed values equal round 5's to three decimals. The 720-tick verdict stays UNDECIDED at 8 seeds (FLUX 0.778 ± 0.142, AUSD 0.855 ± 0.230). Ledger decides whether AUSD needs more seeds for a verdict at 2 s.e.

**4. Pension cap (reviewer 7; F16, decision C).** The round-5 value `sizes / capacity / pensionDays` (0.833) ignored two things: the position decays between quarters (half-life one quarter), and the capacity damping grows as the position grows. The reviewer was right that the window argument did not cover consecutive quarters, and the round-5 cap does breach the knee. The derivation is now the pool's own recursion (ecology.ts `pensionCapAtKnee`): ecologyDay's update `pos = pos x d + order`, `order = cap / (1 + capacity |pos| / size)` on the last 3 days of each quarter. Bisection on the cap finds the largest cap whose peak position, over 80 consecutive quarters with the cap hit every trading day, is at or below the knee (size / capacity = 2.5 ADV). Result: **0.708 ADV a day** (was 0.833). The closed form without damping gives 0.843 and is not the bound, because the damping is evaluated at the position in the window, not at its end. `pension-cap.test.ts` checks: the peak over 60 quarters is at or below the knee, a 0.5% larger cap breaks it, a cap of 1 ADV breaks it, and the config carries the value.

Whale check (`huge-money.ts`, tape-01, universe, 24 ticks, one game year; the round-5 cap 0.8333 passed explicitly as "before"; the new script also rebuilds the FROG position from the log's own orders with the engine's update):

| Measure | Round-5 cap 0.833 | Derived cap 0.708 |
|---|---|---|
| $1e12, FROG pension position, peak (knee 2.5) | 2.518 on day 126: over the knee | 2.224 on day 126: inside |
| $1e15, FROG pension position, peak | 2.770 on day 252: over the knee | 2.464 on day 252: inside |
| $1e12, largest idle-day pension buy / sell (ADV) | 0.722 / -0.593 | 0.636 / -0.523 |
| $1e12, largest FROG up day, realized push (log) | +0.784 on day 139 | +0.784 on day 139 (same to four digits in both runs) |
| $1e12, realized from year end, vs start cash | 0.663 | 0.651 |
| $1e15, realized from year end, vs start cash | 3.618e-2 | 3.620e-2 |

The idle-day *cause* number (largest |pension log move| on an idle day) is not comparable across rounds: the explainMove split changed (item 5), so the same cap gives 0.103 (round-5 cap, new split) and 0.120 (derived cap, new split) on day 250, against 0.092 in round 5 (old split, old cap). The price path does not change with the split: the round-5 archive and the new code give the same FROG prices, same orders and same pension order sizes. The round-5 claim "largest idle-day pension move 0.092 log" should be read with that caveat. The whale still loses on fees and impact (realize from year end: 0.65 of start cash at $1e12, 0.036 at $1e15).

**5. explainMove shares (reviewer 5; F20, decision E).** The round-5 split was sign-blind on cancelling days (part = I|x|/gross gives a seller a share in the move's direction) and discontinuous at the switch (flows [1, -0.6] gave the seller -1.5 I; [1, -0.8] gave +0.44 I). The new split (`impactShares`) is `part_x = I (x / D + r |x| / G)`, with D the net when |net| >= 0.25 G and the same-sign floor 0.25 G otherwise, and r = 1 - net / D. The parts sum to I exactly; each part has the sign of its own flow (tested for buying and selling days, and for a zero-net day); the split is continuous at the switch (tested by nudging a seller across it); every part is at most 4|I| on normal days and 5|I| on cancelling days. The price path is unchanged (cause log only). `impact-shares.test.ts` has the sign, continuity and bound tests.

**6. Gate scope, rivals, hunts, crowd (reviewer 9; F3, F4, F5, F12).** All re-run at round 6, so every F row is current:
- Rivals, 60 seeds, 5 game years, 24 ticks (`rivals.ts`): Hale x1.623 median, beats GX buy-and-hold 77% (was x1.932, 88%): median in band, beat share FAIL (above 70%). Pinn x0.428, beats 20%: PASS (was x0.390, FAIL on median). Vetch x0.155, beats 3%: median FAIL (was x0.260). The rivals remain pool slices and are not tuned (F3, F4 Decided, bands recorded).
- Hunts, 60 seeds (`hunts.ts`): 16 of 16 PASS. value_gap_p95 0.0476 (guard 0.0729), value_gap_p95_max 0.4492, news_drift beats buy-and-hold on 0.517 of seeds, earnings IC 0.1788. Self-impact at 720 ticks, full ecology, all 60 seeds: SYN peak ratio 0.950 to 1.041 and 0 of 60 outside 0.75 to 1.5; AURH 0.981 to 1.003 and 0 of 60 outside. F5 is closed on 60 seeds (round 5's open item was the 20-seed tape-10 run).
- Crowd gate, bare catalog, full ecology, 60 seeds, 100 x $250k (`crowd-hunt.ts --price-path full`, value_gap): crowded beat 0.383 vs uncrowded 0.550, PASS; $25M single 0.400 vs 0.550, PASS; $250k single NOT EVALUATED (no crowded periods). Identical to round 5. The mom63 rows are print-only and fail the derived check (0.233 vs 0.217); they are not the gate, which is value_gap. Learnability (stacked, fingerprint) is still not run (F12).

**7. Stale docs (reviewer 8).** Fixed: `universe.ts` (bond comment, the expectedVol claim), `types.ts` ratePrint comment (the rate term is now taken at the close's print), `docs/ENGINE.md` ("carry over to 720" replaced with the release-rate statement and the 24-tick divergence), `bands.ts` header, `gates.ts` label (the vol row now says "none wholly outside its band", since FAIL is that and undecided is listed).

**8. Checks.** `npx next typegen` exit 0. `npx tsc --noEmit` exit 0. `npx vitest run`: 52 files, 645 tests, all pass (round 5: 50 files, 633). `npx eslint` on every touched file: 0 errors. New tests: `impact-shares.test.ts` (rewritten), `pension-cap.test.ts`, `expectedvol.test.ts`; updated closed forms in `calibration.test.ts`, `ratevar.test.ts`, `sim.test.ts`.

**Runs, round 6 (commands and times).** `scripts/balance/run.ts --universe --seeds 20 --tpd 24`: all bands PASS (1,610 s). `run.ts --seeds 20 --tpd 24` (bare): all bands PASS (319 s). `scripts/ecology/gates.ts full --seeds 2 --first K` in 4 processes per catalog (8 seeds each catalog), merged with `report`: bare 720 7/7 PASS, universe 720 7/7 PASS. `scripts/balance/hunts.ts --seeds 60`: 16/16 PASS. `scripts/balance/rivals.ts --seeds 60`: see item 6. `scripts/ecology/crowd-hunt.ts`: see item 6. `scripts/balance/huge-money.ts` before and after: item 4. `run.ts --universe --assets FLUX,AUSD --seeds 25 --first K` in 12 processes (300 seeds): item 3.

Gates at 720, 8 seeds, merged (`gates.ts report`):
- Bare: kurtosis 7.54 ±0.76, absAc 0.196 ±0.009, dailyAc 0.029 ±0.005, IC1 -0.0034 ±0.0045 PASS, IC63 0.0246 ±0.0151 PASS, volCorr 0.499 ±0.008 PASS. Vol RMS 0.841 to 1.069, median 0.962; 8 assets undecided at 8 seeds (CRVO 0.841 ±0.027, HLCN 0.858, OSTV 0.880, VRDN 0.971, ATLF 0.939, MRDB 0.921, and two more). Gates 7/7 PASS.
- Universe: kurtosis 31.9 ±1.6, absAc 0.187 ±0.010, dailyAc -0.003 ±0.004, IC1 -0.0135 ±0.0032 PASS, IC63 0.0332 ±0.0039 PASS, volCorr 0.546 ±0.003 PASS. Vol RMS 0.664 to 1.168, median 0.951; no asset wholly outside its band; **86 of 183 undecided at 8 seeds** (the honest expectation moved many names to the 0.85 edge, see item 1; the 20-seed run is the better read). Gates 7/7 PASS.

Open (round 6): the 720-tick vol verdict needs more seeds (Ledger; FLUX and AUSD UNDECIDED); the stock and property offset of 4 to 10% (Ledger: band or modelled term); the horizon residual for AV10, AV30, IGCB and NMBS (ecology trend and momentum pools); F17 (the +1.65 log FROG day) is still not reproduced (the largest FROG up day is +0.784 on day 139, pension 0).

## 4. Known failures and open decisions

Owners are proposed by domain: Quant (engine and calibration), Ledger (gate scope, pricing and spec decisions), Tape (hunts, measurement), Forge (integration, ports, load). The lead assigns them.

| ID | Item | Measured root cause | Proposed owner | Status |
|---|---|---|---|---|
| F1 | Vol bands FAIL on 8 universe assets at 20 seeds, 0.811 to 0.847 | **Fixed** in the model (p1/calib, 1146d5e; section 3k). (1) GARCH read the close-to-close day return, which holds the value pull, news and (full ecology) the auction. Now GARCH reads the diffusive shocks only (`dayDiff`). (2) GARCH standardized by volMult only; `regimeShockSd` adds the loading split. (3) expectedVol counted the full jump; the close prints `closePrint`. Measured this round at 20 seeds, tpd 24: the eight names 0.924 to 1.111, all PASS. | Quant | Fixed (side effects F13, F14) |
| F2 | Universe ecology gates: 1-day rank IC, 63-day rank IC | **Fixed (round 4, `0e9b771`).** The closing auction printed half of a day's news, so half the move reverted at the close and the value pool traded the rest the next day. Fix: universe `newsPrint 1` (rates keep `ratePrint 0.5`). Round 5, 720 ticks, 8 seeds: 1-day IC -0.0135 ±0.0032 PASS, 63-day IC 0.0332 PASS. 24 ticks: 1-day IC -0.0112 PASS (section 3m). | Quant, Ledger | Fixed (round 4) |
| F3 | Hale beat share 77% (was 88%), median x1.623 (was x1.932) | **Decided (lead), recorded.** Equal-weight baskets against a cap-weighted benchmark: a market-model property. Rivals stay pool slices. Round 6 (60 seeds, 3o item 6): median in band, beat share 77%, FAIL above 70%. | Ledger with Quant | Decided; band FAIL recorded; re-run round 6 |
| F4 | Vetch median x0.155 (was x0.260), below 0.4; Pinn median x0.428 (was x0.390), now PASS | **Decided (lead), recorded.** The top-3 crypto basket bleeds with the memecoins, by design. Round 6 (60 seeds, 3o item 6): Vetch FAIL on median, Pinn PASS. | Quant (quant-npc-funds spec) | Decided; band FAIL recorded; re-run round 6 |
| F5 | AURH full-ecology peak ratio 2.74 on tape-10 (band 0.75 to 1.5, 20 seeds) | **Closed (round 6).** Self-impact at 720 ticks, full ecology, 60 seeds (hunts.ts): SYN peak ratio 0.950 to 1.041, AURH 0.981 to 1.003; 0 of 60 outside 0.75 to 1.5 for either. The round-5 "Open" was the 20-seed tape-10 run; the 60-seed run covers it. | Ledger (gate scope), Quant | Closed (round 6) |
| F6 | Self-impact game-path gate moved from close ratio to intraday peak ratio | **Decided (lead).** The closing auction reverts temporary impact. The earlier 20-seed count (db480a0) had the one-clip close lift at most 0 on 3 of 20 SYN and 4 of 20 AURH seeds; the 60-seed run this round has 0 of 60 for both. Ledger's 0.997 close-ratio sign-off is no longer tested on the game path. | Ledger | Decided (lead) |
| F7 | Liquidation equity negative at year end ($1e12: -6.7e25; $1e15: -4.0e45) | **Decided and fixed in code (lead, 813c754).** A sale never pays below zero (`trading.ts`). Round 5 re-ran the X3 table: liquidation equity at year end is positive ($1e12: 9.9e11; $1e15: 1.0e15). | Ledger | Decided; code fixed; X3 re-run (round 5) |
| F8 | Close response to own flow not bounded by the shared tally | **Decided per day (lead, 813c754); per-tick reading open for the lead.** Own flow in the close is capped at the trading layer's `maxAdvPerTick` (3 x ADV), as one day's total (`ecology.ts`, F8 comment). The trading layer applies that cap per tick. The per-tick reading would not bind on FROG day 137 (+5.88 log, own flow 5.83 ADV, vol state h 6.4), so the per-day reading is the decision. **Next step:** lead confirms or rejects the per-tick reading. FROG day 137 not re-measured. | Quant, lead | Decided (per day); per-tick open |
| F9 | Rank below the 5e10 threshold not measured | Not measured this round. At huge sizes rank is top tier from the start, so it is not fooled there. | Tape | Open |
| F10 | Realize-to-flat depends on the sell schedule | Only the even daily split (3 ADV per tick cap) was measured. The realize window in `huge.test.ts` moved to 200 days (ba2e950) after the calibration merge. | Tape | Open |
| F11 | value_gap_p95 baseline is self-referential | **Partly.** Round 5 hunts (60 seeds): value_gap_p95 0.0476, PASS against the guard 0.0729, max 0.4492. Still a regression guard on this branch's own 60-seed median, not an independent check. | Tape | Partly |
| F12 | Learnability and crowd-hunt rows not evaluated | **Partly done.** Crowd gate (value_gap, bare catalog, full ecology, 60 seeds, 100 x $250k), re-run round 6: crowded beat 0.383 vs uncrowded 0.550 PASS; $25M single 0.400 PASS; $250k single NOT EVALUATED (no crowded periods). Unchanged from round 5. Learnability (round 3, 20 seeds, $5k) not re-run; stacked-signal and fingerprint rows not run. | Ledger, Tape | Open for stacked and fingerprint rows |
| F13 | Band for stablecoins and meme coins; AUSD and FLUX | **Partly, corrected (round 6, 3o item 3).** At 24 ticks, 300 seeds, RMS over seeds: FLUX 1.025 ±0.041, 2 s.e. [0.942, 1.107] PASS; AUSD 0.946 ±0.050, 2 s.e. [0.846, 1.046], straddles 0.85: UNDECIDED (round 5 said PASS at 2 s.e.; wrong). At 720 ticks, 8 seeds: both UNDECIDED (FLUX 0.778 ±0.142, AUSD 0.855 ±0.230). Bond vol ratios 0.95 to 0.99 at 20 seeds. The round-6 expectation barely moves these two names. | Ledger (review) | Partly; AUSD UNDECIDED at 2 s.e.; 720-tick undecided |
| F14 | value_gap_p95_max (X2, never above ln 2) FAILS on the bare engine at 60 seeds | **Fixed in round 3 (section 3l).** Cause: the price drifted at mu - s²/2 and the value at mu - (perm s)²/2, so the gap settled below ln 2 only without the Ito centring term. Fix: `sim.ts` adds it. Round 5 hunts (60 seeds): value_gap_p95_max 0.4492 PASS. | Quant | Fixed (round 3; re-run round 5) |
| F15 | Bare bh_beats_momentum_share (band 0.1 to 0.9) | **Pre-existing.** Round 5, bare 20 seeds: 0.900 PASS, on the band edge. At 60 seeds it was 0.950 (calibration round). The verdict moves with the seed count, not the signal. | Tape, Ledger | Open (pre-existing, on the edge) |
| F16 | Pension pool drift-driven order unbounded (whale check); cap must keep the position inside the capacity knee | **Fixed in round 6 (3o item 4).** The round-5 cap 0.833 ADV a day breached the knee (position peak 2.52 ADV at $1e12, 2.77 at $1e15) because the window argument ignored the decay between quarters and the damping. Cap now derived by bisection on the pool recursion: 0.708 ADV a day; peak 2.22 and 2.46 ADV, inside the 2.5 knee. Idle-day pension buy and sell fall to 0.636 and -0.523 ADV at $1e12 (from 0.722 and -0.593). | Tape, Ledger | Fixed (round 6, derived) |
| F17 | Claimed +1.65 log FROG day with +1.50 from PENSION | **Not reproduced (rounds 3, 5 and 6).** Round 6: the largest FROG up day is +0.784 on day 139 at $1e12 (same with the derived cap). The 720-tick whale table is not a useful gate: the whale loses to fees and impact. **Next step:** Tape to look at the whale table. | Tape | Not reproduced; open for Tape |
| F18 | 63-day rank IC at 720 ticks FAILS on the universe and on baseline | **Fixed (round 4, `0e9b771`).** The IC1 fix moved IC63 from 0.0456 (FAIL) to 0.0332 (PASS, band [0, 0.04]). Round 5, 720 ticks, 8 seeds: 0.0332 ±0.0039 PASS. | Ledger, Quant | Fixed (round 4) |
| F19 | 24-tick smoke divergence: universe volCorr 0.642 at 24 ticks, 0.546 at 720 | **Decided (round 5, B), applied to labels in round 6.** Release gates run at 720 ticks (gates.ts). run.ts prints SMOKE RUN at any other rate; bands.ts and ENGINE.md say so. The balance verdicts at 720 were not run (about 30 times the 24-tick cost); the vol and ecology gates at 720 (8 seeds) are the release read. | Ledger, Tape | Decided; labels applied (round 6) |
| F20 | explainMove cause shares sign-blind and discontinuous at the switch; blow up on a near-zero net flow (a pension share of 73.9 seen) | **Fixed (round 6, 3o item 5).** The split is I (x/D + r abs(x)/G), D the net or the same-sign floor 0.25 G, r = 1 - net/D. Parts sum to the move exactly, each has its flow's sign (tested), continuous across the switch (tested), at most 5 |I|. Prices unchanged (cause log only). | Quant | Fixed (round 6) |
| F21 | expectedVol misses the regime mix, the earnings gap, the rate shock and its horizon | **Fixed for the daily band (round 6, 3o item 1): diffusion regime mix, earnings (stocks), config rates. Options: the rate term carries the yield variance ratio. Bond option horizon gap (4 seeds, 21 days): AV2Y 16% (was 57%), AV10 13%, AV30 24%, IGCB 21%. Open: that residual is the ecology trend and momentum pools (not modelled), and a 4 to 10% stock and property daily offset (value pull, not modelled). Ledger decides band or modelled term.** | Ledger, Quant | Fixed (daily band and AV2Y horizon); Open (ecology residuals) |

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
- Round 3: the vol-ratio statistic in the gates and `run.ts` is the RMS over seeds, not the median (F13). The AUSD class band is removed.
- Round 3: the pension pool's drift-driven order is capped at 1 ADV a day (`pensionMaxAdv`, F16). The cap is a first pick.
- Round 5: the pension cap was derived as sizes / capacity / pensionDays = 0.833 ADV a day (F16). Round 6 replaces it with the largest cap whose position peak over consecutive quarters stays at or below the knee: 0.708 ADV a day, from the pool's own recursion (3o item 4).
- Round 5: release gates run at 720 ticks a game day for both configs; 24 ticks is a smoke run (F19).
- Round 5: `expectedVol` carries the regime-mix jump term and the rates layer's yield variance, with an optional print for daily-return bands (section 3n A). Round 6 adds the diffusion regime mix, the earnings gap and the config's rates layer, and options carry the yield variance ratio at their horizon (section 3o item 1).

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

- Round 6, branch `p1/r5` (review fixes to round 5): `expectedVol` terms and horizon ratio (config.ts, ratevar.ts), `impactShares` (ecology.ts), pension cap by bisection (ecology.ts), `gates.ts` label, `run.ts` SMOKE RUN, `huge-money.ts` position check, `horizon.ts` (new); tests `pension-cap.test.ts`, `expectedvol.test.ts`, rewritten `impact-shares.test.ts`.
- Round 5, branch `p1/r5` (commit `e2f427b`, on top of `cd58d0a`): engine `expectedVol` (rate table, regime mix), derived pension cap, `impactShares`; scripts `rate-var.ts`, `gates.ts` 720 default, `run.ts --assets/--first`, `huge-money.ts` idle-day line; tests `ratevar.test.ts`, `impact-shares.test.ts`.
- Round 3 merge into `v1` (no-ff): `182c036` (p1/r3, from `95ea380` and `0524edf`; branch tip `0e9b771`, round 4, merged but not recorded here).
- Branch merges into `v1` (no-ff), in order: `813c754` (p1/impact, from `9dede3e` and `5e463df`), `1146d5e` (p1/calib, from `813c754` and `b298fe4`), `0e7c9f3` (p1/market, from `ba2e950` and `89bc84c`). Also earlier: `c7491f3` (p1/gates), `178601a` (p1/rivals), `5b194eb` (p1/bonds), `a4b021e` (p1/hunts).
- Closing-round commits on `v1`: `ba2e950` (huge-money realize window 200 days after the calibration merge).
- Branch heads merged: `d3b806d` and `5e463df` (impact), `754f3ab` and `b298fe4` (calib), `89bc84c` (market), `b61e134` (gates), `1317d60` (rivals), `149bcec` (bonds), `db480a0` (hunts, on top of `a400727`).
- P1 commits already on v1 before the closing round: 593923c (P1.1), e5d7ea4 (P1.2-3), 6dbfc1d (P1.4), 7fb620c (P1.5), c4d02d6 and 34b9d06 (P1.6a, P1.6b), 51a942c, e7dfa6e, 1a0f2ee, bf9d1cd, ec7f973, 13e2414 and 430453b (P1.6c, P1.7), 9233638 (P1.7 harness).
