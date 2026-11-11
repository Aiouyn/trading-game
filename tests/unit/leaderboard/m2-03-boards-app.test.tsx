// @vitest-environment happy-dom
// M2-03 Boards app: signed out = sign-in prompt (no demo rows); loading / error + Retry / live; a failed refresh keeps
// the last board and says so; the caller's row is marked and findable (also when outside the top); a read started for
// a previous account never shows on the next account's board.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BoardsApp, { BOARD_POLL_MS } from "@/apps/boards/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { LeaderboardView } from "@/market/leaderboard";
import { authSession } from "@/shell/authSession";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const meBody = (id: string, handle: string) => ({
  account: { accountId: id, handle, createdAtMs: 1, worldId: "world_port_avalon" },
  session: { sessionId: `ses_${id}`, expiresAtMs: 9e15 },
  player: { accountId: id, cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "world_port_avalon", marketSeed: 17 },
});
const view = (tick: number, rows: [number, string, string, boolean][], self: [number, string, string] | null = null, players = rows.length): LeaderboardView => {
  const rs = rows.map(([rank, handle, nw, s]) => ({ rank, handle, nw, self: s }));
  return { worldId: "world_port_avalon" as LeaderboardView["worldId"], tick, players, rows: rs, self: self ? { rank: self[0], handle: self[1], nw: self[2], self: true } : rs.find((r) => r.self) ?? null };
};

