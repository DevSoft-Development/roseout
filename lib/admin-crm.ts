import { supabaseAdmin } from "@/lib/supabase-admin";

export type CRMStatus =
  | "New Lead"
  | "Needs Outreach"
  | "Contacted"
  | "Follow Up"
  | "Upgrade Opportunity"
  | "Active Free"
  | "Active Pro"
  | "At Risk"
  | "Churned"
  | "Unclaimed"
  | "Claimed"
  | "Pro"
  | "Enterprise";

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
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  description?: string | null;
  status?: string | null;
  active?: boolean | null;
  is_searchable?: boolean | null;
  is_claimed: boolean | null;
  reservation_url: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  external_reservation_url?: string | null;
  best_reservation_url?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  gallery?: unknown;
  photos?: unknown;
  image_gallery?: unknown;
  gallery_images?: unknown;
  images?: unknown;
  claim_code?: string | null;
  claim_url?: string | null;
  claim_qr_url?: string | null;
  qr_link?: string | null;
  qr_code_data_url?: string | null;
  location_type?: "restaurants" | "activities" | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  claim_status?: string | null;
  owner_status?: string | null;
  plan?: string | null;
  plan_status?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  promo_code?: string | null;
  promo_campaign?: string | null;
  billing_notes?: string | null;
  is_pro?: boolean | null;
  pipeline_stage?: string | null;
  outreach_status?: string | null;
  follow_up_date?: string | null;
  crm_priority?: string | null;
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

export type BusinessCRMSummary = {
  total: number;
  searchable: number;
  claimed: number;
  unclaimed: number;
  pendingClaims: number;
  upgradeCandidates: number;
  atRisk: number;
  openTasks: number;
  reservationIntent: number;
  searchAppearances: number;
};

const CRM_SELECT = "*";
const SEARCH_COLUMNS = ["name", "location_name", "address", "city", "borough", "state", "category", "cuisine", "owner_email"];

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanStatus(value: unknown) {
  return String(value ?? "").trim();
}

export function getClaimStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.claim_status);
  if (raw) {
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, " ");
    if (normalized === "pending" || normalized === "pending claim" || normalized === "pending review") return "Pending Claim";
    if (normalized === "approved" || normalized === "claimed") return "Claimed";
    if (normalized === "rejected" || normalized === "denied") return "Rejected";
    if (normalized === "unclaimed") return "Unclaimed";
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return row.is_claimed ? "Claimed" : "Unclaimed";
}

export function getDisplayCRMStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.crm_status);
  const claim = getClaimStatus(row).toLowerCase();
  if (!raw || raw.toLowerCase() === "unclaimed" || raw.toLowerCase() === claim) return "Needs Outreach" as CRMStatus;
  if (raw === "Claimed") return "Active Free";
  if (raw === "Pro") return "Active Pro";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) as CRMStatus;
}

function normalizeCRMRow(row: Record<string, any>): BusinessCRMRow {
  const base = {
    ...row,
    id: String(row.id ?? row.location_id ?? ""),
    location_id: row.location_id ?? row.id,
    name: String(row.name ?? row.location_name ?? row.restaurant_name ?? row.activity_name ?? "Untitled Location"),
    location_name: row.location_name ?? row.name ?? row.restaurant_name ?? row.activity_name ?? "Untitled Location",
    city: row.city ?? "",
    borough: row.borough ?? row.neighborhood ?? row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? row.zip_code ?? "",
    zip_code: row.zip_code ?? row.zip ?? "",
    category: row.category ?? row.primary_category ?? "",
    cuisine: row.cuisine ?? row.cuisine_type ?? "",
    image_url: row.image_url ?? row.main_image ?? "",
    main_image: row.main_image ?? row.image_url ?? "",
    reservation_url: row.best_reservation_url ?? row.reservation_url ?? row.reservation_link ?? row.booking_url ?? row.external_reservation_url ?? "",
    plan: row.plan ?? row.subscription_plan ?? (row.is_pro ? "pro" : "free_discovery"),
    plan_status: row.plan_status ?? row.subscription_status ?? (row.is_pro ? "active" : "inactive"),
    is_claimed: Boolean(row.is_claimed || cleanStatus(row.claim_status).toLowerCase() === "claimed"),
    is_searchable: row.is_searchable == null ? true : Boolean(row.is_searchable),
    active: row.active == null ? row.status !== "inactive" : Boolean(row.active),
    is_pro: Boolean(row.is_pro || row.plan === "pro" || row.subscription_plan === "pro"),
    location_type: row.location_type === "activities" ? "activities" : row.location_type === "restaurants" ? "restaurants" : null,
    opportunity_score: toNumber(row.opportunity_score),
    upgrade_probability: toNumber(row.upgrade_probability),
    engagement_score: toNumber(row.engagement_score),
    traffic_score: toNumber(row.traffic_score),
    conversion_score: toNumber(row.conversion_score),
    retention_score: toNumber(row.retention_score),
    churn_risk_score: toNumber(row.churn_risk_score),
    trending_score: toNumber(row.trending_score ?? row.trend_score),
    profile_quality_score: toNumber(row.profile_quality_score ?? row.quality_score),
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
  } as BusinessCRMRow;
  return { ...base, claim_status: getClaimStatus(base), crm_status: getDisplayCRMStatus(base) };
}

