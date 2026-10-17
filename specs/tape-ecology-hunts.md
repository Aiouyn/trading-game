# Tape: ecology balance bands and exploit hunts

**Owner:** Tape. **Status:** v1, 2026-10-09. Nothing is built yet for these systems; this is what Tape runs as each one lands.
**Reads:** `quant-market-ecology.md`, `quant-npc-funds.md`, `quant-rumors.md`, `quant-world-events.md`, `quant-ghosts.md`, ROADMAP M12, M13, M16, M20, M21, M30, M48 and deep-dives §2.5–§2.8.
**Harness:** `scripts/balance/run.ts`, fee-aware, $5,000 start, market orders, whole shares, each strategy in its own same-seed world, results as equity multiples. Strategies today: `bh`, `random`, `momentum`, `contrarian`. Existing gate: `max_strategy_beats_bh_share ≤ 0.7`. Band ids below are added to `scripts/balance/bands.ts` **when the system lands**, not before. A band for a system that isn't built yet is never shown as PASS.

**Privacy rule (Mathis, 2026-10-09):** every bot here (mirror, front-runner, rumor-follower, crash-buyer, bust-farmer, ad-farmer) is test code in `scripts/balance/` or `tests/e2e/`. Bots read engine state directly because they're tests, not players. None of this implies a public view of anyone's book. A mirror bot passing its band says nothing about whether players can see rival holdings; the game UI must not show them (acceptance §12, L3).

Seed counts: **20** for a quick check, **60** for the release gate, **200** where rare events or proportions need it (rumors, world events, farming).

---

## 0. Learnability bands (agreed with Quant / Ledger, for the ecology layer)

Scored on annualized Sharpe of daily returns, fees included, same window as the harness. They sit next to the multiple bands, which stay as they are.

**Ecology-off gate (Ledger 2026-10-09, value_gap only):** overall beat-rate **40–60%**; at least one regime **above 0.65** and at least one **below 0.40** (≥10 seeds each); median Sharpe edge over BH **≤ +0.05**. `mom63` is info-only, not the gate. Live print already meets it (overall 0.450, contraction 0.787, expansion 0.203, median edge −0.151).

| Band id | Rule | Seeds |
|---|---|---|
| `learn_value_gap_sharpe_beat_share` | value_gap beats BH on Sharpe in **0.40–0.60** of seeds (ecology off; re-raise toward 0.50–0.70 when ecology / publish-price lands) | 60 |
| `learn_value_gap_median_sharpe_edge` | median Sharpe edge over BH **≤ +0.05** (ecology off; ceiling may rise to +0.15 with ecology on) | 60 |
| `learn_regime_split` | at least one regime beat-rate **> 0.65** and at least one **< 0.40**, each regime with ≥ 10 seeds | 60 |
| `learn_crowded_beat_share` | after signed flow > **10% of ADV** over prior 21 game days: crowded beat **< 0.55** and **≤ uncrowded − 0.05**. Gate size ≈ **$25M combined** same-signal capital as a **crowd** (e.g. 100 × $250k); keep $25M single as cross-check. Do not lower the ADV threshold. Ecology-off is baseline; re-run with ecology at 100% when Quant hands it over | 60 |
| `learn_stacked_beats_bh_share` | two stacked public signals stay ≤ 0.70 on the multiple bands | 60 |
| `eco_off_fingerprint` | ecology flag off: every current band passes and the price fingerprint is byte-identical | 20 |

---

## 1. NPC rival funds (M12)

**Model under test:** Hale (value, every 21 game days), Pinn (momentum, every 21), Vetch (crypto degen, every 5). Per `quant-npc-funds.md` and the market-ecology spec, they are named members of the value, trend and crypto-trend pools: their orders are part of the pool's flow and clear through the same impact as everyone else. Each rival's slice is capped at 5% of that asset's ADV per rebalance. Long only, whole shares, same fees as the player.

> **Conflict for Ledger (C1 follow-up):** ROADMAP M12 still says each rival starts at $50,000 and "trades through `placeOrder` on its own RNG stream". `quant-npc-funds.md` (settled in the room) says Hale starts at $7,000, Pinn and Vetch at $50,000, and rivals have **no order path of their own**; they ride the pools. Tape tests Quant's spec. Either way the invariant Tape checks is the same: **one impact path**. M12's text should be updated.

| Band id | Check | Band | Seeds |
|---|---|---|---|
| `rival_single_impact_path` | Run a seed with rivals on. For every rival fill, the price move it causes appears inside its pool's term of the cause vector, and the day's cause vector sums to the day's log return within 1e-9. No rival fill moves `lnP` outside the pool clearing | 0 violations | 20 |
| `rival_adv_cap_violations` | Any rival's slice on any rebalance > 5% of that asset's ADV | 0 | 60 |
| `rival_off_fingerprint` | `rivals: []` vs the field absent: byte-identical prices | 0 diffs | 20 |
| `rival_median_multiple` | each rival's median 5-year multiple | 0.4×–2.5× | 60 |
| `rival_beats_bh_share_max` | highest share of seeds where any rival beats BH | ≤ 0.70 | 60 |
| `rival_mirror_beats_bh_share` | Tape bots `mirror_hale` and `mirror_pinn` (and `mirror_vetch`) buy what that rival holds on the rival's rebalance tick, same weights | ≤ 0.70 (same as `max_strategy_beats_bh_share`) | 60 |
| `rival_frontrun_median_pnl` | Bot `frontrun_<rival>` computes the rival's next picks from printed closes (the rule is public in the spec), buys K ∈ {1, 30, 720} ticks before the rebalance tick and sells N ∈ {1, 720} ticks after. Median round-trip P&L per event after fees and impact | ≤ 0 | 60 |
| `rival_frontrun_beats_bh_share` | the same bot as a full strategy | ≤ 0.70 | 60 |
| `rival_lookahead` | a rival's pick on tick t uses only closes printed before t (rerun with the future scrambled; same picks) | 0 diffs | 20 |
| `rival_ignores_player` | rivals never trade on the player's stops or orders: same rival fills with and without a player account that holds stops | 0 diffs | 20 |

**FAIL conditions:** any count band > 0; mirror or front-run > 0.70; front-run median P&L > 0 (the rebalance tick is a free lunch, so Quant spreads the rebalance over several ticks or adds jitter on stream `rival:<id>`); any rival flow outside the pool path (double impact).
**Privacy check:** the mirror bot reads `state.rivals[].positions` because it's a test. e2e L3 asserts the Rivals board shows names and equity only.

---

## 2. Rumors and insider tips (M16)

**Model under test:** `quant-rumors.md` v1: 3 rumors per game week, 55% true, a true rumor names the sign of the next earnings move, insider tips only from a later crime action, always true and always flagged when traded. v2 (ROADMAP §2.5): per-source accuracy, publication price effect, regulator.

