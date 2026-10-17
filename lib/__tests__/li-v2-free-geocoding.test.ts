import {describe,expect,it,vi} from "vitest";
import {normalizedAddress,censusGeocode,geoapifyGeocode,geocodeFreeFirst} from "../location-intelligence/v2/free-geocoding";

describe("LI V2 permanent-coordinate free geocoding",()=>{
  const address={street:"100 Main St",city:"Albany",state:"NY",zip:"12207"};
  it("normalizes licensed-dataset full state names without reducing address precision",()=>{
    expect(normalizedAddress({...address,state:"New York"})?.state).toBe("NY");
    expect(normalizedAddress({...address,state:"New Jersey"})?.state).toBe("NJ");
    expect(normalizedAddress({...address,state:"Unknown State"})).toBeNull();
  });
  it("rejects partial addresses without network calls",async()=>{
    const fetcher=vi.fn();
    expect(normalizedAddress({...address,street:"Main St"})).toBeNull();
    expect(await geocodeFreeFirst({...address,street:"Main St"},{fetcher:fetcher as unknown as typeof fetch,geoapifyKey:"test"})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses single Census match first and avoids sending a vault key",async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({result:{addressMatches:[{matchedAddress:"100 MAIN ST, ALBANY, NY, 12207",coordinates:{x:-73.75,y:42.65}}]}})}));
    const result=await geocodeFreeFirst(address,{fetcher:fetcher as unknown as typeof fetch,geoapifyKey:"vault-secret"});
    expect(result?.provider).toBe("census");
    expect(result?.precision).toBe("street_range");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("vault-secret");
  });
  it("rejects ambiguous Census matches",async()=>{
    const f=vi.fn(async()=>({ok:true,json:async()=>({result:{addressMatches:[{coordinates:{x:-73.7,y:42.6}},{coordinates:{x:-73.7,y:42.6}}]}})}));
    expect(await censusGeocode(address,f as unknown as typeof fetch)).toBeNull();
  });
  it("uses Geoapify only as fallback for high-quality single address matches",async()=>{
    const fetcher=vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({result:{addressMatches:[]}})})
      .mockResolvedValueOnce({ok:true,json:async()=>({features:[{properties:{state_code:"NY",result_type:"building",rank:{confidence:0.99},lat:42.66,lon:-73.76,formatted:"100 Main St, Albany"}}]})});
    const result=await geocodeFreeFirst(address,{geoapifyKey:"vault-secret",fetcher:fetcher as unknown as typeof fetch});
    expect(result?.provider).toBe("geoapify");
    expect(result?.attribution).toContain("OpenStreetMap");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("geoapify.com");
  });
  it("rejects unresolved or inaccurate Geoapify results",async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({features:[{properties:{state_code:"NJ",result_type:"street",rank:{confidence:0.3},lat:40.1,lon:-74}}]})}));
    expect(await geoapifyGeocode(address,"key",fetcher as unknown as typeof fetch)).toBeNull();
  });
});
