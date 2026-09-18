import { normalizeAnchorText } from "./normalize";
import { inferAnchorTypeFromLocation, inferRadiusPolicyFromLocation, isEligibleApprovedAnchorLocation, locationDisplayName } from "./locationMapping";

type Scope = { mode?: "all" } | { mode: "market"; market: string } | { mode: "location_ids"; locationIds: string[] } | { mode: "missing_only" } | { mode: "existing_only" };

type PlannedAction = {
  locationId: string;
  locationName: string;
  market: string | null;
  anchorId: string | null;
  action: "create" | "update" | "disable" | "reactivate" | "conflict";
  reason: string;
  warnings: string[];
  changes: Record<string, { from: unknown; to: unknown }>;
};

const ANCHOR_LOOKUP_CHUNK_SIZE = 100;
const LOCATION_PAGE_SIZE = 1000;

function changedFields(existing: any, proposed: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(proposed)) {
    if (JSON.stringify(existing?.[key] ?? null) !== JSON.stringify(value ?? null)) changes[key] = { from: existing?.[key] ?? null, to: value ?? null };
  }
  return changes;
}

async function fetchLocationsInPages(supabase: any, scope: Scope) {
  const rows: any[] = [];

  for (let start = 0; ; start += LOCATION_PAGE_SIZE) {
    let query = supabase
      .from("locations")
      .select("*")
      .order("id", { ascending: true })
      .range(start, start + LOCATION_PAGE_SIZE - 1);

    if ((scope as any).mode === "market") query = query.eq("market", (scope as any).market);
    if ((scope as any).mode === "location_ids") query = query.in("id", (scope as any).locationIds);

    const { data, error } = await query;
    if (error) throw new Error(`Location preview page ${Math.floor(start / LOCATION_PAGE_SIZE) + 1} failed: ${error.message}`);

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < LOCATION_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchLinkedAnchorsInChunks(supabase: any, locationIds: string[]) {
  const rows: any[] = [];

  for (let start = 0; start < locationIds.length; start += ANCHOR_LOOKUP_CHUNK_SIZE) {
    const chunk = locationIds.slice(start, start + ANCHOR_LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("search_anchors")
      .select("*")
      .in("linked_location_id", chunk);

    if (error) {
      throw new Error(`Linked-anchor lookup failed for batch ${Math.floor(start / ANCHOR_LOOKUP_CHUNK_SIZE) + 1}: ${error.message}`);
    }

    if (Array.isArray(data)) rows.push(...data);
  }

  return rows;
}

export async function buildSearchAnchorSyncPreview(supabase: any, scope: Scope = { mode: "all" }) {
  const locations = await fetchLocationsInPages(supabase, scope);
  const ids = locations.map((row: any) => String(row.id));
  const anchorRows = ids.length ? await fetchLinkedAnchorsInChunks(supabase, ids) : [];

  const anchorsByLocation = new Map<string, any[]>();
  for (const anchor of anchorRows) {
    const key = String(anchor.linked_location_id);
    anchorsByLocation.set(key, [...(anchorsByLocation.get(key) ?? []), anchor]);
  }

  const actions: PlannedAction[] = [];
  let excludedIneligible = 0;
  let alreadyCurrent = 0;
  let noActionRequired = 0;

  for (const location of locations) {
    const linked = anchorsByLocation.get(String(location.id)) ?? [];
    const existing = linked[0] ?? null;
    const warnings: string[] = [];

    if ((scope as any).mode === "missing_only" && existing) continue;
    if ((scope as any).mode === "existing_only" && !existing) continue;

    if (linked.length > 1) {
      actions.push({ locationId: String(location.id), locationName: locationDisplayName(location), market: location.market ?? null, anchorId: existing?.id ?? null, action: "conflict", reason: "duplicate_linked_anchors", warnings: [`${linked.length} anchors point to this location`], changes: {} });
      continue;
    }

    const eligible = isEligibleApprovedAnchorLocation(location);
    if (!eligible) {
      if (!existing) {
        excludedIneligible += 1;
        continue;
      }

      if (existing.is_active || existing.is_searchable) {
        actions.push({ locationId: String(location.id), locationName: locationDisplayName(location), market: location.market ?? null, anchorId: existing.id, action: "disable", reason: "location_not_eligible", warnings, changes: { is_active: { from: existing.is_active, to: false }, is_searchable: { from: existing.is_searchable, to: false } } });
      } else {
        noActionRequired += 1;
      }
      continue;
    }

    const name = locationDisplayName(location);
    const anchorType = inferAnchorTypeFromLocation(location);
    const policy = inferRadiusPolicyFromLocation(location, anchorType);
    const proposed = {
      canonical_name: name,
      normalized_name: normalizeAnchorText(name),
      anchor_type: anchorType,
      source_type: "linked_location",
      linked_location_id: location.id,
      city: location.city ?? null,
      state: location.state ?? null,
      borough: location.borough ?? null,
      neighborhood: location.neighborhood ?? null,
      county: location.county ?? null,
      market: location.market ?? null,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      default_radius_miles: policy.defaultRadiusMiles,
      max_radius_miles: policy.maxRadiusMiles,
      radius_strategy: policy.radiusStrategy,
      is_active: true,
      is_searchable: true,
      review_status: "approved",
    };

    const manualOverrides = new Set(existing?.manual_override_fields || existing?.metadata?.manual_override_fields || []);
    if (manualOverrides.size) warnings.push(`Protected manual overrides: ${[...manualOverrides].join(", ")}`);
    const changes = changedFields(existing, proposed);

    if (!existing) {
      actions.push({ locationId: String(location.id), locationName: name, market: location.market ?? null, anchorId: null, action: "create", reason: "missing_anchor", warnings, changes });
      continue;
    }

    if (!Object.keys(changes).length) {
      alreadyCurrent += 1;
      continue;
    }

    const action = existing.is_active === false ? "reactivate" : "update";
    const reason = action === "reactivate" ? "eligible_again" : "linked_fields_changed";
    actions.push({ locationId: String(location.id), locationName: name, market: location.market ?? null, anchorId: existing.id, action, reason, warnings, changes });
  }

  const summary = actions.reduce((acc: any, item) => {
    const key = `would${item.action.charAt(0).toUpperCase()}${item.action.slice(1)}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, { scanned: locations.length, excludedIneligible, alreadyCurrent, noActionRequired, dryRun: true });

  return { success: true, dryRun: true, generatedAt: new Date().toISOString(), scope, summary, actions };
}
