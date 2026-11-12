// Card 38: with the first-launch consent prompt unanswered, Wire Post and the
// Home dock icons must remain clickable (a real click that takes effect, not
// just visible). Official e2e builds skip the prompt unless ?telemetry_consent=1;
// a no-flag production build shows it after the first interaction either way.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", {
    headers: { origin: baseURL },
    data: { handle, password: "local-consent-test" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

async function showConsent(page: Page) {
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
  // First gesture loads the lazy prompt. Aim at the left status-bar band, not a dock icon.
  await page.locator("body").click({ position: { x: 8, y: 20 } });
  await expect(page.getByTestId("quay-consent")).toBeVisible({ timeout: 10_000 });
}

test("phone: Home icons and Wire Post stay clickable while consent is unanswered", async ({ page, request, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone viewport");
  const handle = `Cn${Date.now().toString(36)}`.slice(0, 20);
  await register(request, baseURL!, handle);

  await page.goto("/?telemetry_consent=1");
  await showConsent(page);
  await expect(page.getByTestId("bottom-row")).toBeVisible();

  // A real click on the Home dock icon must open Wire, not be swallowed by the prompt.
  await page.getByTestId("icon-wire").click({ timeout: 5_000 });
  await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-app", "wire", { timeout: 10_000 });
  await expect(page.getByTestId("quay-consent")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.consent"))).toBeNull();

  const composer = page.getByTestId("wire-composer");
  await expect(composer).toBeVisible({ timeout: 20_000 });
  const toggle = page.getByTestId("wire-composer-toggle");
  await expect(toggle).toBeVisible();
  const isOpen = await composer.evaluate((el) => (el as HTMLDetailsElement).open);
  if (isOpen) {
    await toggle.click({ timeout: 5_000 });
    await expect(page.getByTestId("wire-composer-form")).toHaveCount(0);
  }
  // A real click on Post must open the composer form, not be swallowed by the prompt.
  await toggle.click({ timeout: 5_000 });
  await expect(page.getByTestId("wire-composer-form")).toBeVisible();

  await expect(page.getByTestId("quay-consent")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.consent"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.optout"))).toBeNull();
});
