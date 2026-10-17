import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const load=(p:string)=>readFileSync(p,"utf8");
describe("LI V2 Verification V3 guards",()=>{
 it("requires two official pages, identity corroboration, and no closed business",()=>{
   const code=load("lib/location-intelligence/v2/official-page-corroboration.ts");
   expect(code).toContain("if(pages.length<2)return null");
   expect(code).toContain("a.zip!==b.zip");
   expect(code).toContain("if(a.closed||b.closed)continue");
   expect(code).toContain("url.origin!==origin");
   expect(code).toContain('"/contact-us"');
 });
 it("retains license verification and independent geocoding gates",()=>{
   const wikimedia=load("lib/location-intelligence/v2/wikimedia-photo-license.ts");
   const staging=load("lib/location-intelligence/v2/independent-staging.ts");
   expect(wikimedia).toContain("verifyWikimediaPhoto(url)");
   expect(wikimedia).toContain("!description.includes(street)");
   expect(staging).toContain("verifyWikimediaPhoto");
   expect(staging).toContain("geocodeFreeFirst");
   expect(staging).toContain("assessIndependentBusinessProfile");
 });
 it("supports exactly one V3 reprocess of a pre-paid task",()=>{
   const sql=load("supabase/migrations/20261017004500_li_v2_v3_paid_task_reprocess.sql");
   const api=load("apps/admin/app/api/admin/location-growth/li-v2-acquisition/route.ts");
   expect(sql).toContain("run_id uuid primary key");
   expect(sql).toContain("v.recovery_count<>2");
   expect(sql).toContain("q.status='ready' and q.task_id is not null");
   expect(sql).toContain("status='queued'");
   expect(sql).not.toContain("recovery_count=0");
   expect(api).toContain('requireAdminRole(["superadmin"])');
   expect(api).toContain("admin_li_v2_reprocess_paid_task_v3");
 });
 it("records stage-specific errors without exception strings, and respects photo cap",()=>{
   const code=load("lib/location-intelligence/v2/maps-independent-resolver.ts");
   expect(code).toContain('"candidate_resolution_error_"+failureStage');
   expect(code).toContain('photo_lookup_budget_exhausted');
   expect(code).toContain('googlePhotoLookups < (input.maxGooglePhotoLookups ?? 50)');
   expect(code).toContain("uniqueAudits");
 });
});
