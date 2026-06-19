import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ACTIVE_MARKET_STATES, buildPublishabilityUpdate, evaluateLocationPublishability, type LocationPublishabilityInput } from "@/lib/location-publishability";

export const dynamic = "force-dynamic";

type Body = { action?: "repair" | "approve" | "bulk_approve_ready"; locationId?: string; locationIds?: string[]; state?: "NY"|"NJ"|"CT"; filters?: { state?: "NY"|"NJ"|"CT"; locationType?: "restaurant"|"activity"; city?: string; reason?: string; query?: string }; dryRun?: boolean; limit?: number };
const SELECT = "id,name,state,status,data_status,quality_status,source_quality_status,import_confidence,public_visibility_tier,duplicate_status,is_searchable,is_hidden,is_low_level,has_photos,photo_status,main_image,image_url,images,address,city,latitude,longitude,location_type";
const MAX_LIMIT = 500;
function diff(before:any, after:any){ return Object.fromEntries(Object.entries(after).filter(([k,v]) => JSON.stringify(before?.[k]) !== JSON.stringify(v))); }
async function loadRows(body: Body) {
  const ids = body.locationIds?.length ? body.locationIds.slice(0, MAX_LIMIT) : body.locationId ? [body.locationId] : null;
  let q = supabaseAdmin.from("locations").select(SELECT).limit(Math.min(body.limit || 100, MAX_LIMIT));
  if (ids) q = q.in("id", ids);
  else {
    const state = body.filters?.state || body.state;
    if (state) q = q.eq("state", state); else q = q.in("state", [...ACTIVE_MARKET_STATES]);
    if (body.filters?.locationType) q = q.eq("location_type", body.filters.locationType);
    if (body.filters?.city) q = q.ilike("city", `%${body.filters.city}%`);
    if (body.filters?.query) q = q.or(`name.ilike.%${body.filters.query}%,address.ilike.%${body.filters.query}%`);
    if (body.action !== "repair") q = q.eq("is_searchable", false);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = body.action || "repair";
  const dryRun = body.dryRun === true;
  const rows = await loadRows(body);
  if (action === "approve" && rows[0]) {
    const row = rows[0] as LocationPublishabilityInput;
    const result = evaluateLocationPublishability(row, { allowApproval: true });
    if (!result.isReadyToApprove) return NextResponse.json({ success:false, message:"Location is not eligible for approval.", reasons: result.reasons }, { status: 400 });
    const { update } = buildPublishabilityUpdate(row, { allowApproval: true });
    if (!dryRun) await supabaseAdmin.from("locations").update(update).eq("id", (row as any).id).throwOnError();
    return NextResponse.json({ success:true, dryRun, locationId:(row as any).id, after:update });
  }
  if (action === "bulk_approve_ready") {
    let approved=0, skipped=0; const skippedSamples:any[]=[];
    for (const row of rows as any[]) {
      const result = evaluateLocationPublishability(row, { allowApproval: true });
      if (!result.isReadyToApprove) { skipped++; if (skippedSamples.length < 20) skippedSamples.push({ id:row.id, name:row.name, reasons:result.reasons }); continue; }
      const { update } = buildPublishabilityUpdate(row, { allowApproval: true });
      approved++; if (!dryRun) await supabaseAdmin.from("locations").update(update).eq("id", row.id).throwOnError();
    }
    return NextResponse.json({ success:true, dryRun, scanned:rows.length, approved, skipped, skippedSamples });
  }
  let changed=0, madeSearchable=0, madeUnsearchable=0, imageArraysBackfilled=0; const samples:any[]=[];
  for (const row of rows as any[]) {
    const { result, update } = buildPublishabilityUpdate(row, { allowApproval: false });
    const changes = diff(row, update);
    if (!Object.keys(changes).length) continue;
    changed++;
    if (row.is_searchable !== true && update.is_searchable) madeSearchable++;
    if (row.is_searchable === true && !update.is_searchable) madeUnsearchable++;
    if ((!row.images || row.images.length === 0) && update.images?.length) imageArraysBackfilled++;
    if (samples.length < 20) samples.push({ id:row.id, name:row.name, state:row.state, before:row, after:update, reasons:result.reasons });
    if (!dryRun) await supabaseAdmin.from("locations").update(update).eq("id", row.id).throwOnError();
  }
  return NextResponse.json({ success:true, dryRun, scanned:rows.length, changed, madeSearchable, madeUnsearchable, imageArraysBackfilled, samples });
}
