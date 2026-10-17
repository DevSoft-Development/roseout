import { test, expect } from "@playwright/test";

// Requires a disposable staging tenant and a session token for a NON-owner test user.
// Never point this suite at production or use real customer claims.
const base = process.env.CLAIM_STAGING_BASE_URL;
const token = process.env.CLAIM_STAGING_NONOWNER_BEARER;
const claim = process.env.CLAIM_STAGING_CLAIM_ID;
const challenge = process.env.CLAIM_STAGING_CHALLENGE_ID;
test.beforeAll(() => {
  if (!base || !token || !claim || !challenge) throw new Error("Missing isolated claim staging fixture secrets");
  if (!/^https:\/\//.test(base) || /(^|\.)theouthaven\.com\/?$/.test(new URL(base).hostname)) {
    throw new Error("Refusing non-HTTPS or production claim testing");
  }
});
test("authenticated non-owner cannot link someone else's claim", async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: base, extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    const response = await request.post("/api/business/claim-code/link-account", {
      data: {claimRequestId: claim, challengeId: challenge}, failOnStatusCode:false,
    });
    expect([403,409]).toContain(response.status());
    const body = await response.json();
    expect(body.approved).not.toBe(true);
  } finally { await request.dispose(); }
});
