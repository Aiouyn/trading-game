# 16 notes: The living world

## 1. Parameters

| Key | Default | Range | Unit | What it affects |
|---|---|---|---|---|
| lf_share | 0.5 | 0.4–0.6 | share of population | labor force per city (§2.1) |
| actor_memory_cap | 64 | 16–256 | items | actor memory size (§2.2) |
| actor_rel_cap | 48 | 16–128 | relationships | relationships kept per actor (§2.2) |
| phase_budget_ms_P3 (owned by 19) | 200 | 100–1,000 | ms per tick | P3 time budget (§3.1.2; ruling in 24) |
| actor_full_evals_per_tick | 2,000 | 500–10,000 | evaluations | full actor decisions per tick (§3.1.2) |
| labor_share | 0.55 | 0.45–0.65 | share of output | wage bill (§3.2.2) |
| rnd_share | 0.025 | 0.01–0.05 | share of output | NPC R&D by domain (§3.2.2, §3.10) |
| npc_illegal_integrity_max | 0.25 | 0–0.5 | trait | which NPCs consider illegal actions (§3.3.3) |
| actor_action_margin | 0.05 | 0–0.2 | utility | NPC act-vs-no-op threshold (§3.3.3) |
| actor_actions_per_epoch | 2 | 1–4 | actions | actions per decision epoch (§3.3.3) |
| actor_react_salience | 0.5 | 0.2–0.9 | salience | reactive epoch trigger (§3.3.4) |
| memory_halflife_game_days | 90 × (0.5 + patience) | 30–364 base | game days | memory decay (§3.3.5) |
| trust_contract_gain_cap | +20 | 5–50 | trust per pair per game quarter | trust farming counter (§3.3.5) |
| npc_fund_max_participation | 0.5 | 0.1–1 | × ADV per tick | NPC fund trading cap (§3.3.8) |
| actor_aging_rate | 0.25 | 0.1–1 | actor-years per game year | actor aging (§3.4.6) |
| dynasty_formation_nw_real | $5B | $1B–$50B | real $ | new dynasty formation (§3.4.7) |
| legislature_seats | 300 | 100–600 | seats | per-bloc legislature (§3.5.1) |
| coalition_collapse_approval | 0.25 | 0.1–0.4 | approval | coalition breakup (§3.5.3) |
| petition_threshold_real | $50M | $5M–$500M | real $ | petition bill sink (§3.5.4) |
| committee_game_days | 14 | 7–56 | game days | bill committee stage (§3.5.5) |
| vote_noise_sd | 0.5 | 0.1–1 | logit | floor vote noise (§3.5.6) |
| lobby_registration_fee_real | $10,000 | $1k–$100k | real $ | lobbying registration (§3.5.7) |
| lobby_window_game_days | 91 | 28–182 | game days | lobbying spend memory (§3.5.7) |
| lobby_coeff | 0.25 | 0.1–0.5 | logit per √($1M) | lobbying strength, clamp ±0.75 (§3.5.7) |
| campaign_coeff | 0.05 | 0.01–0.1 | support per ln unit | issue campaign effect (§3.5.8) |
| campaign_cap_per_quarter | 0.15 | 0.05–0.3 | support | issue campaign cap per bloc and axis (§3.5.8) |
| election_interval_game_years | 4 | 2–8 | game years | elections (§3.5.9) |
| contribution_cap_real | $5M | $100k–$50M | real $ per donor per party per cycle | contributions (§3.5.9) |
| news_publish_threshold | 0.15 | 0.05–0.4 | newsworthiness | news candidates (§3.6.2) |
| news_target_per_game_day | 40 | 20–120 | items | news volume (§3.6.2) |
| info_fee_cap_pct_nw_per_game_day | 0.05% | 0.01–0.2% | of NW | Terminal plus Research Desk fee cap (§3.6.6) |
| rumors_per_game_day | 8 | 2–20 | rumors | rumor volume (§3.6.7) |
| rumor_accuracy_min / _max | 0.40 / 0.70 | 0.3–0.8 | probability | rumor source accuracy band (§3.6.7) |
| rumor_fade_halflife_game_days | 1 | 0.25–5 | game days | rumor price impulse fade (§3.6.7) |
| tip_accuracy | 0.85 | 0.6–0.95 | probability | tip truth rate (§3.6.8) |
| macro_ripple_rate | 1/7 | 1/14–1/2 | per game day | RIPPLE shocks (§3.7.1) |
| macro_storm_rate | 1/91 | 1/182–1/28 | per game day | STORM shocks (§3.7.1) |
| major_exo_rate | 0.20 | 0.05–0.4 | per chapter | exogenous MAJOR shocks; total target 0.43 (§3.7.1) |
| major_precursor_min_game_days | 8 | 4–20 | game days | MAJOR telegraph (§3.7.3) |
| macro_major_min_gap_days | 504 | 168–1,344 | game days | spacing of MAJORs (§3.7.3) |
| major_suppression_game_days | 336 | 0–1,344 | game days | quiet after a player-caused crisis (§3.7.3) |
| consequence_max_depth | 4 | 2–8 | links | cascade depth (§3.8.3) |
| history_threshold | 0.4 | 0.2–0.7 | significance | history recording (§3.9.1) |
| history_permanent | 0.6 | 0.4–0.9 | significance | permanent history (§3.9.1) |
| tech_base_cost_chapters | 1.6 | 0.5–4 | baseline chapters of R&D | tech pace (§3.10.1) |
| tech_cost_growth | 1.25 | 1.1–1.6 | × per level | tech cost escalation (§3.10.1) |
| era_thresholds | [0, 8, 18, 30, 45] | — | eraScore | era changes (§3.10.3) |
| era_min_chapters | 2 | 1–6 | chapters | era spacing (§3.10.3) |
| fact_sale_base_real | $25,000 | $5k–$250k | real $ | fact sale price (§3.11.4) |
| fact_sale_cap_real_per_chapter | $1M | $100k–$10M | real $ per character | FACT_SALE_NPC faucet cap (§3.11.4) |
| briefs_per_real_day | 3 | 1–5 | briefs | opportunity briefs (§3.12) |
| actor_cap | 2,000 | 600–10,000 | actors | actor population cap (§3.13) |

