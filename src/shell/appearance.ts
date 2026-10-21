// The one place html attributes and the shell class are set (17B SET-02; moved out of QuayShell).
import { ownedShells, type AcctEntitlements, type RankChannel, type ShellId } from "./channels";
import type { ShellState } from "./store";
import type { PaletteId } from "./types";

export interface AppearanceInput {
  palette: PaletteId;
  prefs: ShellState["prefs"];
  rank: Pick<RankChannel, "rank" | "shellsEarned">;
  /** acct:entitlements (E-64): owned cosmetic shells are its SHELL_STYLE items. */
  entitlements: AcctEntitlements;
  /** window.matchMedia(q).matches; injectable for tests. */
  media: (query: string) => boolean;
}

export const rankShell = (rank: RankChannel["rank"]): ShellId => rank.toLowerCase() as ShellId;

/** Shells the picker lists: earned ones, plus owned cosmetics (deduplicated, earned order first). */
export const availableShells = (rank: AppearanceInput["rank"], ent: AcctEntitlements): ShellId[] => [...new Set([...rank.shellsEarned, ...ownedShells(ent)])];

/** A stale prefs.shell (no longer earned or owned) falls back to the rank shell (17B SET-02). */
export function chosenShell(prefs: AppearanceInput["prefs"], rank: AppearanceInput["rank"], ent: AcctEntitlements): ShellId {
  const want = prefs.shell as ShellId;
  return availableShells(rank, ent).includes(want) ? want : rankShell(rank.rank);
}

export function reducedTransparency(prefs: AppearanceInput["prefs"], media: AppearanceInput["media"]): boolean {
  return prefs.reducedTransparency === "on" || (prefs.reducedTransparency === "system" && media("(prefers-reduced-transparency: reduce)"));
}

/** The class actually applied: R5's glass renders as R4 under reduced transparency (17 §3.12). */
export function effectiveShell(input: AppearanceInput): ShellId {
  const s = chosenShell(input.prefs, input.rank, input.entitlements);
  return s === "r5" && reducedTransparency(input.prefs, input.media) ? "r4" : s;
}

export function applyAppearance(html: HTMLElement, input: AppearanceInput): void {
  const { prefs, media } = input;
  const motion = prefs.reducedMotion === "on" || (prefs.reducedMotion === "system" && media("(prefers-reduced-motion: reduce)"));
  html.dataset.palette = input.palette;
  const toggle = (k: string, on: boolean, v: string) => { if (on) html.dataset[k] = v; else delete html.dataset[k]; };
  toggle("motion", motion, "reduce");
  toggle("transparency", reducedTransparency(prefs, media), "reduce");
  toggle("hc", prefs.highContrast, "1");
  toggle("cb", prefs.colorBlindPair, "1");
  html.style.setProperty("--text-scale", String(prefs.textScale)); // every --fs-* scales (17 §2.1 textScale)
  const cls = `shell-${effectiveShell(input)}`;
  [...html.classList].filter((c) => c.startsWith("shell-") && c !== cls).forEach((c) => html.classList.remove(c));
  html.classList.add(cls);
}
