// Wire copy (UI card 1 · WIR-A). EN + FR; headline templates and kind labels are [P] pending Studio copy.
// Slot values are inserted verbatim (they are display strings from the server); nothing here parses a WireItem field.
"use client";
import type { Filing, WireItem, WireKind } from "@/shell/contracts/channels";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { S, clockStrings, type ShellLocale } from "@/shell/strings";
import { useShell } from "@/components/shell/ShellContext";

export type WireFilter = "all" | "news" | "filings" | "trades" | "verdicts" | "purchases" | "milestones" | "rumors" | "world" | "statements";
type Band = NonNullable<WireItem["sourceBand"]>;
type PricedIn = NonNullable<WireItem["pricedInBand"]>;
/** Filing `fields` keys with a label and a display rule (card 9); any other key shows as `key: value`, raw. */
export type FilingField = "pct" | "qty" | "price" | "side";
const NNBSP = "\u202F";

export interface WireStrings {
  filtersLabel: string;
  filter: Record<WireFilter, string>;
  kind: Record<WireKind, string>;
  band: Record<Band, string>;
  pricedIn: Record<PricedIn, string>;
  pricedInLabel: string;
  sourceRecord: string;
  asOf: string;
  /** Shell locale: Wire stamps use the top bar's own clock formatter (`clockStrings(locale).strip`). */
  locale: ShellLocale;
  breaking: string;
  newItems: string;
  updating: string;
  loading: string;
  /** Accessible name of the scrollable list (keyboard-scrollable region). */
  listLabel: string;
  denied: string;
  empty: string;
  couldntLoad: string;
  retry: string;
  headlines: Record<string, string>;
  // ---- item detail (UI card 9 · WIR-9) ----
  /** Accessible name of a row's open button. */
  openItem: string;
  backToWire: string;
  noSelection: string;
  assets: string;
  openInBroker: string;
  openInBrokerAria: string;
  source: string;
  /** The detail's record line (the row keeps card 1's short `sourceRecord`). */
  recordLine: string;
  /** Section title; card 1's `pricedInLabel` stays the row chip's name. */
  pricedInTitle: string;
  filing: string;
  filedBy: string;
  subject: string;
  field: Record<FilingField, string>;
  pctValue: string;
  /** Filing `side` values, copied from the Broker's side labels (no Broker import in the Wire chunk). */
  side: Record<"BUY" | "SELL", string>;
  filingType: Record<Filing["type"], string>;
  filingMissing: string;
  notInFeed: string;
}

export const EN: WireStrings = {
  filtersLabel: "Wire filters",
  filter: { all: "All", news: "News", filings: "Filings", trades: "Trades", verdicts: "Verdicts", purchases: "Purchases", milestones: "Milestones", rumors: "Rumors", world: "World events", statements: "Statements" },
  kind: {
    NEWS: "News", RUMOR: "Rumor", FILING: "Filing", VERDICT: "Verdict", MARKET: "Trade", PURCHASE: "Purchase", ALLIANCE: "Alliance",
    STATEMENT: "Statement", OUTLET: "Outlet", CHAPTER: "Chapter", RECORD: "Record", RANK: "Rank", PHILANTHROPY: "Philanthropy",
    WORLD_EVENT: "World event", DAILY_CLOSE: "Daily close",
  },
  band: { low: "Low", mixed: "Mixed", solid: "Solid" },
  pricedIn: { early: "Early", mid: "Mid", late: "Late", done: "Done" },
  pricedInLabel: "Priced in",
  sourceRecord: "Source record {hits}/{resolved}",
  asOf: "as of {time}",
  locale: "en",
  breaking: "Breaking",
  newItems: "{n} new",
  updating: "Updating…",
  loading: "Loading Wire",
  listLabel: "Wire feed",
  denied: "Wire isn't available on this account.",
  empty: "Nothing in this filter yet.",
  couldntLoad: S.couldntLoad,
  retry: S.retry,
  headlines: {
    "wire.news.earningsBeat": "{company} beats earnings expectations",
    "wire.rumor.takeover": "Takeover talk around {company}",
    "wire.filing.ownership5": "{filer} discloses a major stake in {company}",
    "wire.market.blockTrade": "Block trade: {qty} {asset}",
    "wire.news.guidanceRaised": "{company} raises guidance",
    "wire.statement.ceo": "{company} CEO issues a statement",
    "wire.rumor.downgrade": "Downgrade rumored for {company}",
  },
  openItem: "Open: {headline}",
  backToWire: "Back to Wire",
  noSelection: "Select a story to read it here.",
  assets: "Assets",
  openInBroker: "Open in Broker",
  openInBrokerAria: "Open {ticker} in Broker",
  source: "Source",
  recordLine: "{hits} of {resolved} past claims held up",
  pricedInTitle: "Priced in",
  filing: "Filing",
  filedBy: "Filed by",
  subject: "Company",
  field: { pct: "Stake", qty: "Quantity", price: "Price", side: "Side" },
  pctValue: `{v}${NNBSP}%`,
  side: { BUY: "↑ Buy", SELL: "↓ Sell" },
  filingType: {
    ownership_5pct: "Major stake", insider: "Insider trade", quarterly_holdings: "Quarterly holdings",
    company_statement: "Company statement", fund_disclosure: "Fund disclosure", regulatory: "Regulatory",
  },
  filingMissing: "Filing details aren't available.",
  notInFeed: "This story is no longer in your feed.",
};

