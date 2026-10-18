import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261018225000_li_v2_stale_reviewed_reclaim.sql","utf8");
describe("LI V2 conservative stale reviewed campaign reclaim",()=>{
 it("releases stale runs only if every paid target is reviewed and checkpointed",()=>{
  expect(sql).toContain("r.updated_at < now()-interval '30 minutes'");
  expect(sql).toContain("q.status='reviewed'");
  expect(sql).toContain("q.target_index=r.processed-1");
  expect(sql).toContain("q.status <> 'reviewed' or q.target_index >= r.processed");
  expect(sql).toContain("r.processed>0");
 });
 it("preserves audit, historical failure totals and avoids a second paid submission",()=>{
  expect(sql).toContain("li_v2_stale_reviewed_reclaim_audit");
  expect(sql).toContain("prior_failed");
  expect(sql).toContain("unique(run_id,prior_processed)");
  expect(sql).toContain("published=greatest(r.published");
  expect(sql).not.toContain("failed=0");
  expect(sql).not.toContain("submitApprovedMapsQueue");
 });
 it("preserves conservative quarantine for ambiguous provider outcomes",()=>{
  expect(sql).toContain("worker_lease_expired_manual_reconciliation_required");
  expect(sql).toContain("r.status='running'");
  expect(sql).toContain("auth.role() is distinct from 'service_role'");
 });
});
