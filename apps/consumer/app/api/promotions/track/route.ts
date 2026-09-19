import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["impression","click","profile_view","outing_open","save","reservation_click","call","booking","completed_outing"]);
const CONVERSIONS = new Set(["reservation_click","call","booking","completed_outing"]);
const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    .select("id,location_id,status,total_budget_cents,spent_cents,discover_cpm_cents,search_cpc_cents,starts_at,ends_at,completed_at,placements")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!Array.isArray(campaign.placements) || !campaign.placements.includes(placement)) return NextResponse.json({ ok: true, billable: false });

  const now = Date.now();
  const active = campaign.status === "active" && (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= now) && (!campaign.ends_at || new Date(campaign.ends_at).getTime() >= now);
  const isConversion = CONVERSIONS.has(eventType);
  const attributionAnchor = campaign.completed_at || campaign.ends_at;
  const withinPostCampaignWindow = Boolean(isConversion && attributionAnchor && now - new Date(attributionAnchor).getTime() >= 0 && now - new Date(attributionAnchor).getTime() <= ATTRIBUTION_WINDOW_MS);
  if (!active && !withinPostCampaignWindow) return NextResponse.json({ ok: true, billable: false });

  let requestedAmountCents = 0;
  if (active && placement === "discover" && eventType === "impression") requestedAmountCents = Math.max(1, Math.round(Number(campaign.discover_cpm_cents || 0) / 1000));
  if (active && placement === "search" && eventType === "outing_open") requestedAmountCents = Number(campaign.search_cpc_cents || 0);

  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const revenueCents = Number.isFinite(Number(body.revenue_cents)) ? Number(body.revenue_cents) : null;
  let eventId: string | null = null;
  let amountCents = 0;

  if (requestedAmountCents > 0) {
    const billableDedupeType = placement === "search" ? "qualified_engagement" : eventType;
    const dedupeKey = sessionKey ? `${campaignId}:${placement}:${billableDedupeType}:${sessionKey}` : text(body.event_id) || null;
    const { data: result, error: billingError } = await supabaseAdmin.rpc("record_promotion_billable_event", {
      p_campaign_id: campaignId,
      p_event_type: eventType,
      p_placement: placement,
      p_session_key: sessionKey,
      p_dedupe_key: dedupeKey,
      p_requested_amount_cents: requestedAmountCents,
      p_revenue_cents: revenueCents,
      p_metadata: metadata,
    });
    if (billingError) return NextResponse.json({ error: billingError.message }, { status: 400 });
    const payload = result && typeof result === "object" ? result as Record<string, unknown> : {};
    amountCents = Number(payload.charged_cents || 0);
    if (payload.duplicate === true) return NextResponse.json({ ok: true, duplicate: true, billable: false });
    eventId = typeof payload.event_id === "string" ? payload.event_id : null;
  } else {
    const dedupeKey = text(body.event_id) || null;
    const { data: event, error: eventError } = await supabaseAdmin
      .from("promotion_events")
      .insert({
        campaign_id: campaignId,
        location_id: campaign.location_id,
        event_type: eventType,
        placement,
        session_key: sessionKey,
        dedupe_key: dedupeKey,
        amount_cents: 0,
        revenue_cents: revenueCents,
        metadata,
      })
      .select("id")
      .single();
    if (eventError) {
      if (String(eventError.code) === "23505") return NextResponse.json({ ok: true, duplicate: true, billable: false });
      return NextResponse.json({ error: eventError.message }, { status: 400 });
    }
    eventId = event.id;
  }

  if (isConversion && eventId) {
    await supabaseAdmin.from("promotion_attributions").insert({
      campaign_id: campaignId,
      location_id: campaign.location_id,
      source_event_id: eventId,
      conversion_type: eventType,
      conversion_id: text(body.conversion_id) || null,
      attributed_revenue_cents: revenueCents,
      attribution_model: "last_click_7d",
      metadata,
    });
  }

  return NextResponse.json({ ok: true, billable: amountCents > 0, amount_cents: amountCents, attributed: isConversion });
}
