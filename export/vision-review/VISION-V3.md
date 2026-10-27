# Trading Game — Vision v3: The Most Advanced Financial Game

Prepared for Mathis, 2026-10-18. This replaces the direction of v2 (kept on disk, but superseded).

**What v3 gets right that v2 got wrong.** v2 treated your ambition as a risk to be trimmed and treated "will people want it" as a goal. Neither is the goal. The goal is **the most advanced financial game ever made**, and if you want it, that is reason enough. v3 therefore does the opposite of v2: **nothing is cut.** Every pillar in your vision stays (businesses, markets, real estate, AI lab, cyber, distillation, courts, defense, lifestyle, leaderboards, multiplayer), and v3 *adds* the financial depth that the existing documents only touch on the edges of.

Rules kept from your decisions: one persistent world, no resets; fully fictional names; 1% breach floor; hidden-session hacking; Ink & Brass; derivatives, IPOs and takeovers in (late-gated); cosmetics-only monetization; no prediction markets, no vice businesses; nothing auto-leaks a player's strategy or holdings.

This document is a design proposal. It changes nothing in the repo.

---

## Part 1 — The standard v3 is held to

"Most advanced" needs a definition, or it is just a slogan. v3 holds the design to six tests. A design passes only if a real finance professional, a quant, an engineer and a game designer would each find it credible.

| # | Test | Meaning |
|---|---|---|
| T1 | **Institutional realism** | The game contains the actual machinery of finance (credit creation, clearing, margin waterfalls, securitization, fund structures, accounting), not a flat "buy low, sell high" abstraction |
| T2 | **Emergence from interlock** | Systems share one balance sheet, one ledger and one macro state, so crises, bubbles and cascades emerge from rules instead of being scripted |
| T3 | **Expert ceiling** | A quant can build, backtest and stress a real strategy; a macro trader can express a view through rates, FX and credit; a founder can run an LBO. The ceiling is high enough to keep experts for years |
| T4 | **Legible floor** | Everything above is reachable through progressive disclosure. The same economy, simpler views (your D04 principle) |
| T5 | **Verifiable honesty** | Deterministic, event-sourced, adversarially tested. Every dollar has a reason code; every exploit class is hunted by bots before humans find it |
| T6 | **Adversarial depth** | Humans and AI attack, defend, litigate and regulate each other inside rules that make crime a priced business, not a mugging |

Existing vision, scored against these: T5 and T6 are already near-best-in-class. T1 and T2 are the biggest opportunity. The existing docs model *assets* well and *institutions* thinly: there is no banking system, no clearing house with a default waterfall, no securitization, no credit derivatives, no fund-structure plumbing. Parts 3 and 4 add them.

---

## Part 2 — The architecture that makes depth possible: one balance-sheet world

Advanced finance only works if everything sits on the same foundation. v3 makes this explicit as the engine's first law.

### 2.1 Every actor has a balance sheet
Players, NPC households, firms, banks, funds, insurers, the central bank, the clearing house, governments. Assets, liabilities, equity. No money appears or disappears except through a **tagged faucet or sink** (your existing reason-code rule, extended to every institution). Net worth is *derived* from the balance sheet, never stored.

### 2.2 Double-entry ledger as the primitive
Every transfer is a pair of entries with a reason code and a tick. Credit creation is a pair of entries too: a bank making a loan creates a deposit. This single choice is what lets a banking system, a bank run and a money-supply stabilizer all exist honestly in the same world.

### 2.3 Consolidated accounting (your I06, made structural)
Holding structures consolidate. Intercompany payments net out, so a holding company cannot duplicate net worth. Minority interests, related-party rules and tax treatment follow from the same statements. Company financials (income statement, balance sheet, cash flow) are real outputs that filings, earnings and valuation read.

### 2.4 One macro state, many transmission channels
Rates, inflation, growth, risk appetite, credit conditions and FX regimes drive every asset through explicit channels (duration, credit spread, funding cost, collateral value, FX translation). A rate hike must visibly hit bonds, mortgages, growth stocks, bank margins, property cap rates, carry trades and leveraged funds on the same tick, for explainable reasons.

