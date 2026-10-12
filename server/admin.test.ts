import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Backups, listBackups } from './backup';
import { ADMIN_PATHS, AdminLog, adminAuthorized, adminRoute, adminStatus, type AdminDeps } from './admin';
import { Store } from './db';
import { WorldHost, percentile, type HostOptions } from './host';
import { TournamentJob } from './tournamentJob';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tg-admin-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const TOKEN = 'a-long-test-admin-token-0123';
const OPTS: HostOptions = { seed: 'admin-test', tickMs: 1e9, warmupDays: 1, snapshotEvery: 60, log: () => {} };

function setup(token = TOKEN) {
  const dir = tempDir();
  const store = new Store(dir);
  const host = new WorldHost(store, OPTS);
  host.boot();
  const backups = new Backups(host, store.db, join(dir, 'world.db'), join(dir, 'backups'));
  const adminLog = new AdminLog(join(dir, 'admin.log'));
  const deps: AdminDeps = {
    token,
    host,
    store,
    backups,
    dataDir: dir,
    tournament: new TournamentJob(() => {}, () => {}),
    text: { readout: () => ({ enabled: false, provider: null, model: 'none', roles: [], day: '2026-10-12', dailyUsdCap: 0, spentToday: 0, reservedToday: 0, calls: 0, hits: 0, rejects: {} as never, stops: { cap: 0, rate: 0 }, fallbacks: 0, overlaySize: 0 }) },
    online: () => 2,
    adminLog,
    now: () => Date.now(),
  };
  return { dir, store, host, deps, adminLog };
}

const bearer = (t: string) => `Bearer ${t}`;

describe('the admin token', () => {
  it('is checked as a bearer token, and an empty admin token turns the admin off', () => {
    expect(adminAuthorized(bearer(TOKEN), TOKEN)).toBe(true);
    expect(adminAuthorized(undefined, TOKEN)).toBe(false);
    expect(adminAuthorized(bearer('wrong'), TOKEN)).toBe(false);
    expect(adminAuthorized(bearer(TOKEN + 'x'), TOKEN)).toBe(false);
    expect(adminAuthorized(`Basic ${TOKEN}`, TOKEN)).toBe(false);
    expect(adminAuthorized(bearer(''), '')).toBe(false);
    expect(adminAuthorized(bearer(TOKEN), '')).toBe(false);
  });

  it('answers 403 to every admin route without the right token, and the status with it', () => {
    const { deps, store } = setup();
    try {
      for (const p of ADMIN_PATHS) {
        expect(adminRoute('GET', p, undefined, {}, '127.0.0.1', deps).code).toBe(403);
        expect(adminRoute('GET', p, bearer('nope'), {}, '127.0.0.1', deps).code).toBe(403);
      }
      expect(adminRoute('POST', '/api/admin/backup', bearer('nope'), {}, '127.0.0.1', deps).code).toBe(403);
      expect(adminRoute('GET', '/api/admin/status', bearer(TOKEN), {}, '127.0.0.1', deps).code).toBe(200);
      const off = setup('');
      expect(adminRoute('GET', '/api/admin/status', bearer(''), {}, '127.0.0.1', off.deps).code).toBe(403);
      off.store.close();
    } finally {
      store.close();
    }
  });
});

describe('the admin readout', () => {
  it('carries the world figures and counts, and no player name or money', () => {
    const { deps, store, host } = setup();
    try {
      host.advance(3);
      expect(host.command('u_admin_readout', { type: 'join', handle: 'zzreaderzz', country: 'XX' }).ok).toBe(true);
      store.createAccount('u_admin_readout', 'zzreaderzz');
      const r = adminRoute('GET', '/api/admin/status', bearer(TOKEN), {}, '127.0.0.1', deps);
      expect(r.code).toBe(200);
      const s = r.body as unknown as ReturnType<typeof adminStatus>;
      expect(s.world.tick).toBe(host.g.market.tick);
      expect(s.world.day).toBe(Math.floor((host.g.market.tick - 1) / 720));
      expect(s.world.paused).toBe(false);
      expect(s.players.online).toBe(2);
      expect(s.players.registered).toBe(1);
      expect(s.ticks.lastHour).toBe(3); // the three advanced ticks
      expect(s.database.bytes).toBeGreaterThan(0);
      expect(s.backups.count).toBe(0);
      expect(s.backups.last).toBeNull();
      expect(s.tournament).toEqual({ running: null, retryInMs: 0 });
      expect(s.text.enabled).toBe(false);
      expect(JSON.stringify(r.body)).not.toContain('zzreaderzz');
    } finally {
      store.close();
    }
  }, 120_000);

  it('the tick times of the last hour: percentiles, and the tick count', () => {
    expect(percentile([], 0.5)).toBeNull();
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 0.5)).toBe(50);
    expect(percentile(hundred, 0.99)).toBe(99);
    expect(percentile([7], 0.99)).toBe(7);
    const { host, store } = setup();
    try {
      host.advance(5);
      const stats = host.tickStats();
      expect(stats.ticks).toBe(5);
      expect(stats.p50Ms).not.toBeNull();
      expect(stats.p99Ms!).toBeGreaterThanOrEqual(stats.p50Ms!);
      // an hour later the same ticks are out of the window
      expect(host.tickStats(Date.now() + 2 * 60 * 60 * 1000).ticks).toBe(0);
    } finally {
      store.close();
    }
  }, 120_000);
});

