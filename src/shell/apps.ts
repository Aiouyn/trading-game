/**
 * Quay app registry (F:25-26, V:82-98, DECISIONS C-38). Static data only: no React, no DOM,
 * no engine imports. Each app states what it requires; the unlock predicate that reads the
 * earned rank lives in ctx.ts.
 */

export const APP_IDS = [
  'broker', 'portfolio', 'wire', 'calendar', 'messages', 'businesses', 'company', 'boutique', 'ailab',
  'security', 'legal', 'bank', 'research', 'exchange', 'launchpad', 'learn', 'settings',
] as const;

export type AppId = (typeof APP_IDS)[number];

/** Rank ids as used by src/content/lifestyle.ts (RANKS). */
export type RankId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

/** Props a window carries. Tickers and file ids are the only game-side values a window may hold. */
export interface WinProps {
  ticker?: string;
  fileId?: string;
  view?: string;
}

export type InstanceRule =
  | { kind: 'single' }
  | { kind: 'per-ticker'; max: number }
  | { kind: 'per-file' };

export interface AppDef {
  id: AppId;
  /** i18n key for the app name (en.json / fr.json). */
  titleKey: string;
  minW: number;
  minH: number;
  instances: InstanceRule;
  /** A second window of this app, allowed only through a named layout (C-27: Review's journal). */
  secondInstance: { layout: 'review'; view: string; max: number } | null;
  /** Views a route may name after the app (`/portfolio/journal`). */
  views: readonly string[];
  /** Rank that unlocks the app. null means open from the start. */
  minRank: RankId | null;
  /** No tile before unlock (Company, V:96). Otherwise the tile is drawn locked. */
  hideWhenLocked: boolean;
  /** false until the phase that ships the app (C-38): no tile, a deep link shows "Coming later". */
  available: boolean;
  /**
   * Preferred size on first open, as fractions of the work area (geometry.ts openRect). Clamped to the
   * work area and to the minimum; the Broker alone on a workspace snaps instead (wm.ts placeAlone).
   */
  pref: { w: number; h: number };
}

/** Budgets from V:55 and F:98: Broker 480x420, Wire 360x280, Portfolio 520x220, the rest 420x300. */
const app = (
  id: AppId,
  minW: number,
  minH: number,
  extra: Partial<Omit<AppDef, 'id' | 'titleKey' | 'minW' | 'minH'>> = {},
): AppDef => ({
  id,
  titleKey: `shell.app.${id}`,
  minW,
  minH,
  instances: { kind: 'single' },
  secondInstance: null,
  views: [],
  minRank: null,
  hideWhenLocked: false,
  available: true,
  pref: { w: 0.5, h: 0.66 },
  ...extra,
});

export const APPS: Readonly<Record<AppId, AppDef>> = {
  // Preferred sizes (fractions of the work area). The Broker is the large window (two thirds wide);
  // Wire and Portfolio are the trading side panels; Settings, Learn and Messages are medium.
  broker: app('broker', 480, 420, { instances: { kind: 'per-ticker', max: 4 }, pref: { w: 2 / 3, h: 0.92 } }),
  portfolio: app('portfolio', 520, 220, {
    views: ['journal', 'analyst'],
    secondInstance: { layout: 'review', view: 'journal', max: 2 },
    pref: { w: 0.5, h: 0.6 },
  }),
  wire: app('wire', 360, 280, { pref: { w: 0.36, h: 0.7 } }),
  calendar: app('calendar', 420, 300),
  messages: app('messages', 420, 300, { views: ['inbox', 'chat', 'social'] }),
  businesses: app('businesses', 420, 300),
  company: app('company', 420, 300, { views: ['overview', 'products', 'rd', 'people', 'deals', 'capital', 'public'], minRank: 'R2', hideWhenLocked: true }),
  boutique: app('boutique', 420, 300),
  ailab: app('ailab', 420, 300, { minRank: 'R2', pref: { w: 0.5, h: 0.7 } }),
  security: app('security', 420, 300, { minRank: 'R3' }),
  legal: app('legal', 420, 300),
  bank: app('bank', 420, 300),
  research: app('research', 420, 300, { instances: { kind: 'per-file' }, minRank: 'R3', pref: { w: 0.6, h: 0.8 } }),
  // Phase 4: player stocks and player-run funds (the Exchange app, velvet-company-app.md and ROADMAP 2.2)
  exchange: app('exchange', 420, 300, { pref: { w: 0.5, h: 0.72 } }),
  // Phase 5: the Launchpad (memecoins, lead-launchpad.md L7). Open from the start, like the Exchange.
  launchpad: app('launchpad', 420, 300, { pref: { w: 0.6, h: 0.8 } }),
  learn: app('learn', 420, 300, { pref: { w: 0.45, h: 0.66 } }),
  settings: app('settings', 420, 300, { views: ['about'], pref: { w: 0.5, h: 0.72 } }),
};

