import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALL_GAPS = [
  "missing_hours",
  "missing_photos",
  "missing_website",
  "missing_phone",
  "missing_category",
  "missing_reservation",
  "missing_coordinates",
  "missing_google_place_id",
  "weak_search_metadata",
  "stale_google_enrichment",
];

const BLOCKING_RUN_STATUSES = ["planned", "queued", "running"];
const CRM_BATCH_SIZE = 5;
const RESERVATION_DISCOVERY_EXHAUSTED = new Set(["not_found", "no_website"]);
const HOURS_DISCOVERY_EXHAUSTED = new Set(["website_no_hours"]);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isEmptyObject(value: unknown) {
  return !value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0);
}

function reservationDiscoveryExhausted(row: any) {
  return RESERVATION_DISCOVERY_EXHAUSTED.has(text(row.reservation_discovery_status).toLowerCase());
}

function hoursDiscoveryExhausted(row: any) {
  return HOURS_DISCOVERY_EXHAUSTED.has(text(row.hours_backfill_status).toLowerCase());
}

async function isPrivilegedSupabaseCredential(url: string, credential: string) {
  if (!credential) return false;
  try {
    const caller = createClient(url, credential, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${credential}` } },
    });
    const { error } = await caller.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

function reasonsFor(row: any, staleCutoff: number) {
  const reasons: string[] = [];
  if (!text(row.google_place_id)) reasons.push("missing_google_place_id");
  const missingHours = isEmptyObject(row.operating_hours) || (Array.isArray(row.operating_hours) && row.operating_hours.length === 0);
  if (missingHours && !hoursDiscoveryExhausted(row)) reasons.push("missing_hours");
  if (!text(row.main_image) && !text(row.image_url) && (!Array.isArray(row.images) || row.images.length === 0)) reasons.push("missing_photos");
  if (!text(row.website) && !text(row.google_website_uri)) reasons.push("missing_website");
  if (!text(row.phone)) reasons.push("missing_phone");
  const category = text(row.primary_category || row.cuisine || row.cuisine_type || row.activity_type);
  if (!category) reasons.push("missing_category");
  const missingReservation = !text(row.external_reservation_url || row.reservation_url || row.reservation_link || row.booking_url);
  if (missingReservation && !reservationDiscoveryExhausted(row)) reasons.push("missing_reservation");
  if (row.latitude == null || row.longitude == null) reasons.push("missing_coordinates");
  if (!Array.isArray(row.search_keywords) || !row.search_keywords.length || !Array.isArray(row.semantic_tags) || !row.semantic_tags.length || !Array.isArray(row.intent_tags) || !row.intent_tags.length) reasons.push("weak_search_metadata");
  const enrichedAt = row.google_enriched_at ? new Date(row.google_enriched_at).getTime() : 0;
  if (!enrichedAt || enrichedAt < staleCutoff) reasons.push("stale_google_enrichment");
  return reasons;
}

function priorityFor(reasons: string[]) {
  if (reasons.includes("missing_google_place_id")) return 10;
  if (reasons.includes("missing_coordinates")) return 20;
  if (reasons.includes("missing_category")) return 30;
  if (reasons.includes("missing_hours") || reasons.includes("missing_photos")) return 40;
  if (reasons.includes("missing_website") || reasons.includes("missing_phone") || reasons.includes("missing_reservation")) return 50;
  if (reasons.includes("weak_search_metadata")) return 60;
  return 70;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ success: false, error: "Missing Supabase environment" }, 500);

  const authorization = req.headers.get("authorization") || "";
  const callerCredential = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!(await isPrivilegedSupabaseCredential(url, callerCredential))) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const locationIds = Array.from(new Set(Array.isArray(body.locationIds) ? body.locationIds.map((id: unknown) => text(id)).filter(Boolean) : [])).slice(0, 50);
  if (!locationIds.length) return json({ success: false, error: "Choose at least one location." }, 400);

  const supabase = createClient(url, service, { auth: { persistSession: false } });

  const { data: recentRuns, error: recentError } = await supabase
    .from("location_enrichment_runs")
    .select("id,status,settings")
    .in("status", BLOCKING_RUN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentError) return json({ success: false, error: recentError.message }, 500);
  const active = (recentRuns || [])[0];
  if (active) return json({ success: false, error: "Another location repair is already running. Let it finish before starting another one.", activeRunId: active.id }, 409);

  const { data: locations, error: locationError } = await supabase
    .from("locations")
    .select("id,google_place_id,operating_hours,hours_backfill_status,main_image,image_url,images,website,google_website_uri,phone,primary_category,cuisine,cuisine_type,activity_type,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_discovery_status,latitude,longitude,search_keywords,semantic_tags,intent_tags,google_enriched_at")
    .in("id", locationIds);
  if (locationError) return json({ success: false, error: locationError.message }, 500);

  const staleCutoff = Date.now() - 90 * 86400000;
  const items = (locations || []).map((row: any) => ({
    location_id: row.id,
    reasons: reasonsFor(row, staleCutoff),
  })).filter((item: any) => item.reasons.length > 0);

  if (!items.length) return json({ success: true, message: "Those locations are already healthy or waiting on the location owner. No automatic repair was needed.", run: null });

  const now = new Date().toISOString();
  const estimatedCalls = items.reduce((total: number, item: any) => total + (item.reasons.includes("missing_google_place_id") ? 2 : 1) + (item.reasons.includes("missing_photos") ? 2 : 0), 0);
  const runBatchSize = Math.min(CRM_BATCH_SIZE, items.length);
  const { data: run, error: runError } = await supabase
    .from("location_enrichment_runs")
    .insert({
      status: "running",
      mode: "repair",
      source_table: "locations",
      stale_days: 90,
      batch_size: runBatchSize,
      max_api_calls: Math.max(100, estimatedCalls * 3),
      enable_food_probe: false,
      max_food_probes_per_row: 0,
      created_by: body.actorUserId || null,
      estimated_records: items.length,
      estimated_api_calls: estimatedCalls,
      started_at: now,
      settings: {
        createdFrom: "crm-location-health",
        googleAsEvidence: true,
        market: "all",
        sourceType: "both",
        gaps: ALL_GAPS,
        targetLimit: items.length,
        selectedLocationIds: locationIds,
        processingChunkSize: runBatchSize,
      },
    })
    .select("*")
    .single();
  if (runError) return json({ success: false, error: runError.message }, 500);

  const { error: itemError } = await supabase.from("location_enrichment_run_items").insert(
    items.map((item: any) => ({
      run_id: run.id,
      location_id: item.location_id,
      priority: priorityFor(item.reasons),
      reasons: item.reasons,
      status: "pending",
    })),
  );
  if (itemError) {
    await supabase.from("location_enrichment_runs").update({ status: "failed", last_error: itemError.message, completed_at: new Date().toISOString() }).eq("id", run.id);
    return json({ success: false, error: itemError.message }, 500);
  }

  await supabase.from("location_enrichment_run_events").insert({
    run_id: run.id,
    event_type: "started",
    message: "CRM Location Health repair started",
    metadata: { selectedCount: locationIds.length, repairCount: items.length, batchSize: runBatchSize },
  });

  return json({ success: true, run: { ...run, estimated_records: items.length, estimated_api_calls: estimatedCalls } });
});
