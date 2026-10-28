// UI card 7 G4: the price-chart plot (lightweight-charts) is its own chunk, requested after the Broker mounts.
// Every script request records, at the moment it leaves, whether the Broker's chart section is already in the page.
// The page can't mount the Broker while one of the Broker's own chunks is still in flight, so a statically bundled
// plot is always recorded as "before". The check is exact, with no timing window.
import type { Page } from "@playwright/test";

/** A string that only lightweight-charts ships (its colour parser's error). */
export const PLOT_MARK = "Failed to parse color";
/** A Broker test id (PriceChart's range tabs). A chunk that carries it carries Broker code. */
export const BROKER_MARK = "br-chart-ranges";

export interface ScriptSeen { readonly afterMount: boolean; readonly plot: boolean; readonly broker: boolean }

/** Call before the navigation. Returns script URL -> what was seen. Stop with page.unrouteAll() once measured. */
export async function watchScripts(page: Page): Promise<Map<string, ScriptSeen>> {
  const seen = new Map<string, ScriptSeen>();
  await page.route(/\/_next\/static\/.+\.js(\?.*)?$/, async (route) => {
    const afterMount = await page.evaluate(() => document.querySelector('[data-testid="br-chart"]') !== null).catch(() => false);
    try {
      const res = await route.fetch();
      const body = await res.body();
      seen.set(route.request().url(), { afterMount, plot: body.includes(PLOT_MARK), broker: body.includes(BROKER_MARK) });
      await route.fulfill({ response: res, body });
    } catch {
      // The page or test closed while the chunk was in flight. A script that is never recorded is never left out.
      await route.continue().catch(() => {});
    }
  });
  return seen;
}

/** First-load JS budget (gzipped) of the Broker route /broker (served by the catch-all src/app/[[...route]]); card 9 raised it from 200 KB.
 *  S1-20, BR-7-01 and tools/ci/route-budget.mjs read it. It is measured on /broker only; `/` (212.9 KB at #93) is not budgeted. */
export const FIRST_LOAD_BUDGET_KB = 215;
/** At most this much (gzipped) of the lazy plot chunk is left out of the first load; any excess counts. One rule for S1-20, BR-7-01 and the CI step. */
export const PLOT_EXCLUDE_CAP_KB = 60;
/** Counted first-load bytes: the other scripts plus the part of the lazy plot chunk above PLOT_EXCLUDE_CAP_KB. */
export const firstLoadBytes = (otherBytes: number, lazyPlotBytes: number): number => otherBytes + Math.max(0, lazyPlotBytes - PLOT_EXCLUDE_CAP_KB * 1024);
