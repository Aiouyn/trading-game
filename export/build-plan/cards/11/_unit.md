# Unit 11: AI Lab (stage S5)

Depends on 02, 03, 04, 05 (placeholder), 06A-12, 09A, 10A, 13A (placeholder), 14A, 15A, 16A (placeholder), 20A-04. Consumed by unit 12 through `AiPort11` (T11-01 / T11-09 / T11-13).

## Tasks
| Card | Title | Tests |
|---|---|---|
| T11-01 | Schema, ids, codes, events, AiPort11 | — |
| T11-02 | Lab unlock, tiers, DU_cap | 1, 2, 7, 8 |
| T11-03 | Hardware, sites, cloud, shortages, P2P lease | 9, 10 |
| T11-04 | Allocation and DU accounting | 11, 41 |
| T11-05 | Data, partnerships, synthetic collapse | 12, 13, 43, 44 |
| T11-06 | Research tree and talent | 42, 48 |
| T11-07 | Scaling law and training runs | 3, 4, 14–18 |
| T11-08 | Hidden signals and effective MCS | 5, 6, 24 |
| T11-09 | Security models for 12 (AP, DP_ai, scanTier) | — |
| T11-10 | Strategy graphs and P5 evaluation | 26–28, 30 |
| T11-11 | Products, eval pipeline, kill switch, mandates | 25, 33–35, 45 |
| T11-12 | Licensing and data products | 22, 32, 39, 46 |
| T11-13 | Distillation, laundering, leech (12 capture side) | 19–21, 23 |
| T11-14 | Risks and governance | 36–38 |
| T11-15 | NPC labs, tournament, L11 audit | 31, 40 |
| T11-16 | Assembly, offline, replay, AiPort11 registration | 29, 47 |

## DAG
01 → 02 → 03 → 04; 01 → 05; 04, 05 → 06 → 07 → 08 → 09; 02, 04, 08 → 10 → 11; 09, 01 → 12; 07–09, 12 → 13; 06, 11, 12 → 14; 07, 11, 12, 14 → 15; all → 16.

## Ports for unit 12 (placeholder T11-?? resolved)
- T12-02: `dpAi`, defense model tier / `scanTier` ← T11-09 `publishTo12` / `AiPort11.defense`
- T12-03: AP of the attack model ← `AiPort11.attack`
- T12-04: student MCS, residue, retention, DU budgets ← T11-13 + `AiPort11.captureSession` / `residueOf` / `duBudget`
- T12-05: defense model tier, legit connection sources ← `AiPort11.defense` / `legitConnections`
- T12-06: compute runs / leech credit ← `AiPort11.creditLeech` / `tierRunMidpoint` / `ownedThroughputPerGD`

## Id prefixes (approved E-50)
lab_ Lab, cls_ cluster, dts_ dataset (**not** `dst_`: 10 districts), res_ researcher, run_ run, mdl_ model, dep_ deployment, grf_ graph, lic_ license, rpj_ research project, evl_ evaluation.

## Registry gaps (spec §3.18 → catalog)
`AI_HW_SALE`, `AI_HW_DEPRECIATION`, `AI_ENERGY`, `AI_COLO`, `AI_PARTNERSHIP`, `AI_RESEARCH`, `AI_STARTER_COMPUTE` RESOLVED (E-50): rows added per the current 03 model (tagged revisit if owner approves NPC TRANSFER switch); cards rebound.

## Open questions
1. RESOLVED (E-50): `dts_` approved. Was: approve `dts_` (or another three-letter prefix) for datasets; spec `dst_` collides with 10.
2. RESOLVED (E-50).
3. RESOLVED (E-50): 04 owns `aiRaceIndex`, value [Quant] (T11-12 port).
4. RESOLVED (E-50): never re-issued (AC-11-02-FRESHSTART).
5. Unit 15B was stopped with no files written (order change to 11 first).
