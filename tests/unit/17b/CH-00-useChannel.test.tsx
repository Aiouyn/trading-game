// @vitest-environment happy-dom
// 17B CH-00: the React hook over the channel store (shared per channel, loading → live, re-renders per tick).
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed, useChannel } from "@/shell/contracts/useChannel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { setFeed(null); vi.useRealTimers(); });

it("useChannel('ticker:wl_default') yields loading → live and follows ticks", async () => {
  const feed = new MockFeed({}, { tickMs: 1000 });
  setFeed(feed);
  const seen: string[] = [];
  function Probe() {
    const v = useChannel("ticker:wl_default");
    seen.push(v.state);
    return createElement("p", { "data-state": v.state }, v.state === "live" ? v.body.rows.HALC!.last : "");
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => { root.render(createElement("div", null, createElement(Probe), createElement(Probe))); });
  expect(el.querySelectorAll("[data-state=loading]")).toHaveLength(2);
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  expect(el.querySelectorAll("[data-state=live]")).toHaveLength(2);
  await act(async () => { vi.advanceTimersByTime(3000); });
  const last = (feed.body("ticker:wl_default") as { rows: Record<string, { last: string }> }).rows.HALC!.last;
  expect(el.querySelector("p")!.textContent).toBe(last);
  expect(seen[0]).toBe("loading");
  await act(async () => { root.unmount(); });
});
