import {describe,it,expect,vi,beforeEach} from "vitest";
vi.mock("server-only",()=>({}));
const deps=vi.hoisted(()=>({
  rpc:vi.fn(),post:vi.fn(),get:vi.fn()
}));
vi.mock("@/lib/supabase-admin",()=>({supabaseAdmin:{rpc:deps.rpc}}));
vi.mock("../location-intelligence/v2/dataforseo-maps-standard",()=>({
 postMapsStandardTask:deps.post,getMapsStandardTask:deps.get
}));
import {advanceMapsQueue,submitApprovedMapsQueue} from "../location-intelligence/v2/maps-queue-runner";

describe("Maps queue financial idempotency",()=>{
 beforeEach(()=>{vi.clearAllMocks();});
 it("reserves exact SKU before a billable submission",async()=>{
   const calls:string[]=[];
   deps.rpc.mockImplementation(async(name:string)=>{
     calls.push(name);
     if(name==="li_v2_campaign_run_permitted")return {data:true,error:null};
     if(name==="li_v2_acquisition_controls_snapshot")return {data:{providers:[{provider:"dataforseo_maps_standard",enabled:true,max_usd_per_request:0.0006}]},error:null};
     if(name==="li_v2_paid_acquisition_preflight")return {data:true,error:null};
     if(name==="reserve_location_acquisition_spend")return {data:true,error:null};
     if(name==="li_v2_maps_queue_transition")return {data:{changed:true,status:"pending"},error:null};
     throw Error("unexpected rpc "+name);
   });
   deps.post.mockImplementation(async()=>{
     expect(calls).toContain("reserve_location_acquisition_spend");
     return {taskId:"11141653-0696-0066-0000-fa25e0da658e",costUsd:0.0006};
   });
   await submitApprovedMapsQueue({runId:"test-run",campaignId:"li-v2-pilot-001",targetIndex:0,query:"restaurant Mineola NY"});
   expect(deps.post).toHaveBeenCalledTimes(1);
 });
 it("polls a persisted task without reposting",async()=>{
   deps.rpc.mockImplementation(async(name:string)=>{
     if(name==="li_v2_maps_queue_snapshot")return {data:[{target_index:1,query:"restaurant Mineola NY",task_id:"11141653-0696-0066-0000-fa25e0da658e",status:"pending"}],error:null};
     if(name==="li_v2_maps_queue_transition")return {data:{changed:true,status:"ready"},error:null};
     throw Error(name);
   });
   deps.get.mockResolvedValue({status:"ready",items:[{type:"maps"}]});
   const result=await advanceMapsQueue("test-run",1,"restaurant Mineola NY");
   expect(result.status).toBe("ready");
   expect(deps.post).not.toHaveBeenCalled();
 });
 it("quarantines an uncertain task without a new provider call",async()=>{
   deps.rpc.mockResolvedValue({data:[{target_index:0,query:"restaurant Mineola NY",status:"uncertain",task_id:null}],error:null});
   expect((await advanceMapsQueue("test-run",0,"restaurant Mineola NY")).status).toBe("manual_reconciliation_required");
   expect(deps.post).not.toHaveBeenCalled();
 });
});
