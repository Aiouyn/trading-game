# V1 Phase 9

Status of Phase 9 on the tech fork (`v1`). Track 9C (load and calibration residuals) is recorded here; tracks 9A, 9B and 9D add their own sections.

## 9C. Load and calibration residuals

Worktree `.claude/worktrees/p9-c`, branch `p9/c`. Binding spec: `docs/team/specs/lead-phase9.md`, track 9C.

### 9C.1 Load: 4,000 clients, all connect, tick p99 under 2.5 s

**Verdict: PASS.** At the gate configuration (world tick 1,000 ms, 4,000 clients, 30 s measured window), all 4,000 clients welcomed and the tick spacing p99 was 1,749 ms (p50 1,473 ms). The connect phase took 100.8 s and 11,504 refused attempts.

**Machine and load.** Windows 11 Pro, 16 logical CPUs, 32 GB RAM. Before the gate run: CPU load 10%, 10.7 GB free, no other test load (the AUSD check of 9C.4 started after the load runs). Node v22.13.1, the world server from this worktree at `6b378a0`, `REGISTER_LIMIT=100000`, `WARMUP_DAYS=1`, port 8919. Each run started from an empty data folder.

**Runs** (all `scripts/load/socket-load.mjs http://localhost:8919 4000 30`):

| Run | Server tick | Connect ramp, retries | Welcomed | Refused attempts | Window tick spacing p50 / p99 |
|---|---|---|---|---|---|
| Baseline (commit before 6b378a0) | 1,000 ms | burst 200 per 100 ms, 6 retries | 2,890 of 4,000 | 12,316 | 1,002 / 1,277 ms (window from first connect) |
| Backlog 4096 explicit, ramp 200/250 | 1,000 ms | 200 per 250 ms, 6 retries | 3,223 | 10,718 | 1,031 / 1,307 ms (from first connect) |
| Ramp 100/500 | 1,000 ms | 100 per 500 ms, 6 retries | 2,552 | 11,159 | 1,060 / 1,369 ms (from first connect) |
| Ramp 50/500 | 1,000 ms | 50 per 500 ms, 6 retries | 2,864; 1,136 gave up | 9,374 | 1,225 / 3,352 ms (from first connect) |
| Diagnostic: production tick | 5,000 ms | 200 per 250 ms, 6 retries | 4,000 in 7.8 s | 5,910 | 4,995 / 5,115 ms (a 5 s tick, not the gate config) |
| **Gate** | **1,000 ms** | **200 per 250 ms, retry until welcome (backoff 500 ms doubling, cap 15 s)** | **4,000 in 100.8 s** | **11,504** | **1,473 / 1,749 ms** (fan-out p50 1,470, p99 1,731 ms) |

The first gate attempt (settle capped at 240 s, counters not reset) reported a p99 of 7.4 s, but that figure included the connect period, when the loop was overloaded. The script now resets its tick counters when the measured window starts; the table uses only the reset numbers.

**Diagnosis.** Three findings.

1. *The accept queue on this Windows host holds about 232 pending connects, whatever the backlog.* A bare Node listener in one process took a burst of 4,000 connects: with backlog 4096, 232 succeeded and 3,768 were refused; with backlog 200, the same 232 succeeded. A burst of 1,000 gave 232 and 768. (This test ran client and server in one process, so the server could not accept during the burst; it measures the OS queue, not the server.) The explicit backlog is therefore kept and logged (`LISTEN_BACKLOG`, default 4096), but on Windows it does not raise the queue.
2. *At a 1 s tick the loop has no free time to accept.* The server log showed the slow ticks growing from 511 ms to 1,378 ms as the clients connected. At 4,000 clients a tick's fan-out takes about 1.1 to 1.5 s, so the loop is almost never free, the queue overflows, and surplus connects are refused. At the production 5 s tick the same 4,000 clients connect in 7.8 s with no wait.
3. *The pacing of the ramp alone does not fix it.* A slower ramp (100 or 50 per 500 ms) still left clients refused, because the loop does not drain the queue while it is saturated. The client has to retry: the real client (`src/net/client.ts`) reconnects forever with backoff capped at 15 s, and the script now does the same. Six retries (about 31 s) were not enough at this load.

**Changes** (commit `6b378a0`): `server/index.ts` takes `LISTEN_BACKLOG` (default 4096, logged at listen); `scripts/load/socket-load.mjs` takes `RAMP=batch/ms` (default 200/250), retries until welcome with the real client's backoff, waits for every client to welcome (at most 240 s), and resets its counters at the start of the measured window.

**Not done.** The gate is met at the 1 s tick with a patient client. Connection without retries at this load is not achievable on this host. Whether the 1 s tick at 4,000 clients should be a supported configuration is a product question: at 5 s it is comfortable.

### 9C.2 O-2: the residual surprise s and the rho checks

