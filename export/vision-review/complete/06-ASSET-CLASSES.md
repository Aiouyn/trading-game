# 06 — Asset Classes

Owner module: 06. Status: complete specification, 2026-10-18.
Depends on: 02 (clock, RNG streams, tick pipeline), 03 (ledger, reason codes, lots and taxes), 04 (curves, CPI, FX regimes, sovereign credit), 05 (batch auction, NPC liquidity, impact, the per-tick price model), 07 (margin, collateral, securities lending, CCP), 08 (ETF creation and redemption, ratings, tranches), 09 (company financials and corporate decisions), 11 (compute and data demand), 12 (attacks on wallets and bridges), 13 (sanctions), 14 (licenses, lifestyle catalog), 15 (filings, contracts), 16 (news, NPC actors), 22 (names).

Everything is fictional (L6). Nothing here is advice; nothing is gambling (L5): no binary options, no event contracts, no prediction markets (L10).

---

## §1 Purpose

This module defines **every tradeable thing in the world** and the rules that are specific to its asset class: what an instrument is (fields), what it is worth (its fundamental value, which 05's price model pulls toward), how it pays (dividends, coupons, funding, settlement), how it is created and destroyed (listing, series generation, issuance, expiry, default, delisting), who may trade it (licenses), how it is marked for net worth, and every class-specific event (earnings, splits, credit events, depegs, auctions).

Division of labour, binding:
- **05** owns *how* prices move tick to tick (the return equation, GARCH, jumps, factor model, batch auction, NPC market makers, square-root impact, halts). 06 owns *what* each asset's fundamental value `V_i` is, its class parameters (`PriceParams`, §3.21), and everything that is not the generic order book: OTC and RFQ fills (P6), DeFi venues, primary auctions, collectible auctions, option exercise, futures settlement, perp funding, coupons and corporate actions.
- **07** owns margin, collateral haircuts, securities lending, repo and the Clearing House. 06 tags each instrument with its `marginClass`, `collateralClass` and `clearing` service.
- **08** owns ETF creation and redemption, rating agencies, securitization tranches and fund units. 06 defines ETF and index instruments and their NAV.
- **09** owns company decisions (dividend amount, buybacks, issuance, M&A, bankruptcy, IPOs). 06 executes the security-level consequences.

Design laws (from 01 §0 and V3 T1–T3, kept):
1. Every price has a cause a player could have seen or inferred. Each class's `V_i` is a function of world state, never a random walk.
2. Parities hold by construction where they hold in reality (forward = CIP, put-call parity via NPC arbitrage, ETF ≈ NAV, cross FX from legs). Residual arbitrage after fees is ≤ fees.
3. Each class differs where the difference creates a decision (MASTER-BIBLE T02): fundamentals, sentiment, liquidity, financing, sessions and liquidation rules.
4. Defaults, depegs and failures are **mechanical outcomes of balance sheets**, never dice rolls with a fixed probability.

**Status of numbers:** every `PARAM.*` value in this module, and every choice tagged `DEFAULT`, is `DEFAULT (Mathis may override)`. Locked decisions L1–L15 (00) and the 00 time model are not defaults. The full list is in `_notes/06-notes.md`.

---

## §2 Entities

### §2.1 Shared types

```ts
type AssetId = string;            // 'ast_<CLS>_<CODE>' authored, or deterministic series ids (§3.1.3)
type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
type License = 'LIC0' | 'LIC1' | 'LIC2' | 'LIC3' | 'LIC4';
type AssetClass =
  | 'EQUITY' | 'ETF' | 'INDEX' | 'GOVT_BOND' | 'CORP_BOND' | 'FX_SPOT' | 'COMMODITY'
  | 'CRYPTO' | 'LP_TOKEN' | 'OPTION' | 'FUTURE' | 'PERP' | 'SWAP' | 'CDS'
  | 'COLLECTIBLE' | 'FUND_UNIT' | 'TRANCHE' | 'CLAIM';
type SessionProfile = 'EQUITY' | 'FX' | 'CRYPTO' | 'FUT24' | 'OTC' | 'AUCTION' | 'DISTRESSED' | 'NONE';
type VenueId = string;            // 'exc_FDL'…'exc_SRL', 'ven_VAULTX' (crypto CEX), 'ven_RFQ',
                                  // 'ven_AMM_<poolId>', 'ven_LEND_<marketId>', 'ven_AUCTION_HV', 'ven_DISTRESSED', 'ven_PRIMARY'
type ClearingService = 'CCP_LD' | 'CCP_OTC' | 'CCP_CDS' | 'CCP_CRY' | 'CCP_REPO' | 'BILATERAL' | 'NONE';
type AssetStatus = 'PENDING' | 'LISTED' | 'HALTED' | 'SUSPENDED' | 'DISTRESSED' | 'DELISTING'
                 | 'DELISTED' | 'EXPIRED' | 'MATURED' | 'DEFAULTED';

interface Asset {
  id: AssetId;
  cls: AssetClass;
  symbol: string;                 // display ticker, unique among LISTED assets
  nameKey: string;                // localization key (L8)
  ccy: Ccy;                       // quote and settlement currency
  blocId: Ccy | null;             // home bloc (bloc ids reuse currency codes), null for global/crypto
  venue: VenueId;
  session: SessionProfile;        // §3.3
  lotSize: bigint;                // base units per lot
  qtyDecimals: number;
  tickSize: bigint;               // Price units
  displayDecimals: number;
  licenseLong: License;           // to buy / hold long
  licenseShort: License | null;   // to sell short or write; null = not shortable
  marginClass: string;            // → 07 §3.15 (e.g. 'SPOT_EQ', 'FUT_IDX', 'PERP_CRY', 'OPT_EQ')
  collateralClass: string | null; // → 07 §3.15.6 haircut table, null = not eligible
  clearing: ClearingService;
  priceParams: PriceParams;       // §3.21, consumed by 05
  status: AssetStatus;
  listedTick: number;
  delistedTick: number | null;
  createdBy: 'AUTHORED' | 'ENGINE_SERIES' | 'ISSUANCE' | 'NPC_SPAWN' | 'PLAYER';
  tags: string[];                 // sector, theme, index memberships (derived, cached)
}

interface PriceParams {           // defaults by class in §3.21; 05 owns the math that uses them
  kappaHalfLifeGameDays: number;  // pull of P toward V
  sigmaAnnual: number;            // base idiosyncratic vol (game year)
  garchAlpha: number; garchBeta: number;
  studentNu: number;              // tail parameter of ε
  jumpLambdaPerYear: number; jumpDownMean: number; jumpUpMean: number;
  factorLoadings: Record<string, number>; // factor ids owned by 05
  baseSpreadBps: number; depthFrac: number;
}

interface Position {              // the asset-side view of a 03 asset account
  ownerId: string; assetId: AssetId;
  qty: bigint;                    // signed; negative = short or written
  lots: Lot[];                    // FIFO by default (03 §taxes may choose another method)
  custodianId: string;            // 'ccp_TCH' for exchange custody, a bank, a wallet id, or the owner (self-custody)
  pledgedQty: bigint;             // encumbered under 07 pledges, repo or margin
  lentQty: bigint;                // out on securities loan (07 §3.13)
  openedTick: number;
}
interface Lot { lotId: string; qty: bigint; costPrice: bigint; acquiredTick: number; }
```

### §2.2 Equities, indices, ETFs

```ts
interface EquityAsset extends Asset {
  cls: 'EQUITY';
  issuerId: string;               // cmp_… (09)
  sectorId: SectorId;             // 12 sectors, §3.4.1
  sharesOutstanding: bigint;
  freeFloatShares: bigint;        // excludes holders ≥ 5%, founders in lockup, treasury shares
  isPlayerCompany: boolean;       // listed via 09 IPO
  earnings: { nextReportTick: number; reportSlot: 'PRE' | 'POST'; consensusEps: bigint | null; lastEps: bigint | null };
  corporateActions: CorporateActionId[];
  shortOpenTick: number;          // player IPOs: listing + 3 game days (ROADMAP 2.1)
}
type SectorId = 'TECH' | 'SEMI' | 'ENERGY' | 'MATERIALS' | 'INDUSTRIALS' | 'FINANCIALS'
              | 'HEALTH' | 'STAPLES' | 'DISCRETIONARY' | 'REAL_ESTATE' | 'MEDIA' | 'SECURITY';

interface CorporateAction {
  id: string; assetId: AssetId;
  kind: 'CASH_DIVIDEND' | 'STOCK_DIVIDEND' | 'SPLIT' | 'REVERSE_SPLIT' | 'RIGHTS' | 'SPINOFF'
      | 'MERGER_CASH' | 'MERGER_STOCK' | 'MERGER_MIXED' | 'TENDER' | 'BUYBACK_PROGRAM'
      | 'SECONDARY_OFFERING' | 'DELIST' | 'BANKRUPTCY' | 'NAME_CHANGE';
  announceTick: number; exTick: number | null; recordTick: number | null; payTick: number | null;
  terms: {
    cashPerShare?: bigint; ratioNum?: number; ratioDen?: number;   // split 5:1 → num 5, den 1
    newAssetId?: AssetId; stockPerShare?: number; offerPrice?: bigint; maxShares?: bigint;
  };
  status: 'ANNOUNCED' | 'EFFECTIVE' | 'COMPLETED' | 'CANCELLED';
}

interface IndexDef {
  id: AssetId;                    // cls 'INDEX' (not tradeable itself)
  method: 'FFMC_CAPPED' | 'EQUAL' | 'PRICE_WEIGHTED' | 'RULE_BOND' | 'RULE_COMMODITY' | 'RULE_CRYPTO' | 'VOL';
  universeRule: string;           // §3.5 table
  capWeight: number;              // e.g. 0.10
  rebalance: 'QUARTERLY' | 'SEMIANNUAL' | 'MONTHLY';
  constituents: { assetId: AssetId; units: number }[]; // index units per constituent (weights implied)
  divisor: number;
  level: number;                  // recomputed each tick
  returnType: 'PRICE' | 'TOTAL';
}

interface EtfAsset extends Asset {
  cls: 'ETF';
  sponsorId: string;              // fnd_… (08)
  trackedIndexId: AssetId | null;
  basket: { assetId: AssetId; qtyPerCreationUnit: bigint }[];
  cashPerCreationUnit: bigint;
  creationUnitShares: bigint;     // 50,000 default
  unitsOutstanding: bigint;
  expenseRatioBps: number;
  nav: bigint; inav: bigint;      // per share, recomputed each tick (§3.6)
}
```

### §2.3 Bonds and the credit model

```ts
interface BondAsset extends Asset {
  cls: 'GOVT_BOND' | 'CORP_BOND';
  issuerId: string;               // gov_… or cmp_… or bnk_…
  kind: 'BILL' | 'FIXED' | 'FRN' | 'LINKER' | 'ZERO';
  faceValue: bigint;              // per bond unit = 1,000 currency units (Price is per 100 face, see §3.7)
  couponRate: number;             // annual, FIXED and LINKER (real coupon); FRN: spread over ONR
  couponFreqPerYear: 0 | 1 | 2 | 4;
  issueTick: number; maturityTick: number;
  firstCouponTick: number | null;
  dayCount: 'ACT_364';            // game calendar (§3.7.2)
  amountOutstanding: bigint;      // face
  seniority: 'SOVEREIGN' | 'SENIOR_SECURED' | 'SENIOR_UNSECURED' | 'SUBORDINATED' | 'AT1';
  callSchedule: { tick: number; price: number }[];   // empty = non-callable
  inflationIndexBase: number | null;                  // LINKER: CPI at issue
  covenantIds: string[];          // 09 owns covenant definitions on corporate bonds
  ratingRef: string | null;       // 08 rating record
  recoveryEstimate: number | null; // set on default (09)
}

interface CreditState {           // per issuer, recomputed hourly (t mod 30 == 0) and on events
  issuerId: string;
  pdPhysical1y: number;           // §3.8
  pdRiskNeutral1y: number;
  hazard: number;                 // continuous, per game year
  distanceToDefault: number | null;
  spreadBpsBySeniority: Record<string, number>;
  lastUpdatedTick: number;
}

interface PrimaryAuction {
  id: string; assetId: AssetId;   // the new issue (status PENDING until settlement)
  issuerId: string; sizeFace: bigint;
  method: 'UNIFORM_YIELD' | 'UNIFORM_PRICE';
  announceTick: number; auctionTick: number; settleTick: number;
  nonCompetitiveCapFace: bigint;  // $5M per bidder default
  bids: { bidderId: string; yieldOrPrice: number | null; face: bigint; competitive: boolean }[];
  result: { stopOut: number; allotmentRatioAtStop: number; bidToCover: number } | null;
}
```

### §2.4 FX, commodities, game-native commodities

```ts
interface FxPair extends Asset { cls: 'FX_SPOT'; base: Ccy; quote: Ccy; isLeg: boolean; } // isLeg: one of the 4 FDL legs

interface CommodityAsset extends Asset {
  cls: 'COMMODITY';
  commodityId: string;            // 'CRUDE', 'GOLD', … 'COMPUTE', 'DATA', 'POWER_FDL' …
  unitKey: string;                // 'bbl', 'oz', 't', 'bu', 'lb', 'kg', 'mbf', 'MMBtu', 'GPUh', 'DQU', 'MWh'
  hubId: string;                  // spot instruments are per hub; benchmark hub flagged in CommodityDef
  storable: boolean;
}
interface CommodityDef {
  commodityId: string; group: 'ENERGY' | 'METALS' | 'AGRI' | 'NATIVE';
  benchmarkHubId: string; hubs: string[];
  refPrice: bigint;                // marginal-cost anchor at genesis
  normalCoverDays: number; demandElasticity: number; gammaCover: number;
  storageCostPerYearFrac: number;  // of value
  perishDecayPerYear: number;      // value loss if stored (0 for metals)
  harvestMonth: number | null;     // 1–12 for AGRI
  seasonalAmp: number;             // log amplitude of seasonal futures term
}
interface CommodityState {         // per commodity, world-level, updated each game hour
  commodityId: string;
  inventory: number; capacityUtil: number; supplyRate: number; demandRate: number;
  daysCover: number; convenienceYield: number;
  hubBasis: Record<string, bigint>;
}
interface Hub { id: string; blocId: Ccy; cityId: string; storageCapacity: Record<string, number>; }
interface FreightState { index: number; fleetUtil: number; routeDays: Record<string, number>; } // route key 'HUB_A>HUB_B'
interface WarehouseReceipt { receiptId: string; ownerId: string; commodityId: string; hubId: string; qty: number; facilityId: string | null; createdTick: number; } // facilityId null = NPC public warehouse
interface Shipment { shipmentId: string; ownerId: string; commodityId: string; qty: number; fromHub: string; toHub: string; departTick: number; arriveTick: number; freightCost: bigint; status: 'IN_TRANSIT' | 'ARRIVED' | 'LOST'; }
```

### §2.5 Crypto and DeFi

```ts
interface Chain { id: 'AURUM' | 'LATTICE' | 'MERIDIAN'; nativeTokenId: AssetId; smartContracts: boolean;
  opsPerBlock: number; baseFee: bigint; targetOps: number; queue: string[]; }  // one block per tick

interface CryptoToken extends Asset {
  cls: 'CRYPTO';
  chainId: Chain['id'];
  kind: 'NATIVE' | 'STABLE_FIAT' | 'STABLE_CDP' | 'STABLE_ALGO' | 'GOV' | 'UTILITY' | 'MEME' | 'WRAPPED' | 'PLAYER';
  totalSupply: bigint; maxSupply: bigint | null;
  issuance: { perGameDay: bigint; halvingEveryChapter: boolean; recipient: string } | null;
  hype: number;                   // H in [0,1], §3.11.3
  wrappedFrom: AssetId | null; bridgeId: string | null;
  creatorId: string | null;       // MEME and PLAYER
}

interface Wallet { walletId: string; ownerId: string; chainId: Chain['id']; balances: Record<AssetId, bigint>;
  custody: 'SELF' | 'EXCHANGE'; label: string; } // EXCHANGE = claim on Vault Exchange (an exc entity)

interface AmmPool {
  poolId: string; chainId: Chain['id'];
  curve: 'CONSTANT_PRODUCT' | 'STABLESWAP' | 'RANGE';
  tokenA: AssetId; tokenB: AssetId;
  reserveA: bigint; reserveB: bigint;          // CONSTANT_PRODUCT, STABLESWAP
  ampA: number | null;                          // STABLESWAP amplification (100 default)
  sqrtPrice: number | null; activeLiquidity: number | null; ranges: RangeLiquidity[]; // RANGE
  feeBps: number; protocolFeeShare: number;     // share of fee to protocol treasury
  lpTokenId: AssetId; lpSupply: bigint;
  twap: { cumulative: number; lastTick: number }; // oracle accumulator
}
interface RangeLiquidity { positionId: string; ownerId: string; sqrtLower: number; sqrtUpper: number; liquidity: number; feesOwedA: bigint; feesOwedB: bigint; }

interface LendingMarket {
  marketId: string; protocol: 'FERRO' | 'HARBOR'; chainId: Chain['id']; assetId: AssetId;
  totalSupplied: bigint; totalBorrowed: bigint; reserves: bigint;
  supplyIndex: number; borrowIndex: number;     // compounding indices, per block
  collateralFactor: number; liquidationThreshold: number; liquidationBonus: number; closeFactor: number;
  rateModel: { base: number; slope1: number; slope2: number; kink: number; reserveFactor: number };
  supplyCap: bigint; borrowCap: bigint;
}
interface LendingAccount { accountId: string; ownerId: string; protocol: string;
  supplied: Record<string, bigint>; borrowedScaled: Record<string, bigint>; healthFactor: number; }

interface CdpVault { vaultId: string; ownerId: string; collateralAsset: AssetId; collateral: bigint; debt: bigint; // in VSD
  status: 'OPEN' | 'LIQUIDATING' | 'CLOSED'; }
interface StableState { tokenId: AssetId; mechanism: 'FIAT' | 'CDP' | 'ALGO';
  reserves: { assetId: string; amount: bigint }[]; pegTarget: bigint; redemptionQueue: bigint;
  dailyRedeemCapFrac: number; status: 'PEGGED' | 'STRESSED' | 'DEPEGGED' | 'DEFUNCT'; }
interface Bridge { bridgeId: string; fromChain: Chain['id']; toChain: Chain['id']; lockedAssetId: AssetId;
  wrappedAssetId: AssetId; locked: bigint; wrappedSupply: bigint; transferTicks: number; feeBps: number;
  status: 'OPEN' | 'PAUSED' | 'IMPAIRED'; recoveryRatio: number; }
interface OracleFeed { assetId: AssetId; price: bigint; cexTwap: bigint; ammTwap: bigint; lastTick: number; stale: boolean; }
```

### §2.6 Derivatives

```ts
interface OptionSeries extends Asset {
  cls: 'OPTION';
  underlyingId: AssetId;          // spot, index or a FUTURE series
  right: 'CALL' | 'PUT'; strike: bigint; expiryTick: number;
  style: 'EUROPEAN' | 'AMERICAN'; settlement: 'CASH' | 'PHYSICAL';
  multiplier: number;             // underlying units per contract
  openInterest: bigint;
  adjusted: boolean;              // after a corporate action (§3.4.6)
}
interface VolSurface { underlyingId: AssetId; atmByTenor: { tYears: number; vol: number }[];
  skew0: number; curv: number; dealerNetVega: number; vegaCapacity: number; lastUpdatedTick: number; }

interface FutureSeries extends Asset {
  cls: 'FUTURE';
  underlyingId: AssetId | null;   // null for rate futures (reference = ONR index)
  refRateBloc: Ccy | null;
  expiryTick: number; lastTradeTick: number;
  multiplier: number;
  settlement: 'CASH' | 'PHYSICAL_ELECTIVE';
  deliveryHubId: string | null;
  dailySettlementPrice: bigint;   // set at t = 540 (exchange products) or 719 (24h products)
  openInterest: bigint;
  spotMonthLimit: bigint | null;  // §3.14.5
}
interface PerpAsset extends Asset {
  cls: 'PERP';
  underlyingId: AssetId; indexPrice: bigint; markPrice: bigint;
  fundingIntervalTicks: number;   // 240
  nextFundingTick: number; lastFundingRate: number; premiumAccumulator: number;
  maxLeverageByLicense: Record<License, number>;
  openInterest: bigint; insuranceFundId: string; // 07 CRY service
}

type SwapKind = 'OIS' | 'ZCIS' | 'FX_FWD' | 'FX_SWAP' | 'XCCY' | 'TRS' | 'COMMODITY_SWAP';
interface SwapTrade {
  tradeId: string; kind: SwapKind; partyA: string; partyB: string;   // A = fixed payer / total-return receiver / FX buyer
  notional: bigint; ccy: Ccy; ccy2: Ccy | null;
  startTick: number; endTick: number; payFreqDays: number;
  fixedRate: number | null; floatIndex: 'ONR' | null; floatSpreadBps: number;
  refAssetId: AssetId | null;     // TRS / commodity swap reference
  fxRate: number | null;          // FX_FWD / swap far rate
  clearing: ClearingService;      // CCP_OTC or BILATERAL (TRS)
  csaId: string | null;           // 07 §3.18 when bilateral
  lastPv: bigint; lastValuedTick: number;
  status: 'LIVE' | 'TERMINATED' | 'MATURED' | 'DEFAULTED';
}
interface CdsContract {
  tradeId: string; buyerId: string; sellerId: string;
  refEntityId: string; refObligationId: AssetId; seniority: BondAsset['seniority'];
  notional: bigint; ccy: Ccy; couponBps: 100 | 500; startTick: number; maturityTick: number;
  upfrontPaid: bigint; clearing: 'CCP_CDS';
  status: 'LIVE' | 'TRIGGERED' | 'SETTLED' | 'MATURED' | 'TERMINATED';
}
interface CreditEvent { eventId: string; refEntityId: string; type: 'BANKRUPTCY' | 'FAILURE_TO_PAY' | 'RESTRUCTURING' | 'GOVERNMENTAL_INTERVENTION';
  eventTick: number; determinedTick: number; auctionTick: number; finalPrice: number | null; }
```

### §2.7 Collectibles, OTC, player tokens

```ts
interface CollectibleCategory { categoryId: 'WATCH' | 'ART' | 'CLASSIC_CAR' | 'WINE' | 'SNEAKER' | 'JEWEL' | 'RARE_BOOK' | 'MEMORABILIA';
  indexLevel: number; fashionState: number; storageFeePerYearFrac: number; conditionDecayPerYear: number; }
interface CollectibleItem {
  itemId: string; catalogItemId: string;      // 14 lifestyle catalog / 22
  categoryId: CollectibleCategory['categoryId'];
  klass: 'MASS' | 'LIMITED' | 'UNIQUE';
  serial: number | null; editionSize: number | null;
  baseValue: bigint; rarity: number;          // rarity multiplier ≥ 1
  condition: number;                          // 0–100
  provenance: { ownerLabel: string; fromTick: number; toTick: number | null; verified: boolean }[];
  ownerId: string; stored: 'HOME' | 'VAULT' | 'DEALER' | 'MUSEUM_LOAN';
  appraisal: bigint; appraisalTick: number;
  flags: ('STOLEN' | 'UNVERIFIED' | 'PLEDGED' | 'ON_AUCTION')[];
  acquiredPrice: bigint; acquiredTick: number;
}
interface AuctionSale { saleId: string; house: 'HV' | 'PLAYER_HOUSE'; categoryId: string; startTick: number; lots: AuctionLot[]; }
interface AuctionLot { lotId: string; itemId: string; consignorId: string; reserve: bigint; estimateLow: bigint; estimateHigh: bigint;
  highBid: bigint; highBidderId: string | null; closeTick: number; extensions: number;
  status: 'OPEN' | 'SOLD' | 'PASSED' | 'WITHDRAWN'; }

interface RfqRequest { rfqId: string; requesterId: string; requesterLabel: string; // rotating label (L11)
  instrumentSpec: object; side: 'BUY' | 'SELL' | 'PAY' | 'RECEIVE' | 'BUY_PROTECTION' | 'SELL_PROTECTION';
  size: bigint; dealerIds: string[] | 'ALL'; createdTick: number; expiresTick: number; status: 'OPEN' | 'FILLED' | 'EXPIRED' | 'CANCELLED'; }
interface RfqQuote { quoteId: string; rfqId: string; dealerId: string; price: number; size: bigint; validUntilTick: number; }
interface BlockCross { blockId: string; assetId: AssetId; buyerId: string; sellerId: string; qty: bigint;
  crossTick: number; price: bigint | null; filingTick: number; status: 'PROPOSED' | 'ACCEPTED' | 'CROSSED' | 'REJECTED'; }

interface PlayerTokenLaunch { launchId: string; creatorId: string; tokenId: AssetId; chainId: 'LATTICE' | 'MERIDIAN';
  lockedLiquidityFdl: bigint; lockUntilTick: number; creatorAllocation: bigint; vestingEndTick: number;
  disclosureDocKey: string; status: 'PENDING' | 'LIVE' | 'HALTED' | 'DEFUNCT'; }
```

---

## §3 Rules and formulas

### §3.1 The tradeable universe

#### §3.1.1 Launch universe: exactly 400 authored instruments (22 lists every one)

| Group | Count | Composition |
|---|---|---|
| Equities (NPC listed companies) | 240 | 48 per bloc = 12 sectors × 4 companies; includes REITs (real-estate sector) and the 12 tone-setting names of 01 §3.1 (Halcyon Systems, Verdane Energy, Ostrava Steel, Lumen Pharma, Meridia Bank, Corvo Motors, Pallas Foods, Aurelius Holdings, Nimbus Compute, Sentinel Cyber, Atlas Freight, Velour Maison) |
| ETFs | 30 | GX100, 5 regional-30 index ETFs, 12 global sector ETFs, Dividend 30, IG bond, HY bond, 5 government-bond ETFs (one per bloc), REIT, broad commodity, gold, crypto-10 |
| Government bonds | 30 | per bloc: 3-month bill, 2y, 5y, 10y, 30y fixed, 10y linker |
| Corporate bonds | 50 | one benchmark 5y or 10y bond for the 50 largest leveraged issuers (incl. 10 NPC banks' senior bonds) |
| FX spot pairs | 10 | every pair of the 5 currencies (§3.9.1) |
| Commodities (spot at benchmark hub) | 20 | 13 physical (Crude, Natural gas, Gold, Silver, Copper, Lithium, Rare-earth basket, Wheat, Corn, Coffee, Cocoa, Lumber, Uranium) + Compute + Data + Power in each of 5 blocs |
| Crypto tokens | 20 | §3.11.1 |

Indices (§3.5) are reference values, not instruments, and are not counted. **Derivative series, LP tokens, new bond issues, IPO equities, meme coins, non-benchmark-hub commodity spot lines and collectibles are created by rules** (§3.1.3) and are not counted in the 400.

#### §3.1.2 Growth of the universe
- New city opened by 16 (per ~4,000 growth of `N_a`, 01 §14.1): adds 4 NPC listed companies to the bloc (22 generator), 1 corporate bond issuer, and expands sector indices. 
- Player IPOs (09) add equities. Corporate and sovereign issuance adds bonds (§3.7.6). Meme coins spawn (§3.11.4).
- Soft cap `PARAM.max_live_instruments = 2500` (excluding lazy derivative series). If the cap is reached, new NPC spawns (meme coins, non-benchmark bonds) pause; player IPOs and sovereign issuance are never blocked.

#### §3.1.3 Rule-created instruments and deterministic ids
- Option series id: `ast_OP_<underCode>_<expiryTick>_<C|P>_<strikeMicro>`. Future: `ast_FU_<underCode>_<expiryTick>`. Perp: `ast_PP_<underCode>`. LP token: `ast_LP_<poolId>`. Bond issue: `ast_BD_<issuerCode>_<maturityTick>_<seq>`. Meme: `ast_CR_M<seq>`.
- **Lazy series:** an option or future series that is inside the listing grid (§3.13.1, §3.14.1) exists as a definition from the start of its listing window; it is materialized as state (open interest, order book entry) only when the first order or position touches it. Quotes for unmaterialized series are computed on demand from the model (§3.13.3). This keeps tick cost proportional to activity.

### §3.2 Licenses and gates per class

| Class / activity | Long / buy | Short / write | Notes |
|---|---|---|---|
| Deposits, term deposits (07) | LIC0 | — | Every character |
| Collectibles (buy at auction, dealer, consign) | LIC0 | — | Lifestyle purchases of MASS items are 14's `life.*` |
| Equities, ETFs, government bills | LIC1 | LIC2 (with locate, 07 §3.13) | Player-IPO shorts open 3 game days after listing |
| Spot crypto on the CEX (the 20 launch tokens, "major crypto" in 14 §3.3.1), self-custody wallets | LIC1 | — | Spot crypto is not shortable except via perps/futures/lending; meme coins trade only on AMMs, hence LIC2 |
| Government and corporate bonds, FX spot, commodity spot, warehouse receipts | LIC2 | LIC2 (bonds via locate; FX is two-sided by nature) | Margin up to 2× (07) |
| DeFi: AMM swap, LP, lending, CDP vaults, bridges | LIC2 | — | Borrowing in lending protocols counts as DeFi leverage, not broker margin |
| Primary auctions | LIC2 non-competitive (≤ $5M) | LIC4 competitive | §3.7.6 |
| Listed options | LIC3 buy | LIC3 covered/cash-secured write; naked write LIC4 | |
| Futures, perps | LIC3 (≤ 10×) | LIC3 | Perps 20× at LIC4 |
| OIS, FX forwards/swaps, ZCIS, commodity swaps (RFQ) | LIC3 | LIC3 | Cleared CCP_OTC |
| CDS buy protection | LIC3 | — | Insider ban §3.17.6 |
| CDS sell protection, TRS, XCCY, bilateral OTC, block desk | LIC4 | LIC4 | |
| Player-token launch | LIC4 + rank R4 | — | Disabled at launch (§3.20, L10) |

Additional gates evaluated in P1 (01 §7.6, 03, 13): active court case at S3+ halves the maximum leverage; a character under Held cannot submit any intent of this module except option exercise, CDS settlement elections and `mkt.collect.store`; restricted cash (03 §3.5.6, rewarded-ad cash, ROADMAP §2.7) cannot buy options, futures, perps or CDS, nor post margin; during the 72-hour new-player protection derivatives leverage is capped at `PARAM.rookie_max_leverage = 3`.

### §3.3 Sessions, settlement, marks, limits

#### §3.3.1 Session profiles (clock per 00 §5.1)
| Profile | Trading | Notes |
|---|---|---|
| EQUITY | Opening auction t = 60, continuous 61–539, closing auction t = 540, Mon–Fri | Equities, ETFs, bonds, listed equity/index options, index futures day session |
| FX | 24h Mon 00:00 → Sat 00:00 game time, reopen Sun 22:00 (t = 660 Sunday) | FX spot; FX futures follow FUT24 |
| CRYPTO | Every tick, 7 days | Spot crypto, perps, crypto futures/options, DeFi |
| FUT24 | Every tick Mon–Fri plus Sun from t = 660; daily settlement at t = 719 | Commodity futures, rate futures, FX futures, compute and power markets |
| OTC | RFQ any tick Mon–Fri; CDS and swaps; valuation hourly | |
| AUCTION | Per-lot close ticks (§3.18) | Collectibles |
| DISTRESSED | One call auction per trading day at t = 300 | Defaulted bonds, suspended equities, claims |

#### §3.3.2 Settlement
`DEFAULT (Mathis may override)`: **every trade settles delivery-versus-payment in P13 of the tick it matched** (T+0). There are no settlement fails, no failed-delivery state, no T+2 queue. Consequences: naked shorting is impossible (locate is required at P1), and a buyer can re-sell on the next tick. Cross-partition trades use hold → settle (02, 19); the hold is placed in P1 and released in P13.

#### §3.3.3 Mark price (used for net worth, margin, NWI and ladders)
```
markPrice(i, t):
  if cls ∈ {OPTION, SWAP, CDS, LP_TOKEN}: model value (§3.13.3, §3.16.4, §3.17.2, §3.12.2)
  elif last batch-clearing price exists within PARAM.mark_stale_ticks = 30:
       m = clamp(lastPrice, V_or_mid · (1 − b), V_or_mid · (1 + b)),  b = max(0.02, 4·σ_tick·√30)
  else m = NPC mid quote (05)
  COLLECTIBLE: appraisal (§3.18.2) × (1 − PARAM.collectible_mark_haircut = 0.10)
  player-company equity on ladders: min(m, 3-day VWAP) (ROADMAP 2.1; 15 owns ladders)
  DEFAULTED bond / DISTRESSED: last DISTRESSED auction price, else 09 recovery estimate
```
`V_or_mid` is the fundamental value from this module if the class has one, else the NPC mid. The clamp is what stops a thin-market print from moving everyone's marks or triggering liquidations (01 §9 "liquidation uses fair value with a band").

#### §3.3.4 Position and order limits (enforced in P1)
- Long position ≤ 25% of free float of an NPC company; ≤ 49% of a player company for anyone other than its controller, except through a tender (09).
- Aggregate short interest ≤ 50% of free float; orders that would breach it are rejected.
- Order size per tick ≤ 3 × ADV is 05's rule (auto-split).
- Futures spot-month and all-months limits (§3.14.5); perp position ≤ `PARAM.perp_max_oi_share = 0.10` of open interest per beneficial owner; CDS net protection sold by one owner ≤ 25% of the reference entity's debt outstanding.
- All limits apply to the **beneficial-owner group** (03 ownership chain: the character, its companies, funds it controls, and linked accounts flagged by 15's collusion graph).

### §3.4 Equities

#### §3.4.1 Sector parameters (defaults; 23 lists each as `PARAM.eq_sector_<id>_*`)
| Sector | PE_base | PS_base | Duration d | σ annual | Jumps/yr | Factor notes |
|---|---|---|---|---|---|---|
| TECH | 32 | 6.0 | 9 | 0.35 | 3 | rates −, AI-race +, risk appetite + |
| SEMI | 26 | 4.5 | 7 | 0.45 | 4 | compute price +, AI-race + |
| ENERGY | 11 | 1.2 | 3 | 0.30 | 3 | crude +, gas + |
| MATERIALS | 12 | 1.4 | 3 | 0.32 | 3 | copper, lithium, rare earths + |
| INDUSTRIALS | 16 | 1.6 | 4 | 0.25 | 2 | GDP +, trade volume + |
| FINANCIALS | 10 | 2.5 | 2 | 0.25 | 2 | curve slope +, credit losses − |
| HEALTH | 20 | 4.0 | 5 | 0.30 | 5 | trial events (binary) |
| STAPLES | 18 | 1.5 | 3 | 0.16 | 1 | inflation pass-through |
| DISCRETIONARY | 20 | 1.8 | 5 | 0.30 | 3 | wages +, top-1% wealth + |
| REAL_ESTATE | 16 | 6.0 | 8 | 0.24 | 2 | mortgage rates −, occupancy + |
| MEDIA | 18 | 2.5 | 6 | 0.32 | 3 | ad spend, hype |
| SECURITY | 24 | 5.0 | 6 | 0.28 | 3 | world hack rate +, geopolitical tension + |

Large caps (top quartile by free-float cap in the bloc) use σ × 0.8 and spreads of 2 bps; small caps (bottom quartile) σ × 1.4 and 25 bps (05 applies).

#### §3.4.2 Fundamental value
Inputs per issuer come from 09 (`CompanyFinancials`, assumed interface in §8 of the notes): `revenueTTM R`, `netMarginTTM m`, `debt D`, `interestRate on debt`, `taxRate`, `sharesOutstanding N`, `bookEquity B`, `expectedEps4Q` (09's model expectation of the next four quarters, computed from its business simulation), `growthFwd g_f` (expected revenue growth), hidden `quality q`, `management mg`, `moat mo` (0–100).

```
EPS_fwd   = expectedEps4Q                                       (09)
RA        = 1 − F / 50                                          risk appetite (04 §3.14.1), F = 04's Fear Index (0–100)
PE_s      = PE_base_s · exp(−d_s · (y10_bloc − r_neutral_bloc)) · (1 + 0.3 · RA)
gp        = clamp(PARAM.eq_growth_beta(1.5) · (g_f − g_sector_median), −0.30, +0.60)
qm        = 1 + 0.004 · (q − 50) + 0.002 · (mo − 50)            quality/moat multiplier, ±30% max
rr        = earnings re-rating state (§3.4.3), starts at 0, decays with half-life 91 game days
sent      = sentiment multiplier from 05, in [0.75, 1.25]

if EPS_fwd > 0:  V = EPS_fwd · PE_s · (1 + gp) · qm · exp(rr) · sent
else:            V = (R / N) · PS_base_s · (1 + gp) · qm · exp(rr) · sent · PARAM.eq_loss_maker_ps_haircut(0.7)
V = max(V, 0.3 · B / N)  if B > 0                                asset-value floor
V = max(V, tickSize)                                              hard floor 0.01 (01 §2.2); bankruptcy is an event, not a drift
```
**Player-listed companies** (09 §3.10.4; ruling in 24): `V = 09.fundamentalValue(cmpId) · sent` replaces the formula above (the sum-of-the-parts value of its businesses, properties and financial assets, because player businesses run on game-pace economics); the floors still apply. The P/E formula is used for NPC issuers only.

`y10_bloc` and `r_neutral_bloc` come from 04. The P/E guard of 01 §2.2 (P/E cannot sustainably exceed 3× the sector band) is implemented by 05's pull term: if `P / EPS_fwd > 3 · PE_s`, 05 multiplies κ by 4 for that asset.

#### §3.4.3 Earnings cycle
1. **Schedule.** Each issuer reports once per game quarter. Report day = 09's quarter close + `5 + (hash(issuerId) mod 20)` game days; slot PRE (t = 30) if `hash mod 2 == 0`, else POST (t = 600). Published in the earnings calendar 10 game days ahead (PUBLIC).
2. **Consensus.** At quarter start NPC analysts (16) publish `consensus = E_q[EPS] · (1 + ε_c)`, `ε_c ~ N(−bias, PARAM.eq_consensus_sigma = 0.06)`, `bias = 0.01 · (mg − 50) / 50` (good managers beat more often). RNG stream `rng('earn', issuerId, quarter)`.
3. **Actual.** 09 supplies the quarter's actual EPS from the ledger (player companies: real ledger profit; NPC: 09's simulation). Revenue cannot be faked (ROADMAP 2.1 rule 1).
4. **Surprise.** `s = clamp((EPS_actual − consensus) / max(|consensus|, 0.01 · P), −1, 1)`.
5. **Revision.** If 09 does not supply a new `expectedEps4Q`, 06 sets `EPS_fwd ← EPS_fwd · (1 + PARAM.eq_earn_revision(1.0) · s)`. Re-rating: `rr ← rr + PARAM.eq_earn_rerate(1.5) · s`. Together `ΔlnV ≈ 2.5 · s`, inside the 2–4× sensitivity of 01 §3.1.
6. **Price jump.** 05 receives `J = PARAM.eq_earn_immediate_frac(0.6) · ΔlnV` as a targeted jump at the report tick; the remaining 40% arrives through the pull term, which is the post-announcement drift skilled players exploit (01 §6.1).
7. **Guidance.** 09 may attach guidance; it changes `expectedEps4Q` directly and is folded into step 5.
8. **Blackout.** For player companies, insiders (09 list) cannot trade from 2 game days before to 1 game day after the report (ROADMAP 2.1).

#### §3.4.4 Dividends (decision by 09, execution here)
- Declaration publishes `cashPerShare`, `exTick` (≥ 2 game days after announce, at t = 60 of that day), `recordTick = exTick − 1`, `payTick` (≤ 5 game days after ex).
- At the ex-date opening auction, 05 subtracts `cashPerShare` from the reference price and from resting limit prices of orders on that asset (resting stops and limits are adjusted, not cancelled).
- Entitlement: holders with `qty > 0` at the close of `recordTick`. Lent shares: the borrower's account pays a manufactured dividend equal to the dividend to the lender (07 §3.13.6). Shorts pay the same amount.
- Pay: P13 of `payTick` posts `EQ_DIVIDEND` from the issuer to each holder (03 classifies the flow).

#### §3.4.5 Splits, offerings, buybacks
- NPC issuers split 5:1 when `P > PARAM.eq_split_trigger = 1000` currency units for 20 consecutive trading days, 10:1 above 5,000. Reverse split 1:10 when `P < 1` for 20 days and the company is not DISTRESSED. Player companies split only by 09 decision.
- On a split effective at t = 0: all positions, lots, resting orders, locates and loans scale by the ratio; option strikes divide by the ratio and multipliers multiply by it.
- Secondary offerings and rights: 09 decides size; 06 runs them through `PrimaryAuction` with `UNIFORM_PRICE` (§3.7.6) and a 1-game-week Wire notice for player companies (ROADMAP 2.1).
- Buybacks are company orders submitted by 09 into 05, capped at 1% of float per game day for player companies.

#### §3.4.6 Mergers, tenders, spin-offs, delisting, bankruptcy
- **Tender (09):** holders submit `mkt.corp.tender`. Proration if oversubscribed: pro rata, remainders by deterministic hash order.
- **Merger completion:** each target share converts to `cashPerShare` and/or `stockPerShare` of the acquirer at P13 of the effective tick. Options on the target are adjusted to deliver the consideration (`adjusted = true`, new deliverable); target futures settle at the cash value.
- **Spin-off:** new `EquityAsset` created PENDING, listed with an opening auction on the effective day; holders receive pro rata; parent price reference drops by the spin-off's expected value (09 valuation); indices add the spun entity at zero index impact (divisor adjusted).
- **Bankruptcy filing (09):** equity → `DISTRESSED`, trades only on the DISTRESSED venue; options and futures on it are settled in cash at the last pre-filing closing price minus the first DISTRESSED auction move (i.e. settle at the first DISTRESSED auction price); removed from indices at the next tick with divisor adjustment. On plan confirmation (09), shares convert to new claims, new equity or zero; then `DELISTED`.
- **Delisting (player company, ROADMAP 2.1):** EV under $10M for 5 straight game days triggers review; take-private requires a tender ≥ 1.2 × 30-game-day VWAP.

#### §3.4.7 Short selling
Requires `licenseShort` and a locate from 07 §3.13 at P1. Borrow fee accrues daily (07). Recalls and buy-ins (07) are how squeezes emerge: when price rises and short interest > 30% of float, buy-ins and voluntary covering enter 05's flow as aggressive buy orders.

### §3.5 Indices

#### §3.5.1 Index list
| Index | Universe and rule | Cap | Rebalance |
|---|---|---|---|
| GX100 | 100 largest equities world-wide by free-float cap in FDL | 10% | Quarterly |
| FED30, EUR30, PAC30, NOR30, SOU30 | 30 largest of the bloc's listed equities | 10% | Quarterly |
| GX sector indices (12) | All listed equities of the sector, world-wide | 20% | Quarterly |
| GX Dividend 30 | 30 highest trailing dividend yields with payout ratio ≤ 90% | 6% | Semiannual |
| GX Bond Aggregate | All government and IG corporate bonds, face-weighted, ≥ 1y to maturity | — | Monthly |
| GX High Yield | Corporate bonds rated below investment grade (08) | 3% per issuer | Monthly |
| CMX Commodity | 13 physical commodities, front-month futures, fixed production weights (22) | — | Monthly roll window, days 5–9 |
| CRX10 | 10 largest non-stable crypto tokens by free-float cap | 25% | Monthly |
| GXV Volatility Index | §3.5.3 (implied vol of GX100; an input, not the Fear Index) | — | — |
| FRX Freight Index | §3.10.6 | — | — |

#### §3.5.2 Computation
- `level = Σ_k units_k · P_k · FX_k→FDL / divisor`, recomputed each tick in P6 after matching, using mark prices (§3.3.3) so a stale or crashed print cannot move the index outside the mark band.
- Divisor adjusts so that level is unchanged across rebalances and corporate actions: `divisor_new = divisor_old · (Σ new units · P) / (Σ old units · P)` at the same prices.
- Rebalance at the quarter-end closing auction (t = 540): index units for the next quarter are computed from that auction's prices; ETFs and NPC index funds (08, 16) trade at that auction, which creates the real-world "index rebalance" flow.
- Total-return variants reinvest dividends on ex-date.

#### §3.5.3 Fear, and the GX Volatility Index (GXV)
**Fear is owned by 04.** Everywhere in this module `fear = F / 100`, where F is 04's Fear Index (04 §3.14.1, 0–100, updated each game hour), and `RA = 1 − F/50`. 06 reads the value committed at the previous game hour, so there is no circularity between option prices and fear.

GXV is the published 30-game-day implied volatility of GX100, in vol points, computed by the variance-swap formula over the full strike grid of the two GX100 option expiries bracketing 30 game days:
```
σ²(T) = (2/T) Σ_K (ΔK / K²) · e^{rT} · Q(K) − (1/T) · (F/K₀ − 1)²
GXV   = 100 · sqrt( interpolate σ²(T₁), σ²(T₂) in total variance to T = 30/364 )
```
`Q(K)` is the NPC mid of the OTM option at strike K (quotes exist for every grid strike, §3.13.3). GXV is computed in P6 after option quotes update, published in P14, bounded [5, 150]. It is an information product (the game's VIX-style quote, a candidate input to 04's F and to players' analytics); it never replaces F.

### §3.6 ETFs (instrument side)
- `nav = (Σ basket qty · markPrice · FX + cash − accrued expenses) / unitsOutstanding`, recomputed each tick; `inav` is the same with last prices instead of marks and is PUBLIC each tick.
- Expense ratio accrues at day close: `expenseRatioBps / 10,000 / 364 × NAV × units`, posted from the ETF to its sponsor (08's fund management-fee code).
- Market price is 05's order book; the premium/discount is kept within bands by authorized participants (08 §ETF creation/redemption). When an underlying market is closed (e.g. a foreign bloc's equity on a weekend is not possible because all equity sessions share a clock; but halted constituents are), iNAV uses the halted constituent's mark and the ETF may trade at a discount: that is intended (V3 3.6 "liquidity mismatches cause real discounts").

### §3.7 Rates and government bonds

#### §3.7.1 Curves (interface assumed from 04)
04 publishes per bloc each game hour: `ois(τ)` (zero rate of the expected overnight path), `govt(τ)` (zero rate of government bonds), `real(τ)` (real zero rate, for linkers), `cpiIndex`, `policyRate`, `DFR`, `MLFR`, all as Nelson-Siegel parameters `(L, S, C, λ)` per curve (01 §3.6). 06 never invents a curve; it prices off these.

#### §3.7.2 Day count and calendar
`ACT_364`: year fraction = game days / 364. Coupons: semiannual = every 182 game days, quarterly = 91, annual = 364. Bill tenors 91 game days. Coupon and maturity ticks are t = 719 of the scheduled game day; if that day is a weekend, the payment posts on the next Monday t = 719 with no extra interest (following-business-day).

#### §3.7.3 Pricing
- Price is quoted **per 100 of face** (clean). Dirty value of a holding = `qty · face/100 · (clean + accrued)`.
- `dirty = Σ_k CF_k · exp(−(z(τ_k) + s) · τ_k)`; for government bonds `z = govt`, `s = 0` (own-bloc sovereign spread is inside `govt`); for corporates `z = govt` of the bond's currency and `s` from §3.8.
- `accrued = couponRate · 100 / freq · (days since last coupon) / (days in period)`.
- Yield to maturity solved by Newton-Raphson on `dirty(y) = market dirty`, at most 20 iterations, tolerance 1e-10, start `y0 = couponRate`; fall back to bisection on [−5%, 100%] if Newton fails. Deterministic.
- `ModDur = −(1/P) dP/dy`, `Convexity = (1/P) d²P/dy²` computed analytically from the cash flows; DV01 = ModDur · dirty · 0.0001.
- `V_i` passed to 05 = model clean price; bond `κ` half-life 2 game days (01 §2.1), idiosyncratic σ 1%/yr, so market prices hug the curve but supply and demand from players and banks still move them (a fire sale by a bank in a run pushes yields up locally).

#### §3.7.4 Inflation-linked bonds
Principal = `face · CPI_t / inflationIndexBase` (CPI lagged 1 game month). Real coupon applies to indexed principal. Priced with `real(τ)`; breakeven = nominal yield − real yield, displayed. Principal floor at par at maturity (deflation floor).

#### §3.7.5 Floating-rate notes and bills
- FRN coupon each period = compounded ONR (07 §3.7.4) over the period + `couponRate` (the spread). Priced as par + PV(spread − current market spread).
- Bills are zero-coupon at discount: `price = 100 · exp(−govt(τ)·τ)`.

#### §3.7.6 Primary issuance auctions (single mechanism for sovereigns, corporates, banks, secondaries)
1. Issuer (04 for sovereigns, 09 for companies, 07 for banks) announces size, maturity, coupon (fixed coupon set to the rounded par yield at announcement, to 0.125%), auction day (≥ 1 game day later), at t = 300.
2. Bids `mkt.primary.bid`: competitive = (yield, face) for `UNIFORM_YIELD` or (price, shares) for `UNIFORM_PRICE`; non-competitive = face only, capped at `PARAM.primary_noncomp_cap = $5M` equivalent per beneficial owner.
3. Clearing at P6 of auction tick: non-competitive filled first; competitive sorted by best yield (lowest) / best price; stop-out = yield of the marginal bid that fills the size; all winners pay the stop-out (uniform); bids at stop-out prorated; prorate remainders by deterministic hash order.
4. Bid-to-cover = total competitive face / size, PUBLIC. If cover < 1.0, the issue is downsized to the bids received (sovereign: 04 may make the central bank take the remainder only if its QE program allows).
5. Settlement P13 at settleTick (auction tick + 1 game day): cash from winners to issuer, new bonds to winners.
6. NPC primary dealers (the bloc's NPC banks, §6) bid a demand curve: `face_d(y) = cap_d · σ((y − (yMid − 0.0005)) / 0.0004)` where `yMid` = model yield for that maturity + `0.02·fear`; this yields bid-to-cover 2–3 in calm markets and < 1.5 in stress.

### §3.8 Corporate credit model (bonds, CDS, loans read it)

#### §3.8.1 Physical PD (hourly, per issuer)
- Listed issuer (Merton/KMV approximation): `E` = market cap from marks; `DP` = short-term debt + 0.5 × long-term debt (09 balance sheet); `σ_E` = 60-game-day EWMA realized equity vol; `A = E + D_total`; `σ_A = σ_E · E / A`;
  `DD = (ln(A / DP) + (r − 0.5σ_A²)·1) / σ_A`; `PD_P = N(−DD)` clamped to `[0.0003, 0.60]`.
- Unlisted issuer (player company not listed, NPC private firm): `E = max(1, EV_09 − D_total)`, `σ_E = σ_sector · 1.2`, then as above.
- Bank issuer (`bnk`): `PD_P = max(Merton PD, PD from CET1)`, where `PD_CET1 = 0.0003 · exp(60 · max(0, 0.10 − CET1))` (07 publishes CET1); an IN_RESOLUTION bank has `PD_P = 1`.
- Sovereign: 04 supplies `PD_P` (debt dynamics, rollover, reserves). 06 does not model sovereign solvency.

#### §3.8.2 Spread
```
PD_Q     = N( N⁻¹(PD_P) + λ_mpr ),   λ_mpr = 0.25 + 0.5 · fear           (market price of risk)
h        = −ln(1 − PD_Q)                                                  (hazard per game year)
LGD      = SOVEREIGN 0.60 | SENIOR_SECURED 0.35 | SENIOR_UNSECURED 0.55 | SUBORDINATED 0.75 | AT1 0.90
liq_bps  = clamp( 15 · (1 + 2·fear) · sqrt(500M / max(outstanding, 10M)), 5, 200 )
spread_bps(seniority) = 10,000 · h · LGD + liq_bps
```
Recovery implied by LGD lands inside the 20–60% range of 01 §3.6. Ratings (08) do not enter the formula; they create **cliffs** through rules elsewhere: index eligibility (IG index excludes sub-IG; NPC index funds sell within 5 game days), 07 collateral eligibility, fund mandates (08).

#### §3.8.3 Default is mechanical
A bond defaults only when (a) the issuer fails to pay a coupon or principal by `PARAM.bond_grace_days = 3` game days after the due date (except sovereign issuers, which use 04 §3.12's `PARAM.macro_sov_grace_days = 7`; a CDS FAILURE_TO_PAY on a sovereign reference uses 7 too) because its deposit balance is insufficient (03 posting fails), (b) the issuer files bankruptcy (09), (c) a covenant acceleration (09) is not paid within grace, or (d) for sovereigns, 04 declares a restructuring or moratorium. On default: status DEFAULTED, accrued interest stops, trades flat on DISTRESSED, `recoveryEstimate` set by 09 (corporate) or 04 (sovereign), CDS credit event process starts (§3.17.4). Recovery cash or new instruments are delivered when 09's plan confirms; holders' positions convert at P13.

#### §3.8.4 Callable bonds
Issuer (09) may call on a call date with 5 game days notice; priced with a deterministic lattice (Hull-White one-factor on the bloc `govt` curve, mean reversion 0.05, vol 0.01, 64 steps) for V. Callable bonds are rare (10% of corporate issues by default).

### §3.9 FX

#### §3.9.1 Pairs and quoting
Base currency priority EUN > FDL > NKR > PYN > SRL; the higher-priority currency is the base. Pairs: EUNFDL, EUNNKR, EUNPYN, EUNSRL, FDLNKR, FDLPYN, FDLSRL, NKRPYN, NKRSRL, PYNSRL. The **four legs** are the pairs containing FDL (EUNFDL, FDLNKR, FDLPYN, FDLSRL). Price = units of quote per 1 base. Display 4 decimals (2 for PYN pairs, quote in PYN).

#### §3.9.2 Fundamental for the legs (consumed by 05's return equation)
For a leg `S` (quote per base), with 04 supplying `CPI`, `i` (ONR proxy = policy) per bloc:
```
PPP_fair(t) = PPP_0 · CPI_quote(t) / CPI_base(t)                          (PPP_0 authored in 22)
E[d ln S]   = θ · (ln PPP_fair − ln S) · dt  +  u · (i_quote − i_base) · dt  −  β_risk · Δfear
θ = ln 2 / 1.5 game years;  u = PARAM.macro_fx_uip_share = 0.5 (owned by 04 §3.13; ruling in 24);  β_risk: EUN 0.00, NKR −0.02, PYN +0.01, SRL +0.08 (quote-side signs as for FDLxxx)
V_leg(t) = S(t−1) · exp(E[d ln S])  (05 treats this drift as the fundamental pull; κ is not used for FX legs)
```
`Correction of 01 §3.5`: 01 wrote the drift as the full rate differential, which makes carry earn nothing on average while 01 also says "carry works on average". With `u = 0.30`, a high-yield currency depreciates by only 30% of the differential on average, so carry earns about 70% of it, and pays it back in risk-off jumps (SRL jump intensity `λ = 2 + 6·crowding_SRL` per year, mean down-jump 8%, where `crowding_SRL` = net long SRL open interest in FX futures and forwards ÷ its 1-year average, clamped [0, 3]).
- Crosses are not modelled: `V_cross = V_leg1 · V_leg2` (or ratio), and 05 uses `κ` half-life 1 tick for crosses plus NPC triangular arbitrageurs (§6), so a cross never deviates from its legs by more than its spread plus fees (01 §3.5 "triangular arbitrage impossible by construction").

#### §3.9.3 Forwards (exact covered interest parity)
`F(T) = S · exp((z_quote(T) − z_base(T) + basis(T)) · T)` with `z` = 04's `ois` zero rates and cross-currency basis `basis = −PARAM.xccy_basis_stress_bps(40) · fear² / 10,000` for pairs where FDL is the quote (FDL funding premium in stress), 0 otherwise. Forward points = F − S.

#### §3.9.4 Regimes (owned by 04, enforced here)
04 publishes per currency `regime ∈ {FLOAT, MANAGED, PEG, CONTROLS}` with band and duration. 06 enforces in P1: under CONTROLS, intents that convert the controlled currency into another currency, withdraw it from the bloc, or move assets denominated in it to a wallet outside the bloc are rejected for the control duration (01 crisis table: SRL capital controls 3 days). Peg defence is 04's central bank submitting orders; 06 never clamps prices to a band.

### §3.10 Commodities and physical markets

#### §3.10.1 Commodity definitions (defaults; 22 may rename, 23 lists `PARAM.cmd_<id>_*`)
| Commodity | Unit | Ref price | Normal cover (days) | Elasticity | γ | Storage %/yr | Perish %/yr | σ |
|---|---|---|---|---|---|---|---|---|
| CRUDE | bbl | 75 | 60 | 0.10 | 0.8 | 6 | 0 | 0.35 |
| NATGAS | MMBtu | 3.50 | 45 | 0.15 | 1.2 | 15 | 0 | 0.60 |
| GOLD | oz | 1,900 | 3,000 | 0.30 | 0.2 | 0.15 | 0 | 0.15 |
| SILVER | oz | 24 | 1,000 | 0.30 | 0.3 | 0.5 | 0 | 0.28 |
| COPPER | t | 8,500 | 40 | 0.20 | 0.8 | 2 | 0 | 0.25 |
| LITHIUM | t | 20,000 | 60 | 0.25 | 0.9 | 3 | 0 | 0.45 |
| RARE_EARTH | kg | 60 | 90 | 0.10 | 1.0 | 2 | 0 | 0.40 |
| WHEAT | bu | 6.00 | 120 | 0.20 | 0.7 | 8 | 4 | 0.28 |
| CORN | bu | 5.00 | 100 | 0.25 | 0.7 | 8 | 4 | 0.27 |
| COFFEE | lb | 1.80 | 90 | 0.15 | 0.8 | 6 | 8 | 0.32 |
| COCOA | t | 3,000 | 120 | 0.15 | 0.8 | 6 | 6 | 0.30 |
| LUMBER | mbf | 500 | 30 | 0.30 | 1.0 | 10 | 5 | 0.38 |
| URANIUM | lb | 60 | 720 | 0.05 | 0.5 | 1 | 0 | 0.30 |

Harvest months for AGRI (game months 1–12): WHEAT 7, CORN 9, COFFEE 5, COCOA 10; seasonal amplitude 0.06 (log).

#### §3.10.2 Spot model (01 §3.4, kept and completed)
Per game hour per commodity:
```
demand = base_d · GDP_factor(world, 04) · seasonality(month) · (P / P_ref)^(−elasticity) + player/business demand (09 inputs)
supply = capacity · utilization(P) + shocks (16 events: storm, strike, war, embargo; 09 producer businesses)
utilization(P) = clamp(0.80 + 0.5 · ln(P / cost), 0.5, 1.0)
inventory += (supply − demand) · (1 game hour)
daysCover = inventory / max(demand_daily, ε)
target    = cost · (daysCover / normalCover)^(−γ)          cost = marginal production cost, drifts with energy and wages (04)
V_i (spot) = target                                         05 pulls P toward it with an OU half-life of 20 game days
```

#### §3.10.3 Futures curve (fair value of each futures series)
```
y_conv = storage + η · ln(normalCover / daysCover),   η = PARAM.cmd_conv_eta = 0.5 per year
ln F(T) = ln S + (z_ois_FDL(T) + storage − y_conv) · T + seasonalAmp · cos(2π (m_T − harvestMonth) / 12) − seasonalAmp · cos(2π (m_now − harvestMonth) / 12)
```
Low inventory → large `y_conv` → backwardation; high inventory → contango where holding futures loses the roll (01 §3.4). Futures series V = F(T); 05 pulls each series with κ half-life 5 game days, and NPC cash-and-carry arbitrageurs with storage bound `F − S·e^{(r+storage)T}` from above (§6).

#### §3.10.4 Hubs, basis and warehouse receipts
- 5 hubs (one per bloc; 22 assigns the city). Benchmark hubs: CRUDE NKR, NATGAS FDL, metals FDL, LITHIUM SRL, RARE_EARTH PYN, AGRI FDL, URANIUM NKR.
- Spot at a non-benchmark hub: `P_hub = P_bench + basis_hub`, `basis_hub = shipCost(bench → hub) · (importer ? +1 : −1) + 0.5 · shipCost · clamp(localImbalance, −1, 1)`. `localImbalance` = (hub demand − hub supply) / hub demand from 09/16 regional data. Each non-benchmark hub line is a separate `CommodityAsset` (`ast_CM_<ID>_<HUB>`), created at genesis for hubs with non-zero regional activity.
- Physical spot purchases create a **warehouse receipt** at the hub. Storage fee accrues daily at `storageCostPerYearFrac · value / 364`, paid to the facility owner (an NPC public warehouse at `PARAM.cmd_public_storage_markup = 1.5 ×` base cost, or a player's own storage business from 09 at cost, or another player's at their posted rate). Perishable commodities lose `perishDecayPerYear / 364` of quantity per game day (spoilage), so hoarding coffee is costly.
- Hub storage capacity is finite (`Hub.storageCapacity`); when a hub is 100% full, new physical purchases there are rejected and contango steepens (convenience yield cannot fall further, storage fee rises ×2 at > 95% utilization).

#### §3.10.5 Shipping and delivery
- `mkt.commodity.ship` moves a receipt between hubs: transit time = `routeDays` (2–12 game days, 22 table), cost = `qty · unitWeight · FRX · distanceFactor`. During transit the cargo is a `Shipment` (marked at destination spot minus remaining freight). Loss risk: `PARAM.ship_loss_prob_per_trip = 0.002` per trip, insurable (08); the draw uses `rng('ship', shipmentId)`.
- Freight Index: `FRX = FRX_base · (fleetUtil / 0.80)²`, clamped [0.4, 6] × base, where `fleetUtil` = booked tonnage ÷ fleet capacity (NPC fleet + player shipping-line businesses from 09). Shocks (16: canal closure, war) cut capacity.
- Futures are **cash-settled** against the benchmark hub's closing spot by default. A long holder with storage capacity at the delivery hub may elect physical delivery (`mkt.future.electDelivery`) during the last 3 trading days; the matched short is selected from shorts that hold receipts at the hub, else shorts are assigned by size pro rata and must deliver (buy spot at the hub) or pay a delivery-failure penalty of 5% of value plus the cost of the hub spot purchase executed by the engine for them.

#### §3.10.6 Game-native commodities
- **Compute (GPUh):** spot formula of 01 §3.4.1 (`spot = 0.12 · (u / 0.75)³` clamped [$0.05, $0.60], engine unit PFLOP-day = 10 GPUh). Not storable: a spot unit is "delivery during the next game hour". Reserved contracts = compute futures (monthly, 6 months out, physically delivered as capacity allocations by 11). 11 supplies `D_players` and data-center supply; 06 runs the market.
- **Data (DQU):** storable with freshness decay owned by 11; quality grades are price multipliers (grade A 1.5×, B 1.0×, C 0.6×) on the standard-grade instrument; ref price `PARAM.data_ref_price = $2 per DQU` (`DEFAULT (Mathis may override)`, 11 may retune). Stolen data floods supply (12) and depresses the price.
- **Power (MWh), one market per bloc:** not storable except by battery businesses (09). Each game hour: price = marginal cost of the last unit in the merit-order stack (09 generator businesses + NPC stack from 22) that meets demand (04 aggregate + data centers + 09 businesses), plus scarcity adder `= 200 · max(0, 0.10 − reserveMargin)/0.10` $/MWh. Ref prices: FDL 60, EUN 80, PYN 70, NKR 40, SRL 55.

### §3.11 Crypto

#### §3.11.1 Launch tokens (20; names final in 22)
| Code | Chain | Kind | Notes |
|---|---|---|---|
| AUC Aurum Coin | AURUM | NATIVE | Max supply 18,000,000; issuance halves at each chapter boundary (01 §3.3); block reward to NPC miners |
| LTX Lattice | LATTICE | NATIVE | Smart-contract platform; staking 4%/yr issuance |
| MRD Meridian | MERIDIAN | NATIVE | Second platform; staking 5%/yr; hosts RANGE pools |
| SYN Synapse | LATTICE | UTILITY | Linked to AI-race index (11) |
| GUSD | LATTICE | STABLE_FIAT | Issuer Guardian Trust (NPC); §3.12.6 |
| EUNX | LATTICE | STABLE_FIAT | EUN-pegged, same mechanism |
| VSD Vesta Dollar | LATTICE | STABLE_CDP | §3.12.7 |
| VSG Vesta Governance | LATTICE | GOV | Backstop mint for VSD bad debt |
| MDOL Mirage Dollar | MERIDIAN | STABLE_ALGO | §3.12.8 |
| MSH Mirage Share | MERIDIAN | GOV | Absorbs MDOL volatility |
| FRO Ferro | LATTICE | GOV | Ferro lending protocol |
| TDP Tidepool | LATTICE | GOV | Tidepool AMM |
| QLL Quill | LATTICE | UTILITY | Oracle network |
| ARC Arc | MERIDIAN | GOV | Arc Bridge |
| VXT Vault Token | LATTICE | UTILITY | Exchange token of Vault Exchange (NPC CEX); fee discounts |
| PLT Pallet | MERIDIAN | UTILITY | Payments |
| GRD Gridcoin | LATTICE | UTILITY | Linked to compute and power utilization |
| ORE Ore | LATTICE | WRAPPED | Gold-backed token, 1 ORE = 1 oz in an NPC vault |
| KST Kestrel | MERIDIAN | UTILITY | Fast payments |
| SBL Sable | LATTICE | UTILITY | Gaming/media tokens theme |

Wrapped AUC (`wAUC`) on Lattice via the NPC custodian Keystone is rule-created (not counted).

#### §3.11.2 Fundamental values
```
V_AUC = PARAM.auc_v0 · (S2F_t / S2F_0)^0.5 · (1 + 0.5·adoption_t)        S2F = supply / annual issuance; adoption = active wallets index (16 + players)
V_LTX, V_MRD = v0 · (A_t / A_0)^0.8                                      A = 7-game-day EWMA of on-chain ops (players + NPC) on that chain
V_SYN = v0 · (AIrace_t / AIrace_0)^1.0                                   (11)
V_GRD = v0 · (compute_util_t · power_util_t)^0.7 / norm
V_GOV = (annualized protocol fee revenue × 12) / circulating supply      FRO, TDP, ARC, QLL, VSG, MSH (MSH also §3.12.8)
V_VXT = (Vault Exchange 91-day fee revenue × 4 × 0.3 burn share × 15) / supply
V_ORE = gold spot; stables: peg value × solvency ratio (§3.12.6–8)
```
Pull half-life 120 game days (01) except stables and ORE (1 game day). Crypto factor beta 0.7–1.3 (05).

#### §3.11.3 Hype
Per token, per game hour (01 §3.3, completed):
```
dH = a · (m + f − H) · dt_h − b · H · dt_h + shock
m  = normalized social mentions (16 Wire mentions of the token, 0–1)
f  = clamp(net player buy volume over 24 game hours / circulating market cap · 20, 0, 1)
a = 0.15 /game hour, b = 0.03 /game hour (MEME: b = 0.06), shock from news templates (16) and Media-business campaigns (09)
drift_bonus = c · H with c = 0.5 /game year (MEME 3.0);  vol_multiplier = 1 + 2H   (05 applies)
```
Campaigns that raise hype while the campaigner holds the token are a surveillance signal (05 score, 13 sanction).

#### §3.11.4 Meme coins (NPC-spawned)
- Spawn: Poisson with rate `PARAM.meme_spawn_per_game_week = 2` (01), RNG `rng('meme', tick)`. Each spawn: name from 22 generator, supply 10⁹–10¹², NPC launcher seeds a Tidepool pool with `U($20k, $200k)` of LTX and 50% of supply, H₀ = 0.6.
- NPC launcher behaviour: sells its remaining allocation into rallies at `20%` of hourly pool volume while H > 0.4; abandons the project with probability 0.5 when H < 0.15 (stops all activity). These are NPC actions; NPCs are not prosecuted (16).
- Death: pool liquidity < $1,000 for 7 game days → `DELISTED` from discovery; tokens remain in wallets, marked at 0. The calibration target "90% go to ~0 within a chapter" (01) is a 20 balance band, not a hard rule.

#### §3.11.5 Chains, wallets, gas, block order
- One block per chain per tick, executed in P6 after the batch auctions. Capacity `opsPerBlock`: AURUM 500 (transfers only), LATTICE 2,000, MERIDIAN 3,000.
- **Ordering rule (no MEV auction):** the block's ops are ordered by `hash(tickEntropy, intentId)`. There are no priority fees and no way to buy position. Ops beyond capacity queue to the next block in the same hash order (congestion is real in a crash).
- Gas: each op pays `baseFee` in the native token; `baseFee_next = baseFee · (1 + 0.125 · (opsUsed / targetOps − 1))`, `targetOps = 0.5 · opsPerBlock`, floor 0.0001 native units. Gas is burned (token supply sink; no FDL flow).
- Staking issuance (LTX, MRD) mints tokens daily to stakers (`mkt.defi.stake`), reason `CRY_TOKEN_MINT` (03; token quantity only, it creates no FDL).
- Exchange custody vs self-custody: tokens on Vault Exchange are a claim on that NPC exchange's balance sheet (16 owns its behaviour). If Vault Exchange becomes insolvent (its assets < customer liabilities, e.g. after VXT collapse or a hack in 12), withdrawals freeze and claims recover pro rata from its assets (01 "crypto winter: exchange collapse" emerges from this). Self-custody wallets carry 12's attack risk instead.

### §3.12 DeFi

#### §3.12.1 Protocols at launch (all NPC-operated, fictional)
Lattice: **Tidepool** (CONSTANT_PRODUCT pools, fee 0.30%; STABLESWAP pools, fee 0.04%, A = 100), **Ferro** (lending), **Vesta** (CDP stablecoin), **Quill** (oracle). Meridian: **Cascade** (RANGE pools, fee tiers 0.05%, 0.30%, 1.00%), **Harbor** (lending), **Mirage** (algorithmic stable). **Arc Bridge** (Lattice ↔ Meridian), **Keystone** custodial wrapper (AUC → wAUC). 22 lists the 24 launch pools (pairs and seed reserves).

#### §3.12.2 Constant-product and stableswap pools
- Swap `in` of A for B: `in' = in · (1 − fee)`; `out = reserveB · in' / (reserveA + in')`. Reject if `out < minOut`. Fee stays in reserves except `protocolFeeShare = 1/6` to the protocol treasury.
- Add liquidity proportional: `minted = min(dA/reserveA, dB/reserveB) · lpSupply`; excess returned. Remove: pro rata.
- Stableswap invariant (n = 2): `A·n^n·Σx + D = A·D·n^n + D^{n+1} / (n^n · Πx)`; solve D and output by Newton (max 64 iterations, deterministic).
- LP token value (mark) = `(reserveA · mark_A + reserveB · mark_B) / lpSupply`. Impermanent loss shown on the LP screen: `IL(r) = 2√r / (1 + r) − 1`, r = price ratio change since deposit.
- TWAP accumulator `cumulative += price · Δticks` updated at the first op of each block.

#### §3.12.3 Range pools (Cascade)
- A position supplies liquidity `L` on `[p_a, p_b]`; virtual reserves while price `p` inside: `x = L(1/√p − 1/√p_b)`, `y = L(√p − √p_a)`.
- Swap within the active range moves `√p` by `Δ√p = Δy / L` (or `Δ(1/√p) = Δx / L`); when `√p` crosses a range boundary, the engine updates `activeLiquidity` by adding or removing that position's `L` and continues the swap with the remaining input. Boundaries are processed in price order; at most 256 boundary crossings per swap (excess input refunded).
- Fees accrue to positions in proportion to `L` while active (`feeGrowthGlobal` accounting as in standard range AMMs).

#### §3.12.4 Lending protocols (Ferro, Harbor)
```
U       = totalBorrowed / max(totalSupplied, 1)
r_b     = base + slope1 · U / kink                          if U ≤ kink
        = base + slope1 + slope2 · (U − kink) / (1 − kink)  otherwise
r_s     = r_b · U · (1 − reserveFactor)
defaults: base 0, slope1 0.04, slope2 0.75, kink 0.80, reserveFactor 0.10 (stables: slope2 0.60, kink 0.90)
indices compound per block: borrowIndex *= (1 + r_b / TICKS_PER_GAME_YEAR)
HF      = Σ_c collateral_c · oracle_c · LT_c / Σ_d debt_d · oracle_d
```
| Asset | Collateral factor | Liquidation threshold | Bonus |
|---|---|---|---|
| AUC / wAUC | 0.70 | 0.75 | 0.08 |
| LTX, MRD | 0.65 | 0.70 | 0.08 |
| GUSD, EUNX, VSD | 0.85 | 0.88 | 0.04 |
| MDOL | 0.50 | 0.60 | 0.10 |
| ORE | 0.70 | 0.75 | 0.06 |
| Other GOV/UTILITY in launch list | 0.40 | 0.50 | 0.12 |
| MEME, LP tokens | 0 (not collateral) | — | — |

- Borrow allowed only if post-borrow HF ≥ 1.0 using collateral factors (not thresholds).
- **Liquidation (keepers):** when HF < 1, any LIC2 account may submit `mkt.defi.liquidate` repaying up to `closeFactor = 0.5` of one debt and receiving collateral worth `repay · (1 + bonus)` at the oracle price. NPC keepers (§6) liquidate any position with HF < 1 at the first block where profit after gas > $50, so player keepers compete on the same deterministic block order (liquidation sniping is a legitimate, priced activity).
- Bad debt (collateral < debt after liquidation) is absorbed by protocol reserves, then socialized across suppliers of that market via a supply-index write-down (PUBLIC event).

#### §3.12.5 Oracles (Quill)
`oracle(i) = median(CEX 30-tick TWAP of batch clearing prices, AMM 30-tick TWAP of the deepest pool, last oracle)`; if `|CEX − AMM| / CEX > 5%`, use CEX TWAP alone; if no CEX price exists in 30 ticks, use AMM TWAP with a staleness flag; if both stale for 60 ticks, `stale = true` and lending protocols pause new borrows against that asset (liquidations continue at the last price). Manipulating a 30-tick TWAP requires holding a distorted price for 30 ticks against NPC arbitrage (§6), which is expensive and visible (surveillance).

#### §3.12.6 Fiat-reserve stablecoins (GUSD, EUNX)
- Reserves (DEFAULT composition): 60% government bills of the peg currency, 30% deposits at one named NPC bank (22), 10% overnight repo (07).
- Mint/redeem at 1.00 ± `0.10%` fee for LIC2+, processed at day close; redemptions capped at `10%` of supply per game day (queue beyond).
- Solvency ratio `ρ = reserves marked / supply`. If the reserve bank fails (07 §3.10), its uninsured deposits haircut flows into `ρ`. Status: PEGGED if ρ ≥ 0.995 and secondary price within 0.5%; STRESSED otherwise; DEPEGGED if secondary < 0.97 for 30 ticks; DEFUNCT if issuer winds down (16). Secondary price is the CEX/AMM market; V = min(1, ρ) × peg. This replaces 01's fixed "P ≈ 0.3/season depeg" with a caused one; 16 may still fire an "attestation doubt" news shock that raises redemption demand.

#### §3.12.7 CDP stablecoin (Vesta, VSD)
- Open vault with LTX, AUC/wAUC or ORE; mint VSD up to `collateral · oracle / MCR`, `MCR = 1.50`.
- Stability fee `2%–8%`/yr, set daily by Vesta governance (NPC): `fee = 0.04 + 2 · (1 − VSD_price)` clamped, so a below-peg VSD raises the fee.
- Liquidation when collateral ratio < MCR: Dutch auction of collateral over 60 ticks, start price `1.2 · oracle`, linear to `0.8 · oracle`; bids `mkt.defi.auctionBid` buy collateral for VSD; penalty 13% of debt to protocol surplus. Unsold collateral at auction end → bad debt.
- Bad debt: covered by surplus, then by minting and auctioning VSG (dilution of governance holders).
- Peg Stability Module: swap GUSD ↔ VSD 1:1 with 0.1% fee up to a cap of 25% of VSD supply. A GUSD depeg therefore transmits into VSD (contagion by rule).

#### §3.12.8 Algorithmic stablecoin (Mirage, MDOL/MSH)
- Protocol always lets anyone redeem 1 MDOL for $1 worth of MSH (minted at MSH oracle price) and mint 1 MDOL by burning $1 of MSH, limited to `PARAM.mirage_redeem_cap_per_tick = 0.2%` of MDOL supply per tick (rate-limited mint/burn), fee 0.5%.
- No external reserves. `V_MDOL = min(1, MSH market cap / MDOL supply)` × peg as the fundamental. When MDOL trades below 1, arbitrageurs redeem → MSH supply rises → MSH price falls → the ratio falls further: a death spiral can emerge when confidence (MSH demand from hype H and yield) fails. Nothing scripts it; balance bands in 20 check its frequency.
- Mirage pays a 12%/yr "savings rate" on staked MDOL from MSH issuance (the attraction that grows it in booms).

#### §3.12.9 Bridges and wrapped assets
- Arc Bridge: lock token on source chain, mint wrapped on destination after `transferTicks = 10`, fee 0.10%. Invariant: `wrappedSupply ≤ locked`.
- If 12 resolves a successful attack on the bridge (abstract op), the drained amount is removed from `locked`; status IMPAIRED; `recoveryRatio = locked / wrappedSupply`; wrapped token V = recoveryRatio × underlying; redemptions pro rata; PAUSED for `PARAM.bridge_pause_ticks = 720` after any impairment.
- Keystone (custodial wAUC): an NPC custodian balance sheet; same IMPAIRED logic if 12 or 16 events hit it.

#### §3.12.10 NPC arbitrage between venues
Every block, an NPC arbitrageur per (token, CEX, pool) trades the pool toward the CEX mid when `|pool − CEX| / CEX > fee_pool + fee_CEX + 0.10%`, with capacity `PARAM.npc_defi_arb_cap = $250k` per pool per tick (scaled by `N_a`, 01 §14.1). Gaps larger than capacity persist for several ticks, which is where players can arbitrage.

#### §3.12.11 No atomic composition
Each DeFi intent is one operation. There are **no bundles and no flash loans**: an intent cannot borrow and repay inside the same op. Multi-step strategies take several ops across ticks and carry price risk between them. This closes the flash-loan exploit class by construction.

### §3.13 Options

#### §3.13.1 Optionable underlyings and listing grid
| Underlying set | Style / settlement | Multiplier | Clearing |
|---|---|---|---|
| GX100, FED30, EUR30, PAC30, NOR30, SOU30 | European, cash | 10 × index | CCP_LD |
| Top 40 equities by free-float cap (re-selected quarterly; existing series stay until expiry) | American, physical | 100 shares | CCP_LD |
| ETFs: GX100, gold, HY bond, CRX10 | European, cash | 100 | CCP_LD |
| Futures: CRUDE, NATGAS, GOLD, COPPER, CORN front 3 contracts | American on the future, physical into the future | 1 future | CCP_LD |
| FX legs: EUNFDL, FDLPYN, FDLSRL, FDLNKR | European, cash | 100,000 base | CCP_LD |
| Crypto: AUC, LTX | European, cash (TWAP) | 1 token | CCP_CRY |

Expiries (all at the closing auction t = 540 of the game Friday, except crypto at t = 719):
- weeklies: next 4 Fridays; monthlies: last Friday of the next 3 game months; quarterlies: next 4 quarter-end Fridays; annuals: next 2 game-year-end Fridays.
- crypto: next 3 game days (t = 719) + the weeklies.

Strikes: `step = spot · {weekly 1%, monthly 2.5%, quarterly/annual 5%}` rounded to a "nice" number (1, 2, 2.5, 5 × 10^k); range ±10% (weekly), ±25% (monthly), ±50% (quarterly/annual) around spot at listing; at each trading day open the grid is extended so that at least 5 strikes exist on each side of spot. Strikes are never removed while open interest exists.

#### §3.13.2 Pricing
- European: Black-Scholes on spot for equity/index/ETF with continuous dividend yield `q` (09 projected dividends ÷ price); Black-76 on futures; Garman-Kohlhagen on FX with `ois` rates of both currencies.
- American: Cox-Ross-Rubinstein binomial, `PARAM.opt_crr_steps = 128`, discrete dividends from 09's declared schedule (escrowed-dividend method); early exercise checked at each node.
- `T` in game years = (expiryTick − t) / 262,080. At `T ≤ 30 ticks` the price = intrinsic + `0.5 · vega · ΔIV` floor of one tick (no singularities).
- Greeks (delta, gamma, vega, theta, rho) computed analytically (BS) or by finite difference on the CRR tree, **on demand only** (01 §13 budget rule), cached per series for 30 ticks.

#### §3.13.3 Implied volatility surface (per underlying)
```
σ_now  = current GARCH vol (05) annualized;  σ_LR = long-run vol (PriceParams.sigmaAnnual × factor-implied)
k_mr   = −ln(α + β) · TICKS_PER_GAME_YEAR       (GARCH mean reversion speed)
σ_atm(T) = sqrt( σ_LR² + (σ_now² − σ_LR²) · (1 − e^{−k_mr T}) / (k_mr T) ) · (1 + vrp)
vrp    = equities 0.10 + 0.25·fear;  FX 0.05;  commodities 0.08 + 0.10·fear;  crypto 0.15
x      = ln(K / F)
σ(x,T) = σ_atm(T) · (1 + skew(T) · x + curv · x²) · (1 + χ · dealerNetVega / vegaCapacity)
skew(T) = skew0 · (1 + fear) / sqrt(max(T, 1/52) / 0.25)
skew0: index −0.9, single stock −0.6, FX legs −0.1 (FDLSRL +0.4: SRL weakness), gold +0.2, crude −0.2, crypto −0.2 + 0.6·H
curv = 1.5;  χ = PARAM.opt_dealer_vega_chi = 0.3 (clamped ±30%)
σ clamped to [0.3·σ_atm, 4·σ_atm]
```
Arbitrage guards applied each time a surface is evaluated on the strike grid: (1) total variance `σ²T` non-decreasing in T at fixed x (if violated, raise the shorter tenor); (2) call prices convex and decreasing in K (if violated, reduce |skew| in 10% steps until fixed). NPC dealer quote: mid = model price; half-spread = `max(1 tick, vega · (0.5 vol pt + 0.02·σ))`, widened ×(1 + 2·fear) and ×2 for T < 1 game day.
`dealerNetVega` is the aggregate NPC dealer vega inventory on that underlying; when players net buy options, dealers are short vega and implied vol rises, which raises GXV (§3.5.3) and, through realized volatility and 04's inputs, can feed F. That is the emergent link from option demand to fear.
**Anchor to 04:** for GX100 the 30-game-day ATM vol is floored at 04's anchor `IV_ATM,GX = 0.10 + 0.004·F` (04 §3.14.1); other underlyings' `σ_atm` are floored at that anchor × `σ_LR,u / σ_LR,GX`. The GARCH-based formula above applies when it is higher.

#### §3.13.4 Exercise, assignment, expiry
- American exercise: `mkt.option.exercise` any trading day; processed at t = 719 of that day: holder pays strike × multiplier × qty and receives the underlying (calls) or the reverse (puts). Requires sufficient cash or shares (or margin capacity, 07); otherwise rejected at P1.
- **Automatic exercise at expiry** if in the money by ≥ 1 tick at the settlement price, unless the holder submitted `mkt.option.doNotExercise` before t = 540.
- Assignment to writers: pro rata by short position size; integer remainders assigned in order of `hash(tickEntropy, accountId)` (deterministic, no favouritism).
- Cash settlement price (SOQ): the expiry-day closing auction price of the underlying (indices: the index computed from closing auction prices); crypto: 30-tick TWAP of the CRX/CEX price over t = 690–719.
- A halted underlying at expiry: settle on the last mark (§3.3.3).

#### §3.13.5 Corporate-action adjustments
Splits: strike ÷ ratio, multiplier × ratio. Special dividends > 10% of price: strike − dividend. Mergers: deliverable becomes the consideration package. Spin-off: deliverable becomes 100 parent + spin-off shares per contract. All adjusted series set `adjusted = true` and keep their id; no new strikes are listed on an adjusted series.

#### §3.13.6 Dealer hedging feedback
NPC dealers (§6) hedge their net delta each tick in P4: hedge order = `−(Δ_dealer − Δ_target)` with `Δ_target = 0`, capped at `PARAM.opt_dealer_hedge_participation = 0.10` of the tick's expected volume. Dealer short gamma (players long calls) makes dealers buy as price rises: gamma squeezes and expiry pinning emerge, they are not scripted (01 §3.7).

### §3.14 Futures

#### §3.14.1 Listed futures
| Product | Series | Multiplier | Settlement | Session |
|---|---|---|---|---|
| Index futures: GX100 + 5 regional | Next 4 quarterly | 50 × index | Cash on expiry closing auction | EQUITY + FUT24 overnight |
| Rate futures per bloc ("ONR-3M") | Next 8 quarterly | price = 100 − average ONR over the 91-game-day reference quarter; 1 bp = $25 per contract | Cash | FUT24 |
| Government bond futures per bloc ("10Y notional") | Next 2 quarterly | 100,000 face of a notional 6% 10y bond | Cash: notional bond priced off `govt` at expiry close (`DEFAULT`: no cheapest-to-deliver basket) | FUT24 |
| Commodity futures (13 physical) | Energy and metals: monthly next 12; AGRI: months 3, 5, 7, 9, 12 for 2 years | Standard sizes in 22 (e.g. CRUDE 1,000 bbl) | Cash at benchmark hub, physical elective (§3.10.5) | FUT24 |
| Compute (reserved capacity) | Monthly next 6 | 10,000 GPUh | Physical (capacity allocation via 11) | FUT24 |
| Power, per bloc | Monthly next 6 | 100 MWh over the month's game hours | Cash vs average hourly price | FUT24 |
| FX futures, 4 legs | Next 4 quarterly | 100,000 base | Cash | FUT24 |
| Crypto futures: AUC, LTX | Next 3 quarterly | 1 token | Cash (TWAP) | CRYPTO |

#### §3.14.2 Fair value (V for 05)
Index: `F = S · e^{(z_ois − q)T}` (q from projected dividends); rate: `F = 100 − 100 · fwdAvg(ois, quarter)`; bond: notional price from the `govt` forward curve; commodity §3.10.3; FX §3.9.3; crypto: `F = S · e^{(z_ois_FDL + crypto_basis)T}` with `crypto_basis = 0.5·H` (hype raises contango). Each series is pulled with κ half-life 5 game days (rate and FX: 1 game day) and arbitraged by NPC basis traders (§6).

#### §3.14.3 Daily settlement
The daily settlement price is the closing auction price at t = 540 for EQUITY-session products, and the 30-tick VWAP over t = 690–719 for FUT24/CRYPTO products (if no trades: the fair value). Variation margin itself is 07's (it marks every tick); the daily settlement price fixes P&L for statements and is the reference for expiry.

#### §3.14.4 Last trading and expiry
Index, FX, bond, crypto: last trade = expiry tick. Monthly commodity contracts: last trade = close of the 3rd trading day before the delivery month; delivery elections during the last 3 trading days; open positions after last trade settle in cash at the benchmark spot close. Rate futures: last trade = the start of the reference quarter + 91 game days; final settlement uses realized ONR fixings (07 §3.7.4).

#### §3.14.5 Position limits (anti-corner)
- Spot month (last 10 trading days before last trade): net position per beneficial-owner group ≤ `PARAM.fut_spot_month_limit_frac = 0.10` of the deliverable supply at the benchmark hub (inventory there at the start of the spot month).
- All months: ≤ 25% of total open interest of that product, or $50M notional, whichever is larger.
- Compute futures: ≤ 10% of the next month's world supply (01 §9 compute-corner counter).
Exceeding orders are rejected at P1; positions that exceed a limit because open interest fell must be reduced within 1 game day or 07 liquidates the excess.

### §3.15 Perpetual swaps
- Underlyings (CCP_CRY): AUC, LTX, MRD, SYN, FRO, TDP, QLL, ARC, KST, GRD, and ORE (gold proxy). Leverage caps: LIC3 10×, LIC4 20× (01 §3.7); 07 sets IM/MM.
- `indexPrice` = median of (CEX batch clearing price, CEX 30-tick TWAP, Quill oracle), recomputed each tick.
- `premium(t) = (perpMid(t) − indexPrice(t)) / indexPrice(t)`, accumulated per tick; at each funding tick (every `fundingIntervalTicks = 240`, i.e. every 8 game hours at t = 0, 240, 480):
```
P̄       = mean premium over the interval
interest = 0.0001 per interval
rate     = clamp( P̄ + clamp(interest − P̄, −0.0005, 0.0005), −0.001, 0.001 )     (±0.1% per 8h, 01 §3.7)
payment  = position notional at markPrice × rate      (rate > 0: longs pay shorts)
```
Funding is a TRANSFER between position holders, netted through the CCP_CRY service (03 reason `DRV_PERP_FUNDING`).
- `markPrice = indexPrice · (1 + EMA_60ticks(premium))`; liquidations (07) and unrealized P&L use the mark, never the last print.
- Open-interest cap per perp: `PARAM.perp_oi_cap_frac_of_spot_mcap = 0.25` of the underlying's free-float market cap; new opening orders beyond it are rejected.

### §3.16 Swaps (OTC, via RFQ)

#### §3.16.1 Floating index
ONR, per bloc: the daily volume-weighted overnight interbank rate published by 07 §3.7.4 at t = 719. Compounded ONR over a period = `Π(1 + ONR_d / 364) − 1`.

#### §3.16.2 Products
| Kind | Definition | Standard tenors | Clearing |
|---|---|---|---|
| OIS | Fixed vs compounded ONR, quarterly payments (91 game days) | 1, 2, 5, 10, 30 game years | CCP_OTC |
| ZCIS | Pays `CPI_T / CPI_0 − 1` vs `(1 + K)^T − 1` at maturity | 2, 5, 10 | CCP_OTC |
| FX_FWD | Exchange at forward rate on a date | 1 week to 2 game years | CCP_OTC (4 legs), BILATERAL (crosses) |
| FX_SWAP | Near spot leg + far forward leg | same | CCP_OTC |
| XCCY | Floating ONR vs floating ONR in two currencies + basis, notional exchange at both ends | 1–10 | BILATERAL |
| TRS | Total return of a reference asset/index vs ONR + spread, monthly reset | 1 game month to 2 game years | BILATERAL (CSA) |
| COMMODITY_SWAP | Fixed vs average daily spot over each game month | 1–24 game months | CCP_OTC |

#### §3.16.3 Fair rates
- OIS par rate: `K = (1 − DF(T)) / Σ τ_k DF(t_k)` with `DF = e^{−ois(t)·t}`. The swap spread vs government bonds emerges as `K − govt par yield` (negative in stress when banks dump bonds).
- ZCIS fair `K`: `(1 + K)^T = E[CPI_T / CPI_0]` from 04's inflation expectation curve, plus an inflation risk premium `0.002 · T^0.5`.
- TRS spread: dealer funding cost = `ONR + PARAM.trs_dealer_spread_bps(50) · (1 + 2·fear)` plus the asset's borrow fee if the dealer hedges a short.
- Commodity swap fixed: average of the futures curve over the period.

#### §3.16.4 Valuation
PV recomputed every game hour (t mod 30 == 0) and on demand; between, PV is linearly projected by DV01 × curve move for margin purposes (07 recomputes risk-based IM hourly). Discounting at `ois` of the payment currency.

#### §3.16.5 Termination and novation
Unwind by RFQ (dealer quotes the PV ± spread). Novation to a third party requires the remaining party's consent unless cleared (cleared trades can be closed by an offsetting trade at the CCP, which nets).

### §3.17 Credit default swaps

#### §3.17.1 Reference entities and standard terms
- Single-name CDS exist on every issuer with ≥ $100M of bonds outstanding (corporates, NPC banks, player companies that issued bonds, the 5 sovereigns). Reference obligation: the issuer's most liquid senior unsecured bond (sovereign: the 10y).
- Standard coupons 100 bps (IG at listing) or 500 bps (HY), paid quarterly on quarter-end Fridays at t = 719; standard maturities 1, 3, 5, 7, 10 game years, rolling at quarter ends. The upfront makes up the difference between the coupon and the fair spread.
- Index: **GX Credit 40** = 40 most liquid corporate reference entities, equal weight, 5-year, new series every 2 game quarters; a credit event removes the name with a payout of `notional/40 · (1 − R)`. Tranches of the index are 08's.

#### §3.17.2 Pricing
Flat hazard from the fair spread `s_fair` (from §3.8.2 without the liquidity premium, plus a CDS-bond basis `b ~ OU(0, 15 bps)`, RNG stream per entity): `h = s_fair / (1 − R)`, `R = 0.40` standard. Premium leg `PV_prem = c · Σ τ_k e^{−(r+h) t_k}` (+ accrued on default), protection leg `PV_prot = (1 − R) · ∫ h e^{−(r+h)t} dt` (closed form). Upfront (paid by buyer) = `PV_prot − PV_prem(c)`. Marks hourly.

#### §3.17.3 Who may trade
Buy protection: LIC3; sell protection: LIC4; both cleared at CCP_CDS. Naked protection is allowed (it is how a credit view is expressed), subject to §3.17.6.

#### §3.17.4 Credit events
- Types: BANKRUPTCY (09 filing), FAILURE_TO_PAY (§3.8.3 beyond grace, ≥ $1M), RESTRUCTURING (sovereigns and banks: a distressed exchange or bail-in that reduces principal or coupon, 04/07), GOVERNMENTAL_INTERVENTION (bank resolution under 07 §3.10).
- Determination: the NPC **Credit Determinations Committee** applies these definitions mechanically to the event log and publishes the determination at t = 719 of the event day (PUBLIC). There is no discretion and no vote that a player can influence (bribing it is impossible because it is an engine rule; 12/13 may still prosecute attempts as fraud).
- Settlement auction: 2 game days after determination, the final price `R_final` = 30-tick VWAP of the reference obligation on the DISTRESSED venue over t = 270–299 plus its DISTRESSED call auction at t = 300; if no trade, 09's (or 04's) recovery estimate. Protection sellers pay `notional · (1 − R_final)` to buyers at P13 of the auction tick; all contracts on the entity are SETTLED.

#### §3.17.5 Succession
Merger of the reference entity: contracts follow the successor (the entity assuming ≥ 75% of the bonds); split ≥ 25% to several successors: contracts split pro rata.

#### §3.17.6 Insider rule (empty-creditor counter)
A beneficial-owner group that controls (≥ 20%, 09) the reference entity, or that is its clearing member or lender of last resort, cannot buy protection on it (rejected at P1). If any protection buyer becomes a controller later, its protection is frozen (no payout) pending a 13 review if a credit event occurs while it controls.

### §3.18 Collectibles

#### §3.18.1 Category index
Per category, at day close:
```
Δln I_c = a_c · g_top1 + b_c · g_prestige + F_c + σ_c · ε / sqrt(364)
g_top1     = daily log growth of top-1% player real NW (15 aggregates)
g_prestige = daily log growth of total Prestige spending, trailing 28 game days (14)
F_c        : fashion cycle, OU with half-life 182 game days, stationary sd 0.15
defaults (a, b, σ): WATCH (0.6, 0.4, 0.12), ART (0.8, 0.3, 0.10), CLASSIC_CAR (0.5, 0.3, 0.12), WINE (0.3, 0.2, 0.08),
                    SNEAKER (0.4, 0.8, 0.30), JEWEL (0.5, 0.3, 0.08), RARE_BOOK (0.3, 0.1, 0.06), MEMORABILIA (0.4, 0.5, 0.20)
```

#### §3.18.2 Item value (appraisal)
```
MASS:      V = price_new · (1 − d0) · e^{−d1 · ageYears} · cond(c)          d0 ∈ [0.10, 0.40] by item (01 §3.10), d1 = 0.08
LIMITED:   V = baseValue · rarity · (I_c(t) / I_c(issue)) · cond(c) · prov
UNIQUE:    same as LIMITED with rarity ≥ 3 and heritage bonus × (1 + 0.02 · ageYears, cap 1.5) (14 heritage growth)
cond(c)  = 0.4 + 0.6 · (c / 100)^1.5
prov     = 1.0 verified chain; 0.6 if any link UNVERIFIED; 0.0 tradeable value at a reputable house if STOLEN
```
Condition decays `conditionDecayPerYear` (ART 0.5, WINE 0 if VAULT else 4, CLASSIC_CAR 3 unless serviced via 14, SNEAKER 5, others 1) and is restored by 14's maintenance actions.

#### §3.18.3 Auctions (house: Halberd & Vane, NPC; player auction houses from 09 use the same engine)
- Each category holds one sale per game week (Saturday for ART/WATCH/CLASSIC_CAR, Sunday for others); lots close in sequence, one every 10 ticks from t = 120.
- Consignment `mkt.collect.consign` up to 1 game day before the sale; reserve ≤ high estimate; estimates = appraisal × (0.85, 1.15).
- Bidding `mkt.collect.bid`: a bid is valid if ≥ max(reserve, highBid × 1.05) and the bidder's available cash ≥ bid × 1.15 (held in P1 until outbid). Highest valid bid at the end of a tick stands; ties by earlier seal order, then hash.
- Soft close: a new high bid in the last 30 ticks extends `closeTick` by 30 ticks, at most 10 extensions.
- Fees (01 §3.10): buyer premium 15% and seller fee 12% to the house; for the NPC house these are SINK (`COLL_AUCTION_FEE`). Player houses keep fees (TRANSFER).
- NPC collectors (16): per lot, a deterministic set of `n = 2 + round(4 · I_c / I_c,0 · (1 − fear))` NPC bidders with private valuations `appraisal · U(0.85, 1.20)`, budget-limited by 16's NPC wealth, bid in increments up to their valuation.
- Results PUBLIC (item, price); buyer and seller shown only by rotating label unless they opt in (L11). Prestige (14) for the buyer is computed by 14.

#### §3.18.4 Dealer and private sales
Instant dealer sale `mkt.collect.sellToDealer`: LIMITED/UNIQUE at 70% of appraisal, MASS at 90% of V (01 15% NPC haircut spirit). Private sales between players use 15's contract engine (2% P2P tax, off-market flag at > 10% from appraisal).

#### §3.18.5 Storage, insurance, collateral
Storage fee per year: VAULT `storageFeePerYearFrac` (ART 0.5%, WINE 1%, CLASSIC_CAR 2%, others 0.5%) to the vault operator; HOME storage free but raises 12 physical-intrusion exposure and condition decay. Insurance is 08's. LIMITED/UNIQUE items are pledgeable for loans at 50% LTV of appraisal (07 §3.4).

### §3.19 OTC: RFQ protocol and block desk

#### §3.19.1 RFQ (P6 owner: this module)
1. `mkt.rfq.request` at tick N: instrument spec (any SWAP, CDS, bilateral FX, block of a listed asset ≥ 5× its average trade size, collectible private sale is not RFQ), side, size, dealer list (≤ 5 named dealers or ALL).
2. NPC dealers respond in P6 of tick N with `price = modelMid ± (baseSpread + impactCoef · σ · sqrt(size / ADV_equiv))`, `impactCoef = 0.8` (05's Y), widened ×(1 + 2·fear) and by the requester's credit tier (07 credit grade: AAA +0, … CCC +40%); dealers decline if size > their risk capacity (16).
3. Player dealers (LIC4 with dealer flag) see the request at tick N+1 (rotating requester label, credit tier only, L11) and may quote until N+3.
4. Requester accepts any live quote by `mkt.rfq.accept` (validity 3 ticks); the trade executes at P6 of the next tick, is novated (CCP_OTC/CDS) or booked under the CSA (BILATERAL) in P7, and settles in P13.
5. Best-quote price and size of every filled RFQ in cleared products are PUBLIC after 30 ticks without identities (post-trade transparency).

#### §3.19.2 Block desk (ROADMAP N11)
Two LIC4 players may cross a negotiated block of a listed equity or ETF at the closing-auction price: `mkt.block.propose` before t = 530; counterparty accepts before t = 539; the block crosses at the closing auction clearing price (it does not participate in price formation). Filing: asset, size and price are PUBLIC 1 game day later (720 ticks); identities are disclosed only if a 15 filing threshold applies (e.g. crossing 5%). Off-market blocks are impossible because the price is the auction price.

### §3.20 Player-launched tokens (specified in full, disabled at launch)
`PARAM.player_tokens_enabled = false` at launch, honouring L10 ("player-launched tokens later"); turning it on is a 21 live-ops switch, no code change.
- Eligibility: LIC4, rank ≥ R4, no S4+ conviction in 8 real weeks, account ≥ 30 real days.
- Launch fee `PARAM.token_launch_fee = $5M` (SINK); mandatory locked liquidity ≥ `$2M` FDL equivalent paired in a Tidepool pool, locked by the protocol for 28 game days (cannot be withdrawn: a classic "rug" of pool liquidity is impossible by construction); creator allocation ≤ 20% of supply, linear vesting over 91 game days; disclosure page (supply, allocation, vesting, use of funds) PUBLIC.
- Surveillance (05, 13): creator or linked accounts selling vested tokens within 2 game days of a promotion they paid for is a manipulation signal; selling after false claims is S5. Tokens lose LISTED status after 7 game days with < $1,000 liquidity.

### §3.21 Price parameter defaults per class (consumed by 05)
| Class | κ half-life (game days) | σ annual | ν | Jumps/yr | Down/Up mean | Base spread |
|---|---|---|---|---|---|---|
| Equity large cap | 20 | sector × 0.8 | 4 | sector table | 6% / 4% | 2 bps |
| Equity small cap | 60 | sector × 1.4 | 4 | sector + 2 | 8% / 6% | 25 bps |
| ETF | (follows NAV; arbitraged) | — | — | — | — | 2–10 bps |
| Government bond | 2 | 0.01 | 6 | 0.2 | 0.5% / 0.5% | 1 bp (price) |
| Corporate bond | 3 | 0.02 IG / 0.06 HY | 4 | 1 (PD-scaled) | 3% / 1% | 10 bps IG / 40 HY |
| FX legs | (FX model §3.9.2) | EUN 0.08, NKR 0.09, PYN 0.10, SRL 0.18 | 5 | 2 (SRL dynamic) | 3% / 2% (SRL 8% / 4%) | 1 bp majors, 5 bps SRL |
| Commodity spot | 20 (OU to target) | table §3.10.1 | 4 | 3 | 8% / 10% (supply shocks up) | 3–10 bps |
| Crypto majors (AUC, LTX, MRD) | 120 | 0.60–0.90 | 3 | 8 | 15% / 12% | 5 bps |
| Crypto other launch tokens | 120 | 1.00–1.50 | 3 | 10 | 20% / 18% | 20–50 bps |
| Meme | 365 | 2.0–4.0 | 3 | 20 | 40% / 60% | 1–3% (AMM fee dominant) |
| Stablecoins | 1 | 0.01 | 3 | event-driven only | — | 1 bp |

GARCH defaults α = 0.08, β = 0.90 (01 §2.1) for every class except stablecoins (α = 0.02, β = 0.95).

---

## §4 Player intents

All intents use the 00 §5.5 envelope; module namespace `mkt.*` (05 owns `mkt.order.*`). Every intent is validated in P1 against: license (§3.2), Held state, beneficial-owner limits (§3.3.4), balances and holds, rate limits (20 per tick per character), session (§3.3.1), and regime controls (§3.9.4). Rejections return a reason code to the client.

| Kind | Payload | Validation (beyond common) | Effect |
|---|---|---|---|
| `mkt.option.exercise` | `{ seriesId, qty }` | AMERICAN, before expiry, holder long ≥ qty, cash/shares/margin sufficient | Exercise at t = 719 (§3.13.4) |
| `mkt.option.doNotExercise` | `{ seriesId }` | Before t = 540 of expiry day | Suppresses auto-exercise |
| `mkt.future.electDelivery` | `{ seriesId, qty, hubId }` | Last 3 trading days, long, storage capacity at hub ≥ qty | Physical delivery (§3.10.5) |
| `mkt.commodity.withdraw` | `{ receiptId, qty, toFacilityId }` | Facility at same hub, capacity | Moves receipt to own/other storage |
| `mkt.commodity.ship` | `{ receiptId, qty, toHubId }` | Route exists, freight capacity, cash for freight | Creates Shipment |
| `mkt.primary.bid` | `{ auctionId, competitive, yieldOrPrice?, face }` | LIC2 non-comp cap; LIC4 for competitive; cash hold = face × max price | Bid recorded; cleared on auction tick |
| `mkt.corp.tender` | `{ actionId, qty }` | Holder, before offer close | Shares tendered (held) |
| `mkt.corp.electDrip` | `{ assetId, on }` | Holder | Dividends reinvested at ex-date opening price (fractional to cash) |
| `mkt.rfq.request` | `{ spec, side, size, dealers }` | License for the product; ≤ 5 open RFQs | §3.19.1 |
| `mkt.rfq.quote` | `{ rfqId, price, size, validTicks ≤ 3 }` | Dealer flag, LIC4, capacity | Quote shown to requester |
| `mkt.rfq.accept` | `{ rfqId, quoteId }` | Quote valid; margin/collateral available (07) | Trade at next P6 |
| `mkt.rfq.cancel` | `{ rfqId }` | Own, OPEN | Cancelled |
| `mkt.block.propose` / `mkt.block.accept` | `{ assetId, qty, side, counterpartyHandle }` / `{ blockId }` | LIC4 both; before t = 530 / 539; holdings | Cross at close (§3.19.2) |
| `mkt.swap.terminate` | `{ tradeId, viaRfq: true }` | Party | Opens an unwind RFQ |
| `mkt.cds.notifyNovation` | `{ tradeId, toId }` | Bilateral only, counterparty consent | Novation |
| `mkt.wallet.create` | `{ chainId, label }` | ≤ 10 wallets per chain | New self-custody wallet |
| `mkt.wallet.transfer` | `{ fromWallet, toWallet, tokenId, amount }` | Same chain; controls (§3.9.4) | Block op |
| `mkt.defi.swap` | `{ poolId, tokenIn, amountIn, minOut }` | Wallet balance, LIC2 | Block op (§3.12.2) |
| `mkt.defi.addLiquidity` / `removeLiquidity` | `{ poolId, amounts, range? }` / `{ poolId, lpAmount | positionId }` | LIC2, balances | LP tokens / range position |
| `mkt.defi.supply` / `withdraw` / `borrow` / `repay` | `{ marketId, amount }` | HF ≥ 1 after borrow/withdraw; caps | Lending ops (§3.12.4) |
| `mkt.defi.liquidate` | `{ marketId, accountLabel, debtAsset, repay, collateralAsset }` | Target HF < 1 at block start, repay ≤ close factor | Keeper liquidation |
| `mkt.defi.vaultOpen` / `vaultMint` / `vaultRepay` / `vaultAddCollateral` / `vaultWithdraw` | `{ vaultId?, collateralAsset, amount }` | Ratio ≥ MCR after op | CDP ops (§3.12.7) |
| `mkt.defi.auctionBid` | `{ auctionId, vsdAmount }` | VSD balance | Buys collateral at the current Dutch price |
| `mkt.defi.stableMint` / `stableRedeem` | `{ tokenId, amount }` | LIC2; GUSD/EUNX at day close queue; MDOL tick cap | §3.12.6, §3.12.8 |
| `mkt.defi.stake` / `unstake` | `{ tokenId, amount }` | LTX/MRD/MDOL; unstake delay 1 game day | Staking |
| `mkt.defi.bridge` | `{ bridgeId, tokenId, amount }` | Bridge OPEN | Lock → mint after 10 ticks |
| `mkt.collect.consign` | `{ itemId, saleId, reserve }` | Owner, not PLEDGED/STOLEN-flagged at a reputable house | Lot created |
| `mkt.collect.bid` | `{ lotId, amount }` | §3.18.3 | Bid hold |
| `mkt.collect.withdrawLot` | `{ lotId }` | Before 1 game day to sale; fee 2% of low estimate (sink) | Lot withdrawn |
| `mkt.collect.sellToDealer` | `{ itemId }` | Owner, unencumbered | Instant sale (§3.18.4) |
| `mkt.collect.store` | `{ itemId, location }` | Owner | Changes storage |
| `mkt.token.launch` | `{ chainId, name, symbol, supply, allocation, vesting, liquidityFdl, disclosure }` | `player_tokens_enabled`, §3.20 eligibility | Token PENDING → LIVE after 13 review (1 game day) |

AI operators and delegated managers use exactly the same intents under their Mandate (00 §5.5).

---

## §5 Engine events

Envelope per 00 §5.6. Visibility in brackets.

| Kind | Payload | Consumers |
|---|---|---|
| `mkt.asset.listed` / `mkt.asset.delisted` / `mkt.asset.status` [PUBLIC] | assetId, cls, status, reason | UI, 16 news, 15 Wire |
| `mkt.earnings.calendar` [PUBLIC] | issuer, reportTick, slot | UI, AI |
| `mkt.earnings.released` [PUBLIC] | issuer, eps, consensus, surprise, guidance | 05 (jump), 16, 11 |
| `mkt.corp.announced` / `mkt.corp.effective` [PUBLIC] | CorporateAction | 05 (adjust orders), 07 (loans, locates), UI |
| `mkt.dividend.paid` [PARTIES] | assetId, holder, amount | 03, statements |
| `mkt.index.rebalanced` [PUBLIC] | indexId, adds, drops, new units | 08 ETFs, 16 index funds |
| `mkt.gxv.updated` [PUBLIC] | GXV value (every tick, delta-compressed) | 04 (optional input), UI, 16 |
| `mkt.bond.coupon` [PARTIES] / `mkt.bond.matured` [PUBLIC] | bondId, amounts | 03 |
| `mkt.bond.default` [PUBLIC] | bondId, issuer, trigger | 07 (collateral), 08 (ratings), 16 |
| `mkt.primary.announced` / `mkt.primary.result` [PUBLIC] | size, stop-out, bid-to-cover | 04, 16 |
| `mkt.credit.state` [PUBLIC hourly] | issuer, PD band, spreads | 07, 08, 09 |
| `mkt.option.expired` / `mkt.option.exercised` / `mkt.option.assigned` [PARTIES] | series, qty, settlement | 03, 07 |
| `mkt.future.settlement` [PUBLIC] / `mkt.future.delivery` [PARTIES] | series, price | 07 |
| `mkt.perp.funding` [PUBLIC rate, PARTIES payments] | perp, rate | 07, UI |
| `mkt.cds.creditEvent` / `mkt.cds.auction` [PUBLIC] | entity, type, R_final | 07, 08, 13 |
| `mkt.fx.regime` [PUBLIC] (re-emitted from 04) | ccy, regime | UI |
| `mkt.commodity.state` [PUBLIC hourly] | inventory band, daysCover, curve shape, basis | UI, 09 |
| `mkt.ship.departed` / `arrived` / `lost` [PARTIES] | shipment | 08 claims |
| `mkt.defi.block` [PUBLIC aggregate] | chain, ops, baseFee, queue length | UI |
| `mkt.defi.liquidation` [PUBLIC without identity] | market, size, bonus | 16 |
| `mkt.defi.badDebt` [PUBLIC] | protocol, amount | 16, 20 |
| `mkt.stable.status` [PUBLIC] | token, status, ρ | 16, 07 |
| `mkt.bridge.status` [PUBLIC] | bridge, status, recoveryRatio | 12, 16 |
| `mkt.meme.spawned` / `mkt.meme.dead` [PUBLIC] | token | 16 |
| `mkt.collect.result` [PUBLIC; identities by label] | lot, price | 14 Prestige, 16 |
| `mkt.rfq.*` [PARTIES]; `mkt.otc.print` [PUBLIC after 30 ticks] | | 07, UI |
| `mkt.block.filed` [PUBLIC, +720 ticks] | asset, qty, price | 15 filings |
| `mkt.surveillance.signal` [SEALED] | pattern, actors, evidence points | 13 (e.g. hype campaign + holding, CDS insider, spot-month squeeze) |

---

## §6 NPC behaviour

All NPC behaviour runs in P4 (orders) or P6 (DeFi blocks, RFQ responses) with RNG streams `rng('npc06', role, assetId, tick)`; capacities scale with activity-weighted players `N_a` (01 §14.1) so a quiet world does not leave free money.

1. **Options dealers** (3 NPC dealer desks, part of NPC banks in 07 §6): quote every listed series from §3.13.3; carry inventory up to `vegaCapacity = PARAM.opt_vega_cap_per_und` (by underlying: index $2M vega per vol point, single stock $200k, crypto $300k, × N_a scale); delta-hedge per §3.13.6; widen ×2 and halve capacity when F > 40.
2. **Basis and parity arbitrageurs:** each tick, for each (future, spot), (ETF, basket) handled with 08, (call, put, forward) put-call parity, (cross, legs) FX, (CEX, pool) DeFi: trade when the gap exceeds total fees + 0.10%, capacity `PARAM.npc_arb_cap_frac = 0.02` of the asset's ADV per tick. They never take directional risk beyond 1 tick.
3. **Commodity producers and consumers** (22 roster, 16 decision models): producers hedge 50% of the next 6 months' expected output by selling futures when the curve is ≥ 5% above cost; consumers (airlines, refiners, food firms) buy 30% of next-quarter needs; both act at day open.
4. **Primary dealers:** §3.7.6 bidding curve.
5. **Credit dealers:** CDS RFQ responses; GX Credit 40 market making with inventory limit; widen in fear.
6. **Crypto:** NPC miners sell AUC block rewards uniformly through the day; NPC stakers stake 60% of LTX/MRD supply; NPC LPs keep 80% of seed liquidity in launch pools and withdraw 30% when fear > 0.6 (liquidity vanishes when needed, 01 §7.2); NPC keepers (§3.12.4); NPC meme launcher (§3.11.4); Vesta and Mirage governance as specified.
7. **Collectors:** §3.18.3.
8. **Index funds** (16 aggregate, 08 instruments): trade at rebalance closing auctions and after index eligibility changes (rating cliffs) within 5 game days.

---

## §7 Screens (layouts in 17)

| Screen | Shows | Drives |
|---|---|---|
| Asset page (one template, class-specific panels) | Price chart with marks, V vs P gap ("fundamental pull") at Research tier, session state, spreads, depth (05), class panel (earnings calendar, coupons, funding, curve, peg status, hype gauge) | Order ticket (05), class intents |
| Screener | Filter by class, sector, bloc, license, liquidity, yield, PD band, hype | Watchlists |
| Corporate actions calendar | Earnings, ex-dates, splits, tenders, auctions, CDS rolls | Tender, DRIP |
| Index & ETF page | Level, constituents, weights, rebalance preview, iNAV vs price | — |
| Rates desk (LIC2) | Curves per bloc (govt, OIS, real, breakeven), bond list with yield/duration/convexity, primary auction calendar | Bond orders, primary bids |
| Credit desk (LIC3/4) | Issuer PD and spread history, CDS curves, GX Credit 40, credit events, recovery auctions | CDS RFQ |
| FX board | 10 pairs, legs vs crosses, forward points, carry table, regime banners | FX orders, forwards |
| Commodities board | Spot by hub, basis map, futures curve (contango/backwardation shading), inventory/days-cover, freight index, my receipts and shipments | Ship, withdraw, delivery elections |
| Compute & Power markets | Compute utilization and spot, reserved curve; power merit-order chart per bloc | Futures |
| Options chain | Expiries × strikes, IV smile and term structure, greeks on demand, payoff builder (multi-leg ticket submits legs as separate orders in the same tick) | Orders, exercise |
| Futures & perps panel | Curve, open interest, funding history/countdown, mark vs index, liquidation line (ROADMAP N10, price from 07) | Orders |
| Swaps & RFQ blotter | RFQ composer, live quotes with countdown, trade blotter, PVs, cashflow schedule | RFQ intents |
| Crypto wallet | Wallets by chain, exchange vs self-custody, gas, queue | Transfers, bridge |
| DeFi hub | Pools (TVL, fees, IL calculator), lending markets (rates, HF gauge), vaults (ratio, liquidation price), stablecoin health (ρ, status), oracle status | DeFi intents |
| Auction house | Weekly sales, lots, estimates, live bidding with soft-close timer, results archive | Consign, bid, sell to dealer |
| Collection | Items, appraisal history, condition, storage, provenance chain, pledges | Store, consign |
| Market structure explainer ("Why it moved", 18) | For any move: contribution of V change, factors, flow, jumps, from 05's attribution plus this module's V decomposition | — |

---

## §8 Edge cases

1. **Zero or negative prices.** Spot and futures prices floor at one tick (01 §2.2): commodities cannot go negative (storage-full hubs reject purchases instead). Interest rates and bond yields may be negative if 04 sets negative policy rates; all formulas accept negative `z`.
2. **Index constituent halted** at rebalance: it stays in at its mark; units recalculated at the next quarter.
3. **Option expiry on a market holiday**: there are no holidays; weekends cannot be expiries by construction (Friday expiries).
4. **Underlying delisted before expiry** (merger): options adjusted (§3.13.5); futures cash-settled at the consideration value on the effective tick.
5. **Underlying bankrupt** with open options: settle in cash at the first DISTRESSED auction price (§3.4.6); puts pay, calls expire worthless unless ITM at that price.
6. **Bond coupon due while issuer short of cash** but within grace: no default yet; `mkt.credit.state` PD jumps to `max(PD, 0.5)`; if paid within grace, PD recomputes normally.
7. **Sovereign restructuring** (04): old bonds exchange into new bonds per 04's terms at P13 of the effective tick; CDS RESTRUCTURING event; linkers keep their indexation in the new bonds.
8. **FX controls during a pending forward settlement**: settlement occurs (contractual) but the controlled-currency proceeds cannot be converted until controls end; forward is not cancelled.
9. **Hub storage full** when a physical-delivery long elects delivery: election rejected; position cash-settles.
10. **Shipment lost**: receipt destroyed; insured value paid by 08 if insured; CDS-like contracts unaffected.
11. **Perp funding when index is stale** (CEX halted): funding for that interval = interest component only; mark = last index × (1 + EMA premium) frozen.
12. **Oracle stale** for > 60 ticks: lending pauses new borrows; liquidations use last price; if the true market has moved > 20%, the next fresh price can create bad debt, which is socialized (§3.12.4).
13. **Stablecoin issuer reserve bank fails**: ρ drops by the uninsured haircut (07); GUSD may depeg; PSM transmits to VSD; every protocol uses the oracle price of GUSD (not 1.00) from the next block.
14. **Chain congestion**: queued ops keep their order; an op whose `minOut` fails when executed later is rejected without moving funds (gas still charged).
15. **Bridge impaired while a transfer is in flight**: the in-flight amount is treated as locked (pro rata recovery) and the mint on arrival is scaled by `recoveryRatio`.
16. **Auction bidder becomes unable to pay** (cash moved after the hold): impossible, the bid hold reserves cash; if a court order (13) seizes held cash, the bid is voided and the next-highest valid bid wins at its own amount.
17. **Collectible destroyed or stolen** (12, 14): item flagged; owner's mark becomes 0 (or insured value receivable from 08).
18. **Consigned item becomes subject to a seizure order**: lot withdrawn without fee.
19. **Player company with CDS outstanding is taken private**: CDS continue on the private entity (its bonds remain); PD uses the unlisted method.
20. **Split crossing an exercise request**: exercise processed post-split with adjusted terms.
21. **Instrument cap reached** (§3.1.2): NPC spawns pause; no existing instrument is removed.
22. **Weekend gap**: equity marks freeze from Friday close to Monday open; Monday's opening auction may gap through stops; 07 margin uses the opening auction price with price protection (07 §3.16).
23. **Partition boundary**: an instrument's book lives in one partition (19); cross-partition orders are held and settled per 02.
24. **Lazy option series with no quotes requested** at expiry: nothing happens (no state existed).
25. **Rounding**: every conversion to Money uses `toMoney` with round-half-to-even (00 §3.1); pro-rata allocations distribute remainders in hash order so the sum equals the total exactly.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| X1 | Self-trading or wash trading to paint prices or marks | 05 blocks same-beneficial-owner matching; marks clamp to V/mid band (§3.3.3) so a painted print cannot lift NW or ladders |
| X2 | Thin-market print to trigger others' liquidations | Liquidation triggers use marks (band) and perp mark price, never the last print (§3.3.3, §3.15, 07) |
| X3 | Put-call parity, ETF/basket, futures basis, FX triangle arbitrage loops | Parities hold by construction or NPC arbitrage capacity closes gaps above fees; residual < fees (01 §9) |
| X4 | Corner a commodity future into delivery | Spot-month limits 10% of deliverable supply, cash settlement default, delivery-failure rule (§3.10.5, §3.14.5) |
| X5 | Corner compute | Compute futures limit 10% of next-month supply; NPC cloud supply elastic (01 §3.4.1) |
| X6 | Empty-creditor CDS: buy protection then default your own company | Controllers barred from buying protection; frozen payout and 13 review if control acquired later (§3.17.6); defaults are mechanical and leave ledger evidence (missed payment with cash moved out shows in 13 forensics) |
| X7 | Bribe the credit-event committee | Determination is an engine rule, not a vote (§3.17.4) |
| X8 | Oracle manipulation to liquidate DeFi borrowers | 30-tick TWAP median of CEX and AMM, deviation guard 5%, staleness pause (§3.12.5); cost of sustaining a distortion against NPC arb capacity |
| X9 | Flash loans / atomic sandwich | No bundles, no intra-op borrowing (§3.12.11); in-block order is a hash, no priority fees (§3.11.5) |
| X10 | Cross-tick sandwich of a large AMM swap | Intents are sealed until P0 commit, so nobody sees a pending swap; `minOut` protects; large swaps visible only after execution |
| X11 | Liquidation sniping | Allowed, priced, open to everyone on equal terms; bonus capped by protocol parameters |
| X12 | Dividend capture with borrowed shares | Manufactured dividend paid by borrower (§3.4.4); ex-date price adjustment removes the free lunch |
| X13 | Option expiry pinning by a whale | Allowed (emergent); spot-month-style concentration surveillance flags pinning by an entity that also holds large option positions on that expiry (05 score) |
| X14 | Pump a meme coin then dump | Hype-campaign + holding overlap feeds surveillance; selling after paid promotion is S5 (13) |
| X15 | Player token rug-pull | Liquidity lock enforced by protocol, vesting, disclosure; launch disabled at launch (§3.20) |
| X16 | Stale-valuation abuse on collectibles (pledge at inflated appraisal) | Appraisal is index-driven, not owner-set; marks at 10% haircut; lending LTV 50%; consecutive private sales between linked accounts flagged (15) and excluded from appraisal inputs |
| X17 | Shill bidding on own consigned lot | Consignor and linked accounts cannot bid on own lots (rejected); NPC house checks collusion graph |
| X18 | Primary auction squeeze (buy most of an issue, then squeeze shorts) | Competitive bid cap per bidder 35% of issue size (`PARAM.primary_max_award_frac = 0.35`); 07 specials make squeeze visible and borrowable supply from NPC holders |
| X19 | Front-running own fund or followers via RFQ information | Requester identity is a rotating label; dealers see credit tier only (L11); dealer trading ahead of a filled RFQ in the same asset within 30 ticks is a surveillance pattern |
| X20 | Index rebalance front-running | Rebalance rules and preview are PUBLIC (legal and intended); profitable but competitive |
| X21 | Exploiting deterministic RNG | Seeds and per-tick entropy are server-secret and committed (02); clients never simulate |
| X22 | Bridge "double mint" | Invariant `wrappedSupply ≤ locked` asserted in P13 (20) |
| X23 | Naked shorting via instant settlement | Locate required at P1 (07) |
| X24 | Funnelling via off-market block crosses | Blocks cross only at the auction price (§3.19.2) |

---

## §10 Acceptance tests

1. The authored launch universe contains exactly 400 instruments with the composition of §3.1.1; every id matches `ast_<CLS>_<CODE>` and every referenced name exists in 22.
2. Replaying the same seed and intents produces identical asset lists, series ids, prices, coupons, funding payments and auction results (byte-identical event stream).
3. An LIC1 character's order to short an equity, buy a bond, or buy an option is rejected at P1 with the license reason; the same order succeeds after the license is granted.
4. A character with only restricted cash (03 §3.5.6) cannot buy an option, a perp, a future or CDS protection.
5. For an equity with EPS_fwd > 0, V equals the §3.4.2 formula to within 1e-9 relative error for a given state; for EPS_fwd ≤ 0, the sales branch is used; V never falls below 0.3 × BVPS when BVPS > 0.
6. On an earnings release with surprise s, the jump passed to 05 equals `0.6 · ΔlnV`, and in the absence of other shocks P converges toward the new V with the configured half-life (post-announcement drift is positive for s > 0).
7. On a cash dividend ex-date, the opening reference price drops by exactly the dividend, holders at record close receive it at pay date, and a short or borrower pays the identical manufactured amount.
8. A 5:1 split multiplies every position, lot and resting order quantity by 5, divides prices by 5, and adjusts every option series (strike ÷ 5, multiplier × 5) with zero change in any account's marked value.
9. GX100 level is unchanged across a quarterly rebalance (divisor adjustment) to within 1e-9.
10. GXV is computed from the variance formula over the two bracketing expiries, stays in [5, 150], and rises when players net-buy GX100 options in large size (dealer vega term); every `fear` term in this module equals 04's F/100 of the previous game hour; GX100 30-day ATM vol is never below `0.10 + 0.004·F`.
11. ETF iNAV equals the basket value per share each tick; expense accrual equals `ER/364 × NAV` per day.
12. A government bond's model clean price equals the discounted cash-flow formula off 04's `govt` curve; YTM solves to tolerance 1e-10 in ≤ 20 iterations; DV01 matches finite difference to 1e-6.
13. A linker's principal tracks CPI with a 1-game-month lag and repays at least par.
14. In a primary auction, all winners pay the stop-out yield; bids at the stop-out are prorated; total allotted face equals issue size exactly; non-competitive bids above $5M are rejected.
15. A corporate bond defaults if and only if a scheduled payment is not made within 3 game days of its due date (or a bankruptcy/acceleration/restructuring event occurs); no default occurs from any random draw.
16. Credit spreads rise monotonically with PD and with fear for a fixed balance sheet; a bank in resolution has PD = 1.
17. FX cross prices never deviate from the product of their legs by more than spread + fees for more than 2 consecutive ticks in a 30-game-day simulation.
18. FX forward prices equal `S·exp((z_q − z_b + basis)T)` exactly; in a 5-game-year simulation without crises, a long-SRL carry position earns a positive average excess return (UIP share 0.5, 04 §3.13.1), and its worst 1% weekly returns are below −8%.
19. Under 04 CAPITAL_CONTROLS on SRL, intents converting SRL to another currency are rejected for the control duration and accepted afterwards.
20. Commodity curve is in backwardation when daysCover < 0.7 × normalCover and in contango when > 1.3 × normalCover (default parameters).
21. Physical spot purchases create warehouse receipts; storage fees accrue daily; perishable quantities decline at the configured rate; purchases at a 100%-full hub are rejected.
22. A commodity futures holder who elects delivery with storage capacity receives a receipt at the hub; a holder without capacity is cash-settled; spot-month positions above 10% of deliverable supply are rejected.
23. Compute spot follows `0.12·(u/0.75)³` clamped to [$0.05, $0.60] per GPUh for any utilization u.
24. AUC issuance halves at each chapter boundary and total supply never exceeds 18,000,000.
25. DeFi ops in a block execute in `hash(tickEntropy, intentId)` order; changing submission time within the same tick does not change order; ops beyond capacity execute next block in the same relative order.
26. A constant-product swap conserves `reserveA·reserveB` (after fees, the product does not decrease) and returns exactly the formula output; `minOut` violations reject with no state change except gas.
27. A range-pool swap crossing k boundaries produces the same output as the analytic piecewise formula; liquidity added and removed returns the deposited amounts plus fees minus price movement effects to within one micro-unit.
28. A lending position with HF < 1 can be liquidated by any LIC2 keeper for at most 50% of one debt, receiving exactly `repay·(1+bonus)` of collateral at oracle price; a position with HF ≥ 1 cannot be liquidated.
29. Oracle uses the median rule; when CEX and AMM deviate by > 5%, CEX TWAP is used; after 60 stale ticks new borrows pause.
30. No intent can borrow and repay within one op; a strategy requiring both must use two ticks (no flash loans exist).
31. GUSD status becomes STRESSED or DEPEGGED only through a reserve-value drop or a redemption queue overflow (caused), never by a fixed probability; a reserve-bank failure in 07 lowers ρ by the uninsured haircut.
32. A Mirage death spiral can be produced in the simulation harness by a confidence shock and does not occur in a calm 1-game-year run (frequency band in 20).
33. Bridge invariant `wrappedSupply ≤ locked` holds at every P13; after an impairment, wrapped token value equals recoveryRatio × underlying.
34. Option NPC quotes satisfy calendar and butterfly no-arbitrage on the strike grid at every evaluation; put-call parity holds within spread + fees for European series.
35. American calls on non-dividend-paying stocks are never optimally exercised early by the CRR model; ITM options auto-exercise at expiry unless `doNotExercise` was submitted.
36. Assignment allocates exactly the exercised quantity across writers pro rata with deterministic remainders.
37. Perp funding payments sum to zero across all positions each interval; the rate never exceeds ±0.1% per 8 game hours; liquidations reference the mark price.
38. OIS par rate from §3.16.3 makes the swap's PV zero at inception to within $1 per $100M notional.
39. A CDS credit event is determined by rule within the event's game day; settlement pays `notional·(1 − R_final)` with R_final from the DISTRESSED auction or the recovery estimate; protection buyers who control the reference entity are rejected at P1.
40. Collectible appraisals move only with the category index, condition, provenance and age; an owner cannot set an appraisal.
41. In a collectible auction, a bid in the last 30 ticks extends the close by 30 ticks (max 10 times); buyer premium 15% and seller fee 12% post as SINK for the NPC house; a consignor's own and linked accounts cannot bid.
42. RFQ requesters' identities never appear in any dealer-visible payload (only rotating label and credit tier); filled cleared-product prints appear publicly 30 ticks later without identities.
43. Block crosses execute only at the closing auction clearing price and are published 720 ticks later.
44. With `player_tokens_enabled = false`, `mkt.token.launch` is rejected; with it true, locked liquidity cannot be withdrawn before its lock tick by any intent.
45. Every money movement produced by this module is a 03 Posting with a reason code from 03's catalog (e.g. `EQ_DIVIDEND`, `BOND_COUPON`, `DRV_PERP_FUNDING`, `DRV_CDS_CREDIT_EVENT`, `COLL_AUCTION_FEE`, `CRY_TOKEN_MINT`, `DEFI_NETWORK_FEE`); the sum of all postings per tick per currency nets to the declared faucet/sink totals (20 invariant).
46. Tick cost: with 400 instruments, 2,000 materialized option series, 50 live DeFi pools and 20k agents, this module's P6 work stays within the budget 19 assigns (benchmark target ≤ 60 ms per partition per tick).
