import { detectChainBrand } from "@/lib/location-growth/chainDetection";

export type GoogleDiscoveryKind = "restaurant" | "activity";
export type GoogleDiscoveryDecision = "auto_import" | "review" | "reject";

export type GoogleDiscoveryQualityInput = {
  kind: GoogleDiscoveryKind;
  name: string;
  query: string;
  category: string;
  rating: number;
  reviewCount: number;
  types?: string[];
  editorialSummary?: string | null;
  hasPhoto: boolean;
  hasPhone: boolean;
  hasWebsite: boolean;
  hasHours: boolean;
  hasLocation: boolean;
};

export type GoogleDiscoveryQualityResult = {
  decision: GoogleDiscoveryDecision;
  score: number;
  outingFitScore: number;
  reasons: string[];
  chainBrand: string | null;
  quickService: boolean;
  thresholds: {
    autoMinRating: number;
    autoMinReviews: number;
    reviewMinRating: number;
    reviewMinReviews: number;
  };
};

const QUICK_SERVICE_TYPES = new Set([
  "fast_food_restaurant",
  "food_court",
  "meal_delivery",
  "food_delivery",
  "pizza_delivery",
]);

const QUICK_SERVICE_NAME_TERMS = [
  "fried chicken",
  "chicken fingers",
  "chicken fries",
  "loaded platters",
  "smashburger",
  "smash burger",
  "wings and pizza",
  "hot wings",
];

