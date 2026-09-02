import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getCrmLocationHealthViaCoreApi, platformCoreApiConfigured } from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZES = new Set([25, 50, 100]);
const BLOCKING_RUN_STATUSES = new Set(["planned", "queued", "running"]);
const RESERVATION_DISCOVERY_EXHAUSTED = new Set(["not_found", "no_website"]);
const HOURS_DISCOVERY_EXHAUSTED = new Set(["website_no_hours"]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function hasReservationLink(row: any) {
  return Boolean(text(row.external_reservation_url || row.reservation_url || row.reservation_link || row.booking_url));
}

function reservationDiscoveryExhausted(row: any) {
  return RESERVATION_DISCOVERY_EXHAUSTED.has(text(row.reservation_discovery_status).toLowerCase());
}

function hoursDiscoveryExhausted(row: any) {
  return HOURS_DISCOVERY_EXHAUSTED.has(text(row.hours_backfill_status).toLowerCase());
}

function issuesFor(row: any) {
  const issues: string[] = [];
  if (!text(row.google_place_id)) issues.push("Missing trusted business match");
  const missingHours = !row.operating_hours || (typeof row.operating_hours === "object" && Object.keys(row.operating_hours).length === 0);
  if (missingHours && !hoursDiscoveryExhausted(row)) issues.push("Hours missing");
  if (!text(row.main_image) && !text(row.image_url) && (!Array.isArray(row.images) || row.images.length === 0)) issues.push("Photo missing");
  if (!text(row.website) && !text(row.google_website_uri)) issues.push("Website missing");
  if (!text(row.phone)) issues.push("Phone missing");
  if (!text(row.primary_category || row.cuisine || row.cuisine_type || row.activity_type)) issues.push("Category missing");
  if (!hasReservationLink(row) && !reservationDiscoveryExhausted(row)) issues.push("Reservation link missing");
  if (row.latitude == null || row.longitude == null) issues.push("Map location incomplete");
  if (!Array.isArray(row.search_keywords) || !row.search_keywords.length || !Array.isArray(row.semantic_tags) || !row.semantic_tags.length || !Array.isArray(row.intent_tags) || !row.intent_tags.length) issues.push("Search details need improvement");
  const enrichedAt = row.google_enriched_at ? new Date(row.google_enriched_at).getTime() : 0;
  if (!enrichedAt || enrichedAt < Date.now() - 90 * 86400000) issues.push("Information needs refreshing");
  return issues;
}

function healthScore(issueCount: number) {
  return Math.max(20, 100 - Math.min(10, issueCount) * 8);
}

function isCrmLocationHealthRun(run: any) {
  return run?.settings?.createdFrom === "crm-location-health";
}

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.crm);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const requestedPageSize = Number(url.searchParams.get("pageSize") || 50);
  const pageSize = PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 50;
  const q = text(url.searchParams.get("q"));
  const view = text(url.searchParams.get("view") || "attention");

  if (platformCoreApiConfigured()) {
    try {
      const payload = await getCrmLocationHealthViaCoreApi({ page, pageSize, q, view });
      return Response.json(payload);
    } catch (error) {
      console.warn("[crm-location-health] Core API read failed; using local fallback", error instanceof Error ? error.message : "unknown_error");
    }
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabaseAdmin
    .from("locations")
    .select("id,name,address,city,state,market,location_type,phone,website,google_website_uri,operating_hours,hours_backfill_status,main_image,image_url,images,google_place_id,latitude,longitude,primary_category,cuisine,cuisine_type,activity_type,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_discovery_status,search_keywords,semantic_tags,intent_tags,google_enriched_at,updated_at,is_searchable", { count: "exact" })
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (q) query = query.or(`name.ilike.%${q.replace(/[%_,]/g, " ")}%,city.ilike.%${q.replace(/[%_,]/g, " ")}%,address.ilike.%${q.replace(/[%_,]/g, " ")}%`);

  if (view === "refresh") {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    query = query.or(`google_enriched_at.is.null,google_enriched_at.lt.${cutoff}`);
  } else if (view === "repair") {
    query = query.or("google_place_id.is.null,latitude.is.null,longitude.is.null,is_searchable.eq.false");
  } else {
    query = query.or("google_place_id.is.null,phone.is.null,website.is.null,operating_hours.is.null,main_image.is.null,latitude.is.null,longitude.is.null");
  }

  const [locationsResult, duplicateResult, runsResult] = await Promise.all([
    query.range(start, end),
    supabaseAdmin.from("location_duplicate_review").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("location_enrichment_runs").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  if (locationsResult.error) return Response.json({ success: false, error: locationsResult.error.message }, { status: 500 });
  if (runsResult.error) return Response.json({ success: false, error: runsResult.error.message }, { status: 500 });

  const rows = (locationsResult.data || []).map((row: any) => {
    const issues = issuesFor(row);
    return { ...row, issues, healthScore: healthScore(issues.length) };
  });

  const crmRuns = (runsResult.data || []).filter(isCrmLocationHealthRun);
  const activeRun = crmRuns.find((run: any) => BLOCKING_RUN_STATUSES.has(String(run.status || ""))) || null;
  const latestRun = crmRuns[0] || null;
  const resultsRun = activeRun || latestRun;

  let reviewItems: Array<{
    locationId: string;
    name: string;
    reasons: string[];
    changedFields: string[];
    lastError: string | null;
  }> = [];
  let ownerUpdateCount = 0;

  if (resultsRun?.id && Number(resultsRun.review_records || 0) > 0) {
    const reviewResult = await supabaseAdmin
      .from("location_enrichment_run_items")
      .select("location_id,reasons,last_error,match_diagnostics")
      .eq("run_id", resultsRun.id)
      .eq("status", "review")
      .order("priority", { ascending: true })
      .limit(100);

    if (reviewResult.error) return Response.json({ success: false, error: reviewResult.error.message }, { status: 500 });

    const locationIds = Array.from(new Set((reviewResult.data || []).map((item: any) => text(item.location_id)).filter(Boolean)));
    const locations = new Map<string, any>();
    if (locationIds.length) {
      const nameResult = await supabaseAdmin
        .from("locations")
        .select("id,name,operating_hours,hours_backfill_status,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_discovery_status")
        .in("id", locationIds);
      if (nameResult.error) return Response.json({ success: false, error: nameResult.error.message }, { status: 500 });
      for (const location of nameResult.data || []) locations.set(String(location.id), location);
    }

    reviewItems = (reviewResult.data || []).flatMap((item: any) => {
      const locationId = text(item.location_id);
      const location = locations.get(locationId) || {};
      const rawReasons = Array.isArray(item.reasons) ? item.reasons.map(text).filter(Boolean) : [];
      const ownerMustSupplyReservation = rawReasons.includes("missing_reservation")
        && !hasReservationLink(location)
        && reservationDiscoveryExhausted(location);
      const ownerMustSupplyHours = rawReasons.includes("missing_hours")
        && (!location.operating_hours || (typeof location.operating_hours === "object" && Object.keys(location.operating_hours).length === 0))
        && hoursDiscoveryExhausted(location);
      let reasons = rawReasons;
      if (ownerMustSupplyReservation) reasons = reasons.filter((reason: string) => reason !== "missing_reservation");
      if (ownerMustSupplyHours) reasons = reasons.filter((reason: string) => reason !== "missing_hours");

      if (ownerMustSupplyReservation || ownerMustSupplyHours) ownerUpdateCount += 1;
      if (!reasons.length) return [];

      return [{
        locationId,
        name: text(location.name) || "Unnamed location",
        reasons,
        changedFields: Array.isArray(item.match_diagnostics?.changedFields) ? item.match_diagnostics.changedFields.map(text).filter(Boolean) : [],
        lastError: text(item.last_error) || null,
      }];
    });
  }

  const visibleActiveRun = activeRun ? { ...activeRun, review_records: reviewItems.length } : null;
  const visibleLatestRun = latestRun ? { ...latestRun, review_records: reviewItems.length } : null;

  return Response.json({
    success: true,
    rows,
    total: locationsResult.count || 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((locationsResult.count || 0) / pageSize)),
    duplicateCount: duplicateResult.count || 0,
    activeRun: visibleActiveRun,
    latestRun: visibleLatestRun,
    reviewItems,
    ownerUpdateCount,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const locationIds = Array.from(new Set(Array.isArray(body.locationIds) ? body.locationIds.map((id: unknown) => text(id)).filter(Boolean) : [])).slice(0, 50);
    if (!locationIds.length) return Response.json({ success: false, error: "Choose at least one location." }, { status: 400 });

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceRole) return Response.json({ success: false, error: "Location Health is not configured." }, { status: 500 });

    const response = await fetch(`${baseUrl}/functions/v1/location-health-runner`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({ locationIds, actorUserId: auth.adminUser?.user_id || null }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    return Response.json(payload, { status: response.status });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not start location repair." }, { status: 500 });
  }
}
