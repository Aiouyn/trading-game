import { describe, expect, it } from 'vitest';
import { FLOW_POOLS, EXPLAIN_ROWS, gameDayOfTick, TRADE_REALIZED_TOLERANCE, type Side } from '@/engine';
import { bannedIn } from './text/banned';
import { textProvider } from './text';
import { TPD, credit } from './core';
import { applyCommand, createGame, stepGame } from './game';
import { deskWindow } from './desk';
import { explainTradeFor, ledgerOf } from './ledger';
import type { DeskDossier } from './ledger-types';
import type { Command, GameState } from './types';

/** The Research Desk and the journal, through the world's own commands (the server's path). */

function game(seed: string): GameState {
  return createGame(seed, { warmupDays: 2, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function join(g: GameState, pid: string, handle: string, rich = 0) {
  const j = cmd(g, pid, { type: 'join', handle, country: 'AV' });
  if (!j.ok) throw new Error('join refused: ' + j.error);
  g.players[pid]!.onboarding.skipped = true;
  if (rich) credit(g, pid, rich, 'test');
}

/** A grant that also lifts the rank, as the admin route does. */
function rank(g: GameState, pid: string, amount: number) {
  const r = cmd(g, pid, { type: 'admin.grant', amount });
  if (!r.ok) throw new Error('grant refused: ' + r.error);
}

function trade(g: GameState, pid: string, assetId: string, side: Side, qty: number) {
  const r = cmd(g, pid, { type: 'order.place', order: { assetId, side, type: 'market', qty } });
  if (!r.ok) throw new Error(`${side} refused: ${r.error}`);
}

/** Steps until game day `day` has closed (the next day has begun). */
function runPastDay(g: GameState, day: number) {
  while (gameDayOfTick(g.market.tick, TPD) <= day + 1) stepGame(g);
}

describe('the Research Desk: queries', () => {
  it('locks until the desk is unlocked at R3, and refuses a query before that', () => {
    const g = game('desk-lock');
    join(g, 'u1', 'desk_lock');
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: 0, to: 0 })).toMatchObject({ ok: false });
    rank(g, 'u1', 6_000_000);
    expect(cmd(g, 'u1', { type: 'desk.unlock' }).ok).toBe(true);
    const w = deskWindow(g);
    expect(w.lastClosed).not.toBeNull();
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: w.firstDay, to: w.lastClosed! })).toMatchObject({ ok: true });
  });

  it('clamps the window to the closed days, and explains the move: the rows sum to the move and the flow is by pool', () => {
    const g = game('desk-clamp');
    join(g, 'u1', 'desk_clamp');
    rank(g, 'u1', 6_000_000);
    cmd(g, 'u1', { type: 'desk.unlock' });
    const w = deskWindow(g);
    const r = cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: w.firstDay - 5, to: 10_000 });
    expect(r.ok).toBe(true);
    const d = r.data as DeskDossier;
    expect(d.to).toBe(w.lastClosed);
    expect(d.from).toBe(w.firstDay);
    expect(d.assetId).toBe('HLCN');
    const sum = d.rows.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(sum - d.move)).toBeLessThanOrEqual(1e-12);
    for (const x of d.rows) expect(EXPLAIN_ROWS).toContain(x.row);
    expect(d.flow.map((x) => x.pool)).toEqual([...FLOW_POOLS]);
    for (const x of d.flow) expect(Math.abs(x.share)).toBeLessThanOrEqual(1);
    expect(d.memo.length).toBeGreaterThan(0);
    expect(d.memo.length).toBeLessThanOrEqual(3);
    expect(d.bars.length).toBeGreaterThan(1);
  });

  it('names nobody: the dossier carries no player id, handle or NPC name', () => {
    const g = game('desk-private');
    join(g, 'u1', 'secret_handle_zz');
    join(g, 'u2', 'other_handle_yy', 300_000);
    rank(g, 'u1', 6_000_000);
    cmd(g, 'u1', { type: 'desk.unlock' });
    trade(g, 'u2', 'HLCN', 'buy', 20);
    stepGame(g);
    const w = deskWindow(g);
    const r = cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: w.firstDay, to: w.lastClosed! });
    const json = JSON.stringify(r.data);
    for (const name of ['secret_handle_zz', 'other_handle_yy', 'u1', 'u2', 'Hale', 'Pinn', 'Vetch']) expect(json).not.toContain(name);
  });

  it('every memo line is clean in both languages, and the memo is past tense (no banned words)', () => {
    const g = game('desk-memo');
    join(g, 'u1', 'desk_memo');
    rank(g, 'u1', 6_000_000);
    cmd(g, 'u1', { type: 'desk.unlock' });
    const w = deskWindow(g);
    for (const asset of ['HLCN', 'NRON']) {
      const d = cmd(g, 'u1', { type: 'desk.query', assetId: asset, from: w.firstDay, to: w.lastClosed! }).data as DeskDossier;
      for (const m of d.memo) for (const locale of ['en', 'fr'] as const) expect(bannedIn(textProvider.render(m, locale))).toEqual([]);
    }
  });

  it('a lapsed desk refuses new queries but keeps its files readable', () => {
    const g = game('desk-lapse');
    join(g, 'u1', 'desk_lapse');
    rank(g, 'u1', 6_000_000);
    cmd(g, 'u1', { type: 'desk.unlock' });
    const w = deskWindow(g);
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: w.firstDay, to: w.lastClosed! }).ok).toBe(true);
    g.players['u1']!.desk = { ...g.players['u1']!.desk!, lapsed: true };
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: w.firstDay, to: w.lastClosed! })).toMatchObject({ ok: false });
    const file = cmd(g, 'u1', { type: 'desk.file', no: 1 });
    expect(file.ok).toBe(true);
    expect((file.data as DeskDossier).assetId).toBe('HLCN');
  });

  it('an unknown asset is refused without a file', () => {
    const g = game('desk-unknown');
    join(g, 'u1', 'desk_unknown');
    rank(g, 'u1', 6_000_000);
    cmd(g, 'u1', { type: 'desk.unlock' });
    const before = ledgerOf(g, 'u1')?.deskFiles?.length ?? 0;
    const w = deskWindow(g);
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'NOPE', from: w.firstDay, to: w.lastClosed! }).ok).toBe(false);
    expect(ledgerOf(g, 'u1')?.deskFiles?.length ?? 0).toBe(before);
  });
});

