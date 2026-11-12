"use client";
// Broker chart trend lines: the player's own notes on the chart, per asset, kept on this device only, per account
// (IndexedDB `quay.<accountId>.drawings`, "guest" when signed out: the shell's device-local convention, 17 §2.2). Never
// sent to the server and never read by it: a line changes no price, order or cash, and another device has its own.
//  - A point is a game tick and a price as the player drew it (a pixel read back through the chart's scale, so a
//    plain number, never a server price string). The tick keeps it on the same moment when the range changes, and
//    across a server restart: the candles under it may be gone (the server's history is ephemeral) or come back later.
//  - The scope is read before anything is shown: while the session is resolving there are no lines and no tool, so a
//    signed-in player never sees the guest's lines (or another account's) even for a frame. A read that fails is not
//    an empty device: no lines, no tool, nothing written, and a Retry (an empty copy written over the kept one was the
//    loss, gatekeeper B1).
//  - A change is written as what the player did to single lines (added, moved, deleted), applied to the copy the
//    device holds INSIDE one IndexedDB readwrite transaction, never as this page's copy of the whole map: another tab
//    of the same account may have changed the device since this page read it (B2). A line deleted elsewhere is not
//    brought back by an edit here; new ids are random, so two tabs never add the same one. After each write the page
//    shows what the device kept; a write that fails is taken back and said so.
import { useSyncExternalStore } from "react";
import type { AuthUiState } from "@/shell/authSession";
import { loadDrawings, updateDrawings } from "@/shell/persist";

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

type ByAsset = Record<string, readonly Trendline[]>;
type Scoped =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly byAsset: ByAsset; readonly unsaved: boolean };
/** "unsaved": ready, but a change made here was not kept by the device (shown taken back, the player is told). */
export type TrendStatus = "loading" | "error" | "ready" | "unsaved";
const scopes = new Map<string, Scoped>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const NONE: readonly Trendline[] = [];

function read(scope: string, unsaved: boolean): void {
  const loading: Scoped = { status: "loading" };
  scopes.set(scope, loading);
  loadDrawings(scope).then(
    (raw) => { if (scopes.get(scope) === loading) { scopes.set(scope, { status: "ready", byAsset: parseSaved(raw), unsaved }); emit(); } },
    () => { if (scopes.get(scope) === loading) { scopes.set(scope, { status: "error" }); emit(); } },
  );
}
function ensure(scope: string): void {
  if (!scopes.has(scope)) read(scope, false);
}
/** After a failed read: read the device again. */
export function retryTrendlines(scope: string): void {
  if (scopes.get(scope)?.status !== "error") return;
  read(scope, false);
  emit();
}

/** The scope's lines on `assetId`; null until the device's copy has been read, or if it could not be (no tool). */
export function trendlinesOf(scope: string | null, assetId: string): readonly Trendline[] | null {
  if (scope === null) return null;
  const s = scopes.get(scope);
  return s?.status === "ready" ? (s.byAsset[assetId] ?? NONE) : null;
}
export function trendStatus(scope: string | null): TrendStatus {
  const s = scope === null ? undefined : scopes.get(scope);
  return !s ? "loading" : s.status === "ready" ? (s.unsaved ? "unsaved" : "ready") : s.status;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useTrendlines(scope: string | null, assetId: string): readonly Trendline[] | null {
  if (scope !== null) ensure(scope); // starts the one read of this scope (idempotent)
  return useSyncExternalStore(subscribe, () => trendlinesOf(scope, assetId), () => null);
}
export function useTrendStatus(scope: string | null): TrendStatus {
  return useSyncExternalStore(subscribe, () => trendStatus(scope), () => "loading");
}

/** What the player did to single lines of one asset. */
type Op = { readonly kind: "add" | "edit"; readonly line: Trendline } | { readonly kind: "delete"; readonly id: string };
function opsBetween(was: readonly Trendline[], now: readonly Trendline[]): Op[] {
  const before = new Map(was.map((l) => [l.id, l]));
  const after = new Set(now.map((l) => l.id));
  const ops: Op[] = was.filter((l) => !after.has(l.id)).map((l) => ({ kind: "delete", id: l.id }));
  for (const l of now) {
    const old = before.get(l.id);
    if (!old) ops.push({ kind: "add", line: l });
    else if (old.a.t !== l.a.t || old.a.p !== l.a.p || old.b.t !== l.b.t || old.b.p !== l.b.p) ops.push({ kind: "edit", line: l });
  }
  return ops;
}
/** The ops applied to the device's copy: a delete of a line already gone is nothing; an edit of a line no longer kept
 *  does not bring it back; an add past the caps (or of an id already kept) is dropped. Exported for tests. */
export function applyOps(kept: ByAsset, assetId: string, ops: readonly Op[]): ByAsset {
  let list = [...(kept[assetId] ?? NONE)];
  for (const op of ops) {
    if (op.kind === "delete") list = list.filter((l) => l.id !== op.id);
    else if (op.kind === "edit") list = list.map((l) => (l.id === op.line.id ? op.line : l));
    else if (!list.some((l) => l.id === op.line.id) && list.length < MAX_LINES && (assetId in kept || Object.keys(kept).length < MAX_ASSETS)) list.push(op.line);
  }
  const out = { ...kept };
  if (list.length > 0) out[assetId] = list; else delete out[assetId];
  return out;
}

const pending = new Map<string, number>();
const failed = new Set<string>(); // a write of the current run of queued writes was not kept
/** The player changed the scope's lines on `assetId` to `lines`: shown at once, written as single-line ops. */
export function setTrendlines(scope: string, assetId: string, lines: readonly Trendline[]): void {
  const s = scopes.get(scope);
  if (s?.status !== "ready") return; // never written over a copy this page could not read
  const ops = opsBetween(s.byAsset[assetId] ?? NONE, lines.slice(0, MAX_LINES));
  if (ops.length === 0) return;
  scopes.set(scope, { ...s, byAsset: applyOps({ ...s.byAsset, [assetId]: s.byAsset[assetId] ?? NONE }, assetId, ops) });
  emit();
  pending.set(scope, (pending.get(scope) ?? 0) + 1);
  const settle = (byAsset: ByAsset | null) => {
    const left = (pending.get(scope) ?? 1) - 1;
    pending.set(scope, left);
    if (byAsset === null) failed.add(scope);
    if (left > 0) return; // a later write of this page is queued: its result is the newer copy
    const lost = failed.delete(scope);
    if (scopes.get(scope)?.status !== "ready") return;
    // Not kept: show the device's copy again, and say so. Kept: show the device's copy, other tabs' changes included.
    if (byAsset === null) read(scope, true);
    else scopes.set(scope, { status: "ready", byAsset, unsaved: lost });
    emit();
  };
  updateDrawings(scope, (raw) => applyOps(parseSaved(raw), assetId, ops)).then((kept) => settle(parseSaved(kept)), () => settle(null));
}

/** A random id unused in the list: two tabs adding a line at once never pick the same one. */
export function newLineId(lines: readonly Trendline[]): string {
  const taken = new Set(lines.map((l) => l.id));
  for (;;) {
    const r = crypto.getRandomValues(new Uint32Array(2));
    const id = `l${r[0]!.toString(36)}${r[1]!.toString(36)}`.slice(0, 11);
    if (!taken.has(id)) return id;
  }
}

/** Test only: forget every scope read so far (a page reload). */
export function _resetTrendlinesForTests(): void { scopes.clear(); pending.clear(); failed.clear(); }
