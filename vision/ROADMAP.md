# ROADMAP.md: from Phase 0 to launch
### Ledger, 2026-10-09 · status: **PROPOSAL** (nothing here is approved unless it cites the bible or RESOLVED-NUMBERS)
Sources: `MASTER-BIBLE.md` (PART V final calls, PART VI approved items 1–10), `RESOLVED-NUMBERS.md`, `01`–`05`. Teammate specs: Quant's six specs in `specs/` (landed 01:01, while this was being written) are reconciled here. Where they differ from this file, the items below follow Quant's spec and the differences are in the **Conflicts log** at the end. Quant labels these items "Phase 0". The phase label doesn't matter here, the order does.

---

## 0. State of play (honest, as of 2026-10-09 00:58 Paris)

**Committed in the game repo on Mathis's PC** (mirrored on the box at `review/app`, HEAD `02b780e`):
- Engine (Quant): seeded deterministic price sim (factor GBM, Student-t, GARCH, Kou jumps, regimes, circuit breaker). Default universe: 12 stocks, 3 crypto (AUC, LTX, SYN), Gold and Crude, plus the GX index. Market, limit and stop orders with spread, square-root impact and fees. Long only, no margin. Portfolio math (realized and unrealized P&L, day P&L, drawdown) and deterministic volume.
- App (Forge): live trading screen (chart, watchlist, positions, ticket with the 20% first-trade cap, Wire), day clock with speeds 1×/4×/20× and pause, IndexedDB save and load, a license gate (GOLD and OIL locked until Pro at Owner $250k), and the Portfolio tab.
- Tests (Tape): core-loop e2e at 1440 and 390 px, Portfolio e2e, balance harness (20/60 seeds, fee-aware strategies, `max_strategy_beats_bh_share ≤ 0.7`). Last PASS: `c2598bc` + `73ed16d`.
- Design (Velvet): DESIGN.md v1.2 with the onboarding (§6b–6d) and rank-up specs. **The specs exist, but none of it is built.**

**Done on the box but NOT yet on the PC** (waits for the PC to come back online):
- Quant's news-reaction balance fix (`engine-drop3.tar`: 70% of a jump prints at once and 30% drifts in, plus jump compensation; rank IC −0.051 → +0.026).
- Forge's three Portfolio fixes (signed drawdown, brass net-worth line with the $5k Start line). The minus-sign item was dropped, per Velvet.

**In progress on the box:** `engine-staging/src/engine/news.ts` (Quant). It covers the earnings calendar (every 63 game days per stock), a macro print every 21, headlines generated from jumps, and `newsPricedIn()`. Quant's specs call it task #3. On the box it has no test file yet, and it isn't on the PC.

**Specced, not built:** Quant's `specs/` (rival funds, rumors, world events, T1 businesses, ghosts, scenario seeds).

