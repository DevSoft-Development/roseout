import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");

describe("LI V2 bounded first-paid-target bootstrap",()=>{
 it("does not assert that the two established certification flags passed",()=>{
  expect(worker).toContain('LI_V2_CERTIFIED_SEARCHABLE_IMPORT_ENABLED==="true"');
  expect(worker).toContain('LI_V2_INDEPENDENT_PROFILE_SOURCE_CERTIFIED==="true"');
  expect(worker).toContain('LI_V2_ONE_TARGET_BOOTSTRAP_ENABLED==="true" && !certified');
  expect(worker).toContain('if(!certified&&!bootstrap)');
 });
 it("never advances a bootstrap beyond its initial coverage target",()=>{
  const loop=worker.indexOf('for(const [index,target]');
  const stop=worker.indexOf('if(bootstrap && index>0)',loop);
  const paid=worker.indexOf('const queue=await advanceMapsQueue',loop);
  expect(loop).toBeGreaterThan(0);
  expect(stop).toBeGreaterThan(loop);
  expect(stop).toBeLessThan(paid);
  expect(worker).toContain('stopped:"bootstrap_one_target_limit"');
 });
 it("retains existing operator, paid-task, publish and retrieval guards",()=>{
  expect(worker).toContain('rpc("li_v2_campaign_run_permitted"');
  expect(worker).toContain('await submitApprovedMapsQueue');
  expect(worker).toContain('await registerConsumerChecks');
  expect(worker).toContain('all_consumer_retrieval_checks_quarantined');
  expect(worker).toContain('maps_standard_submission_uncertain_manual_reconciliation');
 });
});
