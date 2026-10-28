// @vitest-environment happy-dom
// UI card 5 (17B BRK-A/C): order type segment and price boxes, previews per type, the resting ack and Open orders,
// on the real feed hook and mock order transport with a fake clock.
// BR-5-01 segment + fields, BR-5-03 preview drafts, BR-5-06 rows, BR-5-07 rows are not controls, BR-5-12 FR.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decText } from "@/apps/portfolio/positions/format";
import { BR_STRINGS } from "@/apps/broker/strings";
import type { MeTradingBody, OpenOrder, PreviewRes } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { intentLog } from "@/shell/intentLog";
import { MANUAL_TICK_MS, click, key, mount, q, setup, teardown, text, tick, typeInto, typeQty, wait, type Harness } from "./br-harness";

const EN = BR_STRINGS.en;
const FR = BR_STRINGS.fr;
const NNBSP = "\u202F";
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

const broker = () => q(h, "broker")!;
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const rows = () => all('[data-testid^="br-oo-row-"]');
const pick = (type: string) => click(q(h, `br-type-${type}`)!);
const price = async (f: "limit" | "stop", v: string) => { await typeInto(q(h, `br-price-${f}`)!, v); await wait(300); };

/** A MockFeed whose `me` carries extra open orders (the mock itself never makes PARTIAL or PENDING). */
class InjectFeed extends MockFeed {
  constructor(private extra: Record<string, OpenOrder>, opts: { empty?: boolean } = {}) { super({ empty: opts.empty ?? false }, { tickMs: MANUAL_TICK_MS }); }
  override body(ch: Parameters<MockFeed["body"]>[0]): unknown {
    const b = super.body(ch);
    return ch === "me" ? { ...(b as MeTradingBody), orders: { ...(b as MeTradingBody).orders, ...this.extra } } : b;
  }
}
const oo = (o: Partial<OpenOrder> & Pick<OpenOrder, "orderId" | "placedTick">): OpenOrder =>
  ({ assetId: "HALC", side: "BUY", type: "limit", qty: "40", filled: "0", limit: "42.10", tif: "day", status: "WORKING", avgPrice: "0.00", ...o });

