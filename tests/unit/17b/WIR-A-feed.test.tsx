// @vitest-environment happy-dom
// UI card 1 WIR-A Feed (DOM): bands / priced-in (WIR-1-03), source record (WIR-1-04), breaking strip (WIR-1-05),
// held-back inserts + "{n} new" pill (WIR-1-06) and the channel states (WIR-1-07). e2e covers the same in a browser.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Feed } from "@/apps/wire/Feed";
import { EN, FR } from "@/apps/wire/strings";
import type { NewsBody } from "@/shell/contracts/channels";
import { MockFeed, START_TICK } from "@/shell/contracts/mockFeed";
import type { ChannelView } from "@/shell/contracts/useChannel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bodyAfter = (ticks: number, tier: "free" | "terminal" = "free"): NewsBody => {
  const f = new MockFeed({ tier }, { autoStart: false });
  for (let i = 0; i < ticks; i++) f.advance();
  return f.body("news") as NewsBody;
};
const live = (body: NewsBody): ChannelView<NewsBody> => ({ state: "live", body, tick: 1 });

let root: Root | null = null;
let el: HTMLElement;
async function render(view: ChannelView<NewsBody>, t = EN) {
  if (!root) { el = document.createElement("div"); document.body.append(el); root = createRoot(el); }
  await act(async () => { root!.render(createElement(Feed, { view, t })); });
  return el;
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; el?.remove(); });
const row = (id: string) => el.querySelector<HTMLElement>(`[data-testid=wire-row][data-id="${id}"]`)!;
const rowIds = () => [...el.querySelectorAll<HTMLElement>("[data-testid=wire-row]")].map((r) => r.dataset.id);

describe("WIR-1-03 priced-in", () => {
  it("terminal: band chip + 'as of' on non-FILING rows; free: nothing in the DOM; never a %", async () => {
    await render(live(bodyAfter(0, "terminal")));
    expect(row("n-1").querySelector("[data-testid=wire-priced-band]")!.textContent).toBe("Mid");
    expect(row("n-4").querySelector("[data-testid=wire-priced-band]")!.textContent).toBe("Early"); // breaking
    expect(row("n-1").querySelector("[data-testid=wire-asof]")!.textContent).toMatch(/^as of Day \d+ · \d\d:\d\d$/);
    expect(row("n-3").querySelector("[data-testid=wire-priced]")).toBeNull(); // FILING
    expect(el.textContent).not.toMatch(/\d+\s?%/);
    await act(async () => root!.unmount()); root = null;
    await render(live(bodyAfter(0, "free")));
    expect(el.querySelectorAll("[data-testid=wire-priced], [data-testid=wire-asof]")).toHaveLength(0);
    expect(el.textContent).not.toMatch(/\d+\s?%/);
  });
});

describe("WIR-1-04 source record", () => {
  it("n-2 3/7 Mixed; rotation STATEMENT 9/10 Solid; n-1 neither", async () => {
    await render(live(bodyAfter(12)));
    expect(row("n-2").querySelector("[data-testid=wire-record]")!.textContent).toBe("Source record 3/7");
    expect(row("n-2").querySelector("[data-testid=wire-band]")!.textContent).toBe("Mixed");
    const st = row(`n-t${START_TICK + 12}`);
    expect(st.dataset.kind).toBe("STATEMENT");
    expect(st.querySelector("[data-testid=wire-record]")!.textContent).toBe("Source record 9/10");
    expect(st.querySelector("[data-testid=wire-band]")!.textContent).toBe("Solid");
    expect(row("n-1").querySelector("[data-testid=wire-record], [data-testid=wire-band]")).toBeNull();
    expect(el.textContent).not.toMatch(/0\.\d/); // never a 0–1 score
  });
});

