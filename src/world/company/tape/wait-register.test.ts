/**
 * Tape rows that are not run as unit tests, recorded as skipped so the Vitest report names every row (tape-company-building
 * .md, re-targeted to Quant v1.7). Three groups, none of them a pass:
 *   WAIT: blocked by an instrument, a deferred feature, a pending Mathis decision or the not-yet-built pay-to-win audit.
 *   BLK: blocked by G22 (rho) or an open Ledger item (the rho legs are run by the balance script or engine-staging).
 *   NOT BUILT: runnable in principle (KEEP, RT, FLIP, NEW or ADD), with no unit test in this pass. Layer: B (balance
 *   harness, the script or a later pass), E (end-to-end, UI not in this worktree), L (static audit), U (unit, to write).
 */
import { describe, it } from 'vitest';

describe('Tape WAIT rows (not run in v1.7)', () => {
  it.skip('inst_stock_derivs [WAIT-INSTR: options, futures and perps on the stock, Quant 6.5]', () => {});
  it.skip('inst_sector_etf [WAIT: sector ETF instrument, Quant 6.5 item 3, not built]', () => {});
  it.skip('inst_sector_etf_derivs [WAIT: derivatives on the sector ETF, Quant 6.5]', () => {});
  it.skip('inst_index_weight_boundary [WAIT: index ETF 5% weight clause, Quant 6.5]', () => {});
  it.skip('inst_weight_frozen [WAIT: index weight snapshot at listing and F+21 close, Q23 decided, instrument not built]', () => {});
  it.skip('inst_broad_etf_free [WAIT: broad index below 5% is free, instrument not built]', () => {});
  it.skip('repay_derivative_delta [WAIT-INSTR: derivative delta in S_k, G16]', () => {});
  it.skip('lockup_hedge_accept (N14) [WAIT-INSTR: snapshot of covered instruments at listing, Q23 decided, instruments not built]', () => {});
  it.skip('ipo_short_open [WAIT-INSTR: shorting at listing+2 and +3, Quant 6.5]', () => {});
  it.skip('plan_split [WAIT: DEFERRED, splits are not in v1, X4]', () => {});
  it.skip('split_cosmetic_value / split_cosmetic_flow (X4) [WAIT: DEFERRED, no split action in v1]', () => {});
  it.skip('tender_price_floor [WAIT: DEFERRED takeovers, Quant 9.2; the T0 and 1.2x VWAP30 rule is decided by Ledger Q15]', () => {});
  it.skip('short_dump_buyout_ev (X8) [WAIT: DEFERRED shorts and takeovers, Quant 9.2]', () => {});
  it.skip('agm_sign_test (X13) [WAIT: DEFERRED, no AGM in v1]', () => {});
  it.skip('crime_pump_ev_ratio (X10) [WAIT: DEFERRED crime model, M30]', () => {});
  it.skip('rp_t1_roundtrip [WAIT: stage-0 T1 business is PENDING-MATHIS, Tape 467-468]', () => {});
  it.skip('t1_payback_20gd [WAIT: PENDING-MATHIS, stage-0 T1 payback]', () => {});
  it.skip('t1_63gd_band [WAIT: PENDING-MATHIS, stage-0 T1 $13k-$22k band]', () => {});
  it.skip('co_speed [TIMING: balance-script row, companyDay median under 50 us per company per gd]', () => {});
  it.skip('co_property_is_cost (X14) [N/A: no property income path in the company world]', () => {});
  it.skip('plan_sell_only [WAIT: the company plan API takes no side; sell-only holds by construction, UI copy is E-layer]', () => {});
  it.skip('plan_exact_fill (filing-day case) [WAIT-INSTR: needs the G19 filing-day fill order in the balance harness]', () => {});
  it.skip('ipo_primary_only [WAIT: the proceeds-to-treasury identity is in the money-flow invariants, not a unit row here]', () => {});
  it.skip('consensus_alpha1 [WAIT: needs the bias-corrected report chain; the consensus cases are in company.test.ts]', () => {});
  it.skip('consensus_converges_defn (D2) [WAIT: Ledger ruling on convergence under once-per-quarter noise]', () => {});
  it.skip('one_list_price (D3) [WAIT: Ledger or Quant ruling on the repricing cost in the -30% row]', () => {});
  it.skip('trade_count_guard (harness rule) [WAIT: applies to the balance rows, printed by the script once they run]', () => {});
});

