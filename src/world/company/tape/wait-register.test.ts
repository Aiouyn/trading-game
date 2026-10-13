/**
 * Tape rows that are NOT run as Vitest unit tests in this build, recorded as skipped so the report names every row that is
 * not a pass (tape-company-building.md, re-targeted to Quant v1.7). Each skip carries one status tag:
 *   WAIT-INSTR      needs the Quant 6.5 instruments (options, futures, perps, sector ETF, index ETF), not built.
 *   WAIT-DEFERRED   a feature Tape and Quant defer past v1: splits, AGM, takeover tender, short sales, crime model (M30).
 *   WAIT-PENDING    waits on a Mathis decision (stage-0 T1 business).
 *   BLK-G22         rho. The residual surprise s (Quant 6.2) is defined in valuation.ts but has no caller, so the engine
 *                   never computes it, and the rho probe (scripts/quant-probe/rho-engine.ts) is not in this repo. Not run.
 *   BLK-LEDGER      an open Ledger ruling (D2 convergence, D3 repricing cost, D7 tippee residual).
 *   ABSENT          the feature the row tests is not in this build (the code path does not exist). A row cannot pass on
 *                   a feature that is missing; the gap is the finding.
 *   E-UI            needs a Playwright run on the Company, Broker or Exchange screens. No spec is written in this pass.
 *   EN              the engine-staging gate (fingerprint c5dd6665...dfab35c, prototype knob ecology.fullPrintAssets). The
 *                   engine-staging tree is not in this worktree.
 *   B-HARNESS       a bot or sweep row (many seeds, bot P&L bands). Not in scripts/balance/company-tape.ts; not run.
 *   U-TODO          a unit row that has code to test but no test written in this pass.
 *   L-TODO          a static or audit row not written in this pass.
 *   N/A             not applicable to this build (the row is about a surface that does not exist).
 */
import { describe, it } from 'vitest';

describe('Tape WAIT rows (instruments, deferred features, Mathis decisions)', () => {
  it.skip('[WAIT-INSTR] inst_stock_derivs, inst_sector_etf, inst_sector_etf_derivs, inst_index_weight_boundary, inst_weight_frozen, inst_broad_etf_free: Quant 6.5 instruments are not built', () => {});
  it.skip('[WAIT-INSTR] repay_derivative_delta (NEW): derivative delta in S_k (G16) needs the 6.5 derivatives', () => {});
  it.skip('[WAIT-INSTR] lockup_hedge_accept (N14): snapshot of covered instruments at listing (Q23) needs the instruments', () => {});
  it.skip('[WAIT-INSTR] ipo_short_open: shorting at listing+2 and +3 needs the 6.5 short side', () => {});
  it.skip('[WAIT-INSTR] plan_exact_fill (filing-day case): needs the G19 filing-day fill order in a harness; the unit form of the order is filing_tick_order (B-HARNESS)', () => {});
  it.skip('[WAIT-DEFERRED] plan_split, split_cosmetic_value, split_cosmetic_flow (X4): no split action in v1', () => {});
  it.skip('[WAIT-DEFERRED] tender_price_floor (X8, Q15 decided): takeover tender is deferred (Quant 9.2)', () => {});
  it.skip('[WAIT-DEFERRED] short_dump_buyout_ev (X8): short-and-tender is deferred with shorts and takeovers', () => {});
  it.skip('[WAIT-DEFERRED] agm_sign_test (X13): no AGM in v1', () => {});
  it.skip('[WAIT-DEFERRED] crime_pump_ev_ratio (X10, M30): crime model is deferred', () => {});
  it.skip('[WAIT-PENDING] rp_t1_roundtrip, t1_payback_20gd, t1_63gd_band: stage-0 T1 business is PENDING-MATHIS (tape 467-468)', () => {});
});

