// Broker ticket copy (UI card 4, BRK-A), English table. French lives in strings-fr.ts and is not imported here. The card's copy table is used verbatim. Keys the card does not give
// are marked [provisional] and listed as open Studio questions in the PR: haltedQueued FR, r.MKT_NO_LOCATE,
// last, today, loading. r.MKT_INSUFFICIENT_BP is the engine's code (05 §4.2, T05-11 step 1.8) and carries the card's
// "insufficient funds" copy; the card's MKT_INSUFFICIENT_FUNDS was only 19 §2.3's example code.
// updating / couldntLoad / retry / cash repeat Portfolio's existing copy so this chunk does not import Portfolio's.
// FR typography: U+202F before "%", "pb" and ":", and inside « ».
// UI card 5 (limit / stop / Open orders) keys follow the card's copy table; s.QUEUED_AUCTION is `haltedQueued` (orderStatus).
// UI card 6 (cancel) keys follow the card's copy table; sideName [provisional] is the arrow-less side its examples use.
// UI card 7 (price chart) keys follow the card's copy table; chartLoading [provisional] is the skeleton's aria-label.
// UI card 10 (asset page) keys follow the card's copy table; viewAria / tabsAria (tab list names), newsLoading (News
// skeleton) and assetOption (the select's "TICKER · Name", AC 1) are [provisional].
import type { TradingState } from "@/shell/contracts/channels";

export type BrLocale = "en" | "fr";

export const NNBSP = "\u202F";

/** `{slot}` placeholders filled from a reject's `rejectParams`; unknown slots stay as written. */
export function fillSlots(template: string, params: Readonly<Record<string, string>> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (params && Object.hasOwn(params, k) ? params[k]! : all));
}

