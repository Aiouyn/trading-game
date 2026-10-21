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
