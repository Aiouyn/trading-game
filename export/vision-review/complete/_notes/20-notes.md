# 20 notes — Verification and Balance

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| `inv_rehypo_max_chain` | 1 | 0–2 | re-uses | max rehypothecation chain length checked by INV-BS-007 (07 owns re-use rules) |
| `inv_xpart_settle_max_ticks` | 2 | 1–4 | ticks | max life of a cross-partition hold before INV-BS-012 fails |
| `tm_tick_alert_ms` | 3500 | 2500–4500 | ms | tick wall time that pages on-call (INV-ENG-010) |
| `tm_bisect_max_trials` | 24 | 8–64 | trials | bisection trials per failing tick (Rule 3.2.3) |
| `tm_bisect_budget_ms` | 20000 | 5000–60000 | ms | wall budget for bisection before world halt |
| `tm_quarantine_repeat_window_ticks` | 17280 | 720–86400 | ticks | second quarantine of same (actor, kind) blocks the kind |
| `tm_invariant_budget_share` | 0.10 | 0.05–0.20 | share of P13 | invariant cost budget (never sampled) |
| `tm_equivalence_partition_counts` | [1, 4, 16] | list | partitions | partition-equivalence shapes (DEFAULT from caller) |
| `tm_property_runs_pr` | 200 | 50–1000 | cases | fast-check cases per property on PRs |
| `tm_property_runs_nightly` | 10000 | 1000–100000 | cases | cases per property nightly / G1 |
| `tm_adapt_epoch_days` | 21 | 7–63 | game days | adaptive agent learning epoch |
| `tm_adapt_population` | 32 | 8–128 | vectors | cross-entropy population per epoch |
| `tm_adapt_dd_penalty` | 0.5 | 0–2 | λ | drawdown penalty in adaptive reward |
| `tm_mirror_retention_days` | 14 | 1–30 | real days | lifetime of pseudonymized production mirror worlds |
| `tm_oracle_mint_tolerance` | 0.001 | 0.0001–0.01 | × traded notional | O-MINT residual tolerance |
| `tm_oracle_excess_min` | 0.5 | 0.1–2 | pp per game day | O-RISKFREE excess threshold |
| `tm_oracle_grief_ratio` | 20 | 5–100 | loss/cost | O-GRIEF threshold |
| `tm_hunt_farm_worlds` | 32 | 4–256 | worlds | continuous exploit-hunt farm size |
| `tm_trading_days_per_year` | 260 | 252–260 | days | Sharpe annualization in metrics |
| `tm_engaged_active_hours_per_real_day` | 1.5 | 1–2 | real hours | definition of "engaged" agent for wealth bands |
| `tm_canary_ticks` | 720 | 180–2880 | ticks | G4 canary run against live batches |
| `tm_hotfix_canary_ticks` | 60 | 12–360 | ticks | shortened canary on hotfix path |
| `tm_shadow_verifiers` | 1 | 1–4 | hosts | live shadow verifiers |
| `tm_shadow_max_lag_ticks` | 720 | 180–2880 | ticks | shadow lag target; 2× pages INC-3 |
| `tm_live_band_breach_days` | 3 | 1–14 | game days | consecutive live breaches before an E6 Finding |
| `tm_report_min_count` | 5 | 3–20 | count | suppression threshold in integrity report |
| `tm_tick_p99_ms` | 2500 | 1000–4000 | ms | load-gate tick commit p99 |
| `tm_disclosure_window_ticks` | 17280 | 720–51840 | ticks | exploit disclosure safe-harbour window (1 real day) |
| `tm_disclosure_max_uses` | 3 | 1–10 | uses | safe-harbour use limit |
| `tm_disclosure_max_gain` | $100,000 or 5% NW (larger) | — | real $ | safe-harbour gain limit |
| `tm_reports_per_day` | 5 | 1–20 | reports | exploit reports per account per real day |

Bands (≈150 ids in §3.7) are not PARAMs; they are registered in `apps/harness/bands` and listed in 20 §3.7. 23 should mirror band ids as a separate "band registry" table or reference 20.

## 2. Decisions

