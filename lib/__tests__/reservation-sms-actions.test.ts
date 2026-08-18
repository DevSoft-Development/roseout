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

  test("keeps exact commands deterministic but uses learned rules before AI for free-form requests", () => {
    const parser = read("lib/reservations/sms-intent.ts");
    expect(parser).toContain("exactCommandIntent");
    expect(parser).toContain("reservation_sms_learned_rules");
    expect(parser).toContain('source: "learned"');
    expect(parser.indexOf("applyLearnedRule")).toBeLessThan(parser.indexOf("client.responses.create"));
  });

  test("routes generic reservation change requests deterministically when no concrete value is present", () => {
    const parser = read("lib/reservations/sms-intent.ts");
    expect(parser).toContain("hasExplicitChangeValue");
    expect(parser).toContain("Generic routing requests should never depend on AI confidence");
    expect(parser).toContain('intent: "change_time", confidence: 1');
  });

  test("teaches AI arrival language and records reusable learning cues", () => {
    const parser = read("lib/reservations/sms-intent.ts");
    expect(parser).toContain("arrive at 8pm");
    expect(parser).toContain("learning_cue");
    expect(parser).toContain("learning_field");
    expect(parser).toContain("reservation_sms_phrase_observations");
    expect(parser).toContain("await recordObservation");
  });

  test("has a no-AI fallback that understands natural arrival wording", () => {
    const parser = read("lib/reservations/sms-intent.ts");
    expect(parser).toContain("arrive|arrival|come|coming|be there|show up");
    expect(parser).toContain("fallbackIntent");
  });

  test("requires confirmation before cancellation or reservation changes", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    expect(actions).toContain('state: "confirm_cancel"');
    expect(actions).toContain('state: "confirm_change"');
    expect(actions).toContain('upper === "YES"');
    expect(actions).toContain("checkReservationAvailability");
  });

  test("allows customers to refine a pending change before confirming", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    expect(actions).toContain('session.state === "confirm_change"');
    expect(actions).toContain('action: "confirm_change_updated"');
    expect(actions).toContain("parsed.requested_party_size");
    expect(actions).toContain("await prepareSpecificChange(phone, reservation, next)");
  });

  test("threads inbound action messages once a reservation is known", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    const webhook = read("app/api/webhooks/telnyx/messages/route.ts");
    expect(actions).toContain("appendInbound(selected");
    expect(actions).toContain("initial_inbound");
    expect(actions).toContain('direction: "inbound"');
    expect(webhook).toContain("providerMessageId,");
    expect(webhook).toContain("eventId,");
  });

  test("never silently drops an unmatched reservation-channel message", () => {
    const webhook = read("app/api/webhooks/telnyx/messages/route.ts");
    expect(webhook).toContain("Never silently swallow a reservation-channel SMS");
    expect(webhook).toContain("I received your message, but I’m not sure what you want to change");
    expect(webhook).toContain("reservation_clarification_sent");
    expect(webhook).toContain("reservation_unmatched_clarification_sent");
  });

  test("normalizes availability reasons before composing customer copy", () => {
    const actions = read("lib/reservations/sms-actions.ts");
    expect(actions).toContain("function availabilityReason");
    expect(actions).toContain('replace(/[.!?]+$/g, "")');
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
