import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { boot, box, setReducedTransparency, setTextScale } from "./helpers";

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
  await setTextScale(page, "2");
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
  // Deep link: was /wire until Wire was built (UI card 1, WIR-A); Messages is still ComingLater.
  await boot(page, "/messages");
  await expect(page.getByTestId("coming-later")).toHaveText(/Messages\s*Coming later/);
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
      tags: Array.from(document.querySelectorAll(".phone-app.locked .icon")).map((i) => {
        const t = i.querySelector(".lock-tag")!; const a = t.getBoundingClientRect(); const b = i.getBoundingClientRect();
        return { inside: a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom, size: getComputedStyle(t).fontSize };
      }),
      inside: tag.left >= box.left && tag.right <= box.right && tag.top >= box.top && tag.bottom <= box.bottom,
      muted: probe("--fg-muted"), disabled: probe("--fg-disabled"), acc: probe("--acc"),
    };
  });
  for (const c of r.unlocked) { expect(c).toBe(r.muted); expect(c).not.toBe(r.acc); }
  expect(r.locked).toBe(r.disabled);
  expect(r.inside).toBe(true);
  for (const t of r.tags) expect(t).toEqual({ inside: true, size: "10.5px" });
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

const badNow = (page: import("@playwright/test").Page) => page.evaluate(() => Array.from(document.querySelectorAll("*")).filter((el) => {
  const cs = getComputedStyle(el);
  if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
  if (el.classList.contains("tickring-sweep")) return false;
  return [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].some((d) => parseFloat(d) > 0);
}).map((e) => e.className));

test("S1-16 phone overlays: Recent sheet and launcher under reduced motion + transparency", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-reduced-transparency", value: "reduce" }] });
  const reduced = () => page.evaluate(() => [document.documentElement.dataset.motion, document.documentElement.dataset.transparency]);
  // Boot (R0, 900 ms), the error state and the offline state.
  await page.goto("/?rank=R0");
  await expect(page.getByTestId("boot")).toBeVisible();
  expect(await reduced()).toEqual(["reduce", "reduce"]);
  expect(await badNow(page)).toEqual([]);
  await boot(page, "/?load=fail");
  await expect(page.getByTestId("load-error")).toBeVisible();
  expect(await badNow(page)).toEqual([]);
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  expect(await badNow(page)).toEqual([]);
  await page.context().setOffline(false);
  // Set reduced transparency through Settings too, then the Held state (the overlay blocks input).
  await boot(page, "/settings");
  await setReducedTransparency(page, "On");
  await page.evaluate(() => (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush?.());
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

test("Phone error/offline banner: under the status bar, pushes content down, never covers wealth (Studio round 6)", async ({ page }) => {
  await boot(page, "/");
  const rect = (sel: string) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; });
  const before = await rect("[data-testid=widget]");
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  await expect.poll(async () => (await rect("[data-testid=phone-banner]")).h).toBe(44);
  const banner = await rect("[data-testid=phone-banner]");
  const sb = await rect("[data-testid=statusbar]");
  const label = await rect("[data-testid=widget] .label");
  const chip = await rect("[data-testid=widget] .chip");
  expect(banner.top).toBe(sb.bottom);
  expect(banner.right - banner.left).toBe(390);
  await expect.poll(async () => (await rect("[data-testid=widget]")).top).toBe(before.top + 44 + 8); // content moves down by banner height + the 8 px gap (after the ease)
  for (const r of [label, chip]) expect(r.top).toBeGreaterThanOrEqual(banner.bottom); // never overlaps
  const st = await page.getByTestId("phone-banner").evaluate((e) => {
    const probe = (v: string) => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const cs = getComputedStyle(e); const body = getComputedStyle(e.firstElementChild!); const btn = getComputedStyle(e.querySelector("button")!);
    const bg = document.createElement("i"); bg.style.backgroundColor = "var(--win2)"; document.body.appendChild(bg); const win2 = getComputedStyle(bg).backgroundColor; bg.remove();
    return { bg: cs.backgroundColor, win2, line: cs.boxShadow.includes(probe("--line")) ? probe("--line") : cs.boxShadow, lineTok: probe("--line"), bw: cs.boxShadow.endsWith("0px -1px 0px 0px inset") ? "1px" : cs.boxShadow, text: body.color, muted: probe("--fg-muted"), btn: btn.color, fg: probe("--fg"), ul: btn.textDecorationLine, dur: cs.transitionDuration, prop: cs.transitionProperty };
  });
  expect(st).toEqual({ bg: st.win2, win2: st.win2, line: st.lineTok, lineTok: st.lineTok, bw: "1px", text: st.muted, muted: st.muted, btn: st.fg, fg: st.fg, ul: "underline", dur: "0.12s, 0.12s", prop: "min-height, margin-bottom" });
  await page.context().setOffline(false);
  await expect.poll(async () => (await rect("[data-testid=phone-banner]")).h).toBe(0);
  // Error state uses the same slot.
  await boot(page, "/?load=fail");
  await expect(page.getByTestId("phone-banner").getByTestId("load-error")).toHaveText("Couldn't load · Retry");
});

