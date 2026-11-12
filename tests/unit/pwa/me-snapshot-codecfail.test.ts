// M2-05 B1: the lazy snapshot codec chunk can fail to load (flaky network while signing in). Cleanup of a record that
// is not provably the signed-in account's must not depend on that chunk; a failed load is retried; nothing of another
// account survives, and a newer own ledger that could not be saved never leaves an older one looking current.
// Control point: the codec module import (fails while `failLoads` > 0).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { BrokerLedgerView } from "@/market/brokerLedger";

let failLoads = 0;
// Registered per test (vi.doMock after vi.resetModules) so a codec loaded in one test is never reused by the next.
const mockCodec = () => vi.doMock("@/pwa/meSnapshotCodec", async () => {
  if (failLoads > 0) { failLoads--; throw new Error("ChunkLoadError"); }
  return await vi.importActual<typeof import("@/pwa/meSnapshotCodec")>("@/pwa/meSnapshotCodec");
});

const A = `acc_${"a".repeat(32)}`, B = `acc_${"b".repeat(32)}`, KEY = "quay.offline.me.v1";
const recordOf = (acct: string, cash: number, asset = "HALC") => JSON.stringify({ v: 1, acct, savedAt: 1, tick: 27700, cash, held: 0, positions: [{ asset, qty: "5", avgCost: "42.18" }], orders: [] });
const ledger = (cashCents: number, asset: string): BrokerLedgerView => ({ tick: 27701, cashCents, reservedCashCents: 0, positions: { [asset]: { assetId: asset, qty: "1", avgCost: "10.00" } }, orders: {}, fills: [], intents: [], coins: [] });

let mem: Map<string, string>;
let removeThrows = false, setThrows = false;
beforeEach(() => {
  vi.resetModules();
  mockCodec();
  failLoads = 0; removeThrows = false; setThrows = false;
  mem = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { if (setThrows) throw new Error("QuotaExceededError"); mem.set(k, v); },
    removeItem: (k: string) => { if (removeThrows) throw new Error("SecurityError"); mem.delete(k); },
  });
});
const load = () => import("@/pwa/meSnapshot");
const html = readFileSync(new URL("../../../public/offline.html", import.meta.url), "utf8");
const pageRead = new Function(`${html.slice(html.indexOf("/* snapshot-reader:start"), html.indexOf("/* snapshot-reader:end */"))}; return readSnapshot;`)() as (t: string | null) => unknown;
const offlineShows = () => pageRead(mem.get(KEY) ?? null) as { acct: string; cash: number } | null;

describe("codec chunk fails to load", () => {
  it("A's record kept after a network-error boot; B signs in while the chunk fails: A is gone at once, never shown offline", async () => {
    mem.set(KEY, recordOf(A, 999));
    failLoads = 99;
    const m = await load();
    m.snapshotUnknown();
    const signedIn = m.snapshotSignedIn(B);
    expect(mem.has(KEY)).toBe(false); // before any codec step
    await signedIn;
    expect(await m.saveMeSnapshot(B, ledger(1_000_000, "MRDN"))).toBe(false);
    expect(offlineShows()).toBeNull();
  });

  it("recovery: the failed load is retried by the next step and B's own snapshot is written", async () => {
    failLoads = 1;
    const m = await load();
    await m.snapshotSignedIn(B); // its codec step fails (the one failing load)
    expect(await m.saveMeSnapshot(B, ledger(222, "MRDN"))).toBe(true); // retried: loads now
    expect(offlineShows()).toMatchObject({ acct: B, cash: 222 });
  });

  it("an own save that cannot load the chunk removes the older own record (no outdated 'last update')", async () => {
    mem.set(KEY, recordOf(A, 100));
    failLoads = 99;
    const m = await load();
    await m.snapshotSignedIn(A);
    expect(mem.get(KEY)).toBe(recordOf(A, 100)); // provably A's: kept for A's offline screen
    expect(await m.saveMeSnapshot(A, ledger(555, "HALC"))).toBe(false);
    expect(mem.has(KEY)).toBe(false);
  });

  it("logout while the chunk fails: the record goes synchronously", async () => {
    mem.set(KEY, recordOf(A, 100));
    failLoads = 99;
    const m = await load();
    void m.snapshotSignedIn(A);
    m.snapshotSignedOut();
    expect(mem.has(KEY)).toBe(false);
  });

  it("late queued A save, then B signs in, then the chunk recovers: only B's record exists", async () => {
    failLoads = 1;
    const m = await load();
    void m.snapshotSignedIn(A); // fails to load
    const lateA = m.saveMeSnapshot(A, ledger(111, "HALC")); // queued as A; runs after the switch
    void m.snapshotSignedIn(B);
    const savedB = m.saveMeSnapshot(B, ledger(222, "MRDN"));
    expect([await lateA, await savedB]).toEqual([false, true]);
    expect(offlineShows()).toMatchObject({ acct: B, cash: 222 });
    expect(mem.get(KEY)).not.toContain("HALC");
  });

  it("malformed, foreign or spoofed records are deleted at sign-in without the chunk", async () => {
    failLoads = 99;
    const spoof = recordOf(B, 1).replace(/}$/, `,"acct":"${A}"}`); // starts as B's, JSON.parse would read A
    for (const bad of ["{broken", "", recordOf(A, 1), ` ${recordOf(B, 1)}`, spoof, JSON.stringify({ acct: B, v: 1 })]) {
      vi.resetModules(); mockCodec();
      mem.set(KEY, bad);
      const m = await load();
      void m.snapshotSignedIn(B);
      expect(mem.has(KEY), JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
  });

  it("failed cleanup: removeItem throws, so the record is blanked and reads as no snapshot; if storage refuses both, nothing throws", async () => {
    mem.set(KEY, recordOf(A, 999));
    removeThrows = true;
    failLoads = 99;
    const m = await load();
    void m.snapshotSignedIn(B);
    expect(mem.get(KEY)).toBe("");
    expect(offlineShows()).toBeNull();
    mem.set(KEY, recordOf(A, 999));
    setThrows = true;
    expect(() => m.snapshotSignedOut()).not.toThrow(); // storage refuses every write: documented limit
  });
});
