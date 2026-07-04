import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess, hasOwnerAccessToLocation, type OwnerAccess } from "./locationOwnerAccess";

export type SelectedLocationAccessInput = {
  userId: string;
  id?: unknown; locationId?: unknown; location_id?: unknown;
  canonicalId?: unknown; canonical_id?: unknown; canonicalLocationId?: unknown; canonical_location_id?: unknown;
  adminLocationId?: unknown; admin_location_id?: unknown; demoLocationId?: unknown; demo_location_id?: unknown;
  sourceId?: unknown; source_id?: unknown; sourceLocationId?: unknown; source_location_id?: unknown;
  type?: unknown; table?: unknown; demo?: unknown; fromDemoCenter?: unknown; adminLocationMode?: unknown;
};
export type SelectedLocationAccessResult =
  | { ok: true; userId: string; access: OwnerAccess; location: Record<string, any>; canonicalLocationId: string; sourceId: string | null; sourceLocationId: string | null; isAdmin: boolean; isSuperadmin: boolean; isDemoMode: boolean }
  | { ok: false; status: number; message: string };

function clean(value: unknown) { const text = String(value ?? "").trim(); return text || null; }
function truthy(value: unknown) { return value === true || value === "1" || value === "true" || value === 1; }
function sourceTableVariants(type?: unknown) {
  const t = String(type ?? "").toLowerCase();
  if (["activities", "activity"].includes(t)) return ["activities", "activity"];
  if (["restaurants", "restaurant"].includes(t)) return ["restaurants", "restaurant"];
  return ["restaurants", "restaurant", "activities", "activity", "locations"];
}
function collectIds(input: SelectedLocationAccessInput) {
  return Array.from(new Set([
    input.canonicalLocationId, input.canonical_location_id, input.canonicalId, input.canonical_id,
    input.adminLocationId, input.admin_location_id, input.demoLocationId, input.demo_location_id,
    input.locationId, input.location_id, input.id, input.sourceId, input.source_id, input.sourceLocationId, input.source_location_id,
  ].map(clean).filter(Boolean) as string[]));
}

async function findSelectedLocation(input: SelectedLocationAccessInput) {
  const ids = collectIds(input);
  if (!ids.length) return null;
  for (const id of ids) {
    const { data } = await supabaseAdmin.from("locations").select("*").or(`id.eq.${id},source_id.eq.${id},source_location_id.eq.${id}`).maybeSingle();
    if (data?.id) return data as Record<string, any>;
  }
  for (const table of sourceTableVariants(input.type ?? input.table)) {
    if (table === "locations") continue;
    for (const id of ids) {
      const { data: legacy } = await supabaseAdmin.from(table).select("id").eq("id", id).maybeSingle();
      if (!legacy?.id) continue;
      const { data } = await supabaseAdmin.from("locations").select("*").eq("source_table", table).eq("source_id", String(legacy.id)).maybeSingle();
      if (data?.id) return data as Record<string, any>;
    }
  }
  return null;
}

export async function resolveSelectedLocationAccess(input: SelectedLocationAccessInput): Promise<SelectedLocationAccessResult> {
  const userId = clean(input.userId);
  if (!userId) return { ok: false, status: 401, message: "Not signed in" };
  const access = await getLocationOwnerAccess(userId);
  const location = await findSelectedLocation(input);
  if (!location?.id) return { ok: false, status: 404, message: "Location not found." };
  if (!access.isAdmin && !hasOwnerAccessToLocation(access, location)) return { ok: false, status: 403, message: "You do not have access to this location." };
  return { ok: true, userId, access, location, canonicalLocationId: String(location.id), sourceId: clean(location.source_id), sourceLocationId: clean(location.source_location_id), isAdmin: access.isAdmin, isSuperadmin: access.isSuperadmin, isDemoMode: truthy(input.demo) || truthy(input.fromDemoCenter) };
}
