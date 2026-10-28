// T04-20 04#16 (card test plan): an order sealed in tick N cannot react to a release published in tick N.
// Real engine-core intake (checkEnvelopes, deriveTickEntropy, sealTick) seals tick N's intents before tick N's phases run; the macro
// phases then run in production order (P2 publishes releases, intents apply, P6 clears auctions, P8). MISSING: T04-21 tick runner.
import { describe, expect, it, vi } from 'vitest';
import { checkEnvelopes, deriveTickEntropy, sealTick, toHandlerIntent, TICKS_PER_GAME_DAY, type RawIntent } from '@tycoon/engine-core';
import { macroTables, type AuctionBid, type SovAuction } from '../schema';
import { macroGenesis } from './genesis';
import { macroPhases } from './dispatch';
import { NULL_STAB_REPORT } from '../views/stabReport';
import { macroWorld } from '../testkit/macroWorld';
import { botPorts } from '../testkit/macroLoop';
import { bindSovBidPorts, sovBidIntent } from '../intents/sovBid';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));

const DAYS = 120, Z = new Uint8Array(32);   // genesis plans quarter 0 before the first fiscal close (offers 0, not announced): the first auctions are in quarter 1
describe('04#16 seal order', () => {
  it('a bot that bids only after seeing macro.release.published: every intent sealed at tick ≥ R + 1; none applied or filled at tick R', () => {
    const p = botPorts(); bindSovBidPorts(p);
    const w = macroWorld('seal', 0); macroGenesis(w.ctx, p);
    const ph = macroPhases(p, NULL_STAB_REPORT);
    const releaseTicks: number[] = [], reacted: number[] = [], sealed: { tick: number; reactsTo: number; auction: string; booked: number }[] = [], done: string[] = [];
    const reactsTo: Record<string, { r: number; auction: string }> = {};
    let seq = 0, nonce = 0n, seen = w.events.length;
    for (let t = 0; t < DAYS * TICKS_PER_GAME_DAY; t++) {
      // 1. intake for tick t: the bot sees only what tick t − 1 and earlier published
      const raw: RawIntent[] = [];
      const pending = releaseTicks.filter((r) => !reacted.includes(r));
      const open = [...w.store.iter<SovAuction & { id: string }>(macroTables.auction.name)].filter((a) => !a.result && a.whenIssuedYield !== null
        && t >= a.bidOpenTick && t <= a.auctionTick - 1 && !done.includes(a.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (pending.length > 0 && open.length > 0) {
        const a = open[0]!; done.push(a.id); reacted.push(...pending);
        raw.push({ intentId: `int_seal_${seq++}`, actorId: 'usr_bot', kind: sovBidIntent.kind, clientTick: t, nonce: ++nonce, channel: 'API', receivedSeq: seq,
          gatewayId: 'gw', signatureValid: true, partitionId: 'p0',
          payload: { auctionId: a.id, kind: 'COMPETITIVE', face: '1000000', yieldBp: Math.trunc((a.whenIssuedYield ?? 0) * 1e4), accountId: 'usr_bot' } });
        reactsTo[`int_seal_${seq - 1}`] = { r: pending[pending.length - 1]!, auction: a.id };
      }
      const env = checkEnvelopes({ tick: t, raw, nonces: { last: () => undefined }, limits: { maxAgeTicks: 10, perActor: 100, perPrincipal: 100 },
        knownKinds: (k) => k === sovBidIntent.kind, schemaOk: () => true });
      const batch = sealTick(env.accepted, t, deriveTickEntropy('w_seal', t, Z, env.intentsRoot, Z));
      // 2. tick t phases
      w.setTick(t);
      ph.P2?.(w.ctx); ph.P4?.(w.ctx);
      for (const s of batch) {
        const h = toHandlerIntent(s);
        expect(sovBidIntent.apply(w.ctx, h as Parameters<typeof sovBidIntent.apply>[1])).toBeNull();
        const x = reactsTo[s.intentId]!, row = [...w.store.iter<AuctionBid>(macroTables.bid.name)].find((r) => r.auctionId === x.auction && r.bidderId === 'usr_bot')!;
        sealed.push({ tick: s.tick, reactsTo: x.r, auction: x.auction, booked: row.submittedTick });
      }
      ph.P6?.(w.ctx); ph.P8?.(w.ctx);
      for (; seen < w.events.length; seen++) if (w.events[seen]!.kind === 'macro.release.published' && !releaseTicks.includes(t)) releaseTicks.push(t);
    }
    expect(releaseTicks.length).toBeGreaterThan(0);
    expect(sealed.length).toBeGreaterThan(0);
    for (const s of sealed) expect(s.tick).toBeGreaterThanOrEqual(s.reactsTo + 1);
    for (const s of sealed) {
      const a = w.store.get<SovAuction>(macroTables.auction.name, s.auction)!;
      expect(s.booked).toBe(s.tick);    // booked at the sealed tick
      expect(a.result).toBeDefined(); expect(a.auctionTick).toBeGreaterThan(s.reactsTo);  // filled (P6 at auctionTick) after the release tick
    }
    expect(sealed.some((s) => s.tick === s.reactsTo + 1)).toBe(true);                    // the boundary is tight: next-tick reaction happens
  }, 600_000);
});
