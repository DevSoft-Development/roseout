import {describe,it,expect} from "vitest";
import {assessIndependentBusinessProfile} from "../location-intelligence/v2/independent-profile-gate";
const complete={
  name:"Example Cafe",address:"100 Main St",city:"Mineola",state:"NY",
  latitude:40.74,longitude:-73.64,sourceUrl:"https://example.com",
  photoUrl:"https://example.com/photo.jpg",photoPermission:"owner" as const,
  openStatus:"open" as const,evidenceSource:"official_website" as const,
  duplicate:false,
};
describe("independently sourced profile gate",()=>{
  it("accepts complete independently verified profile",()=>{
    expect(assessIndependentBusinessProfile(complete).publishable).toBe(true);
  });
  it("never publishes duplicate, closed, image-less or unknown-license profiles",()=>{
    for(const change of [{duplicate:true},{openStatus:"closed" as const},{photoPermission:undefined},{evidenceSource:undefined},{latitude:999}]) {
      expect(assessIndependentBusinessProfile({...complete,...change}).publishable).toBe(false);
    }
  });
});