describe("BR-5-01 order type segment", () => {
  it("Market, Limit, Stop, Stop limit; Market pressed by default with card 4's ticket and no price box", async () => {
    await mount(h, { context: "HALC" });
    const seg = q(h, "br-type")!;
    expect(seg.getAttribute("role")).toBe("group");
    expect([...seg.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Market", "Limit", "Stop", "Stop limit"]);
    expect(q(h, "br-type-market")!.getAttribute("aria-pressed")).toBe("true");
    expect(q(h, "br-price-limit")).toBeNull();
    expect(q(h, "br-price-stop")).toBeNull();
    expect(text(h, "br-kind")).toBe(EN.orderKind);
    expect(q(h, "br-ticket")!.getAttribute("aria-label")).toBe(EN.orderKind);
  });
  it.each([
    ["limit", ["br-price-limit"], "Limit · Day"],
    ["stop", ["br-price-stop"], "Stop · Day"],
    ["stop_limit", ["br-price-stop", "br-price-limit"], "Stop limit · Day"],
    ["market", [], "Market · Day"],
  ])("%s shows exactly %j (stop first) and \"%s\"", async (type, fields, kind) => {
    await mount(h, { context: "HALC" });
    await pick("stop_limit");
    await pick(type);
    expect(all('[data-testid^="br-price-"]:not([data-testid$="-msg"])').map((e) => e.dataset.testid)).toEqual(fields);
    expect(text(h, "br-kind")).toBe(kind);
    for (const f of fields) {
      const input = q(h, f) as HTMLInputElement;
      expect(input.getAttribute("inputmode")).toBe("decimal");
      expect(input.className).toContain("num");
      expect(input.className).toContain("br-price");
    }
  });
  it("labels: Limit price / Stop price", async () => {
    await mount(h, { context: "HALC" });
    await pick("stop_limit");
    expect(q(h, "br-price-stop")!.closest("label")!.textContent).toBe(EN.stopPrice);
    expect(q(h, "br-price-limit")!.closest("label")!.textContent).toBe(EN.limitPrice);
  });
  it("text scale 2.0 stacks the type segment", async () => {
    await mount(h, { context: "HALC", textScale: 2 });
    expect(q(h, "br-type")!.classList.contains("br-seg-stack")).toBe(true);
  });
});

describe("BR-5-02 price box copy", () => {
  it("bad format warns with priceFormat and sends no preview; empty after touch says priceEmpty", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await pick("limit");
    await typeQty(h, "40");
    expect(spy).not.toHaveBeenCalled(); // no limit yet
    for (const bad of ["-1", "4e2", "42."]) {
      await price("limit", bad);
      expect(text(h, "br-price-limit-msg")).toBe(EN.priceFormat);
      expect(q(h, "br-price-limit")!.getAttribute("aria-invalid")).toBe("true");
    }
    expect(spy).not.toHaveBeenCalled();
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBe("true");
    await price("limit", "");
    expect(text(h, "br-price-limit-msg")).toBe(EN.priceEmpty);
    expect(q(h, "br-price-limit")!.getAttribute("aria-invalid")).toBeNull();
    await price("limit", "42,10");
    expect(q(h, "br-price-limit-msg")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("BR-5-03 preview drafts per type", () => {
  it("Limit 42.10 sends {type:limit, limit:\"42.10\", tif:day} and no stop; rows are the PreviewRes strings", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await pick("limit");
    await typeInto(q(h, "br-qty")!, "40");
    await price("limit", "42.10");
    expect(spy).toHaveBeenCalledTimes(1);
    const d = spy.mock.calls[0]![0];
    expect(d).toEqual({ assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" });
    expect("stop" in d).toBe(false);
    const res = spy.mock.results[0]!.value as PreviewRes;
    expect(res.price).toBe("42.10");
    expect(q(h, "br-row-price")!.querySelector("dd")!.textContent).toBe(decText(res.price, "en"));
    expect(q(h, "br-row-estFill")!.querySelector("dd")!.textContent).toBe(decText(res.estFill, "en"));
  });
  it("Stop sends stop only; Stop limit sends both", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await pick("stop");
    await typeInto(q(h, "br-qty")!, "40");
    await price("stop", "40.00");
    expect(spy.mock.calls.at(-1)![0]).toEqual({ assetId: "HALC", side: "BUY", type: "stop", qty: "40", stop: "40.00", tif: "day" });
    await pick("stop_limit");
    await wait(300);
    expect(spy.mock.calls.length).toBe(1); // no limit yet: nothing sent
    await price("limit", "39,80");
    expect(spy.mock.calls.at(-1)![0]).toEqual({ assetId: "HALC", side: "BUY", type: "stop_limit", qty: "40", stop: "40.00", limit: "39.80", tif: "day" });
  });
  it("switching back to Market drops the prices from the draft", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await pick("limit");
    await typeInto(q(h, "br-qty")!, "40");
    await price("limit", "42.10");
    await pick("market");
    await wait(300);
    expect(spy.mock.calls.at(-1)![0]).toEqual({ assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day" });
  });
});

describe("BR-5-04/05 review title and resting ack (unit)", () => {
  it("review title per type; place a limit: one intent with limit, resting ack and a Working row in the same render", async () => {
    const feed = await mount(h, { context: "HALC" });
    await pick("limit");
    await typeInto(q(h, "br-qty")!, "40");
    await price("limit", "42,10");
    await click(q(h, "br-review")!);
    expect(text(h, "br-action")).toBe("Buy 40 HALC · Limit 42.10");
    expect(q(h, "br-place")!.getAttribute("aria-label")).toBe(EN.placeAria("Buy 40 HALC · Limit 42.10"));
    const n = intentLog().length;
    await click(q(h, "br-place")!);
    const sent = intentLog().slice(n);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ type: "limit", limit: "42.10", tif: "day" });
    expect(sent[0]!.payload).not.toHaveProperty("stop");
    expect(rows()).toHaveLength(0);
    await tick(feed);
    expect(text(h, "br-ack-title")).toBe(EN.restingAck);
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0]!.querySelector('[data-testid="br-oo-terms"]')!.textContent).toBe("Limit 42.10");
    expect(r[0]!.querySelector('[data-testid="br-oo-status"]')!.textContent).toBe("Working");
    expect(r[0]!.dataset.fresh).toBe("1");
    await tick(feed);
    expect(rows()[0]!.dataset.fresh).toBeUndefined(); // 1 tick only
  });
  it.each([
    ["stop", { stop: "40.00" }, "Sell 40 HALC · Stop 40.00"],
    ["stop_limit", { stop: "40.00", limit: "39.80" }, "Sell 40 HALC · Stop 40.00 · Limit 39.80"],
  ] as const)("%s review title", async (type, prices, title) => {
    await mount(h, { context: "HALC" });
    await click(q(h, "br-side-sell")!);
    await pick(type);
    await typeInto(q(h, "br-qty")!, "40");
    for (const [f, v] of Object.entries(prices)) await price(f as "limit" | "stop", v);
    await click(q(h, "br-review")!);
    expect(text(h, "br-action")).toBe(title);
  });
  it("a market fill keeps card 4's ack copy (no resting ack, no highlight)", async () => {
    const feed = await mount(h, { context: "HALC" });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    expect(text(h, "br-action")).toBe("Buy 40 HALC");
    await click(q(h, "br-place")!);
    await tick(feed);
    expect(text(h, "br-ack-title")).not.toBe(EN.restingAck);
    expect(document.querySelector('[data-fresh="1"]')).toBeNull();
  });
  it("a halted market order keeps card 4's received + Waits for reopen", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { halt: "HALC" } });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    await click(q(h, "br-place")!);
    await tick(feed);
    expect(text(h, "br-ack-title")).toBe(EN.received);
    expect(text(h, "br-queued")).toBe(EN.haltedQueued);
    expect(rows()[0]!.querySelector('[data-testid="br-oo-status"]')!.textContent).toBe(EN.haltedQueued);
  });
  it("Edit after a reject restores type, prices and qty; New order keeps type and prices", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { reject: "MKT_INSUFFICIENT_BP" } });
    await pick("stop_limit");
    await typeInto(q(h, "br-qty")!, "40");
    await price("stop", "40.00");
    await price("limit", "39.80");
    await click(q(h, "br-review")!);
    await click(q(h, "br-place")!);
    await tick(feed);
    expect(text(h, "br-ack-title")).toBe(EN.rejected);
    await click(q(h, "br-ack-edit")!);
    expect(q(h, "br-type-stop_limit")!.getAttribute("aria-pressed")).toBe("true");
    expect((q(h, "br-price-stop") as HTMLInputElement).value).toBe("40.00");
    expect((q(h, "br-price-limit") as HTMLInputElement).value).toBe("39.80");
    expect((q(h, "br-qty") as HTMLInputElement).value).toBe("40");
  });
});

