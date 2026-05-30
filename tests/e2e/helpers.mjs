import { expect } from '@playwright/test';

export const FORBIDDEN_PAGE_TEXT = /404|This page could not be found|Application error|Search is having trouble right now/i;
export const FORBIDDEN_RUNTIME_TEXT = /404|This page could not be found|Application error|Search is having trouble right now|We could not finish that search/i;

export async function expectHealthyPage(page, routePath, forbiddenText = FORBIDDEN_PAGE_TEXT) {
  const response = await page.goto(routePath, { waitUntil: 'domcontentloaded' });
  expect(response, `${routePath} should return a response`).not.toBeNull();
  expect(response.status(), `${routePath} should not return 404`).not.toBe(404);
  await expect(page.locator('body')).not.toContainText(forbiddenText);
}

export async function expectNoForbiddenText(page, forbiddenText = FORBIDDEN_PAGE_TEXT) {
  await expect(page.locator('body')).not.toContainText(forbiddenText);
}