### 2.5 Determinism and event sourcing (kept, extended)
State is a fold over sealed intents plus entropy commits. Any cascade can be replayed tick by tick. This is what makes the new institutions auditable and the "Truth Machine" (Part 8) possible.

---

## Part 3 — The institutional layer (new): the machinery of finance

Each module below plugs into the balance-sheet world. Each has a player-facing role, an NPC baseline, and an exploit note. All names are fictional.

### 3.1 Banking and credit creation
- **NPC banks** take deposits, make loans, hold reserves, and face capital rules. A bank's lending is limited by capital ratios and funding. Loan losses eat capital. Weak banks fail.
- **Player banks** (a late-game business): charter a bank, set a lending policy, price credit, manage liquidity. You earn net interest margin and fees, and you carry duration risk, credit risk and **run risk**.
- **Interbank market:** banks lend reserves overnight at a rate near the policy rate. A freeze here is a real crisis channel.
- **Bank runs:** depositor confidence is a state variable fed by losses, rumors and the Wire. A run is a feedback loop, can be stopped by the central bank facility or by a rescue merger, and leaves a permanent public record.
- **Credit cycle:** lending standards loosen in booms and tighten in busts. This is the engine behind your existing "recessions are caused, not random."

### 3.2 Central banks and sovereign debt
- Five blocs, each with a central bank following a Taylor-rule base plus a hidden personality (your design), now with real tools: policy rate, reserve requirements, standing facilities, asset purchases (QE/QT), forward guidance.
- **Sovereign bond markets:** governments issue debt with a fiscal state. Deficits, debt-to-GDP and rollover risk drive spreads. A sovereign can be downgraded and, in the extreme, restructure. EM blocs can face currency and debt crises together (your SRL crisis, now causally grounded).
- **Rating agencies (NPC, then player-influenceable):** ratings move spreads and trigger collateral and mandate rules. Cliff effects create gameplay.

### 3.3 Clearing house, margin and the default waterfall
- Cleared products (futures, options, perps, repo) pass through a **central counterparty (CCP)**. Initial and variation margin, margin calls, and a **default waterfall**: defaulter's margin, then the defaulter's fund contribution, then a CCP capital layer, then mutualized fund contributions from surviving members.
- Whales who become clearing members take on mutualized risk; a large default can hurt well-run participants. This is the real source of systemic fear, and it gives the late game a genuine "too big to fail" tension.
- **Procyclical margin:** margin requirements rise with volatility. In a crash this forces deleveraging, which deepens the crash. It is emergent, not scripted, and it is the cleanest cascade in the game.

### 3.4 Repo, securities lending and prime brokerage
- **Repo market:** borrow cash against collateral with a haircut. Funding liquidity becomes a distinct risk from market liquidity. Collateral quality and haircuts matter.
- **Securities lending:** the supply side of your short-borrow model. Lenders earn fees; recalls cause squeezes.
- **Prime brokers (NPC and player):** provide leverage, custody and financing to funds. Cross-margining, margin tiers and prime-broker failure are real events.

### 3.5 Securitization and structured credit
- Pools of player and NPC **mortgages and loans** can be packaged by player-owned issuers into tranches (senior, mezzanine, equity). Rating agencies rate them; models for default correlation drive tranche prices.
- The game gets its own possible **2008-style event** from rules: underwriting standards drop, ratings inflate, correlation turns out higher than modelled, tranches reprice, funding freezes. Because it emerges from player and NPC behaviour, it can be prepared for, exploited or averted.
- **CDS and credit derivatives:** protection on names and tranches, priced from default probabilities. Protection buyers and sellers form a real market with counterparty risk through the CCP.

