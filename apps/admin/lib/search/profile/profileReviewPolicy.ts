import { SEARCH_PROFILE_VERSION } from "./profileTypes";

export type ReviewSeverity = "blocking" | "warning" | "none";

export type ReviewProfile = {
  location_id: string;
  needs_review?: boolean | null;
  confidence?: number | null;
  profile_version?: number | null;
  primary_domain?: string | null;
  canonical_terms?: string[] | null;
  review_reasons?: string[] | null;
  supported_domains?: string[] | null;
  restaurant_categories?: string[] | null;
  activity_categories?: string[] | null;
  nightlife_categories?: string[] | null;
};

const BLOCKING_PATTERNS = [
  /missing primary domain/i,
  /domain conflict/i,
  /unsupported domain/i,
  /restaurant.*activity.*conflict/i,
  /nightlife.*family/i,
  /missing canonical terms/i,
  /no canonical terms/i,
  /invalid classification/i,
];

const WARNING_PATTERNS = [
  /low confidence/i,
  /limited evidence/i,
  /weak evidence/i,
  /review recommended/i,
  /ambiguous/i,
  /few taxonomy matches/i,
];

export function classifyReviewReason(reason: string): ReviewSeverity {
  if (BLOCKING_PATTERNS.some((pattern) => pattern.test(reason))) return "blocking";
  if (WARNING_PATTERNS.some((pattern) => pattern.test(reason))) return "warning";
  return reason.trim() ? "warning" : "none";
}

export function summarizeReview(profile: ReviewProfile) {
  const reasons = Array.isArray(profile.review_reasons) ? profile.review_reasons.filter(Boolean) : [];
  const classified = reasons.map((reason) => ({ reason, severity: classifyReviewReason(reason) }));
  const blockingReasons = classified.filter((item) => item.severity === "blocking").map((item) => item.reason);
  const warningReasons = classified.filter((item) => item.severity === "warning").map((item) => item.reason);

  if (!profile.primary_domain) blockingReasons.push("Missing primary domain");
  if (!Array.isArray(profile.canonical_terms) || profile.canonical_terms.length === 0) blockingReasons.push("Missing canonical terms");
  if (Number(profile.profile_version ?? 0) < SEARCH_PROFILE_VERSION) blockingReasons.push("Stale profile version");
  if (Number(profile.confidence ?? 0) < 0.55) warningReasons.push("Low confidence");

  return {
    severity: blockingReasons.length ? "blocking" as const : warningReasons.length || profile.needs_review ? "warning" as const : "none" as const,
    blockingReasons: [...new Set(blockingReasons)],
    warningReasons: [...new Set(warningReasons)],
  };
}

export function safeSuggestedCorrections(profile: ReviewProfile) {
  const summary = summarizeReview(profile);
  const canonicalTerms = Array.isArray(profile.canonical_terms) ? profile.canonical_terms.filter(Boolean) : [];
  const categoryTerms = [
    ...(profile.restaurant_categories ?? []),
    ...(profile.activity_categories ?? []),
    ...(profile.nightlife_categories ?? []),
  ].filter(Boolean);
  const supported = (profile.supported_domains ?? []).filter((value): value is string => typeof value === "string");
  const primaryDomain = profile.primary_domain || (supported.length === 1 ? supported[0] : null);
  const nextTerms = [...new Set([...canonicalTerms, ...categoryTerms])];

  const canApply = summary.blockingReasons.every((reason) =>
    reason === "Missing primary domain" || reason === "Missing canonical terms" || reason === "Low confidence",
  ) && Boolean(primaryDomain) && nextTerms.length > 0;

  return {
    canApply,
    primaryDomain,
    canonicalTerms: nextTerms,
    clearNeedsReview: canApply && summary.blockingReasons.length === 0,
    summary,
  };
}
