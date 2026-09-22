import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { enqueueLocationSearchProfileRefresh } from "@/lib/search/profile/profileRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RepairInput = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function clean(value: unknown, max: number) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : undefined;
}

function sameText(a: unknown, b: unknown) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId || "").trim();
  const repair = asObject(body.repair) as RepairInput;

  if (!itemId) {
    return Response.json({ success: false, error: "itemId is required." }, { status: 400 });
  }

  const requested = {
    name: clean(repair.name, 200),
    address: clean(repair.address, 300),
    city: clean(repair.city, 120),
    state: clean(repair.state, 30)?.toUpperCase(),
  };

  if (!Object.values(requested).some((value) => value !== undefined)) {
    return Response.json({ success: false, error: "Enter at least one corrected field." }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .select("id,location_id,status,match_diagnostics")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) return Response.json({ success: false, error: itemError.message }, { status: 500 });
  if (!item) return Response.json({ success: false, error: "No-match item not found." }, { status: 404 });
  if (item.status !== "no_match") {
    return Response.json({ success: false, error: "Only no-match items can be repaired here." }, { status: 409 });
  }

  const diagnostics = asObject(item.match_diagnostics);
  if (diagnostics.version !== "google-match-diagnostics-v2" || !diagnostics.disposition) {
    return Response.json({ success: false, error: "This item does not have v2 disposition diagnostics." }, { status: 409 });
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,source_table,source_id")
    .eq("id", item.location_id)
    .maybeSingle();

  if (locationError) return Response.json({ success: false, error: locationError.message }, { status: 500 });
  if (!location) return Response.json({ success: false, error: "Canonical location not found." }, { status: 404 });

  const now = new Date().toISOString();
  const before = {
    name: location.name || location.restaurant_name || location.activity_name || null,
    address: location.address || null,
    city: location.city || null,
    state: location.state || null,
  };
  const update: Record<string, unknown> = { updated_at: now };

  if (requested.name !== undefined && !sameText(requested.name, before.name)) {
    update.name = requested.name;
    if (sameText(location.restaurant_name, before.name)) update.restaurant_name = requested.name;
    if (sameText(location.activity_name, before.name)) update.activity_name = requested.name;
  }
  if (requested.address !== undefined && !sameText(requested.address, location.address)) update.address = requested.address;
  if (requested.city !== undefined && !sameText(requested.city, location.city)) update.city = requested.city;
  if (requested.state !== undefined && !sameText(requested.state, location.state)) update.state = requested.state;

  const changedFields = Object.keys(update).filter((key) => key !== "updated_at");
  if (!changedFields.length) {
    return Response.json({ success: false, error: "The corrected values match the current canonical record." }, { status: 409 });
  }

  const { data: updatedLocation, error: updateError } = await supabaseAdmin
    .from("locations")
    .update(update)
    .eq("id", location.id)
    .select("id,name,restaurant_name,activity_name,address,city,state,source_table,source_id")
    .single();

  if (updateError) return Response.json({ success: false, error: updateError.message }, { status: 500 });

  try {
    await enqueueLocationSearchProfileRefresh(location.id, "admin_no_match_source_repair");
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Location was repaired, but Search Foundation V3 refresh could not be queued.",
      repaired: true,
      location: updatedLocation,
    }, { status: 500 });
  }

  const nextDiagnostics = {
    ...diagnostics,
    review: {
      ...asObject(diagnostics.review),
      status: "reviewed",
      reviewedAt: now,
      reviewedBy: auth.adminUser?.user_id || null,
      repair: {
        repairedAt: now,
        repairedBy: auth.adminUser?.user_id || null,
        changedFields,
        before,
        after: {
          name: updatedLocation.name || updatedLocation.restaurant_name || updatedLocation.activity_name || null,
          address: updatedLocation.address || null,
          city: updatedLocation.city || null,
          state: updatedLocation.state || null,
        },
        sourceRelationship: location.source_table && location.source_id
          ? { sourceTable: location.source_table, sourceId: location.source_id }
          : null,
        googleRecheckRequired: true,
      },
    },
  };

  const { error: diagnosticsError } = await supabaseAdmin
    .from("location_enrichment_run_items")
    .update({ match_diagnostics: nextDiagnostics, updated_at: now })
    .eq("id", item.id)
    .eq("status", "no_match");

  if (diagnosticsError) {
    return Response.json({
      success: false,
      error: `Location was repaired and V3 refresh was queued, but review audit metadata could not be saved: ${diagnosticsError.message}`,
      repaired: true,
      location: updatedLocation,
    }, { status: 500 });
  }

  return Response.json({
    success: true,
    message: "Canonical source data repaired. Search Foundation V3 refresh was queued. Google recheck is still required before accepting a new Places match.",
    itemId: item.id,
    location: updatedLocation,
    changedFields,
    googleRecheckRequired: true,
  });
}
