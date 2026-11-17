// Starts sim/server.ts beside the Next process. One world, loopback only.
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_PORT = 47317;

interface Slot {
  ready?: Promise<string>;
  child?: ChildProcess | null;
  owned?: boolean;
}

const slot = globalThis as typeof globalThis & { __quaySim?: Slot };

function port(): number {
  const n = Number(process.env.SIM_PORT ?? DEFAULT_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

export function simOrigin(): string {
  return `http://127.0.0.1:${port()}`;
}

async function ping(origin: string): Promise<boolean> {
  try {
    const res = await fetch(origin + "/scenarios", { signal: AbortSignal.timeout(400) });
    if (!res.ok) return false;
    const body = await res.json() as { scenarios?: unknown };
    return Array.isArray(body.scenarios);
  } catch {
    return false;
  }
}

function listen(child: ChildProcess, origin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (tick) clearInterval(tick);
      if (timer) clearTimeout(timer);
      fn();
    };
    timer = setTimeout(() => finish(() => reject(new Error(`simulation did not listen on ${origin}`))), 20_000);
    tick = setInterval(() => {
      if (child.exitCode !== null) {
        finish(() => reject(new Error(`simulation exited (${child.exitCode}) before it listened`)));
        return;
      }
      void ping(origin).then((ok) => { if (ok) finish(() => resolve()); });
    }, 200);
  });
}

/** Resolve once sim/server.ts is accepting requests. A second call shares the same process. */
export function ensureSim(): Promise<string> {
  const g = (slot.__quaySim ??= {});
  if (!g.ready) {
    if (!process.env.SIM_PORT) process.env.SIM_PORT = String(port());
    const origin = simOrigin();
    g.ready = (async () => {
      if (await ping(origin)) return origin;
      const script = path.join(process.cwd(), "sim", "server.ts");
      const child = spawn(process.execPath, ["--experimental-strip-types", script, "--port", String(port())], {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      g.child = child;
      g.owned = true;
      child.stdout?.on("data", (buf: Buffer) => process.stdout.write(buf));
      child.stderr?.on("data", (buf: Buffer) => process.stderr.write(buf));
      child.on("exit", () => {
        if (g.child === child) {
          g.child = null;
          g.owned = false;
          g.ready = undefined;
        }
      });
      const stop = () => { try { child.kill(); } catch { /* already gone */ } };
      process.once("exit", stop);
      try {
        await listen(child, origin);
      } catch (err) {
        if (await ping(origin)) return origin;
        stop();
        g.ready = undefined;
        throw err;
      }
      console.log(`[quay] simulation ${origin}`);
      return origin;
    })();
  }
  return g.ready;
}
