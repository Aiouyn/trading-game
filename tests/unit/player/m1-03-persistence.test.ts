import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthError,
  AuthService,
  FileAuthStore,
  MemoryAuthStore,
  PLAYER_PRIVATE_SCHEMA_VERSION,
  PORT_AVALON_WORLD_ID,
  START_CASH_CENTS,
  type AccountId,
  type PersistedOpenOrder,
  type PersistedPosition,
} from "@/server/auth";
import { buildPlayerPrivate, cashCentsToMoney, compareUDec, parsePlayerPrivateRow } from "@/server/player";
import { getPortAvalonWorld } from "@/shell/worldIdentity";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
import { MockFeed } from "@/shell/contracts/mockFeed";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";

const run = promisify(execFile);

const HALC: PersistedPosition = { assetId: "HALC", qty: "12.5", avgCost: "43.1275" };
const VOLT: PersistedPosition = { assetId: "VOLT", qty: "3", avgCost: "118.40" };
const LIMIT_BUY: PersistedOpenOrder = {
  orderId: "ord_a1", assetId: "VOLT", side: "BUY", type: "limit", qty: "10", filled: "4", limit: "117.25",
  tif: "gtc", status: "PARTIAL", placedTick: 812, avgPrice: "117.10",
};
const STOP_SELL: PersistedOpenOrder = {
  orderId: "ord_a2", assetId: "HALC", side: "SELL", type: "stop_limit", qty: "5", filled: "0", limit: "40.00", stop: "41.50",
  tif: "day", status: "WORKING", placedTick: 900, avgPrice: "0",
};
const B_ORDER: PersistedOpenOrder = {
  orderId: "ord_b1", assetId: "ORCA", side: "SELL", type: "limit", qty: "2", filled: "0", limit: "9.99",
  tif: "day", status: "PENDING", placedTick: 5, avgPrice: "0",
};

