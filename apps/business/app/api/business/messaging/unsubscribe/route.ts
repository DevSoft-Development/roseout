import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function page(title: string, body: string, recipientId?: string) {
  const form = recipientId
    ? '<form method="post"><input type="hidden" name="recipient" value="' + recipientId.replace(/"/g, "") + '"><button type="submit" style="border:0;border-radius:999px;background:#e1062a;color:white;padding:12px 20px;font-weight:800;cursor:pointer">Unsubscribe</button></form>'
    : "";
  return new NextResponse(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head><body style="margin:0;background:#090706;color:#fff7f2;font-family:Arial,sans-serif"><main style="max-width:560px;margin:72px auto;padding:32px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:#141010"><div style="font-size:22px;font-weight:900">TheOutHaven</div><h1 style="margin-top:28px">' + title + '</h1><p style="color:#b8aaa3;line-height:1.6">' + body + '</p>' + form + '</main></body></html>',
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

async function loadRecipient(id: string) {
  return supabaseAdmin
    .from("location_messaging_recipients")
    .select("id,campaign_id,vip_signup_id,location_id,channel,email,phone,unsubscribed_at")
    .eq("id", id)
    .maybeSingle();
}

export async function GET(request: Request) {
  const id = String(new URL(request.url).searchParams.get("recipient") || "").trim();
  if (!id) return page("Unsubscribe", "This unsubscribe link is incomplete.");
  const { data: recipient } = await loadRecipient(id);
  if (!recipient) return page("Unsubscribe", "This unsubscribe link is no longer available.");
  if (recipient.unsubscribed_at) return page("Already unsubscribed", "You are already unsubscribed from this business messaging channel.");
  return page("Unsubscribe from updates?", "Confirm below to stop receiving this business's " + String(recipient.channel || "marketing") + " messages through TheOutHaven.", id);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let id = "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    id = String(body.recipient || "").trim();
  } else {
    const form = await request.formData().catch(() => null);
    id = String(form?.get("recipient") || "").trim();
  }
  if (!id) return page("Unsubscribe", "This unsubscribe request is incomplete.");

  const { data: recipient } = await loadRecipient(id);
  if (!recipient?.vip_signup_id) return page("Unsubscribe", "This unsubscribe link is no longer available.");
  if (recipient.unsubscribed_at) return page("Already unsubscribed", "You are already unsubscribed from this business messaging channel.");

  const now = new Date().toISOString();
  const channel = recipient.channel === "sms" ? "sms" : "email";
  const vipUpdates = channel === "sms"
    ? { sms_consent: false, sms_unsubscribed_at: now, updated_at: now }
    : { email_consent: false, email_unsubscribed_at: now, updated_at: now };

  const suppression = {
    location_id: recipient.location_id,
    email: channel === "email" ? recipient.email : null,
    phone: channel === "sms" ? recipient.phone : null,
    channel,
    reason: "recipient_unsubscribe",
    source: "business_campaign",
    metadata: { recipient_id: recipient.id, campaign_id: recipient.campaign_id },
  };

  const [vipUpdate, recipientUpdate] = await Promise.all([
    supabaseAdmin.from("location_vip_signups").update(vipUpdates).eq("id", recipient.vip_signup_id).eq("location_id", recipient.location_id),
    supabaseAdmin.from("location_messaging_recipients").update({ unsubscribed_at: now, updated_at: now }).eq("id", recipient.id),
  ]);
  if (vipUpdate.error || recipientUpdate.error) {
    return page("Unsubscribe", "We could not update your preference. Please try again.");
  }

  const { data: existingSuppression } = await supabaseAdmin
    .from("location_messaging_suppression")
    .select("id")
    .eq("location_id", recipient.location_id)
    .eq("channel", channel)
    .eq(channel === "email" ? "email" : "phone", channel === "email" ? recipient.email : recipient.phone)
    .maybeSingle();
  if (!existingSuppression) await supabaseAdmin.from("location_messaging_suppression").insert(suppression);

  return page("Unsubscribed", "Your preference has been updated. You will no longer receive this business's " + channel + " marketing messages through TheOutHaven.");
}
