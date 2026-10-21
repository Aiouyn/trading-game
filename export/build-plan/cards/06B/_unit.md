# Unit 06B — Derivatives (stage S2)

Purpose: listed options, futures and perpetual swaps, OTC swaps and credit default swaps of module 06, cleared through 07B (CCP_LD, CCP_CRY, CCP_OTC, CCP_CDS). Lazy series on deterministic grids, option pricing and the vol surface, NPC options dealers and arbitrageurs, GXV, exercise/assignment/expiry and corporate-action adjustments, futures fair value, settlement and physical delivery, perp funding, swap fair rates and payments, CDS pricing, credit events and settlement auctions. Package `packages/engine/assets/deriv`, ModuleDef `id '06B'`, module `'06'`, depends on 05 and 06A; 07B is consumed through `T07B-??` placeholders (margin and novation are 07B's).

## Tasks (build order)
1. T06B-01 Schema, events, listing grids, lazy series, perps genesis
2. T06B-02 Option pricing (BS, Black-76, GK, CRR 128), greeks cache, OPTION valuer
3. T06B-03 Vol surface, no-arbitrage guards, NPC options dealers, hedging, parity arbitrage, pinning signal
4. T06B-04 GXV and the `fear06` accessor
5. T06B-05 Exercise, auto-exercise, assignment, settlement prices, adjustments
6. T06B-06 Futures: fair value, settlement, expiry, delivery, limits, basis arbitrage, hedgers
7. T06B-07 Perpetual swaps
8. T06B-08 OTC swaps via RFQ, SWAP valuer
9. T06B-09 Credit default swaps, GX Credit 40, credit events, novation
10. T06B-10 Derivative views
11. T06B-11 Assembly, integration, replay determinism (06#2)

## Internal DAG
01 → 02 → 03 → 04; 01, 02 → 05; 01, 04 → 06; 01 → 07; 01, 04 → 08 → 09; 01–09 → 10; all → 11. External: 06A tasks as listed per card, T05-01/T05-20/T05-23, "T07B-??", "T04-??", "T03-??", "T13A-??".

## Exports to other units
- `createDerivativesModule(ports)`; model valuers OPTION, SWAP, CDS (via 06A `registerModelValuer`); RFQ products OIS, ZCIS, FX_FWD, FX_SWAP, XCCY, TRS, COMMODITY_SWAP, CDS, CDS_INDEX, UNWIND; port extension members `dealerNetGamma`, `packageQuote`, `hasListedOptions`, `underlyingOf`, `fairBasisLn`, preTradeGate OPTION/FUTURE/PERP/CDS branches; `perpMarkPrice` (07B liquidations), `dailySettlementPrice`/`finalSettlementPrice` (07B VM), `gxvOf` (04, 16), `fear06`; compute capacity allocation rows for 11; SRL position source for T06A-11.

## Acceptance tests by task
T06B-03: 34 · T06B-04: 10 · T06B-05: 35, 36, 8 · T06B-06: 22 · T06B-07: 37 · T06B-08: 38 · T06B-09: 39 · T06B-11: 2.

## Registry gaps and unit decisions
- RNG: `ast.credit_event:<entityId>` drives the CDS-bond basis OU (θ = 4/yr decision; the spec gives only mean 0 and scale 15 bp).
- Events added beyond 06 §5: `mkt.series.listed`, `mkt.swap.payment`, `mkt.swap.terminated` (PARTIES/PUBLIC as in the cards); `mkt.perp.funding` has two payload scopes (RATE PUBLIC, PAYMENT PARTIES).
- Params: `ast_gxv_bounds` and `ast_option_models` are owner-table rows (†) read as constants; all other 06B keys exist in 23.
- `k_mr = −ln(α+β)·TICKS_PER_GAME_YEAR` is implemented verbatim (06 §3.13.3 owns it) although 05's GARCH updates once per game day (per-day scaling would use 364); flagged to the reconciler, not changed.
- `mkt.cds.notifyNovation` also serves bilateral swap trades (06 §3.16.5 has no own intent).
- Perp index with 06C absent: the oracle input falls back to the CEX TWAP (median = TWAP).
- ZCIS premium `0.002·√T` added to K; rate-future fair uses the simple annualized forward over the 91-day quarter.
- Contradiction: 06A test plan referred to "T06B-12" for 06#2; the assembly card is T06B-11 (06A card corrected).
