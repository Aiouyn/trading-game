/**
 * Device prefs and per-save shell state (F:18, F:68, DECISIONS "Local storage", P2-007, P2-129).
 *
 * Everything lives under the single key `tg-prefs`, plus the token under `tg-token`. Reads are
 * versioned and validated. A corrupt or foreign value falls back to defaults and never throws.
 * Unknown top-level keys in tg-prefs (for example `lang`, written by i18n) are kept on write.
 * The old `tycoon.prefs` and `tycoon.token` keys are migrated once and then removed.
 *
 * The store is passed in (KeyValueStore), so this module runs in tests and in the browser.
 */

import {
  APPS,
  MAX_BROKERS,
  MAX_LAYOUT_NAME,
  SHELF_ORDER,
  type AppId,
  type WinProps,
  cleanProps,
  isAppId,
  isBuiltinLayout,
  normalizeTicker,
} from './apps';
import { type Rect, type Size, type Slot, isSlotName } from './geometry';
import { type LayoutEntry, type SavedLayout, type ShellState, type Snapshot, type Win, type WmCtx, initialShell, normalize } from './wm';

export const PREFS_KEY = 'tg-prefs';
export const TOKEN_KEY = 'tg-token';
export const LEGACY_PREFS_KEY = 'tycoon.prefs';
export const LEGACY_TOKEN_KEY = 'tycoon.token';
export const PREFS_VERSION = 1;

/** Anything bigger than this in storage is treated as corrupt without parsing. */
const MAX_RAW_CHARS = 512 * 1024;
const MAX_SHELLS = 64;
const MAX_WINS = 64;
const MAX_LAYOUTS = 5;
const ID_RE = /^[a-z][A-Za-z0-9_.-]{0,63}$/;
const SAVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PALETTES = ['ink-brass', 'broadsheet', 'phosphor', 'riviera'] as const;
export type Palette = (typeof PALETTES)[number];

export interface ChartPrefs {
  indicators?: string[];
  range?: string;
  chartMode?: string;
}

export interface TgPrefs {
  v: 1;
  palette: Palette;
  /** null means the player has not chosen; the OS decides. */
  reducedTransparency: boolean | null;
  /** Settings > Reduce motion. null means the player has not chosen; the system setting still applies. */
  reducedMotion: boolean | null;
  /** Action id to key code, for the remappable bindings (P2-106). */
  keys: Record<string, string>;
  chart: ChartPrefs;
  /** Trading: Enter sends an order under 10% of cash at once (the ticket asks for a second Enter otherwise). */
  quickEnter: boolean;
  lastTicker: string | null;
  /** Shell state per save id, as read. Validate with `loadShell` before use. */
  shells: Record<string, unknown>;
}

