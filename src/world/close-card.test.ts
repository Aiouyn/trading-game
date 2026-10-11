import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { ghostReport, ghostSeries } from './ghosts';
import { closeMove } from './close-move';
import { textProvider } from './text';
import { renderMsg } from './text/template';
import type { DailyClose } from './ledger-types';
import { playerView } from './view';
import type { Command, GameState } from './types';

// The card's world side (Phase 3 B1): the seen marker, the offline notice that opens the card, and the daily series the
// ghost lines are drawn from.

const TPD = 720;

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

function runTo(g: GameState, tick: number) {
  while (g.market.tick < tick) stepGame(g);
}

describe('the close card: seen marker, offline notice and ghost series', () => {
  it('close.seen only moves forward, to a whole game day, and the view reports it', () => {
    const g = joined('close-seen');
    expect(playerView(g, 'u1')!.trading.closeSeenDay).toBeNull();
    expect(cmd(g, 'u1', { type: 'close.seen', day: 2 }).ok).toBe(true);
    expect(playerView(g, 'u1')!.trading.closeSeenDay).toBe(2);
    cmd(g, 'u1', { type: 'close.seen', day: 1 });
    expect(playerView(g, 'u1')!.trading.closeSeenDay).toBe(2);
    cmd(g, 'u1', { type: 'close.seen', day: -4 });
    cmd(g, 'u1', { type: 'close.seen', day: 1.5 });
    expect(playerView(g, 'u1')!.trading.closeSeenDay).toBe(2);
  });

  it('an offline player gets a close notice that names its day and opens the card', () => {
    const g = joined('close-offline');
    g.players.u1!.online = false;
    // the player joins during game day 1 (the warmup ends on a day boundary), so their first close is day 1 at tick 1440
    runTo(g, 2 * TPD);
    const v = playerView(g, 'u1')!;
    const note = v.inbox.find((n) => n.kind === 'close');
    expect(note).toBeDefined();
    expect(note!.day).toBe(1);
    expect(note!.msg?.key).toBe('dayclose.inbox');
    expect(v.trading.closes[0]!.day).toBe(1);
    // the card is waiting in Messages: it is flagged so it does not pop up on connect
    expect(v.trading.closes[0]!.offline).toBe(true);
  });

  it('an online player gets the card unflagged and no inbox notice for it', () => {
    const g = joined('close-online');
    runTo(g, 2 * TPD);
    const v = playerView(g, 'u1')!;
    expect(v.trading.closes[0]!.day).toBe(1);
    expect(v.trading.closes[0]!.offline).toBe(false);
    expect(v.inbox.some((n) => n.kind === 'close')).toBe(false);
  });

  it('the luck panel changes come from the report, against the start cash', () => {
    const g = joined('close-change');
    runTo(g, 2 * TPD);
    const r = ghostReport(g, 'u1')!;
    expect(r.change.basket).toBeCloseTo(r.basket / r.startCash - 1, 12);
    expect(r.change.player).toBeCloseTo(r.player / r.startCash - 1, 12);
    expect(r.change.random).toBeCloseTo(r.random / r.startCash - 1, 12);
    expect(r.change.momentum).toBeCloseTo(r.momentum / r.startCash - 1, 12);
  });

  it('a sub-dollar day reads flat in the card headline and in the Copy summary (one rule)', () => {
    expect(closeMove(0.5)).toBe('flat');
    expect(closeMove(-0.99)).toBe('flat');
    expect(closeMove(1)).toBe('up');
    expect(closeMove(-1)).toBe('down');
    const card: Omit<DailyClose, 'lines'> = {
      day: 3, offline: false, nwOpen: 1000, nwClose: 1000.5, nwChange: 0.5, nwChangePct: 0.0005, best: null, worst: null,
      gx: { pct: 0 }, sectors: null, stories: [], event: null,
      ghosts: { player: 1000.5, basket: 1000, random: 1000, momentum: 1000, beaten: 0, percentile: 0 },
    };
    const lines = textProvider.dailyClose(card);
    expect(lines.map((m) => m.key.replace(/\.\d$/, ''))).toContain('txt.narr.nw.flat');
    const summary = lines.map((m) => renderMsg(m, 'en')).join('\n');
    expect(summary).not.toMatch(/rose|fell|augment|baiss/i);
    expect(renderMsg({ key: 'close.head.flat' }, 'en')).toBe('A flat day.');
  });

  it('the ghost series keeps every closed day the chart needs (not only the last two)', { timeout: 60_000 }, () => {
    const g = joined('close-series');
    runTo(g, 4 * TPD + 1); // closes of days 1, 2 and 3 (the player joined on day 1)
    const series = ghostSeries(g, 'u1', 60);
    expect(series.map((s) => s.day)).toEqual([1, 2, 3]);
    for (const s of series) {
      expect(Number.isFinite(s.basket) && Number.isFinite(s.random) && Number.isFinite(s.momentum)).toBe(true);
    }
  });
});
