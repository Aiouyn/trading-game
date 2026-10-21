# 18-notes — Onboarding, Academy, Help and Explainability

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| guest_max_real_minutes | 30 | 10–120 | minutes of play | guest account requirement (§3.2.1) |
| onb_retail_grant | 250 | fixed by 00 §5.9 | $ | onboarding Retail-broker grant |
| onb_bg_discount_pct | 10 | 0–20 | % | background discount on first highlighted business |
| onb_first_trade_cap_pct | 20 | 5–50 | % of cash | first buy cap |
| onb_stop_explainer_drawdown | 1 | 0.5–5 | % below cost | stop explainer trigger |
| onb_stop_preset_pct | 5 | 2–15 | % below cost | pre-filled stop price |
| onb_choice_etf_amount | 1,000 | 200–2,000 | $ | first-choice ETF card amount |
| onb_goal_cards | 3 | 1–5 | goals | visible goals |
| onb_goal_ladder_days | 14 | 7–28 | real days | goal ladder lifetime |
| onb_jit_min_gap_real_min | 10 | 5–60 | real minutes | spacing of JIT intros |
| onb_jit_max_per_session | 3 | 1–6 | intros | JIT per session |
| onb_jit_later_real_min | 60 | 10–240 | real minutes | "Show me later" delay |
| onb_coach_gap_s | 20 | 5–60 | real seconds | coach mark spacing |
| onb_advisor_notes_per_day | 1 | 0–3 | notes / real day | advisor notes |
| acad_practice_notional | 100,000 | 10,000–10,000,000 | $ (sandbox) | practice balance |
| acad_practice_real_minutes_per_day | 120 | 30–480 | real minutes | sandbox runtime budget |
| acad_practice_idle_pause_min | 5 | 1–30 | real minutes | sandbox auto-pause |
| acad_practice_max_life_h | 24 | 1–72 | real hours | sandbox auto-end |
| acad_knowledge_pass_pct | 70 | 50–100 | % | knowledge quiz pass |
| expl_junior_base / expl_junior_pct_nw | 40 / 0.005% | 0–500 / 0–0.05% | $ / NW per game week | Junior analyst salary |
| expl_senior_base / expl_senior_pct_nw | 150 / 0.015% | 0–2,000 / 0–0.1% | $ / NW per game week | Senior analyst salary |
| expl_desk_base / expl_desk_pct_nw | 2,500 / 0.03% | 0–50,000 / 0–0.2% | $ / NW per game week | Research Desk upkeep |
| expl_desk_max_window_days | 1,344 | 30–5,000 | game days | desk query window |
| expl_desk_queries_per_real_hour | 60 | 10–600 | queries | desk rate limit |

## 2. Decisions (DEFAULTs and resolutions)

- §3.2.2: Character placed into a Penny league group at creation (needs 15). DEFAULT.
- §3.2.3: Background discount posted as FAUCET rebate `ONBOARD_BG_REBATE`; Retail grant restricted 72 real hours (ROADMAP C5 decision reused); grant once per account identity. DEFAULT.
- §3.3: Step machine with triggers, targets and fallbacks (equity session closed → FX or crypto major; Major event; halt; no slot). DEFAULT.
- §3.3.6: Requested of 09: a new business's first operation runs at purchase tick + 1 (resolves conflict between 00's hourly stagger and 04's 60-second first dollar). DEFAULT (09 may override within 6 ticks).
- §3.3.7: Starter watch follows 14: Kessler Field, PP 1, `ACCT_STARTER_GIFT` $840, unsellable 7 real days; 18 only presents it.
- §3.2.3: The $250 Retail grant pays the LIC1 fee (`ACCT_ONBOARDING_GRANT` + `ACCT_LICENSE_FEE`, cash unchanged) via `acct.onboard.claimRetail`.
- §3.4: Rival follows 15 §3.5.5 (closest above, ≤ 3× NW, NPC row fallback).
- §3.3.5: Rival fallback to the closest NPC rival fund (resolves ROADMAP conflict C1 for the persistent world).
- §3.4: Goal ladder G01–G20 with cosmetic rewards only. DEFAULT.
- §3.8: 60 JIT introductions covering every system; scheduler limits. DEFAULT. ROADMAP N10 (liquidation line) adopted as JIT J17.
- §3.10: 67 Academy courses across 16 tracks; practice worlds (replay of public tape / synthetic scenarios) in isolated ledger namespaces; drills list. DEFAULT.
- §3.10.3: Resolves ROADMAP Q4 (solo progress carry-over): there is no solo mode; practice worlds carry nothing except cosmetic badges.
- §3.10.3: Resolves ROADMAP Q8 indirectly: Held never applies inside practice worlds (they have no legal system for the live character).
- §3.10.5: Licence exams (14) are hosted as designated Academy quizzes: trade_5 → LIC2, deriv_1 → LIC3, corp_3 → LIC4; scored by 14 `acct.exam.submit`, retake after 1 game day. DEFAULT (Mathis may override).
- §3.12: Explainability ladder levels L0–L4 with prices (base + % of NW per game week), payment at the last trading day's close, reason codes `EXPLAIN_ANALYST_SALARY`, `EXPLAIN_DESK_UPKEEP`. DEFAULT.
- §3.12: Research Desk unlock R3 (= Mogul in 00's names; the ROADMAP's "R3 Derivatives+").
- §3.13: Advisor notes (W08) from public events only, max 1 per real day, default on R0–R2. DEFAULT.
- §3.16: Resolves ROADMAP Q2 as a binding target (median R1 by end of real day 2; 60% within two sessions); 09 owns the payback number; 20 gates it.
- §3.14: Late-joiner card with three facts from 16's history digest. DEFAULT.