export const FR: WireStrings = {
  filtersLabel: "Filtres du fil",
  filter: { all: "Tout", news: "Actualités", filings: "Déclarations", trades: "Transactions", verdicts: "Verdicts", purchases: "Achats", milestones: "Jalons", rumors: "Rumeurs", world: "Événements mondiaux", statements: "Communiqués" },
  kind: {
    NEWS: "Actualité", RUMOR: "Rumeur", FILING: "Déclaration", VERDICT: "Verdict", MARKET: "Transaction", PURCHASE: "Achat", ALLIANCE: "Alliance",
    STATEMENT: "Communiqué", OUTLET: "Média", CHAPTER: "Chapitre", RECORD: "Record", RANK: "Rang", PHILANTHROPY: "Philanthropie",
    WORLD_EVENT: "Événement mondial", DAILY_CLOSE: "Clôture du jour",
  },
  band: { low: "Faible", mixed: "Mitigé", solid: "Solide" },
  pricedIn: { early: "Précoce", mid: "Partiel", late: "Avancé", done: "Intégré" },
  pricedInLabel: "Intégré au prix",
  sourceRecord: "Fiabilité de la source {hits}/{resolved}",
  asOf: "au {time}",
  locale: "fr",
  breaking: "Urgent",
  newItems: "{n} nouveau(x)",
  updating: "Mise à jour…",
  loading: "Chargement du fil",
  listLabel: "Fil des dépêches",
  denied: "Le fil n'est pas disponible sur ce compte.",
  empty: "Rien dans ce filtre pour l'instant.",
  couldntLoad: "Chargement impossible",
  retry: "Réessayer",
  headlines: {
    "wire.news.earningsBeat": "{company} dépasse les attentes de résultats",
    "wire.rumor.takeover": "Rumeurs de rachat autour de {company}",
    "wire.filing.ownership5": "{filer} déclare une participation importante dans {company}",
    "wire.market.blockTrade": "Transaction de bloc : {qty} {asset}",
    "wire.news.guidanceRaised": "{company} relève ses prévisions",
    "wire.statement.ceo": "Le PDG de {company} publie un communiqué",
    "wire.rumor.downgrade": "Rumeur de dégradation pour {company}",
  },
  openItem: `Ouvrir${NNBSP}: {headline}`,
  backToWire: "Retour au fil",
  noSelection: "Sélectionnez une dépêche pour la lire ici.",
  assets: "Actifs",
  openInBroker: "Ouvrir dans Broker",
  openInBrokerAria: "Ouvrir {ticker} dans Broker",
  source: "Source",
  recordLine: "{hits} sur {resolved} affirmations passées se sont vérifiées",
  pricedInTitle: "Intégré aux cours",
  filing: "Déclaration",
  filedBy: "Déclarant",
  subject: "Société",
  field: { pct: "Participation", qty: "Quantité", price: "Cours", side: "Sens" },
  pctValue: `{v}${NNBSP}%`,
  side: { BUY: "↑ Achat", SELL: "↓ Vente" },
  filingType: {
    ownership_5pct: "Participation importante", insider: "Opération d’initié", quarterly_holdings: "Positions trimestrielles",
    company_statement: "Communiqué de société", fund_disclosure: "Publication de fonds", regulatory: "Réglementaire",
  },
  filingMissing: "Les détails de la déclaration ne sont pas disponibles.",
  notInFeed: "Cette dépêche ne figure plus dans votre fil.",
};

export const useWireStrings = (): WireStrings => (useShell((s) => s.prefs.locale) === "fr" ? FR : EN);

/** `{name}` interpolation; returns null if the template names a value that wasn't given. */
export function fill(tpl: string, vals: Readonly<Record<string, string>>): string | null {
  let missing = false;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!Object.hasOwn(vals, k)) { missing = true; return ""; }
    return vals[k]!;
  });
  return missing ? null : out;
}

/** Slots that carry a quantity: shown with the locale's digit grouping (EN 50,000 · FR 50 000). */
const QUANTITY_SLOTS: ReadonlySet<string> = new Set(["qty"]);
const DECIMAL = /^\d+(\.\d+)?$/;
const numberFormats = new Map<ShellLocale, Intl.NumberFormat>();

/** i18n grouping of a decimal-string slot. Intl formats the STRING exactly (ES2023 string numeric literal), so the
 *  client never parses or rounds a server value (WIR-1-11); anything that isn't a plain decimal is shown as sent. */
export function groupQuantity(value: string, locale: ShellLocale): string {
  if (!DECIMAL.test(value)) return value;
  let nf = numberFormats.get(locale);
  if (!nf) numberFormats.set(locale, (nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 20 })));
  return nf.format(value as Intl.StringNumericLiteral);
}

const displaySlots = (slots: Readonly<Record<string, string>>, locale: ShellLocale): Record<string, string> =>
  Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, QUANTITY_SLOTS.has(k) ? groupQuantity(v, locale) : v]));

/** Headline from `strings[headlineKey]` + slots; an unknown key (or a missing slot) shows kind label + entity labels, never the key. */
export function headline(item: WireItem, t: WireStrings): string {
  const tpl = Object.hasOwn(t.headlines, item.headlineKey) ? t.headlines[item.headlineKey]! : null;
  const text = tpl === null ? null : fill(tpl, displaySlots(item.slots ?? {}, t.locale));
  if (text !== null) return text;
  const labels = item.entities.map((e) => e.label).join(", ");
  return labels ? `${t.kind[item.kind]} · ${labels}` : t.kind[item.kind];
}

/** Game time for a tick: the SAME clock source (`clockAt`) and formatter (`clockLabel` + `clockStrings().strip`) as the
 *  top bar, so a Wire stamp and the status strip always read the same "Day N · HH:MM" for the same tick. */
export function timeLabel(tick: number, t: WireStrings): string {
  const { day, hhmm } = clockLabel(clockAt(tick));
  return clockStrings(t.locale).strip(day, hhmm);
}
