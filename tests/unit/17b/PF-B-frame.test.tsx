// @vitest-environment happy-dom
// UI card 3 (17B PF-B): Positions mounted in the Portfolio frame on the real feed hook (desktop tab, phone push, cards
// from text scale 1.5, ticker channel wired, retry resyncs me).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioApp from "@/apps/portfolio/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement, root: Root, store: ShellStore;
beforeEach(() => { vi.useFakeTimers(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); store = createShellStore(defaultChannels()); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.useRealTimers(); });

const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
async function mount(vw: number, feed = new MockFeed({}, { tickMs: 1000 })) {
  setFeed(feed);
  store.setState({ vw });
  await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp))); });
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  return feed;
}
const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const settle = () => act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });

describe("PF-3-01/08 desktop tab", () => {
  it("Positions tab renders the 7-column table A→Z with ticker Last", async () => {
    await mount(1440);
    await click(q("pf-tab-positions")!);
    await settle();
    expect(q("pf-positions")!.dataset.state).toBe("live");
    expect(qa("pos-row").map((r) => r.dataset.asset)).toEqual(["AVB", "HALC", "VOLT"]);
    expect(el.querySelectorAll("thead th")).toHaveLength(7);
    expect(qa("pos-today").every((t) => t.textContent !== "—")).toBe(true); // ticker:wl_default is subscribed
  });
  it("text scale ≥ 1.5 switches the desktop table to cards", async () => {
    await mount(1440);
    await click(q("pf-tab-positions")!);
    await settle();
    expect(q("pos-table")).not.toBeNull();
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, textScale: 1.5 } }); });
    expect(q("pos-table")).toBeNull();
    expect(q("pos-list")).not.toBeNull();
  });
});

describe("PF-3-09 phone push", () => {
  it("pushed screen 'Positions' with 'Back to Portfolio'; cards", async () => {
    await mount(390);
    await click(q("pf-open-positions")!);
    await settle();
    const sub = store.getState().phoneSub!;
    expect([sub.title, sub.backLabel]).toEqual(["Positions", "Back to Portfolio"]);
    expect(q("pf-positions")!.className).toBe("pos pos-cards pos-phone");
    expect(qa("pos-row").map((r) => r.tagName)).toEqual(["LI", "LI", "LI"]);
  });
});

describe("PF-3-06 retry", () => {
  it("error → Retry resyncs me", async () => {
    const feed = new MockFeed({ feed: "error" }, { tickMs: 1000 });
    const spy = vi.spyOn(feed, "resync");
    await mount(1440, feed);
    await click(q("pf-tab-positions")!);
    await settle();
    expect(q("pf-positions")!.dataset.state).toBe("error");
    await click(q("pos-retry")!);
    expect(spy).toHaveBeenCalledWith("me");
  });
});
