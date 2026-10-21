# 05 — Markets and the Price Engine

Module owner: 05. Status: complete specification, 2026-10-18.
Scope (00 §1): market microstructure for every exchange-traded instrument: sessions, the per-tick uniform-price batch auction, order types and execution algorithms, NPC liquidity (the market maker and the trader pools), price impact, the two-layer price model, price bands, halts and circuit breakers, market data publication, the "Why it moved" cause vector, execution and risk analytics, surveillance features, and the registered market-maker and block-cross programs.
Depends on: 02 (clock, phases, RNG streams, deterministic math `dmath`, tick→UTC map), 03 (postings, holds, reason codes, player-economy boundary), 04 (macro state, regimes, Fear Index, curves, FX fair value, CB and treasury orders, Stabilizer fee lever), 06 (instrument registry and the fundamental anchor of each asset, derivative pricing and marks, corporate actions, ETF NAV), 07 (buying power, margin, borrow locates, liquidation orders, CCP novation), 08 (ETF creation and redemption, fund NAV strikes), 09 (exchange concession owners, company events), 11 (AI actors use the same intents; research quality for nowcasts), 12 (stolen-order and disinformation flags), 13 (licenses, Held, regulator thresholds), 15 (beneficial-owner link graph, filings, Wire), 16 (news items with impact vectors, belief inputs, named NPC funds), 22 (asset list and per-asset parameters).

All model math runs in `float64` through 02's `dmath`; prices and quantities are integers (`Price`, `Qty`, 00 §3.1) at every boundary: the auction clears on the integer price grid, fills are integer lots, money crosses into the ledger only through `toMoney`.

---

## §1 Purpose

The market engine turns everybody's orders (players, player AIs, delegated operators, NPC pools, central banks, treasuries and liquidation engines) into prices, once every tick, for every listed instrument, fairly and explainably.

