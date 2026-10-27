# 11-notes — AI Lab

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| lab_unlock_nw | $100,000 | $50k–$250k | Money | when the Lab opens (§3.2) |
| lab_starter_grant_compute | 200 | 0–1,000 | PFd | one-time starter compute FAUCET (§3.2) |
| ai_tier_nw | T0 $100k, T1 $250k, T2 $1M, T3 $20M, T4 $200M, T5 $2B | ±50% each | Money | lab tier eligibility (§3.2) |
| ai_tier_gates (table) | §3.2 table (DU 5/15/100/400/1,500/2,000; cadence 6/6/3/2/1/1; slots etc.) | — | mixed | all tier gates (§3.2) |
| gpu_catalog | §3.3.1 (GX10 $2k 33.6 PFd … DX900POD $2.4M 30,240 PFd) | ±30% | Money, PFd/GD, kWh/PFd | hardware economics (§3.3.1) |
| card_repair_share / card_repair_gd | 0.10 / 3 | 0.05–0.3 / 1–10 | share, GD | failed cards (§3.3.1) |
| npc_hw_buyback_share | 0.60 | 0.3–0.8 | share of book | used hardware (§3.3.1) |
| home_site_mw / home_site_pue | 0.02 / 1.6 | — | MW, ratio | HOME site (§3.3.2) |
| colo_price_per_mw_gd | $600 | $300–$1,500 | Money/MW/GD | colocation (§3.3.2) |
| pue_options | 1.45 / 1.25 (+20% shell) / 1.12 cold | 1.10–1.60 | ratio | energy (§3.3.2) |
| power_contract_gd | 28, 91, 364 | — | GD | fixed power terms (§3.3.2) |
| fixed_power_premium | 0.03 | 0–0.10 | share over forward | fixed power price (§3.3.2) |
| heatwave_pue_add | 0.10 | 0–0.3 | PUE | heatwave events (§3.3.2) |
| spot_max_share_of_npc_cloud | 0.02 | 0.005–0.1 | share | spot lease size cap (§3.3.3) |
| spot_preempt_util | 0.90 | 0.8–0.98 | utilisation | preemption onset (§3.3.3) |
| reserved_price_mult | 1.667 | 1.2–2.5 | × spot ref | reserved cloud price $2.0/PFd (§3.3.3) |
| reserved_term_gd | 30 | 7–91 | GD | reserved commitment (§3.3.3) |
| reserved_exit_fee_share | 0.5 | 0–1 | share of remainder | early exit (§4) |
| shortage_lead_time_gd | U(48, 240) | — | GD | chip shortage (§3.3.4) |
| shortage_rep_gate | 50 | 0–100 | Reputation | DX300/DX900 in shortages (§3.3.4) |
| paused_no_compute_gh | 24 | 6–72 | GH | run auto-pause (§3.3.5) |
| world_pool_discount | 0.05 | 0–0.2 | share below spot | idle sales (§3.3.5) |
| du_cap_compute_bonus | 0.25 | 0–0.5 | share | DU cap (§3.3.7) |
| du_hard_cap | 2,000 | — | DU/tick | per-character cap (RN A1, §3.3.7) |
| halflife_gd_<domain> | MICRO 7, SENT 14, CRYPTO 21, MEDIA 28, EQ/COMM/SECY 56, FX/RATES/OPS 91, MACRO/PROP 182 | ×0.5–×2 | GD | data and model freshness (§3.4.1) |
| data_relevance | §3.4.2 table | 0–1 | weight | run data (§3.4.2) |
| specialist_off_weight | 0.2 | 0–0.5 | weight | focusW (§3.4.2) |
| broker_price_per_dqu | $40·(dqu/1000)^−0.10, floor $15 | ±50% | Money/DQU | archive data (§3.4.3) |
| feed_tiers | BASIC $5k/+2/0.70; PRO $20k/+10/0.85; ELITE $80k/+40/0.95 per 28 GD | ±50% | Money, DQU/GD, quality | live feeds (§3.4.3) |
| scrape_compute_per_dqu / scrape_cash_per_dqu | 0.5 PFd / $2 | — | per DQU | scraping (§3.4.3) |
| scrape_flag_prob | 0.03 | 0–0.2 | probability per job | S1 claims (§3.4.3) |
| synth_compute_per_dqu | 0.3 | 0.1–1 | PFd | synthetic data (§3.4.3) |
| partnership_slots_per_domain_bloc | 3 | 1–6 | slots | alt-data auctions (§3.4.4) |
| partnership_reserve | $2M (T3+) / $250k (T2) | — | Money/chapter | auctions (§3.4.4) |
| partnership_incumbent_credit | 0.10 | 0–0.25 | share | re-auction (§3.4.4) |
| partnership_rep_gate | 40 | 0–100 | Reputation | eligibility (§3.4.4) |
| synthetic_collapse_start / slope / floor | 0.40 / 3 / 0.2 | — | share, mult | model collapse (§3.4.6) |
| research_tree | §3.5 table | — | mixed | research (§3.5) |
| research_speed_k | 0.30 | 0–0.5 | share | ARCHITECTURE speed-up (§3.5) |
| scaling_alpha | 0.15 | 0.10–0.25 | exponent | compute returns (§3.6.1) |
| scaling_beta | 0.12 | 0.08–0.20 | exponent | data returns (§3.6.1) |
| scaling_k | 2.31 | 1–4 | constant | MCS scale (§3.6.1) |
| data_compute_ratio_gamma | 0.02 | 0.005–0.1 | DQU per PFd | compute-optimal data (§3.6.1) |
| balance_max / balance_min | 1.15 / 0.60 | — | mult | balance term (§3.6.1) |
| a_eff_cap | 12 + 1.5 | — | A | arch cap (§3.6.1) |
| specialist_mult / specialist_other / specialist_share_min | 1.40 / 0.40 / 0.70 | — | mult, share | A02 specialists (§3.6.3) |
| max_run_gd | 60 | 20–120 | GD | run planner limit (§3.6.4) |
| hparam_duration | QUICK −20%, ABLATION +30% (+25% compute) | — | share | runs (§3.6.4) |
| finetune_c_carry / d_carry | 0.5 / 0.5 | 0–1 | share | fine-tunes (§3.6.5) |
| self_distill_retention / inference / compute | 0.90 / 0.40 / 0.05 | — | mult | compression (§3.6.5) |
| pfail_clamp | [0.01, 0.60] | — | probability | run failure (§3.6.6) |
| hparam_fail_mult | QUICK 1.6, CAREFUL 1.0, ABLATION 0.7 | — | mult | run failure (§3.6.6) |
| checkpoint_compute_add | 0.15 | 0–0.3 | share | checkpointing (§3.6.6) |
| partial_prob | 0.25 | 0–0.5 | probability | partial outcomes (§3.6.6) |
| success_noise_sigma | 0.05 | 0–0.15 | log-sd | MCS noise (§3.6.6) |
| insight_mcs_bonus | 0.03 | 0–0.1 | share | after failure (§3.6.6) |
| researcher_pool_refresh_gd | 7 | 1–28 | GD | talent pool (§3.7.1) |
| salary_base / salary_k / star_mult | $30,000 / 0.05 / 1.5 | — | Money/GY | salaries (§3.7.2) |
| signing_bonus_share | 0.25 | 0–1 | share | hiring (§3.7.2) |
| delta_a_cap | 1.5 | 0.5–3 | A | researcher bonus (§3.7.3) |
| safety_skill_per_frontier | 60 | 30–120 | skill | safety coverage (§3.7.4) |
| burnout_up / burnout_down / burnout_threshold | 3 / 2 / 60 | — | per GD | burnout (§3.7.5) |
| sauce_poach_delta_a | 0.2 | 0–0.5 | A | poaching leak (§3.7.5) |
| info_m50 | 150 | 50–500 | MCS | estimate precision (§3.8.2) |
| info_eta | 0.8 | 0.5–1.5 | exponent | estimate precision (§3.8.2) |
| freshness_floor | 0.30 | 0.1–0.5 | mult | effMCS (§3.8.4) |
| regime_fit_mult | 0.70 | 0.5–1 | mult | effMCS (§3.8.4) |
| live_feed_halflife_gd / floor | 7 / 0.20 | — | GD, mult | effMCS (§3.8.4) |
| license_mult | 0.90 | 0.7–1 | mult | licensee effMCS (§3.8.4) |
| gate_hold_share | 0.80 | 0.5–1 | share | product gates (§3.9.1) |
| proposal_expiry_ticks | 30 | 10–360 | ticks | ADVISORY orders (§3.9.1) |
| analyst_du_per_symbol | 2 | 0.5–5 | DU | analyst (§3.9.2) |
| npc_license_pool_per_gd | $150,000 | $50k–$500k | Money/GD | NPC licensing FAUCET (§3.9.5) |
| license_ref_price | $500 | — | Money/GD/unit | NPC logit (§3.9.5) |
| ensemble_other_weight / max_members | 0.25 / 3 | — | mult, count | ensembles (§3.9.7) |
| inference_coeffs | §3.9.8 (0.8/0.6/0.5/0.3/0.0004; MOE 0.7) | — | PFd | inference (§3.9.8) |
| du_partition_cap | 3,000,000 | — | DU/tick | partition crunch (§3.10.4) |
| graph_max_nodes / edges | 200 / 400 | — | count | graphs (§4) |
| withheld_worlds_per_set | 50 | 10–200 | worlds | evaluation (§3.12) |
| withheld_world_gd | 10 | 2–30 | GD | evaluation (§3.12) |
| overfit_ratio | 0.5 | 0.3–0.8 | ratio | overfit flag (§3.12) |
| paper_min_gd | 2 | 0–14 | GD | staged deployment (§3.12) |
| stage_min_gd / stage_te_max | 2 / 0.30 | — | GD, share | stage advance (§3.12) |
| eval_compute_coeff | 0.002 | — | PFd per MCS·symbol·GD | evaluations (§3.12) |
| tournament_capital | $1M / $50M / $1B | — | virtual Money | divisions (§3.13) |
| tournament_prestige | 50 / 30 / 20 | — | Prestige | top 3 (§3.13) |
| arena_fee_coeff | 0.001 | — | PFd | arenas (§3.13) |
| student_window_gd | 7 | 1–28 | GD | capture expiry (§3.14.1) |
| retention_bounds | [0.60, 0.90] | — | share | distillation (§3.14.1) |
| arch_ceiling_mult | 1.25 | 1–2 | × tier band top | student cap (§3.14.1) |
| query_q50_base | 2,000 | 500–10,000 | queries | query distillation (§3.14.2) |
| launder_cost / residue_cut / retention_cut / residue_floor | 0.25+0.35L / 0.7 / 0.35 / 0.03 | — | mult | laundering (§3.14.4) |
| watermark_default / range | 0.8 / 0.3–1.0 | — | strength | watermarks (§3.14.5) |
| decoy_apparent_max | 1.5 | 1–3 | × own best MCS | honeypots (§3.14.6) |
| poison_regime_loss / cap | 0.02 / 0.10 | — | share of capital | poison (§3.14.6) |
| leech_credit_life_gd | 1 | — | GD | leech loot (§3.14.7) |
| rogue_base | 0.002 | 0–0.01 | per GD | rogue episodes (§3.15.1) |
| safety_incident_base | 0.0004 | 0–0.005 | per GD | safety incidents (§3.15.2) |
| incident_cleanup_share | 0.005 | 0–0.05 | share of capital | incidents (§3.15.2) |
| registration_mcs | 200 | 50–1,000 | MCS | registration (§3.16.1) |
| registration_aum | $50,000,000 | $5M–$500M | Money | registration (§3.16.1) |
| registration_fee | $25,000 + 0.01%/GY | — | Money | registration (§3.16.1) |
| audit_prob_per_quarter / audit_cost | 0.02 / $50,000 | — | prob, Money | audits (§3.16.2) |
| trusted_lab_reqs | coverage 0.5, clean 95%, 2 chapters | — | mixed | trusted lab (§3.16.4) |
| npc_labs_launch | 30 | 10–80 | labs | NPC labs (§3.17) |
| npc_lab_run_interval | 24/24/48/96/168/336 | — | GD by tier | NPC labs (§3.17) |
| cluster_move_gd | 2 | 0–10 | GD | site moves (§4) |
| stealth_lab_rep_cost | 5 | 0–20 | Reputation escrow | frontier milestone suppression (§5) |
| npc_vendor_stock_dx900 / dx300 | 40 / 2,000 | — | per vendor per chapter | hardware supply (§6.3) |
| npc_vendor_stock_growth | 0.10 | 0–0.3 | per chapter | hardware supply (§6.3) |
| hw_storage_fee_share | 0.002 | 0–0.01 | share of price per GD | stored cards (§8.5) |