function normalizeCRMRows(rows: Record<string, any>[] | null | undefined): BusinessCRMRow[] {
  return (rows ?? []).map((row) => normalizeCRMRow(row));
}

function applySearch(query: any, q?: string) {
  const term = String(q || "").trim();
  if (!term) return query;
  const safeTerm = term.replace(/[%,()]/g, "");
  return query.or(SEARCH_COLUMNS.map((col) => `${col}.ilike.%${safeTerm}%`).join(","));
}

function applyFilter(query: any, filter?: string) {
  switch (filter) {
    case "upgrade-opportunities":
      return query.gte("opportunity_score", 70);
    case "at-risk":
      return query.gte("churn_risk_score", 65);
    case "pending-claims":
      return query.or("pending_claims.gt.0,claim_status.ilike.%pending%");
    case "owners":
      return query.or("owner_user_id.not.is.null,owner_email.not.is.null,is_claimed.eq.true");
    case "open-tasks":
      return query.gt("open_tasks", 0);
    case "follow-ups":
      return query.not("follow_up_date", "is", null);
    default:
      return query;
  }
}

export async function listBusinessCRMPage({ page = 1, pageSize = 100, query, filter }: { page?: number; pageSize?: number; query?: string; filter?: string }) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 100, 25), 250);
  const safePage = Math.max(Number(page) || 1, 1);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  for (const table of ["admin_crm_locations_view", "business_crm_snapshot", "locations"] as const) {
    let builder = supabaseAdmin.from(table).select(CRM_SELECT, { count: "exact" });
    builder = applyFilter(applySearch(builder, query), filter).order(table === "locations" ? "created_at" : "opportunity_score", { ascending: false }).range(from, to);
    const { data, error, count } = await builder;
    if (!error) {
      const total = count ?? data?.length ?? 0;
      return { rows: normalizeCRMRows(data), total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
    }
    console.error(`Failed to fetch ${table} CRM page`, error.message);
  }

  return { rows: [], total: 0, page: safePage, pageSize: safePageSize, totalPages: 1 };
}

export async function listBusinessCRM(limit = 1000): Promise<BusinessCRMRow[]> {
  const page = await listBusinessCRMPage({ page: 1, pageSize: limit });
  return page.rows;
}

