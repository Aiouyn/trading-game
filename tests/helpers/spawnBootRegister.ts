import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const STORE_KEYS = ["QUAY_DATA_DIR", "QUAY_AUTH_DATA_DIR", "QUAY_STORM_DATA_DIR", "QUAY_TELEMETRY_DIR"] as const;

/** Cleared before `extra`, so a developer shell cannot leak into a boot assertion. `extra` may set them again. */
const STRIP_KEYS = [
  "QUAY_SPEND_OPT_IN",
  "QUAY_KILL_SWITCH",
  "QUAY_PUBLIC_HOST",
  "QUAY_TRUST_PROXY",
  "QUAY_TRUSTED_HOSTS",
  "VERCEL",
  "DATABASE_URL",
] as const;

function rejectReserved(extra: Record<string, string>): void {
  for (const key of STORE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) {
      throw new Error(`spawnBootRegister reserves ${key}`);
    }
  }
}

/** Same directory for every root. `resolveStoreRoots` treats duplicates as one lock, and a child of QUAY_DATA_DIR throws. */
function pinStoreEnv(env: NodeJS.ProcessEnv, dir: string): void {
  env.QUAY_DATA_DIR = dir;
  env.QUAY_AUTH_DATA_DIR = dir;
  env.QUAY_STORM_DATA_DIR = dir;
  env.QUAY_TELEMETRY_DIR = dir;
}

function tempStore(): string {
  return mkdtempSync(path.join(tmpdir(), "quay-boot-register-"));
}

/**
 * Spawn `tools/ops/boot-register.ts` with the caller env applied first, then the
 * four store dirs pinned to a fresh temp directory. The directory is removed in `finally`.
 */
export function spawnBootRegister(extra: Record<string, string> = {}): { status: number | null; stderr: string } {
  rejectReserved(extra);
  const dir = tempStore();
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of STRIP_KEYS) delete env[key];
    Object.assign(env, extra);
    pinStoreEnv(env, dir);
    const result = spawnSync(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["tools/ops/boot-register.ts"],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000 },
    );
    return { status: result.status, stderr: result.stderr ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** In-process `register()` reads `process.env`. Pin the same four dirs for the call, then restore them. */
export async function withTempStore<T>(fn: () => Promise<T> | T): Promise<T> {
  const dir = tempStore();
  const prev = new Map<string, string | undefined>();
  for (const key of STORE_KEYS) prev.set(key, process.env[key]);
  try {
    pinStoreEnv(process.env, dir);
    return await fn();
  } finally {
    for (const key of STORE_KEYS) {
      const value = prev.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
