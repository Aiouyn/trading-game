// Portfolio copy (UI card 2, 17B PF-A), EN + FR. App-local like src/apps/settings/strings.ts, so src/shell/strings.ts
// stays untouched. FR = proposed translations pending review; FR typography: no-break spaces before units and "…".
export type PfLocale = "en" | "fr";
export type ReleaseUnit = "minute" | "hour" | "day";

const NBSP = "\u00A0";

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
  stats: "Net worth stats",
  drawdownReal: "Drawdown (real)",
  sharpe: "Sharpe (whole NW)",
  none: "—",
  rank: "Rank",
  nextRankAt: "Next rank at",
  topRank: "Top rank",
  emptyCash: "Your money is all cash. Broker or Businesses are good first stops.",
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
  stats: "Statistiques du patrimoine net",
  drawdownReal: "Drawdown (réel)",
  sharpe: "Sharpe (patrimoine total)",
  none: "—",
  rank: "Rang",
  nextRankAt: "Rang suivant à",
  topRank: "Rang maximal",
  emptyCash: "Votre argent est entièrement en liquidités. Broker ou Businesses sont de bons points de départ.",
};

export const PF_STRINGS: Record<PfLocale, Strings> = { en: EN, fr: FR };
export const pfLocale = (locale: string): PfLocale => (locale === "fr" ? "fr" : "en");
export const pfStrings = (locale: string): Strings => PF_STRINGS[pfLocale(locale)];
/** Grouping for small counts in copy (17 §3.4.5 numberLocale). */
export const pfNumberLocale = (locale: string) => (pfLocale(locale) === "fr" ? "fr-FR" : "en-US");
