// Portfolio copy (UI card 2, 17B PF-A), EN + FR. App-local like src/apps/settings/strings.ts, so src/shell/strings.ts
// stays untouched. FR = proposed translations pending review; FR typography: no-break spaces before units and "…".
import type { MyFill } from "@/shell/contracts/channels";

export type PfLocale = "en" | "fr";
export type ReleaseUnit = "minute" | "hour" | "day";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

export type Liquidity = MyFill["liquidity"];
/** Recent fills columns (UI card 8), in table order. */
export const FILL_COLS = ["side", "asset", "qty", "price", "fee", "type", "tick"] as const;
export type FillCol = (typeof FILL_COLS)[number];
/** fillAria slots: every value is display text already (side word, grouped numbers, chip label). */
export interface FillAria { side: string; qty: string; ticker: string; price: string; fee: string; ccy: string; liquidity: string; tick: string }

/** #38 / Studio fix c: from text scale 1.5 the tab segment and every overview row stack. */
export const STACK_SCALE = 1.5;

const EN = {
  views: "Portfolio views",
  overview: "Overview",
  positions: "Positions",
  backToPortfolio: "Back to Portfolio",
  netWorth: "Net worth",
  loading: "Loading net worth",
  updating: "Updating…",
  couldntLoad: "Couldn't load", // existing shell copy (S.couldntLoad)
  retry: "Retry", // existing shell copy (S.retry)
  balances: "Balances",
  cash: (ccy: string) => `Cash · ${ccy}`,
  restricted: "Restricted cash",
  releasesIn: (n: string, unit: ReleaseUnit, one: boolean) => `releases in ${n} ${unit}${one ? "" : "s"}`,
  held: "held",
  restrictedCode: (code: string) => `Restricted (${code})`,
  stats: "Net worth stats",
  drawdownReal: "Drawdown (real)",
  sharpe: "Sharpe (whole NW)",
  none: "—",
  rank: "Rank",
  nextRankAt: "Next rank at",
  topRank: "Top rank",
  emptyCash: "Your money is all cash. Broker or Businesses are good first stops.",
  // UI card 8 (Orders tab: open orders + recent fills). Side and Open orders copy come from Broker's brStrings.
  orders: "Orders",
  recentFills: "Recent fills",
  fillsHelp: "Your latest trades. Older ones will appear in order history.",
  noFills: "No trades yet.",
  col: { side: "Side", asset: "Asset", qty: "Qty", price: "Price", fee: "Fee", type: "Type", tick: "Tick" } as Record<FillCol, string>,
  liq: { MAKER: "Maker", TAKER: "Taker", AUCTION: "Auction" } as Record<Liquidity, string>,
  fillTick: (n: string) => `tick ${n}`,
  fillAria: (a: FillAria) => `${a.side} ${a.qty} ${a.ticker} at ${a.price}, fee ${a.fee} ${a.ccy}, ${a.liquidity}, tick ${a.tick}`,
  fillsCaption: "Recent fills, newest first",
};

type Strings = typeof EN;

const FR_UNITS: Record<ReleaseUnit, [string, string]> = { minute: ["minute", "minutes"], hour: ["heure", "heures"], day: ["jour", "jours"] };

const FR: Strings = {
  views: "Vues du portefeuille",
  overview: "Vue d’ensemble",
  positions: "Positions",
  backToPortfolio: "Retour au portefeuille",
  netWorth: "Patrimoine net",
  loading: "Chargement du patrimoine net",
  updating: "Mise à jour…",
  couldntLoad: "Chargement impossible",
  retry: "Réessayer",
  balances: "Soldes",
  cash: (ccy: string) => `Liquidités · ${ccy}`,
  restricted: "Liquidités bloquées",
  releasesIn: (n: string, unit: ReleaseUnit, one: boolean) => `déblocage dans ${n}${NBSP}${FR_UNITS[unit][one ? 0 : 1]}`,
  held: "retenu",
  restrictedCode: (code: string) => `Bloqué (${code})`,
  stats: "Statistiques du patrimoine net",
  drawdownReal: "Drawdown (réel)",
  sharpe: "Sharpe (patrimoine total)",
  none: "—",
  rank: "Rang",
  nextRankAt: "Rang suivant à",
  topRank: "Rang maximal",
  emptyCash: "Tout votre argent est en liquidités. Le Courtier ou les Entreprises sont de bons points de départ.",
  orders: "Ordres",
  recentFills: "Exécutions récentes",
  fillsHelp: "Vos dernières transactions. Les plus anciennes figureront dans l’historique des ordres.",
  noFills: "Aucune transaction pour l’instant.",
  col: { side: "Sens", asset: "Actif", qty: "Qté", price: "Cours", fee: "Frais", type: "Type", tick: "Tick" },
  liq: { MAKER: "Apporteur", TAKER: "Preneur", AUCTION: "Enchère" },
  fillTick: (n: string) => `tick ${n}`,
  fillAria: (a: FillAria) => `${a.side} ${a.qty} ${a.ticker} à ${a.price}, frais${NNBSP}: ${a.fee} ${a.ccy}, ${a.liquidity}, tick ${a.tick}`,
  fillsCaption: "Exécutions récentes, des plus récentes aux plus anciennes",
};

export const PF_STRINGS: Record<PfLocale, Strings> = { en: EN, fr: FR };
export const pfLocale = (locale: string): PfLocale => (locale === "fr" ? "fr" : "en");
export const pfStrings = (locale: string): Strings => PF_STRINGS[pfLocale(locale)];
/** Grouping for small counts in copy (17 §3.4.5 numberLocale). */
export const pfNumberLocale = (locale: string) => (pfLocale(locale) === "fr" ? "fr-FR" : "en-US");