### 3.6 Funds, ETFs and market makers
- **ETF creation/redemption:** authorized participants (NPC, then players) arbitrage ETF price against NAV by creating and redeeming baskets. ETF flows move underlying prices; liquidity mismatches in a crisis cause real discounts.
- **Player funds** (approved idea): hedge, long-only, fund-of-funds, with your existing safeguards (custody, mandate, gates, high-water mark, first-loss manager stake). Fund strategy classes (macro, relative value, event-driven, quant, credit) each have distinct risk and capacity.
- **Market making as a player business:** quote two-sided markets, manage inventory and adverse selection, earn spread. Rebates and obligations come from the exchange concession.

### 3.7 Corporate finance, M&A and private markets
- **LBOs:** acquire a company with debt, with covenants, cash sweeps, interest cover and refinancing risk. Success depends on operations, rates and the credit market together.
- **Venture and growth equity:** your power-law startup model, now with preferred shares, liquidation preferences, dilution and down-rounds.
- **Activism and proxy fights:** accumulate a stake, demand changes, win board seats. Targets can respond with defenses.
- **Restructuring and bankruptcy:** debt-for-equity swaps, creditor classes, absolute priority, distressed investing. A bankrupt company is a market, not just a delisting.
- **Tax structuring across fictional jurisdictions:** transfer pricing, holding locations and tax treaties. Legal planning is rewarded; abusive evasion is prosecuted. Auditors, tax advisors and regulators make this a real cat-and-mouse system.

### 3.8 Insurance and reinsurance
- Your existing insurers, deepened: reserving, catastrophe exposure, **reinsurance**, **catastrophe bonds**. A hurricane, a cyber pandemic or a war event produces losses that propagate to insurers, reinsurers and bond holders.

### 3.9 Commodities and physical markets
- Beyond spot and futures: **storage, shipping and basis**. Own a tank farm and profit from contango; own a fleet and profit from freight spikes. Physical logistics link commodities to your Logistics and Energy businesses. Compute, Data and Energy remain game-native commodities with the supply sides you already specified.

### 3.10 Crypto and DeFi, as a real parallel financial system
- **AMMs and pools** with impermanent loss, **lending protocols** with liquidations, **stablecoin design** (collateralized, algorithmic) where depegs and death spirals can emerge, **bridges and exchanges** as attack surfaces, and **MEV-like effects** adapted to the batch auction (ordering within a tick is fixed by rule, so the game explores what remains: sandwiching across ticks, oracle manipulation, liquidation sniping).
- Player-launched tokens remain gated and heavily policed, as you decided.

### 3.11 Politics, regulation and lobbying (your P05, made concrete)
- Sector policy, tax bills, capital rules and trade policy are decided by NPC institutions responding to public conditions and to lawful lobbying. Wealthy players can lobby; bribery is a separate crime. Rules a player helped change then apply to everyone, including them.

### 3.12 Sovereign-scale endgame ("Dynasty" content)
The top of the ladder shouldn't just be a bigger number. Dynasty-tier players can: found a **bank**, found a **sovereign wealth fund**, sponsor a **central-bank-adjacent institution** (a private clearing house, an exchange concession), underwrite **government debt**, and shape policy. The endgame is a game about **running part of the financial system**, with systemic responsibility and systemic risk.

---

## Part 4 — The trader's toolkit: an expert platform inside the game

Your vision says quantitative traders, stock and crypto traders, company builders and macro enthusiasts should each find real depth (D01). v3 makes the expert platform a first-class feature.

