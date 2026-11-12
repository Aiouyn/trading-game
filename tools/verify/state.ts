// Shared paths for the Port Avalon verification skill. Scratch lives under
// `.verify/`; proof screenshots live under `proof/` and must survive cleanup.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "../..");
export const VERIFY_DIR = path.join(REPO_ROOT, ".verify", "port-avalon");
export const STATE_PATH = path.join(VERIFY_DIR, "state.json");
export const EVIDENCE_ROOT = path.join(REPO_ROOT, "proof", "verify-port-avalon");

/** Shared-box ports this skill must never bind. 3199 is the review server; 3102 is reserved beside it. */
export const BANNED_PORTS = new Set([3199, 3102]);

export type VerifyState = {
  pid: number;
  port: number;
  url: string;
  dataDir: string;
  logFile: string;
  startedAt: string;
  evidenceDir: string | null;
};

export function ensureVerifyDir(): void {
  mkdirSync(VERIFY_DIR, { recursive: true });
}

export function readState(): VerifyState | null {
  if (!existsSync(STATE_PATH)) return null;
  const raw: unknown = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  if (!isState(raw)) throw new Error(`unreadable verification state at ${STATE_PATH}`);
  return raw;
}

export function writeState(state: VerifyState): void {
  ensureVerifyDir();
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function isState(v: unknown): v is VerifyState {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.pid === "number"
    && typeof o.port === "number"
    && typeof o.url === "string"
    && typeof o.dataDir === "string"
    && typeof o.logFile === "string"
    && typeof o.startedAt === "string"
    && (o.evidenceDir === null || typeof o.evidenceDir === "string");
}
