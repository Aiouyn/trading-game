# V1 Phase 9

Status of Phase 9 on the tech fork (`v1`). Track 9C (load and calibration residuals) is recorded here; tracks 9A, 9B and 9D add their own sections.

## 9C. Load and calibration residuals

Worktree `.claude/worktrees/p9-c`, branch `p9/c`. Binding spec: `docs/team/specs/lead-phase9.md`, track 9C and ruling R-9-8 (the load gate at the production tick).

Commits: `6b378a0` (load: backlog, connect ramp, retry), `f127566` (O-12 sector factor), `149c760` (O-2 wiring and first probe, advanceTo path), `60bc0be` (first 9C record), `4803ec2` (O-2 on the engine path, review repairs: AUSD verdict, load exit gate, rho test, determinism test).

| Item | Verdict |
|---|---|
| 9C.1 Load, R-9-8 (5 s tick, 4,000 clients, 3 repeats) | All 4,000 welcomed in 3 of 3 repeats. Tick p99: **FAIL** on tick spacing (5.03 to 5.05 s); **PASS** on fan-out time per tick (0.96 to 1.00 s). Which metric R-9-8 means is a lead decision (9C.1). |
| 9C.2 O-2 residual rho, engine path, 200 seeds | **FAIL**: median 0.5955 (gate <= 0.15), p90 0.9281 (gate <= 0.25). |
| 9C.3 O-12 sector shock from the engine's factor | Done (see 9C.3). |
| 9C.4 AUSD stablecoin band | **UNDECIDED** at 2 s.e. under the class band applied by ruling. Not a pass. |

### 9C.1 Load: 4,000 clients, all welcomed, tick p99 under 2.5 s (R-9-8)

