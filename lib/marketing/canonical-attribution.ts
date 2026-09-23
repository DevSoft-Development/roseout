import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

type ChannelClass = "organic" | "sponsored" | "owned" | "unknown";
type RevenueKind = "none" | "estimated" | "confirmed";

type AttributionRow = {
  dedupe_key: string;
  location_id?: string | null;
  search_id?: string | null;
  search_event_row_id?: number | null;
  result_impression_id?: string | null;
  promotion_campaign_id?: string | null;
  promotion_event_id?: string | null;
  reservation_id?: string | null;
  visit_id?: string | null;
  review_id?: string | null;
  experience_booking_id?: string | null;
  event_ticket_order_id?: string | null;
  lead_id?: string | null;
  content_item_id?: string | null;
  social_post_id?: string | null;
  campaign_id?: string | null;
  event_type: string;
  user_id?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  channel_class?: ChannelClass | null;
  attribution_model?: string | null;
  touchpoint_type?: string | null;
  conversion_id?: string | null;
  is_conversion?: boolean;
  revenue_cents?: number;
  revenue_kind?: RevenueKind;
  currency?: string;
  source_event_id?: string | null;
  metadata?: Record<string, unknown>;
  occurred_at: string;
  updated_at: string;
};

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uuid(value: unknown) {
  const raw = stringValue(value);
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

function channelForAnalytics(row: any): ChannelClass {
  const metadata = asObject(row.metadata);
  if (metadata.sponsored === true || uuid(metadata.promotion_campaign_id) || uuid(metadata.campaign_id)) return "sponsored";
  const source = String(row.source || metadata.utm_source || "").toLowerCase();
  const medium = String(metadata.utm_medium || "").toLowerCase();
  if (["email", "sms", "social", "instagram", "facebook", "tiktok", "youtube", "qr", "website"].some((part) => source.includes(part) || medium.includes(part))) {
    return "owned";
  }
  if (row.search_id || /search|planner|plan|location|profile|reservation/i.test(String(row.canonical_event_name || row.event_name || row.event_type || ""))) {
    return "organic";
  }
  return "unknown";
}

function touchpointForEvent(name: string) {
  const value = name.toLowerCase();
  if (/impression|view/.test(value)) return "impression";
  if (/click|opened|started/.test(value)) return "engagement";
  if (/reservation|booking/.test(value)) return "booking";
  if (/visit|check.?in|completed_outing/.test(value)) return "visit";
  if (/review/.test(value)) return "review";
  if (/save/.test(value)) return "save";
  return "event";
}

function isConversionEvent(name: string) {
  return /reservation_(confirmed|booked)|booking_(confirmed|completed)|external_reservation_confirmed|completed_outing|outing_completed|verified_visit|review_submitted/i.test(name);
}

async function upsertRows(rows: AttributionRow[]) {
  if (!rows.length) return 0;
  let written = 0;
  for (let index = 0; index < rows.length; index += 250) {
    const batch = rows.slice(index, index + 250);
    const { error } = await supabaseAdmin
      .from("marketing_attribution_events")
      .upsert(batch, { onConflict: "dedupe_key" });
    if (error) throw error;
    written += batch.length;
  }
  return written;
}

async function analyticsRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("analytics_events")
    .select("id,canonical_event_name,event_name,event_type,user_id,anonymous_id,session_id,location_id,search_id,search_event_id,result_impression_id,source,metadata,created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;

  const now = new Date().toISOString();
  return (data || []).flatMap((row: any) => {
    const metadata = asObject(row.metadata);
    const resolvedLocationId = uuid(row.location_id) || uuid(metadata.location_id) || uuid(metadata.source_location_id);
    if (locationId && resolvedLocationId !== locationId) return [];
    const eventName = String(row.canonical_event_name || row.event_name || row.event_type || "analytics_event");
    const channelClass = channelForAnalytics(row);
    const promotionCampaignId = uuid(metadata.promotion_campaign_id) || uuid(metadata.campaign_id) || (channelClass === "sponsored" ? uuid(metadata.sponsor_id) : null);
    return [{
      dedupe_key: `analytics:${row.id}`,
      location_id: resolvedLocationId,
      search_id: uuid(row.search_id),
      result_impression_id: stringValue(row.result_impression_id),
      promotion_campaign_id: promotionCampaignId,
      event_type: eventName,
      user_id: uuid(row.user_id),
      anonymous_id: stringValue(row.anonymous_id),
      session_id: stringValue(row.session_id),
      source: stringValue(row.source) || stringValue(metadata.utm_source),
      medium: stringValue(metadata.utm_medium),
      campaign: stringValue(metadata.utm_campaign),
      channel_class: channelClass,
      attribution_model: "observed_touch",
      touchpoint_type: touchpointForEvent(eventName),
      conversion_id: stringValue(metadata.reservation_id) || stringValue(metadata.booking_id) || stringValue(metadata.outing_id),
      is_conversion: isConversionEvent(eventName),
      revenue_cents: 0,
      revenue_kind: "none" as const,
      currency: "usd",
      source_event_id: uuid(row.id),
      metadata: {
        analytics_event_type: row.event_type || null,
        search_event_id: row.search_event_id || null,
        raw_metadata: metadata,
      },
      occurred_at: row.created_at,
      updated_at: now,
    }];
  });
}

async function promotionRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("promotion_attributions")
    .select("id,campaign_id,location_id,source_event_id,conversion_type,conversion_id,attributed_revenue_cents,attribution_model,attributed_at,metadata")
    .gte("attributed_at", cutoff)
    .order("attributed_at", { ascending: true })
    .limit(5000);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;
  const now = new Date().toISOString();
  return (data || []).map((row: any): AttributionRow => ({
    dedupe_key: `promotion_attribution:${row.id}`,
    location_id: row.location_id,
    promotion_campaign_id: row.campaign_id,
    event_type: `sponsored_${row.conversion_type || "conversion"}`,
    channel_class: "sponsored",
    attribution_model: row.attribution_model || "promotion_last_touch",
    touchpoint_type: row.conversion_type || "conversion",
    conversion_id: row.conversion_id || null,
    is_conversion: true,
    revenue_cents: Math.max(0, Number(row.attributed_revenue_cents || 0)),
    revenue_kind: Number(row.attributed_revenue_cents || 0) > 0 ? "estimated" : "none",
    currency: "usd",
    metadata: { promotion_attribution_id: row.id, raw_metadata: asObject(row.metadata) },
    occurred_at: row.attributed_at,
    updated_at: now,
  }));
}

