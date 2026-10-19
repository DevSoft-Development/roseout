import {describe,it,expect} from "vitest";
import {assessOneTouchImport} from "../one-touch-acceptance";
const keys=["contact","email","reservationUrl","socialProfiles","openingHours","amenities"];
const base=()=>({
 name:"Test Cafe",address:"1 Test St",city:"New York",state:"NY",
 latitude:40.7,longitude:-73.9,website:"https://example.test",
 main_image:"https://example.test/image.jpg",has_photos:true,
 raw_payload:{
  li_v2_prepublication_menu:{status:"checked",website:"https://example.test"},
  li_v2_initial_review_sample:{status:"imported"},
  li_v2_prepublication_fields:Object.fromEntries(keys.map(key=>[key,{
   status:"not_available",sourceUrl:"https://example.test",checkedAt:"2026-10-19T00:00:00Z",
  }])),
 },
});
describe("LI V2 structured first import checkpoint",()=>{
 it("accepts explicit checked unavailable outcomes",()=>{
  expect(assessOneTouchImport(base()).oneTouchComplete).toBe(true);
 });
 it("rejects unchecked structured channels",()=>{
  const row=base(); delete (row.raw_payload.li_v2_prepublication_fields as Record<string,unknown>).email;
  expect(assessOneTouchImport(row).oneTouchComplete).toBe(false);
 });
 it("rejects claimed unavailable states without source verification",()=>{
  const row=base();row.raw_payload.li_v2_prepublication_fields.contact.sourceUrl=""; 
  expect(assessOneTouchImport(row).profileReady).toBe(false);
 });
});
