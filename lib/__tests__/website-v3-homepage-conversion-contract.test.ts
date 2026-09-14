import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const catalog=source("lib/websites/v3/catalog.ts");
const render=source("lib/websites/v3/render.ts");
const conversion=source("lib/websites/v3/home-conversion.ts");

describe("Website V3 homepage conversion layer",()=>{
  it("covers all fifteen V3 concepts",()=>{
    const ids=["nocturne","atelier","vista","social_house","quiet_luxury","maison","pulse","botanica","grandstand","gallery_house","riviera","ember","velvet_room","market_hall","skyline"];
    for(const id of ids){
      expect(catalog).toContain(`id:\"${id}\"`);
      expect(conversion).toContain(`${id}:`);
    }
  });

  it("enhances every selected Home page before artifact assembly",()=>{
    expect(render).toContain("enhanceV3HomeHtml(concept,rawHome(concept,website,location),location)");
    expect(render).toContain("homeHtml:home(concept,website,location)");
  });

  it("keeps the Home menu intentionally short and links to the full Menu page",()=>{
    expect(conversion).toContain("slice(0,3)");
    expect(conversion).toContain('href=\"menu.html\"');
    expect(conversion).toContain("See the full menu");
  });

  it("adds compact reservation controls to every Home page",()=>{
    expect(conversion).toContain('type=\"date\"');
    expect(conversion).toContain('aria-label=\"Reservation time\"');
    expect(conversion).toContain('aria-label=\"Party size\"');
    expect(conversion).toContain("Find a table");
  });

  it("uses conversion content beyond menu and reservations",()=>{
    expect(conversion).toContain("location.best_for");
    expect(conversion).toContain("location.special_features");
    expect(conversion).toContain("location.reviews[0]");
    expect(conversion).toContain("location.events[0]||location.experiences[0]");
    expect(conversion).toContain("Happening here");
  });
});
