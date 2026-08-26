import type { SearchPlan } from "./searchPlanTypes";
import {
  detectVenueRelationship,
  extractNegativeConstraints,
  extractSubjectivePreferences,
} from "./languageUnderstanding";

const uniq = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

const INDEPENDENT_ACTIVITY_PATTERN = /\b(?:activity|activities|things? to do|bowling|billiards|pool hall|arcade|museum|art gallery|gallery|escape room|escape game|mini golf|comedy|theater|theatre|cinema|pottery|paint and sip|axe throwing|scenic walk|waterfront walk|concert|show)\b/i;
const RESTAURANT_SIGNAL_PATTERN = /\b(?:restaurant|restaurants|dinner|brunch|lunch|breakfast|food|eat|dining|cuisine|steakhouse|sushi|pizza|seafood)\b/i;

function restaurantCapabilityFeatures(query: string) {
  const features: string[] = [];
  if (/\b(?:hookah|shisha)\b/i.test(query)) features.push("hookah");
  if (/\brooftop\b/i.test(query)) features.push("rooftop");
  if (/\b(?:live music|live jazz|jazz|live band)\b/i.test(query)) features.push("live_music");
  if (/\b(?:cocktails?|drinks?)\b/i.test(query)) features.push("cocktails");
  if (/\b(?:dj|disc jockey)\b/i.test(query)) features.push("dj");
  if (/\bkaraoke\b/i.test(query)) features.push("karaoke");
  if (/\bwaterfront\b/i.test(query)) features.push("waterfront");
  if (/\b(?:outdoor seating|patio)\b/i.test(query)) features.push("outdoor_seating");
  if (/\bprivate room\b/i.test(query)) features.push("private_room");
  return uniq(features);
}

function isSeparateRelationship(type: ReturnType<typeof detectVenueRelationship>["type"]) {
  return type === "sequential" || type === "proximity" || type === "separate_venues";
}

/**
 * Converts deterministic parser output into the canonical language contract used
 * by retrieval/ranking. Feature words such as rooftop and hookah remain venue
 * capabilities unless the user explicitly asks for another stop.
 */
export function enrichSearchPlan(plan: SearchPlan): SearchPlan {
  const relationship = detectVenueRelationship(plan.rawQuery);
  const negatives = extractNegativeConstraints(plan.rawQuery);
  const subjective = extractSubjectivePreferences(plan.rawQuery);
  const capabilityFeatures = restaurantCapabilityFeatures(plan.rawQuery);
  const separateRelationship = isSeparateRelationship(relationship.type);
  const explicitIndependentActivity = INDEPENDENT_ACTIVITY_PATTERN.test(plan.rawQuery);
  const explicitRestaurant = RESTAURANT_SIGNAL_PATTERN.test(plan.rawQuery);
  const restaurantBoundCapability =
    plan.restaurant.required &&
    capabilityFeatures.length > 0 &&
    !separateRelationship &&
    (relationship.sameVenueFeature || explicitRestaurant);

  const activityFeatures = restaurantBoundCapability
    ? plan.activity.features.filter((feature) => !capabilityFeatures.includes(String(feature)))
    : [...plan.activity.features];
  const activityCategories = restaurantBoundCapability
    ? plan.activity.categories.filter((category) => !["hookah", "lounge"].includes(String(category)))
    : [...plan.activity.categories];

  const capabilityOnlyCreatedActivity =
    restaurantBoundCapability &&
    explicitRestaurant &&
    !explicitIndependentActivity &&
    activityCategories.length === 0 &&
    activityFeatures.length === 0;

  const activityRequired = capabilityOnlyCreatedActivity ? false : plan.activity.required;
  const mode = capabilityOnlyCreatedActivity && plan.mode !== "anchored_nearby"
    ? "restaurant_only"
    : plan.mode;
  const pairingRequired = capabilityOnlyCreatedActivity ? false : plan.pairing.required;

  const relationshipType = capabilityOnlyCreatedActivity
    ? "same_venue_required"
    : relationship.type;
  const relationshipEvidence = capabilityOnlyCreatedActivity
    ? uniq([...relationship.evidence, "restaurant_capability_not_second_stop"])
    : relationship.evidence;

  const next: SearchPlan = {
    ...plan,
    mode,
    restaurant: {
      ...plan.restaurant,
      features: restaurantBoundCapability
        ? uniq([...plan.restaurant.features, ...capabilityFeatures])
        : [...plan.restaurant.features],
      exclusions: uniq([...plan.restaurant.exclusions, ...negatives.restaurant]),
    },
    activity: {
      ...plan.activity,
      required: activityRequired,
      categories: activityCategories,
      features: activityFeatures,
      exclusions: uniq([...plan.activity.exclusions, ...negatives.activity]),
    },
    pairing: {
      ...plan.pairing,
      required: pairingRequired,
      sameVenueRequired: pairingRequired && relationshipType === "same_venue_required",
      sameVenuePreferred:
        pairingRequired &&
        (relationshipType === "same_venue_required" || relationshipType === "same_venue_preferred"),
      sequence:
        relationshipType === "sequential" ? plan.pairing.sequence : plan.pairing.sequence,
    },
    relationship: {
      type: relationshipType,
      evidence: relationshipEvidence,
    },
    preferences: {
      vibes: uniq([...(plan.preferences?.vibes ?? []), ...subjective.vibes]),
      avoidVibes: uniq([...(plan.preferences?.avoidVibes ?? []), ...negatives.vibes]),
      subjectiveTerms: uniq([...(plan.preferences?.subjectiveTerms ?? []), ...subjective.subjectiveTerms]),
      budget: subjective.budget ?? plan.preferences?.budget ?? null,
      noise: subjective.noise ?? plan.preferences?.noise ?? null,
    },
    parser: {
      ...plan.parser,
      reasons: uniq([
        ...plan.parser.reasons,
        restaurantBoundCapability ? "venue capability bound to restaurant lane" : "venue relationship interpreted",
        negatives.activity.length || negatives.restaurant.length || negatives.vibes.length
          ? "negative constraints applied before ranking"
          : "",
      ]),
    },
  };

  return next;
}
