import { expect, type Page } from "@playwright/test";

export async function boot(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("quay-ready")).toBeVisible();
}

export async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).first().boundingBox();
  if (!b) throw new Error(`no box for ${testId}`);
  return b;
}

export const intents = (page: Page) =>
  page.evaluate(() => (window as Window & { __quayIntents?: () => unknown[] }).__quayIntents?.().length ?? -1);

/** Deterministic fake-clock boot: install fake timers (running), boot until quay-ready, THEN pause.
 *  Pausing before boot starves the shell's boot timers so quay-ready can never appear (QA #18 flake). */
export async function bootPaused(page: Page, path = "/", time = new Date("2026-10-21T08:00:00Z"), afterInstall?: () => Promise<unknown>) {
  await page.clock.install({ time });
  if (afterInstall) await afterInstall();
  await boot(page, path);
  // The fake clock keeps running between reading it and pausing, so a target can slip into the past;
  // re-read and retry rather than racing it with a fixed margin.
  for (let attempt = 0; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try { await page.clock.pauseAt(new Date(now + 100)); return; }
    catch (e) { if (attempt >= 5 || !String(e).includes("past")) throw e; }
  }
}
