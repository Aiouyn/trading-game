// Card 41: a Place's outcome outlives its ticket. On phone only one app is mounted, so a player who leaves the Broker
// mid-Place unmounts the ticket that would have shown "Bought N X at P" (BrokerFrame keeps the intent id in its own
// state). Each Place is noted here; the ticket owns it while mounted and drops it once its own panel shows the outcome.
// If the ticket unmounts first, it releases the entry to the shell's fill-ack host (FillAckHost), which shows it once as
// a toast (17 §3.10.2) and dismisses it. Account switch / sign-out clears everything; a reload starts empty.
// Read in render with useSyncExternalStore (subscribePlacedAcks + placedAcksSnapshot), never copied into state.
import type { Side } from "@/shell/contracts/channels";

/** How a Place failed before any IntentResult: the BrokerFrame phase's `failed` kinds. */
export type PlacedFailure = "error" | "offline" | "unknown";
export type PlacedOutcome = { ok: true; intentId: string } | { ok: false; failed: PlacedFailure };
/** What the toast says, fixed once when the host resolves it against `me` (so later polls never change or repeat it). */
export type AckShown =
  | { kind: "filled"; side: Side; qty: string; price: string; fee: string }
  | { kind: "rejected"; code: string; params?: Readonly<Record<string, string>> }
  | { kind: "accepted"; resting: boolean; queued: boolean }
  | { kind: "failed"; why: PlacedFailure }
  | { kind: "expired" };

export interface PlacedEntry {
  readonly id: number;
  readonly account: string;
  readonly assetId: string;
  readonly placedAtMs: number;
  readonly settled: boolean;
  readonly intentId: string | null;
  readonly failed: PlacedFailure | null;
  /** "ticket" while the placing ticket is mounted; "shell" once it unmounted before showing the outcome. */
  readonly owner: "ticket" | "shell";
  readonly shown: AckShown | null;
}

/** Hard cap on entries (oldest dropped first): a ring like `me.intents` (keepLast 50). */
export const PLACED_ACKS_MAX = 50;
/** A released intent whose result is not on `me` after this long is shown as "no answer" (expired) and dropped. */
export const ACK_WAIT_MS = 30_000;

let account = "guest";
let nextId = 1;
let entries: readonly PlacedEntry[] = [];
const listeners = new Set<() => void>();

function commit(next: readonly PlacedEntry[]) {
  entries = next.length > PLACED_ACKS_MAX ? next.slice(next.length - PLACED_ACKS_MAX) : next;
  for (const l of [...listeners]) l();
}
function update(id: number, fn: (e: PlacedEntry) => PlacedEntry | null) {
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return;
  const cur = entries[i]!;
  const nx = fn(cur);
  if (nx === cur) return;
  commit(nx === null ? entries.filter((e) => e.id !== id) : entries.map((e) => (e.id === id ? nx : e)));
}

export function subscribePlacedAcks(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** The current entries; the same array until something changes (useSyncExternalStore snapshot). */
export function placedAcksSnapshot(): readonly PlacedEntry[] { return entries; }

/** A Place was sent (synchronously, before the reply). Returns the entry id the ticket holds. */
export function notePlaced(assetId: string, nowMs: number = Date.now()): number {
  const id = nextId++;
  commit([...entries, { id, account, assetId, placedAtMs: nowMs, settled: false, intentId: null, failed: null, owner: "ticket", shown: null }]);
  return id;
}
/** The order door answered (or failed). Only the first answer counts; a cleared (other account) entry stays gone. */
export function settlePlaced(id: number, r: PlacedOutcome): void {
  update(id, (e) => (e.settled ? e : { ...e, settled: true, intentId: r.ok ? r.intentId : null, failed: r.ok ? null : r.failed }));
}
/** The placing ticket unmounted: whatever it had not shown yet is the shell's to show. */
export function releaseTickets(ids: Iterable<number>): void {
  const set = new Set(ids);
  if (!entries.some((e) => set.has(e.id) && e.owner === "ticket")) return;
  commit(entries.map((e) => (set.has(e.id) && e.owner === "ticket" ? { ...e, owner: "shell" } : e)));
}
/** The ticket's own panel showed the outcome: nothing left to show. */
export function dropPlaced(id: number): void { update(id, () => null); }
/** The shell host fixed the toast's copy (first resolve only). */
export function showPlaced(id: number, shown: AckShown): void {
  update(id, (e) => (e.shown !== null || e.owner !== "shell" ? e : { ...e, shown }));
}
/** The toast went (timeout, Esc or dismiss). */
export function dismissPlaced(id: number): void { update(id, () => null); }

/** The signed-in account (or "guest"). A different key clears every entry: B never sees A's outcomes. */
export function setPlacedAcksAccount(key: string): void {
  if (key === account) return;
  account = key;
  if (entries.length) commit([]);
}
/** Tests and reloads: nothing kept. */
export function resetPlacedAcks(): void {
  account = "guest";
  if (entries.length) commit([]);
}
