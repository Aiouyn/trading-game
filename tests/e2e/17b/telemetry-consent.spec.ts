// 21 first-launch analytics opt-in: the prompt chunk is not requested until the first
// interaction; Accept / Decline persist; the prompt does not return after a decision.
import { expect, test, type Page } from "@playwright/test";

const CONSENT_MARK = "quay-consent-accept";

async function watchConsentChunk(page: Page): Promise<{ urls: string[] }> {
  const urls: string[] = [];
  await page.route(/\/_next\/static\/.+\.js(\?.*)?$/, async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.body();
      if (body.includes(CONSENT_MARK) || body.includes("quay-consent-decline")) urls.push(route.request().url());
      await route.fulfill({ response: res, body });
    } catch {
      await route.continue().catch(() => {});
    }
  });
  return { urls };
}

test("first-launch consent prompt loads after interaction, Accept persists", async ({ page }) => {
  const seen = await watchConsentChunk(page);
  await page.goto("/broker?telemetry_consent=1");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  expect(seen.urls, "consent chunk must not be requested before interaction").toEqual([]);
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
  await page.locator("body").click({ position: { x: 8, y: 80 } });
  await expect(page.getByTestId("quay-consent")).toBeVisible({ timeout: 10_000 });
  expect(seen.urls.length, "first interaction should request the consent chunk").toBeGreaterThan(0);
  await page.getByTestId("quay-consent-accept").click();
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.consent"))).toBe("1");
  await page.reload();
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await page.locator("body").click({ position: { x: 8, y: 80 } });
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
});

test("first-launch Decline persists and keeps analytics off", async ({ page }) => {
  await page.goto("/broker?telemetry_consent=1");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await page.locator("body").click({ position: { x: 8, y: 80 } });
  await expect(page.getByTestId("quay-consent")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("quay-consent-decline").click();
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.consent"))).toBe("0");
  await page.reload();
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await page.locator("body").click({ position: { x: 8, y: 80 } });
  await expect(page.getByTestId("quay-consent")).toHaveCount(0);
});
