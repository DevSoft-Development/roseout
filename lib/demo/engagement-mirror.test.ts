import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadRoute = readFileSync("app/api/location-leads/route.ts", "utf8");
const feedbackRoute = readFileSync("app/api/feedback/route.ts", "utf8");
const messagingRoute = readFileSync(
  "app/api/business/messaging/campaigns/route.ts",
  "utf8",
);
const launcher = readFileSync(
  "app/internal/demo/theouthaven-lounge/page.tsx",
  "utf8",
);
const messagingButton = readFileSync(
  "app/internal/demo/theouthaven-lounge/DemoMessagingDraftButton.tsx",
  "utf8",
);

describe("TheOutHaven Lounge engagement mirror", () => {
  it("uses the production event lead pipeline with demo isolation", () => {
    expect(leadRoute).toContain("requireSafeDemoPublicWrite");
    expect(leadRoute).toContain('from("location_leads")');
    expect(leadRoute).toContain("createLocationNotificationEvent");
    expect(leadRoute).toContain("sendGrowthProEmail");
    expect(leadRoute).toContain("trackGrowthProEvent");
    expect(leadRoute).toContain("DEMO_CUSTOMER_EMAIL");
    expect(leadRoute).toContain("businessEmail: demoContext.isDemo");
  });

  it("separates real feedback from real check-in verification", () => {
    expect(feedbackRoute).toContain("requireSafeDemoPublicWrite");
    expect(feedbackRoute).toContain('action === "guest_check_in"');
    expect(feedbackRoute).toContain('from("outing_visit_verifications")');
    expect(feedbackRoute).toContain('verification_type: "guest_check_in"');
    expect(feedbackRoute).toContain('from("location_private_feedback")');
    expect(feedbackRoute).toContain("createLocationNotificationEvent");
    expect(feedbackRoute).toContain("trackGrowthProEvent");
  });

  it("creates campaign drafts through a shared production messaging API", () => {
    expect(messagingRoute).toContain("requireLocationPermission");
    expect(messagingRoute).toContain('permission: "marketing.edit"');
    expect(messagingRoute).toContain('from("location_messaging_campaigns")');
    expect(messagingRoute).toContain('status: "draft"');
    expect(messagingRoute).toContain("never_send: true");
    expect(messagingRoute).toContain("recipient_count: 0");
    expect(messagingRoute).not.toContain("sendSms");
    expect(messagingRoute).not.toContain("sendEmail");
  });

  it("exposes production engagement launchers from the internal mirror", () => {
    expect(launcher).toContain("Run event inquiry");
    expect(launcher).toContain("Open review dashboard");
    expect(launcher).toContain('countRows("outing_visit_verifications"');
    expect(launcher).toContain('countRows("location_messaging_campaigns"');
    expect(launcher).toContain("DemoMessagingDraftButton");
    expect(messagingButton).toContain(
      'fetch("/api/business/messaging/campaigns"',
    );
  });
});
