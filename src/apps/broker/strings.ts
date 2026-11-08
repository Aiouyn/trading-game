// Broker ticket copy (UI card 4, BRK-A), EN + FR. The card's copy table is used verbatim. Keys the card does not give
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

const NNBSP = "\u202F";

/** `{slot}` placeholders filled from a reject's `rejectParams`; unknown slots stay as written. */
export function fillSlots(template: string, params: Readonly<Record<string, string>> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (params && Object.hasOwn(params, k) ? params[k]! : all));
}

const EN = {
  asset: "Asset",
  side: "Side",
  buy: "↑ Buy",
  sell: "↓ Sell",
  qty: "Quantity",
  qtyEmpty: "Enter a quantity.",
  qtyDigits: "Use digits only.",
  orderKind: "Market · Day",
  youHold: (qty: string) => `You hold ${qty}`,
  /** Label before the FDL MoneyText (Portfolio's existing "Cash · {ccy}" copy). */
  cash: "Cash · FDL",
  /** [provisional] header labels: Positions' column copy (PF-B); the card does not say whether Last/Today carry labels. */
  last: "Last",
  today: "Today",
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
  capLeft: "First-trade cap left",
  refreshing: "Refreshing estimate…",
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
  } as Record<string, string>,
  halted: "Halted",
  /** Not shown (E-98 (1)): Designer to replace. */
  haltedHelp: "Orders are paused while trading is halted.",
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
  study: { sma: "SMA", ema: "EMA" },
  studyHint: { sma: "Simple moving average: the mean of the last closes", ema: "Exponential moving average: recent closes weigh more" },
  studiesLabel: "Chart overlays",
  studiesLocal: "Overlay choices are kept on this device only",
  studyPeriodAria: (name: string) => `${name} period, in bars`,
  studyPeriod: (n: number) => `${n} bars`,
  studyShort: (name: string, n: number, have: number) => `${name} ${n} needs ${n} bars; this range has ${have}.`,
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

