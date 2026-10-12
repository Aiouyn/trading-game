import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseBackupName } from './backup';
import { Store } from './db';
import { WorldHost } from './host';
import { lockHolder } from './lock';

/**
 * Restores a backup into a data folder (npm run world:restore). It refuses while a world server holds the folder's lock, checks
 * that the file is a world database with a snapshot, and moves the current database (and its write-ahead files) aside under a
 * `.before-restore-<time>` name, so nothing is deleted. The backup is copied in as world.db, and the restored world is brought to
 * the backup's tick (the tick in its name): the commands it holds are replayed, then the world steps forward with none to reach
 * that tick, and a snapshot is saved there. Next start, the world is exactly the one the backup was taken from.
 */

export interface RestoreResult {
  restoredFrom: string;
  /** the restored world's tick: the backup's tick (or the last tick its commands reach, for a file with no backup name) */
  tick: number;
  /** where the replaced database went, or null when the folder had none */
  replaced: string | null;
}

/** Throws with a plain message when the file is not a world database with a snapshot. Returns the tick of its newest snapshot. */
export function checkBackup(file: string): number {
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file);
  } catch {
    throw new Error(`${file} is not a database`);
  }
  try {
    const row = db.prepare('SELECT tick FROM snapshots ORDER BY id DESC LIMIT 1').get() as { tick: number } | undefined;
    if (!row) throw new Error(`${file} has no world snapshot`);
    return row.tick;
  } catch (e) {
    if ((e as Error).message.includes('no world snapshot')) throw e;
    throw new Error(`${file} is not a world database`);
  } finally {
    db.close();
  }
}

export function restoreBackup(file: string, dataDir: string, now: number = Date.now()): RestoreResult {
  const holder = lockHolder(dataDir);
  if (holder !== null) throw new Error(`the world in ${dataDir} is running (process ${holder}). Stop it first, then restore.`);
  const db = join(dataDir, 'world.db');
  if (resolve(file) === resolve(db)) throw new Error('the backup is the live database itself');
  checkBackup(file);
  const target = parseBackupName(basename(file))?.tick ?? null;

  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  let replaced: string | null = null;
  if (existsSync(db)) {
    replaced = join(dataDir, `world.db.before-restore-${stamp}`);
    renameSync(db, replaced);
    for (const side of ['-wal', '-shm']) {
      if (existsSync(db + side)) renameSync(db + side, replaced + side);
    }
  }
  // a stale write-ahead file must never be applied to the restored copy
  for (const side of ['-wal', '-shm']) rmSync(db + side, { force: true });
  copyFileSync(file, db);

  // bring the restored world to the backup's tick, and save it there, so the next start is exact
  const store = new Store(dataDir);
  try {
    const host = new WorldHost(store, { seed: '', tickMs: 5000, warmupDays: 0, snapshotEvery: 60 });
    host.boot(target !== null ? { until: target } : {});
    return { restoredFrom: file, tick: host.g.market.tick, replaced };
  } finally {
    store.close();
  }
}

/**
 * The command line of `npm run world:restore -- <backup file> [--data <folder>]`: the data folder is --data, else DATA_DIR, else
 * ./world-data. Returns the exit code: 0 restored, 1 refused, 2 bad usage. `log` and `err` take the printed lines.
 */
export function runRestore(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  log: (m: string) => void = (m) => console.log(m),
  err: (m: string) => void = (m) => console.error(m),
): number {
  const args = argv.slice();
  let data = env.DATA_DIR || './world-data';
  const i = args.indexOf('--data');
  if (i >= 0) {
    const v = args[i + 1];
    if (!v || v.startsWith('--')) {
      err('--data needs a folder');
      return 2;
    }
    data = v;
    args.splice(i, 2);
  }
  const file = args.find((a) => !a.startsWith('--'));
  if (!file || args.some((a) => a.startsWith('--'))) {
    err('Usage: npm run world:restore -- <backup file> [--data <folder>]');
    return 2;
  }
  try {
    mkdirSync(resolve(data), { recursive: true });
    const r = restoreBackup(resolve(file), resolve(data));
    log(`Restored ${basename(r.restoredFrom)} into ${resolve(data)} (world at tick ${r.tick}).`);
    if (r.replaced) log(`The replaced database is kept as ${basename(r.replaced)}.`);
    log('Start the world again with npm run play (or npm run world).');
    return 0;
  } catch (e) {
    err(`Restore refused: ${(e as Error).message}`);
    return 1;
  }
}
