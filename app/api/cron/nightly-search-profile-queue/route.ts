import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!cronSecret || supplied !== `Bearer ${cronSecret}`) return unauthorized();

  // The queue operation is a database RPC. Run it directly from the private AWS
  // background runtime instead of bouncing through the legacy Supabase Edge
  // Function, whose separate CRON_SECRET can drift from the platform runtime.
  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin.rpc(
    "enqueue_nightly_location_search_profile_run",
    { p_limit: 1500 },
  );

  const durationMs = Date.now() - startedAt;
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, durationMs },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: data,
    durationMs,
    runtime: "aws-background",
    dispatch: "direct-database-rpc",
  });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
