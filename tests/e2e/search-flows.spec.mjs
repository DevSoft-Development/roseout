import { expect, test } from '@playwright/test';
import { FORBIDDEN_RUNTIME_TEXT, expectHealthyPage, expectNoForbiddenText } from './helpers.mjs';

test('Explore search updates results without a document reload', async ({ page }) => {
  await expectHealthyPage(page, '/explore');

  const initialNavigationCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await page.getByPlaceholder('Search by vibe, food, activity, or area').fill('rooftop dinner in Manhattan');
  await page.getByRole('button', { name: /^Search$/ }).click();

  await expect(page).toHaveURL(/\/explore/);
  await expect(page.locator('body')).toContainText(/Showing results for “rooftop dinner in Manhattan”|No matching places found\./, { timeout: 15000 });

  const finalNavigationCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  expect(finalNavigationCount, 'Explore search should not trigger a full document reload').toBe(initialNavigationCount);
  await expectNoForbiddenText(page, FORBIDDEN_RUNTIME_TEXT);
});

test('Create search returns cards or a clean empty state without crashing', async ({ page }) => {
  await expectHealthyPage(page, '/create');

  await page.locator('textarea').first().fill('steak dinner');
  await page.getByRole('button', { name: /^Build My Outing$/ }).click();

  await expect(page.locator('body')).toContainText(/Curated Results|No perfect matches yet\./, { timeout: 30000 });
  await expectNoForbiddenText(page, FORBIDDEN_RUNTIME_TEXT);
});

test('first available Explore location details link resolves to a non-404 page', async ({ page }) => {
  await expectHealthyPage(page, '/explore');

  const firstDetailsLink = page.getByRole('link', { name: /^View Details$/ }).first();
  if ((await firstDetailsLink.count()) === 0) {
    test.skip(true, 'No Explore location cards were available to validate.');
  }

  await firstDetailsLink.click();
  await page.waitForLoadState('domcontentloaded');

  const currentUrl = new URL(page.url());
  expect(currentUrl.pathname, 'Location details click should leave /explore when a details link is available').not.toBe('/explore');
  await expect(page.locator('body')).not.toContainText(/404|This page could not be found/i);
});
