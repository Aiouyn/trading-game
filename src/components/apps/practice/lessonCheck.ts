import type { LessonDef } from '@/content/lessons';
import type { ActResult, SandboxCommand, SandboxView } from '@/sandbox/sandbox';

/**
 * The pure part of a lesson: whether the learner's sandbox state passes the lesson's check. No React and no
 * network. The lesson view feeds it what the sandbox reports, so the same rules run in the tests.
 */

/** One order the learner placed inside the lesson, and what the sandbox said about it. */
export interface LessonAct {
  command: SandboxCommand;
  result: ActResult;
}

export interface LessonProbe {
  /** the sandbox as it is now */
  view: SandboxView;
  /** the lesson's stock, and its price now (null before the first price) */
  price: number | null;
  /** game ticks since the lesson's starting holding was set up (or since the lesson opened) */
  elapsedTicks: number;
  /** the orders placed in this lesson, in order, with their results */
  acts: readonly LessonAct[];
}

const EPS = 1e-9;

/** The lesson's stock: the first listed stock in the sandbox's universe (the same stock on every run of a lesson). */
export function lessonAsset(assets: readonly { id: string; assetClass: string }[]): string | null {
  return assets.find((a) => a.assetClass === 'stock')?.id ?? null;
}

function holds(view: SandboxView): boolean {
  return view.portfolio.positions.some((p) => p.qty > EPS);
}

function placed(acts: readonly LessonAct[], pick: (c: Extract<SandboxCommand, { type: 'place' }>['order'], r: ActResult) => boolean): number {
  let n = 0;
  for (const a of acts) {
    if (a.command.type === 'place' && pick(a.command.order, a.result)) n++;
  }
  return n;
}

/** Did the learner pass this lesson's check? */
export function lessonPassed(def: LessonDef, p: LessonProbe): boolean {
  const day = p.view.ticksPerDay;
  switch (def.check) {
    case 'market-fill':
      // a market order fills at the next tick, so the position must exist after the learner advanced the market
      return holds(p.view);
    case 'limit-wait':
      // a buy limit below the price waits in the book
      return p.view.openOrders.some((o) => o.type === 'limit' && o.side === 'buy' && o.limitPrice !== undefined && p.price !== null && o.limitPrice < p.price);
    case 'stop-below':
      // a sell stop below the price on a held position
      return holds(p.view) && p.view.openOrders.some((o) => o.type === 'stop' && o.side === 'sell' && o.stopPrice !== undefined && p.price !== null && o.stopPrice < p.price);
    case 'held-day':
      return holds(p.view) && p.elapsedTicks >= day * def.days;
    case 'fee-seen':
      return p.view.portfolio.feesPaid > EPS;
    case 'over-cash':
      // the sandbox refuses a buy that the cash cannot cover (no margin in a plain account)
      return placed(p.acts, (o, r) => o.side === 'buy' && !r.ok && (r.reason === 'insufficient cash' || r.reason === 'insufficient buying power')) > 0;
    case 'short-refused':
      // a sell with nothing held is refused: shorting needs a margin account
      return placed(p.acts, (o, r) => o.side === 'sell' && !r.ok && r.reason === 'insufficient position') > 0;
    case 'held-days':
      return holds(p.view) && p.elapsedTicks >= day * def.days;
    case 'round-trip': {
      // two buys filled, a sell filled, and nothing left open: the round trip closed
      const buys = placed(p.acts, (o, r) => o.side === 'buy' && r.ok);
      const sells = placed(p.acts, (o, r) => o.side === 'sell' && r.ok);
      return buys >= 2 && sells >= 1 && !holds(p.view);
    }
    case 'day-close':
      return p.elapsedTicks >= day * def.days;
  }
}

/** The line a learner sees when the check does not pass yet (a key; the view translates it). */
export function lessonHintKey(def: LessonDef): string {
  return `learn.lesson.hint.${def.check}`;
}
