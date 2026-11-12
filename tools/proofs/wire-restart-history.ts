// Replayable proof for sys/wire-restart-history (b3): the Wire survives a restart.
// Parts (WRH_PARTS, comma list, default all): prices, cost, crash, errors.
// prices and cost import nothing this unit added, so the same file runs on main for the before/after comparison.
// Output: JSON files in WRH_EVIDENCE_DIR (default .).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveMarket } from "@/server/market/clock";
import { FileStormWorldStore } from "@/server/market/stormWorldStore";
import { FEED_TICK_MS, START_TICK } from "@/shell/contracts/mockFeed";

const SEED = 17;
const SECRET = "wrh-proof-secret";
const outDir = process.env.WRH_EVIDENCE_DIR ?? ".";
const parts = new Set((process.env.WRH_PARTS ?? "prices,cost,crash,errors").split(","));
mkdirSync(outDir, { recursive: true });
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
const out = (name: string, v: unknown) => { writeFileSync(join(outDir, name), JSON.stringify(v, null, 2) + "\n"); process.stdout.write(`${name}: ${JSON.stringify(v).slice(0, 400)}\n`); };
const stepTo = (m: LiveMarket, t: number) => { while (m.snapshot().tick < t) m.step(); };
const tmp = () => mkdtempSync(join(tmpdir(), "wrh-proof-"));

async function main(): Promise<void> {
let failed = false;

if (parts.has("prices")) {
  // Quotes + storm state across a file-store restart, at the restart and 60 / 720 steps later. Compare hashes main vs head.
  const rows: Record<string, unknown>[] = [];
  for (const cut of [START_TICK + 120, START_TICK + 1500]) {
    const d = tmp(); const f = join(d, "storm-world.json");
    const a = new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(f), rumorSecret: SECRET, seed: SEED });
    stepTo(a, cut);
    const pre = sha(a.snapshot());
    const b = new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(f), seed: SEED });
    const r: Record<string, unknown> = { cut, preRestartQuotes: pre, atRestart: sha(b.snapshot()), stormAtRestart: sha(b.stormSnapshot()) };
    for (let i = 0; i < 60; i++) b.step();
    r.after60 = sha(b.snapshot()); r.storm60 = sha(b.stormSnapshot());
    for (let i = 0; i < 660; i++) b.step();
    r.after720 = sha(b.snapshot()); r.storm720 = sha(b.stormSnapshot());
    r.wireRows = b.wire().items.length;
    rows.push(r);
    rmSync(d, { recursive: true, force: true });
  }
  out("prices.json", rows);
}

