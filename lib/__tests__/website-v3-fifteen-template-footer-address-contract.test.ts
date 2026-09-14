import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const catalog=source("lib/websites/v3/catalog.ts");
const render=source("lib/websites/v3/render.ts");
const artifact=source("lib/websites/v3/artifact.ts");

const latestTemplates=[
  ["daylight","renderDaylightV3Preview","lib/websites/v3/daylight.ts"],
  ["foundry","renderFoundryV3Preview","lib/websites/v3/foundry.ts"],
  ["supper_club","renderSupperClubV3Preview","lib/websites/v3/supper-club.ts"],
  ["sanctuary","renderSanctuaryV3Preview","lib/websites/v3/sanctuary.ts"],
  ["electric_garden","renderElectricGardenV3Preview","lib/websites/v3/electric-garden.ts"],
] as const;

describe("Website V3 twenty-design footer address contract",()=>{
  it("expands the catalog to twenty preview-ready designs",()=>{
    expect((catalog.match(/status:\"preview_ready\"/g)||[]).length).toBe(20);
  });

  it("wires each latest design independently",()=>{
    for(const [id,fn,file] of latestTemplates){
      const body=source(file);
      expect(body).toContain(fn);
      expect(render).toContain(`case\"${id}\"`);
      expect(render).toContain(fn);
      expect(body).not.toContain("static-renderer");
      expect(body).not.toContain("agency-template-system");
    }
  });

  it("keeps the address a V3 footer concern",()=>{
    expect(artifact).toContain("footerContent(name,address)");
    expect(artifact).toContain("normalizeHomeAddress(homeHtml,address,name)");
    expect(artifact).toContain('next.split(safe).join("")');
    expect(artifact).not.toContain("<span>Address</span><h3>${esc(location.address");
  });
});
