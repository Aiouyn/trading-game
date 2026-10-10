import { indexLevel, portfolio, universeConfig } from '../src/engine';
import { createHistory, ensureSeries, ensureVolume, record, lastTicks, type History } from '../src/game/history';
import { LEDGER } from '../src/content/learning';
import { ghostSeries } from '../src/world/ghosts';
import { applyCommand, createGame, stepGame } from '../src/world/game';
import { flagNpcAccounts } from '../src/world/players';
import { migrateShops } from '../src/world/shops';
import { BOARD_EVERY } from '../src/world/core';
import type { Command, CommandResult, GameState, StepOutput } from '../src/world/types';
import type { EcoArchiveDay } from '../src/engine';
import type { HistoryPayload, NwHistoryPayload } from '../src/net/protocol';
import type { Store } from './db';

export interface HostOptions {
  seed: string;
  tickMs: number;
  warmupDays: number;
  /** ticks between snapshots (default 60 = 5 real minutes) */
  snapshotEvery: number;
  log?: (msg: string) => void;
}

const NW_EVERY = 12;
const NW_RING = 600;

interface NwSeries { samples: number[]; lastTick: number; daily: { day: number; value: number }[] }

/**
 * Owns the one persistent world. Commands apply the moment they arrive (between ticks) and are
 * logged with the tick they applied at; the world steps every tickMs. Snapshots plus the log
 * rebuild the exact world after a restart (stepGame/applyCommand are deterministic).
 */
export class WorldHost {
  g!: GameState;
  history!: History;
  nw: Record<string, NwSeries> = {};
  private timer: NodeJS.Timeout | null = null;
  private nextAt = 0;
  private listeners: ((out: StepOutput, publicTick: boolean) => void)[] = [];
  private ticksSinceSnapshot = 0;
  /** the last game day whose explain archive row is in the store (the archive is written day by day, not in snapshots) */
  private archivedThrough = -Infinity;

  constructor(private store: Store, private opts: HostOptions) {}

  private log(msg: string) {
    this.opts.log?.(msg);
  }

  /**
   * The explain archive is read back from its own rows, up to the snapshot's close: a later row is a day the replay below
   * re-derives (the rows are idempotent, so a crash between the two writes cannot duplicate a day).
   */
  private loadArchive(): void {
    const eco = this.g.market.ecology;
    if (!eco) return;
    const days = this.store.loadArchiveDays().map((j) => JSON.parse(j) as EcoArchiveDay).filter((d) => d.day <= eco.day);
    if (days.length === 0) return;
    this.g.market.ecology = { ...eco, archive: days };
    this.archivedThrough = days[days.length - 1]!.day;
  }

  /** Load the world from disk, or create it (with warmup history) on first start. */
  boot(): void {
    const snap = this.store.latestSnapshot();
    if (snap) {
      this.g = JSON.parse(snap.data) as GameState;
      flagNpcAccounts(this.g); // saves from before the account flag (P1)
      migrateShops(this.g); // saves from before the shop levers (Phase 4 A1): well-run defaults, before the replay
      this.loadArchive();
      const h = this.store.getBlob('history');
      this.history = h ? (JSON.parse(h) as History) : this.freshHistory();
      const nw = this.store.getBlob('nw');
      this.nw = nw ? JSON.parse(nw) : {};
      const cmds = this.store.commandsSince(snap.tick);
      let k = 0;
      // replay: commands logged at tick t were applied before the step out of t
      const lastTick = cmds.length ? cmds[cmds.length - 1]!.tick : this.g.market.tick;
      while (true) {
        while (k < cmds.length && cmds[k]!.tick === this.g.market.tick) {
          applyCommand(this.g, cmds[k]!.pid, cmds[k]!.cmd);
          k++;
        }
        if (this.g.market.tick >= lastTick) break;
        stepGame(this.g);
        this.recordTick();
      }
      this.log(`world loaded at tick ${this.g.market.tick} (${Object.keys(this.g.players).length} players, replayed ${cmds.length} commands)`);
    } else {
      this.log(`creating world "${this.opts.seed}" with ${this.opts.warmupDays} days of history…`);
      const ids = this.seriesIds();
      this.history = createHistory(ids.all, 720, ids.volume);
      this.g = createGame(this.opts.seed, {
        warmupDays: this.opts.warmupDays,
        onWarmupTick: (g) => {
          this.g = g;
          this.recordTick();
        },
      });
      this.recordTick();
      this.snapshot();
      this.log(`world created at tick ${this.g.market.tick}`);
    }
  }

  private freshHistory(): History {
    const ids = this.seriesIds();
    return createHistory(ids.all, 720, ids.volume);
  }

  /** The starting universe. Assets listed later (IPOs, spin-offs) get their series in recordTick. */
  private seriesIds(): { all: string[]; volume: string[] } {
    const c = universeConfig();
    const assets = c.assets.map((a) => a.id);
    return { all: [...c.indices.map((i) => i.id), ...assets], volume: assets };
  }

