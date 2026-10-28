// @vitest-environment happy-dom
// UI card 4 (17B BRK-A): the Broker ticket on the real feed hook and mock order transport, fake clock.
// BR-4-02 header, BR-4-04 preview schedule, BR-4-05 stale estimate, BR-4-06 nothing sends before Place,
// BR-4-08/09 one intent then the server's fill, BR-4-10 rejects, BR-4-11 halted/queued, BR-4-14 Sheet Esc = Edit,
// MKT_NO_LOCATE (Quant E-96 (4)).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decText, signedText } from "@/apps/portfolio/positions/format";
import { BR_STRINGS } from "@/apps/broker/strings";
import { formatPercent } from "@/components/ui/percent";
import type { MeTradingBody, PreviewRes, TickerBody } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { intentLog } from "@/shell/intentLog";
import { click, key, moneyText, mount, q, setup, teardown, text, tick, typeInto, typeQty, wait, type Harness } from "./br-harness";

const EN = BR_STRINGS.en;
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

const tickerBody = (feed: MockFeed) => feed.body("ticker:wl_default") as TickerBody;
const meBody = (feed: MockFeed) => feed.body("me") as MeTradingBody;
const intentsSince = (n: number) => intentLog().slice(n);
const broker = () => q(h, "broker")!;

describe("BR-4-02 header", () => {
  it("context HALC: ticker heading, Last/Today are the TickerRow strings", async () => {
    const feed = await mount(h, { context: "HALC" });
    const row = tickerBody(feed).rows.HALC!;
    expect(text(h, "br-ticker")).toBe("HALC");
    expect(q(h, "br-asset-select")).toBeNull();
    expect(text(h, "br-last")).toBe(decText(row.last, "en"));
    const today = text(h, "br-today")!;
    expect(today).toContain(signedText(row.chg!, "en"));
    expect(today).toContain(formatPercent(row.chgPct!, "en")!.replace(/^\+/, ""));
  });
  it("no context: the select lists exactly the ticker keys A→Z", async () => {
    const feed = await mount(h);
    const opts = [...q(h, "br-asset-select")!.querySelectorAll("option")].map((o) => o.value);
    expect(opts).toEqual(Object.keys(tickerBody(feed).rows).sort());
  });
  it("a loss shows U+2212 and ▼ with the loss class", async () => {
    const feed = await mount(h, { context: "HALC" });
    for (let i = 0; i < 40 && !tickerBody(feed).rows.HALC!.chg!.startsWith("-"); i++) await tick(feed);
    const row = tickerBody(feed).rows.HALC!;
    expect(row.chg!.startsWith("-")).toBe(true);
    const el = q(h, "br-today")!;
    expect(el.dataset.dir).toBe("down");
    expect(el.textContent).toContain("▼");
    expect(el.textContent).toContain("\u2212");
    expect(el.textContent).not.toMatch(/-/);
  });
  it("holding and FDL cash line", async () => {
    const feed = await mount(h, { context: "HALC" });
    const me = meBody(feed);
    expect(text(h, "br-you-hold")).toBe(EN.youHold(decText(me.positions.HALC!.qty, "en")));
    expect(text(h, "br-hold")).toContain(moneyText(me.balances.FDL!));
  });
});