test("Phone banner appears instantly under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, "/");
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  const h = await page.getByTestId("phone-banner").evaluate((e) => [e.getBoundingClientRect().height, getComputedStyle(e).transitionDuration]);
  expect(h).toEqual([44, "0s"]);
  await page.context().setOffline(false);
});

// §4 hit target, scanned with elementFromPoint: the area that hits Retry, plus the banner and the
// other tap targets it must stay clear of (status bar buttons, app bar buttons).
const retryGeometry = async (page: import("@playwright/test").Page) => {
  // Wait for fonts and for the banner's layout to settle (two identical frames) before measuring.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((res) => {
    const h = () => document.querySelector("[data-testid=phone-banner]")!.getBoundingClientRect().bottom;
    const a = h(); requestAnimationFrame(() => requestAnimationFrame(() => res(a === h())));
  }))).toBe(true);
  return retryGeometryNow(page);
};
const retryGeometryNow = (page: import("@playwright/test").Page) => page.getByTestId("load-retry").evaluate((b) => {
  const r = b.getBoundingClientRect();
  const hits = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); };
  // The tap area is the button's own box (no pseudo-element): it hits just inside every edge and
  // nowhere just outside it.
  const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  const insideHits = [[r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]].every(([x, y]) => hits(x, y));
  const outsideMisses = [[r.left - 1, r.top + r.height / 2], [r.right + 1, r.top + r.height / 2], [r.left + r.width / 2, r.top - 1], [r.left + r.width / 2, r.bottom + 1]].every(([x, y]) => !hits(x, y));
  const banner = b.closest("[data-testid=phone-banner]")!.getBoundingClientRect();
  const others = Array.from(document.querySelectorAll(".statusbar button, .statusbar [role=button], .appbar button, .appbar a"))
    .map((e) => e.getBoundingClientRect());
  // Separation between two boxes: the larger of the horizontal and vertical gaps (negative = overlap).
  const gapTo = (o: DOMRect) => Math.max(o.left - box.right, box.left - o.right, o.top - box.bottom, box.top - o.bottom);
  const gaps = others.map(gapTo);
  return {
    w: box.right - box.left, h: box.bottom - box.top,
    rect: insideHits && outsideMisses,
    inBanner: box.left >= banner.left && box.right <= banner.right && box.top >= banner.top && box.bottom <= banner.bottom,
    inViewport: r.left >= 0 && r.right <= window.innerWidth,
    minGap: others.length ? Math.min(...gaps) : -Infinity,
  };
});

