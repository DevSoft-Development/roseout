import { expect, test } from "@playwright/test";
import {
  assertDiagnosticsClean, assertNoHardProductionError,
  attachProductionEvidence, collectProductionDiagnostics,
  gotoProductionPage, selectedSurface,
} from "./production-browser-helpers";

// Read-only: never create orders or run payments in production.
test("protected Lounge POS register is available for practice", async ({ browser }, testInfo) => {
  test.skip(!selectedSurface("business"), "Business not selected");
  const state = process.env.PLAYWRIGHT_BUSINESS_STORAGE_STATE;
  const path = process.env.PRODUCTION_POS_DEMO_PATH;
  test.skip(!state, "Business browser authentication state missing");
  test.skip(!path, "Protected POS demo path not configured");
  const origin = process.env.BUSINESS_BASE_URL || "https://business.theouthaven.com";
  const target = new URL(path!, origin);
  expect(target.origin).toBe(new URL(origin).origin);
  expect(target.pathname).toBe("/locations/dashboard/pos/register");
  expect(target.searchParams.get("demo")).toBe("1");
  expect(target.searchParams.get("fromDemoCenter")).toBe("1");
  expect(target.searchParams.get("locationId") || target.searchParams.get("adminLocationId"))
    .toBe("642a2ad6-c144-47b7-b9ff-f89554edf0da");
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  const diagnostics = collectProductionDiagnostics(page, origin);
  try {
    const response = await gotoProductionPage(page, target.toString());
    expect(response?.status() ?? 599).toBeLessThan(400);
    expect(page.url()).not.toMatch(/\/business\/login|\/admin\/login/);
    await expect(page.getByText("Not certified for transactions")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practice register" })).toBeVisible();
    await expect(page.getByLabel("Search POS menu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset practice check" })).toBeVisible();
    await assertNoHardProductionError(page);
    await attachProductionEvidence(page, testInfo, "protected-pos-register", diagnostics);
    assertDiagnosticsClean(diagnostics);
  } finally {
    await context.close();
  }
});