- **Pro terminal:** full depth of book (from the batch-auction information that is legitimately public), order types including icebergs, TWAP/VWAP and participation algos, execution analytics with slippage versus declared benchmarks (T09).
- **Quant research lab:** a notebook-like environment on **historical and withheld worlds**. Build factor models, signals and portfolio construction rules, backtest with realistic costs and impact, and validate on withheld seeds. Backtests cannot see the future randomness of the live world.
- **Risk analytics:** VaR and expected shortfall, factor exposures, scenario and stress tests against the world's *own* history of crises, correlation under stress, liquidity-adjusted risk, margin forecasts.
- **Strategy graphs and the API:** strategies are built from blocks (no arbitrary user code on the server, your rule), with an official **read/write API for intents** under the same rate limits as the UI, so serious quants can drive the game programmatically through the same door.
- **Macro desk:** yield-curve, inflation-swap, FX-forward, carry and cross-asset relative-value views. Positions are real instruments with real funding costs.
- **Credit desk:** loans, bonds, CDS, tranches, distressed claims.
- **Execution and crowding awareness:** your A06 principle, derived from mechanism: alpha decays because capital and rivals crowd in, impact rises, and counterparties adapt, not because of a universal timer.

For everyone else, the **delegation spine** (set a mandate, hire an operator, review exceptions) lets a player participate across branches without being an expert in all of them. It is an *access* feature layered on the same rules, not a simplification of the economy.

---

## Part 5 — AI research, deepened (your pillar, extended)

The existing tree (compute × data × algorithm → MCS) stays. v3 deepens what AI *is* inside a financial world.

- **Alpha is a market phenomenon, not a stat.** A model's edge comes from information it captures that others don't. When many deploy similar models, the information is priced in; capacity shrinks; impact rises. Edge decays through crowding, which the engine already measures through aggregate flow.
- **Research pipeline with real stages:** hypothesis, data acquisition (with provenance and legal tags), feature engineering, training, **out-of-sample evaluation on withheld worlds**, paper trading, staged capital deployment, monitoring, retirement (A05, A07, A10).
- **Specialist and general models:** a cheap capable specialist vs. an expensive broad model, with different uses (A02). Model ensembles, distillation for cost reduction, and fine-tuning on your own data.
- **Adversarial markets for models:** your approved weekly tournament, plus **model arenas** where models trade against each other in a shared seeded market, so impact and crowding matter.
- **AI in operations:** forecasting demand, pricing, inventory and capacity for your businesses (I05), always through supported operating decisions with explained effects.
- **Alignment, safety and governance:** incidents, regulator registration rules, audit obligations and "trusted lab" reputation as in your 05. Regulation of AI trading becomes part of the political layer.
- **Information supply chain:** data acquisition deals, exclusives, canaries and watermarks, and the data exchange with its provenance trail connect AI directly to law and crime.

---

## Part 6 — Conflict, law and counter-intelligence (kept in full, extended)

Your Pillar 3 is already a complete system: attack surface, 12 cyber ops and 8 espionage ops, resolution math, hidden sessions, detection vs attribution, evidence, courts, regulators, insurance, 14 non-hacking takedowns, anti-grief, a balance harness. v3 keeps all of it and adds only things that deepen its tie to the financial layer.

- **Market-structure attacks and defenses** as first-class conflict: squeezes, spoofing, layering, ramping, stop-hunting and short-and-distort campaigns (K01–K07), with surveillance, rebuttals, covering pressure and delayed legal liability (S05).
- **Financial forensics:** following the ledger. Tracing funds through shell structures, funds and trusts is an investigator's craft (private-intelligence firms), and the double-entry ledger makes it fair and deterministic.
- **Collective actions:** class actions, shareholder suits and derivative suits against managers, fund managers and issuers.
- **Arbitration and private justice:** contract clauses can elect arbitration; reputation of arbiters is a player-run market.
- **Regulatory enforcement ladders** per regulator, with consent decrees, monitors and licenses revoked for the financial institutions of Part 3.
- **Whistleblower economy:** deepened with protected disclosures and bounty rules (your 5% pool), with anti-fabrication guarantees (evidence only comes from ledger-generated sources).
- **Counter-intelligence for the institutional layer:** compromised clearing members, poisoned oracles, rigged ratings and bribed analysts are all prosecutable and defendable.

Hidden sessions stay exactly as you specified, including the 0.85 ceiling, offline slowdown, decoys and the defense-AI auto-scan table.

---

## Part 7 — The living world, in full (your section 2 W01–W11, taken seriously)

