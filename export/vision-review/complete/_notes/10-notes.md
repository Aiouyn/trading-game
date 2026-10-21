# 10-notes — Real Estate and Cities

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| new_city_na_step | 4,000 | 2,000–10,000 | activity-weighted players | when a new city opens (§3.2.3) |
| new_city_land_auction_parcels | 40 | 10–200 | parcels | frontier land supply in a new city |
| serena_islands_launch | 9 | 6–12 | islands | Isla Serena launch size |
| serena_island_max | 15 | 9–30 | islands | cap with new coastal cities |
| max_cities | 60 | 15–100 | cities | world city cap (12 per bloc) |
| home_city_change_fee_real (owned by 14) | $25,000 real | — | Money | home city change sink (ruling in 24) |
| cross_bloc_settle_delay_ticks | 720 | 0–2,160 | ticks | cross-bloc purchase delay (no jet) |
| lf_share | 0.50 | 0.4–0.6 | ratio | labor force |
| natural_growth | 0.004 | 0–0.02 | per GY | population growth |
| migration_speed | 0.6 | 0–2 | per GY | intra-bloc migration |
| m2_per_household[tier] | 55/70/110/260 | ±30% | m² | residential demand |
| m2_per_office_job | 14 | 8–20 | m² | office demand |
| retail_m2_per_capita | 1.4 | 0.8–2.5 | m² | retail demand |
| m2_per_industrial_job | 55 | 30–90 | m² | industrial demand |
| hotel_m2_per_capita | 0.35 | 0.1–1.0 | m² | hospitality demand |
| frictional_vacancy | 0.02 | 0–0.05 | ratio | pooled occupancy |
| capacity_floor_m2 | 500 | 100–5,000 | m² | demand ratio floor |
| natural_vacancy_<use> | RES .05, OFFICE .08, RETAIL .06, IND .07, HOSP .10 | ±0.04 | ratio | pressure, valuation |
| growth_pressure_threshold | 1.10 | 1.02–1.30 | ratio | growth eligibility |
| decline_pressure_threshold | 0.85 | 0.6–0.98 | ratio | decline |
| growth_days_required | 7 | 3–28 | GD | NPC construction trigger |
| momentum_cap_ratio | 0.04 | 0.01–0.10 | share of district value | gentrification cap |
| rent_pressure_k | 0.8 | 0.2–2.0 | per GY | rent response to pressure |
| rent_desirability_k | 0.15 | 0–0.5 | — | rent response to desirability |
| rent_daily_move_cap | 0.005 | 0.001–0.02 | ln per GD | max daily rent move |
| base_rent_<use>_<tier> | table §3.6.1 | ±50% | $/m²/GD | rents |
| cityRentMult_<city> | table §3.6.1 | 0.4–2.0 | × | city rents |
| base_let_rate | 0.25 | 0.05–0.6 | per GD | letting speed |
| lease_deposit_months | RES 1, others 3, HOSP 6 | 0–12 | months | deposits |
| maint_rate_<use> | RES .010, OFF .012, RET .012, IND .008, HOSP .015, DC .010 | ±50% | per GY of replacement cost | maintenance |
| condition_drift | 0.08 | 0.02–0.2 | points per GD | condition decay |
| property_tax_rate_<bloc/city> | FDL .010, EUN .012, PYN .008, NKR .009, SRL .015, Serena .004 | 0–0.03 | per GY | tax sink |
| stamp_duty_rate | 0.01 | 0–0.05 | of price | sink |
| transaction_cost | 0.03 | 0–0.06 | of price | sink |
| cap_premium_<use>_<tier> | table §3.8.2 | 0–0.08 | rate | values |
| illiquidity_premium | 0.004 | 0–0.02 | rate | values |
| cap_floor / cap_ceiling | 0.015 / 0.12 | — | rate | clamps |
| comp_n0 | 8 | 2–30 | sales | comps shrinkage |
| npc_listing_rate | 0.002 | 0.0005–0.01 | per GD of stock | supply of listings |
| instant_sale_discount | 0.10 | 0.05–0.25 | of appraisal | instant sale |
| instant_sale_fund_capacity_share | 0.005 | 0.001–0.02 | of pooled value per GD | fund capacity |
| max_ltv_<product> | RES .80, COMM .65, CONSTR .60, BRIDGE .70, 2ND .85 | — | ratio | leverage |
| min_dscr | 1.20 | 1.0–1.6 | ratio | origination |
| max_dti | 0.40 | 0.2–0.6 | ratio | owner-occupier origination |
| ltv_covenant_buffer | 0.10 | 0.05–0.2 | ratio | margin call trigger |
| dscr_covenant | 1.05 | 0.9–1.3 | ratio | covenant |
| cure_period_ticks | 2,160 | 720–7,200 | ticks | cure window |
| foreclosure_auction_ticks | 2,160 | 720–7,200 | ticks | foreclosure listing |
| mortgage_base_spread_<product> | RES .015, COMM .020, CONSTR .030, BRIDGE .035, 2ND .040 | — | rate | pricing |
| mortgage_assumable | false | bool | — | settlement |
| max_liens_per_property | 2 | 1–3 | count | liens |
| max_concurrent_projects | 2 + rankIndex | — | count | development |
| permit_days_by_right | 2 (≤5,000 m²), 5 above | 1–10 | GD | permits |
| planning_capacity_per_GD | 20 + 0.0001·pop | — | reviews | permit queue |
| base_cost_<type> | table §3.11.4 | ±50% | $/m² | construction cost |
| dc_hookup_cost_per_mw | $150,000 | — | $/MW | data-center sites |
| dev_days_<type> | table §3.11.5 | ±50% | GD | durations |
| npc_pipeline_target | 0.6 | 0.2–1.0 | share of shortfall | NPC construction |
| start_cap_share | 0.005 | 0.001–0.02 | of developed parcels per GD | growth pacing |
| derelict_after_days | 30 | 7–120 | GD | decline |
| serviced_reserve_min | 0.03 | 0.01–0.10 | share | corridor expansion |
| crown_parcels_per_city | 6 | 0–12 | parcels | crown towers |
| island_reserve | $1.5B | — | Money | island auctions |
| plaque_price | $2,500 | — | Money | plaques |
| history_chapters_retained | 8 | 2–∞ | chapters | then/now retention |
| npc_mgmt_fee | 0.08 | 0.03–0.15 | of rent | NPC agency fee |
| home_mode_cooldown_ticks | 5,040 | — | ticks | home switching |
| city_envelope_km | 6×6 (9×9 capitals) | — | km | generator bound |
| city_publish_max_lag_ticks | 1,440 | — | ticks | publication lag |

