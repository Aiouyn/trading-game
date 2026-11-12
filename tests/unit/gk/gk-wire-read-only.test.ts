import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET as wireRoute } from "@/app/api/wire/route";
import {
  AuthService,
  FileAuthStore,
  MemoryAuthStore,
  START_CASH_CENTS,
  peekAuthService,
  setAuthServiceForTests,
  type AuthStore,
  type AuthStoreSnapshot,
} from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { LiveMarket, setAutostartClockForTests, setLiveMarketForTests, setWireStatementsSettledWaitForTests } from "@/server/market/clock";
import { parseWireSnapshot } from "@/market/wireSnapshot";
import { WIRE_POST_FEE_CENTS, publicHandleId } from "@/server/wire/playerStatements";
import { STATEMENT_RESOLVE_TICKS } from "@/server/wire/statementResolve";

const PASS = "password1";

class CountingStore implements AuthStore {
  saves = 0;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> { this.saves++; return this.inner.save(s); }
}

function lastOf(market: LiveMarket, id: string): string {
  const last = market.snapshot().quotes.rows[id]?.last;
  if (typeof last !== "string") throw new Error(`missing last for ${id}`);
  return last;
}

async function wireGet() {
  const res = await wireRoute();
  expect(res.status).toBe(200);
  const raw = await res.json();
  const snap = parseWireSnapshot(raw);
  expect(snap).not.toBeNull();
  return { raw, snap: snap! };
}

function playerItems(snap: { items: { kind: string; slots?: Record<string, string>; sourceRecord?: { hits: number; resolved: number } }[] }) {
  return snap.items.filter((i) => i.kind === "STATEMENT" && i.slots?.publicId);
}

