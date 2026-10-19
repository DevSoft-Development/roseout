import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/location-intelligence/v2/independent-batch-finalizer.ts","utf8");
describe("LI V2 one-touch prepublication intelligence",()=>{
 it("checks menu intelligence before publishing and saves durable evidence",()=>{
  const checkpoint=source.indexOf("li_v2_prepublication_menu");
  const publish=source.indexOf("const published=await publishReadyStagedLocations");
  expect(checkpoint).toBeGreaterThan(0);
  expect(checkpoint).toBeLessThan(publish);
  expect(source).toContain('status:errorMessage?"error":menu?.status||"unavailable"');
  expect(source).toContain("initialMenus.set(website,menu)");
 });
 it("does not implicitly purchase initial review tasks",()=>{
  expect(source).toContain("awaiting_authorized_initial_100");
  expect(source).toContain("routinePaidRefresh:false");
 });
});
