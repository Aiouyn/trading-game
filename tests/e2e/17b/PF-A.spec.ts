// UI card 2 (17B PF-A) Portfolio overview: hero, summary, restricted, stats, rank, states, desktop frame, phone push.
// Bodies the mock never sends (nwStats, MDOL, restricted) are injected through the QUAY_HOOKS-only window.__quayFeedMe.
import { expect, test, type Page } from "@playwright/test";
import { boot, setTextScale } from "../shell/helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const inject = (page: Page, patch: object) => page.addInitScript((p) => { (window as Window & { __quayFeedMe?: object }).__quayFeedMe = p; }, patch);
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const pf = (page: Page) => page.getByTestId("pf-overview").first();
const STATS = { window: "90d", drawdownReal: "-4.2", sharpe: "1.31", twrIdx: "100.0", bench: "100.0" };

async function openPortfolio(page: Page, query = "") {
  await boot(page, `/portfolio${query}`);
  await expect(pf(page)).toHaveAttribute("data-state", "live");
}

test("CH-07 portfolio deep link loads its own lazy chunk and renders the overview", async ({ page }) => {
  const chunks: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/_next/static/chunks/")) chunks.push(r.url()); });
  await openPortfolio(page);
  expect(chunks.length).toBeGreaterThan(0);
  await expect(page.getByTestId("portfolio").getByTestId("coming-later")).toHaveCount(0);
});

test("PF-2-02/03 hero: nominal NW, serif, 44 desktop / 30 phone, --acc-wealth integer, cents 65 % --fg-muted", async ({ page }, info) => {
  await openPortfolio(page);
  const hero = pf(page).getByTestId("pf-hero");
  await expect(hero.locator(".label")).toHaveText("Net worth");
  const r = await hero.evaluate((el) => {
    const int = el.querySelector("[data-testid=money-int]")!, cents = el.querySelector("[data-testid=money-cents]")!, label = el.querySelector(".label")!;
    const cs = (e: Element) => getComputedStyle(e);
    return { size: parseFloat(cs(int).fontSize), family: cs(int).fontFamily, color: cs(int).color, centsSize: parseFloat(cs(cents).fontSize), centsColor: cs(cents).color, label: cs(label).color };
  });
  const size = info.project.name === "phone" ? 30 : 44;
  expect(r.size).toBe(size);
  expect(r.family).toMatch(/Instrument Serif/);
  expect(r.color).toBe(await color(page, "var(--acc-wealth)"));
  expect(r.centsSize).toBeCloseTo(size * 0.65, 1);
  expect(r.centsColor).toBe(await color(page, "var(--fg-muted)"));
  expect(r.label).toBe(await color(page, "var(--fg-muted)"));
  await expect(hero.getByRole("img")).toHaveAttribute("aria-label", /dollars/);
});

test("PF-2-04 stats: absent without nwStats; verbatim when injected; null Sharpe is an em dash", async ({ page }) => {
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-stats")).toHaveCount(0);
  await inject(page, { nwStats: STATS });
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-stats")).toHaveText("Drawdown (real)-4.2Sharpe (whole NW)1.31");
  await inject(page, { nwStats: { ...STATS, sharpe: null } });
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-sharpe")).toHaveText("—");
});

test("PF-2-05 summary: Cash · FDL via MoneyText; MDOL '1250.00' renders '1,250.00 MDOL'", async ({ page }) => {
  await inject(page, { balances: { MDOL: "1250.00" } });
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-balance-FDL").locator("th")).toHaveText("Cash · FDL");
  await expect(pf(page).getByTestId("pf-balance-FDL").getByRole("img")).toHaveText(/^\$[\d,]+\.\d\d$/);
  await expect(pf(page).getByTestId("pf-balance-MDOL")).toHaveText("Cash · MDOL1,250.00 MDOL");
  const align = await pf(page).getByTestId("pf-amount-MDOL").evaluate((e) => getComputedStyle(e.parentElement!).textAlign);
  expect(align).toBe("right");
});

test("PF-2-06 new player (?empty=1): EmptyState copy, no button, no positions table", async ({ page }) => {
  await openPortfolio(page, "?empty=1");
  await expect(pf(page).getByTestId("pf-empty")).toHaveText("Your money is all cash. Broker or Businesses are good first stops.");
  expect(await pf(page).getByTestId("pf-empty").evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--fg-muted)"));
  await expect(pf(page).getByRole("button")).toHaveCount(0);
  await expect(pf(page).getByRole("table")).toHaveCount(1); // the cash summary only
});

