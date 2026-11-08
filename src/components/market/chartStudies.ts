"use client";
// Broker chart overlay choices (SMA, EMA: on or off, and the period), per account on this device: its own IndexedDB
// record `quay.<accountId>.chart` ("guest" when signed out), never the drawings' or the shell's (persist.ts).
//  - Read before anything is shown: while the session or the read is pending there are no overlay controls (no
//    flash of the guest's choices in an account). A read that fails is not "all off": no controls, nothing written,
//    and a Retry (as the trend lines, trendlines.ts).
//  - A change writes only the overlay it changes, applied to the device's copy inside one readwrite transaction, so
//    another tab's change to the other overlay is never undone; after the write the page shows what the device kept.
//    A write that fails is taken back and said so.
//  - Not sent to the server: another device or browser has its own choices.
import { useSyncExternalStore } from "react";
import { loadChartPrefs, updateChartPrefs } from "@/shell/persist";

export type StudyKind = "sma" | "ema";
export const STUDY_KINDS: readonly StudyKind[] = ["sma", "ema"];
/** The periods offered (bars); the first is the default. p10's chart had SMA 20, SMA 50 and EMA 12; EMA 26 is EMA 12's
 *  usual pair. */
export const STUDY_PERIODS: Readonly<Record<StudyKind, readonly number[]>> = { sma: [20, 50], ema: [12, 26] };
export interface StudyPref { readonly on: boolean; readonly n: number }
export type StudyPrefs = Readonly<Record<StudyKind, StudyPref>>;
export const DEFAULT_STUDIES: StudyPrefs = { sma: { on: false, n: STUDY_PERIODS.sma[0]! }, ema: { on: false, n: STUDY_PERIODS.ema[0]! } };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** What the device kept, validated: an unknown period or a broken entry is that overlay's default (off). */
export function parseStudies(raw: unknown): StudyPrefs {
  const out = { ...DEFAULT_STUDIES };
  if (!isRecord(raw)) return out;
  for (const k of STUDY_KINDS) {
    const v = raw[k];
    if (isRecord(v) && typeof v.on === "boolean" && typeof v.n === "number" && STUDY_PERIODS[k].includes(v.n)) out[k] = { on: v.on, n: v.n };
  }
  return out;
}

type Scoped =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly prefs: StudyPrefs; readonly unsaved: boolean };
export type StudiesStatus = "loading" | "error" | "ready" | "unsaved";
const scopes = new Map<string, Scoped>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const pending = new Map<string, number>();
const failed = new Set<string>();

function read(scope: string, unsaved: boolean): void {
  const loading: Scoped = { status: "loading" };
  scopes.set(scope, loading);
  loadChartPrefs(scope).then(
    (raw) => { if (scopes.get(scope) === loading) { scopes.set(scope, { status: "ready", prefs: parseStudies(raw), unsaved }); emit(); } },
    () => { if (scopes.get(scope) === loading) { scopes.set(scope, { status: "error" }); emit(); } },
  );
}
export function retryStudies(scope: string): void {
  if (scopes.get(scope)?.status !== "error") return;
  read(scope, false);
  emit();
}
export function studiesOf(scope: string | null): StudyPrefs | null {
  const s = scope === null ? undefined : scopes.get(scope);
  return s?.status === "ready" ? s.prefs : null;
}
export function studiesStatus(scope: string | null): StudiesStatus {
  const s = scope === null ? undefined : scopes.get(scope);
  return !s ? "loading" : s.status === "ready" ? (s.unsaved ? "unsaved" : "ready") : s.status;
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** The scope's choices; null until the device's copy is read, or if it could not be (no controls). */
export function useStudies(scope: string | null): StudyPrefs | null {
  if (scope !== null && !scopes.has(scope)) read(scope, false);
  return useSyncExternalStore(subscribe, () => studiesOf(scope), () => null);
}
export function useStudiesStatus(scope: string | null): StudiesStatus {
  return useSyncExternalStore(subscribe, () => studiesStatus(scope), () => "loading");
}

/** The player set one overlay: shown at once, written as that overlay only. */
export function setStudy(scope: string, kind: StudyKind, pref: StudyPref): void {
  const s = scopes.get(scope);
  if (s?.status !== "ready" || !STUDY_PERIODS[kind].includes(pref.n)) return;
  const was = s.prefs[kind];
  if (was.on === pref.on && was.n === pref.n) return;
  scopes.set(scope, { ...s, prefs: { ...s.prefs, [kind]: pref } });
  emit();
  pending.set(scope, (pending.get(scope) ?? 0) + 1);
  const settle = (kept: StudyPrefs | null) => {
    const left = (pending.get(scope) ?? 1) - 1;
    pending.set(scope, left);
    if (kept === null) failed.add(scope);
    if (left > 0) return; // a later write of this page is queued: its result is the newer copy
    const lost = failed.delete(scope);
    if (scopes.get(scope)?.status !== "ready") return;
    if (kept === null) read(scope, true);
    else scopes.set(scope, { status: "ready", prefs: kept, unsaved: lost });
    emit();
  };
  updateChartPrefs(scope, (raw) => ({ ...(isRecord(raw) ? raw : {}), [kind]: { on: pref.on, n: pref.n } })) // other keys kept as stored
    .then((kept) => settle(parseStudies(kept)), () => settle(null));
}

/** Test only: forget every scope read so far (a page reload). */
export function _resetStudiesForTests(): void { scopes.clear(); pending.clear(); failed.clear(); }
