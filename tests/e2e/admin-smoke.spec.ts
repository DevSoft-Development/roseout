import { test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

test.describe("admin route smoke test", () => {
  test("/admin/dashboard does not show a hard public crash", async ({ page }) => {
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });

    await expectNoHardError(page);
  });
});
