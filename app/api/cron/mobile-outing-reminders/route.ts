import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendExpoPush } from "@/lib/mobile/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: NextRequest) {
  const expected = process.env.MOBILE_OUTING_REMINDER_CRON_SECRET;
  return Boolean(expected && request.headers.get("x-cron-secret") === expected);
}

async function deliver(kind: "two_hour" | "thirty_minute", minMinutes: number, maxMinutes: number) {
  const admin = getSupabaseAdminClient();
  const now = Date.now();
  const from = new Date(now + minMinutes * 60_000).toISOString();
  const to = new Date(now + maxMinutes * 60_000).toISOString();

  const { data: outings, error } = await admin
    .from("user_outings")
    .select("id,user_id,title,outing_date,restaurant_name,activity_name,status")
    .gte("outing_date", from)
    .lte("outing_date", to)
    .in("status", ["booked", "active"])
    .limit(100);
  if (error) throw error;

  let sent = 0;
  let failed = 0;

  for (const outing of outings || []) {
    const { data: devices } = await admin
      .from("mobile_push_devices")
      .select("id,expo_push_token")
      .eq("user_id", outing.user_id)
      .eq("notifications_enabled", true)
      .eq("transactional_enabled", true);

    for (const device of devices || []) {
      const { data: existing } = await admin
        .from("mobile_push_deliveries")
        .select("id,status")
        .eq("user_outing_id", outing.id)
        .eq("device_id", device.id)
        .eq("reminder_kind", kind)
        .maybeSingle();
      if (existing?.status === "sent") continue;

      const title = kind === "two_hour" ? "Your OUTing is coming up" : "Almost time for your OUTing";
      const place = outing.restaurant_name || outing.activity_name || outing.title || "your first stop";
      const body = kind === "two_hour"
        ? `About 2 hours to go. Your plan starts with ${place}.`
        : "About 30 minutes to go. Open TheOutHaven for your NOW / NEXT plan.";

      try {
        const ticket = await sendExpoPush({
          to: device.expo_push_token,
          title,
          body,
          channelId: "outing-reminders",
          data: { type: "outing_reminder", outingId: String(outing.id), reminderKind: kind },
        });
        await admin.from("mobile_push_deliveries").upsert({
          user_id: outing.user_id,
          user_outing_id: outing.id,
          device_id: device.id,
          reminder_kind: kind,
          status: "sent",
          provider_message_id: ticket.id,
          last_error: null,
          sent_at: new Date().toISOString(),
        }, { onConflict: "user_outing_id,device_id,reminder_kind" });
        sent += 1;
      } catch (pushError) {
        await admin.from("mobile_push_deliveries").upsert({
          user_id: outing.user_id,
          user_outing_id: outing.id,
          device_id: device.id,
          reminder_kind: kind,
          status: "failed",
          last_error: pushError instanceof Error ? pushError.message.slice(0, 1000) : "Push delivery failed",
        }, { onConflict: "user_outing_id,device_id,reminder_kind" });
        failed += 1;
      }
    }
  }

  return { outings: outings?.length || 0, sent, failed };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const [twoHour, thirtyMinute] = await Promise.all([
      deliver("two_hour", 110, 130),
      deliver("thirty_minute", 20, 40),
    ]);
    return json({ ok: true, twoHour, thirtyMinute });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "mobile_reminder_failed" }, 500);
  }
}
