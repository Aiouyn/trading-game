"use client";
// The bell holds what happened to the player: answers, letters, invitations, fills, layoffs, rent due. A line about the
// player's own state ("Ada is Calm (stress)") is not news to them and never reaches it.
import { useSyncExternalStore } from "react";
import type { SimView } from "@/shell/simSession";

export interface BellAction { label: string; line: string }
export interface BellRow {
  key: string;
  /** Game minutes since day 0, for order and for what is new. */
  at: number;
  day: number;
  title: string;
  body: string;
  reason: string;
  eventId: number;
  actions: BellAction[];
}

interface NoticeRow {
  id: number; day: number; minute: number; kind: string; title: string; text: string; reason: string;
  eventId: number; actions?: BellAction[];
}

const DAY_MIN = 1440;
/** "Name is Word (reading)": a reading of the player's own life, shown in Profile, not news. */
const SELF_STATUS = /^[^.]+ is [A-Z][a-z]+ \([a-z ]+\)\.?$/;

function noticesOf(life: unknown): NoticeRow[] {
  const raw = (life as { notices?: unknown } | null)?.notices;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is NoticeRow => !!r && typeof r === "object" && typeof (r as NoticeRow).title === "string" && typeof (r as NoticeRow).day === "number");
}

/** Every row the bell shows, newest first. */
export function bellRows(view: SimView | null, life: unknown): BellRow[] {
  const rows: BellRow[] = [];
  const seen = new Set<number>();
  for (const n of noticesOf(life)) {
    seen.add(n.eventId);
    rows.push({
      key: `n:${n.id}`, at: n.day * DAY_MIN + (n.minute ?? 0), day: n.day, title: n.title, body: n.text ?? "", reason: n.reason ?? "",
      eventId: n.eventId, actions: Array.isArray(n.actions) ? n.actions.filter((a) => a && a.label && a.line).slice(0, 2) : [],
    });
  }
  for (const f of view?.feed ?? []) {
    if (seen.has(f.eventId)) continue;
    if (f.tag !== "you" && f.tag !== "family" && f.tag !== "firm") continue;
    const text = f.text.trim();
    if (SELF_STATUS.test(text)) continue;
    // A notice's own event repeats its title and body: the notice row already says it.
    if (/^[^.]+\. .*Why: /.test(text) && noticesOf(life).some((n) => text.startsWith(n.title))) continue;
    // The plain event behind a notice ("X is hired at Y because ...") says what the notice already said.
    const tail = text.toLowerCase().replace(/[.\s]+$/, "").slice(-40);
    if (tail.length >= 30 && noticesOf(life).some((n) => Math.abs(n.day - f.day) <= 1 && `${n.text} ${n.reason}`.toLowerCase().includes(tail))) continue;
    seen.add(f.eventId);
    rows.push({ key: `e:${f.eventId}`, at: f.day * DAY_MIN + (typeof f.min === "number" ? f.min : 0), day: f.day, title: text, body: "", reason: "", eventId: f.eventId, actions: [] });
  }
  for (const f of view?.fills ?? []) {
    if (seen.has(f.eventId)) continue;
    seen.add(f.eventId);
    rows.push({ key: `f:${f.eventId}`, at: f.day * DAY_MIN + DAY_MIN - 1, day: f.day, title: f.text, body: "", reason: "", eventId: f.eventId, actions: [] });
  }
  return rows.sort((a, b) => b.at - a.at || b.eventId - a.eventId).slice(0, 60);
}

// What the player has already seen in the bell, per world, so the count only counts what is new.
const subs = new Set<() => void>();
let seenAt: Record<string, number> = {};
let loaded = false;
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { seenAt = JSON.parse(localStorage.getItem("quay.bell.seen") ?? "{}") as Record<string, number>; } catch { seenAt = {}; }
}
export function markBellSeen(world: string, at: number): void {
  load();
  if ((seenAt[world] ?? -1) >= at) return;
  seenAt = { ...seenAt, [world]: at };
  try { localStorage.setItem("quay.bell.seen", JSON.stringify(seenAt)); } catch { /* this sitting only */ }
  subs.forEach((f) => f());
}
export function useBellSeen(world: string): number {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => { load(); return seenAt[world] ?? -1; },
    () => -1,
  );
}
export const worldKey = (view: SimView | null): string => (view ? `${view.epoch ?? ""}:${view.name ?? ""}` : "");