Fixed numbers inside formulas (all `DEFAULT (Mathis may override)`):
- Aggregate economy (§3.2):
  - intermediate share 0.30;
  - investment 0.18 base, clamped [0.08, 0.28];
  - mpc clamped [0.70, 0.95];
  - wealth effect 4% per game year;
  - household dividend share 0.3.
- Dynasty influence (§3.4.3, §3.4.5, §3.4.6):
  - lender pricing −20 / +30 bps; outlet ×1.2 / ×0.8;
  - dispute logit −3 base;
  - hazard `0.25 × 0.0003·e^(0.09(a−30))`.
- Floor vote weights 2 / 2 / 1 / 1 / 1 (§3.5.6).
- Election coefficients (§3.5.9):
  - β_inc 1.0, β_iss 2.0, β_camp 0.3, noise 0.15;
  - 5% seat threshold, Sainte-Laguë;
  - blocs offset by 291 game days.
- Information prices (§3.6.6):
  - Terminal `max($20, 2e-6·NW)`;
  - analysts $100 / $600 / $2,500;
  - Research Desk `$1,500 + 1e-5·NW`, queries $25,000.
- Rumors fizzle 70% / denial 30% (§3.6.7).
- Shocks (§3.7.2, §3.7.3):
  - telegraphed events de-escalate 15% of the time;
  - shock category weights.
- 20 consequence rules (§3.8.2).

## 2. Decisions

- §3.2.5: the money closure. Household and firm flows are internal TRANSFERs. Spending at player businesses is FAUCET under 03's boundary rule. NPC sector income comes from the 04 nominal-GDP closure (`ROW_NPC_INCOME`). DEFAULT.
- §3.3.1: a roster of 600 actors by archetype; 40 per new city. DEFAULT.
- §3.3.2: knowledge firewall. NPC rules never read a player's rank, NW, boards or Prestige (C09, F05).
- §3.3.3: the utility model uses Gumbel noise, an action margin of 0.05 and 2 actions per epoch. DEFAULT.
- §3.3.8: NPC funds are capped at 0.5 × ADV (old ROADMAP R5).
- §3.4.1: 12 dynasties of 8 members. DEFAULT.
- §3.4.6: actors age at 0.25 per game year, because 00's clock would otherwise age them 24 years per real year. Player characters do not age (14 §3.15.6).
- §3.5.1: 300 seats, 4 parties and 12 caucuses per bloc. DEFAULT.
- §3.5.9a: the 21-lever policy registry. DEFAULT.
- §3.5.9a: Stabilizer precedence. The legislated value is the base and the Stabilizer applies a bounded offset (±3 points on TAX_TOP_INCOME). DEFAULT.
- §3.5.10: a new governor's hawkishness is set from econ ideology. DEFAULT.
- §3.5.11: no player office-holding at launch. DEFAULT.
- §3.6.1: invariants N1 (non-empty causes) and N2 (no false facts except labeled rumors).
- §3.6.6: the Terminal headline arrives 1 tick early, never before the event commit. "Why it moved" groups flows by pool type only (L11, L13). DEFAULT.
- §3.6.6: published research notes are added to support 14's PUBLISHED_RESEARCH legacy line.
- §3.6.10: player statements have no price effect. DEFAULT.
- §3.7.1: ROADMAP §2.8 made exact. About 35% of chapters contain a MAJOR crisis: exogenous rate 0.20 plus endogenous, against a total of 0.43. DEFAULT.
- §3.7.3: no MAJOR or STORM onset in a chapter's first 24 or final 48 real hours. DEFAULT.
- §3.7.3: Crisis Week is scheduled only by LiveOps. DEFAULT.
- §3.9.3: "Since you left" uses 15's 20-minute While You Were Away threshold.
- §3.10.3: 5 eras at thresholds [0, 8, 18, 30, 45], at most one per 2 chapters. DEFAULT.
- §3.10.4: player tokens (L10, "later") are gated on FINTECH ≥ 3, era ≥ 2 and a LiveOps flag. DEFAULT.
- §3.11.2: mosaic doctrine. Conclusions drawn from public facts are legal to trade on. DEFAULT.
- §3.11.4: extortion (silence for payment) cannot be expressed as an intent or as a contract clause.
- §3.11.5: no secrets are ever generated from a player's private state (L11).
- §3.12: briefs never recommend a trade direction. DEFAULT.
- §6.7: the new-player rival relies on 15's resolution of ROADMAP C1.
- §8.19: lobbying and contribution records survive anonymization under an anonymized label. DEFAULT.

