import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from './db';
import { HOURLY_KEEP, DAILY_KEEP, Backups, backupName, keepSet, listBackups, parseBackupName, rotate, utcDay } from './backup';
import { WorldHost, type HostOptions } from './host';
import { acquireLock, lockHolder, LOCK_FILE } from './lock';
import { checkBackup, restoreBackup, runRestore } from './restore';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tg-backup-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 9, 1, 0, 0, 0);

describe('backup names', () => {
  it('round-trips the time, tick and kind through the file name', () => {
    const name = backupName(T0 + 5 * HOUR, 4321, 'hourly');
    expect(name).toBe('world-20261001T050000Z-t4321-hourly.db');
    expect(parseBackupName(name)).toEqual({ at: T0 + 5 * HOUR, tick: 4321, kind: 'hourly' });
    expect(parseBackupName('world.db')).toBeNull();
    expect(parseBackupName('world-20261001T050000Z-t1-other.db')).toBeNull();
  });
});

describe('backup rotation', () => {
  it('keeps the newest 48 and the newest of each of the last 14 UTC days', () => {
    // 30 days of hourly backups
    const files: { name: string; at: number }[] = [];
    for (let h = 0; h < 30 * 24; h++) {
      const at = T0 + h * HOUR;
      files.push({ name: backupName(at, h, 'hourly'), at });
    }
    const keep = keepSet(files);
    const newest = files[files.length - 1]!;
    expect(keep.has(newest.name)).toBe(true);
    // the newest 48: the last two days, all of them
    expect(files.slice(-HOURLY_KEEP).every((f) => keep.has(f.name))).toBe(true);
    // the 14 most recent days (days 29 down to 16) each keep their newest backup
    const days = [...new Set(files.map((f) => utcDay(f.at)))].slice(-DAILY_KEEP);
    expect(days.length).toBe(DAILY_KEEP);
    for (const d of days) {
      const newestOfDay = files.filter((f) => utcDay(f.at) === d).pop()!;
      expect(keep.has(newestOfDay.name)).toBe(true);
    }
    // day 15 and older: nothing kept outside the hourly window
    const older = files.filter((f) => !days.includes(utcDay(f.at)) && f.at < files[files.length - HOURLY_KEEP]!.at);
    expect(older.some((f) => keep.has(f.name))).toBe(false);
    // 48 hourly plus the 12 days older than the two the hourly window covers
    expect(keep.size).toBe(HOURLY_KEEP + (DAILY_KEEP - 2));
  });

  it('removes the files that are not kept, from a real folder', () => {
    const dir = tempDir();
    for (let h = 0; h < 120; h++) writeFileSync(join(dir, backupName(T0 + h * HOUR, h, 'hourly')), 'x');
    expect(listBackups(dir).length).toBe(120);
    const removed = rotate(dir);
    const left = listBackups(dir);
    expect(left.length).toBe(readdirSync(dir).length);
    expect(removed.length + left.length).toBe(120);
    expect(left.length).toBeLessThanOrEqual(HOURLY_KEEP + DAILY_KEEP);
    expect(left[0]!.tick).toBe(119); // the newest is always kept
  });

  it('ignores files that are not backups, and a folder that does not exist', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'notes.txt'), 'x');
    expect(listBackups(join(dir, 'missing'))).toEqual([]);
    expect(rotate(dir)).toEqual([]);
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });
});

describe('the lock file', () => {
  it('a live holder blocks a second process, a dead one is stale', () => {
    const dir = tempDir();
    const release = acquireLock(dir);
    expect(lockHolder(dir)).toBe(process.pid);
    release();
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false);

    writeFileSync(join(dir, LOCK_FILE), String(process.ppid)); // a live process that is not this one
    expect(lockHolder(dir)).toBe(process.ppid);
    expect(() => acquireLock(dir)).toThrow(/already running/);

    writeFileSync(join(dir, LOCK_FILE), '2147483601'); // no such process
    expect(lockHolder(dir)).toBeNull();
    expect(() => acquireLock(dir)).not.toThrow();
  });
});

const OPTS: HostOptions = { seed: 'backup-restore-replay', tickMs: 1e9, warmupDays: 1, snapshotEvery: 60, log: () => {} };

/** JSON with the keys sorted: a restored world re-attaches the explain archive at the end of its object, same values, other key order. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
}

/** The world's whole state as text: the game, the chart history and the net-worth samples. */
function stateJson(host: WorldHost): string {
  return canon({ g: host.g, history: host.history, nw: host.nw });
}

