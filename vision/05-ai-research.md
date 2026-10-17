# 05 — AI Research Tech Tree

**Owner:** (AI research subsystem)
**Status:** Design bible v2 (2026-10-07) — folds in the shared numbers from `RESOLVED-NUMBERS.md`: AP/DP tier ranges (B2), the PFLOP-day↔GPU-hour conversion + flat $0.12/GPUh spot (C1), the per-tier DU decision budget (A1), honeypot poison values (B3), the 0.03 residue floor + laundering constants (B1), and steep per-tier training-run sizing as the late-game compute sink (C3). Changed in §1.1, §2.5, §3.2, §4.3–4.4, §5.2, §11.
**Mathis's product calls (2026-10-07) folded in:** (1) **one persistent world** — no resets/shards; seasonal ladders inside it (so references to "seasons/servers" here mean ladder chapters, not wipes); (2) **breach floor is 1%** (Tape `03 §4.1`), not 3%; (3) **hacking is hidden sessions** — a successful quiet intrusion plants a subtle extra entry in the victim's model connections list and distillation builds up over time (ceiling 0.85, never 100%) until the victim notices and disconnects it. Distillation mechanics (§5.1), cyber-attack AI (§4.3) and defense auto-scan by tier (§4.4) are rewritten to match Tape `03 §4.6`.
**Scope:** This section owns the *AI technology tree itself* — compute, data, model research, AI product lines, distillation (the attacker's side of the mechanic), and AI-specific risks. It cross-references but does not duplicate:
- `01-markets-economy` (Quant) — prices, assets, the market engine the trading AI plugs into, hardware/data as tradable commodities.
- `02-multiplayer-systems` (Forge) — sessions, ticks, matchmaking, the shared world clock, licensing marketplace plumbing.
- `03-conflict-legal-fairness` (Tape) — **owns** the cyber-attack *resolution*, cyber-defense stack, detection, court, fines, fairness/anti-grief. We define what the AI *is* and what it *outputs*; Tape defines what happens when attacker meets defender and when you get caught.
- `04-experience-lifestyle` (Velvet) — the lab UI, researcher avatars, prestige/flex of owning a frontier lab.

---

## 0. Design goals for the AI branch

1. **AI is a business, not a cheat code.** Every AI capability is bought with money, compute, data, time, and risk. It can 10x a skilled player, but a player who never touches AI must still be able to win via pure markets + businesses (see §12 Balance).
2. **Everything is a timed, uncertain investment.** No instant unlocks. Training runs take real wall-clock/tick time and can fail.
3. **Scaling laws are the core dial.** Capability is a smooth function of compute × data × algorithm, so players always feel "one more run" could push them over a threshold.
4. **Legible risk.** The player should be able to see expected value and roughly the odds before committing. Surprises come from the world (chip shortage, regulator, a rival's hack), not from opaque math.

---

## 1. The three fundamental inputs

All AI capability derives from three resources. We model a single scalar **Model Capability Score (MCS)** per model, plus specialization multipliers.

### 1.1 Compute (C)
Measured in **PFLOP-days** (petaflop/s-days), the canonical engine unit for compute. One training run "spends" a budget of PFLOP-days.

**Unit bridge to Quant's compute commodity (Decision C1).** Quant's market (`01 §3.4`) trades compute as **GPU-hours (GPUh)**. One source of truth: **`1 PFLOP-day = 10 GPUh`** (reference accelerator = 2.4 PFLOP/s sustained ≈ the DX-100 datacenter class below). The spot price is held **flat** as a reference and floats with demand/supply around it per Quant's §3.4 model: **$1.2 / PFLOP-day = $0.12 / GPUh**. The late-game money sink from compute comes from *run size scaling steeply by tier* (§3.2, Decision C3), **not** from inflating the price — so Quant keeps a single floating compute price.

**Ways to get compute:**
| Source | Unit cost (game $) | Notes |
|---|---|---|
| Cloud rental (spot) | $1.2 / PFLOP-day (= $0.12 / GPUh) | Instant, elastic, but price floats with the GPU market (see Quant: GPU index). Can be outbid / preempted during shortages. |
| Cloud rental (reserved) | $2.0 / PFLOP-day (= $0.20 / GPUh), 30-day commit | Price-locked; protects you during a shortage spike. |
| Owned GPUs (on-prem) | CapEx below + ~$0.15/PFLOP-day (= $0.015/GPUh) energy | You own the asset; depreciates; needs a data center + power. |
| Seized/borrowed (botnet) | "free" compute via cyber-attack | High legal risk; routed through Tape's conflict system. See §6.4. |

**GPU tiers (owned hardware):**
| Tier | Name (fictional) | $ / card | PFLOP/s (game) | Power draw | Avail. tier |
|---|---|---|---|---|---|
| T1 | consumer "GX-10" | $2,000 | 0.1 | 0.4 kW | Garage |
| T2 | prosumer "GX-40" | $12,000 | 0.6 | 0.7 kW | Startup |
| T3 | datacenter "DX-100" | $40,000 | 2.5 | 1.0 kW | Scale-up |
| T4 | flagship "DX-300" | $150,000 | 9.0 | 1.4 kW | Frontier |
| T5 | frontier node "DX-900 pod" | $2.4M / 8-pod | 90 | 11 kW | Frontier+ |

**Data centers & energy** (CapEx/OpEx sinks that gate owned compute):
- A data center has a **power cap (MW)** and a **cooling/PUE** factor. Effective energy cost = cards' draw × PUE × local $/kWh.
- Power contracts: lock $/kWh for N days, or ride the spot energy market (Quant owns the energy commodity). Cheap hydro/solar regions reduce OpEx but cost more upfront; a heatwave event spikes cooling.
- **Formula:** `energy_cost_per_day = Σ(card_kW) × PUE × 24 × $/kWh`. Example: 100× DX-100 (100 kW) × PUE 1.3 × 24h × $0.10 = **$312/day**.

**Chip shortage as a market event** (hooks Quant's event layer):
- Trigger: random (~1-2× per in-game year) or endogenous when aggregate player compute demand > supply.
- Effect: cloud spot $/PFLOP-day ×1.5–×4 for 7–30 days; new GPU orders get a **lead-time** of 14–90 days instead of instant; T4/T5 cards may be allocation-gated (only frontier-rep players can buy).
- Counterplay: reserved contracts, owning hardware early, or (grey) buying on a secondary market at a markup. A player who stockpiled GPUs can *rent them out* to rivals for profit during the shortage (player-to-player compute leasing, plumbed by Forge's marketplace).

### 1.2 Data (D)
Measured in **Data Quality Units (DQU)** = volume × quality × freshness. A dataset object has: `size`, `quality ∈ [0,1]`, `freshness_halflife`, `domain` (equities / crypto / sentiment / alt-data / exploit-corpus), and `legal_risk ∈ {clean, grey, stolen}`.

**Effective data value decays:** `effective_DQU(t) = base_DQU × 0.5^(age_days / freshness_halflife)`. Stale data silently degrades model edge — a reason to keep buying.

**Data sources:**
| Source | Cost | Quality | Freshness | Legal risk | Notes |
|---|---|---|---|---|---|
| Data broker (licensed) | $$ (subscription $5k–$80k/mo by tier) | 0.7–0.95 | high | clean | Safe, boring, everyone can buy → low edge. |
| Public scrape | cheap ($ infra only) | 0.3–0.6 | medium | grey | ToS risk; can trigger a minor legal flag; quality noisy. |
| Exclusive partnership | very $$$ + relationship | 0.9–0.99 | high | clean | Exclusive alt-data (e.g. "satellite footfall", "exchange L2 feed"). Negotiated; limited slots → competitive. |
| Synthetic data (self-generated) | compute only | 0.4–0.85 (rises with your model quality) | always fresh | clean | Risk of **model collapse** if over-relied: diminishing/negative returns past a synthetic ratio (§9). |
| Stolen (hack/distill) | cyber-attack cost + legal risk | inherits victim quality | high | stolen | Routed through Tape. Carries a watermark trail (§5). |

**Data quality & freshness as a mechanic:** two players with equal compute diverge on data. Alt-data partnerships are the "whale" edge from the seed (rich players protect *and* out-source-data themselves). Clean beats stolen for safety; stolen beats clean for cost — classic risk trade.

### 1.3 Algorithm / Architecture (A)
The research tree proper (§3). Captured as an **algorithmic efficiency multiplier** `A ≥ 1.0` that makes a given C×D go further. Early game A≈1.0; frontier A can reach ~8–12 with every architecture unlock + tuned hyperparameters.

---

## 2. Scaling laws as the master formula

Core capability equation (a deliberately game-ified Chinchilla-style law):

```
MCS = A × k × (C^α) × (D^β)
  with α ≈ 0.34, β ≈ 0.28, k a global constant,
  and a compute-optimal data ratio: D* ≈ γ × C  (γ tuned).
```

**Balanced-run bonus:** if your run's data is within ±25% of the compute-optimal `D*`, apply ×1.15. If badly imbalanced (data-starved or compute-starved), apply a penalty down to ×0.6 — this teaches players to buy data *and* compute, not just spam one.

**Diminishing returns & capability thresholds:** MCS is continuous, but *product unlocks* and *leaderboard-relevant abilities* trigger at thresholds (e.g. MCS 50 unlocks "market-making strategy", MCS 120 unlocks "cross-exchange latency arb", MCS 300 enters "frontier" tier). This gives the "one more run" pull while keeping raw numbers smooth.

**Why a formula the player can see:** we expose an in-game "run planner" that predicts resulting MCS range and $ cost before committing, so the gamble is informed (goal #4).

### 2.5 Server execution & decision-unit (DU) budget (Decision A1, with Forge)

AIs run **server-side inside the tick** as strategy graphs of blocks (not user code), on the same order API as humans (Forge `02 §4`). CPU is rationed in **decision units (DU)** — 1 DU = evaluate one signal on one symbol. This is strictly separate from *in-game compute* (PFLOP-days/GPUh): in-game compute buys capability **and** raises the DU cap; DU is the hard server-CPU limit.

- **Per-player hard cap:** 2,000 DU/tick. **Per-partition cap:** 3.0M DU/tick per invisible partition of ~25k agents (Forge `02 §4`; one persistent world is partitioned behind the scenes); over budget, AIs scale down proportionally world-wide (diegetic "compute shortage" → raises Quant's compute price).
- **Compute → DU:** `DU_cap(player) = min(2000, base_tier · (1 + 0.25·min(1, compute_owned / tier_run_midpoint)))` (C3a; replaces the old `0.5·√PFLOP-days` bonus, which broke under C3 run sizes).

| AI tier (§8) | Cadence | Base DU/eval | Effective DU/tick |
|---|---|---|---|
| T0 Laptop script | every 6 ticks | 30 | 5 |
| T1 Garage | every 6 ticks | 90 | 15 |
| T2 Startup | every 3 ticks | 300 | 100 |
| T3 Scale-up | every 2 ticks | 800 | 400 |
| T4 Frontier | every tick | 1,500 | 1,500 |
| T5 Hegemon | every tick | 2,000 | 2,000 |

Better models act **more often and evaluate more**, but never get earlier ticks or special order types — AI edge is *information quality*, not latency (Forge `02 §4`).

---

## 3. Model research tree (architectures & training)

### 3.1 Architecture unlocks (the tech tree spine)
Each node: one-time **research cost** ($ + compute for a "proof-of-concept run") + **unlock time**. Grants a permanent `A` multiplier and/or a new capability slot.

| Node | Prereq | PoC cost | Unlock time | Effect |
|---|---|---|---|---|
| Linear/handcrafted signals | — | $5k | 1 day | A=1.0 baseline; laptop tier. |
| Classic ML (GBM/RF) | above | $25k | 2 days | A=1.4; needs tabular data. |
| Deep nets | Classic ML | $120k | 4 days | A=2.0; unlocks sentiment/NLP line. |
| Sequence models | Deep nets | $400k | 7 days | A=3.0; unlocks HFT microstructure line. |
| Transformer core | Deep nets | $1.2M | 10 days | A=4.2; unlocks analyst AI + large models. |
| Mixture-of-Experts | Transformer | $4M | 14 days | A=5.5; cheaper inference at scale. |
| RL / self-play | Transformer | $6M | 18 days | A=6.0; unlocks adaptive execution + autonomous trading. |
| Multimodal | Transformer | $9M | 21 days | A=7.0; fuse satellite/image/audio alt-data. |
| Frontier scaling stack | MoE + RL | $30M | 30 days | A=9.0+; frontier-lab tier; prerequisite for top leaderboard AI. |
| Proprietary secret sauce | Frontier | $80M + rep | 45 days | A up to 12; soft cap; each lab's is unique → distillation target. |

### 3.2 Training runs as timed investments with failure odds
A **run** is the atomic action. Inputs: architecture, compute budget (PFLOP-days), dataset(s), hyperparameter "care" level, researcher talent. Outputs: a new model version (ΔMCS) or a failure.

**Duration:** `run_days = compute_budget / cluster_throughput`. Bigger clusters finish faster → compute buys *speed* as well as *size* (a reason to own GPUs vs. a small rental). The PFLOP-day *budget* in the table below is the compute **consumed** (hence the cost / money-sink); wall-clock is governed by the architecture node's timer (§3.1) × your cluster size, so a frontier lab with a multi-datacenter cluster consumes millions of PFLOP-days inside one run window while a laptop cannot.

**Run size scales steeply by tier (Decision C3 — the late-game compute sink).** At a flat spot price, a cheap run is a trivial sink for a $1B+ lab (the old ~$240k "frontier" run was ~0.02% of a Titan's net worth — Quant flagged this in `01 §13`). Fix: **hold the spot price flat and scale PFLOP-days per run steeply by tier**, so a typical frontier run costs ≈1–3% of a tier-4/5 net worth while early runs stay cheap. Reference net-worth bands are the AI-tier bands in §8.

| Tier (net-worth band, §8) | PFLOP-days / run | = GPU-hours / run | Spot $ cost ($0.12/GPUh) | ≈ % of typical net worth |
|---|---|---|---|---|
| T0 Laptop (<$100k) | 100 – 1,000 | 1k – 10k | $120 – $1,200 | ~0.3–1.5% |
| T1 Garage ($100k–$1M) | 1,000 – 5,000 | 10k – 50k | $1.2k – $6k | ~0.4–1.5% |
| T2 Startup ($1M–$20M) | 15,000 – 60,000 | 150k – 600k | $18k – $72k | ~0.3–1% |
| T3 Scale-up ($20M–$200M) | 200,000 – 800,000 | 2M – 8M | $240k – $960k | ~0.3–1.2% |
| T4 Frontier ($200M–$2B) | 4,000,000 – 12,000,000 | 40M – 120M | $4.8M – $14.4M | ~1–2% |
| T5 Hegemon ($2B+) | 35,000,000 – 120,000,000 | 350M – 1.2B | $42M – $144M | ~1–3% |

So a top frontier run is now a **$5M–$144M** decision (a real income sink for whales), while a T1/T2 player still trains for a few thousand dollars (unchanged affordability). Reserved contracts, owned hardware and chip shortages shift the price ±, but the headline sink is run **size**, not price — keeping Quant's single floating compute price intact (`01 §3.4`).

**Failure odds** (a run can fail = partial/total loss of the compute spend):
```
P(fail) = base(arch) × hparam_factor × data_risk_factor × scale_factor
```
- `base(arch)`: newer/bigger architectures riskier (Transformer 8%, Frontier stack 22%).
- `hparam_factor`: "quick & dirty" ×1.6, "careful" ×1.0, "ablation-heavy" ×0.7 (but slower & costlier).
- `data_risk_factor`: stolen/grey data raises instability (×1.3) — crime doesn't pay cleanly.
- `scale_factor`: pushing compute far past your tier's stable zone raises risk.
- Outcomes: **success** (full ΔMCS), **partial** (50–80% ΔMCS, happens ~25% of the time), **failure** (lose 60–100% of compute spend, small insight credit toward next run so it's not pure feel-bad).
- **Insurance / safety spend:** paying +15% for checkpointing reduces catastrophic failure loss (recover from last checkpoint).

### 3.3 Talent — AI researchers (hireable & poachable)
Researchers are staff units with stats: `skill (1–100)`, `specialty` (architectures / data / trading / security / safety), `salary`, `loyalty`, `equity demand`.

- **Effect:** each researcher reduces run failure odds, raises `A`, and unlocks specialty nodes faster. A star researcher (skill 90+, "named" rare hires like fictional luminaries) can single-handedly cut Frontier-run risk and add +1.0 A.
- **Hiring:** recruit from a talent pool; cost = signing bonus + salary + equity.
- **Poaching (multiplayer, Forge-plumbed):** you can make an offer to a *rival's* researcher. Success depends on your offer vs. their loyalty/equity and the rival's retention spend. Poaching a rival's lead researcher can **slow their roadmap and leak a small amount of know-how** (minor one-time `A` transfer) — a legal, non-cyber way to attack a rival's AI (complements Tape's hacking as "the other ways to catch/hurt them").
- **Burnout/attrition:** overworking (too many parallel runs) drops loyalty → flight risk.

---

## 4. AI product lines (what you actually deploy)

A trained model is specialized into a **product** via a deployment slot. Each product consumes **inference compute** continuously while active (OpEx), so deployment itself is a money sink that must pay for itself.

### 4.1 Trading AI (strategies)
The trading AI auto-executes against Quant's market engine. Strategy modules unlock via the tree; each has a capacity (AUM it can handle before alpha decays) and a regime fit.

| Strategy | Unlock (MCS/node) | Edge source | Best regime | Capacity decay |
|---|---|---|---|---|
| Momentum/trend | MCS 20 | autocorrelation | trending | medium |
| Mean-reversion | MCS 20 | overshoot | choppy | medium |
| Statistical arbitrage | MCS 60 | cointegration pairs | any | high (crowds fast) |
| Market making | MCS 50 | spread capture | calm/liquid | low (scales well) |
| Sentiment/news | MCS 80 (needs NLP) | alt-data + NLP | event-driven | medium |
| Cross-exchange/crypto arb | MCS 90 | latency + fragmentation | fragmented | high |
| HFT microstructure | MCS 120 (needs seq. models + low-latency colo) | order-book signal | liquid | very high (arms race) |

- **Alpha decay & crowding:** the more players (and NPCs) run the same strategy, the thinner the edge — Quant's engine prices in aggregate flow. Encourages continuous research instead of set-and-forget.
- **Capacity:** a strategy's $ return/day saturates with AUM: `pnl ≈ edge × min(AUM, capacity) − fees − slippage − inference_cost`. Forces diversification into multiple strategies/models.
- **Autonomy levels:** advisory (suggests trades), semi-auto (executes within guardrails), full-auto (hands-off, higher rogue-trade risk §9).

### 4.2 Research Analyst AI (signals product)
A model that outputs **signals/ratings** (buy/sell conviction, risk flags, event forecasts) to the player's dashboard rather than auto-trading. Lower risk, great for manual players (balance lever — AI *assists* human skill instead of replacing it). Can be **licensed** (§4.5).

### 4.3 Cyber-attack AI
We define it; **Tape owns resolution.** It produces an **Attack Power** score and capabilities (intrusion, data exfiltration, model-distillation payload, botnet compute hijack). Attack Power scales with MCS of the security-specialized model + exploit-corpus data quality + security-researcher talent. Output handed to Tape's conflict engine, which compares it to the target's defense stack, rolls detection, and triggers court on getting caught. See §6.

**Attack Power (AP) ranges per tier (Decision B2, confirmed with Tape).** `AP = round(security_MCS · q)`, with `q ∈ [0.8, 1.3]` from exploit-corpus data quality + security-researcher talent:

| Tier | AP range |
|---|---|
| T0 | 5 – 20 |
| T1 | 20 – 60 |
| T2 | 60 – 200 |
| T3 | 200 – 600 |
| T4 | 600 – 2,000 |
| T5 | 2,000 – 5,000 |

Joint ops combine as `AP_max + 0.5·Σ(others)`, capped at 5 contributors (Tape `03 §1`).

**Quiet intrusions plant hidden sessions (Mathis's call, Tape `03 §4.6`).** A successful quiet breach no longer pays out instantly. It installs a **hidden session** — one more entry in the victim's model connections list, with no alarm — and loot (a stolen dataset copy, a distillation of the model, hijacked compute, or an order-feed tap) **builds up over time while the session stays connected**, never reaching 100%. The attacker picks the session **strength at launch**, trading speed against stealth:

| Strength | Breach bias | Copy rate k /hr | Victim DU drain | Clue rate /hr | Easier to spot (scan ×) |
|---|---|---|---|---|---|
| Whisper | +0.5 (easier to plant) | 0.02 | 2% | 0.03 | ×0.6 |
| Tap | 0 | 0.05 | 5% | 0.07 | ×1.0 |
| Siphon | −0.5 (harder to plant) | 0.12 | 10% | 0.14 | ×1.6 |

Loud ops (ransomware, AI sabotage) still resolve instantly and alert the victim, as before. The per-attacker **live-session cap is my AI tier**: T0–T1 1, T2 2, T3 3, T4 4, T5 5 concurrent sessions; max 3 hostile sessions per victim and ≤20% total DU drain on one victim (Tape `03 §4.6.3`). Compute-hijack loot (op 7) is capped by **C3b** (loot ≤ 5% of the victim's owned+reserved throughput per game day, and ≤ 25% of the attacker's tier run-midpoint from C3; see `RESOLVED-NUMBERS.md`).

### 4.4 Cyber-defense AI
We define it; **Tape owns the defense stack & scaling-with-wealth.** It produces a **Defense Power** score (intrusion detection, anomaly monitoring, honeypots, watermark-tracing to catch distillers). From the AI tree's side, Defense Power scales with a security model's MCS + fresh exploit/telemetry data + talent. Note: defense is partly *buyable with money* (Tape's cybersecurity spend) and partly *built with AI* — so both the rich non-AI player and the AI player have a path to protection.

**Defense Power (DP_ai) ranges (Decision B2).** Same formula as AP, but defense output is **0.8× AP at equal tier** (a pure-AI defender is intentionally a shade behind a pure-AI attacker — defense is meant to be *money + AI* combined, not AI alone): `DP_ai = round(defense_MCS · q · 0.8)`. Ranges: T0 4–16 · T1 16–48 · T2 48–160 · T3 160–480 · T4 480–1,600 · T5 1,600–4,000. Tape folds DP_ai into `DP_eff = (DP_ai + DP_money + 10)·coverage·patch·SOC·IR` (`03 §4.2`).

**Defense-AI auto-scan by tier (hidden-session detection, Tape `03 §4.6.5`).** The defender's AI periodically scans the connections list for hidden sessions; a higher-tier defense AI scans **more often** and with a higher per-scan hit chance. A scan never false-flags a legitimate entry; `p_scan = clamp(s_tier · m · √clamp(DP_eff/AP, 0.25, 4), 0.02, 0.90)` where `m` is the attacker's strength multiplier above. Scans run even while the victim is offline — a good defense AI guards you while you sleep.

| Defense AI tier | Auto-scan every | s_tier |
|---|---|---|
| T0 | never (manual deep scan only) | — |
| T1 | 24 h | 0.15 |
| T2 | 12 h | 0.20 |
| T3 | 6 h | 0.25 |
| T4 | 4 h | 0.30 |
| T5 | 2 h | 0.35 |

Manual deep scan (any tier): $5k + 0.01% of NW, 30 min, uses s = 0.50, 6 h cooldown. This is the AI-tree reason to invest in a defense model even if you never attack: it is what finds the session before the thief finishes copying.

### 4.5 Licensing / AI-as-a-service (revenue line)
Turn a trained model into recurring income:
- **License to NPC businesses:** passive $/day based on model MCS and market demand (demand fluctuates with Quant's economy). Low effort, steady, but exposes you (a licensed model can be targeted for distillation by the licensee — risk/reward).
- **License/rent to other players:** Forge-plumbed marketplace. You set price; they get capped API access (not the weights). Good monetization, but every query **leaks gradient/behavioral signal** a savvy licensee could use to *distill you cheaply* (§5) — so licensing your crown-jewel model is dangerous.
- **Sell a model outright / sell compute / sell datasets:** one-time liquidity; secondary market tie-in with Quant's commodity markets.

---

## 5. Distillation — stealing a model (attacker's mechanics)

The seed's signature feature. Here we define *what distillation is and gives you*; **Tape owns the hack resolution, detection roll, and court.**

### 5.1 How it works mechanically (hidden-session model, Mathis's call)
Two routes to distill a rival model:
1. **Distillation session (hack, op 5 in Tape `03 §3`):** the cyber-attack AI breaches the target and plants a **hidden session** on its model (no alarm, one extra entry in the connections list). While the session stays connected, you copy the model **progressively** — it never finishes. This replaces the old one-shot "weight theft". Resolution, detection and court → Tape.
2. **Query distillation (grey, op 6):** if you hold a real **license** to the model, you query it and train a student to mimic it. Not a hack; it keeps the license route and query-anomaly detection (`03 §6.3`). Slower, quieter, lower (nonzero) legal risk.

**Progress, not a copy.** A session's progress `P` rises along `P(t) = 0.85 · (1 − e^(−k·h_eff))` with copy rate `k` set by session strength (§4.3) and `h_eff = online_hours + 0.25·offline_hours` (copying slows to a quarter while the victim is offline; one offline stretch adds at most +0.08). The **ceiling is 0.85 — never 100%** (Tape `03 §4.6.2`). The student you can build is then:
```
student_MCS = teacher_MCS · min( P , retention_raw ) ,   capped by your_arch_ceiling
retention_raw ≈ 0.6–0.9   (↑ with your A, researcher skill, defense you beat)
P ≤ 0.85                   (session progress at the moment it ends)
```
- **Residue scales with how much you copied (CONFIRMED to Tape, `03 §4.6.2`):** `residue_raw = residue_Ledger · (0.4 + 0.6·P/0.85)`. A short session → a weak student with faint residue; a long one → a strong student that is easy to trace. Then §5.2 laundering applies (residue floor 0.03).
- You can **never fully exceed** the teacher by stealing: the 0.85 session ceiling × retention < 1 means theft is a *fast catch-up*, not a permanent lead — you still must out-research to pass them. The victim can end it early by noticing and disconnecting the entry (§4.4), so a well-defended whale's crown jewel leaks only a dent (median P ≈ 0.15–0.35), not a clone.
- Distilling gives you its **capability**, optionally its **strategy modules**, and a snapshot of its **edge** — but inherits its *staleness*: a stolen model decays as markets move unless you keep training.

### 5.2 Detection & watermarking (defender's safety net — Tape owns the court outcome)
- Every deployed/licensed model carries an invisible **watermark** (statistical fingerprint in its outputs). A student trained on watermarked outputs carries a **traceable residue** with probability rising with how much you distilled.
- When a victim (or regulator) runs a **forensic audit**, matching watermark residue = evidence → Tape's court flow (fines, paying the victim, or asset seizure).
- Counter-forensics (attacker): "laundering" the student with extra clean data or noise lowers watermark residue but also lowers retention (edge cost of staying hidden). **Constants (Decision B1, confirmed with Tape):** `residue_after = residue_raw · (1 − 0.7·laundering_level)` and `retention_after = retention_raw · (1 − 0.35·laundering_level)`; laundering cost ≈ 25–60% of the original distillation run. **Residue floor = 0.03** — residue never reaches 0, so a fully laundered student is both weaker (−35% retention) *and* still faintly traceable. Pure risk/reward dial.
- Defenders can set **honeypot models** (fake weights that, if distilled, flag the thief and poison the student with bad trades). **Poison strength by honeypot tier (Decision B3):** basic $30k → poison 0.20 · advanced $120k → 0.40 · frontier $400k → 0.60 (cap 0.60 so a poisoned student still trades — no grief cascade). Poison multiplies the student's trading edge by `(1 − poison)`; Tape owns the court/damages side (`03 §6.6`).

### 5.3 Economic shape
- Cost to distill scales with target's **defense spend** (seed: rich players pay for cybersecurity → very expensive to hack) and target's MCS.
- So the richest, best-defended frontier labs are *expensive* to steal from but the *most valuable* if you succeed — the seed's "the richer you are, the bigger your edge, but there are other ways" tension, now numeric.

---

## 6. How the AI branch touches conflict (handoff table to Tape)

| We provide (AI tree) | Tape consumes / owns |
|---|---|
| Attack Power score + capability flags | Breach attempt resolution vs. Defense Power; detection roll |
| Defense Power score + watermark/honeypot config | The scaling-with-wealth cybersecurity spend, catch mechanics |
| Distillation payload (retention, watermark residue) | Court trigger, evidence weighting, fines/fees/pay-the-victim |
| Botnet compute hijack amount | Legal risk accrual, getting-caught timeline |
| Poaching know-how leak (legal) | N/A (legal path; stays in AI/HR), but Tape may flag trade-secret suits |

---

## 7. AI-specific risks (money & reputation sinks)

1. **Model drift:** deployed models silently lose edge as markets move; `edge(t) = edge₀ × 0.5^(days_since_retrain / drift_halflife)`. Ignoring retrains = slow bleed. Visible "model health" meter.
2. **Rogue trading losses:** full-auto trading AI, in a regime it wasn't trained for (e.g. a Quant flash-crash event), can take outsized losses or hit a **feedback loop**. Guardrails (position limits, kill switch) cost a bit of edge but cap tail losses. A spectacular blow-up is a leaderboard-shuffling event.
3. **Regulator crackdowns:** macro events (Tape/Quant) — e.g. "AI trading ban in region X", "model registration required", "alt-data privacy ruling" — can suspend strategies, force audits, or fine undisclosed models. Lobbying/compliance spend mitigates.
4. **AI safety incidents:** rare tail event on frontier/full-auto models — a misalignment incident causes losses + reputation hit + regulator attention. Investing in an **AI safety / alignment team** (a talent specialty) lowers incident odds and is a prerequisite for the top "trusted frontier lab" prestige tier (ties to Velvet's prestige + a mild morality dimension).
5. **Model collapse (synthetic over-reliance):** see §9.

---

## 8. Progression tiers (laptop → frontier lab)

| Tier | Name | Compute | Typical net worth | Capability unlocked | Flavor |
|---|---|---|---|---|---|
| 0 | Laptop script | 1 consumer GPU / spot rental | < $100k | handcrafted + classic ML signals; advisory only | "coding in your bedroom" |
| 1 | Garage startup | few T2 cards | $100k–$1M | deep nets, sentiment, semi-auto trading | first hire |
| 2 | Funded startup | small T3 cluster + cloud | $1M–$20M | transformers, analyst AI product, licensing begins | real data center |
| 3 | Scale-up lab | T3/T4 cluster, data partnerships | $20M–$200M | MoE/RL, multiple strategies, cyber line viable | poaching wars |
| 4 | Frontier lab | T4/T5 pods, exclusive data | $200M–$2B+ | frontier scaling stack, strong attack/defense, distillation-proofing | leaderboard contender |
| 5 | Hegemon | multi-datacenter, secret sauce | $2B+ | proprietary A≈12, licenses to the whole market, hardest to steal from | endgame flex (Velvet) |

Each tier gates buyable hardware, data slots, and node prereqs, so the AI journey mirrors the wealth journey.

---

## 9. Model collapse & the synthetic-data trap (anti-exploit)

Synthetic data is tempting (compute-only, always fresh), but to stop a degenerate "infinite free data" strategy:
```
effective_synthetic_quality = your_model_quality × (1 − synthetic_ratio^2)
```
Past ~40% synthetic ratio, marginal DQU turns negative (collapse). Forces continued real-data spend → keeps data brokers, partnerships, and *stealing* economically relevant. (Protects the whole data economy Quant and Tape depend on.)

---

## 10. Interaction with money & leaderboard

- **Money:** AI is a flywheel — spend $ → compute+data+talent → MCS → trading PnL / licensing / successful heists → more $. But every stage has OpEx (energy, salaries, inference, retrains) that punishes neglected models. A player can over-invest in AI and go bankrupt before it pays off (real failure path).
- **Leaderboard:** net worth is the primary rank (Velvet/Forge own display). AI contributes indirectly (PnL, licensing revenue, stolen edge) and can enable **secondary ladders** — e.g. "Top Labs" (highest MCS), "Most Feared" (successful distillations), "Cleanest" (frontier with zero court losses) — giving AI players prestige even when a non-AI tycoon tops net worth.
- **Multiplayer conflict:** AI is both weapon (attack/distill/poach) and target (your crown-jewel model is loot). Richer = better defended = the seed's edge; AI gives *underdogs* an asymmetric way to punch up (a cheap query-distillation of a whale's model), which is good for engagement/fairness (coordinate with Tape on catch-up mechanics).

---

## 11. Representative worked example (tuning sanity-check)

*Tier-2 player, "one more run":*
- Buys 20× DX-100 ($800k CapEx) in an owned DC; energy ~$62/day.
- A T2 run now consumes ~25,000 PFLOP-days = 250,000 GPUh = **$30,000** at $0.12/GPUh (Decision C3), ≈0.4% of an $8M tier-2 net worth — a real but affordable spend (the old doc's $240 was far too cheap).
- Dataset: broker equities (quality 0.85) + a scraped sentiment set (quality 0.5, grey). Balanced near D*.
- "Careful" hparams, one skill-70 researcher → P(fail) ≈ 9%.
- Result (success): MCS 60 → 95, unlocks market-making + sentiment strategy.
- Deploys market-making at $2M AUM: ~$3–5k/day gross, −$0.9k/day inference/energy → ~$2.5–4k/day net. Payback on the run in ~a few weeks *if* no drift/crackdown.
This should feel like a meaningful but not instant power jump — tune `k`, `α`, `β`, capacities so payback is 2–8 weeks at each tier.

---

## 12. Balance — powerful AI without killing manual play

1. **Hard money gates + OpEx:** AI needs capital the early player doesn't have; the bootstrap must come from manual trading/business. You *earn your way* into AI.
2. **AI has a ceiling per $, markets are deep:** at any tier, a skilled manual trader reading Quant's regimes + events can match a comparably funded AI player; AI mainly saves attention and scales, it doesn't conjure alpha from nothing.
3. **Alpha decay & crowding:** popular AI strategies self-neutralize, so AI can't be a static autopilot. Manual players exploiting niche/event plays stay competitive.
4. **Analyst AI as the bridge:** the lowest-risk AI product *assists* manual play (signals), so manual players adopt AI as a tool rather than being replaced by it.
5. **Risk symmetry:** AI adds failure modes manual play lacks (rogue trades, crackdowns, being distilled). More power, more tail risk.
6. **Theft ≤ research:** distillation caps below the teacher (retention<1) and is traceable, so you can't win purely by stealing.
7. **Dual ladders:** net-worth leaderboard keeps non-AI tycoons on top-line parity; AI gets its own prestige ladders. No single "AI wins everything" rank.
8. **Attention tax:** running many models/strategies demands active management (retrains, guardrails, defense) — AI trades money-for-leverage but costs *attention*, preserving skill expression.

---

## 13. Open questions

1. **Time scale:** do training runs tick in real wall-clock, game-accelerated time, or offline-progress (mobile needs offline)? Affects all timers — needs Forge's world-clock decision.
2. **Compute: shared global pool vs. per-player?** A shared GPU market with real scarcity is richer but harder to balance across player counts. Depends on Quant's commodity model + Forge's session design.
3. **How visible is a rival's MCS/defense?** Full fog-of-war (scout to learn) vs. partial public "lab reputation". Impacts whether attacks are informed gambles.
4. **Weights vs. API in licensing:** do we ever let weights change hands, or is it always API/distillation? (Security + exploit surface.)
5. **Morality/prestige dimension:** should "clean" vs. "criminal" AI paths have reputational mechanics (with NPCs, hiring, regulators), or stay purely economic? (Velvet + Tape.)
6. **PvE floor:** how strong are NPC labs so solo/low-pop servers still feel alive?
7. **Catch-up for underdogs:** exact strength of asymmetric distillation so whales are threatened but not grief-farmed (Tape fairness).
8. **Numerical calibration:** final α, β, k, capacities, failure bases — needs a sim pass with Quant's engine before locking.

---

## 14. Touchpoints with each section

**→ 01 Markets & Economy (Quant)**
- GPU price index + chip-shortage event; energy/power commodity market; secondary markets for selling models/compute/datasets; the market engine the trading AI executes against; alpha-decay/crowding pricing of AI flow; data-broker subscriptions as a market.

**→ 02 Multiplayer Systems (Forge)**
- World clock / tick rate driving run timers + offline progress; licensing & compute-leasing marketplace plumbing; researcher poaching flow; fog-of-war on rival lab stats; matchmaking so attack/distill targets are fair; secondary leaderboards ("Top Labs", "Most Feared").

**→ 03 Conflict, Legal & Fairness (Tape)**
- We hand off Attack/Defense Power, distillation payload + watermark residue, botnet hijack; Tape owns breach resolution, detection, honeypots, court (fees/fines/pay-the-victim), scaling-defense-with-wealth, and underdog fairness/anti-grief. Poaching know-how leak may touch trade-secret suits.

**→ 04 Experience & Lifestyle (Velvet)**
- Lab UI, run-planner UX, model-health meters, researcher avatars/morale; prestige of owning a frontier lab / "trusted lab" badge; flex of licensing to the whole market; AI-safety "clean lab" prestige; onboarding that teaches AI as an *optional* deep branch.
