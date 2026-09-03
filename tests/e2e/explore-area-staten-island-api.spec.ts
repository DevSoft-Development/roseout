import { expect, test } from "@playwright/test";

test("Staten Island Explore area API returns public listings", async ({ request }) => {
  const response = await request.get("/api/explore/search?area=Staten%20Island");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.success).toBe(true);
  expect(Array.isArray(payload.items)).toBe(true);
  expect(payload.items.length).toBeGreaterThan(0);
});
