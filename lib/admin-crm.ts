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

export type BusinessCRMFilter =
  | "all"
  | "upgrade-opportunities"
  | "at-risk"
  | "pending-claims"
  | "owner-accounts"
  | "location-tasks"
  | "follow-ups"
  | "qr-codes";

export type PendingCRMClaim = {
  id: string;
  source_table: string;
  location_id?: string | null;
  submitted_business_name?: string | null;
  claimant_name?: string | null;
  claimant_email?: string | null;
  claimant_phone?: string | null;
  status: string;
  submitted_at?: string | null;
  review_notes?: string | null;
};

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
  upgrade_score?: number;
  upgrade_probability: number;
  engagement_score: number;
  traffic_score: number;
  conversion_score: number;
  retention_score: number;
  churn_risk_score: number;
  churn_risk?: number;
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
  upgradeOpportunitiesCount: number;
  atRiskCount: number;
  pendingClaimsCount: number;
  atRisk: number;
  openTasks: number;
  reservationIntent: number;
  searchAppearances: number;
};

const CRM_SELECT = "*";
const CRM_SOURCE_TABLES = ["admin_crm_locations_view", "business_crm_snapshot", "locations"] as const;
const CLAIM_SOURCE_TABLES = ["business_claims", "location_claim_requests", "owner_claims", "claim_requests"] as const;
const PENDING_CLAIM_STATUSES = new Set(["pending", "pending-review", "submitted", "awaiting-review", "needs-review", "pending-claim"]);

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanStatus(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeStatus(value: unknown) {
  return cleanStatus(value).toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

function titleizeStatus(value: unknown) {
  return cleanStatus(value).replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function hasText(value: unknown) {
  return cleanStatus(value).length > 0;
}

function hasReservationLink(row: Partial<BusinessCRMRow>) {
  return [row.reservation_url, row.reservation_link, row.booking_url, row.external_reservation_url, row.best_reservation_url].some(hasText);
}

function isFreeOrInactivePlan(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan);
  const status = normalizeStatus(row.plan_status ?? row.subscription_status);
  return !plan || ["free", "free-discovery", "inactive"].includes(plan) || ["inactive", "canceled", "cancelled"].includes(status);
}

function isReservePlan(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan);
  return plan.includes("reserve") || plan.includes("pro-reserve");
}

function isActiveOrSearchable(row: Partial<BusinessCRMRow>) {
  return row.active !== false || row.is_searchable !== false || !["inactive", "hidden", "disabled"].includes(normalizeStatus(row.status));
}

function isOverdueDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function hasImage(row: Partial<BusinessCRMRow>) {
  return [row.image_url, row.main_image].some(hasText) || Boolean(Array.isArray(row.images) && row.images.length);
}

export function getClaimStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.claim_status);
  if (raw) {
    const normalized = normalizeStatus(raw);
    if (PENDING_CLAIM_STATUSES.has(normalized)) return "Pending Claim";
    if (normalized === "approved" || normalized === "claimed") return "Claimed";
    if (normalized === "rejected" || normalized === "denied") return "Rejected";
    if (normalized === "unclaimed") return "Unclaimed";
    return titleizeStatus(raw);
  }
  return row.is_claimed ? "Claimed" : "Unclaimed";
}

export function getDisplayCRMStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.crm_status);
  const claim = getClaimStatus(row).toLowerCase();
  const normalized = normalizeStatus(raw);
  if (!raw || normalized === "unclaimed" || normalized === normalizeStatus(claim)) return "Needs Outreach" as CRMStatus;
  if (normalized === "claimed") return "Active Free";
  if (normalized === "pro") return "Active Pro";
  if (normalized === "at-risk") return "At Risk";
  if (normalized === "upgrade-opportunity" || normalized === "upgrade-opportunities") return "Upgrade Opportunity";
  return titleizeStatus(raw) as CRMStatus;
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
    opportunity_score: toNumber(row.opportunity_score ?? row.upgrade_score),
    upgrade_score: toNumber(row.upgrade_score ?? row.opportunity_score),
    upgrade_probability: toNumber(row.upgrade_probability),
    engagement_score: toNumber(row.engagement_score),
    traffic_score: toNumber(row.traffic_score),
    conversion_score: toNumber(row.conversion_score),
    retention_score: toNumber(row.retention_score),
    churn_risk_score: toNumber(row.churn_risk_score ?? row.churn_risk),
    churn_risk: toNumber(row.churn_risk ?? row.churn_risk_score),
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

