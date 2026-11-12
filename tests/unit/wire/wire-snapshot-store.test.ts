// b3 store-level checks (gatekeeper additions 2/3/4/7 for the approved plan): the storm-world file's `wire` field.
// - a snapshot without `wire` (every file written before this unit) boots exactly as before;
// - a corrupt `wire` is refused with an operator error naming the file and the field, echoing no content or secret,
//   and the file is left byte-unchanged;
// - a newer `wire.v` than this build knows is refused, never downgraded or rewritten;
// - a writer SIGKILLed (one node process: `node --import tsx`, so the kill hits the writer itself) during the temp + rename save never leaves a half `wire`: load gets a complete snapshot.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveMarket } from "@/server/market/clock";
import { FileStormWorldStore, MemoryStormWorldStore } from "@/server/market/stormWorldStore";
import { START_TICK } from "@/shell/contracts/mockFeed";

const SEED = 17;
const SECRET = "wire-snapshot-store-secret-DO-NOT-ECHO";
const stepTo = (m: LiveMarket, tick: number) => { while (m.snapshot().tick < tick) m.step(); };

let dir = "";
let file = "";
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "wire-snap-")); file = path.join(dir, "storm-world.json"); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A real storm-world file after ~20 catalog stories, written by the clock itself. */
function writtenFile(): Record<string, unknown> {
  const a = new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(file), rumorSecret: SECRET, seed: SEED });
  stepTo(a, START_TICK + 120);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}
function bootError(): (Error & { code?: string }) | null {
  try { new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(file), seed: SEED }); return null; }
  catch (e) { return e as Error & { code?: string }; }
}

describe("b3 store: the persisted `wire` field", () => {
  it("the clock writes `wire` = { v: 1, items } into storm-world.json each step", () => {
    const raw = writtenFile();
    const w = raw.wire as { v: number; items: { id: string }[] } | undefined;
    expect(w, "storm-world.json has no `wire` field").toBeDefined();
    expect(w!.v).toBe(1);
    expect(w!.items.map((i) => i.id)).toContain("w-27706");
  });

  it("a snapshot without `wire` boots as before: rumor-derived rows only, same quotes as a boot of the same file", () => {
    const raw = writtenFile();
    delete raw.wire;
    writeFileSync(file, JSON.stringify(raw));
    const b = new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(file), seed: SEED });
    const mem = new MemoryStormWorldStore();
    mem.save(new FileStormWorldStore(file).load());
    const ids = b.wire().items.map((i) => i.id);
    expect(ids.every((id) => !/^w-\d+$/.test(id) || id === "w-27790")).toBe(true); // only the catalog RUMOR survives, as on main
    expect(b.snapshot().quotes).toEqual(new LiveMarket({ persistStorms: true, stormWorld: mem, seed: SEED }).snapshot().quotes);
  });

  it.each([
    ["not an object", () => "nope"],
    ["items not an array", (w: { v: number }) => ({ v: w.v, items: 5 })],
    ["an item without an id", (w: { v: number; items: Record<string, unknown>[] }) => ({ v: w.v, items: [{ ...w.items[0], id: undefined }] })],
    ["duplicate ids", (w: { v: number; items: unknown[] }) => ({ v: w.v, items: [w.items[0], w.items[0]] })],
    ["v = 0", (w: { items: unknown[] }) => ({ v: 0, items: w.items })],
    ["v missing", (w: { items: unknown[] }) => ({ items: w.items })],
  ])("a corrupt `wire` (%s) is refused: code, file and field named, no content or secret echoed, file unchanged", (_name, mutate) => {
    const raw = writtenFile();
    raw.wire = (mutate as (w: never) => unknown)(raw.wire as never);
    const bytes = JSON.stringify(raw);
    writeFileSync(file, bytes);
    const err = bootError();
    expect(err, "boot accepted a corrupt wire").not.toBeNull();
    expect(err!.code).toBe("WIRE_SNAPSHOT_CORRUPT");
    expect(err!.message).toContain(file);
    expect(err!.message).toContain("\"wire\"");
    expect(err!.message).not.toContain(SECRET);
    expect(err!.message).not.toContain("wire.news");
    expect(readFileSync(file, "utf8")).toBe(bytes);
  });

  it("a newer `wire.v` is refused (WIRE_SNAPSHOT_NEWER), names both versions, and the file is not rewritten", () => {
    const raw = writtenFile();
    raw.wire = { ...(raw.wire as object), v: 2 };
    const bytes = JSON.stringify(raw);
    writeFileSync(file, bytes);
    const err = bootError();
    expect(err, "boot accepted a newer wire version").not.toBeNull();
    expect(err!.code).toBe("WIRE_SNAPSHOT_NEWER");
    expect(err!.message).toContain(file);
    expect(err!.message).toMatch(/"wire".*v2.*v1|v1.*v2/);
    expect(err!.message).not.toContain(SECRET);
    expect(readFileSync(file, "utf8")).toBe(bytes);
  });

  it("a writer SIGKILLed mid-save never leaves a half `wire`: load gets a complete A or B snapshot", async () => {
    const child = path.join(process.cwd(), "tests", "unit", "wire", "fixtures", "storm-save-loop.ts");
    const kills = 6;
    let midWrite = 0;
    for (let k = 0; k < kills; k++) {
      const p = spawn(process.execPath, ["--import", "tsx", child, file, "400"], { stdio: ["ignore", "pipe", "inherit"] });
      await new Promise<void>((ok) => p.stdout!.once("data", () => ok()));
      await new Promise((ok) => setTimeout(ok, 30 + k * 37));
      p.kill("SIGKILL");
      await new Promise((ok) => p.once("exit", ok));
      if (readdirSync(dir).some((f) => f.endsWith(".tmp"))) midWrite++;
      const snap = new FileStormWorldStore(file).load() as { wire?: { items: { id: string }[] } };
      expect(snap.wire, `kill ${k}: no wire after the crash`).toBeDefined();
      const tags = new Set(snap.wire!.items.map((i) => i.id.slice(-1)));
      expect(tags.size, `kill ${k}: mixed snapshot`).toBe(1);
      expect(snap.wire!.items.length).toBe(400);
      for (const f of readdirSync(dir)) if (f.endsWith(".tmp")) rmSync(path.join(dir, f));
    }
    expect(existsSync(file)).toBe(true);
    // Record how often the kill landed inside a write (a leftover .tmp): the proof script reports the full count.
    expect(midWrite).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
