import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { boot, box } from "./helpers";

test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phone project only"));

test("S1-13 phone home: status bar 44, 4-col 60×60 grid, 5 groups, bottom row, no h-scroll at 1.0 and 2.0", async ({ page }) => {
  await boot(page, "/?rank=R6&nw=200000&flags=charter.anyAvailable,api.eligible,character.day3&guest=0&lic=LIC2");
  expect((await box(page, "statusbar")).height).toBe(44);
  const labels = await page.locator(".grid-group > .label").allInnerTexts();
  expect(labels.map((l) => l.toLowerCase())).toEqual(["trade", "build", "shadow", "world", "me"]);
  const icon = await page.getByTestId("app-grid").locator(".icon").first().boundingBox();
  expect([icon?.width, icon?.height]).toEqual([60, 60]);
  const cols = await page.getByTestId("group-build").locator(".grid4").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(4);
  const bottom = await page.getByTestId("bottom-row").locator("[data-testid^=icon-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(bottom).toEqual(["icon-broker", "icon-portfolio", "icon-wire", "icon-messages"]);
  for (const id of ["broker", "portfolio", "wire", "messages"]) await expect(page.getByTestId("app-grid").getByTestId(`icon-${id}`)).toHaveCount(0);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && Array.from(document.querySelectorAll("*")).every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
  expect(await noHScroll()).toBe(true);
  // 17-AT-17 at text scale 2.0, through the real AccountUiPrefs.textScale setting (Settings › Text size).
  await page.getByTestId("icon-settings").click();
  await page.getByTestId("text-scale").selectOption("2");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim())).toBe("2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Back" }).click();
  const label = await page.getByTestId("app-grid").locator(".icon-label").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(label).toBe(23);
  expect(await noHScroll()).toBe(true);
});

test("S1-13 grid groups hold only apps of that group", async ({ page }) => {
  await boot(page, "/?rank=R6&nw=200000");
  const map = await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid^=group-]")).map((g) => [g.getAttribute("data-testid"), Array.from(g.querySelectorAll("[data-testid^=icon-]")).map((i) => i.getAttribute("data-testid"))]));
  expect(map).toEqual([
    ["group-trade", ["icon-markets", "icon-risk", "icon-quantlab", "icon-research"]],
    ["group-build", ["icon-businesses", "icon-company", "icon-property", "icon-city", "icon-bank", "icon-funds", "icon-insurance", "icon-institutions"]],
    ["group-shadow", ["icon-ailab", "icon-security", "icon-legal"]],
    ["group-world", ["icon-boards", "icon-contracts", "icon-auctions", "icon-civic", "icon-replay"]],
    ["group-me", ["icon-estate", "icon-profile", "icon-academy", "icon-help", "icon-atelier", "icon-settings"]],
  ]);
});

test("S1-07 phone: ComingLater full screen and deep link", async ({ page }) => {
  await boot(page);
  await page.getByTestId("icon-markets").click();
  await expect(page.getByTestId("coming-later")).toHaveText(/Markets\s*Coming later/);
  await boot(page, "/wire");
  await expect(page.getByTestId("coming-later")).toHaveText(/Wire\s*Coming later/);
});

test("S1-14 long-press 400 ms on the Quay mark opens Recent with ≤ 6 entries", async ({ page }) => {
  await boot(page);
  for (const id of ["markets", "wire", "broker", "portfolio", "messages", "bank", "funds", "insurance"]) {
    await page.getByTestId(`icon-${id}`).click();
    await page.getByRole("button", { name: "Back" }).click();
  }
  const mark = await box(page, "quay-mark");
  await page.mouse.move(mark.x + 10, mark.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await expect(page.getByTestId("recent")).toBeVisible();
  await page.mouse.up();
  const n = await page.getByTestId("recent-item").count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
});

test("S1-19 axe: phone home, launcher, ComingLater", async ({ page }) => {
  for (const [path, launcher] of [["/", false], ["/", true], ["/markets", false]] as const) {
    await boot(page, path);
    if (launcher) {
      const sb = await box(page, "statusbar");
      await page.mouse.move(sb.x + 200, sb.y + 20);
      await page.mouse.down();
      await page.mouse.move(sb.x + 200, sb.y + 120, { steps: 4 });
      await page.mouse.up();
      await expect(page.getByTestId("launcher")).toBeVisible();
    }
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id), path).toEqual([]);
  }
});

