import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { dayClose } from './close';
import { textProvider } from './text';
import { renderMsg } from './text/template';
import type { GameState, Command, WireItem } from './types';

const TPD = 720;

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A player joins a few ticks into day 1 (their first close is day 1's: tick 1440). */
function joined(seed: string, handle = 'trader_u1'): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle, country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

function runTo(g: GameState, tick: number) {
  while (g.market.tick < tick) stepGame(g);
}

describe('the daily close card (D-7)', () => {
  it('a flat day with no trades: the card reads the marks, a flat line, and no ranking', () => {
    const g = joined('close-flat');
    runTo(g, 2 * TPD);
    const card = dayClose(g, 'u1', 1)!;
    const p = g.players.u1!;
    expect(card.nwClose).toBe(p.markNetWorth);
    expect(card.nwChange).toBeCloseTo(0, 6);
    expect(card.best).toBeNull();
    expect(card.worst).toBeNull();
    expect(card.ghosts.percentile).toBeNull();
    expect(card.lines.map((m) => m.key)).toContain('dayclose.noTrades');
    expect(card.lines.map((m) => m.key)).toContain('dayclose.nw.flat');
    expect(card.lines[0]!.key).toBe('dayclose.title');
  });

  it('the net worth change is the liquidation-value change to the cent, over several seeds', { timeout: 120_000 }, () => {
    for (const seed of ['close-a', 'close-b', 'close-c']) {
      const g = joined(seed);
      cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 3 } });
      runTo(g, 2 * TPD);
      const card = dayClose(g, 'u1', 1)!;
      const p = g.players.u1!;
      expect(Math.abs(card.nwClose - p.markNetWorth!)).toBeLessThan(0.005);
      expect(Math.abs(card.nwChange - (card.nwClose - card.nwOpen))).toBeLessThan(1e-9);
      expect(card.nwOpen).toBeCloseTo(g.ledgers!.u1!.days[0]!.nw, 9);
    }
  });

  it('best and worst positions use the quantity held at the open and the day price change', { timeout: 60_000 }, () => {
    const g = joined('close-best');
    // bought in day 1, so the day-1 close records the position and day 2 has it at the open
    cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 5 } });
    runTo(g, 3 * TPD);
    const card = dayClose(g, 'u1', 2)!;
    expect(card.best?.assetId).toBe('HLCN');
    const p0 = g.dayCloses![1]!.px.HLCN!;
    const p1 = g.dayCloses![2]!.px.HLCN!;
    expect(card.best!.usd).toBeCloseTo(5 * (p1 - p0), 6);
    expect(card.best!.pct).toBeCloseTo(p1 / p0 - 1, 9);
    expect(card.worst?.assetId).toBe('HLCN');
    expect(card.sectors!.best.pct).toBeGreaterThanOrEqual(card.sectors!.worst.pct);
  });

  it('an offline player gets the card as one inbox line; an online player gets the card on the record', () => {
    const g = joined('close-offline');
    g.players.u1!.online = false;
    runTo(g, 2 * TPD);
    const inbox = g.players.u1!.inbox;
    const item = inbox.find((n) => n.kind === 'close');
    expect(item).toBeDefined();
    expect(item!.msg?.key).toBe('dayclose.inbox');
    expect(item!.text).toMatch(/Daily close, day 2/);
    expect(g.ledgers!.u1!.closes.length).toBe(1);
  });

  it('an active world event shows its headline; an ended one adds its duration, and only the facts the card allows', () => {
    const g = joined('close-event');
    runTo(g, 2 * TPD);
    const tick = 2 * TPD - 5;
    const ended: WireItem = {
      id: 'wx1', tick, kind: 'world', tag: 'Crash', tone: 'info', text: 'Market crash ended after 3 days',
      ev: { type: 'world', id: 'e1', phase: 'end', kind: 'crash', lastedDays: 3, gxMove: -0.12 },
    };
    g.wire.unshift(ended);
    const card = dayClose(g, 'u1', 1)!;
    expect(card.event).toEqual({ phase: 'ended', headline: 'Market crash ended after 3 days', lastedDays: 3 });
    expect(JSON.stringify(card.event)).not.toMatch(/gxMove/);
    g.wire[0] = { ...ended, id: 'wx2', ev: { type: 'world', id: 'e2', phase: 'start', kind: 'bubble' }, text: 'A bubble starts' };
    const active = dayClose(g, 'u1', 1)!;
    expect(active.event).toEqual({ phase: 'active', headline: 'A bubble starts' });
  });

  it('priced-in chips show a band for the day stories, from the day window only', () => {
    const g = joined('close-stories');
    runTo(g, 2 * TPD);
    const tick = TPD + 100;
    g.wire.unshift(
      { id: 'ws1', tick, kind: 'move', tag: 'Move', tone: 'gain', text: 'Halcyon jumps', assetId: 'HLCN', news: 'jump' },
      { id: 'ws2', tick: 2, kind: 'move', tag: 'Move', tone: 'gain', text: 'Old news', assetId: 'ORBT', news: 'jump' },
    );
    const card = dayClose(g, 'u1', 1)!;
    // the day's own news is in; the old item from before the day is not
    expect(card.stories.map((s) => s.assetId)).toContain('HLCN');
    expect(card.stories.map((s) => s.assetId)).not.toContain('ORBT');
    expect(['early', 'mid', 'late']).toContain(card.stories[0]!.band);
  });

  it('every line renders in English and French, with the figures in both', () => {
    const g = joined('close-lines');
    runTo(g, 2 * TPD);
    const card = dayClose(g, 'u1', 1)!;
    expect(card.lines.length).toBeGreaterThan(4);
    for (const m of card.lines) {
      const en = renderMsg(m, 'en');
      const fr = renderMsg(m, 'fr');
      expect(en).not.toMatch(/\{\w+\}/);
      expect(fr).not.toMatch(/\{\w+\}/);
      expect(fr.length).toBeGreaterThan(0);
    }
    expect(textProvider.render({ key: 'dayclose.nw.up', vars: { change: '$1.00', pct: '0.10%', now: '$5,001.00' } }, 'fr')).toMatch(/valeur nette/);
  });
});
