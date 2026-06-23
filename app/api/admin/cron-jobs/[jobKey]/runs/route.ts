import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobKey: string }> }) {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;
  const { jobKey } = await params;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 25), 1), 50);
  const { data, error } = await supabaseAdmin.from("cron_job_runs").select("*").eq("job_key", jobKey).order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, runs: data || [] });
}