describe('the admin actions', () => {
  it('back up now writes a backup and logs it; the readout lists it', () => {
    const { deps, store, dir, adminLog } = setup();
    try {
      const r = adminRoute('POST', '/api/admin/backup', bearer(TOKEN), {}, '10.0.0.5', deps);
      expect(r.code).toBe(200);
      const b = r.body.backup as { name: string; tick: number; pauseMs: number };
      expect(listBackups(join(dir, 'backups')).map((f) => f.name)).toEqual([b.name]);
      expect(b.pauseMs).toBeGreaterThanOrEqual(0);
      const status = adminRoute('GET', '/api/admin/status', bearer(TOKEN), {}, '10.0.0.5', deps).body as unknown as ReturnType<typeof adminStatus>;
      expect(status.backups.count).toBe(1);
      expect(status.backups.last?.name).toBe(b.name);
      expect(status.actions[0]).toMatchObject({ action: 'backup', ip: '10.0.0.5' });
      expect(adminLog.recent().length).toBe(1);
      const lines = readFileSync(join(dir, 'admin.log'), 'utf8').trim().split('\n');
      expect(JSON.parse(lines[0]!)).toMatchObject({ action: 'backup', ip: '10.0.0.5' });
    } finally {
      store.close();
    }
  }, 120_000);

  it('pause and resume are checked, logged, and reject a bad body', () => {
    const { deps, store, host, dir } = setup();
    try {
      expect(adminRoute('POST', '/api/admin/pause', bearer(TOKEN), {}, '1.2.3.4', deps).code).toBe(400);
      expect(adminRoute('POST', '/api/admin/pause', bearer(TOKEN), { paused: 'yes' }, '1.2.3.4', deps).code).toBe(400);
      expect(adminRoute('GET', '/api/admin/pause', bearer(TOKEN), {}, '1.2.3.4', deps).code).toBe(405);
      const p = adminRoute('POST', '/api/admin/pause', bearer(TOKEN), { paused: true }, '1.2.3.4', deps);
      expect(p.body).toMatchObject({ ok: true, paused: true });
      expect(host.isPaused()).toBe(true);
      const q = adminRoute('POST', '/api/admin/pause', bearer(TOKEN), { paused: false }, '1.2.3.4', deps);
      expect(q.body).toMatchObject({ ok: true, paused: false });
      expect(host.isPaused()).toBe(false);
      const log = readFileSync(join(dir, 'admin.log'), 'utf8');
      expect(log).toContain('"action":"pause"');
      expect(log).toContain('"action":"resume"');
    } finally {
      store.close();
    }
  }, 120_000);

  it('a paused world stops ticking, and resumes from the same tick', async () => {
    const dir = tempDir();
    const store = new Store(dir);
    const host = new WorldHost(store, { ...OPTS, tickMs: 25 });
    host.boot();
    host.start();
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect(host.g.market.tick).toBeGreaterThan(0);
      host.pause();
      const at = host.g.market.tick;
      await new Promise((r) => setTimeout(r, 200));
      expect(host.g.market.tick).toBe(at);
      host.resume();
      await new Promise((r) => setTimeout(r, 200));
      expect(host.g.market.tick).toBeGreaterThan(at);
    } finally {
      host.stop();
      store.close();
    }
  }, 60_000);
});

describe('the admin routes', () => {
  it('answers only its own paths, and only the methods it means', () => {
    const { deps, store } = setup();
    try {
      expect(ADMIN_PATHS).toContain('/api/admin/status');
      expect(adminRoute('POST', '/api/admin/status', bearer(TOKEN), {}, '1', deps).code).toBe(405);
      expect(adminRoute('GET', '/api/admin/backup', bearer(TOKEN), {}, '1', deps).code).toBe(405);
      expect(existsSync(join(deps.dataDir, 'backups'))).toBe(false);
    } finally {
      store.close();
    }
  });
});
