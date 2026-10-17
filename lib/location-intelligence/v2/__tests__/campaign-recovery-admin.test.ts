import { readFileSync } from "node:fs";
import {describe,it,expect} from "vitest";
const migration=readFileSync("supabase/migrations/20261016235000_li_v2_candidate_audit_recovery.sql","utf8");
const resolver=readFileSync("lib/location-intelligence/v2/maps-independent-resolver.ts","utf8");
const api=readFileSync("apps/admin/app/api/admin/location-growth/li-v2-acquisition/route.ts","utf8");
const admin=readFileSync("apps/admin/app/admin/dashboard/settings/location-tools/[tool]/page.tsx","utf8");
describe("LI V2 existing-paid-task recovery and diagnostics",()=>{
 it("never permits anonymous admin recovery, nor unlimited replay",()=>{
  expect(migration).toContain("auth.role() is distinct from 'service_role'");
  expect(migration).toContain("v_run.recovery_count<>0");
  expect(migration).toContain("v_run.last_error<>'no_published_locations_to_certify'");
  expect(migration).toContain("q.status='ready' and q.task_id is not null");
  expect(migration).toContain("q.target_index<>0");
  expect(migration).toContain("recovery_count=recovery_count+1");
  expect(migration).toContain("grant execute on function public.admin_li_v2_recover_paid_task(uuid) to service_role");
  expect(migration).not.toContain("postMapsStandardTask");
 });
 it("preserves reason-coded results for previously purchased candidate resolution",()=>{
  expect(resolver).toContain('li_v2_candidate_audit');
  expect(resolver).toContain('official_website_missing');
  expect(resolver).toContain('photo_unverified_or_lookup_capped');
  expect(resolver).toContain('candidate_resolution_error');
  expect(resolver).toContain('independent_stage_rejected');
  expect(migration).toContain("alter table public.li_v2_candidate_audit enable row level security");
 });
 it("uses private-schema-safe Admin RPC and superadmin-only controls",()=>{
  expect(api).toContain('requireAdminRole(["superadmin","admin"])');
  expect(api).toContain('requireAdminRole(["superadmin"])');
  expect(api).toContain("admin_li_v2_acquisition_snapshot");
  expect(api).toContain("admin_li_v2_recover_paid_task");
  expect(admin).toContain("<AcquisitionCampaignPanel />");
 });
});