describe('the journal: a closed trade explained', () => {
  it('the detail is pending until the trade day closes, then explains to the ledger realized P&L within a cent', { timeout: 60_000 }, () => {
    const g = game('journal-explain');
    join(g, 'u1', 'journal_one', 300_000);
    trade(g, 'u1', 'HLCN', 'buy', 40);
    for (let k = 0; k < TPD + 40; k++) stepGame(g);
    trade(g, 'u1', 'HLCN', 'sell', 40);
    stepGame(g);
    const trip = ledgerOf(g, 'u1')!.trips.at(-1)!;
    const pending = cmd(g, 'u1', { type: 'journal.detail', tripId: trip.id });
    expect(pending.ok).toBe(true);
    expect((pending.data as { line: { key: string } }).line.key).toBe('journal.line.pending');
    runPastDay(g, gameDayOfTick(trip.closeTick, TPD));
    const r = cmd(g, 'u1', { type: 'journal.detail', tripId: trip.id });
    const d = r.data as { line: { key: string }; analyst: string | null; rows: unknown; total: number | null; replay: { series: { day: number; px: number }[] } | null };
    expect(d.line.key).not.toBe('journal.line.pending');
    // free tier: the sentence, but no parts
    expect(d.analyst).toBeNull();
    expect(d.rows).toBeNull();
    expect(d.replay!.series.length).toBeGreaterThan(0);
    // hired analyst: the parts sum to the explain total, which is the ledger's realized P&L
    g.players['u1']!.analyst = { tier: 'junior', hiredDay: 0, paidThroughDay: 99 };
    const withParts = cmd(g, 'u1', { type: 'journal.detail', tripId: trip.id }).data as { rows: { value: number }[]; total: number };
    const sum = withParts.rows.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(sum - withParts.total)).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    expect(Math.abs(withParts.total - trip.realizedPnl)).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    expect(Math.abs(withParts.total - explainTradeFor(g, 'u1', trip.id).total)).toBeLessThanOrEqual(1e-9);
  });

  it('senior adds the flow by pool (summing to the flow row) and the headlines; junior does not', { timeout: 60_000 }, () => {
    const g = game('journal-senior');
    join(g, 'u1', 'journal_senior', 300_000);
    trade(g, 'u1', 'NRON', 'buy', 30);
    for (let k = 0; k < 2 * TPD; k++) stepGame(g);
    trade(g, 'u1', 'NRON', 'sell', 30);
    stepGame(g);
    const trip = ledgerOf(g, 'u1')!.trips.at(-1)!;
    runPastDay(g, gameDayOfTick(trip.closeTick, TPD));
    g.players['u1']!.analyst = { tier: 'senior', hiredDay: 0, paidThroughDay: 99 };
    const d = cmd(g, 'u1', { type: 'journal.detail', tripId: trip.id }).data as {
      rows: { row: string; value: number }[]; flow: { pool: string; value: number }[]; headlines: { day: number; text: string }[];
    };
    const flowRow = d.rows.find((x) => x.row === 'flow')?.value ?? 0;
    const poolSum = d.flow.reduce((s, x) => s + x.value, 0);
    expect(Math.abs(poolSum - flowRow)).toBeLessThanOrEqual(1e-9);
    expect(Array.isArray(d.headlines)).toBe(true);
    g.players['u1']!.analyst = { tier: 'junior', hiredDay: 0, paidThroughDay: 99 };
    const junior = cmd(g, 'u1', { type: 'journal.detail', tripId: trip.id }).data as { flow: unknown; headlines: unknown };
    expect(junior.flow).toBeNull();
    expect(junior.headlines).toBeNull();
  });

  it("refuses another player's trade, and an unknown trade", { timeout: 60_000 }, () => {
    const g = game('journal-owner');
    join(g, 'u1', 'journal_owner_a', 300_000);
    join(g, 'u2', 'journal_owner_b', 300_000);
    trade(g, 'u1', 'HLCN', 'buy', 10);
    stepGame(g);
    trade(g, 'u1', 'HLCN', 'sell', 10);
    stepGame(g);
    const trip = ledgerOf(g, 'u1')!.trips.at(-1)!;
    expect(cmd(g, 'u2', { type: 'journal.detail', tripId: trip.id }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'journal.detail', tripId: 'nope' }).ok).toBe(false);
  });
});