describe("BR-4-04 preview schedule", () => {
  it("typing \"40\" fires one preview 300 ms after the last keystroke", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await typeInto(q(h, "br-qty")!, "4");
    await wait(100);
    await typeInto(q(h, "br-qty")!, "40");
    await wait(299);
    expect(spy).not.toHaveBeenCalled();
    await wait(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day" });
  });
  it("10 keystrokes inside one tick send at most 5 previews", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    for (let i = 1; i <= 10; i++) { await typeInto(q(h, "br-qty")!, String(i)); await wait(350); }
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
  });
  it("rows are the PreviewRes strings; the cap row is absent for null", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await typeQty(h, "40");
    const res = spy.mock.results[0]!.value as PreviewRes;
    const dd = (k: string) => q(h, `br-row-${k}`)!.querySelector("dd")!.textContent;
    expect(dd("price")).toBe(decText(res.price, "en"));
    expect(dd("estFill")).toBe(decText(res.estFill, "en"));
    expect(dd("fee")).toBe(moneyText(res.fee));
    expect(dd("impact")).toBe(`${EN.bp(res.impactBp)} ${moneyText(res.impactMoney)}`);
    expect(dd("total")).toBe(moneyText(res.total));
    expect(dd("bpAfter")).toBe(moneyText(res.buyingPowerAfter));
    expect(text(h, "br-est-title")).toBe(EN.estimateAt(String(res.computedAtTick)));
    expect(q(h, "br-row-capLeft")).toBeNull();
  });
  it("an injected cap \"500.00\" shows the First-trade cap row", async () => {
    const feed = await mount(h, { context: "HALC" });
    const orig = feed.preview.bind(feed);
    vi.spyOn(feed, "preview").mockImplementation((d) => ({ ...orig(d), firstTradeCapRemaining: "500.00" }));
    await typeQty(h, "40");
    expect(q(h, "br-row-capLeft")!.querySelector("dt")!.textContent).toBe(EN.capLeft);
    expect(q(h, "br-row-capLeft")!.querySelector("dd")!.textContent).toBe(moneyText("500.00"));
  });
  it("format check only: letters say \"Use digits only.\" and send no preview", async () => {
    const feed = await mount(h, { context: "HALC" });
    const spy = vi.spyOn(feed, "preview");
    await typeQty(h, "4a");
    expect(text(h, "br-qty-msg")).toBe(EN.qtyDigits);
    expect(q(h, "br-qty")!.getAttribute("aria-invalid")).toBe("true");
    expect(spy).not.toHaveBeenCalled();
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBe("true");
  });
  it("an invalid server preview shows its reason and keeps Review disabled", async () => {
    await mount(h, { context: "HALC" });
    await typeQty(h, "0");
    expect(text(h, "br-qty-msg")).toBe(EN.r.MKT_BAD_QTY);
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("BR-4-05 stale estimate", () => {
  it("computedAtTick < ticker tick greys rows and disables Place; the fresh preview re-enables it", async () => {
    const feed = await mount(h, { context: "HALC" });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    expect(broker().dataset.phase).toBe("review");
    expect(q(h, "br-place")!.getAttribute("aria-disabled")).toBeNull();
    // Hold the next preview so the shown one is older than the ticker.
    const orig = feed.preview.bind(feed);
    let release: () => void = () => {};
    vi.spyOn(feed, "preview").mockImplementation((d) => new Promise<PreviewRes>((r) => { release = () => r(orig(d)); }) as unknown as PreviewRes);
    await tick(feed);
    expect(q(h, "br-est")!.dataset.stale).toBe("1");
    expect(q(h, "br-est")!.className).toContain("stale");
    expect(text(h, "br-refreshing")).toBe(EN.refreshing);
    expect(q(h, "br-place")!.getAttribute("aria-disabled")).toBe("true");
    await click(q(h, "br-place")!);
    expect(broker().dataset.phase).toBe("review"); // disabled Place does nothing
    await (async () => { release(); await wait(0); })();
    expect(q(h, "br-est")!.dataset.stale).toBeUndefined();
    expect(q(h, "br-place")!.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("BR-4-06 nothing is sent before Place", () => {
  it("B/S keys, side clicks, typing and Review leave the intent log unchanged", async () => {
    await mount(h, { context: "HALC" });
    const n = intentLog().length;
    expect(text(h, "br-side-buy")).toBe(EN.buy);
    expect(text(h, "br-side-sell")).toBe(EN.sell);
    expect(EN.buy.startsWith("↑") && EN.sell.startsWith("↓")).toBe(true);
    await key(broker(), "s");
    expect(q(h, "br-side-sell")!.getAttribute("aria-pressed")).toBe("true");
    await key(broker(), "b");
    expect(q(h, "br-side-buy")!.getAttribute("aria-pressed")).toBe("true");
    await click(q(h, "br-side-sell")!);
    await click(q(h, "br-side-buy")!);
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    await click(q(h, "br-edit")!);
    await key(q(h, "br-qty")!, "Enter"); // Enter in the ticket = Review, never Place
    expect(broker().dataset.phase).toBe("review");
    expect(intentsSince(n)).toEqual([]);
  });
});

describe("BR-4-08/09 place and fill", () => {
  it("one intent even on double click + Enter; pending; cash unchanged until the result tick; then the fill", async () => {
    const feed = await mount(h, { context: "HALC" });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    const cash = text(h, "br-hold");
    const n = intentLog().length;
    const meTick = feed.tick;
    await click(q(h, "br-place")!);
    await click(q(h, "br-place")!);
    await key(broker(), "Enter");
    const sent = intentsSince(n);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ kind: "mkt.order.place", payload: { assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day", intentId: sent[0]!.payload.intentId } });
    expect(broker().dataset.phase).toBe("submitting");
    expect(text(h, "br-pending")).toBe(EN.pending(String(meTick)));
    expect(q(h, "br-place")!.getAttribute("aria-busy")).toBe("true");
    expect(text(h, "br-hold")).toBe(cash);
    await tick(feed);
    expect(intentsSince(n)).toHaveLength(1);
    const me = meBody(feed);
    const fill = me.fills.at(-1)!;
    expect(broker().dataset.phase).toBe("acked");
    const ack = q(h, "br-ack")!;
    expect(ack.getAttribute("role")).toBe("status");
    expect(text(h, "br-ack-title")).toBe(EN.bought("40", "HALC", decText(fill.price, "en")));
    expect(text(h, "br-ack-fee")).toBe(EN.feeLine(decText(fill.fee, "en")));
    expect(text(h, "br-hold")).toContain(moneyText(me.balances.FDL!));
  });
  it("two clicks and two Enters in one task (no render between them) still send one intent", async () => {
    await mount(h, { context: "HALC" });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    const n = intentLog().length;
    const place = q(h, "br-place")!, block = q(h, "br-review-block")!;
    await act(async () => {
      const clickIt = () => place.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const enter = () => block.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      clickIt(); clickIt(); enter(); enter();
    });
    expect(intentsSince(n)).toHaveLength(1);
  });
  it("while the submit reply is held (?replyMs), more clicks and Enters send nothing", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { replyMs: 2000 } });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    const n = intentLog().length;
    await click(q(h, "br-place")!);
    await wait(500);
    await click(q(h, "br-place")!);
    await key(q(h, "br-review-block")!, "Enter");
    await key(broker(), "Enter");
    expect(intentsSince(n)).toHaveLength(1);
    expect(broker().dataset.phase).toBe("submitting");
    await wait(1500);
    expect(intentsSince(n)).toHaveLength(1);
    await tick(feed);
    expect(broker().dataset.phase).toBe("acked");
    expect(intentsSince(n)).toHaveLength(1);
  });
  it("New order keeps HALC + Buy and clears the quantity", async () => {
    const feed = await mount(h, { context: "HALC" });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    await click(q(h, "br-place")!);
    await tick(feed);
    await click(q(h, "br-new")!);
    expect(broker().dataset.phase).toBe("edit");
    expect(text(h, "br-ticker")).toBe("HALC");
    expect(q(h, "br-side-buy")!.getAttribute("aria-pressed")).toBe("true");
    expect((q(h, "br-qty") as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(q(h, "br-qty"));
  });
  it("Edit in review returns to the ticket with the draft", async () => {
    await mount(h, { context: "HALC" });
    await click(q(h, "br-side-sell")!);
    await typeQty(h, "5");
    await click(q(h, "br-review")!);
    expect(text(h, "br-action")).toBe(EN.actionSell("5", "HALC"));
    expect(q(h, "br-place")!.getAttribute("aria-label")).toBe(EN.placeAria(EN.actionSell("5", "HALC")));
    await click(q(h, "br-edit")!);
    expect(broker().dataset.phase).toBe("edit");
    expect((q(h, "br-qty") as HTMLInputElement).value).toBe("5");
  });
});

describe("BR-4-10 rejects", () => {
  async function placeRejected(code: string) {
    const feed = await mount(h, { context: "HALC", scenario: { reject: code } });
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    await click(q(h, "br-place")!);
    await tick(feed);
  }
  it("MKT_INSUFFICIENT_BP: \"Order rejected\" + its copy; Edit restores the draft", async () => {
    await placeRejected("MKT_INSUFFICIENT_BP");
    expect(q(h, "br-ack")!.dataset.status).toBe("REJECTED");
    expect(text(h, "br-ack-title")).toBe(EN.rejected);
    expect(text(h, "br-ack-reason")).toBe(EN.r.MKT_INSUFFICIENT_BP);
    await click(q(h, "br-ack-edit")!);
    expect(broker().dataset.phase).toBe("edit");
    expect((q(h, "br-qty") as HTMLInputElement).value).toBe("40");
    expect(q(h, "br-side-buy")!.getAttribute("aria-pressed")).toBe("true");
  });
  it("unknown ZZ_NEW: \"Order rejected (ZZ_NEW)\" and no reason line", async () => {
    await placeRejected("ZZ_NEW");
    expect(text(h, "br-ack-title")).toBe("Order rejected (ZZ_NEW)");
    expect(q(h, "br-ack-reason")).toBeNull();
  });
  it("oversell: preview invalid with the no-locate line; a forced submit is rejected MKT_NO_LOCATE", async () => {
    const feed = await mount(h, { context: "HALC" });
    const held = meBody(feed).positions.HALC!.qty;
    await click(q(h, "br-side-sell")!);
    await typeQty(h, `${held}0`);
    expect(text(h, "br-qty-msg")).toBe(EN.r.MKT_NO_LOCATE);
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBe("true");
    // The server is the authority: a sell past the holding that reaches submit is rejected whole.
    const id = feed.submit({ assetId: "HALC", side: "SELL", type: "market", qty: `${held}0`, tif: "day" });
    feed.advance();
    expect(meBody(feed).intents.find((i) => i.intentId === id)).toMatchObject({ status: "REJECTED", rejectCode: "MKT_NO_LOCATE" });
    expect(meBody(feed).positions.HALC!.qty).toBe(held);
  });
  it("MKT_NO_LOCATE ack copy", async () => {
    await placeRejected("MKT_NO_LOCATE");
    expect(text(h, "br-ack-title")).toBe(EN.rejected);
    expect(text(h, "br-ack-reason")).toBe(EN.r.MKT_NO_LOCATE);
  });
});

describe("BR-4-11 halted (E-98 (1))", () => {
  it("chip shown; ticket enabled; previews as live; one placeOrder; review + ack say queued", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { halt: "HALC" } });
    const spy = vi.spyOn(feed, "preview");
    expect(text(h, "br-halted")).toBe(EN.halted);
    expect(q(h, "br-halted")!.className).toContain("br-halted");
    expect((q(h, "br-side-sell") as HTMLButtonElement).disabled).toBe(false);
    expect((q(h, "br-qty") as HTMLInputElement).readOnly).toBe(false);
    await typeQty(h, "40");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBeNull();
    await click(q(h, "br-review")!);
    expect(text(h, "br-queued")).toBe(EN.haltedQueued);
    const n = intentLog().length;
    const submit = vi.spyOn(feed, "submit");
    await click(q(h, "br-place")!);
    await click(q(h, "br-place")!);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(intentsSince(n)).toHaveLength(1);
    await tick(feed);
    expect(q(h, "br-ack")!.dataset.status).toBe("ACCEPTED");
    expect(text(h, "br-ack-title")).toBe(EN.received);
    expect(text(h, "br-queued")).toBe(EN.haltedQueued);
    expect(h.el.textContent).not.toContain(EN.haltedHelp);
  });
});

describe("BR-4-12 feed states", () => {
  it.each(["loading", "denied", "error"] as const)("?feed=%s", async (mode) => {
    await mount(h, { context: "HALC", scenario: { feed: mode } });
    const b = broker();
    if (mode === "loading") { expect(b.getAttribute("aria-busy")).toBe("true"); expect(q(h, "br-loading")).not.toBeNull(); }
    else { expect(b.dataset.state).toBe(mode); expect(q(h, "br-error")!.textContent).toContain(EN.couldntLoad); }
  });
  it("error → Retry resyncs ticker and me", async () => {
    const feed = await mount(h, { context: "HALC", scenario: { feed: "error" } });
    const spy = vi.spyOn(feed, "resync");
    await click(q(h, "br-retry")!);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["ticker:wl_default", "me"]);
  });
  it("stale: Updating…, Review disabled", async () => {
    await mount(h, { context: "HALC", feed: new MockFeed({ feed: "stale" }, { tickMs: 1000 }) });
    await typeQty(h, "40");
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBeNull(); // live first
    for (let i = 0; i < 8 && broker().dataset.state !== "stale"; i++) await wait(500);
    expect(broker().dataset.state).toBe("stale");
    expect(text(h, "br-updating")).toBe(EN.updating);
    await typeQty(h, "40");
    expect(q(h, "br-review")!.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("BR-4-14 phone review Sheet", () => {
  it("review opens in the Sheet; Esc = Edit; scale 2.0 stacks", async () => {
    await mount(h, { context: "HALC", vw: 390, textScale: 2 });
    expect(broker().className).toContain("br-phone");
    expect(broker().className).toContain("br-stacked");
    await typeQty(h, "40");
    await click(q(h, "br-review")!);
    const sheet = q(h, "br-sheet")!;
    expect(sheet.querySelector('[data-testid="br-place"]')).not.toBeNull();
    expect(q(h, "br-ticket")).not.toBeNull(); // the ticket stays under the Sheet
    await act2(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(q(h, "br-sheet")).toBeNull();
    expect(broker().dataset.phase).toBe("edit");
  });
});
async function act2(fn: () => void) { const { act } = await import("react"); await act(async () => { fn(); }); }

describe("BR-4-16 FR render", () => {
  it("FR labels, U+202F before % and pb, FR ack", async () => {
    const FR = BR_STRINGS.fr;
    const feed = await mount(h, { context: "HALC", locale: "fr" });
    expect(text(h, "br-today")).toMatch(/\u202F%/);
    expect(text(h, "br-review")).toBe(FR.review);
    expect(text(h, "br-kind")).toBe(FR.orderKind);
    await typeQty(h, "40");
    expect(q(h, "br-row-impact")!.textContent).toMatch(/\u202Fpb/);
    await click(q(h, "br-review")!);
    expect(q(h, "br-place")!.getAttribute("aria-label")).toBe(`Passer l’ordre\u202F: Acheter 40 HALC`);
    await click(q(h, "br-place")!);
    await tick(feed);
    const fill = meBody(feed).fills.at(-1)!;
    expect(text(h, "br-ack-title")).toBe(FR.bought("40", "HALC", decText(fill.price, "fr")));
  });
});
