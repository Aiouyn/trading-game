// @vitest-environment happy-dom
// Trend lines vs the device store when a read fails and when two tabs of one account edit (gatekeeper B1, B2 at
// 10e61bf5). The device is modelled with IndexedDB's own semantics and no merging of its own: a key holds one value,
// put replaces it; a readwrite transaction that reads then writes a key runs alone (the browser never interleaves two
// readwrite transactions on one store, across tabs too). Every merge seen here is the product's, run inside that
// transaction. Each "tab" is a fresh copy of the store module (its own memory), sharing the one device.
// Real Chromium IndexedDB, two real tabs: tests/e2e/17b/broker-trendline-storage.spec.ts.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trendline } from "@/components/market/trendlines";

const device = vi.hoisted(() => ({ kept: new Map<string, unknown>(), failReads: 0, failWrites: 0, writes: 0 }));
vi.mock("@/shell/persist", () => {
  const key = (s: string) => `quay.${s}.drawings`;
  const copy = (v: unknown) => (v === undefined ? null : structuredClone(v));
  return {
    loadDrawings: async (s: string) => {
      if (device.failReads > 0) { device.failReads -= 1; throw new DOMException("read failed", "UnknownError"); }
      return copy(device.kept.get(key(s)));
    },
    // 10e61bf5's writer: put(value, key), the whole value replaced.
    queueDrawings: async (s: string, v: unknown) => { device.writes += 1; device.kept.set(key(s), copy(v)); },
    // One readwrite transaction: get, the caller's change, put; nothing else runs in between. A failed write keeps the old value.
    updateDrawings: async (s: string, change: (stored: unknown) => unknown) => {
      if (device.failWrites > 0) { device.failWrites -= 1; throw new DOMException("write failed", "QuotaExceededError"); }
      const next = copy(change(copy(device.kept.get(key(s)))));
      device.writes += 1; device.kept.set(key(s), next);
      return copy(next);
    },
  };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Store = typeof import("@/components/market/trendlines");
const L = (id: string, t: number, p = 10): Trendline => ({ id, a: { t, p }, b: { t: t + 5, p: p + 1 } });
const tick = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0)); });
/** A new tab (or a reload): its own module memory, the same device. */
async function tab(): Promise<Store> { vi.resetModules(); return await import("@/components/market/trendlines"); }
/** What the chart for (scope, asset) shows once the read has settled: the lines, or null (no lines, no tool). */
async function shown(s: Store, scope: string, asset: string): Promise<readonly Trendline[] | null> {
  const r = createRoot(document.createElement("div"));
  let seen: readonly Trendline[] | null = null;
  const P = () => { seen = s.useTrendlines(scope, asset); return null; };
  await act(async () => { r.render(createElement(P)); });
  await tick();
  await act(async () => { r.render(createElement(P)); });
  await act(async () => r.unmount());
  return seen;
}
const kept = (scope: string) => device.kept.get(`quay.${scope}.drawings`);
const ids = (l: readonly Trendline[] | null) => (l ?? []).map((x) => x.id);

beforeEach(() => { device.kept.clear(); device.failReads = 0; device.failWrites = 0; device.writes = 0; });

