import type { EnterpriseLocation, EnterprisePair, PairDistanceMode, PairingPreference, SearchIntent } from "./types";
import { estimateWalkingMinutes, getPairDistanceMiles, isWalkablePair } from "./distance";
import { scoreGeoMatch } from "./geo-taxonomy";
const titleCase=(s:string)=>s.split(/\s+/).filter(Boolean).map(w=>w[0]?.toUpperCase()+w.slice(1)).join(" ");
const sameText = (a: unknown, b: unknown) => Boolean(a&&b&&String(a).toLowerCase()===String(b).toLowerCase());

export type PairingDebug = {
  pairCandidatesEvaluated: number;
  pairsRejectedForDistance: number;
  pairsRejectedForMissingCoordinates: number;
  walkablePairsFound: number;
  rejectedPairs: Array<{ restaurantId: EnterpriseLocation["id"]; activityId: EnterpriseLocation["id"]; reason: string; pairDistanceMiles: number | null }>;
};
export function createPairingDebug(): PairingDebug { return { pairCandidatesEvaluated: 0, pairsRejectedForDistance: 0, pairsRejectedForMissingCoordinates: 0, walkablePairsFound: 0, rejectedPairs: [] }; }

function pairPreference(intent: SearchIntent): PairingPreference { return intent.pairingPreference ?? { requiresPairing: intent.wantsPairing, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }; }
function distanceBonus(distanceMiles: number | null, mode: PairDistanceMode) { if (distanceMiles == null) return 0; if (distanceMiles <= 0.25) return 50; if (distanceMiles <= 0.5) return 40; if (distanceMiles <= 0.75) return 30; if (distanceMiles <= 1.5 && mode === "nearby") return 15; if (distanceMiles <= 3 && mode === "same_area") return 5; return 0; }
export function buildPairDistanceLabel(distanceMiles: number | null) { if (distanceMiles == null) return "Distance unavailable"; if (distanceMiles <= 3) return `About a ${estimateWalkingMinutes(distanceMiles)}-minute walk`; return "Not walking distance"; }
export function scorePair(pair: Pick<EnterprisePair,"restaurant"|"activity"|"distance_miles"|"pairDistanceMiles">, intent: SearchIntent) { const pref=pairPreference(intent); let score=Number(pair.restaurant.match_score??0)+Number(pair.activity.match_score??0)+scoreGeoMatch(pair.restaurant,intent.geo)+scoreGeoMatch(pair.activity,intent.geo); if (sameText(pair.restaurant.neighborhood,pair.activity.neighborhood)) score+=120; else if (sameText(pair.restaurant.borough,pair.activity.borough)) score+=80; else if (sameText(pair.restaurant.city,pair.activity.city)) score+=50; score += distanceBonus(pair.pairDistanceMiles ?? pair.distance_miles, pref.distanceMode); return score; }
export function buildPairTitle(_pair: Pick<EnterprisePair,"restaurant"|"activity">, intent: SearchIntent) { const food=intent.restaurantIntent.foodTerms.find(t=>!["restaurant","dining"].includes(t)) ?? intent.restaurantIntent.cuisineTerms[0] ?? intent.restaurantIntent.mealTerms[0] ?? "Dinner"; const act=intent.activityIntent.activityTerms.find(t=>!["activity","things to do"].includes(t)) ?? "Activity"; return `${titleCase(food)} + ${titleCase(act)} Night`; }
export function buildPairExplanation(pair: Pick<EnterprisePair,"restaurant"|"activity"|"pairDistanceMiles"|"pairWalkingMinutes"|"pairDistanceLabel"|"isWalkable">, intent: SearchIntent) { const geo=intent.geo.neighborhood??intent.geo.borough??intent.geo.city??intent.geo.county??"your area"; if (pair.isWalkable && pair.pairWalkingMinutes != null) return `This pair is walkable: the restaurant and activity are about a ${pair.pairWalkingMinutes}-minute walk apart.`; if (pair.isWalkable) return `Both spots are in ${geo} and close enough for a no-driving date night.`; const distance=pair.pairDistanceMiles!=null?`, about ${pair.pairDistanceMiles} miles apart`:""; return `This works because both options fit ${geo}${distance}, and match your restaurant + activity request.`; }

function sortPairs(pairs: EnterprisePair[], pref: PairingPreference) {
  return pairs.sort((a, b) => {
    if (pref.requireWalkablePair && pref.distanceMode === "walking") {
      const am = a.pairWalkingMinutes ?? Number.POSITIVE_INFINITY;
      const bm = b.pairWalkingMinutes ?? Number.POSITIVE_INFINITY;

      if (am !== bm) return am - bm;
    }

    return b.score - a.score;
  });
}

export function createSearchPairs(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], intent: SearchIntent, debug: PairingDebug = createPairingDebug()) {
  const pairs: EnterprisePair[]=[];
  const pref=pairPreference(intent);
  for (const restaurant of restaurants.slice(0,12)) for (const activity of activities.slice(0,12)) {
    debug.pairCandidatesEvaluated += 1;
    const walkability = isWalkablePair(restaurant, activity, pref);
    const pairDistanceMiles=walkability.pairDistanceMiles;
    const pairWalkingMinutes=walkability.pairWalkingMinutes ?? (pairDistanceMiles == null ? null : estimateWalkingMinutes(pairDistanceMiles));
    const missingCoordinates = walkability.warnings.includes("missing_coordinates");
    if (missingCoordinates && pref.requireWalkablePair) {
      debug.pairsRejectedForMissingCoordinates += 1;
      debug.rejectedPairs.push({ restaurantId: restaurant.id, activityId: activity.id, reason: "missing_coordinates", pairDistanceMiles });
      continue;
    }
    if (!walkability.isWalkable && pref.requireWalkablePair) {
      debug.pairsRejectedForDistance += 1;
      debug.rejectedPairs.push({ restaurantId: restaurant.id, activityId: activity.id, reason: "distance", pairDistanceMiles });
      continue;
    }
    const isWalkable = !missingCoordinates && pairDistanceMiles != null && (pref.distanceMode === "walking" || pref.distanceMode === "nearby" ? walkability.isWalkable : pairDistanceMiles <= 0.75);
    if (walkability.isWalkable && !missingCoordinates) debug.walkablePairsFound += 1;
    const pair: EnterprisePair={ restaurant, activity, distance_miles: pairDistanceMiles, pairDistanceMiles, pairWalkingMinutes, pairDistanceLabel: buildPairDistanceLabel(pairDistanceMiles), pairWarnings: walkability.warnings, isWalkable, title:"", explanation:"", pairExplanation:"", score:0, pairScore:0 };
    pair.title=buildPairTitle(pair,intent);
    pair.explanation=buildPairExplanation(pair,intent);
    pair.pairExplanation=pair.explanation;
    pair.score=scorePair(pair,intent);
    pair.pairScore=pair.score;
    pairs.push(pair);
  }
  return sortPairs(pairs, pref).slice(0,8);
}
export { getPairDistanceMiles };
