// Settings section ids and order (17 §7.2). Only SET-02 and SET-08 are built; the rest show ComingLater.
import { useSyncExternalStore } from "react";

export const SECTION_IDS = ["SET-01", "SET-02", "SET-03", "SET-04", "SET-05", "SET-06", "SET-07", "SET-08"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const BUILT_SECTIONS: ReadonlySet<SectionId> = new Set(["SET-02", "SET-08"]);
export const DEFAULT_SECTION: SectionId = "SET-02"; // [P] Appearance selected by default on desktop
export const isSectionId = (v: string | undefined): v is SectionId => !!v && (SECTION_IDS as readonly string[]).includes(v);

// Selected section (desktop) / pushed section (phone): one per page, settable from a deep link (/settings/SET-08).
type Sel = { desktop: SectionId; pushed: SectionId | null };
let sel: Sel = { desktop: DEFAULT_SECTION, pushed: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const settingsNav = {
  get: () => sel,
  /** Select a section: on desktop it is shown on the right; on phone it is pushed onto the stack. */
  open(id: SectionId) { sel = { desktop: id, pushed: id }; emit(); },
  /** Phone: pop back to the section list. */
  back() { sel = { ...sel, pushed: null }; emit(); },
  reset() { sel = { desktop: DEFAULT_SECTION, pushed: null }; emit(); },
};
export const useSettingsNav = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, settingsNav.get, settingsNav.get);
