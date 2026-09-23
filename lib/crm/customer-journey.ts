import "server-only";

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CustomerJourneyTrust = "verified" | "confirmed" | "estimated" | "attributed" | "recorded";

export type CustomerJourneyEvent = {
  id: string;
  category: "reservation" | "visit" | "review" | "campaign" | "lead" | "attribution" | "revenue" | "conversation" | "crm";
  kind: string;
  occurredAt: string;
  title: string;
  summary: string;
  status: string | null;
  channel: string | null;
  trust: CustomerJourneyTrust;
  revenueCents: number | null;
  revenueKind: "confirmed" | "estimated" | null;
  currency: string | null;
  sourceTable: string;
  sourceId: string;
  customerKey: string | null;
  customerLabel: string | null;
};

export type CustomerJourneyTimeline = {
  events: CustomerJourneyEvent[];
  summary: {
    reservations: number;
    verifiedVisits: number;
    reviews: number;
    campaigns: number;
    leads: number;
    conversations: number;
    confirmedRevenueCents: number;
    estimatedRevenueCents: number;
    uniqueCustomers: number;
  };
};

function iso(value: unknown, fallback?: unknown) {
  const raw = String(value || fallback || "");
  const parsed = raw ? new Date(raw) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
}

function moneyKind(value: unknown): "confirmed" | "estimated" | null {
  const kind = String(value || "").toLowerCase();
  if (kind === "confirmed") return "confirmed";
  if (kind === "estimated") return "estimated";
  return null;
}

function customerKey(parts: Array<unknown>) {
  const raw = parts.map((part) => String(part || "").trim().toLowerCase()).find(Boolean);
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function cleanLabel(value: unknown) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 120) : null;
}

function event(input: CustomerJourneyEvent): CustomerJourneyEvent {
  return input;
}

