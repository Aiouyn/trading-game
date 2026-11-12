// Card 30: phone dock is Broker, Portfolio, Wire.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.describe("phone dock V1 apps", () => {
  test.use(phone);

  test("dock is Broker, Portfolio, Wire — not Messages", async ({ page }) => {
    await boot(page, "/");
    const bottom = page.getByTestId("bottom-row").locator("[data-testid^=icon-]");
    await expect(bottom).toHaveCount(3);
    await expect(page.getByTestId("bottom-row").getByTestId("icon-broker")).toBeVisible();
    await expect(page.getByTestId("bottom-row").getByTestId("icon-portfolio")).toBeVisible();
    await expect(page.getByTestId("bottom-row").getByTestId("icon-wire")).toBeVisible();
    await expect(page.getByTestId("bottom-row").getByTestId("icon-messages")).toHaveCount(0);
  });

  test("holding /api/auth/me: dock is already the three built apps", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await boot(page, "/");
    await twoFrames(page);
    await expect(page.getByTestId("account-chip-home")).toHaveCount(0);
    await expect(page.getByTestId("bottom-row").locator("[data-testid^=icon-]")).toHaveCount(3);
    await expect(page.getByTestId("bottom-row").getByTestId("icon-messages")).toHaveCount(0);
  });
});

test.describe("desktop is untouched by the dock change", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("1280 has no phone dock", async ({ page }) => {
    await boot(page, "/");
    await expect(page.getByTestId("bottom-row")).toHaveCount(0);
    await expect(page.getByTestId("shelf")).toBeVisible();
  });
});
