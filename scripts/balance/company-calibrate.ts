/**
 * Calibration of the company world (stage A3): the demand scale d0 that makes the reference Seed company earn about its
 * tier yield (spec v1.7 §7: y_seed = 1.90%/gd of capital, the reference company of §1: $150k, 10 heads, $50, one product).
 *
 * Run: npx tsx scripts/balance/company-calibrate.ts [--seeds 20] [--days 252] [--sector=tech] [--d0s=800,900]
 * It prints, per d0, the units/gd, revenue/gd, EBITDA/gd and FCF yield per gd over the 2nd to 4th quarters, averaged over
 * seeds. The chosen d0 goes into src/content/company.ts (COMPANY.demand.d0).
 */

import { COMPANY, type CompanySector } from '../../src/content/company';
import { companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv } from '../../src/world/company';

function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const seeds = arg('seeds', 20);
const days = arg('days', 252);
const d0s = (process.argv.find((a) => a.startsWith('--d0s='))?.slice(6) ?? '400,800').split(',').map(Number);
const sector = (process.argv.find((a) => a.startsWith('--sector='))?.slice(9) ?? 'tech') as CompanySector;

function runOne(seed: string, d0: number, sector: CompanySector) {
  const money: Record<string, number> = { founder: 1_000_000 };
  const env: CompanyEnv = {
    seed,
    day: 0,
    regime: 'expansion',
    oilLog: 0,
    rankOf: () => 'R2',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  const w = emptyCompanyWorld(seed);
  const r = foundCompany(w, env, 'founder', { name: 'Reference', sector, cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  const c = w.companies[r.value.id]!;
  c.d0 = d0;
  const sample: { units: number; revenue: number; ebitda: number; fcf: number }[] = [];
  for (let d = 1; d <= days; d++) {
    env.day = d;
    companyTick(w, env, d);
    if (d % COMPANY.quarterDays === 0 && d >= 2 * COMPANY.quarterDays) {
      const q = c.closed[c.closed.length - 1]!;
      sample.push({ units: q.unitsShipped / COMPANY.quarterDays, revenue: q.revenue / COMPANY.quarterDays, ebitda: q.ebitda / COMPANY.quarterDays, fcf: q.fcf / COMPANY.quarterDays });
    }
  }
  return sample;
}

for (const d0 of d0s) {
  const acc = { units: 0, revenue: 0, ebitda: 0, fcf: 0, n: 0 };
  for (let s = 0; s < seeds; s++) {
    for (const q of runOne(`cal-${s}`, d0, sector)) {
      acc.units += q.units; acc.revenue += q.revenue; acc.ebitda += q.ebitda; acc.fcf += q.fcf; acc.n++;
    }
  }
  const n = acc.n || 1;
  const cap = COMPANY.founding.capital;
  console.log(
    `${sector} d0=${d0}`,
    `units/gd=${(acc.units / n).toFixed(1)}`,
    `rev/gd=${(acc.revenue / n).toFixed(0)}`,
    `ebitda/gd=${(acc.ebitda / n).toFixed(0)}`,
    `fcf/gd=${(acc.fcf / n).toFixed(0)}`,
    `y=${((acc.fcf / n / cap) * 100).toFixed(3)}%/gd`,
  );
}