**Wiring (done).** `valuation.surprise` had no caller. Now a filing of a company with a consensus carries its residual surprise (`FilingPublic.surprise = { s, d, margin }`, optional):

- the actuals (`revenue`, `ocf`, `backlogContribution`) against the consensus of the closing quarter, over `D = max(EV_20, 0.25 mcap_20)`;
- the consensus is snapshotted at the close (`pendingFile.consensus`). The close routine runs before the close-day signal, and the weekly signals in the lag before filing overwrite `c.consensus` with the next quarter's read. The first version of the wiring read that value; the implied consensus was near zero and seeds 1 and 2 gave rho 1.30 and 2.14. Reading the closing snapshot gave 0.68 and 0.58 on the same seeds.
- `consensus.ocf` is the annualized E* read scaled to the quarter (`eStar * 63 / 252`). The consensus carries OCF only through E*, so this is a proxy.
- `mcap_20` is the mean of the 20 closed bars ending at the close (`env.mcap20`, the engine's bars times shares out); with no bars it falls back to the filed fair value. A private company has no consensus and no surprise.

**The probe.** `scripts/balance/rho-probe.ts` (and `src/world/company/rho.ts`): for each seed, a listed company runs on the engine's own path (the `b1fixture` listing, real orders, the engine's ticks and the sector factor of 9C.3). `rho = sd(s_filing) / sd(s_quarter)` over 8 post-listing quarters, where `s_quarter` is the same expression with the consensus replaced by the previous quarter's filed actuals, over the same D. Gate (Quant 6.2 (c)): median <= 0.15 and p90 <= 0.25.

**Result: FAIL.** 200 seeds, one sector (`tech`), 8 quarters each, 4 processes of 50 seeds (`scripts/balance/rho-probe.ts --seeds 50 --first K`, commit `149c760`):

| Measure | Value | Gate |
|---|---|---|
| Median rho | **0.595** | <= 0.15 FAIL |
| p90 rho | **0.936** | <= 0.25 FAIL |
| p95 rho | 1.102 | reported |
| Mean, min, max | 0.620, 0.154, 1.670 | |
| Seeds with rho <= 0.15 | 0 of 200 | |
| Seeds with rho <= 0.25 | 6 of 200 (3%) | |
| Non-finite s or rho | 0 | must be 0 |
| Mean sd of s_filing, of s_quarter | 0.00531, 0.00940 | |
| Mean sd of the revenue term, OCF term, backlog term (of s_filing) | 0.00465, 0.00497, 0 | |

The revenue and OCF terms carry the surprise; the backlog term is zero in these runs. The OCF term is the likely largest source: its consensus is the TTM-based E* proxy, which lags a quarter in which revenue falls. This is a hypothesis, not a measured decomposition; it was not isolated. The gate is not met, and the band was not loosened.

**Test status.** `src/world/company/rho.test.ts`: the wiring is tested directly (a listed filing's `s` equals `valuation.surprise` on the closing snapshot, finite and with a positive D; a private company's filings carry no surprise). `rho_residual` runs as an expected failure over 3 seeds (`it.fails`): it is visible in the suite and turns red when the band is met, so the expected failure must then be made a plain test.

**Not run.** `rho_engine` (the six-sector, 200 seed sweep of the Quant probe; the probe here covers one sector), `rho_ev_robust` and `rho_by_spread` (the `fx_close_payout` twin and the spread-bucket fixtures are not built), `alt_prefiling_edge` and `signal_joint_v15` (the bot harnesses are not in this worktree). Their rows in `exploits/blocked.test.ts`, `tape/wait-register.test.ts` and `tape/quant-v17.test.ts` name the state.

### 9C.3 O-12: the company sector shock is the engine's sector factor

**Done (commit `f127566`).** A company sector's level moves each day by the engine's sector factor return: the sum of the engine's per-tick sector draws over the day, on the G22 unit reading `F_s = sum z * sqrt(dt)`, `dt = 1 / (ticksPerDay * daysPerYear)`. The company's own stream (`co:sector:*`) is gone.

- There is no second stream. Each company sector holds a cursor: the engine's sector state and tick at the last company day (`src/world/company/sectorFactor.ts`). The factor is the engine's own draws replayed with the same `Rng` calls as `sim.ts` (`new Rng(state)`, one `normal()`, `state()`), and the replay must land on the engine's current state, or the day throws. No engine change: the engine's fingerprints do not move.
- Founding takes the engine's sector state as the cursor. A save from before O-12 is migrated (`bridge.ts` `migrateAll`) to the engine state at its tick.
- Worlds without player companies never run `companyDay` (the company world is created by founding), so their fingerprints do not move. The engine fingerprint suites (`src/engine/calibration.test.ts`, `ecology.test.ts`, `src/world/funds/property.test.ts`) pass unchanged.
- `scripts/balance/company-calibrate.ts` uses `seedSectorSource`, the engine's sector streams for the seed at the release rate (720 ticks a day).

