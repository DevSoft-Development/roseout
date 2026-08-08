export const GOOGLE_MATCH_REVIEW_THRESHOLD = 55;
export const GOOGLE_MATCH_ACCEPT_THRESHOLD = 75;

export type GoogleNoMatchDisposition =
  | "likely_closed_or_renamed"
  | "address_only"
  | "parent_venue_or_embedded"
  | "bad_source_name"
  | "unresolved";

type GooglePlaceLike = {
  id?: string | null;
  displayName?: { text?: string | null } | null;
  formattedAddress?: string | null;
  primaryType?: string | null;
  types?: string[] | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
  nationalPhoneNumber?: string | null;
  websiteUri?: string | null;
};

type GoogleMatchResultLike = {
  status?: string | null;
  confidence?: number | null;
  place?: GooglePlaceLike | null;
  evidence?: Record<string, unknown> | null;
};

type SourceContext = {
  name?: string | null;
  address?: string | null;
};

const ADDRESS_ONLY_TYPES = new Set(["street_address", "premise", "subpremise"]);
const PARENT_VENUE_TYPES = new Set([
  "courthouse",
  "local_government_office",
  "government_office",
  "hotel",
  "lodging",
  "zoo",
  "tourist_attraction",
  "shopping_mall",
  "school",
  "university",
  "hospital",
  "airport",
  "train_station",
  "transit_station",
  "stadium",
  "museum",
]);
const BUSINESS_TYPES = new Set([
  "restaurant",
  "bar",
  "lounge_bar",
  "night_club",
  "cafe",
  "coffee_shop",
  "bakery",
  "food",
  "food_store",
]);
const BUSINESS_NAME_HINT = /\b(restaurant|ristorante|cafe|café|bar|bakery|grill|kitchen|pizza|pizzeria|lounge|diner|bistro|pub|tavern|club|coffee|food|market|house|hotel|inn|shop|store|deli|taqueria|eatery|brasserie|cantina)\b/i;

function numberEvidence(evidence: Record<string, unknown> | null | undefined, key: string) {
  const value = evidence?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanEvidence(evidence: Record<string, unknown> | null | undefined, key: string) {
  return evidence?.[key] === true;
}

function stringEvidence(evidence: Record<string, unknown> | null | undefined, key: string) {
  const value = evidence?.[key];
  return typeof value === "string" ? value : "";
}

function placeTypes(place: GooglePlaceLike | null | undefined) {
  return new Set([place?.primaryType, ...(place?.types || [])].filter((value): value is string => Boolean(value)));
}

function sourceNameFromQuery(evidence: Record<string, unknown> | null | undefined) {
  const query = stringEvidence(evidence, "query").trim();
  if (!query) return "";
  const match = query.match(/^(.*?)(?=\s\d+[A-Za-z]?\s)/);
  return (match?.[1] || "").trim();
}

function looksLikePersonalSourceName(name: string) {
  const normalized = name.trim();
  if (!normalized || BUSINESS_NAME_HINT.test(normalized)) return false;
  if (!/(?:&|\band\b)/i.test(normalized)) return false;
  const words = normalized.match(/[A-Za-zÀ-ÖØ-öø-ÿ'-]+/g) || [];
  return words.length >= 3 && words.length <= 7;
}

function classifyDisposition(result: GoogleMatchResultLike, source?: SourceContext) {
  const place = result.place;
  const evidence = result.evidence || {};
  const types = placeTypes(place);
  const distanceMeters = numberEvidence(evidence, "distanceMeters");
  const nameSimilarity = numberEvidence(evidence, "nameSimilarity") ?? 0;
  const addressMatch = booleanEvidence(evidence, "addressMatch");
  const close = distanceMeters !== null && distanceMeters <= 100;
  const sourceName = String(source?.name || sourceNameFromQuery(evidence)).trim();

  if (!place) {
    return {
      category: "unresolved" as const,
      confidence: "high" as const,
      reason: "Google returned no candidate to classify.",
      recommendedAction: "manual_review" as const,
    };
  }

  const addressOnly = [...types].some((type) => ADDRESS_ONLY_TYPES.has(type));
  if (addressOnly) {
    if (sourceName && looksLikePersonalSourceName(sourceName)) {
      return {
        category: "bad_source_name" as const,
        confidence: "high" as const,
        reason: "Google resolves the address but not a public business, and the source name looks like a person or operator name.",
        recommendedAction: "repair_source_name" as const,
      };
    }
    return {
      category: "address_only" as const,
      confidence: "high" as const,
      reason: "Google resolves only an address or premise rather than a matching public venue.",
      recommendedAction: "verify_source_record" as const,
    };
  }

  const parentVenue = [...types].some((type) => PARENT_VENUE_TYPES.has(type));
  if (parentVenue && addressMatch && close && nameSimilarity < 0.5) {
    return {
      category: "parent_venue_or_embedded" as const,
      confidence: "high" as const,
      reason: "Google resolves a parent facility at the same location instead of the embedded venue named by the source.",
      recommendedAction: "verify_embedded_venue" as const,
    };
  }

  const businessCandidate = [...types].some((type) => BUSINESS_TYPES.has(type));
  if (businessCandidate && addressMatch && close && nameSimilarity <= 0.25) {
    return {
      category: "likely_closed_or_renamed" as const,
      confidence: "medium" as const,
      reason: "A different business now resolves at the same address, which is consistent with a closure or rename but requires review.",
      recommendedAction: "verify_then_unpublish" as const,
    };
  }

  return {
    category: "unresolved" as const,
    confidence: "medium" as const,
    reason: "The rejected candidate does not meet a safe automatic source-data disposition rule.",
    recommendedAction: "manual_review" as const,
  };
}

function rejectionReason(result: GoogleMatchResultLike) {
  if (!result.place) {
    const evidenceReason = result.evidence?.reason;
    return typeof evidenceReason === "string" && evidenceReason
      ? evidenceReason
      : "no_candidate";
  }

  if ((result.confidence ?? 0) < GOOGLE_MATCH_REVIEW_THRESHOLD) {
    return "confidence_below_review_threshold";
  }

  return "no_match";
}

export function buildGoogleNoMatchDiagnostics(result: GoogleMatchResultLike, source?: SourceContext) {
  const place = result.place;
  const inferredName = source?.name || sourceNameFromQuery(result.evidence);

  return {
    version: "google-match-diagnostics-v2",
    rejectionReason: rejectionReason(result),
    confidence: Number(result.confidence ?? 0),
    thresholds: {
      review: GOOGLE_MATCH_REVIEW_THRESHOLD,
      matched: GOOGLE_MATCH_ACCEPT_THRESHOLD,
    },
    source: {
      name: inferredName || null,
      address: source?.address || null,
    },
    disposition: classifyDisposition(result, source),
    evidence: result.evidence || {},
    candidate: place
      ? {
          placeId: place.id || null,
          displayName: place.displayName?.text || null,
          formattedAddress: place.formattedAddress || null,
          primaryType: place.primaryType || null,
          types: place.types || [],
          location: place.location || null,
          nationalPhoneNumber: place.nationalPhoneNumber || null,
          websiteUri: place.websiteUri || null,
        }
      : null,
  };
}
