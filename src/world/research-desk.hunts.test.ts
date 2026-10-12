import { describe, expect, it } from 'vitest';
import { EXPLAIN_ROWS, FLOW_POOLS, TRADE_REALIZED_TOLERANCE, gameDayOfTick, type Side } from '@/engine';
import { NPCS } from '@/content/progression';
import { ADVICE_PATTERNS_EN, ADVICE_PATTERNS_FR, BANNED_WORDS, BANNED_WORDS_FR, adviceIn, bannedIn } from './text/banned';
import { renderMsg } from './text/template';
import { textProvider } from './text';
import { TPD, cashOf, credit, today } from './core';
import { applyCommand, createGame, stepGame } from './game';
import { deskFileOf, deskQuery, deskWindow } from './desk';
import { explainTradeFor, ledgerOf } from './ledger';
import { hireAnalyst, unlockDesk, workDay } from './work';
import { DESK } from '@/content/learning';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import type { DeskDossier } from './ledger-types';
import type { Command, GameState, Player } from './types';

/**
 * Tape's Research Desk hunts at the world layer (docs/team/specs/tape-research-desk.md, sections 1 to 4). Each test carries
 * its hunt id. The world is driven through its own commands, the same path the server takes.
 */

function game(seed: string, npcs = false): GameState {
  return createGame(seed, { warmupDays: 0, npcs });
}

const cmd = (g: GameState, pid: string, c: Command) => applyCommand(g, pid, c);

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
  while (gameDayOfTick(g.market.tick, TPD) <= day) stepGame(g);
}

/** A world with one unlocked desk at R3 and a day closed: the desk's windows are open. */
function deskWorld(seed: string, pid = 'u1'): GameState {
  const g = game(seed);
  join(g, pid, `h_${seed}`.slice(0, 16));
  rank(g, pid, 6_000_000);
  if (!cmd(g, pid, { type: 'desk.unlock' }).ok) throw new Error('desk unlock refused');
  for (let k = 0; k < TPD; k++) stepGame(g);
  trade(g, pid, 'HLCN', 'buy', 30);
  runPastDay(g, 1);
  return g;
}

const SEED_LIST = Array.from({ length: 20 }, (_, i) => `hunt-w-${i + 1}`);

describe('explain_move_clamps_window (world: the desk clamps the picker, D-12)', () => {
  it('a window that ends on the open day or after it is clamped to the last closed day, and one that starts early to the first', { timeout: 120_000 }, () => {
    for (const seed of SEED_LIST.slice(0, 4)) {
      const g = deskWorld(seed);
      const w = deskWindow(g);
      const r = deskQuery(g, g.players.u1!, 'HLCN', -40, w.lastClosed! + 9);
      expect(r.ok, seed).toBe(true);
      const d = r.data as DeskDossier;
      expect(d.to, seed).toBe(w.lastClosed);
      expect(d.from, seed).toBeGreaterThanOrEqual(w.firstDay);
      expect(d.from, seed).toBeLessThanOrEqual(d.to);
      expect(d.bars.every((b) => b.day <= w.lastClosed! + 0 && b.day >= d.from - 1), seed).toBe(true);
    }
  });

  it('a window that starts on the open day is clamped back to the last closed day (from never passes to)', () => {
    const g = deskWorld('hunt-w-clamp-from');
    const w = deskWindow(g);
    const r = deskQuery(g, g.players.u1!, 'HLCN', w.lastClosed! + 2, w.lastClosed! + 5);
    expect(r.ok).toBe(true);
    const d = r.data as DeskDossier;
    expect(d.to).toBe(w.lastClosed);
    expect(d.from).toBe(w.lastClosed);
  });
});

describe('desk_chart_no_future_axis (the dossier chart plots closed days only)', () => {
  it('desk_chart_no_future_axis: no bar sits past the last closed day, the axis ends on it, and a window on the open day plots none of it', { timeout: 120_000 }, () => {
    for (const seed of SEED_LIST.slice(0, 5)) {
      const g = deskWorld(`${seed}-chart`);
      const w = deskWindow(g);
      const openDay = gameDayOfTick(g.market.tick, TPD);
      for (const [from, to] of [[w.firstDay, w.lastClosed! + 9], [openDay, openDay], [openDay - 1, openDay + 3]] as const) {
        const r = deskQuery(g, g.players.u1!, 'HLCN', from, to);
        expect(r.ok, seed).toBe(true);
        const d = r.data as DeskDossier;
        expect(d.bars.length, seed).toBeGreaterThan(0);
        expect(Math.max(...d.bars.map((b) => b.day)), seed).toBeLessThanOrEqual(w.lastClosed!);
        expect(d.bars.some((b) => b.day >= openDay), seed).toBe(false);
        expect(d.to, seed).toBeLessThanOrEqual(w.lastClosed!);
      }
    }
  });
});

