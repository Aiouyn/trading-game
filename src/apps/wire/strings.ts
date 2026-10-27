// Wire copy (UI card 1 · WIR-A). EN + FR; headline templates and kind labels are [P] pending Studio copy.
// Slot values are inserted verbatim (they are display strings from the server); nothing here parses a WireItem field.
"use client";
import type { WireItem, WireKind } from "@/shell/contracts/channels";
import { clockParts } from "@/game/clock";
import { TICKS_PER_DAY } from "@/shell/mockChannels";
import { S } from "@/shell/strings";
import { useShell } from "@/components/shell/ShellContext";

export type WireFilter = "all" | "news" | "filings" | "trades" | "verdicts" | "purchases" | "milestones" | "rumors" | "world" | "statements";
type Band = NonNullable<WireItem["sourceBand"]>;
type PricedIn = NonNullable<WireItem["pricedInBand"]>;

export interface WireStrings {
  filtersLabel: string;
  filter: Record<WireFilter, string>;
  kind: Record<WireKind, string>;
  band: Record<Band, string>;
  pricedIn: Record<PricedIn, string>;
  pricedInLabel: string;
  sourceRecord: string;
  asOf: string;
  time: string;
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
  time: "Day {day} · {hhmm}",
  breaking: "Breaking",
  newItems: "{n} new",
  updating: "Updating…",
  loading: "Loading Wire",
  listLabel: "Wire items", // [P]
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
  time: "Jour {day} · {hhmm}",
  breaking: "Urgent",
  newItems: "{n} nouveau(x)",
  updating: "Mise à jour…",
  loading: "Chargement du fil",
  listLabel: "Dépêches", // [P]
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

/** Headline from `strings[headlineKey]` + slots; an unknown key (or a missing slot) shows kind label + entity labels, never the key. */
export function headline(item: WireItem, t: WireStrings): string {
  const tpl = Object.hasOwn(t.headlines, item.headlineKey) ? t.headlines[item.headlineKey]! : null;
  const text = tpl === null ? null : fill(tpl, item.slots ?? {});
  if (text !== null) return text;
  const labels = item.entities.map((e) => e.label).join(", ");
  return labels ? `${t.kind[item.kind]} · ${labels}` : t.kind[item.kind];
}

/** Game time for a tick; EN matches game/clock `clockLabel(tick, TICKS_PER_DAY)`. */
export function timeLabel(tick: number, t: WireStrings): string {
  const p = clockParts(tick, TICKS_PER_DAY);
  return fill(t.time, { day: String(p.day), hhmm: p.hhmm })!;
}