describe("B1: a failed read is not an empty device", () => {
  it("a failed read shows no lines and no tool, writes nothing; drawing elsewhere cannot erase the kept lines", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100), L("l2", 200)], MRDN: [L("l1", 300)] });
    const t = await tab();
    device.failReads = 1;
    expect(await shown(t, "accA", "HALC")).toBeNull(); // not [] with the tool on
    expect(t.trendStatus("accA")).toBe("error");
    t.setTrendlines("accA", "VRDN", [L("l1", 400)]); // whatever a page tries while unread
    await tick();
    expect(device.writes).toBe(0);
    const reload = await tab();
    expect(await shown(reload, "accA", "HALC")).toEqual([L("l1", 100), L("l2", 200)]);
    expect(await shown(reload, "accA", "MRDN")).toEqual([L("l1", 300)]);
  });

  it("Retry reads again; then a new line on another asset keeps every kept line", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100), L("l2", 200)], MRDN: [L("l1", 300)] });
    const t = await tab();
    device.failReads = 1;
    expect(await shown(t, "accA", "VRDN")).toBeNull();
    t.retryTrendlines("accA");
    expect(await shown(t, "accA", "VRDN")).toEqual([]);
    expect(t.trendStatus("accA")).toBe("ready");
    const v = L(t.newLineId([]), 400);
    t.setTrendlines("accA", "VRDN", [v]);
    await tick();
    const reload = await tab();
    expect(await shown(reload, "accA", "HALC")).toEqual([L("l1", 100), L("l2", 200)]);
    expect(await shown(reload, "accA", "MRDN")).toEqual([L("l1", 300)]);
    expect(await shown(reload, "accA", "VRDN")).toEqual([v]);
  });

  it("a Retry that fails again stays unavailable (still nothing written)", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100)] });
    const t = await tab();
    device.failReads = 2;
    expect(await shown(t, "accA", "HALC")).toBeNull();
    t.retryTrendlines("accA");
    expect(await shown(t, "accA", "HALC")).toBeNull();
    expect(t.trendStatus("accA")).toBe("error");
    expect(kept("accA")).toEqual({ HALC: [L("l1", 100)] });
  });
});

describe("B2: two tabs of one account, each with its own stale copy", () => {
  it("tab A saves HALC, tab B (read before that) saves MRDN: both kept", async () => {
    const a = await tab(); expect(await shown(a, "accA", "HALC")).toEqual([]);
    const b = await tab(); expect(await shown(b, "accA", "MRDN")).toEqual([]);
    const la = L(a.newLineId([]), 100), lb = L(b.newLineId([]), 300);
    a.setTrendlines("accA", "HALC", [la]); await tick();
    b.setTrendlines("accA", "MRDN", [lb]); await tick();
    const reload = await tab();
    expect(await shown(reload, "accA", "HALC")).toEqual([la]);
    expect(await shown(reload, "accA", "MRDN")).toEqual([lb]);
  });

  it("same asset: each tab draws its own new line; both kept, ids distinct", async () => {
    const a = await tab(); await shown(a, "accA", "HALC");
    const b = await tab(); await shown(b, "accA", "HALC");
    const la = L(a.newLineId([]), 100), lb = L(b.newLineId([]), 300); // each tab sees an empty list
    expect(la.id).not.toBe(lb.id);
    a.setTrendlines("accA", "HALC", [la]); await tick();
    b.setTrendlines("accA", "HALC", [lb]); await tick();
    const reload = await tab();
    expect(await shown(reload, "accA", "HALC")).toEqual([la, lb]);
    expect(await shown(b, "accA", "HALC")).toEqual([la, lb]); // tab B now shows what the device keeps
  });

  it("same asset: A edits one line's end while B edits another; both edits kept", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100), L("l2", 200)] });
    const a = await tab(); await shown(a, "accA", "HALC");
    const b = await tab(); await shown(b, "accA", "HALC");
    const a1 = { ...L("l1", 100), b: { t: 120, p: 9 } }, b2 = { ...L("l2", 200), a: { t: 190, p: 12 } };
    a.setTrendlines("accA", "HALC", [a1, L("l2", 200)]); await tick();
    b.setTrendlines("accA", "HALC", [L("l1", 100), b2]); await tick();
    const reload = await tab();
    expect(await shown(reload, "accA", "HALC")).toEqual([a1, b2]);
  });

  it("a line deleted in A is not brought back by B's stale copy: not by B's other edits, not by B editing it", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100), L("l2", 200)] });
    const a = await tab(); await shown(a, "accA", "HALC");
    const b = await tab(); await shown(b, "accA", "HALC");
    const c = await tab(); await shown(c, "accA", "HALC");
    a.setTrendlines("accA", "HALC", [L("l2", 200)]); await tick(); // A deletes l1
    const b2 = { ...L("l2", 200), b: { t: 260, p: 8 } };
    b.setTrendlines("accA", "HALC", [L("l1", 100), b2]); await tick(); // B, still showing l1, edits l2
    expect(kept("accA")).toEqual({ HALC: [b2] });
    expect(ids(await shown(b, "accA", "HALC"))).toEqual(["l2"]); // B now shows the device's copy
    c.setTrendlines("accA", "HALC", [{ ...L("l1", 100), a: { t: 90, p: 9 } }, L("l2", 200)]); await tick(); // C, still showing l1, moves its end
    expect(kept("accA")).toEqual({ HALC: [b2] }); // not brought back; C's untouched l2 does not undo B's edit
    expect(await shown(c, "accA", "HALC")).toEqual([b2]);
  });

  it("the last line of an asset deleted in one tab while the other adds on another asset: neither undone", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100)] });
    const a = await tab(); await shown(a, "accA", "HALC");
    const b = await tab(); await shown(b, "accA", "MRDN");
    a.setTrendlines("accA", "HALC", []); await tick();
    const lb = L(b.newLineId([]), 300);
    b.setTrendlines("accA", "MRDN", [lb]); await tick();
    expect(kept("accA")).toEqual({ MRDN: [lb] });
  });
});

