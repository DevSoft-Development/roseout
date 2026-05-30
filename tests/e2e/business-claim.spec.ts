import { expect, test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

test.describe("business claim flow smoke test", () => {
  test("/business/claim loads claim options without hard errors", async ({ page }) => {
    await page.goto("/business/claim", { waitUntil: "domcontentloaded" });
    await expectNoHardError(page);

    await expect(
      page.getByText(/claim|qr|code|business|location/i).first()
    ).toBeVisible();
  });
});