## 2. Decisions (DEFAULTs and resolved questions)

- §3.2.1 Ten new city names (Lakemont, Redmesa, Valcourt, Belmara, Tessan, Mirako, Skarvik, Vintra, Cobreval, Alta Verde) and launch populations; 22 authoritative. DEFAULT.
- §3.2.2 Full district lists for all 15 cities, merging old 01 (Financial Mile, Glasshill, Riverside Lofts, Industrial Basin, Summit Estates) with old 06 (Eastside Docks, Midtown, Gilt Hill as the hill of Summit Estates). Resolves the 01/06 district-name conflict. DEFAULT.
- §3.2.3 New-city opening rule (bloc choice, frontier moment, cap 60). Resolves old 06 Q5 (future cities from distinct personalities, not palette mixing).
- §3.2.4 City access: home bloc R0, other blocs R2, islands R6. Resolves old 06 unlock list extended to 15 cities. DEFAULT.
- §3.2.4 Cross-bloc 1 GD settlement delay waived by a jet (old 04 §7.5 flag adopted).
- §3.4–§3.6 Growth is driven by demand/supply pressure (LC07), replacing old 06 §7.1 DP score. Resolves old 06 Q7 (growth formula).
- §3.6.2/§3.14 R0 rented room rent = market rent ≈ $5.40/GD, superseding old 04's $60/GD. DEFAULT.
- §3.8.4 comp_base calibrated so 14's homes table prices hold exactly at launch.
- §3.10.6 Recourse rules (residential full within 13 floor; company commercial non-recourse; character commercial limited 25%). DEFAULT.
- §3.10.7 Cash-out refinance seasoning 28 GD and +10% cap (closes old E08).
- §3.11.3 Permits, variances, rezoning probabilities and objections. DEFAULT.
- §3.15.3 Location economics made explicit (`location_j` supplied to 09); cosmetic placement never affects it. Resolves LC09.
- §3.18 Island auction schedule: 3 at launch, then 1 per chapter. DEFAULT.
- §3.19 Generator: hybrid skeleton + historic agent growth + tensor-field extensions (LC13); regions vs chunks (LC14); persisted topology; IDs without generator version (LC15). Resolves old 06 Q2, Q4, Q8.
- §3.20.1 HQs never move with rank; relocation only on real events; height does not track market cap. Resolves old 06 Q6 first part.
- §3.20.1 Market lights as optional overlay `0.50 + 0.30·r` (LC06).
- §3.22 Hall of Patrons (12, opt-in, chapter snapshot) plus real crown parcels instead of resizing wealth towers. Resolves old 06 Q6 (per-city recognition) and Q10 (opt-in). DEFAULT.
- §3.24 Owner names hidden by default; opt-in per property. DEFAULT.
- §3.26 Camera elevation 30° (LC11 correction of old 06 §3.1). Renderer three.js behind CityRenderer (resolves old 06 Q1/Q3 for the spec; 17/19 own details).
- §3.27 Property income continues at 100% for dormant owners under a manager (old 01's 50% dormant rule applies to businesses only). DEFAULT.
- §3.12 Crisis templates (V3 Q4) left to 16 but must act through 04/07 inputs, never set prices.

## 3. Interfaces assumed

- 02: named RNG streams `re/<cityId>/<purpose>/<entityId>`; P2/P9/P13 phases; deterministic ids.
- 03: reason-code registry accepts `RE_RENT_IN, RE_PROPERTY_TAX, RE_MAINTENANCE, RE_MGMT_FEE, RE_VACANT_COST, RE_TXN_COST, RE_STAMP_DUTY, RE_MORTGAGE_INTEREST, RE_MORTGAGE_FEE, RE_PREPAY_FEE, RE_PERMIT_FEE, RE_CONSTRUCTION_PAY, RE_LAND_SALE, RE_UNIQUE_SALE, RE_COSMETIC` with proposed classes; consolidation of related-party leases; capital-gains and income tax engine; `netWorthMark(prop)` reads 10's daily mark.
- 04: per bloc per day close `{ g_b, π_b, u_b, i_b, y10_b, c_b ∈ [−1,1], F (0..100), wageIndex_b, CPI_b }`; capital-control flag.
- 05: published day return and quote per listed company; REIT equities take `reitNav(cmpId)` from 10 as fundamental anchor.
- 06: commodity indices `steelIdx, lumberIdx, copperIdx` (1.0 at launch); FX mid and spread; launch FX parity.
- 07: `bank.originateLoan(LoanRequest) → Loan` with CREDIT_CREATE; `creditScore(entityId) ∈ [300,850]`; NPC banks' lending appetite; large-exposure rule; bad-bank NPC holder for overflow forced sales; aggregate hh mortgage default from 10's city PI.
- 08: property insurance products, peril model input fields (§3.16), premium/claim postings; securitization reads loan fields (§3.10.8); funds can own props.
- 09: business `{ bizId, cityId, sector, staff, upgrades }`; `city.requestPremises` caller; `location_j` consumer; construction company capacity (m²) and quality/reliability levels; developer business tier; property management agency fee and skill; appraisal and brokerage businesses; employment deltas on expansions/closures.
- 11: data-center cluster site requests with MW; PROPERTY_OPS model products with an ops MCS.
- 13: Held state, court freezes, planning tribunal, CMA concentration review, eviction tribunal, Reputation hooks via 14, collection floor ($5k + one T1 business).
- 14: rank (never demoted), lifestyle homes table, storage, staff lines, jets, visitable-estate opt-in, Prestige, Legacy, dormancy timers.
- 15: P2P property exchange, auction house (anti-snipe), contract templates (Lease), escrow (Clearing House), moderation, collusion graph, city boards and N_a, chapter calendar.
- 16: named NPC landlords/developers/companies, hh income and consumption, causal news, EmploymentDelta and transit/amenity/crime events, catastrophe events, politics (property tax changes, transit projects, lobby bonus).
- 17: layouts for the screens in §7. 19: storage of regions and manifests, HTTP delta delivery, CDN, tick stamp. 21: generator migrations admin.

## 4. Content needed (for 22)

- 15 city names (10 proposed) + Isla Serena; 108 district names (all proposed in §3.2.2); one personality file per city (terrain, coastline, basis fields, orientation rules, parcel sizes, height caps, archetypes 6–10 per district, palettes, trees, cityRentMult, hhSize, owner-occupier share).
- 108 landmark names and templates (one per district) plus Isla Serena landmarks; signature places for the 10 new cities.
- Street-name banks per city (≥ 400 names each, bilingual string keys).
- 9 island names for Isla Serena (+6 queued).
- 3–6 named NPC landlords per city (≈ 70), 2 listed REITs per bloc (10), 2–4 NPC developers per city (≈ 45), one land authority and one NPC property fund per city, one "bad bank" per bloc.
- Archetype catalogue (≈ 150 building archetypes) and facade kits (starter 3 + ≥ 30 premium), company architectural kits (≥ 12), crown styles (≥ 8).
- News templates for: city opening, land auction results, planning approvals over 10,000 m², development completions, foreclosure sales (anonymous), district events, Hall snapshot.
