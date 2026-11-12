// Card 31: unbuilt apps are not offered in Home, shelf, or launcher.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.describe("phone grid omits unbuilt apps", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Home grid has Settings, not Markets or Boards", async ({ page }) => {
    await boot(page, "/");
    await expect(page.getByTestId("app-grid").getByTestId("icon-settings")).toBeVisible();
    await expect(page.getByTestId("app-grid").getByTestId("icon-markets")).toHaveCount(0);
    await expect(page.getByTestId("app-grid").getByTestId("icon-boards")).toHaveCount(0);
    await expect(page.getByTestId("group-trade")).toHaveCount(0);
  });

  test("holding /api/auth/me: Markets does not flash in the grid", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await boot(page, "/");
    await twoFrames(page);
    await expect(page.getByTestId("account-chip-home")).toHaveCount(0);
    await expect(page.getByTestId("app-grid").getByTestId("icon-markets")).toHaveCount(0);
    await expect(page.getByTestId("app-grid").getByTestId("icon-settings")).toBeVisible();
  });
});

test.describe("desktop shelf and launcher omit unbuilt apps", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shelf has Broker, not Markets", async ({ page }) => {
    await boot(page, "/");
    await expect(page.getByTestId("tile-broker")).toBeVisible();
    await expect(page.getByTestId("tile-markets")).toHaveCount(0);
    await expect(page.getByTestId("tile-messages")).toHaveCount(0);
  });
});
