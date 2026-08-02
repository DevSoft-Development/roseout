import {
  inferAnchorTypeFromLocation,
  inferRadiusPolicyFromLocation,
  isEligibleApprovedAnchorLocation,
  locationDisplayName,
} from "./locationMapping";
import { normalizeAliasList, normalizeAnchorText } from "./normalize";
import {
  anchorCandidateSummary,
  classifyAnchorIntent,
  matchesAnchorArea,
} from "./intent";
import type {
  AnchorResolution,
  AnchorResolutionSource,
  ResolvedAnchor,
} from "./types";

function rowImage(row: any) {
  return (
    row.image_url ||
    row.photo_url ||
    row.cover_photo_url ||
    row.hero_image_url ||
    row.primary_photo_url ||
    null
  );
}

function rowAddress(row: any) {
  return (
    row.address ||
    row.formatted_address ||
    row.full_address ||
    row.street_address ||
    null
  );
}

function toResolvedAnchor(
  row: any,
  source: Exclude<AnchorResolutionSource, "none">,
  confidence = 1,
  aliasMatched: string | null = null,
): ResolvedAnchor {
  const defaultRadius = Number(
    row.default_radius_miles ?? row.defaultRadiusMiles ?? 1.5,
  );
  const maxRadius = Number(row.max_radius_miles ?? row.maxRadiusMiles ?? 3);
  const canonical = row.canonical_name || locationDisplayName(row);
  const linkedLocationId =
    row.linked_location_id ?? row.linkedLocationId ??
    (row.source_type === "linked_location" ? row.id : null);

  return {
    ...row,
    id: linkedLocationId ?? row.id,
    registryId:
      row.registryId ??
      (row.source_type === "linked_location" || row.source_type === "curated"
        ? row.id
        : null),
    linkedLocationId,
    name: canonical,
    canonical_name: canonical,
    canonicalName: canonical,
    normalized_name: row.normalized_name || normalizeAnchorText(canonical),
    normalizedName: row.normalized_name || normalizeAnchorText(canonical),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    anchor_type: row.anchor_type,
    anchorType: row.anchor_type,
    source_type: row.source_type || "linked_location",
    sourceType: row.source_type || "linked_location",
    resolutionSource: source,
    aliasMatched,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: rowAddress(row),
    city: row.city ?? null,
    state: row.state ?? null,
    borough: row.borough ?? null,
    neighborhood: row.neighborhood ?? null,
    county: row.county ?? null,
    market: row.market ?? null,
    default_radius_miles: defaultRadius,
    defaultRadiusMiles: defaultRadius,
    max_radius_miles: maxRadius,
    maxRadiusMiles: maxRadius,
    radius_strategy: row.radius_strategy || row.radiusStrategy || "dense_urban",
    radiusStrategy: row.radius_strategy || row.radiusStrategy || "dense_urban",
    confidence,
    imageUrl: rowImage(row),
    image_url: rowImage(row),
    profileUrl: row.profile_url || row.public_url || null,
    profile_url: row.profile_url || row.public_url || null,
    syncStatus:
      row.sync_status ||
      (source === "location_exact" || source === "location_fuzzy"
        ? "missing_registry_anchor"
        : "current"),
  };
}

function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  return [...aa].filter((token) => bb.has(token)).length / Math.max(aa.size, bb.size);
}

function exactAlias(row: any, normalized: string) {
  return (
    (row.aliases || []).find(
      (alias: string) => normalizeAnchorText(alias) === normalized,
    ) || null
  );
}