You asked for a world that lives without the player. v3 doesn't shrink that; it specifies it as a layered agent economy.

- **Layer 1, aggregate base economy:** households, small firms and public institutions modelled in aggregate (labor, consumption, savings, housing demand), driving the NPC GDP the player-visible markets sit on.
- **Layer 2, named actors:** a large roster (hundreds, growing with the world) of banks, funds, dynastic families, founders, regulators, suppliers and lenders, each with resources, goals, relationships and memory. Their decisions respect their balance sheets (W04).
- **Layer 3, dynasties and institutions (P01–P08):** fictional families with interests across banks, media, shipping and industry. Ownership links are discoverable through filings, research, conversation and espionage. They have limits, rivals, debts and internal disputes, and succession events reshape the map.
- **Causal news and consequences over time (W05, W09):** every headline is generated from a real state change, and consequences propagate on different schedules (a plant closure hits employment, then occupancy, then supplier revenue, then credit risk). The causal graph is recorded so later explanations can trace what happened.
- **World history and archive (W10):** public mergers, bankruptcies, discoveries and feuds persist. Returning players find familiar actors in changed circumstances.
- **Authored secrets with substance (P07):** hidden archives and old correspondence mixed with discoveries that emerge from real ownership history. Mechanically useful secrets always have provenance and counterplay.
- **Optional language layer (B09):** models may write news and character dialogue from authorized facts. They can never create economic truth; every suggested deal is validated by the simulation.

---

## Part 8 — The Truth Machine: verification at the scale of the ambition

A game this advanced is only credible if it can be **proven** honest. v3 turns your Part VII validation section (B01–B11) into infrastructure.

- **Invariant engine:** conservation of money across all balance sheets every tick, no negative equity without a recorded event, collateral never double-pledged, ownership consistent. Any violation halts the partition and files a reproducible case.
- **Adversarial agent swarm:** thousands of bots (honest, greedy, colluding, criminal, quant, whale) run continuously against staging worlds with only player-level permissions, hunting exploits across every institution in Part 3.
- **Population experiments (B04, B05):** vary population, wealth and shocks to measure dominance, entry, wealth concentration and crisis frequency. Adaptive rival strategies are added over time so frozen bots can't hide a broken market.
- **Withheld worlds and regression seeds (B06):** strategies are developed on some seeds and judged on others. Every failure is saved as a permanent regression.
- **Evidence categories (B07):** unit tests, model calculations, engine simulations and human playtests are reported separately and never confused.
- **Crisis calibration (B11):** extreme-value statistics (including generalized extreme value fitting) as a tool for tail calibration of shocks and loss distributions, not as the engine's intelligence.
- **Public integrity report:** a diegetic "Stabilizer and Exchange" report publishes money supply, systemic risk indicators and exploit-fix history. Trust is a feature.

---

## Part 9 — Experience, status and identity (kept in full)

Everything in your Pillar 4 stays: seven ranks, the UI shell that upgrades with wealth, the ~45-item lifestyle catalog, Prestige, Reputation and Notoriety, clubs, hosting, the Gilt List, chapter portraits, Ink & Brass. v3 adds:

- **Institutional identity:** your bank's building, your fund's track record, your exchange concession, your dynasty's crest. Wealth turns into **responsibility and presence** at the top, not just consumption.
- **Legacy thread:** founding plaques, chapter portraits, a tower that keeps your name after you leave the board, a permanent public history. A world that never resets must remember.
- **Expert identity:** verified track records, published research (opt-in), model lineage and fund history as reputational capital.
- **The cities:** `06-cities` stays on the roadmap in full. The proposal's advice (addresses, permanence, public-event-driven change, privacy as a publication contract) is adopted as the design contract for it.

---

## Part 10 — Multiplayer and the world at scale (kept, extended)

Your Pillar 5 stays whole: one persistent world, invisible partitioning, 5-second batch auction, leagues and alliances, typed-clause contracts with escrow, public filings, anti-cheat, three screens from one codebase. v3 extends it for the new institutions:

