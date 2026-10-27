# 23 notes — Parameter Registry

Built by script from files 00–21 and _notes/02–21 (2026-10-19), regenerated after the 24 reconciliation. 23 introduces no new tunable of its own except the registry-assigned keys (†) and the default ranges (‡) below.

## 1. Parameters (counts)

| Measure | Count |
|---|---|
| Distinct `PARAM.` keys found in spec files 00–21 | 834 |
| Distinct keys found in notes Parameters tables | 1014 |
| Registry keys after merge and alias removal | 1019 |
| both spec and notes / spec only / notes only | 829 / 4 / 186 |
| Family keys | 24 |
| Keys assigned by 23 (†) | 43 |
| Ranges set by 23 (‡, 0.5×–2× default) | 137 |
| Live-tunable yes / no | 794 / 225 |
| no by reason L / E / V / C / G | 22 / 107 / 31 / 36 / 29 |

| Owner | Keys |
|---|---|
| 02 Time engine | 17 |
| 03 Ledger and accounting | 24 |
| 04 Macro, central banks, sovereigns | 57 |
| 05 Markets and price engine | 97 |
| 06 Asset classes | 45 |
| 07 Banking, credit, clearing | 46 |
| 08 Funds, structured, insurance | 103 |
| 09 Businesses and companies | 51 |
| 10 Real estate and cities | 69 |
| 11 AI Lab | 137 |
| 12 Conflict and intelligence | 15 |
| 13 Law, courts, regulators | 21 |
| 14 Progression and lifestyle | 42 |
| 15 Multiplayer and social | 22 |
| 16 Living world | 49 |
| 17 UX and screens | 37 |
| 18 Onboarding and Academy | 26 |
| 19 Tech architecture | 91 |
| 20 Verification and balance | 31 |
| 21 LiveOps, admin, monetization, compliance | 39 |

Registry-assigned keys (†): `ast_auc_supply`, `ast_cds_standard_coupons`, `ast_collectible_fees`, `ast_gusd_reserve_mix`, `ast_gxv_bounds`, `ast_option_models`, `ast_perp_funding`, `ast_price_params_<class>_*`, `bank_capital_requirement`, `bank_charter_capital`, `bank_confidence_update`, `bank_dgf_premium`, `bank_lending_standards`, `bank_liquidity_requirements`, `bank_loan_pricing`, `bank_pb_tiers`, `bank_seclending_fee_curve`, `ccp_clearing_debt_terms`, `ccp_default_fund_cover`, `ccp_liquidation_penalty`, `ccp_retail_im_rule`, `macro_auction_award_cap`, `macro_capital_controls_duration`, `macro_cb_holdings_cap_gdp`, `macro_cb_meeting_day_of_quarter`, `macro_fear_index_genesis`, `macro_fear_index_half_life`, `macro_npc_dealers_per_bloc`, `macro_sovereign_base_hazard`, `mkt_block_min_notional`, `mkt_fee_bond`, `mkt_fee_crypto`, `mkt_fee_eq`, `mkt_fee_fx`, `mkt_fee_volume_tiers`, `mkt_guard_gap`, `mkt_halt_mw_l1`, `mkt_halt_mw_l2`, `mkt_halt_mw_l3`, `mkt_news_print_share`, `mkt_open_print_share`, `mkt_value_print_share`, `stab_lever_ranges`.

## 2. Decisions

- Live-tunable rule of 23 §2.2 (codes L/E/V/C/G). DEFAULT (Mathis may override).
- Missing ranges set to 0.5×–2× default (23 §2.1). DEFAULT (Mathis may override).
- Each conflict of 23 §5 resolved by the owner-wins rule (00 §3.5); the adopted values are listed in section 3 below.
- Summary rows without keys in 04/05/06/07 notes were given keys (†) with the owner's prefix.

## 3. Conflict list

Status after the 24 reconciliation (24 §6, §7). Full table with per-row status in 23 §5.

- Same key, two defaults: stab_deadband, stab_ki, stab_lever_ranges — resolved (24 R04).
- Two keys for one quantity: 24 groups — 24 resolved (24 R29 and the §7 entries named in 23 §5.2), 0 open.
- Scope conflict bond_grace_days (sovereign grace 7 days, 04) — resolved (24 R29, §7 #23).
- Same key listed in two notes tables: 26 keys, listed once in 23 §4 under the owner; non-owner rows are citations (no action while values agree).
- Retired and removed from the registry: biz_ltv_cap (24 R11), fund_filing_aum (24 R20).

### Remaining open items
- None.

## 4. Interfaces assumed

- 19 loads one versioned parameter set and implements `PARAM_OUT_OF_RANGE` and `PARAM_NOT_LIVE` rejections in `sys.param_change` (19 Rule 3.16.2).
- 21 BALANCE patch rules (Rule 3.4.1, 3.4.3) use 23 ranges; 20 G0 greps for alias keys.
- 22 supplies member lists for family keys (`<city>`, `<use>`, `<id>`, `<class>`, `<product>`, `<service>`).

## 5. Content needed

- None beyond the family member lists already owed by 22.