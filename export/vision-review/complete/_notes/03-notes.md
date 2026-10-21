# 03-notes: Ledger and Accounting

## 1. Parameters
| key | default | range | unit | affects |
|---|---|---|---|---|
| PARAM.stab_engaged_min_active_days | 7 | 3–30 | game days in last 168 | who counts as engaged in the Stabilizer sample (§3.7.2) |
| PARAM.stab_target_growth_after_year | 0.001 | 0–0.005 | per real day | growth of W_target after the last curve point (§3.7.2) |
| PARAM.stab_min_sample | 200 | 50–2,000 | characters | below this the Stabilizer is in OBSERVE (§3.7.2) |
| PARAM.stab_deadband | 0.05 | 0–0.2 | log-ratio | error deadband (§3.7.3) |
| PARAM.stab_integral_max | 10 | 2–50 | integral units | anti-windup clamp (§3.7.3) |
| PARAM.stab_kp | 0.5 | 0.1–2.0 | gain | proportional gain (§3.7.3) |
| PARAM.stab_ki | 0.02 | 0–0.1 | gain per game day | integral gain (§3.7.3) |
| PARAM.stab_observe_game_days | 168 | 0–672 | game days | OBSERVE period after launch (§3.7.5) |
| PARAM.levy_free_daily_notional | $10,000,000 | $1M–$100M | Money per game day | exemption from lever L3 transaction levy (§3.7.4) |
| PARAM.msi_money_share | 0.20 | 0.05–0.5 | fraction | κ in designed money for MSI (§3.8) |
| PARAM.mark_min_volume_frac | 0.002 | 0–0.05 | × ADV20 | thin-print guard on marks (§3.9.1) |
| PARAM.pe_mark_decay_per_quarter | 0.05 | 0–0.2 | fraction per game quarter | PE/VC stake marks without a new round (§3.9.2) |
| PARAM.model_useful_life_game_days | 364 | 91–1,344 | game days | AI model amortization (§3.9.2) |
| PARAM.prop_appraisal_cadence_game_days | 7 | 1–28 | game days | property re-appraisal (§3.9.2) |
| PARAM.nw_impact_y | 0.5 | 0.1–1.5 | coefficient | liquidity haircut on board NW, capped at 50% (§3.10.3) |
| PARAM.nw_control_listed_cap | 2.0 | 1.0–5.0 | × look-through NAV | cap on board value of a controlled listed company (§3.10.3) |
| PARAM.control_defacto_min | 0.30 | 0.2–0.5 | vote share | de facto control test (§3.11.2) |
| PARAM.lookthrough_iterations | 64 | 16–256 | sweeps | Gauss–Seidel look-through NAV (§3.11.4) |
| PARAM.cycle_max_product | 0.95 | 0.5–0.99 | product of shares | REJECT_CIRCULAR_OWNERSHIP (§3.11.4) |
| PARAM.related_party_band | 0.10 | 0.02–0.25 | ± fraction of fair value | related-party price validity (§3.11.6) |
| PARAM.wash_sale_window_game_days | 5 | 0–30 | game days | wash-sale loss disallowance (§3.12.6) |
| PARAM.serena_substance_opex | $2,000,000 | $0–$50M | Money per tax year | Serena active-income substance test (§3.12.11) |
| PARAM.comeback_garnish_rate | 0.25 | 0.05–0.75 | fraction of inflows | collection of persistent claims after bankruptcy (§3.14) |

Lever tables (§3.7.4, values are state, gains and ranges are parameters): L1 NPC demand 1.00, target 1−0.10u, range 0.90–1.10, step 0.005/day; L2 lifestyle/NPC-service index 1.00, target 1+0.25u, range 0.90–1.25, step 0.005; L3 levy 0.5 bp, target 0.5+1.5u bp, range 0–3.0 bp, step 0.1 bp; L4 upkeep 1.00, target 1+0.15u, range 0.95–1.15, step 0.003. Faucet/sink target shares F1–F6 and S1–S10 and the headline ratio ρ 0.80–0.95 are in §3.6 (20 may retune within the ranges). W_target curve (FDL) in §3.7.2.

