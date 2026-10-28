// @vitest-environment happy-dom
// UI card 8: Recent fills. PF-8-04 rows are the MyFill strings after locale grouping, tick desc then fillId; PF-8-07
// liquidity words; PF-8-10/11 layout choice (table / 2 / 3 lines); PF-8-12 FR NNBSP and fillAria.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { byNewest, Fills, fillWords, type FillsLayout } from "@/apps/portfolio/Fills";
import { fillsLayout, OrdersView } from "@/apps/portfolio/Orders";
import type { MeTradingBody, MyFill } from "@/shell/contracts/channels";
import { MockFeed } from "@/shell/contracts/mockFeed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement, root: Root;
beforeEach(() => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); });
const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const NNBSP = "\u202F";

const fill = (o: Partial<MyFill>): MyFill => ({ fillId: "x-1", tick: 100, assetId: "HALC", orderId: "o-1", side: "BUY", qty: "40", price: "42.10", fee: "1.00", feeCcy: "FDL", liquidity: "TAKER", counterpartyKind: "NPC", ...o });
/** Out of order on purpose: ticks 100 / 300 / 300 / 200; at tick 300 "x-10" sorts before "x-9" (code units). */
const FILLS: MyFill[] = [
  fill({ fillId: "x-1", tick: 100 }),
  fill({ fillId: "x-9", tick: 300, assetId: "VOLT", side: "SELL", qty: "1250", price: "1234.5", fee: "12345.67", liquidity: "MAKER" }),
  fill({ fillId: "x-10", tick: 300, assetId: "AVB", qty: "3", price: "7.00", fee: "0.05", liquidity: "AUCTION" }),
  fill({ fillId: "x-4", tick: 200, side: "SELL", qty: "0.5", price: "99.999", fee: "0.10", feeCcy: "MDOL" }),
];
async function render(locale: string, layout: FillsLayout, fills: MyFill[] = FILLS) {
  await act(async () => { root.render(createElement(Fills, { locale, fills, layout })); });
}
const cells = (id: string) => qa(id).map((c) => c.textContent);

describe("PF-8-04 rows equal the MyFill strings, newest first", () => {
  it("byNewest: tick desc, then fillId by code unit", () => {
    expect([...FILLS].sort(byNewest).map((f) => f.fillId)).toEqual(["x-10", "x-9", "x-4", "x-1"]);
    expect(byNewest(fill({ fillId: "a" }), fill({ fillId: "a" }))).toBe(0);
    expect(byNewest(fill({ tick: 1 }), fill({ tick: 2 }))).toBe(1);
    expect(byNewest(fill({ tick: 2 }), fill({ tick: 1 }))).toBe(-1);
  });
  it("EN table: 7 column headers (scope col), a caption, every value the server's string regrouped", async () => {
    await render("en", { kind: "table" });
    const ths = [...el.querySelectorAll("thead th")];
    expect(ths.map((t) => [t.textContent, t.getAttribute("scope")])).toEqual(
      ["Side", "Asset", "Qty", "Price", "Fee", "Type", "Tick"].map((h) => [h, "col"]));
    expect(el.querySelector("caption")!.textContent).toBe("Recent fills, newest first");
    expect(el.querySelector("caption")!.className).toBe("sr-only");
    expect(qa("pf-fill").map((r) => r.dataset.fill)).toEqual(["x-10", "x-9", "x-4", "x-1"]);
    expect(cells("pf-fill-side")).toEqual(["↑ Buy", "↓ Sell", "↓ Sell", "↑ Buy"]);
    expect(cells("pf-fill-ticker")).toEqual(["AVB", "VOLT", "HALC", "HALC"]);
    expect(cells("pf-fill-qty")).toEqual(["3", "1,250", "0.5", "40"]);
    expect(cells("pf-fill-price")).toEqual(["7.00", "1,234.5", "99.999", "42.10"]);
    expect(cells("pf-fill-fee")).toEqual(["0.05 FDL", "12,345.67 FDL", "0.10 MDOL", "1.00 FDL"]);
    expect(cells("pf-fill-tick")).toEqual(["300", "300", "200", "100"]);
    expect(q("pf-fills-count")!.textContent).toBe("4");
    expect(q("pf-fills-help")!.textContent).toBe("Your latest trades. Older ones will appear in order history.");
  });
  it("rows are focusable and read as one sentence (fillAria, no arrows)", async () => {
    await render("en", { kind: "table" });
    const r = qa("pf-fill")[1]!;
    expect(r.tabIndex).toBe(0);
    expect(r.getAttribute("aria-label")).toBe("Sell 1,250 VOLT at 1,234.5, fee 12,345.67 FDL, Maker, tick 300");
  });
  it("PF-8-07 liquidity chips: Maker / Taker / Auction, neutral", async () => {
    await render("en", { kind: "table" });
    expect(cells("pf-fill-liq")).toEqual(["Auction", "Maker", "Taker", "Taker"]);
    expect(qa("pf-fill-liq").every((c) => c.classList.contains("chip") && c.classList.contains("pf-fill-liq"))).toBe(true);
  });
  it("from the mock: a market fill shows the fill's own strings (no recomputation)", async () => {
    const f = new MockFeed({}, { tickMs: 3_600_000 });
    f.submit({ assetId: "VOLT", side: "BUY", type: "market", qty: "10", tif: "day" });
    f.advance();
    const mf = (f.body("me") as MeTradingBody).fills.at(-1)!;
    await render("en", { kind: "table" }, [mf]);
    expect([cells("pf-fill-qty")[0], cells("pf-fill-price")[0], cells("pf-fill-fee")[0]]).toEqual([mf.qty, mf.price, `${mf.fee} ${mf.feeCcy}`]);
  });
});

