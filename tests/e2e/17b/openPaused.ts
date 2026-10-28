import { expect, type Locator, type Page } from "@playwright/test";
import { bootPaused } from "../shell/helpers";

/**
 * Boot `path` on a paused clock and wait until `broker` is live. The Broker body is a lazy chunk under Suspense, and
 * React 19 throttles a Suspense reveal: content that resolves within 300 ms of the fallback commits on a setTimeout.
 * On the paused clock that timer only fires while the test runs the clock, so a chunk that lands after one fixed
 * `runFor` never shows (BR-5-12 FR phone on CI run 40647665890, BR-6-11 520 on the box). Step the clock until it does.
 */
export async function openBrokerPaused(page: Page, path: string, broker: Locator): Promise<void> {
  await bootPaused(page, path);
  await page.clock.runFor(200);
  await expect.poll(async () => {
    const state = (await broker.count()) > 0 ? await broker.getAttribute("data-state") : null;
    if (state !== "live") await page.clock.runFor(100);
    return state;
  }, { message: "broker live on the paused clock", timeout: 10_000, intervals: [50] }).toBe("live");
}