const OUTING_SIGNALS: Array<[RegExp, number, string]> = [
  [/rooftop/, 18, "rooftop"],
  [/waterfront|water view|river view|harbor|harbour/, 18, "waterfront"],
  [/fine dining|omakase|tasting menu/, 16, "elevated_dining"],
  [/live music|jazz|concert/, 16, "live_entertainment"],
  [/private dining|private room|event venue/, 14, "group_occasion"],
  [/cocktail|wine bar|speakeasy|mixology/, 12, "drinks_destination"],
  [/romantic|date night|date-night/, 12, "date_night"],
  [/birthday|celebration|group dining/, 10, "celebration"],
  [/steakhouse|steak house|seafood|sushi|izakaya/, 8, "destination_food"],
  [/brunch/, 6, "brunch"],
  [/escape room|bowling|arcade|mini golf|axe throwing|karaoke|go kart|virtual reality/, 22, "interactive_activity"],
  [/comedy club|museum|art gallery|immersive|paint and sip|pottery|candle making/, 20, "experience_activity"],
  [/spa|bath house|sauna|wellness/, 18, "wellness_activity"],
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isQuickServiceDiscoveryCandidate(input: Pick<GoogleDiscoveryQualityInput, "name" | "types">) {
  const types = (input.types || []).map((type) => String(type).toLowerCase());
  if (types.some((type) => QUICK_SERVICE_TYPES.has(type))) return true;

  const text = normalize(input.name);
  const quickName = QUICK_SERVICE_NAME_TERMS.some((term) => text.includes(term));
  const takeawaySignals = types.filter((type) =>
    ["meal_takeaway", "sandwich_shop", "hamburger_restaurant", "pizza_restaurant"].includes(type),
  ).length;
  const destinationSignals = types.some((type) =>
    [
      "fine_dining_restaurant",
      "steak_house",
      "seafood_restaurant",
      "sushi_restaurant",
      "wine_bar",
      "cocktail_bar",
      "event_venue",
    ].includes(type),
  );

  return quickName && takeawaySignals > 0 && !destinationSignals;
}

export function calculateOutingFitScore(input: GoogleDiscoveryQualityInput) {
  const searchable = normalize(
    [
      input.name,
      input.query,
      input.category,
      input.editorialSummary,
      ...(input.types || []),
    ].join(" "),
  );

  let score = 0;
  const reasons: string[] = [];
  for (const [pattern, points, reason] of OUTING_SIGNALS) {
    if (!pattern.test(searchable)) continue;
    score += points;
    reasons.push(reason);
  }

  if (input.kind === "activity") {
    score += 12;
    reasons.push("activity_destination");
  } else if ((input.types || []).some((type) => type.includes("restaurant"))) {
    score += 5;
    reasons.push("full_service_food");
  }

  return { score: clamp(score, 0, 50), reasons: Array.from(new Set(reasons)) };
}

export function evaluateGoogleDiscoveryCandidate(
  input: GoogleDiscoveryQualityInput,
): GoogleDiscoveryQualityResult {
  const reasons: string[] = [];
  const chain = detectChainBrand(input.name);
  const quickService = isQuickServiceDiscoveryCandidate(input);
  const thresholds = input.kind === "restaurant"
    ? {
        autoMinRating: 4.4,
        autoMinReviews: 200,
        reviewMinRating: 4.2,
        reviewMinReviews: 75,
      }
    : {
        autoMinRating: 4.4,
        autoMinReviews: 100,
        reviewMinRating: 4.2,
        reviewMinReviews: 40,
      };

  if (!Number.isFinite(input.rating) || input.rating <= 0) reasons.push("missing_rating");
  if (!Number.isFinite(input.reviewCount) || input.reviewCount <= 0) reasons.push("missing_reviews");
  if (input.rating > 0 && input.rating < thresholds.reviewMinRating) reasons.push("rating_below_floor");
  if (input.reviewCount > 0 && input.reviewCount < Math.min(25, thresholds.reviewMinReviews)) {
    reasons.push("reviews_below_floor");
  }
  if (chain.isChain) reasons.push("chain_or_qsr");
  if (quickService) reasons.push("quick_service");
  if (!input.hasLocation) reasons.push("missing_location");

  const outing = calculateOutingFitScore(input);
  const ratingScore = clamp((input.rating - 4) * 38, 0, 38);
  const reviewScore = clamp(Math.log10(Math.max(1, input.reviewCount)) * 8 - 4, 0, 24);
  const completenessScore =
    (input.hasPhoto ? 7 : 0) +
    (input.hasWebsite ? 5 : 0) +
    (input.hasPhone ? 3 : 0) +
    (input.hasHours ? 4 : 0) +
    (input.hasLocation ? 5 : 0);
  const chainPenalty = chain.isChain ? 55 : 0;
  const quickServicePenalty = quickService ? 35 : 0;
  const score = Math.round(
    clamp(ratingScore + reviewScore + completenessScore + outing.score - chainPenalty - quickServicePenalty, 0, 100),
  );

  const hardReject = reasons.some((reason) =>
    [
      "missing_rating",
      "missing_reviews",
      "rating_below_floor",
      "reviews_below_floor",
      "chain_or_qsr",
      "quick_service",
      "missing_location",
    ].includes(reason),
  );

  if (hardReject) {
    return {
      decision: "reject",
      score,
      outingFitScore: outing.score,
      reasons: Array.from(new Set([...reasons, ...outing.reasons])),
      chainBrand: chain.chainBrand,
      quickService,
      thresholds,
    };
  }

  const completeForAuto =
    input.hasPhoto && input.hasWebsite && input.hasHours && input.hasLocation;
  const autoEligible =
    input.rating >= thresholds.autoMinRating &&
    input.reviewCount >= thresholds.autoMinReviews &&
    score >= 72 &&
    outing.score >= (input.kind === "activity" ? 18 : 8) &&
    completeForAuto;

  if (autoEligible) {
    reasons.push("curated_auto_import");
    return {
      decision: "auto_import",
      score,
      outingFitScore: outing.score,
      reasons: Array.from(new Set([...reasons, ...outing.reasons])),
      chainBrand: chain.chainBrand,
      quickService,
      thresholds,
    };
  }

  const reviewEligible =
    input.rating >= thresholds.reviewMinRating &&
    input.reviewCount >= thresholds.reviewMinReviews &&
    score >= 55;

  if (reviewEligible) {
    if (!input.hasPhoto) reasons.push("needs_photo");
    if (!input.hasWebsite) reasons.push("needs_website");
    if (!input.hasHours) reasons.push("needs_hours");
    reasons.push("curated_manual_review");
    return {
      decision: "review",
      score,
      outingFitScore: outing.score,
      reasons: Array.from(new Set([...reasons, ...outing.reasons])),
      chainBrand: chain.chainBrand,
      quickService,
      thresholds,
    };
  }

  reasons.push("quality_score_below_curated_threshold");
  return {
    decision: "reject",
    score,
    outingFitScore: outing.score,
    reasons: Array.from(new Set([...reasons, ...outing.reasons])),
    chainBrand: chain.chainBrand,
    quickService,
    thresholds,
  };
}
