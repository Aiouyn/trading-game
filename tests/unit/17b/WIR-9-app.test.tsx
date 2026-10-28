// @vitest-environment happy-dom
// UI card 9 WIR-9 on the Wire app with the shell store and a hand-driven transport (setFeed): WIR-9-04 Open in Broker
// is one open("broker", id) and no trade intent, the filings channel is subscribed only while a FILING detail is open,
// WIR-9-06 the filing summary EN/FR, WIR-9-08 an item leaving the ring, WIR-9-09 filings states + Retry channel,
// and the phone push through the store (phoneBack closes).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WireApp from "@/apps/wire/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { ChannelName, FilingsBody, NewsBody } from "@/shell/contracts/channels";
import { FILINGS, NEWS } from "@/shell/contracts/fixtures/news";
import { setFeed, type FeedTransport } from "@/shell/contracts/useChannel";
import { intentLog } from "@/shell/intentLog";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NNBSP = "\u202F";

/** Frames go out only when the test says so; every subscribe and resync is recorded. */
class HandFeed implements FeedTransport {
  readonly tickMs = 3_600_000;
  readonly subs = new Map<ChannelName, Set<(raw: unknown) => void>>();
  readonly subscribed: ChannelName[] = [];
  readonly resyncs: ChannelName[] = [];
  private seq = 0;
  subscribe(ch: ChannelName, fn: (raw: unknown) => void) {
    this.subscribed.push(ch);
    const s = this.subs.get(ch) ?? new Set();
    s.add(fn);
    this.subs.set(ch, s);
    return () => { s.delete(fn); };
  }
  resync(ch: ChannelName) { this.resyncs.push(ch); }
  live(ch: ChannelName) { return (this.subs.get(ch)?.size ?? 0) > 0; }
  async snap(ch: "news", body: NewsBody): Promise<void>;
  async snap(ch: "filings", body: FilingsBody): Promise<void>;
  async snap(ch: ChannelName, body: unknown) {
    await act(async () => { for (const fn of this.subs.get(ch) ?? []) fn({ t: "snap", ch, seq: ++this.seq, tick: 27_700, body }); });
  }
  async err(ch: ChannelName, code = "INTERNAL") {
    await act(async () => { for (const fn of this.subs.get(ch) ?? []) fn({ t: "err", ch, code }); });
  }
}

let el: HTMLDivElement, root: Root, store: ShellStore, feed: HandFeed;
beforeEach(() => {
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  store = createShellStore(defaultChannels());
  feed = new HandFeed();
  setFeed(feed);
});
afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.restoreAllMocks(); });

async function mount(vw = 1440, locale: "en" | "fr" = "en") {
  store.setState({ vw, prefs: { ...store.getState().prefs, locale } });
  await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(WireApp))); });
  await feed.snap("news", { items: [...NEWS] });
}
const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const openRow = (id: string) => act(async () => { el.querySelector<HTMLElement>(`[data-testid=wire-row][data-id="${id}"] [data-testid=wire-open]`)!.click(); });
const click = (n: HTMLElement) => act(async () => { n.click(); });

