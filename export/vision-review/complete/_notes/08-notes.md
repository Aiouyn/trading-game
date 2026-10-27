# 08 notes — Funds, Structured Credit, Rating Agencies, Insurance

## 1. Parameters

All time values in game days unless stated (1 game day = 1 real hour). Rates per game year.

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| fund_max_per_sponsor | 5 | 1–10 | funds | live funds per sponsor (§3.1.1) |
| fund_initial_nav | 100.000000 | fixed | $/unit | launch NAV (§3.1.2) |
| fund_max_level3_pct | 0.10 | 0.05–0.25 | share of NAV | open-ended Level-3 cap (§3.1.3) |
| fund_level3_suspend_pct | 0.25 | 0.15–0.40 | share of NAV | forced side pocket (§3.1.3, §3.1.9) |
| fund_custody_fee | 0.0025 | 0.001–0.005 | /game year | custody SINK (§3.1.7) |
| fund_swing_threshold | 0.05 | 0.02–0.10 | share of NAV | swing pricing trigger (§3.1.4) |
| fund_swing_cap | 0.03 | 0.01–0.05 | share | max swing (§3.1.4) |
| fund_dealing_cutoff_tod | 539 | 0–719 | tick of day | forward-pricing cutoff (§3.1.5) |
| fund_investor_max_nw_pct | 0.25 | 0.10–0.50 | share of investor NW | concentration cap (§3.1.5) |
| fund_investor_min_age_days | 168 | 72–336 | game days (7 real days) | investor account age (§3.1.5) |
| fund_link_score_block | 0.6 | 0.4–0.8 | 19 link score | linked-investor block (§3.1.5) |
| fund_min_ticket | $1,000 | $100–$10,000 | Money | min subscription |
| fund_gate_pct_per_day | 0.20 | 0.05–0.50 | share of NAV/day | gate (§3.1.6) |
| fund_early_exit_days | 48 | 24–96 | game days (2 real days) | early-exit window |
| fund_early_exit_fee | 0.01 | 0–0.03 | share | paid into fund |
| fund_liquidation_adv_cap | 0.20 | 0.05–0.30 | share of ADV/day | engine liquidation pace (§3.1.6, §3.1.11) |
| fund_redemption_max_delay_days | 1 | 1–3 | game days | payable delay before GATED |
| fund_mgmt_fee_cap | 0.02 | 0–0.03 | /game year | mgmt fee cap |
| fund_perf_fee_cap | 0.20 | 0–0.30 | share of gains | perf fee cap |
| fund_max_leverage_player | 1.5 | 1.0–3.0 | gross/NAV | player fund leverage (§3.1.8) |
| fund_max_position_pct | 0.20 | 0.05–0.30 | share of NAV | per-instrument cap |
| fund_related_float_pct | 0.01 | 0.005–0.05 | share of float | related-party trigger |
| fund_related_cap_pct | 0.05 | 0.02–0.10 | share of NAV | related-party cap |
| fund_drift_cure_days | 3 | 1–7 | game days | drift cure window |
| fund_mandate_notice_days | 24 | 12–72 | game days (24 real hours) | mandate/fee notice |
| fund_absent_freeze_days | 72 | 48–168 | game days (72 real hours) | absent-manager freeze |
| fund_absent_winddown_days | 336 | 168–672 | game days (14 real days) | absent-manager wind-down |
| fund_breaker_dd | 0.30 | 0.20–0.50 | drawdown | breaker (§3.1.9) |
| fund_breaker_freeze_days | 1 | 1–3 | game days | breaker freeze |
| fund_manager_stake_min_pct | 0.10 | 0.05–0.25 | share of AUM | skin in the game; GP commit |
| fund_manager_stake_min_abs | $250,000 | $50k–$1M | Money | min stake |
| fund_aum_stake_multiple | 10 | 5–20 | × stake | AUM cap |
| fund_new_aum_cap | $10,000,000 | $1M–$50M | Money | new-fund AUM cap |
| fund_new_period_days | 336 | 168–672 | game days | new-fund period |
| fund_winddown_days | 5 | 3–14 | game days | wind-down duration |
| fund_board_min_aum | $1,000,000 | $250k–$10M | Money | fund board eligibility |
| fund_board_min_days | 182 | 91–364 | game days (2 quarters) | fund board eligibility |
| npc_alloc_player_share | 0.02 | 0–0.05 | share of NPC allocator AUM | NPC capital to player funds (faucet size) |
| npc_alloc_top_k | 10 | 5–25 | funds | allocator diversification |
| fund_npc_max_share | 0.50 | 0.25–0.75 | share of AUM | NPC capital cap per fund |
| fund_call_notice_days | 10 | 5–28 | game days | capital call notice |
| fund_lp_default_forfeit | 0.5 | 0.25–1.0 | share of paid-in | LP default penalty |
| fund_pref_return | 0.08 | 0–0.12 | /game year | closed-end hurdle |
| mmf_max_wam_days | 60 | 30–91 | game days | MMF WAM limit |
| mmf_min_weekly_liquid | 0.30 | 0.15–0.50 | share | MMF liquidity |
| mmf_break_level | 0.9950 | 0.990–0.998 | shadow NAV | break the buck |
| mmf_liquidity_fee | 0.02 | 0–0.03 | share | MMF fee in stress |
| hh_mmf_share | 0.08 | 0.02–0.20 | share of hh liquid savings | NPC MMF size |
| swf_cofund_max | 0.25 | 0–0.40 | share of NAV | treasury co-investment |
| etf_max_fee | 0.0075 | 0.001–0.01 | /game year | ETF expense cap |
| etf_ap_daily_cu_limit | 40 | 5–200 | creation units | AP daily cap |
| etf_fail_fee | 0.005 | 0.001–0.02 | share of CU value | failed creation fee |
| etf_ap_margin_bps | 5 | 1–20 | bps | AP arbitrage band |
| etf_creation_unit | 50,000 | 10k–200k | units | CU size |
| etf_min_seed | $2,500,000 | $500k–$10M | Money | ETF launch seed |
| etf_npc_ap_default | true | bool | — | NPC APs on player ETFs |
| etf_halt_cash_premium | 0.01 | 0–0.03 | share | halted basket substitution |
| index_min_float_cap | $200,000,000 | $50M–$1B | Money | player index eligibility |
| index_min_adv | $2,000,000 | $0.5M–$10M | Money/day | player index eligibility |
| index_announce_lead_days | 5 | 2–14 | game days | rebalance announcement |
| sec_min_obligors | 50 | 20–500 | obligors | pool eligibility |
| sec_max_obligor_pct | 0.02 | 0.01–0.05 | share of pool | concentration |
| sec_min_pool | $25,000,000 | $5M–$100M | Money | pool size |
| sec_max_tranches | 8 | 3–10 | tranches | structure |
| sec_risk_retention | 0.05 | 0–0.10 (lobbyable) | share | risk retention |
| sec_cdo_tranche_lgd | 0.80 | 0.6–1.0 | LGD | CDO-of-ABS model |
| sec_book_days | 1 | 1–3 | game days | book-build |
| sec_reserve_pct | 0.01 | 0–0.03 | share of pool | reserve account |
| sec_payment_every_days | 7 | 7–28 | game days | payment date |
| sec_cum_loss_trigger | 0.06 | 0.03–0.15 | share of original pool | pro-rata → sequential |
| sec_chargeoff_days | 182 | 91–364 | game days | loss recognition |
| sec_servicer_fee_bps | 25 | 10–75 | bps/game year | servicing |
| sec_risk_premium_base | 1.8 | 1.0–3.0 | multiple | tranche model spread |
| sec_liq_premium_bps | 20 | 5–60 | bps | tranche model spread |
| sec_dealer_halfspread_bps | 25 | 5–100 | bps | dealer quotes |
| rating_turnaround_days | 3 | 1–7 | game days | rating time |
| rating_parent_max_stake | 0.099 | 0.05–0.15 | share | player stake in agency parent |
| rating_max_leniency | 0.5 | 0.2–0.7 | fraction | leniency cap |
| rating_review_threshold | 40 | 20–60 | reputation | regulator review |
| rating_fee_bps | 5 | 2–15 | bps of issue | issue fee (min $25k) |
| rating_fee_issuer | $250,000 | $50k–$1M | Money/game year | issuer rating fee |
| rating_disclose_preliminary | false | bool (politics lever) | — | shopping disclosure |
| rating_watch_days | 10 | 5–28 | game days | watch resolution |
| fallen_angel_sell_days | 20 | 5–60 | game days | forced sale period |
| ins_deductible_min | $500 | $100–$10k | Money | min deductible |
| insurance_deductible_pct | 0.10 | 0.05–0.25 | share of loss | deductible floor (03 §11.2) |
| ins_model_err | 0.30 | 0.1–0.5 | σ | pricing error at modelQuality 0 |
| ins_target_lr | 0.65 | 0.5–0.8 | loss ratio | market cycle |
| ins_expense_fixed | $50 | $0–$500 | Money/policy/game year | expense load |
| ins_fraud_review | 0.6 | 0.4–0.8 | score | fraud review threshold |
| ins_pandemic_sublimit | 0.25 | 0.1–0.5 | share of limit | cyber pandemic (03 §11.2) |
| ins_min_capital | $1,000,000 | $250k–$10M | Money | insurer floor |
| ins_limit_floor_pct | 0.20 | 0.1–0.3 | share of net retained limits | 03 §11.3 floor (conflict lines) |
| ins_pml_recalc_trigger | 0.10 | 0.05–0.25 | share of PML | intra-week PML recalc |
| pgs_cover_pct | 0.80 | 0.5–1.0 | share | guarantee scheme cover |
| pgs_cap_per_claim | $10,000,000 | $1M–$100M | Money | scheme cap |
| pgs_levy | 0.005 | 0.001–0.02 | share of GWP | scheme levy |
| reins_min_capital | $500,000,000 | $100M–$2B | Money | player reinsurer |
| cat_intensity_rate | 0.9 | 0.6–1.4 | 1/intensity | cat severity |
| cat_bi_days_per_dr | 20 | 5–40 | game days | BI duration |
| cat_eventset_years | 2,000 | 500–10,000 | simulated years | PML200 |
| catbond_term_days | 728 | 364–1,456 | game days | cat bond term |
| catbond_min_spread_bps | 150 | 50–400 | bps | cat bond floor |
| npc_fund_count | 40 | 20–100 | funds | NPC fund roster |

