// Port Avalon verification harness.
//   npx tsx tools/verify/port-avalon.ts launch|doctor|drive|cleanup|run
// Starts a production `next start` on a free port, drives the player UI, and
// tears the process down by the pid this command started.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { BANNED_PORTS, EVIDENCE_ROOT, REPO_ROOT, STATE_PATH, VERIFY_DIR, readState, writeState, type VerifyState } from "./state";
import { drivePlayerJourney, type ViewportName } from "./player-journey";

type Command = "launch" | "doctor" | "drive" | "cleanup" | "run";

const COMMANDS: readonly Command[] = ["launch", "doctor", "drive", "cleanup", "run"];

/** Build-time flags that would make this a test build instead of the player build. */
const STRIP_FROM_BUILD = [
  "QUAY_DS",
  "QUAY_HOOKS",
  "NEXT_PUBLIC_CITY_E2E",
  "NEXT_PUBLIC_QUAY_E2E",
  "QUAY_OFFICIAL_E2E_BUILD",
  "NEXT_PUBLIC_QUAY_MOCK_PHASE",
  "NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL",
  "NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL",
  "QUAY_AUTH_STORE",
] as const;

function usage(): never {
  console.error("usage: npx tsx tools/verify/port-avalon.ts <launch|doctor|drive|cleanup|run> [--viewport desktop|phone]");
  process.exit(2);
}

function isCommand(v: string): v is Command {
  return (COMMANDS as readonly string[]).includes(v);
}

function isViewport(v: string): v is ViewportName {
  return v === "desktop" || v === "phone";
}

function parseArgs(argv: string[]): { command: Command; viewport: ViewportName | "both" } {
  const command = argv[2];
  if (!command || !isCommand(command)) usage();
  let viewport: ViewportName | "both" = "both";
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--viewport") {
      const value = argv[++i];
      if (!value || !isViewport(value)) usage();
      viewport = value;
      continue;
    }
    usage();
  }
  return { command, viewport };
}

function playerEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of STRIP_FROM_BUILD) delete env[key];
  return env;
}

function nextBin(): string {
  const bin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(bin)) throw new Error(`missing ${bin}. Run npm ci in the repo first.`);
  return bin;
}

function findPort(): Promise<number> {
  const tryPort = (port: number): Promise<number> => {
    if (port > 3999) return Promise.reject(new Error("no free port in 3310-3999 outside 3199 and 3102"));
    if (BANNED_PORTS.has(port)) return tryPort(port + 1);
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", () => { resolve(tryPort(port + 1)); });
      server.listen(port, "127.0.0.1", () => {
        server.close((err) => { if (err) reject(err); else resolve(port); });
      });
    });
  };
  return tryPort(3310);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readEnviron(pid: number): Map<string, string> | null {
  let raw: string;
  try { raw = readFileSync(`/proc/${pid}/environ`).toString("utf8"); }
  catch { return null; }
  const vars = new Map<string, string>();
  for (const pair of raw.split("\0")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    vars.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return vars;
}

function isOurServer(state: VerifyState): boolean {
  // `next start` retitles the process to `next-server`, so the command line is not a stable id.
  // The pid is ours only while it still carries the auth directory and host this launch wrote.
  const vars = readEnviron(state.pid);
  if (!vars) return false;
  return vars.get("QUAY_AUTH_DATA_DIR") === state.dataDir
    && vars.get("QUAY_PUBLIC_HOST") === `127.0.0.1:${state.port}`;
}

function childPids(pid: number): number[] {
  const out: number[] = [];
  let names: string[];
  try { names = readdirSync("/proc"); }
  catch { return out; }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    let stat: string;
    try { stat = readFileSync(`/proc/${name}/stat`, "utf8"); }
    catch { continue; }
    const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const ppid = Number(rest[1]);
    if (ppid === pid) out.push(Number(name));
  }
  return out;
}

function processTree(pid: number): number[] {
  const kids = childPids(pid);
  return [pid, ...kids.flatMap(processTree)];
}

function listenInode(port: number): string | null {
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text: string;
    try { text = readFileSync(file, "utf8"); }
    catch { continue; }
    for (const line of text.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const local = parts[1] ?? "";
      const state = parts[3] ?? "";
      const inode = parts[9] ?? "";
      const localPort = local.split(":")[1] ?? "";
      if (state === "0A" && localPort.toUpperCase() === hex) return inode;
    }
  }
  return null;
}