async function reservationRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,user_id,status,source,created_at,updated_at,completed_at,checked_in_at,deposit_amount,deposit_status,deposit_paid_at,attribution_search_id,attribution_session_id,attribution_anonymous_id,attribution_result_impression_id,attribution_promotion_campaign_id,attribution_promotion_event_id,attribution_source_event_id,attribution_channel_class,attribution_context")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;

  const now = new Date().toISOString();
  const rows: AttributionRow[] = [];
  for (const reservation of data || []) {
    const channelClass = (["organic","sponsored","owned","unknown"].includes(String(reservation.attribution_channel_class))
      ? reservation.attribution_channel_class
      : reservation.attribution_promotion_campaign_id
        ? "sponsored"
        : reservation.attribution_search_id
          ? "organic"
          : "unknown") as ChannelClass;
    const context = asObject(reservation.attribution_context);
    const common = {
      location_id: reservation.location_id,
      search_id: reservation.attribution_search_id || null,
      result_impression_id: reservation.attribution_result_impression_id || null,
      promotion_campaign_id: reservation.attribution_promotion_campaign_id || null,
      promotion_event_id: reservation.attribution_promotion_event_id || null,
      reservation_id: reservation.id,
      user_id: reservation.user_id || null,
      anonymous_id: reservation.attribution_anonymous_id || null,
      session_id: reservation.attribution_session_id || null,
      source: stringValue(context.source) || reservation.source || null,
      medium: stringValue(context.medium),
      campaign: stringValue(context.campaign),
      channel_class: channelClass,
      attribution_model: reservation.attribution_promotion_campaign_id ? "captured_sponsored_touch" : reservation.attribution_search_id ? "captured_search_touch" : "booking_source",
      conversion_id: reservation.id,
      is_conversion: true,
      currency: "usd",
      metadata: { reservation_status: reservation.status, attribution_context: context },
      updated_at: now,
    };
    rows.push({
      ...common,
      dedupe_key: `reservation:${reservation.id}:created`,
      event_type: "reservation_created",
      touchpoint_type: "booking",
      revenue_cents: 0,
      revenue_kind: "none",
      source_event_id: reservation.attribution_source_event_id || null,
      occurred_at: reservation.created_at,
    });

    const depositPaid = ["paid", "succeeded", "captured"].includes(String(reservation.deposit_status || "").toLowerCase());
    const depositRevenue = depositPaid ? Math.max(0, Math.round(Number(reservation.deposit_amount || 0) * 100)) : 0;
    if (reservation.completed_at || reservation.checked_in_at || depositRevenue > 0) {
      rows.push({
        ...common,
        dedupe_key: `reservation:${reservation.id}:conversion`,
        event_type: reservation.completed_at ? "reservation_completed" : reservation.checked_in_at ? "reservation_checked_in" : "reservation_deposit_paid",
        touchpoint_type: reservation.completed_at || reservation.checked_in_at ? "visit" : "payment",
        revenue_cents: depositRevenue,
        revenue_kind: depositRevenue > 0 ? "confirmed" : "none",
        source_event_id: null,
        metadata: {
          ...common.metadata,
          completed_at: reservation.completed_at || null,
          checked_in_at: reservation.checked_in_at || null,
          deposit_paid_at: reservation.deposit_paid_at || null,
          revenue_scope: depositRevenue > 0 ? "deposit_only" : "none",
        },
        occurred_at: reservation.completed_at || reservation.checked_in_at || reservation.deposit_paid_at || reservation.updated_at,
      });
    }
  }
  return rows;
}

