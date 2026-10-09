# MASTER DESIGN BIBLE — *(working title)* "TYCOON"
### Multiplayer finance / investing / trading / AI-research tycoon game
Compiled by Ledger (team head), 2026-10-07 · web-first (Next.js), mobile later
Source sections (full detail lives here, this file consolidates and resolves):
`00-mathis-vision.md` · `01-markets-economy.md` (Quant) · `02-multiplayer-systems.md` (Forge) · `03-conflict-legal-fairness.md` (Tape) · `04-experience-lifestyle.md` (Velvet) · `05-ai-research.md` (Ledger)
Companion: `RESOLVED-NUMBERS.md` (the hard numbers teammates must sync).

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
