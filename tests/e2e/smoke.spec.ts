import { expect, test } from "@playwright/test";
import { expectCleanPageLoad, expectNoHardError } from "./helpers";

const publicRoutes = [
  "/",
  "/explore",
  "/create",
  "/signup",
  "/plan",
];

test.describe("public route smoke tests", () => {
  for (const route of publicRoutes) {
    test(`${route} loads without hard errors`, async ({ page }) => {
      await expectCleanPageLoad(page, route);
    });
  }

  test("/pricing loads the current business plans destination without hard errors", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    if (process.env.BUSINESS_BASE_URL) {
      await expect(page).toHaveURL(/https:\/\/business\.theouthaven\.com\/business\/plans(?:[?#].*)?$/);
    } else {
      await expect(page).toHaveURL(/\/business\/plans(?:[?#].*)?$/);
    }
    await expectNoHardError(page);
  });
});
