// T04-20 04#2 and 04#3 (card test plan), 364 days each on the wired tick loop.
import { describe, expect, it, vi } from 'vitest';
import { BLOC_ORDER, macroTables } from '../schema';
import { macroGenesis } from './genesis';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
import { botPorts, macroRows, macroStateHash, runDays, sovBidBot } from '../testkit/macroLoop';
import { bindSovBidPorts } from '../intents/sovBid';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const yieldLoop = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });   // keeps the vitest worker RPC alive on long loops
const DAYS = 364;
const state = (w: MacroWorld) => ({ blocs: BLOC_ORDER.map((b) => w.store.get(macroTables.bloc.name, b)), global: w.store.get(macroTables.global.name, 'GLOBAL') });

describe('04#2 / 04#3 isolation', () => {
  it(`04#2: N_a pinned (0, T22 activityWeighted MISSING EXPORT); with and without player intents for ${DAYS} days: BlocMacroState and GlobalMacroState deep-equal at every close`, async () => {
    const p = botPorts(); bindSovBidPorts(p);
    const a = macroWorld('iso', 0), b = macroWorld('iso', 0); macroGenesis(a.ctx, p); macroGenesis(b.ctx, p);
    const bot = sovBidBot(), applied: { tick: number; rejected: unknown }[] = [];
    for (let d = 0; d < DAYS; d++) {
      runDays(a, p, d, d + 1, { bot, applied }); runDays(b, p, d, d + 1);
      expect(state(b)).toEqual(state(a));
      await yieldLoop();
    }
    expect(applied.filter((x) => x.rejected === null).length).toBeGreaterThan(5);
    expect(a.store.iter(macroTables.bid.name).length + a.events.filter((e) => e.kind === 'macro.sov.bid.accepted').length).toBeGreaterThan(0);
  }, 900_000);
  it(`04#3: an extra stream (test.extra) drawn every tick for ${DAYS} days: every mac.* row identical, stateHash equal at every close`, async () => {
    const p = stubPorts();
    const a = macroWorld('x3', 0), b = macroWorld('x3', 0); macroGenesis(a.ctx, p); macroGenesis(b.ctx, p);
    const extra = { bot: (ctx: typeof b.ctx) => { ctx.rng('test.extra').uOpen(); return []; } };
    for (let d = 0; d < DAYS; d++) {
      runDays(a, p, d, d + 1); runDays(b, p, d, d + 1, extra);
      expect(macroStateHash(b)).toBe(macroStateHash(a));
      await yieldLoop();
    }
    expect(b.draws['test.extra']).toBe(DAYS * 720);
    expect(macroRows(b)).toEqual(macroRows(a));
  }, 900_000);
});
