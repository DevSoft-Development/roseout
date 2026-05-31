import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function authorize() { if (process.env.NODE_ENV === "development") return null; const { error } = await requireAdminApiRole(["admin", "superadmin", "editor"]); return error; }
async function safeCount(table: string, filter?: (q: any) => any) { let q = supabaseAdmin.from(table).select("id", { count: "exact", head: true }); if (filter) q = filter(q); const { count, error } = await q; if (error) { console.warn(`summary count failed for ${table}`, error.message); return 0; } return count || 0; }
export async function GET() { const auth = await authorize(); if (auth) return auth; const [liveLocations, searchableLocations, needsReview, duplicates, staged, publishReady, possibleDuplicates, rejected, enrichmentQueued, missingClaimCodes, missingClaimQrs, missingPublicQrs] = await Promise.all([
  safeCount("locations"),
  safeCount("locations", (q) => q.eq("is_searchable", true)),
  safeCount("locations", (q) => q.in("quality_status", ["needs_review", "review"])),
  safeCount("locations", (q) => q.eq("duplicate_status", "duplicate")),
  safeCount("location_import_staging", (q) => q.eq("import_status", "staged")),
  safeCount("location_import_staging", (q) => q.eq("quality_status", "publish_ready").eq("duplicate_status", "unique").eq("import_status", "staged")),
  safeCount("location_import_staging", (q) => q.eq("duplicate_status", "possible_duplicate")),
  safeCount("location_import_staging", (q) => q.or("import_status.eq.rejected,quality_status.eq.reject,duplicate_status.eq.duplicate")),
  safeCount("locations", (q) => q.in("enrichment_status", ["queued", "not_started", "failed"]).gte("quality_score", 80)),
  safeCount("locations", (q) => q.eq("is_searchable", true).is("claim_code", null)),
  safeCount("locations", (q) => q.eq("is_searchable", true).or("claim_qr_url.is.null,claim_qr_code_url.is.null")),
  safeCount("locations", (q) => q.eq("is_searchable", true).or("qr_code_data_url.is.null,qr_code_url.is.null")),
]);
const { data: latestBatches } = await supabaseAdmin.from("location_import_batches").select("id,source,source_label,status,total_seen,total_staged,total_duplicates,total_possible_duplicates,total_rejected,total_publish_ready,total_published,started_at,completed_at").order("started_at", { ascending: false }).limit(10);
return NextResponse.json({ success: true, liveLocations, searchableLocations, needsReview, duplicates, staged, publishReady, possibleDuplicates, rejected, enrichmentQueued, missingClaimCodes, missingClaimQrs, missingPublicQrs, latestBatches: latestBatches || [] }); }
