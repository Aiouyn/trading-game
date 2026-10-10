/**
 * The ten two-minute lessons (Phase 3, section 4). Each lesson is a short read plus one interactive check that runs in
 * the client sandbox (src/sandbox/lessons.ts decides whether the check passed). Pure data: no React, no engine.
 *
 * The copy lives in en.json and fr.json under learn.lesson.<id>.title, .read, .task and .done. The ids match
 * LESSON_IDS in learning.ts (a test checks it).
 */

/** The check each lesson asks the learner to pass in the sandbox. */
export type LessonCheck =
  | 'market-fill'
  | 'limit-wait'
  | 'stop-below'
  | 'held-day'
  | 'fee-seen'
  | 'over-cash'
  | 'short-refused'
  | 'held-days'
  | 'round-trip'
  | 'day-close';

export type LessonOrderType = 'market' | 'limit' | 'stop';

export interface LessonDef {
  id: string;
  check: LessonCheck;
  /** a stock the learner already holds when the lesson opens (bought and filled before the lesson starts) */
  holding: boolean;
  /** the order types the lesson's trade form offers */
  types: readonly LessonOrderType[];
  /** the quantity the trade form starts with */
  qty: number;
  /** the game days the learner must hold for (held-days only); other checks read one day or none */
  days: number;
}

/** One game day, as a count of game days (the sandbox steps whole days). */
const DAY = 1;

export const LESSONS: readonly LessonDef[] = [
  { id: '1', check: 'market-fill', holding: false, types: ['market'], qty: 1, days: DAY },
  { id: '2', check: 'limit-wait', holding: false, types: ['limit'], qty: 1, days: DAY },
  { id: '3', check: 'stop-below', holding: true, types: ['stop'], qty: 1, days: DAY },
  { id: '4', check: 'held-day', holding: true, types: ['market', 'limit', 'stop'], qty: 1, days: DAY },
  { id: '5', check: 'fee-seen', holding: false, types: ['market'], qty: 1, days: DAY },
  { id: '6', check: 'over-cash', holding: false, types: ['market'], qty: 1_000_000, days: DAY },
  { id: '7', check: 'short-refused', holding: false, types: ['market'], qty: 1, days: DAY },
  { id: '8', check: 'held-days', holding: true, types: ['market'], qty: 1, days: 5 },
  { id: '9', check: 'round-trip', holding: false, types: ['market'], qty: 1, days: DAY },
  { id: '10', check: 'day-close', holding: false, types: ['market'], qty: 1, days: DAY },
];

export function lessonById(id: string): LessonDef | undefined {
  return LESSONS.find((l) => l.id === id);
}
