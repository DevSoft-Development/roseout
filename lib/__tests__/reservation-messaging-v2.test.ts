import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Reservation Messaging V2", () => {
  test("uses the canonical global CRM conversation model with a reservation association", () => {
    const migration = read("supabase/migrations/20260816210000_reservation_messaging_v2_global_core.sql");
    expect(migration).toContain("public.crm_conversations");
    expect(migration).toContain("reservation_id uuid references public.location_reservations");
    expect(migration).toContain("crm_conversations_location_unread_idx");
    expect(migration).toContain("enable row level security");
  });

  test("threads outbound reservation SMS and email and gives email a reservation reply address", () => {
    const route = read("app/api/reserve/portal/reservations/message/route.ts");
    expect(route).toContain("appendReservationMessage");
    expect(route).toContain("reservationReplyTo(reservationId)");
    expect(route).toContain('channel: "sms"');
    expect(route).toContain('channel: "email"');
  });

  test("routes normal Telnyx inbound SMS into reservation threads while preserving compliance keywords", () => {
    const route = read("app/api/webhooks/telnyx/messages/route.ts");
    expect(route).toContain("findReservationForInboundSms");
    expect(route).toContain("appendReservationMessage");
    expect(route).toContain("STOP_WORDS");
    expect(route).toContain('text === "HELP"');
    expect(route).toContain('text === "CANCEL"');
  });

  test("verifies Resend inbound webhooks and fetches the received email body before routing", () => {
    const route = read("app/api/webhooks/resend/inbound/route.ts");
    expect(route).toContain("resend.webhooks.verify");
    expect(route).toContain("RESEND_WEBHOOK_SECRET");
    expect(route).toContain("resend.emails.receiving.get(emailId)");
    expect(route).toContain("findReservationForInboundEmail");
  });

  test("surfaces unread replies in Reserve and counts them as Needs Action", () => {
    const timeline = read("components/reserve/ReserveTimeline.tsx");
    const metrics = read("lib/reservations/metrics.ts");
    const reservations = read("app/api/reserve/portal/reservations/route.ts");
    expect(timeline).toContain("New reply");
    expect(timeline).toContain("ReserveConversationThread");
    expect(timeline).toContain("Reply to guest");
    expect(metrics).toContain("conversation_unread_count");
    expect(reservations).toContain("conversation_unread_count");
  });
});
