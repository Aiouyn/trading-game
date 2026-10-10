import { describe, expect, it } from 'vitest';
import { SANDBOX } from './config';
import { challengeSeed } from './calendar';
import { PRACTICE_ID, Sandbox, SandboxError, parseCommand, planFor } from './sandbox';
import { SCENARIOS } from './scenarios';

const TICKS_PER_DAY = 720;

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof SandboxError) return e.code;
    throw e;
  }
  return 'no-error';
}

describe('sandbox: plans', () => {
  it('a practice plan is a sandbox seed with paper cash and no target', () => {
    const p = planFor({ kind: 'practice', id: 'alpha-1' });
    expect(p.seed).toBe(`${SANDBOX.seedPrefix}practice:alpha-1`);
    expect(p.cash).toBe(SANDBOX.practiceCash);
    expect(p.days).toBeNull();
    expect(p.initialRegime).toBe('expansion');
  });

  it('practice names are simple and never carry the live seed', () => {
    expect(errorOf(() => planFor({ kind: 'practice', id: 'Bad Name!' }))).toBe('bad-id');
    expect(errorOf(() => planFor({ kind: 'practice', id: '' }))).toBe('bad-id');
    expect(planFor({ kind: 'practice', id: 'avalon' }).seed).not.toBe('avalon');
  });

  it('a scenario plan is the scenario seed, regime and length from the table', () => {
    const flash = SCENARIOS.find((s) => s.id === 'flash')!;
    const p = planFor({ kind: 'scenario', scenarioId: 'flash' });
    expect(p.seed).toBe(flash.seed);
    expect(p.initialRegime).toBe('expansion');
    expect(p.days).toBe(5);
    expect(errorOf(() => planFor({ kind: 'scenario', scenarioId: 'nope' }))).toBe('unknown-scenario');
  });

  it('a challenge plan uses the week seed and the week scenario, never a live seed', () => {
    // 2026-W41 is week 41; 41 % 6 = 5, the sixth scenario (crypto-winter)
    const p = planFor({ kind: 'challenge', weekKey: '2026-W41' });
    expect(p.seed).toBe(challengeSeed('2026-W41'));
    expect(p.seed).toContain(SANDBOX.challengeSalt);
    expect(p.scenarioId).toBe('crypto-winter');
    expect(p.initialRegime).toBe('contraction');
    expect(p.days).toBe(21);
    expect(SCENARIOS.some((s) => s.seed === p.seed)).toBe(false);
    expect(errorOf(() => planFor({ kind: 'challenge', weekKey: '2026-41' }))).toBe('bad-spec');
  });
});

