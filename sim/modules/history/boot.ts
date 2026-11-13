// Shared year loop. stats() resets yearly counters, so a save/load proof has to call it
// on the same days as an uninterrupted run or the next year diverges.
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';

export function simulate(w: World, years: number, checkEvery: number, log: boolean): void {
  let header = false;
  for (let y = 0; y < years; y++) {
    for (let d = 0; d < DAYS_PER_YEAR; d++) {
      w.step();
      if (checkEvery > 0 && w.day % checkEvery === 0) {
        const bad = w.ledger.check();
        if (bad.length) { console.error(`BOOKS DO NOT BALANCE on day ${w.day}:\n  ${bad.slice(0, 10).join('\n  ')}`); process.exit(1); }
      }
    }
    const row: Record<string, number | string> = { year: w.year };
    for (const m of w.modules) Object.assign(row, m.stats?.(w) ?? {});
    if (log) {
      if (!header) { console.log(Object.keys(row).join('\t')); header = true; }
      console.log(Object.values(row).join('\t'));
    }
  }
}