## 2. Decisions (all DEFAULT, Mathis may override, unless noted)
- §2.1/§3.3: per-entity balanced entries built only from templates (PAY, SWAP_ASSET, MINT, BURN, ELASTIC_IN/OUT, LEND, REPAY, CB_CREDIT, ACCRUE, FX, MOVE_QTY, RECLASS).
- §3.2: complete chart of accounts (1001 settlement cash is a central-bank liability; 1009 virtual money of elastic sectors; 2990 persistent claims; 3400 revaluation surplus).
- §3.4: 379 reason codes: 37 FAUCET, 85 SINK, 205 TRANSFER, 12 CREDIT_CREATE, 13 CREDIT_DESTROY, 27 REVALUE.
- §3.4.4/§3.5: central-bank credit raises M0_cb (base money) while commercial bank credit leaves M0 unchanged. This clarifies 00 §5.4's CREDIT parenthetical without contradicting it.
- §3.5.2: elastic sectors hh/frm/row per bloc. Payments from them are FAUCET, payments to them are SINK; payments between named entities are TRANSFER. Resolves old X5.
- §3.5.6: restricted cash window 72 real hours (51,840 ticks). Resolves roadmap conflict C5 / X11.
- §3.6: faucet/sink target shares and ρ band.
- §3.7: the Stabilizer is a PI controller on the log of the median wealth ratio of engaged characters vs W_target(age). It has 4 faucet/sink levers only; tax brackets and equity drift are removed as levers (00 §5.4). Resolves old X6 and X7.
- §3.7/X19: the Stabilizer Board (game money) is separate from the 5 bloc central banks (monetary policy, 04/07).
- §3.8: MSI money-based; NWI = NWrank / MSI. Resolves old X8.
- §2.5: FIFO tax lots by default; specific identification for LIC2+.
- §3.9: marking table for every asset type; homes at the same appraisal model as rented property (resolves X22); all characters' property revaluation through P&L.
- §3.10: board NW uses liquidity haircuts and a control cap.
- §3.11: control = majority, or de facto (≥30% and 2× the next holder, plus board control); look-through NAV; NCI; elimination; ownership-cycle limit; related-party band ±10% with minority claims. Resolves Bible I06/I07/R02 (X20).
- §3.12: tax system. Rates per bloc: FDL personal 0/12/20/28/35, CGT 20 short / 10 long, corp 21; EUN top 45, corp 27; PYN 30, corp 20; NKR 45, corp 24; SRL 25, corp 30. Isla Serena: 0% corporate, franchise fee max($250k, 0.1% of assets), no personal residency, collected by the FDL treasury. P2P transfer tax 2%. Treaties 10/0/5, except SRL–NKR 25/15/15 and payments to Serena 30%. Also: residency change at most once per 91 game days with exit tax; main-home exemption $10M; accounting-firm credit; no VAT on B2B/B2G/exports; CFC attribution; transfer pricing; audits.
- §3.12.2: Isla Serena is both fixed islands and a free zone. Resolves old X21 (with 10).
- §3.13: statements for every entity, with cadence and visibility.
- §3.14: bankruptcy waterfall; persistent claims (clearing-house deficits, restitution, fines, taxes) survive discharge and are garnished at 25%; LIC3/LIC4 suspended for 28 game days (13 may override); fresh start once per chapter (resolves X10).
- §3.4.3 PB_MARGIN_LOAN: only banks lend on margin.
- §3.3.4: the intraday credit limit at the central bank defaults to 100% of pledged eligible collateral (07 sets it).
- §3.4: BIZ_UPGRADE_CAPEX is capitalized, then 30% is impaired.

## 3. Interfaces assumed
- 00 §5.3/§5.4: EntityKind list; Posting/Entry/ReasonCode shapes (extended here with allowed detail fields).
- 02: P13 ledger phase and commit; holds and cross-partition legs (02 §3.14); `toMoney`, `allocate`; day/quarter/year boundary hooks.
- 04: fiscal policy may move tax rates within ranges (23); central-bank policy rates; FX fixings per tick.
- 05: mark price per tick, ADV20, σ_daily, square-root impact law; listing data.
- 06: instrument definitions (bonds, options, collectibles auctions) and their reason codes.
- 07: bank reserves (1002), intraday credit limit, CCP default fund, repo, margin, deposit and loan interest postings.
- 08: fund NAV, subscriptions/redemptions, insurance premiums and claims, first-loss stake.
- 09: company governance (board control), company valuation, business revenue, costs and upgrades, demand pools that read lever L1, acquisition hook for the cycle check.
- 10: property appraisal `NOI / cap rate` with district index, rents, development, Isla Serena islands.
- 11: AI model capability vs frontier band and impairment %; compute and data purchases.
- 12/13: fines, restitution, disgorgement, licences (LIC1–LIC4), audits, Held state, S1–S5 offence tiers.
- 14: character age (for W_target), lifestyle catalog prices (read lever L2), reputation, Legacy record, comeback perk.
- 15: boards and rankings consuming NWrank and NWI; contracts registration fees.
- 16: Terminal/data subscriptions (lever L2).
- 20: balance harness asserting §3.6 bands; invariant checks.
- 21: compensation (`ADM_COMPENSATION`), alerts, money report.

## 4. Content needed (22)
- Chart-of-accounts names exactly as listed in 03 §3.2 (for the UI glossary).
- All 379 reason-code display names and one-line descriptions (from 03 §3.4).
- Tax authority names per bloc (5 treasuries) plus the Isla Serena free-zone authority.
- Central bank names per bloc (5) and the Stabilizer Board's diegetic name.
- Currency names and codes for the 5 blocs (if not already in 00/04).
- Statement line labels and KPI names (03 §3.13.2, §3.13.5).
- Names of the public integrity report and the "Luxury CPI" index shown to players (03 §3.7.7, §3.7.4).
