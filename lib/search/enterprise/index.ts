import { supabaseAdmin } from "../../supabase-admin";
import type {
  EnterpriseLocation,
  EnterprisePair,
  EnterpriseSearchResult,
  MlResultDebug,
  MlSearchDebug,
  SearchIntent,
  SearchDomain,
} from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import {
  activitySearchTerms,
  isBroadGenericActivityIntent,
  restaurantSearchTerms,
} from "./normalize-intent";
import {
  detectSingleVenueWithIntent,
  hasRooftopRestaurantFeatureLanguage,
  isSpecificActivityIntent,
  qualifyExplicitActivityIntent,
} from "./taxonomy";
import {
  explainRejection,
  filterActivityResults,
  filterRestaurantResults,
  hasExplicitCafeDessertIntent,
  isCafeBakeryDessertQuickBiteOnly,
  isDateNightDinnerIntent,
  rankActivityResults,
  rankRestaurantResults,
  scoreSingleVenueWithMatch,
  scoreSameVenueAttributeMatch,
  sameVenueSearchTerms,
  isStrongSameVenueMatch,
} from "./ranking";
import {
  createPairingDebug,
  createSearchPairs,
  createActivityActivityPairs,
  getPairCityState,
  getPairGeoPriority,
} from "./pairing";
import {
  formatDistanceFromRestaurant,
  getPairDistanceMiles,
  getRawWalkingMinutes,
  getSafeWalkingMinutes,
  shouldHidePairForWalkingLimit,
  userAskedForWalking,
} from "./distance";
import {
  createRpcDebug,
  recoverEnterpriseLane,
  searchEnterpriseLane,
} from "./rpc";
import { productionSafeDebug } from "./debug";
import { serializeSearchRankingExplanations } from "./explainability";
import { firstSearchImage, hasUsableSearchPhoto } from "./photos";
import {
  getSearchSpeedStatus,
  logSearchPerformance,
} from "@/lib/search/performance";
import { resolveSearchMarket, type UserSearchLocation } from "./markets";
import { detectGeoIntent } from "./geo-taxonomy";
import { logSearchHealthEvent } from "./searchHealthLogger";
import {
  classifySearchIntent,
  getRankingIntentBuckets,
} from "@/lib/ml/intentBuckets";
import {
  getLocationIntentScoreMap,
  getPairScoreMap,
} from "@/lib/ml/intentScoreLoaders";
import { parseOutingDateTime } from "../parse-outing-date-time";
import { validatePlaceForMarket } from "../../location-market-validation";
import { getLocationMlScoreMap } from "@/lib/ml/locationMlScores";
import {
  getMarketGuardrailRejectionReason,
  isExplicitMarket,
  isPairAllowedForResolvedMarket,
  isResultAllowedForResolvedMarket,
} from "../market-guardrails";
import { buildCanonicalSameLocationComboList } from "./sameLocationCombo";
import {
  dedupeFinalSearchResults,
  detectDuplicateSearchLocations,
} from "@/lib/search/duplicateLocations";
import { filterResultsBySearchDomain } from "../domainFilters";
import { rerankLocations, rerankPairs, searchQualityRolloutMode } from "./phaseTwoRanking";

const MIN_RESTAURANT_RESULTS = 6;
const MIN_ACTIVITY_RESULTS = 4;
const MIN_PAIR_RESULTS = 3;
const RECOVERY_LIMIT = 50;
const FOOD_RECOVERY_ML_FLAGS_DISABLED = {
  mlEnabled: false,
  phase1Enabled: false,
  phase2Enabled: false,
};

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function mlFlags() {
  const mlEnabled = envFlag("ML_ENABLED", true);
  return {
    mlEnabled,
    phase1Enabled: mlEnabled && envFlag("ML_PHASE1_ENABLED", true),
    phase2Enabled: mlEnabled && envFlag("ML_PHASE2_ENABLED", true),
  };
}

function idString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function isFoodForwardRestaurantQuery(query: string) {
  return /\b(lunch|dinner|brunch|breakfast|food|restaurant|dining|eat|chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|burgers|steak|pasta|ramen|bbq|barbecue|lobster|crab|shrimp|oyster|oysters|raw bar)\b/i.test(
    query.replaceAll("_", " ").replaceAll("-", " "),
  );
}

