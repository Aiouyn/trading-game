"use client";
// Broker chart trend lines: the player's own notes on the chart, per asset, kept on this device only, per account
// (IndexedDB `quay.<accountId>.drawings`, "guest" when signed out: the shell's device-local convention, 17 §2.2). Never
// sent to the server and never read by it: a line changes no price, order or cash, and another device has its own.
//  - A point is a game tick and a price as the player drew it (a pixel read back through the chart's scale, so a
//    plain number, never a server price string). The tick keeps it on the same moment when the range changes, and
//    across a server restart: the candles under it may be gone (the server's history is ephemeral) or come back later.
//  - The scope is read before anything is shown: while the session is resolving there are no lines and no tool, so a
//    signed-in player never sees the guest's lines (or another account's) even for a frame.
import { useSyncExternalStore } from "react";
import type { AuthUiState } from "@/shell/authSession";
import { loadDrawings, queueDrawings } from "@/shell/persist";

export interface TrendPoint { readonly t: number; readonly p: number }
export interface Trendline { readonly id: string; readonly a: TrendPoint; readonly b: TrendPoint }
/** What PriceChart hands the plot's trend layer. */
export interface TrendDraw {
  readonly lines: readonly Trendline[];
  /** The placing session (a new number each time the tool is picked), null when not placing. */
  readonly placing: number | null;
  readonly selected: string | null;
  readonly onChange: (lines: readonly Trendline[]) => void;
  readonly onSelect: (id: string | null) => void;
  /** A line was placed: the tool goes back to the cursor. */
  readonly onPlaced: () => void;
}

/** Lines per asset; the tool is off at the cap. */
export const MAX_LINES = 50;
const MAX_ASSETS = 40;
const MAX_TICK = 1_000_000_000;
const MAX_PRICE = 1_000_000_000;

/** Whose lines: the signed-in account's id, "guest" when signed out, null while the session is still resolving. */
export function drawScope(auth: AuthUiState): string | null {
  return auth.status === "signed_in" ? auth.account.accountId : auth.status === "signed_out" ? "guest" : null;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parsePoint(x: unknown): TrendPoint | null {
  if (!isRecord(x)) return null;
  const { t, p } = x;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > MAX_TICK) return null;
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p > MAX_PRICE) return null;
  return { t, p };
}

function parseLine(x: unknown): Trendline | null {
  if (!isRecord(x) || typeof x.id !== "string" || !/^[a-z0-9]{1,12}$/.test(x.id)) return null;
  const a = parsePoint(x.a), b = parsePoint(x.b);
  return a && b ? { id: x.id, a, b } : null;
}

/** What the device kept, validated: unknown or broken entries are dropped, never shown. */
export function parseSaved(raw: unknown): Record<string, readonly Trendline[]> {
  const out: Record<string, readonly Trendline[]> = {};
  if (!isRecord(raw)) return out;
  for (const [asset, list] of Object.entries(raw).slice(0, MAX_ASSETS)) {
    if (!/^[A-Za-z0-9._-]{1,24}$/.test(asset) || !Array.isArray(list)) continue;
    const lines = list.slice(0, MAX_LINES).map(parseLine).filter((l): l is Trendline => l !== null);
    if (lines.length > 0) out[asset] = lines;
  }
  return out;
}

type Scoped = { readonly status: "loading" } | { readonly status: "ready"; readonly byAsset: Record<string, readonly Trendline[]> };
const scopes = new Map<string, Scoped>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const NONE: readonly Trendline[] = [];

function ensure(scope: string): Scoped {
  const have = scopes.get(scope);
  if (have) return have;
  const loading: Scoped = { status: "loading" };
  scopes.set(scope, loading);
  void loadDrawings(scope).catch(() => null).then((raw) => {
    if (scopes.get(scope) !== loading) return;
    scopes.set(scope, { status: "ready", byAsset: parseSaved(raw) });
    emit();
  });
  return loading;
}

/** The scope's lines on `assetId`; null until the device's copy has been read (no tool, nothing drawn). */
export function trendlinesOf(scope: string | null, assetId: string): readonly Trendline[] | null {
  if (scope === null) return null;
  const s = scopes.get(scope);
  return s?.status === "ready" ? (s.byAsset[assetId] ?? NONE) : null;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useTrendlines(scope: string | null, assetId: string): readonly Trendline[] | null {
  if (scope !== null) ensure(scope); // starts the one read of this scope (idempotent)
  return useSyncExternalStore(subscribe, () => trendlinesOf(scope, assetId), () => null);
}

/** Replaces the scope's lines on `assetId` and queues the device write (the shell's serialised IndexedDB queue). */
export function setTrendlines(scope: string, assetId: string, lines: readonly Trendline[]): void {
  const s = scopes.get(scope);
  if (s?.status !== "ready") return;
  const byAsset = { ...s.byAsset };
  if (lines.length > 0) byAsset[assetId] = lines.slice(0, MAX_LINES);
  else delete byAsset[assetId];
  scopes.set(scope, { status: "ready", byAsset });
  emit();
  void queueDrawings(scope, byAsset).catch(() => {});
}

/** A short id unused in the list. */
export function newLineId(lines: readonly Trendline[]): string {
  const taken = new Set(lines.map((l) => l.id));
  for (let i = lines.length + 1; ; i++) {
    const id = `l${i.toString(36)}`;
    if (!taken.has(id)) return id;
  }
}

/** Test only: forget every scope read so far (a page reload). */
export function _resetTrendlinesForTests(): void { scopes.clear(); }
