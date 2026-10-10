import { describe, expect, it } from 'vitest';
import { LESSONS, lessonById, type LessonDef } from '@/content/lessons';
import { LESSON_IDS } from '@/content/learning';
import { Sandbox, type SandboxCommand } from '@/sandbox/sandbox';
import { lessonAsset, lessonPassed, type LessonAct, type LessonProbe } from './lessonCheck';

/**
 * Each lesson's check is passable in the real sandbox (a scripted solution passes), and fails without the action.
 * The scripts are what the learner does in the lesson view: place an order, advance one game day, and check.
 */

/** A lesson's sandbox, opened the way the lesson view opens it (fixed seed per lesson). */
function open(def: LessonDef): { sb: Sandbox; asset: string; acts: LessonAct[] } {
  const sb = Sandbox.create({ kind: 'practice', id: `lesson-${def.id}` });
  const asset = lessonAsset(sb.listAssets())!;
  return { sb, asset, acts: [] };
}

/** The lesson's holding, as the lesson view sets it up: one unit bought at market, then one game day. */
function holdingSetup(sb: Sandbox, asset: string, acts: LessonAct[]): number {
  const command: SandboxCommand = { type: 'place', order: { assetId: asset, side: 'buy', type: 'market', qty: 1 } };
  acts.push({ command, result: sb.act(command) });
  sb.step(sb.view().ticksPerDay);
  return sb.tick;
}

function probe(sb: Sandbox, asset: string, acts: LessonAct[], startTick: number): LessonProbe {
  return { view: sb.view(), price: sb.market().prices[asset] ?? null, elapsedTicks: sb.tick - startTick, acts };
}

function place(sb: Sandbox, acts: LessonAct[], order: Extract<SandboxCommand, { type: 'place' }>['order']) {
  const command: SandboxCommand = { type: 'place', order };
  const result = sb.act(command);
  acts.push({ command, result });
  return result;
}

describe('lesson catalogue', () => {
  it('has the ten lessons, in the ids the learn record uses', () => {
    expect(LESSONS.map((l) => l.id)).toEqual([...LESSON_IDS]);
    expect(lessonById('7')?.check).toBe('short-refused');
    expect(lessonById('99')).toBeUndefined();
  });
});

describe('lesson checks in the client sandbox', () => {
  it('1 market fill: a market buy is held only after the market advances', () => {
    const def = lessonById('1')!;
    const { sb, asset, acts } = open(def);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1 });
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });

  it('2 limit wait: a buy limit below the price waits; one above the price does not count', () => {
    const def = lessonById('2')!;
    const { sb, asset, acts } = open(def);
    const price = sb.market().prices[asset]!;
    place(sb, acts, { assetId: asset, side: 'buy', type: 'limit', qty: 1, limitPrice: price * 1.05 });
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    const { sb: sb2, asset: a2, acts: acts2 } = open(def);
    const p2 = sb2.market().prices[a2]!;
    place(sb2, acts2, { assetId: a2, side: 'buy', type: 'limit', qty: 1, limitPrice: p2 * 0.97 });
    expect(lessonPassed(def, probe(sb2, a2, acts2, 0))).toBe(true);
  });

  it('3 reading a stop: a sell stop below the price on a held position', () => {
    const def = lessonById('3')!;
    const { sb, asset, acts } = open(def);
    const start = holdingSetup(sb, asset, acts);
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(false);
    const price = sb.market().prices[asset]!;
    place(sb, acts, { assetId: asset, side: 'sell', type: 'stop', qty: 1, stopPrice: price * 0.95 });
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(true);
  });

  it('4 why a position moved: a holding that has been through one more game day', () => {
    const def = lessonById('4')!;
    const { sb, asset, acts } = open(def);
    const start = holdingSetup(sb, asset, acts);
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(false);
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(true);
  });

  it('5 spreads and fees: a fill shows fees paid', () => {
    const def = lessonById('5')!;
    const { sb, asset, acts } = open(def);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1 });
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });

  it('6 margin: a buy the cash cannot cover is refused', () => {
    const def = lessonById('6')!;
    const { sb, asset, acts } = open(def);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1 });
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1_000_000 });
    expect(acts.at(-1)!.result.reason).toBe('insufficient cash');
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });

  it('7 shorting: a sell with nothing held is refused', () => {
    const def = lessonById('7')!;
    const { sb, asset, acts } = open(def);
    place(sb, acts, { assetId: asset, side: 'sell', type: 'market', qty: 1 });
    expect(acts.at(-1)!.result).toMatchObject({ ok: false, reason: 'insufficient position' });
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });

  // explicit timeout: five game days of steps in a fresh sandbox took about 5.6 s in the full run (the default is 5 s)
  it('8 dividends and DRIP: a holding kept for five game days', { timeout: 30_000 }, () => {
    const def = lessonById('8')!;
    const { sb, asset, acts } = open(def);
    const start = holdingSetup(sb, asset, acts);
    for (let k = 0; k < 4; k++) sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(false);
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, start))).toBe(true);
  });

  it('9 round trip: two buys, a sell, and nothing held at the end', () => {
    const def = lessonById('9')!;
    const { sb, asset, acts } = open(def);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1 });
    sb.step(sb.view().ticksPerDay);
    place(sb, acts, { assetId: asset, side: 'buy', type: 'market', qty: 1 });
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    place(sb, acts, { assetId: asset, side: 'sell', type: 'market', qty: 2 });
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });

  it('10 daily close: one game day has passed', () => {
    const def = lessonById('10')!;
    const { sb, asset, acts } = open(def);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(false);
    sb.step(sb.view().ticksPerDay);
    expect(lessonPassed(def, probe(sb, asset, acts, 0))).toBe(true);
  });
});
