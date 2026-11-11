// V1 feedback: a Feedback button on desktop (status strip) and phone (status bar) is visible on
// first load of /broker and /wire. The form chunk is not in the document until click; submit shows thanks.
import { expect, test, type Page } from "@playwright/test";

const FORM_MARK = "quay-feedback-form";

async function watchFormChunk(page: Page): Promise<{ urls: string[] }> {
  const urls: string[] = [];
  await page.route(/\/_next\/static\/.+\.js(\?.*)?$/, async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.body();
      if (body.includes(FORM_MARK) || body.includes("quay-feedback-optout")) urls.push(route.request().url());
      await route.fulfill({ response: res, body });
    } catch {
      await route.continue().catch(() => {});
    }
  });
  return { urls };
}

async function submitFeedback(page: Page) {
  await expect(page.getByTestId("quay-feedback")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quay-feedback-form")).toHaveCount(0);
  await page.getByTestId("quay-feedback").click();
  const form = page.getByTestId("quay-feedback-form");
  await expect(form).toBeVisible({ timeout: 10_000 });
  const formBox = await form.boundingBox();
  expect(formBox, "feedback form should have a box").toBeTruthy();
  expect(formBox!.y, "feedback form must not sit under the top chrome").toBeGreaterThanOrEqual(0);
  if (await page.getByTestId("statusbar").count()) {
    const chrome = await page.getByTestId("statusbar").boundingBox();
    expect(formBox!.y).toBeGreaterThanOrEqual((chrome?.y ?? 0) + (chrome?.height ?? 44) - 1);
  }
  await page.getByTestId("quay-feedback-text").fill("The ticket is confusing.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("quay-feedback-thanks")).toBeVisible({ timeout: 10_000 });
}

for (const route of ["/broker", "/wire"] as const) {
  test(`guest feedback journey on ${route}: form loads on click, submit thanks`, async ({ page }) => {
    const seen = await watchFormChunk(page);
    await page.addInitScript(() => { localStorage.setItem("quay.telemetry.consent", "0"); });
    await page.goto(route);
    if (route === "/wire") {
      await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 }).catch(() => {});
    } else {
      await expect(page.getByTestId("quay-feedback")).toBeVisible({ timeout: 20_000 });
    }
    expect(seen.urls, "feedback form chunk must not be requested before click").toEqual([]);
    await expect(page.getByTestId("quay-feedback-form")).toHaveCount(0);
    await submitFeedback(page);
    expect(seen.urls.length, "click should request the form chunk").toBeGreaterThan(0);
  });
}
