# Unit 13A - Sanctions and Held registry, P1 checks (stage S1)

Purpose: the state half of module 13 (19 §12.2 row 13.A, depends on 03 and 14.A; "no investigations yet"). Sanction, Held, freeze and garnishment state; the pure fine math; the sanction posting split; collection against the $5,000 floor; the Held lifecycle; and the P1 `SanctionGate` that every module calls to refuse actions to Held, banned, suspended or frozen characters. Evidence, cases, verdicts, appeals, regulators, insurance claims and anti-grief belong to 13B. In 13A, sanctions arrive only through `applySanction` (called by 13B later, and by `adm.law.apply_sanction` and the test harness now). All files under `packages/engine/law/sanctions`.

## Tasks (build order, one PR each)
T13A-01 Schema, ids, tables, constants, events, reason-code bindings, ports
T13A-02 Pure fine math: tier schedule, modifiers, verdict and chapter caps, max-NW rule, statutory minimum (13#3, 13#8)
T13A-03 applySanction and the posting split: 85/10/5, restitution first, TRANSFER vs SINK (13#4, 13#5)
T13A-04 Collection, the $5,000 + T1 floor, garnishment plans, Victim Compensation Fund advance (13#9, 13#10)
T13A-05 Held lifecycle: grace, durations, caps, sandbox off, start/end, 70% business factor (13#11, 13#12)
T13A-06 P1 SanctionGate and the 14A ports (isHeld, handleChangeBlocked, licenseEligibility), op ban, licence suspension, pre-trial freeze holds, leverage-cap flag
T13A-07 Module assembly, P11 registry step, invariants INV-LAW-001..003, views, adm directive, suites

## Internal DAG
01 → 02 → 03 → 04 ; 01 → 05 ; 01, 05 → 06 ; all → 07. External: T03-01/02/08/09/17/26, T14A-01/02/07/08/11, T02-11/12/21, T20A-01.

## Boundary with 13B
13B owns verdicts, settlement, pleas, appeals (judgment escrow), freeze *requests*, court and legal fees, whistle rewards, bounty, insurance and linked-account voiding. 13A owns the state and money effects those decisions produce. The interface is `applySanction(ctx, SanctionOrder)` plus `placeFreeze` and `releaseFreeze`.

## Invariants
INV-LAW-001 (T13A-05), INV-LAW-002 (T13A-04), INV-LAW-003 (T13A-02). INV-LAW-004 (Reputation not an input to verdict, fine or fee) is 13B's verdict function; the fine function's signature here takes no Reputation (T13A-02 AC), which feeds INV-STR-006.

## Open questions (conservative choice in force)
1. Several §3.2 and §3.10 numbers have no 23 registry key: tier pct/floor/cap, the ×1.5 repeat multiplier (cap ×2.5), the −30% plea, caps of 35% per verdict and 60% per chapter, Held 6 h/12 h/+6 h/24 h/48 h, and the $5,000 floor. Choice: constants in `constants.ts` marked "registry gap", as T03-26 did. Needs a registry errata.
2. (Ruled, E-23) Garnishment overlaps 03 (T03-26 persistent claims at `comeback_garnish_rate`). Choice: one combined garnish of income inflows; 13A plans and 03 persistent claims share the same income definition (`GARNISH_TAGS`), and the combined rate never exceeds max(garnishment_rate, comeback_garnish_rate). 13A plans are paid first.
3. "Daily income" for garnishment is undefined. Choice: the sum of the day's garnishable inflows (T03-26 `GARNISH_TAGS`) at day close, never balance.
4. "Third S4 in a chapter" counts convictions applied in 13A's chapter counter, including ones later reversed on appeal? Choice: reversals decrement the counter (`LIFT`), and the Held already served stays served.
5. Held's "+6 h for repeat": repeat means any prior Held in the same chapter. Choice: +6 h per prior Held, still capped at 24 h per verdict and 48 h per chapter.
6. Where Held hits the 48 h chapter cap: choice is to truncate the Held (never carry into the next chapter), and record `truncatedBy: 'CHAPTER_CAP'`.
7. Sandbox and practice worlds: `world.kind !== 'ONLINE'` → Held off. Fines, op bans and record still apply (13 §3.10).
8. Divestiture haircut (−15% SINK) and model destruction act on 06/09/11 state. Choice: 13A records the sanction and sends a message to the owning module; the money effect is that module's (`LAW_FORCED_DIVESTITURE`).
9. Public record Reputation −10 to −30: choice is to send `life.reputation.event { kind: 'CONVICTION', severity }` to 14B, which picks the value; 13A never writes Reputation.
