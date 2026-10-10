import { GOLD_ASSET, type ScenarioRecord } from './scenarios';
import { SCENARIO_RULES } from './config';
import { Sandbox } from './sandbox';

/**
 * Run a scenario sandbox to its last tick and sample it at each game-day close. Used by the scenario tests and the
 * seed search; it reads only public market data and the public announcements, the same as the UI.
 */
export function recordScenario(sb: Sandbox): ScenarioRecord {
  const days = sb.plan.days;
  if (days === null) throw new Error('recordScenario needs a scenario or challenge sandbox');
  const tpd = sb.ticksPerDay;
  const stockIds = new Set(sb.listAssets().filter((a) => a.assetClass === 'stock').map((a) => a.id));
  const earningsLo = SCENARIO_RULES.earningsWindowDays * tpd;
  const reporting = new Set<string>();
  const start = sb.market();
  const startStock = new Map<string, number>();
  for (const id of stockIds) {
    const p = start.prices[id];
    if (p !== undefined) startStock.set(id, p);
  }
  const gx = [start.gx];
  const crx = [start.crypto];
  const gold = [start.prices[GOLD_ASSET] ?? NaN];
  const flashStarts: number[] = [];
  for (let d = 0; d < days; d++) {
    const r = sb.step(tpd);
    for (const e of r.announcements) {
      if (e.type === 'world' && e.phase === 'start' && e.kind === 'flash') flashStarts.push(e.tick);
      if (e.type === 'earnings' && e.tick <= earningsLo) reporting.add(e.assetId);
    }
    const m = sb.market();
    gx.push(m.gx);
    crx.push(m.crypto);
    gold.push(m.prices[GOLD_ASSET] ?? NaN);
  }
  const end = sb.market();
  let counted = 0;
  let up = 0;
  for (const [id, p0] of startStock) {
    const p1 = end.prices[id];
    if (p1 === undefined) continue;
    counted++;
    if (p1 > p0) up++;
  }
  return {
    days,
    ticksPerDay: tpd,
    gx,
    crx,
    gold,
    stockUpShare: counted > 0 ? up / counted : 0,
    earningsStocks: reporting.size,
    flashStarts,
  };
}