if (parts.has("cost")) {
  // Per-step wall time with the real file store over a long run, and the save cost/size of the snapshot with and
  // without the `wire` field at checkpoints (the largest Wire held = STORY_KEEP + held rumors at that point).
  const days = Number(process.env.WRH_DAYS ?? 20);
  const d = tmp(); const f = join(d, "storm-world.json");
  const store = new FileStormWorldStore(f);
  const m = new LiveMarket({ persistStorms: true, stormWorld: store, rumorSecret: SECRET, seed: SEED });
  const steps: number[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const total = days * 720;
  for (let i = 1; i <= total; i++) {
    const t0 = performance.now(); m.step(); steps.push(performance.now() - t0);
    if (i % 1440 === 0 || i === total) {
      const snap = store.load() as unknown as Record<string, unknown>;
      const noWire = { ...snap }; delete noWire.wire;
      const probe = new FileStormWorldStore(join(d, "probe.json"));
      const time = (s: unknown) => { const t = performance.now(); for (let k = 0; k < 20; k++) probe.save(s as never); const ms = (performance.now() - t) / 20; return { ms: +ms.toFixed(3), bytes: statSync(join(d, "probe.json")).size }; };
      const w = snap.wire as { items: unknown[] } | undefined;
      checkpoints.push({ day: +(i / 720).toFixed(1), tick: m.snapshot().tick, wireRows: m.wire().items.length, savedRows: w?.items.length ?? null, withWire: time(snap), withoutWire: time(noWire) });
    }
  }
  const sorted = steps.slice().sort((a, b) => a - b);
  const q = (p: number) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!.toFixed(3);
  const last1440 = steps.slice(-1440).sort((a, b) => a - b);
  const r = {
    days, steps: total, feedTickMs: FEED_TICK_MS,
    stepMs: { p50: q(0.5), p99: q(0.99), max: q(1) },
    lastDayStepMs: { p50: +last1440[Math.floor(0.5 * last1440.length)]!.toFixed(3), p99: +last1440[Math.floor(0.99 * last1440.length)]!.toFixed(3), max: +last1440[last1440.length - 1]!.toFixed(3) },
    overruns: steps.filter((s) => s >= FEED_TICK_MS).length,
    checkpoints,
  };
  if (r.overruns > 0) failed = true;
  out("cost.json", r);
  rmSync(d, { recursive: true, force: true });
}

if (parts.has("crash")) {
  // SIGKILL a writer looping over two complete snapshots; every boot read must be one complete snapshot.
  const kills = Number(process.env.WRH_KILLS ?? 50);
  const d = tmp(); const f = join(d, "storm-world.json");
  const child = join(process.cwd(), "tests", "unit", "wire", "fixtures", "storm-save-loop.ts");
  let midWrite = 0, complete = 0;
  const seen: Record<string, number> = {};
  for (let k = 0; k < kills; k++) {
    const p = spawn(process.execPath, ["--import", "tsx", child, f, "1000"], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise<void>((ok) => p.stdout!.once("data", () => ok()));
    await new Promise((ok) => setTimeout(ok, 20 + ((k * 53) % 400)));
    p.kill("SIGKILL");
    await new Promise((ok) => p.once("exit", ok));
    const tmps = readdirSync(d).filter((x) => x.endsWith(".tmp"));
    if (tmps.length) midWrite++;
    const snap = new FileStormWorldStore(f).load() as { wire?: { items: { id: string }[] } };
    const tags = new Set((snap.wire?.items ?? []).map((i) => i.id.slice(-1)));
    if (snap.wire && snap.wire.items.length === 1000 && tags.size === 1) { complete++; const t = [...tags][0]!; seen[t] = (seen[t] ?? 0) + 1; }
    for (const x of tmps) rmSync(join(d, x));
  }
  const r = { kills, killsThatLeftAHalfTmp: midWrite, completeBootReads: complete, snapshotsSeen: seen, fileBytes: statSync(f).size };
  if (complete !== kills) failed = true;
  out("crash.json", r);
  rmSync(d, { recursive: true, force: true });
}

if (parts.has("errors")) {
  // Operator errors for a corrupt and a newer `wire`, exactly as thrown at boot (console.error shows the same line).
  const d = tmp(); const f = join(d, "storm-world.json");
  const a = new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(f), rumorSecret: SECRET, seed: SEED });
  stepTo(a, START_TICK + 60);
  const good = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  const boot = (wire: unknown) => {
    const bytes = JSON.stringify({ ...good, wire });
    writeFileSync(f, bytes);
    try { new LiveMarket({ persistStorms: true, stormWorld: new FileStormWorldStore(f), seed: SEED }); return { refused: false }; }
    catch (e) { const err = e as Error & { code?: string }; return { refused: true, code: err.code, message: err.message, fileUnchanged: readFileSync(f, "utf8") === bytes, echoesSecret: err.message.includes(SECRET) }; }
  };
  const w = good.wire as { v: number; items: unknown[] };
  const r = { corruptNotObject: boot("nope"), corruptItem: boot({ v: 1, items: [{ id: 5 }] }), corruptDup: boot({ v: 1, items: [w.items[0], w.items[0]] }), newer: boot({ ...w, v: 2 }) };
  if (!Object.values(r).every((x) => x.refused && x.fileUnchanged && !x.echoesSecret)) failed = true;
  out("errors.json", r);
  rmSync(d, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
}
void main();
