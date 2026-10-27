# 06-notes: Asset classes

Module: `06-ASSET-CLASSES.md`. Every value below is `DEFAULT (Mathis may override)` unless it is a locked decision (L1–L15) or the 00 time model.

## 1. Parameters

| key | default | range | unit | what it affects |
|---|---|---|---|---|
| `auc_v0` | authored in 22 (launch AUC fundamental) | 0.5×–2× | FDL per AUC | AUC fundamental value anchor (§3.11.2) |
| `bond_grace_days` | 3 | 1–10 | game days | Grace after a missed coupon or principal payment before a bond default (§3.8.3), except sovereign issuers, which use 04's `macro_sov_grace_days` = 7; also feeds the CDS FAILURE_TO_PAY event (§3.17) |
| `bridge_pause_ticks` | 720 | 60–2,160 | ticks | How long Arc Bridge stays PAUSED after an impairment (§3.12.9) |
| `cmd_conv_eta` | 0.5 | 0.1–1.5 | per year | Convenience-yield sensitivity to days-cover, which sets the futures curve shape (§3.10.3) |
| `cmd_public_storage_markup` | 1.5 | 1.0–3.0 | × base storage cost | Price of NPC public warehouse storage compared with player storage businesses (§3.10.4) |
| `cmd_<id>_*` | §3.10.1 table (13 physical commodities: unit, ref price, normal cover, elasticity, γ, storage, perish, σ) | ±50% each | various | Commodity spot model and curves |
| `collectible_mark_haircut` | 0.10 | 0–0.30 | fraction | Mark of a collectible = appraisal × (1 − haircut) (§3.3.3) |
| `data_ref_price` | $2 | $0.5–$10 | FDL per DQU | Data commodity reference price; 11 may retune (§3.10.6) |
| `eq_consensus_sigma` | 0.06 | 0.02–0.15 | fraction | Analyst consensus noise around expected EPS (§3.4.3) |
| `eq_earn_immediate_frac` | 0.6 | 0.3–1.0 | fraction | Share of an earnings re-valuation that jumps at the report tick; the rest drifts in (§3.4.3) |
| `eq_earn_rerate` | 1.5 | 0.5–3.0 | per unit surprise | Re-rating of the multiple per unit of earnings surprise (§3.4.3) |
| `eq_earn_revision` | 1.0 | 0.5–2.0 | per unit surprise | Forward EPS revision per unit of surprise; together with the re-rating ΔlnV ≈ 2.5·s (§3.4.3) |
| `eq_growth_beta` | 1.5 | 0.5–3.0 | — | Growth premium per unit of growth above the sector median (§3.4.2) |
| `eq_loss_maker_ps_haircut` | 0.7 | 0.4–1.0 | × | Price-to-sales haircut for loss-making companies (§3.4.2) |
| `eq_sector_<id>_*` | §3.4.1 table (12 sectors: PE_base, PS_base, duration, σ, jumps/yr) | ±50% each | various | Equity fundamental values and volatility |
| `eq_split_trigger` | 1,000 | 200–5,000 | currency units | NPC stock split threshold: 5:1, or 10:1 above 5,000 (§3.4.5) |
| `fut_spot_month_limit_frac` | 0.10 | 0.05–0.25 | of deliverable supply | Spot-month position limit per beneficial-owner group (§3.14.5) |
| `macro_fx_uip_share` (owned by 04; ruling in 24) | 0.5 | 0–1 | fraction | Share of the rate differential that FX drift offsets; below 1, carry pays on average (§3.9.2) |
| `mark_stale_ticks` | 30 | 10–120 | ticks | Age after which the last batch price is no longer used for the mark (§3.3.3) |
| `max_live_instruments` | 2,500 | 1,000–10,000 | count | Soft cap on live instruments; pauses NPC spawns only (§3.1.2) |
| `meme_spawn_per_game_week` | 2 | 0–10 | Poisson rate | Meme coin spawn rate (§3.11.4) |
| `mirage_redeem_cap_per_tick` | 0.002 | 0.0005–0.01 | of MDOL supply | Rate limit on MDOL/MSH mint and burn (§3.12.8) |
| `npc_arb_cap_frac` | 0.02 | 0.005–0.10 | of ADV per tick | NPC arbitrage capacity: ETF/NAV, put-call parity, CIP (§6) |
| `npc_defi_arb_cap` | $250k | $50k–$2M | per pool per tick, × N_a | AMM vs CEX arbitrage capacity (§3.12.10) |
| `opt_crr_steps` | 128 | 64–512 | steps | CRR binomial tree steps for American options (§3.13.2) |
| `opt_dealer_hedge_participation` | 0.10 | 0.02–0.30 | of tick volume | NPC dealer delta-hedge flow (gamma feedback) (§3.13.6) |
| `opt_dealer_vega_chi` | 0.3 | 0–1 | — | Vol surface shift from dealer net vega, clamped ±30% (§3.13.3) |
| `opt_vega_cap_per_und` | index $2M, single stock $200k, crypto $300k per vol point, × N_a | ±75% | FDL vega | NPC dealer vega inventory capacity (§6) |
| `perp_max_oi_share` | 0.10 | 0.02–0.25 | of OI | Perp position limit per beneficial owner (§3.3.4) |
| `perp_oi_cap_frac_of_spot_mcap` | 0.25 | 0.05–1.0 | of free-float cap | Open-interest cap per perp (§3.15) |
| `player_tokens_enabled` | false | bool | — | Player-launched tokens, fully specified but off at launch (L10) (§3.20) |
| `primary_max_award_frac` | 0.35 | 0.10–0.50 | of issue | Competitive award cap per bidder in primary auctions (§3.7.6, X-counter) |
| `primary_noncomp_cap` | $5M | $1M–$25M | FDL eq. per owner | Non-competitive primary bid cap (§3.7.6) |
| `rookie_max_leverage` | 3 | 1–5 | × | New-player derivatives leverage cap (§3.2) |
| `ship_loss_prob_per_trip` | 0.002 | 0–0.01 | per trip | Cargo loss risk, insurable via 08 (§3.10.5) |
| `token_launch_fee` | $5M | $1M–$50M | FDL, SINK | Player token launch fee; locked liquidity ≥ $2M (§3.20) |
| `trs_dealer_spread_bps` | 50 | 10–200 | bp | TRS funding spread, × (1 + 2·fear) (§3.16) |
| `xccy_basis_stress_bps` | 40 | 0–150 | bp | FDL cross-currency basis under fear² (§3.9.3) |
| Price params per class | §3.21 table (κ half-life, σ, ν, jumps, jump means, spread); GARCH α 0.08 β 0.90 (stablecoins 0.02/0.95) | — | — | Inputs 05 uses to move prices |
| GXV bounds | [5, 150] | — | vol points | GX Volatility Index range (§3.5.3, test 10) |
| Perp funding | interval 240 ticks, clamp ±0.1% | 120–720; ±0.05–0.5% | ticks; per interval | Perp funding (§3.15) |
| CDS coupons | 100 bp IG / 500 bp HY | — | bp/yr | Standard CDS (§3.17) |
| Collectible fees | buyer premium 15%, seller fee 12%; soft close 30 ticks × 10 | 0–25% | — | Auctions (§3.18.3) |
| Stablecoin reserves (GUSD) | 60% bills, 30% NPC bank deposits, 10% overnight repo | — | — | GUSD reserve mix (§3.12.6) |
| AUC supply | max 18,000,000, halving each chapter | — | AUC | AUC issuance (§3.11.1) |
| Option CRR / models | BS, Black-76, Garman-Kohlhagen, CRR | — | — | Option pricing (§3.13.2) |

