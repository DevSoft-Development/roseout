import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("historical first import audit",()=>{
 const source=readFileSync("lib/location-intelligence/v2/readonly-first-import-audit.ts","utf8");
 it("is read-only and uses the actual one-touch acceptance gate",()=>{
  expect(source).toContain("assessOneTouchImport(row)");
  expect(source).toContain('.eq("source","li_v2_independent")');
  expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|createDataForSeoReviewTask|\.rpc\(/);
 });
 it("never treats prior publication as current complete import evidence",()=>{
  expect(source).toContain('historicalPublicationWithoutCurrentEvidence');
  expect(source).toContain('!acceptance.oneTouchComplete');
 });
});
