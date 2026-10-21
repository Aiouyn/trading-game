# 05 notes: Markets and the Price Engine

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| mkt_active_ticks_session | 187,200 | fixed | ticks per year | value-layer clock for session classes (§3.2.3) |
| mkt_active_ticks_crypto | 262,080 | fixed | ticks per year | crypto clock |
| mkt_lnv_vol_scale | 1.15 | 1.0–1.4 | multiplier | value vol vs target price vol (§3.3.1) |
| mkt_garch_alpha / beta | 0.08 / 0.90 | 0.03–0.15 / 0.80–0.95 | | volatility clustering (§3.3.2) |
| mkt_garch_h_min / max | 0.25 / 9 | | multiplier | GARCH clamp |
| mkt_crisis_corr_storm / major | 0.3 / 0.5 | 0.1–0.7 | share | crisis correlation (§3.3.3) |
| mkt_regime_vol_{exp,ovh,con,rec} | 0.90 / 1.05 / 1.45 / 1.15 | ±30% | multiplier | regime volatility (§3.3.5) |
| mkt_regime_jump_{…} | 0.8 / 1.0 / 1.6 / 1.2 | ±50% | multiplier | jump intensity |
| mkt_regime_skew_{…} | −0.05 / +0.05 / +0.15 / 0 | ±0.1 | probability | jump down-share |
| mkt_regime_corr_{…} | 0 / 0 / 0.15 / 0.05 | 0–0.3 | share | correlation add |
| mkt_regime_depth_{…} | 1.10 / 1.00 / 0.80 / 0.90 | 0.6–1.2 | multiplier | maker depth |
| mkt_fx_anchor_hl_days | 20 | 5–60 | game days | FX pull to 04 fair value |
| valuePrint / newsPrint / openPrint | 0.10 / 0.50 / 0.50 (equities; class table §3.3.6) | 0–1 | share | how fast value prints (§3.4.7) |
| guardGap | 0.25 equities, null crypto | per class | log | max price–value gap (§3.4.7) |
| mkt_impact_y_default (Y) | 0.8 | 0.3–1.5 | | square-root impact (§3.4.2) |
| mkt_perm_share (φ) | 0.5 | 0.3–0.7 | share | permanent impact (§3.4.3) |
| mkt_transient_hl_ticks | 15 | 5–60 | ticks | transient decay (§3.4.4) |
| mkt_spread_fear_k | 1.5 | 0.5–3 | | spread widening with F |
| mkt_depth_base / mkt_depth_fear_k / mkt_depth_floor | 1.0 / 0.6 / 0.2 | | | maker depth (§3.4.2) |
| mkt_auction_depth_mult | 3.0 | 1.5–5 | multiplier | auction depth |
| mkt_maker_inv_cap_adv | 0.5 | 0.2–1.0 | ADV | maker inventory (§3.4.5) |
| mkt_maker_skew_k | 1.0 | 0.5–2 | | inventory skew |
| mkt_maker_layoff | 0.12 | 0.05–0.25 | share per day | inventory layoff |
| mkt_max_auction_passes | 3 | 2–5 | passes | STP and FOK (§3.5.4) |
| mkt_gtc_max_days | 91 | 28–182 | game days | GTC expiry (§3.6.2) |
| mkt_autofx_buffer | 0.005 | 0–0.02 | share | autoFx conversion |
| mkt_market_order_ticks | 6 | 1–20 | ticks | market-order protection (§3.6.6) |
| mkt_iceberg_min_display | 0.05 | 0.01–0.2 | share of qty | iceberg display |
| mkt_autosplit_adv / mkt_autosplit_pov | 3 / 0.10 | 1–10 / 0.05–0.3 | ADV / share | auto-split (§3.6.8) |
| mkt_algo_child_cap | 0.02 | 0.005–0.1 | ADV per tick | algo child size (§3.7) |
| mkt_max_open_orders / _asset | 200 / 20 | | orders | open-order limits (§3.8) |
| mkt_band_sigma_k | 6 | 4–10 | σ_tick | per-tick band (§3.9.1) |
| mkt_vol_interrupt_ticks | 12 | 6–30 | ticks | volatility interruption |
| mkt_halt_l1 / l2 | 15% / 30% | | move vs close | single-asset halts (§3.9.2) |
| mkt_halt_l1_ticks / l2_ticks | 120 / 240 | | ticks | halt lengths |
| mkt_news_halt_ticks | 30 | 0–60 | ticks | material-news halts |
| market-wide L1 / L2 / L3 | −7% / −13% / −20% | | bloc index | circuit breakers (§3.9.3) |
| mkt_mwcb_cutoff_tick | 470 | 400–520 | tick of day | no L1/L2 after |
| mkt_fut_limit / mkt_fut_limit_wide | 10% / 15% | | move vs settle | futures limits (§3.9.4) |
| mkt_kanon_k | 5 | 3–20 | owner groups | k-anonymity (§3.12.4) |
| mkt_adv_fear_k | 0.01 | 0–0.03 | per F point | ADV fear boost (§3.14.1) |
| fees EQ / BOND / FX / CRYPTO | 3–1 bp / 0.5 bp / 0.3 bp / 10–5 bp | | bp | §3.15.1 |
| volume tiers | ×1.0 / 0.8 / 0.6 / 0.5×L4 at $10M, $100M, $1B | | FDL 30-day | fee tiers |
| mkt_otr_threshold / mkt_message_fee | 100 / $0.10 | 50–500 / $0.01–1 | ratio / Money | message fee |
| mkt_cap_npc_float / mkt_cap_player_float | 25% / 49% | | share of float | position caps (§3.15.2) |
| mkt_short_cap | 50% | 20–100% | share of float | short-interest cap |
| mkt_compute_oi_cap | 20% | 10–40% | share of OI | compute futures |
| mkt_surv_decay | 0.8 | 0.6–0.95 | per day | surveillance score (§3.16) |
| mkt_mm_max_assets / spread_mult / min_qty_adv / presence / rebate | 50 / 2 / 0.02 / 80% / −0.5 bp | | | registered MMs (§3.19) |
| block minimum | max(0.25 ADV, $1M) | | | block crosses (§3.20) |
| mkt_pool_pos_hl_days | 10 | 3–30 | game days | pool position decay (§6.2) |
| mkt_value_g0 / mkt_value_rate | 1.0 / 0.9 | 0.5–2 / 0.3–2 | σ_d·√5 / ADV per day | VALUE pool |
| mkt_trend_capacity | 1 | 0.3–3 | ADV | TREND pool crowding |
| mkt_belief_spread_ticks / hl_days / cap / handoff_ticks | 30 / 5 / 0.5 / 15 | | | belief model (§6.3) |