**Not started:** onboarding, the e2e hooks, businesses, rival funds, i18n (no string-key layer exists in `02b780e`, even though PART V #8 says "keys in from day one"), and everything from Phase 1 onward.

---

## 1. Ground rules for this roadmap

1. **Phase order differs from bible PART IV.** PART IV went online → seasons/social → adversarial+AI. This roadmap does solo depth, then **the AI tree and espionage solo against computer-run rivals**, and only then goes online. It's cheaper (no server bills before the fun is proven), it fits on one PC, and the engine is pure and deterministic, so the same code moves to the server later. **This needs Mathis's confirmation (Q1).**
2. **Real-time rules in solo:** every bible rule written in *real hours* (hidden-session accrual, scan cadence, cooldowns, Held, protection windows) runs on **game time in solo, at 1 real hour = 1 game day at 1× speed**. So the speed slider scales everything consistently, and no solo rule can be skipped by fast-forwarding. Online (Phase 3+) uses real hours exactly as written.
3. **Engine purity holds:** every new system is `src/engine/` logic with an API (Quant). The app only renders and sends intents (Forge). Every number ships with a seeded harness check (Tape).
4. **Every money movement gets a reason code** from Phase 1 (item M13). The ads, bankruptcy, fines and stabilizer accounting below all depend on it.
5. **Sizes:** S ≤ 1 focused task (about a day of agent work plus one Tape run), M = 2–4 tasks, L = 5+ tasks or a new subsystem.

---

## PART 1 — ORDERED ROADMAP

### Phase 0 — finish the solo sandbox

#### M01 · Land the queued work on the PC · **S**
- **Goal:** get the PC repo to the state the team already reported, in the agreed order.
- **Owners:** Quant (engine fix) → Forge (Portfolio batch) → Tape (one full run).
- **Depends on:** the PC being online with the Grok Bot app connected.
- **Acceptance:** commits land in this order: Quant's news-reaction fix, Forge's Portfolio batch, then Tape's single batch (typecheck, lint, Vitest, build, e2e at 1440 and 390, `npm run sim`, balance at 20 and 60 seeds). Quant's box numbers reproduce on the PC within ±0.05 on every share metric: buy-and-hold beats momentum 0.767, contrarian 0.783 and random 0.617, and the highest share where any strategy beats buy-and-hold at 0.383 (the gate is ≤ 0.7). Old saves still load and price identically. Tape posts one PASS or FAIL.

#### M02 · Test-only engine hook + e2e hooks · **S**
- **Goal:** let Tape reach onboarding states on demand without touching normal play.
- **Owners:** Quant (`shockPrice(state, assetId, pct)` in `src/engine`, marked test-only in ENGINE.md), Forge (`__tg.e2e.grantCash(n)`, `__tg.e2e.setCash(n)` to push net worth under $1,000 for bankruptcy and ad tests, and `__tg.e2e.shock(id, pct)` that calls `shockPrice`, only when the URL has `?e2e`). **Ledger 2026-10-09:** `shockPrice` moves price only (an overreaction the pools then work off); a separate test-only `shockValue(state, assetId, pct)` moves fundamental value, for world-event tests.
- **Depends on:** M01.
- **Acceptance:** a unit test proves `shockPrice` changes only that asset's price (and `shockValue` only its value) and leaves every RNG stream untouched (the next 1,000 ticks of every other asset are bit-identical). In a production build without `?e2e`, `window.__tg.e2e` is `undefined` (Playwright check). The hooks never write to a save.

#### M03 · String keys (i18n skeleton, EN only) · **S**
- **Goal:** honour PART V #8 ("keys in from day one") before onboarding adds about 40 new strings.
- **Owner:** Forge. Velvet reviews copy and voice.
- **Depends on:** M01.
- **Acceptance:** every user-visible string in `src/components` and `src/game` comes from `messages/en.json` through one `t()` helper. A lint or test fails on new raw JSX text. Numbers and dates are formatted by locale (`Intl`). There's an empty `fr.json` with a missing-key fallback to EN. Screenshots are pixel-identical to before (Tape visual diff at 1440 and 390).

#### M04 · News & events v1 (engine) · **M**
- **Goal:** give every meaningful price move a headline, which the onboarding, Wire, daily close and trade journal all need.
- **Owner:** Quant. Tape runs the harness.
- **Depends on:** M01.
- **Scope:** finish `news.ts`: an earnings calendar (each stock every 63 game days, with day offsets from a hash), a macro print every 21 game days, jump-driven headlines from a template library (≥ 60 templates per 01 §10.2, fictional names only), `wire(state)`, and `newsPricedIn(item, tick)`.
- **Acceptance:**
  - Headlines never consume a price RNG stream, so an old save and the same seed price bit-identically with news on or off.
  - Every jump with |log size| ≥ 2% gets exactly one headline.
  - `newsPricedIn` matches the price model's 0.7 + 0.3·(1 − 2^(−days/half-life)) within 0.01.
  - Balance bands are unchanged at 60 seeds.
  - **New harness strategy** `news_drift` (buy after a positive item when priced-in < 0.85, sell at 0.97): it must not beat buy-and-hold on more than 70% of seeds after fees. See Risk R3.

#### M05 · Onboarding, rank-up and the R0 shell (DESIGN v1.2 §6b–6d) · **M**
- **Goal:** first session as specced: cold open, first news card, simple ticket, first receipt, stop-loss explainer, goals card, Broke → Hustler ceremony, R0 crack.
- **Owner:** Forge builds. Velvet reviews screenshots. Tape writes e2e with the M02 hooks.
- **Depends on:** M02, M03, M04 (the first news card needs real headlines).
- **Acceptance:**
  - Every step in §6b fires once, is saved, and can be replayed from More → "Replay intro".
  - "I've played before" skips steps 2–3 but keeps the 20% cap.
  - The stop-loss button only **pre-fills** the ticket and never places an order (e2e asserts no new order until confirm).
  - The rank-up waits for no pending order plus 10 s idle, is skippable after 1 s, and honours reduced motion.
  - Velvet signs off screenshots at 1440 and 390. e2e covers §6c (idle wait, no pending order, "Keep going").
  - **Open item:** reaching $20k by trading alone is practically out of reach in Phase 0 (see Q2). The ceremony is built and tested via `grantCash`, whatever Mathis decides.

#### M06 · Phase 0 exit gate: the 10-minute fun check · **S**
- **Goal:** the bible's Phase 0 exit: a new player understands the loop in 10 minutes and wants to come back.
- **Owners:** Tape (scripted checklist and timing), Mathis (one real playtest), Velvet (notes).
- **Depends on:** M05.
- **Acceptance:** on a fresh profile, first trade in under 90 s, the first news card shows a real engine headline, and no console errors (Tape). Mathis plays one 10-minute session and answers three questions ("Did you get it?", "What confused you?", "Would you open it tomorrow?"). Every "confused" answer becomes a ticket. Tape posts the gate PASS.

### Phase 1 — solo depth (fully specced items first)

#### M07 · Daily close report + "priced in so far" on the Wire · **S**
- **Goal:** Forge's daily close card plus Quant's priced-in readout.
- **Owners:** Quant (`dayClose(state, playerId)`: day P&L, best and worst position, the headline with the largest P&L impact on the player, NW vs GX), Forge (card at each game-day close), Velvet (spec).
- **Depends on:** M04, M05.
- **Acceptance:** one card per game day, which queues behind the rank-up and never interrupts a pending order. Numbers equal portfolio math to the cent (unit test across 30 seeded days). It's dismissible, with a history list in Portfolio. Priced-in is shown in **coarse bands** (Early / Mid / Late / Done) per Risk R3, not as an exact %.

#### M08 · Benchmark ghost on Portfolio · **S**
- **Goal:** Tape's honest yardstick: what an equal-weight basket bought on the player's day 1 would be worth now.
- **Owners:** Quant (the `buyAndHold` ghost from `specs/quant-ghosts.md`: equal-weight **stocks**, bought once, same fees as the player), Forge (a second faint line on the NW chart plus a number). Velvet styles it (`fg-faint`).
- **Depends on:** M01.
- **Acceptance:** matches Tape's harness buy-and-hold to the cent on 20 seeds. The label reads "Equal-weight basket since your day 1". No advice wording (Velvet voice check).

#### M09 · Trade journal v1 + trade replay · **M** (bible VI #9 + Forge's replay)
- **Goal:** every closed trade explains itself and can be replayed on its chart.
- **Owners:** Quant (`explainTrade(state, tradeId)`: splits realized P&L into market (GX beta), sector factor, news jumps (with headline ids), residual noise, and fees + slippage), Forge (journal list, replay chart with entry and exit markers, plus "if held to now"), Velvet (spec).
- **Depends on:** M04.
- **Acceptance:** the parts sum to realized P&L within $0.01 on 500 seeded trades. Each entry gets one generated sentence ("Most of this loss came from the sector, not the company") with no advice wording. The replay re-renders from the save's history with no extra storage beyond fills.

#### M10 · Keyboard-first desktop trading · **S**
- **Goal:** fast desktop play; the phone doesn't change.
- **Owners:** Forge. Velvet does the shortcut sheet.
- **Depends on:** M05.
- **Acceptance:** `B`/`S` opens the ticket, `1`–`4` picks a size chip, `Enter` confirms, `Esc` cancels, `Space` pauses or resumes, `/` searches assets, `?` opens the help overlay. Nothing executes without the confirm step. Shortcuts are off while typing in inputs and on touch devices. An e2e test covers a keyboard-only buy → fill → sell. Screen-reader labels per 04 §13.

#### M11 · Run files: export, import and exact replay · **M**
- **Goal:** Tape's shareable runs and perfect bug repros.
- **Owners:** Quant (format: engine version, config hash, seed, ordered intents with ticks, final state hash), Forge (export/import UI), Tape (repro workflow).
- **Depends on:** M01.
- **Acceptance:**
  - Import on a clean profile reproduces final NW to the cent and the same state hash.
  - 30 game days of normal play fit in < 200 KB gzipped.
  - Engine-version mismatches are refused with a clear message.
  - A tampered file is detected by re-sim mismatch.
  - **Run files never count for anything ranked** (see Risk R1).

#### M12 · Computer-run rival funds v1 + "Rivals" board · **M** (bible VI #5)
- **Goal:** the minute-4 rival without multiplayer; a living leaderboard.
- **Owners:** Quant (6 styled funds trading through the normal order API), Forge (Rivals board, profile cards), Velvet (fund identities: fictional names and marks).
- **Depends on:** M04.
- **Spec:** `specs/quant-npc-funds.md`. Three rivals, shown as Hale & Ward (value, rebalances every 21 game days), Pinn Partners (momentum, every 21) and Vetch (crypto degen, every 5). **Ledger 2026-10-09:** they are named slices of the value, trend and crypto-trend pools and clear through the same impact as everyone else (no separate `placeOrder` path). Hale & Ward starts at $7,000 as the reachable rival; Pinn and Vetch start at $50,000. Each slice is capped at 5% of ADV per rebalance. The board shows names and net worth only. Later (Phase 2) they gain models (M26).
- **Acceptance (Quant's):** deterministic, and `rivals: []` gives the same price fingerprint as the field being absent. Over 60 seeds each rival's median 5-year multiple is between 0.4× and 2.5×, and no rival beats buy-and-hold on > 70% of seeds. **Ledger addition:** the minute-4 rival (04 §4.2) needs someone close to $5k. A $50k rival is 10× the player, so see conflict C1.

> **Items M01–M12 are ready to start.** Below, specs are lighter and get filled in as each one is scheduled.

#### Phase 1 continued

| ID | Milestone | Goal | Owners | Depends on | Acceptance (short) | Size |
|---|---|---|---|---|---|---|
| M13 | **Money ledger with reason codes + faucet/sink dashboard (observe-only)** | Every cash movement tagged (`FILL`, `FEE`, `BIZ_PROFIT`, `UPKEEP`, `FRESH_START`, `AD_GRANT`, `FINE`…); 01 §8.1 dashboard | Quant, Forge | M01 | Σ tagged flows = Δcash on every tick across 60 seeds; dashboard behind a dev flag | M |
| M14 | **Small businesses v1 (T1)** per `specs/quant-t1-business.md`: Corner Cart $2,500, Phone Repair $3,000, Night Clean $4,000, Courier Bikes $5,000; explicit daily collect, capacity axis, condition decay with maintain, 85% sell-back | The steady-income half of the game, and the path to Hustler ($20k) | Quant (engine), Forge (business screens), Velvet (spec) | M13, **Q2 (pace)** | Quant's: exact cash to the cent, save round-trip, missed days pay nothing, business-only player ends at $8k–$14k after 63 game days. That pace gives Hustler after ~100 game days, which conflicts with 04 §3.2 (see Q2, C4) | M |
| M15 | **Businesses T2–T3 + 3 districts + cluster bonus** | Owner ($250k) path; 15 businesses total (01 §10.2) | Quant, Forge, Velvet | M14 | Wealth curve day 1 ≈ $15k, day 7 ≈ $500k for the median scripted player (01 §8.4) ± 50% | L |
| M16 | **Rumors, tips and the NPC market regulator (ECA)** | Bible VI #7. v1 = `specs/quant-rumors.md` (3 rumors per game week, 55% true, resolved at the earnings print; insider tips only from crime actions, always true, flagged when traded). v2 = source track records + the regulator detection in deep-dive §2.5 | Quant (tips, flags, `surveillanceScore`), Tape (ECA thresholds, evidence, tribunal-lite), Forge, Velvet | M04, M13 | v1: Quant's (55% ± 8 pts true over 200 seeds; rumor trades never flagged; insider trades always flagged). v2: blind rumor-following EV ≤ 0 after fees; wrongful convictions < 3% | L |
| M17 | **Luck-vs-skill report** per `specs/quant-ghosts.md`: `ghostReport()` vs buy-and-hold, random and no-fees ghosts on a copy of the same seed; default 21-game-day window, also feeds the daily close | Quant, Forge, Velvet | M08, M11 | Quant's: no-order world gives percentile 50; a worst-stock save scores below buy-and-hold; < 50 ms per 21-day window on the PC. v2 (Ledger, optional): 200 random ghosts for a smoother percentile | M |
| M18 | **Scenario challenges** per `specs/quant-scenario-seeds.md` (contraction-week, overheating, earnings-heavy, quiet; flash and crypto-winter after M21) as ring-fenced challenges (02 §2.4 rules: separate portfolio, no money carries over) | Quant (seeds), Forge, Velvet | M11 | Each scenario reproduces its condition; buy-and-hold not positive in every scenario; challenge cash can never reach the main save (test) | M |
| M19 | **Weekly seed challenge (solo)** | Tape's idea: same 30 game days for everyone | Forge, Quant, Tape | M11, M18, **Q5** | Local results vs ghosts/NPC funds; **no global ranking until Q5 is decided** (Risk R1) | M |
| M20 | **Bankruptcy & fresh start (solo)** | Bible VI #8; deep-dive §2.6 | Quant, Forge, Tape | M13 | All rules in §2.6 covered by tests; a busted save is never a dead end | M |
| M21 | **World-event generator v1** per `specs/quant-world-events.md` (crash, bubble, crisis, flash; one at a time; own stream `macro:events`) with the rates reconciled against §2.8 (conflict C3) | Quant | M04 | Quant's: ≥ 20 of each kind over 200 seeds × 5 years, never two at once, byte-identical replay, odds 0 = today's fingerprint; GX CAGR re-banded with events on | M |
| M22 | **Phase 1 gate** | Fun + economy check | Tape, Mathis | M14–M21 | Harness bands, wealth curve, fun check repeated with businesses | S |

### Phase 2 — the AI research tree and the espionage minigame (solo vs computer-run rivals)

All formulas are from `05`, `03 §4.6` and RESOLVED-NUMBERS (MCS, C3 run sizes, A1 DU budgets, hidden sessions, laundering, honeypots). The **targets and attackers are the M12 rival funds**, upgraded with models.

| ID | Milestone | Owners | Depends on | Acceptance (short) | Size |
|---|---|---|---|---|---|
| M23 | **Lab v1:** compute (PFLOP-day engine unit, GPUh display, $0.12/GPUh spot), data (DQU), algorithm nodes → `MCS = A·k·C^α·D^β` (α 0.34, β 0.28); training runs with failure odds; C3 run-size table T0–T2 | Ledger (tree spec), Quant (engine), Forge, Velvet (Lab screen) | M13, M22 | MCS matches the `05 §11` worked example; T0 run costs $120–$1,200, T1 $1.2k–$6k (C3) | L |
| M24 | **Trading AI as block strategy graphs** + mandates (max position, max drawdown, allowed assets) + A1 DU caps enforced client-side | Forge (runtime), Ledger (blocks), Quant (order API) | M23 | AI orders use the same API as humans; mandate breaches impossible (property test); DU cap respected | L |
| M25 | **Analyst signal AI** (estimate = truth + N(0, σ), σ shrinking with MCS) | Quant, Ledger | M23 | Signal narrows uncertainty but never guarantees profit (harness: best signal strategy beats BH on < 70% of seeds) | M |
| M26 | **Rival funds get models, defense and honeypots** | Quant, Ledger, Tape | M12, M23 | Each fund has a tier, AP/DP_ai per B2 ranges and a list size per 03 §4.6.4 | M |
| M27 | **Connections panel, decoy anomalies (0.05/h), defense-AI auto-scans** (04 §10.5, 03 §4.6.4–4.6.5) | Velvet (spec), Forge, Tape | M26 | Clue mixes match the 03 table (Whisper ~38% real, Tap ~58%, Siphon ~74%) over 10k simulated hours | M |
| M28 | **Cyber-attack AI + hidden sessions on rival funds** (Whisper/Tap/Siphon), distillation students, laundering 0.7/0.35, residue floor 0.03 | Ledger, Tape, Quant, Forge | M27 | Progress curve `P = 0.85(1 − e^(−k·h_eff))` reproduces the 03 reference points; student never exceeds teacher | L |
| M29 | **Honeypot (decoy) models**, both sides; deep-dive §2.3 | Tape, Ledger, Forge | M28 | Poison scaling and evidence caps from §2.3 hold in the harness | M |
| M30 | **Evidence, regulators and in-game court v1** (civil + tribunal; fines S1–S5 by `03 §1`; bars 40/55/70; counsel ±0.75 logit) | Tape, Forge, Velvet (docket, verdict card) | M16, M28 | Wrongful convictions < 3%; crime EV 0.8–1.2× honest at 2–4× variance (03 §16) | L |
| M31 | **Rival crews attack the player** (with the 72-game-hour protection, a rookie zone, the 1% breach floor and offline protection) | Tape, Quant | M27, M30 | Rookies attacked < 5% (harness); no attack before the protection ends | M |
| M32 | **AI tournament v0 (solo)**: your AI vs the house AIs on secret seeds; deep-dive §2.4 | Forge, Ledger, Tape | M24, M26 | Isolated runs reproducible; scoring per §2.4 | M |
| M33 | **Phase 2 gate** | Tape | M23–M32 | Tape's 03 §16 metric set over 20 seeds; Mathis playtest of one "heist" | M |

### Phase 3 — one shared online world

| ID | Milestone | Owners | Depends on | Acceptance (short) | Size |
|---|---|---|---|---|---|
| M34 | **Hosting + server skeleton:** world process, gateway, Postgres event log, Redis, S3 snapshots; engine moves to `packages/engine` (decision row 1) | Forge | **Q7**, M33 | One world ticks every 5 s for 72 h with zero missed ticks | L |
| M35 | **Accounts:** guest-first, email, Google (Apple at M47); profiles, handles, country (02 §2.2) | Forge | M34 | Guest → account upgrade keeps progress; one country change per 180 days | M |
| M36 | **Shared market:** uniform-price batch auction with real players + NPC liquidity; commit-reveal entropy; server authority (clients send intents only) | Quant, Forge | M34 | Same intents ⇒ same state on replay; no client can see the next tick's entropy | L |
| M37 | **Anti-cheat v1 + integrity telemetry + admin console v1** (alts, P2P caps by account age, collusion graph, reason-coded mint/burn per tick) | Forge, Tape | M36 | Synthetic alt rings detected ≥ 90% in the harness; admin minting needs two approvals | L |
| M38 | **Leaderboards:** NWI global, country (≥ 500 active, else regional) and seasonal ladders (richest this season, fastest climber with the $100k floor) + weekly leagues | Forge, Quant, Velvet | M36 | Redis boards; top 100 live per game hour; 3-day-average finish rule (02 §6.4) | M |
| M39 | **Shared world events live + "While You Were Away"** (§2.8 rates; telegraphing; timezone rotation) | Quant, Forge, Velvet | M21, M36 | Every major event telegraphed ≥ 8 real hours ahead | M |
| M40 | **Contracts v1 + Clearing House escrow** (transfer, loan, lease, revenue share) | Forge, Tape | M37 | Atomic swaps at a tick; 0.5% registration + 2% P2P tax | L |
| M41 | **Player company listings** (bible VI #1); deep-dive §2.1 | Quant, Forge, Tape, Velvet | M38, M40 | Every rule in §2.1 tested; pump-and-dump harness bot loses money in expectation | L |
| M42 | **Player-run funds** (bible VI #2); deep-dive §2.2 | Quant, Forge, Tape, Velvet | M40 | A manager can never withdraw investor money (property test over 10k random action sequences) | L |
| M43 | **Weekly AI tournament (global, server-run)**; deep-dive §2.4 | Forge, Ledger, Tape | M24, M36 | Runs finish ≤ 24 h after lock; results reproducible from published seeds after reveal | M |
| M44 | **PvP espionage + court between players** (hidden sessions, honeypots, 72 h protection, dogpile cap, heat shield, punch-down tax) | Tape, Ledger, Forge | M30, M37 | 03 §16 gates over 20 seeds with synthetic players | L |
| M45 | **Load & integrity gate** (bible Phase 1 exit) | Tape | M34–M44 | 4k CCU synthetic, p99 tick < 2.5 s; 2 weeks with zero ledger mismatch | M |

### Phase 4 — mobile, monetization, launch

| ID | Milestone | Owners | Depends on | Acceptance (short) | Size |
|---|---|---|---|---|---|
| M46 | **PWA + Web Push** (manifest, installable shell, read-only offline snapshot, ≤ 5 pushes/day, quiet hours) | Forge | M45 | Lighthouse PWA pass; push cap enforced server-side | M |
| M47 | **Capacitor iOS/Android** (native push, haptics on fills, biometric unlock, Sign in with Apple) | Forge, Velvet (store assets) | M46 | Store builds pass internal review checklist (Tape) | L |
| M48 | **Rewarded ads for broke players** (bible VI #10); deep-dive §2.7 | Forge, Quant, Tape | M47, **Mathis's yes on network + tracking**, **Q3** | Eligibility, caps and cash tags in §2.7 enforced server-side | M |
| M49 | **Cosmetics store + cosmetic season pass** (PART V #7: never money, Prestige, rank or odds; no loot boxes) | Velvet, Forge | M47 | Purchased items marked as purchased and excluded from Prestige; no random paid item exists (audit) | L |
| M50 | **French localization complete** | Velvet (voice), Forge | M03 | 100% `fr.json` coverage; layout holds at +30% string length | M |
| M51 | **Store compliance:** 16+ rating questionnaire, privacy labels / data safety, "Simulated market. Not financial advice." in listing and app | Tape, Forge | M47, M48 | Honest "no" to simulated gambling holds (Risk R6 checklist) | S |
| M52 | **Launch readiness:** partition scaling, failover, live-ops calendar, Season 1 theme, replays/recap cards | Forge, Quant, Velvet, Tape | M45–M51 | Game-day drill: deploy between ticks with zero missed ticks; recap cards render | L |

---

## PART 2 — DESIGN DEEP-DIVES (numbers consistent with RESOLVED-NUMBERS and the bible)

### 2.1 Player company listings (IPOs) — Phase 3, M41
Base rules already in the bible: a holding with ≥ $50M of businesses can list; the underwriting fee is 5% (sink); the founder keeps ≥ 51% or risks a takeover; insider trading on your own company is the legal trap (01 §4.6). There's a 49% cap for any other single player (01 §7.6), a 50% short-interest cap, and ladder marks at min(fair value, 3-day VWAP) (02 §6.4).

**Eligibility (proposal):** holding EV ≥ **$50M** (01 §4.6), with businesses in ≥ 5 sectors (01 §4.3 "Conglomerate" unlocks the holding structure). Holding owned ≥ **14 real days** with ≥ **3 reported game quarters** (≈ 9 real days of ledger-verified profit). R3 Operator or higher, and no S4+ conviction in the last 8 weeks.

**Float:** **15% minimum, 49% maximum** at IPO. Proceeds are **primary only** by default: cash goes into the company treasury, not the founder's pocket. A capped founder cash-out at IPO (for example ≤ 10% of the company) is possible later if Mathis wants it. Secondary offerings later need 1 game week (7 real hours) of notice on the Wire.

**Pricing and allocation:** an NPC underwriter sets a range of **0.9–1.1 × EV** (EV = trailing 7-day profit × sector multiple, 01 §4.6). The book runs for 1 game day (1 real hour), then a single uniform-price auction sets the price. Allocation is pro-rata with **≤ 5% of float per buyer**. Accounts under 7 days old, or linked to the founder in the collusion graph, are excluded.

**Lockups:** the founder can't sell for **7 real days** (≈ 168 game days, the in-game analogue of a 180-day real lockup). After that, sales are capped at **2% of shares outstanding per game day** and are **pre-announced 1 game day ahead** through public filings (02 §8.3).

**Anti-pump rules:**
1. Earnings are the holding's real ledger profit, so revenue can't be faked.
2. **Blackout:** the founder and their alliance can't trade the stock from 2 game days before earnings to 1 game day after.
3. **Related-party deals** (the founder sells or leases their private assets to the listed company) must price within 10% of NPC-appraised fair value. Outside that, the deal is blocked and the surveillance score gets +30.
4. **Buybacks** only through an announced program, ≤ 1% of float per game day.
5. **Short selling** opens 3 game days after listing.
6. Ladder and leaderboard marks use min(fair value, 3-day VWAP), so pumping your own stock doesn't pump your rank.
7. Player-owned news outlets that publish about a stock they or the founder hold get a surveillance flag (01 §6.3).
8. The **pump-and-dump harness bot** (buy, promote, sell) must lose money in expectation once fines are included.

**Delisting / take-private:** EV under $10M for 5 straight game days triggers a delisting review. Take-private requires a tender to all holders at ≥ 1.2 × 30-game-day VWAP. **Takeovers** use the existing 50% control rule. A bid has to be a tender to all holders at one price (no creeping past 49% except by tender). Defenses per 01 §7.5 (poison pill costs, buybacks, white knights).

### 2.2 Player-run funds — Phase 3, M42
Bible: players invest in another player's fund for a fee; track record, trust and betrayal are public (VI #2). The NPC-capital hedge fund business charges 2/20 (01 §4.4). Player funds use the same caps.

**Who can run one:** R3 Operator or higher (Derivatives license), account ≥ 14 days old, no S4+ conviction in the last 8 weeks.

**Skin in the game:** manager stake ≥ **10% of AUM** at all times, with a minimum of **$250k**. Below 10%, new deposits pause automatically.

**AUM caps:** ≤ 10 × manager stake, and ≤ **$10M for the first 14 real days**.

**Fees** are transfers, not sinks:
- Management ≤ **2% per game year**, accrued daily.
- Performance ≤ **20% above a high-water mark**, crystallized at each game-quarter end (≈ 3 real days).
- Plus a **0.25%/game-year custody fee to the NPC Clearing House** (a small sink).
- No per-trade fees to the manager, so there's no churning incentive.

**Deposits and withdrawals:**
- Deposits settle at the next game-day-close NAV.
- Redemptions are requested anytime and paid at the next game-day-close NAV (≤ 1 real hour).
- **Gate:** at most 20% of AUM redeemed per game day, pro-rata.
- Redeeming within 2 real days of a deposit costs a **1% early-exit fee paid into the fund**, not to the manager.
- Investor limits: ≤ 25% of an investor's own NW in any one player fund. Investor accounts must be ≥ 7 days old and unlinked to the manager.

**Safeguards (the manager can't run off with deposits):**
1. **Custody:** fund assets sit at the Clearing House. The manager has *trade* rights and *no* withdrawal path except their own share plus crystallized fees. **Outright theft is impossible by construction.**
2. **Engine-enforced mandate:** the manager declares allowed asset classes, max leverage (≤ 1.5×), and max position (≤ 20% of NAV per asset). Changing the mandate needs 24 real hours of notice, during which investors redeem gate-free.
3. **No related-party trading:** the fund can't match against the manager's or linked accounts (the wash-trade rule). Holdings in any asset where the manager personally owns ≥ 1% of float, or is an insider (their own IPO), are capped at 5% of NAV and filed publicly.
4. **Front-running check:** surveillance compares the manager's personal trades with fund trades in the same asset within 1 game day (S5 front-running).
5. **Absent-manager freeze:** if the manager is offline ≥ 72 real hours, trading freezes and redemptions open gate-free. After 14 days the fund winds down automatically at fair value.
6. **Drawdown breaker:** NAV −30% from the HWM within one game week freezes new trades for 1 game day and opens gate-free redemptions.

**What betrayal still looks like (public and punishable):**
- **Fund as exit liquidity:** the manager pumps assets they hold personally through the fund, inside the 5% cap.
- **Style drift** inside the mandate.
- Abrupt closure.

**Penalties:**
- Embezzlement or front-running is **S5**: 8% of NW (floor $100k, per-verdict cap 35% of NW), 100% disgorgement and 1.5× restitution.
- The **manager's stake is first-loss**: restitution comes out of it before anything else.
- The Victim Compensation Fund advances 50% immediately (03 §9.9).
- Plus an 8-week fund-management ban, and a permanent line on the profile and fund page.

**Fund board:** net-of-fee return and Sharpe, minimum $1M AUM and 2 game quarters of history.

### 2.3 Decoy (honeypot) models inside the hidden-session formula — Phase 2, M29
Fixed by the bible: honeypot tiers basic $30k / advanced $120k / frontier $400k with poison 0.20 / 0.40 / 0.60 (cap 0.60). The student's trading edge is multiplied by `(1 − poison)`. On regime changes it loses `poison × 2%` of AUM, capped at 10% of AUM per game day. Retraining halves poison. Honeypots can't be licensed, only exposed to recon (03 #18).

**Proposal (for Tape to tune):**
- **Appearance:** a honeypot is a normal entry in the defender's model list, with a **bait MCS** the owner sets between 0.5× and **1.25× their best real model's MCS** (so it's believable, not an absurd lure). To look alive it **burns 5% of the owner's DU budget**, inside the bible's legitimate 1–12% load range per entry. That's the realism cost.
- **How many:** T0–T1 defense 1, T2–T3 2, T4–T5 3.
- **Attacker's canary check:** an optional add-on to recon (op 1) at +20% of op cost. It flags a honeypot with `p = clamp(0.25 + 0.15·log2(AP/DP_eff), 0.05, 0.75)`.
- **Session on a honeypot:** planting rolls the normal breach (1% floor). Progress follows the **same** `P = 0.85·(1 − e^(−k·h_eff))` curve with the same Whisper/Tap/Siphon k. The thief gets `student_MCS = bait_MCS · min(P, retention_raw)`, so the student *looks* strong. The inherited poison scales the way residue does: `poison = poison_tier · (0.4 + 0.6·P/0.85)`, reaching the tier value at P = 0.85. A short honeypot session gives a mildly poisoned student; a long one gives a fully poisoned one.
- **Detection for the defender:** the honeypot knows it's being touched. On plant: **+15 evidence** on the (attacker, defender, op 5) triple and one free attribution roll at p = 0.5. Then +3 evidence per effective hour connected. **The honeypot alone caps at +40** (= the civil bar). It can support a civil suit by itself but never a criminal case (55), which keeps "a second source" meaningful (03 §4.4).
- **Session rules:** a honeypot session counts against the **attacker's** live-session cap (03 §4.6.3), so it wastes their slot. It doesn't count toward the defender's 3-hostile-session cap, doesn't drain the defender's DU, and emits no clues (the defender already knows).
- **Solo (Phase 2):** each rival fund at tier T2+ has a 25% chance per game quarter of running one honeypot. The canary check is the player's counterplay.

### 2.4 Weekly AI tournament — M32 solo, M43 online (bible VI #4)
- **Entry:** one frozen model per player per week (a strategy graph plus parameters, hashed at lock). Entries lock at a fixed weekly UTC time. You can't resubmit after the lock.
- **Divisions** by the entrant's AI tier, each running at its A1 DU cap: **Laptop (T0–T1)**, **Startup (T2–T3)**, **Frontier (T4–T5)**.
- **Format v1: isolated runs.** Each entry trades alone in its own copy of the world, so there's no interaction, it's purely deterministic, and it's cheap. There are **3 secret seeds**, each **30 game days** (21,600 ticks) from **$1,000,000 notional** in a ring-fenced portfolio that never touches the real empire (02 §2.4). Seeds are committed (hashed) before the lock and revealed after the results.
- **Format v2 (later, a "Finals" week once a season):** an arena where the division top 32 trade in **one** shared seeded market, so impact and crowding matter.
- **Score:** median across the 3 seeds of the annualized Sharpe of daily returns, net of fees. Disqualified if a run's max drawdown is over 40% or it makes fewer than 20 trades in any seed. Tie-break on total return. The **benchmark ghost (equal-weight basket) and the house AIs** appear on the board as reference rows.
- **Integrity:** a forensic audit on the top 10 of each division. A proven stolen student (watermark residue match, 05 §5.2) is disqualified and the match adds evidence to the triple.
- **Rewards:** weekly title, trophy decor, and the season aggregate (best 5 of 8 weeks). **No cash** (zero faucet, like all ladder rewards, 01 §14.4).
- **Publishing:** nothing about a player's strategy is published automatically. Top-3 players may opt in to publish their trade log (never weights). See idea N8.

### 2.5 Rumors, tips and how the regulator spots insider trading — M16 (bible VI #7, 01 §6.2, 03 §10)
**Rumors (public, legal to trade)** — 01 §6.2 says 40–70% accurate:
- Each NPC rumor source has a hidden accuracy drawn from **U(0.40, 0.70)** (mean 0.55). Its public **track record** (hits and misses) builds as rumors resolve, so judging sources becomes the skill.
- Volume: about **3 rumors per game day** across the universe at Phase 1 size.
- Each resolves within **1–5 game days**. A true rumor fires the matching news event (direction right, size from the template). A false one fizzles (70%) or gets a denial headline (30%).
- **Price effect on publication:** `0.25 × source_credibility × expected_move`. The rest only arrives if it's true. A false rumor's move fades with a 1-game-day half-life.
- **Harness gate:** blindly trading every rumor has EV ≤ 0 after fees. Trading only sources whose track record shows ≥ 65% over 20+ resolved rumors may beat buy-and-hold, but on ≤ 70% of seeds.

**Tips (private, illegal to trade on):**
- They arrive as a clearly marked **"NON-PUBLIC" card** with a legal-risk tag. Sources: a bribed contact (Phase 1), stolen data or order-feed taps (Phase 2+), and later the Back Room (Notoriety).
- **Accuracy 85%.** The other 15% are stale or planted by a rival fund (disinformation).
- The player chooses: trade, ignore, or **report**. Reporting gives +2 Reputation and nothing else in solo, so there's no faucet.

**Regulator (ECA) detection.** Quant computes, Tape decides (03 §1, §10.2):
- **Insider points per trade** = `40 × size_f × timing_f × profit_f`:
  - `size_f = min(1, notional / (3 × player's median trade))`
  - `timing_f = 1` if the trade lands ≤ 1 game day before a material event (|move| ≥ 3%) on that asset, 0.5 at 1–2 game days, else 0
  - `profit_f = 1` if the trade was on the right side, else 0
- Daily `surveillanceScore` = the sum of points over the trailing 5 game days, decaying 0.8× per day, capped at 100.
- So **one perfect big trade ≈ 40 (no inquiry), two in a week ≈ 70–80 (inquiry or investigation)**, per 03 §10.2 thresholds: ≥ 60 for 3 game days → inquiry; ≥ 80 → investigation at +5 evidence/day.
- **The tip trail:** if the player actually received a tip on that asset, each investigation game day has a **50% chance to find it (+30 evidence)**. Lucky public-rumor traders have no trail, so their pattern evidence (10–20 points, plus 5/day while the pattern persists) rarely reaches the tribunal bar of 55. That keeps wrongful convictions under 3% (03 §16).
- **Sanction:** insider trading is **S5**: 8% of NW, floor $100k, but the per-verdict cap is 35% of NW, plus 100% disgorgement. **Tuning flag for Tape:** for a $15k solo player the floor and cap mean a 35%-of-NW fine. That's a hard lesson. We should decide whether solo uses a gentler first-offence rule.

### 2.6 Bankruptcy and comeback — M20 (bible VI #8, 01 §8.3 and §9, 03 §13.5)
**Fixed by the bible:**
- A **$5,000 fresh start, at most once per 8 weeks**, with a Reputation hit.
- Debt owed to the Clearing House persists.
- Crime and court can never push you below **$5k liquid + one T1 business** (that floor is separate from bankruptcy).

**Proposal:**
- **Triggers:** voluntary when NW < **$1,000** (the same line as ad eligibility). Forced when equity < 0 after a liquidation.
- **What you keep:** account, handle, titles, trophies, Hall of Fame, **rank** (rank is never lost, 04 §3.1), all cosmetics (earned and bought), licenses already paid for, and **researched algorithm nodes** (knowledge, not assets).
- **What you lose:** cash, positions, businesses, property, Limited/Unique lifestyle items (sold at the 15% NPC haircut to pay creditors), models, compute and data.
- **Debts:**
  - Debts to NPC banks are discharged, but **margin and NPC loans are blocked for 14 real days**.
  - **Debts to players survive:** court judgments, restitution and contract loans move onto the 03 §9.9 garnishment plan (30% of daily income).
- **The perk (pick one, non-cash, worth ≤ $2,500):**
  - "Old contacts": one T1 business at 50% off.
  - "Lessons learned": 50% off trading fees for 7 days.
  - "Second wind": ×1.25 business income for 7 days.
- **Anti-farming:**
  1. Fresh start at most once per 8 weeks. A second bust inside that window gets only the floor (and ads, once they exist).
  2. **Clawback lookback:** P2P transfers, gifts and contract payments out in the **7 real days** before declaring are reversed (online phase).
  3. The fastest-climber ladder's **$100k floor** (01 §14.4) stops "bust and climb from $5k" farming.
  4. Leverage capped at 1× for 7 days after a fresh start.
  5. Reputation −10.
  6. Each fresh start is a tagged `FRESH_START` faucet (≤ $5k per player per 8 weeks).
- **Bust screen tone:** calm, no shame. It shows the trade-journal summary of what went wrong and the perk choice (see idea N7).

### 2.7 Ad cash inside the faucet/sink economy — M48 (bible VI #10)
**Fixed by Mathis:** $250 per ad, at most 10 a day ($2,500/day), only offered when NW < $1,000, ad cash can't fund hacking right away, mobile/launch phase, and it needs his yes on the ad network and tracking.

**Proposal:**
- **Eligibility check — needs Q3.** If NW is checked live before every ad, a player crosses $1,000 after about 4 ads and the 10/day cap almost never applies. Checking NW at the **start of the player's local day** lets all 10 run (up to $2,500, landing at ≤ $3,500). Account age ≥ 24 h. Guests aren't eligible (alts).
- **Order of options when broke:** the fresh start (if available) is offered first, ads second. Both can stack once.
- **Cash tag `AD_GRANT`:** for **72 real hours** (FIFO), ad cash can't pay for cyber or espionage ops (Mathis's rule), **can't be used as margin or for derivatives** (anti-gambling: no "watch ad, YOLO, repeat"), and **can't move P2P** (alt funnels). It's fine for spot trades, T1–T2 businesses, upgrades and lifestyle.
- **Faucet size:**
  - Worst case per player: $2,500/day ≈ $0.9M/year, against a day-365 median NW of ~$6B (01 §14.3). That's negligible for the player-level curve.
  - World level: if 5% of `N_a` maxed ads every day, a 10k-active world mints $1.25M/day, against a money supply in the trillions by season end (median ~$300M × 10k players). That's below 0.001%/day, so **no stabilizer offset is needed**, but it's still tracked under its own reason code with an alert if `AD_GRANT` exceeds 0.01% of daily net mint.
- **Rewards are fixed amounts.** Never a spin, chest or random multiplier (PART V #7, 04 §11.3).

### 2.8 Shared world-event frequency — M21 (solo), M39 (shared) (bible VI #6, 01 §5.6)
Clock: 1 real hour = 1 game day, and a game week is 7 real hours (5 h trading + 2 h weekend, 01 §1). So one *real* day holds about 3.4 game weeks, a game quarter (63 trading days) lasts about 3.7 real days, and a season (8 real weeks) is about 3.7 game years.

| Tier | What | Rate | Telegraph | Scope |
|---|---|---|---|---|
| **Ripple** | One sector or commodity, ±3–8% over 1–3 game days | ~1 per game week (≈ 3–4 per real day) | none (it's news) | sector |
| **Storm** | Multi-asset regime push: rate scare, oil spike-lite, crypto flush −30%, credit wobble | ~1 per game quarter (≈ every 3.7 real days, ~15 per season) | 1–2 game days (1–2 real hours) of precursor headlines | world |
| **Major crisis** | The 01 §5.6 table (bubble burst, credit crunch, crypto winter, oil shock, currency crisis, AI bubble, cyber pandemic, flash crash) | P(≥ 1 per season) ≈ **35%** (01 §5.6) ⇒ Poisson λ ≈ 0.43 per season | ≥ **8 real hours** of visible precursors (P/E stretch, spreads, Stabilizer report) so every timezone gets a waking window | world |
| **Crisis week** | Themed *real* week: storms ×2, one guaranteed storm, major-crisis odds ×1.5 | ≤ 1 per season; announced 48 real hours ahead | announced | world |

**Rules:**
- At most 1 major crisis active at a time, with at least 3 real weeks between majors.
- **No new major can start in the final 48 real hours of a season** (no ladder lottery; the finish already uses a 3-day NWI average, 02 §6.4).
- Start times rotate across three timezone bands.
- A **player-caused** major (a cyber pandemic, 03 #13) counts toward λ, and natural majors are suppressed for 2 real weeks after it.
- In solo, the same generator runs on the seed. Scenario seeds (M18) force specific events.

### 2.9 Risks and mitigations

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| R1 | **Perfect foresight in solo.** The seed and RNG live in the client save. With save/load, a second tab or a headless run of `src/engine`, a player can see the future | Any solo leaderboard or weekly challenge (M19, M32) is trivially cheatable; Tape's "fair by construction" holds only for honest players | Solo results stay **unranked**. For shared challenges before servers, an **entropy drip** (N9): a signed per-game-day random published one day at a time, plus server re-simulation of run files. Real rankings only in Phase 3 with commit-reveal (02 §3.3). Decision: **Q5** |
| R2 | **Solo progress → online** | Tamperable local saves can't seed a fair shared world | Nothing economic carries over (Q4) |
| R3 | **"Priced in so far" as a free-money meter.** `newsPricedIn` is exact; the remaining 30% drift is predictable | Turns Wire-reading skill into a readout; could beat buy-and-hold | Show coarse bands only (Early/Mid/Late/Done), sharpened by the information tiers later (01 §6.2: Terminal/Research narrow the estimate); harness strategy `news_drift` gated at ≤ 70% (M04) |
| R4 | **Economy runaway in a never-reset world** | 01 §14 calls it make-or-break | Reason-coded ledger from Phase 1 (M13); Stabilizer observe-only first; NWI ranking; every new faucet (fresh start, ads, onboarding grant) tagged and alarmed |
| R5 | **Exploits in new systems:** IPO pump-and-dump, funds as exit liquidity, insider-tip farming, bankruptcy hiding, ad alts, tournament overfitting, NPC funds being predictable and front-run | Each one is a money printer if missed | Rules in §2.1–2.7; seed-jittered NPC fund parameters, small NPC size (≤ 0.5× ADV/tick); Tape adds one adversarial bot per system to the harness before it ships |
| R6 | **Gambling-like mechanics / age rating** (16+, PART V #5) | Leverage, crypto "degen" flavor and rewarded ads draw scrutiny; store answers must be an honest "no" to simulated gambling | No chance-based purchases, chests or spins (ad reward fixed); no casino visuals or "double or nothing" UI; ad cash barred from margin/derivatives; post-bust leverage cap; "Prices can fall" honesty notes; disclaimer in app and listing; Tape runs a pre-submission checklist. **Ad consent:** default to non-personalized ads where age or consent is unknown (GDPR/ePrivacy in France, Apple ATT); verify the chosen network's policies before M48 |
| R7 | **Server cost** | Forge's estimate (02 §12.4: alpha < ~$50/month, launch in the low hundreds) is an unverified guess | DU caps per partition (A1); tournaments as isolated headless runs batched off-peak; snapshots + log compaction; benchmark at M34 before committing to a plan (Q7) |
| R8 | **Real-time rules in solo** (Held for 6–12 h, scan cadences in real hours) | Speed slider would skip or stretch them; Held can freeze a solo player for an evening | Ground rule 2 (game time in solo); Held in solo is Q8 |
| R9 | **Single dev machine** | The PC is offline and all code lives there | Box mirrors (`review/tg.bundle`, staging); after M01, push a `git bundle` to the box after every Tape PASS (local only, no remote push) |
| R10 | **Scope** | 52 milestones for a small bot team | Strict gates (M06, M22, M33, M45); each phase must be fun on its own; cut Phase 2 items before delaying a gate |

---

## PART 3 — NEW IDEA PROPOSALS (UNAPPROVED; none of these is in any doc)

> **Mathis rule (2026-10-09): nothing automatically leaks a player's strategy, style or holdings.** Anything that reveals how someone trades must be opt-in, earned through espionage, or a legal filing rule.

| # | Proposal (UNAPPROVED) | Why, in one line |
|---|---|---|
| N1 | **Stress-test button**: replays your *current* portfolio through this world's last 3 storms/crises on the deterministic engine | Teaches risk with your own numbers and the game's own history, never as advice |
| N2 | **What-if fork**: branch your save at any past game day into an unranked sandbox and replay a different decision | Determinism makes it nearly free, and "what if I'd held?" is the best teacher there is |
| N3 | **Explain-this-candle**: tap any chart bar to see its split into market / sector / news / flow / noise | Makes the "explainable prices" pillar (01 §0) visible everywhere; reuses the trade-journal decomposition (M09) |
| N4 | ~~Rival fund letters~~ **CUT by Mathis (2026-10-09):** automatically leaking a fund's style or holdings is unfair | n/a |
| N5 | **Invest in rival funds (solo)**: put cash into an NPC fund with 2/20 fees, high-water mark and gates | Teaches fund mechanics in Phase 1, before player-run funds exist in Phase 3 |
| N6 | ~~Mentor program~~ **CUT by Mathis (2026-10-09)** | n/a |
| N7 | **Phoenix title + comeback card**: after a bankruptcy, reaching your previous peak NW earns a title and a shareable card | Makes busting a story instead of a rage-quit, with zero cash cost |
| N8 | **Tournament autopsy (opt-in only, per Mathis's no-auto-leak rule)**: after each AI tournament, a top-3 player's trade log is published with commentary only if that player chooses to publish it | Free weekly content, a learning path for manual players, and the weights stay secret |
| N9 | **Entropy drip for shared seeds**: the weekly challenge's per-day randomness is released (signed) one game day at a time | Makes a shared-seed challenge honest before servers exist (Risk R1) |
| N10 | **Liquidation line**: the first time a player uses leverage, the chart shows the exact price where they'd be margin-called and liquidated, with "set a stop above it" | Prevents the most common rage-quit before it happens; fits "Prices can fall. That's the game." |
| N11 | **Block desk at the close**: whales can cross a negotiated block with another player at the closing-auction price, filed 1 game day later | Gives big players a legal way to move size without crashing thin names, and adds a new filings-watching angle |

---

## PART 4 — QUESTIONS FOR MATHIS (only decisions that change the build)

**Q1. Build order: AI and espionage before or after going online?**
- A) Solo first: AI tree and espionage against computer-run rivals (this roadmap).
- B) Bible PART IV order: online world first, AI and espionage last.
- C) Solo AI phase, with Forge prototyping the server in parallel.
- **Recommend A.** It costs nothing to host, it proves the heist is fun before strangers can grief each other, and the engine code moves to the server unchanged.

**Q2. How fast should small businesses pay, which sets when you reach Hustler ($20k)?** Trading alone can't get there: the fair market returns about +18% over 5 game years in Tape's harness. Businesses are the path. The bible (01 §4.4) says a T1 business pays for itself in about 6 game days, so you'd hit Hustler in the first day or two of play (04 §3.2). Quant's new spec proposes about 90–105 game days, so Hustler comes after about 100 game days (about 4 real days at normal speed, 5 hours at 20×).
- A) Bible pace: about 6 game days to pay back.
- B) Quant's slower pace: about 100 game days.
- C) In between: about 20 game days, with Tape tuning it so a typical player hits Hustler in about 1–2 real days at normal speed.
- **Recommend C.** It keeps the first rank-up inside the first couple of sessions without businesses printing money before wages and upkeep exist. It gets retuned to the bible curve once bigger businesses land.

**Q3. When is "under $1,000" checked for ads?**
- A) Live before every ad: a player can watch about 4, roughly $1,000, until they cross the line.
- B) At the start of the player's local day: all 10 ads, up to $2,500.
- C) Live, but with a $3,500 line.
- **Recommend B.** It matches your "10 a day, $2,500" call, and the faucet is still negligible (§2.7).

**Q4. Does solo progress carry into the online world?**
- A) Only titles and cosmetics.
- B) Titles, cosmetics and researched AI knowledge.
- C) Everything.
- **Recommend A.** Local saves can be edited, so carrying money would break the shared leaderboard on day one.

**Q5. The weekly seed challenge before servers exist.**
- A) Unranked, just you vs the ghosts and rival funds.
- B) Entropy drip plus a tiny verify endpoint that re-runs submitted runs (a small server bill).
- C) Wait for Phase 3.
- **Recommend A now and B as soon as there's any hosting.** A shared seed without it can be cheated by running the engine ahead (Risk R1).

