// @vitest-environment happy-dom
// UI card 10 (BRK-D) on the Broker app, real mock feed, fake clock: BR-10-01 name line and select options, BR-10-02
// Trade | About swap (draft kept, focus), BR-10-03 Overview rows verbatim, BR-10-04 the shared Quote, BR-10-05 halt,
// BR-10-06 position, BR-10-07 News filter and order, the News states and Retry, the row's open("wire", id), the phone push.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assetStories } from "@/apps/broker/AssetNews";
import { AssetOverview } from "@/apps/broker/AssetOverview";
import { BR_STRINGS } from "@/apps/broker/strings";
import { EN as WIRE_EN, headline } from "@/apps/wire/strings";
import { decText } from "@/apps/portfolio/positions/format";
import { compactMoneyText } from "@/components/ui/money";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { MeTradingBody, NewsBody, TickerBody, TradingState, WireItem } from "@/shell/contracts/channels";
import { ASSETS } from "@/shell/contracts/fixtures/assets";
import { NEWS, NEWS_EVERY } from "@/shell/contracts/fixtures/news";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { intentLog } from "@/shell/intentLog";
import { click, key, mount, q, setup, teardown, text, tick, typeInto, wait, type Harness } from "./br-harness";

const EN = BR_STRINGS.en;
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

const tickerBody = (feed: MockFeed) => feed.body("ticker:wl_default") as TickerBody;
const meBody = (feed: MockFeed) => feed.body("me") as MeTradingBody;
const all = (sel: string) => [...h.el.querySelectorAll<HTMLElement>(sel)];
const viewBtn = (v: "trade" | "about") => q(h, `br-view-${v}`)!;
const toAbout = () => click(viewBtn("about"));
const toNews = async () => { await click(q(h, "br-about-tabs-news")!); await wait(SNAP_DELAY_MS); };
const rows = () => Object.fromEntries(all('[data-testid="ap-row"]').map((r) => [r.dataset.key!, r.querySelector("dd")!.textContent]));

describe("BR-10-01 header name line and select options", () => {
  it("context HALC: the muted company name sits under the ticker heading", async () => {
    await mount(h, { context: "HALC" });
    expect(text(h, "br-ticker")).toBe("HALC");
    expect(text(h, "br-name")).toBe("Halcyon Shipping");
    expect(q(h, "br-name")!.previousElementSibling!.contains(q(h, "br-ticker"))).toBe(true);
  });
  it("no context: every option reads TICKER · Name, value the ticker", async () => {
    const feed = await mount(h);
    const opts = [...q(h, "br-asset-select")!.querySelectorAll("option")];
    const keys = Object.keys(tickerBody(feed).rows).sort();
    expect(opts.map((o) => o.value)).toEqual(keys);
    expect(opts.map((o) => o.textContent)).toEqual(keys.map((k) => `${k} · ${ASSETS.find((a) => a.assetId === k)!.name}`));
    expect(q(h, "br-name")).toBeNull();
  });
});

