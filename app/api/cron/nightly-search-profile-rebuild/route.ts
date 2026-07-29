import { createProfileRun } from "@/lib/search/profile/profileRunRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 1_000;
const MAX_LIMIT = 5_000;
const MODE = "nightly_search_profile_rebuild";

function configuredLimit() {
  const parsed = Number(process.env.NIGHTLY_SEARCH_PROFILE_REBUILD_LIMIT ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

async function runNightlyRebuild(request: Request) {
  const supplied = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || supplied !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await supabaseAdmin
    .from("location_search_profile_runs")
    .select("id,status,created_at,target_count,processed_count")
    .eq("mode", MODE)
    .in("status", ["pending", "running", "cancelling"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active.error) {
    return NextResponse.json({ error: `Active nightly run lookup failed: ${active.error.message}` }, { status: 500 });
  }

  if (active.data) {
    return NextResponse.json({ ok: true, skipped: true, reason: "active_run_exists", run: active.data });
  }

  const limit = configuredLimit();
  const profiles = await supabaseAdmin
    .from("location_search_profiles")
    .select("location_id,confidence,generated_at,review_reasons")
    .eq("needs_review", true)
    .order("confidence", { ascending: true })
    .order("generated_at", { ascending: true })
    .limit(limit);

  if (profiles.error) {
    return NextResponse.json({ error: `Nightly profile target lookup failed: ${profiles.error.message}` }, { status: 500 });
  }

  const locationIds = [...new Set((profiles.data ?? []).map((profile) => profile.location_id).filter(Boolean))];
  if (!locationIds.length) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_profiles_need_review", targetCount: 0 });
  }

  const run = await createProfileRun({
    mode: MODE,
    filters: {
      needsReview: true,
      order: ["confidence_ascending", "generated_at_ascending"],
    },
    configuration: {
      source: "vercel_cron",
      nightly: true,
      requestedLimit: limit,
      workerBatchSize: 50,
      createdAt: new Date().toISOString(),
    },
    requestedBy: "",
    locationIds,
  });

  return NextResponse.json({ ok: true, skipped: false, targetCount: locationIds.length, run });
}

export async function GET(request: Request) {
  try {
    return await runNightlyRebuild(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nightly search profile rebuild failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