**Gate under R-9-8.** Production tick (`TICK_MS=5000`, the game's real-time tick period), three repeats, 4,000 clients with the default connect ramp (200 per 250 ms, retry until welcome), a 60 s measured window. One 1 s-tick run is reported beside them as a stress run, not gated. Script: `scripts/load/socket-load.mjs` through `run-load-r89.sh` (scratch, not committed). Each run starts a fresh world server from this worktree on port 8919 with an empty data folder.

**Machine and load.** Windows 11 Pro, 16 logical CPUs, 32 GB RAM. The four rho probes (9C.2) had finished at 23:01:27 and the load driver started at 23:01:36; no other test load ran during the load runs. The full vitest run started after the last of them.

| Run | Server tick | Clients | Welcomed | Connect settle after ramp | Refused attempts | Fan-out per tick p50 / p99 | Tick spacing p50 / p99 (max; gaps) | Welcome all | Fan-out p99 < 2.5 s | Spacing p99 < 2.5 s |
|---|---|---|---|---|---|---|---|---|---|---|
| R-9-8 repeat 1 | 5,000 ms | 4,000 | 4,000 | 4.8 s | 4,231 | 940 / 966 ms | 4,995 / 5,046 ms (5,046; 11) | yes | yes | no |
| R-9-8 repeat 2 | 5,000 ms | 4,000 | 4,000 | 5.3 s | 3,763 | 896 / 957 ms | 5,001 / 5,027 ms (5,027; 11) | yes | yes | no |
| R-9-8 repeat 3 | 5,000 ms | 4,000 | 4,000 | 5.1 s | 3,481 | 907 / 998 ms | 4,999 / 5,026 ms (5,026; 11) | yes | yes | no |
| Stress (not gated) | 1,000 ms | 4,000 | 4,000 | 35.1 s | 7,600 | 993 / 5,169 ms | 1,014 / 5,441 ms (5,441; 54) | yes | no | no |

Each run registered the 4,000 accounts in 6.2 to 6.6 s before the connect ramp. "Refused attempts" is the client's connection retries (each followed by a backoff, as in `src/net/client.ts`). Tick spacing p99 with 11 gaps is effectively the largest gap, so the spacing figures are coarse.

**The gate metric is a lead decision.** R-9-8 says "tick p99 < 2.5 s". A 5 s tick is spaced about 5 s by construction, so read as tick spacing (the metric `socket-load.mjs` gates on, and which the script's exit code uses) it cannot pass at the production tick: all three repeats fail on it. Read as fan-out time per tick (first to last client receiving the tick), it passes three times, with a p99 of 0.96 to 1.00 s. This track did not change the gate to make either reading pass; both metrics are recorded above. The script still exits 1 on spacing, so each repeat's EXIT is 1. The lead must say which metric the gate is.

**The 1 s stress run does not reproduce the earlier 1 s result.** The 9C.1 gate run of the previous record (1 s tick, 30 s window, 4,000 clients) gave a spacing p99 of 1,749 ms. This stress run (1 s tick, 60 s window, a fresh server) gave a fan-out p99 of 5,169 ms and a spacing p99 of 5,441 ms. The cause is not isolated. Under the R-9-8 ruling the 1 s tick is a stress configuration, so the earlier "gate met at 1 s" statement is superseded and is not a claim of this record.

**Changes (commit `6b378a0`, unchanged here):** `server/index.ts` takes `LISTEN_BACKLOG` (default 4096, logged at listen). The explicit backlog does not raise the Windows accept queue (about 232 pending connects in a bare-listener test), so the connect-storm refusals are absorbed by client retries, which the script now does with the real client's backoff. `socket-load.mjs` takes `RAMP=batch/ms`, retries until welcome, waits up to 240 s for every client, resets its counters at the start of the measured window, and (this record) exits 1 unless every client welcomed and the tick spacing p99 is under 2,500 ms.

### 9C.2 O-2: the residual surprise s and the rho gate (engine path)

**Wiring (done).** A filing of a company with a consensus carries its residual surprise (`FilingPublic.surprise = { s, d, margin }`, optional):

- the actuals (`revenue`, `ocf`, `backlogContribution`) against the consensus snapshotted at the close (`pendingFile.consensus`), over `D = max(EV_20, 0.25 mcap_20)`;
- a pending filing saved before O-2 has no snapshot and carries no surprise (it does not read the next quarter's `c.consensus`); a private company's snapshot is null and carries none;
- `consensus.ocf` is the annualized E* read scaled to the quarter (`eStar * 63 / 252`), a proxy: the consensus carries OCF only through E*;
- `mcap_20` is the mean of the 20 closed bars of the engine (`bridge.ts` `mcap20`, the engine's bars times shares out), falling back to the filed fair value with no bars. **Known defect (not corrected, see below):** the window is `slice(len - lag - 20, len - lag)`, which ends one bar before the close instead of at it.

**The engine path (O-2 review repair, commit `4803ec2`).** `rhoOfListedSeed` (`src/world/company/rho.ts`, used by `scripts/balance/rho-probe.ts`) runs each seed on the engine path: the IPO orders, then `listedWorld(seed, { engine: true })` and `stepEngineTo` step every tick with `stepGame` (the engine's matching and day-boundary bars, the company step and day, the sector factor of 9C.3). No bot trades the listed stock; the rest of the world is the fixture's. Before this repair the probe advanced by day without engine ticks, so a listed asset had no bars; the 149c760 result below is that earlier path.

**The probe.** `rho = sd(s_filing) / sd(s_quarter)` over the 7 pairs of 8 post-listing quarters, where `s_quarter` is the same expression with the consensus replaced by the previous quarter's filed actuals, over the same D. Gate (Quant 6.2 (c)): median <= 0.15 and p90 <= 0.25 across seeds.

**Result: FAIL.** 200 seeds (seeds `rho-1` to `rho-200`, four processes of 50 with `--first 1, 51, 101, 151`), one sector (`tech`), 8 quarters each, on the engine path. The probes ran the code of commit `4803ec2` (the only later change is to `rho.test.ts`). Logs and JSON: scratch `p9/rho-engine/`; the aggregation is `p9/rho-agg9c.mjs`.

| Measure | Value | Gate |
|---|---|---|
| Median rho (200 seeds, floor index) | **0.5955** | <= 0.15 **FAIL** |
| p90 rho | **0.9281** | <= 0.25 **FAIL** |
| p95 rho | 1.1051 | reported |
| Mean, min, max | 0.6312, 0.1640, 1.6715 | |
| Seeds with rho <= 0.15 | 0 of 200 | |
| Seeds with rho <= 0.25 | 5 of 200 (2.5%) | |
| Non-finite s or rho | 0 | must be 0 |
| Per-process medians (50 seeds each) | 0.6005, 0.5691, 0.5877, 0.6237 | |

The earlier 200-seed run on the advanceTo path (commit `149c760`: median 0.595, p90 0.936) is numerically the same, so the engine ticks do not move the residual rho in this configuration. That run is superseded as the record, but it confirms the result. The gate is not met, and the band was not loosened.

**Source of the residual: a hypothesis, not isolated.** The OCF term is the likely largest source (its consensus is the E* proxy, which lags a quarter in which revenue falls). This was not measured; a decomposition needs the per-term rows in `rho.json`, which were recorded, and a targeted run, which was not done.

**Defect found in review, not corrected.** `bridge.ts` `mcap20` ends the window one bar before the close (see the wiring note). Correcting it changes `D` and the probe numbers, so it needs the 200-seed run repeated; that is a follow-up, not made here. Its effect on rho is not measured.

**Test status.** `src/world/company/rho.test.ts` (commit `4803ec2`): the wiring is tested directly (a listed filing's `s` equals `valuation.surprise` on the closing snapshot, finite and with a positive D; a private company's filings carry no surprise; a pre-O-2 pending filing carries none). On the engine path the listed asset books bars (the engine keeps the last 30, `BARS_KEPT`). `rho_residual` runs over 3 seeds on the engine path: its probe-is-finite check is a plain test and passes; its gate assertion is an expected failure (`it.fails`) that turns red when the band is met, and then becomes a plain test. This is the measured FAIL above; the expected-failure note cites 9C.2.

**Not run.** The six-sector sweep (`rho_engine` of the Quant probe; this covers one sector), `rho_ev_robust` and `rho_by_spread` (the `fx_close_payout` twin and the spread-bucket fixtures are not built), `alt_prefiling_edge` and `signal_joint_v15` (the bot harnesses are not in this worktree).

### 9C.3 O-12: the company sector shock is the engine's sector factor

**Done (commit `f127566`).** A company sector's level moves each day by the engine's sector factor return: the sum of the engine's per-tick sector draws over the day, on the G22 unit reading `F_s = sum z * sqrt(dt)`, `dt = 1 / (ticksPerDay * daysPerYear)`. The company's own stream (`co:sector:*`) is gone.

- There is no second stream. Each company sector holds a cursor: the engine's sector state and tick at the last company day (`src/world/company/sectorFactor.ts`). The factor is the engine's own draws replayed with the same `Rng` calls as `sim.ts` (`new Rng(state)`, one `normal()`, `state()`), and the replay must land on the engine's current state, or the day throws. No engine change: the engine's fingerprints do not move.
- Founding takes the engine's sector state as the cursor. A save from before O-12 is migrated (`bridge.ts` `migrateAll`) to the engine state at its tick.
- Worlds without player companies never run `companyDay` (the company world is created by founding), so their fingerprints do not move. The engine fingerprint suites (`src/engine/calibration.test.ts`, `ecology.test.ts`, `src/world/funds/property.test.ts`) pass unchanged.
- `scripts/balance/company-calibrate.ts` uses `seedSectorSource`, the engine's sector streams for the seed at the release rate (720 ticks a day).
- The company constant `sectorShockScale` is removed (`src/content/company.ts`); the comment in its place points here.

**Tests.** No test asserted a numeric value of the old stream, so no assertion was changed. Fixtures that moved the clock without drawing the engine's sector streams (`b1fixture.ts`, `backstop.test.ts`, `insiders.test.ts`, and the trade ticks of `exploits/sequences.ts`) now draw them through `jumpEngineTicks`. A test that revisits an earlier day (the tape window tests) moves the clock back: `advanceTo` re-anchors the cursors there (`reanchorSectors`). The server never rewinds. `sectorFactor.test.ts` (9 tests): the replay equals the engine's state after N steps; `jumpEngineTicks` equals `stepMany`; a day's factor is the engine's and the cursor lands on the engine; a foreign stream is refused; a cursor ahead of the clock is refused; the day factor has unit variance per year (6,000 days, within 15%); the no-engine source starts at tick 0 on the seed streams; the real game loop (`stepGame` through two day boundaries with a founded company) keeps the cursors on the engine and moves a sector level; a world without companies is not moved by `companyDay`. `determinism.test.ts` (commit `4803ec2`): the same seed run twice on the engine path gives an identical company world, with the cursors at the engine's tick; a different seed differs.

**Runs.** Touched areas (`src/world/company` and `scripts/balance/bands.test.ts`) before the rho test fix: 58 files, 2 skipped, 55 files passed; 502 tests passed, 1 failed, 1 expected failure, 69 skipped, 20 todo. The one failure (`rho.test.ts`, the bars assertion asked for 60 bars, the engine keeps 30) was a test error, not an engine error; after the fix `rho.test.ts` alone passes (5 passed, 1 expected failure). The rest of the touched areas were not re-run after the fix, so the touched-area count is not claimed as a clean pass. **Full suite** (`npx vitest run --maxWorkers=3`, at `4803ec2` with the rho test fix, exit 0): 236 files passed, 2 skipped (238); 2,332 tests passed, 1 expected failure, 70 skipped, 20 todo (2,423).

### 9C.4 AUSD: the stablecoin volatility band at 300 seeds x 720 ticks

**Ruling: the stablecoin class band `[0.6, 1.1]` on the RMS ratio, applied to AUSD** (`scripts/balance/bands.ts`, `UNIVERSE_VOL_BANDS.AUSD`, with its mechanism written next to the number). The ruling follows the lead's rule for a band that still straddles. A ruling is a band, not a verdict: the verdict below is UNDECIDED.

**Run.** `scripts/balance/run.ts --universe --assets AUSD --seeds 50 --first K --tpd 720 --years 1` in six processes (K = 1, 51, 101, 151, 201, 251), 300 seeds in all, started 19:03, finished about 20:17. **Deviation:** one game year per seed, not the default five. A seed-year took about 82 s on this machine under load, so five years at 300 seeds would be about 34 CPU-hours; this was not run. The RMS and its standard error are combined over the six parts with the delta method `se = se(mean x²) / (2 RMS)` that `run.ts` uses.

| Measure | Value |
|---|---|
| Seeds | 300 |
| RMS of the AUSD vol ratio | **1.032** |
| Standard error (delta method) | 0.154 |
| 2 s.e. interval | **[0.725, 1.340]** |
| Median seed ratio | 0.070 |
| Seeds with ratio below 0.3 | 78% |
| Largest seed ratio | 9.23 (27% of the mean square; the RMS without it is 0.886) |
| Per-part RMS (50 seeds each), with s.e. | 0.524 ± 0.160; 1.122 ± 0.180; 1.584 ± 0.554; 0.910 ± 0.187; 0.783 ± 0.189; 0.954 ± 0.200 |

**Verdict (the verdict code is `bands.ts` `verdictOf`, PASS only when estimate ± 2 s.e. lies inside the band; `run.ts` lists UNDECIDED and does not count it as a failure).**
- Under the general band `[0.85, 1.4]`: the 2 s.e. interval straddles 0.85, so it is **UNDECIDED**.
- Under the class band `[0.6, 1.1]`: the point estimate 1.032 is inside, but the 2 s.e. interval straddles 1.1 (upper edge 1.340), so it is **UNDECIDED** as well. It is not a FAIL under either band and is not a PASS.

**Mechanism.** AUSD's variance is set by its rare depeg jumps (0.25 a year, down 6% on average). In 78% of the seeds the year has no depeg and the ratio sits on the no-jump shoulder, below 0.3. The seeds that depeg carry the RMS, which is why the per-part RMS ranges from 0.52 to 1.58. The 50-seed parts are noisy for this reason; a 5-year run would sample more depegs per seed, but this run does not do that.

**Not done.** FLUX, the other stablecoin (0.5 jumps a year, undecided at 8 seeds with 0.778), has no 300-seed run here and keeps the general band. The 5-year, 300-seed AUSD run is not done (cost above). A 2-s.e. verdict within the class band needs more depeg samples than 300 one-year seeds give.

### 9C. Not done

- Open lead decision: the metric of the R-9-8 tick gate (9C.1). Both readings are recorded; neither has been adopted as the gate.
- O-2 gate: not met (9C.2). The OCF term is a hypothesis that was not isolated; the `mcap_20` window is off by one bar (9C.2) and its fix needs the 200-seed probe repeated.
- The six-sector rho sweep, `rho_ev_robust`, `rho_by_spread`, `alt_prefiling_edge` and `signal_joint_v15` (9C.2).
- The 5-year AUSD run at 300 seeds and the FLUX run (9C.4).
- The 1 s stress run's spacing (5.4 s p99) does not match the earlier 1 s gate run (1.75 s p99); not isolated (9C.1).
