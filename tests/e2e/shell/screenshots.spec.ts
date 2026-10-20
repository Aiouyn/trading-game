import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { boot } from "./helpers";

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
  await page.getByRole("combobox").fill("po");
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

test("desktop 1440×900 and 1280×800", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await four(page, "desktop-1440x900", false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await four(page, "desktop-1280x800", false);
});

test("phone 390×844", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await four(page, "phone-390x844", true);
});
