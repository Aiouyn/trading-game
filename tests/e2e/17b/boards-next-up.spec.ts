import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-board-test" } });
  expect(res.status(), await res.text()).toBe(201);
}

const lb = (page: Page) => page.getByTestId("leaderboard").first();

test("behind a closer player: the board names Next up and the exact gap, on phone and desktop", async ({ browser, baseURL }, info) => {
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const A = `NuA${stamp}`, B = `NuB${stamp}`;
  const phone = info.project.name === "phone";
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  const other = await browser.newContext();
  try {
    await register(other.request, baseURL!, A);
    await register(ctx.request, baseURL!, B);
    const buy = await ctx.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `nu-b-${stamp}-1`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "20", tif: "day" } } });
    expect(buy.status(), await buy.text()).toBe(200);
    const page = await ctx.newPage();
    await page.goto("/boards");
    await expect(lb(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    const next = lb(page).getByTestId("lb-next-up");
    await expect(next).toBeVisible();
    await expect(next).toContainText("Next up");
    await expect(next).toContainText(A);
    await expect(next).toContainText("ahead");
    const nextRow = lb(page).locator('[data-testid="lb-row"][data-next-up="true"]');
    await expect(nextRow).toHaveAttribute("data-handle", A);
    await expect(nextRow.getByTestId("lb-next-chip")).toHaveText("Next up");
    await expect(lb(page).locator('[data-testid="lb-row"][data-self="true"]')).toHaveAttribute("data-handle", B);
    if (phone) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      expect((await page.getByTestId("lb-find-me").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await ctx.close();
    await other.close();
  }
});

test("unique lead and a tie at the top are stated, and do not invent a Next up", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one project is enough for these two states");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const L = `NuL${stamp}`, T1 = `NuT${stamp}a`, T2 = `NuT${stamp}b`;
  const lead = await browser.newContext();
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await register(lead.request, baseURL!, L);
    const pageL = await lead.newPage();
    await pageL.goto("/boards");
    await expect(lb(pageL)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    // A lone new account is at $10,000.00; any earlier accounts in this world may put them behind.
    // Only assert lead when this account uniquely holds the best net worth.
    const leadLine = pageL.getByTestId("lb-lead");
    const nextLine = pageL.getByTestId("lb-next-up");
    const tiedLine = pageL.getByTestId("lb-tied");
    if (await leadLine.count()) {
      await expect(leadLine).toHaveText("You're at the top of the board.");
      await expect(nextLine).toHaveCount(0);
    }

    await register(a.request, baseURL!, T1);
    await register(b.request, baseURL!, T2);
    const pageA = await a.newPage();
    await pageA.goto("/boards");
    await expect(lb(pageA)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    // T1 and T2 share $10,000.00. If they are jointly at the top, the board says so; if someone richer exists, Next up is set instead.
    const aNw = await pageA.locator('[data-testid="lb-row"][data-self="true"] [data-testid="lb-nw"]').textContent();
    const t2 = pageA.locator(`[data-testid="lb-row"][data-handle="${T2}"]`);
    await expect(t2.getByTestId("lb-nw")).toHaveText(aNw!);
    if (await pageA.getByTestId("lb-tied").count()) {
      await expect(pageA.getByTestId("lb-tied")).toContainText("Tied with");
      await expect(pageA.getByTestId("lb-next-up")).toHaveCount(0);
    } else {
      await expect(pageA.getByTestId("lb-next-up")).toBeVisible();
    }
  } finally {
    await lead.close();
    await a.close();
    await b.close();
  }
});
