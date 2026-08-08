import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { processLocationEnrichmentRun } from "@/lib/location-data-quality/enrichment-runner";
import { getLocationDataQualitySummary } from "@/lib/location-data-quality/summary";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RUN_STATUSES = ["planned", "queued", "running", "paused", "completed", "cancelled", "failed", "budget_stopped"];

function intValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function ensureGoogleEnrichmentKey() {
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim() && process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_PLACES_API_KEY.trim();
  }

  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new Error("Google enrichment is not configured. Set GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY in production.");
  }
}

async function addEvent(runId: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from("location_enrichment_run_events").insert({
    run_id: runId,
    event_type: eventType,
    message,
    metadata,
  });
}

export async function GET() {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  const { data: runs, error } = await supabaseAdmin
    .from("location_enrichment_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 });

  const activeRun = (runs || []).find((run) => ["planned", "queued", "running", "paused", "budget_stopped"].includes(run.status)) || null;
  let events: unknown[] = [];
  if (activeRun) {
    const eventResult = await supabaseAdmin
      .from("location_enrichment_run_events")
      .select("*")
      .eq("run_id", activeRun.id)
      .order("created_at", { ascending: false })
      .limit(20);
    events = eventResult.data || [];
  }

  return Response.json({ success: true, runs: runs || [], activeRun, events, statuses: RUN_STATUSES });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create");

  try {
    if (action === "create") {
      const mode = body.mode === "full_refresh" ? "full_refresh" : "repair";
      const staleDays = intValue(body.staleDays, 90, 1, 3650);
      const batchSize = intValue(body.batchSize, 5, 1, 25);
      const maxApiCalls = body.maxApiCalls === null || body.maxApiCalls === ""
        ? null
        : intValue(body.maxApiCalls, 10000, 1, 1000000);
      const beforeQuality = await getLocationDataQualitySummary(staleDays);

      const { data: run, error: insertError } = await supabaseAdmin
        .from("location_enrichment_runs")
        .insert({
          status: "planned",
          mode,
          stale_days: staleDays,
          batch_size: batchSize,
          max_api_calls: maxApiCalls,
          enable_food_probe: false,
          max_food_probes_per_row: 0,
          created_by: auth.adminUser?.user_id || null,
          before_quality: beforeQuality,
          settings: { createdFrom: "location-data-intelligence", googleAsEvidence: true, canonicalClassifier: "search-foundation-v3" },
        })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);

      const { data: prepared, error: prepareError } = await supabaseAdmin.rpc("prepare_location_enrichment_run", { p_run_id: run.id });
      if (prepareError) throw new Error(prepareError.message);
      return Response.json({ success: true, run: prepared || run });
    }

    const runId = String(body.runId || "").trim();
    if (!runId) return Response.json({ success: false, error: "runId is required." }, { status: 400 });

    if (action === "start" || action === "resume") {
      ensureGoogleEnrichmentKey();

      const { data: current, error: currentError } = await supabaseAdmin
        .from("location_enrichment_runs")
        .select("id,status,actual_api_calls,max_api_calls,started_at")
        .eq("id", runId)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) return Response.json({ success: false, error: "Enrichment run not found." }, { status: 404 });

      const requestedBudget = body.maxApiCalls === null || body.maxApiCalls === undefined || body.maxApiCalls === ""
        ? current.max_api_calls
        : intValue(body.maxApiCalls, current.max_api_calls || 10000, 1, 1000000);

      if (current.status === "budget_stopped" && requestedBudget !== null && requestedBudget <= current.actual_api_calls) {
        return Response.json({
          success: false,
          error: `Increase the API call budget above ${current.actual_api_calls.toLocaleString()} before resuming this run.`,
        }, { status: 400 });
      }

      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: "running",
        paused_at: null,
        completed_at: null,
        last_error: null,
        updated_at: now,
        max_api_calls: requestedBudget,
      };
      if (!current.started_at) update.started_at = now;

      const { data, error } = await supabaseAdmin
        .from("location_enrichment_runs")
        .update(update)
        .eq("id", runId)
        .in("status", action === "start" ? ["planned", "queued"] : ["paused", "budget_stopped"])
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return Response.json({ success: false, error: `Run cannot ${action} from its current status.` }, { status: 409 });
      await addEvent(runId, action, action === "start" ? "Catalog enrichment run started" : "Catalog enrichment run resumed", { maxApiCalls: requestedBudget });
      return Response.json({ success: true, run: data });
    }

    if (action === "pause") {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("location_enrichment_runs")
        .update({ status: "paused", paused_at: now, updated_at: now })
        .eq("id", runId)
        .eq("status", "running")
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("location_enrichment_run_items").update({ status: "pending", updated_at: now }).eq("run_id", runId).eq("status", "processing");
      await addEvent(runId, "paused", "Catalog enrichment run paused");
      return Response.json({ success: true, run: data });
    }

    if (action === "cancel") {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("location_enrichment_runs")
        .update({ status: "cancelled", completed_at: now, updated_at: now })
        .eq("id", runId)
        .in("status", ["planned", "queued", "running", "paused", "budget_stopped"])
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("location_enrichment_run_items").update({ status: "cancelled", completed_at: now, updated_at: now }).eq("run_id", runId).in("status", ["pending", "processing"]);
      await addEvent(runId, "cancelled", "Catalog enrichment run cancelled");
      return Response.json({ success: true, run: data });
    }

    if (action === "process") {
      ensureGoogleEnrichmentKey();
      const result = await processLocationEnrichmentRun(runId);
      return Response.json(result);
    }

    return Response.json({ success: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
