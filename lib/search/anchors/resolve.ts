import { inferAnchorTypeFromLocation, inferRadiusPolicyFromLocation, isEligibleApprovedAnchorLocation, locationDisplayName } from "./locationMapping";
import { normalizeAnchorText, normalizeAliasList } from "./normalize";
import type { AnchorResolution, AnchorResolutionSource, ResolvedAnchor, SearchAnchor } from "./types";

function rowImage(row: any) { return row.image_url || row.photo_url || row.cover_photo_url || row.hero_image_url || row.primary_photo_url || null; }
function rowAddress(row: any) { return row.address || row.formatted_address || row.full_address || row.street_address || null; }

function toResolvedAnchor(row: any, source: Exclude<AnchorResolutionSource, "none">, confidence = 1, aliasMatched: string | null = null): ResolvedAnchor {
  const defaultRadius = Number(row.default_radius_miles ?? row.defaultRadiusMiles ?? 1.5);
  const maxRadius = Number(row.max_radius_miles ?? row.maxRadiusMiles ?? 3);
  const canonical = row.canonical_name || locationDisplayName(row);
  return { ...row, id: row.id, registryId: row.registryId ?? (row.source_type === "linked_location" || row.source_type === "curated" ? row.id : null), linkedLocationId: row.linked_location_id ?? row.linkedLocationId ?? null, name: canonical, canonical_name: canonical, canonicalName: canonical, normalized_name: row.normalized_name || normalizeAnchorText(canonical), normalizedName: row.normalized_name || normalizeAnchorText(canonical), aliases: Array.isArray(row.aliases) ? row.aliases : [], anchor_type: row.anchor_type, anchorType: row.anchor_type, source_type: row.source_type || "linked_location", sourceType: row.source_type || "linked_location", resolutionSource: source, aliasMatched, latitude: Number(row.latitude), longitude: Number(row.longitude), address: rowAddress(row), city: row.city ?? null, state: row.state ?? null, borough: row.borough ?? null, neighborhood: row.neighborhood ?? null, county: row.county ?? null, market: row.market ?? null, default_radius_miles: defaultRadius, defaultRadiusMiles: defaultRadius, max_radius_miles: maxRadius, maxRadiusMiles: maxRadius, radius_strategy: row.radius_strategy || row.radiusStrategy || "dense_urban", radiusStrategy: row.radius_strategy || row.radiusStrategy || "dense_urban", confidence, imageUrl: rowImage(row), image_url: rowImage(row), profileUrl: row.profile_url || row.public_url || null, profile_url: row.profile_url || row.public_url || null, syncStatus: row.sync_status || (source === "location_exact" || source === "location_fuzzy" ? "missing_registry_anchor" : "current") };
}

function similarity(a: string, b: string) { if (a === b) return 1; if (!a || !b) return 0; if (a.includes(b) || b.includes(a)) return 0.86; const aa = new Set(a.split(" ")); const bb = new Set(b.split(" ")); return [...aa].filter((x) => bb.has(x)).length / Math.max(aa.size, bb.size); }
function exactAlias(row: any, normalized: string) { return (row.aliases || []).find((a: string) => normalizeAnchorText(a) === normalized) || null; }

async function exactLocations(supabase: any, rawName: string, normalized: string) {
  const token = rawName.replace(/[%_,]/g, " ").trim();
  const { data } = await supabase.from("locations").select("*").or(`name.ilike.${token},restaurant_name.ilike.${token},activity_name.ilike.${token}`).limit(25);
  return (Array.isArray(data) ? data : []).filter(isEligibleApprovedAnchorLocation).map((l: any) => {
    const anchorType = inferAnchorTypeFromLocation(l); const policy = inferRadiusPolicyFromLocation(l, anchorType);
    return toResolvedAnchor({ ...l, canonical_name: locationDisplayName(l), normalized_name: normalizeAnchorText(locationDisplayName(l)), anchor_type: anchorType, source_type: "linked_location", linked_location_id: l.id, default_radius_miles: policy.defaultRadiusMiles, max_radius_miles: policy.maxRadiusMiles, radius_strategy: policy.radiusStrategy, registryId: null }, normalizeAnchorText(locationDisplayName(l)) === normalized ? "location_exact" : "location_fuzzy", similarity(normalizeAnchorText(locationDisplayName(l)), normalized));
  });
}

