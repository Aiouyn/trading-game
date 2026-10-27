// UI card 1 · Wire feed (WIR-A) on the mock `news` channel: WIR-1-02 … 07, 09, 10 in a real browser.
// WIR-1-01 / 08 / 11 are unit tests (tests/unit/17b/WIR-A-*). Screenshots go to $WIRE_SHOTS (PR evidence) or test-results.
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { boot, bootPaused } from "../shell/helpers";

const SHOTS = process.env.WIRE_SHOTS ?? "test-results/wire-feed";
const TICK_MS = 5000;
const ROTATION_MS = 12 * TICK_MS; // one rotation item every NEWS_EVERY = 12 ticks
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const isPhone = (info: TestInfo) => info.project.name === "phone";

/** The Wire root: the desktop window or the phone app view. */
const wire = (page: Page) => page.getByTestId("wire");
const rows = (page: Page) => page.getByTestId("wire-row");
const row = (page: Page, id: string) => page.locator(`[data-testid=wire-row][data-id="${id}"]`);

async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
/** Resolve a CSS colour expression in the Wire's context (so palette tokens apply). */
const resolve = (page: Page, v: string) => wire(page).evaluate((el, value) => {
  const p = document.createElement("i"); p.style.color = value; el.append(p);
  const c = getComputedStyle(p).color; p.remove(); return c;
}, v);
async function setPalette(page: Page, palette: string) {
  await page.evaluate((p) => { document.documentElement.dataset.palette = p; }, palette);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.palette)).toBe(palette);
}
/** Hit box of a control: its rect grown to its ::after hit area (centered); `vis` is the visible part (a chip's face). */
const hitBox = (l: Locator) => l.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const a = getComputedStyle(el, "::after");
  const w = Math.max(r.width, parseFloat(a.width) || 0), h = Math.max(r.height, parseFloat(a.height) || 0);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const v = (el.querySelector(".wire-chip-face") ?? el).getBoundingClientRect();
  return { x: cx - w / 2, y: cy - h / 2, w, h, vis: { w: v.width, h: v.height } };
});
/** Every probe point just inside the hit box lands on the control (or a child). */
const hitsAt = (l: Locator) => l.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const a = getComputedStyle(el, "::after");
  const w = Math.max(r.width, parseFloat(a.width) || 0), h = Math.max(r.height, parseFloat(a.height) || 0);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pts = [[cx, cy - h / 2 + 1], [cx, cy + h / 2 - 1], [cx - w / 2 + 1, cy], [cx + w / 2 - 1, cy]];
  return pts.every(([x, y]) => { const hit = document.elementFromPoint(x!, y!); return !!hit && (hit === el || el.contains(hit)); });
});
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

async function expectHitAreas(page: Page, min: number) {
  const chips = page.getByTestId("wire-filters").getByRole("radio");
  const vw = page.viewportSize()!.width;
  const boxes = [];
  for (const c of await chips.all()) {
    const b = await hitBox(c);
    if (b.x < 0 || b.x + b.w > vw) continue; // scrolled out of the phone chip row
    expect(b.w, await c.textContent() ?? "").toBeGreaterThanOrEqual(min);
    expect(b.h).toBeGreaterThanOrEqual(min);
    expect(b.vis.h).toBeLessThan(min); // invisible: the chip itself does not grow
    expect(await hitsAt(c), `hit probe ${await c.textContent()}`).toBe(true);
    boxes.push(b);
  }
  expect(boxes.length).toBeGreaterThan(2);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `chips ${i}/${j}`).toBe(false);
}

/** Boot on a paused fake clock, then step it so React reveals the lazy Wire chunk (Suspense throttles on timers)
 * and its first snapshot (SNAP_DELAY_MS) lands. */
async function bootWirePaused(page: Page, path: string) {
  await bootPaused(page, path);
  await expect.poll(async () => { await page.clock.runFor(100); return wire(page).count(); }, { timeout: 15_000 }).toBe(1);
  await page.clock.runFor(200);
}
/** Advance the paused fake clock until the list overflows (adds rotation items). */
async function fillUntilScrollable(page: Page) {
  const list = page.getByTestId("wire-list");
  for (let i = 0; i < 12; i++) {
    if (await list.evaluate((l) => l.scrollHeight > l.clientHeight + 80)) return;
    await page.clock.runFor(ROTATION_MS);
  }
  throw new Error("wire list never overflowed");
}

