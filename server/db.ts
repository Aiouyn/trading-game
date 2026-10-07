import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
// node:sqlite ships with Node 22.13+ (no native build step)
import { DatabaseSync } from 'node:sqlite';
import type { Command } from '../src/world/types';

/**
 * Persistence (bible 02 §12, scaled to one machine): accounts, world snapshots, the command log
 * since the last snapshot, and the chart history. A restart loads the newest snapshot and
 * replays the logged commands, so nothing a player did is lost.
 */
export class Store {
  readonly db: DatabaseSync;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'world.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE COLLATE NOCASE NOT NULL,
        password_hash TEXT,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tick INTEGER NOT NULL,
        data TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tick INTEGER NOT NULL,
        pid TEXT NOT NULL,
        cmd TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blobs (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
  }

  // ---------------------------------------------------------------- accounts

  createAccount(id: string, handle: string): string {
    this.db.prepare('INSERT INTO accounts (id, handle, created) VALUES (?, ?, ?)').run(id, handle, Date.now());
    return this.issueToken(id);
  }

  issueToken(accountId: string): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO tokens (token_hash, account_id, created) VALUES (?, ?, ?)').run(sha(token), accountId, Date.now());
    return token;
  }

  accountForToken(token: string): { id: string; handle: string } | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const row = this.db.prepare('SELECT a.id AS id, a.handle AS handle FROM tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token_hash = ?').get(sha(token)) as { id: string; handle: string } | undefined;
    return row ?? null;
  }

  handleTaken(handle: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM accounts WHERE handle = ?').get(handle);
  }

  setPassword(accountId: string, password: string): void {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    this.db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(`${salt.toString('base64')}:${hash.toString('base64')}`, accountId);
  }

  login(handle: string, password: string): { id: string; token: string } | null {
    const row = this.db.prepare('SELECT id, password_hash FROM accounts WHERE handle = ?').get(handle) as { id: string; password_hash: string | null } | undefined;
    if (!row?.password_hash) return null;
    const [s, h] = row.password_hash.split(':');
    const want = Buffer.from(h!, 'base64');
    const got = scryptSync(password, Buffer.from(s!, 'base64'), 32);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return { id: row.id, token: this.issueToken(row.id) };
  }

  // ---------------------------------------------------------------- world

  saveSnapshot(tick: number, json: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO snapshots (tick, data, created) VALUES (?, ?, ?)').run(tick, json, Date.now());
      // commands before the snapshot are folded into it; keep the two newest snapshots
      this.db.prepare('DELETE FROM commands WHERE tick < ?').run(tick);
      this.db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 2)').run();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  latestSnapshot(): { tick: number; data: string } | null {
    return (this.db.prepare('SELECT tick, data FROM snapshots ORDER BY id DESC LIMIT 1').get() as { tick: number; data: string } | undefined) ?? null;
  }

  logCommand(tick: number, pid: string, cmd: Command): void {
    this.db.prepare('INSERT INTO commands (tick, pid, cmd) VALUES (?, ?, ?)').run(tick, pid, JSON.stringify(cmd));
  }

  commandsSince(tick: number): { tick: number; pid: string; cmd: Command }[] {
    return (this.db.prepare('SELECT tick, pid, cmd FROM commands WHERE tick >= ? ORDER BY seq').all(tick) as { tick: number; pid: string; cmd: string }[])
      .map((r) => ({ tick: r.tick, pid: r.pid, cmd: JSON.parse(r.cmd) as Command }));
  }

  setBlob(key: string, data: string): void {
    this.db.prepare('INSERT INTO blobs (key, data, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated = excluded.updated').run(key, data, Date.now());
  }

  getBlob(key: string): string | null {
    return (this.db.prepare('SELECT data FROM blobs WHERE key = ?').get(key) as { data: string } | undefined)?.data ?? null;
  }

  close(): void {
    this.db.close();
  }
}

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
