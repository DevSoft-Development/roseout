import { geoTierRank } from "../geo/geoPolicy";
import type { SearchTrace } from "../observability/searchTrace";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchPair } from "./pairingTypes";

function locationText(value: any) {
  return [
    value?.name,
    value?.restaurant_name,
    value?.activity_name,
    value?.primary_category,
    value?.activity_type,
    value?.tags,
    value?.vibe_tags,
    value?.best_for_tags,
    value?.semantic_tags,
    value?.search_document,
    value?.semantic_search_text,
    value?.description,
    value?.features,
  ]
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function pairFitAdjustment(plan: SearchPlan, pair: SearchPair) {
  const restaurant = pair.restaurant.candidate.candidate.location as any;
  const activity = pair.activity.candidate.candidate.location as any;
  const restaurantText = locationText(restaurant);
  const activityText = locationText(activity);
  let adjustment = 0;
  const reasons: string[] = [];

  if (plan.occasion === "date_night") {
    const familyExplicit = /\b(?:kids?|children|child|family)\b/i.test(plan.rawQuery);
    if (!familyExplicit && /children'?s|kids?|toddler|playground|family fun center|child focused|children museum/.test(activityText)) {
      adjustment -= 24;
      reasons.push("outing fit -24: child-focused activity conflicts with date night");
    } else if (/live music|jazz|comedy|art gallery|gallery|museum|karaoke|escape room|mini golf|rooftop|scenic|theater|theatre|concert/.test(activityText)) {
      adjustment += 9;
      reasons.push("outing fit +9: date-night activity");
    }
    if (/romantic|intimate|date night|cozy|upscale|classy|elegant/.test(restaurantText)) {
      adjustment += 5;
      reasons.push("outing fit +5: date-night restaurant");
    }
  } else if (plan.occasion === "girls_night") {
    if (/rooftop|cocktail|karaoke|live music|dj|dancing|lively|trendy/.test(`${restaurantText} ${activityText}`)) {
      adjustment += 8;
      reasons.push("outing fit +8: girls-night compatibility");
    }
  } else if (plan.occasion === "family_outing") {
    if (/family|kids?|children|museum|park|aquarium|zoo|bowling|mini golf/.test(activityText)) {
      adjustment += 8;
      reasons.push("outing fit +8: family activity");
    }
  }

  const restaurantPrice = Number(restaurant?.price_level ?? restaurant?.google_price_level ?? NaN);
  const activityPrice = Number(activity?.price_level ?? activity?.google_price_level ?? NaN);
  if (Number.isFinite(restaurantPrice) && Number.isFinite(activityPrice) && Math.abs(restaurantPrice - activityPrice) >= 3) {
    adjustment -= 4;
    reasons.push("outing fit -4: large price-tier mismatch");
  }

  if (plan.relationship?.type === "proximity" && pair.distanceMiles != null && pair.distanceMiles <= 1) {
    adjustment += 4;
    reasons.push("outing fit +4: proximity request satisfied");
  }

  return { adjustment, reasons };
}

export function rerankPairsForOuting({
  plan,
  pairs,
  trace,
}: {
  plan: SearchPlan;
  pairs: SearchPair[];
  trace?: SearchTrace;
}) {
  const reranked = pairs
    .map((pair) => {
      const fit = pairFitAdjustment(plan, pair);
      return {
        ...pair,
        scores: {
          ...pair.scores,
          total: Math.max(0, pair.scores.total + fit.adjustment),
        },
        reasons: [...pair.reasons, ...fit.reasons],
      };
    })
    .sort((a, b) => geoTierRank(a.geoTier) - geoTierRank(b.geoTier) || b.scores.total - a.scores.total);

  if (trace) {
    trace.decisions.push({
      stage: "outing_pair_fit",
      decision: "pair_level_occasion_and_compatibility_applied",
      reason: JSON.stringify({
        occasion: plan.occasion,
        relationship: plan.relationship?.type ?? null,
        pairCount: reranked.length,
      }),
    });
  }
  return reranked;
}
