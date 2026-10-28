// @vitest-environment happy-dom
// UI card 6 (17B BRK-C C-04): inline cancel per open order on the real feed hook and the mock cancel path.
// BR-6-01 control + label, BR-6-02 confirm / undo, BR-6-03 one intent, BR-6-05 ack + focus, BR-6-06 ack with the order
// still open, BR-6-07 reject, BR-6-12 FR. QA #85 carry-over Q2 (rows follow status / filled for the same id).
import { readFileSync } from "node:fs";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BR_STRINGS, cancelRejectCopy } from "@/apps/broker/strings";
import type { IntentResult, MeTradingBody, OpenOrder, OrderDraft } from "@/shell/contracts/channels";
import { MockFeed, type Scenario } from "@/shell/contracts/mockFeed";
import { intentLog } from "@/shell/intentLog";
import { MANUAL_TICK_MS, click, key, mount, q, setup, teardown, text, tick, wait, type Harness } from "./br-harness";

const EN = BR_STRINGS.en;
const FR = BR_STRINGS.fr;
const NNBSP = "\u202F";
let h: Harness;
beforeEach(() => { h = setup(); });
afterEach(async () => { await teardown(h); });

const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const rowIds = () => all('[data-testid^="br-oo-row-"]').map((r) => r.dataset.testid!.slice("br-oo-row-".length));
const row = (id: string) => q(h, `br-oo-row-${id}`)!;
const inRow = (id: string, tid: string) => row(id).querySelector<HTMLElement>(`[data-testid="${tid}"]`);
const cancels = () => intentLog().filter((i) => i.kind === "mkt.order.cancel");
const LIMIT = (limit: string, side: "BUY" | "SELL" = "BUY"): OrderDraft => ({ assetId: "HALC", side, type: "limit", qty: "40", limit, tif: "day" });

/** A mock feed with resting orders o-1… (oldest first), placed before mount and settled by one tick. */
function feedWith(drafts: OrderDraft[], scenario: Partial<Scenario> = {}): MockFeed {
  const f = new MockFeed(scenario, { tickMs: MANUAL_TICK_MS });
  for (const d of drafts) f.submit(d);
  f.advance();
  return f;
}
async function openConfirm(id: string) { await click(inRow(id, "br-oo-cancel")!); }
async function yes(id: string) { await click(inRow(id, "br-oo-yes")!); }

describe("BR-6-01 one Cancel per row", () => {
  it("every row has exactly one \"Cancel\" named by cancelAria; the li has no control role", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10"), LIMIT("43.00", "SELL")]) });
    expect(rowIds()).toHaveLength(2);
    for (const id of rowIds()) {
      const btns = [...row(id).querySelectorAll("button")];
      expect(btns.map((b) => b.textContent)).toEqual([EN.cancel]);
      expect(row(id).getAttribute("role")).toBeNull();
      expect(row(id).tabIndex).toBe(0);
    }
    const buy = rowIds().find((id) => row(id).dataset.status && inRow(id, "br-oo-side")!.textContent === EN.buy)!;
    expect(inRow(buy, "br-oo-cancel")!.getAttribute("aria-label")).toBe("Cancel order: Buy 40 HALC, Limit 42.10");
    const sell = rowIds().find((id) => id !== buy)!;
    expect(inRow(sell, "br-oo-cancel")!.getAttribute("aria-label")).toBe("Cancel order: Sell 40 HALC, Limit 43.00");
  });
  it("the control styles name no --acc and the button is the quiet secondary", () => {
    const css = readFileSync("src/apps/broker/openOrders.css", "utf8");
    const card6 = css.slice(css.indexOf("/* Cancel (UI card 6)"));
    expect(card6).not.toMatch(/--acc/);
    const src = readFileSync("src/apps/broker/CancelControl.tsx", "utf8");
    expect(src).not.toMatch(/variant="primary"|--acc/);
  });
});