describe('Tape BLK rows (rho, and open Ledger rulings)', () => {
  it.skip('[BLK-G22, O-2 partly run in 9C] rho_ev_robust, rho_by_spread: need the fx_close_payout twin and the spread-bucket fixtures (not built). rho_residual is a running expected failure in src/world/company/rho.test.ts (measured FAIL, docs/V1-PHASE9.md 9C.2). rho_engine is the six-sector sweep, not run (scripts/balance/rho-probe.ts covers one sector)', () => {});
  it.skip('[BLK-G22] alt_prefiling_edge: needs rho (above) and the G21 baseline definition', () => {});
  it.skip('[BLK-G22] signal_joint_v15: needs rho (above); the joint pass cannot count without it', () => {});
  it.skip('[BLK-LEDGER] consensus_converges, consensus_converges_defn (D2): convergence under once-per-quarter noise is not defined', () => {});
  it.skip('[BLK-LEDGER] one_list_price (D3): the repricing cost in the -30% row is not ruled', () => {});
  it.skip('[BLK-LEDGER] backlog_repay_outside_covered (D7): residual tippee profit needs a Ledger ruling; the row is EXPECT-FAIL as written', () => {});
  it.skip('[EN] company_print_full_npc_untouched (G21, binding gate): engine-staging, fingerprint c5dd6665...dfab35c, five gates', () => {});
  it.skip('[EN] co_config_absent_fingerprint, co_no_company_byte_identity: the fingerprint is pinned in engine-staging, not here', () => {});
  it.skip('[EN] signal_postprint_drift (B+EN): the prototype ecology.fullPrintAssets is evidence only (Quant 39)', () => {});
});

describe('Tape ABSENT rows (the feature is not in this build)', () => {
  it.skip('[ABSENT] credibility_math, guidance_inflate_ev (N6): guidance credibility is fixed at cInit; there is no EWMA', () => {});
  it.skip('[ABSENT] rp_any_player_other_income (Q11): there is no other-income path for a related contract', () => {});
  it.skip('[ABSENT] rp_consolidation_eliminates (50.00 vs 50.01%): there is no consolidation of owned companies', () => {});
  it.skip('[ABSENT] self_match_fills, buyback_no_owner_cross (N3): fills are against NPC liquidity; there is no order-to-order cross and no {code: self_match} refusal', () => {});
  it.skip('[ABSENT] signal_forward_cap, signal_cap_scope, close_signal_uncapped, forward_cap_honest_bind, cap_carry_edge (carry leg): the weekly cap and carry are dormant under G18 and no code path reads them', () => {});
  it.skip('[ABSENT] restricted_cash_company_accept: there is no AD_GRANT or FRESH_START cash type in this build', () => {});
  it.skip('[ABSENT] lint_rule_canary: the eslint config has no import rule for the broker; the boundary is the Vitest source scan in s8', () => {});
  it.skip('[ABSENT] p2w_catalog_cosmetic, p2w_no_random_paid, p2w_twin_identical, ads_no_demand_effect: no company SKU, cosmetic or ad cash exists in the company world; the shop audit is outside Tape company scope', () => {});
});

describe('Tape E-UI rows (Playwright on the Company, Broker and Exchange screens; no spec written in this pass)', () => {
  it.skip('[E-UI] window_ticket_locked, window_card_text, window_closing_banner, window_closed_event (toast), window_close_line_private (UI part), window_save_edit (UI part), closed_window_bypass (every entry point: Broker, click, launcher, __tg hooks, AI Lab)', () => {});
  it.skip('[E-UI] plan_reject_copy, plan_form_min_price (blocked by Velvet V1), plan_skip_copy (blocked by Velvet V2), plan_commit_hold, plan_pills_locked, broker_sellable_vs_locked, plan_public_wire_line, plan_public_disclosure (UI part), insider_filing_line, plan_breach_card, plan_screens_by_tier, insider_filing_next_day (UI part)', () => {});
  it.skip('[E-UI] clawback_warning_ui, pg_consequence_confirm (UI part), restricted_cash (UI part)', () => {});
  it.skip('[E-UI] dom_no_private_fields, wtms_equals_public, company_links_no_state, company_route_locked, company_title_clean, co_copy_simulated, private_registry_only (UI part), explain_move_player_listing (UI part)', () => {});
  it.skip('[E-UI] public_cash_debt_label (UI part), window_scope_by_tier (UI part), private_registry_only (UI part)', () => {});
});

