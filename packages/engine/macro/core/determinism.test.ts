// T04-20 04#1 (card test plan): two worlds, same seed, 1820 game days, the wired tick loop with a fixed bot intent script.
import { describe, expect, it, vi } from 'vitest';
import { macroTables, type HookCall } from '../schema';
import { macroGenesis } from './genesis';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { botPorts, macroRows, macroStateHash, runDays, sovBidBot } from '../testkit/macroLoop';
import { bindSovBidPorts } from '../intents/sovBid';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const yieldLoop = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });   // keeps the vitest worker RPC alive on long loops
// Card length (1820 GD, two worlds) exceeds the 30-min per-PR budget on the CI runner (timed out at 1,800 s on 84464fd8):
// the full card run goes to the nightly engine job (TYCOON_LONG=1, 180-min timeout), as 03#39 does; each PR runs the first game year.
const LONG = process.env.TYCOON_LONG === '1';
const DAYS = LONG ? 1820 : 364;
const KINDS = ['macro.release.published', 'macro.cb.decision', 'macro.sov.auction.result'];
const pub = (w: MacroWorld) => w.events.filter((e) => KINDS.includes(e.kind));

describe('04#1 determinism', () => {
  it(`same seed, ${DAYS} days, bot script: stateHash equal at every day close; releases, decisions, auction results deep-equal`, async () => {
    const p = botPorts(); bindSovBidPorts(p);
    const a = macroWorld('det', 0), b = macroWorld('det', 0); macroGenesis(a.ctx, p); macroGenesis(b.ctx, p);
    const ha: string[] = [], hb: string[] = [], applied: { tick: number; rejected: unknown }[] = [];
    // interleaved one day at a time so both worlds are compared at every close without holding two hash series of the full run
    let diff = -1;
    for (let d = 0; d < DAYS && diff < 0; d++) {
      runDays(a, p, d, d + 1, { bot: botA, applied, onDayClose: () => ha.push(macroStateHash(a)) });
      runDays(b, p, d, d + 1, { bot: botB, onDayClose: () => hb.push(macroStateHash(b)) });
      if (ha[d] !== hb[d]) diff = d;
      await yieldLoop();
    }
    expect(diff).toBe(-1);
    expect(ha).toHaveLength(DAYS);
    expect(applied.filter((x) => x.rejected === null).length).toBeGreaterThan(50);   // the script really bid
    for (const k of KINDS) expect(pub(a).filter((e) => e.kind === k).length).toBeGreaterThan(0);
    expect(pub(b)).toEqual(pub(a));
    expect(b.events).toEqual(a.events);
    expect(macroRows(b)[macroTables.auction.name]).toEqual(macroRows(a)[macroTables.auction.name]);
    expect(macroRows(b)).toEqual(macroRows(a));
    // AC-04-18-HOOKID (2), (5) (E-105): every source id non-empty, (hook, args.key, worldEventId) unique, same seed → same ids
    // (rows deep-equal above); only wev_ ids resolve in mac.event, every other kind is a composite or a case/auction id.
    const hooks = a.store.iter<HookCall>(macroTables.hookCall.name);
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.filter((h) => h.worldEventId === '')).toEqual([]);
    const keyOf = (h: HookCall): string => `${h.hook}|${String(h.args['key'] ?? '')}|${h.worldEventId}`;
    expect(new Set(hooks.map(keyOf)).size).toBe(hooks.length);
    expect(b.store.iter<HookCall>(macroTables.hookCall.name).map((h) => h.worldEventId)).toEqual(hooks.map((h) => h.worldEventId));
    for (const h of hooks) expect([h.worldEventId, a.store.get(macroTables.event.name, h.worldEventId) !== undefined]).toEqual([h.worldEventId, h.worldEventId.startsWith('wev_')]);
  }, LONG ? 9_000_000 : 1_800_000);
});
const botA = sovBidBot(), botB = sovBidBot();
