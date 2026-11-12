// Card 35: Wire empty states explain the wait and recover a filter.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function register(page: Page, baseURL: string, handle: string) {
  const res = await page.request.post("/api/auth/register", {
    headers: { origin: baseURL },
    data: { handle, password: "local-wire-empty" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test.describe("card 35 Wire empty-state recovery", () => {
  test("a guest empty filter offers Show all stories and returns to All", async ({ page }) => {
    await boot(page, "/wire");
    await expect(page.getByTestId("wire")).toHaveAttribute("data-state", "live");
    await expect(page.getByTestId("wire-list")).toBeVisible();
    await page.getByTestId("wire-filter-verdicts").click();
    await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
    await expect(page.getByTestId("wire-empty-help")).toContainText("Try All");
    await expect(page.getByTestId("wire-show-all")).toHaveText("Show all stories");
    await expect(page.getByTestId("wire-open-broker")).toHaveCount(0);
    await page.getByTestId("wire-show-all").click();
    await expect(page.getByTestId("wire-filter-all")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("wire-filter-all")).toBeFocused();
    await expect(page.getByTestId("wire-list")).toBeVisible();
    await expect(page.getByTestId("wire-empty")).toHaveCount(0);
  });

  test("a signed-in empty All feed offers the wait line and Open Broker", async ({ page, baseURL }) => {
    const handle = `Wire${Date.now()}`;
    // After M1-09, a signed-in All feed is GET /api/wire (server stories), so ?empty=1
    // alone no longer empties it. Stub an empty snapshot to reach the card's All-empty path.
    await page.route("**/api/wire", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ worldId: "world_port_avalon", epoch: "e2eempty1", tick: 0, items: [] }),
      });
    });
    await register(page, baseURL!, handle);
    await boot(page, "/wire?empty=1");
    await expect(page.getByTestId("wire")).toHaveAttribute("data-state", "live");
    await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
    await expect(page.getByTestId("wire-empty-help")).toContainText("appear as events happen");
    await expect(page.getByTestId("wire-open-broker")).toHaveText("Open Broker");
    await expect(page.getByTestId("wire-show-all")).toHaveCount(0);
    await page.getByTestId("wire-open-broker").click();
    await expect(page.getByTestId("win-broker").or(page.getByTestId("phone-appview"))).toBeVisible();
  });

  test("holding /api/auth/me: All-empty first paint has a muted skeleton and no Open Broker", async ({ page }) => {
    await page.route("**/api/auth/me", () => { /* hold */ });
    await page.goto("/wire?empty=1");
    await expect(page.getByTestId("quay-ready")).toBeVisible();
    await twoFrames(page);
    await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
    await expect(page.getByTestId("wire-empty-auth-skel")).toBeVisible();
    await expect(page.getByTestId("wire-empty-help")).toHaveCount(0);
    await expect(page.getByTestId("wire-open-broker")).toHaveCount(0);
    await expect(page.getByTestId("wire-show-all")).toHaveCount(0);
    await expect(page.locator("[data-testid=wire-empty-auth-skel]")).not.toContainText(/\d/);
  });
});

test.describe("card 35 Wire empty-state recovery on phone", () => {
  test.use(phone);

  test("Show all stories recovers an empty filter on a 390px phone", async ({ page }) => {
    await boot(page, "/wire");
    await expect(page.getByTestId("wire")).toHaveAttribute("data-state", "live");
    await page.getByTestId("wire-filter-verdicts").click();
    await expect(page.getByTestId("wire-show-all")).toBeVisible();
    await page.getByTestId("wire-show-all").click();
    await expect(page.getByTestId("wire-filter-all")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("wire-list")).toBeVisible();
  });
});