describe('explain_move_parts_sum (dossier rows, 20 seeds)', () => {
  it('the dossier rows sum to the move exactly, and the flow shares sum to one in magnitude when there is flow', { timeout: 120_000 }, () => {
    for (const seed of SEED_LIST) {
      const g = deskWorld(seed);
      const w = deskWindow(g);
      const r = deskQuery(g, g.players.u1!, 'HLCN', w.firstDay, w.lastClosed!);
      expect(r.ok, seed).toBe(true);
      const d = r.data as DeskDossier;
      const sum = d.rows.reduce((s, x) => s + x.value, 0);
      expect(Math.abs(sum - d.move), seed).toBeLessThan(1e-9);
      // the pools' shares are signed over the gross flow, so their magnitudes sum to one
      const flowAbs = d.flow.reduce((s, p) => s + Math.abs(p.share), 0);
      expect(flowAbs === 0 || Math.abs(flowAbs - 1) < 1e-9, seed).toBe(true);
      for (const row of d.rows) expect(EXPLAIN_ROWS as readonly string[], seed).toContain(row.row);
    }
  });
});

describe('flow_pool_types_only and dom_no_trader_names at the dossier (20 seeds, 24 personas present)', () => {
  it('the dossier names no player, handle, NPC persona or account id, and its flow keys are pool types', { timeout: 120_000 }, () => {
    for (const seed of SEED_LIST.slice(0, 10)) {
      const g = game(`${seed}-npc`, true);
      join(g, 'u1', `h_${seed}`.slice(0, 16));
      rank(g, 'u1', 6_000_000);
      if (!cmd(g, 'u1', { type: 'desk.unlock' }).ok) throw new Error('desk unlock refused');
      for (let k = 0; k < TPD; k++) stepGame(g);
      trade(g, 'u1', 'HLCN', 'buy', 30);
      runPastDay(g, 1);
      const w = deskWindow(g);
      const d = deskQuery(g, g.players.u1!, 'HLCN', w.firstDay, w.lastClosed!).data as DeskDossier;
      const text = JSON.stringify(d);
      expect(text.includes(`h_${seed}`.slice(0, 16)), seed).toBe(false);
      expect(text.includes('"u1"'), seed).toBe(false);
      for (const p of NPCS) {
        expect(text.includes(p.id), `${seed} ${p.id}`).toBe(false);
        expect(text.includes(p.handle), `${seed} ${p.handle}`).toBe(false);
      }
      for (const f of d.flow) expect(FLOW_POOLS as readonly string[], seed).toContain(f.pool);
      expect(NPCS.length).toBe(24);
    }
  });
});

describe('solo_you_row (the dossier, one human with the 24 personas)', () => {
  it('a solo human sees a You row in the dossier and never a Players row', () => {
    const g = game('solo-row-world', true);
    join(g, 'u1', 'solo_you');
    rank(g, 'u1', 6_000_000);
    if (!cmd(g, 'u1', { type: 'desk.unlock' }).ok) throw new Error('desk unlock refused');
    for (let k = 0; k < TPD; k++) stepGame(g);
    trade(g, 'u1', 'HLCN', 'buy', 30);
    runPastDay(g, 1);
    const w = deskWindow(g);
    const d = deskQuery(g, g.players.u1!, 'HLCN', w.firstDay, w.lastClosed!).data as DeskDossier;
    const rows = d.rows.map((r) => r.row);
    // the solo human traded HLCN on a closed day, so the dossier must carry exactly one You row (not zero, not two)
    expect(rows.filter((r) => r === 'you')).toHaveLength(1);
    expect(rows).not.toContain('players');
  });
});

