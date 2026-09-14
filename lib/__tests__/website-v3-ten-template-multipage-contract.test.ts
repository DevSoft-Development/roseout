import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const catalog=source("lib/websites/v3/catalog.ts");
const render=source("lib/websites/v3/render.ts");
const artifact=source("lib/websites/v3/artifact.ts");
const preview=source("components/websites/WebsiteV3Preview.tsx");
const nocturne=source("lib/websites/v3/nocturne.ts");
const atelier=source("lib/websites/v3/atelier.ts");
const vista=source("lib/websites/v3/vista.ts");

describe("Website V3 multipage system",()=>{
  it("preserves the original ten designs while the catalog expands",()=>{
    for(const id of ["nocturne","atelier","vista","social_house","quiet_luxury","maison","pulse","botanica","grandstand","gallery_house"]){
      expect(catalog).toContain(`id:\"${id}\"`);
      expect(render).toContain(id);
    }
    expect((catalog.match(/status:\"preview_ready\"/g)||[]).length).toBeGreaterThanOrEqual(20);
  });

  it("builds a real five-page preview artifact",()=>{
    for(const page of ["index.html","menu.html","gallery.html","events.html","visit.html"]) expect(artifact).toContain(page);
    expect(preview).toContain("artifact.pages.map");
    expect(preview).toContain("Five-page preview");
  });

  it("keeps the new templates independent from the legacy presentation stack",()=>{
    for(const file of ["maison.ts","pulse.ts","botanica.ts","grandstand.ts","gallery-house.ts"]){
      const value=source(`lib/websites/v3/${file}`);
      expect(value).not.toContain("static-renderer");
      expect(value).not.toContain("premium-theme-artifact");
      expect(value).not.toContain("agency-template-system");
    }
  });

  it("uses consistent gallery image ratios in Nocturne Atelier and Vista",()=>{
    expect(nocturne).toContain("aspect-ratio:4/3");
    expect(nocturne).not.toContain("grid-row:");
    expect(atelier).toContain(".spread figure{margin:0;aspect-ratio:4/3");
    expect(atelier).not.toContain("margin-top:190px");
    expect(vista).toContain(".panorama figure{margin:0;aspect-ratio:4/3");
    expect(vista).not.toContain("margin-top:140px");
  });
});