test.describe("WIR-A wire feed", () => {
  test("WIR-1-02 kind chips: FILING = --acc, RUMOR dashed, no --signal anywhere on a row (4 palettes)", async ({ page }) => {
    await boot(page, "/wire?tier=terminal");
    await expect(rows(page)).toHaveCount(4);
    for (const p of PALETTES) {
      await setPalette(page, p);
      const acc = await resolve(page, "var(--acc)");
      const signal = await resolve(page, "var(--signal)");
      const filing = row(page, "n-3").getByTestId("wire-kind");
      await expect(filing, p).toHaveCSS("color", acc);
      await expect(row(page, "n-2").getByTestId("wire-kind"), p).toHaveCSS("border-top-style", "dashed");
      await expect(row(page, "n-1").getByTestId("wire-kind"), p).toHaveCSS("border-top-style", "solid");
      const hits = await wire(page).evaluate((root, sig) => {
        const out: string[] = [];
        for (const el of root.querySelectorAll("[data-testid=wire-row], [data-testid=wire-row] *")) {
          const cs = getComputedStyle(el);
          for (const prop of ["color", "background-color", "border-top-color", "border-left-color", "outline-color", "fill", "stroke"] as const) {
            if (cs.getPropertyValue(prop) === sig && !(prop.startsWith("border") && cs.getPropertyValue(prop.replace("color", "width")) === "0px")) out.push(`${el.className}:${prop}`);
          }
        }
        return out;
      }, signal);
      expect(hits, `${p} --signal ${signal}`).toEqual([]);
    }
  });

  test("WIR-1-03 terminal tier: priced-in band + 'as of'; free tier: nothing; never a %", async ({ page }) => {
    await boot(page, "/wire?tier=terminal");
    await expect(row(page, "n-1").getByTestId("wire-priced-band")).toHaveText("Mid");
    await expect(row(page, "n-4").getByTestId("wire-priced-band")).toHaveText("Early");
    await expect(row(page, "n-1").getByTestId("wire-asof")).toHaveText(/^as of Day \d+ · \d\d:\d\d$/);
    await expect(row(page, "n-3").getByTestId("wire-priced")).toHaveCount(0); // FILING
    expect(await wire(page).innerText()).not.toMatch(/\d+\s?%/);
    await boot(page, "/wire");
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator("[data-testid=wire-priced], [data-testid=wire-asof], [data-testid=wire-priced-band]")).toHaveCount(0);
    expect(await wire(page).innerText()).not.toMatch(/\d+\s?%/);
  });

  test("WIR-1-04 source record: n-2 3/7 Mixed, rotation STATEMENT 9/10 Solid, n-1 neither; bands not acc/gain/loss", async ({ page }) => {
    await bootWirePaused(page, "/wire");
    await expect(rows(page)).toHaveCount(4);
    await expect(row(page, "n-2").getByTestId("wire-record")).toHaveText("Source record 3/7");
    await expect(row(page, "n-2").getByTestId("wire-band")).toHaveText("Mixed");
    await expect(row(page, "n-1").locator("[data-testid=wire-record], [data-testid=wire-band]")).toHaveCount(0);
    await page.clock.runFor(ROTATION_MS);
    const st = page.locator("[data-testid=wire-row][data-kind=STATEMENT]");
    await expect(st).toHaveCount(1);
    await expect(st.getByTestId("wire-record")).toHaveText("Source record 9/10");
    await expect(st.getByTestId("wire-band")).toHaveText("Solid");
    for (const p of PALETTES) {
      await setPalette(page, p);
      const banned = await Promise.all(["var(--acc)", "var(--gain)", "var(--loss)"].map((v) => resolve(page, v)));
      for (const band of await page.getByTestId("wire-band").all()) {
        for (const prop of ["color", "border-top-color", "background-color"]) {
          expect(banned, `${p} ${prop}`).not.toContain(await band.evaluate((el, pr) => getComputedStyle(el).getPropertyValue(pr), prop));
        }
        await expect(band).toHaveCSS("border-top-color", await resolve(page, "var(--steel)"));
        await expect(band).toHaveCSS("color", await resolve(page, "var(--fg)"));
      }
    }
  });

  test("WIR-1-05 breaking strip: n-4 shows 'Breaking'; absent with no breaking item", async ({ page }) => {
    await boot(page, "/wire");
    const strip = page.getByTestId("wire-breaking");
    await expect(strip).toHaveAttribute("data-id", "n-4");
    await expect(strip).toContainText("Breaking");
    await expect(strip).toContainText("Block trade: 50000 KILN");
    const b = (await strip.boundingBox())!;
    expect(Math.round(b.height)).toBe(32);
    await expect(strip).toHaveCSS("border-left-width", "3px");
    await expect(strip).toHaveCSS("border-left-color", await resolve(page, "var(--loss)"));
    await expect(strip).toHaveCSS("background-color", await resolve(page, "var(--win2)"));
    await expect(strip.locator("svg")).toHaveCount(1);
    await boot(page, "/wire?empty=1");
    await expect(page.getByTestId("wire-empty")).toBeVisible();
    await expect(page.getByTestId("wire-breaking")).toHaveCount(0);
  });

  test("WIR-1-06 scrolled down an insert has CLS 0 and shows '1 new'; tapping scrolls to top", async ({ page }) => {
    await bootWirePaused(page, "/wire");
    await expect(rows(page)).toHaveCount(4);
    await fillUntilScrollable(page);
    const before = await rows(page).count();
    const list = page.getByTestId("wire-list");
    await list.evaluate((l) => { l.scrollTop = 60; l.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => list.evaluate((l) => l.scrollTop)).toBeGreaterThan(0);
    const firstY = (await rows(page).first().boundingBox())!.y;
    await page.evaluate(() => {
      const w = window as Window & { __cls?: number };
      w.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls! += e.value; })
        .observe({ type: "layout-shift", buffered: false });
    });
    await page.clock.runFor(ROTATION_MS);
    const pill = page.getByTestId("wire-new-pill");
    await expect(pill).toHaveText("1 new");
    await expect(rows(page)).toHaveCount(before); // held back
    expect((await rows(page).first().boundingBox())!.y).toBe(firstY);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as Window & { __cls?: number }).__cls)).toBe(0);
    await expect(page.locator("[data-testid=wire] [aria-live]")).toHaveCount(1);
    await expect(pill.locator("xpath=..")).toHaveAttribute("aria-live", "polite");
    await pill.click();
    await expect.poll(() => list.evaluate((l) => l.scrollTop)).toBe(0);
    await expect(pill).toHaveCount(0);
    await expect(rows(page)).toHaveCount(before + 1);
  });

  test("WIR-1-06 at the top a new row fades in over --dur-base; reduced motion inserts instantly", async ({ page }) => {
    await bootWirePaused(page, "/wire");
    await expect(rows(page)).toHaveCount(4);
    await page.clock.runFor(ROTATION_MS);
    await expect(rows(page)).toHaveCount(5);
    await expect(rows(page).first()).toHaveClass(/is-new/);
    await expect(rows(page).first()).toHaveCSS("animation-duration", "0.22s");
    await expect(rows(page).first()).toHaveCSS("animation-name", "wire-in");
    await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; }); // as the shell's reduced-motion pref sets it
    await page.clock.runFor(ROTATION_MS);
    await expect(rows(page)).toHaveCount(6);
    await expect(rows(page).first()).toHaveCSS("animation-duration", "0s");
    await expect(rows(page).first()).toHaveCSS("transition-duration", "0s");
  });

  test("WIR-1-07 states render their copy", async ({ page }) => {
    await boot(page, "/wire?feed=loading");
    await expect(page.getByTestId("wire-skeleton")).toHaveCount(3);
    for (const s of await page.getByTestId("wire-skeleton").all()) await expect(s).toHaveCSS("background-color", await resolve(page, "var(--win2)"));
    await boot(page, "/wire?feed=denied");
    await expect(page.getByTestId("wire-denied")).toHaveText("Wire isn't available on this account.");
    await boot(page, "/wire?feed=error");
    await expect(page.getByTestId("wire-error")).toContainText("Couldn't load");
    await expect(page.getByTestId("wire-retry")).toHaveText("Retry");
    await boot(page, "/wire?empty=1");
    await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
    await boot(page, "/wire");
    await page.getByTestId("wire-filter-verdicts").click();
    await expect(page.getByTestId("wire-filter-verdicts")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("wire-empty")).toHaveText("Nothing in this filter yet.");
    await bootWirePaused(page, "/wire?feed=stale");
    await expect(rows(page)).toHaveCount(4);
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) { await page.clock.runFor(TICK_MS); seen = await page.getByTestId("wire-updating").isVisible(); }
    expect(seen).toBe(true);
    await expect(page.getByTestId("wire-updating")).toHaveText("Updating…");
    await expect(rows(page)).toHaveCount(4); // list stays
  });

  test("WIR-1-09 desktop rows, chips, strip in Ink & Brass and Broadsheet; hit areas ≥ 28", async ({ page }, info) => {
    test.skip(isPhone(info), "desktop");
    await boot(page, "/wire");
    await expect(page.getByTestId("win-wire")).toBeVisible();
    for (const p of ["ink-brass", "broadsheet"]) {
      await setPalette(page, p);
      expect((await wire(page).boundingBox())!.width).toBeGreaterThanOrEqual(520);
      const ys = new Set<number>();
      for (const c of await page.getByTestId("wire-filters").getByRole("radio").all()) ys.add(Math.round((await c.boundingBox())!.y));
      expect(ys.size, "chip rows").toBeLessThanOrEqual(2);
      for (const r of await rows(page).all()) {
        const rb = (await r.boundingBox())!;
        expect(rb.height).toBeGreaterThanOrEqual(40);
        await expect(r).toHaveCSS("border-bottom-color", await resolve(page, "var(--line)"));
        await expect(r).toHaveCSS("background-color", await resolve(page, "var(--win)"));
        const kind = (await r.locator(".wire-row-kind").boundingBox())!;
        const hl = (await r.getByTestId("wire-headline").boundingBox())!;
        const time = (await r.getByTestId("wire-time").boundingBox())!;
        expect(Math.round(kind.width)).toBe(96);
        expect(hl.x).toBeGreaterThan(kind.x + 95);
        expect(time.x + time.width).toBeCloseTo(rb.x + rb.width - 16, 0); // right-aligned
        await expect(r.getByTestId("wire-time")).toHaveCSS("color", await resolve(page, "var(--fg-muted)"));
      }
      const sel = page.getByTestId("wire-filter-all");
      await expect(sel).toHaveAttribute("aria-checked", "true");
      await expect(sel.locator(".wire-chip-face")).toHaveCSS("background-color", await resolve(page, "var(--win2)"));
      await expect(sel).toHaveCSS("color", await resolve(page, "var(--fg)"));
      await expect(page.getByTestId("wire-filter-news")).toHaveCSS("color", await resolve(page, "var(--fg-muted)"));
      await expect(page.getByTestId("wire-filter-news").locator(".wire-chip-face")).toHaveCSS("border-top-color", await resolve(page, "var(--line)"));
      await expect(page.getByTestId("wire-breaking")).toBeVisible();
      await expectHitAreas(page, 28);
    }
  });

  test("WIR-1-09 keyboard: chips are a radiogroup with arrow keys", async ({ page }, info) => {
    test.skip(isPhone(info), "desktop");
    await boot(page, "/wire");
    await page.getByTestId("wire-filter-all").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("wire-filter-news")).toBeFocused();
    await expect(page.getByTestId("wire-filter-news")).toHaveAttribute("aria-checked", "true");
    await expect(rows(page)).toHaveCount(1);
  });

  for (const scale of ["1", "2"]) {
    test(`WIR-1-10 phone at text scale ${scale}: chips scroll, no page overflow, no mid-word break, hits ≥ 44, no overlap`, async ({ page }, info) => {
      test.skip(!isPhone(info), "phone");
      await boot(page, "/wire?tier=terminal");
      await page.evaluate((s) => document.documentElement.style.setProperty("--text-scale", s), scale);
      await expect(rows(page)).toHaveCount(4);
      const chipRow = page.getByTestId("wire-filters");
      expect(await chipRow.evaluate((c) => c.scrollWidth > c.clientWidth)).toBe(true);
      await chipRow.evaluate((c) => { c.scrollLeft = 120; });
      expect(await chipRow.evaluate((c) => c.scrollLeft)).toBeGreaterThan(0);
      await chipRow.evaluate((c) => { c.scrollLeft = 0; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const midWord = await page.getByTestId("wire-headline").evaluateAll((els) => els.flatMap((el) => {
        const node = el.firstChild!; const txt = node.textContent ?? ""; const bad: string[] = [];
        for (const m of txt.matchAll(/\S+/g)) {
          const r = document.createRange(); r.setStart(node, m.index!); r.setEnd(node, m.index! + m[0].length);
          const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
          if (lines.size > 1) bad.push(m[0]);
        }
        const b = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 1 || b.right > window.innerWidth) bad.push(`overflow:${txt}`);
        return bad;
      }));
      expect(midWord).toEqual([]);
      if (scale === "2") expect(await page.getByTestId("wire-headline").evaluateAll((els) => els.some((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().height > 40))).toBe(true); // wraps
      for (const r of await rows(page).all()) {
        const parts = [];
        for (const sel of [".wire-row-kind .chip", "[data-testid=wire-time]", "[data-testid=wire-headline]", ".wire-row-meta"]) {
          const b = await r.locator(sel).boundingBox(); if (b) parts.push({ x: b.x, y: b.y, w: b.width, h: b.height });
        }
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(overlap(parts[i]!, parts[j]!), `row parts ${i}/${j}`).toBe(false);
        // stacked: chip + time on line 1, headline under them
        expect(parts[2]!.y).toBeGreaterThanOrEqual(Math.max(parts[0]!.y + parts[0]!.h, parts[1]!.y + parts[1]!.h) - 0.5);
      }
      await expectHitAreas(page, 44);
    });
  }

  test("WIR-1-10 phone: chip row has a 16 px --win fade at both edges", async ({ page }, info) => {
    test.skip(!isPhone(info), "phone");
    await boot(page, "/wire");
    const win = await resolve(page, "var(--win)");
    const fades = await page.locator(".wire-filters").evaluate((el) => ["::before", "::after"].map((p) => { const s = getComputedStyle(el, p); return { w: s.width, bg: s.backgroundImage }; }));
    for (const f of fades) { expect(f.w).toBe("16px"); expect(f.bg).toContain(win); }
  });

  test("WIR-1-06 pill hit area: 28 pointer / 44 touch, no visual growth", async ({ page }, info) => {
    await bootWirePaused(page, "/wire");
    await expect(rows(page)).toHaveCount(4);
    await fillUntilScrollable(page);
    await page.getByTestId("wire-list").evaluate((l) => { l.scrollTop = 60; l.dispatchEvent(new Event("scroll")); });
    await page.clock.runFor(ROTATION_MS);
    const pill = page.getByTestId("wire-new-pill");
    await expect(pill).toBeVisible();
    const min = isPhone(info) ? 44 : 28;
    const b = await hitBox(pill);
    expect(b.h).toBeGreaterThanOrEqual(min);
    expect(b.w).toBeGreaterThanOrEqual(min);
    expect(b.vis.h).toBeLessThanOrEqual(28);
    expect(await hitsAt(pill)).toBe(true);
  });
});