describe('no_forecast_copy (every template, memo, desk and journal string, en and fr)', () => {
  const PREFIXES = ['desk.', 'journal.', 'research.', 'dayclose.', 'work.', 'learn.lesson'];
  // buy and sell are the order form's own words and lesson instructions ("place a sell order"): the rule bans them as advice only
  const EN_WORDS = BANNED_WORDS.filter((w) => w !== 'buy' && w !== 'sell');
  const keys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => PREFIXES.some((p) => k.startsWith(p)));
  const SAMPLE = {
    asset: 'HLCN', pct: '1.23%', from: 4, to: 9, day: 9, part: 'the market', pool: 'Trend followers', count: 2, rank: 'Operator',
    cost: '$300.00', upkeep: '$5,000.00', total: '$55,000.00', amount: '$1,200.00', reason: 'an order', no: 7, headline: 'Rates move',
    sector: 'Tech', usd: '$12.00', basket: '$1.00', random: '$2.00', momentum: '$3.00', player: '$4.00', beaten: 1, days: 2,
    band: 'mid', tier: 'Junior', name: 'Hale & Ward', curr: 'x', percent: 2, n: 3,
  };

  it('no_forecast_copy: no key with a memo, desk, journal, research, close or work prefix holds a forecast or advice word, in English or French', () => {
    const offending: string[] = [];
    for (const k of keys(en as Record<string, string>)) {
      const text = renderMsg({ key: k, vars: SAMPLE }, 'en');
      if (bannedIn(text, EN_WORDS).length) offending.push(`en ${k}: ${text}`);
      if (adviceIn(text, ADVICE_PATTERNS_EN).length) offending.push(`en advice ${k}: ${text}`);
    }
    for (const k of keys(fr as Record<string, string>)) {
      const text = renderMsg({ key: k, vars: SAMPLE }, 'fr');
      if (bannedIn(text, BANNED_WORDS_FR).length) offending.push(`fr ${k}: ${text}`);
      if (adviceIn(text, ADVICE_PATTERNS_FR).length) offending.push(`fr advice ${k}: ${text}`);
    }
    expect(offending).toEqual([]);
  });

  it('no_forecast_copy: the advice patterns catch buy and sell advice, and pass the order form and lesson labels', () => {
    expect(adviceIn('You should buy HLCN now.', ADVICE_PATTERNS_EN).length).toBeGreaterThan(0);
    expect(adviceIn('A good time to sell.', ADVICE_PATTERNS_EN).length).toBeGreaterThan(0);
    expect(adviceIn('Vous devriez acheter maintenant.', ADVICE_PATTERNS_FR).length).toBeGreaterThan(0);
    expect(adviceIn('Place a sell order for 2 shares.', ADVICE_PATTERNS_EN)).toEqual([]);
    expect(adviceIn('Ordre d’achat : acheter 2 actions.', ADVICE_PATTERNS_FR)).toEqual([]);
  });

  it('every memo the desk writes, for every direction, driver and pool, is clean in both languages', () => {
    const dirs = [0.2, -0.2, 0];
    const parts = ['market', 'sector', 'news', 'event', 'company', 'flow', 'players', 'you'];
    for (const move of dirs) {
      for (const dominant of [null, ...parts]) {
        for (const pool of [null, { id: 'trend', buying: true }, { id: 'retail', buying: false }]) {
          const msg = textProvider.deskMemo({ assetId: 'HLCN', from: 1, to: 3, move, dominant, pool });
          for (const m of msg) {
            expect(bannedIn(textProvider.render(m, 'en'), BANNED_WORDS)).toEqual([]);
            expect(bannedIn(textProvider.render(m, 'fr'), BANNED_WORDS_FR)).toEqual([]);
          }
        }
      }
    }
  });
});

