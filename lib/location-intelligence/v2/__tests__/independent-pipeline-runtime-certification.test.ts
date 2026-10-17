import {describe,it,expect,vi} from "vitest";
import {geocodeFreeFirst} from "../free-geocoding";
import {corroborateOfficialPages} from "../official-page-corroboration";

const address={street:"123 Main Street",city:"Albany",state:"NY",zip:"12207"};
const censusMatch={result:{addressMatches:[{matchedAddress:"123 MAIN ST, ALBANY, NY, 12207",coordinates:{x:-73.75,y:42.65}}]}};
const page=(url:string,content:string)=>({
  url,title:"Example Cafe | Albany",html:`<html><title>Example Cafe | Albany</title><body>Example Cafe ${content}</body></html>`,
  text:content
});

describe("LI V2 independent verification runtime contracts",()=>{
 it("uses Census first and does not spend a Geoapify request after a unique match",async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>censusMatch})) as unknown as typeof fetch;
  const diagnostics:{provider:string;reason:string}[]=[];
  const result=await geocodeFreeFirst(address,{geoapifyKey:"fallback-key",fetcher,onDiagnostic:d=>diagnostics.push(d)});
  expect(result?.provider).toBe("census");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(diagnostics).toEqual([]);
 });
 it("falls back to Geoapify only after Census yields no match, retaining the failure reason",async()=>{
  const fetcher=vi.fn(async(input:URL)=>{
    if(input.hostname.includes("census.gov"))return {ok:true,json:async()=>({result:{addressMatches:[]}})};
    return {ok:true,json:async()=>({features:[{properties:{state_code:"NY",rank:{match_type:"full_match"},result_type:"building",lat:42.65,lon:-73.75,formatted:"123 Main St, Albany, NY"}},{properties:{state_code:"NJ",rank:{confidence:0.1},result_type:"street",lat:40,lon:-74}}]})};
  }) as unknown as typeof fetch;
  const diagnostics:string[]=[];
  const result=await geocodeFreeFirst(address,{geoapifyKey:"fallback-key",fetcher,onDiagnostic:d=>diagnostics.push(d.provider+"_"+d.reason)});
  expect(result?.provider).toBe("geoapify");
  expect(diagnostics).toContain("census_no_match");
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it("rejects ambiguous Census and Geoapify responses instead of inventing a storefront match",async()=>{
  const match={matchedAddress:"123 MAIN ST, ALBANY, NY",coordinates:{x:-73.75,y:42.65}};
  const feature={properties:{state_code:"NY",rank:{match_type:"full_match"},result_type:"building",lat:42.65,lon:-73.75,formatted:"123 Main St"}};
  const fetcher=vi.fn(async(input:URL)=>({ok:true,json:async()=>input.hostname.includes("census.gov")?{result:{addressMatches:[match,match]}}:{features:[feature,feature]}})) as unknown as typeof fetch;
  const reasons:string[]=[];
  const result=await geocodeFreeFirst(address,{geoapifyKey:"fallback-key",fetcher,onDiagnostic:d=>reasons.push(d.provider+"_"+d.reason)});
  expect(result).toBeNull();
  expect(reasons).toContain("census_ambiguous_matches");
  expect(reasons).toContain("geoapify_no_unique_qualifying_match");
 });
 it("does not treat a single website page as independent first-party corroboration",()=>{
  expect(corroborateOfficialPages([page("https://example.com/","123 Main Street, Albany, NY 12207 Business Hours")])).toBeNull();
 });
 it("retains uncertain business identity for review rather than corroborating mismatched locations",()=>{
  const pages=[page("https://example.com/","123 Main Street, Albany, NY 12207 Restaurant Business Hours"),page("https://example.com/contact","99 Other Street, Albany, NY 12207 Restaurant Business Hours")];
  expect(corroborateOfficialPages(pages)).toBeNull();
 });
});
