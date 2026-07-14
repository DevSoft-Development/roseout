import { normalizeAnchorText, normalizeAliasList } from "./normalize";
import { inferAnchorTypeFromLocation, inferRadiusPolicyFromLocation, isEligibleApprovedAnchorLocation, locationDisplayName } from "./locationMapping";

export type AnchorSyncResult = { scanned: number; created: number; updated: number; unchanged: number; skipped: number; disabled: number; errors: Array<{ locationId: string; message: string }> };

type Mode = { mode?: "all" } | { mode: "location_ids"; locationIds: string[] } | { mode: "market"; market: string };

function metadataWithAlias(existing: any, previousName?: string, currentName?: string) {
  const metadata = existing?.metadata && typeof existing.metadata === "object" ? { ...existing.metadata } : {};
  const manual = normalizeAliasList(metadata.manual_aliases || existing?.aliases || []);
  const generated = normalizeAliasList(metadata.generated_aliases || []);
  if (previousName) {
    const prev = normalizeAnchorText(previousName);
    if (prev && prev !== normalizeAnchorText(currentName || "") && !generated.includes(prev)) generated.push(prev);
  }
  return { ...metadata, manual_aliases: manual, generated_aliases: generated, last_synced_at: new Date().toISOString() };
}

function aliasesFromMetadata(metadata: any, canonicalName: string) {
  const canonical = normalizeAnchorText(canonicalName);
  const seen = new Set<string>();
  return [...(metadata.manual_aliases || []), ...(metadata.generated_aliases || [])]
    .map((a) => String(a).trim())
    .filter((a) => {
      const n = normalizeAnchorText(a);
      if (!n || n === canonical || seen.has(n) || /^(restaurant|arcade|bar|activity|museum|lounge)$/i.test(a)) return false;
      seen.add(n);
      return true;
    });
}

export async function syncApprovedLocationsToSearchAnchors(supabase: any, options: Mode = { mode: "all" }): Promise<AnchorSyncResult> {
  const result: AnchorSyncResult = { scanned: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, disabled: 0, errors: [] };
  let query = supabase.from("locations").select("*").limit(1000);
  if ((options as any).mode === "location_ids") query = query.in("id", (options as any).locationIds);
  if ((options as any).mode === "market") query = query.eq("market", (options as any).market);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const locations = Array.isArray(data) ? data : [];
  result.scanned = locations.length;

  for (const location of locations) {
    const locationId = String(location.id);
    try {
      const { data: existingRows } = await supabase.from("search_anchors").select("*").eq("linked_location_id", location.id).limit(2);
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!isEligibleApprovedAnchorLocation(location)) {
        result.skipped++;
        if (
          existing &&
          (existing.is_active === true || existing.is_searchable === true || existing.review_status !== "disabled")
        ) {
          const { error: disableError } = await supabase
            .from("search_anchors")
            .update({
              is_active: false,
              is_searchable: false,
              review_status: "disabled",
              sync_status: "disabled_source",
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (disableError) throw new Error(disableError.message);
          result.disabled++;
        }
        continue;
      }
      const name = locationDisplayName(location);
      const anchorType = inferAnchorTypeFromLocation(location);
      const policy = inferRadiusPolicyFromLocation(location, anchorType);
      const metadata = metadataWithAlias(existing, existing && normalizeAnchorText(existing.canonical_name) !== normalizeAnchorText(name) ? existing.canonical_name : undefined, name);
      const manualOverride = new Set(existing?.manual_override_fields || existing?.metadata?.manual_override_fields || []);
      const row = { canonical_name: name, normalized_name: normalizeAnchorText(name), aliases: aliasesFromMetadata(metadata, name), anchor_type: anchorType, source_type: "linked_location", linked_location_id: location.id, city: location.city ?? null, state: location.state ?? null, borough: location.borough ?? null, neighborhood: location.neighborhood ?? null, county: location.county ?? null, market: location.market ?? null, latitude: Number(location.latitude), longitude: Number(location.longitude), default_radius_miles: manualOverride.has("radius") ? existing.default_radius_miles : policy.defaultRadiusMiles, max_radius_miles: manualOverride.has("radius") ? existing.max_radius_miles : policy.maxRadiusMiles, radius_strategy: manualOverride.has("radius") ? existing.radius_strategy : policy.radiusStrategy, is_active: true, is_searchable: true, review_status: "approved", sync_status: "current", last_synced_at: new Date().toISOString(), source_updated_at: location.updated_at ?? null, metadata };
      if (existing) {
        const changed = Object.entries(row).some(([k, v]) => JSON.stringify(existing[k]) !== JSON.stringify(v));
        if (changed) { await supabase.from("search_anchors").update(row).eq("id", existing.id); result.updated++; } else result.unchanged++;
      } else {
        await supabase.from("search_anchors").insert(row);
        result.created++;
      }
    } catch (e: any) { result.errors.push({ locationId, message: e?.message || String(e) }); }
  }
  return result;
}
