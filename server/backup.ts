import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { WorldHost } from './host';

/**
 * Backups of the world database (lead-phase8.md P8-2). A backup is a copy of world.db taken between ticks. The write-ahead log is
 * checkpointed into the file first (4 to 15 ms at the e2e and the default world size, so no tick waits on it), then the file is
 * copied. The copy holds the last snapshot and the commands since; its name carries the tick it was taken at, and restoring it
 * replays to that tick (server/restore.ts). The folder keeps the newest HOURLY_KEEP backups and, for each of the last DAILY_KEEP
 * UTC days that has one, the newest backup of that day. Anything else is removed when a new backup is written.
 */

export const HOURLY_KEEP = 48;
export const DAILY_KEEP = 14;
/** the real hour between automatic backups */
export const BACKUP_EVERY_MS = 60 * 60 * 1000;

export type BackupKind = 'hourly' | 'shutdown' | 'manual';

export interface BackupFile {
  name: string;
  path: string;
  /** the time the backup was taken (ms), from its name */
  at: number;
  /** the world tick it holds */
  tick: number;
  kind: BackupKind;
  bytes: number;
}

export interface BackupRecord {
  name: string;
  path: string;
  at: number;
  tick: number;
  kind: BackupKind;
  bytes: number;
  /** wall time the world was held for this backup (the checkpoint and the copy, and the rotation), in ms */
  pauseMs: number;
}

const NAME = /^world-(\d{8})T(\d{6})Z-t(\d+)-(hourly|shutdown|manual)\.db$/;

/** The file name of a backup: the UTC time it was taken, its tick and its kind. */
export function backupName(at: number, tick: number, kind: BackupKind): string {
  const iso = new Date(at).toISOString(); // 2026-10-12T08:30:00.000Z
  const stamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return `world-${stamp}-t${tick}-${kind}.db`;
}

/** The time, tick and kind of a backup file name, or null when the name is not a backup's. */
export function parseBackupName(name: string): { at: number; tick: number; kind: BackupKind } | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const d = m[1]!;
  const t = m[2]!;
  const at = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)), Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)));
  return { at, tick: Number(m[3]), kind: m[4] as BackupKind };
}

/** The UTC calendar day of a time, as YYYY-MM-DD. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The backups to keep out of `files` (each with its time): the newest HOURLY_KEEP, plus the newest of each of the DAILY_KEEP most
 * recent UTC days that have a backup. Pure: the rotation test runs on this.
 */
export function keepSet(files: { name: string; at: number }[]): Set<string> {
  const keep = new Set<string>();
  const newestFirst = [...files].sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
  for (const f of newestFirst.slice(0, HOURLY_KEEP)) keep.add(f.name);
  const seenDays = new Set<string>();
  for (const f of newestFirst) {
    const day = utcDay(f.at);
    if (seenDays.has(day)) continue;
    if (seenDays.size >= DAILY_KEEP) break;
    seenDays.add(day);
    keep.add(f.name);
  }
  return keep;
}

/** The backup files in `dir`, newest first. A missing folder has none. */
export function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  const out: BackupFile[] = [];
  for (const name of readdirSync(dir)) {
    const meta = parseBackupName(name);
    if (!meta) continue;
    const path = join(dir, name);
    out.push({ name, path, at: meta.at, tick: meta.tick, kind: meta.kind, bytes: statSync(path).size });
  }
  return out.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
}

/** Removes the backups that keepSet does not keep. Returns the names removed. */
export function rotate(dir: string): string[] {
  const files = listBackups(dir);
  const keep = keepSet(files);
  const removed: string[] = [];
  for (const f of files) {
    if (keep.has(f.name)) continue;
    rmSync(f.path, { force: true });
    removed.push(f.name);
  }
  return removed;
}

/**
 * Copies the database file into `dir` as one backup. The caller holds the world between ticks (no write can interleave), so the
 * checkpoint leaves the file complete. The copy goes to a temporary name and is renamed, so a half-written copy never carries a
 * backup's name.
 */
export function copyDatabase(db: DatabaseSync, dbFile: string, dir: string, kind: BackupKind, tick: number, at: number): BackupRecord {
  mkdirSync(dir, { recursive: true });
  const name = backupName(at, tick, kind);
  const path = join(dir, name);
  const tmp = `${path}.tmp`;
  rmSync(tmp, { force: true });
  const t0 = performance.now();
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  copyFileSync(dbFile, tmp);
  renameSync(tmp, path);
  const pauseMs = performance.now() - t0;
  return { name, path, at, tick, kind, bytes: statSync(path).size, pauseMs };
}

export interface BackupLog {
  (msg: string): void;
}

/**
 * The world's backups: takes them, rotates the folder, and remembers the last one. Every call runs between ticks (the world is one
 * synchronous loop), so a backup never splits a tick; the pause is measured and reported in the admin readout.
 */
export class Backups {
  /** the newest backup taken by this process, or null before the first */
  last: BackupRecord | null = null;

  constructor(
    private readonly host: WorldHost,
    private readonly db: DatabaseSync,
    private readonly dbFile: string,
    readonly dir: string,
    private readonly log: BackupLog = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  /** Copies the database into the backup folder at the current tick, and rotates the folder. Call between ticks only. */
  take(kind: BackupKind): BackupRecord {
    const tick = this.host.g.market.tick;
    const rec = copyDatabase(this.db, this.dbFile, this.dir, kind, tick, this.now());
    const t0 = performance.now();
    const removed = rotate(this.dir);
    rec.pauseMs += performance.now() - t0;
    this.last = rec;
    this.log(`backup ${rec.name} (${(rec.bytes / 1024).toFixed(0)} KB, held ${rec.pauseMs.toFixed(1)} ms${removed.length ? `, removed ${removed.length} old` : ''})`);
    return rec;
  }
}
