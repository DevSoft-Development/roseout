import {describe,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-admin",()=>({supabaseAdmin:{}}));
vi.mock("@/lib/location-intelligence/v2/independent-staging",()=>({stageIndependentCandidate:vi.fn()}));
vi.mock("@/lib/location-intelligence/v2/independent-batch-finalizer",()=>({finalizeIndependentBatch:vi.fn()}));
vi.mock("@/lib/location-intelligence/v2/source-executors",()=>({fetchOfficialWebsiteContext:vi.fn()}));
import {parseOfficialBusinessJsonLd,permittedOfficialPhoto} from "../location-intelligence/v2/official-website-resolver";
import {websiteLeadFromMapsItem} from "../location-intelligence/v2/maps-independent-resolver";
describe("independent Maps leads",()=>{
 it("reads restaurant name/address from official structured evidence",()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({
    "@context":"https://schema.org","@type":"Restaurant",name:"Example Restaurant",
    url:"https://example.org",address:{"@type":"PostalAddress",
     streetAddress:"21 Main Street",addressLocality:"Mineola",
     addressRegion:"NY",postalCode:"11501"},
    openingHours:"Mo-Fr 11:00-21:00"
  })+'</script>';
  const p=parseOfficialBusinessJsonLd(html,"https://example.org/");
  expect(p?.name).toBe("Example Restaurant");
  expect(p?.address).toBe("21 Main Street");
  expect(p?.openStatus).toBe("open");
 });
 it("does not license a photo solely because it is on the website",()=>{
  expect(permittedOfficialPhoto(undefined,"https://example.org")).toBeNull();
  expect(permittedOfficialPhoto({
   websiteOrigin:"https://different.org",imageUrl:"https://example.org/image.jpg",
   permission:"owner",evidenceUrl:"https://example.org/permission",
   verifiedBy:"auditor"},"https://example.org")).toBeNull();
  expect(permittedOfficialPhoto({
   websiteOrigin:"https://example.org",imageUrl:"https://example.org/image.jpg",
   permission:"owner",evidenceUrl:"https://example.org/permission",
   verifiedBy:"auditor",expiresAt:"2000-01-01"
  },"https://example.org")).toBeNull();
 });
 it("rejects Google Maps as a source website",()=>{
  expect(websiteLeadFromMapsItem({url:"https://maps.google.com/maps?x=1"})).toBeNull();
  expect(websiteLeadFromMapsItem({domain:"example.org"})).toBe("https://example.org");
 });
});
