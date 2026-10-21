// Mock provider for the clock / rank / me channels (Spec 1 §2). Replaced by the gateway later.
// Mock server for the clock / rank / me channels (stands in for the gateway). Query params script a character:
// ?rank=R3&lic=LIC2&nw=150000&flags=character.day3,api.eligible&guest=0&prot=1&onb=5&onbDone=0
import type { Channels, ClockChannel, MarketPhase } from "./channels";
import { loadHookStartsFailed } from "./loader";
import { RANKS, type Rank } from "./registry";

export const TICK_MS = 5000;
/** 14's rank thresholds as the server would publish them (17 header): R1 $20k … R5 $2B. */
export const RANK_THRESHOLDS = ["20000", "250000", "5000000", "100000000", "2000000000"] as const;
export const TICKS_PER_DAY = 720;

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

/** The whole mock-channel query surface (?rank=, ?tick=, ?halted=, ?conn=, ?nw=, … see the header) is an e2e/dev hook.
 *  Build-time gate: QUAY_HOOKS is always defined ("1"/"0") in next.config.ts env and inlined, so a production build
 *  without QUAY_HOOKS=1 folds MOCK_QUERY_HOOK to false: mockChannels ignores the query and `readMockQuery` (every
 *  `q.get(...)` below) is dead code that never reaches the bundle. On in `next dev`; the e2e build opts in. */
export const MOCK_QUERY_HOOK: boolean = process.env.NODE_ENV !== "production" || process.env.QUAY_HOOKS === "1";

/** Plain scripted values for the mock character; every field is optional and falls back to the default. */
interface MockScript {
  rank?: string | null; flags?: string | null; tick?: string | null; conn?: string | null; halted?: string | null; held?: string | null;
  nw?: string | null; pct?: string | null; chg?: string | null; lic?: string | null; charters?: string | null; onb?: string | null;
  onbDone?: string | null; places?: string | null; guest?: string | null; prot?: string | null;
}

function readMockQuery(q: URLSearchParams): MockScript {
  return {
    rank: q.get("rank"), flags: q.get("flags"), tick: q.get("tick"), conn: q.get("conn"), halted: q.get("halted"), held: q.get("held"),
    nw: q.get("nw"), pct: q.get("pct"), chg: q.get("chg"), lic: q.get("lic"), charters: q.get("charters"), onb: q.get("onb"),
    onbDone: q.get("onbDone"), places: q.get("places"), guest: q.get("guest"), prot: q.get("prot"),
  };
}

function buildChannels(m: MockScript, phase: MarketPhase | null, loadFailed: boolean): Channels {
  const rankParam = m.rank ?? "R2";
  const rank: Rank = (RANKS as readonly string[]).includes(rankParam) ? (rankParam as Rank) : "R2";
  const list = (v: string | null | undefined) => (v ?? "").split(",").filter(Boolean);
  return {
    clock: { ...clockAt(Number(m.tick ?? 38 * TICKS_PER_DAY + 340)), ...(phase ? { phase } : {}) },
    rank: { rank, thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf(rank)] ?? null },
    system: { connection: m.conn === "reconnecting" ? "reconnecting" : "live", halted: m.halted === "1", held: m.held === "1", load: loadFailed ? "error" : "ok", offline: false },
    me: {
      nw: m.nw ?? "412860.15",
      todayPct: m.pct ?? "+0.78",
      todayChg: m.chg ?? "+3204.10",
      license: m.lic ?? "LIC1",
      charters: list(m.charters),
      flags: list(m.flags),
      onboardingMin: Number(m.onb ?? 60),
      onboardingDone: m.onbDone !== "0",
      myPlaces: list(m.places),
      guest: m.guest === "1",
      protectionEndsRealMs: m.prot === "1" ? 41 * 60_000 + 12_000 : null,
    },
  };
}

export const mockChannels: (q: URLSearchParams) => Channels = MOCK_QUERY_HOOK
  ? (q) => buildChannels(readMockQuery(q), phaseOverride(q), loadHookStartsFailed(q))
  : (q) => buildChannels({}, phaseOverride(q), loadHookStartsFailed(q));

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
