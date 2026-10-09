import { indexLevel, parseContract, type Account, type Order, type WorldConfig, type WorldState } from '@/engine';
import type { Command } from '@/world/types';
import { mirrorWorld, type MarketFrame } from '@/world/view';
import { ensureSeries, ensureVolume, record, type History } from './history';

/**
 * The client's copy of the universe. It starts from the static config and is replaced by the server's asset list at
 * the welcome; after that it follows the server's listings (IPOs, delistings, spin-offs) through the frames.
 */
export interface Universe {
  config: WorldConfig;
  /** the server's asset list version this config matches (MarketFrame.cfgSeq) */
  cfgSeq: number;
}

export interface MirrorMe {
  id: string;
  account: Account | null;
  orders: Order[];
}

/**
 * Bring the universe up to a frame's version. `behind` = the list moved but this frame did not carry it (a missed
 * change): the caller must reconnect to get a fresh welcome. Pure.
 */
export function syncUniverse(cur: Universe, frame: MarketFrame): Universe & { behind: boolean } {
  if (frame.cfgSeq === cur.cfgSeq) return { ...cur, behind: false };
  if (frame.defs) return { config: { ...cur.config, assets: frame.defs }, cfgSeq: frame.cfgSeq, behind: false };
  return { ...cur, behind: true };
}

/** The chart series a universe needs: a price ring and a volume ring per asset, plus the indices. */
export function ensureUniverseSeries(h: History, config: WorldConfig): void {
  const assets = config.assets.map((a) => a.id);
  ensureSeries(h, assets);
  ensureVolume(h, assets);
}

export interface Absorbed {
  universe: Universe;
  world: WorldState;
  behind: boolean;
}

/**
 * Apply one market frame: resolve the universe, rebuild the engine mirror, and record the frame's prices into the
 * chart history (history is mutated in place, as record always does). Never throws on a frame that is one listing
 * ahead of the config: the extra entries are ignored until the client resyncs.
 */
export function absorbFrame(cur: Universe, history: History, prevWorld: WorldState | null, frame: MarketFrame, me: MirrorMe): Absorbed {
  const u = syncUniverse(cur, frame);
  const config = u.config;
  ensureUniverseSeries(history, config);
  const world = mirrorWorld(config, frame, me, prevWorld ?? undefined);
  if (frame.tick > history.lastTick) {
    const p: Record<string, number> = {};
    const cum: Record<string, number> = {};
    config.assets.forEach((d, i) => {
      const f = frame.assets[i];
      if (!f) return;
      p[d.id] = Math.exp(f[0]);
      cum[d.id] = f[6];
    });
    for (const idx of config.indices) p[idx.id] = indexLevel(world, idx.id);
    record(history, frame.tick, p, cum);
  }
  return { universe: { config, cfgSeq: u.cfgSeq }, world, behind: u.behind };
}

/** A name the universe lists and then delisted: it keeps its slot and price but no longer trades. */
export function isDelisted(config: WorldConfig, id: string): boolean {
  return config.assets.some((a) => a.id === id && a.listed === false);
}

/**
 * The reason a command must not be sent because its name is delisted, or null. The engine does not refuse these (a
 * delisted name keeps a frozen price), so the client refuses them before sending: orders in the name, and options
 * written on it (a listed option's underlying can be delisted later).
 */
export function delistedRefusal(config: WorldConfig, cmd: Command): string | null {
  if (cmd.type === 'order.place' && isDelisted(config, cmd.order.assetId)) return `${cmd.order.assetId} is delisted and no longer trades`;
  if (cmd.type === 'option.trade') {
    const underlying = parseContract(cmd.contractId)?.underlying;
    if (underlying && isDelisted(config, underlying)) return `${underlying} is delisted: its options no longer trade`;
  }
  return null;
}
