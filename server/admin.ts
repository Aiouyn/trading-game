import { createHash, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TPD } from '../src/world/core';
import { Backups, DAILY_KEEP, HOURLY_KEEP, listBackups, type BackupFile } from './backup';
import type { Store } from './db';
import type { WorldHost } from './host';
import type { TextReadout } from './text/enricher';
import type { TournamentJob } from './tournamentJob';

/**
 * The admin API behind the web app's /admin page (lead-phase8.md P8-3). Every request needs the admin token as a bearer header.
 * The token lives in the server's environment (ADMIN_TOKEN); with none set, the admin API answers 403 to everyone. The readouts
 * carry counts and the world's own figures, never a player's name or money. Every action (a backup taken, the world paused or
 * resumed) is logged to the console and to DATA_DIR/admin.log, and the last few show on the page.
 */

/** the admin routes this module answers (anything else under /api/admin/ belongs to the dev and test endpoints in index.ts) */
export const ADMIN_PATHS = ['/api/admin/status', '/api/admin/backup', '/api/admin/pause'] as const;

const sha = (s: string): Buffer => createHash('sha256').update(s).digest();

/** Whether the request's bearer token is the admin token. Compared on digests, so the length and the bytes do not leak by timing. */
export function adminAuthorized(header: string | undefined, token: string): boolean {
  if (!token) return false;
  const m = /^Bearer (.+)$/.exec(header ?? '');
  if (!m) return false;
  return timingSafeEqual(sha(m[1]!), sha(token));
}

export interface AdminAction {
  /** ms since the epoch */
  at: number;
  action: 'backup' | 'pause' | 'resume';
  /** the requester's address (the admin's own machine, usually) */
  ip: string;
  detail: string;
}

/** The admin actions: kept in memory for the page (the last KEEP), and appended to admin.log as JSON lines when a file is given. */
export class AdminLog {
  private entries: AdminAction[] = [];

  constructor(
    private readonly file: string | null,
    private readonly log: (m: string) => void = () => {},
    private readonly keep = 50,
  ) {}

  record(action: AdminAction['action'], ip: string, detail: string, now: number = Date.now()): AdminAction {
    const e: AdminAction = { at: now, action, ip, detail };
    this.entries.push(e);
    if (this.entries.length > this.keep) this.entries.splice(0, this.entries.length - this.keep);
    this.log(`admin ${action} from ${ip}: ${detail}`);
    if (this.file) {
      try {
        appendFileSync(this.file, `${JSON.stringify(e)}\n`);
      } catch (err) {
        this.log(`admin.log write failed: ${(err as Error).message}`);
      }
    }
    return e;
  }

  recent(): AdminAction[] {
    return this.entries.slice();
  }
}

export interface AdminDeps {
  /** the admin token ('' turns the admin API off) */
  token: string;
  host: WorldHost;
  store: Store;
  backups: Backups;
  dataDir: string;
  tournament: TournamentJob;
  text: { readout(): TextReadout };
  /** the players connected now (distinct accounts) */
  online(): number;
  adminLog: AdminLog;
  now(): number;
}

/** The bytes the world's database files take (the database, its write-ahead log and its shared memory file). */
export function databaseBytes(dataDir: string): number {
  let total = 0;
  for (const name of ['world.db', 'world.db-wal', 'world.db-shm']) {
    const p = join(dataDir, name);
    if (existsSync(p)) total += statSync(p).size;
  }
  return total;
}

export interface AdminStatus {
  world: { tick: number; day: number; tickMs: number; paused: boolean };
  players: { online: number; registered: number; inWorld: number };
  ticks: { lastHour: number; p50Ms: number | null; p99Ms: number | null };
  database: { bytes: number };
  backups: {
    count: number;
    keepHourly: number;
    keepDaily: number;
    /** the newest backup on disk, or null */
    last: { name: string; at: number; tick: number; kind: string; bytes: number } | null;
    list: { name: string; at: number; tick: number; kind: string; bytes: number }[];
  };
  text: TextReadout;
  tournament: { running: number | null; retryInMs: number };
  actions: AdminAction[];
}

function backupRow(f: BackupFile) {
  return { name: f.name, at: f.at, tick: f.tick, kind: f.kind, bytes: f.bytes };
}

/** The admin readout: the world's tick and day, who is connected and registered (counts), the tick times of the last hour, the
 *  database size, the backups on disk, the model text readout, the tournament job, and the recent admin actions. */
export function adminStatus(d: AdminDeps, now: number = d.now()): AdminStatus {
  const g = d.host.g;
  const tick = g.market.tick;
  const files = listBackups(join(d.dataDir, 'backups')).map(backupRow);
  const t = d.host.tickStats(now);
  return {
    world: { tick, day: Math.floor((tick - 1) / TPD), tickMs: d.host.tickMs(), paused: d.host.isPaused() },
    players: { online: d.online(), registered: d.store.accountCount(), inWorld: Object.keys(g.players).length },
    ticks: { lastHour: t.ticks, p50Ms: t.p50Ms, p99Ms: t.p99Ms },
    database: { bytes: databaseBytes(d.dataDir) },
    backups: { count: files.length, keepHourly: HOURLY_KEEP, keepDaily: DAILY_KEEP, last: files[0] ?? null, list: files },
    text: d.text.readout(),
    tournament: d.tournament.status(now),
    actions: d.adminLog.recent(),
  };
}

export interface AdminReply {
  code: number;
  body: Record<string, unknown>;
}

/**
 * Answers an admin request (a path in ADMIN_PATHS). The body is the parsed JSON body of a POST (or {}). Returns the status code and
 * the JSON body. Every action is logged; a backup that fails answers 500 and says so.
 */
export function adminRoute(method: string, path: string, authorization: string | undefined, body: Record<string, unknown>, ip: string, d: AdminDeps): AdminReply {
  if (!adminAuthorized(authorization, d.token)) return { code: 403, body: { ok: false, error: 'Not authorised: the admin token is wrong, or the world has none set' } };
  if (path === '/api/admin/status') {
    if (method !== 'GET') return { code: 405, body: { ok: false, error: 'Use GET' } };
    return { code: 200, body: { ok: true, ...adminStatus(d) } };
  }
  if (method !== 'POST') return { code: 405, body: { ok: false, error: 'Use POST' } };
  const now = d.now();
  if (path === '/api/admin/backup') {
    try {
      const rec = d.backups.take('manual');
      d.adminLog.record('backup', ip, `${rec.name}, held ${rec.pauseMs.toFixed(1)} ms`, now);
      return { code: 200, body: { ok: true, backup: { name: rec.name, at: rec.at, tick: rec.tick, kind: rec.kind, bytes: rec.bytes, pauseMs: rec.pauseMs } } };
    } catch (e) {
      d.adminLog.record('backup', ip, `failed: ${(e as Error).message}`, now);
      return { code: 500, body: { ok: false, error: `The backup failed: ${(e as Error).message}` } };
    }
  }
  if (path === '/api/admin/pause') {
    if (typeof body.paused !== 'boolean') return { code: 400, body: { ok: false, error: 'Send { "paused": true } or { "paused": false }' } };
    const was = d.host.isPaused();
    if (body.paused) d.host.pause();
    else d.host.resume();
    const tick = d.host.g.market.tick;
    d.adminLog.record(body.paused ? 'pause' : 'resume', ip, `at tick ${tick}${was === body.paused ? ' (no change)' : ''}`, now);
    return { code: 200, body: { ok: true, paused: d.host.isPaused(), tick } };
  }
  return { code: 404, body: { ok: false } };
}
