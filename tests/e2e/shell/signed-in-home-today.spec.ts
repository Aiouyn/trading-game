// Card 25: signed-in phone Home shows today's change and the $20k / Hustler bar.
import { expect, test, type Page } from "@playwright/test";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.describe("signed-in phone Home today and $20k progress", () => {
  test.use(phone);

  test("a registered account sees today's change and Next: Hustler at $20,000", async ({ page, baseURL }) => {
    const handle = `Home${Date.now()}`;
    const res = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL! },
      data: { handle, password: "local-home-today" },
    });
    expect(res.status(), await res.text()).toBe(201);
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await expect(page.getByTestId("account-chip-home")).toHaveText(handle, { timeout: 20_000 });
    const today = page.getByTestId("today");
    await expect(today).toBeVisible();
    await expect(today).not.toHaveText(/Trading is a demo/);
    await expect(today).toHaveText(/[+\u2212$0-9.,%\s]+/);
    await expect(page.getByTestId("rank-next")).toContainText("Hustler");
    await expect(page.getByTestId("rank-next")).toHaveText(/20k|20,000|20000/);
    await expect(page.getByTestId("rank-bar")).toBeVisible();
  });

  test("holding /api/auth/me: first paint has no signed-in handle and no Hustler bar", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await twoFrames(page);
    await expect(page.getByTestId("account-chip-home")).toHaveCount(0);
    const next = page.getByTestId("rank-next");
    if (await next.count()) await expect(next).not.toContainText("Hustler");
  });
});
