import {describe,it,expect} from "vitest";
import {assessIndependentBusinessProfile} from "../independent-profile-gate";
import {extractOfficialImageReferences} from "../official-website-resolver";

const verified={name:"Example Venue",address:"100 Main Street",city:"Brooklyn",state:"NY",
 latitude:40.7,longitude:-73.9,sourceUrl:"https://example.com",
 evidenceSource:"official_website" as const,openStatus:"open" as const,duplicate:false};

describe("LI V2 photo-pending eligibility",()=>{
 it("allows independent staging but not photo-ready publication",()=>{
  const verdict=assessIndependentBusinessProfile(verified);
  expect(verdict.importEligible).toBe(true);
  expect(verdict.publishable).toBe(false);
  expect(verdict.photoReady).toBe(false);
  expect(verdict.photoReasons).toContain("approved_photo_missing");
 });
 it("rejects closed, unverified or duplicated premises regardless of photos",()=>{
  for(const change of [{openStatus:"closed" as const},{duplicate:true},{latitude:999},{evidenceSource:undefined}]){
   expect(assessIndependentBusinessProfile({...verified,...change}).importEligible).toBe(false);
  }
 });
 it("permits a clearly licensed independent image to become photo ready",()=>{
  const result=assessIndependentBusinessProfile({...verified,photoUrl:"https://example.com/image.jpg",
   photoPermission:"owner" as const,photoSource:"independent" as const});
  expect(result.importEligible).toBe(true);
  expect(result.photoReady).toBe(true);
  expect(result.publishable).toBe(true);
 });
 it("records website image references without treating them as photo grants",()=>{
  const html='<meta property="og:image" content="/cover.jpg"><script type="application/ld+json">{"@type":"Restaurant","image":"https://example.com/food.jpg"}</script>';
  const refs=extractOfficialImageReferences(html,"https://example.com");
  expect(refs.map(x=>x.imageUrl)).toEqual(["https://example.com/cover.jpg","https://example.com/food.jpg"]);
  expect(assessIndependentBusinessProfile({...verified,officialImageReferences:refs}).photoReady).toBe(false);
 });
});
