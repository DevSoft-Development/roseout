import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
};

const OPPORTUNITY_SELECT =
  "id,name,city,state,address,phone,website,google_maps_url,rating,review_count,primary_category,reservation_discovery_status,reservation_upgrade_reason,reservation_upgrade_detected_at,reservation_outreach_status,reservation_outreach_notes";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing Supabase admin environment variables");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const xAdminSecret = request.headers.get("x-admin-secret")?.trim() || "";
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();

  if (
    adminSecret &&
    (bearerToken === adminSecret || xAdminSecret === adminSecret)
  )
    return null;

  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reservations);
  if (!error) return null;

  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function numberParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

interface FilterableQuery {
  eq(column: string, value: unknown): this;
  ilike(column: string, pattern: string): this;
  gte(column: string, value: number): this;
}

function applyFilters<T extends FilterableQuery>(
  query: T,
  searchParams: URLSearchParams,
): T {
  const city = clean(searchParams.get("city"));
  const state = clean(searchParams.get("state"));
  const category = clean(searchParams.get("category"));
  const status = clean(searchParams.get("status"));
  const minRating = clean(searchParams.get("minRating"));
  const q = clean(searchParams.get("q"));

  query = query.eq("reservation_upgrade_opportunity", true);
  if (city) query = query.ilike("city", city);
  if (state) query = query.ilike("state", state);
  if (category) query = query.ilike("primary_category", `%${category}%`);
  if (status) query = query.eq("reservation_outreach_status", status);
  if (minRating && Number.isFinite(Number(minRating)))
    query = query.gte("rating", Number(minRating));
  if (q) query = query.ilike("name", `%${q}%`);

  return query;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: OpportunityRow[]) {
  const headers = [
    "Name",
    "Address",
    "City",
    "State",
    "Phone",
    "Website",
    "Google Maps",
    "Rating",
    "Reviews",
    "Category",
    "Discovery Status",
    "Opportunity Reason",
    "Outreach Status",
  ];

  const lines = rows.map((row) =>
    [
      row.name,
      row.address,
      row.city,
      row.state,
      row.phone,
      row.website,
      row.google_maps_url,
      row.rating,
      row.review_count,
      row.primary_category,
      row.reservation_discovery_status,
      row.reservation_upgrade_reason,
      row.reservation_outreach_status,
    ]
      .map(csvCell)
      .join(","),
  );

  return [headers.map(csvCell).join(","), ...lines].join("\n");
}

async function getSummary(supabase: SupabaseClient) {
  const statuses = [
    "not_contacted",
    "contacted",
    "interested",
    "claimed",
    "onboarded",
  ];
  const summary: Record<string, number> = { claimed_onboarded: 0 };

  await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("reservation_upgrade_opportunity", true)
        .eq("reservation_outreach_status", status);
      summary[status] = count || 0;
    }),
  );
  summary.claimed_onboarded = (summary.claimed || 0) + (summary.onboarded || 0);
  return summary;
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthorization(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { searchParams } = request.nextUrl;
  const isCsv = searchParams.get("export") === "csv";
  const limit = isCsv
    ? numberParam(searchParams.get("limit"), 1000, 1, 5000)
    : numberParam(searchParams.get("limit"), 50, 1, 200);
  const offset = numberParam(searchParams.get("offset"), 0, 0, 1_000_000);

  let query = supabase
    .from("locations")
    .select(OPPORTUNITY_SELECT, { count: "exact" });
  query = applyFilters(query, searchParams)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .order("reservation_upgrade_detected_at", {
      ascending: false,
      nullsFirst: false,
    })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );

  const opportunities = (data || []) as OpportunityRow[];

  if (isCsv) {
    return new NextResponse(toCsv(opportunities), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="reservation-opportunities.csv"',
      },
    });
  }

  return NextResponse.json({
    success: true,
    total: count || 0,
    limit,
    offset,
    nextOffset: offset + opportunities.length,
    summary: await getSummary(supabase),
    opportunities,
  });
}
