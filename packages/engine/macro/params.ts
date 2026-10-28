// T04-21 step 8: the parameter keys module 04 reads. The card's 50 entries (union of T04-01..T04-20 params: 44 exact keys and 6
// families), then the keys later errata added that the code reads (newest erratum first): E-104 (6), E-93 (6), E-51 (d), and 23's
// 16 §3.7 crisis-scheduler pair (T04-17 reads them).
export const MACRO_PARAM_KEYS: readonly string[] = Object.freeze([
  'macro_ai_productivity_max', 'macro_auction_noncomp_max_face', 'macro_auction_tick', 'macro_cac_threshold', 'macro_cb_decision_tick',
  'macro_cb_emergency_step', 'macro_cb_haircut_*', 'macro_cb_max_emergency_per_quarter', 'macro_cb_max_step', 'macro_cb_max_step_wide',
  'macro_cb_meetings_per_year', 'macro_cb_phi_fs', 'macro_cb_smoothing', 'macro_corridor_halfwidth', 'macro_cred_guidance_break',
  'macro_cycle_label_lag_days', 'macro_fx_uip_share', 'macro_gap_halflife_years', 'macro_gap_vol', 'macro_governor_term_days', 'macro_irp',
  'macro_issue_mix_*', 'macro_major_base_rate', 'macro_major_min_gap_days', 'macro_ns_lambda', 'macro_phillips_slope', 'macro_policy_lag_days',
  'macro_regime_mean_days_con', 'macro_regime_mean_days_exp', 'macro_regime_mean_days_ovh', 'macro_regime_mean_days_rec',
  'macro_regime_min_days_con', 'macro_regime_min_days_exp', 'macro_regime_min_days_ovh', 'macro_regime_min_days_rec', 'macro_rev_base_*',
  'macro_ripple_rate', 'macro_rr_*', 'macro_scale_max', 'macro_scale_min', 'macro_scale_ref_players', 'macro_sov_grace_days', 'macro_sov_lgd',
  'macro_sovereign_base_hazard', 'macro_storm_rate', 'macro_world_gdp_ref', 'macro_x_*', 'macro_xreg_*', 'macro_ycc_bloc', 'npc_to_player_wealth_band',
  // errata
  'macro_fx_capital_flow_kappa', 'mac_gov_cash0_gdp_*', 'mac_cbk_reserve_cover0_*', 'mac_gov_fdlcash0_gdp_SRL', 'macro_auction_announce_tick',
  'major_precursor_min_game_days', 'major_suppression_game_days',
]);