export const EN = {
  asset: "Asset",
  side: "Side",
  buy: "↑ Buy",
  sell: "↓ Sell",
  qty: "Quantity",
  qtyEmpty: "Enter a quantity.",
  qtyDigits: "Use digits only.",
  youHold: (qty: string) => `You hold ${qty}`,
  /** Label before the FDL MoneyText (Portfolio's existing "Cash · {ccy}" copy). */
  cash: "Cash · FDL",
  /** [provisional] header labels: Positions' column copy (PF-B); the card does not say whether Last/Today carry labels. */
  last: "Last",
  today: "Today",
  fearIndex: "Fear",
  fearAria: (f: string, ra: string) => `Fear Index ${f}, risk appetite ${ra}`,
  /** Signed-in provenance: the server clock tick, not a per-browser counter. */
  serverTick: (n: number) => `Server tick ${n}`,
  none: "—",
  review: "Review order",
  edit: "Edit",
  place: "Place order",
  actionBuy: (qty: string, ticker: string) => `Buy ${qty} ${ticker}`,
  actionSell: (qty: string, ticker: string) => `Sell ${qty} ${ticker}`,
  estimateAt: (n: string) => `Estimate · at tick ${n}`,
  price: "Price",
  estFill: "Est. fill",
  fee: "Fee",
  impact: "Est. impact",
  bp: (n: string) => `${n} bp`,
  total: "Est. total",
  bpAfter: "Buying power after",
  executable: "Executable now (tokens)",
  capLeft: "First-trade cap left",
  refreshing: "Refreshing estimate…",
  // M2-05 known-offline boundary
  offlineNoPlace: "You're offline. Prices shown are the last received. Place is off until you're back online.",
  placeOffline: "You're offline. Nothing was sent.",
  placeUnknown: "No answer from the server. This order may have gone through. Check Open orders and Positions before placing it again.",
  gamePaused: "The game is paused.",
  note: "Prices can fall. That's the game.",
  pending: (n: string) => `Pending · tick ${n}`,
  bought: (qty: string, ticker: string, price: string) => `Bought ${qty} ${ticker} at ${price}`,
  sold: (qty: string, ticker: string, price: string) => `Sold ${qty} ${ticker} at ${price}`,
  feeLine: (fee: string) => `Fee ${fee}`,
  received: "Order received.",
  newOrder: "New order",
  rejected: "Order rejected",
  rejectedCode: (code: string) => `Order rejected (${code})`,
  r: {
    MKT_INSUFFICIENT_BP: "Not enough cash for this order.",
    MKT_HALTED: "Trading is halted for this asset.",
    MKT_UNKNOWN_ASSET: "This asset can't be traded.",
    MKT_BAD_QTY: "Check the quantity.",
    /** [provisional] sell beyond the holding (Quant E-96 (4)); Studio to confirm, and the "Sell all N" feel call. */
    MKT_NO_LOCATE: "You can't sell more than you hold.",
    /** [provisional] M1-06 server door codes. */
    MKT_BAD_PRICE: "Check the price.",
    MKT_ORDER_TYPE_UNSUPPORTED: "Only market and limit orders are available.",
    MKT_TOO_MANY_ORDERS: "Too many open orders. Cancel one first.",
    /** L4: a coin listed at graduation trades against its book only. */
    MKT_NO_LIQUIDITY: "The coin's book can't fill any of this order now. A limit order can wait for it.",
  } as Record<string, string>,
  halted: "Halted",
  /** E-98 (1) neutral default (BRK-A); Designer owns the final text. */
  haltedQueued: "Waits for reopen",
  placeAria: (action: string) => `Place order: ${action}`,
  /** [provisional] aria-label of the loading skeleton (aria-busy). */
  loading: "Loading order ticket",
  updating: "Updating…",
  couldntLoad: "Couldn't load",
  retry: "Retry",
  // ---- UI card 5: order types, prices, Open orders ----
  orderType: "Order type",
  t: { market: "Market", limit: "Limit", stop: "Stop", stopLimit: "Stop limit" },
  kindDay: (type: string) => `${type} · Day`,
  limitPrice: "Limit price",
  stopPrice: "Stop price",
  priceEmpty: "Enter a price.",
  priceFormat: "Use a number like 42.10.",
  termsLimit: (p: string) => `Limit ${p}`,
  termsStop: (p: string) => `Stop ${p}`,
  termsStopLimit: (s: string, l: string) => `Stop ${s} · Limit ${l}`,
  /** Review title: action + terms ("Buy 40 HALC · Limit 42.10"); market keeps card 4's bare action. */
  actionTerms: (action: string, terms: string) => `${action} · ${terms}`,
  restingAck: "Order placed. It's in Open orders.",
  openOrders: "Open orders",
  noOpenOrders: "No open orders.",
  filledOf: (filled: string, qty: string) => `${filled} / ${qty} filled`,
  s: { PENDING: "Pending", WORKING: "Working", PARTIAL: "Partly filled" },
  rowMeta: (n: string) => `Day · tick ${n}`,
  rowAria: (side: string, qty: string, ticker: string, terms: string, status: string) => `${side} ${qty} ${ticker}, ${terms}, ${status}`,
  /** [provisional] aria-label of the list skeleton (aria-busy). */
  loadingOrders: "Loading open orders",
  // ---- UI card 6: cancel ----
  /** [provisional] the side as a word, for cancelAria / cancelled ("Cancel order: Buy 40 HALC, …"). */
  sideName: { BUY: "Buy", SELL: "Sell" } as Record<"BUY" | "SELL", string>,
  cancel: "Cancel",
  cancelAria: (side: string, qty: string, ticker: string, terms: string) => `Cancel order: ${side} ${qty} ${ticker}, ${terms}`,
  cancelConfirm: "Cancel this order?",
  keepOrder: "Keep order",
  confirmCancel: "Yes, cancel",
  cancelling: (n: string) => `Cancelling… · tick ${n}`,
  cancelled: (side: string, qty: string, ticker: string, terms: string) => `Order cancelled: ${side} ${qty} ${ticker}, ${terms}`,
  cancelRejectedCode: (code: string) => `Cancel refused (code ${code})`,
  cancelSendFailed: "Couldn't send. Try again.",
  // ---- UI card 7: price chart (retry / updating / halted reuse card 4 keys) ----
  chartTitle: "Price",
  range: { "1H": "1H", "1D": "1D", "1W": "1W", "1Q": "1Q", "1Y": "1Y", All: "All" } as Record<"1H" | "1D" | "1W" | "1Q" | "1Y" | "All", string>,
  rangeAria: "Chart range",
  chartAria: (ticker: string, range: string, first: string, last: string) => `${ticker} price, ${range}: from ${first} to ${last}`,
  crosshairAria: (time: string, o: string, h: string, l: string, c: string, v: string) => `${time}: open ${o}, high ${h}, low ${l}, close ${c}, volume ${v}`,
  /** M1-07 candle legend (the hovered or newest bar). */
  legend: { o: "O", h: "H", l: "L", c: "C", v: "Vol" },
  /** M1-07 data source line under the chart. Signed-in: the server's quotes; volume counts executed trades only. */
  sourceServer: "Port Avalon quotes · volume: executed trades",
  sourceSince: (time: string) => `recorded since ${time}`,
  sourceDemo: "Demo history (sample data, not your account)",
  tickLabel: (n: string) => `t ${n}`,
  viewTable: "View as table",
  viewChart: "View as chart",
  /** Trend lines on the chart (kept on this device only, per account). */
  trendTool: "Trend line",
  trendCancel: "Cancel line",
  trendDelete: "Delete line",
  trendHint: "Click or tap two points on the chart. Esc cancels.",
  trendLocal: "Lines are kept on this device only",
  trendLayer: "Trend lines",
  trendReadError: "Your saved lines could not be read on this device.",
  trendUnsaved: "Your last line change was not kept on this device.",
  /** Chart overlays (moving averages). */
  study: { sma: "SMA", ema: "EMA", bb: "Bollinger", vwap: "VWAP", rsi: "RSI" },
  /** The legend's name for an overlay at its period (VWAP: studyVwap, by its start). */
  studyName: { sma: (n: number) => `SMA ${n}`, ema: (n: number) => `EMA ${n}`, bb: (n: number) => `BB ${n} ±2σ`, vwap: () => "VWAP", rsi: (n: number) => `RSI ${n}` },
  studyHint: {
    sma: "Simple moving average: the mean of the last closes",
    ema: "Exponential moving average: recent closes weigh more",
    bb: "Bollinger Bands: the 20-bar average of the closes ± 2 standard deviations",
    vwap: "Volume-weighted average price: (high + low + close) / 3 weighted by traded volume, from the start of each game day",
    rsi: "Relative strength index (14, Wilder), 0 to 100 in its own pane: above 70 stretched, below 30 washed out",
  },
  studiesLabel: "Chart overlays",
  studiesLocal: "Overlay choices are kept on this device only",
  studyPeriodAria: (name: string) => `${name} period, in bars`,
  studyPeriod: (n: number) => `${n} bars`,
  studyShort: (name: string, need: number, have: number) => `${name} needs ${need} bars; this range has ${have}.`,
  /** VWAP's sum starts at 00:00 of the game day ("day") or later, where the shown bars of that day start. */
  studyVwap: (from: string | null) => (from === null ? "VWAP day" : `VWAP from ${from}`),
  vwapIntraday: "VWAP needs intraday bars; this range has one bar per day.",
  vwapNoVolume: (from: string) => `VWAP: nothing traded since ${from} this game day, so no value yet.`,
  studiesReadError: "Your overlay choices could not be read on this device.",
  studiesUnsaved: "Your last overlay change was not kept on this device.",
  trendAria: (n: number, t1: string, p1: string, t2: string, p2: string) => `Trend line ${n}: ${t1} at ${p1} to ${t2} at ${p2}`,
  trendEnd: (start: boolean, time: string, price: string) => `${start ? "Line start" : "Line end"}: ${time} at ${price}. Arrow keys move it.`,
  col: { time: "Time", open: "Open", high: "High", low: "Low", close: "Close", volume: "Volume" },
  chartError: "Couldn't load chart",
  noHistory: "No price history yet.",
  /** [provisional] aria-label of the chart skeleton (aria-busy). */
  chartLoading: "Loading price chart",
  // ---- UI card 10: asset page (updating / couldntLoad / retry / halted reuse card 4 keys) ----
  viewTrade: "Trade",
  viewAbout: "About",
  /** [provisional] accessible names of the Trade | About and the Overview | News tab lists. */
  viewAria: "Broker view",
  tabsAria: "About this asset",
  tabOverview: "Overview",
  tabNews: "News",
  backToTrade: "Back to trade",
  f: { name: "Name", ticker: "Ticker", type: "Type", sector: "Sector", region: "Region", ccy: "Currency", licence: "Licence", quote: "Price", trading: "Trading", position: "Your position" },
  /** Asset `class` labels; a class not listed here shows raw. */
  class: { equity: "Stock", index: "Index" } as Readonly<Record<string, string>>,
  positionLine: (qty: string, value: string) => `${qty} shares · ${value}`,
  noPosition: "You don't hold this asset.",
  st: {
    CLOSED: "Closed", PRE_OPEN: "Pre-open", OPENING_AUCTION: "Opening auction", CONTINUOUS: "Open", CLOSING_AUCTION: "Closing auction",
    AFTER_HOURS: "After hours", HALTED: "Halted", VOL_INTERRUPTION: "Volatility pause", LIMIT_LOCKED: "Limit locked", SUSPENDED: "Suspended",
  } as Readonly<Record<TradingState, string>>,
  noNews: (ticker: string) => `No stories about ${ticker} in your feed yet.`,
  newsHelp: "Only recent stories are kept.",
  openStoryAria: (headline: string) => `Open in Wire: ${headline}`,
  unknownAsset: "Details for this asset aren't available.",
  /** [provisional] aria-label of the News skeleton (aria-busy). */
  newsLoading: "Loading stories",
  assetOption: (ticker: string, name: string) => `${ticker} · ${name}`,
};
export type BrStrings = typeof EN;
export const brLocale = (locale: string): BrLocale => (locale === "fr" ? "fr" : "en");
/** Reject line copy: the code's text with its slots, or null for a code this client has no copy for. */
export function rejectCopy(t: BrStrings, code: string, params?: Readonly<Record<string, string>>): string | null {
  return Object.hasOwn(t.r, code) ? fillSlots(t.r[code]!, params) : null;
}
/** A cancel's reject line: the code's r.* text with its params, else cancelRejectedCode with the code verbatim. */
export function cancelRejectCopy(t: BrStrings, code: string, params?: Readonly<Record<string, string>>): string {
  return rejectCopy(t, code, params) ?? t.cancelRejectedCode(code);
}
/** Copy for a preview's `reasonCode` under the input: the mock sends the bare code ("BAD_QTY"), the engine the
 *  MKT_ one; either maps to the same r.* line, an unknown code reads as rejectedCode. */
export function reasonCopy(t: BrStrings, code: string): string {
  return rejectCopy(t, code.startsWith("MKT_") ? code : `MKT_${code}`) ?? t.rejectedCode(code);
}
/** Text scale at which the side segment and the preview rows stack (Studio #38). */
export const BR_STACK_SCALE = 1.5;
