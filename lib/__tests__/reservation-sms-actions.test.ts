import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Reservation SMS actions", () => {
  test("stores short-lived deterministic SMS action state", () => {
    const migration = read("supabase/migrations/20260818193000_reservation_sms_actions.sql");
    expect(migration).toContain("reservation_sms_sessions");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("enable row level security");
  });

  test("uses AI only for structured intent parsing and disables response storage", () => {
    const parser = read("lib/reservations/sms-intent.ts");
    expect(parser).toContain("client.responses.create");
    expect(parser).toContain('store: false');
    expect(parser).toContain('type: "json_schema"');
    expect(parser).toContain('strict: true');
    expect(parser).toContain('process.env.RESERVATION_SMS_AI_MODEL || "gpt-5-mini"');
  });

  test("requires confirmation before cancellation or reservation changes", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    expect(actions).toContain('state: "confirm_cancel"');
    expect(actions).toContain('state: "confirm_change"');
    expect(actions).toContain('upper !== "YES"');
    expect(actions).toContain("checkReservationAvailability");
  });

  test("preserves deposit refund, slot release, waitlist and audit behavior for SMS cancellation", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    expect(actions).toContain("stripeRequest");
    expect(actions).toContain("reservation_slot_locks");
    expect(actions).toContain("notifyFirstWaitlistMatch");
    expect(actions).toContain("sendReservationCancelledEmail");
    expect(actions).toContain("reservation_audit");
  });

  test("routes reservation-number inbound messages through the action processor before generic threading", () => {
    const webhook = read("app/api/webhooks/telnyx/messages/route.ts");
    expect(webhook).toContain("processReservationSmsAction");
    expect(webhook.indexOf("processReservationSmsAction")).toBeLessThan(webhook.lastIndexOf("findReservationForInboundSms"));
    expect(webhook).not.toContain("cancelLatestReservation");
  });

  test("teaches guests the new controls in confirmation and reminder SMS", () => {
    const sms = read("lib/sms/reservation-sms.ts");
    expect(sms).toContain("Reply CHANGE");
    expect(sms).toContain("CANCEL to cancel");
    expect(sms).toContain("DETAILS for details");
  });
});
