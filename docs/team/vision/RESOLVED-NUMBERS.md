# RESOLVED-NUMBERS.md
### Hard numbers teammates must sync into their sections
Compiled by Ledger, 2026-10-07. Decisions (a), (b), (c) requested by the team, plus any other number a section must update. Full rationale is in `MASTER-BIBLE.md` PART III. Grouped by owner.

---

## FORGE (`02-multiplayer-systems.md`) — update §4 AI agents, §12.1 monorepo

### (a) Per-tier AI decision-unit (DU) budget — RESOLVED
`DU = evaluate one signal on one symbol` (your definition). Keep the **2,000 DU/tick hard cap per player**. Add a **per-world cap = 3,000,000 DU/tick**; if exceeded, scale every AI down proportionally (diegetic "compute shortage" → raises Quant's compute price).

| AI tier (Ledger `05 §8`) | Cadence (how often it runs) | Base DU per evaluation | Effective DU/tick |
|---|---|---|---|
| T0 Laptop script | every 6 ticks | 30 | 5 |
| T1 Garage startup | every 6 ticks | 90 | 15 |
| T2 Funded startup | every 3 ticks | 300 | 100 |
| T3 Scale-up lab | every 2 ticks | 800 | 400 |
| T4 Frontier lab | every tick | 1,500 | 1,500 |
| T5 Hegemon | every tick | 2,000 (= hard cap) | 2,000 |

- **Compute → DU scaling:** `DU_cap(player) = min(2000, base_tier + 0.5·sqrt(PFLOP_days_available))`. Owning/renting more in-game compute raises the cap up to 2,000.
- **Sanity check:** at a realistic tier mix (T0 40% / T1 30% / T2 18% / T3 8% / T4 3% / T5 1%) the average is ~121 effective DU/tick/agent → ~2.43M DU/tick for 20k agents, inside the 3.0M/world cap and your ~600 ms AI-phase budget with worker threads. Replace with a measured benchmark at first run.
- **Keep separate:** DU = server CPU cap (yours). In-game compute (PFLOP-days/GPUh) = priced commodity (Quant/Ledger). Do not conflate.

### Other
- **Engine location:** `src/engine/` for the Phase-0 prototype; move to `packages/engine` (path alias) at the server phase. (Already your plan — confirmed.)

---

## TAPE (`03-conflict-legal-fairness.md`) — update §1, §6.2, §6.6, §10.4

### (Mathis changes) — acknowledged by Ledger, already in your `03 §4.1/§4.6`
- **Breach floor 1%** (not 3%): confirmed consistent with `05` v2 (§4.3) and this file's one-liners.
- **Hidden-session hacking** (`03 §4.6`): `05` now matches — distillation session `student_MCS = teacher_MCS·min(P, retention_raw)` with ceiling **P_max = 0.85**, residue `residue_raw = residue_Ledger·(0.4+0.6·P/0.85)` (**Ledger CONFIRMS** the scaling), Whisper/Tap/Siphon strengths, and the defense-AI **auto-scan-by-tier** cadence (T1 24h/0.15 … T5 2h/0.35) are folded into `05 §4.3–4.4, §5.1`.
- **Op 7 compute-hijack loot cap = C3b** (now formally defined in the Quant block): ≤5% victim throughput/game-day and ≤25% of attacker tier run-midpoint.

### (b) Laundering constants — CONFIRMED
- `residue_after = residue_raw · (1 − 0.7·laundering_level)` — **0.7 CONFIRMED.**
- `retention_after = retention_raw · (1 − 0.35·laundering_level)` — **0.35 CONFIRMED.**
- **Add:** residue floor **0.03** (residue never reaches 0). At full laundering a 0.85-retention / 300-MCS teacher → ~0.55 retention → ~166-MCS student, matching your §6.2 example.

### (b) AP / DP_ai ranges per tier — CONFIRMED
| Tier | AP range | DP_ai (= 0.8 × AP) |
|---|---|---|
| T0 | 5–20 | 4–16 |
| T1 | 20–60 | 16–48 |
| T2 | 60–200 | 48–160 |
| T3 | 200–600 | 160–480 |
| T4 | 600–2,000 | 480–1,600 |
| T5 | 2,000–5,000 | 1,600–4,000 |

- Derivation: `AP = round(security_MCS · q)`, `DP_ai = round(defense_MCS · q)`, `q ∈ [0.8, 1.3]` from exploit-data quality + security talent. The **0.8×** for defense is intentional (a pure-AI defender is slightly behind a pure-AI attacker; defense is meant to be money + AI). Your §4.5 worked examples (Owner DP_ai 20, Mogul 180, Titan 2,000; attacker AP 150) are consistent — no changes needed there.

### (b) Honeypot poison strength per tier — RESOLVED (you left this to me, §6.6)
| Honeypot tier | Cost | Poison inherited by the thief's student |
|---|---|---|
| Basic | $30k | 0.20 |
| Advanced | $120k | 0.40 |
| Frontier | $400k | 0.60 |
Cap 0.60 so a poisoned model still trades (no liquidation-cascade grief, per your §6.6 harness check).

### Other
- **Regulator capacity knob** (`03 §10.4`) is **yours**, not Ledger's — small wording fix ("tunable by Ledger" → tunable by Tape). Ledger owns only AI-tree knobs.

---

## QUANT (`01-markets-economy.md`) — update §3.4 Compute commodity, §4.3/§3.4 supply sizing, §8.1 faucets

### (c) Compute unit — RESOLVED (PFLOP-day ↔ GPU-hour)
- **Canonical engine unit = PFLOP-day. Market/display unit = GPU-hour (GPUh).**
- **`1 PFLOP-day = 10 GPUh`** (reference accelerator = 2.4 PFLOP/s sustained ≈ the DX-100 datacenter class in `05 §1.1`).
- Price bridge: **spot $1.2/PFLOP-day = $0.12/GPUh**; reserved $2.0 = $0.20/GPUh; owned-GPU energy ~$0.15 = $0.015/GPUh.
- Your "Compute (GPU-hours)" commodity quotes the floating **$/GPUh**; the engine multiplies quantity ×10 for PFLOP-day math. One source of truth.

### (c)/compute supply — typical AI compute *demand* per training run (to size data-center supply)
| AI tier | PFLOP-days / run | = GPU-hours / run |
|---|---|---|
| T0 | 1–5 | 10–50 |
| T1 | 10–50 | 100–500 |
| T2 | 100–400 | 1k–4k |
| T3 | 1,000–5,000 | 10k–50k |
| T4 | 20,000–100,000 | 200k–1M |
| T5 | 200,000+ | 2M+ |
Use this as the player-side demand curve against NPC + player DC supply when setting the compute price and chip-shortage events.

### (NEW) C3 — Steep per-tier training-run sizing (the late-game compute sink) — RESOLVED
Your `01 §13` flag: at the flat spot price a T5 run was only ~$240k (~0.02% of a Titan's net worth) — too weak a sink. **Fix: keep the spot price flat ($0.12/GPUh, floating with demand per your §3.4) and scale run SIZE steeply by tier.** This is the authoritative run-size/cost table (replaces the looser C2 figures above for *cost* purposes; C2 stays as the rough supply-sizing demand curve):

| Tier (net-worth band) | PFLOP-days / run | = GPU-hours / run | Spot $ cost | ≈ % of typical NW |
|---|---|---|---|---|
| T0 (<$100k) | 100 – 1,000 | 1k – 10k | $120 – $1,200 | ~0.3–1.5% |
| T1 ($100k–$1M) | 1,000 – 5,000 | 10k – 50k | $1.2k – $6k | ~0.4–1.5% |
| T2 ($1M–$20M) | 15,000 – 60,000 | 150k – 600k | $18k – $72k | ~0.3–1% |
| T3 ($20M–$200M) | 200,000 – 800,000 | 2M – 8M | $240k – $960k | ~0.3–1.2% |
| T4 ($200M–$2B) | 4,000,000 – 12,000,000 | 40M – 120M | $4.8M – $14.4M | ~1–2% |
| T5 ($2B+) | 35,000,000 – 120,000,000 | 350M – 1.2B | $42M – $144M | ~1–3% |

A top frontier run is now a $5M–$144M decision (meaningful income sink for whales); a T1/T2 run stays a few $k (early players unhurt). The sink comes from run size, not an inflated price — your single floating compute price is intact.

### (NEW) C3b — Compute-hijack loot cap (op 7 hidden session) — RESOLVED
Tape's hidden-session op 7 (`03 §4.6.2`) drains the victim's compute while connected. Cap the loot at **min( 5% of the victim's owned + reserved throughput per game day , 25% of the attacker's tier run-midpoint from C3 )**. Keeps a hijack useful (it funds a chunk of one of the attacker's own runs) without letting a whale's cluster be strip-mined. Hijacked PFLOP-days are a **transfer** of compute-value, not a mint.

### Persistent-world note (Mathis): compute demand sizing
With one persistent world, your `01 §14` / §3.4 sizing already targets players at ~10–20% of world compute demand "per season" — read "season" as a ladder chapter; nothing about the compute market changes, the run-size table (C3) and $0.12/GPUh spot are unchanged.

### Other
- **Onboarding faucet:** add the one-time **Retail-broker grant ≈ $250/player** (Velvet `04 §4.2`) to your §8.1 faucet accounting.

---

## LEDGER (`05-ai-research.md`) — self-sync (my own revisions)
To fold into a `05` v2 so my section carries these shared numbers:
- Add the **AP/DP_ai tier ranges** (B2) and `AP = round(MCS·q)` formula.
- Add the **GPU-hour conversion** (`1 PFLOP-day = 10 GPUh`, $0.12/GPUh spot) alongside my PFLOP-day pricing.
- Add the **DU budget table + compute→DU formula** (A1) to §4 (server execution).
- Add **honeypot poison strength** (basic/advanced/frontier = 0.2/0.4/0.6) to §5.2.
- Add **residue floor 0.03** to the distillation/laundering math.
- Add the **per-tier run-compute table** (C2) so Quant's DC-supply sizing stays linked to my tree.
- Add the **steep per-tier run-size/cost table** (C3) in §3.2 as the late-game compute sink (done in `05` v2); reconcile the §11 worked example to it. *(Folded into `05` v2.)*
- **Mathis changes (folded into `05`):** (1) all "season/server" wording now means a persistent-world ladder chapter, not a wipe; (2) breach floor **1%**; (3) distillation is a **hidden session** — §5.1 rewritten (progress `P` up to 0.85, residue scales with `P`), §4.3 adds session planting (Whisper/Tap/Siphon), §4.4 adds the defense-AI **auto-scan-by-tier** table. DU cap is now **per-partition** (invisible shards), not per-world.
- **CONFIRMED to Tape (`03 §4.6.2`):** residue-vs-progress scaling `residue_raw = residue_Ledger·(0.4 + 0.6·P/0.85)` — accepted as-is.
- **Formalized C3b** (compute-hijack loot cap) — see Quant block.

---

### One-line conversions to memorize (everyone)
- `1 PFLOP-day = 10 GPU-hours` · spot compute ≈ `$0.12 / GPU-hour`.
- AI DU hard cap `= 2,000 DU/tick/player`; per-world `= 3.0M DU/tick`.
- Laundering: residue ×(1−0.7·L), retention ×(1−0.35·L), residue floor 0.03.
- DP_ai `= 0.8 × AP` at equal tier; **breach floor 1%** (Mathis's call, was 3%), ceiling 90%.
- Hidden-session distillation: `student_MCS = teacher_MCS · min(P, retention_raw)`, progress `P = 0.85·(1−e^(−k·h_eff))`, ceiling **0.85**; `residue_raw = residue_Ledger·(0.4 + 0.6·P/0.85)`.
- Compute-hijack loot cap (C3b): ≤ 5% of victim owned+reserved throughput/game-day AND ≤ 25% of attacker's tier run-midpoint (C3).
- Training-run size scales steeply by tier (C3): T4 frontier run ≈ 4–12M PFLOP-days = $4.8M–$14.4M; T5 ≈ 35–120M PFLOP-days = $42M–$144M; spot price stays flat at $0.12/GPUh.

## Follow-ups to C3 (approved by Ledger, 2026-10-07 13:35)

- **C3a (Forge, §4 of 02):** compute-to-DU bonus is now relative to tier, replacing `0.5·√PFLOP-days`:
  `DU_cap = min(2000, base_tier · (1 + 0.25·min(1, compute_owned / tier_run_midpoint)))`.
  Max +25% per tier. Worst case is about 2.9M DU for 20k agents, inside the 3.0M world cap. 05 §2.5 follows this formula.
- **C3b (Tape, §3 of 03):** compute-hijack loot cap is `min(5% of victim daily throughput, 25% of attacker's tier run midpoint)`. Loot can only be used on the attacker's own runs, is non-resellable, and expires after 1 game day.
- **C3c (Quant, §3.4.1 of 01):** compute demand re-sized to the C3 run table. NPC demand is set so players are 10–20% of world compute; a base data center covers about 1/110 of player demand; T4/T5 drive about 80% of compute spend.

---

## CONFLICTS & DOC-HYGIENE LOG (2026-10-07, after Mathis's calls)

Resolved here or flagged to the owner; none block Phase 0–2.

1. **Decision-ID label drift (flag for Forge).** `02 §1` cites "A1 + C3a" for DU budgets, and `03 §4.6.2` cites "C3b". Canonical IDs are: **A1** = per-tier DU budget; **C3** = per-tier training-run size; **C3b** = compute-hijack loot cap (newly formalized above). *Action: Forge, read "C3a" as "A1" (there is no C3a).* No mechanical conflict — labels only.
2. **DU cap scope: per-world → per-partition (resolved).** `05` v2 said "per-world 3.0M DU/tick"; with one persistent world (Forge `02 §4`) it is **per invisible partition** (~25k agents) with a world-wide proportional scale-down. `05 §2.5` updated to match.
3. **Stale "builds-on" preambles (flag, cosmetic).** `03` line 6 still says Forge is "~20k registered / 4k CCU **per world**", and `04` line 7 lists Forge as "**season worlds**, leagues". Both docs correctly implement the persistent world in their bodies; only the opening cross-reference lines are stale. *Action: Tape + Velvet, refresh those one-liners when convenient.* Non-blocking.
4. **"Season" wording everywhere now means a ladder chapter, not a wipe** (Quant `01 §14`, Forge `02 §2.3`, Velvet `04 §8.4`, Ledger `05` status note). No numeric change; AUC halvings, depeg odds, crisis odds, etc. still cadence on the 8-week chapter.
5. **No remaining hard numeric contradictions** across `01`–`05` after the above. AP/DP ranges, laundering 0.7/0.35 + 0.03 floor, honeypot poison 0.2/0.4/0.6, 1 PFLOP-day = 10 GPUh @ $0.12/GPUh, DU table, C3 run sizes, C3b hijack cap, and the hidden-session formulas are identical in every file that cites them.