Non-PARAM tables also introduced (owned here, registry 23 should list): grade-PD anchors (§3.4.2), agency methodology rows (§3.4.1), rating methodology coefficients (§3.4.3), peril frequencies and damage curves (§3.5.6), NPC loads (§3.5.2), solvency factors and correlation matrix (§3.5.7), OC/IC default triggers (§3.3.8), NPC buyer reservation spreads (§6.3).

## 2. Decisions

- §3.1.12: roadmap Q6 resolved option A (custody makes theft impossible; betrayal = market abuse, S5; no exit scam).
- §3.1.1: fund kinds and rank gates: hedge/FoF/credit/long-only R3; VC/PE/MMF/ETF sponsor R4 + LIC4; SWF R6. DEFAULT.
- §3.1.4: series accounting with per-series HWM; performance fee paid in cash by cancelling investor units (G unchanged). DEFAULT.
- §3.1.4: swing pricing on by default. DEFAULT.
- §3.1.5: forward pricing with cutoff at the closing auction (t = 539). DEFAULT.
- §3.1.6: redemption price fixed at strike; engine liquidation for shortfalls (makes fund runs emergent). DEFAULT.
- §3.1.15: default transparency EXPOSURES; investors bound by automatic NDA. DEFAULT.
- §3.1.16: funds ≥ $1B AUM file top-10 quarterly with 7-game-day delay (aligned to 02 §8.3). DEFAULT.
- §3.1.17: NPC allocator capital to player funds; fees on NPC share are FAUCET, NPC capital is not player wealth. DEFAULT.
- §3.1.18: closed-end European waterfall default, 8% pref, 4-year term, 1-year investment period. DEFAULT.
- §3.1.19: money-market funds with stable NAV, break-the-buck rule, hh run channel. DEFAULT.
- §3.1.20: SWF for R6 with ≤ 25% bloc-treasury co-investment and primary-dealer privilege. DEFAULT (resolves V3 3.12 "found a sovereign wealth fund").
- §3.2.2: ETF creation/redemption settles at day-close NAV, cutoffs t = 539 / 719. DEFAULT.
- §3.2.8: active ETFs disclose baskets daily (opt-in filing rule, L11-compatible). DEFAULT.
- §3.3.2: one level of re-securitization (CDO of ABS mezz only, no CDO²). DEFAULT.
- §3.3.4–3.3.5: Vasicek LHP for ratings/model prices; real correlation emerges from 07/10 regime-dependent hazards; agencies estimate ρ from history. DEFAULT.
- §3.3.7: SPV consolidated into sponsor if sponsor holds > 50% equity tranche and services. DEFAULT.
- §3.3.8: weekly (7 game days) payment dates; OC/IC trigger defaults. DEFAULT.
- §3.4.1: three NPC agencies; players cannot own or charter a rating agency; ≤ 9.9% of a listed parent. DEFAULT (Mathis may override).
- §3.4.5: rating shopping legal; preliminary-disclosure is a politics lever defaulting to false. DEFAULT.
- §3.4.7: composite = median of published ratings; NR treated as BB− by consumers. DEFAULT.
- §3.5.1: insurable-interest rule (keeps insurance from being a bet, L5). DEFAULT.
- §3.5.2: premiums billed daily by default. DEFAULT.
- §3.5.3: binding moratorium for perils under warning. DEFAULT.
- §3.5.6: four natural perils rolled here (storm, flood, quake, wildfire); cyber pandemic, unrest, contagion come from 12/16. DEFAULT.
- §3.5.7: the 03 §11.3 "20% of insured limits" rule kept as a floor only for the conflict lines (cyber, ransomware, model/IP, collectibles, legal), net of reinsurance, plus an SCR. DEFAULT; this is an interpretation of an old rule (see report).
- §3.5.7: Policyholder Guarantee Scheme per bloc, 80% cover, $10M cap, levy 0.5%. DEFAULT.
- §3.5.9: cat bonds 2-game-year term, indemnity counts only cover bound ≥ 28 game days before an event. DEFAULT.
- V3 Q4 (real-world-inspired crisis templates): the live world has only emergent crises (§3.3.5); named templates may exist only as ring-fenced challenge scenarios owned by 15/18. DEFAULT.

