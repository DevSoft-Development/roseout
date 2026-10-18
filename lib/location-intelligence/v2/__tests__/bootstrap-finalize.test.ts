import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const worker=readFileSync("lib/location-intelligence/v2/campaign-worker.ts","utf8");
describe("LI V2 bootstrap finalized after first reviewed paid target",()=>{
 it("completes recovered one-target runs without touching another target",()=>{
  const guard=worker.slice(worker.indexOf("if(bootstrap && index>0)"));
  const body=guard.slice(0,guard.indexOf('const {data:permitted'));
  expect(body).toContain("await reconcilePublished(run.id)");
  expect(body).toContain('await checkpoint(run.id,0,"completed")');
  expect(body).toContain('stopped:"bootstrap_one_target_limit"');
  expect(body).not.toContain("submitApprovedMapsQueue");
  expect(body).not.toContain("discoverUnseenGooglePlaceIds");
 });
});
