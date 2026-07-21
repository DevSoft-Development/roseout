import type { EnterpriseLocation, EnterpriseSearchResult } from "./types";
import { haversineMiles, estimateWalkingMinutes } from "./distance";
import {
  resolveSearchAnchor,
  recordAnchorDiscovery,
} from "@/lib/search/anchors/resolve";
import {
  anchorRadiusPolicy,
  expansionSteps,
  minimumResultTarget,
} from "@/lib/search/anchors/radius";
import { evaluateCandidateEligibility } from "./classification";

export type AnchorRelationship =
  | "near"
  | "close_to"
  | "next_to"
  | "around"
  | "walking_distance_from"
  | "by"
  | "after_visiting"
  | "before_game"
  | "before_show"
  | "after_dinner";
export type AnchorRequestedDomain = "restaurant" | "activity";

export type NamedLocationAnchorRequest = {
  rawName: string;
  normalizedName: string;
  relationship: AnchorRelationship;
  requestedDomain: AnchorRequestedDomain;
  areaHint: string | null;
  maxDistanceMiles: number;
};

export type NamedLocationResolution = {
  status: "resolved" | "ambiguous" | "not_found" | "missing_coordinates";
  location: EnterpriseLocation | null;
  candidates: EnterpriseLocation[];
  confidence: number | null;
};

const DOMAIN_PREFIX =
  "(?:restaurant|restaurants|food|dinner|lunch|brunch|breakfast|coffee shop|coffee|cafe|café|dessert spots?|desserts?|bakery|sushi|steakhouse|escape room|activity|activities|something fun|things to do)";
const RELATION =
  "(?:near|close to|next to|around|by|nearby|within walking distance of|within a fifteen-minute walk of|within(?: a)?(?: \\d+[- ]minute)? walk(?:ing distance)? (?:of|from)|after visiting|before a game at|before a show at|after dinner at|around the corner from)";
const ANCHOR_RE = new RegExp(
  `^\\s*(${DOMAIN_PREFIX})\\s+(${RELATION})\\s+(.+?)\\s*$`,
  "i",
);

export function normalizeAnchorName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:llc|inc|corp|corporation|company|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

function relationshipFromText(value: string): AnchorRelationship {
  const text = value.toLowerCase();
  if (text.includes("before a game")) return "before_game";
  if (text.includes("before a show")) return "before_show";
  if (text.includes("after dinner")) return "after_dinner";
  if (text.includes("after visiting")) return "after_visiting";
  if (text === "by" || text.includes("nearby")) return "by";
  if (text.includes("next to")) return "next_to";
  if (text.includes("walking") || text.includes(" walk")) {
    return "walking_distance_from";
  }
  if (text.includes("close to")) return "close_to";
  if (text.includes("around")) return "around";
  return "near";
}

function radiusFromRelationship(
  relationship: AnchorRelationship,
  query: string,
) {
  const minutes = query.match(/\b(\d{1,2})[- ]minute\b/i);
  if (minutes) return Math.min(3, Number(minutes[1]) / 20);
  if (relationship === "next_to") return 0.25;
  if (relationship === "walking_distance_from") return 1;
  if (relationship === "around") return 2;
  return 1.5;
}

