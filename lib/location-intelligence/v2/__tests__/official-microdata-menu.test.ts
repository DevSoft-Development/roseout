import { describe, expect, it } from "vitest";
import { extractOfficialMicrodataMenuFacts, extractOfficialJsonLdMenuFacts } from "../crawl-menu-facts";

describe("verified official HTML menu evidence", () => {
 const source = "https://restaurant.example/menu";
 it("extracts explicit Schema.org MenuItem microdata without inventing prices", () => {
   const html = '<section itemscope itemtype="https://schema.org/MenuItem"><span itemprop="name">Roasted Cauliflower</span></section>';
   expect(extractOfficialMicrodataMenuFacts(html, source)).toEqual([{
     name:"Roasted Cauliflower", price:null, currency:null, category:null,
     sourceUrl:source, sourceType:"official_microdata"
   }]);
 });
 it("rejects ordinary headings and price labels without explicit MenuItem markup", () => {
   expect(extractOfficialMicrodataMenuFacts('<h3>Roasted Cauliflower</h3><p>$14</p>',source)).toEqual([]);
 });
 it("does not mislabel JSON-LD facts as microdata", () => {
   const html = '<script type="application/ld+json">{"@type":"MenuItem","name":"Mushroom Soup"}</script>';
   expect(extractOfficialMicrodataMenuFacts(html,source)).toEqual([]);
   expect(extractOfficialJsonLdMenuFacts(html,source)[0].sourceType).toBe("official_jsonld");
 });
});
