import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ensureFunded(campaign: any, location: any) {
  if (campaign.funded_at || !campaign.stripe_checkout_session_id) return { funded: Boolean(campaign.funded_at), changed: false };
  const session = await stripeRequest<any>(`/checkout/sessions/${encodeURIComponent(campaign.stripe_checkout_session_id)}?expand[]=payment_intent`, {
    method: "GET",
    mode: getStripeModeForLocation(location),
  });
  if (session.payment_status !== "paid") return { funded: false, changed: false };

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const { data: existingFund } = await supabaseAdmin
    .from("promotion_ledger_entries")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("entry_type", "fund")
    .limit(1)
    .maybeSingle();
  if (!existingFund) {
    await supabaseAdmin.from("promotion_ledger_entries").insert({
      campaign_id: campaign.id,
      location_id: campaign.location_id,
      entry_type: "fund",
      amount_cents: Number(campaign.total_budget_cents || 0),
      stripe_object_id: paymentIntentId || session.id,
      description: "Campaign budget funded",
      metadata: { checkout_session_id: session.id, reconciled: true },
    });
  }

  const now = Date.now();
  const starts = campaign.starts_at ? new Date(campaign.starts_at).getTime() : 0;
  const ends = campaign.ends_at ? new Date(campaign.ends_at).getTime() : Number.POSITIVE_INFINITY;
  const status = ends <= now ? "completed" : starts > now ? "scheduled" : "active";
  const timestamp = new Date().toISOString();
  await supabaseAdmin.from("promotion_campaigns").update({
    funded_at: timestamp,
    stripe_payment_intent_id: paymentIntentId,
    status,
    activated_at: status === "active" ? timestamp : campaign.activated_at || null,
    completed_at: status === "completed" ? timestamp : campaign.completed_at || null,
    updated_at: timestamp,
  }).eq("id", campaign.id);
  return { funded: true, changed: true, paymentIntentId, status };
}

async function refundUnused(campaign: any, location: any) {
  const unused = Math.max(0, Number(campaign.total_budget_cents || 0) - Number(campaign.spent_cents || 0));
  if (unused <= 0 || !campaign.stripe_payment_intent_id) return { refunded: 0, refundId: null };
  const { data: existingRefund } = await supabaseAdmin
    .from("promotion_ledger_entries")
    .select("id,amount_cents,stripe_object_id")
    .eq("campaign_id", campaign.id)
    .eq("entry_type", "refund")
    .limit(1)
    .maybeSingle();
  if (existingRefund) return { refunded: Math.abs(Number(existingRefund.amount_cents || 0)), refundId: existingRefund.stripe_object_id || null };

  const form = new URLSearchParams();
  form.set("payment_intent", String(campaign.stripe_payment_intent_id));
  form.set("amount", String(unused));
  form.set("metadata[campaign_id]", String(campaign.id));
  form.set("metadata[location_id]", String(campaign.location_id));
  const refund = await stripeRequest<{ id: string }>("/refunds", {
    body: form,
    idempotencyKey: `promotion-expiry-refund-${campaign.id}-${unused}`,
    mode: getStripeModeForLocation(location),
  });
  await supabaseAdmin.from("promotion_ledger_entries").insert({
    campaign_id: campaign.id,
    location_id: campaign.location_id,
    entry_type: "refund",
    amount_cents: -unused,
    stripe_object_id: refund.id,
    description: "Unused campaign budget automatically returned at campaign end",
    metadata: { unused_budget_cents: unused, reconciled: true },
  });
  return { refunded: unused, refundId: refund.id };
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: campaigns, error } = await supabaseAdmin
    .from("promotion_campaigns")
    .select("*")
    .in("status", ["pending_funding", "scheduled", "active"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const locationIds = [...new Set((campaigns || []).map((campaign: any) => String(campaign.location_id)))];
  const { data: locations } = locationIds.length
    ? await supabaseAdmin.from("locations").select("*").in("id", locationIds)
    : { data: [] as any[] };
  const locationMap = new Map((locations || []).map((location: any) => [String(location.id), location]));

  const summary = { checked: 0, funded: 0, activated: 0, completed: 0, refunded_cents: 0, errors: 0 };
  for (const original of campaigns || []) {
    summary.checked += 1;
    const location = locationMap.get(String(original.location_id));
    if (!location) { summary.errors += 1; continue; }
    try {
      let campaign: any = original;
      if (campaign.status === "pending_funding") {
        const result = await ensureFunded(campaign, location);
        if (!result.funded) continue;
        if (result.changed) summary.funded += 1;
        const { data: refreshed } = await supabaseAdmin.from("promotion_campaigns").select("*").eq("id", campaign.id).single();
        campaign = refreshed || campaign;
      }

      const now = Date.now();
      const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : 0;
      const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : Number.POSITIVE_INFINITY;
      if (campaign.status === "scheduled" && startsAt <= now && endsAt > now) {
        await supabaseAdmin.from("promotion_campaigns").update({ status: "active", activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaign.id);
        summary.activated += 1;
        campaign.status = "active";
      }
      if ((campaign.status === "active" || campaign.status === "scheduled") && endsAt <= now) {
        const refund = await refundUnused(campaign, location);
        await supabaseAdmin.from("promotion_campaigns").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...(campaign.metadata || {}), automatic_end: true, unused_refund_cents: refund.refunded, refund_id: refund.refundId },
        }).eq("id", campaign.id);
        summary.completed += 1;
        summary.refunded_cents += refund.refunded;
      }
    } catch (campaignError) {
      summary.errors += 1;
      console.error("PROMOTION_RECONCILE_ERROR", original.id, campaignError);
    }
  }

  return NextResponse.json({ ok: summary.errors === 0, ...summary });
}
