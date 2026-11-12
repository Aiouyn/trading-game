// M3-06: the default server (no spend opt-in, kill switch off) answers /api/health.
import { expect, test } from "@playwright/test";

test("GET /api/health reports the local alpha with no paid providers", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    killSwitch: boolean;
    readOnly: boolean;
    spendOptIn: boolean;
    paidProviders: string[];
    tickAutostart: boolean;
  };
  expect(body).toEqual({
    ok: true,
    killSwitch: false,
    readOnly: false,
    spendOptIn: false,
    paidProviders: [],
    tickAutostart: true,
  });
});