describe("M2-03 Boards app", () => {
  let el: HTMLDivElement;
  let root: Root;
  let me: ReturnType<typeof meBody> | null;
  let replies: Array<(r: Response) => void>;
  let mode: "queue" | "auto";
  let auto: () => Response;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    me = null; replies = []; mode = "auto"; auto = () => new Response("{}", { status: 500 });
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/auth/me") return me ? Response.json(me) : new Response(null, { status: 401 });
      if (input === "/api/leaderboard") return mode === "auto" ? auto() : new Promise<Response>((r) => replies.push(r));
      return new Response(null, { status: 404 });
    }));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const state = () => q("leaderboard")?.dataset.state;
  const rows = () => [...el.querySelectorAll<HTMLElement>('[data-testid="lb-row"]')].map((r) => `${r.dataset.rank} ${r.dataset.handle}${r.dataset.self ? " *" : ""}`);
  async function mount() {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(BoardsApp))); });
    await flush();
  }
  async function flush(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); await Promise.resolve(); }); }

  it("signed out: a sign-in prompt, no rows and no figures (not the guest fixture board)", async () => {
    await mount();
    expect(state()).toBe("signed-out");
    expect(q("lb-signed-out")?.textContent).toMatch(/Sign in/);
    expect(rows()).toEqual([]);
    expect(el.textContent).not.toMatch(/\$\d|Owner|412/);
    expect((globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.some(([u]) => u === "/api/leaderboard")).toBe(false);
  });

  it("first read fails: error + Retry; Retry shows the live board with my row marked, my rank and the valuation tick", async () => {
    me = meBody("acc_a", "PlayerA");
    await mount();
    expect(state()).toBe("error");
    expect(q("lb-error")?.textContent).toMatch(/Couldn't load the board/);
    expect(el.textContent).not.toMatch(/\$\d/);
    auto = () => Response.json(view(27702, [[1, "PlayerB", "10000.00", false], [2, "PlayerA", "9999.25", true]]));
    await act(async () => { q("lb-retry")!.click(); });
    await flush();
    expect(state()).toBe("live");
    expect(rows()).toEqual(["1 PlayerB", "2 PlayerA *"]);
    expect(q("lb-your-rank")?.textContent).toMatch(/Your rank: 2 of 2/);
    expect(q("lb-valued-at")?.textContent).toBe("Valued at Day 39 · 11:24 · server tick 27702 · 2 players");
    expect(el.querySelector('[data-self="true"] [data-testid="lb-you"]')?.textContent).toBe("You");
    await act(async () => { q("lb-find-me")!.click(); });
    expect(document.activeElement?.getAttribute("data-handle")).toBe("PlayerA");
  });

  it("a failed refresh keeps the last board and says so; the next good read replaces it", async () => {
    me = meBody("acc_a", "PlayerA");
    auto = () => Response.json(view(10, [[1, "PlayerA", "10000.00", true]]));
    await mount();
    expect(rows()).toEqual(["1 PlayerA *"]);
    auto = () => new Response("{}", { status: 500 });
    await flush(BOARD_POLL_MS);
    expect(state()).toBe("live");
    expect(rows()).toEqual(["1 PlayerA *"]);
    expect(q("lb-refresh-failed")?.textContent).toMatch(/Couldn't update/);
    auto = () => Response.json(view(11, [[1, "PlayerB", "10001.00", false], [2, "PlayerA", "10000.00", true]]));
    await flush(BOARD_POLL_MS);
    expect(q("lb-refresh-failed")).toBeNull();
    expect(rows()).toEqual(["1 PlayerB", "2 PlayerA *"]);
  });

  it("an off-shape reply (extra private field) is not shown", async () => {
    me = meBody("acc_a", "PlayerA");
    auto = () => Response.json({ ...view(10, [[1, "PlayerA", "10000.00", true]]), rows: [{ rank: 1, handle: "PlayerA", nw: "10000.00", self: true, cashCents: 1 }] });
    await mount();
    expect(state()).toBe("error");
  });

  it("my row outside the top rows is pinned after the list", async () => {
    me = meBody("acc_z", "Zed");
    auto = () => Response.json(view(10, [[1, "Ann", "12000.00", false], [2, "Ben", "11000.00", false]], [7, "Zed", "9000.00"], 7));
    await mount();
    expect(rows()).toEqual(["1 Ann", "2 Ben", "7 Zed *"]);
    expect(q("lb-your-rank")?.textContent).toMatch(/Your rank: 7 of 7/);
  });

  it("an older read that answers after a newer one is dropped (the board never goes back in time)", async () => {
    me = meBody("acc_a", "PlayerA");
    mode = "queue";
    await mount();
    await flush(BOARD_POLL_MS); // the poll starts read 2 while read 1 is still out
    expect(replies).toHaveLength(2);
    await act(async () => { replies[1]!(Response.json(view(11, [[1, "PlayerA", "10050.00", true]]))); });
    await flush();
    expect(q("leaderboard")?.dataset.tick).toBe("11");
    await act(async () => { replies[0]!(Response.json(view(10, [[1, "PlayerA", "9000.00", true]]))); });
    await flush();
    expect(q("leaderboard")?.dataset.tick).toBe("11");
    expect(el.textContent).not.toContain("9,000.00");
  });

  it("account switch: A's read still in flight never shows on B's board", async () => {
    me = meBody("acc_a", "PlayerA");
    mode = "queue";
    await mount();
    expect(state()).toBe("loading");
    expect(replies).toHaveLength(1); // A's read, held
    me = meBody("acc_b", "PlayerB");
    await act(async () => { await authSession.refresh(); });
    await flush();
    expect(state()).toBe("loading");
    expect(replies).toHaveLength(2); // B's own read
    await act(async () => { replies[0]!(Response.json(view(5, [[1, "PlayerA", "12000.00", true], [2, "PlayerB", "10000.00", false]]))); });
    await flush();
    expect(state()).toBe("loading"); // A's board was dropped
    expect(el.textContent).not.toContain("PlayerA");
    await act(async () => { replies[1]!(Response.json(view(5, [[1, "PlayerA", "12000.00", false], [2, "PlayerB", "10000.00", true]]))); });
    await flush();
    expect(rows()).toEqual(["1 PlayerA", "2 PlayerB *"]);
    expect(q("lb-your-rank")?.textContent).toMatch(/Your rank: 2 of 2/);
  });
});
