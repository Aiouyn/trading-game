import { test, type Browser, type TestInfo } from '@playwright/test';
import { expect, installT0Probe, openCity, saveJson, t0LongTasks, waitDrawn, type HarnessWindow } from './helpers';

// Same-job A/B of the T0 first picture (Producer's ruling on #60): main's city and this branch's
// city, built in the same CI job, sampled interleaved on the same runner. One-off CI numbers swing
// by ±15 ms between runs (main after #54: desktop 62-82 ms), so a fixed baseline can't hold a 10%
// ratio; the same-job median can. CI's t0-ab job serves main's harness at CITY_AB_BASE_URL and this
// branch's at the config's baseURL; without CITY_AB_BASE_URL the test is skipped.
const BASE_URL = process.env.CITY_AB_BASE_URL;
const RUNS = 5;
const RATIO_MAX = 1.1;
const LONG_TASK_MAX_MS = 250;

type Arm = 'main' | 'pr';
interface Sample { arm: Arm; run: number; longest: number; ms: unknown }

async function sample(browser: Browser, info: TestInfo, url: string | undefined, query: string): Promise<{ longest: number; ms: unknown }> {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL: url ?? info.project.use.baseURL });
  try {
    const page = await ctx.newPage();
    await installT0Probe(page);
    await openCity(page, query);
    const d = await waitDrawn(page);
    expect(d.tier).toBe('T0');
    const longest = Math.max(0, ...(await t0LongTasks(page)).map((t) => t.duration));
    // main's hook predates the stage timings: ms is undefined there
    const ms = await page.evaluate(() => ((window as unknown as HarnessWindow).__city.t0Picture() as { ms?: unknown } | null)?.ms);
    return { longest, ms };
  } finally {
    await ctx.close();
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('T0 longest task: median(this branch) <= 1.1 x median(main), same job, 5 interleaved runs each', async ({ browser }, info) => {
  test.skip(!BASE_URL, 'CITY_AB_BASE_URL not set (runs in the city t0-ab CI job)');
  test.setTimeout(10 * 60_000);
  const name = info.project.name;
  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run++) {
    // alternate who goes first, so a warming or cooling runner doesn't favour one arm
    const order: Arm[] = run % 2 ? ['pr', 'main'] : ['main', 'pr'];
    for (const arm of order) {
      const s = await sample(browser, info, arm === 'main' ? BASE_URL : undefined, 'tier=T0');
      samples.push({ arm, run, ...s });
      console.log(`[t0-ab] ${name} run ${run} ${arm}: longest ${s.longest} ms${s.ms ? ` stages ${JSON.stringify(s.ms)}` : ''}`);
    }
  }
  // one profiled pass of this branch (flushes the canvas at each stage, so it is not a sample)
  const prof = await sample(browser, info, undefined, 'tier=T0&t0prof=1');
  console.log(`[t0-ab] ${name} profile (flushed stages, not a sample): longest ${prof.longest} ms ${JSON.stringify(prof.ms)}`);
  const of = (arm: Arm) => samples.filter((s) => s.arm === arm).map((s) => s.longest);
  const mMain = median(of('main'));
  const mPr = median(of('pr'));
  const limit = Math.round(mMain * RATIO_MAX * 10) / 10;
  console.log(`[t0-ab] ${name}: main [${of('main').join(', ')}] median ${mMain} ms; pr [${of('pr').join(', ')}] median ${mPr} ms; limit 1.1 x ${mMain} = ${limit} ms; ratio ${(mPr / mMain).toFixed(3)}`);
  saveJson(`t0-ab-${name}.json`, { base: BASE_URL, samples, medians: { main: mMain, pr: mPr }, limit, ratio: mPr / mMain, profile: prof });
  expect(samples.filter((s) => s.longest > LONG_TASK_MAX_MS), `T0 long tasks > ${LONG_TASK_MAX_MS} ms`).toEqual([]);
  expect(mPr, `median T0 longest task of this branch vs 1.1 x main's (${mMain} ms)`).toBeLessThanOrEqual(limit);
});