describe("BR-10-02 Trade | About", () => {
  it("defaults to Trade; About shows Overview and focuses the About heading; Trade brings the draft back", async () => {
    await mount(h, { context: "HALC" });
    expect(q(h, "broker")!.dataset.view).toBe("trade");
    expect(viewBtn("trade").getAttribute("aria-selected")).toBe("true");
    await typeInto(q(h, "br-qty")!, "40");
    await click(q(h, "br-side-sell")!);
    await toAbout();
    expect(q(h, "broker")!.dataset.view).toBe("about");
    expect(q(h, "br-qty")).toBeNull();
    expect(q(h, "br-about-panel")!.dataset.tab).toBe("overview");
    expect(document.activeElement).toBe(q(h, "br-about-title"));
    const section = q(h, "br-about")!;
    expect(section.tagName).toBe("SECTION");
    expect(document.getElementById(section.getAttribute("aria-labelledby")!)).toBe(q(h, "br-about-title"));
    await click(viewBtn("trade"));
    expect((q(h, "br-qty") as HTMLInputElement).value).toBe("40");
    expect(q(h, "br-side-sell")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(q(h, "br-ticker"));
  });
  it("no-context window: back to Trade focuses the asset select", async () => {
    await mount(h);
    await toAbout();
    await click(viewBtn("trade"));
    expect(document.activeElement).toBe(q(h, "br-asset-select"));
  });
  it("tabs: each controls an existing panel id; arrows move focus, Enter (a click) selects", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    const tabs = all('[data-testid="br-about-tabs"] [role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual([EN.tabOverview, EN.tabNews]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1]);
    expect(tabs[1]!.hasAttribute("aria-controls")).toBe(false);
    expect(document.getElementById(tabs[0]!.getAttribute("aria-controls")!)).toBe(q(h, "br-about-panel"));
    await act(async () => tabs[0]!.focus());
    await key(tabs[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expect(q(h, "br-about-panel")!.dataset.tab).toBe("overview");
    await click(tabs[1]!);
    expect(q(h, "br-about-panel")!.dataset.tab).toBe("news");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById(tabs[1]!.getAttribute("aria-controls")!)).toBe(q(h, "br-about-panel"));
    expect(tabs[0]!.hasAttribute("aria-controls")).toBe(false);
    await key(tabs[1]!, "Home");
    expect(document.activeElement).toBe(tabs[0]);
    await key(tabs[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
  });
  it("b / s / Enter shortcuts belong to Trade only", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    await key(q(h, "br-about")!, "s");
    await click(viewBtn("trade"));
    expect(q(h, "br-side-buy")!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("BR-10-03 Overview rows", () => {
  it("HALC: fixture values verbatim, in spec order; no statistics row", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    const r = rows();
    expect(Object.keys(r)).toEqual(["name", "ticker", "type", "sector", "region", "ccy", "licence", "quote", "trading", "position"]);
    expect([r.name, r.ticker, r.type, r.sector, r.region, r.ccy, r.licence]).toEqual(["Halcyon Shipping", "HALC", "Stock", "Industrials", "Atlantic", "FDL", "LIC1"]);
    expect(all('[data-testid="ap-row"] dt').map((d) => d.textContent)).toEqual(Object.values(EN.f));
    expect(q(h, "br-about")!.textContent).not.toMatch(/VWAP|Volume|ADV|[Ss]hort interest|asOfDay|High|Low/);
  });
  it("GX is an index; an unknown class falls back to the raw value", async () => {
    await mount(h, { context: "GX" });
    await toAbout();
    expect(rows().type).toBe("Index");
  });
  it("unknown asset: unknownAsset, no rows", async () => {
    await mount(h, { context: "NOPE" });
    await toAbout();
    expect(text(h, "ap-unknown")).toBe(EN.unknownAsset);
    expect(all('[data-testid="ap-row"]')).toHaveLength(0);
  });
});

describe("BR-10-04 Overview quote = header quote", () => {
  it("last and today change are the header's text at the same tick, and both follow the next tick", async () => {
    const feed = await mount(h, { context: "HALC" });
    await toAbout();
    for (let i = 0; i < 3; i++) {
      expect(text(h, "ap-last")).toBe(text(h, "br-last"));
      expect(text(h, "ap-today")).toBe(text(h, "br-today"));
      expect(text(h, "ap-last")).toBe(decText(tickerBody(feed).rows.HALC!.last, "en"));
      await tick(feed);
    }
  });
});

describe("BR-10-05 trading state", () => {
  it("?halt=HALC: Halted state label and the steel Halted chip", async () => {
    await mount(h, { context: "HALC", scenario: { halt: "HALC" } });
    await toAbout();
    expect(text(h, "ap-state")).toBe(EN.st.HALTED);
    expect(text(h, "ap-halted")).toBe(EN.halted);
  });
  it("continuous: Open, no chip", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    expect(text(h, "ap-state")).toBe("Open");
    expect(q(h, "ap-halted")).toBeNull();
  });
  it("every TradingState has a distinct EN and FR label", () => {
    const states: TradingState[] = ["CLOSED", "PRE_OPEN", "OPENING_AUCTION", "CONTINUOUS", "CLOSING_AUCTION", "AFTER_HOURS", "HALTED", "VOL_INTERRUPTION", "LIMIT_LOCKED", "SUSPENDED"];
    for (const L of [BR_STRINGS.en, BR_STRINGS.fr]) {
      expect(Object.keys(L.st).sort()).toEqual([...states].sort());
      expect(new Set(states.map((s) => L.st[s])).size).toBe(states.length);
    }
    expect(BR_STRINGS.fr.st.HALTED).toBe("Suspendu temporairement");
  });
});

describe("BR-10-06 your position", () => {
  it("with a position: qty and value verbatim (decText, compact money)", async () => {
    const feed = await mount(h, { context: "HALC" });
    await toAbout();
    const p = meBody(feed).positions.HALC;
    expect(p).toBeDefined();
    expect(text(h, "ap-position")).toBe(EN.positionLine(decText(p!.qty, "en"), compactMoneyText(p!.value)));
  });
  it("without one: noPosition", async () => {
    const feed = await mount(h, { context: "GX" });
    expect(meBody(feed).positions.GX).toBeUndefined();
    await toAbout();
    expect(text(h, "ap-no-position")).toBe(EN.noPosition);
    expect(q(h, "ap-position")).toBeNull();
  });
  it("a negative value keeps U+2212 and truncates toward zero", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const row = { last: "42.18", chg: "0", chgPct: "0", state: "CONTINUOUS" } as unknown as TickerBody["rows"][string];
    const position = { assetId: "HALC", qty: "-1200", value: "-12345.67" } as unknown as MeTradingBody["positions"][string];
    await act(async () => root.render(createElement(AssetOverview, { t: EN, locale: "en", assetId: "HALC", row, position })));
    const got = el.querySelector('[data-testid="ap-position"]')!.textContent!;
    expect(got).toBe(EN.positionLine(decText("-1200", "en"), compactMoneyText("-12345.67")));
    expect(got).toContain("\u2212");
    expect(got).toContain(compactMoneyText("-12345.67"));
    await act(async () => root.unmount());
    el.remove();
  });
});

describe("BR-10-07 News filter and order", () => {
  const item = (id: string, tick: number, ids: string[], kind: "asset" | "company" = "asset"): WireItem =>
    ({ ...NEWS[0]!, id, tick, entities: ids.map((e) => ({ id: e, kind, label: e })) }) as WireItem;
  it("asset entities only, tick desc then id asc", () => {
    expect(assetStories(NEWS, "HALC").map((i) => i.id)).toEqual(["n-1"]);
    const its = [item("b", 5, ["VOLT"]), item("a", 5, ["VOLT", "HALC"]), item("c", 9, ["VOLT"]), item("d", 9, ["VOLT"], "company"), item("e", 1, ["HALC"])];
    expect(assetStories(its, "VOLT").map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
  it("HALC lists n-1 only; rows are KindChip + headline + time, one button each", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    await toNews();
    const btns = all('[data-testid="ap-story"]');
    expect(btns.map((b) => b.dataset.id)).toEqual(["n-1"]);
    const hl = headline(NEWS[0]!, WIRE_EN);
    expect(btns[0]!.tagName).toBe("BUTTON");
    expect(btns[0]!.hasAttribute("aria-label")).toBe(false);
    const named = [...btns[0]!.childNodes].filter((n) => !(n instanceof Element && n.getAttribute("aria-hidden") === "true"));
    expect(named.map((n) => n.textContent).join("")).toBe(EN.openStoryAria(hl)); // the accessible name, from content
    expect(btns[0]!.querySelector('[data-testid="ap-story-hl"]')!.textContent).toBe(hl);
    expect(btns[0]!.querySelector(".chip")).not.toBeNull();
    expect(btns[0]!.querySelector("time")).not.toBeNull();
  });
  it("VOLT: rotation items appear as they publish, newest first", async () => {
    const feed = await mount(h, { context: "VOLT" });
    await toAbout();
    await toNews();
    expect(text(h, "ap-news-empty")).toBe(EN.noNews("VOLT") + EN.newsHelp);
    const ids = () => all('[data-testid="ap-story"]').map((b) => b.dataset.id);
    const volt = () => assetStories((feed.body("news") as NewsBody).items, "VOLT").map((i) => i.id);
    let seen = 0;
    for (let i = 0; i < NEWS_EVERY * 7 && seen < 2; i++) {
      await tick(feed);
      expect(ids()).toEqual(volt());
      seen = volt().length;
    }
    expect(seen).toBe(2);
    const [a, b] = assetStories((feed.body("news") as NewsBody).items, "VOLT");
    expect(a!.tick).toBeGreaterThan(b!.tick);
  });
});

describe("News row opens Wire (BR-10-08 unit half)", () => {
  it("one open('wire', id): the Wire window opens on that story; no intent", async () => {
    await mount(h, { context: "HALC" });
    await toAbout();
    await toNews();
    const before = intentLog().length;
    await click(q(h, "ap-story")!);
    const wires = h.store.getState().local.windows.filter((w) => w.app === "wire");
    expect(wires.map((w) => w.context)).toEqual(["n-1"]);
    expect(intentLog()).toHaveLength(before);
  });
});

describe("News states (BR-10-09 unit half)", () => {
  it("?news=error: alert + Retry; Retry resyncs news and the list comes back", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { news: "error" } });
    await toAbout();
    expect(q(h, "ap-overview")).not.toBeNull(); // Overview does not depend on news
    await toNews();
    expect(q(h, "ap-news-error")!.querySelector('[role="alert"]')!.textContent).toBe(EN.couldntLoad);
    await click(q(h, "ap-news-retry")!);
    await wait(1000);
    expect(all('[data-testid="ap-story"]').map((b) => b.dataset.id)).toEqual(["n-1"]);
    expect(feed).toBeDefined();
  });
  it("?news=loading: busy skeleton with its name, no rows", async () => {
    await mount(h, { context: "HALC", scenario: { news: "loading" } });
    await toAbout();
    await toNews();
    expect(q(h, "ap-news-loading")!.getAttribute("aria-busy")).toBe("true");
    expect(q(h, "ap-news-loading")!.getAttribute("aria-label")).toBe(EN.newsLoading);
  });
  it("?feed=stale: Updating… in the header and in the News tab (each on its own channel's clock)", async () => {
    const feed = new MockFeed({ feed: "stale" }, { tickMs: 1000 });
    await mount(h, { context: "HALC", feed });
    await toAbout();
    await toNews();
    const seen = new Set<string>();
    for (let i = 0; i < 48 && seen.size < 2; i++) {
      await wait(250);
      if (text(h, "br-updating") === EN.updating) seen.add("header");
      if (text(h, "ap-news-updating") === EN.updating) seen.add("news");
    }
    expect([...seen].sort()).toEqual(["header", "news"]);
  });
});

describe("phone: About is a pushed screen", () => {
  it("title = ticker, back = Back to trade; no switch inside About; phoneBack returns to Trade", async () => {
    await mount(h, { context: "HALC", vw: 390 });
    expect(h.store.getState().phoneSub).toBeNull();
    await toAbout();
    const sub = h.store.getState().phoneSub!;
    expect([sub.title, sub.backLabel]).toEqual(["HALC", EN.backToTrade]);
    expect(q(h, "br-view")).toBeNull();
    await act(async () => h.store.getState().phoneBack());
    expect(q(h, "broker")!.dataset.view).toBe("trade");
    expect(h.store.getState().phoneSub).toBeNull();
    expect(document.activeElement).toBe(q(h, "br-ticker"));
  });
  it("unmounting About clears the push", async () => {
    await mount(h, { context: "HALC", vw: 390 });
    await toAbout();
    await act(async () => h.root.render(createElement(ShellCtx.Provider, { value: h.store }, null)));
    expect(h.store.getState().phoneSub).toBeNull();
  });
});