export function defaultPrefs(): TgPrefs {
  return {
    v: PREFS_VERSION,
    palette: 'ink-brass',
    reducedTransparency: null,
    reducedMotion: null,
    keys: {},
    chart: {},
    quickEnter: false,
    lastTicker: null,
    shells: {},
  };
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function readRaw(kv: KeyValueStore, key: string): string | null {
  try {
    const s = kv.getItem(key);
    if (s === null || s.length > MAX_RAW_CHARS) return null;
    return s;
  } catch {
    return null;
  }
}

function parseObj(s: string | null): Record<string, unknown> | null {
  if (s === null) return null;
  try {
    const v: unknown = JSON.parse(s);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

function sanitizeChart(x: unknown): ChartPrefs {
  if (!isObj(x)) return {};
  const out: ChartPrefs = {};
  if (Array.isArray(x.indicators)) {
    out.indicators = x.indicators
      .filter((s): s is string => typeof s === 'string' && s.length <= 32)
      .slice(0, 16);
  } else if (isObj(x.indicators)) {
    // The old tycoon.prefs stored `{ id: true | false }` (the legacy writePrefs). Keep the ones switched on.
    const legacy = x.indicators;
    out.indicators = Object.keys(legacy)
      .filter((k) => k.length <= 32 && legacy[k] === true)
      .slice(0, 16);
  }
  if (typeof x.range === 'string' && x.range.length <= 16) out.range = x.range;
  if (typeof x.chartMode === 'string' && x.chartMode.length <= 16) out.chartMode = x.chartMode;
  return out;
}

function sanitizePrefs(raw: Record<string, unknown> | null): TgPrefs {
  const d = defaultPrefs();
  if (raw === null) return d;
  const palette = (PALETTES as readonly unknown[]).includes(raw.palette) ? (raw.palette as Palette) : d.palette;
  const reducedTransparency = typeof raw.reducedTransparency === 'boolean' ? raw.reducedTransparency : null;
  const reducedMotion = typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : null;
  const keys: Record<string, string> = {};
  if (isObj(raw.keys)) {
    for (const k of Object.keys(raw.keys).slice(0, 64)) {
      const v = raw.keys[k];
      if (k.length <= 32 && typeof v === 'string' && v.length >= 1 && v.length <= 16) keys[k] = v;
    }
  }
  const lastTicker = typeof raw.lastTicker === 'string' ? normalizeTicker(raw.lastTicker) : null;
  const shells: Record<string, unknown> = {};
  if (isObj(raw.shells)) {
    for (const id of Object.keys(raw.shells).slice(0, MAX_SHELLS)) {
      if (SAVE_ID_RE.test(id) && isObj(raw.shells[id])) shells[id] = raw.shells[id];
    }
  }
  return {
    v: PREFS_VERSION,
    palette,
    reducedTransparency,
    reducedMotion,
    keys,
    chart: sanitizeChart(raw.chart),
    quickEnter: raw.quickEnter === true,
    lastTicker,
    shells,
  };
}

/** Reads tg-prefs. A missing, corrupt or oversized value gives the defaults. Never throws. */
export function readPrefs(kv: KeyValueStore): TgPrefs {
  return sanitizePrefs(parseObj(readRaw(kv, PREFS_KEY)));
}

/**
 * Read-modify-write of tg-prefs. Unknown top-level keys of the stored object (lang, for one)
 * are kept. A corrupt stored value is replaced. Returns the value written.
 */
export function updatePrefs(kv: KeyValueStore, fn: (p: TgPrefs) => TgPrefs): TgPrefs {
  const raw = parseObj(readRaw(kv, PREFS_KEY));
  const next = fn(sanitizePrefs(raw));
  const out = { ...(raw ?? {}), ...next, v: PREFS_VERSION };
  try {
    kv.setItem(PREFS_KEY, JSON.stringify(out));
  } catch {
    /* storage full or blocked: the in-memory state still works */
  }
  return next;
}

/** Reads the token (tg-token). Returns null when none is stored. */
export function readToken(kv: KeyValueStore): string | null {
  try {
    return kv.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(kv: KeyValueStore, token: string): void {
  try {
    kv.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- shell validation

function parseRect(x: unknown): Rect | null {
  if (!isObj(x)) return null;
  const { x: rx, y, w, h } = x;
  const nums = [rx, y, w, h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e5)) return null;
  if ((w as number) <= 0 || (h as number) <= 0) return null;
  return { x: rx as number, y: y as number, w: w as number, h: h as number };
}

function parseSlot(x: unknown): Slot | null {
  if (x === null || x === undefined) return null;
  if (isSlotName(x)) return x;
  if (!isObj(x) || !isObj(x.custom)) return null;
  const c = x.custom;
  const f = [c.x0, c.y0, c.x1, c.y1];
  if (!f.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  const x0 = c.x0 as number;
  const y0 = c.y0 as number;
  const x1 = c.x1 as number;
  const y1 = c.y1 as number;
  if (!(x0 < x1 && y0 < y1)) return null;
  return { custom: { x0, y0, x1, y1 } };
}

function defaultRectFor(app: AppId): Rect {
  return { x: 0, y: 0, w: APPS[app].minW, h: APPS[app].minH };
}

function parseWins(raw: unknown[]): Win[] {
  const out: Win[] = [];
  for (const item of raw.slice(0, MAX_WINS)) {
    if (!isObj(item) || !isAppId(item.app)) continue;
    if (typeof item.id !== 'string' || !ID_RE.test(item.id)) continue;
    const app = item.app;
    const props: WinProps = cleanProps(app, item.props) ?? {};
    out.push({
      id: item.id,
      app,
      ws: Number.isInteger(item.ws) ? (item.ws as number) : 0,
      rect: parseRect(item.rect) ?? defaultRectFor(app),
      slot: parseSlot(item.slot),
      state: item.state === 'collapsed' ? 'collapsed' : 'open',
      filled: item.filled === true,
      props,
    });
  }
  return out;
}

function parseLayouts(raw: unknown): SavedLayout[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedLayout[] = [];
  const names = new Set<string>();
  for (const item of raw.slice(0, MAX_LAYOUTS * 2)) {
    if (!isObj(item) || typeof item.name !== 'string') continue;
    const name = item.name.trim();
    if (name.length < 1 || name.length > MAX_LAYOUT_NAME || isBuiltinLayout(name.toLowerCase())) continue;
    if (names.has(name) || out.length >= MAX_LAYOUTS || !Array.isArray(item.wins)) continue;
    const wins: LayoutEntry[] = [];
    for (const e of item.wins.slice(0, 16)) {
      if (!isObj(e) || !isAppId(e.app)) continue;
      wins.push({
        app: e.app,
        slot: parseSlot(e.slot),
        rect: parseRect(e.rect) ?? defaultRectFor(e.app),
        props: cleanProps(e.app, e.props) ?? {},
        ...(e.second === true ? { second: true } : {}),
      });
    }
    if (wins.length === 0) continue;
    names.add(name);
    out.push({ name, wins });
  }
  return out;
}

function parseShelf(raw: unknown): AppId[] {
  const seen = new Set<AppId>();
  const shelf: AppId[] = [];
  if (Array.isArray(raw)) {
    for (const a of raw) {
      if (isAppId(a) && APPS[a].available && !seen.has(a)) {
        seen.add(a);
        shelf.push(a);
      }
    }
  }
  for (const a of SHELF_ORDER) {
    if (!seen.has(a)) {
      seen.add(a);
      shelf.push(a);
    }
  }
  return ['broker', ...shelf.filter((a) => a !== 'broker')];
}

function parseFocusWs(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const ws of raw.slice(0, 16)) if (Number.isInteger(ws) && (ws as number) >= 0) out.add(ws as number);
  return [...out].sort((a, b) => a - b);
}

function parseFocusRestore(raw: unknown, wins: Win[]): Record<string, Snapshot> | null {
  if (!isObj(raw)) return null;
  const out: Record<string, Snapshot> = {};
  const ids = new Set(wins.map((w) => w.id));
  for (const id of Object.keys(raw).slice(0, MAX_WINS)) {
    if (!ID_RE.test(id) || !ids.has(id) || !isObj(raw[id])) continue;
    const s = raw[id] as Record<string, unknown>;
    const rect = parseRect(s.rect);
    if (rect === null || !Number.isInteger(s.ws)) continue;
    out[id] = { ws: s.ws as number, rect, slot: parseSlot(s.slot), filled: s.filled === true };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Turns a stored shell into a valid ShellState for this viewport and earned rank (P2-126,
 * P2-127). Anything that is not a shell object gives the Trade layout. Bad fields are dropped
 * or defaulted one by one. Rects are kept as stored; `project` recomputes what is shown.
 */
export function validateShell(raw: unknown, ctx: WmCtx, vp: Size, ticker?: string): ShellState {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.wins)) return initialShell(vp, ctx, ticker);
  const wins = parseWins(raw.wins);
  // A window entry that does not parse, a repeated id, or more Brokers than the cap means the record was damaged or
  // edited by hand. Such a shell gives the Trade layout (P2-127); the game data is never touched. A locked window
  // is different: it parses, and normalize drops it alone (P2-126).
  const brokers = wins.filter((w) => w.app === 'broker').length;
  const ids = new Set(wins.map((w) => w.id)).size;
  if (raw.wins.length > MAX_WINS || wins.length !== raw.wins.length || ids !== wins.length || brokers > MAX_BROKERS) {
    return initialShell(vp, ctx, ticker);
  }
  const shell: ShellState = {
    v: 1,
    wins,
    activeWs: Number.isInteger(raw.activeWs) ? (raw.activeWs as number) : 0,
    focusWs: parseFocusWs(raw.focusWs),
    focusRestore: parseFocusRestore(raw.focusRestore, wins),
    layouts: parseLayouts(raw.layouts),
    shelf: parseShelf(raw.shelf),
    vp: { w: vp.w, h: vp.h },
  };
  if (typeof raw.look === 'string' && raw.look.length <= 32) shell.look = raw.look;
  return normalize(shell, ctx);
}

/** Shell for a save: the stored one, validated, or the Trade layout for a save without one. */
export function loadShell(kv: KeyValueStore, saveId: string, ctx: WmCtx, vp: Size, ticker?: string): ShellState {
  const p = readPrefs(kv);
  if (!hasOwn(p.shells, saveId)) return initialShell(vp, ctx, ticker);
  return validateShell(p.shells[saveId], ctx, vp, ticker);
}

/** Writes a save's shell under tg-prefs. Call on settled actions only (P2-125). */
export function saveShell(kv: KeyValueStore, saveId: string, shell: ShellState): void {
  if (!SAVE_ID_RE.test(saveId)) return;
  updatePrefs(kv, (p) => ({ ...p, shells: { ...p.shells, [saveId]: shell } }));
}

// ---------------------------------------------------------------- migration

/**
 * Moves the old keys to the new ones once. `tycoon.token` becomes `tg-token`. `tycoon.prefs`
 * (chart indicators, range, mode and the last ticker) moves into tg-prefs. Existing new values
 * win. Returns the names of what was migrated; an empty list means nothing to do.
 */
export function migrateLegacy(kv: KeyValueStore): string[] {
  const done: string[] = [];
  try {
    const tok = kv.getItem(LEGACY_TOKEN_KEY);
    if (tok !== null) {
      if (kv.getItem(TOKEN_KEY) === null) kv.setItem(TOKEN_KEY, tok);
      kv.removeItem(LEGACY_TOKEN_KEY);
      done.push('token');
    }
  } catch {
    /* storage blocked: leave the old key for the next load */
  }
  try {
    const raw = kv.getItem(LEGACY_PREFS_KEY);
    if (raw !== null) {
      const old = parseObj(raw.length <= MAX_RAW_CHARS ? raw : null) ?? {};
      const legacyChart = sanitizeChart(old);
      const legacyTicker = typeof old.selected === 'string' ? normalizeTicker(old.selected) : null;
      updatePrefs(kv, (p) => ({
        ...p,
        chart: { ...legacyChart, ...p.chart },
        lastTicker: p.lastTicker ?? legacyTicker,
      }));
      kv.removeItem(LEGACY_PREFS_KEY);
      done.push('prefs');
    }
  } catch {
    /* ignore: leave the old key */
  }
  return done;
}
