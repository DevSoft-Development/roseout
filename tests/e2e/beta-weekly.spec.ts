import { expect, test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

const prompt =
  "I want a casual Italian dinner in Manhattan with a fun activity nearby after, something good for two people, not too expensive, and easy to walk between.";
const authState = process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
const runWeeklyBeta = process.env.PLAYWRIGHT_WEEKLY_BETA_E2E === "1";

test.describe("weekly beta test-mode flow", () => {
  test.skip(
    !runWeeklyBeta,
    "Set PLAYWRIGHT_WEEKLY_BETA_E2E=1 after configuring an authenticated admin storage state and enabling weekly beta test mode.",
  );
  test.skip(
    !authState,
    "Set PLAYWRIGHT_AUTH_STORAGE_STATE to a logged-in admin storage state before running the weekly beta E2E.",
  );
  test.use(authState ? { storageState: authState } : {});

  test("admin can complete the test weekly beta check-in", async ({ page }) => {

    await page.goto("/user/dashboard/beta/weekly?test=1", {
      waitUntil: "domcontentloaded",
    });
    await expectNoHardError(page);
    await expect(
      page.getByText(/weekly beta task is not open yet|enable test mode/i),
    ).toHaveCount(0);

    const input = page
      .locator('textarea, input[type="search"], input[name*="prompt" i], input')
      .first();
    await expect(input).toBeVisible();
    await input.fill(prompt);

    const searchButton = page
      .getByRole("button", { name: /search|find|show|continue|review/i })
      .first();
    await searchButton.click();

    await expect(page.getByText(/Why it fits/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("SPORTS_BAR", { exact: false })).toHaveCount(0);
    await expect(page.getByText(/results|matches|options/i).first()).toBeVisible();

    const feedbackSelect = page.locator("select").filter({ hasText: /Select an option/ }).first();
    await expect(feedbackSelect).toBeVisible();
    await expect(feedbackSelect).toContainText("Nothing was off");
    await expect(page.getByText("Would you recommend TheOutHaven to family or friends?", { exact: false })).toBeVisible();

    const submit = page.getByRole("button", { name: /submit|check-in|finish/i }).last();
    await expect(submit).toBeDisabled();

    for (const select of await page.locator("select").all()) {
      const options = await select.locator("option").allTextContents();
      const firstRealValue = await select.locator("option").nth(1).getAttribute("value");
      if (options.some((option) => /Select an option/i.test(option)) && firstRealValue) {
        await select.selectOption(firstRealValue);
      }
    }

    const recommend = page.getByRole("radio", { name: /yes|definitely|probably/i }).first();
    if ((await recommend.count()) > 0) await recommend.check();

    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(
      page.getByText(
        "Weekly beta check-in complete. Thank you for helping improve TheOutHaven.",
        { exact: false },
      ),
    ).toBeVisible();
  });
});