## 3. Interfaces assumed

- 02/19: sandbox worker for isolated engine instances with their own ledger namespace `sandbox:{id}`, clock controls, envelope field `world`.
- 03: reason codes `START_CASH`, `ONBOARD_RETAIL_GRANT` (FAUCET, restricted bucket), `ONBOARD_BG_REBATE` (FAUCET), `EXPLAIN_ANALYST_SALARY`, `EXPLAIN_DESK_UPKEEP` (SINK); P13 invariant forbidding cross-namespace entries.
- 05: `explainTrade(tradeId)` cause vector; `explainMove(assetId, fromDay, toDay)` with flow by pool type and k-anonymity; first-trade cap read through `onb.firstTradeCap(chrId)`.
- 06/13: LIC1 Retail includes equities, ETFs and spot crypto majors (assumed); LIC0/LIC1 disallow shorting by default.
- 09: catalog with B1 "beginner-friendly" flag and highlighted sets per background; `lostSales` capacity signal; `biz.firstOpTick = purchaseTick + 1`; 85% sell-back.
- 10: `listing.belowAppraisal`; storefront slots; rented room rent.
- 11: starter run (T0 minimum, ≤ 24 ticks, free "Public tape" dataset); honeypot threshold.
- 12: `surface.weakest(chrId)`; drill-safe practice session.
- 13: protection and rookie-zone numbers.
- 14: `acct.exam.submit`, `acct.license.buy/renew`, onboarding grant posting, rank evaluation at day close.
- 15: rival selection rule (3× NW) and league placement.
- 14: starter gift (`lid_kessler_field`); cosmetic catalog for goal rewards; titles with 0 PP for badges; fresh-start flow.
- 15: `league.placeNew(chrId)`; public profile projection; anti-alt identity signals.
- 16: Wire items with targets; `npcRival.closestAbove(nw)`; history digest; advisor event-asset links; NPC advisor assignment; scenario NPC models.
- 17: screens ONB-, ACD-, HLP-, RD-, PF-04, SH-09/13/14; moment queue; banned-word lint.
- 20: scenario seed registry; onboarding bots for funnel gates; desk-strategy harness gate.
- 21: identity hash for grant-once rule; feature flags; test-shock labelling.

## 4. Content needed (22)

- 4 backgrounds with highlighted B1 sets (names: Freelance dev studio, IT support shop, Sneaker resale, Food truck, Coffee cart are already in 01/04).
- 20 goal definitions (§3.4) with cosmetic reward items (card designs "First steps", "Two doors", "Owner"; titles "Guarded"; decor: league pennant, pen, laptop lab, house keys, First Dollar bill, watch box; crest frame, storefront awning style, trade receipt frame, watchlist theme).
- 60 JIT content bundles (§3.8.2), en and fr.
- 14 coach marks (§3.9).
- 67 Academy courses (§3.10.2) with lessons, ≈300 lesson texts, 15 widgets, 8 drills, quiz banks (≥ 18 questions per knowledge course, ≥ 40 for each of the 3 licence-exam quizzes (trade_5, deriv_1, corp_3)).
- 6 Academy instructor NPCs (names to invent in 22; one per pair of tracks).
- ≥ 400 glossary terms; ≈230 help articles (one per 17 §7 screen id) plus course topic articles.
- Explanation templates: trade one-liners (≥ 30 variants per dominant cause), desk memos (≥ 60 sentence templates), waterfall labels; advisor note templates (≥ 40).
- Scenario seeds used by courses: crash week, overheating, credit crunch, bank run, sovereign stress, crypto winter, earnings season, quiet market (20 registers them).
