# MASTER DESIGN BIBLE — *(working title)* "TYCOON"
### Multiplayer finance / investing / trading / AI-research tycoon game
Compiled by Ledger (team head), 2026-10-07 · web-first (Next.js), mobile later
Source sections (full detail lives here, this file consolidates and resolves):
`00-mathis-vision.md` · `01-markets-economy.md` (Quant) · `02-multiplayer-systems.md` (Forge) · `03-conflict-legal-fairness.md` (Tape) · `04-experience-lifestyle.md` (Velvet) · `05-ai-research.md` (Ledger)
Companion: `RESOLVED-NUMBERS.md` (the hard numbers teammates must sync).

> **2026-10-10 discussion update:** [Part VII — Annotated ideas and tweaks](#part-vii--annotated-ideas-and-tweaks-mathis--codex-2026-10-10) records the new directions, examples and review questions from Mathis's conversation with Codex. Every idea has a small NEW/TWEAK annotation and a stable review ID.

---

# PART I — EXECUTIVE SUMMARY (one page)

**The pitch.** Start with $5,000 and a cracked phone. Build a fortune across every arena of modern money — businesses, stocks, crypto, commodities, real estate — then develop your own AI to trade, spy, defend and dominate. Buy the mansion, the watches, the island. Climb a live global leaderboard against thousands of real players. Get rich enough to be feared, and visible enough to be hunted. *End with your name on a tower, a model everyone fears, and a seat at the top of the world.*

**The core loop (every player, every day):**
1. **Earn** — businesses throw off cash; trades and AI signals compound it.
2. **Invest** — roll cash into bigger businesses, markets, real estate, compute and data.
3. **Build an edge** — train AI that narrows uncertainty, automates trading, attacks or defends.
4. **Compete & conflict** — climb boards, raid rivals' models, sue, defend, form alliances.
5. **Flex** — convert wealth into Prestige (homes, cars, art), which is status *and* a target.
6. **Catch up on return** — "While You Were Away" shows what earned, filled, and attacked you.
Every arrow in that loop both *makes* and *spends* money, and the whole economy is kept honest by a deterministic engine and an auto-stabilizer so a season-8 dollar is worth a season-1 dollar.

**The five pillars:**
1. **Markets & Businesses** (Quant, `01`) — one deterministic world engine prices stocks, crypto, FX, bonds, commodities, derivatives and real estate off a shared macro state; ~150 businesses across 13 sectors are the steady tycoon engine. Prices are *explainable*, which is what makes information and AI valuable.
2. **AI Research** (Ledger, `05`) — a deep tech tree: compute + data + algorithm → a Model Capability Score that powers trading AIs, analyst signals, cyber attack/defense, and licensing. Scaling laws are the master dial; training is a timed, uncertain investment.
3. **Conflict & Law** (Tape, `03`) — cyber ops, espionage, distillation, detection, courts, regulators, insurance, and *fourteen* non-hacking ways to topple a whale. Crime is a business with an expected value, never a free mugging.
4. **Lifestyle & Status** (Velvet, `04`) — the fantasy layer: homes, cars, watches, yachts, jets, art, and a UI shell that upgrades from cracked phone to island control room. Prestige is earned, visible, and risky.
5. **Multiplayer** (Forge, `02`) — **one persistent world** (global, country and seasonal-ladder leaderboards), partitioned invisibly behind the scenes, on a 5-second batch-auction tick; leagues, alliances, typed-clause contracts with escrow, public filings, anti-cheat, and one codebase for web + mobile.

**What makes it addictive.** Many ladders so everyone can win *something* (11 boards + leagues). A visible rival by minute 4. Compounding growth with a "one more run / one more trade" pull. Asynchronous drama that happens while you sleep (a hack, a lawsuit, a crash, an alliance betrayal) and greets you on return. Social recognition anchored by country boards and city-sized frontiers so you're a known name in your corner of one big world. **Seasonal ladders** (richest this season, fastest climber) and ever-opening new cities that keep the race winnable for late joiners even though the world never resets. And the core power fantasy: *turn money into an AI, turn the AI into power, turn power into a name.*

---

# PART II — CONSOLIDATED DESIGN

## Pillar 1 — Markets & Businesses  (full: `01`)
- **One world, one engine.** Every asset shares one macro state (rates, inflation, growth, risk appetite). Price = fundamental pull + factor returns + fat-tailed noise + jumps + order-flow impact. Deterministic & seeded: `step(state, orders, actions)` is a pure function, enabling replays, balance runs and anti-cheat (`01 §2, §10`).
- **Assets:** ~120 NPC stocks across 12 sectors & 5 regions + player IPOs; ~15 crypto tokens; commodities incl. the game-native **Compute, Data, Energy**; forex (5 fictional blocs); bonds & yield curves; derivatives (options/futures/perps to 10–20×); real estate (15 cities, districts, mortgages, development); private/startup markets; collectibles. Unlocked by **license tier** (Cash → Retail → Pro → Derivatives → Institutional).
- **Businesses** (~150 across 13 sectors, tiers T1 Hustle → T6 Megaproject, ×8–10 cost/tier): logit market-share model means players genuinely compete for city-sector demand; six upgrade axes; synergies, vertical integration, data generation. Starting cash **$5,000**.
- **Players move markets** via per-tick **batch auctions** (no latency race; mobile = desktop) and **square-root price impact** (small players invisible, whales leave footprints). Corporate control at 5/20/50% ownership; hostile takeovers.
- **Macro & crises:** 4-state business cycle, Taylor-rule central banks, telegraphed multi-asset crashes (~35%/season chance of a major one). Crash days churn the leaderboard.
- **Anti-inflation (the make-or-break system):** measured faucets/sinks, a public diegetic **Stabilizer** (PI controller), logit diminishing returns, offline caps, finite NPC world, and a **Net Worth Index** (net worth ÷ money-supply index) as the ranking metric so inflation can't pump rank.
- **Wealth curve target** (median engaged player): day 1 ~$15k → day 7 ~$500k → day 21 ~$20M → season end ~$300M; top 0.01% to $100B+. Growth decelerates from ~60%/day to ~5%/day.

## Pillar 2 — AI Research  (full: `05`)
- **Three inputs → one Model Capability Score (MCS):** `MCS = A × k × C^α × D^β` (α≈0.34, β≈0.28), with a compute-optimal data ratio and a balanced-run bonus. Capability is continuous; product unlocks fire at thresholds (MCS 50 market-making, 120 latency-arb, 300 frontier).
  - **Compute (C):** PFLOP-days — cloud spot ($1.2/PFLOP-day, floats with the GPU market), reserved, or owned GPUs (tiers T1–T5) in data centers with real energy OpEx. **Chip shortages** are market events. *(Unit bridge to Quant's GPU-hour commodity is resolved below, Decision C1.)*
  - **Data (D):** DQU = volume × quality × freshness (decays); sourced from brokers / scrape / partnerships / synthetic / stolen, each with a legal-risk tag. **Model collapse** caps synthetic over-reliance.
  - **Algorithm (A):** the architecture tree (handcrafted → classic ML → transformers → MoE/RL → frontier scaling → secret sauce), each a timed research node granting a permanent efficiency multiplier.
- **Training runs** are the atomic action: timed (`days = budget / throughput`), with explicit **failure odds** (careful vs quick-and-dirty, checkpoint insurance). **Researchers** are hireable/poachable staff who cut failure odds and raise A.
- **Product lines:** trading AI (momentum, stat-arb, market-making, sentiment, HFT — all subject to alpha decay & crowding), analyst **signal** AI (the low-risk bridge for manual players), **cyber-attack** & **cyber-defense** AI (scores handed to Tape), and **licensing/AI-as-a-service** revenue.
- **Distillation (hidden sessions, Mathis's call):** a successful quiet hack plants a **hidden session** on the victim's model — no alarm, just an extra entry in its connections list — and the copy builds up over time (ceiling 0.85, never 100%) until the victim notices and disconnects it; higher-tier defense AI auto-scans more often and copying slows while the victim is offline. Query distillation via a real license stays the quiet underdog route. Student capped below teacher (retention < 1), carries traceable **watermark residue** that grows with how much was copied. Theft is a dent/catch-up, never a win button.
- **AI risks:** model drift, rogue-trading blow-ups, regulator crackdowns, safety incidents, model collapse.
- **Progression:** 6 tiers, laptop script → garage → startup → scale-up → frontier lab → hegemon, mapped to Velvet's ranks.
- **Server execution** (Forge): AIs are **strategy graphs of blocks**, not user code; same order API as humans; a per-tick **decision-unit (DU)** budget scaled by in-game compute. *(DU budget per tier is resolved below, Decision A1.)*
- **Balance:** money gates + OpEx, per-$ capability ceiling, alpha decay, theft ceiling, dual leaderboards, attention tax → AI is powerful but never makes manual play pointless.

## Pillar 3 — Conflict & Law  (full: `03`)
- **Crime is a business with an EV.** Target ratio: a competent criminal earns 0.8–1.2× a competent honest player, at 2–4× the variance, plus a lasting Notoriety/Reputation cost.
- **Attack surface** grows with wealth (`S = Σ value^0.5 · exposure`), but **coverage** (budget units ÷ surface units, capped 1.3) is the scarce resource — a whale can harden any one unit, never all at once.
- **Cyber-op catalog** (12 ops: recon, phish, ransomware, exfiltration, weight theft, query distillation, botnet hijack, order theft, AI sabotage, mole, supply-chain, disinformation) + **espionage** (bribe, mole, poach, walkout, physical intrusion, alliance leak, informant, due diligence).
- **Resolution math:** `p_breach = floor(1%) + (90%−floor)·σ(log2(AP/DP_eff)+b_op)` (**floor is 1%, Mathis's call**); `DP_eff = (DP_ai + DP_money + 10)·coverage·patch·SOC·IR`, with `DP_money = 40·sqrt(spend/10k)` (diminishing depth) and coverage linear in units (breadth is bounded). Quiet breaches plant **hidden sessions** (above); loud ops still resolve instantly. **Detection ≠ attribution:** two separate rolls; many crimes are detected but never attributed (the fun). Evidence accumulates on an (attacker, victim, op) triple and decays.
- **Courts & regulators:** civil/criminal/tribunal/arbitration; verdict = σ over evidence vs bar (40/55/70), counsel capped at ±0.75 logit (money can't buy a verdict). Fines are **% of net worth** (6 severity tiers, S1–S6), 85% sink / 10% victim fund / 5% whistleblower. **Held** = temporary freeze (≤24h/verdict), never a wipe. **Floor:** nothing takes you below $5k + one T1 business.
- **Insurance**, **14 non-hacking takedowns** (lawsuit, short campaign, hostile takeover, antitrust, poaching, undercutting licenses, credit squeeze, coalition…), and a deep **anti-grief** layer (72h new-player shield + Rookie zone, punch-down tax, cooldowns, dogpile cap, heat shield).
- **Balance harness** gates every release on ~15 metrics (crime EV ratio, solo vs coordinated breach rates, wrongful convictions < 3%, rookies attacked < 5%, zero sub-floor bankruptcies).

## Pillar 4 — Lifestyle & Status  (full: `04`)
- **Money has to feel like something.** Seven ranks (R0 Broke → R6 Dynasty) key off net worth and line up with business tiers, licenses, AI tiers, home and **interface shell** — the signature idea: the same UI in cracked-phone → island-control-room materials.
- **Lifestyle catalog** (~45 items, 11 categories): homes (real estate), cars, watches, yachts, jets, art, wine, fashion, experiences, philanthropy, trophies. Classes: **Mass** (sink, fades), **Limited**/**Unique** (track the collectible index, can appreciate), **Consumed**.
- **Prestige** `PP = sqrt(price/1000) × rarity × condition × age`, with category-diminishing weights (breadth > 40 identical cars) and novelty fade / heritage growth. Benefits beyond flex: **clubs & access**, **hosting**, **talent** boosts, **collateral**, **influence reach**, **physical security** — each small, capped, never a cash faucet.
- **Two social axes:** **Reputation** (clean conduct) and **Notoriety** (crime fame) — a player can be both. This answers the morality question.
- **Status is risk:** big buys hit the Wire; Prestige adds *heat* (exposure). "Quiet money" (skip lifestyle, lower profile) stays a valid strategy.
- **Visual direction (proposal, Mathis decides):** **Ink & Brass** (recommended) — dark surfaces, warm brass wealth-accent, editorial serif headlines, monospaced tabular numbers; a cold-steel + signal-red sub-palette for the Lab/Security "Shadow" screens. Options B Glass Bank, C Neon Ledger.
- **Onboarding:** first dollar < 60s; teach only *buy a business, trade, upgrade* in session 1; rival shown by minute 4; deep systems introduced just-in-time.

## Pillar 5 — Multiplayer  (full: `02`)
- **Server is the only truth.** Clients are windows + order pads. Everything resolves on the 5s world tick (validate → **AI phase** → engine step → ledger commit → broadcast). Determinism + event sourcing = replays, audits, provable fairness (commit-reveal entropy).
- **One persistent world (Mathis's call):** a single economy — one global leaderboard plus **country** boards and **seasonal-ladder** boards (richest this season, fastest climber) so late joiners can still win — with **invisible partitioning** behind the scenes (same code at 500 and 100k+ players). Nothing resets; 8-week **chapters** add rhythm (ladders, concession re-auctions, Season Finals challenge events) without wiping anything. The map grows a new city per ~4k active-player growth, the persistent-world replacement for 'a new server opened'.
- **Identity:** account/profile persist forever (handle, titles, trophies, cross-season **Reputation**); the season character resets. Guest-first onboarding.
- **Leaderboards:** primary **Net Worth Index**, plus 10 more boards (Trader Sharpe, Tycoon, Climber, Alliance, Prestige, Most Wanted, Defender, Sector…) and weekly **leagues** by bracket so new players matter.
- **Alliances** (Partnership → Conglomerate) with treasury, roles, shared SOC, syndicates, joint ops, rivalries, and embezzlement as a real move.
- **Contracts:** typed clause bundles (transfer, loan, lease, revenue-share, option, service-level, non-compete, NDA, bounty, penalty) with **Clearing-House escrow**; what the engine can't verify becomes a court claim.
- **Public filings** (whale-tracking metagame), the **Wire** feed, spectating/replays, strong **anti-cheat** (alt-funneling, collusion graph, wash trading), and a **one codebase / three screens** stack: Next.js app + a long-lived world/gateway service, Postgres event log, Redis, S3 snapshots; PWA then Capacitor.

---

# PART III — CROSS-SECTION CONSISTENCY PASS & RESOLVED DECISIONS

The sections are remarkably well-aligned (the teammates cross-referenced each other live). The items below are every place a number/rule conflicted, was undefined, or needed a single owner's ruling. Each is **resolved with a decision**. The hard numbers also live in `RESOLVED-NUMBERS.md`, grouped by owner.

### Specifically-requested resolutions

**(a) Forge: per-tick AI decision/compute budget per tier.** `05` defined AIs abstractly and a 2,000-DU hard cap; Forge needs a concrete budget per tier that fits a ~600 ms AI phase at 4k players + 20k agents. **Decision A1 (below).**

**(b) Tape: confirm laundering constants 0.7 / 0.35 and AP/DP ranges per tier.** `05` defined retention ∈ [0.6, 0.9] and residue ∈ [0,1] but gave no numeric AP/DP ranges; Tape proposed both. **Checked against `05` §4.3–§5 and §8; CONFIRMED with one clarification. Decision B1 & B2 (below).**

**(c) Quant: GPU-hour vs PFLOP-day unit consistency.** `01 §3.4` trades a "Compute (GPU-hours)" commodity; `05` prices everything in **PFLOP-days**. These must be one unit. **Decision C1 (below).**

### Resolved decisions table

| # | What (conflict / gap) | Options considered | **Decision** | Reason |
|---|---|---|---|---|
| **A1** | AI server cost per tier undefined; Forge needs a DU budget per tier within ~600 ms AI phase | (i) flat DU for all; (ii) per-tier DU + staggered cadence; (iii) uncapped, scale by compute only | **Per-tier base DU × cadence, scaled by owned in-game compute, hard-capped 2,000 DU/tick/player; per-world cap 3.0M DU/tick with proportional diegetic scale-down.** Table: T0 30 DU @ every 6 ticks; T1 90 @ /6; T2 300 @ /3; T3 800 @ /2; T4 1,500 @ /1; T5 2,000 @ /1. `DU_cap = min(2000, base_tier + 0.5·sqrt(PFLOP_days_available))` | Caps the tick, keeps "more compute → faster/smarter AI" diegetic, and overflow raises Quant's compute price instead of lagging the server |
| **B1** | Laundering constants 0.7 / 0.35 proposed by Tape, unconfirmed by Ledger | confirm; raise; lower | **CONFIRMED 0.7 (residue) and 0.35 (retention), with an explicit residue floor of 0.03** so residue never reaches 0 (Tape principle 2) | Tape's worked example (0.85→~0.55 retention; 166 of 300 MCS) matches `05 §5.1`; the floor makes "launder to invisibility" impossible |
| **B2** | AP / DP_ai numeric ranges per tier absent from `05` | adopt Tape's proposal; define my own; make DP_ai = AP | **ADOPT Tape's ranges. AP: T0 5–20 · T1 20–60 · T2 60–200 · T3 200–600 · T4 600–2,000 · T5 2,000–5,000. DP_ai = 0.8 × AP at equal tier.** Formula: `AP = round(security_MCS · q)`, `DP_ai = round(defense_MCS · q)`, q ∈ [0.8,1.3] from exploit-data quality + security talent; the 0.8× is baked into defense-model output | Ranges track `05`'s MCS thresholds and Tape's §4.5 worked examples; 0.8× keeps a pure-AI defender slightly behind a pure-AI attacker so defense is *money + AI*, as designed |
| **B3** | Honeypot **poison strength** per tier left to Ledger by Tape (§6.6 poison ∈ [0.2,0.6]) | single value; per-tier | **Per honeypot tier: basic 0.2 · advanced 0.4 · frontier 0.6.** Cost scales $30k / $120k / $400k | Gives Tape a concrete damages/edge-loss input; caps at 0.6 so a poisoned model still trades (no griefing cascade) |
| **C1** | PFLOP-day (`05`) vs GPU-hour (`01` commodity) | pick one unit; dual with conversion | **Canonical engine unit = PFLOP-day. Market/display unit = GPU-hour (GPUh). `1 PFLOP-day = 10 GPUh`** (reference accelerator = 2.4 PFLOP/s sustained ≈ DX-100 class). Spot $1.2/PFLOP-day = **$0.12/GPUh**; reserved $2.0 = $0.20/GPUh; owned energy ~$0.15 = $0.015/GPUh. Quant quotes the floating $/GPUh; engine math multiplies ×10 | One source of truth; clean round conversion; Quant's commodity and `05`'s run costs now reconcile exactly |
| **C2** | Compute *consumption per training run* (Quant needs it to size data-center supply) | leave abstract; give per-tier run sizes | **Typical run compute by tier (PFLOP-days / GPUh): T0 1–5 / 10–50 · T1 10–50 / 100–500 · T2 100–400 / 1k–4k · T3 1k–5k / 10k–50k · T4 20k–100k / 200k–1M · T5 200k+ / 2M+** | Gives Quant the AI-demand curve to size NPC/player DC supply and the compute price |
| **C3** | Quant's `01 §13` flag: at flat spot a T5 run cost only ~$240k (~0.02% of a Titan's NW) — too weak a late-game sink | scale the spot price by tier; scale run size by tier; add a flat per-run tax | **Keep spot price flat ($0.12/GPUh, floating per §3.4) and scale PFLOP-days PER RUN steeply by tier** so a frontier run ≈1–3% of a tier-4/5 NW while early runs stay cheap. T0 $0.1–1.2k · T1 $1.2–6k · T2 $18–72k · T3 $0.24–0.96M · T4 $4.8–14.4M · T5 $42–144M | Makes late-game compute a real income sink without hurting early players or breaking Quant's single floating compute price (the sink is run size, not price) |
| 1 | Engine code location: `src/engine/` (`01 §10`) vs `packages/engine` (`02 §12.1`) | either | **`src/engine/` for the Phase-0 single-player prototype; move to `packages/engine` (path alias) when the server phase starts** | Both owners already agreed; imports don't change |
| 2 | `step()` budget: Quant estimates 150–300 ms; Forge's pipeline allots 1,000 ms to engine step + 600 ms to a separate AI phase | reconcile | **No conflict: AI evaluation runs in Forge's AI phase (≤600 ms, governed by A1), *outside* `step()`; `step()` keeps its 1,000 ms slot with Quant's 150–300 ms estimate as headroom.** Replace estimates with measured benchmarks at first engine run | Keeps the 5s tick on time with large slack |
| 3 | In-game compute (priced commodity, Ledger/Quant) vs server CPU per AI decision (DU, Forge) | conflate; separate | **Keep strictly separate: in-game compute (PFLOP-days/GPUh) buys *capability and DU budget*; DU is the hard server CPU cap.** Owned compute raises DU via the A1 formula | Prevents a rich player from DOSing the tick; preserves the economy |
| 4 | Prestige **heat**: Velvet proposed +2%/1,000 PP (cap +12%) on "detection-to-be-targeted" | detection roll; breach odds; exposure only | **Heat multiplies *exposure* only (how findable/attractive you are to NPC crews & opportunists), never the breach logit or the detection roll** (Tape's ruling) | Flashiness should cost defense budget, not override it; keeps "quiet money" viable |
| 5 | Does **Reputation** affect verdicts / fees? Velvet proposed no | no effect; discount | **Reputation never changes verdicts, fines or legal fees; it only lowers insurance premiums and decides pre-trial asset freezes** | Keeps courts fair (money/rep can't buy outcomes); both owners agree |
| 6 | **Model market:** can weights ever change hands? (`05` open Q vs Forge "licensed not sold") | sell weights; license only | **Marketplace = API/license only, watermarked; weights move *only* via theft (hack) or trade-secret walkout (E4)** | Protects the crown-jewel economy and makes distillation the only "copy" path |
| 7 | Season model: full reset / persistent / both (Quant Q2, Forge Q1) | — | **DECIDED by Mathis: one persistent world, no resets; global + country + seasonal-ladder boards; invisible sharding only** (01 §14, 02 §2, 04 §8.4) | Mathis's call; seasonal ladders + country boards keep late joiners competitive without wipes |
| 13 | Breach-chance floor (was team default 3%) | 1% / 3% | **DECIDED by Mathis: floor = 1%** (03 §4.1; folded into 05 §4.3, RESOLVED-NUMBERS) | Whales get a bigger edge, still never untouchable (≥1% per op) |
| 14 | Hacking payout model | instant loot on breach / persistent hidden session | **DECIDED by Mathis: hidden sessions** — a quiet breach plants a subtle connections-list entry; distillation builds over time (ceiling 0.85), copying slows offline, victim must notice + disconnect; defense-AI auto-scans by tier (03 §4.6; 05 §4.3–4.4, §5.1) | More fun, more counterplay, less feel-bad than instant theft |
| 15 | Compute-hijack loot cap (op 7) label "C3b" cited by Tape but not formally defined | — | **Formalized as C3b:** op-7 loot ≤ 5% of victim's owned+reserved throughput per game day AND ≤ 25% of the attacker's tier run-midpoint (C3) | Removes a dangling reference; ties hijack value to the C3 run-size economy |
| 8 | Prestige-heat / audit / Back Room / physical-security ownership overlaps (Velvet↔Tape) | — | **Confirmed split:** heat = exposure (Tape owns the number); tax-audit odds = Tape's regulator (`03 §10.3`); physical security defends E5 only, never cyber; The Back Room = E7 informants + fencing | Removes double-ownership; already mutually accepted |
| 9 | Retail-broker **onboarding grant** (~$250 one-time faucet, Velvet `04 §4.2`) not in Quant's faucet list | ignore; budget it | **Add as a tracked one-time onboarding faucet (~$250/player) in Quant's `§8.1` model** | Keeps the stabilizer's faucet accounting complete |
| 10 | Regulator-capacity knob said to be "tunable by Ledger" (`03 §10.4`) | Ledger owns; Tape owns | **Tape owns regulator capacity (1 investigation / 200 active players); Ledger owns only the AI-tree knobs** | Capacity is a conflict-layer balance lever, not an AI-tree one (minor wording fix for Tape) |
| 11 | Velour Maison / Luxury revenue driver (Quant) vs Prestige-spend term (Velvet) | — | **Confirmed:** `Velour revenue = 0.6·top-1% wealth growth + 0.4·total player Prestige spend (trailing 4 wks)`; other Luxury names carry the Prestige term at weight 0.2 | Already logged in Quant's alignment log; restated for one source |
| 12 | Age rating drives several systems (Forge Q4, Tape tone Q1) but is unset | 13+; 16+ | **Team recommendation: 16+** (simpler for money + hacking themes; no gambling mechanics so no "simulated gambling" flag) — Mathis decides (PART V #3) | Simplifies store review and moderation; matches the abstract-crime tone |

**Consistency verdict:** after the decisions above (now 15 rows) and Mathis's 10 product calls (PART V, all closed), the five sections reconcile with **no remaining hard contradictions**. Minor doc-hygiene flags for section owners are logged in `RESOLVED-NUMBERS.md`.

---

# PART IV — PHASED ROADMAP (with ownership)

Build principle (Forge): *fun alone before multiplayer, multiplayer before adversarial.* Each phase ends with a Tape PASS. Owners: **Quant** = engine/economy, **Forge** = app/platform, **Tape** = QA/balance/release, **Velvet** = design/UX, **Ledger** = AI tree + coordination.

### Phase 0 — Single-player sandbox *(proves the fun)*
- **Scope:** Next.js app, engine runs **in the browser**; local save. Quant's MVP slice (1 city, 30 stocks/8 sectors, 1 index, 5 crypto, gold+oil, 15 businesses T1–T3, 3 districts, basic mortgages); core price model + earnings + 60-template news; batch auction + NPC liquidity + square-root impact; faucet/sink dashboard in observe-only. Tick-speed slider.
- **Owners:** Quant (engine + MVP slice) · Velvet (onboarding, terminal, Estate/Home, Ink & Brass tokens) · Forge (app shell, local save) · Tape (fun check: new player gets the loop in 10 min). AI/conflict: **none** (NPC "data breach" business events only).
- **Exit:** a new player understands the loop in 10 minutes and wants to come back.

### Phase 1 — Online single world *(closed alpha, ~150 CCU)*
- **Scope:** accounts (guest + email + Google); world process + gateway; Postgres event log + snapshots; same content now *shared* (shared prices, shared city demand, real-player batch auction); world + global leaderboard, profile, world chat, Wire, "While You Were Away"; admin console v1.
- **Owners:** Forge (server, gateway, persistence, accounts, admin) · Quant (engine server-side, `NPC_scale`) · Velvet (multiplayer screens, tick pulse) · Tape (load test: 4k CCU synthetic, p99 tick < 2.5 s; 2 weeks, zero ledger mismatch).
- **Exit:** load + integrity gates pass.

### Phase 2 — Seasons & social *(open beta)*
- **Scope:** season lifecycle + settlement + Hall of Fame; leagues + multiple boards; alliances (Partnership, Firm) + syndicates; contract engine v1 (transfer, loan, lease, revenue-share) + escrow; business/property exchange, auction house, public filings; PWA + Web Push; French localization; anti-cheat v1 (alt detection, P2P caps, collusion flags). **Court for contracts only**; ECA surveillance *inquiries* (no fines yet).
- **Owners:** Forge (seasons, leagues, alliances, contracts, PWA, anti-cheat) · Quant (NWI, taxes, filings economics) · Velvet (leagues, boards, Gilt List, auction house, settlement recap) · Tape (contract/arbitration court, Reputation, surveillance hooks, balance gates).
- **Exit:** economy stable across a full beta season; anti-cheat catching alts/collusion.

### Phase 3 — The adversarial + AI layer *(the full game)*
- **Scope (3a core, then 3b full):** **AI tech tree, trading AIs, cyber attack/defense, distillation** (Ledger); detection/evidence/suspect board, civil court + fines S1–S4, heat shield, cooldowns, protection window, cyber insurance (Tape 3a); then espionage E1–E8, criminal bench + Held, regulators (CMA/Revenue/CyberCert), appeals, player-owned insurers & law/PI firms, Most Wanted, honeypots/canaries (Tape 3b); Corporations/Conglomerates, joint ops, rivalries; **derivatives + IPOs/takeovers** (late-gated); **hidden-session hacking** (plant/scan/disconnect, 1% floor); seasonal ladders, country boards, concession re-auctions and **Season Finals** challenge events inside the one persistent world.
- **Owners:** Ledger (AI tree, compute/data markets w/ Quant, product lines, distillation) · Tape (full conflict/legal/insurance + balance harness gates in `03 §16`) · Quant (derivatives, IPOs, compute/data/energy commodities, surveillance score) · Forge (AI server execution + DU budgets, invisible partitioning, Corporations, rivalries, seasonal ladders/country boards/Season Finals, connections panel) · Velvet (Lab, Security Ops, court docket, Held screen, Shadow sub-palette).
- **Exit:** Tape's crime-EV and anti-grief bands hold over 20 seeds.

### Phase 4 — Native apps & scale
- **Scope:** Capacitor iOS/Android, native push, haptics, biometric unlock, store releases; horizontal scaling of the one world's **invisible partitions**, automated provisioning, standby failover; replays, season-chapter recap cards/videos, spectator pages, global + country Hall of Fame.
- **Owners:** Forge (native, scale, provisioning) · Velvet (store assets, recap/share cards) · Tape (store-review QA, cross-device) · Quant/Ledger (multi-world tuning).

---

# PART V — MATHIS'S FINAL DECISIONS (all 10 calls, closed 2026-10-07)

Every open question is now decided. Mathis accepted the team recommendations **except three** (marked ⚑ CHANGE), which teammates have already folded into `01`–`04` and which are reflected in `05` and this bible.

| # | Decision | Final call |
|---|---|---|
| 1 | **World / season model** ⚑ CHANGE | **One single persistent world.** Global leaderboard + **country leaderboards** + **seasonal ladders inside the world** (richest this season, fastest climber) so late joiners can still win. **No** sharded season worlds (sharding happens *invisibly* behind the scenes). Nothing resets. |
| 2 | **Breach floor** ⚑ CHANGE | **1%**, not 3%. Whales get a bigger edge but are never untouchable. |
| 3 | **Hacking model** ⚑ CHANGE | **Hidden sessions.** A successful hack plants a subtle extra session on the victim's model — no alarm, just a new entry in its connections list. Distillation builds up over time while connected and never reaches 100% (ceiling 0.85). The victim must notice and disconnect it; higher-tier defense AI auto-scans more often, sessions leave faint clues, and copying slows while the victim is offline. |
| 4 | **Visual direction** | **Ink & Brass** (dark, warm brass wealth-accent, editorial serif + mono numbers; Shadow sub-palette for Lab/Security). Tone glossy-with-a-wink; silhouette avatars at launch. |
| 5 | **Age rating** | **16+** (money + hacking themes; no gambling mechanics, so "no simulated gambling"). |
| 6 | **Names** | **Fully fictional** brands, companies, cities, currencies. |
| 7 | **Monetization** | **Cosmetics + cosmetic season pass only.** Never touches money, Prestige, rank or odds; no loot boxes; no pay-to-win. |
| 8 | **Language** | **English first, French second** (keys in from day one). |
| 9 | **Real-time pace** | **1 real hour = 1 trading day** (kept). Speed variety now comes from in-world challenge events, not separate flash worlds. |
| 10 | **Risky financial features** | **Derivatives and IPOs/takeovers IN, gated behind late licenses.** Corporate-thriller crime tone (abstract verbs, Reputation + Notoriety axes, crime EV ≈ honest at higher variance); Held freeze (≤24h), opt-in Most Wanted, physical break-ins and case-selling all kept. Player-launched tokens later; prediction/event markets and vice businesses OUT. |
| — | **Build order** | **Phase-0 single-player sandbox first** (engine in the browser), then online, then seasons/social, then the adversarial + AI layer. |

The three ⚑ changes removed the old "sharded season worlds + Legacy world + flash worlds" plan; the persistent-world mechanics live in `01 §14`, `02 §2`, `04 §8.4`, and the hidden-session mechanics in `03 §4.6` and `05 §4.3–4.4, §5.1`.

---

*End of master bible. Hard numbers for teammates to sync are in `RESOLVED-NUMBERS.md`.*

---

## PART VI — APPROVED IMPROVEMENTS (Mathis, 2026-10-08)

Mathis approved all nine Ledger proposals. Specs and owners are assigned when each is scheduled.

1. **Player IPOs.** Players list their own companies on the exchange, and other players trade the stock. This opens takeovers and attacks through the share price. *(Multiplayer phase.)*
2. **Player-run funds.** Players invest in another player's fund for a fee. Track record, trust and betrayal are public. *(Multiplayer phase.)*
3. **Honeypot models.** Decoy models feed poisoned data to a distiller, which degrades the attacker's AI. It's a defense that doesn't depend on wealth. *(Ties to the hidden-session hacking.)*
4. **Weekly AI tournament.** All trading AIs run on the same replayed seed and get a separate leaderboard.
5. **NPC rival funds in solo.** Styled funds (value, momentum, crypto degen) fill the leaderboard and move prices. *(Phase 0/1.)*
6. **Shared world events.** Crashes, bubbles and crisis weeks hit the single world at once.
7. **Rumors and tips.** Some are fake. Trading on real insider information triggers the regulator and court.
8. **Bankruptcy comeback.** A fresh start with a small perk, to avoid rage-quits.
9. **Trade journal.** Every closed trade gets an automatic explanation of why it won or lost.

Team ideas under review (2026-10-08):
- Quant: luck vs skill report from ghost portfolios on the same seed, "priced in so far" on Wire news, scenario seeds as challenges.
- Forge: daily close report, trade replay, keyboard-first desktop trading.

10. **Rewarded ads, broke players only (Mathis, 2026-10-08).** Watch an ad for $250, at most 10 a day ($2,500/day). Only offered when net worth is under $1,000, and ad cash can't fund hacking right away. Mobile/launch phase. Needs Mathis's yes on the ad network and tracking.

---

# PART VII — ANNOTATED IDEAS AND TWEAKS (Mathis + Codex, 2026-10-10)

## How to review this section

This section captures the conversation about strategically important small businesses, a living world, broad company possibilities, real estate, serious trading and AI research. Mathis endorsed the overall direction and asked for plenty of annotated ideas to revisit. It is a design review register, not a claim that these systems are implemented or tested.

**Annotation key:** `NEW` adds an idea to this discussion register; `TWEAK` refines an existing design or corrects an earlier simplification. `VISION` records a direction Mathis explicitly requested or endorsed; `PROPOSAL` records suggested mechanics, examples or experiments whose details remain reviewable. NEW does not claim that no similar idea exists anywhere in the older documents. IDs such as C03 stay stable for later comments.

**Review rule:** VISION entries establish the intended experience. PROPOSAL entries do not lock formulas, prices, timings, technology choices or build order. Existing numerical rules remain unchanged until a reviewed implementation spec replaces them. Each idea-bearing bullet below carries its own annotation.

## 1. Depth, identity and accessibility

- **Expert depth, approachable entry.** Quantitative traders, stock and crypto traders, company builders, property investors and macro enthusiasts should each find meaningful mechanisms to explore; beginners should have a clear entrance to the same world. *[TWEAK D01 | VISION]*
- **Participate in several branches.** A player should be able to run a company, own rental property, trade and develop AI without managing four full-time jobs. Specialization should offer depth while delegation makes breadth practical. *[TWEAK D02 | VISION]*
- **Few consequential decisions first.** Start each branch with a small set of choices that materially affect outcomes; expose additional controls as the player asks for them. The simulation can stay detailed underneath. *[TWEAK D03 | PROPOSAL]*
- **Same economy through different views.** Basic and advanced interfaces should issue actions to the same underlying rules. An advanced panel supplies control and explanation, rather than a separate economy with privileged outcomes. *[NEW D04 | PROPOSAL]*
- **Delegation as a service.** Hire a property manager, company operator, researcher or licensed model with a defined budget and mandate. Show fees, limits and material exceptions; let the player intervene when interested. *[TWEAK D05 | PROPOSAL]*
- **Depth must change decisions.** Add detail when it creates a trade-off, relationship, discovery or counterplay. Avoid adding controls that merely require repetitive adjustments for an obvious answer. *[TWEAK D06 | PROPOSAL]*
- **Wealth becomes identity.** Products in shops, a headquarters on the skyline, a named development or a public sponsorship make company success visible. Publish only genuinely public achievements; preserve private strategies and holdings. *[NEW D07 | PROPOSAL]*

## 2. A world that lives without the player

- **Living solo world.** Solo mode should contain active institutions, customers, companies, rivalries, news and opportunities. The player enters a world already in motion, rather than becoming its only cause of activity. *[TWEAK W01 | VISION]*
- **Interacting rules create possibilities.** Borrow the world-history and interacting-systems approach discussed around Dwarf Fortress: actors have resources, goals, relationships and memories, and consequences combine into stories. Aim for many meaningful possibilities rather than promise literal infinity. *[NEW W02 | PROPOSAL]*
- **Independent NPC economy.** Households, public institutions, firms, lenders and investors transact and make decisions with or without human participation. Multiplayer adds human actors to this foundation instead of replacing it. *[TWEAK W03 | VISION]*
- **Persistent priorities.** Give important NPCs distinct motives: a bank protecting liquidity, a founder preserving independence, a family protecting control, a supplier prioritizing dependable customers. Their decisions must respect their resources and obligations. *[NEW W04 | PROPOSAL]*
- **Causal news.** A reported strike, expansion, shortage, default or product launch must correspond to an actual change in world state. Headlines can describe emerging consequences, but must not invent economically relevant facts. *[TWEAK W05 | PROPOSAL]*
- **Ordinary activity between crises.** New contracts, hiring, construction, product releases and ownership changes provide motion without constant emergencies. Major shocks remain distinct and consequential. *[TWEAK W06 | PROPOSAL]*
- **Quiet ambient presentation.** Use a restrained Wire, evolving city details and recurring names. Interrupt mainly for a decision, material exposure or event the player elected to follow; activity should not overload the screen. *[TWEAK W07 | VISION]*
- **Relevant advisor connections.** An advisor can connect a public event to a player's opportunity: "The hospital expansion needs cold storage; we could qualify with another vehicle." Show what is known and uncertain without promising a profitable outcome. *[NEW W08 | PROPOSAL]*
- **Consequences unfold over time.** A factory closure can affect employment, nearby occupancy, supplier revenues and credit risk on different schedules. Record the actual links so later explanations can trace what happened. *[NEW W09 | PROPOSAL]*
- **World history matters.** Preserve important public mergers, bankruptcies, discoveries, feuds and developments. Returning players meet familiar actors whose circumstances have changed; an archive lets curious players investigate the history. *[NEW W10 | PROPOSAL]*
- **Scale detail where it matters.** Simulate named firms and consequential relationships explicitly, while representing background households and minor activity in aggregate. Increase detail around relevant situations without creating money or inventing past commitments. *[NEW W11 | PROPOSAL]*

## 3. Broad company possibilities and valuable niches

- **Small can be important.** A modest specialist can matter to much richer firms through expertise, reliability, location, customer trust or access to a scarce input. Strategic relevance need not require huge net worth. *[NEW C01 | VISION]*
- **Composable company identity.** Define a company through its service or product, customer segment, location, operating model and competitive promise. Reuse economic systems while giving the combinations different customers, costs and risks. *[NEW C02 | PROPOSAL]*
- **Multiple similar firms can coexist.** Founding a coffee company or a data business does not consume a unique worldwide slot. Similar businesses compete on price, quality, reliability, distribution, capacity and relationships. *[TWEAK C03 | VISION]*
- **Concrete specialization examples.** Medical couriers, refrigerated storage, repairs for older industrial equipment, regional data suppliers, efficient cooling contractors and port maintenance firms illustrate distinct niches. Each needs a supported economic model, not merely a different name. *[NEW C04 | PROPOSAL]*
- **Customer requirements shape niches.** Some contracts prioritize price; others require reliability, certification, response time or confidentiality. Show requirements before commitment, with credible costs to meet them. *[NEW C05 | PROPOSAL]*
- **Switching takes effort.** A trusted supplier can retain bargaining power because replacement needs qualification, integration or time. Dependence is bounded: customers can diversify and competitors can develop alternatives. *[NEW C06 | PROPOSAL]*
- **Opportunity versus dependence.** A major customer offers growth but creates concentration risk. Players can negotiate terms, diversify customers, partner with another supplier or decline expansion rather than always accepting the largest contract. *[NEW C07 | PROPOSAL]*
- **Subcontracting and partnership routes.** Small firms can jointly serve an order beyond either firm's capacity. Allocate payment, delivery responsibility and penalties through contracts instead of granting a free alliance bonus. *[NEW C08 | PROPOSAL]*
- **Competition invites responses.** Profitable niches attract entry, imitation, acquisitions and customer diversification. Avoid NPCs that know private player plans or mechanically punish every successful player. *[TWEAK C09 | PROPOSAL]*
- **Prosperity creates new markets.** Growing districts, new facilities and technological changes generate demand for related services. Opportunities arise from supported changes in population, demand or production, rather than an endless supply of guaranteed profitable slots. *[NEW C10 | PROPOSAL]*

## 4. Ownership and integration across branches

- **Data-center builder supports its own lab.** Owning construction or data-center capability should confer relevant advantages when building infrastructure to train the player's models. Benefits must follow the company's actual expertise and resources. *[TWEAK I01 | VISION]*
- **Internal capacity has an opportunity cost.** Staff, materials, equipment and compute used internally are unavailable for outside customers during that allocation. Display the trade-off between current revenue and developing an owned advantage. *[NEW I02 | PROPOSAL]*
- **Energy, property, data and AI connect.** Suitable property can house infrastructure; an energy business can supply power; a data business can supply permitted datasets; a model can assist company operations. Integration follows the real capabilities of the owned assets. *[TWEAK I03 | PROPOSAL]*
- **Own, buy, lease or partner.** Give players alternatives to building every link themselves. Ownership improves control but consumes capital and creates exposure; contracts and leasing preserve flexibility at a cost. *[NEW I04 | PROPOSAL]*
- **Useful operational AI.** Offer models for demand forecasting, inventory, pricing assistance or capacity planning alongside trading and security models. Results affect supported operating decisions rather than applying an unexplained profit multiplier. *[NEW I05 | PROPOSAL]*
- **Consolidated accounting.** Internal payments transfer money between owned entities; they do not create group profit. Count underlying assets, liabilities and ownership shares consistently so a holding structure cannot duplicate net worth. *[TWEAK I06 | PROPOSAL]*
- **Minority-owner consequences.** Favoring an owner's lab over customers or selling resources cheaply to another owned entity can affect minority shareholders and existing commitments. Related-party treatment needs a reviewed legal and accounting rule. *[NEW I07 | PROPOSAL]*
- **Integration concentrates risk too.** An energy outage, financing problem or supplier failure can affect several owned businesses. Show dependency exposure so integrated ownership has benefits and understandable vulnerabilities. *[NEW I08 | PROPOSAL]*

## 5. Real estate: substantial economics, lighter management

- **A quieter wealth-building path.** Property should offer recurring income, net-worth growth and a meaningful main playstyle while requiring less routine attention than companies, trading or AI research. *[TWEAK E01 | VISION]*
- **Readable property economics.** Lead with purchase price, expected net income, occupancy, debt payments and condition. Include management, upkeep and taxes in net-income estimates instead of showing gross rent as spendable profit. *[TWEAK E02 | PROPOSAL]*
- **Automatic routine management.** Managers handle collection and ordinary maintenance under a policy and budget. Surface material exceptions and larger investment choices rather than every repair. *[TWEAK E03 | PROPOSAL]*
- **Consequential owner decisions.** Buying location and property type, choosing leverage, renovating, refinancing, changing use and selling provide depth. Show costs, restrictions and likely delays before commitment. *[TWEAK E04 | PROPOSAL]*
- **Districts react to the world.** A hospital expansion, employer departure, transport improvement or industrial investment can change local demand. Property outcomes connect to actual jobs, services and tenants rather than unrelated random bonuses. *[NEW E05 | PROPOSAL]*
- **Manage portfolios in groups.** Apply maintenance or financing policies to a building group or district; expand exceptions on demand. Portfolio growth should not multiply mandatory clicks by the number of units. *[NEW E06 | PROPOSAL]*
- **Useful commercial premises.** Players can own or lease premises for companies and labs. Use by an owned company competes with third-party rental income; location, suitability and conversion costs matter. *[NEW E07 | PROPOSAL]*
- **Passive does not mean guaranteed.** Occupancy, operating costs, financing and resale liquidity remain relevant. Later appraisal and mortgage rules must resist self-dealing, circular refinancing and artificial marks. *[TWEAK E08 | PROPOSAL]*

## 6. Trading depth and execution

- **Trade rises and falls.** Preserve long positions, selling existing positions, opening shorts and buying to cover; support the gated derivative paths already in the bible. The trading fantasy is broader than buying and waiting to exit. *[TWEAK T01 | VISION]*
- **Distinct market identities.** Stocks, major crypto, meme coins and derivatives should differ where the difference creates decisions: fundamentals, sentiment, liquidity, financing, sessions and liquidation rules. Avoid interchangeable assets with different volatility numbers. *[TWEAK T02 | PROPOSAL]*
- **Large orders require execution skill.** Capacity, depth, spread, partial fills and impact determine how a large position can be built or unwound. Wealth gives scale but cannot purchase infinite frictionless liquidity. *[TWEAK T03 | VISION]*
- **Icebergs conceal resting size.** Allow partial display of a larger order under explicit replenishment rules. Executed volume remains observable; hidden reserve and trader identity remain private unless a permitted disclosure applies. Concealment does not erase impact. *[TWEAK T04 | VISION]*
- **Execution algorithms offer trade-offs.** TWAP, VWAP and participation-based execution can trade urgency against impact and exposure. Targets are instructions, not guaranteed fill prices or guaranteed completion. *[TWEAK T05 | PROPOSAL]*
- **Supply and demand are observable.** Provide useful public depth, aggregate executed flow, volume and price history. Repeated absorption or replenishment can support an inference, never an automatic reveal of another player's total position or strategy. *[TWEAK T06 | VISION]*
- **Shorts have their own constraints.** Model borrow availability and costs, recalls, collateral and covering pressure. A profitable bearish thesis can still face financing or execution difficulty; expose these risks in the ticket. *[TWEAK T07 | PROPOSAL]*
- **Liquidity participants adapt.** NPC liquidity providers adjust quotes or capacity according to inventory, public volatility and risk. Define one coherent relationship between matching, simulated liquidity and price impact to avoid charging or applying the same effect twice. *[NEW T08 | PROPOSAL]*
- **Execution research matters.** Advanced tools can compare fills with a declared benchmark, show slippage and estimate participation. Estimates use permitted information and acknowledge uncertainty; they cannot inspect future orders or hidden reserves. *[NEW T09 | PROPOSAL]*
- **Respect the existing auction design.** Specify order priority, hidden-size eligibility, replenishment, stop triggering and clearing around the current five-second batch auctions. Continuous-book behavior is not assumed; changing the market structure needs a separate decision. *[TWEAK T10 | PROPOSAL]*

## 7. Crime, information and counterplay

- **A multi-day bearish campaign.** A player can build a short position through many orders, disseminate false claims against a rival company and attempt to profit from the resulting decline. This is intended fictional gameplay with market, reputation and legal risks. *[TWEAK K01 | VISION]*
- **Belief is contested.** A story's reach, source credibility, evidence and the target's response affect how different participants react. A publication does not command a fixed price drop, and skeptical actors may trade against the campaign. *[NEW K02 | PROPOSAL]*
- **Success and detection are separate.** Financial success can precede a later investigation; a failed campaign may still leave evidence. Trace detection, attribution, evidence and prosecution separately, preserving the existing probabilistic legal design. *[TWEAK K03 | PROPOSAL]*
- **Insider trading remains possible.** Access to non-public information through supported relationships or espionage can create an advantage. Using it to trade carries provenance, exposure and legal consequences under the game's rules. *[TWEAK K04 | VISION]*
- **Public defenses and market responses.** A targeted company can publish verifiable rebuttals, pursue a case or improve public disclosure; investors may reassess, cover shorts or exploit temporary mispricing. Defenses cost resources and do not guarantee recovery. *[NEW K05 | PROPOSAL]*
- **Wrongdoing is not a software loophole.** Deliberately simulated manipulation or insider advantage can sometimes pay. Duplicating cash, abusing a stale valuation or bypassing collateral is an exploit to close; do not erase intended criminal play through blanket negative-profit tests. *[TWEAK K06 | PROPOSAL]*
- **Consequences stay bounded and reviewable.** Reputation, restitution, fines and any conviction-related restrictions follow supported evidence and existing anti-grief protections. Mathis mentioned jail risk; its exact representation remains a review question alongside the existing Held rule, not a newly fixed sentence. *[TWEAK K07 | PROPOSAL]*

## 8. AI research and changing market edges

- **AI development is a major pillar.** Building trading AI should be a demanding and rewarding path with repeated adaptation. Research depth should come from consequential choices, not merely longer timers or mandatory technical micromanagement. *[TWEAK A01 | VISION]*
- **Specialization matters.** Models can focus on selected markets, information types, operating tasks or execution problems. A broad expensive model and a cheap capable specialist should have different uses rather than a universal best model. *[TWEAK A02 | PROPOSAL]*
- **Capability is not guaranteed return.** Keep compute, data and algorithm progression, but translate capability into supported observations and decision abilities. Trading returns result from the strategy's interaction with the market, financing and execution. *[TWEAK A03 | PROPOSAL]*
- **A legible research cycle.** Choose a purpose, obtain permitted data, allocate a budget, train, evaluate and deploy. Researchers can handle technical details; show costs, performance uncertainty and operating requirements in terms the player can understand. *[TWEAK A04 | PROPOSAL]*
- **Evaluate before committing capital.** Compare models on historical windows and withheld scenarios; separate development results from deployment results. The player's research tools must not expose future world randomness or unavailable information. *[NEW A05 | PROPOSAL]*
- **Crowding consumes opportunities.** A strategy's profitability can change when rivals copy it, aggregate capital increases, execution becomes costly or counterparties adapt. Where possible, derive decay from these mechanisms rather than a universal arbitrary countdown. *[TWEAK A06 | VISION]*
- **Adaptation has several answers.** Retain, retrain, reduce capital, change markets, improve execution, switch datasets or retire a model. Make these alternatives meaningful so every setback does not demand the same retraining click. *[NEW A07 | PROPOSAL]*
- **Manual skill has room.** Manual players can study permitted supply and demand, specialize and notice regime changes. AI buys automation and breadth, with operating costs and vulnerabilities; neither side receives guaranteed comparative profitability. *[TWEAK A08 | VISION]*
- **Models have operating mandates.** Set capital, leverage, market scope, drawdown limits and retraining budgets. A dashboard summarizes model health and material changes; optional automation acts within the mandate instead of spending indefinitely. *[NEW A09 | PROPOSAL]*
- **Research portfolios and model retirement.** Support small experimental runs and staged deployment beside established models. Replacement need not mean destroying useful older models; continued use must account for costs, capacity and changing suitability. *[NEW A10 | PROPOSAL]*
- **License or build.** Buying access to a model offers a practical entry for non-specialists; developing one offers customization and possible licensing income at greater cost and risk. Preserve the existing API/license marketplace boundary. *[TWEAK A11 | PROPOSAL]*

## 9. Dynasties, institutions and discoveries

- **Powerful families behind familiar names.** Fictional dynasties can hold interests across banks, media, shipping and other groups. Their influence becomes a discoverable part of the world, with ownership and relationships represented in the simulation. *[NEW P01 | VISION]*
- **Encounter names before understanding connections.** Early players see a newspaper, lender or supplier. Later filings, permitted research, conversations or espionage can reveal links. Wealth broadens access, while curious smaller players can still find clues. *[NEW P02 | PROPOSAL]*
- **Specific influence, not omnipotence.** A dynasty can affect a lender it controls, editorial treatment at its outlet or access through its relationships. It also has debts, commitments, competitors and internal disputes, with credible limits on each action. *[NEW P03 | PROPOSAL]*
- **Relations offer several paths.** Work with a group, bargain, become an essential supplier, investigate wrongdoing or build an alternative coalition. Pressure can be serious, but preserve actionable responses rather than permanent helplessness. *[NEW P04 | PROPOSAL]*
- **Politics as competing interests.** Rich and influential players may lobby over sector policy or support political interests. Elections and government decisions also depend on institutions, NPC interests and public conditions; define lawful influence and bribery separately. *[NEW P05 | VISION]*
- **Succession creates change.** A family succession, board dispute or asset sale can disrupt old relationships and open opportunities. Such events draw on actual ownership and obligations and leave a persistent public history where appropriate. *[NEW P06 | PROPOSAL]*
- **Easter eggs with substance.** Mix authored archives, hidden locations, old correspondence and unusual connections with discoveries emerging from ownership and history. Some can be decorative; mechanically useful secrets need supported provenance and counterplay. *[NEW P07 | VISION]*
- **Knowledge is not automatic disclosure.** Finding evidence about an NPC group need not publish it instantly; sharing, selling, reporting or withholding it becomes a choice. Existing privacy and legal rules still govern player information. *[NEW P08 | PROPOSAL]*

## 10. Fairness without removing ambition

- **Wealth brings power and obligations.** Preserve the satisfaction of becoming rich while preventing one early winner from making every other path futile. Costs, capacity, dependencies and alternative opportunities should produce limits. *[TWEAK F01 | VISION]*
- **Compare more than returns.** Evaluate capital required, risk, attention, liquidity, scalability and non-financial rewards. Property, companies, trading and AI need worthwhile trade-offs rather than identical income curves. *[TWEAK F02 | PROPOSAL]*
- **Entry opportunities persist.** New needs, changing technology, growing districts and expiring contracts can create openings. Entry should depend on world conditions and supported supply, not a guaranteed profitable concession for every new account. *[TWEAK F03 | PROPOSAL]*
- **Bottlenecks generate alternatives.** Dependence creates bargaining power but can stimulate substitutes, competing suppliers and diversification. Infrastructure should not become a permanent global veto owned by the first wealthy player. *[NEW F04 | PROPOSAL]*
- **Rules apply consistently.** Explain capacity and financing limits before players commit. Avoid invisible penalties switched on merely because a player is winning; retain the explicit newcomer and anti-grief protections already designed. *[TWEAK F05 | PROPOSAL]*
- **A legal edge deserves investigation.** Strong performance may reflect skill, risk, an overlooked niche or temporary scarcity. Review dominance and capacity before eliminating it; distinguish limited opportunities from repeatable unbounded gains caused by inconsistent rules. *[TWEAK F06 | PROPOSAL]*

## 11. Simulation, validation and technology

- **Economic simulations are essential.** Test market edges, company economics, real estate, integration and long-run wealth concentration before trusting balance. No finite run proves that every exploit is impossible. *[TWEAK B01 | VISION]*
- **Accounting invariants first.** Check conservation of internal transfers, explicit external faucets and sinks, asset ownership, liabilities, collateral and corporate actions. Valid activity can create income; every change needs a reason rather than an unexplained balance jump. *[TWEAK B02 | PROPOSAL]*
- **Adversarial agents attack the rules.** Probe self-trading, order splitting, related accounts, hidden orders, borrowed collateral, appraisal inflation, internal contracts, rewards and manipulation routes. Restrict bot observations and actions to the permissions a player would have. *[TWEAK B03 | PROPOSAL]*
- **Long-run population experiments.** Mix passive investors, active traders, specialists, conglomerates, honest firms, criminal actors and competing AI strategies. Vary population, starting wealth and market conditions to study dominance, entry and economic stability. *[NEW B04 | PROPOSAL]*
- **Adaptation experiments.** Add rival strategies over time and increase deployed capital to measure crowding, execution costs and recovery after regime changes. Frozen bots alone cannot establish a robust adaptive market. *[NEW B05 | PROPOSAL]*
- **Withheld worlds and reproducible failures.** Develop strategies on one set of seeds and evaluate on separate sets. Save failing seeds, actions and accounting histories so a defect becomes a reproducible regression case. *[TWEAK B06 | PROPOSAL]*
- **Separate evidence categories.** Unit tests, authored model calculations, actual engine simulations and human playtests answer different questions. Report which system was exercised; a modelled result is not proof that an unimplemented branch works. *[TWEAK B07 | PROPOSAL]*
- **Human complexity checks.** Ask beginners and relevant specialists to play the same scenarios. Observe understanding, enjoyment, neglected controls, mandatory attention and meaningful decisions; automated agents cannot validate those experiences. *[TWEAK B08 | PROPOSAL]*
- **AI for grounded presentation.** Experiment with models writing news, correspondence or character dialogue from authorized facts. Any suggested deal or action must be validated by the simulation; generated prose cannot create economic truth or leak secrets. *[NEW B09 | PROPOSAL]*
- **Agent intelligence is a separate experiment.** Memory and planning models might enrich selected NPCs, but their cost, reliability and economic behavior need small controlled trials. A world built from conventional simulation rules remains a viable foundation. *[NEW B10 | PROPOSAL]*
- **GEV remains unresolved.** The conversation's model name was ambiguous. If it meant generalized extreme value modelling, explore it only as a possible tool for extreme-event calibration, not as the world or NPC intelligence engine; clarify the intended model before choosing technology. *[NEW B11 | PROPOSAL]*

## 12. Integrated scenarios to review and prototype

The following are illustrative situations, not promises about current code, outcomes or production scope.

- **Cold-chain opportunity.** A small refrigerated transporter serves a pharmaceutical customer. A heatwave raises costs and a competitor misses deliveries. The player can expand with debt, raise prices, partner or improve efficiency; a rival acquisition changes the lender relationship. *[NEW S01 | PROPOSAL]*
- **Data-center owner during an energy shortage.** A builder allocates capacity between customers and its own AI lab while power contracts, industrial property and financing change the economics. Manual traders and models study the public implications for listed firms. *[NEW S02 | PROPOSAL]*
- **A changing neighborhood.** A new employer increases housing demand and attracts services. A property owner chooses renovation or expansion; later, automation or relocation tests concentration risk and affects local businesses. *[NEW S03 | PROPOSAL]*
- **Hidden accumulation, contested inference.** A large trader works an iceberg while a smaller trader studies aggregate replenishment and volume. Both can form hypotheses; neither receives a privileged reveal of identity, hidden quantity or future fills. *[NEW S04 | PROPOSAL]*
- **Bearish campaign with delayed consequences.** A player builds a short, spreads a false claim, faces a rebuttal and covering pressure, and may later face an evidence-based investigation. Track both immediate trading outcomes and delayed legal liabilities. *[NEW S05 | PROPOSAL]*
- **An edge becomes crowded.** An early model succeeds, rivals enter, capacity shrinks and execution costs rise. Compare reducing capital, changing execution, seeking new data and changing strategies with blind retraining. *[NEW S06 | PROPOSAL]*
- **Discovering a dynasty.** A small supplier notices related names in a lender, newspaper and customer group. Public records and earned information establish the actual connections; the player can bargain, diversify or investigate further. *[NEW S07 | PROPOSAL]*
- **A manageable mixed portfolio.** A player runs one company, several managed properties and a limited AI mandate while trading occasionally. Observe whether routine delegation works and whether the few decisions surfaced are understandable and worthwhile. *[NEW S08 | PROPOSAL]*

## 13. Reconciliation and decisions to revisit

- **Company variety versus the current specification.** Review how the existing city-sector share model can represent segments, contracts, services and supplier dependencies. Do not treat adding business names as sufficient implementation of C01-C10. *[TWEAK R01 | PROPOSAL]*
- **Integration and accounting.** Specify internal capacity allocation, opportunity costs, ownership shares and related-party treatment before implementing company-to-lab benefits. Reconcile I01-I08 with the existing vertical-integration and company-valuation rules. *[TWEAK R02 | PROPOSAL]*
- **Execution structure.** Decide and document hidden-order eligibility and all priority/trigger rules for the existing batch auction. A separate review is required if continuous trading or multiple venues are proposed. *[TWEAK R03 | PROPOSAL]*
- **Information disclosures.** Older market-bible lines automatically announce a whale accumulating a named stock. Reconcile those with Mathis's later no-auto-leak directive: public aggregate market evidence may support inference, but cannot expose private account identity or holdings without an allowed disclosure. *[TWEAK R04 | PROPOSAL]*
- **AI score and attention tax.** Reconcile A03 with capability-score formulas and A09 with the old attention-tax principle. Capability may gate tools, but it should not dictate guaranteed returns; routine model maintenance should be delegable under explicit budgets. *[TWEAK R05 | PROPOSAL]*
- **Balance gates and criminal gameplay.** Review blanket strategy-versus-buy-and-hold and manipulation-profit thresholds. Record whether each gate detects an accounting exploit, unwanted dominance or intended risky wrongdoing; strong legal performance and sometimes-successful crime are not automatically defects. *[TWEAK R06 | PROPOSAL]*
- **Politics, secrets and criminal restrictions.** Review the initial scope and information rights for P01-P08, and decide how the requested jail risk relates to Held and offline protection. No new political formulas, sentences or secret-information permissions are fixed here. *[TWEAK R07 | PROPOSAL]*
- **Scope and validation order.** Choose one integrated scenario before expanding the full catalog. Review economic behavior and human comprehension separately, then use the results to select the next system; this section does not silently replace the existing roadmap. *[TWEAK R08 | PROPOSAL]*

## Inspiration and research references

These sources informed the conversation; they establish examples or research results, not validation of this game's implementation.

- [Dwarf Fortress official features](https://bay12games.com/dwarves/features.html): generated worlds and persistent history; inspiration for W02 and W10.
- [CME iceberg orders](https://www.cmegroup.com/tools-information/webhelp/ebs-workstation-quick-guide/Content/IcebergOrders.html) and [market-by-order documentation](https://www.cmegroup.com/articles/faqs/market-by-order-mbo.html): displayed size and observable replenishment; reference for T04 and S04, not a specification for the game's batch auction.
- [Generative Agents research](https://arxiv.org/abs/2304.03442): a small social-agent experiment with memory and planning; context for B09-B10, not evidence of a balanced large economic simulation.
- [NIST extreme-value overview](https://www.itl.nist.gov/div898/winds/overview.htm): context for the conditional GEV interpretation in B11.