describe("rows layout", () => {
  it("2 lines: side · ticker | chip / qty @ price | fee · tick", async () => {
    await render("en", { kind: "rows", lines: 2 });
    expect(q("pf-fills-table")).toBeNull();
    const r = qa("pf-fill")[0]!;
    expect(r.tagName).toBe("LI");
    expect([...r.querySelectorAll(":scope > .pf-fill-line")].map((l) => l.textContent)).toEqual(["↑ BuyAVBAuction", "3 @ 7.000.05 FDLtick 300"]);
    expect(q("pf-fills")!.dataset.layout).toBe("rows-2");
  });
  it("3 lines at text scale >= 1.5: fee and tick on their own line", async () => {
    await render("en", { kind: "rows", lines: 3 });
    const r = qa("pf-fill")[0]!;
    expect([...r.querySelectorAll(":scope > .pf-fill-line")].map((l) => l.textContent)).toEqual(["↑ BuyAVBAuction", "3 @ 7.00", "0.05 FDLtick 300"]);
    expect(r.getAttribute("aria-label")).toBe("Buy 3 AVB at 7.00, fee 0.05 FDL, Auction, tick 300");
  });
  it("empty: 'No trades yet.' and no list", async () => {
    await render("en", { kind: "rows", lines: 2 }, []);
    expect(q("pf-fills-empty")!.textContent).toBe("No trades yet.");
    expect(q("pf-fills-list")).toBeNull();
  });
  it("fillsLayout: table only on a wide desktop at text scale < 1.5", () => {
    expect(fillsLayout(false, false, true)).toEqual({ kind: "table" });
    expect(fillsLayout(false, false, false)).toEqual({ kind: "rows", lines: 2 });
    expect(fillsLayout(true, false, true)).toEqual({ kind: "rows", lines: 2 });
    expect(fillsLayout(false, true, true)).toEqual({ kind: "rows", lines: 3 });
    expect(fillsLayout(true, true, false)).toEqual({ kind: "rows", lines: 3 });
  });
});

describe("PF-8-12 FR", () => {
  it("grouped numbers use NNBSP, fee and side in FR, fillAria in FR with NNBSP before ':'", async () => {
    await render("fr", { kind: "table" });
    expect([...el.querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Sens", "Actif", "Qté", "Cours", "Frais", "Type", "Tick"]);
    const volt = qa("pf-fill")[1]!;
    expect(volt.querySelector('[data-testid="pf-fill-qty"]')!.textContent).toBe(`1${NNBSP}250`);
    expect(volt.querySelector('[data-testid="pf-fill-price"]')!.textContent).toBe(`1${NNBSP}234,5`);
    expect(volt.querySelector('[data-testid="pf-fill-fee"]')!.textContent).toBe(`12${NNBSP}345,67 FDL`);
    expect(volt.querySelector('[data-testid="pf-fill-side"]')!.textContent).toBe("↓ Vente");
    expect(cells("pf-fill-liq")).toEqual(["Enchère", "Apporteur", "Preneur", "Preneur"]);
    expect(volt.getAttribute("aria-label")).toBe(`Vente 1${NNBSP}250 VOLT à 1${NNBSP}234,5, frais${NNBSP}: 12${NNBSP}345,67 FDL, Apporteur, tick 300`);
  });
  it("fillWords: tick is never grouped", () => {
    expect(fillWords("fr", fill({ tick: 27700 })).tick).toBe("27700");
  });
});

describe("OrdersView passes the layout through", () => {
  it("live + wide desktop: table; narrow: 2 lines", async () => {
    const f = new MockFeed({}, { tickMs: 3_600_000 });
    const body = { ...(f.body("me") as MeTradingBody), fills: FILLS };
    const view = (wide: boolean) => createElement(OrdersView, { me: { state: "live", body, tick: 1 }, locale: "en", phone: false, big: false, wide, onRetry: () => {} });
    await act(async () => { root.render(view(true)); });
    expect(q("pf-fills")!.dataset.layout).toBe("table");
    await act(async () => { root.render(view(false)); });
    expect(q("pf-fills")!.dataset.layout).toBe("rows-2");
  });
});