function textFromLocationForRanking(item: EnterpriseLocation) {
  return [
    item.name,
    item.restaurant_name,
    item.activity_name,
    item.location_type,
    (item as any).source_table,
    (item as any).type,
    (item as any).cuisine,
    (item as any).cuisine_type,
    (item as any).food_type,
    (item as any).category,
    (item as any).primary_category,
    (item as any).primary_tag,
    (item as any).activity_type,
    (item as any).tags,
    (item as any).semantic_tags,
    (item as any).intent_tags,
    (item as any).search_keywords,
    (item as any).vibe_tags,
    (item as any).date_style_tags,
    (item as any).special_features,
    (item as any).best_for_tags,
    (item as any).best_for,
    (item as any).search_document,
    (item as any).semantic_search_text,
    (item as any).description,
    (item as any).review_keywords,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function activityNightlifeRestaurantMlPenalty(
  item: EnterpriseLocation,
  query: string,
  domain?: SearchDomain,
) {
  if (domain !== "restaurant") return 0;
  if (!isFoodForwardRestaurantQuery(query)) return 0;

  const text = textFromLocationForRanking(item);
  const isActivityRecord =
    /\b(activity|activities)\b/.test(
      String(item.location_type ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((item as any).source_table ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((item as any).type ?? "").toLowerCase(),
    );
  const isNightlifeTyped =
    /\b(nightlife|hookah|shisha|lounge|club|nightclub|night club|cigar|karaoke|speakeasy)\b/.test(
      text,
    );

  if (!isActivityRecord && !isNightlifeTyped) return 0;

  const hasRealRestaurantIdentity = Boolean(
    item.restaurant_name ||
    (item as any).food_type ||
    (item as any).menu_url ||
    String((item as any).primary_category ?? "")
      .toLowerCase()
      .includes("restaurant"),
  );
  const hasSpecificFood =
    /\b(chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|burgers|steak|pasta|ramen|bbq|barbecue|lobster|crab|shrimp|oyster|oysters|raw bar)\b/.test(
      text,
    );

  if (hasRealRestaurantIdentity && hasSpecificFood) return -35;
  if (hasRealRestaurantIdentity) return -125;
  if (isActivityRecord && isNightlifeTyped) return -500;
  if (isActivityRecord) return -300;
  if (isNightlifeTyped) return -220;

  return 0;
}

function isFoodForwardRestaurantOnlySearch(intent: SearchIntent) {
  return (
    intent.primaryDomain === "restaurant" &&
    intent.needsRestaurant === true &&
    intent.needsActivity !== true &&
    intent.wantsPairing !== true &&
    isFoodForwardRestaurantQuery(intent.rawQuery || "")
  );
}

function weakFoodRestaurantCardPenalty(
  item: EnterpriseLocation,
  query: string,
) {
  const existing = Number((item as any).restaurant_food_activity_penalty);
  if (Number.isFinite(existing) && existing !== 0) return existing;
  return activityNightlifeRestaurantMlPenalty(item, query, "restaurant");
}

function shouldSuppressWeakFoodRestaurantCard(
  item: EnterpriseLocation,
  query: string,
) {
  return weakFoodRestaurantCardPenalty(item, query) <= -300;
}

function requestedFoodSignalMatches(item: EnterpriseLocation, query: string) {
  const text = textFromLocationForRanking(item);
  const normalizedQuery = String(query ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  const foodGroups: { query: RegExp; record: RegExp }[] = [
    {
      query: /\b(chicken|wings|fried chicken|hot chicken)\b/,
      record:
        /\b(chicken|wings|fried chicken|hot chicken|chicken wings|bbq chicken|barbecue chicken)\b/,
    },
    {
      query: /\b(seafood|lobster|crab|shrimp|oyster|oysters|raw bar)\b/,
      record: /\b(seafood|lobster|crab|shrimp|oyster|oysters|raw bar|fish)\b/,
    },
    {
      query: /\b(sushi|japanese)\b/,
      record: /\b(sushi|japanese|omakase|sashimi|nigiri)\b/,
    },
    {
      query: /\b(pizza|slice)\b/,
      record: /\b(pizza|slice|pizzeria)\b/,
    },
    {
      query: /\b(tacos?|mexican)\b/,
      record: /\b(tacos?|taqueria|mexican)\b/,
    },
    {
      query: /\b(burger|burgers)\b/,
      record: /\b(burger|burgers|cheeseburger|hamburger)\b/,
    },
    {
      query: /\b(steak|steakhouse)\b/,
      record: /\b(steak|steakhouse|churrasco)\b/,
    },
    {
      query: /\b(pasta|italian)\b/,
      record: /\b(pasta|italian|trattoria|osteria)\b/,
    },
    {
      query: /\b(ramen)\b/,
      record: /\b(ramen|noodle|noodles)\b/,
    },
    {
      query: /\b(bbq|barbecue)\b/,
      record: /\b(bbq|barbecue|barbeque|smoked)\b/,
    },
  ];

  const requestedSpecificGroups = foodGroups.filter((group) =>
    group.query.test(normalizedQuery),
  );

  if (requestedSpecificGroups.length) {
    return requestedSpecificGroups.some((group) => group.record.test(text));
  }

  return /\b(restaurant|food|dining|lunch|dinner|brunch|breakfast|menu|kitchen|grill|bar and grill|bar & grill|gastropub|pub|tavern)\b/.test(
    text,
  );
}

function isActivityTypedLocation(item: EnterpriseLocation) {
  return (
    /\b(activity|activities)\b/.test(
      String(item.location_type ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((item as any).source_table ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((item as any).type ?? "").toLowerCase(),
    )
  );
}

function isStrongFoodRestaurantRecoveryCard(
  item: EnterpriseLocation,
  query: string,
) {
  if (shouldSuppressWeakFoodRestaurantCard(item, query)) return false;
  if (isActivityTypedLocation(item)) return false;

  const text = textFromLocationForRanking(item);
  const hasRestaurantIdentity = Boolean(
    item.restaurant_name ||
    item.cuisine ||
    (item as any).cuisine_type ||
    (item as any).food_type ||
    /\b(restaurant|restaurants|dining|eatery|bistro|cafe|bakery|steakhouse|bar and grill|bar & grill|gastropub|american restaurant|seafood restaurant|mexican restaurant|italian restaurant|sushi restaurant|chicken restaurant)\b/.test(
      text,
    ),
  );

  if (!hasRestaurantIdentity) return false;
  if (!requestedFoodSignalMatches(item, query)) return false;

  const nightlifeOnly =
    /\b(nightlife|hookah|shisha|nightclub|night club|cigar|speakeasy|lounge)\b/.test(
      text,
    ) &&
    !/\b(chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos?|burger|burgers|steak|pasta|ramen|bbq|barbecue|bar food|kitchen|grill|restaurant|food|menu)\b/.test(
      text,
    );

  return !nightlifeOnly;
}

function foodRecoveryRankingScore(
  item: EnterpriseLocation,
  query: string,
  requestedBorough?: string | null,
) {
  const text = textFromLocationForRanking(item);
  const queryText = String(query ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " " );

  let score = Number((item as any).match_score ?? 0);

  const nameText = [item.name, item.restaurant_name]
    .filter(Boolean)
    .join(" " )
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " " );
  const cuisineText = [
    item.cuisine,
    (item as any).cuisine_type,
    (item as any).primary_category,
    (item as any).food_type,
  ]
    .filter(Boolean)
    .join(" " )
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " " );

  const requestedChicken = /\b(chicken|wings|fried chicken|hot chicken)\b/.test(
    queryText,
  );
  if (requestedChicken) {
    if (/\b(chicken|fried chicken|hot chicken|bb\.?q chicken|mad for chicken|charles pan fried chicken|fluffies hot chicken)\b/.test(nameText)) {
      score += 900;
    }
    if (/\b(fried chicken|hot chicken|chicken restaurant|bbq chicken|korean chicken)\b/.test(text)) {
      score += 450;
    }
    if (/\b(fried chicken|hot chicken|chicken)\b/.test(cuisineText)) {
      score += 350;
    }
    if (/\bwings?\b/.test(text)) {
      score += 120;
    }
    if (/\b(dive|bar and grill|bar & grill|pub|tavern|sports bar)\b/.test(nameText)) {
      score -= 260;
    }
    if (/\b(lounge|nightlife|cocktails|beer|wine|happy hour)\b/.test(text) && !/\b(chicken)\b/.test(nameText)) {
      score -= 120;
    }
  }

  if (requestedBorough) {
    const boroughText = String(item.borough || item.city || item.neighborhood || "")
      .toLowerCase()
      .replaceAll("_", " ")
      .replaceAll("-", " " );
    if (boroughText.includes(String(requestedBorough).toLowerCase())) {
      score += 180;
    } else {
      score -= 60;
    }
  }

  const distance = Number(
    (item as any).distance_miles ?? (item as any).distance ?? Number.NaN,
  );
  if (Number.isFinite(distance)) {
    score -= Math.max(0, distance) * 8;
  }

  score += Number((item as any).restaurantOutingFitScore ?? 0) * 1.25;
  score += Number((item as any).quality_rank_score ?? 0) * 0.1;

  return score;
}

function withFoodRecoveryLabel(
  item: EnterpriseLocation,
  requestedBorough?: string | null,
) {
  if (!requestedBorough) {
    return {
      ...item,
      search_recovery_reason: "food_forward_restaurant_recovery",
      _marketFitBucket: (item as any)._marketFitBucket ?? "fallback",
      _marketFitReason:
        (item as any)._marketFitReason ?? "food_forward_restaurant_recovery",
      _marketFitLabel: (item as any)._marketFitLabel ?? "Recommended nearby",
    } as EnterpriseLocation;
  }

  const itemBorough = String(
    item.borough || item.city || item.neighborhood || "",
  ).toLowerCase();
  const isRequestedBorough = itemBorough.includes(
    String(requestedBorough).toLowerCase(),
  );

  return {
    ...item,
    search_recovery_reason: "food_forward_restaurant_recovery",
    _marketFitBucket: isRequestedBorough
      ? ((item as any)._marketFitBucket ?? "requested")
      : "nearby",
    _marketFitReason: isRequestedBorough
      ? ((item as any)._marketFitReason ?? "allowed_for_requested_market")
      : "food_forward_nearby_recovery_after_weak_local_results",
    _marketFitLabel: isRequestedBorough
      ? ((item as any)._marketFitLabel ?? null)
      : "Recommended nearby",
  } as EnterpriseLocation;
}

async function applyIntentBoostsToLocations(
  items: EnterpriseLocation[],
  query: string,
  market?: string | null,
  flags = mlFlags(),
  domain?: SearchDomain,
) {
  const classification = classifySearchIntent(query);
  let buckets = getRankingIntentBuckets(classification);
  const currentLocationIntent =
    /\b(near me|near my location|around me|in my area)\b/i.test(query);
  if (!currentLocationIntent && buckets.includes("near_me" as any)) {
    buckets = buckets.map((bucket: any) =>
      bucket === "near_me" ? "nearby_pair" : bucket,
    ) as any;
    classification.secondaryIntents = classification.secondaryIntents.filter(
      (intent: any) => intent !== "near_me",
    );
  }
  if (!flags.mlEnabled) return items;
  const ids = items
    .map((item) => idString(item.id))
    .filter((id): id is string => Boolean(id));
  const scoreMap = await getLocationIntentScoreMap({
    locationIds: ids,
    intentBuckets: buckets,
    market: market ?? null,
  });
  return items
    .map((item, index) => {
      const id = idString(item.id);
      let matched: string | null = null;
      let score = 0;
      const matchedFields: string[] = [];
      if (id) {
        for (const bucket of buckets) {
          const value = scoreMap.get(`${id}:${bucket}`);
          if (value != null) {
            score = Math.max(0, Number(value));
            matched = bucket;
            matchedFields.push("trained_intent_scores");
            break;
          }
        }
      }
      if (flags.phase2Enabled) {
        const haystack = [
          item.name,
          item.restaurant_name,
          item.activity_name,
          item.location_type,
          (item as any).cuisine,
          (item as any).cuisine_type,
          (item as any).category,
          (item as any).primary_category,
          (item as any).primary_tag,
          (item as any).activity_type,
          (item as any).tags,
          (item as any).semantic_tags,
          (item as any).intent_tags,
          (item as any).search_keywords,
          (item as any).vibe_tags,
          (item as any).date_style_tags,
          (item as any).special_features,
          (item as any).best_for_tags,
          (item as any).best_for,
          (item as any).search_document,
          (item as any).semantic_search_text,
          (item as any).description,
          (item as any).review_keywords,
        ]
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .replace(/[\s_-]+/g, " ");
        for (const bucket of buckets) {
          const term = bucket.replace(/_/g, " ");
          const synonyms =
            bucket === "hookah"
              ? ["hookah", "shisha", "hookah lounge"]
              : bucket === "live_music"
                ? ["live music", "jazz", "dj", "band"]
                : bucket === "rooftop"
                  ? ["rooftop", "skyline", "views"]
                  : [term];
          const hit = synonyms.find((candidate) =>
            haystack.includes(candidate),
          );
          if (hit) {
            const weight = bucket === classification.primaryIntent ? 18 : 10;
            score += weight;
            matched = matched ?? bucket;
            matchedFields.push(hit);
          }
        }
      }
      const intentBoost = flags.phase2Enabled ? Math.min(12, score * 0.12) : 0;
      const existingMlBoost = flags.phase1Enabled
        ? Math.min(
            13,
            Math.max(0, Number((item as any).ml_boost ?? item.ml_score ?? 0)),
          )
        : 0;
      const cappedBoost = Math.min(25, intentBoost + existingMlBoost);
      const restaurantFoodActivityPenalty =
        activityNightlifeRestaurantMlPenalty(item, query, domain);
      const mlPhase2SortScore =
        (items.length - index) * 100 +
        cappedBoost +
        restaurantFoodActivityPenalty;
      return {
        ...item,
        intent_score: score || null,
        intent_boost: Number(intentBoost.toFixed(2)),
        primary_intent: classification.primaryIntent,
        matched_intents: matched ? [matched] : [],
        phase2MatchedFields: matchedFields,
        phase2IntentReason: matchedFields.length
          ? `Matched ${matchedFields.slice(0, 3).join(", ")}`
          : null,
        search_boost: Number(item.search_boost ?? 0) + cappedBoost,
        restaurant_food_activity_penalty: restaurantFoodActivityPenalty,
        _mlPhase2SortScore: mlPhase2SortScore,
        _mlDebugBaseRank: index + 1,
        _mlDebugBaseScore:
          Number((item as any).match_score ?? item.search_score ?? 0) || null,
        _mlDebugPhase1Boost: Number(existingMlBoost.toFixed(2)),
        _mlDebugTotalBoost: Number(cappedBoost.toFixed(2)),
        _mlDebugRankingBuckets: buckets,
        _mlDebugSecondaryIntents: classification.secondaryIntents,
      } as EnterpriseLocation;
    })
    .sort(
      (a, b) =>
        Number((b as any)._mlPhase2SortScore ?? 0) -
        Number((a as any)._mlPhase2SortScore ?? 0),
    );
}

export function buildMlRankDelta(baseRank: number, finalRank: number) {
  return baseRank - finalRank;
}

function locationLabel(item: EnterpriseLocation) {
  return item.name || item.restaurant_name || item.activity_name || null;
}

function createMlResultDebug(
  item: EnterpriseLocation,
  finalRank: number,
): MlResultDebug {
  const record = item as any;
  const baseRank = Number(record._mlDebugBaseRank || finalRank);
  const totalMlBoost = Number(record._mlDebugTotalBoost ?? 0);
  const rankDelta = buildMlRankDelta(baseRank, finalRank);
  return {
    id: String(item.id ?? ""),
    name: locationLabel(item),
    location_type: item.location_type ?? null,
    market: item.market ?? null,
    baseScore: record._mlDebugBaseScore ?? null,
    finalScore:
      Number(
        record._mlPhase2SortScore ??
          record.search_score ??
          record.match_score ??
          0,
      ) || null,
    baseRank,
    finalRank,
    rankDelta,
    phase1MlScore: item.ml_score ?? null,
    phase1MlBoost: record._mlDebugPhase1Boost ?? item.ml_boost ?? null,
    primaryIntent: item.primary_intent ?? null,
    secondaryIntents: record._mlDebugSecondaryIntents ?? [],
    rankingIntentBuckets: record._mlDebugRankingBuckets ?? [],
    phase2IntentScore: item.intent_score ?? null,
    phase2IntentBoost: item.intent_boost ?? null,
    matchedIntentBucket: Array.isArray(item.matched_intents)
      ? (item.matched_intents[0] ?? null)
      : null,
    phase2PairScore: null,
    phase2PairBoost: record.phase2PairBoost ?? null,
    totalMlBoost,
    phase2MatchedFields: record.phase2MatchedFields ?? [],
    phase2IntentReason: record.phase2IntentReason ?? null,
    mlChangedRank: rankDelta !== 0,
    mlDebugReason:
      totalMlBoost > 0
        ? "ML boost applied and capped before final admin ranking."
        : "No matching ML score boost applied.",
  };
}

function summarizeMlDebug(
  results: MlResultDebug[],
  query: string,
  phase1Loaded: number,
  phase2Loaded: number,
): MlSearchDebug {
  const flags = mlFlags();
  const classification = classifySearchIntent(query);
  const boosts = results.map((r) => Number(r.totalMlBoost ?? 0));
  const boosted = boosts.filter((v) => v > 0);
  return {
    mlEnabled: flags.mlEnabled,
    phase1Enabled: flags.phase1Enabled,
    phase2Enabled: flags.phase2Enabled,
    mlFeatureFlags: flags,
    mlAppliedInPublicPath: true,
    publicSearchUsesMl: flags.mlEnabled,
    enterpriseSearchUsed: true,
    edgeSearchUsed: false,
    edgeSearchUsesMl: false,
    intentClassification: {
      primaryIntent: classification.primaryIntent,
      secondaryIntents: classification.secondaryIntents,
      allIntents: classification.allIntents,
      confidence: classification.confidence,
      reason: classification.reason,
      inferredSearchMode: classification.inferredSearchMode,
      intentGroups: classification.intentGroups,
    },
    mlPhase2Intent: classification,
    primaryIntent: classification.primaryIntent,
    secondaryIntents: classification.secondaryIntents,
    allIntents: classification.allIntents,
    intentGroups: classification.intentGroups,
    intentClassificationReason: classification.reason,
    inferredSearchMode: classification.inferredSearchMode,
    rankingIntentBuckets: getRankingIntentBuckets(classification),
    phase2Source: flags.phase2Enabled
      ? "deterministic_intent_rules"
      : "disabled",
    phase2FallbackUsed: flags.phase2Enabled,
    phase2FallbackReason: flags.phase2Enabled
      ? "trained Phase 2 scores are optional; deterministic intent rules are active"
      : "ML_PHASE2_ENABLED=false",
    mlPhase2UnavailableReason: flags.phase2Enabled
      ? null
      : "ML_PHASE2_ENABLED=false",
    mlUnavailableReason: !flags.mlEnabled ? "ML_ENABLED=false" : null,
    resultOrderChangedByMl: results.some((r) => r.mlChangedRank),
    phase2IntentScoresLoaded: phase2Loaded,
    phase2IntentBoostedCount: results.filter(
      (r) => Number(r.phase2IntentBoost ?? 0) > 0,
    ).length,
    maxPhase2IntentBoost: Math.max(
      0,
      ...results.map((r) => Number(r.phase2IntentBoost ?? 0)),
    ),
    averagePhase2IntentBoost: results.length
      ? Number(
          (
            results.reduce(
              (sum, r) => sum + Number(r.phase2IntentBoost ?? 0),
              0,
            ) / results.length
          ).toFixed(2),
        )
      : 0,
    resultsWithMlBoostCount: boosted.length,
    resultsWithPhase1BoostCount: results.filter(
      (r) => Number(r.phase1MlBoost ?? 0) > 0,
    ).length,
    resultsWithPhase2IntentBoostCount: results.filter(
      (r) => Number(r.phase2IntentBoost ?? 0) > 0,
    ).length,
    resultsWithPhase2PairBoostCount: results.filter(
      (r) => Number(r.phase2PairBoost ?? 0) > 0,
    ).length,
    maxMlBoostApplied: boosted.length ? Math.max(...boosted) : 0,
    averageMlBoostApplied: boosted.length
      ? Number(
          (
            boosted.reduce((sum, value) => sum + value, 0) / boosted.length
          ).toFixed(2),
        )
      : 0,
    results,
  };
}

async function applyPairBoosts(
  pairs: EnterprisePair[],
  query: string,
  market?: string | null,
  flags = mlFlags(),
) {
  const classification = classifySearchIntent(query);
  let buckets = getRankingIntentBuckets(classification);
  const currentLocationIntent =
    /\b(near me|near my location|around me|in my area)\b/i.test(query);
  if (!currentLocationIntent && buckets.includes("near_me" as any)) {
    buckets = buckets.map((bucket: any) =>
      bucket === "near_me" ? "nearby_pair" : bucket,
    ) as any;
    classification.secondaryIntents = classification.secondaryIntents.filter(
      (intent: any) => intent !== "near_me",
    );
  }
  if (!flags.mlEnabled || !flags.phase2Enabled) return pairs;
  const pairKeys = pairs
    .map((pair) => ({
      restaurantLocationId: String(pair.restaurant.id ?? ""),
      activityLocationId: String(pair.activity.id ?? ""),
    }))
    .filter((p) => p.restaurantLocationId && p.activityLocationId);
  const scoreMap = await getPairScoreMap({
    pairKeys,
    intentBuckets: buckets,
    market: market ?? null,
  });
  return pairs
    .map((pair) => {
      let matched: string | null = null;
      let score = 0;
      for (const bucket of buckets) {
        const value = scoreMap.get(
          `${pair.restaurant.id}:${pair.activity.id}:${bucket}`,
        );
        if (value != null) {
          score = Math.max(0, Number(value));
          matched = bucket;
          break;
        }
      }
      if (!score)
        score = Math.max(
          0,
          12 -
            Math.min(
              8,
              Number(
                (pair as any).distance_miles ??
                  (pair as any).pairDistanceMiles ??
                  4,
              ),
            ),
        );
      const pairBoost = Math.min(15, score * 0.15);
      return {
        ...pair,
        pair_ml_score: score || null,
        pair_boost: Number(pairBoost.toFixed(2)),
        phase2PairScore: score || null,
        phase2PairBoost: Number(pairBoost.toFixed(2)),
        phase2PairReason: matched
          ? `Trained pair intent bucket ${matched}`
          : "Deterministic pair compatibility and proximity",
        phase2PairMatchedIntents: matched ? [matched] : buckets.slice(0, 3),
        phase2PairDistanceSignal:
          (pair as any).distance_miles ??
          (pair as any).pairDistanceMiles ??
          null,
        phase2PairCompatibilitySignal: score ? "compatible" : null,
        primary_intent: classification.primaryIntent,
        matched_intents: matched ? [matched] : [],
        score: pair.score + pairBoost,
        pairScore: pair.pairScore + pairBoost,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function serializeErrorForDebug(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  try {
    return {
      message: JSON.stringify(error),
      rawType: typeof error,
    };
  } catch {
    return {
      message: String(error),
      rawType: typeof error,
    };
  }
}

function errorMessageForDebug(error: unknown) {
  const serialized = serializeErrorForDebug(error);
  return serialized.message || String(error);
}
function hasUsableLivePhoto(location: EnterpriseLocation) {
  return hasUsableSearchPhoto(location);
}

function filterLivePhotoResults(items: EnterpriseLocation[]) {
  return items.filter(hasUsableLivePhoto);
}

function rejectionSummary(
  records: EnterpriseLocation[],
  intent: SearchIntent,
  domain: "restaurant" | "activity",
) {
  return records.reduce<Record<string, number>>((acc, record) => {
    const reason = explainRejection(record, intent, domain);

    if (reason) {
      acc[reason] = (acc[reason] || 0) + 1;
    }

    return acc;
  }, {});
}

function uniqueById(items: EnterpriseLocation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const name = String(
      item.name ?? item.restaurant_name ?? item.activity_name ?? "",
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const address = String(item.address ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const key =
      item.id != null && String(item.id).trim()
        ? `id:${String(item.id).trim()}`
        : name || address
          ? `name_address:${name}|${address}`
          : `unknown:${Math.random()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type MarketFitBucket = "requested" | "nearby" | "fallback";

function classifyMarketFit(
  item: EnterpriseLocation,
  requestedMarket?: string | null,
): {
  bucket: MarketFitBucket;
  reason: string;
  label: string | null;
} {
  const record = item as any;
  const market = String(record.market ?? "").toUpperCase();
  const state = String(record.state ?? "").toUpperCase();
  const county = String(record.county ?? "").toLowerCase();

  if (requestedMarket === "LONG_ISLAND") {
    if (
      market === "LONG_ISLAND" ||
      (state === "NY" && ["nassau", "suffolk"].includes(county))
    ) {
      return {
        bucket: "requested",
        reason: "long_island_market_or_nassau_suffolk",
        label: null,
      };
    }

    if (state === "NY" || state === "NJ") {
      return {
        bucket: "nearby",
        reason: "nearby_region_for_long_island_request",
        label: "Near your requested location",
      };
    }

    return {
      bucket: "fallback",
      reason: "fallback_region_for_long_island_request",
      label: "Recommended nearby",
    };
  }

  if (
    requestedMarket &&
    isResultAllowedForResolvedMarket(item, requestedMarket)
  ) {
    return {
      bucket: "requested",
      reason: "allowed_for_requested_market",
      label: null,
    };
  }

  return {
    bucket: requestedMarket ? "nearby" : "fallback",
    reason: requestedMarket
      ? "nearby_region_for_requested_market"
      : "no_requested_market",
    label: requestedMarket
      ? "Near your requested location"
      : "Recommended nearby",
  };
}

function withMarketFit(
  item: EnterpriseLocation,
  requestedMarket?: string | null,
): EnterpriseLocation {
  const fit = classifyMarketFit(item, requestedMarket);

  return {
    ...item,
    _marketFitBucket: fit.bucket,
    _marketFitReason: fit.reason,
    _marketFitLabel: fit.label,
  } as EnterpriseLocation;
}

function hasPairConstraint(intent: SearchIntent) {
  return Boolean(
    intent.pairingPreference && intent.pairingPreference.distanceMode !== "any",
  );
}
function isRooftopDrinksIntent(intent: SearchIntent) {
  return (
    /\brooftop\s+(drinks?|cocktails?|bar|lounge)|\b(rooftop drinks|rooftop bar|rooftop lounge)\b/i.test(
      intent.rawQuery,
    ) ||
    intent.activityIntent.activityTerms.some((term) =>
      ["rooftop drinks", "rooftop bar", "rooftop lounge"].includes(
        term.toLowerCase(),
      ),
    )
  );
}
const ROOFTOP_ACTIVITY_RECOVERY_TERMS = [
  "rooftop",
  "rooftop bar",
  "rooftop lounge",
  "drinks",
  "cocktails",
  "bar",
  "lounge",
];
const BAR_ACTIVITY_RECOVERY_TERMS = ["bar", "lounge", "cocktails", "drinks"];
const RESTAURANT_FEATURE_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "brunch",
  "lunch",
  "rooftop",
  "roof top",
  "rooftop restaurant",
  "rooftop dining",
  "roof deck",
  "terrace",
  "patio",
  "outdoor dining",
  "outdoor seating",
  "skyline",
  "skyline views",
  "scenic views",
  "views",
  "waterfront",
  "waterfront views",
  "live music",
];

const RESTAURANT_GENERIC_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "brunch",
  "lunch",
  "food",
];

const GENERIC_MEAL_RESTAURANT_RECOVERY_TERMS = new Set([
  "dinner",
  "lunch",
  "brunch",
  "breakfast",
  "food",
  "restaurant",
  "dining",
  "meal",
  "eat",
  "eats",
]);

const GENERIC_MEAL_RESTAURANT_RECOVERY_EXPANSIONS: Record<string, string[]> = {
  dinner: ["restaurant", "dinner", "dining", "food", "date night"],
  brunch: [
    "brunch",
    "restaurant",
    "brunch spot",
    "breakfast",
    "mimosas",
    "food",
  ],
  lunch: ["lunch", "restaurant", "dining", "lunch spot", "food"],
  breakfast: ["breakfast", "brunch", "cafe", "coffee", "restaurant", "food"],
  food: ["food", "restaurant", "dining", "dinner", "lunch"],
};

const RESTAURANT_ROOFTOP_FEATURE_ONLY_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "rooftop",
  "rooftop restaurant",
  "rooftop dining",
  "terrace",
  "skyline",
  "skyline views",
  "views",
  "outdoor dining",
];

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function restaurantFoodCuisineTerms(intent: SearchIntent): string[] {
  return uniqueStrings([
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
  ]);
}

function genericMealRestaurantTerms(intent: SearchIntent): string[] {
  return uniqueStrings([
    ...restaurantSearchTerms(intent),
    ...(intent.restaurantIntent?.mealTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
  ]).filter((term) => GENERIC_MEAL_RESTAURANT_RECOVERY_TERMS.has(term));
}

function mixedOutingGenericMealRecoveryTerms(intent: SearchIntent): string[] {
  const terms = genericMealRestaurantTerms(intent);
  if (
    intent.searchType !== "mixed_outing" ||
    intent.needsRestaurant !== true ||
    intent.needsActivity !== true ||
    terms.length === 0
  ) {
    return [];
  }

  const currentRestaurantTerms = restaurantSearchTerms(intent);
  const hasCuisine = (intent.restaurantIntent?.cuisineTerms ?? []).length > 0;
  const onlyGenericMeal =
    !hasCuisine &&
    currentRestaurantTerms.some((term) =>
      GENERIC_MEAL_RESTAURANT_RECOVERY_TERMS.has(term),
    );
  if (!onlyGenericMeal) return [];

  return uniqueStrings([
    ...terms,
    ...terms.flatMap(
      (term) =>
        GENERIC_MEAL_RESTAURANT_RECOVERY_EXPANSIONS[term] ??
        (term === "meal" ||
        term === "eat" ||
        term === "eats" ||
        term === "dining" ||
        term === "restaurant"
          ? GENERIC_MEAL_RESTAURANT_RECOVERY_EXPANSIONS.food
          : [term]),
    ),
  ]);
}

function restaurantFeatureTerms(intent: SearchIntent): string[] {
  return uniqueStrings([
    ...(intent.restaurantIntent?.featureTerms ?? []),
    ...(intent.restaurantIntent?.vibeTerms ?? []),
  ]);
}

function hasRestaurantFeatureIntent(intent: SearchIntent): boolean {
  if (!intent.needsRestaurant || intent.needsActivity) return false;

  const q = String(intent.rawQuery || "").toLowerCase();
  const features = restaurantFeatureTerms(intent).join(" ");

  return (
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|skyline views|scenic views|waterfront|waterfront views|views|live music)\b/i.test(
      q,
    ) ||
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|scenic views|waterfront|views|live music)\b/i.test(
      features,
    )
  );
}

function cloneIntentForRestaurantRecovery(
  intent: SearchIntent,
  options: {
    relaxFood?: boolean;
    relaxFeature?: boolean;
    strictness?: SearchIntent["strictness"];
  },
): SearchIntent {
  return {
    ...intent,
    strictness: options.strictness ?? intent.strictness,
    restaurantIntent: {
      ...intent.restaurantIntent,
      foodTerms: options.relaxFood ? [] : intent.restaurantIntent.foodTerms,
      cuisineTerms: options.relaxFood
        ? []
        : intent.restaurantIntent.cuisineTerms,
      featureTerms: options.relaxFeature
        ? []
        : intent.restaurantIntent.featureTerms,
    },
  } as SearchIntent;
}

function buildGenericRestaurantRecoveryAttempts(intent: SearchIntent) {
  if (!intent.needsRestaurant) return [];

  const foodCuisineTerms = restaurantFoodCuisineTerms(intent);
  const featureTerms = restaurantFeatureTerms(intent);
  const hasFoodCuisine = foodCuisineTerms.length > 0;
  const hasFeature = hasRestaurantFeatureIntent(intent);

  const hasOnlyGenericRestaurantFoodCuisine =
    foodCuisineTerms.length === 0 ||
    foodCuisineTerms.every((term) => ["restaurant"].includes(term));
  const hasRooftopFeatureOnlySafety =
    intent.primaryDomain === "restaurant" &&
    intent.needsRestaurant === true &&
    hasOnlyGenericRestaurantFoodCuisine &&
    hasRooftopRestaurantFeatureLanguage(intent.rawQuery || "");

  if (!hasFoodCuisine && !hasFeature && !hasRooftopFeatureOnlySafety) return [];

  const attempts: {
    reason: string;
    terms: string[];
    relaxFood?: boolean;
    relaxFeature?: boolean;
    strictness?: SearchIntent["strictness"];
  }[] = [];

  const mixedGenericMealTerms = mixedOutingGenericMealRecoveryTerms(intent);
  if (mixedGenericMealTerms.length) {
    attempts.push({
      reason: "mixed_outing_generic_meal_restaurant_recovery",
      terms: mixedGenericMealTerms,
      strictness: "medium",
    });
  }

  if (hasRooftopFeatureOnlySafety) {
    attempts.push({
      reason: "restaurant_rooftop_feature_only_recovery",
      terms: uniqueStrings(RESTAURANT_ROOFTOP_FEATURE_ONLY_RECOVERY_TERMS),
      relaxFood: true,
      strictness: "medium",
    });
  }

  if (hasFoodCuisine && hasFeature) {
    attempts.push({
      reason: "restaurant_food_feature_combined_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
        ...featureTerms,
      ]),
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_food_first_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
      ]),
      relaxFeature: true,
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_feature_first_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS.filter((term) =>
          featureTerms.some(
            (feature) => term.includes(feature) || feature.includes(term),
          ),
        ),
      ]),
      relaxFood: true,
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_generic_feature_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS,
      ]),
      relaxFood: true,
      strictness: "medium",
    });

    return attempts;
  }

  if (hasFeature) {
    attempts.push({
      reason: "restaurant_feature_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS,
      ]),
      relaxFood: true,
      strictness: "medium",
    });
  }

  if (hasFoodCuisine) {
    attempts.push({
      reason: "restaurant_food_cuisine_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
      ]),
      relaxFeature: true,
      strictness: "medium",
    });
  }

  return attempts;
}

function hasExactNeighborhoodOnlyLanguage(rawQuery: string): boolean {
  return /\b(only|must be in|inside|strictly in|nothing outside|no outside|only in)\b/i.test(
    rawQuery || "",
  );
}

function shouldRunNeighborhoodRestaurantFallback(args: {
  rawQuery?: string;
  primaryDomain?: string;
  needsRestaurant?: boolean;
  needsActivity?: boolean;
  wantsPairing?: boolean;
  restaurantCount?: number;
  geo?: any;
}) {
  return (
    args.primaryDomain === "restaurant" &&
    args.needsRestaurant === true &&
    args.needsActivity !== true &&
    args.wantsPairing !== true &&
    Number(args.restaurantCount || 0) === 0 &&
    args.geo?.geoStrictness === "strict" &&
    Boolean(args.geo?.neighborhood) &&
    Boolean(args.geo?.borough) &&
    !hasExactNeighborhoodOnlyLanguage(args.rawQuery || "")
  );
}

function buildBoroughRestaurantFallbackGeo(geo: any) {
  const resolvedBoroughGeo = geo?.borough
    ? detectGeoIntent(String(geo.borough))
    : null;
  const resolvedRadius = Number(resolvedBoroughGeo?.radiusMiles ?? 0);
  const originalRadius = Number(geo?.radiusMiles ?? 0);

  return {
    ...geo,
    ...(resolvedBoroughGeo ?? {}),
    raw: geo?.borough ?? resolvedBoroughGeo?.raw ?? null,
    neighborhood: null,
    city: resolvedBoroughGeo?.city || geo?.city || "New York",
    borough: geo?.borough ?? resolvedBoroughGeo?.borough ?? null,
    county: resolvedBoroughGeo?.county ?? geo?.county,
    state: resolvedBoroughGeo?.state || geo?.state || "NY",
    latitude: resolvedBoroughGeo?.latitude ?? geo?.latitude ?? null,
    longitude: resolvedBoroughGeo?.longitude ?? geo?.longitude ?? null,
    radiusMiles: Math.max(originalRadius, resolvedRadius, 10),
    geoStrictness: "medium",
  };
}

function budgetIntentDetected(intent: SearchIntent) {
  return /\b(cheap|affordable|budget|under\s*\$?100|low cost|inexpensive)\b/i.test(
    `${intent.rawQuery || ""} ${intent.budget || ""}`,
  );
}

function activityRecoveryAttempts(
  intent: SearchIntent,
): { reason: string; terms: string[]; level: string }[] {
  const q = String(intent.rawQuery || "").toLowerCase();
  const terms = uniqueStrings([
    ...(intent.activityIntent?.activityTerms ?? []),
    ...(intent.activityIntent?.categoryTerms ?? []),
  ]);
  const attempts: { reason: string; terms: string[]; level: string }[] = [];
  const add = (reason: string, level: string, values: string[]) =>
    attempts.push({ reason, level, terms: uniqueStrings(values) });
  if (/karaoke/.test(q))
    add("activity_karaoke_recovery", "specific", [
      "karaoke",
      "karaoke bar",
      "karaoke lounge",
      "bar",
      "lounge",
    ]);
  if (/hookah|shisha/.test(q))
    add("activity_hookah_recovery", "specific", [
      "hookah",
      "hookah lounge",
      "shisha",
      "lounge",
      "bar",
      "nightlife",
    ]);
  if (/pool hall|billiards|pool table/.test(q))
    add("activity_billiards_recovery", "specific", [
      "pool hall",
      "billiards",
      "pool table",
      "games",
      "bar",
      "lounge",
    ]);
  if (/bowling/.test(q))
    add("activity_bowling_recovery", "specific", [
      "bowling",
      "bowling alley",
      "bowling lanes",
      "games",
      "entertainment",
    ]);
  if (/comedy|stand ?up|improv/.test(q))
    add("activity_comedy_recovery", "specific", [
      "comedy club",
      "comedy show",
      "stand up comedy",
      "improv",
      "theater",
      "live entertainment",
      "nightlife",
    ]);
  if (/arcade/.test(q))
    add("activity_arcade_recovery", "specific", [
      "arcade",
      "games",
      "game room",
      "entertainment",
      "bowling",
      "mini golf",
    ]);
  if (/family|kid|kids/.test(q))
    add("activity_family_recovery", "broad", [
      "family friendly",
      "kid friendly",
      "museum",
      "bowling",
      "arcade",
      "park",
      "zoo",
      "aquarium",
      "activity",
      "entertainment",
    ]);
  if (/romantic|date/.test(q))
    add("activity_romantic_recovery", "broad", [
      "date activity",
      "date idea",
      "museum",
      "gallery",
      "live music",
      "jazz",
      "lounge",
      "dessert",
      "park",
    ]);
  if (/outdoor/.test(q))
    add("activity_outdoor_recovery", "broad", [
      "outdoor activity",
      "park",
      "garden",
      "waterfront",
      "pier",
      "walking tour",
      "boat ride",
      "observation deck",
    ]);
  if (terms.length) add("activity_original_relaxed_recovery", "strict", terms);
  add("activity_entertainment_recovery", "broad", [
    "entertainment",
    "activity",
    "things to do",
    "nightlife",
    "games",
    "lounge",
  ]);
  return attempts;
}

function cloneIntentForActivityRecovery(intent: SearchIntent): SearchIntent {
  return {
    ...intent,
    strictness: "medium",
    activityIntent: {
      ...intent.activityIntent,
      alternativeGroups: [],
    },
  } as SearchIntent;
}

function requiresStrictMixedPair(intent: SearchIntent) {
  return (
    intent.searchType === "mixed_outing" &&
    intent.wantsPairing === true &&
    intent.needsRestaurant === true &&
    intent.needsActivity === true &&
    intent.pairingPreference?.requiresPairing === true
  );
}

export function requiredPairingFailureReason(
  restaurantCount: number,
  activityCount: number,
  pairCount: number,
  intent: SearchIntent,
) {
  if (pairCount > 0) return null;
  if (activityCount === 0) return "no_activity_results_for_required_pair";
  if (restaurantCount === 0 && intent.needsRestaurant !== false && intent.searchType !== "activity_pair") return "no_restaurant_results_for_required_pair";
  if (
    intent.pairingPreference?.requireWalkablePair === true ||
    intent.pairingPreference?.distanceMode === "walking" ||
    intent.pairingPreference?.distanceMode === "short_walk"
  ) {
    return "no_walkable_pair_found";
  }
  return "no_valid_required_pair";
}

function areaLabel(intent: SearchIntent) {
  return (
    intent.geo.neighborhood ??
    intent.geo.borough ??
    intent.geo.city ??
    intent.geo.county ??
    intent.geo.raw ??
    "that area"
  );
}

function mixedOutingMealLabel(intent: SearchIntent) {
  const terms = [
    ...(intent.restaurantIntent?.mealTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    intent.rawQuery,
  ]
    .map((term) => String(term ?? "").toLowerCase())
    .join(" ");
  if (/\bbrunch\b/.test(terms)) return "brunch";
  if (/\bbreakfast\b/.test(terms)) return "breakfast";
  if (/\blunch\b/.test(terms)) return "lunch";
  if (/\bdinner\b/.test(terms)) return "dinner";
  return "food";
}

function replyFor(
  restaurants: EnterpriseLocation[],
  activities: EnterpriseLocation[],
  pairs: ReturnType<typeof createSearchPairs>,
  intent: SearchIntent,
  neighborhoodRecovery?: {
    used: boolean;
    from: string | null;
    to: string | null;
  },
) {
  if (intent.wantsPairing) {
    const constrained = hasPairConstraint(intent);
    const walkableWord =
      intent.pairingPreference?.distanceMode === "same_area"
        ? "same-area"
        : "walkable";
    if (pairs.length)
      return constrained
        ? `I found ${walkableWord} ${mixedOutingMealLabel(intent)} + activity pairings near ${areaLabel(intent)}.`
        : "Found restaurant and activity options that match your outing.";
    if (restaurants.length && activities.length) {
      const maxWalkingMinutes = intent.pairingPreference?.maxPairWalkingMinutes;
      if (
        constrained &&
        Number.isFinite(Number(maxWalkingMinutes)) &&
        (intent.pairingPreference?.distanceMode === "walking" ||
          intent.pairingPreference?.distanceMode === "short_walk" ||
          intent.pairingPreference?.requireWalkablePair === true)
      ) {
        return `No valid pairs were found within a ${Number(maxWalkingMinutes)}-minute walk.`;
      }
      return constrained
        ? "I found matching restaurants and activities, but none close enough to confidently call walking distance."
        : "Found restaurant and activity options, but I could not create a confident pair yet.";
    }
    if (restaurants.length)
      return constrained
        ? "I found restaurants, but no matching walkable activity nearby."
        : `I found restaurant options near ${areaLabel(intent)}, but I couldn’t find matching activities nearby yet.`;
    if (activities.length)
      return constrained
        ? "I found activities, but no matching walkable restaurant nearby."
        : `I found activity options near ${areaLabel(intent)}, but I couldn’t find matching restaurants nearby yet.`;
  }
  if (restaurants.length) {
    const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
    if (singleVenue.matched) {
      const q = intent.rawQuery.toLowerCase();
      if (
        /\bbar\b|\bsports bar\b|\bpub\b/.test(q) &&
        /\bwings?\b|\bchicken wings\b/.test(q)
      )
        return "Here are NYC bars and sports-bar-style spots that match wings.";
      if (/\bhookah\b/.test(q))
        return "Here are restaurant-style spots that match hookah.";
      if (/\bseafood\b/.test(q) && /\blive music\b/.test(q))
        return "Here are seafood spots that also match live music.";
      return "Here are places that match both parts of your search.";
    }
    if (
      neighborhoodRecovery?.used &&
      neighborhoodRecovery.from &&
      neighborhoodRecovery.to
    ) {
      return `I couldn’t find strong matches directly in ${neighborhoodRecovery.from}, but here are nearby ${neighborhoodRecovery.to} options.`;
    }
    return "Found restaurant matches.";
  }
  if (activities.length) return "Found activity matches.";
  return "I couldn’t find strong matches for that request yet.";
}
type EnterpriseSearchOptions = {
  useLLM?: boolean;
  body?: any;
  supabase?: any;
  displayLimit?: number;
  source?: string;
  route?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  logPerformance?: boolean;
  betaDebug?: boolean;
  betaAssignmentId?: string | null;
  betaTesterId?: string | null;
  usedCustomPrompt?: boolean;
  useFastPath?: boolean;
  selectedMarketId?: string | null;
  userLocation?: UserSearchLocation | null;
  createdByUserId?: string | null;
  searchHealthDebug?: boolean;
  betaFeedbackSubmitted?: boolean;
};

export async function runEnterpriseSearch(
  query: string,
  options?: EnterpriseSearchOptions,
): Promise<EnterpriseSearchResult> {
  const startedAt = new Date();
  const started = performance.now();
  const perf = {
    total_ms: 0,
    intent_parse_ms: 0,
    llm_ms: null as number | null,
    restaurant_rpc_ms: 0,
    activity_rpc_ms: 0,
    rpc_ms: 0,
    ranking_ms: 0,
    photo_filter_ms: 0,
    pairing_ms: 0,
    route_check_ms: null as number | null,
  };
  let parsedIntent: SearchIntent | null = null;
  let usedFallback = false;
  let usedLlm = false;
  let parserDebug: Record<string, any> = {};
  try {
    const intentStart = performance.now();
    const {
      intent,
      llmIntentRaw,
      llmError,
      intentParserSource,
      fastPathMatched,
      fastPathReason,
      usedLlm: parsedWithLlm,
      debug: parsedDebug = {},
    } = await parseEnterpriseIntent(query, {
      useLLM: options?.useLLM,
      useFastPath: options?.useFastPath,
      body: options?.body,
      debug: parserDebug,
    });
    parserDebug = parsedDebug;
    usedLlm = parsedWithLlm;
    perf.intent_parse_ms =
      parserDebug.intent_parse_ms ?? performance.now() - intentStart;
    perf.llm_ms =
      parserDebug.llm_ms ??
      (usedLlm
        ? perf.intent_parse_ms
        : intentParserSource === "fast_path"
          ? 0
          : null);
    (perf as any).fast_llm_ms = parserDebug.fast_llm_ms ?? null;
    (perf as any).fallback_llm_ms = parserDebug.fallback_llm_ms ?? null;
    (perf as any).intentParserSource =
      parserDebug.intentParserSource ?? intentParserSource;
    const marketResolution = resolveSearchMarket({
      geo: intent.geo,
      selectedMarketId:
        options?.selectedMarketId ??
        options?.body?.selectedMarketId ??
        options?.body?.selected_market_id ??
        null,
      userLocation:
        options?.userLocation ??
        options?.body?.userLocation ??
        options?.body?.user_location ??
        null,
    });
    const requestNearMeDebug = {
      nearMeIntent: options?.body?.nearMeIntent === true,
      useCurrentLocation: options?.body?.useCurrentLocation === true,
      userLatitudePresent: Number.isFinite(
        Number(options?.body?.userLatitude ?? options?.body?.user_latitude),
      ),
      userLongitudePresent: Number.isFinite(
        Number(options?.body?.userLongitude ?? options?.body?.user_longitude),
      ),
      rawQueryBeforeNearMeStrip:
        typeof options?.body?.rawQueryBeforeNearMeStrip === "string"
          ? options.body.rawQueryBeforeNearMeStrip
          : query,
      rawQueryAfterNearMeStrip:
        typeof options?.body?.rawQueryAfterNearMeStrip === "string"
          ? options.body.rawQueryAfterNearMeStrip
          : query,
    };
    const hasVerifiedUserLocation =
      marketResolution.marketReason === "current_location";
    const pairProximityRequested =
      intent.pairingIntent === "nearby_pair" || /\bnearby\b/i.test(query);
    const usesCurrentLocation =
      hasVerifiedUserLocation &&
      (options?.body?.nearMeIntent === true ||
        options?.body?.useCurrentLocation === true ||
        /\b(near me|near my location|around me|in my area)\b/i.test(query));
    const geoSource = usesCurrentLocation
      ? "verified_user_location"
      : marketResolution.marketReason === "explicit_geo"
        ? "explicit_market"
        : marketResolution.marketApplied
          ? "default_market"
          : "none";
    const outingTiming = parseOutingDateTime(query, startedAt);
    const effectiveIntent: SearchIntent = {
      ...intent,
      ...outingTiming,
      geo: marketResolution.effectiveGeo,
      ...({
        usesCurrentLocation,
        hasVerifiedUserLocation,
        pairProximityRequested,
        nearbyPairIntent: pairProximityRequested && !usesCurrentLocation,
        geoSource,
      } as any),
    };
    parsedIntent = effectiveIntent;
    const debug = createRpcDebug(effectiveIntent);
    const supabase = options?.supabase ?? supabaseAdmin;
    const displayLimit = options?.displayLimit ?? 12;
    let restaurantRankingIntent = effectiveIntent;
    let restaurantRaw: EnterpriseLocation[] = [];
    let activityRaw: EnterpriseLocation[] = [];
    let activityRpcCountBeforeRecovery = 0;
    const searchRestaurantLane = async () => {
      const rpcStarted = performance.now();
      restaurantRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "restaurant",
        debug,
      );
      let filtered = filterRestaurantResults(restaurantRaw, effectiveIntent);
      if (
        filtered.length < MIN_RESTAURANT_RESULTS &&
        !(
          filtered.length > 0 &&
          effectiveIntent.needsRestaurant === true &&
          effectiveIntent.needsActivity !== true &&
          effectiveIntent.wantsPairing !== true
        ) &&
        restaurantSearchTerms(effectiveIntent).length
      ) {
        usedFallback = true;

        const restaurantRecoveryAttempts =
          buildGenericRestaurantRecoveryAttempts(effectiveIntent);

        if (restaurantRecoveryAttempts.length) {
          for (const attempt of restaurantRecoveryAttempts) {
            const recoveryIntent = cloneIntentForRestaurantRecovery(
              effectiveIntent,
              {
                relaxFood: attempt.relaxFood,
                relaxFeature: attempt.relaxFeature,
                strictness: attempt.strictness,
              },
            );
            const isMixedGenericMealRecovery =
              attempt.reason ===
              "mixed_outing_generic_meal_restaurant_recovery";
            const mixedGenericMealRecoveryStarted = Date.now();

            debug.restaurantRecoveryUsed = true;
            debug.restaurantRecoveryReason = attempt.reason;
            debug.restaurantRecoveryTermsTried = [
              ...(debug.restaurantRecoveryTermsTried ?? []),
              attempt.terms,
            ];
            debug.restaurantRecoveryRelaxedFood =
              Boolean(debug.restaurantRecoveryRelaxedFood) ||
              Boolean(attempt.relaxFood);
            debug.restaurantRecoveryRelaxedFeature =
              Boolean(debug.restaurantRecoveryRelaxedFeature) ||
              Boolean(attempt.relaxFeature);
            if (isMixedGenericMealRecovery) {
              (debug as any).mixedOutingRestaurantRecoveryAttempted = true;
              (debug as any).mixedOutingRestaurantRecoveryUsed = false;
              (debug as any).mixedOutingRestaurantRecoveryCount = 0;
              (debug as any).mixedOutingRestaurantRecoveryError = null;
            }

            let recoveredRaw: EnterpriseLocation[] = [];
            try {
              recoveredRaw = await recoverEnterpriseLane(
                supabase,
                recoveryIntent,
                "restaurant",
                debug,
                attempt.terms,
              );
            } catch (error) {
              if (isMixedGenericMealRecovery) {
                (debug as any).mixedOutingRestaurantRecoveryError =
                  error instanceof Error ? error.message : String(error);
              }
              recoveredRaw = [];
            } finally {
              if (isMixedGenericMealRecovery) {
                (debug as any).mixedOutingRestaurantRecoveryMs =
                  Date.now() - mixedGenericMealRecoveryStarted;
              }
            }

            const recoveredFiltered = filterRestaurantResults(
              recoveredRaw,
              recoveryIntent,
            );
            if (isMixedGenericMealRecovery) {
              (debug as any).mixedOutingRestaurantRecoveryCount =
                recoveredFiltered.length;
            }

            debug.restaurantRecoveryAttemptResults = [
              ...(debug.restaurantRecoveryAttemptResults ?? []),
              {
                reason: attempt.reason,
                terms: attempt.terms,
                resultCount: recoveredRaw.length,
                filteredCount: recoveredFiltered.length,
                relaxedFood: Boolean(attempt.relaxFood),
                relaxedFeature: Boolean(attempt.relaxFeature),
              },
            ];

            if (recoveredFiltered.length) {
              restaurantRaw = uniqueById([
                ...restaurantRaw,
                ...recoveredFiltered,
              ]);
              filtered = recoveredFiltered;
              restaurantRankingIntent = recoveryIntent;
              debug.restaurantRecoverySucceeded = true;
              if (isMixedGenericMealRecovery) {
                (debug as any).mixedOutingRestaurantRecoveryUsed = true;
              }
              break;
            }
          }
        }

        if (!filtered.length) {
          const recoveryTerms = restaurantSearchTerms(effectiveIntent).slice(
            0,
            RECOVERY_LIMIT,
          );
          const isMixedGenericMealRecovery =
            mixedOutingGenericMealRecoveryTerms(effectiveIntent).length > 0;
          const mixedGenericMealRecoveryStarted = Date.now();
          if (isMixedGenericMealRecovery) {
            (debug as any).mixedOutingRestaurantRecoveryAttempted = true;
            (debug as any).mixedOutingRestaurantRecoveryUsed = false;
            (debug as any).mixedOutingRestaurantRecoveryCount = 0;
            (debug as any).mixedOutingRestaurantRecoveryError = null;
          }
          restaurantRaw = await recoverEnterpriseLane(
            supabase,
            effectiveIntent,
            "restaurant",
            debug,
            recoveryTerms,
          );
          filtered = filterRestaurantResults(restaurantRaw, effectiveIntent);
          if (isMixedGenericMealRecovery) {
            (debug as any).mixedOutingRestaurantRecoveryMs =
              Date.now() - mixedGenericMealRecoveryStarted;
            (debug as any).mixedOutingRestaurantRecoveryCount = filtered.length;
            (debug as any).mixedOutingRestaurantRecoveryUsed =
              filtered.length > 0;
          }
        }
      }
      if (
        shouldRunNeighborhoodRestaurantFallback({
          rawQuery: effectiveIntent.rawQuery,
          primaryDomain: effectiveIntent.primaryDomain,
          needsRestaurant: effectiveIntent.needsRestaurant,
          needsActivity: effectiveIntent.needsActivity,
          wantsPairing: effectiveIntent.wantsPairing,
          restaurantCount: filtered.length,
          geo: effectiveIntent.geo,
        })
      ) {
        const fallbackGeo = buildBoroughRestaurantFallbackGeo(
          effectiveIntent.geo,
        );
        const fallbackIntent = { ...effectiveIntent, geo: fallbackGeo };
        const fallbackTerms = restaurantSearchTerms(effectiveIntent);
        usedFallback = true;
        debug.neighborhoodRecoveryUsed = true;
        debug.neighborhoodRecoveryReason = "strict_neighborhood_zero_results";
        debug.neighborhoodRecoveryFrom =
          effectiveIntent.geo.neighborhood ?? null;
        debug.neighborhoodRecoveryTo = fallbackGeo.borough ?? null;
        debug.neighborhoodRecoveryRadiusMiles =
          Number(fallbackGeo.radiusMiles ?? 0) || null;
        debug.neighborhoodRecoveryTerms = fallbackTerms;
        debug.neighborhoodRecoveryGeo = fallbackGeo;
        const fallbackRaw = await searchEnterpriseLane(
          supabase,
          fallbackIntent,
          "restaurant",
          debug,
        );
        const fallbackFiltered = filterRestaurantResults(
          fallbackRaw,
          effectiveIntent,
        );
        debug.neighborhoodRecoveryResultCount = fallbackFiltered.length;
        if (fallbackFiltered.length) {
          restaurantRaw = fallbackFiltered;
          filtered = fallbackFiltered;
        }
      }
      perf.restaurant_rpc_ms = performance.now() - rpcStarted;
    };
    const searchActivityLane = async () => {
      const rpcStarted = performance.now();
      activityRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "activity",
        debug,
      );
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered = filterActivityResults(activityRaw, effectiveIntent);
      if (
        (filtered.length < MIN_ACTIVITY_RESULTS &&
          activitySearchTerms(effectiveIntent).length) ||
        (isBroadGenericActivityIntent(effectiveIntent) &&
          filtered.length < MIN_RESTAURANT_RESULTS)
      ) {
        usedFallback = true;
        if (isRooftopDrinksIntent(effectiveIntent)) {
          debug.activityRecoveryReason = "rooftop_drinks_zero_results";
          debug.activityRecoveryTermsTried = [ROOFTOP_ACTIVITY_RECOVERY_TERMS];
          activityRaw = await recoverEnterpriseLane(
            supabase,
            effectiveIntent,
            "activity",
            debug,
            ROOFTOP_ACTIVITY_RECOVERY_TERMS,
          );
          filtered = filterActivityResults(activityRaw, effectiveIntent);
          if (!filtered.length) {
            debug.activityRecoveryTermsTried.push(BAR_ACTIVITY_RECOVERY_TERMS);
            activityRaw = await recoverEnterpriseLane(
              supabase,
              effectiveIntent,
              "activity",
              debug,
              BAR_ACTIVITY_RECOVERY_TERMS,
            );
            filtered = filterActivityResults(activityRaw, effectiveIntent);
          }
        } else {
          for (const attempt of activityRecoveryAttempts(effectiveIntent)) {
            debug.activityRecoveryReason = attempt.reason;
            (debug as any).activityRecoveryLevel = attempt.level;
            debug.activityRecoveryTermsTried = [
              ...(debug.activityRecoveryTermsTried ?? []),
              attempt.terms,
            ];
            const recoveredActivityRaw = await recoverEnterpriseLane(
              supabase,
              cloneIntentForActivityRecovery(effectiveIntent),
              "activity",
              debug,
              attempt.terms,
            );
            activityRaw = uniqueById([...activityRaw, ...recoveredActivityRaw]);
            filtered = filterActivityResults(
              activityRaw,
              cloneIntentForActivityRecovery(effectiveIntent),
            );
            (debug as any).activityRecoveryAttemptResults = [
              ...((debug as any).activityRecoveryAttemptResults ?? []),
              {
                reason: attempt.reason,
                terms: attempt.terms,
                resultCount: recoveredActivityRaw.length,
                filteredCount: filtered.length,
              },
            ];
            if (filtered.length >= MIN_ACTIVITY_RESULTS) {
              (debug as any).activityRecoverySucceeded = true;
              break;
            }
          }
        }
      }
      perf.activity_rpc_ms = performance.now() - rpcStarted;
    };

    if (effectiveIntent.needsRestaurant && effectiveIntent.needsActivity) {
      await Promise.all([searchRestaurantLane(), searchActivityLane()]);
    } else if (effectiveIntent.needsRestaurant) {
      await searchRestaurantLane();
    } else if (effectiveIntent.needsActivity) {
      await searchActivityLane();
    }
    perf.rpc_ms = Math.max(perf.restaurant_rpc_ms, perf.activity_rpc_ms);
    const restaurantRejectedReasons = restaurantRaw
      .map((r) => explainRejection(r, restaurantRankingIntent, "restaurant"))
      .filter(Boolean);
    const activityRejectionDiagnostics = activityRaw
      .map((r) => ({ record: r, reason: explainRejection(r, effectiveIntent, "activity") }))
      .filter((item) => Boolean(item.reason));
    const activityRejectedReasons = activityRejectionDiagnostics.map(
      (item) => item.reason,
    );
    const activityIntentMismatchDiagnostics = activityRejectionDiagnostics.filter(
      (item) =>
        item.reason === "conflicting_authoritative_category" ||
        item.reason === "missing_structured_activity_evidence" ||
        item.reason === "missing_specific_activity",
    );
    const restaurantRejectedSummary = rejectionSummary(
      restaurantRaw,
      restaurantRankingIntent,
      "restaurant",
    );
    const activityRejectedSummary = rejectionSummary(
      activityRaw,
      effectiveIntent,
      "activity",
    );
    (debug as any).rawRestaurantCandidateCount = restaurantRaw.length;
    (debug as any).rawActivityCandidateCount = activityRaw.length;
    (debug as any).rawCandidateCount = restaurantRaw.length + activityRaw.length;
    const rankStarted = performance.now();
    const attachMlScores = async (items: EnterpriseLocation[]) => {
      const scoreMap = await getLocationMlScoreMap(
        items.map((item) => String(item.id ?? "")).filter(Boolean),
      );
      return items.map((item) => ({
        ...item,
        ml_score: scoreMap.get(String(item.id ?? "")) ?? null,
      }));
    };
    const sameVenueTermsBeforeRanking = sameVenueSearchTerms(effectiveIntent);
    const shouldRecoverSameVenueRestaurants =
      (Boolean((effectiveIntent as any).sameVenuePreferred) ||
        detectSingleVenueWithIntent(effectiveIntent.rawQuery).matched) &&
      sameVenueTermsBeforeRanking.expandedSecondaryAttributeTerms.length > 0 &&
      restaurantRaw.length > 0 &&
      restaurantRaw.filter((item) => {
        const match = scoreSameVenueAttributeMatch(item, effectiveIntent);
        return match.primaryMatched && match.secondaryMatched;
      }).length === 0;
    if (shouldRecoverSameVenueRestaurants) {
      const recoveryTerms =
        sameVenueTermsBeforeRanking.expandedSecondaryAttributeTerms.slice(0, 8);
      (debug as any).sameVenueRecoveryAttempted = true;
      (debug as any).sameVenueRecoveryReason =
        "no_combined_primary_secondary_candidates";
      (debug as any).sameVenueRecoveryTerms = recoveryTerms;
      const recoveredSameVenueRaw = await recoverEnterpriseLane(
        supabase,
        effectiveIntent,
        "restaurant",
        debug,
        recoveryTerms,
      );
      (debug as any).sameVenueRecoveryCandidateCount =
        recoveredSameVenueRaw.length;
      restaurantRaw = uniqueById([...restaurantRaw, ...recoveredSameVenueRaw]);
      (debug as any).sameVenueCandidateCount = restaurantRaw.length;
    } else {
      (debug as any).sameVenueRecoveryAttempted = false;
      (debug as any).sameVenueRecoveryReason = shouldRecoverSameVenueRestaurants
        ? "attempted"
        : null;
      (debug as any).sameVenueRecoveryTerms = [];
      (debug as any).sameVenueRecoveryCandidateCount = 0;
    }

    const shouldAttemptSameVenuePairFallback =
      (Boolean((effectiveIntent as any).sameVenuePreferred) ||
        detectSingleVenueWithIntent(effectiveIntent.rawQuery).matched) &&
      effectiveIntent.needsActivity === true &&
      !effectiveIntent.wantsPairing &&
      Boolean((effectiveIntent as any).fallbackPairAllowed) &&
      sameVenueTermsBeforeRanking.expandedSecondaryAttributeTerms.length > 0;
    let sameVenuePairFallbackIntent: SearchIntent | null = null;
    if (shouldAttemptSameVenuePairFallback) {
      const strongCount = restaurantRaw.filter((item) =>
        isStrongSameVenueMatch(item, effectiveIntent),
      ).length;
      const supportingOnlyCount = restaurantRaw.filter((item) => {
        const match = scoreSameVenueAttributeMatch(item, effectiveIntent);
        return (
          match.primaryMatched &&
          match.secondaryMatched &&
          !match.secondaryStrongMatched
        );
      }).length;
      (debug as any).sameVenueStrongMatchCount = strongCount;
      (debug as any).sameVenueSupportingOnlyMatchCount = supportingOnlyCount;
      (debug as any).sameVenueFallbackToPairingAttempted = strongCount === 0;
      if (strongCount === 0) {
        const secondaryTerms = [
          ...sameVenueTermsBeforeRanking.explicitSecondaryTerms,
          ...sameVenueTermsBeforeRanking.strongSecondarySynonyms,
        ].slice(0, 12);
        const primaryTerms =
          sameVenueTermsBeforeRanking.primaryFoodTerms.filter(
            (term) =>
              !["food", "restaurant", "dinner", "lunch", "brunch"].includes(
                term,
              ),
          );
        sameVenuePairFallbackIntent = {
          ...effectiveIntent,
          searchType: "mixed_outing",
          primaryDomain: "mixed",
          needsRestaurant: true,
          needsActivity: true,
          wantsPairing: true,
          restaurantIntent: {
            ...effectiveIntent.restaurantIntent,
            foodTerms: primaryTerms.length
              ? primaryTerms
              : effectiveIntent.restaurantIntent.foodTerms,
            cuisineTerms: effectiveIntent.restaurantIntent.cuisineTerms,
          },
          activityIntent: {
            ...effectiveIntent.activityIntent,
            activityTerms: secondaryTerms.length
              ? secondaryTerms
              : sameVenueTermsBeforeRanking.expandedSecondaryAttributeTerms,
            categoryTerms: [],
            featureTerms: secondaryTerms,
          },
          pairingPreference: {
            requiresPairing: false,
            distanceMode: "nearby",
            maxPairDistanceMiles: null,
            maxPairWalkingMinutes: null,
            requireWalkablePair: false,
          },
        };
        (debug as any).sameVenueFallbackReason =
          supportingOnlyCount > 0
            ? "only_supporting_secondary_same_venue_matches"
            : "no_strong_same_venue_match";
        (debug as any).fallbackPrimaryTerms = primaryTerms;
        (debug as any).fallbackSecondaryTerms = secondaryTerms;
        const fallbackActivityRaw = await searchEnterpriseLane(
          supabase,
          sameVenuePairFallbackIntent,
          "activity",
          debug,
        );
        activityRaw = uniqueById([...activityRaw, ...fallbackActivityRaw]);
        (debug as any).fallbackActivityRawCount = fallbackActivityRaw.length;
      }
    } else {
      (debug as any).sameVenueFallbackToPairingAttempted = false;
      (debug as any).sameVenueFallbackToPairingUsed = false;
    }

    const [restaurantCandidatesWithMl, activityCandidatesWithMl] =
      await Promise.all([
        attachMlScores(uniqueById(restaurantRaw)),
        attachMlScores(uniqueById(activityRaw)),
      ]);
    (debug as any).mlRanking = {
      enabled: true,
      restaurantScoresLoaded: restaurantCandidatesWithMl.filter(
        (item) => item.ml_score != null,
      ).length,
      activityScoresLoaded: activityCandidatesWithMl.filter(
        (item) => item.ml_score != null,
      ).length,
      boostFormula: "min(20, max(0, ml_score) * 0.15)",
    };
    let rankedRestaurants = rankRestaurantResults(
      restaurantCandidatesWithMl,
      restaurantRankingIntent,
    );
    const rankedRestaurantsBeforeLocationStrict = rankedRestaurants;
    const requestedBorough = restaurantRankingIntent.geo?.borough ?? null;
    const boroughStrictnessApplied = Boolean(
      requestedBorough &&
      ["medium", "strict"].includes(
        String(restaurantRankingIntent.geo?.geoStrictness),
      ),
    );
    if (boroughStrictnessApplied) {
      const isInRequestedBorough = (item: EnterpriseLocation) =>
        String(item.borough || item.city || item.neighborhood || "")
          .toLowerCase()
          .includes(String(requestedBorough).toLowerCase());
      const inBorough = rankedRestaurants.filter(isInRequestedBorough);
      const outBorough = rankedRestaurants.filter(
        (item) => !isInRequestedBorough(item),
      );
      (debug as any).boroughStrictnessApplied = true;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = inBorough.length;
      (debug as any).outOfBoroughResultCount = outBorough.length;
      (debug as any).outOfBoroughPenaltyApplied = outBorough.length > 0;
      (debug as any).outOfBoroughRecoveryAllowed = inBorough.length < 3;
      (debug as any).outOfBoroughRecoveryReason =
        inBorough.length < 3 ? "fewer_than_3_in_borough_matches" : null;
      rankedRestaurants =
        inBorough.length >= 3
          ? inBorough
          : [
              ...inBorough,
              ...outBorough.map((item) => ({
                ...item,
                search_recovery_reason: "out_of_borough_recovery",
              })),
            ];
    } else {
      (debug as any).boroughStrictnessApplied = false;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = 0;
      (debug as any).outOfBoroughResultCount = 0;
      (debug as any).outOfBoroughPenaltyApplied = false;
      (debug as any).outOfBoroughRecoveryAllowed = false;
      (debug as any).outOfBoroughRecoveryReason = null;
    }
    const dateNightDinnerIntent = isDateNightDinnerIntent(
      restaurantRankingIntent,
    );
    const explicitCafeDessertIntent = hasExplicitCafeDessertIntent(
      restaurantRankingIntent,
    );
    if (dateNightDinnerIntent && !explicitCafeDessertIntent) {
      const realDinnerRestaurants = rankedRestaurants.filter(
        (item) => !isCafeBakeryDessertQuickBiteOnly(item),
      );
      const cafeBakeryDessertOnly = rankedRestaurants.filter(
        isCafeBakeryDessertQuickBiteOnly,
      );
      rankedRestaurants =
        realDinnerRestaurants.length >= 3
          ? [...realDinnerRestaurants, ...cafeBakeryDessertOnly]
          : [...realDinnerRestaurants, ...cafeBakeryDessertOnly];
      (debug as any).dateNightDinnerSuppression = {
        applied: true,
        explicitCafeDessertIntent,
        cafeBakeryDessertSuppressedCount: cafeBakeryDessertOnly.length,
        realDinnerRestaurantCount: realDinnerRestaurants.length,
        suppressedNames: cafeBakeryDessertOnly
          .slice(0, 12)
          .map((item) => item.name || item.restaurant_name || null)
          .filter(Boolean),
      };
      (debug as any).dateNightDinnerIntent = true;
      (debug as any).explicitCafeDessertIntent = false;
      (debug as any).cafeBakeryDessertSuppressedCount =
        cafeBakeryDessertOnly.length;
      (debug as any).cafeBakeryDessertDemotedCount =
        cafeBakeryDessertOnly.length;
    } else {
      (debug as any).dateNightDinnerSuppression = {
        applied: false,
        explicitCafeDessertIntent,
        cafeBakeryDessertSuppressedCount: 0,
        realDinnerRestaurantCount: rankedRestaurants.length,
        suppressedNames: [],
      };
      (debug as any).dateNightDinnerIntent = dateNightDinnerIntent;
      (debug as any).explicitCafeDessertIntent = explicitCafeDessertIntent;
      (debug as any).cafeBakeryDessertSuppressedCount = 0;
      (debug as any).cafeBakeryDessertDemotedCount = 0;
    }
    const requestedFeatureTerms = restaurantFeatureTerms(
      restaurantRankingIntent,
    ).filter((term) =>
      /rooftop|roof|terrace|outdoor|skyline|scenic|views?|deck/i.test(term),
    );
    if (requestedFeatureTerms.length) {
      const fields = [
        "tags",
        "search_keywords",
        "semantic_tags",
        "intent_tags",
        "primary_category",
        "cuisine_type",
        "description",
        "search_document",
        "semantic_search_text",
        "vibe_tags",
        "date_style_tags",
        "best_for_tags",
      ];
      const matchesFeature = (item: EnterpriseLocation) =>
        fields
          .map((field) => {
            const value = (item as any)[field];
            return Array.isArray(value) ? value.join(" ") : String(value ?? "");
          })
          .join(" ")
          .toLowerCase()
          .replaceAll("_", " ")
          .replaceAll("-", " ")
          .match(
            /rooftop|roof top|roof deck|terrace|outdoor dining|outdoor seating|skyline|scenic views|views/,
          ) !== null ||
        requestedFeatureTerms.some((term) =>
          fields
            .map((field) => {
              const value = (item as any)[field];
              return Array.isArray(value)
                ? value.join(" ")
                : String(value ?? "");
            })
            .join(" ")
            .toLowerCase()
            .includes(term.toLowerCase()),
        );
      const featureMatches = rankedRestaurants.filter(matchesFeature);
      const featureMissing = rankedRestaurants.filter(
        (item) => !matchesFeature(item),
      );
      (debug as any).featureStrictnessApplied = true;
      (debug as any).requestedFeatureTerms = requestedFeatureTerms;
      (debug as any).featureMatchedResultCount = featureMatches.length;
      (debug as any).featureMissingPenaltyApplied = featureMissing.length > 0;
      (debug as any).featureRelaxed = featureMatches.length === 0;
      (debug as any).featureRelaxedReason =
        featureMatches.length === 0 ? "no_matching_feature_results" : null;
      rankedRestaurants = featureMatches.length
        ? [...featureMatches, ...featureMissing]
        : rankedRestaurants;
    }
    const sameVenueTermsForDebug = sameVenueSearchTerms(effectiveIntent);
    const rankedActivities = rankActivityResults(
      activityCandidatesWithMl,
      effectiveIntent,
    );
    const qualifiedPrimaryActivities = rankedActivities;
    (debug as any).qualifiedActivityCount = qualifiedPrimaryActivities.length;
    const specificActivityTermsForDiagnostics = effectiveIntent.activityIntent.activityTerms.filter(
      (term) =>
        !["activity", "activities", "things to do", "experience"].includes(
          term.toLowerCase(),
        ),
    );
    if (
      options?.betaDebug === true &&
      isSpecificActivityIntent(effectiveIntent.activityIntent) &&
      specificActivityTermsForDiagnostics.length > 0
    ) {
      const primaryActivityIds = new Set(rankedActivities.map((item) => String(item.id ?? "")));
      (debug as any).explicitActivityQualificationDiagnostics = activityCandidatesWithMl
        .slice(0, 40)
        .map((candidate) => {
          const qualification = qualifyExplicitActivityIntent(
            candidate,
            specificActivityTermsForDiagnostics,
          );
          const inPrimaryActivities = primaryActivityIds.has(String(candidate.id ?? ""));
          return {
            locationId: candidate.id ?? null,
            locationName: candidate.name || candidate.activity_name || null,
            requestedCanonicalActivity: qualification.requestedCanonicalActivity ?? null,
            qualified: qualification.matches,
            rejectionReason: qualification.matches ? null : qualification.reason,
            trustedCategoryTypeEvidence: {
              activity_type: candidate.activity_type ?? null,
              primary_category: candidate.primary_category ?? null,
              google_types: candidate.google_types ?? null,
              trustedEvidence: qualification.trustedEvidence ?? [],
              conflictingTrustedEvidence: qualification.conflictingTrustedEvidence ?? [],
            },
            weakMatchingEvidence: (qualification.weakEvidence ?? []).slice(0, 8),
            excludedFromPrimaryPairing: !inPrimaryActivities,
            retainedAsFallback: (candidate as any)._marketFitBucket === "fallback",
          };
        });
    }
    const activityPairIntent = effectiveIntent.activityPairIntent ?? null;
    const firstActivityRankingIntent: SearchIntent = activityPairIntent
      ? {
          ...effectiveIntent,
          activityIntent: {
            ...effectiveIntent.activityIntent,
            activityTerms: activityPairIntent.firstActivityTerms,
          },
        }
      : effectiveIntent;
    const secondActivityRankingIntent: SearchIntent = activityPairIntent
      ? {
          ...effectiveIntent,
          activityIntent: {
            ...effectiveIntent.activityIntent,
            activityTerms: activityPairIntent.secondActivityTerms,
          },
        }
      : effectiveIntent;
    const rankedFirstActivities = activityPairIntent
      ? rankActivityResults(
          activityCandidatesWithMl,
          firstActivityRankingIntent,
        )
      : [];
    const rankedSecondActivities = activityPairIntent
      ? rankActivityResults(
          activityCandidatesWithMl,
          secondActivityRankingIntent,
        )
      : [];
    const singleVenueWith = detectSingleVenueWithIntent(
      effectiveIntent.rawQuery,
    );
    if (singleVenueWith.matched) {
      const scoredSingleVenue = rankedRestaurants.map((restaurant) => ({
        restaurant,
        match: scoreSingleVenueWithMatch(restaurant, effectiveIntent),
      }));
      const strongDualMatches = scoredSingleVenue.filter(
        ({ match }) => match.dualMatched && match.score >= 110,
      );
      (debug as any).singleVenueWithIntentUsed = true;
      (debug as any).singleVenueWithIntentReason =
        "with_connector_single_venue";
      (debug as any).singleVenueWithVenueTerms = singleVenueWith.venueTerms;
      (debug as any).singleVenueWithFoodTerms = singleVenueWith.foodTerms;
      (debug as any).singleVenueWithFeatureTerms = singleVenueWith.featureTerms;
      (debug as any).primaryFoodTerms = sameVenueTermsForDebug.primaryFoodTerms;
      (debug as any).secondaryAttributeTerms =
        sameVenueTermsForDebug.secondaryAttributeTerms;
      (debug as any).expandedSecondaryAttributeTerms =
        sameVenueTermsForDebug.expandedSecondaryAttributeTerms;
      (debug as any).sameVenueCandidateCount = scoredSingleVenue.length;
      (debug as any).combinedPrimarySecondaryMatchCount =
        scoredSingleVenue.filter(
          ({ restaurant }) =>
            (restaurant as any).sameVenuePrimaryMatched &&
            (restaurant as any).sameVenueSecondaryMatched,
        ).length;
      (debug as any).primaryOnlyMatchCount = scoredSingleVenue.filter(
        ({ restaurant }) =>
          (restaurant as any).sameVenuePrimaryMatched &&
          !(restaurant as any).sameVenueSecondaryMatched,
      ).length;
      (debug as any).secondaryOnlyMatchCount = scoredSingleVenue.filter(
        ({ restaurant }) =>
          !(restaurant as any).sameVenuePrimaryMatched &&
          (restaurant as any).sameVenueSecondaryMatched,
      ).length;
      (debug as any).sameVenueResultDebug = scoredSingleVenue
        .slice(0, 25)
        .map(({ restaurant }, index) => ({
          rank: index + 1,
          id: restaurant.id ?? null,
          name: restaurant.name || restaurant.restaurant_name || null,
          sameVenuePrimaryMatched:
            (restaurant as any).sameVenuePrimaryMatched ?? false,
          sameVenueSecondaryMatched:
            (restaurant as any).sameVenueSecondaryMatched ?? false,
          sameVenueSecondaryStrongMatched:
            (restaurant as any).sameVenueSecondaryStrongMatched ?? false,
          sameVenueSecondarySupportingMatched:
            (restaurant as any).sameVenueSecondarySupportingMatched ?? false,
          sameVenueAttributeMatchStrength:
            (restaurant as any).sameVenueAttributeMatchStrength ?? "none",
          phase2IntentMatchStrength:
            (restaurant as any).phase2IntentMatchStrength ?? null,
          sameVenuePrimaryTermsMatched:
            (restaurant as any).sameVenuePrimaryTermsMatched ?? [],
          sameVenueAttributeTermsMatched:
            (restaurant as any).sameVenueAttributeTermsMatched ?? [],
          sameVenuePrimaryFieldsMatched:
            (restaurant as any).sameVenuePrimaryFieldsMatched ?? [],
          sameVenueSecondaryFieldsMatched:
            (restaurant as any).sameVenueSecondaryFieldsMatched ?? [],
          sameVenueScore: (restaurant as any).sameVenueScore ?? 0,
          sameVenueBoostApplied:
            (restaurant as any).sameVenueBoostApplied ?? false,
          sameVenueRankingReason:
            (restaurant as any).sameVenueRankingReason ?? null,
          matchedFields: (restaurant as any).matchedFields ?? [],
        }));
      const mira = scoredSingleVenue.find(({ restaurant }) =>
        String(restaurant.name || restaurant.restaurant_name || "")
          .toLowerCase()
          .includes("mira mediterranean"),
      );
      (debug as any).miraSameVenueDiagnostic =
        /mediterranean dinner with hookah in manhattan/i.test(
          effectiveIntent.rawQuery,
        )
          ? {
              foundInCandidates: Boolean(mira),
              searchedPrimaryTerms: sameVenueTermsForDebug.primaryFoodTerms,
              searchedSecondaryTerms:
                sameVenueTermsForDebug.secondaryAttributeTerms,
              searchedExpandedSecondaryTerms:
                sameVenueTermsForDebug.expandedSecondaryAttributeTerms,
              rpcTermsOriginal: (debug as any).restaurantRpcTermsOriginal ?? [],
              rpcTermsPruned: (debug as any).restaurantRpcTermsPruned ?? [],
              rpcTermsAfterCap: (debug as any).rpcTermsAfterCap ?? [],
              recoveryAttempted:
                (debug as any).sameVenueRecoveryAttempted ?? false,
              recoveryTerms: (debug as any).sameVenueRecoveryTerms ?? [],
              foundInRecoveryCandidates: mira
                ? ((mira.restaurant as any).search_recovery_reason ?? null) !=
                  null
                : false,
              foundAfterMerge: Boolean(mira),
              filteredByMarket: null,
              filteredByCityBorough: null,
              filteredByIsSearchable: mira
                ? (mira.restaurant as any).is_searchable === false
                : null,
              filteredByPublishReady: mira
                ? !["publish_ready", "approved", undefined, null].includes(
                    (mira.restaurant as any).quality_status as any,
                  )
                : null,
              filteredByDataStatus: mira
                ? ((mira.restaurant as any).data_status ?? null)
                : null,
              filteredByLocationType: mira
                ? ((mira.restaurant as any).location_type ?? null)
                : null,
              filteredByCoordinates: mira
                ? !(
                    (mira.restaurant as any).latitude &&
                    (mira.restaurant as any).longitude
                  )
                : null,
              filteredByMissingSearchDocument: mira
                ? !(mira.restaurant as any).search_document
                : null,
              rankedBelowResultLimit: mira
                ? scoredSingleVenue.findIndex((item) => item === mira) >= 12
                : null,
              missingHookahMediterraneanTerms: mira
                ? !(
                    (mira.restaurant as any).sameVenuePrimaryMatched &&
                    (mira.restaurant as any).sameVenueSecondaryMatched
                  )
                : null,
              primaryTermsMatched: mira
                ? ((mira.restaurant as any).sameVenuePrimaryTermsMatched ?? [])
                : [],
              attributeTermsMatched: mira
                ? ((mira.restaurant as any).sameVenueAttributeTermsMatched ??
                  [])
                : [],
              primaryFieldsMatched: mira
                ? ((mira.restaurant as any).sameVenuePrimaryFieldsMatched ?? [])
                : [],
              secondaryFieldsMatched: mira
                ? ((mira.restaurant as any).sameVenueSecondaryFieldsMatched ??
                  [])
                : [],
            }
          : null;
      (debug as any).singleVenueWithStrongDualMatchCount =
        strongDualMatches.length;
      if (strongDualMatches.length >= 3) {
        rankedRestaurants = scoredSingleVenue
          .filter(({ match }) => match.dualMatched)
          .map(({ restaurant }) => restaurant);
      } else {
        (debug as any).singleVenueWithLooseMatchesUsed = true;
      }
    }
    perf.ranking_ms = performance.now() - rankStarted;

    (debug as any).topRestaurantNames = rankedRestaurants
      .slice(0, 5)
      .map(
        (restaurant) => restaurant.name || restaurant.restaurant_name || null,
      )
      .filter(Boolean);
    (debug as any).topRestaurantCategories = rankedRestaurants
      .slice(0, 5)
      .map(
        (restaurant) =>
          restaurant.primary_category ||
          restaurant.cuisine_type ||
          restaurant.cuisine ||
          null,
      )
      .filter(Boolean);

    const restaurantQualityScorePreview = rankedRestaurants
      .slice(0, 12)
      .map((restaurant) => ({
        name: restaurant.name || restaurant.restaurant_name || null,
        score: Number((restaurant as any).restaurantQualityScore ?? 0),
        reasons: ((restaurant as any).restaurantQualityReasons ?? []).slice(
          0,
          8,
        ),
        penalties: ((restaurant as any).restaurantQualityPenalties ?? []).slice(
          0,
          8,
        ),
      }));
    const restaurantOutingFitScorePreview = rankedRestaurants
      .slice(0, 12)
      .map((restaurant) => ({
        name: restaurant.name || restaurant.restaurant_name || null,
        qualityScore: Number((restaurant as any).restaurantQualityScore ?? 0),
        outingFitScore: Number(
          (restaurant as any).restaurantOutingFitScore ?? 0,
        ),
        reasons: (
          (restaurant as any).restaurantOutingFitReasons ??
          (restaurant as any).restaurantQualityReasons ??
          []
        ).slice(0, 8),
        penalties: (
          (restaurant as any).restaurantOutingFitPenalties ??
          (restaurant as any).restaurantQualityPenalties ??
          []
        ).slice(0, 8),
      }));
    const activityQualityScorePreview = rankedActivities
      .slice(0, 12)
      .map((activity) => ({
        name: activity.name || activity.activity_name || null,
        score: Number((activity as any).activityQualityScore ?? 0),
        reasons: ((activity as any).activityQualityReasons ?? []).slice(0, 8),
        penalties: ((activity as any).activityQualityPenalties ?? []).slice(
          0,
          8,
        ),
      }));
    const photoStarted = performance.now();
    const requestedMarketForResults =
      (effectiveIntent.geo as any).resolvedMarket ||
      (effectiveIntent.geo as any).requestedMarket ||
      null;
    const explicitMarketRequested =
      isExplicitMarket(requestedMarketForResults) &&
      (effectiveIntent.geo as any).explicitMarketRequested !== false;
    const useLocationFitForLongIsland =
      requestedMarketForResults === "LONG_ISLAND";
    const suppressMarketMismatch = (item: EnterpriseLocation) => {
      if (!requestedMarketForResults || useLocationFitForLongIsland)
        return false;
      if (
        explicitMarketRequested &&
        !isResultAllowedForResolvedMarket(item, requestedMarketForResults)
      )
        return true;
      const validation = validatePlaceForMarket({
        requestedMarket: requestedMarketForResults,
        city: (item as any).city,
        state: (item as any).state,
        county: (item as any).county,
        borough: (item as any).borough,
        neighborhood: (item as any).neighborhood,
        address: (item as any).address,
      });
      return !validation.ok;
    };
    const rejectedForMarketGuardrail = useLocationFitForLongIsland
      ? []
      : [...rankedRestaurants, ...rankedActivities].filter(
          (item) =>
            explicitMarketRequested &&
            !isResultAllowedForResolvedMarket(item, requestedMarketForResults),
        );
    const marketSafeRestaurants = rankedRestaurants
      .filter((item) => !suppressMarketMismatch(item))
      .map((item) => withMarketFit(item, requestedMarketForResults));
    const marketSafeActivities = qualifiedPrimaryActivities
      .filter((item) => !suppressMarketMismatch(item))
      .map((item) => withMarketFit(item, requestedMarketForResults));

    const resolvedMlFlags = mlFlags();
    const intentBoostedRestaurants = await applyIntentBoostsToLocations(
      marketSafeRestaurants,
      query,
      requestedMarketForResults,
      resolvedMlFlags,
      "restaurant",
    );
    const intentBoostedActivities = await applyIntentBoostsToLocations(
      marketSafeActivities,
      query,
      requestedMarketForResults,
      resolvedMlFlags,
      "activity",
    );
    const domainFiltered = filterResultsBySearchDomain({
      restaurants: filterLivePhotoResults(intentBoostedRestaurants),
      activities: filterLivePhotoResults(intentBoostedActivities),
      intent: effectiveIntent,
      debug: debug as any,
    });

    const relaxedRestaurantPhotoFallback =
      effectiveIntent.primaryDomain === "restaurant" &&
      effectiveIntent.needsRestaurant === true &&
      effectiveIntent.needsActivity !== true &&
      effectiveIntent.wantsPairing !== true &&
      domainFiltered.restaurants.length === 0 &&
      intentBoostedRestaurants.length > 0;

    const photoSafeRestaurants = relaxedRestaurantPhotoFallback
      ? filterResultsBySearchDomain({
          restaurants: intentBoostedRestaurants,
          activities: [],
          intent: effectiveIntent,
          debug: debug as any,
          lane: "restaurant_photo_fallback",
        }).restaurants.slice(0, displayLimit)
      : domainFiltered.restaurants;

    const photoSafeActivities = domainFiltered.activities;

    const foodForwardRestaurantOnlySearch =
      isFoodForwardRestaurantOnlySearch(effectiveIntent);
    const weakFoodRestaurantCardCandidates = foodForwardRestaurantOnlySearch
      ? photoSafeRestaurants.filter((item) =>
          shouldSuppressWeakFoodRestaurantCard(item, query),
        )
      : [];
    let displaySafeRestaurants = foodForwardRestaurantOnlySearch
      ? photoSafeRestaurants.filter(
          (item) => !shouldSuppressWeakFoodRestaurantCard(item, query),
        )
      : photoSafeRestaurants;

    let foodForwardRestaurantRecoveryRestaurants: EnterpriseLocation[] = [];
    let foodForwardRestaurantRecoverySource = "not_attempted";
    if (
      foodForwardRestaurantOnlySearch &&
      displaySafeRestaurants.length === 0 &&
      weakFoodRestaurantCardCandidates.length > 0
    ) {
      const recoveryPool = rankedRestaurantsBeforeLocationStrict
        .filter((item) =>
          isResultAllowedForResolvedMarket(item, requestedMarketForResults),
        )
        .map((item) => withMarketFit(item, requestedMarketForResults))
        .map((item) => withFoodRecoveryLabel(item, requestedBorough));

      const buildRecoveryCards = async (
        source: EnterpriseLocation[],
        sourceName: string,
      ) => {
        const recoveryDomainSafe = filterResultsBySearchDomain({
          restaurants: filterLivePhotoResults(source),
          activities: [],
          intent: effectiveIntent,
          debug: debug as any,
          lane: "food_forward_recovery",
        }).restaurants.filter((item) =>
          isStrongFoodRestaurantRecoveryCard(item, query),
        );

        const boostedRecovery = await applyIntentBoostsToLocations(
          uniqueById(recoveryDomainSafe).slice(0, RECOVERY_LIMIT),
          query,
          requestedMarketForResults,
          FOOD_RECOVERY_ML_FLAGS_DISABLED,
          "restaurant",
        );

        const cards = boostedRecovery
          .filter((item) => isStrongFoodRestaurantRecoveryCard(item, query))
          .map((item) => ({
            ...item,
            food_forward_recovery_rank_score: foodRecoveryRankingScore(
              item,
              query,
              requestedBorough,
            ),
          }))
          .sort((a, b) => {
            const recoveryDelta =
              Number((b as any).food_forward_recovery_rank_score ?? 0) -
              Number((a as any).food_forward_recovery_rank_score ?? 0);
            if (Math.abs(recoveryDelta) > 0.001) return recoveryDelta;
            return (
              Number(
                (b as any)._mlPhase2SortScore ?? (b as any).match_score ?? 0,
              ) -
              Number(
                (a as any)._mlPhase2SortScore ?? (a as any).match_score ?? 0,
              )
            );
          });

        return { cards, sourceName, candidateCount: recoveryDomainSafe.length };
      };

      const rankedPoolRecovery = await buildRecoveryCards(
        recoveryPool,
        "ranked_restaurants_before_location_strict",
      );

      foodForwardRestaurantRecoveryRestaurants = rankedPoolRecovery.cards;
      foodForwardRestaurantRecoverySource = rankedPoolRecovery.sourceName;
      (debug as any).restaurantFoodForwardPostSafetyRankedPoolCandidateCount =
        rankedPoolRecovery.candidateCount;

      if (foodForwardRestaurantRecoveryRestaurants.length === 0) {
        const currentRadius = Number(effectiveIntent.geo?.radiusMiles ?? 0);
        const expandedFoodRecoveryIntent: SearchIntent = {
          ...effectiveIntent,
          strictness: "medium",
          geo: {
            ...effectiveIntent.geo,
            neighborhood: null,
            borough: null,
            city: effectiveIntent.geo?.city || "New York",
            radiusMiles: Math.max(currentRadius || 0, 15),
            geoStrictness: "medium",
          },
        };
        const specificFoodTerms = Array.from(
          new Set(
            [
              ...(effectiveIntent.restaurantIntent?.foodTerms ?? []),
              ...(effectiveIntent.restaurantIntent?.cuisineTerms ?? []),
              ...restaurantSearchTerms(effectiveIntent),
            ]
              .map((term) => String(term ?? "").trim().toLowerCase())
              .filter(Boolean)
              .filter(
                (term) =>
                  ![
                    "lunch",
                    "dinner",
                    "brunch",
                    "breakfast",
                    "restaurant",
                    "food",
                    "dining",
                    "eat",
                    "meal",
                  ].includes(term),
              ),
          ),
        ).slice(0, 8);

        const expandedRaw = await recoverEnterpriseLane(
          supabase,
          expandedFoodRecoveryIntent,
          "restaurant",
          debug,
          specificFoodTerms.length ? specificFoodTerms : undefined,
          RECOVERY_LIMIT,
        );
        const expandedRanked = rankRestaurantResults(
          uniqueById(expandedRaw),
          restaurantRankingIntent,
        )
          .filter((item) =>
            isResultAllowedForResolvedMarket(item, requestedMarketForResults),
          )
          .map((item) => withMarketFit(item, requestedMarketForResults))
          .map((item) => withFoodRecoveryLabel(item, requestedBorough));
        const expandedRecovery = await buildRecoveryCards(
          expandedRanked,
          "expanded_food_recovery_rpc",
        );

        (debug as any).restaurantFoodForwardPostSafetyExpandedRecoveryAttempted =
          true;
        (debug as any).restaurantFoodForwardPostSafetyExpandedRecoveryTerms =
          specificFoodTerms;
        (debug as any).restaurantFoodForwardPostSafetyExpandedRecoveryRawCount =
          expandedRaw.length;
        (debug as any).restaurantFoodForwardPostSafetyExpandedRecoveryCandidateCount =
          expandedRecovery.candidateCount;

        foodForwardRestaurantRecoveryRestaurants = expandedRecovery.cards;
        foodForwardRestaurantRecoverySource = expandedRecovery.sourceName;
      }

      if (foodForwardRestaurantRecoveryRestaurants.length) {
        displaySafeRestaurants = foodForwardRestaurantRecoveryRestaurants;
      }
    }

    if (foodForwardRestaurantOnlySearch) {
      (debug as any).restaurantFoodForwardCardSafetyApplied = true;
      (debug as any).restaurantFoodForwardCardSafetyBeforeCount =
        photoSafeRestaurants.length;
      (debug as any).restaurantFoodForwardCardSafetyAfterCount =
        displaySafeRestaurants.length;
      (debug as any).restaurantFoodForwardPostSafetyRecoveryApplied =
        foodForwardRestaurantRecoveryRestaurants.length > 0;
      (debug as any).restaurantFoodForwardPostSafetyRecoveryCount =
        foodForwardRestaurantRecoveryRestaurants.length;
      (debug as any).restaurantFoodForwardPostSafetyRecoverySource =
        foodForwardRestaurantRecoverySource;
      (debug as any).restaurantFoodForwardPostSafetyRecoverySample =
        foodForwardRestaurantRecoveryRestaurants.slice(0, 5).map((item) => ({
          id: item.id ?? null,
          name: item.name || item.restaurant_name || item.activity_name || null,
          location_type: item.location_type ?? null,
          borough: item.borough ?? null,
          city: item.city ?? null,
          match_score: Number((item as any).match_score ?? 0),
          restaurant_food_activity_penalty: weakFoodRestaurantCardPenalty(
            item,
            query,
          ),
          search_recovery_reason: (item as any).search_recovery_reason ?? null,
          market_fit_label: (item as any)._marketFitLabel ?? null,
          food_forward_recovery_rank_score:
            (item as any).food_forward_recovery_rank_score ?? null,
        }));
      (debug as any).restaurantFoodForwardSuppressedWeakActivityCount =
        weakFoodRestaurantCardCandidates.length;
      (debug as any).restaurantFoodForwardSuppressedWeakActivitySample =
        weakFoodRestaurantCardCandidates.slice(0, 5).map((item) => ({
          id: item.id ?? null,
          name: item.name || item.restaurant_name || item.activity_name || null,
          location_type: item.location_type ?? null,
          source_table: (item as any).source_table ?? null,
          activity_type: item.activity_type ?? null,
          primary_category: item.primary_category ?? null,
          match_score: Number((item as any).match_score ?? 0),
          restaurant_food_activity_penalty: weakFoodRestaurantCardPenalty(
            item,
            query,
          ),
        }));
    }

    if (relaxedRestaurantPhotoFallback) {
      (debug as any).restaurantPhotoFallbackUsed = true;
      (debug as any).restaurantPhotoFallbackReason =
        "restaurant_only_candidates_rejected_by_photo_safety";
      (debug as any).restaurantPhotoFallbackCount = photoSafeRestaurants.length;
    }

    const photoSuppressedRestaurants = marketSafeRestaurants.filter(
      (item) => !hasUsableLivePhoto(item),
    );
    const photoSuppressedActivities = marketSafeActivities.filter(
      (item) => !hasUsableLivePhoto(item),
    );

    const suppressedMarketMismatchCount =
      rankedRestaurants.length -
      marketSafeRestaurants.length +
      (rankedActivities.length - marketSafeActivities.length);
    const marketFitItems = [...marketSafeRestaurants, ...marketSafeActivities];
    const requestedMarketActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "requested",
    ).length;
    const nearbyActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "nearby",
    ).length;
    const fallbackActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "fallback",
    ).length;
    const locationSuppressedActivitiesSample = useLocationFitForLongIsland
      ? []
      : rejectedForMarketGuardrail
          .filter(
            (item: any) =>
              item.activity_name || item.location_type === "activity",
          )
          .slice(0, 8)
          .map((item) => ({
            name: item.name || item.activity_name || null,
            market: (item as any).market ?? null,
            state: item.state ?? null,
            city: item.city ?? null,
            county: (item as any).county ?? null,
            reason: getMarketGuardrailRejectionReason(
              item,
              requestedMarketForResults,
            ),
          }));
    const nearbyIncludedActivitiesSample = marketSafeActivities
      .filter((item: any) => item._marketFitBucket === "nearby")
      .slice(0, 8)
      .map((item: any) => ({
        name: item.name || item.activity_name || null,
        market: item.market ?? null,
        state: item.state ?? null,
        city: item.city ?? null,
        county: item.county ?? null,
        _marketFitBucket: item._marketFitBucket,
        _marketFitReason: item._marketFitReason,
        _marketFitLabel: item._marketFitLabel,
      }));

    const marketGuardrailRejected = rejectedForMarketGuardrail.length;

    const imageDebugFor = (item: EnterpriseLocation) => {
      const record = item as any;

      return {
        name: item.name || item.restaurant_name || item.activity_name || null,
        market: record.market ?? null,
        state: item.state ?? null,
        city: item.city ?? null,
        county: record.county ?? null,
        borough: item.borough ?? null,
        has_photos: record.has_photos ?? null,
        photo_status: record.photo_status ?? null,
        image_url: Boolean(firstSearchImage(record.image_url)),
        main_image: Boolean(firstSearchImage(record.main_image)),
        photo_url: Boolean(firstSearchImage(record.photo_url)),
        primary_photo_url: Boolean(firstSearchImage(record.primary_photo_url)),
        google_photo_url: Boolean(firstSearchImage(record.google_photo_url)),
        images: Boolean(firstSearchImage(record.images)),
        gallery_images: Boolean(firstSearchImage(record.gallery_images)),
        photos: Boolean(firstSearchImage(record.photos)),
        photo_urls: Boolean(firstSearchImage(record.photo_urls)),
        google_photos: Boolean(firstSearchImage(record.google_photos)),
      };
    };

    const sampleRejectedMarkets = rejectedForMarketGuardrail
      .slice(0, 8)
      .map((item) => ({
        ...imageDebugFor(item),
        reason: getMarketGuardrailRejectionReason(
          item,
          requestedMarketForResults,
        ),
      }));

    (debug as any).rankedRestaurantCountBeforeMarketGuardrail =
      rankedRestaurants.length;
    (debug as any).rankedActivityCountBeforeMarketGuardrail =
      rankedActivities.length;
    (debug as any).marketSafeRestaurantCount = marketSafeRestaurants.length;
    (debug as any).mlPhase2Intent = classifySearchIntent(query);
    if (
      effectiveIntent.searchType === "same_location_combo" ||
      (effectiveIntent as any).sameLocationRequired
    ) {
      const previousMode = (debug as any).mlPhase2Intent?.inferredSearchMode;
      if (previousMode === "mixed_outing") {
        (debug as any).mlPhase2Intent = {
          ...(debug as any).mlPhase2Intent,
          inferredSearchMode: "same_location_combo",
          inferredSearchModeOverride:
            "mixed_outing_suppressed_for_same_location_combo",
        };
      }
    }
    (debug as any).marketSafeActivityCount = marketSafeActivities.length;
    (debug as any).photoSafeRestaurantCount = photoSafeRestaurants.length;
    (debug as any).photoSafeActivityCount = photoSafeActivities.length;
    (debug as any).photoSuppressedRestaurantCount =
      photoSuppressedRestaurants.length;
    (debug as any).photoSuppressedActivityCount =
      photoSuppressedActivities.length;
    (debug as any).samplePhotoSuppressedRestaurants = photoSuppressedRestaurants
      .slice(0, 8)
      .map(imageDebugFor);
    (debug as any).samplePhotoSuppressedActivities = photoSuppressedActivities
      .slice(0, 8)
      .map(imageDebugFor);
    (debug as any).sampleRejectedMarkets = sampleRejectedMarkets;
    (debug as any).marketGuardrailRejected = marketGuardrailRejected;
    (debug as any).suppressedMarketMismatchCount =
      suppressedMarketMismatchCount;
    (debug as any).requestedMarketActivityCount = requestedMarketActivityCount;
    (debug as any).nearbyActivityCount = nearbyActivityCount;
    (debug as any).fallbackActivityCount = fallbackActivityCount;
    (debug as any).locationSuppressedActivitiesSample =
      locationSuppressedActivitiesSample;
    (debug as any).nearbyIncludedActivitiesSample =
      nearbyIncludedActivitiesSample;
    (debug as any).locationFitBucketCounts = marketFitItems.reduce(
      (acc: Record<string, number>, item: any) => {
        const bucket = item._marketFitBucket ?? "unknown";
        acc[bucket] = (acc[bucket] ?? 0) + 1;
        return acc;
      },
      {},
    );

    (debug as any).sameVenueAfterComboEligibilityCount =
      rankedRestaurants.length;
    (debug as any).sameVenueAfterMarketGuardrailCount =
      marketSafeRestaurants.length;
    (debug as any).sameVenueAfterPhotoSafetyCount = photoSafeRestaurants.length;
    (debug as any).sameVenueAfterRankingCount = rankedRestaurants.length;

    const qualityMode = searchQualityRolloutMode();
    const qualityDebug = options?.searchHealthDebug === true;
    const restaurantQualityRanking = rerankLocations(displaySafeRestaurants, effectiveIntent, { mode: qualityMode, debug: qualityDebug });
    const activityQualityRanking = rerankLocations(photoSafeActivities, effectiveIntent, { mode: qualityMode, debug: qualityDebug });
    (debug as any).searchQualityRanking = { mode: qualityMode, interpretation: restaurantQualityRanking.interpretation, restaurants: restaurantQualityRanking.evidence, activities: activityQualityRanking.evidence };
    let restaurants = restaurantQualityRanking.results.slice(0, displayLimit);
    let activities = activityQualityRanking.results.slice(0, displayLimit);
    const firstActivityCandidates = activityPairIntent
      ? filterLivePhotoResults(
          rankedFirstActivities.filter((item) =>
            isResultAllowedForResolvedMarket(item, requestedMarketForResults),
          ),
        ).slice(0, displayLimit)
      : [];
    const secondActivityCandidates = activityPairIntent
      ? filterLivePhotoResults(
          rankedSecondActivities.filter((item) =>
            isResultAllowedForResolvedMarket(item, requestedMarketForResults),
          ),
        ).slice(0, displayLimit)
      : [];
    const candidateRestaurantCountBeforeRequiredPairSuppression =
      restaurants.length;
    const candidateActivityCountBeforeRequiredPairSuppression =
      activities.length;
    const suppressedLowQualityRestaurantCount = rankedRestaurants.filter(
      (restaurant) =>
        Number((restaurant as any).restaurantQualityScore ?? 0) < 0 &&
        !restaurants.some((shown) => shown.id === restaurant.id),
    ).length;
    const suppressedLowQualityActivityCount = rankedActivities.filter(
      (activity) =>
        Number((activity as any).activityQualityScore ?? 0) < 0 &&
        !activities.some((shown) => shown.id === activity.id),
    ).length;
    perf.photo_filter_ms = performance.now() - photoStarted;

    const pairingDebug = createPairingDebug();
    const pairingStarted = performance.now();
    const pairingEligibleActivities = activities.filter((activity) =>
      explainRejection(activity, effectiveIntent, "activity") == null,
    );
    const pairedResults =
      effectiveIntent.searchType === "activity_pair"
        ? createActivityActivityPairs(
            firstActivityCandidates.length
              ? firstActivityCandidates
              : activities,
            secondActivityCandidates.length
              ? secondActivityCandidates
              : activities,
            effectiveIntent,
            pairingDebug,
          ).filter(
            (pair) =>
              hasUsableLivePhoto(pair.restaurant) &&
              hasUsableLivePhoto(pair.activity),
          )
        : effectiveIntent.wantsPairing
          ? createSearchPairs(
              restaurants,
              pairingEligibleActivities,
              effectiveIntent,
              pairingDebug,
            ).filter(
              (pair) =>
                hasUsableLivePhoto(pair.restaurant) &&
                hasUsableLivePhoto(pair.activity),
            )
          : [];
    let pairs = (
      await applyPairBoosts(
        pairedResults,
        query,
        requestedMarketForResults,
        resolvedMlFlags,
      )
    )
      .filter(
        (pair) =>
          requestedMarketForResults === "LONG_ISLAND" ||
          isPairAllowedForResolvedMarket(pair, requestedMarketForResults),
      )
      .filter(
        (pair) =>
          filterResultsBySearchDomain({
            restaurants: [],
            activities: [],
            pairs: [pair],
            intent: effectiveIntent,
            debug: debug as any,
          }).pairs.length === 1,
      )
      .filter((pair) => {
        const walkingLimitCheck = shouldHidePairForWalkingLimit(
          pair,
          effectiveIntent.pairingPreference,
        );

        if (walkingLimitCheck.hide) {
          const reason = walkingLimitCheck.reason ?? "walking_limit_exceeded";
          pairingDebug.walkingPairsHiddenOverLimit =
            (pairingDebug.walkingPairsHiddenOverLimit ?? 0) + 1;
          pairingDebug.walkingPairRejectReasons =
            pairingDebug.walkingPairRejectReasons ?? {};
          pairingDebug.walkingPairRejectReasons[reason] =
            (pairingDebug.walkingPairRejectReasons[reason] ?? 0) + 1;
        }

        return !walkingLimitCheck.hide;
      });
    const pairQualityRanking = rerankPairs(pairs, effectiveIntent, { mode: qualityMode, debug: qualityDebug });
    pairs = pairQualityRanking.results;
    (debug as any).searchQualityRanking.pairs = pairQualityRanking.evidence;
    (debug as any).searchQualityRanking.rejectedPairs = pairQualityRanking.rejected;
    Object.assign(
      debug,
      serializeSearchRankingExplanations((debug as any).searchQualityRanking),
    );
    if (
      effectiveIntent.searchType === "mixed_outing" &&
      effectiveIntent.wantsPairing &&
      pairs.length === 0 &&
      restaurants.length > 0 &&
      activities.length > 0
    ) {
      const recoveryStarted = Date.now();
      const recoveryDebug = createPairingDebug();
      const explicitWalking = userAskedForWalking(
        effectiveIntent.pairingPreference,
      );
      const capMiles = explicitWalking
        ? 1.5
        : requestedMarketForResults === "LONG_ISLAND"
          ? 12
          : 6;
      const recoveryIntent: SearchIntent = {
        ...effectiveIntent,
        pairingPreference: {
          requiresPairing: true,
          distanceMode: explicitWalking ? "walking" : "nearby",
          maxPairDistanceMiles: capMiles,
          maxPairWalkingMinutes: explicitWalking
            ? (effectiveIntent.pairingPreference?.maxPairWalkingMinutes ?? 35)
            : null,
          requireWalkablePair: explicitWalking,
        },
      };
      const recoveredRaw = createSearchPairs(
        restaurants.slice(0, 12),
        pairingEligibleActivities.slice(0, 12),
        recoveryIntent,
        recoveryDebug,
      )
        .filter((pair) => {
          const miles = getPairDistanceMiles(pair);
          return miles == null || miles <= capMiles;
        })
        .filter(
          (pair) =>
            hasUsableLivePhoto(pair.restaurant) &&
            hasUsableLivePhoto(pair.activity) &&
            (requestedMarketForResults === "LONG_ISLAND" ||
              isPairAllowedForResolvedMarket(pair, requestedMarketForResults)),
        )
        .sort((a, b) => {
          const ad = getPairDistanceMiles(a) ?? Number.POSITIVE_INFINITY;
          const bd = getPairDistanceMiles(b) ?? Number.POSITIVE_INFINITY;
          if (ad !== bd) return ad - bd;
          return Number(b.score ?? 0) - Number(a.score ?? 0);
        });

      if (recoveredRaw.length > 0) {
        pairs = (await applyPairBoosts(
          recoveredRaw.slice(0, 3).map((pair) => ({
            ...pair,
            pairRecovery: true,
            pairDistanceLabel:
              pair.pairDistanceMiles != null
                ? pair.pairDistanceMiles <= 3
                  ? pair.pairDistanceLabel
                  : `About ${pair.pairDistanceMiles.toFixed(1)} miles apart`
                : pair.pairDistanceLabel,
          })),
          query,
          requestedMarketForResults,
          resolvedMlFlags,
        )) as EnterprisePair[];
      }

      (debug as any).pairRecoveryAttempted = true;
      (debug as any).pairRecoveryCapMiles = capMiles;
      (debug as any).pairRecoveryCount = pairs.length;
      (debug as any).pairRecoveryCandidatesEvaluated =
        recoveryDebug.pairCandidatesEvaluated;
      (debug as any).pairRecoveryMs = Date.now() - recoveryStarted;
    }

    let fallbackPairs: EnterprisePair[] = [];
    if (sameVenuePairFallbackIntent && effectiveIntent.needsActivity === true) {
      const fallbackPairStarted = Date.now();
      const fallbackPairingDebug = createPairingDebug();
      const fallbackRestaurants = (
        restaurants.length ? restaurants : displaySafeRestaurants
      ).slice(0, 5);
      const fallbackActivities = photoSafeActivities.slice(0, 5);
      const rawFallbackPairs = createSearchPairs(
        fallbackRestaurants,
        fallbackActivities,
        sameVenuePairFallbackIntent,
        fallbackPairingDebug,
      ).filter(
        (pair) =>
          hasUsableLivePhoto(pair.restaurant) &&
          hasUsableLivePhoto(pair.activity) &&
          isPairAllowedForResolvedMarket(pair, requestedMarketForResults),
      );
      const boostedFallbackPairs = await applyPairBoosts(
        rawFallbackPairs.slice(0, 3),
        query,
        requestedMarketForResults,
        resolvedMlFlags,
      );
      fallbackPairs = boostedFallbackPairs.slice(0, 3).map((pair) => ({
        ...pair,
        fallbackPair: true,
        fallbackReason:
          (debug as any).sameVenueFallbackReason ??
          "no_strong_single_venue_match",
        restaurantName:
          pair.restaurant.name || pair.restaurant.restaurant_name || null,
        activityName: pair.activity.name || pair.activity.activity_name || null,
        primaryMatchedIntent: (debug as any).fallbackPrimaryTerms ?? [],
        secondaryMatchedIntent: (debug as any).fallbackSecondaryTerms ?? [],
      }));
      (debug as any).fallbackPairScoringApplied = true;
      (debug as any).fallbackRestaurantCount = fallbackRestaurants.length;
      (debug as any).fallbackActivityCount = fallbackActivities.length;
      (debug as any).fallbackPairCount = fallbackPairs.length;
      (debug as any).fallback_pair_count = fallbackPairs.length;
      (debug as any).fallbackPairBuildMs = Date.now() - fallbackPairStarted;
      (debug as any).fallbackPairCandidatesEvaluated =
        fallbackPairingDebug.pairCandidatesEvaluated;
      (debug as any).fallbackPairDistanceChecks =
        fallbackPairingDebug.pairCandidatesEvaluated;
      (debug as any).fallbackPairsBeforeLimit = rawFallbackPairs.length;
      (debug as any).fallbackPairsAfterLimit = fallbackPairs.length;
      (debug as any).fallbackPairEarlyStopUsed =
        fallbackPairingDebug.pairCandidatesEvaluated <
        fallbackRestaurants.length * fallbackActivities.length;
      (debug as any).fallbackPairDistanceMiles = fallbackPairs.map(
        (pair) => pair.pairDistanceMiles,
      );
      (debug as any).sameVenueFallbackToPairingUsed = fallbackPairs.length > 0;
      (debug as any).sameVenueFallbackPairDebug = fallbackPairs.map((pair) => ({
        fallbackPair: true,
        fallbackReason: (pair as any).fallbackReason,
        restaurantName: (pair as any).restaurantName,
        activityName: (pair as any).activityName,
        pairDistanceMiles: pair.pairDistanceMiles,
        phase2PairScore: (pair as any).phase2PairScore ?? null,
        phase2PairReason: (pair as any).phase2PairReason ?? null,
        primaryMatchedIntent: (pair as any).primaryMatchedIntent,
        secondaryMatchedIntent: (pair as any).secondaryMatchedIntent,
      }));
    } else if ((debug as any).sameVenueFallbackToPairingUsed == null) {
      (debug as any).sameVenueFallbackToPairingUsed = false;
      (debug as any).fallbackPairCount = 0;
      (debug as any).fallback_pair_count = 0;
    }

    perf.pairing_ms = performance.now() - pairingStarted;
    const candidatePairCountBeforeRequiredPairSuppression = pairs.length;
    const fallbackSuppressedBecauseExplicitMarket =
      explicitMarketRequested &&
      (marketGuardrailRejected > 0 || suppressedMarketMismatchCount > 0);
    const requiredPairingSuppressedFallback =
      requiresStrictMixedPair(effectiveIntent) &&
      pairs.length === 0 &&
      restaurants.length === 0 &&
      activities.length === 0 &&
      !(
        explicitMarketRequested &&
        requestedMarketForResults === "LONG_ISLAND" &&
        (restaurants.length > 0 || activities.length > 0)
      );
    const requiredPairingFailureReasonValue = requiredPairingSuppressedFallback
      ? requiredPairingFailureReason(
          candidateRestaurantCountBeforeRequiredPairSuppression,
          candidateActivityCountBeforeRequiredPairSuppression,
          candidatePairCountBeforeRequiredPairSuppression,
          effectiveIntent,
        )
      : null;

    if (requiredPairingSuppressedFallback) {
      restaurants = [];
      activities = [];
      pairs = [];
    }

    const sameLocationComboMode =
      effectiveIntent.searchType === "same_location_combo" ||
      (effectiveIntent as any).sameLocationRequired === true;
    const comboCanonical = sameLocationComboMode
      ? buildCanonicalSameLocationComboList(
          [restaurants, activities],
          effectiveIntent,
        )
      : null;

    let matched_locations = requiredPairingSuppressedFallback
      ? []
      : sameLocationComboMode
        ? (comboCanonical?.locations ?? []).slice(0, displayLimit * 2)
        : uniqueById([...restaurants, ...activities]).slice(
            0,
            displayLimit * 2,
          );

    if (sameLocationComboMode && !requiredPairingSuppressedFallback) {
      restaurants = matched_locations.slice(0, displayLimit);
      activities = [];
      pairs = [];
      fallbackPairs = [];
      matched_locations = restaurants;
      (debug as any).comboCandidateRawCount = comboCanonical?.rawCount ?? 0;
      (debug as any).comboCandidateDedupedCount =
        comboCanonical?.dedupedCount ?? 0;
      (debug as any).comboDuplicateLocationIdsRemoved =
        comboCanonical?.duplicateLocationIdsRemoved ?? 0;
      (debug as any).comboCanonicalSourceCounts =
        comboCanonical?.sourceCounts ?? {
          restaurants: 0,
          activities: 0,
          matched_locations: 0,
          other: 0,
        };
      (debug as any).comboRestaurantsOutputCount = restaurants.length;
      (debug as any).comboActivitiesOutputCount = activities.length;
      (debug as any).fallbackPairCount = 0;
      (debug as any).fallback_pair_count = 0;
      (debug as any).sameVenueFallbackToPairingUsed = false;
    }

    (debug as any).finalDisplayedResultCount = matched_locations.length;
    if (
      Number((debug as any).sameVenueRecoveryResultCount ?? 0) > 0 &&
      matched_locations.length === 0
    ) {
      (debug as any).sameVenueRecoveryFinalEmptyReason =
        Number((debug as any).sameVenueAfterComboEligibilityCount ?? 0) === 0
          ? "all candidates rejected by combo eligibility or strict term matching"
          : Number((debug as any).sameVenueAfterMarketGuardrailCount ?? 0) === 0
            ? "all candidates rejected by market guardrail"
            : Number((debug as any).sameVenueAfterPhotoSafetyCount ?? 0) === 0
              ? "all candidates rejected by photo safety"
              : requiredPairingSuppressedFallback
                ? "all candidates suppressed by required pairing guardrail"
                : "candidates available before display but final display was empty";
    }
    const mlDebugResults = matched_locations.map((item, index) =>
      createMlResultDebug(item, index + 1),
    );
    (debug as any).mlSearchDebug =
      options?.searchHealthDebug || options?.betaDebug
        ? summarizeMlDebug(
            mlDebugResults,
            query,
            Number((debug as any).mlRanking?.restaurantScoresLoaded ?? 0) +
              Number((debug as any).mlRanking?.activityScoresLoaded ?? 0),
            mlDebugResults.filter(
              (item) => Number(item.phase2IntentScore ?? 0) > 0,
            ).length,
          )
        : undefined;
    const isActivityActivityPairSearch =
      effectiveIntent.searchType === "activity_pair";
    const renderModeBeforeSameVenueGuard = effectiveIntent.wantsPairing
      ? "mixed_pairs"
      : null;
    const render_mode = requiredPairingSuppressedFallback
      ? "empty"
      : isActivityActivityPairSearch
        ? pairs.length
          ? "activity_activity_pairs"
          : activities.length
            ? "activity_cards"
            : "empty"
        : effectiveIntent.wantsPairing
          ? pairs.length
            ? "mixed_pairs"
            : restaurants.length || activities.length
              ? "partial_mixed"
              : "empty"
          : restaurants.length
            ? (effectiveIntent as any).sameLocationRequired &&
              effectiveIntent.searchType === "same_location_combo"
              ? "combo_location_cards"
              : "restaurant_cards"
            : activities.length
              ? "activity_cards"
              : "empty";
    const fallbackPairsUsedAsPrimary =
      effectiveIntent.needsActivity === true &&
      !(effectiveIntent as any).sameLocationRequired &&
      Boolean((debug as any).sameVenueFallbackToPairingUsed) &&
      Number((debug as any).sameVenueStrongMatchCount ?? 0) === 0 &&
      fallbackPairs.length > 0;
    const primaryResultType = fallbackPairsUsedAsPrimary
      ? "fallback_pairs"
      : render_mode === "restaurant_cards"
        ? "restaurant_cards"
        : render_mode === "mixed_pairs"
          ? "pairs"
          : render_mode;
    (debug as any).fallbackPairsUsedAsPrimary = fallbackPairsUsedAsPrimary;
    (debug as any).primaryResultType = primaryResultType;
    (debug as any).fallback_pair_count = fallbackPairs.length;

    // Final public cards are shaped by the route layer after this response is assembled;
    // these restaurant/activity/pair arrays are the user-visible surfaces available
    // in this enterprise response path for duplicate-location diagnostics.
    const preDedupeDiagnostics = detectDuplicateSearchLocations({
      restaurants,
      activities,
      pairs,
      allowSameLocationCombos: sameLocationComboMode,
    });
    const dedupedFinalResults = dedupeFinalSearchResults({
      restaurants,
      activities,
      pairs,
      allowSameLocationCombos: sameLocationComboMode,
    });
    restaurants = dedupedFinalResults.restaurants;
    activities = dedupedFinalResults.activities;
    pairs = dedupedFinalResults.pairs;
    matched_locations = sameLocationComboMode
      ? restaurants
      : uniqueById([...restaurants, ...activities]).slice(0, displayLimit * 2);
    const postDedupeDiagnostics = detectDuplicateSearchLocations({
      restaurants,
      activities,
      pairs,
      allowSameLocationCombos: sameLocationComboMode,
    });
    const duplicateDiagnostics = preDedupeDiagnostics.duplicateLocationShown
      ? preDedupeDiagnostics
      : postDedupeDiagnostics;
    (debug as any).duplicateLocationShown =
      duplicateDiagnostics.duplicateLocationShown;
    (debug as any).duplicateLocationCount =
      duplicateDiagnostics.duplicateLocationCount;
    (debug as any).duplicateLocationErrors =
      duplicateDiagnostics.duplicateLocationErrors;
    (debug as any).duplicateLocationWarnings =
      duplicateDiagnostics.duplicateLocationWarnings;
    (debug as any).duplicateLocationKeys =
      duplicateDiagnostics.duplicateLocationKeys;
    (debug as any).duplicateLocationDetails =
      duplicateDiagnostics.duplicateLocationDetails;
    if (duplicateDiagnostics.duplicateLocationErrors.length > 0) {
      (debug as any).errors = [
        ...((Array.isArray((debug as any).errors)
          ? (debug as any).errors
          : []) as string[]),
        ...duplicateDiagnostics.duplicateLocationErrors,
      ];
    }
    if (duplicateDiagnostics.duplicateLocationWarnings.length > 0) {
      (debug as any).warnings = [
        ...((Array.isArray((debug as any).warnings)
          ? (debug as any).warnings
          : []) as string[]),
        ...duplicateDiagnostics.duplicateLocationWarnings,
      ];
    }

    const card_counts = {
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: matched_locations.length,
      pairs: pairs.length,
      fallbackPairs: fallbackPairs.length,
      fallback_pair_count: fallbackPairs.length,
    };
    const pairDisplayLabels = pairs
      .map((pair) =>
        formatDistanceFromRestaurant({
          pair,
          restaurantName:
            pair.restaurant.name ||
            pair.restaurant.restaurant_name ||
            "Restaurant",
          pairingPreference: effectiveIntent.pairingPreference,
        }),
      )
      .filter((label): label is string => Boolean(label));
    const displayedWalkingMinuteLabels = pairDisplayLabels.filter((label) =>
      /\b\d+\s+min walk from\b/i.test(label),
    ).length;
    const displayedMilesLabels = pairDisplayLabels.filter((label) =>
      /\b\d+(?:\.\d+)?\s+mi from\b/i.test(label),
    ).length;
    const walkingRequested = userAskedForWalking(
      effectiveIntent.pairingPreference,
    );
    const walkingMinutesEstimatedFromMiles = pairs.filter(
      (pair) =>
        walkingRequested &&
        getRawWalkingMinutes(pair) == null &&
        getSafeWalkingMinutes(pair) != null &&
        getPairDistanceMiles(pair) != null,
    ).length;
    const pairsWithGoogleWalkingMinutes = pairs.filter(
      (pair) => getRawWalkingMinutes(pair) != null,
    ).length;
    const pairsMissingGoogleWalkingMinutes =
      pairs.length - pairsWithGoogleWalkingMinutes;
    const pairCityStates = pairs.map((pair) => getPairCityState(pair));
    const pairGeoPriorities = pairs.map((pair) =>
      getPairGeoPriority(pair, effectiveIntent.geo),
    );
    const pairGeoSummary = {
      sameCityPairs: pairCityStates.filter(
        (pair) => pair.samePairCity && pair.samePairState,
      ).length,
      sameStatePairs: pairCityStates.filter((pair) => pair.samePairState)
        .length,
      differentCityPairs: pairCityStates.filter(
        (pair) =>
          pair.restaurantCity &&
          pair.activityCity &&
          pair.restaurantCity !== pair.activityCity,
      ).length,
      differentStatePairs: pairCityStates.filter(
        (pair) =>
          pair.restaurantState &&
          pair.activityState &&
          pair.restaurantState !== pair.activityState,
      ).length,
      missingCoordinatePairs: pairCityStates.filter(
        (pair) => !pair.hasBothCoords,
      ).length,
    };
    const longIslandSinglesFallbackMessage =
      explicitMarketRequested &&
      requestedMarketForResults === "LONG_ISLAND" &&
      pairs.length === 0 &&
      (restaurants.length > 0 || activities.length > 0)
        ? "We found Long Island picks, but we’re still building more complete outing pairings."
        : null;
    const noPairsReason =
      requiredPairingFailureReasonValue ??
      (effectiveIntent.wantsPairing &&
      pairs.length === 0 &&
      restaurants.length > 0 &&
      activities.length > 0
        ? "pair_count_below_recovery_threshold"
        : effectiveIntent.wantsPairing &&
            pairs.length === 0 &&
            restaurants.length > 0 &&
            activities.length === 0
          ? "no_activity_results_for_required_pair"
          : effectiveIntent.wantsPairing &&
              pairs.length === 0 &&
              effectiveIntent.needsRestaurant !== false &&
              effectiveIntent.searchType !== "activity_pair" &&
              activities.length > 0 &&
              restaurants.length === 0
            ? "no_restaurant_results_for_required_pair"
            : null) ??
      (effectiveIntent.wantsPairing &&
      pairs.length === 0 &&
      activities.length > 0 &&
      restaurants.length > 0 &&
      (effectiveIntent.pairingPreference?.distanceMode === "walking" ||
        effectiveIntent.pairingPreference?.distanceMode === "short_walk" ||
        effectiveIntent.pairingPreference?.requireWalkablePair === true)
        ? "no_pairs_within_walking_distance"
        : null);
    perf.total_ms = performance.now() - started;
    perf.rpc_ms = Math.min(perf.rpc_ms, perf.total_ms);
    perf.intent_parse_ms = Math.min(perf.intent_parse_ms, perf.total_ms);
    perf.ranking_ms = Math.min(perf.ranking_ms, perf.total_ms);
    const locationArea =
      effectiveIntent.geo.neighborhood ??
      effectiveIntent.geo.borough ??
      effectiveIntent.geo.city ??
      effectiveIntent.geo.county ??
      effectiveIntent.geo.raw ??
      null;
    const speedStatus = getSearchSpeedStatus({
      totalMs: perf.total_ms,
      success: true,
    });
    const performanceDebug = {
      ...perf,
      speed_status: speedStatus,
      result_count: matched_locations.length,
      restaurant_count: restaurants.length,
      activity_count: activities.length,
      pair_count: pairs.length,
      fallback_pair_count: fallbackPairs.length,
      fallbackPairsUsedAsPrimary,
      primaryResultType,
      source: options?.source ?? "enterprise_search",
      route: options?.route ?? null,
      used_custom_prompt: Boolean(options?.usedCustomPrompt),
      intentParserSource: parserDebug.intentParserSource ?? intentParserSource ?? (effectiveIntent as any).intentParserSource ?? null,
      parser_source: parserDebug.intentParserSource ?? intentParserSource ?? (effectiveIntent as any).intentParserSource ?? null,
      fastPathMatched,
      fastPathReason,
      searchMode:
        (effectiveIntent as any).normalizedIntent ?? effectiveIntent.searchType,
      normalizedIntentLabel: (effectiveIntent as any).normalizedIntent ?? null,
      searchType: effectiveIntent.searchType,
      primaryDomain: effectiveIntent.primaryDomain,
      wantsPairing: effectiveIntent.wantsPairing,
      needsRestaurant: effectiveIntent.needsRestaurant,
      needsActivity: effectiveIntent.needsActivity,
      sameLocationRequired:
        (effectiveIntent as any).sameLocationRequired ?? false,
      sameVenuePreferred: (effectiveIntent as any).sameVenuePreferred ?? false,
      pairingIntent: (effectiveIntent as any).pairingIntent ?? null,
      pairRequested:
        (effectiveIntent as any).pairRequested ?? effectiveIntent.wantsPairing,
      fallbackPairAllowed:
        (effectiveIntent as any).fallbackPairAllowed ?? false,
      sameVenueStrongMatchCount: (debug as any).sameVenueStrongMatchCount ?? 0,
      sameVenueFallbackToPairingAttempted:
        (debug as any).sameVenueFallbackToPairingAttempted ?? false,
      sameVenueFallbackToPairingUsed:
        (debug as any).sameVenueFallbackToPairingUsed ?? false,
      sequenceDetected: (effectiveIntent as any).sequenceDetected ?? false,
      proximityDetected: (effectiveIntent as any).proximityDetected ?? false,
      sameVenueReason: (effectiveIntent as any).sameVenueReason ?? null,
      coLocationTermsMatched:
        (effectiveIntent as any).coLocationTermsMatched ?? [],
      primaryTerms: (effectiveIntent as any).primaryTerms ?? [],
      secondaryAttributeTerms:
        (effectiveIntent as any).secondaryAttributeTerms ?? [],
      parserPriorityApplied:
        (effectiveIntent as any).parserPriorityApplied ?? false,
      parserPriorityReason:
        (effectiveIntent as any).parserPriorityReason ??
        fastPathReason ??
        parserDebug.preIntentReason ??
        null,
      renderModeBeforeSameVenueGuard,
      renderModeAfterSameVenueGuard: render_mode,
      wantsPairingBeforeSameVenueGuard:
        (effectiveIntent as any).wantsPairingBeforeSameVenueGuard ??
        effectiveIntent.wantsPairing,
      wantsPairingAfterSameVenueGuard: effectiveIntent.wantsPairing,
      needsActivityBeforeSameVenueGuard:
        (effectiveIntent as any).needsActivityBeforeSameVenueGuard ??
        effectiveIntent.needsActivity,
      needsActivityAfterSameVenueGuard: effectiveIntent.needsActivity,
      beta_assignment_id: options?.betaAssignmentId ?? null,
      beta_tester_id: options?.betaTesterId ?? null,
    };
    if (process.env.NODE_ENV !== "production" && explicitMarketRequested) {
      console.log("[enterprise-search] market guardrail", {
        rawQuery: query,
        resolvedMarket: requestedMarketForResults,
        marketFilterApplied: true,
        countBeforeGuardrail:
          rankedRestaurants.length + rankedActivities.length,
        countAfterGuardrail:
          marketSafeRestaurants.length + marketSafeActivities.length,
        sampleRejectedMarkets,
      });
    }
    const fullDebug = {
      search_system: "enterprise-search-v1",
      rawQuery: query,
      rawQueryForDebug: query,
      llmIntentRaw,
      intentParserSource: parserDebug.intentParserSource ?? intentParserSource ?? (effectiveIntent as any).intentParserSource ?? null,
      parser_source: parserDebug.intentParserSource ?? intentParserSource ?? (effectiveIntent as any).intentParserSource ?? null,
      fastPathMatched,
      fastPathReason,
      searchMode:
        (effectiveIntent as any).normalizedIntent ?? effectiveIntent.searchType,
      normalizedIntentLabel: (effectiveIntent as any).normalizedIntent ?? null,
      searchType: effectiveIntent.searchType,
      primaryDomain: effectiveIntent.primaryDomain,
      wantsPairing: effectiveIntent.wantsPairing,
      needsRestaurant: effectiveIntent.needsRestaurant,
      needsActivity: effectiveIntent.needsActivity,
      preIntentSource: parserDebug.preIntentSource,
      preIntentMatched: parserDebug.preIntentMatched,
      preIntentReason: parserDebug.preIntentReason,
      intentLlmModel: parserDebug.intentLlmModel,
      intentLlmFastModel: parserDebug.intentLlmFastModel,
      intentLlmFallbackModel: parserDebug.intentLlmFallbackModel,
      llmEnhancementUsed: parserDebug.llmEnhancementUsed,
      llmFallbackUsed: parserDebug.llmFallbackUsed,
      llmTimedOut: parserDebug.llmTimedOut,
      fallbackIntentUsed: parserDebug.fallbackIntentUsed,
      intentCacheHit: parserDebug.intentCacheHit,
      intentCacheVersion: parserDebug.intentCacheVersion,
      normalizedIntent: effectiveIntent,
      restaurantRankingIntent,
      restaurantRecoveryReason: debug.restaurantRecoveryReason ?? null,
      restaurantRecoveryTermsTried: debug.restaurantRecoveryTermsTried ?? [],
      restaurantRecoveryAttemptResults:
        debug.restaurantRecoveryAttemptResults ?? [],
      restaurantRecoveryRelaxedFood: Boolean(
        debug.restaurantRecoveryRelaxedFood,
      ),
      restaurantRecoveryRelaxedFeature: Boolean(
        debug.restaurantRecoveryRelaxedFeature,
      ),
      restaurantRecoverySucceeded: Boolean(debug.restaurantRecoverySucceeded),
      restaurantTerms: restaurantSearchTerms(effectiveIntent),
      activityTerms: activitySearchTerms(effectiveIntent),
      geo: marketResolution.effectiveGeo,
      originalGeo: marketResolution.originalGeo,
      effectiveGeo: marketResolution.effectiveGeo,
      defaultMarketApplied: marketResolution.marketApplied,
      defaultMarketId: marketResolution.market?.id ?? null,
      defaultMarketLabel: marketResolution.market?.label ?? null,
      defaultMarketRadiusMiles: marketResolution.market?.radiusMiles ?? null,
      marketReason: marketResolution.marketReason,
      geoSource,
      usesCurrentLocation,
      hasVerifiedUserLocation,
      pairProximityRequested,
      nearbyPairIntent: pairProximityRequested && !usesCurrentLocation,
      userLocationUsedAsPrimaryGeo: usesCurrentLocation,
      ...requestNearMeDebug,
      resolvedMarket: requestedMarketForResults,
      explicitMarketRequested,
      fallbackSuppressedBecauseExplicitMarket,
      marketGuardrailRejected,
      sampleRejectedMarkets,
      rankedRestaurantCountBeforeMarketGuardrail: rankedRestaurants.length,
      rankedActivityCountBeforeMarketGuardrail: rankedActivities.length,
      marketSafeRestaurantCount: marketSafeRestaurants.length,
      marketSafeActivityCount: marketSafeActivities.length,
      photoSafeRestaurantCount: photoSafeRestaurants.length,
      photoSafeActivityCount: photoSafeActivities.length,
      photoSuppressedRestaurantCount: photoSuppressedRestaurants.length,
      photoSuppressedActivityCount: photoSuppressedActivities.length,
      samplePhotoSuppressedRestaurants: photoSuppressedRestaurants
        .slice(0, 8)
        .map(imageDebugFor),
      samplePhotoSuppressedActivities: photoSuppressedActivities
        .slice(0, 8)
        .map(imageDebugFor),
      parsedMarket: requestedMarketForResults,
      parsedBorough: effectiveIntent.geo.borough ?? null,
      parsedCity: effectiveIntent.geo.city ?? null,
      finalResultMarketsReturned: Array.from(
        new Set(
          [...restaurants, ...activities].map(
            (item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`,
          ),
        ),
      ),
      rpcGeoLatitude: marketResolution.effectiveGeo.latitude ?? null,
      rpcGeoLongitude: marketResolution.effectiveGeo.longitude ?? null,
      rpcRadiusMiles: marketResolution.effectiveGeo.radiusMiles ?? null,
      ...parserDebug,
      ...debug,
      restaurantRejectedReasons,
      activityRejectedReasons,
      restaurantRejectedSummary,
      activityRejectedSummary,
      intentMismatchRejectedCount: activityIntentMismatchDiagnostics.length,
      activityIntentMismatchRejectedCount: activityIntentMismatchDiagnostics.length,
      intentMismatchRejectedSample: options?.betaDebug
        ? activityIntentMismatchDiagnostics.slice(0, 5).map((item) => ({
            id: item.record.id ?? null,
            name: item.record.name || item.record.activity_name || null,
            requestedIntent: effectiveIntent.activityIntent.activityTerms,
            canonicalCategories: [
              (item.record as any).activity_type,
              (item.record as any).primary_category,
              (item.record as any).categories,
              (item.record as any).subcategories,
              (item.record as any).tags,
            ].flat().filter(Boolean),
            reason: item.reason,
          }))
        : undefined,
      distanceScoringUsed: Boolean(
        effectiveIntent.geo.latitude && effectiveIntent.geo.longitude,
      ),
      activityPairIntent,
      firstActivityCandidateCount: firstActivityCandidates.length,
      secondActivityCandidateCount: secondActivityCandidates.length,
      activityActivityPairCandidateCount: isActivityActivityPairSearch
        ? pairingDebug.validPairCountBeforeRender
        : 0,
      activityActivityPairCount: isActivityActivityPairSearch
        ? pairs.length
        : 0,
      activityActivityPairsRejectedForDistance: isActivityActivityPairSearch
        ? pairingDebug.pairsRejectedForDistance
        : 0,
      activityPairFallbackReason:
        isActivityActivityPairSearch &&
        pairs.length === 0 &&
        activities.length > 0
          ? "no_valid_activity_activity_pairs_showing_activity_fallback"
          : null,
      pair_type: isActivityActivityPairSearch
        ? "activity_activity"
        : pairs.length
          ? "restaurant_activity"
          : null,
      pairDistanceMiles: pairs.map((p) => p.pairDistanceMiles),
      pairGeoPriorities,
      pairGeoSummary,
      restaurantQualityScoringApplied: true,
      activityQualityScoringApplied: true,
      pairQualityScoringApplied: true,
      restaurantQualityScorePreview,
      activityQualityScorePreview,
      pairQualityScorePreview: pairingDebug.pairQualityScorePreview,
      restaurantOutingFitScorePreview,
      weakOutingFitRestaurantCount: pairingDebug.weakOutingFitRestaurantCount,
      suppressedWeakOutingFitPairCount:
        pairingDebug.suppressedWeakOutingFitPairCount,
      pairQualityTierCounts: pairingDebug.pairQualityTierCounts,
      suppressedLowQualityRestaurantCount,
      suppressedLowQualityActivityCount,
      suppressedMarketMismatchCount,
      marketMismatchResultCount: suppressedMarketMismatchCount,
      marketStateMismatchCount: suppressedMarketMismatchCount,
      suppressedLowQualityPairCount: pairingDebug.suppressedLowQualityPairCount,
      finalPairSortReason: pairingDebug.finalPairSortReason,
      renderedPairSort: {
        primary: "default_market_pair_priority",
        secondary: "geo_priority",
        tertiary: "pair_quality_tier",
        quaternary: "pair_distance_miles",
        quinary: "safe_walking_minutes",
        senary: "pair_quality_score",
      },
      walkingPolicy: {
        shortWalkMaxPairDistanceMiles: 0.75,
        shortWalkMaxPairWalkingMinutes: 15,
        walkingMaxPairDistanceMiles: 1.5,
        walkingMaxPairWalkingMinutes: 30,
        walkingMinutesToMilesBasis: "20_minutes_per_mile",
        explicitWalkingMinutesSupported: true,
        explicitWalkingMinutesMax: 45,
        missingCoordinateFallback: true,
        googleWalkingRouteAuthoritative: true,
        extremeWalkingRouteMinuteCutoff: 180,
      },
      pairingPreference: effectiveIntent.pairingPreference,
      countBeforeMarketGuardrail:
        rankedRestaurants.length + rankedActivities.length,
      countAfterMarketGuardrail:
        marketSafeRestaurants.length + marketSafeActivities.length,
      restaurantCount: restaurants.length,
      activityCount: activities.length,
      sampleReturnedMarkets: Array.from(
        new Set(
          [...restaurants, ...activities].map(
            (item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`,
          ),
        ),
      ).slice(0, 8),
      supabaseFiltersApplied: {
        market: requestedMarketForResults,
        state: requestedMarketForResults === "NORTHERN_NJ" ? "NJ" : "NY",
        is_searchable: true,
        city: null,
        borough: null,
        address: null,
      },
      longIslandSinglesFallbackMessage,
      activityRpcCountBeforePairing: activities.length,
      activityRpcCountAfterRecovery: activityRaw.length,
      activityRpcCountBeforeRecovery: activityRpcCountBeforeRecovery,
      pairCandidatesEvaluated: pairingDebug.pairCandidatesEvaluated,
      validPairCountBeforeRender: pairingDebug.validPairCountBeforeRender,
      pair_count: pairs.length,
      pairsRejectedForDistance: pairingDebug.pairsRejectedForDistance,
      pairsRejectedForWalkingMinutes:
        pairingDebug.pairsRejectedForWalkingMinutes,
      walkingPairsHiddenOverLimit: pairingDebug.walkingPairsHiddenOverLimit,
      walkingPairRejectReasons: pairingDebug.walkingPairRejectReasons,
      extremeWalkingRoutesRejected: pairingDebug.extremeWalkingRoutesRejected,
      walkingMinutesEstimatedFromMiles,
      pairsWithGoogleWalkingMinutes,
      pairsMissingGoogleWalkingMinutes,
      displayedWalkingMinuteLabels,
      displayedMilesLabels,
      invalidWalkingRoutesHiddenFromDisplay:
        pairingDebug.invalidWalkingRoutesHiddenFromDisplay,
      pairsRejectedForMissingCoordinates:
        pairingDebug.pairsRejectedForMissingCoordinates,
      rejectedPairs: pairingDebug.rejectedPairs,
      walkablePairsFound: pairingDebug.walkablePairsFound,
      noPairsReason,
      no_pairs_reason: noPairsReason,
      recoveryLayerUsed: Boolean(
        debug.restaurantRecoveryUsed || debug.activityRecoveryUsed,
      ),
      recoverySucceeded: Boolean(
        debug.restaurantRecoverySucceeded ||
        (debug as any).activityRecoverySucceeded,
      ),
      recoveryLevel: (debug as any).activityRecoveryLevel ?? null,
      partialResultsReturned:
        effectiveIntent.wantsPairing &&
        pairs.length < MIN_PAIR_RESULTS &&
        (restaurants.length > 0 || activities.length > 0),
      pairRecoveryNeeded:
        effectiveIntent.wantsPairing && pairs.length < MIN_PAIR_RESULTS,
      budgetIntentDetected: budgetIntentDetected(effectiveIntent),
      budgetHardFilterDisabled: budgetIntentDetected(effectiveIntent),
      budgetRankingPreferenceApplied: budgetIntentDetected(effectiveIntent),
      requiredPairingSuppressedFallback,
      requiredPairingFailureReason: requiredPairingFailureReasonValue,
      candidateRestaurantCountBeforeRequiredPairSuppression,
      candidateActivityCountBeforeRequiredPairSuppression,
      candidatePairCountBeforeRequiredPairSuppression,
      finalDisplayedResultCount: matched_locations.length,
      maxPairDistanceMiles:
        effectiveIntent.pairingPreference?.maxPairDistanceMiles ?? null,
      maxPairWalkingMinutes:
        effectiveIntent.pairingPreference?.maxPairWalkingMinutes ?? null,
      requireWalkablePair:
        effectiveIntent.pairingPreference?.requireWalkablePair ?? false,
      distanceMode: effectiveIntent.pairingPreference?.distanceMode ?? "any",
      searchIntentMode:
        (effectiveIntent as any).normalizedIntent ?? effectiveIntent.searchType,
      sameLocationRequired:
        (effectiveIntent as any).sameLocationRequired ?? false,
      comboCandidateCount: sameLocationComboMode
        ? ((debug as any).comboCandidateDedupedCount ??
          matched_locations.length)
        : ((debug as any).sameVenueStrongMatchCount ??
          (debug as any).singleVenueWithStrongDualMatchCount ??
          0),
      dedupedResultCount: matched_locations.length,
      fallbackMode:
        render_mode === "partial_mixed" || fallbackPairsUsedAsPrimary
          ? render_mode
          : null,
      renderMode: fallbackPairsUsedAsPrimary ? "fallback_pairs" : render_mode,
      primaryResultType,
      fallbackPairsUsedAsPrimary,
      fallback_pair_count: fallbackPairs.length,
      timingMs: perf.total_ms,
      performance: performanceDebug,
      restaurantRecoveryUsed: Boolean(debug.restaurantRecoveryUsed),
      activityRecoveryUsed: Boolean(debug.activityRecoveryUsed),
      llmError,
    };
    if (options?.logPerformance) {
      void logSearchPerformance({
        userId: options.userId,
        sessionId: options.sessionId,
        source: options.source ?? "enterprise_search",
        route: options.route ?? null,
        searchQuery: query,
        betaAssignmentId: options.betaAssignmentId,
        betaTesterId: options.betaTesterId,
        usedCustomPrompt: options.usedCustomPrompt,
        parsedIntent: effectiveIntent,
        searchMode: render_mode,
        locationArea,
        startedAt,
        completedAt: new Date(),
        totalMs: perf.total_ms,
        llmMs: perf.llm_ms,
        rpcMs: perf.rpc_ms,
        restaurantRpcMs: perf.restaurant_rpc_ms,
        activityRpcMs: perf.activity_rpc_ms,
        rankingMs: perf.ranking_ms,
        pairingMs: perf.pairing_ms,
        photoFilterMs: perf.photo_filter_ms,
        resultCount: matched_locations.length,
        restaurantCount: restaurants.length,
        activityCount: activities.length,
        pairCount: pairs.length,
        usedLlm,
        usedFallback,
        success: true,
        debug: options.betaDebug ? performanceDebug : null,
      });
    }
    const responseDebug = options?.betaDebug
      ? fullDebug
      : productionSafeDebug(fullDebug);
    const emptyExplicitLongIsland =
      requestedMarketForResults === "LONG_ISLAND" &&
      matched_locations.length === 0;
    const responseReply = sameLocationComboMode
      ? matched_locations.length > 0
        ? "Found places that fit this in one spot."
        : "I couldn’t find a strong same-place match for that search yet."
      : (longIslandSinglesFallbackMessage ??
        (emptyExplicitLongIsland
          ? "We’re still expanding Long Island picks. Try a broader search like ‘dinner and activity in Long Island’ or check back soon."
          : replyFor(restaurants, activities, pairs, effectiveIntent, {
              used: Boolean(debug.neighborhoodRecoveryUsed),
              from: debug.neighborhoodRecoveryFrom ?? null,
              to: debug.neighborhoodRecoveryTo ?? null,
            })));
    const response: EnterpriseSearchResult = {
      success: true,
      reply: fallbackPairsUsedAsPrimary
        ? `No strong single-venue match found. Here is a ${
            ((debug as any).fallbackPrimaryTerms ?? [])[0] ?? "restaurant"
          } + ${
            ((debug as any).fallbackSecondaryTerms ?? [])[0] ?? "activity"
          } plan nearby.`
        : responseReply,
      restaurants,
      activities,
      pairs,
      fallbackPairs,
      recommendedFallbackPairs: fallbackPairs,
      pairedFallbackUsed: fallbackPairs.length > 0,
      fallbackPairsUsedAsPrimary,
      primaryResultType,
      matched_locations,
      matchedLocations: matched_locations,
      render_mode,
      searchMode:
        (effectiveIntent as any).normalizedIntent ?? effectiveIntent.searchType,
      sameLocationRequired:
        (effectiveIntent as any).sameLocationRequired ?? false,
      comboCandidateCount: sameLocationComboMode
        ? ((debug as any).comboCandidateDedupedCount ??
          matched_locations.length)
        : ((debug as any).sameVenueStrongMatchCount ??
          (debug as any).singleVenueWithStrongDualMatchCount ??
          0),
      dedupedResultCount: matched_locations.length,
      fallbackMode:
        render_mode === "partial_mixed" || fallbackPairsUsedAsPrimary
          ? render_mode
          : null,
      renderMode: fallbackPairsUsedAsPrimary ? "fallback_pairs" : render_mode,
      card_counts,
      cardCounts: card_counts,
      duplicateLocationShown: duplicateDiagnostics.duplicateLocationShown,
      duplicateLocationCount: duplicateDiagnostics.duplicateLocationCount,
      duplicateLocationErrors: duplicateDiagnostics.duplicateLocationErrors,
      duplicateLocationWarnings: duplicateDiagnostics.duplicateLocationWarnings,
      duplicateLocationKeys: duplicateDiagnostics.duplicateLocationKeys,
      debug: responseDebug,
    };
    void logSearchHealthEvent({
      source: options?.source ?? "enterprise_search",
      rawQuery: query,
      result: response,
      debug: fullDebug,
      createdByUserId: options?.createdByUserId ?? options?.userId ?? null,
      betaAssignmentId: options?.betaAssignmentId ?? null,
      betaTesterId: options?.betaTesterId ?? null,
      debugMode: Boolean(options?.searchHealthDebug ?? options?.betaDebug),
      betaFeedbackSubmitted: options?.betaFeedbackSubmitted === true,
    });
    return response;
  } catch (error) {
    const totalMs = Date.now() - started;
    if (options?.logPerformance) {
      void logSearchPerformance({
        userId: options.userId,
        sessionId: options.sessionId,
        source: options.source ?? "enterprise_search",
        route: options.route ?? null,
        searchQuery: query,
        betaAssignmentId: options.betaAssignmentId,
        betaTesterId: options.betaTesterId,
        usedCustomPrompt: options.usedCustomPrompt,
        parsedIntent,
        startedAt,
        completedAt: new Date(),
        totalMs,
        usedLlm,
        success: false,
        errorMessage: errorMessageForDebug(error),
      });
    }
    void logSearchHealthEvent({
      source: options?.source ?? "enterprise_search",
      rawQuery: query,
      result: {
        success: false,
        restaurants: [],
        activities: [],
        pairs: [],
        render_mode: "empty",
        debug: {
          normalizedIntent: parsedIntent,
          performance: {
            total_ms: totalMs,
            speed_status: getSearchSpeedStatus({ totalMs, success: false }),
          },
        },
      },
      debug: {
        normalizedIntent: parsedIntent,
        error: serializeErrorForDebug(error),
        rawQuery: query,
        performance: {
          total_ms: totalMs,
          speed_status: getSearchSpeedStatus({ totalMs, success: false }),
        },
      },
      errors: [errorMessageForDebug(error)],
      timingMs: totalMs,
      speedStatus: getSearchSpeedStatus({ totalMs, success: false }),
      createdByUserId: options?.createdByUserId ?? options?.userId ?? null,
      betaAssignmentId: options?.betaAssignmentId ?? null,
      betaTesterId: options?.betaTesterId ?? null,
      debugMode: Boolean(options?.searchHealthDebug ?? options?.betaDebug),
      betaFeedbackSubmitted: options?.betaFeedbackSubmitted === true,
    });
    throw error;
  }
}
export * from "./types";
export * from "./normalize-intent";
export * from "./ranking";
export * from "./pairing";
export * from "./distance";
export * from "./geo-taxonomy";
export * from "./markets";
