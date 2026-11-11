// M3-05: backup, wipe, restore — ledgers, world tick, and player isolation come back unchanged.
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthService,
  FileAuthStore,
  type PersistedOpenOrder,
  type PersistedPosition,
} from "@/server/auth";
import { FileStormWorldStore } from "@/server/market/stormWorldStore";
import { emptyStormWorld } from "@/server/market/storms";
import {
  BackupError,
  backupDataStore,
  listBackupIds,
  resolveStoreRoots,
  restoreDataStore,
} from "@/server/ops/dataBackup";
import {
  BACKUP_LOCK_NAME,
  holdServerLock,
  SERVER_LOCK_NAME,
} from "@/server/ops/serverLock";

const run = promisify(execFile);
const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
const tsconfig = path.join(process.cwd(), "tsconfig.json");

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

describe("M3-05 data store backup and restore", () => {
  const temps: string[] = [];
  const temp = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m3-05-bak-"));
    temps.push(dir);
    return dir;
  };
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("restores both ledgers and the world tick after the store is wiped", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backups");
    const storeFile = path.join(dataDir, "auth", "store.json");
    const auth = new AuthService({ store: new FileAuthStore(storeFile) });
    const a = await auth.register({ handle: "Alpha", password: "password1" });
    const b = await auth.register({ handle: "Bravo", password: "password1" });
    await auth.updateOwnPrivateState(a.view, () => ({
      cashCents: 812_345, positions: { HALC, VOLT }, openOrders: { ord_a1: LIMIT_BUY, ord_a2: STOP_SELL },
    }));
    await auth.updateOwnPrivateState(b.view, () => ({ cashCents: 5_000, positions: {}, openOrders: { ord_b1: B_ORDER } }));
    const world = emptyStormWorld();
    new FileStormWorldStore(path.join(dataDir, "market", "storm-world.json")).save({
      ...world,
      lastTick: 424242,
      world: { fear: 37, regime: "EXPANSION", daysIn: 4, change: null, closes: [101.5], dayOpen: 100, lastHour: 9, lastDay: 3 },
    });

    const roots = [{ name: "data", dir: dataDir }];
    const snap = await backupDataStore({ roots, backupDir, keep: 7 });
    expect(snap.files.map((f) => f.path).sort()).toEqual(["auth/store.json", "market/storm-world.json"]);
    await rm(dataDir, { recursive: true, force: true });
    expect(await readFile(path.join(snap.dir, "data", "auth", "store.json"), "utf8")).toContain("Alpha");

    const restored = await restoreDataStore({ roots, backupDir });
    expect(restored.id).toBe(snap.id);
    const next = new AuthService({ store: new FileAuthStore(storeFile) });
    const a2 = await next.resolveSession(a.rawToken);
    const b2 = await next.resolveSession(b.rawToken);
    expect(a2?.account.handle).toBe("Alpha");
    expect(b2?.account.handle).toBe("Bravo");
    const aPriv = await next.getPlayerPrivate(a2!, a2!.account.accountId);
    const bPriv = await next.getPlayerPrivate(b2!, b2!.account.accountId);
    expect(aPriv.cashCents).toBe(812_345);
    expect(aPriv.positions).toEqual({ HALC, VOLT });
    expect(aPriv.openOrders).toEqual({ ord_a1: LIMIT_BUY, ord_a2: STOP_SELL });
    expect(bPriv.cashCents).toBe(5_000);
    expect(bPriv.positions).toEqual({});
    expect(bPriv.openOrders).toEqual({ ord_b1: B_ORDER });
    expect(aPriv.positions).not.toEqual(bPriv.positions);
    await expect(next.getPlayerPrivate(a2!, b2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(next.getPlayerPrivate(b2!, a2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const storm = new FileStormWorldStore(path.join(dataDir, "market", "storm-world.json")).load();
    expect(storm.lastTick).toBe(424242);
    expect(storm.world).toMatchObject({ fear: 37, regime: "EXPANSION" });
  });

  it("keeps an outside auth directory, rotates snapshots, and refuses a bad hash", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data");
    const authDir = path.join(root, "auth-volume");
    const backupDir = path.join(root, "backups");
    const env: NodeJS.ProcessEnv = { ...process.env, QUAY_DATA_DIR: dataDir, QUAY_AUTH_DATA_DIR: authDir };
    delete env.QUAY_STORM_DATA_DIR;
    delete env.QUAY_TELEMETRY_DIR;
    const roots = resolveStoreRoots(env, root);
    expect(roots.map((r) => r.name)).toEqual(["data", "auth"]);
    const storeFile = path.join(authDir, "store.json");
    const auth = new AuthService({ store: new FileAuthStore(storeFile) });
    const a = await auth.register({ handle: "OutA", password: "password1" });
    await auth.updateOwnPrivateState(a.view, () => ({ cashCents: 42_000, positions: { HALC }, openOrders: {} }));
    await mkdir(path.join(dataDir, "market"), { recursive: true });
    await writeFile(path.join(dataDir, "market", "storm-world.json"), "{\"lastTick\":7}\n");

    const first = await backupDataStore({ roots, backupDir, keep: 2, now: new Date("2026-11-11T00:00:00.000Z") });
    await writeFile(path.join(dataDir, "market", "storm-world.json"), "{\"lastTick\":8}\n");
    await backupDataStore({ roots, backupDir, keep: 2, now: new Date("2026-11-11T00:00:01.000Z") });
    await writeFile(path.join(dataDir, "market", "storm-world.json"), "{\"lastTick\":9}\n");
    const third = await backupDataStore({ roots, backupDir, keep: 2, now: new Date("2026-11-11T00:00:02.000Z") });
    const ids = await listBackupIds(backupDir);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(third.id);
    expect(ids).not.toContain(first.id);

    const live = await readFile(storeFile, "utf8");
    const backed = path.join(third.dir, "auth", "store.json");
    const body = await readFile(backed, "utf8");
    await writeFile(backed, body.replace("OutA", "Haxx"));
    await expect(restoreDataStore({ roots, backupDir, id: third.id })).rejects.toBeInstanceOf(BackupError);
    expect(await readFile(storeFile, "utf8")).toBe(live);

    await writeFile(backed, body);
    await rm(authDir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
    await restoreDataStore({ roots, backupDir, id: third.id });
    const next = new AuthService({ store: new FileAuthStore(storeFile) });
    const a2 = await next.resolveSession(a.rawToken);
    expect((await next.getPlayerPrivate(a2!, a2!.account.accountId)).cashCents).toBe(42_000);
    expect((await next.getPlayerPrivate(a2!, a2!.account.accountId)).positions).toEqual({ HALC });
    expect(await readFile(path.join(dataDir, "market", "storm-world.json"), "utf8")).toContain("9");
  });

  it("dry-run writes nothing, a partial is not a snapshot, and a path escape is refused", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data", "auth");
    const backupDir = path.join(root, "backups");
    await mkdir(dataDir, { recursive: true });
    const file = path.join(dataDir, "store.json");
    await writeFile(file, "{\"ok\":true}\n");
    const roots = [{ name: "data", dir: path.join(root, "data") }];
    const plan = await backupDataStore({ roots, backupDir, dryRun: true });
    expect(plan.files).toHaveLength(1);
    expect(await listBackupIds(backupDir)).toEqual([]);
    expect(await readFile(file, "utf8")).toBe("{\"ok\":true}\n");

    await mkdir(path.join(backupDir, ".partial-crash"), { recursive: true });
    await expect(restoreDataStore({ roots, backupDir })).rejects.toBeInstanceOf(BackupError);
    expect(await readFile(file, "utf8")).toBe("{\"ok\":true}\n");

    const sentinel = path.join(root, "sentinel.txt");
    await writeFile(sentinel, "stay");
    const id = "20261111T010101000Z";
    const snapDir = path.join(backupDir, id);
    await mkdir(path.join(snapDir, "data"), { recursive: true });
    await writeFile(path.join(snapDir, "manifest.json"), `${JSON.stringify({
      v: 1, id, createdAt: "2026-11-11T01:01:01.000Z", roots: ["data"],
      files: [{ root: "data", path: "../sentinel.txt", bytes: 4, sha256: "0".repeat(64) }],
    })}\n`);
    await expect(restoreDataStore({ roots, backupDir, id })).rejects.toBeInstanceOf(BackupError);
    expect(await readFile(sentinel, "utf8")).toBe("stay");
    expect(await readFile(file, "utf8")).toBe("{\"ok\":true}\n");
  });

  it("runs the backup and restore scripts, and refuses a restore without --yes", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backups");
    const storeFile = path.join(dataDir, "auth", "store.json");
    const auth = new AuthService({ store: new FileAuthStore(storeFile) });
    const a = await auth.register({ handle: "ScriptA", password: "password1" });
    const b = await auth.register({ handle: "ScriptB", password: "password1" });
    await auth.updateOwnPrivateState(a.view, () => ({ cashCents: 111_111, positions: { HALC }, openOrders: { ord_a1: LIMIT_BUY } }));
    await auth.updateOwnPrivateState(b.view, () => ({ cashCents: 222_222, positions: {}, openOrders: { ord_b1: B_ORDER } }));
    const env = { ...process.env, QUAY_DATA_DIR: dataDir, QUAY_BACKUP_DIR: backupDir };
    const exec = (script: string, args: string[]) => run(tsx, ["--tsconfig", tsconfig, script, ...args], { cwd: process.cwd(), env });

    await expect(exec("scripts/ops/restore-data.ts", [])).rejects.toMatchObject({ code: 2 });
    expect(await readFile(storeFile, "utf8")).toContain("ScriptA");

    const backed = await exec("scripts/ops/backup-data.ts", []);
    expect(backed.stdout).toMatch(/backup-id: \d{8}T\d{9}Z/);
    await rm(dataDir, { recursive: true, force: true });
    const restored = await exec("scripts/ops/restore-data.ts", ["--yes"]);
    expect(restored.stdout).toMatch(/restored-id: /);
    const next = new AuthService({ store: new FileAuthStore(storeFile) });
    const a2 = await next.resolveSession(a.rawToken);
    const b2 = await next.resolveSession(b.rawToken);
    expect((await next.getPlayerPrivate(a2!, a2!.account.accountId)).cashCents).toBe(111_111);
    expect((await next.getPlayerPrivate(a2!, a2!.account.accountId)).positions).toEqual({ HALC });
    expect((await next.getPlayerPrivate(b2!, b2!.account.accountId)).cashCents).toBe(222_222);
    expect((await next.getPlayerPrivate(b2!, b2!.account.accountId)).openOrders).toEqual({ ord_b1: B_ORDER });
    await expect(next.getPlayerPrivate(a2!, b2!.account.accountId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);

  it("refuses restore while a server holds the directory and ignores a stale lock", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backups");
    const file = path.join(dataDir, "auth", "store.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{\"v\":1}\n");
    const roots = [{ name: "data", dir: dataDir }];
    await backupDataStore({ roots, backupDir, keep: 3 });
    await writeFile(file, "{\"v\":2}\n");
    await writeFile(path.join(dataDir, SERVER_LOCK_NAME), `${JSON.stringify({ v: 1, pid: 2147483646, starttime: "1", cwd: "" })}\n`);
    await restoreDataStore({ roots, backupDir });
    expect(await readFile(file, "utf8")).toBe("{\"v\":1}\n");

    await writeFile(file, "{\"v\":3}\n");
    const holder = path.join(root, "hold.mts");
    await writeFile(holder, [
      'import { holdServerLock } from "@/server/ops/serverLock";',
      "const dir = process.env.QUAY_HOLD_DIR;",
      "if (!dir) throw new Error(\"missing QUAY_HOLD_DIR\");",
      "await holdServerLock(dir);",
      "process.stdout.write(\"holding\\n\");",
      "await new Promise(() => {});",
    ].join("\n"));
    const child = spawn(tsx, ["--tsconfig", tsconfig, holder], {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, QUAY_HOLD_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("lock holder did not start")), 20_000);
      child.stdout?.on("data", (buf: Buffer) => {
        if (buf.toString().includes("holding")) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`holder exited ${code}`)); });
    });
    const stopHolder = () => {
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } }
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    };
    try {
      await started;
      await expect(restoreDataStore({ roots, backupDir })).rejects.toThrow(/still running/);
      expect(await readFile(file, "utf8")).toBe("{\"v\":3}\n");
    } finally {
      stopHolder();
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) resolve(null);
        else child.once("exit", () => resolve(null));
      });
    }
    await restoreDataStore({ roots, backupDir });
    expect(await readFile(file, "utf8")).toBe("{\"v\":1}\n");
  }, 30_000);

  it("lets two backups publish distinct snapshots, including over a stale backup lock", async () => {
    const root = await temp();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backups");
    await mkdir(path.join(dataDir, "auth"), { recursive: true });
    await writeFile(path.join(dataDir, "auth", "store.json"), "one\n");
    await mkdir(backupDir, { recursive: true });
    await writeFile(path.join(backupDir, BACKUP_LOCK_NAME), `${JSON.stringify({ v: 1, pid: 2147483646, starttime: "9", cwd: "" })}\n`);
    const roots = [{ name: "data", dir: dataDir }];
    const [a, b] = await Promise.all([
      backupDataStore({ roots, backupDir, keep: 5 }),
      backupDataStore({ roots, backupDir, keep: 5 }),
    ]);
    expect(a.id).not.toBe(b.id);
    const ids = await listBackupIds(backupDir);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(await readFile(path.join(a.dir, "data", "auth", "store.json"), "utf8")).toBe("one\n");
    expect(await readFile(path.join(b.dir, "data", "auth", "store.json"), "utf8")).toBe("one\n");
  });
});
