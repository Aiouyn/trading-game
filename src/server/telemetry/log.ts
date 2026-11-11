import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { scrubTelemetryText } from "./scrub";

export const TELEMETRY_MAX_BODY_BYTES = 4096;
export const TELEMETRY_FEEDBACK_MAX_CHARS = 1000;
export const TELEMETRY_ROUTE_MAX = 200;

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

async function appendLine(file: string, row: unknown): Promise<void> {
  const dir = telemetryDir();
  if (!dir) return;
  const line = JSON.stringify(row) + "\n";
  const next = chain.then(async () => {
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, file), line, "utf8");
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
  await appendLine("optout.jsonl", { ts: new Date().toISOString(), anonId });
  optedOut.add(anonId);
}

const optedOut = new Set<string>();
let optoutLoaded = false;

export async function isOptedOut(anonId: string): Promise<boolean> {
  if (!optoutLoaded) {
    optoutLoaded = true;
    const dir = telemetryDir();
    if (dir) {
      try {
        const raw = await readFile(path.join(dir, "optout.jsonl"), "utf8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const row = JSON.parse(line) as { anonId?: string };
            if (typeof row.anonId === "string") optedOut.add(row.anonId);
          } catch {
            // skip a bad line
          }
        }
      } catch {
        // no file yet
      }
    }
  }
  return optedOut.has(anonId);
}

/** Test helper: drop the in-memory opt-out cache after a temp dir swap. */
export function resetOptOutCache(): void {
  optedOut.clear();
  optoutLoaded = false;
}

/** Wait for in-flight appends (tests). */
export async function flushTelemetry(): Promise<void> {
  await chain;
}