**Q6. How can player-run fund managers betray investors?**
- A) Custody makes theft impossible. Betrayal is only market abuse (pumping their own bags through the fund, style drift), which is public and prosecutable as S5, with the manager's stake paying first.
- B) Also allow a capped "exit scam" (seize up to 10% of the fund once, then flagged and prosecuted).
- C) No betrayal possible at all.
- **Recommend A.** It keeps "trust and betrayal are public" without letting one player wipe out a hundred.

**Q7. Hosting for the online world (and the verify endpoint).**
- A) One EU VPS (Forge's rough estimate is under ~$50/month for alpha).
- B) Managed cloud (Vercel + managed Postgres/Redis), easier but pricier as it grows.
- C) Infrastructure you already pay for.
- **Recommend A for alpha, after a cost benchmark at M34.**

**Q8. "Held" (the temporary freeze for serious crimes) in solo Phase 2.**
- A) As in the bible: 6–12 hours, on game time.
- B) Off in solo: fines, op bans and record only.
- C) Shortened to 1–2 game days in solo.
- **Recommend B.** Freezing a solo game for an evening is a rage-quit. It returns online, where it protects other players.

---

### Conflicts log (Quant's `specs/`, reconciled 2026-10-09 ~01:05)
| # | Where | Quant's spec | This roadmap / bible | Proposed resolution |
|---|---|---|---|---|
| C1 | Rival funds | 3 rivals at $50,000 each | 04 §4.2 wants a close rival by minute 4 (player starts at $5k) | Keep Quant's 3. Add one small "Scrappy" rival at $6–8k in v1.1 so the closest rival above the player is reachable, or show the nearest *ghost* instead. Ledger + Velvet decide, Quant implements |
| C2 | Rumors and tips | 3 rumors per **game week**, flat 55% true, insider tips always true, only from crime actions | §2.5 had ~3 per game day, per-source accuracy U(0.40–0.70), 85% tips with planted fakes | **Quant's numbers are v1.** Per-source track records and planted tips become v2 (Phase 2, when crime actions exist). §2.5 regulator detection stays as Tape's v2 input |
| C3 | World-event rates | Per game day: crash 0.4%, bubble 0.3%, crisis 0.8%, flash 0.5%, described as "about one major event per 5-year run" | Those odds give about **5 crashes and about 25 events per 5 game years**, not one. Bible 01 §5.6: P(major) ≈ 35% per season (≈ 3.7 game years), about 0.05% per game day | **Quant to recheck.** The stated odds and the "rare" intent disagree by about 25×. Crisis plus flash (1.3%/game day combined) is close to §2.8's Storm rate (≈ 1 per game quarter ≈ 1.6%/game day), so keep those as Storms. Crash plus bubble at 0.7%/game day (≈ 1.8 per game year) runs about 15× the bible's major rate: cut it to ≈ 0.05%/game day combined. Tape re-bands GX CAGR with events on |
| C4 | T1 business pace | Payback ~90–105 game days; $5k → $20k from businesses alone in ~100 game days | Bible 01 §4.4: T1 payback ~6 game days; 04 §3.2: Hustler on day 1–2 | **Q2** |
| C5 (**DECIDED 2026-10-09:** 72 real hours online; 21 game days in solo; covers ops, insider actions, margin and P2P) | Restricted cash window | Ad and comeback cash can't fund insider actions for **21 days** | §2.7: ad cash barred from ops, margin and P2P for **72 real hours** | Use one rule in two units: 72 real hours online = 72 game days in solo (ground rule 2), covering ops, insider actions, margin and P2P. Quant's 21-day value is fine for Phase 0 if Ledger prefers. Decide at M20 |
| C6 | Priced-in on the Wire | "`pricedIn` ships, and Forge can show it with no more engine work" | Risk R3: the exact number hands players the remaining 30% drift | Show **bands** until Tape's `news_drift` harness check passes (M04). Quant already keeps it off rumors |
| C7 | Weekly challenge seed | `SCENARIOS[weekNumber % 6]`: six fixed seeds in the source code | Risk R1: a known seed means perfect foresight | Fine for unranked solo play. **Never ranked** until the entropy drip or server (Q5) |
| C8 | Ghost benchmark | `buyAndHold` = equal-weight **stocks** | M08 originally said every licensed asset | Adopted Quant's (M08 updated) |
| C9 | Business names | Corner Cart, Phone Repair, Night Clean, Courier Bikes | 01 §4.4 catalog: Coffee cart $2,500, Food truck $6,000… | Both fictional, so either works. Quant's set is the Phase 0 catalog, and 01 names return with the full catalog (M15). Velvet confirms the copy |

