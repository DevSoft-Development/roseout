import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin/credential-vault-runtime-source",()=>({
  getCredentialVaultProviderValues:vi.fn(async()=>({login:"fake",password:"fake"})),
}));
import {buildMapsStandardTask,postMapsStandardTask,getMapsStandardTask,MAPS_STANDARD_MAX_USD} from "../location-intelligence/v2/dataforseo-maps-standard";
describe("low-cost DataForSEO queue",()=>{
  beforeEach(()=>vi.restoreAllMocks());
  it("pins normal priority, default 100 depth, US and English",()=>{
    expect(buildMapsStandardTask("french restaurants Great Neck NY")).toEqual({
      keyword:"french restaurants Great Neck NY",location_code:2840,language_code:"en",priority:1,depth:100,device:"desktop"
    });
    expect(()=>buildMapsStandardTask("a")).toThrow("maps_standard_invalid_keyword");
    expect(MAPS_STANDARD_MAX_USD).toBe(0.0006);
  });
  it("posts one task and returns an id without treating it as completed",async()=>{
    const id="11141653-0696-0066-0000-fa25e0da658e";
    const spy=vi.spyOn(globalThis,"fetch").mockResolvedValue({
      ok:true,json:async()=>({status_code:20000,tasks:[{id,status_code:20100,cost:0.0006}]})
    } as Response);
    expect(await postMapsStandardTask("italian restaurant Mineola NY")).toEqual({taskId:id,costUsd:0.0006});
    expect(String(spy.mock.calls[0][0])).toContain("/serp/google/maps/task_post");
    const payload=JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(payload).toHaveLength(1);
    expect(payload[0].priority).toBe(1);
  });
  it("rejects a provider charge larger than the one-page reservation",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:true,json:async()=>({
      status_code:20000,tasks:[{id:"11141653-0696-0066-0000-fa25e0da658e",cost:0.005}]
    })} as Response);
    await expect(postMapsStandardTask("restaurants Williamsburg Brooklyn")).rejects.toThrow("maps_standard_cost_above_reserved_ceiling");
  });
  it("does not treat a queued task as an empty completed result",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:true,json:async()=>({
      status_code:20000,tasks:[{id:"11141653-0696-0066-0000-fa25e0da658e",result:null}]
    })} as Response);
    expect((await getMapsStandardTask("11141653-0696-0066-0000-fa25e0da658e")).status).toBe("pending");
  });
});