## 2. Decisions

- 1 old research day = 8 GD; every AI timer runs on the game clock, also offline and in solo. DEFAULT; resolves old 05 open question 1 (header, §3.5).
- Lab opens at $100k NW. T1 is set at $250k (R2) to resolve the old 04 versus 05 mismatch. DEFAULT (§3.2).
- LINEAR is free at unlock, plus 200 PFd of starter compute. DEFAULT (§3.2).
- Lab tier is the minimum of NW eligibility and the arch tier. Peak NW never demotes. DEFAULT (§3.2).
- GPU throughput is 336 × rating PFd/GD, with kWh/PFd set per model. This reconciles 01's data center with RESOLVED C1's $0.15/PFd and supersedes old 05's kW column (§3.3.1).
- Cold-climate PUE 1.12 is allowed only in 4 Nordic and alpine cities. DEFAULT (§3.3.2).
- Reserved cloud costs $2.0/PFd over a 30-GD commit and has no preemption. Spot preemption begins at u > 0.90. DEFAULT (§3.3.3).
- DU_cap gets a bonus of up to +25% from owned compute only, and the hard cap is 2,000 (RN A1, C3a) (§3.3.7).
- Data halflives are set per domain. DEFAULT (§3.4.1).
- Synthetic data collapses above a 40% share. Old 05 §9 formalised (§3.4.6).
- Research tree costs and A values are fixed, with SECRET_SAUCE A bonus U(1.5, 3.0). DEFAULT (§3.5).
- Scaling law recalibrated to α 0.15, β 0.12, k 2.31, γ 0.02. Resolves old 05 open question 8 (§3.6.1).
- Specialist models get 1.40 in-domain and 0.40 elsewhere. DEFAULT (§3.6.3).
- Failure formula: checkpointing and a PARTIAL outcome at 25%. DEFAULT (§3.6.6).
- Capability is information. Hidden signals are estimated with ρ(m), and common plus lineage noise produces crowding. DEFAULT; formalises A03 and A06 (§3.8).
- effMCS factors: the freshness floor is 0.3, regimeFit is 0.7 and liveFeed is 0.2. These replace old 05 §7.1 edge timers (§3.8.4).
- No outright model sale; licensing only. Applies Bible decision 6 and supersedes old 05 §4.5 (§3.9.5).
- AP, DP_ai and scanTier formulas are derived from MCS bands, which equal the RN B2 bands (§3.9.3).
- NPC licensing pool is $150k/GD × aiRaceIndex × N_a/10k (FAUCET). DEFAULT (§3.9.5).
- Strategy graph blocks, DU costs and the 12 templates. DEFAULT (§3.10).
- Withheld worlds come in weekly sets of 50, each 10 GD. Paper trading lasts at least 2 GD before staging. DEFAULT (§3.12).
- Tournament: weekly, three divisions, one shared seeded market, no cash. DEFAULT (§3.13).
- Distillation retention is bounded to 0.60–0.90, with an arch ceiling at 1.25 × the tier top. Laundering follows RN B1 (example 166). DEFAULT (§3.14).
- Query distillation is open to licensees (the underdog route), and the noTrainClause is a breach that the engine verifies. DEFAULT (§3.14.2).
- Honeypot poison causes regime-change losses, and each fine-tune halves it. DEFAULT (§3.14.6).
- Rogue episodes and safety incidents: formulas set, and incidents are PUBLIC as a filing rule. DEFAULT (§3.15).
- Registration applies at MCS ≥ 200 or at least $50M of capital, summed across the lineage. DEFAULT (§3.16.1, X15).
- Fog of war: rival capability is private and only bands are public. Resolves old 05 open question 3 (§3.16.3).
- Trusted-lab badge criteria and benefits. Resolves old 05 open question 5 (§3.16.4).
- 30 NPC labs give a PvE floor and grow by 2 per new city. Resolves old 05 open question 6 (§3.17).
- Frontier milestones are PUBLIC unless suppressed with a Reputation escrow. DEFAULT (§5).
- Hardware delivered to a full site goes to storage. DEFAULT (§8.5).

