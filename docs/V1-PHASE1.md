# V1 Phase 1: Market 2.0, status

Scope: Phase 1, items 1 to 7, of `C:/Users/Mathis/.claude/plans/expressive-sprouting-aurora.md`.
Branch: `v1`. Date of this status: 2026-10-09.
Status words: **Done** (built and tested), **Partial** (built, with named gaps), **Not built** (no code found on v1), **Deferred** (moved to a later phase on purpose).

## 1. State at this commit

| Check | Result |
|---|---|
| Merges (no-ff) | `c7491f3` p1/gates, `178601a` p1/rivals, `5b194eb` p1/bonds, `a4b021e` p1/hunts. No conflicts. |
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 25 files, 242 tests, all pass |
| `npx eslint src scripts` | 0 errors, 398 warnings (mostly `react/jsx-no-literals`, unused vars) |
| Load gate, 4,000 players, 120 ticks | tick total p99 188 ms against a 2,500 ms gate: PASS (section 3j) |

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

## 2. Plan items

| # | Item | Status | Commits | Notes |
|---|---|---|---|---|
| 1 | Momentum fix (`drift.ts` `jumpCompensator`, `jumpPermanent` / `jumpImmediate` / `jumpCompensation`) | Done | 593923c | Missing fields keep the legacy model, so `defaultConfig` is unchanged. Game universe: permanentShare 0.9, jumps fully permanent, 70% printed at once, compensated. Momentum tests ported. |
| 2 | Shared impact tally (`dayTraded`, `tickTraded`, `permanentMove`, `marginalImpact`) | Done | e5d7ea4 | One tally across all accounts. Covers orders, shorts, forced liquidations and the option dealer's delta hedge. The 3x ADV per-tick cap is shared. Impact-tally tests ported. |
| 3 | Peaks from liquidation value | Done, with one note | e5d7ea4 | Crowd-exit marks for longs and shorts. Engine peak and drawdown, world `netWorthPeak`, rank, licences and boards key off `markNetWorth`. Displayed net worth stays mark-to-market. The alt-peak guard (`config.markGuard`, threshold 0.25 ADV, K 0.5) holds peak marks at the close before a one-sided flow. Note: this is the form in e5d7ea4, not checked line by line against Quant's candidate rule (min of price and prior close). |
| 4 | News priced-in bands (`news.ts`) | Done | 6dbfc1d (earnings timing from `catalysts.ts`, a24e507) | Early / Mid / Late / Priced-in chips on move and earnings stories, in en and fr. The share is never shown. Rate shocks enter `dayJump` in every mode (149bcec). |
| 5 | Ecology (`ecology.ts`, `signals.ts`, cause vector, scripts) | Partial | 7fb620c, 1a0f2ee, b61e134, 149bcec | Done: full mode on the game universe; six pools clear a square-root closing auction; account fills enter as the own-flow term; cause vector log; `signals.ts` ported; `scripts/ecology/{gates,learnability,crowd-hunt}.ts` ported in-process. Rate and catalyst shocks go to `dayJump`. True `lnV` stays server-only. Not done: the regenerated fingerprint fixture. v1 has no committed fixture, staging's `fingerprint.ts` was dropped, and `ecology.test.ts` checks flag-off against shadow instead. Not checked in this pass: that worlds without player companies keep the fingerprint, and that the client shows the public value line (`publicValueLine`, 1317d60). |
| 6 | Market content | Partial | c4d02d6, 34b9d06, bf9d1cd, 1317d60, 13e2414, ec7f973, e7dfa6e, 1a0f2ee | See the sub-table below. |
| 7 | Gates | Partial | 51a942c, a400727, db480a0, b61e134, 149bcec, 430453b, 9233638 | 11 of 14 staging test files ported under their names. 3 retired on purpose (`hybrid`, `rollout`, `sim-mode`, 51a942c): they test a migration path V1 does not have. Tape hunts X1 to X3 are suites. Ecology gate scripts are ported. Load gate passes. Gate failures are in section 4. |

