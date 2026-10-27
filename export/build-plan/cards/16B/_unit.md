# Unit 16B - Named actors, decisions, dynasties, politics, strikes and the non-macro world-event catalog (stage S6)

Purpose: 19 §12.2 row 16.B (named actors, decision models, dynasties; depends on 16.A, 08, 09.B, 10.B) plus, per Producer (E-29 steering), politics and lobbying, strikes, outlet tone, planted tips, rumor-source actors and the Systems-owned non-macro world-event catalog (E-27 ruling 6). 16C keeps history and archive, eras and technology, secrets and facts, and briefs. Files under `packages/engine/world`. No price math; every coefficient is a param or tagged 'Quant'.

## Tasks (one PR each)
T16B-01 Schema (actors, dynasties, politics, event catalog), codes
T16B-02 Roster and population (16#12, 56, 57)
T16B-03 Decision model, cadence, focus, firewall (16#6, 7, 8, 11)
T16B-04 Memory and trust (16#9, 10)
T16B-05 Action catalogs; tone, planted tips, rumor-source actors, activity routing
T16B-06 Dynasties and influence, disputes (16#15 in T16C-04)
T16B-07 Aging, succession, rise and fall (16#13, 14)
T16B-08 Politics core (16#16, 17, 19, 26, 58)
T16B-09 Lobbying, campaigns, elections, contributions, petitions (16#18, 20-25)
T16B-10 Strikes and non-macro world events (Systems; rates Quant)
T16B-11 Assembly, approach intent (16#51)

## DAG
01 → 02 → 03 → 04 → 05 → 06 → 07 ; 01, 03 → 08 → 09 ; 05 → 10 ; all → 11.

## CATALOG_GAPS_16B
Empty (E-30): rows for `ISSUE_CAMPAIGN`, `PETITION_COMMIT` (amounts 'Quant'; intents gated until set); aliases `LOBBY_SPEND`→`WLD_LOBBYING_SPEND`, `POL_CONTRIBUTION`→`WLD_CAMPAIGN_DONATION`.

## Open questions (conservative choice)
1. **Codes.** Spec calls lobbying spend "paid to NPC consultancies, booked to `row`" (ELASTIC_OUT, matching `WLD_LOBBYING_SPEND`), and contributions a SINK to a party that is an NPC entity. Campaigns and petition commitments have no row; intents that would post them are rejected until bound.
2. **Catalog overlap with 04 (ruled, E-30).** 04 owns overlapping items; T16B-10 lists the nine removed. Mapping by effect channel is Systems' to confirm.
3. **Ids (ruled, E-30).** `dyn_`, `pty_`, `cau_`, `bil_`, `ele_`, `lob_` are in the E-26 id table and the lint allowed list.
4. **Unit split (ruled, E-30).** 19 §12.2 now puts politics in 16.B.
5. **Upstream dependencies.** 07B, 08, 09B, 10B, 12, 15B and 16C have no cards; every port defaults to null with INERT ACs.

## Quant (all 'Quant')
Decision-model coefficients (κ, 0.3 trust/memory weights, τ), mood formula, vote weights, election betas, dispute logit, aging hazard, strike logit, every non-macro event rate, magnitude and precursor window.
