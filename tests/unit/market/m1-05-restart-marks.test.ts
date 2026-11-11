import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as marketGet } from "@/app/api/market/route";
import { POST as register } from "@/app/api/auth/register/route";
import { ASSETS } from "@/market/catalog";
import { getCandles } from "@/server/market/candles";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { CorruptPathSnapshotError } from "@/server/market/pathSnapshot";
import { FileStormWorldStore, MemoryStormWorldStore, normalizeStormWorld } from "@/server/market/stormWorldStore";
import {
  AuthService,
  MemoryAuthStore,
  SESSION_COOKIE_NAME,
  setAuthServiceForTests,
} from "@/server/auth";
import { START_TICK } from "@/shell/contracts/mockFeed";

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const hit = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) throw new Error("missing session cookie");
  return hit.split(";")[0]!;
}

async function registerAs(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return cookieFrom(res);
}

async function marketQuotes() {
  const res = await marketGet();
  expect(res.status).toBe(200);
  return (await res.json()) as { tick: number; quotes: { rows: Record<string, { last: string }> } };
}

function halcBase(): number {
  return ASSETS.find((a) => a.assetId === "HALC")!.base;
}

describe("M1-05 restart resumes the quote path", () => {
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    setLiveMarketForTests(undefined);
  });
  afterEach(() => {
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
  });

  it("a mid-session restart continues the last price and the chart, and the same snapshot plus the same ticks stays deterministic", () => {
    const store = new MemoryStormWorldStore();
    const a = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: store });
    const recA = getCandles(a);
    for (let i = 0; i < 40; i++) a.step();
    const mid = a.snapshot();
    const midFork = new MemoryStormWorldStore();
    midFork.save(store.load());
    const histMid = recA.history({ assetId: "HALC", res: "tick", from: START_TICK, to: mid.tick });
    const midRev = recA.revision;
    const midEpoch = recA.epoch;
    expect(histMid.length).toBeGreaterThan(1);
    expect(Number(mid.quotes.rows.HALC!.last.replace(".", ""))).not.toBe(halcBase());

    for (let i = 0; i < 12; i++) a.step();
    const endA = a.snapshot();

    const b = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: midFork });
    expect(b.snapshot().tick).toBe(mid.tick);
    expect(b.snapshot().quotes).toEqual(mid.quotes);
    const recB = getCandles(b);
    expect(recB.epoch).toBe(midEpoch);
    expect(recB.revision).toBe(midRev);
    expect(recB.history({ assetId: "HALC", res: "tick", from: START_TICK, to: mid.tick })).toEqual(histMid);

    for (let i = 0; i < 12; i++) b.step();
    expect(b.snapshot().tick).toBe(endA.tick);
    expect(b.snapshot().quotes).toEqual(endA.quotes);
    expect(recB.history({ assetId: "HALC", res: "tick", from: START_TICK, to: endA.tick }))
      .toEqual(recA.history({ assetId: "HALC", res: "tick", from: START_TICK, to: endA.tick }));
  });

  it("two accounts see the same resumed quotes after a mid-session restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restart-marks-"));
    const file = join(dir, "storm-world.json");
    try {
      const first = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: new FileStormWorldStore(file) });
      setLiveMarketForTests(first);
      const cookieA = await registerAs("MarksA");
      const cookieB = await registerAs("MarksB");
      expect(cookieA).not.toBe(cookieB);
      for (let i = 0; i < 24; i++) first.step();
      const before = first.snapshot();
      const qA = await marketQuotes();
      const qB = await marketQuotes();
      expect(qA.quotes).toEqual(before.quotes);
      expect(qB.quotes).toEqual(before.quotes);
      expect(qA.quotes).toEqual(qB.quotes);
      first.stop();

      const resumed = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: new FileStormWorldStore(file) });
      setLiveMarketForTests(resumed);
      expect(resumed.snapshot().tick).toBe(before.tick);
      expect(resumed.snapshot().quotes).toEqual(before.quotes);
      const rA = await marketQuotes();
      const rB = await marketQuotes();
      expect(rA.quotes).toEqual(before.quotes);
      expect(rB.quotes).toEqual(before.quotes);
      expect(rA.tick).toBe(before.tick);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a corrupt path snapshot fails closed and leaves the file untouched; an absent path is the upgrade", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-corrupt-"));
    const file = join(dir, "storm-world.json");
    const sha = () => createHash("sha256").update(readFileSync(file)).digest("hex");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ok = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: new FileStormWorldStore(file) });
      for (let i = 0; i < 16; i++) ok.step();
      const walked = ok.snapshot();
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      expect(raw.path).toBeTruthy();

      const poison = (path: unknown) => {
        writeFileSync(file, JSON.stringify({ ...raw, path }));
        const hash = sha();
        const mtime = statSync(file).mtimeMs;
        const body = readFileSync(file);
        expect(() => new LiveMarket({ seed: 17, persistStorms: true, stormWorld: new FileStormWorldStore(file) })).toThrow(CorruptPathSnapshotError);
        expect(sha()).toBe(hash);
        expect(statSync(file).mtimeMs).toBe(mtime);
        expect(readFileSync(file).equals(body)).toBe(true);
      };
      poison({});
      poison(null);
      poison({ v: 1 });
      poison({ v: 1, tick: walked.tick, rand: 0, cryptoFactor: { a: 1, spare: null }, assets: {}, extraRand: {}, memes: {}, lookback: {} });
      poison({ ...((raw.path as object) ?? {}), tick: (walked.tick as number) + 99 });
      expect(() => normalizeStormWorld({ ...raw, path: { v: 2 } })).toThrow(CorruptPathSnapshotError);
      expect(normalizeStormWorld({}).path).toBeUndefined();

      const { path: _drop, ...without } = raw;
      writeFileSync(file, JSON.stringify(without));
      const upgraded = new LiveMarket({ seed: 17, persistStorms: true, stormWorld: new FileStormWorldStore(file) });
      expect(upgraded.snapshot().tick).toBe(walked.tick);
      expect(upgraded.snapshot().quotes).not.toEqual(walked.quotes);
      expect(Number(upgraded.snapshot().quotes.rows.HALC!.last.replace(".", ""))).not.toBe(
        Number(walked.quotes.rows.HALC!.last.replace(".", "")),
      );
      upgraded.step();
      const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      expect(saved.path).toBeTruthy();
    } finally {
      err.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
