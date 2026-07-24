import { expect, test, type Page } from "@playwright/test";

const pairedResponse = {
  pairs: [
    {
      pair_title: "Luna Trattoria + Midtown Comedy Club",
      walking_time: "8-minute walk",
      match_explanation: "Both fit a relaxed dinner and comedy plan.",
      restaurant: { id: "r1", restaurant_name: "Luna Trattoria", cuisine: "Italian", neighborhood: "Midtown", rating: 4.7, main_image: "https://example.com/luna.jpg" },
      activity: { id: "a1", activity_name: "Midtown Comedy Club", category: "Comedy", borough: "Manhattan", rating: 4.5 },
    },
  ],
};

const restrictedLabels = ["Build this outing", "See all results", "Open full results", "Reserve", "Save", "Share", "Directions", "Call"];

async function mockGenerate(page: Page, body: unknown, status = 200) {
  let payload: Record<string, unknown> | null = null;
  await page.route("**/api/generate", async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => payload;
}

test.describe("prelaunch homepage", () => {
  test("renders the prelaunch homepage without broken image requests", async ({ page }) => {
    const failedImageRequests: string[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "image" && response.status() >= 400) failedImageRequests.push(`${response.status()} ${response.url()}`);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Stop searching 10 tabs." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Prelaunch" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try it" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "TheOutHaven is preparing for launch." })).toBeVisible();
    expect(failedImageRequests).toEqual([]);
  });

  test("paired results render inline and stay on homepage", async ({ page }) => {
    const getPayload = await mockGenerate(page, pairedResponse);
    await page.goto("/");
    await page.getByLabel("Outing prompt").fill("Italian dinner and comedy in Manhattan");
    await page.getByRole("button", { name: "Try it" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("prelaunch-pair-card")).toContainText("Luna Trattoria");
    await expect(page.getByTestId("prelaunch-pair-card")).toContainText("Midtown Comedy Club");
    await expect(page.getByText("8-minute walk")).toBeVisible();
    expect(getPayload()).toMatchObject({ input: "Italian dinner and comedy in Manhattan", source: "homepage_prelaunch_preview" });
    for (const label of restrictedLabels) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });

  test("individual result fallback renders up to three cards without navigation", async ({ page }) => {
    await mockGenerate(page, { restaurants: [1,2,3,4].map((n) => ({ id: `r${n}`, restaurant_name: `Restaurant ${n}`, cuisine: "Thai", city: "Queens" })) });
    await page.goto("/");
    await page.getByLabel("Outing prompt").fill("Thai food in Queens");
    await page.getByRole("button", { name: "Try it" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("prelaunch-single-card")).toHaveCount(3);
  });

  test("no results keeps visitor on homepage", async ({ page }) => {
    await mockGenerate(page, { pairs: [], cards: [], matched_locations: [], restaurants: [], activities: [] });
    await page.goto("/");
    await page.getByRole("button", { name: "Try it" }).click();
    await expect(page.getByText("No preview matches yet.")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("API failure shows a safe error and stays on homepage", async ({ page }) => {
    await mockGenerate(page, { error: "stack trace" }, 500);
    await page.goto("/");
    await page.getByRole("button", { name: "Try it" }).click();
    await expect(page.getByRole("alert")).toContainText("couldn’t load preview matches");
    await expect(page.getByRole("alert")).not.toContainText("stack trace");
    await expect(page).toHaveURL(/\/$/);
  });

  test("homepage does not expose create or restricted prelaunch controls", async ({ page }) => {
    await page.goto("/");
    for (const label of restrictedLabels) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    await expect(page.locator('a[href^="/create"]')).toHaveCount(0);
  });

  for (const viewport of [{ width: 390, height: 900 }, { width: 1280, height: 900 }]) {
    test(`Try it button stays nowrap without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const button = page.getByRole("button", { name: "Try it" });
      await expect(button).toHaveClass(/whitespace-nowrap/);
      await expect(button).toHaveText("Try it");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  }

  test("keeps the prelaunch signup connected to the launch waitlist endpoint", async ({ page }) => {
    await page.route("**/api/launch/waitlist", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toMatchObject({ email: "preview@example.com", wantsGiveaway: false, betaInterest: false });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "You’re on the prelaunch list." }) });
    });
    await page.goto("/");
    await page.getByPlaceholder("Enter your email address").fill("preview@example.com");
    await page.getByRole("button", { name: "Join Prelaunch" }).click();
    await expect(page.getByText("You’re on the prelaunch list.")).toBeVisible();
  });
});
