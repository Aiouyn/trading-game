// Named layouts (Spec 1 §3.2, 17 §3.2.5). Layouts only move windows; they never submit an intent.
import type { AppId } from "./registry";
import type { WindowRect } from "./types";
import { slotRect, thirdCorner, type Area } from "./wm";

export type LayoutId = "trade" | "review" | "research" | "operator" | "shadow" | "institution";
export type Place = "L2/3" | "L1/2" | "R1/2" | "TR3" | "BR3" | "TR" | "BR";

export interface LayoutDef { id: LayoutId; name: string; slots: { app: AppId; place: Place; context?: string }[] }

export const LAYOUTS: readonly LayoutDef[] = [
  { id: "trade", name: "Trade", slots: [{ app: "broker", place: "L2/3" }, { app: "wire", place: "TR3" }, { app: "portfolio", place: "BR3" }] },
  { id: "review", name: "Review", slots: [{ app: "portfolio", place: "L1/2" }, { app: "portfolio", place: "R1/2", context: "Journal" }] },
  { id: "research", name: "Research", slots: [{ app: "research", place: "L2/3" }, { app: "broker", place: "TR3" }, { app: "wire", place: "BR3" }] },
  { id: "operator", name: "Operator", slots: [{ app: "businesses", place: "L1/2" }, { app: "city", place: "TR" }, { app: "property", place: "BR" }] },
  { id: "shadow", name: "Shadow", slots: [{ app: "security", place: "L1/2" }, { app: "ailab", place: "R1/2" }] },
  { id: "institution", name: "Institution", slots: [{ app: "institutions", place: "L2/3" }, { app: "messages", place: "TR3" }, { app: "markets", place: "BR3", context: "System" }] },
];

export const DEFAULT_LAYOUT: LayoutId = "trade";
export const LAYOUTS_MAX_CUSTOM = 5; // ui_layouts_max

export function placeRect(place: Place, a: Area): Area {
  if (place === "TR3") return thirdCorner("TR", a);
  if (place === "BR3") return thirdCorner("BR", a);
  return slotRect(place, a);
}

/**
 * Window rects for a layout. Locked apps are skipped and their slot left empty [P].
 * Review shows Portfolio and its Journal view side by side: the Journal is the Portfolio
 * window's context, so the one Portfolio instance takes L1/2 and the Journal pane is a
 * second view in R1/2 (instance 2) — see open question Q3.
 */
export function applyLayout(id: LayoutId, a: Area, isUnlocked: (app: AppId) => boolean): WindowRect[] {
  const def = LAYOUTS.find((l) => l.id === id);
  if (!def) return [];
  const count: Partial<Record<AppId, number>> = {};
  return def.slots.filter((s) => isUnlocked(s.app)).map((s) => {
    const instance = (count[s.app] = (count[s.app] ?? 0) + 1);
    const r = placeRect(s.place, a);
    const snap = s.place === "TR3" ? "TR" : s.place === "BR3" ? "BR" : s.place;
    return { app: s.app, instance, ...r, snap, workspace: 1, collapsed: false, context: s.context };
  });
}
