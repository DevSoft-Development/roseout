import { supabaseAdmin } from "@/lib/supabase-admin";

export type CRMStatus =
  | "Unclaimed"
  | "Contacted"
  | "Claimed"
  | "Active Free"
  | "Upgrade Opportunity"
  | "Pro"
  | "Enterprise"
  | "At Risk";

export type BusinessCRMRow = {
  id: string;
  location_id?: string | null;
  name: string;
  location_name?: string | null;
  address?: string | null;
  city: string | null;
  borough?: string | null;
  state: string | null;
  zip?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  cuisine?: string | null;
  description?: string | null;
  status?: string | null;
  is_searchable?: boolean | null;
  is_claimed: boolean | null;
  reservation_url: string | null;
  external_reservation_url?: string | null;
  location_type?: "restaurants" | "activities" | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  claim_status?: string | null;
  owner_status?: string | null;
  plan_status?: string | null;
  pipeline_stage?: string | null;
  outreach_status?: string | null;
  follow_up_date?: string | null;
  last_contacted_at?: string | null;
  assigned_admin?: string | null;
  priority_level?: string | null;
  tags?: string[] | string | null;
  internal_notes?: string | null;
  crm_status: CRMStatus;
  opportunity_score: number;
  upgrade_probability: number;
  engagement_score: number;
  traffic_score: number;
  conversion_score: number;
  retention_score: number;
  churn_risk_score: number;
  trending_score: number;
  profile_quality_score?: number;
  seo_score?: number;
  reservation_readiness_score?: number;
  open_tasks?: number;
  open_support_tickets?: number;
  pending_claims?: number;
  qr_scans_30d?: number;
  call_clicks_30d?: number;
  website_clicks_30d?: number;
  reservation_completions_30d: number;
  profile_views_30d: number;
  search_appearances_30d: number;
  saves_30d: number;
  conversion_rate_30d: number;
  created_at?: string | null;
  updated_at?: string | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCRMRow(row: Record<string, any>): BusinessCRMRow {
  const id = String(row.id ?? row.location_id ?? "");
  const name = String(row.name ?? row.location_name ?? row.restaurant_name ?? row.activity_name ?? "Untitled Location");

  return {
    ...row,
    id,
    location_id: row.location_id ?? id,
    name,
    location_name: row.location_name ?? name,
    city: row.city ?? row.borough ?? null,
    borough: row.borough ?? row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? row.zip_code ?? null,
    zip_code: row.zip_code ?? row.zip ?? null,
    is_claimed: row.is_claimed ?? false,
    is_searchable: row.is_searchable ?? null,
    reservation_url: row.reservation_url ?? null,
    location_type: row.location_type === "activities" ? "activities" : row.location_type === "restaurants" ? "restaurants" : null,
    crm_status: (row.crm_status ?? (row.is_claimed ? "Claimed" : "Unclaimed")) as CRMStatus,
    opportunity_score: toNumber(row.opportunity_score),
    upgrade_probability: toNumber(row.upgrade_probability),
    engagement_score: toNumber(row.engagement_score),
    traffic_score: toNumber(row.traffic_score),
    conversion_score: toNumber(row.conversion_score),
    retention_score: toNumber(row.retention_score),
    churn_risk_score: toNumber(row.churn_risk_score),
    trending_score: toNumber(row.trending_score),
    profile_quality_score: toNumber(row.profile_quality_score),
    seo_score: toNumber(row.seo_score),
    reservation_readiness_score: toNumber(row.reservation_readiness_score),
    open_tasks: toNumber(row.open_tasks),
    open_support_tickets: toNumber(row.open_support_tickets),
    pending_claims: toNumber(row.pending_claims),
    qr_scans_30d: toNumber(row.qr_scans_30d),
    call_clicks_30d: toNumber(row.call_clicks_30d),
    website_clicks_30d: toNumber(row.website_clicks_30d),
    reservation_completions_30d: toNumber(row.reservation_completions_30d),
    profile_views_30d: toNumber(row.profile_views_30d),
    search_appearances_30d: toNumber(row.search_appearances_30d),
    saves_30d: toNumber(row.saves_30d),
    conversion_rate_30d: toNumber(row.conversion_rate_30d),
  };
}

const CRM_SELECT = "*";

export async function listBusinessCRM(limit = 120): Promise<BusinessCRMRow[]> {
  const primary = await supabaseAdmin
    .from("admin_crm_locations_view")
    .select(CRM_SELECT)
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (!primary.error) return (primary.data || []).map((row) => normalizeCRMRow(row));

  const snapshot = await supabaseAdmin
    .from("business_crm_snapshot")
    .select(CRM_SELECT)
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (!snapshot.error) return (snapshot.data || []).map((row) => normalizeCRMRow(row));

  console.error("Failed to fetch CRM views", primary.error, snapshot.error);
  const fallback = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, address, city, borough, state, zip_code, phone, website, category, cuisine, description, status, is_searchable, is_claimed, reservation_url, external_reservation_url, location_type, owner_user_id, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fallback.error) {
    console.error("Failed to fetch locations fallback", fallback.error);
    return [];
  }

  return (fallback.data || []).map((row) => normalizeCRMRow(row));
}

export async function getBusinessCRM(id: string): Promise<BusinessCRMRow | null> {
  for (const table of ["admin_crm_locations_view", "business_crm_snapshot"] as const) {
    const { data, error } = await supabaseAdmin.from(table).select(CRM_SELECT).or(`id.eq.${id},location_id.eq.${id}`).maybeSingle();
    if (!error && data) return normalizeCRMRow(data);
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, address, city, borough, state, zip_code, phone, website, category, cuisine, description, status, is_searchable, is_claimed, reservation_url, external_reservation_url, location_type, owner_user_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch location CRM row", error);
    return null;
  }

  return data ? normalizeCRMRow(data) : null;
}

export async function getLocationCrmRelatedData(locationId: string) {
  const [notes, reminders, communications, logs, claims, support] = await Promise.all([
    supabaseAdmin.from("business_crm_notes").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("business_crm_reminders").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("business_communication_logs").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("admin_system_logs").select("*").eq("entity_type", "location").eq("entity_id", locationId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("business_claims").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25),
    supabaseAdmin.from("support_tickets").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25),
  ]);

  return {
    notes: notes.error ? [] : notes.data || [],
    reminders: reminders.error ? [] : reminders.data || [],
    communications: communications.error ? [] : communications.data || [],
    logs: logs.error ? [] : logs.data || [],
    claims: claims.error ? [] : claims.data || [],
    supportTickets: support.error ? [] : support.data || [],
  };
}

export function getUpgradeFlags(business: BusinessCRMRow): string[] {
  const flags: string[] = [];

  if (!business.is_claimed && business.traffic_score >= 70) flags.push("High Traffic Free Account");
  if (business.reservation_completions_30d >= 30) flags.push("High Reservation Activity");
  if (business.trending_score >= 65) flags.push("Trending Location");
  if (!business.reservation_url) flags.push("Missing Reservation Link");
  if (business.search_appearances_30d >= 200) flags.push("Strong Search Visibility");
  if (business.saves_30d >= 20) flags.push("High Save Rate");
  if (business.conversion_rate_30d <= 0.08 && business.traffic_score >= 60) flags.push("High Conversion Potential");
  if (business.opportunity_score >= 75) flags.push("Candidate For Promoted Listings");
  if ((business.open_tasks || 0) > 0) flags.push("Open CRM Tasks");
  if ((business.pending_claims || 0) > 0) flags.push("Pending Claim");

  return flags;
}
