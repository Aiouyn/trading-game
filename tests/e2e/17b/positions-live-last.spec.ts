// Card 13: after a first fill, the phone Positions card shows the live last (same figure the table already had).
import { expect, test, type APIRequestContext } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-pf-last" } });
  expect(res.status(), await res.text()).toBe(201);
}

test("after a first fill, the phone card shows the live last and does not overflow", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone 390 is the audited surface");
  test.setTimeout(120_000);
  const handle = `Pfl${Date.now().toString(36)}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await register(ctx.request, baseURL!, handle);
    const buy = await ctx.request.post("/api/broker/orders", {
      headers: { origin: baseURL! },
      data: { idempotencyKey: `pfl-${handle}-1`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "20", tif: "day" } },
    });
    expect(buy.status(), await buy.text()).toBe(200);
    const page = await ctx.newPage();
    await page.goto("/portfolio");
    await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pf-overview")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await page.getByTestId("pf-open-positions").click();
    const pos = page.getByTestId("pf-positions");
    await expect(pos).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    const row = pos.locator('[data-testid="pos-row"][data-asset="HALC"]');
    await expect(row).toBeVisible();
    const lastEl = row.getByTestId("pos-last");
    await expect(lastEl).toBeVisible();
    await expect.poll(async () => {
      const mkt = await ctx.request.get("/api/market").then((r) => r.json()) as { quotes: { rows: Record<string, { last: string }> } };
      const last = mkt.quotes.rows.HALC.last;
      const text = (await lastEl.textContent()) ?? "";
      return text.includes(last) ? "ok" : JSON.stringify({ text, last });
    }, { timeout: 15_000 }).toBe("ok");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await ctx.close();
  }
});
