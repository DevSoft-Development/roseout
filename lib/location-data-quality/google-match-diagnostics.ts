export const GOOGLE_MATCH_REVIEW_THRESHOLD = 55;
export const GOOGLE_MATCH_ACCEPT_THRESHOLD = 75;

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

export function buildGoogleNoMatchDiagnostics(result: GoogleMatchResultLike) {
  const place = result.place;

  return {
    version: "google-match-diagnostics-v1",
    rejectionReason: rejectionReason(result),
    confidence: Number(result.confidence ?? 0),
    thresholds: {
      review: GOOGLE_MATCH_REVIEW_THRESHOLD,
      matched: GOOGLE_MATCH_ACCEPT_THRESHOLD,
    },
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
