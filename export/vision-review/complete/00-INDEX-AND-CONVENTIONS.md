# Complete Game Specification — Index and Conventions

Project: the trading game (working title **TYCOON**). Owner: Mathis. Written 2026-10-18.
Status: **complete design specification**. Every system of the game is specified here, with entities, rules, formulas, default parameters, player actions, events, screens, edge cases, exploits and acceptance tests. Nothing is left "for later". Where a choice had to be made, a default is chosen and marked `DEFAULT (Mathis may override)`; it is still a decision the builder follows.

This specification supersedes the direction of Vision v2. It builds on the original `/vision` folder (all of Mathis's decisions are kept) and on Vision v3 (the institutional finance layer), and it completes both.

---

## 1. Reading order

| # | File | What it specifies |
|---|---|---|
| 00 | `00-INDEX-AND-CONVENTIONS.md` | This file: reading order, conventions, units, IDs, the module template, glossary |
| 01 | `01-EVALUATION-OF-V3.md` | What V3 got right, every gap that stopped it being buildable, and how this spec closes each one |
| 02 | `02-TIME-ENGINE-CORE.md` | Clock and calendar, tick pipeline, determinism, RNG streams, fixed-point math, the `step()` contract, snapshots, replay |
| 03 | `03-LEDGER-AND-ACCOUNTING.md` | Entities, balance sheets, chart of accounts, double-entry ledger, reason codes, faucets and sinks, consolidation, taxes, financial statements |
| 04 | `04-MACRO-CENTRAL-BANKS-SOVEREIGNS.md` | Regions and blocs, macro state, business cycle, inflation, central banks and their tools, fiscal policy, sovereign debt, ratings, FX regimes, crises |
| 05 | `05-MARKETS-PRICE-ENGINE.md` | Market microstructure: batch auction, order types, NPC liquidity, impact, price model, sessions, halts, surveillance features |
| 06 | `06-ASSET-CLASSES.md` | Every tradeable asset: equities, ETFs, bonds, FX, commodities, crypto and DeFi, derivatives (options, futures, perps, swaps, CDS), collectibles |
| 07 | `07-BANKING-CREDIT-CLEARING.md` | Banks and credit creation, interbank, deposits and runs, lending, repo, securities lending, prime brokerage, the clearing house and default waterfall, margin |
| 08 | `08-FUNDS-STRUCTURED-INSURANCE.md` | Player and NPC funds, ETFs (creation/redemption), securitization and tranches, rating agencies, insurance and reinsurance, cat bonds |
| 09 | `09-BUSINESSES-AND-COMPANIES.md` | The business catalog, demand and market share, operations, upgrades, staff, supply chains, contracts with NPC customers, company building, corporate finance, IPOs, M&A, LBOs, restructuring |
| 10 | `10-REAL-ESTATE-AND-CITIES.md` | Cities and districts, property economics, mortgages, development, management, the city map, addresses, growth, the procedural city |
| 11 | `11-AI-LAB.md` | Compute, data, algorithms, training, evaluation, deployment, model products, strategy graphs, crowding, AI operations, AI governance |
| 12 | `12-CONFLICT-AND-INTELLIGENCE.md` | Attack surface, abstract cyber and espionage ops, resolution math, hidden sessions, defense, detection, honeypots, market-conduct conflict |
| 13 | `13-LAW-COURTS-REGULATORS.md` | Evidence, investigation, courts, verdicts, sanctions, Held, appeals, regulators, surveillance, whistleblowers, insurance claims, anti-grief |
| 14 | `14-PLAYER-PROGRESSION-LIFESTYLE.md` | Account and character, ranks, licenses, the shell, lifestyle catalog, Prestige, Reputation, Notoriety, clubs, hosting, Legacy, dynasty succession |
| 15 | `15-MULTIPLAYER-SOCIAL.md` | One persistent world, partitions, boards and leagues, seasons/chapters, alliances, contracts, filings, chat, the Wire, spectating, challenges, anti-cheat |
| 16 | `16-LIVING-WORLD.md` | Aggregate economy, named NPC actors and their decision models, dynasties, politics and lobbying, causal news, world history, eras and technology, secrets |
| 17 | `17-UX-SCREENS-DESIGN-SYSTEM.md` | Navigation, every screen with its components and states, design tokens, motion, sound, accessibility, localization |
| 18 | `18-ONBOARDING-ACADEMY.md` | First session minute by minute, just-in-time introductions, the Academy, help, explainability ladder |
| 19 | `19-TECH-ARCHITECTURE.md` | Monorepo, packages, server processes, data model (tables), protocol (intents and deltas), API, persistence, scaling, security, observability |
| 20 | `20-VERIFICATION-AND-BALANCE.md` | The Truth Machine: invariants, unit/property tests, simulation harness, adversarial bots, balance bands, regression seeds, release gates |
| 21 | `21-LIVEOPS-ADMIN-MONETIZATION-COMPLIANCE.md` | Admin console, live events, patches, support, moderation, cosmetics store and pass, rewarded ads, privacy, age rating, store compliance |
| 22 | `22-CONTENT-CATALOGS.md` | Every named thing: blocs, cities, districts, companies, tokens, commodities, businesses, lifestyle items, NPC actors, news templates, titles |
| 23 | `23-PARAMETER-REGISTRY.md` | Every tunable number in one table: key, default, range, unit, owner module, what it affects |
| 24 | `24-DECISIONS-REGISTER.md` | Every design decision with its status: Mathis's locked calls, resolved defaults, and the few items that need Mathis's explicit yes before launch |

A builder implements modules in the dependency order given in `19-TECH-ARCHITECTURE.md §12` (the module graph). The later build plan is derived mechanically from the "Acceptance tests" sections of each module.

---

## 2. Locked decisions (from Mathis; never changed by this spec)

| ID | Decision |
|---|---|
| L1 | One single persistent world. No resets, no visible shards. Global, country and seasonal-ladder boards. Partitioning is invisible |
| L2 | Breach-chance floor is 1% |
| L3 | Hacking uses **hidden sessions** that accumulate progress (ceiling 0.85) until noticed and disconnected; offline slows accrual; defense AI auto-scans by tier |
| L4 | Visual direction **Ink & Brass**, with the Shadow sub-palette for Lab and Security |
| L5 | Age rating 16+. No gambling mechanics |
| L6 | Fully fictional brands, companies, cities, currencies, institutions |
| L7 | Monetization: cosmetics and a cosmetic season pass only. Never touches money, Prestige, rank or odds. No loot boxes |
| L8 | English first, French second, string keys from day one |
| L9 | 1 real hour = 1 game day |
| L10 | Derivatives, IPOs and takeovers are in, gated behind late licenses. Player-launched tokens later. Prediction/event markets and vice businesses are out |
| L11 | Nothing automatically leaks a player's strategy, style or holdings. Disclosure only by opt-in, legal filing rule or in-game espionage |
| L12 | Rewarded ads for broke players: $250 per ad, max 10/day, only under $1,000 net worth, ad cash cannot fund ops immediately |
| L13 | Approved ideas: player IPOs, player funds, honeypot models, weekly AI tournament, NPC rival funds, shared world events, rumors and tips, bankruptcy comeback, trade journal, "Why it moved" ladder and Research Desk, company building |
| L14 | The vision is the source of truth; the game is rebuilt from scratch around it (older code and saves are ignored) |
| L15 | Scope is the full ambition: the most advanced financial game. No pillar is cut |

---

## 3. Conventions used in every module

### 3.1 Units

| Quantity | Engine representation | Display |
|---|---|---|
| Money | `Money` = signed integer **micro-dollars** (1e-6 FDL) stored as `bigint` | `$` with grouping; abbreviate ≥ $10,000 in lists (`$12.4k`, `$3.21M`, `$1.05B`, `$4.2T`); full precision on hover |
| Other currencies | `Money` in micro-units of that currency, always paired with a currency code | ISO-like fictional code (`FDL`, `EUN`, `NKR`, `PYN`, `SRL`) |
| Prices | `Price` = integer micro-units per unit of asset (`bigint`) | 2 decimals for equities/FX majors ≥ $1, 4 for FX, 6–8 for crypto, per asset `displayDecimals` |
| Quantities | `Qty` = integer in the asset's base lot (`bigint`), each asset defines `lotSize` and `qtyDecimals` | per asset |
| Rates and returns | `float64` inside model math; persisted as integer **basis points × 100** (1e-6) where they enter the ledger | `%` with sign, 2 decimals |
| Probabilities | `float64` in [0,1] inside model math | `%` |
| Time | `Tick` = integer since world genesis | game calendar (02 §2) |
| Compute | integer **PFLOP-days × 1000** in engine; display GPU-hours (`1 PFLOP-day = 10 GPUh`) | GPUh |
| Energy | integer kWh | MWh |
| Data | DQU as `float64`, persisted ×1000 integer | DQU |

**Rounding rule.** All model math runs in `float64` and is converted to integers only at ledger boundaries, using round-half-to-even. Every conversion goes through one function `toMoney(x: number, ccy): Money`. No other code converts floats to money.

**Overflow rule.** Money is `bigint`, so there is no overflow. Values crossing the protocol are serialized as decimal strings.

### 3.2 Identifiers

`<kind>_<base32 ulid>` for persistent entities, e.g. `chr_01H…`, `biz_01H…`, `ast_EQ_HALC` for authored assets. IDs are generated deterministically inside the engine from `hash(worldSeed, kind, creationTick, sequence)` so replay yields identical IDs. Public-facing IDs that must not leak creation order (connection entries, see 12) use a separate rotating random label.

### 3.3 Module template

Every module file uses the same sections, in this order:

1. **Purpose** — what the system is for in the game.
2. **Entities** — TypeScript-style type definitions, the exact fields stored.
3. **Rules and formulas** — the full logic, step by step, with defaults.
4. **Player intents** — every action a player can submit, its validation and its effect.
5. **Engine events** — what the system emits (for ledger, news, UI, court evidence).
6. **NPC behaviour** — how non-player actors use the system.
7. **Screens** — where the player sees and drives it (detailed layouts in 17).
8. **Edge cases** — explicit handling of boundary conditions.
9. **Exploits and counters** — how players could abuse it, and the rule that stops it.
10. **Acceptance tests** — numbered, checkable statements the build must satisfy.

### 3.4 Notation

- `σ(x) = 1/(1+e^(−x))`. `clamp(x,a,b)`. `ln` natural log. `log2`.
- `dt` in formulas means one tick expressed in game years: `dt = 1 / TICKS_PER_GAME_YEAR` (02 §2).
- "Game day" = 1 real hour = 720 ticks. "Real day" = 24 game days.
- `NW` net worth, `NWI` Net Worth Index, `N_a` activity-weighted players.
- Parameter keys appear as `PARAM.name` and are all listed in 23.

### 3.5 Writing for a builder

Every rule in this spec is written so it can be implemented without asking a question. When a rule says "default", the builder uses that value. When a rule depends on a number from another module, it cites it (`→ 07 §3.2`). If a builder finds a contradiction, the precedence is: **24 Decisions register > the module that owns the system > 23 Parameter registry > any other text**.

---

## 4. Glossary (core terms)

| Term | Meaning |
|---|---|
| Tick | One 5-second step of the world (= 2 game minutes). Everything resolves on ticks |
| Intent | A player or AI request (order, purchase, op, contract) submitted to a tick |
| Batch auction | Each tick, all orders on an asset clear at one uniform price |
| Character | A player's in-world identity: money, assets, record. One per account |
| Entity | Anything with a balance sheet: character, company, fund, bank, NPC actor, government, institution |
| NW / NWI | Net worth; Net Worth Index = NW ÷ world money-supply index (the ranking metric) |
| Faucet / Sink | A ledger flow that creates / destroys money in the player economy |
| Transfer | A flow between entities that neither creates nor destroys money |
| CCP | The Clearing House, the central counterparty for cleared products |
| MCS | Model Capability Score, the scalar capability of an AI model |
| DU | Decision unit: the server CPU budget for one AI evaluation of one signal on one symbol |
| AP / DP | Attack Power / Defense Power in the conflict system |
| Hidden session | A concealed connection planted by a successful quiet op that accrues progress until disconnected |
| Rank | R0 Broke … R6 Dynasty, from net worth |
| License | Gate for asset classes and institution types |
| Chapter (season) | 8 real weeks; frames ladders, events and concessions; nothing resets |
| Shell | The interface's material theme, upgraded with rank |
| Prestige / Reputation / Notoriety | Status from lifestyle; trust from clean conduct; fame from crime |
| Legacy | The permanent public record of what a player built |
| Mandate | A delegation contract: the rules an operator (manager, model, algo) must follow |

---

## 5. Cross-module contracts (binding on every module)

These are the shared shapes every module plugs into. A module may add detail but never contradict them. Owners are named; the owner's file holds the full definition.

### 5.1 Time (owner 02)

| Constant | Value |
|---|---|
| `TICK_REAL_SECONDS` | 5 |
| `TICKS_PER_GAME_DAY` | 720 (= 1 real hour, L9). One tick = 2 game minutes |
| `TICKS_PER_GAME_HOUR` | 30 |
| Game week | 7 game days: 5 trading days (Mon–Fri) + weekend (Sat, Sun) = 7 real hours |
| Game month | 4-4-5 week pattern per quarter (28/28/35 game days) |
| Game quarter | 13 weeks = 91 game days |
| `GAME_DAYS_PER_GAME_YEAR` | 364 (52 weeks) ≈ 15.17 real days |
| `TICKS_PER_GAME_YEAR` | 262,080 |
| Chapter | 8 real weeks = 56 real days = 1,344 game days ≈ 3.69 game years |
| Real day | 24 game days |

Daily phases of a trading day (tick-of-day `t`): pre-market `0–59` (orders queue, no equity matching; FX and crypto trade), **opening auction at t = 60**, continuous session `61–539` (480 ticks = 40 real minutes), **closing auction at t = 540**, after-hours `541–719` (FX, crypto, perps and futures on 24h products only). Weekends: equities, bonds, ETFs, options closed; FX closed Sat 00:00 to Sun 22:00 game time; crypto, perps 24/7. Each bloc's equity exchange keeps the same phase clock (the world has one clock; regional time zones are cosmetic labels only). Accruals (interest, rent, wages, fees) post at **day close (t = 719)**; business operations run **once per game hour, staggered by entity id** (`hash(id) mod 30`).

### 5.2 Tick pipeline order (owner 02; every module names its phase)

```
P0  ingest     : intents received during the previous 5 s are sealed (commit) and ordered
P1  validate   : each intent checked against licenses, holds, Held state, balances, rate limits
P2  calendar   : day/week/quarter/year/chapter boundary hooks (04 macro step runs at day close)
P3  world      : living-world scheduler (16): events, news generation, named-actor decisions
P4  npc        : NPC liquidity and NPC actor orders (05, 16)
P5  ai         : player AI strategy graphs within DU budgets (11)
P6  match      : per-asset uniform-price batch auctions (05), OTC/RFQ fills (06)
P7  clear      : CCP novation, margin, variation margin, liquidations, default waterfall (07)
P8  finance    : banking, repo, lending, funds NAV, insurance, structured products (07, 08)
P9  real       : businesses, real estate, cities, supply chains (09, 10), hourly-staggered
P10 conflict   : ops, hidden sessions, scans, detection rolls (12)
P11 law        : investigations, filings, court progress, sanctions application (13)
P12 social     : contracts engine checks, alliances, reputation, prestige, boards (14, 15)
P13 ledger     : all postings of the tick committed atomically; invariants asserted (03)
P14 emit       : events to event store, deltas to clients, snapshot if due (02, 19)
```

Rule: a system may read any state committed by earlier ticks and the outputs of earlier phases of the same tick; it writes only its own entities plus ledger postings queued for P13. Postings never commit before P13. If any invariant fails in P13, the tick is rolled back and replayed in safe mode (02).

### 5.3 Entity kinds (owner 03)

`chr` character, `cmp` company (legal entity; may be listed), `biz` business unit (operating asset owned by a cmp or chr), `prop` property, `fnd` fund, `bnk` bank, `ins` insurer, `spv` securitization vehicle, `gov` sovereign treasury, `cbk` central bank, `ccp` clearing house, `exc` exchange, `rat` rating agency, `reg` regulator, `crt` court, `npc` named NPC actor (person or institution), `hh` aggregate household sector (one per city), `frm` aggregate non-financial firm sector (one per bloc), `row` rest-of-world sink/source (one, for accounting closure), `ali` alliance treasury, `sys` system accounts (faucets, sinks, stabilizer). Every entity has exactly one balance sheet in 03's chart of accounts and one `ownerId` chain ending at a `chr`, an `npc`, a `gov` or `sys`.

### 5.4 Ledger API (owner 03)

Every money or asset movement is a `Posting { tick, entryId, debitAccount, creditAccount, amount: Money, ccy, reason: ReasonCode, refs: Id[] }`. Each `ReasonCode` belongs to exactly one class: `FAUCET` (system creates base money for the player economy), `SINK` (system destroys it), `TRANSFER` (between entities, money-neutral), `CREDIT_CREATE` / `CREDIT_DESTROY` (bank lending and repayment, changes broad money M2 but not base money M0), `REVALUE` (mark-to-market, no cash). The Stabilizer (03, 04) acts only on FAUCET and SINK flows. Net worth uses marked values. No module moves money except by queuing postings.

### 5.5 Intent envelope (owner 19; validation per module)

`Intent { intentId, actorId (chr or the operator acting under a Mandate), kind, payload, clientTick, nonce, signature }`. Kinds are namespaced by module: `mkt.*`, `bank.*`, `fund.*`, `biz.*`, `prop.*`, `lab.*`, `ops.*`, `law.*`, `soc.*`, `life.*`, `acct.*`. Every module's "Player intents" section lists its kinds with payload and validation. Humans, player AIs and delegated managers use the same intents (fairness rule: no actor gets a private API). Rate limit default: 20 intents per tick per character (shared by its UI and API channels), plus 20 intents per tick per operator (a delegated manager or deployed AI acting for it under a Mandate), with at most 100 intents per tick combined for the character and all its operators (`PARAM.intents_per_tick_per_actor = 20`, `PARAM.intents_per_tick_per_principal = 100`, 19 §3.8.6; ruling in 24); 2,000 DU per tick for AI (RESOLVED-NUMBERS A1).

### 5.6 Event envelope (owner 02/19)

`EngineEvent { tick, seq, kind, subjectIds, payload, visibility: PUBLIC | PARTIES | PRIVATE | SEALED }`. `SEALED` events are court evidence, revealed only by 13's discovery rules. Kinds are namespaced like intents. News (16), UI deltas (17), court evidence (13), boards (15) and the Truth Machine (20) all consume this one stream.

### 5.7 World shape (owners 04, 10, 16, 22)

- 5 blocs (Federal Union FDL reserve, Euran Compact EUN, Pacific League PYN, Nordic Alliance NKR, Southern Coalition SRL), each with one central bank, one treasury, one exchange, one regulator, one court system.
- 15 cities (3 per bloc) plus **Isla Serena**, a trophy archipelago with no bloc (FDL-denominated). Every city is a full procedural Living City (10) with 6–10 districts.
- Listed universe at launch: 400 tradeable instruments (exact list in 22); NPC companies 240 listed + private NPC firms generated per city.
- Named NPC actors: 600 at launch (22 lists the archetypes and the generator; 16 the decision models).
- Partition: up to ~25k agents (players + player AIs) per invisible partition; money crosses partitions by hold → settle (02, 19).

### 5.8 Shared enums

- Ranks `R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty` (14 owns thresholds).
- Licenses `LIC0 Cash, LIC1 Retail, LIC2 Pro, LIC3 Derivatives, LIC4 Institutional`, plus institution charters `CH_BANK, CH_FUND, CH_INSURER, CH_EXCHANGE_MEMBER, CH_CUSTODIAN` (13 owns requirements, 06/07/08 own what they unlock).
- AI tiers `T0 Laptop … T5 Hegemon` (11). Business tiers `B1 … B6` (09). Property tiers `working, mid, prime, trophy` (10).
- Severity `S1 … S6` (13). Visibility as §5.6.

### 5.9 Players' first state

Start cash $5,000 FDL, LIC0, R0, home city chosen among the 3 FDL-bloc cities, 72 real hours protection, Retail-broker grant $250 on first license (18).
