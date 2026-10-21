// Shapes the shell reads from the server channels (17 §2.6). Money is a decimal string.
import type { Rank } from "./registry";
import type { ShellId } from "./types";

export type { ShellId };

export type MarketPhase = "pre" | "open_auction" | "continuous" | "close_auction" | "after" | "weekend";

export interface ClockChannel { tick: number; gameDay: number; tickOfDay: number; phase: MarketPhase }
/**
 * `rank` channel (17 §2.6). thresholds[i] is the NW needed for rank R(i+1) (R1..R5); R6 is not NW-only.
 * shellsEarned (17 §2.6) lists the rank shells the player has earned. Owned cosmetic shells come from
 * `acct:entitlements` (Systems ruling E-64), never from this channel.
 */
export interface RankChannel { rank: Rank; thresholds: string[]; nextAt: string | null; shellsEarned: ShellId[] }
export interface MeChannel {
  nw: string;
  todayPct: string;
  todayChg: string;             // today's change, Money decimal string
  license: string;              // LIC0..LIC4, live
  charters: string[];           // live
  flags: string[];              // server capability flags, e.g. character.day3, alliance.invited (never derived here)
  onboardingMin: number;        // minutes into the first session (18)
  onboardingDone: boolean;      // finished or skipped (18)
  guest: boolean;
  protectionEndsRealMs: number | null;
  myPlaces: string[];           // entity ids of the player's own places (client-only, never uploaded)
}
/** Connection and world state for the §5 shell states (stubbed; owners 02/13/19). */
export interface SystemState {
  connection: "live" | "reconnecting";
  halted: boolean;
  held: boolean;
  load: "ok" | "loading" | "error"; // §5 error state: inline "Couldn't load · Retry"
  offline: boolean;                  // §5 offline: read-only snapshot
}
export interface Channels { clock: ClockChannel; rank: RankChannel; me: MeChannel; system: SystemState; entitlements: AcctEntitlements }

/**
 * Platform channel `acct:entitlements` (Systems ruling E-64; mirrors GET /api/v1/me/entitlements).
 * Active items only, sorted by itemId, unique. The client never sees accountId, entitlementId, purchaseId or prices.
 */
export interface EntitlementView { itemId: string; slot: string; source: string; labelPurchased: string; grantedAt: string }
export interface AcctEntitlements { items: EntitlementView[] }

export const ENTITLEMENT_KEYS = ["itemId", "slot", "source", "labelPurchased", "grantedAt"] as const;
const FORBIDDEN = /^(accountId|entitlementId|purchaseId)$|price|amount|cost/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Strict parser: throws on a missing/extra key, a forbidden field, a bad grantedAt, unsorted or duplicate itemIds. */
export function parseEntitlements(raw: unknown): AcctEntitlements {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) throw new Error("entitlements: items[] missing");
  const extraTop = Object.keys(raw).filter((k) => k !== "items");
  if (extraTop.length) throw new Error(`entitlements: unexpected field ${extraTop[0]}`);
  const items = (raw as { items: unknown[] }).items.map((it, i): EntitlementView => {
    if (!it || typeof it !== "object") throw new Error(`entitlements[${i}]: not an object`);
    const o = it as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (FORBIDDEN.test(k)) throw new Error(`entitlements[${i}]: forbidden field ${k}`);
      if (!(ENTITLEMENT_KEYS as readonly string[]).includes(k)) throw new Error(`entitlements[${i}]: unexpected field ${k}`);
    }
    for (const k of ENTITLEMENT_KEYS) if (typeof o[k] !== "string" || o[k] === "") throw new Error(`entitlements[${i}]: missing ${k}`);
    const g = o.grantedAt as string;
    if (!ISO_UTC.test(g) || Number.isNaN(Date.parse(g))) throw new Error(`entitlements[${i}]: bad grantedAt`);
    return { itemId: o.itemId as string, slot: o.slot as string, source: o.source as string, labelPurchased: o.labelPurchased as string, grantedAt: g };
  });
  for (let i = 1; i < items.length; i++) {
    if (items[i].itemId === items[i - 1].itemId) throw new Error(`entitlements: duplicate itemId ${items[i].itemId}`);
    if (items[i].itemId < items[i - 1].itemId) throw new Error("entitlements: not sorted by itemId");
  }
  return { items };
}

/** Owned cosmetic shells: entitlement items in the SHELL_STYLE slot. */
export const ownedShells = (e: AcctEntitlements): ShellId[] =>
  e.items.filter((i) => i.slot === "SHELL_STYLE" && i.itemId.startsWith("cos_shell_")).map((i) => i.itemId as ShellId);
