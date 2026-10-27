# Unit 13B - Investigations, evidence, courts, verdicts, appeals, regulators, surveillance, whistleblowers, insurance claims, anti-grief (stage S5)

Purpose: the rest of module 13 on top of 13A (19 §12.2 row 13.B; depends on 12, 05, 07B, 08, 13A, 15A). Decisions are made here; their state and money effects go through 13A (`applySanction`, `placeFreeze`). Files under `packages/engine/law/courts`.

## Tasks (one PR each)
T13B-01 Schema, law.* intents, common validation, ports
T13B-02 Evidence engine (13#1, 18, 24)
T13B-03 Investigation pipeline, board, bounty, case selling, malicious prosecution (13#23)
T13B-04 Filing, venues, fee decisions (13#2, 25)
T13B-05 Verdicts, damages, settlement, plea, chapter end; INV-LAW-004 (13#6, 7, 20)
T13B-06 Appeals (13#13)
T13B-07 Regulators, surveillance, audits, whistleblowers (13#14-16)
T13B-08 Insurance claims (13#17)
T13B-09 Assembly, NPC, anti-grief, suites and bands (13#19, 21, 22)

## DAG
01 → 02 → 03 → 04 → 05 → 06 ; 02, 04 → 07 ; 01, 04 → 08 ; all → 09.

## Open questions (conservative choice)
1. (Ruled, E-24) A Held character may post bond, settle and appeal.
2. (Ruled, E-24/E-25) Quant's isqrt progress formula; the four keys are in 23, PROVISIONAL pending the sim gate. Points = P_ppm/10,000.
3. (Ruled, E-24) Appeal deadline = filedTick + 17,280. If undecided, it LAPSES: the verdict stands and the escrow goes to the victim.
4. Inputs from 12, 15 and 08 have no cards yet. The ports default to "absent", and INERT ACs with fixtures cover them.
5. Freeze requests (§3.6) are intent `law.request_freeze` handled in T13B-04's filing flow and calling T13A-06 `placeFreeze`; Reputation < 30 auto-freeze and ≥ 60 bond read 14B Reputation. That is the only Rep use, and it is allowed by §3.4.
