// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Feed } from "@/apps/wire/Feed";
import { EN, FR } from "@/apps/wire/strings";
import type { NewsBody, WireItem } from "@/shell/contracts/channels";
import type { ChannelView } from "@/shell/contracts/useChannel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const story: WireItem = { id: "real-story", kind: "NEWS", headlineKey: "wire.news.earningsBeat", slots: { company: "Halcyon" }, entities: [{ id: "HALC", kind: "asset", label: "HALC" }], tick: 1, breaking: false, causeEventIds: ["cause-1"] };
const live = (items: WireItem[]): ChannelView<NewsBody> => ({ state: "live", body: { items }, tick: 1 });
let root: Root | null = null;
let el: HTMLDivElement;
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined }));
afterAll(() => { if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor); else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });
async function render(view: ChannelView<NewsBody>, t = EN, demo = false) {
  if (!root) { el = document.createElement("div"); document.body.append(el); root = createRoot(el); }
  await act(async () => root!.render(createElement(Feed, { view, t, demo })));
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; el?.remove(); });
const find = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function filter() { await act(async () => find("wire-filter-filings")!.click()); }

describe("Wire first-step recovery", () => {
  it("explains a whole empty live feed without inventing stories or offering a pointless reset", async () => {
    await render(live([]));
    expect(find("wire-empty")?.textContent).toBe(EN.empty);
    expect(find("wire-empty-help")?.textContent).toContain("Market stories appear as events happen.");
    expect(find("wire-empty-help")?.textContent).toContain("Broker");
    expect(find("wire-show-all")).toBeNull();
    expect(find("wire-list")).toBeNull();
  });
  it.each([{ t: EN, label: "Show all stories", help: "Try All to see the whole feed." }, { t: FR, label: "Afficher toutes les dépêches", help: "Essayez Tout pour voir le fil complet." }])("recovers an empty filter with actual All-radio focus ($label)", async ({ t, label, help }) => {
    await render(live([story]), t);
    await filter();
    expect(find("wire-empty-help")?.textContent).toContain(help);
    expect(find("wire-show-all")?.textContent).toBe(label);
    await act(async () => find("wire-show-all")!.click());
    expect(find("wire-filter-all")?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(find("wire-filter-all"));
    expect(find("wire-show-all")).toBeNull();
    expect([...el.querySelectorAll<HTMLElement>("[data-testid=wire-row]")].map(n => n.dataset.id)).toEqual([story.id]);
    expect(find("wire-empty-help")).toBeNull();
  });
  it("resetting an empty filter over a globally empty feed stays honestly empty", async () => {
    await render(live([])); await filter();
    await act(async () => find("wire-show-all")!.click());
    expect(document.activeElement).toBe(find("wire-filter-all"));
    expect(find("wire-empty-help")?.textContent).toContain("Market stories appear as events happen.");
    expect(find("wire-list")).toBeNull();
  });
  it("does not tell an empty guest example feed it is waiting on real market stories", async () => {
    await render(live([]), EN, true);
    expect(find("wire-empty")?.textContent).toBe(EN.empty);
    expect(find("wire-demo")).not.toBeNull();
    expect(find("wire-empty-help")).toBeNull();
  });
  it("offers the same filter recovery on labelled guest examples", async () => {
    await render(live([story]), EN, true); await filter();
    expect(find("wire-show-all")?.textContent).toBe("Show all stories");
    await act(async () => find("wire-show-all")!.click());
    expect(find("wire-demo")).not.toBeNull();
    expect(find("wire-row")).not.toBeNull();
  });
  it("a stale empty feed never claims to be live", async () => {
    await render({ state: "stale", body: { items: [] }, tick: 1 });
    expect(find("wire-updating")).not.toBeNull();
    expect(find("wire-empty-help")).not.toBeNull();
    expect(find("wire-empty-help")!.textContent).not.toMatch(/feed is live/i);
  });
  it.each(["loading", "denied", "error"] as const)("does not mask %s with recovery", async state => {
    await render({ state, body: null, tick: null });
    expect(find("wire-empty-help")).toBeNull();
    expect(find("wire-show-all")).toBeNull();
  });
});
