import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function count(status: string, minScore?: number) {
  let q = supabaseAdmin.from("location_duplicate_review").select("id", { count: "exact", head: true }).eq("status", status);
  if (minScore) q = q.gte("duplicate_score", minScore);
  const { count, error } = await q; if (error) throw new Error(error.message); return count || 0;
}
export async function GET() {
  const { error: auth } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth) return auth;
  try {
    const [pending, highConfidence, merged, ignored, notDuplicate, examples] = await Promise.all([
      count("pending"), count("pending", 95), count("merged"), count("ignored"), count("not_duplicate"),
      supabaseAdmin.from("location_duplicate_review").select("id,location_a_id,location_b_id,duplicate_score,match_reasons,status").eq("status", "pending").order("duplicate_score", { ascending: false }).limit(5),
    ]);
    const { count: bothSearchable } = await supabaseAdmin.from("location_duplicate_review").select("id", { count: "exact", head: true }).eq("status", "pending").contains("match_reasons", ["both_searchable"]);
    return NextResponse.json({ success: true, pending, highConfidence, bothSearchable: bothSearchable || 0, merged, ignored: ignored + notDuplicate, topExamples: examples.data || [] });
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