export async function loadCustomerJourneyTimeline(locationId: string, limit = 250): Promise<CustomerJourneyTimeline> {
  const bounded = Math.max(50, Math.min(500, limit));
  const [
    reservationsResult,
    visitsResult,
    reviewsResult,
    attributionResult,
    leadsResult,
    conversationsResult,
    crmResult,
    businessCampaignsResult,
    messagingCampaignsResult,
    marketingCampaignsResult,
    promotionCampaignsResult,
  ] = await Promise.all([
    supabaseAdmin.from("location_reservations").select("id,user_id,customer_name,customer_email,customer_phone,status,booking_kind,occasion,party_size,deposit_status,created_at,updated_at,arrived_at,seated_at,checked_in_at,completed_at,cancelled_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(150),
    supabaseAdmin.from("outing_visit_verifications").select("id,user_id,guest_session_id,verification_type,verification_status,verification_source,reservation_id,review_id,created_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(150),
    supabaseAdmin.from("location_reviews").select("id,user_id,guest_email,guest_name,rating,status,is_verified_visit,verified_visit,verification_source,reservation_id,visit_id,created_at,approved_at,rejected_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(150),
    supabaseAdmin.from("marketing_attribution_events").select("id,event_type,user_id,anonymous_id,session_id,source,medium,campaign,channel_class,touchpoint_type,is_conversion,revenue_cents,revenue_kind,currency,reservation_id,visit_id,review_id,lead_id,campaign_id,promotion_campaign_id,occurred_at").eq("location_id", locationId).order("occurred_at", { ascending: false }).limit(200),
    supabaseAdmin.from("location_leads").select("id,lead_type,customer_name,customer_email,customer_phone,status,commercial_stage,proposal_status,contract_status,deposit_status,balance_status,event_date,guest_count,source,created_at,updated_at,confirmed_at,completed_at,canceled_at,lost_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(150),
    supabaseAdmin.from("crm_conversations").select("id,contact_id,reservation_id,channel,status,subject,last_message_at,last_inbound_at,last_outbound_at,created_at").eq("location_id", locationId).is("archived_at", null).order("last_message_at", { ascending: false, nullsFirst: false }).limit(150),
    supabaseAdmin.from("crm_activities").select("id,contact_id,activity_type,direction,channel,summary,outcome,occurred_at,source_system,source_table,source_record_id").eq("location_id", locationId).order("occurred_at", { ascending: false }).limit(200),
    supabaseAdmin.from("business_marketing_campaigns").select("id,campaign_type,title,status,channel,starts_at,ends_at,created_at,updated_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(75),
    supabaseAdmin.from("location_messaging_campaigns").select("id,campaign_type,channel,status,name,recipient_count,scheduled_for,sent_at,created_at,updated_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(75),
    supabaseAdmin.from("marketing_campaigns").select("id,name,campaign_type,status,selected_platforms,scheduled_at,sent_at,created_at,updated_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(75),
    supabaseAdmin.from("promotion_campaigns").select("id,name,promotion_type,status,placements,spent_cents,starts_at,ends_at,created_at,updated_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(75),
  ]);

  const results = [reservationsResult, visitsResult, reviewsResult, attributionResult, leadsResult, conversationsResult, crmResult, businessCampaignsResult, messagingCampaignsResult, marketingCampaignsResult, promotionCampaignsResult];
  for (const result of results) if (result.error) throw result.error;

  const events: CustomerJourneyEvent[] = [];
  const customerKeys = new Set<string>();

  for (const row of reservationsResult.data || []) {
    const key = customerKey([row.user_id, row.customer_email, row.customer_phone]);
    if (key) customerKeys.add(key);
    events.push(event({
      id: `reservation:${row.id}`,
      category: "reservation",
      kind: String(row.booking_kind || "reservation"),
      occurredAt: iso(row.completed_at || row.cancelled_at || row.checked_in_at || row.seated_at || row.arrived_at || row.updated_at, row.created_at),
      title: `Reservation ${String(row.status || "recorded").replace(/_/g, " ")}`,
      summary: [row.occasion, row.party_size ? `${row.party_size} guests` : null, row.deposit_status ? `deposit ${row.deposit_status}` : null].filter(Boolean).join(" · ") || "Reservation lifecycle event",
      status: row.status || null,
      channel: "reserve",
      trust: row.completed_at || row.checked_in_at ? "verified" : "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: "location_reservations",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: cleanLabel(row.customer_name),
    }));
  }

  for (const row of visitsResult.data || []) {
    const key = customerKey([row.user_id, row.guest_session_id]);
    if (key) customerKeys.add(key);
    events.push(event({
      id: `visit:${row.id}`,
      category: "visit",
      kind: String(row.verification_type || "visit"),
      occurredAt: iso(row.created_at),
      title: row.verification_status === "verified" ? "Verified visit" : "Visit verification",
      summary: [row.verification_source, row.verification_type].filter(Boolean).join(" · ") || "Visit evidence recorded",
      status: row.verification_status || null,
      channel: row.verification_source || null,
      trust: row.verification_status === "verified" ? "verified" : "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: "outing_visit_verifications",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: null,
    }));
  }

  for (const row of reviewsResult.data || []) {
    const key = customerKey([row.user_id, row.guest_email]);
    if (key) customerKeys.add(key);
    const verified = Boolean(row.verified_visit || row.is_verified_visit);
    events.push(event({
      id: `review:${row.id}`,
      category: "review",
      kind: "review",
      occurredAt: iso(row.approved_at || row.rejected_at, row.created_at),
      title: verified ? "Verified-visit review" : "Review received",
      summary: row.rating != null ? `${row.rating}/5 rating` : "Review submitted",
      status: row.status || null,
      channel: row.verification_source || null,
      trust: verified ? "verified" : "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: "location_reviews",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: cleanLabel(row.guest_name),
    }));
  }

  for (const row of attributionResult.data || []) {
    const revenue = Number(row.revenue_cents || 0);
    const kind = moneyKind(row.revenue_kind);
    const key = customerKey([row.user_id, row.anonymous_id, row.session_id]);
    if (key) customerKeys.add(key);
    events.push(event({
      id: `attribution:${row.id}`,
      category: revenue > 0 ? "revenue" : "attribution",
      kind: String(row.event_type || row.touchpoint_type || "attribution"),
      occurredAt: iso(row.occurred_at),
      title: revenue > 0 ? `${kind === "confirmed" ? "Confirmed" : kind === "estimated" ? "Estimated" : "Attributed"} revenue` : "Attributed customer touchpoint",
      summary: [row.channel_class, row.source, row.medium, row.campaign].filter(Boolean).join(" · ") || "Canonical attribution event",
      status: row.is_conversion ? "conversion" : null,
      channel: row.channel_class || row.medium || null,
      trust: kind === "confirmed" ? "confirmed" : kind === "estimated" ? "estimated" : "attributed",
      revenueCents: revenue > 0 ? revenue : null,
      revenueKind: kind,
      currency: row.currency || null,
      sourceTable: "marketing_attribution_events",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: null,
    }));
  }

  for (const row of leadsResult.data || []) {
    const key = customerKey([row.customer_email, row.customer_phone]);
    if (key) customerKeys.add(key);
    const stage = row.commercial_stage || row.status || "lead";
    events.push(event({
      id: `lead:${row.id}`,
      category: "lead",
      kind: String(row.lead_type || "lead"),
      occurredAt: iso(row.completed_at || row.confirmed_at || row.canceled_at || row.lost_at || row.updated_at, row.created_at),
      title: `${row.lead_type === "catering" ? "Catering" : "Private event"} · ${String(stage).replace(/_/g, " ")}`,
      summary: [row.event_date, row.guest_count ? `${row.guest_count} guests` : null, row.proposal_status, row.contract_status, row.deposit_status, row.balance_status].filter(Boolean).join(" · ") || "Commercial lead activity",
      status: String(stage),
      channel: row.source || null,
      trust: row.confirmed_at || row.completed_at ? "verified" : "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: "location_leads",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: cleanLabel(row.customer_name),
    }));
  }

  for (const row of conversationsResult.data || []) {
    const key = customerKey([row.contact_id, row.reservation_id]);
    if (key) customerKeys.add(key);
    events.push(event({
      id: `conversation:${row.id}`,
      category: "conversation",
      kind: String(row.channel || "conversation"),
      occurredAt: iso(row.last_message_at, row.created_at),
      title: row.subject || `${String(row.channel || "Customer").toUpperCase()} conversation`,
      summary: [row.status, row.last_inbound_at ? "customer replied" : null, row.last_outbound_at ? "team replied" : null].filter(Boolean).join(" · ") || "Conversation activity",
      status: row.status || null,
      channel: row.channel || null,
      trust: "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: "crm_conversations",
      sourceId: String(row.id),
      customerKey: key,
      customerLabel: null,
    }));
  }

  for (const row of crmResult.data || []) {
    events.push(event({
      id: `crm:${row.id}`,
      category: "crm",
      kind: String(row.activity_type || "activity"),
      occurredAt: iso(row.occurred_at),
      title: row.summary || String(row.activity_type || "CRM activity").replace(/_/g, " "),
      summary: [row.direction, row.channel, row.outcome, row.source_system].filter(Boolean).join(" · ") || "CRM lifecycle activity",
      status: row.outcome || null,
      channel: row.channel || null,
      trust: "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: row.source_table || "crm_activities",
      sourceId: String(row.source_record_id || row.id),
      customerKey: customerKey([row.contact_id]),
      customerLabel: null,
    }));
  }

  const campaignRows = [
    ...(businessCampaignsResult.data || []).map((row: any) => ({ ...row, _table: "business_marketing_campaigns", _name: row.title, _when: row.starts_at || row.updated_at || row.created_at })),
    ...(messagingCampaignsResult.data || []).map((row: any) => ({ ...row, _table: "location_messaging_campaigns", _name: row.name, _when: row.sent_at || row.scheduled_for || row.updated_at || row.created_at })),
    ...(marketingCampaignsResult.data || []).map((row: any) => ({ ...row, _table: "marketing_campaigns", _name: row.name, _when: row.sent_at || row.scheduled_at || row.updated_at || row.created_at })),
    ...(promotionCampaignsResult.data || []).map((row: any) => ({ ...row, _table: "promotion_campaigns", _name: row.name, _when: row.starts_at || row.updated_at || row.created_at })),
  ];
  for (const row of campaignRows) {
    events.push(event({
      id: `campaign:${row._table}:${row.id}`,
      category: "campaign",
      kind: String(row.campaign_type || row.promotion_type || "campaign"),
      occurredAt: iso(row._when),
      title: row._name || "Campaign",
      summary: [row.status, row.channel, row.recipient_count != null ? `${row.recipient_count} recipients` : null, row.spent_cents != null ? `${row.spent_cents}¢ spent` : null].filter(Boolean).join(" · ") || "Campaign lifecycle event",
      status: row.status || null,
      channel: row.channel || null,
      trust: "recorded",
      revenueCents: null,
      revenueKind: null,
      currency: null,
      sourceTable: row._table,
      sourceId: String(row.id),
      customerKey: null,
      customerLabel: null,
    }));
  }

  const seen = new Set<string>();
  const sorted = events
    .filter((item) => seen.has(item.id) ? false : (seen.add(item.id), true))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, bounded);

  return {
    events: sorted,
    summary: {
      reservations: (reservationsResult.data || []).length,
      verifiedVisits: (visitsResult.data || []).filter((row: any) => row.verification_status === "verified").length,
      reviews: (reviewsResult.data || []).length,
      campaigns: campaignRows.length,
      leads: (leadsResult.data || []).length,
      conversations: (conversationsResult.data || []).length,
      confirmedRevenueCents: (attributionResult.data || []).filter((row: any) => moneyKind(row.revenue_kind) === "confirmed").reduce((sum: number, row: any) => sum + Number(row.revenue_cents || 0), 0),
      estimatedRevenueCents: (attributionResult.data || []).filter((row: any) => moneyKind(row.revenue_kind) === "estimated").reduce((sum: number, row: any) => sum + Number(row.revenue_cents || 0), 0),
      uniqueCustomers: customerKeys.size,
    },
  };
}
