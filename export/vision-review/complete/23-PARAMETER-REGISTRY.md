# 23 — Parameter Registry

Project: TYCOON complete specification (00 §1). Owner of this file: the registry writer. Written 2026-10-19.
Status: **complete registry** of every tunable number named in files 00–21 and in their writer notes (`_notes/02-notes.md` … `_notes/21-notes.md`). Built by script: every `PARAM.<key>` occurrence in the spec files was extracted with the section it appears in and the default written next to it, then merged with each writer's Parameters table. Where the script found the same key with two defaults, or two keys for the same quantity, the conflict is listed in §5 with the value this registry adopts. **Regenerated after the reconciliation recorded in 24 §6–§7**: §5 shows which conflicts 24 resolved (with the ruling) and which remain open.

Precedence (00 §3.5): **24 Decisions register > the module that owns the system > 23 (this file) > any other text.** This registry therefore never overrides an owner module; where an owner module and this table disagree after a later edit, the owner module wins and this table is regenerated. Where two non-owner texts disagree, this table is the tie-breaker.

---

## §1 Purpose

1. Give the builder one place to load every tunable number: a single, versioned parameter set (02 §3.18.4) whose keys, defaults and ranges are exactly the rows of §4.
2. Give LiveOps (21 §3.4) the legal range of every key, so a BALANCE change can be range-checked by `sys.param_change` (19 Rule 3.16.2) and stepped at most `PARAM.liveops_param_step_max_share = 0.25` of the range per patch (21 Rule 3.4.3).
3. Give the Truth Machine (20) the list of keys whose change must trigger a diff run of the touched balance bands.
4. Remove ambiguity: every key has one owner, one default, one unit; duplicates and synonyms are resolved in §5 with the file that must be corrected.

## §2 How to read the registry

### §2.1 Columns

| Column | Meaning |
|---|---|
| key | The parameter name, used in code and in specs as `PARAM.<key>`. A key with `<id>`, `<city>`, `<use>`, `<product>`, `<class>`, `<service>` or `*` is a **family**: one value per member, listed in the owner section's table. `†` marks a key this registry assigned because the source row (a writer-notes summary line) had no key; the owner module adopts it as written |
| default | The value the builder uses. Units as written by the owner (money in display dollars, rates as fractions or %, durations in the unit column). Engine conversion per 00 §3.1: Money → micro-units with `toMoney`; `%` → fraction; game days × 720 = ticks; real days × 17,280 = ticks |
| range | The interval LiveOps may move the value within (inclusive). `fixed` = never changes in live play. `‡` marks a range this registry set because the owner gave none: **0.5× – 2× the default** for a positive scalar, owner judgement for zero defaults, and "per owner table" for composite values. `DEFAULT (Mathis may override)` |
| unit | Unit of the default and the range. `real $ (× MSI)` means the dollar figure is scaled by the Money Supply Index (03 §3.8) when applied |
| owner § | The module that owns the system the number belongs to, and the section that defines or uses it. The owner's value wins (00 §3.5) |
| what it affects | One line from the owner (notes table) or, if the owner wrote none, the sentence of the spec that uses it |
| live | `yes` = LiveOps may change it without a code release, as a BALANCE param change (21 Rule 3.4.1: at a day close, ≥ 48 real hours notice, two approvals, within range, step ≤ 25% of range, ≤ 1 change per key per real week). `no` = it changes only with a release or never; the letter gives the reason (§2.2) |

### §2.2 Live-tunable rule (applied mechanically)

A key is **live-tunable = yes** unless one of these applies (`DEFAULT (Mathis may override)`):

| Code | Rule | Why |
|---|---|---|
| L | Range written as `fixed`, or the value is pinned by a locked decision (L1–L15, e.g. breach floor 1% L2, hidden-session ceiling 0.85 L3, ad grant $250 / 10 per day / $1,000 line L12) or a 00 §5 contract | locked decisions never change |
| E | Owner is 02 (time engine) or 19 (tech architecture) | determinism, protocol and infrastructure numbers change only with an engine-version cutover (02 §3.18.1) or a deploy; changing them live would break replay or security |
| V | Owner is 20 (verification) | harness thresholds change with the release that changes the gate (20 §3.9) |
| C | Owner is 17 (UX) | presentation numbers ship in a CLIENT patch (21 Rule 3.4.1), not a sealed param change |
| G | Owner is 21 and the key is a governance, compliance or anti-abuse guardrail (`adm_*`, `liveops_*`, `enf_*`, `age_*`, `dr_*`, `export_*`, `audit_*`, `tz_*`, `mod_*`, `support_*`, ad verification keys) | the rules that constrain staff cannot be loosened by the same staff; they change only in a RULES patch at a chapter boundary |

Every `yes` key is still bounded by its range; a value outside the range is a RULES change (chapter boundary, 21 Rule 3.4.1). Module kill switches (21 §3.3) are `sys.param_change` of a module flag and are always live.

### §2.3 Builder rules

1. **One file.** All keys load from one parameter set `params/v<paramsVersion>.json` (19) with the shape `{ key: { value, min, max, unit, owner, live } }`. Unknown keys fail the build; missing keys fail the build.
2. **Aliases.** The keys listed as replaced in §5.2 must not appear in code. A builder who meets one in a spec reads the canonical key instead. CI (20, G0) greps the code for alias keys and fails on any hit.
3. **Families.** A family key expands to one key per member at load: `natural_vacancy_<use>` → `natural_vacancy_RES`, … with the member list from 22 and the values from the owner table cited.
4. **Range checks.** `sys.param_change` (19 Rule 3.16.2) rejects any value outside `[min, max]` with `PARAM_OUT_OF_RANGE`, and any `live = no` key with `PARAM_NOT_LIVE` unless the change is part of a RULES patch or an engine cutover.
5. **Units.** The engine stores every value in the engine unit of 00 §3.1; the conversion happens once at load. The registry shows display units for readability.
6. **Public.** Every value is public (19 `sys.param_changed`); the Exchange notice of a BALANCE patch prints old and new values (21 Rule 3.4.4).

## §3 Counts

| Measure | Count |
|---|---|
| Keys in the registry (after merging aliases) | 1019 |
| … defined in a spec file and its notes | 829 |
| … only in a spec file (`PARAM.` but no notes row) | 4 |
| … only in a notes table (spec writes the number without `PARAM.`) | 186 |
| Family keys | 24 |
| Keys assigned by this registry (†) | 43 |
| Ranges set by this registry (‡) | 137 |
| Live-tunable yes / no | 794 / 225 |
| Same key with two defaults (§5.1): historical / still open | 3 / 0 |
| Two keys for one quantity (§5.2) | 24 groups, 26 alias keys |
| Retired keys removed (§5.5) | 2 |
| Same key listed in two notes tables, same value (§5.3) | 26 |
| Scope conflicts (§5.4) | 1 |

| Owner | Module | Keys |
|---|---|---|
| 02 | Time engine | 17 |
| 03 | Ledger and accounting | 24 |
| 04 | Macro, central banks, sovereigns | 57 |
| 05 | Markets and price engine | 97 |
| 06 | Asset classes | 45 |
| 07 | Banking, credit, clearing | 46 |
| 08 | Funds, structured, insurance | 103 |
| 09 | Businesses and companies | 51 |
| 10 | Real estate and cities | 69 |
| 11 | AI Lab | 137 |
| 12 | Conflict and intelligence | 15 |
| 13 | Law, courts, regulators | 21 |
| 14 | Progression and lifestyle | 42 |
| 15 | Multiplayer and social | 22 |
| 16 | Living world | 49 |
| 17 | UX and screens | 37 |
| 18 | Onboarding and Academy | 26 |
| 19 | Tech architecture | 91 |
| 20 | Verification and balance | 31 |
| 21 | LiveOps, admin, monetization, compliance | 39 |

## §4 Registry by owner module

Rows are sorted by key inside each module. The section column points to the defining text.

### §4.1 02 — Time engine (17 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `catchup_max_lag_ms` | 300,000 | 60,000–900,000 | ms | 02 §3.19.3 | lag above which the world REANCHORs instead of catching up (§3.19.3) | no (E) |
| `catchup_min_interval_ms` | 2,500 | 1,500–5,000 | ms | 02 §3.19.1 | minimum seal interval in CATCHUP (§3.19.1) | no (E) |
| `clock_max_skew_ms` | 250 | 50–1,000 | ms | 02 §3.19.2 | drift slewing threshold (slew ≤ 10 ms/tick; > 2,000 ms pages ops) (§3.19.2) | no (E) |
| `coord_failover_timeout_ms` | 3,000 | 1,000–10,000 | ms | 02 §3.15.4 | standby coordinator takeover (§3.15.4) | no (E) |
| `display_clock_offset_min` | 360 | 0–1,439 | game minutes | 02 §3.1.2 | cosmetic "ET" display clock (§3.1.2); never used in rules | no (E) |
| `entropy_commit_lead_ticks` | 720 | 60–2,880 | ticks | 02 §3.11.1 | how far ahead C(N) is published (§3.11.1) | no (E) |
| `entropy_reveal_lag_ticks` | 1,000 | 720–5,000 | ticks | 02 §3.11.1 | when e(N) is revealed (§3.11.1) Replaces `entropy_reveal_delay_ticks` (§5.2). | no (E) |
| `protected_floor_cash_real` | $7,300 × MSI (E-43, Designer target, Quant tune) | $1k–$50k | real $ | 13 §3.12 | collection floor: liquid cash never taken below this (E-45) | yes |
| `holidays_enabled` | false | bool | – | 02 §3.2 | D071: no holidays at launch (260 trading days); true enables the D016 table (256) (E-45) | yes |
| `holiday_fx_depth_mult` | 0.5 | 0.1–1.0 | multiplier | 02 §3.2 | NPC FX liquidity depth on pairs that include a holiday bloc's currency (§3.2) | yes |
| `intent_max_age_ticks` | 3 | 1–12 | ticks | 02 §3.12 | REJECT_STALE threshold for clientTick (§3.12) Replaces `max_client_tick_lag` (§5.2). | no (E) |
| `outage_compensation_threshold_min` | 30 | 5–240 | real minutes | 02 §3.20 | halt length that triggers 21's compensation review (§3.19.3) | no (E) |
| `resume_notice_ms` | 60,000 | 10,000–300,000 | ms | 02 §3.20 | gap between resume announcement and the first tick (§3.19.3) | no (E) |
| `safe_mode_max_attempts` | 3 | 1–5 | attempts | 02 §3.15.3 | deterministic quarantine retries per tick (§3.15.3) | no (E) |
| `safe_mode_subsystem_repeat_halt` | 5 | 2–20 | consecutive ticks | 02 §3.15.3 | world halt after repeated subsystem quarantine (§3.15.3) | no (E) |
| `seal_grace_ms` | 150 | 50–500 | ms | 02 §3.12 | wait for gateway closed markers; a late batch rolls to N+1 whole (§3.12) | no (E) |
| `shadow_verify_fraction` | 0.01 | 0.001–1.0 | fraction of ticks | 02 §3.17.3 | independent recomputation (§3.17.3) | no (E) |
| `snapshot_daily_retention_days` | 30 | 7–90 | real days | 02 §3.16.1 | daily snapshot retention before thinning (§3.16.1) | no (E) |
| `version_notice_ticks` | 17,280 | 720–60,480 | ticks | 02 §3.18 | notice before VERSION_CUTOVER (§3.18) | no (E) |

### §4.2 03 — Ledger and accounting (26 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `topend_ramp_center` | $2,000,000,000 | $1B–$5B | Money (friction NW) | E-47 (T03-17) | centre of the top-end friction ramp w(N) [Quant] | yes |
| `topend_ramp_width` | 0.35 | 0.2–0.6 | log2 units | E-47 (T03-17) | ramp softness; w($1B) ≈ 0.054 [Quant] | yes |
| `comeback_garnish_rate` | 0.30 (E-21; was 0.25) | 0.05–0.75 | fraction of inflows | 03 §3.14.5 | collection of persistent claims after bankruptcy (§3.14) | yes |
| `control_defacto_min` | 0.30 | 0.2–0.5 | vote share | 03 §3.11.2 | de facto control test (§3.11.2) | yes |
| `cycle_max_product` | 0.95 | 0.5–0.99 | product of shares | 03 §3.11.4 | REJECT_CIRCULAR_OWNERSHIP (§3.11.4) | yes |
| `levy_free_daily_notional` | $10,000,000 | $1M–$100M | Money per game day | 03 §3.7.4 | exemption from lever L3 transaction levy (§3.7.4) | yes |
| `lookthrough_iterations` | 64 | 16–256 | sweeps | 03 §3.11.4 | Gauss–Seidel look-through NAV (§3.11.4) | yes |
| `mark_min_volume_frac` | 0.002 | 0–0.05 | × ADV20 | 03 §3.9.1 | thin-print guard on marks (§3.9.1) | yes |
| `model_useful_life_game_days` | 364 | 91–1,344 | game days | 03 §3.9.2 | AI model amortization (§3.9.2) | yes |
| `msi_money_share` | 0.20 | 0.05–0.5 | fraction | 03 §3.8 | κ in designed money for MSI (§3.8) | yes |
| `nw_control_listed_cap` | 2.0 | 1.0–5.0 | × look-through NAV | 03 §3.10.3 | cap on board value of a controlled listed company (§3.10.3) | yes |
| `nw_impact_y` | 0.5 | 0.1–1.5 | coefficient | 03 §3.10.3 | liquidity haircut on board NW, capped at 50% (§3.10.3) | yes |
| `pe_mark_decay_per_quarter` | 0.05 | 0–0.2 | fraction per game quarter | 03 §3.9.2 | PE/VC stake marks without a new round (§3.9.2) | yes |
| `prop_appraisal_cadence_game_days` | 7 | 1–28 | game days | 03 §3.9.2 | property re-appraisal (§3.9.2) | yes |
| `related_party_band` | 0.10 | 0.02–0.25 | ± fraction of fair value | 03 §3.11.6 | related-party price validity (§3.11.6) | yes |
| `serena_substance_opex` | $2,000,000 | $0–$50M | Money per tax year | 03 §3.12.11 | Serena active-income substance test (§3.12.11) | yes |
| `stab_deadband` | 0.05 | 0–0.2 | log-ratio | 03 §3.7.3 | error deadband (§3.7.3) | yes |
| `stab_engaged_min_active_days` | 7 | 3–30 | game days in last 168 | 03 §3.7.2 | who counts as engaged in the Stabilizer sample (§3.7.2) | yes |
| `stab_integral_max` | 10 | 2–50 | integral units | 03 §3.7.3 | anti-windup clamp (§3.7.3) | yes |
| `stab_ki` | 0.02 | 0–0.1 | gain per game day | 03 §3.7.3 | integral gain (§3.7.3) | yes |
| `stab_kp` | 0.5 | 0.1–2.0 | gain | 03 §3.7.3 | proportional gain (§3.7.3) | yes |
| `stab_lever_ranges` † | L1 NPC demand 1.00 (0.90–1.10, step 0.005); L2 price index 1.00 (0.90–1.25, step 0.005); L3 levy 0.5 bp (0–3.0 bp, step 0.1 bp); L4 upkeep 1.00 (0.95–1.15, step 0.003) | as listed per lever | per lever | 03 §3.7.4 | Stabilizer lever start values, ranges and daily steps (03 §3.7.4); lever values themselves are state, not parameters (02 §3.18.4) | yes |
| `stab_min_sample` | 200 | 50–2,000 | characters | 03 §3.7.2 | below this the Stabilizer is in OBSERVE (§3.7.2) Replaces `stab_min_population` (§5.2). | yes |
| `stab_observe_game_days` | 168 | 0–672 | game days | 03 §3.7.5 | OBSERVE period after launch (§3.7.5) Replaces `stab_observe_only_real_days` (§5.2). | yes |
| `stab_target_growth_after_year` | 0.001 | 0–0.005 | per real day | 03 §3.7.2 | growth of W_target after the last curve point (§3.7.2) | yes |
| `wash_sale_window_game_days` | 5 | 0–30 | game days | 03 §3.12.6 | wash-sale loss disallowance (§3.12.6) | yes |

### §4.3 04 — Macro, central banks, sovereigns (57 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `macro_ai_productivity_max` | 0.005 | 0–0.01 | growth per year | 04 §3.4.2 | AI race effect on potential (§3.4.2) | yes |
| `macro_auction_award_cap` † | 35% | 20–50% | share of offering per group | 04 §3.10 | primary auctions (§3.10) | yes |
| `macro_auction_noncomp_max_face` | 10,000,000 | 1M–50M | face per group | 04 §3.10.3 | non-competitive bids | yes |
| `macro_auction_announce_tick` | 420 | 61–539 | tick of day | 04 §3.10.2 | auction announcement tick; separate from `macro_cb_decision_tick` so CB retuning never moves auctions (E-51, Quant) | yes |
| `macro_auction_tick` | 330 | 61–539 | tick of day | 04 §3.10.2 | primary auction tick (§3.10) | yes |
| `macro_cac_threshold` | 0.75 | 0.66–0.85 | share of face | 04 §3.12.2 | aggregated CAC (§3.12.2) | yes |
| `macro_capital_controls_duration` † | L2 3 days, L3 72 days | per owner table ‡ | game days | 04 §3.13.6 | §3.13.6 | yes |
| `macro_cb_decision_tick` | 420 | 60–539 | tick of day | 04 §3.6.1 | decision publication tick | yes |
| `macro_cb_emergency_step` | −0.0100 | 0.5× – 2× default ‡ | dimensionless | 04 §3.6.6 | - Size: cuts up to −0.0100 ( PARAM.macro_cb_emergency_step ), computed as the scheduled rule with ρ = 1 and the wider clamp; … | yes |
| `macro_cb_haircut_*` | per asset table | per owner table ‡ | share | 04 §3.8.3 | standing facility haircuts (§3.8.3) | yes |
| `macro_cb_holdings_cap_gdp` † | 0.35 | 0.2–0.5 | share of GDP | 04 §3.8.5 | QE holdings cap (§3.8.5) | yes |
| `macro_cb_max_emergency_per_quarter` | 2 | 1–3 | meetings | 04 §3.6.6 | emergency meetings (§3.6.6) | yes |
| `macro_cb_max_step` | 0.005 | fixed | rate | 04 §3.6.4 | max move per meeting (steps of 25 bp) | no (L) |
| `macro_cb_max_step_wide` | 0.0075 | fixed | rate | 04 §3.6.4 | max move per meeting (steps of 25 bp) | no (L) |
| `macro_cb_meeting_day_of_quarter` † | NA 15, SC 27, FU 39, EC 51, PL 63 | 1–91 | day of quarter | 04 §3.6.1 | staggered calendar (§3.6.1) | yes |
| `macro_cb_meetings_per_year` | 4 | fixed | per bloc | 04 §3.6.1 | meeting calendar (§3.6.1) | no (L) |
| `macro_cb_phi_fs` | 1.5 | 0.5–3 | dimensionless | 04 §3.6.2 | financial-stability term in rule | yes |
| `macro_cb_smoothing` | 0.5 | 0.3–0.8 | dimensionless | 04 §3.6.2 | rate smoothing (§3.6.3) | yes |
| `macro_corridor_halfwidth` | 0.0025 | 0.001–0.005 | rate | 04 §3.8.1 | corridor ±25 bp (§3.8.1) | yes |
| `macro_cred_guidance_break` | 0.05 | 0.02–0.10 | credibility | 04 §3.6.5 | credibility loss on surprise (§3.6.7) | yes |
| `macro_cycle_label_lag_days` | 21 | 7–42 | game days | 04 §3.3.6 | public cycle label (§3.3.6) | yes |
| `macro_fear_index_genesis` † | 22 | 0.5× – 2× default ‡ | index / game hours | 04 §3.14.1 | §3.14.1 | yes |
| `macro_fear_index_half_life` † | 2 hours | 0.5× – 2× default ‡ | index / game hours | 04 §3.14.1 | §3.14.1 | yes |
| `macro_fx_uip_share` | 0.5 | 0–1 | fraction | 04 §3.13.1 | FX fair value (§3.13.1) Replaces `fx_uip_pass` (§5.2). | yes |
| `macro_gap_halflife_years` | 0.30 | 0.2–0.5 | game years | 04 §3.4.1 | output-gap pull to regime attractor (§3.4.1) | yes |
| `macro_gap_vol` | 0.008 | 0.004–0.015 | per √year | 04 §3.4.1 | output-gap noise | yes |
| `macro_governor_term_days` | 2,912 | 1,456–4,368 | game days | 04 §6.1 | governor terms (§6.1) | yes |
| `macro_irp` | 0.002 | 0–0.005 | rate | 04 §3.7.6 | inflation risk premium (§3.7.6) | yes |
| `macro_issue_mix_*` | per bloc | per owner table ‡ | share | 04 §3.9 | fiscal revenue, issuance mix (§3.9, §3.10) | yes |
| `macro_major_base_rate` | 3.6e-4 | 2e-4–6e-4 | per game day × vulnerability | 04 §3.16.1 | major crisis rate (≈35% of chapters) | yes |
| `macro_major_min_gap_days` | 504 | 336–1,008 | game days | 04 §3.16.2 | spacing of majors Replaces `major_min_gap_game_days` (§5.2). | yes |
| `macro_npc_dealers_per_bloc` † | 8 | 5–12 | dealers | 04 §3.10.4 | auction demand (§3.10.4) | yes |
| `macro_ns_lambda` | 1.8 | 1.0–3.0 | years | 04 §3.7.5 | Nelson-Siegel fit (§3.7.5) | yes |
| `macro_phillips_slope` | 0.25 | 0.1–0.5 | dimensionless | 04 §3.5 | inflation response to gap (§3.5) | yes |
| `macro_policy_lag_days` | 120 | 60–240 | game days | 04 §3.4.1 | transmission lag | yes |
| `macro_regime_mean_days_con` | 273 | 182–364 | game days | 04 §3.3.1 | other regime lengths (§3.3.1) | yes |
| `macro_regime_mean_days_exp` | 819 | 546–1,092 | game days | 04 §3.3.1 | expansion length (§3.3.1) | yes |
| `macro_regime_mean_days_ovh` | 273 | 182–364 | game days | 04 §3.3.1 | other regime lengths (§3.3.1) | yes |
| `macro_regime_mean_days_rec` | 273 | 182–364 | game days | 04 §3.3.1 | other regime lengths (§3.3.1) | yes |
| `macro_regime_min_days_con` | 91 | ±50% | game days | 04 §3.3.1 | minimum regime lengths | yes |
| `macro_regime_min_days_exp` | 182 | ±50% | game days | 04 §3.3.1 | minimum regime lengths | yes |
| `macro_regime_min_days_ovh` | 63 | ±50% | game days | 04 §3.3.1 | minimum regime lengths | yes |
| `macro_regime_min_days_rec` | 91 | ±50% | game days | 04 §3.3.1 | minimum regime lengths | yes |
| `macro_rev_base_*` | per bloc | per owner table ‡ | share | 04 §3.9 | fiscal revenue, issuance mix (§3.9, §3.10) | yes |
| `macro_ripple_rate` | 1 per 7 days | 1/3–1/14 | per game day | 04 §3.16 | ripples (§3.16) Replaces `ripple_rate` (§5.2). | yes |
| `macro_rr_*` | per bloc | 0–20% | share | 04 §3.8.2 | reserve requirements (§3.8.2) | yes |
| `macro_scale_max` | 400 | fixed band | ratio | 04 §3.2 | world scale clamp (§3.2) | no (L) |
| `macro_scale_min` | 0.2 | fixed band | ratio | 04 §3.2 | world scale clamp (§3.2) | no (L) |
| `macro_scale_ref_players` | 5,000 | 1,000–20,000 | active players | 04 §3.2 | world scale S (§3.2) | yes |
| `macro_sov_grace_days` | 7 | 3–14 | game days | 04 §3.12.2 | missed-payment grace (§3.12) | yes |
| `macro_sov_lgd` | 0.6 | 0.4–0.8 | share | 04 §3.11.2 | sovereign spreads (§3.11) | yes |
| `macro_sovereign_base_hazard` † | FU 0.0005, EC 0.003, PL 0.002, NA 0.0003, SC 0.02 | ±50% | per year | 04 §2.2 | sovereign PD (§2.2) | yes |
| `macro_storm_rate` | 1 per 91 days | 1/60–1/182 | per game day | 04 §3.16 | storms (§3.16) Replaces `storm_rate` (§5.2). | yes |
| `macro_world_gdp_ref` | 100e12 | 50e12–200e12 | FDL per game year at S = 1 | 04 §3.2 | NPC economy size (§3.2) | yes |
| `macro_x_*` | per table in the owner section | per owner table ‡ | dimensionless | 04 §3.4.1 | 3. Channel terms (each a PARAM.macro_x_ coefficient):… | yes |
| `macro_xreg_*` | per regime table | ±50% | gap | 04 §3.4.1 | regime attractor gaps (§3.4.1) | yes |
| `macro_ycc_bloc` | PL | any bloc or none | dimensionless | 04 §3.8.6 | YCC user (§3.8.6) | yes |
| `npc_to_player_wealth_band` | [20, 200] | monitored | ratio | 04 §3.2 | old "GDP = 50× player NW" kept as a monitored band (§3.2) | yes |