### Item 6 detail

| Sub-item | Status | Commit | Notes |
|---|---|---|---|
| World events (crash, bubble, crisis week, flash) | Done | 34b9d06 | Client sees only `worldEventView`. Give-back is random and sometimes never comes. Crisis week is a trading overlay, not a macro switch. 9 tests. |
| Rumors (about 3 a game week, 55% true) | Done | c4d02d6, universe.ts | `rumorProb 0.32`, `rumorAccuracy 0.55`. |
| Insider tips from crime into the court | Not built | none | No code found on v1. |
| Rival funds as pool slices (Hale, Pinn, Vetch) | Done | bf9d1cd, 1317d60 | Each trade is a pro-rata slice of its pool's flow, so nothing is double counted. Prices are bit-identical with rivals on and off (tested). |
| 24 NPC personas trading as pool slices | Not built | none | The 24 personas in `src/world` keep their own state. Their trading does not go through pool slices yet. |
| Evolving universe (IPO, bankruptcy, cash merger, spin-off) | Done in engine | 13e2414, 9233638 | Rolled once a game day at most. The client store still uses a static `universeConfig()`; the merge is Phase 2. |
| Crypto to about 30 tokens | Done | c4d02d6 | 30 crypto, including 2 stablecoins (depeg risk), 7 alts, 6 memecoins that bleed between hype waves. |
| Seasonal commodities (learnable) | Done | c4d02d6 | Deterministic yearly value cycle for gas, power, wheat, coffee, oil. |
| Index-reshuffle days via the pension pool | Not built | none | The pension pool exists in `ecology.ts`, but no reshuffle day was found. |
| Public aggregate short interest and squeezes | Partial | e7dfa6e | Short interest is published per stock, only when shorts are spread (5 or more holders, none above 40%), otherwise null. No squeeze mechanic was found; "squeeze" appears only in news copy. Broker surface is Phase 2. |
| Order depth by pool type | Done | ec7f973 | `depthByPool`, closed days only. The player's own flow is not in this view. |
| `explainMove(state, assetId, fromDay, toDay)` | Done | 1a0f2ee | Closed days only. Pool-type rows and You / Players rows, with the Players fold applied per day before summing. Rows sum to the total exactly. 9 tests. |
| `explainTrade` | Deferred | none | Phase 3, with the trade journal. |

## 3. Measured gates

### 3a. World events (34b9d06)
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

### 3f. Rivals (1317d60, 430453b): 60 seeds x 5 game years, tpd 24
| Rival | Median multiple | Beats GX buy-and-hold | Band | Result |
|---|---|---|---|---|
| Hale & Ward (value) | x2.057 | 83% | median in [0.4, 2.5]; beat share at most 70% | FAIL (beat share) |
| Pinn Partners (momentum) | x0.538 | 22% | same | PASS |
| Vetch (crypto) | x0.186 | 10% | same | FAIL (median below 0.4) |

Lead decision: keep the rivals as they are. They are pool slices and cannot move prices. Players see them only in Phase 6. The failures are recorded here, not tuned away. Before 1317d60 the same harness gave Hale x3.18 (88%), Pinn x0.57 and Vetch x0.026.

### 3g. Bonds and bands (149bcec)
- Bare engine: 25 bands checked, 0 FAIL. Per-seed stats match 9233638 exactly, except timing.
- Universe, 20 seeds x 5 years, tpd 24: 183 vol-ratio bands, 175 PASS, 8 FAIL (see F1).
- Bond vol ratios all PASS: AV2Y 1.167, AV10 1.165, AV30 1.187, IGCB 1.196, HYLD 1.032. Change: AV10 and AV30 def.vol 5.5% and 11.5% (was 4% and 7%), government funds have no jump term.
- Band changes (for Ledger review): stablecoins AUSD and FLUX get a 0.5-day half-life, so their bands use the reverted vol; meme coins BONK, FROG, MOON, HAMR, CATZ, WOOF, GIGA get a floor-pinning band (min 0.8 x sqrt(median alive share)). Unmeasured bands were not changed.
- Rejected in review: newsPrint 0.7 for the universe (unmeasured, reverted to 0.5).

