// Card 41 guards: the placedAcks module store (src/apps/broker/placedAcks.ts) that keeps a Place's outcome after its
// ticket unmounts. Account isolation (sign-out / switch clears it; a late reply for A never lands in B), bounded size
// (entries drop once shown or dismissed, a cap holds the rest, nothing survives a reset/reload), one entry per Place, and
// the useSyncExternalStore contract (stable snapshot between changes; subscribers told on each change).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLACED_ACKS_MAX, dismissPlaced, dropPlaced, notePlaced, placedAcksSnapshot, releaseTickets, resetPlacedAcks,
  setPlacedAcksAccount, settlePlaced, subscribePlacedAcks,
} from "@/apps/broker/placedAcks";

beforeEach(() => { resetPlacedAcks(); setPlacedAcksAccount("guest"); });
afterEach(() => { resetPlacedAcks(); });

const forShell = () => placedAcksSnapshot().filter((e) => e.owner === "shell");

describe("card 41 placedAcks: account isolation", () => {
  it("switching account mid-Place clears A's entries, and A's late reply never lands in B", () => {
    setPlacedAcksAccount("acct-A");
    const id = notePlaced("HALC");
    releaseTickets([id]); // A's ticket unmounted mid-Place
    expect(forShell()).toHaveLength(1);
    setPlacedAcksAccount("acct-B");
    expect(placedAcksSnapshot()).toEqual([]);
    settlePlaced(id, { ok: true, intentId: "i-A-1" }); // A's reply arrives after the switch
    expect(placedAcksSnapshot()).toEqual([]);
    const b = notePlaced("MRDN");
    expect(placedAcksSnapshot().map((e) => [e.id, e.account])).toEqual([[b, "acct-B"]]);
  });
  it("sign-out (account -> guest) clears too; setting the same account again does not", () => {
    setPlacedAcksAccount("acct-A");
    const id = notePlaced("HALC");
    releaseTickets([id]);
    setPlacedAcksAccount("acct-A");
    expect(forShell()).toHaveLength(1);
    setPlacedAcksAccount("guest");
    expect(placedAcksSnapshot()).toEqual([]);
  });
});

describe("card 41 placedAcks: one entry per Place, owned by the ticket until it unmounts", () => {
  it("ids are unique; a second settle for the same Place changes nothing", () => {
    const a = notePlaced("HALC"), b = notePlaced("HALC");
    expect(a).not.toBe(b);
    settlePlaced(a, { ok: true, intentId: "i-1" });
    settlePlaced(a, { ok: true, intentId: "i-1" });
    expect(placedAcksSnapshot().filter((e) => e.id === a)).toHaveLength(1);
    expect(placedAcksSnapshot().find((e) => e.id === a)!.intentId).toBe("i-1");
  });
  it("a mounted ticket's entries are never the shell's; release hands over only the given ids", () => {
    const a = notePlaced("HALC"), b = notePlaced("MRDN");
    expect(forShell()).toEqual([]);
    releaseTickets([a]);
    expect(forShell().map((e) => e.id)).toEqual([a]);
    expect(placedAcksSnapshot().find((e) => e.id === b)!.owner).toBe("ticket");
  });
  it("a failure is kept as its kind, never as an intent id", () => {
    const a = notePlaced("HALC");
    settlePlaced(a, { ok: false, failed: "unknown" });
    const e = placedAcksSnapshot().find((x) => x.id === a)!;
    expect(e.failed).toBe("unknown");
    expect(e.intentId).toBeNull();
  });
});

describe("card 41 placedAcks: bounded", () => {
  it("1000 places shown by their own ticket leave nothing behind", () => {
    for (let i = 0; i < 1000; i++) { const id = notePlaced("HALC"); settlePlaced(id, { ok: true, intentId: `i-${i}` }); dropPlaced(id); }
    expect(placedAcksSnapshot()).toEqual([]);
  });
  it("1000 orphaned places that are shown then dismissed leave nothing behind", () => {
    for (let i = 0; i < 1000; i++) { const id = notePlaced("HALC"); releaseTickets([id]); settlePlaced(id, { ok: true, intentId: `i-${i}` }); dismissPlaced(id); }
    expect(placedAcksSnapshot()).toEqual([]);
  });
  it("orphans that never resolve stay under the cap (oldest dropped first)", () => {
    const ids: number[] = [];
    for (let i = 0; i < 1000; i++) { const id = notePlaced("HALC"); releaseTickets([id]); ids.push(id); }
    const snap = placedAcksSnapshot();
    expect(snap.length).toBeLessThanOrEqual(PLACED_ACKS_MAX);
    expect(snap.at(-1)!.id).toBe(ids.at(-1));
  });
  it("reset (a reload) leaves nothing", () => {
    releaseTickets([notePlaced("HALC"), notePlaced("MRDN")]);
    resetPlacedAcks();
    expect(placedAcksSnapshot()).toEqual([]);
  });
});

describe("card 41 placedAcks: useSyncExternalStore contract", () => {
  it("the snapshot is the same object until something changes; subscribers hear each change", () => {
    const fn = vi.fn();
    const off = subscribePlacedAcks(fn);
    const s0 = placedAcksSnapshot();
    expect(placedAcksSnapshot()).toBe(s0);
    const id = notePlaced("HALC");
    expect(fn).toHaveBeenCalledTimes(1);
    const s1 = placedAcksSnapshot();
    expect(s1).not.toBe(s0);
    expect(placedAcksSnapshot()).toBe(s1);
    releaseTickets([id]);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    dismissPlaced(id);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