function rowMatchesSearch(row: Partial<BusinessCRMRow>, q?: string) {
  const term = String(q || "").trim().toLowerCase();
  if (!term) return true;
  return [
    row.name,
    row.location_name,
    (row as any).restaurant_name,
    (row as any).activity_name,
    row.address,
    row.city,
    row.borough,
    row.state,
    row.owner_email,
    (row as any).claimed_by_email,
    row.category,
    row.cuisine,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

function claimMatchesSearch(claim: PendingCRMClaim, q?: string) {
  const term = String(q || "").trim().toLowerCase();
  if (!term) return true;
  return [claim.submitted_business_name, claim.claimant_name, claim.claimant_email, claim.claimant_phone, claim.status].some((value) => String(value ?? "").toLowerCase().includes(term));
}

export function isUpgradeOpportunity(row: Partial<BusinessCRMRow>) {
  if (!isFreeOrInactivePlan(row) || !isActiveOrSearchable(row)) return false;
  const crmStatus = normalizeStatus(row.crm_status);
  const claimStatus = normalizeStatus(row.claim_status);
  const claimedFree = claimStatus === "claimed" && isFreeOrInactivePlan(row);
  return toNumber(row.search_appearances_30d) > 0
    || toNumber(row.profile_views_30d) > 0
    || toNumber(row.reservation_completions_30d) > 0
    || !hasReservationLink(row)
    || claimedFree
    || crmStatus === "upgrade-opportunity"
    || crmStatus === "upgrade-opportunities"
    || toNumber((row as any).upgrade_score ?? row.opportunity_score) > 0;
}

export function isAtRiskLocation(row: Partial<BusinessCRMRow>) {
  const crmStatus = normalizeStatus(row.crm_status);
  const planStatus = normalizeStatus(row.plan_status ?? row.subscription_status);
  return crmStatus === "at-risk"
    || toNumber((row as any).churn_risk ?? row.churn_risk_score) > 0
    || ["past-due", "canceled", "cancelled"].includes(planStatus)
    || row.active === false
    || row.is_searchable === false
    || !hasImage(row)
    || !hasText(row.phone)
    || !hasText(row.website)
    || (isReservePlan(row) && !hasReservationLink(row))
    || isOverdueDate(row.follow_up_date);
}

function matchesBusinessFilter(row: BusinessCRMRow, filter?: string) {
  switch (normalizeStatus(filter || "all")) {
    case "upgrade-opportunities":
    case "upgrade-opportunity":
      return isUpgradeOpportunity(row);
    case "at-risk":
      return isAtRiskLocation(row);
    case "owner-accounts":
    case "owners":
      return Boolean(row.owner_user_id || row.owner_email || row.is_claimed);
    case "location-tasks":
    case "open-tasks":
      return toNumber(row.open_tasks) > 0;
    case "follow-ups":
      return Boolean(row.follow_up_date);
    case "qr-codes":
    case "qr":
      return [row.claim_qr_url, row.qr_link, row.qr_code_data_url, row.claim_code, row.claim_url].some(hasText);
    case "all":
    default:
      return true;
  }
}

function sortCRMRows(rows: BusinessCRMRow[], filter?: string) {
  const normalized = normalizeStatus(filter || "all");
  return [...rows].sort((a, b) => {
    if (normalized === "at-risk") return (toNumber((b as any).churn_risk ?? b.churn_risk_score) - toNumber((a as any).churn_risk ?? a.churn_risk_score)) || String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    return (toNumber((b as any).upgrade_score ?? b.opportunity_score) - toNumber((a as any).upgrade_score ?? a.opportunity_score)) || String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
  });
}

async function fetchCRMRowsFrom(table: string) {
  const chunkSize = 1000;
  const rows: Record<string, any>[] = [];
  let total = 0;
  for (let page = 0; page < 50; page += 1) {
    const from = page * chunkSize;
    const to = from + chunkSize - 1;
    const { data, error, count } = await supabaseAdmin.from(table).select(CRM_SELECT, { count: page === 0 ? "exact" : undefined }).range(from, to);
    if (error) throw error;
    if (page === 0) total = count ?? data?.length ?? 0;
    rows.push(...(data || []));
    if (!data || data.length < chunkSize || rows.length >= total) break;
  }
  return { rows: normalizeCRMRows(rows), total: total || rows.length };
}

async function fetchAllCRMRows() {
  for (const table of CRM_SOURCE_TABLES) {
    try {
      const result = await fetchCRMRowsFrom(table);
      return result;
    } catch (error: any) {
      console.error(`Failed to fetch ${table} CRM rows`, error?.message || error);
    }
  }
  return { rows: [] as BusinessCRMRow[], total: 0 };
}

function normalizeClaim(row: any, sourceTable = "claims"): PendingCRMClaim {
  return {
    ...row,
    id: String(row.id ?? `${sourceTable}-${row.location_id ?? row.email ?? row.claimant_email ?? row.created_at ?? "claim"}`),
    source_table: sourceTable,
    location_id: row.location_id ?? row.business_id ?? row.location_uuid ?? null,
    status: getClaimStatus({ claim_status: row.status ?? row.claim_status, is_claimed: false }),
    claimant_name: row.claimant_name ?? row.owner_name ?? row.name ?? row.contact_name ?? row.full_name,
    claimant_email: row.claimant_email ?? row.owner_email ?? row.email ?? row.contact_email,
    claimant_phone: row.claimant_phone ?? row.owner_phone ?? row.phone ?? row.contact_phone,
    submitted_business_name: row.submitted_business_name ?? row.business_name ?? row.location_name ?? row.restaurant_name ?? row.activity_name ?? row.name,
    submitted_at: row.submitted_at ?? row.created_at ?? row.inserted_at,
    review_notes: row.review_notes ?? row.notes ?? row.admin_notes,
  };
}

async function fetchClaimRows(table: string) {
  const ordered = await safeSelect(table, (q) => q.select("*").order("created_at", { ascending: false }).limit(1000));
  if (ordered.length > 0) return ordered;
  return safeSelect(table, (q) => q.select("*").limit(1000));
}

export async function listPendingCRMClaims(query?: string): Promise<PendingCRMClaim[]> {
  const claims: PendingCRMClaim[] = [];
  const seen = new Set<string>();
  for (const table of CLAIM_SOURCE_TABLES) {
    const rows = await fetchClaimRows(table);
    for (const row of rows as any[]) {
      const claim = normalizeClaim(row, table);
      if (!PENDING_CLAIM_STATUSES.has(normalizeStatus(row.status ?? row.claim_status ?? claim.status))) continue;
      const key = `${claim.source_table}:${claim.id}`;
      if (seen.has(key) || !claimMatchesSearch(claim, query)) continue;
      seen.add(key);
      claims.push(claim);
    }
  }
  return claims.sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
}

export async function listBusinessCRMPage({ page = 1, pageSize = 100, query, filter }: { page?: number; pageSize?: number; query?: string; filter?: string }) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 100, 25), 1000);
  const safePage = Math.max(Number(page) || 1, 1);
  const from = (safePage - 1) * safePageSize;
  const normalizedFilter = normalizeStatus(filter || "all") as BusinessCRMFilter;

  if (normalizedFilter === "pending-claims") {
    const [claims, crm] = await Promise.all([listPendingCRMClaims(query), fetchAllCRMRows()]);
    const byId = new Map(crm.rows.map((row) => [String(row.location_id ?? row.id), row]));
    const claimRows = claims.map((claim) => claim.location_id ? byId.get(String(claim.location_id)) : null).filter(Boolean) as BusinessCRMRow[];
    return {
      rows: claimRows.slice(from, from + safePageSize),
      pendingClaims: claims.slice(from, from + safePageSize),
      total: claims.length,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(claims.length / safePageSize)),
    };
  }

  const { rows } = await fetchAllCRMRows();
  const filtered = sortCRMRows(rows.filter((row) => matchesBusinessFilter(row, normalizedFilter) && rowMatchesSearch(row, query)), normalizedFilter);
  const total = filtered.length;
  return { rows: filtered.slice(from, from + safePageSize), pendingClaims: [] as PendingCRMClaim[], total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
}