describe("BR-6-02 inline confirm and undo", () => {
  it("Cancel opens the confirm with Keep focused; Keep restores idle, focus on Cancel, nothing logged", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10")]) });
    const n = intentLog().length;
    await openConfirm("o-2");
    expect(text(h, "br-oo-ask")).toBe(EN.cancelConfirm);
    expect(inRow("o-2", "br-oo-cancel")).toBeNull();
    expect(document.activeElement).toBe(inRow("o-2", "br-oo-keep"));
    expect(inRow("o-2", "br-oo-yes")!.textContent).toBe(EN.confirmCancel);
    await click(inRow("o-2", "br-oo-keep")!);
    expect(q(h, "br-oo-confirm")).toBeNull();
    expect(document.activeElement).toBe(inRow("o-2", "br-oo-cancel"));
    expect(intentLog().length).toBe(n);
  });
  it("Esc restores idle with focus on Cancel and does not close anything else; nothing logged", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10")]) });
    const n = intentLog().length;
    await openConfirm("o-2");
    let bubbled = false;
    const spy = () => { bubbled = true; };
    window.addEventListener("keydown", spy);
    await key(inRow("o-2", "br-oo-keep")!, "Escape");
    window.removeEventListener("keydown", spy);
    expect(bubbled, "Esc stops at the confirm (a sheet or the shell never sees it)").toBe(false);
    expect(q(h, "br-oo-confirm")).toBeNull();
    expect(document.activeElement).toBe(inRow("o-2", "br-oo-cancel"));
    expect(intentLog().length).toBe(n);
  });
  it("opening a second row's confirm closes the first (one per list)", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10"), LIMIT("41.00")]) });
    await openConfirm("o-3");
    await openConfirm("o-4");
    expect(all('[data-testid="br-oo-confirm"]')).toHaveLength(1);
    expect(inRow("o-4", "br-oo-confirm")).not.toBeNull();
    expect(inRow("o-3", "br-oo-cancel")).not.toBeNull();
  });
});

describe("BR-6-03 / 04 one intent, then Cancelling", () => {
  it("Yes logs exactly one mkt.order.cancel; a second press on the same node sends nothing", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10")]) });
    const n = cancels().length;
    await openConfirm("o-2");
    const y = inRow("o-2", "br-oo-yes")!;
    // Two presses in one React batch (no re-render between them): the in-flight guard, not the unmount, stops the second.
    await act(async () => { for (let i = 0; i < 2; i++) y.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(cancels().slice(n)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: "o-2" } }]);
    expect(inRow("o-2", "br-oo-yes")).toBeNull();
    expect(row("o-2").getAttribute("aria-busy")).toBe("true");
    expect(row("o-2").querySelector("button")).toBeNull();
    expect(text(h, "br-oo-cancelling")).toMatch(/^Cancelling… · tick \d+$/);
    expect(inRow("o-2", "br-oo-status")!.textContent).toBe(EN.s.WORKING);
  });
  it("replyMs: a press while the reply is held sends nothing more", async () => {
    await mount(h, { context: "HALC", feed: feedWith([LIMIT("42.10")], { replyMs: 2000 }) });
    const n = cancels().length;
    await openConfirm("o-2");
    const y = inRow("o-2", "br-oo-yes")!;
    await click(y);
    await wait(500);
    await click(y);
    await wait(2000);
    expect(cancels().length - n).toBe(1);
  });
});

describe("BR-6-05 ack removes the row", () => {
  it("next tick: row gone, count -1, status line with the terms, focus on the next row's Cancel", async () => {
    const f = feedWith([LIMIT("41.00"), LIMIT("42.10")]);
    await mount(h, { context: "HALC", feed: f });
    expect(rowIds()).toEqual(["o-3", "o-4"]); // same tick: orderId order (o-3 placed first)
    expect(text(h, "br-oo-count")).toBe("2");
    await openConfirm("o-3");
    await yes("o-3");
    await tick(f);
    expect(rowIds()).toEqual(["o-4"]);
    expect(text(h, "br-oo-count")).toBe("1");
    expect(text(h, "br-oo-line")).toBe("Order cancelled: Buy 40 HALC, Limit 41.00");
    expect(document.activeElement).toBe(inRow("o-4", "br-oo-cancel"));
    expect(q(h, "br-oo-leaving-o-3")!.getAttribute("aria-hidden")).toBe("true");
    await tick(f);
    expect(q(h, "br-oo-leaving-o-3"), "the collapsing copy is gone a tick later").toBeNull();
  });
  it("a middle row: focus goes to the next row's Cancel, not the previous one", async () => {
    const f = feedWith([LIMIT("41.00"), LIMIT("42.10"), LIMIT("43.20")]);
    await mount(h, { context: "HALC", feed: f });
    const [prev, mid, next] = rowIds();
    await openConfirm(mid);
    await yes(mid);
    await tick(f);
    expect(rowIds()).toEqual([prev, next]);
    expect(document.activeElement).toBe(inRow(next, "br-oo-cancel"));
  });
  it("last row: focus on the previous row's Cancel; empty list: heading, then \"No open orders.\"", async () => {
    const f = feedWith([LIMIT("41.00"), LIMIT("42.10")]);
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-4");
    await yes("o-4");
    await tick(f);
    expect(document.activeElement).toBe(inRow("o-3", "br-oo-cancel"));
    await openConfirm("o-3");
    await yes("o-3");
    await tick(f);
    expect(document.activeElement).toBe(document.getElementById("br-oo-title"));
    expect(text(h, "br-oo-empty")).toBe(EN.noOpenOrders);
  });
  it("the status line clears on the next action in the list", async () => {
    const f = feedWith([LIMIT("41.00"), LIMIT("42.10")]);
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-3");
    await yes("o-3");
    await tick(f);
    expect(text(h, "br-oo-line")).not.toBe("");
    await key(inRow("o-4", "br-oo-cancel")!, "Tab");
    expect(text(h, "br-oo-line")).toBe("");
  });
});

