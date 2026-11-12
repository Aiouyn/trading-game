import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { telemetryDir } from "./log";

export const ANON_ID_RE = /^anon_[a-f0-9]{16,64}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
/** Server-only file in the telemetry dir. Never served, never logged. */
export const TELEMETRY_SECRET_FILE = ".secret";

export class MissingTelemetrySecretError extends Error {
  readonly code = "TELEMETRY_SECRET_MISSING";
  constructor() {
    super("Refusing to hash a telemetry anon id: a telemetry log exists but its server secret is missing or empty. A new key was not generated.");
    this.name = "MissingTelemetrySecretError";
  }
}

export function newTelemetrySecret(): string {
  return randomBytes(32).toString("hex");
}

export function usableTelemetrySecret(v: unknown): v is string {
  return typeof v === "string" && v.length >= 16;
}

let cachedSecret: string | null | undefined;

function dirHasLogs(dir: string): boolean {
  try {
    const names = readdirSync(/* turbopackIgnore: true */ dir);
    return names.some((n) => n.endsWith(".jsonl") || /\.jsonl\.\d+$/.test(n));
  } catch {
    return false;
  }
}

function persistSecret(dir: string, secret: string): void {
  mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  const file = path.join(/* turbopackIgnore: true */ dir, TELEMETRY_SECRET_FILE);
  writeFileSync(file, secret, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
}

/**
 * Per-world HMAC key for anon ids. Never exposed. Generated and persisted on first use
 * when the telemetry dir has no logs; fail-closed (no new key) if logs already exist
 * and the secret is missing or empty — same rule as the rumor secret.
 */
export function telemetrySecret(): string | null {
  if (cachedSecret !== undefined) return cachedSecret;
  const fromEnv = process.env.QUAY_TELEMETRY_SECRET?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    if (!usableTelemetrySecret(fromEnv)) {
      cachedSecret = null;
      return null;
    }
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  const dir = telemetryDir();
  if (!dir) {
    cachedSecret = null;
    return null;
  }
  const file = path.join(/* turbopackIgnore: true */ dir, TELEMETRY_SECRET_FILE);
  try {
    if (existsSync(file)) {
      const raw = readFileSync(file, "utf8").trim();
      if (usableTelemetrySecret(raw)) {
        cachedSecret = raw;
        return cachedSecret;
      }
      cachedSecret = null;
      return null;
    }
  } catch {
    cachedSecret = null;
    return null;
  }
  if (dirHasLogs(dir)) {
    cachedSecret = null;
    return null;
  }
  const minted = newTelemetrySecret();
  persistSecret(dir, minted);
  cachedSecret = minted;
  return cachedSecret;
}

/** Test helper: drop the cached key after a temp dir or env swap. */
export function resetTelemetrySecretCache(): void {
  cachedSecret = undefined;
}

/** HMAC-SHA256(secret, accountId) as `anon_` + 16 hex chars. Null when the secret is unavailable (fail closed). */
export function anonIdForAccount(accountId: string): string | null {
  const secret = telemetrySecret();
  if (!secret) return null;
  const hex = createHmac("sha256", secret).update(accountId).digest("hex").slice(0, 16);
  return `anon_${hex}`;
}

export function requestIdFrom(request: Request): string {
  const raw = request.headers.get("x-request-id")?.trim() ?? "";
  if (REQUEST_ID_RE.test(raw)) return raw;
  return randomUUID();
}

export function isAnonId(value: unknown): value is string {
  return typeof value === "string" && ANON_ID_RE.test(value);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
