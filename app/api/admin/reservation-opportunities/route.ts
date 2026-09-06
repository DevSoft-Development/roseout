import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SalesPriority = "top" | "strong" | "standard" | "verification";

type OpportunityRow = {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  primary_category?: string | null;
  reservation_discovery_status?: string | null;
  reservation_upgrade_reason?: string | null;
  reservation_upgrade_detected_at?: string | null;
  reservation_outreach_status?: string | null;
  reservation_outreach_notes?: string | null;
  reservation_opportunity_score?: number | null;
  reservation_opportunity_tier?: string | null;
  reservation_opportunity_classification?: string | null;
  reservation_opportunity_evidence?: unknown;
  reservation_opportunity_scored_at?: string | null;
  sales_priority?: SalesPriority;
  crm_account_id?: string | null;
  crm_opportunity_id?: string | null;
};

const OPPORTUNITY_SELECT =
  "id,name,city,state,address,phone,website,google_maps_url,rating,review_count,primary_category,reservation_discovery_status,reservation_upgrade_reason,reservation_upgrade_detected_at,reservation_outreach_status,reservation_outreach_notes,reservation_opportunity_score,reservation_opportunity_tier,reservation_opportunity_classification,reservation_opportunity_evidence,reservation_opportunity_scored_at";

const RESERVATION_FRIENDLY_CATEGORY = /(steakhouse|french|seafood|italian|japanese|sushi|fine|rooftop|lounge|mediterranean)/i;
const PRIORITY_RANK: Record<SalesPriority, number> = { top: 0, strong: 1, standard: 2, verification: 3 };

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin environment variables");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const xAdminSecret = request.headers.get("x-admin-secret")?.trim() || "";
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();
  if (adminSecret && (bearerToken === adminSecret || xAdminSecret === adminSecret)) return null;
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reservations);
  if (!error) return null;
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function salesPriority(row: OpportunityRow): SalesPriority {
  if (row.reservation_opportunity_tier !== "high" || row.reservation_opportunity_classification !== "no_online_reservations") {
    return "verification";
  }

  const score = num(row.reservation_opportunity_score);
  const rating = num(row.rating);
  const reviews = num(row.review_count);
  const contactable = hasText(row.website) && hasText(row.phone);
  const reservationFriendly = RESERVATION_FRIENDLY_CATEGORY.test(row.primary_category || "");

  if (score >= 80 && rating >= 4.5 && reviews >= 500 && contactable && reservationFriendly) return "top";
  if ((score >= 80 && rating >= 4.2 && reviews >= 100 && contactable) || (rating >= 4.5 && reviews >= 500 && contactable)) return "strong";
  return "standard";
}

function applyDerivedPriority(rows: OpportunityRow[]) {
  return rows.map((row) => ({ ...row, sales_priority: salesPriority(row) }));
}

function sortBySalesPriority(a: OpportunityRow, b: OpportunityRow) {
  const priority = PRIORITY_RANK[a.sales_priority || "verification"] - PRIORITY_RANK[b.sales_priority || "verification"];
  if (priority !== 0) return priority;
  const score = num(b.reservation_opportunity_score) - num(a.reservation_opportunity_score);
  if (score !== 0) return score;
  const rating = num(b.rating) - num(a.rating);
  if (rating !== 0) return rating;
  const reviews = num(b.review_count) - num(a.review_count);
  if (reviews !== 0) return reviews;
  return (b.reservation_upgrade_detected_at || "").localeCompare(a.reservation_upgrade_detected_at || "");
}

interface FilterableQuery {
  eq(column: string, value: unknown): this;
  ilike(column: string, pattern: string): this;
  gte(column: string, value: number): this;
}

