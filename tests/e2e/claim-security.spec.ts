import { test, expect } from "@playwright/test";

/**
 * Public boundary checks against the isolated app. This suite deliberately
 * doesn't create customer claims or depend on production credentials.
 */
test.describe("claim security API boundaries", () => {
  test("anonymous account linking cannot grant ownership", async ({ request }) => {
    const response = await request.post("/api/business/claim-code/link-account", {
      data: { claimRequestId: "00000000-0000-0000-0000-000000000000", challengeId: "00000000-0000-0000-0000-000000000000" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
    const result = await response.json();
    expect(result.approved).not.toBe(true);
  });

  test("claim submission requires a verification challenge", async ({ request }) => {
    const response = await request.post("/api/business/claim-code/submit", {
      data: { code: "INVALID" }, failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe("verification_required");
  });

  test("unauthenticated domain challenge cannot be issued", async ({ request }) => {
    const response = await request.post("/api/business/claim/domain", {
      data: { locationId: "00000000-0000-0000-0000-000000000000", method: "dns" }, failOnStatusCode: false,
    });
    expect([401, 403]).toContain(response.status());
  });

  test("unauthenticated video evidence is rejected", async ({ request }) => {
    const response = await request.post("/api/business/claim/video", {
      data: { locationId: "00000000-0000-0000-0000-000000000000" }, failOnStatusCode: false,
    });
    expect([401, 403]).toContain(response.status());
  });
});
