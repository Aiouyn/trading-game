// A signed-in stop-limit rests, then the server tick arms it. Desktop and phone use the same ticket.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-order-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();

test("a buy stop-limit shows the review line and triggers on the next server tick", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name === "phone" ? "p" : "d"}${Date.now().toString(36)}`;
  await register(page.request, baseURL!, `Stp${stamp}`);
  await page.goto("/broker?asset=HALC");
  const b = br(page);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await b.getByTestId("br-type-stop_limit").click();
  await b.getByTestId("br-price-stop").fill("1.00");
  await b.getByTestId("br-price-limit").fill("1.00");
  await b.getByTestId("br-qty").fill("1");
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-trigger").first()).toHaveText("Buys if price rises to 1.00");
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });

  const me = await page.request.get("/api/broker/me");
  expect(me.status()).toBe(200);
  const body = await me.json() as { orders: Record<string, { status: string; type: string }> };
  const [id] = Object.keys(body.orders);
  expect(body.orders[id!]).toMatchObject({ type: "stop_limit" });

  const row = page.getByTestId(`br-oo-row-${id}`);
  await expect(row).toHaveAttribute("data-status", "TRIGGERED", { timeout: 25_000 });
  await expect(row.getByTestId("br-oo-status")).toHaveText("Triggered");
  await expect(page.getByTestId(`br-hist-${id}-TRIGGERED`)).toHaveAttribute("data-status", "TRIGGERED");
});
