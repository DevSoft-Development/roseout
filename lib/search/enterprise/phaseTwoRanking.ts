import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./types";
import { personalizationAdjustment, personalizationMode, type UserPreferenceProfile } from "./personalization";
import { buildSearchScoreBreakdown, detectSearchInterpretation, evaluateTemporalFeasibility, resolveRouteEvidence, type SearchScoreBreakdown } from "./phaseOneQuality";

export type QualityRolloutMode = "disabled" | "shadow" | "enabled";
export type QualityRankEvidence = { id: string; oldRank: number; newRank: number; scoreDelta: number; breakdown?: SearchScoreBreakdown };

export function searchQualityRolloutMode(value = process.env.SEARCH_QUALITY_RANKING_MODE): QualityRolloutMode {
  return value === "enabled" || value === "shadow" ? value : "disabled";
}

const baseScore = (item: EnterpriseLocation) => Number(item.score ?? item.final_score ?? item.ml_score ?? 0) || 0;
const boundedAdjustment = (breakdown: SearchScoreBreakdown) => Math.max(-20, Math.min(20,
  breakdown.cuisineMatch * .2 + breakdown.activityMatch * .2 + breakdown.occasionMatch * .15 + breakdown.availability * .2 + breakdown.penalties * .15));

export function rerankLocations(items: EnterpriseLocation[], intent: SearchIntent, options: { mode?: QualityRolloutMode; debug?: boolean; profile?: UserPreferenceProfile } = {}) {
  const mode = options.mode ?? searchQualityRolloutMode();
  if (mode === "disabled") return { results: items, evidence: [] as QualityRankEvidence[], interpretation: detectSearchInterpretation(intent) };
  const scored = items.map((item, oldIndex) => { const breakdown = buildSearchScoreBreakdown(item, intent); const personal = personalizationAdjustment(options.profile, item, intent.restaurantIntent.cuisineTerms); const adjustment = boundedAdjustment(breakdown) + (personalizationMode() === "enabled" ? personal : 0); return { item, oldIndex, breakdown, adjustment, score: baseScore(item) + adjustment }; })
    .sort((a,b) => b.score-a.score || a.oldIndex-b.oldIndex);
  const evidence = scored.slice(0, 50).map((entry, newIndex) => ({ id: String(entry.item.id ?? ""), oldRank: entry.oldIndex+1, newRank: newIndex+1, scoreDelta: entry.adjustment, ...(options.debug ? { breakdown: entry.breakdown } : {}) }));
  const ranked = scored.map((entry) => options.debug ? { ...entry.item, searchQuality: { adjustment: entry.adjustment, breakdown: entry.breakdown } } : entry.item);
  return { results: mode === "enabled" ? ranked : items, evidence, interpretation: detectSearchInterpretation(intent) };
}

export function rerankPairs(items: EnterprisePair[], intent: SearchIntent, options: { mode?: QualityRolloutMode; debug?: boolean } = {}) {
  const mode = options.mode ?? searchQualityRolloutMode();
  if (mode === "disabled") return { results: items, evidence: [] as QualityRankEvidence[], rejected: [] as Array<{id:string;reason:string}> };
  const rejected: Array<{id:string;reason:string}> = [];
  const scored = items.map((item, oldIndex) => {
    const route = resolveRouteEvidence(item); const temporal = evaluateTemporalFeasibility({ pair:item, outingDateTimeISO:intent.parsedDateTimeISO });
    const rb = buildSearchScoreBreakdown(item.restaurant, intent); const ab = buildSearchScoreBreakdown(item.activity, intent);
    let adjustment = Math.max(-25, Math.min(25, (boundedAdjustment(rb)+boundedAdjustment(ab))/2 + (route.confidence === "verified" ? 3 : 0)));
    if (temporal.status === "infeasible") { adjustment = -1000; rejected.push({id:String(`${item.restaurant.id}:${item.activity.id}`), reason: temporal.reason ?? "temporally_infeasible"}); }
    return { item, oldIndex, adjustment, score:Number(item.score ?? 0)+adjustment, route, temporal };
  }).sort((a,b)=>b.score-a.score || a.oldIndex-b.oldIndex);
  const evidence = scored.map((e,i)=>({id:String(`${e.item.restaurant.id}:${e.item.activity.id}`),oldRank:e.oldIndex+1,newRank:i+1,scoreDelta:e.adjustment}));
  const ranked = scored.filter(e=>e.temporal.status !== "infeasible").map(e=>options.debug ? {...e.item, searchQuality:{adjustment:e.adjustment,route:e.route,temporal:e.temporal}} : e.item);
  return { results: mode === "enabled" ? ranked : items, evidence, rejected };
}