describe('memo_past_tense (every memo sentence, both languages)', () => {
  const PRESENT_EN = /\b(is|are|rises|falls|moves|comes|leads|does|will|may|might|could|expects?)\b/i;
  // French present and future forms a memo or journal sentence must not use. est and sont are left out: they are also the
  // auxiliaries of the passé composé ("est venue"), so the verbs below carry the rule.
  const PRESENT_FR = /\b(vient|viennent|mène|mènent|monte|baisse|bouge|sera|seront|peut|pourra|attend|attendent|devancez|devancent|devance|vont|restent|reste|semble|coûte|termine|intègre|touche)\b/i;

  it('the memo sentences are past tense in English', () => {
    for (const move of [0.2, -0.2, 0]) {
      for (const m of textProvider.deskMemo({ assetId: 'HLCN', from: 1, to: 3, move, dominant: 'market', pool: { id: 'trend', buying: true } })) {
        expect(textProvider.render(m, 'en'), m.key).not.toMatch(PRESENT_EN);
      }
    }
  });

  it('the memo sentences are past tense in French (passé composé or imparfait), not the present', () => {
    for (const move of [0.2, -0.2, 0]) {
      for (const dominant of ['market', 'players', 'flow']) {
        for (const m of textProvider.deskMemo({ assetId: 'HLCN', from: 1, to: 3, move, dominant, pool: { id: 'pension', buying: false } })) {
          expect(textProvider.render(m, 'fr'), m.key).not.toMatch(PRESENT_FR);
        }
      }
    }
  });

  it('memo_past_tense: every French desk memo, journal line and daily close line is past tense, never a present forecast', () => {
    const frKeys = Object.keys(fr as Record<string, string>).filter((k) => k.startsWith('desk.memo') || k.startsWith('journal.line') || k.startsWith('dayclose.') || /^txt\.narr\.(head|best|worst|noPositions|gx|sector|ghosts|noTrades|rank)\./.test(k));
    expect(frKeys.length).toBeGreaterThan(10);
    const vars = { asset: 'HLCN', pct: '1.2%', from: 4, to: 9, day: 9, part: 'du marché', pool: 'Les particuliers', change: '$1.00', now: '$2.00', usd: '$3.00', sector: 'Tech', headline: 'Taux', days: 2, player: '$4.00', basket: '$1.00', random: '$2.00', momentum: '$3.00', beaten: 1 };
    const offending = frKeys.map((k) => ({ k, text: renderMsg({ key: k, vars }, 'fr') })).filter((x) => PRESENT_FR.test(x.text));
    expect(offending).toEqual([]);
  });

  it('the journal line for a gain, a loss and a move against the trade is past tense in both languages', () => {
    const lines = [
      textProvider.tripLine({ realized: 50, rows: { market: 60 } }),
      textProvider.tripLine({ realized: -50, rows: { market: -60 } }),
      textProvider.tripLine({ realized: 50, rows: { market: -60, company: 200 } }),
    ];
    for (const m of lines) {
      expect(textProvider.render(m, 'en'), m.key).not.toMatch(PRESENT_EN);
      expect(textProvider.render(m, 'fr'), m.key).not.toMatch(PRESENT_FR);
    }
  });
});

