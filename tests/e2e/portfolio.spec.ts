import { test, expect, type Page } from "@playwright/test";

// Tape: Portfolio tab (c2598bc). Trade on Market, then check the Portfolio view reflects it.
async function freshGame(page: Page, seed: string) {
  await page.goto(`/?seed=${seed}&fresh`);
  await expect(page.locator("html")).toHaveAttribute("data-game", "ready", { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __tg: { pause(): void } }).__tg.pause());
  await page.getByRole("button", { name: "Open Markets", exact: true }).click();
}
const advance = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as { __tg: { advance(n: number): void } }).__tg.advance(k), n);

test("portfolio tab: net worth chart, stats, allocation and order history after a fill", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const phone = info.project.name === "phone";
  await freshGame(page, "alpha");
  await page.getByTestId("watch-HLCN").click();
  if (phone) await page.getByTestId("open-trade").click();
  await page.getByTestId("order-qty").fill("2");
  await page.getByTestId("order-submit").click();
  await advance(page, 3);
  await expect(page.getByTestId("position-HLCN")).toBeVisible();

  await page.getByRole("button", { name: "Open Portfolio", exact: true }).last().click();
  await expect(page.locator('[data-testid="main-column"],[data-testid="phone-main"]').first()).toHaveAttribute("data-tab", "portfolio");
  await expect(page.getByTestId("portfolio-view")).toBeVisible();
  await expect(page.getByTestId("networth-chart")).toBeVisible();
  await expect(page.getByTestId("networth-total")).toHaveText(/\d/);
  await expect(page.getByTestId("networth-card")).toContainText("$");
  expect(await page.locator('[data-testid^="nw-range-"]').count(), "net worth ranges").toBeGreaterThanOrEqual(4);
  expect(await page.locator('[data-testid^="stat-"]').count(), "performance stats").toBeGreaterThanOrEqual(6);
  expect(await page.locator('[data-testid^="alloc-"]').count(), "allocation rows (class + cash)").toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-testid^="order-row-"]').first()).toBeVisible();
  await expect(page.getByTestId("position-HLCN")).toBeVisible();

  // ranges switch without errors, and the tab can still trade
  for (const r of await page.locator('[data-testid^="nw-range-"]').all()) await r.click();
  await advance(page, 5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "no horizontal overflow").toBeLessThanOrEqual(0);
  if (phone) await expect(page.getByTestId("open-trade")).toBeVisible();
  else await expect(page.getByTestId("order-submit")).toBeVisible();
  await page.screenshot({ path: `test-results/proof/${info.project.name}-portfolio.png` });
  expect(errors, "no console errors").toEqual([]);
});
