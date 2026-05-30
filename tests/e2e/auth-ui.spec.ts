import { expect, test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

test.describe("signup and login UI", () => {
  test("/signup exposes auth UI without hard errors", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    await expect(
      page.getByText(/sign in|log in|login|create account|sign up/i).first()
    ).toBeVisible();

    const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
    await expect(passwordInput).toBeVisible();

    await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  });
});
