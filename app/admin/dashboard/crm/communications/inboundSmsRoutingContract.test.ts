import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const router = fs.readFileSync(
  path.join(process.cwd(), "lib/crm/inbound-sms-routing.ts"),
  "utf8",
);
const webhook = fs.readFileSync(
  path.join(process.cwd(), "app/api/webhooks/telnyx/messages/route.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260818003000_crm_inbound_sms_notifications.sql"),
  "utf8",
);

describe("CRM inbound SMS routing contract", () => {
  it("routes unknown CRM numbers into a durable unmatched conversation", () => {
    expect(router).toContain("sms:unmatched:${from}");
    expect(router).toContain('routing_status: "unmatched"');
    expect(router).toContain('notification_type: notificationType');
    expect(router).toContain('"unmatched_sms"');
  });

  it("matches contacts by normalized E.164 phone even before an outbound thread exists", () => {
    expect(router).toContain('.eq("phone_e164", from)');
    expect(migration).toContain("crm_contacts_sync_phone_e164");
    expect(migration).toContain("crm_contacts_phone_e164_idx");
  });

  it("persists STOP and START into CRM before returning", () => {
    expect(webhook).toMatch(/STOP_WORDS[\s\S]*routeInboundCrmSms\([\s\S]*complianceKeyword:\s*"stop"/);
    expect(webhook).toMatch(/START_WORDS[\s\S]*routeInboundCrmSms\([\s\S]*complianceKeyword:\s*"start"/);
    expect(router).toContain('message_type: params.complianceKeyword ? "compliance" : "message"');
  });

  it("allows duplicate Telnyx delivery to repair CRM processing", () => {
    expect(webhook).toContain('if (!firstDelivery && eventType !== "message.received")');
    expect(webhook).toContain('if (!firstDelivery && !isCrmMainNumber)');
    expect(router).toContain("repairDuplicate");
    expect(router).toContain('onConflict: "message_id"');
  });
});