async function queryLocations(
  supabase: any,
  rawName: string,
  normalized: string,
  generic: boolean,
) {
  const token = rawName.replace(/[%_,]/g, " ").trim();
  const operator = generic
    ? `name.ilike.%${token}%,restaurant_name.ilike.%${token}%,activity_name.ilike.%${token}%,primary_category.ilike.%${token}%,activity_type.ilike.%${token}%`
    : `name.ilike.${token},restaurant_name.ilike.${token},activity_name.ilike.${token}`;
  const { data } = await supabase
    .from("locations")
    .select("*")
    .or(operator)
    .limit(50);

  return (Array.isArray(data) ? data : [])
    .filter(isEligibleApprovedAnchorLocation)
    .map((location: any) => {
      const anchorType = inferAnchorTypeFromLocation(location);
      const policy = inferRadiusPolicyFromLocation(location, anchorType);
      const canonical = locationDisplayName(location);
      const canonicalNormalized = normalizeAnchorText(canonical);
      const confidence = generic
        ? Math.max(
            similarity(canonicalNormalized, normalized),
            similarity(normalizeAnchorText(location.primary_category || ""), normalized),
            similarity(normalizeAnchorText(location.activity_type || ""), normalized),
          )
        : similarity(canonicalNormalized, normalized);

      return toResolvedAnchor(
        {
          ...location,
          canonical_name: canonical,
          normalized_name: canonicalNormalized,
          anchor_type: anchorType,
          source_type: "linked_location",
          linked_location_id: location.id,
          default_radius_miles: policy.defaultRadiusMiles,
          max_radius_miles: policy.maxRadiusMiles,
          radius_strategy: policy.radiusStrategy,
          registryId: null,
        },
        canonicalNormalized === normalized ? "location_exact" : "location_fuzzy",
        confidence,
      );
    });
}

function areaFilter<T extends ResolvedAnchor>(rows: T[], areaHint?: string | null) {
  if (!areaHint) return { matches: rows, rejected: [] as T[] };
  return {
    matches: rows.filter((row) => matchesAnchorArea(row, areaHint)),
    rejected: rows.filter((row) => !matchesAnchorArea(row, areaHint)),
  };
}

function withDiagnostics<T extends AnchorResolution>(
  result: T,
  diagnostics: Record<string, unknown>,
): T {
  return Object.assign(result, { diagnostics });
}

