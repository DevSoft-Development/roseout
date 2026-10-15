import {describe,it,expect} from "vitest";
import {assessIndependentBusinessProfile,isVerifiedGoogleLivePhoto} from "../location-intelligence/v2/independent-profile-gate";
const id="ChIJTest123456789";
const base={
 name:"Example Cafe",address:"100 Main St",city:"Mineola",state:"NY",
 latitude:40.74,longitude:-73.64,sourceUrl:"https://example.org",
 openStatus:"open" as const,evidenceSource:"official_website" as const,
 duplicate:false
};
const url="/api/public/google-place-photo?placeId="+id+"&index=0&maxwidth=800";
describe("LI V2 provider-specific photo gates",()=>{
 it("accepts independently verified Google photo slot without falsely claiming a license",()=>{
  const profile={...base,photoSource:"google_live" as const,googlePlaceId:id,
   googlePhotoSlotVerified:true,photoUrl:url};
  expect(isVerifiedGoogleLivePhoto(profile)).toBe(true);
  expect(assessIndependentBusinessProfile(profile).publishable).toBe(true);
 });
 it("rejects fabricated or unverified Google photo links",()=>{
  expect(assessIndependentBusinessProfile({...base,photoSource:"google_live" as const,
    googlePlaceId:id,googlePhotoSlotVerified:false,photoUrl:url}).publishable).toBe(false);
  expect(assessIndependentBusinessProfile({...base,photoSource:"google_live" as const,
    googlePlaceId:id,googlePhotoSlotVerified:true,photoUrl:"https://unverified.example/image.jpg"}).publishable).toBe(false);
 });
 it("never treats Google live photo URLs as independent licensed files",()=>{
  expect(assessIndependentBusinessProfile({...base,photoSource:"independent" as const,
    photoUrl:url,photoPermission:"licensed" as const}).publishable).toBe(false);
 });
 it("preserves the existing explicit licensed photo route",()=>{
  expect(assessIndependentBusinessProfile({...base,
    photoSource:"independent" as const,photoUrl:"https://example.org/authorized.jpg",
    photoPermission:"owner" as const}).publishable).toBe(true);
 });
});