/** `me` reports an injected IntentResult for our cancel while the order stays, with a new status (an engine may). */
class StaysFeed extends MockFeed {
  extra: Record<string, OpenOrder>;
  late: IntentResult[] = [];
  constructor(o: OpenOrder) { super({}, { tickMs: MANUAL_TICK_MS }); this.extra = { [o.orderId]: o }; }
  override cancel(orderId: string): string {
    const id = super.cancel(orderId);
    this.late.push({ intentId: id, tick: 0, status: "ACCEPTED", effects: [] } as IntentResult);
    return id;
  }
  override body(ch: Parameters<MockFeed["body"]>[0]): unknown {
    const b = super.body(ch);
    if (ch !== "me") return b;
    const me = b as MeTradingBody;
    return { ...me, orders: { ...me.orders, ...this.extra }, intents: me.intents.filter((i) => !this.late.some((l) => l.intentId === i.intentId)).concat(this.lateNow(me)) };
  }
  private lateNow(me: MeTradingBody): IntentResult[] {
    return me.intents.some((i) => this.late.some((l) => l.intentId === i.intentId)) ? this.late.map((l) => ({ ...l, tick: me.intents.at(-1)!.tick })) : [];
  }
}
const oo = (o: Partial<OpenOrder> & Pick<OpenOrder, "orderId">): OpenOrder =>
  ({ assetId: "HALC", side: "BUY", type: "limit", qty: "40", filled: "0", limit: "42.10", tif: "day", status: "WORKING", avgPrice: "0.00", placedTick: 1, ...o });

describe("BR-6-06 ACCEPTED with the order still open", () => {
  it("the row stays, idle, and shows the server's new status (statusText)", async () => {
    const f = new StaysFeed(oo({ orderId: "o-90" }));
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-90");
    await yes("o-90");
    expect(q(h, "br-oo-cancelling")).not.toBeNull();
    f.extra = { "o-90": oo({ orderId: "o-90", status: "PARTIAL", filled: "18" }) };
    await tick(f);
    expect(rowIds()).toEqual(["o-90"]);
    expect(q(h, "br-oo-cancelling")).toBeNull();
    expect(inRow("o-90", "br-oo-cancel")).not.toBeNull();
    expect(inRow("o-90", "br-oo-status")!.textContent).toBe(EN.s.PARTIAL);
    expect(inRow("o-90", "br-oo-qty")!.textContent).toBe("18 / 40 filled");
    expect(text(h, "br-oo-line")).toBe("");
  });
});

