/**
 * Account ↔ demo-trading boundary (M1-01).
 * Signed-in players get a neutral starter demo feed/channels — never the canned Owner/$412k fixture.
 * Signed-out players get the educational canned mock (distinct example character).
 */
import type { Channels } from "./channels";
import { MockFeed, scenarioFromQuery } from "./contracts/mockFeed";
import { setFeed } from "./contracts/useChannel";
import { defaultChannels, mockChannels, mockShells, RANK_THRESHOLDS } from "./mockChannels";
import { RANKS, type Rank } from "./registry";
import type { ShellStore } from "./store";

/** Neutral starter NW for authenticated accounts — not START_NW Owner fixture. */
export const DEMO_STARTER_NW = "10000.00";

const STARTER_RANK: Rank = "R0";

function seedFromAccountId(accountId: string): number {
  let h = 17;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  return (h % 1_000_000) + 1;
}

/** Shell channel snapshot for a fresh authenticated account (not the Owner fixture). */
export function starterChannels(): Channels {
  const base = defaultChannels();
  return {
    ...base,
    rank: {
      rank: STARTER_RANK,
      thresholds: [...RANK_THRESHOLDS],
      nextAt: RANK_THRESHOLDS[RANKS.indexOf(STARTER_RANK)] ?? null,
      shellsEarned: mockShells(new URLSearchParams(), STARTER_RANK),
    },
    me: {
      ...base.me,
      nw: DEMO_STARTER_NW,
      todayPct: "0.00",
      todayChg: "0.00",
      license: "LIC0",
      guest: false,
    },
  };
}

/** Canned educational mock (R2 Owner / $412k) — only for signed-out browsing. */
export function guestChannels(query = ""): Channels {
  return mockChannels(new URLSearchParams(query));
}

export function applySignedInDemo(store: ShellStore, accountId: string): void {
  setFeed(new MockFeed({ empty: true, nw: DEMO_STARTER_NW, seed: seedFromAccountId(accountId) }));
  store.getState().setChannels(starterChannels());
  store.getState().setPrefs({ shell: "r0" });
  store.getState().setLiveNw(DEMO_STARTER_NW);
}

export function applyGuestDemo(store: ShellStore, query = ""): void {
  const q = new URLSearchParams(query);
  setFeed(new MockFeed(scenarioFromQuery(q)));
  const channels = guestChannels(query);
  store.getState().setChannels(channels);
  store.getState().setLiveNw(channels.me.nw);
}

/** Detect canned Owner fixture still present in channel/feed views (regression observation). */
export function leaksCannedOwnerMock(input: {
  nw?: string | null;
  rank?: string | null;
  hasNwStats?: boolean;
  positionCount?: number;
}): boolean {
  const nw = input.nw ?? "";
  if (nw.includes("412860") || nw.includes("412,860")) return true;
  if (input.rank === "R2") return true;
  if (input.hasNwStats) return true;
  if ((input.positionCount ?? 0) > 0 && nw.startsWith("412")) return true;
  return false;
}