test("Long app title at 320 px, text scale 2.0: one line, ellipsis, truly overflows, clear of the banner and Back", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await boot(page, "/settings");
  await setTextScale(page, "2");
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  // No shipped app name overflows yet, so give the real title element a long name.
  await page.locator(".appbar h1").evaluate((h) => { h.textContent = "Bank & Credit · Institutional Lending Desk"; });
  await page.waitForTimeout(200);
  const r = await page.locator(".appbar h1").evaluate((h) => {
    const cs = getComputedStyle(h); const t = h.getBoundingClientRect();
    const back = document.querySelector(".appbar .icon-btn")!.getBoundingClientRect();
    const banner = document.querySelector("[data-testid=phone-banner]")!.getBoundingClientRect();
    const lh = parseFloat(cs.lineHeight);
    return {
      oneLine: t.height <= lh + 0.5, ellipsis: cs.textOverflow, nowrap: cs.whiteSpace, overflows: h.scrollWidth > h.clientWidth,
      clearOfBanner: t.top >= banner.bottom, clearOfBack: t.left >= back.right, insideViewport: t.right <= window.innerWidth,
    };
  });
  expect(r).toEqual({ oneLine: true, ellipsis: "ellipsis", nowrap: "nowrap", overflows: true, clearOfBanner: true, clearOfBack: true, insideViewport: true });
  await page.context().setOffline(false);
});

for (const width of [390, 320]) {
  for (const scale of ["1", "2"]) {
    test(`Phone banner at ${width} px, text scale ${scale}: Retry 44×44 inside the banner, clear of status bar and app bar, content pushed down (r8)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Inside an open app (Settings, which also sets the real textScale pref)...
      await boot(page, "/settings");
      await setTextScale(page, scale);
      await page.context().setOffline(true);
      await expect(page.getByTestId("offline-state")).toBeVisible();
      await page.waitForTimeout(200); // let the 120 ms ease finish
      const inApp = await retryGeometry(page);
      expect(inApp, `in app ${JSON.stringify(inApp)}`).toMatchObject({ rect: true, inBanner: true, inViewport: true });
      expect(inApp.minGap, "in-app gap to status/app bar targets").toBeGreaterThanOrEqual(8);
      console.log(`GAP ${width} x${scale} in-app ${inApp.minGap}`);
      expect(inApp.w).toBeGreaterThanOrEqual(44);
      expect(inApp.h).toBeGreaterThanOrEqual(44);
      await page.context().setOffline(false);
      await expect(page.getByTestId("offline-state")).toHaveCount(0);
      // ...and on the home screen.
      await page.getByRole("button", { name: "Back" }).click();
      const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
      const before = await top("[data-testid=widget]");
      await page.context().setOffline(true);
      await expect(page.getByTestId("offline-state")).toBeVisible();
      await page.waitForTimeout(200);
      const b = await page.getByTestId("phone-banner").evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, w: r.width }; });
      expect(b.top).toBe(await page.getByTestId("statusbar").evaluate((e) => e.getBoundingClientRect().bottom));
      expect(b.w).toBe(width);
      expect(b.h).toBeGreaterThanOrEqual(44);
      expect(Math.abs((await top("[data-testid=widget]")) - (before + b.h + 8))).toBeLessThanOrEqual(0.5); // pushed by the actual height + 8 px gap
      for (const sel of ["[data-testid=widget] .label", "[data-testid=widget] .chip"]) expect(await top(sel)).toBeGreaterThanOrEqual(b.bottom);
      const home = await retryGeometry(page);
      expect(home, `home ${JSON.stringify(home)}`).toMatchObject({ rect: true, inBanner: true, inViewport: true });
      expect(home.minGap, "home gap to status bar targets").toBeGreaterThanOrEqual(8);
      console.log(`GAP ${width} x${scale} home ${home.minGap}`);
      expect(home.w).toBeGreaterThanOrEqual(44);
      expect(home.h).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.context().setOffline(false);
    });
  }
}

// QA r10: tapping Retry must not move anything. Banner height and content top are measured before the
// tap, in the Retrying… state, and after it settles; all three must be identical (0 px change).
const settled = (page: import("@playwright/test").Page) => expect.poll(() => page.evaluate(() => new Promise<boolean>((res) => {
  const m = () => JSON.stringify(Array.from(document.querySelectorAll("[data-testid=phone-banner], .appbar, [data-testid=widget]")).map((e) => e.getBoundingClientRect().toJSON()));
  const a = m(); requestAnimationFrame(() => requestAnimationFrame(() => res(a === m())));
}))).toBe(true);
const layoutNow = (page: import("@playwright/test").Page, content: string) => page.evaluate((sel) => ({
  banner: document.querySelector("[data-testid=phone-banner]")!.getBoundingClientRect().height,
  content: document.querySelector(sel)!.getBoundingClientRect().top,
  retryW: document.querySelector("[data-testid=load-retry]")!.getBoundingClientRect().width,
}), content);

for (const width of [390, 320]) {
  for (const scale of ["1", "1.5", "2"]) {
    test(`Retry tap moves nothing at ${width} px, text scale ${scale}: offline and error, in app and home (r10)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const tapAndMeasure = async (label: string, content: string) => {
        await settled(page);
        const before = await layoutNow(page, content);
        expect(before.banner, label).toBeGreaterThanOrEqual(44);
        await page.getByTestId("load-retry").click();
        await expect(page.getByTestId("load-retry")).toHaveText("Retrying…");
        const during = await layoutNow(page, content);
        await expect(page.getByTestId("load-retry")).toHaveText("Retry");
        await settled(page);
        const after = await layoutNow(page, content);
        expect(during, `${label} retrying`).toEqual(before);
        expect(after, `${label} after`).toEqual(before);
      };
      for (const state of ["error", "offline"] as const) {
        await boot(page, state === "error" ? "/settings?load=fail" : "/settings");
        await setTextScale(page, scale);
        if (state === "offline") await page.context().setOffline(true);
        await expect(page.getByTestId(state === "error" ? "load-error" : "offline-state")).toBeVisible();
        await tapAndMeasure(`${state} in-app`, ".appbar");
        await page.getByRole("button", { name: "Back" }).click();
        await tapAndMeasure(`${state} home`, "[data-testid=widget]");
        if (state === "offline") await page.context().setOffline(false);
      }
    });
  }
}

