import { expect, test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

const businessBaseUrl = process.env.BUSINESS_BASE_URL || "";

test.describe("business surface smoke test", () => {
  test("/business loads without hard errors", async ({ page }) => {
    await page.goto(`${businessBaseUrl}/business`, { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);
    await expect(page.getByText(/business|claim|plans/i).first()).toBeVisible();
  });

  test("/business/claim loads claim options without hard errors", async ({ page }) => {
    await page.goto(`${businessBaseUrl}/business/claim`, { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);
    await expect(page.getByText(/claim|qr|code|business|location/i).first()).toBeVisible();
  });
});