export function extractNamedLocationAnchor(
  query: string,
): NamedLocationAnchorRequest | null {
  const match = query.match(ANCHOR_RE);
  if (!match) return null;

  const requestedDomain: AnchorRequestedDomain =
    /activity|activities|something fun|things to do|escape room/i.test(match[1])
      ? "activity"
      : "restaurant";
  const relationship = relationshipFromText(match[2]);
  let remainder = match[3]
    .trim()
    .replace(/[?.!]+$/, "")
    .replace(/\s+that\s+is\s+open\s+late$/i, "");
  let areaHint: string | null = null;
  const areaMatch = remainder.match(
    /^(.*?)(?:\s+in\s+)([A-Za-z][A-Za-z .'-]{1,60})$/i,
  );
  if (areaMatch) {
    remainder = areaMatch[1].trim();
    areaHint = areaMatch[2].trim();
  }
  if (
    !remainder ||
    /^(?:a|an|the)\s+(?:arcade|museum|restaurant|bar|activity|gaming center)$/i.test(
      remainder,
    )
  ) {
    return null;
  }

  return {
    rawName: remainder,
    normalizedName: normalizeAnchorName(remainder),
    relationship,
    requestedDomain,
    areaHint,
    maxDistanceMiles: radiusFromRelationship(relationship, query),
  };
}

function locationName(row: EnterpriseLocation) {
  return String(
    row.name || row.restaurant_name || row.activity_name || "",
  ).trim();
}

function textSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  const overlap = [...aa].filter((token) => bb.has(token)).length;
  return overlap / Math.max(aa.size, bb.size);
}

function geoScore(row: EnterpriseLocation, areaHint: string | null) {
  if (!areaHint) return 0;
  const haystack = [
    row.neighborhood,
    row.borough,
    row.city,
    row.county,
    row.state,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(areaHint.toLowerCase()) ? 1 : 0;
}

export async function resolveNamedLocationAnchor(
  supabase: any,
  request: NamedLocationAnchorRequest,
): Promise<NamedLocationResolution> {
  const searchToken = request.rawName.replace(/[%_,]/g, " ").trim();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .or(
      `name.ilike.%${searchToken}%,restaurant_name.ilike.%${searchToken}%,activity_name.ilike.%${searchToken}%`,
    )
    .is("deleted_at", null)
    .not("is_hidden", "is", true)
    .limit(25);

  if (error || !Array.isArray(data)) {
    return {
      status: "not_found",
      location: null,
      candidates: [],
      confidence: null,
    };
  }

  const ranked = (data as EnterpriseLocation[])
    .map((row) => {
      const similarity = textSimilarity(
        normalizeAnchorName(locationName(row)),
        request.normalizedName,
      );
      const area = geoScore(row, request.areaHint);
      return { row, confidence: similarity * 0.78 + area * 0.22 };
    })
    .filter((item) => item.confidence >= 0.58)
    .sort((a, b) => b.confidence - a.confidence);

  if (!ranked.length) {
    return {
      status: "not_found",
      location: null,
      candidates: [],
      confidence: null,
    };
  }

  if (
    ranked.length > 1 &&
    ranked[0].confidence - ranked[1].confidence < 0.08 &&
    ranked[0].confidence < 0.92
  ) {
    return {
      status: "ambiguous",
      location: null,
      candidates: ranked.slice(0, 5).map((item) => item.row),
      confidence: ranked[0].confidence,
    };
  }

  const location = ranked[0].row;
  if (
    !Number.isFinite(Number(location.latitude)) ||
    !Number.isFinite(Number(location.longitude))
  ) {
    return {
      status: "missing_coordinates",
      location,
      candidates: [location],
      confidence: ranked[0].confidence,
    };
  }

  return {
    status: "resolved",
    location,
    candidates: ranked.slice(0, 5).map((item) => item.row),
    confidence: ranked[0].confidence,
  };
}

function qualityScore(row: EnterpriseLocation) {
  const rating = Math.max(0, Math.min(5, Number(row.rating) || 0)) / 5;
  const reviews =
    Math.min(1, Math.log10(Math.max(1, Number(row.review_count) || 1)) / 4);
  const curated = Math.max(
    0,
    Math.min(
      1,
      Number(
        row.recommendation_score ??
          row.search_score ??
          row.quality_score ??
          row.theouthaven_score ??
          row.roseout_score ??
          0,
      ) / 100,
    ),
  );
  return rating * 0.5 + reviews * 0.2 + curated * 0.3;
}

export function isEligibleAnchoredCandidate(
  row: EnterpriseLocation,
  requestedDomain: AnchorRequestedDomain,
) {
  return evaluateCandidateEligibility({
    location: row,
    expectedDomain: requestedDomain,
    lane: `anchored_${requestedDomain}`,
  }).eligible;
}

export async function runAnchoredNearbySearch(args: {
  query: string;
  supabase: any;
  displayLimit?: number;
}): Promise<EnterpriseSearchResult | null> {
  const anchorRequest = extractNamedLocationAnchor(args.query);
  if (!anchorRequest) return null;

  const registryResolution = await resolveSearchAnchor(
    args.supabase,
    anchorRequest.rawName,
    anchorRequest.areaHint,
  );
  const resolution =
    registryResolution.status === "resolved" ||
    registryResolution.status === "ambiguous" ||
    registryResolution.status === "missing_coordinates"
      ? {
          status: registryResolution.status,
          location: registryResolution.anchor,
          candidates: registryResolution.candidates,
          confidence: registryResolution.confidence,
          source: registryResolution.source,
          resolutionMs: registryResolution.resolutionMs,
        }
      : {
          ...(await resolveNamedLocationAnchor(args.supabase, anchorRequest)),
          source: "linked_location",
          resolutionMs: registryResolution.resolutionMs,
        };

  if (resolution.status === "not_found") {
    await recordAnchorDiscovery(args.supabase, {
      rawQuery: args.query,
      rawAnchorText: anchorRequest.rawName,
      areaHint: anchorRequest.areaHint,
      requestedDomain: anchorRequest.requestedDomain,
    });
  }

  const radiusPolicy =
    resolution.location && "default_radius_miles" in resolution.location
      ? anchorRadiusPolicy(resolution.location as any)
      : {
          initialRadiusMiles: anchorRequest.maxDistanceMiles,
          maxRadiusMiles: anchorRequest.maxDistanceMiles,
          strategy: "dense_urban",
        };
  const anchorGeo = resolution.location
    ? {
        raw: anchorRequest.areaHint,
        neighborhood:
          resolution.location.neighborhood ?? anchorRequest.areaHint ?? null,
        borough: resolution.location.borough ?? null,
        city: resolution.location.city ?? null,
        state: resolution.location.state ?? null,
        latitude: Number(resolution.location.latitude),
        longitude: Number(resolution.location.longitude),
        radiusMiles: radiusPolicy.initialRadiusMiles,
        geoStrictness: "strict",
        originType: "named_location",
        anchorLocationId: resolution.location.id,
        anchorLocationName: locationName(resolution.location),
        aliases: anchorRequest.areaHint ? [anchorRequest.areaHint] : [],
      }
    : null;

  const debug: Record<string, unknown> = {
    normalizedIntent: {
      rawQuery: args.query,
      searchType: "anchored_nearby",
      primaryDomain: anchorRequest.requestedDomain,
      needsRestaurant: anchorRequest.requestedDomain === "restaurant",
      needsActivity: anchorRequest.requestedDomain === "activity",
      wantsPairing: false,
      geo: anchorGeo,
    },
    effectiveGeo: anchorGeo,
    anchorRequested: true,
    anchorRawName: anchorRequest.rawName,
    anchorAreaHint: anchorRequest.areaHint,
    anchorResolutionStatus: resolution.status,
    anchorResolutionSource: (resolution as any).source ?? "linked_location",
    anchorResolutionMs: (resolution as any).resolutionMs ?? 0,
    anchorResolved: resolution.status === "resolved",
    anchorLocationId: resolution.location?.id ?? null,
    anchorLocationName: resolution.location
      ? locationName(resolution.location)
      : null,
    anchorCandidateCount: resolution.candidates.length,
    anchorConfidence: resolution.confidence,
    anchorDistanceApplied: false,
    anchorFallbackUsed: false,
    requestedDomain: anchorRequest.requestedDomain,
    anchorRelationship: anchorRequest.relationship,
    radiusStrategy: radiusPolicy.strategy,
    initialRadiusMiles: radiusPolicy.initialRadiusMiles,
    finalRadiusMiles: radiusPolicy.initialRadiusMiles,
    radiusExpanded: false,
    anchorExcludedFromResults: true,
    anchorDiscoveryRecorded: resolution.status === "not_found",
    maxAnchorDistanceMiles: radiusPolicy.maxRadiusMiles,
    finalDisplayedResultCount: 0,
    anchorCanonicalEligibilityApplied: true,
  };

  if (resolution.status !== "resolved" || !resolution.location) {
    return {
      success: false,
      restaurants: [],
      activities: [],
      pairs: [],
      matched_locations: [],
      render_mode: "empty",
      reply:
        resolution.status === "ambiguous"
          ? `I found multiple places matching ${anchorRequest.rawName}. Please add the neighborhood or city.`
          : `I could not confirm ${anchorRequest.rawName}${anchorRequest.areaHint ? ` in ${anchorRequest.areaHint}` : ""}.`,
      card_counts: {
        restaurants: 0,
        activities: 0,
        matched_locations: 0,
        pairs: 0,
      },
      anchor_location: resolution.location,
      anchor_candidates: resolution.candidates,
      search_context: {
        mode: "anchored_nearby",
        relationship: anchorRequest.relationship,
        requested_result_domain: anchorRequest.requestedDomain,
        anchor_position: "top",
      },
      debug,
    } as EnterpriseSearchResult;
  }

  const anchor = resolution.location;
  const lat = Number(anchor.latitude);
  const lon = Number(anchor.longitude);
  const targetMinimum = minimumResultTarget(
    anchorRequest.requestedDomain,
    null,
  );
  let finalRadiusMiles = radiusPolicy.initialRadiusMiles;
  let radiusExpanded = false;
  let results: any[] = [];
  let domainRejectedCount = 0;

  for (const searchRadiusMiles of expansionSteps(
    radiusPolicy.initialRadiusMiles,
    radiusPolicy.maxRadiusMiles,
  )) {
    const latDelta = searchRadiusMiles / 69;
    const lonDelta =
      searchRadiusMiles /
      Math.max(20, 69 * Math.cos((lat * Math.PI) / 180));

    const { data, error } = await args.supabase
      .from("locations")
      .select("*")
      .gte("latitude", lat - latDelta)
      .lte("latitude", lat + latDelta)
      .gte("longitude", lon - lonDelta)
      .lte("longitude", lon + lonDelta)
      .eq("is_searchable", true)
      .not("is_hidden", "is", true)
      .is("deleted_at", null)
      .limit(1000);

    const candidates = error || !Array.isArray(data)
      ? []
      : (data as EnterpriseLocation[]);
    const eligibleCandidates = candidates.filter((row) => {
      if (String(row.id) === String(anchor.id)) return false;
      const eligible = isEligibleAnchoredCandidate(
        row,
        anchorRequest.requestedDomain,
      );
      if (!eligible) domainRejectedCount += 1;
      return eligible;
    });

    const batch = eligibleCandidates
      .map((row) => {
        const distance = haversineMiles(
          lat,
          lon,
          Number(row.latitude),
          Number(row.longitude),
        );
        const proximityScore = Math.max(
          0,
          1 - distance / searchRadiusMiles,
        );
        const anchoredRankScore =
          proximityScore * 0.72 + qualityScore(row) * 0.28;
        return {
          ...row,
          distance_miles: Number(distance.toFixed(2)),
          anchor_distance_miles: Number(distance.toFixed(2)),
          anchor_walking_minutes: estimateWalkingMinutes(distance),
          anchor_location_id: anchor.id,
          anchor_location_name: locationName(anchor),
          anchored_rank_score: Number(anchoredRankScore.toFixed(4)),
          distance_label: `${distance.toFixed(1)} mi from ${locationName(anchor)}`,
        };
      })
      .filter(
        (row) => Number(row.anchor_distance_miles) <= searchRadiusMiles,
      )
      .sort(
        (a, b) =>
          Number(b.anchored_rank_score) - Number(a.anchored_rank_score) ||
          Number(a.anchor_distance_miles) -
            Number(b.anchor_distance_miles),
      )
      .slice(0, args.displayLimit ?? 12);

    results = batch;
    finalRadiusMiles = searchRadiusMiles;
    radiusExpanded = searchRadiusMiles > radiusPolicy.initialRadiusMiles;
    if (
      results.length >= targetMinimum ||
      searchRadiusMiles >= radiusPolicy.maxRadiusMiles
    ) {
      break;
    }
  }

  debug.anchorDistanceApplied = true;
  debug.finalDisplayedResultCount = results.length;
  debug.finalRadiusMiles = finalRadiusMiles;
  debug.radiusExpanded = radiusExpanded;
  debug.anchorDomainRejectedCount = domainRejectedCount;
  debug.anchorResultPreview = results.slice(0, 12).map((row) => ({
    id: row.id,
    name: locationName(row),
    distanceMiles: row.anchor_distance_miles,
    walkingMinutes: row.anchor_walking_minutes,
    rankScore: row.anchored_rank_score,
  }));

  const restaurants =
    anchorRequest.requestedDomain === "restaurant" ? results : [];
  const activities =
    anchorRequest.requestedDomain === "activity" ? results : [];
  const heading = `${
    anchorRequest.requestedDomain === "restaurant"
      ? "Restaurants"
      : "Activities"
  } near ${locationName(anchor)}`;

  return {
    success: results.length > 0,
    restaurants,
    activities,
    pairs: [],
    matched_locations: [],
    cards: results,
    render_mode:
      anchorRequest.requestedDomain === "restaurant"
        ? "restaurant_cards"
        : "activity_cards",
    searchMode: "anchored_nearby",
    reply: results.length
      ? heading
      : `I found ${locationName(anchor)}, but no matching ${anchorRequest.requestedDomain}s within ${finalRadiusMiles} miles.`,
    card_counts: {
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: 0,
      pairs: 0,
    },
    anchor_location: anchor,
    anchor_candidates: resolution.candidates,
    search_context: {
      mode: "anchored_nearby",
      heading,
      relationship: anchorRequest.relationship,
      requested_result_domain: anchorRequest.requestedDomain,
      initial_radius_miles: radiusPolicy.initialRadiusMiles,
      final_radius_miles: finalRadiusMiles,
      radius_expanded: radiusExpanded,
      max_distance_miles: radiusPolicy.maxRadiusMiles,
      anchor_position: "top",
    },
    debug,
  } as EnterpriseSearchResult;
}
