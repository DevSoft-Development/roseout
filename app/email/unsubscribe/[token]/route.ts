import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#09090b;color:#fff;font-family:Arial,sans-serif"><main style="max-width:620px;margin:12vh auto;padding:32px"><div style="font-weight:900;font-size:28px">TheOutHaven</div><div style="margin-top:24px;border:1px solid #27272a;border-radius:24px;padding:28px;background:#111113"><h1 style="margin:0 0 12px;font-size:24px">${title}</h1><p style="color:#c4c4c8;line-height:1.6">${message}</p><p style="margin-top:24px"><a href="https://theouthaven.com" style="color:#fb7185">Return to TheOutHaven</a></p></div></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return page("Link not valid", "This unsubscribe link is not valid.", 400);

  const { data: row, error } = await supabaseAdmin
    .from("crm_unsubscribe_tokens")
    .select("id,contact_id,location_id,sequence_enrollment_id,email,used_at,expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) return page("Unable to update preferences", "We could not update your email preference right now. Please contact support@theouthaven.com.", 500);
  if (!row) return page("Link not found", "This unsubscribe link is no longer available.", 404);
  if (row.used_at) return page("Already unsubscribed", "Business outreach email for this address has already been stopped.");
  if (new Date(row.expires_at).getTime() <= Date.now()) return page("Link expired", "This unsubscribe link has expired. Please contact support@theouthaven.com if you need help.", 410);

  const now = new Date().toISOString();
  const normalized = String(row.email || "").trim().toLowerCase();
  const { data: existingSuppression } = await supabaseAdmin
    .from("crm_suppression_entries")
    .select("id")
    .eq("channel", "email")
    .eq("address", normalized)
    .eq("suppression_type", "manual_unsubscribe")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const writes: PromiseLike<any>[] = [
    supabaseAdmin.from("crm_unsubscribe_tokens").update({ used_at: now }).eq("id", row.id),
  ];
  if (!existingSuppression) {
    writes.push(supabaseAdmin.from("crm_suppression_entries").insert({
      contact_id: row.contact_id,
      channel: "email",
      address: normalized,
      suppression_type: "manual_unsubscribe",
      reason: "Recipient unsubscribed from TheOutHaven business outreach",
      source: "gtm_unsubscribe",
      provider: "theouthaven",
      is_active: true,
      metadata: { location_id: row.location_id, sequence_enrollment_id: row.sequence_enrollment_id },
    }));
  }
  if (row.contact_id) writes.push(supabaseAdmin.from("crm_contacts").update({ email_consent_status: "unsubscribed", updated_at: now }).eq("id", row.contact_id));
  await Promise.all(writes);

  if (row.location_id) {
    await Promise.all([
      supabaseAdmin.rpc("gtm_exit_location_sequences", { p_location_id: row.location_id, p_reason: "email_unsubscribed", p_keys: ["business-claim-outreach", "business-claim-follow-up", "essentials-conversion"] }),
      supabaseAdmin.from("gtm_events").insert({ location_id: row.location_id, contact_id: row.contact_id, event_type: "email_unsubscribed", channel: "email", source: "gtm_unsubscribe", occurred_at: now, metadata: { sequence_enrollment_id: row.sequence_enrollment_id } }),
    ]);
  }

  return page("You're unsubscribed", "We will no longer send business acquisition or promotional outreach to this email address. Operational messages related to an account, claim, reservation, support request, or other service you use may still be sent when necessary.");
}