Design commitments (old 01 §0, §7; V3 Part 4; MASTER-BIBLE Part VII T02–T10):
1. **Fairness by batching.** Every tick each asset clears in one uniform-price call auction. There is no latency race, no front-running inside a tick, and the same result on a phone and a desktop.
2. **Players are price-makers.** Small players are invisible; whales leave footprints; coordinated players can squeeze. Impact follows the square-root law from $1k to $10B, in **one** place (the NPC market maker's ladder), so no effect is charged twice (T08).
3. **Prices come from who trades and why.** A value layer (fundamentals, macro factors, news) says what an asset is worth; a flow layer (trader pools and players clearing against the market maker) says what it trades at. Inefficiencies (post-news drift, overreaction, quarter-end, crowding) emerge from the pools and die as capacity is used (specs/quant-market-ecology).
4. **Explainable afterward.** Each closed day and hour has a cause vector that sums exactly to the move, so the trade journal, the "Why it moved" ladder and the Research Desk can never contradict the tape.
5. **Nothing leaks.** Public data is aggregate: depth by price level, prints, volume. No account identity, no hidden reserve, no stops, no algo parents ever leave the engine (L11).
6. **Deterministic.** The engine is a pure function of (seed, state, sealed intents, entropy commits) (02).

### §1.1 Ownership boundaries

| Topic | 05 owns | Others own |
|---|---|---|
| Which instruments exist, their contract terms, fundamental anchor, derivative pricing, corporate actions | microstructure fields (§2.2) with class defaults | 06 (registry, anchors, greeks, marks), 22 (the list) |
| Macro factors' drivers (regimes, rates, FX fair value, fear) | how they enter the per-tick value process | 04 |
| Order types, auction, allocation, bands, halts, publication | all | 17 draws them |
| Buying power, margin, borrow, liquidations, CCP | consumes 07's checks; executes 07's liquidation orders | 07 |
| Primary sovereign auctions | none | 04 (runs in the FINANCE partition) |
| OTC/RFQ, AMM pools (DeFi), property and business exchanges | none | 06, 10, 09 |
| Surveillance | computes features and the score | 13 decides; 12 defines market-conduct verbs |
| Explanations | computes cause vectors and `explainMove` | 18 owns the ladder and the analyst products; 16 the text |

---

## §2 Entities

### §2.1 Enums

```ts
type AssetClass = 'EQUITY' | 'ETF' | 'GOV_BOND' | 'CORP_BOND' | 'FX' | 'CRYPTO_MAJOR' | 'CRYPTO_ALT' | 'MEME'
               | 'STABLECOIN' | 'COMMODITY_SPOT' | 'FUTURE' | 'PERP' | 'OPTION' | 'COMPUTE' | 'DATA_CREDIT' | 'ENERGY_MWH';
type SessionProfile = 'EXCHANGE_SESSION' | 'FX_24_5' | 'FUT_24_5' | 'CRYPTO_24_7';
type Side = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT' | 'TRAILING_STOP'
               | 'MOO' | 'LOO' | 'MOC' | 'LOC';
type Tif = 'DAY' | 'GTC' | 'GTD' | 'IOC' | 'FOK';
type AlgoKind = 'TWAP' | 'VWAP' | 'POV' | 'IS';
type TriggerRef = 'LAST' | 'MARK';
type PoolKind = 'VALUE' | 'TREND' | 'RETAIL' | 'PENSION' | 'MAKER' | 'CARRY' | 'HEDGER' | 'ARB' | 'MANDATE'
              | 'OPT_HEDGE' | 'DEGEN' | 'CB' | 'TSY' | 'LIQUIDATION' | 'RATES_RV';
type TradingState = 'CLOSED' | 'PRE_OPEN' | 'OPENING_AUCTION' | 'CONTINUOUS' | 'CLOSING_AUCTION' | 'AFTER_HOURS'
                  | 'HALTED' | 'VOL_INTERRUPTION' | 'LIMIT_LOCKED' | 'SUSPENDED';
type CauseKey = 'MARKET' | 'REGION' | 'SECTOR' | 'MACRO' | 'FUNDAMENTAL' | 'NEWS' | 'BELIEF' | 'COMPANY_NOISE' | 'FLOW_VALUE' | 'FLOW_TREND' | 'FLOW_RETAIL'
              | 'FLOW_PENSION' | 'FLOW_CARRY' | 'FLOW_HEDGER' | 'FLOW_ARB' | 'FLOW_MANDATE' | 'FLOW_OPT_HEDGE' | 'FLOW_DEGEN'
              | 'FLOW_POLICY' | 'FLOW_LIQUIDATION' | 'FLOW_PLAYERS' | 'MAKER' | 'EVENT' | 'OTHER';
```

### §2.2 Market specification per instrument (`MarketSpec`)

06 creates every instrument; 22 authors per-asset values; any field left unset takes the class default from §3.3.6 and §3.4.6.

```ts
interface MarketSpec {
  assetId: string; class: AssetClass; venueId: string;      // venue = exc_<bloc> or a crypto venue id (06)
  ccy: Ccy; sessionProfile: SessionProfile;
  lotSize: Qty; qtyDecimals: number; displayDecimals: number;
  tickTable: { minPrice: Price; tick: Price }[];            // price-dependent tick size, ascending
  minPrice: Price;                                          // hard floor (old 01 §2.2: 0.01 in display units for equities)
  // value layer
  sigmaV: number;                                           // annual diffusive vol of the value process (before regime and GARCH)
  loadings: Record<string, number>;                         // factor id → standardized loading; Σ L² ≤ 1, idio gets the rest
  jumpsPerYear: number; jumpUpProb: number; jumpUpMean: number; jumpDownMean: number;
  anchorHalfLifeDays: number;                               // pull of value toward 06's anchor
  // flow layer
  turnover: number;                                         // expected daily turnover as a share of size (ADV model §3.14)
  baseHalfSpread: number;                                   // log units
  impactY: number;                                          // square-root coefficient Y
  valuePrint: number; newsPrint: number; openPrint: number; // shares of value moves printed immediately by the maker
  guardGap: number | null;                                  // ln distance beyond which the maker pulls toward value
  poolWeights: Partial<Record<PoolKind, number>>;           // which pools trade this asset and at what strength (§6.2)
  // controls
  tickBandMin: number;                                      // minimum per-tick band, fraction
  haltRule: 'EQUITY_LULD' | 'BOND' | 'FX_NONE' | 'CRYPTO_NONE' | 'FUT_LIMITS' | 'OPTION_FOLLOW' | 'ETF_FOLLOW';
  feeClass: 'EQ' | 'BOND' | 'FX' | 'CRYPTO' | 'FUT' | 'OPT' | 'COMMODITY';
  licenseRequired: 'LIC1' | 'LIC2' | 'LIC3' | 'LIC4';      // 13 owns the gate; 06 sets the value
  indexMemberships: string[];                               // for pension pool, market-wide halts, ETF arb
  floatShares?: Qty;                                        // equities, for position and short caps
}
```

### §2.3 Price state per instrument (`PriceState`, engine-internal; public fields marked)

```ts
interface PriceState {
  assetId: string; tick: Tick;
  lnV: number;                      // PUBLIC as "Fair value (consensus)": the value layer
  lnF: number;                      // last anchor from 06
  lnB: number;                      // maker base mid (price without transient effects)
  perm: number; permTallyQty: number;   // Π and the shared daily net tally (§3.4.3)
  trans: number;                    // T, transient impact (decays)
  belief: number;                   // b, belief overlay from claims and rumors (§6.3)
  lnP: number;                      // PUBLIC: last clearing price (ln)
  lastPrice: Price; lastQty: Qty;   // PUBLIC
  h: number;                        // GARCH variance multiplier (daily)
  dayOpen: Price; dayHigh: Price; dayLow: Price; prevClose: Price; prevSettle?: Price;   // PUBLIC
  dayVolume: Qty; dayNotional: Money; vwapNum: number; cumVolume: Qty;                     // PUBLIC
  advUnits: number; advNotionalFdl: number;                 // PUBLIC (model ADV, §3.14)
  rv21: number;                                             // PUBLIC realized vol, 21 trading days
  makerInventory: number;                                   // in ADV units
  pools: Record<PoolKind, { position: number; lastOrder: number }>;   // ADV units
  tradingState: TradingState; stateUntilTick?: Tick;        // PUBLIC
  haltsToday: number; bandHitStreak: number;
  limitUp?: Price; limitDown?: Price;                       // futures daily limits, PUBLIC
  gapTracer: Record<string, number>;                        // unprinted value-gap by source (§3.12.2)
  lastDayOverPrints: number;                                // diagnostics
}
```

### §2.4 Orders

```ts
interface Order {
  orderId: string; actorId: string;          // chr or operator under a Mandate (00 §5.5)
  ownerGroupId: string;                      // beneficial-owner group from 15 (alts and controlled entities share one)
  accountId: string;                         // cash or margin account (07)
  assetId: string; side: Side; type: OrderType; tif: Tif; gtdTick?: Tick;
  qty: Qty; displayQty?: Qty;                // iceberg when displayQty < qty
  limitPrice?: Price; stopPrice?: Price;
  trail?: { kind: 'ABS' | 'PCT'; value: number; peak: Price };
  triggerRef: TriggerRef;
  flags: { reduceOnly: boolean; postOnly: boolean; autoFx: boolean; auctionOnly: boolean };
  ocoGroupId?: string; bracketParentId?: string;
  algoParentId?: string;
  status: 'PENDING_TRIGGER' | 'WORKING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
  filledQty: Qty; avgPriceNum: number;       // Σ price×qty for average
  entryTick: Tick; priorityTick: Tick;       // priorityTick resets on qty increase or price change
  displayedRemaining: Qty;                   // iceberg slice still displayed
  holdId?: string;                           // cash or asset hold (03/07)
  arrivalRefPrice: Price;                    // for execution analytics
  marketTicksLeft?: number;                  // market order protection (§3.6.6)
  clientTag?: string;
}
interface AlgoParent {
  algoId: string; actorId: string; ownerGroupId: string; accountId: string; assetId: string; side: Side;
  kind: AlgoKind; qty: Qty; filledQty: Qty; limitPrice?: Price;
  startTick: Tick; endTick: Tick;
  params: { participation?: number; urgency?: number; maxChildPerTickAdv?: number; limitOffsetTicks?: number };
  status: 'WORKING' | 'PAUSED' | 'DONE' | 'CANCELLED';
  scheduleFilledTarget: Qty;                 // cumulative target at the current tick
  childOrderId?: string;
}
```

### §2.5 Auction records

```ts
interface AuctionResult {             // PUBLIC aggregate, one per asset per tick with a clearing
  assetId: string; tick: Tick; kind: 'TICK' | 'OPEN' | 'CLOSE' | 'REOPEN' | 'VOL_INTERRUPTION';
  price: Price; qty: Qty; imbalance: Qty;    // signed: + = unfilled buy interest at the price
  aggressorSide: Side | 'NONE';              // the side of the net imbalance taken from the maker
  bandClamped: boolean; fillsCount: number;
}
interface Fill {                      // PRIVATE to each side; counterparty identity never disclosed
  fillId: string; tick: Tick; assetId: string; orderId: string; actorId: string; ownerGroupId: string;
  side: Side; qty: Qty; price: Price; fee: Money; feeCcy: Ccy; liquidity: 'MAKER' | 'TAKER' | 'AUCTION';
  counterpartyKind: 'PLAYER' | 'NPC';          // the only counterparty information a player sees
}
interface DepthLevel { price: Price; qty: Qty; }   // aggregated displayed quantity, all participants
interface BookPublication { assetId: string; tick: Tick; bids: DepthLevel[]; asks: DepthLevel[]; last: AuctionResult | null; indicative?: { price: Price; imbalance: Qty } }
interface TapePrint { assetId: string; tick: Tick; price: Price; qty: Qty; aggressor: Side | 'NONE'; block: boolean; deferred: boolean }
```

### §2.6 Cause vectors

```ts
interface CauseVector {               // per asset per game hour (24 per day) and per game day
  assetId: string; period: { kind: 'HOUR' | 'DAY'; gameDay: number; hour?: number };
  totalLogMove: number;               // ln(close/previous close) of the period
  terms: Partial<Record<CauseKey, number>>;   // log contributions, Σ terms = totalLogMove exactly
  newsItems: { newsId: string; contribution: number }[];     // NEWS split by item (16 ids)
  eventId?: string;                   // world event active (04), for "this is the crash, not your stock"
  macroRefs: { eventKind: string; refId: string; contribution: number }[];   // MACRO split (CB decision, release…)
  playerOwnerGroups: number;          // count of distinct player owner groups in FLOW_PLAYERS (k-anonymity, §3.12.4)
}
```

### §2.7 Surveillance

```ts
interface SurveillanceFeatures {      // per owner group per game day, SEALED to 13
  ownerGroupId: string; gameDay: number;
  nearTouchEntries: number; nearTouchFastCancels: number;
  spoofEpisodes: EvidenceRef[]; layeringEpisodes: EvidenceRef[]; washEpisodes: EvidenceRef[];
  markingCloseEpisodes: EvidenceRef[]; rampEpisodes: EvidenceRef[]; promoOverlaps: EvidenceRef[];
  distortEpisodes: EvidenceRef[]; insiderTrades: EvidenceRef[]; frontRunEpisodes: EvidenceRef[];
  stopHuntEpisodes: EvidenceRef[]; squeezeFlags: EvidenceRef[]; ignitionEpisodes: EvidenceRef[];
  offMarketP2P: EvidenceRef[]; offMarketCrosses: EvidenceRef[]; disinfoOverlaps: EvidenceRef[];
  points: Record<string, number>; pointsTotal: number;
  score: number;                      // surveillanceScore ∈ [0, 100], the value 13 reads
}
interface EvidenceRef { kind: string; assetId: string; ticks: [Tick, Tick]; orderIds: string[]; fillIds: string[]; newsIds?: string[]; points: number; }
```

### §2.8 Fees, limits and programs

```ts
interface FeeSchedule { feeClass: string; takerRate: number; makerRate: number; auctionRate: number; minFee: Money; perContract?: Money; }
interface VolumeTier { min30dVolumeFdl: Money; multiplier: number; highVolume: boolean; }
interface RegisteredMarketMaker {
  ownerGroupId: string; entityId: string; assets: string[]; since: Tick;
  obligation: { maxHalfSpreadMult: number; minQtyAdv: number; minPresence: number };
  presenceToday: Record<string, number>; missedDaysWeek: number; status: 'ACTIVE' | 'REBATE_SUSPENDED' | 'REVOKED';
}
interface BlockCross { crossId: string; assetId: string; buyerId: string; sellerId: string; qty: Qty; agreedTick: Tick; executeAtTick: Tick; price?: Price; publishTick: Tick; status: 'PENDING' | 'DONE' | 'FAILED'; }
```

---

## §3 Rules and formulas

Notation. `t` is the tick of day (0..719), `N` the absolute tick. `ln` is the natural log. Quantities inside the model are in **ADV units** (fraction of the asset's model average daily volume, §3.14) unless stated. `σ_d` is the asset's current daily value volatility (§3.3.2), `σ_tick` its per-tick volatility (§3.3.1). `s` is the maker's current half-spread in log units (§3.4.2). Every random draw uses a named 02 stream: `mkt/factor/<factorId>`, `mkt/idio/<assetId>`, `mkt/jump/<assetId>`, `mkt/pool/<pool>/<assetId>`, `mkt/bg/<assetId>`, `mkt/alloc/<assetId>`, each keyed by tick, so one asset's draws never depend on another asset's order count.

### §3.1 Pipeline placement (00 §5.2)

| Phase | What 05 does |
|---|---|
| P1 validate | Every `mkt.*` intent is validated (§3.8): schema, license (13), Held state (13), session, rate limits, caps, buying power and locate (07), capital controls (04 §3.13.6), onboarding cap (18). Accepted orders get holds (03). Rejections return a code (§4.2). |
| P2 world | 05 reads the published tick inputs: 04 macro state and Fear Index of tick N−1, 06 anchors (`lnF`) and corporate actions due this tick, 16 news items with `publishTick = N` (event facts, not headlines, 16 §3.6.5), 04 crisis hooks. |
| P3 value | The value layer steps (§3.3) for every asset whose calendar is active this tick. The belief overlay updates (§6.3). |
| P4 npc | Every NPC pool computes its orders **from the state published at the end of tick N−1** (§6.2): prices, depth, indicative auction, lnV, Fear Index. 04 hands its CB, treasury and Concord orders (04 §6.3). 07 hands liquidation orders. 08 hands ETF and fund flows. The maker ladder for tick N is built (§3.4.2). |
| P5 agents | AI agents (11) and delegated operators submit intents; they pass through the same P1 validation in the same tick before P6 (11 §3.x, "after human intents in P0 order"). |
| P6 match | Sub-phases in this fixed order: **6.0** stop and take-profit triggers from tick N−1 LAST or MARK, trailing-stop peaks, OCO and bracket links, algo child generation (§3.7), market-order carry-over (§3.6.6); **6a** the four FX books (so `autoFx` conversions see this tick's FX price); **6b** every other book, independently per asset, in ascending `assetId` order for determinism (the MARKET partition may run them in parallel, 19); **6c** block crosses (§3.20) at the closing-auction tick only; **6d** RFQ fills (06 §3.x). The FINANCE partition runs 04's primary auctions in P6 in parallel; they share no state with 6a–6d. |
| P7 settle | Fills become postings queued for P13 (§3.13); holds release; positions update (07 for margin accounts). |
| P8 accrue | At `t = 719`: GTC and GTD expiry, daily fee tiers, model ADV recompute (§3.14), GARCH update (§3.3.2), maker layoff (§3.4.5), surveillance score update (§3.16). |
| P13 commit | 03 commits the queued postings. |
| P14 publish | Book, tape, ticker, auction results, trading state, indicative auctions; hourly and daily cause vectors (§3.12); daily statistics (§3.11). |

**Determinism.** Inside P6 an asset's auction is a pure function of (its book after P1, the maker ladder, pool orders, its RNG stream for allocation remainders). Order of submission inside a tick never matters (all intents of tick N are sealed together, 02), which is the fairness commitment of §1.

### §3.2 Sessions, calendars and clocks

#### §3.2.1 Trading days
The 02 calendar has a 7-day week. Days 1–5 of each week are **trading days**; days 6–7 are the weekend. There are no holidays (`DEFAULT (Mathis may override)`: a holiday table can be added in 22 without code change; this resolves old open question R03 "holidays and weekends": weekends yes, holidays none at launch). One game year = 52 weeks = 260 trading days.

#### §3.2.2 Session profiles

| Profile | Classes (default) | Matching ticks | Auctions | Daily official price |
|---|---|---|---|---|
| `EXCHANGE_SESSION` | EQUITY, ETF, GOV_BOND, CORP_BOND, OPTION (equity and index underlyings), COMPUTE, DATA_CREDIT | trading days: pre-market 0–59 (order entry only), opening auction `t = 60`, continuous 61–539, closing auction `t = 540`; 541–719 CLOSED (entry allowed, queued for the next open) | OPEN, CLOSE, REOPEN | closing auction price |
| `FX_24_5` | FX | every tick of trading days; weekend CLOSED | daily **fix** auction at `t = 540`; weekly REOPEN auction at day 1 `t = 0` | fix price |
| `FUT_24_5` | FUTURE, COMMODITY_SPOT, ENERGY_MWH, options on futures | every tick of trading days except a 10-tick maintenance pause `t = 710–719` | settlement auction `t = 540`; daily REOPEN at `t = 0` | settlement price |
| `CRYPTO_24_7` | CRYPTO_MAJOR, CRYPTO_ALT, MEME, STABLECOIN, PERP | every tick of every day | none (continuous ticks only) | VWAP of ticks 530–540 (the "540 mark"), so all classes share one daily reference time |

During the fix, settlement and closing auction ticks the asset clears once with auction rules (§3.10). 00's after-hours phase (541–719) is therefore used by FX, futures and crypto only, as 00 states.

#### §3.2.3 Active clocks for the value layer
- Session classes (`EXCHANGE_SESSION`, `FX_24_5`, `FUT_24_5`): the value layer steps on **every tick of every trading day**, including ticks when the book is closed, so overnight news and drift accumulate into the opening gap. Active ticks per year `A = 260 × 720 = 187,200` (`PARAM.mkt_active_ticks_session = 187200`). Weekend ticks do not diffuse; news and macro shocks published on a weekend still apply (§3.3.4).
- Crypto: steps every tick, `A = 364 × 720 = 262,080` (`PARAM.mkt_active_ticks_crypto = 262080`).
- Days per year for daily volatility: `Dy = 260` (session) or `364` (crypto). `σ_d = σ_ann,eff / √Dy`, `σ_tick = σ_ann,eff / √A`.

### §3.3 The value layer

The value layer `lnV` is what a well-informed consensus thinks the asset is worth. It is driven by 06's fundamental anchor, macro and sector factors, scheduled and unscheduled news, and idiosyncratic noise. It never reads orders.

#### §3.3.1 Per-tick step
For each active tick:

```
lnV_N = lnV_{N−1} + A_N + D_N + S_N + J_N + X_N

A_N (anchor pull)  = −k · (lnV_{N−1} − lnF_N),           k = 1 − 2^(−1 / (anchorHalfLifeDays × 720))
D_N (convexity)    = −½ · σ_ann,eff² / A                    (keeps E[V] a martingale between anchor moves)
S_N (diffusion)    = σ_ann,eff · √(1/A) · ( Σ_k L'_k · z_{k,N} + √(1 − Σ_k L'_k²) · ε_N )
J_N (Kou jump)     = with probability λ_eff / A: +Exp(jumpUpMean) w.p. pUp_eff, else −Exp(jumpDownMean)
X_N (external)     = Σ value shocks delivered this tick (§3.3.4)
```

- `σ_ann,eff = sigmaV × PARAM.mkt_lnv_vol_scale (1.15) × √h × m_reg × m_event × m_hype`. The 1.15 scale compensates for the flow layer printing value moves only partially (specs/quant-market-ecology `lnVVolScale`); 20 calibrates it so that realized price volatility over 63 days is within [0.9, 1.1] × `sigmaV` in calm regimes.
- `h` is the GARCH multiplier (§3.3.2); `m_reg` the regime multiplier (§3.3.5); `m_event` the product of active 04 crisis multipliers for this asset (§6.4); `m_hype = 1 + 2H` for crypto and meme (06 §3.x hype `H`), else 1.
- `z_{k,N} ~ N(0,1)` is one draw per factor per tick, shared by every asset (stream `mkt/factor/<k>`). `ε_N` is a standardized Student-t with `ν` degrees of freedom from 06 §3.21, scaled to unit variance (`ε = t_ν × √((ν−2)/ν)`), stream `mkt/idio/<assetId>`.
- `lnF` is 06's anchor for this tick (interface §3.3.6). A changed anchor is not printed as a jump: it pulls with the half-life. A **discrete** fundamental change (earnings surprise, rating action, M&A terms, default) arrives as a value shock in `X` (§3.3.4) and 06 moves `lnF` by the same amount in the same tick, so the pull does not double count.

#### §3.3.2 GARCH volatility clustering
Once per trading day at `t = 719` (P8):

```
r_d   = ln(V_close / V_prev_close) − (sum of X shocks today)     // diffusive part only; news shocks do not feed GARCH twice
h_new = ω + α · (r_d² / σ_d,base²) + β · h_old,     ω = 1 − α − β   (unconditional mean of h is 1)
h     = clamp(h_new, PARAM.mkt_garch_h_min (0.25), PARAM.mkt_garch_h_max (9))
```

`α = PARAM.mkt_garch_alpha (0.08)`, `β = PARAM.mkt_garch_beta (0.90)`; stablecoins `α = 0.02`, `β = 0.95` (06 §3.21). `σ_d,base = sigmaV × 1.15 × m_reg / √Dy`. A news shock larger than `3σ_d` adds `0.5 × (|X|/σ_d,base)² × α` to `h_new` (big news does raise future volatility, but at half weight).

#### §3.3.3 Factor model
Factors (all orthogonal by construction; correlation between assets comes only from shared loadings, which keeps the covariance matrix positive definite by construction):

| Factor id | Meaning | Who loads |
|---|---|---|
| `GX` | world equity market | every equity, ETF, crypto (0.2–0.4), HY credit |
| `EQ_<bloc>` (5) | bloc equity market beyond GX | that bloc's equities |
| `SEC_<sector>` (one per sector in 22, 12 at launch) | sector | equities of the sector, sector ETFs |
| `RATES_<bloc>` (5) | bloc rates level (price factor: + = rates down) | government and corporate bonds, rate-sensitive equities (utilities, REITs, banks with negative sign) |
| `CREDIT` | world credit spread (+ = spreads tighter) | corporate bonds, banks, HY-sensitive equities |
| `FX_<ccy>` (EUN, PYN, NKR, SRL) | currency value vs FDL | FX legs (loading 1), exporters (signed) |
| `CMD_ENERGY`, `CMD_METALS`, `CMD_AGRI`, `GOLD` | commodity groups | commodities, energy and mining equities |
| `CRYPTO` | crypto market | crypto majors (0.7–0.9), alts, meme, crypto equities |
| `AI_RACE` | AI race sentiment (11's index changes) | AI, chip and compute assets |

Default loadings are authored per asset in 22 within these class rules: equities `L_GX² + L_EQ² + L_SEC² ∈ [0.35, 0.65]` (large caps at the top), bonds `L_RATES² ∈ [0.7, 0.95]`, FX legs `L_FX = 1` (their diffusion is the factor itself, so FX crosses are consistent), crypto `L_CRYPTO² ∈ [0.5, 0.8]`. The identity `Σ L'² ≤ 1` is validated at load (22 authoring check).

**Crisis correlation.** While a STORM or MAJOR affecting the asset is in its TRIGGER or CONTAGION phase (04 §3.16), the market loading is raised and idiosyncratic share reduced: `L'_GX = √(L_GX² + c × (1 − Σ L²))`, with `c = PARAM.mkt_crisis_corr_storm (0.3)` or `PARAM.mkt_crisis_corr_major (0.5)`, plus the regime's additive `c_reg` (§3.3.5). Other loadings unchanged. This reproduces "correlations go to one in a crash" without a separate model.

**Factor jumps.** 04's release reactions (04 §3.15, "handed to 05 as a news jump on factors") and 04's crisis hooks deliver factor jumps `J_k`. Each asset applies `X += L_k × (σ_ann,asset / σ_ref,k) × J_k`, where `σ_ref,k` is the volatility of the factor's reference index (GX index, bloc index, sector index, a 10y bond line, the FX pair itself). So "GX −3%" moves a 1.5-beta stock about −4.5% and a defensive stock less.

#### §3.3.4 Value shocks (`X`)
A value shock is `ValueShock { shockId, target: assetId | factorId, logMove, sourceKind: 'NEWS' | 'MACRO' | 'FUNDAMENTAL' | 'EVENT', sourceRef, uncertainty }`, delivered by its owner module:
- 09: company events (earnings surprise, guidance, product, executive change, scandal, M&A, bankruptcy), sized by 09's own fundamentals model; 06 moves the anchor accordingly.
- 04: macro releases, CB decisions (through the curve for bonds; equity factor jumps per 04 §3.15), sovereign events, FX regime events, crisis trigger shocks.
- 06: rating actions on corporates (via 08), stablecoin depegs, venue incidents, commodity supply shocks.
- 11 (AI race milestones), 12 (successful hostile ops against a listed company, sized by 12), 16 (politics, weather, geopolitics; 16 never sizes asset moves itself, it supplies event facts and the owner module sizes them, 16 §3.6.5).
A shock with `uncertainty > 0` (an unconfirmed fact, a rumor, a claim) does **not** enter `lnV`; it enters the belief overlay instead (§6.3) until it resolves.

Shocks published on a weekend or overnight apply to `lnV` at their tick; the price catches up at the next open (§3.10.1).

#### §3.3.5 Regime multiplier table (05 owns; 04 §3.3.5 supplies the regime)
The asset's regime is its home bloc's regime (global assets such as crypto, gold and commodities use 04's global regime).

| Regime | `m_reg` (vol) | jump intensity × | jump down-probability shift | `c_reg` (crisis correlation add) | maker depth × |
|---|---|---|---|---|---|
| EXPANSION | 0.90 | 0.8 | −0.05 | 0 | 1.10 |
| OVERHEATING | 1.05 | 1.0 | +0.05 | 0 | 1.00 |
| CONTRACTION | 1.45 | 1.6 | +0.15 | 0.15 | 0.80 |
| RECOVERY | 1.15 | 1.2 | 0 | 0.05 | 0.90 |

`PARAM.mkt_regime_vol_{exp,ovh,con,rec}`, `PARAM.mkt_regime_jump_{…}`, `PARAM.mkt_regime_skew_{…}`, `PARAM.mkt_regime_corr_{…}`, `PARAM.mkt_regime_depth_{…}` hold the table. On a regime change the multipliers move linearly to their new values over 5 trading days (no step in volatility on the announcement tick). The Fear Index does not multiply value volatility (that would close a loop through `rv21_GX` in 04 §3.14.1); it acts on liquidity and pools only.

#### §3.3.6 Interface with 06 and class defaults
05 assumes from 06: `anchor(assetId, N) → { lnF: number; changedBy?: shockId }` every tick for every listed instrument (06 recomputes on its own cadence and holds the value constant in between); `priceParams(assetId) → { sigmaV, nu, jumpsPerYear, jumpUpMean, jumpDownMean, anchorHalfLifeDays, baseHalfSpread }` from 06 §3.21 class defaults or 22 overrides; `hype(assetId) → H` for crypto and meme. For FX legs, `lnF` is 04's `FxState.fairValueLn` (04 §2.9) for XXX/FDL and 06's drift term is not used (06 §3.x, "κ is not used for FX legs"), the FX anchor half-life is `PARAM.mkt_fx_anchor_hl_days (20)`. For government bonds, `lnF` is 06's model price of the line off 04's curve (half-life 2 days per 06 §3.21), so bond prices follow curve recomputes within hours, and intraday moves come from the RATES factor, news and flow (04 §3.7.1). ETFs have no own value process: `lnV_ETF = ln(iNAV)` computed each tick from constituents' `lnV` and 08's basket (§6.2 ARB keeps the price near iNAV). Options and other derivatives have no value process either: 06 marks them from the underlying, and their books are quoted by the NPC options maker of 06 (`mkt.order.placeMulti`, §4).

05's additions to the 06 class defaults:

| Class | `turnover` (daily share of size) | `impactY` | `valuePrint` | `newsPrint` | `openPrint` | `guardGap` | `tickBandMin` |
|---|---|---|---|---|---|---|---|
| Equity large cap | 0.0040 | 0.8 | 0.10 | 0.50 | 0.50 | 0.25 | 0.005 |
| Equity small cap | 0.0060 | 0.9 | 0.10 | 0.45 | 0.45 | 0.35 | 0.010 |
| ETF | (from constituents) | 0.6 | 0.30 | 0.60 | 0.60 | 0.02 | 0.005 |
| Government bond | 0.0050 | 0.5 | 0.30 | 0.70 | 0.60 | 0.02 | 0.001 |
| Corporate bond | 0.0010 | 1.0 | 0.15 | 0.50 | 0.50 | 0.08 | 0.003 |
| FX leg | authored notional | 0.4 | 0.20 | 0.70 | 0.60 | 0.05 | 0.001 |
| Commodity spot and futures | 0.0300 of open interest | 0.8 | 0.15 | 0.60 | 0.50 | 0.20 | 0.005 |
| Crypto major | 0.0300 of supply float | 0.9 | 0.10 | 0.50 | n/a | null | 0.010 |
| Crypto other | 0.0500 | 1.0 | 0.08 | 0.40 | n/a | null | 0.020 |
| Meme | 0.1500 | 1.2 | 0.05 | 0.30 | n/a | null | 0.040 |
| Stablecoin | 0.2000 | 0.3 | 0.50 | 0.90 | n/a | 0.01 | 0.001 |
| Compute, data credits, MWh | 0.0200 | 0.8 | 0.15 | 0.50 | 0.50 | 0.20 | 0.005 |

`valuePrint`, `newsPrint`, `openPrint` defaults come from specs/quant-market-ecology (`valuePrint 0.1`, `newsPrint 0.5` for equities) and are scaled for classes with faster arbitrage. `guardGap = null` means no guard: crypto and meme prices can drift far from any value, by design.

### §3.4 The flow layer and the NPC market maker

The flow layer sets the price at which things actually trade. Its only liquidity provider of last resort is the NPC market maker ("the maker", one logical maker per asset, owned by the exchange's NPC dealer community and never a ledger entity of the player economy). Every impact in the game happens on the maker's ladder; no other code adds price impact (T08, "no effect is charged twice").

#### §3.4.1 The maker's reference price
```
lnRef_N = lnB_N + Π_N + T_N + b_N + skew_N
```
- `lnB` (base): the level the maker currently believes, without today's flow effects (§3.4.7).
- `Π` (permanent impact of today's net flow): from the shared daily tally (§3.4.3); folded into `lnB` at the daily close.
- `T` (transient impact): decays (§3.4.4).
- `b` (belief overlay): from claims and rumors (§6.3).
- `skew`: inventory skew (§3.4.5).

#### §3.4.2 The ladder
For each tick the maker posts a continuous supply curve above `lnRef` and a demand curve below it. The cumulative quantity it will sell at log distance `δ ≥ s` above `lnRef` (and symmetrically buy below) is

```
Q_ask(δ) = D_ask · ADV · ((δ − s) / (Y · σ_d))²          for δ ≥ s;  0 for δ < s
```

equivalently the price reached by taking quantity `q` from the maker is `δ(q) = s + Y · σ_d · √(q / (D · ADV))`. This **is** the square-root impact law, with `Y = impactY` (`PARAM.mkt_impact_y_default = 0.8`) and depth multiplier `D`. The ladder is evaluated only on the instrument's price grid inside the tick band (§3.9.1); its quantity at each grid level is rounded down to whole lots.

- Half-spread: `s = baseHalfSpread × (1 + PARAM.mkt_spread_fear_k (1.5) × F/100) × (1 + 0.5 × (√h − 1)) × m_spread,event × m_spread,time`, where `m_spread,time = 1.5` in the first and last 10 continuous ticks of a session (thin edges), else 1. `s` is never below half the price-grid tick.
- Depth: `D = PARAM.mkt_depth_base (1.0) × (1 − PARAM.mkt_depth_fear_k (0.6) × F/100) × regimeDepth (§3.3.5) × m_depth,event × mmCrowding (§3.19.4) × invSide (§3.4.5)`, floor `PARAM.mkt_depth_floor (0.2)`. In the opening, closing, fix, settlement and reopen auctions `D` is multiplied by `PARAM.mkt_auction_depth_mult (3.0)` (natural liquidity concentrates in auctions).
- 04 crisis hooks (`makerWithdrawal(assetFilter, depthMult, ticks)`, 04 §3.16.6) multiply `m_depth,event` for their duration (FLASH_CRASH: 0.2 for 30 ticks; LIQUIDITY_HICCUP: 0.5 for 60 ticks; CRYPTO_FLUSH: 0.5 for a game day).

The maker's ladder is shown in public depth exactly like any resting order (aggregated by level), so what a player sees is what is there (players cannot be surprised by a hidden ladder, only by hidden icebergs of others).

#### §3.4.3 Permanent impact: the shared daily tally
After each auction, let `q_N` be the maker's net fill (positive when the maker sold, i.e. the market net bought). The tally accumulates over the trading day across **all** participants:

```
Qc_N  = Qc_{N−1} + q_N                                         // shared, signed, ADV units
Π_N   = sign(Qc_N) · φ · Y · σ_d · √(|Qc_N| / D_day)          φ = PARAM.mkt_perm_share (0.5)
```

`D_day` is the depth multiplier averaged over today's ticks so far (so withdrawals during a crash make the same flow more permanent). At the daily close (`t = 540` for session classes, `t = 719` for 24-hour classes) `lnB ← lnB + Π`, then `Π = 0`, `Qc = 0`.

Why shared: because the tally depends only on today's **net** flow against the maker, splitting a large order across ticks, across alts, or across colluding friends does not reduce its permanent impact, and two whales buying together pay the impact of their combined size (crowding emerges, 20 H04). Opposing flows cancel, which is how a whale selling into a crowd of buyers can "absorb" a move.

#### §3.4.4 Transient impact
The peak displacement of a tick is `I_N = sign(q_N) · (δ(|q_N|) − s)` measured from the tick's reference. The part not already in `ΔΠ_N` becomes transient:

```
T_N = ρ · T_{N−1} + (I_N − ΔΠ_N),         ρ = 2^(−1 / PARAM.mkt_transient_hl_ticks (15))
```

If `I_N − ΔΠ_N` has the opposite sign to `I_N` (the tally fell because of opposing earlier flow), it is clamped to 0. So a single large buy jumps the price by the full square-root amount, gives back about half within an hour of game time, and keeps `φ = 0.5` of it permanently: the "impact decays to about half" stylized fact.

#### §3.4.5 Inventory, skew and layoff
- Maker inventory `inv` (ADV units, positive = long) changes by `−q_N` each tick.
- Skew: `skew = −PARAM.mkt_maker_skew_k (1.0) × s × clamp(inv / invCap, −1, 1)` with `invCap = PARAM.mkt_maker_inv_cap_adv (0.5)`. A long maker lowers its reference to attract buyers.
- Side depth: on the side that would increase `|inv|`, depth is multiplied by `invSide = max(0.2, 1 − 1.6 × max(0, |inv|/invCap − 0.5))`; the other side is unchanged. Past the cap the maker still trades (it is the liquidity of last resort) but at 0.2 depth, so impact rises steeply.
- Layoff: at the daily close the maker lays off `PARAM.mkt_maker_layoff (0.12)` of its inventory to the off-book NPC world (no print, no impact, no posting): `inv ← 0.88 × inv`. Its reference does not move from the layoff.
- Maker PnL is tracked for diagnostics only (20 checks that the maker earns a small positive spread income in calm markets and loses in crashes; it is not a ledger entity).

#### §3.4.6 Class defaults for the flow layer
`turnover`, `impactY`, print shares, `guardGap` and `tickBandMin` per class are in §3.3.6. Base half-spreads come from 06 §3.21 (e.g. large-cap 2 bp, small-cap 25 bp, majors 5 bp, meme 1–3%). Pool weights per class are in §6.2.

#### §3.4.7 How `lnB` follows value
Each active tick (also when the book is closed, so the maker's quote at the open already reflects part of the night):

```
lnB_N = lnB_{N−1}
      + valuePrint · (A_N + D_N + S_N)       // a small share of diffusive value moves printed directly
      + newsPrint  · (J_N + X_N)             // a larger share of jumps and news printed directly
      + guard_N
guard_N = −0.05 · sign(G) · max(0, |G| − guardGap),   G = lnRef_{N−1} − lnV_N   (only when guardGap ≠ null)
```

The rest of every value move becomes a **gap** `G` between the price and value. The VALUE pool (§6.2) trades that gap against the maker, which moves the price through the tally and transient impact: news drifts in over hours (post-announcement drift) and overshoots can follow when trend and retail pools join. This is the specs/quant-market-ecology design: inefficiencies are emergent and decay as capital (pool capacity, players) exploits them.

**Opening print.** At the opening auction (and every REOPEN after a halt or weekend), before the auction clears: `lnB ← lnB − openPrint × G`, with `G = lnRef − lnV` as above, so the maker opens closer to value (§3.10.1).

**FX spot.** FX books use exactly this mechanism with `lnV` = 04 fair value. Spot can overshoot fair value under flow (04 §3.13.1, "spot can overshoot"); CB edge orders under MANAGED_BAND and lean-against-wind orders are pool orders (CB pool, §6.2) that meet the maker like any flow. A break of a band (04 §3.13.5) removes the CB edge orders; the next tick's flow finds only the maker's ladder.

**Cross rates.** Only the four XXX/FDL books exist. A cross order (for example EUN/PYN) is executed as two linked legs in 6a (sell EUN/FDL, buy PYN/FDL) under one intent with all-or-none semantics, and its price is the product of the two clearing prices, so there is no triangular arbitrage by construction (04 test 28). Display quotes for crosses are the products of the two FDL mids.

### §3.5 The per-tick uniform-price batch auction

Every asset whose trading state allows matching clears **once per tick** in 6a or 6b. Continuous ticks, opening, closing, fix, settlement and reopen auctions all use this algorithm; only the participants, depth multiplier and band differ (§3.10).

#### §3.5.1 Participants
1. Resting orders (players, AIs, operators, registered market makers, CB and treasury RESTING orders, pool RESTING orders), with their remaining displayed and hidden quantity.
2. New orders accepted in P1 of this tick, plus orders triggered or generated in 6.0 (stops, algo children, carried-over market orders).
3. The maker's ladder (§3.4.2) as an aggregate supply curve above `lnRef` and demand curve below it.
4. Pool orders from P4 (§6.2), as IOC limits.

#### §3.5.2 Choosing the clearing price
Let the candidate set `C` be every limit price of a participant inside the band `[lo, hi]` (§3.9.1) plus every price-grid point where the maker's ladder quantity changes, inside the band. Market orders count as limit `hi` (buy) or `lo` (sell). For each `p ∈ C`:

```
Dem(p) = Σ buy qty with limit ≥ p   + makerBid(p)       // makerBid(p) = Q_bid(lnRef − ln p) for p below the bid edge
Sup(p) = Σ sell qty with limit ≤ p  + makerAsk(p)
Exec(p) = min(Dem(p), Sup(p))
```

The clearing price `p*` is chosen by, in order: (1) maximum `Exec`; (2) minimum `|Dem − Sup|`; (3) minimum `|ln p − lnRef|`; (4) the lower price. If `max Exec = 0` the asset does not trade this tick; the indicative price and imbalance are still published. Because the maker is always in `C` with positive depth, any marketable flow trades unless the band clamps it (§3.9.1).

#### §3.5.3 Allocation
At `p*` the side with excess interest is rationed; the other side fills fully. Priority on the rationed side:
1. **Price**: better limit first (market orders are the best price).
2. **Time**: lower `priorityTick` first (an order entered this tick has `priorityTick = N`).
3. **Visibility**: displayed quantity of icebergs ranks before their hidden reserve; reserve refills the display only after the displayed slice fills, and the refreshed slice takes `priorityTick = N`.
4. **Players before the maker at the same price**: at any single price level the maker's ladder quantity ranks after every resting order at that level (`DEFAULT (Mathis may override)`: this rewards players who supply liquidity and makes registered market making possible, §3.19).
5. Equal keys: pro rata by remaining quantity, in whole lots; leftover lots go one by one in ascending order of `hash(seed, N, assetId, orderId)` (stream `mkt/alloc/<assetId>`).

#### §3.5.4 Pairing, counterparties and self-trade prevention
A uniform-price auction allocates quantities, not pairs. To produce fills with counterparties (needed for postings, counterparty kinds and surveillance), filled buys and filled sells are each sorted by their allocation priority and paired by a two-pointer walk; the maker and pools are inserted at their priority position.

- **STP**: if the walk pairs two orders of the same `ownerGroupId` (15's beneficial-owner group, so alts and controlled entities count as one), both orders are **decremented** by the paired quantity (neither fills it; the decremented quantity is cancelled with reason `STP`), and the auction re-runs without it. Linked but different owner groups (15 link graph) may match; the match is flagged to surveillance (F3, §3.16), never blocked (20 INV-MKT-002).
- **FOK**: after clearing, every FOK order that would fill partially is removed and the auction re-runs.
- At most `PARAM.mkt_max_auction_passes (3)` passes. If STP or FOK conflicts remain after pass 3, the remaining conflicting quantities are removed and fills are recomputed at the pass-3 price without re-pricing.
- Fill price is `p*` for every fill of the asset in the tick (20 INV-MKT-001).

#### §3.5.5 After the auction
`lastPrice = p*`, `lnP = ln p*`; maker fill `q_N` updates the tally (§3.4.3), transient (§3.4.4) and inventory (§3.4.5); pool positions update; fills go to P7. `AuctionResult` is recorded with the signed residual `imbalance` at `p*` among marketable orders and `aggressorSide` = the side that took net quantity from the maker (NONE if the maker's net fill is 0).

### §3.6 Orders

#### §3.6.1 Types

| Type | Behaviour |
|---|---|
| MARKET | executes at any price inside the band; protection per §3.6.6 |
| LIMIT | executes at `limitPrice` or better; rests until TIF ends |
| STOP | becomes MARKET when the trigger price crosses `stopPrice` (§3.6.5) |
| STOP_LIMIT | becomes LIMIT at `limitPrice` when triggered |
| TAKE_PROFIT / TAKE_PROFIT_LIMIT | as STOP / STOP_LIMIT with the trigger on the favourable side |
| TRAILING_STOP | stop whose `stopPrice` follows the best trigger price since entry by `trail` (absolute or percent); it never moves against the holder |
| MOO / LOO | market or limit order for the opening auction only (or the next REOPEN); expires if unfilled |
| MOC / LOC | market or limit order for the closing (fix, settlement) auction only; entry cut-off `t = 535` for MOC and new LOC; after 535 only LOC orders that offset the published imbalance are accepted |

Every class supports every type that makes sense for it: MOO and LOO need an opening auction (not crypto); MOC and LOC need a closing, fix or settlement auction (not crypto).

#### §3.6.2 Time in force
- **DAY**: expires at the asset's daily close (`t = 540` for EXCHANGE_SESSION; `t = 719` for 24-hour profiles).
- **GTC**: expires after `PARAM.mkt_gtc_max_days (91)` game days (one game quarter, about 4 real days); the player is warned 1 game day before.
- **GTD**: expires at `gtdTick` (≤ 91 game days ahead).
- **IOC**: fills what it can in its tick; the rest is cancelled.
- **FOK**: fills completely in its tick or not at all (§3.5.4).

#### §3.6.3 Flags
- `postOnly`: rejected in P1 if marketable against the current published best (bid, ask) of tick N−1; if it becomes marketable in the auction because of other flow it still trades (batch auctions have no taker side), but it is billed the maker rate.
- `reduceOnly`: accepted only if it reduces an existing position; quantity is capped at the open position at execution.
- `autoFx`: the account's cash is in another currency; a linked FX leg executes in 6a for the estimated notional plus `PARAM.mkt_autofx_buffer (0.5%)`; if the FX leg fails or capital controls forbid it (04 §3.13.6), the asset leg is cancelled with `FX_LEG_FAILED`. Unused converted cash stays in the target currency.
- `auctionOnly`: participates only in opening, closing, fix, settlement or reopen auctions.

#### §3.6.4 OCO and brackets
- **OCO**: up to 3 orders share `ocoGroupId`; the first fill (even partial) of any member cancels the others' unfilled quantity in 6.0 of the next tick. Two members filled in the same tick is possible; the excess is then a normal position the player sees.
- **Bracket**: an entry order with a take-profit and a stop-loss child; the children become WORKING as an OCO pair, sized to the entry's filled quantity, when the entry fills.

#### §3.6.5 Triggers
Stops, take-profits and trailing stops are evaluated in 6.0 of tick N against the trigger reference of tick N−1: `LAST` (last clearing price) or `MARK` (07's mark, 03 §3.9.1 thin-print guard). Triggered orders join this tick's auction with `priorityTick = N`. Stops never trigger while the asset is HALTED or in VOL_INTERRUPTION; they are evaluated against the reopen price. Stops are private and never appear in depth (§3.11). Stops triggered by the maker's own prices are not "hunted" by the maker: the maker never sees stops.

#### §3.6.6 Market-order protection
A market order that is not fully filled because the band clamped the price stays alive as a market order for up to `PARAM.mkt_market_order_ticks (6)` further ticks (`marketTicksLeft`), with `priorityTick` of its entry, and is then cancelled with reason `PROTECTION_EXPIRED`. It never trades outside the band of its tick. During a halt the countdown pauses. The pre-trade preview shows the expected fill range (§3.18.2).

#### §3.6.7 Icebergs and modification
- Display quantity `displayQty ≥ max(1 lot, PARAM.mkt_iceberg_min_display (5%) × qty)`.
- **Modify**: lowering quantity keeps priority; raising quantity or changing price resets `priorityTick` to the tick of the modification. Modifying an order in the same tick it was entered is allowed.
- Cancels and modifications take effect in P1 of the tick they are sealed in, so they act before that tick's auction.

#### §3.6.8 Large-order auto-split
A non-algo order with `qty > PARAM.mkt_autosplit_adv (3) × ADV` is converted at P1 into a POV parent at `PARAM.mkt_autosplit_pov (10%)` participation with the order's limit (or the band for market orders), DAY TIF, and the player is told so in the preview. No license is needed for auto-split. (This prevents an accidental 20-ADV market order from walking the ladder to the band edge in one tick.)

#### §3.6.9 Multi-leg packages
`mkt.order.placeMulti` sends 2 to 4 legs on derivatives of one underlying (spreads, straddles, strangles, butterflies, calendar rolls, covered calls) as a package quote request to 06's NPC options maker with a net limit. The package fills all legs together or nothing, in 6d, priced by 06 off its surface plus the package's half-spread; legs are recorded as fills on each instrument but do not enter the instrument's batch auction (no impact on the underlying book).

### §3.7 Execution algorithms (LIC2; 17 BRK-04)

An algo is a private parent that generates at most one child order per tick in 6.0. Children are ordinary LIMIT IOC orders (priority as any new order). The parent is never visible to anyone else.

| Kind | Child size at tick N | Default params |
|---|---|---|
| TWAP | `target(N) − filled`, `target` linear in active ticks between `startTick` and `endTick` | |
| VWAP | as TWAP with `target` following the asset's intraday volume profile `U(t)` (§3.14.3) | |
| POV | `participation × vol_{N−1}` where `vol_{N−1}` is the market volume of the previous tick, at least 1 lot when behind schedule | participation 0.10, max 0.30 |
| IS | Almgren–Chriss front-loaded: `remaining(N) = Q × sinh(κ (T − τ)) / sinh(κ T)`, `κ = urgency × 3 / T` (τ, T in active ticks) | urgency 0.5 (0 = TWAP, 1 = aggressive) |

Common rules: each child is capped at `maxChildPerTickAdv` (default `PARAM.mkt_algo_child_cap (0.02)` ADV); child limit = `min(limitPrice, ref ± (s + limitOffsetTicks × gridTick))`; the algo pauses automatically during halts and auctions it is not configured for, and resumes after; `mkt.algo.pause/resume/modify/cancel` act in P1. Status changes and progress go to the owner each tick (`AlgoProgress`, §5). Algos are available to AI agents and operators under the same license.

### §3.8 Pre-trade validation (P1)

In this order; the first failure rejects the intent with its code (§4.2):
1. Schema, ids, lot and price-grid conformity, price inside `[minPrice, 10 × prevClose]`.
2. **Rate limits**: ≤ 20 intents per tick per character (00); ≤ `PARAM.mkt_max_open_orders (200)` open orders per actor and ≤ `PARAM.mkt_max_open_orders_asset (20)` per asset.
3. **License** (13): `MarketSpec.licenseRequired` and LIC2 for algos, LIC4 plus the `CH_EXCHANGE_MEMBER` charter for registered market making. **Held** state (13): a Held character may only cancel and reduce. Defendant restrictions from 13 (for example half leverage) are applied by 07's buying-power check; 05 only passes the check's result.
4. **Session**: order type allowed in the current trading state (§3.10); halted assets accept orders and cancels but do not match (11 §edge 13 is satisfied: AI orders for halted assets are refused only for IOC and FOK types).
5. **Capital controls** (04 §3.13.6): level 1 adds the 1% levy (`CAPCON_LEVY`) to conversions out of the controlled currency; level 2 and 3 reject sales of the currency except reduce-only closes of FX derivatives.
6. **Onboarding cap** (18): if `onb.firstTradeCap(chrId)` returns a value, buy notional is capped at it.
7. **Limits** (§3.15.2): position caps, short-interest cap, compute OI cap.
8. **Buying power and holds**: cash accounts hold `qty × limit (or band hi for market buys) × (1 + taker fee)`; sells hold the asset; short sells require a locate from 07 (`borrow.locate(accountId, assetId, qty) → locateId | reject`); margin accounts call 07 `bp.check(accountId, orderDelta) → { ok, initialMarginHold }`. Holds are 03 holds released at fill, cancel or expiry.

### §3.9 Price bands, halts and circuit breakers

#### §3.9.1 Per-tick band
`|ln p* − lnP_{N−1}| ≤ w`, `w = max(tickBandMin, PARAM.mkt_band_sigma_k (6) × σ_tick)`. Auctions use wider bands: opening and reopen `max(0.10, 4 × σ_d × √(nights + 1))`, closing, fix and settlement `max(0.05, 3 × σ_d)` (FX `max(0.01, 3 × σ_d)`), measured from the last price. If the unconstrained clearing price lies outside, `p*` is clamped to the band edge and the auction executes what crosses there (`bandClamped = true`). Three consecutive clamped ticks in the same direction start a **volatility interruption** of `PARAM.mkt_vol_interrupt_ticks (12)` ticks: no matching, entry and cancels allowed, indicative auction published every tick, ending with a REOPEN auction with the opening band. Crypto and FX use bands but no interruptions (they are 24-hour and global); their band is still enforced every tick.

#### §3.9.2 Single-asset halts (`EQUITY_LULD`, also ETFs and listed compute and data credits)
Reference = previous official close. Move of ±`PARAM.mkt_halt_l1 (15%)` → halt `PARAM.mkt_halt_l1_ticks (120)` (4 game hours, 10 real minutes); ±`PARAM.mkt_halt_l2 (30%)` → halt `PARAM.mkt_halt_l2_ticks (240)`; each level triggers at most once per day; after both levels only bands apply. A halt that would end after `t = 530` ends at the closing auction instead. Every halt ends with a REOPEN auction. Corporate bonds (`BOND`): ±10% halts 60 ticks; government bonds: bands only. Company-event halts (09: pending material news, M&A announcement) are imposed by the exchange for `PARAM.mkt_news_halt_ticks (30)` ticks before the event's publish tick and end in a REOPEN auction (`DEFAULT`: material scheduled company news is published during a halt, so no one trades on the first tick blind).

#### §3.9.3 Market-wide circuit breakers (per bloc, on the bloc's main equity index, §3.22)
Measured against the index's previous close:

| Level | Decline | Effect |
|---|---|---|
| L1 | −7% | all EXCHANGE_SESSION instruments of the bloc's exchange (equities, ETFs, equity options) halt 120 ticks |
| L2 | −13% | halt 120 ticks |
| L3 | −20% | trading ends for the session; the close is the last price; closing auction skipped |

L1 and L2 trigger once per day and not at or after `t = PARAM.mkt_mwcb_cutoff_tick (470)` (the last 70 ticks); L3 can trigger any time. Bonds, FX, futures and crypto do not halt. A market-wide halt raises the event used by 04 to label an emergent FLASH_CRASH (04 §3.16).

#### §3.9.4 Futures daily limits (`FUT_LIMITS`)
Limit up/down at ±`PARAM.mkt_fut_limit (10%)` of the previous settlement. If the price is locked at a limit for 10 consecutive ticks (the limit side's imbalance persists), the asset is LIMIT_LOCKED for 20 ticks, then the limit widens once to ±`PARAM.mkt_fut_limit_wide (15%)` and a REOPEN auction runs. Index futures of a bloc follow L1/L2/L3 of §3.9.3 in addition. Options follow their underlying (`OPTION_FOLLOW`).

#### §3.9.5 Halt behaviour
During HALTED, VOL_INTERRUPTION and LIMIT_LOCKED: entry, modification and cancellation work; stops are not evaluated; algos pause; market orders' protection countdowns pause; the value layer keeps stepping; the indicative auction publishes for the last 10 ticks before reopening; pools keep their targets but submit only `auctionOnly` orders for the reopen. 07 margin uses the last mark and may call margin but does not liquidate into a halted book (it queues the liquidation for the reopen).

### §3.10 Opening, closing and special auctions

#### §3.10.1 Opening and reopen
From `t = 50` (or 10 ticks before any reopen) the indicative price and imbalance are published every tick. At the opening tick: the opening print (§3.4.7) moves `lnB`; pools submit their overnight-accumulated orders; MOO, LOO, pre-market orders and carried orders join; the maker uses auction depth; the auction clears with the opening band. The open is the price used for `dayOpen`.

#### §3.10.2 Closing, fix and settlement
From `t = 530` the indicative close and the MOC/LOC imbalance are published every tick. At `t = 540` the closing auction clears with auction depth and the closing band. The **official close** is `p*`; if nothing crosses, it is the VWAP of the last 10 continuous ticks, or the last price if there was no trade. FX fix and futures settlement prices are the same rule on their `t = 540` auctions. Crypto has no closing auction; its daily reference is the 530–540 VWAP. Official closes are what 03 uses for day-close marks (03 §3.9), 08 for NAV strikes, 06 for option and futures settlement, and 04 for rv21 and index levels.

#### §3.10.3 After the close
EXCHANGE_SESSION books are CLOSED from 541. Orders entered after the close queue for the next opening auction; DAY orders entered after the close are DAY orders for the next session. Block crosses execute in 6c of the closing tick (§3.20).

### §3.11 Market data publication (P14; L11)

| Channel (17 §2.6) | Content | Who |
|---|---|---|
| `book:{assetId}` | top 10 aggregated price levels per side (all displayed quantity including the maker's ladder, never per order, never hidden reserve, never stops), last `AuctionResult`, indicative auction when in an auction window | anyone with the asset's license; the full 10 levels need the Terminal tier (16 §3.6.6), others see 3 |
| `tape:{assetId}` | `TapePrint` per tick: price, quantity, aggressor side, block flag, deferred flag | anyone |
| `ticker:{listId}` | last, change, volume, trading state | anyone |
| daily statistics | OHLC, volume, VWAP, model ADV, rv21, short interest (aggregate, published daily), number of trades, official close | anyone |
| value layer | "Fair value (consensus)" `lnV`, rounded to 0.1%, updated each game hour | Research tier (16 §3.6.6), 06 asset page |
| cause vectors | §3.12 | per 17/18 ladder tiers |

The tape aggregates all fills of one tick into **one print** at `p*` with the total quantity (plus background volume, §3.14.2); individual fills are private to their owners. No account identity, no owner group, no order id, no counterparty is ever published. 15 publishes ownership filings (5% thresholds) from events 05 emits (§5); 05 itself publishes nothing per holder. This satisfies L11: there is no automatic leak of a whale's identity; only filings and aggregate prints exist.

### §3.12 The cause vector and "Why it moved" (L13)

#### §3.12.1 Exact decomposition
Every change of `lnP` is the change of its components: `ΔlnP = ΔlnB + ΔΠ + ΔT + Δb + Δskew + Δε`, where `ε = lnP − lnRef` is the ladder walk and price-grid rounding of the tick. Every component change is tagged with a `CauseKey` (and a sub-reference: factor id, news id, macro reference, pool kind) by the rules below, so the terms of a period sum **exactly** to `ln(close / previous close)`; any floating-point residual (≤ 1e−12) is put in `OTHER`.

| Component change | Tagged as |
|---|---|
| `valuePrint × S` (diffusion) | per factor `k`: `MARKET` (GX), `REGION` (EQ_bloc, FX), `SECTOR`, `MACRO` (RATES, CREDIT, commodity groups, CRYPTO, AI_RACE); idiosyncratic part `COMPANY_NOISE` |
| `valuePrint × A` (anchor pull) | `FUNDAMENTAL` |
| `newsPrint × X` | by `sourceKind`: `NEWS` (with newsId), `MACRO` (with macro ref), `FUNDAMENTAL`, `EVENT` (with 04 event id) |
| `newsPrint × J` (Kou jump) | `COMPANY_NOISE` |
| gap-closing moves (VALUE pool impact, guard, opening print) | split by the gap tracer (§3.12.2) |
| impact from other pools | `FLOW_<pool>` (RATES_RV counts as `FLOW_ARB`; CB, TSY count as `FLOW_POLICY`) |
| impact from player, AI and operator orders (net) | `FLOW_PLAYERS` |
| skew, `ε`, maker layoff side effects | `MAKER` |
| `Δb` | `BELIEF` (with claim and newsIds) |

Impact of a tick (`ΔΠ + new T`) is split among participant classes by their signed net taker quantity against the maker: `share_c = q_c / q_N`. When `|q_N| < 0.05 × Σ_c |q_c|` (flows nearly cancel), the tick's impact is tagged `MAKER`. Transient impact is tracked per class (`gapTracer["T:<class>"]`) and its decay is credited back to the same class with the opposite sign, so a whale's spike that fades leaves only its permanent part in `FLOW_PLAYERS`.

#### §3.12.2 The gap tracer
`G = lnRef − lnV` is stored as a vector over sources `g_s`. Every value move adds `−(1 − print share) × Δ` to its source; every non-value flow move adds its amount to its flow class. A **gap-closing** move `m` (VALUE pool impact, guard pull, opening print; `m` has the sign opposite to `G`) is attributed across sources pro rata to the components that share `G`'s sign: `m_s = m × g_s⁺ / Σ g⁺`, and `g_s += m_s`. Result: an earnings beat printed 50% at once and the rest bought in by value traders over the afternoon is attributed 100% to that news item; a trend-driven overshoot later corrected by value traders shows as positive then negative `FLOW_TREND`, netting toward zero over the window.

#### §3.12.3 Storage and `explainMove`
Cause vectors (`CauseVector`, §2.6) are stored per asset per game hour (kept 28 game days) and per day (kept for the chapter plus 364 days of history). `explainMove(assetId, fromDay, toDay) → CauseVector` sums the daily vectors (logs add exactly). It is clamped to closed periods (17 "No future"). Hourly vectors feed the intraday "Why it moved" chip; the player's journal (17 PF-04) calls it per trade; the Research Desk (17 RD-02, 18 ladder) renders it as a waterfall. 16 receives the top three terms of every daily move above `2σ_d` for its market-wrap stories.

#### §3.12.4 Player privacy in attributions (k-anonymity)
`FLOW_PLAYERS` is shown as its own line only when `playerOwnerGroups ≥ PARAM.mkt_kanon_k (5)` distinct player owner groups had fills in the period. Otherwise it is merged with all `FLOW_*` terms into one "Order flow" line. A player's own contribution (their signed share of `FLOW_PLAYERS`) is shown only to that player in their journal ("your orders moved it +0.4%"). No line ever names a player.

#### §3.12.5 Priced-in bands
For every news item with a value shock `X`, `pricedIn = (Σ terms attributed to that newsId so far) / X` (capped at [0, 1.2]). Bands: **Early** < 25%, **Mid** 25–75%, **Late** 75–95%, **Done** ≥ 95% or 5 trading days after publish. The band is shown on news cards to Terminal-tier subscribers (16 §3.6.6) and fills 16's `impactHint` for display (expected log move = `X`, 16 §3.6.5). It is information already public through prices and the fair-value line; it does not reveal any order.

### §3.13 Settlement and postings (P7, committed in P13 by 03)

| Event | Postings (03 reason codes) |
|---|---|
| Fill between two player-economy accounts | `MKT_TRADE` via `SWAP_ASSET` (cash leg and asset leg), TRANSFER class |
| Fill against the maker, a pool, the CB or treasury | `MKT_TRADE` with the NPC side on the bloc market's NPC counterparty account (`npc_MKT_<bloc>`, an NPC-core account of 03); crossing the player-economy boundary is classified by 03 (03 §F3 "trading gains against NPC liquidity") |
| Exchange fee | `MKT_EXCHANGE_FEE` from the payer to `exc_<bloc>` (or the crypto venue). The exchange stays an NPC-core entity; a concession holder is paid by 03/10's `CON_CONCESSION_PROFIT` (03 §3.11.7), so 05 never routes fees to players directly |
| Maker rebate (registered MMs) | `MKT_MAKER_REBATE` from `exc_<bloc>` |
| Transaction levy (Stabilizer, §3.15.3) | `MKT_TRANSACTION_LEVY` |
| Securities transaction tax (03 tax rules, where in force) | 05 reports taxable notional per fill; 03 posts `TAX_SECURITIES_TX` |
| Block cross | `MKT_BLOCK_TRADE` |
| Message fee | `MKT_EXCHANGE_FEE` with sub-reason `MESSAGES` |

Settlement is same-tick (T+0) for every exchange instrument: the asset and cash move at P13 of the fill tick. Derivatives fills create or change positions at the CCP (07 novation); 05 hands 07 `{fillId, accountId, assetId, side, qty, price}` and 07 handles margin and variation margin. Background prints (§3.14.2) and NPC-vs-NPC fills (pool vs maker) create no postings.

### §3.14 Model ADV, background volume and the intraday profile

#### §3.14.1 Model ADV
```
ADV_units = turnover × size × (1 + PARAM.mkt_adv_fear_k (0.01) × max(0, F − 20)) × attention × regimeTurnover
```
`size` = free float (equity), outstanding face (bonds), 22's authored daily FX notional, supply float (crypto), open interest (futures). `attention = 1 + min(1, Σ newsworthiness of today's items on the asset)` (16), so news days trade up to 2×. `regimeTurnover` = 1.0, 1.1, 1.3, 1.1 for EXPANSION, OVERHEATING, CONTRACTION, RECOVERY. ADV is recomputed at P8 and intraday at each game hour when F moves more than 10 points. **ADV is never computed from realized volume**, so wash trading cannot inflate an asset's liquidity, impact or fee tiers (exploit counter §9). 03 uses 05's ADV for the thin-print guard (03 §3.9.1); 07 for liquidity haircuts; 08 for basket execution cost.

#### §3.14.2 Background volume
Pools and players account for only part of real-world volume. The rest is **background volume**: crosses between off-book NPC investors at `p*`, with no impact, no postings and aggressor NONE. Per tick: `bg_N = max(0, ADV × U(t) × e^{0.3 z} − modeled volume_N)`, `z ~ N(0,1)` (stream `mkt/bg/<assetId>`). Total daily volume therefore averages about ADV, and the tape looks like a real market. Background volume is excluded from POV algos' volume reference (`vol_{N−1}` counts only matched orders and the maker) so algos cannot be gamed by it, and from surveillance denominators.

#### §3.14.3 Intraday profile `U(t)`
EXCHANGE_SESSION: opening auction 8%, closing auction 12%, continuous ticks `w(t) ∝ 1 + 1.5 e^{−(t−61)/40} + 1.0 e^{−(539−t)/40}` normalized to 80% (U-shape). 24-hour profiles: `w(t) ∝ 1 + 0.6 × [t ∈ bloc business hours 60–540]`, with fix or settlement auction 6%. VWAP algos and pool pacing use `U(t)`.

### §3.15 Fees, limits and levies

#### §3.15.1 Fee schedule (`PARAM.mkt_fee_*`)

| Fee class | Taker | Maker | Auction | Minimum |
|---|---|---|---|---|
| EQ (equities, ETFs) | 3 bp | 1 bp | 1 bp | $0.10 |
| BOND | 0.5 bp | 0.5 bp | 0.5 bp | $0.10 |
| FX | 0.3 bp | 0.3 bp | 0.3 bp | $0.10 |
| CRYPTO | 10 bp | 5 bp | n/a | $0.01 |
| FUT | $0.50 per contract | $0.30 | $0.30 | |
| OPT | $0.40 per contract | $0.25 | $0.25 | |
| COMMODITY (spot, compute, data credits, MWh) | 2 bp | 1 bp | 1 bp | $0.10 |

Maker or taker: an order that rested through at least one prior tick's auction is MAKER for its fills; an order entered this tick is TAKER; opening, closing, fix, settlement and reopen fills are AUCTION. **Volume tiers** on the owner group's 30-day exchange notional in FDL: < $10M × 1.0; $10M–100M × 0.8; $100M–1B × 0.6; ≥ $1B × 0.5 (`highVolume = true`); the Stabilizer acts on high-volume trading only through 03's transaction levy L3 (§3.15.3; ruling in 24). **Message fee**: when an actor's order-to-trade ratio over a game day exceeds `PARAM.mkt_otr_threshold (100)`, each further message that day costs `PARAM.mkt_message_fee ($0.10)`. Registered market makers' `mkt.mm.quote` counts as one message per quote update and is exempt up to 2,000 per day.

#### §3.15.2 Position and market limits
- Single-issuer equity holding per owner group: ≤ `PARAM.mkt_cap_npc_float (25%)` of float for NPC companies, ≤ `PARAM.mkt_cap_player_float (49%)` for player companies (control above 49% happens through 09's M&A, not the exchange). Buys beyond the cap are rejected (`POSITION_CAP`).
- Aggregate short interest ≤ `PARAM.mkt_short_cap (50%)` of float; new short sales are rejected while at the cap.
- Compute futures: open interest per owner group ≤ `PARAM.mkt_compute_oi_cap (20%)` of total.
- Ownership thresholds: when a group crosses 5, 10, 15, 20 or 25% of an issuer's shares, 05 emits `OwnershipThresholdCrossed` to 15 (filing) and 09 (takeover rules).

#### §3.15.3 Transaction levy (Stabilizer)
03 §3.7.4 defines the transaction levy lever (`L3_levy_bp`, 0–3 bp, on a consolidated group's daily exchange notional above `PARAM.levy_free_daily_notional`, DEFAULT $10M). It is the only Stabilizer lever on trading: 04's former high-volume fee multiplier is merged into it (ruling in 24), so the volume-tier fee schedule above is never multiplied. 05 reads it through `stab.tradingLevers() → { levyBp, levyFreeDailyNotional }` once per game day at `t = 0` and posts the levy at P8 on the day's excess notional (`MKT_TRANSACTION_LEVY`), defaulting to levy 0 if absent.

### §3.16 Surveillance features and score

05 computes features per owner group per game day, seals them to 13 (never to the player), and exposes `surveillanceScore(playerId, window) ∈ [0, 100]` (the max of the player's owner groups over the window), consumed by 12 and 13.

| Id | Pattern (abstract, game-mechanical) | Points per episode |
|---|---|---|
| F1 | Spoofing: an order ≥ 0.5% ADV and ≥ 5× the median size at its level, entered within 3 grid ticks of the best, cancelled within 2 ticks without fills, while the same group fills on the other side in that window | 8 |
| F2 | Layering: three or more such orders at different levels on one side, same pattern | 10 |
| F3 | Wash or circular trading: fills between linked owner groups (15 link graph) that leave combined positions within 10% of the start of the day | 12 |
| F4 | Marking the close: group's share of closing-auction volume > 20%, the close moves > 2σ_d in its favour versus the `t = 530` indicative, and reverses ≥ 50% by the next open; × 1.5 on quarter-ends, NAV strike days, expiries and when the group holds derivatives or collateral marked off that close | 15 |
| F5 | Ramping: aggressive buying (selling) ≥ 30% of tick volume for ≥ 10 ticks moving price ≥ 3σ_tick per tick, then exiting into the trend pool's response within 30 ticks | 12 |
| F6 | Promote and dump: holding plus a paid promotion or Wire post about the asset (15, 09 outlets, 06 hype campaigns) plus a sale within 2 game days | 20 |
| F7 | Benchmark distortion: trading the FX fix, settlement or an index close while holding positions that settle on it | 15 |
| F8 | Insider trading: trades in the 10 game days before a material non-public event when the group had access (15 knowledge records, board seats, 09 employees, 12 stolen data). Points `= 40 × size_f × timing_f × profit_f`, `size_f = min(1, notional / (0.1 × ADV notional))`, `timing_f = clamp(1 − daysBefore/10, 0, 1)`, `profit_f = min(1, |abnormal return captured| / (2σ_d))` | up to 40 |
| F9 | Front-running: trading ahead of orders the group could see privately: 12's C08 order-tap flag, orders of clients it operates under a mandate (00 §5.5), orders of funds it manages (08) | 25 |
| F10 | Stop pressure: concentrated aggression toward round-number levels followed by a reversal the group profits from, repeated ≥ 3 times in 5 days | 6 |
| F11 | Squeeze or corner: holding > 20% of float or > 30% of lendable supply while short interest > 30% and price ≥ 3σ_d above its 21-day mean | 10 |
| F12 | Message abuse: order-to-trade ratio > 100 with measurable price effect | 5 |
| F13 | Off-market value transfer: P2P transfers or crosses between linked groups at prices > 5% away from the market | 10 |
| F14 | Block-cross abuse: repeated block crosses between linked groups | 8 |
| F15 | Disinformation overlap: a claim later resolved false (12 flag, 16 resolution) by the group or its linked accounts, while holding a position that benefited | 25 |

Score per game day `d`: `score_d = min(100, PARAM.mkt_surv_decay (0.8) × score_{d−1} + Σ points_d)` (half-life about 3 game days). 13 opens an ECA inquiry at ≥ 60 for 3 days and investigates at ≥ 80 (13 §7). Each episode is stored with its `EvidenceRef` for 13's evidence chain. NPC actors (16 named funds) are scored too; their cases are handled by 13's NPC regulator logic.

### §3.17 Risk API (`risk.report`, read-only query; 17 RSK-01 to RSK-04)

Input: an account, entity or owner group, horizon (1 game day or 1 game week), confidence (95 or 99%). Output:
- **Historical VaR and ES** from the world's own price history (up to 500 trading days of 05's stored closes; before the world has 250 days, the genesis pre-history of 22 fills in).
- **Parametric VaR and ES** from the factor model: EWMA covariance of factor returns (λ = 0.94) plus idiosyncratic variances; ES at 97.5%.
- **Factor exposures**: beta to GX, bloc and sector factors, rates DV01, credit CS01, FX by currency, commodity and crypto deltas, option greeks from 06.
- **Liquidity-adjusted VaR**: `LVaR = VaR + Σ_i |notional_i| × (s_i + Y σ_d,i √(|q_i| / ADV_i))`, the cost of liquidating each position in one day through the ladder.
- **Stress engine**: replays of the world's own past events (16 names them, for example "Crash of Y2 Q3") as factor shock vectors recorded at the time, standard shocks (rates +200 bp, equities −20%, FX ±10%, spreads ×2, vol ×1.5), and custom factor shocks; positions are revalued through factor loadings and 06 pricing.
- **Correlation under stress** (RSK-04): holding correlations in calm windows versus windows when F > 50.
Basic VaR is free for LIC1; full output needs LIC2 (`DEFAULT (Mathis may override)`). Computed at most once per game hour per caller (cached), off the tick-critical path (19).

### §3.18 Execution analytics and pre-trade preview

#### §3.18.1 Execution analytics (private, per fill and per parent)
Arrival price (`arrivalRefPrice`, the last price at entry), implementation shortfall versus the decision price, slippage versus interval VWAP, markouts at +1, +15 and +60 ticks, realized impact versus predicted, fee breakdown. Shown in BRK-04's live monitor, the journal and the daily close page (18 J49).

#### §3.18.2 Pre-trade preview (`mkt.preview` query)
For a draft order, using only data published at N−1 (public depth, ADV, σ, band): expected average price and its P10–P90 range, instant impact `δ(q)`, expected permanent impact `φ Y σ_d √(q/ADV)`, fees after tier, buying power after, share of ADV ("your footprint: 2.4% of daily volume"), band and halt warnings, auto-split notice (§3.6.8), and for algos the expected schedule and impact range (17 BRK-04). The preview is advisory; the real result depends on everyone's flow in the tick.

### §3.19 Registered market makers (17 J56)

#### §3.19.1 Eligibility and registration
An entity with LIC4 and 13's `CH_EXCHANGE_MEMBER` charter registers for up to `PARAM.mkt_mm_max_assets (50)` assets via `mkt.mm.register`. Registration takes effect at the next trading day's open.

#### §3.19.2 Obligations (per asset per trading day)
Two-sided quotes with half-spread ≤ `PARAM.mkt_mm_spread_mult (2) × s` and size ≥ `PARAM.mkt_mm_min_qty_adv (0.02)` ADV per side, present in ≥ `PARAM.mkt_mm_presence (80%)` of continuous ticks (50% while F > 60). `mkt.mm.quote` replaces both sides atomically as one message.

#### §3.19.3 Benefits and sanctions
Maker fee `PARAM.mkt_mm_rebate (−0.5 bp)` (a rebate, `MKT_MAKER_REBATE`) on quote fills; message-fee exemption (§3.15.1). Missing presence on ≥ 2 days in a week suspends the rebate for the next week; 3 consecutive suspended weeks revoke registration (re-application after 28 game days).

#### §3.19.4 Crowding of the NPC maker
Where registered makers display depth within `2s` of `lnRef`, the NPC maker's depth on those levels is multiplied by `mmCrowding = max(0.5, 1 − 0.5 × mmDepth / makerDepth)`. Players who make markets therefore earn real spread from NPC pools and other players, but the NPC maker never fully leaves, so a market maker that pulls its quotes in a crash cannot break the market.

### §3.20 Block crosses (adopts ROADMAP N11)

`mkt.block.cross` lets two parties agree a block: both submit matching intents (same `crossId`, asset, quantity, opposite sides) before `t = 535`. Minimum size: the larger of 0.25 × ADV and $1M notional. The cross executes in 6c of the closing tick at the **official closing price**, outside the auction (no impact, no tally), with holds checked at 6c (a side that fails buying power fails the cross, `FAILED`). The print is **deferred**: published on the tape with `block = true, deferred = true` at the next day's opening tick (24-hour assets: 180 ticks later). Fee: half the taker rate. Posting `MKT_BLOCK_TRADE`. Linked parties are allowed and monitored (F14).

### §3.21 Instrument lifecycle and corporate actions
- **Listing** (06/09 IPO): an asset becomes tradeable with an opening (IPO) auction whose reference is the offer price; the band for the IPO auction is ±50%.
- **Splits and consolidations** (06): at P2 of the effective tick, all resting order prices and quantities, stop prices, trailing peaks, pool positions, ADV and price history are adjusted by the ratio; fractional lots are rounded down and the remainder cancelled.
- **Dividends**: on the ex-date open, `lnV`, `lnF` and `lnB` drop by `ln(1 − d/P)`; resting buy limits are not adjusted (`DEFAULT`, as most real venues), GTC sell stops are not adjusted.
- **Delisting, suspension, bankruptcy** (09): state SUSPENDED; all orders cancelled with `ASSET_SUSPENDED`; positions remain and are marked by 03's rules.
- **Index changes** (§3.22): announced 5 trading days before the effective day; MANDATE pool trades in the effective day's closing auction.

### §3.22 Indices
05 computes, every tick, the index levels used across the game: `GX100` (world, free-float cap weighted, 100 constituents), one main index per bloc (`<BLOC>50`, used by circuit breakers), sector indices, a world government bond index per bloc, an IG and HY credit index (yield spread), the crypto index `CX10`, and the **bond market depth index** per bloc that 04 reads (QE "market dysfunction", 04 §3.8.5): the current average maker depth multiplier over the bloc's government lines divided by its 364-day mean. Index rules (weights, caps 10% per constituent, quarterly review) are owned here; names are content for 22. ETFs (08) track these indices.

### §3.23 Performance and determinism budget
400 instruments × one auction per tick must fit 19's MARKET partition budget: target ≤ 0.5 ms per asset per tick at p99 with 200 resting orders, ≤ 40 ms for all of P6 (6a+6b). The ladder is evaluated analytically (no ladder orders are materialized); candidates are bounded by the band. All math uses `dmath`; every RNG draw is keyed by (stream, tick), so replay reproduces every price (02).

---

## §4 Player intents

All intents use the 00 §5.5 envelope, are validated in P1 (§3.8) and count toward the 20-per-tick limit. AI agents (11) and operators under a mandate use the same intents.

### §4.1 Intent list

| Intent | Payload | Notes |
|---|---|---|
| `mkt.order.place` | `{ accountId, assetId, side, type, qty, limitPrice?, stopPrice?, trail?, tif, gtdTick?, displayQty?, triggerRef?, flags?, ocoGroupId?, bracket?: { takeProfit: Price, stopLoss: Price }, clientTag? }` | §3.6; returns `orderId` |
| `mkt.order.modify` | `{ orderId, qty?, limitPrice?, stopPrice?, displayQty?, trail? }` | priority rules §3.6.7 |
| `mkt.order.cancel` | `{ orderId }` | |
| `mkt.order.cancelAll` | `{ assetId?, accountId? }` | counts as one intent |
| `mkt.order.placeMulti` | `{ accountId, underlyingId, legs: { assetId, side, qty }[2..4], netLimit: Price, tif: 'IOC' \| 'DAY' }` | package vs 06's NPC options maker (§3.6.9) |
| `mkt.algo.start` | `{ accountId, assetId, side, kind, qty, startTick, endTick, limitPrice?, params }` | LIC2; §3.7 |
| `mkt.algo.modify` / `pause` / `resume` / `cancel` | `{ algoId, … }` | |
| `mkt.mm.register` | `{ entityId, assets: string[] }` | LIC4 + charter; §3.19 |
| `mkt.mm.quote` | `{ assetId, bid: { price, qty }, ask: { price, qty } }` | replaces both sides atomically |
| `mkt.mm.resign` | `{ entityId, assets?: string[] }` | effective next open |
| `mkt.block.cross` | `{ crossId?, accountId, counterpartyEntityId, assetId, side, qty }` | §3.20; a crossId is generated for the first side and shared out of band |
| `mkt.block.cancel` | `{ crossId }` | before `t = 535` |

Read-only queries (no state change, not intents, rate-limited by 19): `mkt.preview`, `risk.report`, `explainMove`, `mkt.algo.schedulePreview`.

### §4.2 Rejection codes
`BAD_SCHEMA`, `BAD_PRICE_GRID`, `BAD_LOT`, `RATE_LIMIT`, `TOO_MANY_ORDERS`, `NO_LICENSE`, `HELD`, `SESSION_CLOSED_FOR_TYPE`, `HALTED_IOC`, `CAPITAL_CONTROLS`, `ONBOARDING_CAP`, `POSITION_CAP`, `SHORT_CAP`, `OI_CAP`, `NO_LOCATE`, `INSUFFICIENT_BP`, `POST_ONLY_WOULD_CROSS`, `REDUCE_ONLY_NO_POSITION`, `MOC_CUTOFF`, `ASSET_SUSPENDED`, `NOT_MM`, `BLOCK_TOO_SMALL`, `FX_LEG_FAILED`, `ORDER_NOT_FOUND`. Cancellation reasons: `USER`, `EXPIRED`, `STP`, `FOK_UNFILLED`, `PROTECTION_EXPIRED`, `OCO`, `ASSET_SUSPENDED`, `CORPORATE_ACTION`, `HELD_FORCED` (13).

---

## §5 Engine events

| Event | Audience | When |
|---|---|---|
| `mkt.order.accepted` / `rejected` / `cancelled` / `expired` / `modified` | owner | P1, P6, P8 |
| `mkt.order.triggered` | owner | 6.0 |
| `mkt.fill` (`Fill`) | owner (each side) | P7 |
| `mkt.algo.progress` / `status` | owner | each tick while working |
| `mkt.auction.result` (`AuctionResult`) | public | P14 |
| `mkt.indicative` | public | auction windows |
| `mkt.state.changed` (`tradingState`, until) | public | on change |
| `mkt.mwcb.triggered` (bloc, level) | public; 04 crisis labelling | on trigger |
| `mkt.daily.close` (official close, settle, fix, stats) | public; 03, 06, 07, 08, 04 | at the daily close |
| `mkt.cause.hourly` / `daily` (`CauseVector`) | per tier (§3.12) | P14 |
| `mkt.adv.updated` | public | P8, hourly when triggered |
| `mkt.shortInterest.daily` | public | P8 |
| `mkt.ownership.thresholdCrossed` | 15 (filing), 09 | P7 |
| `mkt.surveillance.daily` (`SurveillanceFeatures`) | sealed to 13 | P8 |
| `mkt.mm.status` | owner | daily, on change |
| `mkt.block.done` / `failed`; `mkt.block.print` (deferred) | parties; public | 6c; next open |
| `mkt.index.level` | public | every tick |
| `mkt.bondDepthIndex` | 04 | P8 |

---

## §6 NPC behaviour

### §6.1 The NPC market maker
Specified in §3.4. One per asset; follows value through `lnB`, quotes the square-root ladder, skews by inventory, lays off 12% a day, widens and thins with fear and crises, and is crowded out up to half by registered player makers. It never reads private orders, stops or algo parents.

### §6.2 Trader pools
Each pool is a stylized population of NPC traders with a **target position** `pos*` (ADV units) per asset and an order per tick `o = clamp(speed × (pos* − pos), ±rate / ticksPerDay)` sent as an IOC limit at `lnRef_{N−1} ± (s + allowance)`, where `allowance = 2s` unless stated. Every pool reads **only state published at the end of tick N−1** (and lnV, which is public at Research tier). Pool positions decay toward zero off-book with half-life `PARAM.mkt_pool_pos_hl_days (10)` game days (the pool's investors are replaced by background holders), which keeps pools from accumulating unbounded inventory. `poolWeights` in `MarketSpec` scales each pool per asset (class defaults below). Pool sizes scale with ADV, so markets of every size behave alike.

| Pool | Signal and target | Rate cap (ADV/day) | Classes (default weight) |
|---|---|---|---|
| VALUE | `pos* = −capV × tanh(G / g0)`, `g0 = PARAM.mkt_value_g0 (1.0) × σ_d × √5`; soft capacity: orders × `1 / (1 + 3 |pos|)` | `PARAM.mkt_value_rate (0.9)` | all with a value layer (1.0); crypto 0.5, meme 0.2 |
| TREND | time-series momentum `m = ln(P_{d−5} / P_{d−63}) / (σ_d √58)`; `pos* = tanh(m)`; capacity `PARAM.mkt_trend_capacity (1)`: orders × `1 / (1 + |pos| / capacity)` | 0.3 | equities, futures, FX, crypto (1.0) |
| RETAIL | noise `N(0, 1)` per hour + 0.5 × `tanh(r_1d / σ_d)` (chasing) + attention (16 newsworthiness) + 0.3 × dip-buying in EXPANSION; × (1 + 2 × \|b\| / 0.1) when belief is active | 0.15 | equities, ETFs, crypto (1.0), meme (3.0) |
| PENSION | last 3 trading days of each quarter: rebalance toward fixed equity/bond weights after the quarter's relative performance, `pos* = −tanh((w_eq − w_target) / 0.05)`; 60% in closing auctions | 0.3 | index members, government bonds |
| CARRY | FX and rates: `pos* = tanh((i_X − i_FDL) / σ_X / 0.5) × max(0, RA)` with RA = 04 risk appetite; when RA turns negative the target collapses and the pool unwinds (carry crashes emerge) | 0.2 | FX, short-dated bonds |
| HEDGER | commodity producers sell after price rises: `pos* = −0.3 × tanh(ln(P / P̄_252) / 0.2)`; corporate FX hedgers trade 04's current-account flow as steady daily demand | 0.15 | commodities, energy, FX |
| ARB | ETF vs iNAV (08 creation and redemption at day close completes the trade), futures basis vs 06 fair basis, index vs constituents, crypto cross-venue; trades when `|mispricing| > costs + 2s`, both legs in the same tick | 0.5 | ETFs, futures, crypto |
| RATES_RV | bond lines rich or cheap to 04's fitted curve, `pos* = −tanh(gap / 3 bp)` | 0.4 | government bonds |
| MANDATE | scheduled flows: index additions and deletions (closing auction of the effective day), 04's IG exclusion rule (sell 25% of NPC holdings over 10 trading days, 04 §3.11), fallen angels (08 downgrades below BBB−), CB reserve-manager quarterly rebalancing (04 §6.4) | as scheduled | as scheduled |
| OPT_HEDGE | delta hedging of 06's NPC options dealers: order = `−Γ_dealer × ΔlnP_{N−1}` where `Γ_dealer` is 06's `dealerNetGamma(underlying)` (shares per unit log move); short gamma amplifies moves, long gamma dampens and pins near expiry | 0.5 | underlyings with listed options |
| DEGEN | leveraged crypto and meme traders: `pos* = (1 + 2H) × tanh(r_1h / σ_h)`; liquidations from 07 and 06 perps flow through LIQUIDATION | 0.4 | crypto alts, meme, perps |
| CB | 04's `NpcPoolOrder` for `CB:<bloc>` (QE/QT, YCC, FX intervention, swap-line actions) passed through unchanged | per 04 | per 04 |
| TSY | 04's treasury orders (buybacks are 04's own reverse auctions; TSY pool covers secondary operations 04 permits) | per 04 | per 04 |
| LIQUIDATION | 07's forced orders (margin calls, CCP default management) and 08's forced fund sales, as market orders with protection (§3.6.6), sized by their owners | per owner | all |

Calibration targets (20 runs them as stylized-fact checks): post-news drift of 20–50% of the eventual move after the first hour; daily return autocorrelation at lag 1 within [−0.1, +0.1]; absolute-return autocorrelation positive out to 20 days (GARCH); fat tails (excess kurtosis of daily returns 3–10 for equities); 63-day momentum Sharpe for a simple player strategy 0.2–0.6 before costs and decaying as player capital in it grows (20 B05 capital-ramp test); quarter-end effect visible but < 0.5σ_d.

### §6.3 Belief model (claims, rumors and the market's beliefs; 12 M1 and 16 cite this section)

A **claim** is any statement about an asset that is not yet a verified fact: a player Wire post with a structured claim (15), a player short report, a rumor (16 `Rumor`), an outlet's precursor (`telegraph`) item, an NPC analyst note, a company rebuttal. 05 reads the structured claim, never the text: `Claim { claimId, assetId, direction, kind, assertedMove, evidenceRefs[], authorId, sourceId, reach, publishTick, resolvesByTick? }` (interface assumed from 15 and 16).

**Asserted move** `a_c`: from the claim kind's table in 22 (for example "accounting irregularity" −0.25, "product delay" −0.08, "takeover interest" +0.15), or, for claims about an engine-verifiable fact, the size the owner module would give that fact if true.

**Credibility** `cr_c ∈ [0, 1]`:
```
cr_c = clamp( 0.15 + 0.45 × srcRecord + 0.25 × evidence + 0.15 × prestigeReach − 0.30 × rebuttal, 0, 1 )
```
- `srcRecord`: the source's public track record, Beta(2, 2) prior on `hits / resolved` (16 `RumorSource`; for players, their history of claims resolved true or false). NPCs never see a source's hidden accuracy, only its record (16 knowledge firewall).
- `evidence`: share of `evidenceRefs` that point to verifiable engine records (filings, court records, on-chain data, published statistics), 0..1.
- `prestigeReach`: the author's reach from 14 (prestige, followers), normalized 0..1.
- `rebuttal`: 1 if the target published a verifiable rebuttal (12 M4), 0.5 for an unverifiable denial, else 0.

**Belief overlay**:
```
b_c(t) = a_c × cr_c × reach_c × (1 − e^{−(t − t0) / τ_spread}) × decay(t),   τ_spread = PARAM.mkt_belief_spread_ticks (30)
b      = clamp( Σ_c b_c, −PARAM.mkt_belief_cap (0.5), +0.5 )
```
`decay` halves every `PARAM.mkt_belief_hl_days (5)` trading days while unresolved. `b` enters `lnRef` directly (§3.4.1). The VALUE pool trades against it (it still sees `lnV`, which a claim does not change), within its capacity, so **skeptics push back and the drop is never fixed**: a credible, well-evidenced claim with wide reach moves the price a lot and value traders run out of capacity; a weak claim fades quickly. RETAIL and DEGEN amplify active beliefs (§6.2).

**Resolution.** When 16 resolves a rumor or the engine reveals the fact:
- **True**: the owner module delivers the real value shock `X` to `lnV` (§3.3.4), and `b_c` is released over `PARAM.mkt_belief_handoff_ticks (15)`; no double count, because the gap tracer hands the move from BELIEF to the fact's source.
- **False**: `b_c` releases with half-life 60 ticks (the price recovers); the source's record updates; 12 flags the author if the claim was knowingly false (S5) and F15 scores the overlap with positions (§3.16).
16's precursors (`telegraph`) use the same model with `cr_c` = the template's `baseCredibility`, so attentive players and NPCs see the same early signal (16 §3.6.5).

### §6.4 World hooks implemented by 05 (04 §3.16.6)
- `makerWithdrawal(assetFilter, depthMult, ticks)`: multiplies `m_depth,event` for matching assets.
- `npcSellProgram(assetFilter, advPerTick, ticks)`: adds a LIQUIDATION-like NPC sell flow of `advPerTick` ADV per tick for matching assets (FLASH_CRASH: 3% ADV per tick on GX constituents for 20 ticks).
- `volShock(assetFilter, mult, halfLifeDays)` and `jumpIntensityShock(assetFilter, mult, days)`: multiply `m_event` and the jump intensity (used by 04's crisis catalog where it states price effects).
Asset filters: `{ class?, bloc?, sector?, factor?, assetIds? }`. Each call carries the WorldEvent id for causal chains and cause-vector `EVENT` tags.

---

## §7 Screens (17 owns the layouts)

| Screen | What 05 supplies |
|---|---|
| BRK-01 Simple broker | last, change, chart data, simple ticket with preview, first-trade cap note (18) |
| BRK-02 Pro terminal | `book` depth (10 levels at Terminal tier), `tape`, indicative auctions, trading state, full order types, OCO and brackets, preview |
| BRK-04 Execution algos | algo schedule preview, live progress, analytics |
| MKT-01 Directory and screener | daily stats, ADV, rv21, short interest |
| MKT-02 Calendars | index rebalances, auction times, halts schedule |
| MKT-07 System | circuit-breaker events, bond depth index, aggregate maker depth |
| MKT-11 Funds and ETFs | ETF price vs iNAV |
| RSK-01 to RSK-04 | `risk.report` |
| RD-02 Dossier, PF-04 Journal | `explainMove` cause vectors, priced-in bands, own contribution |
| SH-08 World-event layer | index moves since an event began (past only) |

The phase banner ("Queued for the opening auction at 08:00") reads §3.2 states. Halts show "Trading paused · reopens at hh:mm" with the reopen auction's indicative price.

---

## §8 Edge cases

1. **No crossing interest and the maker at band edge**: no trade; last price unchanged; indicative published.
2. **Band clamps for three ticks then reverses**: the streak resets on the first unclamped tick; no interruption.
3. **Halt and market-wide halt overlap**: the longer end tick wins; one REOPEN auction.
4. **L3 market-wide halt before the close**: no closing auction; official close = last price; MOC orders expire unfilled; 08 strikes NAV on that close.
5. **Weekend news**: `lnV` moves on the weekend tick; crypto trades it immediately; equities gap at Monday's open via openPrint and pools' opening orders.
6. **Stop triggered by a band-clamped print**: triggers on that LAST; the stop joins the next tick as a market order with protection.
7. **Iceberg reserve plus STP**: the decrement applies to displayed then hidden quantity of both orders.
8. **FOK larger than all available interest**: removed in pass 2; no partial.
9. **Order modify in the same tick as a fill**: P1 modifications precede the auction, so the modified order is what matches.
10. **Corporate action on a tick with resting GTC orders**: adjusted in P2 (§3.21); orders below one lot are cancelled with `CORPORATE_ACTION`.
11. **Asset suspended with algos working**: algos cancel; holds release.
12. **Capital controls imposed while an autoFx order works**: the next FX leg fails; the asset leg cancels with `FX_LEG_FAILED`.
13. **Held imposed mid-day** (13): all non-reducing orders cancel with `HELD_FORCED`; existing algos stop.
14. **Liquidation into a halted book**: 07 queues; the liquidation joins the reopen auction as `auctionOnly` market orders.
15. **Maker inventory beyond cap in a one-way crash**: depth on the buying side drops to 0.2; the price falls faster; bands and halts bound the speed; the layoff at close resets 12%.
16. **Two whales on opposite sides in the same tick**: they match each other first (players before the maker at equal price); the tally sees only the net residual taken from the maker, so neither pays impact on the matched part.
17. **Price grid collapse at very low prices**: `minPrice` floor; below it sells rest unfilled; the asset is flagged for 09 (penny-stock or delisting rules).
18. **Zero ADV at listing**: ADV uses 22's genesis turnover until 5 trading days of model inputs exist.
19. **Factor loadings that sum to more than 1 after a crisis correlation add**: capped at 1; idio share 0.
20. **Daily close tick coincides with a vol interruption**: the interruption ends early and the closing auction runs (the close always happens unless L3 stopped trading).
21. **Block cross price when no closing auction prints**: uses the official close rule (§3.10.2).
22. **A claim about an asset that is halted**: belief accumulates; it is visible at the reopen auction.
23. **Registered maker quotes inside the NPC spread with tiny size**: allowed; obligations measure size ≥ 0.02 ADV, so tiny quotes do not count for presence.
24. **Cross-currency order when one FX book is in VOL_INTERRUPTION**: the cross order waits in 6a; if not filled within its TIF it expires.
25. **Year end and chapter end** (02): no special market behaviour; GTC orders persist across chapter boundaries unless 21's reset rules cancel them.
26. **Determinism under replay with partitions** (19): a replay of the MARKET partition from a snapshot reproduces every `p*`, fill and cause vector bit for bit.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Splitting a large order into many small ones or across alts to avoid impact | shared daily tally (§3.4.3): permanent impact depends on net daily flow only; STP and owner groups catch alts |
| 2 | Wash trading to inflate volume, ADV or fee tiers | STP by owner group; ADV is model-based (§3.14.1); tiers count only real fills and exclude self-linked flags; F3 scoring |
| 3 | Pump the price then sell to the maker at the top | the maker's base follows value, not flow; permanent impact is symmetric so selling gives back the move; F5 and F6 score it |
| 4 | Spoofing the depth to bait NPC pools | pools read N−1 public state but not order identity; spoof orders that stay one tick can fill (batch auction); F1 and F2 scoring; message fee |
| 5 | Front-running large NPC flows (MANDATE, PENSION) | they are public and scheduled by design (emergent, legal); capacity and impact limit profits |
| 6 | Latency races | none possible: one sealed batch per tick |
| 7 | Squeezing a thin stock | position caps 25% / 49%, short-interest cap, borrow recall rules (07), F11, 13 antitrust |
| 8 | Marking the close to move NAVs or margin | closing band, auction depth ×3, 03 thin-print guard, F4 and F7 |
| 9 | Exploiting known value gaps without risk | VALUE pool and players compete for the same gap; gap capacity is finite; lnV is public only at the Research tier, hourly, rounded |
| 10 | Knowing news one tick early (Terminal tier) | it is a paid, documented edge (16 §3.6.6); newsPrint moves part of the price in the same tick as publication |
| 11 | Using stop clusters to engineer cascades | stops are private; no one sees them; F10 scoring for repeated patterns |
| 12 | Market makers pulling quotes to cause crashes | the NPC maker remains (crowding floor 0.5); obligations and revocation |
| 13 | Block crosses to move value between linked groups | price fixed at the official close; F13 and F14 |
| 14 | Self-dealing via player-owned exchange concession | fees always go to the NPC exchange; concession profit is 03/10's rule, not per-trade |
| 15 | False claims to profit from belief moves | belief resolves; false claims revert; F15 scoring; disgorgement on conviction (13) |
| 16 | Insider trading via employees or stolen data | F8 with access graph from 15 and 12 flags |
| 17 | Using AI agents to bypass rate limits | AI and operators share the character's 20-intent limit (00) |
| 18 | Spamming orders to slow the engine | 200 open orders per actor, 20 per asset, message fee, 19 rate limits |
| 19 | Gaming POV algos with background volume | POV reads matched volume only (§3.14.2) |
| 20 | Triggering a market-wide halt to force a CB emergency cut | 04's emergency triggers need broad multi-day stress; L1/L2 are rare with world-scale depth; F5 scoring |
| 21 | Arbitraging cross rates | crosses are products of FDL pairs (§3.4.7) |
| 22 | Repeatedly toggling a resting order to keep priority while changing price | any price change resets priority |

---

## §10 Acceptance tests

1. All fills of one asset in one tick have the same price (INV-MKT-001).
2. For random books (10,000 cases) the chosen price maximizes executed volume, respects all limits and is invariant under permutation of order submission within the tick.
3. Tie-breaks follow volume, then imbalance, then distance to ref, then the lower price.
4. Allocation: price, time, displayed-before-hidden, players-before-maker, pro rata with deterministic remainders.
5. No fill has the same owner group on both sides (INV-MKT-002); STP decrements both.
6. FOK orders fill completely or not at all; at most 3 passes.
7. Halted assets produce no fills (INV-MKT-004).
8. A single market buy of q ADV moves the clearing price by `s + Y σ_d √(q/D)` within one price tick.
9. Splitting a 1-ADV buy into 100 slices over a day yields the same end-of-day permanent impact `φ Y σ_d √1` as one block (±1%).
10. Transient impact halves in 15 ticks.
11. Two equal opposing whale orders in one tick produce zero maker fill and zero tally change.
12. Maker inventory cap reduces same-side depth to 0.2 beyond the cap; layoff reduces inventory 12% at close.
13. Over 260 simulated days with no players, realized daily price vol / `sigmaV` ∈ [0.9, 1.1] for large caps in EXPANSION.
14. GARCH h stays within [0.25, 9] and its mean over 10,000 days is 1 ± 0.05.
15. Factor-model covariance matrix is positive definite for the 400 launch assets.
16. Crisis correlation: average pairwise equity correlation rises by ≥ 0.2 during a MAJOR's CONTAGION phase.
17. News printed 50% at publish and the remainder within 2 trading days on average (post-news drift).
18. Cause vector terms sum to the period's log move exactly (≤ 1e−12).
19. `explainMove` over a week equals the sum of the daily vectors.
20. A news item fully priced reaches the Done band; an unpriced one shows Early.
21. FLOW_PLAYERS is merged when fewer than 5 player owner groups traded.
22. Per-tick band clamps the price; three consecutive clamps trigger a 12-tick interruption ending in a reopen auction.
23. ±15% and ±30% single-stock halts last 120 and 240 ticks and trigger once each per day.
24. Market-wide −7% and −13% halts each last 120 ticks, do not trigger at or after t = 470; −20% ends the session at any time.
25. Futures locked at ±10% for 10 ticks widen to ±15% after 20 ticks.
26. Crypto and FX never halt but are banded.
27. Unfilled market orders persist at most 6 ticks then cancel with PROTECTION_EXPIRED.
28. Stops trigger on N−1 LAST or MARK and never during halts.
29. OCO: first fill cancels the siblings next tick; brackets activate on entry fill.
30. Iceberg display below max(1 lot, 5%) is rejected.
31. Raising quantity or changing price resets priority; lowering quantity does not.
32. Orders above 3 ADV become POV 10% parents.
33. TWAP, VWAP, POV and IS children follow their schedules within one lot per tick when liquidity allows.
34. GTC orders expire after 91 game days.
35. Position cap rejects a buy that would take a group above 25% of an NPC company's float, and 49% for a player company.
36. Short sales are rejected at 50% short interest.
37. Capital controls level 2 rejects sales of the controlled currency except reduce-only FX derivative closes.
38. The first-trade cap from 18 is enforced on buys only.
39. Fees match the table and tiers; L4 applies only to the ≥ $1B tier.
40. Message fee charges only messages beyond an order-to-trade ratio of 100.
41. ADV is unchanged by any amount of wash trading.
42. Background volume makes total daily volume average ADV ± 10% over 63 days.
43. Surveillance score follows `min(100, 0.8 × prev + points)`; a scripted spoofing bot reaches ≥ 60 within 3 game days.
44. A scripted insider (trades 2 days before an earnings surprise with access) earns ≥ 25 points per episode.
45. Registered MM missing presence twice in a week loses its rebate the next week.
46. NPC maker depth never falls below half its uncrowded value due to MM crowding.
47. Block crosses execute at the official close with no tally change and print deferred at the next open.
48. A credible, evidenced false claim moves the price then reverts with a 60-tick half-life after resolution.
49. A true claim hands off from BELIEF to the fact's source in the cause vector with no double count.
50. Cross FX orders always price at the product of the two FDL legs.
51. Replay of 1,000 ticks from a snapshot reproduces every price and fill bit for bit.
52. P6 for 400 assets with 200 resting orders each completes in ≤ 40 ms p99 on the reference server.
53. Tape prints contain no account, owner or order identifiers (L11 schema test).
54. Bond depth index published daily per bloc; QE dysfunction rule in 04 reads it.

---

## Resolved old open questions
- **R03** (trading hours, weekends, holidays): §3.2.1, weekends closed for session classes, no holidays at launch. `DEFAULT (Mathis may override)`.
- **R04** (how players move prices without free money): one impact law on the maker ladder plus the shared daily tally (§3.4).
- **T10** (circuit breakers): §3.9.
- **N3** (registered market making for players): §3.19.
- **N11** (block trades at the close): §3.20, adopted.
- **C6** (hiding whales vs transparency): no auto-leak (L11), aggregate prints, k-anonymity in attributions, filings by 15 only (§3.11, §3.12.4).
