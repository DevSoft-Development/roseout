import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const catalog=source("lib/websites/v3/catalog.ts");
const render=source("lib/websites/v3/render.ts");
const artifact=source("lib/websites/v3/artifact.ts");
const selector=source("components/websites/WebsiteEngineSelector.tsx");

const newTemplates=[
  ["riviera","renderRivieraV3Preview","lib/websites/v3/riviera.ts"],
  ["ember","renderEmberV3Preview","lib/websites/v3/ember.ts"],
  ["velvet_room","renderVelvetRoomV3Preview","lib/websites/v3/velvet-room.ts"],
  ["market_hall","renderMarketHallV3Preview","lib/websites/v3/market-hall.ts"],
  ["skyline","renderSkylineV3Preview","lib/websites/v3/skyline.ts"],
] as const;

describe("Website V3 fifteen-template footer address contract",()=>{
  it("expands the catalog to fifteen preview-ready templates",()=>{
    expect((catalog.match(/status:\"preview_ready\"/g)||[]).length).toBe(15);
    expect(selector).toContain("Fifteen independent premium templates");
    expect(selector).toContain("All fifteen templates");
  });

  it("wires each new template independently",()=>{
    for(const [id,fn,file] of newTemplates){
      const body=source(file);
      expect(body).toContain(fn);
      expect(render).toContain(`case \"${id}\"`);
      expect(render).toContain(fn);
      expect(body).not.toContain("static-renderer");
      expect(body).not.toContain("agency-template-system");
    }
  });

  it("makes the address a V3 footer concern",()=>{
    expect(artifact).toContain("footerContent(name,address)");
    expect(artifact).toContain("normalizeHomeAddress(homeHtml,address,name)");
    expect(artifact).toContain('next.split(safe).join("")');
    expect(artifact).not.toContain("<span>Address</span><h3>${esc(location.address");
  });
});
