// Mock server for the clock / rank / me channels (stands in for the gateway). Query params script a character:
// rank, lic, nw, flags, guest, prot, onb, onbDone, … (dev and e2e builds only; build-gated by QUAY_HOOKS).
import { parseEntitlements, type AcctEntitlements, type Channels, type ClockChannel, type MarketPhase, type ShellId } from "./channels";
import { loadHookStartsFailed } from "./loader";
import { RANKS, type Rank } from "./registry";

// Build-time gate (QUAY_HOOKS is always defined as "1"/"0" by next.config `env`, the single source of truth).
// Keep it a MODULE-LOCAL const: an exported const read from another module is emitted as a runtime property read
// on that module's exports once the module is shared by two chunks, and the gated branch then ships (see PR notes).
const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";

export const TICK_MS = 5000;
/** Rank thresholds as the server would publish them (17 header; R6 $20B per errata E-21): R1 $20k … R6 $20B. */
export const RANK_THRESHOLDS = ["20000", "250000", "5000000", "100000000", "2000000000", "20000000000"] as const;
export const TICKS_PER_DAY = 720;

const DEFAULT_TICK = 38 * TICKS_PER_DAY + 340;

const PHASES: readonly MarketPhase[] = ["pre", "open_auction", "continuous", "close_auction", "after", "weekend"];
/** Mock-only `?phase=` override (17A T3 screenshots/e2e): pins the market phase across ticks.
 *  Build-time gate: Next inlines NODE_ENV and NEXT_PUBLIC_* at build time, so in a production build without
 *  NEXT_PUBLIC_QUAY_MOCK_PHASE=1 this folds to `false` and the override below is eliminated as dead code
 *  (no runtime env check survives; the "phase" query read is not in the bundle). The e2e build opts in. */
export const PHASE_HOOK: boolean =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QUAY_MOCK_PHASE === "1";
/** @deprecated kept for callers; equals the build-time constant. */
export const phaseOverrideEnabled = () => PHASE_HOOK;
export const phaseOverride: (q: URLSearchParams) => MarketPhase | null = PHASE_HOOK
  ? (q) => {
      const p = q.get("phase");
      return p && (PHASES as readonly string[]).includes(p) ? (p as MarketPhase) : null;
    }
  : () => null;

/** The unscripted mock character (what a no-flag production build always serves). */
export function defaultChannels(): Channels {
  return {
    clock: clockAt(DEFAULT_TICK),
    rank: { rank: "R2", thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf("R2")] ?? null, shellsEarned: mockShells(new URLSearchParams(), "R2") },
    entitlements: mockEntitlements(new URLSearchParams()),
    system: { connection: "live", halted: false, held: false, load: "ok", offline: false },
    me: {
      nw: "412860.15", todayPct: "+0.78", todayChg: "+3204.10", license: "LIC1", charters: [], flags: [],
      onboardingMin: 60, onboardingDone: true, myPlaces: [], guest: false, protectionEndsRealMs: null,
    },
  };
}

/** Mock channels scripted by the URL. Gated at build time (QUAY_HOOKS, module-local): off, the overrides are compiled out. */
export function mockChannels(q: URLSearchParams): Channels {
  const d = defaultChannels();
  if (!MOCK_HOOKS) return d;
  const rankParam = q.get("rank") ?? d.rank.rank;
  const rank: Rank = (RANKS as readonly string[]).includes(rankParam) ? (rankParam as Rank) : "R2";
  const list = (k: string) => (q.get(k) ?? "").split(",").filter(Boolean);
  return {
    clock: { ...clockAt(Number(q.get("tick") ?? DEFAULT_TICK)), ...(phaseOverride(q) ? { phase: phaseOverride(q)! } : {}) },
    rank: { rank, thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf(rank)] ?? null, shellsEarned: mockShells(q, rank) },
    entitlements: mockEntitlements(q),
    system: { connection: q.get("conn") === "reconnecting" ? "reconnecting" : "live", halted: q.get("halted") === "1", held: q.get("held") === "1", load: loadHookStartsFailed(q) ? "error" : "ok", offline: false },
    me: {
      nw: q.get("nw") ?? d.me.nw,
      todayPct: q.get("pct") ?? d.me.todayPct,
      todayChg: q.get("chg") ?? d.me.todayChg,
      license: q.get("lic") ?? d.me.license,
      charters: list("charters"),
      flags: list("flags"),
      onboardingMin: Number(q.get("onb") ?? d.me.onboardingMin),
      onboardingDone: q.get("onbDone") !== "0",
      myPlaces: list("places"),
      guest: q.get("guest") === "1",
      protectionEndsRealMs: q.get("prot") === "1" ? 41 * 60_000 + 12_000 : null,
    },
  };
}

/** Clock from a tick: 720 ticks per game day, each tick = 2 game minutes. */
export function clockAt(tick: number): ClockChannel {
  const gameDay = Math.floor(tick / TICKS_PER_DAY);
  const tickOfDay = tick % TICKS_PER_DAY;
  const minute = tickOfDay * 2;
  const phase = minute < 9 * 60 + 30 ? "pre" : minute < 16 * 60 ? "continuous" : "after";
  return { tick, gameDay, tickOfDay, phase };
}

export function clockLabel(c: ClockChannel): { day: number; hhmm: string } {
  const m = c.tickOfDay * 2;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return { day: c.gameDay, hhmm: `${hh}:${mm}` };
}

const isRankShell = (v: string): v is ShellId => /^r[0-6]$/.test(v);
/**
 * Earned rank shells: every rank shell up to the current rank by default. In dev / e2e builds only (build-gated,
 * QUAY_HOOKS) a URL script can list them: `shells=r0,r1`.
 */
export function mockShells(q: URLSearchParams, rank: Rank): ShellId[] {
  const byRank = RANKS.slice(0, RANKS.indexOf(rank) + 1).map((r) => r.toLowerCase() as ShellId);
  const shells = MOCK_HOOKS ? q.get("shells") : null;
  return shells === null ? byRank : shells.split(",").filter(isRankShell);
}

/**
 * Mock `acct:entitlements` (E-64). Empty by default; in dev / e2e builds only, `owned=cos_shell_glass,...` grants
 * SHELL_STYLE items. Goes through the strict parser like the real channel will.
 */
export function mockEntitlements(q: URLSearchParams): AcctEntitlements {
  const owned = MOCK_HOOKS ? (q.get("owned") ?? "").split(",").filter((v) => /^cos_shell_[a-z0-9_]+$/.test(v)) : [];
  const items = [...new Set(owned)].sort().map((itemId) => ({
    itemId, slot: "SHELL_STYLE", source: "purchase", labelPurchased: "Purchased", grantedAt: "2026-10-01T00:00:00Z",
  }));
  return parseEntitlements({ items });
}
