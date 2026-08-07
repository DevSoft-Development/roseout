import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateTwilioWebhook } from "@/lib/sms/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const body = Object.fromEntries(formData.entries());
    const params = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, String(value)]),
    );

    const signature = req.headers.get("x-twilio-signature");
    if (!validateTwilioWebhook({ signature, url: req.url, params })) {
      return new Response("Invalid Twilio signature.", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const text = pickString(body.Body || body.body || body.message).toUpperCase();
    const from = pickString(body.From || body.from);

    if (!from) {
      return new Response("Missing sender.", { status: 400, headers: { "Content-Type": "text/plain" } });
    }

    if (text === "STOP") {
      const optedOutAt = new Date().toISOString();
      await Promise.allSettled([
        supabaseAdmin
          .from("marketing_subscribers")
          .update({ sms_opt_in: false, sms_opted_out_at: optedOutAt })
          .eq("phone", from),
        supabaseAdmin
          .from("user_marketing_preferences")
          .update({ sms_opt_in: false, sms_opted_out_at: optedOutAt })
          .eq("phone", from),
      ]);

      await supabaseAdmin.from("sms_logs").insert({
        customer_phone: from,
        message_type: "incoming_stop",
        message_body: text,
        provider: "twilio",
        status: "received",
        created_at: new Date().toISOString(),
      });
      return new Response("You have been opted out of TheOutHaven SMS updates.", { headers: { "Content-Type": "text/plain" } });
    }

    if (text === "HELP") {
      return new Response("TheOutHaven: reply CANCEL to cancel your latest reservation, or contact support for help.", { headers: { "Content-Type": "text/plain" } });
    }

    if (text === "CANCEL") {
      const { data: reservation, error } = await supabaseAdmin
        .from("location_reservations")
        .select("id, location_id")
        .eq("customer_phone", from)
        .in("status", ["pending", "confirmed", "checked_in", "arrived"])
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        return new Response(error.message, { status: 500, headers: { "Content-Type": "text/plain" } });
      }

      if (!reservation) {
        return new Response("No active TheOutHaven reservation was found for this phone number.", { headers: { "Content-Type": "text/plain" } });
      }

      await supabaseAdmin
        .from("location_reservations")
        .update({ status: "cancelled", customer_cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", reservation.id);

      await supabaseAdmin.from("sms_logs").insert({
        location_id: reservation.location_id,
        reservation_id: reservation.id,
        customer_phone: from,
        message_type: "incoming_cancel",
        message_body: text,
        provider: "twilio",
        status: "received",
        created_at: new Date().toISOString(),
      });

      return new Response("Your TheOutHaven reservation has been cancelled.", { headers: { "Content-Type": "text/plain" } });
    }

    return new Response("TheOutHaven received your reply. Supported replies: STOP, HELP, CANCEL.", { headers: { "Content-Type": "text/plain" } });
  } catch (error: unknown) {
    return new Response(error instanceof Error ? error.message : "Could not process SMS reply.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
}