### 3h. Ecology gates (b61e134): 8 seeds, mean and s.e. Not the 60-seed release gate.
Bare catalog, FULL, tpd 720, 1,260 days: 6 of 7 PASS. Excess kurtosis 5.83, corr(|r|,|r-1|) 0.217, daily autocorr 0.031, 1-day rank IC -0.010, 63 to 21 day rank IC 0.023, corr(|r|, dayNotional) 0.498 all PASS. Shadow: 5 of 6. Live: 6 of 7.

Vol ratio FAIL in the bare run: 0.843 to 1.028, median 0.930. The band is [0.85, 1.4]; GOLD at 0.843 is the lowest.

Universe, FULL, tpd 24 (not the calibrated 720): 4 of 7 PASS. Daily autocorr 0.0521 FAIL, 1-day rank IC 0.0139 FAIL, vol ratio FAIL (0.388 to 3.187, 19 assets outside). Live: 3 of 7 PASS.

Learnability (ecology off, bare catalog, 60 seeds, 5 years, tpd 24, $5k): value_gap beats buy-and-hold 0.450 (27 of 60) PASS in [0.40, 0.60]. Median Sharpe edge -0.151 PASS. Regime split PASS (expansion 0.203, overheating 0.479, contraction 0.787, recovery 0.302). Matches the Ledger print.

Crowd hunt (value_gap, $25M single, 10 seeds, ecology off): crowded periods 0.361; crowded beat 0.200 against uncrowded 0.400: PASS.

Not evaluated: crowded beat share at $5k; stacked at most 0.70 and fingerprint; N=50 crowd at $250k.

### 3i. Hunts (db480a0; a400727 superseded)
- 60 seeds: all 14 bands PASS. value_gap_halflife 1.080; value_gap_p95 0.048 (regression guard, see F11); earnings_surprise_ic 0.175 over 8,366 reports; news_drift_beats_bh_share 0.55 (33 of 60).
- Ladder: profitable share 0.43, median still negative. Pump and dump: raw P&L positive on 32 to 42% of seeds, means negative.
- X1 self-impact, 20 seeds: one-clip close lift at most 0 on 3 of 20 SYN and 4 of 20 AURH seeds. Intraday-peak gate on tape-01 to tape-05 (see F6).
- X3 huge money, tape-01, full universe, one game year: $1e12 mid 2.54e20, liquidation equity -6.68e25, realize to flat from year end -80% of start (flat on day 9). $1e15 mid 1.18e34, liquidation -4.04e45, realize to flat +2.7% of start (flat on day 70). Realized proceeds are 8e-10 and 9e-20 of the mid mark. Peak does not lift at $1e12. At $1e15 it lifts 0.4% to 1.0040e15, and selling down from that tick returns 1.0123e15, so the lift is backed by proceeds.
- The a400727 realize table (28 days, -83%) does not reproduce. The db480a0 table replaces it. The reproducing code is `scripts/balance/huge-money.ts`.

### 3j. Load (4,000 players, 120 ticks, in-process)
Command: `npx tsx scripts/load/world-load.ts 4000 120`. Output: `scratchpad/load-4000.txt` (session only).

| Measure | p50 | p99 | Max |
|---|---|---|---|
| Setup of 4,000 players | 7.3 s (once) | | |
| stepGame | 15 ms | 71 ms | 635 ms |
| Per-player views and frame | 107 ms | 147 ms | |
| Tick total | not printed | 188 ms | |

