# 01 — Evaluation of Vision v3

Subject: `/mnt/project-files/vision-review/VISION-V3.md` ("The Most Advanced Financial Game", 2026-10-18), read against the original vision folder (`/vision`: 00-mathis-vision, 01–06, MASTER-BIBLE, RESOLVED-NUMBERS, ROADMAP) and against the locked decisions L1–L15 of 00 §2.
Purpose of this file: say plainly what V3 got right, list every gap that kept it from being buildable, record every inconsistency found in the old vision and how this specification resolves it, and point to the file (00 §1 list) that closes each item. This file is an evaluation, so it does not use the module template.

---

## §1 Verdict

**V3 is the right direction and the wrong level of detail.** It is the first document that takes Mathis's ambition at face value ("nothing is cut") and it correctly identifies where the original vision was thin: the institutional machinery of finance (banks and credit creation, the clearing house and its default waterfall, repo, securitization, funds plumbing, consolidated accounting, sovereigns). Its six tests (T1 institutional realism, T2 emergence from interlock, T3 expert ceiling, T4 legible floor, T5 verifiable honesty, T6 adversarial depth) are a good standard and this specification keeps them as its own bar.

But V3 is a **manifesto, not a specification**. Of its roughly 27 KB, the institutional layer (Part 3) takes about 8 KB for twelve major systems, i.e. a few sentences each, with no entity, no formula, no default number, no intent, no event, no screen and no test. It adds systems (banks, a CCP, securitization, CDS, ETFs with authorized participants, LBOs, activism, tax structuring, reinsurance, cat bonds, physical commodities, AMMs and stablecoins, lobbying, sovereign-scale endgame) whose interaction with the existing money model it never works out, and in one place it states two rules that contradict each other (§3, gap G6). It ends with five open questions instead of decisions.

Measured against Mathis's requirement ("every single bit of the game planned now, so a weaker model could build it without asking a question"), V3 scores close to zero on buildability for everything it adds, while keeping (by reference) the parts of the original vision that were already well specified (markets core, AI tree numbers, conflict math, lifestyle catalog, multiplayer topology).

