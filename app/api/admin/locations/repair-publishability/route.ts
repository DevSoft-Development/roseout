import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { repairAllPublishability } from "@/lib/location-growth/repairAllPublishability";
import {
  ACTIVE_MARKET_STATES,
  buildPublishabilityUpdate,
  evaluateLocationPublishability,
  type LocationPublishabilityInput,
} from "@/lib/location-publishability";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Body = {
  action?: "repair" | "approve" | "bulk_approve_ready";
  locationId?: string;
  locationIds?: string[];
  state?: "NY" | "NJ" | "CT";
  filters?: { state?: "NY" | "NJ" | "CT"; locationType?: "restaurant" | "activity"; city?: string; query?: string };
  dryRun?: boolean;
  limit?: number;
};

const MAX_LIMIT = 500;
const diff = (before: any, after: any) => Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(before?.[key]) !== JSON.stringify(value)));

async function loadRows(body: Body) {
  const ids = body.locationIds?.length ? body.locationIds.slice(0, MAX_LIMIT) : body.locationId ? [body.locationId] : null;
  let query = supabaseAdmin.from("locations").select("*").limit(Math.min(body.limit || 100, MAX_LIMIT));
  if (ids) query = query.in("id", ids);
  else {
    const state = body.filters?.state || body.state;
    query = state ? query.eq("state", state) : query.in("state", [...ACTIVE_MARKET_STATES]);
    if (body.filters?.locationType) query = query.eq("location_type", body.filters.locationType);
    if (body.filters?.city) query = query.ilike("city", `%${body.filters.city}%`);
    if (body.filters?.query) query = query.or(`name.ilike.%${body.filters.query}%,address.ilike.%${body.filters.query}%`);
    if (body.action !== "repair") query = query.eq("is_searchable", false);
  }
  const { data, error } = await query;
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
  if (!rows.length) return NextResponse.json({ success: false, message: "Location was not found." }, { status: 404 });

  if (action === "approve") {
    const row = rows[0] as LocationPublishabilityInput;
    const result = evaluateLocationPublishability(row, { allowApproval: true });
    if (!result.isReadyToApprove) return NextResponse.json({ success: false, message: `Location still needs: ${result.reasons.join(", ")}.`, reasons: result.reasons }, { status: 400 });
    const { update } = buildPublishabilityUpdate(row, { allowApproval: true });
    if (!dryRun) await supabaseAdmin.from("locations").update(update).eq("id", (row as any).id).throwOnError();
    return NextResponse.json({ success: true, dryRun, locationId: (row as any).id, after: update });
  }

  if (action === "bulk_approve_ready") {
    let approved = 0;
    let skipped = 0;
    const skippedSamples: any[] = [];
    for (const row of rows as any[]) {
      const result = evaluateLocationPublishability(row, { allowApproval: true });
      if (!result.isReadyToApprove) {
        skipped += 1;
        if (skippedSamples.length < 20) skippedSamples.push({ id: row.id, name: row.name, reasons: result.reasons });
        continue;
      }
      const { update } = buildPublishabilityUpdate(row, { allowApproval: true });
      approved += 1;
      if (!dryRun) await supabaseAdmin.from("locations").update(update).eq("id", row.id).throwOnError();
    }
    return NextResponse.json({ success: true, dryRun, scanned: rows.length, approved, skipped, skippedSamples });
  }

  let changed = 0;
  let madeSearchable = 0;
  const samples: any[] = [];

  for (const row of rows as any[]) {
    const repaired = await repairAllPublishability(row);
    const changes = diff(row, repaired.update);
    if (Object.keys(changes).length) {
      changed += 1;
      if (row.is_searchable !== true && repaired.update.is_searchable) madeSearchable += 1;
      if (!dryRun) await supabaseAdmin.from("locations").update(repaired.update).eq("id", row.id).throwOnError();
    }
    if (samples.length < 20) samples.push({
      id: row.id,
      name: row.name,
      changed: Object.keys(changes).length > 0,
      changes,
      repairedFields: repaired.repairedFields,
      reasons: repaired.result.reasons,
      reviewLabel: repaired.result.reviewLabel,
      after: repaired.update,
    });
  }

  const first = samples[0];
  const message = first?.reasons?.length
    ? `Repair completed. Still needs manual review: ${first.reasons.join(", ")}.`
    : first?.changed
      ? "All recoverable publishability issues were repaired successfully."
      : "No publishability changes were needed.";

  return NextResponse.json({ success: true, message, dryRun, scanned: rows.length, changed, madeSearchable, samples });
}
