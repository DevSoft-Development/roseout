import {describe,it,expect} from "vitest";
import {extractOfficialReservationUrl} from "../official-website-resolver";
describe("initial reservation link sourcing",()=>{
 it("retains external booking destination advertised by official website",()=>{
  expect(extractOfficialReservationUrl('<a href="https://www.opentable.com/r/example">Reserve a table</a>',"https://example.com"))
   .toBe("https://www.opentable.com/r/example");
 });
 it("uses first-party structured ReserveAction when provided",()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({"@type":"Restaurant",potentialAction:{"@type":"ReserveAction",target:{"@type":"EntryPoint",urlTemplate:"https://book.example.com/reserve"}}})+'</script>';
  expect(extractOfficialReservationUrl(html,"https://example.com")).toBe("https://book.example.com/reserve");
 });
 it("rejects insecure and nonexistent links",()=>{
  expect(extractOfficialReservationUrl('<a href="http://example.com">Reserve</a>',"https://example.com")).toBe(null);
  expect(extractOfficialReservationUrl('<a href="/menu">Menu</a>',"https://example.com")).toBe(null);
 });
});
