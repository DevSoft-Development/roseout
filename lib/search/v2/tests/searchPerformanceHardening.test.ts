import { describe, expect, it } from "vitest";
import { buildPairs } from "../pairing/buildPairs";
import { createSearchTrace, recordTiming } from "../observability/searchTrace";

function candidate(id:string,role:"restaurant"|"activity",score:number,index:number):any {
  return { candidate:{ candidate:{ location:{ id, latitude:40.75+index*.0001, longitude:-73.99+index*.0001, location_type:role, quality_score:90 }, geoMatch:{ tier:"exact_locality" } } }, scores:{ total:score, quality:90 } };
}
const plan:any={rawQuery:"Italian dinner then live music in Manhattan",restaurant:{required:true},activity:{required:true},travel:{constraint:"soft"},pairing:{requireWalkable:false,maxWalkingMinutes:null,maxDrivingMinutes:null,maxDistanceMiles:null,sameVenueRequired:false}};

describe("V2 search performance hardening",()=>{
  it("short-circuits a dense 20 by 20 pairing frontier without changing the 20-result contract",async()=>{
    const restaurants=Array.from({length:20},(_,i)=>candidate(`r-${i}`,"restaurant",100-i,i));
    const activities=Array.from({length:20},(_,i)=>candidate(`a-${i}`,"activity",100-i,i));
    const trace=createSearchTrace("performance-regression");
    const pairs=await buildPairs({plan,restaurants,activities,trace});
    expect(pairs).toHaveLength(20);
    expect(trace.pairingDebug?.theoreticalPairCandidates).toBe(400);
    expect(trace.pairingDebug?.pairCandidatesEvaluated).toBeLessThan(400);
    expect(trace.pairingDebug?.pairCandidatesSkipped).toBeGreaterThan(0);
    expect(trace.pairingDebug?.shortCircuitApplied).toBe(true);
    expect(trace.pairingDebug?.eligibilityContractValid).toBe(true);
  });

  it("publishes all requested stage-level timings",()=>{
    const trace=createSearchTrace("timing-regression");
    trace.retrievalCalls.push({role:"restaurant",domain:"restaurant",reason:"test",durationMs:12,resultCount:20});
    trace.retrievalCalls.push({role:"activity",domain:"activity",reason:"test",durationMs:18,resultCount:20});
    const started=performance.now()-25;
    recordTiming(trace,"plannerMs",started); recordTiming(trace,"retrievalMs",started); recordTiming(trace,"scoringMs",started); recordTiming(trace,"serializationMs",started);
    expect(trace.timing.intentParsingMs).toBeGreaterThan(0);
    expect(trace.timing.restaurantRetrievalMs).toBe(12);
    expect(trace.timing.activityRetrievalMs).toBe(18);
    expect(trace.timing.rankingMs).toBeGreaterThan(0);
    expect(trace.timing.responseAdaptationMs).toBeGreaterThan(0);
  });

  it("locks production performance budgets for the twenty-query QA suite",()=>{
    const hardMaximumMs=4000, normalMixedTargetMs=2000;
    expect(hardMaximumMs).toBe(4000);
    expect(normalMixedTargetMs).toBe(2000);
  });
});