- DEFAULT: partition-equivalence set {1, 4, 16} + one random 2–24 map nightly (§3.3.2–3.3.3) — caller default.
- DEFAULT: purchase code can never import the engine; hard CI failure, no waiver (INV-STR-002, §3.1.8) — caller default.
- DEFAULT: invariants are never sampled (Rule 3.2.6).
- DEFAULT: failure ladder rollback → safe mode → bisection → quarantine → world halt (Rule 3.2.2).
- Gate numbering G0 PR, G1 unit, G2 integration (also toolchain upgrades), G3 adversarial/balance, G4 release (every deploy), G5 chapter boundary (§3.9) — aligned to 19 §12.4's G1–G4 usage; 19's "S4+ exploit" read as Finding severity HIGH+.
- Resolved B07: evidence categories E1–E6 never merged (Rule 3.4.1).
- Resolved B11: GEV = generalized extreme value, tail calibration only, four TAIL bands (Rule 3.8.3).
- Resolved V3 Q4: named crisis templates exist as harness scenarios and Academy practice worlds only; live crises only emergent (Rule 3.8.4).
- Resolved B10: model-driven NPC experiments only in controlled harness cells (Rule 3.8.5).
- Resolved R06: every band carries a class (ACCOUNTING/DOMINANCE/INTENDED_RISK/CALIBRATION/EXPERIENCE/PERFORMANCE) with its own response (Rule 3.7.1).
- Resolved ROADMAP Q2 (as a check): BIZ.t1_payback band 15–30 game days (option C, ~20) and Hustler in 1–2 real days; 09 owns parameters (§3.7.6).
- Resolved ROADMAP Q5: no ranked solo; weekly challenges and tournament server-only (§3.15) — caller default.
- Resolved ROADMAP Q4: sandbox progress never carries over (stricter than option A) (§3.15) — caller default.
- Resolved ROADMAP Q8: Held in sandbox on game time (§3.15) — caller default; contradicts 19 Rule 3.17.4 ("Held off"), flagged for 24.
- Resolved ROADMAP Q6 (as a hunt oracle): fund betrayal only via prosecutable market abuse, custody prevents theft (H13).
- ROADMAP "must-fix before online ranking" (alt-lifted peak) made hunt H08 and INV-PRG-001 crowd-exit valuation.
- DEFAULT: many band values marked `DEFAULT` in §3.7 (inflation, recessions, bank failures, CCP layer use, yields, path parity, Gini, top-1% share, tail bands, playtest thresholds).
- DEFAULT: weekly Integrity Report on top of 19's daily signed bulletin (Rule 3.12.1).
- DEFAULT: exploit disclosure programme with safe harbour and cosmetic-only rewards ("Auditor" title, "Integrity Seal" frame) (§3.16).
- DEFAULT: test agents never run in production (Rule 3.5.8); mirror worlds pseudonymized, 14-day retention (Rule 3.5.7).
- DEFAULT: ad grant amount indexed by MSI ($250 real) — consistent with 14's real-dollar convention; at MSI 1.0 exactly L12's $250.

## 3. Interfaces assumed

- 02: `step()` purity; safe-mode replay of one tick from committed T−1; named RNG streams with per-stream draw counters (RNG ledger); test-only fault-injection hooks compiled out of production; per-entity undo within a tick.
- 03: reason-code table with exactly one class each; per-tick partial sums of FAUCET/SINK/CREDIT per currency; M0/M2 per ccy; consolidation; `toMoney` provenance tag on Money writes; MSI; reason codes `ADM_COMPENSATION`, `ADM_CLAWBACK`, `ADM_TRANSFER_REVERSAL`, `AD_GRANT`, `ACCT_FRESH_START`.
- 05: cause vector (market, sector, news, flow, noise) per fill/day; shared per-tick and per-day impact tallies across accounts; no-self-match by beneficial owner.
- 07: single pledge registry for collateral; waterfall layer order; bank capital recomputation.
- 08: NAV, SPV waterfall, manager action set.
- 13: verdict/fine/fee function signatures without Reputation/Prestige inputs; Held duration in ticks.
- 14: `RestrictedCashLot` with `restrictedUntilTick`; rank function of rank-basis peak NW; Fresh Start rules; `Account.cosmeticsOwned` must be platform-side (see 21 notes).
- 15: `linkedAccounts` score, anti-cheat detections; board writers accept only production events (INV-SOC-004); P2P caps.
- 19: `TickRecord` with `invariantResults`, `logicalStateHash`, per-entity hashes in snapshots; `PartitionEngine.rollback`; `queryView` with `ViewerContext`; harness host role; bot SDK in `packages/sdk`; replay service; `sys.*`/`adm.*` inputs; daily integrity bulletin (19 Rule 3.12.5); verify-roll API (19 Rule 3.12.4).
- 21: staff roles TM_ENGINEER, TM_LEAD; compensation by counterfactual; enforcement and exposure handling; incident levels INC-1..4.

## 4. Content needed (22)

- 47 test-agent archetypes A01–A47 (policies in harness code, not player content).
- 6 population templates (POP_BASELINE … POP_BROKE).
- Scenario catalogue: S01–S08 integrated scenarios as `SC_*` harness scenarios; crisis templates `SC_CRISIS_SECURITIZATION`, `SC_CRISIS_REPO_RUN`, `SC_CRISIS_SOVEREIGN_FX`, `SC_CRISIS_BANK_RUN`, `SC_CRISIS_CCP_MEMBER_DEFAULT`, `SC_CRISIS_STABLECOIN_DEPEG` (also offered as Academy practice worlds, 18).
- News templates: `NEWS_INTEGRITY_REPORT`, halt/resume Exchange notices (shared with 21's `NEWS_EXCHANGE_NOTICE`).
- Cosmetic rewards: title "Auditor", frame "Integrity Seal" (earned, never sold).
- Fictional issuer name for the report: "The Exchange Authority" (L6).
- Strings: `SYS_QUARANTINED`, `SYS_KIND_BLOCKED`, `TM_*` reject codes, halt overlay reason "System check".
