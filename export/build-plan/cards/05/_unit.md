# Unit 05 — Markets and the price engine (stage S2)

Purpose: the per-tick uniform-price batch auction for every listed instrument, the two-layer price model (value layer `lnV` + flow layer on the single NPC maker ladder), NPC pools, bands, halts and circuit breakers, market data, "Why it moved" cause vectors, surveillance features, registered market makers and block crosses. Hard dependencies: 03, 04, 14A, 13A. Later modules (06, 07, 08, 09, 11, 12, 14B, 15, 16, 18) feed 05 through **ports** defined in T05-01 (`MarketPorts`), injected by `createMarketsModule(ports)`; defaults are empty inputs, never different rules (19 Rule 12.4.2). 16A news is an event edge, tested with fixtures through `WorldPort`.

## Tasks (build order)
1. T05-01 Schema, tables, constants, ports, event schemas, class defaults
2. T05-02 Sessions, active clocks, auction slots, official close
3. T05-03 Value layer (lnV step, factors, GARCH, regimes, crisis correlation, shocks, world hooks)
4. T05-04 NPC maker (ladder, tally, transient, inventory, lnB following value)
5. T05-05 Auction part 1: participants and clearing price
6. T05-06 Auction part 2: allocation, pairing, STP, FOK
7. T05-07 Bands, volatility interruptions, halts, MWCB, futures limits
8. T05-08 Model ADV, background volume, intraday profile
9. T05-09 Order types, TIF, flags, OCO/brackets, triggers, protection, icebergs
10. T05-10 Fees, tiers, message fee, levy, settlement postings
11. T05-11 P1 validation, limits, auto-split, order intents, ownership thresholds
12. T05-12 FX books, autoFx, crosses, capital controls, multi-leg packages
13. T05-13 Execution algorithms and algo intents
14. T05-14 NPC trader pools and external NPC flows
15. T05-15 Belief model
16. T05-16 Cause vectors, gap tracer, explainMove, k-anonymity, priced-in bands
17. T05-17 Surveillance F1–F15 and score
18. T05-18 Registered market makers and block crosses
19. T05-19 Lifecycle and corporate actions, indices, bond depth index
20. T05-20 Market data publication, engine read API (`api.ts`), views
21. T05-21 Risk API, pre-trade preview, execution analytics
22. T05-22 Tick pipeline wiring (phases, sub-phases 6.0–6d, replay, perf)
23. T05-23 Module assembly, params, invariants, genesis, integration tests

## Internal DAG
01 → 02 → 03 → 04 → 05 → 06; 02,05 → 07; 01,02,03 → 08; 02,07 → 09; 01,02 → 10; 07,08,09,10 → 11; 06,10,11 → 12; 07,08,11 → 13; 03,04,07,08 → 14; 03,04 → 15; 03,04,06,15 → 16; 06,10,11,15 → 17; 02,04,06,10,11 → 18; 03,04,07,09,11 → 19; 02,04,08,11,16,19 → 20; 03,04,07,10,13,20 → 21; 01–21 → 22; 22 (+05,06,07,11,12,13,18,19,20,21) → 23.

## Exports to downstream units
- Engine read API (`packages/engine/markets/api.ts`, T05-20): `getMarketSpec`, `getPriceState`, `lastPrice`, `officialCloseOf`, `settlementPriceOf`, `modelAdv`, `fairValueLn`, `tradingStateOf`, `realizedVol21`, `dailyBars`, `makerHalfSpread`, `sigmaDailyOf`, `indexLevelOf`, `bondDepthIndexOf`, `causeVectorDaily`, `fillsOfTick`; plus `explainMove`, `surveillanceScore`, `derivativeHandoffs` (07 novation).
- Ports that 06, 07, 08, 09, 11, 12, 14B, 15, 16, 18 implement (T05-01 `ports.ts`).
- Views for screens (T05-20, T05-21): `mkt.quote`, `mkt.book`, `mkt.tape`, `mkt.chart`, `mkt.tradingState`, `mkt.indicative`, `mkt.dailyStats`, `mkt.fairValue`, `mkt.explainMove`, `mkt.newsBands`, `mkt.calendar`, `mkt.system`, `mkt.etfPremium`, `mkt.eventMoves`, `mkt.myOrders`, `mkt.myFills`, `mkt.myAlgos`, `mkt.index`, `mkt.bondDepth`, `mkt.marketSpec`, `mkt.surveillanceScore` (system only), `risk.report`, `mkt.preview`, `mkt.algo.schedulePreview`, `mkt.execution`.
- Every event kind of 05 §5 (T05-01 `events.ts`), plus `mkt.flag.belowMinPrice` (edge 17).

## Acceptance tests by task
T05-03: 14, 15, 16 · T05-04: 8, 9, 10, 12 · T05-05: 2, 3 · T05-06: 1, 4, 5, 6, 11 · T05-07: 7, 22–26 · T05-08: 41, 42 · T05-09: 27–31, 34 · T05-10: 39, 40 · T05-11: 32, 35, 36, 38 · T05-12: 37, 50 · T05-13: 33 · T05-15: 48 · T05-16: 18–21, 49 · T05-17: 43, 44 · T05-18: 45–47 · T05-19: 54 · T05-20: 53 · T05-22: 51, 52 · T05-23: 13, 17. Invariants: INV-MKT-006 (T05-05), 001–003 (T05-06), 004–005 (T05-07); all registered in T05-23.

## Registry gaps and unit decisions
- RNG: 05 text names `mkt/pool`, `mkt/bg`, `mkt/alloc`; the binding registry 02 §3.10.4 lists `mkt.factor`, `mkt.idio`, `mkt.jump`, `mkt.npc_flow`, `mkt.lp_quote`, `mkt.earnings`, `mkt.corp_action`, `mkt.surveillance_sample`. Mapping: pool noise and background volume → `mkt.npc_flow:<assetId>`; allocation remainders → `mkt.lp_quote:<assetId>`. `mkt.earnings`, `mkt.corp_action`, `mkt.surveillance_sample` are registered but undrawn by 05 rules.
- Params without 23 keys (used as 05 constants in `SPEC_CONSTANTS`): MWCB levels 7/13/20% and 120 ticks, bond halt ±10%/60 ticks, IPO band 50%, block minimum max(0.25 ADV, $1M), block/MOC cut-off 535, volume-tier thresholds and multipliers, MM message exemption 2,000. `mkt_fee_*` exists only as a family row; the expanded keys are listed in T05-10.
- Unit decisions where 05 leaves a scale implicit: pool `speed = 1` with per-tick cap `rate × U(t)`; VALUE `capV = 1` ADV; RETAIL and PENSION signal forms and FX hedger flow (T05-14); `m_spread,event = 1` (no 04 hook widens spreads); algos trade continuous ticks only.
- Contradictions resolved: (1) Held: 13 §3.10 (owner of Held) keeps standing orders and mandated AIs live, 05 §8 edge 13 cancels them; 13 applied, manual algos pause (T05-11). (2) 05#39 "L4 applies only to the ≥ $1B tier" superseded by ruling R04 (no fee multiplier; only 03's L3 levy). (3) Bloc ids are currency codes per R39 (`exc_FDL`, `npc_MKT_FDL`), not 04's two-letter ids. (4) FX weekend: 05 §3.2.2 (owner) closes FX all weekend vs 00's Sun 22:00 reopen; 05 applied.