test("Retry a11y (QA r11): keeps focus, aria-disabled toggles, a second activation while pending does nothing, the alert text never changes, label left x fixed", async ({ page }) => {
  await boot(page, "/?load=fail&retryMs=1500"); // hold Retrying… long enough to try a second activation
  const retry = page.getByTestId("load-retry");
  // The banner/pill's live region (Next's own route announcer is another role=alert on the page).
  const alert = page.locator("[data-testid=load-message][role=alert]");
  await expect(alert).toHaveCount(1);
  const alertText = await alert.textContent();
  expect(await retry.evaluate((b) => b.closest("[role=alert]"))).toBeNull(); // the button sits outside the live region
  const state = () => page.evaluate(() => {
    const b = document.querySelector("[data-testid=load-retry]")!;
    return {
      focused: document.activeElement === b,
      ariaDisabled: b.getAttribute("aria-disabled"), disabledAttr: b.hasAttribute("disabled"),
      labelLeft: b.querySelector(".load-retry-label")!.getBoundingClientRect().left,
      label: b.querySelector(".load-retry-label")!.textContent,
      alert: document.querySelector("[data-testid=load-message][role=alert]")!.textContent,
      retries: (window as Window & { __quayRetries?: () => number }).__quayRetries?.() ?? -1,
    };
  });
  await retry.focus();
  const s0 = await state();
  expect(s0).toMatchObject({ focused: true, ariaDisabled: "false", disabledAttr: false, label: "Retry", alert: alertText });
  await page.keyboard.press("Enter");
  await expect(retry).toHaveText("Retrying…");
  const s1 = await state();
  expect(s1).toMatchObject({ focused: true, ariaDisabled: "true", disabledAttr: false, label: "Retrying…", alert: alertText, retries: s0.retries + 1 });
  expect(s1.labelLeft).toBe(s0.labelLeft); // Studio 01:05: labels left-aligned in the reserved slot
  await page.keyboard.press("Enter"); // second activation while pending: ignored
  // A real pointer tap (locator.click() would wait for aria-disabled to clear).
  const rb = (await retry.boundingBox())!;
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
  const s1b = await state();
  expect(s1b).toMatchObject({ label: "Retrying…", ariaDisabled: "true", retries: s0.retries + 1 });
  await expect(retry).toHaveText("Retry");
  const s2 = await state();
  expect(s2).toMatchObject({ focused: true, ariaDisabled: "false", disabledAttr: false, alert: alertText, retries: s0.retries + 1 });
  expect(s2.labelLeft).toBe(s0.labelLeft);
});
