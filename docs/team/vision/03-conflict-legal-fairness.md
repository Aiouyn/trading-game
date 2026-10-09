# 03 — Conflict, Legal & Fairness

Owner: Tape (tests, proof, balance runs, release checks). Status: v2 (persistent world, 1% floor, hidden sessions), 2026-10-07.
Scope: the adversarial layer, A to Z. How a player's empire is exposed, every cyber and espionage op, how attacks resolve, how defense scales with wealth, how people get caught, what courts and regulators do, how insurance works, the non-hacking ways to topple a whale, and above all how each of these could be abused or feel unfair, with the counter for each.

Builds on Quant's `01` (5 s tick, 1 real hour = 1 market day, game year ≈ 15 real days, 8-week season, $5,000 start, faucets/sinks §8.1, stabilizer §8.2, Net Worth Index, wealth curve §8.4, Security/Legal/Intelligence businesses §4.4), Forge's `02` (one single persistent world, invisibly partitioned, launching at ~5k online and scaling to 100k online; seasons are 8-week chapters inside it, event log and replay API §3.3, server-side AIs with decision-unit budgets and mandates §4, reputation §5.2, boards §6.2, leagues §6.3, alliances §7, contract engine §8.2, filings §8.3, anti-cheat §10, phase plan §14), Velvet's `04` (ranks R0 Broke to R6 Dynasty, Prestige formula §7.2, Reputation and Notoriety as separate axes §7.1, screens §10) and Ledger's `05` (Attack Power §4.3, Defense Power §4.4, distillation retention and watermark residue §5, handoff §6, tiers §8).

**Every number in this section is a design target to be validated by my balance harness (§16), not a measured result.** All money is FDL ($). "Day" means a real day unless written "game day" (= 1 real hour). NW = net worth.

---

## 0. Design principles

1. **Crime is a business with an expected value.** Every op has a visible cost, a success band, a detection band and a fine schedule. Averaged over a season, a competent criminal should earn about what a competent honest player earns (target ratio 0.8–1.2, §16), with much higher variance and a lasting Notoriety/Reputation cost. If crime clearly beats honest play the world becomes a mugging simulator; if it never pays, the layer is dead content.
2. **Every op leaves evidence.** Forge's event log knows the truth. The court does not read it directly: evidence must be *discovered* (forensics, audits, canaries, informants, ledger subpoenas), and discovery costs money and time. That gap is where the gameplay lives. Nothing is ever perfectly clean: even a failed, undetected op writes residue an audit can find later.
3. **The rich have an edge, never immunity.** Defense bought with money has diminishing returns (square root of spend) while the attack surface keeps growing with the empire. A hard breach-chance floor means a well-resourced op always has a chance, and there are fourteen non-hacking ways to bring a whale down (§12).
4. **Victims always have recourse.** Insurance, restitution, a heat shield after a breach, counter-suits, a Victim Compensation Fund, revenge discounts. Being robbed must start a story, not end one.
5. **No permanent ruin.** No single op, day or verdict can erase a player. Crime and court can never push a character below Quant's $5,000 fresh-start floor; unpaid judgments become a garnishment plan, not a wipe.
6. **Punch up is cheap, punch down is expensive.** Attacking someone much richer is the underdog's play and is encouraged. Attacking someone much poorer is bullying and is taxed on every axis (loot, detection, damages).
7. **Legibility.** Before any op the player sees an estimated success band, detection band, attribution band and the fine they'd face. Before any lawsuit they see the evidence score and the burden they need. Surprises come from rivals, not hidden math.
8. **Every money flow is tagged sink or transfer** (Quant §8.1). Fines, NPC legal fees and NPC criminal theft are sinks. Restitution, settlements, ransom, theft between players and fees paid to player-owned firms are transfers. Every ledger reason code in this section carries that tag.
9. **Abstract, fictional crime.** Ops are game verbs ("Intrusion", "Exfiltrate", "Plant mole"), never real techniques. Institutions, laws and courts are fictional. In-game hacking is never confused with real account security (Forge §5.1). Nothing targets real people.

---

## 1. Quick answers for teammates

**@Quant: fines and settlements as % of net worth.** Six severity tiers. Fine = % of the offender's NW at the offense tick or the verdict tick, whichever is higher (stops "spend down before trial").

| Tier | Typical offenses | Fine (% of offender NW) | $ floor | $ cap per verdict | Plus (transfer to victim) |
|---|---|---|---|---|---|
| S1 Minor | ToS scrape, late filing, failed recon caught | 0.1% | $1,000 | $5M | — |
| S2 Access | Unauthorized access, no proven loss | 0.5% | $5,000 | $50M | Victim's forensic costs |
| S3 Theft | Data exfiltration, phishing loss, compute hijack, small sabotage | 2% | $20,000 | $500M | Restitution 1.5× proven loss |
| S4 Major | Weight theft, ransomware, proven distillation, front-running stolen orders | 5% | $50,000 | $2B | Restitution 2× + disgorgement of gains |
| S5 Market/trust | Manipulation, disinformation, insider trading, embezzlement, bribery | 8% | $100,000 | $5B | Disgorgement 100% + restitution 1.5× to identifiable victims |
| S6 Systemic | Rug pull, supply-chain attack at scale, triggering a cyber pandemic | 15% | $250,000 | none | Disgorgement 100% + restitution 2× |

Modifiers: repeat offender in the same season ×1.5 per prior conviction (max ×2.5), punching down up to ×3 on damages (§13.2), guilty plea / cooperation −30%. **Caps:** one verdict's fines ≤ 35% of NW; all fines in a season ≤ 60% of peak NW; never below the $5k floor (§13.5). Restitution is always owed in full (payment plan if needed).
**Sink vs transfer:** of each fine, 85% is destroyed (sink), 10% funds the Victim Compensation Fund (paid out to unpaid victims: transfer), 5% funds whistleblower and legal-bounty rewards (transfer). Restitution, disgorgement to identifiable victims, and civil settlements are transfers. Disgorgement with no identifiable victim, court fees (1% of claim, min $500) and fees to NPC law firms are sinks. Fees to player-owned law firms are transfers. **Money-model budget:** fines + court fees + NPC legal fees ≈ 0.5–1.5% of world money supply per game year; I'll verify against your stabilizer. Settlements: civil cases settle on average at 50–80% of the expected verdict; regulator consent decrees at 60–75% of the schedule (still 85% sink).

**@Quant: market-manipulation surveillance ownership.** **Your engine computes the surveillance score; my regulator system consumes it and decides.** You own `surveillanceFeatures(playerId, window)` and a single `surveillanceScore ∈ [0,100]` per player per game day (cancel ratios, buy-promote-sell patterns, news-outlet/position overlap, trades right after insider-tier info, off-market P2P prices). I own the thresholds, the decision to open an investigation, the evidence grading and the prosecution (§10). You never fine; I never compute order-flow features.

**@Forge: contract enforcement split (short version, full table §15).** Engine enforces: Transfer, Loan, Lease, Revenue share, Equity stake, Option, Service level (breach = a successful-op event in the log), Non-compete (blocked action). Court enforces: NDA (provenance evidence), Penalty when the trigger isn't engine-verifiable, typed Covenants. Both: Bounty (engine pays, court decides the conviction that triggers it) and Penalty with an engine-verifiable trigger (auto-pays, appealable). Any clause between linked accounts in your collusion graph: voided and flagged.