/** QA #85 Q2: a row follows `status` and `filled` changes for an existing orderId (no memo by id). */
describe("Q2 rows follow status / filled for the same id", () => {
  it("WORKING 0 -> PARTIAL 18 -> PARTIAL 30 re-renders the same row", async () => {
    const f = new StaysFeed(oo({ orderId: "o-90" }));
    await mount(h, { context: "HALC", feed: f });
    expect(inRow("o-90", "br-oo-qty")!.textContent).toBe("40");
    f.extra = { "o-90": oo({ orderId: "o-90", status: "PARTIAL", filled: "18" }) };
    await tick(f);
    expect(inRow("o-90", "br-oo-status")!.textContent).toBe(EN.s.PARTIAL);
    expect(inRow("o-90", "br-oo-qty")!.textContent).toBe("18 / 40 filled");
    expect(row("o-90").dataset.status).toBe("PARTIAL");
    f.extra = { "o-90": oo({ orderId: "o-90", status: "PARTIAL", filled: "30" }) };
    await tick(f);
    expect(inRow("o-90", "br-oo-qty")!.textContent).toBe("30 / 40 filled");
    expect(row("o-90").getAttribute("aria-label")).toBe(`${EN.buy} 30 / 40 filled HALC, Limit 42.10, ${EN.s.PARTIAL}`);
  });
});

describe("BR-6-07 reject", () => {
  it("?cancelReject=MKT_X: row stays idle with the alert; the next Cancel press clears it", async () => {
    const f = feedWith([LIMIT("42.10")], { cancelReject: "MKT_X" });
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-2");
    await yes("o-2");
    await tick(f);
    expect(rowIds()).toEqual(["o-2"]);
    const note = inRow("o-2", "br-oo-note")!;
    expect(note.getAttribute("role")).toBe("alert");
    expect(note.textContent).toBe(EN.cancelRejectedCode("MKT_X"));
    expect(note.textContent).toBe("Cancel refused (code MKT_X)");
    expect(inRow("o-2", "br-oo-cancel")).not.toBeNull();
    await openConfirm("o-2");
    expect(inRow("o-2", "br-oo-note")).toBeNull();
  });
  it("a mapped code shows its r.* line", async () => {
    const f = feedWith([LIMIT("42.10")], { cancelReject: "MKT_HALTED" });
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-2");
    await yes("o-2");
    await tick(f);
    expect(text(h, "br-oo-note")).toBe(EN.r.MKT_HALTED);
  });
  it("params fill the r.* slots like card 4; unknown codes go verbatim", () => {
    const t = { ...EN, r: { ...EN.r, MKT_SLOT: "Wait {n} ticks." } };
    expect(cancelRejectCopy(t, "MKT_SLOT", { n: "3" })).toBe("Wait 3 ticks.");
    expect(cancelRejectCopy(EN, "MKT_Z9", { n: "3" })).toBe("Cancel refused (code MKT_Z9)");
  });
  it("a bad transport reply: idle + \"Couldn't send. Try again.\"", async () => {
    class BadDoor extends MockFeed {
      override orderDoor() { const d = super.orderDoor(); return { ...d, cancel: () => 42 as unknown as string }; }
    }
    const f = new BadDoor({}, { tickMs: MANUAL_TICK_MS });
    f.submit(LIMIT("42.10"));
    f.advance();
    await mount(h, { context: "HALC", feed: f });
    await openConfirm("o-2");
    await yes("o-2");
    await wait(0);
    expect(text(h, "br-oo-note")).toBe(EN.cancelSendFailed);
    expect(inRow("o-2", "br-oo-cancel")).not.toBeNull();
  });
});

describe("BR-6-12 FR", () => {
  it("NNBSP before ? and :, «…» around the code, ’", async () => {
    const f = feedWith([LIMIT("42.10")], { cancelReject: "MKT_X" });
    await mount(h, { context: "HALC", feed: f, locale: "fr" });
    const c = inRow("o-2", "br-oo-cancel")!;
    expect(c.textContent).toBe("Annuler");
    expect(c.getAttribute("aria-label")).toBe(`Annuler l’ordre${NNBSP}: Achat 40 HALC, ${FR.termsLimit("42,10")}`);
    await openConfirm("o-2");
    expect(text(h, "br-oo-ask")).toBe(`Annuler cet ordre${NNBSP}?`);
    expect(inRow("o-2", "br-oo-keep")!.textContent).toBe("Conserver l’ordre");
    await yes("o-2");
    expect(text(h, "br-oo-cancelling")).toMatch(/^Annulation… · tick \d+$/);
    await tick(f);
    expect(text(h, "br-oo-note")).toBe(`Annulation refusée (code «${NNBSP}MKT_X${NNBSP}»)`);
    expect(FR.cancelled("Achat", "40", "HALC", "x")).toBe(`Ordre annulé${NNBSP}: Achat 40 HALC, x`);
  });
});
