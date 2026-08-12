import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notificationApi = readFileSync(
  "app/api/business/notifications/route.ts",
  "utf8",
);
const notificationPage = readFileSync(
  "app/business/dashboard/settings/notifications/page.tsx",
  "utf8",
);
const notificationManager = readFileSync(
  "components/growth-pro/NotificationSettingsManager.tsx",
  "utf8",
);
const messagingApi = readFileSync(
  "app/api/business/messaging/campaigns/route.ts",
  "utf8",
);
const messagingPage = readFileSync(
  "app/business/dashboard/messaging/page.tsx",
  "utf8",
);
const messagingManager = readFileSync(
  "components/growth-pro/MessagingCampaignManager.tsx",
  "utf8",
);
const billingPage = readFileSync(
  "app/business/dashboard/billing/page.tsx",
  "utf8",
);
const growthProPage = readFileSync(
  "components/growth-pro/BusinessGrowthProPage.tsx",
  "utf8",
);
const ownerContext = readFileSync("lib/demo/owner-context.ts", "utf8");
const demoLocationAccess = readFileSync(
  "lib/demo/internal-demo-location-access.ts",
  "utf8",
);
const menuPage = readFileSync("app/business/dashboard/menu/page.tsx", "utf8");
const menuApi = readFileSync("app/api/business/menu/route.ts", "utf8");

describe("TheOutHaven Lounge owner operations mirror", () => {
  it("uses a shared production notification management UI and API", () => {
    expect(notificationPage).toContain("NotificationSettingsManager");
    expect(notificationManager).toContain('fetch(`/api/business/notifications?');
    expect(notificationManager).toContain('action: "create_recipient"');
    expect(notificationManager).toContain('action: "upsert_preference"');
    expect(notificationApi).toContain('from("location_notification_recipients")');
    expect(notificationApi).toContain('from("location_notification_preferences")');
    expect(notificationApi).toContain('from("location_notification_events")');
    expect(notificationApi).toContain("admin@theouthaven.com");
    expect(notificationApi).toContain("sms_enabled: guard.isDemo ? false");
  });

  it("uses a shared campaign manager with safe approval simulation", () => {
    expect(messagingPage).toContain("MessagingCampaignManager");
    expect(messagingManager).toContain('fetch(`/api/business/messaging/campaigns?');
    expect(messagingManager).toContain('action: "request_approval"');
    expect(messagingManager).toContain('action: "approve"');
    expect(messagingManager).toContain('action: "reject"');
    expect(messagingApi).toContain('from("location_messaging_campaigns")');
    expect(messagingApi).toContain('status = "pending_approval"');
    expect(messagingApi).toContain('updates.status = "approved"');
    expect(messagingApi).toContain('updates.status = "rejected"');
    expect(messagingApi).toContain("recipient_count = 0");
    expect(messagingApi).toContain("never_send: true");
    expect(messagingApi).not.toContain("sendGrowthProEmail");
    expect(messagingApi).not.toContain("sendReservationSms");
  });

  it("keeps demo billing on the shared no-Stripe simulation surface", () => {
    expect(billingPage).toContain('params.demo === "1"');
    expect(billingPage).toContain('BusinessGrowthProPage module="billing"');
    expect(growthProPage).toContain("Real Stripe checkout, billing portal, and payment changes are disabled in demo mode.");
    expect(growthProPage).toContain("const billingHref = demo.demoMode ? undefined");
  });

  it("requires the approved internal role gate for direct demo owner context", () => {
    expect(ownerContext).toContain("getInternalDemoViewer");
    expect(ownerContext).toContain("location.demo_key === MIRROR_DEMO_KEY");
    expect(ownerContext).toContain("location.is_hidden === true");
    expect(ownerContext).toContain("location.is_searchable !== true");
    expect(ownerContext).not.toContain("hasAdminSession");
  });

  it("bridges approved internal staff into the real demo menu editor without weakening normal permissions", () => {
    expect(demoLocationAccess).toContain("getInternalDemoViewer");
    expect(demoLocationAccess).toContain("location.demo_key !== MIRROR_DEMO_KEY");
    expect(demoLocationAccess).toContain("location.publish_ready === true");
    expect(menuPage).toContain("getInternalDemoLocationAccess");
    expect(menuApi).toContain("getInternalDemoLocationAccess");
    expect(menuApi).toContain("if (guard.error)");
  });
});
