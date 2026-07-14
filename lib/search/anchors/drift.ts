import { normalizeAnchorText, normalizeAliasList } from "./normalize";
import { isEligibleApprovedAnchorLocation, locationDisplayName } from "./locationMapping";

export type AnchorIssueType = "duplicate_alias" | "ambiguous_canonical_name" | "duplicate_linked_location" | "linked_location_missing" | "coordinates_drifted" | "market_drifted" | "active_anchor_with_inactive_source_location" | "linked_anchor_missing_registry_row" | "name_drifted";
export type AnchorDriftIssue = { type: AnchorIssueType; anchorId?: string | null; locationId?: string | null; message: string; repair?: string | null; metadata?: Record<string, unknown> };

function distMeters(a: any, b: any) {
  const lat1 = Number(a.latitude), lon1 = Number(a.longitude), lat2 = Number(b.latitude), lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const R = 6371000, dLat = ((lat2-lat1)*Math.PI)/180, dLon = ((lon2-lon1)*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

export function detectAliasCollisions(anchors: any[]): AnchorDriftIssue[] {
  const claims = new Map<string, any[]>();
  for (const a of anchors.filter((x) => x.is_active && x.is_searchable)) {
    for (const alias of [a.canonical_name, ...(a.aliases || [])]) {
      const n = normalizeAnchorText(alias);
      if (!n) continue;
      claims.set(n, [...(claims.get(n) || []), a]);
    }
  }
  return [...claims.entries()].filter(([, rows]) => rows.length > 1).map(([alias, rows]) => ({ type: alias === normalizeAnchorText(rows[0].canonical_name) ? "ambiguous_canonical_name" : "duplicate_alias", message: `Multiple active anchors claim '${alias}'.`, repair: "Review aliases manually; do not auto-overwrite.", metadata: { alias, anchorIds: rows.map((r) => r.id) } }));
}

export async function auditLinkedAnchorDrift(supabase: any): Promise<{ issues: AnchorDriftIssue[] }> {
  const issues: AnchorDriftIssue[] = [];
  const { data: anchors } = await supabase.from("search_anchors").select("*").limit(2000);
  const anchorRows = Array.isArray(anchors) ? anchors : [];
  issues.push(...detectAliasCollisions(anchorRows));
  const byLocation = new Map<string, any[]>();
  for (const a of anchorRows.filter((x) => x.linked_location_id)) byLocation.set(String(a.linked_location_id), [...(byLocation.get(String(a.linked_location_id)) || []), a]);
  for (const [locationId, rows] of byLocation) if (rows.length > 1) issues.push({ type: "duplicate_linked_location", locationId, message: "Multiple anchors reference the same location.", repair: "Merge or disable duplicate anchors.", metadata: { anchorIds: rows.map((r) => r.id) } });
  for (const a of anchorRows.filter((x) => x.linked_location_id)) {
    const { data: loc } = await supabase.from("locations").select("*").eq("id", a.linked_location_id).maybeSingle();
    if (!loc) { issues.push({ type: "linked_location_missing", anchorId: a.id, locationId: a.linked_location_id, message: "Linked location is missing.", repair: "Disable or relink anchor." }); continue; }
    if (normalizeAnchorText(a.canonical_name) !== normalizeAnchorText(locationDisplayName(loc))) issues.push({ type: "name_drifted", anchorId: a.id, locationId: loc.id, message: "Anchor canonical name differs from linked location.", repair: "Resync canonical_name and preserve old name as generated alias." });
    if (distMeters(a, loc) > 75) issues.push({ type: "coordinates_drifted", anchorId: a.id, locationId: loc.id, message: "Anchor coordinates differ from linked location.", repair: "Resync coordinates from linked location." });
    if ((a.market || null) !== (loc.market || null)) issues.push({ type: "market_drifted", anchorId: a.id, locationId: loc.id, message: "Anchor market differs from linked location.", repair: "Review market and resync if safe." });
    if (a.is_active && !isEligibleApprovedAnchorLocation(loc)) issues.push({ type: "active_anchor_with_inactive_source_location", anchorId: a.id, locationId: loc.id, message: "Active anchor source location is no longer eligible.", repair: "Disable anchor until source location is restored." });
  }
  const { data: locations } = await supabase.from("locations").select("*").eq("is_searchable", true).not("is_hidden", "is", true).is("deleted_at", null).limit(2000);
  for (const loc of Array.isArray(locations) ? locations : []) if (isEligibleApprovedAnchorLocation(loc) && !byLocation.has(String(loc.id))) issues.push({ type: "linked_anchor_missing_registry_row", locationId: loc.id, message: "Eligible location is missing a linked search anchor.", repair: "Run approved location anchor sync." });
  return { issues };
}
