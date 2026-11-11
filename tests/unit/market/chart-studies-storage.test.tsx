// @vitest-environment happy-dom
// SMA / EMA choices on the device: per account (guest apart), their own record, read before shown, a failed read not
// taken for "all off", two tabs changing different overlays both kept, a failed write taken back and said, and the
// drawings and any other stored key never touched. The device is modelled with IndexedDB's own semantics (one value
// per key, put replaces; a readwrite read-then-write runs alone); every merge is the product's, inside that transaction.
// Each "tab" is a fresh copy of the store module, sharing the one device. Real browser: tests/e2e/17b/broker-sma-ema.spec.ts.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyPrefs } from "@/components/market/chartStudies";

const device = vi.hoisted(() => ({ kept: new Map<string, unknown>(), failReads: 0, failWrites: 0, writes: 0, held: [] as (() => void)[] }));
vi.mock("@/shell/persist", () => {
  const copy = (v: unknown) => (v === undefined ? null : structuredClone(v));
  const update = (key: string) => async (s: string, change: (stored: unknown) => unknown) => {
    if (device.failWrites > 0) { device.failWrites -= 1; throw new DOMException("write failed", "QuotaExceededError"); }
    const next = copy(change(copy(device.kept.get(key.replace("*", s)))));
    device.writes += 1; device.kept.set(key.replace("*", s), next);
    return copy(next);
  };
  return {
    loadChartPrefs: async (s: string) => {
      if (device.failReads > 0) { device.failReads -= 1; throw new DOMException("read failed", "UnknownError"); }
      return copy(device.kept.get(`quay.${s}.chart`));
    },
    updateChartPrefs: update("quay.*.chart"),
    loadDrawings: async (s: string) => copy(device.kept.get(`quay.${s}.drawings`)),
    updateDrawings: update("quay.*.drawings"),
  };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Store = typeof import("@/components/market/chartStudies");
const tick = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0)); });
async function tab(): Promise<Store> { vi.resetModules(); return await import("@/components/market/chartStudies"); }
/** What the page shows for this scope once the read settled: the choices, or null (no controls). */
async function shown(s: Store, scope: string | null): Promise<StudyPrefs | null> {
  const r = createRoot(document.createElement("div"));
  let seen: StudyPrefs | null = null;
  const P = () => { seen = s.useStudies(scope); return null; };
  await act(async () => { r.render(createElement(P)); });
  await tick();
  await act(async () => { r.render(createElement(P)); });
  await act(async () => r.unmount());
  return seen;
}
const OFF = { sma: { on: false, n: 20 }, ema: { on: false, n: 12 }, bb: { on: false, n: 20 }, vwap: { on: false, n: 720 }, rsi: { on: false, n: 14 } };

beforeEach(() => { device.kept.clear(); device.failReads = 0; device.failWrites = 0; device.writes = 0; });