Gate: tick p99 under 2,500 ms: PASS. The script prints p99 for the tick total only; p50 and p95 of the total are not in the output.
Not run in this pass: `scripts/load/socket-load.mjs` (4,000 live WebSocket clients). Last measured in b402371, before the Phase 1 engine work.

### 3k. Calibration closure (F1, F2, F11, F12; branch p1/calib)
Engine changes, all in the GARCH input and the expectation, none in the price path. Bare catalog (jumpImmediate 1, no catalysts) changes only through the regime loading split.
- `sim.ts` `dayGap`: the GARCH day return now excludes the unprinted part of each jump and the post-earnings drift. Bare: no effect (jumpImmediate 1).
- `sim.ts` + `config.ts` `regimeShockSd`: GARCH standardizes by volMult times the regime's full shock sd (marketLoadMult, idioMult). Bare: this is the one change to bare dynamics.
- `ecology.ts` `closePrint` and `expectedVol(def, undefined, print)`: the close-to-close target counts the printed share of jumps. Bare: 1, unchanged.
- Test: `src/engine/calibration.test.ts` (5 tests; a jump-only asset realizes 0.49 of its jump variance live, the printed share squared).

| Measure | HEAD | p1/calib |
|---|---|---|
| Universe vol bands, 20 seeds, tpd 24 (8 F1 names) | 0.811 to 0.847 (FAIL) | 0.924 to 1.011 (PASS) |
| Universe, all bands, 20 seeds | 8 FAIL | all PASS (AUSD class band now 0.6 to 0.9, F13) |
| Bare vol bands, 60 seeds | all PASS | all PASS (per-asset medians move by up to 0.08, both ways) |
| Bare bh_beats_momentum_share, 60 seeds | 0.933 FAIL | 0.933 FAIL (F15, pre-existing) |
| Bare value_gap_p95 median / max, 60 seeds | 0.0479 / 0.623 | 0.0485 / 0.862 FAIL (F14) |
| Universe gates, 720 ticks, 4 seeds | 4 of 7 PASS | 5 of 7 PASS (vol ratio now PASS; 1-day and 63-day IC FAIL, F2) |
| Bare gates, 720 ticks, 8 seeds | 6 of 7 PASS (GOLD vol 0.843) | 7 of 7 PASS (GARCH h mean 1.005, was 1.085) |
| Crowd gate, 100 x $250k bots, 60 seeds, bare live | not run | crowded beat 0.367 vs uncrowded 0.433: PASS (F12) |

## 4. Known failures and open decisions

Owners are proposed by domain: Quant (engine and calibration), Ledger (gate scope, pricing and spec decisions), Tape (hunts, measurement), Forge (integration, ports, load). The lead assigns them.

