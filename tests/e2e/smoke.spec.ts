import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Trading Game/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});