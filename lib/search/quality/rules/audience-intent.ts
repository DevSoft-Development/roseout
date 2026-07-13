import type { SearchQualityContext, SearchQualityFinding } from "../types";

const MINOR_QUERY = /\b(teen|teens|teenage|teenager|kid|kids|child|children|family|son|daughter)\b/i;
const ADULT_RESULT = /\b(21\+|adults only|nightclub|hookah|late night|bar|nightlife)\b/i;

function textFor(result: any) {
  return [result?.name, result?.activity_name, result?.primary_category, result?.activity_type, ...(Array.isArray(result?.tags) ? result.tags : []), ...(Array.isArray(result?.intent_tags) ? result.intent_tags : []), result?.search_document]
    .filter(Boolean).join(" ");
}

export function detectExpectedAudience(query: string) {
  if (/\b(teen|teens|teenage|teenager|son|daughter)\b/i.test(query)) return "teen";
  if (/\b(kid|kids|child|children)\b/i.test(query)) return "kids";
  if (/\bfamily\b/i.test(query)) return "family";
  return null;
}

export function evaluateAudienceIntentRules(context: SearchQualityContext): SearchQualityFinding[] {
  const findings: SearchQualityFinding[] = [];
  const expected = context.expectedAudience ?? detectExpectedAudience(context.query);
  if (!expected && !MINOR_QUERY.test(context.query)) return findings;

  if (!context.detectedAudience) {
    findings.push({ flag: "minor_audience_not_applied", category: "audience", severity: "high", message: "Minor-focused audience intent was not applied.", evidence: { expectedAudience: expected } });
  }

  const adultTop = context.topResults.filter((result) => ADULT_RESULT.test(textFor(result)));
  if (adultTop.length) {
    findings.push({ flag: "adult_oriented_result_in_top_five", category: "audience", severity: adultTop.some((result) => context.topResults.indexOf(result) < 3) ? "critical" : "high", message: "Minor-focused search ranked adult-oriented results in the top five.", affectedResultIds: adultTop.map((result) => result.id).filter(Boolean), evidence: { count: adultTop.length } });
  }

  const genericCount = context.topResults.filter((result) => String(result?.primary_intent ?? "general") === "general" && Number(result?.intent_boost ?? 0) === 0).length;
  if (context.topResults.length && genericCount === context.topResults.length) {
    findings.push({ flag: "generic_intent_used_for_specific_audience", category: "intent", severity: "high", message: "A specific audience query was classified as general across the top results.", evidence: { genericCount } });
  }

  const conflictingBoosts = context.topResults.filter((result) => (result?.activityQualityReasons ?? []).some((reason: unknown) => /nightlife|drinks\/lounge/i.test(String(reason))));
  if (conflictingBoosts.length) {
    findings.push({ flag: "conflicting_positive_boost", category: "ranking", severity: "critical", message: "Adult nightlife signals received a positive boost for a minor-focused query.", affectedResultIds: conflictingBoosts.map((result) => result.id).filter(Boolean) });
  }

  return findings;
}
