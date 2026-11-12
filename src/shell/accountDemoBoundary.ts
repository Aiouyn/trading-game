/**
 * Account ↔ demo-trading boundary (M1-01 + M1-02 shared world).
 * Signed-in players get a neutral starter demo feed/channels — never the canned Owner/$412k fixture.
 * Market seed is the server-owned Port Avalon seed (not per-account).
 * Signed-in quotes follow GET /api/market (one server clock); signed-in Broker orders, cash, lots and working orders
 * are the saved server ledger (M1-06, /api/broker/*). Signed-out: educational guest mock (local, not saved).
 */
import { cashCentsToMoney } from "@/shell/cashFormat";
import { PORT_AVALON_MARKET_SEED } from "@/shell/worldIdentity";
import type { Channels } from "./channels";
import { MockFeed, scenarioFromQuery } from "./contracts/mockFeed";
import { setFeed } from "./contracts/useChannel";
import { defaultChannels, mockChannels, mockShells, RANK_THRESHOLDS } from "./mockChannels";
import { RANKS, type Rank } from "./registry";
import type { ShellStore } from "./store";

/** Neutral starter NW for authenticated accounts — not START_NW Owner fixture. */
export const DEMO_STARTER_NW = "10000.00";

const STARTER_RANK: Rank = "R0";

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

export type SignedInPrivateSnap = {
  readonly cashCents: number;
};

export function applySignedInDemo(
  store: ShellStore,
  accountId: string,
  marketSeed: number = PORT_AVALON_MARKET_SEED,
  privateSnap?: SignedInPrivateSnap,
): void {
  // accountId: identity remount key, and the account whose server ledgers feed the offline `me` snapshot (M2-05).
  // The market seed is world-owned (M1-02).
  const cashCents = privateSnap?.cashCents ?? 1_000_000;
  const nw = cashCentsToMoney(cashCents);
  // Quotes come from the server clock and `me` from the saved server ledger (M1-06): orders go to the server door,
  // which prices, fills and saves them. No NW pin: cash and lots are the server's, marked at server quotes.
  setFeed(new MockFeed({ empty: true, seed: marketSeed }, { authoritativeQuotes: true, snapshotAccount: accountId }));
  const channels = starterChannels();
  channels.me.nw = nw;
  // Saved cash seeds the boot NW only until `me` (server ledger at server marks) is live.
  store.getState().setChannels({
    ...channels,
    me: { ...channels.me, nw },
  });
  store.getState().setPrefs({ shell: "r0" });
  store.getState().setLiveNw(nw);
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
