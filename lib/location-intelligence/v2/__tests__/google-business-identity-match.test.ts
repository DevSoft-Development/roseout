import {describe,it,expect} from "vitest";
import {matchesIndependentBusiness} from "../google-business-identity-match";
const id="ChIJExampleBusiness123";
const same={id,displayName:{text:"Cositas Ricas"},formattedAddress:"79-19 Roosevelt Avenue, Jackson Heights, NY"};
describe("LI V2 exact Google business identity",()=>{
 it("accepts same independently sourced business",()=>expect(matchesIndependentBusiness({name:"Cositas Ricas",address:"79-19 Roosevelt Ave"},same,id)).toBe(true));
 it("rejects venue ID reused for an onsite restaurant",()=>expect(matchesIndependentBusiness({name:"Zoo Brews",address:"2300 Southern Boulevard"},{id,displayName:{text:"Bronx Zoo"},formattedAddress:"2300 Southern Blvd, Bronx, NY"},id)).toBe(false));
 it("rejects different premises",()=>expect(matchesIndependentBusiness({name:"Scorpion Bar",address:"75-16 Roosevelt Ave"},{...same,displayName:{text:"Scorpion Bar"},formattedAddress:"69-08 Roosevelt Ave, NY"},id)).toBe(false));
 it("rejects wrong returned ID",()=>expect(matchesIndependentBusiness({name:"Cositas Ricas",address:"79-19 Roosevelt Ave"},same,"another-id")).toBe(false));
 it("rejects missing provider business metadata",()=>expect(matchesIndependentBusiness({name:"Cositas Ricas",address:"79-19 Roosevelt Ave"},{id},id)).toBe(false));
});