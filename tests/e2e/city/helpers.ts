import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CityDiagnostics, CityRenderer, PickResult, CityDelta, Visibility } from '../../../src/city';
import type { CityTestApi } from '../../../src/city/renderer/create';

export const EVIDENCE = process.env.CITY_EVIDENCE_DIR ?? join(tmpdir(), 'city-evidence');
mkdirSync(EVIDENCE, { recursive: true });

export interface HarnessWindow {
  __city: CityTestApi;
  harness: {
    renderer: CityRenderer;
    picks: PickResult[];
    fetchLog: string[];
    subscribeCalls: () => number;
    subscribers: () => number;
    setVisibility: (v: Visibility) => void;
    publish: (d: CityDelta) => void;
    setStamp: (v: number) => void;
    setClock: (t: number | null) => void;
    manifestUrl: () => string;
    info: { cityId: string; mine: string[]; versions: number[] };
    perf: { tickRenderMsP50: number; tickRenderMsP95: number; fps: number; heapMb: number; renderTier: string }[];
  };
}

// State waits, not wall-clock budgets: these wait for a page state with no timeout of their own
// (timeout: 0), so only the test timeout (180 s) bounds them. A fixed 30 s cap failed 11 T0 tests
// on a loaded box (load 24–29), where the first T0 picture blocked the main thread for 11–13 s and
// longer under contention. Correctness is asserted by the tests after the wait, not by its speed.
export async function openCity(page: Page, query = ''): Promise<void> {
  await page.goto(`/city.html?${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 0 });
}

/** Waits until the city has drawn its parts (or its T0 picture). */
export async function waitDrawn(page: Page): Promise<CityDiagnostics> {
  await page.waitForFunction(() => {
    const w = window as unknown as HarnessWindow;
    const d = w.__city?.diagnostics();
    if (!d) return false;
    if (d.tier === 'T0') return !!document.querySelector('.city-stage img[src^="data:"]');
    return d.buildingParts > 0 && d.renders > 0 && d.loadMs.firstFrame > 0;
  }, null, { timeout: 0, polling: 100 });
  return diag(page);
}

export function diag(page: Page): Promise<CityDiagnostics> {
  return page.evaluate(() => (window as unknown as HarnessWindow).__city.diagnostics());
}

export function saveJson(name: string, data: unknown): void {
  writeFileSync(join(EVIDENCE, name), JSON.stringify(data, null, 2));
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) <= 640;
}

export { expect };