test.describe("WIR-A screenshots", () => {
  test("desktop 1440x900", async ({ page }, info) => {
    test.skip(isPhone(info), "desktop");
    await boot(page, "/wire"); await expect(rows(page)).toHaveCount(4);
    await shot(page, "wire-all-free");
    await shot(page, "wire-breaking");
    await page.getByTestId("wire-filter-rumors").click(); await shot(page, "wire-rumors");
    await page.getByTestId("wire-filter-verdicts").click(); await shot(page, "wire-empty-filter");
    await page.getByTestId("wire-filter-all").click();
    await setPalette(page, "broadsheet"); await shot(page, "wire-broadsheet");
    await setPalette(page, "ink-brass");
    await page.evaluate(() => { document.documentElement.dataset.cb = "1"; }); await shot(page, "wire-cb");
    await boot(page, "/wire?tier=terminal"); await expect(rows(page)).toHaveCount(4); await shot(page, "wire-all-terminal");
    await boot(page, "/wire?feed=error"); await expect(page.getByTestId("wire-error")).toBeVisible(); await shot(page, "wire-error");
  });

  test("phone 390x844", async ({ page }, info) => {
    test.skip(!isPhone(info), "phone");
    await boot(page, "/wire?tier=terminal"); await expect(rows(page)).toHaveCount(4);
    await shot(page, "wire-all");
    await page.getByTestId("wire-filter-rumors").click(); await shot(page, "wire-rumors");
    await page.getByTestId("wire-filter-all").click();
    await page.getByTestId("wire-filters").evaluate((c) => { c.scrollLeft = c.scrollWidth; }); await shot(page, "wire-chips-scrolled");
    await page.getByTestId("wire-filters").evaluate((c) => { c.scrollLeft = 0; });
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2")); await shot(page, "wire-text-scale-2");
  });
});
