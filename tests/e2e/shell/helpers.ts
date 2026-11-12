import { expect, type Page } from "@playwright/test";
import { SHROUD_FLAGS } from "../../../src/shell/v1Shroud";

/**
 * Official shell specs open the full registry. Merge the M1-11 shroud flags into `flags=` so those
 * systems stay reachable here. The shroud spec (M1-11) does not call boot(); it visits paths with nothing set.
 */
export function withShroudFlags(path: string): string {
  const u = new URL(path, "http://quay.local");
  const have = (u.searchParams.get("flags") ?? "").split(",").filter(Boolean);
  for (const f of SHROUD_FLAGS) if (!have.includes(f)) have.push(f);
  u.searchParams.set("flags", have.join(","));
  return `${u.pathname}${u.search}${u.hash}`;
}

export async function boot(page: Page, path = "/") {
  await page.goto(withShroudFlags(path));
  await expect(page.getByTestId("quay-ready")).toBeVisible();
}

export async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).first().boundingBox();
  if (!b) throw new Error(`no box for ${testId}`);
  return b;
}

export const intents = (page: Page) =>
  page.evaluate(() => (window as Window & { __quayIntents?: () => unknown[] }).__quayIntents?.().length ?? -1);

/** Settings › Appearance (17B SET-02): on phone, push Appearance first; returns to the Settings list afterwards. */
async function withAppearance(page: Page, fn: () => Promise<void>) {
  const push = page.getByTestId("set-nav-SET-02");
  const phone = (await page.getByTestId("settings").getAttribute("class"))?.includes("settings-phone");
  if (phone) await push.click();
  await fn();
  if (phone) await page.getByRole("button", { name: "Back to Settings" }).click();
}

/** Sets the real textScale pref through the Settings slider (applies on release). */
export async function setTextScale(page: Page, scale: string) {
  await withAppearance(page, async () => {
    const s = page.getByTestId("text-scale");
    await s.fill(scale);
    await s.blur();
  });
}

/** Sets Reduce transparency through the Settings segment. */
export async function setReducedTransparency(page: Page, mode: "System" | "On" | "Off") {
  await withAppearance(page, () => page.getByTestId("seg-reducedTransparency").getByRole("radio", { name: mode, exact: true }).click());
}

/** Deterministic fake-clock boot: install fake timers (running), boot until quay-ready, THEN pause.
 *  Pausing before boot starves the shell's boot timers so quay-ready can never appear (QA #18 flake). */
export async function bootPaused(page: Page, path = "/", time = new Date("2026-10-21T08:00:00Z"), afterInstall?: () => Promise<unknown>) {
  await page.clock.install({ time });
  if (afterInstall) await afterInstall();
  await boot(page, path);
  // The fake clock keeps running between reading it and pausing, so a target can slip into the past;
  // re-read and retry rather than racing it with a fixed margin.
  for (let attempt = 0; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try { await page.clock.pauseAt(new Date(now + 100)); return; }
    catch (e) { if (attempt >= 5 || !String(e).includes("past")) throw e; }
  }
}