describe("chart overlay choices on this device", () => {
  it("default both off (SMA 20, EMA 12); a choice comes back after a reload", async () => {
    const t = await tab();
    expect(await shown(t, "accA")).toEqual(OFF);
    t.setStudy("accA", "sma", { on: true, n: 50 });
    await tick();
    expect(await shown(await tab(), "accA")).toEqual({ ...OFF, sma: { on: true, n: 50 } });
  });

  it("accounts and the guest each have their own; nothing shows until the session's scope is known", async () => {
    const t = await tab();
    expect(await shown(t, null)).toBeNull();
    await shown(t, "accA"); await shown(t, "guest");
    t.setStudy("accA", "ema", { on: true, n: 26 });
    await tick();
    const r = await tab();
    expect(await shown(r, "guest")).toEqual(OFF);
    expect(await shown(r, "accB")).toEqual(OFF);
    expect((await shown(r, "accA"))?.ema).toEqual({ on: true, n: 26 });
  });

  it("a failed read shows no controls and writes nothing; Retry reads the kept choices", async () => {
    device.kept.set("quay.accA.chart", { sma: { on: true, n: 20 }, ema: { on: true, n: 26 } });
    const t = await tab();
    device.failReads = 1;
    expect(await shown(t, "accA")).toBeNull();
    expect(t.studiesStatus("accA")).toBe("error");
    t.setStudy("accA", "sma", { on: false, n: 20 });
    await tick();
    expect(device.writes).toBe(0);
    t.retryStudies("accA");
    expect(await shown(t, "accA")).toEqual({ ...OFF, sma: { on: true, n: 20 }, ema: { on: true, n: 26 } });
  });

  it("two tabs, each changing another overlay from the same stale copy: both kept", async () => {
    const a = await tab(); expect(await shown(a, "accA")).toEqual(OFF);
    const b = await tab(); expect(await shown(b, "accA")).toEqual(OFF);
    a.setStudy("accA", "sma", { on: true, n: 50 });
    b.setStudy("accA", "ema", { on: true, n: 26 });
    await tick();
    const want = { ...OFF, sma: { on: true, n: 50 }, ema: { on: true, n: 26 } };
    expect(device.kept.get("quay.accA.chart")).toEqual({ sma: { on: true, n: 50 }, ema: { on: true, n: 26 } }); // only what was set
    expect(await shown(await tab(), "accA")).toEqual(want);
    expect(b.studiesOf("accA")).toEqual(want); // the page adopts what the device kept
  });

  it("drawings, the other accounts and any other key in the record are never touched", async () => {
    const lines = { HALC: [{ id: "l1", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } }] };
    device.kept.set("quay.accA.drawings", lines);
    device.kept.set("quay.accB.chart", { sma: { on: true, n: 50 } });
    device.kept.set("quay.accA.chart", { later: { keep: 1 }, ema: { on: true, n: 12 } });
    const t = await tab(); await shown(t, "accA");
    t.setStudy("accA", "sma", { on: true, n: 20 });
    await tick();
    expect(device.kept.get("quay.accA.drawings")).toEqual(lines);
    expect(device.kept.get("quay.accB.chart")).toEqual({ sma: { on: true, n: 50 } });
    expect(device.kept.get("quay.accA.chart")).toEqual({ later: { keep: 1 }, ema: { on: true, n: 12 }, sma: { on: true, n: 20 } });
  });

  it("a write the device refused is taken back to the kept copy and said; the next one that keeps clears it", async () => {
    const t = await tab(); await shown(t, "accA");
    device.failWrites = 1;
    t.setStudy("accA", "sma", { on: true, n: 20 });
    expect(t.studiesOf("accA")?.sma.on).toBe(true); // shown at once
    await tick();
    expect(t.studiesOf("accA")).toEqual(OFF);
    expect(t.studiesStatus("accA")).toBe("unsaved");
    t.setStudy("accA", "ema", { on: true, n: 12 });
    await tick();
    expect(t.studiesStatus("accA")).toBe("ready");
    expect(device.kept.get("quay.accA.chart")).toEqual({ ema: { on: true, n: 12 } });
  });

  it("a broken or unknown stored entry is that overlay's default, not a made-up period", async () => {
    device.kept.set("quay.accA.chart", { sma: { on: true, n: 7 }, ema: "x", bb: { on: true, n: 30 }, rsi: { on: "yes", n: 14 } });
    expect(await shown(await tab(), "accA")).toEqual(OFF);
  });

  it("a record from before Bollinger / VWAP / RSI: those off; turning them on keeps SMA / EMA as stored", async () => {
    device.kept.set("quay.accA.chart", { sma: { on: true, n: 50 }, ema: { on: true, n: 26 } });
    const t = await tab();
    expect(await shown(t, "accA")).toEqual({ ...OFF, sma: { on: true, n: 50 }, ema: { on: true, n: 26 } });
    t.setStudy("accA", "bb", { on: true, n: 20 });
    t.setStudy("accA", "rsi", { on: true, n: 14 });
    t.setStudy("accA", "vwap", { on: true, n: 720 });
    t.setStudy("accA", "rsi", { on: true, n: 21 }); // not an offered period: refused, nothing written
    await tick();
    expect(device.kept.get("quay.accA.chart")).toEqual({ sma: { on: true, n: 50 }, ema: { on: true, n: 26 }, bb: { on: true, n: 20 }, rsi: { on: true, n: 14 }, vwap: { on: true, n: 720 } });
    expect(device.writes).toBe(3);
  });

  it("two tabs: one turns RSI on while the other turns SMA off, from the same stale copy: both kept", async () => {
    device.kept.set("quay.accA.chart", { sma: { on: true, n: 20 } });
    const a = await tab(); await shown(a, "accA");
    const b = await tab(); await shown(b, "accA");
    a.setStudy("accA", "rsi", { on: true, n: 14 });
    b.setStudy("accA", "sma", { on: false, n: 20 });
    await tick();
    expect(device.kept.get("quay.accA.chart")).toEqual({ sma: { on: false, n: 20 }, rsi: { on: true, n: 14 } });
  });
});