describe('Tape B-HARNESS rows (bot sweeps and balance bands, not in scripts/balance/company-tape.ts)', () => {
  it.skip('[B-HARNESS] co_speed (timing: companyDay median under 50 us per company per game day)', () => {});
  it.skip('[B-HARNESS] X1 co_self_impact_clip_ratio, co_pump_dump_ev, self_mark_peak_pump, ladder_roundtrip_ev (stock baseline selfimpact.test.ts, 3 seeds)', () => {});
  it.skip('[B-HARNESS] X2 co_value_gap_p95, value_gap_halflife, loss_company_rally_share, filing_lnv_corr, earnings_surprise_ic', () => {});
  it.skip('[B-HARNESS] X5 dividend_pump_ev, dividend_pump; X6 founder_pump_ev, own_stock_up_share, founder_beats_bh_share, own_stock_rank_pump', () => {});
  it.skip('[B-HARNESS] X7 resign_pump_ev; X9 founding_dominance, founder_yield_by_size, whale_return_decay, short_interest_cap; N13 predatory_price_ev, npc_reentry_rate', () => {});
  it.skip('[B-HARNESS] N4 alt_lifted_peak (stock template altpeak.test.ts), N5 bankruptcy_extract_ev, bust_after_company_default (fresh-start farm EV), N8 ipo_pop_to_allocatees, ipo_pop_farm_ev', () => {});
  it.skip('[B-HARNESS] N15 window_two_way_edge, plan_fake_timed, plan_offset_in_window, plan_alt_offset; plan_edge, plan_min_price_option, plan_size_inference, plan_skip_reasons_closed, plan_no_breach_path', () => {});
  it.skip('[B-HARNESS] N17 signal_fake_ev, cap_carry_edge (three bots), reanchor_public_edge, signal_noise_reversion, overflow_not_booked, hiring_full_print, revenue_noise_quarterly, honest_cancel_no_charge, backlog_repay_outside_covered', () => {});
  it.skip('[B-HARNESS] consensus_converges (defined by D2 first), window_late_gap, post_lockup_sell_path (B part), listed_vol_ratio, co_learnability, co_value_gap_halflife, co_earnings_surprise_ic', () => {});
  it.skip('[B-HARNESS] founding_dominance, y_tier_calibration, payback_by_tier, founder_plus_trade_vs_trade (section 10 balance: rerun on v1.7)', () => {});
  it.skip('[B-HARNESS] filing_tick_order (B part), related_party_revenue_in_Rev_u (every bal run), backstop_open_window_split (B part), insider_surveillance_odds (B part)', () => {});
  it.skip('[B-HARNESS] trade_count_guard (harness rule: every bot report prints its trade count; no bot is run here)', () => {});
});

describe('Tape U-TODO and L-TODO rows (code exists; no test written in this pass)', () => {
  it.skip('[U-TODO] signal_to_lnv, signal_weights, backlog_filed_field, signal_reanchor (G21 full print on re-anchor), signal_path_independence, backlog_margin_only', () => {});
  it.skip('[U-TODO] fake_lift_repay, backlog_repay_shares_counted, insider_surveillance_odds, closed_window_fills', () => {});
  it.skip('[U-TODO] ceo_change_filing, ceo_exit_freeze (Q14 decided), resign_pump_ev (B part)', () => {});
  it.skip('[U-TODO] plan_margin_untouchable, escrow_counts_networth, plan_skip_volume, plan_skip_cap, plan_legal_schedule, claim_covered_creditor, plan_tier_drop, plan_tier_change', () => {});
  it.skip('[U-TODO] plan_dividend_free_cash, breach_bars_plans, breach_ban_timing, insider_filing_next_day, buyback_cash_source, buyback_guards, buyback_no_owner_cross (N12 part)', () => {});
  it.skip('[U-TODO] tippee_forfeit_clawback (N5, G16), backstop_open_window_split (unit part)', () => {});
  it.skip('[U-TODO] revenue_without_cash_lnv_effect (N7), rp_costs_count, ipo_primary_only, post_lockup_sell_path (U part), ipo_rank_mark, ipo_pop (U part)', () => {});
  it.skip('[U-TODO] explain_move_player_listing (engine explainMove, pool types only), project_ev_band, project_band_shown (X15), filing_tick_order (unit part)', () => {});
  it.skip('[U-TODO] ownership_conservation (X11, UP: 10k random sequences of IPO, rounds, buybacks, plans, lockup, CEO change, default)', () => {});
  it.skip('[L-TODO] co_copy_simulated (copy audit), p2w_catalog_cosmetic (catalogue audit), p2w_no_random_paid (screen audit)', () => {});
  it.skip('[N/A] co_property_is_cost (X14): the company world has no property income path', () => {});
  it.skip('[N/A] consensus_alpha1 (s2): the consensus cases are in src/world/company/company.test.ts, not repeated here', () => {});
});