describe("M1-03 private ledger persistence", () => {
  const temps: string[] = [];
  const tempFile = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-03-"));
    temps.push(dir);
    return path.join(dir, "store.json");
  };
  afterEach(async () => {
    setFeed(null);
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("world attach reports player_private persistence", () => {
    expect(getPortAvalonWorld().persistence).toBe("player_private");
    expect(getPortAvalonWorld().worldId).toBe(PORT_AVALON_WORLD_ID);
  });

  it("register seeds a v2 starter ledger", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const a = await auth.register({ handle: "Starter", password: "password1" });
    expect(await auth.getPlayerPrivate(a.view, a.view.account.accountId)).toEqual({
      v: PLAYER_PRIVATE_SCHEMA_VERSION, accountId: a.view.account.accountId, cashCents: START_CASH_CENTS, positions: {}, openOrders: {},
    });
  });

  it("rich positions (qty + cost basis) and limit/stop orders survive restart; isolation holds", async () => {
    const file = await tempFile();
    const first = new AuthService({ store: new FileAuthStore(file) });
    const a = await first.register({ handle: "PersistA", password: "password1" });
    const b = await first.register({ handle: "PersistB", password: "password1" });
    await first.updateOwnPrivateState(a.view, () => ({
      cashCents: 812_345, positions: { HALC, VOLT }, openOrders: { ord_a1: LIMIT_BUY, ord_a2: STOP_SELL },
    }));
    await first.updateOwnPrivateState(b.view, () => ({ cashCents: 5_000, positions: {}, openOrders: { ord_b1: B_ORDER } }));

    const second = new AuthService({ store: new FileAuthStore(file) });
    await second.reload();
    const a2 = await second.resolveSession(a.rawToken);
    const b2 = await second.resolveSession(b.rawToken);
    const aPriv = await second.getPlayerPrivate(a2!, a2!.account.accountId);
    const bPriv = await second.getPlayerPrivate(b2!, b2!.account.accountId);
    expect(aPriv.cashCents).toBe(812_345);
    expect(aPriv.positions).toEqual({ HALC, VOLT });
    expect(aPriv.openOrders).toEqual({ ord_a1: LIMIT_BUY, ord_a2: STOP_SELL });
    expect(bPriv.openOrders).toEqual({ ord_b1: B_ORDER });
    expect(bPriv.positions).toEqual({});
    await expect(second.getPlayerPrivate(a2!, b2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(second.getPlayerPrivate(b2!, a2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const disk = JSON.parse(await readFile(file, "utf8")) as { players: Array<Record<string, unknown>> };
    const aRow = disk.players.find((p) => p.accountId === a.view.account.accountId)!;
    expect(aRow.v).toBe(2);
    expect(aRow).not.toHaveProperty("openOrderIds");
    expect((aRow.openOrders as Record<string, unknown>).ord_a1).toEqual(LIMIT_BUY);
  });

  it("ledger written by one process is reconstructed by a fresh Node process", async () => {
    const file = await tempFile();
    const writer = new AuthService({ store: new FileAuthStore(file) });
    const a = await writer.register({ handle: "ProcA", password: "password1" });
    await writer.updateOwnPrivateState(a.view, () => ({ cashCents: 777_001, positions: { HALC }, openOrders: { ord_a1: LIMIT_BUY } }));
    const script = [
      'import { AuthService, FileAuthStore } from "@/server/auth";',
      "const svc = new AuthService({ store: new FileAuthStore(process.env.M103_FILE) });",
      "const v = await svc.resolveSession(process.env.M103_TOKEN);",
      "const p = await svc.getPlayerPrivate(v, v.account.accountId);",
      "process.stdout.write(JSON.stringify({ pid: process.pid, p }));",
    ].join("\n");
    const scriptFile = path.join(path.dirname(file), "reader.mts");
    await writeFile(scriptFile, script, "utf8");
    const { stdout } = await run(path.join(process.cwd(), "node_modules/.bin/tsx"), ["--tsconfig", path.join(process.cwd(), "tsconfig.json"), scriptFile], {
      cwd: process.cwd(),
      env: { ...process.env, M103_FILE: file, M103_TOKEN: a.rawToken },
    });
    const out = JSON.parse(stdout) as { pid: number; p: unknown };
    expect(out.pid).not.toBe(process.pid);
    expect(out.p).toEqual({
      v: 2, accountId: a.view.account.accountId, cashCents: 777_001, positions: { HALC }, openOrders: { ord_a1: LIMIT_BUY },
    });
  }, 30_000);

  it("concurrent read-modify-write commits never lose updates (same account and across accounts)", async () => {
    const file = await tempFile();
    const auth = new AuthService({ store: new FileAuthStore(file) });
    const a = await auth.register({ handle: "RaceA", password: "password1" });
    const b = await auth.register({ handle: "RaceB", password: "password1" });
    const a2 = await auth.login({ handle: "RaceA", password: "password1" }); // second session, same account
    const debit = (view: typeof a.view, n: number) =>
      auth.updateOwnPrivateState(view, (cur) => ({ ...cur, cashCents: cur.cashCents - n }));
    const ops: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      ops.push(debit(i % 2 ? a.view : a2.view, 100));
      ops.push(debit(b.view, 7));
    }
    ops.push(auth.updateOwnPrivateState(a.view, (cur) => ({ ...cur, positions: { ...cur.positions, HALC } })));
    ops.push(auth.updateOwnPrivateState(a2.view, (cur) => ({ ...cur, openOrders: { ...cur.openOrders, ord_a1: LIMIT_BUY } })));
    await Promise.all(ops);
    const reloaded = new AuthService({ store: new FileAuthStore(file) });
    const ra = await reloaded.resolveSession(a.rawToken);
    const rb = await reloaded.resolveSession(b.rawToken);
    const aPriv = await reloaded.getPlayerPrivate(ra!, ra!.account.accountId);
    const bPriv = await reloaded.getPlayerPrivate(rb!, rb!.account.accountId);
    expect(aPriv.cashCents).toBe(START_CASH_CENTS - 20 * 100);
    expect(aPriv.positions).toEqual({ HALC });
    expect(aPriv.openOrders).toEqual({ ord_a1: LIMIT_BUY });
    expect(bPriv.cashCents).toBe(START_CASH_CENTS - 20 * 7);
    expect(bPriv.positions).toEqual({});
    expect(bPriv.openOrders).toEqual({});
  });

  it("an invalid commit is rejected and leaves memory and disk untouched", async () => {
    const file = await tempFile();
    const auth = new AuthService({ store: new FileAuthStore(file) });
    const a = await auth.register({ handle: "Atomic", password: "password1" });
    await auth.updateOwnPrivateState(a.view, () => ({ cashCents: 900, positions: { HALC }, openOrders: {} }));
    const before = await readFile(file, "utf8");
    await expect(
      auth.updateOwnPrivateState(a.view, (cur) => ({ ...cur, cashCents: -1 })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await auth.getPlayerPrivate(a.view, a.view.account.accountId)).cashCents).toBe(900);
  });

  describe("boundary validation", () => {
    const id = "acc_v" as AccountId;
    const ok = (over: Partial<PersistedOpenOrder>) => () =>
      buildPlayerPrivate(id, { cashCents: 1, positions: {}, openOrders: { [over.orderId ?? "ord_a1"]: { ...LIMIT_BUY, ...over } as PersistedOpenOrder } });
    const pos = (p: unknown, key = "HALC") => () =>
      buildPlayerPrivate(id, { cashCents: 1, positions: { [key]: p as PersistedPosition }, openOrders: {} });

    it("accepts the rich payload and normalizes to v2", () => {
      expect(buildPlayerPrivate(id, { cashCents: 0, positions: { HALC, VOLT }, openOrders: { ord_a1: LIMIT_BUY, ord_a2: STOP_SELL } })).toEqual({
        v: 2, accountId: id, cashCents: 0, positions: { HALC, VOLT }, openOrders: { ord_a1: LIMIT_BUY, ord_a2: STOP_SELL },
      });
    });

    it.each([
      ["negative cash", () => buildPlayerPrivate(id, { cashCents: -1, positions: {}, openOrders: {} })],
      ["fractional cash", () => buildPlayerPrivate(id, { cashCents: 1.5, positions: {}, openOrders: {} })],
      ["array positions", () => buildPlayerPrivate(id, { cashCents: 1, positions: [] as never, openOrders: {} })],
      ["legacy qty number", pos(2)],
      ["missing avgCost", pos({ assetId: "HALC", qty: "1" })],
      ["extra key", pos({ ...HALC, mark: "1" })],
      ["zero qty", pos({ ...HALC, qty: "0" })],
      ["negative avgCost", pos({ ...HALC, avgCost: "-1" })],
      ["float qty string", pos({ ...HALC, qty: "1e3" })],
      ["key/asset mismatch", pos(HALC, "VOLT")],
      ["bad asset id", pos({ ...HALC, assetId: "halc" }, "halc")],
      ["__proto__ key", pos(HALC, "__proto__")],
      ["limit without price", ok({ limit: undefined })],
      ["market with limit", ok({ type: "market" })],
      ["stop without stop", ok({ type: "stop_limit" })],
      ["unknown type", ok({ type: "iceberg" })],
      ["unknown tif", ok({ tif: "forever" })],
      ["unknown status", ok({ status: "FILLED" as never })],
      ["bad side", ok({ side: "HOLD" as never })],
      ["filled == qty", ok({ filled: "10" })],
      ["filled > qty", ok({ filled: "10.5" })],
      ["PARTIAL with no fill", ok({ filled: "0", avgPrice: "0" })],
      ["avgPrice before fill", ok({ status: "WORKING", filled: "0", avgPrice: "1" })],
      ["no avgPrice after fill", ok({ avgPrice: "0" })],
      ["zero limit", ok({ limit: "0" })],
      ["negative tick", ok({ placedTick: -1 })],
      ["key/order mismatch", () => buildPlayerPrivate(id, { cashCents: 1, positions: {}, openOrders: { other: LIMIT_BUY } })],
      ["extra order key (ownerAccountId)", ok({ ownerAccountId: "acc_evil" } as never)],
    ])("rejects %s", (_name, fn) => {
      expect(fn).toThrow(AuthError);
    });

    it("compares decimals exactly", () => {
      expect(compareUDec("10", "9.999")).toBe(1);
      expect(compareUDec("0010.50", "10.5")).toBe(0);
      expect(compareUDec("0.1", "0.10000001")).toBe(-1);
    });
  });

  describe("on-disk schema migration (never wipes)", () => {
    it("v1 starter rows migrate to v2 losslessly and are re-written as v2", async () => {
      const file = await tempFile();
      const first = new AuthService({ store: new FileAuthStore(file) });
      const a = await first.register({ handle: "Legacy", password: "password1" });
      const disk = JSON.parse(await readFile(file, "utf8")) as { players: Array<Record<string, unknown>> };
      // Rewrite the ledger exactly as the pre-M1-03 (M1-01) build stored it.
      disk.players = [{ accountId: a.view.account.accountId, cashCents: 654_321, positions: {}, openOrderIds: [] }];
      await writeFile(file, JSON.stringify(disk), "utf8");

      const second = new AuthService({ store: new FileAuthStore(file) });
      const v = await second.resolveSession(a.rawToken);
      expect(await second.getPlayerPrivate(v!, v!.account.accountId)).toEqual({
        v: 2, accountId: a.view.account.accountId, cashCents: 654_321, positions: {}, openOrders: {},
      });
      await second.updateOwnPrivateState(v!, (cur) => ({ ...cur, positions: { HALC } }));
      const after = JSON.parse(await readFile(file, "utf8")) as { players: Array<Record<string, unknown>> };
      expect(after.players[0]).toEqual({ v: 2, accountId: a.view.account.accountId, cashCents: 654_321, positions: { HALC }, openOrders: {} });
    });

    it("lossy v1 rows, corrupt rows and duplicates are quarantined verbatim, not dropped or invented", async () => {
      const file = await tempFile();
      const first = new AuthService({ store: new FileAuthStore(file) });
      const ok = await first.register({ handle: "Healthy", password: "password1" });
      const lossy = await first.register({ handle: "LossyV1", password: "password1" });
      const disk = JSON.parse(await readFile(file, "utf8")) as { players: Array<Record<string, unknown>> };
      const lossyRow = { accountId: lossy.view.account.accountId, cashCents: 50, positions: { HALC: 3 }, openOrderIds: ["ord_x"] };
      const corrupt = { accountId: "acc_corrupt", cashCents: -9, positions: {}, openOrderIds: [] };
      const future = { v: 9, accountId: "acc_future", cashCents: 1 };
      disk.players = [disk.players.find((p) => p.accountId === ok.view.account.accountId)!, lossyRow, corrupt, future, { junk: true }];
      await writeFile(file, JSON.stringify(disk), "utf8");

      const second = new AuthService({ store: new FileAuthStore(file) });
      const okV = await second.resolveSession(ok.rawToken);
      const lossyV = await second.resolveSession(lossy.rawToken);
      expect((await second.getPlayerPrivate(okV!, okV!.account.accountId)).cashCents).toBe(START_CASH_CENTS);
      await expect(second.getPlayerPrivate(lossyV!, lossyV!.account.accountId)).rejects.toMatchObject({ code: "LEDGER_QUARANTINED", status: 409 });
      await expect(second.updateOwnPrivateState(lossyV!, (c) => c)).rejects.toMatchObject({ code: "LEDGER_QUARANTINED" });

      // A later write by a healthy account must carry every quarantined row through unchanged.
      await second.updateOwnPrivateState(okV!, (cur) => ({ ...cur, cashCents: 1 }));
      const after = JSON.parse(await readFile(file, "utf8")) as { quarantinedPlayers: Array<{ row: unknown; reason: string }> };
      expect(after.quarantinedPlayers.map((q) => q.row)).toEqual([lossyRow, corrupt, future, { junk: true }]);
      expect(after.quarantinedPlayers[0]!.reason).toMatch(/cost basis/);

      const third = new AuthService({ store: new FileAuthStore(file) });
      const again = JSON.parse(await readFile(file, "utf8"));
      await third.updateOwnPrivateState((await third.resolveSession(ok.rawToken))!, (cur) => ({ ...cur, cashCents: 2 }));
      expect(JSON.parse(await readFile(file, "utf8")).quarantinedPlayers).toEqual(again.quarantinedPlayers);
    });

    it("duplicate ledger rows for one account are both quarantined", () => {
      const row = { v: 2, accountId: "acc_dup", cashCents: 1, positions: {}, openOrders: {} };
      expect(parsePlayerPrivateRow(row).ok).toBe(true);
      const snap = { accounts: [], sessions: [], players: [row, { ...row, cashCents: 2 }] };
      return (async () => {
        const file = await tempFile();
        await writeFile(file, JSON.stringify(snap), "utf8");
        const loaded = await new FileAuthStore(file).load();
        expect(loaded.players).toEqual([]);
        expect(loaded.quarantinedPlayers.map((q) => (q.row as { cashCents: number }).cashCents)).toEqual([1, 2]);
      })();
    });
  });

  it("no HTTP route can write the ledger (service-only seam; /me is read-only)", async () => {
    const files = (await readdir(path.join(process.cwd(), "src/app"), { recursive: true })).filter((f) => /\.(ts|tsx)$/.test(f));
    const writers: string[] = [];
    for (const f of files) {
      if ((await readFile(path.join(process.cwd(), "src/app", f), "utf8")).includes("updateOwnPrivateState")) writers.push(f);
    }
    expect(files.length).toBeGreaterThan(0);
    expect(writers).toEqual([]);
  });

  it("signed-in demo channels use server cashCents (not hardcoded starter)", () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_x", 17, { cashCents: 880_055 });
    expect(store.getState().channels.me.nw).toBe(cashCentsToMoney(880_055));
    expect(store.getState().liveNw).toBe("8800.55");
    // M1-06: no NW pin on the signed-in feed; `me` is the saved ledger at server marks once it is read.
    expect((getFeed() as MockFeed).scenario.nw).toBeNull();
    expect((getFeed() as MockFeed).authoritativeQuotes).toBe(true);
    expect(START_CASH_CENTS).toBe(1_000_000);
  });
});
