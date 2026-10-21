# 24 — Decisions Register

Owner: the specification as a whole. Written 2026-10-19. **Precedence: this file is the highest authority of the specification (00 §3.5: 24 > the owning module > 23 > any other text).** Where a module still disagrees with a ruling here, the ruling wins and the module text is a defect to fix.

## §1 Purpose and how to read this file

This register lists every design decision of the specification with its status, so a builder never has to choose between two texts:

- **§2** Mathis's locked calls L1–L15 (from 00 §2). Status LOCKED: never changed by any module.
- **§3** Every DEFAULT chosen by modules 01–21 (collected from the Decisions sections of `_notes/NN-notes.md`, which list each spec file's `DEFAULT (Mathis may override)` choices), one row each, with its owning section, a one-line rationale and a status.
- **§4** Every old open question (roadmap Q1–Q8 and conflicts C1–C9, V3 Part 13 Q1–Q5, the open-question lists of the old vision files, the master bible's items) with its single final answer.
- **§5** The short list of items that need Mathis's explicit yes before launch.
- **§6** Rulings on cross-file contradictions (R01–R38), including the rulings Mathis's coordinator made.
- **§7** The reconciliation log: every correction applied to the spec files, by file and section.
- **§8** Reason-code alias table (module names that map to 03's canonical codes).

Status values used in §3: **IN FORCE** (the default applies as written), **IN FORCE via Rxx** (applies, and a ruling confirmed or completed it), **AMENDED by Rxx** (applies with the change stated in the ruling), **SUPERSEDED by Rxx** (does not apply; the ruling's answer applies), and "needs Mathis yes (Yn)" when the item is also on the §5 list. Every DEFAULT stays overridable by Mathis; until he overrides it, the builder follows it.

---

## §2 Mathis's locked calls (status LOCKED)

| ID | Decision | Where it is implemented |
|---|---|---|
| L1 | One single persistent world. No resets, no visible shards. Global, country and seasonal-ladder boards. Partitioning is invisible | 02 §3.5, 15 §3.1, 19 §3.5 |
| L2 | Breach-chance floor is 1% | 12 §3.6 |
| L3 | Hacking uses hidden sessions that accumulate progress (ceiling 0.85) until noticed and disconnected; offline slows accrual; defense AI auto-scans by tier | 12 §3.7, 11 §3.9.3 |
| L4 | Visual direction Ink & Brass, with the Shadow sub-palette for Lab and Security | 17 §3.3 |
| L5 | Age rating 16+. No gambling mechanics | 21 §3.9, 08 §3.5.1 (insurable interest), 14 §3.6.3 (no lottery) |
| L6 | Fully fictional brands, companies, cities, currencies, institutions | 22 |
| L7 | Monetization: cosmetics and a cosmetic season pass only. Never touches money, Prestige, rank or odds. No loot boxes | 21 §3.11–§3.13, 17 §7.30 (Atelier) |
| L8 | English first, French second, string keys from day one | 17 §3.14 |
| L9 | 1 real hour = 1 game day | 00 §5.1, 02 §2 |
| L10 | Derivatives, IPOs and takeovers are in, gated behind late licenses. Player-launched tokens later (specified, flag off). Prediction/event markets and vice businesses are out | 06 §3.2, §3.20; 09 §3.10, §3.13; 16 §3.10.4 |
| L11 | Nothing automatically leaks a player's strategy, style or holdings. Disclosure only by opt-in, legal filing rule or in-game espionage | 05 §3.11, 15 §3.8, 16 §3.6.6 |
| L12 | Rewarded ads for broke players: $250 per ad, max 10/day, only under $1,000 net worth, ad cash cannot fund ops immediately | 21 §3.14, 03 §3.5.6 (see Y2 on MSI indexing) |
| L13 | Approved ideas: player IPOs, player funds, honeypot models, weekly AI tournament, NPC rival funds, shared world events, rumors and tips, bankruptcy comeback, trade journal, "Why it moved" ladder and Research Desk, company building | 09, 08, 11 §3.14.6, 11 §3.13, 16, 04 §3.16, 14 §3.13, 18 §3.12 |
| L14 | The vision is the source of truth; the game is rebuilt from scratch around it | all |
| L15 | Scope is the full ambition. No pillar is cut | all |

---

## §3 Defaults register (D001–D456)

456 decisions. Columns: ID; decision (as written by the owning module); owning file and section; rationale; status. Numbers follow file order 01→21. Where a row names a value that a ruling changed, the ruling (§6) is authoritative.

| ID | Decision | Owner § | Rationale | Status |
|---|---|---|---|---|
| D001 | V3 Part 13 Q1–Q5: decided in the §4.1 table. Institutional layer stays in full (all charters). Expert platform API is gated (LIC2 + 2FA + 7 days of account age) and shares the 20 intents/tick limit. Truth Machine is a server-side harness that is part of CI (20). | 01 §4.1 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D002 | Roadmap Q1 build order: superseded by the module dependency graph (19 §12). Foundations (02, 03, 20 invariants) come first. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D003 | Roadmap Q2 T1 business pace: Option C, payback about 20 game days. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | SUPERSEDED by R18 |
| D004 | Roadmap Q3 ad eligibility: Option B, NW < $1,000 checked at the player's local day start; up to 10 ads at $2,500. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D005 | Roadmap Q4 solo carry-over: Option A, titles and cosmetics only. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | SUPERSEDED by R19 |
| D006 | Roadmap Q5 weekly seed challenge: ranked only on the server with commit-reveal; solo stays unranked. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D007 | Roadmap Q6 fund-manager betrayal: Option A, custody makes theft impossible; abuse is prosecuted as S5 and the first-loss stake pays first. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D008 | Roadmap Q7 hosting: one region at alpha; the partitioned design is the same from day one. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D009 | Roadmap Q8 Held in solo: Option B, off in solo. | 01 §4.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D010 | 01-markets Q1/Q3–Q7 and 02-multiplayer Q2–Q8: decided as in the §4.3 table (country change once per 180 days; chat open at launch with moderation; guest play limited to the first session). | 01 §4.3 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D011 | Time model: 00 wins. 720 ticks per game day, 2 game minutes per tick, 5 real seconds per tick. The old 5-minute tick and the 288-tick day are retired. | 01 §5.1 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D012 | City count: 15 cities (3 per bloc; the five 06-cities designs become the first city of each bloc) plus Isla Serena (00 §5.7; ruling in 24). | 01 §5.2 | Closes a V3 or old-vision gap so the builder has one answer | IN FORCE |
| D013 | X1–X23 (each decided in the table): 400 instruments / 240 listed NPC companies at launch; 20 intents/tick; the relative DU formula; micro-units for every currency; elastic-sector faucets; stabilizer levers limited to faucets and sinks; stabilizer tracks the designed wealth curve; MSI/NWI defined; no identity-revealing whale auto-news; fresh start once per chapter; restricted cash 72 real hours; event rates; T1 payback; one world; per-stream RNG; commit before intake; 2,500 ms budget; new step contract; Stabilizer Board separate from the 5 central banks; look-through consolidation; Serena both fixed islands and free zone; homes at appraisal; engine layout in 19. | 01 §5.3 | Closes a V3 or old-vision gap so the builder has one answer | AMENDED by R18 |
| D014 | §3.1: 00 time model adopted. Session phases t0–59 pre-open, 60 open auction, 61–539 continuous batch session, 540 close auction, 541–719 after-hours. All rules use canonical game time; ET (+6 h) is cosmetic only. DEFAULT. | 02 §2.1 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D015 | genesis at 18:00:00 UTC on launch day. DEFAULT. | 02 §2.11 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D016 | holiday table. Genesis Day (day-of-year 1) is a holiday in every bloc, plus 3 per bloc (PYN 39/186/271; SRL 50/213/299; FDL 60/236/352; NKR 95/156/344; EUN 129/177/318), giving 256 trading days per bloc per year. Names go in 22. DEFAULT. | 02 §3.2 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D017 | on holidays FX still trades at reduced depth; crypto, perps and 24h futures are unaffected; accruals still post every calendar day. DEFAULT. | 02 §3.2 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D018 | 15-phase pipeline P0–P14 with hard budgets summing to 2,500 ms and 2,500 ms of slack; overruns never abort a tick; load shedding is state-driven only. Resolves old X17 (1,000 ms vs 150–300 ms vs 600 ms AI). | 02 §3.5 | Resolves old X17 (1,000 ms vs 150–300 ms vs 600 ms AI) | AMENDED by R27 |
| D019 | partition kinds COORD/WORLD/MARKET/FIN/CITY/PLAYER, rounds R0–R6, barriers B1–B3; consequences land next tick. | 02 §3.5.3 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D020 | pure `stepPartition`/`stepWorld` contract with sealed header, entropy, intents and inbox in; postings, events, outbox and hash out. Resolves old X18. | 02 §3.6 | Resolves old X18 | IN FORCE |
| D021 | determinism coding standard (lint rule `tycoon/deterministic`); float rules; dmath library; canonical sort orders. | 02 §3.7 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D022 | `roundHalfEven`, `toMoney` is the only float-to-money path; bigint helpers and `allocate` for largest-remainder splits. | 02 §3.9 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D023 | xoshiro128** streams keyed by `module.purpose:subject`, with PUBLIC and SECRET roots, epoch = chapter, lazy per-tick entropy mixing, fixed draw counts. Resolves old X15 (per-partition seeds retired). | 02 §3.10 | Resolves old X15 (per-partition seeds retired) | IN FORCE |
| D024 | commit 720 ticks ahead, reveal +1,000; tick entropy also mixes `intentsRoot`. Resolves old X16 and roadmap Q5 (ranked challenges only with commit-reveal). | 02 §3.11 | Resolves old X16 and roadmap Q5 (ranked challenges only with commit-reveal) | IN FORCE |
| D025 | fair `orderKey` order inside a tick; 20 intents per tick per character across channels. Resolves old X2 (10 vs 20). | 02 §3.12 | Resolves old X2 (10 vs 20) | IN FORCE |
| D026 | cross-partition hold-to-settle; institution-aware routing; rebalancing only at the daily snapshot boundary. | 02 §3.14 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D027 | two-phase commit, rollback, deterministic safe-mode quarantine recorded in the hashed header; hot-standby failover. | 02 §3.15 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D028 | snapshot cadence DAILY / WEEKLY / CHAPTER with thinning. DEFAULT. | 02 §3.16 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D029 | halts stop world time (no lost income); NORMAL/CATCHUP/REANCHOR modes; maintenance cap. DEFAULT. | 02 §3.19 | Determinism, replay and fair ordering need one fixed rule | AMENDED by R29 |
| D030 | Roadmap Q7 (hosting): one region at alpha, same partitioned design from day one (with 01 §4.2). | 02 §4.2 | Determinism, replay and fair ordering need one fixed rule | IN FORCE |
| D031 | §3.3: per-entity balanced entries built only from templates (PAY, SWAP_ASSET, MINT, BURN, ELASTIC_IN/OUT, LEND, REPAY, CB_CREDIT, ACCRUE, FX, MOVE_QTY, RECLASS). | 03 §2.1 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D032 | complete chart of accounts (1001 settlement cash is a central-bank liability; 1009 virtual money of elastic sectors; 2990 persistent claims; 3400 revaluation surplus). | 03 §3.2 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D033 | 379 reason codes: 37 FAUCET, 85 SINK, 205 TRANSFER, 12 CREDIT_CREATE, 13 CREDIT_DESTROY, 27 REVALUE. | 03 §3.4 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D034 | §3.5: central-bank credit raises M0_cb (base money) while commercial bank credit leaves M0 unchanged. This clarifies 00 §5.4's CREDIT parenthetical without contradicting it. | 03 §3.4.4 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D035 | elastic sectors hh/frm/row per bloc. Payments from them are FAUCET, payments to them are SINK; payments between named entities are TRANSFER. Resolves old X5. | 03 §3.5.2 | Resolves old X5 | IN FORCE |
| D036 | restricted cash window 72 real hours (51,840 ticks). Resolves roadmap conflict C5 / X11. | 03 §3.5.6 | Resolves roadmap conflict C5 / X11 | IN FORCE via R17 |
| D037 | faucet/sink target shares and ρ band. | 03 §3.6 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D038 | the Stabilizer is a PI controller on the log of the median wealth ratio of engaged characters vs W_target(age). It has 4 faucet/sink levers only; tax brackets and equity drift are removed as levers (00 §5.4). Resolves old X6 and X7. | 03 §3.7 | Resolves old X6 and X7 | IN FORCE via R04, needs Mathis yes (Y8) |
| D039 | the Stabilizer Board (game money) is separate from the 5 bloc central banks (monetary policy, 04/07). | 03 §3.7 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D040 | MSI money-based; NWI = NWrank / MSI. Resolves old X8. | 03 §3.8 | Resolves old X8 | IN FORCE |
| D041 | FIFO tax lots by default; specific identification for LIC2+. | 03 §2.5 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D042 | marking table for every asset type; homes at the same appraisal model as rented property (resolves X22); all characters' property revaluation through P&L. | 03 §3.9 | resolves X22) | IN FORCE |
| D043 | board NW uses liquidity haircuts and a control cap. | 03 §3.10 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D044 | control = majority, or de facto (≥30% and 2× the next holder, plus board control); look-through NAV; NCI; elimination; ownership-cycle limit; related-party band ±10% with minority claims. Resolves Bible I06/I07/R02 (X20). | 03 §3.11 | Resolves Bible I06/I07/R02 (X20) | IN FORCE |
| D045 | tax system. Rates per bloc: FDL personal 0/12/20/28/35, CGT 20 short / 10 long, corp 21; EUN top 45, corp 27; PYN 30, corp 20; NKR 45, corp 24; SRL 25, corp 30. Isla Serena: 0% corporate, franchise fee max($250k, 0.1% of assets), no personal residency, collected by the FDL treasury. P2P transfer tax 2%. Treaties 10/0/5, except SRL–NKR 25/15/15 and payments to Serena 30%. Also: residency change at most once per 91 game days with exit tax; main-home exemption $10M; accounting-firm credit; no VAT on B2B/B2G/exports; CFC attribution; transfer pricing; audits. | 03 §3.12 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D046 | Isla Serena is both fixed islands and a free zone. Resolves old X21 (with 10). | 03 §3.12.2 | Resolves old X21 (with 10) | IN FORCE |
| D047 | statements for every entity, with cadence and visibility. | 03 §3.13 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D048 | bankruptcy waterfall; persistent claims (clearing-house deficits, restitution, fines, taxes) survive discharge and are garnished at 25%; LIC3/LIC4 suspended for 28 game days (13 may override); fresh start once per chapter (resolves X10). | 03 §3.14 | resolves X10) | AMENDED by R17 |
| D049 | PB_MARGIN_LOAN: only banks lend on margin. | 03 §3.4.3 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D050 | the intraday credit limit at the central bank defaults to 100% of pledged eligible collateral (07 sets it). | 03 §3.3.4 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D051 | BIZ_UPGRADE_CAPEX is capitalized, then 30% is impaired. | 03 §3.4 | Keeps the ledger exact and the money supply observable | IN FORCE |
| D052 | Default bloc table (GDP shares, targets, regimes, initial rates, FX, hawkishness draws): DEFAULT (Mathis may override). | 04 §2.2 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D053 | NPC economy size: reference GDP $100T at 5,000 players, scaled by active players; old "NPC GDP = 50× player NW" kept as a monitored band [20, 200]. Resolves the old scale question. | 04 §3.2 | Resolves the old scale question | IN FORCE |
| D054 | Regime chain converted to the 364-day year (ENGINE.md 252-day values superseded). | 04 §3.3.1 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D055 | Hazard weights on imbalance z-scores: DEFAULT; 20 calibrates within ±50%. | 04 §3.3.4 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D056 | CB meetings quarterly per bloc, staggered (NA 15, SC 27, FU 39, EC 51, PL 63 of each quarter, t = 420). Resolves old 01 §1 vs §5.4 ("~6 real days"). | 04 §3.6.1 | Resolves old 01 §1 vs §5 | IN FORCE |
| D057 | Forward guidance as published dots; market knows r*_cb (DEFAULT simplification, §3.7.2). | 04 §3.6.5 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D058 | YCC used by PL by default. | 04 §3.8.6 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D059 | Primary auctions: uniform price, NPC dealer ladder, 35% award cap per group. | 04 §3.10 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D060 | Restructuring through exchange offer with aggregated 75% CAC. | 04 §3.12.2 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D061 | PL managed band ±3% vs basket; SC managed float with break rule; hard peg adoption rule DEFAULT (Mathis may override). | 04 §3.13 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D062 | Capital controls levels 1–3 with default durations. | 04 §3.13.6 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D063 | IV anchor `0.10 + 0.004 × F` (DEFAULT; 06 owns surface). | 04 §3.14.1 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D064 | Macro releases public to everyone at the release tick, no tiered early access (DEFAULT, Mathis may override). | 04 §3.15 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D065 | Crisis tiers RIPPLE / STORM / MAJOR replace the Phase-0 crisis odds; 15 major kinds; emergent labels without extra shocks. | 04 §3.16 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D066 | "Whale accumulates" auto-news removed (L11); only filings and anonymous prints. | 04 §3.16 | Follows locked L11 | IN FORCE |
| D067 | Stabilizer: defined once in 03 §3.7–§3.8 (ruling in 24); 04 keeps only the weekly report. | 04 §3.17 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D068 | Negative rates only EC and NA; pass-through to corporate deposits above 10M only (DEFAULT). | 04 §8 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D069 | Governors with 2,912-day terms. | 04 §6.1 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D070 | Rate limit taken from 00 (20 intents per tick), not old 02's 10. | 04 | Gives the macro world a calibrated, explainable default | IN FORCE |
| D071 | Weekends closed for session classes, no holidays at launch: DEFAULT (Mathis may override). Resolves R03. | 05 §3.2.1 | Resolves R03 | IN FORCE |
| D072 | Crypto daily reference = VWAP of ticks 530–540: DEFAULT. | 05 §3.2.2 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D073 | Value layer steps on trading-day ticks including closed hours (187,200 per year); crypto 262,080. | 05 §3.2.3 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D074 | Orthogonal factors, correlation only from loadings: DEFAULT. | 05 §3.3.3 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D075 | Fear Index does not multiply value vol (avoids feedback with rv21): DEFAULT. | 05 §3.3.5 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D076 | One impact law on the maker ladder with shared daily tally: resolves R04 and T08 double counting. | 05 §3.4 | resolves R04 and T08 double counting | IN FORCE |
| D077 | Only XXX/FDL FX books; crosses as linked legs: DEFAULT. | 05 §3.4.7 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D078 | Players before the maker at the same price: DEFAULT (Mathis may override). | 05 §3.5.3 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D079 | STP decrements both sides by owner group; linked groups may match but are flagged. | 05 §3.5.4 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D080 | GTC expires after 91 days. | 05 §3.6.2 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D081 | Auto-split above 3 ADV into POV 10%: DEFAULT. | 05 §3.6.8 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D082 | Algos need LIC2 (confirms 17 BRK-04 DEFAULT). | 05 §3.7 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D083 | Circuit-breaker set (bands, LULD halts, market-wide L1–L3, futures limits). Resolves T10. | 05 §3.9 | Resolves T10 | IN FORCE |
| D084 | Halts before scheduled material company news: DEFAULT. | 05 §3.9.2 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D085 | Depth 10 levels at Terminal tier, 3 otherwise: DEFAULT. Tape aggregated per tick; no identities (L11). Resolves C6 with §3.12.4. | 05 §3.11 | Resolves C6 with §3 | IN FORCE |
| D086 | Exchange fees always go to `exc_<bloc>`; concession holders paid through 03/10 concession profit (not SINK vs TRANSFER switching in 05). | 05 §3.13 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D087 | ADV model-based, never from realized volume; background volume prints without postings. | 05 §3.14 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D088 | Applies both 03's levy and 04's L4 fee multiplier through one interface: DEFAULT pending reconciliation of 03 §3.7 vs 04 §3.17. | 05 §3.15.3 | Keeps prices explainable and the batch auction fair | SUPERSEDED by R04 |
| D089 | Basic VaR free at LIC1, full risk at LIC2: DEFAULT. | 05 §3.17 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D090 | Registered market makers with CH_EXCHANGE_MEMBER + LIC4. Resolves N3. | 05 §3.19 | Resolves N3 | IN FORCE |
| D091 | Block cross at the close with deferred print. Adopts N11. | 05 §3.20 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D092 | Resting buy limits not adjusted for dividends: DEFAULT. | 05 §3.21 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D093 | Belief model placed at §6.3 because 12 cites it there. | 05 §6.3 | because 12 cites it there | IN FORCE |
| D094 | Fresh start and defendant half leverage attributed to 05 by 13 belong to 14 and 07; 05 only passes 07's buying-power result. | 05 | Keeps prices explainable and the batch auction fair | IN FORCE |
| D095 | all trades settle DVP in P13 of the tick they matched (T+0), so there are no settlement fails (§3.3.2). | 06 §3.3.2 | so there are no settlement fails (§3 | IN FORCE |
| D096 | the launch universe is exactly 400 authored instruments (240 equities, 30 ETFs, 30 government bonds, 50 corporate bonds, 10 FX pairs, 20 commodities, 20 tokens). Derivative series are lazy and created by rule (§3.1). | 06 §3.1 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D097 | The implied-vol index is renamed GXV. The Fear Index F belongs to 04, and 06 reads F wherever "fear" appears. GX100 30-day ATM vol is floored at 04's anchor 0.10 + 0.004·F (§3.5.3, §3.13.3). | 06 §3.5.3 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D098 | Fixes 01's FX drift: UIP pass-through is 0.5 (04's `macro_fx_uip_share`, ruling in 24), not full, so carry earns a premium with crash risk (§3.9.2). | 06 §3.9.2 | so carry earns a premium with crash risk (§3 | IN FORCE |
| D099 | Defaults, depegs and bridge impairments are caused by balance sheets, never a fixed-probability roll. This replaces 01's fixed stablecoin depeg probability (§1 law 4, §3.8.3, §3.12.6–9). | 06 §1 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D100 | Bond default is mechanical: a missed payment beyond 3 game days of grace, a filing, or a restructuring (§3.8.3). | 06 §3.8.3 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D101 | Corporate PD comes from a Merton/KMV approximation. Banks use max(Merton, CET1-based PD). Spread = hazard × LGD + liquidity premium (§3.8). | 06 §3.8 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D102 | Primary auctions are uniform-price (yield or price) with a 35% award cap (§3.7.6). | 06 §3.7.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D103 | Commodity futures are cash-settled by default. Physical delivery is elective for holders with storage (§3.10.5). | 06 §3.10.5 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D104 | Compute, data and power are game-native commodities. Data freshness belongs to 11 (§3.10.6). | 06 §3.10.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D105 | Crypto runs one block per tick per chain, ordered by hash, with no priority fees. There are no bundles and no flash loans (§3.11.5, §3.12.11). | 06 §3.11.5 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D106 | Stablecoins come in three designs (GUSD fiat-reserve, VSD CDP, MUSD/MSH algorithmic). Mirage pays a 12%/yr savings rate (§3.12.6–8). | 06 §3.12.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D107 | Player tokens are specified in full but disabled by `player_tokens_enabled=false`. This satisfies both L10 and the brief's "no deferring" (§3.20). | 06 §3.20 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D108 | CDS: there is a credit event determination plus a recovery auction. Insiders of the reference entity cannot buy protection. Net protection sold per owner is capped at 25% of the reference debt (§3.17, §3.3.6). | 06 §3.17 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D109 | RFQ and auction counterparties appear only as rotating labels and credit tier. Holdings never leak (L11) (§3.18.3, §3.19). | 06 §3.18.3 | Follows locked L11 | IN FORCE |
| D110 | Collectible fees follow 01 (buyer premium 15%, seller fee 12%). With the NPC house these fees go to SINK (§3.18.3). | 06 §3.18.3 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D111 | the data reference price is $2 per DQU (§3.10.6). | 06 §3.10.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D112 | the GUSD reserve composition is 60/30/10 (§3.12.6). | 06 §3.12.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D113 | Restricted cash uses 03 §3.5.6. `AD_GRANT` is no longer used (§3.20). | 06 §3.5.6 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D114 | Reason codes are aligned to the 03 catalog: `EQ_DIVIDEND`, `CRY_TOKEN_MINT`, `DRV_PERP_FUNDING`, `COLL_AUCTION_FEE`. ETF expenses use 08's code (§5). | 06 §5 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D115 | LIC1 covers major crypto only. Meme coins need LIC2 (§3.2). | 06 §3.2 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D116 | The "top 200 holdings report" from the roadmap is left to 15. 06 does not publish holdings. | 06 | Standard market practice, adapted so each class creates a real decision | IN FORCE |
| D117 | Money location follows 03: settlement cash (account 1001) is the default; deposits (1010) are optional; banks hold reserves (1002). Loans create deposits (`CREDIT_CREATE`), and repayments destroy them (§1, §3.1.1). | 07 §1 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D118 | 03 owns the payment rail. 07 adds bank FX margins and deposit pricing on top of it (§3.1.2). | 07 §3.1.2 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D119 | there are no negative retail rates. Negative CB rates pass through only to corporate deposits above $10M (§3.1.3). | 07 §3.1.3 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D120 | V3 question 2 is resolved: a player bank can fail permanently. Equity is lost, the charter is revoked, a 1-chapter ban follows, and the owner has limited liability (§3.10.5). | 07 §3.10.5 | resolved: a player bank can fail permanently | IN FORCE |
| D121 | V3 question 1 was already resolved by 14 (CH_BANK at R4). 07 adds the scope levels COMMUNITY, COMMERCIAL and UNIVERSAL (UNIVERSAL needs rank ≥ R5). 13 owns approval and fees, and the fees are proposed as DEFAULT (§3.11.1). | 07 §3.11.1 | resolved by 14 (CH_BANK at R4) | IN FORCE |
| D122 | Resolution tools are P&A, bail-in or liquidation, chosen by least cost. 13 picks by rule and 07 executes (§3.10.3). | 07 §3.10.3 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D123 | no taxpayer loss absorption for TCH. 04 may lend liquidity, never capital (§3.17.8). | 07 §3.17.8 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D124 | Runs are caused, not rolled. Confidence C has asymmetric updates; the withdrawal hazard is x² below C_crit; the DGF covers $250k per beneficial owner per bank (§3.8, §3.9). | 07 §3.8 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D125 | The credit bureau score excludes Reputation, so lenders see credit facts only (§3.4.2). | 07 §3.4.2 | so lenders see credit facts only (§3 | IN FORCE |
| D126 | Lending standards S drive a causal credit cycle that feeds 04 (§3.5.3, §3.22). | 07 §3.5.3 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D127 | The interbank market matches hourly with PD tolerance and counterparty limits. ONR is fixed daily (§3.7). | 07 §3.7 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D128 | Hourly GC repo is a uniform-price auction. Specials are driven by securities-lending utilization. Collateral moves by title transfer with a re-use invariant (§3.12). | 07 §3.12 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D129 | Haircuts come from a single table shared by margin, repo and CB eligibility, with stress multipliers (§3.15.6). | 07 §3.15.6 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D130 | Margin: retail uses rule-based IM. Listed products use SCAN. OTC, CDS and PB use filtered-historical VaR/ES with anti-procyclicality weight 0.25 (`DEFAULT`) (§3.15). | 07 §3.15 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D131 | The liquidation engine respects a fair-value band and a 20% participation cap. 01's "liquidation penalty sink" becomes a transfer to insurance funds, with the excess swept to SINK (§3.16.4–5). | 07 §3.16.4 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D132 | ClearingDebt survives bankruptcy, per ROADMAP 2.6 (§3.16.5). | 07 §3.16.5 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D133 | TCH runs the LD, OTC, CDS, REPO and CRY services plus ESC escrow. It has a Cover-2 DF, SITG layers and a juniorized waterfall, with ADL only in CRY. Sponsored CCPs open at R6 (§3.17, §3.20). | 07 §3.17 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D134 | fixed-rate loan prepayment pays a break cost equal to the PV difference to current OIS (§3.3.2). | 07 §3.3.2 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D135 | Individual shorts ≥ 1% of float are disclosed by legal filing, which is the L11 exception. Aggregates are public. The "top 200 holdings" report is left to 15 (§3.13.5). | 07 §3.13.5 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D136 | Reserve requirements, the deposit facility (`bank.cb.deposit`) and ELA (`bank.cb.elaRequest`) belong to 04. 07 adds a `solvencyTest` for ELA. `bank.cb.facility` is MLF only (§3.7.5). | 07 §3.7.5 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D137 | Reason codes follow 03's catalog. Requested additions: `CCP_LIQUIDATION_PENALTY`, `CCP_INS_FUND_SWEEP`, `BNK_FX_MARGIN`, `BNK_ENFORCEMENT_FEE`, `CLR_DEBT_REPAY` (§5). | 07 §5 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE via R06 |
| D138 | 04's shock hooks (`corporatePdMultiplier`, `depositConfidenceShock`, `repoHaircutShock`) are implemented with stacked PD shocks capped at 5×. Outputs go to 04 at day close, including `creditConditions = 1 − 2·S̄` (§3.22). | 07 §3.22 | Credit and clearing behave like real institutions; failures are caused, not rolled | IN FORCE |
| D139 | roadmap Q6 resolved option A (custody makes theft impossible; betrayal = market abuse, S5; no exit scam). | 08 §3.1.12 | resolved option A (custody makes theft impossible | IN FORCE |
| D140 | fund kinds and rank gates: hedge/FoF/credit/long-only R3; VC/PE/MMF/ETF sponsor R4 + LIC4; SWF R6. DEFAULT. | 08 §3.1.1 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D141 | series accounting with per-series HWM; performance fee paid in cash by cancelling investor units (G unchanged). DEFAULT. | 08 §3.1.4 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D142 | swing pricing on by default. DEFAULT. | 08 §3.1.4 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D143 | forward pricing with cutoff at the closing auction (t = 539). DEFAULT. | 08 §3.1.5 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D144 | redemption price fixed at strike; engine liquidation for shortfalls (makes fund runs emergent). DEFAULT. | 08 §3.1.6 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D145 | default transparency EXPOSURES; investors bound by automatic NDA. DEFAULT. | 08 §3.1.15 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D146 | funds ≥ $1B AUM file top-10 quarterly with 7-game-day delay (aligned to 02 §8.3). DEFAULT. | 08 §3.1.16 | Mirrors real fund, structured and insurance practice within L11 privacy | SUPERSEDED by R20 |
| D147 | NPC allocator capital to player funds; fees on NPC share are FAUCET, NPC capital is not player wealth. DEFAULT. | 08 §3.1.17 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D148 | closed-end European waterfall default, 8% pref, 4-year term, 1-year investment period. DEFAULT. | 08 §3.1.18 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D149 | money-market funds with stable NAV, break-the-buck rule, hh run channel. DEFAULT. | 08 §3.1.19 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D150 | SWF for R6 with ≤ 25% bloc-treasury co-investment and primary-dealer privilege. DEFAULT (resolves V3 3.12 "found a sovereign wealth fund"). | 08 §3.1.20 | resolves V3 3 | IN FORCE |
| D151 | ETF creation/redemption settles at day-close NAV, cutoffs t = 539 / 719. DEFAULT. | 08 §3.2.2 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D152 | active ETFs disclose baskets daily (opt-in filing rule, L11-compatible). DEFAULT. | 08 §3.2.8 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D153 | one level of re-securitization (CDO of ABS mezz only, no CDO²). DEFAULT. | 08 §3.3.2 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D154 | Vasicek LHP for ratings/model prices; real correlation emerges from 07/10 regime-dependent hazards; agencies estimate ρ from history. DEFAULT. | 08 §3.3.4 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D155 | SPV consolidated into sponsor if sponsor holds > 50% equity tranche and services. DEFAULT. | 08 §3.3.7 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D156 | weekly (7 game days) payment dates; OC/IC trigger defaults. DEFAULT. | 08 §3.3.8 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D157 | three NPC agencies; players cannot own or charter a rating agency; ≤ 9.9% of a listed parent. DEFAULT (Mathis may override). | 08 §3.4.1 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D158 | rating shopping legal; preliminary-disclosure is a politics lever defaulting to false. DEFAULT. | 08 §3.4.5 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D159 | composite = median of published ratings; NR treated as BB− by consumers. DEFAULT. | 08 §3.4.7 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D160 | insurable-interest rule (keeps insurance from being a bet, L5). DEFAULT. | 08 §3.5.1 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D161 | premiums billed daily by default. DEFAULT. | 08 §3.5.2 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D162 | binding moratorium for perils under warning. DEFAULT. | 08 §3.5.3 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D163 | four natural perils rolled here (storm, flood, quake, wildfire); cyber pandemic, unrest, contagion come from 12/16. DEFAULT. | 08 §3.5.6 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D164 | the 03 §11.3 "20% of insured limits" rule kept as a floor only for the conflict lines (cyber, ransomware, model/IP, collectibles, legal), net of reinsurance, plus an SCR. DEFAULT; this is an interpretation of an old rule (see report). | 08 §3.5.7 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D165 | Policyholder Guarantee Scheme per bloc, 80% cover, $10M cap, levy 0.5%. DEFAULT. | 08 §3.5.7 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D166 | cat bonds 2-game-year term, indemnity counts only cover bound ≥ 28 game days before an event. DEFAULT. | 08 §3.5.9 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D167 | V3 Q4 (real-world-inspired crisis templates): the live world has only emergent crises (§3.3.5); named templates may exist only as ring-fenced challenge scenarios owned by 15/18. DEFAULT. | 08 §3.3.5 | Mirrors real fund, structured and insurance practice within L11 privacy | IN FORCE |
| D168 | **Roadmap Q2 and conflict C4 resolved option A (bible pace)**: base payback B1 6 / B2 12 / B3 24 / B4 48 / B5 96 / B6 200 game days, defined net of all opex at reference crowding. DEFAULT. | 09 §3.1.2 | resolved option A (bible pace)**: base payback B1 6 / B2 12 / B3 24 / B4 48 / B5 96 / B6 200 game days, defined net of all opex at reference crowding | IN FORCE via R18, needs Mathis yes (Y4) |
| D169 | B3+ businesses must be owned by a company. DEFAULT. | 09 §3.1.1 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D170 | catalog purchase pays c0 as SINK; included fit-out lease for premises when not owned. DEFAULT. | 09 §3.1.5 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D171 | genesis calibration at 12 player businesses + 50% NPC field per market. DEFAULT. | 09 §3.2.4 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D172 | segment coefficients and promise bonuses. DEFAULT. | 09 §3.3.1 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D173 | customer stickiness θ = 0.04/game hour. DEFAULT. | 09 §3.3.2 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D174 | category-level price elasticity added to stop collusive price rises. DEFAULT. | 09 §3.3.5 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D175 | offline cap 8 / +8 manager / +4 automation / 24 professional CEO / none for listed companies (autopilot 0.9 after 24 game days). DEFAULT. Also resolves the 01 §8.3 offline cap vs 01 §14.2 "dormant businesses run on managers at 50% income" contradiction: dormant businesses are IDLE with 50% attractiveness weight, no income. | 09 §3.4.4 | resolves the 01 §8 | IN FORCE via R16, needs Mathis yes (Y6) |
| D176 | EV is profit-based; upgrade costs not added (implements 01 §9's "70% reflected" rule by mechanism). | 09 §3.5.2 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D177 | product lines, category frontier drift, R&D formulas (company building, Mathis directive 2026-10-09). DEFAULT. | 09 §3.5.4 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D178 | managers, CEOs, AI operators all act through the same decisions; no unexplained profit multiplier (I05). DEFAULT. | 09 §3.6.3 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D179 | transfer pricing COST only inside 100%-owned groups; arm's-length across minority boundaries (I07, R02). DEFAULT. | 09 §3.7.4 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D180 | financial catalog items: 10% SINK + 90% becomes capital/stake. DEFAULT. | 09 §3.8.1 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D181 | **V3 question 1 resolved**: insurers R3, banks R4, exchange concessions R5, SWF R6 (earlier than Dynasty for banks and exchanges). DEFAULT. | 09 §3.8.1 | resolved**: insurers R3, banks R4, exchange concessions R5, SWF R6 (earlier than Dynasty for banks and exchanges) | AMENDED by R13 |
| D182 | concessions re-auctioned each chapter, sealed first-price, 10% incumbent credit, book value to outbid incumbent (01 §14.2 kept); fee caps on platforms. | 09 §3.8.3 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D183 | Tender Board design; 30% of B2B demand tendered; requirement types; incumbency and switching costs; concentration bargaining (C05–C08). DEFAULT. | 09 §3.9 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D184 | 2% P2P tax applies to asset transfers, not service fees (assumption for 15). | 09 §3.9.6 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D185 | **01 §4.3 "5+ sectors needed for IPO" dropped**: any company with EV ≥ $50M and 3 quarters may list (company-building directive). Founder needs R3 + LIC3. DEFAULT. | 09 §3.10.1 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D186 | founder secondary at IPO allowed up to 10% (roadmap left open). DEFAULT. | 09 §3.10.2 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D187 | listed player companies are anchored by a sum-of-the-parts fundamental V (business EV rule), not annual P/E. DEFAULT (needed for consistency; see report). | 09 §3.10.4 | Business economics stay legible, game-paced and resistant to farming | IN FORCE via R10 |
| D188 | startup hidden fate + noisy observed scores; research narrows noise. DEFAULT. | 09 §3.11 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D189 | listed companies one share one vote; founder super-vote converts at IPO. DEFAULT. | 09 §3.12.1 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D190 | 07 lends to operating businesses up to min(50% EV, 4× EBITDA). DEFAULT (assumption for 07). | 09 §3.12.2 | Business economics stay legible, game-paced and resistant to farming | SUPERSEDED by R11 |
| D191 | thresholds 5/10/20/50/90%; tender rules; takeovers require LIC4. DEFAULT. | 09 §3.13 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D192 | NPC founders may refuse (independence) (W04). DEFAULT. | 09 §3.13.5 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D193 | NPC proxy advisor model with engine-valued motions. DEFAULT. | 09 §3.13.8 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D194 | LBO limits and covenants. DEFAULT. | 09 §3.14 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D195 | Protected Reorganization with absolute priority, cram-down, 91-game-day deadline; claims tradeable on 06. DEFAULT. | 09 §3.16 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D196 | #14: dividends paid within 91 game days before a filing while insolvent are clawed back. DEFAULT. | 09 §9 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D197 | #21: IDLE/failed businesses release their storefront slot after 14 game days. DEFAULT. | 09 §9 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D198 | #20: same-controller mergers with minority holders need a majority-of-minority vote. DEFAULT. | 09 §8 | Business economics stay legible, game-paced and resistant to farming | IN FORCE |
| D199 | Ten new city names (Lakemont, Redmesa, Valcourt, Belmara, Tessan, Mirako, Skarvik, Vintra, Cobreval, Alta Verde) and launch populations; 22 authoritative. DEFAULT. | 10 §3.2.1 | Property and cities stay economically grounded and readable | IN FORCE |
| D200 | Full district lists for all 15 cities, merging old 01 (Financial Mile, Glasshill, Riverside Lofts, Industrial Basin, Summit Estates) with old 06 (Eastside Docks, Midtown, Gilt Hill as the hill of Summit Estates). Resolves the 01/06 district-name conflict. DEFAULT. | 10 §3.2.2 | Resolves the 01/06 district-name conflict | IN FORCE |
| D201 | New-city opening rule (bloc choice, frontier moment, cap 60). Resolves old 06 Q5 (future cities from distinct personalities, not palette mixing). | 10 §3.2.3 | Resolves old 06 Q5 (future cities from distinct personalities, not palette mixing) | IN FORCE |
| D202 | City access: home bloc R0, other blocs R2, islands R6. Resolves old 06 unlock list extended to 15 cities. DEFAULT. | 10 §3.2.4 | Resolves old 06 unlock list extended to 15 cities | AMENDED by R14 |
| D203 | Cross-bloc 1 GD settlement delay waived by a jet (old 04 §7.5 flag adopted). | 10 §3.2.4 | Property and cities stay economically grounded and readable | IN FORCE |
| D204 | §3.6 Growth is driven by demand/supply pressure (LC07), replacing old 06 §7.1 DP score. Resolves old 06 Q7 (growth formula). | 10 §3.4 | Resolves old 06 Q7 (growth formula) | IN FORCE |
| D205 | §3.14 R0 rented room rent = market rent ≈ $5.40/GD, superseding old 04's $60/GD. DEFAULT. | 10 §3.6.2 | Property and cities stay economically grounded and readable | IN FORCE via R24, needs Mathis yes (Y5) |
| D206 | comp_base calibrated so 14's homes table prices hold exactly at launch. | 10 §3.8.4 | Property and cities stay economically grounded and readable | IN FORCE |
| D207 | Recourse rules (residential full within 13 floor; company commercial non-recourse; character commercial limited 25%). DEFAULT. | 10 §3.10.6 | Property and cities stay economically grounded and readable | IN FORCE |
| D208 | Cash-out refinance seasoning 28 GD and +10% cap (closes old E08). | 10 §3.10.7 | Property and cities stay economically grounded and readable | IN FORCE |
| D209 | Permits, variances, rezoning probabilities and objections. DEFAULT. | 10 §3.11.3 | Property and cities stay economically grounded and readable | IN FORCE |
| D210 | Location economics made explicit (`location_j` supplied to 09); cosmetic placement never affects it. Resolves LC09. | 10 §3.15.3 | Resolves LC09 | IN FORCE |
| D211 | Island auction schedule: 3 at launch, then 1 per chapter. DEFAULT. | 10 §3.18 | Property and cities stay economically grounded and readable | IN FORCE |
| D212 | Generator: hybrid skeleton + historic agent growth + tensor-field extensions (LC13); regions vs chunks (LC14); persisted topology; IDs without generator version (LC15). Resolves old 06 Q2, Q4, Q8. | 10 §3.19 | Resolves old 06 Q2, Q4, Q8 | IN FORCE |
| D213 | HQs never move with rank; relocation only on real events; height does not track market cap. Resolves old 06 Q6 first part. | 10 §3.20.1 | Resolves old 06 Q6 first part | IN FORCE |
| D214 | Market lights as optional overlay `0.50 + 0.30·r` (LC06). | 10 §3.20.1 | Property and cities stay economically grounded and readable | IN FORCE |
| D215 | Hall of Patrons (12, opt-in, chapter snapshot) plus real crown parcels instead of resizing wealth towers. Resolves old 06 Q6 (per-city recognition) and Q10 (opt-in). DEFAULT. | 10 §3.22 | Resolves old 06 Q6 (per-city recognition) and Q10 (opt-in) | IN FORCE |
| D216 | Owner names hidden by default; opt-in per property. DEFAULT. | 10 §3.24 | Property and cities stay economically grounded and readable | IN FORCE |
| D217 | Camera elevation 30° (LC11 correction of old 06 §3.1). Renderer three.js behind CityRenderer (resolves old 06 Q1/Q3 for the spec; 17/19 own details). | 10 §3.26 | resolves old 06 Q1/Q3 for the spec | IN FORCE |
| D218 | Property income continues at 100% for dormant owners under a manager (old 01's 50% dormant rule applies to businesses only). DEFAULT. | 10 §3.27 | Property and cities stay economically grounded and readable | IN FORCE |
| D219 | Crisis templates (V3 Q4) left to 16 but must act through 04/07 inputs, never set prices. | 10 §3.12 | Property and cities stay economically grounded and readable | IN FORCE |
| D220 | 1 old research day = 8 GD; every AI timer runs on the game clock, also offline and in solo. DEFAULT; resolves old 05 open question 1 (header, §3.5). | 11 §3.5 | resolves old 05 open question 1 (header, §3 | IN FORCE |
| D221 | Lab opens at $100k NW. T1 is set at $250k (R2) to resolve the old 04 versus 05 mismatch. DEFAULT (§3.2). | 11 §3.2 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D222 | LINEAR is free at unlock, plus 200 PFd of starter compute. DEFAULT (§3.2). | 11 §3.2 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D223 | Lab tier is the minimum of NW eligibility and the arch tier. Peak NW never demotes. DEFAULT (§3.2). | 11 §3.2 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D224 | GPU throughput is 336 × rating PFd/GD, with kWh/PFd set per model. This reconciles 01's data center with RESOLVED C1's $0.15/PFd and supersedes old 05's kW column (§3.3.1). | 11 §3.3.1 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D225 | Cold-climate PUE 1.12 is allowed only in 4 Nordic and alpine cities. DEFAULT (§3.3.2). | 11 §3.3.2 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D226 | Reserved cloud costs $2.0/PFd over a 30-GD commit and has no preemption. Spot preemption begins at u > 0.90. DEFAULT (§3.3.3). | 11 §3.3.3 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D227 | DU_cap gets a bonus of up to +25% from owned compute only, and the hard cap is 2,000 (RN A1, C3a) (§3.3.7). | 11 §3.3.7 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D228 | Data halflives are set per domain. DEFAULT (§3.4.1). | 11 §3.4.1 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D229 | Synthetic data collapses above a 40% share. Old 05 §9 formalised (§3.4.6). | 11 §9 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D230 | Research tree costs and A values are fixed, with SECRET_SAUCE A bonus U(1.5, 3.0). DEFAULT (§3.5). | 11 §3.5 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D231 | Scaling law recalibrated to α 0.15, β 0.12, k 2.31, γ 0.02. Resolves old 05 open question 8 (§3.6.1). | 11 §3.6.1 | Resolves old 05 open question 8 (§3 | IN FORCE, needs Mathis yes (Y3) |
| D232 | Specialist models get 1.40 in-domain and 0.40 elsewhere. DEFAULT (§3.6.3). | 11 §3.6.3 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D233 | Failure formula: checkpointing and a PARTIAL outcome at 25%. DEFAULT (§3.6.6). | 11 §3.6.6 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D234 | Capability is information. Hidden signals are estimated with ρ(m), and common plus lineage noise produces crowding. DEFAULT; formalises A03 and A06 (§3.8). | 11 §3.8 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D235 | effMCS factors: the freshness floor is 0.3, regimeFit is 0.7 and liveFeed is 0.2. These replace old 05 §7.1 edge timers (§3.8.4). | 11 §7.1 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D236 | No outright model sale; licensing only. Applies Bible decision 6 and supersedes old 05 §4.5 (§3.9.5). | 11 §4.5 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D237 | AP, DP_ai and scanTier formulas are derived from MCS bands, which equal the RN B2 bands (§3.9.3). | 11 §3.9.3 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D238 | NPC licensing pool is $150k/GD × aiRaceIndex × N_a/10k (FAUCET). DEFAULT (§3.9.5). | 11 §3.9.5 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D239 | Strategy graph blocks, DU costs and the 12 templates. DEFAULT (§3.10). | 11 §3.10 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D240 | Withheld worlds come in weekly sets of 50, each 10 GD. Paper trading lasts at least 2 GD before staging. DEFAULT (§3.12). | 11 §3.12 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D241 | Tournament: weekly, three divisions, one shared seeded market, no cash. DEFAULT (§3.13). | 11 §3.13 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D242 | Distillation retention is bounded to 0.60–0.90, with an arch ceiling at 1.25 × the tier top. Laundering follows RN B1 (example 166). DEFAULT (§3.14). | 11 §3.14 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D243 | Query distillation is open to licensees (the underdog route), and the noTrainClause is a breach that the engine verifies. DEFAULT (§3.14.2). | 11 §3.14.2 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D244 | Honeypot poison causes regime-change losses, and each fine-tune halves it. DEFAULT (§3.14.6). | 11 §3.14.6 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D245 | Rogue episodes and safety incidents: formulas set, and incidents are PUBLIC as a filing rule. DEFAULT (§3.15). | 11 §3.15 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D246 | Registration applies at MCS ≥ 200 or at least $50M of capital, summed across the lineage. DEFAULT (§3.16.1, X15). | 11 §3.16.1 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D247 | Fog of war: rival capability is private and only bands are public. Resolves old 05 open question 3 (§3.16.3). | 11 §3.16.3 | Resolves old 05 open question 3 (§3 | IN FORCE |
| D248 | Trusted-lab badge criteria and benefits. Resolves old 05 open question 5 (§3.16.4). | 11 §3.16.4 | Resolves old 05 open question 5 (§3 | IN FORCE |
| D249 | 30 NPC labs give a PvE floor and grow by 2 per new city. Resolves old 05 open question 6 (§3.17). | 11 §3.17 | Resolves old 05 open question 6 (§3 | IN FORCE |
| D250 | Frontier milestones are PUBLIC unless suppressed with a Reputation escrow. DEFAULT (§5). | 11 §5 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D251 | Hardware delivered to a full site goes to storage. DEFAULT (§8.5). | 11 §8.5 | AI progression stays costly, crowding-aware and fair to underdogs | IN FORCE |
| D252 | Renamed the 12 cyber ops and 8 espionage ops to abstract game verbs (C01–C12, E1–E8) per the safety rule; mechanics unchanged. (§3.9) | 12 §3.9 | Conflict stays abstract, bounded and counterable (L2, L3) | IN FORCE |
| D253 | Added market-conduct ops M1–M4 as first-class verbs (V3 Part 6, K01–K07); 12 defines verbs, 05 computes surveillance score, 13 prosecutes. (§3.11) | 12 §3.11 | Conflict stays abstract, bounded and counterable (L2, L3) | IN FORCE |
| D254 | `AttackCapability.crewGrade` and physical-crew resolution for E5 reuse the breach logistic with AP→crewGrade vs physicalSecurityGrade. (§3.9) | 12 §3.9 | Conflict stays abstract, bounded and counterable (L2, L3) | IN FORCE |
| D255 | budget allocation modes AUTO_EVEN / AUTO_VALUE / MANUAL; AUTO_VALUE weights by sqrt(value). (§3.3) | 12 §3.3 | Conflict stays abstract, bounded and counterable (L2, L3) | IN FORCE |
| D256 | Resolved old 03 §19 Q1 (crime tone): abstract corporate-thriller verbs. Q5 (physical espionage): included (E5), physical-security-only defense. (These were Mathis-confirmed in the bible; restated.) | 12 §19 | Resolved old 03 §19 Q1 (crime tone): abstract corporate-thriller verbs | IN FORCE |
| D257 | Confirmed heat multiplies exposure only, never breach/detection (bible row 4). (§3.1) | 12 §3.1 | Conflict stays abstract, bounded and counterable (L2, L3) | IN FORCE |
| D258 | Resolved old roadmap **Q8** (Held in solo): Held is online-only; solo applies fines/op-bans/record only. DEFAULT (Mathis may override). (§3.10, test 12) | 13 §3.10 | Resolved old roadmap **Q8** (Held in solo): Held is online-only | IN FORCE |
| D259 | Resolved old 03 §19 **Q2** (Held exists): temporary freeze ≤24h/verdict kept (Mathis-confirmed, bible). **Q3** (Most Wanted): opt-in, cosmetic, +15% detection on public top 10 (15 owns display). **Q4** (crime ≈ honest EV): target 0.8–1.2 (20 bands). **Q6** (case-selling): in, 30–50% share. | 13 §19 | Resolved old 03 §19 **Q2** (Held exists): temporary freeze ≤24h/verdict kept (Mathis-confirmed, bible) | IN FORCE |
| D260 | regulator capacity is per partition (invisible shards), scaling with that partition's active chars. (§7.3) | 13 §7.3 | Law is evidence-based and never decided by wealth | IN FORCE |
| D261 | evidence can only derive from SEALED engine events (`sealedRefs` non-empty); fabricated reports yield zero evidence. (§5, test 18) | 13 §5 | Law is evidence-based and never decided by wealth | IN FORCE |
| D262 | wrongful-conviction target band < 3%, audited by 20. (§14 #12) | 13 §14 | Law is evidence-based and never decided by wealth | IN FORCE |
| D263 | Confirmed Reputation never touches verdicts/fines/fees, only freezes and premiums (bible row 5). (§3.4) | 13 §3.4 | Law is evidence-based and never decided by wealth | IN FORCE |
| D264 | handle 3–20 characters, changeable once per chapter for $1,000. DEFAULT. | 14 §3.1.3 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D265 | 4 backgrounds, flavor plus one tilt, never cash. DEFAULT. | 14 §3.1.4 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D266 | home city change once per chapter for $25,000. DEFAULT. | 14 §3.1.5 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D267 | 2FA mandatory at top 1% NWI and for alliance Chairs. DEFAULT. | 14 §3.1.6 | Progression and status stay meaningful without pay-to-win | AMENDED by R22 |
| D268 | deletion anonymizes public records ("a former participant") instead of erasing history. DEFAULT. | 14 §3.1.7 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D269 | rank names follow 00 (R3 Mogul, R4 Tycoon), replacing old R3 Operator / R4 Mogul. Old thresholds kept. | 14 §3.2.2 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D270 | V3 question 1 resolved. Bank, insurer and custodian charters open at R4; fund and exchange membership at R3. | 14 §3.2.2 | resolved | IN FORCE |
| D271 | R6 needs all of: $20B real, top 50 at 24 consecutive closes, and a House. DEFAULT; this extends 17's "top 50" assumption. | 14 §3.2.3 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D272 | ranks are evaluated at day close and never demoted. DEFAULT. | 14 §3.2.4 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D273 | city access is home bloc at R0, other blocs at R2, Isla Serena at R4. DEFAULT. | 14 §3.2.6 | Progression and status stay meaningful without pay-to-win | AMENDED by R14 |
| D274 | license fees, exams and 10% renewal. DEFAULT. | 14 §3.3.1 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D275 | LIC1 is paid by a $250 onboarding grant. | 14 §3.3.1 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D276 | title PP has a fresh value during its chapter and a heritage value after it. | 14 §3.5.2 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D277 | LIMITED drops are allocated by category PP, then request tick. There is no lottery (L5, no gambling). DEFAULT. | 14 §3.6.3 | Follows locked L5, no gambling | IN FORCE |
| D278 | display requires residence storage; paid storage never displays. DEFAULT. | 14 §3.6.5 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D279 | dealer buyback at −15%. DEFAULT. | 14 §3.6.10 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D280 | homes use rarity 1 except UNIQUE homes. This resolves the old 04 table, which listed the mansion and estate as Limited but priced them at rarity 1. | 14 §3.7.1 | resolves the old 04 table, which listed the mansion and estate as Limited but priced them at rarity 1 | IN FORCE |
| D281 | the experience burst lasts 60 game days. This resolves the old 04 claim "1 game month ≈ 2.5 real days", which does not fit 00's clock. | 14 §3.7.6 | resolves the old 04 claim "1 game month ≈ 2 | IN FORCE |
| D282 | the Prestige formula is from old 04 §7.2. Category weights are 0.5^(k−1) and a completed set gives +20%. | 14 §3.8 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D283 | Reputation scaling is +Δ(100−R)/50 and −Δ(0.5+R/100). Conviction penalties run from S1 −10 to S6 −30. Philanthropy is capped at 20 per chapter. DEFAULT. | 14 §3.10 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D284 | the Glasshill whisper accuracy band U(0.45, 0.75) is used by 16 §3.6.9. | 14 §3.12.1 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D285 | the Chief of Staff can queue 3 intents. DEFAULT. | 14 §3.12.6 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D286 | Fresh Start follows ROADMAP §2.6. It resolves ROADMAP conflict C5: 72-hour restricted cash, 56-day cooldown. | 14 §3.13 | resolves ROADMAP conflict C5: 72-hour restricted cash, 56-day cooldown | IN FORCE via R17 |
| D287 | inheritance tax bands. DEFAULT. | 14 §3.15.4 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D288 | no cross-account bequests. DEFAULT. | 14 §3.15.5 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D289 | player characters do not age. | 14 §3.15.6 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D290 | the Gilt List is published each game quarter, with a cover-star formula. | 14 §3.16.3 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D291 | Hall of Patrons, 12 per city, frozen per chapter. | 14 §3.16.4 | Progression and status stay meaningful without pay-to-win | IN FORCE |
| D292 | one persistent world (L1). Partitions are invisible, with a diff test. | 15 §3.1 | Follows locked L1 | IN FORCE |
| D293 | old 02 open question 2 resolved. The country board rule is kept, with a 180-day change limit and a score reset. | 15 §3.2.2 | resolved | IN FORCE |
| D294 | chapters are 56 real days, with 4 phases and 12 themes. DEFAULT. | 15 §3.3 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D295 | 17 boards. Net P2P inflows are subtracted from performance boards. DEFAULT. | 15 §3.4 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D296 | the finish is the mean of 24 closes. This replaces old 02's "last 3 game days", which is only 3 real hours under 00's clock. | 15 §3.5 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D297 | ROADMAP conflict C1 resolved. A new player's rival is the closest player above; if that player is more than 3× ahead, the nearest NPC reference row is shown instead. | 15 §3.5.5 | resolved | IN FORCE |
| D298 | Season Finals and the Hall of Fame. DEFAULT. | 15 §3.5.6 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D299 | contract fees, and the 2% P2P tax with principal exempt. DEFAULT. | 15 §3.6.8 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D300 | the Mandate shape is a superset of 08's assumed fields. | 15 §3.6.11 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D301 | anti-funnel age caps. DEFAULT. | 15 §3.6.12 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D302 | inflows to an alliance treasury are exempt from tax; outbound transfers are taxed at 2%, capped. DEFAULT. | 15 §3.7.2 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D303 | HOLDINGS_QUARTERLY applies to funds and to LIC4 holders with ≥ $1B. This replaces old 02's top-200 public holdings report, which conflicts with L11. DEFAULT. | 15 §3.8 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE via R20, needs Mathis yes (Y7) |
| D304 | no automatic "whale accumulates" news items. Old 01 §6.3 is removed (L11). | 15 §3.8 | Follows locked L11 | IN FORCE |
| D305 | no links or images in chat. DEFAULT. | 15 §3.9.2 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D306 | old 02 open question 5 resolved. Chat opens at launch, with moderation. | 15 §3.9.3 | resolved | IN FORCE |
| D307 | chat is never evidence in 13 and never a channel for engine effects. | 15 §3.9 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D308 | statements cost $500, 3 per game day, and are fact-checked by 16 and 13. | 15 §3.10 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D309 | the human rate cap is 00's 20 intents per tick, overriding old 02's 10. | 15 §3.12 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D310 | V3 question 3 resolved. The official API opens at R2 with Rep ≥ 30 and an account at least 7 days old. DEFAULT. | 15 §3.12.4 | resolved | SUPERSEDED by R02 |
| D311 | untargetability starts at inactive (14 days). This resolves the old 03 vs 02 inconsistency (dormant at 14 vs inactive 14 / dormant 30) and matches 12. | 15 §3.13 | resolves the old 03 vs 02 inconsistency (dormant at 14 vs inactive 14 / dormant 30) and matches 12 | IN FORCE via R16 |
| D312 | V3 question 4 resolved. Named, real-world-inspired scenarios appear only in challenges and the Academy, never in the live world. | 15 §3.14.3 | resolved | AMENDED by R03 |
| D313 | the weekly AI tournament follows ROADMAP. | 15 §3.14 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D314 | ROADMAP Q6 (fund-related) is left to 08. | 15 §3.14 | One fair persistent world (L1) with privacy by default (L11) | IN FORCE |
| D315 | the money closure. Household and firm flows are internal TRANSFERs. Spending at player businesses is FAUCET under 03's boundary rule. NPC sector income comes from the 04 nominal-GDP closure (`ROW_NPC_INCOME`). DEFAULT. | 16 §3.2.5 | The world lives on its own and every effect has a cause | IN FORCE |
| D316 | a roster of 600 actors by archetype; 40 per new city. DEFAULT. | 16 §3.3.1 | The world lives on its own and every effect has a cause | IN FORCE |
| D317 | knowledge firewall. NPC rules never read a player's rank, NW, boards or Prestige (C09, F05). | 16 §3.3.2 | The world lives on its own and every effect has a cause | IN FORCE |
| D318 | the utility model uses Gumbel noise, an action margin of 0.05 and 2 actions per epoch. DEFAULT. | 16 §3.3.3 | The world lives on its own and every effect has a cause | IN FORCE |
| D319 | NPC funds are capped at 0.5 × ADV (old ROADMAP R5). | 16 §3.3.8 | The world lives on its own and every effect has a cause | IN FORCE |
| D320 | 12 dynasties of 8 members. DEFAULT. | 16 §3.4.1 | The world lives on its own and every effect has a cause | IN FORCE |
| D321 | actors age at 0.25 per game year, because 00's clock would otherwise age them 24 years per real year. Player characters do not age (14 §3.15.6). | 16 §3.4.6 | because 00's clock would otherwise age them 24 years per real year | IN FORCE |
| D322 | 300 seats, 4 parties and 12 caucuses per bloc. DEFAULT. | 16 §3.5.1 | The world lives on its own and every effect has a cause | IN FORCE |
| D323 | the 21-lever policy registry. DEFAULT. | 16 §3.5.9a | The world lives on its own and every effect has a cause | IN FORCE |
| D324 | Stabilizer precedence. The legislated value is the base and the Stabilizer applies a bounded offset (±3 points on TAX_TOP_INCOME). DEFAULT. | 16 §3.5.9a | The world lives on its own and every effect has a cause | SUPERSEDED by R04 |
| D325 | a new governor's hawkishness is set from econ ideology. DEFAULT. | 16 §3.5.10 | The world lives on its own and every effect has a cause | IN FORCE |
| D326 | no player office-holding at launch. DEFAULT. | 16 §3.5.11 | The world lives on its own and every effect has a cause | IN FORCE |
| D327 | invariants N1 (non-empty causes) and N2 (no false facts except labeled rumors). | 16 §3.6.1 | The world lives on its own and every effect has a cause | IN FORCE |
| D328 | the Terminal headline arrives 1 tick early, never before the event commit. "Why it moved" groups flows by pool type only (L11, L13). DEFAULT. | 16 §3.6.6 | Follows locked L11, L13 | IN FORCE |
| D329 | published research notes are added to support 14's PUBLISHED_RESEARCH legacy line. | 16 §3.6.6 | The world lives on its own and every effect has a cause | IN FORCE |
| D330 | player statements have no price effect. DEFAULT. | 16 §3.6.10 | The world lives on its own and every effect has a cause | IN FORCE |
| D331 | ROADMAP §2.8 made exact. About 35% of chapters contain a MAJOR crisis: exogenous rate 0.20 plus endogenous, against a total of 0.43. DEFAULT. | 16 §3.7.1 | The world lives on its own and every effect has a cause | IN FORCE |
| D332 | no MAJOR or STORM onset in a chapter's first 24 or final 48 real hours. DEFAULT. | 16 §3.7.3 | The world lives on its own and every effect has a cause | IN FORCE |
| D333 | Crisis Week is scheduled only by LiveOps. DEFAULT. | 16 §3.7.3 | The world lives on its own and every effect has a cause | SUPERSEDED by R08 |
| D334 | "Since you left" uses 15's 20-minute While You Were Away threshold. | 16 §3.9.3 | The world lives on its own and every effect has a cause | IN FORCE |
| D335 | 5 eras at thresholds [0, 8, 18, 30, 45], at most one per 2 chapters. DEFAULT. | 16 §3.10.3 | The world lives on its own and every effect has a cause | IN FORCE |
| D336 | player tokens (L10, "later") are gated on FINTECH ≥ 3, era ≥ 2 and a LiveOps flag. DEFAULT. | 16 §3.10.4 | Follows locked L10, "later" | IN FORCE |
| D337 | mosaic doctrine. Conclusions drawn from public facts are legal to trade on. DEFAULT. | 16 §3.11.2 | The world lives on its own and every effect has a cause | IN FORCE |
| D338 | extortion (silence for payment) cannot be expressed as an intent or as a contract clause. | 16 §3.11.4 | The world lives on its own and every effect has a cause | IN FORCE |
| D339 | no secrets are ever generated from a player's private state (L11). | 16 §3.11.5 | Follows locked L11 | IN FORCE |
| D340 | briefs never recommend a trade direction. DEFAULT. | 16 §3.12 | The world lives on its own and every effect has a cause | IN FORCE |
| D341 | the new-player rival relies on 15's resolution of ROADMAP C1. | 16 §6.7 | The world lives on its own and every effect has a cause | IN FORCE |
| D342 | lobbying and contribution records survive anonymization under an anonymized label. DEFAULT. | 16 §8.19 | The world lives on its own and every effect has a cause | IN FORCE |
| D343 | Adopted the Quay desktop OS (Velvet spec, Mathis A-to-Z redesign 2026-10-09) as navigation for the whole game; 04 §10.1 five tabs become five app groups (Trade, Build, Shadow, World, Me). 32 apps defined (§3.2.4). DEFAULT. | 17 §3.2 | Clear, consistent interface across desktop and phone | IN FORCE |
| D344 | App unlock rules (Risk LIC2, Quant Lab R2, Research Desk R3, Company R2, AI Lab $100k, Alliance real day 3 or invite, Contracts after account upgrade, Institutions when a charter is available, API by flag). DEFAULT. | 17 §3.2.4 | Clear, consistent interface across desktop and phone | IN FORCE |
| D345 | Phone home is one vertically scrolling page grouped by the five groups (Quay said one page without scrolling; 32 apps need scroll). DEFAULT. | 17 §3.2.3 | Clear, consistent interface across desktop and phone | IN FORCE |
| D346 | No speed control in the shared world (L9); speed controls exist only in practice worlds and replays. | 17 §3.2.1 | Follows locked L9 | IN FORCE |
| D347 | Added named layouts Operator, Shadow, Institution to Quay's Trade/Review/Research. DEFAULT. | 17 §3.2.5 | Clear, consistent interface across desktop and phone | IN FORCE |
| D348 | Shadow sub-palette values for non-default palettes (steel/signal per palette). DEFAULT. | 17 §3.3.1 | Clear, consistent interface across desktop and phone | IN FORCE |
| D349 | Hero NW shows whole dollars at R3+ when ≥ $1M. DEFAULT. | 17 §3.4.1 | Clear, consistent interface across desktop and phone | IN FORCE |
| D350 | Full component catalog (≈60 components). DEFAULT. | 17 §3.5 | Clear, consistent interface across desktop and phone | IN FORCE |
| D351 | Simple/Pro per app, Broker Pro offered after first fill + 3 closed trades. DEFAULT. | 17 §3.6 | Clear, consistent interface across desktop and phone | IN FORCE |
| D352 | Confirmation thresholds (1% NW or $10k; 50 bp impact; 5% ADV; 10% fat finger; HoldToConfirm list). DEFAULT. | 17 §3.8 | Clear, consistent interface across desktop and phone | IN FORCE |
| D353 | Unified moment queue with priority order and Held as a non-celebration moment. DEFAULT. | 17 §3.9 | Clear, consistent interface across desktop and phone | IN FORCE |
| D354 | Notification routing table by category and priority P0–P4. DEFAULT. | 17 §3.10.1 | Clear, consistent interface across desktop and phone | IN FORCE |
| D355 | Lock-screen pushes hide amounts by default. DEFAULT. | 17 §3.10.5 | Clear, consistent interface across desktop and phone | IN FORCE |
| D356 | No presence indicators for other players except opt-in in DMs/alliance. DEFAULT. | 17 §3.11.7 | Clear, consistent interface across desktop and phone | IN FORCE |
| D357 | Rank material table under 00's rank names (R3 Mogul, R4 Tycoon). Resolves the naming contradiction with 04/velvet specs (Operator/Mogul). | 17 §3.12 | Resolves the naming contradiction with 04/velvet specs (Operator/Mogul) | IN FORCE |
| D358 | Crests from a fixed parts library; no user images at launch. DEFAULT. | 17 §3.15 | Clear, consistent interface across desktop and phone | IN FORCE |
| D359 | Share cards server-rendered with a verification code. DEFAULT. | 17 §3.21 | Clear, consistent interface across desktop and phone | IN FORCE |
| D360 | Presentation privacy changes are a tick intent `acct.presentation.set` (so public artifacts replay). DEFAULT. | 17 §4.1 | so public artifacts replay) | IN FORCE |
| D361 | Every NPC on a board/auction/league carries an "NPC"/"House" tag. DEFAULT. | 17 §6 | Clear, consistent interface across desktop and phone | IN FORCE |
| D362 | RSK-02: ROADMAP N1 (stress-test button) adopted as part of V3's risk analytics. | 17 §7.6 | Clear, consistent interface across desktop and phone | IN FORCE |
| D363 | RD-04: ROADMAP N3 (explain-this-candle) adopted for closed bars, inside the ladder. | 17 §7.8 | Clear, consistent interface across desktop and phone | IN FORCE |
| D364 | Quant Lab is a block notebook (no user code), server-evaluated under 11's budget. DEFAULT. | 17 §7.7 | Clear, consistent interface across desktop and phone | IN FORCE |
| D365 | Reserved-word list for handles; contract amounts in words ≥ $10k. DEFAULT. | 17 §9 | Clear, consistent interface across desktop and phone | IN FORCE |
| D366 | Old open question 06-cities §9 ("what makes the City app worth opening daily"): answered by the City brief (LC02) in CTY-03. | 17 §9 | Clear, consistent interface across desktop and phone | IN FORCE |
| D367 | Old open question 04 §9.6 (avatars): kept decided silhouettes. | 17 §9.6 | Clear, consistent interface across desktop and phone | IN FORCE |
| D368 | Character placed into a Penny league group at creation (needs 15). DEFAULT. | 18 §3.2.2 | New players reach the fun fast without hand-outs | IN FORCE |
| D369 | Background discount posted as FAUCET rebate `ONBOARD_BG_REBATE`; Retail grant restricted 72 real hours (ROADMAP C5 decision reused); grant once per account identity. DEFAULT. | 18 §3.2.3 | New players reach the fun fast without hand-outs | AMENDED by R23 |
| D370 | Step machine with triggers, targets and fallbacks (equity session closed → FX or crypto major; Major event; halt; no slot). DEFAULT. | 18 §3.3 | New players reach the fun fast without hand-outs | IN FORCE |
| D371 | Requested of 09: a new business's first operation runs at purchase tick + 1 (resolves conflict between 00's hourly stagger and 04's 60-second first dollar). DEFAULT (09 may override within 6 ticks). | 18 §3.3.6 | resolves conflict between 00's hourly stagger and 04's 60-second first dollar) | IN FORCE via R09 |
| D372 | Starter watch follows 14: Kessler Field, PP 1, `ACCT_STARTER_GIFT` $840, unsellable 7 real days; 18 only presents it. | 18 §3.3.7 | New players reach the fun fast without hand-outs | IN FORCE |
| D373 | The $250 Retail grant pays the LIC1 fee (`ACCT_ONBOARDING_GRANT` + `ACCT_LICENSE_FEE`, cash unchanged) via `acct.onboard.claimRetail`. | 18 §3.2.3 | New players reach the fun fast without hand-outs | IN FORCE |
| D374 | Rival follows 15 §3.5.5 (closest above, ≤ 3× NW, NPC row fallback). | 18 §3.4 | New players reach the fun fast without hand-outs | IN FORCE |
| D375 | Rival fallback to the closest NPC rival fund (resolves ROADMAP conflict C1 for the persistent world). | 18 §3.3.5 | resolves ROADMAP conflict C1 for the persistent world) | IN FORCE |
| D376 | Goal ladder G01–G20 with cosmetic rewards only. DEFAULT. | 18 §3.4 | New players reach the fun fast without hand-outs | IN FORCE |
| D377 | 60 JIT introductions covering every system; scheduler limits. DEFAULT. ROADMAP N10 (liquidation line) adopted as JIT J17. | 18 §3.8 | New players reach the fun fast without hand-outs | IN FORCE |
| D378 | 67 Academy courses across 16 tracks; practice worlds (replay of public tape / synthetic scenarios) in isolated ledger namespaces; drills list. DEFAULT. | 18 §3.10 | New players reach the fun fast without hand-outs | IN FORCE |
| D379 | Resolves ROADMAP Q4 (solo progress carry-over): there is no solo mode; practice worlds carry nothing except cosmetic badges. | 18 §3.10.3 | Resolves ROADMAP Q4 (solo progress carry-over): there is no solo mode | IN FORCE |
| D380 | Resolves ROADMAP Q8 indirectly: Held never applies inside practice worlds (they have no legal system for the live character). | 18 §3.10.3 | Resolves ROADMAP Q8 indirectly: Held never applies inside practice worlds (they have no legal system for the live character) | IN FORCE |
| D381 | Licence exams (14) are hosted as designated Academy quizzes: trade_5 → LIC2, deriv_1 → LIC3, corp_3 → LIC4; scored by 14 `acct.exam.submit`, retake after 1 game day. DEFAULT (Mathis may override). | 18 §3.10.5 | New players reach the fun fast without hand-outs | IN FORCE |
| D382 | Explainability ladder levels L0–L4 with prices (base + % of NW per game week), payment at the last trading day's close, reason codes `EXPLAIN_ANALYST_SALARY`, `EXPLAIN_DESK_UPKEEP`. DEFAULT. | 18 §3.12 | New players reach the fun fast without hand-outs | IN FORCE |
| D383 | Research Desk unlock R3 (= Mogul in 00's names; the ROADMAP's "R3 Derivatives+"). | 18 §3.12 | New players reach the fun fast without hand-outs | IN FORCE |
| D384 | Advisor notes (W08) from public events only, max 1 per real day, default on R0–R2. DEFAULT. | 18 §3.13 | New players reach the fun fast without hand-outs | IN FORCE |
| D385 | Resolves ROADMAP Q2 as a binding target (median R1 by end of real day 2; 60% within two sessions); 09 owns the payback number; 20 gates it. | 18 §3.16 | Resolves ROADMAP Q2 as a binding target (median R1 by end of real day 2 | IN FORCE |
| D386 | Late-joiner card with three facts from 16's history digest. DEFAULT. | 18 §3.14 | New players reach the fun fast without hand-outs | IN FORCE |
| D387 | Pipeline phase ownership by partition kind, P7–P14 (§3.3.2). DEFAULT. | 19 §3.3.2 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D388 | Phase wall budgets of 4,250 ms out of 5,000 ms (§3.3.3). DEFAULT. | 19 §3.3.3 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE via R27 |
| D389 | Overrun policy: wait, never skip; catch-up gap; clock re-base after 120 ticks (§3.3.4). DEFAULT. | 19 §3.3.4 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D390 | Load levers enter only as `sys.load_scale` inputs, so replay stays deterministic (§3.3.4). DEFAULT. | 19 §3.3.4 | so replay stays deterministic (§3 | IN FORCE |
| D391 | Seal margin is 150 ms, measured on the coordinator's receive clock (§3.4.1). DEFAULT. | 19 §3.4.1 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D392 | Canonical order is `SHA-256(entropy(N) ‖ intentId)` (§3.4.4). DEFAULT. | 19 §3.4.4 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D393 | Home rules: player-controlled institutions are homed with their owner; biz and prop are homed by city; hidden sessions with the victim; contracts with the lowest-id party as anchor (§3.5.1). DEFAULT. | 19 §3.5.1 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D394 | Inter-partition clearing accounts `sys:ipc:A:B`, with a zero-sum invariant (§3.5.3). DEFAULT. | 19 §3.5.3 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D395 | Rebalancing only at day-close snapshot boundaries (§3.5.5–3.5.6), keeping the old vision's rule. | 19 §3.5.5 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D396 | Partition-independent logical state hash as a modular sum of entity hashes (§3.6.6). DEFAULT. | 19 §3.6.6 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D397 | Inbound phase messages are recorded in a `PHASE` stream so one partition can recover alone (§3.7.4). DEFAULT. | 19 §3.7.4 | so one partition can recover alone (§3 | IN FORCE |
| D398 | Retention table (§3.7.6): batches kept forever in object storage; events moved to cold storage after 1 game year (old vision rule kept). DEFAULT for the remaining values. | 19 §3.7.6 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D399 | Channel catalog adopts 17 §2.6 unchanged and adds `status` (§3.8.2). | 19 §2.6 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D400 | Rate limits: 20 per actor (00 §5.5) plus a cap of 100 per principal across the character and its operators (§3.8.6). DEFAULT (Mathis may override). | 19 §5.5 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE via R07 |
| D401 | Intent signatures with per-session Ed25519 keys over RFC 8785 canonical JSON (§3.9.1). DEFAULT. | 19 §3.9.1 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D402 | MFA is required for API keys, staff, and top-100 board players (§3.9.3), from the old vision's "2FA for top players". | 19 §3.9.3 | Buildable, secure and scalable architecture with deterministic replay | AMENDED by R22 |
| D403 | Expert API is unlocked, not public from day one: FULL account, MFA, account age 7 real days, LIC2, no automation sanction. Resolves V3 Part 13 Q3 (§3.10.3). DEFAULT. | 19 §3.10.3 | Resolves V3 Part 13 Q3 (§3 | IN FORCE |
| D404 | Entropy epochs of one game day; commitment published two epochs ahead; reveal 1,000 ticks after the epoch ends; player-party rolls do not depend on the world seed, so players can verify them (§3.12). DEFAULT. | 19 §3.12 | so players can verify them (§3 | AMENDED by R28 |
| D405 | Hosting: one EU dedicated server for alpha; from beta, a container platform in one EU region (3 AZs) with a DR region; edge gateways optional. Resolves roadmap Q7 and vision/02-multiplayer §17 Q7 (§3.13.4). DEFAULT. | 19 §17 | Resolves roadmap Q7 and vision/02-multiplayer §17 Q7 (§3 | IN FORCE via R21, needs Mathis yes (Y12) |
| D406 | Deletion anonymizes the character and keeps its pseudonymous world history; unique assets go to the estate process (§3.14.4). DEFAULT. | 19 §3.14.4 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D407 | Sandbox is unranked and carries over only Academy completion and sandbox badges. Resolves roadmap Q4 (option A, tightened) and V3 Part 11's solo-sandbox point (§3.17.4). DEFAULT. | 19 §3.17.4 | Resolves roadmap Q4 (option A, tightened) and V3 Part 11's solo-sandbox point (§3 | IN FORCE |
| D408 | Roadmap Q5 resolved: shared challenges and the AI tournament run server-side with committed seeds (§3.17.4). | 19 §3.17.4 | resolved: shared challenges and the AI tournament run server-side with committed seeds (§3 | IN FORCE |
| D409 | Roadmap Q8: Held is off in sandbox mode (option B). Recorded in §3.17.4 as a DEFAULT; 13 owns the rule. | 19 §3.17.4 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D410 | Roadmap Q1 resolved: the server skeleton is built in S1, before markets; AI and espionage in S5; the sandbox is for learning only (§12.4). DEFAULT. | 19 §12.4 | resolved: the server skeleton is built in S1, before markets | IN FORCE |
| D411 | vision/02-multiplayer §17 Q8 ("Phase 0 first") is superseded by §12.4's order (the server early, the sandbox as a learning tool). | 19 §17 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D412 | Toolchain DEFAULTs (§3.1.4, kept from the partial file): Node 24 LTS, Next 16.4, PostgreSQL 18, NATS JetStream, Valkey 8, ClickHouse, Better Auth, uWebSockets.js. | 19 §3.1.4 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D413 | Build units, stages S0–S10 and gates G1–G4 (§12). DEFAULT. | 19 §12 | Buildable, secure and scalable architecture with deterministic replay | IN FORCE |
| D414 | partition-equivalence set {1, 4, 16} + one random 2–24 map nightly (§3.3.2–3.3.3) — caller default. | 20 §3.3.2 | Every rule is verified before release | IN FORCE |
| D415 | purchase code can never import the engine; hard CI failure, no waiver (INV-STR-002, §3.1.8) — caller default. | 20 §3.1.8 | Every rule is verified before release | IN FORCE |
| D416 | invariants are never sampled (Rule 3.2.6). | 20 | Every rule is verified before release | IN FORCE |
| D417 | failure ladder rollback → safe mode → bisection → quarantine → world halt (Rule 3.2.2). | 20 | Every rule is verified before release | IN FORCE |
| D418 | Gate numbering G0 PR, G1 unit, G2 integration (also toolchain upgrades), G3 adversarial/balance, G4 release (every deploy), G5 chapter boundary (§3.9) — aligned to 19 §12.4's G1–G4 usage; 19's "S4+ exploit" read as Finding severity HIGH+. | 20 §3.9 | so toolchain upgrades), G3 adversarial/balance, G4 release (every deploy), G5 chapter boundary (§3 | IN FORCE |
| D419 | Resolved B07: evidence categories E1–E6 never merged (Rule 3.4.1). | 20 | Resolved B07: evidence categories E1–E6 never merged (Rule 3 | IN FORCE |
| D420 | Resolved B11: GEV = generalized extreme value, tail calibration only, four TAIL bands (Rule 3.8.3). | 20 | Resolved B11: GEV = generalized extreme value, tail calibration only, four TAIL bands (Rule 3 | IN FORCE |
| D421 | Resolved V3 Q4: named crisis templates exist as harness scenarios and Academy practice worlds only; live crises only emergent (Rule 3.8.4). | 20 | Resolved V3 Q4: named crisis templates exist as harness scenarios and Academy practice worlds only | AMENDED by R03 |
| D422 | Resolved B10: model-driven NPC experiments only in controlled harness cells (Rule 3.8.5). | 20 | Resolved B10: model-driven NPC experiments only in controlled harness cells (Rule 3 | IN FORCE |
| D423 | Resolved R06: every band carries a class (ACCOUNTING/DOMINANCE/INTENDED_RISK/CALIBRATION/EXPERIENCE/PERFORMANCE) with its own response (Rule 3.7.1). | 20 | Resolved R06: every band carries a class (ACCOUNTING/DOMINANCE/INTENDED_RISK/CALIBRATION/EXPERIENCE/PERFORMANCE) with its own response (Rule 3 | IN FORCE |
| D424 | Resolved ROADMAP Q2 (as a check): BIZ.t1_payback band 15–30 game days (option C, ~20) and Hustler in 1–2 real days; 09 owns parameters (§3.7.6). | 20 §3.7.6 | Resolved ROADMAP Q2 (as a check): BIZ | SUPERSEDED by R18 |
| D425 | Resolved ROADMAP Q5: no ranked solo; weekly challenges and tournament server-only (§3.15) — caller default. | 20 §3.15 | Resolved ROADMAP Q5: no ranked solo | IN FORCE |
| D426 | Resolved ROADMAP Q4: sandbox progress never carries over (stricter than option A) (§3.15) — caller default. | 20 §3.15 | Resolved ROADMAP Q4: sandbox progress never carries over (stricter than option A) (§3 | IN FORCE |
| D427 | Resolved ROADMAP Q8: Held in sandbox on game time (§3.15) — caller default; contradicts 19 Rule 3.17.4 ("Held off"), flagged for 24. | 20 §3.15 | Resolved ROADMAP Q8: Held in sandbox on game time (§3 | SUPERSEDED by R01 |
| D428 | Resolved ROADMAP Q6 (as a hunt oracle): fund betrayal only via prosecutable market abuse, custody prevents theft (H13). | 20 | Resolved ROADMAP Q6 (as a hunt oracle): fund betrayal only via prosecutable market abuse, custody prevents theft (H13) | IN FORCE |
| D429 | ROADMAP "must-fix before online ranking" (alt-lifted peak) made hunt H08 and INV-PRG-001 crowd-exit valuation. | 20 | Every rule is verified before release | IN FORCE |
| D430 | many band values marked `DEFAULT` in §3.7 (inflation, recessions, bank failures, CCP layer use, yields, path parity, Gini, top-1% share, tail bands, playtest thresholds). | 20 §3.7 | Every rule is verified before release | IN FORCE |
| D431 | weekly Integrity Report on top of 19's daily signed bulletin (Rule 3.12.1). | 20 | Every rule is verified before release | IN FORCE |
| D432 | exploit disclosure programme with safe harbour and cosmetic-only rewards ("Auditor" title, "Integrity Seal" frame) (§3.16). | 20 §3.16 | Every rule is verified before release | IN FORCE |
| D433 | test agents never run in production (Rule 3.5.8); mirror worlds pseudonymized, 14-day retention (Rule 3.5.7). | 20 | Every rule is verified before release | IN FORCE |
| D434 | ad grant amount indexed by MSI ($250 real) — consistent with 14's real-dollar convention; at MSI 1.0 exactly L12's $250. | 20 | Every rule is verified before release | IN FORCE, needs Mathis yes (Y2) |
| D435 | rewarded-ad eligibility checked once at the start of the player's local day (resolves ROADMAP Q3, option B) via `sys.wallclock_mark` (Rule 3.14.2). | 21 | resolves ROADMAP Q3, option B) via `sys | IN FORCE |
| D436 | ad amounts indexed by MSI ($250 real, $1,000 real) like 14's thresholds; exactly L12 at MSI 1.0 (Rule 3.14.3). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y2) |
| D437 | rewarded ads only on native iOS/Android, never web/PWA/sandbox (Rule 3.14.1). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D438 | non-personalized ads only, no advertising identifier, no ATT prompt; blocked ad categories incl. trading/crypto/gambling (Rule 3.14.8). Ad network choice + tracking needs Mathis's explicit yes (24) (Rule 3.14.11, bible VI #10). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y1) |
| D439 | Held characters cannot receive ad grants (`AD_HELD`). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D440 | solo sandbox progress never carries over (Q4), no ranked solo, weekly challenges server-only (Q5), Held in sandbox on game time (Q8) (§3.21). Contradiction with 19 Rule 3.17.4 (Held off in sandbox) flagged for 24. | 21 §3.21 | Operable live service that stays within L5, L7 and L12 | SUPERSEDED by R01 |
| D441 | dedicated EU servers, primary + standby EU site (resolves ROADMAP Q7, old 02 Q7) (Rule 3.18.1). | 21 | resolves ROADMAP Q7, old 02 Q7) (Rule 3 | AMENDED by R21 |
| D442 | purchase code never imports the engine (Rule 3.13.3). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D443 | real-money store named "Atelier"; 14's in-game luxury shop keeps "Boutique"; 17 app 29 to be renamed (Rule 3.11.3) — naming collision found between 14 and 17. | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE via R05 |
| D444 | no premium currency, direct real-currency prices, tiers T1–T6 €0.99–€14.99, Pass €7.99 (Rules 3.11.1, 3.11.6). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y9) |
| D445 | no gifting or trading of cosmetics (Rule 3.11.5). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D446 | 16_17 spend cap €50/month; forced strong-language mask; DM limits (Rules 3.8.8, 3.11.7). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y9) |
| D447 | Chapter Pass 50 tiers × 100 marks, catch-up doubling, no tier skips, premium items return after 2 chapters (§3.12). | 21 §3.12 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D448 | web purchases via a merchant of record (Rule 3.13.1). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y11) |
| D449 | DSA-style statements of reasons and 6-monthly transparency summary (Rules 3.7.5, 3.8.7). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D450 | 16 h/day human moderation coverage at launch in en/fr (Rule 3.8.6); city/country chat open at launch per 15 §3.9.3 (old 02 Q5). | 21 §3.9.3 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y10) |
| D451 | compensation tiers C1–C3 with replay counterfactual for C2+; no world rollbacks ever (§3.6). | 21 §3.6 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D452 | enforcement ladder and sanctions table V01–V17 (Rule 3.7.1); shadow pools at confidence 0.5–0.8. | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D453 | patch classes HOTFIX/BALANCE/RULES/CONTENT/CLIENT with notice and timing (Rule 3.4.1); RULES only at chapter boundaries (consistent with 15 §3.3.2). | 21 §3.3.2 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D454 | live events only from templates flagged `liveOpsSchedulable`; staff never inject natural crises (Rule 3.5.1) — narrows 19's `adm.inject_event`. | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE |
| D455 | governing law of the operator's EU establishment; 10-year invoice retention (Rules 3.16.3, 3.10.2). | 21 | Operable live service that stays within L5, L7 and L12 | IN FORCE, needs Mathis yes (Y11) |
| D456 | Resolved old 02 Q4 / bible #5: 16+ age gate design (§3.9). Old 02 Q3 monetization: cosmetics + pass only (locked L7) specified in full. | 21 §3.9 | Resolved old 02 Q4 / bible #5: 16+ age gate design (§3 | IN FORCE |

---

## §4 Old open questions and their final answers

### §4.1 Roadmap questions Q1–Q8

| Q | Question | Final answer | Owner |
|---|---|---|---|
| Q1 | Build order (Phase 0 sandbox first or server first?) | Superseded by the module dependency graph and build stages S0–S10 (19 §12): foundations (02, 03, 20 invariants) and the server skeleton first; the sandbox is a learning tool, not a phase | 19 |
| Q2 | T1 business pace (A 6 GD, B ~100 GD, C ~20 GD) | **Option A**, chosen by 09 (owner): B1 payback about 6 game days net of all opex at reference crowding; ladder B1 6 / B2 12 / B3 24 / B4 48 / B5 96 / B6 200 GD. Checked by 20 BIZ.t1_payback 4–9 GD and BIZ.hustler_time 1–2 real days (R18; Y4) | 09, 20 |
| Q3 | When is "under $1,000" checked for ads? | **Option B**: at the start of the player's local day (sys.wallclock_mark, 21 Rule 3.14.2); up to 10 ads of $250 ($2,500/day) | 21 |
| Q4 | Solo progress carry-over | **Nothing carries over** except Academy completion flags and sandbox-only badges; real-money cosmetics are account entitlements (R19) | 19, 20, 21 |
| Q5 | Weekly seed challenge before servers | Solo stays unranked; weekly challenges and the AI tournament run only on the server with committed seeds (02 §3.11, 20 §3.15) | 15, 20 |
| Q6 | Fund-manager betrayal | **Option A**: custody makes theft impossible; abuse is market abuse prosecuted as S5, first-loss stake pays first (08 §3.1.12) | 08, 13 |
| Q7 | Hosting | One dedicated EU server at alpha after the cost benchmark; container platform in one EU region (3 AZs) plus DR region from open beta (19 Rule 3.13.4; R21; Y12) | 19, 21 |
| Q8 | Held in solo | **Option B: Held is off** in the sandbox and in practice worlds; fines, op bans and record only (13 §3.10; R01) | 13 |

### §4.2 Roadmap conflicts C1–C9

| C | Conflict | Final answer | Owner |
|---|---|---|---|
| C1 | Rival funds at $50k vs a close rival for a $5k player | Rival = closest player above within 3× NW; else the nearest NPC reference row / NPC rival fund (15 §3.5.5, 18 §3.3.5) | 15 |
| C2 | Rumor rates and accuracy | Superseded by 16's causal news and rumor model (16 §3.6, §3.11) with source track records; insider tips only from crime actions (12) | 16 |
| C3 | World-event rates 25× too high | Crisis tiers RIPPLE 1/7 GD, STORM 1/91 GD, MAJOR ≈ 35% of chapters (04 §3.16.1, 16 §3.7.1; R08) | 04 |
| C4 | T1 payback | See Q2 (R18) | 09 |
| C5 | Restricted cash window | 72 real hours = 51,840 ticks, covering ops, insider actions, margin, derivatives and P2P (03 §3.5.6, 14 §3.13.5) | 03, 14 |
| C6 | Priced-in on the Wire | Bands only; no exact priced-in number; k-anonymous attributions (05 §3.11, §3.12.4; 16 §3.6.6) | 05, 16 |
| C7 | Weekly challenge seed in source | Never ranked from fixed seeds; server seeds committed before lock (20 §3.15) | 20 |
| C8 | Ghost benchmark | Kept: luck-vs-skill report against buy-and-hold ghosts on the same seed (18 §3.12 ladder, 17 Portfolio journal) | 18 |
| C9 | Business names | Superseded by the full fictional catalog in 22 (L6) | 22 |

### §4.3 V3 Part 13 questions

| Q | Question | Final answer | Owner |
|---|---|---|---|
| V3-Q1 | Player banks and exchange concessions before Dynasty? | **Yes.** CH_FUND, CH_EXCHANGE_MEMBER at R3; CH_BANK, CH_INSURER, CH_CUSTODIAN at R4; bank scope UNIVERSAL at R5; exchange concessions at R5; SWF and sponsored CCPs at R6 (R13) | 14, 07, 08, 09 |
| V3-Q2 | Can a player bank fail permanently? | **Yes**: resolution (P&A, bail-in, liquidation), charter revoked, 1-chapter ban, limited liability, permanent record (07 §3.10.5) | 07 |
| V3-Q3 | Expert API public or gated? | **Gated**: LIC2 + 2FA + account age ≥ 7 real days (plus FULL account and no automation sanction), same 20 intents/tick (R02) | 19 |
| V3-Q4 | Named real-world-inspired crisis templates or emergent only? | **Live world: emergent only.** Named replayable scenarios exist only in challenge events, the Academy and practice worlds, and as harness scenarios (R03) | 04, 15, 18, 20 |
| V3-Q5 | Tax depth? | A full but bounded planning game: five bloc regimes, Isla Serena free zone, treaties, CFC, transfer pricing, exit tax, audits (03 §3.12) | 03 |

### §4.4 Old vision open-question lists

| Source | Q | Final answer | Owner |
|---|---|---|---|
| 01-markets §12 | Q1 fictional names | Locked L6 | 00 |
| 01-markets §12 | Q2 season model | Locked L1 (one persistent world, chapters as seasons) | 00, 15 |
| 01-markets §12 | Q3 real-time pace | Locked L9; tick = 2 game minutes, 720 ticks per game day | 00, 02 |
| 01-markets §12 | Q4 derivatives depth | Locked L10: options, futures, perps, swaps, CDS behind LIC3/LIC4 (06 §3.2) | 06 |
| 01-markets §12 | Q5 player tokens and IPOs | IPOs in (09 §3.10); player tokens specified, flag off until FINTECH ≥ 3, era ≥ 2, LiveOps flag, LIC4 + R4 (R34) | 06, 09, 16 |
| 01-markets §12 | Q6 prediction markets | Out (L10) | 00 |
| 01-markets §12 | Q7 vice businesses | Out (L10) | 00 |
| 01-markets §12 | Q8 server size | One global economy, invisible partitions (L1) | 19 |
| 02-multiplayer §17 | Q1 world model | Locked L1 | 00 |
| 02-multiplayer §17 | Q2 country change | Once per 180 days, resets the chapter country score; regional roll-up below 500 active players (15 §3.2.2) | 15 |
| 02-multiplayer §17 | Q3 monetization | Locked L7; Atelier store and Chapter Pass (21 §3.11–§3.12) | 21 |
| 02-multiplayer §17 | Q4 age rating | Locked L5 (16+), gate design 21 §3.9 | 21 |
| 02-multiplayer §17 | Q5 chat at launch | Country and city chat open at launch with moderation (15 §3.9.3, 21 Rule 3.8.6; Y10) | 15, 21 |
| 02-multiplayer §17 | Q6 guest play | Allowed for at most 30 real minutes or the first session; no P2P, contracts, ads, boards or API (14 §3.1.1, 18 §3.2.1) | 14 |
| 02-multiplayer §17 | Q7 hosting budget | See roadmap Q7 (Y12) | 19 |
| 02-multiplayer §17 | Q8 Phase 0 first | Superseded by 19 §12.4 build order | 19 |
| 03-conflict §19 | Q1 crime tone | Abstract corporate-thriller verbs (12 §3.9) | 12 |
| 03-conflict §19 | Q2 Held | Kept: freeze ≤ 24 real hours per verdict, online only (13 §3.10) | 13 |
| 03-conflict §19 | Q3 Most Wanted board | Opt-in, cosmetic, +15% detection on the public top 10 (13, 15) | 13, 15 |
| 03-conflict §19 | Q4 crime vs honest EV | Crime ≈ honest EV 0.8–1.2, riskier (20 bands) | 20 |
| 03-conflict §19 | Q5 physical espionage | Included (E5), physical-security-only defense (12) | 12 |
| 03-conflict §19 | Q6 case-selling | In, 30–50% share (13) | 13 |
| 05-ai §13 | Q1 time scale | Every AI timer runs on the game clock, also offline; 1 old research day = 8 GD (11 §3.5) | 11 |
| 05-ai §13 | Q2 compute pool | One shared world compute market (06 compute commodity, 11 §3.3 cloud spot/reserved, owned hardware) | 11, 06 |
| 05-ai §13 | Q3 rival visibility | Fog of war: capability private, only bands public (11 §3.16.3) | 11 |
| 05-ai §13 | Q4 weights vs API | Licensing only; weights move only through theft or trade-secret loss (11 §3.9.5) | 11 |
| 05-ai §13 | Q5 morality dimension | Trusted-lab badge, registration and Reputation effects (11 §3.16.4) | 11 |
| 05-ai §13 | Q6 PvE floor | 30 NPC labs, +2 per new city (11 §3.17) | 11 |
| 05-ai §13 | Q7 underdog catch-up | Query distillation open to licensees, retention 0.60–0.90, arch ceiling 1.25× tier top (11 §3.14) | 11 |
| 05-ai §13 | Q8 calibration | α 0.15, β 0.12, k 2.31, γ 0.02 (11 §3.6.1; Y3) | 11 |
| 06-cities §15 | Q1 rendering | three.js behind a CityRenderer interface, camera 30° (10 §3.26; 17/19 details) | 10, 17 |
| 06-cities §15 | Q2 street networks | Hybrid skeleton + historic agent growth + tensor-field extensions (10 §3.19) | 10 |
| 06-cities §15 | Q3 personalities | Each city has its own personality file (22) and signature landmarks (10 §3.2) | 10, 22 |
| 06-cities §15 | Q4 growth | Demand/supply pressure model, persisted topology (10 §3.4–§3.6) | 10 |
| 06-cities §15 | Q5 economy binding | Location economics supplied to 09 (`location_j`); cosmetics never affect economics (10 §3.15.3) | 10 |
| 06-cities §15 | Q6 status and flex | HQs never move with rank; crown parcels; Hall of Patrons 12 per city, opt-in (10 §3.20–§3.22) | 10 |
| 06-cities §15 | Q7 scale | Regions vs chunks, server-side topology, client drawing (10 §3.19; 19) | 10, 19 |
| 06-cities §15 | Q8 determinism and versioning | Persisted topology, IDs without generator version (10 §3.19) | 10 |
| 06-cities §15 | Q9 "looks like a real city" metrics | Generator acceptance tests of 10 §10 run by 20 | 10, 20 |
| 06-cities §15 | Q10 what's missing | Opt-in owner names, City brief (17 CTY-03), crown towers (10 §3.22, §3.24) | 10, 17 |
| 04-experience §16 | (no open items) | Nothing open | — |

### §4.5 Master bible items

| Item | Final answer | Owner |
|---|---|---|
| Resolved decisions A1, B1–B3, C1–C3 and rows 1–15 | Kept as decided (DU caps, laundering 0.7/0.35 with residue floor 0.03, AP/DP bands, compute unit 1 PFLOP-day = 10 GPUh, run sizes, heat = exposure only, Reputation never affects verdicts, license-only model market, breach floor 1%, hidden sessions, C3b loot cap, onboarding grant, regulator capacity owned by 13, Velour driver, 16+). Row 1 (engine location) is irrelevant under L14 (19 layout); row 2 (step budget) is replaced by R27 | 11, 12, 13, 14, 19 |
| Part VI #1–#10 (approved improvements) | All in: player IPOs (09), player funds (08), honeypots (11), weekly AI tournament (11), NPC rival funds (16), shared world events (04, 16), rumors and tips (16, 12), bankruptcy comeback (14 §3.13), trade journal (18), rewarded ads (21, L12) | various |
| R01 company variety | Segments, contracts, Tender Board, supplier dependencies (09 §3.2–§3.9) | 09 |
| R02 integration accounting | Look-through consolidation, control, related-party band ±10% (03 §3.11), transfer pricing (09 §3.7.4) | 03, 09 |
| R03 execution structure | One uniform-price batch auction per asset per tick; order types, priority and triggers in 05 §3.5–§3.6; weekends closed for session classes (05 §3.2.1) | 05 |
| R04 information disclosures | No whale auto-news anywhere; disclosure only by filings (15 §3.8), opt-in or espionage (L11; R31) | 15, 16 |
| R05 AI score and attention tax | Capability is information with crowding (11 §3.8); maintenance delegable under mandates | 11 |
| R06 balance gate classes | Every band carries a class ACCOUNTING / DOMINANCE / INTENDED_RISK / CALIBRATION / EXPERIENCE / PERFORMANCE (20 Rule 3.7.1) | 20 |
| R07 politics, secrets, jail | 16 §3.5 politics, §3.11 secrets (never from private state); Held per 13 §3.10 | 16, 13 |
| R08 scope and validation order | Full scope (L15); build order 19 §12; integrated scenarios as harness scenarios (20) | 19, 20 |
| B07 / B09 / B10 / B11 | Evidence categories never merged (20 Rule 3.4.1); prose never creates economic truth (20 AT 31); model-driven NPC experiments only in harness cells (20 Rule 3.8.5); GEV tail calibration only (20 Rule 3.8.3) | 20 |
| I05 / I06 / I07 | No unexplained manager profit multiplier (09 §3.6.3); consolidation and related parties (03 §3.11, 09 §3.7.4) | 09, 03 |
| C05–C08, W04, W08 | Tender Board and bargaining (09 §3.9); NPC founders may refuse (09 §3.13.5); advisor notes from public events only (18 §3.13) | 09, 18 |
| C09 / F05 | Knowledge firewall: NPC rules never read a player's rank, NW, boards or Prestige (16 §3.3.2) | 16 |
| A03 / A06 / A09 | Capability as information, lineage noise and crowding (11 §3.8) | 11 |
| LC02–LC15 (cities) | City brief (17 CTY-03), HQ rules (10 §3.20.1), market lights overlay, growth by pressure, location economics, Hall of Patrons, camera 30°, generator and chunk rules (10) | 10, 17 |
| T08 / T10 / R04-impact / N11 | One impact law with a shared daily tally (05 §3.4); circuit breakers (05 §3.9); block cross at the close (05 §3.20) | 05 |
| N1 / N3 / N10 (roadmap ideas) | Stress-test button (17 RSK-02); explain-this-candle (17 RD-04); liquidation line as JIT J17 (18) | 17, 18 |

---

## §5 Items that need Mathis's explicit yes before launch

Each item is specified and in force as a DEFAULT; the build proceeds with it, but launch waits for Mathis's yes or override.

| ID | Item | Current default | Where |
|---|---|---|---|
| Y1 | **Ad network choice and "no tracking"** | Non-personalized ads only, no advertising identifier, no ATT prompt, blocked categories (trading, crypto, gambling); rewarded ads only on native iOS/Android; the specific network is not chosen | 21 Rule 3.14.1, 3.14.8, 3.14.11 |
| Y2 | **Ad grant and the $1,000 line indexed by MSI** (L12 says $250 and $1,000) | $250 real × MSI per ad, eligibility under $1,000 real × MSI; exactly L12 at MSI = 1.0 (launch) | 21 Rule 3.14.3, 20 FAU.ad_grant_amount, 03 `ACCT_REWARDED_AD` |
| Y3 | **MCS scaling-law exponents changed** from the old agreed α 0.34, β 0.28 | α 0.15, β 0.12, k 2.31, γ 0.02 (so T5/T0 ≈ 300–500× and AP fits the RN B2 bands); 12 uses AP = round(effMCS × q), consistent | 11 §3.6.1, 12 §2 |
| Y4 | Roadmap Q2 answered as option A (bible pace) although the roadmap recommended C | B1 payback ≈ 6 GD; 20 checks Hustler in 1–2 real days | 09 §3.1.2, 20 §3.7.6 (R18) |
| Y5 | Rented-room rent lowered from the old agreed $60 per game day | Market rent ≈ $5.40 per game day | 10 §3.14 (R24) |
| Y6 | Dormant businesses: old "run on managers at 50% income" replaced | IDLE, no income, 50% attractiveness weight; properties keep 100% under a manager | 09 §3.4.4, 10 §3.27 (R16) |
| Y7 | Old "top 200 publish top 10 holdings quarterly" replaced | HOLDINGS_QUARTERLY for funds and LIC4 holders ≥ $1B real | 15 §3.8 (R20) |
| Y8 | Old Stabilizer levers "tax brackets" and "equity drift" removed | Four faucet/sink levers only (03 §3.7.4) | 03 §3.7 (R04) |
| Y9 | Real-money price points | No premium currency; items €0.99–€14.99 (T1–T6), Chapter Pass €7.99, €50/month spend cap for 16–17 year olds | 21 Rules 3.11.1, 3.11.6, 3.11.7 |
| Y10 | Moderation staffing at launch | 16 h/day human moderation in en/fr; city and country chat open | 21 Rule 3.8.6 |
| Y11 | Legal set-up | Governing law of the operator's EU establishment; merchant of record for web purchases; 10-year invoice and audit retention | 21 Rules 3.13.1, 3.16.3, 3.10.2 |
| Y12 | Hosting budget and provider | Dedicated EU server at alpha; EU container platform from beta (cost benchmark first) | 19 Rule 3.13.4, 21 Rule 3.18.1 (R21) |

---

## §6 Rulings on cross-file contradictions

Owner-module rule (00 §3.5) unless Mathis ruled directly (marked **Mathis**).

| ID | Topic | Contradiction | Ruling | Owner |
|---|---|---|---|---|
| R01 | Held in sandbox / practice worlds (roadmap Q8) | 13, 18, 19: Held off; 20 §3.15 and 21 §3.21: Held runs on sandbox game time | **Mathis:** Held is OFF in the sandbox and all practice worlds; verdicts there apply fines, op bans and record only | 13 §3.10 |
| R02 | Expert API gate (V3 Q3) | 01, 03, 19: LIC2 + 2FA + 7 days; 15: R2 + Reputation ≥ 30 + 7 days; 20/21 briefed LIC1 | **Mathis:** LIC2 + 2FA + account age ≥ 7 real days. 19's extra preconditions (FULL account, no automation sanction) stay. Rank and Reputation are not gates | 19 Rule 3.10.3 |
| R03 | Crisis templates (V3 Q4) | 09/15: emergent only, scenarios in challenges and Academy; 20/21 briefed "both" | **Mathis:** live-world crises are emergent only; named replayable scenarios exist only in challenge events, the Academy and practice worlds (plus 20's harness scenarios) | 04, 15, 18, 20 |
| R04 | Stabilizer defined twice | 03 §3.7 (PI controller, 4 faucet/sink levers, money-based MSI) vs 04 §3.17 (different gains, deadband, sample, MSI formula, levers incl. equity drift, top bracket, high-volume fee multiplier); 16 assumed a ±3-point tax offset | **Mathis:** defined once in 03 §3.7–§3.8; 04 §3.17 references it. 04's levers merged: `demandMult` = L1; `priceLevelAdj` scope (NPC services, new-business `c0`, property services) merged into L2; `highVolumeFeeMult` merged into L3 transaction levy (no separate multiplier, 05 updated). `equityDriftAdj` (a REVALUE effect) and `topBracket` (taxes are TRANSFERs, 03 §3.12) are not levers, because 00 §5.4 lets the Stabilizer act only on FAUCET and SINK flows; 16's tax offset removed. Controller values are 03's (`stab_kp` 0.5, `stab_ki` 0.02, `stab_deadband` 0.05, `stab_min_sample` 200, `stab_observe_game_days` 168) | 03 |
| R05 | Real-money store name | 14's in-game luxury shop and 17 app 29 both "Boutique" | **Mathis:** the real-money store is **Atelier** (17 app 29, AppId `atelier`, screens keep prefix BTQ); "Boutique" is only 14's in-game shop | 21 Rule 3.11.3 |
| R06 | Reason codes 07 needs | 07 used five codes absent from 03 | **Mathis:** 03 adds `CCP_LIQUIDATION_PENALTY` (TRANSFER), `CCP_INS_FUND_SWEEP` (SINK), `BNK_FX_MARGIN` (TRANSFER), `BNK_ENFORCEMENT_FEE` (TRANSFER), `CLR_DEBT_REPAY` (TRANSFER); catalog totals now 384 | 03 §3.4 |
| R07 | Intent rate limit | 00/02: 20 per character across all channels incl. operators; 19: 20 per actor + 100 per principal | **Mathis:** 20 intents per tick per character (UI + API), plus 20 per tick per operator (delegated manager or deployed AI under a Mandate), at most 100 per tick combined; 2,000 DU per tick for AI unchanged | 00 §5.5, 19 §3.8.6 |
| R08 | Crisis scheduling and Crisis Week | 04 and 16 both define crisis tiers; Crisis Week: 04 engine-drawn (p 0.6, storms ×2, MAJOR ×1.5) vs 16 LiveOps-only with a guaranteed MAJOR vs 21 staff "framing" days 21–35 | 04 owns crisis tiers, rates, constraints and Crisis Week: engine-drawn at chapter start with p 0.6 in real weeks 2–7, announced 48 real hours ahead, storms ×2 with one guaranteed storm, MAJOR rate ×1.5, no guaranteed MAJOR; staff write framing copy only. 16 §3.7 draws non-financial shock content within 04's limits. 16's "no MAJOR/STORM in a chapter's first 24 real hours" added to 04 | 04 §3.16 |
| R09 | First business operation | 18 needs first revenue within 60 s; 09 had only the hourly stagger | A new business runs once at `openedTick + 1` with quantities scaled by `k/30` (k = ticks to its first stagger slot), then on its slot only | 09 §3.4.1 |
| R10 | Fundamental value of player-listed companies; earnings timing | 06 used P/E for all equities; 09 defines `fundamentalValue` (SOTP) and earnings at t = 60 day 1 after quarter end | 06 §3.4.2 uses `09.fundamentalValue(cmpId) · sent` for player-listed companies (P/E for NPC issuers); 06 §3.4.3 owns the earnings schedule and consensus noise for every issuer, 09 supplies E[EPS] for player companies | 06, 09 |
| R11 | Business loan sizing | 09 assumed min(50% EV, 4× EBITDA); 07: term ≤ 3.0× EBITDA (DSCR ≥ 1.25), revolver ≤ 1.0× | 07's table applies (total ≤ 4× EBITDA); no EV cap; `PARAM.biz_ltv_cap` retired (23 to drop it) | 07 §3.4.3 |
| R12 | Defendant leverage and Fresh Start attribution | 13 put half leverage and fresh start in 05 | Half leverage applies to defendants in active S3+ cases, enforced by 07 §3.15.2 (05 passes the result); Fresh Start belongs to 14 §3.13 | 07, 14 |
| R13 | Charter and concession rank gates (V3 Q1) | 09: insurers R3, exchange concessions R5; 14: insurers R4, exchange concessions R6; 01: no rank gates | CH_FUND and CH_EXCHANGE_MEMBER R3; CH_BANK, CH_INSURER, CH_CUSTODIAN R4; bank scope UNIVERSAL R5; exchange concessions R5 (port terminal R4); SWF R6; sponsored CCP R6 | 14 §3.2.2, 09 §3.8 |
| R14 | Isla Serena access | 10: islands R6; 14: Isla Serena from R4 | Viewing R0; free-zone domicile and non-island assets R4; private islands R6 | 10 §3.2.4, 14 §3.2.6 |
| R15 | License unlocks | 14 listed CDS at LIC4; 06: CDS buy LIC3, sell LIC4 | 06 §3.2 is authoritative for what each license unlocks; 14's table now cites it | 06 §3.2 |
| R16 | Inactive, dormant, estate | 15: dormant businesses 50% income; 09: IDLE; 12 called 14 days "dormant" | INACTIVE 14 real days (untargetable, sessions freeze), DORMANT 30 (boards; businesses IDLE with 50% attractiveness weight, no income; properties 100% under a manager), ESTATE 90 (unique assets to estate auction, proceeds to owner) | 15 §3.13, 09 §3.4.4, 10 §3.27 |
| R17 | Fresh Start | 03: once per chapter, LIC3/LIC4 suspended 28 GD; 14: rolling 56 real days, licences kept | 14 owns: once per rolling 56 real days; $5,000 restricted top-up (72 real hours); Rep −10; leverage 1× for 7 real days; margin and NPC credit blocked 14 real days; 7-day clawback lookback; rank, titles and licences kept | 14 §3.13 |
| R18 | Roadmap Q2 business pace | 01/20: option C (~20 GD); 09: option A (6 GD) | 09 owns: option A; 20 band BIZ.t1_payback 4–9 GD; experience target Hustler in 1–2 real days (Y4) | 09 §3.1.2 |
| R19 | Roadmap Q4 carry-over | 01: titles and cosmetics; 19/20/21: Academy flags and sandbox badges only | Nothing carries over except Academy completion flags and sandbox-only badges; real-money cosmetics are account entitlements | 19 Rule 3.17.4 |
| R20 | Holdings filings | 08: funds ≥ $1B file top 10 with 7-day delay; 15: every fund + LIC4 ≥ $1B, up to 20 positions, 21-day delay | 15's HOLDINGS_QUARTERLY applies; `PARAM.fund_filing_aum` retired | 15 §3.8 |
| R21 | Hosting | 19: container platform from beta; 21: dedicated EU servers throughout | 19 owns infrastructure; 21 owns the EU-residency requirement | 19 Rule 3.13.4 |
| R22 | Mandatory 2FA | 14: top 1% NWI and alliance Chairs; 19: API keys, staff, top-100 board | Union: API keys, `API_ENABLED`, staff, top-100 of any global board, top 1% NWI, alliance Chairs; 14's block on P2P and contract signatures above $1M real until enabled | 14 §3.1.6, 19 Rule 3.9.3 |
| R23 | Reason-code names | Modules used names absent from or different from 03 (e.g. `AD_GRANT`, `START_CASH`, `ACCT_ONBOARDING_GRANT`, `ONBOARD_BG_REBATE`) | 03's names are canonical. `ACCT_REWARDED_AD` is the ad faucet code and `AD_GRANT` only the restricted-cash lot tag; onboarding uses `ACCT_START_CASH`, `ACCT_ONBOARD_GRANT`, `ACCT_BACKGROUND_DISCOUNT`. General rule: a code a module defines that 03 lacks is registered in 03's catalog with the class the module states, unless §8 maps it to an existing 03 code; class disputes follow 03's boundary rule (03 §3.5.2) | 03 §3.4 |
| R24 | Rented-room rent | 14/18: $60 per game day; 10: market rent ≈ $5.40 | 10 owns rent: market rent of the ROOM unit, ≈ $5.40 per game day at launch (Y5) | 10 §3.14 |
| R25 | Company founding gate | 09 had no gate; 17 Company app unlocks at R2 | `biz.corp.found` requires R2 (first tier needing a company is B3 at R2) | 09 §4.3 |
| R26 | Wall-clock marks | 21 needs `sys.wallclock_mark` every 15 real minutes; 19 did not list it | Added to 19 §4.3 system inputs | 19 §4.3 |
| R27 | Phase budgets | 02: per-phase budgets summing to 2,500 ms; 19: wall budgets summing to 4,250 ms (P3 200 vs 120) | 19's `PARAM.phase_budget_ms_P*` are the operational wall budgets; 02's column is the p99 compute design target (sum 2,500 ms, tested by 20 AT 30); neither aborts a tick | 19 Rule 3.3.3, 02 §3.5.1 |
| R28 | Entropy commit-reveal | 02: per-tick commit 720 ahead, reveal N + 1,000; 19: epoch secret, commit two epochs ahead | 02 owns the guarantees; 19's epoch scheme is the implementation (`e(N) = HMAC(S_e, tick‖N)`, `C_e` ≥ 720 ticks ahead, `S_e` revealed 1,000 ticks after the epoch ends); RNG uses 02's `TickEntropy` (mixes `intentsRoot` and `worldHash`) | 02 §3.11, 19 §3.12 |
| R29 | Parameter conflicts found by 23 | see 23 §5 | Home-city change fee $25,000 real (14); audit-log retention 10 real years (21); P3 budget 200 ms (19); FX UIP share 0.5 (04, replaces 06's 0.30); stale intents older than 3 ticks rejected `REJECT_STALE` under both tick policies (02); planned maintenance ≤ 30 real minutes per event, ≤ 1 per real week, in the quietest real hour (21); sovereign bonds use 04's 7-game-day grace (06's 3 days for all other bonds); 04 notes carry 03's Stabilizer numbers; every name-only alias of 23 §5.2 replaced by the owner's key in specs and notes | per 23 §5 |
| R30 | City count | 01 notes: 5 bloc capitals | 15 cities (3 per bloc) plus Isla Serena (00 §5.7); the five 06-cities designs are each bloc's first city | 00, 10 |
| R31 | Whale auto-news | Old 01 §6.3 | Removed everywhere (L11); verified no spec produces it; 01 X9 updated to HOLDINGS_QUARTERLY | 15, 16 |
| R32 | Release gates | 19 assumed 20 defines G1–G4 | 20 §3.9 defines G0–G5; 19's G1–G4 map to the same numbers | 20 §3.9 |
| R33 | Rank names, thresholds, AI tiers | checked | Consistent everywhere: R0 Broke, R1 Hustler $20k, R2 Owner $250k, R3 Mogul $5M, R4 Tycoon $100M, R5 Titan $2B, R6 Dynasty ($20B + top 50 at 24 consecutive closes + a House); evaluated at day close, never demoted. 14's AI-tier column is a soft band; 11 §3.2 thresholds govern (T1 $250k, T2 $1M, T3 $20M, T4 $200M, T5 $2B) | 14, 11 |
| R34 | Player tokens | 06: LIC4 + R4, flag off; 16: FINTECH ≥ 3, era ≥ 2, LiveOps flag | All conditions apply together | 06, 16 |
| R35 | Bank scopes | 07 COMMUNITY/COMMERCIAL R4, UNIVERSAL R5; 14 CH_BANK R4 | Consistent | 07, 14 |
| R36 | MCS exponents | 11 changed old numbers | In force; needs Mathis yes (Y3) | 11 |
| R37 | CB meetings, NPC economy size | checked | Quarterly per bloc, staggered (04 §3.6.1); NPC reference GDP $100T at 5,000 players (04 §3.2) | 04 |
| R38 | Start state | checked | Start cash $5,000 FDL (`ACCT_START_CASH`), LIC0 → LIC1 in onboarding paid by the $250 grant (`ACCT_ONBOARD_GRANT`), R0, 72 real hours protection; starter watch $840, unsellable 7 real days (00 §5.9, 14, 18) | 14, 18 |
| R39 | Catalog counts and names | 22 found count drifts vs 04, 09, 10, 14, 16, 19, 21 | 22 is authoritative for every count and name of catalog content: 600 actors (16's 532 + 68), 150 business types in 135 categories, 105 districts, 9 Isla Serena islands, 131 uniques, 15 asset groups, regional indices of 30 stocks, 136 Atelier items, bloc ids = currency codes (04's two-letter ids are aliases), 15's tournament division names (11's ids are aliases), dynasty Tachibana, one Stabilizer Board. Where another file states a different count, 22 wins | 22 |

---

## §7 Reconciliation log (corrections applied to spec files)

Each entry: file and section, what changed, ruling. 22 and 23 were not touched.

| # | File § | Change | Ruling |
|---|---|---|---|
| 1 | 00 §5.5 | Rate limit sentence: 20 per character + 20 per operator, ≤ 100 combined, PARAM keys | R07 |
| 2 | 01 §4.1 Q-V3-1 | Charter rank gates replace "not by rank" | R13 |
| 3 | 01 §4.1 Q-V3-4 | Scenarios also in Academy and practice worlds | R03 |
| 4 | 01 §4.2 Q2, Q3, Q4 | Q2 option A; ad wording "10 ads of $250"; Q4 Academy flags and badges only | R18, R19 |
| 5 | 01 §5.3 X9, X13; §6 | Holdings disclosure via HOLDINGS_QUARTERLY; payback 6 GD; maintenance in quietest hour | R20, R18, R29 |
| 6 | 02 §3.12 rule 5 | Rate limit per character and per operator | R07 |
| 7 | 02 §3.5.1 | Note: 19's wall budgets in force, column is compute target | R27 |
| 8 | 02 §3.11.1 | 19's epoch implementation of per-tick commit-reveal | R28 |
| 9 | 02 §3.20 (maintenance window) | 30 real minutes per event, 1 per week, quietest hour, key `liveops_maintenance_max_minutes` | R29 |
| 10 | 03 §3.4.2, §3.4.3, totals | Five 07 codes added; totals 86 SINK, 209 TRANSFER, 384 codes | R06 |
| 11 | 03 §3.4.1 `ACCT_REWARDED_AD` | $250 real × MSI, lot tag `AD_GRANT` | R23, Y2 |
| 12 | 03 §3.7.4 | L2 scope merged from 04; L3 is the only high-volume lever; single-definition paragraph | R04 |
| 13 | 03 §3.14.5, §9 exploits, AT | Fresh Start rolling 56 real days, no licence suspension | R17 |
| 14 | 04 §1 scope, ownership table | Stabilizer owned by 03; 04 keeps the weekly report | R04 |
| 15 | 04 §2.11 | StabilizerState holds a read-only mirror of 03's levers | R04 |
| 16 | 04 §3.5 step 7 | Lifestyle prices with 03 lever L2 | R04 |
| 17 | 04 §3.16.2 | Constraint 6: no scheduled MAJOR/STORM in a chapter's first 24 game days; 04 authoritative | R08 |
| 18 | 04 §3.17 | Replaced by a reference to 03 §3.7–§3.8 plus the weekly report §3.17.5 | R04 |
| 19 | 04 §8 edge 24, §9 exploit 12, AT 38–39 | Point to 03's Stabilizer and MSI | R04 |
| 20 | 05 §3.15.1 | Volume tiers no longer multiplied by 04's L4 | R04 |
| 21 | 05 §3.15.3 | Levy only through 03's L3 | R04 |
| 22 | 06 §3.4.2 | Player-listed companies use `09.fundamentalValue` | R10 |
| 23 | 06 §3.8.3 | Sovereign issuers use 04's 7-day grace | R29 |
| 24 | 06 §3.9.2, AT 18 | UIP share 0.5 (`macro_fx_uip_share`, 04) | R29 |
| 25 | 07 §5 | Requested codes now registered by 03 | R06 |
| 26 | 08 §2 / §3.5 (deductible) | Key renamed `insurance_deductible_pct` | R29 |
| 27 | 08 §3.1.16 | Holdings report per 15's HOLDINGS_QUARTERLY | R20 |
| 28 | 09 §3.4.1 | First operation at `openedTick + 1`, pro-rata | R09 |
| 29 | 09 §3.8.1 (two places) | Insurers R4; banks and insurers R4, concessions R5 | R13 |
| 30 | 09 §3.10.4 | 06 applies the SOTP value; NPC issuers keep 06's P/E | R10 |
| 31 | 09 §3.12.2 | Bank loans per 07's table; `biz_ltv_cap` retired | R11 |
| 32 | 09 §3.15.1 | Earnings release timing and consensus noise per 06 §3.4.3 | R10 |
| 33 | 09 §4.3 `biz.corp.found` | Rank ≥ R2 | R25 |
| 34 | 10 §3.2.4 | Isla Serena access tiers; home-city fee $25,000 real (`home_city_change_fee_real`) | R14, R29 |
| 35 | 10 §3.2.3, §3.4.1 (keys) | `new_city_na_step` (unchanged), `lf_share` replaces `participation_rate` | R29 |
| 36 | 12 §3.7.2 | "INACTIVE (14 days)" instead of "dormant" | R16 |
| 37 | 13 §3.6 | Defendant half leverage S3+, applied by 07 | R12 |
| 38 | 13 §3.12 | Fresh Start owned by 14 | R12 |
| 39 | 14 §3.1.6 | 2FA also for top-100 board; same MFA as 19 | R22 |
| 40 | 14 §3.2.2 | Exchange concession bids at R5, removed from R6 row; prose | R13 |
| 41 | 14 §3.2.6 | Serena R4 vs islands R6 | R14 |
| 42 | 14 §3.3.1 | CDS buy LIC3 / sell LIC4; 06 authoritative | R15 |
| 43 | 14 §3.6.1 | WLI is 03 lever L2, range 0.90–1.25 | R04 |
| 44 | 14 §3.7.1 | Rented room at market rent ≈ $5.40 | R24 |
| 45 | 14 §3.12.5 | `cross_bloc_settle_delay_ticks = 720` | R29 |
| 46 | 14 (codes) | `ACCT_ONBOARD_GRANT` | R23 |
| 47 | 15 §3.12.4, AT 50 | API gate LIC2 + 2FA + 7 real days | R02 |
| 48 | 15 §3.13 | Dormant businesses IDLE (09) | R16 |
| 49 | 15 §3.14.3 | Scenarios also in practice worlds | R03 |
| 50 | 15 (key) | `new_city_na_step` replaces `na_per_new_city` | R29 |
| 51 | 16 §3.1.2, AT 2 | `phase_budget_ms_P3 = 200` | R29 |
| 52 | 16 §3.5.9a, AT 26 | No Stabilizer tax offset | R04 |
| 53 | 16 §3.7.1, §3.7.3 | Keys `macro_ripple_rate`, `macro_storm_rate`, `macro_major_min_gap_days`; Crisis Week per 04 | R08, R29 |
| 54 | 17 §2 AppId, §3.2.4 app 29, §7.30 | Boutique → Atelier | R05 |
| 55 | 17 §3.10.5 | `push_cap_per_real_day` (15) and the +5 allowance of 15 §3.11 | R29 |
| 56 | 17 (keys) | `ui_js_budget_kb`, `ui_perf_tick_render_ms`, `support_tickets_per_day` names | R29 |
| 57 | 18 §3.2.1–§3.2.3, §6 | `guest_max_real_minutes`; `ACCT_START_CASH`, `ACCT_ONBOARD_GRANT`, `ACCT_BACKGROUND_DISCOUNT`; rented room rent | R23, R24, R29 |
| 58 | 19 Rule 3.4.2 | Stale intents: 3 ticks, `REJECT_STALE` | R29 |
| 59 | 19 Rule 3.7.6 | Audit retention `audit_retention_years = 10` | R29 |
| 60 | 19 Rule 3.9.3 | MFA union | R22 |
| 61 | 19 Rule 3.12.2 | Tick entropy is 02's `TickEntropy` | R28 |
| 62 | 19 §3.8.6, §3.12, §3.17.3, exploits (keys) | `du_hard_cap`, `du_partition_cap`, `entropy_reveal_lag_ticks`, `ui_*` keys, `tz_change_cooldown_days` | R29 |
| 63 | 19 §4.3 | `sys.wallclock_mark` added; ad-grant row cites MSI indexing | R26, Y2 |
| 64 | 20 §3.6 INV-LAW-001, §3.7 LAW.held_max, §3.15 rule 4, AT 36 | Held off in sandbox and practice worlds | R01 |
| 65 | 20 §3.7.6 BIZ.t1_payback | Band 4–9 GD (option A) | R18 |
| 66 | 20 Rule 3.8.4 | Scenarios also as challenge events | R03 |
| 67 | 20 INV-LED-011, FAU.ad_faucet_share | `ACCT_REWARDED_AD` | R23 |
| 68 | 21 §3.5 calendar | Crisis Week engine-drawn, real weeks 2–7 | R08 |
| 69 | 21 §3.14 (Money rule, Rule 3.14.4, 3.14.9, §5, AT 35) | `ACCT_REWARDED_AD` code, `AD_GRANT` lot tag | R23 |
| 70 | 21 Rule 3.18.1 | EU hosting per 19 | R21 |
| 71 | 21 §3.21 item 4, AT 40 | Held off in sandbox | R01 |
| 72 | 21 (keys) | `new_city_na_step`, `push_cap_per_real_day` | R29 |
| 73 | _notes 01, 02, 04, 06, 10, 16, 19 and alias rows in 08, 14, 15, 17, 18, 21 | Notes tables and decisions aligned with the rulings and canonical keys | R04, R29, R30 |

Open follow-ups for the 23 writer (23 was not edited): drop `biz_ltv_cap` and `fund_filing_aum`; `phase_budget_ms_P*` stays owned by 19 with 02's column as a design target; the §5.3 duplicate notes rows (`chat_retention_real_days` in 21, `macro_rr_*` in 07, `related_party_band` in 09, `ui_connections_refresh_ticks` in 19) are left for 23 to list once.

---

## §8 Reason-code aliases (module name → 03 canonical code)

A builder posts only the 03 code. Codes not listed here and not in 03 are registered in 03's catalog with the class the defining module states (R23).

| Module name | Module | 03 code |
|---|---|---|
| `AD_GRANT` (as a posting) | 21, 20 | `ACCT_REWARDED_AD` (`AD_GRANT` stays the restricted-lot tag) |
| `START_CASH` | 18 | `ACCT_START_CASH` |
| `ACCT_ONBOARDING_GRANT` | 14, 18 | `ACCT_ONBOARD_GRANT` |
| `ONBOARD_BG_REBATE` | 18 | `ACCT_BACKGROUND_DISCOUNT` (registered for 14, FAUCET) |
| `CMP_FOUNDING_FEE` | 09 | `CMP_INCORPORATION_FEE` |
| `BIZ_PURCHASE_NPC` | 09 | `BIZ_PURCHASE_NEW` |
| `BIZ_REVENUE_NPC` | 09 | `BIZ_SALES_HH` / `BIZ_SALES_FRM` / `BIZ_SALES_ROW` by customer sector |
| `BIZ_REVENUE` | 09 | `BIZ_SALES_B2B` |
| `BIZ_INPUT_NPC` / `BIZ_INPUT` | 09 | `BIZ_COGS_FRM` / `BIZ_COGS_B2B` |
| `BIZ_WAGES_NPC` | 09 | `BIZ_WAGES` |
| `BIZ_UPKEEP_NPC` | 09 | `BIZ_UPKEEP` |
| `BIZ_MARKETING_NPC` | 09 | `BIZ_MARKETING` (SINK); marketing paid to a player agency is registered as `BIZ_MARKETING_B2B` (TRANSFER) |
| `BIZ_UPGRADE_NPC` | 09 | `BIZ_UPGRADE_CAPEX` (`BIZ_UPGRADE_CAPEX_B2B` when a player builds it) |
| `BIZ_SALE_NPC` | 09 | `BIZ_SALE_TO_NPC_MARKET` |
| `ETF_CU_FEE` | 08 | `ETF_AP_FEE` |
| `INS_CLAIM` / `INS_CLAIM_NPC` | 08 | `INS_CLAIM_PAYOUT` (core insurer) / `INS_ELASTIC_CLAIM` (elastic) |
| `INS_PREMIUM_NPC` | 08 | `INS_PREMIUM` (named NPC insurers are core entities, 03 §3.5.2) |
| `INS_REINS_PREMIUM` / `INS_REINS_RECOVERY` | 08 | `INS_REINSURANCE_PREMIUM` / `INS_REINSURANCE_RECOVERY` |
| `CBK_PROFIT_REMIT` | 04 | `CBK_PROFIT_REMITTANCE` |
| `CBK_IOR_P` / `CBK_IOR_W` / `CBK_DEPOSIT_INTEREST(_P)` | 04 | registered as 04 §3.18 lists them (one class each, by counterparty suffix); they replace 03's single `CBK_INTEREST_ON_RESERVES` for those flows |
| `LIFE_BOUTIQUE_PURCHASE` | 14 | `LIFE_PURCHASE` |
| `LIFE_DONATION` | 14 | `LIFE_CHARITY` |
| `LIFE_NPC_BUYBACK` | 14 | `LIFE_RESALE_TO_NPC` |
