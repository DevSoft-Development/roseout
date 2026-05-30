import { expect, test } from "@playwright/test";
import {
  expectNoHardError,
  fillFirstMatchingInput,
  hasAnyLikelyResult,
  hasVisibleCleanEmptyState,
  submitSearch,
} from "./helpers";

test.describe("search flows", () => {
  test("/explore search does not reload into an error", async ({ page }) => {
    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    const filled = await fillFirstMatchingInput(page, "rooftop dinner in Manhattan");
    test.skip(!filled, "No searchable input found on /explore.");

    await submitSearch(page);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    await expect(page).toHaveURL(/\/explore/);
    await expectNoHardError(page);

    await expect(page.getByText("Search is having trouble right now", { exact: false })).toHaveCount(0);

    const hasResult = await hasAnyLikelyResult(page);
    const hasEmpty = await hasVisibleCleanEmptyState(page);

    expect(hasResult || hasEmpty).toBeTruthy();
  });

  test("/create search does not crash", async ({ page }) => {
    await page.goto("/create", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    const filled = await fillFirstMatchingInput(page, "steak dinner");
    test.skip(!filled, "No searchable input found on /create.");

    await submitSearch(page);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    await expect(page).toHaveURL(/\/create/);
    await expectNoHardError(page);

    await expect(page.getByText("Search is having trouble right now", { exact: false })).toHaveCount(0);
  });
});
