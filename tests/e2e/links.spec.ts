import { expect, test } from "@playwright/test";
import { clickFirstVisibleLinkMatching, expectNoHardError } from "./helpers";

test.describe("important link integrity", () => {
  test("first location/detail link from explore is not broken when present", async ({ page }) => {
    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    const clicked = await clickFirstVisibleLinkMatching(page, [
      "/locations/",
      "/location/",
      "/details/",
      "/plan/",
    ]);

    test.skip(!clicked, "No location/detail link found on /explore.");

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await expectNoHardError(page);
    await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  });

  test("first details link from plan is not broken when present", async ({ page }) => {
    await page.goto("/plan", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    const clicked = await clickFirstVisibleLinkMatching(page, [
      "/locations/",
      "/location/",
      "/details/",
      "/plan/",
    ]);

    test.skip(!clicked, "No details link found on /plan.");

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await expectNoHardError(page);
    await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  });
});
