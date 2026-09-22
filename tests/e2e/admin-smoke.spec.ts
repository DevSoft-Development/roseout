import { test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

const adminBaseUrl = process.env.ADMIN_BASE_URL || "https://admin.theouthaven.com";

test.describe("admin route smoke test", () => {
  test("/admin/dashboard does not show a hard public crash", async ({ page }) => {
    await page.goto(`${adminBaseUrl}/admin/dashboard`, { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);
  });
});

test("/admin/dashboard/production is protected without a hard public crash", async ({ page }) => {
  await page.goto(`${adminBaseUrl}/admin/dashboard/production`, { waitUntil: "domcontentloaded" });
  await expectNoHardError(page);
});