---

## Mathis directive (2026-10-09): deep company building, after the market is nailed

**Order:** market ecology first (Quant's agent-based market must pass its gates: vol clustering, momentum and reversal horizons, crowding decay). Only then the next big pillar:

**Company building, in the spirit of STONKS-9800.** Found your own company. Allocate budget to R&D, product lines, marketing, hiring and staff, production and capacity, pricing, and expansion to new cities and sectors. The company has real operating economics (revenue, costs, margins, cash flow, debt), and its products compete for market share. It produces filings and earnings that feed the market. Growth path: private → bigger tiers → IPO onto the same exchange (ties to approved idea #1, player IPOs). Your company's fundamentals drive its stock through the agent pools (value funds read its earnings).

Before spec: a research pass on STONKS-9800's company and stock mechanics, covering what makes it deep and fun, what to borrow and what to do better. Owners: Quant (company economics and fundamentals into the market), Forge (management screens), Velvet (dashboards), Tape (exploit and balance hunts).

### APPROVED by Mathis (2026-10-09): "Why it moved" ladder + Research Desk
Explanations of price moves, paid for with in-game money and progress only, never real money (no pay-to-win).
1. **Free one-liner (everyone, from day 1):** after each closed trade, one plain sentence naming the biggest cause ("Mostly the sector, not the company"). Reuses the M09 decomposition.
2. **Hired analyst (in-game weekly salary):** the full breakdown of the player's own trades into market, sector, news, flow, noise and fees (Velvet's journal mock). Analyst tiers cost more and show finer detail (e.g. which news item, which day).
3. **Research Desk (higher rank, proposed R3 Derivatives+; large weekly upkeep):** the same breakdown for any asset and any past window, not only the player's trades, so they can study the market. Mathis's favourite: it should feel like insider access.
Guards:
- Always after the fact: explains closed days only, never today's open session, never forecasts.
- No-leak rule: "flow" is shown as aggregate crowd flow by pool type (value funds, trend followers, retail...), never by named player or account. Named NPC funds aren't singled out either.
- Costs are money sinks, sized by Quant against the R3+ income curve.
Owners: Quant (`explainMove(state, assetId, fromDay, toDay)` API, built on the M09 cause vector), Forge (unlock, salary and upkeep, screens), Velvet (Research Desk screen), Tape (no-future and no-attribution tests).

### Must-fix before online ranking (Ledger 2026-10-09)
- **Alt-lifted peak:** liquidation value for peak, rank and licenses is computed as an exit against the asset's whole crowd, not just the one account, so an alt buying after a main can't raise the main's peak. Solo is fine as it is (no alts). Tape keeps it as an open hunt.
- Market ecology knobs locked on the box: newsPrint 0.5, trend capacity 1, valueClose 0.9; permanent impact uses one shared daily tally per asset and side, across all accounts.

### DONE (2026-10-09): market ecology at 100%, default for new worlds (box only)
Final knobs: lnVVolScale 1.15 + valuePrint 0.1, full mode only. All 5 gates, learnability (refined floor stays at 0.50), crowd gate, balance bands at 20/60 seeds and the speed gate pass. Tape signed it off: proof/ecology-full-signoff-20261009-*. New worlds default to { mode:'full', weight:1 }; 25% is fallback only; old saves are byte-identical. In full worlds the daily value-line sd is +10.4%. Synced into /workspace/tg at e46c06e5 (not on the PC yet). Watch: thin vol margins (LMNP 0.871); recheck after the alt-lifted-peak fix.
**Next pillar unlocked: company building** (spec phase, see directive above).