### §4.4 05 — Markets and price engine (98 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `mkt_topend_part_base` | 0.20 | 0.1–0.5 | × ADV / w(N) per day | E-47 (T05-11) | top-end participation cap per instrument [Quant] PROVISIONAL, E-48 | yes |
| `msi_drift_per_gd` | 0.0029 | 0–0.01 | per GD | E-59 (T05-11, T20B-11) | MSI money drift placeholder until 03 MSI [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `mkt_topend_anchor_avg_gd` | 20 | 5–60 | GD | E-59 (T05-11) | participation anchor average window [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `mkt_topend_anchor_ema_gd` | 120 | 30–250 | GD | E-59 (T05-11) | participation anchor EMA window [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `mkt_topend_anchor_rise` | 0.0025 | 0–0.01 | per GD, over drift | E-59 (T05-11) | max anchor rise above drift [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `topend_excess_d` | 1.0 | 0–1 | × w(N) | E-59 (T20B-11) | excess-only drag strength D [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `mkt_active_ticks_crypto` | 262,080 | fixed | ticks per year | 05 §3.2.3 | crypto clock | no (L) |
| `mkt_active_ticks_session` | 187,200 | fixed | ticks per year | 05 §3.2.3 | value-layer clock for session classes (§3.2.3) | no (L) |
| `mkt_adv_fear_k` | 0.01 | 0–0.03 | per F point | 05 §3.14.1 | ADV fear boost (§3.14.1) | yes |
| `mkt_algo_child_cap` | 0.02 | 0.005–0.1 | ADV per tick | 05 §3.7 | algo child size (§3.7) | yes |
| `mkt_auction_depth_mult` | 3.0 | 1.5–5 | multiplier | 05 §3.4.2 | auction depth | yes |
| `mkt_autofx_buffer` | 0.005 | 0–0.02 | share | 05 §3.6.3 | autoFx conversion | yes |
| `mkt_autosplit_adv` | 3 | 1–10 | ADV / share | 05 §3.6.8 | auto-split (§3.6.8) | yes |
| `mkt_autosplit_pov` | 0.10 | 0.05–0.3 | ADV / share | 05 §3.6.8 | auto-split (§3.6.8) | yes |
| `mkt_band_sigma_k` | 6 | 4–10 | σ_tick | 05 §3.9.1 | per-tick band (§3.9.1) | yes |
| `mkt_belief_cap` | 0.5 | 0.5× – 2× default ‡ | count | 05 §6.3 | belief model (§6.3) | yes |
| `mkt_belief_handoff_ticks` | 15 | 0.5× – 2× default ‡ | ticks | 05 §6.3 | belief model (§6.3) | yes |
| `mkt_belief_hl_days` | 5 | 0.5× – 2× default ‡ | game days | 05 §6.3 | belief model (§6.3) | yes |
| `mkt_belief_spread_ticks` | 30 | 0.5× – 2× default ‡ | ticks | 05 §6.3 | belief model (§6.3) | yes |
| `mkt_block_min_notional` † | max(0.25 ADV, $1M) | per owner table ‡ | Money | 05 §3.20 | block crosses (§3.20) | yes |
| `mkt_cap_npc_float` | 25% | 0.5× – 2× default ‡ | share of float | 05 §3.15.2 | position caps (§3.15.2) | yes |
| `mkt_cap_player_float` | 49% | 0.5× – 2× default ‡ | share of float | 05 §3.15.2 | position caps (§3.15.2) | yes |
| `mkt_compute_oi_cap` | 20% | 10–40% | share of OI | 05 §3.15.2 | compute futures | yes |
| `mkt_crisis_corr_major` | 0.5 | 0.1–0.7 | share | 05 §3.3.3 | crisis correlation (§3.3.3) | yes |
| `mkt_crisis_corr_storm` | 0.3 | 0.1–0.7 | share | 05 §3.3.3 | crisis correlation (§3.3.3) | yes |
| `mkt_depth_base` | 1.0 | 0.5× – 2× default ‡ | dimensionless | 05 §3.4.2 | maker depth (§3.4.2) | yes |
| `mkt_depth_fear_k` | 0.6 | 0.5× – 2× default ‡ | dimensionless | 05 §3.4.2 | maker depth (§3.4.2) | yes |
| `mkt_depth_floor` | 0.2 | 0.5× – 2× default ‡ | dimensionless | 05 §3.4.2 | maker depth (§3.4.2) | yes |
| `mkt_fee_*` | per table in the owner section | per owner table ‡ | dimensionless | 05 §3.15.1 | §3.15.1 Fee schedule ( PARAM.mkt_fee_ )… | yes |
| `mkt_fee_bond` † | 0.5 bp | 0.5× – 2× default ‡ | bp | 05 §3.15.1 | §3.15.1 | yes |
| `mkt_fee_crypto` † | 10–5 bp | per owner table ‡ | bp | 05 §3.15.1 | §3.15.1 | yes |
| `mkt_fee_eq` † | 3–1 bp | per owner table ‡ | bp | 05 §3.15.1 | §3.15.1 | yes |
| `mkt_fee_fx` † | 0.3 bp | 0.5× – 2× default ‡ | bp | 05 §3.15.1 | §3.15.1 | yes |
| `mkt_fee_volume_tiers` † | ×1.0 / 0.8 / 0.6 / 0.5×L4 at $10M, $100M, $1B | per owner table ‡ | FDL 30-day | 05 §3.1 | fee tiers | yes |
| `mkt_fut_limit` | 10% | 0.5× – 2× default ‡ | move vs settle | 05 §3.9.4 | futures limits (§3.9.4) | yes |
| `mkt_fut_limit_wide` | 15% | 0.5× – 2× default ‡ | move vs settle | 05 §3.9.4 | futures limits (§3.9.4) | yes |
| `mkt_fx_anchor_hl_days` | 20 | 5–60 | game days | 05 §3.3.6 | FX pull to 04 fair value | yes |
| `mkt_garch_alpha` | 0.08 | 0.03–0.15 | dimensionless | 05 §3.3.2 | volatility clustering (§3.3.2) | yes |
| `mkt_garch_beta` | 0.90 | 0.80–0.95 | dimensionless | 05 §3.3.2 | volatility clustering (§3.3.2) | yes |
| `mkt_garch_h_max` | 9 | 0.5× – 2× default ‡ | multiplier | 05 §3.3.2 | GARCH clamp | yes |
| `mkt_garch_h_min` | 0.25 | 0.5× – 2× default ‡ | multiplier | 05 §3.3.2 | GARCH clamp | yes |
| `mkt_gtc_max_days` | 91 | 28–182 | game days | 05 §3.6.2 | GTC expiry (§3.6.2) | yes |
| `mkt_guard_gap` † | 0.25 equities, null crypto | per class | log | 05 §3.4.7 | max price–value gap (§3.4.7) | yes |
| `mkt_halt_l1` | 15% | 0.5× – 2× default ‡ | move vs close | 05 §3.9.2 | single-asset halts (§3.9.2) | yes |
| `mkt_halt_l1_ticks` | 120 | 0.5× – 2× default ‡ | ticks | 05 §3.9.2 | halt lengths | yes |
| `mkt_halt_l2` | 30% | 0.5× – 2× default ‡ | move vs close | 05 §3.9.2 | single-asset halts (§3.9.2) | yes |
| `mkt_halt_l2_ticks` | 240 | 0.5× – 2× default ‡ | ticks | 05 §3.9.2 | halt lengths | yes |
| `mkt_halt_mw_l1` † | −7% | 0.5× – 2× default ‡ | bloc index | 05 §3.9.3 | circuit breakers (§3.9.3) | yes |
| `mkt_halt_mw_l2` † | −13% | 0.5× – 2× default ‡ | bloc index | 05 §3.9.3 | circuit breakers (§3.9.3) | yes |
| `mkt_halt_mw_l3` † | −20% | 0.5× – 2× default ‡ | bloc index | 05 §3.9.3 | circuit breakers (§3.9.3) | yes |
| `mkt_iceberg_min_display` | 0.05 | 0.01–0.2 | share of qty | 05 §3.6.7 | iceberg display | yes |
| `mkt_impact_y_default` | 0.8 | 0.3–1.5 | dimensionless | 05 §3.4.2 | square-root impact (§3.4.2) | yes |
| `mkt_kanon_k` | 5 | 3–20 | owner groups | 05 §3.12.4 | k-anonymity (§3.12.4) | yes |
| `mkt_lnv_vol_scale` | 1.15 | 1.0–1.4 | multiplier | 05 §3.3.1 | value vol vs target price vol (§3.3.1) | yes |
| `mkt_maker_inv_cap_adv` | 0.5 | 0.2–1.0 | ADV | 05 §3.4.5 | maker inventory (§3.4.5) | yes |
| `mkt_maker_layoff` | 0.12 | 0.05–0.25 | share per day | 05 §3.4.5 | inventory layoff | yes |
| `mkt_maker_skew_k` | 1.0 | 0.5–2 | dimensionless | 05 §3.4.5 | inventory skew | yes |
| `mkt_market_order_ticks` | 6 | 1–20 | ticks | 05 §3.6.6 | market-order protection (§3.6.6) | yes |
| `mkt_max_auction_passes` | 3 | 2–5 | passes | 05 §3.5.4 | STP and FOK (§3.5.4) | yes |
| `mkt_max_open_orders` | 200 | 0.5× – 2× default ‡ | orders | 05 §3.8 | open-order limits (§3.8) | yes |
| `mkt_max_open_orders_asset` | 20 | 0.5× – 2× default ‡ | orders | 05 §3.8 | open-order limits (§3.8) | yes |
| `mkt_message_fee` | $0.10 | $0.01–1 | ratio / Money | 05 §3.15.1 | message fee | yes |
| `mkt_mm_max_assets` | 50 | 0.5× – 2× default ‡ | dimensionless | 05 §3.19.1 | registered MMs (§3.19) | yes |
| `mkt_mm_min_qty_adv` | 0.02 | 0.5× – 2× default ‡ | dimensionless | 05 §3.19.2 | registered MMs (§3.19) | yes |
| `mkt_mm_presence` | 80% | 0.5× – 2× default ‡ | share | 05 §3.19.2 | registered MMs (§3.19) | yes |
| `mkt_mm_rebate` | −0.5 bp | 0.5× – 2× default ‡ | dimensionless | 05 §3.19.3 | registered MMs (§3.19) | yes |
| `mkt_mm_spread_mult` | 2 | 0.5× – 2× default ‡ | multiplier | 05 §3.19.2 | registered MMs (§3.19) | yes |
| `mkt_mwcb_cutoff_tick` | 470 | 400–520 | tick of day | 05 §3.9.3 | no L1/L2 after | yes |
| `mkt_news_halt_ticks` | 30 | 0–60 | ticks | 05 §3.9.2 | material-news halts | yes |
| `mkt_news_print_share` † | 0.50 | 0–1 | share | 05 §3.4.7 | how fast value prints (§3.4.7) | yes |
| `mkt_open_print_share` † | 0.50 (equities; class table §3.3.6) | 0–1 | share | 05 §3.4.7 | how fast value prints (§3.4.7) | yes |
| `mkt_otr_threshold` | 100 | 50–500 | ratio / Money | 05 §3.15.1 | message fee | yes |
| `mkt_perm_share` | 0.5 | 0.3–0.7 | share | 05 §3.4.3 | permanent impact (§3.4.3) | yes |
| `mkt_pool_pos_hl_days` | 10 | 3–30 | game days | 05 §6.2 | pool position decay (§6.2) | yes |
| `mkt_regime_corr_con` | 0.15 | 0–0.3 | share | 05 §3.3.5 | correlation add | yes |
| `mkt_regime_corr_exp` | 0 | 0–0.3 | share | 05 §3.3.5 | correlation add | yes |
| `mkt_regime_corr_ovh` | 0 | 0–0.3 | share | 05 §3.3.5 | correlation add | yes |
| `mkt_regime_corr_rec` | 0.05 | 0–0.3 | share | 05 §3.3.5 | correlation add | yes |
| `mkt_regime_depth_con` | 0.80 | 0.6–1.2 | multiplier | 05 §3.3.5 | maker depth | yes |
| `mkt_regime_depth_exp` | 1.10 | 0.6–1.2 | multiplier | 05 §3.3.5 | maker depth | yes |
| `mkt_regime_depth_ovh` | 1.00 | 0.6–1.2 | multiplier | 05 §3.3.5 | maker depth | yes |
| `mkt_regime_depth_rec` | 0.90 | 0.6–1.2 | multiplier | 05 §3.3.5 | maker depth | yes |
| `mkt_regime_jump_con` | 1.6 | ±50% | multiplier | 05 §3.3.5 | jump intensity | yes |
| `mkt_regime_jump_exp` | 0.8 | ±50% | multiplier | 05 §3.3.5 | jump intensity | yes |
| `mkt_regime_jump_ovh` | 1.0 | ±50% | multiplier | 05 §3.3.5 | jump intensity | yes |
| `mkt_regime_jump_rec` | 1.2 | ±50% | multiplier | 05 §3.3.5 | jump intensity | yes |
| `mkt_regime_skew_con` | +0.15 | ±0.1 | probability | 05 §3.3.5 | jump down-share | yes |
| `mkt_regime_skew_exp` | −0.05 | ±0.1 | probability | 05 §3.3.5 | jump down-share | yes |
| `mkt_regime_skew_ovh` | +0.05 | ±0.1 | probability | 05 §3.3.5 | jump down-share | yes |
| `mkt_regime_skew_rec` | 0 | ±0.1 | probability | 05 §3.3.5 | jump down-share | yes |
| `mkt_regime_vol_con` | 1.45 | ±30% | multiplier | 05 §3.3.5 | regime volatility (§3.3.5) | yes |
| `mkt_regime_vol_exp` | 0.90 | ±30% | multiplier | 05 §3.3.5 | regime volatility (§3.3.5) | yes |
| `mkt_regime_vol_ovh` | 1.05 | ±30% | multiplier | 05 §3.3.5 | regime volatility (§3.3.5) | yes |
| `mkt_regime_vol_rec` | 1.15 | ±30% | multiplier | 05 §3.3.5 | regime volatility (§3.3.5) | yes |
| `mkt_short_cap` | 50% | 20–100% | share of float | 05 §3.15.2 | short-interest cap | yes |
| `mkt_spread_fear_k` | 1.5 | 0.5–3 | dimensionless | 05 §3.4.2 | spread widening with F | yes |
| `mkt_surv_decay` | 0.8 | 0.6–0.95 | per day | 05 §3.16 | surveillance score (§3.16) | yes |
| `mkt_transient_hl_ticks` | 15 | 5–60 | ticks | 05 §3.4.4 | transient decay (§3.4.4) | yes |
| `mkt_trend_capacity` | 1 | 0.3–3 | ADV | 05 §6.2 | TREND pool crowding | yes |
| `mkt_value_g0` | 1.0 | 0.5–2 | σ_d·√5 / ADV per day | 05 §6.2 | VALUE pool | yes |
| `mkt_value_print_share` † | 0.10 | 0–1 | share | 05 §3.4.7 | how fast value prints (§3.4.7) | yes |
| `mkt_value_rate` | 0.9 | 0.3–2 | σ_d·√5 / ADV per day | 05 §6.2 | VALUE pool | yes |
| `mkt_vol_interrupt_ticks` | 12 | 6–30 | ticks | 05 §3.9.1 | volatility interruption | yes |

### §4.5 06 — Asset classes (45 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `ast_auc_supply` † | max 18,000,000, halving each chapter | per owner table ‡ | AUC | 06 §3.11.1 | AUC issuance (§3.11.1) | yes |
| `ast_cds_standard_coupons` † | 100 bp IG / 500 bp HY | per owner table ‡ | bp/yr | 06 §3.17 | Standard CDS (§3.17) | yes |
| `ast_collectible_fees` † | buyer premium 15%, seller fee 12%; soft close 30 ticks × 10 | 0–25% | — | 06 §3.18.3 | Auctions (§3.18.3) | yes |
| `ast_gusd_reserve_mix` † | 60% bills, 30% NPC bank deposits, 10% overnight repo | per owner table ‡ | — | 06 §3.12.6 | GUSD reserve mix (§3.12.6) | yes |
| `ast_gxv_bounds` † | [5, 150] | per owner table ‡ | vol points | 06 §3.5.3 | GX Volatility Index range (§3.5.3, test 10) | yes |
| `ast_option_models` † | BS, Black-76, Garman-Kohlhagen, CRR | per owner table ‡ | — | 06 §3.13.2 | Option pricing (§3.13.2) | yes |
| `ast_perp_funding` † | interval 240 ticks, clamp ±0.1% | 120–720; ±0.05–0.5% | ticks; per interval | 06 §3.15 | Perp funding (§3.15) | yes |
| `ast_price_params_<class>_*` † | §3.21 table (κ half-life, σ, ν, jumps, jump means, spread); GARCH α 0.08 β 0.90 (stablecoins 0.02/0.95) | per owner table ‡ | — | 06 §3.21 | Inputs 05 uses to move prices | yes |
| `auc_v0` | authored in 22 (launch AUC fundamental) | 0.5×–2× | FDL per AUC | 06 §3.11.2 | AUC fundamental value anchor (§3.11.2) | yes |
| `bond_grace_days` | 3 | 1–10 | game days | 06 §3.8.3 | Grace after a missed coupon or principal payment before a bond default (§3.8.3), except sovereign issuers, which use 04's `macro_sov_grace_days` = 7; also feeds the CDS FAILURE_TO_PAY event (§3.17) | yes |
| `bridge_pause_ticks` | 720 | 60–2,160 | ticks | 06 §3.12.9 | How long Arc Bridge stays PAUSED after an impairment (§3.12.9) | yes |
| `cmd_<id>_*` | §3.10.1 table (13 physical commodities: unit, ref price, normal cover, elasticity, γ, storage, perish, σ) | ±50% each | various | 06 §3.10.1 | Commodity spot model and curves | yes |
| `cmd_conv_eta` | 0.5 | 0.1–1.5 | per year | 06 §3.10.3 | Convenience-yield sensitivity to days-cover, which sets the futures curve shape (§3.10.3) | yes |
| `cmd_public_storage_markup` | 1.5 | 1.0–3.0 | × base storage cost | 06 §3.10.4 | Price of NPC public warehouse storage compared with player storage businesses (§3.10.4) | yes |
| `collectible_mark_haircut` | 0.10 | 0–0.30 | fraction | 06 §3.3.3 | Mark of a collectible = appraisal × (1 − haircut) (§3.3.3) | yes |
| `data_ref_price` | $2 | $0.5–$10 | FDL per DQU | 06 §3.10.6 | Data commodity reference price; 11 may retune (§3.10.6) | yes |
| `eq_consensus_sigma` | 0.06 | 0.02–0.15 | fraction | 06 §3.4.3 | Analyst consensus noise around expected EPS (§3.4.3) | yes |
| `eq_earn_immediate_frac` | 0.6 | 0.3–1.0 | fraction | 06 §3.4.3 | Share of an earnings re-valuation that jumps at the report tick; the rest drifts in (§3.4.3) | yes |
| `eq_earn_rerate` | 1.5 | 0.5–3.0 | per unit surprise | 06 §3.4.3 | Re-rating of the multiple per unit of earnings surprise (§3.4.3) | yes |
| `eq_earn_revision` | 1.0 | 0.5–2.0 | per unit surprise | 06 §3.4.3 | Forward EPS revision per unit of surprise; together with the re-rating ΔlnV ≈ 2.5·s (§3.4.3) | yes |
| `eq_growth_beta` | 1.5 | 0.5–3.0 | — | 06 §3.4.2 | Growth premium per unit of growth above the sector median (§3.4.2) | yes |
| `eq_loss_maker_ps_haircut` | 0.7 | 0.4–1.0 | × | 06 §3.4.2 | Price-to-sales haircut for loss-making companies (§3.4.2) | yes |
| `eq_sector_<id>_*` | §3.4.1 table (12 sectors: PE_base, PS_base, duration, σ, jumps/yr) | ±50% each | various | 06 §3.4.1 | Equity fundamental values and volatility | yes |
| `eq_split_trigger` | 1,000 | 200–5,000 | currency units | 06 §3.4.5 | NPC stock split threshold: 5:1, or 10:1 above 5,000 (§3.4.5) | yes |
| `fut_spot_month_limit_frac` | 0.10 | 0.05–0.25 | of deliverable supply | 06 §3.14.5 | Spot-month position limit per beneficial-owner group (§3.14.5) | yes |
| `mark_stale_ticks` | 30 | 10–120 | ticks | 06 §3.3.3 | Age after which the last batch price is no longer used for the mark (§3.3.3) | yes |
| `max_live_instruments` | 2,500 | 1,000–10,000 | count | 06 §3.1.2 | Soft cap on live instruments; pauses NPC spawns only (§3.1.2) | yes |
| `meme_spawn_per_game_week` | 2 | 0–10 | Poisson rate | 06 §3.11.4 | Meme coin spawn rate (§3.11.4) | yes |
| `mirage_redeem_cap_per_tick` | 0.002 | 0.0005–0.01 | of MDOL supply | 06 §3.12.8 | Rate limit on MDOL/MSH mint and burn (§3.12.8) | yes |
| `npc_arb_cap_frac` | 0.02 | 0.005–0.10 | of ADV per tick | 06 §6 | NPC arbitrage capacity: ETF/NAV, put-call parity, CIP (§6) | yes |
| `npc_defi_arb_cap` | $250k | $50k–$2M | per pool per tick, × N_a | 06 §3.12.10 | AMM vs CEX arbitrage capacity (§3.12.10) | yes |
| `opt_crr_steps` | 128 | 64–512 | steps | 06 §3.13.2 | CRR binomial tree steps for American options (§3.13.2) | yes |
| `opt_dealer_hedge_participation` | 0.10 | 0.02–0.30 | of tick volume | 06 §3.13.6 | NPC dealer delta-hedge flow (gamma feedback) (§3.13.6) | yes |
| `opt_dealer_vega_chi` | 0.3 | 0–1 | — | 06 §3.13.3 | Vol surface shift from dealer net vega, clamped ±30% (§3.13.3) | yes |
| `opt_vega_cap_per_und` | index $2M, single stock $200k, crypto $300k per vol point, × N_a | ±75% | FDL vega | 06 §6 | NPC dealer vega inventory capacity (§6) | yes |
| `perp_max_oi_share` | 0.10 | 0.02–0.25 | of OI | 06 §3.3.4 | Perp position limit per beneficial owner (§3.3.4) | yes |
| `perp_oi_cap_frac_of_spot_mcap` | 0.25 | 0.05–1.0 | of free-float cap | 06 §3.15 | Open-interest cap per perp (§3.15) | yes |
| `player_tokens_enabled` | false | bool | — | 06 §3.20 | Player-launched tokens, fully specified but off at launch (L10) (§3.20) | yes |
| `primary_max_award_frac` | 0.35 | 0.10–0.50 | of issue | 06 §9 | Competitive award cap per bidder in primary auctions (§3.7.6, X-counter) | yes |
| `primary_noncomp_cap` | $5M | $1M–$25M | FDL eq. per owner | 06 §3.7.6 | Non-competitive primary bid cap (§3.7.6) | yes |
| `rookie_max_leverage` | 3 | 1–5 | × | 06 §3.2 | New-player derivatives leverage cap (§3.2) | yes |
| `ship_loss_prob_per_trip` | 0.002 | 0–0.01 | per trip | 06 §3.10.5 | Cargo loss risk, insurable via 08 (§3.10.5) | yes |
| `token_launch_fee` | $5M | $1M–$50M | FDL, SINK | 06 §3.20 | Player token launch fee; locked liquidity ≥ $2M (§3.20) | yes |
| `trs_dealer_spread_bps` | 50 | 10–200 | bp | 06 §3.16.3 | TRS funding spread, × (1 + 2·fear) (§3.16) | yes |
| `xccy_basis_stress_bps` | 40 | 0–150 | bp | 06 §3.9.3 | FDL cross-currency basis under fear² (§3.9.3) | yes |

### §4.6 07 — Banking, credit, clearing (48 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `clr_topend_conc_k` | 0.5 | 0–1.5 | × IM | E-47 (T07B-04) | top-end concentration add-on [Quant] PROVISIONAL, E-48 | yes |
| `clr_topend_conc_free` | 0.02 | 0–0.10 | share of OI or float | E-47 (T07B-04) | add-on free share [Quant] PROVISIONAL, E-48 | yes |
| `custody_fee_ppm_gy` | 200 (E-37, PROVISIONAL [Quant]) | 50–1,000 | ppm per game year | 07 §3.20 | LIC4 custody fee on excess above threshold, TRANSFER to TCH | yes |
| `custody_fee_threshold_real` | $1B × MSI (E-37, PROVISIONAL [Quant]) | $100M–$10B | real $ | 07 §3.20 | custody fee threshold (excess only) | yes |
| `apc_stress_weight` | 0.25 | 0–0.5 | weight | 07 §3.15.3 | Anti-procyclicality weight of stressed σ in IM. Lower values make crashes more procyclical (§3.15.3) | yes |
| `bank_capital_requirement` † | 4.5% + 2.5% + CCyB (owner 04, 0–2.5%) + SIB 0/1/1.5/2%; leverage 3% (SIB 3.5%) | per owner table ‡ | — | 07 §3.2.2 | Bank status (§3.2.2) | yes |
| `bank_charter_capital` † | COMMUNITY $20M, COMMERCIAL $250M, UNIVERSAL $2.5B; proposed fees $1M/$10M/$50M (owner 13) | per owner table ‡ | FDL eq. | 07 §3.11.1 | §3.11.1 | yes |
| `bank_confidence_update` † | α down 0.30, α up 0.05, hourly | per owner table ‡ | — | 07 §3.9.1 | Asymmetric confidence (§3.9.1) | yes |
| `bank_cost_of_equity` | 0.12 | 0.06–0.20 | per year | 07 §3.3.1 | Capital charge in loan pricing = RW × CET1 target × CoE (§3.3.1) | yes |
| `bank_dgf_premium` † | 0.08% base × risk factor, clamp [0.05%, 0.40%] | per owner table ‡ | per year on insured deposits | 07 §3.8 | DGF funding (§3.8) | yes |
| `bank_failure_cet1` | 0.02 | 0.01–0.04 | CET1 ratio | 07 §3.2.2 | Failure trigger leading to resolution (§3.2.2, §3.10.1) | yes |
| `bank_failure_charter_ban` | 1 chapter (8 real weeks) | 0–3 chapters | chapters | 07 §3.10.5 | Re-charter ban for the owner after a player bank fails (§3.10.5) | yes |
| `bank_fx_margin` | 0.0025 | 0–0.01 | fraction | 07 §3.1.3 | Bank fee on FX conversions of deposits (§3.1.3) | yes |
| `bank_lending_standards` † | target 0.30 + terms; speed 0.10 per day | [0,1] | — | 07 §3.5.3 | Credit cycle (§3.5.3) | yes |
| `bank_liquidity_requirements` † | LCR ≥ 100%, NSFR ≥ 100% (report only); large exposures 25% of Tier1 | per owner table ‡ | — | 07 §3.2.3 | §3.2.3 | yes |
| `bank_loan_pricing` † | funding + EL + capital charge + opex + margin + 3%·S² | per owner table ‡ | per year | 07 §3.3.1 | §3.3.1 | yes |
| `bank_pb_tiers` † | A/B/C | per owner table ‡ | — | 07 §3.14 | §3.14 | yes |
| `bank_seclending_fee_curve` † | cubic in utilization | per owner table ‡ | per year | 07 §3.13.3 | §3.13.3 | yes |
| `branch_cost_per_day` | $4,000 × bloc wage index | $1k–$20k | FDL eq. per branch per day | 07 §3.2.4 | Bank opex (§3.2.4) | yes |
| `ccp_<service>_*` | §3.17.2 table (LD SCAN 720 ticks 99%; OTC HVaR 3d 99.5%; CDS HVaR + JTD; REPO haircut 1d; CRY SCAN 60 ticks + insurance fund + ADL; fees $0.20/contract, 0.2 bp, 0.5 bp, 0.05 bp/day, 2 bp) | ±50% | various | 07 §3.17.2 | TCH margin, MPOR, mutualization and fees | yes |
| `ccp_clearing_debt_terms` † | ONR + 2%, repayment 30% of daily net income | per owner table ‡ | — | 07 §3.16.5 | §3.16.5 | yes |
| `ccp_default_fund_cover` † | Cover-2 (two largest member groups) | Cover-1 to Cover-3 | — | 07 §3.17.5 | DF sizing (§3.17.5) | yes |
| `ccp_liquidation_penalty` † | 1% of liquidated notional, a transfer to the insurance fund or member | 0.5–3% | — | 07 §3.16.4 | §3.16.4 | yes |
| `ccp_retail_im_rule` † | rule-based; MM = 0.5 × IM | per owner table ‡ | — | 07 §3.15.2 | §3.15.2 | yes |
| `ccp_isa_fee_ppm_gy` | 800 (E-37 amendment, PROVISIONAL [Quant]) | 100–5,000 | ppm of IM per game year | 07 §3.17.3 | ISA segregation fee, TRANSFER to TCH | yes |
| `ccp_sitg1_frac` | 0.10 | 0.05–0.25 | of DF | 07 §3.17.5 | TCH skin-in-the-game layer 1. SITG2 is also 0.10 of DF (§3.17.8) | yes |
| `cm_min_capital` | $250M, DF ≥ $10M per service | $50M–$1B | FDL eq. | 07 §3.17.3 | Player clearing membership (§3.17.3) | yes |
| `deposit_rate_floor` | 0 | −0.01–0 | per year | 07 §3.1.3 | No negative retail rates. Negative rates pass through only to corporate deposits above $10M (§3.1.3) | yes |
| `deposit_share_speed` | 0.02 | 0.005–0.10 | per day | 07 §3.1.4 | Stickiness of NPC deposit market share (§3.1.4) | yes |
| `dgf_cap` | $250k | $50k–$1M | FDL eq. per beneficial owner per bank | 07 §3.8 | Deposit insurance coverage (§3.8) | yes |
| `dgf_payout_ticks` | 720 | 360–2,160 | ticks | 07 §3.8 | Insured payout delay after failure (§3.8) | yes |
| `liq_max_participation` | 0.20 | 0.05–0.50 | of expected tick volume | 07 §3.16.4 | Liquidation engine slice size (§3.16.4) | yes |
| `loan_default_dpd` | 3 | 1–10 | game days past due | 07 §3.3.3 | Loan default and acceleration (§3.3.3) | yes |
| `margin_ewma_fast_halflife_ticks` | 60 (E-38, PROVISIONAL [Quant]) | 15–240 | ticks | 07 §3.15.3 | fast EWMA half-life; σ_ewma = max(slow, fast) | yes |
| `margin_ewma_halflife_ticks` | 240 | 60–2,160 | ticks | 07 §3.15.3 | EWMA vol for margin (§3.15.3) | yes |
| `max_dsr` | 0.50 | 0.30–0.70 | debt service / income | 07 §3.4.3 | Unsecured credit limit; liquid-secured loans exempt (§3.4.3) | yes |
| `max_pd_multiplier` | 5 | 2–10 | × | 07 §3.22 | Cap on stacked 04 PD shocks (§3.22) | yes |
| `onr_min_volume_frac` | 0.0001 | 0.00001–0.001 | of bloc deposits | 07 §3.7.4 | Minimum volume for a valid ONR fixing (§3.7.4) | yes |
| `pb_rehypo_cap` | 1.40 | 1.0–2.0 | × client debit balance | 07 §3.14 | Prime-broker rehypothecation limit (§3.14) | yes |
| `repo_call_due_ticks` | 30 | 10–120 | ticks | 07 §3.12.4 | Repo margin call deadline before an event of default (§3.12.4) | yes |
| `reserve_buffer_frac` | 0.005 | 0–0.02 | of eligible deposits | 07 §3.7.1 | NPC banks' target reserve buffer above rr (§3.7.1–2) | yes |
| `retail_ins_fund_cap` | 0.005 | 0.001–0.02 | of retail margin balances | 07 §3.16.5 | Above this, the retail insurance fund is swept weekly to SINK (§3.16.5) | yes |
| `run_c_crit` | 0.60 | 0.4–0.8 | confidence | 07 §3.9.3 | Threshold below which withdrawals accelerate (x²) (§3.9.3) | yes |
| `run_threshold` | 0.10 | 0.05–0.25 | outflow over 24 game hours | 07 §3.9.3 | Declares `bank.run.started` (§3.9.3) | yes |
| `run_w_max` | 0.08 | 0.02–0.20 | per game hour | 07 §3.9.3 | Peak uninsured withdrawal rate (§3.9.3) | yes |
| `rw_<class>` | §3.2.1 table (0% sovereign own bloc … 1,250% crypto) | per owner table ‡ | risk weight | 07 §3.2.1 | RWA and CET1 ratio | yes |
| `short_disclosure_frac` | 0.01 | 0.005–0.05 | of free float | 07 §3.13.5 | Legal filing of individual net shorts, 1-day lag (L11 exception) (§3.13.5) | yes |
| `sl_htb_utilization` | 0.95 | 0.85–1.0 | utilization | 07 §3.13.2 | Hard-to-borrow rejection (§3.13.2) | yes |
| `sl_lender_share` | 0.70 | 0.5–0.9 | of fee | 07 §3.13.1 | Lender's share of securities lending fees (§3.13.1) | yes |
| `sl_npc_lendable_frac` | equities 0.40, govt 0.50, corporates 0.30, ETFs 0.30 | 0–0.8 | of NPC holdings | 07 §3.13.1 | Borrowable supply (§3.13.1) | yes |
| `sl_recall_grace_ticks` | 360 | 60–720 | ticks | 07 §3.13.4 | Recall grace before buy-in (§3.13.4) | yes |
| `term_break_penalty` | all accrued interest | 0–all | — | 07 §3.1.3 | Early term-deposit withdrawal (§3.1.3) | yes |

### §4.7 08 — Funds, structured, insurance (103 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `cat_bi_days_per_dr` | 20 | 5–40 | game days | 08 §3.5.6 | BI duration | yes |
| `cat_eventset_years` | 2,000 | 500–10,000 | simulated years | 08 §3.5.6 | PML200 | yes |
| `cat_intensity_rate` | 0.9 | 0.6–1.4 | 1/intensity | 08 §3.5.6 | cat severity | yes |
| `catbond_min_spread_bps` | 150 | 50–400 | bps | 08 §3.5.9 | cat bond floor | yes |
| `catbond_term_days` | 728 | 364–1,456 | game days | 08 §3.5.9 | cat bond term | yes |
| `etf_ap_daily_cu_limit` | 40 | 5–200 | creation units | 08 §3.2.2 | AP daily cap | yes |
| `etf_ap_margin_bps` | 5 | 1–20 | bps | 08 §3.2.3 | AP arbitrage band | yes |
| `etf_creation_unit` | 50,000 | 10k–200k | units | 08 §2.3 | CU size | yes |
| `etf_fail_fee` | 0.005 | 0.001–0.02 | share of CU value | 08 §3.2.2 | failed creation fee | yes |
| `etf_halt_cash_premium` | 0.01 | 0–0.03 | share | 08 §8 | halted basket substitution | yes |
| `etf_max_fee` | 0.0075 | 0.001–0.01 | /game year | 08 §3.2.1 | ETF expense cap | yes |
| `etf_min_seed` | $2,500,000 | $500k–$10M | Money | 08 §4.2 | ETF launch seed | yes |
| `etf_npc_ap_default` | true | bool | — | 08 §6.2 | NPC APs on player ETFs | yes |
| `fallen_angel_sell_days` | 20 | 5–60 | game days | 08 §3.4.7 | forced sale period | yes |
| `fund_absent_freeze_days` | 72 | 48–168 | game days (72 real hours) | 08 §3.1.9 | absent-manager freeze | yes |
| `fund_absent_winddown_days` | 336 | 168–672 | game days (14 real days) | 08 §3.1.9 | absent-manager wind-down | yes |
| `fund_aum_stake_multiple` | 10 | 5–20 | × stake | 08 §3.1.10 | AUM cap | yes |
| `fund_board_min_aum` | $1,000,000 | $250k–$10M | Money | 08 §3.1.14 | fund board eligibility | yes |
| `fund_board_min_days` | 182 | 91–364 | game days (2 quarters) | 08 §3.1.14 | fund board eligibility | yes |
| `fund_breaker_dd` | 0.30 | 0.20–0.50 | drawdown | 08 §3.1.9 | breaker (§3.1.9) | yes |
| `fund_breaker_freeze_days` | 1 | 1–3 | game days | 08 §3.1.9 | breaker freeze | yes |
| `fund_call_notice_days` | 10 | 5–28 | game days | 08 §3.1.18 | capital call notice | yes |
| `fund_custody_fee` | 0.0025 | 0.001–0.005 | /game year | 08 §2.2 | custody SINK (§3.1.7) | yes |
| `fund_dealing_cutoff_tod` | 539 | 0–719 | tick of day | 08 §3.1.5 | forward-pricing cutoff (§3.1.5) | yes |
| `fund_drift_cure_days` | 3 | 1–7 | game days | 08 §3.1.8 | drift cure window | yes |
| `fund_early_exit_days` | 48 | 24–96 | game days (2 real days) | 08 §3.1.6 | early-exit window | yes |
| `fund_early_exit_fee` | 0.01 | 0–0.03 | share | 08 §2.2 | paid into fund | yes |
| `fund_gate_pct_per_day` | 0.20 | 0.05–0.50 | share of NAV/day | 08 §2.2 | gate (§3.1.6) | yes |
| `fund_initial_nav` | 100.000000 | fixed | $/unit | 08 §3.1.2 | launch NAV (§3.1.2) | no (L) |
| `fund_investor_max_nw_pct` | 0.25 | 0.10–0.50 | share of investor NW | 08 §3.1.5 | concentration cap (§3.1.5) | yes |
| `fund_investor_min_age_days` | 168 | 72–336 | game days (7 real days) | 08 §3.1.5 | investor account age (§3.1.5) | yes |
| `fund_level3_suspend_pct` | 0.25 | 0.15–0.40 | share of NAV | 08 §3.1.3 | forced side pocket (§3.1.3, §3.1.9) | yes |
| `fund_link_score_block` | 0.6 | 0.4–0.8 | 19 link score | 08 §3.1.5 | linked-investor block (§3.1.5) | yes |
| `fund_liquidation_adv_cap` | 0.20 | 0.05–0.30 | share of ADV/day | 08 §3.1.6 | engine liquidation pace (§3.1.6, §3.1.11) | yes |
| `fund_lp_default_forfeit` | 0.5 | 0.25–1.0 | share of paid-in | 08 §2.2 | LP default penalty | yes |
| `fund_manager_stake_min_abs` | $250,000 | $50k–$1M | Money | 08 §3.1.2 | min stake | yes |
| `fund_manager_stake_min_pct` | 0.10 | 0.05–0.25 | share of AUM | 08 §2.2 | skin in the game; GP commit | yes |
| `fund_mandate_notice_days` | 24 | 12–72 | game days (24 real hours) | 08 §3.1.8 | mandate/fee notice | yes |
| `fund_max_level3_pct` | 0.10 | 0.05–0.25 | share of NAV | 08 §2.2 | open-ended Level-3 cap (§3.1.3) | yes |
| `fund_max_leverage_player` | 1.5 | 1.0–3.0 | gross/NAV | 08 §2.2 | player fund leverage (§3.1.8) | yes |
| `fund_max_per_sponsor` | 5 | 1–10 | funds | 08 §3.1.1 | live funds per sponsor (§3.1.1) | yes |
| `fund_max_position_pct` | 0.20 | 0.05–0.30 | share of NAV | 08 §2.2 | per-instrument cap | yes |
| `fund_mgmt_fee_cap` | 0.02 | 0–0.03 | /game year | 08 §2.2 | mgmt fee cap | yes |
| `fund_min_ticket` | $1,000 | $100–$10,000 | Money | 08 §3.1.5 | min subscription | yes |
| `fund_new_aum_cap` | $10,000,000 | $1M–$50M | Money | 08 §3.1.10 | new-fund AUM cap | yes |
| `fund_new_period_days` | 336 | 168–672 | game days | 08 §3.1.10 | new-fund period | yes |
| `fund_npc_max_share` | 0.50 | 0.25–0.75 | share of AUM | 08 §3.1.17 | NPC capital cap per fund | yes |
| `fund_perf_fee_cap` | 0.20 | 0–0.30 | share of gains | 08 §2.2 | perf fee cap | yes |
| `fund_pref_return` | 0.08 | 0–0.12 | /game year | 08 §3.1.18 | closed-end hurdle | yes |
| `fund_redemption_max_delay_days` | 1 | 1–3 | game days | 08 §3.1.6 | payable delay before GATED | yes |
| `fund_related_cap_pct` | 0.05 | 0.02–0.10 | share of NAV | 08 §3.1.8 | related-party cap | yes |
| `fund_related_float_pct` | 0.01 | 0.005–0.05 | share of float | 08 §3.1.8 | related-party trigger | yes |
| `fund_swing_cap` | 0.03 | 0.01–0.05 | share | 08 §3.1.4 | max swing (§3.1.4) | yes |
| `fund_swing_threshold` | 0.05 | 0.02–0.10 | share of NAV | 08 §3.1.4 | swing pricing trigger (§3.1.4) | yes |
| `fund_winddown_days` | 5 | 3–14 | game days | 08 §3.1.11 | wind-down duration | yes |
| `hh_mmf_share` | 0.08 | 0.02–0.20 | share of hh liquid savings | 08 §3.1.19 | NPC MMF size | yes |
| `index_announce_lead_days` | 5 | 2–14 | game days | 08 §2.3 | rebalance announcement | yes |
| `index_min_adv` | $2,000,000 | $0.5M–$10M | Money/day | 08 §3.2.6 | player index eligibility | yes |
| `index_min_float_cap` | $200,000,000 | $50M–$1B | Money | 08 §3.2.6 | player index eligibility | yes |
| `ins_deductible_min` | $500 | $100–$10k | Money | 08 §3.5.1 | min deductible | yes |
| `ins_expense_fixed` | $50 | $0–$500 | Money/policy/game year | 08 §3.5.2 | expense load | yes |
| `ins_fraud_review` | 0.6 | 0.4–0.8 | score | 08 §3.5.4 | fraud review threshold | yes |
| `ins_limit_floor_pct` | 0.20 | 0.1–0.3 | share of net retained limits | 08 §3.5.7 | 03 §11.3 floor (conflict lines) | yes |
| `ins_min_capital` | $1,000,000 | $250k–$10M | Money | 08 §3.5.7 | insurer floor | yes |
| `ins_model_err` | 0.30 | 0.1–0.5 | σ | 08 §3.5.2 | pricing error at modelQuality 0 | yes |
| `ins_pandemic_sublimit` | 0.25 | 0.1–0.5 | share of limit | 08 §3.5.4 | cyber pandemic (03 §11.2) | yes |
| `ins_pml_recalc_trigger` | 0.10 | 0.05–0.25 | share of PML | 08 §9 | intra-week PML recalc | yes |
| `ins_target_lr` | 0.65 | 0.5–0.8 | loss ratio | 08 §3.5.2 | market cycle | yes |
| `mmf_break_level` | 0.9950 | 0.990–0.998 | shadow NAV | 08 §3.1.19 | break the buck | yes |
| `mmf_liquidity_fee` | 0.02 | 0–0.03 | share | 08 §3.1.19 | MMF fee in stress | yes |
| `mmf_max_wam_days` | 60 | 30–91 | game days | 08 §3.1.19 | MMF WAM limit | yes |
| `mmf_min_weekly_liquid` | 0.30 | 0.15–0.50 | share | 08 §3.1.19 | MMF liquidity | yes |
| `npc_alloc_player_share` | 0.02 | 0–0.05 | share of NPC allocator AUM | 08 §3.1.17 | NPC capital to player funds (faucet size) | yes |
| `npc_alloc_top_k` | 10 | 5–25 | funds | 08 §3.1.17 | allocator diversification | yes |
| `npc_fund_count` | 40 | 20–100 | funds | 08 §6.1 | NPC fund roster | yes |
| `pgs_cap_per_claim` | $10,000,000 | $1M–$100M | Money | 08 §3.5.7 | scheme cap | yes |
| `pgs_cover_pct` | 0.80 | 0.5–1.0 | share | 08 §3.5.7 | guarantee scheme cover | yes |
| `pgs_levy` | 0.005 | 0.001–0.02 | share of GWP | 08 §3.5.7 | scheme levy | yes |
| `rating_disclose_preliminary` | false | bool (politics lever) | — | 08 §3.4.5 | shopping disclosure | yes |
| `rating_fee_bps` | 5 | 2–15 | bps of issue | 08 §3.4.5 | issue fee (min $25k) | yes |
| `rating_fee_issuer` | $250,000 | $50k–$1M | Money/game year | 08 §3.4.5 | issuer rating fee | yes |
| `rating_max_leniency` | 0.5 | 0.2–0.7 | fraction | 08 §3.4.4 | leniency cap | yes |
| `rating_parent_max_stake` | 0.099 | 0.05–0.15 | share | 08 §3.4.1 | player stake in agency parent | yes |
| `rating_review_threshold` | 40 | 20–60 | reputation | 08 §3.4.4 | regulator review | yes |
| `rating_turnaround_days` | 3 | 1–7 | game days | 08 §3.3.6 | rating time | yes |
| `rating_watch_days` | 10 | 5–28 | game days | 08 §3.4.6 | watch resolution | yes |
| `reins_min_capital` | $500,000,000 | $100M–$2B | Money | 08 §3.5.8 | player reinsurer | yes |
| `sec_book_days` | 1 | 1–3 | game days | 08 §3.3.6 | book-build | yes |
| `sec_cdo_tranche_lgd` | 0.80 | 0.6–1.0 | LGD | 08 §3.3.4 | CDO-of-ABS model | yes |
| `sec_chargeoff_days` | 182 | 91–364 | game days | 08 §3.3.9 | loss recognition | yes |
| `sec_cum_loss_trigger` | 0.06 | 0.03–0.15 | share of original pool | 08 §3.3.8 | pro-rata → sequential | yes |
| `sec_dealer_halfspread_bps` | 25 | 5–100 | bps | 08 §3.3.11 | dealer quotes | yes |
| `sec_liq_premium_bps` | 20 | 5–60 | bps | 08 §3.3.11 | tranche model spread | yes |
| `sec_max_obligor_pct` | 0.02 | 0.01–0.05 | share of pool | 08 §3.3.2 | concentration | yes |
| `sec_max_tranches` | 8 | 3–10 | tranches | 08 §3.3.3 | structure | yes |
| `sec_min_obligors` | 50 | 20–500 | obligors | 08 §3.3.2 | pool eligibility | yes |
| `sec_min_pool` | $25,000,000 | $5M–$100M | Money | 08 §3.3.2 | pool size | yes |
| `sec_payment_every_days` | 7 | 7–28 | game days | 08 §2.4 | payment date | yes |
| `sec_reserve_pct` | 0.01 | 0–0.03 | share of pool | 08 §3.3.7 | reserve account | yes |
| `sec_risk_premium_base` | 1.8 | 1.0–3.0 | multiple | 08 §3.3.11 | tranche model spread | yes |
| `sec_risk_retention` | 0.05 | 0–0.10 (lobbyable) | share | 08 §2.4 | risk retention | yes |
| `sec_servicer_fee_bps` | 25 | 10–75 | bps/game year | 08 §3.3.10 | servicing | yes |
| `swf_cofund_max` | 0.25 | 0–0.40 | share of NAV | 08 §3.1.20 | treasury co-investment | yes |

### §4.8 09 — Businesses and companies (54 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `biz_rival_share_trigger` | 0.35 | 0.2–0.6 | market share | E-47 (T09B-03) | NPC rival response trigger [Quant] PROVISIONAL, E-48 | yes |
| `biz_rival_entry_k` | 1.0 | 0–3 | × w(N) | E-47 (T09B-03) | NPC entry boost [Quant] PROVISIONAL, E-48 | yes |
| `biz_rival_release_pp` | 0.05 | 0.01–0.2 | share | E-59 (T09B-03) | rival gate release gap below peak [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `biz_rival_release_gd` | 56 | 14–120 | GD | E-59 (T09B-03) | rival gate release duration [Quant] PROVISIONAL, E-59 (pending drift ruling) | yes |
| `biz_rival_price_cut` | 0.05 | 0–0.15 | price share × w(N) | E-47 (T09B-03) | NPC price cut [Quant] PROVISIONAL, E-48 | yes |
| `antitrust_share` | 0.60 | 0.4–0.8 | market share | 09 §3.3.7 | antitrust trigger (01 §9) | yes |
| `biotech_pass` | 0.35 | 0.2–0.5 | probability | 09 §3.4.2 | trial pass (01 §4.4) | yes |
| `biz_calib_density` | 12 | 4–30 | player businesses/market | 09 §3.2.4 | genesis demand calibration (§3.2.4) | yes |
| `biz_decay_per_day` | 1.0 | 0.5–2.0 | condition points/day | 09 §3.5.3 | decay without upkeep | yes |
| `biz_expansion_cost` | 0.80 | 0.5–1.0 | × c0 | 09 §3.5.1 | chain expansion | yes |
| `biz_level_cap` | 25 | fixed | levels | 09 §3.5.1 | upgrade axes | no (L) |
| `biz_share_adjust_rate` | 0.04 | 0.01–0.15 | per game hour | 09 §3.3.2 | customer stickiness (§3.3.2) | yes |
| `biz_upkeep_ratio` | 0.0015 | 0.0005–0.003 | × (c0+upgrades)/day | 09 §3.5.3 | required upkeep | yes |
| `catalog_size_target` | 150 | 100–250 | types | 09 §3.1.4 | catalog completeness (22) | yes |
| `cmp_founding_fee` | $1,000 | $0–$10,000 | Money | 09 §3.1.1 | founding a company (SINK) | yes |
| `concession_incumbent_credit` | 0.10 | 0–0.2 | bid multiplier | 09 §3.8.3 | concessions (01 §14.2) | yes |
| `covenant_cure_days` | 28 | 7–56 | game days | 09 §3.12.3 | covenant cure | yes |
| `delist_ev` | $10,000,000 | $1M–$50M | Money | 09 §3.10.3 | delisting review | yes |
| `exchange_consent` | 0.90 | 0.66–0.95 | share of class | 09 §3.16.2 | out-of-court exchange | yes |
| `exchange_fee_cap_bps` | 0.5 | 0.1–2 | bps of notional | 09 §3.8.3 | exchange concession | yes |
| `exchange_rev_cap` | 0.0002 | 0.0001–0.001 | share of bloc daily traded value | 09 §3.8.3 | exchange faucet cap | yes |
| `fin_setup_fee` | 0.10 | 0.05–0.25 | × c0 | 09 §3.8.1 | financial institution setup SINK | yes |
| `founder_sell_cap` | 0.02 | 0.005–0.05 | share outstanding/day | 09 §3.10.3 | post-lockup sales | yes |
| `hire_fill_per_day` | 0.5 | 0.1–2.0 | heads/day × supply | 09 §3.6.2 | hiring speed | yes |
| `integration_build_discount` | 0.15 | 0–0.3 | share | 09 §3.7.4 | own-construction advantage (I01) | yes |
| `ipo_lockup_days` | 168 | 72–336 | game days (7 real days) | 09 §3.10.3 | founder lockup | yes |
| `ipo_max_alloc_pct` | 0.05 | 0.01–0.10 | share of float | 09 §3.10.2 | allocation cap | yes |
| `ipo_max_secondary` | 0.10 | 0–0.25 | share of company | 09 §3.10.2 | founder cash-out at IPO | yes |
| `ipo_min_ev` | $50,000,000 | $10M–$200M | Money | 09 §3.10.1 | IPO size (01 §4.6) | yes |
| `ipo_min_owned_days` | 336 | 168–672 | game days (14 real days) | 09 §3.10.1 | IPO history | yes |
| `ipo_min_quarters` | 3 | 1–8 | game quarters | 09 §3.10.1 | IPO statements | yes |
| `ipo_npc_demand_mult` | 2.5 | 1–5 | × offering | 09 §3.10.2 | NPC book demand | yes |
| `ipo_underwriting_fee` | 0.05 | 0.02–0.08 | share of proceeds | 09 §3.10.2 | TRANSFER to the NPC underwriter (`CMP_UNDERWRITING_FEE`, E-44) | yes |
| `lbo_cash_sweep` | 0.50 | 0–1 | share of excess CF | 09 §3.14 | LBO sweep | yes |
| `lbo_max_ebitda_mult` | 6 | 3–8 | × EBITDA | 09 §3.14 | LBO debt cap | yes |
| `lbo_max_ev_ltv` | 0.65 | 0.4–0.8 | × EV | 09 §3.14 | LBO debt cap | yes |
| `lbo_min_equity` | 0.30 | 0.15–0.5 | share of price | 09 §3.14 | LBO equity | yes |
| `manager_salary_base` | $150 | $50–$500 | Money/day (1-star, B1) | 09 §3.6.3 | managers | yes |
| `npc_entry_rate` | 0.02 | 0–0.05 | per day per unit excess margin | 09 §3.3.6 | NPC field entry | yes |
| `npc_exit_rate` | 0.01 | 0–0.05 | per day | 09 §3.3.6 | NPC field exit | yes |
| `npc_field_cap` | 3.0 | 1.5–5.0 | × initial weight | 09 §3.3.6 | maximum NPC competition | yes |
| `npc_field_floor` | 0.10 | 0.05–0.30 | × initial weight | 09 §3.3.6 | minimum NPC competition | yes |
| `npc_private_firms_per_city` | 40 | 10–150 | firms | 09 §6 | named NPC competitors | yes |
| `npc_sale_haircut` | 0.85 | 0.7–0.95 | × EV | 09 §3.12.7 | NPC sale (01 §4.6) | yes |
| `npc_tender_premium` | U(0.05, 0.25) | 0–0.5 | premium | 09 §3.13.3 | NPC tender reservation | yes |
| `pill_discount` | 0.50 | 0.25–0.75 | share of price | 09 §3.13.7 | pill rights price | yes |
| `pill_trigger` | 0.20 | 0.10–0.30 | share of votes | 09 §3.13.7 | poison pill | yes |
| `rd_fail_base` | 0.15 | 0.05–0.3 | probability | 09 §3.5.5 | R&D failure | yes |
| `rd_gain_k` | 0.12 | 0.05–0.25 | coefficient | 09 §3.5.5 | R&D gain | yes |
| `reorg_deadline_days` | 91 | 56–182 | game days | 09 §3.16.3 | conversion to liquidation | yes |
| `reorg_exclusivity_days` | 28 | 14–91 | game days | 09 §3.16.3 | plan exclusivity | yes |
| `startups_per_week` | 3 per 4,000 N_a per bloc | 1–10 | startups/game week | 09 §3.11.1 | startup pipeline | yes |
| `take_private_premium` | 1.2 | 1.0–1.5 | × 30-day VWAP | 09 §3.13.3 | take-private | yes |
| `tender_share` | 0.30 | 0.1–0.6 | share of B2B demand | 09 §3.9.1 | tendered volume | yes |
| `trophy_upkeep` | 0.0006 | 0.0002–0.002 | × value/day | 09 §3.8.2 | trophies | yes |
| `utility_spread` | 0.03 | 0.01–0.06 | over 10y yield /game year | 09 §3.4.2 | regulated utility return | yes |

### §4.9 10 — Real estate and cities (70 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `base_cost_<type>` | table §3.11.4 | ±50% | $/m² | 10 §3.11.4 | construction cost | yes |
| `base_let_rate` | 0.25 | 0.05–0.6 | per GD | 10 §3.6.4 | letting speed | yes |
| `base_rent_<use>_<tier>` | table §3.6.1 | ±50% | $/m²/GD | 10 §3.6.1 | rents | yes |
| `cap_ceiling` | 0.12 | 0.5× – 2× default ‡ | rate | 10 §3.8.2 | clamps | yes |
| `cap_floor` | 0.015 | 0.5× – 2× default ‡ | rate | 10 §3.8.2 | clamps | yes |
| `cap_premium_<use>_<tier>` | table §3.8.2 | 0–0.08 | rate | 10 §3.8.2 | values | yes |
| `capacity_floor_m2` | 500 | 100–5,000 | m² | 10 §3.4.3 | demand ratio floor | yes |
| `city_envelope_km` | 6×6 (9×9 capitals) | per owner table ‡ | km | 10 §3.19.2 | generator bound | yes |
| `city_publish_max_lag_ticks` | 1,440 | 0.5× – 2× default ‡ | ticks | 10 §3.26 | publication lag | yes |
| `cityRentMult_<city>` | table §3.6.1 | 0.4–2.0 | × | 10 §3.6.1 | city rents | yes |
| `comp_n0` | 8 | 2–30 | sales | 10 §3.8.4 | comps shrinkage | yes |
| `condition_drift` | 0.08 | 0.02–0.2 | points per GD | 10 §3.7.1 | condition decay | yes |
| `cross_bloc_settle_delay_ticks` | 720 | 0–2,160 | ticks | 10 §3.2.4 | cross-bloc purchase delay (no jet) Replaces `cross_bloc_setup_delay_game_days` (§5.2). | yes |
| `crown_parcels_per_city` | 6 | 0–12 | parcels | 10 §3.22 | crown towers | yes |
| `cure_period_ticks` | 2,160 | 720–7,200 | ticks | 10 §3.10.4 | cure window | yes |
| `dc_hookup_cost_per_mw` | $150,000 | 0.5× – 2× default ‡ | $/MW | 10 §3.11.4 | data-center sites | yes |
| `decline_pressure_threshold` | 0.85 | 0.6–0.98 | ratio | 10 §3.4.3 | decline | yes |
| `derelict_after_days` | 30 | 7–120 | GD | 10 §3.21.4 | decline | yes |
| `dev_days_<type>` | table §3.11.5 | ±50% | GD | 10 §3.11.5 | durations | yes |
| `dscr_covenant` | 1.05 | 0.9–1.3 | ratio | 10 §3.10.4 | covenant | yes |
| `foreclosure_auction_ticks` | 2,160 | 720–7,200 | ticks | 10 §3.10.5 | foreclosure listing | yes |
| `frictional_vacancy` | 0.02 | 0–0.05 | ratio | 10 §3.4.3 | pooled occupancy | yes |
| `grid_mw_<district>` | per table in the owner section | per owner table ‡ | dimensionless | 10 §3.4.2 | …ls with grid capacity. The city's grid capacity per district is PARAM.grid_mw_<district>… | yes |
| `growth_days_required` | 7 | 3–28 | GD | 10 §3.21.2 | NPC construction trigger | yes |
| `growth_pressure_threshold` | 1.10 | 1.02–1.30 | ratio | 10 §3.4.3 | growth eligibility | yes |
| `history_chapters_retained` | 8 | 2–∞ | chapters | 10 §3.23 | then/now retention | yes |
| `home_mode_cooldown_ticks` | 5,040 | 0.5× – 2× default ‡ | ticks | 10 §3.14 | home switching | yes |
| `hotel_m2_per_capita` | 0.35 | 0.1–1.0 | m² | 10 §3.4.2 | hospitality demand | yes |
| `illiquidity_premium` | 0.004 | 0–0.02 | rate | 10 §3.8.2 | values | yes |
| `instant_sale_discount` | 0.10 | 0.05–0.25 | of appraisal | 10 §3.9.3 | instant sale | yes |
| `instant_sale_fund_capacity_share` | 0.005 | 0.001–0.02 | of pooled value per GD | 10 §3.9.3 | fund capacity | yes |
| `island_reserve` | $1.5B | 0.5× – 2× default ‡ | Money | 10 §3.18 | island auctions | yes |
| `lease_deposit_months` | RES 1, others 3, HOSP 6 | 0–12 | months | 10 §2.4 | deposits | yes |
| `ltv_covenant_buffer` | 0.10 | 0.05–0.2 | ratio | 10 §3.10.4 | margin call trigger | yes |
| `m2_per_household` | 55/70/110/260 | ±30% | m² | 10 §3.4.1 | residential demand | yes |
| `m2_per_industrial_job` | 55 | 30–90 | m² | 10 §3.4.2 | industrial demand | yes |
| `m2_per_office_job` | 14 | 8–20 | m² | 10 §3.4.2 | office demand | yes |
| `maint_rate_<use>` | RES .010, OFF .012, RET .012, IND .008, HOSP .015, DC .010 | ±50% | per GY of replacement cost | 10 §3.7.1 | maintenance | yes |
| `max_cities` | 60 | 15–100 | cities | 10 §3.2.3 | world city cap (12 per bloc) | yes |
| `max_concurrent_projects` | 2 + rankIndex | 0.5× – 2× default ‡ | count | 10 §3.11.1 | development | yes |
| `max_dti` | 0.40 | 0.2–0.6 | ratio | 10 §3.10.1 | owner-occupier origination | yes |
| `max_liens_per_property` | 2 | 1–3 | count | 10 §2.3 | liens | yes |
| `max_ltv_<product>` | RES .80, COMM .65, CONSTR .60, BRIDGE .70, 2ND .85 | per owner table ‡ | ratio | 10 §3.10.1 | leverage | yes |
| `migration_speed` | 0.6 | 0–2 | per GY | 10 §3.3 | intra-bloc migration | yes |
| `min_dscr` | 1.20 | 1.0–1.6 | ratio | 10 §3.10.1 | origination | yes |
| `momentum_cap_ratio` | 0.04 | 0.01–0.10 | share of district value | 10 §3.5 | gentrification cap | yes |
| `mortgage_assumable` | false | bool | — | 10 §3.9.5 | settlement | yes |
| `mortgage_base_spread_<product>` | RES .015, COMM .020, CONSTR .030, BRIDGE .035, 2ND .040 | per owner table ‡ | rate | 10 §3.10.3 | pricing | yes |
| `natural_growth` | 0.004 | 0–0.02 | per GY | 10 §3.3 | population growth | yes |
| `natural_vacancy_<use>` | RES .05, OFFICE .08, RETAIL .06, IND .07, HOSP .10 | ±0.04 | ratio | 10 §2.1 | pressure, valuation | yes |
| `new_city_land_auction_parcels` | 40 | 10–200 | parcels | 10 §3.2.3 | frontier land supply in a new city | yes |
| `new_city_na_step` | 4,000 | 2,000–10,000 | activity-weighted players | 10 §3.2.3 | when a new city opens (§3.2.3) Replaces `na_per_new_city`, `city_open_na_step` (§5.2). | yes |
| `npc_listing_rate` | 0.002 | 0.0005–0.01 | per GD of stock | 10 §3.9.1 | supply of listings | yes |
| `npc_mgmt_fee` | 0.08 | 0.03–0.15 | of rent | 10 §3.13 | NPC agency fee | yes |
| `npc_pipeline_target` | 0.6 | 0.2–1.0 | share of shortfall | 10 §3.21.2 | NPC construction | yes |
| `permit_days_by_right` | 2 (≤5,000 m²), 5 above | 1–10 | GD | 10 §3.11.3 | permits | yes |
| `planning_capacity_per_GD` | 20 + 0.0001·pop | per owner table ‡ | reviews | 10 §3.11.3 | permit queue | yes |
| `plaque_price` | $2,500 | 0.5× – 2× default ‡ | Money | 10 §3.23 | plaques | yes |
| `property_tax_rate_<city>` | FDL .010, EUN .012, PYN .008, NKR .009, SRL .015, Serena .004 | 0–0.03 | per GY | 10 §2.1 | tax sink | yes |
| `rent_daily_move_cap` | 0.005 | 0.001–0.02 | ln per GD | 10 §3.6.1 | max daily rent move | yes |
| `rent_desirability_k` | 0.15 | 0–0.5 | — | 10 §3.6.1 | rent response to desirability | yes |
| `rent_pressure_k` | 0.8 | 0.2–2.0 | per GY | 10 §3.6.1 | rent response to pressure | yes |
| `retail_m2_per_capita` | 1.4 | 0.8–2.5 | m² | 10 §3.4.2 | retail demand | yes |
| `serena_island_max` | 15 | 9–30 | islands | 10 §3.2.3 | cap with new coastal cities | yes |
| `serena_islands_launch` | 9 | 6–12 | islands | 10 §3.18 | Isla Serena launch size | yes |
| `serviced_reserve_min` | 0.03 | 0.01–0.10 | share | 10 §3.21.5 | corridor expansion | yes |
| `stamp_duty_rate` | 0.01 | 0–0.05 | of price | 10 §2.1 | sink | yes |
| `start_cap_share` | 0.005 | 0.001–0.02 | of developed parcels per GD | 10 §3.21.2 | growth pacing | yes |
| `transaction_cost` | 0.03 | 0–0.06 | of price | 10 §3.9.4 | sink | yes |
| `re_vacant_utilities_share` | 0.02 | — | × per-GD market rent per vacant unit per GD | 10 §3.7 | vacant-unit utilities (PROP_VACANT_UTILITIES) (Quant, E-28, PROVISIONAL) | yes |

### §4.10 11 — AI Lab (137 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `a_eff_cap` | 12 + 1.5 | per owner table ‡ | A | 11 §3.6.1 | arch cap (§3.6.1) | yes |
| `ai_tier_gates` | §3.2 table (DU 5/15/100/400/1,500/2,000; cadence 6/6/3/2/1/1; slots etc.) | per owner table ‡ | mixed | 11 §3.2 | all tier gates (§3.2) | yes |
| `ai_tier_nw` | T0 $100k, T1 $250k, T2 $1M, T3 $20M, T4 $200M, T5 $2B | ±50% each | Money | 11 §3.2 | lab tier eligibility (§3.2) | yes |
| `analyst_du_per_symbol` | 2 | 0.5–5 | DU | 11 §3.9.2 | analyst (§3.9.2) | yes |
| `arch_ceiling_mult` | 1.25 | 1–2 | × tier band top | 11 §3.14.1 | student cap (§3.14.1) | yes |
| `arena_fee_coeff` | 0.001 | 0.5× – 2× default ‡ | PFd | 11 §3.13 | arenas (§3.13) | yes |
| `audit_prob_audit_cost` | $50,000 | 0.5× – 2× default ‡ | Money | 11 §3.16.2 | audits (§3.16.2) | yes |
| `audit_prob_per_quarter` | 0.02 | 0.5× – 2× default ‡ | prob | 11 §3.16.2 | audits (§3.16.2) | yes |
| `balance_max` | 1.15 | 0.5× – 2× default ‡ | mult | 11 §3.6.1 | balance term (§3.6.1) | yes |
| `balance_min` | 0.60 | 0.5× – 2× default ‡ | mult | 11 §3.6.1 | balance term (§3.6.1) | yes |
| `broker_price_per_dqu` | $40·(dqu/1000)^−0.10, floor $15 | ±50% | Money/DQU | 11 §3.4.3 | archive data (§3.4.3) | yes |
| `burnout_down` | 2 | 0.5× – 2× default ‡ | per GD | 11 §3.7.5 | burnout (§3.7.5) | yes |
| `burnout_threshold` | 60 | 0.5× – 2× default ‡ | per GD | 11 §3.7.5 | burnout (§3.7.5) | yes |
| `burnout_up` | 3 | 0.5× – 2× default ‡ | per GD | 11 §3.7.5 | burnout (§3.7.5) | yes |
| `card_repair_gd` | 3 | 1–10 | GD | 11 §3.3.1 | failed cards (§3.3.1) | yes |
| `card_repair_share` | 0.10 | 0.05–0.3 | share | 11 §3.3.1 | failed cards (§3.3.1) | yes |
| `checkpoint_compute_add` | 0.15 | 0–0.3 | share | 11 §3.6.6 | checkpointing (§3.6.6) | yes |
| `cluster_move_gd` | 2 | 0–10 | GD | 11 §4 | site moves (§4) | yes |
| `colo_price_per_mw_gd` | $600 | $300–$1,500 | Money/MW/GD | 11 §3.3.2 | colocation (§3.3.2) | yes |
| `data_compute_ratio_gamma` | 0.02 | 0.005–0.1 | DQU per PFd | 11 §3.6.1 | compute-optimal data (§3.6.1) | yes |
| `data_relevance` | §3.4.2 table | 0–1 | weight | 11 §3.4.2 | run data (§3.4.2) | yes |
| `decoy_apparent_max` | 1.5 | 1–3 | × own best MCS | 11 §3.14.6 | honeypots (§3.14.6) | yes |
| `delta_a_cap` | 1.5 | 0.5–3 | A | 11 §3.7.3 | researcher bonus (§3.7.3) | yes |
| `du_cap_compute_bonus` | 0.25 | 0–0.5 | share | 11 §3.3.7 | DU cap (§3.3.7) | yes |
| `du_hard_cap` | 2,000 | fixed by 11 | DU/tick | 11 §3.3.7 | per-character cap (RN A1, §3.3.7) Replaces `du_per_tick_per_player` (§5.2). | no (L) |
| `du_partition_cap` | 3,000,000 | fixed by 11 | DU/tick | 11 §3.10.4 | partition crunch (§3.10.4) Replaces `du_per_tick_per_partition` (§5.2). | no (L) |
| `ensemble_max_members` | 3 | 0.5× – 2× default ‡ | count | 11 §3.9.7 | ensembles (§3.9.7) | yes |
| `ensemble_other_weight` | 0.25 | 0.5× – 2× default ‡ | mult | 11 §3.9.7 | ensembles (§3.9.7) | yes |
| `eval_compute_coeff` | 0.002 | 0.5× – 2× default ‡ | PFd per MCS·symbol·GD | 11 §3.12 | evaluations (§3.12) | yes |
| `feed_tiers` | BASIC $5k/+2/0.70; PRO $20k/+10/0.85; ELITE $80k/+40/0.95 per 28 GD | ±50% | Money, DQU/GD, quality | 11 §3.4.3 | live feeds (§3.4.3) | yes |
| `finetune_c_carry` | 0.5 | 0–1 | share | 11 §3.6.5 | fine-tunes (§3.6.5) | yes |
| `finetune_d_carry` | 0.5 | 0–1 | share | 11 §3.6.5 | fine-tunes (§3.6.5) | yes |
| `fixed_power_premium` | 0.03 | 0–0.10 | share over forward | 11 §3.3.2 | fixed power price (§3.3.2) | yes |
| `freshness_floor` | 0.30 | 0.1–0.5 | mult | 11 §3.8.4 | effMCS (§3.8.4) | yes |
| `gate_hold_share` | 0.80 | 0.5–1 | share | 11 §3.9.1 | product gates (§3.9.1) | yes |
| `gpu_catalog` | §3.3.1 (GX10 $2k 33.6 PFd … DX900POD $2.4M 30,240 PFd) | ±30% | Money, PFd/GD, kWh/PFd | 11 §3.3.1 | hardware economics (§3.3.1) | yes |
| `graph_max_edges` | 400 | 0.5× – 2× default ‡ | count | 11 §4 | graphs (§4) | yes |
| `graph_max_nodes` | 200 | 0.5× – 2× default ‡ | count | 11 §4 | graphs (§4) | yes |
| `halflife_gd_<domain>` | MICRO 7, SENT 14, CRYPTO 21, MEDIA 28, EQ/COMM/SECY 56, FX/RATES/OPS 91, MACRO/PROP 182 | ×0.5–×2 | GD | 11 §3.4.1 | data and model freshness (§3.4.1) | yes |
| `heatwave_pue_add` | 0.10 | 0–0.3 | PUE | 11 §3.3.2 | heatwave events (§3.3.2) | yes |
| `home_site_mw` | 0.02 | 0.5× – 2× default ‡ | MW | 11 §3.3.2 | HOME site (§3.3.2) | yes |
| `home_site_pue` | 1.6 | 0.5× – 2× default ‡ | ratio | 11 §3.3.2 | HOME site (§3.3.2) | yes |
| `hparam_duration` | QUICK −20%, ABLATION +30% (+25% compute) | per owner table ‡ | share | 11 §3.6.4 | runs (§3.6.4) | yes |
| `hparam_fail_mult` | QUICK 1.6, CAREFUL 1.0, ABLATION 0.7 | per owner table ‡ | mult | 11 §3.6.6 | run failure (§3.6.6) | yes |
| `hw_storage_fee_share` | 0.002 | 0–0.01 | share of price per GD | 11 §8 | stored cards (§8.5) | yes |
| `incident_cleanup_share` | 0.005 | 0–0.05 | share of capital | 11 §3.15.2 | incidents (§3.15.2) | yes |
| `inference_coeffs` | §3.9.8 (0.8/0.6/0.5/0.3/0.0004; MOE 0.7) | per owner table ‡ | PFd | 11 §3.9.8 | inference (§3.9.8) | yes |
| `info_eta` | 0.8 | 0.5–1.5 | exponent | 11 §3.8.2 | estimate precision (§3.8.2) | yes |
| `info_m50` | 150 | 50–500 | MCS | 11 §3.8.2 | estimate precision (§3.8.2) | yes |
| `insight_mcs_bonus` | 0.03 | 0–0.1 | share | 11 §3.6.6 | after failure (§3.6.6) | yes |
| `lab_starter_grant_compute` | 200 | 0–1,000 | PFd | 11 §3.2 | one-time starter compute FAUCET (§3.2) | yes |
| `lab_unlock_nw` | $100,000 | $50k–$250k | Money | 11 §3.2 | when the Lab opens (§3.2) | yes |
| `launder_cost` | 0.25+0.35L | per owner table ‡ | mult | 11 §3.14.4 | laundering (§3.14.4) | yes |
| `leech_credit_life_gd` | 1 | 0.5× – 2× default ‡ | GD | 11 §3.14.7 | leech loot (§3.14.7) | yes |
| `license_mult` | 0.90 | 0.7–1 | mult | 11 §3.8.4 | licensee effMCS (§3.8.4) | yes |
| `license_ref_price` | $500 | 0.5× – 2× default ‡ | Money/GD/unit | 11 §3.9.5 | NPC logit (§3.9.5) | yes |
| `live_feed_halflife_floor` | 0.20 | 0.5× – 2× default ‡ | mult | 11 §3.8.4 | effMCS (§3.8.4) | yes |
| `live_feed_halflife_gd` | 7 | 0.5× – 2× default ‡ | GD | 11 §3.8.4 | effMCS (§3.8.4) | yes |
| `max_run_gd` | 60 | 20–120 | GD | 11 §3.6.4 | run planner limit (§3.6.4) | yes |
| `npc_hw_buyback_share` | 0.60 | 0.3–0.8 | share of book | 11 §3.3.1 | used hardware (§3.3.1) | yes |
| `npc_lab_run_interval` | 24/24/48/96/168/336 | per owner table ‡ | GD by tier | 11 §3.17 | NPC labs (§3.17) | yes |
| `npc_labs_launch` | 30 | 10–80 | labs | 11 §3.17 | NPC labs (§3.17) | yes |
| `npc_license_pool_per_gd` | $150,000 | $50k–$500k | Money/GD | 11 §3.9.5 | NPC licensing FAUCET (§3.9.5) | yes |
| `npc_vendor_stock_dx300` | 2,000 | 0.5× – 2× default ‡ | per vendor per chapter | 11 §6.3 | hardware supply (§6.3) | yes |
| `npc_vendor_stock_dx900` | 40 | 0.5× – 2× default ‡ | per vendor per chapter | 11 §6.3 | hardware supply (§6.3) | yes |
| `npc_vendor_stock_growth` | 0.10 | 0–0.3 | per chapter | 11 §6.3 | hardware supply (§6.3) | yes |
| `overfit_ratio` | 0.5 | 0.3–0.8 | ratio | 11 §3.12 | overfit flag (§3.12) | yes |
| `paper_min_gd` | 2 | 0–14 | GD | 11 §3.12 | staged deployment (§3.12) | yes |
| `partial_prob` | 0.25 | 0–0.5 | probability | 11 §3.6.6 | partial outcomes (§3.6.6) | yes |
| `partnership_incumbent_credit` | 0.10 | 0–0.25 | share | 11 §3.4.4 | re-auction (§3.4.4) | yes |
| `partnership_rep_gate` | 40 | 0–100 | Reputation | 11 §3.4.4 | eligibility (§3.4.4) | yes |
| `partnership_reserve` | $2M (T3+) / $250k (T2) | per owner table ‡ | Money/chapter | 11 §3.4.4 | auctions (§3.4.4) | yes |
| `partnership_slots_per_domain_bloc` | 3 | 1–6 | slots | 11 §3.4.4 | alt-data auctions (§3.4.4) | yes |
| `paused_no_compute_gh` | 24 | 6–72 | GH | 11 §3.3.5 | run auto-pause (§3.3.5) | yes |
| `pfail_clamp` | [0.01, 0.60] | per owner table ‡ | probability | 11 §3.6.6 | run failure (§3.6.6) | yes |
| `poison_regime_cap` | 0.10 | 0.5× – 2× default ‡ | share of capital | 11 §3.14.6 | poison (§3.14.6) | yes |
| `poison_regime_loss` | 0.02 | 0.5× – 2× default ‡ | share of capital | 11 §3.14.6 | poison (§3.14.6) | yes |
| `power_contract_gd` | 28, 91, 364 | per owner table ‡ | GD | 11 §3.3.2 | fixed power terms (§3.3.2) | yes |
| `proposal_expiry_ticks` | 30 | 10–360 | ticks | 11 §3.9.1 | ADVISORY orders (§3.9.1) | yes |
| `pue_options` | 1.45 / 1.25 (+20% shell) / 1.12 cold | 1.10–1.60 | ratio | 11 §3.3.2 | energy (§3.3.2) | yes |
| `query_q50_base` | 2,000 | 500–10,000 | queries | 11 §3.14.2 | query distillation (§3.14.2) | yes |
| `regime_fit_mult` | 0.70 | 0.5–1 | mult | 11 §3.8.4 | effMCS (§3.8.4) | yes |
| `registration_aum` | $50,000,000 | $5M–$500M | Money | 11 §3.16.1 | registration (§3.16.1) | yes |
| `registration_fee` | $25,000 + 0.01%/GY | per owner table ‡ | Money | 11 §3.16.1 | registration (§3.16.1) | yes |
| `registration_mcs` | 200 | 50–1,000 | MCS | 11 §3.16.1 | registration (§3.16.1) | yes |
| `research_speed_k` | 0.30 | 0–0.5 | share | 11 §3.5 | ARCHITECTURE speed-up (§3.5) | yes |
| `research_tree` | §3.5 table | per owner table ‡ | mixed | 11 §3.5 | research (§3.5) | yes |
| `researcher_pool_refresh_gd` | 7 | 1–28 | GD | 11 §3.7.1 | talent pool (§3.7.1) | yes |
| `reserved_exit_fee_share` | 0.5 | 0–1 | share of remainder | 11 §4 | early exit (§4) | yes |
| `reserved_price_mult` | 1.667 | 1.2–2.5 | × spot ref | 11 §3.3.3 | reserved cloud price $2.0/PFd (§3.3.3) | yes |
| `reserved_term_gd` | 30 | 7–91 | GD | 11 §3.3.3 | reserved commitment (§3.3.3) | yes |
| `residue_cut` | 0.7 | 0.5× – 2× default ‡ | mult | 11 §3.14.4 | laundering (§3.14.4) | yes |
| `residue_floor` | 0.03 | 0.5× – 2× default ‡ | mult | 11 §3.14.4 | laundering (§3.14.4) | yes |
| `retention_bounds` | [0.60, 0.90] | per owner table ‡ | share | 11 §3.14.1 | distillation (§3.14.1) | yes |
| `retention_cut` | 0.35 | 0.5× – 2× default ‡ | mult | 11 §3.14.4 | laundering (§3.14.4) | yes |
| `rogue_base` | 0.002 | 0–0.01 | per GD | 11 §3.15.1 | rogue episodes (§3.15.1) | yes |
| `safety_incident_base` | 0.0004 | 0–0.005 | per GD | 11 §3.15.2 | safety incidents (§3.15.2) | yes |
| `safety_skill_per_frontier` | 60 | 30–120 | skill | 11 §3.7.4 | safety coverage (§3.7.4) | yes |
| `salary_base` | $30,000 | 0.5× – 2× default ‡ | Money/GY | 11 §3.7.2 | salaries (§3.7.2) | yes |
| `salary_k` | 0.05 | 0.5× – 2× default ‡ | Money/GY | 11 §3.7.2 | salaries (§3.7.2) | yes |
| `sauce_poach_delta_a` | 0.2 | 0–0.5 | A | 11 §3.7.5 | poaching leak (§3.7.5) | yes |
| `scaling_alpha` | 0.15 | 0.10–0.25 | exponent | 11 §3.6.1 | compute returns (§3.6.1) | yes |
| `scaling_beta` | 0.12 | 0.08–0.20 | exponent | 11 §3.6.1 | data returns (§3.6.1) | yes |
| `scaling_k` | 2.31 | 1–4 | constant | 11 §3.6.1 | MCS scale (§3.6.1) | yes |
| `scrape_cash_per_dqu` | $2 | 0.5× – 2× default ‡ | per DQU | 11 §3.4.3 | scraping (§3.4.3) | yes |
| `scrape_compute_per_dqu` | 0.5 PFd | per owner table ‡ | per DQU | 11 §3.4.3 | scraping (§3.4.3) | yes |
| `scrape_flag_prob` | 0.03 | 0–0.2 | probability per job | 11 §3.4.3 | S1 claims (§3.4.3) | yes |
| `self_distill_compute` | 0.05 | 0.5× – 2× default ‡ | mult | 11 §3.6.5 | compression (§3.6.5) | yes |
| `self_distill_inference` | 0.40 | 0.5× – 2× default ‡ | mult | 11 §3.6.5 | compression (§3.6.5) | yes |
| `self_distill_retention` | 0.90 | 0.5× – 2× default ‡ | mult | 11 §3.6.5 | compression (§3.6.5) | yes |
| `shortage_lead_time_gd` | U(48, 240) | per owner table ‡ | GD | 11 §3.3.4 | chip shortage (§3.3.4) | yes |
| `shortage_rep_gate` | 50 | 0–100 | Reputation | 11 §3.3.4 | DX300/DX900 in shortages (§3.3.4) | yes |
| `signing_bonus_share` | 0.25 | 0–1 | share | 11 §3.7.2 | hiring (§3.7.2) | yes |
| `specialist_mult` | 1.40 | 0.5× – 2× default ‡ | mult, share | 11 §3.6.3 | A02 specialists (§3.6.3) | yes |
| `specialist_off_weight` | 0.2 | 0–0.5 | weight | 11 §3.4.2 | focusW (§3.4.2) | yes |
| `specialist_other` | 0.40 | 0.5× – 2× default ‡ | mult, share | 11 §3.6.3 | A02 specialists (§3.6.3) | yes |
| `specialist_share_min` | 0.70 | 0.5× – 2× default ‡ | mult, share | 11 §3.6.3 | A02 specialists (§3.6.3) | yes |
| `spot_max_share_of_npc_cloud` | 0.02 | 0.005–0.1 | share | 11 §3.3.3 | spot lease size cap (§3.3.3) | yes |
| `spot_preempt_util` | 0.90 | 0.8–0.98 | utilisation | 11 §3.3.3 | preemption onset (§3.3.3) | yes |
| `stage_min_gd` | 2 | 0.5× – 2× default ‡ | GD | 11 §3.12 | stage advance (§3.12) | yes |
| `stage_te_max` | 0.30 | 0.5× – 2× default ‡ | share | 11 §3.12 | stage advance (§3.12) | yes |
| `star_mult` | 1.5 | 0.5× – 2× default ‡ | Money/GY | 11 §3.7.2 | salaries (§3.7.2) | yes |
| `stealth_lab_rep_cost` | 5 | 0–20 | Reputation escrow | 11 §5 | frontier milestone suppression (§5) | yes |
| `student_window_gd` | 7 | 1–28 | GD | 11 §3.14.1 | capture expiry (§3.14.1) | yes |
| `success_noise_sigma` | 0.05 | 0–0.15 | log-sd | 11 §3.6.6 | MCS noise (§3.6.6) | yes |
| `synth_compute_per_dqu` | 0.3 | 0.1–1 | PFd | 11 §3.4.3 | synthetic data (§3.4.3) | yes |
| `synthetic_collapse_floor` | 0.2 | 0.5× – 2× default ‡ | share, mult | 11 §3.4.6 | model collapse (§3.4.6) | yes |
| `synthetic_collapse_slope` | 3 | 0.5× – 2× default ‡ | share, mult | 11 §3.4.6 | model collapse (§3.4.6) | yes |
| `synthetic_collapse_start` | 0.40 | 0.5× – 2× default ‡ | share, mult | 11 §3.4.6 | model collapse (§3.4.6) | yes |
| `tournament_capital` | $1M / $50M / $1B | per owner table ‡ | virtual Money | 11 §3.13 | divisions (§3.13) | yes |
| `tournament_prestige` | 50 / 30 / 20 | per owner table ‡ | Prestige | 11 §3.13 | top 3 (§3.13) | yes |
| `trusted_lab_reqs` | coverage 0.5, clean 95%, 2 chapters | per owner table ‡ | mixed | 11 §3.16.4 | trusted lab (§3.16.4) | yes |
| `watermark_default` | 0.8 | 0.5× – 2× default ‡ | strength | 11 §3.14.5 | watermarks (§3.14.5) | yes |
| `watermark_range` | 0.3–1.0 | per owner table ‡ | strength | 11 §3.14.5 | watermarks (§3.14.5) | yes |
| `withheld_world_gd` | 10 | 2–30 | GD | 11 §3.12 | evaluation (§3.12) | yes |
| `withheld_worlds_per_set` | 50 | 10–200 | worlds | 11 §3.12 | evaluation (§3.12) | yes |
| `world_pool_discount` | 0.05 | 0–0.2 | share below spot | 11 §3.3.5 | idle sales (§3.3.5) | yes |

### §4.11 12 — Conflict and intelligence (15 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `breach_ceiling` | 0.90 | 0.80–0.95 | prob | 12 §3.2 | max breach chance | yes |
| `breach_floor` | 0.01 | fixed (L2) | prob | 12 §3.2 | min breach chance when AP ≥ DP_eff/8 | no (L) |
| `decoy_rate_per_real_hour` | 0.05 | 0.03–0.08 | /hr | 12 §3.7.5 | benign anomaly rate per account (~1.2/day) | yes |
| `defense_unit_price` | $10,000 | 5k–20k | Money/unit/yr | 12 §3.3 | converts defense spend to budget units | yes |
| `joint_op_max_contributors` | 5 | 3–8 | count | 12 §2.4 | cap on joint-op AP stacking | yes |
| `npc_crew_ops_per_1000_active` | 2 | 1–5 | ops/1k/game day | 12 §6.1 | NPC criminal crew activity | yes |
| `pandemic_hack_rate_trigger` | 25 | 15–40 | ops/1k active/game day | 12 §3.6 | cyber-pandemic crisis trigger | yes |
| `patch_decay_per_real_day` | 0.02 | 0.01–0.04 | /day | 12 §3.5 | security debt decay toward 0.6 | yes |
| `perimeter_cost_per_unit` | $2,000 | 1k–4k | Money/unit/yr | 12 §3.4 | perimeter layer cost | yes |
| `session_ceiling` | 0.85 | fixed (L3) | fraction | 12 §3.7.2 | max distillation progress P | no (L) |
| `session_max_lifetime_ticks` | 7 real days | 3–10 real days | ticks | 12 §3.7.2 | hidden-session lifetime | yes |
| `session_offline_mult` | 0.25 | 0.1–0.4 | mult | 12 §3.7.2 | offline accrual slowdown | yes |
| `sessions_per_victim_max` | 3 | 2–4 | count | 12 §3.7.3 | hostile sessions per victim | yes |
| `victim_drain_cap` | 0.20 | 0.15–0.30 | fraction | 12 §3.7.3 | total hostile DU drain cap per victim | yes |
| `zero_day_duration` | 3–7 | 1–10 | real days | 12 §3.6 | zero-day patch penalty window | yes |

### §4.12 13 — Law, courts, regulators (27 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `reg_scrutiny_vol_ref` | 0.10 | 0.02–0.3 | share of market volume (5 GD) | E-47 (T13B-07) | scrutiny saturation [Quant] PROVISIONAL, E-48 | yes |
| `reg_scrutiny_delay_k` | 1.0 | 0–3 | × duration | E-47 (T13B-07) | approval slowdown at full scrutiny [Quant] PROVISIONAL, E-48 | yes |
| `appeal_fee_pct` | 0.02 | 0.01–0.03 | fraction of judgment | 13 §3.11 | appeal fee (refunded on win) | yes |
| `bar_civil` | 40 | 35–50 | points | 13 §2.1 | civil filing/verdict burden | yes |
| `bar_criminal` | 70 | 65–80 | points | 13 §2.1 | criminal burden | yes |
| `bar_regulator` | 55 | 50–65 | points | 13 §2.1 | regulator burden | yes |
| `case_sell_share_max` | 0.50 | 0.5× – 2× default ‡ | fraction of award | 13 §4 | case-selling assignee share | yes |
| `case_sell_share_min` | 0.30 | 0.5× – 2× default ‡ | fraction of award | 13 §4 | case-selling assignee share | yes |
| `counsel_logit_per_grade` | 0.15 | 0.10–0.20 | logit/grade | 13 §3.4 | counsel swing (cap ±0.75) | yes |
| `court_fee_pct` | 0.01 | 0.005–0.02 | fraction of claim | 13 §4 | filing fee (min $500) | yes |
| `evidence_decay_tau` | 21 | 14–28 | real days | 13 §2.1 | evidence exponential decay | yes |
| `fine_sink_share` | 0.85 | fixed | fraction | 13 §3.3 | fine destroyed | no (L) |
| `fine_vcf_share` | 0.10 | fixed | fraction | 13 §3.3 | fine to victim fund | no (L) |
| `fine_whistle_share` | 0.05 | fixed | fraction | 13 §3.3 | fine to whistleblower pool | no (L) |
| `garnishment_rate` | 0.30 | 0.20–0.40 | fraction of daily income | 13 §3.12 | garnishment plan | yes |
| `held_grace_ticks` | 720 | 360–1440 | ticks | 13 §3.10 | grace before Held starts (1 game day) | yes |
| `insurance_deductible_pct` | 0.10 | 0.05–0.25 | share of loss | 13 §8 | deductible floor (03 §11.2) Replaces `ins_min_deductible_pct` (§5.2). | yes |
| `malicious_prosecution_nw_pct` | 0.0025 | 0.001–0.005 | fraction of NW | 13 §4 | cost of a lost wrongful filing | yes |
| `max_active_investigations` | 3 | 2–5 | count | 13 §2.3 | suspects a victim can pursue at once | yes |
| `regulator_capacity_divisor` | 200 | 100–400 | active chars/investigation | 13 §2.7 | regulator finite attention | yes |
| `suspect_board_miss_rate` | 0.15 | 0.05–0.25 | prob | 13 §2.4 | chance the true attacker is off the board | yes |
| `vcf_advance_pct` | 0.50 | 0.25–0.60 | fraction | 13 §3.12 | victim-fund advance of an unpaid award | yes |
| `whistle_reward_pct` | 0.05 | 0.03–0.07 | fraction of fine | 13 §7.4 | whistleblower reward (cap $50M) | yes |
| `INV_SQRT_BASE` | 50_000_000_000 micro ($50,000) × MSI | PROVISIONAL | micro (real, × MSI) | 13 §4 | investigation progress base B: lowest PI cost (E-24, E-25) | yes |
| `INV_SQRT_GAIN_PPM` | 250_000 | PROVISIONAL | ppm | 13 §4 | progress at S = B (E-24, E-25) | yes |
| `INV_SQRT_CAP_PPM` | 1_000_000 | PROVISIONAL | ppm | 13 §4 | progress cap (E-24, E-25) | yes |
| `INV_SPEND_MIN` | 500_000_000 micro ($500) × MSI | PROVISIONAL | micro (real, × MSI) | 13 §4 | minimum investigation spend; lower spends are rejected (E-24, E-25) | yes |

### §4.13 14 — Progression and lifestyle (55 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `ceremony_idle_real_s` | 10 | 3–60 | real seconds | 14 §3.5 | idle time before a rank-up ceremony plays (§3.5.3) | yes |
| `chapter_active_days_min` | 10 | 5–30 | active real days | 14 §2.2 | eligibility for chapter-end awards and portraits (§2) | yes |
| `condition_decay_unpaid` | 0.02 | 0.005–0.1 | condition per unpaid day | 14 §3.6 | decay of unmaintained items (§3.6.9) | yes |
| `cos_queue_max` | 3 | 1–10 | intents | 14 §3.12 | Chief of Staff queued intents (§3.12.6) | yes |
| `dealer_buyback_haircut` | 0.15 | 0.05–0.4 | share | 14 §3.6 | NPC dealer buyback discount (§3.6.10) | yes |
| `drop_max_per_char` | 1 | 1–3 | units | 14 §3.6 | units of one drop per character (§3.6.3) | yes |
| `drop_scale_na` | 10,000 | 1k–100k | players | 14 §3.6 | LIMITED drop size scaling `max(1, N_a/x)^0.5` (§3.6.3) | yes |
| `drop_window_ticks` | 720 | 30–2,160 | ticks | 14 §3.6 | request window for a LIMITED drop (§3.6.3) | yes |
| `edition_max_price_multiple` | 3× | 1.5–10× | × production cost | 14 §3.6 | player edition sales to linked accounts (§3.6.7) | yes |
| `exam_retake_game_days` | 1 | 0–7 | game days | 14 §3.3 | wait before retaking a license exam (§3.3.1) | yes |
| `exam_valid_chapters` | 2 | 1–6 | chapters | 14 §8 | how long a passed exam stays valid without the license (§3.3) | yes |
| `experience_burst_game_days` | 60 | 14–182 | game days | 14 §3.7 | PP burst duration of experiences (§3.7.6) | yes |
| `fresh_start_cash_real` | $5,000 | $1k–$20k | real $ (× MSI) | 14 §3.13 | restricted cash on Fresh Start (§3.13.2) | yes |
| `fresh_start_clawback_real_days` | 7 | 1–14 | real days | 14 §3.13 | lookback for reversing transfers before a Fresh Start (§3.13.5) | yes |
| `fresh_start_cooldown_real_days` | 56 | 14–112 | real days | 14 §3.13 | cooldown between Fresh Starts (§3.13.5) | yes |
| `fresh_start_nw_line_real` | $1,000 | $0–$10k | real $ | 14 §3.13 | NW below which Fresh Start is available (§3.13.1) | yes |
| `guest_max_real_minutes` | 30 | 10–120 | real minutes | 14 §3.1 | guest play before registration is required (§3.1.1) Replaces `onb_account_required_minutes` (§5.2). | yes |
| `handle_change_fee_real` | $1,000 | $0–$100k | real $ | 14 §3.1 | handle change once per chapter, sink ACCT_HANDLE_FEE (§3.1.3) | yes |
| `handle_release_hold_chapters` | 1 | 0–4 | chapters | 14 §3.1 | how long a released handle stays reserved (§3.1.3) | yes |
| `home_city_change_fee_real` | $25,000 | $0–$1M | Money | 14 §3.1.5 | home city change sink (ruling in 24) Replaces `home_city_change_fee` (§5.2). | yes |
| `hosting_cooldown_real_hours` | 24 | 6–168 | real hours | 14 §3.12 | cooldown between hosted events (§3.12.2) | yes |
| `hosting_duration_ticks` | 720 | 360–2,160 | ticks | 14 §2.14 | length of a hosted event (§3.12.2) | yes |
| `house_founding_fee_real` | $10,000,000 | $1M–$100M | real $ | 14 §3.15 | founding a House (§3.15.1) | yes |
| `house_heirlooms_max` | 12 | 4–24 | items | 14 §2.15 | heirlooms per House (§3.15.3) | yes |
| `house_title_pp_share` | 0.5 | 0–1 | share | 14 §3.5 | PP that predecessor titles keep in a House (§3.5.2, §3.15.5) | yes |
| `license_grace_game_days` | 7 | 1–28 | game days | 14 §3.3 | grace after a failed renewal before LAPSED (§3.3.3) | yes |
| `lifestyle_cost_share_max` | 25% | 10–40% | of R4 income | 14 §3.17 | balance target for lifestyle running costs; 20 tunes upkeep down if exceeded (§3.17 sink sanity) | yes |
| `paid_storage_rate` | 1% | 0.25–5% | of value per game year | 14 §3.6 | paid storage for items not displayed (§3.6.6) | yes |
| `patrons_per_city` | 12 | 5–25 | players | 14 §3.16 | Hall of Patrons seats per city (§3.16.4) | yes |
| `probate_ticks` | 17,280 | 720–69,120 | ticks | 14 §3.15 | succession probate (§3.15.4) | yes |
| `profile_pinned_receipts_max` | 6 | 3–12 | count | 14 §2.2 | pinned receipts on the profile (§2) | yes |
| `rank_r6_floor_real` | $20,000,000,000 | $5B–$100B | real $ | 14 §3.2 | R6 Dynasty net-worth floor (§3.2.3) | yes |
| `rank_r6_streak_closes` | 24 | 1–168 | day closes | 14 §3.2 | consecutive closes inside top N for R6 (§3.2.3) | yes |
| `rank_r6_top_n` | 50 | 10–200 | positions | 14 §3.2 | R6 board position requirement (§3.2.3) | yes |
| `rent_min_cash_real` | $1,000 | $0–$10k | real $ | 14 §3.7 | rent waived below this cash (§3.7.1) | yes |
| `rep_philanthropy_chapter_cap` | 20 | 5–40 | points per chapter | 14 §3.10 | Reputation from donations (§3.10.2) | yes |
| `rep_start` | 50 | 30–70 | points | 14 §2.11 | starting Reputation (§3.10.1) | yes |
| `restore_game_days` | 3 | 1–14 | game days | 14 §3.6 | restoration time (§3.6.9) | yes |
| `secondary_homes_max` | 9 | 1–20 | count | 14 §2.9 | secondary homes per character (§2) | yes |
| `starter_gift_lock_real_days` | 7 | 0–30 | real days | 14 §3.7 | lock on gifted starter items (§3.7.3) | yes |
| `summit_early_bid_ticks` | 30 | 0–360 | ticks | 14 §3.6 | Summit Club early bidding on UNIQUE lots (§3.6.4) | yes |
| `wire_purchase_threshold_real` | $10,000,000 | $1M–$100M | real $ | 14 §3.6 | displayed purchases that post to the Wire (§3.6.2) | yes |
| `rank_r1_threshold_real` | $20,000 | — | real $ NW (compared to NW/MSI) | 14 §3.2.2 | rank R1 threshold; E-21, E-28 | no |
| `rank_r2_threshold_real` | $250,000 | — | real $ NW (compared to NW/MSI) | 14 §3.2.2 | rank R2 threshold; E-21, E-28 | no |
| `rank_r3_threshold_real` | $5,000,000 | — | real $ NW (compared to NW/MSI) | 14 §3.2.2 | rank R3 threshold; E-21, E-28 | no |
| `rank_r4_threshold_real` | $100,000,000 | — | real $ NW (compared to NW/MSI) | 14 §3.2.2 | rank R4 threshold, PROVISIONAL; E-21, E-28 | no |
| `rank_r5_threshold_real` | $2,000,000,000 | — | real $ NW (compared to NW/MSI) | 14 §3.2.2 | rank R5 threshold, PROVISIONAL; E-21, E-28 | no |
| `license_fee_lic1_real` | $250 | — | real $ × MSI | 14 §3.3 | LIC1 fee (paid by ACCT_ONBOARD_GRANT); E-28 | yes |
| `license_fee_lic2_real` | $15,000 | — | real $ × MSI | 14 §3.3 | LIC2 fee; E-21, E-28 | yes |
| `license_fee_lic3_real` | $250,000 | — | real $ × MSI | 14 §3.3 | LIC3 fee; E-28 | yes |
| `license_fee_lic4_real` | $5,000,000 | — | real $ × MSI | 14 §3.3 | LIC4 fee; E-28 | yes |
| `license_renewal_share` | 100,000 ppm (10%) LIC2–LIC4; LIC1 0 | — | ppm of fee per game year | 14 §3.3 | licence renewal; LIC1 renewal 0 (E-28 corrects E-21) | yes |
| `protection_real_hours` | 72 (51,840 ticks) | — | real hours | 13; 14 | new-character protection; E-28 | yes |
| `rookie_zone_real_days` | 7 (120,960 ticks) | — | real days | 13; 14 | rookie zone ends at this age or at rookie_zone_nw_real, whichever first; E-28 | yes |
| `rookie_zone_nw_real` | $1,000,000 | — | real $ NW (compared to NW/MSI) | 13 | rookie zone NW exit; E-28 | yes |

### §4.14 15 — Multiplayer and social (22 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `alliance_hop_cooldown_real_hours` | 48 | 12–168 | real hours | 15 §3.7 | wait before joining another alliance (§3.7) | yes |
| `alliance_vote_game_days` | 24 | 6–72 | game days | 15 §3.7 | alliance vote duration (§3.7) | yes |
| `chat_max_chars` | 500 | 200–1,000 | characters | 15 §2.9 | chat message length (§3.9) | yes |
| `chat_retention_real_days` | 90 | 30–365 | real days | 15 §3.9 | chat retention, except contract threads (§3.9) | yes |
| `contract_clauses_max` | 12 | 4–24 | clauses | 15 §2.6 | clause count per contract (§3.6) | yes |
| `contract_max_term_game_days` | 2,912 | 364–5,824 | game days | 15 §3.6 | maximum contract term (§3.6.6) | yes |
| `contract_registration_fee` | 0.5% | 0.1–2% | of notional real, min $100, max $5M | 15 §3.6 | contract registration sink (§3.6.8) | yes |
| `country_board_hysteresis_days` | 14 | 3–56 | real days | 15 §3.2 | below 450 before losing the board (§3.2) | yes |
| `country_board_min_active` | 500 | 100–2,000 | active characters | 15 §2.1 | own country board (§3.2) | yes |
| `country_change_real_days` | 180 | 30–365 | real days | 15 §3.2 | country change frequency (§3.2.2) | yes |
| `link_hard` | 0.7 | 0.5–0.9 | score | 15 §3.12 | linked-account threshold (§3.12) | yes |
| `link_soft` | 0.4 | 0.2–0.6 | score | 15 §3.12 | suspect threshold (§3.12) | yes |
| `na_decay_real_days` | 7 | 3–30 | real days | 15 §3.1 | activity-weighted player count `N_a` used for drops, caps, dynasty targets (§3.1) | yes |
| `p2p_tax` | 2% | 0–5% | of transferred value | 15 §3.6 | tax on one-directional P2P transfers, principal exempt (§3.6.8, §3.6.12) | yes |
| `payment_grace_game_days` | 3 | 0–7 | game days | 15 §3.6 | grace before a missed payment is a default (§3.6.6) | yes |
| `push_cap_per_real_day` | 5 | 1–20 | pushes | 15 §3.11 | push notifications per day, SECURITY and MARGIN up to 10 (§3.11) Replaces `push_max_per_real_day`, `ui_push_daily_cap` (§5.2). | yes |
| `registrar_fee_real` | $5,000 | $500–$50k | real $ | 15 §3.8 | late auto-filing fee (§3.8) | yes |
| `statement_resolve_game_days` | 5 | 1–14 | game days | 15 §3.10 | statement fact-check window (§3.10.4) | yes |
| `wire_halflife_ticks` | 360 | 60–2,160 | ticks | 15 §3.10 | Wire recency decay (§3.10) | yes |
| `wire_page` | 50 | 20–100 | items | 15 §3.10 | Wire page size (§3.10) | yes |
| `wire_post_fee_real` | $500 | $0–$10k | real $ | 15 §3.10 | Wire statement fee, max 3 per game day (§3.10) | yes |
| `wywa_min_absence_real_minutes` | 20 | 5–240 | real minutes | 15 §3.11 | While You Were Away card trigger (§3.11) | yes |

### §4.15 16 — Living world (90 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `actor_action_margin` | 0.05 | 0–0.2 | utility | 16 §3.3 | NPC act-vs-no-op threshold (§3.3.3) | yes |
| `actor_actions_per_epoch` | 2 | 1–4 | actions | 16 §3.3 | actions per decision epoch (§3.3.3) | yes |
| `actor_aging_rate` | 0.25 | 0.1–1 | actor-years per game year | 16 §3.4 | actor aging (§3.4.6) | yes |
| `actor_cap` | 2,000 | 600–10,000 | actors | 16 §3.13 | actor population cap (§3.13) | yes |
| `actor_full_evals_per_tick` | 2,000 | 500–10,000 | evaluations | 16 §3.1 | full actor decisions per tick (§3.1.2) | yes |
| `actor_memory_cap` | 64 | 16–256 | items | 16 §2.2 | actor memory size (§2.2) | yes |
| `actor_react_salience` | 0.5 | 0.2–0.9 | salience | 16 §3.3 | reactive epoch trigger (§3.3.4) | yes |
| `actor_rel_cap` | 48 | 16–128 | relationships | 16 §2.2 | relationships kept per actor (§2.2) | yes |
| `briefs_per_real_day` | 3 | 1–5 | briefs | 16 §3.12 | opportunity briefs (§3.12) | yes |
| `campaign_cap_per_quarter` | 0.15 | 0.05–0.3 | support | 16 §3.5 | issue campaign cap per bloc and axis (§3.5.8) | yes |
| `campaign_min_real` | $1M (E-35, PROVISIONAL [Quant]) | $100k–$10M | real $ per buy | 16 §3.5 | minimum issue campaign buy (§3.5.8) | yes |
| `campaign_coeff` | 0.05 | 0.01–0.1 | support per ln unit | 16 §3.5 | issue campaign effect (§3.5.8) | yes |
| `coalition_collapse_approval` | 0.20 (E-34, PROVISIONAL [Quant]) | 0.1–0.4 | approval | 16 §3.5 | coalition breakup (§3.5.3) | yes |
| `committee_game_days` | 14 | 7–56 | game days | 16 §3.5 | bill committee stage (§3.5.5) | yes |
| `coalition_collapse_max_per_chapter` | 1 (E-34, PROVISIONAL [Quant]) | 1–3 | per bloc per chapter | 16 §3.5 | collapse cap (§3.5.3) | yes |
| `consequence_max_depth` | 4 | 2–8 | links | 16 §3.8 | cascade depth (§3.8.3) | yes |
| `contribution_cap_real` | $5M | $100k–$50M | real $ per donor per party per cycle | 16 §3.5 | contributions (§3.5.9) | yes |
| `dynasty_head_retire_age` | 60 (E-34, PROVISIONAL [Quant]) | 55–75 | actor-years | 16 §3.4 | head retirement age (§3.4.6) | yes |
| `dynasty_head_retire_p_actor_year` | 0.3 (E-34, PROVISIONAL [Quant]) | 0.1–0.6 | per actor-year (×0.25 per GY) | 16 §3.4 | head retirement probability (§3.4.6) | yes |
| `dynasty_formation_nw_real` | $5B | $1B–$50B | real $ | 16 §3.4 | new dynasty formation (§3.4.7) | yes |
| `election_interval_game_years` | 4 | 2–8 | game years | 16 §3.5 | elections (§3.5.9) | yes |
| `era_min_chapters` | 2 | 1–6 | chapters | 16 §3.10 | era spacing (§3.10.3) | yes |
| `era_thresholds` | [0, 8, 18, 30, 40] (E-36, PROVISIONAL [Quant]) | per owner table ‡ | eraScore | 16 §3.10.3 | era changes (§3.10.3) | yes |
| `fact_sale_base_real` | $5,000 (E-35, PROVISIONAL [Quant]) | $5k–$250k | real $ | 16 §3.11 | fact sale price (§3.11.4) | yes |
| `fact_sale_min_rank` | R2 (E-35, PROVISIONAL [Quant]) | R1–R4 | rank | 16 §3.11 | fact sale gate (§3.11.4) | yes |
| `fact_sale_cap_real_per_chapter` | $100k (E-35, PROVISIONAL [Quant]) | $100k–$10M | real $ per character | 16 §3.11 | FACT_SALE_NPC transfer cap (§3.11.4) | yes |
| `history_permanent` | 0.6 | 0.4–0.9 | significance | 16 §3.9 | permanent history (§3.9.1) | yes |
| `history_threshold` | 0.4 | 0.2–0.7 | significance | 16 §3.9 | history recording (§3.9.1) | yes |
| `info_fee_cap_pct_nw_per_game_day` | 0.05% | 0.01–0.2% | of NW | 16 §3.6 | Terminal plus Research Desk fee cap (§3.6.6) | yes |
| `labor_share` | 0.55 | 0.45–0.65 | share of output | 16 §3.2 | wage bill (§3.2.2) | yes |
| `legislature_seats` | 300 | 100–600 | seats | 16 §3.5 | per-bloc legislature (§3.5.1) | yes |
| `lf_share` | 0.5 | 0.4–0.6 | ratio | 16 §2.1 | labor force Replaces `participation_rate` (§5.2). | yes |
| `lobby_coeff` | 0.25 | 0.1–0.5 | logit per √($1M) | 16 §3.5 | lobbying strength, clamp ±0.75 (§3.5.7) | yes |
| `lobby_registration_fee_real` | $10,000 | $1k–$100k | real $ | 16 §3.5 | lobbying registration (§3.5.7) | yes |
| `lobby_window_game_days` | 91 | 28–182 | game days | 16 §3.5 | lobbying spend memory (§3.5.7) | yes |
| `major_exo_rate` | RETIRED (E-29) | — | per chapter | 16 §3.7 | retired: MAJOR crises are drawn only by 04 (`macro_major_base_rate`); kept as a derived report-only figure (E-28 §8) | no |
| `major_precursor_min_game_days` | 8 | 4–20 | game days | 16 §3.7 | MAJOR telegraph (§3.7.3) | yes |
| `major_suppression_game_days` | 336 | 0–1,344 | game days | 16 §3.7 | quiet after a player-caused crisis (§3.7.3) | yes |
| `memory_halflife_game_days` | 90 × (0.5 + patience) | 30–364 base | game days | 16 §3.3 | memory decay (§3.3.5) | yes |
| `news_publish_threshold` | 0.05 (E-28/E-29) | 0.05–0.4 | newsworthiness | 16 §3.6 | news candidates (§3.6.2) | yes |
| `news_target_per_game_day` | 40 | 20–120 | items | 16 §3.6 | news volume (§3.6.2) | yes |
| `npc_fund_max_participation` | 0.5 | 0.1–1 | × ADV per tick | 16 §3.3 | NPC fund trading cap (§3.3.8) | yes |
| `npc_illegal_integrity_max` | 0.25 | 0–0.5 | trait | 16 §3.3 | which NPCs consider illegal actions (§3.3.3) | yes |
| `petition_threshold_real` | $50M | $5M–$500M | real $ | 16 §3.5 | petition bill sink (§3.5.4) | yes |
| `petition_window_game_days` | 28 (E-35, PROVISIONAL [Quant]) | 7–91 | game days | 16 §3.5 | petition commitment window (§3.5.4) | yes |
| `rnd_share` | 0.025 | 0.01–0.05 | share of output | 16 §3.2 | NPC R&D by domain (§3.2.2, §3.10) | yes |
| `rumor_accuracy_max` | 0.70 | 0.3–0.8 | probability | 16 §3.6 | rumor source accuracy band (§3.6.7) | yes |
| `rumor_accuracy_min` | 0.40 | 0.3–0.8 | probability | 16 §3.6 | rumor source accuracy band (§3.6.7) | yes |
| `rumor_fade_halflife_game_days` | 1 | 0.25–5 | game days | 16 §3.6 | rumor price impulse fade (§3.6.7) | yes |
| `rumors_per_game_day` | 8 | 2–20 | rumors | 16 §3.6 | rumor volume (§3.6.7) | yes |
| `tech_base_cost_chapters` | 1.3 (E-36, PROVISIONAL [Quant]) | 0.5–4 | baseline chapters of R&D | 16 §3.10 | tech pace (§3.10.1) | yes |
| `tech_cost_growth` | 1.25 | 1.1–1.6 | × per level | 16 §3.10 | tech cost escalation (§3.10.1) | yes |
| `tip_accuracy` | 0.85 | 0.6–0.95 | probability | 16 §3.6 | tip truth rate (§3.6.8) | yes |
| `trust_contract_gain_cap` | +20 | 5–50 | trust per pair per game quarter | 16 §3.3.5 | trust farming counter (§3.3.5) | yes |
| `vote_noise_sd` | 0.5 | 0.1–1 | logit | 16 §3.5 | floor vote noise (§3.5.6) | yes |
| `agg_intermediate_share` | 0.30 | — | share of output | 16 §3.2 | intermediate (B2B) share; never fed back as demand (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_base` | 0.18 | — | share of output | 16 §3.2 | investment base (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_sent_coef` | 0.5 | — | — | 16 §3.2 | investment sentiment term (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_rate_coef` | 5 | — | per unit rate gap | 16 §3.2 | investment rate term (E-28: 2→5) (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_clamp_lo` | 0.08 | — | share of output | 16 §3.2 | investment clamp low (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_clamp_hi` | 0.28 | — | share of output | 16 §3.2 | investment clamp high (Quant, E-28, PROVISIONAL) | yes |
| `agg_invest_construction_share` | 0.6 | — | share of investment | 16 §3.2 | investment routed to CONSTRUCTION (Quant, E-28, PROVISIONAL) | yes |
| `agg_dividend_payout` | 0.5 | — | share of profit | 16 §3.2 | NPC firm dividends (Quant, E-28, PROVISIONAL) | yes |
| `agg_hh_div_passthrough` | 0.3 | — | share | 16 §3.2 | dividends reaching households (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_base` | 0.85 | — | — | 16 §3.2 | mpc centre (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_sent_coef` | 0.05 | — | — | 16 §3.2 | mpc sentiment term (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_rate_coef` | 2.5 | — | per unit rate gap | 16 §3.2 | mpc rate term (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_credit_coef` | 0.03 | — | — | 16 §3.2 | mpc credit term (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_min` | 0.70 | — | — | 16 §3.2 | mpc floor (Quant, E-28, PROVISIONAL) | yes |
| `agg_mpc_max` | 0.95 | — | — | 16 §3.2 | mpc cap (Quant, E-28, PROVISIONAL) | yes |
| `agg_wealth_effect_gy` | 0.04 | — | per game year | 16 §3.2 | wealth effect on deposits (Quant, E-28, PROVISIONAL) | yes |
| `agg_automation_floor` | 0.85 | — | — | 16 §3.2 | automation factor floor (Quant, E-28, PROVISIONAL) | yes |
| `housing_emp_elasticity` | 0.5 | — | — | 16 §3.2 | housing demand sensitivity to employment (Quant, E-28, PROVISIONAL) | yes |
| `housing_emp_window_gd` | 30 | — | game days | 16 §3.2 | employment change scaled to 30-GD rate (×30) (Quant, E-28, PROVISIONAL) | yes |
| `housing_ema_gd` | 30 | — | game days | 16 §3.2 | housing demand EMA (Quant, E-28, PROVISIONAL) | yes |
| `activity_lambda_base` | 2 | — | events per bloc per GD | 16 §3.2 | ordinary activity λ base (Quant, E-28, PROVISIONAL) | yes |
| `activity_lambda_slope` | 100 | — | per unit g | 16 §3.2 | ordinary activity λ slope (Quant, E-28, PROVISIONAL) | yes |
| `activity_lambda_min` | 1 | — | events | 16 §3.2 | λ clamp low (Quant, E-28, PROVISIONAL) | yes |
| `activity_lambda_max` | 9 | — | events | 16 §3.2 | λ clamp high (Quant, E-28, PROVISIONAL) | yes |
| `activity_count_max` | 12 | — | events | 16 §3.2 | daily count cap per bloc (Quant, E-28, PROVISIONAL) | yes |
| `info_terminal_floor_real` | $20 | — | real $ × MSI per GD | 16 §3.6 | Terminal floor price (Quant, E-28, PROVISIONAL) | yes |
| `info_terminal_nw_rate_gd` | 2e-6 | — | of NW per GD | 16 §3.6 | Terminal NW rate (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_fee_t1_real` | $100 | — | real $ × MSI per GD | 16 §3.6 | analyst T1 (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_fee_t2_real` | $600 | — | real $ × MSI per GD | 16 §3.6 | analyst T2 (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_fee_t3_real` | $2,500 | — | real $ × MSI per GD | 16 §3.6 | analyst T3 (Quant, E-28, PROVISIONAL) | yes |
| `info_desk_fixed_real` | $1,500 | — | real $ × MSI per GD | 16 §3.6 | Research Desk fixed (Quant, E-28, PROVISIONAL) | yes |
| `info_desk_nw_rate_gd` | 1e-5 | — | of NW per GD | 16 §3.6 | Research Desk NW rate (Quant, E-28, PROVISIONAL) | yes |
| `info_desk_query_real` | $25,000 | — | real $ × MSI per query | 16 §3.6 | Research Desk query (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_sigma_t1` | 0.6 | — | × release σ | 16 §3.6 | T1 forecast error (E-29) (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_sigma_t2` | 0.4 | — | × release σ | 16 §3.6 | T2 forecast error (Quant, E-28, PROVISIONAL) | yes |
| `info_analyst_sigma_t3` | 0.25 | — | × release σ | 16 §3.6 | T3 forecast error (Quant, E-28, PROVISIONAL) | yes |
| `rumor_impulse_coef` | 0.5 | — | — | 16 §3.6 | rumorImpulse = coef·(2·cred−1)·expected move (Quant, E-28, PROVISIONAL) | yes |
| `rumor_cred_prior_mean` | 0.5 | — | — | 16 §3.6 | credibility prior mean (Quant, E-28, PROVISIONAL) | yes |
| `rumor_cred_prior_weight` | 10 | — | resolutions | 16 §3.6 | credibility prior weight k, shared by the NPC rumorImpulse credibility (§3.6.7) and the public credBand (17 `news`, errata E-56 §3); confirmed by Quant in E-56 | yes |
| `rumor_cred_band_low` | 0.40 | 0.30–0.50 | fraction | 16 §3.6 | public credBand cutoff: score < value → LOW (17 `news`, errata E-56 §3; Quant); must stay < `rumor_cred_band_solid` | yes |
| `rumor_cred_band_solid` | 0.65 | 0.55–0.75 | fraction | 16 §3.6 | public credBand cutoff: score ≥ value → SOLID, inclusive (errata E-56 §3; Quant) | yes |
| `actor_risk_kappa` | 1.0 | — | — | 16 §3.3 | risk weight κ (Quant, E-32, PROVISIONAL) | yes |
| `actor_trust_weight` | 0.3 | — | — | 16 §3.3 | trust term weight (±0.30) (Quant, E-32, PROVISIONAL) | yes |
| `actor_memory_weight` | 0.3 | — | — | 16 §3.3 | memory term weight (Quant, E-32, PROVISIONAL) | yes |
| `actor_memory_term_cap` | 0.3 | — | — | 16 §3.3 | memory term floor −cap per counterparty (Quant, E-32, PROVISIONAL) | yes |
| `actor_tau_base` | 0.05 | — | — | 16 §3.3 | softmax τ at patience 1 (Quant, E-32, PROVISIONAL) | yes |
| `actor_tau_impatience` | 0.15 | — | — | 16 §3.3 | τ slope in (1−patience) (Quant, E-32, PROVISIONAL) | yes |
| `pol_median_drift_sd` | 0.05 | — | per axis per quarter | 16 §3.5 | voterMedian noise sd (Quant, E-32, PROVISIONAL) | yes |
| `strike_logit_intercept` | -6.5 | — | — | 16 §3.7 | strike logit intercept (was −4) (Quant, E-32, PROVISIONAL) | yes |
| `strike_cooldown_gd` | 91 | — | game days | 16 §3.7 | no ballot within this after settlement (Quant, E-32, PROVISIONAL) | yes |
| `dispute_logit_intercept` | -3 | — | — | 16 §3.4 | dynasty dispute logit intercept (Quant, E-32, PROVISIONAL) | yes |
| `world_event_storm_gap_gd` | 7 | — | game days | 16 §3.7 | min gap from a 04 storm (Quant, E-32, PROVISIONAL) | yes |

### §4.16 17 — UX and screens (37 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `ui_abbrev_threshold` | 10,000 | 1,000–1,000,000 | $ | 17 §3.4.1 | money abbreviation in lists, chips, sentences (§3.4.1) | no (C) |
| `ui_amount_words_threshold` | 10,000 | 1,000–1,000,000 | $ | 17 §7.15 | contract amounts in words | no (C) |
| `ui_bell_history` | 200 | 50–1,000 | notifications | 17 §3.10.4 | bell centre size | no (C) |
| `ui_bg_unsubscribe_s` | 30 | 10–120 | s | 17 §3.18 | heavy-channel unsubscribe for hidden windows | no (C) |
| `ui_broker_windows_max` | 4 | 1–8 | windows | 17 §3.2.5 | Broker instances | no (C) |
| `ui_city_render_fps_threshold` | 45 | 30–55 | fps | 17 §3.18 | city tier fallback | no (C) |
| `ui_close_min_presence_real_min` | 10 | 1–60 | real minutes | 17 §17 | daily close shown only if present this long that game day | no (C) |
| `ui_connections_refresh_ticks` | 30 | 30 (fixed by 02 §4.2) | ticks | 17 §2.6 | connections panel refresh | no (L) |
| `ui_cost_confirm_threshold_abs` | 10,000 | 1,000–100,000 | $ | 17 §3.8 | CostConfirmSheet trigger | no (C) |
| `ui_cost_confirm_threshold_pct_nw` | 1% | 0.1–5% | of NW | 17 §3.8 | CostConfirmSheet trigger | no (C) |
| `ui_fat_finger_pct` | 10% | 2–50% | from last price | 17 §3.8 | limit-price warning | no (C) |
| `ui_heap_budget_mb` | 300 | 200–500 | MB | 17 §3.18 | phone memory budget | no (C) |
| `ui_hold_confirm_ms` | 1,200 | 800–3,000 | ms | 17 §3.5 | HoldToConfirm | no (C) |
| `ui_impact_warn_bp` | 50 | 10–200 | bp | 17 §3.8 | large-impact confirmation | no (C) |
| `ui_js_budget_kb` | 200 | 150–300 | KB gz | 17 §3.18 | Broker route bundle Replaces `client_js_budget_kb` (§5.2). | no (C) |
| `ui_large_order_warn_adv_pct` | 5% | 1–20% | of ADV | 17 §3.8 | large-order confirmation | no (C) |
| `ui_layouts_max` | 5 | 1–10 | layouts | 17 §2.1 | custom layouts | no (C) |
| `ui_moment_expiry_real_min` | 60 (daily close 10) | 5–240 | real minutes | 17 §10 | moment queue expiry | no (C) |
| `ui_moment_gap_ms` | 8,000 | 3,000–30,000 | ms | 17 §3.9 | minimum gap between full-screen moments (§3.9) | no (C) |
| `ui_moment_idle_ms` | 10,000 | 3,000–30,000 | ms | 17 §3.9 | idle time required before a moment | no (C) |
| `ui_moment_skip_after_ms` | 1,000 | 0–3,000 | ms | 17 §3.9 | when a moment becomes skippable | no (C) |
| `ui_pending_timeout_ticks` | 6 | 3–20 | ticks | 17 §3.7 | pending intent status query | no (C) |
| `ui_perf_tick_render_ms` | 8 | 4–16 | ms p95 | 17 §3.18 | tick render budget Replaces `client_tick_render_ms` (§5.2). | no (C) |
| `ui_presentation_changes_per_day` | 10 | 1–50 | per real day | 17 §4.1 | `acct.presentation.set` rate | no (C) |
| `ui_push_attack_extra_cap` | 5 | 0–10 | pushes / real day | 17 §3.10.5 | extra P0 pushes during attack/margin events | no (C) |
| `ui_push_reask_days` | 7 | 1–30 | real days | 17 §3.10.5 | push permission re-ask gate | no (C) |
| `ui_quiet_end` | 08:00 | any | local time | 17 §2.1 | quiet hours default | no (C) |
| `ui_quiet_start` | 22:00 | any | local time | 17 §2.1 | quiet hours default | no (C) |
| `ui_reconnect_replay_game_days` | 1 | 0.5–2 | game days | 17 §3.7 | delta replay window on reconnect | no (C) |
| `ui_share_link_days` | 7 | 1–30 | real days | 17 §4.2 | share image URL validity | no (C) |
| `ui_takeover_max_delay_ms` | 10,000 | 3,000–30,000 | ms | 17 §3.9 | world-event takeover dropped after this delay | no (C) |
| `ui_text_scale_max` | 2.0 | 1.5–2.0 | × | 17 §3.16 | text scaling | no (C) |
| `ui_toast_max_visible` | 3 | 1–5 | toasts | 17 §3.10.2 | toast stack (§3.10.2) | no (C) |
| `ui_toast_ms` | 4,000 | 2,000–10,000 | ms | 17 §3.10.2 | toast lifetime | no (C) |
| `ui_watchlist_size` | 50 | 10–50 | lists / symbols | 17 §2.1 | watchlists | no (C) |
| `ui_watchlists_max` | 20 | 5–50 | lists / symbols | 17 §2.1 | watchlists | no (C) |
| `ui_wywa_min_away_real_min` | 30 | 10–120 | real minutes | 17 §7.1 | WYWA trigger | no (C) |

### §4.17 18 — Onboarding and Academy (26 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `acad_knowledge_pass_pct` | 70 | 50–100 | % | 18 §3.10 | knowledge quiz pass | yes |
| `acad_practice_idle_pause_min` | 5 | 1–30 | real minutes | 18 §3.10 | sandbox auto-pause | yes |
| `acad_practice_max_life_h` | 24 | 1–72 | real hours | 18 §8 | sandbox auto-end | yes |
| `acad_practice_notional` | 100,000 | 10,000–10,000,000 | $ (sandbox) | 18 §3.10 | practice balance | yes |
| `acad_practice_real_minutes_per_day` | 120 | 30–480 | real minutes | 18 §3.10 | sandbox runtime budget | yes |
| `expl_desk_base` | 2,500 | 0–50,000 | $ / NW per game week | 18 §3.12 | Research Desk upkeep | yes |
| `expl_desk_max_window_days` | 1,344 | 30–5,000 | game days | 18 §4 | desk query window | yes |
| `expl_desk_pct_nw` | 0.03% | 0–0.2% | $ / NW per game week | 18 §3.12 | Research Desk upkeep | yes |
| `expl_desk_queries_per_real_hour` | 60 | 10–600 | queries | 18 §4 | desk rate limit | yes |
| `expl_junior_base` | 40 | 0–500 | $ / NW per game week | 18 §3.12 | Junior analyst salary | yes |
| `expl_junior_pct_nw` | 0.005% | 0–0.05% | $ / NW per game week | 18 §3.12 | Junior analyst salary | yes |
| `expl_senior_base` | 150 | 0–2,000 | $ / NW per game week | 18 §3.12 | Senior analyst salary | yes |
| `expl_senior_pct_nw` | 0.015% | 0–0.1% | $ / NW per game week | 18 §3.12 | Senior analyst salary | yes |
| `onb_advisor_notes_per_day` | 1 | 0–3 | notes / real day | 18 §3.13 | advisor notes | yes |
| `onb_bg_discount_pct` | 10 | 0–20 | % | 18 §3.2 | background discount on first highlighted business | yes |
| `onb_choice_etf_amount` | 1,000 | 200–2,000 | $ | 18 §3.3.1 | first-choice ETF card amount | yes |
| `onb_coach_gap_s` | 20 | 5–60 | real seconds | 18 §3.9 | coach mark spacing | yes |
| `onb_first_trade_cap_pct` | 20 | 5–50 | % of cash | 18 §3.3.4 | first buy cap | yes |
| `onb_goal_cards` | 3 | 1–5 | goals | 18 §3.4 | visible goals | yes |
| `onb_goal_ladder_days` | 14 | 7–28 | real days | 18 §3.4 | goal ladder lifetime | yes |
| `onb_jit_later_real_min` | 60 | 10–240 | real minutes | 18 §3.8 | "Show me later" delay | yes |
| `onb_jit_max_per_session` | 3 | 1–6 | intros | 18 §3.8 | JIT per session | yes |
| `onb_jit_min_gap_real_min` | 10 | 5–60 | real minutes | 18 §3.8 | spacing of JIT intros | yes |
| `onb_retail_grant` | 250 | fixed by 00 §5.9 | $ | 18 §3.2 | onboarding Retail-broker grant | no (L) |
| `onb_stop_explainer_drawdown` | 1 | 0.5–5 | % below cost | 18 §3.3.1 | stop explainer trigger | yes |
| `onb_stop_preset_pct` | 5 | 2–15 | % below cost | 18 §3.3.1 | pre-filled stop price | yes |

### §4.18 19 — Tech architecture (91 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `access_token_ttl_min` | 15 | 5–60 | min | 19 §3.9 | native access token lifetime | no (E) |
| `ai_workers_per_partition` | cores − 2 | ≥ 1 | threads | 19 §3.11 | AI worker pool | no (E) |
| `api_min_account_age_days` | 7 | 0–60 | real days | 19 §3.10 | API eligibility | no (E) |
| `api_sig_skew_s` | 60 | 10–300 | s | 19 §3.10 | signed HTTP time window | no (E) |
| `auth_attempts_per_15min` | 10 | 3–50 | count | 19 §3.8 | auth throttling | no (E) |
| `auth_captcha_after_failures` | 5 | 2–20 | count | 19 §3.9 | challenge threshold | no (E) |
| `batch_archive_lag_ticks` | 60 | 10–720 | ticks | 19 §3.4 | batch archive to object storage | no (E) |
| `bus_replicas` | 3 | 3–5 | count | 19 §3.4 | durability of BATCH | no (E) |
| `catchup_gap_ms` | 200 | 50–1000 | ms | 19 §3.3 | inter-tick gap while catching up | no (E) |
| `catchup_max_ticks` | 120 | 10–1000 | ticks | 19 §3.3 | before the clock re-bases | no (E) |
| `catchup_trigger_ticks` | 3 | 1–20 | ticks | 19 §3.3 | CATCHING_UP status | no (E) |
| `coord_failover_missed_heartbeats` | 3 | 2–10 | count | 19 §3.2 | coordinator failover trigger | no (E) |
| `coord_heartbeat_ms` | 500 | 100–2000 | ms | 19 §3.2 | coordinator heartbeat (§3.2.3) | no (E) |
| `deletion_grace_days` | 14 | 0–30 | real days | 19 §3.14 | deletion grace period | no (E) |
| `deploy_replay_game_days` | 1 | 1–7 | game days | 19 §3.6 | golden replay before deploy | no (E) |
| `dev_tick_ms` | 5000 (dev only) | 100–5000 | ms | 19 §3.18 | fast clock in local development | no (E) |
| `entropy_epoch_ticks` | 720 | 120–2880 | ticks | 19 §3.12 | entropy epoch length | no (E) |
| `export_sla_days` | 30 | 1–30 | real days | 19 §3.14 | data export SLA | no (E) |
| `gateway_max_sockets` | 10000 | 1000–50000 | sockets | 19 §3.9 | gateway capacity | no (E) |
| `gateway_queue_max` | 200000 | 10000–1000000 | intents | 19 §8 | gateway queue while sealing is blocked | no (E) |
| `gateway_seal_margin_ms` | 150 | 50–500 | ms | 19 §3.4 | intake cut-off before seal | no (E) |
| `host_cpu_target` | 0.7 | 0.4–0.9 | ratio | 19 §3.5 | host packing | no (E) |
| `http_rps_per_account` | 10 | 2–50 | per s | 19 §3.8 | HTTP rate limit per account | no (E) |
| `http_rps_per_ip` | 20 | 5–100 | per s | 19 §3.8 | HTTP rate limit per IP | no (E) |
| `intent_clock_skew_ms` | 600000 | 60000–3600000 | ms | 19 §3.4 | ULID time window | no (E) |
| `intent_dedupe_window_ticks` | 17280 | 720–86400 | ticks | 19 §3.4 | dedupe set | no (E) |
| `intents_per_tick_per_actor` | 20 | 5–50 | intents | 19 §3.8 | 00 §5.5 limit | no (E) |
| `intents_per_tick_per_principal` | 100 | 20–500 | intents | 19 §3.8 | cap on a character plus its operators | no (E) |
| `ip_hash_salt_rotation_days` | 30 | 7–90 | real days | 19 §3.14 | IP hash salt rotation | no (E) |
| `max_api_keys` | 5 | 1–20 | count | 19 §3.10 | API keys per account | no (E) |
| `max_book_subs` | 4 | 1–16 | count | 19 §3.8 | book channels per socket | no (E) |
| `max_frames_per_s` | 50 | 10–200 | per s | 19 §3.8 | socket frame rate | no (E) |
| `max_intent_bytes` | 16384 | 1024–65536 | bytes | 19 §3.4 | intent frame size | no (E) |
| `max_keys_per_session` | 2 | 1–4 | count | 19 §4.2 | signing keys per session | no (E) |
| `max_moves_per_boundary` | 4 | 1–32 | count | 19 §3.5 | moves per snapshot boundary | no (E) |
| `max_preview_per_tick` | 5 | 1–20 | per tick | 19 §3.8 | intent previews | no (E) |
| `max_req_per_s` | 10 | 1–50 | per s | 19 §3.8 | socket read requests | no (E) |
| `max_sockets_per_account` | 4 | 1–10 | count | 19 §3.8 | concurrent sockets per account | no (E) |
| `max_sub_changes_per_s` | 10 | 1–50 | per s | 19 §3.8 | subscribe/unsubscribe rate | no (E) |
| `max_subscriptions_per_socket` | 64 | 16–256 | count | 19 §3.8 | subscriptions per socket | no (E) |
| `migration_max_lock_ms` | 1000 | 100–5000 | ms | 19 §3.16 | database migration locks | no (E) |
| `min_inter_tick_gap_ms` | 200 | 50–1000 | ms | 19 §3.3 | gap after a late commit | no (E) |
| `nonce_window` | 64 | 16–1024 | count | 19 §3.4 | replay window | no (E) |
| `npc_du_per_tick_per_partition` | 500000 | 100000–2000000 | DU | 19 §6 | NPC work budget | no (E) |
| `partition_failover_missed_heartbeats` | 3 | 2–10 | count | 19 §3.7 | partition failure trigger | no (E) |
| `partition_rto_s` | 60 | 10–600 | s | 19 §3.7 | partition recovery target | no (E) |
| `partition_target_agents` | 25000 | 5000–50000 | agents | 19 §3.5 | PLAYER partition size | no (E) |
| `pg_pitr_days` | 35 | 7–90 | real days | 19 §3.7 | PostgreSQL point-in-time recovery window | no (E) |
| `phase_budget_ms_P0` | 100 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P0 (00 §5.2) | no (E) |
| `phase_budget_ms_P1` | 250 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P1 (00 §5.2) | no (E) |
| `phase_budget_ms_P10` | 150 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P10 (00 §5.2) | no (E) |
| `phase_budget_ms_P11` | 100 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P11 (00 §5.2) | no (E) |
| `phase_budget_ms_P12` | 150 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P12 (00 §5.2) | no (E) |
| `phase_budget_ms_P13` | 250 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P13 (00 §5.2) | no (E) |
| `phase_budget_ms_P14` | 300 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P14 (00 §5.2) | no (E) |
| `phase_budget_ms_P2` | 50 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P2 (00 §5.2) | no (E) |
| `phase_budget_ms_P3` | 200 | 100–1,000 | ms per tick | 19 §3.3.3 | P3 time budget (§3.1.2; ruling in 24) Replaces `world_phase_budget_ms` (§5.2). | no (E) |
| `phase_budget_ms_P4` | 300 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P4 (00 §5.2) | no (E) |
| `phase_budget_ms_P5` | 900 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P5 (00 §5.2) | no (E) |
| `phase_budget_ms_P6` | 600 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P6 (00 §5.2) | no (E) |
| `phase_budget_ms_P7` | 300 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P7 (00 §5.2) | no (E) |
| `phase_budget_ms_P8` | 300 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P8 (00 §5.2) | no (E) |
| `phase_budget_ms_P9` | 300 | 20–2000 | ms | 19 §3.3.3 | wall-time budget of pipeline phase P9 (00 §5.2) | no (E) |
| `phase_hard_timeout_ms` | 15000 | 5000–60000 | ms | 19 §3.3 | point at which a partition is declared failed | no (E) |
| `platform_key_rotation_days` | 90 | 30–365 | real days | 19 §3.9 | platform key rotation | no (E) |
| `presence_intent_window_ticks` | 180 | 60–720 | ticks | 19 §3.8 | presence definition (15 real minutes) | no (E) |
| `projector_lag_ticks_p95` | 2 | 1–20 | ticks | 19 §3.10 | read-model lag target | no (E) |
| `proto_min_version` | current−1 | int | – | 19 §3.8 | minimum client protocol | no (E) |
| `proto_overlap_days` | 14 | 7–60 | real days | 19 §3.8 | protocol version overlap | no (E) |
| `rebalance_trigger_days` | 3 | 1–14 | game days | 19 §3.5 | split/merge trigger | no (E) |
| `replay_max_ticks` | 8640 | 720–86400 | ticks | 19 §4.2 | replay request size | no (E) |
| `resume_buffer_ticks` | 720 | 120–2880 | ticks | 19 §3.8 | `me` resume buffer | no (E) |
| `security_change_hold_hours` | 24 | 0–72 | real hours | 19 §3.9 | value-removal hold after a security change | no (E) |
| `session_idle_days` | 30 | 1–90 | real days | 19 §3.9 | web session idle expiry | no (E) |
| `session_max_days` | 90 | 7–365 | real days | 19 §3.9 | absolute session lifetime | no (E) |
| `sg_max_depth` | 32 | 8–128 | levels | 19 §3.11 | strategy-graph depth | no (E) |
| `sg_max_fanout` | 16 | 4–64 | edges | 19 §3.11 | strategy-graph fan-out | no (E) |
| `sg_max_nodes` | 400 | 50–2000 | nodes | 19 §3.11 | strategy-graph size | no (E) |
| `slo_delta_p95_ms` | 500 | 100–2000 | ms | 19 §3.15 | SLO | no (E) |
| `slo_tick_lateness_p99_ms` | 500 | 100–2000 | ms | 19 §3.15 | SLO | no (E) |
| `slo_world_availability` | 0.999 | 0.99–0.9999 | ratio | 19 §3.15 | SLO | no (E) |
| `snapshot_max_ticks` | 60 | 10–360 | ticks | 19 §3.7 | snapshot write deadline | no (E) |
| `target_client_bytes_per_tick` | 4096 | 1024–16384 | bytes | 19 §3.8 | bandwidth target | no (E) |
| `tick_trace_sample` | 60 | 1–720 | 1 in N | 19 §3.15 | tick tracing sample rate | no (E) |
| `world_rto_s` | 900 | 300–3600 | s | 19 §3.7 | whole-world recovery target | no (E) |
| `ws_hard_buffer_bytes` | 4194304 | 1048576–33554432 | bytes | 19 §3.8 | slow-consumer close | no (E) |
| `ws_idle_timeout_s` | 45 | 15–300 | s | 19 §3.8 | idle socket close | no (E) |
| `ws_json_frames` | false (dev only) | bool | – | 19 §3.8 | JSON frames in development | no (E) |
| `ws_ping_s` | 15 | 5–60 | s | 19 §3.8 | client ping interval | no (E) |
| `ws_soft_buffer_bytes` | 1048576 | 262144–8388608 | bytes | 19 §3.8 | backpressure on public channels | no (E) |
| `ws_ticket_ttl_s` | 60 | 10–300 | s | 19 §3.8 | socket ticket lifetime | no (E) |

### §4.19 20 — Verification and balance (31 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `inv_rehypo_max_chain` | 1 | 0–2 | re-uses | 20 §3.1.4 | max rehypothecation chain length checked by INV-BS-007 (07 owns re-use rules) | no (V) |
| `inv_xpart_settle_max_ticks` | 2 | 1–4 | ticks | 20 §3.1.4 | max life of a cross-partition hold before INV-BS-012 fails | no (V) |
| `tm_adapt_dd_penalty` | 0.5 | 0–2 | λ | 20 §3.5 | drawdown penalty in adaptive reward | no (V) |
| `tm_adapt_epoch_days` | 21 | 7–63 | game days | 20 §3.5 | adaptive agent learning epoch | no (V) |
| `tm_adapt_population` | 32 | 8–128 | vectors | 20 §3.5 | cross-entropy population per epoch | no (V) |
| `tm_bisect_budget_ms` | 20000 | 5000–60000 | ms | 20 §3.2 | wall budget for bisection before world halt | no (V) |
| `tm_bisect_max_trials` | 24 | 8–64 | trials | 20 §3.2 | bisection trials per failing tick (Rule 3.2.3) | no (V) |
| `tm_canary_ticks` | 720 | 180–2880 | ticks | 20 §3.9 | G4 canary run against live batches | no (V) |
| `tm_disclosure_max_gain` | $100,000 or 5% NW (larger) | per owner table ‡ | real $ | 20 §3.16 | safe-harbour gain limit | no (V) |
| `tm_disclosure_max_uses` | 3 | 1–10 | uses | 20 §3.16 | safe-harbour use limit | no (V) |
| `tm_disclosure_window_ticks` | 17280 | 720–51840 | ticks | 20 §3.16 | exploit disclosure safe-harbour window (1 real day) | no (V) |
| `tm_engaged_active_hours_per_real_day` | 1.5 | 1–2 | real hours | 20 §3.7 | definition of "engaged" agent for wealth bands | no (V) |
| `tm_equivalence_partition_counts` | [1, 4, 16] | list | partitions | 20 §3.3 | partition-equivalence shapes (DEFAULT from caller) | no (V) |
| `tm_hotfix_canary_ticks` | 60 | 12–360 | ticks | 20 §3.9 | shortened canary on hotfix path | no (V) |
| `tm_hunt_farm_worlds` | 32 | 4–256 | worlds | 20 §3.6 | continuous exploit-hunt farm size | no (V) |
| `tm_invariant_budget_share` | 0.10 | 0.05–0.20 | share of P13 | 20 §3.2 | invariant cost budget (never sampled) | no (V) |
| `tm_live_band_breach_days` | 3 | 1–14 | game days | 20 §3.11 | consecutive live breaches before an E6 Finding | no (V) |
| `tm_mirror_retention_days` | 14 | 1–30 | real days | 20 §3.5 | lifetime of pseudonymized production mirror worlds | no (V) |
| `tm_oracle_excess_min` | 0.5 | 0.1–2 | pp per game day | 20 §3.6 | O-RISKFREE excess threshold | no (V) |
| `tm_oracle_grief_ratio` | 20 | 5–100 | loss/cost | 20 §3.6 | O-GRIEF threshold | no (V) |
| `tm_oracle_mint_tolerance` | 0.001 | 0.0001–0.01 | × traded notional | 20 §3.6 | O-MINT residual tolerance | no (V) |
| `tm_property_runs_nightly` | 10000 | 1000–100000 | cases | 20 §3.4 | cases per property nightly / G1 | no (V) |
| `tm_property_runs_pr` | 200 | 50–1000 | cases | 20 §3.4 | fast-check cases per property on PRs | no (V) |
| `tm_quarantine_repeat_window_ticks` | 17280 | 720–86400 | ticks | 20 §3.2 | second quarantine of same (actor, kind) blocks the kind | no (V) |
| `tm_report_min_count` | 5 | 3–20 | count | 20 §3.12 | suppression threshold in integrity report | no (V) |
| `tm_reports_per_day` | 5 | 1–20 | reports | 20 §4 | exploit reports per account per real day | no (V) |
| `tm_shadow_max_lag_ticks` | 720 | 180–2880 | ticks | 20 §3.11 | shadow lag target; 2× pages INC-3 | no (V) |
| `tm_shadow_verifiers` | 1 | 1–4 | hosts | 20 §3.11 | live shadow verifiers | no (V) |
| `tm_tick_alert_ms` | 3500 | 2500–4500 | ms | 20 §3.1.7 | tick wall time that pages on-call (INV-ENG-010) | no (V) |
| `tm_tick_p99_ms` | 2500 | 1000–4000 | ms | 20 §3.14 | load-gate tick commit p99 | no (V) |
| `tm_trading_days_per_year` | 260 | 252–260 | days | 20 §3.7 | Sharpe annualization in metrics | no (V) |

### §4.20 21 — LiveOps, admin, monetization, compliance (39 keys)

| key | default | range | unit | owner § | what it affects | live |
|---|---|---|---|---|---|---|
| `ad_callback_max_age_minutes` | 30 | 5–120 | real minutes | 21 §3.14 | ad verification callback freshness | no (G) |
| `ad_clock_mark_minutes` | 15 | 15 (fixed by tz offsets) | real minutes | 21 §3.14 | wall-clock mark cadence | no (L) |
| `ad_faucet_alert_share` | 0.0001 | 0.00001–0.001 | share of net mint | 21 §3.14 | AD_GRANT alert | yes |
| `ad_grant_real` | $250 | locked L12 | real $ | 21 §3.14 | ad grant (×MSI) | no (L) |
| `ad_max_per_local_day` | 10 | locked L12 | ads | 21 §3.14 | daily ad cap | no (L) |
| `ad_min_account_age_hours` | 24 | 24–168 | real hours | 21 §3.14 | ad eligibility account age | no (G) |
| `ad_min_hours_between_days` | 20 | 18–24 | real hours | 21 §3.14 | min gap between ad-day evaluations | no (G) |
| `ad_nw_line_real` | $1,000 | locked L12 | real $ | 21 §3.14 | ad eligibility NW line (×MSI) | no (L) |
| `adm_access_window_hours` | 8 | 1–24 | real hours | 21 §3.1 | just-in-time private-data access window | no (G) |
| `adm_critical_delay_minutes` | 30 | 10–120 | real minutes | 21 §3.2 | CRITICAL action cancel window | no (G) |
| `adm_halt_market_confirm_minutes` | 60 | 15–120 | real minutes | 21 §3.2 | single-signer market halt auto-resume | no (G) |
| `adm_mass_threshold` | 100 | 20–1000 | characters | 21 §3.2 | mass action becomes CRITICAL | no (G) |
| `adm_request_expiry_hours` | 72 | 24–168 | real hours | 21 §3.2 | approval request expiry | no (G) |
| `age_gate_retry_block_days` | 1 | 0–7 | real days | 21 §3.9 | device retry block after under-16 | no (G) |
| `audit_retention_years` | 10 | 5–15 | real years | 21 §3.2 | audit log retention (ruling in 24) Replaces `audit_retention_days` (§5.2). | no (G) |
| `clawback_income_share` | 0.30 | 0.1–0.5 | share of daily income | 21 §3.6 | clawback repayment schedule | yes |
| `comp_min_real` | $10 | $1–$1,000 | real $ | 21 §3.6 | minimum compensation/clawback line | yes |
| `dr_replication_lag_max_minutes` | 5 | 1–15 | real minutes | 21 §3.18 | standby-site replication lag | no (G) |
| `dr_rto_minutes` | 60 | 15–240 | real minutes | 21 §3.18 | site-loss recovery time objective | no (G) |
| `enf_appeal_window_days` | 30 | 14–60 | real days | 21 §3.7 | appeal window | no (G) |
| `enf_ban_estate_days` | 30 | 14–90 | real days | 21 §3.7 | banned character's unique assets to estate | no (G) |
| `enf_min_confidence` | 0.8 | 0.6–0.95 | 0..1 | 21 §3.7 | confidence for actions above WARNING | no (G) |
| `enf_repeat_window_days` | 180 | 90–365 | real days | 21 §3.7 | repeat-offence window | no (G) |
| `liveops_balance_notice_hours` | 48 | 24–168 | real hours | 21 §3.4 | BALANCE patch notice | no (G) |
| `liveops_boundary_shift_on_halt` | true | bool | — | 21 §3.3 | chapter boundary moves by halt duration in last 48 h | no (G) |
| `liveops_maintenance_max_minutes` | 30 | 10–60 | real minutes per event | 21 §3.3 | owned by 21 Rule 3.3.3 (one event per real week, quietest hour); 02 §3.19.3 cites it (ruling in 24) Replaces `maintenance_max_minutes_per_real_week` (§5.2). | no (G) |
| `liveops_param_step_max_share` | 0.25 | 0.05–0.5 | share of 23 range | 21 §3.4 | max param move per BALANCE patch | no (G) |
| `liveops_rollout_stage_min_days` | 7 | 3–28 | real days | 21 §3.4 | feature rollout stage length | no (G) |
| `liveops_rules_notice_days` | 14 | 7–28 | real days | 21 §3.4 | RULES patch notice | no (G) |
| `liveops_tournament_lock` | "Sun 18:00 UTC" | any weekly time | — | 21 §3.5 | AI tournament entry lock | no (G) |
| `mod_hold_threshold` | 0.85 | 0.6–0.95 | score | 21 §3.8 | classifier hold for review | no (G) |
| `mod_reports_per_day` | 20 | 5–50 | reports | 21 §3.8 | report rate limit | no (G) |
| `mod_sample_share` | 0.1 | 0–0.5 | share | 21 §3.8 | sampling of mid-score messages | no (G) |
| `pass_festival_bonus_max` | 0.25 | 0–0.5 | share | 21 §3.12 | festival mark bonus cap | yes |
| `pass_items_return_chapters` | 2 | 1–4 | chapters | 21 §3.12 | premium items return to Atelier | yes |
| `pass_marks_per_tier` | 100 | 50–200 | marks | 21 §3.12 | Chapter Pass tier cost | yes |
| `spend_cap_minor_monthly_16_17` | €50 | €20–€100 | currency | 21 §3.11 | monthly spend cap for 16_17 | no (G) |
| `support_tickets_per_day` | 5 | 1–20 | reports | 21 §4.1 | support report rate Replaces `ui_support_reports_per_day` (§5.2). | no (G) |
| `tz_change_cooldown_days` | 30 | 1–180 | real days | 21 §3.14 | timezone change limit (L12 day boundary) Replaces `timezone_change_cooldown_days` (§5.2). | no (G) |

## §5 Conflicts and how they are resolved

Rule (00 §3.5): the owner module's value wins. The spec files were reconciled after the first version of this registry (24 §6 rulings, 24 §7 reconciliation log). Each row below carries a **status** recomputed from the current files: *resolved* means the losing key or value no longer appears in any spec file or notes table (checked by the script), with the ruling that settled it; *open* means a file still needs the correction named. This registry edits no other file.

### §5.1 Same key, two different defaults

| # | key | values found | adopted (owner) | correction | status |
|---|---|---|---|---|---|
| 5.1.1 | `stab_deadband` | _notes/04-notes.md: 0.10 vs 03 §3.7.3: 0.05 | **0.05 (03 §3.7.3)** | _notes/04-notes.md | resolved — 24 R04; §7 #73 |
| 5.1.2 | `stab_ki` | _notes/04-notes.md: 0.1 vs 03 §3.7.3: 0.02 | **0.02 (03 §3.7.3)** | _notes/04-notes.md | resolved — 24 R04; §7 #73 |
| 5.1.3 | `stab_lever_ranges` | _notes/04-notes.md "L1–L4 lever ranges" (old 04 §2.11 set: ERP drift, top bracket, price level, fee mult 0.5–2.0) vs 03 §3.7.4 (L1 demand, L2 price index, L3 levy, L4 upkeep) | **03 §3.7.4 lever set** | _notes/04-notes.md row deleted; 04 §3.17 defers to 03 | resolved — 24 R04; §7 #12, #18, #73 |

### §5.2 Two keys for the same quantity

Each row keeps one canonical key (the owner's) and lists the alias keys that were to disappear. "Alias still found in" is the script's scan of files 00–21 and their notes.

| # | canonical key (owner) | adopted value | alias key → file that was to be corrected | values differed? | reason for owner | status |
|---|---|---|---|---|---|---|
| 5.2.1 | `new_city_na_step` (10) | 4,000 | `na_per_new_city` → 15 (spec + notes)<br>`city_open_na_step` → 21 §3.4 Rule 3.4.6 (spec + notes) | no (name only) | 10 owns city openings (00 §1); 15 owns N_a, 21 schedules the event | resolved — 24 R29; §7 #35, #50, #72 |
| 5.2.2 | `macro_major_min_gap_days` (04) | 504 | `major_min_gap_game_days` → 16 §3.7.3 (spec + notes) | no (name only) | 04 owns crises (00 §1, 04 §3.16); 16 generates the news and named-actor reactions | resolved — 24 R29; R08; §7 #53 |
| 5.2.3 | `macro_storm_rate` (04) | 1 per 91 game days | `storm_rate` → 16 §3.7.1 (spec + notes) | no (name only) | 04 §3.16 crisis schedule | resolved — 24 R29; R08; §7 #53 |
| 5.2.4 | `macro_ripple_rate` (04) | 1 per 7 game days | `ripple_rate` → 16 §3.7.1 (spec + notes) | no (name only) | 04 §3.16 crisis schedule | resolved — 24 R29; R08; §7 #53 |
| 5.2.5 | `push_cap_per_real_day` (15) | 5 (SECURITY and MARGIN pushes may add up to 5 more, total 10) | `push_max_per_real_day` → 21 (spec + notes)<br>`ui_push_daily_cap` → 17 §3.10.5 (spec + notes) — ui_push_attack_extra_cap = 5 stays a 17 key and must read "the +5 allowance of 15 §3.11" | no (name only) | 15 §3.11 owns notifications; 17 only renders | resolved — 24 R29; §7 #55, #72 |
| 5.2.6 | `home_city_change_fee_real` (14) | $25,000 real (× MSI), once per chapter, sink ACCT_HOME_CITY_FEE | `home_city_change_fee` → 10 §3.4 "Home city" (spec + notes) — 10 states $2,500 + 0.05% of NW: a different value, not just a different name | **yes** | 14 §3.1.5 owns the character and its home city; 10 only consumes it | resolved — 24 R29; §7 #34 |
| 5.2.7 | `du_hard_cap` (11) | 2,000 DU per tick per character | `du_per_tick_per_player` → 19 (spec + notes) — 19 notes already say "owned by 11" | no (name only) | 11 owns DU budgets (RESOLVED-NUMBERS A1, 00 §5.5) | resolved — 24 R29; §7 #62 |
| 5.2.8 | `du_partition_cap` (11) | 3,000,000 DU per tick per partition | `du_per_tick_per_partition` → 19 (spec + notes) | no (name only) | 11 §3.10.4 owns the partition crunch | resolved — 24 R29; §7 #62 |
| 5.2.9 | `audit_retention_years` (21) | 10 real years (= 3,650 real days) | `audit_retention_days` → 19 §3.8 storage table (spec + notes) — 19 states 2,555 days (7 years): a different value | **yes** | 21 Rule 3.2.5 owns the admin audit log and its compliance retention; 19 only stores it | resolved — 24 R29; §7 #59 |
| 5.2.10 | `tz_change_cooldown_days` (21) | 30 real days | `timezone_change_cooldown_days` → 19 exploit table row 25 (spec + notes) | no (name only) | 21 enforces the L12 ad day boundary that the limit protects | resolved — 24 R29; §7 #62 |
| 5.2.11 | `ui_perf_tick_render_ms` (17) | 8 ms | `client_tick_render_ms` → 19 Rule 3.17.3 (spec + notes) | no (name only) | 17 owns client performance budgets per screen; 19 names the device profile | resolved — 24 R29; §7 #56, #62 |
| 5.2.12 | `ui_js_budget_kb` (17) | 200 KB gzipped | `client_js_budget_kb` → 19 Rule 3.17.3 (spec + notes) | no (name only) | as above | resolved — 24 R29; §7 #56, #62 |
| 5.2.13 | `phase_budget_ms_P3` (19) | 200 ms | `world_phase_budget_ms` → 16 §3.1.2 (spec + notes) — 16 states 300 ms: a different value | **yes** | 19 §3.3 owns every phase wall budget P0–P14 | resolved — 24 R29; R27; §7 #51. 24 R27: 19's `phase_budget_ms_P*` are the operational wall budgets; 02 §3.5.1's per-phase column is a p99 compute design target (sum 2,500 ms), not a parameter |
| 5.2.14 | `insurance_deductible_pct` (13) | 0.10 of each claim | `ins_min_deductible_pct` → 08 (spec + notes) — 08 may keep a policy-design floor only by citing this key | no (name only) | 13 owns claim adjudication including the deductible (13 §2, accepted by 08) | resolved — 24 R29; §7 #26 |
| 5.2.15 | `entropy_reveal_lag_ticks` (02) | 1,000 ticks | `entropy_reveal_delay_ticks` → 19 (spec + notes) | no (name only) | 02 §3.11 owns entropy commit/reveal | resolved — 24 R29; R28; §7 #62. 24 R28: 19's epoch scheme implements 02's commit-reveal |
| 5.2.16 | `guest_max_real_minutes` (14) | 30 real minutes | `onb_account_required_minutes` → 18 §3.2.1 (spec + notes) | no (name only) | 14 §3.1.1 owns accounts (guest state) | resolved — 24 R29; §7 #57 |
| 5.2.17 | `cross_bloc_settle_delay_ticks` (10) | 720 ticks (1 game day) | `cross_bloc_setup_delay_game_days` → 14 §3.12.5 (spec + notes) | no (name only) | 10 owns property and premises settlement; 14 only removes it for jet owners | resolved — 24 R29; §7 #45 |
| 5.2.18 | `support_tickets_per_day` (21) | 5 per real day | `ui_support_reports_per_day` → 17 (spec + notes) | no (name only) | 21 owns support | resolved — 24 R29; §7 #56 |
| 5.2.19 | `lf_share` (16) | 0.5 | `participation_rate` → 10 §3.4.1 (spec + notes) | no (name only) | 16 owns the aggregate household sector and labor force (16 §2.1) | resolved — 24 R29; §7 #35 |
| 5.2.20 | `macro_fx_uip_share` (04) | 0.5 | `fx_uip_pass` → 06 §3.9.2 (spec + notes) — 06 states 0.30: a different value | **yes** | 04 §3.13.1 owns FX fair value and FX regimes; 06 prices the pairs from it | resolved — 24 R29; §7 #24 |
| 5.2.21 | `stab_min_sample` (03) | 200 characters | `stab_min_population` → 04 notes only (04 spec already defers to 03) — 04 notes state 50 players: a different value | **yes** | 03 §3.7 owns the Stabilizer (00 §5.4, RECONCILE ruling) | resolved — 24 R29; R04; §7 #73 |
| 5.2.22 | `stab_observe_game_days` (03) | 168 game days (7 real days) | `stab_observe_only_real_days` → 04 notes only — same duration, other unit | no (name only) | 03 §3.7.5 | resolved — 24 R29; R04; §7 #73 |
| 5.2.23 | `intent_max_age_ticks` (02) | 3 ticks; older intents are rejected REJECT_STALE | `max_client_tick_lag` → 19 Rule 3.4.2 (spec + notes) — 19 states 12 ticks and re-seals NEXT intents instead of rejecting: different value and behaviour | **yes** | 02 §3.12 owns P0 ingest validation (00 §5.2) | resolved — 24 R29; §7 #58 |
| 5.2.24 | `liveops_maintenance_max_minutes` (21) | 30 real minutes per event, at most one event per real week, in the lowest-CCU hour | `maintenance_max_minutes_per_real_week` → 02 §3.19.3 (spec + notes) — 02 states 20 minutes per week starting Saturday t = 0: different value and slot | **yes** | 21 §3.3 owns world-control procedures; 02 provides the HALT/RESUME mechanics | resolved — 24 R29; §7 #9 |

### §5.3 Same key listed in two notes tables

After reconciliation, several non-owner notes tables list the **owner's key** as a cross-reference (24 §7, open follow-up). The registry lists each such key **once**, in §4 under its owner; the non-owner row is a citation, not a second definition. No correction is needed while the values agree; if they ever differ, the owner row wins and the row moves to §5.1.

| key | owner (row in §4) | also listed in | values agree? |
|---|---|---|---|
| `audit_retention_years` | 21 §3.2 | _notes/19-notes.md | yes |
| `chat_retention_real_days` | 15 §3.9 | _notes/21-notes.md | yes |
| `cross_bloc_settle_delay_ticks` | 10 §3.2.4 | _notes/14-notes.md | yes |
| `du_hard_cap` | 11 §3.3.7 | _notes/19-notes.md | yes |
| `du_partition_cap` | 11 §3.10.4 | _notes/19-notes.md | yes |
| `entropy_reveal_lag_ticks` | 02 §3.11.1 | _notes/19-notes.md | yes |
| `guest_max_real_minutes` | 14 §3.1 | _notes/18-notes.md | yes |
| `home_city_change_fee_real` | 14 §3.1.5 | _notes/10-notes.md | yes |
| `insurance_deductible_pct` | 13 §8 | _notes/08-notes.md | yes |
| `intent_max_age_ticks` | 02 §3.12 | _notes/19-notes.md | yes |
| `lf_share` | 16 §2.1 | _notes/10-notes.md | yes |
| `liveops_maintenance_max_minutes` | 21 §3.3 | _notes/02-notes.md | yes |
| `macro_fx_uip_share` | 04 §3.13.1 | _notes/06-notes.md | yes |
| `macro_major_min_gap_days` | 04 §3.16.2 | _notes/16-notes.md | yes |
| `macro_ripple_rate` | 04 §3.16 | _notes/16-notes.md | yes |
| `macro_rr_*` | 04 §3.8.2 | _notes/07-notes.md | yes |
| `macro_storm_rate` | 04 §3.16 | _notes/16-notes.md | yes |
| `new_city_na_step` | 10 §3.2.3 | _notes/15-notes.md, _notes/21-notes.md | yes |
| `phase_budget_ms_P3` | 19 §3.3.3 | _notes/16-notes.md | yes |
| `push_cap_per_real_day` | 15 §3.11 | _notes/17-notes.md, _notes/21-notes.md | yes |
| `related_party_band` | 03 §3.11.6 | _notes/09-notes.md | yes |
| `support_tickets_per_day` | 21 §4.1 | _notes/17-notes.md | yes |
| `tz_change_cooldown_days` | 21 §3.14 | _notes/19-notes.md | yes |
| `ui_connections_refresh_ticks` | 17 §2.6 | _notes/19-notes.md | yes |
| `ui_js_budget_kb` | 17 §3.18 | _notes/19-notes.md | yes |
| `ui_perf_tick_render_ms` | 17 §3.18 | _notes/19-notes.md | yes |

### §5.4 Scope conflicts (one key, two systems)

| key | adopted rule | reason | correction | status |
|---|---|---|---|---|
| `bond_grace_days` (06) | 3 game days for every non-sovereign bond; sovereign bonds use macro_sov_grace_days = 7 | 04 owns sovereign default (04 §3.12); 06 owns all other bond defaults | 06 §3.8.3 must add "except sovereign issuers: 04 §3.12 macro_sov_grace_days" (both 06 and its notes); CDS FAILURE_TO_PAY on a sovereign reference uses 7 | resolved — 24 R29; §7 #23 (06 §3.8.3 now cites 04's 7-day grace for sovereign issuers) |

### §5.5 Retired keys (removed from the registry)

| key | was in | why removed | still listed in |
|---|---|---|---|
| `biz_ltv_cap` | 09 notes | retired by 24 R11 (07 §3.4.3 loan table); the owner module's keys cover it | nowhere |
| `fund_filing_aum` | 08 notes | retired by 24 R20 (15 §3.8 HOLDINGS_QUARTERLY); the owner module's keys cover it | nowhere |

### §5.6 Related keys checked and kept separate

The synonym scan (§7) also flagged pairs that look alike but measure different things. They stay separate; listed so nobody merges them later.

| keys | why they are different |
|---|---|
| `fund_npc_max_share` (08) / `npc_fund_max_participation` (16) | 08 caps NPC capital in one player fund; 16 caps an NPC fund's share of traded volume |
| `ad_nw_line_real` (21) / `fresh_start_nw_line_real` (14) | both $1,000 by L12 and 14, but one gates rewarded ads, the other Fresh Start |
| `ad_grant_real` (21) / `onb_retail_grant` (18) | both $250: an ad reward versus the one-time Retail license grant (00 §5.9) |
| `bond_grace_days` (06) / `payment_grace_game_days` (15) | bond coupon default versus private contract payment default |
| `fund_liquidation_adv_cap` (08) / `liq_max_participation` (07) | fund wind-down pace versus CCP liquidation slice |
| `gateway_seal_margin_ms` (19) / `seal_grace_ms` (02) | gateway intake cut-off before the seal versus coordinator wait for gateway markers after it |
| `entropy_commit_lead_ticks` (02) / `entropy_epoch_ticks` (19) | both 720; commitment lead time versus epoch length; 19 must keep epoch = lead (one game day) or 02 §3.11 breaks |
| `session_max_lifetime_ticks` (12) / `session_max_days` (19) | hidden espionage session versus login session |
| `stab_engaged_min_active_days` (03) / `tm_engaged_active_hours_per_real_day` (20) | Stabilizer sample membership versus wealth-band test population |
| `dr_rto_minutes` (21) / `partition_rto_s` (19) | site loss versus single partition failover |
| `macro_sov_grace_days` (04) / `license_grace_game_days` (14) | both 7 game days; unrelated systems |
| `home_city_change_fee_real` (14) / `handle_change_fee_real` (14) | different account changes |

### §5.7 Remaining open items

None.

## §6 Contract constants (00 §5, not parameters)

These numbers are fixed by 00 and the locked decisions. They are not in the parameter set; they are compile-time constants. Listed so no module re-declares them as a parameter.

| constant | value | source |
|---|---|---|
| `TICK_REAL_SECONDS` | 5 | 00 §5.1 |
| `TICKS_PER_GAME_DAY` | 720 (1 real hour, L9) | 00 §5.1 |
| `TICKS_PER_GAME_HOUR` | 30 | 00 §5.1 |
| `GAME_DAYS_PER_GAME_YEAR` | 364 | 00 §5.1 |
| `TICKS_PER_GAME_YEAR` | 262,080 | 00 §5.1 |
| Chapter length | 56 real days = 1,344 game days | 00 §5.1 |
| Opening / closing auction tick | t = 60 / t = 540 | 00 §5.1 |
| Accrual tick | t = 719 (day close) | 00 §5.1 |
| Business operation cadence | once per game hour, offset hash(id) mod 30 | 00 §5.1 |
| Intent rate limit | 20 per tick per character and 20 per tick per operator (`intents_per_tick_per_actor`, 19), at most 100 combined (`intents_per_tick_per_principal`, 19); 2,000 DU per tick for AI (`du_hard_cap`, 11) | 00 §5.5, 24 R07 |
| Partition size | ~25,000 agents (`partition_target_agents`, 19) | 00 §5.7 |
| Start state | $5,000 FDL, LIC0, R0, 72 real hours protection, $250 Retail grant | 00 §5.9, L12 |
| Breach-chance floor | 1% (`breach_floor`) | L2 |
| Hidden-session ceiling | 0.85 (`session_ceiling`) | L3 |
| Rewarded ads | $250 per ad, max 10 per day, only under $1,000 NW | L12 |
| Age rating | 16+ | L5 |

## §7 How this file was built (re-runnable)

1. **Spec extraction.** Every match of `PARAM\.[A-Za-z][A-Za-z0-9_]*` (with `{a,b}` brace lists expanded and `<member>`/`*` families kept) in files 00–21; the section is the nearest heading number above the line; the default is the value written directly after the key (`= v`, `(v)`, `(DEFAULT v)`, `default v`) or directly before it in the form `` `v` (`PARAM.key`) ``, or the next cell of a table row.
2. **Notes extraction.** Every table in `_notes/NN-notes.md` whose header has a key column and a default column; rows that name several keys (`a / b`, `x_{p,q}`) are split and their defaults and ranges split on ` / `; shorthand suffixes are completed from the first key.
3. **Merge.** Key = union of both sets. Owner = the notes file that lists the key, unless the row says "owned by NN" / "cited from NN", or §5 rules otherwise; spec-only keys go to the file that assigns their default. Default = owner notes, then owner spec, then any other source.
4. **Conflict scan.** (a) Every source value of a key compared numerically (`15%` = `0.15`, `$10M` = `10,000,000`, units ignored); (b) every pair of keys from different owners scored on name-token overlap, description overlap and equal default; every candidate was reviewed by hand and either listed in §5.2 or in §5.5.
5. The script reads the shared folder as it stands at build time; files edited after 2026-10-19 are re-checked by running it again (§8 test 1).

## §8 Acceptance tests

1. Re-running the extraction over files 00–21 and the notes yields no `PARAM.` key that is missing from §4 or from the alias column of §5.2.
2. Every key in §4 has exactly one row, one owner module, a default and a range; no key appears in two module tables.
3. The parameter set loaded by the engine has exactly the keys of §4 (families expanded); a missing or extra key fails the build.
4. No alias key of §5.2 appears in the code base (CI grep in G0).
5. For every row of §5.1 and §5.2 marked as a value difference, the loaded default equals the adopted value in this file.
6. `sys.param_change` rejects a value outside the row's range with `PARAM_OUT_OF_RANGE`.
7. `sys.param_change` on a key with live = no is rejected with `PARAM_NOT_LIVE` unless it is part of a RULES patch or an engine cutover.
8. A BALANCE change moves a key by at most 25% of its range and at most once per real week (21 Rule 3.4.3), checked against this registry's range.
9. Every key whose owner is 02 or 19 is marked live = no, and every key with range `fixed` is marked live = no.
10. The `sys.param_changed` event lists keys by their registry name and the values in the registry unit.
