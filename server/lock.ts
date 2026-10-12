import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The world's lock file (`world.lock` in the data folder): the server writes its process id at boot and removes the file when it
 * stops. A restore reads it and refuses while the process is alive. A lock left by a process that died is stale and ignored.
 */
export const LOCK_FILE = 'world.lock';

/** The process id that holds the lock, or null when no live process does. */
export function lockHolder(dataDir: string): number | null {
  const file = join(dataDir, LOCK_FILE);
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0); // throws when no such process exists (signal 0 only checks)
    return pid;
  } catch (e) {
    // EPERM means the process exists but belongs to someone else: still a holder
    return (e as NodeJS.ErrnoException).code === 'EPERM' ? pid : null;
  }
}

/**
 * Takes the lock for this process. Returns the release function, or throws when another live process holds it (a second world on
 * the same database would corrupt the replay).
 */
export function acquireLock(dataDir: string): () => void {
  const holder = lockHolder(dataDir);
  if (holder !== null && holder !== process.pid) throw new Error(`the world in ${dataDir} is already running (process ${holder})`);
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, LOCK_FILE);
  writeFileSync(file, String(process.pid));
  return () => {
    try {
      if (readFileSync(file, 'utf8').trim() === String(process.pid)) rmSync(file, { force: true });
    } catch { /* already gone */ }
  };
}
