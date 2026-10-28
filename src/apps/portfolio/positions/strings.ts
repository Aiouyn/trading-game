// Positions copy (UI card 3, 17B PF-B), EN + FR. Kept beside card 2's strings.ts rather than inside it so the card 2
// follow-ups (#67) and this card never edit the same file. Margin chip and Liq. copy: Studio PF-B round 2; other FR
// strings are proposed, pending Studio review.
export type PosLocale = "en" | "fr";
export type Direction = "up" | "down" | "flat";
export type MarginState = "OK" | "CALL" | "LIQUIDATING" | "DEFICIT" | "CLOSED";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

const EN = {
  table: "Positions",
  colAsset: "Asset",
  colQty: "Qty",
  colAvg: "Avg cost",
  colLast: "Last",
  colToday: "Today",
  colValue: "Value",
  colWeight: "Weight",
  colPnl: "P&L",
  loading: "Loading positions",
  updating: "Updating…",
  couldntLoad: "Couldn't load",
  retry: "Retry",
  emptyTitle: "No positions yet.",
  emptyBody: "Your money is all cash.",
  none: "—",
  pledged: (qty: string) => `Pledged ${qty}`,
  lent: (qty: string) => `Lent ${qty}`,
  halted: "Halted",
  pct: (n: string) => `${n}%`,
  /** pnlPct after the P&L amount (Studio PF-B round 2): "(+4.4%)". */
  pnlPct: (n: string) => `(${n}%)`,
  /** Value · weight on cards: "$14,718.00 · 4.4%". */
  dot: " · ",
  qtyAt: (qty: string, avg: string) => `${qty} @ ${avg}`,
  /** 17-AT-36 spoken row: "{ticker}, {qty} shares, value {spoken value}, {up|down} {chgPct} percent today". */
  rowLabel: (ticker: string, qty: string, value: string, dir: Direction | null, pct: string) =>
    [`${ticker}, ${qty} shares, value ${value}`, dir === null ? "" : dir === "flat" ? `, unchanged today` : `, ${dir} ${pct} percent today`].join(""),
  avgLast: (avg: string, last: string) => `, average cost ${avg}, last ${last}`,
  // Studio PF-B (E-56 §15): shown only when the server sends these fields (not in Position on this base).
  approx: "approx.",
  approxValue: (v: string) => `≈ ${v}`,
  /** Studio PF-B round 2: "Liquidation price, approximate"; the value follows so it is spoken. */
  liqAria: (v: string) => `Liquidation price, approximate, ${v}`,
  liq: "Liq.",
  margin: { CALL: "Margin call", LIQUIDATING: "Liquidating", DEFICIT: "Deficit", CLOSED: "Closed" } as Record<Exclude<MarginState, "OK">, string>,
};

type Strings = typeof EN;

const FR: Strings = {
  table: "Positions",
  colAsset: "Actif",
  colQty: "Qté",
  colAvg: "Coût moyen",
  colLast: "Cours",
  colToday: "Jour",
  colValue: "Valeur",
  colWeight: "Poids",
  colPnl: "P&L",
  loading: "Chargement des positions",
  updating: "Mise à jour…",
  couldntLoad: "Chargement impossible",
  retry: "Réessayer",
  emptyTitle: "Aucune position pour l’instant.",
  emptyBody: "Tout votre argent est en liquidités.",
  none: "—",
  pledged: (qty: string) => `Nanti${NBSP}${qty}`,
  lent: (qty: string) => `Prêté${NBSP}${qty}`,
  halted: "Suspendu",
  pct: (n: string) => `${n}${NNBSP}%`,
  pnlPct: (n: string) => `(${n}${NNBSP}%)`,
  dot: " · ",
  qtyAt: (qty: string, avg: string) => `${qty} @ ${avg}`,
  rowLabel: (ticker: string, qty: string, value: string, dir: Direction | null, pct: string) =>
    [`${ticker}, ${qty} actions, valeur ${value}`, dir === null ? "" : dir === "flat" ? `, inchangé aujourd’hui` : `, ${dir === "up" ? "en hausse de" : "en baisse de"} ${pct} pour cent aujourd’hui`].join(""),
  avgLast: (avg: string, last: string) => `, coût moyen ${avg}, dernier cours ${last}`,
  approx: "approx.",
  approxValue: (v: string) => `≈ ${v}`,
  liqAria: (v: string) => `Prix de liquidation, approximatif, ${v}`,
  liq: "Px liq.",
  margin: { CALL: "Appel de marge", LIQUIDATING: "En liquidation", DEFICIT: "Déficit", CLOSED: "Clôturée" },
};

export const POS_STRINGS: Record<PosLocale, Strings> = { en: EN, fr: FR };
export type PosStrings = Strings;
export const posStrings = (locale: string): Strings => POS_STRINGS[locale === "fr" ? "fr" : "en"];