describe("BR-5-06 Open orders rows", () => {
  const extra = {
    "o-90": oo({ orderId: "o-90", placedTick: 100, qty: "40", filled: "18", status: "PARTIAL" }),
    "o-91": oo({ orderId: "o-91", placedTick: 300, side: "SELL", type: "stop", limit: undefined, stop: "1234.5", qty: "5", status: "PENDING", assetId: "KRNX" }),
    "o-92": oo({ orderId: "o-92", placedTick: 200, type: "stop_limit", stop: "40.00", limit: "39.80", qty: "7" }),
    "o-93": oo({ orderId: "o-93", placedTick: 200, type: "market", limit: undefined, qty: "3", status: "QUEUED_AUCTION" }),
  };
  it("rows are the OpenOrder strings, sorted placedTick desc then orderId", async () => {
    await mount(h, { context: "HALC", feed: new InjectFeed(extra) });
    expect(rows().map((r) => r.dataset.testid)).toEqual(["br-oo-row-o-91", "br-oo-row-o-92", "br-oo-row-o-93", "br-oo-row-o-90"]);
    const cell = (id: string, c: string) => q(h, `br-oo-row-${id}`)!.querySelector(`[data-testid="br-oo-${c}"]`)!.textContent;
    expect([cell("o-91", "side"), cell("o-91", "ticker"), cell("o-91", "terms"), cell("o-91", "qty"), cell("o-91", "status"), cell("o-91", "meta")])
      .toEqual([EN.sell, "KRNX", `Stop ${decText("1234.5", "en")}`, "5", "Pending", "Day · tick 300"]);
    expect(cell("o-92", "terms")).toBe("Stop 40.00 · Limit 39.80");
    expect(cell("o-93", "terms")).toBe("Market");
    expect(cell("o-93", "status")).toBe("Waits for reopen");
    expect(text(h, "br-oo-count")).toBe("4");
  });
  it("filled:\"18\", qty:\"40\" shows \"18 / 40 filled\" and \"Partly filled\"", async () => {
    await mount(h, { context: "HALC", feed: new InjectFeed(extra) });
    const r = q(h, "br-oo-row-o-90")!;
    expect(r.querySelector('[data-testid="br-oo-qty"]')!.textContent).toBe("18 / 40 filled");
    expect(r.querySelector('[data-testid="br-oo-status"]')!.textContent).toBe("Partly filled");
    expect(r.getAttribute("aria-label")).toBe(`${EN.buy} 18 / 40 filled HALC, Limit 42.10, Partly filled`);
  });
  it("status chips are neutral (no tone class)", async () => {
    await mount(h, { context: "HALC", feed: new InjectFeed(extra) });
    for (const c of all('[data-testid="br-oo-status"]')) expect(c.className).toBe("chip br-oo-chip");
  });
  it("?empty=1 with no orders: \"No open orders.\" and count 0", async () => {
    await mount(h, { context: "HALC", scenario: { empty: true } });
    expect(text(h, "br-oo-empty")).toBe(EN.noOpenOrders);
    expect(text(h, "br-oo-count")).toBe("0");
    expect(rows()).toHaveLength(0);
  });
});

