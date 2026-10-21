// Visibility algorithm, exactly 17 §3.2.4. Unlocks are sticky except license/charter rules (live state).
import { APPS, REGISTRY, RANKS, type AppDef, type AppId, type Rank, type UnlockRule } from "./registry";
import type { MeChannel, RankChannel } from "./channels";

export type Visibility = "hidden" | "locked" | "unlocked";

export interface UnlockInput { rank: RankChannel; me: MeChannel }

const rankAtLeast = (r: Rank, min: Rank) => RANKS.indexOf(r) >= RANKS.indexOf(min);
const licNum = (l: string) => Number(l.replace(/\D/g, "") || "0");

/** Decimal-string compare without floating point (money is never computed client-side). */
export function moneyAtLeast(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [i, f = ""] = s.replace(/^\+/, "").split(".");
    return { i: i.replace(/^0+(?=\d)/, ""), f };
  };
  if (a.startsWith("-") && b.startsWith("-")) return moneyAtLeast(b.slice(1), a.slice(1));
  if (a.startsWith("-")) return false;
  if (b.startsWith("-")) return true;
  const x = norm(a);
  const y = norm(b);
  if (x.i.length !== y.i.length) return x.i.length > y.i.length;
  if (x.i !== y.i) return x.i > y.i;
  const len = Math.max(x.f.length, y.f.length);
  return x.f.padEnd(len, "0") >= y.f.padEnd(len, "0");
}

function flagsOf(me: MeChannel): Set<string> {
  const f = new Set(me.flags);
  if (!me.guest) f.add("account.upgraded");
  return f;
}

/** True when the rule holds right now. */
export function ruleMet(rule: UnlockRule, s: UnlockInput): boolean {
  switch (rule.kind) {
    case "always": return true;
    case "rank": return rankAtLeast(s.rank.rank, rule.min);
    case "license": return licNum(s.me.license) >= licNum(rule.min);
    case "charter": return rule.charter === "*" ? s.me.charters.length > 0 : s.me.charters.includes(rule.charter);
    case "nw": return moneyAtLeast(s.me.nw, rule.minNw);
    case "flag": return flagsOf(s.me).has(rule.flag);
    case "anyOf": return rule.rules.some((r) => ruleMet(r, s));
  }
}

/** License and charter rules follow live state; everything else is sticky once met. */
export function isLive(rule: UnlockRule): boolean {
  if (rule.kind === "license" || rule.kind === "charter") return true;
  if (rule.kind === "anyOf") return rule.rules.some(isLive); // Institutions is a charter rule as a whole
  return false;
}

function teaserMet(app: AppDef, s: UnlockInput): boolean {
  const t = app.teaser;
  switch (t.kind) {
    case "none": return false;
    case "always": return true;
    case "fromRank": return rankAtLeast(s.rank.rank, t.rank);
    case "fromOnboarding": return s.me.onboardingDone || s.me.onboardingMin >= t.atMin;
  }
}

/**
 * Evaluate every app. `sticky` holds apps already unlocked for this character (persisted);
 * the returned set is the new sticky set.
 */
export function evaluate(s: UnlockInput, sticky: ReadonlySet<AppId>): { vis: Record<AppId, Visibility>; sticky: Set<AppId> } {
  const next = new Set(sticky);
  const vis = {} as Record<AppId, Visibility>;
  for (const app of REGISTRY) {
    const now = ruleMet(app.unlock, s);
    const live = isLive(app.unlock);
    if (now && !live) next.add(app.id);
    const unlocked = live ? now : now || next.has(app.id);
    vis[app.id] = unlocked ? "unlocked" : teaserMet(app, s) ? "locked" : "hidden";
  }
  return { vis, sticky: next };
}

export const appDef = (id: AppId) => APPS[id];

/** Next rank and its NW target, read from the server `rank.thresholds` (17 §2.6; R6 $20B per E-21). Null only at R6. */
export function nextRankTarget(r: RankChannel): { rank: Rank; at: string } | null {
  const i = RANKS.indexOf(r.rank);
  const at = r.thresholds[i];
  return i < RANKS.length - 1 && at !== undefined ? { rank: RANKS[i + 1], at } : null;
}