/**
 * Views whose screen is built. A layout or a deep link may name a view only when it is listed here.
 * The Portfolio journal ships in Phase 3 (velvet-trade-journal-replay.md); until it is listed, Review
 * opens Portfolio and Wire, and no second Portfolio is ever created.
 */
export const READY_VIEWS: readonly string[] = ['journal', 'analyst'];

/** Whether an app's second window (`secondInstance`, Review only) can open: its view is built. */
export function secondWindowReady(app: AppId, ready: readonly string[] = READY_VIEWS): boolean {
  const s = APPS[app].secondInstance;
  return s !== null && ready.includes(s.view);
}

/**
 * The app a workspace opens with when it has no window (UX stage 2), by workspace index: 0 Trade the Broker, 1 News the
 * Wire, 2 Portfolio the Portfolio, 3 Empire none (its apps open from the shelf).
 */
export const WORKSPACE_DEFAULT_APP: readonly (AppId | null)[] = ['broker', 'wire', 'portfolio', null];

/** Default shelf order (V:82): trading group first, Broker pinned first. Hidden apps are absent. */
export const SHELF_ORDER: readonly AppId[] = [
  'broker', 'portfolio', 'exchange', 'launchpad', 'wire', 'messages', 'calendar', 'businesses', 'ailab', 'research', 'bank',
  'legal', 'security', 'boutique', 'learn', 'settings', 'company',
];

export const MAX_BROKERS = 4;
export const MAX_CUSTOM_LAYOUTS = 5;
/** Layout name length limits (custom layouts only). */
export const MAX_LAYOUT_NAME = 24;

/** Built-in layouts (V:70-76). Their plans live in layouts.ts; the reducer only receives them. */
export const BUILTIN_LAYOUTS = ['trade', 'review', 'research'] as const;
export type BuiltinLayout = (typeof BUILTIN_LAYOUTS)[number];

export function isBuiltinLayout(name: string): name is BuiltinLayout {
  return (BUILTIN_LAYOUTS as readonly string[]).includes(name);
}

export function isAppId(x: unknown): x is AppId {
  return typeof x === 'string' && (APP_IDS as readonly string[]).includes(x);
}

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
/**
 * A research window id is `research-<fileId>`. Stored ids are capped at 64 characters (prefs
 * ID_RE), so the file id is at most 64 - 9 = 55 characters.
 */
export const MAX_FILE_ID = 55;
const FILE_ID_RE = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_FILE_ID}}$`);

/** Upper-cases and checks a ticker. Returns null when it is not a ticker shape. */
export function normalizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

/** Checks a research file id. Returns null when it is not a file id shape. */
export function normalizeFileId(raw: string): string | null {
  return FILE_ID_RE.test(raw) ? raw : null;
}

/**
 * Cleans window props for an app. Returns null when a prop is present but malformed or names a
 * view the app does not have. Unknown keys are dropped (route and save parsers ignore extras, T:98).
 */
export function cleanProps(id: AppId, raw: unknown): WinProps | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: WinProps = {};
  if (src.ticker !== undefined) {
    if (typeof src.ticker !== 'string') return null;
    const t = normalizeTicker(src.ticker);
    if (t === null) return null;
    out.ticker = t;
  }
  if (src.fileId !== undefined) {
    if (typeof src.fileId !== 'string') return null;
    const f = normalizeFileId(src.fileId);
    if (f === null) return null;
    out.fileId = f;
  }
  if (src.view !== undefined) {
    if (typeof src.view !== 'string' || !APPS[id].views.includes(src.view)) return null;
    out.view = src.view;
  }
  if (out.ticker !== undefined && id !== 'broker') return null;
  if (out.fileId !== undefined && id !== 'research') return null;
  return out;
}
