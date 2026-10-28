// T04-20 test kit: the wired tick loop (macroPhases P2, P4, P6, P8 at every tick, the production order) and the mac.* stateHash.
import { entityHash, partitionMerkle, TICKS_PER_GAME_DAY, type PhaseCtx, type SealedIntent } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import { ALL_MACRO_TABLES, macroTables, type SovAuction } from '../schema';
import { macroPhases } from '../core/dispatch';
import { NULL_STAB_REPORT } from '../views/stabReport';
import { sovBidIntent } from '../intents/sovBid';
import type { MacroWorld } from './macroWorld';
import { stubPorts } from './cbWorld';

const D = TICKS_PER_GAME_DAY, TABLES = ALL_MACRO_TABLES.map((t) => t.name);
/** Partition Merkle of every mac.* row (the store's stateHash construction, over the test store). */
export function macroStateHash(w: MacroWorld): string {
  const e: { table: string; id: string; eh: Uint8Array }[] = [];
  for (const t of TABLES) for (const r of w.store.iter<{ id: string }>(t)) e.push({ table: t, id: r.id, eh: entityHash(r) });
  return Array.from(partitionMerkle(e)).join(',');
}
/** Every mac.* row, by table, sorted by id. */
export function macroRows(w: MacroWorld): Record<string, unknown[]> {
  const o: Record<string, unknown[]> = {};
  for (const t of TABLES) o[t] = [...w.store.iter<{ id: string }>(t)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return o;
}

/** A bot intent applied in P6 before the module's P6 work (the intent apply step of the phase). */
export type Bot = (ctx: PhaseCtx) => SealedIntent<unknown>[];
let k = 0;
/** Fixed bot script: LIC4 actor usr_bot bids 1 000 000 face competitive at the when-issued yield (whole bp) once on every open auction, at tick-of-day 100. */
export function sovBidBot(actor = 'usr_bot'): Bot {
  const done: string[] = [];
  return (ctx) => {
    if (ctx.cal.tickOfDay !== 100) return [];
    const out: SealedIntent<unknown>[] = [];
    const open = [...ctx.store.iter<SovAuction & { id: string }>(macroTables.auction.name)].filter((a) => !a.result && a.whenIssuedYield !== null
      && ctx.tick >= a.bidOpenTick && ctx.tick <= a.auctionTick - 1 && !done.includes(a.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const a of open) {
      done.push(a.id);
      out.push({ intentId: `int_bot_${k++}`, actorId: actor, tick: ctx.tick, kind: sovBidIntent.kind,
        payload: { auctionId: a.id, kind: 'COMPETITIVE', face: '1000000', yieldBp: Math.trunc((a.whenIssuedYield ?? 0) * 1e4), accountId: actor } } as unknown as SealedIntent<unknown>);
    }
    return out;
  };
}

export interface LoopOpts { bot?: Bot; onDayClose?: (d: number) => void; applied?: { tick: number; rejected: unknown }[] }
/** Runs ticks [from·720, to·720) through macroPhases in production order; onDayClose runs after P8 of tick 719. Long callers yield between calls. */
export function runDays(w: MacroWorld, ports: MacroPorts, from: number, to: number, o: LoopOpts = {}): void {
  const ph = macroPhases(ports, NULL_STAB_REPORT);
  for (let d = from; d < to; d++) {
    for (let tod = 0; tod < D; tod++) {
      w.setTick(d * D + tod);
      ph.P2?.(w.ctx); ph.P4?.(w.ctx);
      for (const i of o.bot?.(w.ctx) ?? []) {
        const r = sovBidIntent.apply(w.ctx, i as SealedIntent<Parameters<typeof sovBidIntent.apply>[1]['payload']>);
        o.applied?.push({ tick: w.ctx.tick, rejected: r });
      }
      ph.P6?.(w.ctx); ph.P8?.(w.ctx);
    }
    o.onDayClose?.(d);
  }
}

/** stubPorts plus the bot as a LIC4 player (competitive sovereign bids allowed). */
export function botPorts(): MacroPorts {
  const d = stubPorts();
  return { ...d, players: { ...d.players, licenseOf: (_s, e) => (e === 'usr_bot' ? 'LIC4' : null) } };
}