## 3. Interfaces assumed

- **02**: RNG streams (`world.shock`, `world.actor`, `world.rumor`, `world.politics`, `world.dynasty`, `world.news`); day-close hook at t = 719.
- **03**:
  - ledger and boundary rule;
  - `hh` and `frm` entities;
  - MSI;
  - Stabilizer demand lever λ_d;
  - beneficial ownership;
  - no-negative-balance audit.
- **04**:
  - per bloc: g, π, u, i, i_n, sentiment, credit conditions, nominal GDP, fiscal transfers, inflation target, natural rate;
  - reads hawkishness `h`;
  - nominal-GDP closure (`ROW_NPC_INCOME`).
- **05**:
  - `explainMove(assetId, window)`;
  - belief model reads events and rumor impulses;
  - surveillance score;
  - ADV.
- **06**: `supplyShock`, compute price, collectibles.
- **07**:
  - deposit and credit-demand inputs;
  - `creditTightening`;
  - escrow `hold` / `release` for petitions;
  - bank charters and failures.
- **08**:
  - `catLoss`;
  - sovereign ratings;
  - NPC fund and insurer actions.
- **09**:
  - `demandPool(cityId, category, amount)` and `b2bPool(blocId, category, amount)`;
  - company registry, public above $50M real assets;
  - R&D pipelines;
  - takeover, venture and IPO intents;
  - wage costs.
- **10**:
  - city population and wage index;
  - `housingDemandIndex`;
  - `cityDamage`;
  - new-city events;
  - zoning and property tax.
- **11**: AI-race index 0–100; AI and COMPUTE lab spend.
- **12**:
  - espionage and bribery operations;
  - tip channels;
  - due-diligence dossier (E8);
  - CRIME_CREW targeting.
- **13**:
  - insider and mosaic rules, leads, whistleblower awards;
  - verdicts (never influenced by actors);
  - antitrust;
  - lever consumers AI_REGISTRATION_THRESHOLD and REGULATOR_BUDGET.
- **14**:
  - Reputation events (+2 tip report, +3 fact report);
  - club membership for whispers;
  - `reachWeight`;
  - TAX_INHERITANCE multiplier;
  - QUANT_RAISED discount.
- **15**:
  - filings;
  - Wire statements;
  - contract validation that refuses silence-for-payment clauses;
  - `linkedAccounts`;
  - chapter phases and themes;
  - While You Were Away.
- **17**: layouts.
- **20**: harness gates (rumor accuracy, crisis rate, secret path coverage).
- **21**: LiveOps flags and Crisis Week.

## 4. Content needed (22)

- Named actors:
  - 600 launch actors with names, traits and careers from archetype distributions;
  - 20 rumor sources;
  - per-sector analyst names.
- Dynasties: 12, with names, members, family trees, holdings and influence assets.
- Parties and politics:
  - 4 parties per bloc (20 total), with names and positions;
  - 12 caucus constituencies per bloc;
  - lever sector-impact table.
- News:
  - 15 outlets with names, audiences and slants;
  - about 400 news templates with tone variants (EN and FR);
  - NewsKind mapping table and base weights.
- Economy tables:
  - consumption shares by income level and era;
  - b2b shares;
  - R&D domain shares per bloc.
- Shocks:
  - about 120 shock defs (cyber shocks described as outcomes only);
  - category weights per tier.
- Consequence rules: 20, with magnitude tables.
- Technology and eras:
  - 40 named breakthroughs (5 per domain);
  - 5 era names and accent briefs.
- Secrets:
  - 40 authored secrets with paths and rewards;
  - 60 decorative secrets (easter eggs);
  - seeded archive documents.
- Chronicle and brief text templates.
