import { expect, test } from "@playwright/test";

test("Create Outing header link returns to homepage planner", async ({ page }) => {
  await page.goto("/about");
  await page.getByRole("link", { name: "Create Outing" }).click();
  await expect(page).toHaveURL(/\/#plan-your-outing$/);
  await expect(page.getByLabel("Describe your outing")).toBeVisible();
});
