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
  // ---- M1-09 row chips (the detail and demo copy: storyStrings.ts, Wire chunk only) ----
  forecast: string;
  eased: string;
  /** t0 history rows (w-h-*): already happened; this clock did not apply the catalog move. */
  earlier: string;
  /** Distinct label for a player STATEMENT (soc.wire.post), not an official company statement. */
  playerPost: string;
  /** 15:625 verdict badge on a player statement row and detail. */
  verdict: { unresolved: string; true: string; false: string; opinion: string };
  composer: {
    summary: string;
    textLabel: string;
    assetsLabel: string;
    fee: string;
    submit: string;
    posting: string;
    charCount: string;
    loadError: string;
    retry: string;
    errors: Record<string, string>;
  };
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
    "wire.statement.denies": "{company} denies the rumor",
    "wire.news.analyst-note": "{house} sees {claim}",
    "wire.statement.player": "{handle} on {asset}: {text}",
    "wire.rumor.downgrade": "Downgrade rumored for {company}",
    "wire.rumor.hears": "{source} hears that {claim}",
    "wire.news.trialMiss": "{company} drug trial misses its endpoint",
    "wire.news.contractWin": "{company} wins a major contract",
    "wire.news.demandWarning": "{company} warns on demand",
    "wire.news.recall": "{company} recalls a product line",
    "wire.news.coinListed": "{coin} lists in the Broker after graduating",
    "wire.news.coinUp": "{coin} up {move}% today",
    "wire.news.coinDown": "{coin} down {move}% today",
    "wire.news.coinLiq": "{coin}: leveraged traders are being liquidated",
    "wire.crisis.oil.watch": "Watch: crude supply under threat",
    "wire.crisis.oil.hit": "Oil shock: crude supply cut",
    "wire.crisis.oil.eased": "Crude supply fears ease",
    "wire.crisis.bank.watch": "Watch: banks strain to borrow from each other",
    "wire.crisis.bank.hit": "Banking panic: depositors pull their cash",
    "wire.crisis.bank.eased": "Bank funding fears ease",
    "wire.crisis.tech.watch": "Watch: tech valuations stretched",
    "wire.crisis.tech.hit": "Tech bubble bursts",
    "wire.crisis.tech.eased": "Tech valuations cool off",
    "wire.crisis.credit.watch": "Watch: lenders tighten terms",
    "wire.crisis.credit.hit": "Credit crunch hits borrowers",
    "wire.crisis.credit.eased": "Credit conditions steady",
    "wire.storm.rate-scare.hit": "Rate scare: term premium jumps",
    "wire.storm.oil-spike-lite.hit": "Oil spike: crude supply tightens",
    "wire.storm.crypto-flush.hit": "Crypto flush: meme-coin hype collapses",
    "wire.storm.credit-wobble.hit": "Credit wobble: corporate default risk rises",
    "wire.storm.fx-squall.hit": "FX squall: capital flows reverse",
    "wire.storm.sector-rotation.hit": "Sector rotation: risk premiums reshuffle",
    "wire.storm.earnings-scare.hit": "Earnings scare: consensus cuts broaden",
    "wire.storm.liquidity-hiccup.hit": "Liquidity hiccup: market depth thins",
    "wire.major.equity-bubble-burst.hit": "Equity bubble bursts",
    "wire.major.oil-shock.hit": "Oil shock",
    "wire.major.flash-crash.hit": "Flash crash",
    "wire.major.crypto-winter.hit": "Crypto winter",
    "wire.major.trade-war.hit": "Trade war",
    "wire.major.stagflation.hit": "Stagflation scare",
    "wire.ripple.sector-shock.hit": "Sector shock",
    "wire.ripple.commodity-supply.hit": "Commodity supply wobble",
    "wire.ripple.commodity-demand.hit": "Commodity demand wobble",
    "wire.ripple.regulatory-note.hit": "Regulatory note",
    "wire.ripple.local-boom.hit": "Local boom",
    "wire.crisis-week.announced.storm-season": "Crisis Week: Storm Season",
    "wire.crisis-week.announced.the-squeeze": "Crisis Week: The Squeeze",
    "wire.crisis-week.announced.fault-lines": "Crisis Week: Fault Lines",
    "wire.crisis-week.announced.cold-front": "Crisis Week: Cold Front",
    "wire.crisis-week.announced.supply-shock-week": "Crisis Week: Supply Shock",
    "wire.crisis-week.announced.the-long-night": "Crisis Week: The Long Night",
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
  forecast: "Forecast",
  eased: "No effect",
  earlier: "Earlier",
  playerPost: "Player",
  verdict: { unresolved: "Open", true: "True", false: "False", opinion: "Opinion" },
  composer: {
    summary: "Post a statement",
    textLabel: "Statement",
    assetsLabel: "Assets",
    fee: "Costs $500 · {n} left today",
    submit: "Post",
    posting: "Posting…",
    charCount: "{n}/280",
    loadError: "Couldn't load the composer.",
    retry: "Retry",
    errors: {
      TEXT_EMPTY: "Write a short statement first.",
      TEXT_TOO_LONG: "Keep it to 280 characters.",
      TEXT_FILTER: "Remove any email or phone number.",
      BAD_ASSET: "Pick one to three listed assets.",
      INSUFFICIENT_CASH: "You need $500 spendable cash to post.",
      DAY_CAP: "You can post three times per game day.",
      IDEMPOTENCY_CONFLICT: "That request was already used for a different statement.",
      UNAUTHORIZED: "Sign in to post a statement.",
      STORED_UNREADABLE: "That statement could not be read back. It was not charged again.",
      BODY_TOO_LARGE: "That statement is too large.",
      BAD_REQUEST: "That statement could not be posted.",
    },
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
    "wire.statement.denies": "{company} dément la rumeur",
    "wire.news.analyst-note": "{house} anticipe {claim}",
    "wire.statement.player": "{handle} sur {asset} : {text}",
    "wire.rumor.downgrade": "Rumeur de dégradation pour {company}",
    "wire.rumor.hears": "{source} entend que {claim}",
    "wire.news.trialMiss": "L’essai clinique de {company} manque son objectif",
    "wire.news.contractWin": "{company} remporte un contrat majeur",
    "wire.news.demandWarning": "{company} alerte sur la demande",
    "wire.news.recall": "{company} rappelle une gamme de produits",
    "wire.news.coinListed": "{coin} entre au Broker après sa graduation",
    "wire.news.coinUp": "{coin} gagne {move} % aujourd’hui",
    "wire.news.coinDown": "{coin} perd {move} % aujourd’hui",
    "wire.news.coinLiq": "{coin} : les traders à effet de levier sont liquidés",
    "wire.crisis.oil.watch": "À surveiller : l’offre de brut menacée",
    "wire.crisis.oil.hit": "Choc pétrolier : l’offre de brut coupée",
    "wire.crisis.oil.eased": "Les craintes sur le brut s’apaisent",
    "wire.crisis.bank.watch": "À surveiller : les banques peinent à se refinancer",
    "wire.crisis.bank.hit": "Panique bancaire : les déposants retirent leurs fonds",
    "wire.crisis.bank.eased": "Les craintes de financement bancaire s’apaisent",
    "wire.crisis.tech.watch": "À surveiller : valorisations tech tendues",
    "wire.crisis.tech.hit": "La bulle tech éclate",
    "wire.crisis.tech.eased": "Les valorisations tech se calment",
    "wire.crisis.credit.watch": "À surveiller : les prêteurs durcissent leurs conditions",
    "wire.crisis.credit.hit": "Le resserrement du crédit frappe les emprunteurs",
    "wire.crisis.credit.eased": "Les conditions de crédit se stabilisent",
    "wire.storm.rate-scare.hit": "Peur des taux : la prime de terme bondit",
    "wire.storm.oil-spike-lite.hit": "Pic pétrolier : l’offre de brut se resserre",
    "wire.storm.crypto-flush.hit": "Flush crypto : l’engouement des meme coins s’effondre",
    "wire.storm.credit-wobble.hit": "Vacillement du crédit : le risque de défaut monte",
    "wire.storm.fx-squall.hit": "Rafale de change : les flux de capitaux s’inversent",
    "wire.storm.sector-rotation.hit": "Rotation sectorielle : les primes de risque bougent",
    "wire.storm.earnings-scare.hit": "Peur des résultats : les consensus baissent",
    "wire.storm.liquidity-hiccup.hit": "Accroc de liquidité : la profondeur de marché s’amincit",    "wire.major.equity-bubble-burst.hit": "Éclatement de bulle actions",
    "wire.major.oil-shock.hit": "Choc pétrolier",
    "wire.major.flash-crash.hit": "Krach éclair",
    "wire.major.crypto-winter.hit": "Hiver crypto",
    "wire.major.trade-war.hit": "Guerre commerciale",
    "wire.major.stagflation.hit": "Peur de stagflation",
    "wire.ripple.sector-shock.hit": "Choc sectoriel",
    "wire.ripple.commodity-supply.hit": "Offre de matières",
    "wire.ripple.commodity-demand.hit": "Demande de matières",
    "wire.ripple.regulatory-note.hit": "Note réglementaire",
    "wire.ripple.local-boom.hit": "Boom local",
    "wire.crisis-week.announced.storm-season": "Semaine de crise : tempêtes",
    "wire.crisis-week.announced.the-squeeze": "Semaine de crise : l’étau",
    "wire.crisis-week.announced.fault-lines": "Semaine de crise : failles",
    "wire.crisis-week.announced.cold-front": "Semaine de crise : front froid",
    "wire.crisis-week.announced.supply-shock-week": "Semaine de crise : choc d’offre",
    "wire.crisis-week.announced.the-long-night": "Semaine de crise : longue nuit",

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
  forecast: "Prévision",
  eased: "Sans effet",
  earlier: "Plus tôt",
  playerPost: "Joueur",
  verdict: { unresolved: "En cours", true: "Vrai", false: "Faux", opinion: "Opinion" },
  composer: {
    summary: "Publier une déclaration",
    textLabel: "Déclaration",
    assetsLabel: "Actifs",
    fee: "Coût : 500 $ · {n} restantes aujourd’hui",
    submit: "Publier",
    posting: "Publication…",
    charCount: "{n}/280",
    loadError: "Impossible de charger le composeur.",
    retry: "Réessayer",
    errors: {
      TEXT_EMPTY: "Écrivez d’abord une courte déclaration.",
      TEXT_TOO_LONG: "280 caractères au plus.",
      TEXT_FILTER: "Retirez toute adresse e-mail ou tout numéro de téléphone.",
      BAD_ASSET: "Choisissez un à trois actifs cotés.",
      INSUFFICIENT_CASH: "Il faut 500 $ d’espèces disponibles pour publier.",
      DAY_CAP: "Trois déclarations par jour de jeu au plus.",
      IDEMPOTENCY_CONFLICT: "Cette requête a déjà été utilisée pour une autre déclaration.",
      UNAUTHORIZED: "Connectez-vous pour publier.",
      STORED_UNREADABLE: "Impossible de relire cette déclaration. Aucun nouveau débit.",
      BODY_TOO_LARGE: "Cette déclaration est trop volumineuse.",
      BAD_REQUEST: "Impossible de publier cette déclaration.",
    },
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

/** Slots that carry a quantity: shown with the locale's digit grouping (EN 50,000 · FR 50 000). */
const QUANTITY_SLOTS: ReadonlySet<string> = new Set(["qty", "move"]);
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

/** A server percent ("-5.00", "3.00") as shown: sign always, U+2212 minus, "%" (no parsing or rounding). */
export function pctLabel(pct: string): string {
  const neg = pct.startsWith("-");
  const abs = neg ? pct.slice(1) : pct;
  return `${neg ? "\u2212" : /[1-9]/.test(abs) ? "+" : ""}${abs}%`;
}

/** Game time for a tick: the SAME clock source (`clockAt`) and formatter (`clockLabel` + `clockStrings().strip`) as the
 *  top bar, so a Wire stamp and the status strip always read the same "Day N · HH:MM" for the same tick. */
export function timeLabel(tick: number, t: WireStrings): string {
  const { day, hhmm } = clockLabel(clockAt(tick));
  return clockStrings(t.locale).strip(day, hhmm);
}
