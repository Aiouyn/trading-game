# 09 notes — Businesses and Companies

## 1. Parameters

All time values in game days unless stated (1 game day = 1 real hour). Money at launch price level (indexed by 04 CPI).

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| cmp_founding_fee | $1,000 | $0–$10,000 | Money | founding a company (SINK) |
| catalog_size_target | 150 | 100–250 | types | catalog completeness (22) |
| biz_calib_density | 12 | 4–30 | player businesses/market | genesis demand calibration (§3.2.4) |
| biz_share_adjust_rate (θ) | 0.04 | 0.01–0.15 | per game hour | customer stickiness (§3.3.2) |
| npc_entry_rate | 0.02 | 0–0.05 | per day per unit excess margin | NPC field entry |
| npc_exit_rate | 0.01 | 0–0.05 | per day | NPC field exit |
| npc_field_floor | 0.10 | 0.05–0.30 | × initial weight | minimum NPC competition |
| npc_field_cap | 3.0 | 1.5–5.0 | × initial weight | maximum NPC competition |
| antitrust_share | 0.60 | 0.4–0.8 | market share | antitrust trigger (01 §9) |
| biz_level_cap | 25 | fixed | levels | upgrade axes |
| biz_expansion_cost | 0.80 | 0.5–1.0 | × c0 | chain expansion |
| biz_decay_per_day | 1.0 | 0.5–2.0 | condition points/day | decay without upkeep |
| biz_upkeep_ratio | 0.0015 | 0.0005–0.003 | × (c0+upgrades)/day | required upkeep |
| hire_fill_per_day | 0.5 | 0.1–2.0 | heads/day × supply | hiring speed |
| manager_salary_base | $150 | $50–$500 | Money/day (1-star, B1) | managers |
| integration_build_discount | 0.15 | 0–0.3 | share | own-construction advantage (I01) |
| fin_setup_fee | 0.10 | 0.05–0.25 | × c0 | financial institution setup SINK |
| trophy_upkeep | 0.0006 | 0.0002–0.002 | × value/day | trophies |
| concession_incumbent_credit | 0.10 | 0–0.2 | bid multiplier | concessions (01 §14.2) |
| exchange_fee_cap_bps | 0.5 | 0.1–2 | bps of notional | exchange concession |
| exchange_rev_cap | 0.0002 | 0.0001–0.001 | share of bloc daily traded value | exchange faucet cap |
| utility_spread | 0.03 | 0.01–0.06 | over 10y yield /game year | regulated utility return |
| biotech_pass | 0.35 | 0.2–0.5 | probability | trial pass (01 §4.4) |
| rd_fail_base | 0.15 | 0.05–0.3 | probability | R&D failure |
| rd_gain_k | 0.12 | 0.05–0.25 | coefficient | R&D gain |
| tender_share | 0.30 | 0.1–0.6 | share of B2B demand | tendered volume |
| ipo_min_ev | $50,000,000 | $10M–$200M | Money | IPO size (01 §4.6) |
| ipo_min_owned_days | 336 | 168–672 | game days (14 real days) | IPO history |
| ipo_min_quarters | 3 | 1–8 | game quarters | IPO statements |
| ipo_max_secondary | 0.10 | 0–0.25 | share of company | founder cash-out at IPO |
| ipo_underwriting_fee | 0.05 | 0.02–0.08 | share of proceeds | SINK (01 §4.6) |
| ipo_npc_demand_mult | 2.5 | 1–5 | × offering | NPC book demand |
| ipo_max_alloc_pct | 0.05 | 0.01–0.10 | share of float | allocation cap |
| ipo_lockup_days | 168 | 72–336 | game days (7 real days) | founder lockup |
| founder_sell_cap | 0.02 | 0.005–0.05 | share outstanding/day | post-lockup sales |
| delist_ev | $10,000,000 | $1M–$50M | Money | delisting review |
| startups_per_week | 3 per 4,000 N_a per bloc | 1–10 | startups/game week | startup pipeline |
| covenant_cure_days | 28 | 7–56 | game days | covenant cure |
| related_party_band | 0.10 | 0.05–0.2 | share vs appraisal | related-party rule |
| npc_sale_haircut | 0.85 | 0.7–0.95 | × EV | NPC sale (01 §4.6) |
| npc_tender_premium | U(0.05, 0.25) | 0–0.5 | premium | NPC tender reservation |
| take_private_premium | 1.2 | 1.0–1.5 | × 30-day VWAP | take-private |
| pill_trigger | 0.20 | 0.10–0.30 | share of votes | poison pill |
| pill_discount | 0.50 | 0.25–0.75 | share of price | pill rights price |
| lbo_min_equity | 0.30 | 0.15–0.5 | share of price | LBO equity |
| lbo_max_ev_ltv | 0.65 | 0.4–0.8 | × EV | LBO debt cap |
| lbo_max_ebitda_mult | 6 | 3–8 | × EBITDA | LBO debt cap |
| lbo_cash_sweep | 0.50 | 0–1 | share of excess CF | LBO sweep |
| exchange_consent | 0.90 | 0.66–0.95 | share of class | out-of-court exchange |
| reorg_exclusivity_days | 28 | 14–91 | game days | plan exclusivity |
| reorg_deadline_days | 91 | 56–182 | game days | conversion to liquidation |
| npc_private_firms_per_city | 40 | 10–150 | firms | named NPC competitors |