| Band id | Check | Band | Seeds |
|---|---|---|---|
| `rumor_true_share` | true rumors / all rumors | 0.47–0.63 (55% ± 8) | 200 × 5 y |
| `rumor_true_share_per_seed_max` | no single seed is a "rumors are always right" world: per-seed true share over ≥ 30 rumors | ≤ 0.75 | 200 |
| `rumor_flag_count` | flags raised by trades on `insider: false` tips that are prosecutable | 0 | 200 |
| `insider_flag_rate` | insider tips traded between tip and reveal → flagged | 1.00 | 200 (synthetic insider tips via the engine's test path) |
| `insider_truth_rate` | insider tips true | 1.00 | 200 |
| `tip_no_consume_fingerprint` | prices with no tips consumed match the no-tip fingerprint | 0 diffs | 20 |
| `tip_reload_reroll` | save → reload → same tip ids, claims and truth | 0 diffs | e2e |
| `rumor_blind_ev` | bot `rumor_blind` buys every `up` rumor (long only; ignores `down`) at the next tick and sells one game day after the reveal. Mean P&L per trade after fees | ≤ 0 | 200 |
| `rumor_blind_beats_bh_share` | the same as a full strategy | ≤ 0.70 | 60 |
| `rumor_wire_truth_leak` | `wire(state)` and the DOM never contain `truth` or `logMove` before `revealsTick`; no priced-in band on a rumor | 0 | e2e + unit |

> **Risk to flag now:** under v1 rules a rumor has **no price effect at publication**, 55% name the right sign, and post-earnings drift exists. Blind-following then has a positive expectation of about 0.10 × E|earnings move| minus fees, which may beat the `rumor_blind_ev ≤ 0` band. If it does, the lever is Quant's (move part of the expected move into the price at publication, per §2.5's `0.25 × credibility × expected_move`, or lower accuracy); the band does not move.

**Later (v2, M16 v2 / M30):** `rumor_tracked_source_beats_bh_share ≤ 0.70` for sources with ≥ 65% over ≥ 20 resolved rumors; `eca_wrongful_conviction_rate < 0.03` over 200 seeds of synthetic lucky-but-honest rumor traders; `insider_detected_rate` reported, not banded, until Tape tunes ECA thresholds.
**Restricted cash:** an insider action is rejected while the account holds unspent `AD_GRANT` or `FRESH_START` cash inside the restricted window (Quant: 21 days; ROADMAP C5 proposes 72 game days in solo). Band `restricted_cash_insider_accept` = 0. The window length is Ledger's call at M20; the test reads it from config.

---

## 3. World events (M21)

**Model under test:** `quant-world-events.md` (rates already reconciled with C3): crash 0.03%/game day, bubble 0.02% (majors); crisis week 0.8%, flash 0.5% (storms); stream `macro:events`; one event at a time; no bubble in contraction, no crash in the first 21 days.

| Band id | Check | Band | Seeds |
|---|---|---|---|
| `event_count:<kind>` | count of each of crash, bubble, crisis, flash | ≥ 20 each | 200 × 5 y |
| `event_major_count` | crashes + bubbles (expected ~126) | 80–180 | 200 × 5 y |
| `event_overlap` | ticks with two active events | 0 | 200 × 5 y |
| `event_invalid_values` | NaN/Infinity or price under the floor during any event (the flash respects the ±15% halt) | 0 | 200 × 5 y |
| `event_odds0_fingerprint` | odds 0 → byte-identical to today | 0 diffs | 20 |
| `event_replay_bytes` | recorded event replays byte-identical from the seed | 0 diffs | 20 |
| `gx_cagr_median` (re-banded with events on) | existing 0–12% | if the median breaks 12%, Quant lowers crash/bubble odds; the band stays | 60 |
| `vol_ratio_median:<id>` (events on) | existing 0.85–1.4 | same rule | 60 |
| `crash_farm_vs_bh` | bot `crash_buyer`: on each crash start headline, buy the equal-weight stock basket with all cash, hold H ∈ {21, 63} game days. Median multiple vs BH, and beat share | median ≤ BH median; beat share ≤ 0.70 | 200 |
| `flash_dip_ev` | bot `flash_dip`: buy at the first tick after the flash's −8% low is known (i.e. after it prints), sell at that day's close. Mean P&L after fees | ≤ 0 | 200 |
| `bubble_timer_beats_bh_share` | bot `bubble_timer` sells at 2/3 of the window (the give-back starts there) | ≤ 0.70 | 200 |
| `event_end_leak` | `endTick`, the window length or the give-back point never appear on the Wire or in the DOM before they happen | 0 | e2e |
| `event_banner_day3_identical` | forced 10-day vs 30-day crash: `event-banner` text (and proof shot) identical on elapsed day 3 | match | e2e |
| `shockprice_not_event` | `shockPrice` never creates a `WorldEvent` and no event code path calls it | 0 | unit |

> **Risks to flag now:** the flash spec is deterministic ("−8% in the first sixth, ~70% back by the close"). A bot that buys after the low prints may earn ~5% per flash for free, so `flash_dip_ev` will likely fail as written. The fix is Quant's: randomize the recovery share and the time of the low from `macro:events`. Same for bubbles: if the give-back point is a fixed 2/3, `bubble_timer` gets a timer, so jitter the window.

---

## 4. Bankruptcy farming (M20)

**Model under test:** ROADMAP §2.6: voluntary bust when NW < $1,000, forced when equity < 0 after liquidation; $5,000 fresh start at most once per 8 weeks; Reputation −10; leverage ≤ 1× for 7 days; a perk worth ≤ $2,500 (non-cash); `FRESH_START` reason code; clawback lookback online.

