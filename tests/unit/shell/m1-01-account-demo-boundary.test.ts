import { describe, expect, it, afterEach } from "vitest";
import {
  applyGuestDemo,
  applySignedInDemo,
  guestChannels,
  leaksCannedOwnerMock,
  starterChannels,
  DEMO_STARTER_NW,
} from "@/shell/accountDemoBoundary";
import { START_NW } from "@/shell/contracts/fixtures/me";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";
import { vi } from "vitest";

describe("premise: chrome labeling is NOT enough", () => {
  it("observation: guest channels still carry Owner/START_NW (canned educational mock)", () => {
    const g = guestChannels();
    expect(leaksCannedOwnerMock({ nw: g.me.nw, rank: g.rank.rank })).toBe(true);
    expect(g.me.nw).toBe(START_NW);
    expect(g.rank.rank).toBe("R2");
  });

  it("observation: starter channels do not leak canned Owner fixture", () => {
    const s = starterChannels();
    expect(leaksCannedOwnerMock({ nw: s.me.nw, rank: s.rank.rank, hasNwStats: false, positionCount: 0 })).toBe(false);
    expect(s.me.nw).toBe(DEMO_STARTER_NW);
    expect(s.rank.rank).toBe("R0");
  });
});

describe("account demo boundary", () => {
  afterEach(() => {
    setFeed(null);
  });

  it("signed-in demo feed: $10k, empty positions, no nwStats; guest feed restores Owner fixture", async () => {
    vi.useFakeTimers();
    const store = createShellStore(mockChannels(new URLSearchParams()));
    expect(store.getState().channels.me.nw).toBe(START_NW);

    applySignedInDemo(store, "acc_qa_alpha");
    expect(store.getState().channels.me.nw).toBe(DEMO_STARTER_NW);
    expect(store.getState().channels.rank.rank).toBe("R0");
    expect(store.getState().prefs.shell).toBe("r0");

    const feed = getFeed() as MockFeed;
    const bodies: unknown[] = [];
    const off = feed.subscribe("me", (raw) => bodies.push(raw));
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 5);
    const snap = bodies.find((b) => (b as { t?: string }).t === "snap") as { body: { nw: string; positions: Record<string, unknown>; nwStats?: unknown; balances: Record<string, string> } };
    expect(snap.body.nw).toBe(DEMO_STARTER_NW);
    expect(Object.keys(snap.body.positions)).toHaveLength(0);
    expect(snap.body.nwStats).toBeUndefined();
    expect(snap.body.balances.FDL).toMatch(/^10000/);
    expect(leaksCannedOwnerMock({
      nw: snap.body.nw,
      rank: store.getState().channels.rank.rank,
      hasNwStats: !!snap.body.nwStats,
      positionCount: Object.keys(snap.body.positions).length,
    })).toBe(false);
    off();

    applyGuestDemo(store, "");
    expect(store.getState().channels.me.nw).toBe(START_NW);
    expect(store.getState().channels.rank.rank).toBe("R2");
    const guestFeed = getFeed() as MockFeed;
    const gBodies: unknown[] = [];
    const off2 = guestFeed.subscribe("me", (raw) => gBodies.push(raw));
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 5);
    const gSnap = gBodies.find((b) => (b as { t?: string }).t === "snap") as { body: { nw: string; nwStats?: unknown; positions: Record<string, unknown> } };
    expect(gSnap.body.nw).toBe(START_NW);
    expect(gSnap.body.nwStats).toBeTruthy();
    expect(Object.keys(gSnap.body.positions).length).toBeGreaterThan(0);
    off2();
    vi.useRealTimers();
  });

  it("switching accounts reseeds feed (no leak of prior account demo seed state via shared feed)", async () => {
    vi.useFakeTimers();
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_one");
    const feedA = getFeed();
    applySignedInDemo(store, "acc_two");
    const feedB = getFeed();
    expect(feedA).not.toBe(feedB);
    expect(store.getState().channels.me.nw).toBe(DEMO_STARTER_NW);
    vi.useRealTimers();
  });
});
