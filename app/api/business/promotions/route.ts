import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

function text(value: unknown) { return String(value ?? "").trim(); }
function cents(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; }
function isoOrNull(value: unknown) { const raw = text(value); if (!raw) return null; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

async function authFor(locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, access };
}

async function loadCampaignMetrics(campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, any>();
  const [{ data: events }, { data: attributions }] = await Promise.all([
    supabaseAdmin.from("promotion_events").select("campaign_id,event_type,amount_cents").in("campaign_id", campaignIds),
    supabaseAdmin.from("promotion_attributions").select("campaign_id,conversion_type,attributed_revenue_cents").in("campaign_id", campaignIds),
  ]);
  const map = new Map<string, any>();
  for (const id of campaignIds) map.set(id, { impressions: 0, clicks: 0, profile_views: 0, outing_opens: 0, saves: 0, reservation_clicks: 0, calls: 0, bookings: 0, completed_outings: 0, spend_cents: 0, attributed_revenue_cents: 0 });
  for (const row of events || []) {
    const m = map.get(String(row.campaign_id)); if (!m) continue;
    if (row.event_type === "impression") m.impressions += 1;
    if (row.event_type === "click") m.clicks += 1;
    if (row.event_type === "profile_view") m.profile_views += 1;
    if (row.event_type === "outing_open") m.outing_opens += 1;
    if (row.event_type === "save") m.saves += 1;
    if (row.event_type === "reservation_click") m.reservation_clicks += 1;
    if (row.event_type === "call") m.calls += 1;
    if (row.event_type === "booking") m.bookings += 1;
    if (row.event_type === "completed_outing") m.completed_outings += 1;
    m.spend_cents += Number(row.amount_cents || 0);
  }
  for (const row of attributions || []) {
    const m = map.get(String(row.campaign_id)); if (!m) continue;
    m.attributed_revenue_cents += Number(row.attributed_revenue_cents || 0);
  }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = text(searchParams.get("locationId") || searchParams.get("location_id"));
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  const auth = await authFor(locationId); if ("error" in auth) return auth.error;
  const canonicalId = String(auth.access.location.id);
  const { data: campaigns, error } = await supabaseAdmin.from("promotion_campaigns").select("*").eq("location_id", canonicalId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const metrics = await loadCampaignMetrics((campaigns || []).map((row: any) => String(row.id)));
  const enriched = (campaigns || []).map((campaign: any) => ({ ...campaign, metrics: metrics.get(String(campaign.id)) || {} }));
  return NextResponse.json({ campaigns: enriched, location: { id: canonicalId, name: auth.access.location.name || auth.access.location.restaurant_name || auth.access.location.activity_name || "Your location" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locationId = text(body.location_id || body.locationId);
  if (!locationId) return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  const auth = await authFor(locationId); if ("error" in auth) return auth.error;
  const canonicalId = String(auth.access.location.id);
  const placements = Array.isArray(body.placements) ? body.placements.filter((v: unknown) => v === "discover" || v === "search") : ["discover", "search"];
  const totalBudget = cents(body.total_budget_cents);
  if (placements.length === 0) return NextResponse.json({ error: "Choose Discover, Search, or both." }, { status: 400 });
  if (totalBudget < 2500) return NextResponse.json({ error: "Campaign budget must be at least $25." }, { status: 400 });
  const startsAt = isoOrNull(body.starts_at);
  const endsAt = isoOrNull(body.ends_at);
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("promotion_campaigns").insert({
    location_id: canonicalId,
    name: text(body.name) || "Sponsored promotion",
    promotion_type: ["location","outing","event","experience"].includes(body.promotion_type) ? body.promotion_type : "location",
    placements,
    audience_mode: body.audience_mode === "manual" ? "manual" : "auto",
    targeting: body.targeting && typeof body.targeting === "object" ? body.targeting : {},
    creative: body.creative && typeof body.creative === "object" ? body.creative : {},
    total_budget_cents: totalBudget,
    daily_budget_cents: cents(body.daily_budget_cents) || null,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "pending_funding",
    created_by: auth.user.id,
    metadata: { created_from: "locations_dashboard", pricing_model: { discover: "cpm", search: "cpc" } },
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = text(body.id || body.campaign_id);
  const locationId = text(body.location_id || body.locationId);
  if (!campaignId || !locationId) return NextResponse.json({ error: "Campaign and location are required." }, { status: 400 });
  const auth = await authFor(locationId); if ("error" in auth) return auth.error;
  const canonicalId = String(auth.access.location.id);
  const { data: campaign } = await supabaseAdmin.from("promotion_campaigns").select("*").eq("id", campaignId).eq("location_id", canonicalId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const action = text(body.action);
  const now = new Date().toISOString();

  if (action === "pause") {
    await supabaseAdmin.from("promotion_campaigns").update({ status: "paused", paused_at: now, updated_at: now }).eq("id", campaignId);
    return NextResponse.json({ ok: true, status: "paused" });
  }
  if (action === "resume") {
    let nextStatus = "pending_funding";
    if (campaign.funded_at) {
      if (Number(campaign.spent_cents || 0) >= Number(campaign.total_budget_cents || 0)) nextStatus = "completed";
      else if (campaign.starts_at && new Date(campaign.starts_at).getTime() > Date.now()) nextStatus = "scheduled";
      else nextStatus = "active";
    }
    await supabaseAdmin.from("promotion_campaigns").update({ status: nextStatus, paused_at: null, updated_at: now }).eq("id", campaignId);
    return NextResponse.json({ ok: true, status: nextStatus });
  }
  if (action === "cancel") {
    const unused = Math.max(0, Number(campaign.total_budget_cents || 0) - Number(campaign.spent_cents || 0));
    let refundId: string | null = null;
    let refundedCents = 0;
    if (unused > 0 && campaign.stripe_payment_intent_id) {
      const form = new URLSearchParams();
      form.set("payment_intent", String(campaign.stripe_payment_intent_id));
      form.set("amount", String(unused));
      form.set("metadata[campaign_id]", campaignId);
      form.set("metadata[location_id]", canonicalId);
      const refund = await stripeRequest<{ id: string }>("/refunds", { body: form, idempotencyKey: `promotion-refund-${campaignId}-${unused}`, mode: getStripeModeForLocation(auth.access.location) });
      refundId = refund.id;
      refundedCents = unused;
      await supabaseAdmin.from("promotion_ledger_entries").insert({ campaign_id: campaignId, location_id: canonicalId, entry_type: "refund", amount_cents: -unused, stripe_object_id: refund.id, description: "Unused campaign budget refund", metadata: { unused_budget_cents: unused } });
    }
    await supabaseAdmin.from("promotion_campaigns").update({ status: "cancelled", completed_at: now, updated_at: now, metadata: { ...(campaign.metadata || {}), refund_id: refundId, unused_refund_cents: refundedCents } }).eq("id", campaignId);
    return NextResponse.json({ ok: true, status: "cancelled", refunded_cents: refundedCents, refund_id: refundId });
  }

  if (campaign.status !== "draft" && campaign.status !== "pending_funding") return NextResponse.json({ error: "Only draft or unfunded campaigns can be edited." }, { status: 409 });
  const updates: Record<string, unknown> = { updated_at: now };
  if ("name" in body) updates.name = text(body.name) || campaign.name;
  if (Array.isArray(body.placements)) updates.placements = body.placements.filter((v: unknown) => v === "discover" || v === "search");
  if ("audience_mode" in body) updates.audience_mode = body.audience_mode === "manual" ? "manual" : "auto";
  if (body.targeting && typeof body.targeting === "object") updates.targeting = body.targeting;
  if (body.creative && typeof body.creative === "object") updates.creative = body.creative;
  if ("daily_budget_cents" in body) updates.daily_budget_cents = cents(body.daily_budget_cents) || null;
  if ("starts_at" in body) updates.starts_at = isoOrNull(body.starts_at);
  if ("ends_at" in body) updates.ends_at = isoOrNull(body.ends_at);
  const { data, error } = await supabaseAdmin.from("promotion_campaigns").update(updates).eq("id", campaignId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaign: data });
}
