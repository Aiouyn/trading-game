// M2-05 offline `me` snapshot (doc 19 Rule 3.17.5). The record holds only allowlisted own-ledger fields; only the
// current account's ledgers are written; sign-out / signed-out / another account deletes it; a late ledger from a
// previous account cannot restore it; storage failures and corrupted / unknown fields read as "no snapshot". The static
// offline page's reader applies the same rules (parity table below).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrokerLedgerView } from "@/market/brokerLedger";
import type { OpenOrder } from "@/shell/contracts/channels";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { ME_SNAPSHOT_KEY, _snapshotForTests, saveMeSnapshot, snapshotSignedIn, snapshotSignedOut, snapshotUnknown } from "@/pwa/meSnapshot";
import { parseMeSnapshot, toMeSnapshot } from "@/pwa/meSnapshotCodec";

const A = `acc_${"a".repeat(32)}`;
const B = `acc_${"b".repeat(32)}`;
const order = (o: Partial<OpenOrder> = {}): OpenOrder => ({ orderId: "o_123", assetId: "HALC", side: "BUY", type: "limit", qty: "3", filled: "0", limit: "40.00", tif: "gtc", status: "WORKING", placedTick: 27650, avgPrice: "0.00", ...o });
const ledger = (cashCents = 995_772, extra: Partial<BrokerLedgerView> = {}): BrokerLedgerView => ({
  tick: 27700, cashCents, reservedCashCents: 12_006,
  positions: { HALC: { assetId: "HALC", qty: "2", avgCost: "42.10" } },
  orders: { o_123: order() },
  fills: [{ fillId: "f1", tick: 27690, assetId: "HALC", orderId: "o_9", side: "BUY", qty: "2", price: "42.10", fee: "0.08", feeCcy: "FDL", liquidity: "TAKER", counterpartyKind: "NPC" }],
  intents: [{ intentId: "i1", tick: 27690, status: "ACCEPTED" }],
  coins: [{ ticker: "FROG", qty: 34_000_000, value: 4_850, cost: 5_000 }],
  ...extra,
});

let mem: Map<string, string>;
let failGet = false, failSet = false;
beforeEach(() => {
  mem = new Map(); failGet = false; failSet = false;
  _snapshotForTests.reset();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => { if (failGet) throw new Error("SecurityError"); return mem.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (failSet) throw new Error("QuotaExceededError"); mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  });
});
afterEach(() => vi.unstubAllGlobals());
const stored = () => parseMeSnapshot(mem.get(ME_SNAPSHOT_KEY) ?? null);

describe("what is stored", () => {
  it("only allowlisted own-ledger fields: no marks, values, fills, intents, order ids, handle, session or token", async () => {
    await snapshotSignedIn(A);
    expect(await saveMeSnapshot(A, ledger(), 1_762_580_000_000)).toBe(true);
    const raw = mem.get(ME_SNAPSHOT_KEY)!;
    expect(JSON.parse(raw)).toEqual({
      v: 1, acct: A, savedAt: 1_762_580_000_000, tick: 27700, cash: 995_772, held: 12_006,
      positions: [{ asset: "HALC", qty: "2", avgCost: "42.10" }],
      orders: [{ asset: "HALC", side: "BUY", type: "limit", qty: "3", filled: "0", limit: "40.00", status: "WORKING" }],
      coins: [{ ticker: "FROG", qty: 34_000_000, cost: 5_000 }], // own saved coin + cost basis, never its (market) value
    });
    expect(raw).not.toMatch(/o_123|"(orderId|fills|intents|mark|value|upl|nw|handle|email|session\w*|token|cookie|hash|tif|placedTick|avgPrice)"/i);
    expect([...mem.keys()]).toEqual([ME_SNAPSHOT_KEY]);
  });
});

describe("account lifecycle", () => {
  it("nothing is written before a sign-in, or for another account than the signed-in one", async () => {
    expect(await saveMeSnapshot(A, ledger())).toBe(false);
    await snapshotSignedIn(B);
    expect(await saveMeSnapshot(A, ledger())).toBe(false);
    expect(mem.size).toBe(0);
  });
  it("sign-out deletes A's record; a delayed A ledger arriving afterwards cannot restore it", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger());
    snapshotSignedOut();
    expect(mem.size).toBe(0);
    expect(await saveMeSnapshot(A, ledger(1))).toBe(false);
    expect(mem.size).toBe(0);
  });
  it("B signing in deletes A's record; a delayed A ledger after that is refused and B's own values are kept", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger(111));
    await snapshotSignedIn(B);
    expect(mem.size).toBe(0);
    expect(await saveMeSnapshot(B, ledger(222))).toBe(true);
    expect(await saveMeSnapshot(A, ledger(333))).toBe(false);
    expect(stored()).toMatchObject({ acct: B, cash: 222 });
  });
  it("the same account signing in again keeps its record (cold offline after a reload still has it)", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger(444));
    _snapshotForTests.reset(); // a page reload
    await snapshotSignedIn(A);
    expect(stored()).toMatchObject({ acct: A, cash: 444 });
  });
  it("a network error stops writes but keeps the record for the offline page", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger(555));
    snapshotUnknown();
    expect(await saveMeSnapshot(A, ledger(666))).toBe(false);
    expect(stored()).toMatchObject({ acct: A, cash: 555 });
  });
  it("an unreadable record found at sign-in is deleted", async () => {
    mem.set(ME_SNAPSHOT_KEY, "{not json");
    await snapshotSignedIn(A);
    expect(mem.size).toBe(0);
  });
});

