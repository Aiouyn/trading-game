"use client";
// The notices sheet is opened from the bell and from the phone goal bar. A tiny store
// keeps those buttons from importing each other.
import { useSyncExternalStore } from "react";

let open = false;
const subs = new Set<() => void>();
const set = (v: boolean) => {
  if (open === v) return;
  open = v;
  subs.forEach((f) => f());
};

export function toggleNotes(): void { set(!open); }
export function closeNotes(): void { set(false); }
export function useNotesOpen(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => open, () => false);
}
