import { describe, expect, it } from "vitest";
import { buildSearchHealthKpis, classifySearchEvent, isSlowSearch, normalizeSearchHealthQuery, parseSearchHealthFilters, type HealthIssue, type SearchEvent } from "../search-health-dashboard";
const base: SearchEvent={id:"s1",created_at:"2026-07-20T12:00:00Z",raw_query:" Dinner ",normalized_query:null,result_count:2,timing_ms:200,speed_status:"fast",success:true,had_issue:false,no_results_reason:null,no_pairs_reason:null};
const issue=(overrides:Partial<HealthIssue>={}):HealthIssue=>({id:"i1",created_at:"2026-07-20T12:02:00Z",source:"public_create_search",raw_query:"dinner",event_type:"warning",event_label:"Review",severity:"warning",review_status:"new",restaurant_count:1,activity_count:1,pair_count:1,timing_ms:200,speed_status:"fast",no_results_reason:null,no_pairs_reason:null,...overrides});
describe("Search Health dashboard rules",()=>{
 it("normalizes spaces and casing",()=>expect(normalizeSearchHealthQuery("  DINNER   Near Me ")).toBe("dinner near me"));
 it("handles an empty set",()=>expect(buildSearchHealthKpis([])).toEqual({total:0,healthy:0,issues:0,failed:0,slow:0,noResults:0,noPairs:0}));
 it("counts all healthy searches exclusively",()=>expect(buildSearchHealthKpis([base,{...base,id:"s2"}])).toMatchObject({total:2,healthy:2,issues:0}));
 it("classifies failure",()=>expect(classifySearchEvent({...base,success:false})).toMatchObject({failed:true,issue:true,healthy:false}));
 it("classifies slow timing and status",()=>{expect(isSlowSearch({...base,timing_ms:5001})).toBe(true);expect(isSlowSearch({...base,speed_status:"degraded"})).toBe(true)});
 it("classifies no-results reason and exact zero",()=>{expect(classifySearchEvent({...base,no_results_reason:"none"}).noResults).toBe(true);expect(classifySearchEvent({...base,result_count:0}).noResults).toBe(true)});
 it("does not treat null result count as zero",()=>expect(classifySearchEvent({...base,result_count:null}).noResults).toBe(false));
 it("requires an explicit no-pairs reason",()=>{expect(classifySearchEvent({...base,pair_count:0}).noPairs).toBe(false);expect(classifySearchEvent({...base,no_pairs_reason:"no match"}).noPairs).toBe(true)});
 it("counts a linked issue once even with duplicates",()=>expect(buildSearchHealthKpis([base],[issue(),issue({id:"i2"})])).toMatchObject({total:1,healthy:0,issues:1}));
 it("does not correlate identical queries outside the window",()=>expect(buildSearchHealthKpis([base],[issue({created_at:"2026-07-21T12:00:00Z"})])).toMatchObject({healthy:1,issues:0}));
 it("keeps healthy and issue totals mutually consistent",()=>{const k=buildSearchHealthKpis([base,{...base,id:"s2",success:false}]);expect(k.total).toBe(k.healthy+k.issues)});
 it("validates URL filters and pagination",()=>{const f=parseSearchHealthFilters({range:"bad",page:"-4",pageSize:"999",sort:"DROP TABLE"},new Date("2026-07-26T00:00:00Z"));expect(f).toMatchObject({preset:"30d",page:1,pageSize:25,sort:"created_at"})});
});
