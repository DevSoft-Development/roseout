import { expect, test } from "@playwright/test";
import { expectCleanPageLoad, expectNoHardError } from "./helpers";

const publicRoutes = [
  "/",
  "/explore",
  "/create",
  "/business",
  "/business/claim",
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
    await expect(page).toHaveURL(/\/business\/plans(?:[?#].*)?$/);
    await expectNoHardError(page);
  });
});
