import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildLocationSearchDocument } from "@/lib/location-profile-fields";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.settings);
  if (auth.error) return auth.error;
  const started = Date.now();
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "all" ? "all" : "missing_only";
  const limit = Math.min(Math.max(Number(body.limit || 250), 1), 500);
  const cursor = typeof body.nextCursor === "string" && body.nextCursor ? body.nextCursor : null;
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("locations").select("*").order("id", { ascending: true }).limit(limit);
  if (cursor) query = query.gt("id", cursor);
  if (mode === "missing_only") query = query.or("search_document.is.null,search_document.eq.");
  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  let updated = 0, skipped = 0, failed = 0; const errors: string[] = []; let lastProcessedId: string | null = null;
  for (const row of data || []) {
    lastProcessedId = String(row.id);
    const doc = buildLocationSearchDocument(row as Record<string, unknown>);
    if (mode === "missing_only" && String(row.search_document || "").trim()) { skipped++; continue; }
    const res = await supabase.from("locations").update({ search_document: doc, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (res.error) { failed++; if (errors.length < 5) errors.push(res.error.message); } else updated++;
  }
  let remaining_count: number | null = null;
  if (mode === "missing_only") {
    const countRes = await supabase.from("locations").select("id", { count: "exact", head: true }).or("search_document.is.null,search_document.eq.");
    remaining_count = countRes.count ?? null;
  }
  return NextResponse.json({ success: failed === 0, scanned: data?.length || 0, updated, skipped, failed, duration_ms: Date.now() - started, remaining_count, nextCursor: data && data.length === limit ? lastProcessedId : null, lastProcessedId, errors });
}