## 3. Interfaces assumed

- **02**: deterministic math library `normCdf`, `normInv`, `ghNodes32`, `bivNormCdf`; named RNG streams (`cat:<peril>:<city>`, `cat:eventset:<chapter>`, `ins:quote:…`); calendar hooks at day close, game-month, game-quarter, chapter boundary.
- **03**: reason-code registry with `_NPC` FAUCET/SINK variants for flows crossing the player-economy boundary; NPC-owned fund units excluded from player NW and from the Stabilizer's M; consolidation rule for SPVs; statements for insurers and funds; the Stabilizer lever `stabilizerLever` ∈ [0.5, 1.5] for NPC allocations.
- **04**: `sovereignPD(govId)`; bill yields by currency; `fear` index; output gap; regime label (`RECESSION`, `CRISIS`); bloc treasuries can sign SWF co-investment mandates and grant primary-dealer status.
- **05**: closing marks (t = 540 auction, t = 719 for 24h products); fund-engine orders as a normal actor; self-match prevention extended to fund ↔ manager; impact law `0.8 × σ_daily × √(Q/ADV)` and NPC depth `× (1 − 0.6·fear)`; factor model returns for style-drift regression; weekly batch auction slot for ABS and cat bonds.
- **06**: instrument registry accepting classes `ETF`, `FUND_SHARE` (listed closed-end), `ABS`, `CAT_BOND`, `CLAIM`; model-price hook calling 08 for tranches; CDS on tranches using 08 writedown events; futures/TRS for leveraged ETFs.
- **07**: CCP custodian accounts (segregated, never in the CCP waterfall); prime brokerage for funds; `loanHazard(loan, macro)` with regime-dependent factor loadings; monthly cohort default rates per bloc and asset class; loan events `loan.payment`, `loan.defaulted`, `loan.recovery`; whole-loan sale market; `standardsIndex` for originators; dealer-bank balance-sheet room shrinking with fear; repo haircuts and risk weights by composite grade.
- **09**: `valuePrivateStake(cmpId, classId, shares)`; business BI days and lost profit on catastrophe; receivables for trade credit and securitization; staff key-person events; product events for liability.
- **10**: property insured values, condition, mitigation upgrades, flood/coastal district flags, `appraise(propId)`; applies physical damage from `fund.cat.event`.
- **11**: AI models as fund operators; `modelQuality` contribution for insurers; watermark status for MODEL_IP cover.
- **12**: `p_breach_est`, `p_loss_given_breach`, coverage and patch posture per entity; breach/loot/theft events with amounts; zero-day world event flag; abstract op "Sway an analyst".
- **13**: charters `CH_FUND`, `CH_INSURER`, `CH_EXCHANGE_MEMBER`, `CH_CUSTODIAN`; S4/S5 offence handling; regulator orders (suspend, run-off); civil cases for claim disputes and NDA breaches; bridge insurer appointment.
- **14**: ranks, licenses, Reputation values; Legacy for fund records; bankruptcy liquidation of fund units.
- **15**: Mandate base type; contracts (NDA clause, transfer of LP interests, consortium); filings rendering; fund board rendering; collusion data; Services market.
- **16**: scheduler hook `rollCatastrophes(day)`; NPC allocators, NPC funds' named actors, hh balances (MMF share), cat funds, politics model setting `sec_risk_retention` and `rating_disclose_preliminary`; news from PUBLIC events.
- **19**: `collusionScore`, link score between accounts.

