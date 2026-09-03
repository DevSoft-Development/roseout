import { expect, test } from "@playwright/test";

test("homepage prompt opens Make It Yours before results", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your outing").fill("Date night in Brooklyn");
  await page.getByRole("button", { name: "Plan my outing" }).click();
  await expect(page).toHaveURL(/from=home/);
  await expect(page.getByText("MAKE IT YOURS")).toBeVisible();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
});
