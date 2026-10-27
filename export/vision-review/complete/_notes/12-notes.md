# 12-notes — Conflict and Intelligence

## 1. Parameters introduced

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| PARAM.breach_floor | 0.01 | fixed (L2) | prob | min breach chance when AP ≥ DP_eff/8 |
| PARAM.breach_ceiling | 0.90 | 0.80–0.95 | prob | max breach chance |
| PARAM.joint_op_max_contributors | 5 | 3–8 | count | cap on joint-op AP stacking |
| PARAM.defense_unit_price | $10,000 | 5k–20k | Money/unit/yr | converts defense spend to budget units |
| PARAM.perimeter_cost_per_unit | $2,000 | 1k–4k | Money/unit/yr | perimeter layer cost |
| PARAM.patch_decay_per_real_day | 0.02 | 0.01–0.04 | /day | security debt decay toward 0.6 |
| PARAM.zero_day_duration | 3–7 | 1–10 | real days | zero-day patch penalty window |
| PARAM.pandemic_hack_rate_trigger | 25 | 15–40 | ops/1k active/game day | cyber-pandemic crisis trigger |
| PARAM.session_ceiling | 0.85 | fixed (L3) | fraction | max distillation progress P |
| PARAM.session_offline_mult | 0.25 | 0.1–0.4 | mult | offline accrual slowdown |
| PARAM.session_max_lifetime_ticks | 7 real days | 3–10 real days | ticks | hidden-session lifetime |
| PARAM.sessions_per_victim_max | 3 | 2–4 | count | hostile sessions per victim |
| PARAM.victim_drain_cap | 0.20 | 0.15–0.30 | fraction | total hostile DU drain cap per victim |
| PARAM.decoy_rate_per_real_hour | 0.05 | 0.03–0.08 | /hr | benign anomaly rate per account (~1.2/day) |
| PARAM.npc_crew_ops_per_1000_active | 2 | 1–5 | ops/1k/game day | NPC criminal crew activity |

Session strength constants (Whisper/Tap/Siphon: b_op bias +0.5/0/−0.5, k 0.02/0.05/0.12, drain 2/5/10%, clue 0.03/0.07/0.14, scan m 0.6/1.0/1.6), auto-scan s_tier (T1 0.15 … T5 0.35) and the op-catalog cost/prep/AP/noise values are all inline in §3.7 and §3.9; they are kept verbatim from RESOLVED-NUMBERS and old vision 03/05 so they belong in 23 as fixed constants, not re-defaulted.

## 2. Decisions / DEFAULTs chosen and old questions resolved

- Renamed the 12 cyber ops and 8 espionage ops to abstract game verbs (C01–C12, E1–E8) per the safety rule; mechanics unchanged. (§3.9)
- Added market-conduct ops M1–M4 as first-class verbs (V3 Part 6, K01–K07); 12 defines verbs, 05 computes surveillance score, 13 prosecutes. (§3.11)
- DEFAULT: `AttackCapability.crewGrade` and physical-crew resolution for E5 reuse the breach logistic with AP→crewGrade vs physicalSecurityGrade. (§3.9)
- DEFAULT: budget allocation modes AUTO_EVEN / AUTO_VALUE / MANUAL; AUTO_VALUE weights by sqrt(value). (§3.3)
- Resolved old 03 §19 Q1 (crime tone): abstract corporate-thriller verbs. Q5 (physical espionage): included (E5), physical-security-only defense. (These were Mathis-confirmed in the bible; restated.)
- Confirmed heat multiplies exposure only, never breach/detection (bible row 4). (§3.1)

## 3. Interfaces assumed from other modules

- **11 AI Lab:** provides `AttackCapability.ap` = round(security_MCS·q), `DefenseProfile.dpAi` = round(defense_MCS·q·0.8), the AI tier, model distillation math `student_MCS = teacher_MCS·min(P, retention_raw)`, `residue_base`, laundering (residue ×(1−0.7·L) floor 0.03, retention ×(1−0.35·L)), honeypot poison 0.20/0.40/0.60. Recomputed hourly.
- **05 Markets:** `surveillanceScore(playerId, window) ∈ [0,100]` per game day; position/short-interest caps; belief/news price model for M1–M3; compute spot price for C07 loot valuation; DU budget per AI tier.
- **02 Time/Engine:** `streamHash(worldSeed, 'conflict', tick)` RNG stream; presence (open socket or intent in last 15 real min); replay API for tick-range citations; P10 slot.
- **15 Social:** `linkedAccounts(a,b)` collusion query; contract termination clauses on disconnect; filings for OSINT; Most Wanted/Defender board display; P2P caps.
- **13 Law:** consumes EvidenceSource rows, surveillance flags, world hack rate; owns grading, courts, sanctions, op-ban application (writes `opBanUntilTick`), insurance claims, anti-grief enforcement.
- **14 Lifestyle:** Prestige PP (heat), Notoriety (Back Room gating), physicalSecurityGrade from homes, the Connections panel / Security Ops / ops planner screen look.
- **09 Businesses:** staff rosters (for StaffLoyalty), player-owned cyber/PI/data/law firms as service nodes and vendor links.
- **03 Ledger:** reason codes `CONFLICT_*`; marked net worth; faucet/sink tagging.

## 4. Content needed in catalogs (22)

- 4 regulators already named in 13 (ECA, CMA, Revenue, CyberCert); 12 references them.
- NPC services invented here: NPC criminal crews (unnamed, generated), "Northgate Forensics" (forensic-audit NPC firm, from old vision), "The Back Room" (informant/fence venue), "Aegis Mutual" (NPC insurer, owned by 08).
- Named deception item tiers: Honeypot Basic/Advanced/Frontier, Canary dataset, Canary briefing.
- Endpoint-label generator for rotating connection codenames (e.g. `AMBER-42 · Port Avalon`): needs a word-pool list in 22 (color-code words + fictional port/region names).
- Op verb display names for 17/18 tooltips (Survey, Lure staff, Lockout, Siphon data, Model session, Query distill, Compute leech, Order tap, Jam AI, Mole feed, Vendor pivot, False story; Bribe, Plant mole, Poach, Walkout, Break in, Alliance leak, Informant, Due diligence; Short campaign, Squeeze, Pump & promote, Rebuttal).
