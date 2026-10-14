import { describe, expect, it } from "vitest";
import { extractOfficialJsonLdMenuFacts } from "./crawl-menu-facts";
describe("official JSON-LD food and drink evidence", () => {
 it("extracts actual menu items and explicit prices",()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({"@type":"Menu","hasMenuSection":[{"@type":"MenuSection","hasMenuItem":[{"@type":"MenuItem","name":"Espresso Martini","offers":{"@type":"Offer","price":"18.00","priceCurrency":"USD"}},{"@type":"MenuItem","name":"Rigatoni"}]}]})+'</script>';
  const facts=extractOfficialJsonLdMenuFacts(html,"https://example.com/drinks");
  expect(facts).toHaveLength(2);
  expect(facts[0]).toMatchObject({name:"Espresso Martini",price:18,currency:"USD",sourceType:"official_jsonld"});
  expect(facts[1].price).toBeNull();
 });
 it("does not invent facts from ordinary prose",()=>{
  expect(extractOfficialJsonLdMenuFacts("<p>Great cocktails</p>","https://example.com")).toEqual([]);
 });
 it("ignores invalid price representations",()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({"@type":"MenuItem","name":"Seasonal","offers":{"price":"market price"}})+'</script>';
  expect(extractOfficialJsonLdMenuFacts(html,"https://example.com")[0].price).toBeNull();
 });
});