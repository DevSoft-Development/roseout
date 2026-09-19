import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = String(body.campaign_id || "").trim();
  const locationId = String(body.location_id || "").trim();
  if (!campaignId || !locationId) return NextResponse.json({ error: "Campaign and location are required." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canonicalId = String(access.location.id);
  const { data: campaign } = await supabaseAdmin.from("promotion_campaigns").select("*").eq("id", campaignId).eq("location_id", canonicalId).maybeSingle();
  if (!campaign?.stripe_checkout_session_id) return NextResponse.json({ error: "Funding session not found." }, { status: 404 });
  if (campaign.funded_at) return NextResponse.json({ ok: true, status: campaign.status });

  const session = await stripeRequest<any>(`/checkout/sessions/${encodeURIComponent(campaign.stripe_checkout_session_id)}?expand[]=payment_intent`, { method: "GET", mode: getStripeModeForLocation(access.location) });
  if (session.payment_status !== "paid") return NextResponse.json({ error: "Campaign funding has not completed." }, { status: 409 });
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : 0;
  const nextStatus = startsAt > Date.now() ? "scheduled" : "active";
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin.from("promotion_ledger_entries").select("id").eq("campaign_id", campaignId).eq("entry_type", "fund").limit(1).maybeSingle();
  if (!existing) await supabaseAdmin.from("promotion_ledger_entries").insert({ campaign_id: campaignId, location_id: canonicalId, entry_type: "fund", amount_cents: Number(campaign.total_budget_cents || 0), stripe_object_id: paymentIntentId || session.id, description: "Campaign budget funded", metadata: { checkout_session_id: session.id } });
  await supabaseAdmin.from("promotion_campaigns").update({ funded_at: now, activated_at: nextStatus === "active" ? now : null, stripe_payment_intent_id: paymentIntentId, status: nextStatus, updated_at: now }).eq("id", campaignId);
  return NextResponse.json({ ok: true, status: nextStatus });
}
