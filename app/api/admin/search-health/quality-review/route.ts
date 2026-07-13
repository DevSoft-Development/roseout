import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  const severity = request.nextUrl.searchParams.get("severity");
  const reviewStatus = request.nextUrl.searchParams.get("reviewStatus") ?? "unreviewed";
  let query = supabaseAdmin
    .from("search_events")
    .select("id,created_at,raw_query,normalized_query,search_type,primary_domain,result_count,technical_success,quality_success,quality_severity,quality_issue_type,quality_issue_label,suspicious_flags,quality_findings,quality_metrics,quality_review_status,quality_review_notes,metadata")
    .eq("quality_review_status", reviewStatus)
    .order("created_at", { ascending: false })
    .limit(100);
  if (severity && severity !== "all") query = query.eq("quality_severity", severity);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  const body = await request.json();
  const id = String(body?.id ?? "");
  const status = String(body?.status ?? "");
  if (!id || !["reviewed", "false_positive", "unreviewed"].includes(status)) {
    return NextResponse.json({ error: "Invalid review update." }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("search_events")
    .update({
      quality_review_status: status,
      quality_review_notes: typeof body?.notes === "string" ? body.notes.slice(0, 2000) : null,
      quality_reviewed_at: status === "unreviewed" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