Non-PARAM tables owned here (23 should list): tier table (§3.1.2: payback, multipleDays, rank, setup), segment coefficients (§3.3.1), upgrade cost formulas (§3.5.1), business event probabilities (§3.4.5), tender scoring weights (§3.9.3), startup power-law buckets (§3.11.1), round valuation steps, OC-style covenant defaults (§3.14).

## 2. Decisions

- §3.1.2: **Roadmap Q2 and conflict C4 resolved option A (bible pace)**: base payback B1 6 / B2 12 / B3 24 / B4 48 / B5 96 / B6 200 game days, defined net of all opex at reference crowding. DEFAULT.
- §3.1.1: B3+ businesses must be owned by a company. DEFAULT.
- §3.1.5: catalog purchase pays c0 as SINK; included fit-out lease for premises when not owned. DEFAULT.
- §3.2.4: genesis calibration at 12 player businesses + 50% NPC field per market. DEFAULT.
- §3.3.1: segment coefficients and promise bonuses. DEFAULT.
- §3.3.2: customer stickiness θ = 0.04/game hour. DEFAULT.
- §3.3.5: category-level price elasticity added to stop collusive price rises. DEFAULT.
- §3.4.4: offline cap 8 / +8 manager / +4 automation / 24 professional CEO / none for listed companies (autopilot 0.9 after 24 game days). DEFAULT. Also resolves the 01 §8.3 offline cap vs 01 §14.2 "dormant businesses run on managers at 50% income" contradiction: dormant businesses are IDLE with 50% attractiveness weight, no income.
- §3.5.2: EV is profit-based; upgrade costs not added (implements 01 §9's "70% reflected" rule by mechanism).
- §3.5.4–3.5.5: product lines, category frontier drift, R&D formulas (company building, Mathis directive 2026-10-09). DEFAULT.
- §3.6.3: managers, CEOs, AI operators all act through the same decisions; no unexplained profit multiplier (I05). DEFAULT.
- §3.7.4: transfer pricing COST only inside 100%-owned groups; arm's-length across minority boundaries (I07, R02). DEFAULT.
- §3.8.1: financial catalog items: 10% SINK + 90% becomes capital/stake. DEFAULT.
- §3.8.1: **V3 question 1 resolved**: insurers R3, banks R4, exchange concessions R5, SWF R6 (earlier than Dynasty for banks and exchanges). DEFAULT.
- §3.8.3: concessions re-auctioned each chapter, sealed first-price, 10% incumbent credit, book value to outbid incumbent (01 §14.2 kept); fee caps on platforms.
- §3.9: Tender Board design; 30% of B2B demand tendered; requirement types; incumbency and switching costs; concentration bargaining (C05–C08). DEFAULT.
- §3.9.6: 2% P2P tax applies to asset transfers, not service fees (assumption for 15).
- §3.10.1: **01 §4.3 "5+ sectors needed for IPO" dropped**: any company with EV ≥ $50M and 3 quarters may list (company-building directive). Founder needs R3 + LIC3. DEFAULT.
- §3.10.2: founder secondary at IPO allowed up to 10% (roadmap left open). DEFAULT.
- §3.10.4: listed player companies are anchored by a sum-of-the-parts fundamental V (business EV rule), not annual P/E. DEFAULT (needed for consistency; see report).
- §3.11: startup hidden fate + noisy observed scores; research narrows noise. DEFAULT.
- §3.12.1: listed companies one share one vote; founder super-vote converts at IPO. DEFAULT.
- §3.12.2: 07 lends to operating businesses up to min(50% EV, 4× EBITDA). DEFAULT (assumption for 07).
- §3.13: thresholds 5/10/20/50/90%; tender rules; takeovers require LIC4. DEFAULT.
- §3.13.5: NPC founders may refuse (independence) (W04). DEFAULT.
- §3.13.8: NPC proxy advisor model with engine-valued motions. DEFAULT.
- §3.14: LBO limits and covenants. DEFAULT.
- §3.16: Protected Reorganization with absolute priority, cram-down, 91-game-day deadline; claims tradeable on 06. DEFAULT.
- §9 #14: dividends paid within 91 game days before a filing while insolvent are clawed back. DEFAULT.
- §9 #21: IDLE/failed businesses release their storefront slot after 14 game days. DEFAULT.
- §8 #20: same-controller mergers with minority holders need a majority-of-minority vote. DEFAULT.

## 3. Interfaces assumed

- **02**: hourly stagger `hash(id) mod 30`; RNG streams `biz:events:<bizId>`, `biz:rd:<projectId>`, `biz:tender:<cityId>`, `biz:startup:<cmpId>` (server-secret); calendar hooks (day close, game quarter, game year AGM, chapter boundary for concessions).
- **03**: reason codes in §3.17 with `_NPC` variants; group consolidation (> 50% control) with minority interests and intra-group elimination; quarterly statements per company; taxes on consolidated profit; accounting-firm tax hook (−5% taxable profit); Stabilizer demand lever `stab` ∈ [0.90, 1.10].
- **04**: bloc CPI and wage index; output gap per bloc; inflation; 10y yield; `fear`; embargo and crisis events.
- **05**: `09.fundamentalValue(cmpId)` used as V for player-listed stocks; earnings jump applied from `biz.corp.earnings` (2–4× surprise); company buyback orders; position caps (25% NPC float, 49% player co) enforced in P1 with a tender exception; NPC retail order-flow notional per bloc for brokerages; IPO listing at next opening auction.
- **06**: commodity spot prices (coffee, cocoa, wheat, corn, crude, gas, gold, copper, lithium, steel, lumber, rare earths), power price per bloc, freight index; bond primary book-build; `CLAIM` instrument class; convertibles pricing.
- **07**: business loans and revolvers with underwriting; credit spreads; NPC DIP lenders; factoring of receivables; lending standards; personal guarantees; acceleration behaviour.
- **08**: insurance lines for businesses (PROPERTY, BI, CYBER, LIABILITY, D&O, TRADE_CREDIT, KEY_PERSON, MARINE_CARGO, ENERGY_ASSET, PROFESSIONAL_INDEMNITY); catastrophe events with `biDays` and damage ratios; composite ratings for companies and bonds; funds (PE, VC) as acquirers/investors; `fund.ins.charter`, `fund.create` used by financial catalog items.
- **10**: storefront slot assignment, district footfall weights, district desirability z-score, premises leases and market rents, HQ buildings and CBD tower queue, property appraisal, city population/income/tourism index, city growth with N_a, frontier slot creation, property transaction volume (moving company), forced-sale values.
- **11**: compute market share per bloc for data centers; data inventory (DQU) with provenance; AI operator models (operations, pricing, forecasting) and research-assist models; lab entity created by "AI lab" purchase.
- **12**: attack surface for hackable types; `DP_eff` for confidentiality tenders; staff loyalty use and E3 poaching; world hack rate index; security service contracts.
- **13**: competition regulator cases (antitrust, merger review), insider trading rules and surveillance score (+30 for related-party attempts), court for Protected Reorganization, utility regulator, disclosure offences, derivative suits.
- **14**: ranks R0–R5 gates and thresholds; licenses LIC1–LIC4; Reputation (tender score); character bankruptcy and the $5k + one B1 floor.
- **15**: contracts engine (supply, service, consortium, transfer, equity-stake clauses), filings rendering, business & property exchange, Services market, P2P tax, Mandate, syndicate companies.
- **16**: hh labour and consumption data, named NPC private firms and founders (independence), NPC customers and causal tender triggers, NPC analysts, Proxy Advisory, NPC managers/CEOs/key staff pools, NPC strategic acquirers, startup founder names, festivals/heatwaves/hype drops, news.
- **19**: collusion graph and account-link scores for IPO allocation and anti-funnelling.

## 4. Content needed (22)

- **Business types**: 150 total; the 81 rows in §3.1.4 are binding; ≈ 69 more built from existing archetypes (suggested: bakery, bubble-tea stall, bookshop, gym, barber, laundromat, pet groomer, bike repair, florist, tutoring centre, coworking operator, parking operator, car wash, event caterer, wedding planner, translation agency, recruitment agency, payroll bureau, IT consultancy, cloud MSP, game studio, podcast network, ticketing platform, ride-hail platform, freight broker, warehouse operator, last-mile hub, rail freight, container depot, fuel distributor, EV charging network, battery storage farm, hydro plant, geothermal plant, gas power plant, fertilizer plant, fishery, vineyard (no vice: wine as luxury agriculture only), dairy, timber estate, quarry, copper mine, steel mill, cement works, chemicals plant, pharma generic maker, medical device maker, dental clinic chain, veterinary clinic, elder-care home, diagnostics lab, telehealth platform, robotics integrator, drone services, satellite data provider, semiconductor design house, payments processor, credit bureau, pension administrator, asset-management boutique (08 link), auction house, jewellery maker, perfume house, art gallery, design studio, architecture firm, engineering consultancy, environmental consultancy, security guarding firm, forensic accountancy).
- **Per type data** (`BusinessType` / `ArchetypeRef`): refPrice, cogsRatio, fixedRatio and its split, capacity, hours and hour profile, weekend factor, cycle sensitivity, income and price elasticity, 52-week seasonality, inputs (bill of materials), staff per capacity, data rate, hackable flag, twist rules, segment shares, sectorAdj, normalMargin, techDrift, take rates for platforms, reserve years for mines, setup days for B6 types.
- **Product categories**: ≈ 90 with segment splits and input-output coefficients (BUSINESS_DERIVED drivers).
- **Intermediate goods**: roasted coffee, furniture, electronics components, chips, cars, refined products, construction services, freight, cold storage, maintenance service, cooling service, software licenses (+ more as types need).
- **Certifications**: MedGrade, ColdChain Assured, SecureVault, QualityMark, GridSafe, PortSafe, CleanLab, FinCompliance (costs, prep days, validity, audit probability, requirements).
- **Requirement profiles** per B2B/institutional category (price-led, reliability-led, certified-led weights) and average tender sizes.
- **Named NPC private firms**: 40 per city (≈ 640) via generator; founders with independence values.
- **NPC staff pools**: manager names, key-staff archetypes (head chef, lead engineer, head of research, plant manager…).
- **Startup generator**: founder names, pitch templates per category.
- **NPC institutions**: Proxy Advisory (one global), NPC underwriter banks (from 07's list), NPC valuation expert firm, NPC strategic acquirers (≈ 20 named conglomerates across blocs).
- **Concessions**: per city/bloc list of power utility, port terminal (coastal cities), exchange, chip fab and nuclear plant slots with build times.
- **Trophies**: one sports franchise per city (names, sport), Isla Serena resort.
- **NPC listed company → catalog-type mapping** for absorption (§3.13.10) for the 240 listed NPC companies.
