# Unit 07B - Clearing house, novation, margin, default waterfall (stage S2)

Purpose: 19 §12.2 row 07.B (depends on 07.A and 06.A; 06B clears through it). Margin models (EWMA/APC, SCAN, HVaR/ES, retail rule-based), per-tick marking, calls, VM and the margin planner on the 07A liquidation engine, deficits into ClearingDebt (07A registry), TCH membership and novation, default fund, default management, waterfall and recovery, CRY with ADL, sponsored CCPs, bilateral CSAs and the ESC escrow service. Files under `packages/engine/banking/clearing`. No price math: model constants are the spec's; anything new is tagged [Quant].

## Tasks (one PR each)
T07B-01 Schema, tables, ids, TCH and service accounts, cleared-product registry, intent/event schemas
T07B-02 Volatility inputs: EWMA, APC, stressed σ, recompute triggers
T07B-03 SCAN IM (07#40, 41)
T07B-04 HVaR / ES and shared add-ons
T07B-05 Account types and retail rule-based IM (07#39)
T07B-06 Marking, status, calls, deposits, planner, VM (07#42, INV-CCP-003)
T07B-07 Deficits, ClearingDebt creation, retail insurance fund sweep (07#43)
T07B-08 Membership, clients, novation, fees (07#44, INV-CCP-001)
T07B-09 Default fund sizing (07#45)
T07B-10 Member default management: porting, hedging, auctions
T07B-11 Waterfall, replenishment, recovery (07#46, INV-CCP-002)
T07B-12 CRY, ADL, sponsored CCPs (07#47)
T07B-13 Bilateral OTC and CSAs (07#48)
T07B-14 ESC escrow and custody (07#49)
T07B-15 Assembly, phases, views, edge and exploit sweep

## DAG
01 → 02 → 03, 04 → 05 → 06 → 07 ; 06 → 08 → 09 → 10 → 11 → 12 ; 01, 04, 14 → 13 ; 01 → 14 ; all → 15.
External: T07A-01/02/04/08 (contract, collateral and pledges, ClearingDebt registry, liquidation engine), T07A-03/05 (bank capital, reserves) and the unwritten 07A resolution card ("T07A-??"), T05-08/T05-20, T06A-01/02, "T06B-??", "T06C-??", "T14A-??", "T13A-??", T03-01/05/06/25.

## Exports downstream
`SERVICE_ACCOUNT` (`ccp_LD`, `ccp_OTC`, `ccp_CDS`, `ccp_REPO`, `ccp_CRY`), `registerClearedProduct`, `serviceOf`, `marginCapacityOf`, `marginPort` (07A MarginPort07), `escrowPort` (15, 13, 08, 09), `clearingHouseView`, `marginRiskView`, `whatIf`, `systemicCcpRows` (07A dashboard, 04 `ccpDfUsage`, 20B series).

## Tests split
07#39 T05; 07#40, 41 T03; 07#42 T06; 07#43 T07; 07#44 T08; 07#45 T09; 07#46 T11; 07#47 T12; 07#48 T13; 07#49 T14. 07#50, 51, 52 are module-wide (systemic dashboard, replay, performance) and stay with the 07A dashboard and assembly cards; T07B-15 runs the 07B parts as ACs. 07#28 (COMMUNITY bank cannot join) is 07A's charter card; T07B-08 has the CCP-side AC.

## Ids (E-26 scheme)
Fixed: `ccp_TCH`, `ccp_LD`, `ccp_OTC`, `ccp_CDS`, `ccp_REPO`, `ccp_CRY`, `ccp_ESC`, `ccp_TCH_RETAIL_IF`, `ccp_CRY_IF_<product>`. Generated kinds: `mac`, `mcl`, `dfe`, `lot`, `csa`, `esc`, `clm`. All pass the E-20 regex and 64-char limit. Added to the E-26 id table and the lint allowed list (E-38).

## Registry gaps
- RESOLVED (E-38): `CCP_DEFICIT_ABSORB`, `CCP_ISA_FEE`, `CCP_CUSTODY_FEE`, `CCP_BILATERAL_CLOSEOUT` added; `bank.ccp.sponsor` registered in 07 §4. Former text: 03 catalog: no code for the member's absorption of a client deficit / insurance-fund reimbursement (card uses `CCP_WATERFALL_ALLOCATION`); no code for the ISA segregation fee (0.02%/yr), the LIC4 custody fee (SINK), or bilateral close-out settlement.
- 07 §4: `bank.ccp.sponsor` intent for §3.17.10 is not listed.

## Open questions
1. RESOLVED (E-38): ticks; E-37 timings (d+120 / d+480 / d+720 call, 7 GD to pay).
2. RESOLVED (E-38): 07#40 split (T07B-03 part a, AC-07B-02-RESPONSE part b). Former: Quant: 07#40 "volatility doubling" read as σ_ewma doubling (IM ×1.74); a doubling of return size gives only ~×1.42 within 240 ticks and would fail 60%. [Quant]
3. RESOLVED (E-38): `CCP_DEFICIT_ABSORB` row added.
4. RESOLVED (E-38): T07A-01 kinds renamed lon/slo/lqd/rsv. Former: 07A (not 07B): T07A-01 id kinds `loan`, `sl`, `liq`, `pay`, `res` fail the E-20 3-letter regex and `loan_` is on the rejected list (E-26). Needs a 07A fix.
