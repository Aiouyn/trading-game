import { mkdir, open, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
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
/** In-progress rotation copy. Never a published log name. */
const TEMP_SUFFIX = ".tmp";

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
let recoverGate: Promise<void> = Promise.resolve();
const recoveredDirs = new Set<string>();

type AppendIoFault = { code: "ENOSPC" | "EIO"; afterBytes: number };
let appendIoFault: AppendIoFault | null = null;

/** Test seam: the next append writes `afterBytes` then throws `code`, leaving those bytes in place. */
export function setTelemetryAppendFaultForTests(fault: AppendIoFault | null): void {
  appendIoFault = fault;
}

function errno(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
}

async function fsyncDirectory(dir: string): Promise<void> {
  const fh = await open(/* turbopackIgnore: true */ dir, "r");
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/**
 * Split a jsonl buffer into good complete lines, bad complete lines, and whether a torn
 * tail (bytes after the last LF) was present. A bad line does not discard the good lines
 * that follow it. Only the torn tail is dropped.
 */
function splitJsonl(buf: Buffer): { good: Buffer; bad: Buffer; torn: boolean } {
  let end = buf.length;
  let torn = false;
  if (end > 0 && buf[end - 1] !== 0x0a) {
    torn = true;
    const nl = buf.lastIndexOf(0x0a);
    end = nl === -1 ? 0 : nl + 1;
  }
  const goodChunks: Buffer[] = [];
  const badChunks: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < end; i++) {
    if (buf[i] !== 0x0a) continue;
    const line = buf.subarray(start, i);
    start = i + 1;
    if (line.length === 0) continue;
    const text = line.toString("utf8");
    let ok = false;
    try {
      JSON.parse(text);
      ok = true;
    } catch {
      ok = false;
    }
    const withNl = Buffer.concat([line, Buffer.from("\n")]);
    if (ok) goodChunks.push(withNl);
    else badChunks.push(withNl);
  }
  return {
    good: goodChunks.length ? Buffer.concat(goodChunks) : Buffer.alloc(0),
    bad: badChunks.length ? Buffer.concat(badChunks) : Buffer.alloc(0),
    torn,
  };
}

function isPublishedLogName(name: string): boolean {
  return /^[a-z]+\.jsonl(\.\d+)?$/.test(name);
}

async function truncateToPrefix(file: string, length: number): Promise<void> {
  const fh = await open(/* turbopackIgnore: true */ file, "r+");
  try {
    await fh.truncate(length);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

function mergeUniqueLines(prev: Buffer, extra: Buffer): Buffer {
  const have = new Set(prev.toString("utf8").split("\n").filter((line) => line.length > 0));
  const added: Buffer[] = [];
  for (const line of extra.toString("utf8").split("\n")) {
    if (!line || have.has(line)) continue;
    have.add(line);
    added.push(Buffer.from(`${line}\n`, "utf8"));
  }
  if (added.length === 0) return prev;
  const tail = Buffer.concat(added);
  if (prev.length === 0) return tail;
  if (prev[prev.length - 1] === 0x0a) return Buffer.concat([prev, tail]);
  return Buffer.concat([prev, Buffer.from("\n"), tail]);
}

/** Quarantine bad complete lines: temp file, fsync, rename onto `name.corrupt`. */
async function writeCorrupt(dir: string, name: string, bad: Buffer): Promise<void> {
  const dest = path.join(/* turbopackIgnore: true */ dir, `${name}.corrupt`);
  let prev = Buffer.alloc(0);
  try {
    prev = await readFile(/* turbopackIgnore: true */ dest);
  } catch (err) {
    if (errno(err) !== "ENOENT") throw err;
  }
  const merged = mergeUniqueLines(prev, bad);
  if (prev.length > 0 && merged.equals(prev)) return;
  const tmp = `${dest}.tmp`;
  await writeDurableTemp(tmp, merged);
  await rename(/* turbopackIgnore: true */ tmp, dest);
  await fsyncDirectory(dir);
}

/**
 * Keep every parseable line. Move bad complete lines to `publishedName.corrupt`.
 * Truncate only a torn tail (bytes after the last LF). Returns how many bad lines moved.
 * `file` may be a leftover rotation temp that will be renamed onto `publishedName`.
 */
async function repairJsonlFile(dir: string, publishedName: string, file: string): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(/* turbopackIgnore: true */ file);
  } catch (err) {
    if (errno(err) === "ENOENT") return 0;
    throw err;
  }
  const { good, bad, torn } = splitJsonl(buf);
  if (bad.length === 0 && !torn) return 0;
  if (bad.length === 0) {
    await truncateToPrefix(file, good.length);
    return 0;
  }
  await writeCorrupt(dir, publishedName, bad);
  const tmp = `${file}.keep.tmp`;
  await writeDurableTemp(tmp, good);
  await rename(/* turbopackIgnore: true */ tmp, file);
  await fsyncDirectory(dir);
  let n = 0;
  for (const line of bad.toString("utf8").split("\n")) {
    if (line) n += 1;
  }
  return n;
}

/**
 * Startup recovery. A crash mid-rename leaves `dest.tmp` beside the previous dest, or
 * (if dest never existed) only the temp. A temp must not replace a dest that is already
 * there: the source of the copy is still in the directory until the rename is durable
 * and the source is unlinked. A torn append is truncated to the last LF. A bad complete
 * line is quarantined and does not drop the good lines after it.
 */
async function recoverDir(dir: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(/* turbopackIgnore: true */ dir);
  } catch (err) {
    if (errno(err) === "ENOENT") return;
    throw err;
  }
  for (const name of names) {
    if (!name.endsWith(".keep.tmp")) continue;
    try {
      await unlink(path.join(/* turbopackIgnore: true */ dir, name));
    } catch (err) {
      if (errno(err) !== "ENOENT") throw err;
    }
  }
  const repaired: string[] = [];
  let badLines = 0;
  for (const name of names) {
    if (!isPublishedLogName(name)) continue;
    const n = await repairJsonlFile(dir, name, path.join(/* turbopackIgnore: true */ dir, name));
    if (n > 0) {
      repaired.push(name);
      badLines += n;
    }
  }
  for (const name of names) {
    if (!name.endsWith(TEMP_SUFFIX)) continue;
    const destName = name.slice(0, -TEMP_SUFFIX.length);
    if (!isPublishedLogName(destName)) continue;
    const tmp = path.join(/* turbopackIgnore: true */ dir, name);
    const dest = path.join(/* turbopackIgnore: true */ dir, destName);
    let destExists = false;
    try {
      destExists = (await stat(/* turbopackIgnore: true */ dest)).isFile();
    } catch (err) {
      if (errno(err) !== "ENOENT") throw err;
    }
    if (destExists) {
      await unlink(/* turbopackIgnore: true */ tmp);
      await fsyncDirectory(dir);
      continue;
    }
    const repairedTmp = await repairJsonlFile(dir, destName, tmp);
    if (repairedTmp > 0) {
      repaired.push(destName);
      badLines += repairedTmp;
    }
    if ((await fileSize(tmp)) === 0) {
      try {
        await unlink(/* turbopackIgnore: true */ tmp);
      } catch (err) {
        if (errno(err) !== "ENOENT") throw err;
      }
      await fsyncDirectory(dir);
      continue;
    }
    await rename(/* turbopackIgnore: true */ tmp, dest);
    await fsyncDirectory(dir);
  }
  if (badLines > 0) {
    const message = `telemetry recovery kept good lines and moved ${badLines} bad line(s) from ${repaired.join(", ")}`;
    const row = {
      ts: new Date().toISOString(),
      requestId: "repair",
      route: "telemetry",
      message: scrubTelemetryText(message),
      level: "warn" as const,
    };
    const warning = `${JSON.stringify(row)}\n`;
    if ((await dirTotal(dir)) + Buffer.byteLength(warning) <= TELEMETRY_DIR_MAX_BYTES) {
      await appendDurable(path.join(/* turbopackIgnore: true */ dir, "errors.jsonl"), warning);
      await fsyncDirectory(dir);
    }
  }
}