export async function resolveSearchAnchor(supabase: any, rawName: string, areaHint?: string | null): Promise<AnchorResolution> {
  const started = performance.now();
  const normalized = normalizeAnchorText(rawName);
  const finish = (patch: Omit<AnchorResolution, "resolutionMs">): AnchorResolution => ({ ...patch, resolutionMs: Math.round(performance.now() - started) });
  const { data: registry } = await supabase.from("search_anchors").select("*").eq("is_active", true).eq("is_searchable", true).eq("review_status", "approved").or(`normalized_name.eq.${normalized},aliases.cs.{"${rawName.replace(/"/g, "")}"}`).limit(25);
  const rows = Array.isArray(registry) ? registry : [];
  let exact = rows.filter((r) => r.normalized_name === normalized).map((r) => toResolvedAnchor(r, "registry_exact", 1));
  if (exact.length) return finish({ status: "resolved", anchor: exact[0], candidates: exact, source: "registry_exact", confidence: 1 });
  let aliases = rows.map((r) => ({ r, alias: exactAlias(r, normalized) })).filter((x) => x.alias).map((x) => toResolvedAnchor(x.r, "registry_alias", 1, x.alias));
  if (aliases.length) return finish({ status: "resolved", anchor: aliases[0], candidates: aliases, source: "registry_alias", confidence: 1 });
  const linkedExact = rows.filter((r) => r.linked_location_id && normalizeAnchorText(r.canonical_name) === normalized).map((r) => toResolvedAnchor(r, "linked_location", 1));
  if (linkedExact.length) return finish({ status: "resolved", anchor: linkedExact[0], candidates: linkedExact, source: "linked_location", confidence: 1 });

  const locExact = (await exactLocations(supabase, rawName, normalized)).filter((r) => r.resolutionSource === "location_exact");
  if (locExact.length) return finish({ status: "resolved", anchor: locExact[0], candidates: locExact, source: "location_exact", confidence: 1 });

  const token = rawName.replace(/[%_,]/g, " ").trim();
  const { data: fuzzy } = await supabase.from("search_anchors").select("*").eq("is_active", true).eq("is_searchable", true).eq("review_status", "approved").ilike("canonical_name", `%${token}%`).limit(25);
  let candidates = (Array.isArray(fuzzy) ? fuzzy : []).map((row: any) => { const aliasScores = normalizeAliasList(row.aliases).map((a) => similarity(a, normalized)); const score = Math.max(similarity(row.normalized_name, normalized), ...aliasScores, 0); return toResolvedAnchor(row, "registry_fuzzy", score); }).filter((row: any) => Number(row.confidence) >= 0.82).sort((a: any, b: any) => Number(b.confidence) - Number(a.confidence));
  let source: AnchorResolutionSource = candidates.length ? "registry_fuzzy" : "none";
  if (!candidates.length) { candidates = (await exactLocations(supabase, rawName, normalized)).filter((r) => r.confidence >= 0.82).sort((a, b) => b.confidence - a.confidence); source = candidates.length ? "location_fuzzy" : "none"; }
  if (!candidates.length) return finish({ status: "not_found", anchor: null, candidates: [], source: "none", confidence: null });
  const top = candidates[0]; const confidence = Number(top.confidence ?? 0.82);
  if (candidates.length > 1 && confidence - Number(candidates[1].confidence ?? 0.8) < 0.08) return finish({ status: "ambiguous", anchor: null, candidates: candidates.slice(0, 5), source, confidence });
  if (!Number.isFinite(Number(top.latitude)) || !Number.isFinite(Number(top.longitude))) return finish({ status: "missing_coordinates", anchor: top, candidates: [top], source, confidence });
  return finish({ status: "resolved", anchor: top, candidates: candidates.slice(0, 5), source, confidence });
}

export async function recordAnchorDiscovery(supabase: any, args: { rawQuery: string; rawAnchorText: string; areaHint?: string | null; requestedDomain: "restaurant" | "activity" }) {
  const normalized = normalizeAnchorText(args.rawAnchorText);
  await supabase.from("search_anchor_discoveries").upsert({ raw_query: args.rawQuery, raw_anchor_text: args.rawAnchorText, normalized_anchor_text: normalized, area_hint: args.areaHint ?? null, requested_domain: args.requestedDomain, last_seen_at: new Date().toISOString() }, { onConflict: "normalized_anchor_text,area_hint,requested_domain" }).select("id").maybeSingle().catch?.(() => null);
}
