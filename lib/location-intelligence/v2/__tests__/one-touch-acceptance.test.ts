import {describe,it,expect} from "vitest";
import {assessOneTouchImport} from "../one-touch-acceptance";
const base={name:"Test Cafe",address:"1 Main St",city:"New York",state:"NY",
 website:"https://example.com",latitude:40.7,longitude:-73.9,phone:"2120000000",
 main_image:"https://example.com/photo.jpg",has_photos:true,
 raw_payload:{li_v2_prepublication_menu:{website:"https://example.com",status:"unavailable"},
 independent_profile:{openStatus:"open"}}};
describe("one touch acceptance",()=>{
 it("does not confuse publication-ready with complete review enrichment",()=>{
  const result=assessOneTouchImport(base);
  expect(result.profileReady).toBe(true);
  expect(result.oneTouchComplete).toBe(false);
  expect(result.fieldAvailability.reviews).toBe("pending_authorization");
 });
 it("recognizes explicit authorized review evidence",()=>{
  const result=assessOneTouchImport({...base,raw_payload:{...base.raw_payload,
    li_v2_initial_review_sample:{status:"imported"}}});
  expect(result.oneTouchComplete).toBe(true);
 });
 it("rejects missing primary photo and menu checks",()=>{
  const result=assessOneTouchImport({...base,main_image:"",raw_payload:{}});
  expect(result.profileReady).toBe(false);
  expect(result.missing).toContain("primaryImage");
  expect(result.missing).toContain("menuChecked");
 });
});
