// 17B CH-00 shared channel contracts (types only). Copied from /workspace/specs/17B-broker.md (Systems' Q1–Q14
// answers, E-56, 2026-10-21) with the cited V3 section on each type. Runtime validation lives in ./schema.ts and is
// type-checked against these interfaces in both directions (tests/unit/17b/CH-00-schema.test.ts).
// SWAP (G5, CH-06): when 19C `packages/protocol` lands, every body here must equal its protocol type.
// Envelope: 19 §2.4 (ServerMsg snap/delta, DeltaOp). The mock emits the same frames.
export type Tick = number; export type Money = string; export type Price = string; export type Qty = string; // 19 Rule 3.8.4
export interface Snap<B> { t: 'snap'; ch: string; seq: number; tick: Tick; body: B }
export type DeltaOp = { op:'set'; path:string; v:unknown } | { op:'del'; path:string } | { op:'ins'; path:string; idx:number; v:unknown } | { op:'trim'; path:string; keepLast:number };
export interface Delta { t: 'delta'; ch: string; seq: number; tick: Tick; ops: DeltaOp[] }
export type ChannelState = 'loading' | 'live' | 'stale' | 'denied' | 'error';      // stale: 19 Rule 3.8.8 backpressure; denied: CHANNEL_DENIED (19 Rule 3.8.2)
export type TradingState = 'CLOSED'|'PRE_OPEN'|'OPENING_AUCTION'|'CONTINUOUS'|'CLOSING_AUCTION'|'AFTER_HOURS'|'HALTED'|'VOL_INTERRUPTION'|'LIMIT_LOCKED'|'SUSPENDED'; // 05 §2.1
export type Side = 'BUY' | 'SELL';

// ticker:{listId}: every tick; ≤ 50 assets (17 §2.6; 19 Rule 3.8.2; 05 §3.11)
export interface TickerRow { assetId: string; last: Price; chg: Price | null; chgPct: string | null; vol: Qty; state: TradingState; halted: boolean } // Q1 answered (E-56): halted derived server-side; chg/chgPct vs prevClose, chgPct pp string 2 dp; null when no ref; no `phase` (rides `clock`)
export interface TickerBody { listId: string; rows: Record<string, TickerRow> }

// book:{assetId}: every tick while a Broker shows it; ≤ 4 subs/socket (19 Rule 3.8.2; 05 §2.5, §3.11)
export interface DepthLevel { price: Price; qty: Qty }
export interface AuctionResult { assetId: string; tick: Tick; kind: 'TICK'|'OPEN'|'CLOSE'|'REOPEN'|'VOL_INTERRUPTION'; price: Price; qty: Qty; imbalance: Qty; aggressorSide: Side|'NONE'; bandClamped: boolean; fillsCount: number }
export interface BookBody { assetId: string; tick: Tick; bids: DepthLevel[]; asks: DepthLevel[]; last: AuctionResult | null; indicative?: { price: Price; imbalance: Qty } } // levels: 3, or 10 at Terminal; indicative only in auction windows (Q2 answered, E-56)

// tape:{assetId}: one aggregate print per tick (05 §3.11)
export interface TapePrint { assetId: string; tick: Tick; price: Price; qty: Qty; aggressor: Side|'NONE'; block: boolean; deferred: boolean }
export interface TapeBody { assetId: string; prints: TapePrint[] }   // ring buffer, trimmed with `trim` (keepLast 200 [P]; Q4 rings use `trim`)

// candles:{assetId}:{res}: live bar every tick; history over HTTP (17 §2.6; 19 Rule 3.8.2; 19 §3.10.1 /api/v1/history/candles)
export type CandleRes = 'tick' | 'hour' | 'day';
export interface Candle { t: Tick; o: Price; h: Price; l: Price; c: Price; v: Qty }
export interface CandlesBody { assetId: string; res: CandleRes; live: Candle }
export interface CandleHistoryReq { assetId: string; res: CandleRes; from: Tick; to: Tick }  // ≤ 5,000 bars per call
export interface CandleHistoryRes { bars: Candle[] }

