// Card 33: Portfolio names the $20k goal and a first-trade path.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.describe("Portfolio goal and first-trade guide", () => {
  test("a registered account sees the $20k goal and can open Broker from the guide", async ({ page }) => {
    await boot(page, "/");
    await page.getByTestId("quay-ready").waitFor({ state: "visible" });
    const handle = `Goal${Date.now()}`;
    const res = await page.request.post("/api/auth/register", {
      headers: { origin: page.url() },
      data: { handle, password: "local-goal-guide" },
    });
    expect(res.status(), await res.text()).toBe(201);
    await page.goto("/portfolio");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await expect(page.getByTestId("pf-goal")).toBeVisible();
    await expect(page.getByTestId("pf-goal")).toContainText("10,000");
    await expect(page.getByTestId("pf-goal")).toContainText("20,000");
    await expect(page.getByTestId("pf-open-wire")).toBeVisible();
    await expect(page.getByTestId("pf-open-broker")).toBeVisible();
    await expect(page.getByTestId("pf-goal")).not.toContainText(/saved to (your|this) account/i);
    await page.getByTestId("pf-open-broker").click();
    await expect(page.getByTestId("broker").or(page.getByTestId("br-ticket"))).toBeVisible();
  });

  test("holding /api/auth/me: the signed-in guide does not flash in", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await boot(page, "/portfolio");
    await twoFrames(page);
    await expect(page.getByTestId("pf-goal")).toHaveCount(0);
    await expect(page.getByTestId("pf-goal-guest")).toHaveCount(0);
    await expect(page.getByTestId("pf-open-broker")).toHaveCount(0);
  });
});