test("Phone widget: sparkline, rank bar, today's change, cents at 65% muted, rank target from thresholds (M2, M3, B2)", async ({ page }) => {
  await boot(page, "/?rank=R1&nw=30000");
  await expect(page.getByTestId("rank-next")).toHaveText("Next: Owner · $30k / $250k");
  await boot(page);
  await expect(page.getByTestId("rank-next")).toHaveText("Next: Mogul · $412k / $5M");
  const sp = await page.getByTestId("sparkline").boundingBox();
  expect([sp?.width, sp?.height]).toEqual([92, 22]);
  expect((await page.getByTestId("rank-bar").boundingBox())?.height).toBe(4);
  await expect(page.getByTestId("today")).toHaveText("+$3,204.10 +0.78%");
  const cents = await page.getByTestId("hero-cents").evaluate((e) => {
    const p = getComputedStyle(e.parentElement!);
    const d = document.createElement("i"); d.style.color = "var(--fg-muted)"; document.body.appendChild(d);
    const muted = getComputedStyle(d).color; d.remove();
    return { ratio: parseFloat(getComputedStyle(e).fontSize) / parseFloat(p.fontSize), color: getComputedStyle(e).color, muted, text: e.textContent };
  });
  expect(cents.text).toBe(".15");
  expect(cents.ratio).toBeCloseTo(0.65, 2);
  expect(cents.color).toBe(cents.muted);
});

test("Phone glyphs: muted, locked disabled with tag inside the tile; never brass (B1, m6)", async ({ page }) => {
  await boot(page, "/?rank=R1&nw=30000");
  const r = await page.evaluate(() => {
    const probe = (v: string) => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const icon = (id: string) => document.querySelector(`[data-testid=icon-${id}] .icon`)!;
    const tag = icon("quantlab").querySelector(".lock-tag")!.getBoundingClientRect();
    const box = icon("quantlab").getBoundingClientRect();
    return {
      unlocked: ["markets", "security", "legal", "broker"].map((id) => getComputedStyle(icon(id)).color),
      locked: getComputedStyle(icon("quantlab")).color,
      inside: tag.left >= box.left && tag.right <= box.right && tag.top >= box.top && tag.bottom <= box.bottom,
      muted: probe("--fg-muted"), disabled: probe("--fg-disabled"), acc: probe("--acc"),
    };
  });
  for (const c of r.unlocked) { expect(c).toBe(r.muted); expect(c).not.toBe(r.acc); }
  expect(r.locked).toBe(r.disabled);
  expect(r.inside).toBe(true);
});

test("Phone launcher: visible close and a Recent group; edge bar swipe up = Home, left-edge swipe = back (M4, m5)", async ({ page }) => {
  await boot(page);
  await page.getByTestId("icon-markets").click();
  const edge = await box(page, "edge-bar");
  expect(edge.height).toBeGreaterThanOrEqual(30);
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 20);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2, edge.y - 60, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("app-grid")).toBeVisible();
  await page.getByTestId("icon-wire").click();
  await page.mouse.move(4, 400);
  await page.mouse.down();
  await page.mouse.move(150, 400, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("app-grid")).toBeVisible();
  const sb = await box(page, "statusbar");
  await page.mouse.move(sb.x + 200, sb.y + 20);
  await page.mouse.down();
  await page.mouse.move(sb.x + 200, sb.y + 140, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("launcher")).toBeVisible();
  await expect(page.getByTestId("launcher").getByRole("group", { name: "Recent" })).toContainText("Wire");
  expect((await box(page, "launcher-bar")).height).toBe(44);
  await page.getByTestId("launcher-cancel").click();
  await expect(page.getByTestId("launcher")).toHaveCount(0);
});

test("S1-16 phone overlays: Recent sheet and launcher under reduced motion + transparency", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Set reduced transparency first (the Held overlay blocks input), then reload into the Held state.
  await boot(page, "/settings");
  await page.locator("select").nth(1).selectOption("on");
  await boot(page, "/?held=1");
  await expect(page.getByTestId("overlay-held")).toBeVisible();
  const bad = () => page.evaluate(() => Array.from(document.querySelectorAll("*")).filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
    if (el.classList.contains("tickring-sweep")) return false;
    return [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].some((d) => parseFloat(d) > 0);
  }).map((e) => e.className));
  expect(await bad()).toEqual([]);
  const mark = await box(page, "quay-mark");
  await page.mouse.move(mark.x + 10, mark.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  await expect(page.getByTestId("recent")).toBeVisible();
  expect(await bad()).toEqual([]);
  await page.keyboard.press("Escape");
  const sb = await box(page, "statusbar");
  await page.mouse.move(sb.x + 200, sb.y + 20);
  await page.mouse.down();
  await page.mouse.move(sb.x + 200, sb.y + 140, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("launcher")).toBeVisible();
  expect(await bad()).toEqual([]);
});