Summary scores (this file's own judgement, 0–5):

| Criterion | V3 | Original vision (01–06) | This specification (target) |
|---|---|---|---|
| Ambition and scope (L15) | 5 | 4 | 5 |
| Coherence of the money model | 2 | 3 | 5 |
| Institutional realism (T1) | 3 (named) | 1 | 5 |
| Buildability (entities, formulas, defaults, intents, events, tests) | 0.5 | 2.5 | 5 |
| Determinism and engine contract (T5) | 2 | 3 | 5 |
| UI and onboarding for the added depth (T4) | 0.5 | 2.5 (for old scope) | 5 |
| Decisions closed | 1 | 3 | 5 |

V3's own Part 12 is honest that it is a design proposal and declines to self-score; this evaluation agrees with its listed risks (interlock complexity, calibration burden, comprehension, compute cost) and closes each one with a mechanism rather than a caution (§3, G21–G24).

---

## §2 Strengths (kept by this specification)

1. **The standard (Part 1).** T1–T6 make "most advanced" testable. This specification uses them as acceptance gates: T1/T2 in 03–10, T3 in 11/17, T4 in 17/18, T5 in 02/20, T6 in 12/13.
2. **One balance-sheet world (Part 2).** "Every actor has a balance sheet; money moves only by tagged entries; net worth is derived." This is the single most important architectural idea in V3 and it is the foundation of 03 (entities, chart of accounts, templates, invariants).
3. **Double-entry as the primitive, credit creation as a pair of entries (Part 2.2).** Correct and essential for honest banking; 03 §3.3.3 makes it the `LEND`/`REPAY` templates.
4. **Consolidation (Part 2.3, Bible I06/I07 made structural).** Correctly identifies that holding structures must not duplicate net worth; 03 §3.11 supplies the algorithm.
5. **One macro state with explicit transmission channels (Part 2.4).** Rates hitting bonds, mortgages, growth stocks, bank margins, cap rates, carry and leveraged funds on the same tick: 04 and 05 implement the channels.
6. **Determinism and event sourcing kept and extended (Part 2.5)**, now covering institutions: 02.
7. **The institutional layer list (Part 3)** is complete in breadth and well chosen: banking and runs (07), central banks and sovereigns (04), CCP with the four-layer default waterfall and procyclical margin (07), repo/securities lending/prime brokerage (07), securitization and CDS with an emergent 2008-style path (06/08), ETFs with creation/redemption (08), corporate finance including LBOs, venture terms, activism, restructuring (09), insurance and cat bonds (08), physical commodities with storage, shipping and basis (06), DeFi as a parallel system (06), lobbying with "rules you change apply to you" (16), a sovereign-scale endgame (07/14/16).
8. **The expert platform (Part 4)**: pro terminal, research lab on historical and withheld worlds, risk analytics, macro and credit desks, and the principle that alpha decays through crowding, not a timer (Bible A06). 11 and 17 keep all of it.
9. **The delegation spine** framed as access, not simplification (Part 4, last paragraph): 14/15 mandates.
10. **The living world in layers (Part 7)**: aggregate base economy, named actors, dynasties, causal news, history, secrets with provenance, optional language layer that cannot create economic truth (Bible B09). 16 keeps the layering; 03 §3.5.2 gives the aggregate layer its exact accounting.
11. **The Truth Machine (Part 8)**: invariants that halt a partition, an adversarial swarm with player-level permissions, population experiments, withheld seeds, separated evidence categories, GEV only for tail calibration (Bible B11 resolved), a public integrity report. 20 builds it; 02 and 03 provide the invariants and the replay it needs.
12. **Respect for every locked decision** (persistent world, fictional names, 1% floor, hidden sessions, Ink & Brass, late-gated derivatives/IPOs/takeovers, cosmetics-only, no prediction markets or vice, no auto-leak).
13. **The one structural recommendation of Part 11**: treat solo as a non-competitive sandbox because a seed in a local save is cheatable. Adopted (02 §3.21, 19, 18) and it closes roadmap risk R1 and questions Q4/Q5.
14. **Honest risk list (Part 12)**, stated without trimming scope.

---

## §3 Gaps: why V3 alone could not be built

Each row: the gap, why a builder is blocked by it, and where this specification closes it (00 §1 file list; section numbers are given for the files written alongside this one).

### §3.1 Missing specification layers

| # | Gap | Why it blocks a builder | Closed in |
|---|---|---|---|
| G1 | **No formulas or specs for the institutional layer.** Banking, central-bank tools, sovereign debt, CCP and waterfall, repo, securities lending, prime brokerage, securitization, CDS, ETFs, funds, insurance, reinsurance, cat bonds, LBOs, venture terms, activism, restructuring, physical commodities, DeFi are each described in one to three sentences | A builder cannot implement a bank without capital and liquidity ratios, a deposit-confidence model, a lending policy and loss mechanics; a CCP without margin models, member fund sizing and the waterfall order with numbers; a tranche without a default-correlation model and waterfall; a run without a feedback equation. Every one of these would be invented by the builder, inconsistently | 04 (central banks, sovereigns, ratings, FX regimes, crises), 06 (asset classes incl. CDS, DeFi, physical commodities), 07 (banking, credit creation, interbank, runs, repo, sec-lending, PB, CCP, waterfall, margin), 08 (funds, ETFs, securitization, rating agencies, insurance, reinsurance, cat bonds), 09 (LBOs, venture terms, activism, restructuring, M&A), 16 (politics, lobbying); the accounting of every flow: 03 §3.4 reason codes and §3.14 insolvency |
| G2 | **No data model.** No entity type, field, identifier scheme or table for any system, old or new | Without exact fields, two modules cannot exchange state; persistence, protocol, replay and court evidence cannot be designed | entity blocks in every module §2; ID scheme 00 §3.2 and 02 §3.13; tables and protocol in 19; ledger entities and accounts in 03 §2, §3.2 |
| G3 | **No UI specification.** V3 adds a pro terminal, research lab, risk analytics, macro and credit desks, systemic-risk dashboards, institutional identity, but names no screen, component, state or flow; the original screens (02-multiplayer §12.6, 04 §10) predate the institutional layer | The legible-floor test (T4) cannot be met or checked; a builder cannot lay out a bank-management screen or the CCP dashboard; progressive disclosure has no definition | every module §7 names its screens; 17 owns layouts, components, states, tokens, motion, sound, accessibility, localization; 18 owns the first session, just-in-time introductions, Academy and the explainability ladder |
| G4 | **No content catalogs.** No list of NPC banks, funds, insurers, rating agencies, CCP, exchanges, sovereign bond lines, ETFs, tranches, crisis templates, named actors, dynasties, news templates; the old vision has partial lists (blocs, a few cities, some companies, the lifestyle catalog) | The game cannot be populated; tests cannot reference concrete instruments; balance runs cannot be seeded | 22 (every named thing); 03 §3.2 (chart of accounts) and §3.4 (379 reason codes); 02 §3.2 (holiday calendar) and §3.10.4 (RNG stream registry) |
| G5 | **No parameter registry.** V3 introduces dozens of implicit tunables (capital ratios, haircuts, margin multipliers, run thresholds, correlation, rating cliffs, tax rates) with no defaults or ranges | A builder must guess every number; balance cannot be iterated without one place to tune; admin knobs (02-multiplayer §16 "still need the list of tunable knobs") stay undefined | 23 (every PARAM, default, range, unit, owner); every module introduces its PARAMs inline; 02 and 03 notes files list theirs |

### §3.2 Contradictions and undefined interactions inside V3

| # | Gap | Why it blocks a builder | Closed in |
|---|---|---|---|
| G6 | **Credit creation vs the Stabilizer's faucet accounting.** V3 Part 2.1 says "no money appears or disappears except through a tagged faucet or sink", while Part 2.2 and 3.1 add banks that create money by lending, a central bank with QE and standing facilities, and keeps the old Stabilizer (01 §8.2) that measures "faucets − sinks". It never says whether a bank loan is a faucet, whether QE is, whether a payment from an NPC household is a faucet or a transfer in a world where households have balance sheets, nor what the Stabilizer measures once money can be created endogenously | The money model is the most important balance system (01 §8). If loans count as faucets the Stabilizer fights the credit cycle; if they don't, the "tagged faucet" promise is broken; if NPC payments become transfers, there is no faucet left for business income and the old money model collapses. A builder cannot write a single posting without this decision | 03 §3.4 (six classes, each code in exactly one), §3.4.4–3.4.5 (commercial-bank credit changes M2, never M0; central-bank credit changes M0_cb, never outside money M0_sys), §3.5.2 (**elastic sectors**: payments from the aggregate economy are faucets, payments between named balance sheets are transfers), §3.5.3 (aggregates and identities), §3.7 (the Stabilizer acts only on FAUCET/SINK, reads a wealth-tracking error, never touches taxes, rates or prices) |
| G7 | **Intent API vs anti-bot rules.** V3 Part 4 promises "an official read/write API for intents under the same rate limits as the UI". 02-multiplayer §10.1 says automation outside the in-game AI is against the ToS (with a 10 intents/tick human cap), and Bible decision A1 caps AI by DU. V3 does not reconcile them, nor answer its own Q3 (public API from the start or gated) | A builder cannot design auth, gateways, rate limits, anti-cheat telemetry or ToS text; fairness (00 §5.5 "no actor gets a private API") is undefined for external programs | decision recorded here (§4 Q-V3-3) and implemented by 19 (API, keys, quotas) and 15 (anti-cheat): the official API is a first-class channel (`channel: 'API'`, 02 §2.4) gated at LIC2 Pro + 2FA + account age ≥ 7 real days; it shares the **same 20 intents/tick per character** budget as UI, AI and delegated operators combined (00 §5.5, 02 §3.12); it receives the same public data at the same tick; no server-side user code; scripting the UI outside the official API stays a ToS violation; API use never changes ordering (fair `orderKey`, 02 §3.12) |
| G8 | **Undefined named-actor roster.** V3 Part 7 says "a large roster (hundreds, growing with the world)" of banks, funds, dynasties, founders, regulators, suppliers and lenders, each with resources, goals, relationships and memory, but gives no count, no archetypes, no decision model, no balance-sheet link and no growth rule | NPC behaviour is the content engine of a persistent world; without it the living world is decorative and the institutional layer has no counterparties | 00 §5.7 fixes 600 named actors at launch; 22 lists archetypes and the generator; 16 specifies decision models, memory, relationships, dynasties, succession; 03 §6.4 requires actors to respect their balance sheets (V3 W04) |
| G9 | **Unresolved questions.** V3 ends with five open questions (Part 13) and inherits open questions from the roadmap (Q1–Q8), 01 §12, 02-multiplayer §17 and the cities documents | An open question is a fork in the build; a weaker model would either stall or choose arbitrarily | every question is decided in §4 of this file, with the owning module; 24 records them |
| G10 | **No acceptance tests** for any added system | Without checkable statements there is no definition of done, no build plan (00 §1 says the build plan derives from acceptance tests) and no Truth Machine gate | §10 of every module; 20 aggregates them into release gates |
| G11 | **Time model not restated for the institutional layer** (interest accrual, coupon dates, settlement cycles, margin calls, CB meeting cadence) and the old time model is internally inconsistent (§5.1 of this file) | Every accrual, maturity and cascade depends on it | 00 §5.1; 02 §3.1–3.4 (calendar, day count Act/364, boundaries, holidays, modified-following) |
| G12 | **Partitions for institutions** asserted ("institution-aware routing", Part 10) but not designed | A bank run or CCP default spans every partition; without ordering rules results depend on network timing | 02 §3.14 (partition kinds, holds, cross-partition legs, institution events emitted in tick N and applied in N+1) |
| G13 | **Tax structuring** (Part 3.7) without regimes, rates, residency, treaties or anti-avoidance | The "legal planning vs abusive evasion" game cannot exist without a rule set; the Revenue Office (03-conflict §10) has nothing to audit | 03 §3.12 (five bloc regimes + Isla Serena free zone, treaties, CFC, substance, transfer pricing, wash sales, exit tax, audits) |
| G14 | **Valuation of illiquid assets** (businesses, property, private equity, collectibles, AI models) undefined, though net worth, boards, collateral and fines all depend on it | Ranking and fines become exploitable through self-dealing marks | 03 §3.9 (mark governance, every asset type), §3.10 (board haircuts, control cap) |
| G15 | **Bankruptcy and restructuring** named but no claims ranking, waterfall, discharge, or comeback rule linkage | A "bankrupt company is a market" needs a claims register; the comeback (L13) needs accounting | 03 §3.14; 09 restructuring; 07 bank resolution |
| G16 | **Expert platform** without data rights, backtest semantics, withheld-world access rules, risk model definitions | Quants would get either leaked future randomness or useless tools | 11 (research pipeline, withheld worlds), 17 (terminal, risk analytics screens), 02 §3.21 (separate seeds for sandbox, harness and challenge worlds) |
| G17 | **Delegation spine** without mandate schema, operator types, exception reviews | Breadth without chores (Bible D02) cannot be implemented | 14/15 (mandates), 11 (AI operators), 08 (fund managers) |
| G18 | **Systemic-risk dashboards** promised, no indicators defined | Crises cannot be "readable in advance" | 07/08 (indicators), 03 §3.7.7 (Money Supply Report), 17 |
| G19 | **Crisis templates** (V3 Q4) and calibration not defined | Either scripted crises (contradicting T2) or none | §4 decision Q-V3-4; 04, 16, 20 |
| G20 | **Sovereign-scale endgame** (Part 3.12) listed, not designed: what a player can own, with what obligations | The top of the ladder has no content | 07 (player banks, clearing membership), 10 (concessions), 14 (Dynasty rank content), 16 (policy influence) |
| G21 | **Interlock complexity risk** stated without a mechanism | Cascades across modules can break conservation silently | 02 §3.15 (two-phase commit, safe mode), 03 §3.16 (22 invariants per tick), 20 (swarm) |
| G22 | **Calibration burden** stated without targets | No way to know when credit cycles "feel right" | 03 §3.6 (faucet/sink bands, ρ), 20 (balance bands), 23 |
| G23 | **Comprehension risk** stated without a design | The floor (T4) is the first casualty of depth | 18 (explainability ladder, just-in-time introductions), 17 |
| G24 | **Compute cost risk** stated without budgets | A richer world may not fit the 5 s tick | 02 §3.5.1 (phase budgets summing to 2,500 ms, deterministic load shedding), 19 (scaling), RESOLVED-NUMBERS A1 DU caps |
| G25 | **No operations, monetization detail, privacy or store compliance** for the expanded game | Cannot ship | 21 |
| G26 | **No module dependency order** beyond a seven-step list | A builder cannot sequence work safely | 19 §12 module graph; V3 Part 11 kept as the sequencing principle |

---

## §4 Unresolved questions: every one decided

All decisions below are `DEFAULT (Mathis may override)` unless they restate a locked decision. The owning file holds the full rule; 24 records the decision.

### §4.1 V3 Part 13

| Q | Question | Decision | Owner |
|---|---|---|---|
| Q-V3-1 | Player banks and exchange concessions before Dynasty rank? | **Yes, as mid-to-late-game goals.** Institution charters are gated by rank (14 §3.2.2: CH_FUND and CH_EXCHANGE_MEMBER at R3; CH_BANK, CH_INSURER and CH_CUSTODIAN at R4) plus licence, capital and clean record (13); exchange concessions are auctioned each chapter to qualified bidders from R5 (09 §3.8.3). Ruling in 24. Dynasty rank adds sovereign-scale options (underwriting government debt, sponsoring a clearing institution) | 07, 08, 10, 13, 14 |
| Q-V3-2 | Can a player bank fail permanently? | **Yes.** A failed bank goes through resolution (bail-in, sale or merger, liquidation); the bank entity can be dissolved; the owner character survives with whatever the waterfall leaves and a permanent public record | 07, 03 §3.14 |
| Q-V3-3 | Expert API public from the start or gated? | **Gated at LIC2 Pro + 2FA + account age ≥ 7 real days, same rate limit as the UI** (see G7) | 19, 15 |
| Q-V3-4 | Named real-world-inspired crisis templates or only emergent? | **Emergent in the main world** (crises arise from state: credit growth, leverage, correlation, funding, 04/07/08). **Named replayable scenarios exist only as challenge events** with ring-fenced portfolios (02-multiplayer §2.4; 15), in the Academy and practice worlds (18) and as regression seeds (20). The main world may receive authored *shocks* (a storm, an embargo, 16) but never a scripted outcome | 04, 15, 16, 20 |
| Q-V3-5 | Tax depth? | **A full but bounded planning game**: five bloc regimes, the Isla Serena free zone, treaties, CFC with a substance test, transfer pricing at arm's length, participation exemption, tax groups, wash sales, exit tax, audits | 03 §3.12 |

### §4.2 Roadmap Q1–Q8

| Q | Decision | Owner |
|---|---|---|
| Q1 build order | Superseded by the module dependency graph (19 §12): foundations (02, 03, 20 invariants) first, then markets and businesses, then the institutional layer bottom-up, expert platform, AI and adversarial layer, living world, scale (V3 Part 11). The solo sandbox runs the same engine but is non-competitive | 19 |
| Q2 T1 business pace | Option A (decided by 09, the owner; ruling in 24): B1 payback about 6 game days net of all opex at reference crowding (09 §3.1.2), checked so that a typical engaged player reaches Hustler ($20k) within 1–2 real days (20 BIZ.hustler_time) | 09, 14, 20 |
| Q3 ad eligibility | Option B: NW under $1,000 checked at the start of the player's local day (wall clock, 02 §3.1.3); up to 10 ads of $250 each ($2,500 per local day) | 21, 14 |
| Q4 solo progress carry-over | Option A tightened (ruling in 24): nothing carries over except Academy completion flags and sandbox-only badges (19 Rule 3.17.4, 20 §3.15, 21 §3.21); real-money cosmetics are account entitlements usable everywhere | 15, 19, 20, 21 |
| Q5 weekly seed challenge before servers | Solo stays unranked; ranked weekly challenges run only on the server with commit-reveal entropy (02 §3.11); no entropy-drip half-measure | 15, 02 |
| Q6 fund-manager betrayal | Option A: custody makes theft impossible; betrayal is market abuse prosecutable as S5 with the manager's first-loss stake paying first (`FND_FIRST_LOSS`, 03 §3.4.3) | 08, 13 |
| Q7 hosting | One region at alpha after a cost benchmark; partitioned deployment design is identical from day one (02 §3.5.3 rule 4) | 19 |
| Q8 Held in solo | Option B: off in the solo sandbox (fines, op bans and record only) | 13 |

### §4.3 01-markets-economy §12 and 02-multiplayer §17

| Q | Decision | Source |
|---|---|---|
| 01 Q1 fictional names | Locked L6 | 00 |
| 01 Q3 real-time pace | Locked L9, and the tick is now exactly 2 game minutes (§5.1) | 00, 02 |
| 01 Q4 derivatives depth; Q5 tokens and IPOs; Q6 prediction markets; Q7 vice | Locked L10 | 00 |
| 02 Q2 country change | Kept: one change per 180 days, resets the current chapter's country ladder score; regional roll-up below 500 active players | 15 |
| 02 Q3 monetization; Q4 age rating | Locked L7, L5 | 00 |
| 02 Q5 chat at launch | Country and city channels open at launch with slow mode, filters, reports and the moderation tooling of 21 (VISION-REVIEW also flagged the need for an early harassment story) | 15, 21 |
| 02 Q6 guest play | Allowed for the first session; guests cannot use P2P, contracts, ads, boards or the API, and their progress converts to an account on sign-up | 18, 15 |
| 02 Q7 hosting budget; Q8 Phase 0 first | See roadmap Q7 and Q1 | 19 |
| 06-cities §5 "future cities: new personalities or mixes?" | New personalities: each of the 10 additional launch cities and every growth city has its own personality file (22), generated with the same pipeline (10) | 10, 22 |

---

## §5 Inconsistencies found in the old vision, and their resolution

### §5.1 The time model (the most consequential one)

**Found.** 01-markets-economy §1 says a tick (5 s) is "~5 game-minutes during market hours" while also saying 1 real hour = 1 market day. 720 ticks per real hour × 5 game minutes = 60 game hours per "day", which is not a day. Several numbers downstream were derived from the 5-minute reading: "business economics once per game hour, i.e. every 12 ticks" (01 §13, 02-multiplayer §16), and equity hours "08:00–16:00 game time" (8 game hours would be only 96 five-minute ticks, i.e. 8 real minutes of trading per hour). The original 02-multiplayer pipeline budgets also assumed the hourly business stagger at 12 ticks.

**Resolution (00 §5.1, 02 §3.1).** One tick = **2 game minutes**, a game day = 720 ticks = 24 game hours = 1 real hour (L9). Consequences applied everywhere:
- Business operations run once per game hour = **every 30 ticks**, staggered by `hash(id) mod 30` (00 §5.1, 02 §3.4).
- The trading day has fixed phases in ticks: pre-market t 0–59, opening auction t 60, continuous t 61–539, closing auction t 540, after-hours t 541–719. With the cosmetic display offset of 02 §3.1.2 (DEFAULT +6 h), the opening auction reads **08:00 Exchange Time**, matching the old "08:00 open"; the continuous session is longer than the old "08:00–16:00" (16 game hours), which gives players 40 real minutes of continuous trading per hour instead of 8.
- Week = 7 game days = 7 real hours (consistent with the old "5 h + 2 h weekend"). Month 4-4-5 (28/28/35 game days). Quarter = 91 game days = 3.79 real days (the old "~3 days" is replaced). Game year = 364 game days ≈ 15.17 real days (old "~15 days", consistent). Chapter = 1,344 game days = 56 real days exactly (old "season of 8 weeks ≈ 3.7 game years", consistent).
- `dt = 1/262,080` game years per tick in every formula.
- Rules in the old documents written in "real hours" (protection 72 h, Held 6–12 h, scan cadences, hidden-session accrual, cooldowns) are converted to **ticks** at 720 ticks per real hour, so they pause with the world during a halt (02 §3.1.3). Account-level rules about the human (dormancy after 30 real days, daily ad cap) stay on the wall clock.
- Central-bank meeting cadence ("every ~6 real days", 01 §5.4) is re-set by 04 on the 91-game-day quarter.

### §5.2 Number of cities

**Found.** 01-markets-economy §3.8 and §14.1 and the MASTER-BIBLE (Pillar 1) specify **15 cities** (5 regions × 3) with 6–10 districts each and new cities opening as the population grows. 06-cities.md and 06-cities-proposal.md specify **five** procedural cities (Port Avalon, Nordhaven City, Meridia, Sundara Coast, Kaiyo City) plus **Isla Serena** as a fixed trophy vignette, reflecting a codebase (`universe.ts`) that defined six places with rank unlocks (R0, R2, R2, R3, R3, R4). 06-cities itself notes "the bible plans 15".

**Resolution (00 §5.7; 10, 22).** **15 cities (3 per bloc) plus Isla Serena** at launch. The five cities designed in 06-cities become the **first city of each bloc** (Port Avalon FDL, Meridia EUN, Kaiyo City PYN, Nordhaven City NKR, Sundara Coast SRL), keeping their personalities; 22 adds ten more cities with new personalities; 10 runs the generator for all of them and the growth rule (a new city per ~4,000 growth of `N_a`, 01 §14.1). Isla Serena stays a fixed archipelago of unique islands, FDL-denominated, with no bloc (00 §5.7), and gains a tax role as a free zone for companies (03 §3.12.2). City access is not rank-locked: the old rank unlocks become property-tier gates (trophy tier and Serena islands gated by rank, 10). Players start in one of the three FDL cities (00 §5.9). The codebase facts in 06-cities are ignored as code (L14) and kept only as design material.

### §5.3 Other inconsistencies

| # | Found | Where | Resolution | Closed in |
|---|---|---|---|---|
| X1 | Listed universe ~120 NPC stocks (Bible Pillar 1) vs 12 (codebase in 06-cities) vs MVP 30 | Bible, 06-cities, 01 §10.2 | 400 tradeable instruments at launch, 240 listed NPC companies plus private NPC firms per city | 00 §5.7, 22 |
| X2 | Human rate limit "10 intents/tick" | 02-multiplayer §10.1 | 20 intents per tick per character across all channels (00 wins) | 00 §5.5, 02 §3.12 |
| X3 | DU cap formula `base + 0.5·sqrt(PFLOP-days)` (A1) vs `base·(1 + 0.25·min(1, compute/run-midpoint))` (C3a); label drift "C3a" | Bible A1, RESOLVED-NUMBERS follow-ups, 02-multiplayer §4.1 | the relative formula (C3a follow-up) is authoritative; cap per partition 3.0M DU/tick, not per world | 11, 02 §3.5.1 |
| X4 | Money as "integer cents (or micro-units for crypto)" | 02-multiplayer §13 | micro-units for every currency (`Money` bigint) | 00 §3.1, 02 §3.9 |
| X5 | "NPC customers pay players" listed as a faucet, while a balance-sheet world would make it a transfer (V3) | 01 §8.1 vs V3 Part 2 | elastic sectors: payments from the aggregate economy are faucets; between named balance sheets, transfers | 03 §3.5.2 |
| X6 | Stabilizer levers include tax brackets and equity drift | 01 §8.2 | 00 §5.4 says the Stabilizer acts only on FAUCET/SINK flows: taxes (04 fiscal) and price drift (05) are removed as levers; four faucet/sink levers remain (demand, lifestyle/service prices, high-volume levy, upkeep) | 03 §3.7 |
| X7 | Stabilizer target "slight real growth per active player" vs a designed wealth curve rising from $5k to $300M in 56 days | 01 §8.2 vs §8.4 | the Stabilizer tracks the designed curve itself: error = log of the median ratio of engaged players' wealth to `W_target(age)` | 03 §3.7.2 |
| X8 | "Net Worth Index = NW ÷ money-supply index" without a definition of the index | 01 §8.3, §14.2 | MSI = smoothed player money relative to designed money for the current population's age profile; NWI = NWrank / MSI | 03 §3.8 |
| X9 | Whale trades of $100M+ auto-published ("Whale accumulates Corvo Motors") vs "nothing automatically leaks a player's holdings" | 01 §6.3 vs L11, Bible R04 | no identity-revealing auto-news; disclosure only by filings (≥ 5% stakes, HOLDINGS_QUARTERLY for funds and LIC4 holders ≥ $1B per 15 §3.8, insider trades on own IPO), opt-in, or espionage; anonymous aggregate tape data stays public | 15, 16 |
| X10 | Fresh start "once per 8 weeks" vs "once per season" | 01 §8.3 vs 03-conflict §13.5 | once per chapter (= 8 real weeks) | 03 §3.14.5 |
| X11 | Restricted cash window: 21 days vs 72 real hours | roadmap conflict C5 (decided 2026-10-09) | 72 real hours = 51,840 ticks, covering ops, insider actions, margin and P2P | 03 §3.5.6 |
| X12 | World-event rates 25× higher than the bible's "rare" intent | roadmap conflict C3 | 16/04 set crash + bubble ≈ 0.05% per game day combined; storms ≈ one per game quarter | 04, 16 |
| X13 | T1 business payback 6 vs 90–105 game days | roadmap C4/Q2 | B1 payback ~6 game days net of opex (Q2 option A, chosen by 09, the owner; ruling in 24), checked by Hustler in 1–2 real days | 09, 20 |
| X14 | Stale "season worlds", "per world 4k CCU" preambles | 03, 04 preambles; RESOLVED-NUMBERS hygiene log | one persistent world; "season" means chapter | 00 L1, 15 |
| X15 | Per-partition RNG seeds `hash(world_seed, partition_id, tick)` vs per-asset streams "so adding an asset doesn't change others" | 02-multiplayer §3.2 vs 01 §2.1 | streams are keyed by module, purpose and subject, never by partition, because partition assignment changes with rebalancing and must not change any result | 02 §3.10 |
| X16 | Commit-reveal "hash published at tick N, value revealed at N+1000" without saying the commitment precedes intake | 02-multiplayer §3.3 | commitment published 720 ticks ahead, reveal at +1,000, tick entropy also mixes the sealed intent root | 02 §3.11 |
| X17 | `step()` budget 1,000 ms (pipeline) vs 150–300 ms estimate vs separate 600 ms AI phase | 01 §13, 02-multiplayer §3.2, Bible row 2 | 15-phase budgets summing to 2,500 ms with 2,500 ms slack; the AI phase is P5 inside the pipeline | 02 §3.5.1 |
| X18 | The 01 engine API `step(state, orders, actions)` returns fills, news, metrics but has no entropy input and no posting output | 01 §10.1 | `stepPartition`/`stepWorld` contract with sealed header, entropy, intents, inbox; outputs state, postings, events, consequences, deltas, hash | 02 §3.6 |
| X19 | "Game central bank" (01 §8.2) vs five bloc central banks (01 §5.4, V3) | 01, V3 | two different institutions: the **Stabilizer Board** (game money supply, faucets and sinks, 03) and the five **central banks** (monetary policy, 04); they never share a lever | 03 §3.7, 04 |
| X20 | Consolidated accounting and related-party rules marked "needs a reviewed rule" | Bible I06, I07, R02 | look-through NAV, control rules, elimination, NCI, related-party band ±10% with minority claims | 03 §3.11 |
| X21 | Isla Serena "a vignette, not a city" vs "trophy archipelago with no bloc" | 06-cities §5.6 vs 00 §5.7 | both: fixed islands, no growth, its own scene, FDL, free-zone tax status | 10, 03 §3.12.2 |
| X22 | Owner-occupied home counted at "appraised value" vs "fair value" | 01 §13 vs 04 §5 | same appraisal model as rented property | 03 §3.9.2, 10 |
| X23 | Engine location `src/engine` vs `packages/engine` | Bible row 1 | irrelevant under L14 (rebuild); package layout in 19 | 19 |

---

## §6 What this specification adds beyond V3

Beyond closing the gaps of §3, the specification contributes mechanisms that neither V3 nor the original vision had. Those in the three files written with this one:

**Engine core (02)**
- An exact calendar: Act/364 day count, 4-4-5 months, a holiday calendar of 4 closed weekdays per bloc per game year that never touches quarter boundaries, modified-following date rolling, a session table per product family, and a complete list of what happens at each boundary with deterministic hook ordering.
- A 15-phase pipeline executed across six partition kinds in rounds separated by three barriers, with millisecond budgets, deterministic load shedding (never time-based) and the rule "consequences land next tick" with a complete consequence list.
- A formal pure `step` contract and a coding standard (forbidden constructs, float rules, NaN as an invariant failure, sorted iteration, canonical encoding).
- `dmath`, a deterministic transcendental-math library built only from IEEE-exact operations, so results are bit-identical across CPUs and Node versions.
- `toMoney` and exact bigint helpers (`accrue`, `mulRate`, `fxConvert`, `allocate` with largest remainder) so splits always add up.
- A registry of every RNG stream in the game (≈ 80 keys across 16 modules), PUBLIC vs SECRET roots, epoch rotation per chapter, lazy per-tick entropy mixing, and fixed-draw-count variate generators (no rejection sampling).
- Commit-reveal entropy with a one-game-day commitment lead, tick entropy that mixes the sealed intent root, Merkle inclusion receipts for players, and a public verifier page.
- Fair intra-tick ordering by an unpredictable `orderKey`.
- Two-phase commit across partitions, free rollback of the current tick, deterministic **safe mode** that isolates the failing intent, entity or subsystem and records the quarantine in the hashed header so replay reproduces it.
- Catch-up and re-anchoring rules for lag, clock-drift handling, halts that stop world time (so no one loses protection, Held time or income to an outage), and maintenance windows placed in the quietest real hour (21 Rule 3.3.3).

**Ledger and accounting (03)**
- A complete chart of accounts (≈ 140 codes) and per-kind balance-sheet templates for all 21 entity kinds.
- Posting templates that enforce class membership mechanically, a payment rail across settlement cash, bank deposits and central-bank reserves, cross-partition legs, and multi-currency books balanced through currency trading accounts.
- A catalog of **379 reason codes** across every module, each in exactly one class with its cash-flow category.
- The **elastic-sector** accounting of the aggregate economy, which reconciles a full balance-sheet world with a controllable game money supply.
- Money aggregates M0, M0_sys, M0_cb, M2, PEM, PEW with identities checked every tick.
- A Stabilizer that targets the designed wealth curve directly, with deadband, anti-windup, four bounded levers and public daily reporting; an explicit MSI; NWI defined from them.
- Mark governance (no player-declared or related-party marks, thin-print guard), marks for every asset type, board-NW concentration haircuts and a control cap against pump-to-rank.
- The look-through NAV algorithm that makes holding structures unable to duplicate wealth, with a cycle limit, consolidation, NCI and intercompany elimination.
- A full tax system for five blocs and the Isla Serena free zone, and audits whose findings are computed from reason codes.
- Restricted cash for ad and fresh-start money, statements for every entity, an absolute-priority insolvency waterfall, claims trading, persistent claims and garnishment linked to the comeback rule.
- 22 invariants asserted every tick, incremental so they fit the P13 budget.

**Across the specification** (other files, 00 §1): the module template applied everywhere, numbered acceptance tests that become the build plan, a single parameter registry (23), a decisions register (24) separating Mathis's locked calls from defaults, content catalogs (22), screens and design system (17), onboarding minute by minute (18), technical architecture and data model (19), the Truth Machine's harness and release gates (20), and live operations, monetization and compliance (21).

With these, every item V3 named is specified to the level where a builder can implement it from the text and check it against tests, and every open question is decided.
