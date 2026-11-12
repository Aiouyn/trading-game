/**
 * Pid lock for a directory the server has loaded into memory.
 * Stale when the pid is gone or /proc/<pid> starttime no longer matches
 * (pid reuse). The kernel has no flock in node:fs; starttime is the reuse check.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

export const SERVER_LOCK_NAME = ".quay-server.lock";
export const BACKUP_LOCK_NAME = ".quay-backup.lock";

export class LiveLockError extends Error {
  readonly pid: number;
  readonly file: string;

  constructor(pid: number, file: string, message: string) {
    super(message);
    this.name = "LiveLockError";
    this.pid = pid;
    this.file = file;
  }
}

interface LockBody {
  readonly v: 1;
  readonly pid: number;
  readonly starttime: string;
  readonly cwd: string;
}

const releases = new Set<() => void>();
let exitHooked = false;

function hookExit(): void {
  if (exitHooked) return;
  exitHooked = true;
  process.on("exit", () => {
    for (const release of releases) release();
  });
}

/** Field 22 of /proc/pid/stat. Stable for one process, changes when the pid is reused. */
export function procStartTime(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch {
    return null;
  }
  const end = stat.lastIndexOf(")");
  if (end < 0) return null;
  const fields = stat.slice(end + 2).trim().split(/\s+/);
  return fields[19] ?? null;
}

function parseLock(raw: string): LockBody | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 1 || typeof o.pid !== "number" || typeof o.starttime !== "string") return null;
    return { v: 1, pid: o.pid, starttime: o.starttime, cwd: typeof o.cwd === "string" ? o.cwd : "" };
  } catch {
    return null;
  }
}

async function readLock(file: string): Promise<LockBody | null> {
  try {
    return parseLock(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export function lockIsLive(lock: LockBody | null): boolean {
  if (!lock) return false;
  const start = procStartTime(lock.pid);
  return start !== null && start === lock.starttime;
}

function selfBody(): LockBody {
  const starttime = procStartTime(process.pid);
  if (!starttime) {
    throw new LiveLockError(process.pid, "", "Refusing to claim a store lock: this process has no /proc start time.");
  }
  return { v: 1, pid: process.pid, starttime, cwd: process.cwd() };
}

function sameOwner(a: LockBody, b: LockBody): boolean {
  return a.pid === b.pid && a.starttime === b.starttime;
}

function releaseSync(file: string, self: LockBody): void {
  try {
    const cur = parseLock(readFileSync(file, "utf8"));
    if (cur && sameOwner(cur, self)) unlinkSync(file);
  } catch {
    /* already gone */
  }
}

/**
 * Claim `file` for this process. Replaces a stale lock. Throws LiveLockError when another live pid holds it.
 * The returned function drops the lock if this process still owns it.
 */
export async function holdLiveLock(file: string, busy: (pid: number) => string): Promise<() => Promise<void>> {
  const self = selfBody();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await readLock(file);
    if (existing && sameOwner(existing, self)) return async () => {};
    if (existing && lockIsLive(existing)) throw new LiveLockError(existing.pid, file, busy(existing.pid));
    if (existing) await rm(file, { force: true });
    try {
      await writeFile(file, `${JSON.stringify(self)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
      if (code === "EEXIST") continue;
      throw err;
    }
    const written = await readLock(file);
    if (written && sameOwner(written, self)) return track(file, self);
  }
  throw new LiveLockError(self.pid, file, `Could not claim ${file}.`);
}

function track(file: string, self: LockBody): () => Promise<void> {
  const sync = () => releaseSync(file, self);
  releases.add(sync);
  hookExit();
  return async () => {
    releases.delete(sync);
    releaseSync(file, self);
  };
}

export function serverLockPath(dir: string): string {
  return path.join(dir, SERVER_LOCK_NAME);
}

export async function holdServerLock(dir: string): Promise<() => Promise<void>> {
  return holdLiveLock(
    serverLockPath(dir),
    (pid) => `Refusing to restore ${dir}: server pid ${pid} is still running. Stop it, then run restore again.`,
  );
}

export async function liveServerPid(dir: string): Promise<number | null> {
  const lock = await readLock(serverLockPath(dir));
  return lock && lockIsLive(lock) ? lock.pid : null;
}

const waiters = new Map<string, Promise<void>>();

/** Wait until this process holds the backup lock, or throw when `waitMs` elapses. Same-process callers queue. */
export async function withBackupLock<T>(backupDir: string, waitMs: number, fn: () => Promise<T>): Promise<T> {
  const file = path.join(backupDir, BACKUP_LOCK_NAME);
  const prev = waiters.get(file) ?? Promise.resolve();
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const tail = prev.then(() => gate);
  waiters.set(file, tail.then(() => undefined, () => undefined));
  await prev;
  try {
    const deadline = Date.now() + waitMs;
    for (;;) {
      try {
        const release = await holdLiveLock(file, (pid) => `Backup lock ${file} is held by pid ${pid}.`);
        try {
          return await fn();
        } finally {
          await release();
        }
      } catch (err) {
        if (!(err instanceof LiveLockError) || Date.now() >= deadline) {
          if (err instanceof LiveLockError) {
            throw new LiveLockError(err.pid, err.file, `Another backup is running (pid ${err.pid}). Retry when it finishes.`);
          }
          throw err;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  } finally {
    open();
  }
}

/** Snapshot ids: timestamp, then pid, then random, so concurrent publishers do not share a name. */
export function uniqueSnapshotSuffix(): string {
  return `${process.pid}-${randomBytes(4).toString("hex")}`;
}
