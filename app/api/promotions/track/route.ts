import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["impression","click","profile_view","outing_open","save","reservation_click","call","booking","completed_outing"]);
const CONVERSIONS = new Set(["reservation_click","call","booking","completed_outing"]);

function text(value: unknown) { return String(value ?? "").trim(); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = text(body.campaign_id);
  const eventType = text(body.event_type);
  const placement = body.placement === "search" ? "search" : "discover";
  const sessionKey = text(body.session_key) || null;
  if (!campaignId || !EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Invalid promotion event." }, { status: 400 });

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("promotion_campaigns")
    .select("id,location_id,status,total_budget_cents,spent_cents,discover_cpm_cents,search_cpc_cents,starts_at,ends_at,placements")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const now = Date.now();
  const active = campaign.status === "active" && (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= now) && (!campaign.ends_at || new Date(campaign.ends_at).getTime() >= now);
  if (!active || !Array.isArray(campaign.placements) || !campaign.placements.includes(placement)) return NextResponse.json({ ok: true, billable: false });

  const remaining = Math.max(0, Number(campaign.total_budget_cents || 0) - Number(campaign.spent_cents || 0));
  let amountCents = 0;
  if (placement === "discover" && eventType === "impression") amountCents = Math.max(1, Math.round(Number(campaign.discover_cpm_cents || 0) / 1000));
  if (placement === "search" && (eventType === "click" || eventType === "outing_open" || eventType === "profile_view")) amountCents = Number(campaign.search_cpc_cents || 0);
  amountCents = Math.min(amountCents, remaining);

  const dedupeKey = sessionKey && amountCents > 0 ? `${campaignId}:${placement}:${eventType}:${sessionKey}` : text(body.event_id) || null;
  const { data: event, error: eventError } = await supabaseAdmin
    .from("promotion_events")
    .insert({
      campaign_id: campaignId,
      location_id: campaign.location_id,
      event_type: eventType,
      placement,
      session_key: sessionKey,
      dedupe_key: dedupeKey,
      amount_cents: amountCents,
      revenue_cents: Number.isFinite(Number(body.revenue_cents)) ? Number(body.revenue_cents) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })
    .select("id")
    .single();

  if (eventError) {
    if (String(eventError.code) === "23505") return NextResponse.json({ ok: true, duplicate: true, billable: false });
    return NextResponse.json({ error: eventError.message }, { status: 400 });
  }

  if (amountCents > 0) {
    await supabaseAdmin.from("promotion_ledger_entries").insert({
      campaign_id: campaignId,
      location_id: campaign.location_id,
      entry_type: "spend",
      amount_cents: amountCents,
      event_id: event.id,
      description: placement === "discover" ? "Qualified sponsored impression" : "Qualified sponsored search engagement",
      metadata: { placement, event_type: eventType },
    });
    const nextSpent = Number(campaign.spent_cents || 0) + amountCents;
    await supabaseAdmin.from("promotion_campaigns").update({
      spent_cents: nextSpent,
      status: nextSpent >= Number(campaign.total_budget_cents || 0) ? "completed" : campaign.status,
      completed_at: nextSpent >= Number(campaign.total_budget_cents || 0) ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", campaignId);
  }

  if (CONVERSIONS.has(eventType)) {
    await supabaseAdmin.from("promotion_attributions").insert({
      campaign_id: campaignId,
      location_id: campaign.location_id,
      source_event_id: event.id,
      conversion_type: eventType,
      conversion_id: text(body.conversion_id) || null,
      attributed_revenue_cents: Number.isFinite(Number(body.revenue_cents)) ? Number(body.revenue_cents) : null,
      attribution_model: "last_click_7d",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });
  }

  return NextResponse.json({ ok: true, billable: amountCents > 0, amount_cents: amountCents });
}