export async function listBusinessCRM(limit = 1000): Promise<BusinessCRMRow[]> {
  const page = await listBusinessCRMPage({ page: 1, pageSize: limit });
  return page.rows;
}

export async function getBusinessCRMSummary(): Promise<BusinessCRMSummary> {
  const [crm, pendingClaims] = await Promise.all([fetchAllCRMRows(), listPendingCRMClaims()]);
  const rows = crm.rows;
  const totalCount = crm.total || rows.length;
  const countWhere = async (column: string, value: any) => {
    const { count, error } = await supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq(column, value);
    return error ? rows.filter((r: any) => r[column] === value).length : count || 0;
  };
  const searchable = await countWhere("is_searchable", true);
  const claimed = await countWhere("is_claimed", true);
  const upgradeCandidates = rows.filter(isUpgradeOpportunity).length;
  const atRisk = rows.filter(isAtRiskLocation).length;

  return {
    total: totalCount,
    searchable,
    claimed,
    unclaimed: Math.max(totalCount - claimed, 0),
    pendingClaims: pendingClaims.length,
    pendingClaimsCount: pendingClaims.length,
    upgradeCandidates,
    upgradeOpportunitiesCount: upgradeCandidates,
    atRisk,
    atRiskCount: atRisk,
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

export async function getLocationCrmRelatedData(locationId: string) {
  const [notes, reminders, businessComms, comms, logs, businessClaims, locationClaims, ownerClaims, supportTickets, qr1, qr2, qr3, qr4, owners1, owners2, owners3, planChanges, photoChanges, templates, reservations] = await Promise.all([
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
    safeSelect("reservations", (q) => q.select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(100)),
  ]);

  return {
    notes,
    reminders,
    communications: [...businessComms, ...comms],
    logs,
    claims: [...businessClaims.map((row: any) => normalizeClaim(row, "business_claims")), ...locationClaims.map((row: any) => normalizeClaim(row, "location_claim_requests")), ...ownerClaims.map((row: any) => normalizeClaim(row, "owner_claims"))],
    supportTickets,
    qrCodes: [...qr1, ...qr2, ...qr3, ...qr4],
    owners: [...owners1, ...owners2, ...owners3],
    planChanges,
    photoChanges,
    templates,
    reservations,
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

export function dedupeUrls(urls: unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of urls) {
    const url = String(raw ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    clean.push(url);
  }
  return clean;
}

export function normalizeImageArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return dedupeUrls(value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") return [(item as any).url, (item as any).src, (item as any).href].filter(Boolean);
      return [];
    }));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeImageArray(parsed);
    } catch {}
    return dedupeUrls(trimmed.split(/[\n,]+/));
  }
  return [];
}

