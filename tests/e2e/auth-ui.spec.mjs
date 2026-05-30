import { expect, test } from '@playwright/test';
import { expectHealthyPage, expectNoForbiddenText } from './helpers.mjs';

test('signup and login UI tabs stay on a valid signup route', async ({ page }) => {
  await expectHealthyPage(page, '/signup');

  await expect(page.getByRole('button', { name: /^Sign In$/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sign Up$/ }).first()).toBeVisible();

  await page.getByRole('button', { name: /^Sign In$/ }).first().click();
  await expect(page.getByRole('link', { name: /Forgot password\?/i })).toBeVisible();

  await page.getByRole('button', { name: /^Sign Up$/ }).first().click();
  await expect(page.getByRole('heading', { name: /Create your TheOutHaven account/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create Account|Continue/i }).first()).toBeVisible();

  const currentUrl = new URL(page.url());
  expect(currentUrl.pathname, 'Signup tab should not navigate to a duplicate broken signup route').toBe('/signup');
  await expectNoForbiddenText(page);
});