export async function resolveSearchAnchor(
  supabase: any,
  rawName: string,
  areaHint?: string | null,
): Promise<AnchorResolution> {
  const started = performance.now();
  const normalized = normalizeAnchorText(rawName);
  const intentKind = classifyAnchorIntent(rawName);
  const diagnostics: Record<string, unknown> = {
    anchorIntentKind: intentKind,
    rawAnchorText: rawName,
    normalizedAnchorText: normalized,
    areaHint: areaHint ?? null,
    candidateCount: 0,
    areaRejectedCount: 0,
    candidates: [],
  };
  const finish = (
    patch: Omit<AnchorResolution, "resolutionMs">,
  ): AnchorResolution =>
    withDiagnostics(
      {
        ...patch,
        resolutionMs: Math.round(performance.now() - started),
      } as AnchorResolution,
      diagnostics,
    );

  const { data: registry } = await supabase
    .from("search_anchors")
    .select("*")
    .eq("is_active", true)
    .eq("is_searchable", true)
    .eq("review_status", "approved")
    .limit(500);
  const rows = Array.isArray(registry) ? registry : [];

  if (intentKind === "generic") {
    const genericLocations = (await queryLocations(supabase, rawName, normalized, true))
      .filter((row) => Number(row.confidence) >= 0.5)
      .sort((a, b) => Number(b.confidence) - Number(a.confidence));
    const { matches, rejected } = areaFilter(genericLocations, areaHint);
    diagnostics.candidateCount = genericLocations.length;
    diagnostics.areaRejectedCount = rejected.length;
    diagnostics.candidates = genericLocations.slice(0, 10).map(anchorCandidateSummary);

    if (matches.length === 1 && areaHint) {
      const only = matches[0];
      if (!only.linkedLocationId && !only.id) {
        return finish({ status: "not_found", anchor: null, candidates: [], source: "none", confidence: null });
      }
      return finish({
        status: "resolved",
        anchor: only,
        candidates: matches,
        source: "location_fuzzy",
        confidence: Number(only.confidence ?? 0.82),
      });
    }

    return finish({
      status: matches.length || genericLocations.length ? "ambiguous" : "not_found",
      anchor: null,
      candidates: (matches.length ? matches : genericLocations).slice(0, 5),
      source: matches.length || genericLocations.length ? "location_fuzzy" : "none",
      confidence: matches.length
        ? Number(matches[0].confidence ?? 0.82)
        : genericLocations.length
          ? Number(genericLocations[0].confidence ?? 0.82)
          : null,
    });
  }

  const exactRegistry = rows
    .filter((row) => normalizeAnchorText(row.normalized_name || row.canonical_name) === normalized)
    .map((row) => toResolvedAnchor(row, "registry_exact", 1));
  const aliasRegistry = rows
    .map((row) => ({ row, alias: exactAlias(row, normalized) }))
    .filter((candidate) => candidate.alias)
    .map((candidate) => toResolvedAnchor(candidate.row, "registry_alias", 1, candidate.alias));
  const locationMatches = await queryLocations(supabase, rawName, normalized, false);
  let candidates = [...exactRegistry, ...aliasRegistry, ...locationMatches]
    .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
    .sort((a, b) => Number(b.confidence) - Number(a.confidence));

  if (!candidates.length) {
    candidates = rows
      .map((row: any) => {
        const aliasScores = normalizeAliasList(row.aliases).map((alias) => similarity(alias, normalized));
        const score = Math.max(
          similarity(normalizeAnchorText(row.normalized_name || row.canonical_name), normalized),
          ...aliasScores,
          0,
        );
        return toResolvedAnchor(row, "registry_fuzzy", score);
      })
      .filter((row: any) => Number(row.confidence) >= 0.82)
      .sort((a: any, b: any) => Number(b.confidence) - Number(a.confidence));
  }

  const { matches, rejected } = areaFilter(candidates, areaHint);
  diagnostics.candidateCount = candidates.length;
  diagnostics.areaRejectedCount = rejected.length;
  diagnostics.candidates = candidates.slice(0, 10).map(anchorCandidateSummary);

  if (areaHint && !matches.length && rejected.length) {
    diagnostics.rejectionReason = "anchor_outside_requested_area";
    return finish({
      status: "not_found",
      anchor: null,
      candidates: rejected.slice(0, 5),
      source: rejected[0]?.resolutionSource ?? "none",
      confidence: Number(rejected[0]?.confidence ?? 0) || null,
    });
  }

  candidates = matches.length ? matches : candidates;
  if (!candidates.length) {
    return finish({ status: "not_found", anchor: null, candidates: [], source: "none", confidence: null });
  }

  const top = candidates[0];
  const second = candidates[1];
  const confidence = Number(top.confidence ?? 0.82);
  if (second && (top.id !== second.id) && confidence - Number(second.confidence ?? 0.8) < 0.08) {
    diagnostics.rejectionReason = "duplicate_or_ambiguous_anchor_name";
    return finish({
      status: "ambiguous",
      anchor: null,
      candidates: candidates.slice(0, 5),
      source: top.resolutionSource ?? "none",
      confidence,
    });
  }

  const resolvedLocationId = top.linkedLocationId ?? top.id ?? null;
  if (!resolvedLocationId) {
    diagnostics.rejectionReason = "missing_resolved_location_id";
    return finish({
      status: "not_found",
      anchor: null,
      candidates: [top],
      source: top.resolutionSource ?? "none",
      confidence,
    });
  }

  top.id = resolvedLocationId;
  if (!Number.isFinite(Number(top.latitude)) || !Number.isFinite(Number(top.longitude))) {
    diagnostics.rejectionReason = "missing_coordinates";
    return finish({
      status: "missing_coordinates",
      anchor: top,
      candidates: [top],
      source: top.resolutionSource ?? "none",
      confidence,
    });
  }

  diagnostics.resolvedLocationId = resolvedLocationId;
  return finish({
    status: "resolved",
    anchor: top,
    candidates: candidates.slice(0, 5),
    source: top.resolutionSource ?? "none",
    confidence,
  });
}

export async function recordAnchorDiscovery(
  supabase: any,
  args: {
    rawQuery: string;
    rawAnchorText: string;
    areaHint?: string | null;
    requestedDomain: "restaurant" | "activity";
  },
) {
  const normalized = normalizeAnchorText(args.rawAnchorText);
  await supabase
    .from("search_anchor_discoveries")
    .upsert(
      {
        raw_query: args.rawQuery,
        raw_anchor_text: args.rawAnchorText,
        normalized_anchor_text: normalized,
        area_hint: args.areaHint ?? null,
        requested_domain: args.requestedDomain,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "normalized_anchor_text,area_hint,requested_domain" },
    )
    .select("id")
    .maybeSingle()
    .catch?.(() => null);
}
