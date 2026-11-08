// @vitest-environment happy-dom
// The lazy history chart: latest request wins (a late reply for an older version is dropped), a failed refresh keeps the
// last history labelled "not updated" (offline says so), keyboard readout and table equivalent, Retry from an error.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import History from "@/apps/launchpad/History";
import { LP } from "@/launchpad/rules";

const pt = (i: number, side: "buy" | "sell" = "buy") => ({ tick: i, atMs: 1_000 + i, side, tokens: 10 + i, cents: 100 * (i + 1), x: LP.X0 + 100 * (i + 1), sold: 10 * (i + 1) });
const body = (pts: unknown[]) => ({ ticker: "FROG", createdAtMs: 1_000, startX: LP.X0, since: 1_000, dropped: 0, pts });
const reply = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

let root: Root, host: HTMLDivElement;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("Launchpad history chart", () => {
  it("draws the latest reply only: a late reply for the previous version is dropped", async () => {
    let late!: (r: Response) => void;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((r) => { late = r; }))
      .mockImplementationOnce(async () => reply(body([pt(0), pt(1)])));
    vi.stubGlobal("fetch", fetch);
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v1" })));
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v2" })));
    await flush();
    expect(q("lp-history")?.dataset.points).toBe("2");
    late(reply(body([pt(0)])));
    await flush();
    expect(q("lp-history")?.dataset.points).toBe("2");
    expect(fetch.mock.calls[0]![0]).toBe("/api/launchpad/history?ticker=FROG");
  });

  it("keyboard steps through trades; the readout and the table name price after and volume", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(body([pt(0), pt(1, "sell")]))));
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v1" })));
    await flush();
    const plot = q("lp-hist-plot")!;
    expect(plot.tabIndex).toBe(0);
    expect(q("lp-hist-readout")!.textContent).toContain("Trade 2 of 2");
    expect(q("lp-hist-readout")!.textContent).toContain("Sell 11 · Volume $2.00");
    act(() => { plot.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(q("lp-hist-readout")!.textContent).toMatch(/^Launch · .* · Price after \$0\.00001398 · no trade$/);
    act(() => { plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(q("lp-hist-readout")!.textContent).toContain("Trade 1 of 2");
    const rows = host.querySelectorAll('[data-testid="lp-hist-table"] tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[2]!.textContent).toContain("$2.00");
    expect(q("lp-hist-vmax")!.textContent).toBe("$2.00");
  });

  it("a failed refresh keeps the last history dimmed and says so (offline: not live); a first failure offers Retry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(body([pt(0)]))).mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v1" })));
    await flush();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v2" })));
    await flush();
    expect(q("lp-history")?.dataset.stale).toBe("true");
    expect(q("lp-hist-stale")!.textContent).toContain("Offline: not live");
    expect(q("lp-history")?.dataset.points).toBe("1");

    act(() => root.unmount());
    root = createRoot(host);
    const f2 = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(reply(body([])));
    vi.stubGlobal("fetch", f2);
    act(() => root.render(createElement(History, { ticker: "FROG", version: "v1" })));
    await flush();
    expect(q("lp-hist-error")).not.toBeNull();
    act(() => q("lp-hist-retry")!.click());
    await flush();
    expect(q("lp-hist-empty")!.textContent).toContain("No trades yet");
  });
});
