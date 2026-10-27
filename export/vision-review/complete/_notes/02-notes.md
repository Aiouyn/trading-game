# 02-notes: Time, Engine Core and Determinism

## 1. Parameters
| key | default | range | unit | affects |
|---|---|---|---|---|
| PARAM.display_clock_offset_min | 360 | 0–1,439 | game minutes | cosmetic "ET" display clock (§3.1.2); never used in rules |
| PARAM.holiday_fx_depth_mult | 0.5 | 0.1–1.0 | multiplier | NPC FX liquidity depth on pairs that include a holiday bloc's currency (§3.2) |
| PARAM.entropy_commit_lead_ticks | 720 | 60–2,880 | ticks | how far ahead C(N) is published (§3.11.1) |
| PARAM.entropy_reveal_lag_ticks | 1,000 | 720–5,000 | ticks | when e(N) is revealed (§3.11.1) |
| PARAM.intent_max_age_ticks | 3 | 1–12 | ticks | REJECT_STALE threshold for clientTick (§3.12) |
| PARAM.seal_grace_ms | 150 | 50–500 | ms | wait for gateway closed markers; a late batch rolls to N+1 whole (§3.12) |
| PARAM.safe_mode_max_attempts | 3 | 1–5 | attempts | deterministic quarantine retries per tick (§3.15.3) |
| PARAM.safe_mode_subsystem_repeat_halt | 5 | 2–20 | consecutive ticks | world halt after repeated subsystem quarantine (§3.15.3) |
| PARAM.coord_failover_timeout_ms | 3,000 | 1,000–10,000 | ms | standby coordinator takeover (§3.15.4) |
| PARAM.snapshot_daily_retention_days | 30 | 7–90 | real days | daily snapshot retention before thinning (§3.16.1) |
| PARAM.shadow_verify_fraction | 0.01 | 0.001–1.0 | fraction of ticks | independent recomputation (§3.17.3) |
| PARAM.version_notice_ticks | 17,280 | 720–60,480 | ticks | notice before VERSION_CUTOVER (§3.18) |
| PARAM.catchup_min_interval_ms | 2,500 | 1,500–5,000 | ms | minimum seal interval in CATCHUP (§3.19.1) |
| PARAM.clock_max_skew_ms | 250 | 50–1,000 | ms | drift slewing threshold (slew ≤ 10 ms/tick; > 2,000 ms pages ops) (§3.19.2) |
| PARAM.catchup_max_lag_ms | 300,000 | 60,000–900,000 | ms | lag above which the world REANCHORs instead of catching up (§3.19.3) |
| PARAM.resume_notice_ms | 60,000 | 10,000–300,000 | ms | gap between resume announcement and the first tick (§3.19.3) |
| PARAM.liveops_maintenance_max_minutes | 30 | — | real minutes per event | owned by 21 Rule 3.3.3 (one event per real week, quietest hour); 02 §3.19.3 cites it (ruling in 24) |
| PARAM.outage_compensation_threshold_min | 30 | 5–240 | real minutes | halt length that triggers 21's compensation review (§3.19.3) |

Fixed constants (immutable, §2.1, not PARAMs): 720 ticks per day, 2 game min per tick, 5,000 ms cadence, 4-4-5 months, 364-day year, chapter 1,344 game days, phase budgets P0–P14 summing to 2,500 ms.

## 2. Decisions
- §2.1/§3.1: 00 time model adopted. Session phases t0–59 pre-open, 60 open auction, 61–539 continuous batch session, 540 close auction, 541–719 after-hours. All rules use canonical game time; ET (+6 h) is cosmetic only. DEFAULT.
- §2.11: genesis at 18:00:00 UTC on launch day. DEFAULT.
- §3.2: holiday table. Genesis Day (day-of-year 1) is a holiday in every bloc, plus 3 per bloc (PYN 39/186/271; SRL 50/213/299; FDL 60/236/352; NKR 95/156/344; EUN 129/177/318), giving 256 trading days per bloc per year. Names go in 22. DEFAULT.
- §3.2: on holidays FX still trades at reduced depth; crypto, perps and 24h futures are unaffected; accruals still post every calendar day. DEFAULT.
- §3.5: 15-phase pipeline P0–P14 with hard budgets summing to 2,500 ms and 2,500 ms of slack; overruns never abort a tick; load shedding is state-driven only. Resolves old X17 (1,000 ms vs 150–300 ms vs 600 ms AI).
- §3.5.3: partition kinds COORD/WORLD/MARKET/FIN/CITY/PLAYER, rounds R0–R6, barriers B1–B3; consequences land next tick.
- §3.6: pure `stepPartition`/`stepWorld` contract with sealed header, entropy, intents and inbox in; postings, events, outbox and hash out. Resolves old X18.
- §3.7: determinism coding standard (lint rule `tycoon/deterministic`); float rules; dmath library; canonical sort orders.
- §3.9: `roundHalfEven`, `toMoney` is the only float-to-money path; bigint helpers and `allocate` for largest-remainder splits.
- §3.10: xoshiro128** streams keyed by `module.purpose:subject`, with PUBLIC and SECRET roots, epoch = chapter, lazy per-tick entropy mixing, fixed draw counts. Resolves old X15 (per-partition seeds retired).
- §3.11: commit 720 ticks ahead, reveal +1,000; tick entropy also mixes `intentsRoot`. Resolves old X16 and roadmap Q5 (ranked challenges only with commit-reveal).
- §3.12: fair `orderKey` order inside a tick; 20 intents per tick per character across channels. Resolves old X2 (10 vs 20).
- §3.14: cross-partition hold-to-settle; institution-aware routing; rebalancing only at the daily snapshot boundary.
- §3.15: two-phase commit, rollback, deterministic safe-mode quarantine recorded in the hashed header; hot-standby failover.
- §3.16: snapshot cadence DAILY / WEEKLY / CHAPTER with thinning. DEFAULT.
- §3.19: halts stop world time (no lost income); NORMAL/CATCHUP/REANCHOR modes; maintenance cap. DEFAULT.
- Roadmap Q7 (hosting): one region at alpha, same partitioned design from day one (with 01 §4.2).

## 3. Interfaces assumed
- 03: `Posting`/entry types per 00 §5.4; P13 commit-and-invariants entry point; hold accounts (§3.14.3 uses 03's restricted/hold accounts).
- 04: day-close macro hooks in P2 (rates, fiscal, central banks).
- 05/06: per-asset batch auction in P6; `listingExchange` field on instruments; NPC liquidity in P4 honouring `PARAM.holiday_fx_depth_mult`.
- 07: CCP novation and margin in P7; liquidations found in N execute in N+1.
- 08: fund NAV estimate and insurance in P8.
- 09/10: hourly-staggered city operations in P9.
- 11: AI strategy graphs in P5 with DU budgets (2,000 DU/tick per player, 3.0M per partition).
- 12/13/14/15: P10–P12 hooks; 13 supplies license and Held checks to P1.
- 16: living-world scheduler in P3 queuing NPC actor intents.
- 19: event store tables, gateways, partition planner, fencing, package layout.
- 20: Truth Machine harness reusing `stepWorld` with harness seeds; shadow verifier.
- 21: compensation policy, admin directive tooling, banners and push.

## 4. Content needed (22)
- 16 holiday names (Genesis Day plus 3 per bloc for PYN, SRL, FDL, NKR, EUN), with day-of-year as in 02 §3.2.
- Exchange names per bloc (one equity exchange per bloc, referenced as `listingExchange`).
- None for months or weekdays: the calendar uses ordinary names (Jan to Dec in 4-4-5 form, Mon to Sun).
