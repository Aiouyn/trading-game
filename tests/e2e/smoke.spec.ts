import { test, expect } from "@playwright/test";

// Tape's release smoke. Runs on both projects (desktop 1440, phone 390).
// Visual proof goes to test-results/proof/<project>-<name>.png on every run.

test.describe("smoke", () => {
  test("home page loads without console errors", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page).toHaveTitle(/Trading Game/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.locator("html")).toHaveAttribute("data-game", "ready", { timeout: 30_000 });
    await page.screenshot({ path: `test-results/proof/${info.project.name}-home.png`, fullPage: true });
    expect(errors, "console errors on /").toEqual([]);
  });

  test("Tailwind utilities are compiled and applied", async ({ page }) => {
    await page.goto("/");
    // layout.tsx puts `flex flex-col min-h-full` on <body>; without Tailwind compiled these do nothing.
    const display = await page.evaluate(() => getComputedStyle(document.body).display);
    expect(display, "body should be display:flex from the Tailwind `flex` class").toBe("flex");
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(0);
  });
});
