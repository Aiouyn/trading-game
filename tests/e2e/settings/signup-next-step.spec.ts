// Card 32: after creating an account, a next step is visible.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function register(page: Page, handle: string) {
  await page.getByTestId("account-handle-input").fill(handle);
  await page.getByTestId("account-password-input").fill("local-next-step");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-handle")).toHaveText(handle);
}

test.describe("Account next step after signup", () => {
  test("creating an account shows the $20k goal and Open Portfolio", async ({ page }) => {
    await boot(page, "/settings/SET-01");
    await expect(page.getByTestId("account-start")).toContainText("10,000");
    await expect(page.getByTestId("account-start")).toContainText("20,000");
    await expect(page.getByTestId("account-open-portfolio")).toHaveCount(0);
    await register(page, `Next${Date.now()}`);
    await expect(page.getByTestId("account-start")).toContainText("20,000");
    await expect(page.getByTestId("account-open-portfolio")).toBeVisible();
    await expect(page.getByTestId("account-logout")).toBeVisible();
    await expect(page.getByTestId("settings-account")).not.toContainText("M1-06");
    await page.getByTestId("account-open-portfolio").click();
    await expect(page.getByTestId("portfolio").or(page.getByTestId("pf-overview"))).toBeVisible();
  });

  test("holding /api/auth/me: Open Portfolio does not flash in", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await boot(page, "/settings/SET-01");
    await twoFrames(page);
    await expect(page.getByTestId("account-loading")).toBeVisible();
    await expect(page.getByTestId("account-open-portfolio")).toHaveCount(0);
    await expect(page.getByTestId("account-handle")).toHaveCount(0);
  });
});
