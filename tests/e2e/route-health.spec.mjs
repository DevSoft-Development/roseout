import { test } from '@playwright/test';
import { expectHealthyPage } from './helpers.mjs';

const CRITICAL_APP_ROUTES = [
  '/',
  '/explore',
  '/create',
  '/business',
  '/business/claim',
  '/signup',
  '/admin/dashboard',
];

test.describe('critical route health', () => {
  for (const routePath of CRITICAL_APP_ROUTES) {
    test(`route health: ${routePath}`, async ({ page }) => {
      await expectHealthyPage(page, routePath);
    });
  }
});