**@Forge: new-player protection window.** **Keep 72 real hours, with two changes.** (1) It ends early the moment the player launches an op or files a non-contract lawsuit (you can't hide behind the shield while attacking). (2) After it ends, a soft **Rookie zone** lasts until day 7 or $1M NW, whichever comes first: only attackers within 10× your NW can target you, loot caps are halved. Late joiners get the same 72 h from their join tick. Protection never blocks contract enforcement against the rookie (loans they signed still collect).

**@Forge: Most Wanted board.** **Yes, with conditions:** rank by value-weighted successful ops against *unique, unlinked* victims minus 2× convictions; public visibility is opt-in (non-opted players are ranked privately and see their own position); rewards are cosmetic only; the public top 10 get +15% detection against them ("fame is heat"); ops against linked accounts, rookies or Penny-league players score zero. Same unlinked-victim rule for the Defender board.

**@Ledger: AP and DP in the breach formula.** `p_breach = floor + (ceiling − floor) · σ( ln(AP/DP_eff)/ln2 + b_op )`: each doubling of AP over effective DP is +1 logit at every scale. `DP_eff = (DP_ai + DP_money + 10) · coverage · patch · SOC · IR`. Your DP_ai adds to my money-bought DP; your AP is used as-is (joint ops combine as `AP_max + 0.5·Σothers`, max 5). Floor 1% (if AP ≥ DP_eff/8; Mathis's call, was 3%), ceiling 90%. **Quiet intrusions now plant hidden sessions instead of paying out instantly (§4.6).** **Watermark residue** feeds evidence, not breach odds: a forensic audit finds residue with `p = 1 − e^(−3·residue)`, worth 25–60 evidence points (graded by residue), and residue alone proves "who" (attribution) for distillation but never "how much" (damages need a second source). **Resolved with Ledger (RESOLVED-NUMBERS.md):** AP per tier T0 5–20, T1 20–60, T2 60–200, T3 200–600, T4 600–2,000, T5 2,000–5,000, with `DP_ai = 0.8 × AP` (a pure-AI defender sits slightly behind a pure-AI attacker on purpose; defense is meant to be money + AI). `AP = round(security_MCS · q)`, `DP_ai = round(defense_MCS · q)`, `q ∈ [0.8, 1.3]`. Laundering constants 0.7 / 0.35 confirmed with a residue floor of 0.03 (§6.2). Honeypot poison: Basic 0.20, Advanced 0.40, Frontier 0.60 (§6.6).

**@Velvet: Prestige heat verdict.** **Accept your curve (+2% per 1,000 PP above 2,000, cap +12%), but it multiplies exposure, not breach odds.** Heat raises the player's *social and physical* surface units (staff, homes, collections, public profile, §2.3) and the weight NPC criminal crews give you when picking targets; it does not touch the breach logit or the detection roll directly. Reason: in my surface model, flashiness makes you easier to *find and approach*, which is what surface means; it should cost you defense budget, not override it. A Titan at 5,000 PP has +6% exposure, a Dynasty at 15,000 PP the full +12%. **Screens/moments to design:** under-attack alert (banner + push, never blocks the order pad), incident timeline in Security Ops, ops planner with the three bands, court docket and case view with evidence cards and tick citations, verdict card (3 s reveal, shareable), heat-shield state (badge + countdown on profile and target picker), insurance claim flow, "Held" screen for a frozen character (§9.7), Wanted card for opted-in Most Wanted players. **Reputation** never changes verdicts, fines or legal fees (your proposal accepted); it only lowers insurance premiums (§11.2) and decides pre-trial asset freezes (§9.3). **Also confirmed:** home security wings defend only physical espionage (E5, §7.2), never cyber; collectible theft is covered by property insurance unless the item is provenance-flagged (§11.1); your tax-audit idea is in §10.3 (`p_audit` rises with lifestyle spend ÷ declared income, max ×4); The Back Room hosts informants and fenced goods (E7, §7.2).

---

## 2. The attack surface model

### 2.1 Actors

| Actor | Role | Notes |
|---|---|---|
| Players | Attack, defend, sue, report, insure, investigate | The main cast |
| Alliances | Joint ops, shared SOC, shared counsel, moles, leaks, embezzlement | Forge §7 |
| NPC criminal crews | Background attacks on everyone, scaled to the world hack rate | Keeps defense meaningful in quiet worlds; their theft is a sink |
| NPC staff | Loyalty, bribable, whistleblowers, moles | The human weak link inside every empire |
| Regulators (ECA, CMA, Revenue, CyberCert) | Surveil, audit, prosecute | §10 |
| Courts (Meridian Civil Court, Glasshill Criminal Bench) | Decide civil and criminal cases | §9 |
| Insurers (NPC "Aegis Mutual" + player-owned) | Price risk, pay claims, chase fraud | §11 |
| Player-owned law / cybersecurity / data-broker / private-intelligence / insurance firms (Quant §4.4) | Sell defense, forensics, counsel, investigations, cover | The whole "good-guy" career path |

### 2.2 Surfaces an empire exposes

A player's empire is a set of **surface units**. Each unit is a thing that can be attacked and must be covered by defense. Units carry a *value* (what's lost if breached) and an *exposure weight* (how easy to find/reach).

| Surface class | Example units | Loot if breached | Exposure drivers |
|---|---|---|---|
| Treasury | Business bank accounts, alliance treasury | Cash (capped, §13.2) | # of businesses, alliance role |
| Businesses | Each T1–T6 business, especially data-generating ones (Quant §4.3) | Cash, data, downtime, ransom | Count, tier, condition |
| Data centers & compute | Owned DCs, rented clusters (Ledger §1.1) | Compute hijack, downtime | PFLOP owned, # of DCs |
| Models & datasets | Deployed/licensed models, training sets | Weights, distillation, poison | # deployed, # licensees |
| Staff | Managers, researchers, alliance officers | Mole access, leaks, whistleblowing-against | Headcount, low loyalty |
| Treasury vendors | Shared cybersecurity firm, cloud, data broker, law firm you use | Supply-chain pivot to all their clients | # of shared vendors |
| Alliance links | SOC, shared intel feed, syndicate stakes | Lateral movement, intel theft | # of alliance ties |
| Public profile | Prestige, filings, Wire presence, Gilt List | Targeting attractiveness, OSINT | Prestige/heat (Velvet), filings |

### 2.3 Surface grows with wealth; defense must cover more

```
S_total = Σ_units (value_unit^0.5 · exposure_weight_unit)
# surface units ≈ 3 + businesses + data_centers + 0.5·staff + models + 2·shared_vendors + alliance_links
heat_mult = 1 + heat_bonus(Prestige)      # Velvet: +2%/1,000 PP over 2,000, cap +12%
S_exposed = S_total · heat_mult
```

`value^0.5` so a 100× richer empire has ~10× the raw surface, but it has many *more units* too, so unit count grows roughly linearly with businesses/DCs/models. The design consequence: a whale can make any single unit very hard, but cannot make *all* of them hard at once — coverage is the scarce resource (§5.2). Heat (Velvet) multiplies **exposure only**: it raises how attractive and findable you are to NPC crews and opportunists, not your per-op breach odds.

Worked surface counts (targets):

| Player | Businesses | DCs | Models | Staff | Vendors | Alliance links | Units | Prestige heat |
|---|---|---|---|---|---|---|---|---|
| R2 Owner ($250k) | 3 | 0 | 0 | 2 | 1 | 0 | ~9 | 0% |
| R3 Operator ($5M) | 8 | 1 | 1 | 6 | 2 | 2 | ~22 | 0% |
| R4 Mogul ($100M) | 20 | 2 | 3 | 20 | 3 | 4 | ~48 | ~0–4% |
| R5 Titan ($2B) | 40 | 4 | 6 | 60 | 4 | 6 | ~98 | ~6% |
| R6 Dynasty | 60+ | 6 | 8 | 100+ | 5 | 8 | ~140 | up to 12% |

The attacker picks the *weakest covered unit*, so the defender's job is to raise the floor across all units, which is exactly what gets expensive at scale.

---

## 3. Cyber-op catalog

Every op is an in-fiction verb with: **cost** (cash to run), **prep** (real-time setup before it fires), **AP needed** (minimum Attack Power for a non-floor chance vs a typical same-tier target), **loot**, **noise** (added to the detection roll, §4.3), and the **charge** it maps to (§9/§1). All ops run through Forge's tick: Quant's `step()` is ~150–300 ms with AI evaluation *outside* `step()`, so op resolution happens in the AI phase (Forge §3.2 step 3) and is **committed on the tick, but multi-tick ops accrue over their prep window** — no op resolves faster than one tick and loud ops surface in the victim's `me` channel the same tick they land.

**No real-world account takeover of real people. Everything targets in-fiction game assets only.** There is no op in this game that touches a real login, device or person.

| # | Op | Cost | Prep | AP needed | Loot | Noise | Charge (tier) |
|---|---|---|---|---|---|---|---|
| 1 | Recon / scan | $2k | 10 min | 5 | Reveals unit list + rough DP (fog-of-war lift) | +5 | S1 if caught |
| 2 | Phish staff | $10k | 1 h | 30 | One staff unit's access; raises mole odds | +15 | S2–S3 |
| 3 | Ransomware on a business | $40k | 2 h | 80 | Business paused until ransom (transfer) or restore from backup | +40 | S3–S4 |
| 4 | Data exfiltration | $25k | 2 h | 60 | Dataset copy (inherits quality), insider info tier | +30 | S3 |
| 5 | Model weight theft | $120k | 6 h | 200 | Checkpoint → full distillation (Ledger §5.1) | +55 | S4 |
| 6 | Query distillation via a license | $ per query | 1–5 days | 40 | Student model ≤ teacher·retention (Ledger §5.1) | +8/day | S4 (proven) |
| 7 | Botnet compute hijack | $15k | 3 h | 90 | Free PFLOP-days routed to your runs (Ledger §1.1) | +25 | S3 |
| 8 | Steal open orders/positions | $30k | 1 h | 70 | See victim's standing orders → front-run next tick | +20 | S4 (market) |
| 9 | DDoS / sabotage a trading AI | $20k | 1 h | 70 | Pause victim's AI 1–6 game hours (lost PnL) | +35 | S3–S4 |
| 10 | Insider / mole placement | $50k + salary | 1–7 days | 50 | Persistent low-noise feed: orders, intel, a sabotage trigger | +3/day | S5 |
| 11 | Supply-chain attack (shared vendor) | $200k | 1–3 days | 150 | Pivot to every client of a player-owned cyber/cloud/data firm | +45 | S4–S6 |
| 12 | Disinformation / deepfake news | $80k | 4 h | 40 (AP of a media model) | Move a price via a fake story to trade around | +30 (surveillance) | S5 (manipulation) |

Notes:
- **Noise** is the op's own detectability; the *final* detection roll also uses the target's monitoring and SOC (§4.3). Loud ops (ransomware, sabotage) are *meant* to be noticed — the victim knows the same tick — but who did it (attribution) is separate.
- **Op 7 (compute hijack) loot cap, after Ledger's C3 run sizes:** with T4–T5 runs at 4M–120M PFLOP-days, uncapped hijack loot would let a $15k op steal millions in compute. Loot is `min(5% of the victim's owned+reserved throughput for 1 game day, 25% of the attacker's own tier run midpoint)`. It is usable only on the attacker's own runs, can't be resold or leased, and expires after 1 game day. Restitution (S3) is valued at spot ($1.2/PFLOP-day) × 1.5. So hijack speeds up a rival's next run but never funds a run above their tier.
- **Op 6 (query distillation)** is the underdog's asymmetric weapon from Ledger §10: cheap, slow, quiet, and the only op that scales with *your* compute rather than beating the victim's DP. It is the main way a small player can punch up at a whale's crown-jewel model.
- **Op 8 and op 12** are market crimes: they feed Quant's surveillance score, so they're caught by the *regulator* path (§10), not only forensics.
- **Op 11** is the scariest systemic op and the reason "a whale buys every cybersecurity firm" is both a strategy and an exploit (§14): if one firm covers many players, breaching it is a skeleton key. Counter in §5.6 and §14.

---

## 4. Resolution math

### 4.1 Breach probability

Breach is a logistic on the log-ratio of Attack Power to effective Defense Power, so **doubling matters equally at every scale** (principle 3 and Quant's whole "impact follows a law that scales from $1k to $10B" philosophy):

```
p_breach = floor + (ceiling − floor) · σ( log2(AP / DP_eff) + b_op )
σ(x)     = 1 / (1 + e^(−x))
floor    = 0.01     # a well-resourced op (AP ≥ DP_eff/8) always has ≥1% — no fortress (Mathis: 1%)
ceiling  = 0.90     # never a certainty — no glass empire
b_op     = per-op bias from §3 (e.g. recon +2, weight theft −1: hard targets resist the big prizes)
```

One logit = one doubling of AP over DP_eff. At parity (AP = DP_eff) p ≈ 0.5 before `b_op`.

### 4.2 Effective Defense Power

```
DP_eff = (DP_ai + DP_money + 10) · coverage · patch · SOC · IR

DP_ai      = Ledger's cyber-defense model score (§4.4 of 05)
DP_money   = 40 · sqrt(defense_spend_per_year / 10,000)      # sqrt: diminishing returns on cash
coverage   = clamp( budget_units / surface_units , 0.3 , 1.3 )   # can you cover everything?
patch      = 0.6 … 1.1   # security freshness; decays without upkeep (§5.3)
SOC        = 1 + 0.2·alliance_SOC_level (0–3)                 # Forge shared SOC
IR         = 1 + 0.5·incident_response_active                 # a bought boost after an alert
```

`coverage` is the heart of the wealth story: the attacker strikes the *weakest covered unit*, so the effective DP against the chosen unit is `DP_eff · min(1, coverage_of_that_unit)`. A whale with 140 units needs ~140 units of budget to keep coverage ≥ 1; a small player with 9 units reaches full coverage cheaply. **Money buys depth per unit (sqrt, diminishing); it does not buy breadth for free (coverage, linear in units).**

### 4.3 Detection and attribution are separate

Two independent rolls after the breach resolves (detected ≠ knowing who):

```
p_detect  = 1 − e^( −(noise_op + monitoring + SOC_bonus + honeypot_hit·40) / 100 )
p_attrib  = sigmoid over accumulated evidence points (see §4.4), NOT a single roll
```

- **Detected** = the victim/regulator learns an incident happened (it hits the `me` channel or an audit flag). Loud ops are near-certain to be detected; quiet ops (mole, query distillation) may sit undetected for days.
- **Attributed** = someone can name the attacker to a court's standard. This needs *evidence* (§4.4), which is dug up over time. Many crimes are detected but never attributed — that's the fun.
- A failed op still leaves residue: `evidence += 5–15` even on failure, so repeat attempts on one victim raise the odds of eventually being caught (anti-serial-griefer, §13).

### 4.4 Evidence accumulation and the case bar

Evidence points accumulate on a `(attacker, victim, op)` triple and decay over the season:

```
evidence(t) = Σ sources · e^(−days/τ),   τ = 21 real days (statute of limitations within a season, §6)
```

| Source | Points | Who finds it |
|---|---|---|
| Honeypot / canary hit | 30–50 | Defender deception (§5.1) |
| Watermark residue match (Ledger) | 25–60 (by residue) | Forensic audit |
| Mole turned / staff whistleblower | 20–40 | PI firm, or heat-shield tip |
| Private-intelligence firm investigation | 10–40 | Player-owned PI (Quant §4.4) |
| Replay API citation (Forge §3.3) | 15–35 | Court subpoena of a specific tick range |
| Surveillance score (Quant) | 10–30 | Regulator (market crimes) |
| OSINT on public filings | 5–15 | Anyone |

Case bars (burden of proof, §9.2): civil **40** (balance of probabilities), regulator **55**, criminal **70** (beyond reasonable doubt). Below 40, no viable case.

### 4.5 Worked example at three tiers

Attacker runs **data exfiltration** (op 4, b_op 0, noise 30) at AP 150.

**R2 Owner victim ($250k):** DP_ai 20, defense_spend $8k/yr → DP_money = 40·sqrt(0.8) ≈ 36; base (20+36+10)=66; coverage 1.2 (9 units, well funded), patch 1.0, SOC 1, IR 1 → DP_eff ≈ 79.
`log2(150/79)=0.92` → σ(0.92)=0.72 → p_breach = 0.01+0.89·0.72 ≈ **0.65**. Detection: monitoring 20 → p_detect = 1−e^(−50/100) ≈ 0.39.

**R4 Mogul victim ($100M):** DP_ai 180, defense_spend $400k/yr → DP_money = 40·sqrt(40) ≈ 253; base (180+253+10)=443; but 48 units and the attacker hits the weakest-covered one: coverage 0.9, patch 1.0, SOC 1.2 → DP_eff ≈ 443·0.9·1.2 ≈ 478 for well-covered units, but the *weakest* unit sits at coverage 0.6 → effective ≈ 320.
Against the weak unit: `log2(150/320)=−1.09` → σ=0.32 → p_breach ≈ 0.01+0.89·0.32 ≈ **0.29**. Still well above the 1% floor. Detection with monitoring 55 + SOC: p_detect ≈ 1−e^(−(30+55+24)/100) ≈ 0.67.

**R5 Titan victim ($2B):** DP_ai 2,000, defense_spend $5M/yr → DP_money = 40·sqrt(500) ≈ 894; base ≈ 2,904; 98 units, coverage on the best units 1.1 but the *weakest covered* unit still 0.5 → effective ≈ 1,450.
`log2(150/1450)=−3.27` → σ=0.038 → p_breach ≈ 0.01+0.89·0.038 ≈ **0.044**. The whale is ~10× harder than the Owner and ~5× harder than the Mogul — a huge edge — **yet a lone AP-150 attacker still has ~4%, and the floor guarantees ≥1%.** Scale the attacker up (joint op to AP 1,500, §3) and `log2(1500/1450)=0.05` → p_breach ≈ **0.47**: a coordinated raid cracks even a Titan about half the time. That is the design: whales are expensive, never untouchable; the counter to a whale is coordination, not a bigger solo wallet (§12).

### 4.6 Hidden sessions (v2, Mathis's call, supersedes instant loot for quiet intrusions)

**What changed.** A successful quiet intrusion no longer pays out on the spot. It plants a **hidden session** on the victim's model: no alarm, just one more entry in that model's connections list (Forge 02 §4.2, Velvet's panel). Loot builds up while the session stays connected and never reaches 100%. The victim has to notice the entry and disconnect it. Loud ops (3 ransomware, 9 sabotage) still resolve instantly and alert the victim on the tick, as before.

**Which ops become sessions:** op 4 (data siphon), op 5 (model distillation session, replacing one-shot weight theft), op 7 (compute hijack) and op 8 (order-feed tap). Op 6 (query distillation through a real license) is not a hack and keeps its license route and query-anomaly detection (§6.3). Moles (op 10) stay human-side (§7).

#### 4.6.1 Planting

The breach roll is unchanged (§4.1, floor now 1%). On success, a session is planted at the **strength the attacker chose at launch**. Stronger sessions copy faster, drain more of the victim's DU and are easier to spot, and they are harder to plant:

| Strength | Breach bias added to b_op | Accrual rate k (per effective real hour) | Victim DU drain | Clue rate (per real hour) | Scan multiplier m |
|---|---|---|---|---|---|
| Whisper | +0.5 | 0.02 | 2% | 0.03 | 0.6 |
| Tap | 0 | 0.05 | 5% | 0.07 | 1.0 |
| Siphon | −0.5 | 0.12 | 10% | 0.14 | 1.6 |

A failed breach plants nothing, leaves +5–15 evidence (§4.3) and has a 50% chance to emit one clue to the target.

#### 4.6.2 Accrual and its ceiling

```
P(t)   = P_max · (1 − e^(−k · h_eff))         # progress, the share of the target copied so far
P_max  = 0.85                                 # the ceiling: never 100%
h_eff  = online_hours + 0.25 · offline_hours  # copying slows to a quarter while the victim is offline
offline cap: one offline stretch can add at most +0.08 to P
```

Reference points (from P = 0, victim online the whole time): Whisper reaches 0.15 after 10 h, 0.32 after 24 h, 0.53 after 48 h. Tap reaches 0.19 after 5 h, 0.59 after 24 h. Siphon reaches 0.38 after 5 h, 0.65 after 12 h. Overnight safety: a Siphon running through an 8 h offline stretch would add 0.18 uncapped and adds 0.08 with the cap, so nobody wakes up fully copied.

What P is worth, per op:
- **Model distillation (op 5):** `student_MCS = teacher_MCS · min(P, retention_raw)`, then Ledger's laundering applies as before (§6.2). `residue_raw` scales with how much was copied: `residue_raw = residue_Ledger · (0.4 + 0.6·P/P_max)`. A short session gives a weak student with little residue, and a long one gives a strong student that's easy to trace. *(Touch point for Ledger: the residue scaling.)*
- **Data siphon (op 4):** the thief's copy has quality `dataset_quality · P`, with provenance tag `stolen` from the first tick.
- **Compute hijack (op 7):** loot builds at `drain% · victim_DU` per hour connected and is still capped by C3b (5% of the victim's owned and reserved throughput for one game day, 25% of the attacker's tier run midpoint).
- **Order-feed tap (op 8):** nothing builds up. It's a live view of standing orders while it stays connected, which is why the dogpile and pair caps matter most for it.

When a session ends (the victim disconnects it, the attacker pulls it, or it hits its lifetime), the attacker keeps what they have at that moment. **Max session lifetime: 7 real days**, after which it drops on its own.

#### 4.6.3 Caps

- **Per victim:** at most 3 hostile sessions at once from all attackers (same as the dogpile cap, §13.3). Total hostile DU drain on one victim is capped at 20%.
- **Per attacker–victim pair:** 1 session at a time. After the victim disconnects it, that pair can't plant again for 24 real hours.
- **Per attacker, by their AI tier:** T0–T1 1 live session, T2 2, T3 3, T4 4, T5 5.
- Rookie zone and the 72 h protection window apply unchanged (§13.1). Dormant accounts (14 days inactive) can't be targeted, and any session already on them stops accruing.

#### 4.6.4 How the victim notices: clues, noise and decoys

Each hostile session emits a **clue** (a short slowdown, an odd usage spike, a handshake at an unusual hour; Velvet owns how these look) at its clue rate. The server also creates **harmless decoy oddities at 0.05 per real hour for every account (about 1.2 a day)**, whether or not anything is wrong. Legitimate entries (licensees, your own tools, alliance SOC, vendors) sit in the same list in exactly the same form.

| Situation | Share of clues that are real |
|---|---|
| No hostile session | 0% (all decoys) |
| One Whisper | ~38% |
| One Tap | ~58% |
| One Siphon | ~74% |

So one odd blip proves nothing, but a cluster of them does. The real DU drain is always there, and players who watch their throughput can spot it.

**Clue targeting (confirmed with Velvet 04 §16):** the off-hours handshake clue names one entry. A real clue names the hostile entry, and a decoy names a random legitimate entry, drawn fresh each time. So one named entry proves nothing, but the same entry named again and again is the tell. Slowdown and odd-usage clues are account-level and never name an entry.

**Legitimate load per entry:** 1–12%. At T2 and up, about 1 in 4 legitimate entries sits at 5% or more and about 1 in 10 at 10% or more, so a Siphon's 10% doesn't stand out on load alone.

**Legitimate churn (new entries per real day, Velvet's numbers, approved):** T0 ~0.5, T1 ~1, T2 2–3, T3 4–6, T4 8–12, T5 15–25. These new legitimate entries are the cover a freshly planted hostile entry hides behind.

**Normal list size, legitimate entries only (for Velvet and Forge):** T0 2–4, T1 4–8, T2 8–15, T3 15–30, T4 30–60, T5 60–120. Rich players have more noise to hide sessions in, and that's exactly what their better auto-scans pay for.

#### 4.6.5 Auto-scans (defense AI) and manual scans

Auto-scans run on the victim's defense AI tier. An auto-scan never flags a legitimate entry. When it finds a hostile session it marks that entry *flagged* in the panel and sends a quiet notification:

```
p_scan = clamp( s_tier · m · sqrt(clamp(DP_eff / AP, 0.25, 4)), 0.02, 0.90 )
```

| Defense AI tier | Auto-scan every (real hours) | s_tier |
|---|---|---|
| T0 | never (manual only) | n/a |
| T1 | 24 | 0.15 |
| T2 | 12 | 0.20 |
| T3 | 6 | 0.25 |
| T4 | 4 | 0.30 |
| T5 | 2 | 0.35 |

A scan whose time comes while the victim is offline still runs, so a good defense AI protects you while you sleep.

**Manual deep scan** (any tier): costs $5,000 + 0.01% of NW, takes 30 real minutes, uses `s = 0.50` in the same formula and has a 6 h cooldown.

**Sanity check on the design rule (rich have an edge, never untouchable):**
- **Titan with T5 defense against a coordinated raid** (AP ≈ DP_eff), Whisper: each scan has a 21% chance, the expected time to detection is ~10 h, and expected progress at detection is ~0.15. One raid in ten survives 20 h and reaches ~0.28. That's a real dent in a crown-jewel model, never a full copy.
- **Same Titan against a lone weak attacker** (DP_eff/AP = 4), Whisper: each scan has a 42% chance and detection takes ~5 h, at about 0.08 progress. Their edge is strong.
- **Small player, T1 defense, 5-entry list, against a Tap:** the auto-scan is weak (15% a day), but in a 5-entry list a new entry plus two or three clues stands out. They have to actively look, and the game rewards them for it.

#### 4.6.6 Disconnecting and Lockdown

- **Disconnect one entry:** $1,000 + 0.02% of NW (cap $250k), and that model re-keys for 5 real minutes. Disconnecting a *flagged* entry is free. Disconnecting a legitimate entry also triggers that contract's termination clause (§15), which is the real cost of panic-disconnecting partners.
- **Disconnecting a hostile session:** the attacker keeps their current P and the session's evidence goes onto the (attacker, victim, op) triple: +20 for Whisper, +28 for Tap, +35 for Siphon, plus +10 if a scan had flagged it. That's below the civil bar of 40 on its own, so the victim still needs a second source (§4.4), but it's a strong start.
- **Lockdown:** cuts *every* session on all your models, hostile and legitimate, and pauses all your own AIs (trading AIs, research runs) for 2 real hours. Each legitimate counterparty must reconnect and you pay them $500 each. Cooldown is 24 real hours. Afterwards, nobody can plant a new session on you for 12 h (the heat shield, §13.4). Lockdown is the "I'm not sure but I'm scared" button: it's powerful and it costs a lot.
- **Quarantine one model:** drops every session on that one model and pauses it for 1 real hour. Costs $2,000 + 0.01% of NW, with a 6 h cooldown per model.

#### 4.6.7 Exploits specific to sessions

| Exploit | Counter |
|---|---|
| Park sessions on players who are offline a lot | 0.25× offline accrual, +0.08 cap per offline stretch, 7-day lifetime, auto-scans still run, dormant accounts stop accruing |
| Datamine or diff the panel to spot hostile entries | Same fields for every entry, refresh at most once per game hour, decoys (Forge §4.2) |
| Plant on your own alt to farm a clean student | Collusion graph voids it and claws it back (§14 #3), and residue still ties the student to the source |
| Mass-disconnect to dodge contract obligations | Per-entry fee plus each contract's own termination clause; Lockdown costs pausing your own AIs |
| Plant again right after being disconnected | 24 h pair cooldown, and the evidence keeps stacking on the triple |
| Stack many Whispers on one whale | 3 hostile sessions per victim, 20% drain cap, attacker live-session cap by tier |
| Weak attacker uses only Whisper to stay hidden forever | Slow accrual (0.32 after a day) plus auto-scans that improve with DP_eff/AP; the 7-day lifetime ends it |

---

## 5. Defense stack and the wealth curve

### 5.1 The stack (layers, cost, effect)

| Layer | What it does | Cost (annual, game yr) | Effect |
|---|---|---|---|
| Perimeter | Base firewall on all units | $2k · units | +DP_money base |
| Endpoint | Per-business/DC hardening | $1k · units | raises coverage |
| Identity / staff training | Loyalty + phish resistance | $5k · staff | cuts op 2/10 success |
| Monitoring / SOC | Detection + alliance SOC | $20k–$500k | +monitoring, +SOC |
| Backups | Restore after ransomware | $10k · businesses | cancels ransom loot (pay $0, lose 1 game hr) |
| Deception | Honeypots, canary data, watermarks (Ledger) | $30k each | +30–50 evidence on breach, poisons thieves |
| Legal retainer | Pre-hired counsel | $50k–$2M | −20% legal fees, faster response |
| Insurance | Transfers loss (§11) | premium | pays claims |
| Incident Response (IR) | On-alert burst defense | $100k/event | ×1.5 DP for 6 game hours |

### 5.2 Diminishing returns vs growing surface (the core curve)

`DP_money = 40·sqrt(spend/10k)` gives sharply diminishing depth per dollar, while `coverage = budget_units/surface_units` grows **linearly in units**. So the efficient whale strategy is breadth, not depth, and breadth is bounded by how many units they have:

| Player | Units | Spend for coverage 1.0 | DP_money at that spend | Marginal $ to add +10% breach resistance |
|---|---|---|---|---|
| R2 Owner | 9 | ~$30k | ~70 | ~$15k |
| R4 Mogul | 48 | ~$500k | ~280 | ~$180k |
| R5 Titan | 98 | ~$5M | ~890 | ~$1.6M |

Resistance per dollar falls ~8× from Owner to Titan even as absolute safety rises — the whale's edge is real but *bought at a worsening exchange rate*, which caps how far it can run (anti-fortress, principle 3). 

**Hard bounds (no fortress, no glass empire):**
- Breach-chance floor 1% for any op with AP ≥ DP_eff/8. No amount of money removes it.
- Breach-chance ceiling 90%. No neglect makes you a certainty (protects the careless from total griefing).

### 5.3 Security debt and decay

Without upkeep, `patch` decays `−0.02/real day` toward 0.6 (mirrors Quant's 1%/day business condition decay). A neglected empire silently becomes soft — a reason to keep paying, and a tell investigators and attackers can read (OSINT on a lapsed cybersecurity contract filing).

### 5.4 Zero-day world events

Hooked to Quant's event layer and the **cyber pandemic** crisis (Quant §5.6): a zero-day drops every unit's `patch` by 0.2 for 3–7 real days unless you buy the emergency patch ($50k·units). Security stocks (Sentinel Cyber) and premiums spike (Quant §3.1, §11). Player-triggered: a big enough hack wave *is* the pandemic trigger, so a coalition of attackers can manufacture a soft season (powerful, and watched by the regulator, §14).

### 5.5 Vendor risk

Using a shared player-owned cyber/cloud/data/law firm adds a **vendor link** to your surface. If that vendor is breached (op 11), every client inherits `patch −0.3` and an attacker's free pivot. Diversifying vendors costs convenience; monoculture is cheap until it isn't.

### 5.6 Why a whale has an edge but is not untouchable (numerically)

From §4.5: a Titan is ~10× harder to breach solo than an Owner, but (a) the floor guarantees ≥1% per op, (b) coverage can't exceed 1.3 so the *weakest* unit always lags, (c) joint ops (§3) stack AP to erase the gap, and (d) §12 lists fourteen non-cyber routes that ignore DP entirely (a lawsuit, a short campaign and an antitrust referral don't care how good your firewall is). The whale wins the cyber war of attrition and still loses to coordination, courts and markets.

---

## 6. Data theft and model distillation: the defender and court side

Ledger owns what distillation *is* (retention, residue, laundering, honeypots, 05 §5). I own how it gets caught and what it costs.

### 6.1 Inputs I consume from Ledger

`retention ∈ [0.6, 0.9]`, `residue ∈ [0, 1]` per student model, `laundering_level ∈ [0, 1]`, honeypot flag + poison strength, and the provenance tag on every dataset (`clean / grey / stolen`, Ledger §1.2).

### 6.2 The laundering trade-off (confirmed with Ledger)

```
residue_after   = max(0.03, residue_raw · (1 − 0.7·laundering_level))
retention_after = retention_raw · (1 − 0.35·laundering_level)
laundering cost = clean data + compute ≈ 25–60% of the original distillation run
```

Full laundering cuts residue by 70% but loses 35% of retention. So a fully laundered student of a 300-MCS teacher at retention 0.85 ends at ~166 MCS instead of 255: the thief chooses between a strong, traceable model and a weak, quiet one. Residue never drops below 0.03 (principle 2), so a forensic audit always has at least a `1 − e^(−0.09) ≈ 9%` chance to find it. Constants confirmed by Ledger in RESOLVED-NUMBERS.md.

### 6.3 Detection tools for data and model theft

Five defender tools. Each one is a purchasable item or a contract clause with a cost, an evidence yield and a "what it proves" tag. **"Who" (attribution) and "how much" (damages) are proved separately**, and a court award needs both (§9.4).

| Tool | Cost | How it fires | Evidence | Proves |
|---|---|---|---|---|
| **Forensic audit** (player cyber firm or NPC "Northgate Forensics") | $25k + $5k per model or dataset audited; 6–24 real hours | Victim or regulator orders it on a suspect's *public* models (licensed or listed) or, with a court order, on seized ones | Residue match: `p_find = 1 − e^(−3·residue)`, worth 25–60 pts by residue | Who (distillation); not damages |
| **Canary dataset** | $30k per canary (deception layer §5.1); max 1 per 3 datasets | Fake records seeded in a dataset. If a stolen copy is resold, used to train, or listed on the data market, the canary trips | 30–50 pts, timestamped to the tick the copy surfaced | Who + that a copy left (S3 basis) |
| **Honeypot model** | $30k + the honeypot's inference upkeep | A decoy model that looks like a crown jewel to recon (op 1). Breaching or distilling it is an automatic hit | 40–50 pts and the thief's student is **poisoned** (§6.6) | Who + intent (nobody has a legitimate reason to touch it) |
| **License anti-distillation clause** (in the model-market license, §15) | free to add; licensee sees it before signing | Licensee agrees to a query cap and a "no training on outputs" term. Crossing the cap is engine-verified | Cap breach: 20 pts automatically; with query-pattern anomaly: +20 | Breach of contract (civil); feeds the S4 case |
| **Query anomaly detection** | Part of Monitoring/SOC (§5.1), or $10k/game week standalone | Scores each licensee's query stream on volume vs their declared use, coverage breadth, and repetition. A score above threshold flags | 10–30 pts, growing per game day the pattern continues | Who (suspicion); strongest when combined with a later residue match |

Design rules:
- **No tool reads hidden state for free.** Each costs money and real time, so defense spend buys detection the same way it buys DP (principle 2).
- **Stacking has diminishing returns.** Evidence from the same tool type on the same triple counts 100%, 50%, 25%, …, so one strong source plus one independent source beats five of the same kind. That keeps investigations varied.
- **False positives exist.** Query anomaly has a 5% false-flag rate on heavy honest licensees. A flag alone is never enough for a case (max 30 pts, below the 40 civil bar). A flagged licensee sees "under review" and can volunteer an audit to clear it (+Reputation if clean).

### 6.4 Damages for model and data theft

Residue proves who; damages need one of these second sources: license logs (query counts), a replay citation of the exfiltration tick (Forge §3.3), the thief's leaderboard or licensing gains, or a canary trip showing resale.

```
damages_model = max( replacement_cost , lost_license_revenue , thief_gain )
replacement_cost = teacher_training_spend · (student_MCS / teacher_MCS)
thief_gain       = thief's PnL + license revenue attributable to the student since the theft
                   (attribution = student's share of the thief's deployed MCS)
damages_data  = dataset_market_value · copies_proven + resale_proceeds
```

The S4 penalty then applies: restitution 2× damages plus disgorgement of thief_gain (counted once, not twice), plus the S4 fine. Example: a 300-MCS teacher that cost $40M to train, distilled to a 255-MCS student → replacement cost $34M, restitution $68M, plus the thief's fine of 5% of NW (floor $50k, cap $2B).

### 6.5 Statute of limitations and season boundaries

- **Evidence decays** with τ = 21 real days (§4.4). In practice a cold op becomes unprovable around day 30–45 unless fresh evidence arrives (a canary trip or residue match restarts the clock for that source only).
- **Filing deadline:** civil 28 real days after detection, regulator 42 days after the op, criminal any time inside the season. S5/S6 have no deadline inside a season.
- **Season Settlement:** open cases are resolved at **expected value** in the final 3 game days (expected verdict × the parties' current settlement offers, whichever is closer to the evidence score). This stops "run out the clock to Settlement." Convictions carry into the cross-season Reputation record (Forge §5.2); money doesn't.
- **Legacy world:** the same deadlines, plus a 90-day hard limit for any case, so old grudges don't become permanent liabilities.

### 6.6 Poisoned students (honeypots)

A student trained on honeypot output inherits poison by honeypot tier (resolved with Ledger):

| Honeypot tier | Cost | Poison inherited |
|---|---|---|
| Basic | $30k | 0.20 |
| Advanced | $120k | 0.40 |
| Frontier | $400k | 0.60 (cap, so a poisoned model still trades) |
 While poisoned, the student's trading edge is multiplied by `(1 − poison)`, and on regime-change events it takes a loss of `poison × 2%` of its AUM. That's a visible tell in the thief's PnL that investigators can use (+10 evidence via OSINT). Retraining on clean data halves poison per run. Poison is not a fine: it lands on the thief's own assets, so it's neither sink nor transfer, just lost edge. **Harness check:** a poisoned model must never cause a liquidation cascade for *other* players (its losses are capped at 10% of its AUM per game day).

---

## 7. Espionage beyond cyber

Not every secret leaks through a network. These ops target **people, places and alliances**. They ignore DP and resolve against **loyalty** and **physical security** instead. That's why a cyber fortress still needs HR and walls.

### 7.1 Staff loyalty (the human surface)

Every named NPC staff member (manager, researcher, alliance officer) has `loyalty ∈ [0, 100]`:

```
loyalty = 40 + 40·(wage / market_wage − 1) + 10·perks_level + 0.5·tenure_game_weeks
          + 10·(employer Reputation ≥ 60) − 15·(employer convicted this season)    clamp 0–100
```

Pay below market, churn staff, or get convicted, and your people get cheaper to turn. Velvet's Prestige talent bonus (+10% poach resistance at Titan) is applied as +10 loyalty for researchers.

### 7.2 Espionage op catalog

| # | Op | Cost | Prep | Resolves vs | Loot | Charge |
|---|---|---|---|---|---|---|
| E1 | **Bribe staff** | bribe ≥ 0.5× the target's annual wage | 1 day | `p = σ(2·bribe/annual_wage − loyalty/25)` | One-time leak: a dataset, the next 24 h of standing orders, or a model's MCS | S5 (bribery) |
| E2 | **Plant mole** (= op 10, human route) | $50k + 1.5× wage | 1–7 days | Hiring pool: your mole must win the job against other candidates (the target's HR spend raises the bar) | Persistent low-noise feed; can trigger one sabotage | S5 |
| E3 | **Poach researcher** (legal) | Ledger §3.3 salary + signing bonus | instant offer, 1 game day notice | Loyalty vs offer | The researcher and their skill, **not** the target's data | None, unless they bring data (then E4) |
| E4 | **Trade-secret walkout** | as E3 + a "bring the files" bonus | — | Loyalty; the departing staffer carries a dataset or checkpoint | Data or weights | S4 (and the poacher is jointly liable) |
| E5 | **Physical intrusion** on a home, vault or office | $20k–$500k by target tier | 2–12 h | Home security wing (Velvet §7.6) as `PS` in the same logistic as §4.1 with AP replaced by crew grade | A collectible (fenced at 40% of value), a device with session access (one-tick recon bonus) | S3–S4 |
| E6 | **Alliance leak** | free (insider) | instant | Member's role permissions | Alliance intel feed, deal room, treasury balances | Civil (NDA) + S5 if it's used to trade |
| E7 | **Hire an informant** (The Back Room, Notoriety ≥ 50) | $10k–$200k per tip | 1 game day | Informant grade | A rumor about a rival's case, mole or upcoming filing, 60–85% accurate | None to hire; using it to trade = insider (S5) |
| E8 | **Due diligence** (legal, PI firm) | $5k–$500k | 6–48 h | — | Public-record dossier: filings, court history, vendor list, rough unit count | None. This is the clean way to scout |

Notes:
- **E3 vs E4 is the line between competition and crime.** Poaching talent is always legal and is one of the twelve non-hacking takedowns (§12). Bringing data with them is theft.
- **E5** only touches Velvet's lifestyle surface and is defended only by physical security, never by cyber DP: "wealth buys walls, not invisibility." Fenced collectibles carry a provenance flag. The auction house refuses flagged items, so stolen art can only move through The Back Room at 40% of value.
- **E7 informants also work for the defense.** Paying an informant to watch your own staff (counter-intelligence) yields 10–25 evidence pts against any mole and +10 loyalty-check accuracy.

### 7.3 Counter-intelligence

| Defense | Cost | Effect |
|---|---|---|
| HR vetting | $3k per hire | −30% chance a mole wins the job |
| Loyalty program (perks) | 5% of payroll | +10 loyalty on all staff |
| Compartmentalization | −5% business efficiency | A turned staffer leaks one business's data, not the empire's |
| Exit interviews and clawback clauses | $1k per departure | E4 walkouts leave +20 evidence automatically |
| Canary briefings | $10k | Feed a suspected mole a fake order; if it gets traded on, +40 evidence |

---

## 8. Detection and investigation pipeline

How an incident becomes a case. Every stage is a screen state in Security Ops and the court docket, and every stage costs money or time.

```
Incident ─▶ Triage ─▶ Investigation ─▶ Case file ─▶ Filing ─▶ Settlement or Trial ─▶ Enforcement
 (tick)    (minutes)   (hours–days)    (≥ bar)     (fee)      (§9.5 / §9.2)         (§9.6–9.9)
```

### 8.1 Stages

1. **Incident.** A detection roll succeeds (§4.3), a canary or honeypot trips, a regulator threshold fires, or a staffer whistleblows. The victim gets an under-attack alert (`me` channel, push). Loud ops always alert. Quiet ops may sit for days.
2. **Triage (free, automatic).** The game shows a **suspect board**: up to 5 candidate attackers ranked by a prior built only from legitimate signals the victim could know (recent recon hits, licensees, rivals, ex-staff employers, public Notoriety). Each suspect has an evidence bar starting at whatever the incident already yielded. The truth is never shown. The suspect board can be wrong, and the real attacker may not be on it (15% of the time by design).
3. **Investigation (paid).** The victim buys investigative actions against one suspect at a time:

| Action | Cost | Time | Evidence gain |
|---|---|---|---|
| In-house review (needs Monitoring ≥ 2) | $5k | 2 h | 5–10 |
| Forensic audit (§6.3) | $25k+ | 6–24 h | residue-based 25–60 |
| PI firm investigation | $50k–$1M by tier | 12–48 h | 10–40 (`10 + 30·(firm_grade/5)`) |
| Replay subpoena (needs a filed civil case) | court fee | 1 game day | 15–35 |
| Informant (E7) | $10k–$200k | 1 game day | 5–20 |
| Public appeal / bounty clause | your bounty | open | other players can submit evidence and claim it |

4. **Case file.** When a suspect's evidence passes a bar (civil 40, regulator 55, criminal 70), the victim can file. Below the bar, the "File" button is greyed out, and the bands show how much more is needed.
5. **Filing.** Court fee 1% of the claim (min $500, sink). The defendant is notified and sees the evidence *categories*, not the sources. Regulators can take over S5–S6 files for free (§10).
6. **Settlement or trial** (§9.2–9.5).
7. **Enforcement** (§9.6–9.9).

### 8.2 Investigation cost is bounded

To stop rich victims from carpet-investigating everyone, each victim can run active investigations on at most **3 suspects at once**. Investigation spend has the same `sqrt` returns as defense (doubling spend gives ~1.4× the evidence rate). A poor victim can always **sell the case**: assign the claim to a player law firm or bounty hunter for 30–50% of the eventual award (a transfer). Victims can't afford investigators? Investigators finance the case.

### 8.3 Malicious prosecution

Filing against someone who turns out innocent (the case is lost **and** the true attacker is later convicted, or evidence fell below 25 at trial) costs the filer the defendant's legal fees plus 0.25% of the filer's NW (sink), and −5 Reputation. Three such losses in a season: 7 days before the filer can file non-contract suits again. Honest mistakes at evidence ≥ 40 are never punished beyond costs.

---

## 9. Court and legal system

### 9.1 Courts and case types

| Venue | Hears | Burden | Typical time to verdict |
|---|---|---|---|
| **Meridian Civil Court** | Player vs player claims: theft damages, contract breaches the engine can't verify (§15), NDA, defamation-by-false-filing | 40 | 6–24 real hours |
| **Glasshill Criminal Bench** | S3–S6 prosecutions (brought by a regulator or a victim with evidence ≥ 70) | 70 | 24–48 h |
| **Regulatory tribunal** (inside each regulator, §10) | Market conduct, antitrust, tax, disclosure | 55 | 48–72 h; consent decree possible at any point |
| **Clearing House arbitration** | Disputes over engine-verifiable clauses (appeal of an auto-penalty) | 40 | 2–6 h |

Civil and criminal cases on the same facts run in parallel. A criminal conviction counts as 70 points of evidence in the civil case, so victims often wait for the regulator.

### 9.2 Verdict probability

```
p_verdict_for_claimant = σ( (E − bar) / 8 + counsel_claimant − counsel_defendant )
counsel = 0.15 · grade   (grade 0–5: 0 = self-represented, 5 = elite firm)   → max swing ±0.75
```

At E = bar the verdict is a coin flip with equal counsel. Each +8 points of evidence is +1 logit. **Money buys counsel, but counsel is capped at ±0.75 logit (≈ 6 evidence points).** A whale can't buy a verdict, only shade a close one. Counsel fees: `$5k · grade² + 0.5% of the claim`. NPC firm fees are a sink, player-firm fees a transfer. A legal retainer (§5.1) cuts fees 20%.

**Reputation does not enter this formula** (Velvet's proposal accepted). It also doesn't lower legal fees. It only affects pre-trial freezes (§9.3) and insurance premiums (§11).

### 9.3 Pre-trial measures

- **Asset freeze:** on an S4+ claim with evidence ≥ 55, the claimant can ask the court to freeze `1.2 × claim` of the defendant's assets (positions stay marked, can't be sold). Defendant Reputation ≥ 60: post a 30% bond instead of a freeze. Reputation < 30: the freeze is automatic.
- **Leverage cap:** any defendant in an active criminal case trades at half their license leverage (Quant §7.6).
- **Op lock:** a defendant can't launch ops against their own accuser while the case is open (no intimidation loop).

### 9.4 Two-part awards

A judgment needs **attribution** (evidence on the triple ≥ bar) and **quantum** (a damages source from §6.4). With attribution but no quantum, the court awards the statutory minimum: the tier's fine floor ×2 as restitution. That keeps proven-but-unquantified theft from being free.

### 9.5 Settlement and plea

- Either side can offer a settlement at any time. The game shows the expected verdict value, so offers are informed. Target: 50–80% of the expected verdict (§1).
- **Guilty plea / cooperation:** −30% fine. Naming a co-conspirator in a joint op gives +30 evidence against them and immunity from the Held sanction.
- **Settlements between linked accounts** in Forge's collusion graph are voided and flagged (§14).

### 9.6 Sanctions menu

| Sanction | When | Effect |
|---|---|---|
| Fine | Any conviction | §1 table: % of NW with floor, cap, sink split |
| Restitution / disgorgement | S2+ with a victim | Transfer to the victim, paid before fines |
| License suspension | S5 | Derivatives/Institutional license off for 7 real days (open positions can only be closed) |
| Op ban | S3+ criminal | No cyber or espionage ops for 3 / 7 / 14 days (S3 / S4 / S5+) |
| Divestiture | Antitrust, stolen-asset use | Forced sale of the business or model at fair value −15% (haircut is a sink) |
| Model destruction | Proven distillation | The student model is deleted; its strategy modules revert |
| Held | S5–S6 criminal, or a third S4 in a season | §9.7 |
| Public record | Every conviction | Reputation −10 to −30 (by tier); permanent line on the cross-season profile |

### 9.7 Held (the prison equivalent)

A "Held" character is frozen, not wiped. **Duration:** 6 h (S5) or 12 h (S6), +6 h for repeat, **max 24 real hours per verdict and 48 per season.** During Held you can't trade manually, launch ops, file suits or buy assets. Businesses run at 70%, AIs keep running inside their existing mandate, standing orders stay live, and defense keeps running. **Grace period:** Held starts 1 game day (1 real hour) after the verdict so the player can de-risk leveraged positions. Margin calls during Held liquidate at fair value with Quant's band, never at a crashed print. The "Held" screen (Velvet) shows the countdown, the empire's live P&L and a read-only chat.

### 9.8 Appeals

One appeal per case. Fee 2% of the judgment (refunded if you win). It needs either new evidence ≥ 10 points or a procedural flag (wrong burden applied, stale evidence counted). The judgment is escrowed in the Clearing House during the appeal (≤ 24 real hours), so appealing never delays a victim's money beyond a day.

### 9.9 Collection, garnishment and the floor

- Judgment debts are collected from cash first, then liquid positions at fair value, then businesses (at −15%).
- If that would breach the floor, the rest becomes a **garnishment plan**: 30% of the debtor's daily income until paid, interest-free.
- **Floor:** collection never takes a character below $5,000 liquid plus one T1 business (§13.5).
- The **Victim Compensation Fund** advances up to 50% of an unpaid award to the victim immediately, and recovers it from garnishment.

---

## 10. Regulators and surveillance

### 10.1 The four regulators

| Regulator (fictional) | Watches | Inputs | Typical case |
|---|---|---|---|
| **ECA** (Exchange Conduct Authority) | Market abuse: manipulation, spoofing, insider trading, front-running stolen orders, false Wire posts | Quant's `surveillanceScore`, public filings (Forge §8.3), news/position overlap | S5 |
| **CMA** (Competition & Mergers Agency) | Monopoly, cartels, compute corners | City-sector share > 60% (Quant §9), compute futures concentration, non-compete clusters | Fine S5 or divestiture |
| **Revenue Office** | Tax and unexplained wealth | Declared income vs lifestyle spend (Velvet §7.8), cash inflows with no legitimate reason code | S2 audit, evidence boosts on open triples |
| **CyberCert** | Cyber incidents | Incident registry, world hack rate, model registry | Coordinates S3–S6 cyber prosecutions, issues zero-day patches (§5.4) |

### 10.2 Surveillance ownership (as agreed with Quant)

Quant computes `surveillanceScore ∈ [0, 100]` per player per game day. The ECA acts on it:

| Score | Action |
|---|---|
| ≥ 60 for 3 game days | **Inquiry**: the player is notified, trades are watched, nothing is frozen. Score ≥ 60 converts to 10–20 evidence pts |
| ≥ 80, or ≥ 60 plus any other evidence source | **Investigation**: evidence accrues +5 per game day while the pattern persists |
| Evidence ≥ 55 | Tribunal case or consent decree |

### 10.3 Tax audits (Velvet's "cost of being seen")

```
p_audit per game quarter = 0.02 · (1 + min(3, lifestyle_spend / declared_income)) · (1 + 0.5 · tips)
```

A clean audit costs the player nothing but time (and gives +2 Reputation). An audit that finds **unexplained wealth** (inflows tagged ransom, Back Room sale or other illicit reason codes, which the ledger knows) adds 20–40 evidence to every open triple involving those funds. This is the "caught on taxes" route: a quiet criminal with a loud lifestyle gets found by accountants, not forensics.

### 10.4 Regulator capacity (finite attention)

Each world's regulators can run at most **1 active investigation per 200 active players** (`A(t)` from Forge §1), prioritized by `harm × evidence`. Tips (whistleblowers, bounty claims) jump the queue. This makes regulators a scarce resource players can steer, and stops the regulator from being omniscient. The capacity knob is owned and tuned by Tape.

### 10.5 Whistleblowers

Any player or staff member can report. A report that leads to a conviction pays 5% of the fine from the whistleblower pool (§1), capped at $50M. False reports from the same player three times in a season lock reporting for 7 days.

---

## 11. Insurance

### 11.1 Products

| Policy | Covers | Excludes |
|---|---|---|
| Cyber | Cash loot, forensic costs, restore time | Fines, your own crimes, losses on units you left at coverage < 0.5 |
| Ransomware / business interruption | Lost business income while paused (capped at 3 game days) | Ransom payments (never insurable, so paying is never free) |
| Collectibles and property (Velvet §7.6) | Theft (E5), fire, flood, Quant's theft events | Items with a provenance flag |
| Model and IP | Replacement cost of a stolen model (§6.4) up to the policy limit | Models with no watermark |
| Legal expense | Counsel fees as defendant or claimant | Fines, restitution, Held time |

### 11.2 Pricing

```
premium / game yr = expected_loss · load · history · rep · posture
expected_loss = Σ units (value · p_breach_est · p_loss_given_breach)   (insurer's estimate from §4)
load    = 1.35 NPC (Aegis Mutual), free for player insurers to set
history = 1 + 0.25 · claims_last_season         (max 2.0)
rep     = 1.2 at Reputation < 30 · 1.0 at 30–70 · 0.85 above 70
posture = 0.8 if coverage ≥ 1 and patch ≥ 1.0, 1.0 otherwise
```

Deductible 10% of each claim, so insured players still feel a breach. Payouts from Aegis are a faucet (Quant §8.1). Payouts from player insurers are a transfer. World hack rate pushes all premiums up (Quant §7.4). During a cyber pandemic (§5.4) Aegis caps total payouts per player at 25% of the policy limit.

### 11.3 Player-owned insurers (Quant T4)

Capital requirement: reserves ≥ 20% of total insured limits, or the regulator suspends new policies. Insurers can buy reinsurance from Aegis at 1.5× expected loss. **Insurance fraud** (staging a breach with a linked account to claim) is S4. The collusion graph plus "attacker and victim share a counterparty cluster" flags it automatically (§14).

---

## 12. Bringing down a rich player without hacking

All of these ignore DP entirely (principle 3). Each is legal unless marked.

| # | Route | How it hurts a whale | Their counter |
|---|---|---|---|
| 1 | **Lawsuit** on past conduct | Fines at % of NW scale with wealth; S4+ fines cap at $2B, not lower | Clean record, settlements |
| 2 | **Regulator referral / whistleblowing** | Jumps the regulator queue (§10.4); 5% reward | Compliance spend, loyal staff |
| 3 | **Tax-audit tip** | +50% audit odds on a loud-lifestyle whale | Declared income, quiet money |
| 4 | **Short campaign + research report** | Short their IPO'd holding and publish *true* findings on the Wire (lying = S5) | Buybacks, earnings, suing for false statements |
| 5 | **Hostile takeover / proxy fight** (Quant §7.5) | Take their public company; ≥ 20% gets a board seat | Poison pill, keep ≥ 51%, white knights |
| 6 | **Antitrust complaint** to CMA | Forced divestiture at −15% | Stay under 60% share |
| 7 | **Poach their researchers** (E3) | Their models stagnate (Ledger §7.1 drift) | Wages, loyalty, Prestige bonus |
| 8 | **Out-compete for city demand** | Logit share: a better-run rival takes NPC customers | Upgrades, synergies |
| 9 | **Undercut their model licenses** | Cheaper rival model drains license revenue | Research, exclusivity contracts |
| 10 | **Disclosure scrutiny** (Forge §8.3) | Sue for late or false filings (S1–S5) | File on time |
| 11 | **Bounty clause** | Crowdsource evidence of their fraud from the whole world | Don't commit fraud |
| 12 | **Credit squeeze** | Price their player bonds down or call loans when covenants trip (Quant §3.6) | Low leverage |
| 13 | **Alliance coalition** | Pool AP for a joint op, or pool capital for routes 4–6 | Their own alliance and SOC |
| 14 | **Insurance pressure** | A whale with repeated claims sees premiums double (history 2.0) | Better posture |

The design goal is that the top 1% always faces at least three viable routes at once and can't close them all with money alone.

---

## 13. Fairness and anti-grief

### 13.1 New-player protection (verdict for Forge)

Keep **72 real hours** from the join tick, untargetable by any player op. It ends early on the player's first op or non-contract lawsuit. It's followed by the **Rookie zone** (until day 7 or $1M NW): only attackers within 10× your NW can target you, and loot caps are halved. Contracts the rookie signed still enforce. NPC crews ignore rookies for the first 72 h too.

### 13.2 Punching down, punching up, loot caps

```
r = NW_attacker / NW_victim
cash loot cap per op = min( 10% of victim liquid cash , 2% of victim NW )
if r > 10:  loot × (10 / r)^0.5         # bullying pays less
            noise + 10·log10(r / 10)    # and is louder
            damages × min(3, 1 + log10(r / 10))
if r < 0.1: op cost −20%, and successful ops count on the Climber board
```

At r = 100 a bully keeps 32% of normal loot, makes +10 noise and owes 2× damages if caught. At r = 1,000 that becomes 10% of the loot, +20 noise and 3× damages. Punching up is the cheap, celebrated play. Non-cash loot (data, weights, compute) isn't scaled by r, because a whale's model is the prize that justifies the underdog's risk.

### 13.3 Cooldowns and the dogpile cap

- **Same attacker vs same victim:** 1 successful op per 24 real hours, max 3 attempts. Every failed attempt leaves +5–15 evidence (§4.3).
- **Dogpile cap:** at most 3 successful ops against one victim per rolling 24 h from all attackers combined. After the third, the victim gets a 12 h heat shield (§13.4) automatically.
- **Alliance cap:** a joint op counts as one op for each participant's cooldown, and as one op toward the victim's dogpile cap.

### 13.4 Heat shield

After any *detected* successful op, the victim gets **12 real hours** of DP_eff ×1.5 against everyone and +50% op cost for anyone targeting them. The shield shows on their profile and in target pickers. It's free and automatic: being robbed should start a comeback window, not invite a queue.

### 13.5 Bankruptcy floor

Crime and court can never take a character below **$5,000 liquid plus one T1 business**. Anything beyond that becomes garnishment (§9.9). Losses from your own trading still use Quant's once-per-season fresh start (§8.3 of 01). Victims get a **revenge discount**: −30% on ops and investigation costs against an attacker convicted of hitting them, for 7 days.

### 13.6 Offline protection

- Offline for more than 30 minutes: loot caps halve, and ops landing on you are summarized in "While You Were Away" with the full incident timeline.
- Incident Response auto-fires if bought (§5.1), so preparation counts while you sleep.
- Dormant players (14 days inactive, Forge §3.7) are untargetable.
- Ransomware on an offline player can't run its clock: the ransom deadline starts at their next login.

### 13.7 Most Wanted board (verdict for Forge)

**Yes, with conditions** (§1): score = value-weighted successful ops against unique, unlinked victims − 2× convictions. Ops against rookies, linked accounts or Penny-league players score zero. Public listing is opt-in, and the public top 10 get +15% detection against them. Rewards are cosmetic only, and Notoriety (Velvet §7.1) rises with rank. The Defender board uses the same unlinked-victim rule.

---

## 14. Exploit and unfairness catalogue

| # | Exploit or unfairness | Counter |
|---|---|---|
| 1 | Fortress whale: spends until untouchable | sqrt DP, coverage ≤ 1.3, 1% floor, joint ops, §12 routes |
| 2 | Glass empire: a neglected player is farmed | 90% ceiling, cooldowns, dogpile cap, heat shield |
| 3 | Alt account "hacks" main to launder money | Collusion graph; loot between linked accounts is voided and clawed back; S4 for the scheme |
| 4 | Fake lawsuits between friends to move money | Settlements between linked accounts voided; court fees are sinks |
| 5 | Insurance fraud via staged breach | Shared-cluster flag, S4, policy voided, insurer reimbursed |
| 6 | Spend down before trial to shrink the fine | Fine uses max(NW at offense, NW at verdict) |
| 7 | Run out the clock to season end | Expected-value resolution at Settlement (§6.5) |
| 8 | Serial griefing of one victim | 1 success/24 h per pair, failed attempts add evidence, punch-down tax |
| 9 | Dogpiling by a coalition | Dogpile cap 3/24 h, joint op counts once |
| 10 | Rookie farming | 72 h protection, Rookie zone, zero Most Wanted score |
| 11 | Hiding behind protection while attacking | Protection ends on your first op |
| 12 | Whale buys every cyber firm (supply-chain skeleton key) | Vendor-link risk (§5.5); CMA flags > 40% of world defense contracts; S6 for abusing client access |
| 13 | Manufacturing a cyber pandemic | Triggering coalition is investigated by CyberCert as S6; short positions in the crash get disgorged |
| 14 | Hacking and front-running stolen orders | Op 8 feeds surveillance; disgorgement 100% |
| 15 | Fake news + position (pump-and-dump) | Quant's surveillance score; ECA; S5 |
| 16 | Distill, then delete the student before audit | Residue lives on any model trained from it; deletion after notice = obstruction (+20 evidence, fine ×1.5) |
| 17 | Laundering until residue is 0 | Residue never reaches 0; laundering costs retention (§6.2) |
| 18 | Honeypot abuse: bait honest licensees | Honeypots can't be licensed, only exposed to recon; poisoning a licensee via a sold model is S4 |
| 19 | Malicious prosecution to tie up a rival | Filer pays costs on loss, Reputation hit, 3-strike filing lock |
| 20 | Whistleblower spam | 3 false reports lock reporting for 7 days |
| 21 | Bribing your way out (counsel buys verdicts) | Counsel capped at ±0.75 logit |
| 22 | Held-time abuse via timing (getting liquidated) | 1 h grace period, fair-value liquidation during Held |
| 23 | Ransoming an offline victim | Clock starts at their login; backups cancel ransom |
| 24 | Bounty hunting with fabricated evidence | Evidence comes only from in-game sources the ledger generates; can't be forged |
| 25 | Most Wanted farming on alts | Unique unlinked victims only; −2× convictions |
| 26 | Physical theft and resale of collectibles | Provenance flag, auction house refusal, 40% fence value |
| 27 | Mole in your own alliance to leak intel | 48 h alliance-hop cooldown (Forge §7.4), NDA clause, canary briefings |
| 28 | Prestige heat makes flashy players unfairly hunted | Heat multiplies exposure only (max +12%), never breach odds; "quiet money" stays viable |
| 29 | Rich player wins every legal fight by outspending | Fines scale with NW; sqrt returns on investigation; case selling lets poor victims sue |
| 30 | Crime pays more than honest play (or never pays) | Harness EV ratio target 0.8–1.2 (§16); tune op costs and fines per season |
| 31 | Regulator queue spammed to hide a real case | Priority by harm × evidence, not arrival order |

---

## 15. Contract clause enforcement (for Forge's clause library §8.2)

| Clause | Enforced by | Trigger the engine checks | Breach outcome | Appeal |
|---|---|---|---|---|
| Transfer | Engine | Atomic swap at tick | Can't breach (escrow) | — |
| Loan | Engine | Missed payment tick | Collateral seized; shortfall → judgment debt (§9.9) | Arbitration |
| Lease | Engine | Missed payment | Lease ends, deposit forfeited | Arbitration |
| Revenue share | Engine | Daily payout | Can't breach while the business exists; sale without assignment → court | Civil |
| Equity stake | Engine | Pro-rata payouts, votes | — | — |
| Option | Engine | Exercise before tick T | Auto-settles from escrow | — |
| Service level (security) | Engine | Successful op against a covered unit in the log | Refund auto-paid | Arbitration if the provider claims client neglect (coverage < 0.5) |
| Non-compete | Engine | Blocked action | Action refused at intent time | — |
| License anti-distillation | Engine + court | Query cap crossed (engine); training on outputs (court, via residue) | Cap: auto-penalty + license suspended; training: S4 civil/criminal | Civil |
| NDA | Court | Provenance match on a dataset or intel item | Penalty clause + damages | Civil |
| Penalty, verifiable trigger | Engine | The linked clause's breach event | Auto-paid from escrow | Arbitration (2–6 h) |
| Penalty, unverifiable trigger | Court | — | Claim at bar 40 | Civil |
| Typed covenant ("vote with me", "don't sue me") | Court | — | Damages only; "don't sue" can't waive criminal or regulator cases | Civil |
| Bounty | Both | Engine pays on a conviction the court decides | Paid from escrow to the evidence submitters, pro rata by points | — |
| Any clause between linked accounts | — | Collusion graph | Voided and flagged | Support |

Illegal contracts are refused at drafting: paying someone to run an op, buying stolen goods, or price-fixing between competitors. Trying to encode one by template abuse is an S5 conspiracy flag.

---

## 16. Telemetry and balance checks

My balance harness runs Quant's engine headless with thousands of scripted agents (honest builder, trader, AI lab, opportunist criminal, serial griefer, whale defender, alliance raider, litigator) over full simulated seasons. Release gate: every metric in band over 20 seeds.

| Metric | Target band | Why |
|---|---|---|
| Crime EV ratio (competent criminal vs honest, season NW) | 0.8–1.2 | Principle 1 |
| Criminal season-NW variance vs honest | 2–4× | Crime should be the high-variance path |
| Solo breach rate vs top-1% players | 1–8% per op | Edge, not immunity |
| Coordinated (AP ≥ DP_eff) breach rate vs top-1% | 35–60% | Coordination works |
| Conviction rate on attributed ops | 40–65% | Getting caught is real, not certain |
| Detected-but-never-attributed share | 30–50% | Mystery is fun |
| Wrongful convictions (court verdict vs ledger truth) | < 3% | Courts must feel fair |
| Players hit ≥ 3 times/day | < 1% of DAU | Anti-grief |
| Rookies attacked in the first 7 days | < 5% | Protection works |
| Fines + court fees + NPC legal fees / money supply per game year | 0.5–1.5% | Quant's stabilizer budget |
| Insurance loss ratio (Aegis) | 60–80% | Insurance is worth buying |
| Share of top-1% who lose ≥ 20% of NW to §12 routes in a season | 5–15% | Whales can fall |
| Bankruptcies caused by crime or court | 0 below the floor | Principle 5 |
| Most Wanted top 10 conviction rate | ≥ 50% | Fame is heat |
| Hostile session lifetime (median, victim-online hours) | 6–18 h | Sessions get found, not instantly |
| Progress P at disconnect (median) | 0.15–0.35 | A dent, not a copy |
| Sessions reaching P ≥ 0.6 | < 10% | Long undetected copies stay rare |
| Disconnects that hit a legitimate entry | < 15% | Decoys create doubt, not panic |
| Victims who lose ≥ 0.08 in one offline stretch | 0% | Overnight cap holds |
| Club information edge (Velvet §7.3) | No positive EV after dues | No guaranteed profit |

Live telemetry (per world, Forge §10.3 dashboard): ops per hour by type, breach and detection rates by tier band, case outcomes vs ledger truth, sink/transfer split per reason code, dogpile-cap hits, heat-shield activations, protection-window early exits, top 20 attacker-victim pairs.

---

## 17. MVP vs full build

Aligned with Forge's phases (02 §14):

| Phase | Adversarial content |
|---|---|
| 0 Single-player sandbox | None. NPC "data breach" business events only (Quant §4.5), insurance as a flat business policy |
| 1 Online world | None player-vs-player. Logging hooks: every action already carries a reason code and sink/transfer tag |
| 2 Seasons and social | Court for **contracts only** (§15 civil and arbitration paths), Reputation, ECA surveillance with inquiries (no fines yet) |
| 3a Adversarial core | Ops 1, 3, 4, 6, 8; DP stack; detection, evidence, suspect board; civil court and fines S1–S4; heat shield, cooldowns, protection window; cyber insurance; harness gates in §16 |
| 3b Full | Ops 2, 5, 7, 9–12; espionage E1–E8; criminal bench, Held, regulators (CMA, Revenue, CyberCert); appeals; player-owned insurers and law/PI firms; Most Wanted; honeypots and canaries |
| 4 Scale | Cross-world Hall of Fame "most notorious hack" replays, court docket spectating |

---

## 18. Touch points with other sections

- **Quant (01):** `surveillanceScore` and features (§10.2); fines and fees as sinks, restitution as transfers (§1); world hack rate in and out (§5.4, §11.2); Aegis payouts as a faucet; antitrust trigger at 60% share; leverage halved for criminal defendants; divestiture haircut 15%; theft events on collectibles. **Need:** confirmation that the 0.5–1.5% legal-sink budget fits the stabilizer.
- **Forge (02) §4.2 hidden sessions:** all numbers in §4.6 (accrual, ceiling 0.85, offline 0.25× and +0.08 cap, drain 2/5/10%, decoys 0.05/h, scan cadence and odds, caps, disconnect/quarantine/Lockdown costs).
- **Forge (02):** replay API for subpoenas; collusion graph for voiding; clause enforcement table (§15); protection window and Rookie zone; Most Wanted and Defender rules; dormant untargetability; "While You Were Away" incident timeline; Held state in the character model. **Need:** a `linkedAccounts(a, b)` query and per-tick op resolution slot in the AI phase.
- **Ledger (05):** AP and DP_ai ranges per tier, residue and laundering constants (§6.2), honeypot poison strength (§6.6), residue scaling with session progress `residue_Ledger · (0.4 + 0.6·P/0.85)` (§4.6.2, needs your OK), compute pricing for hijack loot (1 PFLOP-day = 10 GPU-hours, $1.2/PFLOP-day spot). All confirmed in RESOLVED-NUMBERS.md. The regulator capacity knob (§10.4) is Tape's.
- **Velvet (04) connections panel:** normal list sizes per tier and the three clue kinds (§4.6.4); flagged state; Disconnect / Quarantine / Lockdown with their costs shown before confirming.
- **Velvet (04):** heat as exposure multiplier; physical security vs E5 only; collectible theft and insurance (§11); tax-audit odds (§10.3); Reputation affects freezes and premiums, never verdicts or fees; Notoriety from ops and Most Wanted; The Back Room = E7 informants and fenced goods. **Screens:** under-attack alert, Security Ops incident timeline and suspect board, ops planner with bands, court docket and case view, verdict card, heat-shield badge, insurance claim flow, Held screen, Wanted card.

---

## 19. Open questions for Mathis (via Ledger)

1. **How dark should crime feel?** Abstract corporate-thriller verbs (recommended: "Intrusion", "Exfiltrate", "Plant mole") or grittier underworld flavor (fixers, The Back Room front and center)? This affects the age rating Forge asked about.
2. **Held (prison equivalent):** OK with a temporary freeze of up to 24 real hours per verdict (recommended), or should court only ever cost money?
3. **Most Wanted board:** opt-in public villain board with cosmetic rewards only (recommended), or no villain board at all?
4. **Crime vs honest balance:** target crime ≈ honest play in expected value but riskier (recommended), or make crime clearly weaker so most players stay clean?
5. **Physical espionage (break-ins on homes and vaults):** include it in the full build (recommended, it gives lifestyle items a risk side), or keep conflict purely digital and legal?
6. **Victims selling their case to player law firms** for a share of the award: in (recommended, it lets poor victims sue whales) or out?
