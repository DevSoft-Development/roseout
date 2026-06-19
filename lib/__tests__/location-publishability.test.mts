import { describe, expect, it } from "vitest";
import { evaluateLocationPublishability } from "../location-publishability";

describe("location publishability", () => {
  function base(overrides:any={}){return { name:"Good", state:"NY", status:"approved", location_type:"restaurant", data_status:"clean", public_visibility_tier:"standard", is_hidden:false, is_low_level:false, has_photos:true, main_image:"https://x/img.jpg", address:"1 Main", city:"NYC", latitude:40, longitude:-73, duplicate_status:"unique", source_quality_status:"enriched", import_confidence:"high", images:["https://x/img.jpg"], ...overrides};}
  it("evaluates guardrails and approvals", () => {
    const cases:any[]=[
     ["Good NY restaurant", base(), true], ["Good NJ activity", base({state:"NJ",location_type:"activity"}), true], ["CT clean enriched", base({state:"CT"}), true], ["CA out", base({state:"CA"}), false], ["Hidden", base({is_hidden:true}), false], ["Low-level", base({is_low_level:true}), false], ["Imported-unverified", base({source_quality_status:"imported_unverified"}), false], ["Low-confidence", base({import_confidence:"low"}), false], ["Missing photo", base({has_photos:false, main_image:null, images:[]}), false], ["Missing coordinates", base({latitude:null}), false], ["Duplicate", base({duplicate_status:"duplicate"}), false]
    ];
    for (const [name,row,want] of cases) expect(evaluateLocationPublishability(row).isSearchable, name).toBe(want);
    expect(evaluateLocationPublishability(base({images:[], main_image:"https://x/main.jpg"})).normalizedImages).toContain("https://x/main.jpg");
    const preserved=evaluateLocationPublishability(base({images:["a","b"], main_image:"c"})); expect(preserved.normalizedImages[0]).toBe("a"); expect(preserved.normalizedImages).toContain("b");
    expect(evaluateLocationPublishability(base(), {allowApproval:true}).isReadyToApprove).toBe(true);
    expect(evaluateLocationPublishability(base({state:"NJ",location_type:"activity"}), {allowApproval:true}).isReadyToApprove).toBe(true);
    for (const [name,row] of [["Hidden",base({is_hidden:true})],["Low-level",base({is_low_level:true})],["Imported low",base({source_quality_status:"imported_unverified", import_confidence:"low"})],["Missing photo",base({has_photos:false})],["Duplicate",base({duplicate_status:"duplicate"})],["Out",base({state:"CA"})]]) expect(evaluateLocationPublishability(row as any,{allowApproval:true}).isReadyToApprove, name as string).toBe(false);
    const bulk=[base({id:"1"}), base({id:"2", is_hidden:true}), base({id:"3", state:"CA"})].map(x=>evaluateLocationPublishability(x,{allowApproval:true})); expect(bulk.filter(x=>x.isReadyToApprove)).toHaveLength(1); expect(bulk.filter(x=>!x.isReadyToApprove)).toHaveLength(2);
  });
});