async function visitRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("outing_visit_verifications")
    .select("id,location_id,reservation_id,outing_id,user_id,guest_session_id,verification_type,verification_status,verification_source,review_id,metadata,created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;

  const reservationIds = [...new Set((data || []).map((row: any) => row.reservation_id).filter(Boolean))];
  const { data: reservations } = reservationIds.length
    ? await supabaseAdmin
        .from("location_reservations")
        .select("id,attribution_search_id,attribution_session_id,attribution_anonymous_id,attribution_promotion_campaign_id,attribution_channel_class,attribution_context")
        .in("id", reservationIds)
    : { data: [] as any[] };
  const byReservation = new Map((reservations || []).map((row: any) => [String(row.id), row]));
  const now = new Date().toISOString();

  return (data || []).map((visit: any): AttributionRow => {
    const reservation = visit.reservation_id ? byReservation.get(String(visit.reservation_id)) : null;
    const context = asObject(reservation?.attribution_context);
    const channelClass = (reservation?.attribution_channel_class || (reservation?.attribution_promotion_campaign_id ? "sponsored" : reservation?.attribution_search_id ? "organic" : "unknown")) as ChannelClass;
    return {
      dedupe_key: `visit:${visit.id}`,
      location_id: visit.location_id,
      search_id: reservation?.attribution_search_id || null,
      promotion_campaign_id: reservation?.attribution_promotion_campaign_id || null,
      reservation_id: visit.reservation_id || null,
      visit_id: visit.id,
      review_id: visit.review_id || null,
      event_type: "verified_visit",
      user_id: visit.user_id || null,
      anonymous_id: reservation?.attribution_anonymous_id || null,
      session_id: reservation?.attribution_session_id || null,
      source: stringValue(context.source) || visit.verification_source || null,
      medium: stringValue(context.medium),
      campaign: stringValue(context.campaign),
      channel_class: channelClass,
      attribution_model: visit.reservation_id ? "booking_to_visit" : "verified_visit",
      touchpoint_type: "visit",
      conversion_id: visit.id,
      is_conversion: true,
      revenue_cents: 0,
      revenue_kind: "none",
      currency: "usd",
      metadata: {
        outing_id: visit.outing_id || null,
        verification_type: visit.verification_type,
        verification_status: visit.verification_status,
        verification_source: visit.verification_source,
        raw_metadata: asObject(visit.metadata),
      },
      occurred_at: visit.created_at,
      updated_at: now,
    };
  });
}


