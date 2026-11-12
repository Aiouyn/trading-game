// Card 23: while /api/auth/me is held, first paint must not show guest rank or Sign in.
// Guest and signed-in end states stay as they are today.
import { expect, test, type Page } from "@playwright/test";

const RANK_FLASH = /R2\s*·\s*Owner|Quay\s+2\s*·\s*Owner/;

async function settle(page: Page) {
  // Two frames so first paint is committed. Do not await document.getAnimations()
  // — candles and phase dots loop forever.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

async function holdAuthMe(page: Page) {
  await page.route("**/api/auth/me", () => new Promise(() => {}));
}

async function assertNoGuestChrome(page: Page, where: string) {
  await settle(page);
  await expect(page.getByTestId("sign-in-entry"), `${where}: Sign in`).toHaveCount(0);
  await expect(page.getByTestId("rank-chip"), `${where}: R-chip`).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Sign in$/i }), `${where}: Sign in button`).toHaveCount(0);
  const release = page.getByTestId("release");
  if (await release.count()) {
    await expect(release, `${where}: release line`).not.toHaveText(RANK_FLASH);
  }
  const widget = page.getByTestId("widget");
  if (await widget.count()) {
    await expect(widget, `${where}: phone widget`).not.toContainText(RANK_FLASH);
  }
}

test("desktop: holding /api/auth/me does not paint boot rank or Sign in", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop strip");
  await holdAuthMe(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("strip")).toBeVisible();
  await assertNoGuestChrome(page, "desktop held");
});

test("phone: holding /api/auth/me does not paint boot rank or Sign in", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone Home widget");
  await holdAuthMe(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("widget")).toBeVisible();
  await assertNoGuestChrome(page, "phone held");
});

test("desktop: guest and signed-in end states stay unchanged", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop strip");
  // Guest (no cookie): today's Sign in + R2 chip + Quay 2 · Owner.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("sign-in-entry")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("rank-chip")).toHaveText(/R2\s*·\s*Owner/);
  await expect(page.getByTestId("release")).toHaveText(/Quay\s+2\s*·\s*Owner/);

  // Signed-in: register through the page context so Set-Cookie is kept.
  const handle = `Load${Date.now()}`;
  const registered = await page.request.post("/api/auth/register", {
    headers: { origin: baseURL! },
    data: { handle, password: "local-auth-chrome-test" },
  });
  expect(registered.status()).toBe(201);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("account-chip")).toHaveText(handle, { timeout: 10_000 });
  await expect(page.getByTestId("sign-in-entry")).toHaveCount(0);
  await expect(page.getByTestId("rank-chip")).toHaveCount(0);
  await expect(page.getByTestId("release")).not.toHaveText(RANK_FLASH);
});