describe("BR-5-07 rows are not controls", () => {
  const extra = { "o-90": oo({ orderId: "o-90", placedTick: 100 }) };
  it("no button, link or menu inside a row; rows are focusable", async () => {
    await mount(h, { context: "HALC", feed: new InjectFeed(extra) });
    const r = q(h, "br-oo-row-o-90")!;
    expect(r.querySelector("button, a, [role=menu], [role=menuitem], [role=button], input, select")).toBeNull();
    expect(r.getAttribute("role"), "the row itself is not a control").toBeNull();
    expect(r.tabIndex).toBe(0);
    expect(q(h, "br-oo")!.querySelector("button")).toBeNull();
  });
  it("click / Enter / B / S on a row leave the intent log and the ticket unchanged, even in review", async () => {
    await mount(h, { context: "HALC", feed: new InjectFeed(extra) });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    expect(broker().dataset.phase).toBe("review");
    const n = intentLog().length;
    const r = q(h, "br-oo-row-o-90")!;
    await click(r);
    await key(r, "Enter");
    await key(r, "s");
    expect(intentLog().length).toBe(n);
    expect(broker().dataset.phase).toBe("review");
    await click(q(h, "br-edit")!);
    expect(q(h, "br-side-buy")!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("BR-5-10 list states (unit)", () => {
  it("loading: 2 skeleton rows", async () => {
    await mount(h, { context: "HALC", scenario: { feed: "loading" } });
    expect(q(h, "br-oo-loading")!.children).toHaveLength(2);
    expect(q(h, "br-oo")!.getAttribute("aria-busy")).toBe("true");
    expect(q(h, "br-loading")).not.toBeNull(); // card 4 skeleton unchanged
  });
  it.each(["denied", "error"] as const)("%s: list says Couldn't load + Retry (resyncs me only); card 4 error stays", async (mode) => {
    const feed = await mount(h, { context: "HALC", scenario: { feed: mode } });
    expect(q(h, "br-oo-error")!.textContent).toContain(EN.couldntLoad);
    expect(q(h, "br-error")!.textContent).toContain(EN.couldntLoad);
    const spy = vi.spyOn(feed, "resync");
    await click(q(h, "br-oo-retry")!);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["me"]);
  });
  it("stale: rows stay and the list says Updating…", async () => {
    await mount(h, { context: "HALC", feed: new MockFeed({ feed: "stale" }, { tickMs: 1000 }) });
    for (let i = 0; i < 12 && q(h, "br-oo-updating") === null; i++) await wait(500);
    expect(text(h, "br-oo-updating")).toBe(EN.updating);
    expect(q(h, "br-oo")!.dataset.state).toBe("stale");
    expect(q(h, "br-oo-empty") ?? q(h, "br-oo-list")).not.toBeNull();
  });
});

describe("BR-5-12 FR", () => {
  it("FR copy table", () => {
    expect([FR.orderType, FR.t.market, FR.t.limit, FR.t.stop, FR.t.stopLimit, FR.kindDay("Limite"), FR.limitPrice, FR.stopPrice, FR.priceEmpty, FR.priceFormat]).toEqual(
      ["Type d’ordre", "Au marché", "Limite", "Stop", "Stop limite", "Limite · Jour", "Cours limite", "Cours de déclenchement", "Saisissez un cours.", "Saisissez un nombre, par ex. 42,10."]);
    expect([FR.termsLimit("42,10"), FR.termsStop("40,00"), FR.termsStopLimit("40,00", "39,80"), FR.restingAck, FR.openOrders, FR.noOpenOrders, FR.filledOf("18", "40")]).toEqual(
      ["Limite 42,10", "Stop 40,00", "Stop 40,00 · Limite 39,80", "Ordre passé. Il figure dans les ordres en cours.", "Ordres en cours", "Aucun ordre en cours.", "18 / 40 exécutés"]);
    expect([FR.s.PENDING, FR.s.WORKING, FR.s.PARTIAL, FR.haltedQueued, FR.rowMeta("5")]).toEqual(["En attente", "Actif", "Partiellement exécuté", "Attend la réouverture", "Jour · tick 5"]);
    expect([EN.orderType, EN.kindDay("Limit"), EN.priceEmpty, EN.priceFormat, EN.restingAck, EN.filledOf("18", "40"), EN.rowMeta("5")]).toEqual(
      ["Order type", "Limit · Day", "Enter a price.", "Use a number like 42.10.", "Order placed. It's in Open orders.", "18 / 40 filled", "Day · tick 5"]);
  });
  it("FR accepts \"42,10\", sends \"42.10\", shows FR terms and NNBSP before \":\"", async () => {
    const feed = await mount(h, { context: "HALC", locale: "fr" });
    const spy = vi.spyOn(feed, "preview");
    await pick("limit");
    expect(text(h, "br-kind")).toBe("Limite · Jour");
    await typeInto(q(h, "br-qty")!, "40");
    await price("limit", "42,10");
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ type: "limit", limit: "42.10" });
    await click(q(h, "br-review")!);
    expect(text(h, "br-action")).toBe("Acheter 40 HALC · Limite 42,10");
    expect(q(h, "br-place")!.getAttribute("aria-label")).toBe(`Passer l’ordre${NNBSP}: Acheter 40 HALC · Limite 42,10`);
    await click(q(h, "br-place")!);
    await tick(feed);
    expect(text(h, "br-ack-title")).toBe(FR.restingAck);
    expect(rows()[0]!.querySelector('[data-testid="br-oo-terms"]')!.textContent).toBe("Limite 42,10");
    expect(rows()[0]!.querySelector('[data-testid="br-oo-status"]')!.textContent).toBe("Actif");
  });
});
