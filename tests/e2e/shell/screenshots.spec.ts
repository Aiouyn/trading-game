import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { boot, setTextScale } from "./helpers";

// S1-22: screenshots of home, launcher, a locked tile and a ComingLater window. Run with SHOTS=1.
const OUT = process.env.SHOTS_DIR ?? "tests/e2e/shell/__screenshots__";
test.skip(!process.env.SHOTS, "set SHOTS=1 to capture screenshots");

async function four(page: Page, prefix: string, phone: boolean) {
  mkdirSync(OUT, { recursive: true });
  await boot(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${prefix}-home.png` });
  if (phone) {
    const sb = await page.getByTestId("statusbar").boundingBox();
    if (sb) { await page.mouse.move(200, sb.y + 20); await page.mouse.down(); await page.mouse.move(200, sb.y + 140, { steps: 4 }); await page.mouse.up(); }
  } else {
    await page.keyboard.press("Control+k");
  }
  await page.screenshot({ path: `${OUT}/${prefix}-launcher-recent.png` });
  await page.getByRole("combobox", { name: "Find an app, a ticker, a command" }).fill("po");
  await page.screenshot({ path: `${OUT}/${prefix}-launcher.png` });
  await boot(page, "/?rank=R1&nw=30000");
  if (!phone) await page.getByTestId("tile-quantlab").hover();
  await page.screenshot({ path: `${OUT}/${prefix}-locked-tile.png` });
  await boot(page, "/markets");
  await page.screenshot({ path: `${OUT}/${prefix}-coming-later.png` });
  // Shadow sub-palette windows (AI Lab, Security) and the protection chip (mocked active state).
  await boot(page, "/ailab?nw=200000&prot=1");
  if (!phone) await page.getByTestId("tile-security").click();
  await page.screenshot({ path: `${OUT}/${prefix}-shadow-ailab-security${phone ? "-ailab" : ""}.png` });
  if (phone) {
    await boot(page, "/security?prot=1");
    await page.screenshot({ path: `${OUT}/${prefix}-shadow-security.png` });
  }
  await boot(page, "/?prot=1");
  await page.screenshot({ path: `${OUT}/${prefix}-protection-chip.png` });
  // §5 boot (R0, 900 ms), error and offline states.
  await page.goto("/?rank=R0");
  await page.getByTestId("boot").waitFor();
  await page.screenshot({ path: `${OUT}/${prefix}-boot.png` });
  await boot(page, "/?load=fail");
  await page.screenshot({ path: `${OUT}/${prefix}-load-error.png` });
  await boot(page, "/");
  await page.context().setOffline(true);
  await page.getByTestId("offline-state").waitFor();
  await page.screenshot({ path: `${OUT}/${prefix}-offline.png` });
  await page.context().setOffline(false);
}

test("desktop 1440×900 and 1280×800", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop");
  await four(page, "desktop-1440x900", false);
  // 1280 gets a fresh context (empty IndexedDB), so it never reuses the windows the 1440 pass opened.
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
  await four(await ctx.newPage(), "desktop-1280x800", false);
  await ctx.close();
});

test("phone 390×844", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await four(page, "phone-390x844", true);
  // Offline banner at 320 / 390 and text scale 1.0 / 2.0 (QA round 7), via the real textScale setting.
  for (const width of [320, 390]) {
    for (const scale of ["1", "2"]) {
      await page.setViewportSize({ width, height: 844 });
      await boot(page, "/settings");
      await setTextScale(page, scale);
      await page.context().setOffline(true); // inside an open app (Settings)
      await page.getByTestId("offline-state").waitFor();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/phone-${width}x844-offline-scale${scale}-inapp.png` });
      await page.context().setOffline(false);
      await page.getByTestId("offline-state").waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Back" }).click();
      await page.context().setOffline(true);
      await page.getByTestId("offline-state").waitFor();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/phone-${width}x844-offline-scale${scale}.png` });
      await page.context().setOffline(false);
    }
  }
});
