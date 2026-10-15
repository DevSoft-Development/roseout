import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-admin",()=>({supabaseAdmin:{}}));
vi.mock("@/lib/location-intelligence/v2/orchestrator",()=>({LOCATION_INTELLIGENCE_ADAPTERS:[]}));
import {uniquePlaceIds} from "../location-intelligence/v2/acquisition-identity-gate";

describe("LI V2 identity-first acquisition",()=>{
  it("only accepts unique and valid Google Place IDs",()=>{
    expect(uniquePlaceIds(["ChIJabcdefgh123","ChIJabcdefgh123","bad","",null,"ChIJabcdefgh456"]))
      .toEqual(["ChIJabcdefgh123","ChIJabcdefgh456"]);
  });
  it("gates paid discovery before campaign claim and compares all live/staged IDs",()=>{
    const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
    const gate=readFileSync("lib/location-intelligence/v2/acquisition-identity-gate.ts","utf8");
    expect(worker.indexOf("LI_V2_CERTIFIED_SEARCHABLE_IMPORT_ENABLED")).toBeLessThan(worker.indexOf('rpc("li_v2_claim_campaign_run")'));
    expect(worker.indexOf("discoverUnseenGooglePlaceIds(query)")).toBeLessThan(worker.indexOf("submitApprovedMapsQueue({"));
    expect(worker).toContain("LI_V2_INDEPENDENT_PROFILE_SOURCE_CERTIFIED");
    expect(worker).not.toContain("provider.execute({");
    expect(gate).toContain('.from("locations")');
    expect(gate).toContain('.from("location_import_staging")');
    expect(gate).toContain('.in("google_place_id", ids)');
    expect(gate).toContain('.in("source_id", ids)');
  });
});
