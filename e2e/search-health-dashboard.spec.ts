import { expect, test } from "@playwright/test";

test.describe("Search Health dashboard", () => {
  test.skip(!process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE, "Requires an authenticated admin storage state");
  test.use({ storageState: process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE });

  test("renders operations and preserves URL filters", async ({ page }) => {
    await page.goto("/admin/dashboard/search-health");
    await expect(page.getByTestId("search-health-dashboard")).toBeVisible();
    await expect(page.getByTestId("search-health-kpis")).toBeVisible();
    await expect(page.getByTestId("recent-searches")).toBeVisible();
    await expect(page.getByTestId("issue-queue")).toBeVisible();
    await page.getByLabel("Search text").fill("dinner");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/q=dinner/);
    const issue = page.locator('[data-testid^="issue-"]').first();
    if (await issue.count()) {
      await issue.click(); await expect(page.getByTestId("issue-detail")).toBeVisible();
      await page.getByRole("link", { name: "Close" }).click(); await expect(page).toHaveURL(/q=dinner/);
    }
  });
});