// me: own character, every tick (17 §2.6; 19 Rule 3.8.2; IntentResult 19 §2.3; Fill 05 §2.5). Shape per Q4 answered (E-56 §2); delta paths keyed by id are stable; rings use `trim`.
export interface Position { assetId: string; qty: Qty; avgCost: Price; mark: Price; value: Money; upl: Money; pledgedQty: Qty; lentQty: Qty } // Q4 (06 §2). No pnlPct/weight/class/marginState/liqPrice in me.positions; see PF-B open points
export interface OpenOrder { orderId: string; assetId: string; side: Side; type: string; qty: Qty; filled: Qty; limit?: Price; stop?: Price; tif: string; status: 'PENDING'|'WORKING'|'PARTIAL'|'QUEUED_AUCTION'; placedTick: Tick; avgPrice: Price } // Q4: 05 Order minus ownerGroupId/actorId/holdId/arrivalRefPrice/priorityTick/displayedRemaining; avgPrice server-computed. Field names mirror 05 Order on SWAP
export interface MyFill { fillId: string; tick: Tick; assetId: string; orderId: string; side: Side; qty: Qty; price: Price; fee: Money; feeCcy: string; liquidity: 'MAKER'|'TAKER'|'AUCTION'; counterpartyKind: 'PLAYER'|'NPC' }
export interface IntentResult { intentId: string; tick: Tick; status: 'ACCEPTED'|'REJECTED'|'PARTIAL'|'QUEUED_NEXT'; rejectCode?: string; rejectParams?: Record<string,string>; effects?: string[] }
export interface RestrictedBucket { reason: string; amount: Money; untilRealMs: number | null }
export interface MeTradingBody { balances: Record<string, Money>; nw: Money; nwi: string; restricted: RestrictedBucket[]; positions: Record<string, Position>; orders: Record<string, OpenOrder>; fills: MyFill[] /* ring keepLast 50 */; margin: MarginSummary | null /* 07 */; holds: Record<string, unknown>; intents: IntentResult[] /* ring keepLast 50 */; alerts: unknown[] /* ring */; nwStats?: NwStats; nwBreakdown?: NwBreakdown } // Q4 + Q10 (E-56 §2, §12). buyingPower/license not in Q4 list: open point
export type MarginSummary = Record<string, Money>; // 07 summary, opaque until 07
export interface NwStats { window: string; drawdownReal: string; sharpe: string | null /* null below 63 trading days */; twrIdx: string; bench: string } // Q10, E-56 §12; strings as sent
export interface NwBreakdown { byClass: { key: string; value: Money; sharePct: string }[]; byCcy: { key: string; value: Money; sharePct: string }[]; liabilities: Money } // Q10: sharePct 1 dp, sums to 100.0 server-side
export interface NwPoint { t: Tick; nw: Money; nwi: string; realNw: Money; twrIdx: string; bench: string } // GET /api/v1/me/nw-history (Q9/Q10, E-56 §5)
export interface OrderHistoryRow { orderId: string; assetId: string; side: Side; type: string; qty: Qty; filled: Qty; avgPrice: Price; status: 'FILLED'|'CANCELLED'|'REJECTED'|'EXPIRED'; rejectCode?: string; tick: Tick } // GET /api/v1/orders/me (Q11, E-56 §6); shape [P] until 05 read model

// req ops over the socket (19 Rule 3.8.5): intent.preview ≤ 5 per tick, asset.detail
export interface PreviewReq { kind: 'mkt.order.place'; payload: OrderDraft }
export interface PreviewRes { price: Price; estFill: Price; fee: Money; valid: boolean; reasonCode?: string; buyingPowerAfter: Money; marginAfter?: Money /* 05 PreviewResult fields, names re-checked on SWAP */; impactBp: string /* integer bp */; impactMoney: Money; total: Money; firstTradeCapRemaining: Money | null; computedAtTick: Tick } // Q14 answered (E-56 §9): advisory, the real order re-validates
export interface OrderDraft { assetId: string; side: Side; type: 'market'|'limit'|'stop'|'stop_limit'; qty: Qty; limit?: Price; stop?: Price; tif: 'day'|'gtc'|'ioc'|'fok' } // 17 §2.2, BRK-02
export interface AssetDetail { assetId: string; ticker: string; name: string; class: string; sector: string; bloc: string; ccy: string; displayDecimals: number; qtyDecimals: number; licenseTier: string; tradingState: TradingState; stateUntilTick?: Tick } // 05 §2.2 public fields

