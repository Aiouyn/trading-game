// Card 36: guest Home names the example portfolio and points to an account.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function register(page: Page, baseURL: string, handle: string) {
  const res = await page.request.post("/api/auth/register", {
    headers: { origin: baseURL },
    data: { handle, password: "local-guest-home" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test.describe("card 36 guest phone Home example caption", () => {
  test.use(phone);

  test("a guest sees Net worth, the example caption, and Sign in opens Account", async ({ page }) => {
    await boot(page, "/");
    await expect(page.locator("[data-testid=widget] .label")).toHaveText("Net worth");
    await expect(page.getByTestId("hero-nw")).toContainText(/412/);
    await expect(page.getByTestId("home-example-caption")).toHaveText("Example portfolio · not your account");
    await expect(page.getByTestId("sign-in-entry")).toHaveText("Sign in");
    await page.getByTestId("sign-in-entry").click();
    await expect(page.getByTestId("settings-account")).toBeVisible();
    await expect(page.getByTestId("account-handle-input")).toBeVisible();
  });

  test("a signed-in Home has no example caption", async ({ page, baseURL }) => {
    const handle = `HomeEx${Date.now()}`;
    await register(page, baseURL!, handle);
    await boot(page, "/");
    await expect(page.getByTestId("account-chip-home")).toHaveText(handle, { timeout: 20_000 });
    await expect(page.locator("[data-testid=widget] .label")).toHaveText("Net worth");
    await expect(page.getByTestId("home-example-caption")).toHaveCount(0);
    await expect(page.getByTestId("hero-nw")).toContainText(/10k|10,?000/);
  });

  test("holding /api/auth/me: first paint has a muted skeleton and no example caption", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await page.goto("/");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await twoFrames(page);
    await expect(page.getByTestId("home-example-skel")).toBeVisible();
    await expect(page.getByTestId("home-example-skel")).not.toContainText(/\d/);
    await expect(page.getByTestId("home-example-caption")).toHaveCount(0);
    await expect(page.getByTestId("strip-demo-tag")).toHaveCount(0);
    await expect(page.getByTestId("account-chip-home")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Example portfolio");
  });
});

test.describe("card 36 guest desktop strip Example tag", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a guest strip shows Example next to the demo net worth", async ({ page }) => {
    await boot(page, "/");
    await expect(page.getByTestId("strip-nw")).toContainText(/412/);
    await expect(page.getByTestId("strip-demo-tag")).toHaveText("Example");
    await expect(page.getByTestId("sign-in-entry")).toHaveText("Sign in");
  });

  test("a signed-in strip has no Example tag", async ({ page, baseURL }) => {
    const handle = `StripEx${Date.now()}`;
    await register(page, baseURL!, handle);
    await boot(page, "/");
    await expect(page.getByTestId("account-chip")).toHaveText(handle, { timeout: 20_000 });
    await expect(page.getByTestId("strip-demo-tag")).toHaveCount(0);
  });
});
