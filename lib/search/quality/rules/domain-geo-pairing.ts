import type { SearchQualityContext, SearchQualityFinding } from "../types";

function resultDomain(result: any) {
  const text = String(result?.location_type ?? result?.primary_category ?? result?.source_table ?? "").toLowerCase();
  if (/restaurant|food|dining/.test(text)) return "restaurant";
  if (/activity|museum|arcade|bowling|karaoke|nightlife|park|theater|lounge/.test(text)) return "activity";
  return null;
}

export function evaluateDomainGeoPairingRules(context: SearchQualityContext): SearchQualityFinding[] {
  const findings: SearchQualityFinding[] = [];
  const requested = String(context.requestedDomain ?? "");
  const wrongDomain = context.topResults.filter((result) => {
    const actual = resultDomain(result);
    return actual && requested && requested !== "mixed" && requested !== "any" && actual !== requested;
  });
  if (wrongDomain.length) {
    findings.push({ flag: "wrong_result_domain", category: "domain", severity: "high", message: "Top results contain locations from the wrong requested domain.", affectedResultIds: wrongDomain.map((result) => result.id).filter(Boolean) });
  }

  const wantsMixed = ["mixed", "mixed_outing", "paired_outing"].includes(String(context.intent?.searchType ?? context.intent?.search_type ?? ""));
  if (wantsMixed && (!context.restaurants.length || !context.activities.length)) {
    findings.push({ flag: "missing_mixed_component", category: "domain", severity: "high", message: "A mixed outing is missing a restaurant or activity component.", evidence: { restaurants: context.restaurants.length, activities: context.activities.length } });
  }

  const requestedGeo = context.requestedGeo ?? {};
  const explicitCity = String((requestedGeo as any).city ?? "").toLowerCase();
  const explicitState = String((requestedGeo as any).state ?? "").toLowerCase();
  const explicitBorough = String((requestedGeo as any).borough ?? "").toLowerCase();
  const geoMismatch = context.topResults.filter((result) =>
    (explicitCity && String(result?.city ?? "").toLowerCase() !== explicitCity) ||
    (explicitState && String(result?.state ?? "").toLowerCase() !== explicitState) ||
    (explicitBorough && String(result?.borough ?? "").toLowerCase() !== explicitBorough),
  );
  if (geoMismatch.length >= Math.ceil(Math.max(1, context.topResults.length) / 2)) {
    findings.push({ flag: "geo_mismatch_in_top_results", category: "geo", severity: explicitState ? "critical" : "high", message: "Most top results do not match the explicitly requested geography.", affectedResultIds: geoMismatch.map((result) => result.id).filter(Boolean) });
  }

  const wantsPairing = Boolean(context.intent?.wantsPairing ?? context.intent?.pairRequested ?? context.intent?.pair_requested);
  if (wantsPairing && !context.pairs.length) {
    findings.push({ flag: "pair_requested_but_missing", category: "pairing", severity: "high", message: "The query requested a paired outing but no pair was returned." });
  }

  const maxWalk = Number(context.intent?.pairingPreference?.maxPairWalkingMinutes ?? context.intent?.maxPairWalkingMinutes ?? 0);
  const walkingViolations = maxWalk > 0 ? context.pairs.filter((pair) => Number(pair?.pairWalkingMinutes ?? pair?.walkingDurationMinutes ?? 0) > maxWalk) : [];
  if (walkingViolations.length) {
    findings.push({ flag: "walking_constraint_violated", category: "pairing", severity: "critical", message: "Returned pairs exceed the requested walking-time limit.", evidence: { maxWalk }, affectedResultIds: walkingViolations.map((pair) => pair.id ?? pair.activity?.id).filter(Boolean) });
  }

  return findings;
}
