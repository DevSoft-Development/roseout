import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file:string){return fs.readFileSync(path.join(process.cwd(),file),"utf8")}

const files={
  nocturne:source("lib/websites/v3/nocturne.ts"),
  atelier:source("lib/websites/v3/atelier.ts"),
  vista:source("lib/websites/v3/vista.ts"),
  social:source("lib/websites/v3/social-house.ts"),
  quiet:source("lib/websites/v3/quiet-luxury.ts"),
};
const catalog=source("lib/websites/v3/catalog.ts");
const dispatcher=source("lib/websites/v3/render.ts");
const page=source("app/locations/dashboard/website/page.tsx");

describe("Website V3 flagship renderer contracts",()=>{
  it("keeps five independent renderer modules",()=>{
    expect(files.nocturne).toContain("renderNocturneV3Preview");
    expect(files.atelier).toContain("renderAtelierV3Preview");
    expect(files.vista).toContain("renderVistaV3Preview");
    expect(files.social).toContain("renderSocialHouseV3Preview");
    expect(files.quiet).toContain("renderQuietLuxuryV3Preview");
    for(const file of Object.values(files)){
      expect(file).not.toContain("static-renderer");
      expect(file).not.toContain("premium-theme-artifact");
      expect(file).not.toContain("agency-template-system");
    }
  });

  it("has structurally different concept signatures",()=>{
    expect(files.nocturne).toContain("gallery-wrap");
    expect(files.atelier).toContain("manifesto");
    expect(files.vista).toContain("panorama");
    expect(files.social).toContain("collage");
    expect(files.quiet).toContain("portrait");
  });

  it("marks every flagship concept preview ready",()=>{
    expect((catalog.match(/status: \"preview_ready\"/g)||[]).length).toBe(5);
    expect(catalog).not.toContain('status: "building"');
  });

  it("dispatches every concept and previews the selected renderer",()=>{
    for(const id of ["atelier","vista","social_house","quiet_luxury","nocturne"]) expect(dispatcher).toContain(`case \"${id}\"`);
    expect(page).toContain("renderWebsiteV3Preview(v3ConceptId");
    expect(page).not.toContain('v3ConceptId === "nocturne"');
  });

  it("keeps Nocturne gallery intentionally compact",()=>{
    expect(files.nocturne).toContain("grid-auto-rows:70px");
    expect(files.nocturne).toContain("height:210px");
    expect(files.nocturne).not.toContain("height:52vh");
  });
});