async function leadRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("location_leads")
    .select("id,location_id,lead_type,status,source,created_at,updated_at,contract_signed_at,confirmed_at,completed_at,proposal_currency,deposit_amount_cents,deposit_status,deposit_paid_at,balance_amount_cents,balance_status,balance_paid_at,attribution_search_id,attribution_session_id,attribution_anonymous_id,attribution_promotion_campaign_id,attribution_source_event_id,attribution_channel_class,metadata")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  if (error) throw error;

  const now = new Date().toISOString();
  const rows: AttributionRow[] = [];
  for (const lead of data || []) {
    const rawChannel = String(lead.attribution_channel_class || "").toLowerCase();
    const channelClass = (["organic","sponsored","owned","unknown"].includes(rawChannel)
      ? rawChannel
      : lead.attribution_promotion_campaign_id
        ? "sponsored"
        : lead.attribution_search_id
          ? "organic"
          : "unknown") as ChannelClass;
    const meta = asObject(lead.metadata);
    const common = {
      location_id: lead.location_id,
      lead_id: lead.id,
      search_id: lead.attribution_search_id || null,
      promotion_campaign_id: lead.attribution_promotion_campaign_id || null,
      anonymous_id: lead.attribution_anonymous_id || null,
      session_id: lead.attribution_session_id || null,
      source: stringValue(meta.source) || lead.source || null,
      medium: stringValue(meta.medium),
      campaign: stringValue(meta.campaign),
      channel_class: channelClass,
      attribution_model: lead.attribution_promotion_campaign_id ? "captured_sponsored_touch" : lead.attribution_search_id ? "captured_search_touch" : "lead_source",
      conversion_id: String(lead.id),
      is_conversion: true,
      currency: String(lead.proposal_currency || "usd").toLowerCase(),
      source_event_id: lead.attribution_source_event_id || null,
      updated_at: now,
    };
    if (lead.contract_signed_at) {
      rows.push({
        ...common,
        dedupe_key: `location_lead:${lead.id}:contract_signed`,
        event_type: `${lead.lead_type === "catering" ? "catering" : "private_event"}_contract_signed`,
        touchpoint_type: "contract",
        revenue_cents: 0,
        revenue_kind: "none",
        metadata: { lead_type: lead.lead_type, status: lead.status },
        occurred_at: lead.contract_signed_at,
      });
    }
    if (["paid","succeeded","complete","completed"].includes(String(lead.deposit_status || "").toLowerCase()) && Number(lead.deposit_amount_cents || 0) > 0) {
      rows.push({
        ...common,
        dedupe_key: `location_lead:${lead.id}:payment:deposit`,
        event_type: `${lead.lead_type === "catering" ? "catering" : "private_event"}_deposit_paid`,
        touchpoint_type: "payment",
        revenue_cents: Math.max(0, Number(lead.deposit_amount_cents || 0)),
        revenue_kind: "confirmed",
        metadata: { lead_type: lead.lead_type, payment_kind: "deposit", status: lead.status },
        occurred_at: lead.deposit_paid_at || lead.updated_at,
      });
    }
    if (["paid","succeeded","complete","completed"].includes(String(lead.balance_status || "").toLowerCase()) && Number(lead.balance_amount_cents || 0) > 0) {
      rows.push({
        ...common,
        dedupe_key: `location_lead:${lead.id}:payment:balance`,
        event_type: `${lead.lead_type === "catering" ? "catering" : "private_event"}_balance_paid`,
        touchpoint_type: "payment",
        revenue_cents: Math.max(0, Number(lead.balance_amount_cents || 0)),
        revenue_kind: "confirmed",
        metadata: { lead_type: lead.lead_type, payment_kind: "balance", status: lead.status },
        occurred_at: lead.balance_paid_at || lead.updated_at,
      });
    }
  }
  return rows;
}

