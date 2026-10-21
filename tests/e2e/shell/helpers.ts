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

/** Settings › Appearance (17B SET-02): on phone, push Appearance first; returns to the Settings list afterwards. */
async function withAppearance(page: Page, fn: () => Promise<void>) {
  const push = page.getByTestId("set-nav-SET-02");
  const phone = (await page.getByTestId("settings").getAttribute("class"))?.includes("settings-phone");
  if (phone) await push.click();
  await fn();
  if (phone) await page.getByRole("button", { name: "Back to Settings" }).click();
}

/** Sets the real textScale pref through the Settings slider (applies on release). */
export async function setTextScale(page: Page, scale: string) {
  await withAppearance(page, async () => {
    const s = page.getByTestId("text-scale");
    await s.fill(scale);
    await s.blur();
  });
}

/** Sets Reduce transparency through the Settings segment. */
export async function setReducedTransparency(page: Page, mode: "System" | "On" | "Off") {
  await withAppearance(page, () => page.getByTestId("seg-reducedTransparency").getByRole("radio", { name: mode, exact: true }).click());
}
