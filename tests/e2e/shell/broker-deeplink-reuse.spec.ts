import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop only");
const topWin = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".win:not([hidden])")].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex)).at(-1)?.dataset.testid);

// Playtest e30f6822 d40: Trade layout already has a Broker window; repeated /broker visits must
// focus that window instead of stacking up to the instance cap.
test("repeated /broker deep links reuse the existing Broker window", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  await page.goto("/broker");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.goto("/portfolio");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.goto("/broker");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.goto("/broker");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  expect(await topWin(page)).toBe("win-broker");
  await page.goto("/broker?asset=HALC");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  expect(await topWin(page)).toBe("win-broker");
});