describe("GET /api/wire is a pure read; the clock resolves due statements", () => {
  const temps: string[] = [];
  const markets: LiveMarket[] = [];

  afterEach(async () => {
    for (const m of markets.splice(0)) m.stop();
    setAutostartClockForTests(undefined);
    setWireStatementsSettledWaitForTests(undefined);
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    delete process.env.QUAY_AUTH_DATA_DIR;
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function setupMemory() {
    const store = new CountingStore(new MemoryAuthStore());
    const auth = new AuthService({ store });
    const market = new LiveMarket({ persistStorms: false, tickMs: 1e9 });
    markets.push(market);
    setAuthServiceForTests(auth);
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);
    const a = await auth.register({ handle: "PosterA", password: PASS });
    return { store, auth, market, a };
  }

  it("GET does not persist, even when a statement is already due and unresolved", async () => {
    const { store, auth, market, a } = await setupMemory();
    const now = market.snapshot().tick;
    const savesAfterRegister = store.saves;
    await auth.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "due-unread-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - STATEMENT_RESOLVE_TICKS,
      marks: { HALC: "0.01" },
    });
    expect(store.saves).toBe(savesAfterRegister + 1);
    expect((await auth.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");

    const cash = (await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents;
    const marks = lastOf(market, "HALC");
    const beforeSaves = store.saves;
    const first = await wireGet();
    expect(store.saves).toBe(beforeSaves);
    const posted = playerItems(first.snap);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.slots?.verdict).toBe("unresolved");
    expect(posted[0]!.sourceRecord).toBeUndefined();
    expect(JSON.stringify(first.raw)).not.toMatch(/acc_/);
    expect((await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(cash);
    expect(lastOf(market, "HALC")).toBe(marks);

    for (let i = 0; i < 3; i++) await wireGet();
    expect(store.saves).toBe(beforeSaves);
    expect((await auth.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");
  });

  it("step at dueTick persists TRUE/FALSE and GET then reads without writing", async () => {
    const { store, auth, market, a } = await setupMemory();
    const now = market.snapshot().tick;
    const b = await auth.register({ handle: "PosterB", password: PASS });
    await auth.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "up-due-next",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - (STATEMENT_RESOLVE_TICKS - 1),
      marks: { HALC: "0.01" },
    });
    await auth.postWireStatement({
      accountId: b.view.account.accountId,
      handle: b.view.account.handle,
      idempotencyKey: "up-false-next",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - (STATEMENT_RESOLVE_TICKS - 1),
      marks: { HALC: "999999" },
    });
    const cashA = (await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents;
    const cashB = (await auth.getPlayerPrivate(b.view, b.view.account.accountId)).cashCents;

    await market.catchUpWireStatements();
    expect((await auth.listPublicWirePosts()).every((p) => p.verdict === "UNRESOLVED")).toBe(true);

    const beforeStepSaves = store.saves;
    market.step();
    await market.whenWireStatementsSettled();
    expect(market.snapshot().tick).toBe(now + 1);
    expect(store.saves).toBe(beforeStepSaves + 1);
    const posts = await auth.listPublicWirePosts();
    expect(posts.find((p) => p.accountId === a.view.account.accountId)?.verdict).toBe("TRUE");
    expect(posts.find((p) => p.accountId === b.view.account.accountId)?.verdict).toBe("FALSE");
    expect(posts.every((p) => p.resolvedTick === now + 1)).toBe(true);

    const afterResolve = store.saves;
    const { raw, snap } = await wireGet();
    expect(store.saves).toBe(afterResolve);
    const items = playerItems(snap);
    const aId = publicHandleId(a.view.account.accountId);
    const bId = publicHandleId(b.view.account.accountId);
    const aItem = items.find((i) => i.slots?.publicId === aId);
    const bItem = items.find((i) => i.slots?.publicId === bId);
    expect(aItem?.slots?.verdict).toBe("true");
    expect(bItem?.slots?.verdict).toBe("false");
    expect(aItem?.sourceRecord).toEqual({ hits: 1, resolved: 1 });
    expect(bItem?.sourceRecord).toEqual({ hits: 0, resolved: 1 });
    expect(JSON.stringify(raw)).not.toMatch(/acc_/);
    expect(JSON.stringify(raw)).not.toContain(a.view.account.accountId);
    expect((await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(cashA);
    expect((await auth.getPlayerPrivate(b.view, b.view.account.accountId)).cashCents).toBe(cashB);
    expect(cashA).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    expect(cashB).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    await expect(auth.getPlayerPrivate(b.view, a.view.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await wireGet();
    expect(store.saves).toBe(afterResolve);
  });

  it("start() catch-up persists a due verdict; it survives FileAuthStore restart; further GET does not write", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-ro-"));
    temps.push(dir);
    const file = path.join(dir, "auth.json");
    const firstStore = new FileAuthStore(file);
    const first = new AuthService({ store: firstStore });
    const market = new LiveMarket({ persistStorms: false, tickMs: 1e9 });
    markets.push(market);
    setAuthServiceForTests(first);
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);

    const a = await first.register({ handle: "PosterF", password: PASS });
    const now = market.snapshot().tick;
    await first.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "file-due-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - STATEMENT_RESOLVE_TICKS,
      marks: { HALC: "0.01" },
    });
    expect((await first.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");

    const mtimeBeforeGet = (await stat(file)).mtimeMs;
    const unread = await wireGet();
    expect(playerItems(unread.snap)[0]!.slots?.verdict).toBe("unresolved");
    expect((await stat(file)).mtimeMs).toBe(mtimeBeforeGet);

    market.start();
    await market.whenWireStatementsSettled();
    expect(market.snapshot().tick).toBe(now);
    expect((await first.listPublicWirePosts())[0]!.verdict).toBe("TRUE");
    const cash = (await first.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents;
    expect(cash).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);
    const onDisk = JSON.parse(await readFile(file, "utf8")) as { wirePosts: { verdict: string }[] };
    expect(onDisk.wirePosts[0]!.verdict).toBe("TRUE");
    const afterResolve = await stat(file);

    const seen = await wireGet();
    expect(playerItems(seen.snap)[0]!.slots?.verdict).toBe("true");
    expect(playerItems(seen.snap)[0]!.sourceRecord).toEqual({ hits: 1, resolved: 1 });
    const afterGet = await stat(file);
    expect(afterGet.mtimeMs).toBe(afterResolve.mtimeMs);
    expect(afterGet.size).toBe(afterResolve.size);

    market.stop();
    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    const restarted = new LiveMarket({ persistStorms: false, tickMs: 1e9 });
    markets.push(restarted);
    setAuthServiceForTests(second);
    setLiveMarketForTests(restarted);
    setBrokerForTests(undefined);

    const diskBeforeRestartGet = await readFile(file, "utf8");
    const mtimeAfterRestart = (await stat(file)).mtimeMs;
    const afterRestart = await wireGet();
    expect(playerItems(afterRestart.snap)[0]!.slots?.verdict).toBe("true");
    expect(playerItems(afterRestart.snap)[0]!.sourceRecord).toEqual({ hits: 1, resolved: 1 });
    expect(await readFile(file, "utf8")).toBe(diskBeforeRestartGet);
    expect((await stat(file)).mtimeMs).toBe(mtimeAfterRestart);
    expect((await second.listPublicWirePosts())[0]!.verdict).toBe("TRUE");
    expect((await second.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(cash);

    restarted.start();
    await restarted.whenWireStatementsSettled();
    expect((await second.listPublicWirePosts())[0]!.verdict).toBe("TRUE");
    expect(await readFile(file, "utf8")).toBe(diskBeforeRestartGet);
    expect((await stat(file)).mtimeMs).toBe(mtimeAfterRestart);
    await wireGet();
    expect(await readFile(file, "utf8")).toBe(diskBeforeRestartGet);
    expect((await stat(file)).mtimeMs).toBe(mtimeAfterRestart);
  });

  it("GET /api/wire as the first call after a restart resolves a due verdict at the resumed tick", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "wire-ro-first-get-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    const first = new AuthService({ store: new FileAuthStore(file) });
    const market = new LiveMarket({ persistStorms: false, tickMs: 1e9 });
    markets.push(market);
    setAuthServiceForTests(first);
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);

    const a = await first.register({ handle: "FirstGet", password: PASS });
    const now = market.snapshot().tick;
    await first.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "first-get-due-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - STATEMENT_RESOLVE_TICKS,
      marks: { HALC: "0.01" },
    });
    expect((await first.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");
    const cash = (await first.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents;
    market.stop();

    // Fresh process: no singletons. GET /api/wire is the first call. lastTick equals due
    // (this clock resumes at the same START_TICK the statement is due).
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    process.env.QUAY_AUTH_DATA_DIR = dir;
    setAutostartClockForTests(true);
    expect(peekAuthService()).toBeUndefined();

    const firstGet = await wireGet();
    expect(firstGet.snap.tick).toBe(now);
    const posted = playerItems(firstGet.snap);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.slots?.verdict).toBe("true");
    expect(posted[0]!.sourceRecord).toEqual({ hits: 1, resolved: 1 });
    expect(JSON.stringify(firstGet.raw)).not.toMatch(/acc_/);
    const onDisk = JSON.parse(await readFile(file, "utf8")) as { wirePosts: { verdict: string; resolvedTick: number }[] };
    expect(onDisk.wirePosts[0]!.verdict).toBe("TRUE");
    expect(onDisk.wirePosts[0]!.resolvedTick).toBe(now);
    expect((await peekAuthService()!.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(cash);
    expect(cash).toBe(START_CASH_CENTS - WIRE_POST_FEE_CENTS);

    const afterResolve = await stat(file);
    const disk = await readFile(file, "utf8");
    const again = await wireGet();
    expect(playerItems(again.snap)[0]!.slots?.verdict).toBe("true");
    expect(await readFile(file, "utf8")).toBe(disk);
    expect((await stat(file)).mtimeMs).toBe(afterResolve.mtimeMs);
    expect((await stat(file)).size).toBe(afterResolve.size);
  });

  it("GET returns the current unread state when a persist stalls past the wait bound, without writing", async () => {
    class HangingStore implements AuthStore {
      constructor(private readonly inner: AuthStore) {}
      load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
      save(_s: AuthStoreSnapshot): Promise<void> { return new Promise(() => { /* never settles */ }); }
    }
    const inner = new MemoryAuthStore();
    const seed = new AuthService({ store: inner });
    const market = new LiveMarket({ persistStorms: false, tickMs: 1e9 });
    markets.push(market);
    setAuthServiceForTests(seed);
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);
    const a = await seed.register({ handle: "HangGet", password: PASS });
    const now = market.snapshot().tick;
    await seed.postWireStatement({
      accountId: a.view.account.accountId,
      handle: a.view.account.handle,
      idempotencyKey: "hang-get-due-01",
      text: "HALC will rise",
      assetTags: ["HALC"],
      tick: now - STATEMENT_RESOLVE_TICKS,
      marks: { HALC: "0.01" },
    });
    expect((await seed.listPublicWirePosts())[0]!.verdict).toBe("UNRESOLVED");
    const hanging = new AuthService({ store: new HangingStore(inner) });
    setAuthServiceForTests(hanging);
    const waitMs = 200;
    setWireStatementsSettledWaitForTests(waitMs);
    void market.catchUpWireStatements();
    const t0 = Date.now();
    const firstGet = await wireGet();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(waitMs - 50);
    expect(elapsed).toBeLessThan(waitMs + 1000);
    expect(firstGet.snap.tick).toBe(now);
    const posted = playerItems(firstGet.snap);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.slots?.verdict).toBe("unresolved");
    expect(posted[0]!.sourceRecord).toBeUndefined();
    expect((await hanging.listPublishedWirePosts())[0]!.verdict).toBe("UNRESOLVED");
  });
});
