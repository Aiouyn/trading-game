// @vitest-environment happy-dom
// M1-10: the static district view. Its 8 districts are the content of record (packages/content/data/districts.json)
// and the approved reference seed's centres / landmark names (generate-city.ts); it opens on the Financial Mile, says
// it is read-only, shows no money or actions besides picking a district and Back to Broker, and makes no request.
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DistrictView from "@/apps/city/DistrictView";
import { BAY, DISTRICTS, FIRST_DISTRICT } from "@/apps/city/districts";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";
import { DISTRICTS as SEED } from "../../e2e/city/fixtures/generate-city";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { distId: string; cityId: string; name: string; landmarkId: string; landmarkBrief: string };
const content = (JSON.parse(readFileSync("packages/content/data/districts.json", "utf8")) as { districts: Row[] }).districts.filter((d) => d.cityId === "cty_port_avalon");

describe("M1-10 district data: no drift from the content of record or the reference seed", () => {
  it("the same 8 Port Avalon districts, names, landmark ids and briefs as districts.json", () => {
    expect(DISTRICTS.map((d) => d.distId).sort()).toEqual(content.map((d) => d.distId).sort());
    for (const d of DISTRICTS) {
      const c = content.find((x) => x.distId === d.distId)!;
      expect([d.name, d.landmarkId, d.brief]).toEqual([c.name, c.landmarkId, c.landmarkBrief]);
    }
  });
  it("centres and landmark names are the reference seed's; the bay is the seed's circle", () => {
    for (const s of SEED) {
      const d = DISTRICTS.find((x) => x.distId === `dst_port_avalon_${s.slug}`)!;
      expect([d.center, d.landmarkId, d.landmark]).toEqual([s.center, ...s.landmark]);
    }
    expect(readFileSync("tests/e2e/city/fixtures/generate-city.ts", "utf8")).toContain(`Math.hypot(x - ${BAY.cx}, z - ${BAY.cz}) < ${BAY.r}`);
    expect(FIRST_DISTRICT).toBe("dst_port_avalon_financial_mile");
  });
});

describe("M1-10 DistrictView", () => {
  let el: HTMLDivElement;
  let root: Root;
  beforeEach(() => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); });
  afterEach(async () => { await act(async () => root.unmount()); el.remove(); vi.restoreAllMocks(); });
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  async function mount(vw = 1440) {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setViewport(vw, 900);
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(DistrictView))); });
    return store;
  }

  it("opens on the Financial Mile: name, read-only status, landmark; no money, prices or owners; no request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await mount();
    expect(q("city")!.dataset.district).toBe("dst_port_avalon_financial_mile");
    expect(q("dv-name")!.textContent).toBe("Financial Mile");
    expect(q("dv-readonly")!.textContent).toBe("Read-only view. Nothing here can be bought or changed.");
    expect(q("dv-landmark")!.textContent).toBe("Landmark: Port Avalon Exchange Building");
    expect(q("dv-brief")!.textContent).toBe("Columned hall of the exchange (CBD).");
    expect(el.textContent).not.toMatch(/[$€£]|\d+\.\d\d|owner|for sale|auction|buy now/i);
    expect(el.querySelectorAll("canvas")).toHaveLength(0);
    // Controls: 8 district buttons + Back to Broker, nothing else.
    expect([...el.querySelectorAll("button")].map((b) => b.dataset.testid)).toEqual([...Array(8).fill("dv-pick"), "dv-back"]);
    expect(el.querySelectorAll("input, select, textarea, a[href]")).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("picking a district shows its landmark and marks it (button pressed, map marker on); markers are not a second control", async () => {
    await mount();
    const pick = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid="dv-pick"][data-id="${id}"]`)!;
    expect(pick(FIRST_DISTRICT).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { pick("dst_port_avalon_old_harbor").click(); });
    expect(q("dv-name")!.textContent).toBe("Old Harbor");
    expect(q("dv-landmark")!.textContent).toBe("Landmark: Old Harbor Lighthouse");
    expect(q("dv-brief")!.textContent).toBe("The first light of the bay.");
    expect(pick("dst_port_avalon_old_harbor").getAttribute("aria-pressed")).toBe("true");
    expect(pick(FIRST_DISTRICT).getAttribute("aria-pressed")).toBe("false");
    expect([...el.querySelectorAll('[data-testid="dv-marker"][data-on]')].map((m) => m.getAttribute("data-id"))).toEqual(["dst_port_avalon_old_harbor"]);
    for (const m of el.querySelectorAll('[data-testid="dv-marker"]')) expect(m.getAttribute("aria-hidden")).toBe("true");
    expect(q("dv-map")!.getAttribute("role")).toBe("img");
  });

  it("Back to Broker brings this workspace's Broker to the front; opens one only when there is none", async () => {
    const store = await mount();
    store.getState().open("broker");
    store.getState().open("city");
    const open = vi.spyOn(store.getState(), "open");
    await act(async () => { q("dv-back")!.click(); });
    expect(open).not.toHaveBeenCalled();
    expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(1);
    expect(store.getState().local.windows.at(-1)!.app).toBe("broker");
    store.getState().close(store.getState().local.windows.find((w) => w.app === "broker")!);
    await act(async () => { q("dv-back")!.click(); });
    expect(store.getState().local.windows.filter((w) => w.app === "broker")).toHaveLength(1);
  });
});
