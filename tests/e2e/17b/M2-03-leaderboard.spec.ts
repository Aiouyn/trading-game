// M2-03: the world net-worth board from saved accounts. Each signed-in account's row equals its own saved ledger
// (/api/broker/me) valued at the server quotes (/api/market) at the board's tick, checked here independently; the
// caller's row is marked and findable; a trade changes the board; refresh keeps it; a failed read says so with Retry;
// signed out shows a prompt, never rows; the reply carries only rank / handle / NW / self. Phone 390 and the 420/520
// window fit. Real timers against the production build. Repo CI evidence only, not the desktop played gate.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.LB_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const cents = (s: string) => Math.round(Number(s) * 100);
const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-board-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
/** This account's NW at the current server quotes, and that tick (Portfolio's definition: total cash + qty × mark). */
async function ownNw(request: APIRequestContext): Promise<{ tick: number; nw: number }> {
  const [l, m] = await Promise.all([request.get("/api/broker/me").then((r) => r.json()), request.get("/api/market").then((r) => r.json())]) as [
    { cashCents: number; positions: Record<string, { assetId: string; qty: string }> }, { tick: number; quotes: { rows: Record<string, { last: string }> } }];
  let nw = l.cashCents;
  for (const p of Object.values(l.positions)) nw += Number(p.qty) * cents(m.quotes.rows[p.assetId]!.last);
  return { tick: m.tick, nw };
}
const lb = (page: Page) => page.getByTestId("leaderboard").first();
const selfRow = (page: Page) => lb(page).evaluate((el) => {
  const r = el.querySelector('[data-testid="lb-row"][data-self="true"]');
  return r ? { rank: Number(r.getAttribute("data-rank")), handle: r.getAttribute("data-handle"), nw: r.querySelector('[data-testid="lb-nw"]')?.textContent ?? null, tick: Number(el.getAttribute("data-tick")) } : null;
});
/** My marked row = my own valuation at the board's tick (polled: the clock moves). */
async function selfMatches(page: Page, request: APIRequestContext, handle: string) {
  await expect.poll(async () => {
    const [s, v] = await Promise.all([selfRow(page), ownNw(request)]);
    return s && s.handle === handle && s.tick === v.tick && s.nw === usd(v.nw) ? "ok" : JSON.stringify({ s, v: { tick: v.tick, nw: usd(v.nw) } });
  }, { timeout: 25_000 }).toBe("ok");
  return (await selfRow(page))!;
}
async function openBoard(page: Page) {
  await page.goto("/boards");
  await expect(lb(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}

test("desktop: fresh accounts at $10,000.00, my row marked and findable; a trade moves the board; refresh; Retry; privacy; signed out", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const A = `LbA${stamp}`, B = `LbB${stamp}`;
  const a = await browser.newContext();
  const b = await browser.newContext();
  const guest = await browser.newContext();
  try {
    await register(a.request, baseURL!, A);
    await register(b.request, baseURL!, B);
    const page = await a.newPage();
    await openBoard(page);
    const s0 = await selfMatches(page, a.request, A);
    expect(s0.nw).toBe("$10,000.00");
    await expect(lb(page).getByTestId("lb-your-rank")).toContainText(`Your rank: ${s0.rank} of`);
    await expect(lb(page).getByTestId("lb-valued-at")).toContainText(`server tick ${s0.tick}`);
    // B (another fresh account) is on A's board at $10,000.00 too, with the same rank (a tie), and not marked.
    const bRow = lb(page).locator(`[data-testid="lb-row"][data-handle="${B}"]`);
    await expect(bRow).toHaveCount(1);
    await expect(bRow.getByTestId("lb-nw")).toHaveText("$10,000.00");
    expect(await bRow.getAttribute("data-rank")).toBe(String(s0.rank));
    expect(await bRow.getAttribute("data-self")).toBeNull();
    await lb(page).getByTestId("lb-find-me").click();
    await expect(page.locator('[data-testid="lb-row"][data-self="true"]')).toBeFocused();
    await shot(page, "lb-01-fresh-A");

    // A trade: A pays the fee, so at any one tick A's NW differs from B's by the market move minus the fee.
    const buy = await a.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `lb-a-${stamp}-1`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "20", tif: "day" } } });
    expect(buy.status()).toBe(200);
    const s1 = await selfMatches(page, a.request, A);
    expect(s1.nw).not.toBe("$10,000.00");
    const aCents = cents(s1.nw!.replace(/[$,]/g, "").replace("−", "-"));
    // Rank is consistent with B's $10,000.00 at that tick: above B if more, below if less.
    const bRank = Number(await bRow.getAttribute("data-rank"));
    expect(aCents > 1_000_000 ? s1.rank < bRank : s1.rank > bRank, JSON.stringify({ s1, bRank })).toBe(true);
    await shot(page, "lb-02-after-trade-A");

    // Refresh: the same saved account, the same valuation rule.
    await page.reload();
    await expect(lb(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await selfMatches(page, a.request, A);

    // INJECTED failure: the first read 500 -> error + Retry, no rows; Retry reads again.
    await page.route("**/api/leaderboard", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.reload();
    await expect(lb(page).getByTestId("lb-error")).toBeVisible({ timeout: 15_000 });
    await expect(lb(page).getByTestId("lb-row")).toHaveCount(0);
    await shot(page, "lb-03-read-failed");
    await page.unroute("**/api/leaderboard");
    await lb(page).getByTestId("lb-retry").click();
    await expect(lb(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await selfMatches(page, a.request, A);

    // B's own board marks B, not A.
    const pageB = await b.newPage();
    await openBoard(pageB);
    await selfMatches(pageB, b.request, B);
    await expect(pageB.locator(`[data-testid="lb-row"][data-handle="${A}"]`)).not.toHaveAttribute("data-self", "true");

    // Privacy: only rank / handle / NW / self, no account id, cash or holdings.
    const meA = await (await a.request.get("/api/auth/me")).json() as { account: { accountId: string } };
    const res = await a.request.get("/api/leaderboard");
    const text = await res.text();
    const raw = JSON.parse(text) as { rows: Record<string, unknown>[]; self: Record<string, unknown> };
    expect(Object.keys(raw).sort()).toEqual(["players", "rows", "self", "tick", "worldId"]);
    for (const r of [...raw.rows, raw.self]) expect(Object.keys(r).sort()).toEqual(["handle", "nw", "rank", "self"]);
    for (const s of [meA.account.accountId, "cashCents", "positions", "avgCost", "orders", "password", "session"]) expect(text).not.toContain(s);
    // Signed out: 401 from the route, and the app shows a prompt, never rows.
    expect((await guest.request.get("/api/leaderboard")).status()).toBe(401);
    const g = await guest.newPage();
    await g.goto("/boards");
    await expect(lb(g)).toHaveAttribute("data-state", "signed-out", { timeout: 20_000 });
    await expect(lb(g).getByTestId("lb-row")).toHaveCount(0);
    await shot(g, "lb-04-signed-out");
  } finally {
    await a.close(); await b.close(); await guest.close();
  }
});

test("phone 390 and a 420 / 520 window: the board fits, my row is marked and matches", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project runs both layouts once");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const P = `LbP${stamp}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await register(ctx.request, baseURL!, P);
    await ctx.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `lb-p-${stamp}-1`, draft: { assetId: "MRDN", side: "BUY", type: "market", qty: "3", tif: "day" } } });
    const page = await ctx.newPage();
    await openBoard(page);
    await selfMatches(page, ctx.request, P);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.locator('[data-testid="lb-row"][data-self="true"]')).toBeVisible();
    await shot(page, "lb-05-phone-390");

    const login = await desk.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: P, password: "local-board-test" } });
    expect(login.status()).toBe(200);
    const d = await desk.newPage();
    await openBoard(d);
    const win = d.getByTestId("win-boards").first();
    for (const w of [520, 420]) {
      const h = (await win.getByTestId("resize-handle").boundingBox())!;
      const box = (await win.boundingBox())!;
      await d.mouse.move(h.x + 5, h.y + 5); await d.mouse.down(); await d.mouse.move(h.x + 5 - (box.width - w), h.y + 5, { steps: 5 }); await d.mouse.up();
      await expect.poll(async () => Math.round((await win.boundingBox())!.width)).toBe(w);
      await selfMatches(d, desk.request, P);
      expect(await win.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[data-testid="leaderboard"] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").length)).toBe(0);
      await shot(d, `lb-06-window-${w}`);
    }
  } finally {
    await ctx.close(); await desk.close();
  }
});
