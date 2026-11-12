// Hosting readiness for the private alpha. Checks the spend guard, the local file stores, and
// (when READY_URL is set) GET /api/health. Does not open a hosted database and does not spend.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSpendGuard, type SpendEnv } from "../../src/server/spend/guard";

async function probeDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, ".spend-ready");
  try {
    await writeFile(file, "ok\n", { flag: "w" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "write failed";
    throw new Error(`ready: cannot write ${dir} (${detail})`);
  } finally {
    await rm(file, { force: true });
  }
}

export async function runReady(env: SpendEnv): Promise<string> {
  const decision = resolveSpendGuard(env);
  const lines = [
    `spend opt-in: ${decision.optIn ? "on" : "off"}`,
    `kill switch: ${decision.killSwitch ? "on" : "off"}`,
    `paid providers: ${decision.enabled.length ? decision.enabled.join(", ") : "none"}`,
  ];
  if (decision.enabled.includes("database")) {
    lines.push(
      "hosted database is configured. This script does not connect and does not run migrations. Confirm the project in the Supabase dashboard.",
    );
  } else {
    const authDir = env.QUAY_AUTH_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "auth");
    const marketDir = env.QUAY_STORM_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "market");
    await probeDir(authDir);
    await probeDir(marketDir);
    lines.push("local file stores are writable. No SQL migrations in this build.");
  }
  const base = env.READY_URL?.trim();
  if (!base) {
    lines.push("health: skipped (set READY_URL to check /api/health)");
  } else {
    const url = new URL("/api/health", base.endsWith("/") ? base : `${base}/`);
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`ready: ${url} returned ${res.status}`);
    const body = (await res.json()) as { ok?: boolean };
    if (body.ok !== true) throw new Error(`ready: ${url} reported not ok`);
    lines.push(`health: ${url} ok`);
  }
  return lines.join("\n");
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  runReady(process.env).then(
    (report) => {
      console.log(report);
      console.log("ready: ok");
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "ready: failed");
      process.exitCode = 1;
    },
  );
}
