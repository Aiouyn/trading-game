// GK repro: A's record left on the device (unobserved expiry / network-error path keeps it). B signs in on the same
// profile and the lazy codec chunk fails to load once. Is A's record removed before B's offline screen can show it?
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/pwa/meSnapshotCodec", () => { throw new Error("ChunkLoadError"); });
const A = `acc_${"a".repeat(32)}`, B = `acc_${"b".repeat(32)}`, KEY = "quay.offline.me.v1";
let mem: Map<string, string>;
beforeEach(() => { vi.resetModules(); mem = new Map(); vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } }); });
describe("gk codec load failure on account switch", () => {
  it("A's snapshot must not survive B's sign-in", async () => {
    const aRec = JSON.stringify({ v: 1, acct: A, savedAt: 1, tick: 27700, cash: 999, held: 0, positions: [{ asset: "HALC", qty: "5", avgCost: "42.18" }], orders: [] });
    mem.set(KEY, aRec);
    const m = await import("@/pwa/meSnapshot");
    m.snapshotUnknown(); // boot network error: record kept (documented)
    await m.snapshotSignedIn(B);
    const saved = await m.saveMeSnapshot(B, { tick: 27701, cashCents: 1000000, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [] } as never);
    console.log("B save kept:", saved, "record now:", mem.get(KEY));
    expect(mem.get(KEY)).toBeUndefined(); // EXPECTED for no cross-account exposure
  });
});
