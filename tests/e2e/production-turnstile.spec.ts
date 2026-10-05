import { expect, test } from "@playwright/test";
import {
  assertNoHardProductionError,
  attachProductionEvidence,
  collectProductionDiagnostics,
  gotoProductionPage,
  selectedSurface,
} from "./production-browser-helpers";

const consumerBase = process.env.CONSUMER_BASE_URL || "https://theouthaven.com";

const missingConfigPattern =
  /Verification is temporarily unavailable|Turnstile is not configured in this environment|Security check failed/i;

async function assertTurnstileConfigured(page: import("@playwright/test").Page) {
  await expect(page.locator("body")).not.toContainText(missingConfigPattern);
  await expect(
    page.locator('script[src*="challenges.cloudflare.com/turnstile"]').first(),
    "Turnstile client script should be present when the production site key is compiled into the app",
  ).toHaveCount(1, { timeout: 15_000 });
}

test("consumer signup Turnstile is configured in production", async ({ page }, testInfo) => {
  test.skip(!selectedSurface("consumer"), "consumer not selected for this run");

  const diagnostics = collectProductionDiagnostics(page, consumerBase);
  const response = await gotoProductionPage(page, `${consumerBase}/login`);
  expect(response?.status() ?? 599).toBeLessThan(500);

  await page.getByRole("button", { name: "Sign Up" }).first().click();
  await assertTurnstileConfigured(page);
  await assertNoHardProductionError(page);
  await attachProductionEvidence(page, testInfo, "consumer-signup-turnstile", diagnostics);
});

test("forgot-password Turnstile is configured in production", async ({ page }, testInfo) => {
  test.skip(!selectedSurface("consumer"), "consumer not selected for this run");

  const diagnostics = collectProductionDiagnostics(page, consumerBase);
  const response = await gotoProductionPage(page, `${consumerBase}/forgot-password`);
  expect(response?.status() ?? 599).toBeLessThan(500);

  await assertTurnstileConfigured(page);
  await assertNoHardProductionError(page);
  await attachProductionEvidence(page, testInfo, "consumer-forgot-password-turnstile", diagnostics);
});

test("mobile Turnstile bridge is configured in production", async ({ page }, testInfo) => {
  test.skip(!selectedSurface("consumer"), "consumer not selected for this run");

  const diagnostics = collectProductionDiagnostics(page, consumerBase);
  const response = await gotoProductionPage(
    page,
    `${consumerBase}/mobile/turnstile?action=mobile_signup&embedded=1`,
  );
  expect(response?.status() ?? 599).toBeLessThan(500);

  await assertTurnstileConfigured(page);
  await expect(page.locator("body")).toContainText(/Quick verification|Finishing your security check/i);
  await assertNoHardProductionError(page);
  await attachProductionEvidence(page, testInfo, "consumer-mobile-turnstile", diagnostics);
});

test("careers application Turnstile is configured before submit", async ({ page }, testInfo) => {
  test.skip(!selectedSurface("consumer"), "consumer not selected for this run");

  const diagnostics = collectProductionDiagnostics(page, consumerBase);
  const careers = await gotoProductionPage(page, `${consumerBase}/careers`);
  expect(careers?.status() ?? 599).toBeLessThan(500);

  const firstRole = page.getByRole("link", { name: "View Role" }).first();
  await expect(firstRole).toBeVisible({ timeout: 15_000 });
  const roleHref = await firstRole.getAttribute("href");
  expect(roleHref).toMatch(/^\/careers\/[^/]+$/);

  await gotoProductionPage(page, new URL(roleHref!, consumerBase).toString());
  const applyLink = page.locator('a[href$="/apply"]').first();
  await expect(applyLink).toBeVisible({ timeout: 15_000 });
  const applyHref = await applyLink.getAttribute("href");
  expect(applyHref).toBeTruthy();

  await gotoProductionPage(page, new URL(applyHref!, consumerBase).toString());

  await page.locator('input[name="firstName"]').fill("Production");
  await page.locator('input[name="lastName"]').fill("Verification");
  await page.locator('input[name="email"]').fill("production-turnstile-smoke@example.com");
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.locator('[data-application-step="experience"]')).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  const questionStep = page.locator('[data-application-step="questions"]');
  await expect(questionStep).toBeVisible();
  const requiredQuestions = questionStep.locator("textarea[required]");
  for (let i = 0; i < await requiredQuestions.count(); i += 1) {
    await requiredQuestions.nth(i).fill("Production verification");
  }
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.locator('[data-application-step="review"]')).toBeVisible();
  await assertTurnstileConfigured(page);
  await assertNoHardProductionError(page);
  await attachProductionEvidence(page, testInfo, "consumer-careers-turnstile", diagnostics);
});
