// English copy for the shell (keys per 17 §3.17). Components never contain raw JSX text.
import type { AppId } from "./registry";

export const APP_NAMES: Record<AppId, string> = {
  broker: "Broker", portfolio: "Portfolio", wire: "Wire", messages: "Messages", markets: "Markets",
  risk: "Risk", quantlab: "Quant Lab", research: "Research Desk", businesses: "Businesses", company: "Company",
  property: "Property", city: "City", bank: "Bank & Credit", funds: "Funds", insurance: "Insurance",
  institutions: "Institutions", ailab: "AI Lab", security: "Security", legal: "Legal & Court", estate: "Estate",
  boards: "Boards", profile: "Profile", alliance: "Alliance", contracts: "Contracts", auctions: "Auctions",
  civic: "Civic", academy: "Academy", help: "Help", atelier: "Atelier", settings: "Settings", replay: "Replay", api: "API",
};

export const S = {
  quay: "Quay",
  launcherPlaceholder: "Find an app, a ticker, a command",
  ctrlK: "Ctrl K",
  ctrlDot: "Ctrl .",
  comingLater: "Coming later",
  loadingCity: "Loading city…",
  marketOpen: "Market open · Port Avalon",
  focus: "Focus",
  layout: "Layout",
  layouts: "Layouts",
  workspace: "Workspace",
  workspaces: "Workspaces",
  shelf: "Shelf",
  netWorth: "Net worth",
  bell: "Notifications",
  recent: "Recent",
  noRecent: "Nothing open yet.",
  nothingFound: "Nothing found · Search help",
  close: "Close",
  collapse: "Collapse",
  fill: "Fill",
  back: "Back",
  backTo: "Back to",
  cancel: "Cancel",
  textScale: "Text size",
  halted: "Trading halted by the Exchange",
  tick: "Tick",
  cityName: "Port Avalon",
  phaseHalted: "Trading halted",
  haltedReason: "Reason: market integrity review. Read-only screens stay open.",
  held: "Held",
  heldBody: "Your account is held. Read-only screens stay open.",
  reconnecting: "Reconnecting…",
  home: "Home",
  locked: "Locked",
  more: "More",
  next: "Next",
  protected: "Protected",
  settingsPalette: "Palette",
  settingsMotion: "Reduce motion",
  settingsTransparency: "Reduce transparency",
  keySheet: "Keys",
  keySheetFooter: "Nothing executes without Enter.",
  couldntLoad: "Couldn't load",
  cityCouldntLoad: "Couldn't load the city",
  offline: "Offline · read-only snapshot",
  retry: "Retry",
  retrying: "Retrying…",
  // MoneyText speech and restricted-cash pills (17 §3.4.6, §3.5)
  moneyMinus: "minus",
  moneyAbout: "about",
  moneyDollars: "dollars",
  restrictedAD: "AD",
  restrictedSTART: "START",
} as const;

/** Phone app-bar titles for in-app screens (level 2); the app root shows APP_NAMES (Studio T4 ruling 1). */
export const SCREEN_NAMES: Record<string, string> = { journal: "Journal" };

/** French copy for the T4 app-bar keys. TODO: wire when a locale switch exists (no FR runtime yet). */
export const S_FR = { back: "Retour", backTo: "Retour à", home: "Accueil" } as const;
export const SCREEN_NAMES_FR: Record<string, string> = { journal: "Journal" };

export const GROUP_LABELS = { trade: "Trade", build: "Build", shadow: "Shadow", world: "World", me: "Me" } as const;

// TODO(17A T4): the "Players and companies" group stays empty until a search data source exists (trigger: player/company search source).
export const LAUNCHER_GROUPS = ["Apps", "Tickers", "Players and companies", "Commands", "Recent", "Help"] as const;