function pidOwnsInode(pid: number, inode: string): boolean {
  const fdDir = `/proc/${pid}/fd`;
  let fds: string[];
  try { fds = readdirSync(fdDir); }
  catch { return false; }
  for (const fd of fds) {
    try {
      if (readlinkSync(path.join(fdDir, fd)) === `socket:[${inode}]`) return true;
    } catch { /* fd closed while we looked */ }
  }
  return false;
}

function treeOwnsPort(pid: number, port: number): boolean {
  const inode = listenInode(port);
  if (!inode) return false;
  return processTree(pid).some((candidate) => pidOwnsInode(candidate, inode));
}

async function waitForReady(url: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  let last = "no response yet";
  while (Date.now() < deadline) {
    try {
      const home = await fetch(url);
      const world = await fetch(`${url}/api/world`);
      const market = await fetch(`${url}/api/market`);
      if (home.ok && world.ok && market.ok) {
        const worldBody: unknown = await world.json();
        const marketBody: unknown = await market.json();
        const worldId = readWorldId(worldBody);
        const tick = readTick(marketBody);
        if (worldId === "world_port_avalon" && tick !== null) return;
        last = `world=${worldId ?? "missing"} tick=${tick ?? "missing"}`;
      } else {
        last = `home ${home.status} world ${world.status} market ${market.status}`;
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`production server did not become usable at ${url}: ${last}`);
}

function readWorldId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const world = (body as { world?: { worldId?: unknown } }).world;
  return world && typeof world.worldId === "string" ? world.worldId : null;
}

function readTick(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const tick = (body as { tick?: unknown }).tick;
  return typeof tick === "number" ? tick : null;
}

function signalTree(pid: number, signal: NodeJS.Signals): void {
  const pids = processTree(pid).reverse();
  for (const candidate of pids) {
    try { process.kill(candidate, signal); }
    catch { /* already gone */ }
  }
}

async function killOurs(state: VerifyState): Promise<void> {
  if (!isOurServer(state)) {
    if (readEnviron(state.pid) === null) return;
    throw new Error(`refusing to signal pid ${state.pid}: it is not the verification server recorded in state.json`);
  }
  signalTree(state.pid, "SIGTERM");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && pidAlive(state.pid)) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (pidAlive(state.pid) && isOurServer(state)) signalTree(state.pid, "SIGKILL");
}

