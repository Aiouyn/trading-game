// M1-11: with nothing set, out-of-scope paths are unreachable on desktop and phone.
// Does not use shell boot() — that helper turns the shroud flags on for the 17 shell specs.
import { expect, test } from "@playwright/test";
import { SHROUD, SHROUDED_API } from "../../../src/shell/v1Shroud";

const PATHS = SHROUD.flatMap((e) => e.paths.map((p) => ({ path: `/${p}`, flag: e.flag })));
const IN_SCOPE = ["/", "/broker", "/portfolio", "/wire", "/boards", "/city", "/launchpad", "/settings"];

async function ready(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("quay-ready")).toBeVisible();
}

test.describe("default flags", () => {
  test("nav omits shrouded apps and still offers the V1 ones", async ({ page }, info) => {
    await page.goto("/");
    await ready(page);
    for (const entry of SHROUD) for (const app of entry.apps) {
      await expect(page.getByTestId(`tile-${app}`)).toHaveCount(0);
      await expect(page.getByTestId(`icon-${app}`)).toHaveCount(0);
    }
    const broker = info.project.name === "phone" ? page.getByTestId("icon-broker") : page.getByTestId("tile-broker");
    await expect(broker).toBeVisible();
    const launchpad = info.project.name === "phone" ? page.getByTestId("icon-launchpad") : page.getByTestId("tile-launchpad");
    await expect(launchpad).toBeVisible();
    if (info.project.name === "desktop") {
      await page.getByTestId("layout-btn").click();
      await expect(page.getByTestId("layout-trade")).toBeVisible();
      await expect(page.getByTestId("layout-review")).toBeVisible();
      for (const id of ["research", "operator", "shadow", "institution"]) {
        await expect(page.getByTestId(`layout-${id}`)).toHaveCount(0);
      }
    }
  });

  for (const { path } of PATHS) {
    test(`${path} is 404`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByTestId("quay-ready")).toHaveCount(0);
    });
  }

  test("a deeper bank path is 404", async ({ page }) => {
    const res = await page.goto("/bank/desk");
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("quay-ready")).toHaveCount(0);
  });

  test("backslash, leftover escapes, .json, NUL and a locale prefix are 404", async ({ page, request }) => {
    const paths = ["/bank%5Cdesk", "/api/bank%5Cdraw", "/bank.json", "/bank%00", "/en/bank", "/bank%252525252Fdesk"];
    for (const path of paths) {
      expect((await request.get(path)).status(), path).toBe(404);
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByTestId("quay-ready"), path).toHaveCount(0);
    }
  });

  test("case, encoded slashes and .rsc do not return the shell", async ({ page }) => {
    for (const path of ["/Bank", "/api/Bank", "/api/bank%2Fdraw", "/bank%2Fdesk", "/bank.rsc"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByTestId("quay-ready"), path).toHaveCount(0);
    }
  });

  test("in-scope pages still open", async ({ page }) => {
    for (const path of IN_SCOPE) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await ready(page);
    }
  });

  test("shrouded API prefixes 404 on GET and POST", async ({ request }) => {
    const prefixes = [...new Set(SHROUDED_API.map((g) => g.path))];
    for (const path of prefixes) {
      expect((await request.get(path)).status(), `GET ${path}`).toBe(404);
      expect((await request.post(path, { data: { amount: 1 } })).status(), `POST ${path}`).toBe(404);
    }
  });

  test("the world API still answers", async ({ request }) => {
    expect((await request.get("/api/world")).status()).toBe(200);
  });
});

test.describe("flag on", () => {
  test("v1.banks opens Bank", async ({ page }) => {
    const res = await page.goto("/bank?flags=v1.banks");
    expect(res?.status()).toBe(200);
    await ready(page);
    await expect(page.getByTestId("coming-later").filter({ hasText: "Bank" })).toBeVisible();
  });

  test("v1.ailab opens AI Lab", async ({ page }) => {
    const res = await page.goto("/ailab?flags=v1.ailab&nw=200000");
    expect(res?.status()).toBe(200);
    await ready(page);
    await expect(page.getByTestId("coming-later").filter({ hasText: "AI Lab" })).toBeVisible();
  });

  test("v1.politics opens Civic", async ({ page }) => {
    const res = await page.goto("/civic?flags=v1.politics");
    expect(res?.status()).toBe(200);
    await ready(page);
    await expect(page.getByTestId("coming-later").filter({ hasText: "Civic" })).toBeVisible();
  });

  test("v1.whale stops 404ing the reserved path", async ({ page }) => {
    const res = await page.goto("/whale?flags=v1.whale");
    expect(res?.status()).toBe(200);
    await ready(page);
  });

  test("a different flag does not open Bank", async ({ page }) => {
    const res = await page.goto("/bank?flags=v1.ailab");
    expect(res?.status()).toBe(404);
  });
});
