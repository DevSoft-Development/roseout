import { expect, test } from "@playwright/test";

async function waitForPlannerHydration(page: import("@playwright/test").Page) {
  const input = page.getByLabel("Describe the outing you want");
  const quickIdea = page.getByRole("button", { name: "Date night", exact: true });
  await expect(input).toBeVisible();
  await quickIdea.click();
  await expect(input).toHaveValue("Date night");
  return input;
}

test.describe("public planner routing", () => {
  test("homepage search opens Make It Yours before results", async ({ page }) => {
    await page.route("**/api/search/resolve-plan-type", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ planType: "outing" }),
      });
    });

    await page.goto("/");
    const plannerInput = await waitForPlannerHydration(page);
    await plannerInput.fill("Date night in Brooklyn");
    const submit = page.getByRole("button", { name: "Find My Outing" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/step=2/);
    await expect(page.getByText("MAKE IT YOURS")).toBeVisible();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
  });

  test("Create Outing returns to the homepage planner", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: "Create Outing" }).click();

    await expect(page).toHaveURL(/\/#plan-your-outing$/);
    await expect(page.getByLabel("Describe the outing you want")).toBeVisible();
  });

  test("Discover browse shell loads without external-data credentials", async ({ page }) => {
    const response = await page.goto("/explore", { waitUntil: "domcontentloaded" });
    expect(response?.status() ?? 500).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "Find your next OUTing." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan something specific" })).toBeVisible();
  });
});
