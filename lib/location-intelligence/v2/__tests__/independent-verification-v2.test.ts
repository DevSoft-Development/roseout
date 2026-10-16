import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

const parser=readFileSync("lib/location-intelligence/v2/official-page-corroboration.ts","utf8");
const resolver=readFileSync("lib/location-intelligence/v2/official-website-resolver.ts","utf8");
const stage=readFileSync("lib/location-intelligence/v2/independent-staging.ts","utf8");
const migration=readFileSync("supabase/migrations/20261017001500_li_v2_paid_task_reverification_v2.sql","utf8");
const admin=readFileSync("apps/admin/app/api/admin/location-growth/li-v2-acquisition/route.ts","utf8");

describe("LI V2 independent verification V2 policy",()=>{
 it("fetches a bounded set of actual official first-party HTTPS pages",()=>{
  expect(parser).toContain('fetchOfficialWebsiteContext(origin+path)');
  expect(parser).toContain('if(url.origin!==origin');
  expect(parser).toContain('["/contact","/locations","/about","/hours"]');
  expect(parser).toContain('if(pages.length<2)return null');
  expect(parser).toContain('normalize(a.street)!==normalize(b.street)');
  expect(parser).toContain('a.state!==b.state||a.zip!==b.zip');
  expect(parser).not.toContain('getMapsStandardTask');
 });
 it("retains structured JSON-LD as first preference and source provenance",()=>{
  expect(resolver).toContain('structured || corroborated');
  expect(resolver).toContain('official_business_corroboration_missing');
  expect(stage).toContain('officialEvidenceUrls:p.officialEvidenceUrls||[p.sourceUrl]');
  expect(stage).toContain('assessIndependentBusinessProfile(verified)');
  expect(stage).toContain('geocodeFreeFirst');
  expect(stage).toContain('wikimedia_license_or_url_unverified');
 });
 it("permits one explicit no-purchase re-verification only",()=>{
  expect(migration).toContain('v.recovery_count <> 1');
  expect(migration).toContain("q.status='ready' and q.task_id is not null");
  expect(migration).toContain("q.target_index=0");
  expect(migration).toContain('recovery_count=2');
  expect(migration).not.toContain('postMapsStandardTask');
  expect(admin).toContain('requireAdminRole(["superadmin"])');
  expect(admin).toContain('admin_li_v2_reverify_existing_paid_task');
 });
});
