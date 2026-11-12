// Card 17: the analytics consent prompt must not cover app content at
// desktop 1280/1440 or phone 390/320. Dismiss hides it without writing a choice.
// .phone-appbody has no data-testid on this base; locate it by class.
import { expect, test, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    const els = document.getAnimations ? document.getAnimations() : [];
    await Promise.all(els.map((a) => a.finished.catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  expect(
    b,
    `expected ${await loc.evaluate((e) => (e as HTMLElement).dataset.testid ?? e.className)} to have a box`,
  ).toBeTruthy();
  return b!;
}

async function assertNoOverlap(prompt: Locator, target: Locator, label: string) {
  if ((await target.count()) === 0) return;
  if (!(await target.first().isVisible())) return;
  await settle(prompt.page());
  const a = await boxOf(prompt);
  const b = await boxOf(target.first());
  expect(overlaps(a, b), `${label} overlaps the consent prompt`).toBe(false);
}

async function showConsent(page: Page) {
  await page.goto("/?telemetry_consent=1");
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await page.locator("body").click({ position: { x: 8, y: 80 } });
  await expect(page.getByTestId("quay-consent")).toBeVisible({ timeout: 10_000 });
  await settle(page);
  return page.getByTestId("quay-consent");
}

test("desktop: the prompt does not cover Portfolio or the shelf at 1440 and 1280", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop viewports");
  for (const [w, h] of [[1440, 900], [1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: h });
    const prompt = await showConsent(page);
    await expect(page.getByTestId("win-portfolio")).toBeVisible({ timeout: 20_000 });
    const accept = page.getByTestId("quay-consent-accept");
    const decline = page.getByTestId("quay-consent-decline");
    const dismiss = page.getByTestId("quay-consent-dismiss");
    await expect(accept).toBeVisible();
    await expect(decline).toBeVisible();
    await expect(dismiss).toBeVisible();
    expect(await accept.getAttribute("class")).toBe(await decline.getAttribute("class"));
    await assertNoOverlap(prompt, page.getByTestId("win-portfolio"), `Portfolio at ${w}`);
    await assertNoOverlap(prompt, page.getByTestId("shelf"), `shelf at ${w}`);
    const cash = page.getByTestId("win-portfolio").getByText(/Cash/i);
    if (await cash.count()) await assertNoOverlap(prompt, cash.first(), `Portfolio Cash at ${w}`);
    if (w === 1440) {
      await dismiss.click();
      await expect(page.getByTestId("quay-consent")).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.consent"))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem("quay.telemetry.optout"))).toBeNull();
    }
  }
});

test("phone: the prompt does not cover Wire item content or the bottom chrome at 390 and 320", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone viewports");
  for (const [w, h] of [[390, 844], [320, 720]] as const) {
    await page.setViewportSize({ width: w, height: h });
    // Open Wire first; that first interaction also loads the consent chunk.
    // Showing the overlay first covers the dock and intercepts the open click.
    await page.goto("/?telemetry_consent=1");
    await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("icon-wire").click();
    await expect(page.getByTestId("phone-appview")).toHaveAttribute("data-app", "wire", { timeout: 10_000 });
    const prompt = page.getByTestId("quay-consent");
    await expect(prompt).toBeVisible({ timeout: 10_000 });
    const open = page.getByTestId("wire-open").first();
    await expect(open).toBeVisible({ timeout: 20_000 });
    try {
      await open.click({ timeout: 3_000 });
    } catch {
      await open.evaluate((el) => (el as HTMLElement).click());
    }
    await expect(page.locator(".phone-appbody")).toBeVisible();
    await settle(page);
    const accept = page.getByTestId("quay-consent-accept");
    const decline = page.getByTestId("quay-consent-decline");
    expect(await accept.getAttribute("class")).toBe(await decline.getAttribute("class"));
    await expect(page.getByTestId("quay-consent-dismiss")).toBeVisible();
    await assertNoOverlap(prompt, page.locator(".phone-appbody"), `Wire body at ${w}`);
    await assertNoOverlap(prompt, page.getByTestId("edge-bar"), `edge bar at ${w}`);
    await assertNoOverlap(prompt, page.getByTestId("bottom-row"), `bottom row at ${w}`);
  }
});