describe('Tape BLK rows (G22 rho and open Ledger items)', () => {
  it.skip('rho_residual [BLK-G22: rho median 0.15 and p90 0.25 per seed; the passing reading (C1) is run in the balance script when the probe exists]', () => {});
  it.skip('rho_ev_robust [BLK-G22: needs the rho probe and the v1.7 noise]', () => {});
  it.skip('rho_by_spread [BLK-G22: rho by spread bucket; needs the rho probe]', () => {});
  it.skip('alt_prefiling_edge [BLK-G22 and G21: the post-print leg is zero under full print; baseline to be redefined]', () => {});
  it.skip('signal_joint_v15 [BLK: rho leg FAILs (quant:26), so the joint pass cannot count]', () => {});
  it.skip('rho_engine [BLK-G22: scripts/quant-probe/rho-engine.ts is not in this repo; 200 seeds x 6 sectors x 7 filings]', () => {});
  it.skip('company_print_full_npc_untouched (binding) [EN: engine-staging gate, fingerprint c5dd6665...dfab35c; not in this worktree]', () => {});
});

describe('Tape NOT BUILT rows (runnable in principle, no unit test in this pass)', () => {
  // Section 0 and 1 (exploit map)
  it.skip('X1 co_self_impact_clip_ratio, co_pump_dump_ev, self_mark_peak_pump, ladder_roundtrip_ev [B; stock baseline selfimpact.test.ts]', () => {});
  it.skip('X2 co_value_gap_p95, value_gap_halflife, loss_company_rally_share, filing_lnv_corr, earnings_surprise_ic [B]', () => {});
  it.skip('X5 dividend_rule_reject, dividend_distress_flag, dividend_pump_ev, dividend_pump, plan_dividend_free_cash [U and B]', () => {});
  it.skip('X6 founder_pump_ev, own_stock_up_share, founder_beats_bh_share, own_stock_rank_pump [B]', () => {});
  it.skip('X7 ceo_exit_freeze, resign_pump_ev, ceo_change_filing [U and B; Q14 decided]', () => {});
  it.skip('X9 founding_dominance, founder_yield_by_size, whale_return_decay, short_interest_cap, antitrust_trigger [B]', () => {});
  it.skip('X11 ownership_conservation [UP: 10k random sequences of IPO, rounds, buybacks, plans, lockup, CEO change, default]', () => {});
  it.skip('X12 investor_no_free_cash [U and E: round at 0.70 x V_engine and IPO at 0.9 x V_engine, checked separately]', () => {});
  it.skip('X15 project_ev_band, project_band_shown [B and E; rd.ts draws fixed at project start]', () => {});
  it.skip('N1 rp_consolidation_eliminates, rp_costs_count, rp_any_player_other_income, rp_ipo_excluded, related_party_revenue_in_Rev_u [U and B]', () => {});
  it.skip('N3 self_match_fills, buyback_no_owner_cross [U: owner set never matches itself]', () => {});
  it.skip('N4 alt_lifted_peak [B online; stock template altpeak.test.ts]', () => {});
  it.skip('N5 bankruptcy_extract_ev, clawback_boundary, clawback_safe_harbour_64, clawback_insider_either, clawback_first_recipient [U and B]', () => {});
  it.skip('N6 guidance_inflate_ev, credibility_math [U and B; C EWMA half-life 4 q]', () => {});
  it.skip('N7 revenue_without_cash_lnv_effect [U: E* = min(NI_adj, OCF - capex) unchanged]', () => {});
  it.skip('N9 self_round_attempts_accepted [U: no round from an owner-set account]', () => {});
  it.skip('N11 rd_reroll [U: reload with identical inputs gives an identical outcome]', () => {});
  it.skip('N12 buyback_shared_tally, buyback_cash_source, buyback_guards [U]', () => {});
  it.skip('N13 predatory_price_ev, npc_reentry_rate [U and B]', () => {});
  it.skip('N15 window_two_way_edge, plan_fake_timed, plan_offset_in_window, plan_alt_offset [B]', () => {});
  it.skip('N16 stacking_rule [U: no placement or fill flips sign or exceeds a limit]', () => {});
  it.skip('N17 signal_fake_ev, signal_forward_cap, close_signal_uncapped, signal_path_independence, cap_carry_edge [U and B]', () => {});
  // Section 2
  it.skip('signal_noise [U: 10k quarter draws per stream, KS p > 0.01, stream independence]', () => {});
  it.skip('signal_to_lnv [U: dLnV = ln(V_cons,new / V_cons,old), error below 1e-12; player stocks print share 1]', () => {});
  it.skip('signal_forward_cap, signal_cap_scope [U with an injected unbacked term; G18 leaves the cap dormant]', () => {});
  it.skip('consensus_converges [B: defined by D2 first]', () => {});
  it.skip('signal_reanchor, reanchor_public_edge [U and B; G19 filing-tick order]', () => {});
  it.skip('forward_cap_honest_bind [B: binds on 0% under v1.7, redefine first]', () => {});
  it.skip('signal_postprint_drift [B and EN: engine-staging, binding gate first]', () => {});
  it.skip('signal_weights, backlog_filed_field, backlog_margin_only [U]', () => {});
  it.skip('npc_cancel_deterministic, reanchor_reversal_excess_only, npc_allowance_actual [U; G17 allowance on actual cancellations]', () => {});
  it.skip('fake_lift_repay, backlog_repay_shares_counted [U; S_k with G19 and G16 inclusion]', () => {});
  it.skip('honest_cancel_no_charge, signal_fake_ev, backlog_repay_outside_covered [B; utilization sweep and the p* table]', () => {});
  it.skip('insider_surveillance_odds, surprise_formula [U and B]', () => {});
  // Section 3 (window)
  it.skip('window_late_gap, closed_window_fills, window_close_cancel, window_close_line_private [U and B]', () => {});
  it.skip('window_closing_day, window_closing_every_window, window_closing_outcome_blind, window_closed_event [U and B]', () => {});
  it.skip('window_two_way_edge [B: G19 plan fills at F count in S_k]', () => {});
  it.skip('window_save_edit, stacking_rule [U]', () => {});
  it.skip('window_ticket_locked, window_card_text, window_closing_banner, plan_reject_copy, plan_form_min_price, plan_skip_copy, plan_commit_hold, plan_pills_locked, broker_sellable_vs_locked, insider_filing_line, plan_breach_card, plan_screens_by_tier, clawback_warning_ui, pg_consequence_confirm, dom_no_private_fields, company_links_no_state, company_route_locked, company_title_clean, co_copy_simulated, wtms_equals_public [E]', () => {});
  // Section 4 (plans and buybacks)
  it.skip('plan_floor_cap, plan_price_skip_hold, plan_unfunded_shares [U]', () => {});
  it.skip('plan_no_cash_escrow, plan_locked_shares, plan_margin_untouchable, escrow_counts_networth [U]', () => {});
  it.skip('plan_skip_volume, plan_skip_price, plan_skip_cap, plan_skip_halt, plan_skip_reasons_closed [U and B]', () => {});
  it.skip('plan_end_terminated, plan_legal_schedule, claim_covered_creditor, plan_end_tender, plan_tier_drop, plan_tier_change [U]', () => {});
  it.skip('plan_no_breach_path, breach_bars_plans, breach_ban_timing [U and B; static: no production path emits planBreach]', () => {});
  it.skip('plan_public_disclosure, insider_filing_next_day, plan_size_inference [U, E and B]', () => {});
  it.skip('plan_min_price_option, plan_edge, plan_legal_escape [B; predicted, rerun on v1.7]', () => {});
  it.skip('buyback_no_owner_cross, buyback_shared_tally, buyback_cash_source, buyback_guards [U]', () => {});
  // Section 5 (related party and cash)
  it.skip('rp_consolidation_eliminates, rp_costs_count, rp_any_player_other_income, rp_ipo_excluded [U]', () => {});
  it.skip('revenue_without_cash_lnv_effect [U: receivables and channel stuffing leave E* and lnV unchanged]', () => {});
  // Section 6 (bankruptcy, clawback, dividends, guarantees)
  it.skip('clawback_any_player, clawback_insider_loans, clawback_non_ordinary, clawback_covered_types, clawback_not_covered, clawback_order_and_cap [U]', () => {});
  it.skip('limited_liability, personal_debt_survives, pg_rate_exact, pg_called [U]', () => {});
  it.skip('dividend_rule_reject, dividend_distress_flag [U]', () => {});
  it.skip('bankruptcy_extract_ev, bust_after_company_default [B]', () => {});
  it.skip('restricted_cash_company_accept [U and E]', () => {});
  // Section 7 (IPO and filing tiers)
  it.skip('filing_tiers, ipo_requires_3_filings, ipo_eligibility (cure pairs), ipo_price_formula [U]', () => {});
  it.skip('ipo_lockup (168 gd), post_lockup_sell_path, ipo_rank_mark [U and B]', () => {});
  it.skip('ipo_pop_to_allocatees, ipo_pop_farm_ev [B]', () => {});
  // Section 8 (no-reveal and lint)
  it.skip('lint_rule_canary [L: canary import in src/app/broker fails lint]', () => {});
  it.skip('quality_score_display_only, explain_move_player_listing, public_cash_debt_label [U]', () => {});
  it.skip('company_links_no_state [E]', () => {});
  // Section 9 (pay-to-win): audits, not runnable as unit rows yet
  it.skip('p2w_catalog_cosmetic, p2w_no_random_paid [L: catalogue audit of every real-money SKU]', () => {});
  it.skip('p2w_twin_identical, ads_no_demand_effect [U: twin with cosmetics or ad cash owned; state hash identical]', () => {});
  // Section 10 (balance, all B: scripts/balance/company-tape.ts or the balance harness)
  it.skip('founding_dominance, y_tier_calibration, payback_by_tier, founder_plus_trade_vs_trade [B]', () => {});
  it.skip('listed_vol_ratio, co_learnability, co_value_gap_halflife, co_earnings_surprise_ic [B]', () => {});
  it.skip('overflow_not_booked, hiring_full_print, revenue_noise_quarterly, filing_tick_order [U and B; the G15, G18, G19 and G20 rows of Quant v1.7]', () => {});
});