## 2. Decisions

- §3.2.1 Weekends closed for session classes, no holidays at launch: DEFAULT (Mathis may override). Resolves R03.
- §3.2.2 Crypto daily reference = VWAP of ticks 530–540: DEFAULT.
- §3.2.3 Value layer steps on trading-day ticks including closed hours (187,200 per year); crypto 262,080.
- §3.3.3 Orthogonal factors, correlation only from loadings: DEFAULT.
- §3.3.5 Fear Index does not multiply value vol (avoids feedback with rv21): DEFAULT.
- §3.4 One impact law on the maker ladder with shared daily tally: resolves R04 and T08 double counting.
- §3.4.7 Only XXX/FDL FX books; crosses as linked legs: DEFAULT.
- §3.5.3 Players before the maker at the same price: DEFAULT (Mathis may override).
- §3.5.4 STP decrements both sides by owner group; linked groups may match but are flagged.
- §3.6.2 GTC expires after 91 days.
- §3.6.8 Auto-split above 3 ADV into POV 10%: DEFAULT.
- §3.7 Algos need LIC2 (confirms 17 BRK-04 DEFAULT).
- §3.9 Circuit-breaker set (bands, LULD halts, market-wide L1–L3, futures limits). Resolves T10.
- §3.9.2 Halts before scheduled material company news: DEFAULT.
- §3.11 Depth 10 levels at Terminal tier, 3 otherwise: DEFAULT. Tape aggregated per tick; no identities (L11). Resolves C6 with §3.12.4.
- §3.13 Exchange fees always go to `exc_<bloc>`; concession holders paid through 03/10 concession profit (not SINK vs TRANSFER switching in 05).
- §3.14 ADV model-based, never from realized volume; background volume prints without postings.
- §3.15.3 Applies both 03's levy and 04's L4 fee multiplier through one interface: DEFAULT pending reconciliation of 03 §3.7 vs 04 §3.17.
- §3.17 Basic VaR free at LIC1, full risk at LIC2: DEFAULT.
- §3.19 Registered market makers with CH_EXCHANGE_MEMBER + LIC4. Resolves N3.
- §3.20 Block cross at the close with deferred print. Adopts N11.
- §3.21 Resting buy limits not adjusted for dividends: DEFAULT.
- §6.3 Belief model placed at §6.3 because 12 cites it there.
- Fresh start and defendant half leverage attributed to 05 by 13 belong to 14 and 07; 05 only passes 07's buying-power result.

