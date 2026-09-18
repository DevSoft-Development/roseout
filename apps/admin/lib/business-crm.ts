import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type BusinessCRMRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  is_claimed: boolean;
  reservation_url: string | null;
  location_type: "restaurants" | "activities" | null;
  owner_user_id: string | null;
  crm_status: string;
  opportunity_score: number;
  churn_risk_score: number;
  traffic_score: number;
  trending_score: number;
  reservation_completions_30d: number;
  profile_views_30d: number;
  search_appearances_30d: number;
  saves_30d: number;
  conversion_rate_30d: number;
  open_tasks?: number;
  pending_claims?: number;
  [key: string]: unknown;
};

const SOURCES = ["admin_crm_locations_view", "business_crm_snapshot", "locations"] as const;

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeCRMRow(row: Record<string, any>): BusinessCRMRow {
  const isClaimed = Boolean(
    row.is_claimed ||
      String(row.claim_status || "").toLowerCase() === "claimed" ||
      row.owner_user_id ||
      row.owner_email,
  );
  const isPartner =
    row.is_pro === true ||
    ["pro", "partner", "partner-99", "theouthaven-partner"].includes(
      String(row.plan || row.subscription_plan || "").toLowerCase(),
    );
  const crmStatus =
    s(row.crm_status) ||
    (isPartner ? "Partner" : isClaimed ? "Claimed" : "Unclaimed");

  return {
    ...row,
    id: String(row.id ?? row.location_id ?? ""),
    name: String(
      row.name ??
        row.location_name ??
        row.restaurant_name ??
        row.activity_name ??
        "Untitled Location",
    ),
    city: s(row.city),
    state: s(row.state),
    is_claimed: isClaimed,
    reservation_url:
      s(row.best_reservation_url) ||
      s(row.reservation_url) ||
      s(row.reservation_link) ||
      s(row.booking_url) ||
      s(row.external_reservation_url),
    location_type:
      row.location_type === "activities"
        ? "activities"
        : row.location_type === "restaurants"
          ? "restaurants"
          : null,
    owner_user_id: s(row.owner_user_id),
    crm_status: crmStatus,
    opportunity_score: n(row.opportunity_score ?? row.upgrade_score),
    churn_risk_score: n(row.churn_risk_score ?? row.churn_risk),
    traffic_score: n(row.traffic_score),
    trending_score: n(row.trending_score ?? row.trend_score),
    reservation_completions_30d: n(row.reservation_completions_30d),
    profile_views_30d: n(row.profile_views_30d),
    search_appearances_30d: n(row.search_appearances_30d),
    saves_30d: n(row.saves_30d),
    conversion_rate_30d: n(row.conversion_rate_30d),
    open_tasks: n(row.open_tasks),
    pending_claims: n(row.pending_claims),
  };
}

async function listFromSource(source: (typeof SOURCES)[number], limit: number) {
  let query = getAdminDatabaseClient().from(source).select("*").limit(limit);
  const ordered = await query.order("updated_at", { ascending: false });
  if (!ordered.error) return ordered.data || [];

  const fallback = await getAdminDatabaseClient().from(source).select("*").limit(limit);
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
}

export async function listBusinessCRM(limit = 100): Promise<BusinessCRMRow[]> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  for (const source of SOURCES) {
    try {
      const rows = await listFromSource(source, safeLimit);
      if (rows.length || source === "locations") {
        return rows.map((row: any) => normalizeCRMRow(row));
      }
    } catch (error) {
      console.error(`Optional isolated Business CRM source ${source} unavailable`, error);
    }
  }
  return [];
}

export async function getBusinessCRM(id: string): Promise<BusinessCRMRow | null> {
  for (const source of SOURCES) {
    try {
      const query = getAdminDatabaseClient().from(source).select("*");
      const result =
        source === "locations"
          ? await query.eq("id", id).maybeSingle()
          : await query.or(`id.eq.${id},location_id.eq.${id}`).maybeSingle();
      if (!result.error && result.data) return normalizeCRMRow(result.data as Record<string, any>);
      if (result.error) {
        console.error(`Optional isolated Business CRM detail source ${source} unavailable`, result.error.message);
      }
    } catch (error) {
      console.error(`Optional isolated Business CRM detail source ${source} failed`, error);
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
  if (business.conversion_rate_30d <= 0.08 && business.traffic_score >= 60) flags.push("High Conversion Potential");
  if (business.opportunity_score >= 75) flags.push("Candidate For Promoted Listings");
  if ((business.open_tasks || 0) > 0) flags.push("Open CRM Tasks");
  if ((business.pending_claims || 0) > 0) flags.push("Pending Claim");
  return flags;
}
