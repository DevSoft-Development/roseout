import {describe,it,expect} from "vitest";
import {parseOfficialBusinessJsonLd} from "../official-website-resolver";
describe("LI V2 first-import structured official fields",()=>{
 it("captures first-party telephone, hours and amenities alongside identity",()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({
 "@context":"https://schema.org","@type":"Restaurant",name:"Example Cafe",
 url:"https://example.com",address:{"@type":"PostalAddress",streetAddress:"12 Test St",addressLocality:"New York",addressRegion:"NY",postalCode:"10001"},
 telephone:"+1-212-555-0111",openingHours:["Mo-Fr 10:00-20:00"],
 amenityFeature:[{"@type":"LocationFeatureSpecification",name:"WiFi",value:true}]
 })+'</script>';
 const candidate=parseOfficialBusinessJsonLd(html,"https://example.com");
 expect(candidate?.phone).toBe("+1-212-555-0111");
 expect(candidate?.openingHours).toEqual(["Mo-Fr 10:00-20:00"]);
 expect(candidate?.amenities).toEqual({wifi:true});
 });
});