export function getLocationMainImage(location: Partial<BusinessCRMRow> | Record<string, any>) {
  return String((location as any).main_image || (location as any).image_url || "").trim() || null;
}

export function getLocationGalleryImages(location: Partial<BusinessCRMRow> | Record<string, any>) {
  return dedupeUrls([
    ...normalizeImageArray((location as any).gallery_images),
    ...normalizeImageArray((location as any).gallery),
    ...normalizeImageArray((location as any).photos),
    ...normalizeImageArray((location as any).image_gallery),
    ...normalizeImageArray((location as any).images),
  ]);
}

function escapeAddressPart(value?: string | null) {
  return String(value || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripCityStateZipFromStreetAddress(address?: string | null, city?: string | null, state?: string | null, zip?: string | null) {
  let street = String(address || "").trim();
  const parts = [city, state, zip].map(escapeAddressPart).filter(Boolean);
  if (!street || parts.length === 0) return street;

  const cityStateZip = [city, state, zip].map((part) => String(part || "").trim()).filter(Boolean).join("\\s*,?\\s*");
  if (cityStateZip) street = street.replace(new RegExp(`\\s*,?\\s*${cityStateZip}\\s*$`, "i"), "");
  for (const part of parts) street = street.replace(new RegExp(`\\s*,?\\s*${part}\\s*$`, "i"), "");
  return street.replace(/\s*,\s*$/, "").trim();
}

export function formatFullAddress({ address, city, state, zip }: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  const street = stripCityStateZipFromStreetAddress(address, city, state, zip);
  return [street, city, state, zip].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

export async function safeUpdateLocationPhotos(locationId: string, payload: { mainImage?: string | null; galleryImages?: string[] }) {
  const mainImage = payload.mainImage ?? null;
  const galleryImages = dedupeUrls(payload.galleryImages || []);
  const updates: Record<string, any> = {
    main_image: mainImage,
    image_url: mainImage,
    gallery_images: galleryImages,
    gallery: galleryImages,
    photos: galleryImages,
    image_gallery: galleryImages,
    images: galleryImages,
    updated_at: new Date().toISOString(),
  };
  const missingColumn = (message?: string) => /column .* does not exist|could not find .* column|schema cache/i.test(message || "");
  const errors: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", locationId);
    if (!error) return null;
    errors.push(error.message);
    if (!missingColumn(error.message)) break;
    const match = error.message.match(/'([^']+)'|column "?([a-zA-Z0-9_]+)"?/);
    const column = match?.[1] || match?.[2];
    if (column && updates[column] !== undefined) delete updates[column];
    else {
      const optional = ["gallery", "photos", "image_gallery", "images", "gallery_images", "image_url", "main_image"].find((key) => updates[key] !== undefined);
      if (optional) delete updates[optional];
      else break;
    }
  }
  return errors.join("; ");
}