**Tests.** No test asserted a numeric value of the old stream, so no assertion was changed. Fixtures that moved the clock without drawing the engine's sector streams (`b1fixture.ts`, `backstop.test.ts`, `insiders.test.ts`, and the trade ticks of `exploits/sequences.ts`) now draw them through `jumpEngineTicks`. A test that revisits an earlier day (the tape window tests) moves the clock back: `advanceTo` re-anchors the cursors there (`reanchorSectors`). The server never rewinds. `sectorFactor.test.ts` (9 tests): the replay equals the engine's state after N steps; `jumpEngineTicks` equals `stepMany`; a day's factor is the engine's and the cursor lands on the engine; a foreign stream is refused; a cursor ahead of the clock is refused; the day factor has unit variance per year (6,000 days, within 15%); the no-engine source starts at tick 0 on the seed streams; the real game loop (`stepGame` through two day boundaries with a founded company) keeps the cursors on the engine and moves a sector level; a world without companies is not moved by `companyDay`. The real-loop test matters because the load run founded no companies and the fixtures jump the clock, so neither exercises `step()` into a company day.

**Runs.** `src/world/company` (54 files) with the O-2 changes: 492 passed, 1 expected failure, 69 skipped (the existing skips), 20 todo. Company plus engine fingerprint suites: 56 files pass. **Full suite** (`npx vitest run --maxWorkers=3`, at `149c760`, before the real-loop test and the AUSD band): 234 files passed, 2 skipped; 2,322 tests passed, 1 expected failure, 70 skipped, 20 todo; exit 0.

### 9C.4 AUSD: the stablecoin volatility band at 300 seeds x 720 ticks

**Ruling: the stablecoin class band `[0.6, 1.1]` on the RMS ratio, applied to AUSD** (`scripts/balance/bands.ts`, `UNIVERSE_VOL_BANDS.AUSD`, with its mechanism written next to the number). The ruling follows the lead's rule for a band that still straddles.

**Run.** `scripts/balance/run.ts --universe --assets AUSD --seeds 50 --first K --tpd 720 --years 1` in six processes (K = 1, 51, 101, 151, 201, 251), 300 seeds in all, started 19:03, finished about 20:17. **Deviation:** one game year per seed, not the default five. A seed-year took about 82 s on this machine under load, so five years at 300 seeds would be about 34 CPU-hours; this was not run. The RMS and its standard error are combined over the six parts with the delta method `se = se(mean x²) / (2 RMS)` that `run.ts` uses.

| Measure | Value |
|---|---|
| Seeds | 300 |
| RMS of the AUSD vol ratio | **1.032** |
| Standard error (delta method) | 0.154 |
| 2 s.e. interval | **[0.725, 1.340]** |
| Median seed ratio | 0.070 |
| Seeds with ratio below 0.3 | 78% |
| Largest seed ratio | 9.23 |
| Per-part RMS (50 seeds each), with s.e. | 0.524 ± 0.160; 1.122 ± 0.180; 1.584 ± 0.554; 0.910 ± 0.187; 0.783 ± 0.189; 0.954 ± 0.200 |

**Verdict.**
- Under the general band `[0.85, 1.4]`: the 2 s.e. interval straddles 0.85, so it is **undecided**.
- Under the class band `[0.6, 1.1]`: the point estimate 1.032 is inside, but the 2 s.e. interval straddles 1.1 (upper edge 1.34), so it is also **undecided at 2 s.e.** It is not a FAIL under either band.

**Mechanism.** AUSD's variance is set by its rare depeg jumps (0.25 a year, down 6% on average). In 78% of the seeds the year has no depeg and the ratio sits on the no-jump shoulder, below 0.3. The seeds that depeg carry the RMS, which is why the per-part RMS ranges from 0.52 to 1.58. The 50-seed parts are noisy for this reason; a 5-year run would sample more depegs per seed, but this run does not do that.

**Not done.** FLUX, the other stablecoin (0.5 jumps a year, undecided at 8 seeds with 0.778), has no 300-seed run here and keeps the general band. The 5-year, 300-seed AUSD run is not done (cost above). A 2-s.e. verdict within the class band needs more depeg samples than 300 one-year seeds give.

### 9C. Not done

- The six-sector rho sweep (`rho_engine`), `rho_ev_robust`, `rho_by_spread`, `alt_prefiling_edge` and `signal_joint_v15` (see 9C.2).
- The 5-year AUSD run at 300 seeds (see 9C.4): at about 82 s per seed-year on this machine it would take about 34 CPU-hours.
- The load gate at a 5 s tick is a diagnostic, not the gate (9C.1). The 1 s tick is the gate configuration.