function applyFilters<T extends FilterableQuery>(query: T, searchParams: URLSearchParams): T {
  const city = clean(searchParams.get("city"));
  const state = clean(searchParams.get("state"));
  const category = clean(searchParams.get("category"));
  const status = clean(searchParams.get("status"));
  const tier = clean(searchParams.get("tier"));
  const classification = clean(searchParams.get("classification"));
  const minRating = clean(searchParams.get("minRating"));
  const minScore = clean(searchParams.get("minScore"));
  const q = clean(searchParams.get("q"));

  query = query.eq("reservation_upgrade_opportunity", true);
  if (city) query = query.ilike("city", city);
  if (state) query = query.ilike("state", state);
  if (category) query = query.ilike("primary_category", `%${category}%`);
  if (status) query = query.eq("reservation_outreach_status", status);
  if (tier) query = query.eq("reservation_opportunity_tier", tier);
  if (classification) query = query.eq("reservation_opportunity_classification", classification);
  if (minRating && Number.isFinite(Number(minRating))) query = query.gte("rating", Number(minRating));
  if (minScore && Number.isFinite(Number(minScore))) query = query.gte("reservation_opportunity_score", Number(minScore));
  if (q) query = query.ilike("name", `%${q}%`);
  return query;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function evidenceText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(" | ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ? String(value) : "";
}

function toCsv(rows: OpportunityRow[]) {
  const headers = ["Name","Address","City","State","Phone","Website","Google Maps","Rating","Reviews","Category","Sales Priority","Reserve Score","Reserve Tier","Classification","Evidence","Discovery Status","Opportunity Reason","Outreach Status","CRM Account","CRM Opportunity"];
  const lines = rows.map((row) => [
    row.name,row.address,row.city,row.state,row.phone,row.website,row.google_maps_url,row.rating,row.review_count,row.primary_category,row.sales_priority,
    row.reservation_opportunity_score,row.reservation_opportunity_tier,row.reservation_opportunity_classification,evidenceText(row.reservation_opportunity_evidence),
    row.reservation_discovery_status,row.reservation_upgrade_reason,row.reservation_outreach_status,row.crm_account_id,row.crm_opportunity_id,
  ].map(csvCell).join(","));
  return [headers.map(csvCell).join(","), ...lines].join("\n");
}

async function attachCrmLinks(supabase: SupabaseClient, rows: OpportunityRow[]) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const [{ data: links }, { data: opportunities }] = await Promise.all([
    supabase.from("crm_account_locations").select("location_id,account_id,status").in("location_id", ids).neq("status", "inactive"),
    supabase.from("crm_opportunities").select("id,primary_location_id,status,pipeline_key").in("primary_location_id", ids).eq("pipeline_key", "reserve_pro").eq("status", "open").is("archived_at", null),
  ]);
  const accountByLocation = new Map((links || []).map((link) => [link.location_id, link.account_id]));
  const opportunityByLocation = new Map((opportunities || []).map((opportunity) => [opportunity.primary_location_id, opportunity.id]));
  return rows.map((row) => ({
    ...row,
    crm_account_id: accountByLocation.get(row.id) || null,
    crm_opportunity_id: opportunityByLocation.get(row.id) || null,
  }));
}

async function getSummary(supabase: SupabaseClient, prioritizedRows: OpportunityRow[]) {
  const statuses = ["not_contacted","contacted","interested","claimed","onboarded"];
  const tiers = ["high","medium","low"];
  const summary: Record<string, number> = { claimed_onboarded: 0, priority_top: 0, priority_strong: 0, priority_standard: 0 };
  await Promise.all([
    ...statuses.map(async (status) => {
      const { count } = await supabase.from("locations").select("id", { count: "exact", head: true }).eq("reservation_upgrade_opportunity", true).eq("reservation_outreach_status", status);
      summary[status] = count || 0;
    }),
    ...tiers.map(async (tier) => {
      const { count } = await supabase.from("locations").select("id", { count: "exact", head: true }).eq("reservation_upgrade_opportunity", true).eq("reservation_opportunity_tier", tier);
      summary[`tier_${tier}`] = count || 0;
    }),
  ]);
  for (const row of prioritizedRows) {
    if (row.sales_priority === "top") summary.priority_top += 1;
    if (row.sales_priority === "strong") summary.priority_strong += 1;
    if (row.sales_priority === "standard") summary.priority_standard += 1;
  }
  summary.claimed_onboarded = (summary.claimed || 0) + (summary.onboarded || 0);
  return summary;
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthorization(request);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  const { searchParams } = request.nextUrl;
  const isCsv = searchParams.get("export") === "csv";
  const limit = isCsv ? numberParam(searchParams.get("limit"), 1000, 1, 5000) : numberParam(searchParams.get("limit"), 50, 1, 200);
  const offset = numberParam(searchParams.get("offset"), 0, 0, 1_000_000);
  const requestedPriority = clean(searchParams.get("salesPriority")) as SalesPriority | null;

  let query = supabase.from("locations").select(OPPORTUNITY_SELECT);
  query = applyFilters(query, searchParams).limit(5000);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const allPrioritized = applyDerivedPriority((data || []) as OpportunityRow[]).sort(sortBySalesPriority);
  const filtered = requestedPriority ? allPrioritized.filter((row) => row.sales_priority === requestedPriority) : allPrioritized;
  const total = filtered.length;
  const pageRows = isCsv ? filtered.slice(0, limit) : filtered.slice(offset, offset + limit);
  const opportunities = await attachCrmLinks(supabase, pageRows);

  if (isCsv) {
    return new NextResponse(toCsv(opportunities), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="reservation-opportunities.csv"' },
    });
  }

  return NextResponse.json({ success: true, total, limit, offset, nextOffset: offset + opportunities.length, summary: await getSummary(supabase, allPrioritized), opportunities });
}