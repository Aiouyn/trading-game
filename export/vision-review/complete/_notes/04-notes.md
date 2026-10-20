# 04 notes: Macro, Central Banks and Sovereigns

## 1. Parameters

Time in game days unless stated (1 game day = 1 real hour; 1 game year = 364 game days). Rates per game year.

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| macro_scale_ref_players | 5,000 | 1,000–20,000 | active players | world scale S (§3.2) |
| macro_scale_min / macro_scale_max | 0.2 / 400 | fixed band | ratio | world scale clamp (§3.2) |
| macro_world_gdp_ref | 100e12 | 50e12–200e12 | FDL per game year at S = 1 | NPC economy size (§3.2) |
| npc_to_player_wealth_band | [20, 200] | monitored | ratio | old "GDP = 50× player NW" kept as a monitored band (§3.2) |
| macro_regime_mean_days_exp | 819 | 546–1,092 | game days | expansion length (§3.3.1) |
| macro_regime_mean_days_{ovh,con,rec} | 273 | 182–364 | game days | other regime lengths (§3.3.1) |
| macro_regime_min_days_{exp,ovh,con,rec} | 182 / 63 / 91 / 91 | ±50% | game days | minimum regime lengths |
| macro_gap_halflife_years | 0.30 | 0.2–0.5 | game years | output-gap pull to regime attractor (§3.4.1) |
| macro_gap_vol | 0.008 | 0.004–0.015 | per √year | output-gap noise |
| macro_xreg_* | per regime table | ±50% | gap | regime attractor gaps (§3.4.1) |
| macro_ai_productivity_max | 0.005 | 0–0.01 | growth per year | AI race effect on potential (§3.4.2) |
| macro_phillips_slope | 0.25 | 0.1–0.5 | | inflation response to gap (§3.5) |
| macro_cb_meetings_per_year | 4 | fixed | per bloc | meeting calendar (§3.6.1) |
| macro_cb_decision_tick | 420 | 60–539 | tick of day | decision publication tick |
| meeting day of quarter | NA 15, SC 27, FU 39, EC 51, PL 63 | 1–91 | day of quarter | staggered calendar (§3.6.1) |
| macro_cb_smoothing ρ | 0.5 | 0.3–0.8 | | rate smoothing (§3.6.3) |
| macro_cb_phi_fs | 1.5 | 0.5–3 | | financial-stability term in rule |
| macro_cb_max_step / _wide | 0.005 / 0.0075 | fixed | rate | max move per meeting (steps of 25 bp) |
| macro_cb_max_emergency_per_quarter | 2 | 1–3 | meetings | emergency meetings (§3.6.6) |
| macro_cred_guidance_break | 0.05 | 0.02–0.10 | credibility | credibility loss on surprise (§3.6.7) |
| macro_policy_lag_days | 120 | 60–240 | game days | transmission lag |
| macro_corridor_halfwidth | 0.0025 | 0.001–0.005 | rate | corridor ±25 bp (§3.8.1) |
| macro_cb_haircut_* | per asset table | | share | standing facility haircuts (§3.8.3) |
| macro_rr_* | per bloc | 0–20% | share | reserve requirements (§3.8.2) |
| holdingsCapGdp | 0.35 | 0.2–0.5 | share of GDP | QE holdings cap (§3.8.5) |
| macro_ycc_bloc | PL | any bloc or none | | YCC user (§3.8.6) |
| macro_ns_lambda | 1.8 | 1.0–3.0 | years | Nelson-Siegel fit (§3.7.5) |
| macro_irp | 0.002 | 0–0.005 | rate | inflation risk premium (§3.7.6) |
| macro_rev_base_* / macro_issue_mix_* | per bloc | | share | fiscal revenue, issuance mix (§3.9, §3.10) |
| macro_auction_tick | 330 | 61–539 | tick of day | primary auction tick (§3.10) |
| auction award cap | 35% | 20–50% | share of offering per group | primary auctions (§3.10) |
| macro_auction_noncomp_max_face | 10,000,000 | 1M–50M | face per group | non-competitive bids |
| NPC dealers per bloc | 8 | 5–12 | dealers | auction demand (§3.10.4) |
| macro_sov_lgd | 0.6 | 0.4–0.8 | share | sovereign spreads (§3.11) |
| sovereignBaseHazard λ0 | FU 0.0005, EC 0.003, PL 0.002, NA 0.0003, SC 0.02 | ±50% | per year | sovereign PD (§2.2) |
| macro_sov_grace_days | 7 | 3–14 | game days | missed-payment grace (§3.12) |
| macro_cac_threshold | 0.75 | 0.66–0.85 | share of face | aggregated CAC (§3.12.2) |
| macro_fx_uip_share υ | 0.5 | 0–1 | | FX fair value (§3.13.1) |
| capital controls durations | L2 3 days, L3 72 days | | game days | §3.13.6 |
| macro_major_base_rate | 3.6e-4 | 2e-4–6e-4 | per game day × vulnerability | major crisis rate (≈35% of chapters) |
| macro_major_min_gap_days | 504 | 336–1,008 | game days | spacing of majors |
| storm rate | 1 per 91 days | 1/60–1/182 | per game day | storms (§3.16) |
| ripple rate | 1 per 7 days | 1/3–1/14 | per game day | ripples (§3.16) |
| Fear Index genesis / half-life | 22 / 2 hours | | index / game hours | §3.14.1 |
| macro_cycle_label_lag_days | 21 | 7–42 | game days | public cycle label (§3.3.6) |
| macro_governor_term_days | 2,912 | 1,456–4,368 | game days | governor terms (§6.1) |
| (Stabilizer keys) | — | — | — | owned by 03 §3.7 (ruling in 24): `stab_kp` 0.5, `stab_ki` 0.02, `stab_deadband` 0.05, `stab_min_sample` 200 characters, `stab_observe_game_days` 168 game days, levers per 03 §3.7.4; 04 declares none of them |

