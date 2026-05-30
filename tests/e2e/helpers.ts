import { expect, type Page } from "@playwright/test";

export async function expectNoHardError(page: Page) {
  await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Internal Server Error", { exact: false })).toHaveCount(0);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText).not.toMatch(/\b404\b/i);
}

export async function expectCleanPageLoad(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}(?:[?#].*)?$`));
  await expectNoHardError(page);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fillFirstMatchingInput(page: Page, value: string) {
  const candidates = [
    page.getByRole("searchbox").first(),
    page.getByPlaceholder(/search/i).first(),
    page.getByPlaceholder(/what are you looking for/i).first(),
    page.getByPlaceholder(/restaurant|rooftop|dinner|city|area|occasion/i).first(),
    page.locator('input[type="search"]').first(),
    page.locator('input[name*="search" i]').first(),
    page.locator("textarea").first(),
    page.locator("input").first(),
  ];

  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      const isVisible = await candidate.isVisible().catch(() => false);
      const isEnabled = await candidate.isEnabled().catch(() => false);

      if (isVisible && isEnabled) {
        await candidate.fill(value);
        return true;
      }
    }
  }

  return false;
}

export async function submitSearch(page: Page) {
  const submitButton = page.getByRole("button", { name: /search|find|explore|create|plan|go|build my outing/i }).first();

  if ((await submitButton.count()) > 0) {
    const isVisible = await submitButton.isVisible().catch(() => false);
    const isEnabled = await submitButton.isEnabled().catch(() => false);

    if (isVisible && isEnabled) {
      await submitButton.click();
      return;
    }
  }

  await page.keyboard.press("Enter");
}

export async function hasVisibleCleanEmptyState(page: Page) {
  const emptyState = page.getByText(/no places|no results|nothing found|try a different|clear the filters|no matching|no perfect matches/i).first();

  return (await emptyState.count()) > 0 && (await emptyState.isVisible().catch(() => false));
}

export async function hasAnyLikelyResult(page: Page) {
  const selectors = [
    '[data-testid*="location" i]',
    '[data-testid*="card" i]',
    '[data-testid*="result" i]',
    'a[href*="/locations/"]',
    'a[href*="/location/"]',
    'a[href*="/plan/"]',
    "article",
    ".card",
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return true;
    }
  }

  return false;
}

export async function clickFirstVisibleLinkMatching(page: Page, patterns: string[]) {
  for (const pattern of patterns) {
    const link = page.locator(`a[href*="${pattern}"]`).first();

    if ((await link.count()) > 0 && (await link.isVisible().catch(() => false))) {
      await link.click();
      return true;
    }
  }

  return false;
}