/** Recover `dir` once per process, and make the directory entry itself durable. */
function ensureRecovered(dir: string): Promise<void> {
  const run = recoverGate.then(async () => {
    if (recoveredDirs.has(dir)) return;
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
    await recoverDir(dir);
    await fsyncDirectory(dir);
    await fsyncDirectory(path.dirname(dir));
    recoveredDirs.add(dir);
  });
  recoverGate = run.then(() => {}, () => {});
  return run;
}

/** Test and startup entry: repair torn tails and leftover rotation temps. */
export async function recoverTelemetryDir(dir: string): Promise<void> {
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  await recoverDir(dir);
}

async function appendDurable(file: string, line: string): Promise<void> {
  const fh = await open(/* turbopackIgnore: true */ file, "a", 0o644);
  let marked = false;
  let before = 0;
  try {
    before = (await fh.stat()).size;
    marked = true;
    const fault = appendIoFault;
    if (fault) {
      appendIoFault = null;
      const bytes = Buffer.from(line, "utf8");
      const n = Math.max(0, Math.min(fault.afterBytes, bytes.length));
      if (n > 0) await fh.write(bytes.subarray(0, n));
      const err = new Error(fault.code) as NodeJS.ErrnoException;
      err.code = fault.code;
      throw err;
    }
    await fh.writeFile(line, "utf8");
    await fh.sync();
  } catch (err) {
    if (marked) {
      try {
        await fh.truncate(before);
        await fh.sync();
      } catch {
        // The torn tail stays. The caller drops the recovery latch so the next append repairs it.
      }
    }
    throw err;
  } finally {
    await fh.close();
  }
}