describe('explain_trade_parts_sum (500 round trips over 20 seeds, within a cent)', () => {
  it('the rows of every closed round trip sum to its realized P&L within a cent, across at least 500 trips', { timeout: 600_000 }, () => {
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = game(`trips-hunt-${seed}`);
      const pid = 'u1';
      join(g, pid, `trip_${seed}`, 9_000_000);
      const assets = ['HLCN', 'OSTV', 'VLT'];
      for (let k = 0; k < 26; k++) {
        const a = assets[(seed + k) % assets.length]!;
        const qty = 2 + ((seed * 7 + k * 3) % 9);
        trade(g, pid, a, 'buy', qty);
        for (let t = 0; t < 2 + ((seed + k) % 6); t++) stepGame(g);
        trade(g, pid, a, 'sell', qty);
        stepGame(g);
      }
      runPastDay(g, 0);
      // the day 0 trips are closed on day 0, which has closed now
      const trips = ledgerOf(g, pid)!.trips;
      for (const t of trips) {
        if (gameDayOfTick(t.closeTick, TPD) > 0) continue;
        const r = explainTradeFor(g, pid, t.id);
        expect(Math.abs(r.total - t.realizedPnl), `seed ${seed} ${t.id}`).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(500);
  });
});

describe('explain_trade_closed_only (an open position is not explained)', () => {
  it('a position that is still open has no round trip to explain, and an unknown trip is refused', () => {
    const g = deskWorld('open-trip');
    trade(g, 'u1', 'OSTV', 'buy', 5);
    stepGame(g);
    expect(ledgerOf(g, 'u1')!.trips.every((t) => t.assetId !== 'OSTV' || t.closeTick !== undefined)).toBe(true);
    expect(() => explainTradeFor(g, 'u1', 'no-such-trip')).toThrow();
  });
});

describe('analyst and desk money (restricted cash, no refund, unpaid leaves, upkeep miss)', () => {
  function atOperator(seed: string): GameState {
    const g = game(seed);
    join(g, 'u1', `an_${seed}`.slice(0, 16));
    rank(g, 'u1', 6_000_000);
    return g;
  }

  it('analyst_week_ahead_no_refund: a hire, then a fire inside the paid week returns nothing, and the copy says so', () => {
    const g = atOperator('an-refund');
    const before = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'analyst.hire', tier: 'junior' }).ok).toBe(true);
    const paid = before - cashOf(g, 'u1');
    expect(paid).toBeGreaterThan(0);
    expect(cmd(g, 'u1', { type: 'analyst.fire' }).ok).toBe(true);
    expect(cashOf(g, 'u1')).toBe(before - paid);
    expect(g.players.u1!.analyst).toBeNull();
    expect((en as Record<string, string>)['analyst.hire.note']).toContain('not refunded');
    expect((en as Record<string, string>)['analyst.let.note']).toContain('No refund');
  });

  it('analyst_unpaid_leaves: a week due with cash short removes the analyst, writes one inbox line, and keeps no debt', () => {
    const g = atOperator('an-unpaid');
    const p: Player = g.players.u1!;
    expect(hireAnalyst(g, p, 'junior', null).ok).toBe(true);
    // the week is due today, and every dollar is restricted: spendable cash is zero
    p.analyst = { ...p.analyst!, paidThroughDay: today(g) };
    p.restrictedCash = cashOf(g, 'u1');
    const inboxBefore = p.inbox.filter((i) => i.kind === 'work').length;
    workDay(g, null);
    expect(p.analyst).toBeNull();
    expect(p.inbox.filter((i) => i.kind === 'work').length - inboxBefore).toBe(1);
    expect(cashOf(g, 'u1')).toBeGreaterThanOrEqual(0);
  });

  it('restricted_cash_blocks_hire: held ad or fresh-start cash cannot pay for an analyst or for the desk', () => {
    const g = atOperator('an-restricted');
    const p = g.players.u1!;
    p.restrictedCash = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'analyst.hire', tier: 'junior' }).ok).toBe(false);
    expect(unlockDesk(g, p, null).ok).toBe(false);
    expect(p.analyst).toBeFalsy();
    expect(p.desk).toBeFalsy();
  });

  it('desk_upkeep_miss: a desk that cannot cover its week locks, keeps its files readable, and writes one note', () => {
    const g = deskWorld('desk-upkeep');
    const p = g.players.u1!;
    const w = deskWindow(g);
    expect(deskQuery(g, p, 'HLCN', w.firstDay, w.lastClosed!).ok).toBe(true);
    const file = ledgerOf(g, 'u1')!.deskFiles?.[0];
    expect(file).toBeDefined();
    p.restrictedCash = cashOf(g, 'u1');
    p.desk = { ...p.desk!, paidThroughDay: today(g) };
    const inboxBefore = p.inbox.filter((i) => i.kind === 'work').length;
    workDay(g, null);
    expect(p.desk!.lapsed).toBe(true);
    expect(p.inbox.filter((i) => i.kind === 'work').length - inboxBefore).toBe(1);
    expect(deskFileOf(g, p, file!.no).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'desk.query', assetId: 'HLCN', from: 0, to: 0 }).ok).toBe(false);
    expect(DESK.weeklyUpkeep).toBeGreaterThan(0);
  });
});

describe('desk_rank_loss_keeps_files (D-13: N/A)', () => {
  // N/A by the lead's ruling D-13: rank never drops, so there is no rank-loss lock to test. The desk locks only on a lapsed
  // upkeep (desk_upkeep_miss above). Skipped, not passed: a skip is the record that the hunt does not apply.
  it.skip('desk_rank_loss_keeps_files: N/A (D-13). Rank never drops, so the rank-loss lock does not exist (docs/V1-PRIVACY.md section 7)', () => {});
});

describe('the desk memo renders with no leftover template slot', () => {
  it('every rendered desk memo line is free of unfilled {slots}, in English and French', () => {
    const vars = { asset: 'A', pct: '1%', from: 1, to: 2, part: 'x', pool: 'y', day: 3, no: 4, count: 5, band: 'b' };
    const dicts: [Record<string, string>, 'en' | 'fr'][] = [[en, 'en'], [fr, 'fr']];
    for (const [dict, lang] of dicts) {
      for (const k of Object.keys(dict).filter((x) => x.startsWith('desk.memo'))) {
        expect(renderMsg({ key: k, vars }, lang), `${lang} ${k}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
