// @vitest-environment happy-dom
// Card 9 carry-over (QA): Broker and Portfolio's Orders tab both mount OpenOrders. Each list's heading id is its own
// (useId), so ids stay unique on the page and each section's aria-labelledby names its own heading; the empty-list
// focus fallback lands on its own heading.
import { act, createElement, Fragment } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import PortfolioApp from "@/apps/portfolio/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { MANUAL_TICK_MS, click, setup, teardown, type Harness } from "./br-harness";

let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

it("Broker + Portfolio Orders open together: unique ids, every aria-labelledby resolves to its own section's heading", async () => {
  const feed = new MockFeed({}, { tickMs: MANUAL_TICK_MS });
  feed.submit({ assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" });
  feed.advance();
  setFeed(feed);
  h.store.setState({ vw: 1440 });
  await act(async () => {
    h.root.render(createElement(ShellCtx.Provider, { value: h.store },
      createElement(Fragment, null, createElement(BrokerApp, { context: "HALC" }), createElement(PortfolioApp))));
  });
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  await click(h.el.querySelector<HTMLElement>('[data-testid="pf-tab-orders"]')!);
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });

  const lists = [...h.el.querySelectorAll<HTMLElement>('[data-testid="br-oo"]')];
  expect(lists).toHaveLength(2);
  const ids = [...h.el.querySelectorAll<HTMLElement>("[id]")].map((n) => n.id);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  for (const list of lists) {
    const heading = list.querySelector<HTMLElement>('[data-testid="br-oo-title"]')!;
    expect(heading.id).not.toBe("");
    expect(list.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(h.el.ownerDocument.getElementById(heading.id)).toBe(heading);
  }
  for (const n of h.el.querySelectorAll<HTMLElement>("[aria-labelledby]")) {
    for (const ref of n.getAttribute("aria-labelledby")!.split(/\s+/)) expect(h.el.ownerDocument.getElementById(ref), ref).not.toBeNull();
  }
});
