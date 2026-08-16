import { NextResponse } from "next/server";
import { Resend } from "resend";
import { extractLatestEmailReply } from "@/lib/communications/email-reply";
import { appendReservationMessage, findReservationForInboundEmail } from "@/lib/communications/reservation-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) return NextResponse.json({ error: "Resend inbound is not configured." }, { status: 503 });

  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });

  const resend: any = new Resend(apiKey);
  let event: any;
  try {
    event = await Promise.resolve(resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    }));
  } catch {
    return NextResponse.json({ error: "Invalid Resend webhook signature." }, { status: 403 });
  }

  if (event?.type !== "email.received") return NextResponse.json({ received: true, ignored: true });
  const emailId = String(event?.data?.email_id || "");
  if (!emailId) return NextResponse.json({ error: "Missing inbound email ID." }, { status: 400 });

  const detail = await resend.emails.receiving.get(emailId);
  if (detail?.error || !detail?.data) return NextResponse.json({ error: detail?.error?.message || "Inbound email content could not be loaded." }, { status: 502 });

  const email = detail.data;
  const from = String(email.from || event?.data?.from || "").trim().toLowerCase();
  const to = (Array.isArray(email.to) ? email.to : event?.data?.to || []).map((value: unknown) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const reservation = await findReservationForInboundEmail({ from, to });
  if (!reservation) {
    // Do not guess when one email address could map to multiple active reservations.
    return NextResponse.json({ received: true, routed: false, reason: "no_unambiguous_reservation" });
  }

  const rawBody = String(email.text || "").trim() || String(email.html || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ").trim();
  const body = extractLatestEmailReply(rawBody);
  await appendReservationMessage({
    reservation,
    direction: "inbound",
    channel: "email",
    body: body || "(Email received with no new reply text)",
    subject: String(email.subject || event?.data?.subject || "Reservation reply"),
    provider: "resend",
    providerMessageId: emailId,
    providerThreadId: String(email.message_id || event?.data?.message_id || "") || null,
    sourceRecordId: `resend-inbound:${emailId}`,
    recipientAddress: from,
    metadata: { to, headers: email.headers || null, raw_body_length: rawBody.length, extracted_body_length: body.length },
  });

  return NextResponse.json({ received: true, routed: true, reservation_id: reservation.id });
}
