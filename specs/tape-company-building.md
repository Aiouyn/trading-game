# Tape: company building, checks
**Owner:** Tape. **Status:** v1.4, spec only, 2026-10-09. No company code exists yet. A check for a system that isn't built never shows PASS. The v1.6.1 run below is **modelled** except where marked **engine run**.
**Under test:** `specs/quant-company-building.md` **v1.6.1** (985 lines, sha256 `6149e9e4…92f5`, verified; FROZEN for Tape's run). v1.6 kept as `quant-company-building.v1.6.md`, v1.5 and v1.4 beside it. v1.5 added: `minSellPrice` ≤ 0.80 × commit-day close (`planFloorTooHigh`), price-skipped shares locked to end day + 63, seized locked shares sold on the plan schedule through a clearing account (`claimCoveredCreditor`), backlog α = 1, caps on unbacked parts only, unbacked excess released at the next weekly signal, the same-schedule faking comparator, and the joint check. v1.6 added: backlog lifts value only by contribution margin (CB), excess non-converted backlog lift above `npcCancelRate[s]` is reversed at the re-anchor and repaid by the founder × S_k; v1.6.1 counts alliance members' sales in S_k. Also read: `velvet-company-app.md` v1.3, `tape-stonks-exploits.md`, `research-stonks9800.md`, `quant-t1-business.md`, `tape-ecology-hunts.md` §4 and §6, ROADMAP, `scripts/company/signal_cap_breakeven.py` (rerun: v1.6 output and `--v15` / `--v14` logs identical byte for byte). Tape harnesses: `scripts/balance/tape_v15_joint.py`, `scripts/balance/tape_v16_backlog.py` (modelled), and the engine probe `tg/scripts/tape-probe/postprint-drift.ts` (engine run).
**Privacy rule (Mathis):** every bot here is harness code in `scripts/balance/` or `tests/`. Tests may read private engine state. Nothing here implies a player can see another's book.

**Rules under test (exact names from v1.4 §6.1, §11).**
- **Window:** let c = period close (gd 63k) and F = c + 3 (filing day, open tick). Quarter Q covers days c_prev + 1 … c.
  - Covered accounts (founder, owner set incl. treasury and linked alts, alliance members) may trade the stock and every §6.5 instrument only from the **first tick of F + 2 through the last tick of F + 21**.
  - Outside that, `placeOrder` → `{ code: 'closedWindow', untilDay: F' + 2 }`.
  - The window starts with the company's first quarterly filing (Late private and Listed only).
- **Plans (sell-only):** `TradingPlan { instrument, qtyPerDay, days[], minSellPrice, committedDay }` via `commitPlan`, committed ≥ 63 gd before its first day. `minSellPrice` is required, immutable and ≤ 0.80 × the commit-day close (`planFloorTooHigh { maxFloor }`, v1.5); shares unsold on `price` skips stay locked to end day + 63.
  - Refusals: `planSellOnly`, `planFloorTooHigh { maxFloor }`, `planLimit`, `planInLockup`, `planTooSoon { earliestDay }`, `planUnfunded { shortfall }` (in shares), `planBanned { untilDay }`, `planImmutable`. Claims: `claimCoveredCreditor` (v1.5).
  - **Escrow = locked shares only.** No cash is ever escrowed. Locked shares can't be sold outside the plan, lent, transferred, pledged or used as margin collateral. `placeOrder` and the fill loop enforce sellable = qty − locked on every route.
  - Plan orders go first at the open tick, inside the 2%/gd post-lockup cap and the 3× ADV cap.
  - `planSkipped { day, reason: 'volume' | 'price' | 'cap' | 'halt' }`; `planEnded { day, reason: 'completed' | 'terminated' | 'legal' | 'tender' }`. **No skip or end is a breach.** A tier drop or leaving the covered set doesn't change a running plan. Splits scale locked qty, qtyPerDay and remaining qty, and divide `minSellPrice`; dividends on locked shares are free cash; a tender ends the plan.
  - **Public:** the plan exists, with `{ fromDay, toDay }`, plus skip/end day + reason. Size, qtyPerDay, `minSellPrice` and remaining qty are never public. Every founder trade in the own stock or its derivatives is filed on **d + 1** with side, size and day; no pre-announcement.
  - **Breach** (public filing + `planBanned { untilDay }`, untilDay = the last day of the 2nd full quarter after the breach quarter) survives as a fail-safe only: no reachable path in v1.4 (G11).
- **Warning:** founder-only `{ kind: 'windowClosing', companyId, closesDay, reopensDay }` at the open tick of **F + 17**. At the last tick of F + 21, non-plan covered orders are cancelled with a founder-only Wire line, and the founder-only `windowClosed` event fires (proposed, Q29).
- **Buybacks:** filed **only on F + 1**, with a fixed size and daily schedule inside that window; immutable (`buybackImmutable`).
- **Other `placeOrder` reject codes:** `stacking`, `lockup`, `ceoExitFreeze`, `self_match`, each with `untilDay` where it applies.
- **UI (Velvet v1.3):**
  - Locked ticket `window-closed-ticket`: "Window closed until Day N". Banner: "Window closes in 5 days".
  - "Sellable" vs "Locked · PLAN" (`shares-plan-locked`); `company-plan-skip`.
  - `company-plan-blocked` while banned (injected only); `clawback-warning` before lending or contracting.
- **Types:** `CompanyPublic` (shared) vs `CompanyFounderView` / `CompanyFounderEvent` (Company app only).

**Layers:** `unit` = engine Vitest on `src/engine` (no React). `bal` = seeded balance script in `scripts/balance/` printing the band, with `--seeds` and a fresh parts dir (ecology hunts lesson). `e2e` = Playwright under `?e2e&seed=…&intro=off`. `lint` = static check (ESLint + Forge's TS-parser isolation check from fe1d971).
**Fixtures:** `companyFixture(seed, { sector, tier, script })` builds a seeded world with one player company. Scripts: `competent`, `careless`, `topDecile`, plus the attack bots named per check. Seeds `tape-co-001…200` (200 for EV and balance bands, 20 for unit property tests). Listing fixtures start already listed (`listCompany` at gd 0, 3 synthetic filed quarters). `config.companies` is always set explicitly (lesson from the ecology flip).
**Status tags:**
- `BUILD`: runs when the company engine lands.
- `WAIT-INSTR`: needs shorts, ETFs or derivatives (§6.5 "Today").
- `DEFERRED`: the system isn't in v1.
- `PENDING-MATHIS`: depends on the T1 merge with 20 gd payback (§8, §12 #4).
- `PROPOSED(§)`: the pass rule rests on an item Quant marks *proposed*. It runs as written and the band follows any later ruling.
- `BLOCKED(Gn)`: no pass rule can be fixed until GAP n is answered.
- `EXPECT-FAIL`: predicted to fail as specced.
- `EST`: the gate value comes from Quant's back-of-envelope estimate, not a simulation. Tape measures it; the estimate is never accepted as the result.

**Aliases (Quant's names adopted; old Tape ids map here, no duplicates):**
- `window_bypass` → `closed_window_bypass`; `window_edge_symmetric` → `window_two_way_edge`; `window_order_stack` → `stacking_rule`.
- `window_resting_cancel` + `window_stop_trigger_after_close` + `window_modify_refused` → `closed_window_fills` (+ `window_close_cancel`); `plan_commit_lead` → `plan_immutable`.
- Quant v1.1 `blackout_bypass` → `closed_window_bypass`; `blackout_notice` → `window_closing_every_window`.
- v1.3: my `plan_no_optionality` drain leg → Quant's `escrow_spendable`; my margin leg → `escrow_margin_untouchable`; Quant's `planBarred` / `breach_bars_plans` code name → `planBanned` (id `breach_bars_plans` kept).
- v1.4 (Ledger's sell-only plans): `escrow_spendable` → `plan_locked_shares`; `escrow_margin_untouchable` → `plan_margin_untouchable`; `escrow_vs_clawback` → `plan_end_legal`; `plan_unfunded` → `plan_unfunded_shares`; v1.3 `plan_skip_price` (cash escrow short at the fill price) → retired, the id now means the `minSellPrice` skip; `clawback_safe_harbour` → `clawback_safe_harbour_64`; `clawback_insider_status_change` → `clawback_insider_either`; `insider_trade_filing` → `insider_filing_next_day`.
- Deleted in v1.4 (meaning gone, no alias): `plan_escrow_exact` (cash escrow ×1.25), the buy/short/cover legs of `plan_no_optionality` and `plan_offset_in_window`, the margin-breach legs of `breach_bars_plans`.
- v1.5/v1.6: `plan_end_legal` → `plan_legal_schedule` (Quant); `plan_min_price_option` keeps its id and now runs against the 0.80 cap and the end + 63 hold. Quant's joint id `signal_joint_v15` covers `cap_carry_edge` + `reanchor_public_edge` + `rho_residual` in one run; the three keep their own rows.

---

## 0. Foundations (every other check assumes these)
| id | check | pass | layer |
|---|---|---|---|
| `co_determinism` | same seed + same action list → identical world hash after 2 quarters; JSON save/load at mid-quarter, in the window, in the closed period and mid-plan continues byte-identical | 0 diffs, 20 seeds | unit |
| `co_config_absent_fingerprint` | `config.companies` absent → engine fingerprint fixture unchanged | byte-identical | unit |
| `co_ledger_balances` | balance sheet balances to the cent every gd; Σ tagged flows = Δcash; Σ daily revenue = filed revenue | 0 mismatches, 20 seeds × 4 quarters | unit |
| `filing_hash_match` | frozen hash at period close == hash of the published filing; an entry posted after the close tick lands in the next quarter | 0 mismatches | unit |
| `co_speed` | `companyDay` per company per gd | < 50 µs median on the box; per-tick speed gate unchanged | bal |



## 1. Exploit map (Quant §9: X1–X15 + N1–N17)
One row per exploit. "§" is Quant's section. The detailed checks are in §§2–10.

| # | exploit | § | check ids | pass rule | layer | status |
|---|---|---|---|---|---|---|
| X1 | control a stock by trading > 5% ADV | 5.2, 9 | `co_self_impact_clip_ratio`, `co_pump_dump_ev` | lift(720 clips) / lift(1 clip) ≤ 1.5 with founder + treasury (+ linked alts online) on **one** owner-set tally; pump-dump mean P&L after fees ≤ 0 at 5/10/20% ADV × D ∈ {1,3,5}, in-window only, 60 seeds | bal | BUILD |
| X2 | price detached from fundamentals | 6.2, 6.4 | `loss_company_rally_share`, `filing_lnv_corr`, `co_value_gap_p95` | 4 straight loss quarters → up > 50% over the year in ≤ 0.10 of seeds; corr(ΔlnV at filing, s_filing · EV / mcap) ≥ 0.8; p95 \|lnP − lnV\| ≤ ln 2 | bal | BUILD (Q20 resolved: s now has the backlog term) |
| X3 | money overflow | 9 | `company_huge_money_invalid` | $1e12 capital, 1 game year: 0 NaN/Inf, 0 negative-cash rounding, integer cents < 2^53 | unit | BUILD |
| X4 | split rally | 9 | `co_no_split_api` (+ `split_cosmetic_*` later) | no split action exists for player companies in v1 | unit/lint | BUILD (splits DEFERRED) |
| X5 | dividend pump | 5.3 | `dividend_rule_reject`, `dividend_pump_ev`, `dividend_distress_flag` | §6 | unit + bal | BUILD |
| X6 | own company = guaranteed stock | 6, 5.1 | `founder_pump_ev`, `own_stock_up_share`, `own_stock_rank_pump`, `founder_beats_bh_share` | pump bot mean P&L ≤ 0 with fines; up after 1 year in ≤ 0.80 of seeds; rank gain from own buying = 0; vs EW basket ≤ 0.70 | bal | BUILD |
| X7 | resignation pump | 9.1 | `ceo_exit_freeze`, `ceo_change_filing`, `resign_pump_ev` | §3 | unit + bal | BUILD, PROPOSED(§9.1) |
| X8 | short, dump, buy out | 9.2 | `tender_price_floor`, `short_dump_buyout_ev` | §3 | unit + bal | DEFERRED (takeovers), T0 rule PROPOSED(§9.2) |
| X9 | snowball | 7, 2 | `founder_yield_by_size`, `founding_dominance` | §10 | bal | BUILD |
| X10 | crime-protected pump | 9 | `filing_hash_match`, `crime_pump_ev_ratio` | 0 ops alter a frozen filing; ratio ∈ [0.8, 1.2] at M30 | unit | BUILD (ratio DEFERRED) |
| X11 | owning > 100% | 5 | `ownership_conservation` | 10k random sequences (IPO, rounds, buybacks, plans, lockup release, CEO change, default/delist): Σ holdings = shares out every tick, no holder > 100% | unit | BUILD |
| X12 | free investor money | 5 | `investor_no_free_cash` | every equity inflow changes ownership by inflow / post-money at 0.70 × V_engine; before/after shown | unit + e2e | BUILD |
| X13 | failed AGM raises price | 9 | `co_no_governance_term`, `agm_sign_test` | V_engine has no governance input (twin test); AGM test later | unit | BUILD (AGM DEFERRED) |
| X14 | riskless rent | 9 | `co_property_is_cost` | company property posts only as rent/plant cost, never income | unit | N/A here |
| X15 | overtuned projects | 3 | `project_ev_band`, `project_band_shown` | realized inside the shown band ≥ 90%; mean ROI ≤ base + 10%; p as ±5 pts and Δq as bear/base/bull before launch | bal + e2e | BUILD |
| N1 | round-tripping revenue | 6.3 | `rp_*` | §5 | unit + bal | BUILD |
| N2 | trading the stock on early knowledge | 6.1, 6.2 | `alt_prefiling_edge`, `rho_residual`, `closed_window_bypass` | §2, §3 | bal + unit + e2e | BUILD |
| N3 | wash trades in the owner set | 9 | `self_match_fills` | 0 fills with both sides in one owner set; `{ code: 'self_match' }`; crossed qty netted; +10 surveillance per attempt | unit | BUILD |
| N4 | alt-lifted peak | 5.1 | `alt_lifted_peak` | an alt buying after the founder raises the founder's peak/rank mark by ≤ 0 (tol 0.1% of stake) | bal | BUILD (online) |
| N5 | bankruptcy cash-out | 5.3 | `bankruptcy_extract_ev`, `clawback_*` | §6 | unit + bal | BUILD |
| N6 | guidance inflation | 6.4 | `guidance_inflate_ev`, `credibility_math` | P&L ≤ honest over 8 quarters; C EWMA half-life 4 q, start 0.5, multiplier 0.85 + 0.15·C, miss ×(2 − C), exact to 1e-12 | unit + bal | BUILD |
| N7 | accrual / inventory stuffing | 6.4 | `revenue_without_cash_lnv_effect` | §5 | unit | BUILD |
| N8 | IPO pop farmed by alts | 5.1 | `ipo_alt_allocation`, `ipo_pop_to_allocatees` | §7 | unit + bal | BUILD |
| N9 | self-funded private round | 5 | `self_round_attempts_accepted` | 0 rounds from any owner-set account | unit | BUILD |
| N10 | transfer pricing with own T1 | 6.3 | `rp_band_exact`, `rp_t1_roundtrip` | §5 | unit | BUILD (stage-0 variant PENDING-MATHIS) |
| N11 | R&D save-scum | 3 | `rd_reroll` | reload with identical inputs → identical outcome | unit | BUILD |
| N12 | buyback on private knowledge | 5.2 | `buyback_window`, `buyback_shared_tally`, `closed_window_fills` (treasury), treasury leg of `window_two_way_edge` | §4: filed only on F + 1, fixed size and schedule, `buybackImmutable` | unit + bal | BUILD |
| N13 | predatory pricing then gouge | 2 | `predatory_price_ev`, `npc_reentry_rate`, `antitrust_trigger` | P&L ≤ steady over 4 quarters; entry p = min(0.6, 0.25·max(0, m − 10%)/10%); > 60% share for 2 q → review, 0 misses | unit + bal | BUILD |
| N14 | lockup bypass via derivative / sector ETF | 5.1, 6.5 | `lockup_hedge_accept` | 0 accepted orders adding short exposure on any covered instrument for a locked holder over 168 gd, using the latest frozen weight snapshot | unit | WAIT-INSTR; listing-tick snapshot PROPOSED(§13 Q23) |
| N15 | trading on the quarter while it forms | 6.1 | `window_two_way_edge`, `plan_immutable`, `plan_sell_only`, `plan_locked_shares`, `plan_no_breach_path`, `plan_min_price_option`, `plan_legal_escape`, `plan_fake_timed` | §4 | bal + unit | BUILD (sell-only plans, v1.4); `plan_min_price_option`, `plan_legal_escape` predicted PASS under v1.5 (G10, G12 closed) |
| N16 | stacked orders that flip a position or beat a limit | 6.1 | `stacking_rule` | §3 | unit | BUILD |
| N17 | faked forward signals | 6.2 | `signal_fake_ev`, `signal_forward_cap`, `close_signal_uncapped`, `signal_path_independence`, `cap_carry_edge` | §2 | bal + unit | BUILD; `cap_carry_edge` likely FAIL for liquid listings |


## 2. Informed trading, filing surprise, weekly signals (§6.2)
**Harness `insider-harness.ts` (bal):** 200 seeds × 8 filings after listing (`competent` script; sectors staples, software, consumer, industrial). Each seed-filing is one sample. Every report prints n, mean, median, p90, p95 and the round-trip (RT) cost at the tested size.
- **Informed alt:** an unlinked account the window doesn't bind. It reads the frozen numbers and knows sign(s_filing).
- **Uninformed control:** the same entries with a coin-flip sign. Its mean excess before costs must be within ±0.1% of 0, which validates the harness.
- **RT cost:** spread + fees + square-root impact for entry and exit at that size, from `estimateFill` on the same tick.
- **Surprise metric (exact, v1.4 §6.2):** s_filing = [(Rev_actual − Rev_cons)·m + (OCF_actual − OCF_cons) + (B_actual − B_cons)·m·w_b] / D.
  - D = max(EV_20, 0.25 · mcap_20), as 20-gd averages ending at the period close. m = TTM gross margin clipped to [0.10, 0.90]; w_b = 0.5.
  - s_quarter uses the previous filed quarter in place of consensus. ρ = sd(s_filing) / sd(s_quarter) per seed over its 8 filings.
- **Required fixtures** (each also runs inside the 200-seed set):
  - `fx_loss`: NI < 0 every quarter.
  - `fx_neg_ocf`: OCF < 0.
  - `fx_zero_ni`: NI = 0 to the cent.
  - `fx_margin_clip`: GM 0.05 → 0.10 and 0.95 → 0.90.
  - `fx_net_cash`: net debt < 0 with EV_20 > 0.25·mcap_20 (EV branch).
  - `fx_ev_nonpos`: net cash ≥ mcap, EV_20 ≤ 0, so D = 0.25·mcap_20.
  - `fx_close_payout`: a max legal dividend and a revolver draw on the close day.
  - `fx_launch`: a launch that doubles backlog in week 1, so the forward cap binds.

| id | check | pass | status |
|---|---|---|---|
| `alt_prefiling_edge` | informed alt enters at c − 20, c − 5 and the period close tick, at 1% and 3% ADV, exits F + 21; baseline = same trade at the first tick after the filing's newsPrint on F | **mean excess ≤ mean RT cost and median ≤ RT cost** at every entry and size; p95 > 2× RT → WARN | BUILD; baseline PROPOSED(§13 Q10) |
| `rho_residual` | ρ per seed, all fixtures | **median ≤ 0.15, p90 ≤ 0.25**; p95 reported; s finite (no NaN/Inf) in every fixture incl. `fx_ev_nonpos` | BUILD |
| `surprise_formula` | s for hand-built quarters, every fixture | matches the formula to 1e-12, including the backlog term; D takes the mcap branch exactly when EV_20 < 0.25·mcap_20 (test EV_20 = 0.25·mcap_20 ± $0.01); m clipped at 0.10 / 0.90 | unit |
| `rho_ev_robust` | `fx_close_payout` vs a twin without the close-day payout | \|ΔD / D\| ≤ 1/20 of the payout's EV change; Δρ ≤ 0.01 median | unit + bal |
| `rho_by_spread` | ρ and alt edge by spread bucket (25–60 / 60–150 / 150–200 bps) | edge ≤ RT cost in every bucket | bal |
| `signal_cadence` | a signal at the open tick every 5 gd for listed companies only; last at the period close; none between c and F | exact days, 0 extras | unit |
| `private_no_signals` | Seed, Growth and Late private companies over 2 quarters | 0 `WeeklySignal`s; `CompanyPublic.signals` empty | unit |
| `signal_noise` | band centre / true = exp(ε): σ 0.04 backlog, 0.02 shipped; stream `co:<id>:sig` | KS p > 0.01 over 10k draws; another company's actions leave the draws identical | unit |
| `signal_bias_correct` | consensus input = centre × exp(−σ²/2); backlog EWMA α = 0.5 | mean consensus error over 10k draws within ±0.1% of 0 (unbiased) | unit |
| `signal_weights` | consensus update | shipped at weight 1.0; backlog only through w_b·ΔB (0.5); headcount and net hires only as wage cost (twin +100 heads, same shipped → revenue estimate identical, cost higher) | unit |
| `signal_to_lnv` | after each signal | ΔlnV = ln(V_cons,new / V_cons,old) after the cap; newsPrint 0.5 on that tick | unit (\|err\| < 1e-12) |
| `signal_forward_cap` | `fx_launch`, plus scripted hiring moves of +3% then 3 × +1.5% | v1.5 scope: **only unbacked parts** (headcount/hires, utilization) are clipped to 1.5% per weekly signal; new unbacked news beyond ±2.5% waits one signal (hi_k = max(2.5%, U_{k−1})), then releases ≤ 1.5%/signal; backed backlog and shipped revenue never clipped | unit |
| `signal_cap_scope` | Quant's §F example (U 2.0% at wk1, 4.0% from wk3) and a launch | releases 1.5 / 0.5 / 0.5 / 1.5%; a launch's backed backlog lands in full at its signal | unit (Quant's id) |
| `consensus_alpha1` | each signal | consensus backlog (v1.6: CB from `backlogContributionBand`) = the latest bias-corrected report exactly | unit (Quant's id) |
| `close_signal_uncapped` | the period-close signal after a carried excess | releases all carry; consensus at the close equals the uncapped twin bitwise | unit |
| `backlog_filed_field` | each filing | `backlog` filed = NPC orders not shipped at the close (orders > 63 gd cancelled first); V_engine reads Rev_u,ann + w_b·ΔB and E*_ann + m·w_b·ΔB, exact | unit |
| `signal_reanchor` | at each filing | lnV = ln(V_engine(filed incl. backlog) / shares_out) exactly (plus that tick's factor shock) | unit |
| `reanchor_public_edge` | public-information bot: at the period close, short if the cumulative forward part since the last anchor is > 0 (long if < 0), exit at F + 2 | mean P&L ≤ RT cost, 200 seeds. EST: Quant says gross ≈ 0 by construction (curvature ~3e-6) | bal, EST |
| `forward_cap_honest_bind` | honest `competent` + `fx_launch`-heavy companies: share of in-quarter signals that bind; ρ with the cap vs without | binds on ≤ 10% of signals; Δρ ≤ 0.02 median. EST: Quant says ~6% binding and Δρ = 0 | bal, EST |
| `cap_carry_edge` | three public bots (weekly-carry, lag-aware next-signal, hold-to-close), run inside `signal_joint_v15` | mean net P&L ≤ 0 for each bot in every size × liquidity bucket | bal; **v1.6.1 run: FAIL** (lag-aware via shipped-revenue noise reversion; carry/hold on unbacked hiring moves, G18) |
| `signal_joint_v15` | one 200-seed × 8-quarter run, J ∈ {2, 3.3, 5, 8}%, buckets $50M/$500M/$5B, sizes $10k–$25M: `cap_carry_edge` (3 bots) + `reanchor_public_edge` + `rho_residual` | PASS only if all three pass on the same seeds; a pass bought by pushing ρ out of band is a FAIL | bal (Quant's id); **v1.6.1 run: FAIL** |
| `signal_noise_reversion` | public bot: predicted next step = mean of the last 3 reports − the latest (shipped revenue σ 0.02; CB σ 0.04 under α = 1), trades only when |pred| > RT | mean net ≤ 0 in every bucket | bal (new); **FAIL on shipped revenue** (pre-existing since v1.3), PASS on backlog |
| `signal_postprint_drift` | public bot buys (sells) at the first tick after a signal's print and exits at close D + 1, only when (share at D+1 − share at print) × |step| > RT; shares from the engine probe | mean net ≤ 0 in every bucket | bal + **engine run** (new); **FAIL** |
| `signal_path_independence` | twins with identical filed fields and different in-quarter signal paths | identical lnV from the filing tick on, bitwise | unit |
| `signal_public_only` | twins with identical public signals and different private state | identical consensus path, bitwise | unit |
| `consensus_converges` | \|ln Rev_cons − ln Rev_frozen\| by week | median at the last signal ≤ 0.5 × week 2 (Tape band) | bal |
| `signal_fake_ev` | fake-and-sell founder bots (`backlogPush`, `hireBurst`, `planTimed`, plus `freeOverflow`, `refuseToShip`) vs the honest founder selling the **same schedule**, 200 seeds, **after the v1.6 repayment and the production cost**; print the break-even production cost per $1 of fake backlog and as % of mcap | faker ≤ honest | bal; **v1.6.1 run: PASS for founder-sold fakes except `freeOverflow`** (keeps c_s × L × sold, accepted residual); escape via non-covered sellers and derivatives is `backlog_repay_outside_covered` |
| `backlog_margin_only` | list order cm = m; vc = price; vc > price; −30% order in each sector | Δ lnV = v1.5 term to 1e-12; 0; negative; Quant §M ratios (software 89% … industrial −0.0417/Rev_q) | unit (Quant's id) |
| `npc_cancel_deterministic` | same seed twice; orders of qty 10, 30, 60, 260, 1000 per sector | no rng consumed, identical cancellations; NPC loses exactly floor(c_s·qty). Also report the floor slack (c_s − actual NPC share): up to the full c_s for qty < 1/c_s (G17) | unit (Quant's id) |
| `reanchor_reversal_excess_only` | non-conversion = c_s; c_s + Δ; orders open at the filing; a twin with a different price path, same signals | X = 0, R = 0; X = Δ·ℓ_tot; open orders wait for their resolving filing; same R | unit (Quant's id) |
| `fake_lift_repay` | `backlogPush` that never ships, S_k from plan + window sales | R = Σ fair_k·(1 − e^{−X_k})·S_k to the cent; §5.3 collection; `backlogReversal` line and `backlogRepay` event; faker net ≤ c_s × gross | unit + bal (Quant's id) |
| `honest_cancel_no_charge` | honest bots incl. plan sellers, 200 seeds × 8 q, with random sector demand and a capacity-reacting founder; Quant §O case | R = 0 in every quarter with company non-conversion 0; §O: $167k ± rounding | unit + bal (Quant's id) |
| `backlog_repay_shares_counted` | sales before signal k, after the filing tick, plan fills, window trades, owner-set alt, **alliance member** (v1.6.1), clearing account, buys; a plan fill **on the filing day's open tick** | not / not / counted ×5 (alliance counted) / buys never offset; the filing-tick fill is counted, or the re-anchor prints first (tick order stated, G19) | unit (Quant's id) |
| `backlog_repay_outside_covered` | **hunt (b):** fake + non-covered friend or undeclared alt shorts at the lifted price and covers after the reversal; founder hedges with §6.5 derivatives (short futures/perps, long puts) instead of selling shares; founder strips cash to an alt before the filing | friend/alt/derivative gain ≤ RT; repayment collected in full | bal; **EXPECT-FAIL (G16)** |
| `insider_surveillance_odds` | an account with a position opened while the window was closed (a plan or an undetected alt), > 0.5% ADV, z > 2 | adds to the surveillance score; investigation odds rise with z, ≤ 60% per case; 0 automatic verdicts | unit |

**v1.6.1 run (Tape, 2026-10-09).** Modelled unless marked **engine run**. Harnesses: `scripts/tape/tape_v15_joint.py` (signals, bots, ρ; 200 seeds × 8 quarters, 12 weekly + close signal; launches J ∈ {2, 3.3, 5, 8}% w.p. 0.5 per quarter; σ_sig 0.04 backlog/CB, 0.02 shipped revenue, iid per report as the spec says; unbacked hiring moves 0.5–4% of lnV w.p. 5% per signal, an assumption) and `scripts/tape/tape_v16_backlog.py` (faking, repayment, cancellations, escape channels). Both are written from the spec text, not from Quant's script.

- **Quant's script reproduced.** The v1.6 output and the `--v15` / `--v14` logs are identical byte for byte. My independent formulas give the same §N/§O numbers:
  - the faker keeps c_s × L × sold: 0.020–0.060% / 0.04–0.12% / 0.08–0.24% at L = 2.5 / 5 / 10%, with 40% sold;
  - break-even $0.0031–$0.1280 per $1 of fake backlog;
  - the honest §O case: $0 at 5.0% and $166.5k at 5.5%.
- **Round trips** (spread × volScale + 0.10%/side + impact):

| float cap | $10k | $250k | $1M | $25M |
|---|---|---|---|---|
| $50M | 2.26–2.99% | 3.28–6.14% | 4.55–10.09% | 14.7–41.6% |
| $500M | 1.31–1.59% | 1.63–2.59% | 2.04–3.84% | 5.26–13.8% |
| $5B | 0.71–0.81% | 0.81–1.13% | 0.94–1.52% | 1.95–4.68% |

- **Engine run: post-print share of a public lnV step** (`tg/scripts/tape-probe/postprint-drift.ts`, `enterSimMode`, seeds tape-01..30 × 5 stocks, 150 per J; twin method). In the price: **0.70 at the print** (live `jumpImmediate`), 0.79–0.86 at close D, 0.93–0.99 at close D+1, 0.98–1.03 at D+2.
  - A bot that buys after the print and exits at close D+1 captures 0.37J (J = 1.5%), 0.29J (3.3%), 0.26J (5%) and 0.23J (8%).
  - So any scheduled public step ≳ 2.8% beats a $10k round trip at $5B.
  - Under v1.5+ a launch's backed backlog lands as one step (v1.4 capped each step at 1.5%). Shipped-revenue steps were never capped.
- **`signal_joint_v15`, rules v1.5 = v1.6.1 for signals.** Mean **net** per trade taken (engine shares: print 0.70, D+1 0.96):

| bot | $5B $10k / $250k / $1M / $25M | $500M $10k | $50M $10k | verdict |
|---|---|---|---|---|
| weekly-carry | +0.57% / +0.38% / +0.14% / −1.76% | −0.39% | −1.53% | **FAIL** ($5B). Carry exists only from unbacked hiring moves: G18 |
| lag-aware (all legs) | +1.04% / +0.98% / +0.93% / +0.71% | +0.88% | +0.50% | **FAIL** |
| · shipped-revenue noise leg | +1.11% at $10k (v1.4: +1.11%) | +0.86% | +0.74% | FAIL, pre-existing: G20 |
| · backlog/CB noise leg (α = 1) | −1.37% (−0.15% with backlog up to 40 gd) | −0.95% | n/a | PASS (margin narrows with very large backlogs) |
| · carry leg | +0.84% | +0.44% | n/a | FAIL (G18) |
| hold-to-close | +1.52% / +1.33% / +1.10% / −0.79% | +0.45% | −0.54% | **FAIL** (G18) |
| re-anchor bot (`reanchor_public_edge`) | −1.20% / −1.39% / −1.62% / −3.49% | −1.04% | −2.81% | **PASS** |
| post-print bot (`signal_postprint_drift`, engine shares) | +0.54% / … / +0.53% / +0.70% | +0.59% | +0.75% | **FAIL** (v1.4 also +0.50%; v1.5 launch steps add to it): G21 |

  - **ρ** (`rho_residual`). α = 1 doesn't blow the band. v1.4 → v1.5 changes ρ by ≤ 0.003 (median 0.567 → 0.566, p90 0.817 → 0.820 with unobserved WC 3% and costs 1% of Rev_q; with no unobserved costs, median 0.314 → 0.315).
    - The **absolute** level is set by the 2% shipped-revenue noise against the quarterly fundamental move. In this model ρ stays above 0.15 unless the quarterly fundamental sd is ≥ ~13%.
    - BLOCKED on the engine's real quarter-to-quarter variance; at risk (G22).
  - **Levers tested:**
    - **Persistent noise** (one ε per component per quarter): the lag-aware bot goes from +1.04% to **−0.72%** and the revenue leg to −0.87%, so both PASS. ρ is unchanged (0.573).
    - Carry, hold-to-close and post-print are unaffected by it.
- **`signal_fake_ev` (v1.6.1, same-schedule twin, after repayment, net of production cost, 200 seeds per sector, EV/S 1–4, 23–40% sold).** Net per $1 of fake backlog:

| mechanism | software | pharma | food | consumer | industrial | security |
|---|---|---|---|---|---|---|
| refuse to ship real list orders | −$0.72 | −$0.58 | −$0.28 | −$0.35 | −$0.17 | −$0.33 |
| lapse overflow the honest twin would serve | same as above | | | | | |
| `freeOverflow` (demand the twin couldn't serve either; cost ≈ 0) | +$0.042 | +$0.076 | +$0.027 | +$0.060 | +$0.039 | +$0.033 |
| −30% orders, separate book (rule a) | +$0.038 | +$0.062 | +$0.006 | +$0.029 | −$0.011 | +$0.012 |

  - Refuse-to-ship and lapsed overflow: faker > honest in 0% of seeds. `freeOverflow`: 100% of seeds, keeping c_s × lift.
  - The −30% row needs NPC demand at −30% without repricing shipped units. With one list price per product (§2) the cost is far above the threshold.
  - `hireBurst`: headcount is cost-only, so lift ≤ 0 → PASS.
  - `planTimed`: same as the founder's own sales.
  - **Verdict: PASS for every founder-sold fake with a real cost.** `freeOverflow` keeps c_s × L × sold, which Ledger accepted as the residual.
  - L is uncapped, so that residual is 0.24% of mcap per quarter at L = 10% and 0.72% at L = 30% (industrial, 40% sold). Whether free overflow exists depends on G15.
  - The `backlogWeightFallback` (0.25) contingency is not triggered. It would halve these numbers and does nothing for G16, G18, G20 or G21.
- **Hunts:**
  - **(a) Staying under the normal rate.** X charges every unit of company non-conversion, so a fake "under the rate" is still charged. The only free allowances are:
    - c_s of the fake's own lift: industrial is best at a fixed L (6%), pharma per $ of fake backlog (c_s·cm 2.8%);
    - the `floor(c_s·qty)` slack, since the allowance is c_s·ℓ_tot but the NPCs cancel less. It is up to the **whole c_s** for orders of qty < 1/c_s (50 units in software, 17 in industrial) and 0–0.31 pt at qty 260. On Quant's §O quarter (gross lift 33.33%, c_s 5%) that could be up to 1.67% of lift with no charge (G17).
  - **(b) Sellers outside the covered set** (v1.6.1 counts alliance members). A non-covered friend or an undeclared alt shorts at the lifted price and covers after the reversal. Nothing is repaid. Net at $5B:

| lift L | $1M | $25M |
|---|---|---|
| 5% | +3.5–4.1% ($35–41k) | +0.3–3.0% ($81–761k) |
| 10% | +8.5–9.1% | +5.3–8.0% ($1.33–2.01M) |

    - The founder can get the same result without selling a share, by shorting §6.5 derivatives (futures, perps, puts) in the window: S_k counts stock sales only.
    - He can also move his cash to an alt before the filing. Collection never chases a third player, and the personal debt has no stated consequence.
    - **The backstop catches:** an account > 0.5% of ADV ($100–200k at $5B) with z > 2 on a position opened while the founder's window was **closed**. Odds rise with z, ≤ 60% per case, and the verdict needs court evidence.
    - **It misses:**
      - positions opened in the open window;
      - positions split under 0.5% of ADV ($1M over 10 friends);
      - derivatives, if "position in the stock" excludes them;
      - cash already moved before the filing.
    - It never claws back the gain (G16).
  - **(c) Timing.** S_k runs from the order's first signal to the open tick of the filing where the order **resolves**. So a fake still open at a filing (confirmed in filed CB) is charged one quarter later, on sales in both windows: no escape, only a one-quarter collection delay, which helps the cash stripping in (b).
    - The gap is the filing tick itself. The re-anchor prints only 0.70 at once (engine), and a plan fill at the open tick of filing day F is "up to the filing's open tick" with no stated order. If it fills before the re-anchor and is excluded, it sells ≤ 2% of shares at the full lift (G19).
    - Fakes that convert late are real sales at their own contribution margin, so no edge.
  - **(d) Honest charge.** `npc_cancel_deterministic` is deterministic: floor(c_s·qty), no rng. Rounding always favours the company, so NPC noise never charges an honest founder.
    - Company non-conversion from capacity shortfalls, in a modelled honest run with a founder who adds Ops at U > 0.95 (200 seeds × 8 q): > 0 in 0–0.3% of quarters, mean ≤ 0.05%. It happens only if demand above 1.15 × cap is booked as orders. If it is lost (§4 today), it is 0.
    - **PASS (modelled).** The order book itself is undefined (G15).
  - **(e) Joint check under v1.6.** v1.6 doesn't change the signal dynamics; `backlogLift` makes the backlog step exactly public. **FAIL**, from the legs in the table above. None comes from the v1.6 rules.

## 3. Trading window, entry points, instruments, CEO freeze (§6.1, §6.5, §9.1)
**Covered set:** founder, owner set (linked alts, treasury), alliance members (Ledger; card text "you, your alliance and accounts you control").
**Who has a window (Ledger, v1.3 §6.1, Q25):** it starts with the company's **first quarterly filing**. A Late-tier private company is covered on the sector fund and its derivatives only; the ≥ 5% index clause is empty until listing. Seed and Growth companies have none.
**Calendar fixture** (Velvet §13): close 504 → F 507 → open 509…528 → `windowClosing` 524 (F + 17); close 567 → F 570 → open 572…591 → warning 587; close 630 → F 633 → open 635…654.

| id | check | pass | layer |
|---|---|---|---|
| `window_boundaries` | founder own-stock market buy at the **last tick of F + 1**, **first tick of F + 2**, **last tick of F + 21**, **first tick of F + 22**; also at the c close tick and on F | refused / accepted / accepted / refused; c and F refused; reject `{ code: 'closedWindow', untilDay }` | unit |
| `window_untilday` | refusal on any closed day | `untilDay` = next F + 2 (509, 572, 635 in the fixture); never past; equals the ticket's N | unit + e2e |
| `window_schedule_public` | `CompanyPublic.window { open, opensDay, closesDay }` | matches the engine every tick; the schedule depends only on the calendar | unit |
| `window_scope_by_tier` | Seed, Growth, Late-private-before-first-quarterly-filing, Late-private-after, Listed | no window / no window / no window / window on the sector fund + its derivatives only / full §6.5 list from the listing tick | unit; WAIT-INSTR for ETFs |
| `window_late_gap` | Growth → Late promotion mid-quarter: founder trades the sector fund between promotion and the first quarterly filing | allowed (no window yet, Ledger Q25); edge on that trade ≤ RT cost in the 200-seed run | bal |
| `closed_window_bypass` | one covered order in the closed period through **each** path: Broker `Enter`, Broker click, launcher pre-fill then `Enter`, every `__tg.e2e` order hook, AI Lab agents on the founder account, harness `placeOrder`, contract settlement, buyback program, order amend | 0 accepted, 0 fills (Quant's id) | unit (each entry point) + e2e (UI paths) |
| `closed_window_fills` | non-plan covered orders while closed: limit, stop, stop-limit and GTC placed in the window and resting at the last tick of F + 21; a stop whose trigger prints on F + 22; an amend; a hand-injected open order in a save; treasury orders | 0 fills on c+25 … c+4 except `runPlans` orders (Quant's id) | unit |
| `window_close_cancel` | after the last tick of F + 21 | every non-plan covered order is cancelled; plan orders untouched; exactly one founder Wire line "Trading window closed: N orders cancelled; reopens day D", N exact | unit + e2e |
| `window_close_line_private` | that line, and the `windowClosing` event | 0 occurrences in the public Wire, `CompanyPublic`, other players' event streams and Wire views, `explainMove`, or another save | unit + e2e (Ledger Q7) |
| `stacking_rule` | Forge's rule. Fixtures: unlocked long 100 + two resting sells of 100 (no short license); post-lockup founder at the 2%/gd cap with stacked sells; a plan sell plus a manual in-window sell on the same day; cash limit with two buys | 0 placements or fills that flip sign or exceed a limit; refused `{ code: 'stacking' }` at placement **or** cut to what fits at fill; re-checked when an earlier order fills first (Quant's id) | unit |
| `window_save_edit` | hand-edited save: (a) open covered order injected while closed; (b) window/filing days edited; (c) `lockedUntilDay` = 0; (d) `window.covered` edited | (a) cancelled or refused at fill; (b) the window is recomputed from the frozen filing schedule; (c) recomputed from `ipoDay`; (d) recomputed; money and positions otherwise unchanged | unit + e2e |
| `window_ticket_locked` | Broker on a covered ticker while closed | `window-closed-ticket` visible, text exactly "Window closed until Day N" with N = `untilDay`; Buy/Sell `aria-disabled`, no click handler; `Enter` → order diff empty; `stacking` shows "This order plus your open orders would exceed a limit"; `lockup` shows "Sells locked until Day N" | e2e, 1440 + 390 |
| `window_card_text` | window card for a player in an alliance | names "you, your alliance and accounts you control" | e2e |
| `window_noncovered_free` | unlinked account, NPC, founder on non-covered assets while closed | accepted as normal | unit |
| `ceo_change_filing` | `changeCEO` on day A | public Wire filing "CEO change effective day A + 10" on A; can't be withdrawn; effective at the open tick of A + 10; ex-CEO can't return for 252 gd; only a > 50% holder can call it | unit, PROPOSED(§9.1) |
| `ceo_exit_freeze` | departing CEO's covered set trades stock / §6.5 instruments on A, A + 31, A + 32, **inside an open window** | refused `{ code: 'ceoExitFreeze', untilDay: A + 32 }` through A + 31 (every entry point); allowed on A + 32 only if the window is also open; plans committed before A still run | unit, PROPOSED(§9.1) |
| `resign_pump_ev` | run down, buy in window, resign; plus a plan variant (sell plan committed ≥ 63 gd before A, minSellPrice set for the expected pump; v1.4 has no buy plans) | mean P&L after fees ≤ 0, 200 seeds | bal |
| `tender_price_floor` | scripted attacks: first net short on day x; a one-day reduction of 0.50% vs 0.51% of float; neither (announcement − 63) | T0 = earliest trigger, exact; floor = 1.2 × 30-gd VWAP ending T0 − 1 | unit, DEFERRED, PROPOSED(§9.2) |

**Instruments (§6.5).** Each runs buy, sell, short and cover in the window (accepted) and while closed (refused), plus plan orders on each while closed (accepted):
| id | instrument | closed-period rule | status |
|---|---|---|---|
| `inst_stock` | own stock, every side | refused | BUILD (short side WAIT-INSTR) |
| `inst_stock_derivs` | options, futures, perps on the stock | refused | WAIT-INSTR |
| `inst_sector_etf` | sector ETF, every order including reductions | refused; also for Late-private founders | WAIT-INSTR |
| `inst_sector_etf_derivs` | derivatives on the sector ETF | refused | WAIT-INSTR |
| `inst_index_weight_boundary` | other index ETF at weight 4.99 / 5.00 / 5.01% | allowed / **refused** / refused | WAIT-INSTR |
| `inst_weight_frozen` | weights snapshotted at the **listing tick** (until the first F + 21; PROPOSED §13 Q23) and then at the **close tick of F + 21**; drift 4.9 → 5.2% and 5.1 → 4.8% while closed, no rebalance; then a rebalance while closed | list unchanged until the rebalance; updates on the rebalance tick | WAIT-INSTR |
| `inst_broad_etf_free` | broad index < 5% | allowed at all times | WAIT-INSTR |
| `inst_list_stored` | `state.companies[id].window.covered` (and `CompanyPublic.window.covered`, PROPOSED §13 Q29) | equals the computed list; a hand-edited save is recomputed | unit |


## 4. Window warning, plans, buybacks, two-way edge (§6.1, §5.2)
| id | check | pass | layer / status |
|---|---|---|---|
| `window_closing_day` | `windowClosing` per window | exactly once at the **open tick of F + 17** (524, 587, 650 in the calendar fixture); payload `{ kind: 'windowClosing', companyId, closesDay: F + 21, reopensDay: F' + 2 }` exact | unit |
| `window_closing_every_window` | 8 quarters × 200 seeds | 0 windows close without the warning at F + 17 | bal |
| `window_closing_outcome_blind` | twins with good vs bad QTD | payload and timing byte-identical | unit |
| `window_closing_banner` | founder at F + 17 (Day 587 in Velvet's mock) | `company-window-toast` once, and `company-window-notice` with exactly "Window closes in 5 days", the covered list and the open covered orders (`company-window-open-orders`); absent for a non-founder | e2e |
| `window_closed_event` | founder-only `windowClosed { companyId, cancelledOrders, reopensDay }` after the last tick of F + 21 | fires once; `cancelledOrders` = the cancelled set; never in public streams | unit, PROPOSED(§13 Q29) |
| `window_two_way_edge` | informed founder bot trading in the window on private QTD numbers (`founderCompanyView.quarterToDate`), own stock and sector ETF, entries every day F + 2 … F + 21. **Gains:** buy/short, exit F' + 21. **Losses avoided:** sell/cover an existing position. Baseline: the same trade at the first tick after the newsPrint of the filing that publishes the info. Extra legs: (a) the **treasury buyback** filed on F + 1 using QTD at F + 1 (Ledger Q24 proof); (b) the founder schedules a **product launch inside the window** and trades before announcing it; (c) buys are in-window only now (sell-only plans), so the buy leg is the whole founder buy side | each leg: gains ≤ RT cost **and** losses avoided ≤ RT cost, mean and median, 200 seeds; p95 reported. If it fails, recommend a per-day size cap in the window | bal (Quant's id) |

**Plan rules under test (v1.4 §6.1):**
- Plans are sell-only (`planSellOnly`). Escrow = **locked shares only**.
- `minSellPrice` is required and immutable.
- Skips are `volume | price | cap | halt`; ends are `completed | terminated | legal | tender`. None of them is a breach.
- Public: plan exists + `{ fromDay, toDay }`, plus skip and end day + reason. Every founder trade in the own stock or its derivatives is filed on d + 1 with side, size and day.

**Ban calendar** (fail-safe only; `breach_bars_plans` runs with an **injected** breach). Quarter Q = days c_prev + 1 … c; untilDay = the last day of the 2nd full quarter after the breach quarter:
| breach day | breach quarter | untilDay | refused | allowed | effective ban |
|---|---|---|---|---|---|
| D693 (last day, = close) | 631–693 | 819 | D819 | D820 | 126 gd |
| D694 (first day) | 694–756 | 882 | D882 | D883 | 188 gd |
| D700 (Ledger example) | 694–756 | 882 | D882 | D883 | 182 gd |
| D756 (last day, = close) | 694–756 | 882 | D882 | D883 | 126 gd |
| D757 (first day) | 757–819 | 945 | D945 | D946 | 188 gd |

| id | check | pass | layer / status |
|---|---|---|---|
| `plan_sell_only` | `commitPlan` with side `buy`, `short`, `cover`, `''`, `'SELL'` and a junk value via UI, JSON hook and AI agent | `{ code: 'planSellOnly' }`, nothing locked, state unchanged; 0 non-sell plan orders across 200 seeds | unit + e2e (Quant's id) |
| `plan_immutable` | min(days) − committedDay = 62 / 63 / 64; then edit/cancel via UI, `__tg.e2e`, AI Lab and a hand-edited save (incl. editing `minSellPrice` or the locked qty) | `{ code: 'planTooSoon', earliestDay: committedDay + 63 }` / accepted / accepted; every edit/cancel → `planImmutable`; a hand-edited save restores the plan and its lock | unit + e2e |
| `plan_limits` | a 3rd live plan (test on the 2nd plan's last day and the day after); a non-covered instrument; a sell day at lockupEnd − 1 vs a first day at lockupEnd | `planLimit` / then accepted; refused; `planInLockup` / accepted | unit |
| `plan_min_price_required` | commit without `minSellPrice`, with 0, negative, NaN | refused | unit |
| `plan_floor_cap` | `minSellPrice` = 0.80 × commit-day close; one price tick above; intraday commit (uses the previous close); every entry point | accepted / `{ code: 'planFloorTooHigh', maxFloor }`, nothing locked / same bound from the previous close | unit (Quant's id) |
| `plan_price_skip_hold` | shares unsold on `price` skips vs on `volume`/`cap`/`halt` | price-skipped stay locked (unsellable, unpledgeable, not lendable) through end day + 63, released at the first tick of end day + 64; others released at the end tick | unit (Quant's id) |
| `plan_unfunded_shares` | unencumbered = need − 1 / = need; shares locked by another plan, pledged or lent don't count; lockup shares do | `{ code: 'planUnfunded', shortfall: 1 }` / accepted | unit (Quant's id) |
| `plan_no_cash_escrow` | cash and spendable cash before/after commit and on every plan day | identical to the cent | unit (Quant's id) |
| `plan_locked_shares` | after commit; on every entry point (Broker, launcher, `__tg.e2e`, AI Lab, contract settlement, P2P transfer, pledge, lend), at placement **and** fill | locked = Σ qtyPerDay; sellable = qty − locked; a manual sell of qty − locked + 1 is refused or cut; transfer, pledge and lend of locked shares refused | unit + e2e (Quant's id; replaces `escrow_spendable`) |
| `plan_margin_untouchable` | margin call and forced liquidation on an account with locked shares | locked shares add 0 to collateral; 0 liquidation fills on them; no `margin` reason exists (type check) | unit (Quant's id; replaces `escrow_margin_untouchable`) |
| `escrow_counts_networth` | locked vs unlocked | net worth, peak and rank identical (locked counts at the §5.1 mark) | unit |
| `plan_exact_fill` | `runPlans` over 8 quarters | plan order placed at the open tick **before** any other order of that account in that instrument; through `placeOrder`, shared tally, 3× ADV cap; fill = min(qtyPerDay, what fits); 0 carry | unit |
| `plan_skip_volume` | the 3× ADV cap clips a plan day | sells what fits; public `planSkipped { day, reason: 'volume' }` with no size | unit |
| `plan_skip_price` | open-tick mid = `minSellPrice` − 0.01 / = `minSellPrice` / + 0.01 | 0 sold, `reason: 'price'` / sells / sells; no breach | unit (Quant's id, v1.4 meaning) |
| `plan_skip_cap` | post-lockup plan day with qtyPerDay > 2% of shares out; plus a manual in-window sell the same day | the plan sells first up to the 2% room, the rest `reason: 'cap'`; the manual sell gets what's left of the cap (`stacking`) | unit (Quant's id) |
| `plan_skip_halt` | halt over the whole plan day; partial-day halt | 0 sold, `reason: 'halt'`; sells only in open ticks, `'halt'` for the rest | unit (Quant's id) |
| `plan_skip_reasons_closed` | every skip, 200 seeds × all fixtures | reason ∈ {volume, price, cap, halt}; 0 silent skips; 0 carry | bal (Quant's id) |
| `plan_end_terminated` | delisting (EV < $10M review), take-private, own-company default | `planEnded { reason: 'terminated' }` on that tick; unsold locked shares released; no breach filing, no `planBanned` | unit (Quant's id) |
| `plan_legal_schedule` | clawback, court order, garnishment, personal bankruptcy seize locked shares (full and partial) | seized shares never become freely sellable; the clearing account sells only on the remaining plan days at ≤ `qtyPerDay` under the same caps and floor; proceeds to the creditor up to the claim, surplus to the founder; full → `planEnded { reason: 'legal' }`, partial → clearing shares sell first; leftovers to the creditor at end day + 63; clearing fills filed d + 1; no breach | unit (Quant's id; replaces `plan_end_legal`) |
| `claim_covered_creditor` | claim on locked shares by an owner-set alt, the treasury, an alliance member; the same claim by an outside creditor | `{ code: 'claimCoveredCreditor' }`, 0 shares move, plan unchanged, claim stays valid on other assets / goes ahead under `plan_legal_schedule` | unit (Quant's id) |
| `plan_legal_escape` | **hunt:** staged debt to an alt, an unlinked friend or an alliance member, then default/garnish; staged judgment; personal bust | creditor never receives freely sellable shares; founder + creditor P&L ≤ keeping the plan, 200 seeds | bal; **predicted PASS under v1.5** (schedule kept, covered creditors refused); an unlinked friend only gets plan-schedule proceeds |
| `plan_end_tender` | tender of locked shares, all vs partial | partial refused; all tendered → `planEnded { reason: 'tender' }`; pro-rata remainder released | unit (Quant's id) |
| `plan_tier_drop` | Late private drops below Late mid-plan; the founder leaves the covered set mid-plan (CEO change, leaves alliance) | the plan runs unchanged to its end; window rules follow the current tier | unit (Quant's id) |
| `plan_tier_change` | Late private → Listed mid-plan (sector-ETF plan) | plan unchanged; stock joins the covered list at the listing tick | unit |
| `plan_split` | 2-for-1 and 1-for-3 mid-plan | locked, qtyPerDay, remaining ×2 and `minSellPrice` ÷2; reverse: ÷3 rounded down, fractional locked shares paid as cash at the split price; total value conserved to the cent | unit (Quant's id; DEFERRED until splits exist, X4) |
| `plan_dividend_free_cash` | dividend on locked shares | lands in spendable cash to the cent, unlocked | unit (Quant's id) |
| `plan_no_breach_path` | 200 seeds × all fixtures incl. every skip and end | 0 breach filings, 0 `planBanned`; static check: no production code path emits `planBreach` | bal + lint (Quant's id) |
| `breach_bars_plans` | **injected** breach on each day of the ban calendar | public breach filing (exists, day, "plan breach", no size); `{ code: 'planBanned', untilDay }` through untilDay, accepted on untilDay + 1 | unit (fail-safe; dead code in v1.4, see G11) |
| `breach_ban_timing` | injected breach on every day of a quarter | report 126–188 gd; accepted by Ledger (rule 8); observation only | unit |
| `plan_public_disclosure` | commit, fill, skip, end | public sees `{ fromDay, toDay }` at commit and day + reason on skips and ends; total size, qtyPerDay, day list, `minSellPrice`, remaining qty never in `CompanyPublic`, the Wire, `explainMove` or another player's DOM | unit + e2e (Quant's id) |
| `insider_filing_next_day` | founder trades on day d: own stock (plan fill and in-window), an option/future/perp on it, the sector ETF, an index ETF; trades by an alt, the treasury and an alliance member | own stock + derivatives filed at the open tick of d + 1 with side, qty and day; nowhere public on d; ETF/index trades and other covered accounts' trades never filed; no pre-announcement event exists | unit + e2e (Quant's id) |
| `plan_size_inference` | public-information bot estimates plan total from next-day filings × the public date range | report estimation error; observation (Quant accepts that the size is estimable, not known) | bal |
| `plan_min_price_option` | **hunt:** `highFloor` (now capped at 0.80 × close), `pumpToCross`, `tankToSkip` (a > 20% drop to skip, shares then held 63 gd more) | founder P&L − a plan floored at 0.80 × close ≤ RT, 200 seeds; share of plans that never sell | bal; **predicted PASS under v1.5** (G12 closed) |
| `plan_fake_timed` | founder fakes forward signals timed to plan days in the closed period (plans fix days, but faking is decided later) | gain on plan fills from the lift ≤ the cost of producing the fake, 200 seeds (part of `signal_fake_ev`) | bal |
| `plan_offset_in_window` | the founder pre-sells in the window instead of a later plan day, on bad QTD | net edge vs no offset ≤ RT cost | bal |
| `plan_edge` | informed founder commits plans with what it knows on the commit day | edge ≤ RT cost vs the same plan committed uninformed, 200 seeds | bal |
| `plan_alt_offset` | **online hunt:** an alt trades against a plan whose size it can estimate from filings | noted; surveillance must flag linked alts | bal (online) |

**Buybacks (§5.2):**
| id | check | pass | layer / status |
|---|---|---|---|
| `buyback_window` | `buybackProgram` filed on F, F + 1, F + 2; schedule with any day outside F + 2 … F + 21; edit after filing | refused / accepted / refused; `closedWindow`; `{ code: 'buybackImmutable' }`; nothing executes or carries after the last tick of F + 21 | unit (Ledger Q24) |
| `buyback_public_filing` | accepted program | on the public Wire on F + 1 and in `CompanyPublic.buybackPrograms`, with size and daily schedule | unit |
| `buyback_shared_tally` | treasury clip after a founder clip, same tick and side | pays f(after) − f(before) on the combined owner-set tally; ≤ 1% float/gd; 3× ADV per-tick cap | unit |
| `buyback_cash_source` | buyback fill | treasury cash falls by notional + fees to the cent; founder personal cash unchanged | unit |
| `buyback_guards` | covenant breach or cure; ND/EBITDA after at 2.49 / 2.50 / 2.51 | refused; accepted / accepted / refused | unit |
| `buyback_no_owner_cross` | treasury order vs founder/alt order | 0 fills (`self_match`) | unit |

**Plan UI (Velvet `velvet-company-app.md` v1.3 §6.3, §10, §13 items 6–6c), e2e at 1440 and 390:**
| id | check | pass |
|---|---|---|
| `plan_reject_copy` | trigger each refusal | Velvet's exact copy with the engine's numbers: `planTooSoon` (earliestDay), `planLimit`, `planInLockup` (lockup end day), `planUnfunded` "Not enough free shares to reserve: {shortfall} short.", `planImmutable`, `planBanned` (injected; untilDay and breach day); `planSellOnly` has no UI path (no buy/short/cover control exists, asserted) |
| `plan_form_min_price` | New plan form | a required `minSellPrice` input exists and is sent at commit (**Velvet v1.3 has none: V1**) |
| `plan_commit_hold` | `company-plan-commit` | commits only after a full 1.2 s hold (pointer or held `Enter`); release at 1.19 s → 0 plans; committed row has no edit or cancel control |
| `plan_pills_locked` | after commit | the row and Portfolio show "Locked · PLAN" with the locked share count and "Sellable" = shares − locked; net worth unchanged; no locked-cash line anywhere |
| `broker_sellable_vs_locked` | Broker sell ticket for a founder with a plan | "Sellable" and "Locked · PLAN" (`shares-plan-locked`) shown separately; qty input caps at sellable; typing above it → capped, 0 orders over |
| `plan_skip_copy` | each skip and end reason | founder row shows Velvet's private line (may include "120 of 300 filled"); a **second player** sees only day + reason in plain words, no size (G7 fixed in Velvet v1.3); the reason list is exactly volume / price / cap / halt and terminated / legal / tender (**Velvet v1.3 still lists `margin` as a breach reason: V2**) |
| `plan_public_wire_line` | Wire "Plan filed" line | shows founder + "filed a sell plan · D{from}–D{to}" only |
| `insider_filing_line` | Wire "Insider filing" line | "{company} founder sold {qty} {ticker} on D{d}" appears on d + 1, never on d |
| `plan_breach_card` | **injected** breach only | public filing row and `company-plan-blocked` until untilDay + 1; not reachable in normal play (G11) |
| `plan_screens_by_tier` | Seed and Growth founders | no window card, banner, `window-closed-ticket` or plan screen |
| `clawback_warning_ui` | every lend-to or contract-with-a-player-company confirm | `clawback-warning` above the confirm control with the counterparty name and Quant's sentence; separate confirm step; no `Enter`-only path |

## 5. Related-party revenue and cash (§6.3, §6.4)
| id | check | pass | layer |
|---|---|---|---|
| `rp_no_sale_api` | static audit of `src/engine/company*`; runtime: every sale ledger entry's counterparty is NPC demand of `D_m` | 0 exceptions | lint + unit |
| `rp_roundtrip_two_cos` | player owns A and B; B leases/licenses from A at fair value, +9.99%, +10.01%; A tries to "buy" B's products | no product path; band accepted / refused with +30 surveillance; A's `Rev_u`, `NI_adj`, s, filings, `D_m`, lnV and V_engine identical to a no-contract twin on the income side | unit |
| `rp_band_exact` | −10.00% / +10.00% / ±10.01% of appraisal | accepted / accepted / refused (+30 each) | unit |
| `rp_any_player_other_income` | contract income from an **unlinked** player account and an undetected alt's company | booked `otherIncome`; excluded from `Rev_u`, `NI_adj` and s | unit, PROPOSED(§13 Q11) |
| `rp_t1_roundtrip` | company ↔ the player's T1 business, both directions | same exclusions | unit; stage-0 variant PENDING-MATHIS |
| `rp_consolidation_eliminates` | player at 50.00% vs 50.01% of A and B | standalone vs consolidated value with intercompany items eliminated; each filing still shows `relatedParty` lines | unit |
| `rp_costs_count` | costs paid to related parties | count in E* | unit |
| `rp_ipo_excluded` | IPO price with and without related-party / other income | P_IPO identical to the cent | unit |
| `related_party_revenue_in_Rev_u` | over every bal run | 0 | bal |
| `revenue_without_cash_lnv_effect` | twin with receivables +100% and channel inventory stuffed | `E* = min(NI_adj, OCF − capex_maint)` unchanged ⇒ identical lnV; OCF leg of s unchanged | unit |
| `no_hidden_strategy_leak` | twins with identical public fields and different private state | bitwise identical lnV | unit |


## 6. Bankruptcy, clawback, dividends, guarantees (§5.3)
Fixture: scripted payments on day d before a forced default on D (uncured covenant breach, missed payment, or cash < 0 for 5 gd). Recipients: founder, linked alt, alliance member, ≥ 10% holder, an **outside** (non-insider) player, an NPC. Covered window: D − 63 ≤ d < D.
| id | check | pass | layer |
|---|---|---|---|
| `clawback_boundary` | dividend to the founder at D − 64, D − 63, D − 62, D − 1, D | not clawed / clawed / clawed / clawed / not covered | unit |
| `clawback_any_player` | the same dividend to each recipient type | clawed from every **player** recipient (no alt detection); NPC not clawed | unit |
| `clawback_insider_loans` | repayments of loans from the founder, a linked alt, an alliance member, a ≥ 10% holder and a player CEO, on schedule and with terms signed long before D − 63 | **always** clawed (insiders get no safe harbour) | unit |
| `clawback_safe_harbour_64` | outside lender and outside contractor: scheduled repayment / market-price contract (within ±10%) signed on D − 65, D − 64, D − 63 | not clawed / not clawed / **clawed** (only day ≤ D − 64 qualifies, Ledger rule 5) | unit (Quant's id) |
| `clawback_non_ordinary` | outside lender: prepayment, accelerated schedule, terms amended on D − 30, above-band price | clawed | unit |
| `clawback_insider_either` | lender is an insider (≥ 10% holder, alliance, CEO) at signing only; at payment only; at both; at neither | clawed / clawed / clawed / safe harbour applies (insider at signing **or** payment, Ledger rule 6) | unit (Quant's id) |
| `clawback_covered_types` | dividends; insider loan repayments; salary above the cap (excess only); related-party payments to player entities; outstanding company loans to a player | each clawed with a reason code and the original payment id | unit |
| `clawback_not_covered` | buyback fills against the book; NPC payments; NPC wages | 0 clawed | unit |
| `clawback_first_recipient` | the recipient passes the cash P2P to a third player before D | the first recipient owes the **full** amount: the engine takes their cash down to the floor and books the rest as **their** personal clearing-house debt; the third player is never touched | unit (Ledger) |
| `clawback_order_and_cap` | shortfall S, payments totalling T > S | recovery = min(S, T), newest first; Σ flows = Δcash | unit (floor's T1 part PENDING-MATHIS) |
| `salary_cap_exact` | player salary at max($50/gd, 1% TTM rev / 252) ± $0.01; TTM revenue falls at the next filing | +$0.01 rejected; above the new cap → auto-cut from F + 1 with founder event `salaryCut`; 0 clawback from drift | unit; the cut is PROPOSED(§13 Q27) |
| `limited_liability` | default without a guarantee | personal assets untouched except clawback; creditors recover 20–60% from company assets; equity → 0, delist | unit |
| `personal_debt_survives` | personal loan, margin and a called guarantee | owed in full after the wipe | unit |
| `pg_rate_exact` | guaranteed loan rate | r_guaranteed = **0.75 · r_debt** per gd to 1e-12 for every rating A…CCC and with the +0.05%/gd breach penalty; no path prices a guaranteed loan below 0.75 · r_debt | unit |
| `pg_called` | default with a guarantee | becomes personal debt to the cent | unit |
| `pg_consequence_confirm` | Finance › Borrow › Sign | `company-guarantee-amount` ("you personally owe up to $X plus unpaid interest") shown before `company-guarantee-sign` is enabled; `company-guarantee-ack` required; no single-click or `Enter`-only path signs | e2e |
| `dividend_rule_reject` | retained earnings after = 0; cash after = 21 gd opex + COGS − $0.01; open cure; dividend = TTM FCF + $0.01; plus legal ones at each exact limit | 100% rejected `dividend_not_permitted`; at-limit legal ones accepted | unit |
| `dividend_distress_flag` | permitted dividend in a quarter with a net debt increase | public distress flag on the same tick; value-pool reaction ≤ 0 | unit |
| `dividend_pump_ev` | above-FCF payouts (where legal) for 2 quarters, then in-window sells after lockup | mean P&L ≤ steady payout, 200 seeds | bal |
| `bankruptcy_extract_ev` | max legal self-payment, then default, vs a twin that doesn't (incl. a locked-shares variant: `plan_end_legal`) | ends no richer (NW incl. debts), 200 seeds | bal |
| `bust_after_company_default` | company default → personal bust → fresh start | clawback debt survives the fresh start; `bust_farm_option_value` ≤ $5,000 per 8 weeks with the company path; `bust_fresh_start_per_window` ≤ 1 | bal |
| `restricted_cash_company_accept` | `AD_GRANT` / `FRESH_START` cash funding founding, an injection or a round inside the restricted window | 0 accepted | unit + e2e |

## 7. IPO and filing tiers (§5, §5.1)
| id | check | pass | layer |
|---|---|---|---|
| `filing_tiers` | Seed, Growth, Late private, Listed over 4 quarters | Seed/Growth: one **yearly banded registry entry** only; Late private: **full quarterly statements** (hashed, filed at c + 3); Listed: quarterly + signals | unit |
| `ipo_requires_3_filings` | `requestIPO` with 2 vs 3 filed **quarterly** statements (registry entries don't count), all other criteria met | refused / accepted | unit |
| `ipo_eligibility` | EV $49.99M / $50M; owner R2 / R3; S4+ conviction 8 weeks − 1 gd ago; covenant in cure | refused / accepted pairs exact; no 5-sector rule for operating companies (§12 #2) | unit |
| `ipo_price_formula` | P_IPO = 0.9 · V_engine / shares_post | exact to the cent; priced at the **latest filing before `requestIPO`**, with eligibility rechecked then; shown 1 gd ahead | unit, PROPOSED(§13 Q16) |
| `ipo_float_bounds` | float 14.99 / 15 / 49 / 49.01% | refused / accepted / accepted / refused | unit |
| `ipo_primary_only` | listing tick | founder personal cash unchanged; treasury += proceeds − 5% fee to the cent; `company-ipo-no-cashout` reads "You cash out at the IPO: nothing" | unit + e2e |
| `ipo_founder_no_subscribe` | subscriptions from the founder, each linked alt, the treasury, alliance members | 0 allocations | unit; alliance PROPOSED(§13 Q19) |
| `ipo_alt_allocation` | owner set; accounts aged 6.99 / 7.00 days | 0 to owner set; < 7 days excluded; ≤ 5% of float per buyer; pro-rata exact | unit |
| `ipo_pop_to_allocatees` | day-1 pop | median ≤ d (10%), 200 seeds | bal |
| `ipo_pop_farm_ev` | online cluster of 10 unlinked accounts aged ≥ 7 d farming every pop | farm EV after costs reported; flag to Ledger if ≥ d per cluster | bal (online) |
| `ipo_lockup` | founder sell on listing + 167 / 168 gd, inside and outside the window | refused `{ code: 'lockup', untilDay }` / accepted **only** if the window is open (Q17 resolved: both rules apply), plus 2%/gd cap and 1 gd Wire notice | unit |
| `post_lockup_sell_path` | founder sells after lockup, manual and by sell plan, same day | ≤ 2% of shares out per gd total (plan first, then manual; overflow → `cap` skip); **no** pre-announcement event exists; filed on d + 1 with side, size and day (`insider_filing_next_day`); shared impact tally; NPC holders ≤ 1% per gd | unit + bal |
| `ipo_short_open` | shorting on listing + 2 / + 3 gd | refused / accepted | WAIT-INSTR |
| `ipo_rank_mark` | founder's rank mark the day after listing | = min(fair, 3-day VWAP) × (1 − whole-crowd exit cost of the full stake at 2%/gd); the pop raises it by ≤ 0 above fair | unit |

## 8. No-reveal, lint, links (§10a, §11; Velvet `velvet-company-app.md` §§10–12)
**Sentinels** (in every fixture here): quality q = 61.37, margin 0.4421, R&D split 0.4242, marketing 412,000.00, planned price 66.6601, draft plan qty 4,317, pBand [0.1234, 0.5678], live cash 98,765.43 (distinct from last-filed cash), QTD revenue 31,415.92, plan locked qty 70,800, plan qtyPerDay 1,234, plan `minSellPrice` 58.0137 and plan remaining qty 9,876 (v1.4: escrow is shares only, no cash sentinel).
| id | check | pass | layer |
|---|---|---|---|
| `lint_founder_view_isolation` | Forge's TS-parser isolation check (fe1d971: import, `import type`, export-from, `export *`, side-effect, dynamic `import()` incl. templates, `require`, `import = require`, both quotes; non-literal path fails), **transitive**, for `CompanyFounderView`, `CompanyFounderEvent`, `founderCompanyView`, `TradingPlan` internals, module `src/engine/company.ts` | 0 reachable from Broker, Wire, rivals, Research Desk, Portfolio, AI Lab, launcher, shell, or the "What the market sees" component (even though it sits under `src/app/company/**`) | lint |
| `lint_rule_canary` | ESLint `no-restricted-imports` entry; a canary in `src/app/broker/` importing `CompanyFounderView` | lint fails on the canary | lint |
| `founder_view_throws` | `founderCompanyView` for a non-founder | throws; no partial object | unit |
| `public_view_schema` | `publicCompanyView` JSON key set | exactly the `CompanyPublic` keys (snapshot incl. `window` (+ `covered`, PROPOSED Q29), `buybackPrograms`, `ceoChange`, `plans { fromDay, toDay }`, public `planSkipped` / `planEnded` with day + reason only, next-day insider filings, breach filings (injected only)); private key names absent, incl. `minSellPrice`, `qtyPerDay`, `remaining`, `locked` | unit |
| `public_view_sentinels` | sentinels vs `publicCompanyView`, signals, filings, Wire, `explainMove` | 0 matches | unit |
| `dom_no_private_fields` | (Velvet §12 item 1, folded in) as a **second player**, render every reachable route (Wire, Broker on the ticker, rivals list, own Portfolio, spectator views, launcher results, phone Recent, toasts, `document.title`, meta, `__tg.e2e` public slices) **and** the founder's own "What the market sees" side (`?market=1`) of every Company view; before and after F; private (each tier) and listed | 0 sentinel strings in `innerText` or any attribute; 0 elements with `data-private` | e2e |
| `public_cash_debt_label` | public view of a filer | shows "Cash · total debt" equal to the **last filing's** balance-sheet cash and debt, labelled with that filing's `filedDay`; the live cash and plan sentinels never appear | unit + e2e |
| `wtms_equals_public` | "What the market sees" | every `CompanyPublic` field rendered once and nothing else; values byte-equal to `publicCompanyView`; private rows read "Not filed" | e2e |
| `private_registry_only` | Seed/Growth company seen by another player | name, sector, cities, product names and prices, tier, headcount band, debt band, annual revenue band; nothing else | unit + e2e |
| `quality_score_display_only` | qualityScore = clamp(round(80 + 30·ln(q / Q_f)), 0, 100) | formula exact incl. clamps at 0 and 100; twins with q differing inside one rounded score give **different** shares (the share model uses raw q); a grep finds no read of qualityScore in `src/engine` share code | unit + lint |
| `company_links_no_state` | Velvet deep links `/company`, `/company/<overview\|products\|rd\|people\|operations\|marketing\|finance\|filings\|listing>`, `/company/finance/plan`, `/company/finance/borrow`, `/company/finance/borrow/sign`, `/company/filings/q8`, `?market=1` built in save A, opened with save B | B sees only B's company (or the "found a company" state); none of A's sentinels, ids or name appear; `formatRoute` carries no company id, qty, price or plan field; unknown or extra params ignored (extends `link_shows_own_save`, `link_carries_no_state`) | e2e |
| `company_route_locked` | `/company/*` below R2 | Quay home + toast "Company unlocks at Owner rank"; no window, no Company chunk fetched (extends `route_locked_never_opens`) | e2e |
| `company_title_clean` | `document.title` / meta on every Company route | no cash, margin, P&L or plan data | e2e |
| `explain_move_player_listing` | `explainMove` on a player listing | pool types only; nobody named | unit |
| `co_copy_simulated` | IPO, filing and investor screens | "Simulated market. Not financial advice." present; 0 hits on the `no_forecast_copy` banned list | e2e + grep |

## 9. No pay-to-win (§10b)
| id | check | pass | layer |
|---|---|---|---|
| `p2w_catalog_cosmetic` | audit of every real-money SKU | each is cosmetic (logo frames, dashboard theme); 0 SKUs touching demand, quality, odds, capital, filings, rank | lint/audit |
| `p2w_twin_identical` | twin worlds, one with every cosmetic owned | company state hash identical after 2 quarters | unit |
| `ads_no_demand_effect` | twin with rewarded-ad cash received | `D_m`, shares, quality and lnV identical; no "watch an ad to boost" anywhere in the Company app (DOM + copy audit) | unit + e2e |
| `p2w_no_random_paid` | company screens | 0 chance-based paid items | audit |

## 10. Balance (§7)
| id | check | pass | layer |
|---|---|---|---|
| `founding_dominance` | D_R = r_C / g_R for scripted founders at R2, R3, R4 | competent median ∈ [0.8, 1.3]; top decile ≤ 1.5; careless ≤ 0.5 (some lose money), 200 seeds | bal |
| `y_tier_calibration` | steady FCF / invested capital at fair share | within ±15% of 1.90 / 0.55 / 0.30 / 0.10 %/gd (Tape proposal; Quant gave no band) | bal |
| `payback_by_tier` | P = L + 1/y_tier | within ±25% of 68 / 202 / 363 / 1,040 gd (Tape proposal) | bal |
| `founder_yield_by_size` | median y by tier | strictly decreasing Seed > Growth > Late > Mega | bal |
| `founder_plus_trade_vs_trade` | "found + trade" vs "business catalog + trade" NW at next rank-up | found wins in ≤ 0.65 of seeds (Quant) **and ≥ 0.35** (Tape proposal: otherwise trading dominates founding) | bal |
| `listed_vol_ratio` | player listing vol vs sector peers | ∈ [0.85, 1.4] | bal |
| `co_learnability` | 10% price cut gains share; won quality project gains share within 21 gd | ≥ 90% of seeds each | bal |
| `co_value_gap_halflife` | player listings vs NPC stocks | within ±50% | bal |
| `co_earnings_surprise_ic` | rank IC of surprise vs next 21 gd return on player listings | > 0, while `founder_beats_bh_share` ≤ 0.70 | bal |
| `t1_payback_20gd` | stage-0 T1 at fair share | payback 20 gd ± 15%; D_R0 ≈ 1.3 | bal, **PENDING-MATHIS** |
| `t1_63gd_band` | $5k start, businesses only, 63 gd | $13k–$22k in every seed | bal, **PENDING-MATHIS** |

---

## GAPs (v1.4, against Quant v1.6.1)
**Closed earlier:** G1–G9. These were closed by Ledger's v1.4 simplification, as listed in v1.3 of this spec. In G1, `plan_end_legal` now reads `plan_legal_schedule`.

**G10–G14 status after Ledger's rulings and Quant v1.5 / v1.6 / v1.6.1:**

| GAP | ruling | status |
|---|---|---|
| G10 legal-end escape | seized shares sell on the plan schedule through the clearing account; covered creditors get `claimCoveredCreditor` | **CLOSED** (`plan_legal_schedule`, `claim_covered_creditor`). `plan_legal_escape` is predicted PASS |
| G11 dead breach code | kept as a fail-safe and unit-tested with an injected breach | **CLOSED** (`breach_bars_plans`, `plan_no_breach_path`) |
| G12 `minSellPrice` optionality | floor ≤ 0.80 × commit close (`planFloorTooHigh { maxFloor }`); price-skipped shares are held to end day + 63 | **CLOSED** (`plan_floor_cap`, `plan_price_skip_hold`). `plan_min_price_option` re-runs against these; predicted PASS |
| G13 forward-cap leaks | backlog α = 1; caps on unbacked parts only; unbacked holdover; `signal_joint_v15` | **PARTLY CLOSED.** Backlog lag, hold and re-anchor PASS. `signal_joint_v15` still FAILs on legs the ruling didn't reach: G18, G20, G21 (and ρ, G22) |
| G14 faking comparator | same-schedule twin adopted; v1.6 repayment of excess non-conversion | **CLOSED for founder-sold fakes with a real cost.** The accepted c_s residual remains, plus G15, G16, G17 and G19 |

**Open, as decisions for Ledger:**
- **G15 · What becomes a backlog order?** §4 says demand above 1.15 × cap is lost; v1.6 says NPCs place orders with a 63-gd ship-by. Decide one of:
  - (A) orders are booked only up to capacity-backed quantity, and overflow is lost (recommended). This kills `freeOverflow` faking and the honest capacity charge in hunt (d).
  - (B) overflow is booked. Then `freeOverflow` keeps c_s × L × sold at no cost, with L uncapped: 0.72% of mcap per quarter at L = 30%, industrial. In that case also cap L.
- **G16 · Sellers outside the covered set** (`backlog_repay_outside_covered`, EXPECT-FAIL). A non-covered friend or undeclared alt nets 3.5–4.1% at $1M on a 5% lift ($5B), and $1.3–2.0M at $25M on a 10% lift. Decide:
  - (1) S_k also counts the covered set's net short delta in §6.5 derivatives (recommended; otherwise the founder escapes without selling a share);
  - (2) the backstop also flags positions opened in the **open** window that profit from a `backlogReversal`, and aggregates accounts under 0.5% ADV that trade the same days;
  - (3) a caught tippee forfeits the gain into the sink;
  - (4) cash moved to another player between the signal and the filing is clawed like §5.3 transfers;
  - or (5) accept tippee faking as "investigation risk only".
- **G17 · `floor()` slack.** The allowance is c_s·ℓ_tot, but NPCs cancel floor(c_s·qty). That gives up to the whole c_s free for orders with qty < 1/c_s. Decide: the allowance is the lift of NPC-cancelled units actually cancelled (recommended), or cancellations carry the fractional remainder per company.
- **G18 · Unbacked carry and the headcount → wage mapping.** Headcount is cost-only, but the band → wage-cost mapping is undefined. With the 1.5%/wk cap, a big hiring move releases predictably: in the modelled run, carry is +0.57% net, hold-to-close +1.52% and lag-carry +0.84% at $5B/$10k. The founder controls it and can feed it to an alt. Decide one of:
  - (A) a headcount change prints whole at the next signal (no cap on the cost side) (recommended);
  - (B) define the mapping and cap the weekly band move to ≤ RT;
  - (C) accept.
- **G19 · Tick order at the filing.** "Up to the filing's open tick" doesn't say whether it is inclusive, or whether plan fills at F's open tick come before the re-anchor. Decide: re-anchor, then plan fills, and S_k inclusive (recommended).
- **G20 · Shipped-revenue noise reversion.** iid σ 0.02 per report makes consensus mean-revert, and the lag-aware bot nets +1.11% at $5B/$10k (pre-existing; the same under v1.4). Decide: one noise draw per component per quarter (recommended; tested: −0.72%, PASS, ρ unchanged), or consensus as a running filter.
- **G21 · Post-print drift on scheduled signals** (engine run). Only 0.70 of a step prints, and 0.96 by D+1. Steps ≳ 2.8% net +0.5–0.75% for $10k. v1.5 makes backlog launch steps land whole, so they qualify. Decide one of:
  - (A) company signals and filings print 100% at once (`jumpImmediate` = 1 for scheduled company data) (recommended; ecology owner);
  - (B) split steps > 2.5% over signals;
  - (C) accept.
- **G22 · ρ level.** α = 1 doesn't move ρ (≤ 0.003), but revenue noise alone gives ρ ≈ 0.31 in my model unless quarterly fundamental sd is ≥ ~13%. Decide: confirm on the engine before freeze, or relax the band, or lower σ_rev.
- **G23 · Consensus margin for revenue fakes** (v1.5 hunt). If consensus prices revenue at the reported %-margin, a revenue fake won in 96% of seeds (+2.4% of mcap). Decide: consensus margin = filed unit cost × public list prices (recommended).
- **V1 · Velvet has no `minSellPrice` input**, and now none for `planFloorTooHigh { maxFloor }` either. Blocks `plan_form_min_price`.
- **V2 · Velvet still lists `margin` as a breach reason.** Breach is fail-safe only (G11).

## Open questions: Q1–Q30 status against v1.6.1
| Q | topic | status |
|---|---|---|
| Q1 | window rewrite | RESOLVED (§6.1, §6.5, §11) |
| Q2 | tick edges | RESOLVED, Ledger (§6.1) |
| Q3 | warning day | RESOLVED: F + 17 (§6.1); Velvet v1.2 aligned (Day 587) |
| Q4 | alliance covered | RESOLVED, Ledger (§6.1; card text) |
| Q5 | buybacks | RESOLVED, Ledger (§5.2) |
| Q6 | plans | RESOLVED, Ledger v1.4 + v1.5 (sell-only, locked shares, 0.80 floor cap, price-skip hold, legal schedule, covered-creditor refusal); G10, G12 closed |
| Q7 | window-close line / plan disclosure | RESOLVED, Ledger v1.4 (exists + dates; next-day insider filing); Velvet aligned (G7 closed) |
| Q8 | weight snapshot | PROPOSED (§6.5). Quant to settle, non-blocking (WAIT-INSTR) |
| Q9 | ρ sample | RESOLVED in form (§6.2 D); 8 × 200 sample: Quant to settle, non-blocking |
| Q10 | alt baseline | PROPOSED, agrees with Tape. Non-blocking |
| Q11 | unlinked contract income | PROPOSED (§6.3). Non-blocking |
| Q12 | clawback | RESOLVED, Ledger (§5.3: first recipient owes in full; ≤ D − 64; insider at signing or payment) |
| Q13 | signal weights, cap | RESOLVED, Ledger (§6.2; v1.4 weekly cap 1.5%). v1.5: caps on unbacked parts only, backlog α = 1. Residual leaks G18, G20, G21 |
| Q14 | CEO change | PROPOSED (§9.1). Non-blocking |
| Q15 | pre-attack T0 | PROPOSED (§9.2). Non-blocking (DEFERRED) |
| Q16 | stale IPO price | PROPOSED (§5.1). Non-blocking |
| Q17 | post-lockup sells | RESOLVED (§13; v1.4 `cap` skip, no pre-announcement) |
| Q18 | insider trade filings | RESOLVED, Ledger v1.4 (own stock + derivatives, d + 1, side, size, day) |
| Q19 | alliance in the IPO book | PROPOSED (§5.1). Non-blocking |
| Q20 | re-anchor predictable | RESOLVED, Ledger (§5 backlog term, §6.2 uncapped close signal). Gates `reanchor_public_edge`, `forward_cap_honest_bind` kept as EST (Quant: gross ≈ 0; ~6% binding; Δρ = 0, estimates, not sims). v1.5: `reanchor_public_edge` modelled PASS (−1.2% net at $5B/$10k) |
| Q21 | plan optionality | RESOLVED, Ledger v1.4 (sell-only, skips/ends never breach). `minSellPrice` capped at 0.80 × close (v1.5): G12 closed |
| Q22 | EV denominator | RESOLVED, Ledger (§6.2 D = max(EV_20, 0.25·mcap_20)) |
| Q23 | first-period snapshot | PROPOSED: listing tick (§6.5). Non-blocking |
| Q24 | buyback timing | RESOLVED, Ledger (§5.2 F + 1, `buybackImmutable`); proof = treasury leg of `window_two_way_edge` |
| Q25 | Late gap / unlisted index | RESOLVED, Ledger (§6.1) |
| Q26 | Velvet F + 16 | RESOLVED (F + 17; Velvet v1.2 updated) |
| Q27 | salary-cap drift | PROPOSED: quarterly reset + `salaryCut` (§5.3). Non-blocking |
| Q28 | innocent lenders | RESOLVED, Ledger (§5.3 safe harbour ≤ D − 64, insiders always clawed, either-time insider test) |
| Q29 | `window.covered`, `windowClosed` | PROPOSED (§11). Non-blocking |
| Q30 | guarantee rate | RESOLVED, Ledger (§1, §12 #8: 0.75 · r_debt) |

## Observations (not FAILs)
- **Ban timing:** `planBanned` lasts 126–188 gd depending on where the breach falls in its quarter, so a late-quarter breach gets the shortest ban (`breach_ban_timing`). Accepted by Ledger; moot while breach is unreachable (G11).
- **Plan size is estimable:** next-day filings plus the public date range let the market estimate a plan's size after a few fills (`plan_size_inference`). Ledger accepts this; the size is never shown.
- **Small accounts and the carry:** the leaks in `signal_joint_v15` pay $10k–$1M accounts on $500M–$5B listings. $25M accounts lose on all of them except post-print drift.
- **Fake vs honest cost:** a real faking cost (refusing real orders, lapsing servable overflow) costs $0.17–$0.72 per $1 of fake backlog against a keep of ≤ $0.13. Faking pays only where it is free (G15) or where someone outside the covered set does the selling (G16).

## Changelog
- **v1.4 (2026-10-09):** retargeted to Quant v1.5 (sha `75852993…1ed2`), then v1.6 (`cdd45221…9007`), then **v1.6.1** (`6149e9e4…92f5`, 985 lines), with Ledger's rulings on G10–G14.
  - Adopted Quant's v1.5 ids: `plan_floor_cap`, `plan_price_skip_hold`, `plan_legal_schedule` (alias: `plan_end_legal` → `plan_legal_schedule`), `claim_covered_creditor`, `signal_cap_scope`, `consensus_alpha1` and `signal_joint_v15` (covers `cap_carry_edge`, `reanchor_public_edge` and `rho_residual`).
  - Adopted Quant's v1.6 ids: `backlog_margin_only`, `reanchor_reversal_excess_only`, `fake_lift_repay`, `honest_cancel_no_charge`, `backlog_repay_shares_counted` (v1.6.1: alliance counted) and `npc_cancel_deterministic`.
  - New: `signal_noise_reversion`, `signal_postprint_drift` (engine run) and `backlog_repay_outside_covered` (EXPECT-FAIL).
  - Updated: `signal_forward_cap` (unbacked scope), `cap_carry_edge`, `signal_fake_ev` (same-schedule twin, production cost, repayment), `plan_legal_escape` and `plan_min_price_option` (predicted PASS).
  - Added the v1.6.1 run section: Quant's script reproduced byte for byte (default, `--v15`, `--v14`); the RT table; the engine post-print probe; joint bots; ρ; faking by mechanism × sector; hunts (a)–(e).
  - G10, G11, G12 and G14 closed; G13 partly closed. New G15–G23.
- **v1.3 (2026-10-09):** retargeted to Quant v1.4 (sha `c48439ea…9e27`) with Ledger's sell-only plan simplification and Velvet v1.3.
  - Adopted Quant's `plan_sell_only`, `plan_no_cash_escrow`, `plan_locked_shares`, `plan_unfunded_shares`, `plan_margin_untouchable`, `plan_skip_reasons_closed`, `plan_skip_{cap,halt,price}`, `plan_end_{terminated,legal,tender}`, `plan_tier_drop`, `plan_split`, `plan_dividend_free_cash`, `plan_no_breach_path`, `plan_public_disclosure`, `insider_filing_next_day`, `clawback_safe_harbour_64` and `clawback_insider_either`.
  - Retired with aliases: `escrow_spendable`, `escrow_margin_untouchable`, `escrow_vs_clawback`, `plan_unfunded`, the old `plan_skip_price`, `clawback_safe_harbour`, `clawback_insider_status_change` and `insider_trade_filing`. Deleted: `plan_escrow_exact`, `plan_no_optionality`, the cash-escrow, short/cover and margin-breach legs.
  - New: `plan_min_price_required`, `plan_legal_escape`, `plan_min_price_option`, `plan_fake_timed`, `plan_size_inference`, `plan_form_min_price`, `broker_sellable_vs_locked`, `plan_public_wire_line` and `insider_filing_line`. `breach_bars_plans` now runs on an injected breach only.
  - `cap_carry_edge` has three bots (weekly-carry, lag-aware, hold-to-close), predictions per J and bucket, and levers. `signal_fake_ev` is checked against the script (reproduced), with the same-schedule comparator, a `planTimed` leg and a production-cost pass rule.
  - G1–G9 closed. New G10–G14 and Velvet items V1 and V2.
- **v1.2 (2026-10-09):** retargeted to Quant v1.3 and Velvet v1.2.
  - Plan rejects are `planLimit` / `planInLockup` / `planTooSoon { earliestDay }` / `planUnfunded { shortfall }` / `planBanned { untilDay }` / `planImmutable`.
  - The ban calendar (untilDay = last day of the 2nd full quarter after the breach quarter) with first-day and last-day fixtures.
  - Adopted Quant's `escrow_spendable`, `escrow_margin_untouchable`, `plan_skip_price` and `breach_bars_plans`.
  - New `plan_unfunded`, `plan_escrow_exact`, `plan_skip_volume`, `plan_skip_reasons_closed`, `escrow_counts_networth`, `plan_tier_change`, `breach_ban_timing` and `window_closed_event`.
  - Surprise uses the backlog term and D = max(EV_20, 0.25·mcap_20), with the `fx_close_payout` and `fx_launch` fixtures; `close_signal_uncapped`, `backlog_filed_field`, `signal_bias_correct`, and the `cap_carry_edge` hunt with its FAIL prior.
  - Buybacks are filed on F + 1 only and are immutable.
  - Clawback safe harbour, insider loans always clawed, first recipient owes in full; `escrow_vs_clawback`.
  - Velvet plan UI e2e: six refusal copies, hold-to-commit, Locked · PLAN, Available vs Locked, skip copy, breach card, blocked form, clawback warning.
  - Q20–Q30 reconciled; new GAPs G1–G9.
- **v1.1 (2026-10-09):** retargeted to Quant v1.2 + addendum and Ledger's v1.3-pending rulings; adopted Quant's window and plan check ids; EV-scaled surprise; forward cap; filing tiers; Velvet DOM, quality-score and link checks; Q1–Q19 reconciled; Q20–Q30 raised.
- **v1 (2026-10-09):** first version, against Quant v1.1 and Ledger's window ruling.