describe('sandbox: determinism and the practice account', () => {
  it('the same plan and the same commands end in the same digest', () => {
    const run = () => {
      const sb = Sandbox.create({ kind: 'practice', id: 'det' });
      sb.step(TICKS_PER_DAY);
      sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
      sb.advance(2 * TICKS_PER_DAY);
      return sb;
    };
    const a = run();
    const b = run();
    expect(a.tick).toBe(3 * TICKS_PER_DAY);
    expect(a.digest()).toBe(b.digest());
    expect(a.market().prices).toEqual(b.market().prices);
  }, 60_000);

  it('a different practice name gives a different market', () => {
    const a = Sandbox.create({ kind: 'practice', id: 'one' });
    const b = Sandbox.create({ kind: 'practice', id: 'two' });
    a.step(TICKS_PER_DAY);
    b.step(TICKS_PER_DAY);
    expect(a.digest()).not.toBe(b.digest());
  }, 60_000);

  it('a market buy fills against the sandbox book and moves paper cash only', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'fill' });
    const r = sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
    expect(r.ok).toBe(true);
    const step = sb.step(2);
    expect(step.fills.length).toBeGreaterThan(0);
    expect(step.fills.every((f) => f.playerId === PRACTICE_ID)).toBe(true);
    const v = sb.view();
    expect(v.portfolio.positions.find((p) => p.assetId === 'GOLD')?.qty).toBe(1);
    expect(v.portfolio.cash).toBeLessThan(SANDBOX.practiceCash);
    expect(v.startingCash).toBe(SANDBOX.practiceCash);
  });

  it('an order the engine rejects is logged and reported, not filled', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'reject' });
    const r = sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1e9 } });
    expect(r.ok).toBe(false);
    expect(r.reason).not.toBeNull();
    expect(sb.commands.length).toBe(1);
  });

  it('cancelling an unknown order is refused and not logged', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'cancel' });
    const r = sb.act({ type: 'cancel', orderId: `${PRACTICE_ID}-999` });
    expect(r).toEqual({ ok: false, reason: 'unknown-order', orderId: `${PRACTICE_ID}-999` });
    expect(sb.commands.length).toBe(0);
  });

  it('orders are refused once a scenario has finished', () => {
    const sb = Sandbox.create({ kind: 'scenario', scenarioId: 'flash' });
    sb.advance(100 * TICKS_PER_DAY);
    const r = sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
    expect(r).toEqual({ ok: false, reason: 'run-complete', orderId: null });
    expect(sb.commands.length).toBe(0);
  }, 60_000);

  it('a scenario stops at its last tick', () => {
    const sb = Sandbox.create({ kind: 'scenario', scenarioId: 'flash' });
    expect(sb.targetTicks).toBe(5 * TICKS_PER_DAY);
    expect(sb.limitTicks).toBe(5 * TICKS_PER_DAY);
    sb.advance(100 * TICKS_PER_DAY);
    expect(sb.tick).toBe(5 * TICKS_PER_DAY);
    expect(sb.complete).toBe(true);
    expect(sb.view().complete).toBe(true);
    expect(sb.view().limitTicks).toBe(5 * TICKS_PER_DAY);
  }, 60_000);

  it('one call steps at most one game day; a longer step is refused before the engine runs', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'capped' });
    expect(errorOf(() => sb.step(TICKS_PER_DAY + 1))).toBe('bad-ticks');
    expect(errorOf(() => sb.step(1e9))).toBe('bad-ticks');
    expect(errorOf(() => sb.step(0))).toBe('bad-ticks');
    expect(sb.tick).toBe(0);
    expect(sb.step(TICKS_PER_DAY).tick).toBe(TICKS_PER_DAY);
  }, 60_000);

  it('open practice stops at the run cap, so every practice run can be exported', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'cap' });
    expect(sb.targetTicks).toBeNull();
    expect(sb.limitTicks).toBe(SANDBOX.maxRunDays * TICKS_PER_DAY);
    expect(sb.advance((SANDBOX.maxRunDays + 5) * TICKS_PER_DAY)).toBe(SANDBOX.maxRunDays * TICKS_PER_DAY);
    expect(sb.complete).toBe(true);
    expect(sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } }).reason).toBe('run-complete');
    expect(sb.step(TICKS_PER_DAY).tick).toBe(SANDBOX.maxRunDays * TICKS_PER_DAY);
  }, 120_000);

  it('advance refuses a negative or fractional count', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'adv' });
    expect(errorOf(() => sb.advance(-1))).toBe('bad-ticks');
    expect(errorOf(() => sb.advance(1.5))).toBe('bad-ticks');
  });
});

describe('sandbox: command validation', () => {
  it('accepts a plain order and returns a fresh object', () => {
    const raw = { type: 'place', order: { assetId: 'GOLD', side: 'sell', type: 'limit', qty: 2, limitPrice: 2000 } };
    const cmd = parseCommand(raw);
    expect(cmd).toEqual(raw);
    expect(cmd).not.toBe(raw);
  });

  it('refuses a player id inside an order (no live identity can enter the sandbox)', () => {
    expect(errorOf(() => parseCommand({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1, playerId: 'p1' } })))
      .toBe('bad-command');
  });

  it('refuses unknown keys, bad enums, bad numbers and unknown command types', () => {
    const base = { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 };
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, extra: 1 } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, side: 'hold' } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, type: 'iceberg' } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, qty: Number.NaN } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, qty: SANDBOX.maxOrderQty * 2 } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'place', order: { ...base, assetId: '../etc' } }))).toBe('bad-command');
    expect(errorOf(() => parseCommand({ type: 'withdraw' }))).toBe('bad-command');
    expect(errorOf(() => parseCommand(['place']))).toBe('bad-command');
  });

  it('refuses a prototype-carrying object', () => {
    const raw = JSON.parse('{"type":"cancel","orderId":"practice-1","__proto__":{"x":1}}') as unknown;
    expect(errorOf(() => parseCommand(raw))).toBe('bad-command');
  });
});
