import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const catalog=source("lib/websites/v3/catalog.ts");
const selector=source("components/websites/WebsiteEngineSelector.tsx");
const page=source("app/locations/dashboard/website/page.tsx");
const render=source("lib/websites/v3/render.ts");
const palettes=source("lib/websites/v3/palettes.ts");
const recommendation=source("lib/websites/v3/recommendation.ts");

describe("Website V3 recommendation and palette flow",()=>{
  it("keeps twenty designs internal while removing the customer-facing template grid",()=>{
    expect((catalog.match(/status:\"preview_ready\"/g)||[]).length).toBe(20);
    expect(selector).not.toContain("WEBSITE_V3_CONCEPTS.map");
    expect(selector).toContain("Try another direction");
    expect(selector).toContain("We picked a design for your business");
  });

  it("recommends a design from live business signals",()=>{
    expect(page).toContain("recommendWebsiteV3Concept(liveContent, locationRecord)");
    expect(recommendation).toContain("spa");
    expect(recommendation).toContain("rooftop");
    expect(recommendation).toContain("brewery");
    expect(recommendation).toContain("electric_garden");
  });

  it("offers curated color palettes without changing the selected design",()=>{
    for(const id of ["original","midnight","champagne","emerald","burgundy","ivory"]) expect(palettes).toContain(`id:\"${id}\"`);
    expect(selector).toContain("Color style");
    expect(selector).toContain("v3_palette");
    expect(render).toContain("recolorV3Html");
    expect(render).toContain("paletteForConcept");
  });

  it("adds five new independent renderer directions",()=>{
    for(const [id,file] of [["daylight","daylight.ts"],["foundry","foundry.ts"],["supper_club","supper-club.ts"],["sanctuary","sanctuary.ts"],["electric_garden","electric-garden.ts"]] as const){
      expect(catalog).toContain(`id:\"${id}\"`);
      const body=source(`lib/websites/v3/${file}`);
      expect(body).not.toContain("static-renderer");
      expect(body).not.toContain("agency-template-system");
      expect(render).toContain(id);
    }
  });
});
