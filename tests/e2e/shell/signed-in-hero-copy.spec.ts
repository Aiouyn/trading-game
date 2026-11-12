// Card 29: signed-in Home hero says Net worth, not Demo balance.
import { expect, test, type Page } from "@playwright/test";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function register(page: Page, baseURL: string, handle: string) {
  const res = await page.request.post("/api/auth/register", {
    headers: { origin: baseURL },
    data: { handle, password: "local-hero-copy" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test.describe("signed-in phone Home hero copy", () => {
  test.use(phone);

  test("a registered account sees Net worth, not Demo balance or the starter disclaimer", async ({ page, baseURL }) => {
    const handle = `Hero${Date.now()}`;
    await register(page, baseURL!, handle);
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await expect(page.getByTestId("account-chip-home")).toHaveText(handle, { timeout: 20_000 });
    await expect(page.locator("[data-testid=widget] .label")).toHaveText("Net worth");
    await expect(page.getByTestId("phone-demo-disclaimer")).toHaveCount(0);
    await expect(page.getByTestId("widget")).not.toContainText("Demo balance");
    await expect(page.getByTestId("widget")).not.toContainText("not a live balance");
  });

  test("holding /api/auth/me: first paint has no Demo balance and no starter disclaimer", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await twoFrames(page);
    await expect(page.getByTestId("account-chip-home")).toHaveCount(0);
    await expect(page.getByTestId("phone-demo-disclaimer")).toHaveCount(0);
    await expect(page.getByTestId("strip-demo-tag")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Demo balance");
    await expect(page.locator("body")).not.toContainText("not a live balance");
  });
});

test.describe("signed-in desktop strip copy", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a registered account has no Demo balance tag on the strip", async ({ page, baseURL }) => {
    const handle = `Strip${Date.now()}`;
    await register(page, baseURL!, handle);
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await expect(page.getByTestId("account-chip")).toHaveText(handle, { timeout: 20_000 });
    await expect(page.getByTestId("strip-demo-tag")).toHaveCount(0);
    await expect(page.getByTestId("strip")).not.toContainText("Demo balance");
  });
});
