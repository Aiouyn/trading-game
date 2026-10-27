// Shell sheet host (17A T6): one sheet at a time, opened from anywhere via `openSheet`, rendered by QuayShell.
import { useSyncExternalStore, type ReactNode } from "react";

export interface SheetRequest { side?: "bottom" | "right"; label: string; content: ReactNode; testId?: string }
let current: SheetRequest | null = null;
const subs = new Set<() => void>();
const set = (r: SheetRequest | null) => { current = r; subs.forEach((f) => f()); };
export const openSheet = (r: SheetRequest) => set(r);
export const closeSheet = () => set(null);
export const useSheetRequest = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => null);
