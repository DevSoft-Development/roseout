import { expect, test } from "@playwright/test";

const forbiddenLaunchCopy = [
  "prelaunch",
  "join waitlist",
  "request early access",
  "preparing for launch",
  "limited read-only preview",
];

test.describe("public product readiness", () => {
  test("homepage presents the live product without launch-gating language", async ({ page }) => {
    const failedImageRequests: string[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "image" && response.status() >= 400) {
        failedImageRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Stop searching 10 tabs." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan an Outing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore Places" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Describe an outing and use the real planner." })).toBeVisible();

    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const copy of forbiddenLaunchCopy) expect(body).not.toContain(copy);
    expect(failedImageRequests).toEqual([]);
  });

  test("homepage search opens the real planner with the visitor prompt", async ({ page }) => {
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pairs: [], restaurants: [], activities: [] }),
      });
    });

    await page.goto("/");
    await page.getByLabel("Describe your outing").fill("Italian dinner and comedy in Manhattan");
    await page.getByRole("button", { name: "Plan my outing" }).click();

    await expect(page).toHaveURL(/\/create\?.*guided=results/);
    expect(decodeURIComponent(page.url())).toContain("Italian dinner and comedy in Manhattan");
  });

  test("public Explore is directly reachable from the homepage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Explore Places" }).first().click();
    await expect(page).toHaveURL(/\/explore/);
  });

  test("About identifies the founder, company, and independent LinkedIn profile", async ({ page }) => {
    await page.goto("/about", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Nicholas Endeavour" })).toBeVisible();
    await expect(page.getByText("Founder & CEO, TheOutHaven")).toBeVisible();
    await expect(page.getByRole("heading", { name: "TheOutHaven LLC" })).toBeVisible();

    const linkedin = page.getByRole("link", { name: /View Nicholas on LinkedIn/ });
    await expect(linkedin).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/nicholas-endeavour-91b65a431/",
    );
    await expect(linkedin).toHaveAttribute("target", "_blank");
  });

  test("footer exposes company, product, support, and legal destinations", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");

    await expect(footer.getByRole("link", { name: "About", exact: true })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Get Help" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Contact" }).first()).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
  });

  for (const viewport of [
    { width: 390, height: 900 },
    { width: 1280, height: 900 },
  ]) {
    test(`live planner entry has no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Plan my outing" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});
