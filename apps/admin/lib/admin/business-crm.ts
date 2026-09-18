import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type BusinessCRMRow = {
  id: string;
  location_id?: string | null;
  name: string;
  location_name?: string | null;
  city: string | null;
  state: string | null;
  category?: string | null;
  cuisine?: string | null;
  reservation_url: string | null;
  location_type?: "restaurants" | "activities" | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  claim_status?: string | null;
  is_claimed: boolean | null;
  crm_status: string;
  opportunity_score: number;
  traffic_score: number;
  churn_risk_score: number;
  trending_score: number;
  open_tasks?: number;
  pending_claims?: number;
  reservation_completions_30d: number;
  profile_views_30d: number;
  search_appearances_30d: number;
  saves_30d: number;
  conversion_rate_30d: number;
  [key: string]: unknown;
};

const CRM_SOURCES = [
  "admin_crm_locations_view",
  "business_crm_snapshot",
  "locations",
] as const;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanStatus(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown) {
  return cleanStatus(value)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function titleizeStatus(value: unknown) {
  return cleanStatus(value)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const PENDING_CLAIM_STATUSES = new Set([
  "pending",
  "pending-review",
  "submitted",
  "under-review",
  "verification-pending",
]);

function getClaimStatus(row: Partial<BusinessCRMRow>) {
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

function getDisplayCRMStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.crm_status);
  const claim = getClaimStatus(row).toLowerCase();
  const normalized = normalizeStatus(raw);
  if (!raw || normalized === "unclaimed" || normalized === normalizeStatus(claim)) {
    return "Needs Outreach";
  }
  if (normalized === "claimed") return "Active Free";
  if (normalized === "pro") return "Active Pro";
  if (normalized === "at-risk") return "At Risk";
  if (normalized === "upgrade-opportunity" || normalized === "upgrade-opportunities") {
    return "Upgrade Opportunity";
  }
  return titleizeStatus(raw);
}

function inferLocationType(row: Record<string, unknown>) {
  if (row.location_type === "activities") return "activities" as const;
  if (row.location_type === "restaurants") return "restaurants" as const;
  const raw = String(row.source_table || row.category || row.primary_category || "").toLowerCase();
  return raw.includes("activit") ? "activities" as const : "restaurants" as const;
}

function normalizeCRMRow(row: Record<string, any>): BusinessCRMRow {
  const base = {
    ...row,
    id: String(row.id ?? row.location_id ?? ""),
    location_id: row.location_id ?? row.id ?? null,
    name: String(
      row.name ??
        row.location_name ??
        row.restaurant_name ??
        row.activity_name ??
        "Untitled Location",
    ),
    location_name:
      row.location_name ??
      row.name ??
      row.restaurant_name ??
      row.activity_name ??
      "Untitled Location",
    city: row.city ?? "",
    state: row.state ?? "",
    category: row.category ?? row.primary_category ?? "",
    cuisine: row.cuisine ?? row.cuisine_type ?? "",
    reservation_url:
      row.best_reservation_url ??
      row.reservation_url ??
      row.reservation_link ??
      row.booking_url ??
      row.external_reservation_url ??
      "",
    is_claimed: Boolean(
      row.is_claimed ||
        normalizeStatus(row.claim_status) === "claimed" ||
        normalizeStatus(row.claim_status) === "approved",
    ),
    location_type: inferLocationType(row),
    opportunity_score: toNumber(row.opportunity_score ?? row.upgrade_score),
    traffic_score: toNumber(row.traffic_score),
    churn_risk_score: toNumber(row.churn_risk_score ?? row.churn_risk),
    trending_score: toNumber(row.trending_score ?? row.trend_score),
    open_tasks: toNumber(row.open_tasks),
    pending_claims: toNumber(row.pending_claims),
    reservation_completions_30d: toNumber(row.reservation_completions_30d),
    profile_views_30d: toNumber(row.profile_views_30d),
    search_appearances_30d: toNumber(row.search_appearances_30d),
    saves_30d: toNumber(row.saves_30d),
    conversion_rate_30d: toNumber(row.conversion_rate_30d),
  } as BusinessCRMRow;

  return {
    ...base,
    claim_status: getClaimStatus(base),
    crm_status: getDisplayCRMStatus(base),
  };
}

async function readSource(source: (typeof CRM_SOURCES)[number], limit: number) {
  const database = getAdminDatabaseClient();
  const cap = Math.min(Math.max(limit, 1), 100);

  for (const orderField of ["updated_at", "created_at", null] as const) {
    let query = database.from(source).select("*").limit(cap);
    if (orderField) query = query.order(orderField, { ascending: false });
    const { data, error } = await query;
    if (!error) return data || [];
  }

  return [];
}

export async function listBusinessCRM(limit = 1000): Promise<BusinessCRMRow[]> {
  for (const source of CRM_SOURCES) {
    try {
      const rows = await readSource(source, limit);
      if (rows.length > 0 || source === "locations") {
        return rows.map((row) => normalizeCRMRow(row as Record<string, any>));
      }
    } catch (error) {
      console.error(`Optional Business CRM source ${source} unavailable`, error);
    }
  }
  return [];
}

export async function getBusinessCRM(id: string): Promise<BusinessCRMRow | null> {
  for (const source of CRM_SOURCES) {
    try {
      const database = getAdminDatabaseClient();
      const byId = await database.from(source).select("*").eq("id", id).limit(1).maybeSingle();
      if (!byId.error && byId.data) return normalizeCRMRow(byId.data as Record<string, any>);

      if (source !== "locations") {
        const byLocationId = await database
          .from(source)
          .select("*")
          .eq("location_id", id)
          .limit(1)
          .maybeSingle();
        if (!byLocationId.error && byLocationId.data) {
          return normalizeCRMRow(byLocationId.data as Record<string, any>);
        }
      }
    } catch (error) {
      console.error(`Optional Business CRM detail source ${source} unavailable`, error);
    }
  }
  return null;
}

export function getUpgradeFlags(business: BusinessCRMRow): string[] {
  const flags: string[] = [];
  if (!business.is_claimed && business.traffic_score >= 70) flags.push("High Traffic Free Account");
  if (business.reservation_completions_30d >= 30) flags.push("High Reservation Activity");
  if (business.trending_score >= 65) flags.push("Trending Location");
  if (!business.reservation_url) flags.push("Missing Reservation Link");
  if (business.search_appearances_30d >= 200) flags.push("Strong Search Visibility");
  if (business.saves_30d >= 20) flags.push("High Save Rate");
  if (business.conversion_rate_30d <= 0.08 && business.traffic_score >= 60) {
    flags.push("High Conversion Potential");
  }
  if (business.opportunity_score >= 75) flags.push("Candidate For Promoted Listings");
  if ((business.open_tasks || 0) > 0) flags.push("Open CRM Tasks");
  if ((business.pending_claims || 0) > 0) flags.push("Pending Claim");
  return flags;
}
