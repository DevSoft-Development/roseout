import {describe,it,expect} from "vitest";
import {assessOneTouchImport} from "../one-touch-acceptance";

const complete=(status:string)=>({
 name:"Fixture Cafe",address:"1 Test St",city:"Testville",state:"NY",
 website:"https://example.test",main_image:"https://example.test/photo.jpg",has_photos:true,
 latitude:40.1,longitude:-73.9,
 raw_payload:{
  independent_profile:{googlePlaceId:"fixture-place-id"},
  li_v2_prepublication_menu:{status:"checked",website:"https://example.test"},
  li_v2_initial_review_sample:{status},
 },
});

describe("LI V2 terminal initial review acceptance",()=>{
 it("allows a verified zero-review result to finish first import",()=>{
  const accepted=assessOneTouchImport(complete("not_available"));
  expect(accepted.profileReady).toBe(true);
  expect(accepted.oneTouchComplete).toBe(true);
  expect(accepted.fieldAvailability.reviews).toBe("not_available");
 });
 it("rejects a pending initial review until it is resolved",()=>{
  expect(assessOneTouchImport(complete("pending")).oneTouchComplete).toBe(false);
 });
 it("accepts a sampled review import",()=>{
  expect(assessOneTouchImport(complete("imported")).oneTouchComplete).toBe(true);
 });
});