async function experienceRows(cutoff: string, locationId?: string | null) {
  let query = supabaseAdmin
    .from("experience_bookings")
    .select("id,experience_id,customer_user_id,party_size,status,payment_status,amount_cents,paid_at,created_at,updated_at")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5000);
  const { data, error } = await query;
  if (error) throw error;
  const experienceIds = [...new Set((data || []).map((row: any) => row.experience_id).filter(Boolean))];
  const { data: experiences } = experienceIds.length
    ? await supabaseAdmin.from("experiences").select("id,location_id").in("id", experienceIds)
    : { data: [] as any[] };
  const locationByExperience = new Map((experiences || []).map((row: any) => [String(row.id), row.location_id]));
  const now = new Date().toISOString();
  return (data || []).flatMap((booking: any) => {
    const resolvedLocationId = locationByExperience.get(String(booking.experience_id)) || null;
    if (!resolvedLocationId || (locationId && resolvedLocationId !== locationId)) return [];
    const paid = ["paid","succeeded","complete","completed"].includes(String(booking.payment_status || "").toLowerCase());
    const revenue = paid ? Math.max(0, Number(booking.amount_cents || 0)) : 0;
    return [{
      dedupe_key: `experience_booking:${booking.id}`,
      location_id: resolvedLocationId,
      experience_booking_id: booking.id,
      event_type: paid ? "experience_booking_paid" : "experience_booking_created",
      user_id: booking.customer_user_id || null,
      channel_class: "organic" as const,
      attribution_model: "direct_booking",
      touchpoint_type: "booking",
      conversion_id: booking.id,
      is_conversion: true,
      revenue_cents: revenue,
      revenue_kind: revenue > 0 ? "confirmed" as const : "none" as const,
      currency: "usd",
      metadata: { experience_id: booking.experience_id, party_size: booking.party_size, status: booking.status, payment_status: booking.payment_status },
      occurred_at: booking.paid_at || booking.created_at,
      updated_at: now,
    }];
  });
}

async function ticketRows(cutoff: string, locationId?: string | null) {
  const { data, error } = await supabaseAdmin
    .from("event_ticket_orders")
    .select("id,event_id,purchaser_user_id,quantity,status,payment_status,total_cents,paid_at,created_at,updated_at")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  const eventIds = [...new Set((data || []).map((row: any) => row.event_id).filter(Boolean))];
  const { data: events } = eventIds.length
    ? await supabaseAdmin.from("events").select("id,location_id").in("id", eventIds)
    : { data: [] as any[] };
  const locationByEvent = new Map((events || []).map((row: any) => [String(row.id), row.location_id]));
  const now = new Date().toISOString();
  return (data || []).flatMap((order: any) => {
    const resolvedLocationId = locationByEvent.get(String(order.event_id)) || null;
    if (!resolvedLocationId || (locationId && resolvedLocationId !== locationId)) return [];
    const paid = ["paid","succeeded","complete","completed"].includes(String(order.payment_status || "").toLowerCase());
    const revenue = paid ? Math.max(0, Number(order.total_cents || 0)) : 0;
    return [{
      dedupe_key: `event_ticket_order:${order.id}`,
      location_id: resolvedLocationId,
      event_ticket_order_id: order.id,
      event_type: paid ? "event_ticket_order_paid" : "event_ticket_order_created",
      user_id: order.purchaser_user_id || null,
      channel_class: "organic" as const,
      attribution_model: "direct_booking",
      touchpoint_type: "booking",
      conversion_id: order.id,
      is_conversion: true,
      revenue_cents: revenue,
      revenue_kind: revenue > 0 ? "confirmed" as const : "none" as const,
      currency: "usd",
      metadata: { event_id: order.event_id, quantity: order.quantity, status: order.status, payment_status: order.payment_status },
      occurred_at: order.paid_at || order.created_at,
      updated_at: now,
    }];
  });
}

export async function syncCanonicalAttribution(input?: {
  locationId?: string | null;
  lookbackHours?: number;
}) {
  const lookbackHours = Math.max(1, Math.min(24 * 90, Number(input?.lookbackHours || 24 * 35)));
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const locationId = input?.locationId || null;
  const sources = await Promise.all([
    analyticsRows(cutoff, locationId),
    promotionRows(cutoff, locationId),
    reservationRows(cutoff, locationId),
    visitRows(cutoff, locationId),
    leadRows(cutoff, locationId),
    experienceRows(cutoff, locationId),
    ticketRows(cutoff, locationId),
  ]);
  const counts: number[] = [];
  for (const rows of sources) counts.push(await upsertRows(rows));
  return {
    cutoff,
    locationId,
    analytics: counts[0],
    promotions: counts[1],
    reservations: counts[2],
    visits: counts[3],
    leads: counts[4],
    experienceBookings: counts[5],
    ticketOrders: counts[6],
    total: counts.reduce((sum, value) => sum + value, 0),
  };
}