describe('restore replays to the same state', () => {
  it('back up, advance, restore: the restored world is the backup tick, and it replays to the same state', () => {
    const dir = tempDir();
    let store = new Store(dir);
    let host = new WorldHost(store, OPTS);
    host.boot();
    host.advance(20);
    // a player's command between the first snapshot and the backup: the restore must replay it
    expect(host.command('u_replay', { type: 'join', handle: 'replayer', country: 'XX' }).ok).toBe(true);
    host.advance(17);
    const backups = new Backups(host, store.db, join(dir, 'world.db'), join(dir, 'backups'));
    const rec = backups.take('manual');
    expect(rec.tick).toBe(host.g.market.tick);
    const atBackup = stateJson(host);
    host.advance(40);
    const live = stateJson(host);
    store.close();

    const restored = restoreBackup(rec.path, dir);
    expect(restored.tick).toBe(rec.tick);
    expect(existsSync(restored.replaced!)).toBe(true); // the live database is kept aside, not deleted
    store = new Store(dir);
    host = new WorldHost(store, OPTS);
    host.boot();
    expect(host.g.market.tick).toBe(rec.tick);
    expect(stateJson(host)).toBe(atBackup);
    host.advance(40);
    expect(stateJson(host)).toBe(live);
    store.close();
  }, 120_000);

  it('moves the replaced database aside, and refuses while the world runs', () => {
    const dir = tempDir();
    const store = new Store(dir);
    const host = new WorldHost(store, OPTS);
    host.boot();
    const backups = new Backups(host, store.db, join(dir, 'world.db'), join(dir, 'backups'));
    const rec = backups.take('manual');
    store.close();

    // a live world holds the lock: restore refuses, and the database is untouched
    writeFileSync(join(dir, LOCK_FILE), String(process.ppid));
    expect(() => restoreBackup(rec.path, dir)).toThrow(/is running/);
    expect(existsSync(join(dir, 'world.db'))).toBe(true);
    rmSync(join(dir, LOCK_FILE));

    const r = restoreBackup(rec.path, dir);
    expect(r.replaced).not.toBeNull();
    expect(existsSync(r.replaced!)).toBe(true);
    expect(existsSync(join(dir, 'world.db'))).toBe(true);
  }, 120_000);

  it('refuses a file that is not a world database, and the live database itself', () => {
    const dir = tempDir();
    const other = join(dir, 'other.db');
    const db = new DatabaseSync(other);
    db.exec('CREATE TABLE things (id INTEGER)');
    db.close();
    expect(() => checkBackup(other)).toThrow(/not a world database/);
    expect(() => checkBackup(join(dir, 'nothing.db'))).toThrow(/no such file/);
    writeFileSync(join(dir, 'junk.db'), 'not a database at all, just text');
    expect(() => checkBackup(join(dir, 'junk.db'))).toThrow(/not a database|not a world database/);
    expect(() => restoreBackup(join(dir, 'world.db'), dir)).toThrow(/live database/);
  });

  it('a backup is taken between ticks and reports its pause', () => {
    const dir = tempDir();
    const store = new Store(dir);
    const host = new WorldHost(store, OPTS);
    host.boot();
    mkdirSync(join(dir, 'backups'), { recursive: true });
    const seen: string[] = [];
    const backups = new Backups(host, store.db, join(dir, 'world.db'), join(dir, 'backups'), (m) => seen.push(m));
    const rec = backups.take('hourly');
    expect(rec.pauseMs).toBeGreaterThanOrEqual(0);
    expect(rec.bytes).toBeGreaterThan(0);
    expect(seen.length).toBe(1);
    expect(backups.last?.name).toBe(rec.name);
    expect(listBackups(join(dir, 'backups')).map((b) => b.name)).toEqual([rec.name]);
    store.close();
  }, 120_000);
});

describe('npm run world:restore', () => {
  it('refuses while the world runs, restores when it is stopped, and reads its usage', () => {
    const dir = tempDir();
    const store = new Store(dir);
    const host = new WorldHost(store, OPTS);
    host.boot();
    const rec = new Backups(host, store.db, join(dir, 'world.db'), join(dir, 'backups')).take('manual');
    store.close();
    const out: string[] = [];
    const errs: string[] = [];
    const log = (m: string) => out.push(m);
    const err = (m: string) => errs.push(m);

    writeFileSync(join(dir, LOCK_FILE), String(process.ppid));
    expect(runRestore([rec.path, '--data', dir], {}, log, err)).toBe(1);
    expect(errs.join('\n')).toMatch(/Restore refused: .*is running/);
    rmSync(join(dir, LOCK_FILE));

    expect(runRestore([rec.path, '--data', dir], {}, log, err)).toBe(0);
    expect(out.join('\n')).toMatch(new RegExp(`world at tick ${rec.tick}`));

    expect(runRestore([], {}, log, err)).toBe(2);
    expect(runRestore([rec.path, '--data'], {}, log, err)).toBe(2);
    expect(runRestore([rec.path, '--bogus'], {}, log, err)).toBe(2);
  }, 120_000);
});