describe("storage failures", () => {
  it("a failing write keeps nothing (no older record left looking current) and never throws", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger(777));
    failSet = true;
    expect(await saveMeSnapshot(A, ledger(888))).toBe(false);
    expect(mem.size).toBe(0);
  });
  it("blocked storage at sign-in never throws", async () => {
    failGet = true;
    await expect(snapshotSignedIn(A)).resolves.toBeUndefined();
  });
  it("a ledger the record cannot represent is not written and removes the older one", async () => {
    await snapshotSignedIn(A); await saveMeSnapshot(A, ledger(999));
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`o_${i}`, order({ orderId: `o_${i}` })]));
    expect(await saveMeSnapshot(A, ledger(1000, { orders: many }))).toBe(false);
    expect(mem.size).toBe(0);
  });
});

// The offline page's own reader (public/offline.html, between the snapshot-reader markers).
const html = readFileSync(new URL("../../../public/offline.html", import.meta.url), "utf8");
const src = html.slice(html.indexOf("/* snapshot-reader:start"), html.indexOf("/* snapshot-reader:end */"));
const page = new Function(`${src}; return { readSnapshot, gameTime, cents };`)() as {
  readSnapshot: (t: string | null) => unknown; gameTime: (tick: number) => string; cents: (c: number) => string;
};

describe("reader: corrupted / unknown / oversize records are rejected by the app and the offline page alike", () => {
  const good = toMeSnapshot(A, ledger(), 1_762_580_000_000)!;
  const j = (o: unknown) => JSON.stringify(o);
  const cases: [string, string | null, boolean][] = [
    ["valid", j(good), true],
    ["no record", null, false],
    ["not JSON", "{\"v\":1,", false],
    ["array", "[]", false],
    ["unknown top-level field (e.g. a handle)", j({ ...good, handle: "kata" }), false],
    ["unknown position field (e.g. a mark)", j({ ...good, positions: [{ ...good.positions[0], mark: "43.00" }] }), false],
    ["unknown order field (e.g. an order id)", j({ ...good, orders: [{ ...good.orders[0], orderId: "o_1" }] }), false],
    ["missing field", j({ ...good, held: undefined }), false],
    ["wrong version", j({ ...good, v: 2 }), false],
    ["account id that is not an opaque id", j({ ...good, acct: "kata@example.com" }), false],
    ["negative cash", j({ ...good, cash: -1 }), false],
    ["fractional tick", j({ ...good, tick: 1.5 }), false],
    ["markup in an asset", j({ ...good, positions: [{ asset: "<img src=x>", qty: "1", avgCost: "1.00" }] }), false],
    ["bad side", j({ ...good, orders: [{ ...good.orders[0], side: "HOLD" }] }), false],
    ["bad limit", j({ ...good, orders: [{ ...good.orders[0], limit: "1e9" }] }), false],
    ["no coins key (an old record could hide a coin holding)", j({ ...good, coins: undefined }), false],
    ["unknown coin field (e.g. a value)", j({ ...good, coins: [{ ...good.coins[0], value: 4850 }] }), false],
    ["markup in a coin ticker", j({ ...good, coins: [{ ticker: "<b>", qty: 1, cost: 0 }] }), false],
    ["zero coin qty", j({ ...good, coins: [{ ticker: "FROG", qty: 0, cost: 0 }] }), false],
    ["65 coins", j({ ...good, coins: Array.from({ length: 65 }, () => good.coins[0]) }), false],
    ["65 positions", j({ ...good, positions: Array.from({ length: 65 }, () => good.positions[0]) }), false],
    ["over 16 KB", j(good).replace("}", `,"pad":"${"x".repeat(16400)}"}`), false],
  ];
  for (const [name, text, ok] of cases) {
    it(`${name}: ${ok ? "accepted" : "rejected"}`, () => {
      expect(parseMeSnapshot(text) !== null).toBe(ok);
      expect(page.readSnapshot(text) !== null).toBe(ok);
    });
  }
  it("the page's game time and cash match the app's (clockLabel(clockAt(tick)), $ with 2 decimals)", async () => {
    for (const t of [0, 1, 719, 720, 27700, 27999]) {
      const { day, hhmm } = clockLabel(clockAt(t));
      expect(page.gameTime(t)).toBe(`Day ${day} ${hhmm}`);
    }
    expect([page.cents(0), page.cents(5), page.cents(995_772), page.cents(123_456_789)]).toEqual(["$0.00", "$0.05", "$9,957.72", "$1,234,567.89"]);
  });
});