  /** Record this tick's prices into the chart history and net worth samples. */
  private recordTick(): void {
    const g = this.g;
    const p: Record<string, number> = {};
    const cum: Record<string, number> = {};
    g.market.config.assets.forEach((d, i) => {
      // the engine appends listings at runtime: a new asset gets its price and volume series the tick it appears
      if (!this.history.series[d.id]) {
        ensureSeries(this.history, [d.id]);
        ensureVolume(this.history, [d.id]);
      }
      p[d.id] = Math.exp(g.market.assets[i]!.lnP);
      cum[d.id] = g.market.assets[i]!.cumVolume ?? 0;
    });
    for (const idx of g.market.config.indices) p[idx.id] = indexLevel(g.market, idx.id);
    record(this.history, g.market.tick, p, cum);
    if (g.market.tick % NW_EVERY === 0) {
      const day = Math.floor((g.market.tick - 1) / 720);
      for (const pl of Object.values(g.players)) {
        if (pl.npc) continue;
        const s = (this.nw[pl.id] ??= { samples: [], lastTick: g.market.tick, daily: [] });
        // the line is trading and income only: the grants, transfers and loans received so far are taken out, so a grant
        // draws no jump (the same basis as the day and arrival figures; each point keeps the basis of its own tick)
        const trading = pl.netWorth - (pl.externalCash ?? 0);
        s.samples.push(trading);
        if (s.samples.length > NW_RING) s.samples.splice(0, s.samples.length - NW_RING);
        s.lastTick = g.market.tick;
        const last = s.daily[s.daily.length - 1];
        if (last && last.day === day) last.value = trading;
        else s.daily.push({ day, value: trading });
        if (s.daily.length > 400) s.daily.shift();
      }
    }
  }

  onTick(fn: (out: StepOutput, publicTick: boolean) => void): void {
    this.listeners.push(fn);
  }

  start(): void {
    this.nextAt = Date.now() + this.opts.tickMs;
    const loop = () => {
      const now = Date.now();
      // catch up at most a few ticks if the process was busy; never run the world faster than real time
      let n = 0;
      while (now >= this.nextAt && n < 3) {
        this.tick();
        this.nextAt += this.opts.tickMs;
        n++;
      }
      if (now - this.nextAt > this.opts.tickMs * 10) this.nextAt = now + this.opts.tickMs;
      this.timer = setTimeout(loop, Math.max(5, this.nextAt - Date.now()));
    };
    this.timer = setTimeout(loop, this.opts.tickMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.snapshot();
  }

  /** One world tick. */
  tick(): StepOutput {
    const t0 = performance.now();
    const out = stepGame(this.g);
    this.recordTick();
    const publicTick = this.g.market.tick % BOARD_EVERY === 0;
    for (const fn of this.listeners) fn(out, publicTick);
    this.ticksSinceSnapshot++;
    if (this.ticksSinceSnapshot >= this.opts.snapshotEvery) this.snapshot();
    const ms = performance.now() - t0;
    if (ms > this.opts.tickMs * 0.5) this.log(`slow tick ${this.g.market.tick}: ${ms.toFixed(0)} ms`);
    return out;
  }

  /** Advance n ticks right now (dev and tests). */
  advance(n: number): void {
    for (let k = 0; k < n; k++) this.tick();
  }

  snapshot(): void {
    const eco = this.g.market.ecology;
    let state: GameState = this.g;
    if (eco?.archive) {
      const fresh = eco.archive.filter((d) => d.day > this.archivedThrough);
      if (fresh.length) {
        this.store.saveArchiveDays(fresh.map((d) => ({ day: d.day, json: JSON.stringify(d) })), eco.archive[0]!.day);
        this.archivedThrough = fresh[fresh.length - 1]!.day;
      }
      state = { ...this.g, market: { ...this.g.market, ecology: { ...eco, archive: undefined } } };
    }
    this.store.saveSnapshot(this.g.market.tick, JSON.stringify(state));
    this.store.setBlob('history', JSON.stringify(this.history));
    this.store.setBlob('nw', JSON.stringify(this.nw));
    this.ticksSinceSnapshot = 0;
  }

  command(pid: string, cmd: Command): CommandResult {
    this.store.logCommand(this.g.market.tick, pid, cmd);
    try {
      return applyCommand(this.g, pid, cmd);
    } catch (e) {
      this.log(`command ${cmd.type} from ${pid} threw: ${(e as Error).message}`);
      return { ok: false, error: 'server error' };
    }
  }

  historyFor(series: string): HistoryPayload | null {
    const s = this.history.series[series];
    if (!s) return null;
    const { prices, cums } = lastTicks(this.history, series, this.history.capacity);
    return { series, daily: s.daily, ticks: prices, lastTick: this.history.lastTick, ...(cums ? { cums } : {}) };
  }

  nwHistoryFor(pid: string): NwHistoryPayload {
    const s = this.nw[pid] ?? { samples: [], lastTick: this.g.market.tick, daily: [] };
    // the ghost lines span every closed day the ledger keeps, so the chart's "All" range is drawn in full
    return { samples: s.samples, lastTick: s.lastTick, every: NW_EVERY, daily: s.daily, ghosts: ghostSeries(this.g, pid, LEDGER.dayCloseKeep) };
  }

  equityOf(pid: string): number {
    return portfolio(this.g.market, pid).equity;
  }
}