function buildProduction(): void {
  console.log("building production app without e2e flags");
  const result = spawnSync(process.execPath, [nextBin(), "build"], {
    cwd: REPO_ROOT,
    env: playerEnv(process.env),
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`next build exited ${result.status ?? "null"}`);
}

async function launch(): Promise<VerifyState> {
  const existing = readState();
  if (existing && isOurServer(existing)) {
    throw new Error(`verification server already running as pid ${existing.pid} at ${existing.url}. Run cleanup first.`);
  }
  const port = await findPort();
  if (BANNED_PORTS.has(port)) throw new Error(`refusing banned port ${port}`);
  buildProduction();
  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const dataDir = path.join(VERIFY_DIR, `auth-${startedAt}`);
  const logFile = path.join(VERIFY_DIR, `server-${startedAt}.log`);
  mkdirSync(dataDir, { recursive: true });
  const url = `http://127.0.0.1:${port}`;
  const env = playerEnv(process.env);
  env.QUAY_AUTH_DATA_DIR = dataDir;
  env.QUAY_PUBLIC_HOST = `127.0.0.1:${port}`;
  const logFd = openSync(logFile, "a");
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [nextBin(), "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: REPO_ROOT,
      env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
  } catch (err) {
    throw new Error(`failed to start next: ${err instanceof Error ? err.message : String(err)}`);
  }
  child.unref();
  if (!child.pid) throw new Error("next start did not return a pid");
  const state: VerifyState = { pid: child.pid, port, url, dataDir, logFile, startedAt, evidenceDir: null };
  writeState(state);
  try {
    await waitForReady(url);
  } catch (err) {
    await killOurs(state);
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(STATE_PATH, { force: true });
    throw err;
  }
  if (!treeOwnsPort(state.pid, state.port)) {
    await killOurs(state);
    throw new Error(`pid ${state.pid} is not listening on ${state.port}`);
  }
  console.log(`ready ${state.url} pid ${state.pid}`);
  return state;
}

async function doctor(): Promise<void> {
  const state = readState();
  if (!state) throw new Error("no verification server. Run launch first.");
  if (BANNED_PORTS.has(state.port)) throw new Error(`state is on banned port ${state.port}`);
  if (!isOurServer(state)) throw new Error(`pid ${state.pid} does not have this run's auth directory and public host`);
  if (!treeOwnsPort(state.pid, state.port)) throw new Error(`pid ${state.pid} does not own port ${state.port}`);
  const worldRes = await fetch(`${state.url}/api/world`);
  if (!worldRes.ok) throw new Error(`GET /api/world returned ${worldRes.status}`);
  const worldId = readWorldId(await worldRes.json());
  if (worldId !== "world_port_avalon") throw new Error(`world id is ${worldId ?? "missing"}`);
  const marketRes = await fetch(`${state.url}/api/market`);
  if (!marketRes.ok) throw new Error(`GET /api/market returned ${marketRes.status}`);
  const market: unknown = await marketRes.json();
  if (readTick(market) === null) throw new Error("GET /api/market has no tick");
  const marketWorld = typeof market === "object" && market !== null ? (market as { worldId?: unknown }).worldId : null;
  if (marketWorld !== "world_port_avalon") throw new Error(`market world is ${String(marketWorld)}`);
  const home = await fetch(state.url);
  if (!home.ok) throw new Error(`GET / returned ${home.status}`);
  console.log(`doctor ok ${state.url} pid ${state.pid}`);
}

async function cleanup(): Promise<void> {
  const state = readState();
  if (!state) {
    console.log("cleanup: no instance");
    return;
  }
  await killOurs(state);
  rmSync(state.dataDir, { recursive: true, force: true });
  rmSync(VERIFY_DIR, { recursive: true, force: true });
  try { rmSync(path.dirname(VERIFY_DIR)); } catch { /* parent still holds something else */ }
  console.log(`cleanup: stopped pid ${state.pid}. Evidence left under ${state.evidenceDir ?? EVIDENCE_ROOT}`);
}

function evidenceSurvived(dir: string): boolean {
  const reportPath = path.join(dir, "report.json");
  if (!existsSync(reportPath) || !existsSync(path.join(dir, "summary.txt"))) return false;
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as { checks?: { id?: string }[] };
  const played = (report.checks ?? []).some((check) => (check.id ?? "").includes("signup"));
  if (!played) return true;
  return readdirSync(dir).some((name) => name.endsWith(".png"));
}

async function run(viewport: ViewportName | "both"): Promise<number> {
  let evidenceDir: string | null = null;
  try {
    await launch();
    await doctor();
    evidenceDir = await drivePlayerJourney(viewport);
    await cleanup();
    if (!evidenceDir || !evidenceSurvived(evidenceDir)) {
      throw new Error(`cleanup removed or skipped evidence at ${evidenceDir ?? "(none)"}`);
    }
    console.log(`evidence kept at ${evidenceDir}`);
    const report = JSON.parse(readFileSync(path.join(evidenceDir, "report.json"), "utf8")) as { ok?: boolean };
    return report.ok ? 0 : 1;
  } catch (err) {
    try { await cleanup(); } catch (cleanupErr) {
      console.error(cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
    }
    if (evidenceDir && evidenceSurvived(evidenceDir)) console.log(`evidence kept at ${evidenceDir}`);
    throw err;
  }
}

async function main(): Promise<void> {
  const { command, viewport } = parseArgs(process.argv);
  switch (command) {
    case "launch":
      await launch();
      return;
    case "doctor":
      await doctor();
      return;
    case "drive": {
      const dir = await drivePlayerJourney(viewport);
      const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as { ok?: boolean };
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case "cleanup":
      await cleanup();
      return;
    case "run": {
      const code = await run(viewport);
      process.exitCode = code;
      return;
    }
    default: {
      const never: never = command;
      throw new Error(`unknown command ${String(never)}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