## 2. Decisions

- `DEFAULT`: all trades settle DVP in P13 of the tick they matched (T+0), so there are no settlement fails (§3.3.2).
- `DEFAULT`: the launch universe is exactly 400 authored instruments (240 equities, 30 ETFs, 30 government bonds, 50 corporate bonds, 10 FX pairs, 20 commodities, 20 tokens). Derivative series are lazy and created by rule (§3.1).
- The implied-vol index is renamed GXV. The Fear Index F belongs to 04, and 06 reads F wherever "fear" appears. GX100 30-day ATM vol is floored at 04's anchor 0.10 + 0.004·F (§3.5.3, §3.13.3).
- Fixes 01's FX drift: UIP pass-through is 0.5 (04's `macro_fx_uip_share`, ruling in 24), not full, so carry earns a premium with crash risk (§3.9.2).
- Defaults, depegs and bridge impairments are caused by balance sheets, never a fixed-probability roll. This replaces 01's fixed stablecoin depeg probability (§1 law 4, §3.8.3, §3.12.6–9).
- Bond default is mechanical: a missed payment beyond 3 game days of grace, a filing, or a restructuring (§3.8.3).
- Corporate PD comes from a Merton/KMV approximation. Banks use max(Merton, CET1-based PD). Spread = hazard × LGD + liquidity premium (§3.8).
- Primary auctions are uniform-price (yield or price) with a 35% award cap (§3.7.6).
- Commodity futures are cash-settled by default. Physical delivery is elective for holders with storage (§3.10.5).
- Compute, data and power are game-native commodities. Data freshness belongs to 11 (§3.10.6).
- Crypto runs one block per tick per chain, ordered by hash, with no priority fees. There are no bundles and no flash loans (§3.11.5, §3.12.11).
- Stablecoins come in three designs (GUSD fiat-reserve, VSD CDP, MDOL/MSH algorithmic). Mirage pays a 12%/yr savings rate (§3.12.6–8).
- Player tokens are specified in full but disabled by `player_tokens_enabled=false`. This satisfies both L10 and the brief's "no deferring" (§3.20).
- CDS: there is a credit event determination plus a recovery auction. Insiders of the reference entity cannot buy protection. Net protection sold per owner is capped at 25% of the reference debt (§3.17, §3.3.6).
- RFQ and auction counterparties appear only as rotating labels and credit tier. Holdings never leak (L11) (§3.18.3, §3.19).
- Collectible fees follow 01 (buyer premium 15%, seller fee 12%). With the NPC house these fees go to SINK (§3.18.3).
- `DEFAULT`: the data reference price is $2 per DQU (§3.10.6).
- `DEFAULT`: the GUSD reserve composition is 60/30/10 (§3.12.6).
- Restricted cash uses 03 §3.5.6. `AD_GRANT` is no longer used (§3.20).
- Reason codes are aligned to the 03 catalog: `EQ_DIVIDEND`, `CRY_TOKEN_MINT`, `DRV_PERP_FUNDING`, `COLL_AUCTION_FEE`. ETF expenses use 08's code (§5).
- LIC1 covers major crypto only. Meme coins need LIC2 (§3.2).
- The "top 200 holdings report" from the roadmap is left to 15. 06 does not publish holdings.

