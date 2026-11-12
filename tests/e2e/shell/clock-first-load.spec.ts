// Card 18: signed-in, while the first /api/market read is held, the top-bar clock is a
// loading state — never the boot "Day 39 · 11:20" / data-tick 27700. The same rule
// applies while /api/auth/me is still in flight: an unknown session is not a guest clock.
import { expect, test, type Page } from "@playwright/test";

const BOOT = /Day 39 · 11:20|D39 · 11:20/;

async function register(page: Page, baseURL: string, handle: string) {
  const res = await page.context().request.post("/api/auth/register", {
    headers: { origin: baseURL, "content-type": "application/json" },
    data: { handle, password: "local-clock-test" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test("signed-in, first /api/market held: the clock loads, and does not invent Day 39 · 11:20", async ({ page, baseURL }, info) => {
  const handle = `Clk${Date.now().toString(36)}`;
  await register(page, baseURL!, handle);

  let release: () => void = () => {};
  const first = new Promise<void>((r) => { release = r; });
  let held = 0;
  await page.route("**/api/market*", async (route) => {
    if (route.request().url().includes("/candles")) return route.continue();
    held += 1;
    if (held === 1) await first;
    return route.continue();
  });

  await page.goto("/broker", { waitUntil: "domcontentloaded" });
  const clock = page.getByTestId("clock").first();
  await expect(clock).toHaveAttribute("data-clock-state", "loading", { timeout: 15_000 });
  await expect(clock).not.toHaveAttribute("data-tick", "27700");
  await expect(clock).not.toHaveText(BOOT);
  if (info.project.name === "phone") {
    await expect(clock.locator("[aria-label]")).toHaveAttribute("aria-label", "Time loading…");
    await expect(clock).toHaveText("—");
  } else {
    await expect(clock).toContainText("Time loading…");
    await expect(clock).toContainText("—");
    const phase = page.getByTestId("phase-label");
    await expect(phase).toHaveCount(0);
  }

  release();
  await expect(clock).toHaveAttribute("data-clock-state", "live", { timeout: 20_000 });
  await expect(clock).toHaveAttribute("data-tick", /\d+/);
  if (info.project.name === "phone") {
    await expect(clock).toHaveText(/^D\d+ · \d{2}:\d{2}$/);
  } else {
    await expect(clock).toHaveText(/^Day \d+ · \d{2}:\d{2}$/);
    await expect(page.getByTestId("phase-label")).toBeVisible();
  }
});

test("signed-in, first /api/auth/me held: the clock is a muted dash, not the boot time", async ({ page, baseURL }, info) => {
  const handle = `ClkA${Date.now().toString(36)}`;
  await register(page, baseURL!, handle);

  let releaseAuth: () => void = () => {};
  const firstAuth = new Promise<void>((r) => { releaseAuth = r; });
  let authHeld = 0;
  await page.route("**/api/auth/me*", async (route) => {
    authHeld += 1;
    if (authHeld === 1) await firstAuth;
    return route.continue();
  });

  let releaseMarket: () => void = () => {};
  const firstMarket = new Promise<void>((r) => { releaseMarket = r; });
  let marketHeld = 0;
  await page.route("**/api/market*", async (route) => {
    if (route.request().url().includes("/candles")) return route.continue();
    marketHeld += 1;
    if (marketHeld === 1) await firstMarket;
    return route.continue();
  });

  await page.goto("/broker", { waitUntil: "domcontentloaded" });
  const clock = page.getByTestId("clock").first();
  await expect(clock).toHaveAttribute("data-clock-state", "loading", { timeout: 15_000 });
  await expect(clock).not.toHaveAttribute("data-tick");
  await expect(clock).not.toHaveText(BOOT);
  await expect(clock).toContainText("—");
  await expect(page.getByTestId("phase")).toHaveCount(0);
  await expect(page.getByTestId("phase-dot")).toHaveCount(0);
  await expect(page.getByTestId("phase-label")).toHaveCount(0);
  await expect(page.getByTestId("tickring")).toHaveCount(0);
  if (info.project.name === "phone") {
    await expect(clock.locator("[aria-label]")).toHaveAttribute("aria-label", "Time loading…");
  } else {
    await expect(clock).toContainText("Time loading…");
  }

  releaseAuth();
  // Auth is known, first /api/market is still held: still a loading clock, still no phase or ring.
  await expect(clock).toHaveAttribute("data-clock-state", "loading");
  await expect(clock).not.toHaveAttribute("data-tick");
  await expect(clock).not.toHaveText(BOOT);
  await expect(page.getByTestId("phase")).toHaveCount(0);
  await expect(page.getByTestId("tickring")).toHaveCount(0);

  releaseMarket();
  await expect(clock).toHaveAttribute("data-clock-state", "live", { timeout: 20_000 });
  await expect(clock).toHaveAttribute("data-tick", /\d+/);
  if (info.project.name === "phone") {
    await expect(clock).toHaveText(/^D\d+ · \d{2}:\d{2}$/);
    await expect(page.getByTestId("phase-dot")).toBeVisible();
  } else {
    await expect(clock).toHaveText(/^Day \d+ · \d{2}:\d{2}$/);
    await expect(page.getByTestId("phase-label")).toBeVisible();
    await expect(page.getByTestId("tickring")).toBeVisible();
  }
});
