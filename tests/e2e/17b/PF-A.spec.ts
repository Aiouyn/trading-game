// UI card 2 (17B PF-A) Portfolio overview: hero, summary, restricted, stats, rank, states, desktop frame, phone push.
// The mock feed sends nwStats, an MDOL wallet and AD_GRANT/FRESH_START restricted buckets (pills AD / START) (?empty=1 is the new player without them),
// and is the one NW source: the hero, the desktop strip and the phone status bar all read its me.nw (useNw).
import { expect, test, type Page } from "@playwright/test";
import { boot, setTextScale } from "../shell/helpers";
import { START_NW } from "../../../src/shell/contracts/fixtures/me";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const pf = (page: Page) => page.getByTestId("pf-overview").first();

async function openPortfolio(page: Page, query = "") {
  await boot(page, `/portfolio${query}`);
  await expect(pf(page)).toHaveAttribute("data-state", "live");
}
// Text scale lives in the shell store for this document: open Portfolio in-app after changing it, not via a reload.
async function openPortfolioInApp(page: Page, project: string) {
  if (project === "phone") {
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-portfolio").click();
  } else {
    await page.getByTestId("tile-portfolio").click();
  }
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

test("PF-2-02 hero NW: exact text of the shared mock NW string; the top bar shows its compact form (desktop + phone)", async ({ page }, info) => {
  // ?nw= pins the feed's NW to the shared START_NW string (fixtures/me), so the exact text is stable across ticks.
  await openPortfolio(page, `?nw=${START_NW}`);
  const full = `$${Number(START_NW).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  expect(full).toBe("$412,860.15");
  const hero = pf(page).getByTestId("pf-hero-nw").getByRole("img");
  await expect(hero).toHaveText(full);
  await expect(hero).toHaveAttribute("aria-label", "412,860.15 dollars");
  // One shared compact-money formatter (MoneyText ctx=chip, abbreviateDigits): 3 significant figures, rounded down.
  if (info.project.name === "desktop") {
    const strip = page.getByTestId("strip-nw").locator("[title]");
    await expect(strip).toHaveAttribute("title", full);
    await expect(strip).toHaveText("$412k");
  } else {
    await expect(page.locator(".sb-nw [title]")).toHaveAttribute("title", full);
    await expect(page.locator(".sb-nw [role=img]")).toHaveText("$412k");
  }
});

test("PF-2-04 stats: mock drawdownReal '-4.2' renders '−4.2%' (U+2212, locale percent); absent for the new player", async ({ page }) => {
  await openPortfolio(page);
  await expect(pf(page).getByTestId("pf-stats")).toHaveText("Drawdown (real)\u22124.2%Sharpe (whole NW)1.31");
  await openPortfolio(page, "?empty=1");
  await expect(pf(page).getByTestId("pf-stats")).toHaveCount(0);
});

test("PF-2-05 summary: Cash · FDL via MoneyText; mock MDOL '1250.00' renders '1,250.00 MDOL'", async ({ page }) => {
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

test("PF-2-07 restricted: one row per mock bucket, AD/START pills --steel outline + --fg-muted (no brass); none when empty", async ({ page }) => {
  await openPortfolio(page);
  const rows = pf(page).getByTestId("pf-restricted-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText("$500.00ADreleases in 3 hours");
  await expect(rows.nth(1)).toHaveText("$2,500.00STARTheld");
  const pill = rows.nth(0).locator(".chip.chip-steel.chip-outline");
  await expect(pill).toHaveText("AD");
  const [border, fg] = await pill.evaluate((e) => [getComputedStyle(e).borderTopColor, getComputedStyle(e).color]);
  expect([border, fg]).toEqual([await color(page, "var(--steel)"), await color(page, "var(--fg-muted)")]);
  await expect(pf(page).getByTestId("pf-restricted").locator(".chip-acc")).toHaveCount(0); // the rank chip keeps its accent
  await openPortfolio(page, "?empty=1");
  await expect(pf(page).getByTestId("pf-restricted")).toHaveCount(0);
});

test("Studio b: one NW string; the hero and the top bar (compact) agree on desktop and phone, tick after tick", async ({ page }, info) => {
  await openPortfolio(page);
  const read = () => page.evaluate(() => {
    const hero = document.querySelector("[data-testid=pf-hero-nw] [role=img]")!.textContent!;
    const strip = document.querySelector("[data-testid=strip-nw] [title]");
    const sb = document.querySelector(".sb-nw [role=img]");
    return { hero, stripTitle: strip?.getAttribute("title") ?? null, stripText: strip?.textContent ?? null, sb: sb?.textContent ?? null };
  });
  // Both top bars use the one shared compact formatter: 3 significant figures, ROUNDED DOWN (positive NW here),
  // k/M/B/T, trailing zeros dropped; under 10,000 the full amount. Restated independently of src/components/ui/money.ts.
  const compact = (full: string) => {
    const i = full.replace(/[^\d.]/g, "").split(".")[0];
    if (i.length < 5) return full;
    for (const [d, u] of [[12, "T"], [9, "B"], [6, "M"], [3, "k"]] as const) if (i.length > d) {
      const sig = i.slice(0, Math.max(3, i.length - d));
      const whole = sig.slice(0, i.length - d), dec = sig.slice(i.length - d).replace(/0+$/, "");
      return `$${whole}${dec ? `.${dec}` : ""}${u}`;
    }
    return full;
  };
  const seen = new Set<string>();
  for (let k = 0; k < 3; k++) {
    const r = await read();
    seen.add(r.hero);
    if (info.project.name === "desktop") {
      expect(r.stripTitle).toBe(r.hero);
      expect(r.stripText).toBe(compact(r.hero)); // the same shared floor formatter as the phone
    } else {
      expect(r.sb).toBe(compact(r.hero));
    }
    if (k < 2) await page.waitForTimeout(5_200); // one mock tick
  }
  expect(seen.size, "the mock NW moves with marks, and both views follow").toBeGreaterThan(1);
});

test("Studio c: at text scale 2 each row stacks label over value; amounts never split from their code", async ({ page }, info) => {
  await boot(page, "/settings");
  await setTextScale(page, "2");
  await openPortfolioInApp(page, info.project.name);
  await expect(pf(page)).toHaveClass(/pf-stacked/);
  const r = await pf(page).evaluate((root) => [...root.querySelectorAll(".pf-rows tr")].map((tr) => {
    const [th, td] = [tr.children[0] as HTMLElement, tr.children[1] as HTMLElement];
    const a = th.getBoundingClientRect(), b = td.getBoundingClientRect();
    const money = [...td.querySelectorAll(".money, .money-restricted")] as HTMLElement[];
    return { below: b.top >= a.bottom - 0.5, left: Math.abs(a.left - b.left) < 1, nowrap: money.every((m) => getComputedStyle(m).whiteSpace === "nowrap"),
      oneLine: money.every((m) => m.getClientRects().length === 1 || m.getBoundingClientRect().height < parseFloat(getComputedStyle(m).fontSize) * 2.2) };
  }));
  expect(r.length).toBeGreaterThan(3);
  for (const row of r) expect(row).toEqual({ below: true, left: true, nowrap: true, oneLine: true });
  await boot(page, "/settings");
  await setTextScale(page, "1");
  await openPortfolioInApp(page, info.project.name);
  await expect(pf(page)).not.toHaveClass(/pf-stacked/);
});

test("Studio Q3: a built app's chunk shows the generic window skeleton while it loads, never 'Coming later'", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.route(/\/_next\/static\/chunks\/.*\.js/, async (route) => {
    const body = await (await route.fetch()).text();
    if (body.includes("pf-overview")) await held; // the Portfolio chunk only
    await route.fulfill({ status: 200, contentType: "application/javascript", body });
  });
  await page.goto("/portfolio");
  const sk = page.getByTestId("app-skeleton").first();
  await expect(sk).toBeVisible();
  await expect(sk).toHaveAttribute("data-app", "portfolio");
  await expect(sk).toHaveAttribute("aria-busy", "true");
  await expect(sk.getByRole("status")).toHaveText("Loading Portfolio…");
  await expect(page.getByTestId("coming-later")).toHaveCount(0);
  release();
  await expect(pf(page)).toHaveAttribute("data-state", "live");
  await expect(page.getByTestId("app-skeleton")).toHaveCount(0);
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
    expect(order).toEqual(["pf-hero", "pf-rank", "pf-summary", "pf-restricted", "pf-stats"]);
    const open = page.getByTestId("pf-open-positions");
    // Studio Q1: a nav row, 44 px, the whole row is the target, chevron at the right edge
    const ob = (await open.boundingBox())!, cb = (await open.getByTestId("pf-nav-chevron").boundingBox())!;
    expect(ob.height).toBeGreaterThanOrEqual(44);
    // full width of the overview's content box (the app view and the overview each pad 16 px)
    const content = await pf(page).evaluate((e) => { const cs = getComputedStyle(e); return e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
    expect(Math.abs(ob.width - content)).toBeLessThan(1);
    expect(ob.x + ob.width - (cb.x + cb.width)).toBeLessThan(24);
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
