/**
 * Launcher search (P2-075..P2-080, V:101). Pure: the query and the facts the caller already
 * read (apps, tickers, commands, recent) in, grouped rows out. Labels arrive translated, so this
 * module has no i18n and no store. The launcher never places or changes an order (P2-079): its
 * actions only open windows or run window commands.
 *
 * Groups keep the spec order: Apps, Tickers, Commands, Recent. An empty query shows a short list
 * of each. A query keeps rows whose label or id contains it, prefix matches first.
 */

import type { AppId } from './apps';

export type LauncherKind = 'app' | 'ticker' | 'command' | 'recent';
export type LauncherCommand = 'trade' | 'review' | 'research' | 'focus' | 'new-broker';

export type LauncherAction =
  | { type: 'app'; app: AppId }
  | { type: 'ticker'; ticker: string }
  | { type: 'command'; cmd: LauncherCommand }
  | { type: 'recent'; app: AppId; ticker?: string };

export interface LauncherItem {
  kind: LauncherKind;
  /** 1-based position within its group. The test id is os-launcher-result-<kind>-<n>. */
  n: number;
  label: string;
  sub?: string;
  /** The app is not unlocked yet: the row is drawn disabled and says when it opens. */
  locked?: boolean;
  price?: number;
  /** Day change as a fraction, coloured by the caller. */
  changePct?: number;
  action: LauncherAction;
}

export interface LauncherGroup {
  kind: LauncherKind;
  items: LauncherItem[];
}

export interface LauncherSource {
  /** Shelf apps that exist in this build. Locked ones are included and flagged. */
  apps: readonly { app: AppId; name: string; locked: boolean; sub?: string }[];
  /** Tickers, watchlist first. */
  tickers: readonly { id: string; name: string; price?: number; changePct?: number }[];
  commands: readonly { cmd: LauncherCommand; label: string }[];
  /** Most recent first. */
  recent: readonly { app: AppId; ticker?: string; label: string }[];
}

export const LIMITS: Readonly<Record<LauncherKind, number>> = { app: 8, ticker: 6, command: 6, recent: 4 };

/** The DOM id of a result row (its test id is the same without the prefix). */
export function resultId(item: Pick<LauncherItem, 'kind' | 'n'>): string {
  return `os-launcher-result-${item.kind}-${item.n}`;
}

/** Rows of a query, in group order, with a prefix match ranked above an inner match. */
function rank<T>(rows: readonly T[], q: string, text: (r: T) => string[], limit: number): T[] {
  if (q === '') return rows.slice(0, limit);
  const hits = rows
    .map((r, i) => {
      const keys = text(r).map((s) => s.toLowerCase());
      const prefix = keys.some((k) => k.startsWith(q));
      const inner = keys.some((k) => k.includes(q));
      return { r, i, score: prefix ? 0 : inner ? 1 : 2 };
    })
    .filter((x) => x.score < 2);
  hits.sort((a, b) => a.score - b.score || a.i - b.i);
  return hits.slice(0, limit).map((x) => x.r);
}

/** Groups the rows for a query. Empty groups are dropped. */
export function searchLauncher(query: string, src: LauncherSource): LauncherGroup[] {
  const q = query.trim().toLowerCase();
  const groups: LauncherGroup[] = [];

  // An empty query lists every app and command (the panel scrolls); a query caps each group.
  const open = q === "";
  const apps = rank(src.apps, q, (a) => [a.name, a.app], open ? Infinity : LIMITS.app).map((a) => ({
    kind: 'app' as const,
    label: a.name,
    sub: a.sub,
    locked: a.locked,
    action: { type: 'app' as const, app: a.app },
  }));
  groups.push({ kind: 'app', items: numbered('app', apps) });

  const tickers = rank(src.tickers, q, (t) => [t.id, t.name], LIMITS.ticker).map((t) => ({
    kind: 'ticker' as const,
    label: t.id,
    sub: t.name,
    price: t.price,
    changePct: t.changePct,
    action: { type: 'ticker' as const, ticker: t.id },
  }));
  groups.push({ kind: 'ticker', items: numbered('ticker', tickers) });

  const commands = rank(src.commands, q, (c) => [c.label], open ? Infinity : LIMITS.command).map((c) => ({
    kind: 'command' as const,
    label: c.label,
    action: { type: 'command' as const, cmd: c.cmd },
  }));
  groups.push({ kind: 'command', items: numbered('command', commands) });

  const recent = rank(src.recent, q, (r) => [r.label], LIMITS.recent).map((r) => ({
    kind: 'recent' as const,
    label: r.label,
    action: { type: 'recent' as const, app: r.app, ticker: r.ticker },
  }));
  groups.push({ kind: 'recent', items: numbered('recent', recent) });

  return groups.filter((g) => g.items.length > 0);
}

function numbered(kind: LauncherKind, rows: Omit<LauncherItem, 'n'>[]): LauncherItem[] {
  return rows.map((r, i) => ({ ...r, kind, n: i + 1 } as LauncherItem));
}

/** The rows in keyboard order (Up and Down move through this list). */
export function flatItems(groups: readonly LauncherGroup[]): LauncherItem[] {
  return groups.flatMap((g) => g.items);
}
