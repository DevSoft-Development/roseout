import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./enterprise/types";
import {
  classifySearchLocation,
  evaluateCandidateEligibility,
} from "./enterprise/classification";

function queryAllowsNightlifeAsActivity(intent?: SearchIntent) {
  const text = [
    intent?.rawQuery,
    ...(intent?.activityIntent?.activityTerms ?? []),
    ...(intent?.activityIntent?.categoryTerms ?? []),
    ...(intent?.activityIntent?.featureTerms ?? []),
  ].join(" ").toLowerCase();
  return /\b(bar|drinks|cocktails|lounge|nightlife|rooftop drinks|hookah|sports bar|watch (?:the )?game|game watch)\b/.test(text);
}

export function isRestaurantDomainResult(
  record: EnterpriseLocation,
  intent?: SearchIntent,
) {
  return evaluateCandidateEligibility({
    location: record,
    intent,
    expectedDomain: "restaurant",
    lane: "domain_filter",
  }).eligible;
}

export function isActivityDomainResult(record: EnterpriseLocation, intent?: SearchIntent) {
  const eligibility = evaluateCandidateEligibility({
    location: record,
    intent,
    expectedDomain: "activity",
    lane: "domain_filter",
  });
  if (eligibility.eligible) return true;

  // Nightlife remains excluded by default. Keep the legacy, explicit opt-in for
  // bar/lounge style activity queries, while still preventing restaurant-only
  // records from leaking into activity-only searches.
  const classification = classifySearchLocation(record);
  return classification.canonicalType === "nightlife" && queryAllowsNightlifeAsActivity(intent);
}

export function filterResultsBySearchDomain(args: {
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  pairs?: EnterprisePair[];
  intent: SearchIntent;
  debug?: Record<string, any>;
  lane?: string;
}) {
  const lane = args.lane ?? "final_domain_filter";
  const debug = args.debug;
  if (debug) {
    debug.classification ??= { evaluated: 0, rejectedWrongDomain: 0, rejectedUnsupported: 0, conflicts: [] };
    debug.recovery ??= { entered: false, candidatesEvaluated: 0, accepted: 0, rejectionReasons: {} };
  }

  const evaluate = (item: EnterpriseLocation, expectedDomain: "restaurant" | "activity") => {
    const result = evaluateCandidateEligibility({ location: item, intent: args.intent, expectedDomain, lane });
    if (debug) {
      debug.classification.evaluated += 1;
      if (result.hardRejectReasons.includes("wrong_domain")) debug.classification.rejectedWrongDomain += 1;
      if (result.hardRejectReasons.includes("unsupported_location_type")) debug.classification.rejectedUnsupported += 1;
      if (result.warnings.length) debug.classification.conflicts.push({ id: item.id ?? null, warnings: result.warnings });
      if (lane.includes("recovery")) {
        debug.recovery.entered = true;
        debug.recovery.candidatesEvaluated += 1;
        if (result.eligible) debug.recovery.accepted += 1;
        for (const reason of result.hardRejectReasons) {
          debug.recovery.rejectionReasons[reason] = (debug.recovery.rejectionReasons[reason] ?? 0) + 1;
        }
        debug.recoveryCandidatesEvaluated = (debug.recoveryCandidatesEvaluated ?? 0) + 1;
        if (result.eligible) debug.recoveryAccepted = (debug.recoveryAccepted ?? 0) + 1;
        if (result.hardRejectReasons.includes("wrong_domain")) debug.recoveryRejectedWrongDomain = (debug.recoveryRejectedWrongDomain ?? 0) + 1;
        if (result.hardRejectReasons.includes("unsupported_location_type")) debug.recoveryRejectedUnsupportedType = (debug.recoveryRejectedUnsupportedType ?? 0) + 1;
        if (result.hardRejectReasons.includes("duplicate")) debug.recoveryRejectedDuplicate = (debug.recoveryRejectedDuplicate ?? 0) + 1;
        if (result.hardRejectReasons.some((r) => ["unavailable", "hidden", "deleted", "not_searchable"].includes(r))) debug.recoveryRejectedUnavailable = (debug.recoveryRejectedUnavailable ?? 0) + 1;
      }
    }
    return result.eligible;
  };

  const restaurants = args.restaurants.filter((item) => evaluate(item, "restaurant"));
  const activities = args.activities.filter((item) => evaluate(item, "activity") || isActivityDomainResult(item, args.intent));
  const pairs = (args.pairs ?? []).filter((pair) => {
    if (!evaluate(pair.restaurant, "restaurant")) return false;
    if (!evaluate(pair.activity, "activity")) return false;
    if (
      String(pair.restaurant.id ?? "") &&
      String(pair.restaurant.id ?? "") === String(pair.activity.id ?? "") &&
      !(args.intent as any).sameLocationRequired
    ) {
      return false;
    }
    return true;
  });
  return { restaurants, activities, pairs };
}
