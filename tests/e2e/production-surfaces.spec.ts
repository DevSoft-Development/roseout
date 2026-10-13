import { expect, test } from "@playwright/test";
import {
  assertDiagnosticsClean,
  assertNoHardProductionError,
  attachProductionEvidence,
  collectProductionDiagnostics,
  gotoProductionPage,
  selectedSurface,
} from "./production-browser-helpers";

const bases = {
  consumer: process.env.CONSUMER_BASE_URL || "https://theouthaven.com",
  admin: process.env.ADMIN_BASE_URL || "https://admin.theouthaven.com",
  business: process.env.BUSINESS_BASE_URL || "https://business.theouthaven.com",
  reserve: process.env.RESERVE_BASE_URL || "https://reserve.theouthaven.com",
};

function canonicalHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const publicSurfaces = [
  {
    name: "consumer",
    baseUrl: bases.consumer,
    path: "/",
    expected: /TheOutHaven|Plan better OUTings/i,
  },
  {
    name: "admin",
    baseUrl: bases.admin,
    path: "/admin/login",
    expected: /Admin sign in|Sign in with Microsoft|TheOutHaven/i,
  },
  {
    name: "business",
    baseUrl: bases.business,
    path: "/business/login",
    expected: /Business|Secure business access|TheOutHaven/i,
  },
  {
    name: "reserve",
    baseUrl: bases.reserve,
    path: "/reserve",
    expected: /TheOutHaven Reserve|Book unforgettable experiences/i,
  },
] as const;

for (const surface of publicSurfaces) {
  test(`${surface.name} production surface renders cleanly`, async ({ page }, testInfo) => {
    test.skip(!selectedSurface(surface.name), `${surface.name} not selected for this run`);

    const diagnostics = collectProductionDiagnostics(page, surface.baseUrl);
    const response = await gotoProductionPage(page, `${surface.baseUrl}${surface.path}`);

    expect(response?.status() ?? 599).toBeLessThan(500);
    expect(canonicalHost(new URL(page.url()).hostname)).toBe(
      canonicalHost(new URL(surface.baseUrl).hostname),
    );
    await expect(page.locator("body")).toContainText(surface.expected);
    await assertNoHardProductionError(page);
    await attachProductionEvidence(page, testInfo, surface.name, diagnostics);
    assertDiagnosticsClean(diagnostics);
  });
}

test("authenticated admin dashboard renders cleanly", async ({ browser }, testInfo) => {
  test.skip(!selectedSurface("admin"), "admin not selected for this run");

  const storageState = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
  test.skip(!storageState, "PLAYWRIGHT_ADMIN_STORAGE_STATE is not configured");

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const diagnostics = collectProductionDiagnostics(page, bases.admin);

  try {
    await gotoProductionPage(page, `${bases.admin}/admin/dashboard`);
    expect(page.url()).not.toMatch(/\/admin\/login/i);
    await assertNoHardProductionError(page);
    await attachProductionEvidence(page, testInfo, "admin-authenticated", diagnostics);
    assertDiagnosticsClean(diagnostics);
  } finally {
    await context.close();
  }
});

test("authenticated Business reservations demo renders its floor resources", async ({
  browser,
}, testInfo) => {
  test.skip(!selectedSurface("business"), "business not selected for this run");

  const storageState = process.env.PLAYWRIGHT_BUSINESS_STORAGE_STATE;
  test.skip(!storageState, "PLAYWRIGHT_BUSINESS_STORAGE_STATE is not configured");

  const demoPath =
    process.env.PRODUCTION_BUSINESS_DEMO_PATH ||
    "/locations/dashboard/reservations?adminLocationId=642a2ad6-c144-47b7-b9ff-f89554edf0da&locationId=642a2ad6-c144-47b7-b9ff-f89554edf0da&type=restaurant&demo=1&fromDemoCenter=1";

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const diagnostics = collectProductionDiagnostics(page, bases.business);

  try {
    await gotoProductionPage(page, `${bases.business}${demoPath}`);
    expect(page.url()).not.toMatch(/\/business\/login|\/login(?:\?|$)/i);
    await assertNoHardProductionError(page);

    await expect(
      page.locator('[aria-label*="seats" i]').first(),
      "expected at least one table, booth, bar, or other seating resource",
    ).toBeVisible({ timeout: 20_000 });

    await attachProductionEvidence(
      page,
      testInfo,
      "business-reservations-demo",
      diagnostics,
    );
    assertDiagnosticsClean(diagnostics);
  } finally {
    await context.close();
  }
});


for (const surface of [
  { name: "consumer", baseUrl: bases.consumer, path: "/" },
  { name: "business", baseUrl: bases.business, path: "/business" },
] as const) {
  for (const width of [390, 768, 1024, 1180, 1280, 1600]) {
    test(`${surface.name} live official logo and header fit at ${width}px`, async ({ page }, testInfo) => {
      test.skip(!selectedSurface(surface.name), `${surface.name} not selected`);
      await page.setViewportSize({ width, height: 900 });
      const response = await gotoProductionPage(page, `${surface.baseUrl}${surface.path}`);
      expect(response?.status() ?? 599).toBeLessThan(400);
      const header = page.locator("header").first();
      const logo = header.getByRole("link", { name: "TheOutHaven home" }).locator("img");
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("src", "/theouthaven-official-logo.png");
      await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const bounds = await logo.boundingBox();
      expect(bounds?.width ?? 0).toBeGreaterThan(90);
      expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width + 1);

      const menu = header.getByRole("button", { name: "Open mobile menu" });
      if (width < 1280) {
        await expect(menu).toBeVisible();
        await menu.click();
        await expect(header.getByRole("link", { name: "Discover" })).toBeVisible();
        await header.getByRole("button", { name: "Close mobile menu" }).click();
      } else {
        await expect(menu).toBeHidden();
        const labels = surface.name === "consumer"
          ? ["Discover", "Create Outing", "Saved Outings", "Support", "For Businesses"]
          : ["Discover", "Create Outing", "Support", "Business Home"];
        for (const label of labels) {
          const link = header.getByRole("link", { name: label, exact: true });
          await expect(link).toBeVisible();
          expect(await link.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await testInfo.attach(`${surface.name}-header-${width}.png`, {
        body: await header.screenshot(),
        contentType: "image/png",
      });
    });
  }
}
