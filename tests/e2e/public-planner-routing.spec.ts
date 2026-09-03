import { expect, test } from "@playwright/test";

test.describe("public planner routing", () => {
  test("homepage search opens Make It Yours before results", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Describe your outing").fill("Date night in Brooklyn");
    await page.getByRole("button", { name: "Plan my outing" }).click();

    await expect(page).toHaveURL(/step=2/);
    await expect(page.getByText("MAKE IT YOURS")).toBeVisible();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
  });

  test("Create Outing returns to the homepage planner", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: "Create Outing" }).click();

    await expect(page).toHaveURL(/\/#plan-your-outing$/);
    await expect(page.getByLabel("Describe your outing")).toBeVisible();
  });

  test("Queens area browse returns listings", async ({ request }) => {
    const response = await request.get("/api/explore/search?area=Queens");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.items?.length || 0).toBeGreaterThan(0);
  });
});