describe("a failed write is reported, not shown as kept", () => {
  it("the change is taken back to what the device keeps, and the chart says so until a later change is kept", async () => {
    device.kept.set("quay.accA.drawings", { HALC: [L("l1", 100)] });
    const t = await tab(); await shown(t, "accA", "HALC");
    device.failWrites = 1;
    t.setTrendlines("accA", "HALC", [L("l1", 100), L(t.newLineId([L("l1", 100)]), 200)]);
    await tick();
    expect(await shown(t, "accA", "HALC")).toEqual([L("l1", 100)]);
    expect(t.trendStatus("accA")).toBe("unsaved");
    expect(kept("accA")).toEqual({ HALC: [L("l1", 100)] });
    const n = L(t.newLineId([L("l1", 100)]), 300);
    t.setTrendlines("accA", "HALC", [L("l1", 100), n]); await tick();
    expect(t.trendStatus("accA")).toBe("ready");
    expect(kept("accA")).toEqual({ HALC: [L("l1", 100), n] });
  });

  it("two changes queued, the first not kept: the chart still says so after the second is kept", async () => {
    const t = await tab(); await shown(t, "accA", "HALC");
    device.failWrites = 1;
    const x = L(t.newLineId([]), 100), y = L(t.newLineId([x]), 200);
    t.setTrendlines("accA", "HALC", [x]);
    t.setTrendlines("accA", "HALC", [x, y]); // queued before the first settles
    await tick();
    expect(kept("accA")).toEqual({ HALC: [y] });
    expect(await shown(t, "accA", "HALC")).toEqual([y]);
    expect(t.trendStatus("accA")).toBe("unsaved");
  });
});

describe("isolation still holds through the transactional writer", () => {
  it("guest, A, B and assets stay apart across a reload; reading never writes", async () => {
    const t = await tab();
    await shown(t, "guest", "HALC"); await shown(t, "accA", "HALC"); await shown(t, "accA", "MRDN"); await shown(t, "accB", "HALC");
    t.setTrendlines("guest", "HALC", [L("g1", 100)]);
    t.setTrendlines("accA", "HALC", [L("a1", 200)]);
    t.setTrendlines("accA", "MRDN", [L("a2", 300)]);
    await tick();
    const reload = await tab();
    expect(await shown(reload, "guest", "HALC")).toEqual([L("g1", 100)]);
    expect(await shown(reload, "accA", "HALC")).toEqual([L("a1", 200)]);
    expect(await shown(reload, "accA", "MRDN")).toEqual([L("a2", 300)]);
    expect(await shown(reload, "guest", "MRDN")).toEqual([]);
    expect(await shown(reload, "accB", "HALC")).toEqual([]);
    expect(device.kept.has("quay.accB.drawings")).toBe(false);
  });
});
