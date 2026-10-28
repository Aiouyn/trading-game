// Broker ticket copy (UI card 4, BRK-A), EN + FR. The card's copy table is used verbatim. Keys the card does not give
// are marked [provisional] and listed as open Studio questions in the PR: haltedQueued FR, r.MKT_NO_LOCATE,
// last, today, loading. r.MKT_INSUFFICIENT_BP is the engine's code (05 §4.2, T05-11 step 1.8) and carries the card's
// "insufficient funds" copy; the card's MKT_INSUFFICIENT_FUNDS was only 19 §2.3's example code.
// updating / couldntLoad / retry / cash repeat Portfolio's existing copy so this chunk does not import Portfolio's.
// FR typography: U+202F before "%", "pb" and ":", and inside « ».
// UI card 5 (limit / stop / Open orders) keys follow the card's copy table; s.QUEUED_AUCTION is `haltedQueued` (orderStatus).
// UI card 6 (cancel) keys follow the card's copy table; sideName [provisional] is the arrow-less side its examples use.
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
