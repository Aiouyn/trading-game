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

/** Default bound of every state wait in the city e2e (QA: no unbounded waits). */
export const STATE_WAIT_MS = 120_000;

/**
 * Waits for a page state, bounded (default 120 s). A fixed 30 s cap failed 11 T0 tests on a loaded
 * box (the first T0 picture blocked the main thread 11–13 s at load ~20–29); 120 s is the headroom,
 * still under the 180 s test timeout. On timeout it throws an error that names the state it waited
 * for and the page state it saw, e.g. "waitDrawn: T0 picture not drawn after 120s (state={...})".
 */
export async function waitState(
  page: Page,
  what: string,
  predicate: () => unknown,
  opts: { timeoutMs?: number; polling?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? STATE_WAIT_MS;
  try {
    await page.waitForFunction(predicate, null, { timeout: timeoutMs, polling: opts.polling ?? 100 });
  } catch (e) {
    if (!(e instanceof Error) || e.name !== 'TimeoutError') throw e;
    const state = await page
      .evaluate(() => {
        const w = window as unknown as Partial<HarnessWindow>;
        let d: Partial<CityDiagnostics> | null = null;
        try { d = w.__city?.diagnostics() ?? null; } catch { d = null; }
        const img = document.querySelector('.city-stage img') as HTMLImageElement | null;
        return {
          ready: document.body?.dataset.ready ?? null,
          city: !!w.__city,
          tier: d?.tier ?? null,
          buildingParts: d?.buildingParts ?? null,
          renders: d?.renders ?? null,
          fpsFirst2s: d?.fpsFirst2s ?? null,
          stateVersion: d?.stateVersion ?? null,
          t0img: img ? (img.src.startsWith('data:') ? 'data' : 'empty') : 'none',
        };
      })
      .then((x) => JSON.stringify(x), (err: unknown) => `unavailable: ${String(err)}`);
    throw new Error(`${what} after ${timeoutMs / 1000}s (state=${state})`);
  }
}

export async function openCity(page: Page, query = '', timeoutMs?: number): Promise<void> {
  await page.goto(`/city.html?${query}`);
  await waitState(page, 'openCity: harness not ready (body[data-ready=1])', () => document.body.dataset.ready === '1', { timeoutMs });
}

/** Waits until the city has drawn its parts (or its T0 picture). */
export async function waitDrawn(page: Page, timeoutMs?: number): Promise<CityDiagnostics> {
  await waitState(page, 'waitDrawn: city not drawn (T0 picture, or T1/T2 parts + first frame)', () => {
    const w = window as unknown as HarnessWindow;
    const d = w.__city?.diagnostics();
    if (!d) return false;
    if (d.tier === 'T0') return !!document.querySelector('.city-stage img[src^="data:"]');
    return d.buildingParts > 0 && d.renders > 0 && d.loadMs.firstFrame > 0;
  }, { timeoutMs });
  return diag(page);
}

/** Waits until the 2 s first-frames tier measurement has run. */
export function waitFpsFirst2s(page: Page): Promise<void> {
  return waitState(page, 'waitFpsFirst2s: fpsFirst2s still null (2 s tier measurement not done)', () => (window as unknown as HarnessWindow).__city.diagnostics().fpsFirst2s !== null);
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

/** #41's per-frame limits (both projects); card 1 and later cards add their allocation on top. */
export const P41 = { calls: 4, tris: 16_000 } as const;
