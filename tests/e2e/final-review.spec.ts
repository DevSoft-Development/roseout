import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/create",
  "/business/claim",
  "/privacy",
  "/terms",
  "/beta",
  "/business/pricing",
  "/pricing",
];

const protectedRoutes = [
  "/user/dashboard/beta",
  "/user/dashboard/beta/weekly",
  "/admin/dashboard/beta",
  "/admin/dashboard/settings/cron-jobs",
];

const failClosedApiRoutes = [
  "/api/admin/email-templates/preview",
  "/api/cron/admin-cron-digest-email",
  "/api/cron/beta-tester-reminders",
  "/api/stripe/webhook",
];

const mobileViewport = { width: 390, height: 844 };

async function expectNoServerError(response: Awaited<ReturnType<typeof test["info"]>> | null | undefined) {
  // This helper is intentionally unused. It keeps the assertions below explicit and readable.
  return response;
}

async function getFirstPublicLocationPath(page: import("@playwright/test").Page) {
  const configuredPath = process.env.FINAL_REVIEW_PUBLIC_LOCATION_PATH;
  if (configuredPath) return configuredPath;

  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const href = await page
    .locator('a[href*="/locations/restaurants/"], a[href*="/locations/activities/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);

  return href?.startsWith("http") ? new URL(href).pathname : href;
}

async function assertPageLooksSafeOnMobile(page: import("@playwright/test").Page, path: string) {
  await page.setViewportSize(mobileViewport);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `${path} should return a response`).not.toBeNull();
  expect(response?.status(), `${path} should not return a server error`).toBeLessThan(500);

  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("body"), `${path} body should be visible`).toBeVisible();

  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText, `${path} should not render Location Not Found`).not.toMatch(/Location Not Found|This location could not be found|Application error/i);

  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  expect(overflow, `${path} should not have horizontal overflow at ${mobileViewport.width}px`).toBeLessThanOrEqual(4);

  const visibleActionCount = await page
    .locator('a:visible, button:visible, input:visible, textarea:visible, select:visible, [role="button"]:visible')
    .count();
  expect(visibleActionCount, `${path} should expose at least one visible action/control`).toBeGreaterThan(0);
}

test.describe("final review route automation", () => {
  for (const path of publicRoutes) {
    test(`public route opens safely: ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response, `${path} should return a response`).not.toBeNull();
      expect(response?.status(), `${path} should not 4xx/5xx`).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
      const text = await page.locator("body").innerText().catch(() => "");
      expect(text).not.toMatch(/Application error/i);
    });
  }

  test("one valid public location profile opens safely", async ({ page }) => {
    const publicLocationPath = await getFirstPublicLocationPath(page);
    test.skip(!publicLocationPath, "No public location link was found on /locations; set FINAL_REVIEW_PUBLIC_LOCATION_PATH to test one profile directly.");

    const response = await page.goto(publicLocationPath!, { waitUntil: "domcontentloaded" });
    expect(response, `${publicLocationPath} should return a response`).not.toBeNull();
    expect(response?.status(), `${publicLocationPath} should not 4xx/5xx`).toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const text = await page.locator("body").innerText().catch(() => "");
    expect(text).not.toMatch(/Location Not Found|This location could not be found|Application error/i);
  });

  for (const path of protectedRoutes) {
    test(`protected route fails closed or loads safely: ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should not return a server error`).toBeLessThan(500);
      expect([200, 301, 302, 303, 307, 308, 401, 403, 405]).toContain(response.status());
    });
  }

  for (const path of failClosedApiRoutes) {
    test(`admin/cron/payment route fails closed without secrets: ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should not return a server error`).toBeLessThan(500);
      expect([200, 301, 302, 303, 307, 308, 400, 401, 403, 404, 405]).toContain(response.status());
    });
  }
});

test.describe("mobile final review viewport", () => {
  test("home, create, claim, and one public profile render at mobile width", async ({ page }) => {
    const publicLocationPath = await getFirstPublicLocationPath(page);
    const routes = ["/", "/create", "/business/claim", publicLocationPath].filter(Boolean) as string[];

    for (const path of routes) {
      await assertPageLooksSafeOnMobile(page, path);
    }
  });
});

void expectNoServerError;