## 4. Content needed (22)

- 40 NPC funds (12 hedge, 10 long-only, 4 credit, 3 venture, 3 PE, 5 MMF, 3 ETF sponsors) with names, styles, starting AUM; must include Hale & Ward, Pinn Partners, Vetch (roadmap M12).
- NPC index list with methodologies: GX 100, 5 regional, 12 sector, dividend, IG bond, HY bond, crypto basket (≈ 22 indices) and the NPC ETFs tracking them.
- Style reference exposure profiles per StrategyClass (13 rows) for style drift.
- 3 rating agencies (DEFAULT names: Sterling & Vane Ratings, Meridian Credit Opinion, Orion Ratings Service) + parents; one NPC "Proxy Advisory" is 09's.
- 5 primary NPC insurers (DEFAULT: Aegis Mutual, Halden Assurance, Kaiyo Marine & Fire, Nordvik Mutual, Solano Seguros), 2 reinsurers (Bastion Re, Halvorsen Re), 5 Policyholder Guarantee Schemes, 5 bridge insurers.
- Per-city peril profile (frequency class per peril; coastal/river/fault/hill district flags) for 15 cities + Isla Serena.
- Line-of-business tables: premium risk factors, liability product rates by sector, base rates for KEY_PERSON/MARINE_CARGO/MODEL_IP.
- NPC cat funds and pensions as cat-bond and tranche buyers (≈ 10 named).
- NPC independent valuer and NPC trustee/servicer institutions (one each per bloc).
- 2 NPC dealer banks per bloc acting as APs and tranche dealers (shared with 07).
