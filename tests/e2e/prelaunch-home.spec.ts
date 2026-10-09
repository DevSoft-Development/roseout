import { expect, test } from "@playwright/test";

const forbiddenLaunchCopy = [
  "prelaunch",
  "join waitlist",
  "request early access",
  "preparing for launch",
  "limited read-only preview",
  "live product",
  "real planner",
  "reviewer signing in",
  "public planner",
];

async function waitForPlannerHydration(page: import("@playwright/test").Page) {
  const planner = page.getByRole("region", { name: "Plan your outing" });
  const input = page.getByLabel("Describe the outing you want");
  await expect(planner).toHaveAttribute("data-hydrated", "true");
  await expect(input).toBeVisible();
  return input;
}

test.describe("public product readiness", () => {
  test("homepage presents the product without launch-gating or reviewer language", async ({ page }) => {
    const failedImageRequests: string[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "image" && response.status() >= 400) {
        failedImageRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const officialLogo = page.getByRole("link", { name: "TheOutHaven home" }).locator("img");
    await expect(officialLogo).toBeVisible();
    await expect(officialLogo).toHaveAttribute("src", "/toh_logo_wordmark_white.webp");
    const logoResponse = await page.request.get("/toh_logo_wordmark_white.webp");
    expect(logoResponse.status(), "Official logo must be served as a static asset").toBe(200);
    expect(logoResponse.headers()["content-type"], "Official logo must be a WebP image").toMatch(/image\\/webp/i);
    const logoBytes = await logoResponse.body();
    expect(logoBytes.subarray(0, 4).toString("ascii"), "Official logo RIFF signature").toBe("RIFF");
    expect(logoBytes.subarray(8, 12).toString("ascii"), "Official logo WEBP signature").toBe("WEBP");
    await expect.poll(async () => officialLogo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Plan better OUTings." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Plan your outing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discover" })).toBeVisible();
    await expect(page.getByRole("link", { name: "For Businesses" }).first()).toBeVisible();

    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const copy of forbiddenLaunchCopy) expect(body).not.toContain(copy);
    expect(failedImageRequests).toEqual([]);
  });

  test("homepage search opens the outing planner with the visitor prompt", async ({ page }) => {
    await page.route("**/api/search/resolve-plan-type", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ planType: "outing" }),
      });
    });

    await page.goto("/");
    const plannerInput = await waitForPlannerHydration(page);
    await plannerInput.fill("Italian dinner and comedy in Manhattan");
    const submit = page.getByRole("button", { name: "Find My Outing" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/create\?.*step=2/);
    const plannerUrl = new URL(page.url());
    expect(plannerUrl.searchParams.get("prompt")).toBe("Italian dinner and comedy in Manhattan");
  });

  test("Explore is directly reachable from the homepage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Discover" }).click();
    await expect(page).toHaveURL(/\/explore/);
  });

  test("About identifies the company and founder with an independent LinkedIn profile", async ({ page }) => {
    await page.goto("/about", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "TheOutHaven LLC" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nicholas Endeavour" })).toBeVisible();
    await expect(page.getByText("Founder & CEO")).toBeVisible();

    const linkedin = page.getByRole("link", { name: /LinkedIn/ });
    await expect(linkedin).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/",
    );
    await expect(linkedin).toHaveAttribute("target", "_blank");
  });

  test("footer exposes company, product, support, and legal destinations", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");

    await expect(footer.getByRole("link", { name: "About us", exact: true })).toHaveAttribute("href", "https://theouthaven.com/about");
    await expect(footer.getByRole("link", { name: "Explore outings", exact: true })).toHaveAttribute("href", "https://theouthaven.com/explore");
    await expect(footer.getByRole("link", { name: "Get help", exact: true })).toHaveAttribute("href", "https://theouthaven.com/support");
    await expect(footer.getByRole("link", { name: "Contact" }).first()).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Trust Center" })).toBeVisible();
  });

  test("Trust Center explains recommendations, sponsorship, privacy, and human support", async ({ page }) => {
    await page.goto("/trust", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Real places. Clear reasons. Your choice." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How recommendations work" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sponsored placements" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personalization and privacy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Human support" })).toBeVisible();
  });

  for (const viewport of [
    { width: 390, height: 900 },
    { width: 1280, height: 900 },
  ]) {
    test(`outing planner entry has no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Find My Outing" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});
