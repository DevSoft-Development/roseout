import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase filter builders are intentionally dynamic across generated table types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

async function authorize(request: Request) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(["admin", "superadmin", "editor"]);
  return error;
}

async function safeCount(
  table: string,
  filter?: (query: QueryBuilder) => QueryBuilder,
) {
  let query = supabaseAdmin.from(table).select("id", {
    count: "exact",
    head: true,
  });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) {
    console.warn(`summary count failed for ${table}`, error.message);
    return 0;
  }
  return count || 0;
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth) return auth;

  const [
    liveLocations,
    searchableLocations,
    needsReview,
    duplicates,
    staged,
    publishReady,
    possibleDuplicates,
    rejected,
    enrichmentQueued,
    remainingPublishReady,
    remainingUncheckedDedupe,
    needsScoring,
    missingClaimCodes,
    missingClaimQrs,
    missingPublicQrs,
  ] = await Promise.all([
    safeCount("locations"),
    safeCount("locations", (query) => query.eq("is_searchable", true)),
    safeCount("locations", (query) =>
      query.in("quality_status", ["needs_review", "review"]),
    ),
    safeCount("locations", (query) => query.eq("duplicate_status", "duplicate")),
    safeCount("location_import_staging", (query) =>
      query.eq("import_status", "staged"),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("quality_status", "publish_ready")
        .eq("duplicate_status", "unique")
        .eq("import_status", "staged"),
    ),
    safeCount("location_import_staging", (query) =>
      query.eq("duplicate_status", "possible_duplicate"),
    ),
    safeCount("location_import_staging", (query) =>
      query.or(
        "import_status.eq.rejected,quality_status.eq.reject,duplicate_status.eq.duplicate",
      ),
    ),
    safeCount("locations", (query) =>
      query
        .in("enrichment_status", ["queued", "not_started", "failed"])
        .gte("quality_score", 80),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("import_status", "staged")
        .eq("quality_status", "publish_ready")
        .eq("duplicate_status", "unique"),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("import_status", "staged")
        .eq("duplicate_status", "unchecked"),
    ),
    safeCount("location_import_staging", (query) =>
      query
        .eq("import_status", "staged")
        .or("quality_status.in.(needs_review,unchecked),quality_score.is.null"),
    ),
    safeCount("locations", (query) =>
      query.eq("is_searchable", true).is("claim_code", null),
    ),
    safeCount("locations", (query) =>
      query
        .eq("is_searchable", true)
        .or("claim_qr_url.is.null,claim_qr_code_url.is.null"),
    ),
    safeCount("locations", (query) =>
      query
        .eq("is_searchable", true)
        .or("qr_code_data_url.is.null,qr_code_url.is.null"),
    ),
  ]);

  const { data: latestBatches } = await supabaseAdmin
    .from("location_import_batches")
    .select(
      "id,source,source_label,status,total_seen,total_staged,total_duplicates,total_possible_duplicates,total_rejected,total_publish_ready,total_published,metadata,started_at,completed_at",
    )
    .order("started_at", { ascending: false })
    .limit(20);

  const siteUrlConfigured = Boolean(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      process.env.APP_URL,
  );

  return NextResponse.json({
    success: true,
    liveLocations,
    searchableLocations,
    needsReview,
    duplicates,
    staged,
    publishReady,
    possibleDuplicates,
    rejected,
    enrichmentQueued,
    remainingPublishReady,
    remainingUncheckedDedupe,
    needsScoring,
    missingClaimCodes,
    missingClaimQrs,
    missingPublicQrs,
    siteUrlConfigured,
    siteUrl: getSiteUrl(),
    latestBatches: latestBatches || [],
  });
}
