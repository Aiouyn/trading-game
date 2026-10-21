// Named layouts (Spec 1 §3.2, 17 §3.2.5). Layouts only move windows; they never submit an intent.
// Every layout is a left column plus a right column of one or two stacked windows. Minimum sizes win
// over the plan (PR #2 answer 2): a clamped window takes the space from its neighbour, and a layout
// that cannot fit with every minimum honoured is not offered at that size.
import type { AppId } from "./registry";
import type { SnapSlot, WindowRect } from "./types";
import { GUTTER, minSize, type Area } from "./wm";

export type LayoutId = "trade" | "review" | "research" | "operator" | "shadow" | "institution";
interface Pane { app: AppId; context?: string }
export interface LayoutDef { id: LayoutId; name: string; leftFrac: 1 | 2; left: Pane; right: Pane[] }

/** leftFrac 2 = left 2/3, right 1/3; leftFrac 1 = halves. */
export const LAYOUTS: readonly LayoutDef[] = [
  { id: "trade", name: "Trade", leftFrac: 2, left: { app: "broker" }, right: [{ app: "wire" }, { app: "portfolio" }] },
  { id: "review", name: "Review", leftFrac: 1, left: { app: "portfolio" }, right: [{ app: "portfolio", context: "Journal" }] },
  { id: "research", name: "Research", leftFrac: 2, left: { app: "research" }, right: [{ app: "broker" }, { app: "wire" }] },
  { id: "operator", name: "Operator", leftFrac: 1, left: { app: "businesses" }, right: [{ app: "city" }, { app: "property" }] },
  { id: "shadow", name: "Shadow", leftFrac: 1, left: { app: "security" }, right: [{ app: "ailab" }] },
  { id: "institution", name: "Institution", leftFrac: 2, left: { app: "institutions" }, right: [{ app: "messages" }, { app: "markets", context: "System" }] },
];

export const DEFAULT_LAYOUT: LayoutId = "trade";
export const LAYOUTS_MAX_CUSTOM = 5; // ui_layouts_max

type Placed = { pane: Pane; rect: Area; snap: SnapSlot };

/** Clamped rects for a layout, or null when it cannot fit with all minimums. */
/** Trade is not offered below this viewport width: Broker 720 + Portfolio 520 + 3 × 8 px gutters (17A T4 §3). */
export const TRADE_MIN_VW = 1264;

export function planLayout(def: LayoutDef, a: Area): Placed[] | null {
  if (def.id === "trade" && a.w + 2 * GUTTER < TRADE_MIN_VW) return null;
  const mins = (p: Pane) => minSize(p.app, a.w);
  const third = (a.w - 2 * GUTTER) / 3;
  const half = (a.w - GUTTER) / 2;
  const planRightW = def.leftFrac === 2 ? third : half;
  const rightW = Math.max(planRightW, ...def.right.map((p) => mins(p).w));
  const leftW = a.w - GUTTER - rightW;
  if (leftW < mins(def.left).w || a.h < mins(def.left).h) return null;

  const rx = a.x + a.w - rightW;
  const placed: Placed[] = [{ pane: def.left, rect: { x: a.x, y: a.y, w: leftW, h: a.h }, snap: def.leftFrac === 2 ? "L2/3" : "L1/2" }];
  if (def.right.length === 1) {
    if (a.h < mins(def.right[0]).h) return null;
    placed.push({ pane: def.right[0], rect: { x: rx, y: a.y, w: rightW, h: a.h }, snap: def.leftFrac === 2 ? "R1/3" : "R1/2" });
  } else {
    const [top, bottom] = def.right;
    let topH = Math.max((a.h - GUTTER) / 2, mins(top).h);
    let bottomH = a.h - GUTTER - topH;
    if (bottomH < mins(bottom).h) { bottomH = mins(bottom).h; topH = a.h - GUTTER - bottomH; }
    if (topH < mins(top).h) return null;
    placed.push({ pane: top, rect: { x: rx, y: a.y, w: rightW, h: topH }, snap: "TR" });
    placed.push({ pane: bottom, rect: { x: rx, y: a.y + topH + GUTTER, w: rightW, h: bottomH }, snap: "BR" });
  }
  return placed.map((p) => ({ ...p, rect: { x: Math.round(p.rect.x), y: Math.round(p.rect.y), w: Math.round(p.rect.w), h: Math.round(p.rect.h) } }));
}

export const layoutFits = (id: LayoutId, a: Area) => planLayout(LAYOUTS.find((l) => l.id === id)!, a) !== null;

/**
 * Window rects for a layout. Locked apps are skipped and their slot left empty [P]. The Review layout
 * may create a second Portfolio window with context "Journal" (PR #2 answer 3); normal opening keeps max 1.
 */
export function applyLayout(id: LayoutId, a: Area, isUnlocked: (app: AppId) => boolean): WindowRect[] {
  const def = LAYOUTS.find((l) => l.id === id);
  const plan = def ? planLayout(def, a) : null;
  // A new account below 1264 px opens Broker alone instead of the Trade layout.
  if (!plan && id === "trade" && isUnlocked("broker")) {
    const s = minSize("broker", a.w);
    return [{ app: "broker", instance: 1, x: a.x, y: a.y, w: Math.min(a.w, Math.max(s.w, Math.min(a.w, 840))), h: Math.min(a.h, Math.max(s.h, 560)), snap: null, workspace: 1, collapsed: false }];
  }
  if (!plan) return [];
  const count: Partial<Record<AppId, number>> = {};
  return plan.filter((p) => isUnlocked(p.pane.app)).map(({ pane, rect, snap }) => {
    const instance = (count[pane.app] = (count[pane.app] ?? 0) + 1);
    return { app: pane.app, instance, ...rect, snap, workspace: 1, collapsed: false, context: pane.context };
  });
}