| ID | Item | Measured root cause | Proposed owner | Status |
|---|---|---|---|---|
| F1 | Vol bands FAIL on 8 universe assets at 20 seeds: NGAS, LITH, COFF (0.844 to 0.846), NHK, MRE, KYN (0.813 to 0.847), GNOM, NRVA (0.811, 0.834) | **Fixed in the model (p1/calib).** Three mechanisms, each measured in isolation. (1) GARCH input carried the unprinted 30% of each jump (dayGap); with alpha+beta 0.98 that moves E[h] to 1.3 to 1.5 on jump-heavy names. (2) GARCH standardized by volMult only, not the loading split (regimeShockSd); idio-heavy names had E[h] 0.8 to 0.9. (3) expectedVol counted the full jump; the close prints jumpImmediate 0.7 live and newsPrint 0.5 in full ecology (closePrint). Jump-only isolation test: realized/expected 0.49 live. 20 seeds now (final run): all eight in [0.92, 1.01] (NHK 0.924 lowest, MRE 1.011 highest). | Quant | Fixed; side effect F14 |
| F2 | Universe ecology gates at tpd 24: daily autocorr 0.052, 1-day rank IC 0.014 (both FAIL); vol ratio 0.388 to 3.187 at 8 seeds | Measured at 720 ticks, 4 seeds (eco-01..04). Autocorr is tick-sensitive: 0.036 at 720 (PASS) against 0.052 at 24. Vol ratio is fixed (F1): all in band, median 1.055. Still FAIL at 720: 1-day rank IC +0.015 (band -0.05 to 0) and 63-day rank IC +0.045 (band 0 to 0.04). Both are tick-insensitive (same sign and size at 24 and 720). fadeK 0.3 brings the 1-day IC to -0.011 but takes universe bh_beats_contrarian to 0.95 (FAIL, 20 seeds), so it is not adopted. The 63-day cause is not measured (hypothesis: universe half-lives 30-60 days against 20 in the bare catalog). Bare catalog at 720, 8 seeds: 7 of 7 PASS (was 6 of 7; GOLD vol ratio 0.843). | Quant | Open (1-day IC and 63-day IC) |
| F3 | Hale beat share 83% against 70% | Equal-weight 3-stock baskets, rebalanced on this schedule, beat GX buy-and-hold on 85% of seeds at random (control in 1317d60). The failure is basket construction against a cap-weighted benchmark, not the value read. | Ledger with Quant (spec decision on basket rule or benchmark) | Open; lead decided to record, not change |
| F4 | Vetch median x0.186 (below 0.4) | Top-3 crypto basket bleeds with the memecoins. | Quant (quant-npc-funds spec) | Open |
| F5 | AURH full-ecology peak ratio 2.74 on tape-10 (band 0.75 to 1.5, 20 seeds) | Not analysed. The game-path gate covers tape-01 to tape-05 only. | Ledger (gate scope), Quant | Open |
| F6 | Self-impact game-path gate moved from close ratio to intraday peak ratio | Closing auction reverts impact: the one-clip close lift is at most 0 on 3 of 20 SYN and 4 of 20 AURH seeds. Disclosed in db480a0. Ledger's 0.997 close-ratio sign-off is no longer tested on the game path. | Ledger (decision) | Open |
| F7 | Liquidation equity is negative at year end ($1e12: -6.7e25; $1e15: -4.0e45) | Liquidation equity has no floor at zero. Selling down returns -80% and +2.7%, so it is not a sell-down value either. | Ledger (pricing decision) | Open |
| F8 | Close response to own flow not bounded by the shared tally | Ecology close is Y x sigma(h) x sqrt(own ADV) / depth, with own flow not damped by capacity; depth floor 0.4. FROG day 137: +5.88 log, own flow 5.83, vol state h 6.4. | Quant | Open |
| F9 | Rank below the 5e10 threshold not measured | At huge sizes rank is top tier from the start, so it is not fooled there. | Tape | Open |
| F10 | Realize-to-flat depends on the sell schedule | Only the even daily split (3 ADV per tick cap) was measured. | Tape | Open |
| F11 | value_gap_p95 baseline is self-referential | **Done (p1/calib).** Baseline is the 60-seed median on the calibrated engine: 0.0485 (was 0.0484 from 20 seeds). The HEAD engine gives 0.0479. | Tape | Fixed |
| F12 | Learnability and crowd-hunt rows not evaluated | **Crowd gate run, 60 seeds, bare catalog, live.** 100 x $250k bots: crowded periods on 45% of seeds, crowded beat 0.367 against uncrowded 0.433: PASS (< 0.55 and <= uncrowded - 0.05). Single $25M: 0.367 against 0.450: PASS. Single $250k: no crowded period, NOT EVALUATED. Stacked row: crowd-hunt.ts has no stacked-signal mode, not run. Learnability and fingerprint rows not run in this pass. | Ledger, Tape | Partly done |
| F13 | Band changes for stablecoins and meme coins (149bcec) | The bands follow the mechanism (half-life reversion, floor pinning) and were not measured before the change. **Changed in p1/calib (Ledger review):** AUSD band 0.25 to 0.45 becomes 0.6 to 0.9 (measured 0.80, 20 seeds: the depeg close prints about 0.4 of a jump, against 0.5 assumed by closePrint). FLUX class band removed: under closePrint it is 1.02, inside the general band. Floor-pinned memes unchanged. | Ledger (review) | Open (review) |
| F14 | value_gap_p95_max (X2, never above ln 2) now FAILS on the bare engine at 60 seeds: 0.862 (SYN, tape-04); HEAD 0.623 | Caused by F1 fix (regimeShockSd). SYN has wCrypto 0.6, which is not regime-scaled, so (by the GARCH identity, not measured per asset) E[h] moves toward 1, its realized vol from 0.98 to 1.03 of expectedVol, and its value-gap p95 median from 0.387 to 0.452 (60 seeds). Two of 60 SYN seeds are above ln 2. Not widened. Options for Ledger: accept the tail for a 110% vol asset, or change SYN's half-life or spec. | Ledger (decision), Quant | Open |
| F15 | Bare bh_beats_momentum_share 0.933 at 60 seeds (band 0.1 to 0.9) | Already FAILS at HEAD (0.933 at 60 seeds; 0.900 at 20 seeds, which is why the 20-seed run passed). Unchanged by this pass. | Tape, Ledger | Open (pre-existing) |

