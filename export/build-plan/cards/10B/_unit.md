# Unit 10B - Mortgages, development, property exchange, growth (stage S3)

Scope: 19 §12.2 row 10.B (depends on 10A and 07A). Builds on 10A's cities, props, appraisal and pools. Files: `packages/engine/city/market/**`, `city/dev/**`, `city/growth/**`. No price math: spec coefficients are transcribed; calibration (crunch drawdown, hazards) is [Quant].

## Tasks (one PR each)
T10B-01 Schema, ids, code bindings, ports
T10B-02 Listings, offers, NPC buyers, instant sale (10#10, 11)
T10B-03 Settlement, costs, appraisal integrity (10#12)
T10B-04 Mortgage eligibility, pricing, payments (10#13, 14)
T10B-05 Covenants, cure, foreclosure, recourse (10#15)
T10B-06 Prepay, refinance, 08 hooks, REIT NAV (10#17)
T10B-07 Development entry: land, permits, objections (10#19)
T10B-08 Construction, contractors, presales, completion (10#20, 21)
T10B-09 Pause/cancel, renovation, conversion, demolition (10#22)
T10B-10 Growth, decline, corridors, new cities, crunch path (10#30, 31, 33, 35)
T10B-11 Assembly, phases, streams, edge and exploit sweep

## DAG
01 → 02 → 03 ; 01 → 04 → 05 → 06 ; 02, 03 → 05 ; 01 → 07 → 08 → 09 ; 04, 05, 07, 08 → 10 ; all → 11.

## Ids
Approved (E-26): `prop_`, `pcl_`, `bld_`, `unt_`, `lse_`, `lon_`, `cty_`, `dst_`. **Approved E-39** (on the E-26 table and the lint allowed list): `lst_` (listing, spec), `dev_` (project, spec), `ofr_` (offer), `prm_` (permit), `psl_` (presale), `lau_` (land auction), `mqt_` (mortgage quote), `obj_` (objection). Created only through `ID10B`.

## Registry gaps
- RESOLVED (E-39): `PROP_TXN_COST_NPC`, `PROP_FORECLOSURE_COST_NPC`, `PROP_SITE_SECURITY_NPC` (TRANSFER to frm, E-39 amendment), `PROP_OBJECTION_FEE` (TRANSFER to city government), `PROP_PLANNING_APPEAL_FEE` (SINK); class and rate [Quant] confirm. 10#12 unblocked.
- RESOLVED (E-39): `prop.dev.appeal` in 10 §4; 10B rows in 02 §3.10.4.

## Open questions
1. RESOLVED (E-39): `PROP_LAND_AUCTION` TRANSFER to the treasury; spec 10 reworded.
2. RESOLVED (E-39): eight prefixes approved.
3. RESOLVED (E-45): 10#35 retuned per E-41/E-43 (P10 15±3, P50 25±3, P90 40±4 over ≥ 400 seeds; severity draw m). Former: Quant: 10#35's 20–35% drawdown band depends on cap-rate and hazard coefficients owned by 10A/04; 10B only transmits. [Quant]
4. 10A gaps found: T10A-11 cites 10§6 whole, so §6.4–§6.6 are double-cited here for the 10B behaviour (no conflict).
