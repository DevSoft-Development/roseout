import { test } from "@playwright/test";
import { expectCleanPageLoad } from "./helpers";

const publicRoutes = [
  "/",
  "/explore",
  "/create",
  "/business",
  "/business/claim",
  "/signup",
  "/plan",
  "/pricing",
];

test.describe("public route smoke tests", () => {
  for (const route of publicRoutes) {
    test(`${route} loads without hard errors`, async ({ page }) => {
      await expectCleanPageLoad(page, route);
    });
  }
});