export async function getBusinessCRMSummary(): Promise<BusinessCRMSummary> {
  const page = await listBusinessCRMPage({ page: 1, pageSize: 250 });
  const rows = page.rows;
  const totalCount = page.total;
  const countWhere = async (column: string, value: any) => {
    const { count, error } = await supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq(column, value);
    return error ? rows.filter((r: any) => r[column] === value).length : count || 0;
  };
  const searchable = await countWhere("is_searchable", true);
  const claimed = await countWhere("is_claimed", true);
  const pendingClaims = (await safeSelect("business_claims", (q) => q.select("id").ilike("status", "%pending%"))).length
    || (await safeSelect("location_claim_requests", (q) => q.select("id").ilike("status", "%pending%"))).length
    || rows.reduce((sum, b) => sum + (b.pending_claims || 0), 0);

  return {
    total: totalCount,
    searchable,
    claimed,
    unclaimed: Math.max(totalCount - claimed, 0),
    pendingClaims,
    upgradeCandidates: rows.filter((b) => b.opportunity_score >= 70 || b.crm_status === "Upgrade Opportunity").length,
    atRisk: rows.filter((b) => b.churn_risk_score >= 65 || b.crm_status === "At Risk").length,
    openTasks: rows.reduce((sum, b) => sum + (b.open_tasks || 0), 0),
    reservationIntent: rows.reduce((sum, b) => sum + b.reservation_completions_30d, 0),
    searchAppearances: rows.reduce((sum, b) => sum + b.search_appearances_30d, 0),
  };
}

export async function getBusinessCRM(id: string): Promise<BusinessCRMRow | null> {
  for (const table of ["admin_crm_locations_view", "business_crm_snapshot", "locations"] as const) {
    const { data, error } = await supabaseAdmin.from(table).select(CRM_SELECT).or(`id.eq.${id},location_id.eq.${id}`).maybeSingle();
    if (!error && data) return normalizeCRMRow(data);
  }
  return null;
}

export async function safeSelect(table: string, builder: (query: any) => any) {
  try {
    const { data, error } = await builder(supabaseAdmin.from(table));
    if (error) {
      console.error(`Optional CRM table ${table} unavailable`, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error(`Optional CRM table ${table} failed`, error);
    return [];
  }
}

function normalizeClaim(row: any) {
  return {
    ...row,
    id: row.id ?? `${row.location_id}-${row.email ?? row.claimant_email ?? Math.random()}`,
    status: getClaimStatus({ claim_status: row.status ?? row.claim_status, is_claimed: false }),
    claimant_name: row.claimant_name ?? row.owner_name ?? row.name ?? row.contact_name,
    claimant_email: row.claimant_email ?? row.owner_email ?? row.email,
    claimant_phone: row.claimant_phone ?? row.owner_phone ?? row.phone,
    submitted_business_name: row.submitted_business_name ?? row.business_name ?? row.location_name,
    submitted_at: row.submitted_at ?? row.created_at,
    reviewed_at: row.reviewed_at ?? row.updated_at,
    review_notes: row.review_notes ?? row.notes ?? row.admin_notes,
  };
}

export async function getLocationCrmRelatedData(locationId: string) {
  const [notes, reminders, businessComms, comms, logs, businessClaims, locationClaims, ownerClaims, supportTickets, qr1, qr2, qr3, qr4, owners1, owners2, owners3, planChanges, photoChanges, templates] = await Promise.all([
    safeSelect("business_crm_notes", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("business_crm_reminders", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("business_communication_logs", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("communication_logs", (q) => q.select("*").eq("recipient_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("admin_system_logs", (q) => q.select("*").eq("entity_type", "location").eq("entity_id", locationId).order("created_at", { ascending: false }).limit(50)),
    safeSelect("business_claims", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("location_claim_requests", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("owner_claims", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("support_tickets", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("location_claim_codes", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(10)),
    safeSelect("claim_qr_codes", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(10)),
    safeSelect("business_claim_codes", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(10)),
    safeSelect("qr_claim_codes", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(10)),
    safeSelect("location_owner_locations", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(10)),
    safeSelect("profiles", (q) => q.select("*").eq("location_id", locationId).limit(10)),
    safeSelect("users", (q) => q.select("*").eq("location_id", locationId).limit(10)),
    safeSelect("location_plan_change_logs", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("location_photo_change_logs", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(25)),
    safeSelect("communication_templates", (q) => q.select("*").order("created_at", { ascending: false }).limit(100)),
  ]);

  return {
    notes,
    reminders,
    communications: [...businessComms, ...comms],
    logs,
    claims: [...businessClaims, ...locationClaims, ...ownerClaims].map(normalizeClaim),
    supportTickets,
    qrCodes: [...qr1, ...qr2, ...qr3, ...qr4],
    owners: [...owners1, ...owners2, ...owners3],
    planChanges,
    photoChanges,
    templates,
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
