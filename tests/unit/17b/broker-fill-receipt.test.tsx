// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AckPanel, type AckPanelProps } from "@/apps/broker/TicketReview";
import { brStrings } from "@/apps/broker/strings";
import { speakMoney } from "@/components/shell/MoneyText";
import type { MyFill, Position } from "@/shell/contracts/channels";
const fill: MyFill = { fillId: "f1", tick: 1, assetId: "HALC", orderId: "o1", side: "BUY", qty: "3", price: "42.18", fee: "0.06", feeCcy: "FDL", liquidity: "TAKER", counterpartyKind: "NPC" };
const position: Position = { assetId: "HALC", qty: "3", avgCost: "42.18", mark: "43.00", value: "129.00", upl: "2.46", pledgedQty: "0", lentQty: "0" };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("Card7 receipt states", () => {
  let el: HTMLDivElement, root: Root;
  beforeEach(() => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); });
  afterEach(async () => { await act(async () => root.unmount()); el.remove(); });
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const render = async (props: Partial<AckPanelProps> = {}) => act(async () => {
    root.render(createElement(AckPanel, { t: brStrings("en"), locale: "en", ticker: "HALC", result: { intentId: "i1", tick: 1, status: "ACCEPTED", effects: ["fill:f1"] }, fill, position, stale: false, queued: false, resting: false, onNew: () => {}, onEdit: () => {}, ...props }));
  });
  it.each(["-19.37", "0.00", "123.45"])("formats the server's %s, not a browser calculation", async (upl) => {
    await render({ position: { ...position, upl } });
    expect(q("br-fill-pnl")!.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(speakMoney(upl));
    expect(q("br-fill-pnl")!.textContent).not.toContain("2.46");
    expect(q("br-fill-position")!.closest('[role="status"]')).toBeNull();
    expect(q("br-receipt")!.getAttribute("role")).toBe("status");
  });
  it("does not invent zero P&L when the position is absent, including a closing sell", async () => {
    await render({ position: null, fill: { ...fill, side: "SELL" } });
    expect(q("br-ack-title")!.textContent).toContain("Sold 3 HALC"); expect(q("br-fill-position")).toBeNull();
  });
  it.each(["PARTIAL", "QUEUED_NEXT"] as const)("does not turn %s into a completed fill", async (status) => {
    await render({ result: { intentId: "i1", tick: 1, status }, fill }); expect(q("br-fill-position")).toBeNull();
  });
  it("labels stale values as last known, in EN and FR", async () => {
    await render({ stale: true }); expect(q("br-fill-pnl")!.textContent).toContain("Last known unrealized P&L");
    await render({ stale: true, locale: "fr", t: brStrings("fr") });
    expect(q("br-fill-holding")!.textContent).toBe("Votre position : 3 HALC");
    expect(q("br-fill-pnl")!.textContent).toContain("Dernière plus-value ou moins-value latente connue");
  });
  it("New order calls only the existing handler", async () => {
    const onNew = vi.fn(); await render({ onNew }); await act(async () => q("br-new")!.click()); expect(onNew).toHaveBeenCalledTimes(1);
  });
});