describe("WIR-9-04 Open in Broker", () => {
  it("n-1: open('broker', 'HALC') exactly once; no trade intent", async () => {
    await mount();
    const open = vi.spyOn(store.getState(), "open");
    const before = intentLog().length;
    await openRow("n-1");
    await click(q("wire-open-broker")!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("broker", "HALC");
    expect(intentLog()).toHaveLength(before);
  });
  it("the real store opens Broker on the asset context", async () => {
    await mount();
    await openRow("n-1");
    await click(q("wire-open-broker")!);
    const w = store.getState().local.windows.find((x) => x.app === "broker");
    expect(w?.context).toBe("HALC");
  });
});

describe("filings channel lifetime", () => {
  it("not subscribed until a FILING detail opens; released once a non-FILING item is opened", async () => {
    vi.useFakeTimers();
    try {
      await mount();
      expect(feed.subscribed).toEqual(["news"]);
      await openRow("n-1");
      expect(feed.subscribed).toEqual(["news"]);
      await openRow("n-3");
      expect(feed.subscribed).toEqual(["news", "filings"]);
      expect(feed.live("filings")).toBe(true);
      await openRow("n-2");
      await act(async () => { vi.advanceTimersByTime(1000); }); // the shared channel close grace
      expect(feed.live("filings")).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

describe("WIR-9-06 filing summary", () => {
  it("EN: type, Northwind Capital, Avalon Bank, Stake 5.20 %, Quantity 410,000, time", async () => {
    await mount();
    await openRow("n-3");
    expect(q("wire-filing")!.dataset.state).toBe("loading");
    expect(qa("wire-filing-skel")).toHaveLength(1);
    await feed.snap("filings", { items: [...FILINGS] });
    expect(q("wire-filing-type")!.textContent).toBe("Major stake");
    expect(q("wire-filing-filer")!.textContent).toBe("Filed byNorthwind Capital");
    expect(q("wire-filing-subject")!.textContent).toBe("CompanyAvalon Bank");
    const fields = qa("wire-filing-field").map((f) => [f.querySelector("dt")!.textContent, f.querySelector("dd")!.textContent]);
    expect(fields).toEqual([["Stake", `5.20${NNBSP}%`], ["Quantity", "410,000"]]);
    expect(q("wire-filing-time")!.textContent).toMatch(/^Day \d+ · \d\d:\d\d$/);
    expect(qa("wire-filing-skel")).toHaveLength(0);
  });
  it("FR: 5,20 % with NNBSP, qty grouped with the FR separator, French labels", async () => {
    await mount(1440, "fr");
    await openRow("n-3");
    await feed.snap("filings", { items: [...FILINGS] });
    expect(q("wire-filing-type")!.textContent).toBe("Participation importante");
    const fields = qa("wire-filing-field").map((f) => [f.querySelector("dt")!.textContent, f.querySelector("dd")!.textContent]);
    expect(fields[0]).toEqual(["Participation", `5,20${NNBSP}%`]);
    expect(fields[1]![0]).toBe("Quantité");
    expect(fields[1]![1]).toBe(`410${NNBSP}000`);
  });
  it("side → ↑ Buy / ↓ Sell, price via decText, an unknown key raw, an unknown side raw", async () => {
    await mount();
    const n3 = NEWS.find((n) => n.id === "n-3")!;
    await feed.snap("news", { items: [{ ...n3, filingId: "f-2" }] });
    await openRow("n-3");
    const f2 = FILINGS.find((f) => f.id === "f-2")!;
    await feed.snap("filings", { items: [{ ...f2, fields: { side: "BUY", qty: "12000", price: "1041.10", venue: "Quay 3" } }] });
    const rows = () => qa("wire-filing-field").map((f) => [f.querySelector("dt")!.textContent, f.querySelector("dd")!.textContent]);
    expect(q("wire-filing-type")!.textContent).toBe("Insider trade");
    expect(rows()).toEqual([["Side", "↑ Buy"], ["Quantity", "12,000"], ["Price", "1,041.10"], ["venue", "Quay 3"]]);
    await feed.snap("filings", { items: [{ ...f2, fields: { side: "SELL" } }] });
    expect(rows()).toEqual([["Side", "↓ Sell"]]);
    await feed.snap("filings", { items: [{ ...f2, fields: { side: "HOLD" } }] });
    expect(rows()).toEqual([["Side", "HOLD"]]);
  });
  it("filing id missing from the body → filingMissing", async () => {
    await mount();
    await openRow("n-3");
    await feed.snap("filings", { items: FILINGS.filter((f) => f.id !== "f-1") });
    expect(q("wire-filing-missing")!.textContent).toBe("Filing details aren't available.");
    expect(qa("wire-filing-field")).toHaveLength(0);
  });
});

describe("WIR-9-09 filings states", () => {
  it("error → Couldn't load + Retry, which resyncs 'filings' (not 'news'); denied reads the same", async () => {
    await mount();
    await openRow("n-3");
    await feed.err("filings");
    expect(q("wire-filing-error")!.textContent).toContain("Couldn't load");
    await click(q("wire-filing-retry")!);
    expect(feed.resyncs).toEqual(["filings"]);
    await feed.snap("filings", { items: [...FILINGS] });
    expect(q("wire-filing-error")).toBeNull();
    expect(q("wire-filing-type")).not.toBeNull();
    await feed.err("filings", "CHANNEL_DENIED");
    expect(q("wire-filing")!.dataset.state).toBe("denied");
    expect(q("wire-filing-retry")).not.toBeNull();
  });
});

describe("WIR-9-08 the ring", () => {
  it("n-1 rotated out while open: content kept + notInFeed; the row is gone", async () => {
    await mount();
    await openRow("n-1");
    const hl = q("wire-detail-headline")!.textContent;
    expect(q("wire-not-in-feed")).toBeNull();
    await feed.snap("news", { items: NEWS.filter((n) => n.id !== "n-1") });
    expect(el.querySelector("[data-testid=wire-row][data-id=n-1]")).toBeNull();
    expect(q("wire-detail")!.dataset.id).toBe("n-1");
    expect(q("wire-detail-headline")!.textContent).toBe(hl);
    expect(q("wire-asset")!.textContent).toContain("HALC");
    expect(q("wire-not-in-feed")!.textContent).toBe("This story is no longer in your feed.");
  });
});

describe("phone push through the store", () => {
  it("open sets phoneSub {kind, Back to Wire}; phoneBack() closes; leaving clears it", async () => {
    await mount(390);
    expect(store.getState().phoneSub).toBeNull();
    await openRow("n-2");
    expect(store.getState().phoneSub).toMatchObject({ title: "Rumor", backLabel: "Back to Wire" });
    await act(async () => store.getState().phoneBack());
    expect(q("wire-detail")).toBeNull();
    expect(store.getState().phoneSub).toBeNull();
    await openRow("n-2");
    await act(async () => root.unmount());
    root = createRoot(el);
    expect(store.getState().phoneSub).toBeNull();
  });
});
