import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService, FileAuthStore, MemoryAuthStore, START_CASH_CENTS } from "@/server/auth";
import { LiveMarket } from "@/server/market/clock";
import { newsBody } from "@/shell/contracts/schema";
import {
  WIRE_POST_FEE_CENTS,
  WIRE_POST_MAX_CHARS,
  WirePostError,
  codePointLength,
  hasPersonalData,
  mergePlayerStatements,
  loadPlayerWirePosts,
  parsePlayerWirePosts,
  playerPostToWireItem,
  sanitizeWireText,
} from "@/server/wire/playerStatements";

const TICK = 27_700;
const NEXT_DAY = 28_080;
const PASS = "password1";
const KEY = "stmt-key-01";

async function account(store = new MemoryAuthStore(), handle = "PosterA") {
  const auth = new AuthService({ store });
  const a = await auth.register({ handle, password: PASS });
  return { auth, store, ...a };
}

function marks(m: LiveMarket) {
  return Object.fromEntries(Object.entries(m.snapshot().quotes.rows).map(([id, r]) => [id, r.last]));
}

describe("player Wire statements (soc.wire.post)", () => {
  const temps: string[] = [];
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("sanitizes text: trim, NFC, controls, abuse mask; rejects PII and over-length", () => {
    expect(sanitizeWireText("  hello\nthere\u0001 ")).toBe("hello there");
    const nfc = "e\u0301";
    expect(sanitizeWireText(nfc)).toBe("é");
    expect(sanitizeWireText("this is shit luck")).toBe("this is **** luck");
    expect(hasPersonalData("write me at a@b.com please")).toBe(true);
    expect(hasPersonalData("call +1 415 555 0100 now")).toBe(true);
    expect(hasPersonalData("foo [at] bar.com")).toBe(true);
    expect(hasPersonalData("foo(at)bar.com")).toBe(true);
    expect(hasPersonalData("foo＠bar.com")).toBe(true);
    expect(hasPersonalData("foo@exam\u200bple.com")).toBe(true);
    expect(hasPersonalData("５５５１２３４５６７")).toBe(true);
    expect(codePointLength("a".repeat(WIRE_POST_MAX_CHARS))).toBe(WIRE_POST_MAX_CHARS);
  });

  it("posts a STATEMENT, debits $500, and leaves marks unchanged", async () => {
    const { auth, view } = await account();
    const m = new LiveMarket({ persistStorms: false });
    const before = marks(m);
    const out = await auth.postWireStatement({
      accountId: view.account.accountId,
      handle: view.account.handle,
      idempotencyKey: KEY,
      text: "  HALC looks steady  ",
      assetTags: ["HALC"],
      tick: TICK,
    });
    expect(out.replayed).toBe(false);
    expect(out.post.id.startsWith("w-p-")).toBe(true);
    expect(out.post.text).toBe("HALC looks steady");
    expect(out.post.handle).toBe("PosterA");
    expect(out.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect(out.remainingToday).toBe(2);
    const item = playerPostToWireItem(out.post);
    expect(item.kind).toBe("STATEMENT");
    expect(item.headlineKey).toBe("wire.statement.player");
    expect(item.slots?.handle).toBe("PosterA");
    expect(item.effects).toBeUndefined();
    expect(item.sourceRecord).toBeUndefined();
    expect(() => newsBody({ items: [item] }, "news")).not.toThrow();
    const merged = mergePlayerStatements(m.wire().items, await auth.listPublicWirePosts());
    expect(merged.some((i) => i.id === out.post.id && i.kind === "STATEMENT")).toBe(true);
    expect(marks(m)).toEqual(before);
    expect(m.wire().items.some((i) => i.id === out.post.id)).toBe(false); // not a clock story
  });

  it("rejects empty, too long, PII, bad assets, and insufficient cash without a row or debit", async () => {
    const { auth, view } = await account();
    const rejects: Array<{ text: unknown; assetTags: unknown; code: string }> = [
      { text: "   ", assetTags: ["HALC"], code: "TEXT_EMPTY" },
      { text: "a".repeat(281), assetTags: ["HALC"], code: "TEXT_TOO_LONG" },
      { text: "email me at foo@bar.com", assetTags: ["HALC"], code: "TEXT_FILTER" },
      { text: "HALC is fine", assetTags: ["NOPE"], code: "BAD_ASSET" },
      { text: "HALC is fine", assetTags: [], code: "BAD_ASSET" },
    ];
    for (const [i, r] of rejects.entries()) {
      await expect(auth.postWireStatement({
        accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: `bad-key-${i}0`,
        text: r.text, assetTags: r.assetTags, tick: TICK,
      })).rejects.toMatchObject({ name: "WirePostError", code: r.code });
    }
    await auth.updateOwnPrivateState(view, (cur) => ({ ...cur, cashCents: 49_999 }));
    await expect(auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: "cash-low1",
      text: "still trying", assetTags: ["HALC"], tick: TICK,
    })).rejects.toMatchObject({ code: "INSUFFICIENT_CASH" });
    expect(await auth.listPublicWirePosts()).toEqual([]);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(49_999);
  });

  it("rejects a post when spendable cash is short because of a reserved buy", async () => {
    const { auth, view } = await account();
    await auth.updateOwnPrivateState(view, (cur) => ({
      ...cur,
      cashCents: 60_000,
      openOrders: {
        ord_rsv: {
          orderId: "ord_rsv", assetId: "HALC", side: "BUY", type: "limit", qty: "10", filled: "0",
          limit: "50.00", tif: "gtc", status: "WORKING", placedTick: TICK, avgPrice: "0",
        },
      },
    }));
    await expect(auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: "rsv-key01",
      text: "reserved", assetTags: ["HALC"], tick: TICK,
    })).rejects.toMatchObject({ code: "INSUFFICIENT_CASH" });
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(60_000);
    expect(await auth.listPublicWirePosts()).toEqual([]);
  });

  it("caps at three posts per game day and resets the next day", async () => {
    const { auth, view } = await account();
    for (let i = 0; i < 3; i++) {
      await auth.postWireStatement({
        accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: `day-key-${i}x`,
        text: `post ${i}`, assetTags: ["HALC"], tick: TICK,
      });
    }
    await expect(auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: "day-key-3x",
      text: "one too many", assetTags: ["HALC"], tick: TICK,
    })).rejects.toMatchObject({ code: "DAY_CAP" });
    expect((await auth.listPublicWirePosts()).length).toBe(3);
    const led = await auth.getPlayerPrivate(view, view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - 3 * WIRE_POST_FEE_CENTS);
    const fourth = await auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: "day-key-4x",
      text: "new day", assetTags: ["NMBS"], tick: NEXT_DAY,
    });
    expect(fourth.remainingToday).toBe(2);
    expect((await auth.listPublicWirePosts()).length).toBe(4);
  });

  it("replays the same idempotency key without a second charge, and conflicts on a different body", async () => {
    const { auth, view } = await account();
    const first = await auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: KEY,
      text: "once", assetTags: ["HALC"], tick: TICK,
    });
    const replay = await auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: KEY,
      text: "once", assetTags: ["HALC"], tick: TICK,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.post.id).toBe(first.post.id);
    expect(replay.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect((await auth.listPublicWirePosts()).length).toBe(1);
    await expect(auth.postWireStatement({
      accountId: view.account.accountId, handle: view.account.handle, idempotencyKey: KEY,
      text: "different", assetTags: ["HALC"], tick: TICK,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rematerializes the row, the debit, and a replay after a FileAuthStore restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-post-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "PersistP", password: PASS });
    const posted = await first.postWireStatement({
      accountId: a.view.account.accountId, handle: a.view.account.handle, idempotencyKey: KEY,
      text: "survives restart", assetTags: ["HALC"], tick: TICK,
    });
    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    const posts = await second.listPublicWirePosts();
    expect(posts).toEqual([posted.post]);
    const led = await second.getPlayerPrivate(a.view, a.view.account.accountId);
    expect(led.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    const replay = await second.postWireStatement({
      accountId: a.view.account.accountId, handle: a.view.account.handle, idempotencyKey: KEY,
      text: "survives restart", assetTags: ["HALC"], tick: TICK,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect((await second.listPublicWirePosts()).length).toBe(1);
  });

  it("lets account B see A's public statement and not A's cash", async () => {
    const store = new MemoryAuthStore();
    const auth = new AuthService({ store });
    const a = await auth.register({ handle: "AliceP", password: PASS });
    const b = await auth.register({ handle: "BobPxx", password: PASS });
    await auth.postWireStatement({
      accountId: a.view.account.accountId, handle: a.view.account.handle, idempotencyKey: KEY,
      text: "public note", assetTags: ["HALC"], tick: TICK,
    });
    const posts = await auth.listPublicWirePosts();
    expect(posts[0]?.handle).toBe("AliceP");
    expect(JSON.stringify(posts[0])).not.toMatch(/cash/i);
    const aLed = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    const bLed = await auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(aLed.cashCents).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect(bLed.cashCents).toBe(START_CASH_CENTS);
    await expect(auth.getPlayerPrivate(b.view, a.view.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("quarantines a malformed wirePosts row and treats a missing key as empty, without failing the store", async () => {
    expect(parsePlayerWirePosts(undefined)).toEqual([]);
    expect(loadPlayerWirePosts(undefined).quarantined).toEqual([]);
    expect(parsePlayerWirePosts({ not: "array" })).toEqual([]);
    expect(loadPlayerWirePosts({ not: "array" }).quarantined).toHaveLength(1);
    const good = {
      id: "w-p-abcdabcdabcdabcd",
      accountId: "acc_1",
      handle: "PosterA",
      text: "ok",
      assetTags: ["HALC"],
      tick: TICK,
    };
    const loaded = loadPlayerWirePosts([good, { id: "nope" }, { ...good, id: "w-x-wrong" }, "x"]);
    expect(loaded.posts).toEqual([good]);
    expect(loaded.quarantined).toHaveLength(3);
  });
});

describe("WirePostError", () => {
  it("is a distinct error class", () => {
    const err = new WirePostError("DAY_CAP", "cap", 409);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WirePostError");
  });
});
