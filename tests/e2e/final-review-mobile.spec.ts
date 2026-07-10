import { expect, test } from "@playwright/test";
import { expectNoHardError } from "./helpers";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const PUBLIC_LOCATION_PATH = process.env.PLAYWRIGHT_PUBLIC_LOCATION_PATH;

async function expectMobileSafePage(page: import("@playwright/test").Page, path: string) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expectNoHardError(page);

  await expect(page.locator("body")).toBeVisible();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText.trim().length).toBeGreaterThan(20);

  const overflow = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 4);
}

async function findPublicLocationPath(page: import("@playwright/test").Page) {
  if (PUBLIC_LOCATION_PATH) return PUBLIC_LOCATION_PATH;

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/locations", { waitUntil: "domcontentloaded" });
  await expectNoHardError(page);

  const href = await page
    .locator('a[href^="/locations/"]')
    .evaluateAll((links) => {
      const candidate = links
        .map((link) => link.getAttribute("href") || "")
        .find((value) => /^\/locations\/(restaurants|activities|locations)\//.test(value));
      return candidate || "";
    })
    .catch(() => "");

  return href;
}

test.describe("final review mobile viewport checks", () => {
  for (const path of ["/", "/create", "/business/claim"]) {
    test(`${path} is usable at a phone viewport`, async ({ page }) => {
      await expectMobileSafePage(page, path);
    });
  }

  test("one public location profile is usable at a phone viewport", async ({ page }) => {
    const publicLocationPath = await findPublicLocationPath(page);
    test.skip(!publicLocationPath, "No public location profile link was available for a safe mobile viewport check.");

    await expectMobileSafePage(page, publicLocationPath);
    await expect(page.getByText(/Location Not Found/i)).toHaveCount(0);
  });
});