test("PF-2-07 restricted: one row per bucket, AD/START pills, unit written; none when empty", async ({ page }) => {
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-restricted")).toHaveCount(0);
  await inject(page, { restricted: [{ reason: "AD", amount: "120.00", untilRealMs: 10_800_000 }, { reason: "START", amount: "500.00", untilRealMs: null }] });
  await openPortfolio(page);
  const rows = pf(page).getByTestId("pf-restricted-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText("$120.00ADreleases in 3 hours");
  await expect(rows.nth(1)).toHaveText("$500.00STARTheld");
  await expect(rows.nth(0).locator(".chip.chip-acc.chip-outline")).toHaveText("AD");
});

test("PF-2-08 states: loading skeleton, stale 'Updating…' without dimming, denied/error Couldn't load + Retry", async ({ page }) => {
  await boot(page, "/portfolio?feed=loading");
  await expect(pf(page).getByTestId("pf-loading")).toBeVisible();
  expect(await pf(page).getByTestId("pf-loading").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await color(page, "var(--win2)"));
  for (const mode of ["denied", "error"]) {
    await boot(page, `/portfolio?feed=${mode}`);
    await expect(pf(page).getByTestId("pf-error")).toHaveText("Couldn't loadRetry");
    await expect(pf(page).getByRole("button", { name: "Retry" })).toBeVisible();
  }
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await openPortfolio(page, "?feed=stale");
  await page.clock.runFor(23_000); // 2 ticks live, then 2+ missed ticks
  await expect(pf(page)).toHaveAttribute("data-state", "stale");
  await expect(pf(page).getByTestId("pf-updating")).toHaveText("Updating…");
  await expect(pf(page).getByTestId("money-int")).toBeVisible();
  expect(await pf(page).evaluate((e) => [getComputedStyle(e).opacity, getComputedStyle(e).filter])).toEqual(["1", "none"]);
  await page.clock.runFor(8_000); // fresh snap
  await expect(pf(page)).toHaveAttribute("data-state", "live");
  await expect(pf(page).getByTestId("pf-updating")).toHaveCount(0);
});

test("PF-2-09 desktop: tabs (#38), maximised two columns, 520 minimum one column, segment hit ≥ 28", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await inject(page, { nwStats: STATS });
  await openPortfolio(page);
  const win = page.getByTestId("win-portfolio").first();
  const tabs = win.getByRole("tab");
  await expect(tabs).toHaveText(["Overview", "Positions"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  for (const t of await tabs.all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  const sel = await tabs.nth(0).evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color, getComputedStyle(e).fontWeight]);
  expect(sel).toEqual([await color(page, "var(--win2)"), await color(page, "var(--fg)"), "500"]);
  await win.getByRole("button", { name: "Fill" }).click();
  const xs = async () => {
    const [h, s, r] = await Promise.all(["pf-hero", "pf-stats", "pf-rank"].map(async (id) => (await win.getByTestId(id).boundingBox())!));
    return { twoCol: s.x > h.x + h.width && r.x > h.x + h.width, oneCol: s.x === h.x && r.x === h.x };
  };
  await expect.poll(async () => (await xs()).twoCol).toBe(true);
  // Resize down to the 520 px minimum: one column.
  await win.getByRole("button", { name: "Fill" }).click(); // un-fill restores the layout rect
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(520);
  await expect.poll(async () => (await xs()).oneCol).toBe(true);
  await tabs.nth(1).click();
  await expect(win.getByTestId("pf-positions")).toBeVisible();
  await expect(win.getByTestId("pf-overview")).toHaveCount(0);
});

test("PF-2-10 phone: Overview root, Positions push with 'Back to Portfolio', hits ≥ 44, no overflow at scale 1 and 2", async ({ page }, info) => {
  phoneOnly(info.project.name);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
    && [...document.querySelectorAll("[data-testid=portfolio] *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
  const heroWhole = () => page.getByTestId("pf-hero-nw").evaluate((e) => e.scrollWidth <= e.clientWidth && getComputedStyle(e).textOverflow !== "ellipsis");
  for (const scale of ["1", "2"]) {
    await boot(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-portfolio").click();
    await expect(pf(page)).toHaveAttribute("data-state", "live");
    await expect(page.getByTestId("app-title")).toHaveText("Portfolio");
    await expect(page.getByTestId("pf-tabs")).toHaveCount(0);
    expect(await noOverflow(), `scale ${scale}`).toBe(true);
    expect(await heroWhole(), `scale ${scale}`).toBe(true);
    const order = await page.locator("[data-testid=pf-overview] > section").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["pf-hero", "pf-rank", "pf-summary"]);
    const open = page.getByTestId("pf-open-positions");
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await open.click();
    await expect(page.getByTestId("app-title")).toHaveText("Positions");
    const back = page.getByTestId("app-back");
    await expect(back).toHaveAttribute("aria-label", "Back to Portfolio");
    const bb = (await back.boundingBox())!;
    expect([bb.width >= 44, bb.height >= 44]).toEqual([true, true]);
    await back.click();
    await expect(page.getByTestId("app-title")).toHaveText("Portfolio");
    await expect(pf(page)).toBeVisible();
  }
});

test("PF-2-10 phone 16 px padding and 30 px hero at text scale 1", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await openPortfolio(page);
  expect(await pf(page).evaluate((e) => getComputedStyle(e).paddingLeft)).toBe("16px");
});