## 3. Interfaces assumed

- **00/02**: P5 and P9 phases; streams `ai/<labId>/run/<runId>`, `ai/common/<key>/<tick>`, `ai/lineage/<root>/<key>/<tick>`, `npc/lab/<id>/<GD>`; replay hash; partitions with DU accounting.
- **03**: reason-code classes for the AI_* codes in §3.18. 03 is authoritative.
- **04**: `regime[bloc]` current and history; hidden signals `outputGapNow`, `inflationNow`, `regimeProb`, `policyReaction`, `nextDecisionProb`.
- **05**: `mkt.*` intents with `origin.deploymentId`; assumed `mkt.basket` (≤ 50 legs, one intent); impact model `{Y, σ}` per asset; public batch depth at t−1; hidden signals `npcMakerInventory`, `fairValueLog`, `nextEarningsSurprise`; exchange gateway subscription.
- **06**: compute spot index `spot $/GPUh = 0.12·(u/0.75)^3` clamped [$0.05, $0.60], with 06 receiving `D_players` hourly; energy MWh spot and forwards per bloc; chip-shortage supply shock; commodity and crypto hidden signals.
- **07**: overdraft on unpaid accruals; leverage limits for mandates.
- **09**: `dataCreditsPerGD(bizId, domain)`; consumes `{forecastSigmaMult, autoDecisions, bounds}` per business; Data Center, AI-lab, chip-fab and power utility businesses; M&A transfers the lab; company roles CTO and CEO.
- **10**: DATACENTER_SITE props with MW capacity (10 §3.4.2); property-manager interface using PROPERTY_OPS skill (10 §3.13); hidden signal `pressureNext91[district, use]`; new-city hook (10 §3.2.3).
- **12**: AttackCapability `{ap, aiTier, attackModelId}` and DefenseProfile `{dpAi, scanTier, defenseModelId}` published hourly; session progress P and MODEL session end callback; C04, C05, C06, C07, E3, E4, E8; DeceptionItem poison 0.2/0.4/0.6; hostile DU drain ≤ 0.20; staff loyalty formula 12 §3.9.1; query-anomaly detection.
- **13**: registry, audits, incident filings, S1/S2 sanctions, seizure and preservation orders, licence limits for mandates, `p_find = 1 − e^(−3·residue)`.
- **14**: Reputation, Prestige, rank, talent bonus `PP`, the "trusted frontier lab" tier, peak NW.
- **15**: model and data markets, contracts (P2P compute, licences), linked-account and related-party checks, P2P tax 2%, Top Labs board, operator Mandates with LAB_OPS and LAB_TRADING scopes.
- **16**: NPC labs as named actors, AiRules from politics, aiRaceIndex, person generator for researchers, chip-shortage, heatwave and data-outage events, Wire, `storyCredibility`.
- **17/18**: Shadow sub-palette layouts; error copy; accessibility.
- **19**: batch workers for evaluations, tournaments and arenas; partition DU accounting.
- **20**: weekly withheld-world sets from secret seeds; balance bands.

## 4. Content needed (catalog 22)

- 5 GPU models (GX10, GX40, DX100, DX300, DX900POD) with vendor flavour text, and 4 named NPC hardware vendors.
- NPC data brokers: one per (13 domains × 5 blocs) plus 3 global, so 68 names, each with 6 archive packages (grades A, B and C).
- 3 NPC cloud providers and 2 colocation providers per bloc: 25 names.
- Partnership slot names for the 8 alt-data domains (footfall, shipping manifests, card-spend nowcast, venue depth feed, on-chain clustering, panel survey, listing pipeline, supplier telemetry), with 3 slots per bloc each, so 120 slot labels.
- 30 NPC labs with name, archetype, home bloc, tier, cleanliness, aggression and secret-sauce signature for the T5 lab.
- 40 named star researchers with specialty, home bloc and preferences.
- 12 strategy templates (names in §3.10.5) with choice sets.
- Codename banks for models: at least 400 roots plus a version suffix.
- Research node descriptions and art for the 10 nodes.
- Tournament titles and cosmetics per division; AI incident and frontier-milestone Wire headline templates (16).
- AiRule templates (5 kinds), with 16 political triggers.