**Policies compared** (scripted bots, 200 runs each, the same seeds, horizon 8 and 24 game-weeks in solo game time):
- `solvent`: the harness `bh`.
- `yolo_bust`: all-in on the highest-vol asset it's licensed for; if NW < $1,000, bust and take the fresh start (and the best perk), then repeat.
- `yolo_nobust`: the same trading without the fresh start (to isolate the option's value).

| Band id | Check | Band |
|---|---|---|
| `bust_farm_mean_ratio` | mean NW(`yolo_bust`) / mean NW(`solvent`) at each horizon | ≤ 1.00 |
| `bust_farm_option_value` | mean NW(`yolo_bust`) − mean NW(`yolo_nobust`) | ≤ $5,000 per 8-week window (one fresh start's worth, never more) |
| `bust_fresh_start_per_window` | fresh-start grants per 8 weeks per player | ≤ 1 |
| `bust_rank_from_fresh_cash` | a rank threshold first crossed within 7 days of a fresh start **because of** `FRESH_START` cash (counterfactual without the grant stays under it) | 0 |
| `ledger_tag_coverage` | Σ reason-coded flows = Δcash on every tick, and every fresh start is tagged `FRESH_START` ≤ $5,000 | 0 mismatches over 60 seeds |
| `restricted_cash_hack_accept` | (once crime exists) a cyber/espionage op or insider action funded by unspent `FRESH_START` or `AD_GRANT` cash inside the window | 0 |
| `bust_second_window` | a second bust inside 8 weeks yields no fresh-start cash, only the floor | 0 violations |

> **Risk to flag now:** as specced, "you lose all cash, then get $5,000" turns a deliberate all-in into a free put with a $5k floor. `bust_farm_mean_ratio` may fail at 8 weeks. If so, the options are Ledger's: count the fresh start against a rank (no rank-up within N days of one), cut the grant for voluntary busts, or make the Reputation hit bite (e.g. a fee surcharge). Tape will not widen the band.

---

## 5. Ad farming (M48, solo rehearsal earlier)

**Model under test:** ROADMAP §2.7: $250 per ad, at most 10 per day, only when NW < $1,000, fixed amount (never random), cash tagged `AD_GRANT`; restricted window: no cyber/espionage ops, no margin or derivatives, no P2P. Eligibility timing waits for **Q3** (live vs start of the local day); every check below takes it as a parameter. M48 says enforcement is server-side; before servers, Tape runs these against the solo save.

| Band id | Check | Band |
|---|---|---|
| `ad_grant_amount` | every grant is exactly $250, tagged `AD_GRANT` | 0 violations |
| `ad_grants_per_day_max` | grants in one player-day, including after reload, tab close/reopen, a second tab, quitting and returning, and `page.clock` moved within the same day | ≤ 10 |
| `ad_counter_survives_reload` | the daily counter is save-backed (or server-backed later): after reload, quit and return the same day, the counter is unchanged | 0 resets |
| `ad_clock_rollback` | moving the device clock back or across timezones doesn't add a new day's 10 | 0 extra grants |
| `ad_gate_on_networth` | a player with $900 cash and $5,000 in positions is **not** eligible; a player with $900 NW is | 0 violations |
| `ad_eligibility_q3` | Q3 = A: the offer disappears once NW ≥ $1,000. Q3 = B: eligibility is fixed at the start of the local day | per Q3 |
| `ad_cash_restricted_use` | `AD_GRANT` cash inside the window can't fund margin, derivatives, P2P, ops or an insider action (FIFO) | 0 accepted |
| `ad_fixed_reward` | no random amount, multiplier, spin or chest in any reward path (code audit + e2e) | 0 |
| `ad_faucet_share` | `AD_GRANT` / daily net mint, world-level (online) | alert > 0.0001 |
| `ad_plus_bust_stack` | fresh start + ads stack at most once each when broke, in that order (fresh start offered first) | 0 violations |

**FAIL conditions:** any count above its band; any grant without a tag; any path where reloading, a new tab or the clock gives an 11th grant.
**Note for Forge:** in solo, starting a new game must not reset the daily counter. The counter belongs to the profile, not to the save slot.

---

## 6. Self-impact mark pump (current engine, found while writing these)

Box probe on the staged engine in `/workspace/tg` (probe scripts in `/workspace/scratch/markpump.ts`, `roundtrip.ts`, `rankpump.ts`, not in the repo):
- Each fill moves price by `permanentImpactShare (0.5) × impact`, and `impact ∝ √(clip notional / ADV)`. Splitting one buy into K clips makes the total permanent move grow about √K. SYN, $240k, one day: one clip lifts SYN's price 0.07% from the player's own buying; 720 clips (one per tick) lift it 1.83%, about 26×. A $4.8M account in 720 clips lifts SYN 8.5%.
- A ladder round trip (buy over a day, sell over a day) still **loses** in the median (20 seeds: 4/20 to 8/20 profitable), so it's not a cash machine.
- But **peak equity rose above a frictionless purchase in 20/20 seeds**, and rank keys off peak equity and is never lost. A laddered buy can paper-pump an account across a rank line (Owner $250k, Operator $5M).

| Band id | Check | Band | Seeds |
|---|---|---|---|
| `self_impact_clip_ratio` | own price lift from K = 720 clips / own lift from 1 clip, same notional, same window | ≤ 1.5 | 20 |
| `self_mark_peak_pump` | peak equity after a laddered buy − peak of the same shares bought frictionlessly at counterfactual mids | ≤ $0 (tolerance 0.1% of notional) | 20 |
| `ladder_roundtrip_ev` | median ladder round-trip P&L after fees | ≤ 0 (passes today) | 20 |

Levers (Quant's and Ledger's call): permanent impact linear in cumulative quantity with decay (not √ per clip), and/or rank on a mark that ignores the player's own flow (for example the min(value, 3-day VWAP) mark ROADMAP §2.1 already uses for ladders).

## Settled design (Ledger 2026-10-09)

**Clip-splitting (must PASS after Quant's fix):**
- Permanent impact is charged on the account's running day total: each clip pays `f(after) − f(before)`, so 720 clips cost the same as one order of equal notional.
- Peak net worth for rank / licenses / boards is **liquidation value** = mark − `estimateFill` cost to exit. Own buying must not raise peak.
- Bands `self_impact_clip_ratio` (≤ 1.5) and `self_mark_peak_pump` must go FAIL → PASS on the box copy before any shadow/ecology port.

**Free-win design (spec rules until impact change is green):**
- Rumors: ~1/3 false; true ones partly priced in when they spread. Blind follow EV < buy-and-hold. Keep the hunt.
- Flash crash: give-back size and timing are random; sometimes no recovery. Dip-buying wins some and loses some.
- Fresh start: chapter score carries the bust loss; one fresh start per 8 weeks (profile-scoped); 1× leverage for 7 days after.

**Hooks / profile:**
- `__tg.e2e.setCash(n)` (n ≥ 0) behind `?e2e`; stops saving. Under-$1k tests: no positions + `setCash(900)`.
- Ad daily cap and fresh-start cooldown live on the **profile**, not the save.
- C5 hold on ad/comeback cash: 72 real hours online and 21 game days in solo; blocks hacking, insider, margin, and P2P transfers.
- M12 rivals: pool slices; Hale & Ward $7k; Pinn Partners and Vetch $50k.
- `shockPrice` = price only; `shockValue` = test-only for world-event tests.

## Learnability bands (signed with Quant / Ledger, ecology off — 2026-10-09)

Clip fix PASS on box: `self_impact_clip_ratio` SYN 0.979 / AURH 0.9995 (was ~26–27); peak = `liquidationEquity`.

Ecology-off (current engine), 60 seeds, $5k, fees on, Sharpe × √252. Ledger gate (tighter than the interim 35–60%): overall **40–60%**, ≥1 regime **> 0.65**, ≥1 regime **< 0.40**. Print meets it.

| Band | Target | Live print |
|---|---|---|
| `learn_value_gap_sharpe_beat_share` | **0.40–0.60** | **0.450** (27/60). Re-raise toward 0.50–0.70 when ecology / publish-price lands |
| `learn_value_gap_median_sharpe_edge` | **≤ +0.05** | **−0.151** (inside). Ceiling may rise to +0.15 with ecology on |
| `learn_regime_split` | ≥1 regime **> 0.65** and ≥1 **< 0.40** (≥10 seeds each) | contraction **0.787**, expansion **0.203** (also overheating 0.479, recovery 0.302) |
| `learn_crowded_beat_share` | crowded ≤ uncrowded − 0.05 (ideally < 0.55) | $5k never hits 10% ADV (largest 21-day buy 0.043% of ADV). Quant matches on a **parallel $250k** account, same seeds. N×$5k crowd hunt also running for Ledger |
| `learn_stacked_under_cap` | under `max_strategy_beats_bh_share` 0.7 (equity multiples) | unchanged |
| `eco_off_fingerprint` | current Phase 0 bands + price fingerprint | Quant: 20-seed harness still PASS |

`mom63` is info-only (live beat-rate 0.183). Quant is not changing value_gap until crowding prints land. Refined momentum (top 3, inverse-vol, skip most-volatile tercile) is Quant's side print.

## Crowd hunt print (value_gap, ecology off — 2026-10-09)

Script: `engine-staging/scripts/crowd-hunt.ts`. Seeds tape-01..60, 5y, tpd 24, monthly from day 63, fees on. Full text: `/tmp/crowd-hunt.vg.txt`.

**A. N × $5k bots, same public signal, one world (focal = bot-0):**

| N | beat vs BH | median edge | med flow/ADV | max flow/ADV | crowded periods | crowded beat | uncrowded beat |
|---|---|---|---|---|---|---|---|
| 1 | 0.450 | −0.151 | 0.003% | 0.05% | 0 | n/a | 0.450 |
| 50 | 0.467 | −0.091 | 0.142% | 2.18% | 0 | n/a | 0.467 |
| 200 | 0.417 | −0.080 | 0.436% | 8.20% | 0 | n/a | 0.417 |
| 500 | 0.350 | −0.121 | 1.034% | 23.89% | 0.002 | 0.333 (3) | 0.350 |

N=200–500 never reliably crosses 10% ADV as a *period rate*; N=500 max hits 23.9% but only ~0.2% of periods are crowded. Beat-rate and Sharpe decay with N anyway (impact friction), not from the crowded band.

**B. Single account (Quant match path), same seeds:**

| size | beat | median edge | med flow/ADV | max | crowded periods | crowded beat | uncrowded beat | gate? |
|---|---|---|---|---|---|---|---|---|
| $5k | 0.450 | −0.151 | 0.003% | 0.05% | 0 | n/a | 0.450 | n/a |
| **$250k** | **0.450** | −0.166 | 0.128% | **2.42%** | **0** | **n/a** | 0.450 | **cannot fire 10% ADV** |
| $2.5M | 0.417 | −0.218 | 1.05% | 18.2% | 0.006 | 0.800 (5) | 0.417 | sample too small |
| $7.5M | 0.400 | −0.253 | 3.33% | 45.2% | 0.075 | 0.447 (38) | 0.417 | crowded *above* uncrowded |
| **$25M** | **0.317** | −0.323 | 9.70% | 123% | 0.458 | **0.333** | **0.433** | **yes: <0.55 and ≤ unc−0.05** |
| $250M | 0.117 | −0.544 | 43.4% | 308% | 0.736 | 0.133 | 0.300 | yes |

**Answers for Ledger / Quant:**
1. Sharpe edge vs BH decays as size/N grows (more fees + impact), even before the 10% ADV band fires.
2. The crowded band itself: **$250k never reaches 10% ADV**. First reliable gate print is around **$25M** (crowded 0.333 vs uncrowded 0.433).
3. N×$5k at 200–500 does not substitute for the band — combined flow stays mostly under 10% of ADV.

**Settled (Ledger 2026-10-09):** keep **10% of ADV** (lowering it would fake crowding). Crowding is a big-money / many-players effect; gate size ≈ **$25M combined** same-signal capital, run as a **crowd** (e.g. **100 × $250k**), with the **$25M single** as cross-check. Pass: crowded beat **< 0.55** and **≤ uncrowded − 0.05**. Edge decay at N=500 from fees/impact is expected. Ecology-off is baseline only — **rerun on Quant's ecology harness at 100%** once he hands it over (pools should punish a crowded signal).

**Refined mom63 (Quant side print, info-only):** beat 0.333 (20/60), median edge −0.172; naive mom63 0.183. Still under 40%; value_gap untouched.

## Ecology-on learnability (Quant print, enterSimMode — 2026-10-09)

Harness: `enterSimMode(createWorld(...))` in `src/engine/sim.ts` (export from `src/engine`). Flag is memory-only; not a save field. Ref: `npx tsx scripts/learnability.ts --price-path ecology ...`. Full print: `/tmp/learnability-ecology.txt`.

| Signal | Beat vs BH | Median Sharpe edge | Notes |
|---|---|---|---|
| mom63 (naive) | 0.217 | −0.323 | info-only |
| mom63_refined | 0.500 | −0.015 | contraction 0.553; info-only for gate |
| **value_gap** | **0.650** | **+0.215** | over the planned ecology-on median-edge ceiling (+0.15). Quant flagged Ledger. **Do not change value_gap** until crowding ecology print lands |

Crowding ecology-on (100 × $250k + $25M single) via crowd-hunt `--price-path ecology`: **DRY RUN only, see below.**

### 100 × $250k gate — ecology-on DRY RUN (current enterSimMode defaults, valueClose 0.85; 8 seeds) — NOT the gate

Quant is changing the ecology defaults (`valueClose` going up from 0.85) to get value_gap's median edge under +0.15, so **no PASS/FAIL here**. The real gate is a full 60-seed rerun once Quant says the new defaults are locked and learnability is green (it takes about 5 minutes on the box).
Command: `npx tsx scripts/crowd-hunt.ts --price-path ecology --seeds 8 --bigseeds 8 --sizes 100 --botcash 250000 --single 5000,25000000 --signals value_gap --jobs 4 --dir /tmp/crowd-hunt-eco-parts`. Print: `/tmp/crowd-hunt-ecology-dryrun.txt` (+ `.json`).

| path (8 seeds) | beat | median edge | med flow/ADV | crowded periods | crowded beat | uncrowded beat | gate shape |
|---|---|---|---|---|---|---|---|
| $5k single (baseline) | 0.875 | +0.455 | 0.003% | 0 | n/a | 0.875 | — |
| **100 × $250k crowd (focal)** | 0.250 | −0.383 | 6.68% | 0.371 | **0.250** | **0.375** | would pass (< 0.55, −0.125) |
| $25M single (cross-check) | 0.500 | +0.148 | 10.3% | 0.500 | 0.500 | 0.750 | would pass (< 0.55, −0.25) |

Ecology-off $25M reference: crowded 0.333 vs uncrowded 0.433. 8 seeds = 0.125 per seed in beat share, so these are directional only. The crowd lands much worse than the omnibus because the engine charges permanent impact **per account per day**: 100 accounts pay √ impact 100 times, while one $25M order pays it once (see the note below).

**Engine note for Quant (not a gate):** after the clip fix, permanent impact is keyed on each account's day total. N same-signal accounts therefore move the price about √N times more than one account with the same total (at 500 × $5k on AURH that's ~3.2% vs ~0.14%, analytic). On the live path the pull to value softens this: N=500 bots have a median multiple of 0.774 vs 0.837 for the $2.5M single. Crowd hunts with many accounts overstate crowding decay until impact is keyed on the asset's day flow across accounts. This matters for ghosts, NPC funds and multiplayer, not solo.

**mom63 ecology-off crowd (partial, stopped to free CPU):** N×$5k at 60 seeds for N=200 and 500 (N=1: 30 seeds, N=50: 40 seeds); single-account paths at 30 seeds. Beat share 0.23 at N=1 → 0.20 at N=500; $25M single crowded 0.200 vs uncrowded 0.267. Info only. `/tmp/crowd-hunt.txt`.

## Ecology crowd gate — REAL (2026-10-09)

**Result: `learn_crowded_beat_share` (ecology-on) — PASS.** Replaces the "Impact keying (pending)" hold: both of Quant's changes are in `engine-staging`.
- `valueClose` locked at **0.9** (`src/engine/ecology.ts`).
- Permanent impact uses **one shared tally per asset, per side, per game day** (`AssetState.dayTraded`, `tallyToday`). Every account and the ecology pools in sim mode count toward it.

**Engine checks on the box (`engine-staging`, `npx vitest run`):** 11 files, **114/114 pass**. `impact-tally.test.ts` 7/7 and `selfimpact.test.ts` 10/10 (17/17 together); `trading.test.ts` all pass.
- `crowd-hunt.ts` goes through the normal path: `placeOrder` → `step` → order clearing in `trading.ts` → `tallyToday(a.dayTraded, day)` → `permanentMove`. It does not bypass the tally, so **the script is unchanged**.
- Probe: one $25M buy and 100 × $250k on the same tick move `lnP` by the same amount (`proof/temp-impact-split-20261009.txt`).

| Band (new keying) | Band limit | Box print | Result |
|---|---|---|---|
| `self_impact_clip_ratio` SYN (720 clips vs 1) | ≤ 1.5 | **0.9790** (one-clip lift 1.4320e-3, 720-clip 1.4019e-3) | PASS |
| `self_impact_clip_ratio` AURH | ≤ 1.5 | **0.9995** (7.8570e-4 vs 7.8534e-4) | PASS |
| `self_mark_peak_pump` SYN, 720 clips | peak ≤ no-pump mark | peak $3,002,638.78 ≤ $3,004,446.11 (pushed mid $3,004,713.02) | PASS |
| `self_mark_peak_pump` SYN, 1 clip | peak ≤ no-pump mark | $3,000,000.00 ≤ $3,000,879.54 | PASS |
| `impact_split_accounts` SYN (N=2 / 10 / 100 / 720 clips vs 1 order) | ≈ 1 | 1.0001 / 1.0001 / 0.9999 / 0.9779 | PASS |
| `impact_split_accounts` AURH | ≈ 1 | 1.0001 / 1.0000 / 0.9999 / 1.0021 | PASS |

These match Quant's numbers. Print: `proof/impact-keying-20261009.txt`.

**Gate run:** `npx tsx scripts/crowd-hunt.ts --price-path ecology --sizes 100 --botcash 250000 --single 5000,25000000 --signals value_gap --seeds 60 --bigseeds 60 --jobs 7 --dir /tmp/crowd-hunt-parts-ecogate-20261009 --fresh`. Run settings: seeds tape-01..60, 5y, tpd 24, monthly from day 63, fees on, closed-loop ecology (`enterSimMode`), 240 parts, wall time 104 s.
- Print: `proof/crowd-hunt-ecology-gate.txt`, plus `/tmp/crowd-hunt-ecology-gate.txt` and `/tmp/crowd-hunt-ecology-gate.json`.
- A fresh parts dir is required. The default `/tmp/crowd-hunt-parts` cache is keyed by seed/kind/mode/n/cash only, not by price path or engine build. It held 940 parts from before the change, and a run without `--dir`/`--fresh` would silently reuse them.

| path (60 seeds) | beat vs BH | median Sharpe edge | median Sharpe | median multiple | flow/ADV med | flow/ADV max | crowded periods | crowded beat | uncrowded beat | crowded − uncrowded | gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $5k single (baseline) | **0.633** | **+0.113** | 0.429 | 1.500 | 0.002% | 0.09% | 0.000 | n/a | 0.633 | — | matches Quant's learnability (0.633 / +0.113) |
| **100 × $250k crowd (focal)** | 0.483 | −0.029 | 0.311 | 1.244 | 9.84% | 311% | 0.502 | **0.450** | **0.583** | **−0.133** | **PASS** (< 0.55; ≤ 0.533) |
| 100 × $250k crowd (mean) | 0.483 | −0.026 | 0.309 | 1.238 | 9.84% | 311% | 0.502 | 0.450 | 0.583 | −0.133 | PASS |
| $25M single (cross-check) | 0.383 | −0.198 | 0.112 | 0.884 | 8.06% | 158% | 0.447 | **0.367** | **0.467** | **−0.100** | PASS (< 0.55; ≤ 0.417) |
| **crowd − single** | +0.100 | +0.170 | +0.199 | +0.360 | +1.8 pp | — | +0.055 | **+0.083** | +0.117 | −0.033 | — |

Gate rule (Ledger): crowded beat < 0.55 **and** crowded ≤ uncrowded − 0.05 for the 100 × $250k crowd. Result: 0.450 < 0.55 and 0.450 ≤ 0.533, so **PASS**. The $25M single passes the same rule.
- The crowding *shape* now matches between the crowd and the $25M single. Crowded periods are 0.50 vs 0.45, and the crowded−uncrowded gap is −0.13 vs −0.10.
- The *level* does not match yet: the crowd beats BH more often than the single (+0.10 beat, +0.17 edge, multiple 1.24 vs 0.88).

**Why the crowd still does better than the single (new hunt, not a gate FAIL):** temporary impact (`execPrice`) and the `maxAdvPerTick` cap are still **per order**. Only permanent impact uses the shared tally.
- Splitting $25M into 100 orders pays about √100 = 10× less temporary impact. Probe on tape-01 cost over mid (spread + impact + fee):

| stock | ADV | one $25M buy | 100 × $250k |
|---|---|---|---|
| HLCN | $1.68B | 0.29% | 0.13% |
| VRDN | $560M | 0.38% | 0.14% |
| OSTV | $88M | 1.04% | 0.29% |

- The single pays this on both sides at about 57 rebalances, which explains most of the gap in multiple.
- The 3× ADV per-tick cap is per order too. The crowd's max flow (311% of ADV) is about twice the single's (158%).

| Hunt id | Check | Band | Status |
|---|---|---|---|
| `temp_impact_split_saving` | execution cost over mid: N accounts (or N clips in one tick) vs one order of the same total, same asset, same tick | ratio ≥ ~0.9 | ~~OPEN~~ **CLOSED 2026-10-09** (per-tick shared temp impact, see below). Was about 0.28–0.45. Matters for multiplayer, ghosts and NPC funds, and for one player clipping inside a tick. The design call (key temporary impact on the tick's or day's shared tally, or keep it per order as "execution skill") goes to Ledger / Quant |

**OPEN hunt (online only, Ledger deciding, not a gate FAIL):**

| Hunt id | Check | Band | Status |
|---|---|---|---|
| `alt_lifts_whale_mark_peak` | Liquidation value is worked out per account. When an alt buys after a whale, the shared tally lifts the whale's mark and peak. The summed peaks of whale + alt can sit above one account holding the same block: Quant SYN hunt-3 exit@721 **+$298,288 vs +$226,227**; box rerun matches, and AURH hunt-1 shows +$71,902 vs +$67,318. Realized P&L A+B always equals one account's (it never turns into realized profit) | summed peaks ≤ one-account peak (online rank / licenses) | **OPEN**, decision with Ledger. Does not affect solo |

Next: Ledger to decide `alt_lifts_whale_mark_peak` and `temp_impact_split_saving`. If temporary impact moves onto the shared tally, rerun this gate; the crowd and the single should then read alike in level as well.

## Per-tick shared temp impact — 2026-10-09

**Result: PASS.** `temp_impact_split_saving` is **CLOSED**, and the crowd gate PASSES again on the new engine. Per Ledger, this clears Quant for 25%.

**Engine (Quant, `engine-staging`):** temporary impact and the `maxAdvPerTick` (3 × ADV) cap now share one tally per asset, side and **tick** across all accounts (`AssetState.tickTraded`, `tallyTick`, `marginalImpact`).
- Every fill in a tick prices off the tick's pre-trade mid: `mid·(1 ± (halfSpread + (C(D+x) − C(D))/x))`, with `C(n) = n·Y·σ·√(n/ADV)`.
- An order that hits a used-up cap waits for the next tick.
- Ledger's rule: splitting **within** one tick (clips or accounts) must not save, about 1.0× of one order. Splitting **across** ticks may still save.

**Tests:** `npx vitest run` gives 11 files, **121/121 pass** (`/tmp/vitest-pertick.txt`). `impact-tally.test.ts` + `selfimpact.test.ts` give 24/24, including Quant's new `temp_split_same_tick`, `temp_split_across_ticks` and `temp_cap_shared`.

**Split probe** (`/workspace/scratch/temp-impact-split-pertick.ts`; proof `proof/temp-impact-split-pertick-20261009.txt`)
- Setup: tape-01, $25M total, live and `enterSimMode`.
- Measure: execution cost over each tick's pre-trade mid (spread + impact), with fees shown separately.
- Stock quantities are rounded to whole shares that split evenly.

| same-tick split vs one $25M order | HLCN | OSTV | SYN | AURH | band | result |
|---|---|---|---|---|---|---|
| one order, cost over mid (+ fees) | 18.5 bp (28.5) | 92.8 bp (102.8) | 167.6 bp (187.6) | 90.3 bp (100.3) | — | — |
| N = 2 / 10 / 100 accounts | 1.000000 | 1.000000 | 1.000000 | 1.000000 | 1.0000 ± 1e-3 | PASS |
| 720 clips, one account | 1.000000 | 1.000000 | 1.000000 | 1.000000 | 1.0000 ± 1e-3 | PASS |
| uneven 90 / 10 % two accounts | 1.000000 | 1.000000 | 1.000000 | 1.000000 | 1.0000 ± 1e-3 | PASS |
| whale + alt (either order) combined / one | 1.000000 | 1.000000 | 1.000000 | 1.000000 | ≥ 1 − 1e-4 | PASS (never cheaper) |

The worst same-tick |ratio − 1| across all 4 assets × live/eco is **6.7e-14**. Live and eco are identical because pools only touch prices at the close.

| cross-tick split (allowed, info) | HLCN | OSTV | SYN | AURH |
|---|---|---|---|---|
| 2 ticks, half each: saving incl. fees | 18.2% | 23.1% | 22.5% | 22.9% |
| 24 clips, one per tick (1 game day) | 49.8% | 62.9% | 62.0% | 62.0% |
| 100 accounts, one per tick | 56.7% | 71.9% | 69.2% | 71.0% |

Splitting across ticks still saves, which is fine under Ledger's rule. One player can get it alone by clipping one order per tick (no alts needed). Quant's test agrees: 720 ticks gives 0.50 on SYN and 0.46 on AURH.

**Cap-wait** (live, tape-01, `maxAdvPerTick` 3):

| check | OSTV | SYN | result |
|---|---|---|---|
| single 7.5 × ADV order | filled 1.000000 over 3 ticks (3.000 / 3.000 / 1.607 ADV), 0 left open | same (3.000 / 3.000 / 1.595) | PASS: not lost |
| whale 7.5 × ADV placed before alt 1 × ADV | whale filled 100%, alt filled 100%; alt's first fill is in the tick whale finishes (+2) | same | PASS: queue order kept, no queue jump or self-front-run |
| cap-exhaust: alt 3 × ADV + whale 2 × ADV (deferred) vs one account 5 × ADV | combined ratio 1.000000; whale pays 247.6 bp vs 240.8 bp placing alone | 1.000005; 781.6 vs 744.6 bp | PASS: not cheaper (whale pays *more*) |

Two notes, neither a FAIL:
- A `tif: 'day'` order still waiting on the cap at the day boundary expires. That's normal day-order behaviour; market orders default to `gtc`.
- Online, an alt could delay a whale by one tick by burning the cap. That costs the alt 3 × ADV at full impact; info only.

**Crowd gate** (fresh dir `/tmp/crowd-hunt-parts-pertick-20261009`, `--price-path ecology --sizes 100 --botcash 250000 --single 5000,25000000 --signals value_gap --seeds 60 --bigseeds 60 --jobs 6 --fresh`)
- 240 parts, wall time 115 s.
- Proof: `proof/crowd-hunt-pertick-gate.txt`, plus `/tmp/crowd-hunt-pertick-gate.{txt,json}`.

| path (60 seeds) | beat | median edge | median Sharpe | median mult | flow/ADV med / max | crowded periods | crowded beat | uncrowded beat | crowded − uncrowded | gate |
|---|---|---|---|---|---|---|---|---|---|---|
| $5k single | **0.633** | **+0.113** | 0.429 | 1.500 | 0.002% / 0.09% | 0 | n/a | 0.633 | — | unchanged |
| **100 × $250k crowd (focal)** | 0.383 | −0.207 | 0.117 | 0.852 | 8.06% / 190% | 0.449 | **0.367** | **0.500** | **−0.133** | **PASS** (< 0.55; ≤ 0.450) |
| 100 × $250k crowd (mean) | 0.383 | −0.199 | 0.112 | 0.836 | 8.06% / 190% | 0.449 | 0.367 | 0.483 | −0.117 | PASS |
| $25M single (cross-check) | 0.383 | −0.198 | 0.112 | 0.884 | 8.06% / 158% | 0.447 | 0.367 | 0.467 | −0.100 | PASS |
| crowd (focal) − single | **0.000** | −0.009 | +0.005 | −0.032 | 0 | +0.002 | **0.000** | +0.033 | −0.033 | — |

**The crowd and the $25M single now read alike.** Beat, crowded beat, median flow and crowded-period share are identical. Edge and Sharpe are within 0.01, and the multiple is within 0.05. The crowd is slightly *worse*, so splitting gives no advantage.
- Before the per-tick fix, the crowd read 0.483 / −0.029 / mult 1.24 against the single's 0.383 / −0.198 / 0.88.
- The $5k baseline is unchanged at 0.633 / +0.113.

**Clip and peak bands** (new engine):

| band | print | result |
|---|---|---|
| `self_impact_clip_ratio` SYN / AURH | **0.9790 / 0.9995** (≤ 1.5) | PASS, unchanged |
| `self_mark_peak_pump` SYN, 720 clips | peak $3,002,638.78 ≤ no-pump mark $3,004,446.11 | PASS, unchanged |
| `self_mark_peak_pump` SYN, 1 clip | $3,000,000.00 ≤ $3,000,879.54 | PASS |
| `impact_split_accounts` (permanent) SYN N=2/10/100/720 clips | 1.0003 / 1.0006 / 1.0007 / 0.9779 | PASS (≤ 1e-3 drift from fills now pricing off the tick mid) |
| `impact_split_accounts` (permanent) AURH | 1.0002 / 1.0003 / 1.0004 / 1.0021 | PASS |

**Hunt status:**
- `temp_impact_split_saving`: **CLOSED** (same-tick ratio 1.000000 everywhere).
- `alt_lifts_whale_mark_peak`: **stays OPEN** (online only, not a gate FAIL). Ledger logged it in `vision/ROADMAP.md` → "Must-fix before online ranking" (Alt-lifted peak): liquidation value for peak, rank and licenses becomes an exit against the asset's whole crowd. Solo is unaffected.


## Official 100% ecology sign-off — 2026-10-09 (Ledger-ordered, box staging copy)

**Result: PASS.** Every runnable band, gate and hunt passes on the 100% ecology cell, with no band or threshold changed. `NEW_WORLD_ECOLOGY` is still `'off'`: nothing is committed or flipped, and the flip is Ledger's call.

**Cell under test:** `/workspace/trading-game/engine-staging`.
- Not a git repo. src content hash `6c342edb…ece25e2` is identical at start and end; the per-file manifest is in the proof.
- Knobs: `FULL_MODE_DEFAULTS = { lnVVolScale: 1.15, valuePrint: 0.1 }` (full mode only), `valueClose 0.9`, `FULL_ECOLOGY = { mode: 'full', weight: 1 }`, `NEW_WORLD_ECOLOGY = 'off'`. Per-tick shared temporary impact and the day tally are in.
- `/workspace/tg` (git `fe1d971`, clean) has the knobs but no `FULL_MODE_DEFAULTS`, so it is not this cell.
- Full = `createWorld(seed, cfg, { ecology: 'full' })`. It is bit-identical to `enterSimMode`: 3 seeds × 400 days × tpd 24 with trades gave max |ΔlnP|, |ΔlnV| = 0.

**Script edits** (Tape's scripts only; no src):
- `scripts/balance/run.ts`: new `--ecology off|full`, default off. off passes no option; full passes `{ ecology: 'full' }` at both `createWorld` sites (lines 48 and 88 before the edit).
  - Default-off output is byte-identical to before the edit at 20 seeds: stdout matches apart from timing, `summary.json` matches apart from per-seed `msPerTick`, and all 20 `finalHash` values match.
- `scripts/crowd-hunt.ts`: new `--price-path full`, which uses the save-field path directly.

**Tests:** `npx vitest run` gives 13 files, **136/136 pass**. That includes `eco_off_fingerprint` (off and absent fields are byte-identical to the fixture), full = enterSimMode = hybrid weight 1, and the FLIP guard (still off).

| Band / gate / hunt | Band | 20 seeds | 60 seeds | Result |
|---|---|---|---|---|
| `vol_ratio_median:HLCN` | 0.85–1.4 | 0.908 | 0.949 | PASS |
| `vol_ratio_median:NMBS` | 0.85–1.4 | 0.950 | 0.942 | PASS |
| `vol_ratio_median:VRDN` | 0.85–1.4 | 0.914 | 0.900 | PASS |
| `vol_ratio_median:OSTV` | 0.85–1.4 | 0.964 | 0.972 | PASS |
| `vol_ratio_median:ATLF` | 0.85–1.4 | 0.913 | 0.932 | PASS |
| `vol_ratio_median:MRDB` | 0.85–1.4 | 1.008 | 1.029 | PASS |
| `vol_ratio_median:LMNP` | 0.85–1.4 | 0.985 | **0.871** | PASS (tightest at 60: +0.021) |
| `vol_ratio_median:PLLS` | 0.85–1.4 | 0.887 | 0.920 | PASS |
| `vol_ratio_median:CRVO` | 0.85–1.4 | 0.963 | 0.950 | PASS |
| `vol_ratio_median:VLMS` | 0.85–1.4 | 0.940 | 0.944 | PASS |
| `vol_ratio_median:AURH` | 0.85–1.4 | 0.939 | 0.959 | PASS |
| `vol_ratio_median:SNTL` | 0.85–1.4 | 0.883 | 0.890 | PASS |
| `vol_ratio_median:AUC` | 0.85–1.4 | 0.942 | 0.933 | PASS |
| `vol_ratio_median:LTX` | 0.85–1.4 | 0.931 | 0.927 | PASS |
| `vol_ratio_median:SYN` | 0.85–1.4 | 0.950 | 0.894 | PASS |
| `vol_ratio_median:GOLD` | 0.85–1.4 | **0.874** | **0.899** | PASS. Was 0.841 FAIL on the 25% blend. Per seed: 9/20 and 19/60 seeds under 0.85 (min 0.609); the band is on the median |
| `vol_ratio_median:OIL` | 0.85–1.4 | 0.936 | 0.907 | PASS |
| `gx_cagr_median` | 0–0.12 | 0.091 | 0.088 | PASS |
| `invalid_values` | 0 | 0 | 0 | PASS |
| `contraction_seed_share` | 0.5–1 | 0.900 | 0.817 | PASS |
| `bh_beats_random_share` | 0.1–0.9 | 0.550 | 0.617 | PASS |
| `bh_beats_momentum_share` | 0.1–0.9 | 0.750 | 0.750 | PASS |
| `bh_beats_contrarian_share` | 0.1–0.9 | 0.850 | 0.783 | PASS |
| `max_strategy_beats_bh_share` | ≤ 0.70 | 0.450 | 0.383 | PASS |
| `determinism_mismatch` | 0 | 0 | 0 | PASS |
| `learn_value_gap_sharpe_beat_share` (ecology-on cap) | 0.50–0.70 | — | **0.567** (34/60) | PASS |
| `learn_value_gap_median_sharpe_edge` (ecology-on cap) | ≤ +0.15 | — | **+0.1095** | PASS |
| `learn_regime_split` | ≥1 regime > 0.65 and ≥1 < 0.40 (≥ 10 seeds each) | — | contraction **0.894** (47 seeds); expansion **0.305** (59), recovery 0.395 (43); overheating 0.542 | PASS |
| `learn_crowded_beat_share`, 100 × $250k crowd (focal) | crowded < 0.55 and ≤ uncrowded − 0.05 | 0.400 vs 0.550 (−0.150), 20 bot seeds | **0.333 vs 0.517 (−0.183)** | PASS |
| $25M single (cross-check) | same rule | — | 0.317 vs 0.517 (−0.200); beat 0.317, edge −0.166 | PASS. Reads alike to the crowd: beat 0.300 / edge −0.154 / Sharpe 0.164 / mult 0.868 vs 0.317 / −0.166 / 0.167 / 0.874 |
| $5k single (crowd-hunt baseline) | info | — | beat 0.567, edge +0.1095, Sharpe 0.447, mult 1.594 | matches learnability |
| `self_impact_clip_ratio` (full path, tpd 720, $1M, 21 seeds) | ≤ 1.5 | — | SYN median 0.997 (max 1.028); AURH 0.996 (max 1.009); seed `clip` 0.953 / 0.991 | PASS |
| `self_mark_peak_pump` (full path, 21 seeds × SYN/AURH × 1/720 clips) | peak ≤ no-pump mark | — | 0 violations / 84 checks; max(peak − mark) = $0.00 | PASS |
| same-tick split (HLCN/OSTV/SYN/AURH, full + live; N = 2/10/100, 720 clips, 90/10) | 1.0000 ± 1e-3 | — | all 1.000000 (worst 6.7e-14) | PASS |
| whale + alt same tick | never cheaper (1e-4) | — | 1.000000 | PASS |
| cap-wait on the full path (7.5 × ADV fills in 3 ticks, queue kept, cap-exhaust alt + whale vs one) | not lost, not cheaper | — | filled 100%, alt after whale, ratio 1.000000 / 1.000005 | PASS |
| cross-tick split (allowed) | info | — | 2 ticks saves 18–23%; 24 per-tick clips save 50–63%; 100 accounts one per tick save 57–72% | info |
| `mom63` / `mom63_refined` | info only | — | 0.200 / −0.374; 0.400 / −0.094 | info |

The "Was 0.841 FAIL" note on GOLD is Quant's 25% blend print; Tape didn't rerun it here.

**No flips between 20 and 60 seeds.** Tightest margins at 60: LMNP +0.021 (it moved −0.114 from 20 to 60), SNTL +0.040, SYN +0.044, GOLD +0.049, VRDN +0.050. All pass, but the full cell runs about 5% below live vol on most names.

**NOT RUN (no harness or system yet):**
- `learn_stacked_beats_bh_share`: no stacked-signal harness. Single strategies are covered by `max_strategy_beats_bh_share` 0.383.
- §1 NPC rivals (M12), §2 rumors (M16), §3 world events (M21), §4 bankruptcy farming (M20), §5 ad farming (M48): none of these systems exist in engine-staging, so their bands can't show PASS.
- `alt_lifts_whale_mark_peak`: stays **OPEN** (online-only; ROADMAP "Must-fix before online ranking").
- Quant's own calibration gates (`scripts/ecology/gates.ts`): not part of this spec, not rerun.

**Proof:** `proof/ecology-full-signoff-20261009-{staging,balance-off-identity,balance-full-20,balance-full-60,crowd-gate,learnability,selfimpact,split,vitest}.txt` and `proof/ecology-full-signoff-20261009-summaries/`. Probes are in `/workspace/scratch/` (`full-vs-sim-equiv.ts`, `selfimpact-full.ts`, `temp-impact-split-full.ts`).

## Post-flip verify — 2026-10-09

**Result: PASS.** Quant flipped `NEW_WORLD_ECOLOGY = 'full'` in `engine-staging`, so `createWorld` with no ecology field now builds a full-mode world. Every check below passes. No src edits, nothing pushed.

**Script fix (needed before any rerun):**
- Tape's `run.ts` default "off" passed *no* option to `createWorld`. After the flip, that silently builds full worlds.
- `scripts/balance/run.ts`: `--ecology off` (still the **default**) now passes `{ ecology: 'off' }` explicitly, and `full` passes `{ ecology: 'full' }`. A new `--ecology default` passes no option, for verification only. The header always prints `ecology: <mode> (...)`, and `summary.json` always carries `ecology`.
- **Decision for Ledger:** the default stays `off` so historic bands reproduce. Say if the *official* balance default should become `full`, now that new worlds are full.
- `scripts/crowd-hunt.ts`: `--price-path live` now passes `{ ecology: 'off' }`, and `ecology` wraps an explicit off world in `enterSimMode`. `full` is unchanged.
- Our scratch probes in `/workspace/scratch` (`temp-impact-split*.ts`, `full-vs-sim-equiv.ts`, `selfimpact-full.ts`, `markpump.ts`, `roundtrip.ts`, `rankpump.ts`): live arms now pass `{ ecology: 'off' }`.

**Other callers that rely on the default (not ours, not edited; for Quant):**

| file | line | after the flip | impact |
|---|---|---|---|
| `scripts/ecology/gates.ts` | 54, `record` mode ("live inputs only, flag off") | builds **full** worlds | **wrong path**; `record` / `replay` tuning must pass `{ ecology: 'off' }` |
| `scripts/ecology/gates.ts` | 80, `sim` without `--weight` | `enterSimMode` on a full world | expected to be the same as before (full ≡ sim) |
| `scripts/sim.ts` | 34 (no `--ecology-weight`), 137 (round-trip cost) | headless sim now prints the **full** path by default | doc says live; decide whether that's intended |
| `scripts/learnability.ts` | 72, `--price-path ecology` | `enterSimMode` on a full world | expected to be the same; `live` already passes `{ ecology: 'off' }` |

| Check | Result | Numbers |
|---|---|---|
| Tarball sha256 | PASS | `18060d1b…ce153de408e` matches. Its 27 src files are identical to `engine-staging/src` and to `/workspace/tg/src/engine` at `e46c06e5` (`diff -r` clean) |
| src content hash | recorded | `e71df6d9…a8a3273` (pre-flip sign-off was `6c342edb…ece25e2`). Beyond the constant and tests, the flip commit's code diff also has `cause.maker = makerDecay + 0` (no −0 in the save; JSON-invisible) |
| vitest | PASS | staging **136/136** (13 files); `/workspace/tg` **191/191** (18 files) |
| `run.ts --seeds 20 --ecology off` vs pre-flip off | PASS | finalHash **20/20**; per-seed stats, stats and band results identical; stdout identical apart from timing and the new header line. Pre-flip hashes come from `/tmp/bal-off-before/summary.json`, the run behind `proof/ecology-full-signoff-20261009-balance-off-identity.txt`, now copied to `proof/postflip-20261009-summaries/preflip-balance-off-20.json` |
| `run.ts --seeds 20 --ecology full` vs sign-off full 20 | PASS | finalHash **20/20**; stats and bands identical |
| `run.ts --seeds 20 --ecology default` (bare `createWorld`) vs sign-off full 20 | PASS | finalHash **20/20**; stats and bands identical, so the bare default is now exactly full |
| crowd-hunt `--price-path full`, 8 seeds (N=100 × $250k, $5k, $25M) | PASS | **32/32** parts identical to the sign-off parts (equity path, periods, fees) |
| crowd-hunt `--price-path live`, 8 seeds, singles $5k / $250k / $25M | PASS (see note) | 35/44 parts identical to the only pre-flip live baseline, 9 differ by ≤ 1.1e-4 relative equity, 12 had no pre-flip counterpart. That baseline (02:29) **predates** the shared day tally and per-tick temporary impact. The live path itself didn't change at the flip: the balance off hashes (with trading strategies) match 20/20 |
| `run.ts --seeds 60 --ecology off` (new, for GOLD) | PASS | all bands pass |
| Quant's GOLD note | **confirmed** | per-seed corr(off, full) **0.981**; off median 0.940, 14/60 < 0.85, min 0.636 (tape-16); full median 0.899, 19/60 < 0.85, min 0.609 (tape-16); median full/off **0.965**. Our off column matches Quant's `/tmp/eco/gold/live60.txt` to ≤ 0.0005 on all 60 seeds |

On the live crowd-hunt row: the 9 small diffs are most likely from the shared-tally and per-tick engine changes made between 02:29 and the flip. That's an inference; there's no live crowd baseline from after those changes to prove it.

**Backlog (NOT RUN):**
- `learn_stacked_beats_bh_share`: two stacked public signals ≤ 0.70 on the multiple bands. Needs a stacked-signal harness, which doesn't exist yet. Single strategies are covered meanwhile by `max_strategy_beats_bh_share`: 0.383 at 60 seeds on the full path.

**Watch list (all pass today; re-check on any ecology or vol change):**
- **GOLD per-seed spread:** the full-path median is 0.899 (band on the median ≥ 0.85), but 19/60 seeds are under 0.85, with min 0.609 (tape-16). This is path luck inherited from live (live is 14/60, min 0.636, corr 0.98), not a dead book. If a per-seed band is ever added, GOLD fails it first.
- **LMNP thin margin:** full 60-seed median 0.871, only +0.021 over the floor, down from 0.985 at 20 seeds. Next tightest: SNTL 0.890, SYN 0.894, GOLD 0.899, VRDN 0.900.

**Proof:** `proof/postflip-20261009-{identity,script-diffs,balance-20,balance-off-60,crowd,gold}.txt` and `proof/postflip-20261009-summaries/`.

**Mid-run src change (not by Tape):** at 09:52:58, while this verify was running, someone (presumably Quant, on the alt-peak fix) changed engine-staging `src/engine/trading.ts` and `index.ts`. `liquidationOf` now marks each holding as a pro-rata share of a **crowd-wide** exit, with a new `crowdLong` export. `src/engine/altpeak.test.ts` was added at 09:59. The src hash is now `214f4708…b658e`.
- Every run above loaded the tarball engine (`e71df6d9…`): vitest (09:46–09:48), balance off/full/default (done 09:48–09:49), crowd live/full (done by 09:49), and balance off-60 (started about 09:50:20; tsx loads all modules at start).
- **Not yet verified on the 214f4708 engine.** The change touches `liquidationOf` (peak, drawdown, rank), which affects `self_mark_peak_pump` and `alt_lifts_whale_mark_peak`. The balance finalHashes come from a world with no accounts, and equity uses the mid mark, so balance bands are not expected to move.
