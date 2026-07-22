import { expect, test } from "@playwright/test";


test.describe("prelaunch homepage", () => {
  test("renders the enterprise homepage without broken image requests", async ({ page }) => {
    const failedImageRequests: string[] = [];

    page.on("response", (response) => {
      const request = response.request();
      if (request.resourceType() === "image" && response.status() >= 400) {
        failedImageRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Plan better OUTings." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Prelaunch" })).toBeVisible();
    await expect(page.getByTestId("product-preview")).toBeVisible();
    await expect(page.getByTestId("place-card-restaurant")).toBeVisible();
    await expect(page.getByTestId("place-card-activity")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Three simple steps." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Be discoverable when people are ready to go out." })).toBeVisible();

    expect(failedImageRequests).toEqual([]);
  });

  test("keeps the prelaunch signup connected to the launch waitlist endpoint", async ({ page }) => {
    await page.route("**/api/launch/waitlist", async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        email: "preview@example.com",
        wantsGiveaway: false,
        betaInterest: false,
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "You’re on the prelaunch list." }),
      });
    });

    await page.goto("/");
    await page.getByPlaceholder("Enter your email address").fill("preview@example.com");
    await page.getByRole("button", { name: "Join Prelaunch" }).click();

    await expect(page.getByText("You’re on the prelaunch list.")).toBeVisible();
  });
});