Claimed fixed in db480a0, not re-reviewed in this pass: the hunts review items (reproducibility, peak wording, sign-flip counts, self-impact gate disclosure, 60-seed run). The a400727 numbers that the review could not reproduce are replaced by the db480a0 table.

## 5. Deviations from the plan

- Universe is 183 assets, not 155 (see section 1).
- Staging tests: 11 of 14 ported under their names; 3 retired (51a942c).
- No regenerated ecology fingerprint fixture (section 2, item 5).
- Staging's sim mode is full mode only in V1; there are no legacy saves to migrate.
- The alt-peak guard is implemented in the form of e5d7ea4 (section 2, item 3).

## 6. Items from Phase 1 with no code

These are in the approved Phase 1 list and have no commit on v1. The lead should either assign them or move them to a later phase:
- Index-reshuffle days via the pension pool.
- Squeeze mechanic (only the public short-interest data exists).
- Insider tips from crime into the court.
- The 24 NPC personas' trading as pool slices.

## 7. Deferred to later phases

| Item | Phase | Reason |
|---|---|---|
| Client store merge of runtime listings | 2 | The client `universeConfig()` is static; the engine appends listings at runtime (13e2414). |
| Broker surface for public short interest | 2 | e7dfa6e is engine-level only. |
| `explainTrade` | 3 | Follows the trade journal (1a0f2ee). |
| Market and sector split of the waterfall | 3 | Needs a decomposition step; the engine does not log factor shocks. |
| Research-desk hunts (`explain_move_rejects_open_day`, `window_diff_no_isolate`, `desk_below_r3_absent`) | 3 | Part of the research desk. |
| Rivals board and rival attacks | 6 | Per the plan. |

## 8. Commits

- Branch merges into `v1` (no-ff): `c7491f3` (p1/gates), `178601a` (p1/rivals), `5b194eb` (p1/bonds), `a4b021e` (p1/hunts).
- Branch heads merged: `b61e134` (gates), `1317d60` (rivals), `149bcec` (bonds), `db480a0` (hunts, on top of `a400727`).
- P1 commits already on v1 before this merge: 593923c (P1.1), e5d7ea4 (P1.2-3), 6dbfc1d (P1.4), 7fb620c (P1.5), c4d02d6 and 34b9d06 (P1.6a, P1.6b), 51a942c, e7dfa6e, 1a0f2ee, bf9d1cd, ec7f973, 13e2414 and 430453b (P1.6c, P1.7), 9233638 (P1.7 harness).