## 2. Decisions

- §2.2 Default bloc table (GDP shares, targets, regimes, initial rates, FX, hawkishness draws): DEFAULT (Mathis may override).
- §3.2 NPC economy size: reference GDP $100T at 5,000 players, scaled by active players; old "NPC GDP = 50× player NW" kept as a monitored band [20, 200]. Resolves the old scale question.
- §3.3.1 Regime chain converted to the 364-day year (ENGINE.md 252-day values superseded).
- §3.3.4 Hazard weights on imbalance z-scores: DEFAULT; 20 calibrates within ±50%.
- §3.6.1 CB meetings quarterly per bloc, staggered (NA 15, SC 27, FU 39, EC 51, PL 63 of each quarter, t = 420). Resolves old 01 §1 vs §5.4 ("~6 real days").
- §3.6.5 Forward guidance as published dots; market knows r*_cb (DEFAULT simplification, §3.7.2).
- §3.8.6 YCC used by PL by default.
- §3.10 Primary auctions: uniform price, NPC dealer ladder, 35% award cap per group.
- §3.12.2 Restructuring through exchange offer with aggregated 75% CAC.
- §3.13 PL managed band ±3% vs basket; SC managed float with break rule; hard peg adoption rule DEFAULT (Mathis may override).
- §3.13.6 Capital controls levels 1–3 with default durations.
- §3.14.1 IV anchor `0.10 + 0.004 × F` (DEFAULT; 06 owns surface).
- §3.15 Macro releases public to everyone at the release tick, no tiered early access (DEFAULT, Mathis may override).
- §3.16 Crisis tiers RIPPLE / STORM / MAJOR replace the Phase-0 crisis odds; 15 major kinds; emergent labels without extra shocks.
- §3.16 "Whale accumulates" auto-news removed (L11); only filings and anonymous prints.
- §3.17 Stabilizer: defined once in 03 §3.7–§3.8 (ruling in 24); 04 keeps only the weekly report.
- §8 Negative rates only EC and NA; pass-through to corporate deposits above 10M only (DEFAULT).
- §6.1 Governors with 2,912-day terms.
- Rate limit taken from 00 (20 intents per tick), not old 02's 10.

## 3. Interfaces assumed

- 02: clock, calendar hooks, RNG streams `macro/*`, `dmath`.
- 03: postings with reason codes `_P` / `_W` (§3.18); player-economy aggregates (NW distribution by age) for the Stabilizer; L2 top bracket applied by 03. Note: 03 §3.7 also defines a Stabilizer with different lever numbering (L3 levy, L4 upkeep); the two need reconciling by the coordinator.
- 05: `NpcPoolOrder { poolId: 'CB:<bloc>' | 'TSY:<bloc>', assetId, side, qty, limitPrice?, tif }` handed in P4; published prices, `rv21_GX`, GX index, bond depth index per bloc, market-wide halt event; hooks `makerWithdrawal`, `npcSellProgram`; regime multiplier table (05 §3.3.5); L4 fee multiplier applied by 05.
- 06: bond line registry and model prices off 04 curves; FX forwards (covered parity); CDS; commodity indices; `erpShock`, `stablecoinDepeg`, `venueCollapse`, `commoditySupplyShock`.
- 07: interbank spread, credit conditions, bank equity, `corporatePdMultiplier`, `depositConfidenceShock`, `repoHaircutShock`; applies CCyB and LTV caps.
- 08: `SovereignRatingInputs` consumed by agencies (20-grade scale); `correlationShock`, `pdShock`; ETF discount index.
- 10: house price index, `housePriceShock`, `transactionFreeze`, `cityActivity` consumer, `islaSerenaIndex()`.
- 11: `aiRaceIndex`, `aiRaceIndexShock`. 12: `worldHackRate`, `zeroDay`.
- 13: regulators, courts for holdout litigation. 15: Wire posts and filings.
- 16: news text, `FiscalProgram` proposals (with `incentive?`, `budget/spent`), politics shocks, named governors.

## 4. Content needed (catalog 22)

- Names of the 5 central banks, 5 treasuries, 5 statistics offices and their Cycle Committees, the Stability Board, the Concord Stability Facility branding.
- 8 NPC primary dealer names per bloc (40 total).
- Governor names and short bios per bloc, plus successor pools.
- Per-city `cityGdpShare` and `cycleBeta` for the 15 cities and Isla Serena; names for the 12 cities not yet named.
- Bond line catalogue per bloc (tenors B3M to N30Y and L10Y, coupons, maturities, ids).
- Bloc equity index names and the world index (GX100), genesis PE norms per bloc.
- Named NPC economists and forecasters for release consensus.
- Release names per kind per bloc (CPI, JOBS, GDP, PMI and others).
- Crisis and storm display names and headline templates (with 16).
