// Typed app registry (Spec 1 §2; V3 17 §2.2, §3.2.4, §3.2.5). Static data only: no React, no DOM.

export const APP_IDS = [
  "broker", "portfolio", "wire", "messages", "markets", "risk", "quantlab", "research",
  "businesses", "company", "property", "city", "bank", "funds", "insurance", "institutions",
  "ailab", "security", "legal", "estate", "boards", "profile", "alliance", "contracts",
  "auctions", "civic", "academy", "help", "atelier", "settings", "replay", "api",
] as const;

/** V3 17 §2.2 AppId union, verbatim. */
export type AppId =
  | "broker" | "portfolio" | "wire" | "messages" | "markets" | "risk" | "quantlab" | "research"
  | "businesses" | "company" | "property" | "city" | "bank" | "funds" | "institutions" | "insurance"
  | "ailab" | "security" | "legal" | "estate" | "boards" | "profile" | "alliance" | "contracts"
  | "auctions" | "civic" | "academy" | "help" | "atelier" | "settings" | "replay" | "api";

export type AppGroup = "trade" | "build" | "shadow" | "world" | "me";
export const GROUPS: readonly AppGroup[] = ["trade", "build", "shadow", "world", "me"];

/** 17 header: R0 Broke, R1 Hustler, R2 Owner, R3 Mogul, R4 Tycoon, R5 Titan, R6 Dynasty. */
export type Rank = "R0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
export const RANKS: readonly Rank[] = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"];
export const RANK_NAMES: Record<Rank, string> = {
  R0: "Broke", R1: "Hustler", R2: "Owner", R3: "Mogul", R4: "Tycoon", R5: "Titan", R6: "Dynasty",
};

export type UnlockRule =
  | { kind: "always" }
  | { kind: "rank"; min: Rank }
  | { kind: "license"; min: string }
  | { kind: "charter"; charter: string }
  | { kind: "nw"; minNw: string /* Money decimal string */ }
  | { kind: "flag"; flag: string }
  | { kind: "anyOf"; rules: UnlockRule[] };

export type TeaserRule =
  | { kind: "none" }
  | { kind: "fromRank"; rank: Rank }
  | { kind: "fromOnboarding"; atMin: number }
  | { kind: "always" };

export interface AppDef {
  id: AppId;
  nameKey: `app.${AppId}.name`;
  group: AppGroup;
  order: number;
  unlock: UnlockRule;
  teaser: TeaserRule;
  lockLabel?: string;
  /** Tooltip naming the unlock (17 §3.2.4). */
  lockHint?: string;
  minW: number;
  minH: number;
  narrowMinW?: number;
  maxInstances: number;
  built: boolean;
}

const ALWAYS: UnlockRule = { kind: "always" };
const NONE: TeaserRule = { kind: "none" };

type Row = Omit<AppDef, "nameKey" | "order" | "built" | "minW" | "minH" | "maxInstances" | "unlock" | "teaser"> &
  Partial<Pick<AppDef, "minW" | "minH" | "maxInstances" | "unlock" | "teaser">>;

const ROWS: Row[] = [
  { id: "broker", group: "trade", minW: 720, minH: 420, narrowMinW: 480, maxInstances: 4 },
  { id: "portfolio", group: "trade", minW: 520, minH: 220 },
  { id: "wire", group: "trade", minW: 360, minH: 280 },
  { id: "messages", group: "trade" },
  { id: "markets", group: "trade" },
  { id: "risk", group: "trade", unlock: { kind: "license", min: "LIC2" }, teaser: { kind: "fromRank", rank: "R1" }, lockLabel: "LIC2", lockHint: "Opens with license LIC2" },
  { id: "quantlab", group: "trade", unlock: { kind: "rank", min: "R2" }, teaser: { kind: "fromRank", rank: "R1" }, lockLabel: "R2", lockHint: "Opens at rank R2 · Owner" },
  { id: "research", group: "trade", unlock: { kind: "rank", min: "R3" }, teaser: { kind: "fromRank", rank: "R2" }, lockLabel: "R3", lockHint: "Opens at rank R3 · Mogul" },
  { id: "businesses", group: "build" },
  { id: "company", group: "build", unlock: { kind: "rank", min: "R2" }, teaser: { kind: "fromRank", rank: "R1" }, lockLabel: "R2", lockHint: "Opens at rank R2 · Owner" },
  { id: "property", group: "build" },
  { id: "city", group: "build", minW: 560, minH: 400 },
  { id: "bank", group: "build" },
  { id: "funds", group: "build" },
  { id: "insurance", group: "build" },
  {
    id: "institutions", group: "build",
    unlock: { kind: "anyOf", rules: [{ kind: "flag", flag: "charter.anyAvailable" }, { kind: "charter", charter: "*" }] },
    teaser: { kind: "fromRank", rank: "R3" }, lockLabel: "Charter", lockHint: "Opens when a charter is available",
  },
  { id: "ailab", group: "shadow", unlock: { kind: "nw", minNw: "100000" }, teaser: { kind: "fromOnboarding", atMin: 7.5 }, lockLabel: "$100k", lockHint: "The Lab opens at $100k" },
  { id: "security", group: "shadow" },
  { id: "legal", group: "shadow" },
  { id: "estate", group: "me" },
  { id: "boards", group: "world" },
  { id: "profile", group: "me" },
  {
    id: "alliance", group: "world",
    unlock: { kind: "anyOf", rules: [{ kind: "flag", flag: "character.day3" }, { kind: "flag", flag: "alliance.invited" }] },
  },
  { id: "contracts", group: "world", unlock: { kind: "flag", flag: "account.upgraded" }, teaser: { kind: "always" }, lockLabel: "Account", lockHint: "Create an account to sign contracts" },
  { id: "auctions", group: "world" },
  { id: "civic", group: "world", minW: 560, minH: 400 },
  { id: "academy", group: "me" },
  { id: "help", group: "me" },
  { id: "atelier", group: "me" },
  { id: "settings", group: "me" },
  { id: "replay", group: "world", maxInstances: 2 },
  { id: "api", group: "trade", unlock: { kind: "flag", flag: "api.eligible" } },
];

/** Apps with a real body. 17B CH-00 flipped portfolio and wire (lazy-loaded). Broker stays built:false until BRK-A
 *  ships its body: it shows "Coming later" straight away and is not presented as a built app (Producer). */
const BUILT: ReadonlySet<AppId> = new Set(["settings", "portfolio", "wire"]);

export const REGISTRY: readonly AppDef[] = ROWS.map((r, i) => ({
  minW: 420, minH: 300, maxInstances: 1, unlock: ALWAYS, teaser: NONE,
  ...r,
  nameKey: `app.${r.id}.name` as const,
  order: i + 1,
  built: BUILT.has(r.id),
}));

export const APPS: Record<AppId, AppDef> = Object.fromEntries(REGISTRY.map((a) => [a.id, a])) as Record<AppId, AppDef>;

export function isAppId(v: string): v is AppId {
  return (APP_IDS as readonly string[]).includes(v);
}

/** Shadow sub-palette applies to AI Lab and Security only (17 §3.3.1); Legal stays brass. */
export function subPalette(id: AppId): "shadow" | undefined {
  return APPS[id].group === "shadow" && (id === "ailab" || id === "security") ? "shadow" : undefined;
}
