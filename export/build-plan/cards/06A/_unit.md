# Unit 06A — Spot asset classes (stage S2)

Purpose: the spot side of module 06. The instrument universe and its ids, license gates and marks, equity value V and earnings, dividends, splits and other corporate actions, indices and ETF NAV, government and corporate bonds with the primary market and the credit model, FX, commodities with hubs, receipts and shipping, game-native compute/data/power, collectibles, the OTC RFQ protocol and the LIC4 block desk, and 05's `InstrumentPort` that hands all of it to the price engine. Package `packages/engine/assets` (`shared/`, `spot/`), ModuleDef `id '06A'`, module `'06'`, depends on 05. Tables use the prefix `ast.`, reject codes `AST_`, intents `mkt.*`.

## Tasks (build order)
1. T06A-01 Schema, tables, ids, ports (`AssetPorts`), constants, price params, genesis
2. T06A-02 License gates, sessions, marks (`registerModelValuer`), beneficial-owner limits
3. T06A-03 Equity V and anchors · 4. T06A-04 Earnings · 5. T06A-05 Dividends, DRIP, splits
6. T06A-06 Tenders, mergers, spin-offs, bankruptcy, delisting, DISTRESSED venue
7. T06A-07 Indices and ETF NAV · 8. T06A-08 Bond pricing and servicing · 9. T06A-09 Primary auctions
10. T06A-10 Credit model, defaults, callable bonds · 11. T06A-11 FX · 12. T06A-12 Commodities and native markets
13. T06A-13 Hubs, receipts, storage, shipping · 14. T06A-14 Collectibles · 15. T06A-15 RFQ and block desk
16. T06A-16 InstrumentPort and index funds · 17. T06A-17 Views (+ `registerViewExtension`) · 18. T06A-18 Assembly, INV-BS-003

## Internal DAG
01 → 02 → {03, 05, 07, 08, 11, 12, 14}; 03 → 04 → 05 → 06; 08 → 09, 10; 12 → 13; 02, 04 → 15; 01–13 → 16; 01–15 → 17; all → 18.

## Exports to other units
- 06B and 06C build on: `AST`, ids (`optionSeriesId`, `futureSeriesId`, `perpId`, `memeId`), `AssetPorts`, `tradeGate`/`requiredLicense`/`maxLeverageFor`, `markPrice` and `registerModelValuer`, `registerPortExtension`, `registerRfqProduct`, `registerViewExtension`, `registerSrlPositionSource`, `createReceipt`, `physicalCapacityCheck`, `distressedVwap`, credit functions of T06A-10, `futuresFair`.
- Engine wiring: `createSpotAssetsModule(ports)` and `createInstrumentPort()` (passed as `MarketPorts.instruments` to 05's `createMarketsModule`).

## Acceptance tests by task
T06A-01: 1 · 02: 3, 4 · 03: 5 · 04: 6 · 05: 7 · 07: 9, 11 · 08: 12, 13 · 09: 14 · 10: 15, 16 · 11: 17, 18, 19 · 12: 20, 23 · 13: 21 · 14: 40, 41 · 15: 42, 43. Invariant INV-BS-003: T06A-18. Test 06#2 (replay) lives in T06B-11; 06#45/46 in T06C-09.

## Registry gaps and unit decisions
- RNG (02 §3.10.4): `ast.commodity` (shipment loss, replacing the spec's `rng('ship')`), `ast.collectible`, `ast.recovery` (registered, undrawn), `ast.earn:<issuerId>` (consensus noise; 06 owns it by R10, missing from 02's registry).
- Params without 23 keys (in `SPEC_CONSTANTS_06`): collectible fees and soft-close timings, RFQ limits (5 open, 3-tick validity), block desk cut-offs (530/539, +720 filing), bond face 1,000, `cmd_<id>_*` / `eq_sector_<id>_*` exist only as family rows.
- Reason-code gaps: `CMDTY_SPOILAGE` is NC but needs a quantity template; withdraw-lot fee uses `COLL_AUCTION_FEE` sub 'WITHDRAW'; delivery-failure penalty uses `CMDTY_PHYSICAL_DELIVERY` sub 'FAILURE_PENALTY'; collectible storage uses 14's `LIFE_UPKEEP`.
- Added intents: `mkt.distressed.order`, `mkt.distressed.cancel` (the DISTRESSED venue has no intent in 06 §4).
- Decisions: `SENTIMENT_MULT = 1` (05 exposes no sentiment term); continuous-compounding YTM; marginal-cost weights 0.5/0.3/0.2; EQ_MID midpoint price class; crypto `jumpUpProb` 0.45; dealer ladder anchored on yModel.
- Contradictions: indices (05 §3.22 vs 06 §3.5) → 06 computes, per 22 §4.8 and R39; 05's T05-19 should read 06's levels. FX legs: 04's `fairValueLn` is the leg anchor (05 §3.3.6, 04); 06 §3.9.2 drives carry/display panels and is tested to agree. Block cross: 05 §3.20 (D091) owns the generic cross; 06's LIC4 desk crosses at the official close and files at +720. Collectible categories follow 22 (R39). Sovereign grace 7 days (R29).
- Port gaps for the reconciler: 05's `InstrumentPort` lacks `preTradeGate` and `peGuard` (05 must call them in P1); 08's `FundsPort.etfFlows` should concatenate `indexRebalanceFlows`.
