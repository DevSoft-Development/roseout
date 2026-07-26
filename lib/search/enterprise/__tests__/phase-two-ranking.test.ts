import { describe, expect, it } from "vitest";
import { rerankLocations, rerankPairs } from "../phaseTwoRanking";
import type { SearchIntent } from "../types";
const intent = {rawQuery:"Italian dinner and bowling after",searchType:"mixed_outing",primaryDomain:"mixed",needsRestaurant:true,needsActivity:true,wantsPairing:true,restaurantIntent:{mealTerms:[],foodTerms:[],cuisineTerms:["italian"],categoryTerms:[],vibeTerms:[],featureTerms:[],negativeTerms:[]},activityIntent:{activityTerms:["bowling"],categoryTerms:[],vibeTerms:[],featureTerms:[],negativeTerms:[]},geo:{aliases:[],geoStrictness:"none"},vibe:[],strictness:"medium"} as SearchIntent;
const loc=(id:string,name:string,extra={})=>({id,name,active:true,...extra});
describe("phase two quality ranking",()=>{
 it("supports disabled, shadow and enabled location reranking",()=>{const items=[loc("1","Cafe"),loc("2","Italian restaurant")]; expect(rerankLocations(items,intent,{mode:"disabled"}).results[0].id).toBe("1"); expect(rerankLocations(items,intent,{mode:"shadow"}).results[0].id).toBe("1"); expect(rerankLocations(items,intent,{mode:"enabled"}).results[0].id).toBe("2");});
 it("prefers verified routes and rejects infeasible pairs",()=>{const activity=loc("a","Bowling",{closing_time:"2030-01-01T20:00:00Z"}); const pairs=[{restaurant:loc("r","Italian"),activity,score:0,walkingDurationMinutes:5},{restaurant:loc("r2","Italian"),activity:loc("a2","Bowling"),score:0,googleWalkingDurationMinutes:5}] as any; const ranked=rerankPairs(pairs,{...intent,parsedDateTimeISO:"2030-01-01T22:00:00Z"},{mode:"enabled"}); expect(ranked.rejected.length).toBeGreaterThan(0);});
});