// news: on change, server-filtered incl. follows (19 Rule 3.8.2; Q12); all Wire kinds ride `news` (Q7 answered, E-56 §4); filings: full body on `filings`. Shape: 15 §2.9 WireItem projection (Q5 corrected, E-56 §3)
export type WireKind = 'NEWS'|'RUMOR'|'FILING'|'VERDICT'|'MARKET'|'PURCHASE'|'ALLIANCE'|'STATEMENT'|'OUTLET'|'CHAPTER'|'RECORD'|'RANK'|'PHILANTHROPY'|'WORLD_EVENT'|'DAILY_CLOSE'; // 15 §2.9 (Q7)
export type SourceBand = 'low'|'mixed'|'solid'; // server-sent; cutoffs and owner OPEN (OQ-W1)
export interface WireItem { id: string; kind: WireKind; headlineKey: string; slots?: Record<string,string>; entities: { id: string; kind: string; label: string }[]; tick: Tick; breaking: boolean; causeEventIds: string[]; sourceRecord?: { hits: number; resolved: number }; sourceBand?: SourceBand; pricedInBand?: 'early'|'mid'|'late'|'done'; pricedInAsOf?: Tick; filingId?: string; outletId?: string; body?: Record<string,string> } // Q5 corrected: no 0–1 credibility reaches the client; sourceRecord+sourceBand on RUMOR and on STATEMENT whose speaker has a record, else both absent; pricedInBand only for Terminal (Q6); body absent until publishTick (Q13 pending)
export interface NewsBody { items: WireItem[] }            // ring buffer (`trim`)
export interface Filing { id: string; type: 'ownership_5pct'|'quarterly_holdings'|'insider'|'company_statement'|'fund_disclosure'|'regulatory'; filer: { id: string; label: string }; subject: { id: string; label: string }; tick: Tick; fields: Record<string, string> }
export interface FilingsBody { items: Filing[] }
export interface BoardRow { rank: number; handle: string; country: string; nwiBand?: string; npc?: boolean }  // board:{id}:{scope} (19 Rule 3.8.2); Whale Watch

// ---- Channel names and envelope additions [P], below the spec copy ----

/** Every channel the 17B cards subscribe to (19 Rule 3.8.2 names). */
export type ChannelName =
  | `ticker:${string}` | `book:${string}` | `tape:${string}` | `candles:${string}:${CandleRes}`
  | "me" | "news" | "filings" | `board:${string}:${string}`;

/** Body type carried by a channel name. */
export type BodyOf<C extends ChannelName> =
  C extends `ticker:${string}` ? TickerBody :
  C extends `book:${string}` ? BookBody :
  C extends `tape:${string}` ? TapeBody :
  C extends `candles:${string}` ? CandlesBody :
  C extends "me" ? MeTradingBody :
  C extends "news" ? NewsBody :
  C extends "filings" ? FilingsBody :
  C extends `board:${string}` ? BoardBody :
  never;

/** board:{id}:{scope} body [P]: the spec gives only the row type. */
export interface BoardBody { boardId: string; scope: string; rows: BoardRow[] }

/** Channel-level error frame [P]. `CHANNEL_DENIED` per 19 Rule 3.8.2 carries no body and no entity hint (CH-03). */
export interface ChannelErr { t: "err"; ch: string; code: "CHANNEL_DENIED" | "INTERNAL" }

export type ServerFrame = Snap<unknown> | Delta | ChannelErr;
