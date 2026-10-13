import { expect, test } from "@playwright/test";
import {
  assertDiagnosticsClean,
  assertNoHardProductionError,
  attachProductionEvidence,
  collectProductionDiagnostics,
  gotoProductionPage,
  selectedSurface,
} from "./production-browser-helpers";

const LOUNGE_ID = "642a2ad6-c144-47b7-b9ff-f89554edf0da";

// Read-only: use Admin Demo Center's signed handoff; never create orders or run payments.
test("Admin Demo Center handoff opens the protected Lounge practice register", async ({ browser }, testInfo) => {
  test.skip(!selectedSurface("business"), "Business not selected");
  const state = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
  test.skip(!state, "Admin browser authentication state missing");
  const adminOrigin = process.env.ADMIN_BASE_URL || "https://admin.theouthaven.com";
  const businessOrigin = process.env.BUSINESS_BASE_URL || "https://business.theouthaven.com";
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  const diagnostics = collectProductionDiagnostics(page, businessOrigin);
  try {
    const response = await gotoProductionPage(page, `${adminOrigin}/admin/dashboard/settings/demo-center`);
    expect(response?.status() ?? 599).toBeLessThan(400);
    expect(page.url()).not.toMatch(/\/admin\/login(?:\?|$)/i);
    const launch = page.getByRole("link", { name: "Launch practice register" });
    await expect(launch).toBeVisible();
    // Do not log or attach the short-lived signed handoff URL.
    const href = await launch.getAttribute("href");
    expect(href).toBeTruthy();
    const handoff = new URL(href!, adminOrigin);
    expect(handoff.origin).toBe(new URL(businessOrigin).origin);
    expect(handoff.pathname).toBe("/api/internal/admin-demo-handoff");
    expect(handoff.searchParams.get("token")).toBeTruthy();
    const next = handoff.searchParams.get("next");
    expect(next).toBeTruthy();
    const target = new URL(next!, businessOrigin);
    expect(target.pathname).toBe("/locations/dashboard/pos/register");
    expect(target.searchParams.get("demo")).toBe("1");
    expect(target.searchParams.get("fromDemoCenter")).toBe("1");
    expect(target.searchParams.get("locationId")).toBe(LOUNGE_ID);

    await Promise.all([
      page.waitForURL((url) => url.origin === new URL(businessOrigin).origin && url.pathname === target.pathname, { timeout: 30_000 }),
      launch.click(),
    ]);
    expect(page.url()).not.toMatch(/\/business\/login|\/admin\/login/);
    await expect(page.getByText("Not certified for transactions")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practice register" })).toBeVisible();
    await expect(page.getByLabel("Search POS menu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset practice check" })).toBeVisible();
    await assertNoHardProductionError(page);
    await attachProductionEvidence(page, testInfo, "admin-handoff-pos-register", diagnostics);
    assertDiagnosticsClean(diagnostics);
  } finally {
    await context.close();
  }
});