const FR: BrStrings = {
  asset: "Actif",
  side: "Sens",
  buy: "↑ Achat",
  sell: "↓ Vente",
  qty: "Quantité",
  qtyEmpty: "Saisissez une quantité.",
  qtyDigits: "Chiffres uniquement.",
  orderKind: "Au marché · Jour",
  youHold: (qty) => `Vous détenez ${qty}`,
  cash: "Liquidités · FDL",
  last: "Cours",
  today: "Jour",
  serverTick: (n: number) => `Tick serveur ${n}`,
  none: "—",
  review: "Vérifier l’ordre",
  edit: "Modifier",
  place: "Passer l’ordre",
  actionBuy: (qty, ticker) => `Acheter ${qty} ${ticker}`,
  actionSell: (qty, ticker) => `Vendre ${qty} ${ticker}`,
  estimateAt: (n) => `Estimation · au tick ${n}`,
  price: "Cours",
  estFill: "Exécution est.",
  fee: "Frais",
  impact: "Impact est.",
  bp: (n) => `${n}${NNBSP}pb`,
  total: "Total est.",
  bpAfter: "Pouvoir d’achat après",
  capLeft: "Plafond premier ordre restant",
  refreshing: "Actualisation de l’estimation…",
  note: "Les cours peuvent baisser. C’est le jeu.",
  pending: (n) => `En attente · tick ${n}`,
  bought: (qty, ticker, price) => `Achat de ${qty} ${ticker} à ${price}`,
  sold: (qty, ticker, price) => `Vente de ${qty} ${ticker} à ${price}`,
  feeLine: (fee) => `Frais ${fee}`,
  received: "Ordre reçu.",
  newOrder: "Nouvel ordre",
  rejected: "Ordre refusé",
  rejectedCode: (code) => `Ordre refusé (code «${NNBSP}${code}${NNBSP}»)`,
  r: {
    MKT_INSUFFICIENT_BP: "Liquidités insuffisantes pour cet ordre.",
    MKT_HALTED: "La cotation de cet actif est suspendue.",
    MKT_UNKNOWN_ASSET: "Cet actif ne peut pas être négocié.",
    MKT_BAD_QTY: "Vérifiez la quantité.",
    MKT_NO_LOCATE: "Vous ne pouvez pas vendre plus que vous ne détenez.",
    MKT_BAD_PRICE: "Vérifiez le cours.",
    MKT_ORDER_TYPE_UNSUPPORTED: "Seuls les ordres au marché et à cours limité sont disponibles.",
    MKT_TOO_MANY_ORDERS: "Trop d’ordres en cours. Annulez-en un d’abord.",
  },
  halted: "Suspendu",
  haltedHelp: "Les ordres sont suspendus pendant l’arrêt de la cotation.",
  /** [provisional] FR of the neutral default. */
  haltedQueued: "Attend la réouverture",
  placeAria: (action) => `Passer l’ordre${NNBSP}: ${action}`,
  loading: "Chargement du ticket d’ordre",
  updating: "Mise à jour…",
  couldntLoad: "Chargement impossible",
  retry: "Réessayer",
  orderType: "Type d’ordre",
  t: { market: "Au marché", limit: "Limite", stop: "Stop", stopLimit: "Stop limite" },
  kindDay: (type) => `${type} · Jour`,
  limitPrice: "Cours limite",
  stopPrice: "Cours de déclenchement",
  priceEmpty: "Saisissez un cours.",
  priceFormat: "Saisissez un nombre, par ex. 42,10.",
  termsLimit: (p) => `Limite ${p}`,
  termsStop: (p) => `Stop ${p}`,
  termsStopLimit: (s, l) => `Stop ${s} · Limite ${l}`,
  actionTerms: (action, terms) => `${action} · ${terms}`,
  restingAck: "Ordre passé. Il figure dans les ordres en cours.",
  openOrders: "Ordres en cours",
  noOpenOrders: "Aucun ordre en cours.",
  filledOf: (filled, qty) => `${filled} / ${qty} exécutés`,
  s: { PENDING: "En attente", WORKING: "Actif", PARTIAL: "Partiellement exécuté" },
  rowMeta: (n) => `Jour · tick ${n}`,
  rowAria: (side, qty, ticker, terms, status) => `${side} ${qty} ${ticker}, ${terms}, ${status}`,
  loadingOrders: "Chargement des ordres en cours",
  sideName: { BUY: "Achat", SELL: "Vente" },
  cancel: "Annuler",
  cancelAria: (side, qty, ticker, terms) => `Annuler l’ordre${NNBSP}: ${side} ${qty} ${ticker}, ${terms}`,
  cancelConfirm: `Annuler cet ordre${NNBSP}?`,
  keepOrder: "Conserver l’ordre",
  confirmCancel: "Oui, annuler",
  cancelling: (n) => `Annulation… · tick ${n}`,
  cancelled: (side, qty, ticker, terms) => `Ordre annulé${NNBSP}: ${side} ${qty} ${ticker}, ${terms}`,
  cancelRejectedCode: (code) => `Annulation refusée (code «${NNBSP}${code}${NNBSP}»)`,
  cancelSendFailed: "Envoi impossible. Réessayez.",
  chartTitle: "Cours",
  range: { "1H": `1${NNBSP}h`, "1D": `1${NNBSP}j`, "1W": `1${NNBSP}sem.`, "1Q": `1${NNBSP}trim.`, "1Y": `1${NNBSP}an`, All: "Tout" },
  rangeAria: "Période du graphique",
  chartAria: (ticker, range, first, last) => `Cours de ${ticker}, ${range}${NNBSP}: de ${first} à ${last}`,
  crosshairAria: (time, o, h, l, c, v) => `${time}${NNBSP}: ouverture ${o}, haut ${h}, bas ${l}, clôture ${c}, volume ${v}`,
  legend: { o: "O", h: "H", l: "B", c: "C", v: "Vol." },
  sourceServer: `Cours Port Avalon · volume${NNBSP}: ordres exécutés`,
  sourceSince: (time) => `enregistré depuis ${time}`,
  sourceDemo: "Historique de démonstration (données d’exemple, pas votre compte)",
  tickLabel: (n) => `t ${n}`,
  viewTable: "Voir le tableau",
  viewChart: "Voir le graphique",
  trendTool: "Ligne de tendance",
  trendCancel: "Annuler la ligne",
  trendDelete: "Supprimer la ligne",
  trendHint: `Cliquez ou touchez deux points du graphique. Échap annule.`,
  trendLocal: "Les lignes restent sur cet appareil uniquement",
  trendLayer: "Lignes de tendance",
  trendReadError: "Vos lignes enregistrées n’ont pas pu être lues sur cet appareil.",
  trendUnsaved: "Votre dernière modification de ligne n’a pas été conservée sur cet appareil.",
  study: { sma: "MMS", ema: "MME" },
  studyHint: { sma: `Moyenne mobile simple${NNBSP}: la moyenne des dernières clôtures`, ema: `Moyenne mobile exponentielle${NNBSP}: les clôtures récentes pèsent plus` },
  studiesLabel: "Indicateurs du graphique",
  studiesLocal: "Les choix d’indicateurs restent sur cet appareil uniquement",
  studyPeriodAria: (name) => `Période de la ${name}, en barres`,
  studyPeriod: (n) => `${n} barres`,
  studyShort: (name, n, have) => `La ${name} ${n} demande ${n} barres${NNBSP}; cette plage en a ${have}.`,
  studiesReadError: "Vos choix d’indicateurs n’ont pas pu être lus sur cet appareil.",
  studiesUnsaved: "Votre dernier changement d’indicateur n’a pas été conservé sur cet appareil.",
  trendAria: (n, t1, p1, t2, p2) => `Ligne de tendance ${n}${NNBSP}: ${t1} à ${p1} jusqu’à ${t2} à ${p2}`,
  trendEnd: (start, time, price) => `${start ? "Début de la ligne" : "Fin de la ligne"}${NNBSP}: ${time} à ${price}. Les flèches la déplacent.`,
  col: { time: "Heure", open: "Ouverture", high: "Plus haut", low: "Plus bas", close: "Clôture", volume: "Volume" },
  chartError: "Impossible de charger le graphique",
  noHistory: "Pas encore d’historique de cours.",
  chartLoading: "Chargement du graphique de cours",
  viewTrade: "Trader",
  viewAbout: "À propos",
  viewAria: "Vue du courtier",
  tabsAria: "À propos de cet actif",
  tabOverview: "Aperçu",
  tabNews: "Actualités",
  backToTrade: "Retour au trading",
  f: { name: "Nom", ticker: "Code", type: "Type", sector: "Secteur", region: "Région", ccy: "Devise", licence: "Licence", quote: "Cours", trading: "Cotation", position: "Votre position" },
  class: { equity: "Action", index: "Indice" },
  positionLine: (qty, value) => `${qty} titres · ${value}`,
  noPosition: "Vous ne détenez pas cet actif.",
  st: {
    CLOSED: "Fermé", PRE_OPEN: "Pré-ouverture", OPENING_AUCTION: "Enchère d’ouverture", CONTINUOUS: "Ouvert", CLOSING_AUCTION: "Enchère de clôture",
    AFTER_HOURS: "Après-bourse", HALTED: "Suspendu temporairement", VOL_INTERRUPTION: "Pause de volatilité", LIMIT_LOCKED: "Bloqué en limite", SUSPENDED: "Suspendu",
  },
  noNews: (ticker) => `Aucune dépêche sur ${ticker} dans votre fil pour l’instant.`,
  newsHelp: "Seules les dépêches récentes sont conservées.",
  openStoryAria: (headline) => `Ouvrir dans le fil${NNBSP}: ${headline}`,
  unknownAsset: "Les détails de cet actif ne sont pas disponibles.",
  newsLoading: "Chargement des dépêches",
  assetOption: (ticker, name) => `${ticker} · ${name}`,
};

export const BR_STRINGS: Record<BrLocale, BrStrings> = { en: EN, fr: FR };
export const brLocale = (locale: string): BrLocale => (locale === "fr" ? "fr" : "en");
export const brStrings = (locale: string): BrStrings => BR_STRINGS[brLocale(locale)];
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
