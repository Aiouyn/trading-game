// M2-05 known-offline boundary (browser network emulation; the e2e hooks build registers no service worker, the real
// worker is proven on the plain production preview). Online → review a ticket → offline: Place cannot be activated by
// pointer or keyboard and no order request leaves; the ticket and the strip say the prices are not live. Back online:
// nothing is placed by itself; an explicit Place on a fresh estimate works.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const orderReqs = (page: Page) => { const seen: string[] = []; page.on("request", (r) => { if (r.method() === "POST" || /\/api\/broker\/orders/.test(r.url())) seen.push(`${r.method()} ${new URL(r.url()).pathname}`); }); return seen; };

test("desktop: offline freezes Place (pointer + keyboard), no order request, truthful strip; reconnect places nothing until an explicit Place", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "desktop ticket");
  await boot(page, "/broker");
  const b = page.getByTestId("win-broker").first().getByTestId("broker").first();
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await b.getByTestId("br-qty").fill("2");
  await expect(b.getByTestId("br-review")).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
  await b.getByTestId("br-review").click();
  const place = b.getByTestId("br-place");
  await expect(place).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
  await expect(page.getByTestId("phase-label")).not.toContainText("Offline");

  const seen = orderReqs(page);
  await context.setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  await expect(b).toHaveAttribute("data-state", "stale");
  await expect(b.getByTestId("br-offline")).toHaveText("You're offline. Prices shown are the last received. Place is off until you're back online.");
  await expect(place).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("phase-label")).toHaveText("Offline · not live · Port Avalon");
  await expect(page.getByTestId("tickring")).toHaveAttribute("data-state", "reconnecting");
  await place.click({ force: true }); // aria-disabled: Playwright would otherwise refuse; the real click must do nothing
  await place.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await expect(b.getByTestId("br-ack")).toHaveCount(0);
  await expect(b.getByTestId("br-pending")).toHaveCount(0);
  expect(seen).toEqual([]);

  await context.setOffline(false);
  await expect(page.getByTestId("offline-state")).toHaveCount(0);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 10_000 });
  await expect(b.getByTestId("br-offline")).toHaveCount(0);
  await expect(page.getByTestId("phase-label")).not.toContainText("Offline");
  await page.waitForTimeout(2000);
  await expect(b.getByTestId("br-ack")).toHaveCount(0); // nothing placed by itself
  expect(seen).toEqual([]);
  // Explicit Place once a fresh estimate is shown.
  await expect(place).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
  await place.click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
});

test("phone 390: offline marks the phase dot 'Offline · not live' and the banner shows; online restores the market phase", async ({ page, context }, info) => {
  test.skip(info.project.name !== "phone", "phone");
  await boot(page, "/");
  await context.setOffline(true);
  await expect(page.getByTestId("phone-banner")).toBeVisible();
  await expect(page.getByTestId("phase-dot")).toHaveAttribute("aria-label", "Offline · not live · Port Avalon");
  await context.setOffline(false);
  await expect(page.getByTestId("phase-dot")).not.toHaveAttribute("aria-label", /Offline/);
});
