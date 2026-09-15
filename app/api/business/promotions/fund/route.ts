import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";

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
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.funded_at) return NextResponse.json({ error: "Campaign is already funded." }, { status: 409 });
  const amount = Number(campaign.total_budget_cents || 0);
  if (amount < 2500) return NextResponse.json({ error: "Campaign budget must be at least $25." }, { status: 400 });

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${getSiteUrl()}/locations/dashboard/promotions?locationId=${encodeURIComponent(canonicalId)}&funded=1&campaign=${encodeURIComponent(campaignId)}`);
  form.set("cancel_url", `${getSiteUrl()}/locations/dashboard/promotions?locationId=${encodeURIComponent(canonicalId)}&fundingCanceled=1&campaign=${encodeURIComponent(campaignId)}`);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][product_data][name]", `TheOutHaven promotion budget — ${campaign.name}`);
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][quantity]", "1");
  form.set("payment_intent_data[metadata][type]", "promotion_campaign");
  form.set("payment_intent_data[metadata][campaign_id]", campaignId);
  form.set("payment_intent_data[metadata][location_id]", canonicalId);
  form.set("metadata[type]", "promotion_campaign");
  form.set("metadata[campaign_id]", campaignId);
  form.set("metadata[location_id]", canonicalId);

  const session = await stripeRequest<{ id: string; url?: string }>("/checkout/sessions", {
    body: form,
    idempotencyKey: `promotion-fund-${campaignId}-${amount}`,
    mode: getStripeModeForLocation(access.location),
  });
  await supabaseAdmin.from("promotion_campaigns").update({ stripe_checkout_session_id: session.id, status: "pending_funding", updated_at: new Date().toISOString() }).eq("id", campaignId);
  if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