## 3. Interfaces assumed

- **00**: time model (720 ticks per day, 262,080 per year), P0–P14 pipeline, L1–L15, ids `ast_<CLS>_<CODE>`.
- **02**: deterministic RNG streams `rng(name, …)`, intent validation in P1.
- **03**: Money bigint micro-units, Postings committed in P13, reason-code catalog, restricted cash (§3.5.6), SINK account.
- **04**: `ois`, `govt` and `real` Nelson-Siegel curves per bloc; CPI; policy rates; FX regimes (enforced in P1); Fear Index F; IV anchor (§3.14.1); bloc GDP, wage and credit indices.
- **05**: return equation, jumps, batch auction, NPC market makers and impact. 06 hands 05 `V_i`, `PriceParams` and targeted jumps.
- **07**: margin, haircuts, securities lending, repo, TCH novation and services (LD, OTC, CDS, REPO, CRY), bank CET1 for the bank PD.
- **08**: ETF creation and redemption, ratings, securitization, insurance (cargo), fund units, ETF expense code.
- **09**: CompanyFinancials (EPS, revenue, debt), dividends, buybacks, IPOs, bankruptcy filings, insider lists, storage and battery businesses, player auction houses.
- **10**: city and housing data (REIT occupancy, mortgage rates).
- **11**: AI-race index (SYN), compute and data supply and demand, data freshness.
- **12**: abstract attack outcomes on bridges, custodians and data theft.
- **13**: surveillance cases, licenses LIC1–LIC4, insider and blackout rules, court-case leverage cuts.
- **14**: ranks, new-player protection, prestige for collectibles.
- **15**: legal filings and publication rules.
- **16**: NPC agents and N_a scale, new cities, Vault Exchange behaviour, active wallets.
- **17**: screen layouts.
- **20/21**: simulation harness frequency bands; live-ops flag switching.
- **22**: names and authored content. **23**: parameter registry.

## 4. Content needed for 22

- All 400 launch instruments with names, codes and tickers:
  - 240 companies (48 per bloc, 12 sectors × 4), including 01's 12 tone-setting names.
  - 30 ETFs.
  - 30 government bonds.
  - 50 corporate bond issuers, including 10 NPC banks.
  - 10 FX pairs.
  - 20 commodity lines.
  - 20 tokens.
- Index names: GX100, the regional-30 indices, sector indices, CMX, GXV, GX Credit 40, the FRX freight index.
- The 20 launch tokens and their chains (Aurum, Lattice, Meridian) with final names. The protocols: Tidepool, Ferro, Harbor, Vesta, Quill, Mirage, Arc Bridge. Plus the 24 launch AMM pools with seed liquidity.
- NPC entities:
  - Guardian Trust (GUSD issuer).
  - Keystone (wAUC custodian).
  - Vault Exchange (CEX).
  - Halberd & Vane (auction house).
  - The NPC bank holding GUSD reserves.
  - NPC miners and stakers.
- A meme-coin name generator (themes, syllables, ticker rules).
- A company name generator for new cities.
- Commodities:
  - Hubs per commodity, with the benchmark hub, basis and shipping routes, transit times and freight.
  - Contract sizes (e.g. CRUDE 1,000 bbl).
  - CMX production weights.
- The PPP_0 matrix per currency pair. The `auc_v0` and `v0` per token.
- The collectible catalog: categories, items, provenance and launch appraisals.
- Authored stress scenarios for tests (stablecoin confidence shock, Mirage spiral, bridge impairment, earnings season).
