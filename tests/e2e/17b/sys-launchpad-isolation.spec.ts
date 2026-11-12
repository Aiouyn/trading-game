import { expect, test, type APIRequestContext } from "@playwright/test";

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
async function own(request: APIRequestContext) {
  const res = await request.get("/api/launchpad"); expect(res.status()).toBe(200);
  const raw: unknown = await res.json();
  if (!obj(raw) || !obj(raw.self) || typeof raw.self.cashCents !== "number" || !obj(raw.self.holdings)) throw new Error("bad launchpad self");
  return { cash: raw.self.cashCents, holdings: raw.self.holdings };
}

test("isolated sys engine leaves the real paid launch, two-account curve trading and reload path intact", async ({ browser, baseURL }, info) => {
  test.setTimeout(90_000);
  const a = await browser.newContext(info.project.use), b = await browser.newContext(info.project.use);
  const ticker = info.project.name === "phone" ? "ZFPH" : "ZFDK";
  const stamp = Date.now().toString(36);
  try {
    for (const [context, prefix] of [[a, "SysA"], [b, "SysB"]] as const) {
      const registered = await context.request.post("/api/auth/register", { headers: { origin: baseURL! }, data: { handle: `${prefix}${stamp}`, password: "local-sys-proof" } });
      expect(registered.status(), await registered.text()).toBe(201);
    }
    const cashA = (await own(a.request)).cash;
    const pageA = await a.newPage(); await pageA.goto("/launchpad");
    await pageA.getByTestId("lp-tab-create").first().click();
    await pageA.getByTestId("lp-name").first().fill(`${ticker} Pebble Club`);
    await pageA.getByTestId("lp-ticker").first().fill(ticker);
    await pageA.getByTestId("lp-review-launch").first().click();
    await expect(pageA.getByTestId("lp-launch-fee").first()).toHaveText("$1,000.00");
    await pageA.getByTestId("lp-confirm-launch").first().click();
    await expect(pageA.locator(`[data-testid="lp-coin-panel"][data-ticker="${ticker}"]`).first()).toBeVisible();
    expect((await own(a.request)).cash).toBe(cashA - 100_000);
    const pageB = await b.newPage(); await pageB.goto("/launchpad");
    await pageB.locator(`[data-testid="lp-coin"][data-ticker="${ticker}"]`).first().click();
    await pageB.getByTestId("lp-amount").first().fill("100");
    await pageB.getByTestId("lp-review").first().click();
    await pageB.getByTestId("lp-confirm").first().click();
    await expect(pageB.getByTestId("lp-result").first()).toHaveAttribute("data-kind", "ok");
    const bought = await own(b.request), tokens = bought.holdings[ticker];
    expect(typeof tokens).toBe("number"); expect(tokens).toBeGreaterThan(0);
    expect((await own(a.request)).holdings[ticker]).toBeUndefined();
    await pageB.reload();
    await pageB.locator(`[data-testid="lp-coin"][data-ticker="${ticker}"]`).first().click();
    await expect(pageB.getByTestId("lp-held").first()).toHaveAttribute("data-qty", String(tokens));
    await info.attach(`paid-launch-${info.project.name}`, { body: await pageB.screenshot(), contentType: "image/png" });
    await pageB.getByTestId("lp-side-sell").first().click();
    await pageB.getByTestId("lp-all").first().click();
    await pageB.getByTestId("lp-review").first().click();
    await pageB.getByTestId("lp-confirm").first().click();
    await expect(pageB.getByTestId("lp-result").first()).toHaveAttribute("data-kind", "ok");
    expect((await own(b.request)).holdings[ticker]).toBeUndefined();
  } finally { await a.close(); await b.close(); }
});
