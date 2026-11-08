// M2-05: the snapshot codec loads lazily (src/pwa/meSnapshot.ts). This holds the codec chunk load open at the module
// boundary (the only control point), queues A's work behind it, then signs out / switches account and only then lets
// the chunk arrive. A's queued save must not write or restore anything after A signed out, and B's record stays B's.
// Same account signing out and back in: a save queued in the earlier session is A's own data; it may run, but the
// next save of the new session (queued after it) is what remains, and right after the sign-out nothing of A is kept.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrokerLedgerView } from "@/market/brokerLedger";

let release: () => void = () => {};
vi.mock("@/pwa/meSnapshotCodec", async () => {
  await new Promise<void>((r) => { release = r; });
  return await vi.importActual<typeof import("@/pwa/meSnapshotCodec")>("@/pwa/meSnapshotCodec");
});

const A = `acc_${"a".repeat(32)}`;
const B = `acc_${"b".repeat(32)}`;
const KEY = "quay.offline.me.v1";
const ledger = (cashCents: number, asset: string): BrokerLedgerView => ({
  tick: 27700, cashCents, reservedCashCents: 0, positions: { [asset]: { assetId: asset, qty: "1", avgCost: "10.00" } }, orders: {}, fills: [], intents: [],
});

let mem: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); // a fresh meSnapshot module: its codec is not loaded yet
  mem = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } });
});
afterEach(() => vi.unstubAllGlobals());
const load = () => import("@/pwa/meSnapshot");
const record = () => (mem.has(KEY) ? JSON.parse(mem.get(KEY)!) as { acct: string; cash: number; positions: { asset: string }[] } : null);
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("queued A work while the codec chunk is still loading", () => {
  it("A's queued save, then sign-out, then B signs in: A never writes; B's snapshot stays B's", async () => {
    const m = await load();
    mem.set(KEY, JSON.stringify({ v: 1, acct: A, savedAt: 1, tick: 27690, cash: 100, held: 0, positions: [], orders: [] })); // A's own earlier record
    const signedInA = m.snapshotSignedIn(A);
    const savedA = m.saveMeSnapshot(A, ledger(111, "HALC"));
    await tick();
    expect(mem.has(KEY)).toBe(true); // A's own record stays at A's sign-in; nothing queued ran yet: the codec is held

    m.snapshotSignedOut();
    expect(mem.has(KEY)).toBe(false); // sign-out clears at once, before the codec arrives
    const signedInB = m.snapshotSignedIn(B);
    const savedB = m.saveMeSnapshot(B, ledger(222, "MRDN"));
    const lateA = m.saveMeSnapshot(A, ledger(333, "HALC")); // a late A ledger after the switch
    await tick();
    expect(mem.has(KEY)).toBe(false);

    release();
    await Promise.all([signedInA, signedInB]);
    expect([await savedA, await savedB, await lateA]).toEqual([false, true, false]);
    await m._snapshotForTests.idle();
    expect(record()).toMatchObject({ acct: B, cash: 222, positions: [{ asset: "MRDN" }] });
    expect(mem.get(KEY)).not.toContain("HALC");
  });

  it("A's queued save, then sign-out only: released afterwards, nothing of A is written back", async () => {
    const m = await load();
    void m.snapshotSignedIn(A);
    const savedA = m.saveMeSnapshot(A, ledger(111, "HALC"));
    m.snapshotSignedOut();
    release();
    expect(await savedA).toBe(false);
    await m._snapshotForTests.idle();
    expect(mem.has(KEY)).toBe(false);
  });

  it("same account: sign-out clears A at once; after A signs in again the new session's save is what remains", async () => {
    const m = await load();
    void m.snapshotSignedIn(A);
    const oldSave = m.saveMeSnapshot(A, ledger(111, "HALC"));
    m.snapshotSignedOut();
    expect(mem.has(KEY)).toBe(false); // cold offline right after sign-out: no A
    void m.snapshotSignedIn(A);
    const newSave = m.saveMeSnapshot(A, ledger(444, "MRDN"));
    release();
    await oldSave; // A's own earlier ledger: may be kept for a moment, never another account's
    expect(await newSave).toBe(true);
    await m._snapshotForTests.idle();
    expect(record()).toMatchObject({ acct: A, cash: 444, positions: [{ asset: "MRDN" }] });
  });
});
