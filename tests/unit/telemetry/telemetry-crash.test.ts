import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appendError, flushTelemetry, recoverTelemetryDir, resetOptOutCache } from "@/server/telemetry/log";

const SEQ = /seq\d{6}/;

function waitExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function parseLogDir(dir: string): Promise<Set<string>> {
  const names = await readdir(dir);
  expect(names.filter((n) => n.endsWith(".tmp")), "leftover temp after recovery").toEqual([]);
  const ids = new Set<string>();
  for (const name of names) {
    const raw = await readFile(path.join(dir, name), "utf8");
    if (raw.length > 0) expect(raw.endsWith("\n"), name).toBe(true);
    for (const line of raw.split("\n")) {
      if (!line) continue;
      const row = JSON.parse(line) as { message?: string; requestId?: string };
      for (const value of [row.message, row.requestId]) {
        const id = typeof value === "string" ? SEQ.exec(value)?.[0] : undefined;
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

describe("telemetry log crash safety", () => {
  const temps: string[] = [];
  let script: string;

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "quay-tel-crash-src-"));
    temps.push(dir);
    script = path.join(dir, "writer.mts");
    await writeFile(script, [
      'import { writeSync } from "node:fs";',
      'import { appendError } from "@/server/telemetry/log";',
      "const n = Number(process.env.TELEM_N);",
      "for (let i = 0; i < n; i++) {",
      "  const id = `seq${String(i).padStart(6, '0')}`;",
      "  await appendError({ requestId: id, route: '/broker', message: id });",
      "  writeSync(1, `ACK ${id}\\n`);",
      "}",
      "",
    ].join("\n"), "utf8");
  });

  afterEach(async () => {
    delete process.env.QUAY_TELEMETRY_DIR;
    resetOptOutCache();
    await flushTelemetry();
  });

  afterAll(async () => {
    await Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function freshDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "quay-tel-crash-"));
    temps.push(dir);
    return dir;
  }

  it("truncates a torn tail on the next append and keeps the acknowledged line", async () => {
    const dir = await freshDir();
    process.env.QUAY_TELEMETRY_DIR = dir;
    await writeFile(path.join(dir, "errors.jsonl"), '{"message":"seq000001"}\n{"message":"seq00000', "utf8");
    await appendError({ requestId: "seq000002", route: "/broker", message: "seq000002" });
    const ids = await parseLogDir(dir);
    expect(ids.has("seq000001")).toBe(true);
    expect(ids.has("seq000002")).toBe(true);
    expect([...ids].some((id) => id.startsWith("seq00000") && id !== "seq000001" && id !== "seq000002")).toBe(false);
  });

  it("drops a leftover temp when the destination already exists", async () => {
    const dir = await freshDir();
    await writeFile(path.join(dir, "errors.jsonl.1"), '{"message":"seq000010"}\n', "utf8");
    await writeFile(path.join(dir, "errors.jsonl.1.tmp"), '{"message":"seq000099"}\n', "utf8");
    await recoverTelemetryDir(dir);
    const ids = await parseLogDir(dir);
    expect(ids.has("seq000010")).toBe(true);
    expect(ids.has("seq000099")).toBe(false);
  });

  it("installs a complete leftover temp when the destination is missing and drops its torn tail", async () => {
    const dir = await freshDir();
    await writeFile(
      path.join(dir, "events.jsonl.tmp"),
      '{"event":"signup","anonId":"anon_abcdabcdabcdabcd"}\n{"event":"tor',
      "utf8",
    );
    await recoverTelemetryDir(dir);
    const names = await readdir(dir);
    expect(names).toEqual(["events.jsonl"]);
    const raw = await readFile(path.join(dir, "events.jsonl"), "utf8");
    expect(raw).toBe('{"event":"signup","anonId":"anon_abcdabcdabcdabcd"}\n');
    expect(JSON.parse(raw.trim())).toMatchObject({ event: "signup" });
  });

  it("SIGKILL during writes keeps the log parseable and keeps every acknowledged id", async () => {
    const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
    const tsconfig = path.join(process.cwd(), "tsconfig.json");
    // Ack kills straddle rotation (~550 lines per 64 KB file). A short lag lands inside
    // the next append or rename. Delay kills use a max the child cannot finish first.
    const kills: Array<{ acks?: number; lagMs?: number; ms?: number; max: number }> = [
      { acks: 0, max: 400 },
      { acks: 1, lagMs: 0, max: 400 },
      { acks: 1, lagMs: 2, max: 400 },
      { acks: 2, lagMs: 1, max: 400 },
      { acks: 8, lagMs: 3, max: 400 },
      { acks: 30, lagMs: 0, max: 400 },
      { acks: 80, lagMs: 2, max: 400 },
      { acks: 200, lagMs: 1, max: 500 },
      { acks: 480, lagMs: 2, max: 800 },
      { acks: 540, lagMs: 0, max: 800 },
      { acks: 560, lagMs: 4, max: 900 },
      { acks: 700, lagMs: 1, max: 1000 },
      { acks: 1000, lagMs: 3, max: 1300 },
      { acks: 1250, lagMs: 1, max: 1500 },
      { ms: 0, max: 800 },
      { ms: 8, max: 800 },
      { ms: 25, max: 800 },
      { ms: 70, max: 1000 },
      { ms: 180, max: 1200 },
      { ms: 400, max: 1600 },
    ];
    let killed = 0;
    let sawRotationWindow = false;

    for (const kill of kills) {
      const dir = await freshDir();
      const child = spawn(tsx, ["--tsconfig", tsconfig, script], {
        cwd: process.cwd(),
        env: { ...process.env, QUAY_TELEMETRY_DIR: dir, TELEM_N: String(kill.max) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdoutClosed = once(child.stdout!, "close");
      let buf = "";
      let err = "";
      const acks: string[] = [];
      let stop = false;
      let killResult: boolean | null = null;
      const armKill = () => {
        if (stop) return;
        stop = true;
        killResult = child.kill("SIGKILL");
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const armSoon = (ms: number) => {
        if (stop || timer) return;
        if (ms <= 0) armKill();
        else timer = setTimeout(armKill, ms);
      };
      child.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.startsWith("ACK ")) acks.push(line.slice(4));
          if (kill.acks !== undefined && kill.acks > 0 && acks.length >= kill.acks) armSoon(kill.lagMs ?? 0);
          nl = buf.indexOf("\n");
        }
      });
      child.stderr!.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      if (kill.ms !== undefined) armSoon(kill.ms);
      if (kill.acks === 0) setImmediate(armKill);
      const exit = await waitExit(child);
      clearTimeout(timer);
      await stdoutClosed;
      expect(
        exit.signal,
        `plan=${JSON.stringify(kill)} code=${exit.code} acks=${acks.length} kill=${String(killResult)} pid=${child.pid} err=${err}`,
      ).toBe("SIGKILL");
      killed += 1;
      if (acks.length >= 520) sawRotationWindow = true;

      await recoverTelemetryDir(dir);
      const ids = await parseLogDir(dir);
      for (const id of acks) {
        expect(ids.has(id), `missing ${id} after ${acks.length} acks (${err})`).toBe(true);
      }
    }

    expect(killed).toBe(kills.length);
    expect(sawRotationWindow, "at least one kill must land after a rotation-sized prefix").toBe(true);
  }, 180_000);
});