describe("WIR-1-05 breaking strip", () => {
  it("shows n-4 with 'Breaking'; absent when nothing is breaking", async () => {
    const b = bodyAfter(0);
    await render(live(b));
    const strip = el.querySelector<HTMLElement>("[data-testid=wire-breaking]")!;
    expect(strip.dataset.id).toBe("n-4");
    expect(strip.textContent).toContain("Breaking");
    expect(strip.textContent).toContain("Block trade: 50,000 KILN");
    await act(async () => root!.unmount()); root = null;
    await render(live({ items: b.items.map((i) => ({ ...i, breaking: false })) }));
    expect(el.querySelector("[data-testid=wire-breaking]")).toBeNull();
  });
});

describe("WIR-1-06 inserts", () => {
  it("at the top a new item inserts (animated); scrolled down it is held back behind '1 new' until tapped", async () => {
    await render(live(bodyAfter(0)));
    expect(rowIds()).toEqual(["n-4", "n-3", "n-2", "n-1"]);
    expect(el.querySelector(".is-new")).toBeNull(); // first snap never animates
    await render(live(bodyAfter(12)));
    expect(rowIds()[0]).toBe(`n-t${START_TICK + 12}`);
    expect(row(`n-t${START_TICK + 12}`).classList.contains("is-new")).toBe(true);

    const list = el.querySelector<HTMLElement>("[data-testid=wire-list]")!;
    list.scrollTop = 120;
    await act(async () => { list.dispatchEvent(new Event("scroll")); });
    await render(live(bodyAfter(24)));
    expect(rowIds()).toHaveLength(5); // held back: rows never move
    const pill = el.querySelector<HTMLButtonElement>("[data-testid=wire-new-pill]")!;
    expect(pill.textContent).toBe("1 new");
    expect(pill.parentElement!.getAttribute("aria-live")).toBe("polite");
    expect(el.querySelectorAll("[aria-live]")).toHaveLength(1);
    await act(async () => { pill.click(); });
    expect(list.scrollTop).toBe(0);
    expect(rowIds()[0]).toBe(`n-t${START_TICK + 24}`);
    expect(el.querySelector("[data-testid=wire-new-pill]")).toBeNull();
  });
});

describe("WIR-1-07 states", () => {
  it.each([
    [{ state: "loading", body: null, tick: null }, "wire-loading", ""],
    [{ state: "denied", body: null, tick: null }, "wire-denied", "Wire isn't available on this account."],
    [{ state: "error", body: null, tick: null }, "wire-error", "Couldn't load · Retry"],
    [{ state: "live", body: { items: [] }, tick: 1 }, "wire-empty", "Nothing in this filter yet."],
  ] as [ChannelView<NewsBody>, string, string][])("%o", async (view, id, copy) => {
    await render(view);
    const n = el.querySelector(`[data-testid=${id}]`)!;
    expect(n).not.toBeNull();
    if (copy) expect(n.textContent).toBe(copy);
    if (view.state === "loading") expect(el.querySelectorAll("[data-testid=wire-skeleton]")).toHaveLength(3);
    if (view.state === "error") expect(el.querySelector("[data-testid=wire-retry]")!.textContent).toBe("Retry");
  });

  it("stale keeps the list and adds 'Updating…' under the filters", async () => {
    await render({ state: "stale", body: bodyAfter(0), tick: 1 });
    expect(rowIds()).toHaveLength(4);
    const u = el.querySelector("[data-testid=wire-updating]")!;
    expect(u.textContent).toBe("Updating…");
    expect(u.previousElementSibling!.className).toBe("wire-filters");
  });

  it("an empty filter shows its copy; FR strings render", async () => {
    await render(live(bodyAfter(0)), FR);
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=wire-filter-verdicts]")!.click(); });
    expect(el.querySelector("[data-testid=wire-empty]")!.textContent).toBe("Rien dans ce filtre pour l'instant.");
    expect(el.querySelector("[data-testid=wire-filter-verdicts]")!.getAttribute("aria-checked")).toBe("true");
  });
});
