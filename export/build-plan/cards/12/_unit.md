# Unit 12: conflict and intelligence, including cyber (stage S5)

Depends on 11 (no cards yet: T11-??), 09A, 10A, 13A; plus 02, 03, 14A, 15A (concrete), 04, 13A port, 16A (placeholders), 20A-04.

## Tasks
| Card | Title | Tests | Invariants |
|---|---|---|---|
| T12-01 | Schema, ids, codes, events, ports | — | — |
| T12-02 | Surface model, DP_eff, defense stack, patching, zero-day | — | — |
| T12-03 | Op lifecycle and breach resolution | 1, 2, 3 | INV-CON-001 |
| T12-04 | Hidden sessions and caps, linked void | 5–10, 16 | INV-CON-002, -003 |
| T12-05 | Clues, decoys, connection list, scans, defender intents | 11–15 | INV-CON-007 |
| T12-06 | Loot, caps, money tagging | 17, 18, 20 | INV-CON-004, -006 |
| T12-07 | Espionage, loyalty, counter-intel, deception | 23 | — |
| T12-08 | Intelligence items and market conduct | 24 | — |
| T12-09 | Anti-grief and anti-exploit gate + G15–G22 suite | 19, 21, 22 | INV-CON-005 |
| T12-10 | World hack rate, pandemic, NPC crews and defense | 27 | — |
| T12-11 | Exploit sweep (§9 ×20 probes, §8 ×12 edges, hunts, balance bands) | 25, 26 | re-checks all |
| T12-12 | Assembly, views, tone lint, replay | 4 | — |

## DAG
01 → 02 → 03 → 04 → 05; 03, 04 → 06; 03, 06 → 07; 03 → 08; 03–06 → 09; 02, 03, 06, 09 → 10; 02–10 → 11; all → 12.

## Id prefixes (approved E-46)
srf_ surface unit, opn_ op, hsn_ hidden session, lgc_ legit connection, anm_ anomaly/clue, dcp_ deception item, itl_ intel item.
Spec 12 renamed from su_/op_/hs_ (E-46); in the E-26 table and lint allow-list (T10A-01, 10A _unit.md).

## Registry gaps
- RESOLVED (E-46): `CONFLICT_COMPUTE_LEECH` added (TRANSFER); `CONFLICT_FENCE_HAIRCUT` dropped.
- RESOLVED (E-46): `CONFLICT_OP_COST_PLAYER` is an alias of `OPS_PI_FEE_B2B`.
- Spec names `CONFLICT_NPC_THEFT`, `CONFLICT_OP_COST_NPC`, `CONFLICT_BRIBE`, `CONFLICT_DEFENSE_SPEND`; RESOLVED (E-46): aliases added.
- RESOLVED (E-46): `OPS_FENCE_SALE_NPC` is a TRANSFER from the npcFirm sector at 40% of value.

## Open questions
1. CONFIRMED (E-46, Producer): "G15–G22" are 12 §10 tests 15–22 (the anti-grief/anti-exploit acceptance checks), run as a suite in T12-09.
2. RESOLVED (E-46).
3. RESOLVED (E-46): TRANSFER from npcFirm.
4. RESOLVED (E-46): 12 defines the oracle interface, T20B-10 implements and registers it; stubs deleted when it lands (AC-12-11-STUBS). Hunt catalogue lives in T20B-10 (S10), later than 12 (S5): sweep uses local oracle stubs until then.
5. RESOLVED (E-46): Designer owns the tone-lint term list (T12-12).
6. Unit 11 has no cards; AP, DP_ai, residue and defense-model tier are T11-?? ports.