- **Institutions as multiplayer surfaces:** player banks, funds, clearing memberships, exchanges and syndicates all use the contract engine and escrow.
- **Systemic-risk dashboards** visible to everyone (aggregate leverage, funding stress, margin utilization, CCP default fund usage), so crises are readable in advance by players who study them.
- **Alliances as institutions:** consortia, syndicates and "houses" that can jointly own a bank, an exchange concession or a fund.
- **The partitioned engine** gains institution-aware routing: a bank run or a CCP default is a cross-partition event ordered by the same hold-and-settle rules.

---

## Part 11 — Build order (this is sequencing, not scope)

Nothing above is cut. Build order only answers "what must exist before what else can be built."

1. **Foundations:** the balance-sheet world, double-entry ledger, consolidated accounting, the pure deterministic engine, the Truth Machine's invariant checks. Everything else sits on this.
2. **Core markets and businesses:** the explainable price engine, batch auction, businesses, real estate, news and macro. (Mostly specified already.)
3. **Institutional layer, bottom-up:** banking and credit → central bank tools and sovereign debt → clearing house and margin → repo and prime brokerage → funds/ETFs → securitization and credit derivatives → corporate finance and private markets → insurance → DeFi.
4. **The expert platform:** pro terminal, research lab, risk analytics, strategy graphs and API.
5. **AI lab and the adversarial layer:** the tree, trading AIs, cyber, hidden sessions, courts, regulators, extended to the institutions.
6. **The living world:** named actors, dynasties, history and archive.
7. **Multiplayer at scale, then native apps.**

Each stage ends with its own Truth Machine gate. The earlier roadmap's phase order (solo depth, then AI, then online) remains valid as one route through this; the one hard change I recommend is to treat **solo as a non-competitive sandbox** (the seed lives in the save, so ranked or shared challenges before an authoritative server are cheatable). That protects the competitive integrity of the advanced game; it removes no feature.

---

## Part 12 — Honest assessment of v3

**Strengths against the standard in Part 1**
- T1 and T2 go from thin to the centre of the design: a real credit system, clearing and default waterfall, securitization, funds and ETFs, corporate finance, insurance, DeFi and sovereigns, all on one ledger.
- T3: a quant, a macro trader, a credit investor, a founder and a banker each get a genuine ceiling.
- T5 and T6 keep the strongest parts of the existing vision and gain infrastructure (the Truth Machine) proportional to the ambition.

**Real risks of an ambition this large (stated, not used to trim)**
- **Interlock complexity:** more institutions mean more cascade paths. The mitigation is the invariant engine and the adversarial swarm, built before each module ships, not after.
- **Calibration burden:** credit cycles, default correlation and margin dynamics need long simulation campaigns before they feel right.
- **Comprehension:** the ceiling is high, so the floor must stay legible. The delegation spine and progressive disclosure are non-negotiable parts of the design, not concessions.
- **Compute cost:** a richer world costs more per tick. Aggregation for background actors (W11) and partitioned execution are the levers.

**On the earlier "9.5/10" target.** I will not claim a number for v3 that I assign myself. The honest statement is that v3 is built to the six tests in Part 1 and keeps your full vision intact. If you want a score, have an independent reviewer grade it against Part 1.

---

## Part 13 — Questions that shape the next iteration (answer any, in any order)

1. Should **player banks and exchange concessions** be reachable earlier than Dynasty rank, as mid-game goals?
2. How realistic should **credit losses and bank failure** be for players: can a player bank fail permanently, or does it always restructure (with a record)?
3. Should the **expert API** be public from the start of online play, or unlocked by rank and reputation?
4. Do you want **real-world-inspired crisis templates** (a 2008-style securitization event, a repo run, a sovereign default) as named, replayable scenarios, or only emergent ones?
5. For **tax and jurisdictions**, how deep: a few fictional regimes with treaties, or a full planning game?

*End of Vision v3.*