async function writeDurableTemp(tmp: string, data: Buffer): Promise<void> {
  const fh = await open(/* turbopackIgnore: true */ tmp, "w", 0o644);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

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

/**
 * Copy source onto dest via a temp file. The temp is fsynced before rename, and the
 * directory is fsynced after rename, before source is dropped. A crash before the
 * rename leaves dest untouched; startup recovery discards the leftover temp.
 */
async function promoteRotation(dir: string, fromName: string, toName: string): Promise<void> {
  const from = path.join(/* turbopackIgnore: true */ dir, fromName);
  const to = path.join(/* turbopackIgnore: true */ dir, toName);
  const tmp = `${to}${TEMP_SUFFIX}`;
  let data: Buffer;
  try {
    data = await readFile(/* turbopackIgnore: true */ from);
  } catch (err) {
    if (errno(err) === "ENOENT") return;
    throw err;
  }
  try {
    await unlink(/* turbopackIgnore: true */ tmp);
  } catch (err) {
    if (errno(err) !== "ENOENT") throw err;
  }
  await writeDurableTemp(tmp, data);
  await rename(/* turbopackIgnore: true */ tmp, to);
  await fsyncDirectory(dir);
  try {
    await unlink(/* turbopackIgnore: true */ from);
  } catch (err) {
    if (errno(err) !== "ENOENT") throw err;
  }
  await fsyncDirectory(dir);
}

async function rotateStream(dir: string, file: string): Promise<void> {
  for (let n = TELEMETRY_FILE_ROTATIONS - 1; n >= 1; n--) {
    await promoteRotation(dir, rotationName(file, n), rotationName(file, n + 1));
  }
  await promoteRotation(dir, file, rotationName(file, 1));
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
    await ensureRecovered(dir);
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
    let created = false;
    try {
      await stat(/* turbopackIgnore: true */ live);
    } catch (err) {
      if (errno(err) !== "ENOENT") throw err;
      created = true;
    }
    // The promise resolves only after the line is durable. Callers treat that as the ack.
    try {
      await appendDurable(live, line);
      if (created) await fsyncDirectory(dir);
    } catch (err) {
      // A failed append must not stick the once-per-process latch. The next post repairs again.
      recoveredDirs.delete(dir);
      throw err;
    }
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
  await ensureRecovered(dir);
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