## 3. Interfaces assumed

- 02: clock, trading-day calendar (7-day week), named RNG streams keyed by tick, `dmath`, sealed intents.
- 03: holds; postings `MKT_TRADE`, `MKT_EXCHANGE_FEE`, `MKT_MAKER_REBATE`, `MKT_TRANSACTION_LEVY`, `MKT_BLOCK_TRADE`, `MKT_LISTING_FEE`, `TAX_SECURITIES_TX`; NPC counterparty account `npc_MKT_<bloc>`; thin-print mark rule reading 05's ADV.
- 03/04: `stab.tradingLevers() → { highVolumeFeeMult, levyBp, levyFreeDailyNotional }`.
- 04: `GlobalMacroState.fearIndex`, `riskAppetite`, bloc and global regimes, `FxState.fairValueLn`, curves, factor jumps from releases, crisis phases, hooks to 05 (`makerWithdrawal`, `npcSellProgram`, `volShock`, `jumpIntensityShock`), `NpcPoolOrder` per tick.
- 06: `anchor(assetId, N) → { lnF, changedBy? }`, `priceParams(assetId)`, `hype(assetId)`, `dealerNetGamma(underlying)`, NPC options maker for packages, derivative marks, corporate actions.
- 07: `bp.check(accountId, orderDelta) → { ok, initialMarginHold }`, `borrow.locate(accountId, assetId, qty)`, liquidation orders, CCP novation of derivative fills.
- 08: ETF baskets and iNAV, creation and redemption at close, forced fund sales.
- 09: company events as value shocks, ownership-threshold consumer, suspensions.
- 11: AI agents submit the same intents. 12: C08 tap flag, false-claim flags. 13: licenses, Held, charters, reads `surveillanceScore(playerId, window)`.
- 14: prestige reach for claims. 15: owner groups and link graph, structured Wire claims, filings. 16: news items, rumors and resolutions, `impactHint` filled by 05. 18: `onb.firstTradeCap(chrId)`.

## 4. Content needed (catalog 22)

- Per-asset `MarketSpec` overrides for 400 instruments: factor loadings, turnover, size, tick tables, lot sizes.
- Sector list (12) and factor reference indices.
- Index names and constituents: GX100, one 50-stock index per bloc, sector indices, bond indices, IG and HY credit indices, CX10.
- Crypto venue names; exchange names per bloc.
- Claim kind table with asserted moves for the belief model.
- Named stress scenarios replayed from world history (with 16).
- Genesis price pre-history (250 days) for historical VaR.
- Intraday volume profile overrides per class, if any.
