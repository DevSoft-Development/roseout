import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { cronDefinition } from "@/lib/cron/controlPlane";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobKey: string }> }) {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;

  const { jobKey } = await params;
  const definition = cronDefinition(jobKey);
  if (!definition || !definition.manuallyRunnable) {
    return NextResponse.json({ success: false, error: "This cron job is not approved for manual execution." }, { status: 400 });
  }

  const { data: job, error } = await supabaseAdmin.from("cron_jobs").select("is_active").eq("job_key", jobKey).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (job?.is_active === false) {
    return NextResponse.json({ success: false, error: "Resume this cron job before running it manually." }, { status: 409 });
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET is not configured." }, { status: 500 });

  const target = new URL("/api/cron/managed", request.nextUrl.origin);
  target.searchParams.set("job", jobKey);
  target.searchParams.set("source", "manual");

  const response = await fetch(target, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}`, "x-cron-secret": secret },
    cache: "no-store",
  });
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { body: text.slice(0, 4000) };
  }

  return NextResponse.json({ success: response.ok, job_key: jobKey, result: payload }, { status: response.ok ? 200 : response.status });
}
