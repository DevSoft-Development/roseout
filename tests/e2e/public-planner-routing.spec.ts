import { expect, test } from "@playwright/test";

test.describe("public planner routing", () => {
  test("homepage search continues at step two", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel("Describe your outing");
    await input.fill("Italian dinner and comedy show in Manhattan");
    await page.getByRole("button", { name: "Plan my outing" }).click();

    await expect(page).toHaveURL(/\/create\?from=home/);
    await expect(page.getByText("MAKE IT YOURS")).toBeVisible();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await expect(page.getByText("Italian dinner and comedy show in Manhattan")).toBeVisible();
  });

  test("Create Outing navigation returns to the homepage planner", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("link", { name: "Create Outing" }).click();
    await expect(page).toHaveURL(/\/#plan-your-outing$/);
    await expect(page.getByLabel("Describe your outing")).toBeVisible();
  });

  test("Explore area filter returns listings", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: /Queens/ }).first().click();
    await expect(page).toHaveURL(/area=Queens/);
    await expect(page.locator("a[href*='/locations/']").first()).toBeVisible();
  });
});
