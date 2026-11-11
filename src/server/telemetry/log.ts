import { appendFile, mkdir, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { scrubTelemetryText } from "./scrub";

export const TELEMETRY_MAX_BODY_BYTES = 4096;
export const TELEMETRY_FEEDBACK_MAX_CHARS = 1000;
export const TELEMETRY_ROUTE_MAX = 200;
/** Live jsonl file size at which the next append rotates. */
export const TELEMETRY_FILE_MAX_BYTES = 64 * 1024;
/** Rotated siblings kept per stream: name.jsonl.1 (newest) .. name.jsonl.N (oldest). */
export const TELEMETRY_FILE_ROTATIONS = 3;
/** Hard ceiling for the whole telemetry directory. */
export const TELEMETRY_DIR_MAX_BYTES = 1024 * 1024;

export class TelemetryDirFullError extends Error {
  readonly code = "TELEMETRY_DIR_FULL";
  constructor() {
    super("Telemetry log directory is full.");
    this.name = "TelemetryDirFullError";
  }
}

function defaultDir(): string | null {
  const pinned = process.env.QUAY_TELEMETRY_DIR?.trim();
  if (pinned) return pinned;
  // Official/unit tests must not write the product .data tree unless they opt in with QUAY_TELEMETRY_DIR.
  if (process.env.VITEST) return null;
  return path.join(process.cwd(), ".data", "telemetry");
}

export function telemetryDir(): string | null {
  return defaultDir();
}

let chain: Promise<void> = Promise.resolve();

function rotationName(file: string, n: number): string {
  return `${file}.${n}`;
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

async function listDir(dir: string): Promise<{ name: string; size: number; mtimeMs: number }[]> {
  try {
    const names = await readdir(/* turbopackIgnore: true */ dir);
    const out: { name: string; size: number; mtimeMs: number }[] = [];
    for (const name of names) {
      try {
        const s = await stat(path.join(/* turbopackIgnore: true */ dir, name));
        if (s.isFile()) out.push({ name, size: s.size, mtimeMs: s.mtimeMs });
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function dirTotal(dir: string): Promise<number> {
  const files = await listDir(dir);
  return files.reduce((n, f) => n + f.size, 0);
}

async function rotateStream(dir: string, file: string): Promise<void> {
  const oldest = path.join(/* turbopackIgnore: true */ dir, rotationName(file, TELEMETRY_FILE_ROTATIONS));
  try { await unlink(oldest); } catch { /* no oldest */ }
  for (let n = TELEMETRY_FILE_ROTATIONS - 1; n >= 1; n--) {
    const from = path.join(/* turbopackIgnore: true */ dir, rotationName(file, n));
    const to = path.join(/* turbopackIgnore: true */ dir, rotationName(file, n + 1));
    try { await rename(from, to); } catch { /* gap in the chain */ }
  }
  const live = path.join(/* turbopackIgnore: true */ dir, file);
  const first = path.join(/* turbopackIgnore: true */ dir, rotationName(file, 1));
  try { await rename(live, first); } catch { /* no live file */ }
}

/** Drop oldest rotated jsonl files until `total + needed` fits, or we run out of rotations. */
async function evictRotations(dir: string, needed: number): Promise<void> {
  let total = await dirTotal(dir);
  if (total + needed <= TELEMETRY_DIR_MAX_BYTES) return;
  const files = await listDir(dir);
  const rotated = files
    .filter((f) => /\.jsonl\.\d+$/.test(f.name))
    .sort((a, b) => {
      const na = Number(a.name.slice(a.name.lastIndexOf(".") + 1));
      const nb = Number(b.name.slice(b.name.lastIndexOf(".") + 1));
      // Higher rotation index is older within a stream; mtime as a tie-break across streams.
      if (na !== nb) return nb - na;
      return a.mtimeMs - b.mtimeMs;
    });
  for (const f of rotated) {
    if (total + needed <= TELEMETRY_DIR_MAX_BYTES) break;
    try {
      await unlink(path.join(/* turbopackIgnore: true */ dir, f.name));
      total -= f.size;
    } catch {
      // already gone
    }
  }
}

async function appendLine(file: string, row: unknown): Promise<void> {
  const dir = telemetryDir();
  if (!dir) return;
  const line = JSON.stringify(row) + "\n";
  const lineBytes = Buffer.byteLength(line, "utf8");
  const next = chain.then(async () => {
    if (lineBytes > TELEMETRY_FILE_MAX_BYTES || lineBytes > TELEMETRY_DIR_MAX_BYTES) {
      throw new TelemetryDirFullError();
    }
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    const live = path.join(/* turbopackIgnore: true */ dir, file);
    const liveBytes = await fileSize(live);
    if (liveBytes + lineBytes > TELEMETRY_FILE_MAX_BYTES) {
      await rotateStream(dir, file);
    }
    await evictRotations(dir, lineBytes);
    const total = await dirTotal(dir);
    if (total + lineBytes > TELEMETRY_DIR_MAX_BYTES) {
      throw new TelemetryDirFullError();
    }
    await appendFile(live, line, "utf8");
  });
  chain = next.catch(() => {});
  await next;
}

export type ErrorLevel = "error" | "warn";

export async function appendError(row: {
  requestId: string;
  route: string;
  message: string;
  level?: ErrorLevel;
}): Promise<void> {
  await appendLine("errors.jsonl", {
    ts: new Date().toISOString(),
    requestId: scrubTelemetryText(row.requestId, 128),
    route: scrubTelemetryText(row.route, TELEMETRY_ROUTE_MAX),
    message: scrubTelemetryText(row.message),
    level: row.level ?? "error",
  });
}

export async function appendEvent(row: { event: string; anonId: string }): Promise<void> {
  await appendLine("events.jsonl", {
    ts: new Date().toISOString(),
    event: row.event,
    anonId: row.anonId,
  });
}

export async function appendFeedback(row: {
  requestId: string;
  route: string;
  text: string;
}): Promise<void> {
  await appendLine("feedback.jsonl", {
    ts: new Date().toISOString(),
    requestId: scrubTelemetryText(row.requestId, 128),
    route: scrubTelemetryText(row.route, TELEMETRY_ROUTE_MAX),
    text: scrubTelemetryText(row.text, TELEMETRY_FEEDBACK_MAX_CHARS),
  });
}

export async function addOptOut(anonId: string): Promise<void> {
  decisions.set(anonId, { granted: false, ts: Date.now() });
  await appendLine("optout.jsonl", { ts: new Date().toISOString(), anonId });
}

export async function addConsent(anonId: string, granted: boolean): Promise<void> {
  decisions.set(anonId, { granted, ts: Date.now() });
  await appendLine("consent.jsonl", { ts: new Date().toISOString(), anonId, granted });
}

const decisions = new Map<string, { granted: boolean; ts: number }>();
let decisionsLoaded = false;
let bypassConsent = false;

function applyDecisionLine(row: { anonId?: unknown; granted?: unknown; ts?: unknown }, granted: boolean): void {
  if (typeof row.anonId !== "string") return;
  const ts = typeof row.ts === "string" ? Date.parse(row.ts) : typeof row.ts === "number" ? row.ts : 0;
  const prev = decisions.get(row.anonId);
  if (prev && prev.ts > ts) return;
  decisions.set(row.anonId, { granted, ts: Number.isFinite(ts) ? ts : 0 });
}

async function loadDecisionFile(dir: string, file: string, fallbackGranted: boolean): Promise<void> {
  try {
    const raw = await readFile(path.join(/* turbopackIgnore: true */ dir, file), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { anonId?: unknown; granted?: unknown; ts?: unknown };
        const granted = typeof row.granted === "boolean" ? row.granted : fallbackGranted;
        applyDecisionLine(row, granted);
      } catch {
        // skip a bad line
      }
    }
  } catch {
    // no file yet
  }
}

async function ensureDecisions(): Promise<void> {
  if (decisionsLoaded) return;
  decisionsLoaded = true;
  const dir = telemetryDir();
  if (!dir) return;
  // optout first, consent second so a later consent.jsonl row with ts can override, and vice versa via ts.
  await loadDecisionFile(dir, "optout.jsonl", false);
  await loadDecisionFile(dir, "consent.jsonl", true);
}

export async function isOptedOut(anonId: string): Promise<boolean> {
  await ensureDecisions();
  return decisions.get(anonId)?.granted === false;
}

export async function isConsented(anonId: string): Promise<boolean> {
  await ensureDecisions();
  const row = decisions.get(anonId);
  if (row?.granted === false) return false;
  if (bypassConsent) return true;
  return row?.granted === true;
}

/** Test helper: drop the in-memory consent / opt-out cache after a temp dir swap. */
export function resetOptOutCache(): void {
  decisions.clear();
  decisionsLoaded = false;
  bypassConsent = false;
}

/** Test helper: treat every anon id as consented (hook-path proofs). */
export function setTelemetryBypassConsentForTests(on: boolean): void {
  bypassConsent = on;
}

/** Wait for in-flight appends (tests). */
export async function flushTelemetry(): Promise<void> {
  await chain;
}
